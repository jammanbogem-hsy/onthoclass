"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { getMemberProfile, watchMembers, type Member } from "@/lib/classes";
import { watchActiveGame, watchGame, type Game } from "@/lib/games";
import { finishPuyo, leavePuyoRoom, nextPuyoRound, presence, puyoClock, puyoUrl, startPuyo, watchPuyoPresence, watchPuyoRuns, type PuyoConfig, type PuyoPresence, type PuyoRun } from "@/lib/puyo";
import { DEFAULT_PUYO_RULES, minutesLabel, normalizeRules, planMatches, planPairs, PUYO_COUNTDOWN_SEC, PUYO_HOW_TO, PUYO_MAX_STUDENTS, ruleSummary, swapInPlan, type FlowStage, type PuyoPlan, type PuyoRules } from "@/lib/puyo-rules";
import { Icon } from "@/components/Icon";
import { Avatar } from "@/components/Avatar";
import { PuyoBattle, PuyoPractice } from "./PuyoBattle";
import { FreeLobby } from "./PuyoFree";
import { PuyoRulebook, PuyoRulesButton } from "./PuyoRulebook";
import { btnOutline, btnPrimary, btnTonal, card, Friend, Header, message, Notice, reasonLabels, Shell, timeLabel } from "./PuyoUi";

/** 로그인 없이 들어온 /puyo — 혼자 연습 + 게임 방법 */
function Landing() {
  return <Shell back={{ href: "/dashboard", label: "대시보드" }}>
    <Header title="뿌요뿌요" sub="같은 색 4개를 이어 터뜨리는 1:1 학급 대전 게임이에요. 여기서는 혼자 연습할 수 있어요." />
    <div className="grid gap-5 lg:grid-cols-[minmax(0,420px)_1fr]">
      <section className={`${card} p-5`}><h2 className="mb-4 text-lg font-bold">혼자 연습</h2><PuyoPractice /></section>
      <section className={`${card} flex flex-col gap-4 p-5`}>
        <h2 className="text-lg font-bold">게임 방법</h2>
        <ul className="grid gap-3 sm:grid-cols-2">{PUYO_HOW_TO.map(h => <li key={h.title} className="rounded-2xl bg-[var(--md-sys-color-surface-container)] p-4"><strong className="text-[15px]">{h.title}</strong><p className="mt-1 text-sm leading-relaxed text-[var(--md-sys-color-on-surface-variant)]">{h.body}</p></li>)}</ul>
        <div className="rounded-2xl bg-[var(--md-sys-color-primary-container)] p-4 text-[var(--md-sys-color-on-primary-container)]">
          <strong>친구와 대결하려면</strong>
          <p className="mt-1 text-sm leading-relaxed">선생님이 학급 관리 → 학급 게임에서 뿌요뿌요를 열면, 학급 화면에서 자동으로 대기실에 들어가요.</p>
        </div>
        <PuyoRulebook rules={DEFAULT_PUYO_RULES} initialTab="flow" compact />
      </section>
    </div>
  </Shell>;
}

