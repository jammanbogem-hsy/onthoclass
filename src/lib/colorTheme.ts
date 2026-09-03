// UI 색상 테마 — <html data-theme="..."> 로 전체 색상 전환.
// 계정(users/{uid}.prefs.theme)에 저장돼 다른 탭·기기까지 동기화된다(@/lib/prefs).
//
// 동작 원리: M3 시맨틱 역할(primary / primary-container / on-* …)이 전부
// PRIMARY 톤 팔레트(--md-sys-color-p-*)에서 파생되므로, 테마는 그 팔레트만
// 갈아끼운다. 버튼·칩·활성 상태·강조 배경이 한 번에 따라온다.
// (표면/중립색은 그대로 둔다 — 대비 안전선 유지)
import { savePrefIfSignedIn } from "@/lib/prefs";

export type PresetKey =
  | "default"
  | "ocean"
  | "lavender"
  | "coral"
  | "blossom"
  | "slate";

/** 프리셋 키 또는 "hue:210" 같은 직접 선택 값 */
export type ThemeKey = PresetKey | `hue:${number}`;

export const THEMES: { key: PresetKey; label: string; swatch: string }[] = [
  { key: "default", label: "민트", swatch: "#0F6E56" },
  { key: "ocean", label: "바다", swatch: "#0B60AE" },
  { key: "lavender", label: "라벤더", swatch: "#6750A4" },
  { key: "coral", label: "산호", swatch: "#AE3300" },
  { key: "blossom", label: "벚꽃", swatch: "#9E3F63" },
  { key: "slate", label: "먹빛", swatch: "#5A5E63" },
];

/* ───────── hue 직접 고르기 (프리셋 6색 외 360색) ───────── */

/** "hue:210" 형태인지 */
export function isHueTheme(v: unknown): v is string {
  return typeof v === "string" && /^hue:\d{1,3}$/.test(v) && parseHue(v) !== null;
}

export function parseHue(v: string): number | null {
  const n = parseInt(v.slice(4), 10);
  return Number.isFinite(n) && n >= 0 && n <= 360 ? n % 360 : null;
}

/**
 * hue 별 p-40(버튼 배경) 밝기 보정표 — 15도 간격 25개.
 *
 * 밝기를 고정하면 노랑·초록 계열에서 흰 글자 대비가 2.6:1 까지 떨어져 글자가
 * 안 보인다. 그래서 hue 마다 "흰 글자 대비 4.8:1 을 만족하는 가장 밝은 값"을
 * 미리 풀어 표로 굽고, 사이값은 선형 보간한다(보간 후 최악 4.71:1 로 AA 유지).
 * CSS 에는 대비 계산 기능이 없어 런타임에 풀 수 없기에 표로 둔다.
 */
const L40_TABLE = [
  0.514, 0.452, 0.383, 0.321, 0.272, 0.284, 0.294, 0.301, 0.306, 0.304,
  0.302, 0.298, 0.293, 0.358, 0.455, 0.568, 0.6, 0.6, 0.586, 0.53,
  0.452, 0.473, 0.49, 0.503, 0.514,
];

function l40(hue: number): number {
  const step = 15;
  const i = Math.floor(hue / step);
  const t = (hue - i * step) / step;
  const a = L40_TABLE[i] ?? L40_TABLE[0];
  const b = L40_TABLE[Math.min(i + 1, L40_TABLE.length - 1)];
  return a * (1 - t) + b * t;
}

const pct = (n: number) => `${Math.round(n * 1000) / 10}%`;

