// 모아 월드 스페이스(프로젝트)·맵 서버 저장 — 브라우저 저장소는 캐시, 이곳이 원본.
// 편집기 동기화(/api/jamworld/worlds)와 러닝크루 MCP(교사용 AI 연결)가 같은 함수를 쓴다.
//
// 비용(무료 한도 안): 맵 하나 = 문서 하나(gzip 바이트). 목록은 메타 문서만 읽고, 저장은 바뀐 맵만 쓴다.
// 버전(되돌리기용)은 AI 쓰기·충돌 덮어쓰기 때만 남기고 최근 10개만 보관한다.
//
//   jamworldWorlds/{pid}                 { ownerKey, name, description, mapIds, createdAt, updatedAt, rev, updatedBy }
//   jamworldWorlds/{pid}/maps/{mid}      { data: gzip(JSON), rev, updatedAt }
//   jamworldWorlds/{pid}/versions/{vid}  { at, by, reason, rev, project, data: gzip({mid: json}) }
import { getFirestore, type DocumentReference } from "firebase-admin/firestore";
import { gunzipSync, gzipSync } from "node:zlib";
import { parseMapJson, serializeMap } from "../world/io";
import type { MapDoc } from "../world/types";
import { WorkshopError } from "./workshop/service";

export interface WorldMeta { id: string; name: string; description: string; mapIds: string[]; createdAt: number; updatedAt: number; rev: number; updatedBy?: string }
export interface WorldFull { project: WorldMeta; maps: Record<string, MapDoc> }

const ID = /^[A-Za-z0-9_-]{1,80}$/;
const MAX_MAPS = 30;
const KEEP_VERSIONS = 10;
const col = () => getFirestore().collection("jamworldWorlds");
const zip = (v: unknown) => gzipSync(Buffer.from(JSON.stringify(v)), { level: 9 });
const unzip = <T>(b: Buffer | Uint8Array): T => JSON.parse(gunzipSync(Buffer.from(b)).toString("utf8")) as T;

function meta(id: string, d: FirebaseFirestore.DocumentData): WorldMeta {
  return { id, name: String(d.name ?? ""), description: String(d.description ?? ""), mapIds: Array.isArray(d.mapIds) ? d.mapIds.map(String) : [], createdAt: Number(d.createdAt) || 0, updatedAt: Number(d.updatedAt) || 0, rev: Number(d.rev) || 0, ...(d.updatedBy ? { updatedBy: String(d.updatedBy) } : {}) };
}

/** 검증된 맵 문서(맵 JSON 문자열이나 객체) */
export function cleanMap(id: string, raw: unknown): MapDoc {
  const text = typeof raw === "string" ? raw : JSON.stringify(raw);
  if (text.length > 2_000_000) throw new WorkshopError("map", "맵이 너무 커요", 413);
  const r = parseMapJson(text);
  if (!r.ok) throw new WorkshopError("map", `맵을 확인해 주세요: ${r.errors.slice(0, 3).map(e => e.message).join(", ")}`, 400);
  if (r.doc.id !== id) throw new WorkshopError("map", "맵 id 가 맞지 않아요", 400);
  return r.doc;
}

async function owned(owner: string, pid: string) {
  if (!ID.test(pid)) throw new WorkshopError("world", "스페이스 id 가 올바르지 않아요", 400);
  const ref = col().doc(pid);
  const snap = await ref.get();
  if (snap.exists && snap.data()!.ownerKey !== owner) throw new WorkshopError("forbidden", "내 스페이스가 아니에요", 403);
  return { ref, snap };
}

