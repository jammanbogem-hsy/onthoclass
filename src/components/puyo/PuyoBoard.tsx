import type { CSSProperties } from "react";
import { COLS, ROWS, ghost, pairCells, type Cell, type PuyoState } from "@/lib/puyo-engine";
import styles from "./PuyoBoard.module.css";

const SPRITES = ["", "gengar", "snorlax", "charmander", "squirtle", "nuisance"];
const COLORS = ["transparent", "#9a5cf0", "#38c48c", "#ff6a4e", "#55c2f5", "#b4bdd3"];
const LIGHT = ["transparent", "#e2c8ff", "#b9f7d6", "#ffd2a6", "#d4f6ff", "#f7f9ff"];
const DEEP = ["transparent", "#5b26b4", "#178462", "#d8343c", "#2380d4", "#7a84a2"];
const VISIBLE_ROWS = ROWS - 1;

type PuyoBoardProps = {
  state: PuyoState;
  name: string;
  opponent?: boolean;
  status?: string;
  /** 전체 화면 경기용: 부모가 준 --bh(보드 높이)에 맞추고, 이름·점수 줄은 위 막대가 대신 보여 준다. */
  fill?: boolean;
  /** 아케이드 배치: 옆 정보칸 없이 보드만(정보는 가운데 칸이 보여 준다), 위에 방해 뿌요 예고 줄. */
  arcade?: boolean;
};

/** alt: 깜빡임 주기가 다른 변형(-b) — 옆 칸끼리 동시에 깜빡이지 않게 바둑판으로 섞는다. */
export function Sprite({ color, className = "", alt = false }: { color: Cell; className?: string; alt?: boolean }) {
  if (!color) return null;
  // Original local SVG artwork is already sized to a board cell; no remote image loader is needed.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`/puyo/assets/${SPRITES[color]}${alt ? "-b" : ""}.svg`} alt="" draggable={false} width={96} height={96} className={`${styles.sprite} ${className}`} />;
}

function position(x: number, y: number, color: Cell, index = 0): CSSProperties {
  return {
    left: `${x / COLS * 100}%`,
    top: `${(y - 1) / VISIBLE_ROWS * 100}%`,
    "--puyo-color": COLORS[color],
    "--wobble-delay": `${-(index * .19 + color * .31)}s`,
    "--wobble-speed": `${2.3 + color * .21}s`,
  } as CSSProperties;
}

/** 받을 방해 뿌요 예고 — 30개=왕관, 6개=큰 덩어리, 1개=작은 덩어리(실제 뿌요뿌요 방식). 최대 6칸. */
export function NuisanceRow({ count }: { count: number }) {
  const icons: ("crown" | "big" | "small")[] = [];
  let n = count;
  while (n >= 30 && icons.length < 6) { icons.push("crown"); n -= 30; }
  while (n >= 6 && icons.length < 6) { icons.push("big"); n -= 6; }
  while (n >= 1 && icons.length < 6) { icons.push("small"); n -= 1; }
  return <div className={`${styles.nuisanceRow} ${count > 0 ? styles.nuisanceHot : ""}`} aria-label={count > 0 ? `받을 방해 뿌요 ${count}개` : "받을 방해 뿌요 없음"}>
    {icons.map((k, i) => <span key={i} className={styles[k]}><Sprite color={5} /></span>)}
  </div>;
}

/** 같은 색으로 맞닿은 뿌요를 잇는 다리 — 실제 뿌요뿌요처럼 덩어리가 한 몸으로 보이게. */
function bridges(board: Cell[], clearing: Set<number>) {
  const out: { key: string; style: CSSProperties; v: boolean }[] = [];
  for (let i = COLS; i < board.length; i++) {
    // 터지는 뿌요의 다리는 바로 없앤다(파편 이펙트가 대신 보인다)
    const c = board[i]; if (!c || c === 5 || clearing.has(i)) continue;
    const x = i % COLS; const y = Math.floor(i / COLS);
    const vars = { "--c": COLORS[c], "--l": LIGHT[c], "--d": DEEP[c] };
    if (x < COLS - 1 && board[i + 1] === c) out.push({ key: `h${i}`, v: false, style: { left: `${(x + .5) / COLS * 100}%`, top: `${(y - 1 + .56) / VISIBLE_ROWS * 100}%`, ...vars } as CSSProperties });
    if (y < ROWS - 1 && board[i + COLS] === c) out.push({ key: `v${i}`, v: true, style: { left: `${(x + .5) / COLS * 100}%`, top: `${(y - 1 + .56) / VISIBLE_ROWS * 100}%`, ...vars } as CSSProperties });
  }
  return out;
}

