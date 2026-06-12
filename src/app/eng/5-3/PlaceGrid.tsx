"use client";

// 길찾기 지도 — N×N 블록(각 블록 4슬롯) + 사이/둘레 도로 + 가장자리 진입 화살표.
//  · 사람은 도로(교차점 사이)를 걷는다. 건물은 블록 슬롯에 큰 그림(영어 라벨 없음).
//  · MapEditor: 슬롯에 드래그앤드롭 배치 + 화살표로 출발점 지정.
//  · MapView: 읽기전용(풀기/미리보기) — 시작 화살표 + 건물 클릭(정답) + 워커 시뮬 오버레이.
import { useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  PLACES,
  placeImg,
  startGlyph,
  type GridSize,
  type Start,
  type StartSide,
} from "./types";
import {
  SLOTS,
  layout,
  slotIndex,
  type Dir,
  type Node,
  type Slot,
} from "./mapModel";

const ROAD = "#e7d9b2"; // 도로(황톳빛)
const BLOCK_BG = "#eef4e6"; // 블록 바닥(연녹)
const BORDER = "#3a3a3a"; // 블록 테두리
const ARROW = "#e0532b"; // 진입 화살표(빨강)
const PLACE_IDS = PLACES.map((p) => p.id);

/** 건물 그림(큰 그림, 영어 라벨 없음) */
function PlaceTile({ id }: { id: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={placeImg(id)}
      alt="건물"
      draggable={false}
      className="h-full w-full object-contain"
    />
  );
}

// ─────────────────────────── 시작 화살표 ───────────────────────────

function arrowPos(side: StartSide, line: number, n: number): React.CSSProperties {
  const last = 2 * n + 1; // 마지막 그리드 라인(거터)
  const cross = 2 * line + 1; // 도로선 line 의 그리드 트랙(1-indexed)
  if (side === "top") return { gridColumn: cross, gridRow: 1 };
  if (side === "bottom") return { gridColumn: cross, gridRow: last };
  if (side === "left") return { gridColumn: 1, gridRow: cross };
  return { gridColumn: last, gridRow: cross }; // right
}

function StartArrows({
  n,
  start,
  onPick,
}: {
  n: GridSize;
  start: Start | null;
  onPick?: (s: Start) => void;
}) {
  const sides: StartSide[] = ["top", "right", "bottom", "left"];
  const all: { side: StartSide; line: number }[] = [];
  sides.forEach((side) => {
    for (let line = 1; line < n; line++) all.push({ side, line });
  });
  const isSel = (side: StartSide, line: number) =>
    !!start && start.side === side && start.line === line;
  // 뷰(onPick 없음)에서는 선택된 화살표만 표시
  const items = onPick ? all : all.filter((a) => isSel(a.side, a.line));

  return (
    <>
      {items.map(({ side, line }) => {
        const sel = isSel(side, line);
        return (
          <button
            key={`${side}-${line}`}
            type="button"
            onClick={onPick ? () => onPick({ side, line }) : undefined}
            disabled={!onPick}
            style={{ ...arrowPos(side, line, n), color: sel ? ARROW : "#9c8f6a" }}
            className={[
              "z-10 flex items-center justify-center text-lg leading-none transition",
              sel ? "scale-125" : onPick ? "opacity-30 hover:opacity-80" : "",
              onPick ? "cursor-pointer" : "cursor-default",
            ].join(" ")}
            aria-label="출발 화살표"
          >
            {startGlyph(side)}
          </button>
        );
      })}
    </>
  );
}

// ─────────────────────────── 워커(시뮬레이션) ───────────────────────────

function Walker({
  n,
  node,
  dir,
}: {
  n: GridSize;
  node: Node;
  dir: Dir;
}) {
  const L = layout(n);
  const deg = dir * 90; // 0=위,1=오른,2=아래,3=왼
  return (
    <div
      style={{
        position: "absolute",
        left: L.roadCenter(node.x),
        top: L.roadCenter(node.y),
        transform: "translate(-50%, -50%)",
        transition: "left .35s ease, top .35s ease",
      }}
      className="z-20 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--md-sys-color-primary)] shadow-md"
    >
      <span
        style={{ transform: `rotate(${deg}deg)` }}
        className="text-xs font-bold text-[var(--md-sys-color-on-primary)]"
      >
        ▲
      </span>
    </div>
  );
}

// ─────────────────────────── 블록(읽기전용 슬롯) ───────────────────────────

function blockPos(c: number, r: number): React.CSSProperties {
  return { gridColumn: 2 * c + 2, gridRow: 2 * r + 2 };
}

