"use client";

// 우리 반 핀 총합 분석 — 감정 분포·장소 유형·핫스팟 군집·You can 표현 빈도 + 자동 인사이트.
// 모든 계산은 클라이언트(룰베이스) — 함수 호출 없음.
import { useMemo } from "react";
import {
  CATEGORY_BY_ID,
  EMOTIONS,
  EMOTION_BY_ID,
  PLACE_TYPES,
  PLACE_TYPE_BY_ID,
  type TownPin,
} from "./types";

// ─────────────────── 집계 ───────────────────

function haversineM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) *
      Math.cos((bLat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export type PinCluster = {
  lat: number;
  lng: number;
  pins: TownPin[];
  /** 군집 안에서 가장 많이 쓰인 장소 이름(대표 이름) */
  name: string;
  /** 군집의 대표 감정 id */
  emotion: string;
  /** 군집 내 부정 감정 비율(0~1) */
  negRatio: number;
};

/** 반경 radiusM 그리디 군집 — 수십~수백 개 핀이면 충분 */
export function clusterPins(pins: TownPin[], radiusM = 250): PinCluster[] {
  const clusters: { lat: number; lng: number; pins: TownPin[] }[] = [];
  for (const pin of pins) {
    const hit = clusters.find(
      (c) => haversineM(c.lat, c.lng, pin.lat, pin.lng) <= radiusM
    );
    if (hit) {
      hit.pins.push(pin);
      hit.lat = hit.pins.reduce((s, p) => s + p.lat, 0) / hit.pins.length;
      hit.lng = hit.pins.reduce((s, p) => s + p.lng, 0) / hit.pins.length;
    } else {
      clusters.push({ lat: pin.lat, lng: pin.lng, pins: [pin] });
    }
  }
  return clusters
    .map((c) => {
      const name = topKey(c.pins.map((p) => p.placeName.trim()).filter(Boolean)) ?? "이름 없는 곳";
      const emotion = topKey(c.pins.map((p) => p.emotion)) ?? "happy";
      const neg = c.pins.filter(
        (p) => (EMOTION_BY_ID[p.emotion]?.valence ?? 0) < 0
      ).length;
      return { ...c, name, emotion, negRatio: c.pins.length ? neg / c.pins.length : 0 };
    })
    .sort((a, b) => b.pins.length - a.pins.length);
}

function topKey(keys: string[]): string | null {
  const m = new Map<string, number>();
  for (const k of keys) m.set(k, (m.get(k) ?? 0) + 1);
  let best: string | null = null;
  let bestN = 0;
  for (const [k, n] of m) {
    if (n > bestN) {
      best = k;
      bestN = n;
    }
  }
  return best;
}

const STOPWORDS = new Set([
  "a", "an", "the", "to", "in", "on", "at", "of", "and", "or", "with",
  "you", "can", "there", "is", "are", "it", "i", "my", "your", "we",
]);

function canDoWords(pins: TownPin[]): { word: string; count: number }[] {
  const m = new Map<string, number>();
  for (const p of pins) {
    // 짧은 구는 통째로(예: "ride a bike"), 너무 길면 단어로 쪼갠다
    const phrase = p.canDo.trim().toLowerCase();
    if (!phrase) continue;
    const words = phrase.split(/\s+/);
    if (words.length <= 4) {
      m.set(phrase, (m.get(phrase) ?? 0) + 1);
    } else {
      for (const w of words) {
        const clean = w.replace(/[^a-z가-힣0-9]/g, "");
        if (clean.length < 2 || STOPWORDS.has(clean)) continue;
        m.set(clean, (m.get(clean) ?? 0) + 1);
      }
    }
  }
  return Array.from(m, ([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}

export type TownStats = {
  pinCount: number;
  studentCount: number;
  visitedCount: number;
  wishCount: number;
  emotionCounts: { id: string; count: number }[];
  posRatio: number;
  negRatio: number;
  placeCounts: { id: string; count: number }[];
  clusters: PinCluster[];
  words: { word: string; count: number }[];
  /** placeType id → 대표 감정 id (핀 2개 이상인 유형만) */
  placeEmotion: { placeId: string; emotionId: string; count: number }[];
  insights: string[];
};

export function computeStats(pins: TownPin[]): TownStats {
  const emotionCounts = EMOTIONS.map((e) => ({
    id: e.id,
    count: pins.filter((p) => p.emotion === e.id).length,
  })).filter((x) => x.count > 0);
  emotionCounts.sort((a, b) => b.count - a.count);

  const pos = pins.filter((p) => (EMOTION_BY_ID[p.emotion]?.valence ?? 0) > 0).length;
  const neg = pins.filter((p) => (EMOTION_BY_ID[p.emotion]?.valence ?? 0) < 0).length;

  const placeCounts = PLACE_TYPES.map((t) => ({
    id: t.id,
    count: pins.filter((p) => p.placeType === t.id).length,
  })).filter((x) => x.count > 0);
  placeCounts.sort((a, b) => b.count - a.count);

  const clusters = clusterPins(pins);
  const words = canDoWords(pins);

  const placeEmotion = placeCounts
    .filter((pc) => pc.count >= 2)
    .map((pc) => ({
      placeId: pc.id,
      emotionId:
        topKey(pins.filter((p) => p.placeType === pc.id).map((p) => p.emotion)) ?? "happy",
      count: pc.count,
    }))
    .slice(0, 4);

  const visitedCount = pins.filter((p) => p.category !== "wish").length;
  const wishCount = pins.filter((p) => p.category === "wish").length;

  // 자동 인사이트 문장
  const insights: string[] = [];
  const n = pins.length;
  if (n > 0) {
    if (wishCount > 0 || visitedCount > 0) {
      insights.push(
        `✅ 가봤던 곳 ${visitedCount}개 · ✨ 가고 싶은 곳 ${wishCount}개예요.`
      );
    }
    // 우리 반이 가장 가 보고 싶은 곳(같은 이름이 2번 이상 찍힌 경우)
    const wishTop = topKey(
      pins
        .filter((p) => p.category === "wish")
        .map((p) => p.placeName.trim())
        .filter(Boolean)
    );
    if (wishTop) {
      const cnt = pins.filter(
        (p) => p.category === "wish" && p.placeName.trim() === wishTop
      ).length;
      if (cnt >= 2) {
        insights.push(`✨ 우리가 가장 가 보고 싶은 곳은 ‘${wishTop}’ (${cnt}명)이에요.`);
      }
    }
    const topCluster = clusters[0];
    if (topCluster && topCluster.pins.length >= 2) {
      const e = EMOTION_BY_ID[topCluster.emotion];
      insights.push(
        `🔥 가장 많이 모인 곳은 ‘${topCluster.name}’ 일대예요 — 핀 ${topCluster.pins.length}개, 대표 감정 ${e?.emoji ?? ""} ${e?.ko ?? ""}.`
      );
    }
    const topE = emotionCounts[0];
    if (topE) {
      const e = EMOTION_BY_ID[topE.id];
      insights.push(
        `💛 우리 반 대표 감정은 ${e?.emoji ?? ""} ‘${e?.ko ?? ""}’ — ${topE.count}개 (${Math.round((topE.count / n) * 100)}%).`
      );
    }
    insights.push(
      `🌈 긍정 감정 ${Math.round((pos / n) * 100)}% · 부정 감정 ${Math.round((neg / n) * 100)}%예요.`
    );
    const topP = placeCounts[0];
    if (topP) {
      const t = PLACE_TYPE_BY_ID[topP.id];
      insights.push(
        `${t?.emoji ?? ""} 가장 인기 있는 장소 유형은 ‘${t?.ko ?? ""}’ (${topP.count}개)예요.`
      );
    }
    for (const pe of placeEmotion.slice(0, 2)) {
      const t = PLACE_TYPE_BY_ID[pe.placeId];
      const e = EMOTION_BY_ID[pe.emotionId];
      if (t && e) insights.push(`${t.emoji} ${t.ko}에서는 주로 ${e.emoji} ‘${e.ko}’를 느꼈어요.`);
    }
    const negCluster = clusters.find((c) => c.pins.length >= 2 && c.negRatio >= 0.5);
    if (negCluster) {
      insights.push(
        `🚨 ‘${negCluster.name}’ 근처에는 부정 감정이 모여 있어요 — 왜 그런지 함께 이야기해 볼까요?`
      );
    }
  }

  return {
    pinCount: n,
    studentCount: new Set(pins.map((p) => p.creatorUid)).size,
    visitedCount,
    wishCount,
    emotionCounts,
    posRatio: n ? pos / n : 0,
    negRatio: n ? neg / n : 0,
    placeCounts,
    clusters,
    words,
    placeEmotion,
    insights,
  };
}

// ─────────────────── 렌더 ───────────────────

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-[var(--md-sys-color-surface-container)] p-4">
      <h3 className="mb-2.5 text-sm font-bold text-[var(--md-sys-color-on-surface)]">{title}</h3>
      {children}
    </section>
  );
}

export function InsightsPanel({ pins }: { pins: TownPin[] }) {
  const stats = useMemo(() => computeStats(pins), [pins]);

  if (stats.pinCount === 0) {
    return (
      <p className="rounded-2xl bg-[var(--md-sys-color-surface-container)] p-6 text-center text-sm text-[var(--md-sys-color-on-surface-variant)]">
        아직 분석할 핀이 없어요. 친구들이 핀을 꽂으면 여기에 우리 반 인사이트가 나타나요.
      </p>
    );
  }

  const maxE = stats.emotionCounts[0]?.count ?? 1;
  const maxW = stats.words[0]?.count ?? 1;

  return (
    <div className="flex flex-col gap-3">
      {/* 자동 인사이트 */}
      <Card title="✨ 우리 반 지도 인사이트">
        <ul className="flex flex-col gap-1.5">
          {stats.insights.map((t, i) => (
            <li
              key={i}
              className="rounded-xl bg-[var(--md-sys-color-surface-container-high)] px-3 py-2 text-[13px] font-medium leading-relaxed text-[var(--md-sys-color-on-surface)]"
            >
              {t}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-right text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
          참여 {stats.studentCount}명 · 핀 {stats.pinCount}개 ·{" "}
          <b style={{ color: CATEGORY_BY_ID.visited.color }}>가봤던 곳 {stats.visitedCount}</b> ·{" "}
          <b style={{ color: CATEGORY_BY_ID.wish.color }}>가고 싶은 곳 {stats.wishCount}</b>
        </p>
      </Card>

      {/* 감정 분포 */}
      <Card title="감정 분포">
        <div className="flex flex-col gap-1.5">
          {stats.emotionCounts.map(({ id, count }) => {
            const e = EMOTION_BY_ID[id];
            return (
              <div key={id} className="flex items-center gap-2">
                <span className="emoji-noto w-7 text-center text-lg leading-none">
                  {e?.emoji}
                </span>
                <span className="w-14 shrink-0 text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)]">
                  {e?.ko}
                </span>
                <div className="h-4 flex-1 overflow-hidden rounded-full bg-[var(--md-sys-color-surface-container-highest)]">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.max((count / maxE) * 100, 6)}%`,
                      background: e?.color ?? "#999",
                    }}
                  />
                </div>
                <span className="w-8 text-right text-xs font-bold text-[var(--md-sys-color-on-surface)]">
                  {count}
                </span>
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex h-3 overflow-hidden rounded-full">
          <div className="bg-[#43A047]" style={{ width: `${stats.posRatio * 100}%` }} />
          <div className="bg-[#B0BEC5]" style={{ width: `${(1 - stats.posRatio - stats.negRatio) * 100}%` }} />
          <div className="bg-[#3949AB]" style={{ width: `${stats.negRatio * 100}%` }} />
        </div>
        <p className="mt-1 text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
          긍정 {Math.round(stats.posRatio * 100)}% · 중립{" "}
          {Math.round((1 - stats.posRatio - stats.negRatio) * 100)}% · 부정{" "}
          {Math.round(stats.negRatio * 100)}%
        </p>
      </Card>

      {/* 핫스팟 군집 */}
      {stats.clusters.filter((c) => c.pins.length >= 2).length > 0 && (
        <Card title="📍 핫스팟 (250m 군집)">
          <ol className="flex flex-col gap-1.5">
            {stats.clusters
              .filter((c) => c.pins.length >= 2)
              .slice(0, 5)
              .map((c, i) => {
                const e = EMOTION_BY_ID[c.emotion];
                return (
                  <li
                    key={i}
                    className="flex items-center gap-2 rounded-xl bg-[var(--md-sys-color-surface-container-high)] px-3 py-2"
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--md-sys-color-primary)] text-xs font-bold text-[var(--md-sys-color-on-primary)]">
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-[var(--md-sys-color-on-surface)]">
                      {c.name} 일대
                    </span>
                    <span className="emoji-noto text-base leading-none">{e?.emoji}</span>
                    <span className="shrink-0 text-xs font-bold text-[var(--md-sys-color-on-surface-variant)]">
                      핀 {c.pins.length}개
                    </span>
                  </li>
                );
              })}
          </ol>
        </Card>
      )}

      {/* 장소 유형 */}
      <Card title="장소 유형">
        <div className="flex flex-wrap gap-1.5">
          {stats.placeCounts.map(({ id, count }) => {
            const t = PLACE_TYPE_BY_ID[id];
            return (
              <span
                key={id}
                className="flex items-center gap-1 rounded-full bg-[var(--md-sys-color-surface-container-high)] px-2.5 py-1 text-xs font-semibold text-[var(--md-sys-color-on-surface)]"
              >
                <span className="emoji-noto text-sm leading-none">{t?.emoji}</span>
                {t?.ko} <b className="text-[var(--md-sys-color-primary)]">{count}</b>
              </span>
            );
          })}
        </div>
        {stats.placeEmotion.length > 0 && (
          <div className="mt-2.5 flex flex-col gap-1">
            {stats.placeEmotion.map((pe) => {
              const t = PLACE_TYPE_BY_ID[pe.placeId];
              const e = EMOTION_BY_ID[pe.emotionId];
              return (
                <p
                  key={pe.placeId}
                  className="text-xs text-[var(--md-sys-color-on-surface-variant)]"
                >
                  <span className="emoji-noto">{t?.emoji}</span> {t?.ko} →{" "}
                  <span className="emoji-noto">{e?.emoji}</span>{" "}
                  <b className="text-[var(--md-sys-color-on-surface)]">{e?.ko}</b>가 대표 감정
                </p>
              );
            })}
          </div>
        )}
      </Card>

      {/* You can ___ 표현 */}
      {stats.words.length > 0 && (
        <Card title="우리 동네에서 할 수 있는 일 (You can ___ there.)">
          <div className="flex flex-wrap items-center gap-1.5">
            {stats.words.map(({ word, count }) => (
              <span
                key={word}
                className="rounded-full bg-[var(--md-sys-color-secondary-container)] px-3 py-1 font-semibold text-[var(--md-sys-color-on-secondary-container)]"
                style={{ fontSize: `${Math.min(12 + (count / maxW) * 8, 20)}px` }}
              >
                {word} <span className="opacity-60">{count}</span>
              </span>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
