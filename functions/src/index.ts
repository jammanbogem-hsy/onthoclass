/**
 * 잼클래스 온톨로지 추출 Cloud Function (v2, TypeScript)
 *
 * 학생들의 자유 서술 응답 → Claude API로 개념(노드) · 관계(엣지) · 감정 추출 → 구조화 JSON
 *
 * 보안: ANTHROPIC_API_KEY 는 Secret Manager 시크릿. 클라이언트/깃에 절대 노출되지 않음.
 * 권한: 호출자는 해당 학급의 teacher 여야 함(비용·오남용 방지).
 */
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { defineSecret } from "firebase-functions/params";
import { setGlobalOptions } from "firebase-functions/v2";
import { initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import Anthropic from "@anthropic-ai/sdk";

initializeApp();
setGlobalOptions({ region: "asia-northeast3" }); // 서울 리전

const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");
const OPENAI_API_KEY = defineSecret("OPENAI_API_KEY");
// 교사 가입 코드(서버 비밀). Secret Manager 미설정 시 기본값 사용.
const TEACHER_CODE = defineSecret("TEACHER_CODE");
const TEACHER_CODE_FALLBACK = "jam1536";

/* ---------- 출력 타입 & JSON Schema (구조화 출력) ---------- */
export type Sentiment = "positive" | "neutral" | "negative";

export interface Ontology {
  nodes: {
    id: string;
    label: string;
    type: "concept" | "keyword" | "emotion";
    weight: number;
    sentiment: Sentiment;
    sourceCount: number; // 이 개념을 언급한 서로 다른 학생/응답 수
    sources: string[]; // 언급한 학생ID 목록 (입력에 준 studentId)
  }[];
  edges: {
    source: string;
    target: string;
    relation: string;
    weight: number;
    evidence: string; // 이 관계의 근거 한 줄
    sourceCount: number; // 이 관계가 드러난 학생/응답 수
  }[];
  overallSentiment: { positive: number; neutral: number; negative: number };
  summary: string;
}

// 구조화 출력 제약: 수치/길이 제약 미지원. additionalProperties:false 필수.
const ONTOLOGY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    nodes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string", description: "정규화된 한글 키워드(엣지와 일치)" },
          label: { type: "string", description: "표시용 라벨" },
          type: {
            type: "string",
            enum: ["concept", "keyword", "emotion"],
            description:
              "감정·느낌을 나타내는 표현이면 'emotion', 그 외 개념/키워드",
          },
          weight: { type: "number", description: "언급 강도 1~10 정수" },
          sentiment: {
            type: "string",
            enum: ["positive", "neutral", "negative"],
          },
          sourceCount: {
            type: "number",
            description: "이 개념을 언급한 서로 다른 학생 수(정수)",
          },
          sources: {
            type: "array",
            items: { type: "string" },
            description:
              "이 개념을 언급한 학생ID 목록. 입력의 '학생:<id>'에 적힌 id를 그대로 사용. 모르면 빈 배열.",
          },
        },
        required: [
          "id",
          "label",
          "type",
          "weight",
          "sentiment",
          "sourceCount",
          "sources",
        ],
      },
    },
    edges: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          source: { type: "string" },
          target: { type: "string" },
          relation: {
            type: "string",
            description: "관계 라벨 (예: 원인, 포함, 대조, 연관)",
          },
          weight: { type: "number", description: "관계 강도 1~10 정수" },
          evidence: {
            type: "string",
            description: "이 관계를 뒷받침하는 근거 한 줄(한국어, 응답에 근거)",
          },
          sourceCount: {
            type: "number",
            description: "이 관계가 드러난 서로 다른 학생 수(정수)",
          },
        },
        required: [
          "source",
          "target",
          "relation",
          "weight",
          "evidence",
          "sourceCount",
        ],
      },
    },
    overallSentiment: {
      type: "object",
      additionalProperties: false,
      properties: {
        positive: { type: "number" },
        neutral: { type: "number" },
        negative: { type: "number" },
      },
      required: ["positive", "neutral", "negative"],
    },
    summary: { type: "string", description: "핵심 요약 2~3문장(한국어)" },
  },
  required: ["nodes", "edges", "overallSentiment", "summary"],
} as const;

