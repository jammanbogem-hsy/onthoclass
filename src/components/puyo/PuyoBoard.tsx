import type { CSSProperties } from "react";
import { COLS, ROWS, ghost, pairCells, type Cell, type PuyoState } from "@/lib/puyo-engine";
import styles from "./PuyoBoard.module.css";

const SPRITES = ["", "gengar", "snorlax", "charmander", "squirtle", "nuisance"];
const COLORS = ["transparent", "#b480ff", "#63e2a7", "#ff8977", "#7ddfff", "#bdc5d7"];
const VISIBLE_ROWS = ROWS - 1;

type PuyoBoardProps = {
  state: PuyoState;
  name: string;
  opponent?: boolean;
  status?: string;
};

function Sprite({ color, className = "" }: { color: Cell; className?: string }) {
  if (!color) return null;
  // Original local SVG artwork is already sized to a board cell; no remote image loader is needed.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`/puyo/assets/${SPRITES[color]}.svg`} alt="" draggable={false} width={96} height={96} className={`${styles.sprite} ${className}`} />;
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

export function PuyoBoard({ state, name, opponent = false, status }: PuyoBoardProps) {
  const landing = ghost(state);
  const clearing = new Set(state.clearing);
  const isBurst = state.effect === "clear" || state.effect === "attack";
  const isAllClear = state.effect === "allclear";
  const isOver = state.phase === "over";
  const height = state.board.slice(COLS).filter(Boolean).length;

  return (
    <section className={`${styles.frame} ${opponent ? styles.opponent : ""}`} aria-label={`${name}의 뿌요 보드`}>
      <header className={styles.header}>
        <div className={styles.player}>
          <span className={styles.avatar} aria-hidden="true">{name.trim().slice(0, 1) || "?"}</span>
          <div className={styles.identity}><span className={styles.playerLabel}>{opponent ? "OPPONENT" : "PLAYER"}</span><strong title={name}>{name}</strong></div>
        </div>
        <div className={styles.score}><span>SCORE</span><strong>{state.score.toLocaleString("ko-KR")}</strong></div>
      </header>

      <div className={styles.playArea}>
        <div className={styles.boardShell}>
          <div className={styles.board} role="img" aria-label={`점수 ${state.score}점, 최고 ${state.maxChain}연쇄, 쌓인 뿌요 ${height}개${isOver ? ", 보드가 가득 찼습니다" : ""}`}>
            <span className={styles.spawnMarker} aria-hidden="true">×</span>
            <span className={styles.boardStar} aria-hidden="true">✦</span>
            <span className={styles.boardStarSmall} aria-hidden="true">✧</span>
            <div className={styles.cells} aria-hidden="true">
              {landing && !opponent && pairCells(landing).filter(({ y }) => y > 0).map(({ x, y, c }, i) => (
                <div key={`ghost-${i}`} className={`${styles.cell} ${styles.ghost}`} style={position(x, y, c)}><Sprite color={c} /></div>
              ))}
              {state.board.map((c, i) => c && i >= COLS ? (
                <div key={`${i}-${c}`} className={`${styles.cell} ${clearing.has(i) ? styles.clearing : ""}`} style={position(i % COLS, Math.floor(i / COLS), c, i)}>
                  <div key={state.effect === "land" || state.effect === "garbage" ? state.event : "rest"} className={state.effect === "land" ? styles.landed : state.effect === "garbage" && c === 5 ? styles.garbageDrop : undefined}>
                    <Sprite color={c} className={c === 5 ? styles.grayWobble : styles.wobble} />
                  </div>
                  {clearing.has(i) && <><span className={styles.popRing} /><span className={styles.popSpark}>✦</span></>}
                </div>
              ) : null)}
              {state.active && pairCells(state.active).filter(({ y }) => y > 0).map(({ x, y, c }, i) => (
                <div key={`active-${i}`} className={`${styles.cell} ${styles.active}`} style={position(x, y, c, i)}><Sprite color={c} className={styles.activeWobble} /></div>
              ))}
            </div>
            <div key={`event-${state.event}`} className={styles.effects} aria-hidden="true">
              {(isBurst || isAllClear) && <div className={`${styles.flash} ${isAllClear ? styles.rainbowFlash : ""}`} />}
              {isBurst && <div className={styles.combo}><span>{state.chain > 1 ? "COMBO!" : "NICE!"}</span><strong>{Math.max(1, state.chain)}<small>연쇄</small></strong>{state.chain > 1 && <em>공격 발사! ↗</em>}</div>}
              {isAllClear && <div className={styles.allClear}><span>✦ PERFECT ✦</span><strong>ALL<br />CLEAR!</strong><em>+2,100</em></div>}
              {(isBurst || isAllClear) && Array.from({ length: 10 }, (_, i) => (
                <i key={i} className={styles.sparkle} style={{ "--angle": `${i * 36}deg`, "--spark-color": COLORS[i % 4 + 1], "--distance": `${65 + i % 3 * 28}px`, "--spark-delay": `${i % 3 * 30}ms` } as CSSProperties}>✦</i>
              ))}
              {state.effect === "garbage" && <div className={styles.garbageNotice}>방해 뿌요 도착!</div>}
              {state.effect === "land" && <span className={styles.landingWave} />}
            </div>
            {isOver && <div className={styles.gameOver}><span>수고했어요!</span><strong>FINISH</strong><small>{state.score.toLocaleString("ko-KR")}점</small></div>}
          </div>
          <div className={styles.boardFoot} aria-hidden="true"><i /><span>POCKET PUYO</span><i /></div>
        </div>

        <aside className={styles.rail} aria-label="다음 뿌요와 공격 정보">
          <div className={styles.nextBox}><span className={styles.railLabel}>NEXT</span>
            {[0, 1].map(pair => <div key={pair} className={`${styles.nextPair} ${pair === 1 ? styles.laterPair : ""}`}><Sprite color={state.next[pair * 2 + 1] || 0} /><Sprite color={state.next[pair * 2] || 0} /></div>)}
          </div>
          <div className={`${styles.pending} ${state.pending > 0 ? styles.pendingHot : ""}`} title="다음에 떨어질 방해 뿌요">
            <Sprite color={5} /><strong>{state.pending}</strong><span>방해</span>
          </div>
          <div className={styles.best}><span>BEST</span><strong>{state.maxChain}<small>연쇄</small></strong></div>
        </aside>
      </div>
      <footer className={styles.footer}><span className={`${styles.statusDot} ${isOver ? styles.finishedDot : ""}`} /><span>{status || (isOver ? "경기 종료" : opponent ? "상대가 플레이 중이에요" : "같은 색 4개를 연결해요!")}</span><span className={styles.sent}>공격 {state.sent}</span></footer>
    </section>
  );
}

export default PuyoBoard;
