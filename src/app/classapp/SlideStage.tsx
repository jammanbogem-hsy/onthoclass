"use client";

// 교안 슬라이드 스테이지 — 좌측 큰 화면. DB 저장 없이 브라우저에서만 표시.
//  · PDF  : pdf.js 로 한 페이지씩 렌더 → 전자책처럼 좌/우로 넘김(키보드 화살표)
//  · 이미지: 여러 장 슬라이드쇼
//  · 화면 공유: 모니터2의 PPT 슬라이드쇼 등을 실시간 미러링(애니메이션 그대로)
import { useCallback, useEffect, useRef, useState } from "react";

// pdf.js 문서 최소 타입(동적 import 라 전체 타입은 가져오지 않음)
type PdfPage = {
  getViewport: (o: { scale: number }) => { width: number; height: number };
  render: (o: { canvasContext: CanvasRenderingContext2D; viewport: unknown }) => {
    promise: Promise<void>;
    cancel: () => void;
  };
};
type PdfDoc = { numPages: number; getPage: (n: number) => Promise<PdfPage> };

type Source =
  | { kind: "pdf"; doc: PdfDoc | null; name: string; fallbackUrl: string }
  | { kind: "images"; urls: string[]; names: string[] }
  | { kind: "screen"; stream: MediaStream }
  | null;

const isPdf = (f: File) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf");
const byName = (a: File, b: File) => a.name.localeCompare(b.name, undefined, { numeric: true });

