"use client";

// 업데이트 내역 목록 — 학생 피드백 위젯과 교사 받은함이 함께 쓴다.
// 마운트되는 순간 "이 버전을 봤다"고 기록해 버튼의 빨간 점을 지운다.
import { useEffect } from "react";
import { Icon } from "@/components/Icon";
import {
  APP_VERSION,
  CHANGELOG,
  KIND_META,
  markChangelogSeen,
} from "@/lib/changelog";

/** 2026-08-26 → 2026년 8월 26일 */
function fmtDate(d?: string): string {
  if (!d) return "";
  const [y, m, day] = d.split("-").map((n) => parseInt(n, 10));
  if (!y || !m || !day) return d;
  return `${y}년 ${m}월 ${day}일`;
}

export function ChangelogPanel({ onSeen }: { onSeen?: () => void }) {
  useEffect(() => {
    markChangelogSeen();
    onSeen?.();
  }, [onSeen]);

  return (
    <div className="flex flex-col gap-3">
      <p className="flex items-start gap-1.5 text-xs leading-relaxed text-[var(--md-sys-color-on-surface-variant)]">
        <Icon name="info" size={15} className="mt-0.5 shrink-0" />
        <span>
          지금 쓰는 버전은 <b>v{APP_VERSION}</b> 이에요. 새 기능이 들어오면 여기에
          적어 둘게요.
        </span>
      </p>

      <ol className="flex flex-col gap-3">
        {CHANGELOG.map((e) => {
          const meta = KIND_META[e.kind];
          const latest = e.version === APP_VERSION;
          return (
            <li
              key={e.version}
              className="rounded-2xl border px-3.5 py-3"
              style={{
                borderColor: latest
                  ? "var(--md-sys-color-primary)"
                  : "var(--md-sys-color-outline-variant)",
                background: latest
                  ? "color-mix(in srgb, var(--md-sys-color-primary) 6%, var(--md-sys-color-surface-container-low))"
                  : "var(--md-sys-color-surface-container-low)",
              }}
            >
              <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                <span className="text-base font-black tabular-nums">
                  v{e.version}
                </span>
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-extrabold"
                  style={{ background: meta.bg, color: meta.fg }}
                >
                  {meta.label}
                </span>
                {latest && (
                  <span className="rounded-full bg-[var(--md-sys-color-primary)] px-2 py-0.5 text-[10px] font-extrabold text-[var(--md-sys-color-on-primary)]">
                    지금 버전
                  </span>
                )}
                {e.date && (
                  <span className="ml-auto text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
                    {fmtDate(e.date)}
                  </span>
                )}
              </div>
              <p className="mb-1 text-sm font-bold">{e.title}</p>
              <ul className="flex flex-col gap-1">
                {e.items.map((it) => (
                  <li
                    key={it}
                    className="flex gap-1.5 text-xs leading-relaxed text-[var(--md-sys-color-on-surface-variant)]"
                  >
                    <span aria-hidden className="shrink-0">
                      ·
                    </span>
                    <span>{it}</span>
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
