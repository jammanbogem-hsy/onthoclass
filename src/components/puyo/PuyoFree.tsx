"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { watchActiveGame } from "@/lib/games";
import { getMemberProfile } from "@/lib/classes";
import { cloneState, createState, input, receive, revive, tick, type Action, type PuyoState } from "@/lib/puyo-engine";
import { puyoClock, puyoUrl, type PuyoRun } from "@/lib/puyo";
import { saveFreeLive, watchFreeLive, watchPuyoConnection, PUYO_LIVE_INTERVAL_MS } from "@/lib/puyo-realtime";
import { PuyoPublisher } from "@/lib/puyo-sync";
import { cancelFreeRoom, createFreeRoom, finishFreeRoom, FREE_MAX, FREE_SEC, FREE_WAIT_TTL_MS, freeTimes, joinFreeRoom, leaveFreeRoom, seats, setFreeOpen, standings, startFreeRoom, watchFreeOpen, watchFreeRooms, type FreeRoom } from "@/lib/puyo-free";
import { Icon } from "@/components/Icon";
import { BattleStage, stageResult, useSound } from "./PuyoBattle";
import { btnOutline, btnPrimary, card, Friend, Header, message, Notice, Shell } from "./PuyoUi";

/** 자유 대전 경기 — 2~4명, 서버 판정 없이 실시간 채널로만 주고받는다(보상 없음).
 *  공격은 '모두에게 똑같이': 내가 받을 방해 뿌요 = 다른 모두가 보낸 공격의 합. */
