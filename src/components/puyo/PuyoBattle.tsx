"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import { createPortal } from "react-dom";
import { cloneState, createState, input, receive, revive, tick, type Action, type PuyoState } from "@/lib/puyo-engine";
import { finishPuyo, readPuyoSeq, savePuyoRun, type PuyoConfig, type PuyoRun } from "@/lib/puyo";
import { getPuyoLive, watchPuyoConnection, watchPuyoLive, savePuyoLive, PUYO_LIVE_INTERVAL_MS } from "@/lib/puyo-realtime";
import { cachePuyo, restorePuyo, PuyoPublisher, PUYO_SYNC_INTERVAL_MS } from "@/lib/puyo-sync";
import { normalizeRules } from "@/lib/puyo-rules";
import { Icon } from "@/components/Icon";
import { PuyoBoard } from "./PuyoBoard";
import { PuyoRulesButton } from "./PuyoRulebook";
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

const BUTTONS: { a: Action; icon: string; label: string; key: string }[] = [
  { a: "left", icon: "chevron_left", label: "왼쪽", key: "←" },
  { a: "down", icon: "keyboard_arrow_down", label: "빨리", key: "↓" },
  { a: "right", icon: "chevron_right", label: "오른쪽", key: "→" },
  { a: "ccw", icon: "rotate_left", label: "왼쪽 돌리기", key: "Z" },
  { a: "cw", icon: "rotate_right", label: "오른쪽 돌리기", key: "X" },
  { a: "drop", icon: "vertical_align_bottom", label: "바로 내리기", key: "Space" },
];

/** 조작판 — 이동(← ↓ →)과 회전·낙하를 양손 묶음으로. 키보드도 그대로 쓴다. */
function Controls({ action, disabled, unlock, layout }: { action: (a: Action) => void; disabled: boolean; unlock: () => void; layout: "row" | "pad" }) {
  const repeat = useRef<ReturnType<typeof setInterval> | null>(null);
  const stop = useCallback(() => { if (repeat.current) clearInterval(repeat.current); repeat.current = null; }, []);
  useEffect(() => {
    const keys: Record<string, Action> = { ArrowLeft: "left", ArrowRight: "right", ArrowDown: "down", ArrowUp: "cw", KeyX: "cw", KeyZ: "ccw", Space: "drop" };
    const keydown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && (e.target.isContentEditable || /INPUT|SELECT|TEXTAREA/.test(e.target.tagName))) return;
      // 규칙 보기 대화상자가 열려 있으면 뒤의 보드를 움직이지 않는다.
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      const a = keys[e.code]; if (!a) return; e.preventDefault();
      if (disabled || (e.repeat && ["cw", "ccw", "drop"].includes(a))) return;
      unlock(); action(a);
    };
    window.addEventListener("keydown", keydown); window.addEventListener("blur", stop);
    return () => { window.removeEventListener("keydown", keydown); window.removeEventListener("blur", stop); stop(); };
  }, [action, disabled, unlock, stop]);
  return <div className={`${styles.controls} ${layout === "pad" ? styles.controlsPad : styles.controlsRow}`} aria-label="뿌요 조작">
    {BUTTONS.map(({ a, icon, label, key }) => <button key={a} type="button" aria-label={`${label} (${key})`} title={`${label} · ${key}`} disabled={disabled}
      className={`${styles.control} ${a === "drop" ? styles.drop : ["ccw", "cw"].includes(a) ? styles.rotate : ""}`}
      onPointerDown={e => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); stop(); unlock(); action(a); if (["left", "right", "down"].includes(a)) repeat.current = setInterval(() => action(a), 120); }}
      onPointerUp={stop} onPointerCancel={stop} onLostPointerCapture={stop}
      onClick={e => { if (e.detail === 0) { unlock(); action(a); } }}>
      <Icon name={icon} size={30} weight={600} />
      <span>{label}</span>
    </button>)}
  </div>;
}

/**
 * 경기장 크기 맞추기 — 화면 높이를 최대한 보드에 쓴다.
 * 넓은 화면: [내 보드 | 상대 보드 + 조작판], 좁은 화면: [내 보드 | 상대 미니] + 아래 큰 조작판.
 */
