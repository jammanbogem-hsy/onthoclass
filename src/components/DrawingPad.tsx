"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/Icon";

/**
 * 그림판 — 학생이 직접 그린 그림을 이미지 첨부로 만든다(사진·음성과 같은 취급).
 *
 * 설계 메모
 * - 그림 캔버스는 "투명"이고, 종이(흰 바탕·모눈·줄)는 뒤에 깔린 별도 캔버스다.
 *   → 색 채우기가 모눈선에 막히지 않고, 지우개가 진짜로 지워진다(destination-out).
 *   → 저장할 때만 [종이 + 그림]을 합쳐 굽는다.
 * - 되돌리기는 픽셀 스냅샷 대신 "그린 동작(op) 목록"을 되감아 다시 그린다.
 *   크롬북 메모리 보호 — 스냅샷 1장이 5MB라 20장이면 100MB다. 앞으로 그릴 때는
 *   획을 그대로 얹으므로 다시 그리기 비용은 되돌리기 순간에만 든다.
 */

type Tool = "pen" | "eraser" | "fill" | "line" | "rect" | "ellipse";
type ShapeKind = "line" | "rect" | "ellipse";
type Paper = "plain" | "grid" | "lined";

type Op =
  | { t: "stroke"; pts: number[]; color: string; w: number; erase: boolean }
  | {
      t: "shape";
      kind: ShapeKind;
      x0: number;
      y0: number;
      x1: number;
      y1: number;
      color: string;
      w: number;
    }
  | { t: "fill"; x: number; y: number; color: string }
  | { t: "clear" };

const TOOLS: { id: Tool; icon: string; label: string }[] = [
  { id: "pen", icon: "stylus", label: "펜" },
  { id: "eraser", icon: "ink_eraser", label: "지우개" },
  { id: "fill", icon: "format_color_fill", label: "색 채우기" },
  { id: "line", icon: "horizontal_rule", label: "직선" },
  { id: "rect", icon: "check_box_outline_blank", label: "네모" },
  { id: "ellipse", icon: "radio_button_unchecked", label: "동그라미" },
];

const PAPERS: { id: Paper; icon: string; label: string }[] = [
  { id: "plain", icon: "note", label: "흰 종이" },
  { id: "grid", icon: "grid_on", label: "모눈종이" },
  { id: "lined", icon: "notes", label: "줄공책" },
];

// 초등 친화 팔레트 — 이름을 붙일 수 있는 또렷한 색으로. (테마 토큰이 아니라
// '그림 물감'이므로 다크모드에서도 그대로다 — 종이는 항상 흰 종이다.)
const PALETTE = [
  { hex: "#000000", label: "검정" },
  { hex: "#8b95a1", label: "회색" },
  { hex: "#e53935", label: "빨강" },
  { hex: "#fb8c00", label: "주황" },
  { hex: "#fdd835", label: "노랑" },
  { hex: "#7cb342", label: "연두" },
  { hex: "#2e7d32", label: "초록" },
  { hex: "#00acc1", label: "청록" },
  { hex: "#1e88e5", label: "파랑" },
  { hex: "#3949ab", label: "남색" },
  { hex: "#8e24aa", label: "보라" },
  { hex: "#ec407a", label: "분홍" },
  { hex: "#8d6e63", label: "갈색" },
  { hex: "#ffcc9c", label: "살구" },
];

const WIDTHS = [
  { w: 4, label: "아주 얇게" },
  { w: 10, label: "얇게" },
  { w: 20, label: "굵게" },
  { w: 36, label: "아주 굵게" },
];

