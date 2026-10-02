"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type RefObject } from "react";
import { createPortal } from "react-dom";
import { cloneState, createState, input, receive, revive, tick, type Action, type Cell, type PuyoState } from "@/lib/puyo-engine";
import { finishPuyo, readPuyoSeq, savePuyoRun, type PuyoConfig, type PuyoRun } from "@/lib/puyo";
import { getPuyoLive, watchPuyoConnection, watchPuyoLive, savePuyoLive, PUYO_LIVE_INTERVAL_MS } from "@/lib/puyo-realtime";
import { cachePuyo, restorePuyo, PuyoPublisher, PUYO_SYNC_INTERVAL_MS, startLiveTicker } from "@/lib/puyo-sync";
import { normalizeRules, type FlowStage, type PuyoRules } from "@/lib/puyo-rules";
import { Icon } from "@/components/Icon";
import { PuyoBoard, Puyo } from "./PuyoBoard";
import { pickTheme, playerPalette } from "@/lib/puyo-themes";
import { PuyoRulesButton } from "./PuyoRulebook";
import styles from "./PuyoBattle.module.css";
import { PuyoBgm } from "@/lib/puyo-bgm";

const MUSIC_KEY = "jam:puyo:music";
// 저장소를 못 쓰는 기기(사생활 보호 창 등)에서도 이번 방문 동안은 선택이 유지되게 메모리에 같이 둔다
let musicFallback = true;
const musicListeners = new Set<() => void>();
function subscribeMusic(f: () => void) { musicListeners.add(f); return () => { musicListeners.delete(f); }; }
function readMusic() { try { const v = localStorage.getItem(MUSIC_KEY); return v ? v !== "off" : musicFallback; } catch { return musicFallback; } }

