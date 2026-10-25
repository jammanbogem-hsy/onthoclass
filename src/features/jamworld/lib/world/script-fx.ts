// 맵 코드가 부르는 연출 — 오브젝트 움직임(animate), 날아가는 물체(launch), 터지는 효과(effect), 소리(sound), 화면 버튼(button).
// 모두 학생 개인 플레이에서만 보이는 표시용이며 맵 원본·서버에는 쓰지 않는다.

export const ANIMATIONS = ["bounce", "spin", "pulse", "float", "shake", "flash", "wobble", "none"] as const;
export type AnimationType = (typeof ANIMATIONS)[number];
export const EFFECTS = ["confetti", "sparkle", "boom", "hearts", "smoke", "stars"] as const;
export type EffectType = (typeof EFFECTS)[number];
export const SOUNDS = ["hit", "coin", "win", "fail", "jump", "pop", "whoosh", "click", "tick"] as const;
export type SoundName = (typeof SOUNDS)[number];

/** 오브젝트 id → 진행 중인 움직임(until=Infinity 는 계속) */
export interface ObjectFx { type: AnimationType; start: number; until: number }
export interface Projectile {
  id: string; sprite: string; from: { x: number; y: number }; to: { x: number; y: number };
  start: number; ms: number; arc: number; size: number; spin: boolean;
}
export interface Particle { x: number; y: number; vx: number; vy: number; vz: number; z: number; born: number; life: number; glyph: string; color: string; size: number }

const num = (v: unknown, lo: number, hi: number) => typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;
const str = (v: unknown, max: number): v is string => typeof v === "string" && v.length <= max;
const point = (v: unknown) => !!v && typeof v === "object" && num((v as { x: unknown }).x, -1, 121) && num((v as { y: unknown }).y, -1, 121);

/** 새 동작 검사 — 틀리면 이유를 한국어로 */
export function validateFxAction(kind: string, v: Record<string, unknown>): boolean {
  if (kind === "animate") {
    if (!str(v.id, 120) || !v.id || !ANIMATIONS.includes(v.type as AnimationType) || !(v.ms === 0 || num(v.ms, 100, 60000)))
      throw Error(`움직임을 확인해 주세요: World.animate(오브젝트, ${ANIMATIONS.join("|")}, ms 또는 0=계속)`);
  } else if (kind === "launch") {
    if (!str(v.id, 60) || !v.id || !point(v.from) || !point(v.to) || !num(v.ms, 100, 15000) || !str(v.sprite, 40) || !v.sprite ||
        (v.arc !== undefined && !num(v.arc, 0, 8)) || (v.size !== undefined && !num(v.size, 0.2, 4)))
      throw Error("날리기를 확인해 주세요: World.launch(id,{from:{x,y},to:{x,y},ms,sprite,arc?,size?})");
  } else if (kind === "effect") {
    if (!EFFECTS.includes(v.type as EffectType) || !num(v.x, -1, 121) || !num(v.y, -1, 121))
      throw Error(`효과를 확인해 주세요: World.effect(${EFFECTS.join("|")}, x, y)`);
  } else if (kind === "sound") {
    if (!SOUNDS.includes(v.name as SoundName)) throw Error(`소리를 확인해 주세요: World.sound(${SOUNDS.join("|")})`);
  } else if (kind === "button") {
    if (!str(v.id, 40) || !v.id || !str(v.label, 12)) throw Error("버튼을 확인해 주세요: World.button(id, 이름 1~12자, ''=지우기)");
  } else return false;
  return true;
}

const PALETTE = ["#ff6f61", "#ffd166", "#19c2b5", "#5582e5", "#b36bff", "#ff9bd2"];
export function burst(type: EffectType, x: number, y: number, now: number): Particle[] {
  const n = type === "boom" ? 22 : type === "smoke" ? 10 : 18;
  const glyph = type === "hearts" ? "♥" : type === "stars" ? "★" : type === "sparkle" ? "✦" : "";
  const out: Particle[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.5, sp = (type === "boom" ? 3.2 : type === "smoke" ? 0.6 : 1.8) * (0.5 + Math.random());
    out.push({
      x, y, z: 0.4, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vz: type === "smoke" ? 0.8 : 2 + Math.random() * 2.5,
      born: now, life: type === "smoke" ? 1.6 : 1 + Math.random() * 0.5, glyph,
      color: type === "smoke" ? "#c9d2dc" : type === "boom" ? ["#ff6f61", "#ffb347", "#ffd166"][i % 3] : PALETTE[i % PALETTE.length],
      size: type === "smoke" ? 9 : type === "boom" ? 5 : 6,
    });
  }
  return out;
}

