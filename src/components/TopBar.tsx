"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Icon } from "@/components/Icon";
import { NotificationBell } from "@/components/NotificationBell";
import { AvatarPicker } from "@/components/AvatarPicker";
import { setUserAvatar } from "@/lib/users";

export function TopBar() {
  const { user, profile, signOut, refreshProfile } = useAuth();
  const [open, setOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const avatarSrc = profile?.avatar || user?.photoURL || "";

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
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--md-sys-color-on-primary-container)]">
            <Icon name="school" size={22} />
          </span>
          <span className="text-lg font-bold tracking-tight">잼클래스</span>
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
              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
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
