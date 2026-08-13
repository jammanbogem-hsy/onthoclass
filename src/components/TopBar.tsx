"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Icon } from "@/components/Icon";
import { NotificationBell } from "@/components/NotificationBell";
import { AvatarPicker } from "@/components/AvatarPicker";
import { NoticeTicker } from "@/components/NoticeTicker";
import { TypedText } from "@/components/TypedText";
import { setUserAvatar } from "@/lib/users";
import {
  FONTS,
  FONT_CSS,
  ensureFontCss,
  getFont,
  setFont,
  type FontKey,
} from "@/lib/fontTheme";
import { THEMES, getTheme, setTheme, type ThemeKey } from "@/lib/colorTheme";

const FONT_PREVIEW: Record<FontKey, string> = {
  default: "var(--md-sys-font-plain)",
  susukkang: "SchoolSafetySusukkang, sans-serif",
  paperozi: "Paperozi, sans-serif",
  a2z: "A2z, sans-serif",
  maruburi: "MaruBuri, serif",
  cafe24air: "Cafe24SurroundAir, sans-serif",
  eliceneolli: "'Elice DX Neolli', sans-serif",
  elicebaeum: "'Elice Digital Baeum', sans-serif",
  elicecoding: "'Elice Digital Coding', monospace",
};

export function TopBar() {
  const { user, profile, signOut, refreshProfile } = useAuth();
  const [open, setOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [font, setFontState] = useState<FontKey>("default");
  const [theme, setThemeState] = useState<ThemeKey>("default");
  const ref = useRef<HTMLDivElement>(null);
  const avatarSrc = profile?.avatar || user?.photoURL || "";

  useEffect(() => {
    setFontState(getFont());
    setThemeState(getTheme());
  }, []);

  // 글꼴 메뉴를 연 순간에만 원격 폰트 CSS 를 받아 미리보기를 실제 글꼴로 보여준다
  // (평소에는 내려받지 않아 첫 로딩 비용 0).
  useEffect(() => {
    if (!open) return;
    for (const k of Object.keys(FONT_CSS) as FontKey[]) ensureFontCss(k);
  }, [open]);

  function pickFont(k: FontKey) {
    setFont(k);
    setFontState(k);
  }

  function pickTheme(k: ThemeKey) {
    setTheme(k);
    setThemeState(k);
  }

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const roleLabel =
    profile?.role === "teacher"
      ? "교사"
      : profile?.role === "student"
        ? "학생"
        : "미설정";

  return (
    <header className="sticky top-0 z-40 px-4 pt-4">
      <div className="glass mx-auto flex max-w-5xl items-center justify-between px-5 py-3">
        <div
          className="flex items-center text-xl font-bold tracking-tight text-[var(--md-sys-color-primary)] sm:text-2xl"
          style={{ fontFamily: "'Galmuri11', monospace" }}
        >
          <TypedText
            words={["러닝크루", "함께 달려요", "함께 배워요"]}
            typeMs={150}
            deleteMs={60}
            holdMs={2200}
          />
        </div>

        <div className="flex items-center gap-2">
          <NotificationBell />
          <div className="relative flex items-center gap-3" ref={ref}>
          <button
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-2 rounded-full py-1 pl-1 pr-3 transition hover:bg-white/60 dark:hover:bg-white/10"
          >
            {avatarSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={avatarSrc}
                src={avatarSrc}
                alt={profile?.name ?? "사용자"}
                className="h-8 w-8 rounded-full object-cover ring-2 ring-white/70"
                style={{ animation: "jam-avatar-in .42s ease" }}
              />
            ) : (
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--accent-soft)] text-sm font-semibold">
                {(profile?.name ?? user?.displayName ?? "?")[0]}
              </span>
            )}
            <span className="text-sm font-medium">
              {profile?.name ?? user?.displayName ?? "사용자"}
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                profile?.role === "teacher"
                  ? "bg-[var(--accent-soft)] text-[var(--accent-strong)]"
                  : "bg-[var(--md-sys-color-surface-container-highest)] text-[var(--md-sys-color-on-surface-variant)]"
              }`}
            >
              {roleLabel}
            </span>
          </button>

          {open && (
            <div className="glass-strong absolute right-0 top-12 w-60 animate-float-in p-4">
              <p className="text-base font-medium">
                {profile?.name ?? user?.displayName ?? "사용자"}
              </p>
              <p className="mt-0.5 truncate text-xs text-[var(--md-sys-color-on-surface-variant)]">
                {user?.email}
              </p>
              <div className="mt-3 flex items-center justify-between rounded-xl bg-[var(--md-sys-color-surface-container)] px-3 py-2">
                <span className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                  내 권한
                </span>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                    profile?.role === "teacher"
                      ? "bg-[var(--accent-soft)] text-[var(--accent-strong)]"
                      : "bg-[var(--md-sys-color-surface-container-highest)] text-[var(--md-sys-color-on-surface-variant)]"
                  }`}
                >
                  {roleLabel}
                </span>
              </div>
              {/* 색상 테마 — 기기별 저장, 전체 UI 색상 변경 */}
              <div className="mt-3 rounded-xl bg-[var(--md-sys-color-surface-container)] p-2">
                <p className="mb-1.5 flex items-center gap-1.5 px-1 text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)]">
                  <Icon name="palette" size={14} />
                  색상
                </p>
                <div className="grid grid-cols-6 gap-1.5 px-1">
                  {THEMES.map((t) => (
                    <button
                      key={t.key}
                      onClick={() => pickTheme(t.key)}
                      title={t.label}
                      aria-label={`${t.label} 색상 테마`}
                      aria-pressed={theme === t.key}
                      className={`flex aspect-square items-center justify-center rounded-full transition ${
                        theme === t.key
                          ? "ring-2 ring-[var(--md-sys-color-on-surface)] ring-offset-2 ring-offset-[var(--md-sys-color-surface-container)]"
                          : "hover:scale-110"
                      }`}
                      style={{ backgroundColor: t.swatch }}
                    >
                      {theme === t.key && (
                        <Icon name="check" size={14} className="text-white" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
              {/* 글꼴 선택 — 기기별 저장, 전체 UI 폰트 변경 */}
              <div className="mt-3 rounded-xl bg-[var(--md-sys-color-surface-container)] p-2">
                <p className="mb-1 flex items-center gap-1.5 px-1 text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)]">
                  <Icon name="font_download" size={14} />
                  글꼴
                </p>
                <div className="flex flex-col gap-0.5">
                  {FONTS.map((f) => (
                    <button
                      key={f.key}
                      onClick={() => pickFont(f.key)}
                      className={`flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left transition ${
                        font === f.key
                          ? "bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)]"
                          : "hover:bg-black/5"
                      }`}
                      style={{ fontFamily: FONT_PREVIEW[f.key] }}
                    >
                      <span className="text-sm font-semibold">{f.label}</span>
                      {font === f.key && <Icon name="check" size={15} />}
                    </button>
                  ))}
                </div>
              </div>
              <button
                onClick={() => {
                  setOpen(false);
                  setPickerOpen(true);
                }}
                className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-full bg-[var(--md-sys-color-primary)] px-3 py-2 text-xs font-semibold text-white transition hover:brightness-105"
              >
                <Icon name="face" size={15} />
                프로필 사진 변경
              </button>
              <button
                onClick={() => signOut()}
                className="mt-2 w-full rounded-full border border-[var(--md-sys-color-outline)] px-3 py-2 text-xs font-medium text-[var(--md-sys-color-primary)] transition hover:bg-[color-mix(in_srgb,var(--md-sys-color-primary)_8%,transparent)]"
              >
                로그아웃
              </button>
            </div>
          )}
          </div>
        </div>
      </div>

      <NoticeTicker />

      {pickerOpen && (
        <AvatarPicker
          current={avatarSrc}
          onClose={() => setPickerOpen(false)}
          onSelect={async (path) => {
            if (!user) return;
            await setUserAvatar(user.uid, path, user.photoURL ?? "");
            await refreshProfile();
          }}
        />
      )}
    </header>
  );
}
