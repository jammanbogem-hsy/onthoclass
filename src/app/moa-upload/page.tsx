import { Suspense } from "react";
import type { Metadata } from "next";
import MoaUpload from "@/components/MoaUpload";

export const metadata: Metadata = {
  title: "모아 월드 그림 올리기",
  description: "AI 와 만든 그림을 모아 월드 에셋으로 올려요.",
  robots: { index: false, follow: false },
};

export default function MoaUploadPage() {
  return <Suspense fallback={<main className="flex min-h-screen items-center justify-center">여는 중…</main>}><MoaUpload /></Suspense>;
}
