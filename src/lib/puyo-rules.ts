// 학급 뿌요뿌요 규칙 — 교사가 정하는 경기 규칙과, 1:1 대진 생성부터 결과까지의 진행 흐름.
// 화면(게임 열기·대기실·경기 중 규칙 보기)이 모두 이 파일 하나를 읽는다. 서버 검증은
// functions/src/puyoLogic.ts 의 normalizeRules·validatePlan 이 같은 값을 다시 확인한다.
// 순수 모듈(파이어베이스 의존 없음) — tests/puyo-rules.test.cjs 에서 직접 불러 검사한다.

/** 짝 정하기: 무작위로 섞기만 / 선생님이 직접 바꾸기 */
export type PuyoPairing = "random" | "manual";
/** 참가 학생이 홀수일 때: 선생님이 함께 대결 / 한 명은 이번 판 쉬기(다음 판 우선 참가) */
export type PuyoOdd = "teacher" | "rest";

/** 경기 방식: 1:1 / 4인 모둠(3~4명이 한 판, 공격은 모두에게 똑같이) */
export type PuyoSize = 2 | 4;

export type PuyoRules = {
  durationSec: number;
  size: PuyoSize;
  pairing: PuyoPairing;
  odd: PuyoOdd;
  /** 이긴 학생에게 주는 경험치. 0이면 보상 없음. */
  winXp: number;
};

export const PUYO_MIN_SEC = 60;
export const PUYO_MAX_SEC = 900;
export const PUYO_MAX_STUDENTS = 40;
export const PUYO_COUNTDOWN_SEC = 6;
export const PUYO_XP_OPTIONS = [0, 5, 10, 15, 20] as const;
export const PUYO_MINUTE_OPTIONS = [2, 3, 5, 7, 10] as const;

export const DEFAULT_PUYO_RULES: PuyoRules = { durationSec: 180, size: 2, pairing: "random", odd: "teacher", winXp: 10 };

/** 저장된 값이 비었거나 범위를 벗어나도 항상 쓸 수 있는 규칙으로 맞춘다(예전 게임 문서 호환). */
export function normalizeRules(raw?: Partial<PuyoRules> | null): PuyoRules {
  const sec = Math.round(Number(raw?.durationSec));
  const xp = Math.round(Number(raw?.winXp));
  return {
    durationSec: Number.isFinite(sec) ? Math.max(PUYO_MIN_SEC, Math.min(PUYO_MAX_SEC, sec)) : DEFAULT_PUYO_RULES.durationSec,
    size: Number(raw?.size) === 4 ? 4 : 2,
    pairing: raw?.pairing === "manual" ? "manual" : "random",
    odd: raw?.odd === "rest" ? "rest" : "teacher",
    winXp: Number.isFinite(xp) ? Math.max(0, Math.min(20, xp)) : DEFAULT_PUYO_RULES.winXp,
  };
}

export const minutesLabel = (sec: number) => (sec % 60 ? `${Math.floor(sec / 60)}분 ${sec % 60}초` : `${sec / 60}분`);

/** 교사가 정한 규칙을 한 줄씩 — 대기실·규칙 보기에서 "이번 판 규칙"으로 보여 준다. */
export function ruleSummary(r: PuyoRules, quiz?: { items: unknown[]; every: number; bonus: number; penalty: number } | null): { label: string; value: string }[] {
  return [
    { label: "제한 시간", value: minutesLabel(r.durationSec) },
    { label: "경기 방식", value: r.size === 4 ? "4인 모둠(3~4명)" : "1:1" },
    { label: r.size === 4 ? "모둠 정하기" : "짝 정하기", value: r.pairing === "manual" ? "선생님이 직접" : "무작위" },
    ...(r.size === 4 ? [] : [{ label: "홀수일 때", value: r.odd === "teacher" ? "선생님이 함께 대결" : "한 명은 쉬고 다음 판 먼저" }]),
    { label: r.size === 4 ? "모둠 1등" : "이긴 학생", value: r.winXp > 0 ? `+${r.winXp} XP` : "보상 없음" },
    ...(quiz ? [{ label: "문제 풀기", value: `뿌요 ${quiz.every}번마다 1문제(${quiz.items.length}문제) · 정답 +${quiz.bonus}점 · 오답 방해 ${quiz.penalty}개` }] : []),
  ];
}

export type FlowStage = "open" | "enter" | "pick" | "pair" | "ready" | "battle" | "judge" | "reward" | "next";
export type FlowStep = { stage: FlowStage; title: string; body: string; who: "선생님" | "학생" | "모두" | "자동" };

