"use client";

/**
 * 기능 & 효과 마법사 — 학생 선택 + 효과/배지/잠금/발표/공지 제어.
 *
 * 원래 /class-admin 안의 모달 전용 컴포넌트였는데, 수업 중에 차시 화면을 떠나지
 * 않고 쓰려면 차시 페이지에도 필요해서 공용으로 분리했다.
 *   - EffectWizardModal  : /class-admin 의 기존 모달 (동작·모양 그대로)
 *   - EffectWizardDrawer : /lesson 오른쪽 가장자리 탭에서 꺼내는 사이드바.
 *                          학생·XP·라이브 상태를 스스로 구독해 cid 만 주면 된다.
 * 두 껍데기가 같은 EffectWizardBody 를 쓰므로 기능이 갈라지지 않는다.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { GlassCard } from "@/components/Glass";
import { Icon } from "@/components/Icon";
import { BadgeChip } from "@/components/BadgeChip";
import { useNameMask } from "@/components/NameMask";
import { listMembers, type Member } from "@/lib/classes";
import { watchXp, xpLevel } from "@/lib/xp";
import { awardBadge, getBadge, BADGE_CATALOG } from "@/lib/badges";
import {
  clearPresenter,
  NOTICE_COLORS,
  sendEffect,
  setPresenter,
  startLock,
  startNotice,
  startPresent,
  stopLock,
  stopNotice,
  stopPresent,
  watchLock,
  watchNotice,
  watchPresent,
  type ActivityLock,
  type NoticeState,
  type PresentState,
} from "@/lib/live";

function Avatar({ m, size = 44 }: { m: Member; size?: number }) {
  if (m.photoURL) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={m.photoURL}
        alt=""
        width={size}
        height={size}
        className="rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className="flex items-center justify-center rounded-full bg-[var(--md-sys-color-primary-container)] font-bold text-[var(--md-sys-color-on-primary-container)]"
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {(m.displayName || "?").slice(0, 1)}
    </span>
  );
}

/* ═══════════════ 본문(껍데기 공용) ═══════════════ */
function EffectWizardBody({
  narrow,
  students,
  selected,
  xpMap,
  nameOf,
  lock,
  present,
  notice,
  onSendEffect,
  onStartLock,
  onStopLock,
  onSetPresenter,
  onClearPresenter,
  onStartPresent,
  onStopPresent,
  onStartNotice,
  onStopNotice,
  onAwardBadge,
}: {
  students: Member[];
  selected: Set<string>;
  xpMap: Record<string, number>;
  nameOf: Record<string, string>;
  lock: ActivityLock | null;
  present: PresentState | null;
  notice: NoticeState | null;
  /** 사이드바처럼 좁은 컨테이너에서는 1열로 쌓는다 */
  narrow?: boolean;
  onSendEffect: (
    uids: string[],
    effect: {
      kind: "mission" | "level" | "present";
      title: string;
      subtitle?: string;
    }
  ) => Promise<void>;
  onStartLock: (ms: number) => Promise<void>;
  onStopLock: () => Promise<void>;
  onSetPresenter: (uid: string, name: string, cheer: string) => Promise<void>;
  onClearPresenter: () => Promise<void>;
  onStartPresent: () => Promise<void>;
  onStopPresent: () => Promise<void>;
  onStartNotice: (text: string, color: string) => Promise<void>;
  onStopNotice: () => Promise<void>;
  onAwardBadge: (uids: string[], badgeId: string) => Promise<void>;
}) {
  const { mask } = useNameMask();
  const [sel, setSel] = useState<Set<string>>(new Set(selected));
  const uids = students.filter((s) => sel.has(s.uid)).map((s) => s.uid);
  const single = uids.length === 1 ? uids[0] : null;

  const [kind, setKind] = useState<
    "mission" | "level" | "present" | "badge"
  >("mission");
  const [selBadge, setSelBadge] = useState<string>(BADGE_CATALOG[0]?.id ?? "");
  const presentActive = !!present?.active;
  const presenterUid = present?.uid ?? null;

  // 발표 모드: 기본 효과가 켜진 상태에서만 카드 클릭으로 발표자(무지개) 토글
  async function togglePresenter(uid: string, name: string) {
    if (!presentActive) return;
    if (presenterUid === uid) await onClearPresenter();
    else await onSetPresenter(uid, name, msg.trim());
  }
  const [msg, setMsg] = useState("");
  const [sending, setSending] = useState(false);
  const [sentOk, setSentOk] = useState(false);

  // 잠금 타이머 입력
  const [min, setMin] = useState(1);
  const [sec, setSec] = useState(0);
  const [busyLock, setBusyLock] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // 공지 전광판 입력
  const noticeActive = !!notice?.active;
  const [noticeText, setNoticeText] = useState("");
  const [noticeColorId, setNoticeColorId] = useState(NOTICE_COLORS[0].id);
  const [busyNotice, setBusyNotice] = useState(false);
  const [noticeErr, setNoticeErr] = useState("");

  async function toggleNotice() {
    setBusyNotice(true);
    setNoticeErr("");
    try {
      if (noticeActive) await onStopNotice();
      else if (noticeText.trim())
        await onStartNotice(noticeText.trim(), noticeColorId);
    } catch (e) {
      setNoticeErr(e instanceof Error ? e.message : "공지 전송에 실패했습니다.");
    } finally {
      setBusyNotice(false);
    }
  }

  const lockActive = !!lock?.active && (lock.until == null || lock.until > now);
  useEffect(() => {
    if (!lockActive) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [lockActive]);

  function toggle(uid: string) {
    setSel((s) => {
      const n = new Set(s);
      if (n.has(uid)) n.delete(uid);
      else n.add(uid);
      return n;
    });
  }

  function buildEffect() {
    const name = single ? nameOf[single] : "";
    if (kind === "level") {
      return {
        kind: "level" as const,
        title: name ? `${name}님, 레벨업을 축하해요!` : "레벨업을 축하해요!",
        subtitle:
          msg.trim() ||
          (single ? `레벨 ${xpLevel(xpMap[single] ?? 0).level} 달성` : undefined),
      };
    }
    if (kind === "present") {
      return {
        kind: "present" as const,
        title: name ? `${name}님, 발표해봅시다!` : "발표해봅시다!",
        subtitle: msg.trim() || undefined,
      };
    }
    return {
      kind: "mission" as const,
      title: "미션 완료!",
      subtitle: msg.trim() || "참 잘했어요! 🎉",
    };
  }

  async function send() {
    if (uids.length === 0) return;
    setSending(true);
    try {
      await onSendEffect(uids, buildEffect());
      setSentOk(true);
      setTimeout(() => setSentOk(false), 1800);
    } finally {
      setSending(false);
    }
  }

  async function sendBadge() {
    if (uids.length === 0 || !selBadge) return;
    setSending(true);
    try {
      await onAwardBadge(uids, selBadge);
      setSentOk(true);
      setTimeout(() => setSentOk(false), 1800);
    } finally {
      setSending(false);
    }
  }

  const lockMs = (min * 60 + sec) * 1000;
  const remaining = lock?.until != null ? lock.until - now : null;
  function fmt(ms: number) {
    const s = Math.max(0, Math.ceil(ms / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  }

  async function toggleLock() {
    setBusyLock(true);
    try {
      if (lockActive) await onStopLock();
      else if (lockMs > 0) await onStartLock(lockMs);
    } finally {
      setBusyLock(false);
    }
  }

  return (
    <>
        {/* 본문: 좌 학생 / 우 컨트롤 */}
        <div
          className={
            narrow
              ? "flex min-h-0 flex-1 flex-col"
              : "grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[1fr_360px] lg:grid-cols-[1fr_400px]"
          }
        >
          {/* 좌측: 학생 선택 */}
          <div className={`flex min-h-0 flex-col border-b border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)] ${
              narrow ? "" : "md:border-b-0 md:border-r"
            }`}>
            <div className="flex items-center justify-between px-4 py-3">
              {kind === "present" ? (
                <span className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                  {presentActive ? (
                    <>
                      카드를 누르면 그 학생에게 <b>무지개 발표 화면</b> · 다시
                      누르면 해제
                    </>
                  ) : (
                    <>
                      먼저 <b>효과 적용</b>으로 전체에 발표 모드를 켜세요
                    </>
                  )}
                </span>
              ) : (
                <>
                  <span className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                    선택{" "}
                    <b className="text-[var(--md-sys-color-primary)]">
                      {uids.length}
                    </b>{" "}
                    / {students.length}
                  </span>
                  <div className="flex gap-1">
                    <button
                      onClick={() => setSel(new Set(students.map((s) => s.uid)))}
                      className="rounded-full px-2.5 py-1 text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)] transition hover:bg-black/5"
                    >
                      전체
                    </button>
                    <button
                      onClick={() => setSel(new Set())}
                      className="rounded-full px-2.5 py-1 text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)] transition hover:bg-black/5"
                    >
                      해제
                    </button>
                  </div>
                </>
              )}
            </div>
            {/* md:/lg: 는 컨테이너가 아니라 화면 전체 너비를 본다. 사이드바(420px)
                안에서도 데스크톱 규칙이 걸려 목록이 끝없이 늘어나고 컨트롤이 아래로
                밀려나므로, narrow 에서는 높이를 직접 묶는다. */}
            <div
              className={
                narrow
                  ? "max-h-[38vh] min-h-0 flex-none overflow-y-auto px-3 pb-3"
                  : "max-h-48 min-h-0 flex-1 overflow-y-auto px-3 pb-3 md:max-h-none"
              }
            >
              {students.length === 0 ? (
                <p className="px-2 py-6 text-center text-xs text-[var(--md-sys-color-on-surface-variant)]">
                  학생이 없습니다.
                </p>
              ) : (
                <div
                  className={
                    narrow
                      ? "grid grid-cols-3 gap-2"
                      : "grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5"
                  }
                >
                  {students.map((s) => {
                    const isPresent = kind === "present";
                    const presenting = isPresent && presenterUid === s.uid;
                    const on = isPresent ? presenting : sel.has(s.uid);
                    const disabled = isPresent && !presentActive;
                    const lv = xpLevel(xpMap[s.uid] ?? 0);
                    return (
                      <button
                        key={s.uid}
                        disabled={disabled}
                        onClick={() =>
                          isPresent
                            ? togglePresenter(s.uid, s.displayName)
                            : toggle(s.uid)
                        }
                        className={`relative flex flex-col items-center gap-1 overflow-hidden rounded-2xl border p-2.5 transition ${
                          on
                            ? "border-[var(--md-sys-color-primary)] bg-[var(--md-sys-color-primary-container)]"
                            : "border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] hover:border-[var(--md-sys-color-outline)]"
                        } ${disabled ? "cursor-not-allowed opacity-40" : ""}`}
                      >
                        {presenting && (
                          <span className="jam-present-bg pointer-events-none absolute inset-0" />
                        )}
                        {on && (
                          <span className="absolute right-1.5 top-1.5 z-10 flex h-4 w-4 items-center justify-center rounded-full bg-white text-[var(--md-sys-color-primary)] shadow">
                            <Icon name={isPresent ? "campaign" : "check"} size={11} />
                          </span>
                        )}
                        <span className="relative z-10">
                          <Avatar m={s} size={44} />
                        </span>
                        <span
                          className={`relative z-10 line-clamp-1 w-full text-center text-xs font-semibold ${
                            presenting
                              ? "text-white [text-shadow:0_1px_4px_rgba(0,0,0,0.4)]"
                              : ""
                          }`}
                        >
                          {mask(s.displayName)}
                        </span>
                        <span
                          className={`relative z-10 text-xs ${
                            presenting
                              ? "font-bold text-white [text-shadow:0_1px_4px_rgba(0,0,0,0.4)]"
                              : "text-[var(--md-sys-color-on-surface-variant)]"
                          }`}
                        >
                          {presenting ? "발표중" : `Lv.${lv.level}`}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* 우측: 컨트롤 */}
          <div
            className={`flex min-h-0 flex-1 flex-col overflow-y-auto ${
              narrow ? "gap-5 p-4" : "gap-6 p-5"
            }`}
          >
            {/* 효과 보내기 */}
            <section className="flex flex-col gap-3">
              <h3 className="flex items-center gap-1.5 text-sm font-bold">
                <Icon
                  name="celebration"
                  size={16}
                  className="text-[var(--md-sys-color-primary)]"
                />
                효과 보내기
                <span className="font-normal text-[var(--md-sys-color-on-surface-variant)]">
                  · 놓친 학생에게 다시
                </span>
              </h3>
              {kind === "present" ? (
                <p className="rounded-xl bg-[var(--md-sys-color-surface-container-high)] px-3 py-2.5 text-xs leading-relaxed text-[var(--md-sys-color-on-surface-variant)]">
                  ① <b>효과 적용</b>하면 전체 학생에게 기본 발표 효과가 적용돼요(모두
                  잠금). ② 왼쪽 학생 카드를 누르면 그 학생에게 무지개 발표 화면이
                  추가로 제공됩니다.
                </p>
              ) : uids.length === 0 ? (
                <p className="rounded-xl bg-[var(--md-sys-color-surface-container-high)] px-3 py-2.5 text-xs text-[var(--md-sys-color-on-surface-variant)]">
                  왼쪽에서 학생을 선택하세요.
                </p>
              ) : (
                <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                  대상{" "}
                  <b className="text-[var(--md-sys-color-primary)]">
                    {uids.length}
                  </b>
                  명
                  {single && nameOf[single] ? ` · ${mask(nameOf[single])}` : ""}
                </p>
              )}
              <div className="flex gap-1.5">
                {(
                  [
                    ["mission", "미션 완료", "flag"],
                    ["level", "레벨업", "trending_up"],
                    ["present", "발표하기", "campaign"],
                    ["badge", "배지 수여", "workspace_premium"],
                  ] as const
                ).map(([k, label, icon]) => (
                  <button
                    key={k}
                    onClick={() => setKind(k)}
                    className={`flex flex-1 items-center justify-center gap-1 whitespace-nowrap rounded-xl px-2 py-2 text-[13px] font-semibold transition ${
                      kind === k
                        ? "bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)]"
                        : "border border-[var(--md-sys-color-outline)] text-[var(--md-sys-color-on-surface-variant)]"
                    }`}
                  >
                    <Icon name={icon} size={16} />
                    {label}
                  </button>
                ))}
              </div>
              {kind !== "badge" && (
                <input
                  value={msg}
                  onChange={(e) => setMsg(e.target.value)}
                  placeholder={
                    kind === "present"
                      ? "응원 문구 (선택, 예: gogo!)"
                      : "문구 (선택, 예: 참 잘했어요!)"
                  }
                  className="m3-field"
                />
              )}
              {kind === "badge" ? (
                <>
                  <div
                    className={`grid gap-2 rounded-2xl bg-[var(--md-sys-color-surface-container-low)] p-3 ${
                      narrow ? "grid-cols-5" : "grid-cols-4"
                    }`}
                  >
                    {BADGE_CATALOG.map((b) => (
                      <BadgeChip
                        key={b.id}
                        badge={b}
                        size={44}
                        selected={selBadge === b.id}
                        onClick={() => setSelBadge(b.id)}
                      />
                    ))}
                  </div>
                  <button
                    onClick={sendBadge}
                    disabled={uids.length === 0 || !selBadge || sending}
                    className="inline-flex items-center justify-center gap-1.5 rounded-full bg-[var(--md-sys-color-primary)] px-4 py-2.5 text-sm font-bold text-[var(--md-sys-color-on-primary)] transition hover:brightness-105 disabled:opacity-40"
                  >
                    <Icon name={sentOk ? "check" : "workspace_premium"} size={16} />
                    {sentOk
                      ? "수여했어요!"
                      : sending
                        ? "수여 중…"
                        : `배지 수여${uids.length ? ` (${uids.length}명)` : ""}`}
                  </button>
                </>
              ) : kind === "present" ? (
                presentActive ? (
                  <div className="flex flex-col gap-2">
                    <p className="rounded-xl bg-[var(--md-sys-color-tertiary-container)] px-3 py-2 text-center text-xs font-semibold text-[var(--md-sys-color-on-tertiary-container)]">
                      {presenterUid
                        ? `${mask(nameOf[presenterUid] ?? "학생")}님이 발표중`
                        : "전체 발표 모드 적용 중 · 카드를 눌러 발표자 지정"}
                    </p>
                    <button
                      onClick={onStopPresent}
                      className="inline-flex items-center justify-center gap-1.5 rounded-full bg-[var(--md-sys-color-error-container)] px-4 py-2.5 text-sm font-bold text-[var(--md-sys-color-on-error-container)] transition hover:brightness-105"
                    >
                      <Icon name="stop_circle" size={18} />
                      발표 모드 종료
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={onStartPresent}
                    className="inline-flex items-center justify-center gap-1.5 rounded-full bg-[var(--md-sys-color-primary)] px-4 py-2.5 text-sm font-bold text-[var(--md-sys-color-on-primary)] transition hover:brightness-105"
                  >
                    <Icon name="campaign" size={18} />
                    효과 적용해서 보내기 (전체)
                  </button>
                )
              ) : (
                <button
                  onClick={send}
                  disabled={uids.length === 0 || sending}
                  className="inline-flex items-center justify-center gap-1.5 rounded-full bg-[var(--md-sys-color-primary)] px-4 py-2.5 text-sm font-bold text-[var(--md-sys-color-on-primary)] transition hover:brightness-105 disabled:opacity-40"
                >
                  <Icon name={sentOk ? "check" : "send"} size={16} />
                  {sentOk
                    ? "전달했어요!"
                    : sending
                      ? "보내는 중…"
                      : `효과 적용해서 보내기${uids.length ? ` (${uids.length}명)` : ""}`}
                </button>
              )}
            </section>

            <div className="h-px bg-[var(--md-sys-color-outline-variant)]" />

            {/* 활동 잠금 타이머 */}
            <section className="flex flex-col gap-3">
              <h3 className="flex items-center gap-1.5 text-sm font-bold">
                <Icon
                  name="hourglass_top"
                  size={16}
                  className="text-[var(--md-sys-color-primary)]"
                />
                활동 잠금 타이머
                <span className="font-normal text-[var(--md-sys-color-on-surface-variant)]">
                  · 생각/활동 시간
                </span>
              </h3>
              {lockActive ? (
                <div className="flex items-center justify-between rounded-xl bg-[var(--md-sys-color-tertiary-container)] px-4 py-3">
                  <span className="flex items-center gap-2 text-sm font-semibold text-[var(--md-sys-color-on-tertiary-container)]">
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--md-sys-color-tertiary)] opacity-75" />
                      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[var(--md-sys-color-tertiary)]" />
                    </span>
                    학생 활동 잠금 중
                  </span>
                  {remaining != null && (
                    <span className="font-mono text-lg font-black tabular-nums text-[var(--md-sys-color-on-tertiary-container)]">
                      {fmt(remaining)}
                    </span>
                  )}
                </div>
              ) : (
                <div className="flex items-end gap-2">
                  <label className="flex flex-col gap-1 text-xs text-[var(--md-sys-color-on-surface-variant)]">
                    분
                    <input
                      type="number"
                      min={0}
                      max={99}
                      value={min}
                      onChange={(e) =>
                        setMin(Math.max(0, Math.min(99, Number(e.target.value) || 0)))
                      }
                      className="m3-field w-20"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-[var(--md-sys-color-on-surface-variant)]">
                    초
                    <input
                      type="number"
                      min={0}
                      max={59}
                      value={sec}
                      onChange={(e) =>
                        setSec(Math.max(0, Math.min(59, Number(e.target.value) || 0)))
                      }
                      className="m3-field w-20"
                    />
                  </label>
                  <p className="pb-2 text-xs text-[var(--md-sys-color-on-surface-variant)]">
                    동안 활동 멈춤
                  </p>
                </div>
              )}
              <button
                onClick={toggleLock}
                disabled={busyLock || (!lockActive && lockMs <= 0)}
                className={`inline-flex items-center justify-center gap-1.5 rounded-full px-4 py-2.5 text-sm font-bold transition disabled:opacity-40 ${
                  lockActive
                    ? "bg-[var(--md-sys-color-error-container)] text-[var(--md-sys-color-on-error-container)] hover:brightness-105"
                    : "bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)] hover:brightness-105"
                }`}
              >
                <Icon name={lockActive ? "play_arrow" : "pause"} size={18} />
                {lockActive ? "잠금 해제 (활동 재개)" : "활동 잠금 시작"}
              </button>
              <p className="text-xs leading-relaxed text-[var(--md-sys-color-on-surface-variant)]">
                잠금을 켜면 학생 화면에 모래시계가 뜨고 모든 활동이 멈춰요. 설정한
                시간이 끝나거나 잠금을 해제하면 다시 활동할 수 있어요.
              </p>
            </section>

            <div className="h-px bg-[var(--md-sys-color-outline-variant)]" />

            {/* 공지 전광판 */}
            <section className="flex flex-col gap-3">
              <h3 className="flex items-center gap-1.5 text-sm font-bold">
                <Icon
                  name="campaign"
                  size={16}
                  className="text-[var(--md-sys-color-primary)]"
                />
                공지 전광판
                <span className="font-normal text-[var(--md-sys-color-on-surface-variant)]">
                  · 학생 헤더에 흐르는 공지
                </span>
              </h3>
              {noticeActive ? (
                <p className="flex items-center gap-2 rounded-xl bg-[var(--md-sys-color-tertiary-container)] px-3 py-2.5 text-xs font-semibold text-[var(--md-sys-color-on-tertiary-container)]">
                  <Icon name="notifications_active" size={15} />
                  <span className="truncate">송출 중 · {notice?.text}</span>
                </p>
              ) : (
                <>
                  <input
                    value={noticeText}
                    onChange={(e) => setNoticeText(e.target.value)}
                    placeholder="공지 내용 (예: 5분 뒤 발표 시작합니다)"
                    className="m3-field"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && noticeText.trim()) toggleNotice();
                    }}
                  />
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-[var(--md-sys-color-on-surface-variant)]">
                      색상
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {NOTICE_COLORS.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => setNoticeColorId(c.id)}
                          title={c.label}
                          aria-label={c.label}
                          className={`h-7 w-7 rounded-full transition ${
                            noticeColorId === c.id
                              ? "ring-2 ring-[var(--md-sys-color-on-surface)] ring-offset-2 ring-offset-[var(--md-sys-color-surface)]"
                              : "hover:scale-110"
                          }`}
                          style={{ backgroundColor: c.bg }}
                        />
                      ))}
                    </div>
                  </div>
                </>
              )}
              <button
                onClick={toggleNotice}
                disabled={busyNotice || (!noticeActive && !noticeText.trim())}
                className={`inline-flex items-center justify-center gap-1.5 rounded-full px-4 py-2.5 text-sm font-bold transition hover:brightness-105 disabled:opacity-40 ${
                  noticeActive
                    ? "bg-[var(--md-sys-color-error-container)] text-[var(--md-sys-color-on-error-container)]"
                    : "bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)]"
                }`}
              >
                <Icon name={noticeActive ? "stop_circle" : "play_arrow"} size={18} />
                {noticeActive ? "공지 종료" : "공지 시작"}
              </button>
              {noticeErr && (
                <p className="rounded-xl bg-[var(--md-sys-color-error-container)] px-3 py-2 text-xs text-[var(--md-sys-color-on-error-container)]">
                  {noticeErr}
                </p>
              )}
              <p className="text-xs leading-relaxed text-[var(--md-sys-color-on-surface-variant)]">
                시작을 누르면 종료할 때까지 학생 화면 상단에 공지가 좌우로
                흐르는 전광판처럼 표시돼요.
              </p>
            </section>
          </div>
        </div>
    </>
  );
}

