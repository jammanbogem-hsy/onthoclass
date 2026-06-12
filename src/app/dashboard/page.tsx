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
  createClassGroup,
  listClassGroups,
  renameClassGroup,
  setClassGroup,
  deleteClassGroup,
  setClassColor,
  setClassGroupColor,
  reorderGroupClasses,
  reorderMyClasses,
  type ClassRoom,
  type ClassGroup,
} from "@/lib/classes";
import { studentOpenCount } from "@/lib/lessons";
import { watchXp, watchQuests, xpLevel, type Quest } from "@/lib/xp";
import { MissionCelebrate } from "@/components/MissionCelebrate";
import { useCelebrateQueue } from "@/components/useCelebrateQueue";
import { useDialog } from "@/components/Dialog";

// 학급·폴더 라벨 색 — 다양한 파스텔 톤(초등 친화). colorIndex 로 선택.
const SUBJECT_GRADIENTS = [
  "bg-[#D7EBD9]", // 민트그린
  "bg-[#FCDCC8]", // 피치
  "bg-[#FDECC2]", // 레몬
  "bg-[#CDE5F5]", // 하늘
  "bg-[#E2D6F3]", // 라벤더
  "bg-[#F8D0DE]", // 핑크
  "bg-[#C9ECE6]", // 청록
  "bg-[#FBD9B8]", // 살구
  "bg-[#D9E6C3]", // 연두
  "bg-[#E4DEC8]", // 베이지
  "bg-[#C8D6F0]", // 인디고연
  "bg-[#F3CFE6]", // 자주연
];

