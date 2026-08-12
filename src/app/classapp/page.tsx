"use client";

// 클래스앱 — 수업 진행 콘솔(교사 전용).
//  좌측: 교안 슬라이드(PDF/이미지, DB 저장 없이 표시만)
//  우측: 학생 불러오기 · 룰렛 추첨/발표자 지정 · 집중 잠금 · 링크 모달 푸시
//  학생 화면 푸시(집중/링크/발표)는 기존 라이브 채널(control/*)로 전송된다.
//  진입: /classapp?cid={학급id}  (각 학급 페이지의 '수업 진행' 버튼)
import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import {
  getClass,
  getMyRole,
  watchMembers,
  type ClassRoom,
  type Member,
} from "@/lib/classes";
import {
  clearClassApp,
  clearLink,
  clearPresenter,
  pushLink,
  setFocusLock,
  setPresenter,
  startPresent,
  stopPresent,
  watchClassApp,
  watchPresent,
  type ClassAppControl,
  type PresentState,
} from "@/lib/live";
import { SlideStage } from "./SlideStage";
import { RoulettePicker } from "./RoulettePicker";

export default function ClassAppPage() {
  return (
    <Suspense fallback={<Centered>불러오는 중…</Centered>}>
      <ClassAppInner />
    </Suspense>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--md-sys-color-surface)] px-6 text-center text-[var(--md-sys-color-on-surface-variant)]">
      {children}
    </main>
  );
}

function ClassAppInner() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const cid = params.get("cid") || params.get("id") || params.get("class");

  const [role, setRole] = useState<"teacher" | "student" | null | "loading">("loading");
  const [room, setRoom] = useState<ClassRoom | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user || !cid) {
      setRole(null);
      return;
    }
    getMyRole(cid, user.uid)
      .then((r) => setRole(r))
      .catch(() => setRole(null));
    getClass(cid).then(setRoom).catch(() => {});
  }, [user, cid, loading]);

  if (loading || role === "loading") return <Centered>불러오는 중…</Centered>;
  if (!user) return <Centered>러닝크루 계정으로 로그인해 주세요.</Centered>;
  if (!cid) return <Centered>학급 정보가 없어요. 학급 페이지에서 ‘수업 진행’으로 들어와 주세요.</Centered>;
  if (role !== "teacher")
    return <Centered>이 화면은 선생님(교사 계정)만 사용할 수 있어요.</Centered>;

  return <Console cid={cid} uid={user.uid} room={room} onExit={() => router.push(`/class/?id=${cid}`)} />;
}

