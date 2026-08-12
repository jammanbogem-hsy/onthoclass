"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Lottie from "lottie-react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Icon } from "@/components/Icon";
import { Avatar } from "@/components/Avatar";
import { FitText } from "@/components/FitText";
import { MiniBoard } from "@/components/MiniBoard";
import { GameResults } from "@/components/GameResults";
import { listMembers, type Member } from "@/lib/classes";
import {
  bingoLineCells,
  countBingoLines,
  joinGame,
  pingActive,
  reopenBoard,
  reopenWriting,
  setGameName,
  setInactive,
  setStudentPicks,
  studentCall,
  submitBoard,
  submitGameWords,
  watchGameSubmissions,
  type Game,
  type GameSubmission,
} from "@/lib/games";

/**
 * 학생용 영구 게임 스테이지 — 게임 진행 상태에 따라 내용이 바뀌는 풀스크린 단일 표면.
 * Stage A 참여:   game.status==="submit" && !mySub
 * Stage B 작성:   game.status==="submit" && mySub.status==="writing"
 * Stage C 대기:   mySub.status==="submitted"  (다른 친구 기다림)
 * (이후 단계는 Phase 3~ 에서 select/build/play 확장)
 *
 * 흐름이 끊기지 않도록 단일 오버레이가 그대로 유지되며 내용만 전환된다.
 */
export function GameStudentStage({
  cid,
  game,
  uid,
  name,
  mySub,
  onMinimize,
}: {
  cid: string;
  game: Game;
  uid: string;
  name: string;
  mySub: GameSubmission | null;
  /** 학생이 명시적으로 닫기를 눌렀을 때 호출 — 현재 단계에서만 숨김 */
  onMinimize: () => void;
}) {
  const [lottie, setLottie] = useState<object | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/Geometric%20shape%20loader.json")
      .then((r) => r.json())
      .then((d) => alive && setLottie(d))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // 학생 선정 = 보드 차원 N (개인적으로 중요한 단어). 교사가 N²개 최종 후보 확정.
  const selectTarget = game.config.boardSize;
  const stage:
    | "join"
    | "lobby"
    | "write"
    | "wait"
    | "select"
    | "select-wait"
    | "build"
    | "build-wait"
    | "play"
    | "play-done"
    | "result"
    | "spectate"
    | "later" = !mySub
    ? // 아직 참여 문서 없음: 로비/제출 단계면 참여 가능, 그 이후(선정/빌드/플레이/종료)에
      // 처음 들어오면 셋업을 놓쳤으므로 관전 안내
      game.status === "draft" || game.status === "submit"
      ? "join"
      : game.status === "done"
        ? "result"
        : "spectate"
    : game.status === "draft"
      ? "lobby" // 참여 완료, 교사가 시작 누를 때까지 대기
      : game.status === "submit"
        ? mySub.status === "submitted" ||
          mySub.status === "ready" ||
          mySub.status === "playing" ||
          mySub.status === "done"
          ? "wait"
          : "write"
        : game.status === "select"
          ? mySub.picked.length >= Math.min(selectTarget, game.candidates.length)
            ? "select-wait"
            : "select"
          : game.status === "build"
            ? mySub.boardReady || mySub.status === "ready"
              ? "build-wait"
              : "build"
            : game.status === "play"
              ? mySub.status === "done"
                ? "play-done"
                : // 빙고판을 완성하지 못한(boardReady=false) 학생은 빈 보드로 갇히므로 관전
                  mySub.boardReady
                  ? "play"
                  : "spectate"
              : game.status === "done"
                ? "result"
                : "later";

  // 작성/플레이 중 heartbeat (5초 간격) + 탭 가시성 즉시 반영
  useEffect(() => {
    if (stage !== "write" && stage !== "play" && stage !== "select" && stage !== "build")
      return;
    const ping = () => {
      if (document.visibilityState !== "visible") return;
      pingActive(cid, game.id, uid).catch(() => {});
    };
    ping();
    const t = setInterval(ping, 5000);

    // 탭 이탈/복귀 즉시 반영 — 응답안함이 1~2초 안에 잡힘
    const onVis = () => {
      if (document.visibilityState === "visible") {
        setInactive(cid, game.id, uid, false).catch(() => {});
      } else {
        setInactive(cid, game.id, uid, true).catch(() => {});
      }
    };
    const onBlur = () => {
      setInactive(cid, game.id, uid, true).catch(() => {});
    };
    const onFocus = () => {
      setInactive(cid, game.id, uid, false).catch(() => {});
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      // 언마운트 시 inactive 처리 — 다른 페이지로 이동/오버레이 닫힘
      setInactive(cid, game.id, uid, true).catch(() => {});
    };
  }, [stage, cid, game.id, uid]);

  // 제출에 저장된 이름이 비었거나 "이름없음"이면, 정확한 학급 이름으로 보정(이미 참여한 경우).
  useEffect(() => {
    if (!mySub) return;
    const proper = name.trim();
    if (!proper || proper === "이름없음") return;
    if (mySub.name === proper) return;
    setGameName(cid, game.id, uid, proper).catch(() => {});
  }, [mySub, name, cid, game.id, uid]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`학급 게임 · 개념 빙고 · ${stageBadge(stage)}`}
      aria-live="polite"
      className="fixed inset-0 z-[92] flex flex-col bg-gradient-to-br from-[var(--md-sys-color-primary-container)] via-[var(--md-sys-color-secondary-container)] to-[var(--md-sys-color-tertiary-container)]"
    >
      {/* 페이지 헤더 — 어느 게임인지 + 단계 + 최소화(돌아가기) */}
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-white/40 bg-white/40 px-5 py-3 backdrop-blur-md">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-[var(--md-sys-color-primary)] shadow-sm">
            <Icon name="grid_view" size={20} />
          </span>
          <div className="flex min-w-0 flex-col leading-tight">
            <span className="text-[10px] font-bold tracking-[0.25em] text-[var(--md-sys-color-on-surface-variant)]">
              학급 게임
            </span>
            <span className="truncate text-sm font-extrabold text-[var(--md-sys-color-on-surface)]">
              개념 빙고 · {game.link.name}
            </span>
          </div>
          <span className="ml-2 hidden shrink-0 rounded-full bg-white/80 px-2.5 py-1 text-xs font-bold text-[var(--md-sys-color-on-surface)] shadow-sm sm:inline">
            {stageBadge(stage)}
          </span>
        </div>
        <button
          onClick={onMinimize}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white/90 px-3 py-2 text-xs font-bold text-[var(--md-sys-color-on-surface)] shadow-sm hover:bg-white"
          title="잠시 닫기 (게임은 계속 진행돼요)"
        >
          <Icon name="close" size={16} />
          닫기
        </button>
      </header>

      {/* 페이지 메인 — 콘텐츠가 길어지면 스크롤, 좁으면 중앙 정렬.
          `my-auto` 패턴으로 overflow 상단 잘림 버그 회피. */}
      <main className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto px-4 py-8 [&>*]:my-auto">

      {stage === "join" && (
        <JoinPanel
          cid={cid}
          game={game}
          uid={uid}
          name={name}
          lottie={lottie}
          onMinimize={onMinimize}
        />
      )}
      {stage === "write" && (
        <WritePanel
          cid={cid}
          game={game}
          uid={uid}
          mySub={mySub!}
        />
      )}
      {stage === "wait" && (
        <WaitPanel
          cid={cid}
          game={game}
          uid={uid}
          mySub={mySub!}
        />
      )}
      {stage === "lobby" && <LobbyPanel />}
      {stage === "select" && (
        <SelectPanel
          cid={cid}
          game={game}
          uid={uid}
          mySub={mySub!}
        />
      )}
      {stage === "select-wait" && (
        <SelectWaitPanel game={game} mySub={mySub!} />
      )}
      {stage === "build" && (
        <BuildPanel cid={cid} game={game} uid={uid} mySub={mySub!} />
      )}
      {stage === "build-wait" && (
        <BuildWaitPanel cid={cid} game={game} uid={uid} mySub={mySub!} />
      )}
      {stage === "play" && (
        <PlayPanel cid={cid} game={game} uid={uid} mySub={mySub!} />
      )}
      {stage === "play-done" && (
        <PlayDonePanel game={game} uid={uid} mySub={mySub!} />
      )}
      {stage === "result" && <ResultPanel cid={cid} game={game} uid={uid} />}
      {stage === "spectate" && <SpectatePanel game={game} />}
      {stage === "later" && <LaterPanel />}
      </main>
    </div>
  );
}

// 헤더 배지용 단계 라벨
function stageBadge(
  s:
    | "join"
    | "lobby"
    | "write"
    | "wait"
    | "select"
    | "select-wait"
    | "build"
    | "build-wait"
    | "play"
    | "play-done"
    | "result"
    | "spectate"
    | "later"
): string {
  switch (s) {
    case "join":
      return "참여 모집";
    case "lobby":
      return "참여 완료 · 대기";
    case "write":
      return "단어 제출";
    case "wait":
      return "제출 완료 · 대기";
    case "select":
      return "핵심 단어 선정";
    case "select-wait":
      return "선정 완료 · 대기";
    case "build":
      return "빙고판 만들기";
    case "build-wait":
      return "빙고판 완료 · 대기";
    case "play":
      return "플레이 중";
    case "play-done":
      return "빙고 완성!";
    case "result":
      return "최종 결과";
    case "spectate":
      return "관전";
    case "later":
      return "곧 시작";
  }
}

