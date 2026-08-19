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
import { onSchedule } from "firebase-functions/v2/scheduler";
import { defineSecret } from "firebase-functions/params";
import { setGlobalOptions } from "firebase-functions/v2";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import {
  FieldValue,
  getFirestore,
  type DocumentReference,
} from "firebase-admin/firestore";
import Anthropic from "@anthropic-ai/sdk";

initializeApp();
setGlobalOptions({ region: "asia-northeast3" }); // 서울 리전

const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");
const OPENAI_API_KEY = defineSecret("OPENAI_API_KEY");
// 교사 가입 코드(서버 비밀, Secret Manager). 미설정 시 교사 승격을 거부한다.
// (하드코딩 폴백 제거 — 깃에 박힌 코드/공유 코드로 인한 권한 상승을 차단)
const TEACHER_CODE = defineSecret("TEACHER_CODE");
// 만보 트레이딩 — 토스증권 Open API 자격증명(시세 조회 전용). Secret Manager.
const TOSS_CLIENT_ID = defineSecret("TOSS_CLIENT_ID");
const TOSS_CLIENT_SECRET = defineSecret("TOSS_CLIENT_SECRET");

/* ---------- 무차별 대입 방어: 실패 횟수 기반 레이트리밋 ---------- *
 * rateLimits/{key} 에 { fails, windowStart } 를 admin 권한으로 기록한다.
 * (rules 에 매칭 규칙이 없어 클라이언트는 읽기/쓰기 모두 기본 거부)
 * 호출 시작 시 차단 여부를 확인하고, 실패(코드 불일치/미존재) 시 bumpFail,
 * 성공 시 reset 한다. uid·IP 두 축으로 적용해 단일계정/다계정 공격 모두 견딘다. */
type RateLimiter = {
  blocked: boolean;
  bumpFail: () => Promise<void>;
  reset: () => Promise<void>;
};

async function makeRateLimiter(
  key: string,
  windowMs: number,
  maxFails: number
): Promise<RateLimiter> {
  const ref = getFirestore().doc(`rateLimits/${key}`);
  const snap = await ref.get();
  const now = Date.now();
  let fails = 0;
  let windowStart = now;
  if (snap.exists) {
    const d = snap.data() as { fails?: number; windowStart?: number };
    windowStart = d.windowStart ?? now;
    fails = d.fails ?? 0;
    if (now - windowStart > windowMs) {
      windowStart = now;
      fails = 0;
    }
  }
  return {
    blocked: fails >= maxFails,
    async bumpFail() {
      await ref.set(
        { fails: fails + 1, windowStart, updatedAt: FieldValue.serverTimestamp() },
        { merge: true }
      );
    },
    async reset() {
      if (snap.exists && fails > 0) {
        await ref.set(
          { fails: 0, windowStart: now, updatedAt: FieldValue.serverTimestamp() },
          { merge: true }
        );
      }
    },
  };
}

// onCall 요청의 클라이언트 IP 추정 → 문서 id 로 안전하게 정규화.
// 주의: X-Forwarded-For 의 '첫' 항목은 클라이언트가 위조할 수 있다(스푸핑으로
// IP 레이트리밋 우회). 런타임이 채우는 실제 소스 IP(rawRequest.ip)를 우선 사용하고,
// 없을 때만 XFF 의 '마지막'(플랫폼이 덧붙인) 항목을 쓴다.
function clientIpKey(req: {
  rawRequest?: { headers?: Record<string, unknown>; ip?: string };
}): string {
  const r = req.rawRequest;
  let ip = "";
  if (r?.ip) {
    ip = String(r.ip);
  } else {
    const xff = r?.headers?.["x-forwarded-for"];
    const s = Array.isArray(xff)
      ? xff.join(",")
      : typeof xff === "string"
      ? xff
      : "";
    const parts = s
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
    ip = parts.length ? parts[parts.length - 1] : "";
  }
  return ip.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 60) || "unknown";
}

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
- 입력의 "질문" 텍스트는 학생 응답을 해석하기 위한 배경 맥락일 뿐이며, 질문 자체에 등장하는 단어·개념은 노드로 만들지 않습니다. 모든 노드는 반드시 실제 학생 응답에 근거해야 하고, 각 노드의 sources 에는 입력에 등장한 실제 학생ID(입력의 "학생:<id>")가 최소 1개 이상 포함되어야 합니다. 어떤 학생도 실제로 작성하지 않은 개념은 절대 만들어내지 않습니다.
- 각 노드의 sources 에는 그 개념을 실제로 언급한 학생ID(입력의 "학생:<id>")만 넣고, sourceCount 는 그 서로 다른 학생 수와 일치시킵니다. sources 가 비어 있거나 입력에 없는 학생ID만 들어 있는 노드는 만들지 마세요.
- 각 엣지의 evidence 에는 그 관계를 뒷받침하는 근거를 응답에 기반해 한 문장으로 적고, sourceCount 는 그 관계가 드러난 서로 다른 학생 수입니다.
- 추측을 최소화하고 응답 텍스트의 근거에 충실하게, 한국어로 출력합니다.`;

/* ---------- 공개 회원 수 (로그인 화면 표시용) ---------- *
 * 비로그인 포함 누구나 호출(onCall, 인증 불요). admin 으로 users 수를 집계해
 * meta/publicStats 에 캐시하고 반환한다. 60초 캐시로 반복 호출 비용을 줄인다.
 * 클라이언트 규칙(컬렉션 집계 권한)에 의존하지 않아 콜드 스타트에도 안정적.   */
export const publicMemberCount = onCall(
  async (): Promise<{ count: number }> => {
    const fdb = getFirestore();
    const metaRef = fdb.doc("meta/publicStats");
    const snap = await metaRef.get();
    const data = snap.data();
    const cached = typeof data?.users === "number" ? data.users : null;
    const syncedAt = data?.syncedAt as
      | { toMillis?: () => number }
      | undefined;
    if (
      cached != null &&
      syncedAt?.toMillis &&
      Date.now() - syncedAt.toMillis() < 60_000
    ) {
      return { count: cached };
    }
    const agg = await fdb.collection("users").count().get();
    const n = agg.data().count;
    await metaRef.set(
      { users: n, syncedAt: FieldValue.serverTimestamp() },
      { merge: true }
    );
    return { count: n };
  }
);

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

    // 후처리 필터용: 입력에 실재하는 학생ID 집합 (responseBlock 의 "학생:<id>" 와 동일 규칙)
    const validStudentIds = new Set(
      responses.map((r, i) => r.studentId ?? `익명${i + 1}`)
    );

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
      const parsed = JSON.parse(jsonText) as Ontology;

      // ── 하드 후처리 필터 ──────────────────────────────────────────────
      // 교사가 작성한 질문/활동 텍스트가 온톨로지 노드로 새어 들어가지 못하게
      // 강제한다. 입력 responses 에 실재하는 학생ID 를 sources 에 최소 1개
      // 이상 가진 노드만 남기고, 나머지는 모두 제거한다. 제거된 노드를
      // 참조하는 엣지도 함께 제거한다.
      const rawNodes = Array.isArray(parsed.nodes) ? parsed.nodes : [];
      const keptNodes = rawNodes.flatMap((n) => {
        const validSources = Array.isArray(n.sources)
          ? n.sources.filter((s) => validStudentIds.has(s))
          : [];
        if (validSources.length === 0) return [];
        return [{ ...n, sources: validSources, sourceCount: validSources.length }];
      });
      const keptIds = new Set(keptNodes.map((n) => n.id));
      const rawEdges = Array.isArray(parsed.edges) ? parsed.edges : [];
      const keptEdges = rawEdges.filter(
        (e) => keptIds.has(e.source) && keptIds.has(e.target)
      );

      return {
        ...parsed,
        nodes: keptNodes,
        edges: keptEdges,
      };
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
 *  문서(PDF·이미지) → 지식맵 온톨로지
 *  교사가 패들렛 등 외부 에듀테크의 학생 응답 모음을 PDF/사진으로 올리면
 *  Claude 가 문서를 읽어 개념·관계·감정을 추출한다(extractOntology 와 동일 스키마).
 * ===================================================================== */
export const extractOntologyFromDoc = onCall(
  {
    secrets: [ANTHROPIC_API_KEY],
    timeoutSeconds: 540,
    memory: "512MiB",
  },
  async (req): Promise<Ontology> => {
    if (!req.auth) {
      throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
    }
    const { classId, files } = (req.data ?? {}) as {
      classId?: string;
      files?: SurveyFile[];
    };
    if (!classId || !Array.isArray(files) || files.length === 0) {
      throw new HttpsError(
        "invalid-argument",
        "classId 와 files(배열)가 필요합니다."
      );
    }
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
    const content: Anthropic.ContentBlockParam[] = files.map((f) =>
      f.mediaType === "application/pdf"
        ? {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: f.data,
            },
          }
        : {
            type: "image",
            source: {
              type: "base64",
              media_type: f.mediaType as
                | "image/png"
                | "image/jpeg"
                | "image/webp"
                | "image/gif",
              data: f.data,
            },
          }
    );
    content.push({
      type: "text",
      text:
        "위 자료는 학생들의 응답 모음입니다(예: 패들렛 내보내기, 포스트잇·카드, 표 형태의 학생 답변). " +
        "각 카드/항목/행을 학생 1명의 개별 응답으로 보고, 그 응답들에서 온톨로지(개념 노드·관계 엣지·감정)를 추출하세요. " +
        "각 노드의 sources 에는 그 개념을 언급한 응답 식별용 짧은 id(r1, r2, …)를 넣고, sourceCount 는 언급한 서로 다른 응답 수로 하세요. " +
        "제목·머리말·교사 안내문 등 학생 응답이 아닌 텍스트는 제외하세요.",
    });

    try {
      const message = await client.messages.create({
        model: "claude-opus-4-7",
        max_tokens: 16000,
        thinking: { type: "adaptive" },
        system: [
          {
            type: "text",
            text: SYSTEM_PROMPT,
            cache_control: { type: "ephemeral" },
          },
        ],
        output_config: {
          format: { type: "json_schema", schema: ONTOLOGY_SCHEMA },
          effort: "high",
        },
        messages: [{ role: "user", content }],
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
      const parsed = JSON.parse(jsonText) as Ontology;
      // 학생 응답에서 나온 노드만 유지(sources/sourceCount >= 1). 엣지는 살아남은 노드 사이만.
      const rawNodes = Array.isArray(parsed.nodes) ? parsed.nodes : [];
      const keptNodes = rawNodes.flatMap((n) => {
        const srcs = Array.isArray(n.sources) ? n.sources : [];
        const count =
          srcs.length || (typeof n.sourceCount === "number" ? n.sourceCount : 0);
        if (count < 1) return [];
        return [{ ...n, sources: srcs, sourceCount: count }];
      });
      const keptIds = new Set(keptNodes.map((n) => n.id));
      const rawEdges = Array.isArray(parsed.edges) ? parsed.edges : [];
      const keptEdges = rawEdges.filter(
        (e) => keptIds.has(e.source) && keptIds.has(e.target)
      );
      return { ...parsed, nodes: keptNodes, edges: keptEdges };
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

// 알림 본문에 넣을 작성자 표시 이름을 멤버 문서에서 직접 해석한다.
// 클라이언트가 보낸 authorName 은 신뢰하지 않는다(임의 문자열/'관리자' 사칭 주입 차단).
async function resolveMemberName(cid: string, uid: string): Promise<string> {
  if (!uid) return "";
  try {
    const m = await getFirestore().doc(`classes/${cid}/members/${uid}`).get();
    const n = (m.data()?.displayName as string) ?? "";
    return n.replace(/[\u0000-\u001F]/g, "").slice(0, 40);
  } catch {
    return "";
  }
}

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
    // 클라이언트가 보낸 authorName 대신 멤버 문서의 실제 표시 이름을 사용(사칭 차단).
    const authorName = await resolveMemberName(cid, authorUid);
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
  highlights: string[]; // 개별 응답에서 주목할 관찰(샘플이 있을 때)
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
    highlights: {
      type: "array",
      items: { type: "string" },
      description:
        "입력에 대표 응답 샘플(sampleResponses)이 있을 때, 개별 응답에서 주목할 관찰(특이한 통찰·오개념·유난히 풍부한 답변)을 학생 맥락과 함께. 샘플이 없으면 빈 배열.",
    },
  },
  required: [
    "narrative",
    "concepts",
    "followUps",
    "misconceptions",
    "gaps",
    "highlights",
  ],
} as const;

const WIKI_SYSTEM = `당신은 교사를 돕는 학습 분석가입니다. 학생 응답에서 추출된 지식 그래프(개념·관계·감정·언급 학생 수=sourceCount)와 전/후 변화 요약, 그리고 일부 대표 응답 샘플(sampleResponses, 있을 수도 없을 수도)을 받습니다.
규칙:
- narrative: 학급의 현재 이해 상태를 **스토리텔링형**으로 종합합니다(한국어, 과장 금지). 특히 **중첩도(언급 학생 수)** 를 해석에 녹입니다 — 많은 학생이 공유한 '핵심 공통 개념'과 소수만 언급한 '주변·개별 개념'을 구분해 서술하고, 허브(연결이 많은) 개념을 짚습니다. studentCount 가 있으면 'N명 중 M명' 식으로 표현합니다.
- concepts: 비중 큰(언급수 높은) 개념 위주로 id와 함께 짧은 해설.
- followUps: 이해를 심화/점검할 다음 질문을 구체적으로 제안.
- misconceptions: 부정 정서가 지속되거나 잘못 연결된 개념 등 약점.
- gaps: 핵심인데 약하게만 다뤄진 개념.
- highlights: sampleResponses 가 있으면 개별 응답에서 주목할 관찰(특이한 통찰·오개념·유난히 풍부하거나 빈약한 답변)을 학생 맥락과 함께 2~5개. 샘플이 없으면 빈 배열.
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
  for (const d of j.data) {
    if (
      typeof d.index === "number" &&
      d.index >= 0 &&
      d.index < inputs.length &&
      Array.isArray(d.embedding)
    ) {
      out[d.index] = d.embedding;
    }
  }
  // 부분 실패(일부 임베딩 누락) 시 이후 norm()에서 크래시하지 않도록 검증
  for (let i = 0; i < out.length; i++) {
    if (!out[i]) {
      throw new HttpsError(
        "internal",
        "임베딩 결과가 일부 누락되었습니다. 잠시 후 다시 시도해 주세요."
      );
    }
  }
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
 *  게임 개념 지식맵 (임베딩 유사도) — 제출된 전체 개념어를 임베딩 → top-K 코사인 연결.
 *  LLM 추론 없음(임베딩 1회). 클라이언트는 결과 Ontology 를 GraphView 로 렌더.
 * ===================================================================== */
