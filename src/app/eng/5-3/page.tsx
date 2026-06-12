"use client";

// 5단원 3차시 "Where Is ABC Library?" — 길찾기 또래 챌린지 활동.
//  · 만들기: 지도에 장소를 배치하고 시작점·목적지를 정한 뒤 길안내문 작성 → 공개
//  · 풀기: 친구의 지도+안내문을 보고 목적지 장소를 클릭 → 정답이면 만든이/푼이 +5
//  · 점수: 내 점수와 누가 내 챌린지를 풀었는지 확인
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  confirmSolve,
  createChallenge,
  getMyScore,
  getMySolve,
  getPlayer,
  listChallenges,
  listMyChallenges,
  savePlayer,
  setCreatorMark,
  submitSolution,
  watchSolvers,
  type MyScore,
  type MySolve,
} from "@/lib/engChallenges";
import {
  CLASS_NOS,
  PLACE_BY_ID,
  POINTS_PER_SOLVE,
  avatarFromUid,
  placeImg,
  startLabelKo,
  type Challenge,
  type DirectionEnding,
  type DirectionStep,
  type GridSize,
  type Player,
  type Solver,
  type Start,
} from "./types";
import { searchSchools, type School } from "@/lib/schools";
import { listMyClasses } from "@/lib/classes";
import { getMyXpRequest, requestClassXp, type XpRequest } from "@/lib/xp";
import { MapEditor, MapView } from "./PlaceGrid";
import { DirectionBuilder, directionsToEnglish } from "./DirectionBuilder";
import {
  arrived,
  boardLen,
  simulate,
  type Dir,
  type Node as MapNode,
  type SimResult,
} from "./mapModel";

type Tab = "make" | "solve" | "score" | "grade";

export default function Lesson5_3Page() {
  const { user, profile } = useAuth();
  const isTeacher = profile?.role === "teacher";
  const [tab, setTab] = useState<Tab>("make");
  // 참가자 식별(학교+반). "loading" → 조회중, null → 미설정(게이트), Player → 완료
  const [player, setPlayer] = useState<Player | null | "loading">("loading");

  useEffect(() => {
    if (!user) {
      setPlayer(null);
      return;
    }
    setPlayer("loading");
    // 실패 시에도 'loading'에 갇히지 않도록 식별 게이트(null)로 떨어뜨린다.
    getPlayer(user.uid)
      .then((p) => setPlayer(p))
      .catch(() => setPlayer(null));
  }, [user]);

  // 학급 바꾸기(교사가 다른 학급에 들어갈 때) — 식별 폼을 다시 연다
  const [editingIdentity, setEditingIdentity] = useState(false);
  // 로그인했는데 학교·반 미설정(또는 바꾸기) → 식별 게이트
  const needIdentity =
    !!user && player !== "loading" && (player === null || editingIdentity);

  return (
    <main className="min-h-screen bg-[var(--md-sys-color-surface)] px-4 py-6">
      <div className="mx-auto max-w-2xl">
        <header className="mb-4 text-center">
          <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
            6학년 5단원 3차시 · Where Is ABC Library?
          </p>
          <h1 className="text-2xl font-bold text-[var(--md-sys-color-on-surface)]">
            길찾기 챌린지
          </h1>
          {player && player !== "loading" && !needIdentity && (
            <p className="mt-1 flex items-center justify-center gap-2 text-xs font-semibold text-[var(--md-sys-color-primary)]">
              {player.schoolName} · 6학년 {player.classNo}반
              <button
                onClick={() => setEditingIdentity(true)}
                className="rounded-full border border-[var(--md-sys-color-outline-variant)] px-2 py-0.5 text-[11px] font-medium text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-high)]"
                title="다른 학급으로 바꾸기"
              >
                학급 바꾸기
              </button>
            </p>
          )}
        </header>

        {user && player === "loading" ? (
          <p className="py-16 text-center text-sm text-[var(--md-sys-color-on-surface-variant)]">
            불러오는 중…
          </p>
        ) : needIdentity ? (
          <IdentityForm
            uid={user!.uid}
            initial={player}
            onCancel={player ? () => setEditingIdentity(false) : undefined}
            onDone={(p) => {
              setPlayer(p);
              setEditingIdentity(false);
            }}
          />
        ) : (
          <>
            <nav
              className={`mb-5 grid gap-1 rounded-full bg-[var(--md-sys-color-surface-container)] p-1 ${
                isTeacher ? "grid-cols-4" : "grid-cols-3"
              }`}
            >
              {(
                [
                  ["make", "만들기"],
                  ["solve", "풀기"],
                  ["score", "내 점수"],
                  ...(isTeacher ? [["grade", "채점"] as [Tab, string]] : []),
                ] as [Tab, string][]
              ).map(([t, label]) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={[
                    "rounded-full py-2 text-sm font-medium transition",
                    tab === t
                      ? "bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)]"
                      : "text-[var(--md-sys-color-on-surface-variant)]",
                  ].join(" ")}
                >
                  {label}
                </button>
              ))}
            </nav>

            {tab === "make" && (
              <MakeTab
                uid={user?.uid ?? ""}
                player={player !== "loading" ? player : null}
              />
            )}
            {tab === "solve" && (
              <SolveTab
                uid={user?.uid ?? ""}
                player={player !== "loading" ? player : null}
              />
            )}
            {tab === "score" && (
              <ScoreTab uid={user?.uid ?? ""} isTeacher={isTeacher} />
            )}
            {tab === "grade" && isTeacher && (
              <GradeTab
                uid={user?.uid ?? ""}
                player={player !== "loading" ? player : null}
              />
            )}
          </>
        )}
      </div>
    </main>
  );
}

