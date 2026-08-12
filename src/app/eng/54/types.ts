// 5단원 4차시 "Welcome to Our Town" — 우리 동네 감정 지도 활동 공용 타입/상수.
// 학생이 카카오맵에 핀을 찍고 ①어떤 곳인지 ②무엇을 할 수 있는지 ③어떤 감정인지 기록.
// 교과서 핵심 표현: There is a ___ in our town. / You can ___ there.

/** 활동 식별자 (engActivities/{ACTIVITY_ID}) — 라우트 /eng/54 */
export const ACTIVITY_ID = "54";

/** 핀 1개당 활동 점수 */
export const POINTS_PER_PIN = 5;
/** 학생 1명이 찍을 수 있는 최대 핀 수 */
export const MAX_PINS = 5;

export const CLASS_NOS = Array.from({ length: 15 }, (_, i) => i + 1);

/** 참가자 식별 — 학교 + 6학년 반 (5-3과 같은 구조, 실명 없음) */
export type Player = { uid: string; schoolName: string; classNo: number };

// ─────────────────── 감정 ───────────────────
// valence: 긍정(+)/중립(0)/부정(-) — 히트맵·인사이트 집계 기준.
// color: 데이터 시각화 전용 팔레트(지식맵 무지개와 같은 예외 — UI 크롬에는 사용 금지).
export type Emotion = {
  id: string;
  emoji: string;
  ko: string;
  en: string;
  valence: -2 | -1 | 0 | 1 | 2;
  color: string;
};

export const EMOTIONS: Emotion[] = [
  { id: "happy", emoji: "😄", ko: "행복해요", en: "happy", valence: 2, color: "#F9A825" },
  { id: "excited", emoji: "🤩", ko: "신나요", en: "excited", valence: 2, color: "#F4511E" },
  { id: "calm", emoji: "😌", ko: "편안해요", en: "calm", valence: 1, color: "#43A047" },
  { id: "yummy", emoji: "😋", ko: "맛있어요", en: "yummy", valence: 1, color: "#D81B60" },
  { id: "curious", emoji: "🤔", ko: "궁금해요", en: "curious", valence: 0, color: "#8E24AA" },
  { id: "bored", emoji: "🥱", ko: "지루해요", en: "bored", valence: -1, color: "#78909C" },
  { id: "scared", emoji: "😨", ko: "무서워요", en: "scared", valence: -2, color: "#3949AB" },
  { id: "sad", emoji: "😢", ko: "슬퍼요", en: "sad", valence: -2, color: "#1E88E5" },
];

export const EMOTION_BY_ID: Record<string, Emotion> = Object.fromEntries(
  EMOTIONS.map((e) => [e.id, e])
);

// ─────────────────── 카테고리 (가봤던 곳 / 가고 싶은 곳) ───────────────────
// 핀 테두리·라벨 색을 카테고리로 구분한다(감정은 이모지로 표현).
export type PinCategory = "visited" | "wish";

export const CATEGORIES: {
  id: PinCategory;
  ko: string;
  emoji: string;
  color: string;
}[] = [
  { id: "visited", ko: "가봤던 곳", emoji: "✅", color: "#00897B" },
  { id: "wish", ko: "가고 싶은 곳", emoji: "✨", color: "#5E35B1" },
];

export const CATEGORY_BY_ID: Record<string, (typeof CATEGORIES)[number]> =
  Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));

// ─────────────────── 장소 유형 ───────────────────
// en 은 "There is a ___" 빈칸에 그대로 들어가는 교과서식 명사.
export type PlaceType = { id: string; en: string; ko: string; emoji: string };

export const PLACE_TYPES: PlaceType[] = [
  { id: "park", en: "park", ko: "공원", emoji: "🌳" },
  { id: "playground", en: "playground", ko: "놀이터", emoji: "🛝" },
  { id: "library", en: "library", ko: "도서관", emoji: "📚" },
  { id: "school", en: "school", ko: "학교", emoji: "🏫" },
  { id: "restaurant", en: "restaurant", ko: "식당", emoji: "🍜" },
  { id: "cafe", en: "cafe", ko: "카페·빵집", emoji: "🥐" },
  { id: "store", en: "store", ko: "가게·마트", emoji: "🏪" },
  { id: "museum", en: "museum", ko: "박물관·전시", emoji: "🖼️" },
  { id: "stadium", en: "stadium", ko: "운동장·체육관", emoji: "⚽" },
  { id: "river", en: "river", ko: "강·하천", emoji: "🏞️" },
  { id: "etc", en: "place", ko: "기타", emoji: "📍" },
];