export const gameConceptGraph = onCall(
  {
    region: "asia-northeast3",
    secrets: [OPENAI_API_KEY],
    timeoutSeconds: 120,
    memory: "512MiB",
  },
  async (req): Promise<Ontology> => {
    if (!req.auth) {
      throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
    }
    const { classId, concepts } = (req.data ?? {}) as {
      classId?: string;
      concepts?: { word: string; count: number }[];
    };
    if (!classId || !Array.isArray(concepts) || concepts.length === 0) {
      throw new HttpsError(
        "invalid-argument",
        "classId 와 concepts 가 필요합니다."
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

    // 단어 정규화 + 빈도 합산(공백 trim), 상위 120개로 제한
    const freq = new Map<string, number>();
    for (const c of concepts) {
      const w = (c?.word ?? "").trim();
      if (!w) continue;
      freq.set(w, (freq.get(w) ?? 0) + (Number(c?.count) || 1));
    }
    const items = [...freq.entries()]
      .map(([word, count]) => ({ word, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 120);
    if (items.length === 0) {
      throw new HttpsError("invalid-argument", "유효한 개념어가 없습니다.");
    }

    const vecs = (
      await embedAll(
        OPENAI_API_KEY.value(),
        items.map((i) => i.word)
      )
    ).map(norm);

    // 노드당 최근접 이웃 top-K 를 무방향 엣지로 (하한 FLOOR) — 헤어볼 방지
    const n = items.length;
    const K = 3;
    const FLOOR = 0.3;
    const edgeMap = new Map<string, { a: number; b: number; sim: number }>();
    for (let i = 0; i < n; i++) {
      const sims: { j: number; s: number }[] = [];
      for (let j = 0; j < n; j++) {
        if (j === i) continue;
        sims.push({ j, s: dot(vecs[i], vecs[j]) });
      }
      sims.sort((x, y) => y.s - x.s);
      for (const { j, s } of sims.slice(0, K)) {
        if (s < FLOOR) break;
        const a = Math.min(i, j);
        const b = Math.max(i, j);
        const key = `${a}-${b}`;
        const prev = edgeMap.get(key);
        if (!prev || s > prev.sim) edgeMap.set(key, { a, b, sim: s });
      }
    }

    const maxCount = Math.max(...items.map((i) => i.count));
    const nodes: Ontology["nodes"] = items.map((it, i) => ({
      id: `gc-${i}`,
      label: it.word,
      type: "concept",
      weight: Math.max(1, Math.round((it.count / maxCount) * 18)),
      sentiment: "neutral",
      sourceCount: it.count,
      sources: [],
    }));
    const edges: Ontology["edges"] = [...edgeMap.values()].map((e) => ({
      source: `gc-${e.a}`,
      target: `gc-${e.b}`,
      relation: "비슷한 개념",
      weight: Math.max(1, Math.round(e.sim * 5)),
      evidence: "",
      sourceCount: 1,
    }));

    return {
      nodes,
      edges,
      overallSentiment: { positive: 0, neutral: nodes.length, negative: 0 },
      summary: "",
    };
  }
);

/* ===================================================================== *
 *  게임 결과 학습 피드백 코멘트 (Claude) — 순위/개념어 요약 → 한 단락
 * ===================================================================== */
export const gameFeedbackComment = onCall(
  {
    region: "asia-northeast3",
    secrets: [ANTHROPIC_API_KEY],
    timeoutSeconds: 120,
    memory: "512MiB",
  },
  async (req): Promise<{ comment: string }> => {
    if (!req.auth) {
      throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
    }
    const { classId, gameName, concepts, ranks } = (req.data ?? {}) as {
      classId?: string;
      gameName?: string;
      concepts?: { word: string; count: number }[];
      ranks?: { name: string; rank: number }[];
    };
    if (!classId || !Array.isArray(concepts)) {
      throw new HttpsError(
        "invalid-argument",
        "classId 와 concepts 가 필요합니다."
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

    const topConcepts = [...concepts]
      .sort((a, b) => (b.count || 0) - (a.count || 0))
      .slice(0, 40)
      .map((c) => `${c.word}(${c.count})`)
      .join(", ");
    const winners = (ranks ?? [])
      .slice()
      .sort((a, b) => a.rank - b.rank)
      .slice(0, 3)
      .map((r) => `${r.rank}등 ${r.name}`)
      .join(", ");

    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY.value() });
    try {
      const message = await client.messages.create({
        model: "claude-opus-4-7",
        max_tokens: 700,
        system:
          "당신은 초등 교사를 돕는 학습 분석 도우미입니다. 개념 빙고 게임에서 학생들이 제출/호출한 개념어와 결과를 보고, " +
          "교사와 학생이 함께 읽을 따뜻하고 구체적인 '수업 후 피드백'을 한국어로 작성하세요. " +
          "2~4문장, 존댓말, 이모지·머리말 없이 평문으로. 어떤 개념이 활발했는지, 함께 떠올린 개념들의 연결(주제망)을 짚고, " +
          "다음 학습으로의 제안을 한 문장 더하세요. 특정 학생 서열 강조는 피하고 학급 전체의 학습에 초점을 두세요.",
        messages: [
          {
            role: "user",
            content:
              `게임: ${gameName || "개념 빙고"}\n` +
              `제출/호출 개념어(빈도): ${topConcepts || "(없음)"}\n` +
              (winners ? `완성 순위: ${winners}\n` : "") +
              "위 내용을 바탕으로 수업 후 피드백 단락을 작성해줘.",
          },
        ],
      });
      const comment = message.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      return { comment };
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
 *  1:1 메시지 생성 → 인앱 알림 (클래스/차시 양쪽)
 * ===================================================================== */
async function notifyMessage(args: {
  cid: string;
  lid?: string;
  studentUid: string;
  authorUid: string;
  text: string;
}) {
  const { cid, lid, studentUid, authorUid, text } = args;
  // 클라이언트가 보낸 authorName 대신 멤버 문서의 실제 표시 이름을 사용(사칭 차단).
  const authorName = await resolveMemberName(cid, authorUid);
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
      text: (data.text as string) ?? "",
    });
  }
);

/* ===================================================================== *
 *  문서/이미지 → 설문 문항 파싱 (Claude 비전/PDF)
 *  교사가 PDF·이미지·문서를 업로드하면 척도/객관식/주관식 문항을 추출.
 *  반환 항목엔 id 없음 — 클라이언트가 변수키를 부여(전/후 페어링 기준).
 * ===================================================================== */
export interface ParsedSurvey {
  items: {
    type: "scale" | "choice" | "open";
    prompt: string;
    options: string[]; // choice 선택지 (그 외엔 빈 배열)
    scaleMax: number; // scale 최대값(예: 5). 그 외엔 0
    scaleLow: string; // scale 낮음 라벨 (없으면 "")
    scaleHigh: string; // scale 높음 라벨 (없으면 "")
  }[];
}

const PARSE_SURVEY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          type: {
            type: "string",
            enum: ["scale", "choice", "open"],
            description:
              "리커트/점수 척도면 scale, 보기에서 고르면 choice, 자유 서술이면 open",
          },
          prompt: { type: "string", description: "문항 내용(한국어, 원문 유지)" },
          options: {
            type: "array",
            items: { type: "string" },
            description: "choice 의 선택지. scale/open 이면 빈 배열",
          },
          scaleMax: {
            type: "number",
            description: "scale 의 최대 점수(예: 5점 척도면 5). scale 이 아니면 0",
          },
          scaleLow: {
            type: "string",
            description: "scale 낮은쪽 앵커 라벨(예: 전혀 아니다). 없으면 빈 문자열",
          },
          scaleHigh: {
            type: "string",
            description: "scale 높은쪽 앵커 라벨(예: 매우 그렇다). 없으면 빈 문자열",
          },
        },
        required: ["type", "prompt", "options", "scaleMax", "scaleLow", "scaleHigh"],
      },
    },
  },
  required: ["items"],
} as const;

const PARSE_SURVEY_SYSTEM = `당신은 설문지 디지털화 도구입니다. 업로드된 문서/이미지(PDF·사진·캡처)에서 설문/검증 문항을 그대로 추출해 구조화합니다.
규칙:
- 각 문항을 유형으로 분류합니다: 리커트/점수 척도 → "scale", 보기에서 고르는 문항 → "choice", 자유 서술 → "open".
- prompt 에는 문항 텍스트를 원문 그대로(불필요한 번호·기호는 정리) 담습니다.
- choice 면 보기들을 options 에 순서대로 담고, scale/open 이면 options 는 빈 배열입니다.
- scale 이면 scaleMax 에 최대 점수(예: 5점 척도면 5)를, 양끝 앵커 문구가 있으면 scaleLow/scaleHigh 에 담습니다(없으면 빈 문자열). scale 이 아니면 scaleMax 는 0.
- 제목·안내문·인적사항 칸·머리글은 문항이 아니므로 제외합니다.
- 문서에 없는 문항을 지어내지 않습니다. 읽은 순서를 유지합니다.`;

type SurveyFile = { mediaType: string; data: string };

