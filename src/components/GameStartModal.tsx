"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { listLessons, type Lesson } from "@/lib/lessons";
import { listProjects, type Project } from "@/lib/projects";
import {
  createGame,
  type BoardSize,
  type GameConfig,
  type GameLink,
  type GameOrder,
} from "@/lib/games";

/**
 * 학급 게임 시작 모달 — 개념 빙고
 * 1) 연결 대상(프로젝트/차시) 선택 = 클래스HDD 스타일 트리
 * 2) 게임 설정(보드 크기·단어 수·빙고 목표·차례 방식·인원 상한)
 * 3) 게임 시작 → createGame 으로 활성 게임 등록
 */
export function GameStartModal({
  cid,
  by,
  onClose,
  onStarted,
}: {
  cid: string;
  by: string;
  onClose: () => void;
  onStarted: (gameId: string) => void;
}) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [pick, setPick] = useState<GameLink | null>(null);
  const [openProjId, setOpenProjId] = useState<string | null>(null);

  // 설정
  const [boardSize, setBoardSize] = useState<BoardSize>(5);
  const [wordsPerStudent, setWordsPerStudent] = useState<number>(5);
  const [bingoTarget, setBingoTarget] = useState<number>(1);
  const [order, setOrder] = useState<GameOrder>("random");
  // 게임 종료 시점: "all"=전원 완성 / "count"=N명 완성 시 (endN, 1=1등 나오면)
  const [endMode, setEndMode] = useState<"all" | "count">("all");
  const [endN, setEndN] = useState<number>(1);
  const [allowMeaning, setAllowMeaning] = useState<boolean>(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const titleId = useId();

  // Esc 키로 닫기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    let alive = true;
    Promise.all([listProjects(cid), listLessons(cid)])
      .then(([ps, ls]) => {
        if (!alive) return;
        setProjects(ps);
        setLessons(ls);
        setLoading(false);
      })
      .catch(() => setLoading(false));
    return () => {
      alive = false;
    };
  }, [cid]);

  // 프로젝트별 차시 그룹
  const lessonsByProject = useMemo(() => {
    const m: Record<string, Lesson[]> = { __none__: [] };
    for (const l of lessons) {
      const k =
        (l as Lesson & { projectId?: string }).projectId || "__none__";
      (m[k] ??= []).push(l);
    }
    return m;
  }, [lessons]);

  async function start() {
    if (!pick) {
      setErr("연결할 프로젝트 또는 차시를 선택해 주세요.");
      return;
    }
    setErr("");
    setBusy(true);
    try {
      const cfg: GameConfig = {
        boardSize,
        wordsPerStudent: Math.max(1, Math.floor(wordsPerStudent)),
        bingoTarget: Math.max(1, Math.floor(bingoTarget)),
        order,
        allowMeaning,
        endWinners: endMode === "all" ? 0 : Math.max(1, Math.floor(endN)),
      };
      const gid = await createGame(cid, by, pick, cfg);
      onStarted(gid);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "게임 시작에 실패했습니다.");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--md-sys-color-scrim)]/40 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex h-[88vh] max-h-[820px] w-full max-w-3xl animate-float-in flex-col overflow-hidden rounded-3xl bg-[var(--md-sys-color-surface-container-high)] shadow-[var(--md-sys-elevation-3)]"
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between border-b border-[var(--md-sys-color-outline-variant)] px-6 py-4">
          <h2 id={titleId} className="flex items-center gap-2 text-lg font-bold">
            <Icon
              name="grid_view"
              size={22}
              className="text-[var(--md-sys-color-primary)]"
            />
            학급 게임 — 개념 빙고
          </h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--md-sys-color-on-surface-variant)] transition hover:bg-black/5"
          >
            <Icon name="close" size={20} />
          </button>
        </div>

        {/* 본문: 좌 HDD 트리 / 우 설정 */}
        <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[1fr_320px]">
          {/* HDD 트리 */}
          <div className="flex min-h-0 flex-col border-b border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)] md:border-b-0 md:border-r">
            <p className="border-b border-[var(--md-sys-color-outline-variant)] px-4 py-2.5 text-xs font-bold text-[var(--md-sys-color-on-surface-variant)]">
              연결 대상 선택 — 클래스 HDD
            </p>
            <div className="min-h-0 flex-1 overflow-y-auto p-2 text-sm">
              {loading ? (
                <p className="px-2 py-6 text-center text-xs text-black/40">
                  불러오는 중…
                </p>
              ) : projects.length === 0 && lessons.length === 0 ? (
                <p className="px-2 py-6 text-center text-xs text-black/40">
                  연결할 프로젝트/차시가 없습니다.
                </p>
              ) : (
                <>
                  {projects.map((p) => {
                    const pickedHere =
                      pick?.projectId === p.id && !pick?.lessonId;
                    const ls = lessonsByProject[p.id] ?? [];
                    const open = openProjId === p.id;
                    return (
                      <div key={p.id} className="mb-0.5">
                        <div
                          className={`flex items-center gap-1 rounded-lg px-2 py-1.5 transition ${
                            pickedHere
                              ? "bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)]"
                              : "hover:bg-black/5"
                          }`}
                        >
                          <button
                            onClick={() =>
                              setOpenProjId(open ? null : p.id)
                            }
                            className="flex h-5 w-5 items-center justify-center text-[var(--md-sys-color-on-surface-variant)]"
                            title={open ? "접기" : "펴기"}
                          >
                            <Icon
                              name={open ? "expand_more" : "chevron_right"}
                              size={16}
                            />
                          </button>
                          <button
                            onClick={() =>
                              setPick({ projectId: p.id, name: p.name })
                            }
                            className="flex flex-1 items-center gap-1.5 text-left"
                          >
                            <Icon
                              name="folder"
                              size={16}
                              className="text-[var(--md-sys-color-primary)]"
                            />
                            <span className="truncate font-semibold">
                              {p.name}
                            </span>
                            <span className="ml-auto text-[11px] text-black/40">
                              {ls.length}차시
                            </span>
                          </button>
                        </div>
                        {open && (
                          <div className="ml-6">
                            {ls.length === 0 ? (
                              <p className="px-2 py-1 text-[11px] text-black/35">
                                차시 없음
                              </p>
                            ) : (
                              ls.map((l) => {
                                const on = pick?.lessonId === l.id;
                                return (
                                  <button
                                    key={l.id}
                                    onClick={() =>
                                      setPick({
                                        projectId: p.id,
                                        lessonId: l.id,
                                        name: l.title,
                                      })
                                    }
                                    className={`flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left transition ${
                                      on
                                        ? "bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)]"
                                        : "hover:bg-black/5"
                                    }`}
                                  >
                                    <Icon
                                      name="article"
                                      size={14}
                                      className="text-[var(--md-sys-color-on-surface-variant)]"
                                    />
                                    <span className="truncate">{l.title}</span>
                                  </button>
                                );
                              })
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {/* 프로젝트 미배정 차시 */}
                  {(lessonsByProject.__none__?.length ?? 0) > 0 && (
                    <div className="mt-2 border-t border-[var(--md-sys-color-outline-variant)] pt-2">
                      <p className="px-2 py-1 text-[11px] text-black/40">
                        프로젝트 외 차시
                      </p>
                      {lessonsByProject.__none__!.map((l) => {
                        const on =
                          pick?.lessonId === l.id && !pick?.projectId;
                        return (
                          <button
                            key={l.id}
                            onClick={() =>
                              setPick({ lessonId: l.id, name: l.title })
                            }
                            className={`flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left transition ${
                              on
                                ? "bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)]"
                                : "hover:bg-black/5"
                            }`}
                          >
                            <Icon name="article" size={14} />
                            <span className="truncate">{l.title}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* 설정 */}
          <div className="flex min-h-0 flex-col gap-4 overflow-y-auto p-5">
            <Section title="보드 크기">
              <div className="grid grid-cols-4 gap-1.5">
                {([3, 4, 5, 7] as BoardSize[]).map((s) => (
                  <button
                    key={s}
                    onClick={() => setBoardSize(s)}
                    className={`rounded-xl py-2 text-sm font-bold transition ${
                      boardSize === s
                        ? "bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)]"
                        : "border border-[var(--md-sys-color-outline)] text-[var(--md-sys-color-on-surface)]"
                    }`}
                  >
                    {s}×{s}
                  </button>
                ))}
              </div>
            </Section>

            <Section title="학생 1인 제출 단어 수">
              <NumberInput
                value={wordsPerStudent}
                onChange={setWordsPerStudent}
                min={1}
                max={20}
              />
            </Section>

            <Section title="완성 빙고 라인 수 (종료 조건)">
              <NumberInput
                value={bingoTarget}
                onChange={setBingoTarget}
                min={1}
                max={boardSize * 2 + 2}
              />
              <p className="mt-1 text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
                가로·세로·대각선 합쳐 이 수만큼 완성한 학생이 1등이 됩니다.
              </p>
            </Section>

            <Section title="차례 방식">
              <div className="grid grid-cols-2 gap-1.5">
                {(
                  [
                    ["random", "랜덤"],
                    ["pick", "다음 학생 지정"],
                  ] as [GameOrder, string][]
                ).map(([k, lbl]) => (
                  <button
                    key={k}
                    onClick={() => setOrder(k)}
                    className={`rounded-xl py-2 text-sm font-semibold transition ${
                      order === k
                        ? "bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)]"
                        : "border border-[var(--md-sys-color-outline)] text-[var(--md-sys-color-on-surface)]"
                    }`}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
            </Section>

            <Section title="게임 종료 시점">
              <div className="grid grid-cols-2 gap-1.5">
                {(
                  [
                    ["all", "전원 완성"],
                    ["count", "N명 완성 시"],
                  ] as ["all" | "count", string][]
                ).map(([k, lbl]) => (
                  <button
                    key={k}
                    onClick={() => setEndMode(k)}
                    className={`rounded-xl py-2 text-sm font-semibold transition ${
                      endMode === k
                        ? "bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)]"
                        : "border border-[var(--md-sys-color-outline)] text-[var(--md-sys-color-on-surface)]"
                    }`}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
              {endMode === "count" && (
                <div className="mt-2">
                  <NumberInput value={endN} onChange={setEndN} min={1} max={60} />
                </div>
              )}
              <p className="mt-1 text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
                {endMode === "all"
                  ? "참여 학생 전원이 빙고를 완성하면 자동 종료돼요."
                  : endN === 1
                    ? "첫 완성자(1등)가 나오면 자동 종료돼요."
                    : `${endN}명이 완성하면 자동 종료돼요.`}{" "}
                (단어 소진·교사 수동 종료는 항상 가능)
              </p>
            </Section>

            <Section title="단어 + 한 줄 의미 함께 받기">
              <label className="flex cursor-pointer items-center gap-2 rounded-2xl border border-[var(--md-sys-color-outline-variant)] bg-white p-3 transition has-[:checked]:border-[var(--md-sys-color-primary)] has-[:checked]:bg-[color-mix(in_srgb,var(--md-sys-color-primary)_6%,white)]">
                <input
                  type="checkbox"
                  checked={allowMeaning}
                  onChange={(e) => setAllowMeaning(e.target.checked)}
                  className="h-4 w-4"
                />
                <span className="flex-1 text-sm">
                  <b>의미 입력 칸 추가</b>
                  <span className="ml-1 text-xs text-[var(--md-sys-color-on-surface-variant)]">
                    — 호명 시 의미가 함께 보여 학습 효과↑
                  </span>
                </span>
              </label>
            </Section>

            {pick && (
              <p className="rounded-xl bg-[var(--md-sys-color-tertiary-container)] px-3 py-2 text-xs font-semibold text-[var(--md-sys-color-on-tertiary-container)]">
                연결: {pick.name}
              </p>
            )}
            {err && (
              <p className="rounded-xl bg-[var(--md-sys-color-error-container)] px-3 py-2 text-xs text-[var(--md-sys-color-on-error-container)]">
                {err}
              </p>
            )}
            <button
              onClick={start}
              disabled={busy || !pick}
              className="mt-auto inline-flex items-center justify-center gap-1.5 rounded-full bg-[var(--md-sys-color-primary)] px-4 py-3 text-sm font-bold text-[var(--md-sys-color-on-primary)] transition hover:brightness-105 disabled:opacity-40"
            >
              <Icon name="play_arrow" size={18} />
              {busy ? "게임 여는 중…" : "학급 게임 시작"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs font-bold text-[var(--md-sys-color-on-surface-variant)]">
        {title}
      </p>
      {children}
    </div>
  );
}

function NumberInput({
  value,
  onChange,
  min,
  max,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={() => onChange(Math.max(min, value - 1))}
        className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--md-sys-color-outline)] text-[var(--md-sys-color-on-surface)] hover:bg-black/5"
      >
        <Icon name="remove" size={18} />
      </button>
      <input
        type="number"
        value={value}
        onChange={(e) => {
          const n = parseInt(e.target.value, 10);
          if (!isNaN(n)) onChange(Math.min(max, Math.max(min, n)));
        }}
        className="m3-field w-16 text-center tabular-nums"
        min={min}
        max={max}
      />
      <button
        onClick={() => onChange(Math.min(max, value + 1))}
        className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--md-sys-color-outline)] text-[var(--md-sys-color-on-surface)] hover:bg-black/5"
      >
        <Icon name="add" size={18} />
      </button>
    </div>
  );
}
