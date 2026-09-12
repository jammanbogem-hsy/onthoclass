"use client";

// 교사 화면(투자 현황·주식대회) 공용 데이터 구독 — 학급 포지션·시세·체결 이력·지갑.
// 체결은 TRADE_HISTORY_MAX 까지 통째로 받는다: 기간 손익·실현손익 계산이 이력 재생
// (fillTradePnl)에 기대므로 목록이 잘리면 평단이 어긋난다.
import { usePageVisible } from "@/hooks/usePageVisible";
import { useEffect, useState } from "react";
import { watchAllWallets, type ManboWallet } from "@/lib/manbo";
import {
  TRADE_HISTORY_MAX,
  watchAllPositions,
  watchRecentTrades,
  watchTradingPrices,
  type Position,
  type Trade,
  type TradingPrices,
} from "@/lib/trading";

export type ClassTradingData = {
  positions: Array<{ uid: string } & Position>;
  prices: TradingPrices | null;
  /** 학급 전체 체결 — 최신순 */
  trades: Trade[];
  wallets: Record<string, ManboWallet>;
};

export function useClassTrading(cid: string): ClassTradingData {
  const visible = usePageVisible();
  const [positions, setPositions] = useState<Array<{ uid: string } & Position>>([]);
  const [prices, setPrices] = useState<TradingPrices | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [wallets, setWallets] = useState<Record<string, ManboWallet>>({});

  useEffect(() => {
    if (!visible) return;
    const offs = [
      watchAllPositions(cid, setPositions),
      watchTradingPrices(setPrices),
      watchRecentTrades(cid, setTrades, TRADE_HISTORY_MAX),
      watchAllWallets(cid, setWallets),
    ];
    return () => offs.forEach((off) => off());
  }, [cid, visible]);

  return { positions, prices, trades, wallets };
}