// ---------------- Stage A: 참여 ----------------
function JoinPanel({
  cid,
  game,
  uid,
  name,
  lottie,
  onMinimize,
}: {
  cid: string;
  game: Game;
  uid: string;
  name: string;
  lottie: object | null;
  onMinimize: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function go() {
    setBusy(true);
    setErr("");
    try {
      await joinGame(cid, game.id, uid, name);
      // 같은 스테이지 안에서 mySub 변경 → write 패널로 자연 전환
    } catch (e) {
      setErr(e instanceof Error ? e.message : "참여에 실패했습니다.");
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <div className="h-[min(40vh,360px)] w-[min(40vh,360px)] max-w-[80vw]">
        {lottie ? (
          <Lottie animationData={lottie} loop autoplay />
        ) : (
          <div className="h-full w-full animate-pulse rounded-full bg-white/30" />
        )}
      </div>
      <p className="text-base font-bold tracking-[0.3em] text-[var(--md-sys-color-on-tertiary-container)]">
        학급 게임이 열렸어요
      </p>
      <h1 className="text-6xl font-black text-[var(--md-sys-color-on-primary-container)] sm:text-7xl">
        개념 빙고
      </h1>
      <p className="rounded-full bg-white/85 px-4 py-1.5 text-base font-semibold text-[var(--md-sys-color-on-surface)] shadow-sm backdrop-blur-sm">
        {game.link.name}
      </p>
      <p className="max-w-[520px] text-base font-medium text-[var(--md-sys-color-on-secondary-container)] sm:text-lg">
        {game.config.boardSize}×{game.config.boardSize} 보드 · 단어{" "}
        <b>{game.config.wordsPerStudent}</b>개 제출 · 빙고{" "}
        <b>{game.config.bingoTarget}</b>줄 완성
      </p>

      {err && (
        <p className="rounded-xl bg-[var(--md-sys-color-error-container)] px-3 py-2 text-xs text-[var(--md-sys-color-on-error-container)]">
          {err}
        </p>
      )}

      <button
        onClick={go}
        disabled={busy}
        className="mt-4 inline-flex min-w-[300px] items-center justify-center gap-2 rounded-full bg-[var(--md-sys-color-primary)] px-12 py-6 text-3xl font-extrabold text-[var(--md-sys-color-on-primary)] shadow-xl transition hover:scale-[1.03] active:scale-100 disabled:opacity-50"
      >
        <Icon name="play_arrow" size={32} />
        {busy ? "참여하는 중…" : "참여하기"}
      </button>
      <button
        onClick={onMinimize}
        className="text-sm text-[var(--md-sys-color-on-surface-variant)] underline-offset-2 hover:underline"
      >
        잠시 미루기
      </button>
    </div>
  );
}

// ---------------- Stage B: 작성 ----------------
function WritePanel({
  cid,
  game,
  uid,
  mySub,
}: {
  cid: string;
  game: Game;
  uid: string;
  mySub: GameSubmission;
}) {
  const N = game.config.wordsPerStudent;
  const withMeaning = game.config.allowMeaning;
  // localStorage 키: 게임·학생·N·의미여부 단위 (설정 바뀌면 캐시 무효화)
  const draftKey = `bingoDraft:${cid}:${game.id}:${uid}:${N}:${withMeaning ? "m" : "w"}`;
  const initial = useMemo(() => {
    const ws = Array<string>(N).fill("");
    const ms = Array<string>(N).fill("");
    // 1) 서버에 이미 저장된 값이 있으면 우선
    if (mySub.words.length) {
      mySub.words.slice(0, N).forEach((w, i) => {
        ws[i] = w;
      });
      mySub.meanings?.slice(0, N).forEach((m, i) => {
        ms[i] = m;
      });
      return { ws, ms };
    }
    // 2) 그렇지 않으면 localStorage 임시저장 복원
    if (typeof window !== "undefined") {
      try {
        const raw = window.localStorage.getItem(draftKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && Array.isArray(parsed.ws)) {
            parsed.ws.slice(0, N).forEach((w: unknown, i: number) => {
              if (typeof w === "string") ws[i] = w;
            });
          }
          if (parsed && Array.isArray(parsed.ms)) {
            parsed.ms.slice(0, N).forEach((m: unknown, i: number) => {
              if (typeof m === "string") ms[i] = m;
            });
          }
        }
      } catch {
        /* noop */
      }
    }
    return { ws, ms };
  }, [N, mySub.words, mySub.meanings, draftKey]);
  const [words, setWords] = useState<string[]>(initial.ws);
  const [meanings, setMeanings] = useState<string[]>(initial.ms);

  // 변경 시 localStorage 미러 — Firestore write 없이 새로고침 안전
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        draftKey,
        JSON.stringify({ ws: words, ms: meanings })
      );
    } catch {
      /* noop */
    }
  }, [words, meanings, draftKey]);

  // 활성 인풋 — 첫 빈 칸으로 포커싱
  const firstRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    firstRef.current?.focus();
  }, []);

  // 입력 시 즉시 ping (3초 throttle) — "작성중" 이 거의 실시간으로 잡힘
  const lastPingRef = useRef<number>(0);
  const pingOnInput = useCallback(() => {
    const now = Date.now();
    if (now - lastPingRef.current < 3000) return;
    lastPingRef.current = now;
    pingActive(cid, game.id, uid).catch(() => {});
  }, [cid, game.id, uid]);

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const filled = words.filter((w) => w.trim().length > 0).length;
  const allFilled = filled === N;
  const unique = new Set(
    words.map((w) => w.trim()).filter(Boolean)
  ).size;
  const dup = filled !== unique;

  async function submit() {
    if (!allFilled || dup) return;
    setBusy(true);
    setErr("");
    try {
      await submitGameWords(
        cid,
        game.id,
        uid,
        words.map((w) => w.trim()),
        withMeaning ? meanings.map((m) => m.trim()) : undefined
      );
      // 제출 성공 → 임시저장 캐시 제거(서버가 진실의 원천)
      if (typeof window !== "undefined") {
        try {
          window.localStorage.removeItem(draftKey);
        } catch {
          /* noop */
        }
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "제출에 실패했습니다.");
      setBusy(false);
    }
  }

  return (
    <CenterCard wide>
      <p className="text-sm font-bold tracking-[0.3em] text-[var(--md-sys-color-primary)]">
        STEP 1 · 단어 제출
      </p>
      <h1 className="text-4xl font-black sm:text-5xl">
        오늘 배운 핵심 개념을 적어요
      </h1>
      <p className="text-sm text-[var(--md-sys-color-on-surface-variant)] sm:text-base">
        <b>{game.link.name}</b>에서 배운 내용 + 이전 학습과 연결된 핵심 개념을{" "}
        <b>{N}개</b> 적어주세요.
      </p>

      <div
        role="progressbar"
        aria-valuenow={filled}
        aria-valuemin={0}
        aria-valuemax={N}
        aria-label={`작성 진행률 ${filled} / ${N}`}
        className="mt-2 flex w-full items-center gap-2"
      >
        <span className="text-xs font-bold text-[var(--md-sys-color-on-surface-variant)]">
          {filled}/{N}
        </span>
        <span className="block h-1.5 flex-1 overflow-hidden rounded-full bg-black/10">
          <span
            className="block h-full rounded-full bg-[var(--md-sys-color-primary)] transition-all"
            style={{ width: `${Math.round((filled / N) * 100)}%` }}
          />
        </span>
      </div>

      <div className="grid w-full grid-cols-1 gap-2.5">
        {words.map((w, i) => (
          <div
            key={i}
            className="flex flex-col gap-1.5 rounded-2xl border border-[var(--md-sys-color-outline-variant)] bg-white p-2 transition focus-within:border-[var(--md-sys-color-primary)] focus-within:ring-2 focus-within:ring-[var(--md-sys-color-primary)]/30"
          >
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--md-sys-color-primary-container)] text-sm font-extrabold text-[var(--md-sys-color-on-primary-container)]">
                {i + 1}
              </span>
              <input
                ref={i === 0 ? firstRef : undefined}
                value={w}
                onChange={(e) => {
                  const next = [...words];
                  next[i] = e.target.value;
                  setWords(next);
                  pingOnInput();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && allFilled && !dup) submit();
                }}
                placeholder={`핵심 개념 ${i + 1}`}
                aria-label={`핵심 개념 ${i + 1}번 입력`}
                className="h-11 flex-1 bg-transparent text-lg font-semibold text-[var(--md-sys-color-on-surface)] outline-none"
                maxLength={20}
              />
            </div>
            {withMeaning && (
              <input
                value={meanings[i] ?? ""}
                onChange={(e) => {
                  const next = [...meanings];
                  next[i] = e.target.value;
                  setMeanings(next);
                  pingOnInput();
                }}
                placeholder="한 줄 의미 (선택)"
                aria-label={`핵심 개념 ${i + 1}번 의미 (선택)`}
                className="ml-11 h-8 flex-1 bg-transparent text-sm text-[var(--md-sys-color-on-surface-variant)] outline-none"
                maxLength={40}
              />
            )}
          </div>
        ))}
      </div>

      {dup && (
        <p
          role="alert"
          className="text-xs font-semibold text-[var(--md-sys-color-error)]"
        >
          같은 단어가 중복돼 있어요 — 서로 다르게 적어 주세요.
        </p>
      )}
      {err && (
        <p className="rounded-xl bg-[var(--md-sys-color-error-container)] px-3 py-2 text-xs text-[var(--md-sys-color-on-error-container)]">
          {err}
        </p>
      )}

      <button
        onClick={submit}
        disabled={!allFilled || dup || busy}
        className="mt-2 inline-flex min-w-[260px] items-center justify-center gap-2 rounded-full bg-[var(--md-sys-color-primary)] px-10 py-5 text-2xl font-extrabold text-[var(--md-sys-color-on-primary)] shadow-xl transition hover:scale-[1.02] disabled:opacity-40"
      >
        <Icon name={busy ? "progress_activity" : "send"} size={24} />
        {busy ? "제출 중…" : "제출하기"}
      </button>
    </CenterCard>
  );
}

