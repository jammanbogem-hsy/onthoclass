"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Lottie from "lottie-react";
import { Icon } from "@/components/Icon";
import {
  buyMarketItem,
  watchMarketItems,
  watchMyPurchases,
  type MarketItem,
  type Purchase,
} from "@/lib/market";
import {
  cancelFunding,
  completeFunding,
  contributeFunding,
  createFunding,
  watchFundings,
  type Funding,
} from "@/lib/funding";
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
  const [fundings, setFundings] = useState<Funding[]>([]);
  // 구매 진행 중인 상품 id(중복 제출 방지)
  const [busyId, setBusyId] = useState<string | null>(null);
  // 방금 구매에 성공한 상품 id(짧은 "구매 완료!" 표시)
  const [doneId, setDoneId] = useState<string | null>(null);
  // 상품별 에러 메시지(잔액 부족 등)
  const [errId, setErrId] = useState<string | null>(null);
  const [errMsg, setErrMsg] = useState("");
  // 펀딩 개설(공동구매 열기) — 상품별 진행/에러
  const [openBusyId, setOpenBusyId] = useState<string | null>(null);
  const [openErrId, setOpenErrId] = useState<string | null>(null);
  const [openErrMsg, setOpenErrMsg] = useState("");
  // 펀딩 성공 축하 오버레이
  const [celebrate, setCelebrate] = useState(false);
  // 이미 축하를 띄운 펀딩 id(세션 내 1회만 재생) + 첫 스냅샷 시드 여부
  const celebratedRef = useRef<Set<string>>(new Set());
  const seededRef = useRef(false);

  useEffect(() => {
    const offWallet = watchWallet(cid, uid, setWallet);
    const offItems = watchMarketItems(cid, setItems);
    const offPurchases = watchMyPurchases(cid, uid, setPurchases);
    const offFundings = watchFundings(cid, (list) => {
      // 내가 개설했거나 참여한 펀딩만 축하 대상
      const involvesMe = (f: Funding) =>
        f.creatorUid === uid || f.contribs.some((c) => c.uid === uid);
      if (!seededRef.current) {
        // 첫(실제) 스냅샷: 이미 완료된 펀딩은 씨앗으로 담아 재입장 시 재생 방지
        for (const f of list) {
          if (f.status === "completed") celebratedRef.current.add(f.id);
        }
        seededRef.current = true;
      } else {
        for (const f of list) {
          if (
            f.status === "completed" &&
            involvesMe(f) &&
            !celebratedRef.current.has(f.id)
          ) {
            celebratedRef.current.add(f.id);
            setCelebrate(true);
          }
        }
      }
      setFundings(list);
    });
    return () => {
      offWallet();
      offItems();
      offPurchases();
      offFundings();
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

  async function openFunding(item: MarketItem) {
    if (openBusyId) return; // 이중 제출 차단
    setOpenBusyId(item.id);
    setOpenErrId(null);
    setOpenErrMsg("");
    try {
      await createFunding(cid, item.id);
    } catch (e) {
      setOpenErrId(item.id);
      setOpenErrMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setOpenBusyId(null);
    }
  }

  const dismissCelebrate = useCallback(() => setCelebrate(false), []);

  const activeItems = items.filter((it) => it.active === true);
  // 진행 중(모금/목표달성)인 펀딩만 눈에 띄게 — 완료/취소는 숨김
  const activeFundings = fundings.filter(
    (f) => f.status === "open" || f.status === "reached"
  );

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

                      {/* 함께 모으기 — 공동구매 펀딩 개설(가격 0 상품은 숨김) */}
                      {item.price > 0 && (
                        <>
                          <button
                            onClick={() => openFunding(item)}
                            disabled={openBusyId === item.id || !!openBusyId}
                            className="inline-flex items-center justify-center gap-1.5 rounded-2xl border border-[var(--md-sys-color-outline)] px-4 py-2.5 text-sm font-bold text-[var(--md-sys-color-primary)] transition hover:bg-[color-mix(in_srgb,var(--md-sys-color-primary)_8%,transparent)] disabled:opacity-40"
                          >
                            {openBusyId === item.id ? (
                              <>
                                <Icon name="hourglass_top" size={17} />
                                여는 중…
                              </>
                            ) : (
                              <>
                                <Icon name="savings" size={17} />
                                🤝 함께 모으기
                              </>
                            )}
                          </button>
                          {openErrId === item.id && (
                            <p className="rounded-xl bg-[var(--md-sys-color-error-container)] px-3 py-2 text-xs text-[var(--md-sys-color-on-error-container)]">
                              {openErrMsg}
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* 함께 사는 펀딩 — 진행 중인 공동구매 */}
          {activeFundings.length > 0 && (
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-sm font-bold">
                <Icon
                  name="savings"
                  size={16}
                  className="text-[var(--md-sys-color-primary)]"
                />
                함께 사는 펀딩
                <span className="font-normal text-[var(--md-sys-color-on-surface-variant)]">
                  {activeFundings.length}
                </span>
              </p>
              <div className="flex flex-col gap-3">
                {activeFundings.map((f) => (
                  <FundingCard
                    key={f.id}
                    cid={cid}
                    uid={uid}
                    funding={f}
                    walletBalance={wallet.balance}
                  />
                ))}
              </div>
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
                    {p.funded ? (
                      <span className="shrink-0 rounded-full bg-[var(--md-sys-color-tertiary-container)] px-2.5 py-1 text-xs font-bold text-[var(--md-sys-color-on-tertiary-container)]">
                        🤝 펀딩으로 획득
                      </span>
                    ) : (
                      <span className="shrink-0 text-sm font-extrabold text-[var(--md-sys-color-primary)]">
                        -{p.price.toLocaleString()}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* 펀딩 성공 축하 */}
      {celebrate && <FundingSuccessOverlay onDone={dismissCelebrate} />}
    </div>
  );
}

// ---------- 펀딩 카드(학생) ----------
function FundingCard({
  cid,
  uid,
  funding,
  walletBalance,
}: {
  cid: string;
  uid: string;
  funding: Funding;
  walletBalance: number;
}) {
  const isCreator = funding.creatorUid === uid;
  const remaining = Math.max(0, funding.goal - funding.raised);
  const pct =
    funding.goal > 0
      ? Math.min(100, Math.round((funding.raised / funding.goal) * 100))
      : 0;
  const maxGive = Math.min(remaining, walletBalance);

  // 참여 예정 금액(퀵버튼/입력으로 담아 한 번에 제출)
  const [amount, setAmount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);

  const clamp = (n: number) => Math.max(0, Math.min(maxGive, Math.floor(n) || 0));

  async function contribute() {
    const give = clamp(amount);
    if (give <= 0 || busy) return;
    setBusy(true);
    setErr("");
    try {
      await contributeFunding(cid, funding.id, give);
      setAmount(0);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function complete() {
    if (busy) return;
    setBusy(true);
    setErr("");
    try {
      await completeFunding(cid, funding.id);
      // 성공 시 상태가 completed로 바뀌며 목록에서 사라짐(언마운트)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  async function doCancel() {
    if (busy) return;
    setBusy(true);
    setErr("");
    try {
      await cancelFunding(cid, funding.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
      setConfirmCancel(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] p-4">
      {/* 헤더: 썸네일 + 제목 + 개설자 */}
      <div className="flex items-center gap-3">
        {funding.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={funding.imageUrl}
            alt=""
            className="h-12 w-12 shrink-0 rounded-xl object-cover ring-1 ring-[var(--md-sys-color-outline-variant)]"
          />
        ) : (
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--md-sys-color-surface-container-highest)] text-[var(--md-sys-color-on-surface-variant)]">
            <Icon name="redeem" size={22} />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold leading-tight">{funding.title}</p>
          <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
            <span className="font-semibold">
              {isCreator ? "내가" : funding.creatorName || "친구"}
            </span>{" "}
            개설
          </p>
        </div>
        {funding.status === "reached" && (
          <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-[var(--md-sys-color-tertiary-container)] px-2.5 py-1 text-xs font-bold text-[var(--md-sys-color-on-tertiary-container)]">
            <Icon name="celebration" size={14} fill />
            목표 달성
          </span>
        )}
      </div>

      {/* 진행 바 */}
      <div>
        <div className="mb-1 flex items-end justify-between text-sm">
          <span className="font-extrabold text-[var(--md-sys-color-primary)]">
            {funding.raised.toLocaleString()}
            <span className="text-[var(--md-sys-color-on-surface-variant)]">
              {" "}
              / {funding.goal.toLocaleString()} 만보
            </span>
          </span>
          <span className="font-bold text-[var(--md-sys-color-on-surface-variant)]">
            {pct}%
          </span>
        </div>
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-black/10">
          <div
            className="h-full rounded-full bg-[var(--md-sys-color-primary)] transition-[width]"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* 참여자 명단(이름 + 금액) — 개설자·참여자 모두 확인 */}
      <div className="rounded-xl bg-[var(--md-sys-color-surface-container-low)] px-3 py-2.5">
        <p className="mb-1.5 flex items-center gap-1 text-xs font-bold text-[var(--md-sys-color-on-surface-variant)]">
          <Icon name="group" size={14} />
          함께 모은 친구들
        </p>
        {funding.contribs.length === 0 ? (
          <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
            아직 참여한 친구가 없어요. 첫 번째로 모아 볼까요?
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {funding.contribs.map((c) => {
              const me = c.uid === uid;
              return (
                <span
                  key={c.uid}
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
                    me
                      ? "bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)]"
                      : "bg-[var(--md-sys-color-surface-container-highest)] text-[var(--md-sys-color-on-surface)]"
                  }`}
                >
                  {me ? "나" : c.name || "친구"}
                  <span className="font-extrabold">{c.amount.toLocaleString()}</span>
                </span>
              );
            })}
          </div>
        )}
      </div>

      {err && (
        <p className="rounded-xl bg-[var(--md-sys-color-error-container)] px-3 py-2 text-xs text-[var(--md-sys-color-on-error-container)]">
          {err}
        </p>
      )}

      {/* 참여 컨트롤 — 모금 중일 때만 */}
      {funding.status === "open" && (
        <div className="flex flex-col gap-2 rounded-xl bg-[var(--md-sys-color-surface-container-low)] p-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-[var(--md-sys-color-on-surface-variant)]">
              내 만보: {walletBalance.toLocaleString()}
            </span>
            <span className="text-[var(--md-sys-color-on-surface-variant)]">
              남은 목표 {remaining.toLocaleString()} 만보
            </span>
          </div>
          {maxGive <= 0 ? (
            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
              {remaining <= 0
                ? "목표를 거의 다 채웠어요!"
                : "만보가 부족해서 지금은 참여할 수 없어요."}
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-1.5">
                {[5, 10, 20].map((step) => (
                  <button
                    key={step}
                    type="button"
                    disabled={busy}
                    onClick={() => setAmount((a) => clamp(a + step))}
                    className="rounded-full border border-[var(--md-sys-color-outline)] px-3 py-1.5 text-sm font-bold text-[var(--md-sys-color-on-surface)] transition hover:bg-black/5 disabled:opacity-40"
                  >
                    +{step}
                  </button>
                ))}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setAmount(maxGive)}
                  className="rounded-full border border-[var(--md-sys-color-outline)] px-3 py-1.5 text-sm font-bold text-[var(--md-sys-color-on-surface)] transition hover:bg-black/5 disabled:opacity-40"
                >
                  남은 만큼 전부 ({maxGive.toLocaleString()})
                </button>
                <input
                  type="number"
                  min={0}
                  max={maxGive}
                  value={amount || ""}
                  onChange={(e) => setAmount(clamp(parseInt(e.target.value, 10)))}
                  placeholder="0"
                  className="w-20 rounded-xl border border-[var(--md-sys-color-outline)] bg-[var(--md-sys-color-surface)] px-3 py-1.5 text-sm font-bold text-[var(--md-sys-color-on-surface)]"
                />
              </div>
              <button
                type="button"
                onClick={contribute}
                disabled={busy || clamp(amount) <= 0}
                className="inline-flex items-center justify-center gap-1.5 rounded-2xl bg-[var(--md-sys-color-primary)] px-4 py-3 text-sm font-bold text-[var(--md-sys-color-on-primary)] transition hover:brightness-105 disabled:opacity-40"
              >
                <Icon name="savings" size={18} />
                {busy
                  ? "참여 중…"
                  : `${clamp(amount).toLocaleString()} 만보 모으기`}
              </button>
            </>
          )}
        </div>
      )}

      {/* 목표 달성 — 개설자는 최종 구매 확정, 나머지는 대기 안내 */}
      {funding.status === "reached" &&
        (isCreator ? (
          <button
            type="button"
            onClick={complete}
            disabled={busy}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[var(--md-sys-color-tertiary)] px-4 py-3.5 text-base font-extrabold text-[var(--md-sys-color-on-tertiary)] shadow-[var(--md-sys-elevation-1)] transition hover:brightness-105 disabled:opacity-40"
          >
            <Icon name="celebration" size={20} fill />
            {busy ? "구매 확정 중…" : "🎉 최종 구매하기"}
          </button>
        ) : (
          <p className="rounded-xl bg-[var(--md-sys-color-tertiary-container)] px-3 py-2.5 text-center text-sm font-semibold text-[var(--md-sys-color-on-tertiary-container)]">
            목표 달성! 개설자가 구매를 확정하면 완료돼요
          </p>
        ))}

      {/* 펀딩 취소 — 개설자만(모금/목표달성), 인라인 2탭 확인 */}
      {isCreator &&
        (funding.status === "open" || funding.status === "reached") &&
        (confirmCancel ? (
          <div className="flex flex-col gap-2 rounded-xl bg-[var(--md-sys-color-error-container)] p-3">
            <p className="text-xs font-semibold text-[var(--md-sys-color-on-error-container)]">
              펀딩을 취소하면 모인 만보가 참여한 친구 모두에게 돌아가요. 정말
              취소할까요?
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={doCancel}
                disabled={busy}
                className="flex-1 rounded-full bg-[var(--md-sys-color-error)] px-3 py-2 text-sm font-bold text-[var(--md-sys-color-on-error)] transition hover:brightness-105 disabled:opacity-40"
              >
                {busy ? "취소 중…" : "네, 취소해요"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmCancel(false)}
                disabled={busy}
                className="flex-1 rounded-full border border-[var(--md-sys-color-outline)] px-3 py-2 text-sm font-bold text-[var(--md-sys-color-on-surface)] transition hover:bg-black/5 disabled:opacity-40"
              >
                아니요
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmCancel(true)}
            className="self-start text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)] underline underline-offset-2 transition hover:text-[var(--md-sys-color-error)]"
          >
            펀딩 취소
          </button>
        ))}
    </div>
  );
}

// ---------- 펀딩 성공 축하 오버레이(Confetti Lottie) ----------
function FundingSuccessOverlay({ onDone }: { onDone: () => void }) {
  const [data, setData] = useState<object | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/Confetti.json")
      .then((r) => r.json())
      .then((d) => alive && setData(d))
      .catch(() => {});
    const t = setTimeout(onDone, 2500);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [onDone]);
  return (
    <div
      onClick={onDone}
      className="fixed inset-0 z-[80] flex flex-col items-center justify-center overflow-hidden bg-black/65 backdrop-blur-sm"
      role="dialog"
      aria-label="펀딩 성공"
    >
      <div className="pointer-events-none absolute inset-0">
        {data && (
          <Lottie
            animationData={data}
            loop={false}
            autoplay
            rendererSettings={{ preserveAspectRatio: "xMidYMid slice" }}
            style={{ width: "100%", height: "100%" }}
          />
        )}
      </div>
      <div className="relative z-10 flex flex-col items-center gap-3 px-4 text-center text-white">
        <p className="text-6xl">🎉</p>
        <p
          className="text-4xl font-black sm:text-5xl"
          style={{ textShadow: "0 3px 22px rgba(0,0,0,0.6)" }}
        >
          펀딩 성공!
        </p>
        <p
          className="text-lg font-bold text-white/90"
          style={{ textShadow: "0 2px 14px rgba(0,0,0,0.6)" }}
        >
          개설자는 친구들과 함께 나눠 주세요
        </p>
      </div>
    </div>
  );
}