function Scoreboard({ config, runs, uid, done }: { config: PuyoConfig; runs: PuyoRun[]; uid: string; done: boolean }) {
  const players = new Map((config.players || []).map(p => [p.uid, p]));
  const scores = new Map(runs.map(p => [p.uid, p]));
  const matches = config.matches || [];
  return <section id="puyo-scoreboard" className="mt-6 scroll-mt-24">
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-lg font-bold">{done ? "우리 반 경기 결과" : "우리 반 대진표"}</h2>
      <span className="rounded-full bg-[var(--md-sys-color-surface-container-high)] px-3 py-1 text-sm font-semibold text-[var(--md-sys-color-on-surface-variant)]">{matches.filter(m => m.result).length} / {matches.length} 경기 끝</span>
    </div>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{matches.map((m, i) => {
      const mine = m.a === uid || m.b === uid;
      return <article key={m.id} className={`${card} p-4 ${mine ? "ring-2 ring-[var(--md-sys-color-primary)]" : ""}`}>
        <header className="mb-3 flex items-center justify-between text-sm">
          <span className="font-bold text-[var(--md-sys-color-on-surface-variant)]">{i + 1}경기{mine && " · 나"}</span>
          {m.result ? <span className="rounded-full bg-[var(--md-sys-color-surface-container-highest)] px-2.5 py-0.5 text-xs font-bold">끝</span> : <span className="flex items-center gap-1 rounded-full bg-[var(--md-sys-color-tertiary-container)] px-2.5 py-0.5 text-xs font-bold text-[var(--md-sys-color-on-tertiary-container)]"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />경기 중</span>}
        </header>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">{[m.a, m.b].map((id, j) => {
          const won = m.result?.winner === id; const run = scores.get(id); const downs = run?.state?.downs ?? 0;
          return <div key={id} className={`flex flex-col items-center gap-1 text-center ${j === 1 ? "order-3" : ""}`}>
            <span className={`relative flex h-14 w-14 items-center justify-center rounded-2xl ${won ? "bg-[var(--md-sys-color-tertiary-container)]" : "bg-[var(--md-sys-color-surface-container-high)]"}`}><Friend index={i + j} size={48} />{won && <Icon name="trophy" size={18} fill className="absolute -right-1 -top-1 rounded-full bg-[var(--md-sys-color-tertiary)] p-0.5 text-[var(--md-sys-color-on-tertiary)]" />}</span>
            <strong className="max-w-full truncate text-sm">{players.get(id)?.name || "참가자"}</strong>
            <span className="text-xl font-black tabular-nums text-[var(--md-sys-color-primary)]">{(m.result?.scores[id] ?? run?.score ?? 0).toLocaleString("ko-KR")}</span>
            {downs > 0 && <span className="text-xs text-[var(--md-sys-color-on-surface-variant)]">다시 시작 {downs}번</span>}
          </div>;
        })}<span className="order-2 text-sm font-black text-[var(--md-sys-color-on-surface-variant)]">VS</span></div>
        <footer className="mt-3 border-t border-[var(--md-sys-color-outline-variant)] pt-2 text-center text-sm">
          {m.result ? <><strong>{m.result.winner ? `${players.get(m.result.winner)?.name || "참가자"} 승리!` : "무승부 · 함께 잘했어요!"}</strong><p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">{reasonLabels[m.result.reason]}{m.result.reward && ` · +${m.result.reward.xp} XP`}</p></>
            : <span className="text-[var(--md-sys-color-on-surface-variant)]">최고 연쇄 {Math.max(scores.get(m.a)?.maxChain || 0, scores.get(m.b)?.maxChain || 0)}</span>}
        </footer>
      </article>;
    })}</div>
    {!!config.resting?.length && <p className="mt-3 text-sm text-[var(--md-sys-color-on-surface-variant)]">이번 판 쉬는 친구: {config.resting.map(r => r.name).join(", ")} (다음 판에 먼저 짝을 받아요)</p>}
  </section>;
}

