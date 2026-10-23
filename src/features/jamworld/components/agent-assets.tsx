"use client";
import { useEffect, useRef, useState } from "react";
import GenerationControl, { EstimateText } from "./generation-control";
import type { ImageEstimate } from "../lib/server/workshop/estimate";
import { useClassroom } from "./classroom-context";
import { api, runGenerate, type LibraryAsset, type RequestView } from "./workshop-api";
import { useWorkshopFeed } from "./use-workshop-feed";
import { GlassButton, GlassLink } from "./glass-surface";
import { registerLibrary } from "../lib/world/user-assets";
import { STATUS_LABEL } from "../lib/server/workshop/types";
import type { AgentAssetNeed } from "../lib/agent/design";
import type { MapOp } from "../lib/world/ops";
import type { AgentProposal } from "./agent-panel";

export interface AgentAssetTask extends AgentAssetNeed {
  key: string;
  requestId?: string;
  classId?: string;
  assetId?: string;
}

export default function AgentAssets({ tasks, disabled, onChange, onProposal }: {
  tasks: AgentAssetTask[]; disabled: boolean;
  onChange: (key: string, patch: Partial<AgentAssetTask>) => void;
  onProposal: (proposal: AgentProposal) => string | null;
}) {
  const classroom = useClassroom();
  const me = classroom?.me;
  const teacher = me?.role === "teacher";
  const classId = tasks.find(t => t.classId)?.classId || classroom?.classId || "";
  const [requests, setRequests] = useState<RequestView[]>([]);
  const [busy, setBusy] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [estimates, setEstimates] = useState<ImageEstimate[]>([]);
  const estimateBody = JSON.stringify({ assets: tasks.map(({ draft, x, y }) => ({ draft, x, y })) });
  useEffect(() => {
    let live = true;
    api<{ estimates: ImageEstimate[] }>("/api/jamworld/agent/estimate", { method: "POST", json: JSON.parse(estimateBody) })
      .then(r => { if (live) setEstimates(r.estimates); }).catch(() => { if (live) setEstimates([]); });
    return () => { live = false; };
  }, [estimateBody]);
  const processing = useRef(new Set<string>());
  const path = classId && tasks.some(t => t.requestId)
    ? `/api/jamworld/workshop/requests${teacher ? `?classId=${encodeURIComponent(classId)}` : ""}` : null;
  const refresh = useWorkshopFeed(path, d => { if (d.requests) setRequests(d.requests); }, setError);
  const run = async (key: string, fn: () => Promise<void>) => {
    if (processing.current.has(key)) return;
    processing.current.add(key); setBusy([...processing.current]); setError(""); setNotice("");
    try { await fn(); refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : "제작 요청을 처리하지 못했어요"); refresh(); }
    finally { processing.current.delete(key); setBusy([...processing.current]); }
  };
  const place = async (task: AgentAssetTask, request?: RequestView) => {
    let id = task.assetId;
    if (request?.status === "generated") {
      const result = await api<{ assetId: string }>(`/api/jamworld/workshop/requests/${request.id}/action`, { method: "POST", json: { action: "save", rev: request.rev } });
      id = result.assetId;
      onChange(task.key, { assetId: id });
    }
    const { assets } = await api<{ assets: LibraryAsset[] }>("/api/jamworld/workshop/catalog");
    const asset = assets.find(a => a.id === id || a.provenance.requestId === task.requestId);
    if (!asset) throw new Error("저장된 에셋을 찾을 수 없어요. 공방에서 저장 상태를 확인해 주세요.");
    onChange(task.key, { assetId: asset.id });
    const [assetId] = registerLibrary([asset]);
    window.dispatchEvent(new Event("jamworld-assets"));
    const ops: MapOp[] = [];
    const w = task.w || task.draft.footprint.w, h = task.h || task.draft.footprint.d;
    if (asset.appearance.kind === "texture") ops.push({ op: "paint", tileId: assetId, x: task.x, y: task.y, w, h });
    else for (let y = task.y; y + task.draft.footprint.d <= task.y + h; y += task.draft.footprint.d)
      for (let x = task.x; x + task.draft.footprint.w <= task.x + w; x += task.draft.footprint.w) ops.push({ op: "place", assetId, x, y });
    const err = onProposal({
      summary: `‘${asset.name}’ 에셋을 계획한 위치에 놓아요.`, provider: "demo", model: "workshop", latencyMs: 0,
      ops,
    });
    if (err) throw new Error(`에셋은 저장됐지만 계획한 위치에 놓을 수 없어요: ${err}. 왼쪽 ‘공방 에셋’에서 다른 자리에 놓거나 도우미에게 재배치를 요청해 주세요.`);
    setNotice("에셋 배치를 미리보기에서 확인하고 적용해 주세요.");
  };
  return <div className="agent-assets">
    <h3>필요한 에셋</h3>
    <p className="ws-note">제작 요청 → 교사 승인·생성 → 완성된 에셋 배치</p>
    {estimates.length === tasks.length && estimates.every(e => e.lowUsd !== null) && <p className="agent-estimate-total"><b>전체 이미지 예상 ${estimates.reduce((n, e) => n + e.lowUsd!, 0).toFixed(3)}~${estimates.reduce((n, e) => n + e.highUsd!, 0).toFixed(3)}</b><br />제작 요청만으로는 이미지가 생성되지 않아요.</p>}
    {!classId && <p className="ws-note">먼저 <GlassLink href="/jamworldmake/?view=workshop">공방에 들어가 주세요</GlassLink>.</p>}
    {tasks.map((task, index) => {
      const request = requests.find(r => r.id === task.requestId);
      const working = busy.includes(task.key);
      return <div className="agent-asset-card" key={task.key}>
        <b>{task.draft.name}</b><p>{task.draft.description}</p>
        {!task.requestId && (estimates[index] ? <EstimateText estimate={estimates[index]} /> : <p className="ws-note">예상 비용을 확인하고 있어요. 생성 전 교사가 최종 견적을 확인해요.</p>)}
        {request && <span className="chip">{STATUS_LABEL[request.status]}</span>}
        {!task.requestId ? <GlassButton className="btn sm" disabled={working || !classId || disabled} onClick={() => void run(task.key, async () => {
          const result = await api<{ request: RequestView }>("/api/jamworld/agent/assets", { method: "POST", json: { key: task.key, classId, draft: task.draft } });
          onChange(task.key, { requestId: result.request.id, classId });
          setRequests(prev => [result.request, ...prev.filter(r => r.id !== result.request.id)]);
          setNotice(teacher ? "제작 요청을 만들었어요. 내용을 확인하고 생성해 주세요." : "선생님께 제작 요청을 보냈어요.");
        })}>{working ? "요청 중…" : "공방에 제작 요청"}</GlassButton> : <>
          {!request && !task.assetId && <p role="status">제작 상태를 확인하고 있어요…</p>}
          {teacher && request && ["pending", "approved", "failed"].includes(request.status) && <>
            <GenerationControl request={request} disabled={working || !me?.status.imageGeneration} onGenerate={quoteId => run(task.key, async () => {
              await runGenerate(request.id, () => undefined, undefined, request.status === "pending" ? request.rev : undefined, quoteId);
              setNotice("그림 생성을 준비하고 있어요.");
            })} />
          </>}
          {request?.status === "generating" && <p role="status">{request.generation?.status === "queued" ? "그림 생성을 준비하고 있어요." : "그림을 만들고 있어요."}</p>}
          {request?.status === "rejected" && <p>{request.rejectReason || "선생님이 수정 요청을 보냈어요."} 공방에서 내용을 고쳐 주세요.</p>}
          {request?.status === "failed" && <p role="alert">{request.generation?.error || "그림을 만들지 못했어요."}</p>}
          {(task.assetId || request?.status === "generated" || request?.status === "saved") && <GlassButton className="btn sm primary" disabled={working || disabled} onClick={() => void run(task.key, () => place(task, request))}>
            {working ? "준비 중…" : request?.status === "generated" ? "저장하고 맵에 놓기" : "맵에 놓기"}
          </GlassButton>}
        </>}
      </div>;
    })}
    {error && <p role="alert" className="issue err">{error}</p>}
    {notice && <p role="status" className="ws-note">{notice}</p>}
  </div>;
}
