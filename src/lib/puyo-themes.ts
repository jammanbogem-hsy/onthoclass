// 뿌요뿌요 경기 배경 테마 — 경기마다(시드로) 하나를 골라 두 학생이 같은 무대를 본다.
// 무대는 로컬 배경 이미지, 보드 칸은 기존 SVG 타일. 재질과 플레이어 색은 CSS 변수로 넘긴다.

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
      "--arena-bg": 'linear-gradient(#07101c12, #07101c38), url("/puyo/backgrounds/factory-v1.webp") center / cover no-repeat #1a0805',
      "--board-bg": cell("#3a0a06", "#5c120a", `<path d="M30 62 q10 -22 22 -6 t20 -12" stroke="#c63a1c" stroke-width="7" fill="none" stroke-linecap="round"/>`),
      "--frame-a": "#e0682c", "--frame-b": "#7a1c0c", "--frame-c": "#ffb37a", "--gem": "#26c46a", "--gem-glow": "#ff6a2a66",
      "--panel-bg": "#3a0a06cc", "--panel-line": "#c2401a", "--label": "#7dff6a",
    },
  },
  {
    id: "sea", name: "깊은 바다",
    vars: {
      "--arena-bg": 'linear-gradient(#07101c12, #07101c38), url("/puyo/backgrounds/sea-v1.webp") center / cover no-repeat #021326',
      "--board-bg": cell("#04223e", "#073457", `<circle cx="50" cy="56" r="13" fill="none" stroke="#1a6fa3" stroke-width="5"/><circle cx="58" cy="44" r="3" fill="#1a6fa3"/>`),
      "--frame-a": "#f2c46b", "--frame-b": "#0c4a73", "--frame-c": "#fff1c2", "--gem": "#ff8fb1", "--gem-glow": "#4fc3ff55",
      "--panel-bg": "#04223ecc", "--panel-line": "#3aa0d8", "--label": "#9be8ff",
    },
  },
  {
    id: "forest", name: "마법 숲",
    vars: {
      "--arena-bg": 'linear-gradient(#07101c12, #07101c38), url("/puyo/backgrounds/forest-v1.webp") center / cover no-repeat #061409',
      "--board-bg": cell("#0c2a12", "#123d1a", `<path d="M34 60 q16 -26 32 0 q-16 14 -32 0Z" fill="#1f6a2a"/>`),
      "--frame-a": "#b07a3a", "--frame-b": "#4a2a10", "--frame-c": "#e8c48a", "--gem": "#ffb02e", "--gem-glow": "#9be06a55",
      "--panel-bg": "#0c2a12cc", "--panel-line": "#5aa84a", "--label": "#c8ff7a",
    },
  },
  {
    id: "night", name: "별빛 하늘",
    vars: {
      "--arena-bg": 'linear-gradient(#07101c12, #07101c38), url("/puyo/backgrounds/night-v1.webp") center / cover no-repeat #07061a',
      "--board-bg": cell("#100d34", "#1a1650", `<path d="M50 38 l4 10 10 4 -10 4 -4 10 -4 -10 -10 -4 10 -4Z" fill="#2c2780"/>`),
      "--frame-a": "#c9d2ea", "--frame-b": "#3a3f6e", "--frame-c": "#ffffff", "--gem": "#a78bfa", "--gem-glow": "#8b7bff66",
      "--panel-bg": "#100d34cc", "--panel-line": "#7b74d8", "--label": "#ffe9a0",
    },
  },
  {
    id: "candy", name: "과자 나라",
    vars: {
      "--arena-bg": 'linear-gradient(#07101c12, #07101c38), url("/puyo/backgrounds/candy-v1.webp") center / cover no-repeat #ffd6e6',
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

/** 참가 순서에 따른 고정 색: 화면에서 내 보드가 왼쪽으로 옮겨져도 같은 색을 유지한다. */
const PLAYER_COLORS = [
  ["#24baff", "#07558e", "#c5f2ff", "#032a49"],
  ["#ff6594", "#941f50", "#ffe0ed", "#4b1029"],
  ["#53d77a", "#176c3d", "#dcffe5", "#073d23"],
  ["#ffd34d", "#996015", "#fff4c7", "#482c06"],
];

export function playerPalette(index: number): Record<string, string> {
  const [color, deep, light, ink] = PLAYER_COLORS[((index % 4) + 4) % 4];
  return { "--player": color, "--player-deep": deep, "--player-light": light, "--player-ink": ink };
}
