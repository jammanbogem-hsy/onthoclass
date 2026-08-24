"use client";

/**
 * 문제 불러오기 — 같은 문제를 반마다 다시 입력하지 않도록.
 *
 * 두 경로:
 *   1) 지난 퀴즈런  — 이전에 만든 문제 세트를 통째로
 *   2) 차시 문항     — 차시에 만들어 둔 객관식 문항(정답 있는 것만)
 *
 * 불러온 문항은 새 id 를 받는다(cloneItems/fromLessonQuestions) — 원본과 id 가
 * 겹치면 학생별 순서 셔플에서 같은 문제가 두 번 잡힌다.
 */

import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { blocksToPlainText } from "@/components/RichEditor";
import { listLessons, listQuestions, type Lesson } from "@/lib/lessons";
import {
  cloneItems,
  fromLessonQuestions,
  listPastQuizSets,
  type PastQuizSet,
  type QuizItem,
} from "@/lib/quizrun";

type Tab = "past" | "lesson";

export function QuizImportModal({
  cid,
  onPick,
  onClose,
}: {
  cid: string;
  /** 고른 문항들 — 호출부가 기존 목록에 이어붙인다 */
  onPick: (items: QuizItem[]) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>("past");
  const [past, setPast] = useState<PastQuizSet[] | null>(null);
  const [lessons, setLessons] = useState<Lesson[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    listPastQuizSets(cid)
      .then(setPast)
      .catch(() => setPast([]));
    listLessons(cid)
      .then(setLessons)
      .catch(() => setLessons([]));
  }, [cid]);

  const pickLesson = useCallback(
    async (lid: string) => {
      setBusyId(lid);
      setErr("");
      try {
        const qs = await listQuestions(cid, lid);
        const items = fromLessonQuestions(qs, blocksToPlainText);
        if (items.length === 0) {
          setErr("이 차시에는 정답이 설정된 객관식 문항이 없습니다.");
          return;
        }
        onPick(items);
      } catch {
        setErr("문항을 불러오지 못했습니다.");
      } finally {
        setBusyId(null);
      }
    },
    [cid, onPick]
  );

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-[var(--md-sys-color-scrim)]/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="flex h-[70vh] max-h-[640px] w-full max-w-lg animate-float-in flex-col overflow-hidden rounded-3xl bg-[var(--md-sys-color-surface-container-high)] shadow-[var(--md-sys-elevation-3)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--md-sys-color-outline-variant)] px-5 py-3.5">
          <h3 className="flex items-center gap-2 text-base font-bold">
            <Icon
              name="download"
              size={18}
              className="text-[var(--md-sys-color-primary)]"
            />
            문제 불러오기
          </h3>
          <button
            onClick={onClose}
            aria-label="닫기"
            className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--md-sys-color-on-surface-variant)] hover:bg-black/5"
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="flex gap-1 px-5 pt-3">
          {(
            [
              ["past", "지난 게임"],
              ["lesson", "차시 문항"],
            ] as const
          ).map(([t, label]) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-full px-3.5 py-1.5 text-sm font-bold transition ${
                tab === t
                  ? "bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)]"
                  : "text-[var(--md-sys-color-on-surface-variant)] hover:bg-black/5"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {err && (
          <p className="mx-5 mt-2 rounded-xl bg-[var(--md-sys-color-error-container)] px-3 py-2 text-xs text-[var(--md-sys-color-on-error-container)]">
            {err}
          </p>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {tab === "past" ? (
            past === null ? (
              <p className="py-8 text-center text-sm text-[var(--md-sys-color-on-surface-variant)]">
                불러오는 중…
              </p>
            ) : past.length === 0 ? (
              <p className="rounded-2xl bg-[var(--md-sys-color-surface-container)] py-8 text-center text-sm text-[var(--md-sys-color-on-surface-variant)]">
                지난 퀴즈런이 아직 없어요.
              </p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {past.map((p) => (
                  <li key={p.gameId}>
                    <button
                      onClick={() => onPick(cloneItems(p.items))}
                      className="flex w-full items-center gap-3 rounded-2xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] px-4 py-3 text-left transition hover:border-[var(--md-sys-color-primary)]"
                    >
                      <Icon
                        name="sports_esports"
                        size={18}
                        className="shrink-0 text-[var(--md-sys-color-primary)]"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold">
                          {p.label}
                        </span>
                        <span className="block text-xs text-[var(--md-sys-color-on-surface-variant)]">
                          문제 {p.items.length}개
                          {p.createdAt
                            ? ` · ${new Date(p.createdAt).toLocaleDateString("ko-KR")}`
                            : ""}
                        </span>
                      </span>
                      <Icon
                        name="add"
                        size={18}
                        className="shrink-0 text-[var(--md-sys-color-on-surface-variant)]"
                      />
                    </button>
                  </li>
                ))}
              </ul>
            )
          ) : lessons === null ? (
            <p className="py-8 text-center text-sm text-[var(--md-sys-color-on-surface-variant)]">
              불러오는 중…
            </p>
          ) : lessons.length === 0 ? (
            <p className="rounded-2xl bg-[var(--md-sys-color-surface-container)] py-8 text-center text-sm text-[var(--md-sys-color-on-surface-variant)]">
              차시가 아직 없어요.
            </p>
          ) : (
            <>
              <p className="mb-2 text-xs text-[var(--md-sys-color-on-surface-variant)]">
                차시의 객관식 문항 중 <b>정답이 설정된 것</b>만 가져옵니다.
              </p>
              <ul className="flex flex-col gap-1.5">
                {lessons.map((l) => (
                  <li key={l.id}>
                    <button
                      onClick={() => pickLesson(l.id)}
                      disabled={busyId === l.id}
                      className="flex w-full items-center gap-3 rounded-2xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] px-4 py-3 text-left transition hover:border-[var(--md-sys-color-primary)] disabled:opacity-50"
                    >
                      <Icon
                        name="menu_book"
                        size={18}
                        className="shrink-0 text-[var(--md-sys-color-primary)]"
                      />
                      <span className="min-w-0 flex-1 truncate text-sm font-bold">
                        {l.title}
                      </span>
                      <Icon
                        name={busyId === l.id ? "hourglass_top" : "add"}
                        size={18}
                        className="shrink-0 text-[var(--md-sys-color-on-surface-variant)]"
                      />
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
