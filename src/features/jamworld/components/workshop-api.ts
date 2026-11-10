import { getAuthClient, isFirebaseConfigured } from "@/lib/firebase";
// 공방 클라이언트 API (서버가 역할·권한을 판정하므로 여기에는 역할 정보를 싣지 않는다)
import type { AvatarLook } from "@/features/jamworld/lib/server/workshop/avatar";
import type { CharacterSheets } from "../lib/server/workshop/character-sprite";
import type { CostSummary } from "@/features/jamworld/lib/server/workshop/pricing";
import type {
  LibraryManifest,
  RequestDraft,
  RequestStatus,
} from "@/features/jamworld/lib/server/workshop/types";

export interface Me {
  role: "teacher" | "student" | "pending-teacher" | null;
  /** Personal default for both students and teachers, resolved from saved assets. */
  avatar?: AvatarLook | null;
  teacher?: { id: string; name: string };
  student?: {
    id: string;
    nickname: string;
    classId: string;
    className: string;
    avatar: AvatarLook | null;
  };
  identity?: { name: string };
  status: {
    db: boolean;
    files: boolean;
    imageGeneration: boolean;
    imageModel: string;
  };
}

export interface RequestView {
  id: string;
  creatorRole?: "teacher" | "student";
  status: RequestStatus;
  rev: number;
  version: number;
  nickname?: string;
  draft: RequestDraft;
  uploadUrl: string | null;
  submitted: {
    version: number;
    draft: RequestDraft;
    uploadUrl: string | null;
    outputs: string[];
  } | null;
  approved: {
    version: number;
    draft: RequestDraft;
    uploadUrl: string | null;
    outputs: string[];
    at: number | null;
  } | null;
  rejectReason: string | null;
  attempts: number;
  generation: {
    id: string;
    status: "queued" | "running" | "succeeded" | "failed";
    attempt: number;
    error: string | null;
    model: string;
    startedAt: number;
    outputs: {
      texture: string | null;
      td: string | null;
      iso: string | null;
      sprites?: CharacterSheets;
    } | null;
    cost?: (CostSummary & { computedAt: number }) | null;
    calls?: number;
  } | null;
  updatedAt: number;
}

export type LibraryAsset = LibraryManifest & {
  urls: {
    texture?: string | null;
    td?: string | null;
    iso?: string | null;
    tdSheet?: string | null;
    isoSheet?: string | null;
  };
};

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function api<T>(
  path: string,
  init?: RequestInit & { json?: unknown },
): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.json !== undefined) headers.set("content-type", "application/json");
  if (isFirebaseConfigured) {
    const auth = getAuthClient();
    await auth.authStateReady();
    if (auth.currentUser && !auth.currentUser.isAnonymous)
      headers.set(
        "authorization",
        `Bearer ${await auth.currentUser.getIdToken()}`,
      );
  }
  if (path.endsWith("/workshop/logout")) rememberLook(null);
  const res = await fetch(path, {
    ...init,
    headers,
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
  });
  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    code?: string;
  };
  // 세션이 끝났으면(시간이 지났거나 선생님이 내보냄) 화면이 로그인 상태를 다시 확인한다
  if (res.status === 401 && typeof window !== "undefined") {
    rememberLook(null);
    window.dispatchEvent(new Event("jamworld:unauthorized"));
  }
  if (!res.ok)
    throw new ApiError(
      data.error ?? `요청 실패 (${res.status})`,
      res.status,
      data.code,
    );
  return data as T;
}

// 마지막 아바타를 이 기기에 기억 — 맵에 들어갈 때 서버 답을 기다리지 않고 바로 내 캐릭터로 시작(로그아웃·세션 만료 때 지움)
const LOOK_KEY = "jamworld:look";
export function rememberLook(look: AvatarLook | null | undefined) {
  try {
    if (look) localStorage.setItem(LOOK_KEY, JSON.stringify(look));
    else localStorage.removeItem(LOOK_KEY);
  } catch { /* 저장소를 못 써도 서버 값으로 동작 */ }
}
export function cachedLook(): AvatarLook | null {
  try { return JSON.parse(localStorage.getItem(LOOK_KEY) ?? "null") as AvatarLook | null; } catch { return null; }
}
export const getMe = () => api<Me>("/api/jamworld/workshop/me").then(me => {
  rememberLook(me.avatar ?? me.student?.avatar ?? null);
  return me;
});

/** Approval can be committed with the durable generation request in one round trip. */
export async function runGenerate(
  id: string,
  onEvent: (event: string, data: Record<string, unknown>) => void,
  signal?: AbortSignal,
  approveRev?: number,
  quoteId?: string,
) {
  const key = `ui-${crypto.randomUUID()}`;
  const result = await api<{
    generationId: string;
    started: boolean;
    status: string;
  }>(`/api/jamworld/workshop/requests/${id}/generate`, {
    method: "POST",
    headers: { "idempotency-key": key },
    signal,
    json: { ...(approveRev === undefined ? {} : { approveRev }), quoteId },
  });
  onEvent("status", result);
  onEvent("info", {
    message:
      result.status === "queued"
        ? "요청을 접수했어요. 그림 생성을 준비하고 있어요."
        : "그림을 만들고 있어요.",
  });
}

/**
 * 도우미 맵 제작 — 오래 걸려(1~3분) 호스팅의 60초 제한에 끊기지 않도록
 * 작업을 맡기고(202) 2초마다 끝났는지 확인한다. 결과·오류는 바로 부르는 api()와 같다.
 */
export async function agentRequest<T>(json: unknown, signal?: AbortSignal): Promise<T> {
  const { jobId } = await api<{ jobId: string }>("/api/jamworld/agent/jobs", { method: "POST", json, signal });
  const startedAt = Date.now();
  for (;;) {
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(resolve, 2000);
      signal?.addEventListener("abort", () => {
        clearTimeout(t);
        reject(new DOMException("취소했어요", "AbortError"));
      }, { once: true });
    });
    const r = await api<T & { status?: string }>(`/api/jamworld/agent/jobs/${jobId}`, { signal });
    if (r.status !== "queued" && r.status !== "running") return r as T;
    if (Date.now() - startedAt > 10 * 60_000) throw new ApiError("도우미 응답이 너무 오래 걸려요. 잠시 뒤 다시 시도해 주세요", 504);
  }
}
