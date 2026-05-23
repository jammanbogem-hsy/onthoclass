"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Icon } from "@/components/Icon";
import {
  addSubComment,
  deleteSubComment,
  watchSubComments,
  type SubComment,
} from "@/lib/lessons";

/** 산출물 피드백 댓글 스레드 (교사 ↔ 해당 학생) */
export function CommentThread({
  cid,
  lid,
  qid,
  sid,
  role,
}: {
  cid: string;
  lid: string;
  qid: string;
  sid: string;
  role: "teacher" | "student";
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
    <div className="mt-2 rounded-xl bg-black/[0.03] p-3 dark:bg-white/[0.04]">
      <p className="mb-2 flex items-center gap-1 text-[11px] font-semibold text-black/45 dark:text-white/45">
        <Icon name="forum" size={13} />
        피드백 {items ? `(${items.length})` : ""}
      </p>
      <ul className="flex flex-col gap-1.5">
        {(items ?? []).map((c) => (
          <li
            key={c.id}
            className={`rounded-lg px-2.5 py-1.5 text-xs ${
              c.authorRole === "teacher"
                ? "bg-emerald-50 dark:bg-emerald-900/20"
                : "bg-white/70 dark:bg-white/10"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold">
                {c.authorName}
                <span className="ml-1 font-normal text-black/40">
                  {c.authorRole === "teacher" ? "교사" : "학생"}
                </span>
              </span>
              {user?.uid === c.authorUid && (
                <button
                  onClick={() =>
                    deleteSubComment(cid, lid, qid, sid, c.id)
                  }
                  className="text-black/30 hover:text-rose-500"
                  title="삭제"
                >
                  <Icon name="close" size={12} />
                </button>
              )}
            </div>
            <p className="mt-0.5 whitespace-pre-wrap leading-snug">
              {c.text}
            </p>
          </li>
        ))}
        {items && items.length === 0 && (
          <li className="py-1 text-center text-[11px] text-black/35">
            아직 피드백이 없습니다.
          </li>
        )}
      </ul>
      <div className="mt-2 flex gap-1.5">
        <input
          className="m3-field !py-1.5 !text-xs flex-1"
          placeholder={
            role === "teacher" ? "피드백 작성…" : "회신 작성…"
          }
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) send();
          }}
        />
        <button
          onClick={send}
          disabled={busy || !text.trim()}
          className="btn-accent rounded-full px-3 text-xs font-semibold disabled:opacity-50"
        >
          등록
        </button>
      </div>
    </div>
  );
}
