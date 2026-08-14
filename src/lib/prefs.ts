// 화면 설정(색상 테마·글꼴·이름 가리기)의 저장 위치를 한 곳으로 모은다.
//
// 두 층으로 나눠 둔 이유:
//   1) localStorage — 하이드레이션 전에 읽어야 색/글꼴 깜빡임(FOUC)이 없다.
//      로그인 전이나 오프라인에서도 마지막 선택이 유지된다.
//   2) users/{uid}.prefs — 진짜 단일 출처. 다른 탭·다른 기기가 여기를 구독하므로
//      한 곳에서 바꾸면 나머지가 따라온다.
// 사용자가 고르면 (1)에 즉시 반영해 화면을 바꾸고 (2)에 저장한다.
// (2)가 바뀌면 PrefsSync 가 받아 (1)에 덮어쓴다.
import { setUserPrefs, type UserPrefs } from "@/lib/users";

// 로그인한 uid — PrefsSync 가 채워 준다. 모듈 변수로 두는 건 설정 저장 함수가
// 컴포넌트 밖(예: NameMask 의 setMasked)에서도 호출되기 때문이다.
let currentUid: string | null = null;

export function setPrefsUid(uid: string | null): void {
  currentUid = uid;
}

/** 로그인 상태면 계정에 저장한다. 실패해도 화면 동작은 막지 않는다. */
export async function savePrefIfSignedIn(patch: UserPrefs): Promise<void> {
  if (!currentUid) return;
  try {
    await setUserPrefs(currentUid, patch);
  } catch {
    /* 오프라인 등 — 로컬 캐시는 이미 반영돼 있다 */
  }
}
