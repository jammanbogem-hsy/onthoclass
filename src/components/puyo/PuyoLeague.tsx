"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { getMemberProfile } from "@/lib/classes";
import { getPuyoRuns, listLeagueGames, matchIds, type PuyoConfig } from "@/lib/puyo";
import { normalizeRules } from "@/lib/puyo-rules";
import { leagueStandings, quizReport, type AnswerLog, type LeagueGame } from "@/lib/puyo-league";
import { Icon } from "@/components/Icon";
import { btnOutline, btnPrimary, card, Friend, Header, message, Notice, Shell } from "./PuyoUi";

export type LeagueGameDoc = { id: string; status: string; puyo: PuyoConfig };

export const leagueUrl = (cid: string, leagueId: string) => `/puyo/?class=${encodeURIComponent(cid)}&league=${encodeURIComponent(leagueId)}`;

/** 리그 계산용 모양으로 — 결과가 난 판(모둠)만 점수에 들어간다. */
export function toLeagueGames(docs: LeagueGameDoc[]): LeagueGame[] {
  return docs.map(g => ({
    id: g.id, round: g.puyo.league?.round ?? 1, size: normalizeRules(g.puyo).size,
    matches: (g.puyo.matches ?? []).map(m => ({ ids: matchIds(m), result: m.result ? { scores: m.result.scores } : null })),
  }));
}

/** 같은 리그의 판들을 불러온다. refreshKey(이번 판 상태 등)가 바뀌면 다시 읽는다. */
export function useLeagueGames(cid: string, leagueId: string | undefined, refreshKey: string) {
  const [games, setGames] = useState<LeagueGameDoc[] | null>(null);
  useEffect(() => {
    if (!leagueId) return;
    let active = true;
    listLeagueGames(cid, leagueId).then(g => { if (active) setGames(g); }).catch(() => { if (active) setGames([]); });
    return () => { active = false; };
  }, [cid, leagueId, refreshKey]);
  return leagueId ? games : null;
}