// ---------------- Stage C: 대기 ----------------
function WaitPanel({
  cid,
  game,
  uid,
  mySub,
}: {
  cid: string;
  game: Game;
  uid: string;
  mySub: GameSubmission;
}) {
  const [all, setAll] = useState<GameSubmission[]>([]);
  const [sandy, setSandy] = useState<object | null>(null);
  useEffect(() => {
    return watchGameSubmissions(cid, game.id, setAll);
  }, [cid, game.id]);
  useEffect(() => {
    let alive = true;
    fetch("/Sandy%20Loading.json")
      .then((r) => r.json())
      .then((d) => alive && setSandy(d))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  const submittedCount = all.filter(
    (s) =>
      s.status === "submitted" ||
      s.status === "ready" ||
      s.status === "playing" ||
      s.status === "done"
  ).length;
  const total = Math.max(all.length, submittedCount);

  return (
    <CenterCard wide>
      <div className="h-[min(38vh,340px)] w-[min(38vh,340px)] max-w-[78vw]">
        {sandy ? (
          <Lottie animationData={sandy} loop autoplay />
        ) : (
          <div className="h-full w-full animate-pulse rounded-full bg-[var(--md-sys-color-tertiary-container)]" />
        )}
      </div>
      <p className="text-sm font-bold tracking-[0.3em] text-[var(--md-sys-color-tertiary)]">
        제출 완료
      </p>
      <h1 className="text-4xl font-black sm:text-5xl">
        멋진 단어들이에요!
      </h1>
      <p className="text-base text-[var(--md-sys-color-on-surface-variant)]">
        다른 친구들이 제출하는 동안 잠시 기다려요.
      </p>

      <div className="flex flex-wrap items-center justify-center gap-1.5">
        {mySub.words.map((w, i) => (
          <span
            key={i}
            className="rounded-full bg-[var(--md-sys-color-primary-container)] px-3 py-1.5 text-sm font-bold text-[var(--md-sys-color-on-primary-container)]"
          >
            {w}
          </span>
        ))}
      </div>

      <div
        role="progressbar"
        aria-valuenow={submittedCount}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-label={`친구들 제출 ${submittedCount} / ${total}`}
        className="mt-2 flex w-full items-center gap-2"
      >
        <span className="text-xs font-bold text-[var(--md-sys-color-on-surface-variant)]">
          제출 {submittedCount}/{total}
        </span>
        <span className="block h-1.5 flex-1 overflow-hidden rounded-full bg-black/10">
          <span
            className="block h-full rounded-full bg-[var(--md-sys-color-tertiary)] transition-all"
            style={{
              width: `${Math.round((submittedCount / Math.max(1, total)) * 100)}%`,
            }}
          />
        </span>
      </div>

      {/* 보조 액션 — 호기심 클릭 방지 위해 작은 텍스트 링크로 약화 */}
      <button
        onClick={() => reopenWriting(cid, game.id, uid).catch(() => {})}
        className="mt-1 inline-flex items-center gap-1 text-xs text-[var(--md-sys-color-on-surface-variant)] underline-offset-2 hover:underline"
      >
        <Icon name="edit" size={12} />
        단어를 다시 적기
      </button>
    </CenterCard>
  );
}

// ---------------- Stage 선정: 학생이 후보 단어 N²개 고르기 ----------------
function SelectPanel({
  cid,
  game,
  uid,
  mySub,
}: {
  cid: string;
  game: Game;
  uid: string;
  mySub: GameSubmission;
}) {
  // 학생 선정 = 보드 차원 N 개. (3×3→3, 4×4→4, 5×5→5, 7×7→7)
  const target = Math.min(game.config.boardSize, game.candidates.length);
  // 작성 중 임시저장 — 서버(mySub.picked) 우선, 없으면 localStorage 복원(튕김/창닫음 안전)
  const draftKey = `bingoPicks:${cid}:${game.id}:${uid}`;
  const validWords = useMemo(
    () => new Set(game.candidates.map((c) => c.word)),
    [game.candidates]
  );
  const [picked, setPicked] = useState<string[]>(() => {
    if (mySub.picked && mySub.picked.length) return mySub.picked;
    if (typeof window !== "undefined") {
      try {
        const raw = window.localStorage.getItem(draftKey);
        if (raw) {
          const p = JSON.parse(raw);
          if (Array.isArray(p))
            return p.filter(
              (x): x is string => typeof x === "string" && validWords.has(x)
            );
        }
      } catch {
        /* noop */
      }
    }
    return [];
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(draftKey, JSON.stringify(picked));
    } catch {
      /* noop */
    }
  }, [picked, draftKey]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  function toggle(word: string) {
    setPicked((prev) => {
      if (prev.includes(word)) return prev.filter((w) => w !== word);
      if (prev.length >= target) return prev; // 상한 도달
      return [...prev, word];
    });
  }
  async function submit() {
    if (picked.length !== target || busy) return;
    setBusy(true);
    setErr("");
    try {
      await setStudentPicks(cid, game.id, uid, picked);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "선정 저장에 실패했습니다.");
      setBusy(false);
    }
  }

  return (
    <CenterCard xwide>
      <p className="text-sm font-bold tracking-[0.3em] text-[var(--md-sys-color-primary)]">
        STEP 2 · 핵심 단어 선정
      </p>
      <h1 className="text-3xl font-black sm:text-4xl">
        중요한 단어 <span className="text-[var(--md-sys-color-primary)]">{target}개</span>를 골라봐요
      </h1>
      <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">
        친구들이 적은 단어들 중 빙고판에 들어갔으면 하는 핵심 개념을 선택!
      </p>

      <div
        role="progressbar"
        aria-valuenow={picked.length}
        aria-valuemin={0}
        aria-valuemax={target}
        className="mt-1 flex w-full items-center gap-2"
      >
        <span className="text-xs font-bold text-[var(--md-sys-color-on-surface-variant)]">
          {picked.length}/{target}
        </span>
        <span className="block h-1.5 flex-1 overflow-hidden rounded-full bg-black/10">
          <span
            className="block h-full rounded-full bg-[var(--md-sys-color-primary)] transition-all"
            style={{
              width: `${Math.round((picked.length / Math.max(1, target)) * 100)}%`,
            }}
          />
        </span>
      </div>

      <div className="grid w-full grid-cols-3 gap-2.5 py-1 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8">
        {game.candidates.map((c) => {
          const on = picked.includes(c.word);
          const atCap = !on && picked.length >= target;
          return (
            <button
              key={c.word}
              onClick={() => toggle(c.word)}
              disabled={atCap}
              aria-pressed={on}
              className={`relative flex aspect-square flex-col items-center justify-center gap-1 overflow-hidden rounded-2xl border-2 p-2 text-center transition disabled:opacity-40 ${
                on
                  ? "border-[var(--md-sys-color-primary)] bg-[var(--md-sys-color-primary-container)]"
                  : "border-[var(--md-sys-color-outline-variant)] bg-white hover:border-[var(--md-sys-color-outline)]"
              }`}
            >
              {on && (
                <span className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--md-sys-color-primary)] text-white">
                  <Icon name="check" size={14} />
                </span>
              )}
              <FitText
                text={c.word}
                className={`font-omu break-keep leading-tight ${wordFontClass(c.word)} ${
                  on
                    ? "text-[var(--md-sys-color-on-primary-container)]"
                    : "text-[var(--md-sys-color-on-surface)]"
                }`}
              />
              {c.meaning && (
                <span
                  className={`line-clamp-2 text-[11px] leading-snug ${
                    on
                      ? "text-[var(--md-sys-color-on-primary-container)]/80"
                      : "text-[var(--md-sys-color-on-surface-variant)]"
                  }`}
                >
                  {c.meaning}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {err && (
        <p
          role="alert"
          className="rounded-xl bg-[var(--md-sys-color-error-container)] px-3 py-2 text-xs text-[var(--md-sys-color-on-error-container)]"
        >
          {err}
        </p>
      )}

      <button
        onClick={submit}
        disabled={picked.length !== target || busy}
        className="mt-2 inline-flex min-w-[260px] items-center justify-center gap-2 rounded-full bg-[var(--md-sys-color-primary)] px-10 py-5 text-2xl font-extrabold text-[var(--md-sys-color-on-primary)] shadow-xl transition hover:scale-[1.02] disabled:opacity-40"
      >
        <Icon name={busy ? "progress_activity" : "check"} size={24} />
        {busy ? "저장 중…" : "선정 완료"}
      </button>
    </CenterCard>
  );
}

// ---------------- Stage 선정 후 대기: 교사 후보 확정 기다림 ----------------
function SelectWaitPanel({
  game,
  mySub,
}: {
  game: Game;
  mySub: GameSubmission;
}) {
  const [sandy, setSandy] = useState<object | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/Sandy%20Loading.json")
      .then((r) => r.json())
      .then((d) => alive && setSandy(d))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return (
    <CenterCard wide>
      <div className="h-[min(34vh,300px)] w-[min(34vh,300px)] max-w-[78vw]">
        {sandy ? (
          <Lottie animationData={sandy} loop autoplay />
        ) : (
          <div className="h-full w-full animate-pulse rounded-full bg-[var(--md-sys-color-tertiary-container)]" />
        )}
      </div>
      <p className="text-sm font-bold tracking-[0.3em] text-[var(--md-sys-color-tertiary)]">
        선정 완료
      </p>
      <h1 className="text-3xl font-black sm:text-4xl">
        선생님이 후보 단어를 확정해요
      </h1>
      <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">
        곧 빙고판을 꾸미는 단계로 넘어갑니다.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-1.5">
        {mySub.picked.slice(0, 8).map((w) => (
          <span
            key={w}
            className="font-omu rounded-full bg-[var(--md-sys-color-primary-container)] px-3 py-1.5 text-base text-[var(--md-sys-color-on-primary-container)]"
          >
            {w}
          </span>
        ))}
        {mySub.picked.length > 8 && (
          <span className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
            외 {mySub.picked.length - 8}개
          </span>
        )}
      </div>
      <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
        {game.config.boardSize}×{game.config.boardSize} 보드 · 빙고{" "}
        {game.config.bingoTarget}줄
      </p>
    </CenterCard>
  );
}

// ---------------- Stage 빙고판: 단어들을 N×N 보드에 배치 ----------------
function BuildPanel({
  cid,
  game,
  uid,
  mySub,
}: {
  cid: string;
  game: Game;
  uid: string;
  mySub: GameSubmission;
}) {
  const N = game.config.boardSize;
  const totalCells = N * N;
  const allWords = useMemo(
    () => game.candidates.map((c) => c.word),
    [game.candidates]
  );

  const shuffle = useCallback((arr: string[]): string[] => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }, []);

  // 작성 중 임시저장 — 서버(mySub.board) 우선, 없으면 localStorage 복원(튕김/창닫음 안전)
  const draftKey = `bingoBoard:${cid}:${game.id}:${uid}:${N}`;
  const initialBoard = useMemo<(string | null)[]>(() => {
    if (mySub.board.length === totalCells && mySub.board.some(Boolean)) {
      return [...mySub.board];
    }
    if (typeof window !== "undefined") {
      try {
        const raw = window.localStorage.getItem(draftKey);
        if (raw) {
          const arr = JSON.parse(raw);
          if (Array.isArray(arr) && arr.length === totalCells) {
            const wordSet = new Set(allWords);
            return arr.map((x) =>
              typeof x === "string" && wordSet.has(x) ? x : null
            );
          }
        }
      } catch {
        /* noop */
      }
    }
    return Array(totalCells).fill(null);
    // 마운트 시 1회만 — 이후엔 로컬 편집이 진실
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 보드: null=빈 칸, 풀: 아직 배치 안된 단어 (셔플 순서)
  const [board, setBoard] = useState<(string | null)[]>(initialBoard);
  const [pool, setPool] = useState<string[]>(() => {
    const used = new Set(initialBoard.filter((b): b is string => !!b));
    return shuffle(allWords.filter((w) => !used.has(w)));
  });
  // 변경 시 localStorage 미러 — Firestore write 없이 새로고침/튕김 안전
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(draftKey, JSON.stringify(board));
    } catch {
      /* noop */
    }
  }, [board, draftKey]);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const placedCount = board.filter(Boolean).length;
  // 후보 단어가 칸수(N²)보다 적으면 남는 칸은 FREE(자동 완성) — 단어를 모두 놓으면 완성.
  const placeableCount = Math.min(totalCells, allWords.length);
  const freeCount = totalCells - placeableCount;
  // 배치할 단어가 하나도 없으면(교사가 개념 미확정) 빈 보드 제출/완성 불가.
  const noWords = placeableCount === 0;
  const isComplete = placeableCount > 0 && placedCount >= placeableCount;

  // 단어별 카드 폰트(공통) — 길이 + N 둘 다 고려
  const cellFont = useCallback(
    (word: string): string => {
      const len = [...word].length;
      if (N <= 3) {
        if (len <= 2) return "text-3xl sm:text-4xl";
        if (len <= 4) return "text-2xl sm:text-3xl";
        return "text-xl sm:text-2xl";
      }
      if (N === 4) {
        if (len <= 2) return "text-2xl sm:text-3xl";
        if (len <= 4) return "text-xl sm:text-2xl";
        return "text-base sm:text-lg";
      }
      if (N === 5) {
        if (len <= 2) return "text-xl sm:text-2xl";
        if (len <= 4) return "text-base sm:text-xl";
        return "text-sm sm:text-base";
      }
      if (len <= 2) return "text-base sm:text-lg";
      if (len <= 4) return "text-sm sm:text-base";
      return "text-xs sm:text-sm";
    },
    [N]
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 120, tolerance: 8 },
    }),
    useSensor(KeyboardSensor)
  );

  // active id 의 형식: "pool:WORD" 또는 "cell:IDX:WORD"
  const activeWord = activeId
    ? activeId.startsWith("pool:")
      ? activeId.slice(5)
      : activeId.split(":").slice(2).join(":")
    : null;

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }
  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    setActiveId(null);
    if (!over) return;
    const a = String(active.id);
    const o = String(over.id);
    const isFromPool = a.startsWith("pool:");
    const fromWord = isFromPool ? a.slice(5) : a.split(":").slice(2).join(":");
    const fromIdx = isFromPool ? -1 : Number(a.split(":")[1]);

    if (o === "pool") {
      if (isFromPool) return; // 풀→풀: 무시
      // 보드 → 풀: 단어 제거
      setBoard((prev) => {
        const next = [...prev];
        next[fromIdx] = null;
        return next;
      });
      setPool((prev) => [...prev, fromWord]);
      return;
    }
    if (o.startsWith("cell:")) {
      const toIdx = Number(o.split(":")[1]);
      if (isFromPool) {
        // 풀 → 보드: 셀에 배치, 기존 단어는 풀로 (스왑)
        const oldWord = board[toIdx];
        setBoard((prev) => {
          const next = [...prev];
          next[toIdx] = fromWord;
          return next;
        });
        setPool((prev) => {
          const filtered = prev.filter((w) => w !== fromWord);
          return oldWord ? [...filtered, oldWord] : filtered;
        });
      } else {
        // 보드 → 보드: 교환
        if (fromIdx === toIdx) return;
        setBoard((prev) => {
          const next = [...prev];
          const tmp = next[toIdx];
          next[toIdx] = fromWord;
          next[fromIdx] = tmp;
          return next;
        });
      }
    }
  }

  function autoFill() {
    setBoard((prev) => {
      const empties: number[] = [];
      prev.forEach((b, i) => {
        if (b === null) empties.push(i);
      });
      const shuffled = shuffle(pool);
      const next = [...prev];
      const used: string[] = [];
      empties.forEach((idx, k) => {
        if (shuffled[k]) {
          next[idx] = shuffled[k];
          used.push(shuffled[k]);
        }
      });
      setPool((p) => p.filter((w) => !used.includes(w)));
      return next;
    });
  }
  function clearAll() {
    const collected = board.filter((b): b is string => !!b);
    setBoard(Array(totalCells).fill(null));
    setPool((prev) => shuffle([...prev, ...collected]));
  }
  function reshufflePool() {
    setPool((prev) => shuffle(prev));
  }
  async function commit() {
    if (busy) return;
    if (!isComplete) {
      setErr(`아직 ${placeableCount - placedCount}칸이 비어있어요.`);
      return;
    }
    setBusy(true);
    setErr("");
    try {
      await submitBoard(cid, game.id, uid, board);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "보드 저장에 실패했습니다.");
      setBusy(false);
    }
  }

  return (
    <section className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-2 sm:px-4">
      {/* 헤더 */}
      <header className="flex flex-col items-center gap-1.5 text-center">
        <p className="text-xs font-bold tracking-[0.3em] text-[var(--md-sys-color-primary)] sm:text-sm">
          STEP 3 · 내 빙고판 만들기
        </p>
        <h1 className="text-3xl font-black sm:text-4xl">
          {N}×{N} 보드를 꾸며봐요
        </h1>
        <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">
          왼쪽 단어를 오른쪽 빙고 칸으로 <b>드래그</b>해서 놓아주세요!
        </p>
        <div className="mt-1 flex w-full max-w-md items-center gap-2">
          <span className="text-xs font-bold text-[var(--md-sys-color-on-surface-variant)]">
            {placedCount}/{placeableCount}
          </span>
          <span className="block h-1.5 flex-1 overflow-hidden rounded-full bg-black/10">
            <span
              className="block h-full rounded-full bg-[var(--md-sys-color-primary)] transition-all"
              style={{
                width: `${
                  placeableCount > 0
                    ? Math.round((placedCount / placeableCount) * 100)
                    : 0
                }%`,
              }}
            />
          </span>
        </div>
        {freeCount > 0 && (
          <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-[var(--md-sys-color-tertiary-container)] px-3 py-1 text-xs font-bold text-[var(--md-sys-color-on-tertiary-container)]">
            <Icon name="star" size={14} />
            단어가 칸보다 적어요 — 남는 {freeCount}칸은 자동 완성(FREE)!
          </p>
        )}
      </header>

      {/* 2-pane DnD */}
      <DndContext
        sensors={sensors}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      >
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:gap-5">
          <PoolColumn
            pool={pool}
            cellFont={cellFont}
            onReshuffle={reshufflePool}
          />
          <BoardColumn board={board} N={N} cellFont={cellFont} />
        </div>
        <DragOverlay dropAnimation={null}>
          {activeWord ? (
            <div
              className={`flex aspect-square w-[22vw] max-w-[140px] items-center justify-center rounded-2xl border-2 border-[var(--md-sys-color-primary)] bg-white p-2 shadow-2xl ${cellFont(activeWord)} font-omu break-keep leading-tight`}
            >
              {activeWord}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {err && (
        <p
          role="alert"
          className="mx-auto rounded-xl bg-[var(--md-sys-color-error-container)] px-3 py-2 text-sm text-[var(--md-sys-color-on-error-container)]"
        >
          {err}
        </p>
      )}

      {/* 액션 — 보조 액션 + 메인 CTA */}
      <div className="flex flex-wrap items-center justify-center gap-2 pb-2">
        <button
          onClick={clearAll}
          disabled={placedCount === 0}
          className="inline-flex items-center gap-1 rounded-full border border-[var(--md-sys-color-outline)] bg-white px-4 py-2.5 text-sm font-semibold text-[var(--md-sys-color-on-surface)] hover:bg-black/5 disabled:opacity-40"
        >
          <Icon name="restart_alt" size={16} />
          전부 풀로 보내기
        </button>
        <button
          onClick={autoFill}
          disabled={pool.length === 0 || isComplete}
          className="inline-flex items-center gap-1 rounded-full border border-[var(--md-sys-color-outline)] bg-white px-4 py-2.5 text-sm font-semibold text-[var(--md-sys-color-on-surface)] hover:bg-black/5 disabled:opacity-40"
        >
          <Icon name="auto_awesome" size={16} />
          자동 채우기
        </button>
        <button
          onClick={commit}
          disabled={busy || !isComplete || noWords}
          className="inline-flex min-w-[240px] items-center justify-center gap-2 rounded-full bg-[var(--md-sys-color-primary)] px-10 py-4 text-xl font-extrabold text-[var(--md-sys-color-on-primary)] shadow-xl transition hover:scale-[1.02] disabled:opacity-40"
        >
          <Icon name={busy ? "progress_activity" : "check"} size={22} />
          {busy ? "저장 중…" : "빙고판 완성!"}
        </button>
      </div>
      {noWords && (
        <p className="mx-auto -mt-1 inline-flex items-center gap-1 rounded-full bg-[var(--md-sys-color-secondary-container)] px-3 py-1 text-xs font-bold text-[var(--md-sys-color-on-secondary-container)]">
          <Icon name="hourglass_empty" size={14} />
          교사가 개념을 먼저 확정해야 해요
        </p>
      )}
    </section>
  );
}

// ---------------- BuildPanel — 좌측 단어 풀 ----------------
function PoolColumn({
  pool,
  cellFont,
  onReshuffle,
}: {
  pool: string[];
  cellFont: (w: string) => string;
  onReshuffle: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: "pool" });
  return (
    <section
      aria-label="단어 풀"
      className={`flex flex-col rounded-3xl bg-white/95 p-3 shadow-sm transition sm:p-4 ${
        isOver ? "ring-2 ring-[var(--md-sys-color-tertiary)]" : ""
      }`}
    >
      <div className="mb-2 flex items-center justify-between gap-2 px-1">
        <h3 className="flex items-center gap-1.5 text-sm font-extrabold text-[var(--md-sys-color-on-surface)]">
          <Icon name="inventory_2" size={16} />
          핵심 단어 <span className="text-[var(--md-sys-color-primary)]">{pool.length}</span>
        </h3>
        <button
          onClick={onReshuffle}
          disabled={pool.length <= 1}
          className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)] hover:bg-black/5 disabled:opacity-40"
          title="풀 단어 순서 섞기"
        >
          <Icon name="shuffle" size={14} />
          섞기
        </button>
      </div>
      <div
        ref={setNodeRef}
        className="grid min-h-[60vh] grid-cols-2 gap-2 rounded-2xl bg-[var(--md-sys-color-surface-container-low)] p-2 sm:grid-cols-3"
      >
        {pool.length === 0 ? (
          <div className="col-span-full flex items-center justify-center py-10 text-center text-xs text-[var(--md-sys-color-on-surface-variant)]">
            모든 단어를 보드에 놓았어요.
          </div>
        ) : (
          pool.map((w) => (
            <DraggableWord key={w} id={`pool:${w}`} word={w} cellFont={cellFont} />
          ))
        )}
      </div>
    </section>
  );
}

