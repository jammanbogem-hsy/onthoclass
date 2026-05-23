"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { GlassCard, GlassButton } from "@/components/Glass";
import { createLesson, listLessons, type Lesson } from "@/lib/lessons";

type Mode = "all" | "day" | "week" | "month";

function isoWeekKey(d: string): string {
  const dt = new Date(d + "T00:00:00");
  if (isNaN(dt.getTime())) return "";
  const t = new Date(dt);
  t.setHours(0, 0, 0, 0);
  // 목요일 기준 ISO 주차
  t.setDate(t.getDate() + 3 - ((t.getDay() + 6) % 7));
  const week1 = new Date(t.getFullYear(), 0, 4);
  const week =
    1 +
    Math.round(
      ((t.getTime() - week1.getTime()) / 86400000 -
        3 +
        ((week1.getDay() + 6) % 7)) /
        7
    );
  return `${t.getFullYear()}-W${String(week).padStart(2, "0")}`;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

export function LessonsSection({
  classId,
  isTeacher,
}: {
  classId: string;
  isTeacher: boolean;
}) {
  const { user } = useAuth();
  const router = useRouter();
  const [lessons, setLessons] = useState<Lesson[] | null>(null);
  const [mode, setMode] = useState<Mode>("all");
  const [anchor, setAnchor] = useState(today());
  const [creating, setCreating] = useState(false);

  const refresh = useCallback(() => {
    listLessons(classId).then(setLessons).catch(() => setLessons([]));
  }, [classId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const filtered = useMemo(() => {
    if (!lessons) return null;
    if (mode === "all") return lessons;
    return lessons.filter((l) => {
      if (!l.date) return false;
      if (mode === "day") return l.date === anchor;
      if (mode === "month")
        return l.date.slice(0, 7) === anchor.slice(0, 7);
      return isoWeekKey(l.date) === isoWeekKey(anchor);
    });
  }, [lessons, mode, anchor]);

  const MODES: { v: Mode; label: string }[] = [
    { v: "all", label: "전체" },
    { v: "day", label: "일별" },
    { v: "week", label: "주별" },
    { v: "month", label: "월별" },
  ];

  return (
    <GlassCard className="mt-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-semibold">
          차시 {filtered ? `(${filtered.length})` : ""}
        </p>
        {isTeacher && (
          <GlassButton
            variant="accent"
            className="!px-4 !py-2 text-xs"
            onClick={() => setCreating(true)}
          >
            + 차시 만들기
          </GlassButton>
        )}
      </div>

      {/* 필터 */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="flex rounded-full bg-[var(--md-sys-color-surface-container-high)] p-0.5">
          {MODES.map((m) => (
            <button
              key={m.v}
              onClick={() => setMode(m.v)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                mode === m.v
                  ? "bg-[var(--md-sys-color-secondary-container)] text-[var(--md-sys-color-on-secondary-container)]"
                  : "text-[var(--md-sys-color-on-surface-variant)]"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
        {mode !== "all" && (
          <input
            type="date"
            value={anchor}
            onChange={(e) => setAnchor(e.target.value || today())}
            className="m3-field !w-auto !px-3 !py-1.5 !text-xs"
          />
        )}
        {mode === "week" && (
          <span className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
            {isoWeekKey(anchor)} 주
          </span>
        )}
      </div>

      {/* 목록 */}
      <div className="mt-4">
        {filtered === null ? (
          <div className="h-16 animate-pulse rounded-2xl bg-[var(--md-sys-color-surface-container)]" />
        ) : filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-[var(--md-sys-color-on-surface-variant)]">
            {mode === "all"
              ? "아직 차시가 없습니다."
              : "해당 기간의 차시가 없습니다."}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {filtered.map((l) => (
              <li
                key={l.id}
                onClick={() =>
                  router.push(`/lesson/?class=${classId}&id=${l.id}`)
                }
                className="glass-interactive flex cursor-pointer items-center gap-3 rounded-xl bg-[var(--md-sys-color-surface-container)] px-4 py-3"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)]">
                  <span className="m3-icon" style={{ fontSize: 20 }}>
                    menu_book
                  </span>
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {l.title}
                  </p>
                  <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                    {l.date || "날짜 미지정"}
                  </p>
                </div>
                <span
                  className="m3-icon text-[var(--md-sys-color-on-surface-variant)]"
                  style={{ fontSize: 20 }}
                >
                  chevron_right
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {creating && user && (
        <CreateLessonModal
          classId={classId}
          onClose={() => setCreating(false)}
          onDone={() => {
            setCreating(false);
            refresh();
          }}
        />
      )}
    </GlassCard>
  );
}

function CreateLessonModal({
  classId,
  onClose,
  onDone,
}: {
  classId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const { user } = useAuth();
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(today());
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!user || !title.trim()) return;
    setBusy(true);
    try {
      await createLesson(classId, user, { title, date });
      onDone();
    } catch {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(0,0,0,0.32)] p-6"
      onClick={onClose}
    >
      <GlassCard
        strong
        className="w-full max-w-sm animate-float-in p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-2xl font-normal leading-8">새 차시 만들기</h2>
        <div className="mt-5 flex flex-col gap-3">
          <input
            className="m3-field"
            placeholder="차시 제목 (예: 1차시 - 환경과 우리)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
          />
          <input
            type="date"
            className="m3-field"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <button
            className="btn-accent mt-1 px-5 py-3 text-sm font-semibold"
            disabled={busy || !title.trim()}
            onClick={submit}
          >
            {busy ? "만드는 중…" : "만들기"}
          </button>
        </div>
      </GlassCard>
    </div>
  );
}
