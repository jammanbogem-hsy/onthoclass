"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { searchSchools, type School } from "@/lib/schools";

/**
 * 학교 선택 콤보박스 — NEIS 자동완성 + 자유 입력 폴백.
 * NEIS 키가 없거나 결과가 없으면 입력한 텍스트를 그대로 학교명으로 사용한다.
 * value/onChange 는 최종 학교명(문자열) 단일 소스.
 */
export function SchoolPicker({
  value,
  onChange,
  placeholder = "학교 (검색 또는 직접 입력)",
}: {
  value: string;
  onChange: (school: string) => void;
  placeholder?: string;
}) {
  const [results, setResults] = useState<School[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  // 사용자가 직접 타이핑한 값과 NEIS 조회를 구분하기 위한 더티 플래그
  const typingRef = useRef(false);

  // 디바운스 검색
  useEffect(() => {
    if (!typingRef.current) return;
    const q = value.trim();
    if (q.length < 1) {
      setResults([]);
      return;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      const list = await searchSchools(q);
      setResults(list);
      setOpen(list.length > 0);
      setLoading(false);
    }, 250);
    return () => clearTimeout(t);
  }, [value]);

  // 바깥 클릭 시 닫기
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node))
        setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  return (
    <div ref={boxRef} className="relative">
      <div className="relative">
        <input
          className="m3-field !pl-10"
          placeholder={placeholder}
          value={value}
          autoComplete="off"
          onChange={(e) => {
            typingRef.current = true;
            onChange(e.target.value);
          }}
          onFocus={() => results.length > 0 && setOpen(true)}
        />
        <Icon
          name={loading ? "hourglass_empty" : "school"}
          size={18}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--md-sys-color-on-surface-variant)]"
        />
      </div>

      {open && results.length > 0 && (
        <ul className="glass-strong absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-2xl p-1 shadow-lg">
          {results.map((s, i) => (
            <li key={`${s.name}-${i}`}>
              <button
                type="button"
                className="flex w-full flex-col items-start rounded-xl px-3 py-2 text-left transition hover:bg-black/5 dark:hover:bg-white/10"
                onClick={() => {
                  typingRef.current = false;
                  onChange(s.name);
                  setOpen(false);
                }}
              >
                <span className="text-sm font-semibold">{s.name}</span>
                {s.address && (
                  <span className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                    {s.address}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
