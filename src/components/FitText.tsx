"use client";

import { useLayoutEffect, useRef } from "react";

/**
 * 칸(부모) 크기에 맞춰 글자 크기를 자동 축소하는 텍스트.
 * className 이 지정한 폰트 크기를 기본값으로 쓰고, 칸을 넘칠 때만 들어가는 만큼 줄인다.
 * 부모의 콘텐츠 영역(패딩 제외)이 곧 가용 공간인 칸(flex 중앙 정렬)에서 사용.
 * 칸 크기가 바뀌면(창 크기 조절 등) ResizeObserver 로 다시 맞춘다.
 */
export function FitText({
  text,
  className = "",
  minPx = 7,
}: {
  text: string;
  className?: string;
  /** 가독성 하한 — 이보다 작아지지 않는다(칸이 극단적으로 작으면 잘릴 수 있음) */
  minPx?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    const cell = el?.parentElement;
    if (!el || !cell) return;

    const fit = () => {
      el.style.fontSize = ""; // 클래스 기본 크기로 되돌린 뒤 측정
      const cs = getComputedStyle(cell);
      const availW =
        cell.clientWidth -
        parseFloat(cs.paddingLeft) -
        parseFloat(cs.paddingRight);
      const availH =
        cell.clientHeight -
        parseFloat(cs.paddingTop) -
        parseFloat(cs.paddingBottom);
      if (availW <= 0 || availH <= 0) return;
      const ratio = Math.min(availW / el.scrollWidth, availH / el.scrollHeight);
      if (ratio >= 1) return;
      const base = parseFloat(getComputedStyle(el).fontSize);
      el.style.fontSize = `${Math.max(minPx, base * ratio)}px`;
    };

    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(cell);
    return () => ro.disconnect();
  }, [text, className, minPx]);

  return (
    <span ref={ref} className={`max-w-full ${className}`}>
      {text}
    </span>
  );
}
