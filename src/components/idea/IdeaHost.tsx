"use client";

// 아이디어 섬 — 진행자 화면(/idea/host/). 구글 로그인 → 내 세션 목록·새 세션 → 판(프로젝터) + 참여 QR.
import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useDialog } from "@/components/Dialog";
import { BrainstormBoard, type BoardStore, type IslandData } from "@/components/brainstorm/BrainstormRoom";
import { gridFor } from "@/lib/brainstorm-map";
import type { Idea } from "@/lib/brainstorm";
import type { Member } from "@/lib/classes";
import { createSession, deleteSession, deleteSessionIdea, DETAIL_MAX, joinUrl, SESSION_SIZES, TITLE_MAX, updateSession, watchMySessions, watchPlayers, watchSession, watchSessionIdeas, type IdeaSession, type Player } from "@/lib/idea-session";
import { Icon } from "@/components/Icon";
import { QrCode } from "./QrCode";
import { Notice } from "./IdeaPlay";
import boardStyles from "@/components/brainstorm/Brainstorm.module.css";
import styles from "./Idea.module.css";

export default function IdeaHost() {
  const { user, loading, signInWithGoogle } = useAuth();
  const params = useSearchParams();
  const sid = params.get("s") || "";
  const [err, setErr] = useState("");
  if (loading) return <Notice title="불러오는 중…" />;
  if (!user || user.isAnonymous) return <main className={styles.landing}>
    <div className={styles.card}>
      <div className={styles.brand}>
        <span className={styles.logo}><Icon name="co_present" size={30} fill /></span>
        <h1>아이디어 섬 진행자</h1>
        <p>세션을 열면 QR이 생기고, 참여자는 휴대폰으로 찍어 닉네임만 넣고 들어와요. 100명까지 한 섬에서 함께할 수 있어요.</p>
      </div>
      <button type="button" className={styles.primary} onClick={() => signInWithGoogle().catch(e => setErr(e instanceof Error ? e.message : "로그인하지 못했어요."))}>
        <Icon name="login" size={20} />구글로 로그인
      </button>
      {err && <p role="alert" className={styles.err}>{err}</p>}
      <Link href="/idea/" className={styles.subtle}><Icon name="pin" size={18} />참여 코드로 들어가기</Link>
    </div>
  </main>;
  if (sid) return <HostBoard key={sid} sid={sid} uid={user.uid} />;
  return <Sessions uid={user.uid} />;
}

/* ---------- 내 세션 목록 · 새 세션 ---------- */

function Sessions({ uid }: { uid: string }) {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const dialog = useDialog();
  const [list, setList] = useState<IdeaSession[] | null>(null);
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [size, setSize] = useState<number>(30);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => watchMySessions(uid, setList, () => setList([])), [uid]);

  async function create(e: FormEvent) {
    e.preventDefault();
    if (!user || !title.trim() || busy) return;
    setBusy(true); setErr("");
    try { const id = await createSession(user, title, detail, size); router.push(`/idea/host/?s=${id}`); }
    catch (e) { setErr(e instanceof Error ? e.message : "세션을 만들지 못했어요."); setBusy(false); }
  }
  async function remove(s: IdeaSession) {
    if (!(await dialog.confirm({ title: "세션 지우기", body: `“${s.title}” 세션과 아이디어를 모두 지워요. 되돌릴 수 없어요. 필요하면 먼저 CSV로 받아 두세요.`, okLabel: "지우기", danger: true }))) return;
    try { await deleteSession(s); } catch { setErr("세션을 지우지 못했어요."); }
  }

  return <main className={styles.hostPage}>
    <header className={styles.hostTop}>
      <span className={styles.logoSm}><Icon name="water_drop" size={20} fill /></span>
      <strong>아이디어 섬</strong>
      <span className={styles.who}>{user?.displayName || user?.email}</span>
      <button type="button" className={styles.ghost} onClick={() => void signOut()}><Icon name="logout" size={18} />로그아웃</button>
    </header>
    <div className={styles.hostBody}>
      <form className={styles.panelCard} onSubmit={create}>
        <h2>새 세션 열기</h2>
        <label className={styles.label} htmlFor="t">주제</label>
        <input id="t" className={styles.input} value={title} maxLength={TITLE_MAX} onChange={e => setTitle(e.target.value)} placeholder="예: 우리 동네를 더 살기 좋게 만드는 방법은?" />
        <label className={styles.label} htmlFor="d">설명(선택)</label>
        <textarea id="d" className={styles.input} rows={3} value={detail} maxLength={DETAIL_MAX} onChange={e => setDetail(e.target.value)} placeholder="참여자에게 보일 안내" />
        <span className={styles.label}>예상 인원 — 인원이 많을수록 섬이 넓어져요</span>
        <div className={styles.sizes} role="radiogroup" aria-label="예상 인원">
          {SESSION_SIZES.map(n => <button key={n} type="button" role="radio" aria-checked={size === n} className={styles.size} onClick={() => setSize(n)}>
            <Icon name={n === 30 ? "group" : n === 60 ? "groups" : "diversity_3"} size={22} />{n === 100 ? "100명까지" : `${n}명까지`}
          </button>)}
        </div>
        {err && <p role="alert" className={styles.err}>{err}</p>}
        <button type="submit" className={styles.primary} disabled={busy || !title.trim()}>{busy ? "여는 중…" : "세션 열고 QR 띄우기"}<Icon name="qr_code_2" size={20} /></button>
      </form>
      <section className={styles.panelCard}>
        <h2>내 세션</h2>
        {list === null ? <p className={styles.fine}>불러오는 중…</p>
          : !list.length ? <p className={styles.fine}>아직 연 세션이 없어요.</p>
          : <ul className={styles.sessionList}>
            {list.map(s => <li key={s.id}>
              <Link href={`/idea/host/?s=${s.id}`} className={styles.sessionLink}>
                <strong>{s.title}</strong>
                <span>{new Date(s.createdAt).toLocaleDateString("ko-KR")} · 코드 {s.code} · {s.size}명 판 · <em data-closed={s.status === "closed" ? "" : undefined}>{s.status === "closed" ? "마감" : "진행 중"}</em></span>
              </Link>
              <button type="button" className={styles.iconBtn} onClick={() => void remove(s)} aria-label={`${s.title} 지우기`}><Icon name="delete" size={18} /></button>
            </li>)}
          </ul>}
      </section>
    </div>
  </main>;
}

