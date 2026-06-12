// 만보 상점 — 교사가 판매 상품을 등록하고 학생이 만보로 구매한다.
// 구매는 Cloud Function(buyMarketItem)이 트랜잭션으로 잔액을 차감·기록한다(클라이언트 직접 차감 금지).
// 컬렉션:
//   classes/{cid}/market/{itemId}     : { title, description, price, imageUrl, active, order, createdBy, createdAt, updatedAt }
//   classes/{cid}/purchases/{pid}     : { itemId, title, price, buyerUid, buyerName, at }
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import type { User } from "firebase/auth";
import { getDbClient, getFunctionsClient } from "@/lib/firebase";

export type MarketItem = {
  id: string;
  title: string;
  description: string;
  price: number;
  imageUrl: string;
  active: boolean;
  order: number;
  createdAt: number | null;
};

const marketCol = (cid: string) =>
  collection(getDbClient(), "classes", cid, "market");
const purchasesCol = (cid: string) =>
  collection(getDbClient(), "classes", cid, "purchases");

function mapItem(id: string, v: Record<string, unknown>): MarketItem {
  const ts = v.createdAt as { toMillis?: () => number } | undefined;
  return {
    id,
    title: (v.title as string) ?? "",
    description: (v.description as string) ?? "",
    price: (v.price as number) ?? 0,
    imageUrl: (v.imageUrl as string) ?? "",
    active: (v.active as boolean) ?? false,
    order: (v.order as number) ?? 0,
    createdAt: ts?.toMillis ? ts.toMillis() : null,
  };
}

// ---------- 상품 관리(교사) ----------
export async function createMarketItem(
  cid: string,
  data: { title: string; description: string; price: number; imageUrl?: string },
  user: User
): Promise<string> {
  const ref = doc(marketCol(cid));
  await setDoc(ref, {
    title: data.title.trim() || "새 상품",
    description: data.description.trim(),
    price: Math.max(0, Math.floor(data.price || 0)),
    imageUrl: data.imageUrl ?? "",
    active: true,
    order: Date.now(),
    createdBy: user.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateMarketItem(
  cid: string,
  itemId: string,
  patch: Partial<
    Pick<MarketItem, "title" | "description" | "price" | "imageUrl" | "active" | "order">
  >
): Promise<void> {
  await updateDoc(doc(marketCol(cid), itemId), {
    ...patch,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteMarketItem(
  cid: string,
  itemId: string
): Promise<void> {
  await deleteDoc(doc(marketCol(cid), itemId));
}

/**
 * 상품을 다른 학급들로 복사 — 각 대상 학급에 독립적인 새 상품 문서를 만든다.
 * 구매 내역은 복사하지 않는다. order 는 원본의 상대 순서를 보존하되(item.order),
 * 없으면 createMarketItem 과 동일하게 epoch-ms 로 증가 부여한다.
 */
export async function copyMarketItemsToClasses(
  srcCid: string,
  destCids: string[],
  items: MarketItem[],
  user: User
): Promise<void> {
  const db = getDbClient();
  const dests = [...new Set(destCids)].filter((c) => c && c !== srcCid);
  if (dests.length === 0 || items.length === 0) return;
  const active = items.filter((it) => it.active);
  if (active.length === 0) return;
  for (const destCid of dests) {
    const batch = writeBatch(db);
    let fallback = Date.now();
    for (const it of active) {
      const ref = doc(marketCol(destCid));
      batch.set(ref, {
        title: it.title,
        description: it.description,
        price: it.price,
        imageUrl: it.imageUrl,
        active: true,
        order: it.order || fallback++,
        createdBy: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  }
}

export function watchMarketItems(
  cid: string,
  cb: (items: MarketItem[]) => void
): () => void {
  return onSnapshot(
    marketCol(cid),
    (snap) => {
      const list = snap.docs.map((d) => mapItem(d.id, d.data()));
      list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      cb(list);
    },
    () => cb([])
  );
}

// ---------- 구매(학생) — Cloud Function 트랜잭션 ----------
export async function buyMarketItem(
  cid: string,
  itemId: string
): Promise<{ ok: true; balance: number }> {
  try {
    const fn = httpsCallable<
      { cid: string; itemId: string },
      { ok: true; balance: number }
    >(getFunctionsClient(), "buyMarketItem");
    const res = await fn({ cid, itemId });
    return res.data;
  } catch (err) {
    const msg = (err as { message?: string })?.message;
    throw new Error(msg || "구매에 실패했습니다.");
  }
}

// ---------- 구매 내역 ----------
export type Purchase = {
  id: string;
  itemId: string;
  title: string;
  price: number;
  buyerUid: string;
  buyerName: string;
  at: number | null;
};

function mapPurchase(id: string, v: Record<string, unknown>): Purchase {
  const ts = v.at as { toMillis?: () => number } | undefined;
  return {
    id,
    itemId: (v.itemId as string) ?? "",
    title: (v.title as string) ?? "",
    price: (v.price as number) ?? 0,
    buyerUid: (v.buyerUid as string) ?? "",
    buyerName: (v.buyerName as string) ?? "",
    at: ts?.toMillis ? ts.toMillis() : null,
  };
}

export function watchPurchases(
  cid: string,
  cb: (items: Purchase[]) => void
): () => void {
  return onSnapshot(
    purchasesCol(cid),
    (snap) => {
      const list = snap.docs.map((d) => mapPurchase(d.id, d.data()));
      list.sort((a, b) => (b.at ?? 0) - (a.at ?? 0));
      cb(list);
    },
    () => cb([])
  );
}

export function watchMyPurchases(
  cid: string,
  uid: string,
  cb: (items: Purchase[]) => void
): () => void {
  return onSnapshot(
    query(purchasesCol(cid), where("buyerUid", "==", uid)),
    (snap) => {
      const list = snap.docs.map((d) => mapPurchase(d.id, d.data()));
      list.sort((a, b) => (b.at ?? 0) - (a.at ?? 0));
      cb(list);
    },
    () => cb([])
  );
}