/** 진행 흐름 = 규칙. 1:1 대진 생성부터 끝까지 이 순서로만 진행된다. */
export function puyoFlow(r: PuyoRules): FlowStep[] {
  const four = r.size === 4;
  const odd = four ? "모둠은 3~4명씩 고르게 나눠요(학생이 한 명뿐이면 선생님이 함께해요). 쉬는 친구는 없어요."
    : r.odd === "teacher"
    ? "참가 학생이 홀수면 선생님이 한 자리를 맡아 함께 대결해요."
    : "참가 학생이 홀수면 한 명은 이번 판을 쉬고 응원해요. 쉰 친구는 다음 판에 먼저 짝을 받아요.";
  return [
    { stage: "open", who: "선생님", title: "게임 열기", body: `규칙을 정하고 게임을 열어요. 이번 판은 ${minutesLabel(r.durationSec)} 동안 겨뤄요.` },
    { stage: "enter", who: "학생", title: "대기실 입장", body: "학급 화면이 자동으로 대기실로 이동해요. 대기실에 들어온 친구만 참가할 수 있어요." },
    { stage: "pick", who: "선생님", title: "참가자 고르기", body: `접속한 학생 중 참가할 친구를 체크해요(최대 ${PUYO_MAX_STUDENTS}명).` },
    {
      stage: "pair", who: "선생님", title: four ? "4인 모둠 정하기" : "1:1 짝 정하기",
      body: `${r.pairing === "manual" ? `${four ? "모둠" : "짝"}을 만든 뒤 두 친구를 차례로 눌러 자리를 바꿀 수 있어요.` : `무작위로 ${four ? "모둠을 나눠요" : "짝을 지어요"}. 마음에 들지 않으면 다시 섞을 수 있어요.`} ${odd}`,
    },
    { stage: "ready", who: "자동", title: `${PUYO_COUNTDOWN_SEC}초 준비`, body: `시작하면 모두 함께 카운트다운해요. ${four ? "같은 모둠" : "짝꿍 두 사람"}은 똑같은 순서로 뿌요를 받아요.` },
    { stage: "battle", who: "학생", title: "대결", body: four ? "같은 색 4개를 이어 터뜨려요. 내가 보낸 방해 뿌요는 모둠 친구 모두에게 똑같이 떨어져요. 여러 친구의 공격이 한꺼번에 쌓이지 않게, 3명 이상일 때 받는 방해 뿌요는 절반이에요." : "같은 색 4개를 이어 터뜨려요. 연쇄로 터뜨릴수록 상대에게 방해 뿌요를 많이 보내요." },
    {
      stage: "judge", who: "자동", title: "승부 결정",
      body: `보드가 꽉 차도 끝나지 않아요. 판을 비우고 바로 다시 시작해요(다시 시작한 횟수가 기록돼요). 시간이 끝나거나 선생님이 끝내면 ${four ? "모둠에서 점수가 가장 높은 친구가 1등이고, 1등이 동점이면 무승부예요" : "점수가 높은 쪽이 이기고, 동점은 무승부예요"}. 잠깐 연결이 끊겨도 경기는 계속돼요.`,
    },
    {
      stage: "reward", who: "자동", title: "결과와 보상",
      body: r.winXp > 0
        ? `${four ? "모둠 1등" : "이긴 학생"}은 +${r.winXp} XP를 받아요. 선생님이 이기거나 무승부면 보상이 없어요. 결과는 게임 이력에 남아요.`
        : "이번 판은 보상 없이 겨뤄요. 결과는 게임 이력에 남아요.",
    },
    { stage: "next", who: "선생님", title: "한 판 더 · 마치기", body: "같은 규칙으로 한 판 더 하면 모두 새 대기실로 함께 이동해요. 마치면 학급 화면으로 돌아가요." },
  ];
}

/** 게임 방법(조작·점수) — 학생용. */
export const PUYO_HOW_TO: { title: string; body: string }[] = [
  { title: "같은 색 4개", body: "위·아래·옆으로 같은 색이 4개 이상 이어지면 팡! 사라져요. 대각선은 안 돼요." },
  { title: "연쇄 공격", body: "터진 뒤 떨어진 뿌요가 또 터지면 연쇄예요. 연쇄가 길수록 점수와 공격이 커져요." },
  { title: "꽉 차도 괜찮아", body: "가운데 위가 막히면 판이 비워지고 다시 시작해요. 점수는 그대로라 끝까지 포기하지 마세요!" },
  { title: "방해 뿌요", body: "회색 방해 뿌요는 옆에서 다른 뿌요가 터질 때만 함께 사라져요. 내가 공격하면 받을 방해 뿌요가 먼저 줄어요." },
  { title: "조작", body: "← → 이동, ↓ 빨리 내리기, Z·X(또는 ↑) 회전, Space 바로 떨어뜨리기. 화면 버튼도 돼요." },
];

