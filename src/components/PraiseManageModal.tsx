"use client";

import { useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import type { Praise } from "@/lib/praise";
import type { Member } from "@/lib/classes";
import { resolveStudentName } from "@/lib/names";
import { CrossPraiseLinkModal } from "@/components/CrossPraiseLinkModal";

/**
 * 교사 칭찬 관리 — [승인 대기] 탭에서 승인/반려, [내역] 탭에서 A→B 칭찬 기록 열람.
 * 승인 시 받은 학생에게 효과 + 학급 온도 +0.1(상위에서 onApprove 처리).
 * 다른 반 칭찬(crossClass, 받을 학생 미지정)은 우리 반 학생과 이름을 매칭해 승인한다.
 */
export function PraiseManageModal({
  praises,
  cid,
  teacherUid,
  members,
  onApprove,
  onReject,
  onClose,
}: {
  praises: Praise[];
  cid: string;
  teacherUid: string;
  members: Member[];
  onApprove: (p: Praise, assignTo?: { uid: string; name: string }) => void;
  onReject: (id: string) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"pending" | "history">("pending");
  const [linkOpen, setLinkOpen] = useState(false);
  // 다른 반 칭찬: 받을 학생 매칭 선택(칭찬 id → uid)
  const [assign, setAssign] = useState<Record<string, string>>({});

  const students = useMemo(
    () => members.filter((m) => m.role === "student"),
    [members]
  );
  // 굳은 이름 대신 현재 명단 이름으로 보정(다른 반 칭찬은 명단에 없으니 저장값 유지)
  const fromNameOf = (p: Praise) =>
    resolveStudentName(members, p.fromUid, p.fromName);
  const toNameOf = (p: Praise) =>
    resolveStudentName(members, p.toUid, p.toName);

  const pending = useMemo(
    () => praises.filter((p) => p.status === "pending"),
    [praises]
  );
  const history = useMemo(
    () =>
      praises
        .filter((p) => p.status !== "pending")
        .sort((a, b) => (b.decidedAt ?? 0) - (a.decidedAt ?? 0)),
    [praises]
  );

  // 다른 반 칭찬(받을 학생 미지정): 입력된 이름과 "정확히 한 명"만 일치할 때에만
  // 기본 선택한다. 동명이인(2명 이상)이면 빈 값으로 두어 교사가 직접 고르게 한다
  // (잘못된 학생에게 자동 전달 방지).
  const matchesOf = (p: Praise) => {
    const t = (p.toName ?? "").trim();
    return students.filter((s) => s.displayName.trim() === t);
  };
  const defaultUid = (p: Praise) => {
    const hits = matchesOf(p);
    return hits.length === 1 ? hits[0].uid : "";
  };
  const selectedUid = (p: Praise) => assign[p.id] ?? defaultUid(p);

  function approve(p: Praise) {
    const isCross = !!p.crossClass && !p.toUid;
    if (isCross) {
      const uid = selectedUid(p);
      const m = students.find((s) => s.uid === uid);
      if (!m) return;
      onApprove(p, { uid: m.uid, name: m.displayName });
    } else {
      onApprove(p);
    }
  }

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
            name="favorite"
            size={20}
            className="text-[var(--md-sys-color-primary)]"
          />
          <p className="text-lg font-semibold">칭찬 관리</p>
          <button
            onClick={() => setLinkOpen(true)}
            className="ml-auto inline-flex items-center gap-1 rounded-full border border-[var(--md-sys-color-outline)] px-3 py-1.5 text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)] hover:bg-black/5"
          >
            <Icon name="link" size={14} />
            다른 반 연결
          </button>
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-highest)]"
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
              승인 대기 중인 칭찬이 없어요.
            </p>
          ) : (
            <ul className="flex flex-col gap-3 overflow-y-auto p-5">
              {pending.map((p) => {
                const isCross = !!p.crossClass && !p.toUid;
                const selUid = selectedUid(p);
                return (
                  <li
                    key={p.id}
                    className="rounded-2xl bg-[var(--md-sys-color-surface-container)] p-4"
                  >
                    {isCross && (
                      <span className="mb-1.5 inline-flex items-center gap-1 rounded-full bg-[var(--md-sys-color-tertiary-container)] px-2 py-0.5 text-[11px] font-bold text-[var(--md-sys-color-on-tertiary-container)]">
                        <Icon name="link" size={11} />
                        다른 반에서 옴{p.fromCidName ? ` · ${p.fromCidName}` : ""}
                      </span>
                    )}
                    <p className="text-sm">
                      <span className="font-bold text-[var(--md-sys-color-primary)]">
                        {fromNameOf(p)}
                      </span>
                      <span className="text-[var(--md-sys-color-on-surface-variant)]">
                        {" → "}
                      </span>
                      <span className="font-bold">{toNameOf(p)}</span>
                    </p>
                    <p className="mt-1.5 rounded-xl bg-[var(--md-sys-color-surface)] px-3 py-2 text-sm">
                      “{p.reason}”
                    </p>

                    {isCross && (
                      <div className="mt-2">
                        <p className="mb-1 text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)]">
                          받을 학생 선택 (이름 “{p.toName}”)
                        </p>
                        {matchesOf(p).length > 1 && (
                          <p className="mb-1 rounded-lg bg-[var(--md-sys-color-error-container)] px-2 py-1 text-[11px] font-semibold text-[var(--md-sys-color-on-error-container)]">
                            같은 이름의 학생이 {matchesOf(p).length}명이에요. 받을 학생을
                            직접 확인해 선택해 주세요.
                          </p>
                        )}
                        <select
                          value={selUid}
                          onChange={(e) =>
                            setAssign((m) => ({ ...m, [p.id]: e.target.value }))
                          }
                          className="m3-field w-full text-sm"
                        >
                          <option value="">학생을 선택하세요</option>
                          {students.map((s) => (
                            <option key={s.uid} value={s.uid}>
                              {s.displayName}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div className="mt-3 flex justify-end gap-2">
                      <button
                        onClick={() => onReject(p.id)}
                        className="rounded-full border border-[var(--md-sys-color-outline)] px-4 py-2.5 text-sm font-semibold text-[var(--md-sys-color-on-surface-variant)] transition hover:bg-black/5"
                      >
                        반려
                      </button>
                      <button
                        onClick={() => approve(p)}
                        disabled={isCross && !selUid}
                        className="inline-flex items-center gap-1.5 rounded-full bg-[var(--md-sys-color-primary)] px-4 py-2.5 text-sm font-bold text-[var(--md-sys-color-on-primary)] transition hover:brightness-105 disabled:opacity-40"
                      >
                        <Icon name="check" size={15} />
                        승인 (+0.1°)
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )
        ) : history.length === 0 ? (
          <p className="px-6 py-12 text-center text-sm text-[var(--md-sys-color-on-surface-variant)]">
            아직 처리한 칭찬 내역이 없어요.
          </p>
        ) : (
          <ul className="flex flex-col gap-2 overflow-y-auto p-5">
            {history.map((p) => {
              const ok = p.status === "approved";
              return (
                <li
                  key={p.id}
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
                      <span className="font-bold">{fromNameOf(p)}</span>
                      <span className="text-[var(--md-sys-color-on-surface-variant)]">
                        {" → "}
                      </span>
                      <span className="font-bold">{toNameOf(p)}</span>
                      {p.crossClass && (
                        <span className="ml-1 text-xs text-[var(--md-sys-color-on-surface-variant)]">
                          (다른 반)
                        </span>
                      )}
                    </p>
                    <p className="truncate text-xs text-black/55">“{p.reason}”</p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
                      ok
                        ? "bg-[var(--md-sys-color-tertiary-container)] text-[var(--md-sys-color-on-tertiary-container)]"
                        : "bg-[var(--md-sys-color-error-container)] text-[var(--md-sys-color-on-error-container)]"
                    }`}
                  >
                    {ok ? "승인됨" : "반려됨"}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {linkOpen && (
        <CrossPraiseLinkModal
          cid={cid}
          teacherUid={teacherUid}
          onClose={() => setLinkOpen(false)}
        />
      )}
    </div>
  );
}
