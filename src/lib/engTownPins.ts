// 5단원 4차시 우리 동네 감정 지도(/eng/54) — Firestore 데이터 레이어 (LMS 학급과 분리).
//   engActivities/54/players/{uid}   참가자 식별(학교+반) — 5-3과 같은 구조
//   engActivities/54/pins/{pinId}    학생 핀(좌표+장소+할 수 있는 일+감정) — 실명 없음
//   engActivities/54/settings/{sid}  학급 설정(서로 보기 토글) — sid = `${학교명}__${반}`
// 같은 반 핀 조회는 equality 필터만 사용(복합 인덱스 불필요) → 정렬은 클라이언트에서.
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import { getDbClient } from "@/lib/firebase";
import {
  ACTIVITY_ID,
  CATEGORY_BY_ID,
  EMOTION_BY_ID,
  PLACE_TYPE_BY_ID,
  REACTION_BY_ID,
  type PinCategory,
  type PinComment,
  type Player,
  type TownPin,
} from "@/app/eng/54/types";

// ─────────────────── 참가자 식별 (학교 + 6학년 반) ───────────────────
function playerRef(uid: string, activityId: string = ACTIVITY_ID) {
  return doc(getDbClient(), "engActivities", activityId, "players", uid);
}

/** 내 참가자 식별 조회 (없으면 null → 시작 전 학교·반 입력 필요) */
export async function getTownPlayer(uid: string): Promise<Player | null> {
  const d = await getDoc(playerRef(uid));
  if (!d.exists()) return null;
  const v = d.data();
  return {
    uid,
    schoolName: (v.schoolName as string) ?? "",
    classNo: (v.classNo as number) ?? 0,
  };
}

/** 5-3 길찾기 활동에서 이미 식별한 학교·반이 있으면 가져와 미리 채움 */
export async function getPlayerPrefill(uid: string): Promise<Player | null> {
  try {
    const d = await getDoc(playerRef(uid, "5-3"));
    if (!d.exists()) return null;
    const v = d.data();
    const schoolName = (v.schoolName as string) ?? "";
    const classNo = (v.classNo as number) ?? 0;
    return schoolName && classNo ? { uid, schoolName, classNo } : null;
  } catch {
    return null;
  }
}

/** 참가자 식별 저장 (학교명 + 6학년 반) */
export async function saveTownPlayer(
  uid: string,
  schoolName: string,
  classNo: number
): Promise<void> {
  await setDoc(
    playerRef(uid),
    { uid, schoolName, classNo, updatedAt: serverTimestamp() },
    { merge: true }
  );
}

// ─────────────────── 핀 ───────────────────
function pinsCol() {
  return collection(getDbClient(), "engActivities", ACTIVITY_ID, "pins");
}

export type NewPin = {
  lat: number;
  lng: number;
  placeName: string;
  placeType: string;
  canDo: string;
  emotion: string;
  category: PinCategory; // 가봤던 곳 / 가고 싶은 곳
  memory: string; // 추억(또는 가고 싶은 이유) — 선택
};

/** 입력 정제 — 규칙의 길이 제한과 동일하게 자르고, 알 수 없는 id 는 거부 */
function cleanPin(data: NewPin): NewPin {
  if (!PLACE_TYPE_BY_ID[data.placeType]) throw new Error("invalid-place-type");
  if (!EMOTION_BY_ID[data.emotion]) throw new Error("invalid-emotion");
  if (!CATEGORY_BY_ID[data.category]) throw new Error("invalid-category");
  return {
    lat: data.lat,
    lng: data.lng,
    placeName: data.placeName.trim().slice(0, 60),
    placeType: data.placeType,
    canDo: data.canDo.trim().slice(0, 140),
    emotion: data.emotion,
    category: data.category,
    memory: data.memory.trim().slice(0, 300),
  };
}

/** 핀 생성 — 실명(creatorName)은 저장하지 않는다(5-3과 같은 PII 차단 규칙).
 *  photoURL 은 핀 마킹 표시용(같은 반 공유 전제). */
