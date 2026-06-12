"use client";

// 교사용 경험치 요청함 — 학생이 외부 활동(eng 등)에서 보낸 XP 요청을 보고 승인/거절.
// 승인 시 decideXpRequest 가 grantXp 로 학급 경험치를 지급한다.
// UI는 칭찬 관리와 동일하게 [승인 대기]·[내역] 두 탭 구성, 학생 이름순 정렬.
import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import {
  decideXpRequest,
  watchXpRequests,
  type XpRequest,
} from "@/lib/xp";
import { listMembers } from "@/lib/classes";

export function XpRequestInboxModal({
  cid,
  teacherUid,
  onClose,
}: {
  cid: string;
  teacherUid: string;
  onClose: () => void;
}) {
  const [reqs, setReqs] = useState<XpRequest[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [tab, setTab] = useState<"pending" | "history">("pending");

  useEffect(() => watchXpRequests(cid, setReqs), [cid]);
  useEffect(() => {
    listMembers(cid)
      .then((ms) => {
        const m: Record<string, string> = {};
        ms.forEach((x) => (m[x.uid] = x.displayName));
        setNames(m);
      })
      .catch(() => {});
  }, [cid]);

  const nameOf = (r: XpRequest) => names[r.uid] || r.studentName || "학생";
  const byName = (a: XpRequest, b: XpRequest) =>
    nameOf(a).localeCompare(nameOf(b), "ko");

  const pending = useMemo(
    () => reqs.filter((r) => r.status === "pending").sort(byName),
    [reqs, names]
  );
  const history = useMemo(
    () => reqs.filter((r) => r.status !== "pending").sort(byName),
    [reqs, names]
  );

  async function decide(r: XpRequest, approve: boolean) {
    setBusy(r.id);
    try {
      await decideXpRequest(cid, r, approve, teacherUid);
    } finally {
      setBusy(null);
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
          <Icon name="bolt" size={20} className="text-[var(--md-sys-color-primary)]" />
          <p className="text-lg font-semibold">경험치 요청 관리</p>
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
              새 경험치 요청이 없어요.
            </p>
          ) : (
            <ul className="flex flex-col gap-3 overflow-y-auto p-5">
              {pending.map((r) => (
                <li
                  key={r.id}
                  className="rounded-2xl bg-[var(--md-sys-color-surface-container)] p-4"
                >
                  <p className="text-sm">
                    <span className="font-bold">{nameOf(r)}</span>
                    <span className="text-[var(--md-sys-color-on-surface-variant)]">
                      {" · "}
                      {r.label}
                    </span>
                  </p>
                  <p className="mt-1 text-xs text-[var(--md-sys-color-on-surface-variant)]">
                    활동 점수 {r.score} → 요청 경험치 <b>{r.points} XP</b>
                  </p>
                  <div className="mt-3 flex justify-end gap-2">
                    <button
                      onClick={() => decide(r, false)}
                      disabled={busy === r.id}
                      className="rounded-full border border-[var(--md-sys-color-outline)] px-4 py-2.5 text-sm font-semibold text-[var(--md-sys-color-on-surface-variant)] transition hover:bg-black/5 disabled:opacity-50"
                    >
                      거절
                    </button>
                    <button
                      onClick={() => decide(r, true)}
                      disabled={busy === r.id}
                      className="inline-flex items-center gap-1.5 rounded-full bg-[var(--md-sys-color-primary)] px-4 py-2.5 text-sm font-bold text-[var(--md-sys-color-on-primary)] transition hover:brightness-105 disabled:opacity-50"
                    >
                      <Icon name="check" size={15} />
                      {busy === r.id ? "처리 중…" : `승인 (+${r.points} XP)`}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )
        ) : history.length === 0 ? (
          <p className="px-6 py-12 text-center text-sm text-[var(--md-sys-color-on-surface-variant)]">
            아직 처리한 경험치 요청이 없어요.
          </p>
        ) : (
          <ul className="flex flex-col gap-2 overflow-y-auto p-5">
            {history.map((r) => {
              const ok = r.status === "granted";
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
                        {r.label}
                      </span>
                    </p>
                    <p className="truncate text-xs text-black/55">
                      활동 점수 {r.score} · {r.points} XP
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
                      ok
                        ? "bg-[var(--md-sys-color-tertiary-container)] text-[var(--md-sys-color-on-tertiary-container)]"
                        : "bg-[var(--md-sys-color-error-container)] text-[var(--md-sys-color-on-error-container)]"
                    }`}
                  >
                    {ok ? `+${r.points} XP 지급됨` : "거절됨"}
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