function BlockView({
  c,
  r,
  n,
  board,
  highlightId,
  selectableIds,
  onPick,
  slotNumbers,
}: {
  c: number;
  r: number;
  n: GridSize;
  board: (string | null)[];
  highlightId?: string;
  selectableIds?: Set<string>;
  onPick?: (placeId: string) => void;
  slotNumbers?: Map<number, number>;
}) {
  return (
    <div
      style={{ ...blockPos(c, r), borderColor: BORDER, background: "rgba(255,255,255,0.25)" }}
      className="grid aspect-square grid-cols-2 grid-rows-2 gap-[3px] rounded-md border-2 p-[3px]"
    >
      {SLOTS.map((slot) => {
        const idx = slotIndex(c, r, slot as Slot, n);
        const pid = board[idx];
        const isHi = !!pid && pid === highlightId;
        const clickable =
          !!pid && (!selectableIds || selectableIds.has(pid)) && !!onPick;
        const num = !pid ? slotNumbers?.get(idx) : undefined;
        return (
          <button
            key={slot}
            type="button"
            disabled={!clickable}
            onClick={clickable ? () => onPick!(pid!) : undefined}
            style={pid ? { background: BLOCK_BG } : undefined}
            className={[
              "flex items-center justify-center rounded-[5px] transition",
              pid ? "" : "border border-dashed border-[#b3a986]",
              isHi ? "ring-4 ring-[var(--md-sys-color-tertiary)]" : "",
              clickable
                ? "cursor-pointer hover:ring-4 hover:ring-[var(--md-sys-color-primary)]"
                : "cursor-default",
            ].join(" ")}
          >
            {pid ? (
              <PlaceTile id={pid} />
            ) : num != null ? (
              <span className="select-none text-sm font-extrabold text-[#a8895b]">
                {num}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function MapView({
  size: n,
  board,
  start,
  walker,
  highlightId,
  selectableIds,
  onPick,
  slotNumbers,
}: {
  size: GridSize;
  board: (string | null)[];
  start?: Start | null;
  walker?: { node: Node; dir: Dir } | null;
  highlightId?: string;
  selectableIds?: Set<string>;
  onPick?: (placeId: string) => void;
  /** 빈칸 번호(board idx → 번호). 풀기/가보기에서도 표시. */
  slotNumbers?: Map<number, number>;
}) {
  const L = layout(n);
  const blocks: { c: number; r: number }[] = [];
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) blocks.push({ c, r });
  return (
    <div className="overflow-x-auto">
      <div style={{ position: "relative", width: L.size, height: L.size, margin: "0 auto" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: L.template,
            gridTemplateRows: L.template,
            width: L.size,
            height: L.size,
            background: ROAD,
            borderRadius: 14,
          }}
        >
          <StartArrows n={n} start={start ?? null} />
          {blocks.map(({ c, r }) => (
            <BlockView
              key={`${c}-${r}`}
              c={c}
              r={r}
              n={n}
              board={board}
              highlightId={highlightId}
              selectableIds={selectableIds}
              onPick={onPick}
              slotNumbers={slotNumbers}
            />
          ))}
        </div>
        {walker && <Walker n={n} node={walker.node} dir={walker.dir} />}
      </div>
    </div>
  );
}

// ─────────────────────────── 드래그앤드롭 에디터 ───────────────────────────

function PoolItem({ id }: { id: string }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `pool:${id}`,
  });
  return (
    <button
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      type="button"
      style={{ background: BLOCK_BG }}
      className={"h-14 w-14 touch-none rounded-lg p-0.5 " + (isDragging ? "opacity-30" : "")}
    >
      <PlaceTile id={id} />
    </button>
  );
}

function SlotEdit({
  idx,
  pid,
  num,
}: {
  idx: number;
  pid: string | null;
  num?: number;
}) {
  const { setNodeRef: dropRef, isOver } = useDroppable({ id: `slot:${idx}` });
  const {
    setNodeRef: dragRef,
    listeners,
    attributes,
    isDragging,
  } = useDraggable({ id: `slot:${idx}:${pid ?? ""}`, disabled: !pid });
  return (
    <div
      ref={dropRef}
      style={pid ? { background: BLOCK_BG } : undefined}
      className={[
        "relative flex items-center justify-center rounded-[5px] transition",
        pid ? "" : "border border-dashed border-[#b3a986]",
        isOver ? "ring-4 ring-[var(--md-sys-color-primary)]" : "",
      ].join(" ")}
    >
      {pid ? (
        <div
          ref={dragRef}
          {...listeners}
          {...attributes}
          className={"h-full w-full touch-none " + (isDragging ? "opacity-30" : "")}
        >
          <PlaceTile id={pid} />
        </div>
      ) : (
        num != null && (
          // 확정 후 빈칸 번호 — 길안내 'at the' 에서 이 번호를 가리킬 수 있다
          <span className="select-none text-sm font-extrabold text-[#a8895b]">
            {num}
          </span>
        )
      )}
    </div>
  );
}

function BlockEdit({
  c,
  r,
  n,
  board,
  slotNumbers,
}: {
  c: number;
  r: number;
  n: GridSize;
  board: (string | null)[];
  slotNumbers?: Map<number, number>;
}) {
  return (
    <div
      style={{ ...blockPos(c, r), borderColor: BORDER, background: "rgba(255,255,255,0.25)" }}
      className="grid aspect-square grid-cols-2 grid-rows-2 gap-[3px] rounded-md border-2 p-[3px]"
    >
      {SLOTS.map((slot) => {
        const idx = slotIndex(c, r, slot as Slot, n);
        return (
          <SlotEdit key={slot} idx={idx} pid={board[idx]} num={slotNumbers?.get(idx)} />
        );
      })}
    </div>
  );
}

export function MapEditor({
  size: n,
  board,
  onBoardChange,
  start,
  onStartChange,
  slotNumbers,
}: {
  size: GridSize;
  board: (string | null)[];
  onBoardChange: (next: (string | null)[]) => void;
  start: Start | null;
  onStartChange: (s: Start) => void;
  /** 지도 확정 시 빈칸에 표시할 번호(board idx → 번호). 미지정이면 숨김. */
  slotNumbers?: Map<number, number>;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 8 } }),
    useSensor(KeyboardSensor)
  );
  const L = layout(n);
  const blocks: { c: number; r: number }[] = [];
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) blocks.push({ c, r });

  const placed = new Set(board.filter((b): b is string => !!b));
  const pool = PLACE_IDS.filter((id) => !placed.has(id));

  const activePlaceId = activeId
    ? activeId.startsWith("pool:")
      ? activeId.slice(5)
      : activeId.split(":")[2]
    : null;

  const { setNodeRef: poolRef, isOver: poolOver } = useDroppable({ id: "pool" });

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }
  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    setActiveId(null);
    if (!over) return;
    const a = String(active.id);
    const o = String(over.id);
    const fromPool = a.startsWith("pool:");
    const placeId = fromPool ? a.slice(5) : a.split(":")[2];
    const fromIdx = fromPool ? -1 : Number(a.split(":")[1]);

    if (o === "pool") {
      if (fromPool) return;
      const next = [...board];
      next[fromIdx] = null;
      onBoardChange(next);
      return;
    }
    if (o.startsWith("slot:")) {
      const toIdx = Number(o.split(":")[1]);
      const next = [...board];
      if (fromPool) {
        const dupAt = next.findIndex((b) => b === placeId);
        if (dupAt >= 0) next[dupAt] = null;
        next[toIdx] = placeId;
      } else {
        if (fromIdx === toIdx) return;
        const tmp = next[toIdx];
        next[toIdx] = placeId;
        next[fromIdx] = tmp;
      }
      onBoardChange(next);
    }
  }

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="overflow-x-auto">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: L.template,
            gridTemplateRows: L.template,
            width: L.size,
            height: L.size,
            background: ROAD,
            borderRadius: 14,
            margin: "0 auto",
          }}
        >
          <StartArrows n={n} start={start} onPick={onStartChange} />
          {blocks.map(({ c, r }) => (
            <BlockEdit
              key={`${c}-${r}`}
              c={c}
              r={r}
              n={n}
              board={board}
              slotNumbers={slotNumbers}
            />
          ))}
        </div>
      </div>
      <p className="mt-2 text-center text-xs text-[var(--md-sys-color-on-surface-variant)]">
        가장자리 화살표를 눌러 출발 위치를 정하세요. 사람은 도로를 따라 걸어요.
      </p>

      <div
        ref={poolRef}
        className={[
          "mt-3 flex flex-wrap gap-2 rounded-2xl border border-dashed p-3",
          poolOver
            ? "border-[var(--md-sys-color-primary)] bg-[var(--md-sys-color-primary-container)]"
            : "border-[var(--md-sys-color-outline-variant)]",
        ].join(" ")}
      >
        {pool.length === 0 ? (
          <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
            모든 건물을 지도에 놓았어요. (슬롯을 여기로 끌어오면 다시 뺄 수 있어요)
          </p>
        ) : (
          pool.map((id) => <PoolItem key={id} id={id} />)
        )}
      </div>

      <DragOverlay dropAnimation={null}>
        {activePlaceId ? (
          <div
            style={{ background: BLOCK_BG }}
            className="h-14 w-14 rounded-lg p-0.5 shadow-lg ring-2 ring-[var(--md-sys-color-primary)]"
          >
            <PlaceTile id={activePlaceId} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