/** hue 하나에서 M3 톤 팔레트(p-*)와 브랜드 컨테이너를 만든다. */
export function huePalette(hue: number): Record<string, string> {
  const L = l40(hue);
  const S = 70;
  const tone = (l: number, s = S) => `hsl(${hue} ${s}% ${pct(l)})`;
  return {
    "--md-sys-color-p-10": tone(L * 0.3),
    "--md-sys-color-p-20": tone(L * 0.52),
    "--md-sys-color-p-30": tone(L * 0.76),
    "--md-sys-color-p-40": tone(L),
    "--md-sys-color-p-50": tone(L + (0.6 - L) * 0.28),
    "--md-sys-color-p-60": tone(L + (0.75 - L) * 0.45),
    "--md-sys-color-p-70": tone(L + (0.85 - L) * 0.62),
    "--md-sys-color-p-80": tone(L + (0.9 - L) * 0.78),
    "--md-sys-color-p-90": tone(0.9, 60),
    "--md-sys-color-p-95": tone(0.945, 60),
    "--md-sys-color-p-99": tone(0.985, 60),
    "--md-brand-mint": tone(0.925, 55),
  };
}

/** 대표 색(스와치·현재 표시용) */
export function hueSwatch(hue: number): string {
  return `hsl(${hue} 70% ${pct(l40(hue))})`;
}

const KEY = "jamtheme:v1";

export function getTheme(): ThemeKey {
  if (typeof window === "undefined") return "default";
  const v = localStorage.getItem(KEY);
  return isThemeKey(v) ? v : "default";
}

export function setTheme(key: ThemeKey): void {
  setThemeLocal(key);
  // 계정에도 저장 — 다른 탭·기기가 구독해서 따라온다(로그인 시에만).
  void savePrefIfSignedIn({ theme: key });
}

/** 로컬 캐시만 갱신 — 계정에서 내려온 값을 반영할 때 쓴다(되쓰기 루프 방지). */
export function setThemeLocal(key: ThemeKey): void {
  if (typeof document === "undefined") return;
  try {
    localStorage.setItem(KEY, key);
  } catch {
    /* noop */
  }
  applyTheme(key);
}

export function isThemeKey(v: unknown): v is ThemeKey {
  return (
    (typeof v === "string" && THEMES.some((t) => t.key === v)) || isHueTheme(v)
  );
}

/**
 * <html> 에 테마 적용.
 *  - 프리셋: data-theme 속성만 바꾸면 CSS(material3.css)가 팔레트를 갈아끼운다.
 *  - hue:  : CSS 로는 대비 보정을 계산할 수 없어 팔레트를 만들어 인라인 변수로
 *           직접 넣는다(인라인이 :root 규칙을 이겨 프리셋과 섞이지 않는다).
 * 전환 시 이전 방식의 잔재를 반드시 지운다.
 */
export function applyTheme(key: ThemeKey): void {
  if (typeof document === "undefined") return;
  const el = document.documentElement;
  const hue = isHueTheme(key) ? parseHue(key) : null;

  // 이전 hue 팔레트 제거 (프리셋으로 되돌아갈 때 남으면 색이 섞인다)
  for (const name of Object.keys(huePalette(0))) el.style.removeProperty(name);

  if (hue !== null) {
    el.setAttribute("data-theme", key);
    const p = huePalette(hue);
    for (const [name, value] of Object.entries(p)) {
      el.style.setProperty(name, value);
    }
    return;
  }
  if (key === "default") el.removeAttribute("data-theme");
  else el.setAttribute("data-theme", key);
}

/** FOUC 방지: 하이드레이션 전에 <head> 인라인으로 실행할 스크립트 문자열. */
/** FOUC 방지: 하이드레이션 전에 <head> 인라인으로 실행할 스크립트 문자열.
 *  hue 테마는 팔레트를 계산해 넣어야 해서, 보정표와 공식을 스크립트에 함께 굽는다
 *  (여기서 안 넣으면 첫 페인트가 기본 초록으로 번쩍인다). */