/* ---------- 시스템 프롬프트 (안정 = 캐시 대상) ---------- */
const SYSTEM_PROMPT = `당신은 교육 데이터 분석가입니다. 학생들이 수업 전/후 교사의 질문에 자유롭게 작성한 응답을 읽고, 학습 온톨로지(지식 그래프)를 추출합니다.

규칙:
- 개념/키워드를 노드로 추출하고, 동의어·표기 변형은 하나의 노드로 정규화합니다(id는 대표 한글 키워드).
- 인사말·메타발화·무의미 토큰(예: "안녕", "안녕하세요", "감사합니다", "잘 모르겠어요", "없음", "ㅎㅎ")은 노드로 만들지 않습니다. 학습 내용·개념·감정에 관한 실질 토큰만 노드화합니다.
- type 'emotion' 은 **감정·정서 상태 그 자체를 나타내는 표현에만** 부여합니다(예: "재미있음", "어려움", "흥미로움", "지루함", "불안", "뿌듯함", "선생님에 대한 애정"처럼 느낌이 핵심인 것). 이때도 sentiment 를 함께 채웁니다.
- 학습 개념·기술·도구·활동·사람·사물(예: "코딩", "바이브코딩", "vibe", "함수", "수학")은 긍정적으로 언급됐더라도 **'emotion' 이 아니라 'concept' 또는 'keyword'** 입니다. 정서는 type 이 아니라 sentiment 로만 표현합니다. 헷갈리면 'emotion' 을 쓰지 마세요(과분류 금지).
- 개념 간 의미 관계가 드러나면 엣지로 만듭니다(단순 동시출현이 아닌, 응답이 시사하는 관계).
- 각 개념과 전체에 대한 학생들의 정서(느낌)를 sentiment 로 판정합니다.
- weight 는 1~10 정수로, 언급 빈도·강조 정도를 반영합니다.
- 노드 id 는 엣지의 source/target 과 정확히 일치해야 합니다.
- 각 노드의 sources 에는 그 개념을 실제로 언급한 학생ID(입력의 "학생:<id>")만 넣고, sourceCount 는 그 서로 다른 학생 수와 일치시킵니다. 학생ID를 알 수 없으면 sources 는 빈 배열, sourceCount 는 추정 응답 수.
- 각 엣지의 evidence 에는 그 관계를 뒷받침하는 근거를 응답에 기반해 한 문장으로 적고, sourceCount 는 그 관계가 드러난 서로 다른 학생 수입니다.
- 추측을 최소화하고 응답 텍스트의 근거에 충실하게, 한국어로 출력합니다.`;

type ResponseItem = { studentId?: string; text: string };

export const extractOntology = onCall(
  {
    secrets: [ANTHROPIC_API_KEY],
    timeoutSeconds: 540,
    memory: "512MiB",
  },
  async (req): Promise<Ontology> => {
    if (!req.auth) {
      throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
    }

    const { classId, question, phase, responses } = (req.data ?? {}) as {
      classId?: string;
      question?: string;
      phase?: "pre" | "post";
      responses?: ResponseItem[];
    };

    if (!classId || !Array.isArray(responses) || responses.length === 0) {
      throw new HttpsError(
        "invalid-argument",
        "classId 와 responses(배열)가 필요합니다."
      );
    }

    // 권한: 호출자가 해당 학급의 teacher 인지 확인
    const memberSnap = await getFirestore()
      .doc(`classes/${classId}/members/${req.auth.uid}`)
      .get();
    if (!memberSnap.exists || memberSnap.data()?.role !== "teacher") {
      throw new HttpsError(
        "permission-denied",
        "해당 학급의 교사만 분석을 실행할 수 있습니다."
      );
    }

    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY.value() });

    const responseBlock = responses
      .map(
        (r, i) =>
          `[응답 ${i + 1} | 학생:${r.studentId ?? `익명${i + 1}`}] ${r.text}`
      )
      .join("\n");
    const contextLine = question
      ? `질문(${phase ?? "?"}): ${question}\n\n`
      : "";

    try {
      const message = await client.messages.create({
        model: "claude-opus-4-7",
        max_tokens: 16000,
        thinking: { type: "adaptive" },
        // 안정적인 시스템 프롬프트는 프롬프트 캐싱 (반복 호출 비용 절감)
        system: [
          {
            type: "text",
            text: SYSTEM_PROMPT,
            cache_control: { type: "ephemeral" },
          },
        ],
        output_config: {
          format: {
            type: "json_schema",
            schema: ONTOLOGY_SCHEMA,
          },
          effort: "high",
        },
        messages: [
          {
            role: "user",
            content: `${contextLine}다음 학생 응답들에서 온톨로지를 추출하세요.\n\n${responseBlock}`,
          },
        ],
      });

      const jsonText = message.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");

      if (!jsonText.trim()) {
        throw new HttpsError(
          "internal",
          "모델이 빈 응답을 반환했습니다 (stop_reason: " +
            message.stop_reason +
            ")."
        );
      }
      return JSON.parse(jsonText) as Ontology;
    } catch (err) {
      if (err instanceof Anthropic.APIError) {
        throw new HttpsError(
          "internal",
          `Claude API 오류 (${err.status}): ${err.message}`
        );
      }
      throw err;
    }
  }
);

