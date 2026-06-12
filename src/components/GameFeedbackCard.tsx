"use client";

import { Icon } from "@/components/Icon";
import { GraphView } from "@/components/GraphView";
import { WordCloud } from "@/components/WordCloud";
import type { GameResultPayload } from "@/lib/lessons";

function fmtDate(ms: number | null): string {
  if (!ms) return "";
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
}

/**
 * 차시 "수업 후 활동"(kind="game-result")에서 게임 결과 피드백을 렌더 — 교사·학생 공용(읽기 전용).
 * 데이터는 활동 생성 시 박제된 스냅샷(GameResultPayload)이라 게임 문서 의존 없이 표시.
 */
export function GameFeedbackCard({
  data,
  myUid,
}: {
  data: GameResultPayload;
  myUid?: string;
}) {
  const ranks = [...(data.ranks ?? [])].sort((a, b) => a.rank - b.rank);
  const hasGraph = !!data.ontology && (data.ontology.nodes?.length ?? 0) > 0;
  return (
    <div className="flex flex-col gap-5">
      {/* 메타 */}
      <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)]">
        <span className="inline-flex items-center gap-1 rounded-full bg-[var(--md-sys-color-tertiary-container)] px-2.5 py-1 text-[var(--md-sys-color-on-tertiary-container)]">
          <Icon name="grid_view" size={14} />
          개념 빙고
        </span>
        <span>{data.gameName}</span>
        {data.playedAt ? <span>· {fmtDate(data.playedAt)}</span> : null}
        {data.boardSize ? (
          <span>
            · {data.boardSize}×{data.boardSize}
          </span>
        ) : null}
      </div>

      {/* AI 코멘트 */}
      {data.comment ? (
        <div className="flex gap-2 rounded-2xl border border-[var(--md-sys-color-primary)] bg-[color-mix(in_srgb,var(--md-sys-color-primary)_7%,transparent)] p-4">
          <Icon
            name="auto_awesome"
            size={18}
            className="mt-0.5 shrink-0 text-[var(--md-sys-color-primary)]"
          />
          <p className="whitespace-pre-line text-sm leading-relaxed text-[var(--md-sys-color-on-surface)]">
            {data.comment}
          </p>
        </div>
      ) : null}

      {/* 개념 지식맵 */}
      {hasGraph ? (
        <section className="flex flex-col gap-2">
          <h4 className="flex items-center gap-1.5 text-sm font-extrabold text-[var(--md-sys-color-on-surface)]">
            <Icon name="hub" size={18} />
            개념 지식맵
            <span className="text-xs font-medium text-[var(--md-sys-color-on-surface-variant)]">
              의미가 비슷한 개념끼리 연결
            </span>
          </h4>
          <div className="overflow-hidden rounded-2xl bg-white/40 p-2 dark:bg-white/5">
            <GraphView
              data={data.ontology!}
              height={380}
              title={`${data.gameName} 개념 지식맵`}
            />
          </div>
        </section>
      ) : null}

      {/* 워드클라우드 */}
      {data.wordCloud?.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h4 className="flex items-center gap-1.5 text-sm font-extrabold text-[var(--md-sys-color-on-surface)]">
            <Icon name="cloud" size={18} />
            개념어 워드클라우드
            <span className="text-xs font-medium text-[var(--md-sys-color-on-surface-variant)]">
              많이 떠올린 개념일수록 크게
            </span>
          </h4>
          <WordCloud items={data.wordCloud} />
        </section>
      ) : null}

      {/* 순위 결과 */}
      {ranks.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h4 className="flex items-center gap-1.5 text-sm font-extrabold text-[var(--md-sys-color-on-surface)]">
            <Icon name="emoji_events" size={18} />
            완성 순위
          </h4>
          <ol className="flex flex-col gap-1.5">
            {ranks.map((r) => {
              const isMe = !!myUid && r.uid === myUid;
              return (
                <li
                  key={r.uid}
                  className={`flex items-center gap-3 rounded-2xl border px-4 py-2.5 ${
                    isMe
                      ? "border-[var(--md-sys-color-tertiary)] bg-[var(--md-sys-color-tertiary-container)] text-[var(--md-sys-color-on-tertiary-container)]"
                      : "border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] text-[var(--md-sys-color-on-surface)]"
                  }`}
                >
                  <span className="w-9 shrink-0 text-center text-lg font-black leading-none">
                    {r.rank}등
                  </span>
                  <span className="line-clamp-1 flex-1 text-sm font-extrabold">
                    {r.name}
                    {isMe ? (
                      <span className="ml-1 text-xs font-bold opacity-70">
                        (나)
                      </span>
                    ) : null}
                  </span>
                  <span className="text-[11px] font-bold opacity-70">
                    {r.doneAtTurn}번째에 완성
                  </span>
                </li>
              );
            })}
          </ol>
        </section>
      ) : null}
    </div>
  );
}
