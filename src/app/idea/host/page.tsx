import { Suspense } from "react";
import type { Metadata } from "next";
import IdeaHost from "@/components/idea/IdeaHost";

export const metadata: Metadata = {
  title: "아이디어 섬 · 진행자",
  description: "세션을 열고 QR로 참여자를 모아 함께하는 땅따먹기 브레인스토밍",
};

export default function IdeaHostPage() {
  return <Suspense fallback={<main className="flex min-h-screen items-center justify-center">진행자 화면을 여는 중…</main>}><IdeaHost /></Suspense>;
}
