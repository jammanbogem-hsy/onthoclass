"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Icon } from "@/components/Icon";
import { Button, IconButton } from "@/components/ui";
import {
  addSubComment,
  deleteSubComment,
  watchSubComments,
  type SubComment,
} from "@/lib/lessons";
import type { Member } from "@/lib/classes";
import { resolveStudentName } from "@/lib/names";

/** 산출물 피드백 댓글 스레드 (교사 ↔ 해당 학생) */
export function CommentThread({
  cid,
  lid,
  qid,
  sid,
  role,
  roster = [],
}: {
  cid: string;
  lid: string;
  qid: string;
  sid: string;
  role: "teacher" | "student";
  roster?: Member[];
}) {
  const { user } = useAuth();
  const [items, setItems] = useState<SubComment[] | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // 실시간 구독 — 교사/학생 양쪽에 즉시 반영
    return watchSubComments(cid, lid, qid, sid, setItems);
  }, [cid, lid, qid, sid]);

  async function send() {
    if (!user || !text.trim()) return;
    setBusy(true);
    try {
      await addSubComment(cid, lid, qid, sid, user, role, text);
      setText("");
      // onSnapshot 이 자동 반영
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2 rounded-2xl bg-black/[0.03] p-4 dark:bg-white/[0.04]">
      <p className="mb-2.5 flex items-center gap-1.5 text-sm font-semibold text-black/55 dark:text-white/55">
        <Icon name="forum" size={16} />
        피드백 {items ? `(${items.length})` : ""}
      </p>
      <ul className="flex flex-col gap-2">
        {(items ?? []).map((c) => (
          <li
            key={c.id}
            className={`rounded-xl px-3.5 py-2.5 text-[15px] ${
              c.authorRole === "teacher"
                ? "bg-[var(--md-sys-color-tertiary-container)]"
                : "bg-white/70 dark:bg-white/10"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-bold">
                {resolveStudentName(
                  roster,
                  c.authorUid,
                  c.authorName,
                  c.authorRole === "teacher" ? "교사" : "학생"
                )}
                <span className="ml-1 text-sm font-normal text-black/40">
                  {c.authorRole === "teacher" ? "교사" : "학생"}
                </span>
              </span>
              {user?.uid === c.authorUid && (
                <IconButton
                  icon="close"
                  size="sm"
                  variant="danger"
                  label="피드백 삭제"
                  onClick={() => deleteSubComment(cid, lid, qid, sid, c.id)}
                />
              )}
            </div>
            <p className="mt-1 whitespace-pre-wrap leading-relaxed">{c.text}</p>
          </li>
        ))}
        {items && items.length === 0 && (
          <li className="py-2 text-center text-sm text-black/35">
            아직 피드백이 없습니다.
          </li>
        )}
      </ul>
      <div className="mt-3 flex items-stretch gap-2">
        <input
          className="m3-field flex-1"
          placeholder={role === "teacher" ? "피드백 작성…" : "회신 작성…"}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) send();
          }}
        />
        <Button
          onClick={send}
          disabled={busy || !text.trim()}
          variant="filled"
          size="lg"
          icon="send"
        >
          등록
        </Button>
      </div>
    </div>
  );
}
