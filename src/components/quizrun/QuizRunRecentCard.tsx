"use client";

/**
 * 학생 학급 화면의 "최근 퀴즈런" 카드 — 마지막으로 끝난 퀴즈런의 순위와 러닝볼.
 *
 * 학생 전용이다. 교사는 학급 관리 → 게임 이력(QuizRunHistoryPanel)에서 지난 퀴즈런을
 * 전부 더 자세히 보므로, 메인 화면이 지저분해지지 않게 교사 화면에서는 띄우지 않는다.
 * 학생은 그 모달에 들어갈 수 없어 여기서만 자기 러닝볼과 등수를 볼 수 있다.
 *
 * 끝난 퀴즈런이 없으면 아무것도 그리지 않는다 — 빈 카드가 자리를 차지하지 않도록.
 */

import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { useNameMask } from "@/components/NameMask";
import { getGames, type Game } from "@/lib/games";
import { computeRanking, getRuns, type QuizRun } from "@/lib/quizrun";

const MEDAL = ["#d9a400", "#9098a1", "#b0763a"];
/** 카드에 세울 사진 수 — 그리드 전체는 게임 이력에서 본다 */
const MAX_SHOTS = 8;

export function QuizRunRecentCard({
  cid,
  uid,
}: {
  cid: string;
  /** 본인 uid — 자기 줄과 자기 사진에 표시를 준다 */
  uid?: string;
}) {
  const { mask } = useNameMask();
  const [game, setGame] = useState<Game | null>(null);
  const [runs, setRuns] = useState<QuizRun[] | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const games = await getGames(cid);
        const latest = games.find(
          (g) => g.kind === "quiz-run" && g.status === "done"
        );
        if (!alive || !latest) return;
        setGame(latest);
        const r = await getRuns(cid, latest.id);
        if (alive) setRuns(r);
      } catch {
        // 대시보드의 부가 카드다 — 실패하면 조용히 접는다
      }
    })();
    return () => {
      alive = false;
    };
  }, [cid]);

  if (!game || !runs || runs.length === 0) return null;

  const ranking = computeRanking(runs);
  const shotByUid = new Map(
    runs.filter((r) => r.shotUrl).map((r) => [r.uid, r.shotUrl as string])
  );
  const shots = ranking
    .map((r) => ({ ...r, shotUrl: shotByUid.get(r.uid) }))
    .filter((r) => r.shotUrl)
    .slice(0, MAX_SHOTS);
  const myShot = uid ? shotByUid.get(uid) : undefined;
  const myRank = uid ? ranking.findIndex((r) => r.uid === uid) : -1;

  return (
    <section className="flex flex-col gap-3 rounded-3xl bg-[var(--md-sys-color-surface-container)] p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-bold">
          <Icon
            name="sports_esports"
            size={18}
            className="text-[var(--md-sys-color-primary)]"
          />
          최근 퀴즈런
          <span className="text-xs font-normal text-[var(--md-sys-color-on-surface-variant)]">
            {game.link.name}
          </span>
        </h3>
        {myRank >= 0 && (
          <span className="rounded-full bg-[var(--md-sys-color-primary-container)] px-2.5 py-0.5 text-xs font-bold text-[var(--md-sys-color-on-primary-container)]">
            내 등수 {myRank + 1}등 · {ranking[myRank].collected}개
          </span>
        )}
      </div>

      {/* 러닝볼 — 등수 순으로 늘어놓는다 */}
      {shots.length > 0 ? (
        <ul className="flex gap-2 overflow-x-auto pb-1">
          {myShot && (
            <li className="w-24 shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={myShot}
                alt="내 러닝볼"
                className="aspect-square w-full rounded-2xl object-cover ring-2 ring-[var(--md-sys-color-primary)]"
                loading="lazy"
              />
              <p className="mt-1 text-center text-[11px] font-bold text-[var(--md-sys-color-primary)]">
                내 러닝볼
              </p>
            </li>
          )}
          {shots
            .filter((s) => s.uid !== uid)
            .map((s) => (
              <li key={s.uid} className="w-24 shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={s.shotUrl}
                  alt={`${mask(s.name)}의 러닝볼`}
                  className="aspect-square w-full rounded-2xl object-cover"
                  loading="lazy"
                />
                <p className="mt-1 truncate text-center text-[11px] font-semibold text-[var(--md-sys-color-on-surface-variant)]">
                  {mask(s.name)}
                </p>
              </li>
            ))}
        </ul>
      ) : (
        <p className="rounded-2xl bg-[var(--md-sys-color-surface-container-high)] px-3 py-4 text-center text-xs text-[var(--md-sys-color-on-surface-variant)]">
          이 게임에는 저장된 러닝볼 사진이 없어요.
        </p>
      )}

      {/* 상위 순위 */}
      <ol className="flex flex-col gap-1">
        {ranking.slice(0, 3).map((r, i) => (
          <li
            key={r.uid}
            className={`flex items-center gap-2 rounded-xl px-2.5 py-1.5 text-sm ${
              r.uid === uid
                ? "bg-[var(--md-sys-color-primary-container)] font-bold text-[var(--md-sys-color-on-primary-container)]"
                : ""
            }`}
          >
            <Icon name="trophy" size={16} fill style={{ color: MEDAL[i] }} />
            <span className="min-w-0 flex-1 truncate">{mask(r.name)}</span>
            <span className="tabular-nums font-bold">{r.collected}개</span>
            <span className="w-16 text-right text-xs tabular-nums opacity-70">
              {Math.round(
                runs.find((x) => x.uid === r.uid)?.score ?? 0
              ).toLocaleString()}
              점
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