export async function createPin(
  uid: string,
  player: Player,
  data: NewPin,
  photoURL?: string | null
): Promise<string> {
  const ref = doc(pinsCol());
  await setDoc(ref, {
    creatorUid: uid,
    schoolName: player.schoolName,
    classNo: player.classNo,
    photoURL: photoURL ?? "",
    ...cleanPin(data),
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

/** 내 핀 수정 (좌표 포함 전체 갱신) */
export async function updatePin(
  pinId: string,
  uid: string,
  player: Player,
  data: NewPin,
  photoURL?: string | null
): Promise<void> {
  await setDoc(
    doc(pinsCol(), pinId),
    {
      creatorUid: uid,
      schoolName: player.schoolName,
      classNo: player.classNo,
      photoURL: photoURL ?? "",
      ...cleanPin(data),
    },
    { merge: true }
  );
}

/** 핀 삭제 (본인 또는 교사 — 규칙이 강제) */
export async function deletePin(pinId: string): Promise<void> {
  await deleteDoc(doc(pinsCol(), pinId));
}

function toPin(id: string, v: Record<string, unknown>): TownPin {
  return {
    id,
    creatorUid: (v.creatorUid as string) ?? "",
    schoolName: (v.schoolName as string) ?? "",
    classNo: (v.classNo as number) ?? 0,
    lat: (v.lat as number) ?? 0,
    lng: (v.lng as number) ?? 0,
    placeName: (v.placeName as string) ?? "",
    placeType: (v.placeType as string) ?? "etc",
    canDo: (v.canDo as string) ?? "",
    emotion: (v.emotion as string) ?? "happy",
    category: ((v.category as PinCategory) ?? "visited"),
    memory: (v.memory as string) ?? "",
    photoURL: (v.photoURL as string) ?? "",
    createdAt: v.createdAt,
  };
}

function sortPins(pins: TownPin[]): TownPin[] {
  return pins.sort((a, b) => {
    const ta = (a.createdAt as { seconds?: number } | null)?.seconds ?? 0;
    const tb = (b.createdAt as { seconds?: number } | null)?.seconds ?? 0;
    return ta - tb;
  });
}

/** 내 핀 목록 */
export async function listMyPins(uid: string): Promise<TownPin[]> {
  const snap = await getDocs(query(pinsCol(), where("creatorUid", "==", uid)));
  return sortPins(snap.docs.map((d) => toPin(d.id, d.data())));
}

/** 내 핀 실시간 구독 */
export function watchMyPins(
  uid: string,
  cb: (pins: TownPin[]) => void
): () => void {
  return onSnapshot(
    query(pinsCol(), where("creatorUid", "==", uid)),
    (snap) => cb(sortPins(snap.docs.map((d) => toPin(d.id, d.data())))),
    () => cb([])
  );
}

/** 같은 반 핀 실시간 구독 — 서로 보기(share)가 꺼져 있으면 규칙이 거부 → onError 로 [] */
export function watchClassPins(
  schoolName: string,
  classNo: number,
  cb: (pins: TownPin[]) => void,
  onDenied?: () => void
): () => void {
  return onSnapshot(
    query(
      pinsCol(),
      where("schoolName", "==", schoolName),
      where("classNo", "==", classNo)
    ),
    (snap) => cb(sortPins(snap.docs.map((d) => toPin(d.id, d.data())))),
    () => {
      cb([]);
      onDenied?.();
    }
  );
}

/** 같은 학교 전체 핀 실시간 구독 — 교사 전용(학생 쿼리는 규칙이 거부 → []).
 *  교사 합본 지도/반별 비교 보기용. */
export function watchSchoolPins(
  schoolName: string,
  cb: (pins: TownPin[]) => void
): () => void {
  return onSnapshot(
    query(pinsCol(), where("schoolName", "==", schoolName)),
    (snap) => cb(sortPins(snap.docs.map((d) => toPin(d.id, d.data())))),
    () => cb([])
  );
}

// ─────────────────── 핀 반응(공감) ───────────────────
// 학생 1명당 핀 1개에 반응 1개(문서 id = uid). 같은 반응 다시 누르면 삭제(토글).

function reactionsCol(pinId: string) {
  return collection(pinsCol(), pinId, "reactions");
}

/** 핀의 반응 실시간 구독 — { reactionId → uid[] } 와 내 반응 id 도출용 원본 맵 */
export function watchReactions(
  pinId: string,
  cb: (byUid: Record<string, string>) => void
): () => void {
  return onSnapshot(
    reactionsCol(pinId),
    (snap) => {
      const m: Record<string, string> = {};
      snap.docs.forEach((d) => {
        const r = (d.data().reaction as string) ?? "";
        if (REACTION_BY_ID[r]) m[d.id] = r;
      });
      cb(m);
    },
    () => cb({})
  );
}

/** 반응 달기/바꾸기(reaction id) 또는 떼기(null) */
export async function setReaction(
  pinId: string,
  uid: string,
  reaction: string | null
): Promise<void> {
  const ref = doc(reactionsCol(pinId), uid);
  if (!reaction) {
    await deleteDoc(ref);
    return;
  }
  if (!REACTION_BY_ID[reaction]) throw new Error("invalid-reaction");
  await setDoc(ref, { uid, reaction, createdAt: serverTimestamp() });
}

// ─────────────────── 핀 댓글 ───────────────────

function commentsCol(pinId: string) {
  return collection(pinsCol(), pinId, "comments");
}

/** 핀 댓글 실시간 구독(오래된 순) */
export function watchComments(
  pinId: string,
  cb: (comments: PinComment[]) => void
): () => void {
  return onSnapshot(
    commentsCol(pinId),
    (snap) => {
      const list = snap.docs.map((d) => {
        const v = d.data();
        return {
          id: d.id,
          uid: (v.uid as string) ?? "",
          text: (v.text as string) ?? "",
          photoURL: (v.photoURL as string) ?? "",
          createdAt: v.createdAt,
        };
      });
      list.sort((a, b) => {
        const ta = (a.createdAt as { seconds?: number } | null)?.seconds ?? 0;
        const tb = (b.createdAt as { seconds?: number } | null)?.seconds ?? 0;
        return ta - tb;
      });
      cb(list);
    },
    () => cb([])
  );
}

/** 댓글 달기 — 실명 없이 uid+사진만 저장(아바타/사진으로 표시) */
export async function addComment(
  pinId: string,
  uid: string,
  text: string,
  photoURL?: string | null
): Promise<void> {
  const t = text.trim().slice(0, 200);
  if (!t) return;
  await setDoc(doc(commentsCol(pinId)), {
    uid,
    text: t,
    photoURL: photoURL ?? "",
    createdAt: serverTimestamp(),
  });
}

/** 댓글 삭제(본인/교사 — 규칙이 강제) */
export async function deleteComment(pinId: string, commentId: string): Promise<void> {
  await deleteDoc(doc(commentsCol(pinId), commentId));
}

// ─────────────────── 학급 설정 (서로 보기 토글) ───────────────────
export type TownSetting = { share: boolean };

function settingId(schoolName: string, classNo: number): string {
  // Firestore 문서 id 에 '/' 는 불가 — 학교명에서 제거(실제 학교명엔 없음)
  return `${schoolName.replace(/\//g, " ")}__${classNo}`;
}

function settingRef(schoolName: string, classNo: number) {
  return doc(
    getDbClient(),
    "engActivities",
    ACTIVITY_ID,
    "settings",
    settingId(schoolName, classNo)
  );
}

/** 서로 보기 설정 조회 — 문서 없으면 기본 공개(true) */
export async function getShareSetting(
  schoolName: string,
  classNo: number
): Promise<boolean> {
  try {
    const d = await getDoc(settingRef(schoolName, classNo));
    return d.exists() ? d.data().share === true : true;
  } catch {
    return true;
  }
}

/** 서로 보기 설정 실시간 구독 — 교사가 토글하면 학생 화면에 즉시 반영 */
export function watchShareSetting(
  schoolName: string,
  classNo: number,
  cb: (share: boolean) => void
): () => void {
  return onSnapshot(
    settingRef(schoolName, classNo),
    (d) => cb(d.exists() ? d.data().share === true : true),
    () => cb(true)
  );
}

/** 서로 보기 설정 저장 (교사만 — 규칙이 강제) */
export async function setShareSetting(
  schoolName: string,
  classNo: number,
  share: boolean,
  by: string
): Promise<void> {
  await setDoc(settingRef(schoolName, classNo), {
    share,
    updatedBy: by,
    updatedAt: serverTimestamp(),
  });
}
