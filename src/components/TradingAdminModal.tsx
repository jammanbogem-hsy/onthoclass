"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui";
import { Switch } from "@/components/ui/Switch";
import { resolveStudentName } from "@/lib/names";
import type { Member } from "@/lib/classes";
import {
  TRADE_PERIODS,
  classTradingStats,
  tradingStats,
  fillTradePnl,
  isTradingOpen,
  nextOpenAt,
  periodStartMs,
  saveTradingConfig,
  setTradingOverride,
  stockBySymbol,
  watchTradingConfig,
  type PeriodKey,
  type TradingConfig,
  type TradingOverride,
  type TradingSession,
  type TradingStats,
  type TradingWindow,
} from "@/lib/trading";
import { StudentTradingTable } from "@/components/trade/StudentTradingTable";
import { AccountSheet } from "@/components/trade/AccountSheet";
import { ContestTab } from "@/components/trade/ContestTab";
import { useClassTrading } from "@/components/trade/useClassTrading";
import {
  pnlStyleFixed as pnlStyle,
  signed,
} from "@/components/trade/util";

/**
 * 만보 트레이딩 관리(교사 전용) —
 *  [거래 시간] 개장 on/off + 매주 반복(weekly, KST) + 일회성 개장(sessions) 설정 → saveTradingConfig.
 *  [투자 현황] 학급 포지션·시세로 학생별 평가액/실현·평가 손익 + 기간 매매 성적 + 최근 체결.
 *  [주식대회] 이 학급이 참가 중인 대회 순위 — 개설은 메인 화면(ContestTab 참고).
 * 종목은 alias(만보전자 등)로 표시하되 실제 종목명(real)을 괄호로 병기한다.
 * 개장 시간은 서버(executeTrade)가 재검증하므로 여기 설정은 학생 매매 가능 시각만 정한다.
 */
const DAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000; // +09:00 고정(DST 없음)

const hmToMin = (hm: string): number => {
  const [h, m] = hm.split(":").map((n) => parseInt(n, 10));
  return (h || 0) * 60 + (m || 0);
};

/** KST 벽시계(YYYY-MM-DD + HH:mm) → epoch ms */
function kstToEpoch(date: string, time: string): number | null {
  const [y, mo, d] = date.split("-").map((n) => parseInt(n, 10));
  const [h, mi] = time.split(":").map((n) => parseInt(n, 10));
  if (!y || !mo || !d || Number.isNaN(h) || Number.isNaN(mi)) return null;
  return Date.UTC(y, mo - 1, d, h, mi) - KST_OFFSET_MS;
}

/** epoch ms → KST 사람용 표기 */
function fmtKst(ms: number, opts: Intl.DateTimeFormatOptions): string {
  return new Date(ms).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", ...opts });
}

const wkey = (w: TradingWindow[]) =>
  JSON.stringify(
    [...w].sort((a, b) => a.day - b.day || hmToMin(a.start) - hmToMin(b.start))
  );
const skey = (s: TradingSession[]) =>
  JSON.stringify([...s].sort((a, b) => a.start - b.start));

