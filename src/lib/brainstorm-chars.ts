// 브레인스토밍 판 캐릭터 — Tripo 로 만든 브롤스타즈풍 3D 캐릭터 40개(public/brainstorm/chars/{id}.glb).
// person: 대기·점프·걷기·아파하기 동작 / animal: 네 발 걷기 / bird·still: 동작 없이 코드로 통통 움직인다
// (두 발로 선 모양으로 만들어진 동물들은 네 발 리깅이 안 돼서 still).
// 순수 모듈 — 학생에게 캐릭터를 나눠 주는 규칙은 tests/brainstorm-map.test.cjs 에서 함께 검사한다.

export type CharKind = "person" | "animal" | "bird" | "still";
export type BrainChar = { id: string; name: string; kind: CharKind };

export const BRAIN_CHARS: BrainChar[] = [
  { id: "boy-hoodie", name: "후드티 친구", kind: "person" },
  { id: "boy-glasses", name: "안경 친구", kind: "person" },
  { id: "boy-cap", name: "야구모자 친구", kind: "person" },
  { id: "boy-jacket", name: "주황 점퍼 친구", kind: "person" },
  { id: "boy-headphones", name: "헤드폰 친구", kind: "person" },
  { id: "boy-curly", name: "곱슬머리 친구", kind: "person" },
  { id: "boy-wheelchair", name: "휠체어 친구", kind: "still" },
  { id: "girl-ponytail", name: "포니테일 친구", kind: "person" },
  { id: "girl-braids", name: "비옷 친구", kind: "person" },
  { id: "girl-bob", name: "단발 친구", kind: "person" },
  { id: "girl-bun", name: "똥머리 친구", kind: "person" },
  { id: "girl-wavy", name: "웨이브 친구", kind: "person" },
  { id: "girl-backpack", name: "가방 친구", kind: "person" },
  { id: "girl-sporty", name: "운동복 친구", kind: "person" },
  { id: "shiba", name: "시바견", kind: "animal" },
  { id: "cat-orange", name: "치즈 고양이", kind: "still" },
  { id: "cat-black", name: "까만 고양이", kind: "still" },
  { id: "jindo", name: "진돗개", kind: "animal" },
  { id: "fox", name: "여우", kind: "animal" },
  { id: "squirrel", name: "다람쥐", kind: "still" },
  { id: "rabbit", name: "토끼", kind: "still" },
  { id: "hamster", name: "햄스터", kind: "still" },
  { id: "raccoon", name: "너구리", kind: "still" },
  { id: "panda", name: "판다", kind: "still" },
  { id: "pigeon", name: "비둘기", kind: "bird" },
  { id: "chick", name: "병아리", kind: "bird" },
  { id: "penguin", name: "펭귄", kind: "bird" },
  { id: "parrot", name: "앵무새", kind: "bird" },
  { id: "owl", name: "부엉이", kind: "bird" },
  { id: "duck", name: "오리", kind: "bird" },
  { id: "boy-soccer", name: "축구복 친구", kind: "person" },
  { id: "boy-sweater", name: "스웨터 친구", kind: "person" },
  { id: "boy-taekwondo", name: "태권도 친구", kind: "person" },
  { id: "girl-hanbok", name: "한복 친구", kind: "person" },
  { id: "girl-overalls", name: "멜빵바지 친구", kind: "person" },
  { id: "girl-beanie", name: "털모자 친구", kind: "person" },
  { id: "corgi", name: "웰시코기", kind: "animal" },
  { id: "dalmatian", name: "달마시안", kind: "animal" },
  { id: "tiger", name: "아기 호랑이", kind: "animal" },
  { id: "lion", name: "아기 사자", kind: "animal" },
];

export const charUrl = (id: string) => `/brainstorm/chars/${id}.glb?v=1`;
export const charThumb = (id: string) => (id.startsWith(MOA_PREFIX) ? id.slice(MOA_PREFIX.length) : `/brainstorm/chars/${id}.png?v=1`);
/** 모아 월드에서 만든 캐릭터 — id = "moa:" + 그림 주소(3D 대신 판 위에 서 있는 그림) */
export const MOA_PREFIX = "moa:";
export const moaChar = (url: string): BrainChar => ({ id: `${MOA_PREFIX}${url}`, name: "내 캐릭터", kind: "still" });

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/**
 * 학생마다 캐릭터 하나 — 같은 학생은 어느 활동에서나 같은 캐릭터를 받고(uid 기준),
 * 한 판 안에서는 먼저 들어온 순서대로 겹치지 않게 다음 빈 캐릭터로 넘긴다(40명이 넘으면 다시 겹친다).
 */
export function assignChars(uids: string[], chars: BrainChar[] = BRAIN_CHARS): BrainChar[] {
  const used = new Set<number>(); const n = chars.length;
  return uids.map(uid => {
    let k = hash(uid) % n;
    if (used.size < n) while (used.has(k)) k = (k + 1) % n;
    used.add(k);
    return chars[k];
  });
}
