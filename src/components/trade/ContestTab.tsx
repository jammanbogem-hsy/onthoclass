"use client";

// 주식대회 탭(교사) — 이 학급이 참가 중인 대회 목록과 순위.
// 대회 개설은 메인 화면(학급 목록)에서 한다: 여러 학급을 묶어 합동 대회를 열 수 있고,
// 개설 순간의 계좌가 기준점(baseline)으로 저장되기 때문에 개설 지점을 한 곳으로 모았다.
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui";
import { listStockContests, type ContestMeta } from "@/lib/contest";
import { ContestBoardModal } from "@/components/contest/ContestModals";

export function ContestTab({ cid }: { cid: string }) {
  const router = useRouter();
  const [contests, setContests] = useState<ContestMeta[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const reload = useCallback(() => {
    listStockContests(cid)
      .then(setContests)
      .catch(() => setContests([]));
  }, [cid]);

  useEffect(() => {
    reload();
  }, [reload]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5">
      <div className="flex items-start gap-2 rounded-2xl bg-[var(--md-sys-color-secondary-container)] px-4 py-3 text-xs leading-relaxed text-[var(--md-sys-color-on-secondary-container)]">
        <Icon name="emoji_events" size={16} className="mt-0.5 shrink-0" />
        <span>
          주식대회는 <b>메인 화면(학급 목록)</b>에서 이름을 붙여 열어요. 대회를 여는 순간의
          계좌가 기준점으로 저장되고, 그 뒤로 오르내린 만큼만 겨뤄요. 여러 학급을 함께 묶어
          합동 대회도 열 수 있어요.
        </span>
      </div>

      {contests === null ? (
        <p className="py-10 text-center text-sm text-[var(--md-sys-color-on-surface-variant)]">
          불러오는 중…
        </p>
      ) : contests.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl bg-[var(--md-sys-color-surface-container)] px-4 py-10 text-center">
          <Icon
            name="emoji_events"
            size={36}
            className="text-[var(--md-sys-color-on-surface-variant)]"
          />
          <p className="text-sm font-semibold">이 학급이 참가 중인 대회가 없어요</p>
          <Button icon="open_in_new" onClick={() => router.push("/dashboard")}>
            메인 화면에서 대회 열기
          </Button>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {contests.map((ct) => {
            const done = ct.status === "done";
            return (
              <li key={ct.id}>
                <button
                  onClick={() => setOpenId(ct.id)}
                  className="flex w-full items-center gap-3 rounded-2xl bg-[var(--md-sys-color-surface-container)] px-4 py-3 text-left transition hover:brightness-95"
                >
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
                    style={{
                      background: done
                        ? "var(--md-sys-color-surface-container-highest)"
                        : "color-mix(in srgb, #d9a400 18%, transparent)",
                    }}
                  >
                    <Icon
                      name={done ? "check_circle" : "trophy"}
                      size={20}
                      fill
                      style={{
                        color: done
                          ? "var(--md-sys-color-on-surface-variant)"
                          : "#d9a400",
                      }}
                    />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold">{ct.name}</span>
                    <span className="block truncate text-xs text-[var(--md-sys-color-on-surface-variant)]">
                      {ct.classNames.join(" · ")} · 참가 {ct.participants}명 ·{" "}
                      {done ? "종료됨" : "진행 중"}
                    </span>
                  </span>
                  <Icon
                    name="chevron_right"
                    size={18}
                    className="shrink-0 text-[var(--md-sys-color-on-surface-variant)]"
                  />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {openId && (
        <ContestBoardModal
          contestId={openId}
          onClose={() => setOpenId(null)}
          onChanged={reload}
        />
      )}
    </div>
  );
}