/* ===================================================================== *
 *  라벨 정규화 (동의어·표기변형 통합) — 입력은 라벨 목록만 → 매우 저렴
 *  상위 머지(차시/프로젝트/학급)에서 파편화된 노드를 합치는 데 사용
 * ===================================================================== */
export interface LabelClusters {
  clusters: {
    canonicalId: string;
    canonicalLabel: string;
    members: string[]; // 입력 id 목록 (각 입력 id는 정확히 한 클러스터에)
  }[];
}

const CLUSTER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    clusters: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          canonicalId: {
            type: "string",
            description: "대표 id (멤버 중 가장 일반적인 한글 표현)",
          },
          canonicalLabel: { type: "string", description: "표시용 대표 라벨" },
          members: {
            type: "array",
            items: { type: "string" },
            description: "이 클러스터에 속하는 입력 id 목록",
          },
        },
        required: ["canonicalId", "canonicalLabel", "members"],
      },
    },
  },
  required: ["clusters"],
} as const;

const CLUSTER_SYSTEM = `당신은 지식 그래프 노드 라벨 정리 도구입니다. 입력으로 (id, label) 목록을 받습니다.
동의어·표기 변형·언어 차이(예: "vibe"/"바이브", "coding"/"코딩"/"바이브코딩")·명백히 동일한 개념을 하나의 클러스터로 묶습니다.
규칙:
- 모든 입력 id 는 정확히 하나의 클러스터 members 에 포함되어야 합니다(누락·중복 금지).
- 합칠 근거가 약하면 단독 클러스터로 둡니다(과병합 금지).
- canonicalId/canonicalLabel 은 한국어 대표 표현으로 정합니다.
- 의미가 다른 개념을 억지로 합치지 않습니다.`;

export const normalizeLabels = onCall(
  {
    secrets: [ANTHROPIC_API_KEY],
    timeoutSeconds: 120,
    memory: "512MiB",
  },
  async (req): Promise<LabelClusters> => {
    if (!req.auth) {
      throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
    }
    const { classId, labels } = (req.data ?? {}) as {
      classId?: string;
      labels?: { id: string; label: string }[];
    };
    if (!classId || !Array.isArray(labels) || labels.length === 0) {
      throw new HttpsError(
        "invalid-argument",
        "classId 와 labels(배열)가 필요합니다."
      );
    }
    const memberSnap = await getFirestore()
      .doc(`classes/${classId}/members/${req.auth.uid}`)
      .get();
    if (!memberSnap.exists || memberSnap.data()?.role !== "teacher") {
      throw new HttpsError(
        "permission-denied",
        "해당 학급의 교사만 실행할 수 있습니다."
      );
    }

    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY.value() });
    const list = labels
      .map((l) => `- id=${l.id} | label=${l.label}`)
      .join("\n");

    try {
      const message = await client.messages.create({
        model: "claude-opus-4-7",
        max_tokens: 8000,
        system: [
          {
            type: "text",
            text: CLUSTER_SYSTEM,
            cache_control: { type: "ephemeral" },
          },
        ],
        output_config: {
          format: { type: "json_schema", schema: CLUSTER_SCHEMA },
          effort: "low",
        },
        messages: [
          {
            role: "user",
            content: `다음 노드들을 동의어/동일개념끼리 클러스터링하세요.\n\n${list}`,
          },
        ],
      });
      const jsonText = message.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");
      if (!jsonText.trim()) {
        throw new HttpsError(
          "internal",
          "모델이 빈 응답을 반환했습니다 (stop_reason: " +
            message.stop_reason +
            ")."
        );
      }
      return JSON.parse(jsonText) as LabelClusters;
    } catch (err) {
      if (err instanceof Anthropic.APIError) {
        throw new HttpsError(
          "internal",
          `Claude API 오류 (${err.status}): ${err.message}`
        );
      }
      throw err;
    }
  }
);

