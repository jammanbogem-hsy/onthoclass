"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { GlassCard } from "@/components/Glass";
import { TopBar } from "@/components/TopBar";
import { Icon } from "@/components/Icon";
import { useDialog } from "@/components/Dialog";
import {
  acceptTeam,
  findTeacherByCode,
  getOrCreateTeamCode,
  removeTeamLink,
  requestTeam,
  watchTeamLinks,
  type TeamLink,
} from "@/lib/teams";

export default function TeamPage() {
  const { user, loading, profile, profileLoading } = useAuth();
  const router = useRouter();
  const dialog = useDialog();
  const [myCode, setMyCode] = useState("");
  const [links, setLinks] = useState<TeamLink[]>([]);
  const [codeInput, setCodeInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const myName = profile?.name || user?.displayName || "교사";
  const isTeacher = profile?.role === "teacher";

  useEffect(() => {
    if (!loading && !user) router.replace("/");
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    getOrCreateTeamCode(user.uid).then(setMyCode).catch(() => {});
    return watchTeamLinks(user.uid, setLinks);
  }, [user]);

  if (loading || profileLoading || !user) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <div className="animate-pulse text-sm text-black/40">불러오는 중…</div>
      </main>
    );
  }
  if (!isTeacher) {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <GlassCard className="p-10 text-center">
          <p className="font-semibold">교사만 사용할 수 있습니다.</p>
        </GlassCard>
      </main>
    );
  }

  const incoming = links.filter(
    (l) => l.status === "pending" && l.requestedBy !== user.uid
  );
  const sent = links.filter(
    (l) => l.status === "pending" && l.requestedBy === user.uid
  );
  const teammates = links.filter((l) => l.status === "accepted");
  const other = (l: TeamLink) => l.members.find((m) => m !== user.uid) ?? "";

  async function addByCode() {
    const code = codeInput.trim().toUpperCase();
    if (!code || busy) return;
    setBusy(true);
    try {
      const found = await findTeacherByCode(code);
      if (!found) {
        await dialog.confirm({
          title: "코드 없음",
          body: "해당 코드의 교사를 찾을 수 없습니다.",
          okLabel: "확인",
        });
        return;
      }
      if (found.uid === user!.uid) {
        await dialog.confirm({
          title: "본인 코드",
          body: "본인 코드는 추가할 수 없습니다.",
          okLabel: "확인",
        });
        return;
      }
      await requestTeam(
        { uid: user!.uid, name: myName },
        { uid: found.uid, name: found.name }
      );
      setCodeInput("");
      await dialog.confirm({
        title: "요청 보냄",
        body: `${found.name} 선생님에게 팀 요청을 보냈습니다. 상대가 수락하면 팀이 됩니다.`,
        okLabel: "확인",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <TopBar />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
        <button
          onClick={() => router.push("/dashboard")}
          className="mb-3 inline-flex items-center gap-1 text-sm text-[var(--md-sys-color-on-surface-variant)] transition hover:text-[var(--md-sys-color-on-surface)]"
        >
          <Icon name="arrow_back" size={18} />
          대시보드
        </button>

        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Icon name="groups" size={26} className="text-[var(--md-sys-color-primary)]" />
          교사 팀
        </h1>
        <p className="mt-1 text-sm text-black/55">
          코드를 공유해 팀을 맺으면, 팀원의 학급 활동을 가져올 수 있습니다.
        </p>

        {/* 내 코드 */}
        <GlassCard className="mt-5 p-5">
          <p className="text-sm font-semibold text-black/60">내 팀 코드</p>
          <div className="mt-2 flex items-center gap-3">
            <span className="select-all rounded-2xl bg-[var(--md-sys-color-surface-container-high)] px-5 py-3 text-2xl font-extrabold tracking-[0.3em] text-[var(--md-sys-color-primary)]">
              {myCode || "······"}
            </span>
            <button
              onClick={() => {
                navigator.clipboard?.writeText(myCode);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className="inline-flex items-center gap-1 rounded-full border border-[var(--md-sys-color-outline)] px-4 py-2.5 text-sm font-semibold text-[var(--md-sys-color-primary)] hover:bg-black/5"
            >
              <Icon name={copied ? "check" : "content_copy"} size={16} />
              {copied ? "복사됨" : "코드 복사"}
            </button>
          </div>
        </GlassCard>

        {/* 코드로 추가 */}
        <GlassCard className="mt-4 p-5">
          <p className="text-sm font-semibold text-black/60">팀원 코드로 요청</p>
          <div className="mt-2 flex gap-2">
            <input
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
              placeholder="예: ABC123"
              maxLength={6}
              className="m3-field flex-1 !py-2.5 text-center text-lg font-bold tracking-[0.2em]"
              onKeyDown={(e) => {
                if (e.key === "Enter") addByCode();
              }}
            />
            <button
              onClick={addByCode}
              disabled={busy || codeInput.trim().length < 4}
              className="btn-accent px-5 py-2.5 text-sm font-semibold disabled:opacity-50"
            >
              요청
            </button>
          </div>
        </GlassCard>

        {/* 받은 요청 */}
        {incoming.length > 0 && (
          <GlassCard className="mt-4 p-5">
            <p className="mb-2 text-sm font-semibold text-black/60">
              받은 요청 ({incoming.length})
            </p>
            <ul className="flex flex-col gap-2">
              {incoming.map((l) => (
                <li
                  key={l.id}
                  className="flex items-center gap-2 rounded-xl bg-[var(--md-sys-color-surface-container)] px-3 py-2.5"
                >
                  <Icon name="person" size={18} className="text-black/45" />
                  <span className="flex-1 font-medium">
                    {l.names[other(l)] ?? "교사"}
                  </span>
                  <button
                    onClick={() => acceptTeam(l.id)}
                    className="btn-accent px-3 py-1.5 text-xs font-semibold"
                  >
                    수락
                  </button>
                  <button
                    onClick={() => removeTeamLink(l.id)}
                    className="rounded-full border border-[var(--md-sys-color-outline)] px-3 py-1.5 text-xs font-medium text-black/55 hover:bg-black/5"
                  >
                    거절
                  </button>
                </li>
              ))}
            </ul>
          </GlassCard>
        )}

        {/* 팀원 */}
        <GlassCard className="mt-4 p-5">
          <p className="mb-2 text-sm font-semibold text-black/60">
            내 팀원 ({teammates.length})
          </p>
          {teammates.length === 0 ? (
            <p className="py-4 text-center text-sm text-black/40">
              아직 팀원이 없습니다. 코드를 주고받아 팀을 맺어보세요.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {teammates.map((l) => (
                <li
                  key={l.id}
                  className="flex items-center gap-2 rounded-xl bg-[var(--md-sys-color-primary-container)] px-3 py-2.5"
                >
                  <Icon
                    name="verified"
                    size={18}
                    className="text-[var(--md-sys-color-primary)]"
                  />
                  <span className="flex-1 font-medium text-[var(--md-sys-color-on-primary-container)]">
                    {l.names[other(l)] ?? "교사"}
                  </span>
                  <button
                    onClick={() => removeTeamLink(l.id)}
                    className="rounded-full px-3 py-1.5 text-xs font-medium text-black/45 hover:bg-black/10"
                  >
                    팀 해제
                  </button>
                </li>
              ))}
            </ul>
          )}
        </GlassCard>

        {/* 보낸 요청 */}
        {sent.length > 0 && (
          <GlassCard className="mt-4 p-5">
            <p className="mb-2 text-sm font-semibold text-black/60">
              보낸 요청 ({sent.length})
            </p>
            <ul className="flex flex-col gap-2">
              {sent.map((l) => (
                <li
                  key={l.id}
                  className="flex items-center gap-2 rounded-xl bg-[var(--md-sys-color-surface-container)] px-3 py-2.5 text-sm"
                >
                  <Icon name="schedule" size={16} className="text-black/40" />
                  <span className="flex-1">
                    {l.names[other(l)] ?? "교사"} · 수락 대기 중
                  </span>
                  <button
                    onClick={() => removeTeamLink(l.id)}
                    className="rounded-full px-3 py-1 text-xs text-black/45 hover:bg-black/10"
                  >
                    취소
                  </button>
                </li>
              ))}
            </ul>
          </GlassCard>
        )}
      </main>
    </>
  );
}