export const THEME_INIT_SCRIPT = `(function(){
try{(function(){
var v=localStorage.getItem('${KEY}');if(!v||v==='default')return;
document.documentElement.setAttribute('data-theme',v);
var m=/^hue:(\\d{1,3})$/.exec(v);if(!m)return;
var h=parseInt(m[1],10);if(!(h>=0&&h<=360))return;h=h%360;
var T=${JSON.stringify(L40_TABLE)};
var i=Math.floor(h/15),t=(h-i*15)/15;
var L=T[i]*(1-t)+T[Math.min(i+1,T.length-1)]*t;
var P=function(x){return Math.round(x*1000)/10+'%'};
var C=function(l,s){return 'hsl('+h+' '+(s||70)+'% '+P(l)+')'};
var S=document.documentElement.style;
S.setProperty('--md-sys-color-p-10',C(L*0.3));
S.setProperty('--md-sys-color-p-20',C(L*0.52));
S.setProperty('--md-sys-color-p-30',C(L*0.76));
S.setProperty('--md-sys-color-p-40',C(L));
S.setProperty('--md-sys-color-p-50',C(L+(0.6-L)*0.28));
S.setProperty('--md-sys-color-p-60',C(L+(0.75-L)*0.45));
S.setProperty('--md-sys-color-p-70',C(L+(0.85-L)*0.62));
S.setProperty('--md-sys-color-p-80',C(L+(0.9-L)*0.78));
S.setProperty('--md-sys-color-p-90',C(0.9,60));
S.setProperty('--md-sys-color-p-95',C(0.945,60));
S.setProperty('--md-sys-color-p-99',C(0.985,60));
S.setProperty('--md-brand-mint',C(0.925,55));
})()}catch(e){}
try{
var pv=localStorage.getItem('jampill:v1');
var pm=pv&&/^grad:(\\d{1,3}),(\\d{1,3})$/.exec(pv);
if(pm){
  var f=+pm[1]%360,t=+pm[2]%360;
  var T2=${JSON.stringify(L40_TABLE)};
  var L=function(h){var i=Math.floor(h/15),k=(h-i*15)/15;return T2[i]*(1-k)+T2[Math.min(i+1,T2.length-1)]*k};
  var C2=function(h){return 'hsl('+h+' 70% '+(Math.round(L(h)*1000)/10)+'%)'};
  var d=(((t-f+540)%360)-180), mid=((f+d/2)%360+360)%360;
  document.documentElement.style.setProperty('--jam-pill-gradient',
    'linear-gradient(90deg,'+C2(f)+','+C2(mid)+','+C2(t)+','+C2(f)+')');
}
}catch(e){}})();`;

/* ───────── 내 배지 그라데이션 (학생이 직접 고름) ───────── */

/** 그라데이션 방향. 저장 문자열에는 한 글자로 들어간다. */
export type PillStyle = "h" | "d" | "v" | "r";

export const PILL_STYLES: { key: PillStyle; label: string }[] = [
  { key: "h", label: "가로" },
  { key: "d", label: "대각선" },
  { key: "v", label: "세로" },
  { key: "r", label: "원형" },
];

/** "grad:210,320" 또는 "grad:210,320,d" — 시작·끝 hue + 방향.
 *  방향이 없으면 가로(h). 없던 시절 저장값과 호환된다. */
export type PillGradient = { from: number; to: number; style: PillStyle };

export const PILL_PRESETS: (PillGradient & { label: string })[] = [
  { label: "노을", from: 20, to: 330, style: "h" },
  { label: "바다", from: 190, to: 240, style: "h" },
  { label: "숲", from: 90, to: 160, style: "d" },
  { label: "포도", from: 265, to: 320, style: "h" },
  { label: "사탕", from: 330, to: 30, style: "d" },
  { label: "오로라", from: 150, to: 260, style: "v" },
];

export function parsePillGradient(v: unknown): PillGradient | null {
  if (typeof v !== "string") return null;
  const m = /^grad:(\d{1,3}),(\d{1,3})(?:,([hdvr]))?$/.exec(v);
  if (!m) return null;
  const from = Number(m[1]);
  const to = Number(m[2]);
  if (from > 360 || to > 360) return null;
  return {
    from: from % 360,
    to: to % 360,
    style: (m[3] as PillStyle) ?? "h", // 방향 없는 옛 저장값 = 가로
  };
}

export const formatPillGradient = (g: PillGradient) =>
  `grad:${Math.round(g.from) % 360},${Math.round(g.to) % 360},${g.style}`;

