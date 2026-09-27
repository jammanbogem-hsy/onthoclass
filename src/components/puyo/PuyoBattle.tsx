"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cloneState, createState, input, receive, tick, type Action, type PuyoState } from "@/lib/puyo-engine";
import { finishPuyo, savePuyoRun, type PuyoConfig, type PuyoRun } from "@/lib/puyo";
import { getPuyoLive, watchPuyoConnection, watchPuyoLive, savePuyoLive, PUYO_LIVE_INTERVAL_MS } from "@/lib/puyo-realtime";
import { cachePuyo, restorePuyo, PuyoPublisher, PUYO_SYNC_INTERVAL_MS } from "@/lib/puyo-sync";
import { PuyoBoard } from "./PuyoBoard";
import styles from "./PuyoBattle.module.css";

function useSound() {
  const [muted, setMuted] = useState(false);
  const ctx = useRef<AudioContext | null>(null);
  const unlock = useCallback(() => {
    if (!ctx.current) ctx.current = new AudioContext();
    void ctx.current.resume();
  }, []);
  const play = useCallback((chain: number, garbage = false) => {
    const audio = ctx.current;
    if (!audio || muted || audio.state !== "running") return;
    [0, 4, 7].forEach((note, i) => {
      const osc = audio.createOscillator(); const gain = audio.createGain();
      osc.type = garbage ? "triangle" : "sine";
      osc.frequency.value = (garbage ? 110 : 330) * 2 ** ((note + Math.min(chain, 12) * 2) / 12);
      const at = audio.currentTime + i * .055;
      gain.gain.setValueAtTime(0, at); gain.gain.linearRampToValueAtTime(.045, at + .012); gain.gain.exponentialRampToValueAtTime(.001, at + .22);
      osc.connect(gain); gain.connect(audio.destination); osc.start(at); osc.stop(at + .24);
    });
  }, [muted]);
  useEffect(() => () => { void ctx.current?.close(); ctx.current = null; }, []);
  return { muted, setMuted, unlock, play };
}

function Controls({ action, disabled, unlock }: { action: (a: Action) => void; disabled: boolean; unlock: () => void }) {
  const repeat = useRef<ReturnType<typeof setInterval> | null>(null);
  const stop = useCallback(() => { if (repeat.current) clearInterval(repeat.current); repeat.current = null; }, []);
  useEffect(() => {
    const keys: Record<string, Action> = { ArrowLeft: "left", ArrowRight: "right", ArrowDown: "down", ArrowUp: "cw", KeyX: "cw", KeyZ: "ccw", Space: "drop" };
    const keydown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && (e.target.isContentEditable || /INPUT|SELECT|TEXTAREA/.test(e.target.tagName))) return;
      const a = keys[e.code]; if (!a) return; e.preventDefault();
      if (disabled || (e.repeat && ["cw", "ccw", "drop"].includes(a))) return;
      unlock(); action(a);
    };
    window.addEventListener("keydown", keydown); window.addEventListener("blur", stop);
    return () => { window.removeEventListener("keydown", keydown); window.removeEventListener("blur", stop); stop(); };
  }, [action, disabled, unlock, stop]);
  const buttons: [Action, string, string][] = [["left", "←", "왼쪽 이동"], ["down", "↓", "빠르게 내리기"], ["right", "→", "오른쪽 이동"], ["ccw", "↶", "왼쪽 회전 Z"], ["cw", "↷", "오른쪽 회전 X"], ["drop", "⤓", "바로 떨어뜨리기 Space"]];
  return <div className={styles.controls} aria-label="뿌요 조작">
    {buttons.map(([a, label, title]) => <button key={a} aria-label={title} title={title} disabled={disabled} className={a === "drop" ? styles.drop : ""}
      onPointerDown={e => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); stop(); unlock(); action(a); if (["left", "right", "down"].includes(a)) repeat.current = setInterval(() => action(a), 120); }}
      onPointerUp={stop} onPointerCancel={stop} onLostPointerCapture={stop}
      onClick={e => { if (e.detail === 0) { unlock(); action(a); } }}>
      <strong>{label}</strong><small>{a === "ccw" ? "Z" : a === "cw" ? "X / ↑" : a === "drop" ? "SPACE" : "이동"}</small>
    </button>)}
  </div>;
}

