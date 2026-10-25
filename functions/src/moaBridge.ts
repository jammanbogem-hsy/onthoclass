/**
 * 모아 월드 에셋 → 러닝크루 — 학생이 모아 월드에서 만든 그림을 러닝크루에서 쓴다.
 *   목록: 내가 만든 에셋(러닝크루 계정과 이어진 모아 월드 학생 + 선생님이 AI 로 올린 것)
 *   그림 주소: 모아 월드 공개 에셋 파일(/api/jamworld/workshop/files/…, 같은 사이트·CDN 캐시) — 프로필·브레인스토밍 캐릭터용
 *   첨부: 응답·보드에 넣을 때는 그 첨부 자리(classes/…)로 복사한다 — 기존 첨부와 똑같이 지우기·성과 공유가 된다.
 * 계정 잇기는 모아 월드 /me 가 한다(러닝크루로 로그인한 채 모아 월드 학생으로 들어오면 jamworldLinks/{uid}).
 */
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { randomBytes, randomUUID } from "node:crypto";

const BASE = "https://jammanboeng.web.app";
const ID = /^[A-Za-z0-9_-]{1,100}$/;
const db = () => getFirestore();
const fileUrl = (key: string) => `${BASE}/api/jamworld/workshop/files/${key.split("/").map(encodeURIComponent).join("/")}`;

type Manifest = { id: string; name: string; category: string; appearance: { kind: "texture"; texture: string } | { kind: "views"; td: string; iso: string } };
export interface MoaAsset { id: string; name: string; category: string; image: string; key: string }

async function myAssets(uid: string): Promise<MoaAsset[]> {
  const link = (await db().doc(`jamworldLinks/${uid}`).get()).data();
  const ids: string[] = Array.isArray(link?.studentIds) ? link!.studentIds.filter((x: unknown) => typeof x === "string").slice(0, 30) : [];
  const col = db().collection("jamworldLibrary");
  const [mine, made] = await Promise.all([
    ids.length ? col.where("ownerStudentId", "in", ids).get() : Promise.resolve(null),
    col.where("classId", "==", `_moa_${uid}`).get(),
  ]);
  const rows = [...(mine?.docs ?? []), ...made.docs].map(d => d.data()).filter(r => !r.removedAt);
  return rows.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)).map(r => {
    const m = JSON.parse(r.manifest) as Manifest;
    const key = m.appearance.kind === "texture" ? m.appearance.texture : m.appearance.iso || m.appearance.td;
    return { id: m.id, name: m.name, category: m.category, key, image: fileUrl(key) };
  });
}

export const moaAssets = onCall({ region: "asia-northeast3", memory: "256MiB", maxInstances: 5 }, async req => {
  if (!req.auth) throw new HttpsError("unauthenticated", "로그인이 필요해요.");
  const uid = req.auth.uid;
  const { action, assetId, target } = (req.data ?? {}) as { action?: string; assetId?: string; target?: { kind?: string; cid?: string; lid?: string; qid?: string } };
  const list = await myAssets(uid);
  if (action === "list") return { assets: list.map(({ key: _k, ...a }) => a) };
  if (action !== "attach") throw new HttpsError("invalid-argument", "알 수 없는 동작이에요.");

  // 응답·보드 첨부: 내 에셋인지, 그 학급 멤버인지 확인하고 첨부 자리로 복사
  const asset = list.find(a => a.id === assetId);
  if (!asset) throw new HttpsError("permission-denied", "내가 만든 모아 월드 에셋만 넣을 수 있어요.");
  const cid = String(target?.cid ?? "");
  if (!ID.test(cid) || !(await db().doc(`classes/${cid}/members/${uid}`).get()).exists) throw new HttpsError("permission-denied", "이 학급의 멤버가 아니에요.");
  let prefix: string;
  if (target?.kind === "submission" && ID.test(String(target.lid)) && ID.test(String(target.qid))) prefix = `classes/${cid}/lessons/${target.lid}/questions/${target.qid}/submissions/${uid}`;
  else if (target?.kind === "canvas") prefix = `classes/${cid}/canvas/${uid}`;
  else throw new HttpsError("invalid-argument", "첨부할 곳을 확인해 주세요.");
  const bucket = getStorage().bucket();
  const src = bucket.file(`jamworld/${asset.key}`);
  const [meta] = await src.getMetadata().catch(() => [null]);
  if (!meta) throw new HttpsError("not-found", "그림 파일을 찾지 못했어요.");
  const id = randomBytes(8).toString("hex"), ext = String(meta.contentType).includes("png") ? "png" : "webp";
  const path = `${prefix}/${id}.${ext}`, token = randomUUID();
  const [bytes] = await src.download();
  await bucket.file(path).save(bytes, { resumable: false, contentType: String(meta.contentType), metadata: { metadata: { firebaseStorageDownloadTokens: token, source: "moa-world" } } });
  const url = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
  return { attachment: { id, type: "image", url, path, name: `${asset.name}.${ext}`, size: Number(meta.size) || 0 } };
});

/** 점검용(로컬 스크립트) */
export const moaBridgeInternals = { myAssets };
