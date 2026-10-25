import { Suspense } from "react";
import type { Metadata } from "next";
import Showcase from "@/components/showcase/Showcase";

export const metadata: Metadata = {
  title: "학급 성과",
  description: "러닝크루 학급 성과 공유(읽기 전용, 학생 이름은 모자이크)",
  robots: { index: false, follow: false },
};

export default function ShowcasePage() {
  return <Suspense fallback={<main className="flex min-h-screen items-center justify-center">학급 성과를 여는 중…</main>}><Showcase /></Suspense>;
}
