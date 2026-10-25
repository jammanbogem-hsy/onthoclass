"use client";
import GenerationControl from "./generation-control";

import { GlassButton, GlassLink } from "./glass-surface";

/* Private image endpoints require the viewer's same-origin session cookie. */
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEFAULT_LOOK,
} from "@/features/jamworld/lib/server/workshop/avatar";
import {
  ASSET_CATEGORIES,
  CATEGORY_KO,
  STATUS_LABEL,
  type RequestDraft,
  type RequestStatus,
} from "@/features/jamworld/lib/server/workshop/types";
import GlassSurface from "./glass-surface";
import AvatarPreview from "./avatar-preview";
import { useWorkshopFeed } from "./use-workshop-feed";
import AssetLibrary from "./asset-library";
import type { CharacterSheets } from "../lib/server/workshop/character-sprite";
import {
  api,
  runGenerate,
  type Me,
  type RequestView,
} from "./workshop-api";

const EMPTY_DRAFT: RequestDraft = {
  name: "",
  description: "",
  category: "furniture",
  tags: [],
  footprint: { w: 1, d: 1 },
  passable: false,
  height: 1,
};

const STATUS_CHIP: Record<RequestStatus, string> = {
  draft: "",
  pending: "warn",
  rejected: "coral",
  approved: "teal",
  generating: "teal",
  generated: "teal",
  failed: "coral",
  saved: "teal",
  discarded: "",
};

/** 승인 전 안내용: medium 1024² 출력 약 439 토큰 × gpt-image-2.5-flare 출력 단가 $30/1M (요금표 2026-10-20). 실제 금액은 생성 후 usage 로 계산 */


