// 만보 트레이딩 — 학생이 만보로 실제 KRX 시세 기반 모의 주식투자를 한다.
// 시세 출처: 토스증권 Open API (Cloud Function 만 호출, 시세 조회 전용 — 실제 주문 API 는 절대 사용하지 않음).
// 가격 환산: mbPrice = floor(실제가격(KRW) / 2000) 만보. 소수점 버림.
// 매수/매도는 교사가 설정한 개장 시간(weekly/sessions)에만 가능 — 서버(executeTrade)가 재검증한다.
//
// 컬렉션:
//   tradingPrices/current            : { updatedAt, stocks: { [symbol]: { lastPrice, mbPrice, prevClose, changePct } } } — 함수만 쓰기, 로그인 사용자 읽기
//   tradingCandles/{symbol}          : { updatedAt, candles: [{ t, o, h, l, c, v }] } — 실제 KRW 일봉 최신순 최대 1년(약 250개), 함수만 쓰기
//   tradingMeta/token                : 토스 OAuth 토큰 캐시 — 클라이언트 접근 전면 금지(admin 전용)
//   tradingMeta/refresh              : 갱신 스로틀 메타 — 클라이언트 접근 전면 금지
//   classes/{cid}/trading/config     : TradingConfig — 교사 쓰기, 멤버 읽기
//   classes/{cid}/positions/{uid}    : Position — 함수만 쓰기, 본인+교사 읽기
//   classes/{cid}/trades/{tradeId}   : Trade — 함수만 쓰기, 멤버 읽기(교사 포함)
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  limit as qLimit,
  where,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { getDbClient, getFunctionsClient } from "@/lib/firebase";

// ---------- 종목 유니버스 (7종목 고정, 학생에겐 별칭만 노출) ----------
/** 기본 만보 환산 배율 — 대부분의 종목은 이 값을 쓴다(mbPrice = floor(krw / divisor)). */
export const MB_DIVISOR = 2000;

export type TradingStock = {
  /** KRX 종목코드 — 토스 API symbol */
  symbol: string;
  /** 학생에게 보여주는 별칭 (실제 종목명은 UI에 노출하지 않는다) */
  alias: string;
  /** 실제 종목명 — 서버/교사 참고용 */
  real: string;
  /** 카드/차트 포인트 컬러(M3 톤과 어울리는 딥톤) */
  color: string;
  /** 리스트 아이콘용 Material Symbols 이름 */
  icon: string;
  /** 어린이용 한 줄 회사 소개 — 별칭 세계관 유지(실제 회사명 노출 금지) */
  desc: string;
  /**
   * 이 종목의 만보 환산 배율 — 생략하면 MB_DIVISOR(2000). 저가주는 배율을 낮춰(예: 500)
   * 만보 단위 변동폭을 키운다(그대로 2000을 쓰면 하루 등락이 반올림에 묻혀 시세가 안 움직이는
   * 것처럼 보인다). 서버(refreshTradingPrices)가 동일 배율을 중복 정의해 캐시 계산에 쓴다.
   */
  mbDivisor?: number;
};

export const TRADING_STOCKS: readonly TradingStock[] = [
  { symbol: "005930", alias: "만보전자", real: "삼성전자", color: "#1a56b0", icon: "memory", desc: "스마트폰, TV, 반도체 칩을 만드는 우리나라 대표 전자 회사예요." },
  { symbol: "011200", alias: "만보해운", real: "HMM", color: "#0e7490", icon: "directions_boat", desc: "커다란 배로 전 세계 바다를 건너 물건을 실어 나르는 해운 회사예요.", mbDivisor: 500 },
  { symbol: "035420", alias: "잠이버", real: "NAVER", color: "#15803d", icon: "search", desc: "검색, 웹툰, 지도 서비스를 만드는 인터넷 회사예요." },
  { symbol: "005380", alias: "만보차", real: "현대차", color: "#334155", icon: "directions_car", desc: "자동차를 만들어 전 세계에 수출하는 자동차 회사예요." },
  { symbol: "042660", alias: "만보오션", real: "한화오션", color: "#075985", icon: "anchor", desc: "큰 배와 잠수함을 만드는 조선(배 만드는) 회사예요." },
  { symbol: "010950", alias: "J-Oil", real: "S-Oil", color: "#b45309", icon: "oil_barrel", desc: "자동차에 넣는 휘발유와 경유를 만드는 에너지 회사예요." },
  { symbol: "277810", alias: "JMB로보틱스", real: "레인보우로보틱스", color: "#7c3aed", icon: "smart_toy", desc: "사람처럼 걷고 일을 돕는 로봇을 연구하고 만드는 로봇 회사예요." },
  { symbol: "373220", alias: "만보에너지솔루션", real: "LG에너지솔루션", color: "#ca8a04", icon: "battery_charging_full", desc: "전기차에 들어가는 배터리를 만드는 에너지 회사예요." },
  { symbol: "012450", alias: "만보에어로스페이스", real: "한화에어로스페이스", color: "#dc2626", icon: "rocket_launch", desc: "비행기 엔진과 우주로 가는 로켓을 만드는 회사예요.", mbDivisor: 3000 },
  { symbol: "000250", alias: "만보당제약", real: "삼천당제약", color: "#db2777", icon: "medication", desc: "우리 몸을 건강하게 지켜주는 약을 만드는 제약 회사예요.", mbDivisor: 1500 },
] as const;

