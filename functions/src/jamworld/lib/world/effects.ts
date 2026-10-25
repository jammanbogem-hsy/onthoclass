import type { MapDoc, Zone } from './types';

export interface ZoneEffects {
  shake?: number;
  reverseControls?: boolean;
  vision?: number;
  speed?: number;
  message?: string;
}

/** Shared import/agent boundary: unknown commands and unbounded values are rejected. */
export function parseEffects(value: unknown): ZoneEffects {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('공간 효과 설정이 올바르지 않아요');
  const raw = value as Record<string, unknown>;
  if (Object.keys(raw).some(k => !['shake', 'reverseControls', 'vision', 'speed', 'message'].includes(k))) throw new Error('지원하지 않는 공간 효과예요');
  const out: ZoneEffects = {};
  for (const [key, min, max] of [['shake', 0, 6], ['vision', 2, 12], ['speed', 0.25, 2]] as const) {
    if (raw[key] !== undefined) {
      const n = raw[key];
      if (typeof n !== 'number' || !Number.isFinite(n) || n < min || n > max) throw new Error(`${key} 값은 ${min}~${max} 사이여야 해요`);
      out[key] = n;
    }
  }
  if (raw.reverseControls !== undefined) {
    if (typeof raw.reverseControls !== 'boolean') throw new Error('반대 조작 설정은 참 또는 거짓이어야 해요');
    out.reverseControls = raw.reverseControls;
  }
  if (raw.message !== undefined) {
    if (typeof raw.message !== 'string' || raw.message.length > 100) throw new Error('공간 안내는 100자 이내여야 해요');
    out.message = raw.message;
  }
  return out;
}

export function zonesAt(doc: MapDoc, x: number, y: number): Zone[] {
  return doc.zones.filter(z => x >= z.x && y >= z.y && x < z.x + z.w && y < z.y + z.h);
}

export function effectsAt(doc: MapDoc, x: number, y: number): ZoneEffects {
  const out: ZoneEffects = {};
  for (const zone of zonesAt(doc, x, y)) {
    const e = zone.effects;
    if (!e) continue;
    if (e.shake) out.shake = Math.max(out.shake ?? 0, e.shake);
    if (e.reverseControls) out.reverseControls = true;
    if (e.vision) out.vision = Math.min(out.vision ?? 12, e.vision);
    if (e.speed) out.speed = Math.min(2, Math.max(0.25, (out.speed ?? 1) * e.speed));
    if (e.message) out.message = e.message;
  }
  return out;
}

export function effectDescription(e: ZoneEffects = {}) {
  return [e.shake ? '화면 흔들기' : '', e.reverseControls ? '반대로 움직이기' : '', e.vision ? '시야 좁히기' : '', e.speed && e.speed !== 1 ? `이동 속도 ${e.speed}배` : '', e.message ? '안내 띄우기' : ''].filter(Boolean).join(' · ') || '효과 없음';
}

export const SCRIPT_MAX_LENGTH = 8000;
export function parseScript(value: unknown) {
  if (typeof value !== 'string' || value.length > SCRIPT_MAX_LENGTH) throw new Error(`맵 스크립트는 ${SCRIPT_MAX_LENGTH}자 이내여야 해요`);
  return value;
}