/* ═══════════════ 공통 데이터/핸들러 훅 ═══════════════ */

/** 학급의 학생·XP·라이브 상태를 구독하고, 마법사가 쓸 핸들러를 만들어 준다. */
function useWizardWiring(cid: string, teacherUid: string) {
  const [members, setMembers] = useState<Member[]>([]);
  const [xpMap, setXpMap] = useState<Record<string, number>>({});
  const [lock, setLock] = useState<ActivityLock | null>(null);
  const [present, setPresent] = useState<PresentState | null>(null);
  const [notice, setNotice] = useState<NoticeState | null>(null);

  useEffect(() => {
    if (!cid) return;
    listMembers(cid).then(setMembers).catch(() => {});
    const offs = [
      watchXp(cid, setXpMap),
      watchLock(cid, setLock),
      watchPresent(cid, setPresent),
      watchNotice(cid, setNotice),
    ];
    return () => offs.forEach((off) => off());
  }, [cid]);

  const students = useMemo(
    () => members.filter((m) => m.role === "student"),
    [members]
  );
  const nameOf = useMemo(() => {
    const m: Record<string, string> = {};
    members.forEach((x) => (m[x.uid] = x.displayName));
    return m;
  }, [members]);

  const handlers = useMemo(
    () => ({
      onSendEffect: (
        uids: string[],
        effect: {
          kind: "mission" | "level" | "present";
          title: string;
          subtitle?: string;
        }
      ) =>
        Promise.all(
          uids.map((u) => sendEffect(cid, u, effect, teacherUid))
        ).then(() => {}),
      onStartLock: (ms: number) => startLock(cid, ms, teacherUid),
      onStopLock: () => stopLock(cid),
      onSetPresenter: (uid: string, name: string, cheer: string) =>
        setPresenter(cid, uid, name, cheer, teacherUid),
      onClearPresenter: () => clearPresenter(cid),
      onStartPresent: () => startPresent(cid, teacherUid),
      onStopPresent: () => stopPresent(cid),
      onStartNotice: (text: string, color: string) =>
        startNotice(cid, text, color, teacherUid),
      onStopNotice: () => stopNotice(cid),
      onAwardBadge: (uids: string[], badgeId: string) => {
        const b = getBadge(badgeId);
        return Promise.all(
          uids.map((u) =>
            awardBadge(cid, u, badgeId, teacherUid).then(() =>
              sendEffect(
                cid,
                u,
                {
                  kind: "badge",
                  title: `배지 획득: ${b?.label ?? "배지"}`,
                  subtitle: b?.desc,
                },
                teacherUid
              )
            )
          )
        ).then(() => {});
      },
    }),
    [cid, teacherUid]
  );

  return { students, xpMap, nameOf, lock, present, notice, handlers };
}

