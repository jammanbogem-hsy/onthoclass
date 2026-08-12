"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { GlassCard } from "@/components/Glass";
import { TopBar } from "@/components/TopBar";
import { Icon } from "@/components/Icon";
import { BadgeChip } from "@/components/BadgeChip";
import { ClassThermometer } from "@/components/ClassThermometer";
import { getMyRole, listMembers, type Member } from "@/lib/classes";
import { watchQuests, watchXp, xpLevel, type Quest } from "@/lib/xp";
import { BADGE_CATALOG, watchAllBadges, type BadgeMap } from "@/lib/badges";
import { watchPraises, watchThermometer, type Praise } from "@/lib/praise";
import { resolveStudentName } from "@/lib/names";
import { TradingAdminModal } from "@/components/TradingAdminModal";
import {
  listLessons,
  listQuestions,
  listQuestionSubmissions,
} from "@/lib/lessons";

function Avatar({ m, size = 44 }: { m: Member; size?: number }) {
  if (m.photoURL) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={m.photoURL}
        alt=""
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

function StatCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: string;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <GlassCard className="flex flex-col items-center gap-1 p-4 text-center">
      <Icon name={icon} size={20} className="text-[var(--md-sys-color-primary)]" />
      <p className="text-2xl font-black tabular-nums">{value}</p>
      <p className="text-xs font-medium text-[var(--md-sys-color-on-surface-variant)]">
        {label}
      </p>
      {hint && <p className="text-[11px] text-black/35">{hint}</p>}
    </GlassCard>
  );
}