/* ===================================================================== *
 *  산출물 댓글 생성 → 인앱 알림 (Admin 권한으로 users/{uid}/notifications)
 * ===================================================================== */
export const onSubmissionComment = onDocumentCreated(
  "classes/{cid}/lessons/{lid}/questions/{qid}/submissions/{sid}/comments/{cmtId}",
  async (event) => {
    const data = event.data?.data();
    if (!data) return;
    const { cid, lid, sid } = event.params as {
      cid: string;
      lid: string;
      qid: string;
      sid: string;
      cmtId: string;
    };
    const authorUid = (data.authorUid as string) ?? "";
    const authorName = (data.authorName as string) ?? "";
    const db = getFirestore();
    const link = `/lesson?class=${cid}&id=${lid}`;

    const notify = (targetUid: string, text: string) =>
      db.collection(`users/${targetUid}/notifications`).add({
        type: "comment",
        classId: cid,
        lessonId: lid,
        text,
        link,
        readAt: null,
        createdAt: FieldValue.serverTimestamp(),
      });

    if (authorUid !== sid) {
      // 교사(또는 타인)가 학생 산출물에 피드백 → 해당 학생에게 알림
      await notify(sid, `${authorName} 선생님이 피드백을 남겼어요`);
    } else {
      // 학생이 회신 → 해당 학급 교사들에게 알림
      const teachers = await db
        .collection(`classes/${cid}/members`)
        .where("role", "==", "teacher")
        .get();
      await Promise.all(
        teachers.docs
          .filter((d) => d.id !== authorUid)
          .map((d) =>
            notify(d.id, `${authorName} 학생이 피드백에 회신했어요`)
          )
      );
    }
  }
);

/* ===================================================================== *
 *  위키 인사이트 — 머지된 온톨로지(JSON·라벨만) → 종합 서사 + 형성평가 lint
 *  입력이 작아 저비용. 원문 미전송. 교사 전용.
 * ===================================================================== */
export interface WikiInsights {
  narrative: string;
  concepts: { id: string; insight: string }[];
  followUps: string[];
  misconceptions: string[];
  gaps: string[];
}

const WIKI_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    narrative: {
      type: "string",
      description: "학습 상태 종합 서사 4~6문장(한국어)",
    },
    concepts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          insight: { type: "string", description: "그 개념 한두 줄 해설" },
        },
        required: ["id", "insight"],
      },
    },
    followUps: {
      type: "array",
      items: { type: "string" },
      description: "다음 수업에서 물어볼 후속 질문 제안",
    },
    misconceptions: {
      type: "array",
      items: { type: "string" },
      description: "관찰되는 오개념·약점",
    },
    gaps: {
      type: "array",
      items: { type: "string" },
      description: "다뤄지지 않았거나 빈약한 핵심 개념",
    },
  },
  required: ["narrative", "concepts", "followUps", "misconceptions", "gaps"],
} as const;

const WIKI_SYSTEM = `당신은 교사를 돕는 학습 분석가입니다. 학생 응답에서 추출된 지식 그래프(개념·관계·감정·언급 학생 수)와 전/후 변화 요약을 받습니다. 원문은 없습니다.
규칙:
- narrative: 학급의 현재 이해 상태를 근거에 기반해 한국어로 종합합니다(과장 금지).
- concepts: 비중 큰 개념 위주로 id와 함께 짧은 해설.
- followUps: 이해를 심화/점검할 다음 질문을 구체적으로 제안.
- misconceptions: 부정 정서가 지속되거나 잘못 연결된 개념 등 약점.
- gaps: 핵심인데 약하게만 다뤄진 개념.
- 입력 데이터에 없는 사실을 지어내지 않습니다.`;