export function TradingAdminModal({
  cid,
  members,
  onClose,
}: {
  cid: string;
  members: Member[];
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"schedule" | "board" | "contest">("schedule");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(t);
  }, []);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-[rgba(0,0,0,0.32)] p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-7xl flex-col overflow-hidden rounded-3xl bg-[var(--md-sys-color-surface-container-high)] shadow-[var(--md-sys-elevation-3)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-[var(--md-sys-color-outline-variant)] px-5 py-4">
          <Icon
            name="candlestick_chart"
            size={22}
            className="text-[var(--md-sys-color-primary)]"
          />
          <p className="text-lg font-semibold">만보 트레이딩 관리</p>
          <button
            onClick={onClose}
            className="ml-auto flex h-9 w-9 items-center justify-center rounded-full text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-highest)]"
          >
            <Icon name="close" size={20} />
          </button>
        </div>

        {/* 학생과 같은 트레이딩 화면 열기 — 교사는 자동으로 관전(보기) 모드 */}
        <div className="px-5 pt-4">
          <button
            onClick={() => window.open(`/trade?id=${cid}`, "_blank")}
            className="flex w-full items-center gap-3 rounded-2xl border border-[var(--md-sys-color-outline)] bg-[var(--md-sys-color-surface-container)] px-4 py-3 text-left transition hover:bg-[var(--md-sys-color-surface-container-highest)]"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--md-sys-color-primary-container)]">
              <Icon
                name="open_in_new"
                size={20}
                className="text-[var(--md-sys-color-on-primary-container)]"
              />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-[var(--md-sys-color-on-surface)]">
                트레이딩 화면 열기
              </span>
              <span className="block text-xs text-[var(--md-sys-color-on-surface-variant)]">
                학생들이 보는 화면을 그대로 볼 수 있어요 (교사는 관전 모드)
              </span>
            </span>
            <Icon
              name="chevron_right"
              size={20}
              className="shrink-0 text-[var(--md-sys-color-on-surface-variant)]"
            />
          </button>
        </div>

        {/* 탭 */}
        <div className="flex gap-1.5 px-5 pt-4">
          {(
            [
              ["schedule", "거래 시간 설정"],
              ["board", "학급 투자 현황"],
              ["contest", "주식대회"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`flex-1 rounded-full px-3 py-2 text-sm font-semibold transition ${
                tab === k
                  ? "bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)]"
                  : "border border-[var(--md-sys-color-outline)] text-[var(--md-sys-color-on-surface-variant)]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "schedule" ? (
          <ScheduleTab cid={cid} now={now} />
        ) : tab === "board" ? (
          <BoardTab cid={cid} members={members} />
        ) : (
          <ContestTab cid={cid} />
        )}
      </div>
    </div>
  );
}

// ---------- 탭 1: 거래 시간 설정 ----------
function ScheduleTab({ cid, now }: { cid: string; now: number }) {
  const [remote, setRemote] = useState<TradingConfig | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [weekly, setWeekly] = useState<TradingWindow[]>([]);
  const [sessions, setSessions] = useState<TradingSession[]>([]);
  const inited = useRef(false);

  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(
    null
  );

  useEffect(() => {
    const off = watchTradingConfig(cid, (cfg) => {
      const c: TradingConfig =
        cfg ?? {
          enabled: false,
          weekly: [],
          sessions: [],
          override: null,
          updatedAt: null,
        };
      setRemote(c);
      if (!inited.current) {
        inited.current = true;
        setEnabled(c.enabled);
        setWeekly(
          [...c.weekly].sort(
            (a, b) => a.day - b.day || hmToMin(a.start) - hmToMin(b.start)
          )
        );
        setSessions([...c.sessions].sort((a, b) => a.start - b.start));
      }
    });
    return off;
  }, [cid]);

  const dirty = useMemo(() => {
    if (!remote)
      return enabled || weekly.length > 0 || sessions.length > 0;
    return (
      remote.enabled !== enabled ||
      wkey(remote.weekly) !== wkey(weekly) ||
      skey(remote.sessions) !== skey(sessions)
    );
  }, [remote, enabled, weekly, sessions]);

  // 편집을 다시 시작하면 이전 저장 안내는 지운다
  useEffect(() => {
    if (dirty) setSaveMsg(null);
  }, [dirty]);

  // 상태 요약은 저장된(실제로 적용 중인) 설정 기준
  const openNow = isTradingOpen(remote, now);
  const next = remote ? nextOpenAt(remote, now) : null;

  // 주간 슬롯 입력
  const [wDay, setWDay] = useState(() => new Date().getDay());
  const [wStart, setWStart] = useState("09:00");
  const [wEnd, setWEnd] = useState("09:40");
  const weeklyValid = hmToMin(wStart) < hmToMin(wEnd);

  function addWeekly() {
    if (!weeklyValid) return;
    setWeekly((prev) =>
      [...prev, { day: wDay, start: wStart, end: wEnd }].sort(
        (a, b) => a.day - b.day || hmToMin(a.start) - hmToMin(b.start)
      )
    );
  }

  // 일회성 세션 입력
  const todayStr = new Date().toLocaleDateString("sv-SE", {
    timeZone: "Asia/Seoul",
  }); // YYYY-MM-DD
  const [sDate, setSDate] = useState(todayStr);
  const [sStart, setSStart] = useState("09:00");
  const [sEnd, setSEnd] = useState("09:40");
  const sStartMs = kstToEpoch(sDate, sStart);
  const sEndMs = kstToEpoch(sDate, sEnd);
  const sessionValid =
    sStartMs !== null && sEndMs !== null && sStartMs < sEndMs;

  function addSession() {
    if (sStartMs === null || sEndMs === null || sStartMs >= sEndMs) return;
    setSessions((prev) =>
      [...prev, { start: sStartMs, end: sEndMs }].sort((a, b) => a.start - b.start)
    );
  }

  const hasPast = sessions.some((s) => s.end < now);

  async function save() {
    setSaving(true);
    setSaveMsg(null);
    try {
      await saveTradingConfig(cid, { enabled, weekly, sessions });
      setSaveMsg({ ok: true, text: "저장했어요" });
    } catch (e) {
      setSaveMsg({
        ok: false,
        text: (e as Error)?.message || "저장에 실패했어요",
      });
    } finally {
      setSaving(false);
    }
  }

  // 즉시 전환(열기/닫기/시간표대로) — 초안(draft)과 무관하게 바로 저장된다.
  const [switching, setSwitching] = useState(false);
  async function applyOverride(next: TradingOverride) {
    if (switching || remote?.override === next) return;
    setSwitching(true);
    try {
      await setTradingOverride(cid, next);
    } catch (e) {
      setSaveMsg({
        ok: false,
        text: (e as Error)?.message || "전환에 실패했어요",
      });
    } finally {
      setSwitching(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5">
      {/* 상태 요약 */}
      <div
        className={`flex flex-wrap items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold ${
          openNow
            ? "bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)]"
            : "bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface-variant)]"
        }`}
      >
        {openNow ? (
          <span className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ background: "currentColor" }}
            />{" "}
            지금 거래 중
          </span>
        ) : (
          <span className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ background: "currentColor" }}
            />{" "}
            지금은 폐장
          </span>
        )}
        {openNow && remote?.override === "open" && (
          <span className="text-[var(--md-sys-color-on-primary-container)]/80">
            선생님이 직접 열어뒀어요
          </span>
        )}
        {!openNow && (
          <span className="text-[var(--md-sys-color-on-surface-variant)]">
            {remote?.override === "closed"
              ? "선생님이 직접 닫아뒀어요"
              : next
                ? `다음 개장: ${fmtKst(next, {
                    month: "long",
                    day: "numeric",
                    weekday: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}`
                : "예정된 개장이 없어요 — 아래 커스텀 시간표에 시간을 추가해 주세요"}
          </span>
        )}
      </div>

      {/* 실제 장 시간 안내 — 교사가 아무 설정도 안 해도 이 시간 안에서는 기본으로 거래된다. */}
      <div className="flex items-start gap-2 rounded-2xl bg-[var(--md-sys-color-secondary-container)] px-4 py-3 text-xs leading-relaxed text-[var(--md-sys-color-on-secondary-container)]">
        <Icon name="info" size={16} className="mt-0.5 shrink-0" />
        <span>
          실제 증시처럼 <b>평일 오전 9시 ~ 오후 3시 30분</b>에만 거래할 수 있어요. 이 시간 밖에서는
          아래 설정과 상관없이 항상 닫혀 있어요. 커스텀 시간표나 즉시 전환은 이 안에서만 더 좁게
          적용돼요.
        </span>
      </div>

      {/* 즉시 전환 — 시간표보다 우선(단, 실제 장 시간 밖에서는 열기가 동작하지 않음). 누르면 바로 적용. */}
      <div className="flex flex-col gap-2 rounded-2xl bg-[var(--md-sys-color-surface-container)] px-4 py-3">
        <div className="flex items-center gap-1.5">
          <Icon name="bolt" size={18} className="text-[var(--md-sys-color-primary)]" />
          <p className="text-sm font-bold">즉시 전환</p>
          <span className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
            실제 장 시간 안에서만 · 누르면 바로 적용
          </span>
        </div>
        <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="거래 즉시 전환">
          {(
            [
              { v: "open", icon: "play_circle", label: "지금 열기" },
              { v: "closed", icon: "block", label: "지금 닫기" },
              { v: null, icon: "calendar_month", label: "시간표대로" },
            ] as { v: TradingOverride; icon: string; label: string }[]
          ).map((o) => {
            const active = (remote?.override ?? null) === o.v;
            return (
              <button
                key={String(o.v)}
                onClick={() => applyOverride(o.v)}
                disabled={switching}
                aria-pressed={active}
                className={`inline-flex w-full items-center justify-center gap-1 rounded-xl px-2 py-2.5 text-[13px] font-bold transition disabled:opacity-50 ${
                  active
                    ? "bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)] shadow-[var(--md-sys-elevation-1)]"
                    : "bg-[var(--md-sys-color-surface-container-highest)] text-[var(--md-sys-color-on-surface-variant)] hover:brightness-95"
                }`}
              >
                <Icon name={o.icon} size={16} className="shrink-0" />
                {o.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 커스텀 시간표 on/off */}
      <div className="flex items-center gap-3 rounded-2xl bg-[var(--md-sys-color-surface-container)] px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold">커스텀 시간표 사용</p>
          <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
            꺼짐: 실제 장 시간(평일 9시~3시 30분)에 자동으로 거래돼요.
            켜짐: 아래에서 정한 시간에만(실제 장 시간 안에서) 열려요.
          </p>
        </div>
        <Switch checked={enabled} onChange={setEnabled} label={enabled ? "켜짐" : "꺼짐"} />
      </div>

      {/* 매주 반복 */}
      <section className="flex flex-col gap-3 rounded-2xl bg-[var(--md-sys-color-surface-container)] p-4">
        <div className="flex items-center gap-1.5">
          <Icon name="event_repeat" size={18} className="text-[var(--md-sys-color-primary)]" />
          <p className="text-sm font-bold">매주 반복 개장</p>
          <span className="rounded-full bg-[var(--md-sys-color-surface-container-highest)] px-2 py-0.5 text-[11px] font-semibold text-[var(--md-sys-color-on-surface-variant)]">
            KST 기준
          </span>
        </div>

        {/* 요일 칩 */}
        <div className="flex flex-wrap gap-1.5">
          {DAYS.map((d, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setWDay(i)}
              className={`h-9 w-9 rounded-full text-sm font-bold transition ${
                wDay === i
                  ? "bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)]"
                  : "border border-[var(--md-sys-color-outline)] text-[var(--md-sys-color-on-surface-variant)] hover:bg-black/5"
              } ${i === 0 ? "text-[var(--md-sys-color-error)]" : ""}`}
            >
              {d}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs font-bold text-[var(--md-sys-color-on-surface-variant)]">
            시작
            <input
              type="time"
              value={wStart}
              onChange={(e) => setWStart(e.target.value)}
              className="m3-field !h-11 !w-32"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-bold text-[var(--md-sys-color-on-surface-variant)]">
            종료
            <input
              type="time"
              value={wEnd}
              onChange={(e) => setWEnd(e.target.value)}
              className="m3-field !h-11 !w-32"
            />
          </label>
          <Button
            variant="tonal"
            size="md"
            icon="add"
            disabled={!weeklyValid}
            onClick={addWeekly}
          >
            슬롯 추가
          </Button>
        </div>
        {!weeklyValid && (
          <p className="text-xs text-[var(--md-sys-color-error)]">
            종료 시간이 시작보다 늦어야 해요.
          </p>
        )}

        {weekly.length === 0 ? (
          <p className="py-2 text-center text-xs text-[var(--md-sys-color-on-surface-variant)]">
            매주 반복하는 개장 시간이 없어요.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {weekly.map((w, i) => (
              <li
                key={`${w.day}-${w.start}-${w.end}-${i}`}
                className="flex items-center gap-2.5 rounded-xl bg-[var(--md-sys-color-surface-container-high)] px-3 py-2 text-sm"
              >
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-extrabold ${
                    w.day === 0
                      ? "bg-[var(--md-sys-color-error-container)] text-[var(--md-sys-color-on-error-container)]"
                      : "bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)]"
                  }`}
                >
                  {DAYS[w.day]}
                </span>
                <span className="flex-1 font-semibold tabular-nums">
                  {w.start} ~ {w.end}
                </span>
                <button
                  type="button"
                  onClick={() => setWeekly((prev) => prev.filter((_, j) => j !== i))}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--md-sys-color-on-surface-variant)] hover:bg-black/5"
                  aria-label="삭제"
                >
                  <Icon name="close" size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 일회성 개장 */}
      <section className="flex flex-col gap-3 rounded-2xl bg-[var(--md-sys-color-surface-container)] p-4">
        <div className="flex items-center gap-1.5">
          <Icon name="today" size={18} className="text-[var(--md-sys-color-primary)]" />
          <p className="text-sm font-bold">일회성 개장</p>
          <span className="rounded-full bg-[var(--md-sys-color-surface-container-highest)] px-2 py-0.5 text-[11px] font-semibold text-[var(--md-sys-color-on-surface-variant)]">
            KST 기준
          </span>
          {hasPast && (
            <button
              type="button"
              onClick={() => setSessions((prev) => prev.filter((s) => s.end >= now))}
              className="ml-auto inline-flex items-center gap-1 rounded-full border border-[var(--md-sys-color-outline)] px-2.5 py-1 text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)] hover:bg-black/5"
            >
              <Icon name="cleaning_services" size={14} />
              지난 개장 정리
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs font-bold text-[var(--md-sys-color-on-surface-variant)]">
            날짜
            <input
              type="date"
              value={sDate}
              onChange={(e) => setSDate(e.target.value)}
              className="m3-field !h-11 !w-44"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-bold text-[var(--md-sys-color-on-surface-variant)]">
            시작
            <input
              type="time"
              value={sStart}
              onChange={(e) => setSStart(e.target.value)}
              className="m3-field !h-11 !w-28"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-bold text-[var(--md-sys-color-on-surface-variant)]">
            종료
            <input
              type="time"
              value={sEnd}
              onChange={(e) => setSEnd(e.target.value)}
              className="m3-field !h-11 !w-28"
            />
          </label>
          <Button
            variant="tonal"
            size="md"
            icon="add"
            disabled={!sessionValid}
            onClick={addSession}
          >
            개장 추가
          </Button>
        </div>
        {!sessionValid && (
          <p className="text-xs text-[var(--md-sys-color-error)]">
            날짜·시간을 확인하세요. 종료가 시작보다 늦어야 해요.
          </p>
        )}

        {sessions.length === 0 ? (
          <p className="py-2 text-center text-xs text-[var(--md-sys-color-on-surface-variant)]">
            예정된 일회성 개장이 없어요.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {sessions.map((s, i) => {
              const past = s.end < now;
              const live = now >= s.start && now <= s.end;
              return (
                <li
                  key={`${s.start}-${s.end}-${i}`}
                  className={`flex items-center gap-2.5 rounded-xl bg-[var(--md-sys-color-surface-container-high)] px-3 py-2 text-sm ${
                    past ? "opacity-45" : ""
                  }`}
                >
                  {live && (
                    <span className="shrink-0 rounded-full bg-[var(--md-sys-color-primary)] px-2 py-0.5 text-[10px] font-extrabold text-[var(--md-sys-color-on-primary)]">
                      진행중
                    </span>
                  )}
                  <span className="flex-1 font-semibold tabular-nums">
                    {fmtKst(s.start, {
                      month: "numeric",
                      day: "numeric",
                      weekday: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    {" ~ "}
                    {fmtKst(s.end, { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSessions((prev) => prev.filter((_, j) => j !== i))}
                    className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--md-sys-color-on-surface-variant)] hover:bg-black/5"
                    aria-label="삭제"
                  >
                    <Icon name="close" size={16} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* 저장 */}
      <div className="sticky bottom-0 -mx-5 -mb-5 flex items-center gap-3 border-t border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-high)] px-5 py-3">
        {saveMsg && (
          <span
            className={`flex items-center gap-1 text-sm font-semibold ${
              saveMsg.ok
                ? "text-[var(--md-sys-color-primary)]"
                : "text-[var(--md-sys-color-error)]"
            }`}
          >
            <Icon name={saveMsg.ok ? "check_circle" : "error"} size={16} />
            {saveMsg.text}
          </span>
        )}
        {dirty && !saveMsg && (
          <span className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
            저장하지 않은 변경이 있어요
          </span>
        )}
        <Button
          variant="filled"
          size="md"
          icon="save"
          className="ml-auto"
          disabled={saving || !dirty}
          onClick={save}
        >
          {saving ? "저장 중…" : "저장"}
        </Button>
      </div>
    </div>
  );
}

// ---------- 탭 2: 학급 투자 현황 ----------
/** 순위표 한 줄 — 공용 손익 계산(TradingStats)에 지갑 잔액만 얹는다. */
type BoardRow = TradingStats & { balance: number };

function BoardTab({ cid, members }: { cid: string; members: Member[] }) {
  const { positions, prices, trades, wallets } = useClassTrading(cid);
  // 기간 조회 — 실현손익(판 거래)에만 적용된다. 평가손익은 지금 이 순간 기준.
  const [period, setPeriod] = useState<PeriodKey>("week");
  const periodLabel = TRADE_PERIODS.find((p) => p.key === period)?.label ?? "";
  // 학생 한 명을 눌러 계좌 현황(잔고·실현손익)을 열어볼 때의 대상 uid.
  const [openUid, setOpenUid] = useState<string | null>(null);

  // 매도 실현손익을 한 번만 채워 순위표·학생 상세가 같은 목록을 쓰게 한다.
  const filled = useMemo(() => fillTradePnl(trades), [trades]);

  const rows: BoardRow[] = useMemo(() => {
    const from = periodStartMs(period);
    const stats = new Map(classTradingStats(positions, prices, filled, { from }).map(row => [row.uid, row]));
    return members.filter(m => m.role === "student").map(m => ({
      ...(stats.get(m.uid) ?? tradingStats(m.uid, null, prices, [], { from })),
      balance: wallets[m.uid]?.balance ?? 0,
    }));
  }, [positions, prices, filled, wallets, period, members]);

  const openRow = openUid ? rows.find((r) => r.uid === openUid) ?? null : null;
  const openTrades = useMemo(
    () => (openUid ? filled.filter((t) => t.uid === openUid) : []),
    [filled, openUid]
  );

  // 학급 전체 요약 — 투자에 참여한 학생 수·총 평가액·총 보유 만보(참여 학생 기준)·
  // 전체 손익·고른 기간의 실현손익 합계.
  const summary = useMemo(() => {
    const totalValue = rows.reduce((s, r) => s + r.value, 0);
    const totalBalance = rows.reduce((s, r) => s + r.balance, 0);
    const totalPnl = rows.reduce((s, r) => s + r.totalPnl, 0);
    const periodRealized = rows.reduce((s, r) => s + r.period.realized, 0);
    return {
      participants: rows.filter(r => r.tradeCount > 0 || r.holdings.length > 0).length,
      totalValue,
      totalBalance,
      totalPnl,
      periodRealized,
    };
  }, [rows]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-5">
      {/* 시세 기준 시각 */}
      <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
        {prices?.updatedAt
          ? `시세 기준 ${fmtKst(prices.updatedAt, {
              hour: "2-digit",
              minute: "2-digit",
            })} · 평가액/손익은 만보`
          : "시세를 불러오는 중… 손익은 만보 기준"}
      </p>

      {/* 학급 전체 요약 — 참여 인원·총 평가액·총 보유 만보·전체 손익을 한눈에 */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <div className="rounded-2xl bg-[var(--md-sys-color-surface-container)] px-3 py-3 text-center">
          <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
            투자 참여
          </p>
          <p className="mt-0.5 text-base font-extrabold">
            {summary.participants}명
          </p>
        </div>
        <div className="rounded-2xl bg-[var(--md-sys-color-surface-container)] px-3 py-3 text-center">
          <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
            총 주식 평가액
          </p>
          <p className="mt-0.5 text-base font-extrabold">
            {Math.round(summary.totalValue).toLocaleString()}
          </p>
        </div>
        <div className="rounded-2xl bg-[var(--md-sys-color-surface-container)] px-3 py-3 text-center">
          <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
            현금 합계
          </p>
          <p className="mt-0.5 text-base font-extrabold">
            {Math.round(summary.totalBalance).toLocaleString()}
          </p>
        </div>
        <div className="rounded-2xl bg-[var(--md-sys-color-surface-container)] px-3 py-3 text-center">
          <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
            전체 손익
          </p>
          <p
            className="mt-0.5 text-base font-extrabold"
            style={pnlStyle(summary.totalPnl)}
          >
            {signed(summary.totalPnl)}
          </p>
        </div>
        <div className="rounded-2xl bg-[var(--md-sys-color-surface-container)] px-3 py-3 text-center">
          <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
            {periodLabel} 실현손익
          </p>
          <p
            className="mt-0.5 text-base font-extrabold"
            style={pnlStyle(summary.periodRealized)}
          >
            {signed(summary.periodRealized)}
          </p>
        </div>
      </div>

      {/* 기간 선택 — 실현손익(판 거래)에만 적용된다. */}
      <div className="flex flex-wrap items-center gap-1.5">
        <p className="mr-1 text-sm font-bold">기간</p>
        {TRADE_PERIODS.map((p) => {
          const on = p.key === period;
          return (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              aria-pressed={on}
              className={`rounded-full px-3 py-1 text-xs font-bold transition ${
                on
                  ? "bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)]"
                  : "border border-[var(--md-sys-color-outline)] text-[var(--md-sys-color-on-surface-variant)]"
              }`}
            >
              {p.label}
            </button>
          );
        })}
        <span className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
          실현손익·매매 횟수에만 적용 (평가손익은 지금 이 순간 기준)
        </span>
      </div>

      <StudentTradingTable
        rows={rows.map(r => ({ ...r, name: resolveStudentName(members, r.uid) }))}
        periodLabel={periodLabel}
        onSelect={setOpenUid}
      />

      {/* 최근 체결 */}
      <section>
        <p className="mb-2.5 flex items-center gap-1.5 text-sm font-bold">
          <Icon name="receipt_long" size={18} className="text-[var(--md-sys-color-primary)]" />
          최근 체결
        </p>
        {trades.length === 0 ? (
          <p className="rounded-2xl bg-[var(--md-sys-color-surface-container)] py-8 text-center text-sm text-[var(--md-sys-color-on-surface-variant)]">
            아직 체결된 거래가 없어요.
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {trades.slice(0, 30).map((t) => {
              const s = stockBySymbol(t.symbol);
              const buy = t.side === "buy";
              return (
                <li
                  key={t.id}
                  className="flex items-center gap-2.5 rounded-xl bg-[var(--md-sys-color-surface-container)] px-3 py-2 text-sm"
                >
                  <span className="w-11 shrink-0 text-[11px] tabular-nums text-[var(--md-sys-color-on-surface-variant)]">
                    {t.at
                      ? fmtKst(t.at, { hour: "2-digit", minute: "2-digit" })
                      : "-"}
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-extrabold ${
                      buy
                        ? "bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)]"
                        : "bg-[var(--md-sys-color-error-container)] text-[var(--md-sys-color-on-error-container)]"
                    }`}
                  >
                    {buy ? "매수" : "매도"}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-bold">
                      {resolveStudentName(members, t.uid, t.name)}
                    </span>
                    <span className="text-[var(--md-sys-color-on-surface-variant)]">
                      {" · "}
                    </span>
                    <Icon
                      name={s?.icon ?? "candlestick_chart"}
                      size={14}
                      className="mr-1 inline-block align-middle"
                      style={{ color: s?.color }}
                    />
                    <span className="font-semibold">{s?.alias ?? t.symbol}</span>
                    {s?.real && (
                      <span className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
                        {" "}
                        ({s.real})
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-right text-xs tabular-nums">
                    <span className="font-bold">{t.qty}주</span>
                    <span className="text-[var(--md-sys-color-on-surface-variant)]">
                      {" @ "}
                      {t.mbPrice.toLocaleString()}만보
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* 학생 계좌 현황 — 순위표 행을 누르면 열린다. 학생 본인이 /trade 에서 보는 것과
          같은 AccountSheet(잔고·실현손익)라 교사와 학생이 같은 숫자를 본다. */}
      {openRow && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-[rgba(0,0,0,0.4)] p-4"
          onClick={() => setOpenUid(null)}
        >
          <div
            className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-[var(--md-sys-color-surface-container-high)] shadow-[var(--md-sys-elevation-3)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 border-b border-[var(--md-sys-color-outline-variant)] px-5 py-4">
              <Icon
                name="account_balance_wallet"
                size={20}
                className="text-[var(--md-sys-color-primary)]"
              />
              <p className="min-w-0 flex-1 truncate text-base font-semibold">
                {resolveStudentName(members, openRow.uid)}
                <span className="ml-1.5 text-sm font-normal text-[var(--md-sys-color-on-surface-variant)]">
                  계좌 현황
                </span>
              </p>
              <button
                onClick={() => setOpenUid(null)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-highest)]"
              >
                <Icon name="close" size={20} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              <AccountSheet
                stats={openRow}
                trades={openTrades}
                balance={openRow.balance}
                period={period}
                onPeriodChange={setPeriod}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
