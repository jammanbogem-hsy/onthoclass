"use client";

// 아이디어 섬 — 참여자 화면(/idea/?c=코드). 닉네임만 넣고 들어와 아이디어를 쓰면 내 색 잉크가 섬에 번진다.
import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { User } from "firebase/auth";
import { BrainstormBoard, type BoardStore, type IslandData } from "@/components/brainstorm/BrainstormRoom";
import { gridFor } from "@/lib/brainstorm-map";
import type { Idea } from "@/lib/brainstorm";
import type { Member } from "@/lib/classes";
import { addSessionIdea, deleteSessionIdea, ensureGuest, joinSession, NAME_MAX, PLAYER_CAP, resolveCode, watchPlayers, watchSession, watchSessionIdeas, type IdeaSession, type Player } from "@/lib/idea-session";
import { Icon } from "@/components/Icon";
import styles from "./Idea.module.css";

export default function IdeaJoin() {
  const params = useSearchParams();
  const code = (params.get("c") || "").replace(/\D/g, "").slice(0, 6);
  if (code.length !== 6) return <CodeEntry />;
  return <Resolve key={code} code={code} />;
}

/** 참여 코드 입력 — QR 없이 주소만 열었을 때 */
function CodeEntry() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const submit = (e: FormEvent) => { e.preventDefault(); if (code.length === 6) router.replace(`/idea/?c=${code}`); };
  return <main className={styles.landing}>
    <form className={styles.card} onSubmit={submit}>
      <Brand />
      <label className={styles.label} htmlFor="code">참여 코드 6자리</label>
      <input id="code" className={styles.codeInput} inputMode="numeric" autoComplete="off" autoFocus value={code}
        onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" />
      <button type="submit" className={styles.primary} disabled={code.length !== 6}>들어가기<Icon name="arrow_forward" size={20} /></button>
      <Link href="/idea/host/" className={styles.subtle}><Icon name="co_present" size={18} />진행자로 세션 열기</Link>
    </form>
  </main>;
}

function Brand() {
  return <div className={styles.brand}>
    <span className={styles.logo}><Icon name="water_drop" size={30} fill /></span>
    <h1>아이디어 섬</h1>
    <p>생각을 쓸수록 내 색 잉크가 섬 위로 번지는 땅따먹기 브레인스토밍</p>
  </div>;
}

function Resolve({ code }: { code: string }) {
  const [state, setState] = useState<{ user: User; sid: string } | "missing" | "error" | "auth" | null>(null);
  useEffect(() => {
    let alive = true;
    ensureGuest()
      .then(async user => { const sid = await resolveCode(code); if (alive) setState(sid ? { user, sid } : "missing"); })
      .catch(e => {
        const code = String((e as { code?: string })?.code ?? "");
        // 익명 로그인이 꺼진 프로젝트(콘솔 설정)면 진행자가 고쳐야 하는 문제라고 알려 준다
        if (alive) setState(code === "auth/admin-restricted-operation" || code === "auth/operation-not-allowed" ? "auth" : "error");
      });
    return () => { alive = false; };
  }, [code]);
  if (!state) return <Notice title="섬을 찾는 중…" />;
  if (state === "missing") return <Notice title="이 코드의 세션이 없어요" body="코드를 다시 확인하거나 진행자 화면의 QR을 찍어 주세요." again />;
  if (state === "auth") return <Notice title="아직 참여를 받을 수 없어요" body="진행자에게 알려 주세요: 사이트의 익명 로그인 설정이 꺼져 있어요." again />;
  if (state === "error") return <Notice title="들어가지 못했어요" body="인터넷 연결을 확인하고 다시 열어 주세요." again />;
  return <Play sid={state.sid} user={state.user} />;
}

