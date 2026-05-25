// ⚠️ DEV 전용 — 사전/사후 설문 더미 데이터 시드.
// 배포(production) 빌드에서는 SurveyResult 의 NODE_ENV 게이트로 호출되지 않습니다.
// 테스트가 끝나면 이 파일과 SurveyResult 의 dev 패널을 함께 삭제하세요.
import {
  collection,
  deleteDoc,
  doc,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { getDbClient } from "@/lib/firebase";
import type { Phase, SurveyItem } from "@/lib/lessons";

const DUMMY_PREFIX = "dummy-";

// 25명 가상 학생 이름
const NAMES = [
  "김하준", "이서연", "박도윤", "최지우", "정시우",
  "강하은", "조주원", "윤예준", "장민서", "임수아",
  "한지호", "오유진", "서건우", "신채원", "권현우",
  "황다은", "안태양", "송지안", "전소율", "홍준서",
  "고은채", "문지율", "배승현", "유나윤", "남도현",
];

const sid = (i: number) => `${DUMMY_PREFIX}${String(i + 1).padStart(2, "0")}`;

// 재현 가능한 시드 RNG (mulberry32)
function rngFrom(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

// 사전/사후 주관식 텍스트 풀 — 사전은 망설임, 사후는 향상/자신감
const OPEN_PRE = [
  "아직 잘 모르겠어요.",
  "조금 어렵게 느껴져요.",
  "흥미는 있는데 자신은 없어요.",
  "들어본 적은 있지만 설명은 못 하겠어요.",
  "왜 중요한지 잘 와닿지 않아요.",
  "헷갈리는 부분이 많아요.",
];
const OPEN_POST = [
  "이제 이해가 훨씬 잘 돼요!",
  "수업 덕분에 자신감이 생겼어요.",
  "재미있어서 더 깊이 배우고 싶어요.",
  "친구에게 설명할 수 있을 것 같아요.",
  "어디에 쓰이는지 알게 돼서 좋았어요.",
  "예시를 들으니 확실히 정리됐어요.",
];

type StudentAnswers = {
  pre: Record<string, number | string>;
  post: Record<string, number | string>;
};

/** 학생 한 명의 사전/사후 응답 생성 — latent 성향 기반으로 사후가 향상되는 추세 */
function answersFor(
  index: number,
  items: SurveyItem[]
): StudentAnswers {
  const rnd = rngFrom(0xc0ffee + index * 2654435761);
  // latent: 이 학생의 기본 참여도(0~1) — 모든 척도 문항에 일관되게 영향
  const baseline = rnd();
  // 이 학생의 성장폭 성향(0~1)
  const growthBias = rnd();

  const pre: Record<string, number | string> = {};
  const post: Record<string, number | string> = {};

  items.forEach((it, qi) => {
    const r = rngFrom(0xabcd + index * 131 + qi * 7);
    if (it.type === "scale") {
      const max = it.scaleMax ?? 5;
      // 사전: 낮은~중간(2 + 성향), 문항별 약간의 노이즈
      const preRaw = 2 + baseline * 1.6 + (r() - 0.5) * 1.0;
      // 성장: 평균 +1.0 수준, 성향에 따라 가감 → 유의미하지만 자연스러운 추세
      const growth = 0.6 + growthBias * 1.1 + (r() - 0.5) * 0.7;
      const preV = clamp(Math.round(preRaw), 1, max);
      const postV = clamp(Math.round(preRaw + growth), 1, max);
      pre[it.id] = preV;
      post[it.id] = postV;
    } else if (it.type === "choice") {
      const opts = it.options ?? [];
      const m = opts.length;
      if (m === 0) {
        pre[it.id] = "";
        post[it.id] = "";
        return;
      }
      // 선택지가 뒤로 갈수록 '더 긍정적'이라 가정 → 사전은 앞쪽, 사후는 뒤쪽으로 이동
      const preIdx = clamp(
        Math.floor((0.1 + baseline * 0.4 + (r() - 0.5) * 0.2) * m),
        0,
        m - 1
      );
      const step = r() < 0.65 ? (r() < 0.4 ? 2 : 1) : 0;
      const postIdx = clamp(preIdx + step, 0, m - 1);
      pre[it.id] = opts[preIdx];
      post[it.id] = opts[postIdx];
    } else {
      // open
      pre[it.id] = OPEN_PRE[Math.floor(r() * OPEN_PRE.length)];
      post[it.id] = OPEN_POST[Math.floor(r() * OPEN_POST.length)];
    }
  });

  return { pre, post };
}

function subDoc(
  cid: string,
  lid: string,
  qid: string,
  studentUid: string
) {
  return doc(
    collection(
      getDbClient(),
      "classes",
      cid,
      "lessons",
      lid,
      "questions",
      qid,
      "submissions"
    ),
    studentUid
  );
}

function writeSub(
  cid: string,
  lid: string,
  qid: string,
  studentUid: string,
  name: string,
  phase: Phase,
  answers: Record<string, number | string>
) {
  return setDoc(subDoc(cid, lid, qid, studentUid), {
    uid: studentUid,
    studentName: name,
    phase,
    surveyAnswers: answers,
    content: "",
    submittedAt: serverTimestamp(),
  });
}

/** 사전(preQid)·사후(postQid)에 가상 학생 n명의 추세형 더미 응답을 주입 */
export async function seedSurveyDummies(opts: {
  cid: string;
  lid: string;
  preQid: string;
  postQid: string;
  items: SurveyItem[];
  n?: number;
}): Promise<{ n: number }> {
  const { cid, lid, preQid, postQid, items } = opts;
  const n = Math.min(opts.n ?? 25, NAMES.length);
  const writes: Promise<void>[] = [];
  for (let i = 0; i < n; i++) {
    const { pre, post } = answersFor(i, items);
    writes.push(writeSub(cid, lid, preQid, sid(i), NAMES[i], "pre", pre));
    writes.push(writeSub(cid, lid, postQid, sid(i), NAMES[i], "post", post));
  }
  await Promise.all(writes);
  return { n };
}

/** 주입했던 가상 학생 더미 제출을 사전·사후 양쪽에서 삭제 */
export async function clearSurveyDummies(opts: {
  cid: string;
  lid: string;
  preQid: string;
  postQid: string;
  n?: number;
}): Promise<void> {
  const { cid, lid, preQid, postQid } = opts;
  const n = Math.min(opts.n ?? 25, NAMES.length);
  const dels: Promise<void>[] = [];
  for (let i = 0; i < n; i++) {
    dels.push(deleteDoc(subDoc(cid, lid, preQid, sid(i))));
    dels.push(deleteDoc(subDoc(cid, lid, postQid, sid(i))));
  }
  await Promise.all(dels);
}
