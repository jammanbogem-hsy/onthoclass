"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { recordUsage, usageFeature, USAGE_LABELS, type UsageEntry, type UsageFeature } from "@/lib/usage";

const BUCKET = 300_000;
type Pending = Record<string, UsageEntry>;
/** ClassLive의 학급 권한 판정을 공유해 추가 멤버 구독을 만들지 않는다. */
export function UsageTracker({ cid, uid, override }: { cid: string; uid: string; override?: UsageFeature }) {
  const path = usePathname();
  const feature = useRef<UsageFeature>("other");
  useEffect(() => { feature.current = override ?? usageFeature(path); }, [path, override]);
  useEffect(() => {
    const key = `usage:v1:${uid}:${cid}`;
    const pulseKey = `usage:pulse:${uid}`;
    let lastInput = 0;
    let lastTick = Date.now();
    let sending = false;
    let lastFlush = 0;
    let stopped = false;
    let fallback: Pending = {};
    const read = (): Pending => {
      try {
        const value = JSON.parse(localStorage.getItem(key) ?? "{}");
        if (!value || typeof value !== "object" || Array.isArray(value)) return {};
        const valid: Pending = {};
        for (const candidate of Object.values(value) as UsageEntry[]) {
          if (!candidate || !Number.isSafeInteger(candidate.start) || candidate.start % BUCKET || candidate.start < Date.now() - 7 * 86400_000 || !candidate.counts || typeof candidate.counts !== "object") continue;
          const counts = Object.entries(candidate.counts);
          if (counts.every(([feature, count]) => Object.prototype.hasOwnProperty.call(USAGE_LABELS, feature) && Number.isInteger(count) && count >= 0 && count <= 300) && counts.reduce((sum, [, count]) => sum + count, 0) <= 300) valid[candidate.start] = candidate;
        }
        return valid;
      } catch { return fallback; }
    };
    const save = (pending: Pending) => { fallback = pending; try { localStorage.setItem(key, JSON.stringify(pending)); } catch { /* 이 탭의 메모리에 유지 */ } };
    const locked = async (action: () => void) => {
      if (navigator.locks) await navigator.locks.request(`usage:${uid}`, action);
      else action(); // 포커스가 있는 탭만 계측하며 서버에서도 구간을 300초로 제한한다.
    };
    const tick = async () => {
      const now = Date.now();
      const previous = lastTick;
      lastTick = now;
      if (stopped || document.visibilityState !== "visible" || !document.hasFocus() || !lastInput || now - lastInput > 60_000) return;
      await locked(() => {
        let otherTick = previous;
        try { otherTick = Math.max(previous, Number(localStorage.getItem(pulseKey)) || 0); localStorage.setItem(pulseKey, String(now)); } catch { /* 로컬 저장 비활성 */ }
        const start = Math.max(otherTick, now - 10_000, lastInput - 10_000);
        const pending = read();
        for (let cursor = start; cursor < now;) {
          const bucket = Math.floor(cursor / BUCKET) * BUCKET;
          const end = Math.min(now, bucket + BUCKET);
          const seconds = Math.floor((end - cursor) / 1000);
          if (seconds > 0) {
            const entry = pending[bucket] ?? { start: bucket, counts: {} };
            const used = Object.values(entry.counts).reduce((sum, value) => sum + (value ?? 0), 0);
            entry.counts[feature.current] = (entry.counts[feature.current] ?? 0) + Math.min(seconds, 300 - used);
            pending[bucket] = entry;
          }
          cursor = end;
        }
        // 오프라인 대기열은 최근 7일, 최대 288구간으로 제한한다.
        const keys = Object.keys(pending).sort((a, b) => Number(b) - Number(a));
        keys.forEach((k, i) => { if (i >= 288 || Number(k) < now - 7 * 86400_000) delete pending[k]; });
        save(pending);
      });
    };
    const flush = async (partial = false) => {
      if (sending || Date.now() - lastFlush < 60_000 || (!partial && (document.visibilityState !== "visible" || !document.hasFocus()))) return;
      const send = async () => {
        const pending = read();
        const entries: UsageEntry[] = JSON.parse(JSON.stringify(Object.values(pending).filter(e => partial || e.start + BUCKET <= Date.now()).sort((a, b) => a.start - b.start).slice(0, 12)));
        if (!entries.length) return;
        sending = true; lastFlush = Date.now();
        try {
          await recordUsage(cid, entries);
          await locked(() => {
            const latest = read();
            for (const entry of entries) {
              // 현재 구간은 누계 최댓값 재전송을 위해 유지한다.
              if (entry.start + BUCKET <= Date.now() && JSON.stringify(latest[entry.start]) === JSON.stringify(entry)) delete latest[entry.start];
            }
            save(latest);
          });
        } catch { /* 서버/네트워크 실패는 대기열을 유지하고 다음 주기에 재시도 */ }
        finally { sending = false; }
      };
      if (navigator.locks) await navigator.locks.request(`usage-send:${uid}:${cid}`, { ifAvailable: true }, async lock => { if (lock) await send(); });
      else await send();
    };
    const input = () => { lastInput = Date.now(); };
    const visibility = () => { lastTick = Date.now(); if (document.visibilityState !== "visible") void flush(true); };
    const events = ["pointerdown", "pointermove", "keydown", "scroll", "wheel", "touchstart", "touchmove"] as const;
    events.forEach(event => window.addEventListener(event, input, { passive: true }));
    document.addEventListener("visibilitychange", visibility);
    const timer = setInterval(() => { void tick().then(() => flush()); }, 10_000);
    void flush();
    return () => {
      stopped = true; clearInterval(timer);
      events.forEach(event => window.removeEventListener(event, input));
      document.removeEventListener("visibilitychange", visibility);
      void flush(true);
    };
  }, [cid, uid]);
  return null;
}
