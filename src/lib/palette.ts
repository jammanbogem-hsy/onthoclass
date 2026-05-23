// 카테고리/작성자/모둠 구분용 공용 색 팔레트 (여러 화면에서 동일하게 사용)
export const CATEGORY_PALETTE = [
  "#4f7cff",
  "#23b27a",
  "#f5a623",
  "#a66bff",
  "#ff6f91",
  "#0ea5e9",
  "#14b8a6",
  "#ef4444",
];

// 비교 그래프(사전/사후) 공용 색
export const PREPOST_COLOR: Record<"pre" | "both" | "post", string> = {
  pre: "#f5a623", // 수업 전에만 (주황)
  both: "#d6209c", // 공통 (자홍 — 가장 눈에 띄게)
  post: "#23b27a", // 수업 후 신규 (초록)
};

// 모둠 간 비교에서 여러 모둠 공통 노드 색
export const GROUP_COMMON_COLOR = "#475569";

// uid 해시 → 팔레트 색 (작성자 색 등)
export function paletteFor(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return CATEGORY_PALETTE[h % CATEGORY_PALETTE.length];
}
