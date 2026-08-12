"use client";

// 만보 트레이딩 — 학생이 만보(가상 화폐)로 실제 KRX 시세 1/2000 가격의 모의 주식투자.
//  · 종목은 별칭만 노출(실제 종목명 절대 표시 금지).
//  · 매수/매도는 교사가 정한 개장 시간에만(서버 executeTrade 가 재검증).
//  · 등락 색은 국내 관례: 상승=빨강(--trade-up), 하락=파랑(--trade-down).
//  · 데스크톱(lg+)은 토스 WTS 처럼 좌(종목목록)·우(거래창+거래소식+랭킹) 와이드 2컬럼,
//    모바일은 세로 스택 + 바텀시트. matchMedia 로 완전히 분리 렌더링(둘 다 마운트해
//    캔들을 이중으로 불러오는 낭비를 피한다).
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { TopBar } from "@/components/TopBar";
import { GlassCard } from "@/components/Glass";
import { Icon } from "@/components/Icon";
import { watchWallet, type ManboWallet } from "@/lib/manbo";
import { getMyRole, type Role } from "@/lib/classes";
import {
  EMPTY_TRADING_CONFIG,
  TRADING_STOCKS,
  isTradingOpen,
  nextOpenAt,
  refreshTradingPrices,
  stockBySymbol,
  toMbPrice,
  watchMyPosition,
  watchMyTrades,
  watchRecentTrades,
  watchTradingConfig,
  watchTradingMarket,
  watchTradingPrices,
  type Position,
  type StockQuote,
  type Trade,
  type TradingConfig,
  type TradingMarket,
  type TradingPrices,
} from "@/lib/trading";
import { StockSheet } from "@/components/trade/StockSheet";
import { StockPanel } from "@/components/trade/StockPanel";
import { MarketStrip } from "@/components/trade/MarketStrip";
import { RankingBoard } from "@/components/trade/RankingBoard";
import { TradeSideDrawer } from "@/components/trade/TradeSideDrawer";
import {
  arrow,
  fmtAgo,
  fmtMb,
  fmtMbDelta,
  fmtNextOpen,
  fmtPct,
  pnlColor,
  signColor,
} from "@/components/trade/util";

function fmtDate(ms: number | null) {
  if (!ms) return "";
  const d = new Date(ms);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/** lg(1024px) 이상인지 — 데스크톱 와이드 레이아웃과 모바일 바텀시트를 완전히 분리 렌더링하기 위함. */
function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches
  );
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    setIsDesktop(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return isDesktop;
}

