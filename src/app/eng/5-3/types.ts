// 5단원 3차시 "Where Is ABC Library?" 길찾기 활동 — 공용 타입/상수.
// 모델: 건물 블록 격자(N×N) + 사이/둘레 도로. 사람은 도로를 걷고, 건물은 블록 위에
//       큰 그림으로(영어 라벨 없음) 놓인다. 시작점은 건물이 아니라 가장자리 진입 화살표.

/** 활동 식별자 (engActivities/{ACTIVITY_ID}) */
export const ACTIVITY_ID = "5-3";

/** 정답 1건당 만든이/푼이에게 주는 점수 */
export const POINTS_PER_SOLVE = 5;

/** public/53 폴더의 장소 이미지. en 은 교과서 표현 그대로. */
export type Place = { id: string; en: string; ko: string; img: string };

export const PLACES: Place[] = [
  { id: "library", en: "library", ko: "도서관", img: "library.png" },
  { id: "hospital", en: "hospital", ko: "병원", img: "hospital.png" },
  { id: "restaurant", en: "restaurant", ko: "식당", img: "restaurant.png" },
  { id: "bank", en: "bank", ko: "은행", img: "bank.png" },
  { id: "busstop", en: "bus stop", ko: "버스정류장", img: "busstop.png" },
  { id: "restroom", en: "restroom", ko: "화장실", img: "restroom.png" },
  { id: "park", en: "park", ko: "공원", img: "park.png" },
  { id: "cafe", en: "cafe", ko: "카페", img: "cafe.png" },
  { id: "academy", en: "academy", ko: "학원", img: "academy.png" },
  {
    id: "store",
    en: "convenience store",
    ko: "편의점",
    img: "convienence store.png", // 원본 파일명(철자/공백) 그대로
  },
];

export const PLACE_BY_ID: Record<string, Place> = Object.fromEntries(
  PLACES.map((p) => [p.id, p])
);

/** 장소 이미지 경로 (public/53). 공백은 URL 인코딩. */
export function placeImg(id: string): string {
  const p = PLACE_BY_ID[id];
  return p ? `/53/${encodeURIComponent(p.img)}` : "";
}

/** 한 변의 블록 수 (N×N 블록) */
export type GridSize = 3 | 4;

/** 시작점 — 가장자리 진입 화살표. 블록 사이 내부 도로선(line=1..N-1) 끝에서
 *  안쪽을 향해 출발한다. (도로 위 시작, 건물 아님) */
export type StartSide = "top" | "right" | "bottom" | "left";
export type Start = { side: StartSide; line: number };

/** 진입 방향(바라보는 쪽) 글리프 */
export function startGlyph(side: StartSide): string {
  return side === "left"
    ? "▶"
    : side === "right"
      ? "◀"
      : side === "top"
        ? "▼"
        : "▲";
}

export function startLabelKo(start: Start): string {
  const where =
    start.side === "left"
      ? "왼쪽"
      : start.side === "right"
        ? "오른쪽"
        : start.side === "top"
          ? "위"
          : "아래";
  const dir =
    start.side === "left"
      ? "오른쪽으로"
      : start.side === "right"
        ? "왼쪽으로"
        : start.side === "top"
          ? "아래로"
          : "위로";
  return `${where} 도로(${start.line}번)에서 ${dir} 출발`;
}

/** 길안내 한 단계: "Go straight {blocks} block(s) and turn {turn} at the {at}." */
export type DirectionStep = {
  blocks: 1 | 2 | 3;
  turn: "left" | "right";
  at: string; // place id
};

/** 마지막 위치 표현 */
export type DirectionEnding =
  | { type: "next_to"; place: string } // It's next to the {place}.
  | { type: "side"; side: "left" | "right" }; // It's on your {side}.

/** 챌린지 공개 데이터 (지도 + 시작점 + 안내문). 목적지(정답)는 포함하지 않는다.
 *  실명(creatorName)도 저장하지 않는다 — 작성자 식별은 creatorUid(불투명)만. */
export type Challenge = {
  id: string;
  creatorUid: string;
  gridSize: GridSize;
  /** 길이 gridSize*gridSize*4, 각 슬롯의 place id 또는 null */
  board: (string | null)[];
  /** 시작점(가장자리 진입 화살표) */
  start: Start;
  /** 출제자가 만든 참고 안내문(채점 시 비교용). 푸는 학생 화면엔 보이지 않는다. */
  steps: DirectionStep[];
  ending: DirectionEnding;
  /** 목적지 place id — 푸는 학생 지도에 표시(여기로 가는 안내문을 작성) */
  destination?: string;
  /** 출제자 학교·6학년 반 (같은 반 친구 것만 풀도록 필터) */
  schoolName?: string;
  classNo?: number;
  createdAt?: unknown;
};

/** 비공개 정답 (engActivities/5-3/challenges/{id}/private/answer) */
export type ChallengeAnswer = {
  /** 목적지 place id */
  destination: string;
};

/** 활동 참가자 식별 (engActivities/5-3/players/{uid}) — 학교(NEIS)+6학년 반.
 *  실명 대신 학교·반으로 응답을 묶어 보고/채점한다. */
export type Player = { uid: string; schoolName: string; classNo: number };

/** 6학년 반 선택지 (1~15반) */
export const CLASS_NOS = Array.from({ length: 15 }, (_, i) => i + 1);

/** 채점 상태: 제출 → 출제자 1차 → 교사 확정 */
export type SolveStatus = "pending" | "approved" | "rejected";

/** 푼 사람의 제출 (challenges/{id}/solvers/{uid}). 실명 없이 학교·반으로 식별.
 *  푸는 학생이 작성한 길안내문(steps/ending)을 출제자→교사가 사람 채점한다. */
export type Solver = {
  uid: string;
  steps: DirectionStep[];
  ending: DirectionEnding | null;
  status: SolveStatus; // 교사 확정 결과
  creatorMark?: "ok" | "no" | null; // 출제자 1차 체크
  schoolName?: string;
  classNo?: number;
  createdAt?: unknown;
};

/** 안내 단계를 영어 문장으로 렌더 */
export function stepToEnglish(s: DirectionStep, placeEn: (id: string) => string): string {
  const blk = s.blocks === 1 ? "one block" : `${s.blocks === 2 ? "two" : "three"} blocks`;
  return `Go straight ${blk} and turn ${s.turn} at the ${placeEn(s.at)}.`;
}

export function endingToEnglish(e: DirectionEnding, placeEn: (id: string) => string): string {
  return e.type === "next_to"
    ? `It's next to the ${placeEn(e.place)}.`
    : `It's on your ${e.side}.`;
}

/** uid → 결정적 이모지 아바타(실명 대신 표시용, PII 아님) */
const AVATARS = [
  "🦊", "🐼", "🐯", "🐶", "🐱", "🐵", "🐰", "🐻", "🦁", "🐸",
  "🐧", "🐢", "🦉", "🐙", "🦄", "🐨", "🐲", "🐝", "🐬", "🦓",
];
export function avatarFromUid(uid: string): string {
  let h = 0;
  for (let i = 0; i < uid.length; i++) h = (h * 31 + uid.charCodeAt(i)) >>> 0;
  return AVATARS[h % AVATARS.length];
}
