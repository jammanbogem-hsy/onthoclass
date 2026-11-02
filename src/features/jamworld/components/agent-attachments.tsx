"use client";

import { useRef, useState } from "react";
import { GlassButton } from "./glass-surface";
import { api } from "./workshop-api";

/** 맵 도우미 참고 자료. 대화가 이어지는 동안 요청마다 함께 보낸다(이 기기 화면에만, 저장 X). */
export type AgentAttachment =
  | { id: string; kind: "image"; name: string; mime: "image/webp" | "image/png" | "image/jpeg"; data: string; source?: string }
  | { id: string; kind: "pdf"; name: string; data: string }
  | { id: string; kind: "text"; name: string; text: string; source?: string };

export const MAX_ATTACHMENTS = 8;
const MAX_EDGE = 1568; // 두 모델 모두 이 크기 안이면 줄이지 않고 그대로 본다
const MAX_PDF = 3_500_000;
const MAX_TEXT = 20_000;
const MAX_TOTAL_B64 = 7_500_000;
const TEXT_EXT = /\.(txt|csv|tsv|md|json|html?|xml|srt|vtt)$/i;

const uid = () => crypto.randomUUID();
const b64Size = (a: AgentAttachment) => (a.kind === "text" ? a.text.length : a.data.length);

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).replace(/^data:[^,]*,/, ""));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

async function shrinkImage(file: File): Promise<{ mime: "image/webp" | "image/jpeg"; data: string }> {
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file); } catch { throw Error(`'${file.name}' 그림을 열 수 없어요 (PNG·JPG·WebP·GIF로 올려 주세요)`); }
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height); // 투명 배경이 검게 보이지 않게
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const webp = await new Promise<Blob | null>(r => canvas.toBlob(r, "image/webp", 0.85));
  if (webp?.type === "image/webp") return { mime: "image/webp", data: await blobToBase64(webp) };
  const jpeg = await new Promise<Blob | null>(r => canvas.toBlob(r, "image/jpeg", 0.85)); // WebP 인코딩이 안 되는 브라우저
  if (!jpeg) throw Error(`'${file.name}' 그림을 줄이지 못했어요`);
  return { mime: "image/jpeg", data: await blobToBase64(jpeg) };
}

export async function fileToAttachment(file: File): Promise<AgentAttachment> {
  const name = file.name || "붙여넣은 그림";
  if (file.type.startsWith("image/")) return { id: uid(), kind: "image", name, ...(await shrinkImage(file)) };
  if (file.type === "application/pdf" || /\.pdf$/i.test(name)) {
    if (file.size > MAX_PDF) throw Error(`'${name}' PDF가 너무 커요 (3.5MB까지). 필요한 쪽만 저장해서 올려 주세요`);
    return { id: uid(), kind: "pdf", name, data: await blobToBase64(file) };
  }
  if (file.type.startsWith("text/") || file.type === "application/json" || TEXT_EXT.test(name)) {
    const text = (await file.text()).trim();
    if (!text) throw Error(`'${name}' 내용이 비어 있어요`);
    return { id: uid(), kind: "text", name, text: text.slice(0, MAX_TEXT) };
  }
  throw Error(`'${name}'은(는) 붙일 수 없는 형식이에요 (그림·PDF·글 파일만)`);
}

/** 서버로 보낼 모양 (미리보기용 id 등 제외) */
export function attachmentPayload(items: AgentAttachment[]) {
  return items.map(a => a.kind === "image" ? { kind: a.kind, name: a.name, mime: a.mime, data: a.data, ...(a.source ? { source: a.source } : {}) }
    : a.kind === "pdf" ? { kind: a.kind, name: a.name, data: a.data }
    : { kind: a.kind, name: a.name, text: a.text, ...(a.source ? { source: a.source } : {}) });
}

type Snapshot = { url: string; title: string; description: string; text: string; truncated: boolean; images: { mime: "image/webp"; data: string }[] };

export function useAttachmentAdder(items: AgentAttachment[], setItems: (fn: (l: AgentAttachment[]) => AgentAttachment[]) => void, setError: (e: string) => void) {
  return async (files: File[]) => {
    setError("");
    if (!files.length) return;
    const room = MAX_ATTACHMENTS - items.length;
    if (room <= 0) { setError(`참고 자료는 ${MAX_ATTACHMENTS}개까지예요. 필요 없는 것을 빼 주세요`); return; }
    const added: AgentAttachment[] = [];
    for (const f of files.slice(0, room)) {
      try { added.push(await fileToAttachment(f)); } catch (e) { setError(e instanceof Error ? e.message : "파일을 읽지 못했어요"); }
    }
    if (files.length > room) setError(`참고 자료는 ${MAX_ATTACHMENTS}개까지라 ${files.length - room}개는 빼고 붙였어요`);
    const total = [...items, ...added].reduce((n, a) => n + b64Size(a), 0);
    if (total > MAX_TOTAL_B64) { setError("참고 자료가 너무 커요 (전체 약 5.5MB까지). 큰 PDF나 그림을 빼 주세요"); return; }
    setItems(l => [...l, ...added]);
  };
}