/** 대기실 — 참가자 고르기 → 1:1 짝 정하기(미리보기) → 시작. 학생은 같은 화면에서 진행 상황과 규칙을 본다. */
function Lobby({ cid, gid, uid, teacher, config, rules, students, onlineStudents, busy, act }: {
  cid: string; gid: string; uid: string; teacher: boolean; config: PuyoConfig; rules: PuyoRules;
  students: Member[]; onlineStudents: Member[]; busy: boolean; act: (task: () => Promise<unknown>) => Promise<void>;
}) {
  // 한 판 더로 열린 대기실은 직전 참가자를 미리 체크해 둔다(교사가 손대기 전까지).
  const [picked, setPicked] = useState<string[] | null>(null);
  const [plan, setPlan] = useState<PuyoPlan | null>(null);
  const [swapFrom, setSwapFrom] = useState<string | null>(null);
  const onlineIds = new Set(onlineStudents.map(m => m.uid));
  const selected = (picked ?? config.carry ?? []).filter(id => onlineIds.has(id));
  const odd = selected.length % 2 === 1;
  const ready = planMatches(plan, selected, uid);
  const memberOf = (id: string) => students.find(m => m.uid === id);
  const nameOf = (id: string) => id === uid && teacher ? "선생님" : memberOf(id)?.displayName || "학생";
  const toggle = (id: string) => { setPicked(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id]); setSwapFrom(null); };
  const shuffle = () => { setPlan(planPairs(selected, uid, rules, config.prevResting ?? [])); setSwapFrom(null); };
  const tap = (id: string) => {
    if (!ready || rules.pairing !== "manual") return;
    if (!swapFrom) { setSwapFrom(id); return; }
    if (swapFrom !== id) setPlan(swapInPlan(plan, swapFrom, id));
    setSwapFrom(null);
  };
  const seat = (id: string) => <button type="button" key={id} disabled={rules.pairing !== "manual" || busy} onClick={() => tap(id)} aria-pressed={swapFrom === id}
    className={`flex min-w-0 items-center gap-2 rounded-xl border px-2 py-1.5 text-left text-sm font-semibold transition disabled:cursor-default ${swapFrom === id ? "border-[var(--md-sys-color-primary)] bg-[var(--md-sys-color-primary-container)]" : "border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-lowest)]"}`}>
    <Avatar m={memberOf(id)} name={nameOf(id)} size={28} /><span className="truncate">{nameOf(id)}</span>
  </button>;
  const stage: FlowStage = ready ? "pair" : "pick";

  return <>
    <div className="grid items-start gap-5 lg:grid-cols-[1fr_360px]">
      <section className={`${card} p-5`}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-lg font-bold">대기실 <span className="rounded-full bg-[var(--md-sys-color-tertiary-container)] px-2.5 py-0.5 text-sm text-[var(--md-sys-color-on-tertiary-container)]">{onlineStudents.length}명 접속</span></h2>
          {teacher && onlineStudents.length > 0 && <button type="button" className="text-sm font-bold text-[var(--md-sys-color-primary)] underline-offset-4 hover:underline" onClick={() => { setPicked(selected.length === onlineStudents.length ? [] : onlineStudents.slice(0, PUYO_MAX_STUDENTS).map(p => p.uid)); setSwapFrom(null); }}>{selected.length === onlineStudents.length ? "전체 해제" : "전체 선택"}</button>}
        </div>
        {onlineStudents.length === 0 ? <div className="flex flex-col items-center gap-2 py-12 text-center"><div className="flex gap-1"><Friend index={0} size={56} /><Friend index={1} size={56} /></div><strong>친구들이 들어오는 중이에요</strong><p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">학생이 학급 화면을 열면 자동으로 여기에 나타나요.</p></div>
          : <div className="grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-2.5">{onlineStudents.map(p => {
            const on = selected.includes(p.uid);
            return <label key={p.uid} className={`relative flex cursor-pointer flex-col items-center gap-1.5 rounded-2xl border p-3 text-center transition ${on ? "border-[var(--md-sys-color-primary)] bg-[var(--md-sys-color-primary-container)]" : "border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-lowest)]"} ${!teacher ? "cursor-default" : ""}`}>
              <input type="checkbox" className="absolute right-2.5 top-2.5 h-4 w-4 accent-[var(--md-sys-color-primary)]" checked={on} disabled={!teacher || busy || (!on && selected.length >= PUYO_MAX_STUDENTS)} onChange={() => toggle(p.uid)} aria-label={`${p.displayName} 참가 선택`} />
              <Avatar m={p} name={p.displayName || "학생"} size={44} />
              <strong className="max-w-full truncate text-sm">{p.displayName || "학생"}{p.uid === uid && " (나)"}</strong>
              <span className="text-xs text-[var(--md-sys-color-on-surface-variant)]">{(config.prevResting ?? []).includes(p.uid) ? "먼저 짝 받기" : "접속 중"}</span>
            </label>;
          })}</div>}
        {students.length > onlineStudents.length && <p className="mt-4 text-sm text-[var(--md-sys-color-on-surface-variant)]">아직 들어오지 않은 친구 {students.length - onlineStudents.length}명</p>}
      </section>

      <aside className={`${card} flex flex-col gap-4 p-5 lg:sticky lg:top-24`}>
        <div>
          <p className="text-sm font-semibold text-[var(--md-sys-color-on-surface-variant)]">{(config.round ?? 1) > 1 ? `${config.round}번째 판` : "대결 준비"}</p>
          <h2 className="text-xl font-bold">{teacher ? ready ? "짝 확인하고 시작" : "참가자 고르기" : "선생님을 기다려요"}</h2>
        </div>
        {teacher ? <>
          <p className="rounded-2xl bg-[var(--md-sys-color-surface-container)] p-3 text-sm leading-relaxed">{selected.length === 0 ? "대결할 학생을 한 명 이상 골라 주세요." : odd ? rules.odd === "teacher" ? `학생 ${selected.length}명 + 선생님이 함께 대결해요.` : `학생 ${selected.length}명 · ${Math.floor(selected.length / 2)}경기, 한 명은 이번 판을 쉬어요.` : `학생 ${selected.length}명이 ${selected.length / 2}경기를 해요. 선생님은 지켜봐요.`}</p>
          {ready ? <div className="flex flex-col gap-2" aria-label="대진표 미리보기">
            {plan.pairs.map(([a, b], i) => <div key={`${a}-${b}`} className="grid grid-cols-[22px_1fr_auto_1fr] items-center gap-1.5"><span className="text-center text-xs font-bold text-[var(--md-sys-color-on-surface-variant)]">{i + 1}</span>{seat(a)}<span className="text-xs font-black text-[var(--md-sys-color-on-surface-variant)]">VS</span>{seat(b)}</div>)}
            {plan.resting.length > 0 && <div className="grid grid-cols-[22px_1fr] items-center gap-1.5"><span className="text-center text-xs font-bold text-[var(--md-sys-color-on-surface-variant)]">쉼</span>{plan.resting.map(seat)}</div>}
            <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">{rules.pairing === "manual" ? swapFrom ? `${nameOf(swapFrom)}와 자리를 바꿀 친구를 눌러요.` : "두 친구를 차례로 누르면 자리가 바뀌어요." : "무작위로 정한 짝이에요."}</p>
            <button type="button" className={btnOutline} disabled={busy} onClick={shuffle}><Icon name="shuffle" size={18} />다시 섞기</button>
          </div> : <button type="button" className={btnTonal} disabled={busy || selected.length === 0} onClick={shuffle}><Icon name="group" size={18} />1:1 짝 만들기</button>}
          <RuleChips rules={rules} />
          <button type="button" className={btnPrimary} disabled={busy || !ready} onClick={() => ready && void act(() => startPuyo(cid, gid, plan))}><Icon name="play_arrow" size={20} />{busy ? "경기 준비 중…" : "대결 시작"}</button>
          <p className="text-center text-xs leading-relaxed text-[var(--md-sys-color-on-surface-variant)]">{ready ? `시작하면 ${PUYO_COUNTDOWN_SEC}초 뒤 모두 함께 출발해요.` : "짝을 만들어야 시작할 수 있어요."} 누가 나가거나 선택이 바뀌면 짝을 다시 만들어요.</p>
        </> : <>
          <p className="rounded-2xl bg-[var(--md-sys-color-surface-container)] p-3 text-sm leading-relaxed">선생님이 참가자를 고르고 짝을 정하고 있어요. 이 화면을 열어 두면 시작할 때 경기 화면이 바로 켜져요.</p>
          <RuleChips rules={rules} />
          <p className="flex items-center justify-center gap-2 py-2 text-sm font-semibold text-[var(--md-sys-color-on-surface-variant)]"><span className="h-2 w-2 animate-pulse rounded-full bg-[var(--md-sys-color-tertiary)]" />곧 시작해요</p>
        </>}
      </aside>
    </div>
    <section className={`${card} mt-5 p-5`} aria-label="진행 순서와 규칙">
      <h2 className="mb-3 text-lg font-bold">이렇게 진행돼요 <span className="ml-1 text-sm font-semibold text-[var(--md-sys-color-on-surface-variant)]">{minutesLabel(rules.durationSec)} · 1:1 대결</span></h2>
      <PuyoRulebook rules={rules} current={stage} />
    </section>
  </>;
}

