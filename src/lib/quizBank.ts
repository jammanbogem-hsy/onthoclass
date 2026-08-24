// 문제 은행 — 교사가 만든 문제 세트를 학급·학기와 무관하게 보관하고 재사용한다.
//
// 왜 학급 하위가 아니라 최상위 컬렉션인가:
//   퀴즈런 문제는 게임 문서 안에 저장되므로 "지난 게임에서 불러오기"는 같은 반
//   안에서만 된다. 6학년 1반에서 만든 문제를 2반에서 쓰려면 학급 바깥에 있어야
//   하고, 학기가 바뀌어 학급을 새로 만들어도 남아야 한다.
//   교사 소유(ownerUid) 최상위 컬렉션은 classGroups(폴더)가 이미 쓰는 방식이다.
//
// 경로: quizBank/{setId}  { ownerUid, name, subject, items, createdAt, updatedAt }
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { getDbClient } from "@/lib/firebase";
import type { QuizItem } from "@/lib/quizrun";

export type QuizBankSet = {
  id: string;
  ownerUid: string;
  name: string;
  /** 과목·단원 등 분류용 자유 문자열 (선택) */
  subject: string;
  items: QuizItem[];
  createdAt: number | null;
  updatedAt: number | null;
};

const bankCol = () => collection(getDbClient(), "quizBank");
const bankRef = (id: string) => doc(getDbClient(), "quizBank", id);

const randId = () => "qb_" + Math.random().toString(36).slice(2, 10);

/** 문제 세트를 은행에 저장. 반환 = setId */
export async function saveQuizSet(
  ownerUid: string,
  input: { name: string; subject?: string; items: QuizItem[] }
): Promise<string> {
  const id = randId();
  await setDoc(bankRef(id), {
    ownerUid,
    name: input.name.trim().slice(0, 100) || "이름 없는 세트",
    subject: (input.subject ?? "").trim().slice(0, 50),
    items: input.items,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return id;
}

/** 기존 세트 덮어쓰기 (이름·문항 수정) */
export async function updateQuizSet(
  id: string,
  patch: { name?: string; subject?: string; items?: QuizItem[] }
): Promise<void> {
  await updateDoc(bankRef(id), { ...patch, updatedAt: serverTimestamp() });
}

export async function deleteQuizSet(id: string): Promise<void> {
  await deleteDoc(bankRef(id));
}

/**
 * 내 문제 세트 목록 (최신순).
 *
 * 정렬은 클라이언트에서 한다 — ownerUid 필터 + createdAt 정렬을 서버에서 하려면
 * 복합 색인이 필요한데, 교사 한 명의 세트는 많아야 수십 개라 그럴 이유가 없다.
 */
export async function listMyQuizSets(
  ownerUid: string
): Promise<QuizBankSet[]> {
  const snap = await getDocs(
    query(bankCol(), where("ownerUid", "==", ownerUid))
  );
  const ts = (v: unknown) => {
    const t = v as { toMillis?: () => number } | undefined;
    return t?.toMillis ? t.toMillis() : null;
  };
  return snap.docs
    .map((d) => {
      const v = d.data();
      return {
        id: d.id,
        ownerUid: (v.ownerUid as string) ?? "",
        name: (v.name as string) ?? "",
        subject: (v.subject as string) ?? "",
        items: Array.isArray(v.items) ? (v.items as QuizItem[]) : [],
        createdAt: ts(v.createdAt),
        updatedAt: ts(v.updatedAt),
      };
    })
    .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
}