export const PLACE_TYPE_BY_ID: Record<string, PlaceType> = Object.fromEntries(
  PLACE_TYPES.map((p) => [p.id, p])
);

/** "You can ___ there." 빈칸 추천 표현 (영어 문장 만들기 보조 칩) */
export const CAN_DO_SUGGESTIONS: string[] = [
  "play soccer",
  "ride a bike",
  "read books",
  "eat delicious food",
  "take pictures",
  "see flowers",
  "play with friends",
  "have a picnic",
  "swim",
  "study",
];

/** 첫 글자가 모음이면 an, 아니면 a (한글 등은 a) */
function article(word: string): string {
  const c = word.trim().charAt(0).toLowerCase();
  return "aeiou".includes(c) ? "an" : "a";
}

/** 핀 입력값 → 교과서식 영어 문장 미리보기.
 *  '기타(etc)'는 정해진 영어 명사가 없으므로 학생이 적은 이름을 그대로 명사로 쓴다. */
export function pinSentence(
  placeType: string,
  placeName: string,
  canDo: string,
  emotion: string,
  category: PinCategory = "visited"
): string {
  const p = PLACE_TYPE_BY_ID[placeType];
  const e = EMOTION_BY_ID[emotion];
  // 기타면 학생이 적은 이름(영어 권장), 그 외엔 장소 유형의 영어 명사. 둘 다 없으면 "place".
  const noun = (placeType === "etc" ? placeName.trim() : p?.en) || "place";
  const parts: string[] = [];
  parts.push(`There is ${article(noun)} ${noun} in our town.`);
  if (canDo.trim()) parts.push(`You can ${canDo.trim()} there.`);
  if (category === "wish") parts.push(`I want to go there!`);
  if (e) parts.push(`I feel ${e.en}! ${e.emoji}`);
  return parts.join(" ");
}

/** 학생 핀 (engActivities/54/pins/{id}) — 실명 없음(creatorUid만, 사진은 표시용) */
export type TownPin = {
  id: string;
  creatorUid: string;
  schoolName: string;
  classNo: number;
  lat: number;
  lng: number;
  placeName: string; // 장소 이름 (예: 늘푸른 공원)
  placeType: string; // PLACE_TYPES id
  canDo: string; // "You can ___ there." 빈칸
  emotion: string; // EMOTIONS id
  category: PinCategory; // 가봤던 곳 / 가고 싶은 곳
  memory: string; // 추억(visited) 또는 가고 싶은 이유(wish) — 선택 입력
  photoURL: string; // 핀에 마킹할 학생 프로필 사진(없으면 "")
  createdAt: unknown;
};

// ─────────────────── 핀 반응(공감) · 댓글 ───────────────────
// 반응: 학생 1명당 핀 1개에 1개(바꾸면 교체). engActivities/54/pins/{id}/reactions/{uid}
export const REACTIONS: { id: string; emoji: string; ko: string }[] = [
  { id: "heart", emoji: "❤️", ko: "공감" },
  { id: "best", emoji: "👍", ko: "최고" },
  { id: "fun", emoji: "😆", ko: "재밌어" },
  { id: "wow", emoji: "😮", ko: "우와" },
  { id: "clap", emoji: "👏", ko: "멋져" },
];
export const REACTION_BY_ID: Record<string, (typeof REACTIONS)[number]> =
  Object.fromEntries(REACTIONS.map((r) => [r.id, r]));

/** 핀 댓글 (pins/{id}/comments/{cid}) — 실명 없음(uid+사진만) */
export type PinComment = {
  id: string;
  uid: string;
  text: string;
  photoURL: string;
  createdAt: unknown;
};

/** uid → 결정적 이모지 아바타(실명 대신 표시용, PII 아님) — 5-3과 동일 규칙 */
const AVATARS = [
  "🦊", "🐼", "🐯", "🐶", "🐱", "🐵", "🐰", "🐻", "🦁", "🐸",
  "🐧", "🐢", "🦉", "🐙", "🦄", "🐨", "🐲", "🐝", "🐬", "🦓",
];
export function avatarFromUid(uid: string): string {
  let h = 0;
  for (let i = 0; i < uid.length; i++) h = (h * 31 + uid.charCodeAt(i)) >>> 0;
  return AVATARS[h % AVATARS.length];
}
