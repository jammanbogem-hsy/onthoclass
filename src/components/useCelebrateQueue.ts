"use client";

import { useCallback, useEffect, useState } from "react";

export type CelebrateItem = {
  kind: "level" | "mission" | "present";
  title: string;
  subtitle?: string;
  kicker?: string;
  icon?: string;
};

// 미션이 레벨업보다 먼저 오도록 안정 정렬 (그 외 순서는 유지)
function missionFirst(items: CelebrateItem[]): CelebrateItem[] {
  return items
    .map((it, i) => [it, i] as const)
    .sort(([a, ai], [b, bi]) => {
      const w = (k: CelebrateItem["kind"]) => (k === "mission" ? 0 : 1);
      return w(a.kind) - w(b.kind) || ai - bi;
    })
    .map(([it]) => it);
}

/**
 * 축하 연출(미션 완료 / 레벨업)을 한 번에 하나씩 순차 노출하는 큐.
 * 동시에 여러 건이 들어오면 잠깐 모아(coalesce) 미션 → 레벨업 순으로 보여준다.
 * 반환된 `current`를 렌더하고, 닫힐 때 `done()`을 호출하면 다음 항목으로 넘어간다.
 */
export function useCelebrateQueue(coalesceMs = 200) {
  const [queue, setQueue] = useState<CelebrateItem[]>([]);
  const [current, setCurrent] = useState<CelebrateItem | null>(null);

  const enqueue = useCallback((item: CelebrateItem) => {
    setQueue((q) => missionFirst([...q, item]));
  }, []);

  const done = useCallback(() => setCurrent(null), []);

  // 표시 중인 게 없고 대기열이 차면, 동시 발생분을 모은 뒤 첫 항목을 노출
  useEffect(() => {
    if (current || queue.length === 0) return;
    const t = setTimeout(() => {
      setQueue((q) => {
        if (q.length === 0) return q;
        const sorted = missionFirst(q);
        setCurrent(sorted[0]);
        return sorted.slice(1);
      });
    }, coalesceMs);
    return () => clearTimeout(t);
  }, [current, queue, coalesceMs]);

  return { current, enqueue, done };
}