/** 종이(배경) 그리기 — 화면 표시와 저장본이 항상 같도록 한 함수만 쓴다. */
function drawPaper(ctx: CanvasRenderingContext2D, W: number, H: number, paper: Paper) {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "#dbe2ea";
  ctx.lineWidth = 2;
  if (paper === "grid") {
    for (let x = 40; x < W; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    for (let y = 40; y < H; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
  } else if (paper === "lined") {
    for (let y = 72; y < H; y += 72) {
      ctx.beginPath();
      ctx.moveTo(48, y);
      ctx.lineTo(W - 24, y);
      ctx.stroke();
    }
    ctx.strokeStyle = "#f3c3cd";
    ctx.beginPath();
    ctx.moveTo(48, 0);
    ctx.lineTo(48, H);
    ctx.stroke();
  }
  ctx.restore();
}

function setPen(
  ctx: CanvasRenderingContext2D,
  color: string,
  w: number,
  erase: boolean
) {
  ctx.globalCompositeOperation = erase ? "destination-out" : "source-over";
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = w;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
}

function drawStroke(
  ctx: CanvasRenderingContext2D,
  pts: number[],
  color: string,
  w: number,
  erase: boolean
) {
  if (pts.length < 2) return;
  setPen(ctx, color, w, erase);
  if (pts.length === 2) {
    // 톡 찍은 점 — 선이 아니라 동그라미로 남긴다.
    ctx.beginPath();
    ctx.arc(pts[0], pts[1], w / 2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    ctx.stroke();
  }
  ctx.globalCompositeOperation = "source-over";
}

function drawShape(
  ctx: CanvasRenderingContext2D,
  kind: ShapeKind,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: string,
  w: number
) {
  setPen(ctx, color, w, false);
  ctx.beginPath();
  if (kind === "line") {
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
  } else if (kind === "rect") {
    ctx.rect(
      Math.min(x0, x1),
      Math.min(y0, y1),
      Math.abs(x1 - x0),
      Math.abs(y1 - y0)
    );
  } else {
    ctx.ellipse(
      (x0 + x1) / 2,
      (y0 + y1) / 2,
      Math.abs(x1 - x0) / 2,
      Math.abs(y1 - y0) / 2,
      0,
      0,
      Math.PI * 2
    );
  }
  ctx.stroke();
}

function hexToRgb(hex: string) {
  const h = hex.replace("#", "");
  const n = parseInt(
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h,
    16
  );
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/**
 * 색 채우기(페인트통) — 클릭한 픽셀과 '비슷한 색'이 이어진 영역을 칠한다.
 * 스캔라인 방식 + 방문 배열(같은 색을 다시 칠할 때 무한루프 방지).
 */
function floodFill(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  sx: number,
  sy: number,
  hex: string
) {
  const x0 = Math.round(sx);
  const y0 = Math.round(sy);
  if (x0 < 0 || y0 < 0 || x0 >= W || y0 >= H) return;
  const img = ctx.getImageData(0, 0, W, H);
  const d = img.data;
  const s = (y0 * W + x0) * 4;
  const tr = d[s];
  const tg = d[s + 1];
  const tb = d[s + 2];
  const ta = d[s + 3];
  const { r, g, b } = hexToRgb(hex);
  const TOL = 32;
  // 투명한 곳을 찍었으면 '투명한가'로만 판정한다(투명 픽셀의 RGB는 의미 없음).
  const match =
    ta < 16
      ? (i: number) => d[i + 3] < 16
      : (i: number) =>
          Math.abs(d[i + 3] - ta) <= TOL &&
          Math.abs(d[i] - tr) <= TOL &&
          Math.abs(d[i + 1] - tg) <= TOL &&
          Math.abs(d[i + 2] - tb) <= TOL;

  const seen = new Uint8Array(W * H);
  const stack: number[] = [x0, y0];
  while (stack.length) {
    const y = stack.pop() as number;
    let x = stack.pop() as number;
    while (x > 0 && !seen[y * W + (x - 1)] && match(((y * W + (x - 1)) * 4))) x--;
    let up = false;
    let down = false;
    for (; x < W; x++) {
      const p = y * W + x;
      if (seen[p] || !match(p * 4)) break;
      seen[p] = 1;
      const i = p * 4;
      d[i] = r;
      d[i + 1] = g;
      d[i + 2] = b;
      d[i + 3] = 255;
      if (y > 0) {
        const q = p - W;
        const ok = !seen[q] && match(q * 4);
        if (ok && !up) stack.push(x, y - 1);
        up = ok;
      }
      if (y < H - 1) {
        const q = p + W;
        const ok = !seen[q] && match(q * 4);
        if (ok && !down) stack.push(x, y + 1);
        down = ok;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
}

export function DrawingPad({
  onSave,
  onClose,
  title = "그림 그리기",
}: {
  /** 완성된 그림(이미지 Blob). 호출부가 업로드한다. */
  onSave: (blob: Blob) => void;
  onClose: () => void;
  title?: string;
}) {
  // 캔버스 크기는 열 때 화면 방향에 맞춰 한 번만 정한다(중간에 바뀌면 그림이 깨진다).
  const [[W, H]] = useState<[number, number]>(() =>
    typeof window !== "undefined" && window.innerHeight > window.innerWidth
      ? [960, 1280]
      : [1280, 960]
  );

  const paperRef = useRef<HTMLCanvasElement>(null);
  const drawRef = useRef<HTMLCanvasElement>(null);
  const fitRef = useRef<HTMLDivElement>(null);

  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState(PALETTE[0].hex);
  const [width, setWidth] = useState(10);
  const [paper, setPaper] = useState<Paper>("plain");
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [hist, setHist] = useState({ n: 0, r: 0 });
  const [busy, setBusy] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);

  const opsRef = useRef<Op[]>([]);
  const redoRef = useRef<Op[]>([]);
  const dragRef = useRef<
    | { kind: "stroke"; pts: number[] }
    | { kind: "shape"; x0: number; y0: number; x1: number; y1: number; snap: ImageData }
    | null
  >(null);
  // 포인터 이벤트 핸들러가 항상 최신 도구/색/굵기를 보도록 미러(리스너 재등록 없이).
  const optRef = useRef({ tool, color, width });
  optRef.current = { tool, color, width };

  const ctx2d = () => drawRef.current?.getContext("2d", { willReadFrequently: true }) ?? null;
  const sync = () => setHist({ n: opsRef.current.length, r: redoRef.current.length });

  function applyOp(ctx: CanvasRenderingContext2D, op: Op) {
    if (op.t === "stroke") drawStroke(ctx, op.pts, op.color, op.w, op.erase);
    else if (op.t === "shape")
      drawShape(ctx, op.kind, op.x0, op.y0, op.x1, op.y1, op.color, op.w);
    else if (op.t === "fill") floodFill(ctx, W, H, op.x, op.y, op.color);
    else ctx.clearRect(0, 0, W, H);
  }

  function replay() {
    const ctx = ctx2d();
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    for (const op of opsRef.current) applyOp(ctx, op);
  }

  function push(op: Op) {
    opsRef.current.push(op);
    redoRef.current = []; // 새로 그리면 '다시 실행' 갈래는 버린다
    sync();
  }

  function undo() {
    const op = opsRef.current.pop();
    if (!op) return;
    redoRef.current.push(op);
    replay();
    sync();
  }

  function redo() {
    const op = redoRef.current.pop();
    if (!op) return;
    opsRef.current.push(op);
    const ctx = ctx2d();
    if (ctx) applyOp(ctx, op);
    sync();
  }

  function clearAll() {
    if (opsRef.current.length === 0) return;
    push({ t: "clear" });
    const ctx = ctx2d();
    if (ctx) ctx.clearRect(0, 0, W, H);
  }

  // 종이 바꾸기 — 그림은 그대로 두고 뒤 배경만 다시 그린다.
  useEffect(() => {
    const ctx = paperRef.current?.getContext("2d");
    if (ctx) drawPaper(ctx, W, H, paper);
  }, [paper, W, H]);

  // 남는 공간에 종이를 '비율 그대로' 맞춘다(찌그러지면 그림이 왜곡된다).
  useEffect(() => {
    const el = fitRef.current;
    if (!el) return;
    const fit = () => {
      const cw = el.clientWidth;
      const ch = el.clientHeight;
      if (cw <= 0 || ch <= 0) return;
      const s = Math.min(cw / W, ch / H);
      setBox({ w: Math.floor(W * s), h: Math.floor(H * s) });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [W, H]);

  // 열려 있는 동안 뒤 화면 스크롤 잠금 + 단축키
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        requestClose();
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pt(e: React.PointerEvent<HTMLCanvasElement>) {
    const c = drawRef.current!;
    const r = c.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * W,
      y: ((e.clientY - r.top) / r.height) * H,
    };
  }

  function onDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const ctx = ctx2d();
    if (!ctx) return;
    e.preventDefault();
    drawRef.current?.setPointerCapture(e.pointerId);
    const { x, y } = pt(e);
    const { tool: t, color: c, width: w } = optRef.current;

    if (t === "fill") {
      floodFill(ctx, W, H, x, y, c);
      push({ t: "fill", x, y, color: c });
      return;
    }
    if (t === "pen" || t === "eraser") {
      dragRef.current = { kind: "stroke", pts: [x, y] };
      // 톡 찍었을 때도 점이 남도록 즉시 한 점 찍기
      setPen(ctx, c, w, t === "eraser");
      ctx.beginPath();
      ctx.arc(x, y, w / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";
      return;
    }
    // 도형 — 끄는 동안 미리보기를 위해 현재 그림을 한 장 떠 둔다(드래그 중에만 유지).
    dragRef.current = {
      kind: "shape",
      x0: x,
      y0: y,
      x1: x,
      y1: y,
      snap: ctx.getImageData(0, 0, W, H),
    };
  }

  function onMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const drag = dragRef.current;
    const ctx = ctx2d();
    if (!drag || !ctx) return;
    e.preventDefault();
    const { x, y } = pt(e);
    const { tool: t, color: c, width: w } = optRef.current;
    if (drag.kind === "stroke") {
      const n = drag.pts.length;
      const px = drag.pts[n - 2];
      const py = drag.pts[n - 1];
      if (Math.abs(x - px) < 1 && Math.abs(y - py) < 1) return;
      drag.pts.push(x, y);
      setPen(ctx, c, w, t === "eraser");
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.globalCompositeOperation = "source-over";
    } else {
      drag.x1 = x;
      drag.y1 = y;
      ctx.putImageData(drag.snap, 0, 0);
      drawShape(ctx, t as ShapeKind, drag.x0, drag.y0, x, y, c, w);
    }
  }

  function onUp(e: React.PointerEvent<HTMLCanvasElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    try {
      drawRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
    const { tool: t, color: c, width: w } = optRef.current;
    if (drag.kind === "stroke") {
      push({ t: "stroke", pts: drag.pts, color: c, w, erase: t === "eraser" });
    } else {
      // 제자리 클릭은 도형이 아니라 실수 — 미리보기를 되돌리고 기록하지 않는다.
      if (Math.abs(drag.x1 - drag.x0) < 4 && Math.abs(drag.y1 - drag.y0) < 4) {
        const ctx = ctx2d();
        if (ctx) ctx.putImageData(drag.snap, 0, 0);
        return;
      }
      push({
        t: "shape",
        kind: t as ShapeKind,
        x0: drag.x0,
        y0: drag.y0,
        x1: drag.x1,
        y1: drag.y1,
        color: c,
        w,
      });
    }
  }

  function requestClose() {
    if (opsRef.current.length > 0) setConfirmClose(true);
    else onClose();
  }

  async function save() {
    const draw = drawRef.current;
    const pap = paperRef.current;
    if (!draw || !pap) return;
    setBusy(true);
    try {
      const out = document.createElement("canvas");
      out.width = W;
      out.height = H;
      const c = out.getContext("2d");
      if (!c) return;
      c.drawImage(pap, 0, 0);
      c.drawImage(draw, 0, 0);
      const toBlob = (type: string, q?: number) =>
        new Promise<Blob | null>((res) => out.toBlob((b) => res(b), type, q));
      // 선 그림은 PNG가 더 작고 선명하다. 색을 잔뜩 칠해 커지면 JPEG로 낮춘다.
      let blob = await toBlob("image/png");
      if (!blob || blob.size > 2 * 1024 * 1024) {
        blob = (await toBlob("image/jpeg", 0.9)) ?? blob;
      }
      if (blob) onSave(blob);
    } finally {
      setBusy(false);
    }
  }

  if (typeof document === "undefined") return null;

  // 패딩은 쓰는 쪽에서 붙인다 — base 에 두면 px-0/px-6 과 겹쳐 어느 쪽이 이길지 불확실해진다.
  const chip =
    "inline-flex h-11 items-center justify-center gap-1.5 rounded-full text-sm font-bold transition disabled:opacity-30";
  const chipOff =
    "border border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface-variant)] hover:bg-[color-mix(in_srgb,var(--md-sys-color-on-surface)_8%,transparent)]";
  const chipOn =
    "bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)]";

  return createPortal(
    <div
      className="fixed inset-0 z-[140] flex items-center justify-center bg-[rgba(0,0,0,0.55)] p-2 sm:p-4"
      role="dialog"
      aria-label={title}
    >
      <div className="flex h-full max-h-[96vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl bg-[var(--md-sys-color-surface-container-high)] shadow-[var(--md-sys-elevation-3)]">
        {/* 머리말 */}
        <div className="flex shrink-0 items-center gap-2 border-b border-[var(--md-sys-color-outline-variant)] px-4 py-3">
          <Icon name="draw" size={20} className="text-[var(--md-sys-color-primary)]" />
          <h2 className="flex-1 text-base font-bold text-[var(--md-sys-color-on-surface)]">
            {title}
          </h2>
          <button
            type="button"
            onClick={requestClose}
            aria-label="닫기"
            className="flex h-11 w-11 items-center justify-center rounded-full text-[var(--md-sys-color-on-surface-variant)] transition hover:bg-[color-mix(in_srgb,var(--md-sys-color-on-surface)_8%,transparent)]"
          >
            <Icon name="close" size={22} />
          </button>
        </div>

        {/* 도구 · 굵기 · 종이 · 되돌리기 */}
        <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-[var(--md-sys-color-outline-variant)] px-3 py-2">
          <div className="flex items-center gap-1">
            {TOOLS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTool(t.id)}
                title={t.label}
                aria-label={t.label}
                aria-pressed={tool === t.id}
                className={`flex h-11 w-11 items-center justify-center rounded-full transition ${
                  tool === t.id
                    ? "bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)]"
                    : "text-[var(--md-sys-color-on-surface-variant)] hover:bg-[color-mix(in_srgb,var(--md-sys-color-on-surface)_8%,transparent)]"
                }`}
              >
                <Icon name={t.icon} size={22} />
              </button>
            ))}
          </div>

          {tool !== "fill" && (
            <div className="flex items-center gap-1">
              {WIDTHS.map((s) => (
                <button
                  key={s.w}
                  type="button"
                  onClick={() => setWidth(s.w)}
                  title={s.label}
                  aria-label={s.label}
                  aria-pressed={width === s.w}
                  className={`flex h-11 w-11 items-center justify-center rounded-full transition ${
                    width === s.w
                      ? "bg-[var(--md-sys-color-secondary-container)]"
                      : "hover:bg-[color-mix(in_srgb,var(--md-sys-color-on-surface)_8%,transparent)]"
                  }`}
                >
                  <span
                    className="rounded-full"
                    style={{
                      width: Math.max(5, s.w * 0.62),
                      height: Math.max(5, s.w * 0.62),
                      background:
                        tool === "eraser"
                          ? "var(--md-sys-color-on-surface-variant)"
                          : color,
                    }}
                  />
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center gap-1">
            {PAPERS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPaper(p.id)}
                title={p.label}
                aria-label={p.label}
                aria-pressed={paper === p.id}
                className={`flex h-11 w-11 items-center justify-center rounded-full transition ${
                  paper === p.id
                    ? "bg-[var(--md-sys-color-secondary-container)] text-[var(--md-sys-color-on-secondary-container)]"
                    : "text-[var(--md-sys-color-on-surface-variant)] hover:bg-[color-mix(in_srgb,var(--md-sys-color-on-surface)_8%,transparent)]"
                }`}
              >
                <Icon name={p.icon} size={20} />
              </button>
            ))}
          </div>

          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={undo}
              disabled={hist.n === 0}
              title="되돌리기"
              aria-label="되돌리기"
              className={`${chip} ${chipOff} w-11`}
            >
              <Icon name="undo" size={20} />
            </button>
            <button
              type="button"
              onClick={redo}
              disabled={hist.r === 0}
              title="다시 실행"
              aria-label="다시 실행"
              className={`${chip} ${chipOff} w-11`}
            >
              <Icon name="redo" size={20} />
            </button>
            <button
              type="button"
              onClick={clearAll}
              disabled={hist.n === 0}
              className={`${chip} ${chipOff} px-4`}
            >
              <Icon name="delete_sweep" size={20} />
              전체 지우기
            </button>
          </div>
        </div>

        {/* 색 */}
        <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto border-b border-[var(--md-sys-color-outline-variant)] px-3 py-2">
          {PALETTE.map((c) => (
            <button
              key={c.hex}
              type="button"
              onClick={() => {
                setColor(c.hex);
                if (tool === "eraser") setTool("pen"); // 색을 고르면 다시 그리기 모드로
              }}
              title={c.label}
              aria-label={c.label}
              aria-pressed={color === c.hex}
              className={`h-8 w-8 shrink-0 rounded-full ring-1 ring-black/15 transition hover:scale-110 ${
                color === c.hex
                  ? "outline outline-2 outline-offset-2 outline-[var(--md-sys-color-primary)]"
                  : ""
              }`}
              style={{ backgroundColor: c.hex }}
            />
          ))}
          <label
            className="ml-1 flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-[var(--md-sys-color-outline-variant)] px-3 text-xs font-bold text-[var(--md-sys-color-on-surface-variant)] transition hover:bg-[color-mix(in_srgb,var(--md-sys-color-on-surface)_8%,transparent)]"
            title="직접 색 고르기"
          >
            <span
              className="h-4 w-4 rounded-full ring-1 ring-black/15"
              style={{
                background:
                  "conic-gradient(red, orange, yellow, lime, cyan, blue, magenta, red)",
              }}
            />
            직접 고르기
            <input
              type="color"
              value={color}
              onChange={(e) => {
                setColor(e.target.value);
                if (tool === "eraser") setTool("pen");
              }}
              className="h-0 w-0 opacity-0"
            />
          </label>
        </div>

        {/* 종이 */}
        <div className="flex min-h-0 flex-1 items-center justify-center bg-[var(--md-sys-color-surface-container)] p-2">
          <div ref={fitRef} className="flex h-full w-full items-center justify-center">
            <div
              className="relative overflow-hidden rounded-xl ring-1 ring-black/10"
              style={{ width: box.w, height: box.h }}
            >
              <canvas
                ref={paperRef}
                width={W}
                height={H}
                className="absolute inset-0 h-full w-full"
              />
              <canvas
                ref={drawRef}
                width={W}
                height={H}
                onPointerDown={onDown}
                onPointerMove={onMove}
                onPointerUp={onUp}
                onPointerCancel={onUp}
                className="absolute inset-0 h-full w-full touch-none"
                style={{ cursor: tool === "fill" ? "cell" : "crosshair" }}
              />
            </div>
          </div>
        </div>

        {/* 마무리 */}
        <div className="flex shrink-0 items-center gap-2 border-t border-[var(--md-sys-color-outline-variant)] px-4 py-3">
          <p className="hidden flex-1 text-xs text-[var(--md-sys-color-on-surface-variant)] sm:block">
            손가락·터치펜·마우스로 그릴 수 있어요. 다 그렸으면 “그림 넣기”를 누르세요.
          </p>
          <div className="flex flex-1 justify-end gap-2 sm:flex-none">
            <button
              type="button"
              onClick={requestClose}
              className={`${chip} ${chipOff} px-5`}
            >
              취소
            </button>
            <button
              type="button"
              onClick={save}
              disabled={busy || hist.n === 0}
              className={`${chip} ${chipOn} px-6`}
            >
              <Icon name={busy ? "progress_activity" : "check"} size={20} className={busy ? "animate-spin" : ""} />
              그림 넣기
            </button>
          </div>
        </div>
      </div>

      {confirmClose && (
        <div className="absolute inset-0 z-[1] flex items-center justify-center bg-[rgba(0,0,0,0.45)] p-4">
          <div className="w-full max-w-xs rounded-3xl bg-[var(--md-sys-color-surface-container-high)] p-5 text-center shadow-[var(--md-sys-elevation-3)]">
            <p className="text-sm font-bold text-[var(--md-sys-color-on-surface)]">
              그리던 그림이 사라져요.
            </p>
            <p className="mt-1 text-xs text-[var(--md-sys-color-on-surface-variant)]">
              정말 닫을까요?
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmClose(false)}
                className={`${chip} ${chipOff} flex-1 px-4`}
              >
                더 그릴래요
              </button>
              <button
                type="button"
                onClick={onClose}
                className={`${chip} flex-1 bg-[var(--md-sys-color-error)] px-4 text-white`}
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}
