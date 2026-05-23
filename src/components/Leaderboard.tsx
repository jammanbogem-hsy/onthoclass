"use client";

import { useMemo } from "react";
import { Icon } from "@/components/Icon";
import { xpLevel } from "@/lib/xp";

type Entry = { uid: string; displayName: string; photoURL?: string };

const RANK_BG = ["#f6c343", "#c7ced6", "#e3a868"]; // 금/은/동

/** 경험치 랭킹 — 학생 목록 + xpMap을 받아 내림차순 정렬해 보여준다 */
export function Leaderboard({
  students,
  xpMap,
  meUid,
  max,
}: {
  students: Entry[];
  xpMap: Record<string, number>;
  meUid?: string;
  max?: number;
}) {
  const ranked = useMemo(() => {
    const list = students
      .map((s) => ({ ...s, xp: xpMap[s.uid] ?? 0 }))
      .sort((a, b) => b.xp - a.xp || a.displayName.localeCompare(b.displayName));
    return max ? list.slice(0, max) : list;
  }, [students, xpMap, max]);

  if (ranked.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-black/45">
        아직 경험치를 받은 학생이 없습니다.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-1.5">
      {ranked.map((s, i) => {
        const lv = xpLevel(s.xp);
        const me = s.uid === meUid;
        return (
          <li
            key={s.uid}
            className={`flex items-center gap-3 rounded-xl px-3 py-2 ${
              me
                ? "bg-[var(--md-sys-color-primary-container)]"
                : "bg-[var(--md-sys-color-surface-container)]"
            }`}
          >
            {/* 순위 */}
            <span
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-extrabold text-white"
              style={{
                background: i < 3 ? RANK_BG[i] : "var(--md-sys-color-outline)",
              }}
            >
              {i + 1}
            </span>
            {/* 이름 */}
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 truncate text-sm font-semibold">
                {s.displayName}
                {me && (
                  <span className="rounded-full bg-[var(--md-sys-color-primary)] px-1.5 py-0.5 text-[9px] font-bold text-white">
                    나
                  </span>
                )}
              </p>
              <span className="mt-0.5 block h-1.5 w-full max-w-[160px] overflow-hidden rounded-full bg-black/10">
                <span
                  className="block h-full rounded-full bg-[var(--md-sys-color-primary)]"
                  style={{ width: `${Math.round(lv.pct * 100)}%` }}
                />
              </span>
            </div>
            {/* 레벨/XP */}
            <div className="shrink-0 text-right">
              <p className="flex items-center justify-end gap-0.5 text-xs font-extrabold text-[var(--md-sys-color-primary)]">
                <Icon name="military_tech" size={14} />
                Lv.{lv.level}
              </p>
              <p className="text-[11px] text-black/45">
                {s.xp.toLocaleString()} XP
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
