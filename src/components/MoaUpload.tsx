"use client";

// 모아 월드 업로드 링크 — AI(ChatGPT·Claude)가 moa_start_upload 로 만든 링크에서 그림 파일을 끌어다 놓아 에셋으로 올린다.
// 로그인 없이 링크가 곧 권한(2시간, 한 번). 서버: /api/jamworld/upload/<토큰>
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Icon } from "@/components/Icon";

type Spec = { name: string; kind: "object" | "tile" | "character"; category: string; tags: string[]; footprint?: { w: number; d: number } };
type Slot = "iso" | "td" | "texture" | "sheetIso" | "sheetTd";
const SLOT_INFO: Record<Slot, { label: string; hint: string }> = {
  iso: { label: "입체 그림(쿼터뷰)", hint: "비스듬히 내려다본 전신 그림" },
  td: { label: "위에서 본 그림", hint: "없으면 입체 그림을 같이 써요" },
  texture: { label: "바닥 무늬", hint: "이음매 없는 정사각 텍스처" },
  sheetIso: { label: "입체 걷기 시트", hint: "AI 가 그린 원본 그대로 — 5열, 앞·오른앞·오른쪽·오른뒤·뒤" },
  sheetTd: { label: "위에서 본 걷기 시트", hint: "AI 가 그린 원본 그대로 — 5열, 앞·오른쪽·뒤" },
};
const KIND_LABEL = { object: "물체", tile: "바닥", character: "인물" } as const;