export async function listWorlds(owner: string): Promise<WorldMeta[]> {
  const snap = await col().where("ownerKey", "==", owner).get();
  return snap.docs.map(d => meta(d.id, d.data())).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getWorldMeta(owner: string, pid: string): Promise<WorldMeta | null> {
  const { snap } = await owned(owner, pid);
  return snap.exists ? meta(pid, snap.data()!) : null;
}

/** 맵까지 — onlyMaps 를 주면 그 맵만 읽는다(읽기 횟수 절약) */
export async function getWorld(owner: string, pid: string, onlyMaps?: string[]): Promise<WorldFull | null> {
  const { ref, snap } = await owned(owner, pid);
  if (!snap.exists) return null;
  const project = meta(pid, snap.data()!);
  const ids = (onlyMaps ?? project.mapIds).filter(id => project.mapIds.includes(id) && ID.test(id));
  const docs = ids.length ? await getFirestore().getAll(...ids.map(id => ref.collection("maps").doc(id))) : [];
  const maps: Record<string, MapDoc> = {};
  for (const d of docs) if (d.exists) {
    const r = parseMapJson(gunzipSync(Buffer.from(d.data()!.data)).toString("utf8"));
    if (r.ok) maps[d.id] = r.doc;
  }
  return { project, maps };
}

async function snapshot(ref: DocumentReference, project: WorldMeta, by: string, reason: string) {
  const docs = project.mapIds.length ? await getFirestore().getAll(...project.mapIds.map(id => ref.collection("maps").doc(id))) : [];
  const maps: Record<string, string> = {};
  for (const d of docs) if (d.exists) maps[d.id] = gunzipSync(Buffer.from(d.data()!.data)).toString("utf8");
  const data = zip(maps);
  if (data.length > 950_000) return; // 문서 한도(1MiB)를 넘는 큰 스페이스는 버전 생략
  await ref.collection("versions").add({ at: Date.now(), by, reason: reason.slice(0, 120), rev: project.rev, project: { name: project.name, description: project.description, mapIds: project.mapIds }, data });
  const old = await ref.collection("versions").orderBy("at", "desc").offset(KEEP_VERSIONS).select().get();
  if (!old.empty) { const b = getFirestore().batch(); old.docs.forEach(d => b.delete(d.ref)); await b.commit(); }
}

export interface SaveInput {
  name?: string; description?: string; mapIds?: string[]; createdAt?: number;
  /** 바뀐 맵만(검증 전 원문 또는 MapDoc) */
  maps?: Record<string, unknown>;
  baseRev?: number;
  /** 서버가 더 새것이어도 덮어쓴다(덮기 전 버전을 남김) */
  force?: boolean;
  /** 이 쓰기 전에 버전을 남긴다(AI 쓰기) */
  version?: string;
  by: string;
}

/** 저장 — rev 로 동시 수정을 막는다. 409 면 { rev } 와 함께 실패 */
export async function saveWorld(owner: string, pid: string, input: SaveInput): Promise<WorldMeta> {
  const { ref, snap } = await owned(owner, pid);
  const cur = snap.exists ? meta(pid, snap.data()!) : null;
  if (cur && input.baseRev !== undefined && input.baseRev !== cur.rev && !input.force)
    throw Object.assign(new WorkshopError("conflict", "다른 곳에서 먼저 바뀌었어요", 409), { rev: cur.rev });
  const mapIds = (input.mapIds ?? cur?.mapIds ?? []).map(String);
  if (!mapIds.length || mapIds.length > MAX_MAPS || mapIds.some(id => !ID.test(id)) || new Set(mapIds).size !== mapIds.length)
    throw new WorkshopError("world", "맵 목록을 확인해 주세요(1~30개)", 400);
  const maps = Object.entries(input.maps ?? {});
  if (maps.some(([id]) => !mapIds.includes(id))) throw new WorkshopError("world", "목록에 없는 맵이에요", 400);
  const clean = maps.map(([id, raw]) => [id, cleanMap(id, raw)] as const);
  if (!cur && clean.length !== mapIds.length) throw new WorkshopError("world", "새 스페이스는 모든 맵을 함께 보내 주세요", 400);
  if (cur && (input.version || (input.force && input.baseRev !== undefined && input.baseRev !== cur.rev)))
    await snapshot(ref, cur, input.by, input.version || "덮어쓰기 전 자동 보관");
  const now = Date.now(), rev = (cur?.rev ?? 0) + 1;
  const batch = getFirestore().batch();
  for (const [id, doc] of clean) batch.set(ref.collection("maps").doc(id), { data: gzipSync(Buffer.from(serializeMap(doc)), { level: 9 }), rev, updatedAt: now });
  for (const id of cur?.mapIds ?? []) if (!mapIds.includes(id)) batch.delete(ref.collection("maps").doc(id));
  const next = {
    ownerKey: owner,
    name: String(input.name ?? cur?.name ?? "새 스페이스").slice(0, 80),
    description: String(input.description ?? cur?.description ?? "").slice(0, 400),
    mapIds, createdAt: cur?.createdAt ?? (Number(input.createdAt) || now), updatedAt: now, rev, updatedBy: input.by,
  };
  batch.set(ref, next, { merge: true }); // 설계서(brief) 등 다른 필드는 남긴다
  await batch.commit();
  return meta(pid, next);
}

export async function deleteWorld(owner: string, pid: string) {
  const { ref, snap } = await owned(owner, pid);
  if (!snap.exists) return;
  await getFirestore().recursiveDelete(ref);
}

export async function listVersions(owner: string, pid: string) {
  const { ref, snap } = await owned(owner, pid);
  if (!snap.exists) return [];
  const v = await ref.collection("versions").orderBy("at", "desc").select("at", "by", "reason", "rev").get();
  return v.docs.map(d => ({ id: d.id, at: Number(d.data().at), by: String(d.data().by ?? ""), reason: String(d.data().reason ?? ""), rev: Number(d.data().rev) }));
}

/** 버전으로 되돌리기(지금 상태도 버전으로 남긴다) */
export async function revertWorld(owner: string, pid: string, versionId: string, by: string) {
  const { ref, snap } = await owned(owner, pid);
  if (!snap.exists || !ID.test(versionId)) throw new WorkshopError("world", "스페이스를 찾지 못했어요", 404);
  const v = await ref.collection("versions").doc(versionId).get();
  if (!v.exists) throw new WorkshopError("world", "버전을 찾지 못했어요", 404);
  const d = v.data()!, maps = unzip<Record<string, string>>(d.data);
  return saveWorld(owner, pid, { name: d.project.name, description: d.project.description, mapIds: d.project.mapIds, maps, force: true, version: `되돌리기 전(${new Date(Number(d.at)).toISOString().slice(0, 16)} 버전으로)`, by });
}

