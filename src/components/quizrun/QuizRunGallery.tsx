"use client";

/**
 * 퀴즈런 학급 전시 — 끝난 순간의 공 사진을 그리드로 걸고 저장한다.
 *
 * 저장 방식이 셋인 이유:
 *   · PNG  : 한 장으로 뽑아 교실 게시판에 붙이기 좋다. 다만 캔버스에 다른
 *            도메인 이미지를 그리면 브라우저가 "오염"으로 보고 저장을 막는다.
 *            그래서 먼저 한 장으로 시험해 보고, 되는 경우에만 버튼을 연다.
 *   · HTML : 사진 주소를 그대로 담은 한 파일. 어디서 열어도 같은 화면이 뜬다.
 *   · PDF  : 브라우저 인쇄창을 띄운다(라이브러리 없이 가장 확실한 경로).
 *
 * 사진이 하나도 없으면 전시 자체를 걸지 않는다.
 */

import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { useNameMask } from "@/components/NameMask";
import type { QuizRun, RankBreakdown } from "@/lib/quizrun";

type Entry = {
  uid: string;
  name: string;
  rank: number;
  collected: number;
  stageIndex: number;
  shotUrl: string;
};

/** 이미지를 캔버스에 그려도 되는지(교차 출처 허용) 한 장으로 시험한다. */
async function canDrawCrossOrigin(url: string): Promise<boolean> {
  try {
    const img = await loadImage(url);
    const c = document.createElement("canvas");
    c.width = 2;
    c.height = 2;
    const ctx = c.getContext("2d");
    if (!ctx) return false;
    ctx.drawImage(img, 0, 0, 2, 2);
    c.toDataURL("image/png"); // 오염됐다면 여기서 예외가 난다
    return true;
  } catch {
    return false;
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("이미지를 불러올 수 없습니다."));
    img.src = url;
  });
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function QuizRunGallery({
  ranking,
  runs,
  uid,
  title,
}: {
  ranking: RankBreakdown[];
  runs: QuizRun[];
  uid: string;
  title: string;
}) {
  const { mask } = useNameMask();
  const [pngOk, setPngOk] = useState(false);
  const [busy, setBusy] = useState(false);

  const entries = useMemo<Entry[]>(() => {
    const shotByUid = new Map(
      runs.filter((r) => r.shotUrl).map((r) => [r.uid, r.shotUrl as string])
    );
    return ranking
      .map((r, i) => ({
        uid: r.uid,
        name: r.name,
        rank: i + 1,
        collected: r.collected,
        stageIndex: r.stageIndex,
        shotUrl: shotByUid.get(r.uid) ?? "",
      }))
      .filter((e) => e.shotUrl);
  }, [ranking, runs]);

  // PNG 로 뽑을 수 있는 환경인지 첫 사진으로 확인한다
  useEffect(() => {
    if (entries.length === 0) return;
    let alive = true;
    void canDrawCrossOrigin(entries[0].shotUrl).then((ok) => {
      if (alive) setPngOk(ok);
    });
    return () => {
      alive = false;
    };
  }, [entries]);

  if (entries.length === 0) return null;

  const filenameBase = `퀴즈런-전시-${new Date().toISOString().slice(0, 10)}`;

  async function savePng() {
    setBusy(true);
    try {
      const cols = Math.min(4, Math.ceil(Math.sqrt(entries.length)));
      const rows = Math.ceil(entries.length / cols);
      const cell = 320;
      const pad = 16;
      const caption = 46;
      const header = 72;
      const canvas = document.createElement("canvas");
      canvas.width = cols * (cell + pad) + pad;
      canvas.height = header + rows * (cell + caption + pad) + pad;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#101418";
      ctx.font = "bold 30px system-ui, sans-serif";
      ctx.textBaseline = "top";
      ctx.fillText(title, pad, 22);

      const images = await Promise.all(entries.map((e) => loadImage(e.shotUrl)));
      entries.forEach((e, i) => {
        const cx = pad + (i % cols) * (cell + pad);
        const cy = header + Math.floor(i / cols) * (cell + caption + pad);
        const img = images[i];
        // 정사각 칸에 꽉 차게, 비율은 유지(가운데를 살린다)
        const scale = Math.max(cell / img.width, cell / img.height);
        const dw = img.width * scale;
        const dh = img.height * scale;
        ctx.save();
        ctx.beginPath();
        ctx.rect(cx, cy, cell, cell);
        ctx.clip();
        ctx.drawImage(img, cx + (cell - dw) / 2, cy + (cell - dh) / 2, dw, dh);
        ctx.restore();
        ctx.strokeStyle = "#dde3ec";
        ctx.lineWidth = 2;
        ctx.strokeRect(cx, cy, cell, cell);

        ctx.fillStyle = "#101418";
        ctx.font = "bold 20px system-ui, sans-serif";
        ctx.fillText(`${e.rank}. ${mask(e.name)}`, cx + 2, cy + cell + 6);
        ctx.fillStyle = "#5b6675";
        ctx.font = "16px system-ui, sans-serif";
        ctx.fillText(
          `${e.collected}개 · 맵 ${e.stageIndex + 1}`,
          cx + 2,
          cy + cell + 28
        );
      });

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/png")
      );
      if (blob) downloadBlob(blob, `${filenameBase}.png`);
    } catch {
      setPngOk(false);
    } finally {
      setBusy(false);
    }
  }

  function saveHtml() {
    const cards = entries
      .map(
        (e) => `    <figure>
      <img src="${e.shotUrl}" alt="${mask(e.name)}의 러닝볼" />
      <figcaption><b>${e.rank}. ${mask(e.name)}</b><span>${e.collected}개 · 맵 ${
          e.stageIndex + 1
        }</span></figcaption>
    </figure>`
      )
      .join("\n");
    const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
<style>
  body { margin: 0; padding: 24px; background: #f6f8fb; color: #101418;
         font-family: system-ui, -apple-system, "Apple SD Gothic Neo", sans-serif; }
  h1 { font-size: 22px; margin: 0 0 16px; }
  .grid { display: grid; gap: 16px;
          grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); }
  figure { margin: 0; background: #fff; border-radius: 16px; overflow: hidden;
           box-shadow: 0 2px 8px rgba(16,20,24,.08); }
  img { display: block; width: 100%; aspect-ratio: 1; object-fit: cover; }
  figcaption { display: flex; flex-direction: column; gap: 2px; padding: 10px 12px; }
  figcaption span { color: #5b6675; font-size: 13px; }
</style>
</head>
<body>
<h1>${title}</h1>
<div class="grid">
${cards}
</div>
</body>
</html>`;
    downloadBlob(new Blob([html], { type: "text/html;charset=utf-8" }), `${filenameBase}.html`);
  }

  function savePdf() {
    // 인쇄창에서 "PDF 로 저장" 을 고르면 된다 — 별도 라이브러리가 필요 없다.
    window.print();
  }

  return (
    <section className="mt-4 w-full">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <p className="flex items-center gap-1.5 text-sm font-bold">
          <Icon
            name="gallery_thumbnail"
            size={18}
            className="text-[var(--md-sys-color-primary)]"
          />
          우리 반 러닝볼 전시
          <span className="text-xs font-normal text-[var(--md-sys-color-on-surface-variant)]">
            {entries.length}명
          </span>
        </p>
        <div className="ml-auto flex flex-wrap gap-1.5 print:hidden">
          {pngOk && (
            <button
              onClick={savePng}
              disabled={busy}
              className="inline-flex items-center gap-1 rounded-full bg-[var(--md-sys-color-primary)] px-3 py-1.5 text-xs font-bold text-[var(--md-sys-color-on-primary)] disabled:opacity-40"
            >
              <Icon name="image" size={14} />
              {busy ? "만드는 중…" : "PNG"}
            </button>
          )}
          <button
            onClick={saveHtml}
            className="inline-flex items-center gap-1 rounded-full bg-[var(--md-sys-color-surface-container-high)] px-3 py-1.5 text-xs font-bold"
          >
            <Icon name="code" size={14} />
            HTML
          </button>
          <button
            onClick={savePdf}
            className="inline-flex items-center gap-1 rounded-full bg-[var(--md-sys-color-surface-container-high)] px-3 py-1.5 text-xs font-bold"
          >
            <Icon name="picture_as_pdf" size={14} />
            PDF
          </button>
        </div>
      </div>

      <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
        {entries.map((e) => (
          <li
            key={e.uid}
            className={`overflow-hidden rounded-2xl bg-[var(--md-sys-color-surface-container)] ${
              e.uid === uid
                ? "ring-2 ring-[var(--md-sys-color-primary)]"
                : ""
            }`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={e.shotUrl}
              alt={`${mask(e.name)}의 러닝볼`}
              className="aspect-square w-full object-cover"
              loading="lazy"
            />
            <div className="flex flex-col gap-0.5 px-2.5 py-2">
              <p className="truncate text-xs font-bold">
                {e.rank}. {mask(e.name)}
              </p>
              <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
                {e.collected}개 · 맵 {e.stageIndex + 1}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