function Console({
  cid,
  uid,
  room,
  onExit,
}: {
  cid: string;
  uid: string;
  room: ClassRoom | null;
  onExit: () => void;
}) {
  const [members, setMembers] = useState<Member[]>([]);
  const [loadedRoster, setLoadedRoster] = useState(false);
  const [present, setPresent] = useState<PresentState | null>(null);
  const [control, setControl] = useState<ClassAppControl | null>(null);

  useEffect(() => watchPresent(cid, setPresent), [cid]);
  useEffect(() => watchClassApp(cid, setControl), [cid]);

  // '학생 불러오기'를 누르면 구독 시작(언마운트 시 자동 해제)
  useEffect(() => {
    if (!loadedRoster) return;
    return watchMembers(cid, setMembers);
  }, [loadedRoster, cid]);

  const students = members.filter((m) => m.role === "student");
  const focusOn = !!control?.focusActive;

  // 콘솔을 떠날 때 학생이 잠긴 채 남지 않도록 모든 제어 해제
  const cleanup = useCallback(() => {
    clearClassApp(cid, uid).catch(() => {});
    stopPresent(cid).catch(() => {});
  }, [cid, uid]);
  useEffect(() => {
    const onUnload = () => cleanup();
    window.addEventListener("pagehide", onUnload);
    return () => window.removeEventListener("pagehide", onUnload);
  }, [cleanup]);

  function exit() {
    cleanup();
    onExit();
  }

  return (
    <main className="flex h-screen flex-col bg-[var(--md-sys-color-surface)]">
      {/* 헤더 */}
      <header className="flex items-center gap-3 border-b border-[var(--md-sys-color-outline-variant)] px-4 py-2">
        <span className="emoji-noto text-xl">🧑‍🏫</span>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-[var(--md-sys-color-on-surface)]">
            {room?.name ?? "수업 진행"}
          </p>
          <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
            클래스앱 · 수업 진행 콘솔
          </p>
        </div>
        {focusOn && (
          <span className="rounded-full bg-[var(--md-sys-color-primary)] px-3 py-1 text-xs font-bold text-[var(--md-sys-color-on-primary)]">
            👀 집중 잠금 중
          </span>
        )}
        <button
          onClick={exit}
          className="ml-auto rounded-full border border-[var(--md-sys-color-outline)] px-4 py-2 text-sm font-bold text-[var(--md-sys-color-on-surface-variant)]"
        >
          수업 종료 →
        </button>
      </header>

      {/* 본문: 좌 슬라이드 / 우 컨트롤 */}
      <div className="flex min-h-0 flex-1 flex-col gap-3 p-3 lg:flex-row">
        <section className="min-h-0 flex-1 lg:basis-2/3">
          <SlideStage />
        </section>

        <aside className="min-h-0 overflow-y-auto lg:basis-1/3 lg:max-w-[420px]">
          <div className="flex flex-col gap-3">
            <FocusCard cid={cid} uid={uid} active={focusOn} message={control?.focusMessage ?? ""} />
            <RosterCard
              loaded={loadedRoster}
              students={students}
              onLoad={() => setLoadedRoster(true)}
              cid={cid}
              uid={uid}
              presenterUid={present?.active ? present.uid : null}
            />
            <LinkCard cid={cid} uid={uid} active={!!control?.linkActive} title={control?.linkTitle ?? ""} url={control?.linkUrl ?? ""} />
          </div>
        </aside>
      </div>
    </main>
  );
}

function Card({ title, children }: { title: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-[var(--md-sys-color-surface-container)] p-4">
      <h2 className="mb-2.5 text-sm font-bold text-[var(--md-sys-color-on-surface)]">{title}</h2>
      {children}
    </section>
  );
}

// ── 집중 잠금 ──
function FocusCard({ cid, uid, active, message }: { cid: string; uid: string; active: boolean; message: string }) {
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (active) setMsg(message); }, [active, message]);

  async function toggle(on: boolean) {
    setBusy(true);
    try {
      await setFocusLock(cid, on, msg, uid);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="👀 집중 잠금">
      <p className="mb-2 text-xs leading-relaxed text-[var(--md-sys-color-on-surface-variant)]">
        켜면 학생 화면이 ‘집중!’ 모달로 덮여 활동이 멈춰요. 끄면 다시 활동할 수 있어요.
      </p>
      <input
        value={msg}
        onChange={(e) => setMsg(e.target.value.slice(0, 60))}
        placeholder="안내 문구(선택) — 예: 칠판을 봐 주세요"
        className="m3-field mb-2 w-full !py-2 text-sm"
      />
      {active ? (
        <button
          onClick={() => toggle(false)}
          disabled={busy}
          className="w-full rounded-full bg-[var(--md-sys-color-primary)] px-4 py-2.5 text-sm font-bold text-[var(--md-sys-color-on-primary)] disabled:opacity-40"
        >
          ✅ 다시 활동 가능하게 (잠금 풀기)
        </button>
      ) : (
        <button
          onClick={() => toggle(true)}
          disabled={busy}
          className="w-full rounded-full border-2 border-[var(--md-sys-color-primary)] px-4 py-2.5 text-sm font-bold text-[var(--md-sys-color-primary)] disabled:opacity-40"
        >
          🔒 집중 모드 켜기
        </button>
      )}
    </Card>
  );
}

