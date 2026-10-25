import {
  FieldValue,
  getFirestore,
  type DocumentReference,
} from "firebase-admin/firestore";

export type WorkshopScope = { kind: "class" | "student"; id: string };
const signalRef = (scope: WorkshopScope) =>
  getFirestore()
    .collection("jamworldWorkshopSignals")
    .doc(`${scope.kind}-${scope.id}`);

/** The signal and the state change commit together, so a reconnect cannot miss an update. */
export function touchWorkshop(
  writer: {
    set(
      ref: DocumentReference,
      data: Record<string, unknown>,
      options: { merge: true },
    ): unknown;
  },
  classId: string,
  studentId?: string,
) {
  for (const scope of [
    { kind: "class" as const, id: classId },
    ...(studentId ? [{ kind: "student" as const, id: studentId }] : []),
  ])
    writer.set(
      signalRef(scope),
      { rev: FieldValue.increment(1) },
      { merge: true },
    );
}
export async function workshopRevision(scope: WorkshopScope) {
  return Number((await signalRef(scope).get()).data()?.rev) || 0;
}
export async function waitForWorkshopChange(
  scope: WorkshopScope,
  after: number,
  signal: AbortSignal,
) {
  await new Promise<void>((resolve, reject) => {
    let unsubscribe = () => {},
      settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unsubscribe();
      signal.removeEventListener("abort", abort);
      if (error) reject(error);
      else resolve();
    };
    const abort = () => finish(),
      timer = setTimeout(finish, 20000);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) {
      finish();
      return;
    }
    unsubscribe = signalRef(scope).onSnapshot(
      (snap) => {
        if ((Number(snap.data()?.rev) || 0) !== after) finish();
      },
      (error) => finish(error),
    );
    if (settled) unsubscribe();
  });
}
