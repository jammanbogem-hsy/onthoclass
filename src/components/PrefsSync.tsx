"use client";

/**
 * 화면 설정(색상·글꼴·이름 가리기) 계정 동기화.
 *
 * 로그인한 사용자의 users/{uid}.prefs 를 구독해, 다른 탭이나 다른 기기에서 바꾼
 * 설정을 이 화면에도 즉시 반영한다. 화면을 그리지 않는 컴포넌트라 레이아웃
 * 어디에 두어도 되지만, NameMaskProvider 안이어야 이름 가리기를 제어할 수 있다.
 *
 * 되쓰기 루프 방지: 원격에서 내려온 값은 *Local 계열로만 반영한다(계정에 다시
 * 쓰지 않는다). 사용자가 직접 고른 값만 setTheme/setFont/setMasked 를 통해
 * 계정에 저장된다.
 */

import { useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useNameMask } from "@/components/NameMask";
import { setPrefsUid, savePrefIfSignedIn } from "@/lib/prefs";
import { watchUserPrefs } from "@/lib/users";
import {
  getPill,
  getTheme,
  isThemeKey,
  setPillLocal,
  setThemeLocal,
} from "@/lib/colorTheme";
import { getFont, isFontKey, setFontLocal } from "@/lib/fontTheme";

export function PrefsSync() {
  const { user } = useAuth();
  const { setMaskedFromRemote } = useNameMask();
  const uid = user?.uid ?? null;

  useEffect(() => {
    setPrefsUid(uid);
    if (!uid) return;

    let first = true;
    const off = watchUserPrefs(uid, (p) => {
      // 계정에 아직 설정이 없는 첫 로그인 —— 이 기기에서 쓰던 값을 올려 둔다.
      // (기존 사용자가 로그인했다고 기본값으로 초기화되지 않도록)
      if (
        first &&
        p.theme === undefined &&
        p.font === undefined &&
        p.nameMask === undefined &&
        p.pill === undefined
      ) {
        first = false;
        void savePrefIfSignedIn({
          theme: getTheme(),
          font: getFont(),
          nameMask: false,
          pill: getPill() ?? "",
        });
        return;
      }
      first = false;

      if (isThemeKey(p.theme)) setThemeLocal(p.theme);
      if (isFontKey(p.font)) setFontLocal(p.font);
      if (typeof p.nameMask === "boolean") setMaskedFromRemote(p.nameMask);
      if (typeof p.pill === "string") setPillLocal(p.pill || null);
    });

    return () => {
      off();
      setPrefsUid(null);
    };
  }, [uid, setMaskedFromRemote]);

  return null;
}
