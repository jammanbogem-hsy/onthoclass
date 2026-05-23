"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { Icon } from "@/components/Icon";
import {
  markAllNotifsRead,
  markNotifRead,
  watchNotifications,
  type Notif,
} from "@/lib/notifications";

export function NotificationBell() {
  const { user } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<Notif[]>([]);
  const [open, setOpen] = useState(false);
  const [toasts, setToasts] = useState<Notif[]>([]);
  const ref = useRef<HTMLDivElement>(null);
  const seenRef = useRef<Set<string>>(new Set());
  const primedRef = useRef(false);

  useEffect(() => {
    if (!user) return;
    primedRef.current = false;
    seenRef.current = new Set();
    return watchNotifications(user.uid, (list) => {
      setItems(list);
      // 첫 스냅샷은 토스트 없이 시드만 등록(과거 안 읽은 알림이 한꺼번에 뜨지 않게)
      if (!primedRef.current) {
        list.forEach((n) => seenRef.current.add(n.id));
        primedRef.current = true;
        return;
      }
      const fresh = list.filter(
        (n) => !seenRef.current.has(n.id) && !n.readAt
      );
      if (fresh.length === 0) return;
      fresh.forEach((n) => seenRef.current.add(n.id));
      setToasts((q) => [...q, ...fresh]);
      // 6초 뒤 자동 닫힘
      fresh.forEach((n) =>
        setTimeout(
          () => setToasts((q) => q.filter((x) => x.id !== n.id)),
          6000
        )
      );
    });
  }, [user]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  if (!user) return null;
  const unread = items.filter((n) => !n.readAt).length;

  function go(n: Notif) {
    if (user && !n.readAt) markNotifRead(user.uid, n.id).catch(() => {});
    setOpen(false);
    if (n.link) router.push(n.link);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-white/60 dark:hover:bg-white/10"
        title="알림"
      >
        <Icon name="notifications" size={20} />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="glass-strong absolute right-0 top-12 z-50 w-80 animate-float-in p-3">
          <div className="mb-2 flex items-center justify-between px-1">
            <p className="text-sm font-semibold">알림</p>
            {unread > 0 && (
              <button
                onClick={() =>
                  user && markAllNotifsRead(user.uid).catch(() => {})
                }
                className="text-xs text-[var(--md-sys-color-primary)] hover:underline"
              >
                모두 읽음
              </button>
            )}
          </div>
          <ul className="flex max-h-96 flex-col gap-1 overflow-y-auto">
            {items.length === 0 ? (
              <li className="py-6 text-center text-xs text-black/40">
                새 알림이 없습니다.
              </li>
            ) : (
              items.map((n) => (
                <li key={n.id}>
                  <button
                    onClick={() => go(n)}
                    className={`flex w-full items-start gap-2 rounded-xl px-3 py-2 text-left text-xs transition hover:bg-black/5 dark:hover:bg-white/10 ${
                      n.readAt ? "opacity-55" : ""
                    }`}
                  >
                    <span
                      className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
                        n.readAt ? "bg-transparent" : "bg-rose-500"
                      }`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block">{n.text}</span>
                      <span className="mt-0.5 block text-[10px] text-black/35">
                        {n.createdAt
                          ? new Date(n.createdAt).toLocaleString("ko-KR", {
                              month: "numeric",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : ""}
                      </span>
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}

      {/* 새 알림 토스트 (상단 우측, 자동 닫힘) */}
      {toasts.length > 0 && (
        <div className="fixed right-4 top-20 z-[70] flex w-80 flex-col gap-2">
          {toasts.map((n) => {
            const openNotif = () => {
              if (user && !n.readAt)
                markNotifRead(user.uid, n.id).catch(() => {});
              setToasts((q) => q.filter((x) => x.id !== n.id));
              if (n.link) router.push(n.link);
            };
            return (
            <div
              key={n.id}
              role="button"
              tabIndex={0}
              onClick={openNotif}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  openNotif();
                }
              }}
              className="flex animate-float-in cursor-pointer items-start gap-2 rounded-2xl bg-[var(--md-sys-color-primary)] px-4 py-3 text-left text-sm text-white shadow-[var(--md-sys-elevation-3)] transition hover:brightness-110"
            >
              <Icon
                name={n.type === "message" ? "forum" : "notifications"}
                size={18}
                className="mt-0.5 shrink-0 opacity-90"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">
                  {n.type === "message" ? "새 메시지" : "새 알림"}
                </span>
                <span className="line-clamp-2 text-xs opacity-90">
                  {n.text}
                </span>
              </span>
              <button
                type="button"
                aria-label="알림 닫기"
                onClick={(e) => {
                  e.stopPropagation();
                  setToasts((q) => q.filter((x) => x.id !== n.id));
                }}
                className="ml-1 shrink-0 cursor-pointer rounded-full p-0.5 opacity-70 hover:opacity-100"
              >
                <Icon name="close" size={14} />
              </button>
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
