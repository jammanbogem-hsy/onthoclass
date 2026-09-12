// 퀴즈런 결과 사진 — 게임이 끝난 순간의 공(과 붙은 물건들)을 찍어 학급 전시에 쓴다.
//
// 캡처는 게임이 아직 화면에 있을 때 해야 한다(언마운트되면 캔버스가 사라진다).
// 그래서 QuizRunStudent 는 종료를 감지하면 곧장 결과로 넘어가지 않고
// "정리 중" 단계를 한 번 거친다.
//
// Storage 경로: classes/{cid}/quizrun/{gid}/{uid}/shot.jpg
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { getStorageClient } from "@/lib/firebase";

/** 전시용 사진의 한 변(px). 22명 그리드에 넣을 것이라 크게 둘 이유가 없다. */
const SHOT_SIZE = 640;
const SHOT_QUALITY = 0.72;
/** 가운데를 얼마나 잘라낼지(화면 높이 대비). 1 이면 높이 전체.
 *  따라다니는 카메라가 공을 화면 가운데에 두므로, 가운데를 정사각으로
 *  잘라내면 캐릭터와 공만 크게 담긴 사진이 된다. */
const CROP_RATIO = 0.92;

/**
 * 실제 WebGL 캔버스를 찾는다.
 *
 * 주의 — @react-three/fiber 의 <Canvas className="game-canvas"> 는 그 클래스를
 * 바깥 div 에 붙인다. 구조가 div.game-canvas > div > canvas 라서
 * "canvas.game-canvas" 로는 절대 잡히지 않는다.
 */
function findGameCanvas(): HTMLCanvasElement | null {
  return (
    document.querySelector<HTMLCanvasElement>(".game-canvas canvas") ??
    document.querySelector<HTMLCanvasElement>(".quizrun-root canvas") ??
    null
  );
}

/**
 * 게임 캔버스를 JPEG Blob 으로 굽는다.
 *
 * 캔버스는 DOM 에서 찾는다 — 어솔 원본 컴포넌트에 ref 를 뚫는 것보다 이쪽이
 * 원본을 덜 건드린다(다시 이식할 때 충돌이 없다). 클래스명 game-canvas 는
 * 어솔의 <Canvas className="game-canvas"> 에서 온다.
 */
export async function captureGameShot(): Promise<Blob | null> {
  // 종료 직후라 캔버스가 아직 자리를 잡지 못했을 수 있다 — 몇 번 더 본다.
  let source = findGameCanvas();
  for (let i = 0; i < 4 && (!source || source.width === 0); i += 1) {
    await new Promise((r) => window.setTimeout(r, 150));
    source = findGameCanvas();
  }
  if (!source || source.width === 0 || source.height === 0) return null;

  // 화면 가운데를 정사각으로 잘라낸다 — 넓은 게임 화면을 그대로 쓰면
  // 캐릭터와 공이 작게 박혀 전시 사진으로 쓸 수 없다.
  const side = Math.round(Math.min(source.width, source.height) * CROP_RATIO);
  const sx = Math.round((source.width - side) / 2);
  const sy = Math.round((source.height - side) / 2);

  const out = document.createElement("canvas");
  out.width = SHOT_SIZE;
  out.height = SHOT_SIZE;
  const ctx = out.getContext("2d");
  if (!ctx) return null;
  try {
    ctx.drawImage(source, sx, sy, side, side, 0, 0, SHOT_SIZE, SHOT_SIZE);
  } catch {
    // WebGL 컨텍스트가 이미 날아간 경우(탭 전환 등) — 사진 없이 넘어간다
    return null;
  }

  return new Promise((resolve) =>
    out.toBlob((b) => resolve(b), "image/jpeg", SHOT_QUALITY)
  );
}

/** 찍은 사진을 올리고 다운로드 URL 을 돌려준다. */
export async function uploadGameShot(
  cid: string,
  gid: string,
  uid: string,
  blob: Blob
): Promise<string> {
  const storage = getStorageClient();
  if (!storage) throw new Error("스토리지를 사용할 수 없습니다.");
  const r = ref(storage, `classes/${cid}/quizrun/${gid}/${uid}/shot.jpg`);
  await uploadBytes(r, blob, { contentType: "image/jpeg" });
  return getDownloadURL(r);
}
