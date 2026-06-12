// 학생 이름 보정 — 제출/요청 문서에 굳은 studentName/fromName 은 제출 당시 Auth
// displayName 이라, 코드로 가입한 학생은 비어 "학생"/"이름없음"으로 박혀 버린다.
// 교사 화면에서는 항상 현재 학급 명단(members)의 표시 이름으로 다시 매핑한다.

const GENERIC = new Set(["", "학생", "이름없음", "친구", "나"]);

function real(n?: string | null): string {
  const t = (n ?? "").trim();
  return t && !GENERIC.has(t) ? t : "";
}

type RosterLike =
  | { uid: string; displayName?: string }[]
  | Record<string, string | undefined>;

function rosterName(roster: RosterLike, uid: string): string | undefined {
  return Array.isArray(roster)
    ? roster.find((m) => m.uid === uid)?.displayName
    : roster[uid];
}

/**
 * uid → 표시 이름. 우선순위: 현재 명단의 실명 → 저장된 실명 →
 * (둘 다 일반값이면) 명단값 → 저장값 → fallback.
 * roster 는 Member[] 또는 uid→이름 맵 둘 다 허용.
 */
export function resolveStudentName(
  roster: RosterLike,
  uid: string,
  saved?: string | null,
  fallback = "학생"
): string {
  const r = rosterName(roster, uid);
  return real(r) || real(saved) || r?.trim() || saved?.trim() || fallback;
}