export default function MoaUpload() {
  const token = useSearchParams().get("t") ?? "";
  const validToken = /^[A-Za-z0-9_-]{32}$/.test(token);
  const [spec, setSpec] = useState<Spec | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "done" | "gone">("loading");
  const [msg, setMsg] = useState("");
  const [files, setFiles] = useState<Partial<Record<Slot, File>>>({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");

  useEffect(() => {
    if (!validToken) return;
    fetch(`/api/jamworld/upload/${token}`).then(r => r.json().then(d => ({ ok: r.ok, d }))).then(({ ok, d }) => {
      if (!ok) { setState("gone"); setMsg(d.error ?? "링크를 찾지 못했어요."); return; }
      setSpec(d.spec);
      if (d.status === "done") { setState("done"); setResult(d.spec?.name ?? ""); }
      else if (d.expired) { setState("gone"); setMsg("링크가 만료됐어요. AI 에게 새 링크를 부탁하세요."); }
      else setState("ready");
    }).catch(() => { setState("gone"); setMsg("불러오지 못했어요."); });
  }, [token, validToken]);

  const slots: Slot[] = !spec ? [] : spec.kind === "tile" ? ["texture"] : spec.kind === "character" ? ["sheetTd", "sheetIso", "iso", "td"] : ["iso", "td"];
  const required: Slot = spec?.kind === "tile" ? "texture" : "iso";

  function pick(slot: Slot, f: File | undefined) {
    if (!f) return;
    if (!/^image\/(png|webp|jpeg)$/.test(f.type)) { setMsg("PNG·WebP·JPG 그림만 올릴 수 있어요(SVG 는 안 돼요)."); return; }
    if (f.size > 8 * 1024 * 1024) { setMsg("그림이 너무 커요(8MB 이하)."); return; }
    setMsg(""); setFiles(old => ({ ...old, [slot]: f }));
  }

  async function submit() {
    const sheets = !!files.sheetTd && !!files.sheetIso;
    if (!files[required] && !(spec?.kind === "character" && sheets)) { setMsg(`${SLOT_INFO[required].label}을 올려 주세요.`); return; }
    if ((files.sheetIso ? 1 : 0) + (files.sheetTd ? 1 : 0) === 1) { setMsg("걷기 시트는 두 장(입체·위에서)을 함께 올려 주세요."); return; }
    setBusy(true); setMsg("");
    const form = new FormData();
    for (const [k, f] of Object.entries(files)) if (f) form.append(k, f);
    try {
      const r = await fetch(`/api/jamworld/upload/${token}`, { method: "POST", body: form });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "올리지 못했어요.");
      setResult(d.name); setState("done");
    } catch (e) { setMsg(e instanceof Error ? e.message : "올리지 못했어요."); } finally { setBusy(false); }
  }

  const card = "rounded-3xl bg-[var(--md-sys-color-surface-container-low)] p-5 sm:p-6";
  return <main className="min-h-dvh bg-[var(--md-sys-color-surface)] px-4 py-8 text-[var(--md-sys-color-on-surface)]">
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <header className="flex items-center gap-2 text-sm font-bold text-[var(--md-sys-color-primary)]"><Icon name="deployed_code" size={20} />모아 월드 그림 올리기</header>
      {!validToken && <p className={card}>링크가 올바르지 않아요. AI 가 준 링크를 그대로 열어 주세요.</p>}
      {validToken && state === "loading" && <p className={card}>불러오는 중…</p>}
      {state === "gone" && <p className={card}>{msg}</p>}
      {state === "done" && <section className={`${card} text-center`}>
        <Icon name="check_circle" size={48} className="text-[var(--md-sys-color-primary)]" fill />
        <h1 className="mt-2 text-2xl font-black">‘{result}’ 에셋을 넣었어요</h1>
        <p className="mt-2 text-[var(--md-sys-color-on-surface-variant)]">이제 AI 대화로 돌아가 <b>“올렸어요”</b>라고 말해 주세요. 에셋 모음에도 바로 보여요.</p>
      </section>}
      {state === "ready" && spec && <>
        <section className={card}>
          <h1 className="text-2xl font-black">{spec.name}</h1>
          <p className="mt-1 text-sm text-[var(--md-sys-color-on-surface-variant)]">{KIND_LABEL[spec.kind]}{spec.footprint ? ` · ${spec.footprint.w}×${spec.footprint.d}칸` : ""} · {spec.tags.join(", ")}</p>
          <p className="mt-3 rounded-2xl bg-[var(--md-sys-color-secondary-container)] px-4 py-3 text-sm text-[var(--md-sys-color-on-secondary-container)]">
            이미지 생성 모델(ChatGPT 이미지 만들기 등)이 그린 <b>배경이 투명한 PNG</b>를 올려 주세요. 브롤스타즈 같은 2.5D 카툰·비비드한 색이 모아 월드와 잘 어울려요. 서버가 여백을 자르고 크기를 맞춰요.
          </p>
        </section>
        <section className="grid gap-3 sm:grid-cols-2">
          {slots.map(slot => {
            const f = files[slot];
            return <label key={slot}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); pick(slot, e.dataTransfer.files[0]); }}
              className="flex cursor-pointer flex-col gap-2 rounded-3xl border-2 border-dashed border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-lowest)] p-4 hover:border-[var(--md-sys-color-primary)]">
              <span className="flex items-center justify-between gap-2 text-sm font-bold">{SLOT_INFO[slot].label}{slot === required && spec?.kind !== "character" && <em className="rounded-full bg-[var(--md-sys-color-primary)] px-2 py-0.5 text-xs not-italic text-[var(--md-sys-color-on-primary)]">필수</em>}</span>
              <span className="text-xs text-[var(--md-sys-color-on-surface-variant)]">{SLOT_INFO[slot].hint}</span>
              <span className="flex aspect-square items-center justify-center overflow-hidden rounded-2xl" style={{ background: "repeating-conic-gradient(#e6e9ef 0 25%, #fff 0 50%) 0 0/20px 20px" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {f ? <img src={URL.createObjectURL(f)} alt="" className="max-h-full max-w-full object-contain" /> : <span className="flex flex-col items-center gap-1 text-sm text-[var(--md-sys-color-on-surface-variant)]"><Icon name="upload" size={28} />끌어다 놓거나 눌러서 고르기</span>}
              </span>
              <input type="file" accept="image/png,image/webp,image/jpeg" hidden onChange={e => pick(slot, e.target.files?.[0])} />
            </label>;
          })}
        </section>
        {msg && <p role="alert" className="text-sm font-semibold text-[var(--md-sys-color-error)]">{msg}</p>}
        <button type="button" disabled={busy || !(files[required] || (files.sheetTd && files.sheetIso))} onClick={() => void submit()}
          className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-full bg-[var(--md-sys-color-primary)] px-6 text-base font-bold text-[var(--md-sys-color-on-primary)] disabled:opacity-50">
          <Icon name="cloud_upload" size={22} />{busy ? "올리는 중…" : "모아 월드에 넣기"}
        </button>
      </>}
    </div>
  </main>;
}