// ── 학생 불러오기 + 룰렛 ──
function RosterCard({
  loaded,
  students,
  onLoad,
  cid,
  uid,
  presenterUid,
}: {
  loaded: boolean;
  students: Member[];
  onLoad: () => void;
  cid: string;
  uid: string;
  presenterUid: string | null;
}) {
  async function present(m: Member) {
    await startPresent(cid, uid).catch(() => {});
    await setPresenter(cid, m.uid, m.displayName, "발표를 시작해요!", uid).catch(() => {});
  }
  async function clearPresent() {
    await clearPresenter(cid).catch(() => {});
    await stopPresent(cid).catch(() => {});
  }

  return (
    <Card
      title={
        <span className="flex items-center justify-between">
          🎰 학생 추첨 · 발표자
          {loaded && (
            <span className="text-xs font-medium text-[var(--md-sys-color-on-surface-variant)]">
              {students.length}명
            </span>
          )}
        </span>
      }
    >
      {!loaded ? (
        <button
          onClick={onLoad}
          className="w-full rounded-full bg-[var(--md-sys-color-primary)] px-4 py-2.5 text-sm font-bold text-[var(--md-sys-color-on-primary)]"
        >
          👥 학생 불러오기
        </button>
      ) : students.length === 0 ? (
        <p className="rounded-xl bg-[var(--md-sys-color-surface-container-high)] px-3 py-2 text-xs text-[var(--md-sys-color-on-surface-variant)]">
          아직 이 학급에 가입한 학생이 없어요.
        </p>
      ) : (
        <RoulettePicker
          students={students}
          presenterUid={presenterUid}
          onPresent={present}
          onClearPresent={clearPresent}
        />
      )}
    </Card>
  );
}

// ── 링크 모달 푸시 ──
function LinkCard({ cid, uid, active, title, url }: { cid: string; uid: string; active: boolean; title: string; url: string }) {
  const [t, setT] = useState("");
  const [u, setU] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (active) {
      setT(title);
      setU(url);
    }
  }, [active, title, url]);

  const valid = /^https?:\/\/.+/.test(u.trim());

  async function send() {
    if (!valid || busy) return;
    setBusy(true);
    try {
      await pushLink(cid, u.trim(), t.trim(), uid);
    } finally {
      setBusy(false);
    }
  }
  async function down() {
    setBusy(true);
    try {
      await clearLink(cid, uid);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="🔗 링크 띄우기">
      <p className="mb-2 text-xs leading-relaxed text-[var(--md-sys-color-on-surface-variant)]">
        학생 화면에 링크 모달을 띄워요. 학생은 ‘열기’로 새 탭에서 볼 수 있어요.
      </p>
      <input
        value={t}
        onChange={(e) => setT(e.target.value.slice(0, 60))}
        placeholder="제목(선택) — 예: 오늘의 영상"
        className="m3-field mb-2 w-full !py-2 text-sm"
      />
      <input
        value={u}
        onChange={(e) => setU(e.target.value)}
        placeholder="https://..."
        inputMode="url"
        className="m3-field mb-2 w-full !py-2 text-sm"
      />
      <div className="flex gap-2">
        <button
          onClick={send}
          disabled={!valid || busy}
          className="flex-1 rounded-full bg-[var(--md-sys-color-primary)] px-4 py-2.5 text-sm font-bold text-[var(--md-sys-color-on-primary)] disabled:opacity-40"
        >
          {active ? "다시 띄우기" : "학생 화면에 띄우기"}
        </button>
        {active && (
          <button
            onClick={down}
            disabled={busy}
            className="rounded-full border border-[var(--md-sys-color-outline)] px-4 py-2.5 text-sm font-bold text-[var(--md-sys-color-on-surface-variant)]"
          >
            내리기
          </button>
        )}
      </div>
      {!valid && u.trim() && (
        <p className="mt-1 text-xs text-[var(--md-sys-color-error)]">http:// 또는 https:// 로 시작하는 주소를 넣어 주세요.</p>
      )}
    </Card>
  );
}