export default function AgentAttachments({ items, setItems, teacher, disabled, error, setError }: {
  items: AgentAttachment[];
  setItems: (fn: (l: AgentAttachment[]) => AgentAttachment[]) => void;
  teacher: boolean; disabled: boolean; error: string; setError: (e: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [link, setLink] = useState("");
  const [fetching, setFetching] = useState(false);
  const add = useAttachmentAdder(items, setItems, setError);

  async function readLink() {
    const url = link.trim();
    if (!url || fetching) return;
    if (items.length + 2 > MAX_ATTACHMENTS) { setError(`참고 자료는 ${MAX_ATTACHMENTS}개까지예요. 링크를 읽으려면 2칸 이상 비워 주세요`); return; }
    setFetching(true); setError("");
    try {
      const s = await api<Snapshot>("/api/jamworld/snapshot", { method: "POST", json: { url } });
      const title = (s.title || new URL(s.url).hostname).slice(0, 80);
      const shots = s.images.slice(0, Math.max(1, MAX_ATTACHMENTS - items.length - 1)).map((img, i): AgentAttachment => ({
        id: uid(), kind: "image", name: `${title} 화면 ${i + 1}`, mime: img.mime, data: img.data, source: s.url,
      }));
      const body = [s.description, s.text].filter(Boolean).join("\n\n") + (s.truncated ? "\n…(뒷부분 생략)" : "");
      const text: AgentAttachment[] = body.trim() ? [{ id: uid(), kind: "text", name: `${title} 본문`, text: body.slice(0, MAX_TEXT), source: s.url }] : [];
      setItems(l => [...l, ...shots, ...text].slice(0, MAX_ATTACHMENTS));
      setLink(""); setLinkOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "링크를 읽지 못했어요");
    } finally { setFetching(false); }
  }

  return <div className="agent-attach">
    {items.length > 0 && <ul className="agent-attach-list" aria-label="참고 자료">
      {items.map(a => <li key={a.id} className="agent-attach-item" title={a.kind !== "pdf" && a.source ? a.source : a.name}>
        {a.kind === "image"
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={`data:${a.mime};base64,${a.data}`} alt="" />
          : <span className="agent-attach-icon" aria-hidden>{a.kind === "pdf" ? "PDF" : "글"}</span>}
        <span className="agent-attach-name">{a.name}</span>
        <button type="button" className="agent-attach-x" aria-label={`${a.name} 빼기`} disabled={disabled}
          onClick={() => setItems(l => l.filter(x => x.id !== a.id))}>×</button>
      </li>)}
    </ul>}
    <div className="agent-attach-actions">
      <input ref={fileRef} type="file" hidden multiple accept="image/*,application/pdf,.pdf,.txt,.csv,.tsv,.md,.json"
        onChange={e => { const files = [...(e.target.files || [])]; e.target.value = ""; void add(files); }} />
      <GlassButton className="btn sm" type="button" disabled={disabled || items.length >= MAX_ATTACHMENTS} onClick={() => fileRef.current?.click()}>그림·파일 붙이기</GlassButton>
      {teacher && <GlassButton className="btn sm" type="button" disabled={disabled || fetching} onClick={() => setLinkOpen(v => !v)}>{linkOpen ? "링크 닫기" : "링크 읽기"}</GlassButton>}
      {items.length > 0 && <span className="ws-note">요청할 때마다 함께 봐요 · {items.length}/{MAX_ATTACHMENTS}</span>}
    </div>
    {teacher && linkOpen && <form className="agent-attach-link" onSubmit={e => { e.preventDefault(); void readLink(); }}>
      <input className="input" type="url" inputMode="url" placeholder="https://… 참고할 페이지 주소" aria-label="참고할 페이지 주소"
        value={link} maxLength={2000} disabled={fetching} onChange={e => setLink(e.target.value)} />
      <GlassButton className="btn primary sm" type="submit" disabled={!link.trim() || fetching}>{fetching ? "페이지 여는 중…" : "가져오기"}</GlassButton>
    </form>}
    {teacher && linkOpen && <p className="ws-note">페이지를 열어 화면을 찍고 본문 글을 가져와 참고 자료로 붙여요 (선생님만).</p>}
    {error && <p className="ws-note agent-attach-error" role="alert">{error}</p>}
  </div>;
}
