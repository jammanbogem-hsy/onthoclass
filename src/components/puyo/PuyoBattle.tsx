"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import { createPortal } from "react-dom";
import { cloneState, createState, input, receive, revive, tick, type Action, type Cell, type PuyoState } from "@/lib/puyo-engine";
import { finishPuyo, readPuyoSeq, savePuyoRun, type PuyoConfig, type PuyoRun } from "@/lib/puyo";
import { getPuyoLive, watchPuyoConnection, watchPuyoLive, savePuyoLive, PUYO_LIVE_INTERVAL_MS } from "@/lib/puyo-realtime";
import { cachePuyo, restorePuyo, PuyoPublisher, PUYO_SYNC_INTERVAL_MS } from "@/lib/puyo-sync";
import { normalizeRules, type FlowStage, type PuyoRules } from "@/lib/puyo-rules";
import { Icon } from "@/components/Icon";
import { PuyoBoard, Sprite } from "./PuyoBoard";
import { PuyoRulesButton } from "./PuyoRulebook";
import styles from "./PuyoBattle.module.css";

export function useSound() {
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
 * arcade(가로 640 이상): [내 보드 | 가운데 칸 | 상대 보드] 두 보드 같은 크기(실제 뿌요뿌요 배치).
 * narrow(휴대폰 세로): [내 보드 | 상대 미니] + 아래 큰 조작판.
 */
function useArenaFit(ref: RefObject<HTMLElement | null>, mounted: boolean) {
  const [fit, setFit] = useState({ arcade: true, mine: 420, theirs: 420, center: 200 });
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const measure = () => {
      const W = el.clientWidth; const H = el.clientHeight;
      const arcade = W >= 640;
      if (arcade) {
        // 보드 묶음 폭 = bh/2 + 16, 위 방해 예고 줄 ≈ bh/12*0.7 + 4
        const center = Math.round(Math.max(150, Math.min(240, W * .2)));
        const byH = (H - 30) / 1.06;
        const byW = W - center - 2 * 32 - 2 * 14 - 24;
        const bh = Math.max(240, Math.floor(Math.min(byH, byW)));
        setFit({ arcade, mine: bh, theirs: bh, center });
      } else {
        const mine = Math.min(H - 28, (W - 32 - 20 - 10 - 16) / (0.67 + 0.21));
        const m = Math.max(220, Math.floor(mine));
        setFit({ arcade, mine: m, theirs: Math.max(150, Math.floor(m * .42)), center: 0 });
      }
    };
    measure();
    const ro = new ResizeObserver(measure); ro.observe(el);
    return () => ro.disconnect();
  }, [ref, mounted]);
  return fit;
}

/** 터치 기기면 화면 조작판을 보여 준다(키보드가 있는 노트북은 키 안내만). */
function useCoarsePointer() {
  const [coarse, setCoarse] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse)");
    const update = () => setCoarse(mq.matches);
    update(); mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return coarse;
}

type Orb = { id: number; x1: number; y1: number; x2: number; y2: number; big: boolean; theirs: boolean };
/** 공격 구슬 — 연쇄 공격이 상대 보드로 날아가는 연출. 화면 좌표로 그려서 두 보드 사이를 가로지른다. */
function useAttackOrbs(stage: RefObject<HTMLElement | null>, mine: RefObject<HTMLElement | null>, theirs: RefObject<HTMLElement | null>) {
  const [orbs, setOrbs] = useState<Orb[]>([]);
  const seq = useRef(0);
  const fire = useCallback((fromMine: boolean, chain: number) => {
    const s = stage.current?.getBoundingClientRect(); const a = mine.current?.getBoundingClientRect(); const b = theirs.current?.getBoundingClientRect();
    if (!s || !a || !b) return;
    const [from, to] = fromMine ? [a, b] : [b, a];
    const count = Math.min(5, Math.max(1, chain - 1));
    const made: Orb[] = Array.from({ length: count }, (_, k) => ({
      id: ++seq.current,
      x1: from.left + from.width / 2 - s.left + (k - count / 2) * 14, y1: from.top + from.height * .45 - s.top,
      x2: to.left + to.width / 2 - s.left, y2: to.top + 18 - s.top, big: chain >= 4, theirs: !fromMine,
    }));
    setOrbs(o => [...o, ...made]);
    setTimeout(() => setOrbs(o => o.filter(x => !made.includes(x))), 900);
  }, [stage, mine, theirs]);
  return { orbs, fire };
}

