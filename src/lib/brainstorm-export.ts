// 브레인스토밍 결과 CSV — AI(챗봇·스프레드시트 분석)에 그대로 붙여 넣기 좋게 만든다.
// 위: 첫 줄이 열 이름인 표 하나(한 줄 = 한 학생 또는 한 아이디어). 아래: 빈 줄 + 구분 줄 뒤에
// 이 표로 시각화·대시보드·임베딩을 하라는 AI 안내 프롬프트(첫 칸에 한 줄씩). 표만 쓸 때는 구분 줄부터 지우면 된다.
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
  const table = rows.map(r => r.map(q).join(",")).join("\r\n");
  const guide = promptLines(topic, mode, rows.length - 1).map(l => q(l)).join("\r\n");
  return "\ufeff" + table + "\r\n\r\n" + guide + "\r\n";
}

export function downloadBrainstormCsv(topic: string, islands: ExportIsland[], mode: ExportMode) {
  const url = URL.createObjectURL(new Blob([brainstormCsv(topic, islands, mode)], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  const safe = topic.slice(0, 24).replace(/[\\/:*?"<>|]/g, "").trim() || "브레인스토밍";
  a.href = url; a.download = `${safe}-${mode === "student" ? "학생별" : "아이디어별"}.csv`;
  a.click(); setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** 표 아래에 붙는 AI 안내 — 이 줄부터는 데이터가 아니다 */
export const PROMPT_MARK = "===== AI 분석 안내 (이 줄부터 끝까지는 데이터가 아니라 AI에게 주는 지시문입니다) =====";

function promptLines(topic: string, mode: ExportMode, n: number) {
  const unit = mode === "student" ? "학생" : "아이디어";
  const cols = mode === "student"
    ? "주제, 반, 학생_코드(A-01 = 첫째 반 1번), 학생, 아이디어_수, 땅_비율_퍼센트(판에서 차지한 땅 %), 첫_응답_시각, 마지막_응답_시각, 아이디어_목록(\"[1] … | [2] …\" 형식)"
    : "주제, 반, 학생_코드(A-01 = 첫째 반 1번), 학생, 학생_아이디어_번호, 학생_아이디어_수, 아이디어, 글자_수, 쓴_시각";
  return [
    PROMPT_MARK,
    `당신은 수업 데이터 분석가입니다. 위 표는 초등학생 브레인스토밍 결과입니다. 주제: "${topic}". 한 줄 = 한 ${unit}, 모두 ${n}줄입니다.`,
    `열: ${cols}. 시각은 한국 시각(YYYY-MM-DD HH:MM:SS)입니다.`,
    "데이터는 첫 줄(열 이름)부터 이 안내 줄 바로 위의 빈 줄 전까지만 읽으세요. 학생 이름 대신 학생_코드로 사람을 구분하고, 결과물에는 이름을 쓰지 마세요(요청이 있을 때만 이름 사용).",
    ...(mode === "student" ? [
      "[준비] 아이디어_목록을 \" | \" 로 나누고 앞의 [번호]를 떼어 '한 줄 = 한 아이디어' 표로 펼친 뒤 분석하세요.",
    ] : []),
    "[1. 아이디어 묶기] 비슷한 아이디어끼리 5~8개 주제로 묶고, 주제마다 이름(10자 이내)·한 줄 설명·대표 아이디어 3개·아이디어 수를 표로 정리하세요. 모든 아이디어에 주제 열을 붙인 표도 함께 주세요.",
    "[2. 시각화] 다음 차트를 만드세요: ① 주제별 아이디어 수 막대그래프 ② 반별·주제별 비율 누적 막대(반이 하나면 생략) ③ 학생별 아이디어 수 분포 히스토그램 ④ 시간 흐름(1분 단위)에 따른 누적 아이디어 수 선그래프 ⑤ 자주 나온 낱말 워드클라우드(조사·어미 제외). 차트마다 한 문장 해석을 붙이세요.",
    "[3. 대시보드] 한 화면 HTML 대시보드를 만드세요. 위쪽 요약 카드(참여 학생 수, 아이디어 수, 1인당 평균, 가장 큰 주제), 가운데 위 차트들, 아래쪽 '주제별 아이디어 카드'와 '반·주제 필터'. 외부 서버 없이 파일 하나로 열리게 하고, 초등학생도 읽을 수 있는 쉬운 말과 큰 글씨를 쓰세요.",
    "[4. 임베딩] 아이디어 문장마다 임베딩을 만들 수 있도록 '아이디어_ID(학생_코드-번호), 아이디어, 주제, 반, 학생_코드' 열의 JSONL을 출력하세요(한 줄에 하나, text 필드 = 아이디어). 임베딩을 직접 계산할 수 있다면 코사인 유사도로 군집을 다시 확인하고, UMAP/t-SNE 2차원 지도(점 색 = 주제)와 서로 가장 비슷한 아이디어 쌍 10개, 다른 아이디어와 가장 다른 독특한 아이디어 5개를 보여 주세요.",
    "[5. 수업 활용] 선생님이 다음 시간에 쓸 수 있게: 반 전체가 놓친 관점 3가지, 함께 토의할 질문 3개, 아이디어를 실천 계획으로 바꾸는 활동 1개를 제안하세요.",
    "결과는 한국어로, 표·차트·코드를 차례로 주세요. 숫자는 위 표에서 직접 세어 확인하고, 추측한 내용은 추측이라고 밝히세요.",
  ];
}
