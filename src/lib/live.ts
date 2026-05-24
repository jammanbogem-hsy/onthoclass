// 실시간 교실 제어 — 교사 → 학생
//   classes/{cid}/signals/{uid}   : 특정 학생에게 보내는 1회성 효과(미션완료/레벨업)
//   classes/{cid}/control/lock    : 학급 전체 활동 잠금(Sandy 타이머)
import {
  collection,
  deleteField,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { getDbClient } from "@/lib/firebase";

// ---------- 개별 효과 신호 ----------
export type EffectKind = "mission" | "level";

export type EffectSignal = {
  kind: EffectKind;
  title: string;
  subtitle?: string;
  by: string;
  nonce: number; // 변경 감지용(같은 효과 재전송도 트리거)
};

const signalRef = (cid: string, uid: string) =>
  doc(getDbClient(), "classes", cid, "signals", uid);

/** 교사 → 학생: 효과 전달(학생 화면에서 즉시 축하 연출) */
export async function sendEffect(
  cid: string,
  uid: string,
  effect: { kind: EffectKind; title: string; subtitle?: string },
  by: string
): Promise<void> {
  await setDoc(signalRef(cid, uid), {
    kind: effect.kind,
    title: effect.title,
    subtitle: effect.subtitle ?? "",
    by,
    nonce: Date.now() + Math.floor(Math.random() * 1000),
    at: serverTimestamp(),
  });
}

/** 본인에게 온 효과 신호 구독 */
export function watchSignal(
  cid: string,
  uid: string,
  cb: (sig: EffectSignal | null) => void
): () => void {
  return onSnapshot(
    signalRef(cid, uid),
    (snap) => {
      if (!snap.exists()) return cb(null);
      const v = snap.data();
      cb({
        kind: (v.kind as EffectKind) ?? "mission",
        title: (v.title as string) ?? "",
        subtitle: (v.subtitle as string) || undefined,
        by: (v.by as string) ?? "",
        nonce: (v.nonce as number) ?? 0,
      });
    },
    () => cb(null)
  );
}

// ---------- 활동 잠금(Sandy 타이머) ----------
export type ActivityLock = {
  active: boolean;
  until: number | null; // epoch ms — 이 시각이 지나면 자동 해제
  startedAt: number | null;
  durationMs: number;
  by: string;
};

const lockRef = (cid: string) =>
  doc(getDbClient(), "classes", cid, "control", "lock");

/** 학급 전체 활동 잠금 켜기 — durationMs 동안 학생 활동 차단 */
export async function startLock(
  cid: string,
  durationMs: number,
  by: string
): Promise<void> {
  const now = Date.now();
  await setDoc(lockRef(cid), {
    active: true,
    startedAt: now,
    durationMs: Math.max(0, Math.floor(durationMs)),
    until: durationMs > 0 ? now + Math.floor(durationMs) : null,
    by,
    at: serverTimestamp(),
  });
}

/** 잠금 해제(교사가 도중에 끄기) */
export async function stopLock(cid: string): Promise<void> {
  await setDoc(
    lockRef(cid),
    { active: false, until: deleteField(), at: serverTimestamp() },
    { merge: true }
  );
}

export function watchLock(
  cid: string,
  cb: (lock: ActivityLock | null) => void
): () => void {
  return onSnapshot(
    lockRef(cid),
    (snap) => {
      if (!snap.exists()) return cb(null);
      const v = snap.data();
      cb({
        active: Boolean(v.active),
        until: typeof v.until === "number" ? (v.until as number) : null,
        startedAt: typeof v.startedAt === "number" ? (v.startedAt as number) : null,
        durationMs: (v.durationMs as number) ?? 0,
        by: (v.by as string) ?? "",
      });
    },
    () => cb(null)
  );
}
