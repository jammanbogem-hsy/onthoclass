"use client";

// 학급 성과 공유 링크 — 교사가 만들고(링크가 있으면 누구나 로그인 없이 봄), 복사·새 링크로 바꾸기·멈추기.
// 링크 화면에서 학생 이름은 서버가 빼고 보내 모자이크로만 보인다(functions/src/showcase.ts).
import { useEffect, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { getFunctionsClient } from "@/lib/firebase";
import { useDialog } from "@/components/Dialog";
import { Icon } from "@/components/Icon";

type Action = "get" | "create" | "reset" | "revoke";
const call = (classId: string, action: Action) =>
  httpsCallable<{ classId: string; action: Action }, { token: string | null }>(getFunctionsClient(), "showcaseLink")({ classId, action }).then(r => r.data.token);

export function ShowcaseShareDialog({ classId, className, onClose }: { classId: string; className: string; onClose: () => void }) {
  const dialog = useDialog();
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);
  useEffect(() => { call(classId, "get").then(setToken).catch(() => { setToken(null); setErr("공유 상태를 불러오지 못했어요."); }); }, [classId]);

  const url = token ? `${window.location.origin}/showcase/?t=${token}` : "";
  async function run(action: Action) {
    if (action === "reset" && !(await dialog.confirm({ title: "새 링크로 바꾸기", body: "지금 링크는 더 이상 열리지 않아요. 새 링크를 다시 나눠 줘야 해요.", okLabel: "바꾸기" }))) return;
    if (action === "revoke" && !(await dialog.confirm({ title: "공유 멈추기", body: "링크를 가진 사람이 더 이상 볼 수 없어요. 나중에 다시 만들면 새 주소가 생겨요.", okLabel: "멈추기", danger: true }))) return;
    setBusy(true); setErr("");
    try { setToken(await call(classId, action)); } catch { setErr("처리하지 못했어요. 잠시 뒤 다시 해 주세요."); } finally { setBusy(false); }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(url); } catch { /* 아래 입력칸에서 직접 복사 */ }
    setCopied(true); setTimeout(() => setCopied(false), 1600);
  }

  const btn = "inline-flex items-center justify-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-50";
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(0,0,0,0.5)] p-4" onClick={onClose}>
    <div role="dialog" aria-modal="true" aria-label="성과 공유 링크" className="relative w-full max-w-lg rounded-3xl bg-[var(--md-sys-color-surface-container-high)] p-6 shadow-[var(--md-sys-elevation-3)]" onClick={e => e.stopPropagation()}>
      <button onClick={onClose} aria-label="닫기" className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-highest)]"><Icon name="close" size={22} /></button>
      <h2 className="flex items-center gap-2 text-xl font-bold"><Icon name="share" size={22} />성과 공유 링크</h2>
      <p className="mt-1 text-sm text-[var(--md-sys-color-on-surface-variant)]">{className}</p>
      <ul className="mt-4 space-y-1.5 text-sm leading-relaxed text-[var(--md-sys-color-on-surface-variant)]">
        <li>· 링크가 있는 사람은 로그인 없이 학급의 차시·응답·사진과 그림·브레인스토밍·보드·지식맵·칭찬·게임 기록을 볼 수 있어요. 고칠 수는 없어요.</li>
        <li>· 학생 이름은 <b className="text-[var(--md-sys-color-on-surface)]">모자이크</b>로 가려요. 이름은 서버에서 아예 빼고 보내고, 글 속 친구 이름도 가려요.</li>
        <li>· 늘 최신 내용이 보여요(30초쯤 늦을 수 있어요). 예약(숨김) 활동, 개인 메시지, 음성 녹음은 보이지 않아요.</li>
      </ul>
      {token === undefined ? <p className="mt-6 text-sm">불러오는 중…</p>
        : token ? <div className="mt-5">
          <div className="flex gap-2">
            <input readOnly value={url} onFocus={e => e.currentTarget.select()} aria-label="공유 링크" className="min-w-0 flex-1 rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] px-3 py-2 text-sm" />
            <button onClick={copy} className={`${btn} bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)]`}><Icon name={copied ? "check" : "content_copy"} size={18} />{copied ? "복사했어요" : "복사"}</button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <a href={url} target="_blank" rel="noreferrer" className={`${btn} border border-[var(--md-sys-color-outline)] text-[var(--md-sys-color-primary)]`}><Icon name="open_in_new" size={18} />열어 보기</a>
            <button disabled={busy} onClick={() => void run("reset")} className={`${btn} border border-[var(--md-sys-color-outline)]`}><Icon name="autorenew" size={18} />새 링크로 바꾸기</button>
            <button disabled={busy} onClick={() => void run("revoke")} className={`${btn} border border-[var(--md-sys-color-error)] text-[var(--md-sys-color-error)]`}><Icon name="link_off" size={18} />공유 멈추기</button>
          </div>
        </div>
        : <button disabled={busy} onClick={() => void run("create")} className={`${btn} mt-6 w-full bg-[var(--md-sys-color-primary)] py-3 text-[var(--md-sys-color-on-primary)]`}><Icon name="add_link" size={20} />{busy ? "만드는 중…" : "공유 링크 만들기"}</button>}
      {err && <p role="alert" className="mt-3 text-sm text-[var(--md-sys-color-error)]">{err}</p>}
    </div>
  </div>;
}