export function SlideStage() {
  const [src, setSrc] = useState<Source>(null);
  const [idx, setIdx] = useState(0); // 0-based 페이지/이미지
  const [dragOver, setDragOver] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isFs, setIsFs] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const objectUrls = useRef<string[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const cleanup = useCallback(() => {
    objectUrls.current.forEach((u) => URL.revokeObjectURL(u));
    objectUrls.current = [];
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);
  useEffect(() => () => cleanup(), [cleanup]);

  const total =
    src?.kind === "pdf" ? src.doc?.numPages ?? 0 : src?.kind === "images" ? src.urls.length : 0;

  const reset = useCallback(() => {
    cleanup();
    setSrc(null);
    setIdx(0);
  }, [cleanup]);

  const openFiles = useCallback(
    async (files: FileList | File[]) => {
      const arr = Array.from(files);
      if (arr.length === 0) return;
      const pdf = arr.find(isPdf);
      cleanup();
      setIdx(0);
      if (pdf) {
        setLoading(true);
        const url = URL.createObjectURL(pdf);
        objectUrls.current = [url];
        try {
          const pdfjs = await import("pdfjs-dist");
          pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
          const data = await pdf.arrayBuffer();
          const doc = (await pdfjs.getDocument({ data }).promise) as unknown as PdfDoc;
          setSrc({ kind: "pdf", doc, name: pdf.name, fallbackUrl: url });
        } catch {
          // pdf.js 실패 시 브라우저 내장 뷰어로 폴백
          setSrc({ kind: "pdf", doc: null, name: pdf.name, fallbackUrl: url });
        } finally {
          setLoading(false);
        }
        return;
      }
      const imgs = arr.filter((f) => f.type.startsWith("image/")).sort(byName);
      if (imgs.length > 0) {
        const urls = imgs.map((f) => URL.createObjectURL(f));
        objectUrls.current = urls;
        setSrc({ kind: "images", urls, names: imgs.map((f) => f.name) });
      }
    },
    [cleanup]
  );

  const shareScreen = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 },
        audio: false,
      });
      cleanup();
      streamRef.current = stream;
      // 브라우저 '공유 중지' UI 로 끄면 자동으로 비움
      stream.getVideoTracks()[0]?.addEventListener("ended", () => reset());
      setIdx(0);
      setSrc({ kind: "screen", stream });
    } catch {
      /* 사용자가 취소 */
    }
  }, [cleanup, reset]);

  const go = useCallback(
    (d: number) => setIdx((i) => Math.min(Math.max(i + d, 0), Math.max(total - 1, 0))),
    [total]
  );

  // 키보드 좌/우 넘김(PDF·이미지)
  useEffect(() => {
    if (src?.kind !== "pdf" && src?.kind !== "images") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " ") {
        e.preventDefault();
        go(1);
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        go(-1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [src, go]);

  // 전체화면
  const toggleFullscreen = useCallback(() => {
    const el = stageRef.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else el.requestFullscreen?.().catch(() => {});
  }, []);
  useEffect(() => {
    const onFs = () => setIsFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const dropHandlers = {
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(true);
    },
    onDragLeave: () => setDragOver(false),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (e.dataTransfer.files.length) openFiles(e.dataTransfer.files);
    },
  };

  const showPager = src?.kind === "pdf" ? !!src.doc : src?.kind === "images";

  // 드래그/스와이프로 페이지 넘김(PDF·이미지) — 왼쪽으로 밀면 다음, 오른쪽으로 밀면 이전
  const swipeStart = useRef<number | null>(null);
  const swipeHandlers = showPager
    ? {
        onPointerDown: (e: React.PointerEvent) => {
          swipeStart.current = e.clientX;
        },
        onPointerUp: (e: React.PointerEvent) => {
          const s = swipeStart.current;
          swipeStart.current = null;
          if (s == null) return;
          const dx = e.clientX - s;
          if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
        },
        style: { touchAction: "pan-y" as const, cursor: "grab" },
      }
    : {};

  return (
    <div className="flex h-full flex-col">
      {/* 상단 바 */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,image/*"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && openFiles(e.target.files)}
        />
        <button
          onClick={() => inputRef.current?.click()}
          className="rounded-full bg-[var(--md-sys-color-primary)] px-4 py-2 text-sm font-bold text-[var(--md-sys-color-on-primary)]"
        >
          📂 교안 열기 (PDF·이미지)
        </button>
        <button
          onClick={shareScreen}
          className="rounded-full border border-[var(--md-sys-color-outline)] px-4 py-2 text-sm font-bold text-[var(--md-sys-color-primary)]"
          title="다른 화면(모니터2의 PPT 슬라이드쇼 등)을 실시간 미러링 — 애니메이션 그대로"
        >
          🖥️ 화면 공유
        </button>
        {src && (
          <>
            <span className="truncate text-sm font-medium text-[var(--md-sys-color-on-surface-variant)]">
              {src.kind === "pdf"
                ? src.name
                : src.kind === "images"
                  ? `이미지 ${total}장`
                  : "화면 공유 중"}
            </span>
            <button
              onClick={toggleFullscreen}
              className="ml-auto rounded-full bg-[var(--md-sys-color-primary)] px-3 py-1.5 text-xs font-bold text-[var(--md-sys-color-on-primary)]"
              title="교안 전체화면 (Esc로 종료)"
            >
              ⛶ 전체화면
            </button>
            <button
              onClick={reset}
              className="rounded-full border border-[var(--md-sys-color-outline-variant)] px-3 py-1.5 text-xs font-medium text-[var(--md-sys-color-on-surface-variant)]"
            >
              닫기
            </button>
          </>
        )}
      </div>

      {/* 스테이지 */}
      <div
        ref={stageRef}
        {...dropHandlers}
        {...swipeHandlers}
        className={[
          "relative flex-1 select-none overflow-hidden rounded-2xl border-2 bg-black",
          dragOver
            ? "border-[var(--md-sys-color-primary)]"
            : "border-[var(--md-sys-color-outline-variant)]",
        ].join(" ")}
      >
        {isFs && src && (
          <button
            onClick={toggleFullscreen}
            className="absolute right-3 top-3 z-20 rounded-full bg-black/45 px-3 py-1.5 text-xs font-bold text-white hover:bg-black/65"
          >
            ⛶ 전체화면 종료
          </button>
        )}

        {/* 빈 화면 */}
        {!src && !loading && (
          <div className="flex h-full flex-col items-center justify-center gap-3 bg-[var(--md-sys-color-surface-container)] px-6 text-center">
            <span className="emoji-noto text-6xl">🖥️</span>
            <p className="text-lg font-bold text-[var(--md-sys-color-on-surface)]">
              교안(PDF·이미지)을 끌어다 놓거나 ‘교안 열기’를 눌러요
            </p>
            <p className="max-w-md text-sm leading-relaxed text-[var(--md-sys-color-on-surface-variant)]">
              PDF·이미지는 전자책처럼 <b>좌우로 드래그(스와이프)</b>하거나 화살표로 넘겨요.
              애니메이션이 있는 PPT는 모니터2에서 슬라이드쇼로 켠 뒤 <b>‘화면 공유’</b>로
              실시간 미러링해요(넘김은 모니터2의 PowerPoint에서 조작).
              <br />
              올린 자료는 저장되지 않고 이 화면에서만 보여요.
            </p>
          </div>
        )}

        {loading && (
          <div className="flex h-full items-center justify-center bg-[var(--md-sys-color-surface-container)] text-sm text-[var(--md-sys-color-on-surface-variant)]">
            교안을 준비하는 중…
          </div>
        )}

        {/* PDF — pdf.js 렌더(전자책) 또는 폴백(iframe) */}
        {src?.kind === "pdf" && src.doc && (
          <PdfCanvas doc={src.doc} page={idx + 1} />
        )}
        {src?.kind === "pdf" && !src.doc && (
          <iframe src={`${src.fallbackUrl}#view=FitH`} title="교안" className="h-full w-full bg-white" />
        )}

        {/* 이미지 */}
        {src?.kind === "images" && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={idx}
            src={src.urls[idx]}
            alt={src.names[idx]}
            className="absolute inset-0 m-auto max-h-full max-w-full object-contain"
            style={{ animation: "slideIn .22s ease" }}
          />
        )}

        {/* 화면 공유(실시간) */}
        {src?.kind === "screen" && <ScreenVideo stream={src.stream} />}

        {/* 좌/우 넘김(전자책) */}
        {showPager && (
          <>
            <button
              onClick={() => go(-1)}
              disabled={idx === 0}
              className="absolute left-0 top-0 flex h-full w-[12%] items-center justify-start pl-3 text-3xl text-white/0 transition hover:bg-gradient-to-r hover:from-black/35 hover:to-transparent hover:text-white/90 disabled:pointer-events-none"
              aria-label="이전 페이지"
            >
              ‹
            </button>
            <button
              onClick={() => go(1)}
              disabled={idx >= total - 1}
              className="absolute right-0 top-0 flex h-full w-[12%] items-center justify-end pr-3 text-3xl text-white/0 transition hover:bg-gradient-to-l hover:from-black/35 hover:to-transparent hover:text-white/90 disabled:pointer-events-none"
              aria-label="다음 페이지"
            >
              ›
            </button>
            <span className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/55 px-3 py-1 text-sm font-bold text-white">
              {idx + 1} / {total}
            </span>
          </>
        )}
      </div>
      <style>{`@keyframes slideIn{from{opacity:.3;transform:translateX(14px)}to{opacity:1;transform:none}}`}</style>
    </div>
  );
}

