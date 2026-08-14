"use client";

/**
 * 학생 이름 마스킹 — 발표·화면 공유 중 다른 사람에게 학생 이름이 보이지 않게 가린다.
 *
 * 표시 전용이다. CSV 내보내기·LLM 분석 요청·경험치 지급 등 데이터에는 언제나
 * 원본 이름이 쓰인다(가려진 화면으로 내보낸 파일이 못 쓰게 되는 일이 없도록).
 *
 * 상태는 계정(users/{uid}.prefs.nameMask)에 저장돼 다른 탭·다른 기기까지 따라온다
 * (동기화는 PrefsSync 담당). localStorage 는 로그인 전 첫 페인트용 캐시일 뿐이다.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Icon } from "@/components/Icon";
import { savePrefIfSignedIn } from "@/lib/prefs";

const KEY = "lc:nameMask";

/** "김성하" → "김○○", "John Smith" → "J○○○ S○○○". 첫 글자만 남기고 가린다. */
export function maskName(name: string): string {
  const s = (name ?? "").trim();
  if (!s) return "○○○";
  return s
    .split(/\s+/)
    .map((word) => {
      const ch = Array.from(word);
      if (ch.length <= 1) return word;
      return ch[0] + "○".repeat(Math.min(ch.length - 1, 4));
    })
    .join(" ");
}

type NameMaskCtx = {
  masked: boolean;
  setMasked: (v: boolean) => void;
  /** 원격(계정) 변경 반영용 — 사용자 조작이 아니므로 다시 저장하지 않는다. */
  setMaskedFromRemote: (v: boolean) => void;
  /** 이름 하나 가리기(꺼져 있으면 원본 그대로). */
  mask: (name?: string | null) => string;
  /** uid → 이름 맵 통째로 가리기(지식맵·감정 패널 라벨용). */
  maskMap: (m: Record<string, string>) => Record<string, string>;
};

const OFF: NameMaskCtx = {
  masked: false,
  setMasked: () => {},
  setMaskedFromRemote: () => {},
  mask: (n) => n ?? "",
  maskMap: (m) => m,
};

const Ctx = createContext<NameMaskCtx>(OFF);

/** Provider 없이 쓰면 마스킹 꺼진 상태로 동작(학생 화면 등). */
export function useNameMask(): NameMaskCtx {
  return useContext(Ctx);
}

export function NameMaskProvider({ children }: { children: ReactNode }) {
  const [masked, setMaskedState] = useState(false);

  // 서버·클라이언트 첫 렌더를 맞추기 위해 마운트 후에 복원한다.
  // 계정 설정이 도착하면 PrefsSync 가 setMaskedFromRemote 로 덮어쓴다.
  useEffect(() => {
    try {
      setMaskedState(localStorage.getItem(KEY) === "1");
    } catch {}
  }, []);

  // 로컬 캐시만 갱신(원격 저장은 PrefsSync 가 구독해서 처리)
  const setMaskedFromRemote = useCallback((v: boolean) => {
    setMaskedState(v);
    try {
      localStorage.setItem(KEY, v ? "1" : "0");
    } catch {}
  }, []);

  const setMasked = useCallback(
    (v: boolean) => {
      setMaskedFromRemote(v);
      // 계정에 반영 — 로그인 상태일 때만 동작한다.
      void savePrefIfSignedIn({ nameMask: v });
    },
    [setMaskedFromRemote]
  );

  const value = useMemo<NameMaskCtx>(
    () => ({
      masked,
      setMasked,
      setMaskedFromRemote,
      mask: (n) => (masked ? maskName(n ?? "") : (n ?? "")),
      maskMap: (m) =>
        masked
          ? Object.fromEntries(
              Object.entries(m).map(([uid, n]) => [uid, maskName(n)])
            )
          : m,
    }),
    [masked, setMasked, setMaskedFromRemote]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** 교사 툴바용 토글 — 켜면 이 차시 화면의 학생 이름이 모두 가려진다. */
export function NameMaskToggle({ className = "" }: { className?: string }) {
  const { masked, setMasked } = useNameMask();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={masked}
      onClick={() => setMasked(!masked)}
      title={
        masked
          ? "학생 이름을 가리는 중입니다(발표용). 누르면 이름이 다시 보입니다."
          : "발표·화면 공유용으로 학생 이름을 가립니다. (CSV·경험치에는 원래 이름이 그대로 쓰여요)"
      }
      className={`inline-flex h-10 items-center gap-1 rounded-full px-4 text-xs font-medium transition ${
        masked
          ? "bg-[var(--md-sys-color-tertiary-container)] text-[var(--md-sys-color-on-tertiary-container)] ring-1 ring-inset ring-[var(--md-sys-color-tertiary)]"
          : "border border-[var(--md-sys-color-outline)] text-[var(--md-sys-color-primary)] hover:bg-[color-mix(in_srgb,var(--md-sys-color-primary)_8%,transparent)]"
      } ${className}`}
    >
      <Icon name={masked ? "visibility_off" : "visibility"} size={16} />
      {masked ? "이름 가림 ON" : "이름 가리기"}
    </button>
  );
}
