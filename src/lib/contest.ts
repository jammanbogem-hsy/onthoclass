// 주식대회 — 교사가 메인 화면에서 이름을 붙여 개설하고, 참가 학급 학생들의
// "개설 이후 성과"로 등수를 매긴다.
//
// 왜 개설 시점 기준인가: 누적 총손익으로 겨루면 대회 전에 벌어둔 학생이 그대로 1등이라
// 대회가 되지 않는다. 서버가 개설 순간의 계좌(현금·평가액·원가·실현손익)를 baseline 에
// 박아두고 (지금 총손익 − 시작 총손익)만 겨룬다.
//
// 등수 기준 2가지:
//   pct    — 대회 손익 ÷ 대회 시작 총자산(현금+주식). 가진 만보가 달라도 공평하다.
//   amount — 대회 손익(만보) 그대로.
//
// 컬렉션 stockContests/{id} 는 규칙에서 클라이언트 접근을 전면 금지했다. 학생은 남의
// positions 를 읽을 수 없어 순위 집계가 서버에서만 가능하고, baseline 스냅샷도 조작되면
// 안 되기 때문. 아래 callable 만이 유일한 통로다.
import { httpsCallable } from "firebase/functions";
import { getFunctionsClient } from "@/lib/firebase";

/** 등수 기준 */
export type ContestMetric = "pct" | "amount";

export const CONTEST_METRICS: readonly {
  key: ContestMetric;
  label: string;
  desc: string;
}[] = [
  {
    key: "pct",
    label: "비율 (수익률 %)",
    desc: "대회를 시작할 때 가진 재산 대비 얼마나 불렸는지로 겨뤄요. 만보를 적게 가진 학생도 공평해요.",
  },
  {
    key: "amount",
    label: "금액 (만보)",
    desc: "번 만보 금액 그대로 겨뤄요. 크게 투자한 학생이 유리해요.",
  },
] as const;

export type ContestMeta = {
  id: string;
  name: string;
  /** 교사가 붙인 설명(선택) — 대회 취지·규칙 안내. 없으면 빈 문자열. */
  desc: string;
  cids: string[];
  classNames: string[];
  metric: ContestMetric;
  status: "running" | "done";
  /** 참가 학생 수 */
  participants: number;
  createdAt: number | null;
  finishedAt: number | null;
  /** 개설한 교사 본인인가 — 종료/삭제 버튼 노출 판단 */
  isOwner: boolean;
};

export type ContestStanding = {
  uid: string;
  name: string;
  cid: string;
  className: string;
  /** 대회 손익 = (지금 실현+평가) − (시작 실현+평가) */
  pnl: number;
  /** 대회 수익률(%) = pnl ÷ 시작 총자산 */
  pct: number;
  /** 대회 시작 시점 총자산(현금+주식) */
  startAssets: number;
  /** 지금 총자산(현금+주식) */
  nowAssets: number;
  /** 대회 기간 중 팔아서 확정한 손익 */
  realizedInContest: number;
  /** 대회 기간 중 매매 횟수 */
  tradeCount: number;
};

const call = <Req, Res>(name: string) =>
  httpsCallable<Req, Res>(getFunctionsClient(), name);

/** 개설(교사) — 선택한 모든 학급의 교사여야 한다. desc 는 선택(최대 300자). */
export async function createStockContest(
  name: string,
  desc: string,
  cids: string[],
  metric: ContestMetric
): Promise<string> {
  const res = await call<
    { name: string; desc: string; cids: string[]; metric: ContestMetric },
    { ok: true; id: string }
  >("createStockContest")({ name, desc, cids, metric });
  return res.data.id;
}

/** 목록 — cid 를 주면 그 학급이 참가 중인 대회(학생도 조회), 안 주면 내가 개설한 대회. */
export async function listStockContests(cid?: string): Promise<ContestMeta[]> {
  const res = await call<{ cid?: string }, { ok: true; contests: ContestMeta[] }>(
    "listStockContests"
  )(cid ? { cid } : {});
  return res.data.contests ?? [];
}

/** 순위 — 진행 중이면 지금 시세로 계산, 종료됐으면 확정 저장된 결과. */
export async function getStockContestStandings(
  contestId: string
): Promise<{ contest: ContestMeta; rows: ContestStanding[] }> {
  const res = await call<
    { contestId: string },
    { ok: true; contest: ContestMeta; rows: ContestStanding[] }
  >("getStockContestStandings")({ contestId });
  return { contest: res.data.contest, rows: res.data.rows ?? [] };
}

/** 종료(개설자) — 그 시점 순위를 확정 저장한다. 이후 시세가 변해도 결과는 그대로. */
export async function finishStockContest(
  contestId: string
): Promise<ContestStanding[]> {
  const res = await call<{ contestId: string }, { ok: true; rows: ContestStanding[] }>(
    "finishStockContest"
  )({ contestId });
  return res.data.rows ?? [];
}

/** 삭제(개설자) */
export async function deleteStockContest(contestId: string): Promise<void> {
  await call<{ contestId: string }, { ok: true }>("deleteStockContest")({ contestId });
}

/** 등수 기준에 따른 정렬값 — 동점은 손익 금액으로 가른다. */
export function contestRank(
  rows: ContestStanding[],
  metric: ContestMetric
): ContestStanding[] {
  return [...rows].sort((a, b) =>
    metric === "pct" ? b.pct - a.pct || b.pnl - a.pnl : b.pnl - a.pnl || b.pct - a.pct
  );
}

/** 순위표에 큰 글씨로 찍을 값 */
export function contestValueText(
  row: ContestStanding,
  metric: ContestMetric
): string {
  return metric === "pct"
    ? `${row.pct > 0 ? "+" : ""}${row.pct.toFixed(1)}%`
    : `${row.pnl > 0 ? "+" : ""}${Math.round(row.pnl).toLocaleString()} 만보`;
}
