import { Suspense } from "react";
import type { Metadata } from "next";
import McpAuth from "@/components/McpAuth";

export const metadata: Metadata = {
  title: "러닝크루 · AI 연결",
  description: "Claude·ChatGPT 에서 내 학급 기록을 읽도록 허용하기",
};

export default function McpAuthPage() {
  return <Suspense fallback={<main className="flex min-h-screen items-center justify-center">불러오는 중…</main>}><McpAuth /></Suspense>;
}
