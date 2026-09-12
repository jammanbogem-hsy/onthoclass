/** 여러 함수 인스턴스가 같은 집계를 동시에 계산하지 않도록 저장소에서 lease를 잡는다. */
export type CacheClaim<T> = { kind: "hit"; value: T } | { kind: "owner" } | { kind: "busy" };
export interface SharedCacheStore<T> {
  claim(token: string): Promise<CacheClaim<T>>;
  publish(token: string, value: T): Promise<void>;
  release(token: string): Promise<void>;
}
export async function loadSharedCache<T>(store: SharedCacheStore<T>, token: string, build: () => Promise<T>, wait: () => Promise<void> = () => new Promise(resolve => setTimeout(resolve, 250))): Promise<T> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const claim = await store.claim(token);
    if (claim.kind === "hit") return claim.value;
    if (claim.kind === "owner") {
      try {
        const value = await build();
        await store.publish(token, value);
        return value;
      } catch (error) {
        await store.release(token).catch(() => {});
        throw error;
      }
    }
    await wait();
  }
  throw new Error("랭킹을 갱신하고 있습니다. 잠시 후 다시 시도해 주세요.");
}

export function sumBuyTotal(trades: Array<{ side?: string; total?: number }>): number {
  return trades.reduce((sum, trade) => trade.side === "buy" && typeof trade.total === "number" && Number.isFinite(trade.total) && trade.total >= 0 ? sum + trade.total : sum, 0);
}
export function hasInvested(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}
