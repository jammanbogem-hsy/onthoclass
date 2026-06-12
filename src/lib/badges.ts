// 게이미피케이션 — 수집형 배지(성취).
//   classes/{cid}/badges/{uid}  : { collected: { [badgeId]: { at, by } } }
// 교사가 효과 마법사에서 학생에게 수여(awardBadge), 학생은 자신의 컬렉션을 본다.
import {
  collection,
  deleteField,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { getDbClient } from "@/lib/firebase";

// 배지 정의(고정 카탈로그). icon 은 Material Symbols 이름.
export type BadgeDef = {
  id: string;
  label: string;
  icon: string;
  desc: string;
  hue: number; // 배지 색(HSL hue)
};

export const BADGE_CATALOG: BadgeDef[] = [
  { id: "first_step", label: "첫걸음", icon: "footprint", desc: "첫 활동을 용기 있게 시작했어요", hue: 205 },
  { id: "presenter", label: "발표왕", icon: "campaign", desc: "친구들 앞에서 멋지게 발표했어요", hue: 280 },
  { id: "question", label: "질문왕", icon: "live_help", desc: "좋은 질문으로 수업을 빛냈어요", hue: 35 },
  { id: "helper", label: "도움왕", icon: "volunteer_activism", desc: "친구를 잘 도와줬어요", hue: 340 },
  { id: "word_master", label: "단어왕", icon: "menu_book", desc: "새 단어를 많이 익혔어요", hue: 150 },
  { id: "spirit", label: "기세왕", icon: "bolt", desc: "자신감 있게 씩씩하게 도전했어요", hue: 48 },
  { id: "growth", label: "성장왕", icon: "trending_up", desc: "예전보다 크게 성장했어요", hue: 125 },
  { id: "teamwork", label: "협동왕", icon: "groups", desc: "모둠 활동에 잘 참여했어요", hue: 178 },
  { id: "manners", label: "예의왕", icon: "waving_hand", desc: "바르고 고운 태도를 보였어요", hue: 95 },
  { id: "mental", label: "멘탈왕", icon: "self_improvement", desc: "끝까지 포기하지 않았어요", hue: 255 },
  { id: "tidy", label: "정리왕", icon: "cleaning_services", desc: "정리정돈을 깔끔하게 했어요", hue: 15 },
  { id: "finish", label: "마무리", icon: "sports_score", desc: "수업을 멋지게 마무리했어요", hue: 310 },
];

export function getBadge(id: string): BadgeDef | undefined {
  return BADGE_CATALOG.find((b) => b.id === id);
}

export type BadgeAward = { at: number | null; by: string };
export type BadgeMap = Record<string, BadgeAward>;

const badgeRef = (cid: string, uid: string) =>
  doc(getDbClient(), "classes", cid, "badges", uid);
const badgeCol = (cid: string) =>
  collection(getDbClient(), "classes", cid, "badges");

/** 배지 수여 — 같은 배지를 다시 줘도 최초 획득 시각은 보존(merge) */
export async function awardBadge(
  cid: string,
  uid: string,
  badgeId: string,
  by: string
): Promise<void> {
  await setDoc(
    badgeRef(cid, uid),
    { collected: { [badgeId]: { at: serverTimestamp(), by } } },
    { merge: true }
  );
}

/** 배지 회수 */
export async function revokeBadge(
  cid: string,
  uid: string,
  badgeId: string
): Promise<void> {
  await updateDoc(badgeRef(cid, uid), {
    [`collected.${badgeId}`]: deleteField(),
  });
}

function parse(data: Record<string, unknown> | undefined): BadgeMap {
  const c = (data?.collected ?? {}) as Record<string, unknown>;
  const out: BadgeMap = {};
  for (const [id, v] of Object.entries(c)) {
    const o = (v ?? {}) as Record<string, unknown>;
    const ts = o.at as { toMillis?: () => number } | undefined;
    out[id] = { at: ts?.toMillis ? ts.toMillis() : null, by: (o.by as string) ?? "" };
  }
  return out;
}

/** 한 학생의 배지 컬렉션 구독 */
export function watchBadges(
  cid: string,
  uid: string,
  cb: (badges: BadgeMap) => void
): () => void {
  return onSnapshot(
    badgeRef(cid, uid),
    (snap) => cb(snap.exists() ? parse(snap.data()) : {}),
    () => cb({})
  );
}

/** 학급 전체(uid→배지맵) 구독 — 교사 현황용 */
export function watchAllBadges(
  cid: string,
  cb: (map: Record<string, BadgeMap>) => void
): () => void {
  return onSnapshot(
    badgeCol(cid),
    (snap) => {
      const m: Record<string, BadgeMap> = {};
      snap.docs.forEach((d) => {
        m[d.id] = parse(d.data());
      });
      cb(m);
    },
    () => cb({})
  );
}
