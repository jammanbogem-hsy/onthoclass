"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { GlassCard } from "@/components/Glass";
import {
  AVATARS,
  completeStudentOnboarding,
  completeTeacherOnboarding,
  setUserAvatar,
} from "@/lib/users";

const inputCls = "m3-field";

export default function OnboardingPage() {
  const { user, loading, profile, profileLoading, refreshProfile } =
    useAuth();
  const router = useRouter();
  const [tab, setTab] = useState<"student" | "teacher">("student");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [avatar, setAvatar] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!loading && !user) router.replace("/");
  }, [user, loading, router]);

  // 이미 가입된 계정은 대시보드로
  useEffect(() => {
    if (!profileLoading && profile?.role) router.replace("/dashboard");
  }, [profile, profileLoading, router]);

  // 구글 프로필 이름은 최초 1회만 채워넣고, 이후엔 자유롭게 수정 가능
  const seededName = useRef(false);
  useEffect(() => {
    if (!seededName.current && user?.displayName) {
      setName(user.displayName);
      seededName.current = true;
    }
  }, [user]);

  if (loading || !user || profileLoading) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <div className="animate-pulse text-sm text-black/40">불러오는 중…</div>
      </main>
    );
  }

  async function submit() {
    setBusy(true);
    setErr("");
    try {
      if (tab === "student") {
        await completeStudentOnboarding(user!, name, code);
      } else {
        await completeTeacherOnboarding(user!, name, code);
      }
      if (avatar)
        await setUserAvatar(user!.uid, avatar, user!.photoURL ?? "").catch(
          () => {}
        );
      await refreshProfile();
      router.replace("/dashboard");
    } catch (e) {
      setErr(
        e instanceof Error ? e.message : "가입 처리에 실패했습니다."
      );
      setBusy(false);
    }
  }

  const isStudent = tab === "student";

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <GlassCard
        strong
        className="w-full max-w-md animate-float-in p-9"
      >
        <h1 className="text-2xl font-bold tracking-tight">회원가입</h1>
        <p className="mt-1 text-sm text-black/55 dark:text-white/55">
          {user.email} · 역할을 선택해 가입을 완료하세요.
        </p>

        <div className="mt-6 flex rounded-full bg-black/5 p-0.5 dark:bg-white/10">
          {(["student", "teacher"] as const).map((t) => (
            <button
              key={t}
              onClick={() => {
                setTab(t);
                setCode("");
                setErr("");
              }}
              className={`flex-1 rounded-full px-4 py-2.5 text-sm font-semibold transition ${
                tab === t
                  ? "bg-white/80 text-black/80 shadow-sm dark:bg-white/20 dark:text-white"
                  : "text-black/45 dark:text-white/45"
              }`}
            >
              {t === "student" ? "학생" : "교사"}
            </button>
          ))}
        </div>

        <div className="mt-5 flex flex-col gap-3">
          {/* 프로필 사진 선택 */}
          <div>
            <p className="mb-1.5 text-sm font-semibold text-black/60 dark:text-white/70">
              프로필 사진{" "}
              <span className="font-normal text-black/40">(선택)</span>
            </p>
            <div className="flex max-h-28 flex-wrap gap-2 overflow-y-auto rounded-2xl bg-black/5 p-2 dark:bg-white/5">
              {AVATARS.map((src) => {
                const on = avatar === src;
                return (
                  <button
                    key={src}
                    type="button"
                    onClick={() => setAvatar(on ? "" : src)}
                    className={`relative h-12 w-12 shrink-0 overflow-hidden rounded-xl border-2 transition hover:scale-105 ${
                      on
                        ? "border-[var(--md-sys-color-primary)] ring-2 ring-[var(--md-sys-color-primary)]"
                        : "border-transparent"
                    }`}
                    style={on ? { animation: "jam-avatar-in .42s ease" } : undefined}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={src}
                      alt=""
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  </button>
                );
              })}
            </div>
          </div>
          <input
            className={inputCls}
            placeholder="이름"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
          <input
            className={inputCls}
            placeholder={
              isStudent
                ? "학급 코드 (예: 파란고양이)"
                : "시스템 코드"
            }
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          {err && <p className="text-xs text-red-500">{err}</p>}
          <button
            className="btn-accent mt-1 px-5 py-3 text-sm font-semibold"
            disabled={busy || !name.trim() || !code.trim()}
            onClick={submit}
          >
            {busy
              ? "가입 중…"
              : isStudent
                ? "학생으로 가입"
                : "교사로 가입"}
          </button>
          <p className="text-center text-xs text-black/40 dark:text-white/40">
            {isStudent
              ? "선생님이 공유한 한글 학급 코드를 입력하세요."
              : "교사 가입에는 시스템 코드가 필요합니다."}
          </p>
        </div>
      </GlassCard>
    </main>
  );
}
