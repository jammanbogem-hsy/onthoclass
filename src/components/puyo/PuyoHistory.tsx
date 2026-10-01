import type { Game } from "@/lib/games";
import { puyoUrl } from "@/lib/puyo";
import { normalizeRules, ruleSummary } from "@/lib/puyo-rules";

const REASON = { topout: "보드가 가득 참", time: "시간 종료 · 점수", disconnect: "접속 끊김", teacher: "선생님 종료 · 점수" };

export function PuyoHistory({ cid, game }: { cid: string; game: Game }) {
  const p = game.puyo;
  const rules = normalizeRules(p);
  const name = (uid: string) => p?.players?.find(x => x.uid === uid)?.name ?? "학생";
  return <section className="flex flex-col gap-4">
    <h3 className="text-xl font-extrabold">뿌요뿌요 경기 결과{(p?.round ?? 1) > 1 && <span className="ml-2 text-base font-bold text-[var(--md-sys-color-on-surface-variant)]">{p?.round}번째 판</span>}</h3>
    <dl className="flex flex-wrap gap-2 text-sm">
      {ruleSummary(rules).map(r => <div key={r.label} className="rounded-full bg-[var(--md-sys-color-surface-container-high)] px-3 py-1"><dt className="inline text-[var(--md-sys-color-on-surface-variant)]">{r.label} </dt><dd className="inline font-bold">{r.value}</dd></div>)}
      <div className="rounded-full bg-[var(--md-sys-color-surface-container-high)] px-3 py-1"><dt className="inline text-[var(--md-sys-color-on-surface-variant)]">참여 </dt><dd className="inline font-bold">{p?.players?.length ?? 0}명</dd></div>
    </dl>
    {p?.matches?.map(m => <div key={m.id} className="rounded-2xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)] p-4 text-[var(--md-sys-color-on-surface)]">
      <strong>{name(m.a)} vs {name(m.b)}</strong>
      <p className="mt-2">{m.result ? `${(m.result.scores[m.a] ?? 0).toLocaleString()} : ${(m.result.scores[m.b] ?? 0).toLocaleString()} · ${m.result.winner ? `${name(m.result.winner)} 승리` : "무승부"} · ${REASON[m.result.reason]}` : "진행 중"}</p>
      {m.result?.reward && <p className="mt-1 text-sm font-bold text-[var(--md-sys-color-tertiary)]">승리 보상 +{m.result.reward.xp} XP 지급 완료</p>}
    </div>)}
    {!!p?.resting?.length && <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">이번 판 쉰 친구: {p.resting.map(r => r.name).join(", ")}</p>}
    <a href={puyoUrl(cid, game.id)} className="self-start rounded-full bg-[var(--md-sys-color-primary)] px-5 py-2 font-bold text-[var(--md-sys-color-on-primary)]">경기 화면 보기</a>
  </section>;
}
