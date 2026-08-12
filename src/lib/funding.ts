// 러닝 크라우드펀딩 — 여럿이 만보를 모아 상품을 공동구매한다.
// 개설/참여/확정/취소의 모든 만보 이동은 Cloud Function 트랜잭션으로만 처리한다
// (클라이언트 직접 쓰기 금지 — 규칙 fundings write=false).
// 컬렉션:
//   classes/{cid}/fundings/{fid} : {
//     itemId, title, imageUrl, goal, raised, creatorUid, creatorName,
//     status: "open"|"reached"|"completed"|"cancelled",
//     contribs: { [uid]: { name, amount } }, createdAt, updatedAt,
//     completedAt?, cancelledAt?
//   }
import { collection, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { getDbClient, getFunctionsClient } from "@/lib/firebase";

export type FundingStatus = "open" | "reached" | "completed" | "cancelled";
export type FundingContrib = { uid: string; name: string; amount: number };
export type Funding = {
  id: string;
  itemId: string;
  title: string;
  imageUrl: string;
  goal: number;
  raised: number;
  creatorUid: string;
  creatorName: string;
  status: FundingStatus;
  contribs: FundingContrib[]; // map flattened to array, sorted by amount desc
  createdAt: number | null;
  updatedAt: number | null;
};

const fundingsCol = (cid: string) =>
  collection(getDbClient(), "classes", cid, "fundings");

function mapFunding(id: string, v: Record<string, unknown>): Funding {
  const createdTs = v.createdAt as { toMillis?: () => number } | undefined;
  const updatedTs = v.updatedAt as { toMillis?: () => number } | undefined;
  const raw =
    (v.contribs as Record<string, { name?: unknown; amount?: unknown }>) ?? {};
  const contribs: FundingContrib[] = Object.entries(raw)
    .map(([uid, c]) => ({
      uid,
      name: (c?.name as string) ?? "",
      amount: (c?.amount as number) ?? 0,
    }))
    .sort((a, b) => b.amount - a.amount);
  return {
    id,
    itemId: (v.itemId as string) ?? "",
    title: (v.title as string) ?? "",
    imageUrl: (v.imageUrl as string) ?? "",
    goal: (v.goal as number) ?? 0,
    raised: (v.raised as number) ?? 0,
    creatorUid: (v.creatorUid as string) ?? "",
    creatorName: (v.creatorName as string) ?? "",
    status: (v.status as FundingStatus) ?? "open",
    contribs,
    createdAt: createdTs?.toMillis ? createdTs.toMillis() : null,
    updatedAt: updatedTs?.toMillis ? updatedTs.toMillis() : null,
  };
}

// ---------- 실시간 목록(멤버 읽기) ----------
export function watchFundings(
  cid: string,
  cb: (list: Funding[]) => void
): () => void {
  return onSnapshot(
    fundingsCol(cid),
    (snap) => {
      const list = snap.docs.map((d) => mapFunding(d.id, d.data()));
      list.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
      cb(list);
    },
    () => cb([])
  );
}

// ---------- 개설/참여/확정/취소 — Cloud Function 트랜잭션 ----------
export async function createFunding(
  cid: string,
  itemId: string
): Promise<{ fid: string }> {
  try {
    const fn = httpsCallable<
      { cid: string; itemId: string },
      { ok: true; fid: string }
    >(getFunctionsClient(), "createFunding");
    const res = await fn({ cid, itemId });
    return { fid: res.data.fid };
  } catch (err) {
    const msg = (err as { message?: string })?.message;
    throw new Error(msg || "펀딩을 열지 못했습니다.");
  }
}

export async function contributeFunding(
  cid: string,
  fid: string,
  amount: number
): Promise<{ raised: number; status: FundingStatus }> {
  try {
    const fn = httpsCallable<
      { cid: string; fid: string; amount: number },
      { ok: true; raised: number; status: FundingStatus }
    >(getFunctionsClient(), "contributeFunding");
    const res = await fn({ cid, fid, amount });
    return { raised: res.data.raised, status: res.data.status };
  } catch (err) {
    const msg = (err as { message?: string })?.message;
    throw new Error(msg || "펀딩 참여에 실패했습니다.");
  }
}

export async function completeFunding(cid: string, fid: string): Promise<void> {
  try {
    const fn = httpsCallable<{ cid: string; fid: string }, { ok: true }>(
      getFunctionsClient(),
      "completeFunding"
    );
    await fn({ cid, fid });
  } catch (err) {
    const msg = (err as { message?: string })?.message;
    throw new Error(msg || "구매 확정에 실패했습니다.");
  }
}

export async function cancelFunding(cid: string, fid: string): Promise<void> {
  try {
    const fn = httpsCallable<{ cid: string; fid: string }, { ok: true }>(
      getFunctionsClient(),
      "cancelFunding"
    );
    await fn({ cid, fid });
  } catch (err) {
    const msg = (err as { message?: string })?.message;
    throw new Error(msg || "펀딩 취소에 실패했습니다.");
  }
}