function Play({ sid, user }: { sid: string; user: User }) {
  const [session, setSession] = useState<IdeaSession | null | undefined>(undefined);
  const [players, setPlayers] = useState<Player[] | null>(null);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [error, setError] = useState("");
  const [now, setNow] = useState(0);
  useEffect(() => {
    const offs = [
      watchSession(sid, setSession, () => setSession(null)),
      watchPlayers(sid, setPlayers, () => setError("참여자 목록을 불러오지 못했어요.")),
      watchSessionIdeas(sid, setIdeas, () => setError("아이디어를 불러오지 못했어요.")),
    ];
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => { offs.forEach(f => f()); clearInterval(t); };
  }, [sid]);

  const uid = user.uid;
  const me = players?.find(p => p.uid === uid);
  const store = useMemo<BoardStore>(() => ({
    add: (_I, id, name, text) => addSessionIdea(sid, id, name, text, ideas.filter(i => i.uid === id)),
    remove: (_I, id) => deleteSessionIdea(sid, id),
  }), [sid, ideas]);
  const members: Member[] = useMemo(() => (players ?? []).map(p => ({ uid: p.uid, role: "student", displayName: p.name, photoURL: "", joinedAt: p.at })), [players]);

  if (session === undefined || players === null) return <Notice title="섬에 들어가는 중…" />;
  if (!session) return <Notice title="세션이 없어졌어요" body="진행자가 세션을 지웠을 수 있어요." again />;
  const closed = session.status === "closed";
  const host = session.ownerId === uid;
  if (!me && !closed && !host) return <NameForm sid={sid} uid={uid} session={session} players={players} />;

  const islands: IslandData[] = [{ cid: sid, lid: "", qid: sid, name: "", ideas }];
  return <BrainstormBoard islands={islands} home={0} uid={uid} myName={me?.name || "진행자"} teacher={host}
    question={{ title: session.title, text: session.detail }} members={members} now={now} error={error}
    grid={gridFor(session.size)} store={store} kicker="아이디어 섬" startOnMe={!host}
    composer={!!me} hideIdeas={session.hideIdeas} closedNote={closed ? "진행자가 세션을 마감했어요. 판은 계속 볼 수 있어요." : undefined} />;
}

function NameForm({ sid, uid, session, players }: { sid: string; uid: string; session: IdeaSession; players: Player[] }) {
  const key = `idea-name:${sid}`;
  const [name, setName] = useState(() => { try { return localStorage.getItem("idea-name") || ""; } catch { return ""; } });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const full = players.length >= PLAYER_CAP;
  async function submit(e: FormEvent) {
    e.preventDefault();
    const clean = name.replace(/\s+/g, " ").trim().slice(0, NAME_MAX);
    if (!clean || busy) return;
    if (players.some(p => p.name.toLowerCase() === clean.toLowerCase() && p.uid !== uid)) { setErr("이미 같은 이름이 있어요. 다른 이름을 써 주세요."); return; }
    setBusy(true); setErr("");
    try {
      await joinSession(sid, uid, clean);
      try { localStorage.setItem("idea-name", clean); localStorage.setItem(key, "1"); } catch { /* 저장 못 해도 참여는 된다 */ }
    } catch { setErr("들어가지 못했어요. 세션이 마감됐거나 연결이 끊겼을 수 있어요."); }
    finally { setBusy(false); }
  }
  return <main className={styles.landing}>
    <form className={styles.card} onSubmit={submit}>
      <span className={styles.kicker}><Icon name="tips_and_updates" size={16} />아이디어 섬 · {session.ownerName}</span>
      <h1 className={styles.topic}>{session.title}</h1>
      {session.detail && <p className={styles.detail}>{session.detail}</p>}
      <label className={styles.label} htmlFor="nick">판에 보일 내 이름</label>
      <input id="nick" className={styles.input} autoFocus maxLength={NAME_MAX} value={name} onChange={e => setName(e.target.value.slice(0, NAME_MAX))} placeholder="닉네임(12자까지)" />
      {err && <p role="alert" className={styles.err}>{err}</p>}
      {full ? <p className={styles.err}>자리가 꽉 찼어요({PLAYER_CAP}명).</p>
        : <button type="submit" className={styles.primary} disabled={busy || !name.trim()}>{busy ? "들어가는 중…" : "섬에 들어가기"}<Icon name="arrow_forward" size={20} /></button>}
      <p className={styles.fine}>지금 {players.length}명이 함께하고 있어요</p>
    </form>
  </main>;
}

export function Notice({ title, body, again }: { title: string; body?: string; again?: boolean }) {
  return <main className={styles.landing}><div className={styles.card}>
    <strong className={styles.noticeTitle}>{title}</strong>
    {body && <p className={styles.detail}>{body}</p>}
    {again && <Link href="/idea/" className={styles.primary}>코드 다시 넣기</Link>}
  </div></main>;
}
