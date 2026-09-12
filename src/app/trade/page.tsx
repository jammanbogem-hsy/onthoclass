"use client";

// 만보 트레이딩 — 학생이 만보(가상 화폐)로 실제 KRX 시세 1/2000 가격의 모의 주식투자.
//  · 종목은 별칭만 노출(실제 종목명 절대 표시 금지).
//  · 매수/매도는 교사가 정한 개장 시간에만(서버 executeTrade 가 재검증).
//  · 등락 색은 국내 관례: 상승=빨강(--trade-up), 하락=파랑(--trade-down).
//  · 데스크톱(lg+)은 토스 WTS 처럼 좌(종목목록)·우(거래창+거래소식+랭킹) 와이드 2컬럼,
//    모바일은 세로 스택 + 바텀시트. matchMedia 로 완전히 분리 렌더링(둘 다 마운트해
//    캔들을 이중으로 불러오는 낭비를 피한다).
import { Suspense, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { usePageVisible } from "@/hooks/usePageVisible";
import { useAuth } from "@/contexts/AuthContext";
import { TopBar } from "@/components/TopBar";
import { GlassCard } from "@/components/Glass";
import { Icon } from "@/components/Icon";
import { watchWallet, type ManboWallet } from "@/lib/manbo";
import { getMyRole, type Role } from "@/lib/classes";
import {
  EMPTY_TRADING_CONFIG,
  TRADE_HISTORY_MAX,
  TRADING_STOCKS,
  fillTradePnl,
  isTradingOpen,
  nextOpenAt,
  periodStartMs,
  refreshTradingPrices,
  stockBySymbol,
  tradingStats,
  watchMyPosition,
  watchMyTrades,
  watchRecentTrades,
  watchTradingConfig,
  watchTradingMarket,
  watchTradingPrices,
  type PeriodKey,
  type Position,
  type Trade,
  type TradingConfig,
  type TradingMarket,
  type TradingPrices,
} from "@/lib/trading";
import { AccountSheet } from "@/components/trade/AccountSheet";
import { ContestBoardModal } from "@/components/contest/ContestModals";
import { listStockContests, type ContestMeta } from "@/lib/contest";
import { StockSheet } from "@/components/trade/StockSheet";
import { StockWatchlist } from "@/components/trade/StockWatchlist";
import { StockPanel } from "@/components/trade/StockPanel";
import { MarketStrip } from "@/components/trade/MarketStrip";
import { RankingBoard } from "@/components/trade/RankingBoard";
import { TradeSideDrawer } from "@/components/trade/TradeSideDrawer";
import {
  fmtAgo,
  fmtMb,
  fmtNextOpen,
  fmtPct,
  pnlColor,
} from "@/components/trade/util";

function fmtDate(ms: number | null) {
  if (!ms) return "";
  const d = new Date(ms);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/** lg(1024px) 이상인지 — 데스크톱 와이드 레이아웃과 모바일 바텀시트를 완전히 분리 렌더링하기 위함. */
const subscribeDesktop = (notify: () => void) => {
  const mq = window.matchMedia("(min-width: 1024px)");
  mq.addEventListener("change", notify);
  return () => mq.removeEventListener("change", notify);
};
function useIsDesktop(): boolean {
  return useSyncExternalStore(
    subscribeDesktop,
    () => window.matchMedia("(min-width: 1024px)").matches,
    () => false,
  );
}

function TradeInner() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const cid = params.get("id") || params.get("class");
  const isDesktop = useIsDesktop();
  const pageVisible = usePageVisible();

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
  const [period, setPeriod] = useState<PeriodKey>("week"); // '내 계좌'의 기간 조회 범위
  // 우리 반이 참가 중인 주식대회 — 규칙상 직접 못 읽어 callable 로 1회 조회.
  const [contests, setContests] = useState<ContestMeta[]>([]);
  const [openContestId, setOpenContestId] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState("market");
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

  useEffect(() => {
    if (!user || !cid) return;
    let alive = true;
    listStockContests(cid)
      .then((list) => alive && setContests(list))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [user, cid]);

  // 개장 여부/상대시간 표시를 위해 주기적으로 now 갱신
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 20_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!pageVisible) return;
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
    // 교사 보기 모드: 내 지갑·포지션·거래기록은 구독하지 않음(화면에도 노출 안 함).
    if (viewer) {
      return () => {
        offPrices();
        offMarket();
        offConfig();
      };
    }
    const offWallet = watchWallet(cid, user.uid, setWallet);
    const offPos = watchMyPosition(cid, user.uid, setPosition);
    // 기간 손익은 이력 재생(fillTradePnl)에 기대므로 잘리지 않게 넉넉히 구독한다.
    const offMine = watchMyTrades(cid, user.uid, setMyTrades, TRADE_HISTORY_MAX);
    return () => {
      offPrices();
      offMarket();
      offConfig();
      offWallet();
      offPos();
      offMine();
    };
  }, [user, cid, viewer, pageVisible]);

  const showTradeFeed = isDesktop ? sideOpen : mobileTab === "history";
  useEffect(() => {
    if (!user || !cid || !pageVisible || !showTradeFeed) return;
    return watchRecentTrades(cid, setRecentTrades);
  }, [user, cid, pageVisible, showTradeFeed]);

  const open = useMemo(() => isTradingOpen(config, now), [config, now]);
  const nextOpen = useMemo(() => nextOpenAt(config, now), [config, now]);
  const nextOpenText = nextOpen ? fmtNextOpen(nextOpen) : null;

  const holdings = position?.holdings ?? {};

  // 내 성적 — 보유 평가·실현손익·총수익률·기간 매매 성적을 한 번에 계산한다.
  // (교사용 '트레이딩 관리'·'주식대회'와 같은 lib 함수를 써서 숫자가 항상 일치한다.)
  const periodFrom = useMemo(() => periodStartMs(period, now), [period, now]);
  const stats = useMemo(
    () =>
      tradingStats(user?.uid ?? "", position, prices, myTrades, { from: periodFrom }),
    [user, position, prices, myTrades, periodFrom]
  );
  // 실현손익이 채워진 체결 목록 — '내 거래 기록'에서 매도 건마다 손익을 보여준다.
  const filledTrades = useMemo(
    () => fillTradePnl(myTrades.filter((t) => t.uid === (user?.uid ?? ""))),
    [myTrades, user]
  );

  // 분산투자 안내용 — 가장 비중이 큰 종목과 그 비율(%). holdings 는 평가액 내림차순.
  const topHolding = stats.holdings[0] ?? null;
  const topConcentration =
    stats.value > 0 && topHolding ? (topHolding.value / stats.value) * 100 : 0;
  const totalAssets = wallet.balance + stats.value;

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

  const stockListNode = <StockWatchlist key={`${cid}:${user.uid}`} storageKey={`trade-watchlist:${cid}:${user.uid}`} prices={prices} holdings={holdings} selected={isDesktop ? panelStock.symbol : selected} onSelect={setSelected} favoritesOnly={!isDesktop && mobileTab === "favorite"} />;

  // ---------- 내 계좌 (MTS 계좌 화면) ----------
  // 실제 MTS 처럼 [잔고]·[실현손익] 두 탭을 AccountSheet 로 보여주고, 그 위에 총자산·총손익을
  // 크게 얹는다. 교사가 학생을 눌러 보는 화면(TradingAdminModal)도 같은 AccountSheet 를 쓴다.
  //  · 실현손익 = 이미 팔아서 확정된 손익(기간 안의 매도만 더한다)
  //  · 평가손익 = 아직 안 판 주식의 오르내림(지금 이 순간 기준이라 기간 개념이 없다)
  const accountNode = !viewer && (
    <>
      <h2 className="mb-2 mt-8 flex items-center gap-2 text-lg font-bold">
        <Icon
          name="account_balance_wallet"
          size={20}
          className="text-[var(--md-sys-color-primary)]"
        />
        내 계좌
      </h2>
      <GlassCard className="p-4">
        {/* 총자산 — 현금 + 주식 평가액 */}
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
              내 총자산 (현금 + 주식)
            </p>
            <p className="text-3xl font-black tabular-nums">
              {Math.round(totalAssets).toLocaleString()}
              <span className="ml-1 text-base font-bold text-[var(--md-sys-color-on-surface-variant)]">
                만보
              </span>
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
              총손익 (실현 + 평가)
            </p>
            <p
              className="text-2xl font-black tabular-nums"
              style={{ color: pnlColor(stats.totalPnl) }}
            >
              {stats.totalPnl >= 0 ? "+" : ""}
              {Math.round(stats.totalPnl).toLocaleString()}
              <span className="ml-1.5 text-base font-extrabold">
                ({fmtPct(stats.returnPct)})
              </span>
            </p>
          </div>
        </div>

        <AccountSheet
          stats={stats}
          trades={filledTrades}
          balance={wallet.balance}
          period={period}
          onPeriodChange={setPeriod}
        />

        {/* 분산투자 안내 — 한 종목에 70% 넘게 몰려 있으면 부드럽게 알려준다(경고 아님). */}
        {topHolding && topConcentration >= 70 && (
          <div className="mt-3 flex items-start gap-2 rounded-2xl bg-[var(--md-sys-color-tertiary-container)] px-4 py-3 text-sm text-[var(--md-sys-color-on-tertiary-container)]">
            <Icon name="pie_chart" size={18} className="mt-0.5 shrink-0" />
            <span>
              <b>{topHolding.stock?.alias ?? topHolding.symbol}</b>
              에 내 주식 재산의 {Math.round(topConcentration)}%가 몰려 있어요.
              달걀을 한 바구니에 담지 않듯, 여러 종목에 나눠 담으면 위험을 줄일 수 있어요.
            </span>
          </div>
        )}

        {stats.holdings.length === 0 && stats.tradeCount === 0 && (
          <p className="mt-3 rounded-2xl bg-[var(--md-sys-color-surface-container)] px-3 py-6 text-center text-sm text-[var(--md-sys-color-on-surface-variant)]">
            아직 가진 주식이 없어요. 위에서 마음에 드는 종목을 골라 보세요!
            <Icon
              name="shopping_cart"
              size={18}
              className="ml-1 inline-block align-middle"
            />
          </p>
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

  const rankingNode = <RankingBoard key={cid} cid={cid} myUid={user.uid} />;

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
        {filledTrades.length === 0 ? (
          <p className="py-6 text-center text-sm text-[var(--md-sys-color-on-surface-variant)]">
            아직 거래한 적이 없어요.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {filledTrades.slice(0, 50).map((t) => {
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
                  <span className="shrink-0 text-right">
                    <span
                      className="block font-extrabold"
                      style={{ color: buy ? "var(--trade-up)" : "var(--trade-down)" }}
                    >
                      {buy ? "-" : "+"}
                      {fmtMb(t.total)}
                    </span>
                    {/* 매도 건은 그때 확정된 실현손익을 함께 보여준다(MTS 의 '실현손익' 열). */}
                    {!buy && t.pnl !== null && (
                      <span
                        className="block text-[11px] font-bold"
                        style={{ color: pnlColor(t.pnl) }}
                      >
                        실현 {t.pnl >= 0 ? "+" : ""}
                        {fmtMb(t.pnl)}
                        {t.costBasis && t.costBasis > 0
                          ? ` (${fmtPct((t.pnl / t.costBasis) * 100)})`
                          : ""}
                      </span>
                    )}
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
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 pt-6 pb-24 lg:pb-6 lg:max-w-7xl">
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
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-white/25 lg:h-10 lg:w-10">
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

        {/* 우리 반 주식대회 — 눌러서 지금 등수 보기 */}
        {contests.length > 0 && (
          <div className="mt-4 flex flex-col gap-2">
            {contests.map((ct) => {
              const done = ct.status === "done";
              return (
                <button
                  key={ct.id}
                  onClick={() => setOpenContestId(ct.id)}
                  className="flex items-center gap-3 rounded-2xl border px-4 py-3 text-left transition hover:brightness-[0.98]"
                  style={{
                    borderColor: done
                      ? "var(--md-sys-color-outline-variant)"
                      : "color-mix(in srgb, #d9a400 45%, transparent)",
                    background: done
                      ? "var(--md-sys-color-surface-container-low)"
                      : "color-mix(in srgb, #d9a400 10%, var(--md-sys-color-surface-container-low))",
                  }}
                >
                  <span
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
                    style={{ background: "color-mix(in srgb, #d9a400 20%, transparent)" }}
                  >
                    <Icon
                      name={done ? "check_circle" : "trophy"}
                      size={22}
                      fill
                      style={{ color: "#d9a400" }}
                    />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base font-extrabold">
                      {ct.name}
                    </span>
                    <span className="block truncate text-xs text-[var(--md-sys-color-on-surface-variant)]">
                      {done
                        ? "끝난 대회 · 결과 보기"
                        : `진행 중 · 참가 ${ct.participants}명 · 내 등수 보기`}
                    </span>
                    {ct.desc && (
                      <span className="mt-0.5 block truncate text-xs text-[var(--md-sys-color-on-surface)]">
                        {ct.desc}
                      </span>
                    )}
                  </span>
                  <Icon
                    name="chevron_right"
                    size={20}
                    className="shrink-0 text-[var(--md-sys-color-on-surface-variant)]"
                  />
                </button>
              );
            })}
          </div>
        )}

        {isDesktop ? (
          // ---------- 데스크톱: 좌(종목목록+보관함) · 우(거래창+거래소식+랭킹) 와이드 2컬럼 ----------
          <div className="mt-6 grid grid-cols-12 items-start gap-6">
            <div className="col-span-4 min-w-0 xl:col-span-3">
              <h2 className="mb-2 flex items-center gap-2 text-lg font-bold">
                <Icon
                  name="storefront"
                  size={20}
                  className="text-[var(--md-sys-color-primary)]"
                />
                오늘의 종목
              </h2>
              {stockListNode}
            </div>
            <div className="col-span-8 min-w-0 xl:col-span-9">
              <div className="flex w-full flex-col overflow-hidden rounded-3xl bg-[var(--md-sys-color-surface-container-high)] shadow-[var(--md-sys-elevation-1)]">
                <StockPanel
                  cid={cid}
                  stock={panelStock}
                  quote={prices?.stocks[panelStock.symbol]}
                  holdingQty={holdings[panelStock.symbol]?.qty ?? 0}
                  avgCost={holdings[panelStock.symbol]?.avgCost ?? 0}
                  balance={wallet.balance}
                  portfolioValue={stats.holdings.every(h => (prices?.stocks[h.symbol]?.mbPrice ?? 0) > 0) ? stats.value : undefined}
                  trades={myTrades}
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
            {(mobileTab === "market" || mobileTab === "favorite") && <><h2 className="mb-2 mt-6 text-lg font-bold">{mobileTab === "favorite" ? "관심종목" : "오늘의 종목"}</h2>{stockListNode}</>}
            {mobileTab === "account" && accountNode}
            {mobileTab === "history" && <>{myTradesNode}{feedNode}{rankingNode}</>}
            <nav aria-label="트레이딩 메뉴" className="fixed inset-x-0 bottom-0 z-40 flex border-t border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] px-2 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-lg">
              {[["market", "시장"], ["favorite", "관심"], ...(!viewer ? [["account", "내 자산"]] : []), ["history", "거래 내역"]].map(([key, label]) => <button key={key} onClick={() => setMobileTab(key)} aria-current={mobileTab === key ? "page" : undefined} className="min-h-11 flex-1 rounded-xl px-2 py-3 text-sm font-bold" style={{ background: mobileTab === key ? "var(--md-sys-color-primary-container)" : undefined }}>{label}</button>)}
            </nav>
          </>
        )}

        {isDesktop && <div className="mt-6">{accountNode}{myTradesNode}</div>}
      </main>

      {isDesktop && (
        <TradeSideDrawer open={sideOpen} onOpenChange={setSideOpen}>
          {feedNode}
          {rankingNode}
        </TradeSideDrawer>
      )}

      {openContestId && (
        <ContestBoardModal
          contestId={openContestId}
          myUid={viewer ? undefined : user.uid}
          onClose={() => setOpenContestId(null)}
        />
      )}

      {!isDesktop && sheetStock && (
        <StockSheet
          cid={cid}
          stock={sheetStock}
          quote={prices?.stocks[sheetStock.symbol]}
          holdingQty={holdings[sheetStock.symbol]?.qty ?? 0}
          avgCost={holdings[sheetStock.symbol]?.avgCost ?? 0}
          balance={wallet.balance}
          portfolioValue={stats.holdings.every(h => (prices?.stocks[h.symbol]?.mbPrice ?? 0) > 0) ? stats.value : undefined}
          trades={myTrades}
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
