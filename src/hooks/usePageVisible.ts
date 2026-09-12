"use client";

import { useSyncExternalStore } from "react";
const subscribe = (notify: () => void) => {
  document.addEventListener("visibilitychange", notify);
  return () => document.removeEventListener("visibilitychange", notify);
};
/** 숨겨진 탭의 데이터 구독/주기 조회를 멈추고 복귀할 때 다시 연결한다. */
export function usePageVisible() {
  return useSyncExternalStore(subscribe, () => document.visibilityState === "visible", () => false);
}