const PORTRAITS = ["charmander", "squirtle", "gengar", "snorlax"];

/** 가운데 칸 — NEXT·시간·점수·내 캐릭터(연쇄하면 뛰고, 방해 받으면 흔들린다). */
function CenterPanel({ view, opp, meName, oppName, myScore, theirScore, seconds, done, mineIndex, keysHint }: {
  view: PuyoState; opp: PuyoState; meName: string; oppName: string; myScore: number; theirScore: number;
  seconds: number; done: boolean; mineIndex: number; keysHint: boolean;
}) {
  const reacting = view.effect === "attack" || view.effect === "clear" || view.effect === "allclear" ? "cheer" : view.effect === "garbage" ? "hit" : view.effect === "revive" ? "hit" : "";
  const pair = (cells: number[], at: number, small = false) => <div className={`${styles.nextPair} ${small ? styles.nextSmall : ""}`}>
    <Sprite color={(cells[at + 1] || 0) as Cell} /><Sprite color={(cells[at] || 0) as Cell} />
  </div>;
  return <div className={styles.center}>
    <div className={styles.nextCard}>
      <span className={styles.label}>NEXT</span>
      <div className={styles.nextRow}>
        <div className={styles.nextMine}>{pair(view.next, 0)}{pair(view.next, 2, true)}</div>
        <div className={styles.nextTheirs}>{pair(opp.next, 0, true)}</div>
      </div>
    </div>
    <div className={`${styles.timeCard} ${seconds <= 20 && !done ? styles.urgent : ""}`}><span className={styles.label}>TIME</span><strong>{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}</strong></div>
    <div className={styles.portrait}>
      <div key={reacting ? view.event : "idle"} className={`${styles.hero} ${reacting === "cheer" ? styles.heroCheer : reacting === "hit" ? styles.heroHit : ""}`}>
        {/* 로컬 SVG 캐릭터 */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/puyo/assets/${PORTRAITS[mineIndex % 4]}.svg`} alt="" draggable={false} />
      </div>
      {reacting === "cheer" && view.chain >= 2 && <span key={`b${view.event}`} className={styles.bubble}>{view.chain}연쇄!</span>}
      {reacting === "hit" && view.effect === "garbage" && <span key={`h${view.event}`} className={`${styles.bubble} ${styles.bubbleHit}`}>으앗!</span>}
    </div>
    <div className={styles.scores}>
      <div className={styles.scoreMine}><span>{meName}</span><strong>{myScore.toLocaleString("ko-KR")}</strong></div>
      <div className={styles.scoreTheirs}><span>{oppName}</span><strong>{theirScore.toLocaleString("ko-KR")}</strong></div>
    </div>
    <dl className={styles.stats}>
      <div><dt>최고 연쇄</dt><dd>{view.maxChain}</dd></div>
      <div><dt>다시 시작</dt><dd>{view.downs ?? 0}</dd></div>
    </dl>
    {keysHint && <p className={styles.keys}>← → 이동 · ↓ 빨리<br />Z / X 돌리기 · Space 내리기</p>}
  </div>;
}

export type StageResult = { title: string; headline: string; score: string; reward?: string };
type Sound = ReturnType<typeof useSound>;

/**
 * 전체 화면 경기장 — 학급 대전·자유 대전이 함께 쓰는 화면(동기화·저장은 부르는 쪽이 맡는다).
 * 아케이드 배치/좁은 화면 배치, 공격 구슬, 준비·종료 카드까지 그린다.
 */
export function BattleStage({ view, oppState, meName, oppName, myScore, theirScore, seconds, countdown, result, away, notice, rules, flow, mineIndex, action, sound, onBack, backLabel, resultAction }: {
  view: PuyoState; oppState: PuyoState; meName: string; oppName: string; myScore: number; theirScore: number;
  seconds: number; countdown: number; result: StageResult | null; away?: boolean; notice?: string;
  rules?: PuyoRules; flow?: FlowStage; mineIndex: number; action: (a: Action) => void; sound: Sound;
  onBack: () => void; backLabel: string; resultAction: { label: string; icon: string; onClick: () => void };
}) {
  const arena = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const mineRef = useRef<HTMLDivElement>(null);
  const theirsRef = useRef<HTMLDivElement>(null);
  const coarse = useCoarsePointer();
  const orbs = useAttackOrbs(stageRef, mineRef, theirsRef);
  const fit = useArenaFit(arena, true);
  const paused = countdown > 0 || seconds <= 0 || !!result;

  // 공격 구슬: 내 연쇄 공격 / 상대 연쇄 공격 이벤트가 새로 생길 때
  const lastMine = useRef(-1); const lastTheirs = useRef(-1);
  const fireOrbs = orbs.fire;
  useEffect(() => {
    if (lastMine.current !== -1 && view.event !== lastMine.current && view.effect === "attack") fireOrbs(true, view.chain);
    lastMine.current = view.event;
  }, [view, fireOrbs]);
  useEffect(() => {
    if (lastTheirs.current !== -1 && oppState.event !== lastTheirs.current && oppState.effect === "attack") fireOrbs(false, oppState.chain);
    lastTheirs.current = oppState.event;
  }, [oppState, fireOrbs]);
  // 전체 화면일 때 뒤 페이지가 스크롤되지 않게
  useEffect(() => {
    const prev = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);
  const showPad = !fit.arcade || coarse;

  return createPortal(<div ref={stageRef} className={styles.stage} role="region" aria-label="1대1 뿌요뿌요 경기">
    <header className={styles.bar}>
      <button type="button" className={styles.iconBtn} onClick={onBack} aria-label={backLabel}><Icon name="arrow_back" size={22} /><span className={styles.hideSm}>{backLabel}</span></button>
      {fit.arcade ? <div className={styles.barTitle}><strong>{meName}</strong><span>VS</span><strong>{oppName}</strong>{away && <em>상대 연결 확인 중</em>}</div>
        : <div className={styles.scoreLine} aria-live="polite">
          <span className={styles.who}><b>{meName}</b><em>{myScore.toLocaleString("ko-KR")}</em></span>
          <span className={`${styles.clock} ${seconds <= 20 && !result ? styles.urgent : ""}`}>{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}</span>
          <span className={`${styles.who} ${styles.whoThem}`}><em>{theirScore.toLocaleString("ko-KR")}</em><b>{oppName}</b></span>
        </div>}
      <div className={styles.barActions}>
        {rules && <PuyoRulesButton rules={rules} current={flow} label="규칙" className={styles.chipBtn} />}
        <button type="button" className={styles.chipBtn} onClick={() => { sound.unlock(); sound.setMuted(!sound.muted); }} aria-label={sound.muted ? "소리 켜기" : "소리 끄기"}><Icon name={sound.muted ? "volume_off" : "volume_up"} size={20} /></button>
      </div>
    </header>
    {notice && <p className={styles.notice} role="status">{notice}</p>}

    {fit.arcade ? <main ref={arena} className={`${styles.arena} ${styles.arenaArcade}`}>
      <div ref={mineRef} className={styles.mine} style={{ "--bh": `${fit.mine}px` } as CSSProperties}>
        <PuyoBoard state={view} name={meName} arcade />
      </div>
      <div style={{ width: fit.center }} className={styles.centerWrap}>
        <CenterPanel view={view} opp={oppState} meName={meName} oppName={oppName} myScore={myScore} theirScore={theirScore} seconds={seconds} done={!!result} mineIndex={mineIndex} keysHint={!coarse} />
      </div>
      <div ref={theirsRef} className={styles.theirs} style={{ "--bh": `${fit.theirs}px` } as CSSProperties}>
        <PuyoBoard state={oppState} name={oppName} opponent arcade />
      </div>
    </main> : <main ref={arena} className={`${styles.arena} ${styles.arenaNarrow}`}>
      <div ref={mineRef} className={styles.mine} style={{ "--bh": `${fit.mine}px` } as CSSProperties}>
        <PuyoBoard state={view} name={meName} fill />
      </div>
      <aside className={styles.side}>
        <div ref={theirsRef} className={styles.theirs} style={{ "--bh": `${fit.theirs}px` } as CSSProperties}>
          <span className={styles.sideLabel}>{oppName}{away ? " · 연결 확인 중" : ""}</span>
          <PuyoBoard state={oppState} name={oppName} opponent fill />
        </div>
      </aside>
    </main>}
    {showPad && <footer className={styles.padBar}><Controls action={action} disabled={paused} unlock={sound.unlock} layout="row" /></footer>}

    {orbs.orbs.map(o => <i key={o.id} className={`${styles.orb} ${o.big ? styles.orbBig : ""} ${o.theirs ? styles.orbTheirs : ""}`} style={{ "--x1": `${o.x1}px`, "--y1": `${o.y1}px`, "--x2": `${o.x2}px`, "--y2": `${o.y2}px` } as CSSProperties} aria-hidden="true" />)}

    {countdown > 0 && <div className={styles.overlay} role="status"><div className={styles.card}><span>준비됐나요?</span><strong>{countdown > 3 ? "READY" : countdown}</strong><small>짝꿍과 똑같은 순서로 뿌요가 나와요</small></div></div>}
    {!result && countdown <= 0 && seconds <= 0 && <div className={styles.overlay} role="status"><div className={styles.card}><strong>TIME UP!</strong><small>최종 점수를 확인하고 있어요…</small></div></div>}
    {result && <div className={styles.overlay} role="status"><div className={styles.card}>
      <span>{result.title}</span>
      <strong>{result.headline}</strong>
      <p className={styles.final}>{result.score}</p>
      {result.reward && <span className={styles.reward}>{result.reward}</span>}
      <button type="button" className={styles.primaryBtn} onClick={resultAction.onClick}><Icon name={resultAction.icon} size={18} />{resultAction.label}</button>
    </div></div>}
  </div>, document.body);
}

/** 결과 카드 문구 — 이긴 쪽/진 쪽/무승부. */
export function stageResult(winner: string | null, uid: string, mine: number, theirs: number, reward?: string): StageResult {
  return {
    title: winner === null ? "멋진 승부였어요" : winner === uid ? "연쇄의 주인공!" : "끝까지 잘했어요",
    headline: winner === null ? "DRAW" : winner === uid ? "YOU WIN!" : "GOOD GAME",
    score: `${mine.toLocaleString("ko-KR")} : ${theirs.toLocaleString("ko-KR")}`,
    reward,
  };
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
  const [view, setView] = useState<PuyoState | null>(null);
  const [error, setError] = useState("");
  const [now, setNow] = useState(0);
  // 경기 중에는 전체 화면. '대진표 보기'로 잠시 내려 두고 다시 열 수 있다.
  const [full, setFull] = useState(true);
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

  if (!match || !view) return <p className={styles.loading}>경기 보드를 준비하고 있어요…</p>;
  const seconds = Math.max(0, Math.ceil(((config.endsAt ?? 0) - now) / 1000));
  const countdown = now ? Math.ceil(((config.startsAt ?? 0) - now) / 1000) : 6;
  const result = match.result;
  const oppState = opponent?.state ?? createState(match.seed);
  const myScore = result?.scores[uid] ?? view.score;
  const theirScore = result?.scores[opponentId!] ?? oppState.score;
  const stage = countdown > 0 ? "ready" : result ? "reward" : "battle";
  const away = !result && opponent && now - opponent.at > 8000;

  if (!full) return <div className={styles.minimized}>
    <div><strong>{result ? "경기가 끝났어요" : "경기 중이에요"}</strong><span>{me?.name ?? "나"} {myScore.toLocaleString("ko-KR")} : {theirScore.toLocaleString("ko-KR")} {other?.name ?? "상대"}</span></div>
    <button type="button" className={styles.primaryBtn} onClick={() => setFull(true)}><Icon name="open_in_full" size={18} />경기 화면 열기</button>
  </div>;

  return <BattleStage view={view} oppState={oppState} meName={me?.name ?? "나"} oppName={other?.name ?? "상대"} myScore={myScore} theirScore={theirScore}
    seconds={seconds} countdown={countdown} away={!!away} rules={normalizeRules(config)} flow={stage} mineIndex={match.a === uid ? 0 : 1}
    notice={error || (config.realtime && !liveHealthy && !result ? "실시간 연결을 다시 잇는 중이에요. 게임은 그대로 계속돼요." : undefined)}
    result={result ? stageResult(result.winner, uid, result.scores[uid] ?? 0, result.scores[opponentId!] ?? 0, result.reward?.uid === uid ? `승리 보상 +${result.reward.xp} XP 받았어요!` : undefined) : null}
    action={action} sound={sound} onBack={() => setFull(false)} backLabel="대진표" resultAction={{ label: "대진표 보기", icon: "leaderboard", onClick: () => setFull(false) }} />;
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
