// 뿌요뿌요 문제 풀기 — 뿌요를 몇 번 내려놓을 때마다 4지선다 문제가 나오고,
// 맞히면 점수, 틀리면 내 보드에 방해 뿌요가 떨어진다. 교사가 게임을 열 때 문제를 넣는다.
//   classes/{cid}/games/{gid}.puyo.quiz = PuyoQuiz
// 문항 모양은 퀴즈런(QuizItem)과 같아서 문제 은행·지난 문제를 그대로 쓴다.
// 순수 모듈(파이어베이스 의존 없음) — tests/puyo-quiz.test.cjs 에서 직접 불러 검사한다.
import type { QuizItem } from "@/lib/quizrun";

export type PuyoQuiz = {
  items: QuizItem[];
  /** 뿌요(한 쌍)를 몇 번 내려놓을 때마다 한 문제 */
  every: number;
  /** 맞혔을 때 더하는 점수 */
  bonus: number;
  /** 틀렸을 때 내 보드에 떨어지는 방해 뿌요 수 */
  penalty: number;
};

export const PUYO_QUIZ_DEFAULTS = { every: 5, bonus: 500, penalty: 2 } as const;
export const PUYO_QUIZ_MAX_ITEMS = 200;

/** 저장된 값을 항상 쓸 수 있는 모양으로 — 문항이 하나도 없으면 문제 풀기를 끈 것으로 본다. */
export function normalizeQuiz(raw: unknown): PuyoQuiz | null {
  if (!raw || typeof raw !== "object") return null;
  const q = raw as Partial<PuyoQuiz>;
  const items = (Array.isArray(q.items) ? q.items : []).filter(isUsable).slice(0, PUYO_QUIZ_MAX_ITEMS);
  if (!items.length) return null;
  const int = (v: unknown, min: number, max: number, d: number) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : d;
  };
  return {
    items,
    every: int(q.every, 1, 20, PUYO_QUIZ_DEFAULTS.every),
    bonus: int(q.bonus, 0, 5000, PUYO_QUIZ_DEFAULTS.bonus),
    penalty: int(q.penalty, 0, 12, PUYO_QUIZ_DEFAULTS.penalty),
  };
}

function isUsable(it: unknown): it is QuizItem {
  const q = it as QuizItem;
  return !!q && typeof q.id === "string" && typeof q.prompt === "string" && !!q.prompt.trim()
    && Array.isArray(q.options) && q.options.filter(o => typeof o === "string" && o.trim()).length >= 2
    && Number.isInteger(q.answerIndex) && typeof q.options[q.answerIndex] === "string" && !!q.options[q.answerIndex].trim();
}

function seededOrder(n: number, seed: string): number[] {
  const order = Array.from({ length: n }, (_, i) => i);
  let h = 5381;
  for (let i = 0; i < seed.length; i++) h = ((h << 5) + h + seed.charCodeAt(i)) | 0;
  let s = h >>> 0 || 1;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  return order;
}

/**
 * asked 번째(0부터) 문제 — 학생마다 섞인 순서로 한 바퀴 돌고, 다 풀면 새로 섞어 다시 돈다.
 * 시드(학생·게임)와 asked 만으로 정해져서 새로고침해도 같은 문제가 이어진다.
 * 바퀴가 넘어갈 때 직전 문제가 바로 다시 나오지 않게 한 칸 민다.
 */
export function pickQuestion(items: QuizItem[], seed: string, asked: number): QuizItem | null {
  const n = items.length; if (!n) return null;
  const round = Math.floor(asked / n); const at = asked % n;
  const order = seededOrder(n, `${seed}:${round}`);
  if (round > 0 && n > 1) {
    const prev = seededOrder(n, `${seed}:${round - 1}`);
    if (order[0] === prev[n - 1]) [order[0], order[1]] = [order[1], order[0]];
  }
  return items[order[at]];
}

/* ───────────────── CSV 템플릿 ───────────────── */

export const QUIZ_CSV_HEADER = ["문제", "보기1", "보기2", "보기3", "보기4", "정답"];
const CSV_EXAMPLES = [
  ["물이 얼음이 되는 온도는?", "0도", "10도", "50도", "100도", "1"],
  ["'사과'를 영어로 하면?", "banana", "apple", "grape", "melon", "2"],
  ["우리나라의 수도는?", "부산", "대구", "서울", "", "3"],
];

const cell = (v: string) => /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;

/** 엑셀에서 한글이 깨지지 않게 BOM 을 붙인 템플릿(예시 3줄 포함). */
export function quizCsvTemplate(): string {
  return "﻿" + [QUIZ_CSV_HEADER, ...CSV_EXAMPLES].map(r => r.map(cell).join(",")).join("\r\n") + "\r\n";
}

/** 따옴표·쉼표·줄바꿈이 든 칸까지 읽는 작은 CSV 파서. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let field = ""; let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') { if (src[i + 1] === '"') { field += '"'; i++; } else quoted = false; }
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim()));
}

export type CsvImport = { items: QuizItem[]; errors: string[] };

/**
 * CSV → 문항. 첫 줄이 머리글이면 건너뛴다. 정답 칸은 1~4 번호를 쓰고,
 * 번호 대신 보기 글자를 그대로 적어도 알아듣는다. 문제가 있는 줄은 몇 번째 줄인지 알려 준다.
 */
export function quizFromCsv(text: string, makeId: () => string): CsvImport {
  const rows = parseCsv(text); const items: QuizItem[] = []; const errors: string[] = [];
  const isHeader = (r: string[]) => (r[0] ?? "").replace(/\s/g, "").startsWith("문제") || /^(question|prompt)$/i.test((r[0] ?? "").trim());
  rows.forEach((r, k) => {
    if (k === 0 && isHeader(r)) return;
    const line = k + 1;
    const prompt = (r[0] ?? "").trim();
    const raw = r.slice(1, 5).map(o => (o ?? "").trim());
    const answer = (r[5] ?? "").trim();
    if (!prompt) { errors.push(`${line}번째 줄: 문제가 비어 있어요`); return; }
    // 빈 보기는 빼되, 정답 번호는 원래 칸 기준이라 위치를 같이 옮긴다
    const kept: { text: string; at: number }[] = raw.map((t, at) => ({ text: t, at })).filter(o => o.text);
    if (kept.length < 2) { errors.push(`${line}번째 줄: 보기가 2개 이상 필요해요`); return; }
    let at = -1;
    const n = Number(answer.replace(/번$/, ""));
    if (Number.isInteger(n) && n >= 1 && n <= 4) at = kept.findIndex(o => o.at === n - 1);
    else if (answer) at = kept.findIndex(o => o.text === answer);
    if (at < 0) { errors.push(`${line}번째 줄: 정답은 보기 번호(1~4)로 적어 주세요`); return; }
    items.push({ id: makeId(), prompt, options: kept.map(o => o.text), answerIndex: at });
  });
  return { items, errors };
}

/** 지금 문항을 CSV 로 — 만든 문제를 파일로 보관하거나 다른 선생님과 나눌 때. */
export function quizToCsv(items: QuizItem[]): string {
  const rows = items.map(it => [it.prompt, ...[0, 1, 2, 3].map(i => it.options[i] ?? ""), String(it.answerIndex + 1)]);
  return "﻿" + [QUIZ_CSV_HEADER, ...rows].map(r => r.map(cell).join(",")).join("\r\n") + "\r\n";
}