export default function DashboardPage() {
  const { user, loading, profile, profileLoading } = useAuth();
  const router = useRouter();
  const dialog = useDialog();
  const [classes, setClasses] = useState<ClassRoom[] | null>(null);
  const [groups, setGroups] = useState<ClassGroup[]>([]);
  const [openId, setOpenId] = useState<string | null>(null); // Finder식: 열린 폴더
  const [moveFor, setMoveFor] = useState<ClassRoom | null>(null);
  const [colorFor, setColorFor] = useState<ClassRoom | null>(null);
  const [colorGroupFor, setColorGroupFor] = useState<ClassGroup | null>(null);
  const [dragId, setDragId] = useState<string | null>(null); // 드래그 중 학급 id
  const [dragOver, setDragOver] = useState<string | null>(null); // 드롭 대상(폴더/미분류)
  const [overCardId, setOverCardId] = useState<string | null>(null); // 카드 위 재배치 표시
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
    const [cs, gs] = await Promise.all([
      listMyClasses(user.uid),
      isTeacher ? listClassGroups(user.uid) : Promise.resolve([]),
    ]);
    setClasses(cs);
    setGroups(gs);
  }, [user, isTeacher]);

  const toggleOpen = useCallback((gid: string) => {
    setOpenId((prev) => (prev === gid ? null : gid));
  }, []);

  async function createGroup() {
    if (!user) return;
    const name = await dialog.prompt({
      title: "새 폴더 만들기",
      placeholder: "폴더 이름 (예: 2026 1학기)",
      okLabel: "만들기",
    });
    if (!name || !name.trim()) return;
    await createClassGroup(user.uid, name.trim());
    await refresh();
  }

  async function renameGroup(g: ClassGroup) {
    const name = await dialog.prompt({
      title: "폴더 이름 변경",
      defaultValue: g.name,
      placeholder: "폴더 이름",
      okLabel: "저장",
    });
    if (!name || !name.trim() || name.trim() === g.name) return;
    await renameClassGroup(g.id, name.trim());
    await refresh();
  }

  async function removeGroup(g: ClassGroup) {
    const ok = await dialog.confirm({
      title: `'${g.name}' 폴더를 삭제할까요?`,
      body: "폴더만 삭제되며, 학급과 학급 데이터는 그대로 유지됩니다.",
      danger: true,
    });
    if (!ok) return;
    await deleteClassGroup(g.id);
    await refresh();
  }

  async function moveClass(c: ClassRoom, toGroupId: string | null) {
    const from = groups.find((g) => g.classIds.includes(c.id))?.id ?? null;
    setMoveFor(null);
    if (from === toGroupId) return;
    await setClassGroup(c.id, toGroupId, from);
    await refresh();
  }

  // 드래그앤드롭: 학급(id)을 폴더(또는 미분류=null)로 이동
  async function dropClass(classId: string, toGroupId: string | null) {
    setDragId(null);
    const from = groups.find((g) => g.classIds.includes(classId))?.id ?? null;
    if (from === toGroupId) return;
    await setClassGroup(classId, toGroupId, from);
    await refresh();
  }

  async function changeColor(classId: string, colorIndex: number) {
    await setClassColor(classId, colorIndex);
    await refresh();
  }

  async function changeGroupColor(groupId: string, colorIndex: number) {
    await setClassGroupColor(groupId, colorIndex);
    await refresh();
  }

  /** 같은 컨테이너(폴더 또는 미분류) 안에서 카드 순서 재배치 */
  async function reorderWithin(
    container: string | null, // groupId or null(미분류)
    draggedId: string,
    targetId: string
  ) {
    setOverCardId(null);
    setDragId(null);
    if (draggedId === targetId || !classes) return;
    if (container) {
      const g = groups.find((x) => x.id === container);
      if (!g || !g.classIds.includes(draggedId)) return;
      const ids = g.classIds.filter((id) => id !== draggedId);
      const at = ids.indexOf(targetId);
      ids.splice(at < 0 ? ids.length : at, 0, draggedId);
      await reorderGroupClasses(container, ids);
    } else {
      // 미분류: users.classIds 전체를 (재배치된 미분류 + 폴더소속) 으로 덮어씀
      const groupedSet = new Set(groups.flatMap((x) => x.classIds));
      const ungroupedIds = classes
        .map((c) => c.id)
        .filter((id) => !groupedSet.has(id) && id !== draggedId);
      const at = ungroupedIds.indexOf(targetId);
      ungroupedIds.splice(at < 0 ? ungroupedIds.length : at, 0, draggedId);
      if (user)
        await reorderMyClasses(user.uid, [...ungroupedIds, ...groupedSet]);
    }
    await refresh();
  }

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

  const uid = user.uid;
  // container: 이 카드가 속한 컨테이너(groupId 또는 null=미분류) — 같은 컨테이너 내 재배치용
  function renderClassCard(c: ClassRoom, container: string | null) {
    const inGroup = groups.some((g) => g.classIds.includes(c.id));
    return (
      <GlassCard
        key={c.id}
        interactive
        draggable={isTeacher}
        onDragStart={(e: React.DragEvent) => {
          setDragId(c.id);
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", c.id);
        }}
        onDragEnd={() => {
          setDragId(null);
          setOverCardId(null);
        }}
        onDragOver={(e: React.DragEvent) => {
          if (!isTeacher || !dragId || dragId === c.id) return;
          e.preventDefault();
          e.stopPropagation();
          setOverCardId(c.id);
        }}
        onDragLeave={() =>
          setOverCardId((v) => (v === c.id ? null : v))
        }
        onDrop={(e: React.DragEvent) => {
          if (!isTeacher) return;
          e.preventDefault();
          e.stopPropagation();
          const id = e.dataTransfer.getData("text/plain");
          if (!id || id === c.id) return;
          const fromGroup =
            groups.find((g) => g.classIds.includes(id))?.id ?? null;
          if (fromGroup === container) {
            // 같은 컨테이너 → 순서 재배치
            reorderWithin(container, id, c.id);
          } else {
            // 다른 컨테이너 → 이 컨테이너로 이동
            dropClass(id, container);
          }
        }}
        className={`relative overflow-hidden p-0 transition ${
          dragId === c.id ? "opacity-50" : ""
        } ${overCardId === c.id ? "ring-2 ring-[var(--md-sys-color-primary)]" : ""} ${
          isTeacher ? "cursor-grab active:cursor-grabbing" : ""
        }`}
        onClick={() => router.push(`/class/?id=${c.id}`)}
      >
        <div
          className={`h-24 ${
            SUBJECT_GRADIENTS[c.colorIndex % SUBJECT_GRADIENTS.length]
          }`}
        />
        {isTeacher && (
          <div className="absolute right-3 top-3 flex gap-1">
            <button
              type="button"
              title="라벨 색상"
              aria-label="라벨 색상"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                setColorFor(c);
              }}
              className="inline-flex items-center justify-center rounded-full bg-[var(--md-sys-color-surface-container-highest)] p-1.5 text-[var(--md-sys-color-on-surface-variant)] shadow-sm transition hover:bg-[var(--md-sys-color-surface-container-high)]"
            >
              <Icon name="palette" size={18} />
            </button>
            <button
              type="button"
              title="폴더 이동"
              aria-label="폴더 이동"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                setMoveFor(c);
              }}
              className="inline-flex items-center justify-center rounded-full bg-[var(--md-sys-color-surface-container-highest)] p-1.5 text-[var(--md-sys-color-on-surface-variant)] shadow-sm transition hover:bg-[var(--md-sys-color-surface-container-high)]"
            >
              <Icon name={inGroup ? "folder" : "drive_file_move"} size={18} />
            </button>
          </div>
        )}
        <div className="p-5">
          <h3 className="truncate text-lg font-bold">{c.name}</h3>
          <p className="mt-0.5 truncate text-sm text-black/55 dark:text-white/55">
            {c.subject || "과목 미지정"}
          </p>
          {c.description && (
            <p className="mt-1 line-clamp-2 text-sm text-black/45 dark:text-white/45">
              {c.description}
            </p>
          )}
          <div className="mt-4 flex items-center justify-between text-xs text-black/45 dark:text-white/45">
            <span>{c.ownerId === uid ? "내가 개설" : "참여 중"}</span>
            <span>멤버 {c.memberCount}명</span>
          </div>
        </div>
      </GlassCard>
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
              <GlassButton onClick={createGroup}>
                <Icon name="create_new_folder" size={18} />
                폴더 만들기
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
          ) : !isTeacher || groups.length === 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {classes.map((c) => renderClassCard(c, null))}
            </div>
          ) : (
            (() => {
              const byId = new Map(classes.map((c) => [c.id, c]));
              const sortedGroups = [...groups].sort(
                (a, b) => a.order - b.order
              );
              const grouped = new Set<string>();
              for (const g of sortedGroups)
                for (const id of g.classIds)
                  if (byId.has(id)) grouped.add(id);
              const ungrouped = classes.filter((c) => !grouped.has(c.id));
              const openGroup = sortedGroups.find((g) => g.id === openId);
              const openItems = openGroup
                ? openGroup.classIds
                    .map((id) => byId.get(id))
                    .filter((c): c is ClassRoom => !!c)
                : [];
              // 빈 영역 드롭(폴더/미분류로 이동)
              const dropProps = (target: string) => ({
                onDragOver: (e: React.DragEvent) => {
                  if (!isTeacher || !dragId) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                },
                onDragEnter: () => isTeacher && dragId && setDragOver(target),
                onDragLeave: (e: React.DragEvent) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node))
                    setDragOver((v) => (v === target ? null : v));
                },
                onDrop: (e: React.DragEvent) => {
                  if (!isTeacher) return;
                  e.preventDefault();
                  const id = e.dataTransfer.getData("text/plain");
                  setDragOver(null);
                  if (id)
                    dropClass(id, target === "__ungrouped__" ? null : target);
                },
              });
              return (
                <div className="flex flex-col gap-6">
                  {/* Finder식: 폴더(닫힘) + 미분류 학급을 한 그리드에 */}
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {sortedGroups.map((g) => {
                      const cnt = g.classIds.filter((id) => byId.has(id)).length;
                      const isOver = dragOver === g.id;
                      const isOpen = openId === g.id;
                      return (
                        <GlassCard
                          key={g.id}
                          interactive
                          {...dropProps(g.id)}
                          onClick={() => toggleOpen(g.id)}
                          className={`relative overflow-hidden p-0 transition ${
                            isOver || isOpen
                              ? "ring-2 ring-[var(--md-sys-color-primary)]"
                              : ""
                          }`}
                        >
                          <div
                            className={`flex h-24 items-center justify-center ${
                              SUBJECT_GRADIENTS[
                                g.colorIndex % SUBJECT_GRADIENTS.length
                              ]
                            }`}
                          >
                            <Icon
                              name={isOpen ? "folder_open" : "folder"}
                              size={48}
                              fill
                              className="text-[var(--md-sys-color-on-surface)] opacity-70"
                            />
                          </div>
                          <div className="absolute right-3 top-3 flex gap-1">
                            <button
                              type="button"
                              title="폴더 색상"
                              aria-label="폴더 색상"
                              onClick={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                setColorGroupFor(g);
                              }}
                              className="inline-flex items-center justify-center rounded-full bg-[var(--md-sys-color-surface-container-highest)] p-1.5 text-[var(--md-sys-color-on-surface-variant)] shadow-sm transition hover:bg-[var(--md-sys-color-surface-container-high)]"
                            >
                              <Icon name="palette" size={16} />
                            </button>
                            <button
                              type="button"
                              title="학급 비교"
                              aria-label="학급 비교"
                              onClick={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                router.push("/compare");
                              }}
                              className="inline-flex items-center justify-center rounded-full bg-[var(--md-sys-color-surface-container-highest)] p-1.5 text-[var(--md-sys-color-on-surface-variant)] shadow-sm transition hover:bg-[var(--md-sys-color-surface-container-high)]"
                            >
                              <Icon name="compare" size={16} />
                            </button>
                            <button
                              type="button"
                              title="이름 변경"
                              aria-label="이름 변경"
                              onClick={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                renameGroup(g);
                              }}
                              className="inline-flex items-center justify-center rounded-full bg-[var(--md-sys-color-surface-container-highest)] p-1.5 text-[var(--md-sys-color-on-surface-variant)] shadow-sm transition hover:bg-[var(--md-sys-color-surface-container-high)]"
                            >
                              <Icon name="edit" size={16} />
                            </button>
                            <button
                              type="button"
                              title="폴더 삭제"
                              aria-label="폴더 삭제"
                              onClick={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                removeGroup(g);
                              }}
                              className="inline-flex items-center justify-center rounded-full bg-[var(--md-sys-color-surface-container-highest)] p-1.5 text-[var(--md-sys-color-error)] shadow-sm transition hover:bg-[var(--md-sys-color-surface-container-high)]"
                            >
                              <Icon name="delete" size={16} />
                            </button>
                          </div>
                          <div className="p-5">
                            <h3 className="truncate text-lg font-bold">
                              {g.name}
                            </h3>
                            <p className="mt-0.5 text-sm text-black/55 dark:text-white/55">
                              학급 {cnt}개 ·{" "}
                              {isOpen ? "열림" : "클릭해서 열기"}
                            </p>
                          </div>
                        </GlassCard>
                      );
                    })}
                    {ungrouped.map((c) => renderClassCard(c, null))}
                  </div>

                  {/* 드래그 중에만: 미분류로 빼는 드롭바 */}
                  {dragId && (
                    <div
                      {...dropProps("__ungrouped__")}
                      className={`rounded-2xl border-2 border-dashed p-4 text-center text-sm transition ${
                        dragOver === "__ungrouped__"
                          ? "border-[var(--md-sys-color-primary)] bg-[color-mix(in_srgb,var(--md-sys-color-primary)_8%,transparent)] text-[var(--md-sys-color-primary)]"
                          : "border-[var(--md-sys-color-outline-variant)] text-black/45 dark:text-white/45"
                      }`}
                    >
                      여기에 놓으면 폴더에서 빼서 ‘미분류’로 보냅니다
                    </div>
                  )}

                  {/* 열린 폴더 내용 (Finder식) */}
                  {openGroup && (
                    <div
                      {...dropProps(openGroup.id)}
                      className={`flex flex-col gap-3 rounded-3xl border-2 p-5 transition ${
                        dragOver === openGroup.id
                          ? "border-[var(--md-sys-color-primary)] bg-[color-mix(in_srgb,var(--md-sys-color-primary)_8%,transparent)]"
                          : "border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)]"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Icon
                          name="folder_open"
                          size={22}
                          fill
                          className="text-[var(--md-sys-color-primary)]"
                        />
                        <span className="text-lg font-extrabold">
                          {openGroup.name}
                        </span>
                        <span className="text-xs text-black/45">
                          {openItems.length}개
                        </span>
                        {openItems.length >= 2 && (
                          <button
                            type="button"
                            onClick={() =>
                              router.push(`/compare?folder=${openGroup.id}`)
                            }
                            className="ml-auto inline-flex items-center gap-1 rounded-full bg-[var(--md-sys-color-primary-container)] px-3 py-1.5 text-xs font-semibold text-[var(--md-sys-color-on-primary-container)] transition hover:brightness-95"
                            title="이 폴더의 학급들을 같은 주제로 비교"
                          >
                            <Icon name="compare" size={16} />
                            비교
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setOpenId(null)}
                          className={`flex h-9 w-9 items-center justify-center rounded-full text-[var(--md-sys-color-on-surface-variant)] hover:bg-black/5 ${
                            openItems.length >= 2 ? "" : "ml-auto"
                          }`}
                          title="닫기"
                          aria-label="닫기"
                        >
                          <Icon name="close" size={18} />
                        </button>
                      </div>
                      {openItems.length > 0 ? (
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                          {openItems.map((c) =>
                            renderClassCard(c, openGroup.id)
                          )}
                        </div>
                      ) : (
                        <div className="flex min-h-[120px] flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[var(--md-sys-color-outline-variant)] p-6 text-center">
                          <Icon
                            name="drag_pan"
                            size={28}
                            className="text-[var(--md-sys-color-on-surface-variant)]"
                          />
                          <p className="text-sm text-black/45 dark:text-white/45">
                            학급 카드를 여기로 끌어다 놓으세요.
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })()
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
      {moveFor && (
        <ModalShell title="폴더로 이동" onClose={() => setMoveFor(null)}>
          <div className="flex flex-col gap-2">
            <p className="mb-1 truncate text-sm text-black/55 dark:text-white/55">
              {moveFor.name}
            </p>
            {(() => {
              const cur =
                groups.find((g) => g.classIds.includes(moveFor.id))?.id ??
                null;
              return (
                <>
                  {groups.length === 0 && (
                    <p className="text-sm text-black/45 dark:text-white/45">
                      아직 폴더가 없어요. 먼저 폴더를 만들어 주세요.
                    </p>
                  )}
                  {[...groups]
                    .sort((a, b) => a.order - b.order)
                    .map((g) => (
                      <button
                        key={g.id}
                        onClick={() => moveClass(moveFor, g.id)}
                        className="flex items-center gap-2 rounded-xl px-4 py-3 text-left text-sm font-medium transition hover:bg-[var(--md-sys-color-surface-container-high)]"
                      >
                        <Icon
                          name="folder"
                          size={18}
                          className="text-[var(--md-sys-color-primary)]"
                        />
                        <span className="truncate">{g.name}</span>
                        {cur === g.id && (
                          <Icon
                            name="check"
                            size={18}
                            className="ml-auto text-[var(--md-sys-color-primary)]"
                          />
                        )}
                      </button>
                    ))}
                  <button
                    onClick={() => moveClass(moveFor, null)}
                    className="mt-1 flex items-center gap-2 rounded-xl border border-[var(--md-sys-color-outline-variant)] px-4 py-3 text-left text-sm font-medium transition hover:bg-[var(--md-sys-color-surface-container-high)]"
                  >
                    <Icon
                      name="folder_off"
                      size={18}
                      className="text-[var(--md-sys-color-on-surface-variant)]"
                    />
                    <span>폴더에서 빼기 (미분류)</span>
                    {cur === null && (
                      <Icon
                        name="check"
                        size={18}
                        className="ml-auto text-[var(--md-sys-color-primary)]"
                      />
                    )}
                  </button>
                </>
              );
            })()}
          </div>
        </ModalShell>
      )}

      {/* 폴더 색상 선택 */}
      {colorGroupFor && (
        <ModalShell
          title="폴더 색상"
          onClose={() => setColorGroupFor(null)}
        >
          <p className="mb-3 truncate text-sm text-black/55 dark:text-white/55">
            “{colorGroupFor.name}” 폴더 색을 골라요.
          </p>
          <div className="flex flex-wrap gap-3">
            {SUBJECT_GRADIENTS.map((cls, idx) => {
              const sel =
                colorGroupFor.colorIndex % SUBJECT_GRADIENTS.length === idx;
              return (
                <button
                  key={idx}
                  onClick={async () => {
                    const g = colorGroupFor;
                    setColorGroupFor(null);
                    await changeGroupColor(g.id, idx);
                  }}
                  className={`flex h-14 w-14 items-center justify-center rounded-2xl ${cls} ring-2 transition hover:scale-105 ${
                    sel
                      ? "ring-[var(--md-sys-color-primary)]"
                      : "ring-transparent"
                  }`}
                  aria-label={`색상 ${idx + 1}`}
                >
                  {sel && (
                    <Icon
                      name="check"
                      size={20}
                      className="text-[var(--md-sys-color-on-surface)]"
                    />
                  )}
                </button>
              );
            })}
          </div>
        </ModalShell>
      )}

      {/* 라벨 색상 선택 */}
      {colorFor && (
        <ModalShell title="라벨 색상" onClose={() => setColorFor(null)}>
          <p className="mb-3 truncate text-sm text-black/55 dark:text-white/55">
            “{colorFor.name}” 카드 색을 골라요.
          </p>
          <div className="flex flex-wrap gap-3">
            {SUBJECT_GRADIENTS.map((cls, idx) => {
              const sel = colorFor.colorIndex % SUBJECT_GRADIENTS.length === idx;
              return (
                <button
                  key={idx}
                  onClick={async () => {
                    const c = colorFor;
                    setColorFor(null);
                    await changeColor(c.id, idx);
                  }}
                  className={`flex h-14 w-14 items-center justify-center rounded-2xl ${cls} ring-2 transition hover:scale-105 ${
                    sel
                      ? "ring-[var(--md-sys-color-primary)]"
                      : "ring-transparent"
                  }`}
                  aria-label={`색상 ${idx + 1}`}
                >
                  {sel && (
                    <Icon
                      name="check"
                      size={20}
                      className="text-[var(--md-sys-color-on-surface)]"
                    />
                  )}
                </button>
              );
            })}
          </div>
        </ModalShell>
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
    // 학급별 '첫 스냅샷' 여부 — 첫 콜백에선 이미 완료된 미션을 축하하지 않고 키만 시드한다
    // (새 기기/캐시 초기화 시 과거 미션이 잘못 '완료!'로 뜨는 문제 방지).
    const primed: Record<string, boolean> = {};
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
          const wasPrimed = primed[c.id];
          const newly = mine.filter((q) => {
            const key = `mdone:${c.id}:${q.id}`;
            if (q.completions[uid]) {
              const seen = !!localStorage.getItem(key);
              localStorage.setItem(key, "1");
              // 첫 스냅샷(미priming)에선 무조건 false → 시드만 하고 축하 안 함
              return wasPrimed && !seen;
            }
            localStorage.removeItem(key);
            return false;
          });
          primed[c.id] = true;
          if (wasPrimed && newly.length > 0) {
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
                  {c.description && (
                    <p className="mt-1 line-clamp-2 text-sm text-black/45 dark:text-white/45">
                      {c.description}
                    </p>
                  )}
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
