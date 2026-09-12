"use client";
import { useEffect, useRef } from "react";
/** 모달 내부 Tab 이동, Escape 닫기, 닫힌 뒤 원래 버튼으로 포커스 복원. */
export function useModalFocus(onClose: () => void) {
  const ref = useRef<HTMLElement>(null);
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; }, [onClose]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const selectors = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex="0"]';
    const items = () => Array.from(ref.current?.querySelectorAll<HTMLElement>(selectors) ?? []).filter(el => el.getClientRects().length);
    items()[0]?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close.current(); }
      if (event.key !== "Tab") return;
      const list = items(); const first = list[0], last = list.at(-1);
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || !ref.current?.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !ref.current?.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", key, true);
    return () => { document.removeEventListener("keydown", key, true); document.body.style.overflow = overflow; previous?.focus(); };
  }, []);
  return ref;
}
