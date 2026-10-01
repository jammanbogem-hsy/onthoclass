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
import { cancelFreeRoom, createFreeRoom, finishFreeRoom, FREE_SEC, FREE_WAIT_TTL_MS, freeTimes, joinFreeRoom, setFreeOpen, watchFreeOpen, watchFreeRooms, type FreeRoom } from "@/lib/puyo-free";
import { Icon } from "@/components/Icon";
import { BattleStage, stageResult, useSound } from "./PuyoBattle";
import { btnOutline, btnPrimary, card, Friend, Header, message, Notice, Shell } from "./PuyoUi";

/** 자유 대전 경기 — 서버 판정 없이 실시간 채널로만 주고받는다(보상 없음). */
function FreeBattle({ cid, room, uid, clockOffset, onExit }: { cid: string; room: FreeRoom; uid: string; clockOffset: number; onExit: () => void }) {
  const amHost = room.host === uid;
  const oppId = (amHost ? room.guest : room.host) ?? "";
  const meName = (amHost ? room.hostName : room.guestName) || "나";
  const oppName = (amHost ? room.guestName : room.hostName) || "친구";
  const { startsAt, endsAt } = freeTimes(room);
  const state = useRef<PuyoState>(createState(room.seed));
  const [view, setView] = useState<PuyoState>(() => createState(room.seed));
  const [opp, setOpp] = useState<PuyoRun | null>(null);
  const [now, setNow] = useState(0);
  const [healthy, setHealthy] = useState(true);
  const live = useRef<PuyoPublisher | null>(null);
  const times = useRef({ startsAt, endsAt, offset: clockOffset });
  useEffect(() => { times.current = { startsAt, endsAt, offset: clockOffset }; }, [startsAt, endsAt, clockOffset]);
  const sound = useSound(); const soundRef = useRef(sound);
  useEffect(() => { soundRef.current = sound; }, [sound]);

  useEffect(() => {
    if (!oppId) return;
    const off = watchFreeLive(cid, room.id, oppId, setOpp);
    const conn = watchPuyoConnection(setHealthy);
    return () => { off(); conn(); };
  }, [cid, room.id, oppId]);
  useEffect(() => { if (opp) receive(state.current, opp.sent); }, [opp]);

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
      saved: () => setHealthy(true),
      error: () => setHealthy(false),
    });
    live.current = pub;
    const timer = setInterval(() => pub.request(), PUYO_LIVE_INTERVAL_MS);
    return () => { clearInterval(timer); pub.dispose(); live.current = null; };
  }, [cid, room.id, uid]);
  const action = useCallback((a: Action) => {
    const { startsAt: s0, endsAt: s1, offset } = times.current; const t = Date.now() + offset;
    if (t >= s0 && t < s1) { input(state.current, a); setView(cloneState(state.current)); live.current?.request(a === "drop"); }
  }, []);

  // 끝: 시간이 지나면 두 화면이 각자 점수로 승부를 보여 준다. 방 기록은 방장이(없으면 참가자가 조금 뒤) 남긴다.
  const over = now >= endsAt + 1500;
  const mine = room.scores?.[uid] ?? view.score;
  const theirs = room.scores?.[oppId] ?? opp?.score ?? 0;
  const winner = room.status === "done" ? room.winner ?? null : mine === theirs ? null : mine > theirs ? uid : oppId;
  const recorded = useRef(false);
  useEffect(() => {
    if (!over || room.status !== "play" || recorded.current) return;
    const wait = amHost ? 0 : 5000;
    const t = setTimeout(() => {
      recorded.current = true;
      void finishFreeRoom(cid, room.id, { [uid]: view.score, [oppId]: opp?.score ?? 0 }, winner).catch(() => { recorded.current = false; });
    }, wait);
    return () => clearTimeout(t);
  }, [over, room.status, room.id, cid, uid, oppId, amHost, view.score, opp?.score, winner]);

  const seconds = Math.max(0, Math.ceil((endsAt - now) / 1000));
  const countdown = now ? Math.ceil((startsAt - now) / 1000) : 6;
  const oppState = opp?.state ?? createState(room.seed);
  return <BattleStage view={view} oppState={oppState} meName={meName} oppName={oppName} myScore={mine} theirScore={over ? theirs : oppState.score}
    seconds={seconds} countdown={countdown} away={!!opp && now - opp.at > 8000 && !over} mineIndex={amHost ? 0 : 1}
    notice={!healthy && !over ? "실시간 연결을 다시 잇는 중이에요." : undefined}
    result={over ? stageResult(winner, uid, mine, theirs, "자유 대전은 보상 없이 즐겨요") : null}
    action={action} sound={sound} onBack={onExit} backLabel="나가기" resultAction={{ label: "대기실로", icon: "replay", onClick: onExit }} />;
}