/** 시작 전(또는 학급 바꾸기) 식별 — 학교(NEIS 검색) + 6학년 반(1~15). */
function IdentityForm({
  uid,
  initial,
  onDone,
  onCancel,
}: {
  uid: string;
  initial?: Player | null;
  onDone: (p: Player) => void;
  onCancel?: () => void;
}) {
  const [query, setQuery] = useState(initial?.schoolName ?? "");
  const [results, setResults] = useState<School[]>([]);
  const [school, setSchool] = useState(initial?.schoolName ?? "");
  const [classNo, setClassNo] = useState(initial?.classNo ?? 0);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2 || q === school) {
      setResults([]);
      return;
    }
    let alive = true;
    setSearching(true);
    const t = setTimeout(() => {
      searchSchools(q)
        .then((r) => {
          if (alive) setResults(r);
        })
        .finally(() => {
          if (alive) setSearching(false);
        });
    }, 300);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [query, school]);

  async function start() {
    const name = school.trim() || query.trim();
    if (!name || !classNo || busy) return;
    setBusy(true);
    try {
      await savePlayer(uid, name, classNo);
      onDone({ uid, schoolName: name, classNo });
    } catch {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-3xl bg-[var(--md-sys-color-surface-container)] p-6">
      <p className="mb-1 text-center text-base font-bold">
        {onCancel ? "학급 바꾸기" : "시작하기 전에"}
      </p>
      <p className="mb-5 text-center text-sm text-[var(--md-sys-color-on-surface-variant)]">
        학교와 우리 반을 선택해 주세요.
      </p>

      <label className="mb-1 block text-sm font-semibold">학교</label>
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setSchool("");
        }}
        placeholder="학교 이름을 검색하세요 (예: 서울… 초등학교)"
        className="m3-field w-full"
      />
      {searching && (
        <p className="mt-1 text-xs text-[var(--md-sys-color-on-surface-variant)]">검색 중…</p>
      )}
      {results.length > 0 && (
        <ul className="mt-1 max-h-44 overflow-y-auto rounded-xl border border-[var(--md-sys-color-outline-variant)]">
          {results.map((s, i) => (
            <li key={i}>
              <button
                type="button"
                onClick={() => {
                  setSchool(s.name);
                  setQuery(s.name);
                  setResults([]);
                }}
                className="flex w-full flex-col items-start px-3 py-2 text-left hover:bg-[var(--md-sys-color-surface-container-high)]"
              >
                <span className="text-sm font-medium">{s.name}</span>
                <span className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                  {s.address}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {school && (
        <p className="mt-1 text-xs font-semibold text-[var(--md-sys-color-primary)]">
          ✓ {school}
        </p>
      )}

      <label className="mb-1 mt-4 block text-sm font-semibold">우리 반 (6학년)</label>
      <div className="flex flex-wrap gap-1.5">
        {CLASS_NOS.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setClassNo(n)}
            className={[
              "h-10 w-12 rounded-xl text-sm font-bold transition",
              classNo === n
                ? "bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)]"
                : "bg-[var(--md-sys-color-surface-container-highest)] text-[var(--md-sys-color-on-surface-variant)]",
            ].join(" ")}
          >
            {n}반
          </button>
        ))}
      </div>

      <div className="mt-6 flex gap-2">
        {onCancel && (
          <button
            onClick={onCancel}
            className="rounded-full border border-[var(--md-sys-color-outline)] px-5 py-3 text-base font-bold text-[var(--md-sys-color-on-surface-variant)]"
          >
            취소
          </button>
        )}
        <button
          onClick={start}
          disabled={(!school && query.trim().length < 2) || !classNo || busy}
          className="flex-1 rounded-full bg-[var(--md-sys-color-primary)] px-6 py-3 text-base font-bold text-[var(--md-sys-color-on-primary)] transition hover:brightness-105 disabled:opacity-40"
        >
          {busy ? "저장 중…" : onCancel ? "이 학급으로 이동 →" : "시작하기 →"}
        </button>
      </div>
    </div>
  );
}

const PRIMARY_BTN =
  "rounded-full bg-[var(--md-sys-color-primary)] px-6 py-3 font-medium text-[var(--md-sys-color-on-primary)] disabled:opacity-40";

/** 개발 미리보기(비로그인) 안내 — Firestore 접근 불가 탭에서 사용 */
function PreviewNotice() {
  return (
    <p className="rounded-2xl bg-[var(--md-sys-color-surface-container-high)] p-6 text-center text-sm text-[var(--md-sys-color-on-surface-variant)]">
      🔧 개발 미리보기에서는 로그인이 없어 이 탭의 데이터(저장/풀기/점수)는 불러올 수 없어요.
      <br />
      ‘만들기’ 탭의 지도·문장 빌더는 그대로 확인할 수 있습니다.
    </p>
  );
}

/** 선택용 장소 칩 행 */
function PlaceChips({
  ids,
  selected,
  onSelect,
}: {
  ids: string[];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  if (ids.length === 0)
    return (
      <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
        먼저 지도에 장소를 놓아 주세요.
      </p>
    );
  return (
    <div className="flex flex-wrap gap-2">
      {ids.map((id) => {
        const p = PLACE_BY_ID[id];
        const on = selected === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onSelect(id)}
            className={[
              "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm",
              on
                ? "border-[var(--md-sys-color-primary)] bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)]"
                : "border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface)]",
            ].join(" ")}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={placeImg(id)} alt={p?.en} className="h-5 w-5 object-contain" />
            {p?.en}
          </button>
        );
      })}
    </div>
  );
}

function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="mb-5 rounded-2xl bg-[var(--md-sys-color-surface-container-high)] p-4">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-[var(--md-sys-color-on-surface)]">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--md-sys-color-primary)] text-xs text-[var(--md-sys-color-on-primary)]">
          {n}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

