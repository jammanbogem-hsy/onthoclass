"use client";

// 모아 월드에서 만든 내 에셋 고르기 — 응답·보드 첨부, 프로필 사진, 브레인스토밍 캐릭터가 함께 쓴다.
import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { listMoaAssets, type MoaAsset } from "@/lib/moaAssets";

export function MoaAssetPicker({ title, onPick, onClose, prefer, extra }: {
  title: string;
  onPick: (a: MoaAsset) => Promise<void> | void;
  onClose: () => void;
  /** 이 종류를 먼저 보여 준다(예: 캐릭터) */
  prefer?: string;
  extra?: React.ReactNode;
}) {
  const [assets, setAssets] = useState<MoaAsset[] | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    listMoaAssets()
      .then(list => setAssets(prefer ? [...list.filter(a => a.category === prefer), ...list.filter(a => a.category !== prefer)] : list))
      .catch(() => { setAssets([]); setErr("모아 월드 에셋을 불러오지 못했어요."); });
  }, [prefer]);

  async function pick(a: MoaAsset) {
    setBusy(a.id); setErr("");
    try { await onPick(a); onClose(); } catch (e) { setErr(e instanceof Error ? e.message : "넣지 못했어요."); } finally { setBusy(null); }
  }

  return <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[rgba(0,0,0,0.5)] p-4" onClick={onClose}>
    <div role="dialog" aria-modal="true" aria-label={title} className="relative flex max-h-[85dvh] w-full max-w-xl flex-col rounded-3xl bg-[var(--md-sys-color-surface-container-high)] p-5 shadow-[var(--md-sys-elevation-3)]" onClick={e => e.stopPropagation()}>
      <button type="button" onClick={onClose} aria-label="닫기" className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full hover:bg-[var(--md-sys-color-surface-container-highest)]"><Icon name="close" size={22} /></button>
      <h2 className="flex items-center gap-2 pr-10 text-lg font-bold"><Icon name="deployed_code" size={22} />{title}</h2>
      <p className="mt-1 text-sm text-[var(--md-sys-color-on-surface-variant)]">모아 월드에서 내가 만든 그림이에요.</p>
      {extra}
      <div className="mt-4 min-h-[120px] overflow-y-auto">
        {assets === null ? <p className="py-8 text-center text-sm">불러오는 중…</p>
          : assets.length === 0 ? <div className="py-8 text-center text-sm text-[var(--md-sys-color-on-surface-variant)]">
              아직 만든 에셋이 없어요.<br />
              <Link href="/jamworldmake/?view=workshop" className="mt-3 inline-flex items-center gap-1 font-semibold text-[var(--md-sys-color-primary)]">모아 월드 공방에서 만들기 <Icon name="arrow_forward" size={16} /></Link>
              <p className="mt-2 text-xs">러닝크루로 로그인한 채 모아 월드에 들어가야 내 에셋이 이어져요.</p>
            </div>
          : <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4">
              {assets.map(a => <li key={a.id}>
                <button type="button" disabled={!!busy} onClick={() => void pick(a)} className="flex w-full flex-col items-center gap-1 rounded-2xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-lowest)] p-2 text-xs font-semibold hover:bg-[var(--md-sys-color-secondary-container)] disabled:opacity-60">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={a.image} alt="" className="aspect-square w-full object-contain" loading="lazy" />
                  <span className="w-full truncate text-center">{busy === a.id ? "넣는 중…" : a.name}</span>
                </button>
              </li>)}
            </ul>}
      </div>
      {err && <p role="alert" className="mt-3 text-sm text-[var(--md-sys-color-error)]">{err}</p>}
    </div>
  </div>;
}
