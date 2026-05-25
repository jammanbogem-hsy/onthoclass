// extractOntology Cloud Function 호출 래퍼
import { httpsCallable } from "firebase/functions";
import { getFunctionsClient } from "@/lib/firebase";
import type { Ontology } from "@/lib/lessons";

type ExtractInput = {
  classId: string;
  question?: string;
  phase?: "pre" | "post";
  responses: { studentId?: string; text: string }[];
};

/** 학생 응답들을 의미 분석해 지식 그래프 온톨로지를 생성 */
export async function extractOntology(
  input: ExtractInput
): Promise<Ontology> {
  const fn = httpsCallable<ExtractInput, Ontology>(
    getFunctionsClient(),
    "extractOntology"
  );
  const res = await fn(input);
  return res.data;
}

export type LabelClusters = {
  clusters: {
    canonicalId: string;
    canonicalLabel: string;
    members: string[];
  }[];
};

/** 라벨 목록만 보내 동의어/표기변형을 클러스터링 (저비용) */
export async function normalizeLabels(input: {
  classId: string;
  labels: { id: string; label: string }[];
}): Promise<LabelClusters> {
  const fn = httpsCallable<typeof input, LabelClusters>(
    getFunctionsClient(),
    "normalizeLabels"
  );
  const res = await fn(input);
  return res.data;
}

/** 임베딩 기반 개념 정준화 (코사인 kNN 연결요소). LLM 추론 없음 */
export async function canonicalizeOntology(input: {
  classId: string;
  nodes: { id: string; label: string; sourceCount?: number }[];
  threshold?: number;
}): Promise<LabelClusters> {
  const fn = httpsCallable<typeof input, LabelClusters>(
    getFunctionsClient(),
    "canonicalizeOntology"
  );
  const res = await fn(input);
  return res.data;
}

export type WikiInsights = {
  narrative: string;
  concepts: { id: string; insight: string }[];
  followUps: string[];
  misconceptions: string[];
  gaps: string[];
  highlights?: string[];
};

/** 머지된 온톨로지 JSON(원문 아님)으로 종합 서사 + 형성평가 lint 생성 */
export async function wikiInsights(input: {
  classId: string;
  payload: unknown;
}): Promise<WikiInsights> {
  const fn = httpsCallable<typeof input, WikiInsights>(
    getFunctionsClient(),
    "wikiInsights"
  );
  const res = await fn(input);
  return res.data;
}

export type ParsedSurvey = {
  items: {
    type: "scale" | "choice" | "open";
    prompt: string;
    options: string[];
    scaleMax: number;
    scaleLow: string;
    scaleHigh: string;
  }[];
};

/** PDF·이미지·문서(base64) → 설문 문항 추출 (Claude 비전/PDF). 교사 전용 */
export async function parseSurveyDoc(input: {
  classId: string;
  files: { mediaType: string; data: string }[];
}): Promise<ParsedSurvey> {
  const fn = httpsCallable<typeof input, ParsedSurvey>(
    getFunctionsClient(),
    "parseSurveyDoc"
  );
  const res = await fn(input);
  return res.data;
}
