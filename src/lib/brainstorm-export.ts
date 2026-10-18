// 브레인스토밍 결과 CSV — AI(챗봇·스프레드시트 분석)에 그대로 붙여 넣기 좋게 '표 하나'로만 만든다.
// 설명 줄·빈 줄 없이 첫 줄이 열 이름, 한 줄이 한 학생(학생별) 또는 한 아이디어(아이디어별).
// 학생 코드(A-01 = 첫째 섬의 1번 학생)는 이름을 지우고 AI 에 줄 때도 학생을 구분할 수 있게 둔다.
import type { Idea } from "@/lib/brainstorm";

export type ExportStudent = { name: string; ideas: Idea[]; share: number };
export type ExportIsland = { name: string; students: ExportStudent[] };
export type ExportMode = "student" | "idea";

const q = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
/** 2026-10-18 09:12:33 (한국 시각) — 정렬·계산이 쉬운 형식 */
const time = (t: number) => new Date(t + 9 * 3600_000).toISOString().replace("T", " ").slice(0, 19);
const code = (n: number, k: number) => `${String.fromCharCode(65 + (n % 26))}-${String(k + 1).padStart(2, "0")}`;

export function brainstormCsv(topic: string, islands: ExportIsland[], mode: ExportMode) {
  const rows: (string | number)[][] = [];
  if (mode === "student") {
    rows.push(["주제", "반", "학생_코드", "학생", "아이디어_수", "땅_비율_퍼센트", "첫_응답_시각", "마지막_응답_시각", "아이디어_목록"]);
    islands.forEach((I, n) => I.students.forEach((s, k) => rows.push([
      topic, I.name, code(n, k), s.name, s.ideas.length, Math.round(s.share * 1000) / 10,
      time(s.ideas[0].at), time(s.ideas[s.ideas.length - 1].at),
      s.ideas.map((i, j) => `[${j + 1}] ${i.text}`).join(" | "),
    ])));
  } else {
    rows.push(["주제", "반", "학생_코드", "학생", "학생_아이디어_번호", "학생_아이디어_수", "아이디어", "글자_수", "쓴_시각"]);
    islands.forEach((I, n) => I.students.forEach((s, k) => s.ideas.forEach((i, j) => rows.push([
      topic, I.name, code(n, k), s.name, j + 1, s.ideas.length, i.text, i.text.length, time(i.at),
    ]))));
  }
  return "﻿" + rows.map(r => r.map(q).join(",")).join("\r\n") + "\r\n";
}

export function downloadBrainstormCsv(topic: string, islands: ExportIsland[], mode: ExportMode) {
  const url = URL.createObjectURL(new Blob([brainstormCsv(topic, islands, mode)], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  const safe = topic.slice(0, 24).replace(/[\\/:*?"<>|]/g, "").trim() || "브레인스토밍";
  a.href = url; a.download = `${safe}-${mode === "student" ? "학생별" : "아이디어별"}.csv`;
  a.click(); setTimeout(() => URL.revokeObjectURL(url), 2000);
}