export const stockBySymbol = (symbol: string): TradingStock | undefined =>
  TRADING_STOCKS.find((s) => s.symbol === symbol);

/** 실제 KRW 가격 → 만보 가격 (소수점 버림). divisor 를 안 주면 종목 기본 배율(MB_DIVISOR)을 쓴다. */
export const toMbPrice = (krw: number, divisor: number = MB_DIVISOR): number =>
  Math.floor(krw / divisor);

// ---------- 거래 수수료 ----------
// 실제 증권사처럼 거래마다 작은 수수료를 매겨 "잦은 매매는 손해"를 체감하게 한다.
// 서버(executeTrade)가 동일 상수·계산식을 중복 정의해 최종 청구액을 검증한다.
export const TRADE_FEE_RATE = 0.005; // 0.5%
export const TRADE_FEE_MIN = 1; // 최소 수수료(만보) — 아주 저렴한 거래도 비용 개념을 느끼도록

/** 거래 수수료(만보) — 소수 반올림, 최소 1만보. subtotal(단가×수량) 기준. */
export function tradeFee(subtotal: number): number {
  if (subtotal <= 0) return 0;
  return Math.max(TRADE_FEE_MIN, Math.round(subtotal * TRADE_FEE_RATE));
}

/** 잔액으로 살 수 있는 최대 수량 — 수수료 포함 총액이 잔액을 넘지 않는 선. */
export function maxAffordableQty(balance: number, unit: number): number {
  if (unit <= 0 || balance <= 0) return 0;
  let qty = Math.floor(balance / unit); // 수수료 무시한 상한에서 시작
  while (qty > 0 && unit * qty + tradeFee(unit * qty) > balance) qty--;
  return Math.max(0, qty);
}

// ---------- 시세 ----------
export type StockQuote = {
  /** 실제 KRW 현재가 */
  lastPrice: number;
  /** 만보 환산가 = floor(lastPrice / 2000) */
  mbPrice: number;
  /** 전일 종가(KRW) — 등락 계산용 */
  prevClose: number;
  /** 전일 대비 등락률(%) */
  changePct: number;
};

export type TradingPrices = {
  updatedAt: number | null;
  stocks: Record<string, StockQuote>;
};

export function watchTradingPrices(cb: (p: TradingPrices | null) => void): () => void {
  return onSnapshot(
    doc(getDbClient(), "tradingPrices", "current"),
    (snap) => {
      if (!snap.exists()) return cb(null);
      const v = snap.data() as Record<string, unknown>;
      const ts = v.updatedAt as { toMillis?: () => number } | undefined;
      cb({
        updatedAt: ts?.toMillis ? ts.toMillis() : null,
        stocks: (v.stocks as Record<string, StockQuote>) ?? {},
      });
    },
    () => cb(null)
  );
}

// ---------- 시장 지수 (상단 요약 스트립) ----------
/** 서버가 캐시하는 지수 1종 — value 는 지수/환율 원값(만보 환산 없음), spark 는 오래된→최신 종가 최대 30개. */
export type MarketIndex = { value: number; changePct: number; spark: number[] };

export type TradingMarket = {
  updatedAt: number | null;
  indices: Record<string, MarketIndex>;
};

export type MarketIndexMeta = {
  /** tradingPrices/market 의 indices 키 */
  key: string;
  /** 학생 표시명 (실제 지수명 노출 금지) */
  name: string;
  /** 실제 지수명 — 교사/개발 참고용 */
  real: string;
  /** ? 툴팁 — 어린이 설명 */
  tip: string;
  /** 값 단위 표기 ("" | "원") */
  unit: string;
};

