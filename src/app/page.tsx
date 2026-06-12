"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Lottie from "lottie-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { GlassCard } from "@/components/Glass";
import { Icon } from "@/components/Icon";
import { TypedText } from "@/components/TypedText";
import { SchoolPicker } from "@/components/SchoolPicker";
import { getPublicMemberCount, setUserSchool } from "@/lib/users";
import { getAuthClient } from "@/lib/firebase";

type Mode = "buttons" | "login" | "signup" | "reset";

export default function LoginPage() {
  const {
    user,
    loading,
    configured,
    profile,
    profileLoading,
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    sendPasswordReset,
  } = useAuth();
  const router = useRouter();
  const [signinErr, setSigninErr] = useState("");
  const [bg, setBg] = useState<object | null>(null);
  const [memberCount, setMemberCount] = useState(0);

  // 이메일 인증 상태
  const [mode, setMode] = useState<Mode>("buttons");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [school, setSchool] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let alive = true;
    fetch("/Running Kid Lottie Animation.json")
      .then((r) => r.json())
      .then((d) => alive && setBg(d))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    getPublicMemberCount().then((n) => alive && setMemberCount(n));
    return () => {
      alive = false;
    };
  }, []);

  const typedWords = ["러닝크루", "함께 달려요", "함께 배워요"];

  function resetForms() {
    setSigninErr("");
    setNotice("");
    setPw("");
    setPw2("");
  }

  async function handleGoogle() {
    resetForms();
    try {
      await signInWithGoogle();
    } catch (e) {
      setSigninErr(
        e instanceof Error
          ? e.message
          : "로그인에 실패했어요. 잠시 후 다시 시도해주세요."
      );
    }
  }

  async function handleEmailLogin() {
    resetForms();
    if (!email.trim() || !pw) {
      setSigninErr("이메일과 비밀번호를 입력해 주세요.");
      return;
    }
    setBusy(true);
    try {
      await signInWithEmail(email, pw);
    } catch (e) {
      setSigninErr(e instanceof Error ? e.message : "로그인에 실패했어요.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSignup() {
    resetForms();
    if (!email.trim()) return setSigninErr("이메일을 입력해 주세요.");
    if (pw.length < 6) return setSigninErr("비밀번호는 6자 이상이어야 해요.");
    if (pw !== pw2) return setSigninErr("비밀번호 확인이 일치하지 않아요.");
    setBusy(true);
    try {
      await signUpWithEmail(email, pw);
      // 가입 직후 학교 저장(로그인 상태). 실패해도 가입은 유지.
      const u = getAuthClient().currentUser;
      if (u && school.trim()) await setUserSchool(u.uid, school).catch(() => {});
      // onAuthStateChanged 가 이어받아 온보딩으로 라우팅
    } catch (e) {
      setSigninErr(e instanceof Error ? e.message : "가입에 실패했어요.");
      setBusy(false);
    }
  }

  async function handleReset() {
    resetForms();
    if (!email.trim()) return setSigninErr("이메일을 입력해 주세요.");
    setBusy(true);
    try {
      await sendPasswordReset(email);
      setNotice(
        "비밀번호 재설정 메일을 보냈어요. 메일함(스팸함 포함)을 확인해 주세요."
      );
    } catch (e) {
      setSigninErr(e instanceof Error ? e.message : "메일 발송에 실패했어요.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (loading || !user || profileLoading) return;
    router.replace(profile?.role ? "/dashboard" : "/onboarding");
  }, [user, loading, profile, profileLoading, router]);

  const inputCls = "m3-field";

  return (
    <main className="relative flex flex-1 items-center justify-center overflow-hidden p-6">
      {/* 옅은 색 배경 — 흰 캐릭터가 보이도록 살짝 톤 */}
      <div className="pointer-events-none absolute inset-0 bg-[color-mix(in_srgb,var(--md-sys-color-primary)_10%,var(--md-sys-color-surface))]" />
      {/* Lottie 배경 (러닝 키드) */}
      {bg && (
        <div className="pointer-events-none absolute inset-0 opacity-60">
          <Lottie
            animationData={bg}
            loop
            autoplay
            rendererSettings={{ preserveAspectRatio: "xMidYMid slice" }}
            style={{ width: "100%", height: "100%" }}
          />
        </div>
      )}
      <GlassCard
        strong
        className="relative z-10 w-full max-w-2xl p-12 text-center animate-float-in sm:p-16"
      >
        {/* 타이핑 타이포 타이틀 — 갈무리 픽셀 폰트 */}
        <h1
          className="mb-3 flex min-h-[1.4em] items-center justify-center text-5xl tracking-tight text-[var(--md-sys-color-primary)] sm:text-6xl"
          style={{ fontFamily: "'Galmuri11', monospace" }}
        >
          <TypedText
            words={typedWords}
            typeMs={150}
            deleteMs={70}
            holdMs={1500}
          />
        </h1>

        {/* 항상 보이는 실시간 참여 인원 */}
        <p className="mb-8 flex items-center justify-center gap-1.5 text-base font-semibold text-[var(--md-sys-color-on-surface-variant)] sm:text-lg">
          <Icon
            name="directions_run"
            size={18}
            className="text-[var(--md-sys-color-primary)]"
          />
          {memberCount > 0 ? (
            <span>
              지금{" "}
              <span className="font-bold text-[var(--md-sys-color-primary)]">
                {memberCount.toLocaleString()}명
              </span>
              이 함께 달리고 있어요
            </span>
          ) : (
            <span>함께 달릴 친구를 기다리고 있어요</span>
          )}
        </p>

        {/* 구글 로그인 (항상 메인) */}
        <button
          onClick={handleGoogle}
          disabled={loading || busy}
          className="btn-accent flex w-full items-center justify-center gap-3 px-6 py-6 text-xl font-bold"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-base font-bold text-[var(--accent-strong)]">
            G
          </span>
          Google 계정으로 시작하기
        </button>

        {/* ─── 이메일 인증 영역 ─── */}
        {mode === "buttons" && (
          <div className="mt-4 flex items-center justify-center gap-3 text-sm">
            <button
              onClick={() => {
                resetForms();
                setMode("login");
              }}
              className="font-semibold text-[var(--md-sys-color-primary)] hover:underline"
            >
              이메일로 로그인
            </button>
            <span className="text-black/20">·</span>
            <button
              onClick={() => {
                resetForms();
                setMode("signup");
              }}
              className="font-semibold text-[var(--md-sys-color-on-surface-variant)] hover:underline"
            >
              이메일로 회원가입
            </button>
          </div>
        )}

        {mode !== "buttons" && (
          <div className="mt-5 flex flex-col gap-2.5 text-left">
            <div className="mb-1 flex items-center justify-between">
              <p className="text-sm font-bold text-[var(--md-sys-color-on-surface)]">
                {mode === "login"
                  ? "이메일 로그인"
                  : mode === "signup"
                    ? "이메일 회원가입"
                    : "비밀번호 찾기"}
              </p>
              <button
                onClick={() => {
                  resetForms();
                  setMode("buttons");
                }}
                className="text-xs text-[var(--md-sys-color-on-surface-variant)] hover:underline"
              >
                닫기
              </button>
            </div>

            <input
              className={inputCls}
              type="email"
              placeholder="이메일"
              value={email}
              autoComplete="email"
              onChange={(e) => setEmail(e.target.value)}
            />

            {mode !== "reset" && (
              <input
                className={inputCls}
                type="password"
                placeholder="비밀번호 (6자 이상)"
                value={pw}
                autoComplete={
                  mode === "signup" ? "new-password" : "current-password"
                }
                onChange={(e) => setPw(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && mode === "login") handleEmailLogin();
                }}
              />
            )}

            {mode === "signup" && (
              <>
                <input
                  className={inputCls}
                  type="password"
                  placeholder="비밀번호 확인"
                  value={pw2}
                  autoComplete="new-password"
                  onChange={(e) => setPw2(e.target.value)}
                />
                <SchoolPicker value={school} onChange={setSchool} />
              </>
            )}

            {notice && (
              <p className="rounded-xl bg-[var(--md-sys-color-primary-container)] px-3 py-2 text-xs font-medium text-[var(--md-sys-color-on-primary-container)]">
                {notice}
              </p>
            )}

            <button
              onClick={
                mode === "login"
                  ? handleEmailLogin
                  : mode === "signup"
                    ? handleSignup
                    : handleReset
              }
              disabled={busy}
              className="btn-accent mt-1 px-5 py-3 text-sm font-bold disabled:opacity-50"
            >
              {busy
                ? "처리 중…"
                : mode === "login"
                  ? "로그인"
                  : mode === "signup"
                    ? "회원가입"
                    : "재설정 메일 보내기"}
            </button>

            <div className="flex items-center justify-center gap-3 text-xs text-[var(--md-sys-color-on-surface-variant)]">
              {mode === "login" && (
                <>
                  <button
                    onClick={() => {
                      resetForms();
                      setMode("signup");
                    }}
                    className="hover:underline"
                  >
                    회원가입
                  </button>
                  <span className="text-black/20">·</span>
                  <button
                    onClick={() => {
                      resetForms();
                      setMode("reset");
                    }}
                    className="hover:underline"
                  >
                    비밀번호 찾기
                  </button>
                </>
              )}
              {mode === "signup" && (
                <button
                  onClick={() => {
                    resetForms();
                    setMode("login");
                  }}
                  className="hover:underline"
                >
                  이미 계정이 있어요 · 로그인
                </button>
              )}
              {mode === "reset" && (
                <button
                  onClick={() => {
                    resetForms();
                    setMode("login");
                  }}
                  className="hover:underline"
                >
                  로그인으로 돌아가기
                </button>
              )}
            </div>
          </div>
        )}

        {signinErr && (
          <p className="mt-4 rounded-2xl bg-[var(--md-sys-color-error-container)] px-4 py-3 text-sm font-semibold text-[var(--md-sys-color-on-error-container)]">
            {signinErr}
          </p>
        )}

        {configured ? null : (
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

        <p className="mt-7 flex items-center justify-center gap-3 text-base text-black/40 dark:text-white/40">
          <Link href="/terms" className="hover:underline">
            이용약관
          </Link>
          <span className="text-black/20">·</span>
          <Link href="/privacy" className="hover:underline">
            개인정보 처리방침
          </Link>
        </p>
      </GlassCard>
    </main>
  );
}
