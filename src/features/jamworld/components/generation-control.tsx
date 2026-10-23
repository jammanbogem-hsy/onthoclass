"use client";
import { useEffect, useState } from "react";
import { api, type RequestView } from "./workshop-api";
import { GlassButton } from "./glass-surface";
import type { GenerationQuote, ImageEstimate } from "../lib/server/workshop/estimate";

export function EstimateText({ estimate }: { estimate: ImageEstimate }) {
  return <div className="generation-estimate">
    <strong>{estimate.lowUsd === null || estimate.highUsd === null ? "현재 모델의 비용을 확인할 수 없어요" : `예상 $${estimate.lowUsd.toFixed(3)}~$${estimate.highUsd.toFixed(3)}`}</strong>
    <span>그림 {estimate.images}장 · {estimate.model} · 1024×1024 · 보통 품질</span>
    <small>설명·참조 그림 입력을 포함한 추정입니다. 최종 금액은 사용량에 따라 달라지며, 재생성·대화 비용은 별도입니다.</small>
  </div>;
}

/** A valid, visible server quote is required before enabling the paid action. */
export default function GenerationControl({ request, disabled, onGenerate }: {
  request: RequestView; disabled?: boolean; onGenerate: (quoteId: string) => Promise<void>;
}) {
  const [quote, setQuote] = useState<GenerationQuote | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    api<{ quote: GenerationQuote }>(`/api/jamworld/workshop/requests/${request.id}/generate`)
      .then(r => { if (live) { setQuote(r.quote); setError(""); } })
      .catch(e => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [request.id, request.rev, retry]);
  const current = quote?.requestId === request.id && quote.rev === request.rev && quote.lowUsd !== null;
  return <div className="generation-control">
    {quote?.requestId === request.id && quote.rev === request.rev ? <EstimateText estimate={quote} /> : <p role="status">{error || "생성 비용을 계산하고 있어요…"}</p>}
    {error && <GlassButton className="btn sm" onClick={() => setRetry(n => n + 1)}>견적 다시 받기</GlassButton>}
    <GlassButton className="btn coral" disabled={disabled || busy || !current || request.attempts >= 3} onClick={async () => {
      if (!current || !quote) return;
      setBusy(true);
      try { await onGenerate(quote.id); } finally { setBusy(false); setRetry(n => n + 1); }
    }}>{busy ? "처리 중…" : request.status === "pending" ? "비용 확인 · 승인하고 생성" : request.status === "failed" ? "비용 확인 · 다시 생성" : "비용 확인 · 생성하기"}</GlassButton>
  </div>;
}
