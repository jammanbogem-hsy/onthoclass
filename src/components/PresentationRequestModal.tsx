"use client";

import { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { Icon } from "@/components/Icon";
import {
  requestPresentationApproval,
  watchMyPresentationRequests,
  XP_PER_PRESENTATION,
  type PresentationRequest,
} from "@/lib/presentations";

/** 발표 승인 요청 — 학생이 발표 횟수를 입력해 교사 승인을 요청(승인 시 XP 지급) */
export function PresentationRequestModal({
  cid,
  user,
  onClose,
}: {
  cid: string;
  user: User;
  onClose: () => void;
}) {
  const [count, setCount] = useState(1);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState("");
  const [mine, setMine] = useState<PresentationRequest[]>([]);

  // 내가 보낸 신청 내역 실시간 구독
  useEffect(() => {
    return watchMyPresentationRequests(cid, user.uid, setMine);
  }, [cid, user.uid]);

  const canSend = count >= 1 && !busy;

  function bump(delta: number) {
    setCount((c) => Math.min(100, Math.max(1, c + delta)));
  }

  async function send() {
    if (!canSend) return;
    setBusy(true);
    setErr("");
    try {
      await requestPresentationApproval(cid, user, count);
      setSent(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function statusChip(status: PresentationRequest["status"]) {
    if (status === "approved")
      return {
        label: "승인됨",
        cls: "bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)]",
      };
    if (status === "rejected")
      return {
        label: "거절됨",
        cls: "bg-[var(--md-sys-color-error-container)] text-[var(--md-sys-color-on-error-container)]",
      };
    return {
      label: "대기중",
      cls: "bg-[var(--md-sys-color-secondary-container)] text-[var(--md-sys-color-on-secondary-container)]",
    };
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-[rgba(0,0,0,0.32)] p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-3xl bg-[var(--md-sys-color-surface-container-high)] shadow-[var(--md-sys-elevation-3)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-[var(--md-sys-color-outline-variant)] px-5 py-4">
          <Icon
            name="co_present"
            size={20}
            className="text-[var(--md-sys-color-primary)]"
          />
          <p className="text-lg font-semibold">발표 승인 요청</p>
          <button
            onClick={onClose}
            className="ml-auto flex h-9 w-9 items-center justify-center rounded-full text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-highest)]"
          >
            <Icon name="close" size={20} />
          </button>
        </div>

        <div className="flex flex-col gap-4 overflow-y-auto p-5">
          {sent ? (
            <div className="rounded-2xl bg-[var(--md-sys-color-primary-container)] px-4 py-5 text-center">
              <Icon
                name="send"
                size={28}
                className="text-[var(--md-sys-color-on-primary-container)]"
              />
              <p className="mt-2 text-base font-bold text-[var(--md-sys-color-on-primary-container)]">
                선생님께 보냈어요!
              </p>
              <p className="mt-1 text-sm text-[var(--md-sys-color-on-primary-container)]">
                승인되면 점수가 들어와요
              </p>
            </div>
          ) : (
            <>
              <div>
                <p className="mb-2 text-sm font-semibold">내 발표 횟수</p>
                <div className="flex items-center justify-center gap-3">
                  <button
                    onClick={() => bump(-1)}
                    disabled={count <= 1 || busy}
                    aria-label="횟수 줄이기"
                    className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface)] transition hover:bg-[var(--md-sys-color-surface-container-highest)] disabled:opacity-40"
                  >
                    <Icon name="remove" size={28} />
                  </button>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={100}
                    value={count}
                    onChange={(e) => {
                      const n = Math.floor(Number(e.target.value));
                      if (Number.isNaN(n)) setCount(1);
                      else setCount(Math.min(100, Math.max(1, n)));
                    }}
                    className="m3-field w-24 text-center text-3xl font-bold"
                  />
                  <button
                    onClick={() => bump(1)}
                    disabled={count >= 100 || busy}
                    aria-label="횟수 늘리기"
                    className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)] transition hover:brightness-105 disabled:opacity-40"
                  >
                    <Icon name="add" size={28} />
                  </button>
                </div>
              </div>

              <p className="rounded-xl bg-[var(--md-sys-color-tertiary-container)] px-3 py-3 text-center text-sm font-semibold text-[var(--md-sys-color-on-tertiary-container)]">
                = {count} × {XP_PER_PRESENTATION} ={" "}
                <span className="text-base font-extrabold">
                  {count * XP_PER_PRESENTATION} XP
                </span>{" "}
                받을 수 있어요 (승인 시)
              </p>

              {err && (
                <p className="rounded-xl bg-[var(--md-sys-color-error-container)] px-3 py-2 text-xs text-[var(--md-sys-color-on-error-container)]">
                  보내기 실패: {err}
                </p>
              )}

              <button
                onClick={send}
                disabled={!canSend}
                className="inline-flex items-center justify-center gap-1.5 rounded-full bg-[var(--md-sys-color-primary)] px-4 py-3 text-base font-bold text-[var(--md-sys-color-on-primary)] transition hover:brightness-105 disabled:opacity-40"
              >
                <Icon name="send" size={18} />
                {busy ? "보내는 중…" : "승인 요청 보내기"}
              </button>
            </>
          )}

          <div className="border-t border-[var(--md-sys-color-outline-variant)] pt-4">
            <p className="mb-2 text-sm font-semibold">내 요청 내역</p>
            {mine.length === 0 ? (
              <p className="rounded-xl bg-[var(--md-sys-color-surface-container)] px-3 py-4 text-center text-sm text-[var(--md-sys-color-on-surface-variant)]">
                아직 보낸 요청이 없어요.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {mine.map((r) => {
                  const chip = statusChip(r.status);
                  return (
                    <li
                      key={r.id}
                      className="flex items-center gap-3 rounded-xl bg-[var(--md-sys-color-surface-container)] px-3 py-2.5"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--md-sys-color-surface-container-highest)] text-sm font-bold">
                        {r.count}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="text-sm font-medium">
                          발표 {r.count}회 ·{" "}
                          {r.count * XP_PER_PRESENTATION} XP
                        </span>
                        {r.createdAt && (
                          <span className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                            {new Date(r.createdAt).toLocaleString("ko-KR", {
                              month: "long",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        )}
                      </span>
                      <span
                        className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${chip.cls}`}
                      >
                        {chip.label}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