// 워커 애니메이션 훅 — 시뮬레이션 경로(SimResult)를 받아 도로를 따라 이동시킨다.
function facingOf(a: MapNode, b: MapNode): Dir {
  if (b.x > a.x) return 1;
  if (b.x < a.x) return 3;
  if (b.y > a.y) return 2;
  return 0;
}
function useWalker() {
  const [walker, setWalker] = useState<{ node: MapNode; dir: Dir } | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const stop = useCallback(() => {
    if (timer.current) {
      clearInterval(timer.current);
      timer.current = null;
    }
  }, []);
  const play = useCallback(
    (res: SimResult) => {
      stop();
      const path = res.path;
      if (path.length === 0) return setWalker(null);
      setWalker({
        node: path[0],
        dir: path.length > 1 ? facingOf(path[0], path[1]) : res.dir,
      });
      let i = 0;
      timer.current = setInterval(() => {
        i++;
        if (i >= path.length) {
          stop();
          setWalker({ node: res.final, dir: res.dir });
          return;
        }
        setWalker({ node: path[i], dir: facingOf(path[i - 1], path[i]) });
      }, 450);
    },
    [stop]
  );
  const clear = useCallback(() => {
    stop();
    setWalker(null);
  }, [stop]);
  useEffect(() => () => stop(), [stop]);
  return { walker, play, clear };
}

// ─────────────────────────── 만들기 탭 ───────────────────────────