// ---------------- BuildPanel — 우측 빙고판 ----------------
function BoardColumn({
  board,
  N,
  cellFont,
}: {
  board: (string | null)[];
  N: number;
  cellFont: (w: string) => string;
}) {
  return (
    <section
      aria-label="빙고판"
      className="flex flex-col rounded-3xl bg-white/95 p-3 shadow-sm sm:p-4"
    >
      <div className="mb-2 flex items-center justify-between gap-2 px-1">
        <h3 className="flex items-center gap-1.5 text-sm font-extrabold text-[var(--md-sys-color-on-surface)]">
          <Icon name="grid_view" size={16} />내 {N}×{N} 빙고판
        </h3>
        <span className="text-[10px] font-bold tracking-[0.2em] text-[var(--md-sys-color-on-surface-variant)]">
          드래그 → 놓기
        </span>
      </div>
      <div
        className="grid w-full gap-1.5 rounded-2xl bg-[var(--md-sys-color-surface-container-low)] p-2 sm:gap-2"
        style={{ gridTemplateColumns: `repeat(${N}, minmax(0, 1fr))` }}
      >
        {board.map((w, i) => (
          <BoardCell key={i} idx={i} word={w} cellFont={cellFont} />
        ))}
      </div>
    </section>
  );
}

// ---------------- BuildPanel — 드래그 가능한 단어 chip ----------------
function DraggableWord({
  id,
  word,
  cellFont,
}: {
  id: string;
  word: string;
  cellFont: (w: string) => string;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    touchAction: "none",
    opacity: isDragging ? 0.3 : 1,
  };
  return (
    <button
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      aria-label={`드래그 가능: ${word}`}
      className="flex aspect-square cursor-grab items-center justify-center overflow-hidden rounded-xl border-2 border-[var(--md-sys-color-outline-variant)] bg-white p-1.5 text-center transition hover:border-[var(--md-sys-color-primary)] active:cursor-grabbing"
    >
      <FitText
        text={word}
        className={`font-omu break-keep leading-tight ${cellFont(word)} text-[var(--md-sys-color-on-surface)]`}
      />
    </button>
  );
}

