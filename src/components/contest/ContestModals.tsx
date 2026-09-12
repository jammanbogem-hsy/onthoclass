"use client";

// 주식대회 개설/결과 모달 — 메인 화면(대시보드)·학급 트레이딩 관리·학생 화면이 함께 쓴다.
//  · CreateContestModal : 이름 + 참가 학급(다중) + 등수 기준 2택 → createStockContest
//  · ContestBoardModal  : 순위 조회 + 기준 전환 + 종료/삭제(개설 교사만)
// 대회 데이터는 규칙에서 클라이언트 접근을 막아 두었으므로 전부 callable 로만 오간다.
import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { Button, TextField, Textarea } from "@/components/ui";
import {
  CONTEST_METRICS,
  createStockContest,
  deleteStockContest,
  finishStockContest,
  getStockContestStandings,
  type ContestMeta,
  type ContestMetric,
  type ContestStanding,
} from "@/lib/contest";
import { refreshTradingPrices } from "@/lib/trading";
import { ContestStandings } from "@/components/contest/ContestStandings";

function Shell({
  title,
  subtitle,
  icon,
  onClose,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  icon: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-[rgba(0,0,0,0.4)] p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-[var(--md-sys-color-surface-container-high)] shadow-[var(--md-sys-elevation-3)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-[var(--md-sys-color-outline-variant)] px-5 py-4">
          <Icon name={icon} size={22} className="text-[var(--md-sys-color-primary)]" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-semibold">{title}</p>
            {subtitle && (
              <p className="truncate text-xs text-[var(--md-sys-color-on-surface-variant)]">
                {subtitle}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-highest)]"
          >
            <Icon name="close" size={20} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
        {footer && (
          <div className="flex flex-wrap items-center gap-2 border-t border-[var(--md-sys-color-outline-variant)] px-5 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- 개설 ----------
export function CreateContestModal({
  classes,
  /** 미리 골라둘 학급(학급 화면에서 열었을 때) */
  presetCid,
  onClose,
  onCreated,
}: {
  classes: { id: string; name: string }[];
  presetCid?: string;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [picked, setPicked] = useState<Set<string>>(
    () => new Set(presetCid ? [presetCid] : [])
  );
  const [metric, setMetric] = useState<ContestMetric>("pct");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // 입력을 고치면 이전 경고는 지운다 — 이름을 다 적었는데도 "이름을 정해 주세요"가
  // 남아 있으면 무엇이 문제인지 헷갈린다.
  function edit<T>(setter: (v: T) => void) {
    return (v: T) => {
      setter(v);
      setErr("");
    };
  }

  function toggle(cid: string) {
    setErr("");
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(cid)) next.delete(cid);
      else next.add(cid);
      return next;
    });
  }

  async function submit() {
    if (busy) return;
    const title = name.trim();
    if (!title) return setErr("대회 이름을 정해 주세요.");
    if (picked.size === 0) return setErr("참가할 학급을 하나 이상 골라 주세요.");
    setBusy(true);
    setErr("");
    try {
      // 개설 순간의 평가액이 baseline 이 되므로 시세를 먼저 최신으로 당겨둔다.
      await refreshTradingPrices().catch(() => {});
      const id = await createStockContest(title, desc.trim(), [...picked], metric);
      onCreated(id);
    } catch (e) {
      setErr((e as Error)?.message || "대회를 열지 못했어요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell
      title="주식대회 열기"
      subtitle="지금부터의 성과로 등수를 매겨요"
      icon="emoji_events"
      onClose={onClose}
      footer={
        <>
          {err && (
            <span className="text-sm font-semibold text-[var(--md-sys-color-error)]">
              {err}
            </span>
          )}
          <div className="ml-auto flex gap-2">
            <Button variant="text" onClick={onClose}>
              취소
            </Button>
            <Button onClick={submit} disabled={busy}>
              {busy ? "여는 중…" : "대회 열기"}
            </Button>
          </div>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="flex items-start gap-2 rounded-2xl bg-[var(--md-sys-color-secondary-container)] px-4 py-3 text-xs leading-relaxed text-[var(--md-sys-color-on-secondary-container)]">
          <Icon name="info" size={16} className="mt-0.5 shrink-0" />
          <span>
            대회를 여는 <b>지금 이 순간의 계좌</b>를 기준점으로 저장해요. 그 뒤로 오르내린
            만큼만 겨루니, 전에 이미 많이 벌어둔 학생이 유리하지 않아요.
          </span>
        </div>

        <TextField
          label="대회 이름"
          value={name}
          onChange={(e) => edit(setName)(e.target.value)}
          maxLength={40}
          counter
          placeholder="예) 2학기 만보 투자왕 대회"
        />

        <Textarea
          label="대회 설명 (선택)"
          supporting="학생들이 대회를 열어볼 때 이 글이 맨 위에 보여요. 대회 취지나 규칙, 상품 같은 걸 적어 주세요."
          value={desc}
          onChange={(e) => edit(setDesc)(e.target.value)}
          maxLength={300}
          counter
          rows={3}
          placeholder="예) 우리 반 투자왕을 뽑습니다! 한 종목에 몰지 말고 나눠서 투자해 보세요. 1등에게는 칭찬 도장 5개!"
        />

        <div>
          <p className="mb-1.5 text-sm font-bold">
            참가 학급{" "}
            <span className="text-[var(--md-sys-color-primary)]">{picked.size}</span>
            <span className="font-normal text-[var(--md-sys-color-on-surface-variant)]">
              /{classes.length}개 · 고른 학급의 학생 전원이 참가해요
            </span>
          </p>
          {classes.length === 0 ? (
            <p className="rounded-2xl bg-[var(--md-sys-color-surface-container)] py-6 text-center text-sm text-[var(--md-sys-color-on-surface-variant)]">
              담당하는 학급이 없어요.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {classes.map((c) => {
                const on = picked.has(c.id);
                return (
                  <button
                    key={c.id}
                    onClick={() => toggle(c.id)}
                    aria-pressed={on}
                    className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[13px] font-semibold transition ${
                      on
                        ? "bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)]"
                        : "border border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface-variant)]"
                    }`}
                  >
                    <Icon
                      name={on ? "check_circle" : "radio_button_unchecked"}
                      size={15}
                      fill={on}
                    />
                    {c.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div>
          <p className="mb-1.5 text-sm font-bold">등수 기준</p>
          <div className="grid grid-cols-2 gap-1.5">
            {CONTEST_METRICS.map((m) => {
              const on = m.key === metric;
              return (
                <button
                  key={m.key}
                  onClick={() => setMetric(m.key)}
                  aria-pressed={on}
                  className={`rounded-xl px-3 py-2.5 text-sm font-bold transition ${
                    on
                      ? "bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)] shadow-[var(--md-sys-elevation-1)]"
                      : "bg-[var(--md-sys-color-surface-container-highest)] text-[var(--md-sys-color-on-surface-variant)] hover:brightness-95"
                  }`}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-[var(--md-sys-color-on-surface-variant)]">
            {CONTEST_METRICS.find((m) => m.key === metric)?.desc}
            {" 결과 화면에서 언제든 바꿔 볼 수 있어요."}
          </p>
        </div>
      </div>
    </Shell>
  );
}

// ---------- 결과(순위) ----------
export function ContestBoardModal({
  contestId,
  myUid,
  onClose,
  onChanged,
}: {
  contestId: string;
  /** 학생 화면에서 내 줄을 강조 */
  myUid?: string;
  onClose: () => void;
  /** 종료/삭제 후 목록을 새로 고칠 수 있게 알린다. */
  onChanged?: () => void;
}) {
  const [contest, setContest] = useState<ContestMeta | null>(null);
  const [rows, setRows] = useState<ContestStanding[] | null>(null);
  const [metric, setMetric] = useState<ContestMetric>("pct");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [confirmFinish, setConfirmFinish] = useState(false);

  // 시세를 먼저 최신으로 당긴 뒤 순위를 받는다(평가액이 곧 순위라서).
  const applyStandings = useCallback(
    (res: { contest: ContestMeta; rows: ContestStanding[] }) => {
      setContest(res.contest);
      setRows(res.rows);
      setMetric(res.contest.metric);
      setErr("");
    },
    []
  );

  useEffect(() => {
    let alive = true;
    refreshTradingPrices()
      .catch(() => undefined)
      .then(() => getStockContestStandings(contestId))
      .then((res) => alive && applyStandings(res))
      .catch((e: Error) => {
        if (!alive) return;
        setErr(e?.message || "순위를 불러오지 못했어요.");
        setRows([]);
      });
    return () => {
      alive = false;
    };
  }, [contestId, applyStandings]);

  /** 새로고침 버튼 — 시세 갱신 후 순위 재계산. */
  async function reload() {
    try {
      await refreshTradingPrices().catch(() => {});
      applyStandings(await getStockContestStandings(contestId));
    } catch (e) {
      setErr((e as Error)?.message || "순위를 불러오지 못했어요.");
    }
  }

  async function finish() {
    if (busy) return;
    setBusy(true);
    try {
      const finalRows = await finishStockContest(contestId);
      setRows(finalRows);
      setContest((c) => (c ? { ...c, status: "done" } : c));
      setConfirmFinish(false);
      onChanged?.();
    } catch (e) {
      setErr((e as Error)?.message || "종료하지 못했어요.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (busy) return;
    setBusy(true);
    try {
      await deleteStockContest(contestId);
      onChanged?.();
      onClose();
    } catch (e) {
      setErr((e as Error)?.message || "삭제하지 못했어요.");
      setBusy(false);
    }
  }

  const done = contest?.status === "done";

  return (
    <Shell
      title={contest?.name ?? "주식대회"}
      subtitle={
        contest
          ? `${contest.classNames.join(" · ")} · 참가 ${contest.participants}명 · ${
              done ? "종료됨" : "진행 중"
            }`
          : "불러오는 중…"
      }
      icon="emoji_events"
      onClose={onClose}
      footer={
        contest?.isOwner ? (
          <>
            {err && (
              <span className="text-sm font-semibold text-[var(--md-sys-color-error)]">
                {err}
              </span>
            )}
            <div className="ml-auto flex flex-wrap gap-2">
              <Button variant="text" onClick={remove} disabled={busy}>
                대회 삭제
              </Button>
              {!done &&
                (confirmFinish ? (
                  <>
                    <Button variant="text" onClick={() => setConfirmFinish(false)}>
                      취소
                    </Button>
                    <Button onClick={finish} disabled={busy}>
                      {busy ? "확정 중…" : "정말 종료하기"}
                    </Button>
                  </>
                ) : (
                  <Button onClick={() => setConfirmFinish(true)}>대회 종료</Button>
                ))}
            </div>
          </>
        ) : (
          err && (
            <span className="text-sm font-semibold text-[var(--md-sys-color-error)]">
              {err}
            </span>
          )
        )
      }
    >
      <div className="flex flex-col gap-3">
        {/* 선생님이 붙인 대회 설명 */}
        {contest?.desc && (
          <p className="whitespace-pre-wrap rounded-2xl bg-[var(--md-sys-color-secondary-container)] px-4 py-3 text-sm leading-relaxed text-[var(--md-sys-color-on-secondary-container)]">
            {contest.desc}
          </p>
        )}

        {/* 등수 기준 전환 + 새로고침 */}
        <div className="flex flex-wrap items-center gap-1.5">
          {CONTEST_METRICS.map((m) => {
            const on = m.key === metric;
            return (
              <button
                key={m.key}
                onClick={() => setMetric(m.key)}
                aria-pressed={on}
                className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
                  on
                    ? "bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)]"
                    : "border border-[var(--md-sys-color-outline)] text-[var(--md-sys-color-on-surface-variant)]"
                }`}
              >
                {m.label}
              </button>
            );
          })}
          {!done && (
            <button
              onClick={reload}
              className="ml-auto inline-flex items-center gap-1 rounded-full border border-[var(--md-sys-color-outline)] px-3 py-1.5 text-xs font-bold text-[var(--md-sys-color-on-surface-variant)]"
            >
              <Icon name="refresh" size={14} />
              새로고침
            </button>
          )}
        </div>

        {confirmFinish && (
          <p className="rounded-2xl bg-[var(--md-sys-color-error-container)] px-4 py-3 text-sm text-[var(--md-sys-color-on-error-container)]">
            지금 순위 그대로 결과가 <b>확정</b>돼요. 종료한 뒤에는 시세가 변해도 등수가
            바뀌지 않아요.
          </p>
        )}
        {done && (
          <p className="rounded-2xl bg-[var(--md-sys-color-surface-container)] px-4 py-2.5 text-xs text-[var(--md-sys-color-on-surface-variant)]">
            {contest?.finishedAt
              ? `${new Date(contest.finishedAt).toLocaleString("ko-KR", {
                  timeZone: "Asia/Seoul",
                  month: "long",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}에 종료된 대회예요. 결과는 그때 그대로 보관돼요.`
              : "종료된 대회예요."}
          </p>
        )}

        {rows === null ? (
          <p className="py-10 text-center text-sm text-[var(--md-sys-color-on-surface-variant)]">
            순위를 계산하는 중…
          </p>
        ) : (
          <ContestStandings
            rows={rows}
            metric={metric}
            showClass={(contest?.cids.length ?? 0) > 1}
            myUid={myUid}
          />
        )}
      </div>
    </Shell>
  );
}
