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
import {
  PILL_PRESETS,
  THEMES,
  formatPillGradient,
  getPill,
  getTheme,
  hueSwatch,
  isHueTheme,
  parseHue,
  pillGradientCss,
  setPill,
  setTheme,
  type ThemeKey,
} from "@/lib/colorTheme";

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
  const [wheelOpen, setWheelOpen] = useState(false);
  const [pill, setPillState] = useState<string | null>(null);
  const curHue = isHueTheme(theme) ? parseHue(theme) : null;
  const ref = useRef<HTMLDivElement>(null);
  const avatarSrc = profile?.avatar || user?.photoURL || "";

  useEffect(() => {
    setFontState(getFont());
    setThemeState(getTheme());
    setPillState(getPill());
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

  function pickPill(v: string | null) {
    setPill(v);
    setPillState(v);
  }

  function pickTheme(k: ThemeKey) {
    setTheme(k);
    setThemeState(k);
  }

  // 색상환 클릭 → 중심 기준 각도를 hue 로 (12시가 0도)
  function pickFromWheel(e: React.MouseEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    let deg =
      (Math.atan2(e.clientY - cy, e.clientX - cx) * 180) / Math.PI + 90;
    if (deg < 0) deg += 360;
    pickTheme(`hue:${Math.round(deg) % 360}` as ThemeKey);
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
            /* 색상환·글꼴 9종이 들어가면서 메뉴가 화면보다 길어져 아래(프로필
               사진 변경·로그아웃)가 잘렸다. 화면 높이에 맞춰 자르고 안에서
               스크롤한다(스크롤이 뒤 페이지로 새지 않게 overscroll-contain). */
            <div className="glass-strong absolute right-0 top-12 max-h-[calc(100vh-7rem)] w-60 animate-float-in overflow-y-auto overscroll-contain p-4">
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
                {/* 직접 고르기 — 색상환에서 각도(hue)를 골라 360색.
                    밝기는 hue 마다 자동 보정돼 흰 글자 대비가 항상 확보된다. */}
                <button
                  type="button"
                  onClick={() => setWheelOpen((v) => !v)}
                  aria-expanded={wheelOpen}
                  className="mt-2 flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)] hover:bg-black/5"
                >
                  <span className="flex items-center gap-1.5">
                    <Icon name="colorize" size={14} />
                    직접 고르기
                    {curHue !== null && (
                      <span className="tabular-nums text-[var(--md-sys-color-primary)]">
                        {curHue}°
                      </span>
                    )}
                  </span>
                  <Icon
                    name={wheelOpen ? "expand_less" : "expand_more"}
                    size={16}
                  />
                </button>
                {wheelOpen && (
                  <div className="mt-1 flex flex-col items-center gap-2 pb-1">
                    <div
                      role="button"
                      tabIndex={0}
                      title="원에서 색을 선택"
                      aria-label="색상환에서 색 선택"
                      onClick={pickFromWheel}
                      onKeyDown={(e) => {
                        // 키보드로도 조절 가능하게(좌우 5도씩)
                        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight")
                          return;
                        e.preventDefault();
                        const base = curHue ?? 0;
                        const next =
                          (base + (e.key === "ArrowRight" ? 5 : -5) + 360) % 360;
                        pickTheme(`hue:${next}` as ThemeKey);
                      }}
                      className="relative h-28 w-28 cursor-crosshair rounded-full shadow-inner"
                      style={{
                        background:
                          "conic-gradient(from 0deg, hsl(0 70% 55%), hsl(60 70% 55%), hsl(120 70% 55%), hsl(180 70% 55%), hsl(240 70% 55%), hsl(300 70% 55%), hsl(360 70% 55%))",
                      }}
                    >
                      <div className="absolute inset-4 flex items-center justify-center rounded-full bg-[var(--md-sys-color-surface-container)] text-[11px] font-bold text-[var(--md-sys-color-on-surface-variant)]">
                        {curHue !== null ? `${curHue}°` : "고르기"}
                      </div>
                      {curHue !== null &&
                        (() => {
                          const rad = ((curHue - 90) * Math.PI) / 180;
                          const R = 48;
                          return (
                            <span
                              className="pointer-events-none absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
                              style={{
                                left: 56 + R * Math.cos(rad),
                                top: 56 + R * Math.sin(rad),
                                background: hueSwatch(curHue),
                              }}
                            />
                          );
                        })()}
                    </div>
                  </div>
                )}
              </div>
              {/* 내 배지 그라데이션 — 학생이 자기 '마이페이지' 배지 색을 고른다.
                  흰 글자가 올라가므로 hueSwatch(테마용 밝기 보정값)를 그대로 써서
                  어떤 색을 골라도 글자가 읽힌다. */}
              <div className="mt-3 rounded-xl bg-[var(--md-sys-color-surface-container)] p-2">
                <p className="mb-1.5 flex items-center gap-1.5 px-1 text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)]">
                  <Icon name="gradient" size={14} />
                  내 배지 색
                </p>
                <div className="grid grid-cols-3 gap-1.5 px-1">
                  {PILL_PRESETS.map((g) => {
                    const v = formatPillGradient(g);
                    const on = pill === v;
                    return (
                      <button
                        key={g.label}
                        onClick={() => pickPill(v)}
                        aria-pressed={on}
                        title={g.label}
                        className={`flex h-8 items-center justify-center rounded-full text-[11px] font-bold text-white transition ${
                          on
                            ? "ring-2 ring-[var(--md-sys-color-on-surface)] ring-offset-2 ring-offset-[var(--md-sys-color-surface-container)]"
                            : "hover:scale-105"
                        }`}
                        style={{ background: pillGradientCss(g) }}
                      >
                        {g.label}
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  onClick={() => pickPill(null)}
                  className="mt-1.5 w-full rounded-lg px-2 py-1 text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)] hover:bg-black/5"
                >
                  {pill ? "기본(테마 색)으로" : "지금은 테마 색을 써요"}
                </button>
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
