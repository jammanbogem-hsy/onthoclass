// 만보(萬步) — XP 와 병행하는 사용 가능한 재화(지갑)
// 학생이 양(+)의 경험치를 얻으면 같은 양의 만보를 함께 적립(earned)한다.
// 만보 사용(상점 구매)은 XP 를 깎지 않는다 — 두 원장(ledger)을 분리한다.
// 컬렉션:
//   classes/{cid}/manbo/{uid}          : { uid, balance, earned, spent, updatedAt }
//   classes/{cid}/manbo/{uid}/log/{id} : { type:"earn"|"spend", amount, reason, by, at }
import { collection, doc, onSnapshot } from "firebase/firestore";
import { getDbClient } from "@/lib/firebase";

export type ManboWallet = { balance: number; earned: number; spent: number };

const manboCol = (cid: string) =>
  collection(getDbClient(), "classes", cid, "manbo");
const manboDocRef = (cid: string, uid: string) =>
  doc(getDbClient(), "classes", cid, "manbo", uid);

function mapWallet(v: Record<string, unknown> | undefined): ManboWallet {
  return {
    balance: (v?.balance as number) ?? 0,
    earned: (v?.earned as number) ?? 0,
    spent: (v?.spent as number) ?? 0,
  };
}

// ---------- 지갑 읽기 ----------
export function watchWallet(
  cid: string,
  uid: string,
  cb: (w: ManboWallet) => void
): () => void {
  return onSnapshot(
    manboDocRef(cid, uid),
    (snap) => cb(mapWallet(snap.exists() ? snap.data() : undefined)),
    () => cb({ balance: 0, earned: 0, spent: 0 })
  );
}

export function watchAllWallets(
  cid: string,
  cb: (map: Record<string, ManboWallet>) => void
): () => void {
  return onSnapshot(
    manboCol(cid),
    (snap) => {
      const m: Record<string, ManboWallet> = {};
      snap.docs.forEach((d) => {
        m[d.id] = mapWallet(d.data());
      });
      cb(m);
    },
    () => cb({})
  );
}

export type ManboLogEntry = {
  id: string;
  type: "earn" | "spend";
  amount: number;
  reason: string;
  at: number | null;
};

export function watchManboLog(
  cid: string,
  uid: string,
  cb: (items: ManboLogEntry[]) => void,
  max = 30
): () => void {
  return onSnapshot(
    collection(manboDocRef(cid, uid), "log"),
    (snap) => {
      const list = snap.docs.map((d) => {
        const v = d.data();
        const ts = v.at as { toMillis?: () => number } | undefined;
        return {
          id: d.id,
          type: (v.type as "earn" | "spend") ?? "earn",
          amount: (v.amount as number) ?? 0,
          reason: (v.reason as string) ?? "",
          at: ts?.toMillis ? ts.toMillis() : null,
        };
      });
      list.sort((a, b) => (b.at ?? 0) - (a.at ?? 0));
      cb(list.slice(0, max));
    },
    () => cb([])
  );
}