export function PuyoBoard({ state, name, opponent = false, status, fill = false, arcade = false }: PuyoBoardProps) {
  const landing = ghost(state);
  const clearing = new Set(state.clearing);
  const isBurst = state.effect === "clear" || state.effect === "attack";
  const isAllClear = state.effect === "allclear";
  const isOver = state.phase === "over";
  const downs = state.downs ?? 0;
  const height = state.board.slice(COLS).filter(Boolean).length;

  return (
    <section className={`${styles.frame} ${opponent ? styles.opponent : ""} ${fill || arcade ? styles.fill : ""} ${arcade ? styles.arcade : ""}`} aria-label={`${name}의 뿌요 보드`} data-puyo-position={state.active ? `${state.active.x},${state.active.y},${state.active.r}` : "none"} data-puyo-score={state.score} data-puyo-attacks={state.sent} data-puyo-pending={state.pending}>
      {arcade && <NuisanceRow count={state.pending} />}
      {!fill && !arcade && <header className={styles.header}>
        <div className={styles.player}>
          <span className={styles.avatar} aria-hidden="true">{name.trim().slice(0, 1) || "?"}</span>
          <div className={styles.identity}><span className={styles.playerLabel}>{opponent ? "OPPONENT" : "PLAYER"}</span><strong title={name}>{name}</strong></div>
        </div>
        <div className={styles.score}><span>SCORE</span><strong>{state.score.toLocaleString("ko-KR")}</strong></div>
      </header>}

      <div className={styles.playArea}>
        <div className={styles.boardShell}>
          <div className={styles.board} role="img" aria-label={`점수 ${state.score}점, 최고 ${state.maxChain}연쇄, 쌓인 뿌요 ${height}개${isOver ? ", 보드가 가득 찼습니다" : ""}`}>
            <span className={styles.spawnMarker} aria-hidden="true">×</span>
            <span className={styles.boardStar} aria-hidden="true">✦</span>
            <span className={styles.boardStarSmall} aria-hidden="true">✧</span>
            <div className={`${styles.cells} ${isBurst && state.chain >= 2 ? (state.event % 2 ? styles.shakeA : styles.shakeB) : ""}`} style={{ "--shake": `${Math.min(2 + state.chain, 9)}px` } as CSSProperties} aria-hidden="true">
              {bridges(state.board, clearing).map(b => <span key={b.key} className={`${styles.bridge} ${b.v ? styles.bridgeV : styles.bridgeH}`} style={b.style} />)}
              {landing && !opponent && pairCells(landing).filter(({ y }) => y > 0).map(({ x, y, c }, i) => (
                <div key={`ghost-${i}`} className={`${styles.cell} ${styles.ghost}`} style={position(x, y, c)}><Sprite color={c} /></div>
              ))}
              {state.board.map((c, i) => c && i >= COLS ? (
                <div key={`${i}-${c}`} className={`${styles.cell} ${clearing.has(i) ? styles.clearing : ""}`} style={position(i % COLS, Math.floor(i / COLS), c, i)}>
                  <div key={state.effect === "land" || state.effect === "garbage" ? state.event : "rest"} className={state.effect === "land" ? styles.landed : state.effect === "garbage" && c === 5 ? styles.garbageDrop : undefined}>
                    <Sprite color={c} alt={(i + Math.floor(i / COLS)) % 2 === 1} className={c === 5 ? styles.grayWobble : styles.wobble} />
                  </div>
                  {clearing.has(i) && <><span className={styles.popRing} /><span className={styles.popSpark}>✦</span>{Array.from({ length: 6 }, (_, k) => <i key={k} className={styles.shard} style={{ "--a": `${k * 60 + (i % 3) * 20}deg` } as CSSProperties} />)}</>}
                </div>
              ) : null)}
              {state.active && pairCells(state.active).filter(({ y }) => y > 0).map(({ x, y, c }, i) => (
                <div key={`active-${i}`} className={`${styles.cell} ${styles.active}`} style={position(x, y, c, i)}><Sprite color={c} className={styles.activeWobble} /></div>
              ))}
            </div>
            <div key={`event-${state.event}`} className={styles.effects} aria-hidden="true">
              {(isBurst || isAllClear) && <div className={`${styles.flash} ${isAllClear ? styles.rainbowFlash : ""}`} />}
              {isBurst && <div className={styles.combo} data-tier={Math.min(state.chain, 6)}><span>{state.chain >= 5 ? "FANTASTIC!" : state.chain >= 3 ? "GREAT!" : state.chain > 1 ? "COMBO!" : "NICE!"}</span><strong>{Math.max(1, state.chain)}<small>연쇄</small></strong>{state.chain > 1 && <em>공격 발사!</em>}</div>}
              {isAllClear && <div className={styles.allClear}><span>✦ PERFECT ✦</span><strong>ALL<br />CLEAR!</strong><em>+2,100</em></div>}
              {(isBurst || isAllClear) && Array.from({ length: 10 }, (_, i) => (
                <i key={i} className={styles.sparkle} style={{ "--angle": `${i * 36}deg`, "--spark-color": COLORS[i % 4 + 1], "--distance": `${65 + i % 3 * 28}px`, "--spark-delay": `${i % 3 * 30}ms` } as CSSProperties}>✦</i>
              ))}
              {state.effect === "garbage" && <div className={styles.garbageNotice}>방해 뿌요 도착!</div>}
              {state.effect === "land" && <span className={styles.landingWave} />}
              {state.effect === "revive" && <div className={styles.reviveNotice}><strong>다시 시작!</strong><span>점수는 그대로예요</span></div>}
            </div>
            {isOver && <div className={styles.gameOver}><span>수고했어요!</span><strong>FINISH</strong><small>{state.score.toLocaleString("ko-KR")}점</small></div>}
          </div>
          {!fill && !arcade && <div className={styles.boardFoot} aria-hidden="true"><i /><span>POCKET PUYO</span><i /></div>}
        </div>

        {!arcade && <aside className={styles.rail} aria-label="다음 뿌요와 공격 정보">
          <div className={styles.nextBox}><span className={styles.railLabel}>NEXT</span>
            {[0, 1].map(pair => <div key={pair} className={`${styles.nextPair} ${pair === 1 ? styles.laterPair : ""}`}><Sprite color={state.next[pair * 2 + 1] || 0} /><Sprite color={state.next[pair * 2] || 0} /></div>)}
          </div>
          <div className={`${styles.pending} ${state.pending > 0 ? styles.pendingHot : ""}`} title="다음에 떨어질 방해 뿌요">
            <Sprite color={5} /><strong>{state.pending}</strong><span>방해</span>
          </div>
          <div className={styles.best}><span>BEST</span><strong>{state.maxChain}<small>연쇄</small></strong></div>
          {downs > 0 && <div className={styles.downs} title="보드가 꽉 차 다시 시작한 횟수"><span>다시</span><strong>{downs}</strong></div>}
        </aside>}
      </div>
      {!fill && !arcade && <footer className={styles.footer}><span className={`${styles.statusDot} ${isOver ? styles.finishedDot : ""}`} /><span>{status || (isOver ? "경기 종료" : opponent ? "상대가 플레이 중이에요" : "같은 색 4개를 연결해요!")}</span><span className={styles.sent}>공격 {state.sent}</span></footer>}
    </section>
  );
}

export default PuyoBoard;
