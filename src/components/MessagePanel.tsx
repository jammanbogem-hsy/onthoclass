"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Icon } from "@/components/Icon";
import type { Member } from "@/lib/classes";
import type { Lesson } from "@/lib/lessons";
import { resolveStudentName } from "@/lib/names";
import {
  sendClassMessage,
  sendLessonMessage,
  watchAllForStudent,
  watchClassInbox,
  watchClassMessages,
  watchLessonMessages,
  type InboxRow,
  type Msg,
} from "@/lib/messages";

/**
 * 1:1 메시지 패널 (교사 ↔ 학생).
 * - scope="lesson": 그 차시의 DM만
 * - scope="class": 클래스 DM + (옵션) 모든 차시 DM 합쳐서 시간순
 * - 학생(role==="student"): 자기 자신과 교사의 대화만 (대상 선택 없음)
 * - 교사(role==="teacher"): 학생 목록에서 선택
 */
export function MessagePanel({
  cid,
  scope,
  lessonId,
  viewerRole,
  students,
  lessons,
}: {
  cid: string;
  scope: "lesson" | "class";
  lessonId?: string; // scope==="lesson" 필수
  viewerRole: "teacher" | "student";
  students: Member[]; // 학급의 학생 목록 (교사용 선택지)
  lessons?: Lesson[]; // scope==="class" 일 때 차시 머지에 사용
}) {
  const { user } = useAuth();
  // 교사·클래스 스코프에서 기본 '메시지함'(전체 학생 한눈에, 클래스+모든 차시 합산).
  // 차시 화면(scope==="lesson")은 그 차시 대화를 그대로, 학생은 자기 대화.
  const [inbox, setInbox] = useState<boolean>(
    viewerRole === "teacher" && scope === "class"
  );
  const [inboxRows, setInboxRows] = useState<InboxRow[]>([]);
  const [targetUid, setTargetUid] = useState<string>(
    viewerRole === "student" ? user?.uid ?? "" : students[0]?.uid ?? ""
  );
  const [includeLessons, setIncludeLessons] = useState<boolean>(
    scope === "class"
  );
  const [items, setItems] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [errMsg, setErrMsg] = useState("");
  const listRef = useRef<HTMLDivElement | null>(null);

  // 학생은 자기 uid 고정
  useEffect(() => {
    if (viewerRole === "student" && user?.uid) setTargetUid(user.uid);
  }, [viewerRole, user]);

  // 교사가 학생을 선택했는데 그 학생이 목록에 없으면 첫 학생으로
  useEffect(() => {
    if (viewerRole === "teacher" && students.length && !students.find((s) => s.uid === targetUid)) {
      setTargetUid(students[0].uid);
    }
  }, [viewerRole, students, targetUid]);

  const lessonIds = useMemo(
    () => (lessons ?? []).map((l) => l.id),
    [lessons]
  );

  const studentsKey = useMemo(
    () => students.map((s) => s.uid).join(","),
    [students]
  );

  // 메시지함(교사·클래스): 모든 학생의 최근 메시지 요약 구독(클래스 + 차시 스레드 합산)
  useEffect(() => {
    if (!inbox || viewerRole !== "teacher") return;
    return watchClassInbox(
      cid,
      students.map((s) => ({ uid: s.uid, displayName: s.displayName })),
      lessonIds,
      setInboxRows
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cid, inbox, viewerRole, studentsKey, lessonIds]);

  useEffect(() => {
    setErrMsg("");
    if (inbox) {
      setItems([]);
      return;
    }
    if (!targetUid) {
      setItems([]);
      return;
    }
    const onErr = (e: Error) =>
      setErrMsg(e.message || "메시지 구독에 실패했습니다.");
    if (scope === "lesson" && lessonId) {
      return watchLessonMessages(cid, lessonId, targetUid, setItems, onErr);
    }
    if (scope === "class") {
      if (includeLessons) {
        return watchAllForStudent(cid, targetUid, lessonIds, setItems);
      }
      return watchClassMessages(cid, targetUid, setItems, onErr);
    }
  }, [cid, scope, lessonId, targetUid, includeLessons, lessonIds, inbox]);

  useEffect(() => {
    // 새 메시지 시 하단 스크롤
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [items]);

  async function send() {
    if (!user || !text.trim() || !targetUid) return;
    setBusy(true);
    setErrMsg("");
    try {
      if (scope === "lesson" && lessonId) {
        await sendLessonMessage(cid, lessonId, targetUid, user, viewerRole, text);
      } else {
        await sendClassMessage(cid, targetUid, user, viewerRole, text);
      }
      setText("");
    } catch (e) {
      console.error("[sendMessage]", e);
      setErrMsg(e instanceof Error ? e.message : "전송 실패");
    } finally {
      setBusy(false);
    }
  }

  const lessonTitleMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const l of lessons ?? []) m.set(l.id, l.title);
    return m;
  }, [lessons]);

  const partnerName =
    viewerRole === "teacher"
      ? students.find((s) => s.uid === targetUid)?.displayName ?? "학생"
      : "교사";

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* 헤더: 학생 선택(교사) + 옵션 */}
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--md-sys-color-outline-variant)] px-4 py-3">
        {viewerRole === "teacher" ? (
          inbox ? (
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold">
              <Icon name="inbox" size={18} />
              메시지함 · 전체 학생
            </span>
          ) : (
            <>
              <button
                onClick={() => setInbox(true)}
                className="inline-flex items-center gap-1 rounded-full border border-[var(--md-sys-color-outline)] px-2.5 py-1 text-xs font-medium text-[var(--md-sys-color-primary)]"
                title="메시지함으로"
              >
                <Icon name="arrow_back" size={14} />
                메시지함
              </button>
              <select
                value={targetUid}
                onChange={(e) => setTargetUid(e.target.value)}
                className="m3-field !w-auto"
              >
                {students.length === 0 && <option value="">학생 없음</option>}
                {students.map((s) => (
                  <option key={s.uid} value={s.uid}>
                    {s.displayName}
                  </option>
                ))}
              </select>
            </>
          )
        ) : (
          <span className="text-sm font-semibold">교사와의 대화</span>
        )}
        {!inbox && (
          <span className="text-xs text-black/40">
            {scope === "lesson" ? "차시 대화" : "클래스 대화"}
          </span>
        )}
        {!inbox && scope === "class" && lessons && lessons.length > 0 && (
          <label className="ml-auto inline-flex cursor-pointer items-center gap-1.5 text-xs text-black/55">
            <input
              type="checkbox"
              checked={includeLessons}
              onChange={(e) => setIncludeLessons(e.target.checked)}
            />
            차시 메시지 포함
          </label>
        )}
        {!inbox && viewerRole === "teacher" && items.length > 0 && (
          <button
            onClick={() => {
              const blob = new Blob(
                [JSON.stringify(items, null, 2)],
                { type: "application/json" }
              );
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `messages-${partnerName}-${
                scope === "lesson" ? "lesson" : "class"
              }-${new Date().toISOString().slice(0, 10)}.json`;
              a.click();
              URL.revokeObjectURL(url);
            }}
            className={`${
              scope === "class" && lessons && lessons.length > 0 ? "" : "ml-auto"
            } inline-flex items-center gap-1 rounded-full border border-[var(--md-sys-color-outline)] px-2.5 py-1 text-xs font-medium text-[var(--md-sys-color-primary)]`}
            title="대화 JSON 다운로드"
          >
            <Icon name="download" size={12} />
            내보내기
          </button>
        )}
      </div>

      {errMsg && (
        <p className="border-b border-[var(--md-sys-color-error)] bg-[var(--md-sys-color-error-container)] px-4 py-2 text-xs text-[var(--md-sys-color-on-error-container)]">
          {errMsg}
        </p>
      )}

      {/* 메시지함: 학생별 최근 메시지 한눈에 */}
      {inbox && (
        <div className="min-h-0 flex-1 overflow-y-auto bg-[var(--md-sys-color-surface)] p-2">
          {inboxRows.filter((r) => r.count > 0).length === 0 ? (
            <p className="py-10 text-center text-sm text-black/40">
              아직 학생이 보낸 메시지가 없습니다.
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {inboxRows
                .filter((r) => r.count > 0)
                .map((r) => (
                  <li key={r.studentUid}>
                    <button
                      onClick={() => {
                        setTargetUid(r.studentUid);
                        setInbox(false);
                      }}
                      className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition hover:bg-[var(--md-sys-color-surface-container-highest)]"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--md-sys-color-primary-container)] text-sm font-bold text-[var(--md-sys-color-on-primary-container)]">
                        {resolveStudentName(
                          students,
                          r.studentUid,
                          r.studentName
                        ).slice(0, 1)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate text-sm font-semibold">
                            {resolveStudentName(
                              students,
                              r.studentUid,
                              r.studentName
                            )}
                          </span>
                          {r.lastAuthorRole === "student" && (
                            <span className="shrink-0 rounded-full bg-[var(--md-sys-color-tertiary-container)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--md-sys-color-on-tertiary-container)]">
                              새 메시지
                            </span>
                          )}
                        </span>
                        <span className="block truncate text-xs text-black/50">
                          {r.lastAuthorRole === "teacher" ? "나: " : ""}
                          {r.lastText}
                        </span>
                      </span>
                      {r.lastAt && (
                        <span className="shrink-0 text-[11px] text-black/40">
                          {new Date(r.lastAt).toLocaleString("ko-KR", {
                            month: "numeric",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
            </ul>
          )}
        </div>
      )}

      {/* 메시지 리스트 */}
      {!inbox && (
      <div
        ref={listRef}
        className="min-h-0 flex-1 overflow-y-auto bg-[var(--md-sys-color-surface)] p-4"
      >
        {items.length === 0 ? (
          <p className="py-10 text-center text-sm text-black/40">
            아직 메시지가 없습니다. 첫 메시지를 보내보세요.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {items.map((m) => {
              const mine = m.authorUid === user?.uid;
              return (
                <li
                  key={`${m.scope}-${m.lessonId ?? ""}-${m.id}`}
                  className={`flex flex-col ${mine ? "items-end" : "items-start"}`}
                >
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm shadow-sm ${
                      mine
                        ? "bg-[var(--md-sys-color-primary)] text-white"
                        : "bg-[var(--md-sys-color-surface-container-highest)] text-[var(--md-sys-color-on-surface)]"
                    }`}
                  >
                    <p className="whitespace-pre-wrap break-words leading-snug">
                      {m.text}
                    </p>
                  </div>
                  <p className="mt-0.5 px-1 text-xs text-black/40">
                    {mine ? "나" : `${partnerName}`}
                    {m.scope === "lesson" && m.lessonId && (
                      <span className="ml-1 rounded bg-black/5 px-1.5 py-0.5 text-xs dark:bg-white/10">
                        차시: {lessonTitleMap.get(m.lessonId) ?? "차시"}
                      </span>
                    )}
                    {m.createdAt && (
                      <span className="ml-1">
                        {new Date(m.createdAt).toLocaleString("ko-KR", {
                          month: "numeric",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    )}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      )}

      {/* 입력 */}
      {!inbox && (
      <div className="flex gap-2 border-t border-[var(--md-sys-color-outline-variant)] p-3">
        <input
          className="m3-field flex-1"
          placeholder={
            !targetUid
              ? "대화 상대를 먼저 선택"
              : `${viewerRole === "teacher" ? partnerName + "에게" : "교사에게"} 메시지…`
          }
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) send();
          }}
          disabled={!targetUid}
        />
        <button
          onClick={send}
          disabled={busy || !text.trim() || !targetUid}
          className="btn-accent rounded-full px-5 text-sm font-semibold disabled:opacity-50"
        >
          전송
        </button>
      </div>
      )}
    </div>
  );
}
