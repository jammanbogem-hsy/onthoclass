"use client";

import { useState, useSyncExternalStore } from "react";
import { TRADING_STOCKS, type TradingPrices } from "@/lib/trading";
import { fmtMb, fmtPct, signColor } from "./util";

export function StockWatchlist({ storageKey, prices, holdings, selected, onSelect, favoritesOnly = false }: { storageKey: string; prices: TradingPrices | null; holdings: Record<string, { qty: number }>; selected: string | null; onSelect: (symbol: string) => void; favoritesOnly?: boolean }) {
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("default");
  const stored = useSyncExternalStore(
    (notify) => { window.addEventListener("storage", notify); window.addEventListener("trade-favorites", notify); return () => { window.removeEventListener("storage", notify); window.removeEventListener("trade-favorites", notify); }; },
    () => { try { return localStorage.getItem(storageKey) ?? "[]"; } catch { return "[]"; } },
    () => "[]",
  );
  const [temporary, setTemporary] = useState<string[] | null>(null);
  let favorites: string[] = temporary ?? [];
  if (!temporary) { try { const value: unknown = JSON.parse(stored); favorites = Array.isArray(value) ? value.filter((s): s is string => typeof s === "string") : []; } catch { /* 손상된 저장 값은 빈 목록으로 처리 */ } }
  function toggle(symbol: string) {
    const next = favorites.includes(symbol) ? favorites.filter(s => s !== symbol) : [...favorites, symbol];
    try { localStorage.setItem(storageKey, JSON.stringify(next)); window.dispatchEvent(new Event("trade-favorites")); setTemporary(null); } catch { setTemporary(next); }
  }
  const stocks = TRADING_STOCKS.filter(s => favoritesOnly || filter === "favorite" ? favorites.includes(s.symbol) : filter === "held" ? (holdings[s.symbol]?.qty ?? 0) > 0 : true).sort((a, b) => sort === "change" ? (prices?.stocks[b.symbol]?.changePct ?? -Infinity) - (prices?.stocks[a.symbol]?.changePct ?? -Infinity) : sort === "price" ? (prices?.stocks[b.symbol]?.mbPrice ?? 0) - (prices?.stocks[a.symbol]?.mbPrice ?? 0) : 0);
  return <div className="overflow-hidden rounded-2xl border border-[var(--md-sys-color-outline-variant)]">
    <div className="flex flex-wrap gap-2 bg-[var(--md-sys-color-surface-container)] p-3">
      {!favoritesOnly && <select aria-label="종목 필터" value={filter} onChange={e => setFilter(e.target.value)} className="min-w-0 flex-1 rounded-lg bg-[var(--md-sys-color-surface)] p-2 text-xs"><option value="all">전체 종목</option><option value="favorite">관심종목</option><option value="held">보유종목</option></select>}
      <select aria-label="종목 정렬" value={sort} onChange={e => setSort(e.target.value)} className="min-w-0 flex-1 rounded-lg bg-[var(--md-sys-color-surface)] p-2 text-xs"><option value="default">기본순</option><option value="change">등락률순</option><option value="price">현재가순</option></select>
    </div>
    <div className="flex justify-between px-3 py-2 text-[11px] text-[var(--md-sys-color-on-surface-variant)]"><span>관심 · 종목 / 보유</span><span>현재가 · 등락률</span></div>
    {stocks.map(s => { const q = prices?.stocks[s.symbol]; return <div key={s.symbol} className="flex items-center border-t border-[var(--md-sys-color-outline-variant)]" style={{ background: selected === s.symbol ? "var(--md-sys-color-primary-container)" : undefined }}>
      <button aria-label={`${s.alias} 관심종목 ${favorites.includes(s.symbol) ? "해제" : "추가"}`} aria-pressed={favorites.includes(s.symbol)} onClick={() => toggle(s.symbol)} className="min-h-11 w-10 shrink-0 text-lg text-[var(--md-sys-color-primary)]">{favorites.includes(s.symbol) ? "★" : "☆"}</button>
      <button onClick={() => onSelect(s.symbol)} aria-pressed={selected === s.symbol} className="flex min-w-0 flex-1 items-center justify-between gap-2 py-3 pr-3 text-left">
        <span className="min-w-0"><span className="block truncate text-sm font-bold">{s.alias}</span><span className="text-[11px]">{holdings[s.symbol]?.qty ? `${holdings[s.symbol].qty}주 보유` : "미보유"}</span></span>
        <span className="shrink-0 text-right tabular-nums"><span className="block text-sm font-bold">{q ? fmtMb(q.mbPrice) : "—"}</span><span className="text-xs" style={{ color: signColor(q?.changePct ?? 0) }}>{q ? fmtPct(q.changePct) : "시세 준비 중"}</span></span>
      </button>
    </div>; })}
    {!stocks.length && <p className="p-6 text-center text-sm">{favoritesOnly || filter === "favorite" ? "별표를 눌러 관심종목을 추가해 보세요." : "보유한 종목이 없습니다."}</p>}
  </div>;
}