function FreeBattle({ cid, room, uid, clockOffset, onExit }: { cid: string; room: FreeRoom; uid: string; clockOffset: number; onExit: () => void }) {
  const order = seats(room);
  const others = order.filter(u => u !== uid);
  const meName = room.members[uid] || "나";
  const { startsAt, endsAt } = freeTimes(room);
  const state = useRef<PuyoState>(createState(room.seed));
  const [view, setView] = useState<PuyoState>(() => createState(room.seed));
  const [boards, setBoards] = useState<Record<string, PuyoRun | null>>({});
  const sentMax = useRef<Record<string, number>>({});
  const [now, setNow] = useState(0);
  // 연결 안내는 5초 넘게 끊겼을 때만(첫 연결 지연·순간 끊김은 숨김)
  const [badAt, setBadAt] = useState<number | null>(null);
  const markLive = useCallback((ok: boolean) => setBadAt(at => ok ? null : at ?? Date.now()), []);
  const live = useRef<PuyoPublisher | null>(null);
  const times = useRef({ startsAt, endsAt, offset: clockOffset });
  useEffect(() => { times.current = { startsAt, endsAt, offset: clockOffset }; }, [startsAt, endsAt, clockOffset]);
  const sound = useSound(); const soundRef = useRef(sound);
  useEffect(() => { soundRef.current = sound; }, [sound]);

  const othersKey = others.join(",");
  useEffect(() => {
    const ids = othersKey ? othersKey.split(",") : [];
    const offs = ids.map(id => watchFreeLive(cid, room.id, id, run => setBoards(b => ({ ...b, [id]: run ?? b[id] ?? null }))));
    const conn = watchPuyoConnection(markLive);
    return () => { offs.forEach(f => f()); conn(); };
  }, [cid, room.id, othersKey, markLive]);
  // 친구가 나가도 이미 보낸 공격이 줄지 않게, 친구별 최댓값을 더한다
  useEffect(() => {
    for (const [id, run] of Object.entries(boards)) if (run) sentMax.current[id] = Math.max(sentMax.current[id] ?? 0, run.sent);
    receive(state.current, Object.values(sentMax.current).reduce((a, b) => a + b, 0));
  }, [boards]);

  useEffect(() => {
    let frame = 0; let prev = performance.now(); let draw = prev; let lastEvent = -1;
    const loop = (at: number) => {
      const { startsAt: s0, endsAt: s1, offset } = times.current;
      const t = Date.now() + offset; const s = state.current;
      if (t >= s0 && t < s1) { tick(s, Math.min(100, at - prev)); if (s.phase === "over") revive(s); }
      prev = at;
      if (at - draw > 32) {
        draw = at; setNow(t); setView(cloneState(s));
        if (s.event !== lastEvent) {
          lastEvent = s.event;
          if (["clear", "attack", "allclear", "garbage", "revive"].includes(s.effect)) live.current?.request(true);
          if (["clear", "attack", "allclear", "garbage"].includes(s.effect)) soundRef.current.play(s.chain, s.effect === "garbage");
        }
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, []);
  useEffect(() => {
    const pub = new PuyoPublisher({
      seq: 0,
      snapshot: () => { const { startsAt: s0, endsAt: s1, offset } = times.current; const t = Date.now() + offset; return t >= s0 && t <= s1 + 1400 ? state.current : null; },
      write: s => saveFreeLive(cid, room.id, uid, s),
      saved: () => markLive(true),
      error: () => markLive(false),
    });
    live.current = pub;
    const timer = setInterval(() => pub.request(), PUYO_LIVE_INTERVAL_MS);
    return () => { clearInterval(timer); pub.dispose(); live.current = null; };
  }, [cid, room.id, uid, markLive]);
  const action = useCallback((a: Action) => {
    const { startsAt: s0, endsAt: s1, offset } = times.current; const t = Date.now() + offset;
    if (t >= s0 && t < s1) { input(state.current, a); setView(cloneState(state.current)); live.current?.request(a === "drop"); }
  }, []);

  // 끝: 시간이 지나면 각자 화면이 점수 순위를 보여 준다. 방 기록은 방장이(없으면 다른 친구가 조금 뒤) 남긴다.
  const over = now >= endsAt + 1500;
  const liveScores: Record<string, number> = { [uid]: view.score };
  for (const id of others) liveScores[id] = boards[id]?.score ?? 0;
  const scores = room.status === "done" && room.scores ? room.scores : liveScores;
  const table = standings(scores, order);
  const top = table.filter(r => r.rank === 1);
  const winner = top.length === 1 ? top[0].uid : null;
  const recorded = useRef(false);
  const scoresKey = JSON.stringify(liveScores);
  useEffect(() => {
    if (!over || room.status !== "play" || recorded.current) return;
    const t = setTimeout(() => {
      recorded.current = true;
      const final = JSON.parse(scoresKey) as Record<string, number>;
      const ranked = standings(final, order); const firsts = ranked.filter(r => r.rank === 1);
      void finishFreeRoom(cid, room.id, final, firsts.length === 1 ? firsts[0].uid : null).catch(() => { recorded.current = false; });
    }, room.host === uid ? 0 : 5000);
    return () => clearTimeout(t);
    // order 는 room 에서 나온 값이라 room.id 로 충분하다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [over, room.status, room.id, room.host, cid, uid, scoresKey]);

  const seconds = Math.max(0, Math.ceil((endsAt - now) / 1000));
  const countdown = now ? Math.ceil((startsAt - now) / 1000) : 6;
  const rivals = others.map(id => ({ name: room.members[id] || "친구", state: boards[id]?.state ?? createState(room.seed), away: !!boards[id] && now - (boards[id]?.at ?? 0) > 8000 && !over }));
  const myRank = table.find(r => r.uid === uid)?.rank ?? 1;
  const multi = others.length >= 2;
  const result = !over ? null : multi ? {
    title: myRank === 1 ? (winner ? "오늘의 연쇄왕!" : "공동 1등!") : "끝까지 잘했어요",
    headline: `${myRank}등`,
    score: table.map(r => `${r.rank}등 ${room.members[r.uid] || "친구"} ${r.score.toLocaleString("ko-KR")}`).join(" · "),
    reward: "자유 대전은 보상 없이 즐겨요",
  } : stageResult(winner, uid, scores[uid] ?? 0, scores[others[0]] ?? 0, "자유 대전은 보상 없이 즐겨요");
  return <BattleStage view={view} oppState={rivals[0]?.state ?? createState(room.seed)} meName={meName} oppName={rivals[0]?.name ?? "친구"}
    myScore={scores[uid] ?? view.score} theirScore={scores[others[0]] ?? 0} others={multi ? rivals : undefined}
    seconds={seconds} countdown={countdown} away={rivals[0]?.away} mineIndex={Math.max(0, order.indexOf(uid))}
    notice={!over && countdown <= 0 && badAt !== null && now - clockOffset - badAt > 5000 ? "실시간 연결을 다시 잇는 중이에요. 게임은 그대로 계속돼요." : undefined}
    result={result} action={action} sound={sound} onBack={onExit} backLabel="나가기" resultAction={{ label: "대기실로", icon: "replay", onClick: onExit }} />;
}

/** 자유 대전 대기실 — 방 만들기(최대 4명) / 같이 하기 / 방장 시작 / 교사 잠금 스위치. */
export function FreeLobby({ cid }: { cid: string }) {
  const { user, loading, configured } = useAuth();
  const [member, setMember] = useState<Awaited<ReturnType<typeof getMemberProfile>> | undefined>(undefined);
  const [open, setOpen] = useState<boolean | undefined>(undefined);
  const [rooms, setRooms] = useState<FreeRoom[]>([]);
  const [clock, setClock] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [left, setLeft] = useState<string[]>([]);
  const router = useRouter();
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
    let active = true; let ok = false;
    const offs = [watchFreeOpen(cid, setOpen), watchFreeRooms(cid, setRooms, e => setError(message(e)))];
    const sync = () => puyoClock(cid).then(o => { if (active) { ok = true; setClock(o); } }).catch(() => {});
    void sync();
    const t = setInterval(() => { if (!ok) void sync(); }, 3000);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => { active = false; offs.forEach(f => f()); clearInterval(t); clearInterval(tick); };
  }, [cid, member]);

  const uid = user?.uid ?? "";
  const server = now + (clock ?? 0);
  // 끝난 방(done)도 1분 동안은 내 경기로 두어 결과 카드를 볼 수 있게 한다
  const mineRoom = rooms.find(r => !left.includes(r.id) && !!r.members[uid]
    && (r.status === "wait" ? server - r.createdAt < FREE_WAIT_TTL_MS : server < freeTimes(r).endsAt + 60000));
  const amHost = mineRoom?.host === uid;
  // 기다리다 창을 닫으면 방장은 방을 지우고, 손님은 자리에서 빠진다
  const waitingId = mineRoom?.status === "wait" ? mineRoom.id : "";
  useEffect(() => {
    if (!waitingId) return;
    const bye = () => { void (amHost ? cancelFreeRoom(cid, waitingId) : leaveFreeRoom(cid, waitingId, uid)).catch(() => {}); };
    window.addEventListener("pagehide", bye);
    return () => window.removeEventListener("pagehide", bye);
  }, [cid, waitingId, amHost, uid]);
  // 4명이 모이면 방장 화면이 바로 시작한다
  const full = !!mineRoom && mineRoom.status === "wait" && Object.keys(mineRoom.members).length >= FREE_MAX;
  const autoStarted = useRef("");
  const fullId = full && amHost ? mineRoom.id : "";
  useEffect(() => {
    if (!fullId || autoStarted.current === fullId) return;
    autoStarted.current = fullId;
    void startFreeRoom(cid, fullId).catch(e => setError(message(e)));
  }, [fullId, cid]);
  // 수업용 학급 게임이 열리면(자유 대전 경기 중이 아닐 때) 학생은 그쪽으로 이동한다
  const inMatch = !!mineRoom && mineRoom.status !== "wait";
  useEffect(() => {
    if (!member || teacher || inMatch) return;
    return watchActiveGame(cid, g => {
      if (!g || g.status === "done") return;
      router.push(g.kind === "puyo" ? puyoUrl(cid, g.id) : back);
    });
  }, [cid, member, teacher, inMatch, router, back]);
  async function act(task: () => Promise<unknown>) { setBusy(true); setError(""); try { await task(); } catch (e) { setError(message(e)); } finally { setBusy(false); } }

  if (loading || (user && member === undefined)) return <Shell><Notice title="자유 대전에 들어가는 중…" /></Shell>;
  if (!configured || !user) return <Shell><Notice title="학급 계정으로 들어와 주세요" /></Shell>;
  if (!member) return <Shell><Notice title="이 학급 친구만 함께할 수 있어요" body={error || "학급에 가입한 계정인지 확인해 주세요."} /></Shell>;

  if (mineRoom && mineRoom.status !== "wait" && clock !== null) return <FreeBattle key={mineRoom.id} cid={cid} room={mineRoom} uid={uid} clockOffset={clock} onExit={() => setLeft(l => [...l, mineRoom.id])} />;

  const name = member.displayName || user.displayName || (teacher ? "선생님" : "학생");
  const names = (r: FreeRoom) => seats(r).map(u => r.members[u]).join(", ");
  const waiting = rooms.filter(r => r.status === "wait" && !r.members[uid] && server - r.createdAt < FREE_WAIT_TTL_MS);
  const playing = rooms.filter(r => r.status === "play" && server < freeTimes(r).endsAt + 10000);
  const done = rooms.filter(r => r.status === "done").slice(0, 6);
  const count = mineRoom ? Object.keys(mineRoom.members).length : 0;

  return <Shell back={{ href: back, label: "학급으로" }}>
    <Header title={<>쉬는 시간 자유 대전</>} sub={`친구 1~3명과 ${FREE_SEC / 60}분 동안 겨뤄요. 연쇄 공격은 다른 모두에게 똑같이 가요. 경험치 보상은 없어요.`} />
    {error && <div role="alert" className="mb-4 rounded-2xl bg-[var(--md-sys-color-error-container)] px-4 py-3 text-sm text-[var(--md-sys-color-on-error-container)]">{error}</div>}

    {teacher && <section className={`${card} mb-5 flex flex-wrap items-center justify-between gap-4 p-5`}>
      <div><h2 className="text-lg font-bold">학생 자유 대전</h2><p className="mt-1 text-sm text-[var(--md-sys-color-on-surface-variant)]">{open ? "지금 학생들이 방을 만들고 참가할 수 있어요." : "잠겨 있어요. 학생들은 방을 만들거나 참가할 수 없어요."}</p></div>
      <FreeToggle cid={cid} open={!!open} />
    </section>}

    {open === false ? <Notice title="자유 대전이 잠겨 있어요" body={teacher ? "위 스위치를 켜면 학생들이 쉬는 시간에 친구와 대결할 수 있어요." : "선생님이 자유 대전을 열면 친구와 대결할 수 있어요."} />
      : <div className="grid items-start gap-5 lg:grid-cols-[380px_1fr]">
        <section className={`${card} flex flex-col items-center gap-3 p-6 text-center`}>
          <div className="flex gap-1"><Friend index={2} size={56} /><Friend index={3} size={56} /><Friend index={0} size={56} /><Friend index={1} size={56} /></div>
          {mineRoom?.status === "wait" ? <>
            <strong className="text-lg">{amHost ? "내 방" : `${mineRoom.hostName}의 방`} · {count}/{FREE_MAX}명</strong>
            <ul className="flex w-full flex-col gap-1.5">{seats(mineRoom).map((u, i) => <li key={u} className="flex items-center gap-2 rounded-xl bg-[var(--md-sys-color-surface-container)] px-3 py-2 text-left text-sm font-semibold"><Friend index={i} size={28} />{mineRoom.members[u]}{u === mineRoom.host && <span className="ml-auto text-xs text-[var(--md-sys-color-on-surface-variant)]">방장</span>}</li>)}
              {Array.from({ length: FREE_MAX - count }, (_, i) => <li key={`e${i}`} className="rounded-xl border border-dashed border-[var(--md-sys-color-outline-variant)] px-3 py-2 text-left text-sm text-[var(--md-sys-color-on-surface-variant)]">빈자리</li>)}</ul>
            {amHost ? <>
              <button type="button" className={btnPrimary} disabled={busy || count < 2 || !open} onClick={() => void act(() => startFreeRoom(cid, mineRoom.id))}><Icon name="play_arrow" size={20} />{count < 2 ? "친구를 기다려요" : `${count}명이서 시작`}</button>
              <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">2명 이상이면 시작할 수 있어요. 4명이 모이면 바로 시작해요.</p>
              <button type="button" className={btnOutline} disabled={busy} onClick={() => void act(() => cancelFreeRoom(cid, mineRoom.id))}>방 없애기</button>
            </> : <>
              <span className="flex items-center gap-2 text-sm font-semibold text-[var(--md-sys-color-tertiary)]"><span className="h-2 w-2 animate-pulse rounded-full bg-current" />방장이 시작하기를 기다려요</span>
              <button type="button" className={btnOutline} disabled={busy} onClick={() => void act(() => leaveFreeRoom(cid, mineRoom.id, uid))}>나가기</button>
            </>}
          </> : <>
            <strong className="text-lg">내가 방 만들기</strong>
            <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">방을 만들면 같은 반 친구들 목록에 보여요. 최대 4명까지 들어올 수 있어요.</p>
            <button type="button" className={btnPrimary} disabled={busy || !open} onClick={() => void act(() => createFreeRoom(cid, uid, name))}><Icon name="add" size={20} />방 만들기</button>
          </>}
        </section>

        <div className="flex flex-col gap-5">
          <section className={`${card} p-5`}>
            <h2 className="mb-3 text-lg font-bold">들어갈 수 있는 방 <span className="text-sm font-semibold text-[var(--md-sys-color-on-surface-variant)]">{waiting.length}</span></h2>
            {waiting.length === 0 ? <p className="py-6 text-center text-sm text-[var(--md-sys-color-on-surface-variant)]">아직 열린 방이 없어요. 먼저 방을 만들어 보세요!</p>
              : <ul className="grid gap-2 sm:grid-cols-2">{waiting.map((r, i) => {
                const n = Object.keys(r.members).length;
                return <li key={r.id} className="flex items-center justify-between gap-3 rounded-2xl bg-[var(--md-sys-color-surface-container)] p-3">
                  <span className="flex min-w-0 items-center gap-2"><Friend index={i} size={36} /><span className="min-w-0"><strong className="block truncate">{r.hostName}의 방</strong><span className="block truncate text-xs text-[var(--md-sys-color-on-surface-variant)]">{n}/{FREE_MAX}명 · {names(r)}</span></span></span>
                  <button type="button" className={btnPrimary} disabled={busy || !!mineRoom || !open || clock === null || n >= FREE_MAX} onClick={() => void act(() => joinFreeRoom(cid, r.id, uid, name))}>{n >= FREE_MAX ? "꽉 참" : "같이 하기"}</button>
                </li>;
              })}</ul>}
          </section>
          {playing.length > 0 && <section className={`${card} p-5`}>
            <h2 className="mb-3 text-lg font-bold">지금 경기 중</h2>
            <ul className="flex flex-wrap gap-2">{playing.map(r => <li key={r.id} className="rounded-full bg-[var(--md-sys-color-tertiary-container)] px-3 py-1.5 text-sm font-semibold text-[var(--md-sys-color-on-tertiary-container)]">{seats(r).map(u => r.members[u]).join(" vs ")}</li>)}</ul>
          </section>}
          {done.length > 0 && <section className={`${card} p-5`}>
            <h2 className="mb-3 text-lg font-bold">방금 끝난 경기</h2>
            <ul className="grid gap-2 sm:grid-cols-2">{done.map(r => <li key={r.id} className="rounded-2xl bg-[var(--md-sys-color-surface-container)] p-3 text-sm">
              {standings(r.scores ?? {}, seats(r)).map(x => <p key={x.uid} className={x.rank === 1 ? "font-bold" : "text-[var(--md-sys-color-on-surface-variant)]"}>{x.rank}등 {r.members[x.uid]} · {x.score.toLocaleString("ko-KR")}</p>)}
            </li>)}</ul>
          </section>}
        </div>
      </div>}
  </Shell>;
}

/** 교사용 자유 대전 잠금 스위치(학급 게임 창·자유 대전 화면에서 같이 쓴다). */
export function FreeToggle({ cid, open }: { cid: string; open: boolean }) {
  const [busy, setBusy] = useState(false);
  return <button type="button" role="switch" aria-checked={open} disabled={busy} aria-label="학생 자유 대전 열기"
    onClick={async () => { setBusy(true); try { await setFreeOpen(cid, !open); } finally { setBusy(false); } }}
    className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full border-2 transition ${open ? "border-[var(--md-sys-color-primary)] bg-[var(--md-sys-color-primary)]" : "border-[var(--md-sys-color-outline)] bg-[var(--md-sys-color-surface-container-highest)]"} disabled:opacity-50`}>
    <span className={`absolute flex h-6 w-6 items-center justify-center rounded-full shadow transition-all ${open ? "left-[26px] bg-[var(--md-sys-color-on-primary)] text-[var(--md-sys-color-primary)]" : "left-0.5 h-4 w-4 bg-[var(--md-sys-color-outline)]"}`}>{open && <Icon name="check" size={16} />}</span>
  </button>;
}

/** 학급 게임 창 안의 자유 대전 스위치 줄 — 현재 상태를 구독한다. */
export function FreeToggleRow({ cid }: { cid: string }) {
  const [open, setOpen] = useState(false);
  useEffect(() => watchFreeOpen(cid, setOpen), [cid]);
  return <div className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)] p-4">
    <div className="min-w-0">
      <p className="text-sm font-bold">쉬는 시간 학생 자유 대전</p>
      <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">{open ? "열림 · 학생끼리 방을 만들어 대결해요(보상 없음)" : "잠김 · 학생이 방을 만들 수 없어요"}</p>
      <a href={`/puyo/?class=${encodeURIComponent(cid)}&free=1`} className="mt-1 inline-block text-xs font-bold text-[var(--md-sys-color-primary)] underline-offset-4 hover:underline">자유 대전 화면 보기</a>
    </div>
    <FreeToggle cid={cid} open={open} />
  </div>;
}

/** 학생 학급 화면의 '자유 대전' 버튼 — 선생님이 열어 둔 동안만 보인다. */
export function FreePlayButton({ cid }: { cid: string }) {
  const [open, setOpen] = useState(false);
  useEffect(() => watchFreeOpen(cid, setOpen), [cid]);
  if (!open) return null;
  return <a href={`/puyo/?class=${encodeURIComponent(cid)}&free=1`}
    className="inline-flex items-center gap-1.5 rounded-full bg-[var(--md-sys-color-tertiary-container)] px-4 py-2 text-sm font-bold text-[var(--md-sys-color-on-tertiary-container)] transition hover:brightness-95">
    <Icon name="sports_esports" size={16} />뿌요 자유 대전
  </a>;
}