export function useSound() {
  const [muted, setMuted] = useState(false);
  // 배경음악 켬/끔은 기기마다 기억한다(효과음과 따로)
  const music = useSyncExternalStore(subscribeMusic, readMusic, () => true);
  const [ready, setReady] = useState(false);
  const ctx = useRef<AudioContext | null>(null);
  const bgm = useRef<PuyoBgm | null>(null);
  const setMusic = useCallback((on: boolean) => {
    try { localStorage.setItem(MUSIC_KEY, on ? "on" : "off"); } catch { /* 기억만 못 할 뿐 */ }
    musicFallback = on; musicListeners.forEach(f => f());
  }, []);
  const unlock = useCallback(() => {
    if (!ctx.current) ctx.current = new AudioContext();
    void ctx.current.resume().then(() => setReady(true));
  }, []);
  /** 경기가 진행 중일 때만 음악을 튼다(카운트다운·결과 화면·연습 대기에서는 멈춤). */
  const setPlaying = useCallback((on: boolean) => {
    const audio = ctx.current;
    if (on && audio && audio.state === "running") {
      bgm.current ??= new PuyoBgm(audio);
      bgm.current.start();
    } else bgm.current?.stop();
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
  useEffect(() => () => { bgm.current?.stop(); bgm.current = null; void ctx.current?.close(); ctx.current = null; }, []);
  return { muted, setMuted, music, setMusic, ready, setPlaying, unlock, play };
}

/** 배경음악 — active(경기 진행 중)이고 음악·소리가 켜져 있을 때만 흐른다. */
export function useBgm(sound: ReturnType<typeof useSound>, active: boolean) {
  const { setPlaying, music, muted, ready } = sound;
  useEffect(() => {
    setPlaying(active && music && !muted && ready);
    return () => setPlaying(false);
  }, [setPlaying, active, music, muted, ready]);
}

/** 음악 켬/끔 버튼 */
export function MusicButton({ sound, className }: { sound: ReturnType<typeof useSound>; className?: string }) {
  return <button type="button" className={className} onClick={() => { sound.unlock(); sound.setMusic(!sound.music); }} aria-pressed={sound.music} aria-label={sound.music ? "배경음악 끄기" : "배경음악 켜기"} title={sound.music ? "배경음악 끄기" : "배경음악 켜기"}><Icon name={sound.music ? "music_note" : "music_off"} size={20} /></button>;
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
/**
 * 키보드 조작 — 방향키 ← → 이동, ↓ 빨리, ↑ 돌리기, Z/X 돌리기, Space 바로 내리기.
 * 화면 조작판이 숨겨진 노트북 화면에서도 동작하도록 경기 화면 쪽에 붙인다(조작판과 따로).
 */
function useKeyboard(action: (a: Action) => void, disabled: boolean, unlock: () => void) {
  useEffect(() => {
    const keys: Record<string, Action> = { ArrowLeft: "left", ArrowRight: "right", ArrowDown: "down", ArrowUp: "cw", KeyX: "cw", KeyZ: "ccw", Space: "drop" };
    const keydown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && (e.target.isContentEditable || /INPUT|SELECT|TEXTAREA/.test(e.target.tagName))) return;
      // 규칙 보기 대화상자가 열려 있으면 뒤의 보드를 움직이지 않는다.
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      const a = keys[e.code]; if (!a || disabled) return;
      // 페이지 스크롤·포커스된 버튼 눌림(Space)을 막는다
      e.preventDefault();
      if (e.repeat && ["cw", "ccw", "drop"].includes(a)) return;
      unlock(); action(a);
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [action, disabled, unlock]);
}

function Controls({ action, disabled, unlock, layout }: { action: (a: Action) => void; disabled: boolean; unlock: () => void; layout: "row" | "pad" }) {
  const repeat = useRef<ReturnType<typeof setInterval> | null>(null);
  const stop = useCallback(() => { if (repeat.current) clearInterval(repeat.current); repeat.current = null; }, []);
  useEffect(() => { window.addEventListener("blur", stop); return () => { window.removeEventListener("blur", stop); stop(); }; }, [stop]);
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
 * 1:1 arcade(가로 640 이상): [내 보드 | 가운데 칸 | 상대 보드] 두 보드 같은 크기(실제 뿌요뿌요 배치).
 * 3~4명(minis ≥ 2): [내 보드 | 가운데 칸 | 친구 보드 세로로 작게].
 * narrow(휴대폰 세로): [내 보드 | 상대(들) 작게] + 아래 큰 조작판.
 */
function useArenaFit(ref: RefObject<HTMLElement | null>, mounted: boolean, minis = 1) {
  const [fit, setFit] = useState({ arcade: true, mine: 420, theirs: 420, center: 200 });
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const measure = () => {
      const W = el.clientWidth; const H = el.clientHeight;
      const arcade = W >= 640;
      // 보드 묶음 폭 = bh/2 + 16, 높이 ≈ bh*1.06 + 방해 예고 줄
      if (minis >= 2) {
        const label = 22;
        const theirs = Math.max(120, Math.floor(((H - 16) / minis - label - 10) / 1.06));
        const miniW = theirs / 2 + 16;
        if (arcade) {
          // 여러 명: 내 보드 · 가운데 정보 · 친구 보드들을 한 줄로, 모두 같은 크기(뿌요 테트리스 4인 화면처럼).
          // 예전에는 친구 보드를 오른쪽 세로 한 줄에 아주 작게 쌓아서 답답했다.
          const boards = minis + 1;
          const center = Math.round(Math.max(140, Math.min(200, W * .13)));
          const gaps = 14 * boards + 24;
          const byW = 2 * ((W - center - gaps) / boards - 16);
          const byH = (H - 24 - label - 6) / 1.06;
          const bh = Math.max(200, Math.floor(Math.min(byH, byW)));
          setFit({ arcade, mine: bh, theirs: bh, center });
        } else {
          const mine = Math.max(200, Math.floor(Math.min(H - 28, (W - miniW - 10 - 16 - 32) / .67)));
          setFit({ arcade, mine, theirs, center: 0 });
        }
        return;
      }
      if (arcade) {
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
  }, [ref, mounted, minis]);
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
/** 공격 구슬 — 연쇄 공격이 받는 보드로 날아가는 연출. 화면 좌표로 그려서 보드 사이를 가로지른다. */
function useAttackOrbs(stage: RefObject<HTMLElement | null>) {
  const [orbs, setOrbs] = useState<Orb[]>([]);
  const seq = useRef(0);
  const fire = useCallback((from: Element | null | undefined, targets: (Element | null | undefined)[], chain: number, theirs: boolean) => {
    const s = stage.current?.getBoundingClientRect(); const a = from?.getBoundingClientRect();
    if (!s || !a) return;
    const count = Math.min(5, Math.max(1, chain - 1));
    const made: Orb[] = targets.flatMap(t => {
      const b = t?.getBoundingClientRect(); if (!b) return [];
      return Array.from({ length: count }, (_, k) => ({
        id: ++seq.current,
        x1: a.left + a.width / 2 - s.left + (k - count / 2) * 14, y1: a.top + a.height * .45 - s.top,
        x2: b.left + b.width / 2 - s.left, y2: b.top + 18 - s.top, big: chain >= 4, theirs,
      }));
    });
    if (!made.length) return;
    setOrbs(o => [...o, ...made]);
    setTimeout(() => setOrbs(o => o.filter(x => !made.includes(x))), 900);
  }, [stage]);
  return { orbs, fire };
}

/** 화면 흔들림·번쩍임 — 3연쇄 이상(내 공격), 큰 공격을 맞을 때. n 이 바뀔 때마다 다시 재생한다. */
function useQuake() {
  const [quake, setQuake] = useState({ n: 0, tier: 0 });
  const bump = useCallback((tier: number) => { requestAnimationFrame(() => setQuake(q => ({ n: q.n + 1, tier: Math.min(tier, 7) }))); }, []);
  return { quake, bump };
}

const PORTRAITS = ["charmander", "squirtle", "gengar", "snorlax"];
export type Ranked = { name: string; score: number; me: boolean; playerIndex: number };

/** 가운데 칸 — NEXT·시간·점수(또는 순위)·내 캐릭터(연쇄하면 뛰고, 방해 받으면 흔들린다). */
function CenterPanel({ stageName, view, opp, meName, oppName, myScore, theirScore, seconds, done, mineIndex, keysHint, ranking }: {
  view: PuyoState; opp?: PuyoState; meName: string; oppName: string; myScore: number; theirScore: number;
  seconds: number; done: boolean; mineIndex: number; keysHint: boolean; ranking?: Ranked[]; stageName?: string;
}) {
  const reacting = view.effect === "attack" || view.effect === "clear" || view.effect === "allclear" ? "cheer" : view.effect === "garbage" ? "hit" : view.effect === "revive" ? "hit" : "";
  const pair = (cells: number[], at: number, small = false) => <div className={`${styles.nextPair} ${small ? styles.nextSmall : ""}`}>
    <Puyo color={(cells[at + 1] || 0) as Cell} /><Puyo color={(cells[at] || 0) as Cell} />
  </div>;
  return <div className={styles.center}>
    {stageName && <div className={styles.stageName}>{stageName}</div>}
    <div className={styles.nextCard}>
      <span className={styles.label}>NEXT</span>
      <div className={styles.nextRow}>
        <div className={styles.nextMine}>{pair(view.next, 0)}{pair(view.next, 2, true)}</div>
        {opp && !ranking && <div className={styles.nextTheirs}>{pair(opp.next, 0, true)}</div>}
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
    {ranking ? <ol className={styles.ranking}>{ranking.map((r, i) => <li key={i} className={r.me ? styles.rankMe : ""} style={playerPalette(r.playerIndex) as CSSProperties}>
      <b>{1 + ranking.filter(o => o.score > r.score).length}</b><span>{r.name}</span><strong>{r.score.toLocaleString("ko-KR")}</strong>
    </li>)}</ol> : <div className={styles.scores}>
      <div className={styles.scoreMine}><span>{meName}</span><strong>{myScore.toLocaleString("ko-KR")}</strong></div>
      <div className={styles.scoreTheirs}><span>{oppName}</span><strong>{theirScore.toLocaleString("ko-KR")}</strong></div>
    </div>}
    <dl className={styles.stats}>
      <div><dt>최고 연쇄</dt><dd>{view.maxChain}</dd></div>
      <div><dt>다시 시작</dt><dd>{view.downs ?? 0}</dd></div>
    </dl>
    {keysHint && <p className={styles.keys}>← → 이동 · ↓ 빨리<br />Z / X 돌리기 · Space 내리기</p>}
  </div>;
}

export type StageResult = { title: string; headline: string; score: string; reward?: string };
export type StageOther = { name: string; state: PuyoState; away?: boolean };
type Sound = ReturnType<typeof useSound>;

/**
 * 전체 화면 경기장 — 학급 대전·자유 대전이 함께 쓰는 화면(동기화·저장은 부르는 쪽이 맡는다).
 * others 에 2명 이상을 주면 3~4인 배치(친구 보드를 옆에 세로로)로 그린다.
 */
export function BattleStage({ themeSeed = 0, view, oppState, meName, oppName, myScore, theirScore, seconds, countdown, result, away, notice, rules, flow, mineIndex, action, sound, onBack, backLabel, resultAction, others }: {
  view: PuyoState; oppState: PuyoState; meName: string; oppName: string; myScore: number; theirScore: number;
  seconds: number; countdown: number; result: StageResult | null; away?: boolean; notice?: string;
  rules?: PuyoRules; flow?: FlowStage; mineIndex: number; action: (a: Action) => void; sound: Sound;
  onBack: () => void; backLabel: string; resultAction: { label: string; icon: string; onClick: () => void };
  others?: StageOther[];
  /** 배경 테마를 고르는 시드 — 같은 경기의 모든 화면이 같은 값을 넘긴다. */
  themeSeed?: number;
}) {
  const theme = pickTheme(themeSeed);
  const multi = (others?.length ?? 0) >= 2;
  const rivals: StageOther[] = multi ? others! : [{ name: oppName, state: oppState, away }];
  // rivals는 참가 순서에서 나만 제외한 순서다. 게임 데이터와 무관한 표시용 색상.
  const rivalIndices = Array.from({ length: rivals.length + 1 }, (_, i) => i).filter(i => i !== mineIndex);
  const arena = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const mineRef = useRef<HTMLDivElement>(null);
  const rivalRefs = useRef<(HTMLDivElement | null)[]>([]);
  const coarse = useCoarsePointer();
  const orbs = useAttackOrbs(stageRef);
  const { quake, bump } = useQuake();
  const fit = useArenaFit(arena, true, multi ? rivals.length : 1);
  const paused = countdown > 0 || seconds <= 0 || !!result;

  // 공격 구슬: 내 연쇄 → 모든 친구에게, 친구 연쇄 → 나에게(모두에게 똑같이 보내는 규칙과 같은 모양)
  const lastMine = useRef(-1); const lastRivals = useRef<number[]>([]);
  const fireOrbs = orbs.fire;
  useEffect(() => {
    if (lastMine.current !== -1 && view.event !== lastMine.current && view.effect === "attack") { fireOrbs(mineRef.current, rivalRefs.current, view.chain, false); if (view.chain >= 3) bump(view.chain); }
    lastMine.current = view.event;
  }, [view, fireOrbs, bump]);
  const rivalEvents = rivals.map(r => `${r.state.event}:${r.state.effect}:${r.state.chain}`).join("|");
  useEffect(() => {
    rivals.forEach((r, i) => {
      const last = lastRivals.current[i];
      if (last !== undefined && last !== -1 && r.state.event !== last && r.state.effect === "attack") { fireOrbs(rivalRefs.current[i], [mineRef.current], r.state.chain, true); if (r.state.chain >= 4) bump(r.state.chain - 2); }
      lastRivals.current[i] = r.state.event;
    });
    // rivalEvents 가 바뀔 때만 확인하면 된다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rivalEvents, fireOrbs, bump]);
  // 전체 화면일 때 뒤 페이지가 스크롤되지 않게
  useEffect(() => {
    const prev = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);
  useKeyboard(action, paused, sound.unlock);
  useBgm(sound, !paused && view.phase !== "over");
  useEffect(() => { (document.activeElement as HTMLElement | null)?.blur?.(); }, []);
  const showPad = !fit.arcade || coarse;
  const ranking: Ranked[] | undefined = multi ? [{ name: meName, score: myScore, me: true, playerIndex: mineIndex }, ...rivals.map((r, i) => ({ name: r.name, score: r.state.score, me: false, playerIndex: rivalIndices[i] }))].sort((a, b) => b.score - a.score) : undefined;
  const rowLayout = multi && fit.arcade;
  const miniBoards = rivals.map((r, i) => <div key={i} ref={el => { rivalRefs.current[i] = el; }} className={styles.theirs} data-puyo-player={rivalIndices[i]} style={{ ...playerPalette(rivalIndices[i]), "--bh": `${fit.theirs}px` } as CSSProperties}>
    {rowLayout ? <BoardLabel name={r.name} score={r.state.score} note={r.away ? "연결 확인 중" : undefined} />
      : (multi || !fit.arcade) && <span className={styles.sideLabel}>{r.name}{r.away ? " · 연결 확인 중" : ""}</span>}
    <PuyoBoard state={r.state} name={r.name} opponent {...(fit.arcade ? { arcade: true } : { fill: true })} />
  </div>);

  return createPortal(<div ref={stageRef} className={styles.stage} data-theme={theme.id} style={{ ...theme.vars, ...playerPalette(mineIndex), "--rival": playerPalette(rivalIndices[0])["--player"], "--rival-light": playerPalette(rivalIndices[0])["--player-light"] } as CSSProperties} role="region" aria-label={multi ? `${rivals.length + 1}인 뿌요뿌요 경기` : "1대1 뿌요뿌요 경기"}>
    <header className={styles.bar}>
      <button type="button" className={styles.iconBtn} onClick={onBack} aria-label={backLabel}><Icon name="arrow_back" size={22} /><span className={styles.hideSm}>{backLabel}</span></button>
      {multi ? <div className={styles.barTitle}><strong>{rivals.length + 1}명 자유 대전</strong>{!fit.arcade && <span className={`${styles.clock} ${seconds <= 20 && !result ? styles.urgent : ""}`}>{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}</span>}</div>
        : fit.arcade ? <div className={styles.barTitle}><strong>{meName}</strong><span>VS</span><strong>{oppName}</strong>{away && <em>상대 연결 확인 중</em>}</div>
        : <div className={styles.scoreLine} aria-live="polite">
          <span className={styles.who}><b>{meName}</b><em>{myScore.toLocaleString("ko-KR")}</em></span>
          <span className={`${styles.clock} ${seconds <= 20 && !result ? styles.urgent : ""}`}>{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}</span>
          <span className={`${styles.who} ${styles.whoThem}`}><em>{theirScore.toLocaleString("ko-KR")}</em><b>{oppName}</b></span>
        </div>}
      <div className={styles.barActions}>
        {rules && <PuyoRulesButton rules={rules} current={flow} label="규칙" className={styles.chipBtn} />}
        <MusicButton sound={sound} className={styles.chipBtn} />
        <button type="button" className={styles.chipBtn} onClick={() => { sound.unlock(); sound.setMuted(!sound.muted); }} aria-label={sound.muted ? "소리 켜기" : "소리 끄기"}><Icon name={sound.muted ? "volume_off" : "volume_up"} size={20} /></button>
      </div>
    </header>
    {notice && <p className={styles.notice} role="status">{notice}</p>}

    {fit.arcade ? <main ref={arena} className={`${styles.arena} ${styles.arenaArcade} ${quake.n ? (quake.n % 2 ? styles.quakeA : styles.quakeB) : ""}`} style={{ "--q": `${2 + quake.tier * 1.6}px` } as CSSProperties}>
      <div ref={mineRef} className={styles.mine} data-puyo-player={mineIndex} style={{ "--bh": `${fit.mine}px` } as CSSProperties}>
        {rowLayout && <BoardLabel name={meName} score={myScore} me />}
        <PuyoBoard state={view} name={meName} arcade />
      </div>
      <div style={{ width: fit.center }} className={styles.centerWrap}>
        <CenterPanel stageName={theme.name} view={view} opp={multi ? undefined : oppState} meName={meName} oppName={oppName} myScore={myScore} theirScore={theirScore} seconds={seconds} done={!!result} mineIndex={mineIndex} keysHint={!coarse} ranking={ranking} />
      </div>
      {miniBoards}
    </main> : <main ref={arena} className={`${styles.arena} ${styles.arenaNarrow} ${quake.n ? (quake.n % 2 ? styles.quakeA : styles.quakeB) : ""}`} style={{ "--q": `${2 + quake.tier * 1.6}px` } as CSSProperties}>
      <div ref={mineRef} className={styles.mine} data-puyo-player={mineIndex} style={{ "--bh": `${fit.mine}px` } as CSSProperties}>
        <PuyoBoard state={view} name={meName} fill />
      </div>
      <aside className={`${styles.side} ${multi ? styles.miniColumn : ""}`}>{miniBoards}</aside>
    </main>}
    {showPad && <footer className={styles.padBar}><Controls action={action} disabled={paused} unlock={sound.unlock} layout="row" /></footer>}

    {quake.n > 0 && <div key={`flash${quake.n}`} className={styles.screenFlash} data-tier={quake.tier} aria-hidden="true" />}
    {orbs.orbs.map(o => <i key={o.id} className={`${styles.orb} ${o.big ? styles.orbBig : ""} ${o.theirs ? styles.orbTheirs : ""}`} style={{ "--x1": `${o.x1}px`, "--y1": `${o.y1}px`, "--x2": `${o.x2}px`, "--y2": `${o.y2}px` } as CSSProperties} aria-hidden="true" />)}

    {countdown > 0 && <div className={styles.overlay} role="status"><div className={styles.card}><span>준비됐나요?</span><strong>{countdown > 3 ? "READY" : countdown}</strong><small>{multi ? "모두 똑같은 순서로 뿌요가 나와요" : "짝꿍과 똑같은 순서로 뿌요가 나와요"}</small></div></div>}
    {!result && countdown <= 0 && seconds <= 0 && <div className={styles.overlay} role="status"><div className={styles.card}><strong>TIME UP!</strong><p className={styles.final}>{multi ? `내 점수 ${myScore.toLocaleString("ko-KR")}` : `${myScore.toLocaleString("ko-KR")} : ${theirScore.toLocaleString("ko-KR")}`}</p><small>결과를 정리하고 있어요…</small></div></div>}
    {result && <div className={styles.overlay} role="status"><div className={styles.card}>
      <span>{result.title}</span>
      <strong>{result.headline}</strong>
      <p className={styles.final}>{result.score}</p>
      {result.reward && <span className={styles.reward}>{result.reward}</span>}
      <button type="button" className={styles.primaryBtn} onClick={resultAction.onClick}><Icon name={resultAction.icon} size={18} />{resultAction.label}</button>
    </div></div>}
  </div>, document.body);
}

/** 한 줄 배치에서 보드 위 이름·점수 띠 */
function BoardLabel({ name, score, me = false, note }: { name: string; score: number; me?: boolean; note?: string }) {
  return <div className={`${styles.boardLabel} ${me ? styles.boardLabelMe : ""}`}>
    <b>{me ? `나 · ${name}` : name}</b>
    <em>{note ?? score.toLocaleString("ko-KR")}</em>
  </div>;
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
  // 안내 문구는 문제가 5초 넘게 이어질 때만 — 시작·끝 순간의 한두 번 거절이나 첫 연결 지연은 숨긴다
  const [saveBadAt, setSaveBadAt] = useState<number | null>(null);
  const [liveBadAt, setLiveBadAt] = useState<number | null>(null);
  const markLive = useCallback((ok: boolean) => { setLiveHealthy(ok); setLiveBadAt(at => ok ? null : at ?? Date.now()); }, []);
  const livePublisher = useRef<PuyoPublisher | null>(null);

  const state = useRef<PuyoState | null>(null);
  const initialSeq = useRef(0); const started = useRef(false); const savedLost = useRef(false);
  const publisher = useRef<PuyoPublisher | null>(null);
  const [view, setView] = useState<PuyoState | null>(null);
  const [error, setError] = useState("");
  const [now, setNow] = useState(0);
  // 경기 중에는 전체 화면. '대진표 보기'로 잠시 내려 두고 다시 열 수 있다.
  const [full, setFull] = useState(true);
  const opponent = liveOpponent && now - liveOpponent.at < 5000 && !match?.result ? liveOpponent : durableOpponent;
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
    const connection = watchPuyoConnection(markLive);
    return () => { active = false; clearTimeout(timeout); off(); connection(); };
  }, [cid, gid, uid, opponentId, config.realtime, match?.result, markLive]);
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
          if (["clear", "attack", "allclear", "garbage", "revive"].includes(s.effect)) { if (!options.current.config.realtime || !healthyRef.current) publisher.current?.request(true); livePublisher.current?.request(true); }
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
        if (!s || m?.result || time < (c.startsAt ?? Infinity) + 400 || time > (c.endsAt ?? 0) + 900 || savedLost.current) return null;
        return s;
      },
      write: (s, seq) => savePuyoRun(cid, gid, uid, s, seq),
      saved: s => {
        if (s.phase === "over") { savedLost.current = true; void finishPuyo(cid, gid).catch(() => {}); }
        setError(""); setSaveBadAt(null);
      },
      error: () => {
        // 저장 순번이 어긋나면(다른 탭·재접속) 서버 값으로 맞춰 다음 저장부터 다시 통과시킨다.
        void readPuyoSeq(cid, gid, uid).then(seq => queue.resync(seq)).catch(() => {});
        setSaveBadAt(at => at ?? Date.now());
        setError("연결을 확인하고 있어요. 같은 경기를 여러 탭에서 열었다면 하나만 남겨 주세요.");
      },
    });
    publisher.current = queue;
    const live = config.realtime ? new PuyoPublisher({
      seq: 0,
      snapshot: () => {
        const s = state.current; const { config: c, match: m, clockOffset: offset } = options.current;
        const t = Date.now() + offset;
        return s && !m?.result && t >= (c.startsAt ?? Infinity) + 300 && t <= (c.endsAt ?? 0) + 900 ? s : null;
      },
      write: s => savePuyoLive(cid, gid, uid, s),
      saved: () => markLive(true),
      error: () => markLive(false),
    }) : null;
    livePublisher.current = live;
    const stopLive = live ? startLiveTicker(() => state.current, () => live.request(), PUYO_LIVE_INTERVAL_MS) : null;
    const backup = () => {
      const s = state.current; const { config: c, match: m, clockOffset: offset } = options.current;
      const at = Date.now() + offset;
      if (s && !m?.result && at >= (c.startsAt ?? Infinity) && at <= (c.endsAt ?? 0)) {
        try { cachePuyo(localStorage, `${cid}/${gid}/${uid}`, s, at); } catch { /* Private storage restrictions. */ }
      }
    };
    let lastCheckpoint = 0;
    const interval = setInterval(() => { backup(); const time = performance.now(); if (time - lastCheckpoint >= (!config.realtime || !healthyRef.current ? 1000 : 3000)) { lastCheckpoint = time; queue.request(); } }, PUYO_SYNC_INTERVAL_MS);
    const hide = () => { backup(); queue.request(true); };
    window.addEventListener("pagehide", hide);
    return () => { live?.dispose(); livePublisher.current = null; stopLive?.(); queue.dispose(); publisher.current = null; clearInterval(interval); window.removeEventListener("pagehide", hide); };
  }, [cid, gid, uid, ready, config.realtime, markLive]);
  const action = useCallback((a: Action) => {
    const { config: c, match: m, clockOffset: offset } = options.current;
    const t = Date.now() + offset;
    if (state.current && !m?.result && t >= (c.startsAt ?? Infinity) && t < (c.endsAt ?? 0)) { input(state.current, a); setView(cloneState(state.current)); livePublisher.current?.request(a === "drop"); if (!options.current.config.realtime || !healthyRef.current) publisher.current?.request(a === "drop"); }
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

  return <BattleStage themeSeed={match.seed} view={view} oppState={oppState} meName={me?.name ?? "나"} oppName={other?.name ?? "상대"} myScore={myScore} theirScore={theirScore}
    seconds={seconds} countdown={countdown} away={!!away} rules={normalizeRules(config)} flow={stage} mineIndex={match.a === uid ? 0 : 1}
    notice={result || countdown > 0 || seconds <= 0 ? undefined
      : saveBadAt !== null && now - clockOffset - saveBadAt > 5000 ? error
      : config.realtime && liveBadAt !== null && now - clockOffset - liveBadAt > 5000 ? "실시간 연결을 다시 잇는 중이에요. 게임은 그대로 계속돼요." : undefined}
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
  useKeyboard(action, !running || view.phase === "over", sound.unlock);
  useBgm(sound, running && view.phase !== "over");
  return <div className={styles.practice}>
    <PuyoBoard state={view} name="나의 연습 보드" status="연습 점수는 학급 경기에 반영되지 않아요" />
    <Controls action={action} disabled={!running || view.phase === "over"} unlock={sound.unlock} layout="row" />
    <button type="button" className={styles.primaryBtn} onClick={e => { e.currentTarget.blur(); sound.unlock(); state.current = createState(Math.floor(Math.random() * 2147483646) + 1); setView(cloneState(state.current)); setRunning(true); }}><Icon name={running ? "restart_alt" : "play_arrow"} size={18} />{!running ? "연습 시작" : "새로 연습하기"}</button>
    <MusicButton sound={sound} className={styles.musicChip} />
  </div>;
}