const timeText = (t: number) =>
  new Date(t).toLocaleString("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

function useToast() {
  const [toast, setToast] = useState<{ text: string; err?: boolean } | null>(
    null,
  );
  const show = useCallback((text: string, err = false) => {
    setToast({ text, err });
    window.setTimeout(
      () => setToast((t) => (t?.text === text ? null : t)),
      err ? 4500 : 2500,
    );
  }, []);
  const node = toast ? (
    <div className={`toast ${toast.err ? "err" : ""}`} role="status">
      {toast.text}
    </div>
  ) : null;
  return { show, node };
}

export default function Workshop({
  me,
}: {
  me: Me;
}) {
  return (
    <main className="dash ws">
      <div className="studio-heading">
        <div>
          <h1>{me.role === "teacher" ? "우리 반 공방" : "무엇을 만들까요?"}</h1>
          <p>
            {me.role === "teacher"
              ? "공방을 열고 학생들의 제작 요청을 확인해 주세요."
              : `${me.student?.className} · 만들고 싶은 그림을 말해 보세요.`}
          </p>
        </div>
        <span className="studio-badge">
          {me.role === "teacher"
            ? "선생님 공간"
            : `${me.student?.nickname}의 작업실`}
        </span>
      </div>
      {me.role === "student" && <StudentHome me={me} />}
      {me.role === "teacher" && <TeacherHome me={me} />}
    </main>
  );
}

// ======================= 학생 =======================

function StudentHome({ me }: { me: Me }) {
  const [tab, setTab] = useState<"studio" | "library">(() => {
    const t =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("tab")
        : null;
    return t === "library" ? t : "studio";
  });
  return (
    <>
      <div className="tabs ws-tabs" role="tablist">
        {(
          [
            ["studio", "만들기"],
            ["library", "내 에셋"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            className={tab === id ? "on" : ""}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {/* 탭을 바꿔도 대화·작성 중 카드가 사라지지 않도록 마운트 유지 */}
      <div hidden={tab !== "studio"}>
        <Studio me={me} active={tab === "studio"} />
      </div>
      <div hidden={tab !== "library"}>
        {tab === "library" && <AssetLibrary mine onRemade={request => {
          setTab("studio");
          window.dispatchEvent(new CustomEvent("jamworld-edit-request", { detail: request }));
        }} />}
      </div>
    </>
  );
}

interface ChatTurn {
  role: "user" | "assistant";
  text: string;
  model?: string;
}

function Studio({ me, active }: { me: Me; active: boolean }) {
  const { show, node } = useToast();
  const [requests, setRequests] = useState<RequestView[]>([]);
  const [savedAssets, setSavedAssets] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<{
    id: string | null;
    draft: RequestDraft;
  }>(() => ({ id: null, draft: typeof window !== "undefined" && new URLSearchParams(window.location.search).get("category") === "character" ? { ...EMPTY_DRAFT, category: "character", passable: true } : EMPTY_DRAFT }));
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [text, setText] = useState("");
  const [thinking, setThinking] = useState(false);
  const chatProvider = "openai";
  const [pendingCard, setPendingCard] = useState<RequestDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useWorkshopFeed(
    "/api/jamworld/workshop/requests",
    (data) => {
      if (data.requests) setRequests(data.requests);
    },
    (message) => show(message, true),
    active,
  );
  useEffect(() => {
    const open = (event: Event) => {
      const request = (event as CustomEvent<RequestView>).detail;
      setRequests((prev) => [
        request,
        ...prev.filter((r) => r.id !== request.id),
      ]);
      setEditing({ id: request.id, draft: request.draft });
      show(
        "원래 그림을 넣어 초안을 만들었어요. 확인하고 선생님께 요청해 주세요",
      );
    };
    window.addEventListener("jamworld-edit-request", open);
    return () => window.removeEventListener("jamworld-edit-request", open);
  }, [show]);
  const current = editing.id
    ? (requests.find((r) => r.id === editing.id) ?? null)
    : null;
  const editable =
    !current || current.status === "draft" || current.status === "rejected";

  const send = async () => {
    const t = text.trim();
    if (!t || thinking) return;
    const next = [...turns, { role: "user" as const, text: t }];
    setTurns(next);
    setText("");
    setThinking(true);
    try {
      const r = await api<{
        reply: string;
        card: RequestDraft | null;
        model: string;
      }>("/api/jamworld/workshop/assist", {
        method: "POST",
        json: {
          turns: next.map(({ role, text }) => ({ role, text })),
          provider: chatProvider,
        },
      });
      setTurns((x) => [
        ...x,
        { role: "assistant", text: r.reply, model: r.model },
      ]);
      if (r.card) setPendingCard(r.card);
    } catch (e) {
      setTurns((x) => [
        ...x,
        {
          role: "assistant",
          text: e instanceof Error ? e.message : "도우미가 답하지 못했어요",
        },
      ]);
    } finally {
      setThinking(false);
    }
  };

  const saveDraft = async (): Promise<RequestView | null> => {
    setBusy(true);
    try {
      if (!editing.id) {
        const r = await api<{ request: RequestView }>(
          "/api/jamworld/workshop/requests",
          {
            method: "POST",
            json: {
              draft: {
                ...editing.draft,
                tags: editing.draft.tags.length
                  ? editing.draft.tags
                  : [editing.draft.name.trim().slice(0, 12)],
              },
            },
          },
        );
        setEditing({ id: r.request.id, draft: r.request.draft });
        load();
        show("초안을 저장했어요");
        return r.request;
      }
      const r = await api<{ request: RequestView }>(
        `/api/jamworld/workshop/requests/${editing.id}`,
        {
          method: "PATCH",
          json: {
            rev: current?.rev,
            draft: {
              ...editing.draft,
              tags: editing.draft.tags.length
                ? editing.draft.tags
                : [editing.draft.name.trim().slice(0, 12)],
            },
          },
        },
      );
      setEditing({ id: r.request.id, draft: r.request.draft });
      load();
      show("초안을 저장했어요");
      return r.request;
    } catch (e) {
      show(e instanceof Error ? e.message : "저장하지 못했어요", true);
      return null;
    } finally {
      setBusy(false);
    }
  };

  const upload = async (file: File) => {
    let req = current;
    if (!req) req = await saveDraft();
    if (!req) return;
    if (file.size > 4 * 1024 * 1024)
      return show("그림 파일은 4MB 이하만 올릴 수 있어요", true);
    setBusy(true);
    try {
      await api(
        `/api/jamworld/workshop/requests/${req.id}/upload?rev=${req.rev}`,
        {
          method: "POST",
          body: file,
          headers: { "content-type": file.type || "application/octet-stream" },
        },
      );
      load();
      show("그림을 첨부했어요");
    } catch (e) {
      show(e instanceof Error ? e.message : "올리지 못했어요", true);
    } finally {
      setBusy(false);
    }
  };

  const act = async (r: RequestView, action: string, msg: string) => {
    setBusy(true);
    try {
      const result = await api<{ request: RequestView; assetId?: string }>(
        `/api/jamworld/workshop/requests/${r.id}/action`,
        {
          method: "POST",
          json: { action, rev: r.rev },
        },
      );
      setRequests((prev) =>
        prev.some(
          (p) => p.id === result.request.id && p.rev > result.request.rev,
        )
          ? prev
          : [result.request, ...prev.filter((p) => p.id !== result.request.id)],
      );
      if (result.assetId) {
        setSavedAssets(prev => ({ ...prev, [r.id]: result.assetId! }));
        window.dispatchEvent(new Event("jamworld-assets"));
      }
      load();
      show(msg);
    } catch (e) {
      show(e instanceof Error ? e.message : "처리하지 못했어요", true);
      load();
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    const r = await saveDraft();
    if (r)
      await act(r, "submit", "선생님께 요청했어요. 승인되면 그림을 만들어요");
  };

  return (
    <div className="ws-studio">
      <GlassSurface
        className="card ws-chat"
        contentClassName="ws-chat-content"
        frost={0.1}
        role="region"
        aria-label="공방 도우미 대화"
      >
        <div className="row ws-chat-head">
          <b style={{ fontSize: 13 }}>공방 도우미</b>
        </div>
        <div className="ws-chat-log">
          <div className="msg agent">
            “무지개 책장을 만들고 싶어!”처럼 말해 보세요. 아래 카드에 직접
            적어도 돼요.
          </div>
          {turns.map((t, i) => (
            <div
              key={i}
              className={`msg ${t.role === "user" ? "user" : "agent"}`}
            >
              {t.text}
            </div>
          ))}
          {thinking && <div className="msg agent">생각하는 중…</div>}
          {pendingCard && (
            <div className="preview-bar">
              <b>도우미가 제안한 카드</b>
              <div style={{ fontSize: 13 }}>
                {pendingCard.name} · {CATEGORY_KO[pendingCard.category]} ·{" "}
                {pendingCard.tags.join(", ")}
              </div>
              <div className="row">
                <GlassButton
                  className="btn primary sm"
                  disabled={!editable}
                  onClick={() => {
                    setEditing((e) => ({ ...e, draft: pendingCard }));
                    setPendingCard(null);
                  }}
                >
                  카드에 넣기
                </GlassButton>
                <GlassButton
                  className="btn sm"
                  onClick={() => setPendingCard(null)}
                >
                  닫기
                </GlassButton>
              </div>
            </div>
          )}
        </div>
        <form
          className="ws-chat-input"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <textarea
            className="textarea"
            value={text}
            maxLength={800}
            placeholder="만들고 싶은 것을 말해 주세요"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void send();
            }}
          />
          <GlassButton
            className="btn primary"
            disabled={!text.trim() || thinking}
          >
            보내기
          </GlassButton>
        </form>
      </GlassSurface>

      <section className="ws-right">
        <GlassSurface
          className="card panel-glass"
          contentClassName="panel-pad"
          frost={0.1}
        >
          <div className="section-title">
            <h2>{editing.id ? "제작 카드" : "새 제작 카드"}</h2>
            {current && (
              <span className={`chip ${STATUS_CHIP[current.status]}`}>
                {STATUS_LABEL[current.status]}
              </span>
            )}
          </div>
          {current?.status === "rejected" && (
            <div className="issue warn">
              선생님 의견: {current.rejectReason} — 고쳐서 다시 요청할 수
              있어요.
            </div>
          )}
          <DraftForm
            draft={editing.draft}
            onChange={(d) => setEditing((e) => ({ ...e, draft: d }))}
            disabled={!editable || busy}
          />
          <div className="row" style={{ flexWrap: "wrap", marginTop: 10 }}>
            <GlassButton
              className="btn sm"
              disabled={!editable || busy}
              onClick={() => fileRef.current?.click()}
            >
              그림 첨부
            </GlassButton>
            {current?.uploadUrl && (
              <img
                className="ws-thumb"
                src={current.uploadUrl}
                alt="첨부한 그림"
              />
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void upload(f);
                e.target.value = "";
              }}
            />
            <div className="grow" style={{ flex: 1 }} />
            <GlassButton
              className="btn sm"
              disabled={!editable || busy}
              onClick={() => void saveDraft()}
            >
              초안 저장
            </GlassButton>
            <GlassButton
              className="btn primary sm"
              disabled={!editable || busy || !editing.draft.name}
              onClick={() => void submit()}
            >
              선생님께 요청
            </GlassButton>
          </div>
          <p className="ws-note">
            선생님이 확인한 뒤 그림을 만들어요. 저장하면 친구들도 월드에서 쓸 수
            있어요.
          </p>
          {editing.id && (
            <GlassButton
              className="btn ghost sm"
              onClick={() => setEditing({ id: null, draft: EMPTY_DRAFT })}
            >
              ＋ 새 카드
            </GlassButton>
          )}
        </GlassSurface>

        {requests.length > 0 && (
          <GlassSurface
            className="card panel-glass"
            contentClassName="panel-pad"
            frost={0.1}
          >
            <div className="section-title">
              <h2>내 요청</h2>
              <GlassButton className="btn ghost sm" onClick={load}>
                새로고침
              </GlassButton>
            </div>
            {requests.length === 0 && (
              <div className="empty">아직 요청이 없어요.</div>
            )}
            <div className="ws-list">
              {requests.map((r) => (
                <div
                  key={r.id}
                  className={`ws-item ${r.id === editing.id ? "on" : ""}`}
                >
                  <button
                    className="ws-item-main"
                    onClick={() => setEditing({ id: r.id, draft: r.draft })}
                  >
                    <b>{r.draft.name}</b>
                    <span className={`chip ${STATUS_CHIP[r.status]}`}>
                      {STATUS_LABEL[r.status]}
                    </span>
                    <span className="ws-meta">
                      {CATEGORY_KO[r.draft.category]} · {timeText(r.updatedAt)}
                    </span>
                  </button>
                  {r.status === "pending" && (
                    <GlassButton
                      className="btn sm"
                      disabled={busy}
                      onClick={() =>
                        void act(
                          r,
                          "withdraw",
                          "요청을 회수했어요. 고친 뒤 다시 요청하세요",
                        )
                      }
                    >
                      회수
                    </GlassButton>
                  )}
                  {(r.status === "approved" || r.status === "generating") && (
                    <span className="ws-meta">
                      {r.status === "approved"
                        ? "선생님이 승인했어요. 생성 시작을 기다리고 있어요."
                        : r.generation?.status === "queued"
                          ? "그림 생성을 준비하고 있어요."
                          : "그림을 만들고 있어요."}
                    </span>
                  )}
                  {r.status === "failed" && (
                    <span className="ws-meta">
                      {r.generation?.error ?? "생성 실패"} — 선생님이 다시
                      시도할 수 있어요
                    </span>
                  )}
                  {r.status === "saved" && r.draft.category === "character" && (
                    <GlassLink className="btn sm" href={`/jamworldmake/?view=profile${savedAssets[r.id] ? `&asset=${encodeURIComponent(savedAssets[r.id])}` : ""}`}>
                      내 아바타로 고르기
                    </GlassLink>
                  )}
                  {r.status === "generated" && r.generation?.outputs && (
                    <div className="ws-result">
                      <ResultViews outputs={r.generation.outputs} />
                      <div className="row">
                        <GlassButton
                          className="btn primary sm"
                          disabled={busy}
                          onClick={() =>
                            void act(
                              r,
                              "save",
                              "내 에셋과 모아 월드에 추가했어요",
                            )
                          }
                        >
                          내 에셋에 저장
                        </GlassButton>
                        <GlassButton
                          className="btn sm"
                          disabled={busy}
                          onClick={() =>
                            void act(r, "discard", "저장하지 않았어요")
                          }
                        >
                          저장하지 않기
                        </GlassButton>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </GlassSurface>
        )}
      </section>
      {node}
      <span hidden>{me.student?.id}</span>
    </div>
  );
}

function DraftForm({
  draft,
  onChange,
  disabled,
}: {
  draft: RequestDraft;
  onChange: (d: RequestDraft) => void;
  disabled: boolean;
}) {
  const set = (patch: Partial<RequestDraft>) =>
    onChange({ ...draft, ...patch });
  const terrain = draft.category === "terrain";
  return (
    <fieldset className="ws-form" disabled={disabled}>
      <div className="field">
        <label htmlFor="d-name">그림 이름</label>
        <input
          id="d-name"
          className="input"
          maxLength={30}
          value={draft.name}
          onChange={(e) => set({ name: e.target.value })}
          placeholder="예) 무지개 책장"
        />
      </div>
      <div className="field">
        <label htmlFor="d-desc">어떤 모습인가요?</label>
        <textarea
          id="d-desc"
          className="textarea"
          maxLength={300}
          value={draft.description}
          onChange={(e) => set({ description: e.target.value })}
          placeholder="색과 모양을 자유롭게 적어 주세요."
        />
      </div>
      <div className="field">
        <label htmlFor="d-cat">무엇을 만들까요?</label>
        <select
          id="d-cat"
          className="select"
          value={draft.category}
          onChange={(e) =>
            set({
              category: e.target.value as RequestDraft["category"],
              passable:
                e.target.value === "terrain" || e.target.value === "character",
              height: e.target.value === "terrain" ? 0 : 1,
            })
          }
        >
          {ASSET_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_KO[c]}
            </option>
          ))}
        </select>
      </div>
      {draft.category === "character" && (
        <p className="ws-note">
          인물은 방향을 바꾸며 걸을 수 있는 아바타로 만들어요. 저장한 뒤 ‘마이페이지’에서 내 아바타로 고를 수 있어요.
        </p>
      )}
      <details className="creation-options">
        <summary>크기와 검색 설정</summary>
        <div className="creation-options-body">
          <div className="field">
            <label htmlFor="d-tags">검색 단어 (비워도 돼요)</label>
            <input
              id="d-tags"
              className="input"
              value={draft.tags.join(", ")}
              placeholder="예) 무지개, 책장"
              onChange={(e) =>
                set({
                  tags: e.target.value
                    .split(",")
                    .map((t) => t.trim())
                    .filter(Boolean)
                    .slice(0, 8),
                })
              }
            />
          </div>
          {!terrain && (
            <div className="ws-grid2">
              <div className="field">
                <label>차지하는 칸</label>
                <div className="row">
                  <select
                    className="select"
                    aria-label="가로 칸"
                    value={draft.footprint.w}
                    onChange={(e) =>
                      set({
                        footprint: {
                          ...draft.footprint,
                          w: Number(e.target.value),
                        },
                      })
                    }
                  >
                    {[1, 2, 3, 4, 5, 6].map((n) => (
                      <option key={n}>{n}</option>
                    ))}
                  </select>
                  ×
                  <select
                    className="select"
                    aria-label="세로 칸"
                    value={draft.footprint.d}
                    onChange={(e) =>
                      set({
                        footprint: {
                          ...draft.footprint,
                          d: Number(e.target.value),
                        },
                      })
                    }
                  >
                    {[1, 2, 3, 4, 5, 6].map((n) => (
                      <option key={n}>{n}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="field">
                <label htmlFor="d-h">높이</label>
                <select
                  id="d-h"
                  className="select"
                  value={draft.height}
                  onChange={(e) => set({ height: Number(e.target.value) })}
                >
                  {[0.3, 0.6, 1, 1.5, 2, 2.5, 3, 4, 5].map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
              </div>
            </div>
          )}
          <label className="row">
            <input
              type="checkbox"
              checked={draft.passable}
              onChange={(e) => set({ passable: e.target.checked })}
            />
            캐릭터가 지나갈 수 있어요
          </label>
        </div>
      </details>
    </fieldset>
  );
}

function ResultViews({
  outputs,
}: {
  outputs: {
    texture: string | null;
    td: string | null;
    iso: string | null;
    sprites?: CharacterSheets;
  };
}) {
  const [v, setV] = useState<"td" | "iso">("td");
  if (outputs.sprites)
    return (
      <AvatarPreview
        look={{
          ...DEFAULT_LOOK,
          asset: {
            name: "새 인물",
            td: outputs.td!,
            iso: outputs.iso!,
            sprites: outputs.sprites,
          },
        }}
      />
    );
  if (outputs.texture)
    return (
      <img className="ws-out" src={outputs.texture} alt="바닥 텍스처 결과" />
    );
  return (
    <div>
      <div className="seg" role="group" aria-label="결과 시점">
        <button className={v === "td" ? "on" : ""} onClick={() => setV("td")}>
          위에서 보기
        </button>
        <button className={v === "iso" ? "on" : ""} onClick={() => setV("iso")}>
          입체로 보기
        </button>
      </div>
      {(v === "td" ? outputs.td : outputs.iso) && (
        <img
          className="ws-out"
          src={(v === "td" ? outputs.td : outputs.iso)!}
          alt={v === "td" ? "위에서 보기 결과" : "입체로 보기 결과"}
          loading="lazy"
        />
      )}
    </div>
  );
}

// ======================= 교사 =======================

interface ClassInfo {
  id: string;
  name: string;
  inviteActive: boolean;
  students: Array<{ id: string; nickname: string }>;
  pending: number;
}

function TeacherHome({ me }: { me: Me }) {
  const { show, node } = useToast();
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [invite, setInvite] = useState<{ classId: string; url: string; code: string } | null>(
    null,
  );
  const [requests, setRequests] = useState<RequestView[]>([]);
  const [filter, setFilter] = useState<RequestStatus | "all">("pending");
  const [genLog, setGenLog] = useState<Record<string, string>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [busyIds, setBusyIds] = useState<Record<string, boolean>>({});
  const processing = useRef(new Set<string>());

  const loadClasses = useCallback(() => {
    api<{ classes: ClassInfo[] }>("/api/jamworld/workshop/classes")
      .then((r) => {
        setClasses(r.classes);
        setSel((s) => s ?? r.classes[0]?.id ?? null);
      })
      .catch((e) => show(e.message, true));
  }, [show]);
  useEffect(loadClasses, [loadClasses]);
  const loadRequests = useWorkshopFeed(
    sel
      ? `/api/jamworld/workshop/requests?classId=${encodeURIComponent(sel)}`
      : null,
    (data) => {
      if (!data.requests) return;
      setRequests(data.requests);
      const pending = data.requests.filter(
        (r) => r.status === "pending",
      ).length;
      setClasses((prev) =>
        prev.map((c) =>
          c.id === sel
            ? {
                ...c,
                pending,
                ...(data.students ? { students: data.students } : {}),
              }
            : c,
        ),
      );
    },
    (message) => show(message, true),
  );

  const inviteUrl = (token: string) =>
    `${window.location.origin}/jamworldmake/?invite=${token}`;

  const act = async (r: RequestView, action: "approve" | "reject" | "save") => {
    if (processing.current.has(r.id)) return;
    processing.current.add(r.id);
    setBusyIds((prev) => ({ ...prev, [r.id]: true }));
    try {
      await api(`/api/jamworld/workshop/requests/${r.id}/action`, {
        method: "POST",
        json: { action, rev: r.rev, reason: reasons[r.id] },
      });
      show(action === "approve" ? "승인했어요" : action === "save" ? "에셋 모음에 저장했어요" : "반려했어요");
      if (action === "save") window.dispatchEvent(new Event("jamworld-assets"));
      loadRequests();
    } catch (e) {
      show(e instanceof Error ? e.message : "처리하지 못했어요", true);
      loadRequests();
    } finally {
      processing.current.delete(r.id);
      setBusyIds((prev) => ({ ...prev, [r.id]: false }));
    }
  };

  const generate = async (id: string, approveRev?: number, quoteId?: string) => {
    if (processing.current.has(id)) return;
    processing.current.add(id);
    setBusyIds((prev) => ({ ...prev, [id]: true }));
    setGenLog((g) => ({
      ...g,
      [id]:
        approveRev === undefined
          ? "생성 요청을 보내고 있어요…"
          : "승인하고 생성 요청을 보내고 있어요…",
    }));
    try {
      await runGenerate(
        id,
        (ev, data) => {
          if (ev === "status")
            setGenLog((g) => ({
              ...g,
              [id]: data.started
                ? "이미지를 만들고 있어요…"
                : "이미 진행 중인 생성이에요",
            }));
          if (ev === "done") setGenLog((g) => ({ ...g, [id]: "생성 완료" }));
          if (ev === "failed")
            setGenLog((g) => ({
              ...g,
              [id]: String(data.error ?? "생성 실패"),
            }));
          if (ev === "info")
            setGenLog((g) => ({ ...g, [id]: String(data.message ?? "") }));
        },
        undefined,
        approveRev,
        quoteId,
      );
      show(
        approveRev === undefined
          ? "생성 요청을 접수했어요"
          : "승인과 생성 요청을 접수했어요",
      );
    } catch (e) {
      setGenLog((g) => ({
        ...g,
        [id]: e instanceof Error ? e.message : "생성 요청 실패",
      }));
    } finally {
      processing.current.delete(id);
      setBusyIds((prev) => ({ ...prev, [id]: false }));
    }
    loadRequests();
  };


  const shown = requests.filter((r) => filter === "all" || r.status === filter);
  const counts = (s: RequestStatus) =>
    requests.filter((r) => r.status === s).length;

  return (
    <div className="ws-teacher">
      <GlassSurface
        className="card teacher-rooms"
        contentClassName="panel-pad"
        frost={0.1}
      >
        <h2 style={{ marginTop: 0 }}>내 공방</h2>
        <div className="ws-list">
          {classes.map((c) => (
            <button
              key={c.id}
              className={`ws-item-main ${sel === c.id ? "on" : ""}`}
              onClick={() => setSel(c.id)}
            >
              <b>{c.name}</b>
              <span className="ws-meta">
                학생 {c.students.length} · 대기 {c.pending}
              </span>
            </button>
          ))}
        </div>
        <form
          className="row"
          style={{ marginTop: 10 }}
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              const r = await api<{ class: { id: string }; invite: string }>(
                "/api/jamworld/workshop/classes",
                { method: "POST", json: { name: newName } },
              );
              setNewName("");
              setInvite({ classId: r.class.id, url: inviteUrl(r.invite), code: r.invite });
              setSel(r.class.id);
              window.dispatchEvent(
                new CustomEvent("jamworld-classes", { detail: r.class.id }),
              );
              loadClasses();
            } catch (er) {
              show(er instanceof Error ? er.message : "만들지 못했어요", true);
            }
          }}
        >
          <input
            className="input"
            placeholder="새 공방 이름"
            value={newName}
            maxLength={40}
            onChange={(e) => setNewName(e.target.value)}
            aria-label="새 공방 이름"
          />
          <GlassButton className="btn primary sm" disabled={!newName.trim()}>
            만들기
          </GlassButton>
        </form>
        {sel && (
          <div style={{ marginTop: 14 }}>
            <b style={{ fontSize: 13 }}>초대 코드·링크</b>
            {invite?.classId === sel ? (
              <div className="ws-invite">
                {/^[A-Z0-9]{8}$/.test(invite.code) && (
                  <div className="ws-invite-code" aria-label={`초대 코드 ${invite.code}`}>
                    <span>{invite.code.slice(0, 4)}</span>
                    <span>{invite.code.slice(4)}</span>
                    <GlassButton
                      className="btn sm"
                      onClick={() =>
                        navigator.clipboard
                          ?.writeText(invite.code)
                          .then(() => show("코드를 복사했어요"))
                      }
                    >
                      코드 복사
                    </GlassButton>
                  </div>
                )}
                <input
                  className="input"
                  readOnly
                  value={invite.url}
                  aria-label="초대 링크"
                  onFocus={(e) => e.currentTarget.select()}
                />
                <GlassButton
                  className="btn sm"
                  onClick={() =>
                    navigator.clipboard
                      ?.writeText(invite.url)
                      .then(() => show("복사했어요"))
                  }
                >
                  복사
                </GlassButton>
                <p className="ws-note">
                  학생은 첫 화면 &lsquo;학생 공방에 들어가기&rsquo;에 코드를 넣거나 링크로
                  들어와요. 코드와 링크는 지금만 보여요. 잃어버리면 새로
                  만드세요(이전 코드는 막혀요).
                </p>
              </div>
            ) : (
              <p className="ws-note">
                보안을 위해 코드는 저장하지 않아요. &lsquo;새 코드 만들기&rsquo;를 누르면
                새 코드가 보여요(이전 코드는 막혀요).
              </p>
            )}
            <div className="row">
              <GlassButton
                className="btn sm"
                onClick={async () => {
                  const r = await api<{ invite: string }>(
                    `/api/jamworld/workshop/classes/${sel}/invite`,
                    { method: "POST", json: { active: true } },
                  );
                  setInvite({ classId: sel, url: inviteUrl(r.invite), code: r.invite });
                }}
              >
                새 코드 만들기
              </GlassButton>
              <GlassButton
                className="btn sm ghost"
                onClick={async () => {
                  await api(`/api/jamworld/workshop/classes/${sel}/invite`, {
                    method: "POST",
                    json: { active: false },
                  });
                  setInvite(null);
                  show("초대를 멈췄어요");
                  loadClasses();
                }}
              >
                초대 멈춤
              </GlassButton>
              <GlassButton
                className="btn sm ghost"
                onClick={async () => {
                  if (
                    !window.confirm(
                      "이 학급 학생을 모두 내보낼까요? 학생은 별명과 PIN 으로 다시 들어올 수 있어요.",
                    )
                  )
                    return;
                  await api(`/api/jamworld/workshop/classes/${sel}/sessions`, {
                    method: "DELETE",
                  });
                  show("학생을 모두 내보냈어요");
                }}
              >
                학생 모두 내보내기
              </GlassButton>
            </div>
            <p className="ws-note">
              학생은 30분 동안 아무것도 하지 않거나 들어온 지 8시간이 지나면
              자동으로 나가요.
            </p>
            <p className="ws-note">
              학생{" "}
              {classes
                .find((c) => c.id === sel)
                ?.students.map((s) => s.nickname)
                .join(", ") || "없음"}
            </p>
          </div>
        )}
      </GlassSurface>

      <GlassSurface
        className="card teacher-review"
        contentClassName="panel-pad"
        frost={0.1}
      >
        <div className="section-title">
          <h2>요청 검토</h2>
          <div className="cat-tabs">
            {(
              [
                "pending",
                "approved",
                "generating",
                "generated",
                "failed",
                "rejected",
                "saved",
                "all",
              ] as const
            ).map((s) => (
              <button
                key={s}
                className={filter === s ? "on" : ""}
                onClick={() => setFilter(s)}
              >
                {s === "all"
                  ? `전체 ${requests.length}`
                  : `${STATUS_LABEL[s]} ${counts(s)}`}
              </button>
            ))}
          </div>
        </div>
        {!me.status.imageGeneration && (
          <div className="issue warn">
            서버에 이미지 생성 키가 없어 승인 후 생성은 할 수 없어요.
          </div>
        )}
        {shown.length === 0 && (
          <div className="empty">해당하는 요청이 없어요.</div>
        )}
        <div className="ws-review">
          {shown.map((r) => {
            const snap = r.submitted ?? r.approved;
            const d = snap?.draft ?? r.draft;
            return (
              <article key={r.id} className="ws-review-card">
                <div
                  className="row"
                  style={{ justifyContent: "space-between" }}
                >
                  <b>
                    {r.nickname} · {d.name}
                  </b>
                  <span className={`chip ${STATUS_CHIP[r.status]}`}>
                    {STATUS_LABEL[r.status]}
                  </span>
                </div>
                <div className="ws-meta">
                  {timeText(r.updatedAt)} · {CATEGORY_KO[d.category]} ·{" "}
                  {d.footprint.w}×{d.footprint.d}칸 ·{" "}
                  {d.passable ? "통과" : "막힘"} · 그림{" "}
                  {snap?.outputs.length ?? (d.category === "terrain" ? 1 : 2)}장
                </div>
                <p style={{ margin: "6px 0", fontSize: 13.5 }}>
                  {d.description || "(설명 없음)"}
                </p>
                <div className="row" style={{ flexWrap: "wrap", gap: 4 }}>
                  {d.tags.map((t) => (
                    <span key={t} className="chip">
                      {t}
                    </span>
                  ))}
                </div>
                {(snap?.uploadUrl ?? r.uploadUrl) && (
                  <img
                    className="ws-thumb lg"
                    src={(snap?.uploadUrl ?? r.uploadUrl)!}
                    alt="학생이 첨부한 그림"
                    loading="lazy"
                  />
                )}
                {r.status === "pending" && (
                  <div className="ws-actions">
                    <GenerationControl request={r} disabled={!me.status.imageGeneration || busyIds[r.id]} onGenerate={quoteId => generate(r.id, r.rev, quoteId)} />
                    <GlassButton
                      className="btn"
                      disabled={busyIds[r.id]}
                      onClick={() => void act(r, "approve")}
                    >
                      승인만
                    </GlassButton>
                    <input
                      className="input"
                      placeholder="반려 사유 (학생에게 보여요)"
                      value={reasons[r.id] ?? ""}
                      maxLength={200}
                      onChange={(e) =>
                        setReasons((x) => ({ ...x, [r.id]: e.target.value }))
                      }
                      aria-label="반려 사유"
                    />
                    <GlassButton
                      className="btn"
                      disabled={!reasons[r.id]?.trim() || busyIds[r.id]}
                      onClick={() => void act(r, "reject")}
                    >
                      반려하기
                    </GlassButton>
                  </div>
                )}
                {(r.status === "approved" || r.status === "failed") && (
                  <div className="ws-actions">
                    <GenerationControl request={r} disabled={!me.status.imageGeneration || busyIds[r.id]} onGenerate={quoteId => generate(r.id, undefined, quoteId)} />
                    {r.status === "failed" && (
                      <span className="ws-meta">{r.generation?.error}</span>
                    )}
                  </div>
                )}
                {(r.status === "generating" || genLog[r.id]) && (
                  <div className="issue ok">
                    {r.status === "generating"
                      ? r.generation?.status === "queued"
                        ? "그림 생성을 준비하고 있어요."
                        : "그림을 만들고 있어요."
                      : r.status === "generated" || r.status === "saved"
                        ? "생성 완료"
                        : r.status === "failed"
                          ? r.generation?.error
                          : genLog[r.id]}
                  </div>
                )}
                {r.generation?.outputs &&
                  (r.status === "generated" ||
                    r.status === "saved" ||
                    r.status === "discarded") && (
                    <ResultViews outputs={r.generation.outputs} />
                  )}
                {r.creatorRole === "teacher" && r.status === "generated" && <GlassButton className="btn sm primary" disabled={busyIds[r.id]} onClick={() => void act(r, "save")}>에셋 모음에 저장</GlassButton>}
                {r.generation?.cost !== undefined && r.generation.cost && (
                  <div className="ws-meta">
                    받은 이미지 {r.generation.cost.images}장 · 이미지 호출{" "}
                    {r.generation.cost.calls ?? r.generation.cost.images}회 ·
                    생성 시도 {r.generation.attempt}회 ·{" "}
                    {r.generation.cost.complete
                      ? `약 $${r.generation.cost.usdKnown.toFixed(4)}`
                      : `확인된 금액 $${r.generation.cost.usdKnown.toFixed(4)} (일부 미확인: ${r.generation.cost.unknown.join(", ")})`}{" "}
                    · 요금표 {r.generation.cost.pricingVersion}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </GlassSurface>
      {node}
    </div>
  );
}
