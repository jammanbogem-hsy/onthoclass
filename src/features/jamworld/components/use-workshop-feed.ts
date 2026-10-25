"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, type RequestView } from "./workshop-api";
import { usePageVisible } from "./use-page-visible";

export interface WorkshopFeed {
  requests?: RequestView[];
  students?: Array<{ id: string; nickname: string }>;
  rev?: number;
  unchanged?: boolean;
}

/** One cancellable long poll while visible. Each mutation restarts with a fresh snapshot. */
export function useWorkshopFeed(
  path: string | null,
  onChange: (feed: WorkshopFeed) => void,
  onError: (message: string) => void,
  active = true,
) {
  const handlers = useRef({ onChange, onError });
  useEffect(() => {
    handlers.current = { onChange, onError };
  }, [onChange, onError]);
  const [restart, setRestart] = useState(0);
  const live = usePageVisible();
  const refresh = useCallback(() => setRestart((n) => n + 1), []);
  useEffect(() => {
    const wake = () => refresh();
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("focus", wake);
    return () => {
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("focus", wake);
    };
  }, [refresh]);
  useEffect(() => {
    if (!path || !active || !live) return;
    const ctrl = new AbortController();
    let retry: ReturnType<typeof setTimeout> | undefined,
      resolveRetry: (() => void) | undefined;
    const delay = (ms: number) =>
      new Promise<void>((resolve) => {
        resolveRetry = resolve;
        retry = setTimeout(resolve, ms);
      });
    const run = async () => {
      let rev = -1;
      let lastSnapshot = 0;
      while (!ctrl.signal.aborted) {
        try {
          const suffix =
            rev < 0 || Date.now() - lastSnapshot >= 60000
              ? ""
              : `${path.includes("?") ? "&" : "?"}after=${rev}&wait=1`;
          const data = await api<WorkshopFeed>(path + suffix, {
            signal: ctrl.signal,
          });
          if (ctrl.signal.aborted) return;
          if (data.requests) {
            handlers.current.onChange(data);
            lastSnapshot = Date.now();
          }
          if (Number.isSafeInteger(data.rev)) rev = data.rev!;
          else await delay(3000); // Compatibility while an older server is being replaced.
        } catch (error) {
          if (ctrl.signal.aborted) return;
          handlers.current.onError(
            error instanceof Error
              ? error.message
              : "공방 연결을 확인해 주세요",
          );
          if (error instanceof ApiError && (error.status === 401 || error.status === 403)) break;
          await delay(2500);
        }
      }
    };
    void run();
    return () => {
      ctrl.abort();
      if (retry) clearTimeout(retry);
      resolveRetry?.();
    };
  }, [path, active, restart, live]);
  return refresh;
}