/* ═══════════════ 껍데기 1: 모달 (/class-admin) ═══════════════ */

export function EffectWizardModal({
  students,
  selected,
  xpMap,
  nameOf,
  lock,
  present,
  notice,
  onClose,
  ...handlers
}: Omit<Parameters<typeof EffectWizardBody>[0], "narrow"> & {
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--md-sys-color-scrim)]/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <GlassCard
        strong
        className="flex h-[90vh] max-h-[860px] min-h-[520px] w-full max-w-6xl animate-float-in flex-col overflow-hidden p-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--md-sys-color-outline-variant)] px-6 py-4">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <Icon
              name="auto_awesome"
              size={20}
              className="text-[var(--md-sys-color-primary)]"
            />
            기능 &amp; 효과 마법사
          </h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--md-sys-color-on-surface-variant)] transition hover:bg-black/5"
          >
            <Icon name="close" size={20} />
          </button>
        </div>
        <EffectWizardBody
          students={students}
          selected={selected}
          xpMap={xpMap}
          nameOf={nameOf}
          lock={lock}
          present={present}
          notice={notice}
          {...handlers}
        />
      </GlassCard>
    </div>
  );
}

/* ═══════════════ 껍데기 2: 사이드바 (/lesson) ═══════════════ */

/**
 * 오른쪽 가장자리 탭에서 꺼내는 효과 마법사.
 * cid·교사 uid 만 주면 학생/XP/라이브 상태를 스스로 구독한다.
 * 잠금·발표·공지가 켜져 있으면 탭에 점이 붙어 닫아둬도 상태를 알 수 있다.
 */