// ---------------- BuildPanel — 보드 셀(드롭 + 드래그) ----------------
function BoardCell({
  idx,
  word,
  cellFont,
}: {
  idx: number;
  word: string | null;
  cellFont: (w: string) => string;
}) {
  const { setNodeRef: dropRef, isOver } = useDroppable({ id: `cell:${idx}` });
  const draggable = useDraggable({
    id: word ? `cell:${idx}:${word}` : `cell:${idx}:__empty__`,
    disabled: !word,
  });
  const style: React.CSSProperties = {
    transform: word ? CSS.Translate.toString(draggable.transform) : undefined,
    touchAction: "none",
    opacity: draggable.isDragging ? 0.3 : 1,
  };
  // 단일 ref 에 droppable + draggable 동시 연결
  const setRef = (node: HTMLElement | null) => {
    dropRef(node);
    if (word) draggable.setNodeRef(node);
  };
  const dragProps = word
    ? { ...draggable.attributes, ...draggable.listeners }
    : {};
  return (
    <div
      ref={setRef}
      style={style}
      {...dragProps}
      aria-label={
        word
          ? `${idx + 1}번 칸 · ${word} (드래그로 이동)`
          : `${idx + 1}번 칸 · 빈 칸`
      }
      className={`relative flex aspect-square items-center justify-center overflow-hidden rounded-xl border-2 p-1 text-center transition ${
        word ? "cursor-grab bg-white active:cursor-grabbing" : "bg-white/60"
      } ${
        isOver
          ? "scale-[1.03] border-[var(--md-sys-color-primary)] ring-2 ring-[var(--md-sys-color-primary)]"
          : "border-[var(--md-sys-color-outline-variant)]"
      }`}
    >
      {word ? (
        <FitText
          text={word}
          className={`font-omu break-keep leading-tight ${cellFont(word)} text-[var(--md-sys-color-on-surface)]`}
        />
      ) : (
        <span className="text-2xl text-[var(--md-sys-color-on-surface-variant)] opacity-30">
          +
        </span>
      )}
    </div>
  );
}

// ---------------- Stage 빙고판 완성 후 대기 ----------------
function BuildWaitPanel({
  cid,
  game,
  uid,
  mySub,
}: {
  cid: string;
  game: Game;
  uid: string;
  mySub: GameSubmission;
}) {
  const [sandy, setSandy] = useState<object | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/Sandy%20Loading.json")
      .then((r) => r.json())
      .then((d) => alive && setSandy(d))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  const N = game.config.boardSize;
  return (
    <CenterCard wide>
      <div className="h-[min(32vh,280px)] w-[min(32vh,280px)] max-w-[76vw]">
        {sandy ? (
          <Lottie animationData={sandy} loop autoplay />
        ) : (
          <div className="h-full w-full animate-pulse rounded-full bg-[var(--md-sys-color-tertiary-container)]" />
        )}
      </div>
      <p className="text-sm font-bold tracking-[0.3em] text-[var(--md-sys-color-tertiary)]">
        빙고판 완성
      </p>
      <h1 className="text-3xl font-black sm:text-4xl">
        곧 게임을 시작해요!
      </h1>
      <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">
        선생님이 게임을 시작하면 단어 호명이 시작됩니다. 잠시 기다려요.
      </p>

      {/* 내 빙고판 미리보기 */}
      <div
        className="grid w-full gap-1"
        style={{
          gridTemplateColumns: `repeat(${N}, minmax(0, 1fr))`,
          maxWidth: `${Math.min(440, N * 85)}px`,
        }}
      >
        {mySub.board.map((w, i) =>
          w ? (
            <div
              key={i}
              className="flex aspect-square items-center justify-center overflow-hidden rounded-lg border border-[var(--md-sys-color-outline-variant)] bg-white p-1 text-center"
            >
              <FitText
                text={w}
                className="font-omu break-keep text-xs leading-tight text-[var(--md-sys-color-on-surface)]"
              />
            </div>
          ) : (
            <div
              key={i}
              className="flex aspect-square flex-col items-center justify-center overflow-hidden rounded-lg border border-[var(--md-sys-color-primary)] bg-[var(--md-sys-color-primary-container)] p-1 text-center text-[var(--md-sys-color-on-primary-container)]"
            >
              <Icon name="star" size={14} />
              <span className="text-[8px] font-black tracking-widest">FREE</span>
            </div>
          )
        )}
      </div>

      <button
        onClick={() => reopenBoard(cid, game.id, uid).catch(() => {})}
        className="mt-1 inline-flex items-center gap-1 text-xs text-[var(--md-sys-color-on-surface-variant)] underline-offset-2 hover:underline"
      >
        <Icon name="edit" size={12} />
        빙고판 다시 꾸미기
      </button>
    </CenterCard>
  );
}

