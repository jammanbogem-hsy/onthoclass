// UI 폰트 선택 — <html data-font="..."> 로 전체 폰트 전환.
// 계정(users/{uid}.prefs.font)에 저장돼 다른 탭·기기까지 동기화된다(@/lib/prefs).
import { savePrefIfSignedIn } from "@/lib/prefs";

export type FontKey =
  | "default"
  | "susukkang"
  | "paperozi"
  | "a2z"
  | "maruburi"
  | "cafe24air"
  | "eliceneolli"
  | "elicebaeum"
  | "elicecoding";

export const FONTS: { key: FontKey; label: string; sample: string }[] = [
  { key: "default", label: "기본", sample: "가나다 ABC" },
  { key: "susukkang", label: "수수깡", sample: "가나다 ABC" },
  { key: "paperozi", label: "페이퍼로지", sample: "가나다 ABC" },
  { key: "a2z", label: "에이투지", sample: "가나다 ABC" },
  { key: "maruburi", label: "마루 부리", sample: "가나다 ABC" },
  { key: "cafe24air", label: "카페24 에어", sample: "가나다 ABC" },
  { key: "eliceneolli", label: "엘리스 DX 네올리", sample: "가나다 ABC" },
  { key: "elicebaeum", label: "엘리스 디지털배움", sample: "가나다 ABC" },
  { key: "elicecoding", label: "엘리스 디지털코딩", sample: "가나다 ABC" },
];

/* 원격 폰트 CSS — 선택했을 때만 <link> 로 주입한다.
   엘리스 폰트 CSS 는 한글 subset(unicode-range) 정의가 많아 200~300KB 라,
   globals.css 에 넣거나 무조건 <head> 에 걸면 안 쓰는 사용자까지 비용을 낸다.
   (반대로 subset 덕분에 실제 woff2 는 화면에 쓰인 글자 범위만 내려받는다.) */
export const FONT_CSS: Partial<Record<FontKey, string>> = {
  eliceneolli: "https://font.elice.io/css?family=Elice+DX+Neolli",
  elicebaeum: "https://font.elice.io/css?family=Elice+Digital+Baeum",
  elicecoding: "https://font.elice.io/css?family=Elice+Digital+Coding",
};

const KEY = "jamfont:v1";

export function getFont(): FontKey {
  if (typeof window === "undefined") return "default";
  const v = localStorage.getItem(KEY) as FontKey | null;
  return v && FONTS.some((f) => f.key === v) ? v : "default";
}

export function setFont(key: FontKey): void {
  setFontLocal(key);
  // 계정에도 저장 — 다른 탭·기기가 구독해서 따라온다(로그인 시에만).
  void savePrefIfSignedIn({ font: key });
}

/** 로컬 캐시만 갱신 — 계정에서 내려온 값을 반영할 때 쓴다(되쓰기 루프 방지). */
export function setFontLocal(key: FontKey): void {
  if (typeof document === "undefined") return;
  try {
    localStorage.setItem(KEY, key);
  } catch {
    /* noop */
  }
  applyFont(key);
}

export function isFontKey(v: unknown): v is FontKey {
  return typeof v === "string" && FONTS.some((f) => f.key === v);
}

/** 원격 폰트 CSS 를 1회만 <head> 에 주입 (중복 방지) */
export function ensureFontCss(key: FontKey): void {
  if (typeof document === "undefined") return;
  const href = FONT_CSS[key];
  if (!href) return;
  if (document.querySelector(`link[data-font-css="${key}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.setAttribute("data-font-css", key);
  document.head.appendChild(link);
}

/** <html> 에 data-font 적용(기본은 속성 제거). */
export function applyFont(key: FontKey): void {
  if (typeof document === "undefined") return;
  ensureFontCss(key);
  const el = document.documentElement;
  if (key === "default") el.removeAttribute("data-font");
  else el.setAttribute("data-font", key);
}

/** FOUC 방지: 하이드레이션 전에 <head> 인라인으로 실행할 스크립트 문자열.
 *  원격 CSS 가 필요한 폰트는 여기서 <link> 까지 미리 걸어 둔다. */
export const FONT_INIT_SCRIPT = `(function(){try{var C=${JSON.stringify(
  FONT_CSS
)};var v=localStorage.getItem('${KEY}');if(v&&v!=='default'){document.documentElement.setAttribute('data-font',v);if(C[v]){var l=document.createElement('link');l.rel='stylesheet';l.href=C[v];l.setAttribute('data-font-css',v);document.head.appendChild(l);}}}catch(e){}})();`;
