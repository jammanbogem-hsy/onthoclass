"use client";

// 앱 어디서든 코드 조각 불러오기가 실패하면(배포 직후의 옛 탭) 조용히 한 번 새로 고친다.
import { useEffect } from "react";
import { isChunkError, reloadOnce } from "@/lib/chunk-reload";

export function ChunkRecovery() {
  useEffect(() => {
    const onRejection = (e: PromiseRejectionEvent) => { if (isChunkError(e.reason)) reloadOnce(); };
    const onError = (e: ErrorEvent) => { if (isChunkError(e.error ?? e.message)) reloadOnce(); };
    window.addEventListener("unhandledrejection", onRejection);
    window.addEventListener("error", onError);
    return () => { window.removeEventListener("unhandledrejection", onRejection); window.removeEventListener("error", onError); };
  }, []);
  return null;
}