export const parseSurveyDoc = onCall(
  {
    secrets: [ANTHROPIC_API_KEY],
    timeoutSeconds: 300,
    memory: "512MiB",
  },
  async (req): Promise<ParsedSurvey> => {
    if (!req.auth) {
      throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
    }
    const { classId, files } = (req.data ?? {}) as {
      classId?: string;
      files?: SurveyFile[];
    };
    if (!classId || !Array.isArray(files) || files.length === 0) {
      throw new HttpsError(
        "invalid-argument",
        "classId 와 files(배열)가 필요합니다."
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
    const content: Anthropic.ContentBlockParam[] = files.map((f) =>
      f.mediaType === "application/pdf"
        ? {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: f.data,
            },
          }
        : {
            type: "image",
            source: {
              type: "base64",
              media_type: f.mediaType as
                | "image/png"
                | "image/jpeg"
                | "image/webp"
                | "image/gif",
              data: f.data,
            },
          }
    );
    content.push({
      type: "text",
      text: "위 자료에서 설문/검증 문항을 모두 추출해 구조화하세요.",
    });

    try {
      const message = await client.messages.create({
        model: "claude-opus-4-7",
        max_tokens: 8000,
        system: [
          {
            type: "text",
            text: PARSE_SURVEY_SYSTEM,
            cache_control: { type: "ephemeral" },
          },
        ],
        output_config: {
          format: { type: "json_schema", schema: PARSE_SURVEY_SCHEMA },
          effort: "medium",
        },
        messages: [{ role: "user", content }],
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
      return JSON.parse(jsonText) as ParsedSurvey;
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
    // 시크릿 미설정 시 폴백 없이 거부(하드코딩 코드 제거).
    let expected = "";
    try {
      expected = TEACHER_CODE.value() || "";
    } catch {
      expected = "";
    }
    if (!expected) {
      throw new HttpsError(
        "failed-precondition",
        "교사 가입이 일시적으로 비활성화되어 있습니다. 관리자에게 문의해 주세요."
      );
    }
    // 무차별 대입 방어: uid·IP 별 실패 횟수 제한(1시간 창, 6회).
    const ipKey = clientIpKey(req);
    const [uidRl, ipRl] = await Promise.all([
      makeRateLimiter(`teacher_uid_${req.auth.uid}`, 60 * 60 * 1000, 6),
      makeRateLimiter(`teacher_ip_${ipKey}`, 60 * 60 * 1000, 20),
    ]);
    if (uidRl.blocked || ipRl.blocked) {
      throw new HttpsError(
        "resource-exhausted",
        "시도 횟수가 많습니다. 잠시 후 다시 시도해 주세요."
      );
    }
    if (!code || code.trim() !== expected) {
      await Promise.all([uidRl.bumpFail(), ipRl.bumpFail()]);
      throw new HttpsError("permission-denied", "시스템 코드가 올바르지 않습니다.");
    }
    await Promise.all([uidRl.reset(), ipRl.reset()]);
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
    // Auth custom claim(role=teacher) — '계정 유형' 표식용으로만 유지한다.
    // 주의: Firestore 규칙의 isTeacher 는 더 이상 token.role 전역 패스를 신뢰하지
    // 않는다(학급 멤버 role 로만 판정). 즉 이 클레임은 학급 권한을 부여하지 않는다.
    try {
      await getAuth().setCustomUserClaims(auth.uid, { role: "teacher" });
    } catch (e) {
      // 클레임 설정 실패해도 users 문서 기반 검사로 폴백되므로 throw 하지 않음
      console.warn("setCustomUserClaims failed", e);
    }
    return { ok: true };
  }
);

/**
 * 교사 커스텀 클레임 재동기화.
 *
 * Storage 규칙은 Firestore 를 못 읽으므로 "이 사람이 교사인가"를 ID 토큰의
 * 커스텀 클레임(role)으로만 판정할 수 있다. 그런데 claimTeacherRole 의 클레임
 * 설정은 실패해도 통과시키는 best-effort 라, 클레임이 빠진 교사가 존재할 수 있다.
 * 그 상태로 Storage 를 조이면 학생 제출 첨부를 못 보게 되므로, 클라이언트가
 * 불일치를 감지하면 이 함수로 복구한다.
 *
 * 권한 상승 위험 없음: 새로 부여하는 게 아니라 users/{uid}.role 이라는 기존
 * 사실을 토큰에 반영할 뿐이다(teacher 가 아니면 아무것도 하지 않는다).
 */
export const syncTeacherClaim = onCall(
  async (req): Promise<{ synced: boolean }> => {
    if (!req.auth) {
      throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
    }
    const snap = await getFirestore().doc(`users/${req.auth.uid}`).get();
    if ((snap.data()?.role as string) !== "teacher") {
      return { synced: false };
    }
    if (req.auth.token.role === "teacher") {
      return { synced: false }; // 이미 있음
    }
    await getAuth().setCustomUserClaims(req.auth.uid, { role: "teacher" });
    return { synced: true };
  }
);

/**
 * 학급 게임 정리(스케줄, 매일 02:00 KST):
 * status="done" + updatedAt 30일 이상 지난 게임의 submissions 서브컬렉션과
 * 게임 문서를 삭제 — 장기 누적 저장 방지.
 */
export const cleanupOldGames = onSchedule(
  { schedule: "0 2 * * *", timeZone: "Asia/Seoul" },
  async () => {
    const db = getFirestore();
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const classes = await db.collection("classes").listDocuments();
    let totalGames = 0;
    let totalSubs = 0;
    for (const c of classes) {
      const games = await c
        .collection("games")
        .where("status", "==", "done")
        .get();
      for (const g of games.docs) {
        const updatedAt = g.data().updatedAt;
        const ms =
          updatedAt && typeof updatedAt.toMillis === "function"
            ? updatedAt.toMillis()
            : 0;
        if (ms >= cutoff) continue;
        // submissions 일괄 삭제 (500개씩 배치)
        const subs = await g.ref.collection("submissions").listDocuments();
        for (let i = 0; i < subs.length; i += 500) {
          const batch = db.batch();
          subs.slice(i, i + 500).forEach((s) => batch.delete(s));
          await batch.commit();
        }
        await g.ref.delete();
        totalGames++;
        totalSubs += subs.length;
      }
    }
    console.log(
      `[cleanupOldGames] deleted ${totalGames} done games (>${30}d), ${totalSubs} submissions`
    );
  }
);

/* ===================================================================== *
 *  코드로 학급 참여 (서버측) — 비멤버가 classes 컬렉션을 직접 조회하지 않도록
 *  admin 권한으로 코드 매칭 + 멤버 등록. (classes read 를 멤버로 잠그기 위한 핵심)
 * ===================================================================== */
export const joinClassByCode = onCall(
  { region: "asia-northeast3" },
  async (
    req
  ): Promise<{
    id: string;
    name: string;
    subject: string;
    description: string;
    ownerId: string;
    code: string;
    colorIndex: number;
    archived: boolean;
  }> => {
    if (!req.auth) {
      throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
    }
    const { code, displayName } = (req.data ?? {}) as {
      code?: string;
      displayName?: string;
    };
    const trimmed = (code ?? "").trim();
    if (!trimmed) {
      throw new HttpsError("invalid-argument", "참여 코드를 입력해 주세요.");
    }
    const fdb = getFirestore();

    // 무차별 대입 방어: uid·IP 별 실패(미존재 코드) 횟수 제한(10분 창).
    // 정상 가입은 코드를 정확히 입력하므로 실패가 거의 없어 영향받지 않는다.
    const ipKey = clientIpKey(req);
    const [uidRl, ipRl] = await Promise.all([
      makeRateLimiter(`join_uid_${req.auth.uid}`, 10 * 60 * 1000, 12),
      makeRateLimiter(`join_ip_${ipKey}`, 10 * 60 * 1000, 40),
    ]);
    if (uidRl.blocked || ipRl.blocked) {
      throw new HttpsError(
        "resource-exhausted",
        "시도 횟수가 많습니다. 잠시 후 다시 시도해 주세요."
      );
    }

    // 코드 형식 검증: '/'(문서 경로 분리자, doc() 동기 throw 유발)·과도한 길이 차단.
    // 정상 코드는 한글 단어 조합이라 해당 없음. 위반은 실패로 집계 후 not-found.
    if (trimmed.includes("/") || trimmed.length > 40) {
      await Promise.all([uidRl.bumpFail(), ipRl.bumpFail()]);
      throw new HttpsError(
        "not-found",
        "해당 코드의 학급을 찾을 수 없습니다."
      );
    }

    // 1) classCodes/{code} 인덱스 단건 조회(신규 학급: code→classId 유일 매핑).
    // 2) 없으면 레거시(인덱스 이전 생성) 학급을 위해 code 동등 질의로 폴백.
    let cid = "";
    let classData: Record<string, unknown> = {};
    const codeSnap = await fdb.doc(`classCodes/${trimmed}`).get();
    if (codeSnap.exists) {
      const mappedId = (codeSnap.data()?.classId as string) ?? "";
      if (mappedId) {
        const cls = await fdb.doc(`classes/${mappedId}`).get();
        if (cls.exists) {
          cid = mappedId;
          classData = cls.data() ?? {};
        }
      }
    }
    if (!cid) {
      const snap = await fdb
        .collection("classes")
        .where("code", "==", trimmed)
        .limit(1)
        .get();
      if (!snap.empty) {
        cid = snap.docs[0].id;
        classData = snap.docs[0].data() ?? {};
      }
    }
    if (!cid) {
      await Promise.all([uidRl.bumpFail(), ipRl.bumpFail()]);
      throw new HttpsError(
        "not-found",
        "해당 코드의 학급을 찾을 수 없습니다."
      );
    }
    await Promise.all([uidRl.reset(), ipRl.reset()]);
    const uid = req.auth.uid;
    const token = req.auth.token as { name?: string; picture?: string };
    const name = (displayName ?? "").trim() || token.name || "이름없음";
    const photoURL = token.picture ?? "";

    const batch = fdb.batch();
    const memberRef = fdb.doc(`classes/${cid}/members/${uid}`);
    const existing = await memberRef.get();
    if (!existing.exists) {
      batch.set(memberRef, {
        uid,
        classId: cid,
        role: "student",
        displayName: name,
        photoURL,
        joinedAt: FieldValue.serverTimestamp(),
      });
    }
    batch.set(
      fdb.doc(`users/${uid}`),
      displayName !== undefined
        ? { name, role: "student", classIds: FieldValue.arrayUnion(cid) }
        : { classIds: FieldValue.arrayUnion(cid) },
      { merge: true }
    );
    await batch.commit();

    const d = classData;
    return {
      id: cid,
      name: (d.name as string) ?? "",
      subject: (d.subject as string) ?? "",
      description: (d.description as string) ?? "",
      ownerId: (d.ownerId as string) ?? "",
      code: (d.code as string) ?? "",
      colorIndex: (d.colorIndex as number) ?? 0,
      archived: (d.archived as boolean) ?? false,
    };
  }
);

/* ===================================================================== *
 *  이름으로 이어가기 — 학생 프로필 계정 재연결(claim + re-key)
 *  로그아웃/새 기기로 새 계정을 만들어도, 학급 명단에서 '내 이름'을 고르면
 *  기존 프로필의 모든 데이터(uid 키)를 현재 계정(toUid)으로 admin 이전한다.
 *  - listClaimableStudents: 코드로 학급 학생 명단 조회(선택 화면용)
 *  - claimStudentProfile: fromUid→toUid 전 데이터 이전(멱등, 감사 로그)
 * ===================================================================== */

// 학급 코드 → classId (joinClassByCode 와 동일 규칙)
async function resolveClassByCode(code: string): Promise<string | null> {
  const fdb = getFirestore();
  const trimmed = (code ?? "").trim();
  if (!trimmed || trimmed.includes("/") || trimmed.length > 40) return null;
  const codeSnap = await fdb.doc(`classCodes/${trimmed}`).get();
  if (codeSnap.exists) {
    const mappedId = (codeSnap.data()?.classId as string) ?? "";
    if (mappedId && (await fdb.doc(`classes/${mappedId}`).get()).exists)
      return mappedId;
  }
  const snap = await fdb
    .collection("classes")
    .where("code", "==", trimmed)
    .limit(1)
    .get();
  return snap.empty ? null : snap.docs[0].id;
}

export const listClaimableStudents = onCall(
  async (
    req
  ): Promise<{
    classId: string;
    className: string;
    students: { id: string; name: string; photoURL: string }[];
  }> => {
    if (!req.auth)
      throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
    const { code } = (req.data ?? {}) as { code?: string };
    const cid = await resolveClassByCode(code ?? "");
    if (!cid)
      throw new HttpsError("not-found", "해당 코드의 학급을 찾을 수 없습니다.");
    const fdb = getFirestore();
    const [cls, members] = await Promise.all([
      fdb.doc(`classes/${cid}`).get(),
      fdb.collection(`classes/${cid}/members`).get(),
    ]);
    const students = members.docs
      .map((d) => ({ id: d.id, v: d.data() as Record<string, unknown> }))
      .filter((m) => ((m.v.role as string) ?? "student") === "student")
      .map((m) => ({
        id: m.id,
        name: String(m.v.displayName ?? "이름없음"),
        photoURL: String(m.v.photoURL ?? ""),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "ko"));
    return {
      classId: cid,
      className: String(cls.data()?.name ?? ""),
      students,
    };
  }
);

// 서브컬렉션 한 개를 from→to 로 복사 후 원본 삭제(배치). 반환=옮긴 문서 수.
async function moveSubcollection(
  fromRef: DocumentReference,
  toRef: DocumentReference,
  sub: string
): Promise<number> {
  const fdb = getFirestore();
  const items = await fromRef.collection(sub).get();
  for (let i = 0; i < items.docs.length; i += 200) {
    const b = fdb.batch();
    items.docs.slice(i, i + 200).forEach((it) => {
      b.set(toRef.collection(sub).doc(it.id), it.data(), { merge: true });
      b.delete(it.ref);
    });
    await b.commit();
  }
  return items.size;
}

// 경로 classes/{cid}/... → cid (재키잉을 학생 소속 학급으로 스코프)
function classIdOfPath(p: string): string {
  const parts = p.split("/");
  return parts[0] === "classes" ? (parts[1] ?? "") : "";
}

// 문서ID=uid 형태 문서(+서브컬렉션)를 from→to 로 이동. overrides 로 일부 필드 강제(uid/role 등).
async function moveUidDoc(
  pathOf: (uid: string) => string,
  fromUid: string,
  toUid: string,
  subs: string[],
  overrides: Record<string, unknown> = {}
): Promise<number> {
  const fdb = getFirestore();
  const fromRef = fdb.doc(pathOf(fromUid));
  const snap = await fromRef.get();
  if (!snap.exists) return 0;
  const toRef = fdb.doc(pathOf(toUid));
  let n = 1;
  for (const s of subs) n += await moveSubcollection(fromRef, toRef, s);
  await toRef.set(
    { ...(snap.data() as Record<string, unknown>), ...overrides },
    { merge: true }
  );
  await fromRef.delete();
  return n;
}

// 집계 스칼라(xp/manbo)는 덮어쓰기 금지 — 트랜잭션으로 두 문서 값을 "합산"(멱등: from 삭제까지 원자)
async function mergeSumDoc(
  pathOf: (uid: string) => string,
  fromUid: string,
  toUid: string,
  sumFields: string[],
  subs: string[]
): Promise<number> {
  const fdb = getFirestore();
  const fromRef = fdb.doc(pathOf(fromUid));
  if (!(await fromRef.get()).exists) return 0;
  const toRef = fdb.doc(pathOf(toUid));
  for (const s of subs) await moveSubcollection(fromRef, toRef, s); // log 는 doc-id 보존 복사
  await fdb.runTransaction(async (tx) => {
    const [fs, ts] = await Promise.all([tx.get(fromRef), tx.get(toRef)]);
    if (!fs.exists) return;
    const fd = (fs.data() ?? {}) as Record<string, number>;
    const td = (ts.exists ? ts.data() ?? {} : {}) as Record<string, number>;
    const merged: Record<string, unknown> = { ...td, ...fd };
    for (const f of sumFields)
      merged[f] = Number(td[f] ?? 0) + Number(fd[f] ?? 0);
    if ("uid" in merged) merged.uid = toUid; // manbo 의 uid 필드 정규화(stale 방지)
    merged.updatedAt = FieldValue.serverTimestamp();
    tx.set(toRef, merged, { merge: true });
    tx.delete(fromRef);
  });
  return 1;
}

// collectionGroup 의 특정 필드(uid/authorUid/fromUid/byUid)를 fromUid→toUid 로 치환(제자리).
// allowed 가 있으면 그 학급(cid) 문서만.
async function rekeyFieldCG(
  cg: string,
  field: string,
  fromUid: string,
  toUid: string,
  allowed?: Set<string>
): Promise<number> {
  const fdb = getFirestore();
  const snap = await fdb.collectionGroup(cg).where(field, "==", fromUid).get();
  const docs = allowed
    ? snap.docs.filter((d) => allowed.has(classIdOfPath(d.ref.path)))
    : snap.docs;
  let n = 0;
  for (let i = 0; i < docs.length; i += 400) {
    const b = fdb.batch();
    docs.slice(i, i + 400).forEach((d) => {
      b.update(d.ref, { [field]: toUid });
      n++;
    });
    await b.commit();
  }
  return n;
}

// 문서ID=uid 이면서 uid 필드도 가진 컬렉션(submissions)을 collectionGroup 으로 찾아
// 형제 문서(toUid)로 이동(+서브컬렉션). pathIncludes 로 경로 한정(게임 제출 제외 등).
async function moveByUidFieldCG(
  cg: string,
  fromUid: string,
  toUid: string,
  subs: string[],
  opts: {
    pathIncludes?: string;
    allowed?: Set<string>;
    skipIfExists?: boolean;
  } = {}
): Promise<number> {
  const fdb = getFirestore();
  const snap = await fdb.collectionGroup(cg).where("uid", "==", fromUid).get();
  let n = 0;
  for (const d of snap.docs) {
    if (d.id === toUid) continue;
    if (opts.pathIncludes && !d.ref.path.includes(opts.pathIncludes)) continue;
    if (opts.allowed && !opts.allowed.has(classIdOfPath(d.ref.path))) continue;
    const toRef = d.ref.parent.doc(toUid);
    // 합치기(merge): keeper 가 이미 같은 문서를 가지면 keeper 우선 — 덮어쓰지 않고 중복만 제거
    if (opts.skipIfExists && (await toRef.get()).exists) {
      await d.ref.delete();
      continue;
    }
    for (const s of subs) await moveSubcollection(d.ref, toRef, s);
    await toRef.set({ ...d.data(), uid: toUid }, { merge: true });
    await d.ref.delete();
    n++;
  }
  return n;
}

export const claimStudentProfile = onCall(
  { timeoutSeconds: 540 },
  async (
    req
  ): Promise<{
    ok: true;
    classId: string;
    moved: Record<string, number>;
    errors: string[];
  }> => {
    if (!req.auth)
      throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
    const toUid = req.auth.uid;
    const { code, fromUid } = (req.data ?? {}) as {
      code?: string;
      fromUid?: string;
    };
    if (!fromUid)
      throw new HttpsError("invalid-argument", "이어갈 프로필이 필요합니다.");
    if (fromUid === toUid)
      throw new HttpsError("invalid-argument", "이미 본인 계정입니다.");

    const fdb = getFirestore();
    const cid = await resolveClassByCode(code ?? "");
    if (!cid)
      throw new HttpsError("not-found", "해당 코드의 학급을 찾을 수 없습니다.");

    // 대상 프로필이 그 학급의 '학생'인지 확인(교사 프로필 인계 차단 = 권한상승 방지)
    const fromMember = await fdb.doc(`classes/${cid}/members/${fromUid}`).get();
    if (
      !fromMember.exists ||
      ((fromMember.data()?.role as string) ?? "student") !== "student"
    )
      throw new HttpsError("not-found", "이어갈 학생 프로필을 찾을 수 없습니다.");

    // 무차별 시도 방어(uid 당)
    const rl = await makeRateLimiter(
      `claim_${toUid}`,
      10 * 60 * 1000,
      20
    );
    if (rl.blocked)
      throw new HttpsError(
        "resource-exhausted",
        "시도 횟수가 많습니다. 잠시 후 다시 시도해 주세요."
      );

    const fromUser = await fdb.doc(`users/${fromUid}`).get();

    // 이전 대상 학급은 fromUid 가 "학생"인 학급만(권위적으로 member 문서에서 도출).
    //  - 교사인 학급은 제외 → 교사 권한이 toUid 로 새지 않게(권한상승 차단)
    //  - users.classIds 캐시에 의존하지 않음 → 누락 학급 데이터 고아 방지
    const memberDocs = await fdb
      .collectionGroup("members")
      .where("uid", "==", fromUid)
      .get();
    const studentClassIds = new Set<string>([cid]); // cid 는 위에서 student 확인됨
    for (const d of memberDocs.docs) {
      const c = classIdOfPath(d.ref.path);
      if (c && ((d.data().role as string) ?? "student") === "student")
        studentClassIds.add(c);
    }
    const allowed = studentClassIds; // 필드 재키잉도 이 학급들로 스코프

    const moved: Record<string, number> = {};
    const errors: string[] = [];
    // best-effort: 한 단계가 실패해도(인덱스/일시오류) 전체 이전을 멈추지 않는다.
    //  중요 데이터(members/xp/manbo/submissions)는 먼저 실행되어 우선 보호되고,
    //  실패 단계는 errors 에 남아 재실행(멱등) 시 마저 처리된다.
    const safe = async (k: string, fn: () => Promise<number>) => {
      try {
        const n = await fn();
        if (n) moved[k] = (moved[k] ?? 0) + n;
      } catch (e) {
        errors.push(`${k}: ${String((e as Error)?.message ?? e)}`);
      }
    };

    // 1) 문서ID=uid 형태(학급별): members(정규화)/xp·manbo(합산)/badges/signals/praiseInbox/threads
    for (const c of studentClassIds) {
      await safe("members", () => moveUidDoc((u) => `classes/${c}/members/${u}`, fromUid, toUid, [], { uid: toUid, role: "student" }));
      await safe("xp", () => mergeSumDoc((u) => `classes/${c}/xp/${u}`, fromUid, toUid, ["xp"], ["log"]));
      await safe("manbo", () => mergeSumDoc((u) => `classes/${c}/manbo/${u}`, fromUid, toUid, ["balance", "earned", "spent"], ["log"]));
      await safe("badges", () => moveUidDoc((u) => `classes/${c}/badges/${u}`, fromUid, toUid, []));
      await safe("signals", () => moveUidDoc((u) => `classes/${c}/signals/${u}`, fromUid, toUid, []));
      await safe("praiseInbox", () => moveUidDoc((u) => `classes/${c}/praiseInbox/${u}`, fromUid, toUid, ["items"]));
      await safe("threads", () => moveUidDoc((u) => `classes/${c}/threads/${u}`, fromUid, toUid, ["messages"]));
      // 차시별 1:1 메시지 스레드
      const lessons = await fdb.collection(`classes/${c}/lessons`).get();
      for (const ls of lessons.docs) {
        await safe("lessonThreads", () =>
          moveUidDoc(
            (u) => `classes/${c}/lessons/${ls.id}/threads/${u}`,
            fromUid,
            toUid,
            ["messages"]
          )
        );
      }
    }

    // 2) 차시 제출물(문서ID=uid + uid 필드) → 형제 toUid 로 이동. 게임 제출은 제외(/lessons/ 한정).
    await safe("submissions", () =>
      moveByUidFieldCG("submissions", fromUid, toUid, ["comments"], {
        pathIncludes: "/lessons/",
        allowed,
      })
    );

    // 3) 필드 치환(제자리, 학생 학급 한정) — 캔버스/피드백/요청/칭찬/메시지/댓글 작성자
    await safe("canvasNodes", () => rekeyFieldCG("nodes", "authorUid", fromUid, toUid, allowed));
    await safe("canvasEdges", () => rekeyFieldCG("edges", "authorUid", fromUid, toUid, allowed));
    await safe("cardFeedback", () => rekeyFieldCG("feedback", "uid", fromUid, toUid, allowed)); // 캔버스 카드 피드백
    await safe("reportFeedback", () => rekeyFieldCG("feedback", "byUid", fromUid, toUid, allowed)); // 학생 오류신고/의견
    await safe("xpRequests", () => rekeyFieldCG("xpRequests", "uid", fromUid, toUid, allowed));
    await safe("presentationRequests", () => rekeyFieldCG("presentationRequests", "fromUid", fromUid, toUid, allowed));
    await safe("praisesSent", () => rekeyFieldCG("praises", "fromUid", fromUid, toUid, allowed));
    await safe("praisesRecv", () => rekeyFieldCG("praises", "toUid", fromUid, toUid, allowed));
    await safe("messageAuthors", () => rekeyFieldCG("messages", "authorUid", fromUid, toUid, allowed));
    await safe("commentAuthors", () => rekeyFieldCG("comments", "authorUid", fromUid, toUid, allowed));
    // (게임 진행상태 turn/ranks 는 일회성 활동이라 이전하지 않음 — 옛 결과는 옛 계정에 남음)

    // 4) users 문서: 새 계정에 기존 프로필 정체성 병합, 옛 계정에서 학급 분리
    const fu = fromUser.data() ?? {};
    const movedClasses = Array.from(studentClassIds);
    await fdb.doc(`users/${toUid}`).set(
      {
        role: "student",
        name: fu.name ?? fromMember.data()?.displayName ?? "",
        ...(fu.avatar ? { avatar: fu.avatar } : {}),
        ...(fu.school ? { school: fu.school } : {}),
        classIds: FieldValue.arrayUnion(...movedClasses),
      },
      { merge: true }
    );
    if (fromUser.exists) {
      await fdb
        .doc(`users/${fromUid}`)
        .set(
          { classIds: FieldValue.arrayRemove(...movedClasses) },
          { merge: true }
        );
    }

    // 5) 감사 로그(교사 추적/복구용)
    await fdb.collection(`classes/${cid}/profileClaims`).add({
      fromUid,
      toUid,
      name: fromMember.data()?.displayName ?? "",
      moved,
      errors,
      at: FieldValue.serverTimestamp(),
    });

    return { ok: true, classId: cid, moved, errors };
  }
);

// 교사용: 한 학급 안의 두 학생 프로필을 합친다(중복 정리). fromUid(합쳐서 삭제) → toUid(남길 keeper).
//  claimStudentProfile 과 같은 re-key 헬퍼를 쓰되, ① 한 학급(classId)으로만 스코프 ②keeper 정체성 유지
//  ③중복 멤버 삭제 ④충돌 시 keeper 우선. 학급 소유 교사만 호출 가능.
export const mergeStudentProfiles = onCall(
  { timeoutSeconds: 540 },
  async (
    req
  ): Promise<{ ok: true; moved: Record<string, number>; errors: string[] }> => {
    if (!req.auth)
      throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
    const { classId, fromUid, toUid } = (req.data ?? {}) as {
      classId?: string;
      fromUid?: string;
      toUid?: string;
    };
    if (!classId || !fromUid || !toUid)
      throw new HttpsError("invalid-argument", "classId·fromUid·toUid 가 필요합니다.");
    if (fromUid === toUid)
      throw new HttpsError("invalid-argument", "같은 프로필은 합칠 수 없습니다.");

    const fdb = getFirestore();
    // 호출자가 그 학급의 교사인지
    const caller = await fdb.doc(`classes/${classId}/members/${req.auth.uid}`).get();
    if (!caller.exists || (caller.data()?.role as string) !== "teacher")
      throw new HttpsError("permission-denied", "학급 교사만 합칠 수 있습니다.");
    // 둘 다 그 학급의 학생인지(교사 프로필 병합 금지)
    const [fromM, toM] = await Promise.all([
      fdb.doc(`classes/${classId}/members/${fromUid}`).get(),
      fdb.doc(`classes/${classId}/members/${toUid}`).get(),
    ]);
    if (!fromM.exists || ((fromM.data()?.role as string) ?? "student") !== "student")
      throw new HttpsError("not-found", "합칠(중복) 학생 프로필이 없습니다.");
    if (!toM.exists || ((toM.data()?.role as string) ?? "student") !== "student")
      throw new HttpsError("not-found", "남길 학생 프로필이 없습니다.");

    const c = classId;
    const allowed = new Set([c]); // 이 학급으로만 스코프(타 학급 데이터 불변)
    const moved: Record<string, number> = {};
    const errors: string[] = [];
    const safe = async (k: string, fn: () => Promise<number>) => {
      try {
        const n = await fn();
        if (n) moved[k] = (moved[k] ?? 0) + n;
      } catch (e) {
        errors.push(`${k}: ${String((e as Error)?.message ?? e)}`);
      }
    };

    // 1) 중복(fromUid) 멤버 삭제 — keeper 멤버는 그대로 유지(정체성 보존)
    await safe("memberRemoved", async () => {
      await fdb.doc(`classes/${c}/members/${fromUid}`).delete();
      return 1;
    });
    // xp/manbo 합산(두 프로필이 각각 쌓은 점수 합치기)
    await safe("xp", () => mergeSumDoc((u) => `classes/${c}/xp/${u}`, fromUid, toUid, ["xp"], ["log"]));
    await safe("manbo", () => mergeSumDoc((u) => `classes/${c}/manbo/${u}`, fromUid, toUid, ["balance", "earned", "spent"], ["log"]));
    await safe("badges", () => moveUidDoc((u) => `classes/${c}/badges/${u}`, fromUid, toUid, []));
    await safe("signals", () => moveUidDoc((u) => `classes/${c}/signals/${u}`, fromUid, toUid, []));
    await safe("praiseInbox", () => moveUidDoc((u) => `classes/${c}/praiseInbox/${u}`, fromUid, toUid, ["items"]));
    await safe("threads", () => moveUidDoc((u) => `classes/${c}/threads/${u}`, fromUid, toUid, ["messages"]));
    const lessons = await fdb.collection(`classes/${c}/lessons`).get();
    for (const ls of lessons.docs) {
      await safe("lessonThreads", () =>
        moveUidDoc((u) => `classes/${c}/lessons/${ls.id}/threads/${u}`, fromUid, toUid, ["messages"])
      );
    }
    // 2) 차시 제출물 — keeper 우선(둘 다 제출했으면 keeper 것 유지). 게임 제외(/lessons/).
    await safe("submissions", () =>
      moveByUidFieldCG("submissions", fromUid, toUid, ["comments"], {
        pathIncludes: "/lessons/",
        allowed,
        skipIfExists: true,
      })
    );
    // 3) 필드 치환(이 학급 한정)
    await safe("canvasNodes", () => rekeyFieldCG("nodes", "authorUid", fromUid, toUid, allowed));
    await safe("canvasEdges", () => rekeyFieldCG("edges", "authorUid", fromUid, toUid, allowed));
    await safe("cardFeedback", () => rekeyFieldCG("feedback", "uid", fromUid, toUid, allowed));
    await safe("reportFeedback", () => rekeyFieldCG("feedback", "byUid", fromUid, toUid, allowed));
    await safe("xpRequests", () => rekeyFieldCG("xpRequests", "uid", fromUid, toUid, allowed));
    await safe("presentationRequests", () => rekeyFieldCG("presentationRequests", "fromUid", fromUid, toUid, allowed));
    await safe("praisesSent", () => rekeyFieldCG("praises", "fromUid", fromUid, toUid, allowed));
    await safe("praisesRecv", () => rekeyFieldCG("praises", "toUid", fromUid, toUid, allowed));
    await safe("messageAuthors", () => rekeyFieldCG("messages", "authorUid", fromUid, toUid, allowed));
    await safe("commentAuthors", () => rekeyFieldCG("comments", "authorUid", fromUid, toUid, allowed));

    // 4) 중복 계정의 users.classIds 에서 이 학급 제거(다른 학급은 그대로)
    await fdb
      .doc(`users/${fromUid}`)
      .set({ classIds: FieldValue.arrayRemove(c) }, { merge: true })
      .catch(() => {});

    // 5) 감사 로그
    await fdb.collection(`classes/${c}/profileClaims`).add({
      kind: "merge",
      byTeacher: req.auth.uid,
      fromUid,
      toUid,
      name: toM.data()?.displayName ?? "",
      moved,
      errors,
      at: FieldValue.serverTimestamp(),
    });

    return { ok: true, moved, errors };
  }
);

/* ===================================================================== *
 *  만보 상점 구매 (서버측 트랜잭션) — 잔액 차감·구매 기록을 원자적으로 처리.
 *  클라이언트가 만보를 직접 차감하지 못하게 규칙으로 잠그고(manbo write=teacher),
 *  이 함수만 admin 권한으로 지갑/로그/구매 문서를 일괄 기록한다.
 *  XP 는 절대 건드리지 않는다(만보와 XP 는 분리된 원장).
 * ===================================================================== */
export const buyMarketItem = onCall(
  async (req): Promise<{ ok: true; balance: number }> => {
    if (!req.auth) {
      throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
    }
    const { cid, itemId } = (req.data ?? {}) as {
      cid?: string;
      itemId?: string;
    };
    if (!cid || !itemId) {
      throw new HttpsError(
        "invalid-argument",
        "cid 와 itemId 가 필요합니다."
      );
    }
    const uid = req.auth.uid;
    const fdb = getFirestore();

    // 권한: 호출자가 해당 학급의 멤버인지 확인
    const memberSnap = await fdb.doc(`classes/${cid}/members/${uid}`).get();
    if (!memberSnap.exists) {
      throw new HttpsError(
        "permission-denied",
        "해당 학급의 멤버만 구매할 수 있습니다."
      );
    }
    const token = req.auth.token as { name?: string };
    const buyerName =
      (memberSnap.data()?.displayName as string) || token.name || "학생";

    const itemRef = fdb.doc(`classes/${cid}/market/${itemId}`);
    const walletRef = fdb.doc(`classes/${cid}/manbo/${uid}`);
    const logRef = walletRef.collection("log").doc();
    const purchaseRef = fdb.collection(`classes/${cid}/purchases`).doc();

    const newBalance = await fdb.runTransaction(async (tx) => {
      const itemSnap = await tx.get(itemRef);
      if (!itemSnap.exists || itemSnap.data()?.active === false) {
        throw new HttpsError(
          "failed-precondition",
          "판매 중이 아닌 상품입니다."
        );
      }
      const item = itemSnap.data() as { title?: string; price?: number };
      const price = typeof item.price === "number" ? item.price : 0;

      const walletSnap = await tx.get(walletRef);
      const balance = (walletSnap.data()?.balance as number) ?? 0;
      if (balance < price) {
        throw new HttpsError(
          "failed-precondition",
          `만보가 부족합니다. (필요 ${price}, 보유 ${balance})`
        );
      }

      tx.set(
        walletRef,
        {
          uid,
          balance: FieldValue.increment(-price),
          spent: FieldValue.increment(price),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      tx.set(logRef, {
        type: "spend",
        amount: price,
        reason: `구매: ${item.title ?? ""}`,
        by: uid,
        at: FieldValue.serverTimestamp(),
      });
      tx.set(purchaseRef, {
        itemId,
        title: item.title ?? "",
        price,
        buyerUid: uid,
        buyerName,
        at: FieldValue.serverTimestamp(),
      });
      return balance - price;
    });

    return { ok: true, balance: newBalance };
  }
);

/* ---------- 러닝마켓 환불(구매 취소 + 만보 반환) ----------
 * 교사만 호출 가능. 구매 문서를 지우고 구매가(price)를 학생 지갑에 되돌린다.
 * 구매와 동일하게 트랜잭션으로 원자 처리(잔액 += price, spent -= price, 로그 기록).
 * 구매 문서가 이미 없으면(중복 환불) 실패 처리 → 이중 환불 방지. */
export const refundPurchase = onCall(
  async (req): Promise<{ ok: true; balance: number }> => {
    if (!req.auth) {
      throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
    }
    const { cid, pid } = (req.data ?? {}) as { cid?: string; pid?: string };
    if (!cid || !pid) {
      throw new HttpsError("invalid-argument", "cid 와 pid 가 필요합니다.");
    }
    const uid = req.auth.uid;
    const fdb = getFirestore();

    // 권한: 호출자가 해당 학급의 교사여야 함
    const memberSnap = await fdb.doc(`classes/${cid}/members/${uid}`).get();
    if (!memberSnap.exists || memberSnap.data()?.role !== "teacher") {
      throw new HttpsError(
        "permission-denied",
        "환불은 담당 교사만 할 수 있습니다."
      );
    }

    const purchaseRef = fdb.doc(`classes/${cid}/purchases/${pid}`);

    const newBalance = await fdb.runTransaction(async (tx) => {
      const pSnap = await tx.get(purchaseRef);
      if (!pSnap.exists) {
        throw new HttpsError(
          "failed-precondition",
          "이미 환불되었거나 찾을 수 없는 구매입니다."
        );
      }
      const p = pSnap.data() as {
        price?: number;
        buyerUid?: string;
        title?: string;
      };
      const price = typeof p.price === "number" ? p.price : 0;
      const buyerUid = p.buyerUid;
      if (!buyerUid) {
        throw new HttpsError("failed-precondition", "구매자 정보가 없습니다.");
      }

      const walletRef = fdb.doc(`classes/${cid}/manbo/${buyerUid}`);
      const walletSnap = await tx.get(walletRef);
      const balance = (walletSnap.data()?.balance as number) ?? 0;
      const spent = (walletSnap.data()?.spent as number) ?? 0;
      const logRef = walletRef.collection("log").doc();

      tx.set(
        walletRef,
        {
          uid: buyerUid,
          balance: FieldValue.increment(price),
          spent: Math.max(0, spent - price),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      tx.set(logRef, {
        type: "earn",
        amount: price,
        reason: `환불: ${p.title ?? ""}`,
        by: uid,
        at: FieldValue.serverTimestamp(),
      });
      tx.delete(purchaseRef);
      return balance + price;
    });

    return { ok: true, balance: newBalance };
  }
);

/* ===================================================================== *
 *  러닝 크라우드펀딩 — 여럿이 만보를 모아 상품을 공동구매한다.
 *  · 참여(기여)는 즉시 지갑에서 만보를 차감(에스크로)하고, 취소 시 전원 환불.
 *  · 목표(goal=상품가) 달성 시 개설자만 '최종 구매하기'로 확정한다.
 *  모든 만보 이동은 이 함수들의 서버 트랜잭션으로만 처리(규칙 write=false).
 *  상점 구매/환불과 동일하게 balance = earned - spent 불변식을 유지한다.
 *    참여  : balance -= take;  spent += take   (spend 로그)
 *    취소  : balance += amount; spent = max(0, spent - amount) (earn 로그)
 *    확정  : 지갑 이동 없음(참여 시 이미 빠져나감). 구매 문서만 생성.
 * ===================================================================== */

/* ---------- 1) 펀딩 개설 ---------- */
export const createFunding = onCall(
  async (req): Promise<{ ok: true; fid: string }> => {
    if (!req.auth) {
      throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
    }
    const { cid, itemId } = (req.data ?? {}) as {
      cid?: string;
      itemId?: string;
    };
    if (!cid || !itemId) {
      throw new HttpsError("invalid-argument", "cid 와 itemId 가 필요합니다.");
    }
    const uid = req.auth.uid;
    const fdb = getFirestore();

    // 권한: 호출자가 해당 학급의 멤버인지 확인
    const memberSnap = await fdb.doc(`classes/${cid}/members/${uid}`).get();
    if (!memberSnap.exists) {
      throw new HttpsError(
        "permission-denied",
        "해당 학급의 멤버만 펀딩을 열 수 있습니다."
      );
    }
    const token = req.auth.token as { name?: string };
    const creatorName =
      (memberSnap.data()?.displayName as string) || token.name || "학생";

    // 대상 상품 스냅샷 — 판매 중이고 가격이 있어야 한다.
    const itemSnap = await fdb.doc(`classes/${cid}/market/${itemId}`).get();
    if (!itemSnap.exists || itemSnap.data()?.active === false) {
      throw new HttpsError("failed-precondition", "판매 중이 아닌 상품입니다.");
    }
    const item = itemSnap.data() as {
      title?: string;
      price?: number;
      imageUrl?: string;
    };
    const goal = typeof item.price === "number" ? item.price : 0;
    if (goal <= 0) {
      throw new HttpsError(
        "failed-precondition",
        "무료 상품은 펀딩이 필요 없어요."
      );
    }

    const fundingRef = fdb.collection(`classes/${cid}/fundings`).doc();
    await fundingRef.set({
      itemId,
      title: item.title ?? "",
      imageUrl: item.imageUrl ?? "",
      goal,
      raised: 0,
      creatorUid: uid,
      creatorName,
      status: "open",
      contribs: {},
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return { ok: true, fid: fundingRef.id };
  }
);

/* ---------- 2) 펀딩 참여(기여) ---------- */
export const contributeFunding = onCall(
  async (req): Promise<{ ok: true; raised: number; status: string }> => {
    if (!req.auth) {
      throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
    }
    const { cid, fid, amount } = (req.data ?? {}) as {
      cid?: string;
      fid?: string;
      amount?: number;
    };
    if (!cid || !fid) {
      throw new HttpsError("invalid-argument", "cid 와 fid 가 필요합니다.");
    }
    const amt = Math.floor(typeof amount === "number" ? amount : 0);
    if (amt <= 0) {
      throw new HttpsError(
        "invalid-argument",
        "참여 금액은 1 이상이어야 해요."
      );
    }
    const uid = req.auth.uid;
    const fdb = getFirestore();

    const memberSnap = await fdb.doc(`classes/${cid}/members/${uid}`).get();
    if (!memberSnap.exists) {
      throw new HttpsError(
        "permission-denied",
        "해당 학급의 멤버만 참여할 수 있습니다."
      );
    }
    const token = req.auth.token as { name?: string };
    const contributorName =
      (memberSnap.data()?.displayName as string) || token.name || "학생";

    const fundingRef = fdb.doc(`classes/${cid}/fundings/${fid}`);
    const walletRef = fdb.doc(`classes/${cid}/manbo/${uid}`);
    const logRef = walletRef.collection("log").doc();

    const result = await fdb.runTransaction(async (tx) => {
      const fSnap = await tx.get(fundingRef);
      if (!fSnap.exists) {
        throw new HttpsError("not-found", "펀딩을 찾을 수 없습니다.");
      }
      const f = fSnap.data() as {
        goal?: number;
        raised?: number;
        status?: string;
        title?: string;
      };
      if (f.status !== "open") {
        throw new HttpsError(
          "failed-precondition",
          "모금 중인 펀딩이 아니에요."
        );
      }
      const goal = typeof f.goal === "number" ? f.goal : 0;
      const raised = typeof f.raised === "number" ? f.raised : 0;
      const remaining = goal - raised;
      const take = Math.min(amt, remaining);
      if (take <= 0) {
        throw new HttpsError("failed-precondition", "이미 목표를 채웠어요.");
      }

      const walletSnap = await tx.get(walletRef);
      const balance = (walletSnap.data()?.balance as number) ?? 0;
      if (balance < take) {
        throw new HttpsError(
          "failed-precondition",
          `만보가 부족합니다. (필요 ${take}, 보유 ${balance})`
        );
      }

      const newRaised = raised + take;
      const newStatus = newRaised >= goal ? "reached" : "open";

      // 지갑: 즉시 차감(에스크로) — 상점 구매와 동일 의미(refundable spend)
      tx.set(
        walletRef,
        {
          uid,
          balance: FieldValue.increment(-take),
          spent: FieldValue.increment(take),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      tx.set(logRef, {
        type: "spend",
        amount: take,
        reason: `펀딩 참여: ${f.title ?? ""}`,
        by: uid,
        at: FieldValue.serverTimestamp(),
      });
      // 펀딩: 모금액 증가 + 기여자 누적(중첩 map 은 merge 로 부분 갱신)
      tx.set(
        fundingRef,
        {
          raised: FieldValue.increment(take),
          status: newStatus,
          contribs: {
            [uid]: {
              amount: FieldValue.increment(take),
              name: contributorName,
            },
          },
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      return { raised: newRaised, status: newStatus };
    });

    return { ok: true, raised: result.raised, status: result.status };
  }
);

/* ---------- 3) 펀딩 확정(최종 구매) — 개설자만 ---------- */
export const completeFunding = onCall(
  async (req): Promise<{ ok: true }> => {
    if (!req.auth) {
      throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
    }
    const { cid, fid } = (req.data ?? {}) as { cid?: string; fid?: string };
    if (!cid || !fid) {
      throw new HttpsError("invalid-argument", "cid 와 fid 가 필요합니다.");
    }
    const uid = req.auth.uid;
    const fdb = getFirestore();

    const fundingRef = fdb.doc(`classes/${cid}/fundings/${fid}`);
    const purchaseRef = fdb.collection(`classes/${cid}/purchases`).doc();

    await fdb.runTransaction(async (tx) => {
      const fSnap = await tx.get(fundingRef);
      if (!fSnap.exists) {
        throw new HttpsError("not-found", "펀딩을 찾을 수 없습니다.");
      }
      const f = fSnap.data() as {
        itemId?: string;
        title?: string;
        goal?: number;
        creatorUid?: string;
        creatorName?: string;
        status?: string;
      };
      if (f.creatorUid !== uid) {
        throw new HttpsError(
          "permission-denied",
          "펀딩 개설자만 구매를 확정할 수 있어요."
        );
      }
      if (f.status !== "reached") {
        throw new HttpsError(
          "failed-precondition",
          "아직 목표를 달성하지 않았어요."
        );
      }

      // 구매 문서(개설자 앞) — funded:true 로 공동구매임을 표시(개인 차감 아님)
      tx.set(purchaseRef, {
        itemId: f.itemId ?? "",
        title: f.title ?? "",
        price: typeof f.goal === "number" ? f.goal : 0,
        buyerUid: f.creatorUid,
        buyerName: f.creatorName ?? "학생",
        at: FieldValue.serverTimestamp(),
        funded: true,
        fundingId: fid,
      });
      // 펀딩: 완료 처리(지갑 이동 없음)
      tx.set(
        fundingRef,
        {
          status: "completed",
          completedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    });

    return { ok: true };
  }
);

/* ---------- 4) 펀딩 취소(전원 환불) — 개설자 또는 교사 ---------- */
export const cancelFunding = onCall(
  async (req): Promise<{ ok: true }> => {
    if (!req.auth) {
      throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
    }
    const { cid, fid } = (req.data ?? {}) as { cid?: string; fid?: string };
    if (!cid || !fid) {
      throw new HttpsError("invalid-argument", "cid 와 fid 가 필요합니다.");
    }
    const uid = req.auth.uid;
    const fdb = getFirestore();

    // 권한: 개설자 또는 해당 학급 교사
    const memberSnap = await fdb.doc(`classes/${cid}/members/${uid}`).get();
    const callerIsTeacher =
      memberSnap.exists && memberSnap.data()?.role === "teacher";

    const fundingRef = fdb.doc(`classes/${cid}/fundings/${fid}`);

    await fdb.runTransaction(async (tx) => {
      const fSnap = await tx.get(fundingRef);
      if (!fSnap.exists) {
        throw new HttpsError("not-found", "펀딩을 찾을 수 없습니다.");
      }
      const f = fSnap.data() as {
        creatorUid?: string;
        status?: string;
        title?: string;
        contribs?: Record<string, { name?: string; amount?: number }>;
      };
      if (f.creatorUid !== uid && !callerIsTeacher) {
        throw new HttpsError(
          "permission-denied",
          "펀딩 개설자나 선생님만 취소할 수 있어요."
        );
      }
      if (f.status !== "open" && f.status !== "reached") {
        throw new HttpsError(
          "failed-precondition",
          "이미 완료되었거나 취소된 펀딩이에요."
        );
      }

      const contribs = f.contribs ?? {};
      // 트랜잭션 규칙: 모든 읽기를 쓰기보다 먼저. 기여자 지갑을 전부 읽어 모은 뒤
      // 그 다음 환불 쓰기를 진행한다.
      const refunds: Array<{
        uid: string;
        amount: number;
        walletRef: ReturnType<typeof fdb.doc>;
        spent: number;
      }> = [];
      for (const cu of Object.keys(contribs)) {
        const amount = Math.floor(contribs[cu]?.amount ?? 0);
        if (amount <= 0) continue;
        const walletRef = fdb.doc(`classes/${cid}/manbo/${cu}`);
        const wSnap = await tx.get(walletRef);
        refunds.push({
          uid: cu,
          amount,
          walletRef,
          spent: (wSnap.data()?.spent as number) ?? 0,
        });
      }

      // 이제 쓰기 — 전원 환불(balance += amount, spent = max(0, spent-amount))
      for (const r of refunds) {
        tx.set(
          r.walletRef,
          {
            uid: r.uid,
            balance: FieldValue.increment(r.amount),
            spent: Math.max(0, r.spent - r.amount),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
        const logRef = r.walletRef.collection("log").doc();
        tx.set(logRef, {
          type: "earn",
          amount: r.amount,
          reason: `펀딩 취소 환불: ${f.title ?? ""}`,
          by: uid,
          at: FieldValue.serverTimestamp(),
        });
      }

      tx.set(
        fundingRef,
        {
          status: "cancelled",
          cancelledAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    });

    return { ok: true };
  }
);

/* ---------- 학교 검색 (NEIS 나이스 오픈API 프록시) ---------- *
 * 회원가입(온보딩) 전 학교 자동완성에 쓰이므로 인증 불요·공개 읽기 전용.
 * NEIS API 키(NEIS_API_KEY)는 환경변수로만 읽고(시크릿 미사용) — 키가 없거나
 * NEIS가 오류/빈 응답을 줘도 절대 throw 하지 않고 빈 목록을 반환한다.
 * (UI는 빈 목록이면 자유 입력으로 폴백한다.)                              */
type School = { name: string; address: string };

// 인스턴스 메모리 캐시(질의→결과, TTL). 비인증 공개 엔드포인트라 외부 NEIS 호출
// 폭주를 막기 위함 — 동일 질의는 워밍된 인스턴스에서 외부 fetch 없이 반환한다.
const schoolCache = new Map<string, { at: number; schools: School[] }>();
const SCHOOL_CACHE_TTL = 30 * 60 * 1000; // 30분

export const searchSchools = onCall(
  { maxInstances: 10 },
  async (req): Promise<{ schools: School[] }> => {
    try {
      const { query } = (req.data ?? {}) as { query?: string };
      const q = (query ?? "").trim();
      // 길이 제한: 너무 짧거나(노이즈) 너무 긴(남용) 질의는 외부 호출 없이 컷.
      if (q.length < 2 || q.length > 30) return { schools: [] };
      const cacheKey = q.toLowerCase();
      const cached = schoolCache.get(cacheKey);
      if (cached && Date.now() - cached.at < SCHOOL_CACHE_TTL) {
        return { schools: cached.schools };
      }
      const key = process.env.NEIS_API_KEY || "";
      let url =
        "https://open.neis.go.kr/hub/schoolInfo?Type=json&pIndex=1&pSize=15" +
        `&SCHUL_NM=${encodeURIComponent(q)}`;
      if (key) url += `&KEY=${key}`;
      const resp = await fetch(url);
      const json = (await resp.json()) as {
        schoolInfo?: Array<{ row?: Array<Record<string, string>> }>;
      };
      const rows = json.schoolInfo?.[1]?.row ?? [];
      const schools: School[] = rows
        .map((r) => ({
          name: r.SCHUL_NM ?? "",
          address: r.ORG_RDNMA ?? r.ORG_RDNMZC ?? "",
        }))
        .filter((s) => s.name.length > 0)
        .slice(0, 15);
      schoolCache.set(cacheKey, { at: Date.now(), schools });
      return { schools };
    } catch {
      return { schools: [] };
    }
  }
);

/* ---------- 공유 지식맵 발행 (서버사이드 PII 제거) ---------- *
 * 클라이언트가 shares 에 직접 쓰지 못하게 하고(rules: create/update = false),
 * 이 함수만 admin 권한으로 노드의 sources(학생 uid)를 제거해 발행한다.
 * → 변조된 클라이언트가 식별정보를 담아 월드리더블 문서를 만드는 경로 차단. */
export const publishShare = onCall(
  async (req): Promise<{ id: string }> => {
    if (!req.auth) {
      throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
    }
    const fdb = getFirestore();
    const userDoc = await fdb.doc(`users/${req.auth.uid}`).get();
    if ((userDoc.data()?.role as string) !== "teacher") {
      throw new HttpsError("permission-denied", "교사만 발행할 수 있습니다.");
    }
    const { ontology, title } = (req.data ?? {}) as {
      ontology?: {
        nodes?: Array<Record<string, unknown>>;
        edges?: Array<Record<string, unknown>>;
      } & Record<string, unknown>;
      title?: string;
    };
    if (!ontology || typeof ontology !== "object") {
      throw new HttpsError("invalid-argument", "온톨로지가 필요합니다.");
    }
    const nodes = Array.isArray(ontology.nodes) ? ontology.nodes : [];
    const sanitizedNodes = nodes.map((n) => {
      const { sources, ...rest } = n as {
        sources?: unknown[];
      } & Record<string, unknown>;
      return {
        ...rest,
        sourceCount:
          (rest.sourceCount as number) ??
          (Array.isArray(sources) ? sources.length : 0),
      };
    });
    const sanitized = { ...ontology, nodes: sanitizedNodes };
    const ref = fdb.collection("shares").doc();
    await ref.set({
      ownerUid: req.auth.uid,
      title: String(title ?? "지식맵").slice(0, 200),
      ontology: sanitized,
      createdAt: FieldValue.serverTimestamp(),
    });
    return { id: ref.id };
  }
);

/**
 * 다른 반 칭찬 — 받는 반 학생 이름 자동완성.
 * 보안: 호출자가 (a)실제 멤버인 출처 반이 있고, (b)그 출처 반의 칭찬 허용 목록
 * (control/crossPraise.allowedCids)에 targetCid 가 포함될 때만 허용.
 * 반환은 학생 표시이름(displayName)만 — uid·민감정보는 노출하지 않으며,
 * 입력 접두사(prefix)와 일치하는 최대 8명으로 제한해 명단 일괄 열람을 막는다.
 */
export const suggestCrossPraiseNames = onCall(
  { region: "asia-northeast3", memory: "256MiB" },
  async (req): Promise<{ names: string[] }> => {
    if (!req.auth) {
      throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
    }
    const uid = req.auth.uid;
    const { targetCid, prefix } = (req.data ?? {}) as {
      targetCid?: string;
      prefix?: string;
    };
    const q = (prefix ?? "").trim();
    // 최소 2글자 접두사만 허용 — 1글자 질의로 명단 전체를 쓸어담는 enumeration 차단.
    if (!targetCid || typeof targetCid !== "string" || q.length < 2) {
      return { names: [] };
    }

    const fdb = getFirestore();

    // 호출 빈도 제한(uid·IP, 10분 창) — 접두사 스윕으로 명단을 수집하는 시도 차단.
    const ipKey = clientIpKey(req);
    const [uidRl, ipRl] = await Promise.all([
      makeRateLimiter(`xpsug_uid_${uid}`, 10 * 60 * 1000, 80),
      makeRateLimiter(`xpsug_ip_${ipKey}`, 10 * 60 * 1000, 200),
    ]);
    if (uidRl.blocked || ipRl.blocked) {
      throw new HttpsError(
        "resource-exhausted",
        "검색이 너무 잦습니다. 잠시 후 다시 시도해 주세요."
      );
    }
    await Promise.all([uidRl.bumpFail(), ipRl.bumpFail()]);

    // 호출자의 학급 목록(본인 user 문서) → 각 출처 반의 멤버십·허용목록 검증.
    const userSnap = await fdb.doc(`users/${uid}`).get();
    const classIds = (userSnap.data()?.classIds as string[] | undefined) ?? [];
    if (classIds.length === 0) {
      throw new HttpsError("permission-denied", "연결된 학급이 없습니다.");
    }

    let allowed = false;
    // 읽기 증폭 방어: 검사할 출처 반 수를 제한(정상 학생은 소수의 학급에만 속함).
    for (const src of classIds.slice(0, 30)) {
      if (typeof src !== "string" || src === targetCid) continue;
      // 출처 반의 실제 멤버인지(스푸핑 차단) 먼저 확인.
      const memberSnap = await fdb.doc(`classes/${src}/members/${uid}`).get();
      if (!memberSnap.exists) continue;
      // 그 반이 targetCid 를 칭찬 허용 목록에 넣었는지 확인.
      const crossSnap = await fdb.doc(`classes/${src}/control/crossPraise`).get();
      const cross = crossSnap.data() as { allowedCids?: string[] } | undefined;
      const allowedCids = cross?.allowedCids ?? [];
      if (allowedCids.includes(targetCid)) {
        allowed = true;
        break;
      }
    }
    if (!allowed) {
      throw new HttpsError(
        "permission-denied",
        "이 반에 칭찬을 보낼 권한이 없습니다."
      );
    }

    // 받는 반 학생 이름 매칭 — 입력한 접두사로 "시작하는" 이름만(부분일치 금지).
    // 부분일치를 막아 한 글자/짧은 조각으로 명단을 역추적하는 것을 더 어렵게 한다.
    const membersSnap = await fdb
      .collection(`classes/${targetCid}/members`)
      .get();
    const lower = q.toLowerCase();
    const names = membersSnap.docs
      .map((d) => d.data())
      .filter((m) => (m.role ?? "student") === "student")
      .map((m) => String(m.displayName ?? "").trim())
      .filter((n) => n && n.toLowerCase().startsWith(lower));
    // 중복 제거 후 가나다순, 최대 6명.
    const ranked = Array.from(new Set(names)).sort((a, b) =>
      a.localeCompare(b, "ko")
    );
    return { names: ranked.slice(0, 6) };
  }
);

/* ===================================================================== *
 *  만보 트레이딩 — 학생 모의 주식투자 (토스증권 Open API 시세, 실거래 없음)
 *  · 시세/캔들은 refreshTradingPrices 가 전역 스로틀로 토스 API 를 묶어 갱신하고,
 *    tradingPrices/current · tradingCandles/{symbol} 캐시에만 쓴다(클라 읽기 전용).
 *  · 매수/매도는 executeTrade 가 트랜잭션으로 원자 처리 — 개장시간·캐시시세·잔액을
 *    서버가 재검증하고, tradeId 로 멱등을 보장한다. 지갑 원장은 상점 구매와 동일 의미
 *    (매수=spend, 매도=earn)로 balance = earned - spent 불변식을 유지한다.
 *  · 소스 오브 트루스: src/lib/trading.ts (컬렉션/타입/환산 규칙). 서버는 그 계약을 재현.
 *  주의: 토스 access token 은 client 당 1개만 유효(재발급 시 기존 즉시 무효) →
 *        tradingMeta/token 에 캐시·공유하고, 발급은 refresh 스로틀 클레임으로 단일화한다.
 * ===================================================================== */

// 종목 유니버스(10종목 고정) — trading.ts 의 TRADING_STOCKS 와 동일 심볼 집합(서버 중복 정의).
const TRADING_SYMBOLS = [
  "005930",
  "011200",
  "035420",
  "005380",
  "042660",
  "010950",
  "277810",
  "373220",
  "012450",
  "000250",
] as const;
const TRADING_SYMBOL_SET = new Set<string>(TRADING_SYMBOLS);
// 학생 노출용 별칭 — trading.ts TRADING_STOCKS 의 alias 와 동일(지갑 로그 등 표기용).
const TRADING_ALIAS: Record<string, string> = {
  "005930": "만보전자",
  "011200": "만보해운",
  "035420": "잠이버",
  "005380": "만보차",
  "042660": "만보오션",
  "010950": "J-Oil",
  "277810": "JMB로보틱스",
  "373220": "만보에너지솔루션",
  "012450": "만보에어로스페이스",
  "000250": "만보당제약",
};

const TOSS_BASE = "https://openapi.tossinvest.com";
const TRADING_MB_DIVISOR = 2000; // 기본 배율 — mbPrice = floor(실제가격 / divisor)
// 종목별 배율 오버라이드 — trading.ts TRADING_STOCKS[].mbDivisor 와 동일(서버 중복 정의).
// 저가주(만보해운)는 2000 그대로면 하루 등락이 반올림에 묻혀 시세가 안 움직이는 것처럼 보여 낮췄다.
const TRADING_MB_DIVISOR_OVERRIDE: Record<string, number> = {
  "011200": 500, // 만보해운(HMM)
  "012450": 3000, // 만보에어로스페이스(한화에어로스페이스) — 고가주라 배율을 높임
  "000250": 1500, // 만보당제약(삼천당제약)
};
function mbDivisorFor(symbol: string): number {
  return TRADING_MB_DIVISOR_OVERRIDE[symbol] ?? TRADING_MB_DIVISOR;
}
const TRADING_KST_OFFSET_MS = 9 * 60 * 60 * 1000; // KST 고정(+09:00, DST 없음)
const PRICES_THROTTLE_MS = 60 * 1000; // 시세 60초
const CANDLES_THROTTLE_MS = 60 * 60 * 1000; // 캔들 1시간
const PRICE_STALE_MS = 30 * 60 * 1000; // 거래 시 시세 최대 허용 지연 30분
const TOKEN_REFRESH_LEAD_MS = 30 * 60 * 1000; // 만료 30분 전부터 재발급

// 거래 수수료 — trading.ts TRADE_FEE_RATE/tradeFee 와 동일 규칙(서버 중복 정의).
// 잦은 매매가 손해라는 걸 체감하도록 아주 작은 비용을 매긴다(매수: 청구액에 가산, 매도: 지급액에서 차감).
const TRADE_FEE_RATE = 0.005;
const TRADE_FEE_MIN = 1;
function tradeFee(subtotal: number): number {
  if (subtotal <= 0) return 0;
  return Math.max(TRADE_FEE_MIN, Math.round(subtotal * TRADE_FEE_RATE));
}

type ServerCandle = { t: number; o: number; h: number; l: number; c: number; v: number };

/** KST 기준 일자 키(00:00 경계) — prevClose "오늘 캔들 제외" 판단용. */
function kstDayKey(ms: number): number {
  return Math.floor((ms + TRADING_KST_OFFSET_MS) / 86400000);
}

/** "HH:mm" → 분. trading.ts hmToMin 과 동일. */
function tradingHmToMin(hm: string): number {
  const [h, m] = String(hm).split(":").map((n) => parseInt(n, 10));
  return (h || 0) * 60 + (m || 0);
}

type ServerTradingConfig = {
  enabled: boolean;
  weekly: Array<{ day: number; start: string; end: string }>;
  sessions: Array<{ start: number; end: number }>;
  /** 교사 즉시 오버라이드 — "open"=즉시 개장, "closed"=킬스위치, null=시간표대로 */
  override: "open" | "closed" | null;
};

// 실제 KRX 장 운영시간 — 평일 09:00~15:30(KST). trading.ts KRX_OPEN_MIN/KRX_CLOSE_MIN 과 동일.
const KRX_OPEN_MIN = 9 * 60;
const KRX_CLOSE_MIN = 15 * 60 + 30;

/** 지금이 실제 KRX 정규장 시간인가 — trading.ts isRealMarketOpen 과 동일 로직. */
function isRealMarketOpenServer(now: number): boolean {
  const kst = new Date(now + TRADING_KST_OFFSET_MS);
  const day = kst.getUTCDay();
  if (day === 0 || day === 6) return false;
  const min = kst.getUTCHours() * 60 + kst.getUTCMinutes();
  return min >= KRX_OPEN_MIN && min < KRX_CLOSE_MIN;
}

/**
 * 개장 여부 — trading.ts isTradingOpen 과 동일 로직(KST 고정). 서버 재검증용.
 * 실제 KRX 장 시간(평일 09:00~15:30) 밖이면 교사 오버라이드(open)도 커스텀 시간표도 못 이긴다.
 */
function isTradingOpenServer(cfg: ServerTradingConfig | null, now: number): boolean {
  const c: ServerTradingConfig = cfg ?? { enabled: false, weekly: [], sessions: [], override: null };
  if (c.override === "closed") return false;
  if (!isRealMarketOpenServer(now)) return false;
  if (c.override === "open") return true;
  if (!c.enabled) return true;
  if ((c.sessions ?? []).some((s) => now >= s.start && now <= s.end)) return true;
  const kst = new Date(now + TRADING_KST_OFFSET_MS);
  const day = kst.getUTCDay();
  const min = kst.getUTCHours() * 60 + kst.getUTCMinutes();
  return (c.weekly ?? []).some(
    (w) => w.day === day && min >= tradingHmToMin(w.start) && min < tradingHmToMin(w.end)
  );
}

/**
 * 토스 access token 확보 — tradingMeta/token 캐시 우선.
 * 유효(만료 30분 전 이전)하면 캐시 반환, 아니면 재발급 후 캐시에 저장.
 * client 당 토큰 1개 규칙 → 발급 폭주 방지는 refresh 스로틀 클레임(단일 caller)이 담당한다.
 */
async function getTossToken(
  clientId: string,
  clientSecret: string,
  forceRefresh: boolean
): Promise<string> {
  const fdb = getFirestore();
  const tokenRef = fdb.doc("tradingMeta/token");
  if (!forceRefresh) {
    const snap = await tokenRef.get();
    const d = snap.data() as { token?: string; expiresAt?: number } | undefined;
    if (d?.token && typeof d.expiresAt === "number" && d.expiresAt - Date.now() > TOKEN_REFRESH_LEAD_MS) {
      return d.token;
    }
  }
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
  });
  const res = await fetch(`${TOSS_BASE}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    const t = await res.text();
    console.error("[trading] 토큰 발급 실패", res.status, t.slice(0, 500));
    throw new HttpsError("internal", `토스 토큰 발급 오류 (${res.status}): ${t.slice(0, 200)}`);
  }
  const j = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!j.access_token) {
    throw new HttpsError("internal", "토스 토큰 응답이 올바르지 않습니다.");
  }
  const expiresIn = typeof j.expires_in === "number" ? j.expires_in : 86399;
  await tokenRef.set(
    { token: j.access_token, expiresAt: Date.now() + expiresIn * 1000, updatedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );
  return j.access_token;
}

/**
 * 토스 GET 호출(Bearer). 401 이면 토큰 1회 강제 재발급 후 재시도.
 * 응답 gzip 은 Node 18+ fetch 가 자동 해제한다.
 */
async function tossGet(
  path: string,
  clientId: string,
  clientSecret: string
): Promise<unknown> {
  let token = await getTossToken(clientId, clientSecret, false);
  let res = await fetch(`${TOSS_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) {
    token = await getTossToken(clientId, clientSecret, true);
    res = await fetch(`${TOSS_BASE}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  }
  if (!res.ok) {
    const t = await res.text();
    console.error("[trading] 시세 조회 실패", path, res.status, t.slice(0, 500));
    throw new HttpsError("internal", `토스 시세 조회 오류 (${res.status}): ${t.slice(0, 200)}`);
  }
  return res.json();
}

/** 캔들 응답 파싱 → ServerCandle[](최신순, 문자열 필드 parseFloat). */
function parseCandles(payload: unknown): ServerCandle[] {
  const result = (payload as { result?: { candles?: unknown[] } })?.result;
  const rows = Array.isArray(result?.candles) ? result!.candles! : [];
  const out: ServerCandle[] = [];
  for (const r of rows) {
    const c = r as Record<string, string>;
    const t = Date.parse(c.timestamp ?? "");
    if (!Number.isFinite(t)) continue;
    out.push({
      t,
      o: parseFloat(c.openPrice ?? "0") || 0,
      h: parseFloat(c.highPrice ?? "0") || 0,
      l: parseFloat(c.lowPrice ?? "0") || 0,
      c: parseFloat(c.closePrice ?? "0") || 0,
      v: parseFloat(c.volume ?? "0") || 0,
    });
  }
  return out.slice(0, 260);
}

// 야후 파이낸스 심볼 매핑 — 토스가 IP 허용 목록으로 서버 호출을 차단할 때의 폴백 시세.
// (토스 Open API 는 개별 IP 만 등록 가능해 egress IP 가 유동적인 Cloud Functions 에서 차단됨)
const TRADING_YAHOO: Record<string, string> = {
  "005930": "005930.KS",
  "011200": "011200.KS",
  "035420": "035420.KS",
  "005380": "005380.KS",
  "042660": "042660.KS",
  "010950": "010950.KS",
  "277810": "277810.KQ", // 코스닥
  "373220": "373220.KS",
  "012450": "012450.KS",
  "000250": "000250.KQ", // 코스닥
};

/** 야후 차트 API — 현재가(15~20분 지연)+전일종가+일봉 최대 1년치를 한 번에. */
async function fetchYahooChart(
  ySym: string
): Promise<{ lastPrice: number; prevClose: number; candles: ServerCandle[] }> {
  const res = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ySym)}?interval=1d&range=1y`,
    { headers: { "User-Agent": "Mozilla/5.0 (jamclass-trading)" } }
  );
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`야후 시세 조회 실패 ${ySym} (${res.status}): ${t.slice(0, 200)}`);
  }
  const j = (await res.json()) as {
    chart?: {
      result?: Array<{
        meta?: {
          regularMarketPrice?: number;
          regularMarketPreviousClose?: number;
          chartPreviousClose?: number;
        };
        timestamp?: number[];
        indicators?: {
          quote?: Array<{
            open?: Array<number | null>;
            high?: Array<number | null>;
            low?: Array<number | null>;
            close?: Array<number | null>;
            volume?: Array<number | null>;
          }>;
        };
      }>;
    };
  };
  const r = j.chart?.result?.[0];
  const meta = r?.meta;
  const ts = r?.timestamp ?? [];
  const q = r?.indicators?.quote?.[0] ?? {};
  const candles: ServerCandle[] = [];
  for (let i = ts.length - 1; i >= 0 && candles.length < 260; i--) {
    const c = q.close?.[i];
    if (c == null || !Number.isFinite(c)) continue;
    candles.push({
      t: ts[i] * 1000,
      o: q.open?.[i] ?? c,
      h: q.high?.[i] ?? c,
      l: q.low?.[i] ?? c,
      c,
      v: q.volume?.[i] ?? 0,
    });
  }
  const lastPrice = Number(meta?.regularMarketPrice) || candles[0]?.c || 0;
  // 전일 종가 — 캔들 기준(최신 캔들이 오늘이면 그 전 캔들). 야후 chartPreviousClose 는
  // "조회 범위 직전"(여기선 한 달 전) 종가라 등락률 계산에 쓰면 안 된다.
  let prevClose = lastPrice;
  if (candles.length > 0) {
    const latestIsToday = kstDayKey(candles[0].t) === kstDayKey(Date.now());
    prevClose = latestIsToday && candles.length >= 2 ? candles[1].c : candles[0].c;
  }
  const metaPrev = Number(meta?.regularMarketPreviousClose);
  if (Number.isFinite(metaPrev) && metaPrev > 0) prevClose = metaPrev;
  // 휴장 중엔 lastPrice ≈ 직전 종가라 등락률이 0 이 된다(부동소수 오차 존재)
  // → 마지막 거래일의 등락을 보여준다.
  if (
    candles.length >= 2 &&
    Math.abs(lastPrice - prevClose) / (prevClose || 1) < 0.0001
  ) {
    prevClose = candles[1].c;
  }
  return { lastPrice, prevClose, candles };
}

// 시장 지수 7종 — 트레이딩 상단 요약용. 학생 표시명(잠스피 등)은 클라이언트가 매핑.
// 지수는 학생이 거래하지 않으므로 지연 무관 → 항상 야후에서 조회(토스 IP 차단과 무관).
const MARKET_YAHOO: Record<string, string> = {
  kospi: "^KS11",
  kosdaq: "^KQ11",
  nasdaq: "^IXIC",
  dow: "^DJI",
  nikkei: "^N225",
  usdkrw: "KRW=X",
  vix: "^VIX",
};

/** 시장 지수 갱신 — 실패해도 종목 시세 갱신을 막지 않는다(로그만). */
async function refreshMarketIndicesSafe(fdb: FirebaseFirestore.Firestore): Promise<void> {
  try {
    const indices: Record<
      string,
      { value: number; changePct: number; spark: number[] }
    > = {};
    // 지수 5종도 병렬로 — 순차 호출은 종목 시세 갱신 앞에 그대로 지연을 쌓는다.
    const entries = await Promise.all(
      Object.entries(MARKET_YAHOO).map(async ([key, ySym]) => {
        const y = await fetchYahooChart(ySym);
        return { key, y };
      })
    );
    for (const { key, y } of entries) {
      // 스파크라인: 오래된→최신 순 종가 최근 30개
      const spark = [...y.candles].reverse().map((c) => c.c).slice(-30);
      indices[key] = {
        value: y.lastPrice,
        changePct:
          y.prevClose > 0 ? ((y.lastPrice - y.prevClose) / y.prevClose) * 100 : 0,
        spark,
      };
    }
    await fdb.doc("tradingPrices/market").set({
      updatedAt: FieldValue.serverTimestamp(),
      indices,
    });
  } catch (e) {
    console.error("[trading] 시장 지수 갱신 실패(무시)", e);
  }
}

/**
 * 시세 새로고침 — 로그인 사용자 누구나 호출(학급 무관).
 * 전역 스로틀(tradingMeta/refresh)을 트랜잭션으로 원자 클레임 → 동시 호출이 몰려도
 * 한 명만 실제 외부 API 를 때린다(토큰 발급도 자연히 단일화). 갱신할 게 없으면 즉시 반환.
 * 시세 출처는 토스(실시간) 우선, 토스가 IP 차단 등으로 실패하면 야후(지연) 폴백.
 */
export const refreshTradingPrices = onCall(
  { secrets: [TOSS_CLIENT_ID, TOSS_CLIENT_SECRET], memory: "256MiB" },
  async (req): Promise<{ ok: true; refreshed: boolean }> => {
    if (!req.auth) {
      throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
    }
    const fdb = getFirestore();
    const refreshRef = fdb.doc("tradingMeta/refresh");
    const now = Date.now();

    // 스로틀 클레임(원자) — 갱신 대상을 이 호출이 선점한다.
    const claim = await fdb.runTransaction(async (tx) => {
      const snap = await tx.get(refreshRef);
      const d = (snap.data() as { pricesAt?: number; candlesAt?: number } | undefined) ?? {};
      const prevPricesAt = typeof d.pricesAt === "number" ? d.pricesAt : 0;
      const prevCandlesAt = typeof d.candlesAt === "number" ? d.candlesAt : 0;
      const doPrices = now - prevPricesAt >= PRICES_THROTTLE_MS;
      const doCandles = now - prevCandlesAt >= CANDLES_THROTTLE_MS;
      if (doPrices || doCandles) {
        const upd: Record<string, number> = {};
        if (doPrices) upd.pricesAt = now;
        if (doCandles) upd.candlesAt = now;
        tx.set(refreshRef, upd, { merge: true });
      }
      return { doPrices, doCandles, prevPricesAt, prevCandlesAt };
    });

    if (!claim.doPrices && !claim.doCandles) {
      return { ok: true, refreshed: false };
    }

    // 시장 지수(잠스피 등)는 종목 시세와 같은 60초 주기로, 출처는 항상 야후.
    if (claim.doPrices) {
      await refreshMarketIndicesSafe(fdb);
    }

    const clientId = TOSS_CLIENT_ID.value();
    const clientSecret = TOSS_CLIENT_SECRET.value();
    if (!clientId || !clientSecret) {
      // 자격증명 미설정 — 선점한 클레임을 되돌려 다음 호출이 재시도할 수 있게 한다.
      await refreshRef.set(
        { pricesAt: claim.prevPricesAt, candlesAt: claim.prevCandlesAt },
        { merge: true }
      );
      throw new HttpsError("failed-precondition", "시세 서비스가 아직 설정되지 않았습니다.");
    }

    try {
      // 캔들 먼저(prevClose 계산에 필요). 갱신 대상이면 메모리에 보관해 재사용.
      const candlesBySymbol: Record<string, ServerCandle[]> = {};
      if (claim.doCandles) {
        for (const symbol of TRADING_SYMBOLS) {
          const payload = await tossGet(
            `/api/v1/candles?symbol=${symbol}&interval=1d&count=200`,
            clientId,
            clientSecret
          );
          const candles = parseCandles(payload);
          candlesBySymbol[symbol] = candles;
          await fdb.doc(`tradingCandles/${symbol}`).set({
            updatedAt: FieldValue.serverTimestamp(),
            candles,
          });
        }
      }

      if (claim.doPrices) {
        const payload = await tossGet(
          `/api/v1/prices?symbols=${TRADING_SYMBOLS.join(",")}`,
          clientId,
          clientSecret
        );
        const rows = (payload as { result?: unknown[] })?.result;
        const priceBySymbol: Record<string, number> = {};
        if (Array.isArray(rows)) {
          for (const r of rows) {
            const row = r as { symbol?: string; lastPrice?: string };
            if (row.symbol && TRADING_SYMBOL_SET.has(row.symbol)) {
              priceBySymbol[row.symbol] = parseFloat(row.lastPrice ?? "0") || 0;
            }
          }
        }

        const stocks: Record<
          string,
          { lastPrice: number; mbPrice: number; prevClose: number; changePct: number }
        > = {};
        for (const symbol of TRADING_SYMBOLS) {
          const lastPrice = priceBySymbol[symbol] ?? 0;
          // 캔들: 이번에 갱신했으면 메모리, 아니면 캐시 문서에서 읽어 prevClose 계산.
          let candles = candlesBySymbol[symbol];
          if (!candles) {
            const cSnap = await fdb.doc(`tradingCandles/${symbol}`).get();
            candles = (cSnap.data()?.candles as ServerCandle[]) ?? [];
          }
          let prevClose = lastPrice;
          if (candles.length > 0) {
            const latestIsToday = kstDayKey(candles[0].t) === kstDayKey(now);
            prevClose =
              latestIsToday && candles.length >= 2 ? candles[1].c : candles[0].c;
          }
          const changePct =
            prevClose > 0 ? ((lastPrice - prevClose) / prevClose) * 100 : 0;
          stocks[symbol] = {
            lastPrice,
            mbPrice: Math.floor(lastPrice / mbDivisorFor(symbol)),
            prevClose,
            changePct,
          };
        }

        await fdb.doc("tradingPrices/current").set({
          updatedAt: FieldValue.serverTimestamp(),
          source: "toss",
          stocks,
        });
      }

      return { ok: true, refreshed: true };
    } catch (tossErr) {
      // 토스 실패(대표: 허용 IP 차단 403 — 개별 IP만 등록 가능해 서버 egress 가 막힘)
      // → 야후 폴백(15~20분 지연)으로 같은 캐시 문서를 채운다.
      console.error("[trading] 토스 시세 실패 — 야후 폴백 시도", tossErr);
      try {
        // 종목별 야후 호출을 병렬로 — 순차로 하면 종목 수만큼 지연이 그대로 누적된다
        // (10종목 × 수백ms 이상 = 체감 지연). Promise.all 로 동시에 쏘고 한 번에 모은다.
        const yahooResults = await Promise.all(
          TRADING_SYMBOLS.map(async (symbol) => {
            const y = await fetchYahooChart(TRADING_YAHOO[symbol]);
            return { symbol, y };
          })
        );
        const stocks: Record<
          string,
          { lastPrice: number; mbPrice: number; prevClose: number; changePct: number }
        > = {};
        if (claim.doCandles) {
          await Promise.all(
            yahooResults.map(({ symbol, y }) =>
              fdb.doc(`tradingCandles/${symbol}`).set({
                updatedAt: FieldValue.serverTimestamp(),
                candles: y.candles,
              })
            )
          );
        }
        for (const { symbol, y } of yahooResults) {
          const changePct =
            y.prevClose > 0 ? ((y.lastPrice - y.prevClose) / y.prevClose) * 100 : 0;
          stocks[symbol] = {
            lastPrice: y.lastPrice,
            mbPrice: Math.floor(y.lastPrice / mbDivisorFor(symbol)),
            prevClose: y.prevClose,
            changePct,
          };
        }
        if (claim.doPrices) {
          await fdb.doc("tradingPrices/current").set({
            updatedAt: FieldValue.serverTimestamp(),
            source: "yahoo-delayed",
            stocks,
          });
        }
        return { ok: true, refreshed: true };
      } catch (err) {
        // 둘 다 실패 — 클레임 롤백 → 스로틀 창에 갇히지 않고 곧바로 재시도 가능하게.
        await refreshRef.set(
          { pricesAt: claim.prevPricesAt, candlesAt: claim.prevCandlesAt },
          { merge: true }
        );
        console.error("[trading] 시세 갱신 실패(야후 폴백 포함)", err);
        if (err instanceof HttpsError) throw err;
        throw new HttpsError("internal", "시세를 갱신하지 못했습니다.");
      }
    }
  }
);

/**
 * 우리 반 수익률 랭킹 — 학생용.
 *
 * 학생은 규칙상 남의 positions 문서를 읽을 수 없어 예전에는 클라이언트가 trades 를
 * 시간순 재생해 보유/평단을 복원했다. 그러나 trades 는 "체결 당시" 스냅샷이라
 * 종목의 만보 환산 배율(mbDivisor)이 바뀌면 옛 스케일로 굳어버려 현재 시세와 단위가
 * 어긋난다(예: 만보해운 배율 2000→500 변경 후 평단 10만보 vs 현재가 43만보 → 허위 +330%).
 * 그래서 정본인 positions 를 서버에서 직접 읽어 집계한다 — 교사용 '트레이딩 관리'
 * (TradingAdminModal BoardTab)와 완전히 같은 수식이라 두 화면이 항상 일치한다.
 *
 * 노출 범위: 이름·총손익·수익률만. 보유 종목/수량/잔액은 반환하지 않는다.
 */
export const getTradingRanking = onCall(
  { memory: "256MiB" },
  async (
    req
  ): Promise<{
    ok: true;
    rows: Array<{ uid: string; name: string; totalPnl: number; returnPct: number }>;
  }> => {
    if (!req.auth) {
      throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
    }
    const { cid } = (req.data ?? {}) as { cid?: string };
    if (!cid || typeof cid !== "string") {
      throw new HttpsError("invalid-argument", "cid 가 필요합니다.");
    }
    const uid = req.auth.uid;
    const fdb = getFirestore();

    // 권한: 학급 멤버만(교사도 members 문서를 가진다).
    const memberSnap = await fdb.doc(`classes/${cid}/members/${uid}`).get();
    if (!memberSnap.exists) {
      throw new HttpsError("permission-denied", "해당 학급의 멤버만 볼 수 있습니다.");
    }

    const [posSnap, priceSnap, memberList] = await Promise.all([
      fdb.collection(`classes/${cid}/positions`).get(),
      fdb.doc("tradingPrices/current").get(),
      fdb.collection(`classes/${cid}/members`).get(),
    ]);
    const stocks =
      (priceSnap.data()?.stocks as Record<string, { mbPrice?: number }>) ?? {};
    const nameOf = new Map<string, string>();
    for (const m of memberList.docs) {
      nameOf.set(m.id, (m.data()?.displayName as string) || "친구");
    }

    const rows = posSnap.docs
      .map((d) => {
        const holdings =
          (d.data()?.holdings as Record<string, { qty: number; avgCost: number }>) ?? {};
        const realized = (d.data()?.realized as number) ?? 0;
        let value = 0;
        let cost = 0;
        let held = 0;
        for (const [symbol, h] of Object.entries(holdings)) {
          if (!h || h.qty <= 0) continue;
          held++;
          value += (stocks[symbol]?.mbPrice ?? h.avgCost) * h.qty;
          cost += h.avgCost * h.qty;
        }
        const unrealized = value - cost;
        return {
          uid: d.id,
          name: nameOf.get(d.id) ?? "친구",
          totalPnl: realized + unrealized,
          // 교사용 '트레이딩 관리'와 동일: 지금 보유한 주식의 평가수익률.
          returnPct: cost > 0 ? (unrealized / cost) * 100 : 0,
          held,
          realized,
        };
      })
      .filter((r) => r.held > 0 || r.realized !== 0)
      .sort((a, b) => b.returnPct - a.returnPct)
      .map(({ uid: u, name, totalPnl, returnPct }) => ({
        uid: u,
        name,
        totalPnl,
        returnPct,
      }));

    return { ok: true, rows };
  }
);

/**
 * 매수/매도 실행 — 트랜잭션 원자 처리, tradeId 멱등.
 * 검증: 로그인·학급 멤버·심볼 유니버스·수량 1~10000·개장시간·캐시 시세(30분 이내).
 * 지갑(classes/{cid}/manbo/{uid}) 과 포지션(classes/{cid}/positions/{uid}) 을 함께 갱신하고
 * 체결을 classes/{cid}/trades/{tradeId} 에 스냅샷 기록한다.
 */
export const executeTrade = onCall(
  { memory: "256MiB" },
  async (
    req
  ): Promise<{
    ok: true;
    balance: number;
    position: {
      holdings: Record<string, { qty: number; avgCost: number }>;
      realized: number;
      updatedAt: number | null;
    };
  }> => {
    if (!req.auth) {
      throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
    }
    const { cid, symbol, side, qty, tradeId } = (req.data ?? {}) as {
      cid?: string;
      symbol?: string;
      side?: string;
      qty?: number;
      tradeId?: string;
    };
    if (!cid || typeof cid !== "string") {
      throw new HttpsError("invalid-argument", "cid 가 필요합니다.");
    }
    if (!symbol || !TRADING_SYMBOL_SET.has(symbol)) {
      throw new HttpsError("invalid-argument", "거래할 수 없는 종목입니다.");
    }
    if (side !== "buy" && side !== "sell") {
      throw new HttpsError("invalid-argument", "거래 유형이 올바르지 않습니다.");
    }
    if (!Number.isInteger(qty) || (qty as number) < 1 || (qty as number) > 10000) {
      throw new HttpsError("invalid-argument", "수량은 1~10000 사이의 정수여야 합니다.");
    }
    if (!tradeId || typeof tradeId !== "string") {
      throw new HttpsError("invalid-argument", "tradeId 가 필요합니다.");
    }
    const quantity = qty as number;
    const uid = req.auth.uid;
    const fdb = getFirestore();

    // 권한: 학급 멤버
    const memberSnap = await fdb.doc(`classes/${cid}/members/${uid}`).get();
    if (!memberSnap.exists) {
      throw new HttpsError("permission-denied", "해당 학급의 멤버만 거래할 수 있습니다.");
    }
    const token = req.auth.token as { name?: string };
    const traderName =
      (memberSnap.data()?.displayName as string) || token.name || "학생";

    // 개장 검증(서버 재검증)
    const now = Date.now();
    const cfgSnap = await fdb.doc(`classes/${cid}/trading/config`).get();
    const rawOverride = cfgSnap.data()?.override;
    const cfg = cfgSnap.exists
      ? ({
          enabled: (cfgSnap.data()?.enabled as boolean) ?? false,
          weekly: (cfgSnap.data()?.weekly as ServerTradingConfig["weekly"]) ?? [],
          sessions: (cfgSnap.data()?.sessions as ServerTradingConfig["sessions"]) ?? [],
          override:
            rawOverride === "open" || rawOverride === "closed" ? rawOverride : null,
        } as ServerTradingConfig)
      : null;
    if (!isTradingOpenServer(cfg, now)) {
      throw new HttpsError(
        "failed-precondition",
        "지금은 거래 시간이 아니에요. 개장 시간에 다시 시도해 주세요."
      );
    }

    // 캐시 시세 — 존재 + 30분 이내
    const pricesSnap = await fdb.doc("tradingPrices/current").get();
    if (!pricesSnap.exists) {
      throw new HttpsError("failed-precondition", "시세를 먼저 새로고침 해주세요.");
    }
    const pdata = pricesSnap.data() as {
      updatedAt?: { toMillis?: () => number };
      stocks?: Record<string, { mbPrice?: number }>;
    };
    const priceUpdatedAt = pdata.updatedAt?.toMillis ? pdata.updatedAt.toMillis() : 0;
    if (!priceUpdatedAt || now - priceUpdatedAt > PRICE_STALE_MS) {
      throw new HttpsError("failed-precondition", "시세를 먼저 새로고침 해주세요.");
    }
    const mbPrice = Math.floor((pdata.stocks?.[symbol]?.mbPrice as number) ?? 0);
    if (mbPrice < 1) {
      throw new HttpsError("failed-precondition", "지금은 이 종목을 거래할 수 없어요.");
    }

    const tradeRef = fdb.doc(`classes/${cid}/trades/${tradeId}`);
    const walletRef = fdb.doc(`classes/${cid}/manbo/${uid}`);
    const posRef = fdb.doc(`classes/${cid}/positions/${uid}`);
    const subtotal = mbPrice * quantity;
    const fee = tradeFee(subtotal);

    const result = await fdb.runTransaction(async (tx) => {
      // 모든 읽기를 쓰기보다 먼저.
      const tradeSnap = await tx.get(tradeRef);
      const walletSnap = await tx.get(walletRef);
      const posSnap = await tx.get(posRef);

      const balance = (walletSnap.data()?.balance as number) ?? 0;
      const holdings =
        (posSnap.data()?.holdings as Record<string, { qty: number; avgCost: number }>) ?? {};
      const realized = (posSnap.data()?.realized as number) ?? 0;

      // 멱등: 이미 체결된 tradeId → 현재 상태만 반환(중복 처리 방지).
      if (tradeSnap.exists) {
        return {
          balance,
          position: {
            holdings,
            realized,
            updatedAt: posSnap.data()?.updatedAt?.toMillis?.() ?? null,
          },
        };
      }

      const newHoldings: Record<string, { qty: number; avgCost: number }> = { ...holdings };
      let newBalance: number;
      let newRealized = realized;

      let total: number; // 실제 청구/지급액(만보) — 체결 스냅샷·클라 표시용

      if (side === "buy") {
        const chargeTotal = subtotal + fee;
        total = chargeTotal;
        if (balance < chargeTotal) {
          throw new HttpsError(
            "failed-precondition",
            `만보가 부족합니다. (필요 ${chargeTotal}, 보유 ${balance})`
          );
        }
        const cur = holdings[symbol] ?? { qty: 0, avgCost: 0 };
        const nextQty = cur.qty + quantity;
        // 가중평균 평단(만보) — 수수료를 원가에 포함해 "실제 낸 돈" 기준으로 손익을 계산한다.
        const nextAvg = (cur.avgCost * cur.qty + chargeTotal) / nextQty;
        newHoldings[symbol] = { qty: nextQty, avgCost: nextAvg };
        newBalance = balance - chargeTotal;

        tx.set(
          walletRef,
          {
            uid,
            balance: FieldValue.increment(-chargeTotal),
            spent: FieldValue.increment(chargeTotal),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
        tx.set(walletRef.collection("log").doc(), {
          type: "spend",
          amount: chargeTotal,
          reason: `트레이딩 매수: ${TRADING_ALIAS[symbol] ?? symbol} ${quantity}주 (수수료 ${fee}만보 포함)`,
          by: uid,
          at: FieldValue.serverTimestamp(),
        });
      } else {
        const cur = holdings[symbol];
        if (!cur || cur.qty < quantity) {
          throw new HttpsError("failed-precondition", "보유 수량이 부족합니다.");
        }
        const proceeds = Math.max(0, subtotal - fee);
        total = proceeds;
        newRealized = realized + (proceeds - cur.avgCost * quantity);
        const nextQty = cur.qty - quantity;
        if (nextQty === 0) {
          delete newHoldings[symbol];
        } else {
          newHoldings[symbol] = { qty: nextQty, avgCost: cur.avgCost };
        }
        newBalance = balance + proceeds;

        tx.set(
          walletRef,
          {
            uid,
            balance: FieldValue.increment(proceeds),
            earned: FieldValue.increment(proceeds),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
        tx.set(walletRef.collection("log").doc(), {
          type: "earn",
          amount: proceeds,
          reason: `트레이딩 매도: ${TRADING_ALIAS[symbol] ?? symbol} ${quantity}주 (수수료 ${fee}만보 차감)`,
          by: uid,
          at: FieldValue.serverTimestamp(),
        });
      }

      // 포지션: merge 없이 문서 전체 교체 — merge:true 는 맵을 깊은 병합하므로
      // 전량 매도로 제거된 심볼이 문서에 유령으로 남아 재매도(만보 복제)가 가능해진다.
      tx.set(posRef, {
        holdings: newHoldings,
        realized: newRealized,
        updatedAt: FieldValue.serverTimestamp(),
      });
      // 체결 스냅샷
      tx.set(tradeRef, {
        uid,
        name: traderName,
        symbol,
        side,
        qty: quantity,
        mbPrice,
        total,
        fee,
        at: FieldValue.serverTimestamp(),
      });

      return {
        balance: newBalance,
        position: { holdings: newHoldings, realized: newRealized, updatedAt: now },
      };
    });

    return { ok: true, balance: result.balance, position: result.position };
  }
);
