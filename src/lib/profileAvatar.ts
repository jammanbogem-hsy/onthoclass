import { httpsCallable } from "firebase/functions";
import { ref, uploadBytes } from "firebase/storage";
import { getFunctionsClient, getStorageClient } from "@/lib/firebase";

const ACCEPTED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

/** 학생이 고른 이미지를 가운데 기준 정사각형 512px JPEG로 정리한다. */
async function prepareProfileImage(file: File): Promise<Blob> {
  if (!ACCEPTED_IMAGE_TYPES.has(file.type)) {
    throw new Error("JPG, PNG, WebP 이미지만 사용할 수 있어요.");
  }
  if (file.size > 10 * 1024 * 1024) {
    throw new Error("원본 이미지는 10MB보다 작아야 해요.");
  }

  const objectURL = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("이미지를 불러올 수 없어요."));
      el.src = objectURL;
    });
    const side = Math.min(image.naturalWidth, image.naturalHeight);
    if (!side) throw new Error("비어 있는 이미지는 사용할 수 없어요.");

    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("이 브라우저에서는 이미지를 처리할 수 없어요.");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, 512, 512);
    ctx.drawImage(
      image,
      (image.naturalWidth - side) / 2,
      (image.naturalHeight - side) / 2,
      side,
      side,
      0,
      0,
      512,
      512
    );
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.86)
    );
    if (!blob) throw new Error("이미지를 변환하지 못했어요.");
    if (blob.size >= 1024 * 1024) {
      throw new Error("변환된 이미지가 너무 커요. 다른 이미지를 골라 주세요.");
    }
    return blob;
  } finally {
    URL.revokeObjectURL(objectURL);
  }
}

/**
 * 학생별 고정 경로에 최초 1회만 업로드하고 서버에서 프로필로 확정한다.
 * Storage 규칙이 같은 경로의 update/delete를 막으므로 클라이언트 우회로도 교체할 수 없다.
 */
export async function uploadCustomAvatarOnce(
  uid: string,
  file: File
): Promise<string> {
  const blob = await prepareProfileImage(file);
  const objectRef = ref(getStorageClient(), `profile-avatars/${uid}/avatar.jpg`);
  try {
    await uploadBytes(objectRef, blob, {
      contentType: "image/jpeg",
      customMetadata: { ownerUid: uid },
    });
  } catch (error) {
    // 업로드 뒤 응답만 유실됐거나 이미 1회 사용했다면 서버 확정 함수를
    // 다시 호출해 기존 파일을 복구한다. 다른 오류는 그대로 보여준다.
    const code = (error as { code?: string })?.code ?? "";
    if (code !== "storage/unauthorized") throw error;
  }

  const claim = httpsCallable<Record<string, never>, { url: string }>(
    getFunctionsClient(),
    "claimCustomAvatar"
  );
  const result = await claim({});
  if (!result.data?.url) throw new Error("프로필 사진을 확정하지 못했어요.");
  return result.data.url;
}