// ---------------- Stage 플레이: 본인 보드 + 호출 단어 추적 ----------------
function PlayPanel({
  cid,
  game,
  uid,
  mySub,
}: {
  cid: string;
  game: Game;
  uid: string;
  mySub: GameSubmission;
}) {
  const N = game.config.boardSize;
  const board = mySub.board;
  const marked = useMemo(() => new Set(mySub.marked), [mySub.marked]);
  const calledSet = useMemo(
    () => new Set(game.turn.calledWords),
    [game.turn.calledWords]
  );
  const lastCalled = game.turn.calledWords[game.turn.calledWords.length - 1] ?? null;
  // 호출 취소(uncallWord)된 단어는 빙고 줄에서 즉시 빠지도록 "마크 ∩ 호출된 단어"만 유효 마크로 본다.
  const validMarked = useMemo(
    () => mySub.marked.filter((w) => calledSet.has(w)),
    [mySub.marked, calledSet]
  );
  const lineCells = useMemo(
    () => bingoLineCells(board, validMarked, N),
    [board, validMarked, N]
  );
  const myBingo = countBingoLines(board, validMarked, N);
  const target = game.config.bingoTarget;

  // 차례 회전 + 다음 학생 선택용 — 모든 학생 제출 구독
  const [allSubs, setAllSubs] = useState<GameSubmission[]>([]);
  useEffect(() => {
    return watchGameSubmissions(cid, game.id, setAllSubs);
  }, [cid, game.id]);

  // 친구 카드를 교사 콘솔의 학생 카드와 동일하게 — 멤버(프로필/이름) 로드
  const [members, setMembers] = useState<Member[]>([]);
  useEffect(() => {
    listMembers(cid).then(setMembers).catch(() => {});
  }, [cid]);
  const memberByUid = useMemo(() => {
    const m = new Map<string, Member>();
    members.forEach((x) => m.set(x.uid, x));
    return m;
  }, [members]);

  const isMyTurn = game.turn.currentUid === uid;

  // 친구들 빙고판 현황 (실루엣 — 단어는 숨기고 체크된 칸만)
  const [showFriends, setShowFriends] = useState(false); // 모바일 오버레이
  const [showPanel, setShowPanel] = useState(true); // 데스크톱 우측 상시 패널 토글
  const friends = useMemo(
    () => allSubs.filter((s) => s.uid !== uid && s.boardReady),
    [allSubs, uid]
  );

  // 새로 완료(호출)된 단어를 화면 중앙에 크게 강조 → 내 보드의 해당 칸 강조 → 사라짐.
  const [reveal, setReveal] = useState<{ word: string; key: number } | null>(
    null
  );
  const lastSeenCall = useRef<string | null | undefined>(undefined);
  const revealSeq = useRef(0);
  const revealTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const lc =
      game.turn.calledWords[game.turn.calledWords.length - 1] ?? null;
    if (lastSeenCall.current === undefined) {
      lastSeenCall.current = lc; // 첫 마운트 — 기존 단어는 연출하지 않음
      return;
    }
    if (lc && lc !== lastSeenCall.current) {
      lastSeenCall.current = lc;
      revealSeq.current += 1;
      setReveal({ word: lc, key: revealSeq.current });
      if (revealTimer.current) clearTimeout(revealTimer.current);
      revealTimer.current = setTimeout(() => setReveal(null), 1900);
    } else {
      lastSeenCall.current = lc;
    }
  }, [game.turn.calledWords]);
  useEffect(
    () => () => {
      if (revealTimer.current) clearTimeout(revealTimer.current);
    },
    []
  );

  // 자동 마크는 ClassLive(스테이지 닫혀도 상주)가 담당 — 여기선 표시만.

  // 셀 폰트 — N 클수록 작게, 단어 길이 적응
  function cellFont(word: string): string {
    const len = [...word].length;
    if (N <= 3) {
      if (len <= 2) return "text-3xl sm:text-4xl";
      if (len <= 4) return "text-2xl sm:text-3xl";
      return "text-xl sm:text-2xl";
    }
    if (N === 4) {
      if (len <= 2) return "text-2xl sm:text-3xl";
      if (len <= 4) return "text-xl sm:text-2xl";
      return "text-base sm:text-lg";
    }
    if (N === 5) {
      if (len <= 2) return "text-xl sm:text-2xl";
      if (len <= 4) return "text-base sm:text-xl";
      return "text-sm sm:text-base";
    }
    if (len <= 2) return "text-base sm:text-lg";
    if (len <= 4) return "text-sm sm:text-base";
    return "text-xs sm:text-sm";
  }

  return (
    <div className="flex w-full max-w-7xl items-start justify-center gap-4">
      <div className="flex min-w-0 flex-1 justify-center">
    <CenterCard xwide>
      {/* 상단 — 방금 호출 + 내 빙고 진행률 */}
      <div className="flex w-full flex-wrap items-center gap-3 rounded-2xl bg-[var(--md-sys-color-primary-container)] p-4 text-[var(--md-sys-color-on-primary-container)]">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--md-sys-color-primary)] text-white">
          <Icon name="campaign" size={26} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col text-left">
          <p className="text-[10px] font-bold tracking-[0.25em] opacity-80">
            방금 완료
          </p>
          {lastCalled ? (
            <p className="font-omu break-keep text-3xl font-black leading-tight sm:text-4xl">
              {lastCalled}
            </p>
          ) : (
            <p className="text-base font-bold opacity-70">
              곧 첫 단어가 나와요
            </p>
          )}
        </div>
        <div className="flex flex-col items-end leading-tight">
          <span className="text-[10px] font-bold tracking-widest opacity-80">
            내 빙고
          </span>
          <span className="text-2xl font-black tabular-nums">
            {myBingo} / {target}
          </span>
        </div>
        {/* 모바일에서만 토글(데스크톱은 우측 상시 패널) */}
        {friends.length > 0 && (
          <button
            onClick={() => setShowFriends(true)}
            className="flex shrink-0 items-center gap-1.5 rounded-full bg-[var(--md-sys-color-primary)] px-3 py-2 text-sm font-bold text-[var(--md-sys-color-on-primary)] transition hover:scale-105 lg:hidden"
            title="친구들 빙고판 현황 보기"
          >
            <Icon name="groups" size={18} />
            친구 현황
          </button>
        )}
      </div>

      {/* 본인 빙고판 — N×N 전체가 한 화면에 보이도록 뷰포트에 맞춘 정사각형으로 제한.
          데스크톱: 높이(vh) 기준, 모바일: 폭(100%) 기준. */}
      <div
        role="grid"
        aria-label={`내 ${N}×${N} 빙고판`}
        className="mx-auto grid w-full gap-1.5 sm:gap-2"
        style={{
          gridTemplateColumns: `repeat(${N}, minmax(0, 1fr))`,
          maxWidth: "min(100%, 56vh)",
        }}
      >
        {board.map((w, i) => {
          const isMarked = !!w && marked.has(w);
          const isCalled = !!w && calledSet.has(w);
          const inLine = lineCells.has(i);
          const isFree = !w; // 빈칸 = FREE(자동 완성)
          const isRevealing = !!w && reveal?.word === w; // 방금 완료된 단어 강조
          return (
            <div
              key={i}
              role="gridcell"
              aria-label={
                isFree
                  ? "자동 완성 칸 (FREE)"
                  : `${w}${isMarked || isCalled ? " · 완료됨" : ""}`
              }
              className={`relative flex aspect-square items-center justify-center overflow-hidden rounded-2xl border-2 p-2 text-center transition ${
                inLine
                  ? "border-[var(--md-sys-color-tertiary)] ring-2 ring-[var(--md-sys-color-tertiary)]"
                  : isFree
                    ? "border-[var(--md-sys-color-primary)]"
                    : isMarked
                      ? "border-[var(--md-sys-color-primary)]"
                      : isCalled
                        ? "border-[var(--md-sys-color-primary)] animate-pulse"
                        : "border-[var(--md-sys-color-outline-variant)]"
              } ${
                isRevealing
                  ? "bingo-cell-pop !border-[var(--md-sys-color-primary)] ring-4 ring-[var(--md-sys-color-primary)]"
                  : ""
              }`}
              style={{
                backgroundColor: inLine
                  ? "color-mix(in srgb, var(--md-sys-color-tertiary) 22%, white)"
                  : isFree
                    ? "var(--md-sys-color-primary-container)"
                    : isMarked
                      ? "var(--md-sys-color-primary-container)"
                      : isCalled
                        ? "color-mix(in srgb, var(--md-sys-color-primary) 12%, white)"
                        : "white",
              }}
              title={
                isFree
                  ? "FREE · 자동 완성 칸"
                  : !isCalled
                    ? "아직 안 나온 단어"
                    : "완료된 단어"
              }
            >
              {w ? (
                <>
                  <FitText
                    text={w}
                    className={`font-omu break-keep leading-tight ${cellFont(w)} ${
                      isMarked
                        ? "text-[var(--md-sys-color-on-primary-container)]"
                        : "text-[var(--md-sys-color-on-surface)]"
                    }`}
                  />
                  {isMarked && (
                    <span className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--md-sys-color-primary)] text-white">
                      <Icon name="check" size={14} />
                    </span>
                  )}
                </>
              ) : (
                <span className="flex flex-col items-center justify-center leading-none text-[var(--md-sys-color-on-primary-container)]">
                  <Icon name="star" size={N <= 4 ? 22 : 16} />
                  <span className="mt-0.5 text-[9px] font-black tracking-widest">
                    FREE
                  </span>
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* 호출 이력 — 작게, 최근부터 */}
      {game.turn.calledWords.length > 1 && (
        <div className="w-full text-left">
          <p className="mb-1 text-[10px] font-bold tracking-[0.2em] text-[var(--md-sys-color-on-surface-variant)]">
            완료한 단어 ({game.turn.calledWords.length})
          </p>
          <div className="flex flex-wrap gap-1">
            {[...game.turn.calledWords].reverse().slice(1).map((w) => {
              const onBoard = board.includes(w);
              return (
                <span
                  key={w}
                  className={`font-omu break-keep rounded-full px-2 py-0.5 text-xs ${
                    onBoard
                      ? "bg-[var(--md-sys-color-surface-container-high)] font-bold text-[var(--md-sys-color-on-surface)]"
                      : "bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface-variant)]"
                  }`}
                >
                  {w}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* 내 차례 — 풀스크린 오버레이 (가장 위) */}
      {isMyTurn && (
        <MyTurnOverlay
          cid={cid}
          game={game}
          uid={uid}
          mySub={mySub}
          allSubs={allSubs}
          memberByUid={memberByUid}
        />
      )}

      {/* 방금 완료된 단어 — 화면 중앙에 크게 강조(모든 학생). 보드의 해당 칸은 bingo-cell-pop 으로 동시 강조 */}
      {reveal &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="pointer-events-none fixed inset-0 z-[80] flex items-center justify-center px-6"
            aria-hidden
          >
            <div
              key={reveal.key}
              className="bingo-reveal flex flex-col items-center gap-3"
            >
              <span className="rounded-full bg-[var(--md-sys-color-primary)] px-4 py-1.5 text-sm font-extrabold tracking-[0.3em] text-[var(--md-sys-color-on-primary)] shadow-lg">
                방금 완료!
              </span>
              <span className="font-omu break-keep rounded-[2.5rem] bg-white px-12 py-8 text-6xl font-black text-[var(--md-sys-color-primary)] shadow-2xl sm:text-8xl">
                {reveal.word}
              </span>
            </div>
          </div>,
          document.body
        )}

      {/* 친구들 빙고판 현황 사이드바 — 단어는 숨기고 체크된 칸만 실루엣으로 */}
      {showFriends &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[90] flex justify-end bg-black/30"
            onClick={() => setShowFriends(false)}
          >
            <aside
              className="flex h-full w-[min(92vw,420px)] flex-col bg-[var(--md-sys-color-surface)] shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <header className="flex items-center justify-between gap-2 border-b border-[var(--md-sys-color-outline-variant)] px-4 py-3">
                <h2 className="flex items-center gap-2 text-lg font-extrabold text-[var(--md-sys-color-on-surface)]">
                  <Icon name="groups" size={22} />
                  친구들 현황
                </h2>
                <button
                  onClick={() => setShowFriends(false)}
                  className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--md-sys-color-on-surface-variant)] hover:bg-black/5"
                  aria-label="닫기"
                >
                  <Icon name="close" size={22} />
                </button>
              </header>
              <p className="px-4 pt-2 text-xs text-[var(--md-sys-color-on-surface-variant)]">
                색칠된 칸 = 체크 완료 · 단어는 보이지 않아요
              </p>
              <div className="grid min-h-0 flex-1 grid-cols-2 gap-3 overflow-y-auto p-4">
                {friends.map((s) => {
                  const m = memberByUid.get(s.uid);
                  const fname = m?.displayName || s.name || "친구";
                  const fb = countBingoLines(
                    s.board,
                    s.marked.filter((w) => calledSet.has(w)),
                    N
                  );
                  return (
                    <div
                      key={s.uid}
                      className="flex flex-col gap-2 rounded-2xl border-2 border-[var(--md-sys-color-outline-variant)] bg-white p-2.5"
                    >
                      <div className="flex items-center gap-1.5">
                        <Avatar m={m} name={fname} size={24} />
                        <span className="line-clamp-1 flex-1 text-xs font-bold text-[var(--md-sys-color-on-surface)]">
                          {fname}
                        </span>
                        <span className="shrink-0 rounded-full bg-[var(--md-sys-color-surface-container-high)] px-1.5 py-0.5 text-[10px] font-extrabold text-[var(--md-sys-color-on-surface)]">
                          {s.status === "done" ? "완성" : `${fb}줄`}
                        </span>
                      </div>
                      <MiniBoard
                        board={s.board}
                        marked={s.marked}
                        N={N}
                        called={calledSet}
                      />
                    </div>
                  );
                })}
              </div>
            </aside>
          </div>,
          document.body
        )}
    </CenterCard>
      </div>

      {/* 우측 상시 사이드 패널 (데스크톱) — 친구 빙고 실루엣, 좌우 슬라이드 + 토글 */}
      {friends.length > 0 && showPanel && (
        <aside className="hidden w-[clamp(260px,30vw,460px)] shrink-0 flex-col gap-2 self-stretch rounded-3xl bg-white/85 p-3 shadow-sm backdrop-blur-sm lg:flex">
          <div className="flex items-center justify-between gap-2 px-1">
            <h3 className="flex items-center gap-1.5 text-sm font-extrabold text-[var(--md-sys-color-on-surface)]">
              <Icon name="groups" size={18} />
              친구들 현황
              <span className="text-xs font-bold text-[var(--md-sys-color-on-surface-variant)]">
                {friends.length}명
              </span>
            </h3>
            <button
              onClick={() => setShowPanel(false)}
              className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--md-sys-color-on-surface-variant)] hover:bg-black/5"
              title="패널 접기"
              aria-label="패널 접기"
            >
              <Icon name="chevron_right" size={20} />
            </button>
          </div>
          <p className="px-1 text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
            진한 칸 = 체크 완료 · 단어 숨김 · ← 좌우로 넘겨보기 →
          </p>
          {/* 2행 가로 스크롤 — 학생이 많아도 좌우로 슬라이드 */}
          <div className="grid auto-cols-[108px] grid-flow-col grid-rows-2 gap-2 overflow-x-auto pb-1">
            {friends.map((s) => {
              const m = memberByUid.get(s.uid);
              const fname = m?.displayName || s.name || "친구";
              const fb = countBingoLines(
                s.board,
                s.marked.filter((w) => calledSet.has(w)),
                N
              );
              return (
                <div
                  key={s.uid}
                  className="flex w-[108px] flex-col gap-1 rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-white p-1.5"
                >
                  <div className="flex items-center gap-1">
                    <Avatar m={m} name={fname} size={18} />
                    <span className="line-clamp-1 flex-1 text-[10px] font-bold text-[var(--md-sys-color-on-surface)]">
                      {fname}
                    </span>
                  </div>
                  <MiniBoard
                    board={s.board}
                    marked={s.marked}
                    N={N}
                    called={calledSet}
                  />
                  <span className="text-center text-[9px] font-bold text-[var(--md-sys-color-on-surface-variant)]">
                    {s.status === "done" ? "완성" : `${fb}줄`}
                  </span>
                </div>
              );
            })}
          </div>
        </aside>
      )}
      {/* 접힌 상태 — 다시 펴는 세로 탭 */}
      {friends.length > 0 && !showPanel && (
        <button
          onClick={() => setShowPanel(true)}
          className="hidden shrink-0 items-center gap-1 self-stretch rounded-2xl bg-white/70 px-1.5 text-xs font-bold text-[var(--md-sys-color-on-surface-variant)] shadow-sm hover:bg-white lg:flex"
          style={{ writingMode: "vertical-rl" }}
          title="친구 현황 펴기"
        >
          <Icon name="groups" size={16} />
          친구 현황
        </button>
      )}
    </div>
  );
}

