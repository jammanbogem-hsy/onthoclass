"use client";

// 학생 추첨 룰렛 — 불러온 학생들 사이에서 슬롯머신처럼 돌려 한 명을 뽑는다.
// 뽑힌 학생은 '발표자로 지정'(학생 화면 무지개) 하거나 제외하고 다시 뽑을 수 있다.
import { useCallback, useEffect, useRef, useState } from "react";
import type { Member } from "@/lib/classes";

// Web Audio 효과음(파일 없이 합성) — 추첨 블립 + 당첨 팡파르
function useSound() {
  const ctxRef = useRef<AudioContext | null>(null);
  const ensure = () => {
    if (!ctxRef.current) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctxRef.current = new AC();
    }
    return ctxRef.current!;
  };
  const blip = useCallback((freq: number) => {
    try {
      const ctx = ensure();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = freq;
      o.type = "triangle";
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.12);
      o.connect(g).connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + 0.13);
    } catch {}
  }, []);
  const fanfare = useCallback(() => {
    try {
      const ctx = ensure();
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        const t = ctx.currentTime + i * 0.1;
        o.frequency.value = f;
        o.type = "sawtooth";
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.2, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
        o.connect(g).connect(ctx.destination);
        o.start(t);
        o.stop(t + 0.42);
      });
    } catch {}
  }, []);
  return { blip, fanfare };
}

function Avatar({ m, size = 40 }: { m: Member; size?: number }) {
  return m.photoURL ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={m.photoURL}
      referrerPolicy="no-referrer"
      alt=""
      style={{ width: size, height: size }}
      className="shrink-0 rounded-full object-cover"
    />
  ) : (
    <span
      style={{ width: size, height: size, fontSize: size * 0.5 }}
      className="emoji-noto flex shrink-0 items-center justify-center rounded-full bg-[var(--md-sys-color-surface-container-highest)]"
    >
      🧒
    </span>
  );
}

export function RoulettePicker({
  students,
  presenterUid,
  onPresent,
  onClearPresent,
}: {
  students: Member[];
  presenterUid: string | null;
  onPresent: (m: Member) => void;
  onClearPresent: () => void;
}) {
  const { blip, fanfare } = useSound();
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [flash, setFlash] = useState<Member | null>(null); // 돌아가는 동안 깜빡이는 후보
  const [winner, setWinner] = useState<Member | null>(null);
  const [spinning, setSpinning] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pool = students.filter((s) => !excluded.has(s.uid));

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function spin() {
    if (spinning || pool.length === 0) return;
    setWinner(null);
    setSpinning(true);
    const final = pool[Math.floor(Math.random() * pool.length)];
    let elapsed = 0;
    let delay = 60;
    const total = 2200 + Math.floor(Math.random() * 600);
    const step = () => {
      const pick = pool[Math.floor(Math.random() * pool.length)];
      setFlash(pick);
      blip(440 + Math.random() * 440);
      elapsed += delay;
      if (elapsed >= total) {
        setFlash(final);
        setWinner(final);
        setSpinning(false);
        fanfare();
        return;
      }
      delay = Math.min(delay * 1.12, 320); // 점점 느려짐
      timer.current = setTimeout(step, delay);
    };
    step();
  }

  function toggleExclude(uid: string) {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
    setWinner(null);
  }

  return (
    <div>
      {/* 룰렛 디스플레이 */}
      <div
        className={[
          "mb-3 flex min-h-[88px] items-center justify-center gap-3 rounded-2xl px-4 py-3 transition",
          winner
            ? "bg-[var(--md-sys-color-primary-container)] ring-2 ring-[var(--md-sys-color-primary)]"
            : "bg-[var(--md-sys-color-surface-container-highest)]",
        ].join(" ")}
        style={winner ? { animation: "winnerPop .4s ease" } : undefined}
      >
        {flash ? (
          <>
            <Avatar m={flash} size={winner ? 56 : 44} />
            <div className="min-w-0">
              <p
                className={[
                  "truncate font-black text-[var(--md-sys-color-on-surface)]",
                  winner ? "text-2xl" : "text-lg",
                ].join(" ")}
              >
                {flash.displayName}
              </p>
              {winner && (
                <p className="text-xs font-bold text-[var(--md-sys-color-primary)]">
                  🎉 당첨!
                </p>
              )}
            </div>
          </>
        ) : (
          <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">
            {pool.length > 0 ? "돌려서 한 명을 뽑아요" : "남은 학생이 없어요"}
          </p>
        )}
      </div>

      <div className="flex gap-2">
        <button
          onClick={spin}
          disabled={spinning || pool.length === 0}
          className="flex-1 rounded-full bg-[var(--md-sys-color-primary)] px-4 py-2.5 text-sm font-bold text-[var(--md-sys-color-on-primary)] disabled:opacity-40"
        >
          {spinning ? "돌리는 중…" : winner ? "다시 뽑기 🎰" : "룰렛 돌리기 🎰"}
        </button>
        {excluded.size > 0 && (
          <button
            onClick={() => { setExcluded(new Set()); setWinner(null); }}
            className="rounded-full border border-[var(--md-sys-color-outline-variant)] px-3 py-2.5 text-xs font-medium text-[var(--md-sys-color-on-surface-variant)]"
          >
            제외 초기화
          </button>
        )}
      </div>

      {/* 당첨자 액션 */}
      {winner && (
        <div className="mt-2 flex flex-wrap gap-2">
          {presenterUid === winner.uid ? (
            <button
              onClick={onClearPresent}
              className="flex-1 rounded-full border border-[var(--md-sys-color-primary)] px-4 py-2 text-sm font-bold text-[var(--md-sys-color-primary)]"
            >
              발표 종료
            </button>
          ) : (
            <button
              onClick={() => onPresent(winner)}
              className="flex-1 rounded-full bg-[var(--md-sys-color-tertiary-container)] px-4 py-2 text-sm font-bold text-[var(--md-sys-color-on-tertiary-container)]"
            >
              🌈 발표자로 지정 (학생 화면에 표시)
            </button>
          )}
          <button
            onClick={() => toggleExclude(winner.uid)}
            className="rounded-full border border-[var(--md-sys-color-outline-variant)] px-3 py-2 text-xs font-medium text-[var(--md-sys-color-on-surface-variant)]"
          >
            제외하고 계속
          </button>
        </div>
      )}

      {/* 후보 칩(제외 토글) */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {students.map((s) => {
          const off = excluded.has(s.uid);
          return (
            <button
              key={s.uid}
              onClick={() => toggleExclude(s.uid)}
              title={off ? "다시 포함" : "제외하기"}
              className={[
                "flex items-center gap-1 rounded-full border px-2 py-1 text-xs transition",
                off
                  ? "border-dashed border-[var(--md-sys-color-outline)] text-[var(--md-sys-color-on-surface-variant)] line-through opacity-50"
                  : "border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface)]",
              ].join(" ")}
            >
              <Avatar m={s} size={18} />
              {s.displayName}
            </button>
          );
        })}
      </div>
      <style>{`@keyframes winnerPop{0%{transform:scale(.9)}60%{transform:scale(1.06)}100%{transform:scale(1)}}`}</style>
    </div>
  );
}
