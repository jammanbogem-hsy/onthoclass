"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { GlassCard } from "@/components/Glass";
import { TopBar } from "@/components/TopBar";
import { Icon } from "@/components/Icon";
import { MissionCelebrate } from "@/components/MissionCelebrate";
import { useCelebrateQueue } from "@/components/useCelebrateQueue";
import { MissionMeta, useLessonMeta } from "@/components/MissionMeta";
import { getClass, getMyRole } from "@/lib/classes";
import {
  questLinkUrl,
  watchQuests,
  watchXp,
  watchXpLog,
  xpLevel,
  type Quest,
  type XpLogEntry,
} from "@/lib/xp";

function fmtDate(ms: number | null) {
  if (!ms) return "";
  const d = new Date(ms);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function LevelInner() {
  const { user, profile, loading } = useAuth();
  const router = useRouter();
  const avatarSrc = profile?.avatar || user?.photoURL || "";
  const params = useSearchParams();
  const cid = params.get("id") || params.get("class");

  const [className, setClassName] = useState("");
  const [xpMap, setXpMap] = useState<Record<string, number>>({});
  const [quests, setQuests] = useState<Quest[]>([]);
  const [log, setLog] = useState<XpLogEntry[]>([]);
  const { current: celebrate, enqueue: setCelebrate, done: celebrateDone } =
    useCelebrateQueue();
  const lastLevelRef = useRef<number | null>(null);
  const lessonMeta = useLessonMeta(cid);
  const nameRef = useRef("");
  nameRef.current = profile?.name || user?.displayName || "학생";
  const [info, setInfo] = useState<{
    left: number;
    right: number;
    top: number;
  } | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace("/");
  }, [user, loading, router]);

  useEffect(() => {
    if (!user || !cid) return;
    getClass(cid).then((r) => setClassName(r?.name ?? ""));
    getMyRole(cid, user.uid); // 멤버 확인용(권한은 규칙이 강제)
    // 미션 / 경험치 내역 — 실시간 구독 (교사 변경 즉시 반영)
    const offQuests = watchQuests(cid, (qs) => {
      const mine = qs.filter(
        (q) => q.targetType === "all" || q.assigneeUids.includes(user.uid)
      );
      setQuests(mine);
      // 아직 축하하지 않은 '완료된 미션'이 있으면 폭죽 축하
      const newly = mine.filter((q) => {
        const key = `mdone:${cid}:${q.id}`;
        if (q.completions[user.uid]) {
          if (localStorage.getItem(key)) return false;
          localStorage.setItem(key, "1");
          return true;
        }
        localStorage.removeItem(key);
        return false;
      });
      if (newly.length > 0) {
        const q = newly[newly.length - 1];
        setCelebrate({
          kind: "mission",
          title: "미션 완료!",
          subtitle: `${q.title} · +${q.xp} XP`,
        });
      }
    });
    const offLog = watchXpLog(cid, user.uid, setLog);
    const offXp = watchXp(cid, (m) => {
      setXpMap(m);
      const lv = xpLevel(m[user.uid] ?? 0).level;
      const key = `lvlup:${cid}:${user.uid}`;
      const prev = lastLevelRef.current;
      if (prev === null) {
        const ls = parseInt(localStorage.getItem(key) ?? "", 10);
        const base = isNaN(ls) ? lv : ls;
        lastLevelRef.current = lv;
        localStorage.setItem(key, String(lv));
        if (lv > base)
          setCelebrate({
            kind: "level",
            title: `${nameRef.current}님, 레벨업을 축하해요!`,
            subtitle: `레벨 ${lv} 달성`,
          });
      } else if (lv > prev) {
        lastLevelRef.current = lv;
        setCelebrate({
          kind: "level",
          title: `${nameRef.current}님, 레벨업을 축하해요!`,
          subtitle: `레벨 ${lv} 달성`,
        });
        localStorage.setItem(key, String(lv));
      } else if (lv < prev) {
        lastLevelRef.current = lv;
        localStorage.setItem(key, String(lv));
      }
    });
    return () => {
      offQuests();
      offLog();
      offXp();
    };
  }, [user, cid]);

  const myXp = user ? (xpMap[user.uid] ?? 0) : 0;
  const lv = xpLevel(myXp);

  if (loading || !user || !cid) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <div className="animate-pulse text-sm text-black/40">불러오는 중…</div>
      </main>
    );
  }

  const doneCount = quests.filter((q) => q.completions[user.uid]).length;

  return (
    <>
      <TopBar />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <button
          onClick={() => router.push(`/class/?id=${cid}`)}
          className="mb-3 inline-flex items-center gap-1 text-sm text-[var(--md-sys-color-on-surface-variant)] transition hover:text-[var(--md-sys-color-on-surface)]"
        >
          <Icon name="arrow_back" size={18} />
          {className || "학급"}
        </button>

        {/* 레벨 헤더 */}
        <GlassCard strong className="relative overflow-visible p-0">
          {/* 경험치 내역 보기 (!) — 우측 공간에 말풍선 */}
          <button
            onClick={(e) => {
              if (info) {
                setInfo(null);
                return;
              }
              const r = e.currentTarget.getBoundingClientRect();
              setInfo({ left: r.left, right: r.right, top: r.top });
            }}
            className="absolute right-3 top-3 z-20 flex h-8 w-8 items-center justify-center rounded-full bg-white/25 text-white backdrop-blur transition hover:bg-white/40"
            title="경험치 내역"
          >
            <Icon name="info" size={18} fill={!!info} />
          </button>
          <div className="jam-level-hero flex items-center gap-5 overflow-hidden rounded-3xl px-7 py-7 text-white">
            <span className="relative flex h-24 w-24 shrink-0 items-center justify-center">
              <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90">
                <circle
                  cx="50"
                  cy="50"
                  r="44"
                  fill="none"
                  stroke="rgba(255,255,255,0.25)"
                  strokeWidth="8"
                />
                <circle
                  cx="50"
                  cy="50"
                  r="44"
                  fill="none"
                  stroke="#fff"
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 44}`}
                  strokeDashoffset={`${2 * Math.PI * 44 * (1 - lv.pct)}`}
                />
              </svg>
              {/* 아바타 (게이지 안쪽) */}
              {avatarSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={avatarSrc}
                  src={avatarSrc}
                  alt=""
                  className="h-[72px] w-[72px] rounded-full object-cover"
                  style={{ animation: "jam-avatar-in .42s ease" }}
                />
              ) : (
                <span className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-white/25 text-2xl font-extrabold">
                  {(user.displayName || "?")[0]}
                </span>
              )}
              {/* 레벨 배지 */}
              <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full bg-white px-2 py-0.5 text-[11px] font-extrabold text-[var(--md-sys-color-primary)] shadow">
                Lv.{lv.level}
              </span>
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold opacity-90">
                {user.displayName || "나"}님의 성장
              </p>
              <p className="mt-0.5 text-3xl font-extrabold">
                {myXp.toLocaleString()} XP
              </p>
              <p className="mt-1 text-sm opacity-90">
                다음 레벨까지 {lv.remaining} XP
              </p>
            </div>
          </div>
        </GlassCard>

        {/* 통계 */}
        <div className="mt-4 grid grid-cols-3 gap-3">
          <Stat icon="military_tech" label="레벨" value={`Lv.${lv.level}`} />
          <Stat
            icon="task_alt"
            label="완료 미션"
            value={`${doneCount}/${quests.length}`}
          />
          <Stat
            icon="bolt"
            label="다음 레벨까지"
            value={`${lv.remaining} XP`}
          />
        </div>

        {/* 내 미션 */}
        <h2 className="mb-2 mt-8 flex items-center gap-2 text-lg font-bold">
          <Icon name="flag" size={20} className="text-[var(--md-sys-color-primary)]" />
          내 미션
        </h2>
        {quests.length === 0 ? (
          <GlassCard className="p-6 text-center text-sm text-black/45">
            받은 미션이 없습니다.
          </GlassCard>
        ) : (
          <div className="flex flex-col gap-2">
            {quests.slice(0, 3).map((q) => {
              const done = !!q.completions[user.uid];
              return (
                <GlassCard
                  key={q.id}
                  className="flex items-center gap-4 p-4"
                >
                  <Icon
                    name={done ? "task_alt" : "radio_button_unchecked"}
                    size={24}
                    className={`shrink-0 ${
                      done
                        ? "text-[var(--md-sys-color-primary)]"
                        : "text-black/25"
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-1.5 font-semibold">
                      {done && (
                        <span className="shrink-0 rounded-full bg-[var(--md-sys-color-primary)] px-2 py-0.5 text-[10px] font-extrabold text-white">
                          완료
                        </span>
                      )}
                      <span className="truncate">{q.title}</span>
                      <span className="shrink-0 rounded-full bg-[var(--md-sys-color-primary-container)] px-2 py-0.5 text-[11px] font-extrabold text-[var(--md-sys-color-on-primary-container)]">
                        +{q.xp} XP
                      </span>
                    </p>
                    {q.description && (
                      <p className="truncate text-xs text-black/50">
                        {q.description}
                      </p>
                    )}
                    <MissionMeta quest={q} meta={lessonMeta} />
                  </div>
                  {q.link && (
                    <button
                      onClick={() => router.push(questLinkUrl(cid, q.link!))}
                      className="flex shrink-0 items-center gap-1.5 rounded-2xl bg-[var(--md-sys-color-primary)] px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:brightness-105"
                    >
                      <Icon name="open_in_new" size={18} />
                      활동 열기
                    </button>
                  )}
                </GlassCard>
              );
            })}
            {quests.length > 3 && (
              <p className="px-1 pt-1 text-xs text-black/45">
                이전 미션 {quests.length - 3}개는 우측 상단{" "}
                <Icon name="info" size={13} className="-mt-0.5 inline" /> 경험치
                내역에서 함께 볼 수 있어요.
              </p>
            )}
          </div>
        )}

        <style>{`
          .jam-level-hero{
            background:linear-gradient(120deg,
              var(--md-sys-color-p-40),var(--md-sys-color-p-50) 55%,var(--md-sys-color-t-50));
          }
        `}</style>
      </main>

      {info &&
        (() => {
          const W = 300;
          const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
          const placeRight = info.right + 14 + W <= vw;
          const left = placeRight
            ? info.right + 14
            : Math.max(8, info.left - 14 - W);
          return (
            <div className="fixed inset-0 z-[55]" onClick={() => setInfo(null)}>
              <div
                className="absolute rounded-2xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] p-2 shadow-[var(--md-sys-elevation-3)]"
                style={{ left, top: Math.max(8, info.top - 6), width: W }}
                onClick={(e) => e.stopPropagation()}
              >
                <span
                  className={`absolute top-4 h-3 w-3 rotate-45 border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] ${
                    placeRight
                      ? "-left-1.5 border-b border-l"
                      : "-right-1.5 border-r border-t"
                  }`}
                />
                <p className="flex items-center gap-1.5 px-2 py-1 text-sm font-bold">
                  <Icon
                    name="history"
                    size={15}
                    className="text-[var(--md-sys-color-primary)]"
                  />
                  경험치 내역
                </p>
                <div className="max-h-80 overflow-y-auto">
                  {log.length === 0 ? (
                    <p className="py-6 text-center text-xs text-black/40">
                      아직 받은 경험치가 없습니다.
                    </p>
                  ) : (
                    <ul className="divide-y divide-[var(--md-sys-color-outline-variant)]">
                      {log.map((e) => (
                        <li
                          key={e.id}
                          className="flex items-center gap-2 px-2 py-2"
                        >
                          <span className="w-9 shrink-0 text-[11px] text-black/40">
                            {fmtDate(e.at)}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-xs">
                            {e.reason}
                          </span>
                          <span
                            className={`shrink-0 text-xs font-extrabold ${
                              e.amount >= 0
                                ? "text-[var(--md-sys-color-primary)]"
                                : "text-rose-500"
                            }`}
                          >
                            {e.amount >= 0 ? "+" : ""}
                            {e.amount}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* 이전 미션 */}
                {quests.length > 3 && (
                  <>
                    <p className="mt-2 flex items-center gap-1.5 border-t border-[var(--md-sys-color-outline-variant)] px-2 pt-2 text-sm font-bold">
                      <Icon
                        name="flag"
                        size={15}
                        className="text-[var(--md-sys-color-primary)]"
                      />
                      이전 미션
                    </p>
                    <ul className="divide-y divide-[var(--md-sys-color-outline-variant)]">
                      {quests.slice(3).map((q) => {
                        const done = !!q.completions[user.uid];
                        return (
                          <li
                            key={q.id}
                            className="flex items-center gap-2 px-2 py-2"
                          >
                            <Icon
                              name={
                                done ? "task_alt" : "radio_button_unchecked"
                              }
                              size={15}
                              className={
                                done
                                  ? "text-[var(--md-sys-color-primary)]"
                                  : "text-black/25"
                              }
                            />
                            <span className="min-w-0 flex-1 truncate text-xs">
                              {q.title}
                            </span>
                            <span className="shrink-0 text-xs font-extrabold text-[var(--md-sys-color-primary)]">
                              +{q.xp}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </>
                )}
              </div>
            </div>
          );
        })()}

      {celebrate && (
        <MissionCelebrate
          key={`${celebrate.kind}:${celebrate.title}:${celebrate.subtitle ?? ""}`}
          title={celebrate.title}
          subtitle={celebrate.subtitle}
          kicker={celebrate.kind === "level" ? "LEVEL UP" : "MISSION CLEAR"}
          lottieSrc={
            celebrate.kind === "level"
              ? "/Confetti.json"
              : "/mission-success.json"
          }
          onDone={celebrateDone}
        />
      )}
    </>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: string;
  label: string;
  value: string;
}) {
  return (
    <GlassCard className="flex flex-col items-center gap-1 p-4 text-center">
      <Icon name={icon} size={20} className="text-[var(--md-sys-color-primary)]" />
      <span className="text-lg font-extrabold">{value}</span>
      <span className="text-xs text-black/50">{label}</span>
    </GlassCard>
  );
}

export default function LevelPage() {
  return (
    <Suspense
      fallback={
        <main className="flex flex-1 items-center justify-center">
          <div className="animate-pulse text-sm text-black/40">불러오는 중…</div>
        </main>
      }
    >
      <LevelInner />
    </Suspense>
  );
}
