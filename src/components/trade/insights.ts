import type { Trade } from "@/lib/trading";

/** 체결 단가의 수량 가중평균. 수수료를 포함하는 보유 평단과 구분한다. */
export function averageTradePrices(trades: Trade[], symbol: string, from = 0) {
  const sum = { buy: { value: 0, qty: 0 }, sell: { value: 0, qty: 0 } };
  for (const t of trades) {
    if (t.symbol !== symbol || t.at == null || t.at < from || !Number.isFinite(t.qty) || t.qty <= 0 || !Number.isFinite(t.mbPrice) || t.mbPrice <= 0) continue;
    const bucket = sum[t.side];
    bucket.value += t.mbPrice * t.qty;
    bucket.qty += t.qty;
  }
  return {
    buy: sum.buy.qty ? sum.buy.value / sum.buy.qty : null,
    sell: sum.sell.qty ? sum.sell.value / sum.sell.qty : null,
  };
}

/** 비중의 분모는 현금 + 전체 주식 평가액. 수수료는 주문 후 총자산에서 차감된다. */
export function previewOrder(balance: number, portfolioValue: number, holdingQty: number, unit: number, qty: number, side: "buy" | "sell", fee: number) {
  if (![balance, portfolioValue, holdingQty, unit, qty, fee].every(Number.isFinite) || balance < 0 || portfolioValue < 0 || unit <= 0 || !Number.isInteger(qty) || qty <= 0 || fee < 0) return null;
  const subtotal = unit * qty;
  if (side === "sell" && qty > holdingQty) return null;
  const cash = side === "buy" ? balance - subtotal - fee : balance + Math.max(0, subtotal - fee);
  if (cash < 0) return null;
  const nextQty = holdingQty + (side === "buy" ? qty : -qty);
  const assets = balance + portfolioValue;
  const nextAssets = cash + portfolioValue + (side === "buy" ? subtotal : -subtotal);
  return { cash, nextQty, beforeWeight: assets > 0 ? holdingQty * unit / assets * 100 : 0, afterWeight: nextAssets > 0 ? nextQty * unit / nextAssets * 100 : 0 };
}