// ---------------- 내 차례 오버레이: 단어 선택(+ pick 모드: 다음 학생 선택) ----------------
function MyTurnOverlay({
  cid,
  game,
  uid,
  mySub,
  allSubs,
  memberByUid,
}: {
  cid: string;
  game: Game;
  uid: string;
  mySub: GameSubmission;
  allSubs: GameSubmission[];
  memberByUid: Map<string, Member>;
}) {
  const orderMode = game.config.order; // "random" | "pick"
  const N = game.config.boardSize;
  const board = mySub.board;
  const calledSet = useMemo(
    () => new Set(game.turn.calledWords),
    [game.turn.calledWords]
  );
  // 빙고는 "내 빙고판에 있는 단어"를 호출한다 — 전체 후보 풀이 아니라 본인 보드 기준.
  const myUncalled = useMemo(
    () =>
      board.filter((w): w is string => !!w && !calledSet.has(w)),
    [board, calledSet]
  );

  // pick 모드용: 다음 차례 후보 학생 (이번 라운드 아직 차례 안 본 + 본인 제외 + done 아님)
  const historySet = useMemo(
    () => new Set([...game.turn.history, uid]),
    [game.turn.history, uid]
  );
  // 나(uid) 제외, 보드 완료 + 미완료(done 아님)인 다른 학생들
  const otherActive = useMemo(
    () =>
      allSubs.filter(
        (s) => s.uid !== uid && s.boardReady && s.status !== "done"
      ),
    [allSubs, uid]
  );
  // 이번 라운드에 아직 차례를 안 가진 친구들
  const nextCallerCandidates = useMemo(
    () => otherActive.filter((s) => !historySet.has(s.uid)),
    [otherActive, historySet]
  );
  // allSubs(친구 목록)가 아직 로드되기 전이면 roundEnding 을 단정하지 않는다.
  // (caller 본인이 allSubs 에 있으므로 length>0 = 로드됨)
  const subsReady = allSubs.length > 0;
  const roundEnding = subsReady && nextCallerCandidates.length === 0;
  // 다음 차례로 고를 친구: 라운드 중=아직 안 한 친구 / 라운드 끝=다음 라운드 전체(본인 제외).
  const pickPool = roundEnding ? otherActive : nextCallerCandidates;

  const [pickedWord, setPickedWord] = useState<string | null>(null);
  const [pickedNextUid, setPickedNextUid] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // pick 모드 + 고를 친구가 있을 때만 다음 친구 선택 단계 (라운드 끝에서도 다음 첫 친구를 고름)
  const needsNextPick = orderMode === "pick" && pickPool.length > 0;
  // subsReady 전에는 호출 금지 — 빈 subs 로 호출하면 회전이 정체된다(random 모드 포함).
  const canCall =
    subsReady && !!pickedWord && (!needsNextPick || !!pickedNextUid) && !busy;

  // 축하 lottie
  const [lottie, setLottie] = useState<object | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/Sparkles%20Loop%20Loader%20ai.json")
      .then((r) => r.json())
      .then((d) => alive && setLottie(d))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  async function doCall() {
    if (!canCall || !pickedWord) return;
    setBusy(true);
    setErr("");
    try {
      await studentCall(
        cid,
        game.id,
        uid,
        pickedWord,
        needsNextPick ? pickedNextUid : null,
        allSubs
      );
      // 성공 → 보통은 차례가 넘어가 오버레이가 사라진다. 단, 소규모 게임에서 라운드가
      // 리셋되며 다시 내 차례가 될 수 있으므로 선택/busy 를 초기화해 다시 조작 가능하게.
      setPickedWord(null);
      setPickedNextUid(null);
      setBusy(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "완료 실패");
      setBusy(false);
    }
  }

  // 전체 페이지로 띄우기 위해 body 로 포털(부모의 transform 에 갇히지 않도록).
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="내 차례"
      className="fixed inset-0 z-[95] flex flex-col items-center overflow-y-auto bg-[var(--md-sys-color-primary)] px-4 py-6"
    >
      {/* 축하 헤더 */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex h-[28vh] items-start justify-center">
        {lottie && (
          <div className="h-[26vh] w-[26vh] max-w-[80vw] opacity-90">
            <Lottie animationData={lottie} loop autoplay />
          </div>
        )}
      </div>

      <div className="relative flex w-full max-w-6xl flex-col items-center gap-4 text-center text-[var(--md-sys-color-on-primary)]">
        <p className="text-sm font-extrabold tracking-[0.4em] opacity-80">
          내 차례
        </p>
        <h1 className="text-4xl font-black leading-none sm:text-5xl">
          단어를 골라요!
        </h1>
        <p className="text-base font-bold opacity-90 sm:text-lg">
          {!needsNextPick
            ? "단어를 골라 완료하면 다음 차례로 넘어가요"
            : roundEnding
              ? "이번 라운드의 마지막 차례 · 단어를 고르고 다음 라운드 첫 친구를 선택해주세요"
              : "단어를 고르고 다음 친구를 선택해주세요"}
        </p>

        {err && (
          <p className="w-full rounded-xl bg-[var(--md-sys-color-error)] px-3 py-2 text-sm font-bold text-white">
            {err}
          </p>
        )}

        {/* 좌: 내 빙고판 / 우: 다음 친구 선택 — pick 모드에서 2단 레이아웃 */}
        <div
          className={`grid w-full items-start gap-4 ${
            needsNextPick ? "lg:grid-cols-[1.4fr_1fr]" : ""
          }`}
        >
        {/* STEP 1: 내 빙고판에서 호출할 단어 선택 (빙고는 자기 보드의 단어를 부른다) */}
        <section className="w-full rounded-3xl bg-white/95 p-4 text-[var(--md-sys-color-on-surface)] shadow-2xl sm:p-5">
          <h2 className="mb-2 text-left text-sm font-extrabold">
            ① 내 빙고판에서 완료할 단어를 골라요
            <span className="ml-2 text-xs font-bold text-[var(--md-sys-color-on-surface-variant)]">
              · 이미 완료된 칸은 선택할 수 없어요
            </span>
          </h2>
          {myUncalled.length === 0 ? (
            <p className="rounded-xl bg-[var(--md-sys-color-surface-container-high)] p-4 text-center text-sm">
              내 빙고판의 단어가 모두 완료됐어요. 선생님을 기다려요.
            </p>
          ) : (
            <div
              className="mx-auto grid gap-2"
              style={{
                gridTemplateColumns: `repeat(${N}, minmax(0, 1fr))`,
                maxWidth: "min(100%, 46vh)",
              }}
            >
              {board.map((w, i) => {
                const isFree = !w;
                const isCalled = !!w && calledSet.has(w);
                const selectable = !!w && !isCalled;
                const on = selectable && pickedWord === w;
                return (
                  <button
                    key={i}
                    disabled={!selectable}
                    onClick={() => selectable && setPickedWord(w)}
                    aria-pressed={on}
                    aria-label={
                      isFree
                        ? "FREE 칸"
                        : `${w}${isCalled ? " · 이미 완료됨" : ""}`
                    }
                    className={`relative flex aspect-square items-center justify-center overflow-hidden rounded-2xl border-2 p-1.5 text-center transition disabled:cursor-not-allowed ${
                      on
                        ? "border-[var(--md-sys-color-primary)] bg-[var(--md-sys-color-primary-container)] ring-2 ring-[var(--md-sys-color-primary)]"
                        : isCalled
                          ? "border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-high)] opacity-50"
                          : isFree
                            ? "border-[var(--md-sys-color-primary)] bg-[var(--md-sys-color-primary-container)] opacity-70"
                            : "border-[var(--md-sys-color-outline-variant)] bg-white hover:border-[var(--md-sys-color-primary)]"
                    }`}
                  >
                    {isFree ? (
                      <span className="flex flex-col items-center leading-none text-[var(--md-sys-color-on-primary-container)]">
                        <Icon name="star" size={N <= 4 ? 18 : 14} />
                        <span className="mt-0.5 text-[8px] font-black tracking-widest">
                          FREE
                        </span>
                      </span>
                    ) : (
                      <FitText
                        text={w}
                        className={`font-omu break-keep leading-tight ${wordFontClass(w)}`}
                      />
                    )}
                    {isCalled && !isFree && (
                      <span className="absolute right-1 top-1 inline-flex items-center rounded-full bg-[var(--md-sys-color-outline)] px-1.5 py-0.5 text-[8px] font-bold text-white">
                        완료
                      </span>
                    )}
                    {on && (
                      <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--md-sys-color-primary)] text-white">
                        <Icon name="check" size={12} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* STEP 2: 다음 친구 선택 (pick 모드). 라운드 끝이면 다음 라운드 첫 친구 */}
        {needsNextPick && (
          <section className="w-full rounded-3xl bg-white/95 p-4 text-[var(--md-sys-color-on-surface)] shadow-2xl sm:p-5">
            <h2 className="mb-2 text-left text-sm font-extrabold">
              ② {roundEnding ? "다음 라운드 첫 친구 선택" : "다음 친구 선택"}
              <span className="ml-2 text-xs font-bold text-[var(--md-sys-color-on-surface-variant)]">
                {roundEnding
                  ? "· 새 라운드를 시작할 친구를 골라요"
                  : "· 이미 차례를 가진 친구는 비활성화"}
              </span>
            </h2>
            {!subsReady ? (
              <p className="rounded-xl bg-[var(--md-sys-color-surface-container-high)] p-4 text-center text-sm text-[var(--md-sys-color-on-surface-variant)]">
                친구 목록을 불러오는 중…
              </p>
            ) : (
            <div className="grid max-h-[46vh] grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3">
              {allSubs
                .filter((s) => s.uid !== uid && s.boardReady)
                .map((s) => {
                  const m = memberByUid.get(s.uid);
                  const displayName = m?.displayName || s.name || "이름없음";
                  // 라운드 끝이면 history 가 리셋되므로 아무도 "끝난 차례"가 아니다.
                  const taken = !roundEnding && historySet.has(s.uid);
                  const isDone = s.status === "done";
                  const disabled = taken || isDone;
                  const on = pickedNextUid === s.uid;
                  return (
                    <button
                      key={s.uid}
                      onClick={() => !disabled && setPickedNextUid(s.uid)}
                      disabled={disabled}
                      aria-pressed={on}
                      aria-label={displayName}
                      className={`relative flex flex-col items-center gap-2 overflow-hidden rounded-3xl border-2 p-4 text-center transition disabled:opacity-30 ${
                        on
                          ? "border-[var(--md-sys-color-primary)] bg-[var(--md-sys-color-primary-container)]"
                          : "border-[var(--md-sys-color-outline-variant)] bg-white hover:border-[var(--md-sys-color-primary)]"
                      }`}
                    >
                      <Avatar m={m} name={displayName} size={56} />
                      <span className="line-clamp-1 w-full text-sm font-bold">
                        {displayName}
                      </span>
                      {isDone ? (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-[var(--md-sys-color-tertiary-container)] px-2 py-0.5 text-[10px] font-bold text-[var(--md-sys-color-on-tertiary-container)]">
                          <Icon name="check_circle" size={10} />
                          완료
                        </span>
                      ) : taken ? (
                        <span className="rounded-full bg-[var(--md-sys-color-surface-container-high)] px-2 py-0.5 text-[10px] font-bold text-[var(--md-sys-color-on-surface-variant)]">
                          끝난 차례
                        </span>
                      ) : (
                        <span className="rounded-full bg-[var(--md-sys-color-surface-container)] px-2 py-0.5 text-[10px] font-bold text-[var(--md-sys-color-on-surface-variant)]">
                          선택 가능
                        </span>
                      )}
                      {on && (
                        <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--md-sys-color-primary)] text-white">
                          <Icon name="check" size={14} />
                        </span>
                      )}
                    </button>
                  );
                })}
            </div>
            )}
          </section>
        )}
        </div>

        {/* 호출 버튼 */}
        <button
          onClick={doCall}
          disabled={!canCall}
          className="mt-1 inline-flex min-w-[280px] items-center justify-center gap-2 rounded-full bg-white px-12 py-5 text-3xl font-black text-[var(--md-sys-color-primary)] shadow-2xl transition hover:scale-[1.03] disabled:opacity-50"
        >
          <Icon name={busy ? "progress_activity" : "campaign"} size={30} />
          {busy ? "완료 중…" : "완료!"}
        </button>
      </div>
    </div>,
    document.body
  );
}

// ---------------- Stage 플레이 완료: 결과 + 축하 ----------------
function PlayDonePanel({
  game,
  uid,
  mySub,
}: {
  game: Game;
  uid: string;
  mySub: GameSubmission;
}) {
  const [lottie, setLottie] = useState<object | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/Confetti.json")
      .then((r) => r.json())
      .then((d) => alive && setLottie(d))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  const myRank = game.ranks.find((r) => r.uid === uid);
  return (
    <CenterCard wide>
      <div className="h-[min(36vh,320px)] w-[min(36vh,320px)] max-w-[78vw]">
        {lottie ? (
          <Lottie animationData={lottie} loop autoplay />
        ) : (
          <div className="h-full w-full animate-pulse rounded-full bg-[var(--md-sys-color-tertiary-container)]" />
        )}
      </div>
      <p className="text-sm font-bold tracking-[0.3em] text-[var(--md-sys-color-tertiary)]">
        빙고 완성!
      </p>
      {myRank ? (
        <h1 className="text-6xl font-black leading-none text-[var(--md-sys-color-primary)]">
          {myRank.rank}등
        </h1>
      ) : (
        <p className="rounded-full bg-[var(--md-sys-color-tertiary-container)] px-3 py-1 text-xs font-bold text-[var(--md-sys-color-on-tertiary-container)]">
          순위 인원(상한)을 넘겨 등수에는 못 들었지만 빙고를 완성했어요
        </p>
      )}
      <h1 className="text-4xl font-black sm:text-5xl">축하해요!</h1>
      <p className="rounded-2xl bg-[var(--md-sys-color-primary-container)] px-4 py-2 text-sm font-bold text-[var(--md-sys-color-on-primary-container)]">
        {mySub.bingo}줄 빙고 · {mySub.marked.length}칸 마크
        {myRank ? ` · ${myRank.doneAtTurn}번째에 완성` : ""}
      </p>
      <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">
        다른 친구들의 게임이 끝날 때까지 조금만 기다려 주세요.
      </p>
    </CenterCard>
  );
}

// ---------------- 최종 결과 (게임 종료 후 학생 공통 화면) ----------------
function ResultPanel({
  cid,
  game,
  uid,
}: {
  cid: string;
  game: Game;
  uid: string;
}) {
  const [allSubs, setAllSubs] = useState<GameSubmission[]>([]);
  useEffect(
    () => watchGameSubmissions(cid, game.id, setAllSubs),
    [cid, game.id]
  );
  const nameOf = useCallback(
    (u: string) => allSubs.find((s) => s.uid === u)?.name ?? "친구",
    [allSubs]
  );
  const myRank = game.ranks.find((r) => r.uid === uid);
  return (
    <CenterCard wide>
      {myRank ? (
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-5xl font-black leading-none text-[var(--md-sys-color-primary)]">
            {myRank.rank}등
          </span>
          <p className="text-xl font-bold text-[var(--md-sys-color-on-surface-variant)]">
            완성했어요!
          </p>
        </div>
      ) : (
        <p className="text-xl font-extrabold text-[var(--md-sys-color-on-surface-variant)]">
          게임이 끝났어요!
        </p>
      )}
      <GameResults game={game} subs={allSubs} nameOf={nameOf} myUid={uid} />
      <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
        선생님이 게임을 닫으면 이 화면이 사라져요.
      </p>
    </CenterCard>
  );
}

// ---------------- 로비: 참여 완료, 교사 시작 대기 ----------------
function LobbyPanel() {
  const [lottie, setLottie] = useState<object | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/Cute%20Mascot%20Jumping%20Character.json")
      .then((r) => r.json())
      .then((d) => alive && setLottie(d))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <div className="h-[min(50vh,480px)] w-[min(50vh,480px)] max-w-[84vw]">
        {lottie ? (
          <Lottie animationData={lottie} loop autoplay />
        ) : (
          <div className="h-full w-full animate-pulse rounded-full bg-white/30" />
        )}
      </div>
      <p className="text-base font-extrabold tracking-[0.3em] text-[var(--md-sys-color-on-tertiary-container)]">
        참여 완료
      </p>
      <h1
        className="text-6xl font-black text-[var(--md-sys-color-on-primary-container)] sm:text-7xl"
        style={{ textShadow: "0 2px 16px rgba(0,0,0,0.08)" }}
      >
        선생님이 곧 시작해요!
      </h1>
      <p className="max-w-[560px] rounded-full bg-white/85 px-5 py-2.5 text-base font-semibold text-[var(--md-sys-color-on-surface)] shadow-sm backdrop-blur-sm sm:text-lg">
        다른 친구들이 모두 모이면 선생님이 시작 버튼을 누를 거예요
      </p>
    </div>
  );
}

// ---------------- 관전 (빙고판 미완성/늦은 합류) ----------------
function SpectatePanel({ game }: { game: Game }) {
  return (
    <CenterCard wide>
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)]">
        <Icon name="visibility" size={32} />
      </span>
      <h1 className="text-3xl font-black sm:text-4xl">이번 판은 관전이에요</h1>
      <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">
        빙고판을 완성하지 못했거나 게임이 이미 시작된 뒤 들어왔어요.
        <br />
        다음 게임에는 처음부터 함께해요!
      </p>
      {game.turn.calledWords.length > 0 && (
        <p className="rounded-2xl bg-[var(--md-sys-color-primary-container)] px-4 py-2 text-sm font-bold text-[var(--md-sys-color-on-primary-container)]">
          지금까지 {game.turn.calledWords.length}개 단어가 나왔어요
        </p>
      )}
    </CenterCard>
  );
}