/* ---------- 판(프로젝터) ---------- */

function HostBoard({ sid, uid }: { sid: string; uid: string }) {
  const [session, setSession] = useState<IdeaSession | null | undefined>(undefined);
  const [players, setPlayers] = useState<Player[]>([]);
  const [ideas, setIdeas] = useState<Idea[] | null>(null);
  const [error, setError] = useState("");
  const [now, setNow] = useState(0);
  // 큰 QR — 아이디어가 아직 없을 때(막 연 세션) 처음부터 띄워 둔다
  const [bigQr, setBigQr] = useState<boolean | null>(null);
  useEffect(() => {
    const offs = [
      watchSession(sid, setSession, () => setSession(null)),
      watchPlayers(sid, setPlayers, () => setError("참여자 목록을 불러오지 못했어요.")),
      watchSessionIdeas(sid, setIdeas, () => setError("아이디어를 불러오지 못했어요.")),
    ];
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => { offs.forEach(f => f()); clearInterval(t); };
  }, [sid]);
  if (bigQr === null && ideas !== null) setBigQr(ideas.length === 0);

  const store = useMemo<BoardStore>(() => ({ add: async () => {}, remove: (_I, id) => deleteSessionIdea(sid, id) }), [sid]);
  const members: Member[] = useMemo(() => players.map(p => ({ uid: p.uid, role: "student", displayName: p.name, photoURL: "", joinedAt: p.at })), [players]);

  if (session === undefined || ideas === null) return <Notice title="판을 여는 중…" />;
  if (!session) return <Notice title="세션을 찾을 수 없어요" body="지워졌거나 주소가 바뀌었을 수 있어요." />;
  if (session.ownerId !== uid) return <Notice title="이 세션의 진행자만 열 수 있어요" />;
  const url = joinUrl(session.code);
  const closed = session.status === "closed";
  const islands: IslandData[] = [{ cid: sid, lid: "", qid: sid, name: "", ideas }];
  const toggle = () => void updateSession(sid, { status: closed ? "open" : "closed" }).catch(() => setError("상태를 바꾸지 못했어요."));

  const tools = <>
    <Link href="/idea/host/" className={boardStyles.chip}><Icon name="arrow_back" size={18} />목록</Link>
    <button type="button" className={boardStyles.chip} onClick={() => setBigQr(true)}><Icon name="qr_code_2" size={18} />참여 QR</button>
    <button type="button" className={boardStyles.chip} aria-pressed={closed} onClick={toggle}><Icon name={closed ? "lock" : "lock_open"} size={18} />{closed ? "마감됨 · 다시 열기" : "마감하기"}</button>
  </>;
  // 판 구석의 작은 QR — 늦게 온 참여자용. 누르면 크게.
  const corner = !closed && <button type="button" className={styles.cornerQr} onClick={() => setBigQr(true)} aria-label="참여 QR 크게 보기">
    <QrCode text={url} className={styles.qrSm} />
    <span><b>{session.code}</b>{players.length}명 참여</span>
  </button>;

  return <>
    <BrainstormBoard islands={islands} home={0} uid={uid} myName="진행자" teacher
      question={{ title: session.title, text: session.detail }} members={members} now={now} error={error}
      grid={gridFor(session.size)} store={store} kicker={`아이디어 섬 · 코드 ${session.code}${closed ? " · 마감" : ""}`}
      extraTools={tools} overlay={corner} composer={false}
      hideIdeas={session.hideIdeas} onHide={v => void updateSession(sid, { hideIdeas: v }).catch(() => setError("응답 가리기를 바꾸지 못했어요."))} />
    {bigQr && <div className={styles.qrModal} role="dialog" aria-modal="true" aria-label="참여 QR" onClick={() => setBigQr(false)}>
      <div className={styles.qrBox} onClick={e => e.stopPropagation()}>
        <h2>{session.title}</h2>
        <div className={styles.qrRow}>
          <QrCode text={url} className={styles.qrLg} />
          <div className={styles.qrSide}>
            <span className={styles.label}>휴대폰 카메라로 찍거나</span>
            <span className={styles.url}>{url.replace(/^https?:\/\//, "").replace(/\?c=\d+$/, "")}</span>
            <span className={styles.label}>에 들어가서 코드 입력</span>
            <strong className={styles.bigCode}>{session.code.slice(0, 3)} {session.code.slice(3)}</strong>
            <span className={styles.count}><Icon name="groups" size={22} />{players.length}명 들어왔어요</span>
          </div>
        </div>
        {players.length > 0 && <ul className={styles.joined}>{players.slice(-40).map(p => <li key={p.uid}>{p.name}</li>)}</ul>}
        {closed && <p className={styles.err}>세션이 마감돼 있어요. 새로 들어올 수 없어요.</p>}
        <button type="button" className={styles.primary} onClick={() => setBigQr(false)}>판 보기<Icon name="arrow_forward" size={20} /></button>
      </div>
    </div>}
  </>;
}
