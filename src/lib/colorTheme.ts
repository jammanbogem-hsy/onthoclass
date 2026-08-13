// UI 색상 테마 — <html data-theme="..."> 로 전체 색상 전환. 기기(브라우저)별 저장.
//
// 동작 원리: M3 시맨틱 역할(primary / primary-container / on-* …)이 전부
// PRIMARY 톤 팔레트(--md-sys-color-p-*)에서 파생되므로, 테마는 그 팔레트만
// 갈아끼운다. 버튼·칩·활성 상태·강조 배경이 한 번에 따라온다.
// (표면/중립색은 그대로 둔다 — 대비 안전선 유지)
export type ThemeKey =
  | "default"
  | "ocean"
  | "lavender"
  | "coral"
  | "blossom"
  | "slate";

export const THEMES: { key: ThemeKey; label: string; swatch: string }[] = [
  { key: "default", label: "민트", swatch: "#0F6E56" },
  { key: "ocean", label: "바다", swatch: "#0B60AE" },
  { key: "lavender", label: "라벤더", swatch: "#6750A4" },
  { key: "coral", label: "산호", swatch: "#AE3300" },
  { key: "blossom", label: "벚꽃", swatch: "#9E3F63" },
  { key: "slate", label: "먹빛", swatch: "#5A5E63" },
];

const KEY = "jamtheme:v1";

export function getTheme(): ThemeKey {
  if (typeof window === "undefined") return "default";
  const v = localStorage.getItem(KEY) as ThemeKey | null;
  return v && THEMES.some((t) => t.key === v) ? v : "default";
}

export function setTheme(key: ThemeKey): void {
  if (typeof document === "undefined") return;
  try {
    localStorage.setItem(KEY, key);
  } catch {
    /* noop */
  }
  applyTheme(key);
}

/** <html> 에 data-theme 적용(기본은 속성 제거). */
export function applyTheme(key: ThemeKey): void {
  if (typeof document === "undefined") return;
  const el = document.documentElement;
  if (key === "default") el.removeAttribute("data-theme");
  else el.setAttribute("data-theme", key);
}

/** FOUC 방지: 하이드레이션 전에 <head> 인라인으로 실행할 스크립트 문자열. */
export const THEME_INIT_SCRIPT = `(function(){try{var v=localStorage.getItem('${KEY}');if(v&&v!=='default'){document.documentElement.setAttribute('data-theme',v);}}catch(e){}})();`;
