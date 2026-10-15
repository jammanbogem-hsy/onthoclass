import { Suspense } from "react";
import type { Metadata } from "next";
import BrainstormRoom from "@/components/brainstorm/BrainstormRoom";

export const metadata: Metadata = {
  title: "브레인스토밍 · 러닝크루",
  description: "아이디어를 쓸수록 내 색 잉크가 섬 위로 번지는 우리 반 브레인스토밍",
};

export default function BrainstormPage() {
  return <Suspense fallback={<main className="flex min-h-screen items-center justify-center text-[var(--md-sys-color-on-surface-variant)]">브레인스토밍 판을 여는 중…</main>}><BrainstormRoom /></Suspense>;
}