export function EffectWizardDrawer({
  cid,
  teacherUid,
}: {
  cid: string;
  teacherUid: string;
}) {
  const [open, setOpen] = useState(false);
  const { students, xpMap, nameOf, lock, present, notice, handlers } =
    useWizardWiring(cid, teacherUid);

  const liveOn =
    !!lock?.active || !!present?.active || !!notice?.active;

  // Esc 로 닫기
  const onKey = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") setOpen(false);
  }, []);
  useEffect(() => {
    if (!open) return;
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onKey]);

  return (
    <>
      {/* 오른쪽 가장자리 손잡이 */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title="기능 & 효과 마법사"
        className="fixed right-0 top-1/2 z-40 flex -translate-y-1/2 flex-col items-center gap-1.5 rounded-l-2xl bg-[var(--md-sys-color-primary)] py-4 pl-2.5 pr-2 text-[var(--md-sys-color-on-primary)] shadow-lg transition hover:pl-3.5"
      >
        {liveOn && (
          <span className="absolute left-1 top-1.5 flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
          </span>
        )}
        <Icon name={open ? "chevron_right" : "auto_awesome"} size={20} />
        <span className="text-[11px] font-bold [writing-mode:vertical-rl]">
          효과
        </span>
      </button>

      {/* 사이드바 */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-[var(--md-sys-color-scrim)]/30 backdrop-blur-[2px]"
          onClick={() => setOpen(false)}
        />
      )}
      <aside
        aria-hidden={!open}
        className={`fixed right-0 top-0 z-50 flex h-full w-full max-w-[420px] flex-col overflow-hidden border-l border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] shadow-2xl transition-transform duration-300 ${
          open ? "translate-x-0" : "pointer-events-none translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-[var(--md-sys-color-outline-variant)] px-4 py-3">
          <h2 className="flex items-center gap-2 text-base font-bold">
            <Icon
              name="auto_awesome"
              size={18}
              className="text-[var(--md-sys-color-primary)]"
            />
            효과 마법사
          </h2>
          <button
            onClick={() => setOpen(false)}
            aria-label="닫기"
            className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--md-sys-color-on-surface-variant)] transition hover:bg-black/5"
          >
            <Icon name="close" size={20} />
          </button>
        </div>
        <EffectWizardBody
          narrow
          students={students}
          selected={new Set<string>()}
          xpMap={xpMap}
          nameOf={nameOf}
          lock={lock}
          present={present}
          notice={notice}
          {...handlers}
        />
      </aside>
    </>
  );
}
