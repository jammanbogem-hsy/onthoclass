"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { TopBar } from "@/components/TopBar";
import { Icon } from "@/components/Icon";

// 뿌요 화면 공통 조각 — 러닝크루 메인 앱과 같은 M3 구성(TopBar + max-w-6xl 본문 + surface 카드).
export const FRIENDS = ["gengar", "snorlax", "charmander", "squirtle"];
export const reasonLabels = { topout: "보드가 가득 참", time: "시간 종료 · 점수", disconnect: "접속 끊김", teacher: "선생님 종료 · 점수" };
export const timeLabel = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.max(0, seconds % 60)).padStart(2, "0")}`;
export function message(error: unknown) { return error instanceof Error ? error.message.replace(/^Firebase:\s*/, "") : "연결을 확인하고 다시 시도해 주세요."; }

export const card = "rounded-3xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)]";
export const btnPrimary = "inline-flex min-h-12 items-center justify-center gap-1.5 rounded-full bg-[var(--md-sys-color-primary)] px-6 text-[15px] font-bold text-[var(--md-sys-color-on-primary)] transition hover:brightness-105 disabled:opacity-40";
export const btnOutline = "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full border border-[var(--md-sys-color-outline)] px-5 text-sm font-bold text-[var(--md-sys-color-primary)] transition hover:bg-[color-mix(in_srgb,var(--md-sys-color-primary)_8%,transparent)] disabled:opacity-40";
export const btnTonal = "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full bg-[var(--md-sys-color-secondary-container)] px-5 text-sm font-bold text-[var(--md-sys-color-on-secondary-container)] transition hover:brightness-95 disabled:opacity-40";

export function Friend({ index, size = 48 }: { index: number; size?: number }) {
  // 로컬 SVG 캐릭터 — 원격 이미지 로더가 필요 없다.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`/puyo/assets/${FRIENDS[index % 4]}.svg`} width={size} height={size} alt="" draggable={false} />;
}

export function Shell({ children, back }: { children: ReactNode; back?: { href: string; label: string } }) {
  return <>
    <TopBar />
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
      {back && <Link href={back.href} className="mb-3 inline-flex items-center gap-1 text-sm text-[var(--md-sys-color-on-surface-variant)] transition hover:text-[var(--md-sys-color-on-surface)]"><Icon name="arrow_back" size={18} />{back.label}</Link>}
      {children}
    </main>
  </>;
}

export function Notice({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return <div className={`${card} mx-auto mt-10 flex max-w-lg flex-col items-center gap-3 px-8 py-12 text-center`}>
    <div className="flex gap-1"><Friend index={0} size={56} /><Friend index={3} size={56} /></div>
    <h1 className="text-xl font-bold">{title}</h1>
    {body && <p className="text-sm leading-relaxed text-[var(--md-sys-color-on-surface-variant)]">{body}</p>}
    {action}
  </div>;
}

export function Header({ title, sub, right }: { title: ReactNode; sub: string; right?: ReactNode }) {
  return <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
    <div className="flex min-w-0 items-center gap-3">
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--md-sys-color-primary-container)]"><Friend index={2} size={40} /></span>
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        <p className="mt-1 text-sm text-[var(--md-sys-color-on-surface-variant)]">{sub}</p>
      </div>
    </div>
    {right}
  </div>;
}

