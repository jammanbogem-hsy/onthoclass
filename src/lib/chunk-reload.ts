// 배포 직후 옛 화면이 지워진 코드 조각(/_next/static/chunks/….js)을 찾다 실패하는 경우를 되살린다.
// 새 버전을 배포하면 이전 버전 파일이 사라지므로, 배포 전에 열어 둔 탭에서 3D 캐릭터처럼 나중에 불러오는 코드는
// "Loading chunk … failed" 로 깨진다. 그럴 때 한 번만 새로 고침해 새 버전을 받는다(무한 새로 고침은 막는다).
const KEY = "chunk-reload-at";

export function isChunkError(e: unknown) {
  const s = e instanceof Error ? `${e.name} ${e.message}` : String(e ?? "");
  return /ChunkLoadError|Loading (CSS )?chunk|dynamically imported module|Importing a module script failed|error loading dynamically imported/i.test(s);
}

/** 30초 안에 이미 한 번 새로 고쳤으면 false(그때는 화면에 안내를 띄운다) */
export function reloadOnce() {
  try {
    const last = Number(sessionStorage.getItem(KEY) || 0);
    if (Date.now() - last < 30_000) return false;
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch { /* 저장소를 못 써도 새로 고침은 한다 */ }
  window.location.reload();
  return true;
}
