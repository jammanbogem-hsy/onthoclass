"use client";

/**
 * 어솔의 MaterialIcon 자리를 대신하는 어댑터.
 *
 * 원본은 @material-symbols/svg-400 에서 SVG 파일을 직접 import 했는데(Vite 전용
 * 에셋 로딩), 러닝크루는 Material Symbols 폰트를 쓴다. 호출부가 <MaterialIcon
 * name="map" /> 형태로 같으므로 이름만 그대로 받아 Icon 으로 넘긴다.
 */

import { Icon } from "@/components/Icon";

/** 원본 타입 자리 — 폰트 방식에서는 임의 아이콘 이름을 받을 수 있다 */
export type MaterialIconName = string;

export function MaterialIcon({
  name,
  size = 20,
  className = "",
}: {
  name: MaterialIconName;
  size?: number;
  className?: string;
}) {
  return <Icon name={name} size={size} className={className} />;
}
