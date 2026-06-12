"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { listQuestions, type Lesson } from "@/lib/lessons";

type Board = {
  lid: string;
  lessonTitle: string;
  qid: string;
  title: string;
  group: boolean;
};

/** 학급에서 만든 캔버스 목록 — 학급 캔버스 + 차시 보드 활동. 클릭하면 해당 캔버스로 이동. */
export function CanvasListModal({
  cid,
  lessons,
  onClose,
}: {
  cid: string;
  lessons: Lesson[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [boards, setBoards] = useState<Board[] | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const all: Board[] = [];
      for (const l of lessons) {
        const qs = await listQuestions(cid, l.id).catch(() => []);
        for (const q of qs) {
          if (q.kind === "canvas")
            all.push({
              lid: l.id,
              lessonTitle: l.title || "차시",
              qid: q.id,
              title: q.title || "보드",
              group: q.boardMode === "group",
            });
        }
      }
      if (alive) setBoards(all);
    })();
    return () => {
      alive = false;
    };
  }, [cid, lessons]);

  function go(url: string) {
    onClose();
    router.push(url);
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-[rgba(0,0,0,0.32)] p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-3xl bg-[var(--md-sys-color-surface-container-high)] shadow-[var(--md-sys-elevation-3)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-[var(--md-sys-color-outline-variant)] px-5 py-4">
          <Icon
            name="dashboard"
            size={20}
            className="text-[var(--md-sys-color-primary)]"
          />
          <p className="text-lg font-semibold">캔버스</p>
          <button
            onClick={onClose}
            className="ml-auto flex h-9 w-9 items-center justify-center rounded-full text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-highest)]"
          >
            <Icon name="close" size={20} />
          </button>
        </div>

        <div className="flex flex-col gap-4 overflow-y-auto p-4">
          {/* 학급 캔버스(공용) */}
          <button
            onClick={() => go(`/canvas/?class=${cid}`)}
            className="flex items-center gap-3 rounded-2xl bg-[var(--md-sys-color-primary-container)] p-4 text-left transition hover:brightness-105"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/60 text-[var(--md-sys-color-primary)]">
              <Icon name="space_dashboard" size={22} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-[var(--md-sys-color-on-primary-container)]">
                학급 캔버스
              </p>
              <p className="text-xs text-[var(--md-sys-color-on-primary-container)]/70">
                학급 전체가 함께 쓰는 무한 캔버스
              </p>
            </div>
            <Icon
              name="chevron_right"
              size={20}
              className="shrink-0 text-[var(--md-sys-color-on-primary-container)]/60"
            />
          </button>

          {/* 차시 보드 활동 */}
          <div>
            <p className="mb-2 px-1 text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)]">
              차시 보드
            </p>
            {boards === null ? (
              <p className="py-4 text-center text-xs text-black/40">
                불러오는 중…
              </p>
            ) : boards.length === 0 ? (
              <p className="rounded-xl bg-[var(--md-sys-color-surface-container)] px-3 py-4 text-center text-xs text-[var(--md-sys-color-on-surface-variant)]">
                아직 차시에 만든 보드가 없어요. 차시 활동에서 “보드(캔버스)”를
                추가하면 여기에 보여요.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {boards.map((b) => (
                  <li key={`${b.lid}:${b.qid}`}>
                    <button
                      onClick={() =>
                        go(`/canvas/?class=${cid}&lesson=${b.lid}&q=${b.qid}`)
                      }
                      className="flex w-full items-center gap-3 rounded-2xl bg-[var(--md-sys-color-surface-container)] p-3 text-left transition hover:bg-[var(--md-sys-color-surface-container-highest)]"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--md-sys-color-tertiary-container)] text-[var(--md-sys-color-on-tertiary-container)]">
                        <Icon name="dashboard" size={18} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">
                          {b.title}
                          {b.group && (
                            <span className="ml-1.5 rounded-full bg-[var(--md-sys-color-secondary-container)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--md-sys-color-on-secondary-container)]">
                              모둠별
                            </span>
                          )}
                        </p>
                        <p className="truncate text-xs text-[var(--md-sys-color-on-surface-variant)]">
                          {b.lessonTitle}
                        </p>
                      </div>
                      <Icon
                        name="chevron_right"
                        size={18}
                        className="shrink-0 text-black/30"
                      />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
