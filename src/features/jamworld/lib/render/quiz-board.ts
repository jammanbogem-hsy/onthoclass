import type { Rot } from "../world/types";

/** Screen planes in the shipped atlas frames. Repaint only the display, keeping its frame and legs. */
export function quizScreenPlane(atlas: string, rot: Rot) {
  const side = rot === 90 || rot === 270;
  if (atlas === "td-building") return side
    ? { fw: 90, fh: 256, x: 39, y: 91, w: 15, h: 62, slope: 0, profile: true }
    : { fw: 219, fh: 256, x: 42, y: 72, w: 135, h: 75, slope: 0, profile: false };
  if (atlas === "iso-building") return side
    ? { fw: 208, fh: 256, x: 67, y: 108, w: 109, h: 61, slope: -48 / 109, profile: false }
    : { fw: 192, fh: 256, x: 31, y: 66, w: 89, h: 59, slope: 37 / 89, profile: false };
  return null;
}

export function paintQuizScreen(ctx: CanvasRenderingContext2D, atlas: string, rot: Rot, x: number, y: number, w: number, h: number, label: string) {
  const p = quizScreenPlane(atlas, rot);
  if (!p) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(w / p.fw, h / p.fh);
  ctx.translate(p.x, p.y);
  ctx.transform(1, p.slope, 0, 1, 0, 0);
  const gradient = ctx.createLinearGradient(0, 0, 0, p.h);
  gradient.addColorStop(0, "#157c68"); gradient.addColorStop(1, "#0a5148");
  ctx.fillStyle = gradient;
  ctx.beginPath(); ctx.roundRect(0, 0, p.w, p.h, p.profile ? 5 : 4); ctx.fill();
  ctx.fillStyle = "#edfff2";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  if (p.profile) {
    ctx.font = "bold 18px system-ui, sans-serif";
    ctx.fillText("✓", p.w / 2, p.h / 2, p.w - 2);
  } else {
    ctx.font = `bold ${Math.min(34, p.w / Math.max(2.5, Array.from(label).length))}px system-ui, sans-serif`;
    ctx.fillText(label, p.w / 2, p.h / 2, p.w - 8);
  }
  ctx.restore();
}
