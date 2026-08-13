import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import { DialogProvider } from "@/components/Dialog";
import { ClassLive } from "@/components/ClassLive";
import { FONT_INIT_SCRIPT } from "@/lib/fontTheme";
import { THEME_INIT_SCRIPT } from "@/lib/colorTheme";
import { NameMaskProvider } from "@/components/NameMask";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "러닝크루 · LMS",
  description: "수업을 위한 심플하고 모던한 학습 관리 시스템",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className={`${geistSans.variable} h-full antialiased`}>
      <head>
        {/* 한글 본문용 Pretendard */}
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css"
        />
        {/* Material 3 — Roboto / Roboto Mono / Material Symbols */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&family=Roboto+Mono:wght@400;700&display=swap"
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=block"
        />
        {/* 크롬(Noto) 컬러 이모지 — .emoji-noto 에서 사용(기기 간 이모지 통일) */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Noto+Color+Emoji&display=swap"
        />
        <style>{`:root{--font-pretendard:'Pretendard'}`}</style>
        {/* 폰트·색상 선택 FOUC 방지 — 하이드레이션 전에 data-font / data-theme 적용 */}
        <script
          dangerouslySetInnerHTML={{ __html: FONT_INIT_SCRIPT }}
        />
        <script
          dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        <AuthProvider>
          <DialogProvider>
            {/* 이름 가리기는 앱 전체가 한 상태를 공유한다 — 메인에서 한 번 켜면
                모든 학급·차시 화면에 그대로 적용된다(탭 단위 sessionStorage). */}
            <NameMaskProvider>
              {children}
              <ClassLive />
            </NameMaskProvider>
          </DialogProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
