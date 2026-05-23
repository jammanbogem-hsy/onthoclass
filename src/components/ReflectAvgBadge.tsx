"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import {
  listQuestions,
  listQuestionSubmissions,
  watchQuestionSubmissions,
  type Submission,
} from "@/lib/lessons";

/**
 * 차시의 수업 후 성찰 이해도(별)·흥미도(하트) 평균 배지.
 * realtime=true면 실시간 구독, 아니면 1회 조회(목록/그리드용).
 */
export function ReflectAvgBadge({
  cid,
  lid,
  realtime = false,
  size = 15,
  className = "",
}: {
  cid: string;
  lid: string;
  realtime?: boolean;
  size?: number;
  className?: string;
}) {
  const [agg, setAgg] = useState<{ u: number; i: number; n: number }>({
    u: 0,
    i: 0,
    n: 0,
  });

  useEffect(() => {
    let alive = true;
    const offs: (() => void)[] = [];
    const perQ: Record<string, Submission[]> = {};
    const apply = (all: Submission[]) => {
      if (!alive) return;
      if (all.length === 0) {
        setAgg({ u: 0, i: 0, n: 0 });
        return;
      }
      setAgg({
        u: all.reduce((a, s) => a + (s.understanding ?? 0), 0) / all.length,
        i: all.reduce((a, s) => a + (s.interest ?? 0), 0) / all.length,
        n: all.length,
      });
    };
    listQuestions(cid, lid)
      .then((qs) => {
        if (!alive) return;
        const refl = qs.filter((q) => q.kind === "reflection");
        if (refl.length === 0) return;
        if (realtime) {
          refl.forEach((q) =>
            offs.push(
              watchQuestionSubmissions(cid, lid, q.id, (subs) => {
                perQ[q.id] = subs.filter((s) => (s.understanding ?? 0) > 0);
                apply(Object.values(perQ).flat());
              })
            )
          );
        } else {
          Promise.all(
            refl.map((q) => listQuestionSubmissions(cid, lid, q.id))
          ).then((arr) => {
            apply(arr.flat().filter((s) => (s.understanding ?? 0) > 0));
          });
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
      offs.forEach((o) => o());
    };
  }, [cid, lid, realtime]);

  if (agg.n === 0) return null;
  return (
    <span
      className={`inline-flex items-center gap-2.5 rounded-full bg-[var(--md-sys-color-surface-container-high)] px-2.5 py-1 text-xs font-bold ${className}`}
    >
      <span className="inline-flex items-center gap-0.5">
        <Icon name="star" size={size} fill style={{ color: "#f5a623" }} />
        {agg.u.toFixed(1)}
      </span>
      <span className="inline-flex items-center gap-0.5">
        <Icon name="favorite" size={size} fill style={{ color: "#ef4444" }} />
        {agg.i.toFixed(1)}
      </span>
    </span>
  );
}
