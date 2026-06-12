"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import {
  buyMarketItem,
  watchMarketItems,
  watchMyPurchases,
  type MarketItem,
  type Purchase,
} from "@/lib/market";
import { watchWallet, type ManboWallet } from "@/lib/manbo";

function fmtDate(ms: number | null) {
  if (!ms) return "";
  const d = new Date(ms);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/** 러닝마켓 — 학생이 만보(萬步)로 상품을 즉시 구매(서버가 잔액 차감) */
export function MarketStoreModal({
  cid,
  uid,
  onClose,
}: {
  cid: string;
  uid: string;
  onClose: () => void;
}) {
  const [wallet, setWallet] = useState<ManboWallet>({
    balance: 0,
    earned: 0,
    spent: 0,
  });
  const [items, setItems] = useState<MarketItem[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  // 구매 진행 중인 상품 id(중복 제출 방지)
  const [busyId, setBusyId] = useState<string | null>(null);
  // 방금 구매에 성공한 상품 id(짧은 "구매 완료!" 표시)
  const [doneId, setDoneId] = useState<string | null>(null);
  // 상품별 에러 메시지(잔액 부족 등)
  const [errId, setErrId] = useState<string | null>(null);
  const [errMsg, setErrMsg] = useState("");

  useEffect(() => {
    const offWallet = watchWallet(cid, uid, setWallet);
    const offItems = watchMarketItems(cid, setItems);
    const offPurchases = watchMyPurchases(cid, uid, setPurchases);
    return () => {
      offWallet();
      offItems();
      offPurchases();
    };
  }, [cid, uid]);

  async function buy(item: MarketItem) {
    if (busyId) return; // 다른 구매 진행 중 — 이중 제출 차단
    setBusyId(item.id);
    setErrId(null);
    setErrMsg("");
    setDoneId(null);
    try {
      await buyMarketItem(cid, item.id);
      setDoneId(item.id);
      setTimeout(() => setDoneId((cur) => (cur === item.id ? null : cur)), 1800);
    } catch (e) {
      setErrId(item.id);
      setErrMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  const activeItems = items.filter((it) => it.active === true);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-[rgba(0,0,0,0.32)] p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-[var(--md-sys-color-surface-container-high)] shadow-[var(--md-sys-elevation-3)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 — 제목 + 실시간 잔액 */}
        <div className="flex items-center gap-2 border-b border-[var(--md-sys-color-outline-variant)] px-5 py-4">
          <Icon
            name="storefront"
            size={22}
            className="text-[var(--md-sys-color-primary)]"
          />
          <p className="text-lg font-semibold">러닝마켓</p>
          <span className="ml-2 inline-flex items-center gap-1.5 rounded-full bg-[var(--md-sys-color-primary-container)] px-3 py-1 text-sm font-extrabold text-[var(--md-sys-color-on-primary-container)]">
            <Icon name="payments" size={16} />
            {wallet.balance.toLocaleString()} 만보
          </span>
          <button
            onClick={onClose}
            className="ml-auto flex h-9 w-9 items-center justify-center rounded-full text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-highest)]"
          >
            <Icon name="close" size={20} />
          </button>
        </div>

        <div className="flex flex-col gap-5 overflow-y-auto p-5">
          {/* 상품 목록 */}
          {activeItems.length === 0 ? (
            <p className="rounded-2xl bg-[var(--md-sys-color-surface-container)] px-3 py-10 text-center text-sm text-[var(--md-sys-color-on-surface-variant)]">
              아직 판매 중인 상품이 없어요.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {activeItems.map((item) => {
                const poor = wallet.balance < item.price;
                const isBusy = busyId === item.id;
                const isDone = doneId === item.id;
                const isErr = errId === item.id;
                return (
                  <div
                    key={item.id}
                    className="flex flex-col overflow-hidden rounded-2xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)]"
                  >
                    {item.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.imageUrl}
                        alt=""
                        className="h-32 w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-32 w-full items-center justify-center bg-[var(--md-sys-color-surface-container-highest)]">
                        <Icon
                          name="redeem"
                          size={40}
                          className="text-[var(--md-sys-color-on-surface-variant)]"
                        />
                      </div>
                    )}
                    <div className="flex flex-1 flex-col gap-1.5 p-4">
                      <p className="font-bold leading-tight">{item.title}</p>
                      {item.description && (
                        <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">
                          {item.description}
                        </p>
                      )}
                      <p className="mt-1 inline-flex items-center gap-1 text-base font-extrabold text-[var(--md-sys-color-primary)]">
                        <Icon name="payments" size={18} />
                        {item.price.toLocaleString()} 만보
                      </p>

                      {isErr && (
                        <p className="rounded-xl bg-[var(--md-sys-color-error-container)] px-3 py-2 text-xs text-[var(--md-sys-color-on-error-container)]">
                          {errMsg}
                        </p>
                      )}

                      <button
                        onClick={() => buy(item)}
                        disabled={poor || isBusy || !!busyId}
                        className={`mt-2 inline-flex items-center justify-center gap-1.5 rounded-2xl px-4 py-3 text-sm font-bold transition disabled:opacity-40 ${
                          isDone
                            ? "bg-[var(--md-sys-color-tertiary-container)] text-[var(--md-sys-color-on-tertiary-container)]"
                            : "bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)] hover:brightness-105"
                        }`}
                      >
                        {isDone ? (
                          <>
                            <Icon name="check_circle" size={18} fill />
                            구매 완료!
                          </>
                        ) : isBusy ? (
                          <>
                            <Icon name="hourglass_top" size={18} />
                            구매 중…
                          </>
                        ) : poor ? (
                          "만보 부족"
                        ) : (
                          <>
                            <Icon name="redeem" size={18} />
                            구매
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* 내 구매 내역 */}
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-sm font-bold">
              <Icon
                name="receipt_long"
                size={16}
                className="text-[var(--md-sys-color-primary)]"
              />
              내 구매 내역
              <span className="font-normal text-[var(--md-sys-color-on-surface-variant)]">
                {purchases.length}
              </span>
            </p>
            {purchases.length === 0 ? (
              <p className="rounded-xl bg-[var(--md-sys-color-surface-container)] px-3 py-6 text-center text-xs text-[var(--md-sys-color-on-surface-variant)]">
                아직 구매한 상품이 없어요.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {purchases.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center gap-2 rounded-xl bg-[var(--md-sys-color-surface-container)] px-3 py-2.5 text-sm"
                  >
                    <span className="w-9 shrink-0 text-xs text-[var(--md-sys-color-on-surface-variant)]">
                      {fmtDate(p.at)}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {p.title}
                    </span>
                    <span className="shrink-0 text-sm font-extrabold text-[var(--md-sys-color-primary)]">
                      -{p.price.toLocaleString()}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
