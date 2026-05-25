"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { GlassCard } from "@/components/Glass";
import { TopBar } from "@/components/TopBar";
import { Icon } from "@/components/Icon";
import { getMyRole, listMembers, type Member } from "@/lib/classes";
import { listGroups, type Group } from "@/lib/groups";
import { Leaderboard } from "@/components/Leaderboard";
import {
  MissionMeta,
  useLessonMeta,
  type LessonMeta,
} from "@/components/MissionMeta";
import {
  listLessons,
  listQuestions,
  type Lesson,
  type Question,
} from "@/lib/lessons";
import {
  createQuest,
  deleteQuest,
  grantXp,
  questLinkUrl,
  toggleQuestComplete,
  watchQuests,
  watchXp,
  xpLevel,
  type Quest,
  type QuestLink,
  type QuestTarget,
} from "@/lib/xp";
import {
  clearPresenter,
  sendEffect,
  setPresenter,
  startLock,
  startPresent,
  stopLock,
  stopPresent,
  watchLock,
  watchPresent,
  type ActivityLock,
  type PresentState,
} from "@/lib/live";

const KIND_LABEL: Record<string, string> = {
  question: "질문",
  quiz: "문항",
  link: "링크",
  canvas: "보드(캔버스)",
};
const KIND_ICON: Record<string, string> = {
  question: "help",
  quiz: "quiz",
  link: "link",
  canvas: "dashboard",
};

const LEVEL_COLORS = [
  "#4f7cff",
  "#23b27a",
  "#ffb020",
  "#ff6f91",
  "#a66bff",
  "#ff7a45",
];
function levelColor(level: number) {
  return LEVEL_COLORS[(level - 1) % LEVEL_COLORS.length];
}

function Avatar({ m, size = 44 }: { m: Member; size?: number }) {
  if (m.photoURL) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={m.photoURL}
        alt=""
        width={size}
        height={size}
        className="rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className="flex items-center justify-center rounded-full bg-[var(--md-sys-color-primary-container)] font-bold text-[var(--md-sys-color-on-primary-container)]"
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {(m.displayName || "?").slice(0, 1)}
    </span>
  );
}

