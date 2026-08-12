"use client";

import { useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { mergeStudentProfiles } from "@/lib/users";
import type { Member } from "@/lib/classes";

/**
 * 교사용 — 같은 학생의 두 프로필 합치기.
 *  fromUid(합칠=삭제될 프로필)의 데이터를 toUid(남길 keeper)로 서버에서 이전한 뒤
 *  fromUid 멤버를 명단에서 제거한다. 되돌릴 수 없음(서버에 감사 로그는 남음).
 */
export function MergeProfilesModal({
  cid,
  students,
  onClose,
  onMerged,
}: {
  cid: string;
  students: Member[];
  onClose: () => void;
  onMerged: () => void;
}) {
  const [fromUid, setFromUid] = useState(""); // 합칠(삭제) 프로필
  const [toUid, setToUid] = useState(""); // 남길 프로필
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState<{ count: number; errors: string[] } | null>(
    null
  );

  const byUid = useMemo(
    () => new Map(students.map((s) => [s.uid, s])),
    [students]
  );
  const from = byUid.get(fromUid);
  const to = byUid.get(toUid);
  const ready = !!from && !!to && fromUid !== toUid;

  // 같은 이름이 많아 헷갈리지 않도록 이름 + 짧은 식별자 + 가입일
  const label = (s: Member) => {
    const d = s.joinedAt ? new Date(s.joinedAt) : null;
    const when = d ? `${d.getMonth() + 1}/${d.getDate()} 가입` : "";
    return `${s.displayName || "이름없음"} · #${s.uid.slice(-4)}${
      when ? ` · ${when}` : ""
    }`;
  };

  async function doMerge() {
    if (!ready || busy) return;
    setBusy(true);
    setErr("");
    try {
      const res = await mergeStudentProfiles(cid, fromUid, toUid);
      const count = Object.values(res.moved).reduce((a, b) => a + b, 0);
      setDone({ count, errors: res.errors });
      onMerged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "합치기에 실패했습니다.");
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  }

  const Avatar = ({ s }: { s: Member }) =>
    s.photoURL ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={s.photoURL}
        alt=""
        className="h-8 w-8 shrink-0 rounded-lg object-cover"
      />
    ) : (
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--md-sys-color-primary-container)] text-xs font-bold text-[var(--md-sys-color-on-primary-container)]">
        {(s.displayName || "?").slice(0, 1)}
      </span>
    );

  const PickList = ({
    value,
    onPick,
    disabledUid,
  }: {
    value: string;
    onPick: (uid: string) => void;
    disabledUid: string;
  }) => (
    <div className="max-h-52 overflow-y-auto rounded-xl border border-[var(--md-sys-color-outline-variant)]">
      {students.map((s) => {
        const on = value === s.uid;
        const dis = disabledUid === s.uid;
        return (
          <button
            key={s.uid}
            type="button"
            disabled={dis}
            onClick={() => onPick(s.uid)}
            className={`flex w-full items-center gap-2 border-b border-[var(--md-sys-color-outline-variant)] px-2.5 py-2 text-left text-sm last:border-0 transition ${
              on
                ? "bg-[color-mix(in_srgb,var(--md-sys-color-primary)_14%,transparent)]"
                : dis
                  ? "cursor-not-allowed opacity-30"
                  : "hover:bg-black/5"
            }`}
          >
            <Avatar s={s} />
            <span className="min-w-0 flex-1 truncate">{label(s)}</span>
            {on && (
              <Icon
                name="check_circle"
                size={16}
                className="shrink-0 text-[var(--md-sys-color-primary)]"
              />
            )}
          </button>
        );
      })}
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-[var(--md-sys-color-surface)] shadow-[var(--md-sys-elevation-3)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--md-sys-color-outline-variant)] px-5 py-3">
          <h2 className="flex items-center gap-2 text-base font-bold">
            <Icon name="merge" size={18} className="text-[var(--md-sys-color-primary)]" />
            프로필 합치기
          </h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-black/40 hover:bg-black/10"
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {done ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <Icon name="check_circle" size={44} className="text-[var(--md-sys-color-primary)]" />
              <p className="text-sm font-semibold">합치기 완료</p>
              <p className="text-xs text-black/55">
                데이터 {done.count}건을 옮기고 중복 프로필을 명단에서 삭제했어요.
              </p>
              {done.errors.length > 0 && (
                <p className="rounded-lg bg-[var(--md-sys-color-error-container)] px-3 py-2 text-xs text-[var(--md-sys-color-on-error-container)]">
                  일부 항목({done.errors.length})은 잠시 후 다시 시도하면 마저
                  반영됩니다.
                </p>
              )}
              <button
                onClick={onClose}
                className="btn-accent mt-1 px-5 py-2 text-sm font-semibold"
              >
                닫기
              </button>
            </div>
          ) : (
            <>
              <p className="mb-3 rounded-xl bg-[var(--md-sys-color-surface-container)] px-3 py-2.5 text-xs leading-relaxed text-black/60">
                같은 학생의 두 프로필을 하나로 합칩니다. <b>합칠 프로필</b>의
                경험치·제출물·캔버스 등 데이터가 <b>남길 프로필</b>로 옮겨지고,
                합친 프로필은 명단에서 사라집니다. (경험치·만보는 두 쪽이 합산)
              </p>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="mb-1 text-xs font-bold text-[var(--md-sys-color-error)]">
                    합칠 프로필 (삭제됨)
                  </p>
                  <PickList
                    value={fromUid}
                    onPick={setFromUid}
                    disabledUid={toUid}
                  />
                </div>
                <div>
                  <p className="mb-1 text-xs font-bold text-[var(--md-sys-color-primary)]">
                    남길 프로필 (keeper)
                  </p>
                  <PickList
                    value={toUid}
                    onPick={setToUid}
                    disabledUid={fromUid}
                  />
                </div>
              </div>

              {ready && from && to && (
                <div className="mt-3 flex items-center justify-center gap-2 rounded-xl bg-[var(--md-sys-color-surface-container)] px-3 py-2.5 text-sm">
                  <span className="truncate font-semibold text-[var(--md-sys-color-error)]">
                    {from.displayName}#{from.uid.slice(-4)}
                  </span>
                  <Icon name="arrow_forward" size={16} className="shrink-0 text-black/40" />
                  <span className="truncate font-semibold text-[var(--md-sys-color-primary)]">
                    {to.displayName}#{to.uid.slice(-4)}
                  </span>
                </div>
              )}

              {err && (
                <p className="mt-2 rounded-lg bg-[var(--md-sys-color-error-container)] px-3 py-2 text-xs text-[var(--md-sys-color-on-error-container)]">
                  {err}
                </p>
              )}
            </>
          )}
        </div>

        {!done && (
          <div className="border-t border-[var(--md-sys-color-outline-variant)] px-5 py-3">
            {confirming ? (
              <div className="flex flex-col gap-2">
                <p className="text-center text-xs font-semibold text-[var(--md-sys-color-error)]">
                  되돌릴 수 없습니다. 정말 합칠까요?
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setConfirming(false)}
                    disabled={busy}
                    className="flex-1 rounded-full border border-[var(--md-sys-color-outline)] py-2.5 text-sm font-semibold disabled:opacity-50"
                  >
                    취소
                  </button>
                  <button
                    onClick={doMerge}
                    disabled={busy}
                    className="flex-1 rounded-full bg-[var(--md-sys-color-error)] py-2.5 text-sm font-bold text-white disabled:opacity-50"
                  >
                    {busy ? "합치는 중…" : "네, 합칩니다"}
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setConfirming(true)}
                disabled={!ready}
                className="btn-accent w-full py-2.5 text-sm font-bold disabled:opacity-40"
              >
                합치기
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