export function PuyoBattle({ cid, gid, uid, config, runs, clockOffset }: { cid: string; gid: string; uid: string; config: PuyoConfig; runs: PuyoRun[]; clockOffset: number }) {
  const match = config.matches?.find(m => m.a === uid || m.b === uid);
  const me = config.players?.find(p => p.uid === uid);
  const opponentId = match?.a === uid ? match.b : match?.a;
  const other = config.players?.find(p => p.uid === opponentId);
  const myRun = runs.find(r => r.uid === uid);
  const durableOpponent = runs.find(r => r.uid === opponentId);
  const [liveOwn, setLiveOwn] = useState<PuyoRun | null | undefined>(undefined);
  const [liveOpponent, setLiveOpponent] = useState<PuyoRun | null>(null);
  const [liveHealthy, setLiveHealthy] = useState(true);
  const livePublisher = useRef<PuyoPublisher | null>(null);

  const state = useRef<PuyoState | null>(null);
  const initialSeq = useRef(0); const started = useRef(false); const savedLost = useRef(false);
  const publisher = useRef<PuyoPublisher | null>(null);
  const section = useRef<HTMLElement>(null);
  const [view, setView] = useState<PuyoState | null>(null);
  const [error, setError] = useState("");
  const [now, setNow] = useState(0);
  const opponent = liveOpponent && now - liveOpponent.at < 2000 && !match?.result ? liveOpponent : durableOpponent;
  const sound = useSound(); const soundRef = useRef(sound);
  useEffect(() => { soundRef.current = sound; }, [sound]);
  const healthyRef = useRef(liveHealthy);
  useEffect(() => { healthyRef.current = liveHealthy; }, [liveHealthy]);
  const options = useRef({ config, match, clockOffset });
  useEffect(() => { options.current = { config, match, clockOffset }; }, [config, match, clockOffset]);

  useEffect(() => {
    if (!config.realtime || match?.result || !opponentId) return;
    let active = true;
    const timeout = setTimeout(() => { if (active) setLiveOwn(v => v === undefined ? null : v); }, 1500);
    void getPuyoLive(cid, gid, uid).then(r => { if (active) setLiveOwn(r); }).catch(() => { if (active) setLiveOwn(null); });
    const off = watchPuyoLive(cid, gid, opponentId, setLiveOpponent);
    const connection = watchPuyoConnection(setLiveHealthy);
    return () => { active = false; clearTimeout(timeout); off(); connection(); };
  }, [cid, gid, uid, opponentId, config.realtime, match?.result]);
  // Restore the latest acknowledged state on a reload; never respawn a fresh board.
  useEffect(() => {
    if (started.current || !myRun || !match || (config.realtime && !match.result && liveOwn === undefined)) return;
    const latest = liveOwn && liveOwn.at > myRun.at ? liveOwn : myRun;
    let local: PuyoState | null = null;
    try { if (!match.result) local = restorePuyo(localStorage, `${cid}/${gid}/${uid}`, latest.at, Date.now() + clockOffset); } catch { /* Private storage restrictions. */ }
    const restored = local ?? latest.state;
    state.current = restored ? cloneState(restored) : createState(match.seed);
    initialSeq.current = myRun.seq; savedLost.current = myRun.lost;
    started.current = true; setView(cloneState(state.current));
  }, [myRun, match, liveOwn, config.realtime, cid, gid, uid, clockOffset]);
  useEffect(() => { if (state.current && opponent) receive(state.current, opponent.sent); }, [opponent]);
  useEffect(() => {
    let frame = 0; let previous = performance.now(); let draw = previous; let lastEvent = -1;
    const run = (at: number) => {
      const { config: c, match: m, clockOffset: offset } = options.current;
      const time = Date.now() + offset; const s = state.current;
      if (s && !m?.result && time >= (c.startsAt ?? Infinity) && time < (c.endsAt ?? 0)) tick(s, Math.min(100, at - previous));
      previous = at;
      if (s?.phase === "over" && !savedLost.current) { publisher.current?.request(true); livePublisher.current?.request(true); }
      if (at - draw > 32) {
        setNow(time); if (s) setView(cloneState(s)); draw = at;
        if (s && s.event !== lastEvent) {
          lastEvent = s.event;
          if (["clear", "attack", "allclear", "garbage"].includes(s.effect) || s.phase === "over") { publisher.current?.request(true); livePublisher.current?.request(true); }
          if (["clear", "attack", "allclear", "garbage"].includes(s.effect)) soundRef.current.play(s.chain, s.effect === "garbage");
        }
      }
      frame = requestAnimationFrame(run);
    };
    frame = requestAnimationFrame(run);
    return () => { cancelAnimationFrame(frame); };
  }, []);
  const ready = !!view;
  useEffect(() => {
    if (!ready) return;
    const queue = new PuyoPublisher({
      seq: initialSeq.current,
      snapshot: () => {
        const s = state.current; const { config: c, match: m, clockOffset: offset } = options.current;
        const time = Date.now() + offset;
        if (!s || m?.result || time < (c.startsAt ?? Infinity) || time > (c.endsAt ?? 0) + 1400 || savedLost.current) return null;
        return s;
      },
      write: (s, seq) => savePuyoRun(cid, gid, uid, s, seq),
      saved: s => {
        if (s.phase === "over") { savedLost.current = true; void finishPuyo(cid, gid).catch(() => {}); }
        setError("");
      },
      error: () => setError("연결을 확인하고 있어요. 같은 경기를 여러 탭에서 열었다면 하나만 남기고 새로고침해 주세요."),
    });
    publisher.current = queue;
    const live = config.realtime ? new PuyoPublisher({
      seq: 0,
      snapshot: () => {
        const s = state.current; const { config: c, match: m, clockOffset: offset } = options.current;
        const t = Date.now() + offset;
        return s && !m?.result && t >= (c.startsAt ?? Infinity) && t <= (c.endsAt ?? 0) + 1400 ? s : null;
      },
      write: s => savePuyoLive(cid, gid, uid, s),
      saved: () => setLiveHealthy(true),
      error: () => setLiveHealthy(false),
    }) : null;
    livePublisher.current = live;
    const liveTimer = live ? setInterval(() => live.request(), PUYO_LIVE_INTERVAL_MS) : null;
    const backup = () => {
      const s = state.current; const { config: c, match: m, clockOffset: offset } = options.current;
      const at = Date.now() + offset;
      if (s && !m?.result && at >= (c.startsAt ?? Infinity) && at <= (c.endsAt ?? 0)) {
        try { cachePuyo(localStorage, `${cid}/${gid}/${uid}`, s, at); } catch { /* Private storage restrictions. */ }
      }
    };
    let lastCheckpoint = 0;
    const interval = setInterval(() => { backup(); const time = performance.now(); if (!config.realtime || !healthyRef.current || time - lastCheckpoint >= 1000) { lastCheckpoint = time; queue.request(); } }, PUYO_SYNC_INTERVAL_MS);
    const hide = () => { backup(); queue.request(true); };
    window.addEventListener("pagehide", hide);
    return () => { live?.dispose(); livePublisher.current = null; if (liveTimer) clearInterval(liveTimer); queue.dispose(); publisher.current = null; clearInterval(interval); window.removeEventListener("pagehide", hide); };
  }, [cid, gid, uid, ready, config.realtime]);
  const action = useCallback((a: Action) => {
    const { config: c, match: m, clockOffset: offset } = options.current;
    const t = Date.now() + offset;
    if (state.current && !m?.result && t >= (c.startsAt ?? Infinity) && t < (c.endsAt ?? 0)) { input(state.current, a); setView(cloneState(state.current)); livePublisher.current?.request(a === "drop"); if (!options.current.config.realtime || a === "drop") publisher.current?.request(a === "drop"); }
  }, []);
  useEffect(() => { if (ready) section.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }, [ready]);
  if (!match || !view) return <p className={styles.loading}>경기 보드를 준비하고 있어요…</p>;
  const seconds = Math.max(0, Math.ceil(((config.endsAt ?? 0) - now) / 1000));
  const countdown = now ? Math.ceil(((config.startsAt ?? 0) - now) / 1000) : 6;
  const paused = countdown > 0 || seconds <= 0 || !!match.result || view.phase === "over";
  const result = match.result;
  return <section ref={section} className={styles.battle} aria-label="1대1 뿌요뿌요 경기">
    <div className={styles.topbar}><span className={styles.round}>MATCH {match.id.slice(1)}</span><strong className={seconds <= 20 ? styles.urgent : styles.timer}>{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}</strong><button onClick={() => { sound.unlock(); sound.setMuted(!sound.muted); }} aria-label={sound.muted ? "소리 켜기" : "소리 끄기"}>{sound.muted ? "소리 꺼짐" : "♪ 소리 켜짐"}</button></div>
    {config.realtime && !liveHealthy && !match.result && <p className={styles.error} role="status">실시간 연결을 확인하고 있어요. 저장된 경기 상태로 연결을 유지합니다.</p>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    <div className={styles.boards}>
      <div className={styles.mine}><PuyoBoard state={view} name={me?.name ?? "나"} status={paused ? result ? "최종 결과가 나왔어요" : view.phase === "over" ? "최종 결과를 확인하고 있어요" : seconds <= 0 ? "시간이 종료되었어요" : "시작을 기다려요" : "방향키 · Z / X 회전 · Space 낙하"} /><Controls action={action} disabled={paused} unlock={sound.unlock} /></div>
      <div className={styles.vs} aria-hidden="true">VS<span>✦</span></div>
      <div className={styles.theirs}><PuyoBoard state={opponent?.state ?? createState(match.seed)} name={other?.name ?? "상대"} opponent status={result ? "경기가 종료되었어요" : opponent && now - opponent.at > 8000 && !result ? "상대의 연결을 확인하고 있어요" : undefined} /><p className={styles.tip}>4개를 모으면 POP!<br />연쇄로 방해뿌요를 보내세요.</p></div>
      {countdown > 0 && <div className={styles.countdown} role="status"><span>준비됐나요?</span><strong>{countdown > 3 ? "READY" : countdown}</strong><small>같은 순서의 뿌요로 시작해요</small></div>}
      {result && <div className={styles.result} role="status"><span>{result.winner === null ? "멋진 승부였어요" : result.winner === uid ? "연쇄의 주인공!" : "다음 경기도 도전해요"}</span><strong>{result.winner === null ? "DRAW" : result.winner === uid ? "YOU WIN!" : "GOOD GAME"}</strong><p>{result.scores[uid]?.toLocaleString()} : {result.scores[opponentId!]?.toLocaleString()}</p>{result.reward?.uid === uid && <span className={styles.reward}>승리 보상 +{result.reward.xp} XP 지급 완료!</span>}</div>}
      {!result && seconds <= 0 && <div className={styles.result} role="status"><strong>TIME UP!</strong><p>최종 점수를 확인하고 있어요…</p></div>}
    </div>
  </section>;
}

export function PuyoPractice() {
  const state = useRef(createState(2741));
  const [view, setView] = useState(() => createState(2741));
  const [running, setRunning] = useState(false);
  const sound = useSound(); const soundRef = useRef(sound);
  useEffect(() => { soundRef.current = sound; }, [sound]);
  useEffect(() => {
    if (!running) return;
    let frame = 0; let prev = performance.now(); let lastEvent = state.current.event;
    const loop = (now: number) => {
      tick(state.current, Math.min(100, now - prev)); prev = now;
      if (lastEvent !== state.current.event) { lastEvent = state.current.event; if (["clear", "attack", "allclear"].includes(state.current.effect)) soundRef.current.play(state.current.chain); }
      setView(cloneState(state.current)); frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop); return () => cancelAnimationFrame(frame);
  }, [running]);
  const action = useCallback((a: Action) => { if (running) { input(state.current, a); setView(cloneState(state.current)); } }, [running]);
  return <div className={styles.practice}>
    <PuyoBoard state={view} name="나의 연습 보드" status="연습 점수는 학급 경기에 반영되지 않아요" />
    <Controls action={action} disabled={!running || view.phase === "over"} unlock={sound.unlock} />
    <button className={styles.practiceStart} onClick={() => { sound.unlock(); state.current = createState(Math.floor(Math.random() * 2147483646) + 1); setView(cloneState(state.current)); setRunning(true); }}>{!running ? "연습 시작" : "새로 연습하기"}</button>
    <p className={styles.tip}>← → 이동 · ↓ 빠르게 · Z / X 회전 · Space 바로 낙하</p>
  </div>;
}
