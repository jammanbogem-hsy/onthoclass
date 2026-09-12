"use client";

/**
 * 명예의 전당 — 게임이 끝난 뒤 학생이 보는 결과 화면.
 *
 * 왼쪽에 학급 전체 순위, 오른쪽에 내 러닝볼 사진을 둔다. 아이들이 가장 먼저
 * 찾는 것이 "내가 몇 등인지"와 "내 공이 어떻게 생겼는지" 두 가지라서다.
 *
 * 사진은 게임이 끝나는 순간 각자의 화면에서 찍혀 올라온다. 아직 안 올라왔으면
 * 자리를 비워 두고 기다린다("정리하는 중").
 */

import { Icon } from "@/components/Icon";
import { useNameMask } from "@/components/NameMask";
import type { QuizRun, RankBreakdown } from "@/lib/quizrun";

const MEDAL = ["#d9a400", "#9098a1", "#b0763a"];

export function QuizRunHallOfFame({
  ranking,
  runs,
  uid,
}: {
  ranking: RankBreakdown[];
  runs: QuizRun[];
  uid: string;
}) {
  const { mask } = useNameMask();
  const myRank = ranking.findIndex((r) => r.uid === uid);
  const me = runs.find((r) => r.uid === uid) ?? null;
  const scoreByUid = new Map(runs.map((r) => [r.uid, r.score ?? 0]));

  return (
    <div className="w-full">
      <p className="mb-3 flex items-center justify-center gap-2 text-xl font-black">
        <Icon
          name="trophy"
          size={24}
          fill
          style={{ color: "#d9a400" }}
        />
        명예의 전당
      </p>

      <div className="grid gap-3 md:grid-cols-[1fr_260px]">
        {/* 왼쪽 — 학급 전체 순위 */}
        <ol className="flex flex-col gap-1.5">
          {ranking.map((r, i) => {
            const isMe = r.uid === uid;
            return (
              <li
                key={r.uid}
                className={`flex items-center gap-2.5 rounded-2xl px-3 py-2 ${
                  isMe
                    ? "bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)]"
                    : "bg-[var(--md-sys-color-surface-container)]"
                }`}
              >
                <span className="flex w-7 shrink-0 justify-center">
                  {i < 3 ? (
                    <Icon name="trophy" size={20} fill style={{ color: MEDAL[i] }} />
                  ) : (
                    <span className="text-sm font-bold tabular-nums opacity-70">
                      {i + 1}
                    </span>
                  )}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-bold">
                  {mask(r.name)}
                  {isMe && <span className="ml-1 text-xs">(나)</span>}
                </span>
                <span className="shrink-0 rounded-full bg-black/10 px-2 py-0.5 text-[11px] font-bold tabular-nums">
                  맵 {r.stageIndex + 1}
                </span>
                <span className="shrink-0 text-right text-sm font-black tabular-nums">
                  {r.collected}
                  <span className="ml-0.5 text-[11px] font-bold">개</span>
                </span>
                <span className="w-16 shrink-0 text-right text-xs tabular-nums opacity-75">
                  {Math.round(scoreByUid.get(r.uid) ?? 0).toLocaleString()}점
                </span>
              </li>
            );
          })}
        </ol>

        {/* 오른쪽 — 내 러닝볼 */}
        <aside className="flex flex-col gap-2 rounded-2xl bg-[var(--md-sys-color-surface-container)] p-3">
          <p className="text-center text-xs font-bold text-[var(--md-sys-color-on-surface-variant)]">
            내 러닝볼
          </p>
          {me?.shotUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={me.shotUrl}
              alt="내 러닝볼"
              className="aspect-square w-full rounded-xl object-cover"
            />
          ) : (
            <div className="flex aspect-square w-full flex-col items-center justify-center gap-2 rounded-xl bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)]">
              <Icon name="photo_camera" size={28} />
              <p className="text-xs">사진을 정리하는 중…</p>
            </div>
          )}
          {myRank >= 0 && (
            <div className="text-center">
              <p className="text-2xl font-black text-[var(--md-sys-color-primary)]">
                {myRank + 1}등
              </p>
              <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                {ranking[myRank].collected}개 모음 ·{" "}
                {Math.round(me?.score ?? 0).toLocaleString()}점
              </p>
              <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                정답 {ranking[myRank].correct}개 / 맵{" "}
                {ranking[myRank].stageIndex + 1}
              </p>
            </div>
          )}
        </aside>
      </div>

      <p className="mt-3 text-center text-xs text-[var(--md-sys-color-on-surface-variant)]">
        경험치는 선생님이 확인한 뒤 지급돼요
      </p>
    </div>
  );
}
