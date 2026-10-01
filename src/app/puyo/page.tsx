import { Suspense } from "react";
import type { Metadata } from "next";
import PuyoRoom from "@/components/puyo/PuyoRoom";

export const metadata: Metadata = {
  title: "뿌요뿌요 · 러닝크루",
  description: "같은 색 4개를 이어 터뜨리는 우리 반 1:1 뿌요뿌요",
};

export default function PuyoPage() {
  return <Suspense fallback={<main className="flex min-h-screen items-center justify-center text-[var(--md-sys-color-on-surface-variant)]">게임방을 여는 중…</main>}><PuyoRoom /></Suspense>;
}
