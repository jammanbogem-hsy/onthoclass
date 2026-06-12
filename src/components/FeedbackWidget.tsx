"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/Icon";
import { AttachmentField } from "@/components/AttachmentField";
import {
  newFeedbackId,
  submitFeedback,
  type FeedbackKind,
} from "@/lib/feedback";
import type { Attachment } from "@/lib/lessons";

const KINDS: { key: FeedbackKind; label: string; icon: string }[] = [
  { key: "bug", label: "오류 신고", icon: "bug_report" },
  { key: "idea", label: "건의/아이디어", icon: "lightbulb" },
  { key: "other", label: "기타", icon: "chat" },
];

/**
 * 학생용 떠 있는 오류보고/피드백 버튼 + 입력 폼.
 * 학급 페이지 어디서나(ClassLive) 마운트되어 우측(또는 좌측) 하단에 표시된다.
 * 증상/피드백명(title) + 내용(body) + 사진 첨부를 받아 classes/{cid}/feedback 에 저장.
 */
export function FeedbackWidget({
  cid,
  uid,
  name,
  side = "right",
}: {
  cid: string;
  uid: string;
  name: string;
  side?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const [fid, setFid] = useState<string>(() => newFeedbackId());
  const [kind, setKind] = useState<FeedbackKind>("bug");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [atts, setAtts] = useState<Attachment[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open && !busy) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, busy]);

  function resetForm() {
    setFid(newFeedbackId());
    setKind("bug");
    setTitle("");
    setBody("");
    setAtts([]);
    setErr("");
    setDone(false);
  }

  async function send() {
    if (!title.trim()) {
      setErr("증상이나 제목을 한 줄 적어주세요.");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      await submitFeedback(cid, fid, {
        kind,
        title: title.trim(),
        body: body.trim(),
        attachments: atts,
        byUid: uid,
        byName: name || "이름없음",
        page:
          typeof window !== "undefined"
            ? window.location.pathname + window.location.search
            : "",
        ua: typeof navigator !== "undefined" ? navigator.userAgent : "",
      });
      setDone(true);
    } catch {
      setErr("보내기에 실패했어요. 인터넷을 확인하고 다시 시도해주세요.");
    } finally {
      setBusy(false);
    }
  }

  if (typeof document === "undefined") return null;

  const pos = side === "left" ? "left-4" : "right-4";

  return createPortal(
    <>
      {/* 떠 있는 버튼 */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className={`fixed bottom-4 ${pos} z-[80] flex items-center gap-1.5 rounded-full bg-[var(--md-sys-color-secondary-container)] px-4 py-2.5 text-sm font-bold text-[var(--md-sys-color-on-secondary-container)] shadow-lg ring-1 ring-black/5 transition hover:brightness-105 active:scale-95`}
          title="오류 신고 / 의견 보내기"
          aria-label="오류 신고 또는 의견 보내기"
        >
          <Icon name="feedback" size={18} />
          의견·오류
        </button>
      )}

      {/* 입력 패널 */}
      {open && (
        <div
          className={`fixed bottom-4 ${pos} z-[80] flex max-h-[80vh] w-[min(92vw,360px)] flex-col overflow-hidden rounded-3xl bg-[var(--md-sys-color-surface-container-high)] shadow-2xl ring-1 ring-black/10 animate-float-in`}
        >
          <header className="flex items-center justify-between gap-2 border-b border-[var(--md-sys-color-outline-variant)] px-4 py-3">
            <h2 className="flex items-center gap-2 text-sm font-extrabold text-[var(--md-sys-color-on-surface)]">
              <Icon name="feedback" size={18} />
              오류 신고 · 의견 보내기
            </h2>
            <button
              onClick={() => !busy && setOpen(false)}
              className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--md-sys-color-on-surface-variant)] hover:bg-black/5"
              aria-label="닫기"
            >
              <Icon name="close" size={20} />
            </button>
          </header>

          {done ? (
            <div className="flex flex-col items-center gap-3 p-6 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--md-sys-color-primary-container)]">
                <Icon
                  name="check"
                  size={30}
                  className="text-[var(--md-sys-color-on-primary-container)]"
                />
              </div>
              <p className="text-sm font-bold text-[var(--md-sys-color-on-surface)]">
                보내줘서 고마워요!
              </p>
              <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                선생님이 확인할 거예요.
              </p>
              <div className="mt-1 flex gap-2">
                <button
                  onClick={resetForm}
                  className="rounded-full border border-[var(--md-sys-color-outline)] px-4 py-1.5 text-xs font-bold text-[var(--md-sys-color-on-surface)] hover:bg-black/5"
                >
                  하나 더 보내기
                </button>
                <button
                  onClick={() => {
                    resetForm();
                    setOpen(false);
                  }}
                  className="rounded-full bg-[var(--md-sys-color-primary)] px-4 py-1.5 text-xs font-bold text-[var(--md-sys-color-on-primary)]"
                >
                  닫기
                </button>
              </div>
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
              {/* 종류 */}
              <div className="flex gap-1.5">
                {KINDS.map((k) => (
                  <button
                    key={k.key}
                    onClick={() => setKind(k.key)}
                    className={`flex flex-1 flex-col items-center gap-1 rounded-2xl border-2 px-2 py-2 text-[11px] font-bold transition ${
                      kind === k.key
                        ? "border-[var(--md-sys-color-primary)] bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)]"
                        : "border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface-variant)] hover:bg-black/5"
                    }`}
                  >
                    <Icon name={k.icon} size={18} />
                    {k.label}
                  </button>
                ))}
              </div>

              {/* 제목/증상 */}
              <label className="flex flex-col gap-1">
                <span className="text-xs font-bold text-[var(--md-sys-color-on-surface-variant)]">
                  증상 · 제목 (한 줄)
                </span>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={80}
                  placeholder={
                    kind === "bug"
                      ? "예: 빙고 호출 버튼이 안 눌려요"
                      : "예: 글씨가 더 컸으면 좋겠어요"
                  }
                  className="rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] px-3 py-2 text-sm text-[var(--md-sys-color-on-surface)] outline-none focus:border-[var(--md-sys-color-primary)]"
                />
              </label>

              {/* 내용 */}
              <label className="flex flex-col gap-1">
                <span className="text-xs font-bold text-[var(--md-sys-color-on-surface-variant)]">
                  자세한 내용
                </span>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={4}
                  maxLength={1000}
                  placeholder="언제, 무엇을 하다가, 어떻게 됐는지 적어주세요."
                  className="resize-none rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] px-3 py-2 text-sm text-[var(--md-sys-color-on-surface)] outline-none focus:border-[var(--md-sys-color-primary)]"
                />
              </label>

              {/* 사진 첨부 */}
              <div className="flex flex-col gap-1">
                <span className="text-xs font-bold text-[var(--md-sys-color-on-surface-variant)]">
                  사진 첨부 (선택)
                </span>
                <AttachmentField
                  target={{ kind: "feedback", cid, uid, fid }}
                  value={atts}
                  onChange={setAtts}
                  compact
                />
              </div>

              {err && (
                <p className="rounded-lg bg-[var(--md-sys-color-error-container)] px-3 py-1.5 text-xs font-semibold text-[var(--md-sys-color-on-error-container)]">
                  {err}
                </p>
              )}

              <button
                onClick={send}
                disabled={busy}
                className="mt-1 inline-flex items-center justify-center gap-1.5 rounded-full bg-[var(--md-sys-color-primary)] px-4 py-2.5 text-sm font-bold text-[var(--md-sys-color-on-primary)] disabled:opacity-50"
              >
                {busy ? (
                  <>
                    <Icon
                      name="progress_activity"
                      size={16}
                      className="animate-spin"
                    />
                    보내는 중…
                  </>
                ) : (
                  <>
                    <Icon name="send" size={16} />
                    보내기
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      )}
    </>,
    document.body
  );
}
