"use client";

// /eng/* 영어 수업활동 전용 셸.
// 루트 layout(AuthProvider)을 그대로 상속하므로 useAuth는 쓸 수 있지만,
// LMS의 TopBar/네비게이션은 두르지 않아 독립된 활동앱처럼 동작한다.
// 로그인 게이팅은 기존 LMS 계정(Google)을 그대로 사용한다.
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";

// 개발 모드에서만 true. 프로덕션 빌드(next build / output:export)에서는
// process.env.NODE_ENV === "production" 이라 아래 우회 코드가 데드코드로 제거된다.
const DEV = process.env.NODE_ENV !== "production";

export default function EngLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading, configured, signInWithGoogle } = useAuth();
  const [devBypass, setDevBypass] = useState(false);

  // 새로고침해도 미리보기 유지(개발 전용)
  useEffect(() => {
    if (DEV && sessionStorage.getItem("engDevPreview") === "1") {
      setDevBypass(true);
    }
  }, []);

  function enablePreview() {
    setDevBypass(true);
    try {
      sessionStorage.setItem("engDevPreview", "1");
    } catch {}
  }
  function exitPreview() {
    setDevBypass(false);
    try {
      sessionStorage.removeItem("engDevPreview");
    } catch {}
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--md-sys-color-surface)]">
        <p className="text-[var(--md-sys-color-on-surface-variant)]">
          불러오는 중…
        </p>
      </main>
    );
  }

  // 로그인 안 됨 + (개발 미리보기도 아님) → 로그인 화면
  if (!user && !(DEV && devBypass)) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-[var(--md-sys-color-surface)] px-6">
        <h1 className="text-2xl font-bold text-[var(--md-sys-color-on-surface)]">
          영어 수업활동
        </h1>
        <p className="text-center text-[var(--md-sys-color-on-surface-variant)]">
          러닝크루 계정으로 로그인하면 활동을 시작할 수 있어요.
        </p>
        <button
          onClick={() => signInWithGoogle()}
          disabled={!configured}
          className="rounded-full bg-[var(--md-sys-color-primary)] px-6 py-3 font-medium text-[var(--md-sys-color-on-primary)] disabled:opacity-50"
        >
          Google로 로그인
        </button>
        {DEV && (
          <button
            onClick={enablePreview}
            className="rounded-full border border-dashed border-[var(--md-sys-color-outline)] px-4 py-2 text-sm text-[var(--md-sys-color-on-surface-variant)]"
          >
            🔧 로그인 없이 미리보기 (개발용)
          </button>
        )}
      </main>
    );
  }

  return (
    <>
      {DEV && !user && devBypass && (
        <div className="flex items-center justify-center gap-3 bg-[var(--md-sys-color-tertiary-container)] px-4 py-1.5 text-xs text-[var(--md-sys-color-on-tertiary-container)]">
          <span>🔧 개발 미리보기 — 로그인 없이 보는 중이라 저장/풀기는 동작하지 않아요.</span>
          <button onClick={exitPreview} className="font-medium underline">
            로그인 화면으로
          </button>
        </div>
      )}
      {children}
    </>
  );
}
