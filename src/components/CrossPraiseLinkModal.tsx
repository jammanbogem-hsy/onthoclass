"use client";

// 교사용: 이 반 학생들이 칭찬을 보낼 수 있는 "다른 반"을 연결.
// 선택한 반들은 control/crossPraise(allowedCids)에 저장되고, 보안 규칙이
// 그 목록에 포함된 반에만 다른 반 칭찬 작성을 허용한다.
import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { listMyClasses, type ClassRoom } from "@/lib/classes";
import { listCrossPeers, setCrossPeers, type CrossPeer } from "@/lib/praise";

export function CrossPraiseLinkModal({
  cid,
  teacherUid,
  onClose,
}: {
  cid: string;
  teacherUid: string;
  onClose: () => void;
}) {
  const [candidates, setCandidates] = useState<ClassRoom[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let alive = true;
    Promise.all([listMyClasses(teacherUid), listCrossPeers(cid)])
      .then(([classes, peers]) => {
        if (!alive) return;
        setCandidates(classes.filter((c) => c.id !== cid));
        setSelected(new Set(peers.map((p) => p.cid)));
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [cid, teacherUid]);

  function toggle(id: string) {
    setSaved(false);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function save() {
    setBusy(true);
    try {
      const peers: CrossPeer[] = candidates
        .filter((c) => selected.has(c.id))
        .map((c) => ({ cid: c.id, name: c.name || "이름 없는 반" }));
      await setCrossPeers(cid, peers);
      setSaved(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-[rgba(0,0,0,0.32)] p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-3xl bg-[var(--md-sys-color-surface-container-high)] shadow-[var(--md-sys-elevation-3)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-[var(--md-sys-color-outline-variant)] px-5 py-4">
          <Icon name="link" size={20} className="text-[var(--md-sys-color-primary)]" />
          <p className="text-lg font-semibold">다른 반 칭찬 연결</p>
          <button
            onClick={onClose}
            className="ml-auto flex h-9 w-9 items-center justify-center rounded-full text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-highest)]"
          >
            <Icon name="close" size={20} />
          </button>
        </div>

        <div className="flex flex-col gap-3 overflow-y-auto p-5">
          <p className="rounded-xl bg-[var(--md-sys-color-surface-container)] px-3 py-2 text-xs text-[var(--md-sys-color-on-surface-variant)]">
            <Icon name="info" size={13} className="-mt-0.5 mr-1 inline" />
            선택한 반은 <b>우리 반 학생이 칭찬을 보낼 수 있는 다른 반</b>이 돼요. 받는
            반 선생님이 이름을 확인하고 승인하면 그 반 온도가 올라가요.
          </p>

          {loading ? (
            <p className="px-2 py-8 text-center text-sm text-[var(--md-sys-color-on-surface-variant)]">
              불러오는 중…
            </p>
          ) : candidates.length === 0 ? (
            <p className="px-2 py-8 text-center text-sm text-[var(--md-sys-color-on-surface-variant)]">
              연결할 다른 반이 없어요. 먼저 다른 학급을 만들어 주세요.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {candidates.map((c) => {
                const on = selected.has(c.id);
                return (
                  <button
                    key={c.id}
                    onClick={() => toggle(c.id)}
                    aria-pressed={on}
                    className={`flex items-center gap-2 rounded-2xl px-4 py-3 text-left text-sm font-semibold transition ${
                      on
                        ? "bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)]"
                        : "bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface)] hover:bg-[var(--md-sys-color-surface-container-highest)]"
                    }`}
                  >
                    <span
                      className={`flex h-5 w-5 items-center justify-center rounded-md border ${
                        on
                          ? "border-[var(--md-sys-color-on-primary)]"
                          : "border-[var(--md-sys-color-outline)]"
                      }`}
                    >
                      {on && <Icon name="check" size={14} />}
                    </span>
                    {c.name || "(이름 없는 반)"}
                  </button>
                );
              })}
            </div>
          )}

          <button
            onClick={save}
            disabled={busy || loading}
            className="mt-1 inline-flex items-center justify-center gap-1.5 rounded-full bg-[var(--md-sys-color-primary)] px-4 py-2.5 text-sm font-bold text-[var(--md-sys-color-on-primary)] transition hover:brightness-105 disabled:opacity-40"
          >
            {busy ? "저장 중…" : saved ? "저장됨 ✓" : "연결 저장"}
          </button>
        </div>
      </div>
    </div>
  );
}