export const MARKET_INDICES: readonly MarketIndexMeta[] = [
  { key: "kospi", name: "잠스피", real: "코스피", tip: "우리나라의 큰 회사들 주식이 오르내리는 걸 숫자 하나로 보여줘요. 숫자가 오르면 많은 회사의 주식이 올랐다는 뜻이에요.", unit: "" },
  { key: "kosdaq", name: "잠스닥", real: "코스닥", tip: "우리나라의 새싹 회사, 기술 회사들이 모여 있는 시장이에요.", unit: "" },
  { key: "nasdaq", name: "미국 잠스닥", real: "나스닥", tip: "미국의 기술 회사들이 모여 있는 시장이에요. 밤사이 미국 시장이 오르내리면 우리 시장도 영향을 받아요.", unit: "" },
  { key: "dow", name: "잠우지수", real: "다우지수", tip: "미국의 아주 크고 오래된 회사 30곳의 주식을 모아 보여주는 지수예요.", unit: "" },
  { key: "nikkei", name: "잠케이", real: "니케이지수", tip: "일본의 큰 회사들 주식을 모아 보여주는 일본 대표 지수예요.", unit: "" },
  { key: "usdkrw", name: "달러 환율", real: "USD/KRW", tip: "미국 돈 1달러를 사려면 우리 돈이 얼마나 필요한지예요. 환율이 오르면 달러가 비싸진 거예요.", unit: "원" },
  { key: "vix", name: "두근두근 지수", real: "VIX(공포지수)", tip: "투자하는 사람들이 얼마나 불안해하는지 보여줘요. 숫자가 높으면 다들 두근두근(불안), 낮으면 차분하다는 뜻이에요.", unit: "" },
] as const;

export function watchTradingMarket(cb: (m: TradingMarket | null) => void): () => void {
  return onSnapshot(
    doc(getDbClient(), "tradingPrices", "market"),
    (snap) => {
      if (!snap.exists()) return cb(null);
      const v = snap.data() as Record<string, unknown>;
      const ts = v.updatedAt as { toMillis?: () => number } | undefined;
      cb({
        updatedAt: ts?.toMillis ? ts.toMillis() : null,
        indices: (v.indices as Record<string, MarketIndex>) ?? {},
      });
    },
    () => cb(null)
  );
}

/** 일봉 캔들 — t: epoch ms, o/h/l/c: 실제 KRW, v: 거래량. 만보 표시 시 toMbPrice() 로 변환. */
export type Candle = { t: number; o: number; h: number; l: number; c: number; v: number };

export async function fetchCandles(symbol: string): Promise<Candle[]> {
  const snap = await getDoc(doc(getDbClient(), "tradingCandles", symbol));
  if (!snap.exists()) return [];
  return ((snap.data().candles as Candle[]) ?? []).slice();
}

/**
 * 시세 갱신 요청 — 페이지 진입/새로고침 시 호출.
 * 서버가 전역 스로틀(60초)로 토스 API 호출을 묶는다. 갱신 없이도 성공 응답.
 */
export async function refreshTradingPrices(): Promise<{ ok: true; refreshed: boolean }> {
  const fn = httpsCallable<Record<string, never>, { ok: true; refreshed: boolean }>(
    getFunctionsClient(),
    "refreshTradingPrices"
  );
  const res = await fn({});
  return res.data;
}

// ---------- 개장 시간 (교사 설정) ----------
/** 매주 반복 개장 — day: 0(일)~6(토), start/end: "HH:mm" (KST) */
export type TradingWindow = { day: number; start: string; end: string };
/** 일회성 개장 — epoch ms */
export type TradingSession = { start: number; end: number };

/**
 * 교사 즉시 오버라이드 — 시간표보다 우선한다.
 *  "open"   : 시간표와 무관하게 지금 바로 거래 허용
 *  "closed" : 시간표와 무관하게 거래 중지(킬스위치)
 *  null     : 시간표대로(enabled + weekly/sessions)
 */
export type TradingOverride = "open" | "closed" | null;

export type TradingConfig = {
  enabled: boolean;
  weekly: TradingWindow[];
  sessions: TradingSession[];
  override: TradingOverride;
  updatedAt: number | null;
};

export const EMPTY_TRADING_CONFIG: TradingConfig = {
  enabled: false,
  weekly: [],
  sessions: [],
  override: null,
  updatedAt: null,
};

const KST_OFFSET_MS = 9 * 60 * 60 * 1000; // KST 고정(+09:00, DST 없음)

