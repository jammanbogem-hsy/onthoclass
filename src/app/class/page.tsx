"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { GlassCard } from "@/components/Glass";
import { TopBar } from "@/components/TopBar";
import { ClassBuilder } from "@/components/ClassBuilder";
import { GroupBuilder } from "@/components/GroupBuilder";
import { Icon } from "@/components/Icon";
import { MessagesFab } from "@/components/MessagesFab";
import { listLessons, type Lesson } from "@/lib/lessons";
import { Leaderboard } from "@/components/Leaderboard";
import { getXpMap } from "@/lib/xp";
import {
  getClass,
  getMyRole,
  listMembers,
  updateClass,
  type ClassRoom,
  type Member,
  type Role,
} from "@/lib/classes";

function ClassDetail() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const id = params.get("id");
  const [room, setRoom] = useState<ClassRoom | null | "missing">(null);
  const [role, setRole] = useState<Role | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [copied, setCopied] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [groupsOpen, setGroupsOpen] = useState(false);
  const [codeOpen, setCodeOpen] = useState(false);
  const [leaderOpen, setLeaderOpen] = useState(false);
  const [leaderXp, setLeaderXp] = useState<Record<string, number>>({});
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [lessons, setLessons] = useState<Lesson[]>([]);

  useEffect(() => {
    if (!loading && !user) router.replace("/");
  }, [user, loading, router]);

  useEffect(() => {
    if (!user || !id) return;
    getClass(id).then((r) => setRoom(r ?? "missing"));
    getMyRole(id, user.uid).then(setRole);
    listMembers(id).then(setMembers).catch(() => {});
    listLessons(id).then(setLessons).catch(() => {});
  }, [user, id]);

  async function saveName() {
    setEditingName(false);
    if (
      !id ||
      room === null ||
      room === "missing" ||
      !nameDraft.trim() ||
      nameDraft.trim() === room.name
    )
      return;
    await updateClass(id, { name: nameDraft.trim() });
    const r = await getClass(id);
    if (r) setRoom(r);
  }

  if (loading || !user || room === null) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <div className="animate-pulse text-sm text-black/40">불러오는 중…</div>
      </main>
    );
  }

  if (room === "missing") {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <GlassCard className="p-10 text-center">
          <p className="font-semibold">학급을 찾을 수 없습니다.</p>
          <button
            className="mt-4 text-sm text-[var(--accent)] underline"
            onClick={() => router.push("/dashboard")}
          >
            대시보드로 돌아가기
          </button>
        </GlassCard>
      </main>
    );
  }

  const isTeacher = role === "teacher";

  return (
    <>
      <TopBar />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10">
        <button
          onClick={() => router.push("/dashboard")}
          className="mb-3 inline-flex items-center gap-1 text-sm text-[var(--md-sys-color-on-surface-variant)] transition hover:text-[var(--md-sys-color-on-surface)]"
        >
          <Icon name="arrow_back" size={18} />
          대시보드
        </button>

        {/* 학급 헤더 — 이름 크게 */}
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            {editingName ? (
              <input
                autoFocus
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onBlur={saveName}
                onKeyDown={(e) => {
                  if (e.key === "Enter")
                    (e.target as HTMLInputElement).blur();
                  if (e.key === "Escape") setEditingName(false);
                }}
                className="min-w-0 rounded-xl border border-[var(--md-sys-color-primary)] bg-[var(--md-sys-color-surface)] px-3 py-1 text-3xl font-bold outline-none sm:text-4xl"
              />
            ) : (
              <h1
                className={`truncate text-3xl font-bold tracking-tight sm:text-4xl ${
                  isTeacher ? "cursor-pointer" : ""
                }`}
                title={isTeacher ? "더블클릭해 학급 이름 수정" : undefined}
                onDoubleClick={() => {
                  if (isTeacher) {
                    setNameDraft(room.name);
                    setEditingName(true);
                  }
                }}
              >
                {room.name || "(이름 없음)"}
              </h1>
            )}
            {role && (
              <span className="shrink-0 rounded-full bg-[var(--accent-soft)] px-3 py-1 text-sm font-semibold text-[var(--accent-strong)]">
                {isTeacher ? "교사" : "학생"}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setCodeOpen(true)}
              title="초대 코드 크게 보기"
              className="inline-flex items-center gap-2 rounded-full border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] py-1.5 pl-3 pr-3 text-sm hover:bg-[var(--md-sys-color-surface-container-high)]"
            >
              <span className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
                초대 코드
              </span>
              <span className="font-bold tracking-wide">{room.code}</span>
              <Icon
                name="fullscreen"
                size={16}
                className="text-[var(--md-sys-color-on-surface-variant)]"
              />
            </button>
            <button
              onClick={() => setMembersOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--md-sys-color-outline)] px-3 py-2 text-sm font-medium text-[var(--md-sys-color-primary)] hover:bg-[color-mix(in_srgb,var(--md-sys-color-primary)_8%,transparent)]"
            >
              <Icon name="group" size={16} />
              멤버 {members.length}
            </button>
            {isTeacher && (
              <button
                onClick={() => setGroupsOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-full border border-[var(--md-sys-color-outline)] px-3 py-2 text-sm font-medium text-[var(--md-sys-color-primary)] hover:bg-[color-mix(in_srgb,var(--md-sys-color-primary)_8%,transparent)]"
              >
                <Icon name="groups" size={16} />
                모둠
              </button>
            )}
            <button
              onClick={() => router.push(`/canvas/?class=${room.id}`)}
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--md-sys-color-outline)] px-3 py-2 text-sm font-medium text-[var(--md-sys-color-primary)] hover:bg-[color-mix(in_srgb,var(--md-sys-color-primary)_8%,transparent)]"
            >
              <Icon name="dashboard" size={16} />
              캔버스
            </button>
            {isTeacher && (
              <button
                onClick={async () => {
                  setLeaderOpen(true);
                  setLeaderXp(await getXpMap(room.id).catch(() => ({})));
                }}
                className="inline-flex items-center gap-1.5 rounded-full border border-[var(--md-sys-color-outline)] px-3 py-2 text-sm font-medium text-[var(--md-sys-color-primary)] hover:bg-[color-mix(in_srgb,var(--md-sys-color-primary)_8%,transparent)]"
              >
                <Icon name="leaderboard" size={16} />
                랭킹
              </button>
            )}
            {!isTeacher && (
              <button
                onClick={() => router.push(`/level/?id=${room.id}`)}
                className="jam-levelup-pill inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-bold text-white transition hover:brightness-105"
              >
                <Icon name="military_tech" size={16} fill />
                LEVEL UP
              </button>
            )}
            {isTeacher && (
              <button
                onClick={() => router.push(`/class-admin/?id=${room.id}`)}
                className="inline-flex items-center gap-1.5 rounded-full border border-[var(--md-sys-color-outline)] px-3 py-2 text-sm font-medium text-[var(--md-sys-color-primary)] hover:bg-[color-mix(in_srgb,var(--md-sys-color-primary)_8%,transparent)]"
              >
                <Icon name="stadia_controller" size={16} />
                학급 관리
              </button>
            )}
            {isTeacher && (
              <button
                onClick={() => router.push(`/class-map/?class=${room.id}`)}
                className="jam-rainbow-pill rounded-full px-4 py-2 text-sm font-semibold text-white transition hover:brightness-105"
              >
                위계 지식 맵
              </button>
            )}
            <style>{`
              @keyframes jam-rainbow-pill {
                0% { background-position: 0% 50% }
                100% { background-position: 300% 50% }
              }
              .jam-rainbow-pill{
                background:linear-gradient(90deg,#ff6f91,#ffb86b,#ffe66d,#23b27a,#4f7cff,#a66bff,#ff6f91);
                background-size:300% 100%;
                animation: jam-rainbow-pill 6s linear infinite;
              }
              .jam-levelup-pill{
                background:linear-gradient(90deg,#7b5cff,#4f7cff,#23b27a,#7b5cff);
                background-size:300% 100%;
                animation: jam-rainbow-pill 5s linear infinite;
                box-shadow:0 4px 14px color-mix(in srgb,#4f7cff 40%,transparent);
              }
            `}</style>
          </div>
        </div>

        <ClassBuilder classId={room.id} isTeacher={isTeacher} />
      </main>

      {/* 멤버 모달 */}
      {membersOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(0,0,0,0.32)] p-4"
          onClick={() => setMembersOpen(false)}
        >
          <div
            className="flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-3xl bg-[var(--md-sys-color-surface-container-high)] shadow-[var(--md-sys-elevation-3)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 border-b border-[var(--md-sys-color-outline-variant)] px-5 py-4">
              <Icon name="group" size={20} />
              <p className="text-lg font-semibold">
                멤버 ({members.length})
              </p>
              <button
                onClick={() => setMembersOpen(false)}
                className="ml-auto flex h-9 w-9 items-center justify-center rounded-full text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-highest)]"
              >
                <Icon name="close" size={20} />
              </button>
            </div>
            <ul className="flex flex-col gap-2 overflow-y-auto p-4">
              {members.length === 0 && (
                <p className="py-6 text-center text-sm text-[var(--md-sys-color-on-surface-variant)]">
                  아직 멤버가 없습니다. 초대 코드를 공유하세요.
                </p>
              )}
              {members.map((m) => (
                <li
                  key={m.uid}
                  className="flex items-center gap-3 rounded-xl bg-[var(--md-sys-color-surface-container)] px-3 py-2.5"
                >
                  {m.photoURL ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={m.photoURL}
                      alt={m.displayName}
                      className="h-9 w-9 rounded-full"
                    />
                  ) : (
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--accent-soft)] text-sm font-semibold text-[var(--accent-strong)]">
                      {m.displayName[0] ?? "?"}
                    </span>
                  )}
                  <span className="flex-1 truncate text-sm font-medium">
                    {m.displayName}
                    {m.uid === user.uid && (
                      <span className="ml-1 text-[var(--md-sys-color-on-surface-variant)]">
                        (나)
                      </span>
                    )}
                  </span>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                      m.role === "teacher"
                        ? "bg-[var(--accent-soft)] text-[var(--accent-strong)]"
                        : "bg-[var(--md-sys-color-surface-container-highest)] text-[var(--md-sys-color-on-surface-variant)]"
                    }`}
                  >
                    {m.role === "teacher" ? "교사" : "학생"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {groupsOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(0,0,0,0.32)] p-4"
          onClick={() => setGroupsOpen(false)}
        >
          <div
            className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl bg-[var(--md-sys-color-surface-container-high)] shadow-[var(--md-sys-elevation-3)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 border-b border-[var(--md-sys-color-outline-variant)] px-5 py-4">
              <Icon name="groups" size={20} />
              <p className="text-lg font-semibold">모둠 편성</p>
              <button
                onClick={() => setGroupsOpen(false)}
                className="ml-auto flex h-9 w-9 items-center justify-center rounded-full text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-highest)]"
              >
                <Icon name="close" size={20} />
              </button>
            </div>
            <div className="overflow-y-auto p-5">
              <GroupBuilder cid={room.id} members={members} />
            </div>
          </div>
        </div>
      )}

      {/* 초대 코드 크게 보기 모달 */}
      {codeOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(0,0,0,0.6)] p-6"
          onClick={() => setCodeOpen(false)}
        >
          <div
            className="relative flex w-full max-w-3xl flex-col items-center rounded-3xl bg-[var(--md-sys-color-surface-container-high)] px-8 py-14 text-center shadow-[var(--md-sys-elevation-3)]"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setCodeOpen(false)}
              className="absolute right-5 top-5 flex h-10 w-10 items-center justify-center rounded-full text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-highest)]"
            >
              <Icon name="close" size={22} />
            </button>
            <p className="text-base text-[var(--md-sys-color-on-surface-variant)]">
              {room.name} · 학급 참여 코드
            </p>
            <p className="my-6 select-all text-6xl font-extrabold leading-none tracking-tight text-[var(--md-sys-color-primary)] sm:text-8xl">
              {room.code}
            </p>
            <p className="mb-8 max-w-md text-sm leading-relaxed text-[var(--md-sys-color-on-surface-variant)]">
              학생은 회원가입 시 이름과 함께 이 코드를 입력하면 학급에
              참여합니다.
            </p>
            <button
              onClick={() => {
                navigator.clipboard?.writeText(room.code);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className="btn-accent inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold"
            >
              <Icon name={copied ? "check" : "content_copy"} size={18} />
              {copied ? "복사됨" : "코드 복사"}
            </button>
          </div>
        </div>
      )}

      {leaderOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4 backdrop-blur-sm"
          onClick={() => setLeaderOpen(false)}
        >
          <div
            className="flex max-h-[80vh] w-full max-w-md flex-col rounded-3xl bg-[var(--md-sys-color-surface-container-high)] p-6 shadow-[var(--md-sys-elevation-3)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-bold">
                <Icon
                  name="leaderboard"
                  size={20}
                  className="text-[var(--md-sys-color-primary)]"
                />
                경험치 랭킹
              </h2>
              <button
                onClick={() => setLeaderOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-highest)]"
              >
                <Icon name="close" size={18} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <Leaderboard
                students={members.filter((m) => m.role === "student")}
                xpMap={leaderXp}
                meUid={user.uid}
              />
            </div>
          </div>
        </div>
      )}

      <MessagesFab
        cid={room.id}
        scope="class"
        viewerRole={isTeacher ? "teacher" : "student"}
        students={members.filter((m) => m.role === "student")}
        lessons={lessons}
      />
    </>
  );
}

export default function ClassPage() {
  return (
    <Suspense
      fallback={
        <main className="flex flex-1 items-center justify-center">
          <div className="animate-pulse text-sm text-black/40">
            불러오는 중…
          </div>
        </main>
      }
    >
      <ClassDetail />
    </Suspense>
  );
}
