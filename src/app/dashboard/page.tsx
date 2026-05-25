"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { GlassCard, GlassButton } from "@/components/Glass";
import { TopBar } from "@/components/TopBar";
import { Icon } from "@/components/Icon";
import {
  createClass,
  joinClassByCode,
  listMyClasses,
  type ClassRoom,
} from "@/lib/classes";
import { studentOpenCount } from "@/lib/lessons";
import { watchXp, watchQuests, xpLevel, type Quest } from "@/lib/xp";
import { MissionCelebrate } from "@/components/MissionCelebrate";
import { useCelebrateQueue } from "@/components/useCelebrateQueue";

// M3 tonal container 색 (장식 그라데이션 대신 평면 톤)
const SUBJECT_GRADIENTS = [
  "bg-[var(--md-sys-color-primary-container)]",
  "bg-[var(--md-sys-color-tertiary-container)]",
  "bg-[var(--md-sys-color-secondary-container)]",
  "bg-[var(--md-sys-color-surface-container-high)]",
  "bg-[var(--md-sys-color-primary)]",
];

export default function DashboardPage() {
  const { user, loading, profile, profileLoading } = useAuth();
  const router = useRouter();
  const [classes, setClasses] = useState<ClassRoom[] | null>(null);
  const [modal, setModal] = useState<"create" | "join" | null>(null);
  const isTeacher = profile?.role === "teacher";

  useEffect(() => {
    if (!loading && !user) router.replace("/");
  }, [user, loading, router]);

  // 온보딩 미완료 → 회원가입으로
  useEffect(() => {
    if (!loading && user && !profileLoading && !profile?.role)
      router.replace("/onboarding");
  }, [user, loading, profile, profileLoading, router]);

  const refresh = useCallback(async () => {
    if (!user) return;
    setClasses(await listMyClasses(user.uid));
  }, [user]);

  useEffect(() => {
    if (user) refresh();
  }, [user, refresh]);

  if (loading || !user || profileLoading || !profile?.role) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <div className="animate-pulse text-sm text-black/40">불러오는 중…</div>
      </main>
    );
  }

  return (
    <>
      <TopBar />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <div className="animate-float-in flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight">
            안녕하세요, {profile.name || "사용자"}님
            <Icon
              name="waving_hand"
              size={22}
              className="mx-1.5 align-middle text-[var(--md-sys-color-tertiary)]"
            />
            <span className="ml-1 align-middle text-xs font-semibold text-[var(--accent-strong)]">
              {isTeacher ? "교사" : "학생"}
            </span>
          </h1>
          <p className="text-sm text-black/55 dark:text-white/55">
            {isTeacher
              ? "학급을 만들고 차시를 운영해 보세요."
              : "참여 중인 학급입니다."}
          </p>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          {isTeacher ? (
            <>
              <GlassButton
                variant="accent"
                onClick={() => setModal("create")}
              >
                + 학급 만들기
              </GlassButton>
              <GlassButton onClick={() => router.push("/team")}>
                <Icon name="groups" size={18} />
                교사 팀
              </GlassButton>
              <GlassButton onClick={() => router.push("/compare")}>
                <Icon name="compare" size={18} />
                학급 비교
              </GlassButton>
            </>
          ) : (
            <GlassButton onClick={() => setModal("join")}>
              학급 코드로 참여
            </GlassButton>
          )}
        </div>

        {!isTeacher && classes && classes.length > 0 ? (
          <StudentClassBoard
            classes={classes}
            uid={user.uid}
            name={profile.name || user.displayName || "학생"}
            onGoClass={(cid) => router.push(`/class/?id=${cid}`)}
            onGoLevel={(cid) => router.push(`/level/?id=${cid}`)}
          />
        ) : (
        <section className="mt-8">
          {classes === null ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="glass h-44 animate-pulse opacity-60"
                />
              ))}
            </div>
          ) : classes.length === 0 ? (
            <GlassCard className="flex flex-col items-center gap-2 p-12 text-center">
              <Icon
                name="school"
                size={40}
                className="text-[var(--md-sys-color-on-surface-variant)]"
              />
              <p className="font-semibold">아직 학급이 없어요</p>
              <p className="text-sm text-black/50 dark:text-white/50">
                첫 학급을 만들어 학생들을 초대해 보세요.
              </p>
            </GlassCard>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {classes.map((c) => (
                <GlassCard
                  key={c.id}
                  interactive
                  className="overflow-hidden p-0"
                  onClick={() => router.push(`/class/?id=${c.id}`)}
                >
                  <div
                    className={`h-24 ${
                      SUBJECT_GRADIENTS[
                        c.colorIndex % SUBJECT_GRADIENTS.length
                      ]
                    }`}
                  />
                  <div className="p-5">
                    <h3 className="truncate text-lg font-bold">{c.name}</h3>
                    <p className="mt-0.5 truncate text-sm text-black/55 dark:text-white/55">
                      {c.subject || "과목 미지정"}
                    </p>
                    <div className="mt-4 flex items-center justify-between text-xs text-black/45 dark:text-white/45">
                      <span>
                        {c.ownerId === user.uid ? "내가 개설" : "참여 중"}
                      </span>
                      <span>멤버 {c.memberCount}명</span>
                    </div>
                  </div>
                </GlassCard>
              ))}
            </div>
          )}
        </section>
        )}
      </main>

      {modal === "create" && (
        <CreateModal
          onClose={() => setModal(null)}
          onDone={async () => {
            setModal(null);
            await refresh();
          }}
        />
      )}
      {modal === "join" && (
        <JoinModal
          onClose={() => setModal(null)}
          onDone={async () => {
            setModal(null);
            await refresh();
          }}
        />
      )}
    </>
  );
}

