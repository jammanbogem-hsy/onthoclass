import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { getDbClient, getStorageClient } from "@/lib/firebase";
import { compressImage } from "@/lib/upload";

export type Book7Submission = {
  uid: string;
  page1URL: string;
  page2URL: string;
  page1Caption: string;
  page2Caption: string;
  updatedAt: number | null;
};

function mapSubmission(id: string, value: Record<string, unknown>): Book7Submission {
  const timestamp = value.updatedAt as { toMillis?: () => number } | undefined;
  return {
    uid: (value.uid as string) || id,
    page1URL: (value.page1URL as string) || "",
    page2URL: (value.page2URL as string) || "",
    page1Caption: (value.page1Caption as string) || "",
    page2Caption: (value.page2Caption as string) || "",
    updatedAt: timestamp?.toMillis ? timestamp.toMillis() : null,
  };
}

/** 같은 학급의 Lesson 7 여름 앨범 제출물을 실시간으로 구독한다. */
export function watchBook7Submissions(
  classId: string,
  callback: (submissions: Book7Submission[]) => void
): () => void {
  return onSnapshot(
    collection(getDbClient(), "classes", classId, "book7Pages"),
    (snapshot) =>
      callback(
        snapshot.docs.map((item) =>
          mapSubmission(item.id, item.data() as Record<string, unknown>)
        )
      ),
    () => callback([])
  );
}

/** 학생 사진 두 장을 압축해 저장하고, 둘 다 성공한 뒤 책에 공개한다. */
export async function saveBook7Submission(args: {
  classId: string;
  uid: string;
  page1: File;
  page2: File;
  page1Caption: string;
  page2Caption: string;
}): Promise<void> {
  const { classId, uid, page1, page2, page1Caption, page2Caption } = args;
  const [first, second] = await Promise.all([
    compressImage(page1, 1800, 0.84),
    compressImage(page2, 1800, 0.84),
  ]);
  const storage = getStorageClient();
  const firstRef = ref(storage, `classes/${classId}/book7/${uid}/page-1.jpg`);
  const secondRef = ref(storage, `classes/${classId}/book7/${uid}/page-2.jpg`);

  await Promise.all([
    uploadBytes(firstRef, first, { contentType: "image/jpeg" }),
    uploadBytes(secondRef, second, { contentType: "image/jpeg" }),
  ]);
  const [page1URL, page2URL] = await Promise.all([
    getDownloadURL(firstRef),
    getDownloadURL(secondRef),
  ]);

  await setDoc(doc(getDbClient(), "classes", classId, "book7Pages", uid), {
    uid,
    page1URL,
    page2URL,
    page1Caption: page1Caption.trim(),
    page2Caption: page2Caption.trim(),
    updatedAt: serverTimestamp(),
  });
}

/** 기존 사진을 그대로 두고 영어 설명만 고친다. */
export async function saveBook7Captions(args: {
  classId: string;
  uid: string;
  page1Caption: string;
  page2Caption: string;
}): Promise<void> {
  await setDoc(
    doc(getDbClient(), "classes", args.classId, "book7Pages", args.uid),
    {
      page1Caption: args.page1Caption.trim(),
      page2Caption: args.page2Caption.trim(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export type Book7Note = {
  uid: string;
  text: string;
  mood: string;
  updatedAt: number | null;
};

function mapNote(id: string, value: Record<string, unknown>): Book7Note {
  const timestamp = value.updatedAt as { toMillis?: () => number } | undefined;
  return {
    uid: (value.uid as string) || id,
    text: (value.text as string) || "",
    mood: (value.mood as string) || "📝",
    updatedAt: timestamp?.toMillis ? timestamp.toMillis() : null,
  };
}

/** 바탕화면에 붙는 학생 소감(메모)을 실시간으로 구독한다. */
export function watchBook7Notes(
  classId: string,
  callback: (notes: Book7Note[]) => void
): () => void {
  return onSnapshot(
    collection(getDbClient(), "classes", classId, "book7Notes"),
    (snapshot) =>
      callback(
        snapshot.docs.map((item) => mapNote(item.id, item.data() as Record<string, unknown>))
      ),
    () => callback([])
  );
}

/** 한 사람당 메모 하나 — 다시 올리면 같은 자리에서 고쳐진다. */
export async function saveBook7Note(args: {
  classId: string;
  uid: string;
  text: string;
  mood: string;
}): Promise<void> {
  await setDoc(doc(getDbClient(), "classes", args.classId, "book7Notes", args.uid), {
    uid: args.uid,
    text: args.text.trim(),
    mood: args.mood,
    updatedAt: serverTimestamp(),
  });
}

/** 내 메모를 바탕화면에서 치운다(교사는 아무 메모나 치울 수 있다). */
export async function deleteBook7Note(classId: string, uid: string): Promise<void> {
  await deleteDoc(doc(getDbClient(), "classes", classId, "book7Notes", uid));
}