// ---------------- 단계 사이 대기 (later) ----------------
function LaterPanel() {
  const [lottie, setLottie] = useState<object | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/Cute%20Mascot%20Jumping%20Character.json")
      .then((r) => r.json())
      .then((d) => alive && setLottie(d))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <div className="h-[min(48vh,440px)] w-[min(48vh,440px)] max-w-[82vw]">
        {lottie ? (
          <Lottie animationData={lottie} loop autoplay />
        ) : (
          <div className="h-full w-full animate-pulse rounded-full bg-white/30" />
        )}
      </div>
      <p className="text-base font-extrabold tracking-[0.3em] text-[var(--md-sys-color-on-tertiary-container)]">
        잠깐만 기다려요
      </p>
      <h1
        className="text-6xl font-black text-[var(--md-sys-color-on-primary-container)] sm:text-7xl"
        style={{ textShadow: "0 2px 16px rgba(0,0,0,0.08)" }}
      >
        곧 시작돼요!
      </h1>
      <p className="max-w-[520px] rounded-full bg-white/85 px-4 py-2 text-base font-semibold text-[var(--md-sys-color-on-surface)] shadow-sm backdrop-blur-sm sm:text-lg">
        선생님이 다음 단계로 안내해 주실 거예요
      </p>
    </div>
  );
}

// 단어 길이 기반 폰트 클래스 — 카드(aspect-square) 내에서 잘리지 않도록.
function wordFontClass(word: string): string {
  const len = [...word].length; // 한글 코드 포인트 단위
  if (len <= 1) return "text-4xl sm:text-5xl";
  if (len <= 2) return "text-3xl sm:text-4xl";
  if (len <= 3) return "text-2xl sm:text-3xl";
  if (len <= 4) return "text-xl sm:text-2xl";
  if (len <= 5) return "text-lg sm:text-xl";
  return "text-base sm:text-lg";
}

// ---------------- 공용 카드 ----------------
function CenterCard({
  children,
  wide,
  xwide,
}: {
  children: React.ReactNode;
  wide?: boolean;
  /** 학생 SelectPanel/BuildPanel — 후보가 많을 때 페이지 폭을 거의 다 씀 */
  xwide?: boolean;
}) {
  // 페이지 섹션 톤 — 모달 카드 느낌(짙은 그림자/두꺼운 흰 배경) 제거
  // 표면을 살짝만 띄워 가독성은 살리고 페이지의 일부처럼 보이도록.
  const maxW = xwide ? "max-w-6xl" : wide ? "max-w-4xl" : "max-w-2xl";
  return (
    <div
      className={`flex w-full ${maxW} flex-col items-center gap-3 rounded-[2rem] bg-white/90 p-6 text-center shadow-sm backdrop-blur-sm animate-float-in sm:p-8`}
    >
      {children}
    </div>
  );
}
