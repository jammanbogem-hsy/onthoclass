"use client";

// public 폴더의 Lottie(json) 애니메이션을 지정 크기로 재생하는 작은 아이콘 헬퍼.
// 모달/오버레이의 이모지 자리를 통일된 애니메이션으로 대체할 때 사용.
import Lottie from "lottie-react";
import { useEffect, useState } from "react";

export function LottieIcon({
  src,
  size = 96,
  loop = true,
  className,
}: {
  src: string;
  size?: number;
  loop?: boolean;
  className?: string;
}) {
  const [data, setData] = useState<object | null>(null);
  useEffect(() => {
    let alive = true;
    setData(null);
    fetch(src)
      .then((r) => r.json())
      .then((d) => {
        if (alive) setData(d);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [src]);

  // 로드 전엔 자리만 차지(레이아웃 흔들림 방지)
  if (!data) return <div style={{ width: size, height: size }} className={className} />;
  return (
    <Lottie
      animationData={data}
      loop={loop}
      autoplay
      style={{ width: size, height: size }}
      className={className}
    />
  );
}
