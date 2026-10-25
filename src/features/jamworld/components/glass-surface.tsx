"use client";

import { useSyncExternalStore, type ComponentProps } from "react";
import { LiquiGlass } from "@liqui-design/glass";

const preference =
  "(prefers-reduced-transparency: reduce), (prefers-contrast: more)";
const subscribe = (changed: () => void) => {
  const query = window.matchMedia(preference);
  query.addEventListener("change", changed);
  return () => query.removeEventListener("change", changed);
};
const snapshot = () => window.matchMedia(preference).matches;

/** Optical material from the reference's MIT refraction kernel. Text stays above the lens. */
export default function GlassSurface({
  className = "",
  contentClassName = "",
  frost = 0.06,
  ...props
}: ComponentProps<typeof LiquiGlass>) {
  const accessible = useSyncExternalStore(subscribe, snapshot, () => false);
  return (
    <LiquiGlass
      radius={24}
      bezel={18}
      refraction={72}
      blur={0.3}
      specular={0.75}
      profile="convex"
      dispersion={0}
      {...props}
      frost={accessible ? 1 : frost}
      material={accessible ? "frost" : (props.material ?? "auto")}
      className={`water-glass ${accessible ? "water-glass-solid" : ""} ${className}`}
      contentClassName={`glass-content ${contentClassName}`}
      onPointerMove={(event) => {
        if (event.pointerType !== "mouse" || accessible) return;
        const rect = event.currentTarget.getBoundingClientRect();
        event.currentTarget.style.setProperty(
          "--light-x",
          `${Math.round(((event.clientX - rect.left) / rect.width) * 100)}%`,
        );
        event.currentTarget.style.setProperty(
          "--light-y",
          `${Math.round(((event.clientY - rect.top) / rect.height) * 100)}%`,
        );
      }}
      onPointerLeave={(event) => {
        event.currentTarget.style.removeProperty("--light-x");
        event.currentTarget.style.removeProperty("--light-y");
      }}
    />
  );
}

/** Material 3 버튼 — 렌즈(굴절 필터)를 버튼마다 만들지 않는 가벼운 네이티브 요소. 모양은 jamworld.css 의 .btn */
export function GlassButton({ className = "btn", ...props }: ComponentProps<"button">) {
  return <button {...props} className={className} />;
}

export function GlassLink({ className = "btn", ...props }: ComponentProps<"a">) {
  return <a {...props} className={className} />;
}

export function WaterBackdrop() {
  return (
    <div className="water-backdrop" aria-hidden="true">
      <svg viewBox="0 0 1600 1100" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient
            id="water-body"
            x1="250"
            y1="1000"
            x2="1400"
            y2="0"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#328cbd" stopOpacity=".6" />
            <stop offset=".24" stopColor="#a4e0e9" stopOpacity=".7" />
            <stop offset=".5" stopColor="#effdff" stopOpacity=".35" />
            <stop offset=".75" stopColor="#6cbedc" stopOpacity=".8" />
            <stop offset="1" stopColor="#2f80b9" stopOpacity=".5" />
          </linearGradient>
          <linearGradient
            id="water-edge"
            x1="100"
            y1="800"
            x2="1500"
            y2="100"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#fff" stopOpacity="0" />
            <stop offset=".25" stopColor="#f0feff" stopOpacity=".95" />
            <stop offset=".55" stopColor="#fff" stopOpacity=".2" />
            <stop offset=".78" stopColor="#fff" stopOpacity=".95" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <radialGradient id="water-depth">
            <stop stopColor="#4d9bbd" stopOpacity=".02" />
            <stop offset=".65" stopColor="#70bdd7" stopOpacity=".08" />
            <stop offset=".92" stopColor="#3b93b7" stopOpacity=".25" />
            <stop offset="1" stopColor="#e9fcff" stopOpacity=".8" />
          </radialGradient>
          <filter id="water-soft">
            <feGaussianBlur stdDeviation="14" />
          </filter>
        </defs>
        <path
          d="M -120,1010 C 30,450 580,900 1010,380 S 1270,-100 1740,-100 L 1740,60 C 1430,80 1410,420 1100,560 S 240,650 -120,1260 Z"
          fill="url(#water-body)"
          filter="url(#water-soft)"
        />
        <path
          d="M -120,1010 C 30,450 580,900 1010,380 S 1270,-100 1740,-100"
          stroke="url(#water-edge)"
          strokeWidth="3"
          fill="none"
        />
        <path
          d="M -120,1070 C 60,510 620,930 1040,420 S 1310,-50 1740,-50"
          stroke="url(#water-edge)"
          strokeWidth="14"
          fill="none"
          opacity=".5"
          filter="url(#water-soft)"
        />
        <ellipse
          cx="1500"
          cy="1000"
          rx="430"
          ry="305"
          fill="url(#water-depth)"
          transform="rotate(-28 1500 1000)"
        />
        <ellipse
          cx="40"
          cy="90"
          rx="370"
          ry="200"
          fill="url(#water-depth)"
          transform="rotate(-28 40 90)"
          opacity=".6"
        />
      </svg>
    </div>
  );
}
