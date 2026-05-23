"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { GlassCard } from "@/components/Glass";
import { Icon } from "@/components/Icon";

export default function LoginPage() {
  const {
    user,
    loading,
    configured,
    profile,
    profileLoading,
    signInWithGoogle,
  } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading || !user || profileLoading) return;
    router.replace(profile?.role ? "/dashboard" : "/onboarding");
  }, [user, loading, profile, profileLoading, router]);

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <GlassCard
        strong
        className="w-full max-w-md p-10 text-center animate-float-in"
      >
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-3xl bg-[var(--accent-soft)] text-[var(--md-sys-color-on-primary-container)]">
          <Icon name="school" size={32} />
        </div>
        <h1 className="text-3xl font-bold tracking-tight">잼클래스</h1>
        <p className="mt-2 text-sm text-black/55 dark:text-white/55">
          수업을 위한 심플하고 모던한 학습 관리 시스템
        </p>

        <button
          onClick={() => signInWithGoogle().catch(() => {})}
          disabled={loading}
          className="btn-accent mt-8 flex w-full items-center justify-center gap-3 px-6 py-3.5 text-sm font-semibold"
        >
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white text-[13px] font-bold text-[var(--accent-strong)]">
            G
          </span>
          Google 계정으로 시작하기
        </button>

        {configured ? (
          <p className="mt-6 text-xs text-black/40 dark:text-white/40">
            학급을 만들거나 초대 코드로 참여할 수 있어요
          </p>
        ) : (
          <div className="mt-6 flex gap-2 rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-tertiary-container)] px-4 py-3 text-left text-xs leading-relaxed text-[var(--md-sys-color-on-tertiary-container)]">
            <Icon name="warning" size={16} className="mt-0.5 shrink-0" />
            <span>
              <b>Firebase 설정 필요</b> — 디자인 미리보기 상태입니다.
              <br />
              <code>.env.local</code> 에 웹앱 설정값을 입력하면 로그인이
              활성화됩니다.
            </span>
          </div>
        )}
      </GlassCard>
    </main>
  );
}
