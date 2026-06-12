"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { Icon } from "@/components/Icon";
import { noticeColor, watchNotice, type NoticeState } from "@/lib/live";

/** 배경 hex 밝기(상대 휘도)에 따라 가장 대비가 큰 글자색을 고른다. */
function readableOn(hex: string): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? "#16181c" : "#ffffff";
}

/**
 * 공지 전광판 — 교사가 시작한 공지를 학생 헤더에 흐르는 배너로 표시.
 * 종료 전까지 마퀴(좌로 흐름) 애니메이션으로 반복된다.
 */
function NoticeTickerInner() {
  const { profile } = useAuth();
  const params = useSearchParams();
  const cid = params.get("class") || params.get("id");
  const [notice, setNotice] = useState<NoticeState | null>(null);

  useEffect(() => {
    if (!cid) return;
    return watchNotice(cid, setNotice);
  }, [cid]);

  const text = notice?.text.trim() ?? "";
  const active = profile?.role === "student" && !!notice?.active && !!text;
  if (!active) return null;

  const c = noticeColor(notice!.color);
  const fg = readableOn(c.bg); // 배경 밝기에 따른 최대 대비 폰트색
  // 글자 수에 비례한 속도(빠르게). 짧아도 너무 느리지 않게 하한을 낮춤.
  const dur = Math.max(7, Math.min(22, text.length * 0.38 + 5));

  return (
    <div className="mx-auto mt-2 max-w-5xl animate-float-in px-1">
      <div
        className="flex items-stretch overflow-hidden rounded-full shadow-sm"
        style={{ backgroundColor: c.bg }}
      >
        <span
          className="z-10 flex shrink-0 items-center gap-1 px-3 py-1.5 text-xs font-bold"
          style={{ backgroundColor: "rgba(0,0,0,0.2)", color: fg }}
        >
          <Icon name="campaign" size={15} />
          공지
        </span>
        <div className="relative flex-1 overflow-hidden py-1.5">
          <div
            className="jam-marquee-track text-sm font-semibold"
            style={
              {
                color: fg,
                "--jam-marquee-dur": `${dur}s`,
              } as React.CSSProperties
            }
          >
            {text}
          </div>
        </div>
      </div>
    </div>
  );
}

export function NoticeTicker() {
  return (
    <Suspense fallback={null}>
      <NoticeTickerInner />
    </Suspense>
  );
}
