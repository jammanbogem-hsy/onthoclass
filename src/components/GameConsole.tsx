"use client";

import { useEffect, useId, useMemo, useState } from "react";
import Lottie from "lottie-react";
import { Icon } from "@/components/Icon";
import { Avatar } from "@/components/Avatar";
import { MiniBoard } from "@/components/MiniBoard";
import { GameResults } from "@/components/GameResults";
import { type Member } from "@/lib/classes";
import {
  advanceToPlay,
  advanceToSelect,
  countBingoLines,
  endGame,
  finalizeCandidates,
  liveColorVar,
  liveStatusOf,
  startSubmitPhase,
  teacherCallWord,
  teacherForceNextCaller,
  uncallWord,
  type Game,
  type GameCandidate,
  type GameSubmission,
  type LiveStatus,
} from "@/lib/games";

/**
 * 학급 게임 진행 콘솔(교사). 배경 클릭으로 닫히지 않음(영구). X 또는 게임 종료로만 닫힘.
 * X 시 macOS Dock 으로 들어가는 듯한 휙 애니메이션 후 부모가 언마운트.
 */
export function GameConsole({
  cid,
  game,
  members,
  students,
  subs,
  onClose,
}: {
  cid: string;
  game: Game;
  members: Member[];
  /** 학급의 학생 전체(미참여 포함 그리드용) */
  students: Member[];
  /** 부모에서 단일 구독해 내려주는 학생 제출 */
  subs: GameSubmission[];
  onClose: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [busyEnd, setBusyEnd] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [closing, setClosing] = useState(false);
  const titleId = useId();

  // 모든 학생 제출 완료 시 그리드 배경 축하 효과
  const [rainbow, setRainbow] = useState<object | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/rainbow_twist.json")
      .then((r) => r.json())
      .then((d) => alive && setRainbow(d))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  function requestClose() {
    if (closing) return;
    setClosing(true);
    setTimeout(() => onClose(), 230);
  }

  // Esc → 콘솔 접기(게임은 계속 진행)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") requestClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 작성중/응답안함 판정용 틱 — 2초 (실시간 느낌)
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 2000);
    return () => clearInterval(t);
  }, []);

  // 멤버 빠른 조회
  const memberMap = useMemo(() => {
    const m = new Map<string, Member>();
    members.forEach((x) => m.set(x.uid, x));
    return m;
  }, [members]);
  const subBy = useMemo(() => {
    const m = new Map<string, GameSubmission>();
    subs.forEach((s) => m.set(s.uid, s));
    return m;
  }, [subs]);

  // 미참여 학생도 그리드에 표시 — 교사가 가장 알고 싶은 정보
  type Row = {
    uid: string;
    name: string;
    m: Member | undefined;
    sub: GameSubmission | undefined;
  };
  const rows: Row[] = useMemo(() => {
    const seen = new Set<string>();
    const out: Row[] = [];
    // 1) 학급 학생 전체 (있으면 sub 매칭)
    for (const st of students) {
      out.push({
        uid: st.uid,
        name: st.displayName,
        m: st,
        sub: subBy.get(st.uid),
      });
      seen.add(st.uid);
    }
    // 2) 학생 목록에 없는데 참여한 경우(예: 교사 본인이 테스트) — 뒤에 붙임
    for (const s of subs) {
      if (seen.has(s.uid)) continue;
      out.push({
        uid: s.uid,
        name: s.name,
        m: memberMap.get(s.uid),
        sub: s,
      });
    }
    return out;
  }, [students, subs, subBy, memberMap]);

  const joined = subs.length;
  const submitted = subs.filter(
    (s) => liveStatusOf(s, game, now) === "submitted"
  ).length;
  const writing = subs.filter(
    (s) => liveStatusOf(s, game, now) === "writing"
  ).length;
  // "응답안함" = 미참여 학생 + 참여 후 idle 학생 (교사가 가장 알고 싶은 정보)
  const notJoined = students.filter((st) => !subBy.has(st.uid)).length;
  const idleJoined = subs.filter(
    (s) => liveStatusOf(s, game, now) === "idle"
  ).length;
  const noResponse = notJoined + idleJoined;

  const isLobby = game.status === "draft";
  const isSubmit = game.status === "submit";
  const isBuild = game.status === "build";
  // "전원 완료" 강조 = 지금 활동 중(writing)인 학생이 없고 한 명 이상 끝냄.
  // 참여만 누르고 자리 비운(idle) 학생이 분모에 껴서 영영 안 켜지던 문제 해소.
  const allSubmitted = submitted > 0 && writing === 0;
  // 학급 학생 전원이 게임에 접속(참여)했는가 (로비 단계 축하용)
  const allJoined =
    students.length > 0 && students.every((st) => subBy.has(st.uid));
  // 빙고판 단계 — boardReady 인 학생 수 집계
  const boardReadyCount = subs.filter(
    (s) =>
      s.boardReady ||
      s.status === "ready" ||
      s.status === "playing" ||
      s.status === "done"
  ).length;
  const allBoardsReady = boardReadyCount > 0 && writing === 0;
  // 배경 무지개 = "현재 단계"가 모두 완료됐을 때만 (이전 단계 상태가 넘어와 남지 않도록).
  // 로비=전원 참여 / 제출·선정=전원 완료(writing 0) / 빙고판=전원 준비 / 종료=결과 축하.
  // 플레이 중에는 표시하지 않음(진행 단계라 '완료' 개념 부적합).
  const phaseComplete =
    game.status === "draft"
      ? allJoined
      : game.status === "submit" || game.status === "select"
        ? allSubmitted
        : game.status === "build"
          ? allBoardsReady
          : game.status === "done";

  const [busyStart, setBusyStart] = useState(false);
  const [busyAdvance, setBusyAdvance] = useState(false);
  const [busyPlay, setBusyPlay] = useState(false);
  async function doStartSubmit() {
    if (joined === 0) return;
    setBusyStart(true);
    try {
      await startSubmitPhase(cid, game.id);
    } finally {
      setBusyStart(false);
    }
  }
  async function doAdvanceToSelect() {
    if (submitted === 0) return;
    setBusyAdvance(true);
    try {
      await advanceToSelect(cid, game.id, subs);
    } finally {
      setBusyAdvance(false);
    }
  }
  async function doAdvanceToPlay() {
    if (boardReadyCount === 0) return;
    setBusyPlay(true);
    try {
      await advanceToPlay(cid, game.id, subs);
    } finally {
      setBusyPlay(false);
    }
  }

  async function doEnd() {
    setBusyEnd(true);
    try {
      await endGame(cid, game.id);
      requestClose();
    } finally {
      setBusyEnd(false);
    }
  }

  return (
    // 배경: 클릭으로 닫히지 않음(영구) — pointer-events 도 카드 외부엔 없도록
    <div className="fixed inset-0 z-50 flex items-stretch bg-[var(--md-sys-color-surface)]">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`relative flex h-screen w-screen flex-col overflow-hidden bg-[var(--md-sys-color-surface-container-low)] ${
          closing ? "jam-genie-out" : "jam-genie-in"
        }`}
      >
        {/* 현재 단계가 전원 완료됐을 때만 배경 무지개 축하 (이전 단계 상태가 남지 않도록) */}
        {phaseComplete && rainbow && (
          <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden opacity-25">
            <Lottie
              animationData={rainbow}
              loop
              autoplay
              className="h-full w-full"
              rendererSettings={{ preserveAspectRatio: "xMidYMid slice" }}
            />
          </div>
        )}
        <div className="relative z-10 flex min-h-0 flex-1 flex-col">
        {/* 헤더 — 페이지 상단 (centered) */}
        <div className="border-b border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)]">
          <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-8 py-5">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-primary)]">
                <Icon name="grid_view" size={24} />
              </span>
              <div className="min-w-0">
                <p className="text-[11px] font-extrabold tracking-[0.25em] text-[var(--md-sys-color-on-surface-variant)]">
                  학급 게임
                </p>
                <h2 id={titleId} className="text-2xl font-black">
                  개념 빙고
                </h2>
              </div>
              <span className="ml-3 rounded-full bg-[var(--md-sys-color-tertiary-container)] px-3 py-1 text-sm font-bold text-[var(--md-sys-color-on-tertiary-container)]">
                {game.link.name}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--md-sys-color-surface-container-highest)] px-3 py-1 text-sm font-bold text-[var(--md-sys-color-on-surface-variant)]">
                <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--md-sys-color-tertiary)]" />
                {stageLabel(game.status)}
              </span>
            </div>
            <button
              onClick={requestClose}
              className="flex h-11 w-11 items-center justify-center rounded-full text-[var(--md-sys-color-on-surface-variant)] transition hover:bg-black/5"
              title="콘솔 접기 (게임은 계속 진행됨)"
            >
              <Icon name="close" size={24} />
            </button>
          </div>
        </div>

        {/* 요약 카운터 */}
        <div className="mx-auto grid w-full max-w-6xl grid-cols-4 gap-3 px-8 pt-6">
          <Counter
            label={`참여 / ${students.length}`}
            value={joined}
          />
          <Counter
            label="제출 완료"
            value={submitted}
            color="var(--md-sys-color-primary)"
          />
          <Counter
            label="작성중"
            value={writing}
            color="var(--md-sys-color-tertiary)"
            pulse={writing > 0}
          />
          <Counter
            label="응답안함"
            value={noResponse}
            color="var(--md-sys-color-on-surface-variant)"
          />
        </div>

        {/* 로비 단계 — "단어 받기 시작" CTA. 적어도 1명 참여해야 활성 */}
        {isLobby && (
          <div className="mx-auto mt-5 flex w-full max-w-6xl items-center gap-4 rounded-2xl bg-[var(--md-sys-color-primary-container)] p-5 text-[var(--md-sys-color-on-primary-container)]">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--md-sys-color-primary)] text-white">
              <Icon name="play_arrow" size={28} />
            </span>
            <div className="flex min-w-0 flex-1 flex-col">
              <p className="text-base font-bold">
                참여한 학생들이 모이면 시작하세요
              </p>
              <p className="text-xs">
                &ldquo;단어 받기 시작&rdquo; 을 눌러야 학생들 화면에 단어 입력
                칸이 열려요.
              </p>
            </div>
            <button
              onClick={doStartSubmit}
              disabled={busyStart || joined === 0}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[var(--md-sys-color-primary)] px-5 py-3 text-base font-bold text-[var(--md-sys-color-on-primary)] shadow-sm transition hover:scale-105 disabled:cursor-not-allowed disabled:opacity-40"
              title={joined === 0 ? "참여한 학생이 없어요" : "단어 받기 시작"}
            >
              <Icon name="play_arrow" size={20} />
              {busyStart ? "여는 중…" : "단어 받기 시작"}
            </button>
          </div>
        )}

        {/* 단어 제출 단계 — 선정 단계로 진행 CTA. 모두 제출하면 강조, 일부만이어도 진행 가능 */}
        {isSubmit && (
          <div
            className={`mx-auto mt-5 flex w-full max-w-6xl items-center gap-4 rounded-2xl p-5 ${
              allSubmitted
                ? "bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)] ring-2 ring-[var(--md-sys-color-primary)]"
                : "bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface)]"
            }`}
          >
            <span
              className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-white ${
                allSubmitted
                  ? "bg-[var(--md-sys-color-primary)]"
                  : "bg-[var(--md-sys-color-on-surface-variant)]"
              }`}
            >
              <Icon name={allSubmitted ? "task_alt" : "edit_note"} size={28} />
            </span>
            <div className="flex min-w-0 flex-1 flex-col">
              <p className="text-base font-bold">
                {allSubmitted
                  ? `모두 제출했어요! (${submitted}/${joined}명)`
                  : `학생들이 단어를 적고 있어요 (${submitted}/${joined}명 제출)`}
              </p>
              <p className="text-xs">
                {allSubmitted
                  ? "선정 단계로 넘어가서 후보 단어를 함께 골라볼까요?"
                  : "모두 제출하면 자동으로 안내해 드려요. 일부만 제출돼도 지금 진행할 수 있어요."}
              </p>
            </div>
            <button
              onClick={doAdvanceToSelect}
              disabled={busyAdvance || submitted === 0}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-5 py-3 text-base font-bold shadow-sm transition hover:scale-105 disabled:cursor-not-allowed disabled:opacity-40 ${
                allSubmitted
                  ? "bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)]"
                  : "border-2 border-[var(--md-sys-color-primary)] text-[var(--md-sys-color-primary)]"
              }`}
              title={
                submitted === 0
                  ? "제출한 학생이 없어요"
                  : "선정 단계로 진행"
              }
            >
              <Icon name="arrow_forward" size={20} />
              {busyAdvance ? "넘어가는 중…" : "선정 단계로 진행"}
            </button>
          </div>
        )}

        {/* 빙고판 단계 — "게임 시작" CTA. 보드 완성 학생 수 표시 */}
        {isBuild && (
          <div
            className={`mx-auto mt-5 flex w-full max-w-6xl items-center gap-4 rounded-2xl p-5 ${
              allBoardsReady
                ? "bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)] ring-2 ring-[var(--md-sys-color-primary)]"
                : "bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface)]"
            }`}
          >
            <span
              className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-white ${
                allBoardsReady
                  ? "bg-[var(--md-sys-color-primary)]"
                  : "bg-[var(--md-sys-color-on-surface-variant)]"
              }`}
            >
              <Icon
                name={allBoardsReady ? "rocket_launch" : "grid_3x3"}
                size={28}
              />
            </span>
            <div className="flex min-w-0 flex-1 flex-col">
              <p className="text-base font-bold">
                {allBoardsReady
                  ? `모두 빙고판을 만들었어요! (${boardReadyCount}/${joined}명)`
                  : `학생들이 빙고판을 꾸미고 있어요 (${boardReadyCount}/${joined}명 완성)`}
              </p>
              <p className="text-xs">
                {allBoardsReady
                  ? "이제 게임을 시작해서 단어를 호명해 볼까요?"
                  : "모두 만들면 자동으로 안내해 드려요. 일부만 끝나도 지금 시작할 수 있어요."}
              </p>
            </div>
            <button
              onClick={doAdvanceToPlay}
              disabled={busyPlay || boardReadyCount === 0}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-5 py-3 text-base font-bold shadow-sm transition hover:scale-105 disabled:cursor-not-allowed disabled:opacity-40 ${
                allBoardsReady
                  ? "bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)]"
                  : "border-2 border-[var(--md-sys-color-primary)] text-[var(--md-sys-color-primary)]"
              }`}
            >
              <Icon name="play_arrow" size={20} />
              {busyPlay
                ? "시작 중…"
                : allBoardsReady
                  ? "게임 시작"
                  : `게임 시작 (미완성 ${Math.max(0, joined - boardReadyCount)}명은 관전)`}
            </button>
          </div>
        )}

        {/* 선정 단계 — 후보 단어 확정 UI (학생 그리드 대신) */}
        {game.status === "select" && (
          <CandidateReview cid={cid} game={game} subs={subs} />
        )}

        {/* 플레이 단계 — 단어 호출 + 라이브 리더보드 */}
        {game.status === "play" && (
          <PlayConsole cid={cid} game={game} subs={subs} members={members} />
        )}

        {/* 종료 — 최종 결과 발표(올림픽 랭킹) */}
        {game.status === "done" && (
          <div className="min-h-0 flex-1 overflow-y-auto py-8">
            <div className="mx-auto w-full max-w-6xl px-8">
              <GameResults
                game={game}
                subs={subs}
                nameOf={(u) =>
                  memberMap.get(u)?.displayName ??
                  subBy.get(u)?.name ??
                  "이름없음"
                }
              />
            </div>
          </div>
        )}

        {/* 학생 카드 그리드 — 기존 학생 카드 스타일과 일치. 미참여 학생도 포함 */}
        {game.status !== "select" &&
          game.status !== "play" &&
          game.status !== "done" && (
        <div className="min-h-0 flex-1 overflow-y-auto py-6">
          <div className="mx-auto w-full max-w-6xl px-8">
          {rows.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-[var(--md-sys-color-on-surface-variant)]">
              <Icon name="hourglass_top" size={36} className="animate-pulse" />
              <p className="text-sm font-semibold">
                학급에 등록된 학생이 없습니다.
              </p>
            </div>
          ) : (
            <div
              aria-live="polite"
              aria-label={`학생 ${rows.length}명 상태`}
              className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
            >
              {rows.map((r) => {
                const st = liveStatusOf(r.sub, game, now);
                const name = r.m?.displayName || r.name || "이름없음";
                // 현재 단계의 할 일을 끝낸 학생(로비=참여, 그 외=제출/준비 완료) — 직관적으로 강조
                const done = st === "submitted" || st === "joined";
                const cardStyle = {
                  borderColor: liveColor(st),
                  backgroundColor: `color-mix(in srgb, ${liveColor(st)} ${
                    done ? 12 : 6
                  }%, var(--md-sys-color-surface))`,
                  ...(done ? { "--glow": liveColor(st) } : {}),
                } as React.CSSProperties;
                return (
                  <div
                    key={r.uid}
                    tabIndex={0}
                    role="group"
                    aria-label={`${name} · ${statusLabel(st)}`}
                    className={`relative flex flex-col items-center gap-2 rounded-3xl border-2 p-4 outline-none transition focus-visible:ring-2 focus-visible:ring-[var(--md-sys-color-primary)] ${
                      done ? "bingo-card-glow" : ""
                    }`}
                    style={cardStyle}
                    title={statusLabel(st)}
                  >
                    {done && (
                      <span
                        className="absolute right-2 top-2 z-[1] flex h-6 w-6 items-center justify-center rounded-full text-white shadow"
                        style={{ backgroundColor: liveColor(st) }}
                      >
                        <Icon name="check" size={14} />
                      </span>
                    )}
                    <Avatar m={r.m} name={r.name} size={64} />
                    <span className="line-clamp-1 w-full text-center text-sm font-bold">
                      {name}
                    </span>
                    <span
                      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-extrabold"
                      style={{
                        backgroundColor: `color-mix(in srgb, ${liveColor(st)} 18%, white)`,
                        color: liveColor(st),
                      }}
                    >
                      {(st === "writing" || st === "joined") && (
                        <span
                          className="h-1.5 w-1.5 animate-pulse rounded-full"
                          style={{ backgroundColor: liveColor(st) }}
                        />
                      )}
                      {statusLabel(st)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
          </div>
        </div>
        )}

        {/* 푸터 */}
        <div className="border-t border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)]">
          <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-2 px-8 py-5">
            <p className="text-base font-semibold text-[var(--md-sys-color-on-surface-variant)]">
              {game.status === "draft"
                ? "1단계 · 참여 모집 → 단어 제출 → 선정 → 빙고판 → 플레이"
                : game.status === "submit"
                  ? "2단계 · 단어 제출 → 선정 → 빙고판 → 플레이"
                  : game.status === "select"
                    ? "3단계 · 후보 단어 선정 → 빙고판 → 플레이"
                    : game.status === "build"
                      ? "4단계 · 빙고판 만들기 → 플레이"
                      : game.status === "play"
                        ? "5단계 · 플레이 — 단어를 호출해보세요"
                        : game.status === "done"
                          ? "게임 종료 — 결과를 발표하고 '게임 종료'로 닫아요"
                          : "다음 단계는 곧 추가됩니다."}
            </p>
            {confirmEnd ? (
              <div className="flex items-center gap-2">
                <span className="text-base font-bold text-[var(--md-sys-color-error)]">
                  정말 종료할까요?
                </span>
                <button
                  onClick={() => setConfirmEnd(false)}
                  className="rounded-full px-5 py-2.5 text-base font-bold text-[var(--md-sys-color-on-surface-variant)] hover:bg-black/5"
                >
                  취소
                </button>
                <button
                  onClick={doEnd}
                  disabled={busyEnd}
                  className="inline-flex items-center gap-2 rounded-full bg-[var(--md-sys-color-error)] px-5 py-2.5 text-base font-extrabold text-white disabled:opacity-50"
                >
                  <Icon name="stop_circle" size={18} />
                  종료
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmEnd(true)}
                className="inline-flex items-center gap-2 rounded-full border-2 border-[var(--md-sys-color-error)] px-5 py-2.5 text-base font-bold text-[var(--md-sys-color-error)] hover:bg-[color-mix(in_srgb,var(--md-sys-color-error)_8%,transparent)]"
              >
                <Icon name="stop_circle" size={18} />
                게임 종료
              </button>
            )}
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}

// 기존 학급 관리의 Avatar 와 동일 패턴(사진 우선, 없으면 머리글자) — 재사용성을 위해 동일 컴포넌트
function Counter({
  label,
  value,
  color,
  pulse,
}: {
  label: string;
  value: number;
  color?: string;
  pulse?: boolean;
}) {
  return (
    <div className="relative flex flex-col items-center gap-1.5 rounded-2xl bg-[var(--md-sys-color-surface-container)] py-6">
      {pulse && (
        <span
          className="absolute right-3 top-3 h-3 w-3 animate-pulse rounded-full"
          style={{ backgroundColor: color }}
        />
      )}
      <p
        className="text-6xl font-black tabular-nums leading-none"
        style={color ? { color } : undefined}
      >
        {value}
      </p>
      <p className="text-base font-bold text-[var(--md-sys-color-on-surface-variant)]">
        {label}
      </p>
    </div>
  );
}

// 후보 카드 폰트 — 단어 길이 + 가중치 가중 (aspect-square 안에서 안 잘리게)
function candidateFontClass(
  word: string,
  weight: "big" | "mid" | "base"
): string {
  const len = [...word].length;
  // weight 별로 한 단계씩 차등
  if (weight === "big") {
    if (len <= 1) return "text-5xl sm:text-6xl";
    if (len <= 2) return "text-4xl sm:text-5xl";
    if (len <= 3) return "text-3xl sm:text-4xl";
    if (len <= 4) return "text-2xl sm:text-3xl";
    if (len <= 5) return "text-xl sm:text-2xl";
    return "text-lg sm:text-xl";
  }
  if (weight === "mid") {
    if (len <= 1) return "text-4xl sm:text-5xl";
    if (len <= 2) return "text-3xl sm:text-4xl";
    if (len <= 3) return "text-2xl sm:text-3xl";
    if (len <= 4) return "text-xl sm:text-2xl";
    if (len <= 5) return "text-lg sm:text-xl";
    return "text-base sm:text-lg";
  }
  // base
  if (len <= 1) return "text-3xl sm:text-4xl";
  if (len <= 2) return "text-2xl sm:text-3xl";
  if (len <= 3) return "text-xl sm:text-2xl";
  if (len <= 4) return "text-lg sm:text-xl";
  if (len <= 5) return "text-base sm:text-lg";
  return "text-sm sm:text-base";
}

// ---------------- 후보 단어 확정 (교사 — 선정 단계) ----------------
function CandidateReview({
  cid,
  game,
  subs,
}: {
  cid: string;
  game: Game;
  subs: GameSubmission[];
}) {
  // 학생 picked 집계 → 단어별 선택자 목록
  const tally = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const s of subs) {
      for (const w of s.picked) {
        if (!m.has(w)) m.set(w, []);
        m.get(w)!.push(s.uid);
      }
    }
    // 후보 목록을 의미·제출자 보존하면서 selectedBy 채우기, 선정 수 desc 정렬
    return [...game.candidates]
      .map((c) => ({ ...c, selectedBy: m.get(c.word) ?? [] }))
      .sort(
        (a, b) =>
          b.selectedBy.length - a.selectedBy.length ||
          b.submittedBy.length - a.submittedBy.length
      );
  }, [game.candidates, subs]);

  // 교사가 확정할 후보 수(보드 칸수 N²까지)
  const target = Math.min(
    game.config.boardSize * game.config.boardSize,
    tally.length
  );
  // 학생 1인이 골라야 하는 수 = 보드 차원 N (학생 SelectPanel 과 동일). 완료 집계용.
  const studentTarget = Math.min(game.config.boardSize, game.candidates.length);
  const maxCount = Math.max(1, ...tally.map((c) => c.selectedBy.length));

  // 기본 선택 = 없음. 교사가 직접 선택 (수업 흐름에 맞게).
  // "상위 N개 자동" 버튼으로 언제든 인기 단어 N개를 일괄 선택 가능.
  const [included, setIncluded] = useState<Set<string>>(() => new Set());
  // 우클릭 확대 패널에 표시할 단어 (교사가 학생들에게 설명할 때 사용).
  // 학생 투표가 실시간으로 변하므로 word 만 저장하고 tally 에서 매번 조회.
  const [focusedWord, setFocusedWord] = useState<string | null>(null);
  const focused = useMemo(
    () => (focusedWord ? tally.find((c) => c.word === focusedWord) ?? null : null),
    [focusedWord, tally]
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // 학생들의 선정이 바뀌어도 교사의 수동 선택을 덮어쓰지 않음.
  // 새로 상위 N 으로 맞추려면 "상위 N개 자동" 버튼 사용.

  const selectedCount = included.size;
  const studentsTotal = subs.length;
  const studentsDone = subs.filter(
    (s) => s.picked.length >= studentTarget
  ).length;

  function toggle(word: string) {
    setIncluded((prev) => {
      const n = new Set(prev);
      if (n.has(word)) n.delete(word);
      else n.add(word);
      return n;
    });
  }
  function pickTopN() {
    setIncluded(new Set(tally.slice(0, target).map((c) => c.word)));
  }
  async function finalize() {
    // 정확히 N²개 강제하지 않음 — 1개~N² 범위 허용(부족분은 학생 보드에서 FREE 처리).
    if (selectedCount < 1 || selectedCount > target || busy) return;
    setBusy(true);
    setErr("");
    try {
      const finalList: GameCandidate[] = tally.filter((c) =>
        included.has(c.word)
      );
      await finalizeCandidates(cid, game.id, finalList);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "후보 확정에 실패했습니다.");
      setBusy(false);
    }
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto py-6">
      <div className="mx-auto w-full max-w-6xl px-8">
        {/* 안내 + 진행률 + 액션 */}
        <div className="mb-5 flex flex-wrap items-center gap-4 rounded-3xl bg-[var(--md-sys-color-surface-container-high)] p-6">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--md-sys-color-tertiary)] text-white">
            <Icon name="palette" size={32} />
          </span>
          <div className="flex min-w-0 flex-1 flex-col">
            <p className="text-2xl font-extrabold leading-tight">
              빙고 후보 단어 {target}개를 확정하세요
            </p>
            <p className="text-base text-[var(--md-sys-color-on-surface-variant)]">
              학생 선정 완료 <b>{studentsDone}/{studentsTotal}</b>명 · 진할수록 많이 뽑힌 단어
              <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-[var(--md-sys-color-tertiary-container)] px-2 py-0.5 text-xs font-bold text-[var(--md-sys-color-on-tertiary-container)]">
                <Icon name="touch_app" size={12} />
                좌클릭 선택 · 우클릭 확대 설명
              </span>
            </p>
          </div>
          <button
            onClick={pickTopN}
            className="inline-flex items-center gap-2 rounded-full border-2 border-[var(--md-sys-color-outline)] px-5 py-3 text-base font-bold text-[var(--md-sys-color-on-surface)] hover:bg-black/5"
            title="가장 많이 뽑힌 상위 N개로 다시 선택"
          >
            <Icon name="auto_awesome" size={20} />
            상위 {target}개 자동
          </button>
          <span
            className={`rounded-full px-5 py-3 text-lg font-extrabold ${
              selectedCount >= 1 && selectedCount <= target
                ? "bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)]"
                : "bg-[var(--md-sys-color-error-container)] text-[var(--md-sys-color-on-error-container)]"
            }`}
            title={
              selectedCount < target
                ? `남는 ${target - selectedCount}칸은 학생 보드에서 FREE(자동 완성)로 채워져요`
                : ""
            }
          >
            선택 {selectedCount}/{target}
            {selectedCount >= 1 && selectedCount < target ? " (남은 칸 FREE)" : ""}
          </span>
          <button
            onClick={finalize}
            disabled={selectedCount < 1 || selectedCount > target || busy}
            className="inline-flex items-center gap-2 rounded-full bg-[var(--md-sys-color-primary)] px-7 py-4 text-xl font-extrabold text-[var(--md-sys-color-on-primary)] shadow-lg transition hover:scale-105 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Icon name="arrow_forward" size={26} />
            {busy ? "확정 중…" : "후보 확정 → 빙고판"}
          </button>
        </div>

        {err && (
          <p className="mb-2 rounded-xl bg-[var(--md-sys-color-error-container)] px-3 py-2 text-xs text-[var(--md-sys-color-on-error-container)]">
            {err}
          </p>
        )}

        {/* 좌: 후보 단어 그리드 / 우: 확대 개념 카드(설명용)
            우클릭 또는 길게 누르기로 우측 패널에 표시 */}
        <div
          className={`grid gap-4 ${
            focused ? "lg:grid-cols-[1fr_360px]" : "grid-cols-1"
          }`}
        >
          <div
            className={`grid gap-2.5 grid-cols-3 ${
              focused
                ? "sm:grid-cols-4 md:grid-cols-4 lg:grid-cols-5"
                : "sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6"
            }`}
          >
            {tally.map((c) => {
              const on = included.has(c.word);
              const weight = c.selectedBy.length / maxCount; // 0~1
              const submittedW = c.submittedBy.length;
              const big = weight >= 0.66;
              const mid = weight >= 0.33;
              const isFocused = focusedWord === c.word;
              return (
                <button
                  key={c.word}
                  onClick={() => toggle(c.word)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setFocusedWord((prev) => (prev === c.word ? null : c.word));
                  }}
                  aria-pressed={on}
                  className={`relative flex aspect-square flex-col items-center justify-center gap-1 overflow-hidden rounded-2xl border-2 p-2 text-center transition ${
                    isFocused
                      ? "ring-4 ring-[var(--md-sys-color-tertiary)] ring-offset-2"
                      : ""
                  } ${
                    on
                      ? "border-[var(--md-sys-color-primary)]"
                      : "border-[var(--md-sys-color-outline-variant)]"
                  }`}
                  style={{
                    backgroundColor: on
                      ? `color-mix(in srgb, var(--md-sys-color-primary-container) ${20 + Math.round(weight * 70)}%, var(--md-sys-color-surface))`
                      : `color-mix(in srgb, var(--md-sys-color-tertiary-container) ${Math.round(weight * 55)}%, var(--md-sys-color-surface))`,
                  }}
                  title={`클릭: 선택 · 우클릭: 확대해서 설명\n${c.selectedBy.length}명 선택 · 제출 ${submittedW}명${c.meaning ? "\n" + c.meaning : ""}`}
                >
                  {on && (
                    <span className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--md-sys-color-primary)] text-white">
                      <Icon name="check" size={14} />
                    </span>
                  )}
                  <span
                    className={`font-omu break-keep leading-tight text-[var(--md-sys-color-on-surface)] ${candidateFontClass(c.word, big ? "big" : mid ? "mid" : "base")}`}
                  >
                    {c.word}
                  </span>
                  {c.meaning && (
                    <span className="line-clamp-2 text-xs leading-snug text-[var(--md-sys-color-on-surface-variant)]">
                      {c.meaning}
                    </span>
                  )}
                  <span
                    className="rounded-full px-2.5 py-1 text-xs font-bold"
                    style={{
                      backgroundColor: `color-mix(in srgb, var(--md-sys-color-primary) ${10 + Math.round(weight * 35)}%, white)`,
                      color: "var(--md-sys-color-on-surface)",
                    }}
                  >
                    {c.selectedBy.length}명 선택
                  </span>
                </button>
              );
            })}
          </div>

          {/* 우측 확대 패널 — 우클릭한 단어를 큰 카드로 (수업 중 학생들에게 설명) */}
          {focused && (
            <FocusedConceptCard
              candidate={focused}
              onClose={() => setFocusedWord(null)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------- 플레이 단계 콘솔 (교사 — 모니터링 + 비상 개입) ----------------
function PlayConsole({
  cid,
  game,
  subs,
  members,
}: {
  cid: string;
  game: Game;
  subs: GameSubmission[];
  members: Member[];
}) {
  const memberByUid = useMemo(() => {
    const m = new Map<string, Member>();
    members.forEach((x) => m.set(x.uid, x));
    return m;
  }, [members]);
  const subByUid = useMemo(() => {
    const m = new Map<string, GameSubmission>();
    subs.forEach((s) => m.set(s.uid, s));
    return m;
  }, [subs]);

  const called = game.turn.calledWords;
  const calledSet = useMemo(() => new Set(called), [called]);
  const lastCalled = called[called.length - 1] ?? null;

  // 표시용 빙고 수 — 마크 ∩ 호출된 단어로 재계산(uncall 즉시 반영, 학생 화면과 일치).
  const validBingoOf = (s: GameSubmission) =>
    countBingoLines(
      s.board,
      s.marked.filter((w) => calledSet.has(w)),
      game.config.boardSize
    );

  const remaining = useMemo(
    () =>
      [...game.candidates]
        .filter((c) => !calledSet.has(c.word))
        .sort(
          (a, b) =>
            b.selectedBy.length - a.selectedBy.length ||
            b.submittedBy.length - a.submittedBy.length
        ),
    [game.candidates, calledSet]
  );

  // 리더보드 — ranks 우선(올림픽 표시), 진행중은 빙고 수 순.
  // 빙고는 완성(status==='done')했지만 상한(maxPlayers) 초과로 순위에 못 든 학생은
  // '진행중'이 아니라 별도 그룹으로 분리해 교사 혼선을 없앤다.
  const sortedPlayers = useMemo(() => {
    const ranked = [...game.ranks].sort((a, b) => a.rank - b.rank);
    const rankedUids = new Set(game.ranks.map((r) => r.uid));
    const unranked = subs.filter((s) => !rankedUids.has(s.uid));
    const others = unranked
      .filter((s) => s.status !== "done")
      .sort(
        (a, b) => validBingoOf(b) - validBingoOf(a) || b.marked.length - a.marked.length
      );
    const finishedUnranked = unranked
      .filter((s) => s.status === "done")
      .sort((a, b) => (a.finishedAtTurn ?? 0) - (b.finishedAtTurn ?? 0));
    return { ranked, others, finishedUnranked };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.ranks, subs, calledSet]);

  const callerUid = game.turn.currentUid;
  const callerName = callerUid
    ? memberByUid.get(callerUid)?.displayName ??
      subByUid.get(callerUid)?.name ??
      "이름없음"
    : null;
  const historyUids = game.turn.history;
  const activeStudents = subs.filter(
    (s) => s.boardReady && s.status !== "done"
  );
  const roundCount = activeStudents.length || 1;
  const turnInRound = historyUids.length;

  // 자동 종료·차례 이관은 GameAutoPilot(class-admin 상시 마운트)이 담당 — 콘솔을 닫아도
  // 동작하도록 콘솔 밖으로 분리됨. (여기엔 자동 로직 없음)

  // 우클릭 확대 카드
  const [focusedWord, setFocusedWord] = useState<string | null>(null);
  const focused = useMemo(
    () =>
      focusedWord
        ? game.candidates.find((c) => c.word === focusedWord) ?? null
        : null,
    [focusedWord, game.candidates]
  );

  const [busyWord, setBusyWord] = useState<string | null>(null);
  const [busyForce, setBusyForce] = useState(false);
  // 학생 진행 섹션: 빙고판(미니보드) 보기 ↔ 간단(줄/칸 수) 보기
  const [showBoards, setShowBoards] = useState(false);
  const [err, setErr] = useState("");
  async function doTeacherCall(word: string) {
    if (busyWord) return;
    setBusyWord(word);
    setErr("");
    try {
      await teacherCallWord(cid, game.id, word, subs);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "호출 실패");
    } finally {
      setBusyWord(null);
    }
  }
  async function doUncall(word: string) {
    setErr("");
    try {
      await uncallWord(cid, game.id, word);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "취소 실패");
    }
  }
  async function doForceNext(uid: string | null) {
    if (busyForce) return;
    setBusyForce(true);
    setErr("");
    try {
      await teacherForceNextCaller(cid, game.id, uid, subs);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "차례 강제 변경 실패");
    } finally {
      setBusyForce(false);
    }
  }

  const targetLines = game.config.bingoTarget;
  const orderMode = game.config.order;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto py-6">
      <div className="mx-auto w-full max-w-6xl px-8">
        {/* 상단 — 차례 + 방금 호출 + 진행률 */}
        <div className="mb-5 flex flex-wrap items-center gap-4 rounded-3xl bg-[var(--md-sys-color-primary-container)] p-6 text-[var(--md-sys-color-on-primary-container)]">
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[var(--md-sys-color-primary)] text-white">
            <Icon name={callerUid ? "person_play" : "campaign"} size={32} />
          </span>
          <div className="flex min-w-0 flex-1 flex-col">
            <p className="text-xs font-bold tracking-[0.2em] opacity-80">
              {callerUid ? "지금 차례" : "차례 학생이 없어요"}
            </p>
            {callerUid ? (
              <p className="text-3xl font-black leading-tight sm:text-4xl">
                {callerName}{" "}
                <span className="text-base font-bold opacity-70">
                  · {orderMode === "pick" ? "다음 학생 직접 선택" : "다음 차례 자동"}
                </span>
              </p>
            ) : (
              <button
                onClick={() => doForceNext(null)}
                disabled={busyForce || activeStudents.length === 0}
                className="mt-1 inline-flex w-fit items-center gap-1 rounded-full bg-[var(--md-sys-color-primary)] px-4 py-2 text-sm font-extrabold text-[var(--md-sys-color-on-primary)] hover:scale-105 disabled:opacity-40"
              >
                <Icon name="shuffle" size={16} />
                랜덤으로 차례 시작
              </button>
            )}
            {lastCalled && (
              <p className="mt-1 font-omu break-keep text-2xl font-black leading-tight">
                방금 호출: {lastCalled}
              </p>
            )}
          </div>
          <div className="flex flex-col items-end gap-1 text-right">
            <p className="text-[10px] font-bold tracking-widest opacity-80">
              라운드 / 차례
            </p>
            <p className="text-2xl font-black tabular-nums">
              R{game.turn.round} · {turnInRound}/{roundCount}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1 text-right">
            <p className="text-[10px] font-bold tracking-widest opacity-80">
              완료
            </p>
            <p className="text-2xl font-black tabular-nums">
              {game.ranks.length}명
            </p>
          </div>
        </div>

        {err && (
          <p
            role="alert"
            className="mb-3 rounded-xl bg-[var(--md-sys-color-error-container)] px-3 py-2 text-sm text-[var(--md-sys-color-on-error-container)]"
          >
            {err}
          </p>
        )}

        {/* 본문 — 좌(보조 호출 + 학생 진행) / 우(리더보드 + 차례 우회) */}
        <div
          className={`grid gap-4 ${
            focused
              ? "lg:grid-cols-[1fr_280px_280px]"
              : "lg:grid-cols-[1fr_300px]"
          }`}
        >
          {/* 1) 좌측 — 학생 진행 + 비상 호출(교사 강제) */}
          <section className="flex flex-col gap-4">
            {/* 학생 진행 — 카드 그리드 */}
            <div
              aria-label="학생 진행 상태"
              className="rounded-3xl bg-white p-4 shadow-sm"
            >
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="text-lg font-extrabold text-[var(--md-sys-color-on-surface)]">
                  학생 진행 ({activeStudents.length}명 진행중)
                </h3>
                <button
                  onClick={() => setShowBoards((v) => !v)}
                  className={`inline-flex items-center gap-1.5 rounded-full border-2 px-3 py-1.5 text-xs font-bold transition ${
                    showBoards
                      ? "border-transparent bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)]"
                      : "border-[var(--md-sys-color-outline)] text-[var(--md-sys-color-on-surface-variant)] hover:bg-black/5"
                  }`}
                  title="학생들의 실제 빙고판을 펼쳐 봅니다"
                >
                  <Icon name={showBoards ? "grid_view" : "visibility"} size={16} />
                  {showBoards ? "간단히 보기" : "상황 보기 (빙고판)"}
                </button>
              </div>
              {showBoards ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {subs
                    .filter((s) => s.boardReady)
                    .map((s) => {
                      const isCaller = s.uid === callerUid;
                      const isDone = s.status === "done";
                      const m = memberByUid.get(s.uid);
                      const name = m?.displayName ?? s.name ?? "이름없음";
                      return (
                        <div
                          key={s.uid}
                          className={`flex flex-col gap-1.5 rounded-2xl border-2 p-2.5 ${
                            isCaller
                              ? "border-[var(--md-sys-color-primary)] ring-2 ring-[var(--md-sys-color-primary)]"
                              : isDone
                                ? "border-[var(--md-sys-color-tertiary)]"
                                : "border-[var(--md-sys-color-outline-variant)]"
                          }`}
                        >
                          <div className="flex items-center gap-1.5">
                            <Avatar m={m} name={s.name} size={24} />
                            <span className="line-clamp-1 flex-1 text-xs font-bold text-[var(--md-sys-color-on-surface)]">
                              {name}
                            </span>
                            <span
                              className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-extrabold ${
                                isDone
                                  ? "bg-[var(--md-sys-color-tertiary-container)] text-[var(--md-sys-color-on-tertiary-container)]"
                                  : "bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface)]"
                              }`}
                            >
                              {isDone ? (
                                <Icon name="check" size={12} />
                              ) : (
                                `${validBingoOf(s)}줄`
                              )}
                            </span>
                          </div>
                          <MiniBoard
                            board={s.board}
                            marked={s.marked}
                            N={game.config.boardSize}
                            called={calledSet}
                          />
                        </div>
                      );
                    })}
                </div>
              ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                {subs.map((s) => {
                  const isCaller = s.uid === callerUid;
                  const calledThisRound = historyUids.includes(s.uid);
                  const isDone = s.status === "done";
                  const m = memberByUid.get(s.uid);
                  const name = m?.displayName ?? s.name ?? "이름없음";
                  return (
                    <button
                      key={s.uid}
                      onClick={() => doForceNext(s.uid)}
                      disabled={busyForce || isDone}
                      className={`relative flex flex-col items-center gap-1 overflow-hidden rounded-2xl border-2 p-2 text-center transition disabled:opacity-50 ${
                        isCaller
                          ? "border-[var(--md-sys-color-primary)] bg-[var(--md-sys-color-primary-container)] ring-2 ring-[var(--md-sys-color-primary)]"
                          : isDone
                            ? "border-[var(--md-sys-color-tertiary)] bg-[var(--md-sys-color-tertiary-container)]"
                            : calledThisRound
                              ? "border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-high)] opacity-60"
                              : "border-[var(--md-sys-color-outline-variant)] bg-white hover:border-[var(--md-sys-color-primary)]"
                      }`}
                      title={`${name} — 클릭해서 차례를 이 학생으로 변경`}
                    >
                      <Avatar m={m} name={s.name} size={36} />
                      <span className="line-clamp-1 text-sm font-bold text-[var(--md-sys-color-on-surface)]">
                        {name}
                      </span>
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-[var(--md-sys-color-on-surface-variant)]">
                        {isDone ? (
                          <>
                            <Icon name="check" size={11} />
                            완료
                          </>
                        ) : isCaller ? (
                          <>
                            <Icon name="play_arrow" size={11} />
                            차례중
                          </>
                        ) : calledThisRound ? (
                          "이번 라운드 끝"
                        ) : (
                          `${validBingoOf(s)}줄·${s.marked.length}칸`
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
              )}
            </div>

            {/* 비상 강제 호출 — 학생이 자리 비웠을 때만 사용 */}
            <details className="rounded-3xl bg-white p-4 shadow-sm">
              <summary className="cursor-pointer text-sm font-bold text-[var(--md-sys-color-on-surface)]">
                교사 강제 호출 ({remaining.length}개 남음) — 학생이 자리 비웠을 때만
              </summary>
              <p className="mt-2 text-xs text-[var(--md-sys-color-on-surface-variant)]">
                좌클릭 = 호출(현재 차례 학생의 턴을 소비). 우클릭 = 확대 설명.
              </p>
              {remaining.length === 0 ? (
                <p className="mt-2 rounded-2xl bg-[var(--md-sys-color-surface-container-high)] p-4 text-center text-xs text-[var(--md-sys-color-on-surface-variant)]">
                  모든 단어를 호출했어요.
                </p>
              ) : (
                <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
                  {remaining.map((c) => {
                    const isBusy = busyWord === c.word;
                    const isFocused = focusedWord === c.word;
                    return (
                      <button
                        key={c.word}
                        onClick={() => doTeacherCall(c.word)}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setFocusedWord((p) =>
                            p === c.word ? null : c.word
                          );
                        }}
                        disabled={!!busyWord && !isBusy}
                        className={`relative flex aspect-square flex-col items-center justify-center gap-1 overflow-hidden rounded-xl border-2 p-1.5 text-center transition hover:scale-[1.03] disabled:opacity-40 ${
                          isFocused
                            ? "ring-2 ring-[var(--md-sys-color-tertiary)] ring-offset-2"
                            : ""
                        } border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)]`}
                      >
                        <span
                          className={`font-omu break-keep leading-tight text-[var(--md-sys-color-on-surface)] ${candidateFontClass(c.word, "base")}`}
                        >
                          {c.word}
                        </span>
                        {isBusy && (
                          <span className="absolute inset-0 flex items-center justify-center bg-white/60">
                            <Icon
                              name="progress_activity"
                              size={18}
                              className="animate-spin"
                            />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* 호출 이력 — 가장 최근부터, × 로 마지막 취소 */}
              {called.length > 0 && (
                <div className="mt-4 border-t border-[var(--md-sys-color-outline-variant)] pt-3">
                  <p className="mb-1.5 text-xs font-extrabold text-[var(--md-sys-color-on-surface)]">
                    호출 이력 ({called.length})
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {[...called].reverse().map((w, idx) => {
                      const isLast = idx === 0;
                      return (
                        <span
                          key={w}
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${
                            isLast
                              ? "bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)]"
                              : "bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface)]"
                          }`}
                        >
                          <span className="font-omu break-keep">{w}</span>
                          {isLast && (
                            <button
                              onClick={() => doUncall(w)}
                              className="-mr-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full hover:bg-white/20"
                              aria-label={`${w} 호출 취소`}
                            >
                              <Icon name="close" size={10} />
                            </button>
                          )}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
            </details>
          </section>

          {/* 2) 우측 — 리더보드 */}
          <aside
            aria-label="리더보드"
            className="rounded-3xl bg-white p-4 shadow-sm lg:sticky lg:top-4 lg:max-h-[80vh] lg:overflow-y-auto"
          >
            <h3 className="mb-2 flex items-center gap-2 text-lg font-extrabold text-[var(--md-sys-color-on-surface)]">
              <Icon name="emoji_events" size={20} />
              리더보드
            </h3>
            <p className="mb-3 text-xs text-[var(--md-sys-color-on-surface-variant)]">
              <b>{targetLines}</b>줄 빙고면 완성 · 종료:{" "}
              {game.config.endWinners > 0
                ? game.config.endWinners === 1
                  ? "1등 나오면"
                  : `${game.config.endWinners}명 완성 시`
                : "전원 완성 시"}{" "}
              (단어 소진·수동 포함)
            </p>

            {sortedPlayers.ranked.length === 0 &&
              sortedPlayers.others.length === 0 &&
              sortedPlayers.finishedUnranked.length === 0 && (
                <p className="rounded-xl bg-[var(--md-sys-color-surface-container-high)] p-3 text-center text-xs text-[var(--md-sys-color-on-surface-variant)]">
                  참여한 학생이 없어요
                </p>
              )}

            {sortedPlayers.ranked.length > 0 && (
              <div className="mb-3 space-y-1.5">
                {sortedPlayers.ranked.map((p) => {
                  const m = memberByUid.get(p.uid);
                  const name =
                    m?.displayName ??
                    subByUid.get(p.uid)?.name ??
                    "이름없음";
                  const medal = `${p.rank}등`;
                  return (
                    <div
                      key={p.uid}
                      className="flex items-center gap-2 rounded-2xl border-2 border-[var(--md-sys-color-primary)] bg-[var(--md-sys-color-primary-container)] px-3 py-2 text-[var(--md-sys-color-on-primary-container)]"
                    >
                      <span className="text-2xl leading-none">{medal}</span>
                      <span className="line-clamp-1 flex-1 text-sm font-extrabold">
                        {name}
                      </span>
                      <span className="text-[11px] font-bold opacity-80">
                        {p.doneAtTurn}번째 호출
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {sortedPlayers.others.length > 0 && (
              <div className="space-y-1">
                {sortedPlayers.others.map((s) => {
                  const m = memberByUid.get(s.uid);
                  const name = m?.displayName ?? s.name ?? "이름없음";
                  return (
                    <div
                      key={s.uid}
                      className="flex items-center gap-2 rounded-xl bg-[var(--md-sys-color-surface-container-high)] px-3 py-1.5"
                    >
                      <span className="line-clamp-1 flex-1 text-sm font-bold text-[var(--md-sys-color-on-surface)]">
                        {name}
                      </span>
                      <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-[var(--md-sys-color-on-surface)]">
                        {validBingoOf(s)}줄
                      </span>
                      <span className="text-[11px] font-bold text-[var(--md-sys-color-on-surface-variant)]">
                        {s.marked.length}칸
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {sortedPlayers.finishedUnranked.length > 0 && (
              <div className="mt-3 space-y-1">
                <p className="text-[10px] font-bold tracking-[0.2em] text-[var(--md-sys-color-on-surface-variant)]">
                  완성 (순위 밖)
                </p>
                {sortedPlayers.finishedUnranked.map((s) => {
                  const m = memberByUid.get(s.uid);
                  const name = m?.displayName ?? s.name ?? "이름없음";
                  return (
                    <div
                      key={s.uid}
                      className="flex items-center gap-2 rounded-xl bg-[var(--md-sys-color-tertiary-container)] px-3 py-1.5 text-[var(--md-sys-color-on-tertiary-container)]"
                    >
                      <Icon name="check_circle" size={16} />
                      <span className="line-clamp-1 flex-1 text-sm font-bold">
                        {name}
                      </span>
                      <span className="text-[11px] font-bold opacity-80">
                        완성
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </aside>

          {/* 3) 우클릭 확대 카드 */}
          {focused && (
            <FocusedConceptCard
              candidate={focused}
              onClose={() => setFocusedWord(null)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------- 우클릭 확대 카드 ----------------
function FocusedConceptCard({
  candidate,
  onClose,
}: {
  candidate: GameCandidate;
  onClose: () => void;
}) {
  return (
    <aside
      role="complementary"
      aria-label="확대 개념 카드"
      className="sticky top-4 flex h-fit max-h-[80vh] flex-col gap-4 overflow-y-auto rounded-3xl border-2 border-[var(--md-sys-color-tertiary)] bg-white p-6 shadow-2xl animate-float-in"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--md-sys-color-tertiary-container)] px-3 py-1 text-xs font-extrabold tracking-[0.15em] text-[var(--md-sys-color-on-tertiary-container)]">
          <Icon name="menu_book" size={14} />
          개념 카드
        </span>
        <button
          onClick={onClose}
          className="-mr-1 -mt-1 inline-flex h-9 w-9 items-center justify-center rounded-full text-[var(--md-sys-color-on-surface-variant)] hover:bg-black/5"
          title="닫기"
          aria-label="확대 카드 닫기"
        >
          <Icon name="close" size={20} />
        </button>
      </div>

      <div
        className={`font-omu break-keep leading-tight text-[var(--md-sys-color-on-surface)] ${focusedWordFontClass(candidate.word)} text-center`}
      >
        {candidate.word}
      </div>

      {candidate.meaning ? (
        <p className="rounded-2xl bg-[var(--md-sys-color-surface-container-high)] p-4 text-base leading-relaxed text-[var(--md-sys-color-on-surface)]">
          {candidate.meaning}
        </p>
      ) : (
        <p className="rounded-2xl border-2 border-dashed border-[var(--md-sys-color-outline-variant)] p-4 text-center text-sm text-[var(--md-sys-color-on-surface-variant)]">
          뜻이 없는 단어예요. 직접 설명해주세요.
        </p>
      )}

      <div className="flex flex-col gap-1.5 rounded-2xl bg-[var(--md-sys-color-secondary-container)] p-4 text-[var(--md-sys-color-on-secondary-container)]">
        <p className="flex items-center justify-between text-sm font-bold">
          <span>학생 투표</span>
          <span className="text-2xl font-black tabular-nums leading-none">
            {candidate.selectedBy.length}명
          </span>
        </p>
        <p className="flex items-center justify-between text-xs">
          <span>이 단어를 제출한 학생</span>
          <span className="font-bold tabular-nums">
            {candidate.submittedBy.length}명
          </span>
        </p>
      </div>

      <p className="text-center text-xs text-[var(--md-sys-color-on-surface-variant)]">
        다시 우클릭하거나 X를 누르면 닫혀요
      </p>
    </aside>
  );
}

// 확대 카드 단어 폰트 — 길이에 따라
function focusedWordFontClass(word: string): string {
  const len = [...word].length;
  if (len <= 1) return "text-8xl";
  if (len <= 2) return "text-7xl";
  if (len <= 3) return "text-6xl";
  if (len <= 4) return "text-5xl";
  if (len <= 6) return "text-4xl";
  return "text-3xl";
}

function statusLabel(s: LiveStatus): string {
  return s === "submitted"
    ? "제출 완료"
    : s === "writing"
      ? "작성중"
      : s === "joined"
        ? "참여 완료"
        : "응답안함";
}
// 상태별 색 — M3 토큰 (lib/games.ts 의 liveColorVar 와 동일)
const liveColor = liveColorVar;
function stageLabel(s: Game["status"]): string {
  return s === "draft"
    ? "참여 모집 중"
    : s === "submit"
      ? "단어 제출 중"
      : s === "select"
        ? "후보 단어 선정"
        : s === "build"
          ? "빙고판 만들기"
          : s === "play"
            ? "게임 진행"
            : s === "done"
              ? "종료"
              : "준비";
}