/**
 * 배지에 넣을 CSS 그라데이션.
 *
 * hueSwatch 를 쓰는 이유: 배지 위에는 흰 글자가 올라간다. 아무 밝기나 쓰면
 * 노랑·연두에서 글자가 안 보이는데, hueSwatch 는 테마용으로 이미 hue 별
 * 밝기를 보정해 둔 값(흰 글자 대비 4.5:1 이상)을 돌려준다.
 * 가운데에 두 색의 중간 hue 를 넣어 띠가 탁해지지 않게 했다.
 */
export function pillGradientCss(g: PillGradient): string {
  // 색상환에서 가까운 쪽으로 도는 중간 hue (330°→30° 처럼 0 을 넘는 경우 포함)
  const diff = (((g.to - g.from + 540) % 360) - 180);
  const midHue = ((g.from + diff / 2) % 360 + 360) % 360;
  const a = hueSwatch(g.from);
  const b = hueSwatch(midHue);
  const c = hueSwatch(g.to);
  // 가로는 알약이 좌우로 기니 끝에 시작색을 한 번 더 넣어 흐름이 이어지게 한다.
  if (g.style === "r") return `radial-gradient(circle at 30% 30%, ${a}, ${b}, ${c})`;
  const angle = g.style === "v" ? "180deg" : g.style === "d" ? "135deg" : "90deg";
  return g.style === "h"
    ? `linear-gradient(${angle}, ${a}, ${b}, ${c}, ${a})`
    : `linear-gradient(${angle}, ${a}, ${b}, ${c})`;
}

const PILL_KEY = "jampill:v1";

/** 배지 그라데이션을 <html> 변수로 적용. 없으면 변수를 지워 테마 색으로 되돌린다. */
export function applyPill(v: string | null): void {
  if (typeof document === "undefined") return;
  const el = document.documentElement;
  const g = v ? parsePillGradient(v) : null;
  if (!g) el.style.removeProperty("--jam-pill-gradient");
  else el.style.setProperty("--jam-pill-gradient", pillGradientCss(g));
}

export function getPill(): string | null {
  if (typeof window === "undefined") return null;
  const v = localStorage.getItem(PILL_KEY);
  return v && parsePillGradient(v) ? v : null;
}

/** 로컬 캐시만 갱신 — 계정에서 내려온 값 반영용(되쓰기 루프 방지) */
export function setPillLocal(v: string | null): void {
  if (typeof document === "undefined") return;
  try {
    if (v) localStorage.setItem(PILL_KEY, v);
    else localStorage.removeItem(PILL_KEY);
  } catch {
    /* noop */
  }
  applyPill(v);
}

export function setPill(v: string | null): void {
  setPillLocal(v);
  void savePrefIfSignedIn({ pill: v ?? "" });
}

/* ───────── 최근 쓴 배지 색 ───────── */

const RECENT_KEY = "jampill-recent:v1";
const RECENT_MAX = 8;

/**
 * 직접 만든 색은 프리셋과 달리 다시 찾아가기 어렵다 — 색상환에서 같은 각도를
 * 두 번 짚기가 쉽지 않아서다. 그래서 편집기에서 저장한 것만 기록해 둔다.
 * (프리셋은 항상 목록에 있으므로 기록하지 않는다)
 *
 * 기기별 보관이다. 배지 설정 자체는 계정에 동기화되지만, '최근'은 편의 기능이라
 * 계정 문서를 늘리기보다 로컬에 둔다.
 */
export function getRecentPills(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const list: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) return [];
    return list
      .filter((v): v is string => typeof v === "string" && !!parsePillGradient(v))
      .slice(0, RECENT_MAX);
  } catch {
    return [];
  }
}

export function pushRecentPill(v: string): void {
  if (typeof window === "undefined" || !parsePillGradient(v)) return;
  try {
    // 같은 색을 다시 쓰면 맨 앞으로 올린다(중복 쌓임 방지)
    const next = [v, ...getRecentPills().filter((x) => x !== v)].slice(
      0,
      RECENT_MAX
    );
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* noop */
  }
}

export function clearRecentPills(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(RECENT_KEY);
  } catch {
    /* noop */
  }
}
