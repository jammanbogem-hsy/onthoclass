// 즐겨찾기 — 사용자별·학급별 로컬 저장 (Finder 사이드바 커스터마이즈)
export type FavKind = "project" | "lesson";
export type Fav = { kind: FavKind; id: string };

function key(classId: string, uid: string) {
  return `jamfav:${classId}:${uid}`;
}

export function loadFavs(classId: string, uid: string): Fav[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(key(classId, uid));
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? (v as Fav[]) : [];
  } catch {
    return [];
  }
}

export function saveFavs(
  classId: string,
  uid: string,
  favs: Fav[]
): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key(classId, uid), JSON.stringify(favs));
  } catch {
    /* 저장 실패 무시 */
  }
}