/** pairs: 한 판에 함께 겨루는 사람들(1:1이면 2명, 4인 모둠이면 2~4명). 이름은 예전 호환으로 유지. */
export type PuyoPlan = { pairs: string[][]; resting: string[] };

/** n명을 4명 이하 모둠으로 고르게 나눈 크기들 — 7→[4,3], 9→[3,3,3], 5→[3,2]. */
export function groupSizes(n: number): number[] {
  if (n <= 0) return [];
  const g = Math.ceil(n / 4); const base = Math.floor(n / g); const extra = n % g;
  return Array.from({ length: g }, (_, i) => base + (i < extra ? 1 : 0));
}

/**
 * 1:1 대진 만들기(대기실 미리보기). 섞은 뒤 둘씩 짝을 짓고, 홀수면 규칙대로 처리한다.
 * rest 규칙에서 쉬는 사람은 직전 판에 쉬지 않은 학생 중에서 고른다(연속으로 쉬지 않게).
 */
export function planPairs(students: string[], teacher: string, r: PuyoRules, prevResting: string[] = [], random: () => number = Math.random): PuyoPlan {
  const ids = [...new Set(students)].filter(id => id && id !== teacher);
  for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
  if (r.size === 4) {
    // 4인 모둠: 쉬는 사람 없이 3~4명씩. 학생이 혼자면 선생님이 함께한다.
    if (ids.length === 1) ids.push(teacher);
    const groups: string[][] = []; let at = 0;
    for (const n of groupSizes(ids.length)) { groups.push(ids.slice(at, at + n)); at += n; }
    return { pairs: groups, resting: [] };
  }
  const resting: string[] = [];
  if (ids.length % 2) {
    if (r.odd === "teacher") ids.push(teacher);
    else {
      const rested = new Set(prevResting);
      // 섞인 순서상 뒤에서부터, 직전에 쉬지 않은 학생 우선
      let k = ids.length - 1;
      while (k > 0 && rested.has(ids[k])) k--;
      resting.push(ids.splice(k, 1)[0]);
    }
  }
  // 교사가 들어간 경우 교사 자리도 무작위가 되도록 한 번 더 섞는다
  if (ids.includes(teacher)) for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
  const pairs: string[][] = [];
  for (let i = 0; i + 1 < ids.length; i += 2) pairs.push([ids[i], ids[i + 1]]);
  return { pairs, resting };
}

/** 미리보기에서 두 자리를 맞바꾼다(직접 지정 규칙). 같은 짝 안에서 바꾸는 것은 의미가 없어 그대로 둔다. */
export function swapInPlan(plan: PuyoPlan, a: string, b: string): PuyoPlan {
  const where = (id: string) => {
    const p = plan.pairs.findIndex(pair => pair.includes(id));
    return p >= 0 ? { p, s: plan.pairs[p].indexOf(id) } : plan.resting.includes(id) ? { p: -1, s: plan.resting.indexOf(id) } : null;
  };
  const x = where(a); const y = where(b);
  if (!x || !y || (x.p === y.p && x.p >= 0)) return plan;
  const pairs = plan.pairs.map(pair => [...pair]); const resting = [...plan.resting];
  const set = (at: { p: number; s: number }, id: string) => { if (at.p >= 0) pairs[at.p][at.s] = id; else resting[at.s] = id; };
  set(x, b); set(y, a);
  return { pairs, resting };
}

/** 미리보기가 지금 선택·접속 상태와 그대로 맞는지 — 누가 나가거나 선택이 바뀌면 다시 만들어야 한다. */
export function planMatches(plan: PuyoPlan | null, selected: string[], teacher: string): plan is PuyoPlan {
  if (!plan || plan.pairs.length === 0) return false;
  const inPlan = [...plan.pairs.flat(), ...plan.resting].filter(id => id !== teacher).sort();
  const chosen = [...new Set(selected)].filter(id => id !== teacher).sort();
  return inPlan.length === chosen.length && inPlan.every((id, i) => id === chosen[i]);
}
