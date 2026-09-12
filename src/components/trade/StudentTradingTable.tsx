"use client";

import { useState } from "react";
import type { TradingStats } from "@/lib/trading";
import { pnlStyleFixed, signed } from "./util";

type Row = TradingStats & { balance: number; name: string };
export function StudentTradingTable({ rows, periodLabel, onSelect }: { rows: Row[]; periodLabel: string; onSelect: (uid: string) => void }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("name");
  const visible = rows.filter(r => r.name.toLowerCase().includes(query.toLowerCase())).sort((a, b) => {
    if (sort === "pnl") return b.totalPnl - a.totalPnl;
    if (sort === "trades") return b.period.buyCount + b.period.sellCount - a.period.buyCount - a.period.sellCount;
    if (sort === "weight") return weight(b) - weight(a);
    return a.name.localeCompare(b.name, "ko");
  });
  function weight(r: Row) { return r.balance + r.value > 0 ? (r.holdings[0]?.value ?? 0) / (r.balance + r.value) * 100 : 0; }
  const num = (n: number) => Math.round(n).toLocaleString("ko-KR");
  return <section>
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <h3 className="mr-auto font-bold">학생별 통합표 <span className="text-xs font-normal">{visible.length} / {rows.length}명</span></h3>
      <input aria-label="학생 이름 검색" placeholder="학생 이름 검색" value={query} onChange={e => setQuery(e.target.value)} className="w-36 rounded-lg border border-[var(--md-sys-color-outline-variant)] bg-transparent px-3 py-2 text-sm" />
      <select aria-label="학생 정렬" value={sort} onChange={e => setSort(e.target.value)} className="rounded-lg border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] px-3 py-2 text-sm">
        <option value="name">이름순</option><option value="pnl">총손익순</option><option value="trades">기간 매매 횟수순</option><option value="weight">최대 종목 비중순</option>
      </select>
    </div>
    <div className="max-h-[55vh] overflow-auto rounded-xl border border-[var(--md-sys-color-outline-variant)]" tabIndex={0} role="region" aria-label="학생별 투자 현황 표, 가로 스크롤 가능">
      <table className="w-full min-w-[1080px] border-collapse text-right text-sm tabular-nums">
        <caption className="sr-only">학생별 현금, 주식 평가액, 손익, 거래 횟수와 수수료. 금액 단위 만보.</caption>
        <thead className="sticky top-0 z-10 bg-[var(--md-sys-color-surface-container-highest)] text-xs"><tr>
          {["학생", "현금", "주식 평가액", "총자산", "총손익", "평가손익", "누적 실현손익", `${periodLabel} 실현손익`, `${periodLabel} 매매`, `${periodLabel} 수수료`, "최대 비중 종목"].map(label => <th key={label} scope="col" className="whitespace-nowrap px-3 py-3 first:text-left">{label}</th>)}
        </tr></thead>
        <tbody>{visible.map(r => <tr key={r.uid} className="border-t border-[var(--md-sys-color-outline-variant)] hover:bg-[var(--md-sys-color-surface-container)]">
          <th scope="row" className="px-3 py-3 text-left"><button onClick={() => onSelect(r.uid)} className="whitespace-nowrap font-bold text-[var(--md-sys-color-primary)] underline underline-offset-4">{r.name}</button>{r.tradeCount === 0 && r.holdings.length === 0 && <span className="mt-1 block text-[10px] font-normal">거래 없음</span>}</th>
          <td className="px-3 py-3">{num(r.balance)}</td><td className="px-3 py-3">{num(r.value)}</td><td className="px-3 py-3 font-bold">{num(r.balance + r.value)}</td>
          <td className="px-3 py-3 font-bold" style={pnlStyleFixed(r.totalPnl)}>{signed(r.totalPnl)}</td><td className="px-3 py-3" style={pnlStyleFixed(r.unrealized)}>{signed(r.unrealized)}</td><td className="px-3 py-3" style={pnlStyleFixed(r.realized)}>{signed(r.realized)}</td><td className="px-3 py-3" style={pnlStyleFixed(r.period.realized)}>{signed(r.period.realized)}</td>
          <td className="px-3 py-3">{r.period.buyCount + r.period.sellCount}회</td><td className="px-3 py-3">{num(r.period.fee)}</td>
          <td className="whitespace-nowrap px-3 py-3">{r.holdings[0] ? <>{r.holdings[0].stock?.alias ?? "종목"} <b>{weight(r).toFixed(1)}%</b></> : "—"}</td>
        </tr>)}</tbody>
      </table>
      {!visible.length && <p className="p-8 text-center text-sm">조건에 맞는 학생이 없습니다.</p>}
    </div>
    <p className="mt-2 text-xs text-[var(--md-sys-color-on-surface-variant)]">금액: 만보 · 최대 비중: 현금 포함 총자산 기준 · 학생 이름을 누르면 계좌 상세 · 거래·수수료·기간 실현손익만 선택 기간 적용</p>
  </section>;
}