function RuleChips({ rules }: { rules: PuyoRules }) {
  return <dl className="grid grid-cols-2 gap-2">{ruleSummary(rules).map(r => <div key={r.label} className="rounded-2xl bg-[var(--md-sys-color-surface-container)] px-3 py-2"><dt className="text-xs text-[var(--md-sys-color-on-surface-variant)]">{r.label}</dt><dd className="text-sm font-bold">{r.value}</dd></div>)}</dl>;
}

function ConnectedRoom({ cid, gid }: { cid: string; gid: string }) {
  const { user, loading, configured } = useAuth();
  const router = useRouter();
  const [member, setMember] = useState<Awaited<ReturnType<typeof getMemberProfile>> | undefined>(undefined);
  const [game, setGame] = useState<Game | null | undefined>(undefined);
  const [members, setMembers] = useState<Member[]>([]);
  const [online, setOnline] = useState<PuyoPresence[]>([]);
  const [runs, setRuns] = useState<PuyoRun[]>([]);
  const [clockOffset, setClockOffset] = useState(0);
  // 서버 시계와의 차이를 받아 오기 전에는 경기 화면을 열지 않는다 — 기기 시계가 틀린 학생은
  // 보정 전 시간으로 "이미 끝났다"고 보고 시작 몇 초 만에 보드가 멈출 수 있었다.
  const [clockReady, setClockReady] = useState(false);
  const [now, setNow] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const finishing = useRef(false);
  const settleContext = useRef<{ config: PuyoConfig | undefined; runs: PuyoRun[]; clockOffset: number; uid: string; teacher: boolean }>({ config: undefined, runs: [], clockOffset: 0, uid: "", teacher: false });
  const teacher = member?.role === "teacher";
  const back = `/${teacher ? "class-admin" : "class"}/?id=${encodeURIComponent(cid)}`;
  const config = game?.puyo;
  const rules = normalizeRules(config);

  useEffect(() => { const tick = () => setNow(Date.now() + clockOffset); tick(); const t = setInterval(tick, 1000); return () => clearInterval(t); }, [clockOffset]);
  useEffect(() => {
    if (!user || !configured) return;
    let active = true;
    getMemberProfile(cid, user.uid).then(v => { if (active) setMember(v); }).catch(e => { if (active) { setMember(null); setError(message(e)); } });
    return () => { active = false; };
  }, [cid, user, configured]);
  useEffect(() => {
    if (!member || !user) return;
    let active = true;
    const report = (e: Error) => { if (active) setError(message(e)); };
    const off = [watchGame(cid, gid, setGame), watchMembers(cid, setMembers), watchPuyoPresence(cid, gid, setOnline, report)];
    let ok = false;
    const syncClock = () => puyoClock(cid).then(offset => { if (active) { ok = true; setClockOffset(offset); setClockReady(true); } }).catch(e => { if (active && ok) report(e); });
    void syncClock();
    // 실패하면 3초마다 다시, 맞춘 뒤에는 1분마다 다시 맞춘다
    const sync = setInterval(() => { if (!ok || Date.now() % 60000 < 3000) void syncClock(); }, 3000);
    return () => { active = false; off.forEach(fn => fn()); clearInterval(sync); };
  }, [cid, gid, member, user]);
  // 경기가 시작되는 순간 한 번 더 맞춘다(대기실에 오래 있던 기기의 시계 흐름 보정)
  useEffect(() => {
    if (!member || game?.status !== "play") return;
    let active = true;
    puyoClock(cid).then(offset => { if (active) { setClockOffset(offset); setClockReady(true); } }).catch(() => {});
    return () => { active = false; };
  }, [cid, member, game?.status]);
  useEffect(() => {
    if (!member || !user || game?.kind !== "puyo" || game?.status === "done") return;
    return presence(cid, gid, user.uid, member.displayName || user.displayName || (teacher ? "선생님" : "학생"));
  }, [cid, gid, member, user, game?.kind, game?.status, teacher]);
  // 교사가 '한 판 더' 또는 다른 게임을 열면 활성 게임 포인터가 바뀐다 → 모두 함께 이동.
  // 처음 본 포인터는 기준값으로만 기억한다(이력에서 옛 경기를 열어 볼 때 끌려가지 않도록).
  useEffect(() => {
    if (!member) return;
    let first: string | null | undefined;
    return watchActiveGame(cid, g => {
      const id = g?.id ?? null;
      if (first === undefined) { first = id; return; }
      if (!g || id === first || id === gid) return;
      first = id;
      if (g.kind === "puyo") router.replace(puyoUrl(cid, g.id));
      else router.push(back);
    });
  }, [cid, gid, member, router, back]);
  const matched = config?.matches?.find(m => m.a === user?.uid || m.b === user?.uid);
  const watchIds = teacher || !matched ? "" : [matched.a, matched.b].sort().join(",");
  useEffect(() => {
    if (!member || game?.kind !== "puyo") return;
    return watchPuyoRuns(cid, gid, setRuns, e => setError(message(e)), watchIds ? watchIds.split(",") : undefined);
  }, [cid, gid, member, game?.kind, watchIds]);
  useEffect(() => { settleContext.current = { config, runs, clockOffset, uid: user?.uid || "", teacher }; }, [config, runs, clockOffset, user?.uid, teacher]);
  useEffect(() => {
    if (game?.status !== "play") return;
    const settle = async () => {
      if (finishing.current) return;
      const { config: latest, runs: recent, clockOffset: offset, uid, teacher: isTeacher } = settleContext.current;
      if (!latest) return;
      const serverNow = Date.now() + offset;
      const pending = (latest.matches || []).filter(m => !m.result);
      if (!pending.length) return;
      const observed = isTeacher ? pending : pending.filter(m => m.a === uid || m.b === uid);
      // 경기는 시간 종료·선생님 종료로만 끝난다(예전 화면이 보낸 lost 만 예외로 처리).
      const needsResult = serverNow >= (latest.endsAt || Infinity) + 1800 || observed.some(m => [m.a, m.b].some(id => recent.find(r => r.uid === id)?.lost));
      if (!needsResult) return;
      finishing.current = true;
      try { await finishPuyo(cid, gid); } catch (e) { setError(message(e)); } finally { finishing.current = false; }
    };
    const timer = setInterval(() => void settle(), 3000);
    return () => clearInterval(timer);
  }, [cid, gid, game?.status]);

  const students = useMemo(() => members.filter(m => m.role === "student"), [members]);
  const onlineStudents = students.filter(m => online.some(p => p.uid === m.uid && p.online && now - p.at < 18000));
  const myMatch = config?.matches?.find(m => m.a === user?.uid || m.b === user?.uid);
  const remaining = config?.endsAt ? Math.max(0, Math.ceil((config.endsAt - now) / 1000)) : config?.durationSec || 0;
  const resting = config?.resting?.some(r => r.uid === user?.uid);
  const stage: FlowStage = game?.status === "done" ? "reward" : now < (config?.startsAt ?? 0) ? "ready" : "battle";
  async function act(task: () => Promise<unknown>) { setBusy(true); setError(""); try { await task(); } catch (e) { setError(message(e)); } finally { setBusy(false); } }

  const backLink = { href: back, label: "학급으로" };
  if (loading || (user && member === undefined)) return <Shell><Notice title="게임방에 들어가는 중…" /></Shell>;
  if (!configured || !user) return <Shell><Notice title="학급 계정으로 들어와 주세요" body="선생님과 같은 학급에 가입한 계정으로 로그인한 뒤 이 게임을 다시 열어 주세요." action={<Link className={btnPrimary} href="/">로그인하러 가기</Link>} /></Shell>;
  if (!member) return <Shell><Notice title="이 학급 친구만 함께할 수 있어요" body={error || "학급에 가입한 계정인지 확인해 주세요."} action={<Link className={btnOutline} href="/">내 학급으로</Link>} /></Shell>;
  if (game === undefined) return <Shell><Notice title="게임방을 불러오고 있어요…" /></Shell>;
  if (!game || game.kind !== "puyo" || !config) return <Shell back={backLink}><Notice title="게임방을 찾을 수 없어요" body="링크나 게임방 권한을 확인해 주세요." action={<Link className={btnOutline} href={back}>학급으로 돌아가기</Link>} /></Shell>;

  const round = (config.round ?? 1) > 1 ? ` · ${config.round}번째 판` : "";
  return <Shell back={backLink}>
    <Header
      title={<>뿌요뿌요<span className="ml-2 text-base font-semibold text-[var(--md-sys-color-on-surface-variant)]">{game.status === "draft" ? "대기실" : game.status === "done" ? "경기 결과" : "경기 중"}{round}</span></>}
      sub={game.status === "draft" ? teacher ? rules.pairing === "manual" ? "참가 학생을 고르고, 짝을 직접 정한 뒤 시작해요." : "참가 학생을 고르고, 무작위 짝을 만든 뒤 시작해요." : "선생님이 참가자를 확인하고 있어요. 곧 대결이 시작돼요!" : game.status === "done" ? "모두 수고했어요! 친구들의 결과를 함께 봐요." : "같은 색 4개를 이어 더 큰 연쇄에 도전해요."}
      right={<div className="flex items-center gap-2">
        <PuyoRulesButton rules={rules} current={game.status === "draft" ? "pick" : stage} className={btnOutline} />
        <div className="flex flex-col items-center rounded-2xl bg-[var(--md-sys-color-primary-container)] px-4 py-1.5 text-[var(--md-sys-color-on-primary-container)]"><span className="text-xs font-semibold">{game.status === "draft" ? "경기 시간" : game.status === "done" ? "경기" : "남은 시간"}</span><strong className="text-2xl font-black tabular-nums">{game.status === "done" ? "끝" : timeLabel(remaining)}</strong></div>
      </div>}
    />
    {error && <div role="alert" className="mb-4 flex items-center justify-between gap-3 rounded-2xl bg-[var(--md-sys-color-error-container)] px-4 py-3 text-sm text-[var(--md-sys-color-on-error-container)]"><span>{error}</span><button type="button" onClick={() => setError("")} aria-label="알림 닫기"><Icon name="close" size={18} /></button></div>}
    {game.status === "draft" && <Lobby cid={cid} gid={gid} uid={user.uid} teacher={teacher} config={config} rules={rules} students={students} onlineStudents={onlineStudents} busy={busy} act={act} />}
    {(game.status === "play" || game.status === "done") && <>
      {myMatch ? clockReady ? <PuyoBattle cid={cid} gid={gid} uid={user.uid} config={config} runs={runs} clockOffset={clockOffset} /> : <div className={`${card} p-6 text-center text-sm text-[var(--md-sys-color-on-surface-variant)]`}>경기 시간을 서버와 맞추는 중이에요…</div>
        : <div className={`${card} flex items-center gap-4 p-5`}><Friend index={1} size={64} /><div><strong className="text-lg">{game.status === "done" ? "모두 수고했어요!" : resting ? "이번 판은 쉬어요" : "지금은 응원 시간!"}</strong><p className="mt-1 text-sm text-[var(--md-sys-color-on-surface-variant)]">{game.status === "done" ? "아래에서 우리 반 친구들의 결과를 확인해요." : resting ? "참가 인원이 홀수라 이번 판은 응원해요. 다음 판에는 먼저 짝을 받아요!" : "친구들의 점수가 실시간으로 바뀌어요."}</p></div></div>}
      {game.status === "play" && teacher && <div className="mt-4 flex justify-end"><button type="button" className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-[var(--md-sys-color-error-container)] px-5 text-sm font-bold text-[var(--md-sys-color-on-error-container)] disabled:opacity-40" disabled={busy} onClick={() => void act(async () => { finishing.current = true; try { await finishPuyo(cid, gid, true); } finally { finishing.current = false; } })}><Icon name="stop_circle" size={18} />{busy ? "결과 정리 중…" : "지금 끝내고 점수로 판정"}</button></div>}
      <Scoreboard config={config} runs={runs} uid={user.uid} done={game.status === "done"} />
    </>}
    {game.status === "done" && <div className="mt-6 flex flex-col items-center gap-3 pb-6 text-center">
      {teacher ? <div className="flex flex-wrap justify-center gap-2">
        <button type="button" className={btnPrimary} disabled={busy} onClick={() => void act(async () => { const next = await nextPuyoRound(cid, user.uid, game); router.replace(puyoUrl(cid, next)); })}><Icon name="replay" size={20} />{busy ? "준비 중…" : "같은 규칙으로 한 판 더"}</button>
        <button type="button" className={btnOutline} disabled={busy} onClick={() => void act(async () => { await leavePuyoRoom(cid, gid); router.push(back); })}>마치고 학급으로</button>
      </div> : <Link className={btnPrimary} href={back}>학급으로 돌아가기</Link>}
      <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">{teacher ? "한 판 더를 누르면 학생들도 새 대기실로 함께 이동해요. 지난 참가자는 미리 체크돼 있어요." : "선생님이 한 판 더를 시작하면 새 대기실로 자동으로 이동해요."} 결과는 학급 게임 이력에 남아요.</p>
    </div>}
  </Shell>;
}

export default function PuyoRoom() {
  const params = useSearchParams();
  const cid = params.get("class") || "";
  const gid = params.get("game") || "";
  if (cid && params.get("free") === "1") return <FreeLobby cid={cid} />;
  return cid && gid ? <ConnectedRoom key={`${cid}/${gid}`} cid={cid} gid={gid} /> : <Landing />;
}