function ClassAdminInner() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const cid = params.get("id") || params.get("class");

  const [role, setRole] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [xpMap, setXpMap] = useState<Record<string, number>>({});
  const [quests, setQuests] = useState<Quest[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [modal, setModal] = useState<null | "grant" | "quest" | "wizard">(null);
  const [showAllQuests, setShowAllQuests] = useState(false);
  const [lock, setLock] = useState<ActivityLock | null>(null);
  const [present, setPresent] = useState<PresentState | null>(null);
  const lessonMeta = useLessonMeta(cid);

  useEffect(() => {
    if (!loading && !user) router.replace("/");
  }, [user, loading, router]);

  useEffect(() => {
    if (!user || !cid) return;
    getMyRole(cid, user.uid).then(setRole);
    listMembers(cid).then(setMembers).catch(() => {});
    listGroups(cid).then(setGroups).catch(() => {});
    const off1 = watchXp(cid, setXpMap);
    const off2 = watchQuests(cid, setQuests);
    const off3 = watchLock(cid, setLock);
    const off4 = watchPresent(cid, setPresent);
    return () => {
      off1();
      off2();
      off3();
      off4();
    };
  }, [user, cid]);

  const students = useMemo(
    () => members.filter((m) => m.role === "student"),
    [members]
  );
  const nameOf = useMemo(() => {
    const m: Record<string, string> = {};
    members.forEach((x) => (m[x.uid] = x.displayName));
    return m;
  }, [members]);

  if (loading || !user || !cid) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <div className="animate-pulse text-sm text-black/40">불러오는 중…</div>
      </main>
    );
  }
  if (role && role !== "teacher") {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <GlassCard className="p-10 text-center">
          <p className="font-semibold">교사만 접근할 수 있습니다.</p>
          <button
            className="mt-4 text-sm text-[var(--md-sys-color-primary)] underline"
            onClick={() => router.push(`/class/?id=${cid}`)}
          >
            학급으로 돌아가기
          </button>
        </GlassCard>
      </main>
    );
  }

  function toggleSel(uid: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(uid)) n.delete(uid);
      else n.add(uid);
      return n;
    });
  }

  const totalXp = students.reduce((a, s) => a + (xpMap[s.uid] ?? 0), 0);

  return (
    <>
      <TopBar />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <button
          onClick={() => router.push(`/class/?id=${cid}`)}
          className="mb-3 inline-flex items-center gap-1 text-sm text-[var(--md-sys-color-on-surface-variant)] transition hover:text-[var(--md-sys-color-on-surface)]"
        >
          <Icon name="arrow_back" size={18} />
          학급
        </button>

        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight sm:text-3xl">
              <Icon
                name="stadia_controller"
                size={26}
                className="text-[var(--md-sys-color-primary)]"
              />
              학급 관리 · 경험치 &amp; 미션
            </h1>
            <p className="mt-1 text-sm text-black/55">
              학생 {students.length}명 · 누적 경험치 {totalXp.toLocaleString()} XP
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setModal("grant")}
              className="inline-flex items-center gap-1.5 rounded-full bg-[var(--md-sys-color-primary)] px-4 py-2 text-sm font-semibold text-white hover:brightness-105"
            >
              <Icon name="bolt" size={16} />
              경험치 주기
            </button>
            <button
              onClick={() => setModal("quest")}
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--md-sys-color-primary)] px-4 py-2 text-sm font-semibold text-[var(--md-sys-color-primary)] hover:bg-[color-mix(in_srgb,var(--md-sys-color-primary)_8%,transparent)]"
            >
              <Icon name="flag" size={16} />
              미션 만들기
            </button>
            <button
              onClick={() => setModal("wizard")}
              className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-semibold transition ${
                present?.active || lock?.active
                  ? "border-transparent bg-[var(--md-sys-color-tertiary-container)] text-[var(--md-sys-color-on-tertiary-container)]"
                  : "border-[var(--md-sys-color-outline)] text-[var(--md-sys-color-on-surface)] hover:bg-black/5"
              }`}
            >
              <Icon
                name={
                  present?.active
                    ? "campaign"
                    : lock?.active
                      ? "hourglass_top"
                      : "auto_awesome"
                }
                size={16}
              />
              {present?.active
                ? "발표 진행 중"
                : lock?.active
                  ? "활동 잠금 중"
                  : "효과 마법사"}
            </button>
          </div>
        </div>

        {/* 선택 도구 */}
        <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-black/55">
            선택{" "}
            <b className="text-[var(--md-sys-color-primary)]">
              {selected.size}
            </b>
            명
          </span>
          <button
            onClick={() => setSelected(new Set(students.map((s) => s.uid)))}
            className="rounded-full border border-[var(--md-sys-color-outline)] px-3 py-1 text-xs hover:bg-black/5"
          >
            전체 선택
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="rounded-full border border-[var(--md-sys-color-outline)] px-3 py-1 text-xs hover:bg-black/5"
          >
            선택 해제
          </button>
          {groups.length > 0 && (
            <span className="ml-1 flex flex-wrap items-center gap-1">
              <span className="text-xs text-black/40">모둠:</span>
              {groups.map((g) => (
                <button
                  key={g.id}
                  onClick={() =>
                    setSelected(
                      new Set(
                        g.memberUids.filter((u) =>
                          students.some((s) => s.uid === u)
                        )
                      )
                    )
                  }
                  className="rounded-full border px-2.5 py-1 text-xs hover:bg-black/5"
                  style={{
                    borderColor: g.color ?? "var(--md-sys-color-outline)",
                  }}
                >
                  {g.name}
                </button>
              ))}
            </span>
          )}
        </div>

        {/* 학생 카드 그리드 (1:1) */}
        {students.length === 0 ? (
          <GlassCard className="p-10 text-center text-sm text-black/45">
            아직 학생이 없습니다. 학급 코드로 학생을 초대하세요.
          </GlassCard>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {students.map((s) => {
              const xp = xpMap[s.uid] ?? 0;
              const lv = xpLevel(xp);
              const on = selected.has(s.uid);
              const col = levelColor(lv.level);
              return (
                <button
                  key={s.uid}
                  onClick={() => toggleSel(s.uid)}
                  className={`group relative flex aspect-square flex-col items-center justify-between rounded-2xl border bg-[var(--md-sys-color-surface)] p-3 text-center transition ${
                    on
                      ? "border-[var(--md-sys-color-primary)] ring-2 ring-[var(--md-sys-color-primary)]"
                      : "border-[var(--md-sys-color-outline-variant)] hover:border-[var(--md-sys-color-outline)]"
                  }`}
                >
                  {/* 레벨 배지 */}
                  <span
                    className="absolute left-2 top-2 rounded-full px-2 py-0.5 text-xs font-extrabold text-white"
                    style={{ background: col }}
                  >
                    Lv.{lv.level}
                  </span>
                  {on && (
                    <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--md-sys-color-primary)] text-white">
                      <Icon name="check" size={13} />
                    </span>
                  )}

                  <span className="mt-3" />
                  <Avatar m={s} size={68} />
                  <span className="line-clamp-1 w-full text-base font-semibold">
                    {s.displayName}
                  </span>

                  <span className="w-full">
                    <span className="flex items-center justify-between text-xs text-black/45">
                      <span>{xp.toLocaleString()} XP</span>
                      <span>다음 {lv.remaining}</span>
                    </span>
                    <span className="mt-0.5 block h-1.5 w-full overflow-hidden rounded-full bg-black/10">
                      <span
                        className="block h-full rounded-full transition-all"
                        style={{
                          width: `${Math.round(lv.pct * 100)}%`,
                          background: col,
                        }}
                      />
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* 좌: 경험치 랭킹 · 우: 미션 */}
        <div className="mt-10 grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
          {/* 랭킹 */}
          <section>
            <h2 className="mb-3 flex items-center gap-2 text-lg font-bold">
              <Icon
                name="leaderboard"
                size={20}
                className="text-[var(--md-sys-color-primary)]"
              />
              경험치 랭킹
            </h2>
            <GlassCard className="p-4">
              {students.length > 0 ? (
                <Leaderboard students={students} xpMap={xpMap} />
              ) : (
                <p className="py-6 text-center text-sm text-black/45">
                  학생이 없습니다.
                </p>
              )}
            </GlassCard>
          </section>

          {/* 미션 */}
          <section>
            <h2 className="mb-3 flex items-center gap-2 text-lg font-bold">
              <Icon
                name="flag"
                size={20}
                className="text-[var(--md-sys-color-primary)]"
              />
              미션 {quests.length > 0 && `(${quests.length})`}
            </h2>
            {quests.length === 0 ? (
              <GlassCard className="p-8 text-center text-sm text-black/45">
                아직 미션이 없습니다. “미션 만들기”로 첫 미션을 등록하세요.
              </GlassCard>
            ) : (
              <div className="flex flex-col gap-3">
                {(showAllQuests ? quests : quests.slice(0, 3)).map((q) => (
                  <QuestRow
                    key={q.id}
                    cid={cid}
                    quest={q}
                    nameOf={nameOf}
                    students={students}
                    meta={lessonMeta}
                    onDelete={() => deleteQuest(cid, q.id)}
                    by={user.uid}
                  />
                ))}
                {quests.length > 3 && (
                  <button
                    onClick={() => setShowAllQuests((v) => !v)}
                    className="inline-flex items-center justify-center gap-1 self-center rounded-full border border-[var(--md-sys-color-outline)] px-4 py-2 text-sm font-semibold text-[var(--md-sys-color-on-surface-variant)] hover:bg-black/5"
                  >
                    <Icon
                      name={showAllQuests ? "expand_less" : "history"}
                      size={16}
                    />
                    {showAllQuests
                      ? "최근 미션만 보기"
                      : `이전 미션 ${quests.length - 3}개 더보기`}
                  </button>
                )}
              </div>
            )}
          </section>
        </div>
      </main>

      {modal === "grant" && (
        <GrantModal
          students={students}
          groups={groups}
          selected={selected}
          onClose={() => setModal(null)}
          onSubmit={async (uids, amount, reason) => {
            await grantXp(cid, uids, amount, reason, user.uid);
            setModal(null);
          }}
        />
      )}
      {modal === "quest" && (
        <QuestModal
          cid={cid}
          students={students}
          groups={groups}
          selected={selected}
          onClose={() => setModal(null)}
          onSubmit={async (data) => {
            await createQuest(cid, data, user.uid);
            setModal(null);
          }}
        />
      )}
      {modal === "wizard" && (
        <WizardModal
          students={students}
          selected={selected}
          xpMap={xpMap}
          nameOf={nameOf}
          lock={lock}
          present={present}
          onClose={() => setModal(null)}
          onSendEffect={(uids, effect) =>
            Promise.all(
              uids.map((u) => sendEffect(cid, u, effect, user.uid))
            ).then(() => {})
          }
          onStartLock={(ms) => startLock(cid, ms, user.uid)}
          onStopLock={() => stopLock(cid)}
          onSetPresenter={(uid, name, cheer) =>
            setPresenter(cid, uid, name, cheer, user.uid)
          }
          onClearPresenter={() => clearPresenter(cid)}
          onStartPresent={() => startPresent(cid, user.uid)}
          onStopPresent={() => stopPresent(cid)}
        />
      )}
    </>
  );
}

// ---------- 미션 행 ----------
function QuestRow({
  cid,
  quest,
  nameOf,
  students,
  meta,
  onDelete,
  by,
}: {
  cid: string;
  quest: Quest;
  nameOf: Record<string, string>;
  students: Member[];
  meta: LessonMeta;
  onDelete: () => void;
  by: string;
}) {
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const assignees =
    quest.targetType === "all"
      ? students.map((s) => s.uid)
      : quest.assigneeUids;
  const done = assignees.filter((u) => quest.completions[u]).length;

  // 패널 열 때 현재 완료 상태로 체크박스 초기화
  useEffect(() => {
    if (open)
      setSel(new Set(assignees.filter((u) => quest.completions[u])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const selAll = assignees.length > 0 && assignees.every((u) => sel.has(u));
  const pending = assignees.filter(
    (u) => sel.has(u) !== !!quest.completions[u]
  );

  async function applyCompletion() {
    if (pending.length === 0 || saving) return;
    setSaving(true);
    try {
      for (const uid of pending) {
        await toggleQuestComplete(cid, quest, uid, sel.has(uid), by);
      }
    } finally {
      setSaving(false);
    }
  }
  const targetLabel =
    quest.targetType === "all"
      ? "전체"
      : quest.targetType === "group"
        ? `모둠 · ${quest.groupName ?? ""}`
        : `개별 ${quest.assigneeUids.length}명`;

  return (
    <GlassCard className="p-4">
      <div className="flex items-center gap-4">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-1.5 font-bold">
            <span className="truncate">{quest.title}</span>
            <span className="shrink-0 rounded-full bg-[var(--md-sys-color-primary-container)] px-2 py-0.5 text-xs font-extrabold text-[var(--md-sys-color-on-primary-container)]">
              +{quest.xp} XP
            </span>
          </p>
          {quest.description && (
            <p className="mt-0.5 line-clamp-2 text-xs text-black/55">
              {quest.description}
            </p>
          )}
          <p className="mt-1 text-xs text-black/45">
            대상: {targetLabel} · 완료 {done}/{assignees.length}
          </p>
          <MissionMeta quest={quest} meta={meta} />
          <span className="mt-1.5 block h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-black/10">
            <span
              className="block h-full rounded-full bg-[var(--md-sys-color-primary)]"
              style={{
                width: `${
                  assignees.length ? (done / assignees.length) * 100 : 0
                }%`,
              }}
            />
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            onClick={() => setOpen((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-2xl px-5 py-3 text-sm font-bold shadow-sm transition ${
              open
                ? "bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface)]"
                : "bg-[var(--md-sys-color-primary)] text-white hover:brightness-105"
            }`}
          >
            <Icon name={open ? "expand_less" : "checklist"} size={18} />
            {open ? "접기" : "완료 체크"}
          </button>
          <button
            onClick={onDelete}
            className="flex h-9 w-9 items-center justify-center rounded-full text-black/35 hover:bg-[var(--md-sys-color-error-container)] hover:text-[var(--md-sys-color-error)]"
            title="미션 삭제"
          >
            <Icon name="delete" size={18} />
          </button>
        </div>
      </div>

      {open && (
        <div className="mt-3 border-t border-[var(--md-sys-color-outline-variant)] pt-3">
          {assignees.length > 0 && (
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <button
                onClick={() =>
                  setSel(selAll ? new Set() : new Set(assignees))
                }
                className="inline-flex items-center gap-1 rounded-full border border-[var(--md-sys-color-outline)] px-3 py-1.5 text-xs font-semibold text-black/60 hover:bg-black/5"
              >
                <Icon
                  name={selAll ? "remove_done" : "done_all"}
                  size={16}
                />
                {selAll ? "전체 해제" : "전체 선택"}
              </button>
              <button
                onClick={applyCompletion}
                disabled={pending.length === 0 || saving}
                className="inline-flex items-center gap-1 rounded-full bg-[var(--md-sys-color-primary)] px-4 py-1.5 text-xs font-bold text-white disabled:opacity-40"
              >
                <Icon name="check" size={16} />
                {saving
                  ? "적용 중…"
                  : pending.length > 0
                    ? `완료 적용 (${pending.length})`
                    : "변경 없음"}
              </button>
            </div>
          )}
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {assignees.length === 0 ? (
              <p className="text-xs text-black/40">대상 학생이 없습니다.</p>
            ) : (
              assignees.map((uid) => {
                const picked = sel.has(uid);
                const dirty = picked !== !!quest.completions[uid];
                return (
                  <label
                    key={uid}
                    className={`flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm transition ${
                      picked
                        ? "border-[var(--md-sys-color-primary)] bg-[var(--md-sys-color-primary-container)]"
                        : "border-[var(--md-sys-color-outline-variant)] hover:bg-black/5"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={picked}
                      onChange={(e) =>
                        setSel((s) => {
                          const n = new Set(s);
                          if (e.target.checked) n.add(uid);
                          else n.delete(uid);
                          return n;
                        })
                      }
                      className="h-6 w-6 shrink-0 accent-[var(--md-sys-color-primary)]"
                    />
                    <span
                      className={`flex-1 font-medium ${
                        picked
                          ? "text-[var(--md-sys-color-on-primary-container)]"
                          : ""
                      }`}
                    >
                      {nameOf[uid] ?? uid}
                    </span>
                    {dirty && (
                      <span className="shrink-0 text-xs font-bold text-[var(--md-sys-color-primary)]">
                        변경
                      </span>
                    )}
                  </label>
                );
              })
            )}
          </div>
        </div>
      )}
    </GlassCard>
  );
}

// ---------- 대상 선택 (공통) ----------
function useResolvedTarget(
  mode: QuestTarget,
  groupId: string,
  students: Member[],
  groups: Group[],
  selected: Set<string>
) {
  return useMemo(() => {
    if (mode === "all") return students.map((s) => s.uid);
    if (mode === "group") {
      const g = groups.find((x) => x.id === groupId);
      return (g?.memberUids ?? []).filter((u) =>
        students.some((s) => s.uid === u)
      );
    }
    return [...selected];
  }, [mode, groupId, students, groups, selected]);
}

function ModalShell({
  title,
  icon,
  children,
  onClose,
}: {
  title: string;
  icon: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <GlassCard
        strong
        className="w-full max-w-md animate-float-in p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <Icon
            name={icon}
            size={20}
            className="text-[var(--md-sys-color-primary)]"
          />
          {title}
        </h2>
        <div className="mt-4">{children}</div>
      </GlassCard>
    </div>
  );
}

function TargetPicker({
  mode,
  setMode,
  groupId,
  setGroupId,
  groups,
  selectedCount,
  count,
}: {
  mode: QuestTarget;
  setMode: (m: QuestTarget) => void;
  groupId: string;
  setGroupId: (g: string) => void;
  groups: Group[];
  selectedCount: number;
  count: number;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-1.5">
        {(
          [
            ["all", "전체"],
            ["group", "모둠"],
            ["individual", `선택 (${selectedCount})`],
          ] as const
        ).map(([m, label]) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold transition ${
              mode === m
                ? "bg-[var(--md-sys-color-primary)] text-white"
                : "border border-[var(--md-sys-color-outline)] text-black/60"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {mode === "group" && (
        <select
          value={groupId}
          onChange={(e) => setGroupId(e.target.value)}
          className="m3-field !py-2 !text-sm"
        >
          <option value="">모둠 선택…</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      )}
      <p className="text-xs text-black/45">대상 학생 {count}명</p>
    </div>
  );
}

function GrantModal({
  students,
  groups,
  selected,
  onClose,
  onSubmit,
}: {
  students: Member[];
  groups: Group[];
  selected: Set<string>;
  onClose: () => void;
  onSubmit: (uids: string[], amount: number, reason: string) => Promise<void>;
}) {
  const [mode, setMode] = useState<QuestTarget>(
    selected.size > 0 ? "individual" : "all"
  );
  const [groupId, setGroupId] = useState("");
  const [amount, setAmount] = useState(10);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const uids = useResolvedTarget(mode, groupId, students, groups, selected);

  return (
    <ModalShell title="경험치 주기" icon="bolt" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <TargetPicker
          mode={mode}
          setMode={setMode}
          groupId={groupId}
          setGroupId={setGroupId}
          groups={groups}
          selectedCount={selected.size}
          count={uids.length}
        />
        {/* 자주 쓰는 보상 (기본 10 XP) */}
        <div>
          <p className="mb-1 text-sm font-semibold text-black/60">빠른 보상</p>
          <div className="flex flex-wrap gap-1.5">
            {["칭찬", "발표"].map((r) => (
              <button
                key={r}
                onClick={() => {
                  setReason(r);
                  setAmount(10);
                }}
                className={`rounded-full px-3 py-1.5 text-sm font-semibold transition ${
                  reason === r && amount === 10
                    ? "bg-[var(--md-sys-color-primary)] text-white"
                    : "border border-[var(--md-sys-color-outline)] text-black/60"
                }`}
              >
                {r} +10
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-1 text-sm font-semibold text-black/60">경험치</p>
          <div className="flex flex-wrap gap-1.5">
            {[10, 20, 50, 100, -10].map((v) => (
              <button
                key={v}
                onClick={() => setAmount(v)}
                className={`rounded-full px-3 py-1.5 text-sm font-semibold transition ${
                  amount === v
                    ? "bg-[var(--md-sys-color-primary)] text-white"
                    : "border border-[var(--md-sys-color-outline)] text-black/60"
                }`}
              >
                {v > 0 ? `+${v}` : v}
              </button>
            ))}
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(parseInt(e.target.value, 10) || 0)}
              className="m3-field w-20 !py-1.5 !text-sm"
            />
          </div>
        </div>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="사유 (선택, 예: 발표 우수)"
          className="m3-field !py-2 !text-sm"
        />
        <button
          disabled={busy || uids.length === 0 || !amount}
          onClick={async () => {
            setBusy(true);
            try {
              await onSubmit(uids, amount, reason);
            } finally {
              setBusy(false);
            }
          }}
          className="btn-accent px-5 py-3 text-sm font-semibold disabled:opacity-50"
        >
          {busy
            ? "지급 중…"
            : `${uids.length}명에게 ${amount > 0 ? "+" : ""}${amount} XP`}
        </button>
      </div>
    </ModalShell>
  );
}

function QuestModal({
  cid,
  students,
  groups,
  selected,
  onClose,
  onSubmit,
}: {
  cid: string;
  students: Member[];
  groups: Group[];
  selected: Set<string>;
  onClose: () => void;
  onSubmit: (data: {
    title: string;
    description: string;
    xp: number;
    targetType: QuestTarget;
    assigneeUids: string[];
    groupId?: string | null;
    groupName?: string | null;
    link?: QuestLink | null;
  }) => Promise<void>;
}) {
  const [mode, setMode] = useState<QuestTarget>(
    selected.size > 0 ? "individual" : "all"
  );
  const [groupId, setGroupId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [xp, setXp] = useState(50);
  const [busy, setBusy] = useState(false);
  const uids = useResolvedTarget(mode, groupId, students, groups, selected);
  const groupName = groups.find((g) => g.id === groupId)?.name ?? null;

  // 차시 활동 연계
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [lessonId, setLessonId] = useState("");
  const [activities, setActivities] = useState<Question[]>([]);
  const [activityId, setActivityId] = useState("");

  useEffect(() => {
    listLessons(cid).then(setLessons).catch(() => {});
  }, [cid]);
  useEffect(() => {
    if (!lessonId) {
      setActivities([]);
      setActivityId("");
      return;
    }
    listQuestions(cid, lessonId)
      .then((qs) => setActivities(qs))
      .catch(() => setActivities([]));
    setActivityId("");
  }, [cid, lessonId]);

  function buildLink(): QuestLink | null {
    if (!lessonId) return null;
    const lesson = lessons.find((l) => l.id === lessonId);
    const act = activities.find((a) => a.id === activityId);
    return {
      lessonId,
      lessonTitle: lesson?.title ?? "차시",
      activityId: act?.id ?? "",
      activityKind: act?.kind ?? "question",
      activityTitle:
        act?.title?.trim() ||
        (act ? KIND_LABEL[act.kind] ?? "활동" : "차시 전체"),
    };
  }

  // 미션 제목이 비어 있으면 선택한 활동명으로 제안
  function applyActivityTitle(qs: Question[], aid: string) {
    const act = qs.find((a) => a.id === aid);
    if (act && !title.trim()) {
      setTitle(
        `${act.title?.trim() || KIND_LABEL[act.kind] || "활동"} 완료하기`
      );
    }
  }

  return (
    <ModalShell title="미션 만들기" icon="flag" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="미션 제목 (예: 단어 20개 외우기)"
          autoFocus
          className="m3-field !py-2 !text-sm"
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="설명 (선택)"
          rows={2}
          className="m3-field !py-2 !text-sm"
        />
        <div>
          <p className="mb-1 text-sm font-semibold text-black/60">보상 경험치</p>
          <div className="flex flex-wrap gap-1.5">
            {[20, 50, 100, 200].map((v) => (
              <button
                key={v}
                onClick={() => setXp(v)}
                className={`rounded-full px-3 py-1.5 text-sm font-semibold transition ${
                  xp === v
                    ? "bg-[var(--md-sys-color-primary)] text-white"
                    : "border border-[var(--md-sys-color-outline)] text-black/60"
                }`}
              >
                +{v}
              </button>
            ))}
            <input
              type="number"
              value={xp}
              onChange={(e) => setXp(parseInt(e.target.value, 10) || 0)}
              className="m3-field w-20 !py-1.5 !text-sm"
            />
          </div>
        </div>
        <div>
          <p className="mb-1 text-sm font-semibold text-black/60">
            차시 활동 연계{" "}
            <span className="font-normal text-black/40">(선택)</span>
          </p>
          <div className="flex flex-col gap-2">
            <select
              value={lessonId}
              onChange={(e) => setLessonId(e.target.value)}
              className="m3-field !py-2 !text-sm"
            >
              <option value="">차시 선택 안 함</option>
              {lessons.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.title || "(제목 없음)"}
                </option>
              ))}
            </select>
            {lessonId && (
              <select
                value={activityId}
                onChange={(e) => {
                  setActivityId(e.target.value);
                  applyActivityTitle(activities, e.target.value);
                }}
                className="m3-field !py-2 !text-sm"
              >
                <option value="">차시 전체 (활동 미지정)</option>
                {activities.map((a) => (
                  <option key={a.id} value={a.id}>
                    [{KIND_LABEL[a.kind] ?? a.kind}]{" "}
                    {a.title?.trim() || "(제목 없음)"}
                  </option>
                ))}
              </select>
            )}
            {lessonId && (
              <p className="text-xs text-black/45">
                학생 미션에 “활동 열기” 버튼이 표시되어 해당 활동으로 바로
                이동합니다.
              </p>
            )}
          </div>
        </div>
        <div>
          <p className="mb-1 text-sm font-semibold text-black/60">대상</p>
          <TargetPicker
            mode={mode}
            setMode={setMode}
            groupId={groupId}
            setGroupId={setGroupId}
            groups={groups}
            selectedCount={selected.size}
            count={uids.length}
          />
        </div>
        <button
          disabled={busy || !title.trim() || uids.length === 0}
          onClick={async () => {
            setBusy(true);
            try {
              await onSubmit({
                title,
                description,
                xp,
                targetType: mode,
                assigneeUids: mode === "all" ? [] : uids,
                groupId: mode === "group" ? groupId : null,
                groupName: mode === "group" ? groupName : null,
                link: buildLink(),
              });
            } finally {
              setBusy(false);
            }
          }}
          className="btn-accent mt-1 px-5 py-3 text-sm font-semibold disabled:opacity-50"
        >
          {busy ? "만드는 중…" : `미션 등록 (${uids.length}명 대상)`}
        </button>
      </div>
    </ModalShell>
  );
}

// ---------- 기능 & 효과 마법사 ----------
function WizardModal({
  students,
  selected,
  xpMap,
  nameOf,
  lock,
  present,
  onClose,
  onSendEffect,
  onStartLock,
  onStopLock,
  onSetPresenter,
  onClearPresenter,
  onStartPresent,
  onStopPresent,
}: {
  students: Member[];
  selected: Set<string>;
  xpMap: Record<string, number>;
  nameOf: Record<string, string>;
  lock: ActivityLock | null;
  present: PresentState | null;
  onClose: () => void;
  onSendEffect: (
    uids: string[],
    effect: {
      kind: "mission" | "level" | "present";
      title: string;
      subtitle?: string;
    }
  ) => Promise<void>;
  onStartLock: (ms: number) => Promise<void>;
  onStopLock: () => Promise<void>;
  onSetPresenter: (uid: string, name: string, cheer: string) => Promise<void>;
  onClearPresenter: () => Promise<void>;
  onStartPresent: () => Promise<void>;
  onStopPresent: () => Promise<void>;
}) {
  const [sel, setSel] = useState<Set<string>>(new Set(selected));
  const uids = students.filter((s) => sel.has(s.uid)).map((s) => s.uid);
  const single = uids.length === 1 ? uids[0] : null;

  const [kind, setKind] = useState<"mission" | "level" | "present">("mission");
  const presentActive = !!present?.active;
  const presenterUid = present?.uid ?? null;

  // 발표 모드: 기본 효과가 켜진 상태에서만 카드 클릭으로 발표자(무지개) 토글
  async function togglePresenter(uid: string, name: string) {
    if (!presentActive) return;
    if (presenterUid === uid) await onClearPresenter();
    else await onSetPresenter(uid, name, msg.trim());
  }
  const [msg, setMsg] = useState("");
  const [sending, setSending] = useState(false);
  const [sentOk, setSentOk] = useState(false);

  // 잠금 타이머 입력
  const [min, setMin] = useState(1);
  const [sec, setSec] = useState(0);
  const [busyLock, setBusyLock] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const lockActive = !!lock?.active && (lock.until == null || lock.until > now);
  useEffect(() => {
    if (!lockActive) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [lockActive]);

  function toggle(uid: string) {
    setSel((s) => {
      const n = new Set(s);
      if (n.has(uid)) n.delete(uid);
      else n.add(uid);
      return n;
    });
  }

  function buildEffect() {
    const name = single ? nameOf[single] : "";
    if (kind === "level") {
      return {
        kind: "level" as const,
        title: name ? `${name}님, 레벨업을 축하해요!` : "레벨업을 축하해요!",
        subtitle:
          msg.trim() ||
          (single ? `레벨 ${xpLevel(xpMap[single] ?? 0).level} 달성` : undefined),
      };
    }
    if (kind === "present") {
      return {
        kind: "present" as const,
        title: name ? `${name}님, 발표해봅시다!` : "발표해봅시다!",
        subtitle: msg.trim() || undefined,
      };
    }
    return {
      kind: "mission" as const,
      title: "미션 완료!",
      subtitle: msg.trim() || "참 잘했어요! 🎉",
    };
  }

  async function send() {
    if (uids.length === 0) return;
    setSending(true);
    try {
      await onSendEffect(uids, buildEffect());
      setSentOk(true);
      setTimeout(() => setSentOk(false), 1800);
    } finally {
      setSending(false);
    }
  }

  const lockMs = (min * 60 + sec) * 1000;
  const remaining = lock?.until != null ? lock.until - now : null;
  function fmt(ms: number) {
    const s = Math.max(0, Math.ceil(ms / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  }

  async function toggleLock() {
    setBusyLock(true);
    try {
      if (lockActive) await onStopLock();
      else if (lockMs > 0) await onStartLock(lockMs);
    } finally {
      setBusyLock(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--md-sys-color-scrim)]/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <GlassCard
        strong
        className="flex h-[90vh] max-h-[860px] min-h-[520px] w-full max-w-6xl animate-float-in flex-col overflow-hidden p-0"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between border-b border-[var(--md-sys-color-outline-variant)] px-6 py-4">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <Icon
              name="auto_awesome"
              size={20}
              className="text-[var(--md-sys-color-primary)]"
            />
            기능 &amp; 효과 마법사
          </h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--md-sys-color-on-surface-variant)] transition hover:bg-black/5"
          >
            <Icon name="close" size={20} />
          </button>
        </div>

        {/* 본문: 좌 학생 / 우 컨트롤 */}
        <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[1fr_360px] lg:grid-cols-[1fr_400px]">
          {/* 좌측: 학생 선택 */}
          <div className="flex min-h-0 flex-col border-b border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)] md:border-b-0 md:border-r">
            <div className="flex items-center justify-between px-4 py-3">
              {kind === "present" ? (
                <span className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                  {presentActive ? (
                    <>
                      카드를 누르면 그 학생에게 <b>무지개 발표 화면</b> · 다시
                      누르면 해제
                    </>
                  ) : (
                    <>
                      먼저 <b>효과 적용</b>으로 전체에 발표 모드를 켜세요
                    </>
                  )}
                </span>
              ) : (
                <>
                  <span className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                    선택{" "}
                    <b className="text-[var(--md-sys-color-primary)]">
                      {uids.length}
                    </b>{" "}
                    / {students.length}
                  </span>
                  <div className="flex gap-1">
                    <button
                      onClick={() => setSel(new Set(students.map((s) => s.uid)))}
                      className="rounded-full px-2.5 py-1 text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)] transition hover:bg-black/5"
                    >
                      전체
                    </button>
                    <button
                      onClick={() => setSel(new Set())}
                      className="rounded-full px-2.5 py-1 text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)] transition hover:bg-black/5"
                    >
                      해제
                    </button>
                  </div>
                </>
              )}
            </div>
            <div className="max-h-48 min-h-0 flex-1 overflow-y-auto px-3 pb-3 md:max-h-none">
              {students.length === 0 ? (
                <p className="px-2 py-6 text-center text-xs text-[var(--md-sys-color-on-surface-variant)]">
                  학생이 없습니다.
                </p>
              ) : (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5">
                  {students.map((s) => {
                    const isPresent = kind === "present";
                    const presenting = isPresent && presenterUid === s.uid;
                    const on = isPresent ? presenting : sel.has(s.uid);
                    const disabled = isPresent && !presentActive;
                    const lv = xpLevel(xpMap[s.uid] ?? 0);
                    return (
                      <button
                        key={s.uid}
                        disabled={disabled}
                        onClick={() =>
                          isPresent
                            ? togglePresenter(s.uid, s.displayName)
                            : toggle(s.uid)
                        }
                        className={`relative flex flex-col items-center gap-1 overflow-hidden rounded-2xl border p-2.5 transition ${
                          on
                            ? "border-[var(--md-sys-color-primary)] bg-[var(--md-sys-color-primary-container)]"
                            : "border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] hover:border-[var(--md-sys-color-outline)]"
                        } ${disabled ? "cursor-not-allowed opacity-40" : ""}`}
                      >
                        {presenting && (
                          <span className="jam-present-bg absolute inset-x-0 top-0 h-1.5" />
                        )}
                        {on && (
                          <span className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--md-sys-color-primary)] text-white">
                            <Icon name={isPresent ? "campaign" : "check"} size={11} />
                          </span>
                        )}
                        <Avatar m={s} size={44} />
                        <span className="line-clamp-1 w-full text-center text-xs font-semibold">
                          {s.displayName}
                        </span>
                        <span className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                          {presenting ? "발표 중" : `Lv.${lv.level}`}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* 우측: 컨트롤 */}
          <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-5">
            {/* 효과 보내기 */}
            <section className="flex flex-col gap-3">
              <h3 className="flex items-center gap-1.5 text-sm font-bold">
                <Icon
                  name="celebration"
                  size={16}
                  className="text-[var(--md-sys-color-primary)]"
                />
                효과 보내기
                <span className="font-normal text-[var(--md-sys-color-on-surface-variant)]">
                  · 놓친 학생에게 다시
                </span>
              </h3>
              {kind === "present" ? (
                <p className="rounded-xl bg-[var(--md-sys-color-surface-container-high)] px-3 py-2.5 text-xs leading-relaxed text-[var(--md-sys-color-on-surface-variant)]">
                  ① <b>효과 적용</b>하면 전체 학생에게 기본 발표 효과가 적용돼요(모두
                  잠금). ② 왼쪽 학생 카드를 누르면 그 학생에게 무지개 발표 화면이
                  추가로 제공됩니다.
                </p>
              ) : uids.length === 0 ? (
                <p className="rounded-xl bg-[var(--md-sys-color-surface-container-high)] px-3 py-2.5 text-xs text-[var(--md-sys-color-on-surface-variant)]">
                  왼쪽에서 학생을 선택하세요.
                </p>
              ) : (
                <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                  대상{" "}
                  <b className="text-[var(--md-sys-color-primary)]">
                    {uids.length}
                  </b>
                  명
                  {single && nameOf[single] ? ` · ${nameOf[single]}` : ""}
                </p>
              )}
              <div className="flex gap-1.5">
                {(
                  [
                    ["mission", "미션 완료", "flag"],
                    ["level", "레벨업", "trending_up"],
                    ["present", "발표하기", "campaign"],
                  ] as const
                ).map(([k, label, icon]) => (
                  <button
                    key={k}
                    onClick={() => setKind(k)}
                    className={`flex flex-1 items-center justify-center gap-1 whitespace-nowrap rounded-xl px-2 py-2 text-[13px] font-semibold transition ${
                      kind === k
                        ? "bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)]"
                        : "border border-[var(--md-sys-color-outline)] text-[var(--md-sys-color-on-surface-variant)]"
                    }`}
                  >
                    <Icon name={icon} size={16} />
                    {label}
                  </button>
                ))}
              </div>
              <input
                value={msg}
                onChange={(e) => setMsg(e.target.value)}
                placeholder={
                  kind === "present"
                    ? "응원 문구 (선택, 예: gogo!)"
                    : "문구 (선택, 예: 참 잘했어요!)"
                }
                className="m3-field !py-2 !text-sm"
              />
              {kind === "present" ? (
                presentActive ? (
                  <div className="flex flex-col gap-2">
                    <p className="rounded-xl bg-[var(--md-sys-color-tertiary-container)] px-3 py-2 text-center text-xs font-semibold text-[var(--md-sys-color-on-tertiary-container)]">
                      {presenterUid
                        ? `${nameOf[presenterUid] ?? "학생"}님 발표 중 (무지개)`
                        : "전체 발표 모드 적용 중 · 카드를 눌러 발표자 지정"}
                    </p>
                    <button
                      onClick={onStopPresent}
                      className="inline-flex items-center justify-center gap-1.5 rounded-full bg-[var(--md-sys-color-error-container)] px-4 py-2.5 text-sm font-bold text-[var(--md-sys-color-on-error-container)] transition hover:brightness-105"
                    >
                      <Icon name="stop_circle" size={18} />
                      발표 모드 종료
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={onStartPresent}
                    className="inline-flex items-center justify-center gap-1.5 rounded-full bg-[var(--md-sys-color-primary)] px-4 py-2.5 text-sm font-bold text-[var(--md-sys-color-on-primary)] transition hover:brightness-105"
                  >
                    <Icon name="campaign" size={18} />
                    효과 적용해서 보내기 (전체)
                  </button>
                )
              ) : (
                <button
                  onClick={send}
                  disabled={uids.length === 0 || sending}
                  className="inline-flex items-center justify-center gap-1.5 rounded-full bg-[var(--md-sys-color-primary)] px-4 py-2.5 text-sm font-bold text-[var(--md-sys-color-on-primary)] transition hover:brightness-105 disabled:opacity-40"
                >
                  <Icon name={sentOk ? "check" : "send"} size={16} />
                  {sentOk
                    ? "전달했어요!"
                    : sending
                      ? "보내는 중…"
                      : `효과 적용해서 보내기${uids.length ? ` (${uids.length}명)` : ""}`}
                </button>
              )}
            </section>

            <div className="h-px bg-[var(--md-sys-color-outline-variant)]" />

            {/* 활동 잠금 타이머 */}
            <section className="flex flex-col gap-3">
              <h3 className="flex items-center gap-1.5 text-sm font-bold">
                <Icon
                  name="hourglass_top"
                  size={16}
                  className="text-[var(--md-sys-color-primary)]"
                />
                활동 잠금 타이머
                <span className="font-normal text-[var(--md-sys-color-on-surface-variant)]">
                  · 생각/활동 시간
                </span>
              </h3>
              {lockActive ? (
                <div className="flex items-center justify-between rounded-xl bg-[var(--md-sys-color-tertiary-container)] px-4 py-3">
                  <span className="flex items-center gap-2 text-sm font-semibold text-[var(--md-sys-color-on-tertiary-container)]">
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--md-sys-color-tertiary)] opacity-75" />
                      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[var(--md-sys-color-tertiary)]" />
                    </span>
                    학생 활동 잠금 중
                  </span>
                  {remaining != null && (
                    <span className="font-mono text-lg font-black tabular-nums text-[var(--md-sys-color-on-tertiary-container)]">
                      {fmt(remaining)}
                    </span>
                  )}
                </div>
              ) : (
                <div className="flex items-end gap-2">
                  <label className="flex flex-col gap-1 text-xs text-[var(--md-sys-color-on-surface-variant)]">
                    분
                    <input
                      type="number"
                      min={0}
                      max={99}
                      value={min}
                      onChange={(e) =>
                        setMin(Math.max(0, Math.min(99, Number(e.target.value) || 0)))
                      }
                      className="m3-field w-20 !py-1.5 !text-sm"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-[var(--md-sys-color-on-surface-variant)]">
                    초
                    <input
                      type="number"
                      min={0}
                      max={59}
                      value={sec}
                      onChange={(e) =>
                        setSec(Math.max(0, Math.min(59, Number(e.target.value) || 0)))
                      }
                      className="m3-field w-20 !py-1.5 !text-sm"
                    />
                  </label>
                  <p className="pb-2 text-xs text-[var(--md-sys-color-on-surface-variant)]">
                    동안 활동 멈춤
                  </p>
                </div>
              )}
              <button
                onClick={toggleLock}
                disabled={busyLock || (!lockActive && lockMs <= 0)}
                className={`inline-flex items-center justify-center gap-1.5 rounded-full px-4 py-2.5 text-sm font-bold transition disabled:opacity-40 ${
                  lockActive
                    ? "bg-[var(--md-sys-color-error-container)] text-[var(--md-sys-color-on-error-container)] hover:brightness-105"
                    : "bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)] hover:brightness-105"
                }`}
              >
                <Icon name={lockActive ? "play_arrow" : "pause"} size={18} />
                {lockActive ? "잠금 해제 (활동 재개)" : "활동 잠금 시작"}
              </button>
              <p className="text-xs leading-relaxed text-[var(--md-sys-color-on-surface-variant)]">
                잠금을 켜면 학생 화면에 모래시계가 뜨고 모든 활동이 멈춰요. 설정한
                시간이 끝나거나 잠금을 해제하면 다시 활동할 수 있어요.
              </p>
            </section>
          </div>
        </div>
      </GlassCard>
    </div>
  );
}

export default function ClassAdminPage() {
  return (
    <Suspense
      fallback={
        <main className="flex flex-1 items-center justify-center">
          <div className="animate-pulse text-sm text-black/40">불러오는 중…</div>
        </main>
      }
    >
      <ClassAdminInner />
    </Suspense>
  );
}