/**
 * 학생 대시보드 메인 — 학급 카드를 먼저 보여주고, 각 학급 옆에
 * 그 학급의 진행도(레벨/경험치)·미션·미제출 할 일을 함께 묶어 보여준다.
 */
function StudentClassBoard({
  classes,
  uid,
  name,
  onGoClass,
  onGoLevel,
}: {
  classes: ClassRoom[];
  uid: string;
  name: string;
  onGoClass: (cid: string) => void;
  onGoLevel: (cid: string) => void;
}) {
  const [data, setData] = useState<
    Record<string, { xp: number; quests: Quest[] }>
  >({});
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const { current: celebrate, enqueue: setCelebrate, done: celebrateDone } =
    useCelebrateQueue();

  // 미제출 할 일 수
  useEffect(() => {
    let alive = true;
    Promise.all(
      classes.map(
        async (c) =>
          [c.id, await studentOpenCount(c.id, uid).catch(() => 0)] as const
      )
    ).then((pairs) => {
      if (alive) setCounts(Object.fromEntries(pairs));
    });
    return () => {
      alive = false;
    };
  }, [classes, uid]);

  // 학급별 경험치/미션 실시간 구독 (교사 변경 즉시 반영 + 레벨업/미션 축하)
  useEffect(() => {
    const offs: (() => void)[] = [];
    for (const c of classes) {
      offs.push(
        watchXp(c.id, (m) => {
          const xp = m[uid] ?? 0;
          setData((prev) => ({
            ...prev,
            [c.id]: { xp, quests: prev[c.id]?.quests ?? [] },
          }));
          const lv = xpLevel(xp).level;
          const key = `lvlup:${c.id}:${uid}`;
          const seen = parseInt(localStorage.getItem(key) ?? "", 10);
          if (isNaN(seen)) localStorage.setItem(key, String(lv));
          else if (lv > seen) {
            localStorage.setItem(key, String(lv));
            setCelebrate({
              kind: "level",
              title: `${name}님, 레벨업을 축하해요!`,
              subtitle: `${c.name} · 레벨 ${lv} 달성`,
            });
          } else if (lv < seen) localStorage.setItem(key, String(lv));
        })
      );
      offs.push(
        watchQuests(c.id, (qs) => {
          const mine = qs.filter(
            (q) => q.targetType === "all" || q.assigneeUids.includes(uid)
          );
          setData((prev) => ({
            ...prev,
            [c.id]: { xp: prev[c.id]?.xp ?? 0, quests: mine },
          }));
          const newly = mine.filter((q) => {
            const key = `mdone:${c.id}:${q.id}`;
            if (q.completions[uid]) {
              if (localStorage.getItem(key)) return false;
              localStorage.setItem(key, "1");
              return true;
            }
            localStorage.removeItem(key);
            return false;
          });
          if (newly.length > 0) {
            const q = newly[newly.length - 1];
            setCelebrate({
              kind: "mission",
              title: "미션 완료!",
              subtitle: `${q.title} · +${q.xp} XP`,
            });
          }
        })
      );
    }
    return () => offs.forEach((o) => o());
  }, [classes, uid]);

  return (
    <section className="mt-6 flex flex-col gap-4">
      {classes.map((c) => {
        const xp = data[c.id]?.xp ?? 0;
        const lv = xpLevel(xp);
        const quests = data[c.id]?.quests ?? [];
        const todo = counts?.[c.id] ?? 0;
        return (
          <GlassCard key={c.id} className="overflow-hidden p-0">
            <div className="grid md:grid-cols-[minmax(0,17rem)_1fr]">
              {/* 좌: 학급 카드 (클릭 → 학급 입장) */}
              <button
                onClick={() => onGoClass(c.id)}
                className="group flex flex-col text-left transition hover:bg-black/[0.02]"
              >
                <div
                  className={`relative h-20 ${
                    SUBJECT_GRADIENTS[c.colorIndex % SUBJECT_GRADIENTS.length]
                  }`}
                >
                  {todo > 0 && (
                    <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-[var(--md-sys-color-error)] px-2.5 py-1 text-xs font-bold text-white shadow-sm">
                      <Icon name="assignment_late" size={14} />
                      미제출 {todo}
                    </span>
                  )}
                </div>
                <div className="flex flex-1 flex-col p-5">
                  <h3 className="truncate text-lg font-bold">{c.name}</h3>
                  <p className="mt-0.5 truncate text-sm text-black/55 dark:text-white/55">
                    {c.subject || "과목 미지정"}
                  </p>
                  <div className="mt-auto flex items-center gap-1 pt-4 text-xs font-semibold text-[var(--md-sys-color-primary)]">
                    학급 입장
                    <Icon
                      name="arrow_forward"
                      size={14}
                      className="transition group-hover:translate-x-0.5"
                    />
                  </div>
                </div>
              </button>

              {/* 우: 진행도 · 미션 · 할 일 */}
              <div className="flex flex-col gap-3 border-t border-[var(--md-sys-color-outline-variant)] p-5 md:border-l md:border-t-0">
                {/* 진행도 (클릭 → 레벨 페이지) */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => onGoLevel(c.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onGoLevel(c.id);
                    }
                  }}
                  className="cursor-pointer rounded-xl transition hover:bg-black/[0.03]"
                >
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-[var(--md-sys-color-primary)] px-2 py-0.5 text-xs font-extrabold text-white">
                      Lv.{lv.level}
                    </span>
                    <span className="flex items-center gap-1 text-xs font-bold text-[var(--md-sys-color-on-surface-variant)]">
                      <Icon name="stadia_controller" size={15} />내 성장
                    </span>
                    <span className="ml-auto shrink-0 text-xs text-black/45">
                      {xp.toLocaleString()} XP · 다음 레벨까지 {lv.remaining}
                    </span>
                  </div>
                  <span className="mt-1.5 block h-2 w-full overflow-hidden rounded-full bg-black/10">
                    <span
                      className="block h-full rounded-full bg-[var(--md-sys-color-primary)] transition-all"
                      style={{ width: `${Math.round(lv.pct * 100)}%` }}
                    />
                  </span>
                </div>

                {/* 미션 */}
                {quests.length > 0 ? (
                  <ul className="flex flex-col gap-1">
                    {quests.slice(0, 3).map((q) => {
                      const done = !!q.completions[uid];
                      return (
                        <li key={q.id} className="flex items-center gap-2 text-sm">
                          <Icon
                            name={done ? "task_alt" : "radio_button_unchecked"}
                            size={16}
                            className={
                              done
                                ? "text-[var(--md-sys-color-primary)]"
                                : "text-black/30"
                            }
                          />
                          <span className={done ? "text-black/45 line-through" : ""}>
                            {q.title}
                          </span>
                          <span className="ml-auto shrink-0 text-xs font-semibold text-[var(--md-sys-color-primary)]">
                            +{q.xp} XP
                          </span>
                        </li>
                      );
                    })}
                    {quests.length > 3 && (
                      <li className="text-xs text-black/40">
                        외 {quests.length - 3}개 · 레벨에서 모두 보기
                      </li>
                    )}
                  </ul>
                ) : (
                  <p className="text-sm text-black/45">진행 중인 미션이 없어요.</p>
                )}

                {/* 할 일 (미제출 → 학급으로) */}
                {todo > 0 && (
                  <button
                    onClick={() => onGoClass(c.id)}
                    className="flex items-center justify-between rounded-xl bg-[var(--md-sys-color-surface-container)] px-4 py-2.5 text-sm transition hover:bg-[var(--md-sys-color-surface-container-high)]"
                  >
                    <span className="flex items-center gap-1.5 font-medium">
                      <Icon
                        name="assignment"
                        size={16}
                        className="text-[var(--md-sys-color-primary)]"
                      />
                      할 일 · 답하지 않은 질문
                    </span>
                    <span className="flex items-center gap-1 text-xs font-semibold text-[var(--md-sys-color-primary)]">
                      미제출 {todo}
                      <Icon name="chevron_right" size={16} />
                    </span>
                  </button>
                )}
              </div>
            </div>
          </GlassCard>
        );
      })}
      {celebrate && (
        <MissionCelebrate
          key={`${celebrate.kind}:${celebrate.title}:${celebrate.subtitle ?? ""}`}
          title={celebrate.title}
          subtitle={celebrate.subtitle}
          kicker={celebrate.kind === "level" ? "LEVEL UP" : "MISSION CLEAR"}
          lottieSrc={
            celebrate.kind === "level"
              ? "/Confetti.json"
              : "/mission-success.json"
          }
          onDone={celebrateDone}
        />
      )}
    </section>
  );
}

