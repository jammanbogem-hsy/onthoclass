// 제출 첨부(사진/음성) 업로드 헬퍼
// - 사진은 업로드 전 캔버스로 리사이즈+압축해 용량/비용을 크게 줄인다.
// - Storage 경로: classes/{cid}/lessons/{lid}/questions/{qid}/submissions/{uid}/{id}.{ext}
import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytes,
} from "firebase/storage";
import { getStorageClient } from "@/lib/firebase";
import type { Attachment } from "@/lib/lessons";

function randId() {
  return "at_" + Math.random().toString(36).slice(2, 10);
}

/** 이미지를 긴 변 maxDim 이하로 리사이즈하고 JPEG 로 압축한 Blob 을 반환 */
export async function compressImage(
  file: File,
  maxDim = 1280,
  quality = 0.72
): Promise<Blob> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error("이미지를 불러올 수 없습니다."));
    im.src = dataUrl;
  });
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file; // 캔버스 미지원 시 원본
  ctx.drawImage(img, 0, 0, w, h);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/jpeg", quality)
  );
  return blob ?? file;
}

type FileArgs = {
  type: "image" | "audio";
  /** 원본 파일(사진) 또는 녹음 Blob(음성) */
  data: File | Blob;
  name: string;
  durationMs?: number;
};

/** 임의 경로 prefix 아래로 첨부 1개 업로드(사진은 압축) → Attachment 반환 */
async function uploadTo(
  prefix: string,
  { type, data, name, durationMs }: FileArgs
): Promise<Attachment> {
  let blob: Blob = data;
  let ext = "bin";
  if (type === "image") {
    blob = data instanceof File ? await compressImage(data) : data;
    ext = "jpg";
  } else {
    // 음성: webm/opus 기본. mime 에서 확장자 추출
    ext = (blob.type.split("/")[1] || "webm").split(";")[0];
  }
  const id = randId();
  const path = `${prefix}/${id}.${ext}`;
  const r = ref(getStorageClient(), path);
  await uploadBytes(r, blob, {
    contentType: blob.type || (type === "image" ? "image/jpeg" : "audio/webm"),
  });
  const url = await getDownloadURL(r);
  return {
    id,
    type,
    url,
    path,
    name,
    size: blob.size,
    ...(durationMs ? { durationMs } : {}),
  };
}

/** 질문 제출 첨부 업로드 */
export function uploadSubmissionAttachment(args: {
  cid: string;
  lid: string;
  qid: string;
  uid: string;
} & FileArgs): Promise<Attachment> {
  const { cid, lid, qid, uid, ...file } = args;
  return uploadTo(
    `classes/${cid}/lessons/${lid}/questions/${qid}/submissions/${uid}`,
    file
  );
}

/** 보드(캔버스) 카드 첨부 업로드 */
export function uploadCanvasAttachment(args: {
  cid: string;
  uid: string;
} & FileArgs): Promise<Attachment> {
  const { cid, uid, ...file } = args;
  return uploadTo(`classes/${cid}/canvas/${uid}`, file);
}

/** 피드백/오류 보고 사진 첨부 업로드 */
export function uploadFeedbackAttachment(args: {
  cid: string;
  uid: string;
  fid: string;
} & FileArgs): Promise<Attachment> {
  const { cid, uid, fid, ...file } = args;
  return uploadTo(`classes/${cid}/feedback/${uid}/${fid}`, file);
}

/** 첨부 삭제(Storage 객체 제거). 실패해도 무시(이미 없거나 권한 등). */
export async function deleteAttachment(att: Attachment): Promise<void> {
  try {
    await deleteObject(ref(getStorageClient(), att.path));
  } catch {
    /* noop */
  }
}
