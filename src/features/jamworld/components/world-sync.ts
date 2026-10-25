"use client";
// 스페이스 서버 동기화 — 브라우저 저장소는 빠른 캐시, 서버(/api/jamworld/worlds)가 원본.
// 비용: 목록은 메타만, 올릴 때는 바뀐 맵만, 1.5초 모아서 한 번. 서버가 더 새것이면 내려받는다.
// 같은 스페이스를 AI(MCP)가 고쳤는데 편집기가 옛 판으로 저장하면, 서버가 AI 판을 버전으로 남기고 덮는다(되돌리기 가능).
import { api, ApiError } from "./workshop-api";
import { parseMapJson, serializeMap } from "../lib/world/io";
import {
  dropLocalProject, getProject, listProjects, loadMap, markSynced, onLocalChange, putSyncedProject, syncedRev,
} from "../lib/world/storage";
import type { MapDoc, Project } from "../lib/world/types";

interface WorldMeta { id: string; name: string; description: string; mapIds: string[]; createdAt: number; updatedAt: number; rev: number }

const pending = new Map<string, Set<string> | "all" | "meta">();
let timer: ReturnType<typeof setTimeout> | undefined;
let started = false;

/** 로컬 변경을 서버로 보내기 시작(한 번만) */
export function startWorldSync() {
  if (started || typeof window === "undefined") return;
  started = true;
  onLocalChange(({ projectId, maps }) => {
    if (maps === "deleted") {
      pending.delete(projectId);
      const had = syncedRev(projectId) !== null;
      markSynced(projectId, null);
      if (had) void api(`/api/jamworld/worlds/${encodeURIComponent(projectId)}`, { method: "DELETE" }).catch(() => undefined);
      return;
    }
    const cur = pending.get(projectId);
    if (maps === "all" || cur === "all") pending.set(projectId, "all");
    else if (maps === "meta") { if (!cur) pending.set(projectId, "meta"); }
    else pending.set(projectId, new Set([...(cur instanceof Set ? cur : []), ...maps]));
    clearTimeout(timer);
    timer = setTimeout(() => void flush(), 1500);
  });
  // 탭을 닫거나 다른 화면으로 갈 때 남은 것을 바로 보낸다
  window.addEventListener("pagehide", () => void flush(true));
}

async function push(projectId: string, what: Set<string> | "all" | "meta", keepalive = false) {
  const p = getProject(projectId);
  if (!p) return;
  const base = syncedRev(projectId);
  const ids = base === null || what === "all" ? p.mapIds : what === "meta" ? [] : [...what].filter(id => p.mapIds.includes(id));
  const maps: Record<string, string> = {};
  for (const id of ids) { const m = loadMap(id); if (m) maps[id] = serializeMap(m); }
  if (base === null && Object.keys(maps).length !== p.mapIds.length) return; // 아직 다 저장되지 않은 새 스페이스
  const body = { name: p.name, description: p.description, mapIds: p.mapIds, createdAt: p.createdAt, maps, ...(base === null ? {} : { baseRev: base }) };
  const url = `/api/jamworld/worlds/${encodeURIComponent(projectId)}`;
  try {
    const r = await api<{ project: WorldMeta }>(url, { method: "PUT", json: body, keepalive });
    markSynced(projectId, r.project.rev);
  } catch (e) {
    if (e instanceof ApiError && e.status === 409) {
      // 다른 곳(AI·다른 기기)에서 먼저 바뀜 — 지금 편집 중인 내 것을 올리고, 서버가 그 판을 버전으로 남긴다
      const r = await api<{ project: WorldMeta }>(url, { method: "PUT", json: { ...body, maps: Object.fromEntries(p.mapIds.map(id => [id, loadMap(id)]).filter(([, m]) => m).map(([id, m]) => [id, serializeMap(m as MapDoc)])), force: true }, keepalive });
      markSynced(projectId, r.project.rev);
      window.dispatchEvent(new CustomEvent("jamworld:sync-note", { detail: "다른 곳에서 바뀐 내용은 버전으로 보관하고 지금 내용으로 저장했어요" }));
    } else throw e;
  }
}

export async function flush(keepalive = false) {
  clearTimeout(timer);
  const jobs = [...pending.entries()];
  pending.clear();
  for (const [id, what] of jobs) {
    try { await push(id, what, keepalive); }
    catch { pending.set(id, "all"); } // 다음 기회에 다시
  }
  if (pending.size) { clearTimeout(timer); timer = setTimeout(() => void flush(), 15000); }
}

async function download(id: string): Promise<boolean> {
  const r = await api<{ project: WorldMeta; maps: Record<string, string> }>(`/api/jamworld/worlds/${encodeURIComponent(id)}`);
  const maps: Record<string, MapDoc> = {};
  for (const [mid, text] of Object.entries(r.maps)) { const p = parseMapJson(text); if (p.ok) maps[mid] = p.doc; }
  const project: Project = { id, name: r.project.name, description: r.project.description, mapIds: r.project.mapIds.filter(m => maps[m]), createdAt: r.project.createdAt, updatedAt: r.project.updatedAt };
  if (!project.mapIds.length) return false;
  putSyncedProject(project, maps);
  markSynced(id, r.project.rev);
  return true;
}

/** 내 월드 화면: 서버 목록과 맞춘다. 바뀐 게 있으면 true */
export async function syncAll(): Promise<boolean> {
  startWorldSync();
  const { worlds } = await api<{ worlds: WorldMeta[] }>("/api/jamworld/worlds");
  let changed = false;
  for (const w of worlds) {
    if (pending.has(w.id)) continue;
    if (syncedRev(w.id) !== w.rev && (await download(w.id).catch(() => false))) changed = true;
  }
  for (const p of listProjects()) {
    const onServer = worlds.some(w => w.id === p.id), rev = syncedRev(p.id);
    if (!onServer && rev === null) { pending.set(p.id, "all"); }            // 아직 안 올린 스페이스(처음 한 번 옮기기)
    else if (!onServer && rev !== null && !pending.has(p.id)) { dropLocalProject(p.id); changed = true; } // 다른 곳에서 지움
  }
  if (pending.size) await flush();
  return changed;
}

/** 편집기·플레이: 이 스페이스만 확인(메타 1회 읽기). 서버가 더 새것이면 내려받고 true */
export async function syncOne(id: string): Promise<boolean> {
  startWorldSync();
  if (pending.has(id)) return false;
  if (getProject(id) && syncedRev(id) === null) { pending.set(id, "all"); await flush(); return false; }
  try {
    const r = await api<{ project: WorldMeta | null }>(`/api/jamworld/worlds/${encodeURIComponent(id)}?meta=1`);
    if (r.project && syncedRev(id) !== r.project.rev) return await download(id);
  } catch (e) {
    if (!(e instanceof ApiError && e.status === 404)) throw e;
  }
  return false;
}
