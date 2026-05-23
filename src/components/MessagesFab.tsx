"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import type { Member } from "@/lib/classes";
import type { Lesson } from "@/lib/lessons";
import { MessagePanel } from "@/components/MessagePanel";

/** 우하단 플로팅 메시지 버튼 → 모달 패널 */
export function MessagesFab({
  cid,
  scope,
  lessonId,
  viewerRole,
  students,
  lessons,
}: {
  cid: string;
  scope: "lesson" | "class";
  lessonId?: string;
  viewerRole: "teacher" | "student";
  students: Member[];
  lessons?: Lesson[];
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--md-sys-color-primary)] text-white shadow-lg transition hover:brightness-105"
        title="메시지"
      >
        <Icon name="forum" size={26} />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-end bg-black/40 p-4 sm:items-center sm:justify-center"
          onClick={() => setOpen(false)}
        >
          <div
            className="flex h-[80vh] max-h-[680px] w-full max-w-md flex-col overflow-hidden rounded-3xl bg-[var(--md-sys-color-surface-container-high)] shadow-[var(--md-sys-elevation-3)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 border-b border-[var(--md-sys-color-outline-variant)] px-4 py-3">
              <Icon name="forum" size={20} />
              <p className="text-base font-semibold">
                메시지 · {scope === "lesson" ? "차시" : "클래스"}
              </p>
              <button
                onClick={() => setOpen(false)}
                className="ml-auto flex h-8 w-8 items-center justify-center rounded-full hover:bg-[var(--md-sys-color-surface-container-highest)]"
              >
                <Icon name="close" size={18} />
              </button>
            </div>
            <MessagePanel
              cid={cid}
              scope={scope}
              lessonId={lessonId}
              viewerRole={viewerRole}
              students={students}
              lessons={lessons}
            />
          </div>
        </div>
      )}
    </>
  );
}
