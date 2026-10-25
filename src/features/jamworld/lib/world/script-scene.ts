import { getAsset } from "./catalog";
import { objectCells, objectFootprint, tileAt } from "./map";
import { PlayWorld, type PlayerState } from "./play";
import type { MapDoc, PlacedObject } from "./types";
import { validQuizLabel } from "./quiz";
import { validateFxAction } from "./script-fx";

export interface ScriptObject { id: string; assetId: string; name: string; x: number; y: number; visible: boolean; blocking: boolean }
export interface ScriptContext { x: number; y: number; time: number; zones: string[]; objects?: ScriptObject[] }
export interface ScriptEvent { kind: "interact" | "choice" | "quiz" | "key" | "arrive"; name?: string; value: unknown }
export interface ScriptChoice { id: string; title: string; choices: string[] }
export interface ScriptAction { kind: string; value: unknown }
export interface ScriptObjectPatch { x?: number; y?: number; visible?: boolean; blocking?: boolean }
export type ScriptHud = Record<string, { label: string; value: string }>;

const string = (v: unknown, max: number): v is string => typeof v === "string" && v.length <= max;
/** Validate the complete batch before changing the live scene. No code receives a DOM or renderer reference. */
export function validateScriptActions(actions: ScriptAction[]) {
  if (!Array.isArray(actions) || actions.length > 32) throw Error("한 번에 너무 많은 동작을 요청했어요");
  for (const { kind, value } of actions) {
    if (!value || typeof value !== "object") throw Error("동작 내용을 확인해 주세요");
    const v = value as Record<string, unknown>;
    if (kind === "hud") {
      if (!string(v.id, 60) || !v.id || !string(v.label, 60) || !(string(v.value, 160) || (typeof v.value === "number" && Number.isFinite(v.value)))) throw Error("점수판 내용을 확인해 주세요");
    } else if (kind === "choose") {
      if (!string(v.id, 60) || !v.id || !string(v.title, 300) || !Array.isArray(v.choices) || v.choices.length < 1 || v.choices.length > 5 || v.choices.some(c => !string(c, 100))) throw Error("선택 문항을 확인해 주세요");
    } else if (kind === "teleport") {
      if (!Number.isSafeInteger(v.x) || !Number.isSafeInteger(v.y) || Number(v.x) < 0 || Number(v.y) < 0 || Number(v.x) >= 120 || Number(v.y) >= 120) throw Error("이동 좌표는 맵 안의 칸 단위 정수여야 해요");
    } else if (kind === "completeQuiz") {
      if (!string(v.id, 120) || !v.id || (v.label !== undefined && !validQuizLabel(v.label))) throw Error("퀴즈 ID와 완료 문구(1~12자)를 확인해 주세요");
    } else if (kind === "object") {
      if (!string(v.id, 120) || !v.id || !v.patch || typeof v.patch !== "object") throw Error("오브젝트 동작을 확인해 주세요");
      const p = v.patch as Record<string, unknown>;
      if (Object.keys(p).some(k => !["x", "y", "visible", "blocking"].includes(k)) ||
          ["x", "y"].some(k => p[k] !== undefined && !Number.isInteger(p[k])) ||
          ["visible", "blocking"].some(k => p[k] !== undefined && typeof p[k] !== "boolean")) throw Error("오브젝트 위치·통과 여부를 확인해 주세요");
    } else if (!validateFxAction(kind, v)) throw Error(`지원하지 않는 맵 동작: ${kind}`);
  }
}

/** Per-play overrides: never writes the authored map or account storage. */
export class ScriptScene {
  private patches = new Map<string, ScriptObjectPatch>();
  doc: MapDoc;
  world: PlayWorld;
  constructor(readonly original: MapDoc) { this.doc = original; this.world = new PlayWorld(original); }
  objects(): ScriptObject[] {
    return this.original.objects.map(o => {
      const p = this.patches.get(o.id), a = getAsset(o.assetId);
      return { id: o.id, assetId: o.assetId, name: a?.name || o.assetId, x: p?.x ?? o.x, y: p?.y ?? o.y, visible: p?.visible !== false, blocking: p?.blocking ?? !!a?.blocking };
    });
  }
  changeObject(selector: string, patch: ScriptObjectPatch, player: PlayerState) {
    const found = this.objects().filter(o => o.id === selector || o.name === selector || o.assetId === selector);
    if (found.length !== 1) throw Error(`‘${selector}’ 오브젝트를 하나로 지정해 주세요`);
    const selected = found[0], old = this.patches.get(selected.id) || {}, next = { ...old, ...patch };
    if (JSON.stringify(old) === JSON.stringify(next)) return false;
    const source = this.original.objects.find(o => o.id === selected.id)!;
    const position = { ...source, ...next }, fp = objectFootprint(position);
    if (position.x < 0 || position.y < 0 || position.x + fp.w > this.doc.width || position.y + fp.d > this.doc.height) throw Error("오브젝트를 맵 밖으로 옮길 수 없어요");
    if (position.x !== selected.x || position.y !== selected.y) {
      const occupied = new Set<number>();
      for (const o of this.doc.objects) if (o.id !== selected.id && (this.patches.get(o.id)?.blocking ?? getAsset(o.assetId)?.blocking))
        for (const [x, y] of objectCells(o)) occupied.add(y * this.doc.width + x);
      if (objectCells(position).some(([x, y]) => getAsset(tileAt(this.doc, x, y))?.walkable === false || occupied.has(y * this.doc.width + x))) return false;
    }
    this.patches.set(selected.id, next);
    const objects: PlacedObject[] = this.original.objects.filter(o => this.patches.get(o.id)?.visible !== false).map(o => ({ ...o, ...this.patches.get(o.id) }));
    const doc = { ...this.original, objects };
    // Rebuild terrain collision first, then apply each object's current blocking flag.
    const world = new PlayWorld({ ...doc, objects: [] });
    for (const o of objects) if (this.patches.get(o.id)?.blocking ?? getAsset(o.assetId)?.blocking) {
      for (const [x, y] of objectCells(o)) world.blocked[y * doc.width + x] = 1;
    }
    if (world.collides(player.x, player.y)) {
      this.patches.set(selected.id, old);
      return false; // A moving object or closing door must never trap a player.
    }
    this.doc = doc; this.world = world;
    return true;
  }
  nearby(player: PlayerState, bindings: string[]) {
    return this.objects().filter(o => o.visible && bindings.some(b => [o.id, o.name, o.assetId].includes(b)))
      .map(o => ({ ...o, distance: Math.hypot(o.x + 0.5 - player.x, o.y + 0.5 - player.y) }))
      .filter(o => o.distance < 1.7).sort((a, b) => a.distance - b.distance)[0] || null;
  }
}
