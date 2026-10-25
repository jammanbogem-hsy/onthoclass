"use client";
import { useSyncExternalStore } from "react";

/** 이만큼 아무 입력이 없으면 '자리 비움' — 실시간 연결을 멈춘다(켜 둔 채 잊은 화면이 서버를 계속 부르지 않게) */
export const IDLE_MS = 15 * 60_000;
const INPUTS = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
let lastInput = Date.now();
let idle = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
let timer: ReturnType<typeof setTimeout> | undefined;
function arm() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    idle = true;
    emit();
  }, Math.max(0, lastInput + IDLE_MS - Date.now()));
}
function onInput() {
  lastInput = Date.now();
  if (idle) {
    idle = false;
    emit();
  }
  arm();
}

const subscribe = (changed: () => void) => {
  if (!listeners.size) {
    INPUTS.forEach((e) => window.addEventListener(e, onInput, { passive: true, capture: true }));
    document.addEventListener("visibilitychange", emit);
    arm();
  }
  listeners.add(changed);
  return () => {
    listeners.delete(changed);
    if (listeners.size) return;
    INPUTS.forEach((e) => window.removeEventListener(e, onInput, { capture: true }));
    document.removeEventListener("visibilitychange", emit);
    clearTimeout(timer);
  };
};
const live = () => !document.hidden && !idle;
const serverLive = () => false;

/** Pause live connections in background tabs and after IDLE_MS without input; hydration starts them only when visible. */
export function usePageVisible() {
  return useSyncExternalStore(subscribe, live, serverLive);
}

/** 마지막 입력 시각(학생 자동 나가기용) */
export const lastInputAt = () => lastInput;
