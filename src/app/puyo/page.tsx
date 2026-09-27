import { Suspense } from "react";
import type { Metadata } from "next";
import PuyoRoom from "@/components/puyo/PuyoRoom";

export const metadata: Metadata = {
  title: "뿌요뿌요 · 우리 반 포켓 배틀",
  description: "꼬물꼬물 포켓 친구들과 함께하는 우리 반 1:1 뿌요뿌요!",
};

export default function PuyoPage() {
  return <Suspense fallback={<main style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#f8f5ff", color: "#68429d" }}>포켓 친구들이 모이고 있어요…</main>}><PuyoRoom /></Suspense>;
}
