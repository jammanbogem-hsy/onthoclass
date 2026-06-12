"use client";

// 가이드 길안내 문장 빌더 — 드롭다운으로 교과서 표현을 조합한다.
//   Start from the {start}.
//   Go straight {one/two/three} block(s) and turn {left/right} at the {place}.  (1개 이상)
//   It's next to the {place}.  또는  It's on your {left/right}.
import {
  PLACE_BY_ID,
  endingToEnglish,
  stepToEnglish,
  type DirectionEnding,
  type DirectionStep,
} from "./types";

const SELECT_CLS =
  "rounded-lg border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] px-2 py-1 text-sm text-[var(--md-sys-color-on-surface)]";

function en(id: string): string {
  // 'n:3' → 확정된 빈칸 번호(건물이 없는 자리). 영어 문장엔 "no. 3" 로 표기.
  if (id.startsWith("n:")) return `no. ${id.slice(2)}`;
  return PLACE_BY_ID[id]?.en ?? "___";
}

// 시작점은 지도의 진입 화살표가 나타내므로 "Start from the …" 문장은 넣지 않는다.
export function directionsToEnglish(
  steps: DirectionStep[],
  ending: DirectionEnding | null
): string[] {
  const lines: string[] = [];
  steps.forEach((s) => lines.push(stepToEnglish(s, en)));
  if (ending) lines.push(endingToEnglish(ending, en));
  return lines;
}

export function DirectionBuilder({
  placedIds,
  slotNumbers = [],
  steps,
  ending,
  onStepsChange,
  onEndingChange,
}: {
  placedIds: string[];
  /** 확정된 빈칸 번호들(건물 없는 자리). 'at the'·'next to the' 선택지에 추가된다. */
  slotNumbers?: number[];
  steps: DirectionStep[];
  ending: DirectionEnding | null;
  onStepsChange: (next: DirectionStep[]) => void;
  onEndingChange: (next: DirectionEnding) => void;
}) {
  function setStep(i: number, patch: Partial<DirectionStep>) {
    onStepsChange(steps.map((s, k) => (k === i ? { ...s, ...patch } : s)));
  }
  function addStep() {
    onStepsChange([
      ...steps,
      { blocks: 1, turn: "left", at: placedIds[0] ?? "" },
    ]);
  }
  function removeStep(i: number) {
    onStepsChange(steps.filter((_, k) => k !== i));
  }

  // 선택지 = 배치한 건물(이름) + 확정된 빈칸 번호(no. N). 건물이 안 놓인 자리는 번호로 지칭.
  const placeOptions = [
    ...placedIds.map((id) => (
      <option key={id} value={id}>
        {en(id)}
      </option>
    )),
    ...slotNumbers.map((nn) => (
      <option key={`n:${nn}`} value={`n:${nn}`}>
        no. {nn} (빈칸)
      </option>
    )),
  ];

  const preview = directionsToEnglish(steps, ending);

  return (
    <div className="space-y-4">
      {/* 안내 단계들 */}
      <div className="space-y-2">
        {steps.map((s, i) => (
          <div
            key={i}
            className="flex flex-wrap items-center gap-1.5 rounded-xl bg-[var(--md-sys-color-surface-container-low)] p-2 text-sm text-[var(--md-sys-color-on-surface-variant)]"
          >
            <span>Go straight</span>
            <select
              className={SELECT_CLS}
              value={s.blocks}
              onChange={(e) =>
                setStep(i, { blocks: Number(e.target.value) as 1 | 2 | 3 })
              }
            >
              <option value={1}>one block</option>
              <option value={2}>two blocks</option>
              <option value={3}>three blocks</option>
            </select>
            <span>and turn</span>
            <select
              className={SELECT_CLS}
              value={s.turn}
              onChange={(e) =>
                setStep(i, { turn: e.target.value as "left" | "right" })
              }
            >
              <option value="left">left</option>
              <option value="right">right</option>
            </select>
            <span>at the</span>
            <select
              className={SELECT_CLS}
              value={s.at}
              onChange={(e) => setStep(i, { at: e.target.value })}
            >
              <option value="">장소 선택</option>
              {placeOptions}
            </select>
            <button
              type="button"
              onClick={() => removeStep(i)}
              className="ml-auto rounded-full px-2 text-[var(--md-sys-color-error)] hover:bg-[var(--md-sys-color-error-container)]"
              aria-label="단계 삭제"
            >
              ✕
            </button>
          </div>
        ))}
        {steps.length < 4 && (
          <button
            type="button"
            onClick={addStep}
            className="rounded-full border border-[var(--md-sys-color-outline-variant)] px-3 py-1.5 text-sm font-medium text-[var(--md-sys-color-primary)]"
          >
            + 안내 문장 추가
          </button>
        )}
      </div>

      {/* 도착 위치 표현 */}
      <div className="flex flex-wrap items-center gap-1.5 rounded-xl bg-[var(--md-sys-color-surface-container-low)] p-2 text-sm text-[var(--md-sys-color-on-surface-variant)]">
        <span>It&apos;s</span>
        <select
          className={SELECT_CLS}
          value={ending?.type === "side" ? `side:${ending.side}` : ending?.type === "next_to" ? "next_to" : ""}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "next_to")
              onEndingChange({ type: "next_to", place: placedIds[0] ?? "" });
            else if (v === "side:left") onEndingChange({ type: "side", side: "left" });
            else if (v === "side:right") onEndingChange({ type: "side", side: "right" });
          }}
        >
          <option value="">선택</option>
          <option value="next_to">next to the …</option>
          <option value="side:left">on your left</option>
          <option value="side:right">on your right</option>
        </select>
        {ending?.type === "next_to" && (
          <select
            className={SELECT_CLS}
            value={ending.place}
            onChange={(e) => onEndingChange({ type: "next_to", place: e.target.value })}
          >
            <option value="">장소 선택</option>
            {placeOptions}
          </select>
        )}
      </div>

      {/* 영어 미리보기 */}
      <div className="rounded-xl bg-[var(--md-sys-color-secondary-container)] p-3">
        <p className="mb-1 text-xs font-medium text-[var(--md-sys-color-on-secondary-container)]">
          미리보기
        </p>
        {preview.length === 0 ? (
          <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">
            시작점과 안내 문장을 채워 보세요.
          </p>
        ) : (
          <p className="text-sm leading-relaxed text-[var(--md-sys-color-on-secondary-container)]">
            {preview.join(" ")}
          </p>
        )}
      </div>
    </div>
  );
}
