import { bingoLineCells } from "@/lib/games";

/**
 * 빙고판 실루엣 미니뷰 — 단어는 숨기고 "체크된 칸/FREE/빙고줄"만 색으로 표시.
 * 교사 콘솔 상황보기, 학생 친구 현황 패널 공용. (작게도 잘 보이도록 점/아이콘 없이 칸을 진하게 채움)
 * - 체크(마크) 칸: 진한 단색 / FREE 칸: 연한 톤 / 빙고 줄: 강조색 / 나머지: 빈 칸
 * called 가 주어지면 "마크 ∩ 호출된 단어"만 유효 마크로(호출 취소 즉시 반영).
 */
export function MiniBoard({
  board,
  marked,
  N,
  called,
}: {
  board: (string | null)[];
  marked: string[];
  N: number;
  called?: Set<string>;
}) {
  const validMarked = called ? marked.filter((w) => called.has(w)) : marked;
  const lineCells = bingoLineCells(board, validMarked, N);
  const markedSet = new Set(validMarked);
  return (
    <div
      className="grid gap-px overflow-hidden rounded-[3px]"
      style={{
        gridTemplateColumns: `repeat(${N}, minmax(0, 1fr))`,
        backgroundColor: "var(--md-sys-color-outline-variant)",
      }}
      aria-hidden
    >
      {board.map((w, i) => {
        const isFree = !w;
        const isMarked = !!w && markedSet.has(w);
        const inLine = lineCells.has(i);
        return (
          <div
            key={i}
            className="aspect-square"
            style={{
              backgroundColor: inLine
                ? "#e6a400" // 빙고 줄 — 골드(작아도 체크칸과 또렷이 구분)
                : isMarked
                  ? "var(--md-sys-color-primary)" // 체크 — 진한 단색
                  : isFree
                    ? "color-mix(in srgb, var(--md-sys-color-primary) 16%, white)" // FREE — 연한 톤
                    : "white", // 빈 칸
            }}
          />
        );
      })}
    </div>
  );
}