function MakeTab({ uid, player }: { uid: string; player: Player | null }) {
  const [size, setSize] = useState<GridSize>(3);
  const [board, setBoard] = useState<(string | null)[]>(() =>
    Array(boardLen(3)).fill(null)
  );
  const [start, setStart] = useState<Start | null>(null);
  const [destination, setDestination] = useState<string | null>(null);
  const [steps, setSteps] = useState<DirectionStep[]>([]);
  const [ending, setEnding] = useState<DirectionEnding | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  // 지도 확정: 누르면 남은 빈칸(건물 없는 슬롯)에 번호를 부여한다.
  const [confirmed, setConfirmed] = useState(false);

  const [mapMode, setMapMode] = useState<"edit" | "sim">("edit");
  const [simResult, setSimResult] = useState<{ ok: boolean | null } | null>(null);
  const { walker, play, clear } = useWalker();

  // 같은 건물은 한 번만 놓이므로 중복 제거한 배치 목록
  const placedIds = useMemo(
    () => Array.from(new Set(board.filter((b): b is string => !!b))),
    [board]
  );

  // 빈칸(건물 없는 슬롯) → 번호. board 순서대로 1,2,3… (지도 확정 시 표시)
  const slotNumbers = useMemo(() => {
    const m = new Map<number, number>();
    let k = 0;
    board.forEach((b, idx) => {
      if (b === null) m.set(idx, ++k);
    });
    return m;
  }, [board]);

  function changeSize(s: GridSize) {
    if (s === size) return;
    setSize(s);
    setBoard(Array(boardLen(s)).fill(null));
    setStart(null);
    setDestination(null);
    setConfirmed(false);
    setMapMode("edit");
    clear();
  }

  // 배치에서 빠진 건물이 목적지로 선택돼 있으면 해제 (시작점은 건물이 아님)
  useEffect(() => {
    if (destination && !placedIds.includes(destination)) setDestination(null);
  }, [placedIds, destination]);

  const directionsOk =
    steps.length >= 1 &&
    steps.every((s) => s.at) &&
    !!ending &&
    (ending.type !== "next_to" || !!ending.place);

  const canSim = !!start && steps.length >= 1 && steps.every((s) => s.at);

  function runSim() {
    if (!start) return;
    const res = simulate(
      start,
      steps.map((s) => ({ blocks: s.blocks, turn: s.turn })),
      size
    );
    play(res);
    const targetIdx = destination ? board.findIndex((b) => b === destination) : -1;
    setSimResult({ ok: targetIdx >= 0 ? arrived(res.final, targetIdx, size) : null });
  }

  const canSubmit =
    !!uid &&
    placedIds.length >= 2 &&
    !!start &&
    !!destination &&
    directionsOk &&
    !busy;

  async function submit() {
    if (!canSubmit || !start || !destination || !ending) return;
    setBusy(true);
    setMsg(null);
    try {
      await createChallenge(
        uid,
        { gridSize: size, board, start, steps, ending, destination },
        player ?? undefined
      );
      setMsg({ kind: "ok", text: "챌린지를 공개했어요! 친구들이 풀면 +5점을 받아요." });
      setBoard(Array(boardLen(size)).fill(null));
      setStart(null);
      setDestination(null);
      setSteps([]);
      setEnding(null);
      setConfirmed(false);
      setMapMode("edit");
      clear();
    } catch (e) {
      setMsg({ kind: "err", text: "저장에 실패했어요. 다시 시도해 주세요." });
      console.error(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <Section n={1} title="지도 만들기 — 블록 슬롯에 건물 + 출발 화살표">
        <div className="mb-3 flex items-center gap-2">
          <span className="text-xs text-[var(--md-sys-color-on-surface-variant)]">격자</span>
          {([3, 4] as GridSize[]).map((s) => (
            <button
              key={s}
              onClick={() => changeSize(s)}
              className={[
                "rounded-full px-3 py-1 text-sm font-medium",
                size === s
                  ? "bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)]"
                  : "bg-[var(--md-sys-color-surface-container-highest)] text-[var(--md-sys-color-on-surface-variant)]",
              ].join(" ")}
            >
              {s}×{s}
            </button>
          ))}
          <span className="ml-auto text-xs text-[var(--md-sys-color-primary)]">
            {start ? startLabelKo(start) : "출발 화살표를 누르세요"}
          </span>
        </div>

        {/* 편집 / 가보기 전환 */}
        <div className="mb-3 inline-flex rounded-full bg-[var(--md-sys-color-surface-container)] p-1 text-sm">
          {(
            [
              ["edit", "✏️ 편집"],
              ["sim", "🚶 가보기"],
            ] as ["edit" | "sim", string][]
          ).map(([m, label]) => (
            <button
              key={m}
              onClick={() => {
                setMapMode(m);
                if (m === "edit") clear();
                setSimResult(null);
              }}
              className={[
                "rounded-full px-4 py-1 font-medium transition",
                mapMode === m
                  ? "bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)]"
                  : "text-[var(--md-sys-color-on-surface-variant)]",
              ].join(" ")}
            >
              {label}
            </button>
          ))}
        </div>

        {mapMode === "edit" ? (
          <>
            <MapEditor
              size={size}
              board={board}
              onBoardChange={setBoard}
              start={start}
              onStartChange={setStart}
              slotNumbers={confirmed ? slotNumbers : undefined}
            />
            {/* 지도 확정 — 누르면 남은 빈칸에 번호가 매겨진다 */}
            <div className="mt-3 flex items-center justify-center gap-2">
              {confirmed ? (
                <>
                  <span className="rounded-full bg-[var(--md-sys-color-tertiary-container)] px-3 py-1.5 text-sm font-bold text-[var(--md-sys-color-on-tertiary-container)]">
                    ✓ 지도 확정됨 · 빈칸에 번호가 매겨졌어요
                  </span>
                  <button
                    onClick={() => setConfirmed(false)}
                    className="rounded-full border border-[var(--md-sys-color-outline)] px-3 py-1.5 text-sm font-medium text-[var(--md-sys-color-primary)]"
                  >
                    ✏️ 다시 편집
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setConfirmed(true)}
                  disabled={placedIds.length === 0}
                  className="rounded-full bg-[var(--md-sys-color-primary)] px-5 py-2 text-sm font-bold text-[var(--md-sys-color-on-primary)] transition hover:brightness-105 disabled:opacity-40"
                >
                  ✓ 지도 확정 (빈칸 번호 매기기)
                </button>
              )}
            </div>
          </>
        ) : (
          <div>
            <MapView
              size={size}
              board={board}
              start={start}
              walker={walker}
              highlightId={destination ?? undefined}
              slotNumbers={confirmed ? slotNumbers : undefined}
            />
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button
                onClick={runSim}
                disabled={!canSim}
                className="rounded-full bg-[var(--md-sys-color-primary)] px-5 py-2 text-sm font-medium text-[var(--md-sys-color-on-primary)] disabled:opacity-40"
              >
                ▶ 안내문대로 가보기
              </button>
              {!canSim && (
                <span className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                  출발 화살표 + 안내 문장이 있어야 걸어볼 수 있어요.
                </span>
              )}
              {simResult && (
                <span
                  className={
                    "text-sm font-medium " +
                    (simResult.ok === null
                      ? "text-[var(--md-sys-color-on-surface-variant)]"
                      : simResult.ok
                        ? "text-[var(--md-sys-color-primary)]"
                        : "text-[var(--md-sys-color-error)]")
                  }
                >
                  {simResult.ok === null
                    ? "목적지를 정하면 도착했는지 확인할 수 있어요."
                    : simResult.ok
                      ? "✓ 목적지에 도착했어요!"
                      : "✗ 안내문대로 가면 목적지에 도착하지 않아요. 안내를 고쳐보세요."}
                </span>
              )}
            </div>
          </div>
        )}
      </Section>

      <Section n={2} title="목적지(정답) 정하기 — 친구가 찾아야 할 건물">
        <PlaceChips ids={placedIds} selected={destination} onSelect={setDestination} />
      </Section>

      <Section n={3} title="길 안내문 만들기">
        <DirectionBuilder
          placedIds={placedIds}
          slotNumbers={
            confirmed ? [...slotNumbers.values()].sort((a, b) => a - b) : []
          }
          steps={steps}
          ending={ending}
          onStepsChange={setSteps}
          onEndingChange={setEnding}
        />
      </Section>

      {msg && (
        <p
          className={[
            "mb-3 rounded-xl p-3 text-sm",
            msg.kind === "ok"
              ? "bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)]"
              : "bg-[var(--md-sys-color-error-container)] text-[var(--md-sys-color-on-error-container)]",
          ].join(" ")}
        >
          {msg.text}
        </p>
      )}
      <button onClick={submit} disabled={!canSubmit} className={PRIMARY_BTN + " w-full"}>
        챌린지 공개하기
      </button>
      {!canSubmit && !busy && (
        <p className="mt-2 text-center text-xs text-[var(--md-sys-color-on-surface-variant)]">
          {!uid
            ? "개발 미리보기에서는 저장이 안 돼요. 실제 저장은 로그인 후 가능합니다."
            : "건물 2개 이상 배치 · 출발 화살표 · 목적지 · 안내문 1개 이상 + 도착 표현이 필요해요."}
        </p>
      )}
    </div>
  );
}

// ─────────────────────────── 풀기 탭 ───────────────────────────

function SolveTab({ uid, player }: { uid: string; player: Player | null }) {
  const [challenges, setChallenges] = useState<Challenge[] | null>(null);
  const [mySolves, setMySolves] = useState<Map<string, MySolve["status"]>>(
    new Map()
  );

  const load = useCallback(async () => {
    if (!uid) return; // 개발 미리보기(비로그인)
    try {
      const all = await listChallenges();
      // 같은 반(같은 학교 + 6학년 같은 반) 친구가 낸 것만, 본인 것 제외
      const sameClass = all.filter(
        (c) =>
          c.creatorUid !== uid &&
          !!player &&
          c.schoolName === player.schoolName &&
          c.classNo === player.classNo
      );
      setChallenges(sameClass);
      // 내 풀이 상태는 챌린지별 단건 조회(solverUid==본인 규칙 → 신뢰 가능, collectionGroup 회피)
      const entries = await Promise.all(
        sameClass.map(async (c) => {
          const mine = await getMySolve(c.id, uid).catch(() => null);
          return [c.id, mine?.status ?? null] as const;
        })
      );
      setMySolves(
        new Map(
          entries.filter((e): e is [string, MySolve["status"]] => e[1] != null)
        )
      );
    } catch (e) {
      console.error("listChallenges 실패", e);
      setChallenges([]); // 멈추지 않게 빈 목록으로
    }
  }, [uid, player]);

  useEffect(() => {
    load();
  }, [load]);

  if (!uid) return <PreviewNotice />;

  if (challenges === null)
    return <p className="text-center text-[var(--md-sys-color-on-surface-variant)]">불러오는 중…</p>;

  if (challenges.length === 0)
    return (
      <p className="rounded-2xl bg-[var(--md-sys-color-surface-container-high)] p-6 text-center text-sm text-[var(--md-sys-color-on-surface-variant)]">
        같은 반 친구가 만든 챌린지가 아직 없어요. ‘만들기’에서 먼저 만들어 보세요!
      </p>
    );

  return (
    <div className="space-y-4">
      {challenges.map((c) => (
        <ChallengeSolver
          key={c.id}
          challenge={c}
          uid={uid}
          player={player}
          status={mySolves.get(c.id) ?? null}
          onSubmitted={load}
        />
      ))}
    </div>
  );
}

function ChallengeSolver({
  challenge: c,
  uid,
  player,
  status,
  onSubmitted,
}: {
  challenge: Challenge;
  uid: string;
  player: Player | null;
  status: MySolve["status"] | null;
  onSubmitted: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [steps, setSteps] = useState<DirectionStep[]>([]);
  const [ending, setEnding] = useState<DirectionEnding | null>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const placedIds = useMemo(
    () => Array.from(new Set(c.board.filter((b): b is string => !!b))),
    [c.board]
  );
  // 빈칸 번호(출제자 지도와 동일 규칙) → 지도 표시 + 'at the' 선택지
  const slotNumMap = useMemo(() => {
    const m = new Map<number, number>();
    let k = 0;
    c.board.forEach((b, idx) => {
      if (b === null) m.set(idx, ++k);
    });
    return m;
  }, [c.board]);
  const slotNums = useMemo(() => [...slotNumMap.values()], [slotNumMap]);

  // 내가 쓴 안내문대로 걸어보는 시뮬레이션
  const { walker, play, clear } = useWalker();
  const [simOk, setSimOk] = useState<boolean | null>(null);
  function runSim() {
    if (steps.length === 0) return;
    const res = simulate(
      c.start,
      steps.map((s) => ({ blocks: s.blocks, turn: s.turn })),
      c.gridSize
    );
    play(res);
    const targetIdx = c.destination
      ? c.board.findIndex((b) => b === c.destination)
      : -1;
    setSimOk(targetIdx >= 0 ? arrived(res.final, targetIdx, c.gridSize) : null);
  }

  async function openSolve() {
    setOpen(true);
    if (!loaded) {
      const mine = await getMySolve(c.id, uid).catch(() => null);
      if (mine) {
        setSteps(mine.steps ?? []);
        setEnding(mine.ending ?? null);
      }
      setLoaded(true);
    }
  }

  const canSubmit =
    steps.length >= 1 &&
    steps.every((s) => s.at) &&
    !!ending &&
    (ending.type !== "next_to" || !!ending.place) &&
    !busy;

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    try {
      await submitSolution(c.id, uid, steps, ending, player ?? undefined);
      setOpen(false);
      onSubmitted();
    } finally {
      setBusy(false);
    }
  }

  const badge =
    status === "approved" ? (
      <span className="rounded-full bg-[var(--md-sys-color-tertiary-container)] px-3 py-1 text-xs font-bold text-[var(--md-sys-color-on-tertiary-container)]">
        ✓ 정답 +{POINTS_PER_SOLVE}
      </span>
    ) : status === "rejected" ? (
      <span className="rounded-full bg-[var(--md-sys-color-error-container)] px-3 py-1 text-xs font-bold text-[var(--md-sys-color-on-error-container)]">
        다시 도전해요
      </span>
    ) : status === "pending" ? (
      <span className="rounded-full bg-[var(--md-sys-color-secondary-container)] px-3 py-1 text-xs font-bold text-[var(--md-sys-color-on-secondary-container)]">
        제출함 · 채점 대기
      </span>
    ) : null;

  return (
    <div className="rounded-2xl bg-[var(--md-sys-color-surface-container-high)] p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-medium text-[var(--md-sys-color-on-surface)]">
          <span className="text-xl">{avatarFromUid(c.creatorUid)}</span>
          친구의 챌린지
        </p>
        <div className="flex items-center gap-2">
          {badge}
          {/* 정답 확정된 챌린지는 다시 풀 수 없음(점수 무효화 방지) — 펼친 상태면 접기만 */}
          {(status !== "approved" || open) && (
            <button
              onClick={() => (open ? setOpen(false) : openSolve())}
              className="rounded-full bg-[var(--md-sys-color-primary)] px-4 py-1.5 text-sm font-medium text-[var(--md-sys-color-on-primary)]"
            >
              {open ? "접기" : status ? "다시 풀기" : "풀기"}
            </button>
          )}
        </div>
      </div>

      {open && (
        <>
          <p className="mb-2 text-xs text-[var(--md-sys-color-on-surface-variant)]">
            🎯 노란 테두리 건물(목적지)로 가는 길을 영어로 안내해 보세요. 출발은 빨간 화살표예요.
          </p>
          <MapView
            size={c.gridSize}
            board={c.board}
            start={c.start}
            walker={walker}
            highlightId={c.destination || undefined}
            slotNumbers={slotNumMap}
          />
          <div className="mt-3">
            <DirectionBuilder
              placedIds={placedIds}
              slotNumbers={slotNums}
              steps={steps}
              ending={ending}
              onStepsChange={setSteps}
              onEndingChange={setEnding}
            />
          </div>
          {/* 안내문대로 걸어보기(시뮬레이션) — 목적지에 닿는지 확인 */}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              onClick={runSim}
              disabled={steps.length === 0}
              className="rounded-full border border-[var(--md-sys-color-outline)] px-4 py-1.5 text-sm font-medium text-[var(--md-sys-color-primary)] disabled:opacity-40"
            >
              🚶 내 안내문대로 가보기
            </button>
            {simOk === true && (
              <span className="text-sm font-bold text-[var(--md-sys-color-primary)]">
                ✓ 목적지에 도착했어요!
              </span>
            )}
            {simOk === false && (
              <span className="text-sm text-[var(--md-sys-color-error)]">
                목적지에 닿지 않았어요. 안내문을 고쳐 볼까요?
              </span>
            )}
          </div>
          <button
            onClick={() => {
              clear();
              submit();
            }}
            disabled={!canSubmit}
            className="mt-3 w-full rounded-full bg-[var(--md-sys-color-primary)] px-5 py-2.5 text-sm font-bold text-[var(--md-sys-color-on-primary)] transition hover:brightness-105 disabled:opacity-40"
          >
            {busy ? "제출 중…" : "길안내문 제출하기"}
          </button>
        </>
      )}
    </div>
  );
}

// ─────────────────────────── 점수 탭 ───────────────────────────

function ScoreTab({ uid, isTeacher }: { uid: string; isTeacher: boolean }) {
  const [score, setScore] = useState<MyScore | null>(null);
  const [mine, setMine] = useState<Challenge[] | null>(null);

  const reload = useCallback(() => {
    if (!uid) return;
    getMyScore(uid).then(setScore).catch(() => {});
    listMyChallenges(uid).then(setMine).catch(() => {});
  }, [uid]);
  useEffect(() => {
    reload();
  }, [reload]);

  if (!uid) return <PreviewNotice />;
  if (!score)
    return <p className="text-center text-[var(--md-sys-color-on-surface-variant)]">불러오는 중…</p>;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-[var(--md-sys-color-primary-container)] p-6 text-center">
        <p className="text-sm text-[var(--md-sys-color-on-primary-container)]">내 점수</p>
        <p className="text-4xl font-bold text-[var(--md-sys-color-on-primary-container)]">
          {score.points}점
        </p>
        <p className="mt-1 text-xs text-[var(--md-sys-color-on-primary-container)]">
          내 정답 {score.solvedCount} · 내 챌린지 정답 처리 {score.createdSolvedCount}
        </p>
      </div>

      <XpRequestCard uid={uid} score={score.points} />

      {isTeacher ? (
        // 교사는 채점을 '채점' 탭(반 전체)에서 — 여기선 점수만.
        <p className="rounded-2xl bg-[var(--md-sys-color-surface-container-high)] p-4 text-center text-sm text-[var(--md-sys-color-on-surface-variant)]">
          채점은 상단 <b className="text-[var(--md-sys-color-primary)]">“채점”</b> 탭에서
          우리 반 전체 챌린지를 확인·확정하세요.
        </p>
      ) : (
        <div>
          <h2 className="mb-2 px-1 text-sm font-bold text-[var(--md-sys-color-on-surface)]">
            내가 만든 챌린지 — 친구 답 1차 확인
          </h2>
          {mine === null ? (
            <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">불러오는 중…</p>
          ) : mine.length === 0 ? (
            <p className="rounded-2xl bg-[var(--md-sys-color-surface-container-high)] p-4 text-sm text-[var(--md-sys-color-on-surface-variant)]">
              아직 만든 챌린지가 없어요.
            </p>
          ) : (
            <div className="space-y-3">
              {mine.map((c) => (
                <ChallengeReview
                  key={c.id}
                  challenge={c}
                  viewerUid={uid}
                  isTeacher={false}
                  onChange={reload}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** 교사 채점 뷰 — 우리 반 전체 챌린지(학생이 만든 것 포함)를 보고 확정. */
function GradeTab({ uid, player }: { uid: string; player: Player | null }) {
  const [challenges, setChallenges] = useState<Challenge[] | null>(null);
  const reload = useCallback(() => {
    if (!uid || !player) return;
    listChallenges()
      .then((all) =>
        setChallenges(
          all.filter(
            (c) =>
              c.schoolName === player.schoolName && c.classNo === player.classNo
          )
        )
      )
      .catch(() => setChallenges([]));
  }, [uid, player]);
  useEffect(() => {
    reload();
  }, [reload]);

  if (!uid) return <PreviewNotice />;
  if (!player)
    return (
      <p className="rounded-2xl bg-[var(--md-sys-color-surface-container-high)] p-4 text-sm text-[var(--md-sys-color-on-surface-variant)]">
        학교·반을 먼저 선택하세요.
      </p>
    );
  if (challenges === null)
    return <p className="text-center text-[var(--md-sys-color-on-surface-variant)]">불러오는 중…</p>;

  return (
    <div>
      <h2 className="mb-2 px-1 text-sm font-bold text-[var(--md-sys-color-on-surface)]">
        반 전체 채점 · {player.schoolName} 6학년 {player.classNo}반
      </h2>
      {challenges.length === 0 ? (
        <p className="rounded-2xl bg-[var(--md-sys-color-surface-container-high)] p-4 text-sm text-[var(--md-sys-color-on-surface-variant)]">
          이 반에 만들어진 챌린지가 아직 없어요.
        </p>
      ) : (
        <div className="space-y-3">
          {challenges.map((c) => (
            <ChallengeReview
              key={c.id}
              challenge={c}
              viewerUid={uid}
              isTeacher
              onChange={reload}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** 활동 점수로 러닝크루(LMS) 학급 교사에게 경험치 요청 — XP = ⌈점수/3⌉. */
function XpRequestCard({ uid, score }: { uid: string; score: number }) {
  const [classes, setClasses] = useState<{ id: string; name: string }[] | null>(
    null
  );
  const [cid, setCid] = useState("");
  const [req, setReq] = useState<XpRequest | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const xp = Math.ceil(score / 3);

  useEffect(() => {
    if (!uid) {
      setClasses([]);
      return;
    }
    listMyClasses(uid)
      .then((cs) => {
        const list = cs.map((c) => ({ id: c.id, name: c.name }));
        setClasses(list);
        if (list.length) setCid((p) => p || list[0].id);
      })
      .catch(() => setClasses([]));
  }, [uid]);

  useEffect(() => {
    if (!cid) {
      setReq(null);
      return;
    }
    getMyXpRequest(cid, uid, "eng/5-3").then(setReq).catch(() => setReq(null));
  }, [cid, uid]);

  async function request() {
    if (!cid || xp <= 0 || busy) return;
    setBusy(true);
    setErr(null);
    try {
      await requestClassXp(cid, uid, {
        activity: "eng/5-3",
        label: "길찾기 챌린지",
        score,
      });
      // 쓰기 후 실제로 저장됐는지 확인 — 규칙에 막혀 조용히 실패하는 경우를 잡는다.
      const saved = await getMyXpRequest(cid, uid, "eng/5-3");
      if (!saved) throw new Error("not-saved");
      setReq(saved);
    } catch (e) {
      console.error("경험치 요청 실패", e);
      const code = (e as { code?: string })?.code ?? "";
      setErr(
        code.includes("permission-denied")
          ? "이 학급의 멤버가 아니라서 요청이 막혔어요. 선생님께 학급 참여(코드 입장)를 확인해 주세요."
          : "요청을 보내지 못했어요. 인터넷 상태를 확인하고 다시 시도해 주세요."
      );
    } finally {
      setBusy(false);
    }
  }

  if (classes === null) return null;

  return (
    <div className="rounded-2xl bg-[var(--md-sys-color-surface-container-high)] p-4">
      <p className="text-sm font-bold text-[var(--md-sys-color-on-surface)]">
        🎁 활동 점수로 경험치 요청
      </p>
      <p className="mt-0.5 mb-3 text-xs text-[var(--md-sys-color-on-surface-variant)]">
        내 점수 {score}점 → 러닝크루 <b>경험치 {xp} XP</b> (점수÷3, 올림). 선생님이
        승인하면 학급 경험치로 들어가요.
      </p>
      {classes.length === 0 ? (
        <p className="rounded-xl bg-[var(--md-sys-color-surface-container)] px-3 py-2 text-xs text-[var(--md-sys-color-on-surface-variant)]">
          러닝크루 학급에 가입돼 있어야 경험치를 요청할 수 있어요.
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {classes.length > 1 && (
            <select
              value={cid}
              onChange={(e) => setCid(e.target.value)}
              className="m3-field"
            >
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
          {req?.status === "granted" ? (
            <span className="rounded-full bg-[var(--md-sys-color-tertiary-container)] px-3 py-1.5 text-sm font-bold text-[var(--md-sys-color-on-tertiary-container)]">
              ✅ 경험치 {req.points} XP 지급됨
            </span>
          ) : req?.status === "pending" ? (
            <span className="rounded-full bg-[var(--md-sys-color-secondary-container)] px-3 py-1.5 text-sm font-bold text-[var(--md-sys-color-on-secondary-container)]">
              ⏳ 요청함 · 선생님 승인 대기 ({req.points} XP)
            </span>
          ) : (
            <button
              onClick={request}
              disabled={xp <= 0 || busy}
              className="rounded-full bg-[var(--md-sys-color-primary)] px-4 py-2 text-sm font-bold text-[var(--md-sys-color-on-primary)] transition hover:brightness-105 disabled:opacity-40"
            >
              {busy
                ? "요청 중…"
                : req?.status === "declined"
                  ? `거절됨 · 다시 요청 (${xp} XP)`
                  : `선생님께 경험치 요청 (${xp} XP)`}
            </button>
          )}
        </div>
      )}
      {err && (
        <p className="mt-2 rounded-xl bg-[var(--md-sys-color-error-container)] px-3 py-2 text-xs font-semibold text-[var(--md-sys-color-on-error-container)]">
          {err}
        </p>
      )}
    </div>
  );
}

/** 챌린지 1개의 채점 — 푼 사람 수만큼 탭으로 보며 정답 처리.
 *  viewerUid==출제자면 1차 체크 버튼 노출, isTeacher면 확정 버튼 노출. */
function ChallengeReview({
  challenge: c,
  viewerUid,
  isTeacher,
  onChange,
}: {
  challenge: Challenge;
  viewerUid: string;
  isTeacher: boolean;
  onChange: () => void;
}) {
  const [solvers, setSolvers] = useState<Solver[]>([]);
  const [tab, setTab] = useState(0);
  useEffect(() => watchSolvers(c.id, setSolvers), [c.id]);
  const isCreator = c.creatorUid === viewerUid;

  const idx = Math.min(tab, Math.max(0, solvers.length - 1));
  const cur = solvers[idx];
  const dot = (s: Solver) =>
    s.status === "approved"
      ? "✅"
      : s.status === "rejected"
        ? "❌"
        : s.creatorMark === "ok"
          ? "🟢"
          : s.creatorMark === "no"
            ? "🔴"
            : "·";

  return (
    <div className="rounded-2xl bg-[var(--md-sys-color-surface-container-high)] p-4">
      <p className="mb-2 text-sm font-semibold text-[var(--md-sys-color-on-surface)]">
        {c.gridSize}×{c.gridSize} 지도 · 목적지{" "}
        {PLACE_BY_ID[c.destination ?? ""]?.en ?? "—"} · 푼 사람 {solvers.length}명
      </p>
      {solvers.length === 0 ? (
        <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">
          아직 푼 친구가 없어요.
        </p>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {solvers.map((s, i) => (
              <button
                key={s.uid}
                onClick={() => setTab(i)}
                className={[
                  "rounded-full px-3 py-1.5 text-sm font-semibold transition",
                  i === idx
                    ? "bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)]"
                    : "bg-[var(--md-sys-color-surface-container-highest)] text-[var(--md-sys-color-on-surface-variant)]",
                ].join(" ")}
              >
                {avatarFromUid(s.uid)} {s.classNo}반 {dot(s)}
              </button>
            ))}
          </div>
          {cur && (
            <SolverReview
              challenge={c}
              solver={cur}
              isCreator={isCreator}
              isTeacher={isTeacher}
              onChange={onChange}
            />
          )}
        </>
      )}
    </div>
  );
}

/** 한 명의 제출 안내문 + 채점 컨트롤. 한 번 더 누르면 지도(+가보기)도 표시. */
function SolverReview({
  challenge: c,
  solver,
  isCreator,
  isTeacher,
  onChange,
}: {
  challenge: Challenge;
  solver: Solver;
  isCreator: boolean;
  isTeacher: boolean;
  onChange: () => void;
}) {
  const cid = c.id;
  const [showMap, setShowMap] = useState(false);
  const { walker, play } = useWalker();
  const slotNumMap = useMemo(() => {
    const m = new Map<number, number>();
    let k = 0;
    c.board.forEach((b, idx) => {
      if (b === null) m.set(idx, ++k);
    });
    return m;
  }, [c.board]);
  function runSim() {
    if (solver.steps.length === 0) return;
    play(
      simulate(
        c.start,
        solver.steps.map((s) => ({ blocks: s.blocks, turn: s.turn })),
        c.gridSize
      )
    );
  }

  const lines = directionsToEnglish(solver.steps, solver.ending);
  const statusLabel =
    solver.status === "approved"
      ? "정답 확정 ✅"
      : solver.status === "rejected"
        ? "반려 ❌"
        : "채점 대기";

  return (
    <div className="rounded-xl bg-[var(--md-sys-color-surface-container-low)] p-3">
      <p className="mb-1 text-xs text-[var(--md-sys-color-on-surface-variant)]">
        {solver.schoolName} · 6학년 {solver.classNo}반 {avatarFromUid(solver.uid)} ·{" "}
        {statusLabel}
        {solver.creatorMark &&
          ` · 출제자: ${solver.creatorMark === "ok" ? "정답✓" : "아님✗"}`}
      </p>
      <div className="mb-2 rounded-lg bg-[var(--md-sys-color-secondary-container)] p-2">
        {lines.length === 0 ? (
          <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">
            (작성한 안내문 없음)
          </p>
        ) : (
          lines.map((l, i) => (
            <p
              key={i}
              className="text-sm leading-relaxed text-[var(--md-sys-color-on-secondary-container)]"
            >
              {l}
            </p>
          ))
        )}
      </div>

      {/* 지도 보기 — 채점하며 지도+안내문 시뮬로 확인 */}
      <button
        onClick={() => setShowMap((v) => !v)}
        className="mb-2 rounded-full border border-[var(--md-sys-color-outline-variant)] px-3 py-1 text-xs font-medium text-[var(--md-sys-color-primary)]"
      >
        {showMap ? "지도 숨기기" : "🗺️ 지도 보기"}
      </button>
      {showMap && (
        <div className="mb-2">
          <MapView
            size={c.gridSize}
            board={c.board}
            start={c.start}
            walker={walker}
            highlightId={c.destination || undefined}
            slotNumbers={slotNumMap}
          />
          <button
            onClick={runSim}
            disabled={solver.steps.length === 0}
            className="mt-2 rounded-full border border-[var(--md-sys-color-outline)] px-3 py-1.5 text-sm font-medium text-[var(--md-sys-color-primary)] disabled:opacity-40"
          >
            🚶 이 안내문대로 가보기
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {isCreator && (
          <>
            <button
              onClick={() => setCreatorMark(cid, solver.uid, true).catch(() => {})}
              className="rounded-full bg-[var(--md-sys-color-tertiary-container)] px-3 py-1.5 text-sm font-bold text-[var(--md-sys-color-on-tertiary-container)]"
            >
              ✓ 정답 같아요
            </button>
            <button
              onClick={() => setCreatorMark(cid, solver.uid, false).catch(() => {})}
              className="rounded-full bg-[var(--md-sys-color-error-container)] px-3 py-1.5 text-sm font-bold text-[var(--md-sys-color-on-error-container)]"
            >
              ✗ 아니에요
            </button>
          </>
        )}
        {isTeacher && (
          <>
            <span className="ml-1 self-center text-xs text-[var(--md-sys-color-on-surface-variant)]">
              교사 확정 →
            </span>
            <button
              onClick={async () => {
                await confirmSolve(cid, solver.uid, true);
                onChange();
              }}
              className="rounded-full bg-[var(--md-sys-color-primary)] px-3 py-1.5 text-sm font-bold text-[var(--md-sys-color-on-primary)]"
            >
              정답 처리
            </button>
            <button
              onClick={async () => {
                await confirmSolve(cid, solver.uid, false);
                onChange();
              }}
              className="rounded-full border border-[var(--md-sys-color-outline)] px-3 py-1.5 text-sm font-bold text-[var(--md-sys-color-on-surface-variant)]"
            >
              반려
            </button>
          </>
        )}
      </div>
    </div>
  );
}
