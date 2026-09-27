import type { Game } from "@/lib/games";
import { puyoUrl } from "@/lib/puyo";
export function PuyoHistory({ cid, game }: { cid: string; game: Game }) {
  const p = game.puyo;
  const name = (uid: string) => p?.players?.find(x => x.uid === uid)?.name ?? "학생";
  return <section className="flex flex-col gap-4">
    <h3 className="text-xl font-extrabold">뿌요뿌요 경기 결과</h3>
    <p className="text-sm">제한 {(p?.durationSec ?? 180) / 60}분 · {p?.players?.length ?? 0}명 참여</p>
    {p?.matches?.map(m => <div key={m.id} className="rounded-2xl border border-violet-200 bg-violet-50 p-4 text-violet-950">
      <strong>{name(m.a)} vs {name(m.b)}</strong>
      <p className="mt-2">{m.result ? `${m.result.scores[m.a].toLocaleString()} : ${m.result.scores[m.b].toLocaleString()} · ${m.result.winner ? `${name(m.result.winner)} 승리` : "무승부"}` : "진행 중"}</p>
    </div>)}
    <a href={puyoUrl(cid, game.id)} className="self-start rounded-full bg-violet-600 px-5 py-2 font-bold text-white">경기 화면 보기</a>
  </section>;
}
