"use client";
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import GlassSurface, { GlassButton } from "./glass-surface";
import { useClassroom, type LessonControls } from "./classroom-context";
import { api } from "./workshop-api";
import { parseBundle } from "../lib/world/bundle";
import type { ProjectState } from "../lib/world/project";
import type { Project } from "../lib/world/types";
const LessonPlay = dynamic(() => import("./play"), { ssr: false });

export function ClassroomNav({ active }: { active: boolean }) {
  const c = useClassroom();
  if (!c?.me?.role || c.me.role === "pending-teacher") return null;
  return (
    <Link
      href={
        c.classId
          ? `/jamworldmake/?view=classroom&id=${encodeURIComponent(c.classId)}`
          : "/jamworldmake/?view=workshop"
      }
      aria-current={active ? "page" : undefined}
    >
      <Icon name="groups" size={18} />
      수업
    </Link>
  );
}

export function PublishLessonButton({
  projectId,
  state,
  name,
  description,
  disabled = false,
}: {
  projectId: string;
  state?: ProjectState;
  name?: string;
  description?: string;
  disabled?: boolean;
}) {
  const c = useClassroom(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  if (c?.me?.role !== "teacher") return null;
  return (
    <div className="lesson-publish">
      <GlassButton
        className="btn sm"
        disabled={disabled || busy || !c.classId}
        title={
          c.classId
            ? `‘${c.room?.className || c.classes.find((x) => x.id === c.classId)?.name || "공방"}’에 이 월드 공유`
            : "공방을 먼저 만들어 주세요"
        }
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            if (state)
              await c.publish(name || "수업 월드", description || "", state);
            else await c.publishProject(projectId);
          } catch (e) {
            setError(
              e instanceof Error ? e.message : "월드를 공유하지 못했어요",
            );
            setBusy(false);
          }
        }}
      >
        <Icon name="cast_for_education" size={18} />
        {busy ? "공유 중…" : "수업으로 공유"}
      </GlassButton>
      {error && (
        <span className="lesson-inline-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

export function ClassroomView() {
  const c = useClassroom();
  const [loaded, setLoaded] = useState<{
    revision: string;
    project: Project;
    ps: ProjectState;
  } | null>(null);
  const [error, setError] = useState("");
  const classId = c?.classId,
    revision = c?.room?.world?.revision;
  useEffect(() => {
    if (!classId || !revision) return;
    const ctrl = new AbortController();
    api<{ bundle: string; revision: string }>(
      `/api/jamworld/classroom/${encodeURIComponent(classId)}?world=1`,
      { signal: ctrl.signal },
    )
      .then((value) => {
        if (ctrl.signal.aborted) return;
        let index = 0;
        const parsed = parseBundle(value.bundle, () => `lesson-map-${++index}`);
        if (!parsed.ok)
          throw new Error(
            parsed.errors[0]?.message || "수업 월드를 확인해 주세요",
          );
        setLoaded({
          revision: value.revision,
          project: {
            id: `lesson-${classId}`,
            name: parsed.name,
            description: parsed.description,
            mapIds: parsed.ps.order,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
          ps: parsed.ps,
        });
        setError("");
      })
      .catch((e) => {
        if (!ctrl.signal.aborted)
          setError(e instanceof Error ? e.message : "월드를 불러오지 못했어요");
      });
    return () => ctrl.abort();
  }, [classId, revision]);
  if (!c?.me?.role)
    return (
      <main className="dash">
        <div className="empty">
          공방 초대 링크로 들어와 수업에 참여해 주세요.
        </div>
      </main>
    );
  if (!c.room?.world || !loaded || loaded.revision !== revision)
    return (
      <main className="dash">
        <div className="empty" role="status">
          {error ||
            c.error ||
            (!c.room
              ? "수업을 연결하고 있어요…"
              : "선생님이 수업 월드를 준비하고 있어요. 채팅으로 먼저 인사해 보세요.")}
          <button className="classroom-action" onClick={() => c.setOpen(true)}>
            수업 채팅 열기
          </button>
        </div>
      </main>
    );
  return (
    <LessonPlay
      key={loaded.revision}
      projectId={loaded.project.id}
      sharedWorld={{ project: loaded.project, docs: loaded.ps.docs }}
    />
  );
}

export function ClassroomChrome() {
  const c = useClassroom();
  const [text, setText] = useState(""),
    [target, setTarget] = useState(""),
    [tab, setTab] = useState<"chat" | "students">("chat");
  const [recipient, setRecipient] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const logRef = useRef<HTMLDivElement>(null),
    blackoutRef = useRef<HTMLDivElement>(null),
    pendingMessage = useRef<{ text: string; nonce: string } | null>(null);
  const blackout = c?.me?.role === "student" && !!c.room?.controls.blackout;
  const lastMessage = c?.room?.messages.at(-1)?.id;
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [lastMessage, c?.open]);
  useEffect(() => {
    if (!blackout) return;
    const root = document.querySelector(".jamworld");
    const previous = document.activeElement;
    const apply = () => {
      for (const child of root?.children ?? [])
        if (
          child instanceof HTMLElement &&
          !child.classList.contains("classroom-blackout")
        )
          child.inert = true;
    };
    apply();
    blackoutRef.current?.focus({ preventScroll: true });
    const observer = new MutationObserver(apply);
    if (root) observer.observe(root, { childList: true });
    return () => {
      observer.disconnect();
      for (const child of root?.children ?? [])
        if (child instanceof HTMLElement) child.inert = false;
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus({ preventScroll: true });
    };
  }, [blackout]);
  if (!c || !c.me?.role || c.me.role === "pending-teacher") return null;
  const teacher = c.me.role === "teacher";
  const selected = c.room?.students.find((s) => s.id === target);
  const controls: LessonControls = (target
    ? selected?.controls
    : c.room?.controls) || { paused: false, blackout: false, muted: false };
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "연결을 확인해 주세요");
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <div className="classroom-dock">
        {!c.open ? (
          <GlassSurface className="classroom-launch" frost={0.35} radius={18}>
            <button
              className="classroom-action"
              onClick={() => c.setOpen(true)}
            >
              <Icon name="forum" size={20} />
              수업 채팅
              {teacher && <span className="classroom-count">학생 관리</span>}
            </button>
          </GlassSurface>
        ) : (
          <GlassSurface
            className="classroom-panel"
            contentClassName="classroom-panel-content"
            frost={0.55}
            radius={22}
            role="region"
            aria-label="수업 채팅과 관리"
          >
            <header className="classroom-head">
              <strong>{c.room?.className || "우리 수업"}</strong>
              <span
                className={`classroom-connection ${c.connected ? "on" : ""}`}
              >
                {c.connected ? "연결됨" : "연결 중"}
              </span>
              <button
                className="classroom-action icon"
                onClick={() => c.setOpen(false)}
                aria-label="수업 패널 닫기"
              >
                <Icon name="close" size={20} />
              </button>
            </header>
            {teacher && (
              <label className="classroom-class-picker">
                <span>공방</span>
                <select
                  value={c.classId}
                  onChange={(e) => {
                    setTarget("");
                    setRecipient("");
                    c.selectClass(e.target.value);
                  }}
                >
                  {!c.classes.length && (
                    <option value="">공방을 먼저 만들어 주세요</option>
                  )}
                  {c.classes.map((cls) => (
                    <option key={cls.id} value={cls.id}>
                      {cls.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {!c.classId && (
              <p className="classroom-notice">
                <Link href="/jamworldmake/?view=workshop">
                  공방을 만들면 채팅과 수업 제어를 사용할 수 있어요.
                </Link>
              </p>
            )}
            {teacher && (
              <div className="classroom-tabs" role="tablist">
                <button
                  role="tab"
                  aria-selected={tab === "chat"}
                  onClick={() => setTab("chat")}
                >
                  채팅
                </button>
                <button
                  role="tab"
                  aria-selected={tab === "students"}
                  onClick={() => setTab("students")}
                >
                  학생 관리
                </button>
              </div>
            )}
            {tab === "students" && teacher ? (
              <div className="classroom-student-panel">
                <label className="field">
                  <span>제어할 학생</span>
                  <select
                    className="select"
                    value={target}
                    onChange={(e) => setTarget(e.target.value)}
                  >
                    <option value="">학생 모두</option>
                    {c.room?.students.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                        {s.online ? " · 접속 중" : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="classroom-control-grid">
                  {(
                    [
                      ["paused", "멈추기", "다시 움직이기", "pause"],
                      [
                        "blackout",
                        "화면 가리기",
                        "화면 다시 보이기",
                        "visibility_off",
                      ],
                      [
                        "muted",
                        "채팅 잠그기",
                        "채팅 다시 열기",
                        "speaker_notes_off",
                      ],
                    ] as const
                  ).map(([field, off, on, icon]) => (
                    <button
                      key={field}
                      className="classroom-action"
                      aria-pressed={controls[field]}
                      disabled={busy || !c.classId}
                      onClick={() =>
                        void run(() =>
                          c.command("control", {
                            field,
                            value: !controls[field],
                            studentId: target || null,
                          }),
                        )
                      }
                    >
                      <Icon name={icon} size={19} />
                      {controls[field] ? on : off}
                    </button>
                  ))}
                </div>
                {!target && (
                  <button
                    className="classroom-action classroom-reset"
                    aria-pressed={!!c.room?.controls.hideNames}
                    disabled={busy || !c.classId}
                    onClick={() =>
                      void run(() =>
                        c.command("control", {
                          field: "hideNames",
                          value: !c.room?.controls.hideNames,
                          studentId: null,
                        }),
                      )
                    }
                  >
                    <Icon name={c.room?.controls.hideNames ? "badge" : "person_off"} size={19} />
                    {c.room?.controls.hideNames ? "이름 다시 보이기" : "이름 숨기기(익명 참여)"}
                  </button>
                )}
                <button
                  className="classroom-action classroom-reset"
                  disabled={busy || !c.classId}
                  onClick={() => void run(() => c.command("reset"))}
                >
                  <Icon name="restart_alt" size={19} />
                  모두 정상으로
                </button>
                <p className="classroom-notice">
                  {c.room?.students.filter((s) => s.online).length || 0}명 접속
                  중 · 전체 {c.room?.students.length || 0}명
                </p>
                <ul className="classroom-roster">
                  {c.room?.students.map((s) => (
                    <li key={s.id}>
                      <span className={s.online ? "is-online" : ""}>
                        {s.name}
                      </span>
                      <small>
                        {s.controls?.blackout
                          ? "화면 가림"
                          : s.controls?.paused
                            ? "멈춤"
                            : s.online
                              ? "활동 중"
                              : "접속 안 함"}
                      </small>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <>
                <div
                  className="classroom-messages"
                  role="log"
                  aria-label="수업 대화"
                  aria-live="polite"
                  ref={logRef}
                >
                  {!c.room?.messages.length && (
                    <p className="classroom-notice">
                      친구들과 선생님께 인사해 보세요.
                    </p>
                  )}
                  {c.room?.messages.map((m) => (
                    <article
                      className={`classroom-message ${m.senderId === c.room?.selfId ? "mine" : ""}`}
                      key={m.id}
                    >
                      <div>
                        <b>{m.senderName}</b>
                        {m.role === "teacher" && <span>선생님</span>}
                        {m.recipientId && <span>개별 대화</span>}
                      </div>
                      <p>{m.text}</p>
                    </article>
                  ))}
                </div>
                <form
                  className="classroom-compose"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!text.trim() || busy) return;
                    const message = text.trim();
                    if (pendingMessage.current?.text !== message)
                      pendingMessage.current = {
                        text: message,
                        nonce: crypto.randomUUID(),
                      };
                    const nonce = pendingMessage.current.nonce;
                    void run(async () => {
                      await c.command("chat", {
                        text: message,
                        nonce,
                        recipientId: recipient || null,
                      });
                      setText("");
                      pendingMessage.current = null;
                    });
                  }}
                >
                  <label>
                    <span className="sr-only">대화 받는 사람</span>
                    <select
                      value={recipient}
                      onChange={(e) => setRecipient(e.target.value)}
                    >
                      <option value="">모두에게</option>
                      {teacher
                        ? c.room?.students.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}에게만
                            </option>
                          ))
                        : c.room && (
                            <option value={c.room.teacherId}>선생님께만</option>
                          )}
                    </select>
                  </label>
                  {!teacher && c.room?.controls.muted ? (
                    <p className="classroom-notice">
                      선생님이 채팅을 잠시 잠갔어요.
                    </p>
                  ) : (
                    <div>
                      <input
                        aria-label="수업 대화 입력"
                        placeholder="대화를 입력해 주세요"
                        maxLength={300}
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        disabled={!c.connected}
                      />
                      <button
                        className="classroom-action"
                        disabled={busy || !text.trim() || !c.connected}
                        aria-label="대화 보내기"
                      >
                        <Icon name="send" size={20} />
                      </button>
                    </div>
                  )}
                </form>
                {teacher && (
                  <button
                    className="classroom-action classroom-clear"
                    disabled={busy || !c.room?.messages.length}
                    onClick={() => {
                      if (window.confirm("공방 대화 기록을 비울까요?"))
                        void run(() => c.command("clearChat"));
                    }}
                  >
                    대화 비우기
                  </button>
                )}
              </>
            )}
            {(error || c.error) && (
              <p className="classroom-notice error" role="alert">
                {error || c.error}
              </p>
            )}
          </GlassSurface>
        )}
      </div>
      {blackout && (
        <div
          className="classroom-blackout"
          ref={blackoutRef}
          tabIndex={-1}
          role="alertdialog"
          aria-modal="true"
          aria-label="선생님이 화면을 잠시 가렸어요"
        >
          <Icon name="school" size={36} />
          <p>선생님 설명을 듣는 시간이에요.</p>
        </div>
      )}
    </>
  );
}