function namesOf(games: LeagueGameDoc[]) {
  const names = new Map<string, string>(); const teachers = new Set<string>();
  for (const g of games) for (const p of g.puyo.players ?? []) { names.set(p.uid, p.name); if (p.teacher) teachers.add(p.uid); }
  return { name: (uid: string) => names.get(uid) ?? "학생", teachers: [...teachers] };
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/** 리그 순위표 — 대기실·판 결과·대시보드에서 같이 쓴다. compact 면 상위 몇 명만. */
export function LeagueTable({ games, uid, limit }: { games: LeagueGameDoc[]; uid?: string; limit?: number }) {
  const { name, teachers } = namesOf(games);
  const rows = leagueStandings(toLeagueGames(games), teachers);
  const total = games[0]?.puyo.league?.total ?? 0;
  const rounds = Array.from({ length: total }, (_, i) => i + 1);
  const shown = limit ? rows.slice(0, limit) : rows;
  if (!rows.length) return <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">첫 판이 끝나면 리그 순위가 나와요.</p>;
  return <div className="overflow-x-auto">
    <table className="w-full min-w-[420px] border-separate border-spacing-y-1 text-sm">
      <thead><tr className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
        <th className="w-10 text-center font-semibold">순위</th><th className="text-left font-semibold">이름</th>
        {!limit && rounds.map(r => <th key={r} className="w-12 text-center font-semibold">{r}판</th>)}
        <th className="w-14 text-center font-semibold">1등</th><th className="w-16 text-right font-semibold">리그 점수</th>
      </tr></thead>
      <tbody>{shown.map(r => <tr key={r.uid} className={r.uid === uid ? "bg-[var(--md-sys-color-primary-container)]" : "bg-[var(--md-sys-color-surface-container)]"}>
        <td className="rounded-l-xl py-1.5 text-center font-black">{r.rank}</td>
        <td className="truncate py-1.5 font-semibold">{name(r.uid)}{r.uid === uid && " (나)"}</td>
        {!limit && rounds.map(k => { const b = r.byRound[k]; return <td key={k} className="text-center tabular-nums" title={b ? `${b.groupSize}명 중 ${b.place}등` : "참가 안 함"}>{b ? <span>{fmt(b.points)}<small className="ml-0.5 text-[10px] text-[var(--md-sys-color-on-surface-variant)]">{b.place}등</small></span> : <span className="text-[var(--md-sys-color-on-surface-variant)]">–</span>}</td>; })}
        <td className="text-center tabular-nums">{r.firsts}</td>
        <td className="rounded-r-xl pr-3 text-right text-base font-black tabular-nums text-[var(--md-sys-color-primary)]">{fmt(r.points)}</td>
      </tr>)}</tbody>
    </table>
    {limit && rows.length > limit && <p className="mt-1 text-xs text-[var(--md-sys-color-on-surface-variant)]">…외 {rows.length - limit}명</p>}
  </div>;
}

/**
 * 리그 결과 대시보드(블루킷·김킷 리포트처럼) — 시상대, 전체 순위(판별 점수),
 * 문제 분석(어려운 문제·자주 고른 오답), 학생별 정답률과 틀린 문제.
 * 선생님은 전부, 학생은 시상대·순위와 '내가 틀린 문제'만 본다.
 */
export function LeagueDashboard({ cid, leagueId }: { cid: string; leagueId: string }) {
  const { user, loading, configured } = useAuth();
  const [member, setMember] = useState<Awaited<ReturnType<typeof getMemberProfile>> | undefined>(undefined);
  const [games, setGames] = useState<LeagueGameDoc[] | null>(null);
  const [logs, setLogs] = useState<AnswerLog[] | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"rank" | "items" | "students">("rank");
  const teacher = member?.role === "teacher";
  const back = `/${teacher ? "class-admin" : "class"}/?id=${encodeURIComponent(cid)}`;

  useEffect(() => {
    if (!user || !configured) return;
    let active = true;
    getMemberProfile(cid, user.uid).then(v => { if (active) setMember(v); }).catch(e => { if (active) { setMember(null); setError(message(e)); } });
    return () => { active = false; };
  }, [cid, user, configured]);
  useEffect(() => {
    if (!member) return;
    let active = true;
    (async () => {
      const list = await listLeagueGames(cid, leagueId);
      if (!active) return; setGames(list);
      // 문제 분석: 문제 풀기가 있던 판의 학생 최종 상태에서 답 기록을 모은다
      const withQuiz = list.filter(g => g.puyo.quiz?.items?.length);
      const runs = await Promise.all(withQuiz.map(g => getPuyoRuns(cid, g.id).then(rs => rs.map(r => ({ uid: r.uid, items: g.puyo.quiz!.items, answers: r.state?.answers ?? [] })))));
      if (active) setLogs(runs.flat().filter(l => l.answers.length));
    })().catch(e => { if (active) { setError(message(e)); setGames(g => g ?? []); setLogs([]); } });
    return () => { active = false; };
  }, [cid, leagueId, member]);

  const view = useMemo(() => {
    if (!games) return null;
    const { name, teachers } = namesOf(games);
    const rows = leagueStandings(toLeagueGames(games), teachers);
    const report = logs ? quizReport(logs.filter(l => !teachers.includes(l.uid))) : null;
    return { name, rows, report };
  }, [games, logs]);

  const backLink = { href: back, label: "학급으로" };
  if (loading || (user && member === undefined)) return <Shell><Notice title="리그 결과를 여는 중…" /></Shell>;
  if (!configured || !user) return <Shell><Notice title="학급 계정으로 들어와 주세요" action={<Link className={btnPrimary} href="/">로그인하러 가기</Link>} /></Shell>;
  if (!member) return <Shell><Notice title="이 학급 친구만 볼 수 있어요" body={error} /></Shell>;
  if (!games || !view) return <Shell back={backLink}><Notice title="리그 기록을 모으고 있어요…" /></Shell>;
  if (!games.length) return <Shell back={backLink}><Notice title="리그를 찾을 수 없어요" body={error || "링크를 확인해 주세요."} action={<Link className={btnOutline} href={back}>학급으로 돌아가기</Link>} /></Shell>;

  const league = games[games.length - 1].puyo.league!;
  const played = games.filter(g => g.status === "done").length;
  const finished = played >= league.total;
  const podium = view.rows.filter(r => r.rank <= 3);
  const me = view.rows.find(r => r.uid === user.uid);
  const myReport = view.report?.students.find(s => s.uid === user.uid);
  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

  return <Shell back={backLink}>
    <Header title={<>{league.name}<span className="ml-2 text-base font-semibold text-[var(--md-sys-color-on-surface-variant)]">{finished ? "최종 결과" : `${played}/${league.total}판 진행`}</span></>}
      sub={finished ? "리그가 끝났어요! 모두 수고했어요." : "아직 리그가 진행 중이에요. 지금까지의 순위예요."} />
    {error && <p role="alert" className="mb-4 rounded-2xl bg-[var(--md-sys-color-error-container)] px-4 py-3 text-sm text-[var(--md-sys-color-on-error-container)]">{error}</p>}

    {/* 시상대 — 2등·1등·3등 순으로 가운데가 가장 높게 */}
    <section className={`${card} mb-5 p-5`} aria-label="시상대">
      <div className="mx-auto grid max-w-2xl grid-cols-3 items-end gap-3">
        {[1, 0, 2].map(slot => { const r = podium[slot]; const h = slot === 0 ? "h-36" : slot === 1 ? "h-28" : "h-20";
          return <div key={slot} className="flex flex-col items-center gap-1.5">
            {r ? <><Friend index={slot} size={slot === 0 ? 76 : 60} /><strong className="max-w-full truncate text-center">{view.name(r.uid)}</strong><span className="text-sm font-bold tabular-nums text-[var(--md-sys-color-primary)]">{fmt(r.points)}점</span></> : <span className="text-sm text-[var(--md-sys-color-on-surface-variant)]">–</span>}
            <div className={`flex w-full ${h} items-start justify-center rounded-t-2xl pt-2 text-2xl font-black ${slot === 0 ? "bg-[var(--md-sys-color-tertiary-container)] text-[var(--md-sys-color-on-tertiary-container)]" : "bg-[var(--md-sys-color-surface-container-highest)]"}`}>{r ? `${r.rank}등` : ""}</div>
          </div>; })}
      </div>
      {me && <p className="mt-4 text-center text-sm"><b>나는 {me.rank}등</b> · 리그 {fmt(me.points)}점 · 1등 {me.firsts}번 · {me.rounds}판 참가</p>}
    </section>

    <div className="mb-4 flex flex-wrap gap-2" role="tablist">
      {([["rank", "전체 순위", "leaderboard"], ["items", teacher ? "문제 분석" : "내가 틀린 문제", "quiz"], ...(teacher ? [["students", "학생별", "groups"]] as const : [])] as const).map(([k, label, icon]) =>
        <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-bold ${tab === k ? "bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)]" : "border border-[var(--md-sys-color-outline)]"}`}><Icon name={icon} size={18} />{label}</button>)}
    </div>

    {tab === "rank" && <section className={`${card} p-5`}><LeagueTable games={games} uid={user.uid} />
      <p className="mt-3 text-xs text-[var(--md-sys-color-on-surface-variant)]">순위: 리그 점수 → 1등 횟수 → 경기 점수 합계. 칸 위에 마우스를 올리면 몇 명 중 몇 등인지 보여요.</p></section>}

    {tab === "items" && <section className={`${card} p-5`}>
      {!view.report ? <p className="text-sm">문제 기록을 모으고 있어요…</p>
        : teacher ? (view.report.items.length === 0 ? <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">이 리그에는 문제 풀기 기록이 없어요.</p>
          : <ol className="flex flex-col gap-3">{view.report.items.map((r, i) => {
            const rate = pct(r.correct, r.asked);
            const topWrong = r.picks.map((n, k) => ({ n, k })).filter(p => p.k !== r.item.answerIndex && p.n > 0).sort((a, b) => b.n - a.n)[0];
            return <li key={i} className="rounded-2xl bg-[var(--md-sys-color-surface-container)] p-4">
              <div className="flex items-start justify-between gap-3"><strong className="text-[15px]">{r.item.prompt}</strong>
                <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-sm font-black ${rate < 50 ? "bg-[var(--md-sys-color-error-container)] text-[var(--md-sys-color-on-error-container)]" : rate < 80 ? "bg-[var(--md-sys-color-secondary-container)] text-[var(--md-sys-color-on-secondary-container)]" : "bg-[var(--md-sys-color-tertiary-container)] text-[var(--md-sys-color-on-tertiary-container)]"}`}>정답률 {rate}%</span></div>
              <ul className="mt-2 grid gap-1 sm:grid-cols-2">{r.item.options.map((o, k) => <li key={k} className="flex items-center gap-2 text-sm">
                <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold ${k === r.item.answerIndex ? "bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)]" : "bg-[var(--md-sys-color-surface-container-highest)]"}`}>{k + 1}</span>
                <span className="min-w-0 flex-1 truncate">{o}</span>
                <span className="h-2 w-20 overflow-hidden rounded-full bg-[var(--md-sys-color-surface-container-highest)]"><span className={`block h-full ${k === r.item.answerIndex ? "bg-[var(--md-sys-color-primary)]" : "bg-[var(--md-sys-color-error)]"}`} style={{ width: `${pct(r.picks[k], r.asked)}%` }} /></span>
                <span className="w-8 text-right tabular-nums text-xs">{r.picks[k]}</span>
              </li>)}</ul>
              <p className="mt-2 text-xs text-[var(--md-sys-color-on-surface-variant)]">{r.asked}번 출제 · {r.correct}번 정답{topWrong ? ` · 가장 많이 고른 오답: ${topWrong.k + 1}번 "${r.item.options[topWrong.k]}"` : ""}{r.wrongBy.length ? ` · 틀린 학생: ${r.wrongBy.map(view.name).join(", ")}` : ""}</p>
            </li>; })}</ol>)
        : !myReport || myReport.wrong.length === 0 ? <p className="text-sm">{myReport ? "틀린 문제가 없어요. 대단해요!" : "이 리그에서 푼 문제가 없어요."}</p>
          : <><p className="mb-3 text-sm">푼 문제 {myReport.asked}개 중 {myReport.correct}개 맞혔어요. 틀린 문제를 다시 봐요.</p>
            <ol className="flex flex-col gap-2">{myReport.wrong.map((w, i) => <li key={i} className="rounded-2xl bg-[var(--md-sys-color-surface-container)] p-3 text-sm">
              <strong>{w.item.prompt}</strong>
              <p className="mt-1">내 답: <span className="text-[var(--md-sys-color-error)]">{w.picked + 1}번 {w.item.options[w.picked]}</span> · 정답: <b className="text-[var(--md-sys-color-primary)]">{w.item.answerIndex + 1}번 {w.item.options[w.item.answerIndex]}</b></p>
            </li>)}</ol></>}
    </section>}

    {tab === "students" && teacher && <section className={`${card} p-5`}>
      {!view.report || view.report.students.length === 0 ? <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">{view.report ? "문제 풀기 기록이 없어요." : "문제 기록을 모으고 있어요…"}</p>
        : <ul className="flex flex-col gap-2">{view.report.students.map(s => { const rate = pct(s.correct, s.asked);
          return <li key={s.uid} className="rounded-2xl bg-[var(--md-sys-color-surface-container)] p-3">
            <div className="flex items-center gap-3"><strong className="min-w-0 flex-1 truncate">{view.name(s.uid)}</strong>
              <span className="h-2 w-32 overflow-hidden rounded-full bg-[var(--md-sys-color-surface-container-highest)]"><span className="block h-full bg-[var(--md-sys-color-primary)]" style={{ width: `${rate}%` }} /></span>
              <span className="w-28 text-right text-sm tabular-nums"><b>{rate}%</b> ({s.correct}/{s.asked})</span></div>
            {s.wrong.length > 0 && <details className="mt-1 text-sm"><summary className="cursor-pointer text-[var(--md-sys-color-on-surface-variant)]">틀린 문제 {s.wrong.length}개</summary>
              <ul className="mt-1 flex flex-col gap-1 pl-4">{s.wrong.map((w, i) => <li key={i} className="list-disc">{w.item.prompt} — <span className="text-[var(--md-sys-color-error)]">{w.item.options[w.picked]}</span> (정답 {w.item.options[w.item.answerIndex]})</li>)}</ul></details>}
          </li>; })}</ul>}
    </section>}
  </Shell>;
}
