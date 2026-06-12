"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { AttachmentList } from "@/components/AttachmentField";
import {
  setFeedbackStatus,
  watchFeedback,
  type Feedback,
  type FeedbackKind,
} from "@/lib/feedback";
import { listMembers, type Member } from "@/lib/classes";
import { resolveStudentName } from "@/lib/names";

const KIND_META: Record<
  FeedbackKind,
  { label: string; icon: string; color: string }
> = {
  bug: {
    label: "오류",
    icon: "bug_report",
    color: "var(--md-sys-color-error)",
  },
  idea: {
    label: "건의",
    icon: "lightbulb",
    color: "var(--md-sys-color-tertiary)",
  },
  other: {
    label: "기타",
    icon: "chat",
    color: "var(--md-sys-color-primary)",
  },
};

function fmt(ms: number | null): string {
  if (!ms) return "";
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getMonth() + 1}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * 교사: 학생 오류 신고 / 피드백 받은함. 종류·처리상태 필터 + 사진 확인 + 처리 완료 토글.
 */
export function FeedbackInboxModal({
  cid,
  onClose,
}: {
  cid: string;
  onClose: () => void;
}) {
  const [list, setList] = useState<Feedback[] | null>(null);
  const [filter, setFilter] = useState<"open" | "all">("open");
  const [members, setMembers] = useState<Member[]>([]);

  useEffect(() => watchFeedback(cid, setList), [cid]);
  useEffect(() => {
    listMembers(cid).then(setMembers).catch(() => {});
  }, [cid]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const shown = useMemo(
    () =>
      (list ?? []).filter((f) => (filter === "open" ? f.status === "open" : true)),
    [list, filter]
  );
  const openCount = (list ?? []).filter((f) => f.status === "open").length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--md-sys-color-scrim)]/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex h-[88vh] max-h-[860px] w-full max-w-2xl animate-float-in flex-col overflow-hidden rounded-3xl bg-[var(--md-sys-color-surface-container-high)] shadow-[var(--md-sys-elevation-3)]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-2 border-b border-[var(--md-sys-color-outline-variant)] px-5 py-4">
          <h2 className="flex items-center gap-2 text-lg font-extrabold text-[var(--md-sys-color-on-surface)]">
            <Icon name="feedback" size={22} />
            학생 피드백 · 오류 신고
            {openCount > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--md-sys-color-error)] px-1.5 text-xs font-bold text-white">
                {openCount}
              </span>
            )}
          </h2>
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--md-sys-color-on-surface-variant)] hover:bg-black/5"
            aria-label="닫기"
          >
            <Icon name="close" size={22} />
          </button>
        </header>

        {/* 필터 */}
        <div className="flex items-center gap-2 border-b border-[var(--md-sys-color-outline-variant)] px-5 py-2.5">
          {(["open", "all"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-full px-3 py-1 text-xs font-bold transition ${
                filter === f
                  ? "bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)]"
                  : "text-[var(--md-sys-color-on-surface-variant)] hover:bg-black/5"
              }`}
            >
              {f === "open" ? "처리 전" : "전체"}
            </button>
          ))}
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-5">
          {list === null ? (
            <p className="p-3 text-sm text-[var(--md-sys-color-on-surface-variant)]">
              불러오는 중…
            </p>
          ) : shown.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center text-[var(--md-sys-color-on-surface-variant)]">
              <Icon name="inbox" size={32} />
              <p className="text-sm font-semibold">
                {filter === "open"
                  ? "처리할 피드백이 없어요."
                  : "아직 받은 피드백이 없어요."}
              </p>
            </div>
          ) : (
            shown.map((f) => {
              const meta = KIND_META[f.kind];
              return (
                <div
                  key={f.id}
                  className={`flex flex-col gap-2 rounded-2xl border-2 p-4 ${
                    f.status === "done"
                      ? "border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] opacity-70"
                      : "border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)]"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold text-white"
                      style={{ backgroundColor: meta.color }}
                    >
                      <Icon name={meta.icon} size={13} />
                      {meta.label}
                    </span>
                    <span className="line-clamp-1 flex-1 text-sm font-extrabold text-[var(--md-sys-color-on-surface)]">
                      {f.title}
                    </span>
                    {f.status === "done" && (
                      <span className="shrink-0 rounded-full bg-[var(--md-sys-color-surface-container-highest)] px-2 py-0.5 text-[10px] font-bold text-[var(--md-sys-color-on-surface-variant)]">
                        처리됨
                      </span>
                    )}
                  </div>

                  {f.body && (
                    <p className="whitespace-pre-line text-sm text-[var(--md-sys-color-on-surface)]">
                      {f.body}
                    </p>
                  )}

                  {f.attachments.length > 0 && (
                    <AttachmentList attachments={f.attachments} compact />
                  )}

                  <div className="flex items-center justify-between gap-2 pt-1">
                    <span className="text-[11px] font-semibold text-[var(--md-sys-color-on-surface-variant)]">
                      {resolveStudentName(members, f.byUid, f.byName, "이름없음")}{" "}
                      · {fmt(f.createdAt)}
                      {f.page ? ` · ${f.page}` : ""}
                    </span>
                    <button
                      onClick={() =>
                        setFeedbackStatus(
                          cid,
                          f.id,
                          f.status === "done" ? "open" : "done"
                        ).catch(() => {})
                      }
                      className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold transition ${
                        f.status === "done"
                          ? "text-[var(--md-sys-color-on-surface-variant)] hover:bg-black/5"
                          : "bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)]"
                      }`}
                    >
                      <Icon
                        name={f.status === "done" ? "undo" : "check"}
                        size={14}
                      />
                      {f.status === "done" ? "되돌리기" : "처리 완료"}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
