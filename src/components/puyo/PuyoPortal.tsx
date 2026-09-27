"use client";
import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { puyoUrl } from "@/lib/puyo";
export function PuyoPortal({ cid, gid, autoEnter = true }: { cid: string; gid: string; autoEnter?: boolean }) {
  const router = useRouter(); const pathname = usePathname(); const visited = useRef("");
  useEffect(() => {
    if (!autoEnter || pathname.startsWith("/puyo") || visited.current === gid) return;
    visited.current = gid; router.push(puyoUrl(cid, gid));
  }, [cid, gid, pathname, router, autoEnter]);
  if (pathname.startsWith("/puyo")) return null;
  return <a href={puyoUrl(cid, gid)} className="fixed bottom-5 right-5 z-[91] rounded-full bg-violet-600 px-6 py-3 font-bold text-white shadow-lg">뿌요뿌요 경기로 이동</a>;
}