function ModalShell({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <GlassCard
        strong
        className="w-full max-w-sm animate-float-in p-7"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold">{title}</h2>
        <div className="mt-5">{children}</div>
      </GlassCard>
    </div>
  );
}

const inputCls = "m3-field";

function CreateModal({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: () => void;
}) {
  const { user } = useAuth();
  const [form, setForm] = useState({ name: "", subject: "", description: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit() {
    if (!user || !form.name.trim()) return;
    setBusy(true);
    setErr("");
    try {
      await createClass(user, form);
      onDone();
    } catch {
      setErr("학급 생성에 실패했습니다. Firebase 설정을 확인해 주세요.");
      setBusy(false);
    }
  }

  return (
    <ModalShell title="새 학급 만들기" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <input
          className={inputCls}
          placeholder="학급 이름 (예: 3학년 2반 영어)"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          autoFocus
        />
        <input
          className={inputCls}
          placeholder="과목 (예: 영어)"
          value={form.subject}
          onChange={(e) => setForm({ ...form, subject: e.target.value })}
        />
        <textarea
          className={inputCls}
          placeholder="설명 (선택)"
          rows={3}
          value={form.description}
          onChange={(e) =>
            setForm({ ...form, description: e.target.value })
          }
        />
        {err && <p className="text-xs text-[var(--md-sys-color-error)]">{err}</p>}
        <button
          className="btn-accent mt-1 px-5 py-3 text-sm font-semibold"
          disabled={busy || !form.name.trim()}
          onClick={submit}
        >
          {busy ? "만드는 중…" : "만들기"}
        </button>
      </div>
    </ModalShell>
  );
}

function JoinModal({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: () => void;
}) {
  const { user } = useAuth();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit() {
    if (!user || !code.trim()) return;
    setBusy(true);
    setErr("");
    try {
      await joinClassByCode(code, user);
      onDone();
    } catch (e) {
      setErr(
        e instanceof Error ? e.message : "참여에 실패했습니다."
      );
      setBusy(false);
    }
  }

  return (
    <ModalShell title="코드로 학급 참여" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <input
          className={`${inputCls} text-center text-lg font-bold`}
          placeholder="파란고양이"
          maxLength={12}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          autoFocus
        />
        {err && <p className="text-xs text-[var(--md-sys-color-error)]">{err}</p>}
        <button
          className="btn-accent mt-1 px-5 py-3 text-sm font-semibold"
          disabled={busy || code.trim().length < 2}
          onClick={submit}
        >
          {busy ? "참여하는 중…" : "참여하기"}
        </button>
      </div>
    </ModalShell>
  );
}
