import type { CSSProperties } from "react";

/** Material Symbols (Outlined) 아이콘 — 디자인 시스템 아이콘 세트 */
export function Icon({
  name,
  size = 20,
  fill = false,
  weight = 400,
  className = "",
  style,
}: {
  name: string;
  size?: number;
  fill?: boolean;
  weight?: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      aria-hidden
      className={`m3-icon ${className}`}
      style={{
        fontSize: size,
        fontVariationSettings: `"FILL" ${fill ? 1 : 0}, "wght" ${weight}, "GRAD" 0, "opsz" ${size}`,
        ...style,
      }}
    >
      {name}
    </span>
  );
}
