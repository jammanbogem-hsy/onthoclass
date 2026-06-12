"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/Icon";
import { FeedbackInboxModal } from "@/components/FeedbackInboxModal";
import { watchFeedback, type Feedback } from "@/lib/feedback";

/**
 * 교사용 피드백 받은함 플로팅 버튼 — 어느 학급 화면에서나 좌하단에서 받은함 열기.
 * 미처리(open) 건수를 빨강 배지로 표시. (학생용 FeedbackWidget 과 같은 위치/스타일 계열)
 */
export function FeedbackInboxFab({ cid }: { cid: string }) {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<Feedback[]>([]);

  useEffect(() => watchFeedback(cid, setList), [cid]);

  const openCount = list.filter((f) => f.status === "open").length;

  if (typeof document === "undefined") return null;

  return createPortal(
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-4 left-4 z-[80] flex items-center gap-1.5 rounded-full bg-[var(--md-sys-color-secondary-container)] px-4 py-2.5 text-sm font-bold text-[var(--md-sys-color-on-secondary-container)] shadow-lg ring-1 ring-black/5 transition hover:brightness-105 active:scale-95"
        title="학생 피드백·오류 받은함"
        aria-label="학생 피드백 받은함 열기"
      >
        <Icon name="feedback" size={18} />
        피드백
        {openCount > 0 && (
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--md-sys-color-error)] px-1.5 text-xs font-bold text-white">
            {openCount}
          </span>
        )}
      </button>
      {open && (
        <FeedbackInboxModal cid={cid} onClose={() => setOpen(false)} />
      )}
    </>,
    document.body
  );
}
