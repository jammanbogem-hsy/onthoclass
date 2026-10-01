// 뿌요뿌요 경기 배경 테마 — 경기마다(시드로) 하나를 골라 두 학생이 같은 무대를 본다.
// 배경 무늬·보드 칸 타일은 직접 그린 SVG(데이터 URI), 테두리 색은 CSS 변수로 넘긴다.

const svgUrl = (svg: string) => `url("data:image/svg+xml,${encodeURIComponent(svg.replace(/\n\s*/g, ""))}")`;

export type PuyoTheme = { id: string; name: string; vars: Record<string, string> };

/** 보드 칸 하나(100×100) — 바탕, 안쪽 둥근 칸, 테마 무늬. */
const cell = (bg: string, inner: string, motif: string) => svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" fill="${bg}"/>
  <rect x="7" y="7" width="86" height="86" rx="12" fill="${inner}"/>
  ${motif}
</svg>`);

export const PUYO_THEMES: PuyoTheme[] = [
  {
    id: "factory", name: "용광로 공장",
    vars: {
      "--arena-bg": `${svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
        <rect width="120" height="120" fill="#2a0805"/>
        <path d="M-10 30 C30 30 30 90 70 90 S110 30 130 30" stroke="#7a1c0c" stroke-width="14" fill="none"/>
        <path d="M-10 30 C30 30 30 90 70 90 S110 30 130 30" stroke="#c2401a" stroke-width="4" fill="none" opacity=".7"/>
        <path d="M0 108 H120" stroke="#5a1408" stroke-width="10"/>
        <circle cx="20" cy="108" r="4" fill="#ff8a4a"/><circle cx="80" cy="108" r="4" fill="#ff8a4a"/>
        <circle cx="100" cy="12" r="6" fill="#1f9d55"/><circle cx="99" cy="10" r="2" fill="#b6ffd2"/>
      </svg>`)} 0 0/120px 120px, radial-gradient(ellipse at 50% 40%, #5a1408, #1a0503)`,
      "--board-bg": cell("#3a0a06", "#5c120a", `<path d="M30 62 q10 -22 22 -6 t20 -12" stroke="#c63a1c" stroke-width="7" fill="none" stroke-linecap="round"/>`),
      "--frame-a": "#e0682c", "--frame-b": "#7a1c0c", "--frame-c": "#ffb37a", "--gem": "#26c46a", "--gem-glow": "#ff6a2a66",
      "--panel-bg": "#3a0a06cc", "--panel-line": "#c2401a", "--label": "#7dff6a",
    },
  },
  {
    id: "sea", name: "깊은 바다",
    vars: {
      "--arena-bg": `${svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
        <rect width="120" height="120" fill="#04203a"/>
        <path d="M0 80 q15 -10 30 0 t30 0 t30 0 t30 0" stroke="#0e4f7a" stroke-width="6" fill="none"/>
        <circle cx="24" cy="30" r="7" fill="none" stroke="#5fd0ff" stroke-width="2" opacity=".6"/>
        <circle cx="30" cy="16" r="3.5" fill="none" stroke="#5fd0ff" stroke-width="1.5" opacity=".6"/>
        <circle cx="92" cy="44" r="5" fill="none" stroke="#9be8ff" stroke-width="1.6" opacity=".5"/>
        <path d="M70 120 q6 -24 0 -40 q10 16 4 40" fill="#ff7a8a" opacity=".55"/>
      </svg>`)} 0 0/120px 120px, radial-gradient(ellipse at 50% 0%, #0b5a8a, #021326)`,
      "--board-bg": cell("#04223e", "#073457", `<circle cx="50" cy="56" r="13" fill="none" stroke="#1a6fa3" stroke-width="5"/><circle cx="58" cy="44" r="3" fill="#1a6fa3"/>`),
      "--frame-a": "#f2c46b", "--frame-b": "#0c4a73", "--frame-c": "#fff1c2", "--gem": "#ff8fb1", "--gem-glow": "#4fc3ff55",
      "--panel-bg": "#04223ecc", "--panel-line": "#3aa0d8", "--label": "#9be8ff",
    },
  },
  {
    id: "forest", name: "마법 숲",
    vars: {
      "--arena-bg": `${svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
        <rect width="120" height="120" fill="#0b2410"/>
        <path d="M20 40 q20 -26 40 0 q-20 18 -40 0Z" fill="#1d5a24"/><path d="M20 40 Q40 36 60 40" stroke="#3f9a3a" stroke-width="2"/>
        <path d="M70 96 q18 -22 36 0 q-18 16 -36 0Z" fill="#174a1d"/>
        <circle cx="96" cy="22" r="3" fill="#ffe27a"/><circle cx="12" cy="92" r="2.4" fill="#ffe27a" opacity=".8"/>
      </svg>`)} 0 0/120px 120px, radial-gradient(ellipse at 50% 30%, #1f5a24, #061409)`,
      "--board-bg": cell("#0c2a12", "#123d1a", `<path d="M34 60 q16 -26 32 0 q-16 14 -32 0Z" fill="#1f6a2a"/>`),
      "--frame-a": "#b07a3a", "--frame-b": "#4a2a10", "--frame-c": "#e8c48a", "--gem": "#ffb02e", "--gem-glow": "#9be06a55",
      "--panel-bg": "#0c2a12cc", "--panel-line": "#5aa84a", "--label": "#c8ff7a",
    },
  },
  {
    id: "night", name: "별빛 하늘",
    vars: {
      "--arena-bg": `${svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
        <rect width="120" height="120" fill="#0d0b2e"/>
        <path d="M30 20 l3 8 8 3 -8 3 -3 8 -3 -8 -8 -3 8 -3Z" fill="#fff6b0"/>
        <circle cx="90" cy="30" r="1.8" fill="#fff"/><circle cx="70" cy="80" r="1.4" fill="#cbd5ff"/>
        <circle cx="16" cy="96" r="1.6" fill="#fff"/><path d="M96 92 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2Z" fill="#c9b6ff"/>
      </svg>`)} 0 0/120px 120px, radial-gradient(ellipse at 50% 0%, #2f2a7a, #07061a)`,
      "--board-bg": cell("#100d34", "#1a1650", `<path d="M50 38 l4 10 10 4 -10 4 -4 10 -4 -10 -10 -4 10 -4Z" fill="#2c2780"/>`),
      "--frame-a": "#c9d2ea", "--frame-b": "#3a3f6e", "--frame-c": "#ffffff", "--gem": "#a78bfa", "--gem-glow": "#8b7bff66",
      "--panel-bg": "#100d34cc", "--panel-line": "#7b74d8", "--label": "#ffe9a0",
    },
  },
  {
    id: "candy", name: "과자 나라",
    vars: {
      "--arena-bg": `${svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
        <rect width="120" height="120" fill="#ffd6e6"/>
        <path d="M0 0 L120 120 M60 0 L120 60 M0 60 L60 120" stroke="#ffb3cf" stroke-width="12"/>
        <circle cx="28" cy="88" r="9" fill="#fff" stroke="#ff7aa8" stroke-width="3"/>
        <circle cx="28" cy="88" r="4" fill="#ff7aa8"/>
        <rect x="80" y="20" width="16" height="6" rx="3" fill="#7ad3c5" transform="rotate(30 88 23)"/>
      </svg>`)} 0 0/120px 120px, linear-gradient(#ffe3ee, #ffc4dc)`,
      "--board-bg": cell("#4a2616", "#5c321e", `<rect x="40" y="46" width="14" height="5" rx="2.5" fill="#ff8fb1" transform="rotate(-25 47 48)"/><rect x="54" y="58" width="12" height="5" rx="2.5" fill="#7ad3c5" transform="rotate(20 60 60)"/><circle cx="40" cy="64" r="3" fill="#ffe27a"/>`),
      "--frame-a": "#ff8fb1", "--frame-b": "#b33a6a", "--frame-c": "#ffffff", "--gem": "#7ad3c5", "--gem-glow": "#ff8fb166",
      "--panel-bg": "#4a2616d9", "--panel-line": "#ff8fb1", "--label": "#ffe27a",
    },
  },
];

/** 경기 시드로 테마를 고른다 — 같은 경기의 모든 화면이 같은 무대를 본다. */
export function pickTheme(seed: number): PuyoTheme {
  return PUYO_THEMES[Math.abs(Math.floor(seed)) % PUYO_THEMES.length];
}
