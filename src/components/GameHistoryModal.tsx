"use client";

import { useEffect, useMemo, useState } from "react";
import type { User } from "firebase/auth";
import { Icon } from "@/components/Icon";
import { GraphView } from "@/components/GraphView";
import { WordCloud } from "@/components/WordCloud";
import {
  getGames,
  getGameSubmissions,
  type Game,
  type GameSubmission,
} from "@/lib/games";
import {
  createQuestion,
  type GameResultPayload,
  type Ontology,
} from "@/lib/lessons";
import { gameConceptGraph, gameFeedbackComment } from "@/lib/ai";

const STATUS_LABEL: Record<Game["status"], string> = {
  draft: "준비",
  submit: "단어 모집",
  select: "후보 선정",
  build: "보드 배치",
  play: "진행 중",
  done: "종료",
};

function fmtDate(ms: number | null): string {
  if (!ms) return "";
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 제출 목록들에서 개념어(words) 빈도 합산 — 워드클라우드/임베딩 입력 */
function aggregateConcepts(
  lists: GameSubmission[][]
): { word: string; count: number }[] {
  const m = new Map<string, number>();
  for (const subs of lists) {
    for (const s of subs) {
      for (const w0 of s.words ?? []) {
        const w = (w0 ?? "").trim();
        if (!w) continue;
        m.set(w, (m.get(w) ?? 0) + 1);
      }
    }
  }
  return [...m.entries()]
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * 게임 이력 — 지난 게임 목록(최신순). 좌측에서 게임을 다중 체크하면 선택한 게임들의
 * ① 워드클라우드(제출 빈도) ② 임베딩 기반 개념 지식맵(GraphView)을 합산해 보여준다.
 * 좌측 클릭(체크박스 아님)으로 한 게임을 '상세'로 선택하면 호출 개념어·학생별 제출을 보고,
 * 그 게임을 연결된 차시의 "수업 후 활동"(결과 피드백)으로 추가할 수 있다. 교사 전용.
 */
export function GameHistoryModal({
  cid,
  user,
  nameOf,
  onClose,
}: {
  cid: string;
  user: User;
  nameOf: Record<string, string>;
  onClose: () => void;
}) {
  const [games, setGames] = useState<Game[] | null>(null);
  const [focused, setFocused] = useState<Game | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [subsCache, setSubsCache] = useState<Record<string, GameSubmission[]>>(
    {}
  );
  const [subsErr, setSubsErr] = useState<Record<string, boolean>>({});
  const [loadingSubs, setLoadingSubs] = useState<Set<string>>(new Set());

  // 임베딩 지식맵(선택 게임 합산)
  const [mapState, setMapState] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [mapData, setMapData] = useState<Ontology | null>(null);
  const [mapErr, setMapErr] = useState("");

  // 차시 수업후활동 추가(상세 게임 기준)
  const [addState, setAddState] = useState<
    "idle" | "saving" | "done" | "error" | "no-lesson"
  >("idle");

  const nm = (uid: string, fallback?: string) =>
    nameOf[uid] || fallback || "이름없음";

  useEffect(() => {
    let live = true;
    getGames(cid)
      .then((gs) => {
        if (!live) return;
        setGames(gs);
        const first = gs[0];
        if (first) {
          setFocused(first);
          setChecked(new Set([first.id]));
        }
      })
      .catch(() => live && setGames([]));
    return () => {
      live = false;
    };
  }, [cid]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function ensureSubs(gid: string): Promise<GameSubmission[]> {
    if (subsCache[gid]) return subsCache[gid];
    setLoadingSubs((s) => new Set(s).add(gid));
    try {
      const list = await getGameSubmissions(cid, gid);
      setSubsCache((c) => ({ ...c, [gid]: list }));
      setSubsErr((e) => ({ ...e, [gid]: false }));
      return list;
    } catch {
      setSubsErr((e) => ({ ...e, [gid]: true }));
      return [];
    } finally {
      setLoadingSubs((s) => {
        const n = new Set(s);
        n.delete(gid);
        return n;
      });
    }
  }

  // 상세 선택 게임이 바뀌면 제출 로드 + 추가 상태 초기화
  useEffect(() => {
    if (focused) {
      ensureSubs(focused.id);
      setAddState("idle");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focused?.id]);

  function toggleCheck(g: Game) {
    setChecked((prev) => {
      const n = new Set(prev);
      if (n.has(g.id)) n.delete(g.id);
      else {
        n.add(g.id);
        ensureSubs(g.id);
      }
      return n;
    });
    setMapState("idle"); // 선택이 바뀌면 지식맵 재생성 필요
    setMapData(null);
  }

  // 선택(체크) 게임 합산 워드클라우드 (로드된 것만)
  const cloudItems = useMemo(() => {
    const lists = [...checked]
      .map((gid) => subsCache[gid])
      .filter((x): x is GameSubmission[] => !!x);
    return aggregateConcepts(lists);
  }, [checked, subsCache]);

  const checkedGames = useMemo(
    () => (games ?? []).filter((g) => checked.has(g.id)),
    [games, checked]
  );

  async function genMap() {
    const gids = [...checked];
    if (gids.length === 0) {
      setMapErr("게임을 1개 이상 선택하세요.");
      setMapState("error");
      return;
    }
    setMapState("loading");
    setMapErr("");
    try {
      const lists = await Promise.all(gids.map(ensureSubs));
      const concepts = aggregateConcepts(lists);
      if (concepts.length === 0) {
        setMapErr("선택한 게임에 제출된 개념어가 없어요.");
        setMapState("error");
        return;
      }
      const onto = await gameConceptGraph({ classId: cid, concepts });
      setMapData(onto);
      setMapState("ready");
    } catch (e) {
      const code = (e as { code?: string })?.code ?? "";
      const msg =
        code.includes("not-found")
          ? "지식맵 함수가 아직 배포되지 않았어요. (firebase deploy --only functions:gameConceptGraph) 배포 후 다시 시도하세요."
          : code.includes("unauthenticated") || code.includes("permission-denied")
            ? "권한 오류 — 교사 계정으로 로그인했는지 확인하세요."
            : `지식맵 생성 실패: ${(e as Error)?.message ?? "알 수 없는 오류"}`;
      setMapErr(msg);
      setMapState("error");
    }
  }

  async function addToLesson() {
    if (!focused) return;
    const lessonId = focused.link.lessonId;
    if (!lessonId) {
      setAddState("no-lesson");
      return;
    }
    setAddState("saving");
    try {
      const subs = await ensureSubs(focused.id);
      const concepts = aggregateConcepts([subs]);
      const ranks = [...focused.ranks]
        .sort((a, b) => a.rank - b.rank)
        .map((r) => ({
          uid: r.uid,
          name: nm(r.uid),
          rank: r.rank,
          doneAtTurn: r.doneAtTurn,
        }));
      const gameName = focused.link.name || "개념 빙고";

      let ontology: Ontology | undefined;
      if (concepts.length > 0) {
        try {
          ontology = await gameConceptGraph({ classId: cid, concepts });
        } catch {
          ontology = undefined;
        }
      }
      let comment: string | undefined;
      try {
        const c = await gameFeedbackComment({
          classId: cid,
          gameName,
          concepts,
          ranks: ranks.map((r) => ({ name: r.name, rank: r.rank })),
        });
        comment = c.comment;
      } catch {
        comment = undefined;
      }

      const payload: GameResultPayload = {
        gameId: focused.id,
        gameName,
        boardSize: focused.config.boardSize,
        playedAt: focused.createdAt ?? null,
        ranks,
        wordCloud: concepts,
        ...(ontology ? { ontology } : {}),
        ...(comment ? { comment } : {}),
      };
      await createQuestion(cid, lessonId, user, {
        phase: "post",
        kind: "game-result",
        title: `${gameName} · 결과 피드백`,
        allowResubmit: false,
        order: Date.now(),
        gameResult: payload,
      });
      setAddState("done");
    } catch {
      setAddState("error");
    }
  }

  const called = focused?.turn.calledWords ?? [];
  const meaningOf = useMemo(() => {
    const m = new Map<string, string>();
    focused?.candidates.forEach((c) => {
      if (c.meaning) m.set(c.word, c.meaning);
    });
    return m;
  }, [focused]);

  const focusedSubs = focused ? subsCache[focused.id] : undefined;
  const focusedSubsSorted = useMemo(() => {
    if (!focusedSubs) return [];
    return [...focusedSubs].sort((a, b) =>
      nm(a.uid, a.name).localeCompare(nm(b.uid, b.name), "ko")
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedSubs, nameOf]);

  // 같은 개념을 여러 명이 냈을 때 제출 순서로 (1)(2) 구분.
  //  - 순서 기준: candidates[].submittedBy(병합 시 제출 순). 없으면 제출 로드 순.
  //  - 키: 소문자 정규화 단어. 중복(제출자 2명+)인 단어만 접미사 부여.
  const dupOrder = useMemo(() => {
    const order = new Map<string, string[]>(); // lo → [uid, uid...] 제출 순
    const push = (lo: string, uid: string) => {
      if (!lo) return;
      const arr = order.get(lo) ?? [];
      if (!arr.includes(uid)) arr.push(uid);
      order.set(lo, arr);
    };
    const cands = focused?.candidates ?? [];
    if (cands.length > 0) {
      for (const c of cands) {
        const lo = (c.word || "").trim().toLowerCase();
        for (const uid of c.submittedBy ?? []) push(lo, uid);
      }
    } else if (focusedSubs) {
      for (const s of focusedSubs)
        for (const w of s.words)
          push((w || "").trim().toLowerCase(), s.uid);
    }
    return order;
  }, [focused, focusedSubs]);

  // 특정 학생의 단어가 중복이면 "(n)" 반환, 아니면 ""
  const dupSuffix = (word: string, uid: string): string => {
    const lo = (word || "").trim().toLowerCase();
    const arr = dupOrder.get(lo);
    if (!arr || arr.length < 2) return "";
    const idx = arr.indexOf(uid);
    return idx >= 0 ? `(${idx + 1})` : "";
  };

  const canAddToLesson = !!focused?.link.lessonId;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--md-sys-color-scrim)]/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex h-[88vh] max-h-[880px] w-full max-w-6xl animate-float-in flex-col overflow-hidden rounded-3xl bg-[var(--md-sys-color-surface-container-high)] shadow-[var(--md-sys-elevation-3)]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-2 border-b border-[var(--md-sys-color-outline-variant)] px-5 py-4">
          <h2 className="flex items-center gap-2 text-lg font-extrabold text-[var(--md-sys-color-on-surface)]">
            <Icon name="history" size={22} />
            게임 이력
          </h2>
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--md-sys-color-on-surface-variant)] hover:bg-black/5"
            aria-label="닫기"
          >
            <Icon name="close" size={22} />
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          {/* 좌측: 게임 목록 (체크 = 합산 / 클릭 = 상세) */}
          <aside className="flex max-h-[28vh] shrink-0 flex-col gap-1 overflow-y-auto border-b border-[var(--md-sys-color-outline-variant)] p-3 md:max-h-none md:w-[clamp(220px,28%,320px)] md:border-b-0 md:border-r">
            <p className="px-1 pb-1 text-[11px] font-semibold text-[var(--md-sys-color-on-surface-variant)]">
              체크 = 워드클라우드·지식맵 합산 · 클릭 = 상세
            </p>
            {games === null ? (
              <p className="p-3 text-sm text-[var(--md-sys-color-on-surface-variant)]">
                불러오는 중…
              </p>
            ) : games.length === 0 ? (
              <p className="p-3 text-sm text-[var(--md-sys-color-on-surface-variant)]">
                아직 진행한 게임이 없어요.
              </p>
            ) : (
              games.map((g) => {
                const isFocus = focused?.id === g.id;
                const isChecked = checked.has(g.id);
                return (
                  <div
                    key={g.id}
                    className={`flex items-center gap-2 rounded-2xl border-2 px-2 py-2 transition ${
                      isFocus
                        ? "border-[var(--md-sys-color-primary)] bg-[var(--md-sys-color-primary-container)]"
                        : "border-transparent bg-[var(--md-sys-color-surface)] hover:bg-black/5"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleCheck(g)}
                      className="h-4 w-4 shrink-0 accent-[var(--md-sys-color-primary)]"
                      aria-label={`${g.link.name || "게임"} 합산에 포함`}
                    />
                    <button
                      onClick={() => setFocused(g)}
                      className="flex min-w-0 flex-1 flex-col gap-0.5 text-left"
                    >
                      <span
                        className={`line-clamp-1 text-sm font-bold ${
                          isFocus
                            ? "text-[var(--md-sys-color-on-primary-container)]"
                            : "text-[var(--md-sys-color-on-surface)]"
                        }`}
                      >
                        {g.link.name || "이름 없는 게임"}
                      </span>
                      <span className="flex items-center gap-1.5 text-[11px] font-semibold opacity-70">
                        <span
                          className={`rounded-full px-1.5 py-0.5 ${
                            g.status === "done"
                              ? "bg-[var(--md-sys-color-surface-container-highest)]"
                              : "bg-[var(--md-sys-color-tertiary-container)] text-[var(--md-sys-color-on-tertiary-container)]"
                          }`}
                        >
                          {STATUS_LABEL[g.status]}
                        </span>
                        {fmtDate(g.createdAt)}
                      </span>
                    </button>
                  </div>
                );
              })
            )}
          </aside>

          {/* 우측: 합산 시각화 + 상세 */}
          <section className="flex min-w-0 flex-1 flex-col overflow-y-auto p-5">
            {!focused ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-[var(--md-sys-color-on-surface-variant)]">
                <Icon name="touch_app" size={32} />
                <p className="text-sm font-semibold">
                  왼쪽에서 게임을 선택하세요.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-6">
                {/* 합산 워드클라우드 */}
                <section className="flex flex-col gap-2">
                  <h3 className="flex items-center gap-1.5 text-sm font-extrabold text-[var(--md-sys-color-on-surface)]">
                    <Icon name="cloud" size={18} />
                    개념어 워드클라우드
                    <span className="text-xs font-medium text-[var(--md-sys-color-on-surface-variant)]">
                      선택 {checkedGames.length}개 게임 · 제출 빈도
                    </span>
                  </h3>
                  <WordCloud items={cloudItems} />
                </section>

                {/* 합산 임베딩 지식맵 */}
                <section className="flex flex-col gap-2">
                  <h3 className="flex items-center gap-1.5 text-sm font-extrabold text-[var(--md-sys-color-on-surface)]">
                    <Icon name="hub" size={18} />
                    개념 지식맵
                    <span className="text-xs font-medium text-[var(--md-sys-color-on-surface-variant)]">
                      제출 개념어를 임베딩해 의미가 비슷한 개념끼리 연결
                    </span>
                  </h3>
                  {mapState === "ready" && mapData ? (
                    <div className="overflow-hidden rounded-2xl bg-white/40 p-2 dark:bg-white/5">
                      <GraphView
                        data={mapData}
                        height={400}
                        title="게임 개념 지식맵"
                      />
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2 rounded-2xl bg-[var(--md-sys-color-surface)] p-6 text-center">
                      <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                        선택한 게임들의 제출 개념어로 의미 기반 지식맵을 만듭니다.
                      </p>
                      <button
                        onClick={genMap}
                        disabled={
                          mapState === "loading" || cloudItems.length === 0
                        }
                        className="inline-flex items-center gap-1.5 rounded-full bg-[var(--md-sys-color-primary)] px-4 py-2 text-sm font-bold text-[var(--md-sys-color-on-primary)] disabled:opacity-50"
                      >
                        <Icon name="bubble_chart" size={16} />
                        {mapState === "loading" ? "생성 중…" : "지식맵 생성"}
                      </button>
                      {mapState === "error" && (
                        <span className="text-xs font-bold text-[var(--md-sys-color-error)]">
                          {mapErr}
                        </span>
                      )}
                    </div>
                  )}
                </section>

                <hr className="border-[var(--md-sys-color-outline-variant)]" />

                {/* 상세 게임 헤더 + 차시 추가 */}
                <div className="flex flex-col gap-2">
                  <h3 className="text-xl font-black text-[var(--md-sys-color-on-surface)]">
                    {focused.link.name || "이름 없는 게임"}
                  </h3>
                  <p className="text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)]">
                    {STATUS_LABEL[focused.status]} · {fmtDate(focused.createdAt)}{" "}
                    · {focused.config.boardSize}×{focused.config.boardSize} ·
                    참여 {focusedSubs?.length ?? "…"}명 · 호출 {called.length}개
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={addToLesson}
                      disabled={!canAddToLesson || addState === "saving"}
                      className="inline-flex items-center gap-1.5 rounded-full bg-[var(--md-sys-color-tertiary)] px-4 py-2 text-sm font-bold text-[var(--md-sys-color-on-tertiary)] disabled:opacity-50"
                      title={
                        canAddToLesson
                          ? "연결된 차시의 수업 후 활동으로 결과 피드백을 추가"
                          : "이 게임은 차시에 연결되지 않았습니다"
                      }
                    >
                      <Icon name="post_add" size={16} />
                      {addState === "saving"
                        ? "추가 중…(AI 분석)"
                        : "차시 수업후활동으로 추가"}
                    </button>
                    {canAddToLesson && focused.link.name && (
                      <span className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                        「{focused.link.name}」 차시 · 수업 후
                      </span>
                    )}
                    {addState === "done" && (
                      <span className="text-xs font-bold text-[var(--md-sys-color-primary)]">
                        ✓ 추가됨 — 차시 ‘수업 후’ 탭에서 교사·학생이 확인할 수 있어요.
                      </span>
                    )}
                    {addState === "no-lesson" && (
                      <span className="text-xs font-bold text-[var(--md-sys-color-error)]">
                        이 게임은 차시에 연결되지 않아 추가할 수 없어요.
                      </span>
                    )}
                    {addState === "error" && (
                      <span className="text-xs font-bold text-[var(--md-sys-color-error)]">
                        추가 실패 — 다시 시도해 주세요.
                      </span>
                    )}
                  </div>
                </div>

                {/* 호출된 개념어 (선택순) */}
                <section className="flex flex-col gap-2">
                  <h4 className="flex items-center gap-1.5 text-sm font-extrabold text-[var(--md-sys-color-on-surface)]">
                    <Icon name="format_list_numbered" size={18} />
                    호출된 개념어 (선택순)
                  </h4>
                  {called.length === 0 ? (
                    <p className="rounded-2xl bg-[var(--md-sys-color-surface)] p-3 text-sm text-[var(--md-sys-color-on-surface-variant)]">
                      이 게임에서 호출된 단어가 없어요.
                    </p>
                  ) : (
                    <ol className="flex flex-col gap-1.5">
                      {called.map((w, i) => (
                        <li
                          key={`${w}-${i}`}
                          className="flex items-center gap-2.5 rounded-2xl bg-[var(--md-sys-color-surface)] px-3 py-2"
                        >
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--md-sys-color-primary)] text-xs font-black text-[var(--md-sys-color-on-primary)]">
                            {i + 1}
                          </span>
                          <span className="font-bold text-[var(--md-sys-color-on-surface)]">
                            {w}
                          </span>
                          {meaningOf.get(w) && (
                            <span className="line-clamp-1 text-xs text-[var(--md-sys-color-on-surface-variant)]">
                              — {meaningOf.get(w)}
                            </span>
                          )}
                        </li>
                      ))}
                    </ol>
                  )}
                </section>

                {/* 학생별 개념어 제출 */}
                <section className="flex flex-col gap-2">
                  <h4 className="flex items-center gap-1.5 text-sm font-extrabold text-[var(--md-sys-color-on-surface)]">
                    <Icon name="groups" size={18} />
                    학생별 개념어 제출
                  </h4>
                  {loadingSubs.has(focused.id) ? (
                    <p className="rounded-2xl bg-[var(--md-sys-color-surface)] p-3 text-sm text-[var(--md-sys-color-on-surface-variant)]">
                      불러오는 중…
                    </p>
                  ) : subsErr[focused.id] ? (
                    <div className="flex items-center justify-between gap-2 rounded-2xl bg-[color-mix(in_srgb,var(--md-sys-color-error)_8%,transparent)] p-3">
                      <span className="text-sm font-semibold text-[var(--md-sys-color-error)]">
                        제출을 불러오지 못했어요.
                      </span>
                      <button
                        onClick={() => ensureSubs(focused.id)}
                        className="rounded-full border border-[var(--md-sys-color-error)] px-3 py-1 text-xs font-bold text-[var(--md-sys-color-error)]"
                      >
                        다시 시도
                      </button>
                    </div>
                  ) : focusedSubsSorted.length === 0 ? (
                    <p className="rounded-2xl bg-[var(--md-sys-color-surface)] p-3 text-sm text-[var(--md-sys-color-on-surface-variant)]">
                      제출한 학생이 없어요.
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {focusedSubsSorted.map((s) => {
                        const pickedSet = new Set(s.picked);
                        return (
                          <div
                            key={s.uid}
                            className="flex flex-col gap-2 rounded-2xl bg-[var(--md-sys-color-surface)] p-3"
                          >
                            <div className="flex items-center gap-2">
                              <span className="line-clamp-1 flex-1 text-sm font-bold text-[var(--md-sys-color-on-surface)]">
                                {nm(s.uid, s.name)}
                              </span>
                              <span className="shrink-0 rounded-full bg-[var(--md-sys-color-surface-container-highest)] px-2 py-0.5 text-[11px] font-bold text-[var(--md-sys-color-on-surface-variant)]">
                                제출 {s.words.length} · 선정 {s.picked.length}
                              </span>
                            </div>
                            {s.words.length === 0 ? (
                              <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                                제출 단어 없음
                              </p>
                            ) : (
                              <div className="flex flex-wrap gap-1.5">
                                {s.words.map((w, i) => {
                                  const meaning = s.meanings?.[i];
                                  const picked = pickedSet.has(w);
                                  const suffix = dupSuffix(w, s.uid);
                                  return (
                                    <span
                                      key={`${s.uid}-${w}-${i}`}
                                      title={meaning || undefined}
                                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                                        picked
                                          ? "bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)]"
                                          : "bg-[var(--md-sys-color-surface-container-highest)] text-[var(--md-sys-color-on-surface)]"
                                      }`}
                                    >
                                      {w}
                                      {suffix && (
                                        <span className="ml-0.5 font-extrabold text-[var(--md-sys-color-tertiary)]">
                                          {suffix}
                                        </span>
                                      )}
                                      {meaning && (
                                        <span className="ml-1 opacity-60">
                                          · {meaning}
                                        </span>
                                      )}
                                    </span>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
                    채워진 색 = 후보로 ‘선정’된 단어
                  </p>
                </section>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