function useArenaFit(ref: RefObject<HTMLElement | null>, mounted: boolean) {
  const [fit, setFit] = useState({ wide: true, mine: 420, theirs: 220 });
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const measure = () => {
      const W = el.clientWidth; const H = el.clientHeight;
      const wide = W >= 820;
      // 보드 높이 bh → 내 보드 묶음 폭 ≈ 0.67bh + 32(보드 0.5 + 옆 정보 0.17), 상대 미니 폭 ≈ 상대bh/2 + 20.
      // 넓은 화면: 옆 칸 300 + 간격 32 + 여백 32 / 좁은 화면: 상대bh = 0.42bh, 간격 10 + 여백 16.
      const mineByH = H - 28;
      const mine = wide ? Math.min(mineByH, (W - 32 - 300 - 32 - 32) / 0.67) : Math.min(mineByH, (W - 32 - 20 - 10 - 16) / (0.67 + 0.21));
      const m = Math.max(220, Math.floor(mine));
      setFit({ wide, mine: m, theirs: Math.max(150, Math.floor(wide ? Math.min(m * .55, H - 300) : m * .42)) });
    };
    measure();
    const ro = new ResizeObserver(measure); ro.observe(el);
    return () => ro.disconnect();
  }, [ref, mounted]);
  return fit;
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
  const arena = useRef<HTMLElement>(null);
  const [view, setView] = useState<PuyoState | null>(null);
  const [error, setError] = useState("");
  const [now, setNow] = useState(0);
  // 경기 중에는 전체 화면. '대진표 보기'로 잠시 내려 두고 다시 열 수 있다.
  const [full, setFull] = useState(true);
  const fit = useArenaFit(arena, full && !!view);
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
      const live = !!s && !m?.result && time >= (c.startsAt ?? Infinity) && time < (c.endsAt ?? 0);
      if (s && live) {
        tick(s, Math.min(100, at - previous));
        // 학급 대전은 보드가 꽉 차도 끝나지 않는다 — 같은 프레임 안에서 판을 비우고 이어 간다
        // (패배 상태가 저장·전송되기 전에 되살리므로 서버는 경기를 끝내지 않는다).
        if (s.phase === "over") revive(s);
      }
      previous = at;
      if (at - draw > 32) {
        setNow(time); if (s) setView(cloneState(s)); draw = at;
        if (s && s.event !== lastEvent) {
          lastEvent = s.event;
          if (["clear", "attack", "allclear", "garbage", "revive"].includes(s.effect)) { publisher.current?.request(true); livePublisher.current?.request(true); }
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
      error: () => {
        // 저장 순번이 어긋나면(다른 탭·재접속) 서버 값으로 맞춰 다음 저장부터 다시 통과시킨다.
        void readPuyoSeq(cid, gid, uid).then(seq => queue.resync(seq)).catch(() => {});
        setError("연결을 확인하고 있어요. 같은 경기를 여러 탭에서 열었다면 하나만 남겨 주세요.");
      },
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
  // 전체 화면일 때 뒤 페이지가 스크롤되지 않게
  useEffect(() => {
    if (!full) return;
    const prev = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [full]);

  if (!match || !view) return <p className={styles.loading}>경기 보드를 준비하고 있어요…</p>;
  const seconds = Math.max(0, Math.ceil(((config.endsAt ?? 0) - now) / 1000));
  const countdown = now ? Math.ceil(((config.startsAt ?? 0) - now) / 1000) : 6;
  const result = match.result;
  const paused = countdown > 0 || seconds <= 0 || !!result;
  const oppState = opponent?.state ?? createState(match.seed);
  const myScore = result?.scores[uid] ?? view.score;
  const theirScore = result?.scores[opponentId!] ?? oppState.score;
  const stage = countdown > 0 ? "ready" : result ? "reward" : "battle";
  const away = !result && opponent && now - opponent.at > 8000;

  if (!full) return <div className={styles.minimized}>
    <div><strong>{result ? "경기가 끝났어요" : "경기 중이에요"}</strong><span>{me?.name ?? "나"} {myScore.toLocaleString("ko-KR")} : {theirScore.toLocaleString("ko-KR")} {other?.name ?? "상대"}</span></div>
    <button type="button" className={styles.primaryBtn} onClick={() => setFull(true)}><Icon name="open_in_full" size={18} />경기 화면 열기</button>
  </div>;

  return createPortal(<div className={styles.stage} role="region" aria-label="1대1 뿌요뿌요 경기">
    <header className={styles.bar}>
      <button type="button" className={styles.iconBtn} onClick={() => setFull(false)} aria-label="대진표 보기"><Icon name="arrow_back" size={22} /><span className={styles.hideSm}>대진표</span></button>
      <div className={styles.scoreLine} aria-live="polite">
        <span className={styles.who}><b>{me?.name ?? "나"}</b><em>{myScore.toLocaleString("ko-KR")}</em></span>
        <span className={`${styles.clock} ${seconds <= 20 && !result ? styles.urgent : ""}`}>{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}</span>
        <span className={`${styles.who} ${styles.whoThem}`}><em>{theirScore.toLocaleString("ko-KR")}</em><b>{other?.name ?? "상대"}</b></span>
      </div>
      <div className={styles.barActions}>
        <PuyoRulesButton rules={normalizeRules(config)} current={stage} label="규칙" className={styles.chipBtn} />
        <button type="button" className={styles.chipBtn} onClick={() => { sound.unlock(); sound.setMuted(!sound.muted); }} aria-label={sound.muted ? "소리 켜기" : "소리 끄기"}><Icon name={sound.muted ? "volume_off" : "volume_up"} size={20} /></button>
      </div>
    </header>
    {(error || (config.realtime && !liveHealthy && !result)) && <p className={styles.notice} role="status">{error || "실시간 연결을 다시 잇는 중이에요. 게임은 그대로 계속돼요."}</p>}

    <main ref={arena} className={`${styles.arena} ${fit.wide ? styles.arenaWide : styles.arenaNarrow}`}>
      <div className={styles.mine} style={{ "--bh": `${fit.mine}px` } as CSSProperties}>
        <PuyoBoard state={view} name={me?.name ?? "나"} fill />
      </div>
      <aside className={styles.side}>
        <div className={styles.theirs} style={{ "--bh": `${fit.theirs}px` } as CSSProperties}>
          <span className={styles.sideLabel}>{other?.name ?? "상대"}{away ? " · 연결 확인 중" : ""}</span>
          <PuyoBoard state={oppState} name={other?.name ?? "상대"} opponent fill />
        </div>
        {fit.wide && <Controls action={action} disabled={paused} unlock={sound.unlock} layout="pad" />}
        {fit.wide && <p className={styles.keys}>← → 이동 · ↓ 빨리 · Z / X 돌리기 · Space 바로 내리기</p>}
      </aside>
    </main>
    {!fit.wide && <footer className={styles.padBar}><Controls action={action} disabled={paused} unlock={sound.unlock} layout="row" /></footer>}

    {countdown > 0 && <div className={styles.overlay} role="status"><div className={styles.card}><span>준비됐나요?</span><strong>{countdown > 3 ? "READY" : countdown}</strong><small>짝꿍과 똑같은 순서로 뿌요가 나와요</small></div></div>}
    {!result && countdown <= 0 && seconds <= 0 && <div className={styles.overlay} role="status"><div className={styles.card}><strong>TIME UP!</strong><small>최종 점수를 확인하고 있어요…</small></div></div>}
    {result && <div className={styles.overlay} role="status"><div className={styles.card}>
      <span>{result.winner === null ? "멋진 승부였어요" : result.winner === uid ? "연쇄의 주인공!" : "끝까지 잘했어요"}</span>
      <strong>{result.winner === null ? "DRAW" : result.winner === uid ? "YOU WIN!" : "GOOD GAME"}</strong>
      <p className={styles.final}>{(result.scores[uid] ?? 0).toLocaleString("ko-KR")} : {(result.scores[opponentId!] ?? 0).toLocaleString("ko-KR")}</p>
      {result.reward?.uid === uid && <span className={styles.reward}>승리 보상 +{result.reward.xp} XP 받았어요!</span>}
      <button type="button" className={styles.primaryBtn} onClick={() => setFull(false)}><Icon name="leaderboard" size={18} />대진표 보기</button>
    </div></div>}
  </div>, document.body);
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
    <Controls action={action} disabled={!running || view.phase === "over"} unlock={sound.unlock} layout="row" />
    <button type="button" className={styles.primaryBtn} onClick={() => { sound.unlock(); state.current = createState(Math.floor(Math.random() * 2147483646) + 1); setView(cloneState(state.current)); setRunning(true); }}><Icon name={running ? "restart_alt" : "play_arrow"} size={18} />{!running ? "연습 시작" : "새로 연습하기"}</button>
  </div>;
}
