"use client";

import { useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import {
  XP_PER_PRESENTATION,
  type PresentationRequest,
} from "@/lib/presentations";
import { resolveStudentName } from "@/lib/names";
import type { Member } from "@/lib/classes";

/**
 * 교사 발표 승인 — [승인 대기] 탭에서 승인/거절, [내역] 탭에서 처리한 발표 신청 열람.
 * 승인 시 발표 1회당 고정 XP(XP_PER_PRESENTATION)를 받은 학생에게 지급(상위에서 onApprove 처리).
 */
export function PresentationManageModal({
  requests,
  members = [],
  onApprove,
  onReject,
  onClose,
}: {
  requests: PresentationRequest[];
  members?: Member[];
  onApprove: (req: PresentationRequest) => void;
  onReject: (id: string) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"pending" | "history">("pending");
  // 굳은 fromName 대신 현재 명단 이름으로 표시
  const nameOf = (r: PresentationRequest) =>
    resolveStudentName(members, r.fromUid, r.fromName);

  const pending = useMemo(
    () => requests.filter((r) => r.status === "pending"),
    [requests]
  );
  const history = useMemo(
    () =>
      requests
        .filter((r) => r.status !== "pending")
        .sort((a, b) => (b.decidedAt ?? 0) - (a.decidedAt ?? 0)),
    [requests]
  );

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-[rgba(0,0,0,0.32)] p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl bg-[var(--md-sys-color-surface-container-high)] shadow-[var(--md-sys-elevation-3)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-[var(--md-sys-color-outline-variant)] px-5 py-4">
          <Icon
            name="co_present"
            size={20}
            className="text-[var(--md-sys-color-primary)]"
          />
          <p className="text-lg font-semibold">발표 승인</p>
          <button
            onClick={onClose}
            className="ml-auto flex h-9 w-9 items-center justify-center rounded-full text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-highest)]"
          >
            <Icon name="close" size={20} />
          </button>
        </div>

        {/* 탭 */}
        <div className="flex gap-1.5 px-5 pt-4">
          {(
            [
              ["pending", `승인 대기 ${pending.length}`],
              ["history", `내역 ${history.length}`],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`flex-1 rounded-full px-3 py-2 text-sm font-semibold transition ${
                tab === k
                  ? "bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)]"
                  : "border border-[var(--md-sys-color-outline)] text-[var(--md-sys-color-on-surface-variant)]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "pending" ? (
          pending.length === 0 ? (
            <p className="px-6 py-12 text-center text-sm text-[var(--md-sys-color-on-surface-variant)]">
              승인 대기 중인 발표 신청이 없어요.
            </p>
          ) : (
            <ul className="flex flex-col gap-3 overflow-y-auto p-5">
              {pending.map((r) => (
                <li
                  key={r.id}
                  className="rounded-2xl bg-[var(--md-sys-color-surface-container)] p-4"
                >
                  <p className="flex flex-wrap items-center gap-1.5 text-sm">
                    <span className="font-bold text-[var(--md-sys-color-primary)]">
                      {nameOf(r)}
                    </span>
                    <span className="font-bold">발표 {r.count}회</span>
                    <span className="shrink-0 rounded-full bg-[var(--md-sys-color-primary-container)] px-2 py-0.5 text-xs font-extrabold text-[var(--md-sys-color-on-primary-container)]">
                      +{r.count * XP_PER_PRESENTATION} XP
                    </span>
                  </p>
                  <div className="mt-3 flex justify-end gap-2">
                    <button
                      onClick={() => onReject(r.id)}
                      className="rounded-full border border-[var(--md-sys-color-outline)] px-4 py-2.5 text-sm font-semibold text-[var(--md-sys-color-on-surface-variant)] transition hover:bg-black/5"
                    >
                      거절
                    </button>
                    <button
                      onClick={() => onApprove(r)}
                      className="inline-flex items-center gap-1.5 rounded-full bg-[var(--md-sys-color-primary)] px-4 py-2.5 text-sm font-bold text-[var(--md-sys-color-on-primary)] transition hover:brightness-105"
                    >
                      <Icon name="check" size={15} />
                      승인 (+{r.count * XP_PER_PRESENTATION} XP)
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )
        ) : history.length === 0 ? (
          <p className="px-6 py-12 text-center text-sm text-[var(--md-sys-color-on-surface-variant)]">
            아직 처리한 발표 신청이 없어요.
          </p>
        ) : (
          <ul className="flex flex-col gap-2 overflow-y-auto p-5">
            {history.map((r) => {
              const ok = r.status === "approved";
              return (
                <li
                  key={r.id}
                  className="flex items-center gap-3 rounded-2xl bg-[var(--md-sys-color-surface-container)] px-4 py-3"
                >
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                      ok
                        ? "bg-[var(--md-sys-color-tertiary-container)] text-[var(--md-sys-color-on-tertiary-container)]"
                        : "bg-[var(--md-sys-color-error-container)] text-[var(--md-sys-color-on-error-container)]"
                    }`}
                  >
                    <Icon name={ok ? "check" : "close"} size={15} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">
                      <span className="font-bold">{nameOf(r)}</span>
                      <span className="text-[var(--md-sys-color-on-surface-variant)]">
                        {" · "}
                      </span>
                      <span className="font-bold">발표 {r.count}회</span>
                    </p>
                    <p className="truncate text-xs text-black/55">
                      {ok
                        ? `+${r.count * XP_PER_PRESENTATION} XP 지급됨`
                        : "지급 안 됨"}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
                      ok
                        ? "bg-[var(--md-sys-color-tertiary-container)] text-[var(--md-sys-color-on-tertiary-container)]"
                        : "bg-[var(--md-sys-color-error-container)] text-[var(--md-sys-color-on-error-container)]"
                    }`}
                  >
                    {ok ? "승인됨" : "거절됨"}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