/** 칭찬 순위 카드(보낸/받은) — 상위 학생을 메달과 함께. 누르면 개별 상세를 연다. */
function PraiseRankCard({
  title,
  emoji,
  rows,
  metric,
  onPick,
}: {
  title: string;
  emoji: string;
  rows: { m: Member; praiseSent: number; praiseRecv: number }[];
  metric: "sent" | "recv";
  onPick: (uid: string) => void;
}) {
  return (
    <GlassCard className="p-4">
      <p className="mb-2.5 flex items-center gap-1.5 text-sm font-bold">
        <span aria-hidden>{emoji}</span> {title}
      </p>
      {rows.length === 0 ? (
        <p className="py-4 text-center text-xs text-black/40">아직 없어요.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {rows.map((r, i) => (
            <li key={r.m.uid}>
              <button
                onClick={() => onPick(r.m.uid)}
                className="flex w-full items-center gap-2.5 rounded-xl bg-[var(--md-sys-color-surface-container)] px-2.5 py-2 text-left transition hover:bg-[var(--md-sys-color-surface-container-high)]"
              >
                <span className="w-6 shrink-0 text-center">
                  {i < 3 ? (
                    <span className="text-base">{["🥇", "🥈", "🥉"][i]}</span>
                  ) : (
                    <span className="text-xs font-bold text-black/40">
                      {i + 1}
                    </span>
                  )}
                </span>
                <Avatar m={r.m} size={32} />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                  {r.m.displayName}
                </span>
                <span className="shrink-0 rounded-full bg-[var(--md-sys-color-primary-container)] px-2 py-0.5 text-xs font-bold text-[var(--md-sys-color-on-primary-container)]">
                  {metric === "sent" ? r.praiseSent : r.praiseRecv}회
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </GlassCard>
  );
}

function ClassDashboardInner() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const cid = params.get("id") || params.get("class");

  const [role, setRole] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [xpMap, setXpMap] = useState<Record<string, number>>({});
  const [quests, setQuests] = useState<Quest[]>([]);
  const [badges, setBadges] = useState<Record<string, BadgeMap>>({});
  const [praises, setPraises] = useState<Praise[]>([]);
  const [degree, setDegree] = useState(0);
  const [actTotal, setActTotal] = useState(0);
  const [actDone, setActDone] = useState<Record<string, number>>({});
  const [actLoading, setActLoading] = useState(true);
  const [selUid, setSelUid] = useState<string | null>(null);
  const [praiseTab, setPraiseTab] = useState<"recv" | "sent">("recv");
  const [showTrading, setShowTrading] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace("/");
  }, [user, loading, router]);

  useEffect(() => {
    if (!user || !cid) return;
    getMyRole(cid, user.uid).then(setRole);
    listMembers(cid).then(setMembers).catch(() => {});
    const offXp = watchXp(cid, setXpMap);
    const offQ = watchQuests(cid, setQuests);
    const offB = watchAllBadges(cid, setBadges);
    const offP = watchPraises(cid, setPraises);
    const offT = watchThermometer(cid, setDegree);
    return () => {
      offXp();
      offQ();
      offB();
      offP();
      offT();
    };
  }, [user, cid]);

  // 활동 제출 참여 — 차시→활동→제출 집계(1회)
  useEffect(() => {
    if (!cid) return;
    let alive = true;
    setActLoading(true);
    (async () => {
      const lessons = await listLessons(cid).catch(() => []);
      let total = 0;
      const per: Record<string, Set<string>> = {};
      for (const l of lessons) {
        const qs = await listQuestions(cid, l.id).catch(() => []);
        for (const q of qs) {
          if (q.kind === "link") continue;
          total++;
          const subs = await listQuestionSubmissions(cid, l.id, q.id).catch(
            () => []
          );
          for (const s of subs) {
            const submitted =
              !!s.submittedAt ||
              s.content.trim().length > 0 ||
              (s.surveyAnswers && Object.keys(s.surveyAnswers).length > 0) ||
              (s.understanding ?? 0) > 0;
            if (submitted) (per[s.uid] ??= new Set()).add(q.id);
          }
        }
      }
      if (!alive) return;
      const counts: Record<string, number> = {};
      Object.entries(per).forEach(([uid, set]) => (counts[uid] = set.size));
      setActTotal(total);
      setActDone(counts);
      setActLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [cid]);

  const students = useMemo(
    () => members.filter((m) => m.role === "student"),
    [members]
  );

  // 학생별 종합 지표
  type Row = {
    m: Member;
    xp: number;
    rank: number;
    level: number;
    badgeCount: number;
    missionsDone: number;
    praiseRecv: number;
    praiseSent: number;
    done: number;
  };
  const rows: Row[] = useMemo(() => {
    const built = students.map((m) => {
      const xp = xpMap[m.uid] ?? 0;
      return {
        m,
        xp,
        rank: 0,
        level: xpLevel(xp).level,
        badgeCount: Object.keys(badges[m.uid] ?? {}).length,
        missionsDone: quests.filter((q) => q.completions[m.uid]).length,
        praiseRecv: praises.filter(
          (p) => p.toUid === m.uid && p.status === "approved"
        ).length,
        praiseSent: praises.filter(
          (p) => p.fromUid === m.uid && p.status === "approved"
        ).length,
        done: actDone[m.uid] ?? 0,
      };
    });
    // XP 순위(배지 번호용)는 그대로 계산하고, 표시는 이름순으로 정렬한다.
    const rankOf = new Map(
      [...built].sort((a, b) => b.xp - a.xp).map((r, i) => [r.m.uid, i + 1])
    );
    return built
      .map((r) => ({ ...r, rank: rankOf.get(r.m.uid) ?? 0 }))
      .sort((a, b) =>
        (a.m.displayName || "").localeCompare(b.m.displayName || "", "ko")
      );
  }, [students, xpMap, badges, quests, praises, actDone]);

  // 학급 종합
  const n = students.length;
  const avgXp = n ? Math.round(rows.reduce((s, r) => s + r.xp, 0) / n) : 0;
  const totalBadges = rows.reduce((s, r) => s + r.badgeCount, 0);
  const totalPraise = praises.filter((p) => p.status === "approved").length;
  const totalMissionDone = rows.reduce((s, r) => s + r.missionsDone, 0);
  const partRate =
    n && actTotal
      ? Math.round(
          (rows.reduce((s, r) => s + r.done, 0) / (n * actTotal)) * 100
        )
      : 0;

  // 칭찬왕 — 칭찬을 많이 보낸/받은 학생 상위 5명(교사가 직접 칭찬·피드백하도록)
  const topSenders = useMemo(
    () =>
      [...rows]
        .filter((r) => r.praiseSent > 0)
        .sort((a, b) => b.praiseSent - a.praiseSent)
        .slice(0, 5),
    [rows]
  );
  const topReceivers = useMemo(
    () =>
      [...rows]
        .filter((r) => r.praiseRecv > 0)
        .sort((a, b) => b.praiseRecv - a.praiseRecv)
        .slice(0, 5),
    [rows]
  );

  if (loading || !user || !cid) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <div className="animate-pulse text-sm text-black/40">불러오는 중…</div>
      </main>
    );
  }
  if (role && role !== "teacher") {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <GlassCard className="p-10 text-center">
          <p className="font-semibold">교사만 접근할 수 있습니다.</p>
          <button
            className="mt-4 text-sm text-[var(--md-sys-color-primary)] underline"
            onClick={() => router.push(`/class/?id=${cid}`)}
          >
            학급으로 돌아가기
          </button>
        </GlassCard>
      </main>
    );
  }

  const sel = selUid ? rows.find((r) => r.m.uid === selUid) : null;

  return (
    <>
      <TopBar />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <button
          onClick={() => router.push(`/class/?id=${cid}`)}
          className="mb-3 inline-flex items-center gap-1 text-sm text-[var(--md-sys-color-on-surface-variant)] transition hover:text-[var(--md-sys-color-on-surface)]"
        >
          <Icon name="arrow_back" size={18} />
          학급
        </button>

        <div className="mb-5 flex flex-wrap items-center gap-3">
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight sm:text-3xl">
            <Icon
              name="insights"
              size={26}
              className="text-[var(--md-sys-color-primary)]"
            />
            학급 대시보드
          </h1>
          <button
            onClick={() => setShowTrading(true)}
            className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-[var(--md-sys-color-secondary-container)] px-4 py-2 text-sm font-bold text-[var(--md-sys-color-on-secondary-container)] transition hover:brightness-[0.97]"
          >
            <Icon name="candlestick_chart" size={18} />
            트레이딩 관리
          </button>
        </div>

        {/* 학급 종합 */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard icon="group" label="학생" value={`${n}명`} />
          <StatCard icon="bolt" label="평균 XP" value={avgXp.toLocaleString()} />
          <StatCard
            icon="flag"
            label="완료 미션"
            value={`${totalMissionDone}`}
            hint={`미션 ${quests.length}개`}
          />
          <StatCard icon="workspace_premium" label="획득 배지" value={`${totalBadges}`} />
          <StatCard icon="favorite" label="칭찬" value={`${totalPraise}`} />
          <StatCard
            icon="task_alt"
            label="활동 참여율"
            value={actLoading ? "…" : `${partRate}%`}
            hint={actLoading ? "집계 중" : `활동 ${actTotal}개`}
          />
        </div>

        <ClassThermometer degree={degree} />

        {/* 칭찬왕 — 많이 주고받은 학생을 교사가 알아보고 직접 칭찬·피드백.
            표시할 학생이 실제로 있을 때만(탈퇴/다른 반 발신 등으로 둘 다 비는 경우 숨김). */}
        {(topSenders.length > 0 || topReceivers.length > 0) && (
          <section className="mt-4">
            <h2 className="mb-3 flex flex-wrap items-center gap-2 text-lg font-bold">
              <Icon
                name="favorite"
                size={20}
                fill
                className="text-[var(--md-sys-color-primary)]"
              />
              칭찬왕
              <span className="text-sm font-normal text-black/40">
                많이 주고받은 친구를 한 번 칭찬해 주세요
              </span>
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <PraiseRankCard
                title="칭찬을 많이 보낸 친구"
                emoji="💌"
                rows={topSenders}
                metric="sent"
                onPick={setSelUid}
              />
              <PraiseRankCard
                title="칭찬을 많이 받은 친구"
                emoji="💛"
                rows={topReceivers}
                metric="recv"
                onPick={setSelUid}
              />
            </div>
          </section>
        )}

        {/* 학생 그리드 */}
        <h2 className="mb-3 mt-2 flex items-center gap-2 text-lg font-bold">
          <Icon
            name="groups"
            size={20}
            className="text-[var(--md-sys-color-primary)]"
          />
          학생별 현황
          <span className="text-sm font-normal text-black/40">
            카드를 누르면 개별 상세
          </span>
        </h2>
        {rows.length === 0 ? (
          <GlassCard className="p-8 text-center text-sm text-black/45">
            학생이 없습니다.
          </GlassCard>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((r) => (
              <button
                key={r.m.uid}
                onClick={() => setSelUid(r.m.uid)}
                className="flex items-center gap-3 rounded-2xl bg-[var(--md-sys-color-surface-container)] p-3 text-left transition hover:bg-[var(--md-sys-color-surface-container-high)]"
              >
                <span className="relative shrink-0">
                  <Avatar m={r.m} size={48} />
                  <span className="absolute -bottom-1 -right-1 rounded-full bg-[var(--md-sys-color-primary)] px-1.5 text-[11px] font-bold text-white">
                    {r.rank}
                  </span>
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{r.m.displayName}</p>
                  <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                    Lv.{r.level} · {r.xp.toLocaleString()} XP
                  </p>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-black/55">
                    <span>🎖 배지 {r.badgeCount}</span>
                    <span>🚩 미션 {r.missionsDone}</span>
                    <span>💛 칭찬 {r.praiseRecv}</span>
                    <span>
                      ✍ 참여 {r.done}/{actTotal}
                    </span>
                  </div>
                </div>
                <Icon
                  name="chevron_right"
                  size={20}
                  className="shrink-0 text-black/30"
                />
              </button>
            ))}
          </div>
        )}
      </main>

      {/* 개별 학생 상세 */}
      {sel && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-[rgba(0,0,0,0.32)] p-4"
          onClick={() => setSelUid(null)}
        >
          <div
            className="flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl bg-[var(--md-sys-color-surface-container-high)] shadow-[var(--md-sys-elevation-3)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 border-b border-[var(--md-sys-color-outline-variant)] px-5 py-4">
              <Avatar m={sel.m} size={44} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-lg font-bold">{sel.m.displayName}</p>
                <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                  Lv.{sel.level} · {sel.xp.toLocaleString()} XP
                </p>
              </div>
              <button
                onClick={() => setSelUid(null)}
                className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-highest)]"
              >
                <Icon name="close" size={20} />
              </button>
            </div>

            <div className="flex flex-col gap-5 overflow-y-auto p-5">
              {/* 요약 지표 */}
              <div className="grid grid-cols-4 gap-2 text-center">
                {[
                  ["미션", `${sel.missionsDone}`],
                  ["배지", `${sel.badgeCount}`],
                  ["받은 칭찬", `${sel.praiseRecv}`],
                  ["활동", `${sel.done}/${actTotal}`],
                ].map(([l, v]) => (
                  <div
                    key={l}
                    className="rounded-xl bg-[var(--md-sys-color-surface-container)] py-2"
                  >
                    <p className="text-lg font-black tabular-nums">{v}</p>
                    <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
                      {l}
                    </p>
                  </div>
                ))}
              </div>

              {/* 배지 */}
              <div>
                <p className="mb-2 text-sm font-bold">
                  배지{" "}
                  <span className="font-normal text-black/40">
                    {sel.badgeCount} / {BADGE_CATALOG.length}
                  </span>
                </p>
                <div className="flex flex-wrap gap-3">
                  {BADGE_CATALOG.map((b) => (
                    <BadgeChip
                      key={b.id}
                      badge={b}
                      size={44}
                      earned={!!badges[sel.m.uid]?.[b.id]}
                    />
                  ))}
                </div>
              </div>

              {/* 미션 */}
              <div>
                <p className="mb-2 text-sm font-bold">완료 미션</p>
                {(() => {
                  const done = quests.filter((q) => q.completions[sel.m.uid]);
                  return done.length === 0 ? (
                    <p className="text-xs text-black/40">완료한 미션이 없어요.</p>
                  ) : (
                    <ul className="flex flex-col gap-1.5">
                      {done.map((q) => (
                        <li
                          key={q.id}
                          className="flex items-center justify-between rounded-xl bg-[var(--md-sys-color-surface-container)] px-3 py-2 text-sm"
                        >
                          <span className="truncate">{q.title}</span>
                          <span className="shrink-0 rounded-full bg-[var(--md-sys-color-primary-container)] px-2 py-0.5 text-xs font-bold text-[var(--md-sys-color-on-primary-container)]">
                            +{q.xp} XP
                          </span>
                        </li>
                      ))}
                    </ul>
                  );
                })()}
              </div>

              {/* 칭찬 — 탭을 누르면 상세 목록 펼침 */}
              <div>
                <div className="grid grid-cols-2 gap-3 text-center">
                  <button
                    onClick={() => setPraiseTab("recv")}
                    className={`rounded-xl py-3 transition ${
                      praiseTab === "recv"
                        ? "bg-[var(--md-sys-color-tertiary-container)] text-[var(--md-sys-color-on-tertiary-container)] ring-2 ring-[var(--md-sys-color-tertiary)]"
                        : "bg-[var(--md-sys-color-surface-container)] hover:brightness-95"
                    }`}
                  >
                    <p className="text-xl font-black">{sel.praiseRecv}</p>
                    <p className="text-xs">받은 칭찬</p>
                  </button>
                  <button
                    onClick={() => setPraiseTab("sent")}
                    className={`rounded-xl py-3 transition ${
                      praiseTab === "sent"
                        ? "bg-[var(--md-sys-color-tertiary-container)] text-[var(--md-sys-color-on-tertiary-container)] ring-2 ring-[var(--md-sys-color-tertiary)]"
                        : "bg-[var(--md-sys-color-surface-container)] hover:brightness-95"
                    }`}
                  >
                    <p className="text-xl font-black">{sel.praiseSent}</p>
                    <p className="text-xs">보낸 칭찬</p>
                  </button>
                </div>
                {(() => {
                  const fmt = (t: number | null) =>
                    t
                      ? new Date(t).toLocaleDateString("ko-KR", {
                          month: "long",
                          day: "numeric",
                        })
                      : "";
                  const list =
                    praiseTab === "recv"
                      ? praises
                          .filter(
                            (p) =>
                              p.toUid === sel.m.uid && p.status === "approved"
                          )
                          .sort(
                            (a, b) =>
                              (b.decidedAt ?? b.createdAt ?? 0) -
                              (a.decidedAt ?? a.createdAt ?? 0)
                          )
                      : praises
                          .filter(
                            (p) =>
                              p.fromUid === sel.m.uid &&
                              p.status === "approved"
                          )
                          .sort(
                            (a, b) =>
                              (b.decidedAt ?? b.createdAt ?? 0) -
                              (a.decidedAt ?? a.createdAt ?? 0)
                          );
                  if (list.length === 0)
                    return (
                      <p className="mt-3 text-center text-xs text-black/40">
                        {praiseTab === "recv"
                          ? "아직 받은 칭찬이 없어요."
                          : "아직 보낸 칭찬이 없어요."}
                      </p>
                    );
                  return (
                    <ul className="mt-3 flex flex-col gap-2">
                      {list.map((p) => (
                        <li
                          key={p.id}
                          className="rounded-xl bg-[var(--md-sys-color-surface-container)] px-3 py-2.5"
                        >
                          <div className="flex items-center justify-between gap-2 text-xs font-semibold">
                            <span className="flex items-center gap-1 text-[var(--md-sys-color-primary)]">
                              <Icon name="favorite" size={13} />
                              {praiseTab === "recv"
                                ? `${resolveStudentName(members, p.fromUid, p.fromName, "친구")} → 나`
                                : `나 → ${resolveStudentName(members, p.toUid, p.toName, "친구")}`}
                            </span>
                            <span className="shrink-0 text-black/40">
                              {fmt(p.decidedAt ?? p.createdAt)}
                            </span>
                          </div>
                          {p.reason && (
                            <p className="mt-1 text-sm">“{p.reason}”</p>
                          )}
                        </li>
                      ))}
                    </ul>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>
      )}

      {showTrading && cid && (
        <TradingAdminModal
          cid={cid}
          members={members}
          onClose={() => setShowTrading(false)}
        />
      )}
    </>
  );
}

export default function ClassDashboardPage() {
  return (
    <Suspense fallback={null}>
      <ClassDashboardInner />
    </Suspense>
  );
}