const hmToMin = (hm: string): number => {
  const [h, m] = hm.split(":").map((n) => parseInt(n, 10));
  return (h || 0) * 60 + (m || 0);
};

// ---------- 실제 KRX 장 운영시간 — 평일 09:00~15:30(KST) ----------
// 교사가 아무 설정도 하지 않아도 이 시간 밖에서는 항상 거래가 막힌다(실제 증시처럼).
// 서버(executeTrade)가 동일 상수·로직을 중복 정의해 최종 검증한다.
export const KRX_OPEN_MIN = 9 * 60; // 09:00
export const KRX_CLOSE_MIN = 15 * 60 + 30; // 15:30

/** 지금이 실제 KRX 정규장 시간(평일 09:00~15:30 KST)인가. */
export function isRealMarketOpen(now: number = Date.now()): boolean {
  const kst = new Date(now + KST_OFFSET_MS);
  const day = kst.getUTCDay();
  if (day === 0 || day === 6) return false; // 주말 휴장
  const min = kst.getUTCHours() * 60 + kst.getUTCMinutes();
  return min >= KRX_OPEN_MIN && min < KRX_CLOSE_MIN;
}

/** 다음으로 실제 장이 열리는 시각(평일 09:00, epoch ms) — now 이후 가장 가까운 시점. */
function nextRealMarketOpen(now: number): number | null {
  for (let d = 0; d < 8; d++) {
    const kstDayStart =
      Math.floor((now + KST_OFFSET_MS) / 86400000) * 86400000 - KST_OFFSET_MS + d * 86400000;
    const day = new Date(kstDayStart + KST_OFFSET_MS).getUTCDay();
    if (day === 0 || day === 6) continue; // 주말 제외
    const openAt = kstDayStart + KRX_OPEN_MIN * 60000;
    if (openAt > now) return openAt;
  }
  return null;
}

/**
 * 지금 개장 중인가 — 클라이언트 표시용. 서버(executeTrade)가 동일 로직으로 재검증한다.
 *
 * 우선순위:
 *  1) override:"closed"  → 무조건 닫힘(교사 킬스위치)
 *  2) 실제 KRX 장 시간 밖 → 무조건 닫힘(평일 09:00~15:30 만, 오버라이드도 못 이김 — 실제 증시처럼)
 *  3) override:"open"    → 실제 장 시간 안이면 즉시 열림(커스텀 시간표 무시)
 *  4) enabled:false(커스텀 시간표 미사용) → 실제 장 시간 그대로 적용(기본값, 설정 없이도 동작)
 *  5) enabled:true(커스텀 시간표 사용)   → 실제 장 시간 ∩ (매주 반복 또는 일회성 세션)일 때만 열림
 */
export function isTradingOpen(cfg: TradingConfig | null, now: number = Date.now()): boolean {
  const c = cfg ?? EMPTY_TRADING_CONFIG;
  if (c.override === "closed") return false;
  if (!isRealMarketOpen(now)) return false;
  if (c.override === "open") return true;
  if (!c.enabled) return true;
  if (c.sessions.some((s) => now >= s.start && now <= s.end)) return true;
  const kst = new Date(now + KST_OFFSET_MS);
  const day = kst.getUTCDay();
  const min = kst.getUTCHours() * 60 + kst.getUTCMinutes();
  return c.weekly.some(
    (w) => w.day === day && min >= hmToMin(w.start) && min < hmToMin(w.end)
  );
}

/** 다음 개장 시각(epoch ms) — 없으면 null. 폐장 안내 UI용. */
export function nextOpenAt(cfg: TradingConfig | null, now: number = Date.now()): number | null {
  const c = cfg ?? EMPTY_TRADING_CONFIG;
  if (c.override === "closed") return null;
  // 오버라이드로 즉시 열어뒀거나 커스텀 시간표를 안 쓰면 "다음 실제 장 시작"이 곧 다음 개장.
  if (c.override === "open" || !c.enabled) return nextRealMarketOpen(now);
  const candidates: number[] = [];
  for (const s of c.sessions) if (s.start > now) candidates.push(s.start);
  // 앞으로 14일 내 weekly 슬롯 탐색
  for (let d = 0; d < 14; d++) {
    const kstDayStart =
      Math.floor((now + KST_OFFSET_MS) / 86400000) * 86400000 - KST_OFFSET_MS + d * 86400000;
    const day = new Date(kstDayStart + KST_OFFSET_MS).getUTCDay();
    for (const w of c.weekly) {
      if (w.day !== day) continue;
      const t = kstDayStart + hmToMin(w.start) * 60000;
      if (t > now) candidates.push(t);
    }
  }
  return candidates.length ? Math.min(...candidates) : null;
}

