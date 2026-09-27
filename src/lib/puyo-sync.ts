import { cloneState, parseState, type PuyoState } from "./puyo-engine";

/** One latest local recovery slot per player; no network acknowledgement needed. */
export function cachePuyo(storage: Storage, key: string, state: PuyoState, at: number) {
  try { storage.setItem("puyo-recovery", JSON.stringify({ key, state, at })); } catch { /* Storage may be unavailable. */ }
}
export function restorePuyo(storage: Storage, key: string, newerThan: number, now: number) {
  try {
    const saved = JSON.parse(storage.getItem("puyo-recovery") || "null");
    if (saved?.key !== key || typeof saved.at !== "number" || saved.at <= newerThan || saved.at > now + 1000 || now - saved.at > 900000) return null;
    return parseState(JSON.stringify(saved.state));
  } catch { return null; }
}

export const PUYO_SYNC_INTERVAL_MS = 250;
export const PUYO_INPUT_THROTTLE_MS = 80;

/** Latest-state queue: one write in flight, ordered sequences, no input waiting on I/O. */
export class PuyoPublisher {
  private wanted = false;
  private urgent = false;
  private writing = false;
  private disposed = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private lastStart = -Infinity;
  private seq: number;
  constructor(private readonly options: {
    seq: number;
    snapshot: () => PuyoState | null;
    write: (state: PuyoState, seq: number) => Promise<void>;
    saved: (state: PuyoState, elapsedMs: number) => void;
    error: () => void;
  }) { this.seq = options.seq; }
  request(urgent = false) {
    if (this.disposed) return;
    this.wanted = true; this.urgent ||= urgent;
    if (this.writing) return;
    if (this.timer) clearTimeout(this.timer);
    const delay = this.urgent ? 0 : Math.max(0, PUYO_INPUT_THROTTLE_MS - (performance.now() - this.lastStart));
    this.timer = setTimeout(() => { this.timer = undefined; void this.flush(); }, delay);
  }
  private async flush() {
    if (this.disposed || this.writing || !this.wanted) return;
    this.wanted = false; this.urgent = false;
    const current = this.options.snapshot();
    if (!current) return;
    const snapshot = cloneState(current);
    this.writing = true; this.lastStart = performance.now();
    try {
      await this.options.write(snapshot, this.seq + 1);
      this.seq++;
      if (!this.disposed) this.options.saved(snapshot, performance.now() - this.lastStart);
    } catch { if (!this.disposed) this.options.error(); }
    finally {
      this.writing = false;
      if (this.wanted && !this.disposed) this.request(this.urgent);
    }
  }
  dispose() { this.disposed = true; if (this.timer) clearTimeout(this.timer); }
}
