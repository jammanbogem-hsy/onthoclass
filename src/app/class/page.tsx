"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { GlassCard } from "@/components/Glass";
import { QuizRunRecentCard } from "@/components/quizrun/QuizRunRecentCard";
import { TopBar } from "@/components/TopBar";
import { ClassBuilder } from "@/components/ClassBuilder";
import { GroupBuilder } from "@/components/GroupBuilder";
import { Icon } from "@/components/Icon";
import { MessagesFab } from "@/components/MessagesFab";
import { PraiseModal } from "@/components/PraiseModal";
import { PraiseManageModal } from "@/components/PraiseManageModal";
import { XpRequestInboxModal } from "@/components/XpRequestInboxModal";
import { PresentationRequestModal } from "@/components/PresentationRequestModal";
import { PresentationManageModal } from "@/components/PresentationManageModal";
import {
  watchPresentationRequests,
  approvePresentationRequest,
  rejectPresentationRequest,
  type PresentationRequest,
} from "@/lib/presentations";
import { CanvasListModal } from "@/components/CanvasListModal";
import { ClassThermometer } from "@/components/ClassThermometer";
import { MissionCelebrate } from "@/components/MissionCelebrate";
import {
  approvePraise,
  rejectPraise,
  watchPraises,
  watchThermometer,
  listCrossPeers,
  type Praise,
  type CrossPeer,
} from "@/lib/praise";
import { listLessons, type Lesson } from "@/lib/lessons";
import { Leaderboard } from "@/components/Leaderboard";
import { useNameMask } from "@/components/NameMask";
import { getXpMap, watchXpRequests, type XpRequest } from "@/lib/xp";
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
  const { mask } = useNameMask();
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
  const [praiseOpen, setPraiseOpen] = useState(false);
  const [praiseManageOpen, setPraiseManageOpen] = useState(false);
  const [xpReqOpen, setXpReqOpen] = useState(false);
  const [praiseSent, setPraiseSent] = useState(false);
  const [presentOpen, setPresentOpen] = useState(false);
  const [praises, setPraises] = useState<Praise[]>([]);
  const [xpReqs, setXpReqs] = useState<XpRequest[]>([]);
  const [presReqs, setPresReqs] = useState<PresentationRequest[]>([]);
  const [presManageOpen, setPresManageOpen] = useState(false);
  const [crossPeers, setCrossPeers] = useState<CrossPeer[]>([]);
  const [canvasOpen, setCanvasOpen] = useState(false);
  const [degree, setDegree] = useState(0);

  useEffect(() => {
    if (!loading && !user) router.replace("/");
  }, [user, loading, router]);

  useEffect(() => {
    if (!user || !id) return;
    getClass(id).then((r) => setRoom(r ?? "missing"));
    getMyRole(id, user.uid).then(setRole);
    listMembers(id).then(setMembers).catch(() => {});
    listLessons(id).then(setLessons).catch(() => {});
    listCrossPeers(id).then(setCrossPeers).catch(() => {});
    return watchThermometer(id, setDegree);
  }, [user, id]);

  // 칭찬 목록은 교사만 구독(규칙상 학생은 전체 list 불가)
  useEffect(() => {
    if (!id || role !== "teacher") return;
    return watchPraises(id, setPraises);
  }, [id, role]);

  // 경험치 요청도 교사만 구독 — 받은함 배지로 새 요청을 알린다.
  useEffect(() => {
    if (!id || role !== "teacher") return;
    return watchXpRequests(id, setXpReqs);
  }, [id, role]);

  // 발표 승인 요청도 교사만 구독 — 학급 화면에서 바로 배지로 알린다.
  useEffect(() => {
    if (!id || role !== "teacher") return;
    return watchPresentationRequests(id, setPresReqs);
  }, [id, role]);

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
            {/* 참여 코드는 교사만 노출 — 학생이 코드를 보고 외부에 재공유하는 경로 차단 */}
            {isTeacher && (
              <button
                onClick={() => setCodeOpen(true)}
                title="초대 코드 크게 보기"
                className="inline-flex items-center gap-2 rounded-full border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] py-1.5 pl-3 pr-3 text-sm hover:bg-[var(--md-sys-color-surface-container-high)]"
              >
                <span className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                  초대 코드
                </span>
                <span className="font-bold tracking-wide">{room.code}</span>
                <Icon
                  name="fullscreen"
                  size={16}
                  className="text-[var(--md-sys-color-on-surface-variant)]"
                />
              </button>
            )}
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
              onClick={() => setCanvasOpen(true)}
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
            <button
              onClick={() =>
                isTeacher ? setPraiseManageOpen(true) : setPraiseOpen(true)
              }
              className="relative inline-flex items-center gap-1.5 rounded-full border border-[var(--md-sys-color-outline)] px-3 py-2 text-sm font-medium text-[var(--md-sys-color-primary)] hover:bg-[color-mix(in_srgb,var(--md-sys-color-primary)_8%,transparent)]"
            >
              <Icon name="favorite" size={16} />
              {isTeacher ? "칭찬 관리" : "친구 칭찬"}
              {isTeacher &&
                praises.filter((p) => p.status === "pending").length > 0 && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--md-sys-color-error)] px-1.5 text-xs font-bold text-white">
                    {praises.filter((p) => p.status === "pending").length}
                  </span>
                )}
            </button>
            {isTeacher && (
              <button
                onClick={() => router.push(`/classapp/?cid=${room.id}`)}
                className="inline-flex items-center gap-1.5 rounded-full bg-[var(--md-sys-color-primary)] px-4 py-2 text-sm font-bold text-[var(--md-sys-color-on-primary)] transition hover:brightness-105"
                title="교안 슬라이드 + 학생 추첨·집중 잠금·링크 푸시로 수업 진행"
              >
                <Icon name="present_to_all" size={16} />
                수업 진행
              </button>
            )}
            {isTeacher && (
              <button
                onClick={() => setXpReqOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-full border border-[var(--md-sys-color-outline)] px-3 py-2 text-sm font-medium text-[var(--md-sys-color-primary)] hover:bg-[color-mix(in_srgb,var(--md-sys-color-primary)_8%,transparent)]"
                title="활동에서 온 경험치 요청 승인"
              >
                <Icon name="bolt" size={16} />
                경험치 요청
                {xpReqs.filter((r) => r.status === "pending").length > 0 && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--md-sys-color-error)] px-1.5 text-xs font-bold text-white">
                    {xpReqs.filter((r) => r.status === "pending").length}
                  </span>
                )}
              </button>
            )}
            {isTeacher && (
              <button
                onClick={() => setPresManageOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-full border border-[var(--md-sys-color-outline)] px-3 py-2 text-sm font-medium text-[var(--md-sys-color-primary)] hover:bg-[color-mix(in_srgb,var(--md-sys-color-primary)_8%,transparent)]"
                title="학생이 보낸 발표 승인 요청"
              >
                <Icon name="co_present" size={16} />
                발표 승인
                {presReqs.filter((r) => r.status === "pending").length > 0 && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--md-sys-color-error)] px-1.5 text-xs font-bold text-white">
                    {presReqs.filter((r) => r.status === "pending").length}
                  </span>
                )}
              </button>
            )}
            {!isTeacher && (
              <button
                onClick={() => setPresentOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-full border border-[var(--md-sys-color-outline)] px-3 py-2 text-sm font-medium text-[var(--md-sys-color-primary)] hover:bg-[color-mix(in_srgb,var(--md-sys-color-primary)_8%,transparent)]"
              >
                <Icon name="co_present" size={16} />
                발표 승인 요청
              </button>
            )}
            {!isTeacher && (
              <button
                onClick={() => router.push(`/level/?id=${room.id}`)}
                className="jam-levelup-pill inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-bold text-white transition hover:brightness-105"
              >
                <Icon name="military_tech" size={16} fill />
                마이페이지
              </button>
            )}
            {isTeacher && (
              <button
                onClick={() => router.push(`/class-dashboard/?id=${room.id}`)}
                className="inline-flex items-center gap-1.5 rounded-full border border-[var(--md-sys-color-outline)] px-3 py-2 text-sm font-medium text-[var(--md-sys-color-primary)] hover:bg-[color-mix(in_srgb,var(--md-sys-color-primary)_8%,transparent)]"
              >
                <Icon name="insights" size={16} />
                대시보드
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
                /* 학생이 고른 그라데이션이 있으면 그걸, 없으면 테마 색을 쓴다 */
                background: var(--jam-pill-gradient, linear-gradient(90deg,
                  var(--md-sys-color-p-40),var(--md-sys-color-t-50),
                  var(--md-sys-color-p-50),var(--md-sys-color-p-40)));
                background-size:300% 100%;
                animation: jam-rainbow-pill 5s linear infinite;
                box-shadow:0 4px 14px color-mix(in srgb,var(--md-sys-color-primary) 35%,transparent);
              }
            `}</style>
          </div>
        </div>

        <ClassThermometer degree={degree} />

        {/* 최근 퀴즈런 결과 — 학생 전용. 학생은 '게임 이력'(교사 전용 모달)에 들어갈 수
            없어 여기서만 자기 러닝볼과 등수를 볼 수 있다. 교사는 학급 관리 → 게임 이력에서
            같은 내용을 더 자세히 보므로 메인 화면에는 띄우지 않는다. */}
        {!isTeacher && <QuizRunRecentCard cid={room.id} uid={user.uid} />}

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
                    {mask(m.displayName)}
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

      {praiseOpen && user && (
        <PraiseModal
          cid={room.id}
          className={room.name}
          fromUser={user}
          friends={members.filter(
            (m) => m.role === "student" && m.uid !== user.uid
          )}
          peers={crossPeers}
          onClose={() => setPraiseOpen(false)}
          onSent={() => {
            setPraiseOpen(false);
            setPraiseSent(true);
          }}
        />
      )}

      {presentOpen && user && (
        <PresentationRequestModal
          cid={room.id}
          user={user}
          onClose={() => setPresentOpen(false)}
        />
      )}

      {praiseManageOpen && user && (
        <PraiseManageModal
          praises={praises}
          cid={room.id}
          teacherUid={user.uid}
          members={members}
          onApprove={(p, assignTo) =>
            approvePraise(room.id, p, user.uid, assignTo)
          }
          onReject={(id) => rejectPraise(room.id, id)}
          onClose={() => setPraiseManageOpen(false)}
        />
      )}

      {xpReqOpen && user && (
        <XpRequestInboxModal
          cid={room.id}
          teacherUid={user.uid}
          onClose={() => setXpReqOpen(false)}
        />
      )}

      {presManageOpen && user && (
        <PresentationManageModal
          requests={presReqs}
          members={members}
          onApprove={(r) => approvePresentationRequest(room.id, r, user.uid)}
          onReject={(id) => rejectPresentationRequest(room.id, id)}
          onClose={() => setPresManageOpen(false)}
        />
      )}

      {praiseSent && (
        <MissionCelebrate
          kicker="칭찬을 보냈어요"
          title="선생님 승인을 기다리고 있어요"
          subtitle="승인되면 친구에게 전달되고 학급 온도가 0.1도 올라가요"
          lottieSrc="/Loading%2040%20_%20Paperplane.json"
          onDone={() => setPraiseSent(false)}
        />
      )}

      {canvasOpen && (
        <CanvasListModal
          cid={room.id}
          lessons={lessons}
          onClose={() => setCanvasOpen(false)}
        />
      )}
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
