"use client";

import { useEffect, useRef, useState } from "react";
import type { Member } from "@/lib/classes";

/**
 * "지금 누구 차례인지" 모두에게 알리는 상단 슬림 배너.
 *  - 빙고 플레이(status==='play') 중 항상 표시 — 스테이지 최소화/관전/완료 학생도 본다.
 *  - 내 차례면 숨김(내 차례는 MyTurnIntro + 단어선택 오버레이가 담당).
 *  - currentUid===null(시작 전/정체)이면 "선생님을 기다려요".
 *  - z-[60]: 스테이지(z-92)/도크(z-91)/오버레이보다 아래 → 작업 중엔 가리지 않고, 도크/관전 화면에서만 보인다.
 */
export function TurnBanner({
  currentUid,
  myUid,
  memberByUid,
}: {
  currentUid: string | null;
  myUid: string;
  memberByUid: Map<string, Member>;
}) {
  // 차례가 바뀔 때 부드러운 페이드/슬라이드 재생용 key
  const [animKey, setAnimKey] = useState(0);
  const prev = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (prev.current !== undefined && prev.current !== currentUid)
      setAnimKey((k) => k + 1);
    prev.current = currentUid;
  }, [currentUid]);

  // 내 차례면 배너는 비운다(인트로/오버레이가 담당)
  if (currentUid && currentUid === myUid) return null;

  const m = currentUid ? memberByUid.get(currentUid) : null;
  const name = (m?.displayName || "").trim() || "친구";
  const waiting = !currentUid;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-2 z-[60] flex justify-center px-3">
      <div
        key={animKey}
        className="jam-turn-banner pointer-events-auto flex max-w-[92vw] items-center gap-2.5 rounded-full bg-[var(--md-sys-color-primary-container)] py-1.5 pl-1.5 pr-4 shadow-[var(--md-sys-elevation-2)]"
      >
        {waiting ? (
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)]">
            ⏳
          </span>
        ) : m?.photoURL ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={m.photoURL}
            alt=""
            className="h-8 w-8 shrink-0 rounded-full object-cover ring-2 ring-[var(--md-sys-color-primary)]"
          />
        ) : (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--md-sys-color-primary)] text-sm font-black text-[var(--md-sys-color-on-primary)]">
            {name.slice(0, 1)}
          </span>
        )}
        <p className="truncate text-sm font-extrabold text-[var(--md-sys-color-on-primary-container)] sm:text-base">
          {waiting ? (
            "선생님을 기다려요"
          ) : (
            <>
              지금 <span className="font-black">{name}</span> 차례예요
            </>
          )}
        </p>
        {!waiting && (
          <span className="jam-turn-dot ml-0.5 h-2 w-2 shrink-0 rounded-full bg-[var(--md-sys-color-primary)]" />
        )}
      </div>
    </div>
  );
}