export const wikiInsights = onCall(
  {
    secrets: [ANTHROPIC_API_KEY],
    timeoutSeconds: 300,
    memory: "512MiB",
  },
  async (req): Promise<WikiInsights> => {
    if (!req.auth) {
      throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
    }
    const { classId, payload } = (req.data ?? {}) as {
      classId?: string;
      payload?: unknown;
    };
    if (!classId || !payload) {
      throw new HttpsError(
        "invalid-argument",
        "classId 와 payload 가 필요합니다."
      );
    }
    const memberSnap = await getFirestore()
      .doc(`classes/${classId}/members/${req.auth.uid}`)
      .get();
    if (!memberSnap.exists || memberSnap.data()?.role !== "teacher") {
      throw new HttpsError(
        "permission-denied",
        "해당 학급의 교사만 실행할 수 있습니다."
      );
    }

    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY.value() });
    try {
      const message = await client.messages.create({
        model: "claude-opus-4-7",
        max_tokens: 8000,
        system: [
          {
            type: "text",
            text: WIKI_SYSTEM,
            cache_control: { type: "ephemeral" },
          },
        ],
        output_config: {
          format: { type: "json_schema", schema: WIKI_SCHEMA },
          effort: "medium",
        },
        messages: [
          {
            role: "user",
            content:
              "다음 지식 그래프 데이터로 인사이트를 작성하세요.\n\n" +
              JSON.stringify(payload),
          },
        ],
      });
      const jsonText = message.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");
      if (!jsonText.trim()) {
        throw new HttpsError(
          "internal",
          "모델이 빈 응답을 반환했습니다 (stop_reason: " +
            message.stop_reason +
            ")."
        );
      }
      return JSON.parse(jsonText) as WikiInsights;
    } catch (err) {
      if (err instanceof Anthropic.APIError) {
        throw new HttpsError(
          "internal",
          `Claude API 오류 (${err.status}): ${err.message}`
        );
      }
      throw err;
    }
  }
);

/* ===================================================================== *
 *  임베딩 기반 개념 정준화 (OpenAI text-embedding-3-small)
 *  라벨 임베딩 → 코사인 kNN 연결요소 → 동의어/동일개념 클러스터
 *  LLM 추론 호출 없음(임베딩 1회). 누적될수록 결정적·저비용.
 * ===================================================================== */
type CanonNode = { id: string; label: string; sourceCount?: number };

async function embedAll(
  apiKey: string,
  inputs: string[]
): Promise<number[][]> {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: inputs,
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new HttpsError(
      "internal",
      `OpenAI 임베딩 오류 (${res.status}): ${t.slice(0, 300)}`
    );
  }
  const j = (await res.json()) as {
    data: { index: number; embedding: number[] }[];
  };
  const out: number[][] = new Array(inputs.length);
  for (const d of j.data) out[d.index] = d.embedding;
  return out;
}

function norm(v: number[]): number[] {
  let s = 0;
  for (const x of v) s += x * x;
  s = Math.sqrt(s) || 1;
  return v.map((x) => x / s);
}
function dot(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

export const canonicalizeOntology = onCall(
  {
    secrets: [OPENAI_API_KEY],
    timeoutSeconds: 120,
    memory: "512MiB",
  },
  async (
    req
  ): Promise<{
    clusters: {
      canonicalId: string;
      canonicalLabel: string;
      members: string[];
    }[];
  }> => {
    if (!req.auth) {
      throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
    }
    const { classId, nodes, threshold } = (req.data ?? {}) as {
      classId?: string;
      nodes?: CanonNode[];
      threshold?: number;
    };
    if (!classId || !Array.isArray(nodes) || nodes.length === 0) {
      throw new HttpsError(
        "invalid-argument",
        "classId 와 nodes 가 필요합니다."
      );
    }
    const memberSnap = await getFirestore()
      .doc(`classes/${classId}/members/${req.auth.uid}`)
      .get();
    if (!memberSnap.exists || memberSnap.data()?.role !== "teacher") {
      throw new HttpsError(
        "permission-denied",
        "해당 학급의 교사만 실행할 수 있습니다."
      );
    }

    const tau =
      typeof threshold === "number" && threshold > 0 && threshold < 1
        ? threshold
        : 0.72;

    const vecs = (
      await embedAll(
        OPENAI_API_KEY.value(),
        nodes.map((n) => n.label || n.id)
      )
    ).map(norm);

    // DSU: cosine >= tau 인 쌍을 union
    const n = nodes.length;
    const parent = Array.from({ length: n }, (_, i) => i);
    const find = (x: number): number =>
      parent[x] === x ? x : (parent[x] = find(parent[x]));
    const union = (a: number, b: number) => {
      const ra = find(a);
      const rb = find(b);
      if (ra !== rb) parent[ra] = rb;
    };
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (dot(vecs[i], vecs[j]) >= tau) union(i, j);
      }
    }

    const comp = new Map<number, number[]>();
    for (let i = 0; i < n; i++) {
      const r = find(i);
      comp.set(r, [...(comp.get(r) ?? []), i]);
    }

    const clusters = [...comp.values()].map((idxs) => {
      // 대표: sourceCount 최대 → 라벨 짧은 순
      const rep = idxs
        .slice()
        .sort(
          (a, b) =>
            (nodes[b].sourceCount ?? 0) - (nodes[a].sourceCount ?? 0) ||
            (nodes[a].label || nodes[a].id).length -
              (nodes[b].label || nodes[b].id).length
        )[0];
      return {
        canonicalId: nodes[rep].id,
        canonicalLabel: nodes[rep].label || nodes[rep].id,
        members: idxs.map((k) => nodes[k].id),
      };
    });

    return { clusters };
  }
);