/** 자유 대전 대기실 — 방 만들기 / 같이 하기 / 교사 잠금 스위치. */
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
  const mineRoom = rooms.find(r => !left.includes(r.id) && (r.host === uid || r.guest === uid)
    && (r.status === "wait" ? server - r.createdAt < FREE_WAIT_TTL_MS : server < freeTimes(r).endsAt + 60000));
  // ↑ 끝난 방(done)도 1분 동안은 내 경기로 두어 결과 카드를 볼 수 있게 한다
  // 방장이 기다리다 창을 닫으면 방을 지운다(남은 방이 목록을 어지럽히지 않게)
  const waitingId = mineRoom?.status === "wait" && mineRoom.host === uid ? mineRoom.id : "";
  useEffect(() => {
    if (!waitingId) return;
    const bye = () => { void cancelFreeRoom(cid, waitingId).catch(() => {}); };
    window.addEventListener("pagehide", bye);
    return () => window.removeEventListener("pagehide", bye);
  }, [cid, waitingId]);
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
  const waiting = rooms.filter(r => r.status === "wait" && r.host !== uid && server - r.createdAt < FREE_WAIT_TTL_MS);
  const playing = rooms.filter(r => r.status === "play" && server < freeTimes(r).endsAt + 10000);
  const done = rooms.filter(r => r.status === "done").slice(0, 6);

  return <Shell back={{ href: back, label: "학급으로" }}>
    <Header title={<>쉬는 시간 자유 대전</>} sub={`친구와 1:1로 ${FREE_SEC / 60}분 동안 겨뤄요. 경험치 보상은 없어요.`} />
    {error && <div role="alert" className="mb-4 rounded-2xl bg-[var(--md-sys-color-error-container)] px-4 py-3 text-sm text-[var(--md-sys-color-on-error-container)]">{error}</div>}

    {teacher && <section className={`${card} mb-5 flex flex-wrap items-center justify-between gap-4 p-5`}>
      <div><h2 className="text-lg font-bold">학생 자유 대전</h2><p className="mt-1 text-sm text-[var(--md-sys-color-on-surface-variant)]">{open ? "지금 학생들이 방을 만들고 참가할 수 있어요." : "잠겨 있어요. 학생들은 방을 만들거나 참가할 수 없어요."}</p></div>
      <FreeToggle cid={cid} open={!!open} />
    </section>}

    {open === false ? <Notice title="자유 대전이 잠겨 있어요" body={teacher ? "위 스위치를 켜면 학생들이 쉬는 시간에 친구와 대결할 수 있어요." : "선생님이 자유 대전을 열면 친구와 대결할 수 있어요."} />
      : <div className="grid items-start gap-5 lg:grid-cols-[360px_1fr]">
        <section className={`${card} flex flex-col items-center gap-3 p-6 text-center`}>
          <div className="flex gap-1"><Friend index={2} size={64} /><Friend index={3} size={64} /></div>
          {mineRoom?.status === "wait" ? <>
            <strong className="text-lg">친구를 기다리는 중이에요</strong>
            <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">친구가 목록에서 내 방의 &lsquo;같이 하기&rsquo;를 누르면 바로 시작해요.</p>
            <span className="flex items-center gap-2 text-sm font-semibold text-[var(--md-sys-color-tertiary)]"><span className="h-2 w-2 animate-pulse rounded-full bg-current" />대기 중</span>
            <button type="button" className={btnOutline} disabled={busy} onClick={() => void act(() => cancelFreeRoom(cid, mineRoom.id))}>방 없애기</button>
          </> : <>
            <strong className="text-lg">내가 방 만들기</strong>
            <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">방을 만들면 같은 반 친구들 목록에 보여요.</p>
            <button type="button" className={btnPrimary} disabled={busy || !open} onClick={() => void act(() => createFreeRoom(cid, uid, name))}><Icon name="add" size={20} />방 만들기</button>
          </>}
        </section>

        <div className="flex flex-col gap-5">
          <section className={`${card} p-5`}>
            <h2 className="mb-3 text-lg font-bold">기다리는 친구 <span className="text-sm font-semibold text-[var(--md-sys-color-on-surface-variant)]">{waiting.length}</span></h2>
            {waiting.length === 0 ? <p className="py-6 text-center text-sm text-[var(--md-sys-color-on-surface-variant)]">아직 기다리는 친구가 없어요. 먼저 방을 만들어 보세요!</p>
              : <ul className="grid gap-2 sm:grid-cols-2">{waiting.map((r, i) => <li key={r.id} className="flex items-center justify-between gap-3 rounded-2xl bg-[var(--md-sys-color-surface-container)] p-3">
                <span className="flex min-w-0 items-center gap-2"><Friend index={i} size={36} /><strong className="truncate">{r.hostName}</strong></span>
                <button type="button" className={btnPrimary} disabled={busy || !!mineRoom || !open || clock === null} onClick={() => void act(() => joinFreeRoom(cid, r.id, uid, name))}>같이 하기</button>
              </li>)}</ul>}
          </section>
          {playing.length > 0 && <section className={`${card} p-5`}>
            <h2 className="mb-3 text-lg font-bold">지금 경기 중</h2>
            <ul className="flex flex-wrap gap-2">{playing.map(r => <li key={r.id} className="rounded-full bg-[var(--md-sys-color-tertiary-container)] px-3 py-1.5 text-sm font-semibold text-[var(--md-sys-color-on-tertiary-container)]">{r.hostName} vs {r.guestName}</li>)}</ul>
          </section>}
          {done.length > 0 && <section className={`${card} p-5`}>
            <h2 className="mb-3 text-lg font-bold">방금 끝난 경기</h2>
            <ul className="grid gap-2 sm:grid-cols-2">{done.map(r => <li key={r.id} className="rounded-2xl bg-[var(--md-sys-color-surface-container)] p-3 text-sm">
              <strong>{r.hostName} {(r.scores?.[r.host] ?? 0).toLocaleString("ko-KR")} : {(r.scores?.[r.guest ?? ""] ?? 0).toLocaleString("ko-KR")} {r.guestName}</strong>
              <p className="text-[var(--md-sys-color-on-surface-variant)]">{r.winner ? `${r.winner === r.host ? r.hostName : r.guestName} 승리` : "무승부"}</p>
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