// ── PDF 한 페이지를 부모 크기에 맞춰 캔버스로 렌더 ──
function PdfCanvas({ doc, page }: { doc: PdfDoc; page: number }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setBox({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    let task: { promise: Promise<void>; cancel: () => void } | null = null;
    (async () => {
      const canvas = canvasRef.current;
      if (!canvas || box.w === 0 || box.h === 0) return;
      const pg = await doc.getPage(page);
      if (cancelled) return;
      const base = pg.getViewport({ scale: 1 });
      const fit = Math.min(box.w / base.width, box.h / base.height);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const vp = pg.getViewport({ scale: fit * dpr });
      canvas.width = Math.floor(vp.width);
      canvas.height = Math.floor(vp.height);
      canvas.style.width = `${Math.floor(vp.width / dpr)}px`;
      canvas.style.height = `${Math.floor(vp.height / dpr)}px`;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      task = pg.render({ canvasContext: ctx, viewport: vp });
      try {
        await task.promise;
      } catch {
        /* 페이지 빠르게 넘기면 취소됨 */
      }
    })();
    return () => {
      cancelled = true;
      try {
        task?.cancel();
      } catch {}
    };
  }, [doc, page, box]);

  return (
    <div ref={wrapRef} className="flex h-full w-full items-center justify-center bg-black">
      <canvas
        key={page}
        ref={canvasRef}
        className="shadow-2xl"
        style={{ animation: "slideIn .22s ease" }}
      />
    </div>
  );
}

// ── 화면 공유 비디오(실시간 미러링) ──
function ScreenVideo({ stream }: { stream: MediaStream }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    v.srcObject = stream;
    v.play().catch(() => {});
  }, [stream]);
  return (
    <video ref={ref} autoPlay muted playsInline className="absolute inset-0 h-full w-full object-contain" />
  );
}
