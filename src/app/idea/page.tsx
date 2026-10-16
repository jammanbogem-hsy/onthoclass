import { Suspense } from "react";
import type { Metadata } from "next";
import IdeaJoin from "@/components/idea/IdeaPlay";

export const metadata: Metadata = {
  title: "아이디어 섬",
  description: "생각을 쓸수록 내 색 잉크가 섬 위로 번지는 땅따먹기 브레인스토밍",
};

export default function IdeaPage() {
  return <Suspense fallback={<main className="flex min-h-screen items-center justify-center">아이디어 섬을 여는 중…</main>}><IdeaJoin /></Suspense>;
}
