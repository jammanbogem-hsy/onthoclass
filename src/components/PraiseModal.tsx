"use client";

import { useEffect, useRef, useState } from "react";
import type { User } from "firebase/auth";
import { Icon } from "@/components/Icon";
import type { Member } from "@/lib/classes";
import { sendPraises, sendCrossPraise, type CrossPeer } from "@/lib/praise";
import { suggestCrossPraiseNames } from "@/lib/ai";

/** 친구 칭찬하기 — 우리 반(여러 명 선택) 또는 다른 반(이름 입력) → 교사 승인 후 전달(익명) */
export function PraiseModal({
  cid,
  className,
  fromUser,
  friends,
  peers = [],
  onClose,
  onSent,
}: {
  cid: string;
  className: string; // 우리 반 이름(다른 반 칭찬 시 출처 표시용)
  fromUser: User;
  friends: Member[]; // 칭찬 대상(본인 제외 학생)
  peers?: CrossPeer[]; // 칭찬 가능한 다른 반(교사 연결). 없으면 다른 반 탭 숨김
  onClose: () => void;
  onSent: () => void; // 전송 성공 → 상위에서 큰 대기 효과 표시
}) {
  const [tab, setTab] = useState<"same" | "other">("same");

  // 우리 반: 여러 친구 토글 선택
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // 다른 반: 대상 반 + 친구 이름(자동완성)
  const [targetCid, setTargetCid] = useState<string>(peers[0]?.cid ?? "");
  const [friendName, setFriendName] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [picked, setPicked] = useState(false); // 추천에서 고른 직후엔 목록 숨김

  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // peers 가 마운트 후에 비동기로 도착하면 targetCid 가 ""로 남아 전송이 막힌다 → 동기화.
  useEffect(() => {
    if (!targetCid && peers.length > 0) setTargetCid(peers[0].cid);
  }, [peers, targetCid]);

  function toggle(uid: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  }

  // 다른 반 친구 이름 자동완성(디바운스 300ms)
  const reqIdRef = useRef(0);
  useEffect(() => {
    if (tab !== "other" || !targetCid || picked) {
      setSuggestions([]);
      return;
    }
    const q = friendName.trim();
    if (q.length < 1) {
      setSuggestions([]);
      return;
    }
    const myId = ++reqIdRef.current;
    const t = setTimeout(() => {
      suggestCrossPraiseNames({ targetCid, prefix: q })
        .then((names) => {
          if (myId === reqIdRef.current) setSuggestions(names);
        })
        .catch(() => {
          if (myId === reqIdRef.current) setSuggestions([]);
        });
    }, 300);
    return () => clearTimeout(t);
  }, [tab, targetCid, friendName, picked]);

  const canSend =
    !busy &&
    reason.trim().length > 0 &&
    (tab === "same"
      ? selected.size > 0
      : !!targetCid && friendName.trim().length > 0);

  async function send() {
    if (!canSend) return;
    setBusy(true);
    setErr("");
    try {
      if (tab === "same") {
        const targets = friends
          .filter((f) => selected.has(f.uid))
          .map((f) => ({ uid: f.uid, name: f.displayName }));
        await sendPraises(cid, fromUser, targets, reason);
      } else {
        await sendCrossPraise(
          targetCid,
          fromUser,
          cid,
          className,
          friendName,
          reason
        );
      }
      onSent();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-[rgba(0,0,0,0.32)] p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-3xl bg-[var(--md-sys-color-surface-container-high)] shadow-[var(--md-sys-elevation-3)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-[var(--md-sys-color-outline-variant)] px-5 py-4">
          <Icon
            name="favorite"
            size={20}
            className="text-[var(--md-sys-color-primary)]"
          />
          <p className="text-lg font-semibold">친구 칭찬하기</p>
          <button
            onClick={onClose}
            className="ml-auto flex h-9 w-9 items-center justify-center rounded-full text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-highest)]"
          >
            <Icon name="close" size={20} />
          </button>
        </div>

        {/* 우리 반 / 다른 반 탭 (연결된 다른 반이 있을 때만 노출) */}
        {peers.length > 0 && (
          <div className="flex gap-1.5 px-5 pt-4">
            {(
              [
                ["same", "우리 반"],
                ["other", "다른 반"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                onClick={() => {
                  setTab(k);
                  setErr("");
                }}
                className={`flex-1 rounded-full px-3 py-2 text-sm font-semibold transition ${
                  tab === k
                    ? "bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)]"
                    : "border border-[var(--md-sys-color-outline)] text-[var(--md-sys-color-on-surface-variant)]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-4 overflow-y-auto p-5">
          {tab === "same" ? (
            <div>
              <p className="mb-2 text-sm font-semibold">
                누구를 칭찬할까요?{" "}
                <span className="font-normal text-[var(--md-sys-color-on-surface-variant)]">
                  (여러 명 선택 가능)
                </span>
              </p>
              {friends.length === 0 ? (
                <p className="rounded-xl bg-[var(--md-sys-color-surface-container)] px-3 py-4 text-center text-sm text-[var(--md-sys-color-on-surface-variant)]">
                  칭찬할 친구가 아직 없어요.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {friends.map((f) => {
                    const on = selected.has(f.uid);
                    return (
                      <button
                        key={f.uid}
                        onClick={() => toggle(f.uid)}
                        aria-pressed={on}
                        className={`inline-flex items-center gap-1 rounded-full px-3.5 py-2 text-sm font-semibold transition ${
                          on
                            ? "bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)]"
                            : "bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface)] hover:bg-[var(--md-sys-color-surface-container-highest)]"
                        }`}
                      >
                        {on && <Icon name="check" size={14} />}
                        {f.displayName}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div>
                <p className="mb-2 text-sm font-semibold">어느 반인가요?</p>
                <select
                  value={targetCid}
                  onChange={(e) => {
                    setTargetCid(e.target.value);
                    setFriendName("");
                    setSuggestions([]);
                    setPicked(false);
                  }}
                  className="m3-field w-full"
                >
                  {peers.map((p) => (
                    <option key={p.cid} value={p.cid}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="relative">
                <p className="mb-2 text-sm font-semibold">친구 이름</p>
                <input
                  value={friendName}
                  onChange={(e) => {
                    setFriendName(e.target.value);
                    setPicked(false);
                  }}
                  maxLength={20}
                  placeholder="예: 김민수"
                  className="m3-field w-full"
                />
                {suggestions.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {suggestions.map((n) => (
                      <button
                        key={n}
                        onClick={() => {
                          setFriendName(n);
                          setPicked(true);
                          setSuggestions([]);
                        }}
                        className="rounded-full bg-[var(--md-sys-color-surface-container)] px-3 py-1.5 text-sm font-semibold text-[var(--md-sys-color-on-surface)] hover:bg-[var(--md-sys-color-surface-container-highest)]"
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                )}
                <p className="mt-1 text-xs text-[var(--md-sys-color-on-surface-variant)]">
                  이름을 입력하면 그 반 친구 이름을 추천해 줘요.
                </p>
              </div>
            </div>
          )}

          <div>
            <p className="mb-2 text-sm font-semibold">칭찬하는 이유를 써주세요</p>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              maxLength={200}
              placeholder="예: 내가 어려워할 때 친절하게 도와줬어요!"
              className="m3-field w-full resize-none"
            />
            <p className="mt-1 text-right text-xs text-[var(--md-sys-color-on-surface-variant)]">
              {reason.length}/200
            </p>
          </div>

          <p className="rounded-xl bg-[var(--md-sys-color-surface-container)] px-3 py-2 text-xs text-[var(--md-sys-color-on-surface-variant)]">
            <Icon name="info" size={13} className="-mt-0.5 mr-1 inline" />
            {tab === "same"
              ? "친구에게는 누가 칭찬했는지 보이지 않아요(익명). 선생님 승인 후 전달돼요."
              : "다른 반 선생님이 이름을 확인하고 승인하면 친구에게 전달돼요(익명)."}
          </p>

          {err && (
            <p className="rounded-xl bg-[var(--md-sys-color-error-container)] px-3 py-2 text-xs text-[var(--md-sys-color-on-error-container)]">
              보내기 실패: {err}
            </p>
          )}
          <button
            onClick={send}
            disabled={!canSend}
            className="inline-flex items-center justify-center gap-1.5 rounded-full bg-[var(--md-sys-color-primary)] px-4 py-2.5 text-sm font-bold text-[var(--md-sys-color-on-primary)] transition hover:brightness-105 disabled:opacity-40"
          >
            <Icon name="send" size={16} />
            {busy
              ? "보내는 중…"
              : tab === "same" && selected.size > 1
                ? `${selected.size}명에게 칭찬 보내기`
                : "칭찬 보내기"}
          </button>
        </div>
      </div>
    </div>
  );
}
