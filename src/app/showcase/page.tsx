import { Suspense } from "react";
import type { Metadata } from "next";
import Showcase from "@/components/showcase/Showcase";

export const metadata: Metadata = {
  title: "학급 성과",
  description: "러닝크루 학급 성과 공유(읽기 전용, 학생 이름은 모자이크)",
  robots: { index: false, follow: false },
  // 링크 미리보기(학급별 제목은 /s/<토큰> 함수가 채운다 — 여기는 /showcase/?t= 를 그대로 붙여 넣었을 때의 기본값)
  metadataBase: new URL("https://jammanboeng.web.app"),
  openGraph: { type: "website", siteName: "러닝크루", title: "학급 성과 · 러닝크루", description: "로그인 없이 보는 학급 성과예요. 학생 이름은 모자이크로 가려져요.", images: [{ url: "/og/showcase.png", width: 1200, height: 630 }], locale: "ko_KR" },
  twitter: { card: "summary_large_image", images: ["/og/showcase.png"] },
};

export default function ShowcasePage() {
  return <Suspense fallback={<main className="flex min-h-screen items-center justify-center">학급 성과를 여는 중…</main>}><Showcase /></Suspense>;
}
