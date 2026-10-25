import { getFirestore } from "firebase-admin/firestore";
import { createHash } from "node:crypto";
import { WorkshopError } from "./service";
/** Atomic, bounded windows. Only hashes of IP/session identities are retained. */
export async function rateLimit(identity: string, limit: number, windowMs: number) {
  const now = Date.now(), window = Math.floor(now / windowMs);
  const id = createHash("sha256").update(identity).digest("hex");
  const ref = getFirestore().doc(`jamworldRateLimits/${id}`);
  await getFirestore().runTransaction(async tx => {
    const prev = (await tx.get(ref)).data(); const count = prev?.window === window ? prev.count : 0;
    if (count >= limit) throw new WorkshopError("rate_limit", "요청이 많아요. 잠시 쉬었다 다시 시도해 주세요.", 429);
    tx.set(ref, { window, count: count + 1, updatedAt: now });
  });
}