/* ===================================================================== *
 *  1:1 메시지 생성 → 인앱 알림 (클래스/차시 양쪽)
 * ===================================================================== */
async function notifyMessage(args: {
  cid: string;
  lid?: string;
  studentUid: string;
  authorUid: string;
  authorName: string;
  text: string;
}) {
  const { cid, lid, studentUid, authorUid, authorName, text } = args;
  const db = getFirestore();
  const link = lid ? `/lesson?class=${cid}&id=${lid}` : `/class?id=${cid}`;
  const preview =
    text.length > 30 ? text.slice(0, 30) + "…" : text || "(메시지)";

  const make = (targetUid: string, body: string) =>
    db.collection(`users/${targetUid}/notifications`).add({
      type: "message",
      classId: cid,
      lessonId: lid ?? "",
      text: body,
      link,
      readAt: null,
      createdAt: FieldValue.serverTimestamp(),
    });

  if (authorUid !== studentUid) {
    // 교사 → 학생
    await make(studentUid, `${authorName} 선생님: ${preview}`);
  } else {
    // 학생 → 교사들
    const teachers = await db
      .collection(`classes/${cid}/members`)
      .where("role", "==", "teacher")
      .get();
    await Promise.all(
      teachers.docs
        .filter((d) => d.id !== authorUid)
        .map((d) => make(d.id, `${authorName} 학생: ${preview}`))
    );
  }
}

export const onClassMessage = onDocumentCreated(
  "classes/{cid}/threads/{studentUid}/messages/{mid}",
  async (event) => {
    const data = event.data?.data();
    if (!data) return;
    const { cid, studentUid } = event.params as {
      cid: string;
      studentUid: string;
      mid: string;
    };
    await notifyMessage({
      cid,
      studentUid,
      authorUid: (data.authorUid as string) ?? "",
      authorName: (data.authorName as string) ?? "",
      text: (data.text as string) ?? "",
    });
  }
);

export const onLessonMessage = onDocumentCreated(
  "classes/{cid}/lessons/{lid}/threads/{studentUid}/messages/{mid}",
  async (event) => {
    const data = event.data?.data();
    if (!data) return;
    const { cid, lid, studentUid } = event.params as {
      cid: string;
      lid: string;
      studentUid: string;
      mid: string;
    };
    await notifyMessage({
      cid,
      lid,
      studentUid,
      authorUid: (data.authorUid as string) ?? "",
      authorName: (data.authorName as string) ?? "",
      text: (data.text as string) ?? "",
    });
  }
);

// 교사 권한 부여 — 코드 검증 후 users/{uid}.role='teacher' 설정(서버 전용).
// 클라이언트가 role 을 직접 'teacher' 로 쓰지 못하도록 규칙으로 잠그고
// 이 함수만 admin 권한으로 role 을 부여한다.
export const claimTeacherRole = onCall(
  { secrets: [TEACHER_CODE] },
  async (req): Promise<{ ok: true }> => {
    if (!req.auth) {
      throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
    }
    const { code, name } = (req.data ?? {}) as { code?: string; name?: string };
    let expected = TEACHER_CODE_FALLBACK;
    try {
      const v = TEACHER_CODE.value();
      if (v) expected = v;
    } catch {
      // Secret 미설정 → fallback
    }
    if (!code || code.trim() !== expected) {
      throw new HttpsError("permission-denied", "시스템 코드가 올바르지 않습니다.");
    }
    if (!name || !name.trim()) {
      throw new HttpsError("invalid-argument", "이름을 입력해 주세요.");
    }
    const auth = req.auth;
    await getFirestore()
      .doc(`users/${auth.uid}`)
      .set(
        {
          role: "teacher",
          name: name.trim(),
          email: auth.token.email ?? "",
          photoURL: auth.token.picture ?? "",
          createdAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    return { ok: true };
  }
);