function TradeInner() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const cid = params.get("id") || params.get("class");
  const isDesktop = useIsDesktop();

  const [wallet, setWallet] = useState<ManboWallet>({
    balance: 0,
    earned: 0,
    spent: 0,
  });
  const [prices, setPrices] = useState<TradingPrices | null>(null);
  const [market, setMarket] = useState<TradingMarket | null>(null);
  const [config, setConfig] = useState<TradingConfig>(EMPTY_TRADING_CONFIG);
  const [position, setPosition] = useState<Position | null>(null);
  const [myTrades, setMyTrades] = useState<Trade[]>([]);
  const [recentTrades, setRecentTrades] = useState<Trade[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [selected, setSelected] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [sideOpen, setSideOpen] = useState(false); // 데스크톱 우측 서랍(거래소식·랭킹) 열림 상태
  const [role, setRole] = useState<Role | null>(null);

  // 교사 판별 — class-admin/class 페이지와 동일하게 멤버 문서 role 사용(규칙이 권한 강제).
  // 교사면 관전용 '보기 모드'로 전환(수업 중 빔프로젝터로 시세·차트만 띄우는 용도).
  const viewer = role === "teacher";

  useEffect(() => {
    if (!loading && !user) router.replace("/");
  }, [user, loading, router]);

  useEffect(() => {
    if (!user || !cid) return;
    getMyRole(cid, user.uid).then(setRole).catch(() => {});
  }, [user, cid]);

  // 시세는 1분 스로틀로 서버가 묶어서 갱신 — 진입 시 1회 요청(실패 무시)
  useEffect(() => {
    if (!user) return;
    refreshTradingPrices().catch(() => {});
  }, [user]);

  // 개장 여부/상대시간 표시를 위해 주기적으로 now 갱신
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 20_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    // 시세·시장 지수는 전역 문서 — 학생/교사 보기 모드 공통으로 구독.
    const offPrices = watchTradingPrices(setPrices);
    const offMarket = watchTradingMarket(setMarket);
    if (!user || !cid) return () => {
      offPrices();
      offMarket();
    };
    const offConfig = watchTradingConfig(cid, (c) =>
      setConfig(c ?? EMPTY_TRADING_CONFIG)
    );
    // 학급 체결 피드는 교사 보기 모드에서도 유지(반 아이들 거래를 실시간 관전).
    const offRecent = watchRecentTrades(cid, setRecentTrades);
    // 교사 보기 모드: 내 지갑·포지션·거래기록은 구독하지 않음(화면에도 노출 안 함).
    if (viewer) {
      return () => {
        offPrices();
        offMarket();
        offConfig();
        offRecent();
      };
    }
    const offWallet = watchWallet(cid, user.uid, setWallet);
    const offPos = watchMyPosition(cid, user.uid, setPosition);
    const offMine = watchMyTrades(cid, user.uid, setMyTrades);
    return () => {
      offPrices();
      offMarket();
      offConfig();
      offRecent();
      offWallet();
      offPos();
      offMine();
    };
  }, [user, cid, viewer]);

  const open = useMemo(() => isTradingOpen(config, now), [config, now]);
  const nextOpen = useMemo(() => nextOpenAt(config, now), [config, now]);
  const nextOpenText = nextOpen ? fmtNextOpen(nextOpen) : null;

  const holdings = position?.holdings ?? {};
  const realized = position?.realized ?? 0;

  // 포트폴리오 집계
  const portfolio = useMemo(() => {
    const rows = Object.entries(position?.holdings ?? {})
      .filter(([, h]) => h.qty > 0)
      .map(([symbol, h]) => {
        const stock = stockBySymbol(symbol);
        const cur = prices?.stocks[symbol]?.mbPrice ?? h.avgCost;
        const value = cur * h.qty;
        const cost = h.avgCost * h.qty;
        const pnl = value - cost;
        const pct = cost > 0 ? (pnl / cost) * 100 : 0;
        return { symbol, stock, ...h, cur, value, cost, pnl, pct };
      });
    const totalValue = rows.reduce((s, r) => s + r.value, 0);
    const totalCost = rows.reduce((s, r) => s + r.cost, 0);
    const unrealized = totalValue - totalCost;
    // 분산투자 안내용 — 가장 비중이 큰 종목과 그 비율(%).
    const topHolding = rows.reduce<(typeof rows)[number] | null>(
      (max, r) => (!max || r.value > max.value ? r : max),
      null
    );
    const topConcentration =
      totalValue > 0 && topHolding ? (topHolding.value / totalValue) * 100 : 0;
    return { rows, totalValue, totalCost, unrealized, topHolding, topConcentration };
  }, [position, prices]);

  async function doRefresh() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await refreshTradingPrices();
    } catch {
      // 무시 — 스로틀/네트워크 실패해도 기존 시세 유지
    } finally {
      setRefreshing(false);
    }
  }

  if (loading || !user || !cid) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <div className="animate-pulse text-sm text-[var(--md-sys-color-on-surface-variant)]">
          불러오는 중…
        </div>
      </main>
    );
  }

  // 모바일 바텀시트가 여는 종목. 데스크톱은 항상 우측 패널에 표시(첫 종목 기본 선택).
  const sheetStock = selected ? stockBySymbol(selected) : undefined;
  const panelStock = stockBySymbol(selected ?? TRADING_STOCKS[0].symbol)!;

  const stockListNode = (
    <div className="flex flex-col gap-2">
      {TRADING_STOCKS.map((s) => {
        const q: StockQuote | undefined = prices?.stocks[s.symbol];
        const pct = q?.changePct ?? 0;
        const diffMb = q ? q.mbPrice - toMbPrice(q.prevClose, s.mbDivisor) : 0;
        const held = holdings[s.symbol]?.qty ?? 0;
        const active =
          isDesktop &&
          (selected ? selected === s.symbol : s.symbol === TRADING_STOCKS[0].symbol);
        return (
          <button
            key={s.symbol}
            onClick={() => setSelected(s.symbol)}
            aria-pressed={active}
            className="flex items-center gap-3 rounded-2xl border px-4 py-4 text-left transition active:scale-[0.99]"
            style={{
              borderColor: active
                ? "var(--md-sys-color-primary)"
                : "var(--md-sys-color-outline-variant)",
              background: active
                ? "color-mix(in srgb, var(--md-sys-color-primary) 8%, var(--md-sys-color-surface-container-low))"
                : "var(--md-sys-color-surface-container-low)",
            }}
          >
            {/* 색상 원형칩 아이콘 */}
            <span
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full"
              style={{
                background: `color-mix(in srgb, ${s.color} 16%, transparent)`,
              }}
            >
              <Icon name={s.icon} size={26} style={{ color: s.color }} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-base font-extrabold">
                {s.alias}
                {held > 0 && (
                  <span className="rounded-full bg-[var(--md-sys-color-primary-container)] px-2 py-0.5 text-xs font-bold text-[var(--md-sys-color-on-primary-container)]">
                    {held}주 보유
                  </span>
                )}
              </p>
            </div>
            {/* 현재가(크고 진하게) + 등락률/전일比 */}
            <div className="shrink-0 text-right">
              <p className="whitespace-nowrap text-xl font-black text-[var(--md-sys-color-on-surface)]">
                {q ? fmtMb(q.mbPrice) : "—"}
              </p>
              <p
                className="mt-0.5 whitespace-nowrap text-sm font-bold"
                style={{ color: signColor(pct) }}
              >
                {q ? (
                  <>
                    {arrow(pct)} {fmtPct(pct)}
                    <span className="ml-1 opacity-90">
                      {fmtMbDelta(diffMb)}
                    </span>
                  </>
                ) : (
                  "시세 준비 중"
                )}
              </p>
            </div>
          </button>
        );
      })}
    </div>
  );

  const portfolioNode = !viewer && (
    <>
      <h2 className="mb-2 mt-8 flex items-center gap-2 text-lg font-bold">
        <Icon
          name="account_balance_wallet"
          size={20}
          className="text-[var(--md-sys-color-primary)]"
        />
        내 주식 보관함
      </h2>
      <GlassCard className="p-4">
        {/* 총 평가 요약 */}
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-2xl bg-[var(--md-sys-color-surface-container)] px-3 py-3 text-center">
            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
              주식 평가액
            </p>
            <p className="mt-0.5 text-base font-extrabold">
              {fmtMb(portfolio.totalValue)}
            </p>
          </div>
          <div className="rounded-2xl bg-[var(--md-sys-color-surface-container)] px-3 py-3 text-center">
            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
              평가 손익
            </p>
            <p
              className="mt-0.5 text-base font-extrabold"
              style={{ color: pnlColor(portfolio.unrealized) }}
            >
              {portfolio.unrealized >= 0 ? "+" : ""}
              {fmtMb(portfolio.unrealized)}
            </p>
          </div>
          <div className="rounded-2xl bg-[var(--md-sys-color-surface-container)] px-3 py-3 text-center">
            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
              실현 손익
            </p>
            <p
              className="mt-0.5 text-base font-extrabold"
              style={{ color: pnlColor(realized) }}
            >
              {realized >= 0 ? "+" : ""}
              {fmtMb(realized)}
            </p>
          </div>
        </div>

        {/* 분산투자 안내 — 한 종목에 70% 넘게 몰려 있으면 부드럽게 알려준다(경고 아님). */}
        {portfolio.topHolding && portfolio.topConcentration >= 70 && (
          <div className="mt-3 flex items-start gap-2 rounded-2xl bg-[var(--md-sys-color-tertiary-container)] px-4 py-3 text-sm text-[var(--md-sys-color-on-tertiary-container)]">
            <Icon name="pie_chart" size={18} className="mt-0.5 shrink-0" />
            <span>
              <b>{portfolio.topHolding.stock?.alias ?? portfolio.topHolding.symbol}</b>
              에 내 주식 재산의 {Math.round(portfolio.topConcentration)}%가 몰려 있어요.
              달걀을 한 바구니에 담지 않듯, 여러 종목에 나눠 담으면 위험을 줄일 수 있어요.
            </span>
          </div>
        )}

        {portfolio.rows.length === 0 ? (
          <p className="mt-3 rounded-2xl bg-[var(--md-sys-color-surface-container)] px-3 py-8 text-center text-sm text-[var(--md-sys-color-on-surface-variant)]">
            아직 가진 주식이 없어요. 위에서 마음에 드는 종목을 골라 보세요!
            <Icon
              name="shopping_cart"
              size={18}
              className="ml-1 inline-block align-middle"
            />
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {portfolio.rows.map((r) => (
              <li
                key={r.symbol}
                className="flex items-center gap-3 rounded-2xl bg-[var(--md-sys-color-surface-container)] px-3 py-2.5"
              >
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                  style={{
                    background: `color-mix(in srgb, ${r.stock?.color ?? "var(--md-sys-color-primary)"} 16%, transparent)`,
                  }}
                >
                  <Icon
                    name={r.stock?.icon ?? "candlestick_chart"}
                    size={20}
                    style={{ color: r.stock?.color ?? "var(--md-sys-color-primary)" }}
                  />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">
                    {r.stock?.alias ?? r.symbol}
                  </p>
                  <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                    {r.qty}주 · 평균 {fmtMb(r.avgCost)} → 지금 {fmtMb(r.cur)}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-extrabold">{fmtMb(r.value)}</p>
                  <p
                    className="text-xs font-bold"
                    style={{ color: pnlColor(r.pnl) }}
                  >
                    {r.pnl >= 0 ? "+" : ""}
                    {fmtMb(r.pnl)} ({fmtPct(r.pct)})
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </GlassCard>
    </>
  );

  const feedNode = (
    <>
      <h2 className="mb-2 mt-8 flex items-center gap-2 text-lg font-bold">
        <Icon
          name="campaign"
          size={20}
          className="text-[var(--md-sys-color-primary)]"
        />
        우리 반 거래 소식
      </h2>
      <GlassCard className="p-4">
        {recentTrades.length === 0 ? (
          <p className="py-6 text-center text-sm text-[var(--md-sys-color-on-surface-variant)]">
            아직 거래 소식이 없어요.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {recentTrades.map((t) => {
              const alias = stockBySymbol(t.symbol)?.alias ?? t.symbol;
              const buy = t.side === "buy";
              return (
                <li
                  key={t.id}
                  className="flex items-center gap-2 rounded-xl px-2 py-1.5 text-sm"
                >
                  <Icon
                    name={buy ? "arrow_drop_up" : "arrow_drop_down"}
                    size={22}
                    fill
                    className="shrink-0"
                    style={{ color: buy ? "var(--trade-up)" : "var(--trade-down)" }}
                  />
                  <span className="min-w-0 flex-1 truncate">
                    <b>{t.name || "친구"}</b>님이 {alias} {t.qty}주{" "}
                    {buy ? "샀어요" : "팔았어요"}
                  </span>
                  <span className="shrink-0 text-xs text-[var(--md-sys-color-on-surface-variant)]">
                    {fmtAgo(t.at)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </GlassCard>
    </>
  );

  const rankingNode = <RankingBoard cid={cid} prices={prices} myUid={user.uid} />;

  const myTradesNode = !viewer && (
    <>
      <h2 className="mb-2 mt-8 flex items-center gap-2 text-lg font-bold">
        <Icon
          name="receipt_long"
          size={20}
          className="text-[var(--md-sys-color-primary)]"
        />
        내 거래 기록
      </h2>
      <GlassCard className="mb-10 p-4">
        {myTrades.length === 0 ? (
          <p className="py-6 text-center text-sm text-[var(--md-sys-color-on-surface-variant)]">
            아직 거래한 적이 없어요.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {myTrades.map((t) => {
              const alias = stockBySymbol(t.symbol)?.alias ?? t.symbol;
              const buy = t.side === "buy";
              return (
                <li
                  key={t.id}
                  className="flex items-center gap-2 rounded-xl bg-[var(--md-sys-color-surface-container)] px-3 py-2.5 text-sm"
                >
                  <span className="w-9 shrink-0 text-xs text-[var(--md-sys-color-on-surface-variant)]">
                    {fmtDate(t.at)}
                  </span>
                  <span
                    className="shrink-0 rounded-full px-2 py-0.5 text-xs font-extrabold text-white"
                    style={{
                      background: buy ? "var(--trade-up)" : "var(--trade-down)",
                    }}
                  >
                    {buy ? "매수" : "매도"}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {alias} {t.qty}주
                  </span>
                  <span
                    className="shrink-0 font-extrabold"
                    style={{ color: buy ? "var(--trade-up)" : "var(--trade-down)" }}
                  >
                    {buy ? "-" : "+"}
                    {fmtMb(t.total)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </GlassCard>
    </>
  );

  return (
    <div className="trade-scope contents">
      <TopBar />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 lg:max-w-7xl">
        <button
          onClick={() => router.push(`/level?id=${cid}`)}
          className="mb-3 inline-flex items-center gap-1 text-sm text-[var(--md-sys-color-on-surface-variant)] transition hover:text-[var(--md-sys-color-on-surface)]"
        >
          <Icon name="arrow_back" size={18} />
          내 성장으로
        </button>

        <h1 className="mb-4 flex items-center gap-2 text-2xl font-black">
          <Icon
            name="candlestick_chart"
            size={26}
            className="text-[var(--md-sys-color-primary)]"
          />
          만보 트레이딩
        </h1>

        {/* 잔액 + 개장 상태 (교사 보기 모드에선 지갑 대신 관전 배지) */}
        <GlassCard strong className="overflow-hidden p-0">
          <div className="jam-trade-hero flex flex-col gap-3 px-6 py-5 text-white lg:flex-row lg:items-center lg:gap-6 lg:py-4">
            <div className="flex items-center gap-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/25 lg:h-10 lg:w-10">
                <Icon name={viewer ? "visibility" : "savings"} size={26} className="text-white" />
              </span>
              {viewer ? (
                <div className="min-w-0">
                  <p className="text-xs font-semibold opacity-90 lg:hidden">교사 보기 모드</p>
                  <p className="text-xl font-black lg:text-lg">우리 반 시세를 함께 봐요</p>
                </div>
              ) : (
                <div className="min-w-0">
                  <p className="text-xs font-semibold opacity-90 lg:hidden">내가 가진 만보</p>
                  <p className="text-2xl font-black lg:text-xl">
                    {wallet.balance.toLocaleString()}
                    <span className="ml-1 text-base font-bold opacity-90">만보</span>
                  </p>
                </div>
              )}
            </div>
            <div className="hidden h-8 w-px bg-white/25 lg:block" />
            <div className="flex flex-1 flex-wrap items-center gap-2 lg:justify-end">
              {open ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1.5 text-sm font-extrabold">
                  <span
                    aria-hidden
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: "currentColor" }}
                  />
                  지금 거래할 수 있어요
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-sm font-bold opacity-95">
                  <span
                    aria-hidden
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: "currentColor" }}
                  />
                  {config?.override === "closed"
                    ? "선생님이 지금은 거래를 닫아뒀어요"
                    : nextOpenText
                      ? `다음 거래: ${nextOpenText}`
                      : "선생님이 아직 거래 시간을 정하지 않았어요"}
                </span>
              )}
              <button
                onClick={doRefresh}
                disabled={refreshing}
                className="inline-flex items-center gap-1 rounded-full border border-white/40 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-white/10 disabled:opacity-40"
              >
                <Icon name="refresh" size={15} />
                {prices?.updatedAt
                  ? `${fmtAgo(prices.updatedAt)} 시세`
                  : "새로고침"}
              </button>
            </div>
          </div>
        </GlassCard>

        {/* 시장 지수 요약 스트립 (토스 홈 상단 느낌, 전체 폭) — 데이터 없으면 스스로 숨김 */}
        <MarketStrip market={market} />

        {isDesktop ? (
          // ---------- 데스크톱: 좌(종목목록+보관함) · 우(거래창+거래소식+랭킹) 와이드 2컬럼 ----------
          <div className="mt-6 grid grid-cols-12 items-start gap-6">
            <div className="col-span-5 min-w-0">
              <h2 className="mb-2 flex items-center gap-2 text-lg font-bold">
                <Icon
                  name="storefront"
                  size={20}
                  className="text-[var(--md-sys-color-primary)]"
                />
                오늘의 종목
              </h2>
              {stockListNode}
              {portfolioNode}
            </div>
            <div className="col-span-7 min-w-0">
              <div className="flex w-full flex-col overflow-hidden rounded-3xl bg-[var(--md-sys-color-surface-container-high)] shadow-[var(--md-sys-elevation-1)]">
                <StockPanel
                  cid={cid}
                  stock={panelStock}
                  quote={prices?.stocks[panelStock.symbol]}
                  holdingQty={holdings[panelStock.symbol]?.qty ?? 0}
                  avgCost={holdings[panelStock.symbol]?.avgCost ?? 0}
                  balance={wallet.balance}
                  marketOpen={open}
                  nextOpenText={nextOpenText}
                  viewer={viewer}
                />
              </div>
            </div>
          </div>
        ) : (
          // ---------- 모바일: 세로 스택 + 바텀시트 ----------
          <>
            <h2 className="mb-2 mt-6 flex items-center gap-2 text-lg font-bold">
              <Icon
                name="storefront"
                size={20}
                className="text-[var(--md-sys-color-primary)]"
              />
              오늘의 종목
            </h2>
            {stockListNode}
            {portfolioNode}
            {feedNode}
            {rankingNode}
            {myTradesNode}
          </>
        )}

        {isDesktop && myTradesNode}
      </main>

      {isDesktop && (
        <TradeSideDrawer open={sideOpen} onOpenChange={setSideOpen}>
          {feedNode}
          {rankingNode}
        </TradeSideDrawer>
      )}

      {!isDesktop && sheetStock && (
        <StockSheet
          cid={cid}
          stock={sheetStock}
          quote={prices?.stocks[sheetStock.symbol]}
          holdingQty={holdings[sheetStock.symbol]?.qty ?? 0}
          avgCost={holdings[sheetStock.symbol]?.avgCost ?? 0}
          balance={wallet.balance}
          marketOpen={open}
          nextOpenText={nextOpenText}
          viewer={viewer}
          onClose={() => setSelected(null)}
        />
      )}

      <style>{`
        .trade-scope{
          --trade-up:#c62828;   /* 상승(빨강) — 국내 관례 */
          --trade-down:#1565c0; /* 하락(파랑) */
          --trade-flat:var(--md-sys-color-on-surface-variant);
        }
        [data-md-scheme="dark"] .trade-scope, .md-dark .trade-scope{
          --trade-up:#ff8a80;
          --trade-down:#82b1ff;
        }
        .jam-trade-hero{
          background:linear-gradient(120deg,
            var(--md-sys-color-p-40),var(--md-sys-color-p-50) 55%,var(--md-sys-color-t-50));
        }
      `}</style>
    </div>
  );
}

export default function TradePage() {
  return (
    <Suspense
      fallback={
        <main className="flex flex-1 items-center justify-center">
          <div className="animate-pulse text-sm text-[var(--md-sys-color-on-surface-variant)]">
            불러오는 중…
          </div>
        </main>
      }
    >
      <TradeInner />
    </Suspense>
  );
}