/** 날아가는 물체의 지금 위치(칸 좌표)와 높이 */
export function projectileAt(p: Projectile, now: number) {
  const u = Math.min(1, Math.max(0, (now - p.start) / (p.ms / 1000)));
  return { x: p.from.x + (p.to.x - p.from.x) * u, y: p.from.y + (p.to.y - p.from.y) * u, z: Math.sin(u * Math.PI) * p.arc, u };
}

/** 오브젝트 움직임 → 그리기 변환(화면 px, zoom 곱하기 전) */
export function fxTransform(fx: ObjectFx | undefined, now: number) {
  if (!fx || fx.type === "none" || now > fx.until) return null;
  const u = now - fx.start;
  switch (fx.type) {
    case "bounce": return { dx: 0, dy: -Math.abs(Math.sin(u * 7)) * 12, scale: 1, rot: 0, alpha: 1 };
    case "float": return { dx: 0, dy: Math.sin(u * 2.6) * 6 - 6, scale: 1, rot: 0, alpha: 1 };
    case "pulse": return { dx: 0, dy: 0, scale: 1 + Math.sin(u * 8) * 0.1, rot: 0, alpha: 1 };
    case "spin": return { dx: 0, dy: 0, scale: 1, rot: u * 6, alpha: 1 };
    case "wobble": return { dx: 0, dy: 0, scale: 1, rot: Math.sin(u * 9) * 0.18, alpha: 1 };
    case "shake": return { dx: Math.sin(u * 55) * 4, dy: 0, scale: 1, rot: 0, alpha: 1 };
    case "flash": return { dx: 0, dy: 0, scale: 1, rot: 0, alpha: 0.35 + 0.65 * Math.abs(Math.cos(u * 9)) };
  }
}

let audio: AudioContext | null = null;
/** 파일 없이 짧은 효과음(웹 오디오) */
export function playSound(name: SoundName) {
  try {
    audio ??= new AudioContext();
    const ctx = audio, t = ctx.currentTime;
    const tone = (freq: number, at: number, len: number, type: OscillatorType = "square", to?: number, vol = 0.12) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, t + at);
      if (to) o.frequency.exponentialRampToValueAtTime(to, t + at + len);
      g.gain.setValueAtTime(vol, t + at); g.gain.exponentialRampToValueAtTime(0.0001, t + at + len);
      o.connect(g).connect(ctx.destination); o.start(t + at); o.stop(t + at + len + 0.02);
    };
    if (name === "hit") { tone(220, 0, 0.12, "square", 80, 0.18); tone(880, 0, 0.05, "triangle", undefined, 0.1); }
    else if (name === "coin") { tone(988, 0, 0.08); tone(1319, 0.08, 0.22); }
    else if (name === "win") [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.11, 0.2, "triangle", undefined, 0.14));
    else if (name === "fail") { tone(392, 0, 0.18, "sawtooth", 196, 0.1); tone(262, 0.18, 0.3, "sawtooth", 130, 0.1); }
    else if (name === "jump") tone(300, 0, 0.18, "square", 900, 0.1);
    else if (name === "pop") tone(600, 0, 0.07, "sine", 1200, 0.16);
    else if (name === "whoosh") tone(1400, 0, 0.3, "sawtooth", 200, 0.05);
    else if (name === "click") tone(1800, 0, 0.03, "square", undefined, 0.08);
    else if (name === "tick") tone(1200, 0, 0.04, "sine", undefined, 0.1);
  } catch { /* 소리를 낼 수 없는 기기는 조용히 넘어간다 */ }
}
