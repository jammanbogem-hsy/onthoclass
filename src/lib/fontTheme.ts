// UI 폰트 선택 — <html data-font="..."> 로 전체 폰트 전환. 기기(브라우저)별 저장.
export type FontKey =
  | "default"
  | "susukkang"
  | "paperozi"
  | "a2z"
  | "maruburi"
  | "cafe24air";

export const FONTS: { key: FontKey; label: string; sample: string }[] = [
  { key: "default", label: "기본", sample: "가나다 ABC" },
  { key: "susukkang", label: "수수깡", sample: "가나다 ABC" },
  { key: "paperozi", label: "페이퍼로지", sample: "가나다 ABC" },
  { key: "a2z", label: "에이투지", sample: "가나다 ABC" },
  { key: "maruburi", label: "마루 부리", sample: "가나다 ABC" },
  { key: "cafe24air", label: "카페24 에어", sample: "가나다 ABC" },
];

const KEY = "jamfont:v1";

export function getFont(): FontKey {
  if (typeof window === "undefined") return "default";
  const v = localStorage.getItem(KEY) as FontKey | null;
  return v && FONTS.some((f) => f.key === v) ? v : "default";
}

export function setFont(key: FontKey): void {
  if (typeof document === "undefined") return;
  try {
    localStorage.setItem(KEY, key);
  } catch {
    /* noop */
  }
  applyFont(key);
}

/** <html> 에 data-font 적용(기본은 속성 제거). */
export function applyFont(key: FontKey): void {
  if (typeof document === "undefined") return;
  const el = document.documentElement;
  if (key === "default") el.removeAttribute("data-font");
  else el.setAttribute("data-font", key);
}

/** FOUC 방지: 하이드레이션 전에 <head> 인라인으로 실행할 스크립트 문자열. */
export const FONT_INIT_SCRIPT = `(function(){try{var v=localStorage.getItem('${KEY}');if(v&&v!=='default'){document.documentElement.setAttribute('data-font',v);}}catch(e){}})();`;