export function watchTradingConfig(
  cid: string,
  cb: (cfg: TradingConfig | null) => void
): () => void {
  return onSnapshot(
    doc(getDbClient(), "classes", cid, "trading", "config"),
    (snap) => {
      if (!snap.exists()) return cb(null);
      const v = snap.data() as Record<string, unknown>;
      const ts = v.updatedAt as { toMillis?: () => number } | undefined;
      cb({
        enabled: (v.enabled as boolean) ?? false,
        weekly: (v.weekly as TradingWindow[]) ?? [],
        sessions: (v.sessions as TradingSession[]) ?? [],
        override:
          v.override === "open" || v.override === "closed" ? v.override : null,
        updatedAt: ts?.toMillis ? ts.toMillis() : null,
      });
    },
    () => cb(null)
  );
}

/** 교사 전용 — 규칙에서 교사 role 게이트. */
export async function saveTradingConfig(
  cid: string,
  cfg: Pick<TradingConfig, "enabled" | "weekly" | "sessions"> &
    Partial<Pick<TradingConfig, "override">>
): Promise<void> {
  await setDoc(
    doc(getDbClient(), "classes", cid, "trading", "config"),
    {
      enabled: cfg.enabled,
      weekly: cfg.weekly,
      sessions: cfg.sessions,
      ...(cfg.override !== undefined ? { override: cfg.override } : {}),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

/** 교사 전용 — 즉시 열기/닫기/시간표대로 전환(다른 설정은 건드리지 않음). */
export async function setTradingOverride(
  cid: string,
  override: TradingOverride
): Promise<void> {
  await setDoc(
    doc(getDbClient(), "classes", cid, "trading", "config"),
    { override, updatedAt: serverTimestamp() },
    { merge: true }
  );
}

// ---------- 포지션(보유 주식) ----------
export type Holding = {
  qty: number;
  /** 평균 매수단가(만보) */
  avgCost: number;
};

export type Position = {
  holdings: Record<string, Holding>;
  /** 실현손익 누계(만보) — 매도 시 (매도가 - 평단) × 수량 */
  realized: number;
  updatedAt: number | null;
};

export function watchMyPosition(
  cid: string,
  uid: string,
  cb: (p: Position | null) => void
): () => void {
  return onSnapshot(
    doc(getDbClient(), "classes", cid, "positions", uid),
    (snap) => {
      if (!snap.exists()) return cb(null);
      const v = snap.data() as Record<string, unknown>;
      const ts = v.updatedAt as { toMillis?: () => number } | undefined;
      cb({
        holdings: (v.holdings as Record<string, Holding>) ?? {},
        realized: (v.realized as number) ?? 0,
        updatedAt: ts?.toMillis ? ts.toMillis() : null,
      });
    },
    () => cb(null)
  );
}

/** 교사용 — 학급 전체 포지션 구독(규칙에서 교사만 목록 읽기 허용). */
export function watchAllPositions(
  cid: string,
  cb: (list: Array<{ uid: string } & Position>) => void
): () => void {
  return onSnapshot(
    collection(getDbClient(), "classes", cid, "positions"),
    (snap) => {
      cb(
        snap.docs.map((d) => {
          const v = d.data() as Record<string, unknown>;
          const ts = v.updatedAt as { toMillis?: () => number } | undefined;
          return {
            uid: d.id,
            holdings: (v.holdings as Record<string, Holding>) ?? {},
            realized: (v.realized as number) ?? 0,
            updatedAt: ts?.toMillis ? ts.toMillis() : null,
          };
        })
      );
    },
    () => cb([])
  );
}

/**
 * 교사 전용 — 학급 전체 포지션 1회 조회(구독 아님). 대시보드처럼 여러 학급을 한 번에
 * 훑어야 할 때 onSnapshot 구독을 다수 열지 않고 가볍게 조회하는 용도.
 */
export async function listAllPositions(
  cid: string
): Promise<Array<{ uid: string } & Position>> {
  const snap = await getDocs(collection(getDbClient(), "classes", cid, "positions"));
  return snap.docs.map((d) => {
    const v = d.data() as Record<string, unknown>;
    const ts = v.updatedAt as { toMillis?: () => number } | undefined;
    return {
      uid: d.id,
      holdings: (v.holdings as Record<string, Holding>) ?? {},
      realized: (v.realized as number) ?? 0,
      updatedAt: ts?.toMillis ? ts.toMillis() : null,
    };
  });
}

// ---------- 거래 ----------
export type TradeSide = "buy" | "sell";

export type Trade = {
  id: string;
  uid: string;
  /** 표시용 이름 — 체결 당시 스냅샷 */
  name: string;
  symbol: string;
  side: TradeSide;
  qty: number;
  /** 체결 만보 단가 */
  mbPrice: number;
  /** 실제 청구/지급액(만보) — 매수: mbPrice×qty+수수료, 매도: mbPrice×qty−수수료 */
  total: number;
  /** 이 거래에 부과된 수수료(만보) */
  fee: number;
  at: number | null;
};

function mapTrade(id: string, v: Record<string, unknown>): Trade {
  const ts = v.at as { toMillis?: () => number } | undefined;
  return {
    id,
    uid: (v.uid as string) ?? "",
    name: (v.name as string) ?? "",
    symbol: (v.symbol as string) ?? "",
    side: (v.side as TradeSide) ?? "buy",
    qty: (v.qty as number) ?? 0,
    mbPrice: (v.mbPrice as number) ?? 0,
    total: (v.total as number) ?? 0,
    fee: (v.fee as number) ?? 0,
    at: ts?.toMillis ? ts.toMillis() : null,
  };
}

/** 학급 최근 체결 내역(전체 공개 — 시장 분위기 연출용) */
export function watchRecentTrades(
  cid: string,
  cb: (list: Trade[]) => void,
  max = 30
): () => void {
  return onSnapshot(
    query(
      collection(getDbClient(), "classes", cid, "trades"),
      orderBy("at", "desc"),
      qLimit(max)
    ),
    (snap) => cb(snap.docs.map((d) => mapTrade(d.id, d.data()))),
    () => cb([])
  );
}

/** 우리 반 수익률 랭킹 한 줄 — 이름·총손익·수익률만(보유 종목/잔액은 서버가 감춘다). */
export type RankingRow = {
  uid: string;
  name: string;
  totalPnl: number;
  returnPct: number;
};

/**
 * 우리 반 수익률 랭킹 조회 — 서버가 정본인 positions 로 계산한다.
 *
 * 클라이언트에서 trades 를 재생하지 않는 이유: 체결 스냅샷은 "그때의 만보 단가"라
 * 종목의 만보 환산 배율(mbDivisor)이 바뀌면 현재 시세와 단위가 어긋나 허위 수익률이
 * 나온다. 교사용 '트레이딩 관리'와 같은 데이터·같은 수식을 쓰므로 두 화면이 일치한다.
 */
export async function fetchTradingRanking(cid: string): Promise<RankingRow[]> {
  const fn = httpsCallable<{ cid: string }, { ok: true; rows: RankingRow[] }>(
    getFunctionsClient(),
    "getTradingRanking"
  );
  const res = await fn({ cid });
  return res.data.rows ?? [];
}

/** 내 거래 내역 */
export function watchMyTrades(
  cid: string,
  uid: string,
  cb: (list: Trade[]) => void,
  max = 50
): () => void {
  return onSnapshot(
    query(
      collection(getDbClient(), "classes", cid, "trades"),
      where("uid", "==", uid),
      orderBy("at", "desc"),
      qLimit(max)
    ),
    (snap) => cb(snap.docs.map((d) => mapTrade(d.id, d.data()))),
    () => cb([])
  );
}

/**
 * 매수/매도 실행 — Cloud Function(executeTrade)이 트랜잭션으로 원자 처리.
 * 서버 검증: 학급 멤버, 개장 시간, 캐시 시세 존재, 잔액/보유수량, tradeId 멱등.
 * 지갑 원장: 매수 = balance-=총액·spent+=총액(spend 로그), 매도 = balance+=총액·earned+=총액(earn 로그).
 */
export async function executeTrade(
  cid: string,
  symbol: string,
  side: TradeSide,
  qty: number
): Promise<{ ok: true; balance: number; position: Position }> {
  try {
    const fn = httpsCallable<
      { cid: string; symbol: string; side: TradeSide; qty: number; tradeId: string },
      { ok: true; balance: number; position: Position }
    >(getFunctionsClient(), "executeTrade");
    const res = await fn({ cid, symbol, side, qty, tradeId: crypto.randomUUID() });
    return res.data;
  } catch (err) {
    const msg = (err as { message?: string })?.message;
    throw new Error(msg || "거래에 실패했습니다.");
  }
}
