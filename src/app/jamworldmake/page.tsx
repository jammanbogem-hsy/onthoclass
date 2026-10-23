import { Suspense } from "react";
import type { Metadata } from "next";
import JamworldMake from "./JamworldMake";

export const metadata: Metadata = {
  title: "모아 월드 제작 · 러닝크루",
  description: "모아 월드에서 맵을 만들고 플레이해 보세요.",
};

export default function JamworldMakePage() {
  return <Suspense fallback={<main className="p-8">작업실을 준비하고 있어요…</main>}><JamworldMake /></Suspense>;
}
