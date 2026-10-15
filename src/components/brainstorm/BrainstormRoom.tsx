"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { useAuth } from "@/contexts/AuthContext";
import { getMemberProfile, watchMembers, type Member } from "@/lib/classes";
import { watchQuestion, type Question } from "@/lib/lessons";
import { addIdea, deleteIdea, watchIdeas, IDEA_MAX_LEN, IDEAS_PER_STUDENT, type Idea } from "@/lib/brainstorm";
import { CELL_R, inkColor, paintTerritory, VIEW_H, VIEW_W, type Painter } from "@/lib/brainstorm-map";
import { assignChars, charThumb } from "@/lib/brainstorm-chars";
import { blocksToPlainText } from "@/components/BlockEditor";
import type { Actor } from "./CharacterLayer";
import { Icon } from "@/components/Icon";
import styles from "./Brainstorm.module.css";

/** 말풍선이 다음 아이디어로 넘어가는 간격 */
const BUBBLE_MS = 5000;
/** 방금 들어온 아이디어로 보는 시간(말풍선 통통·잉크 튀김) */
const FRESH_MS = 6000;

function hash(s: string) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }
/** 프로필 사진이 없으면 기본 캐릭터 그림 중 하나(학생마다 고정) */
const fallbackFace = (uid: string) => `/avatar/${(hash(uid) % 23) + 1}.png`;

// 3D 캐릭터(three.js)는 판을 열 때만 따로 불러온다
const CharacterLayer = dynamic(() => import("./CharacterLayer").then(m => m.CharacterLayer), { ssr: false });
/** 캐릭터 키(판 좌표) — 발은 집 칸 중심보다 조금 아래 */
const CHAR_H = CELL_R * 3.2;
const FEET = CELL_R * 0.5;
/** 잔디 체크 타일 한 칸(판 좌표) */
const TILE = 12;

/** 섬 가장자리 칸 중 서로 떨어진 몇 곳에 덤불·바위를 둔다(활동마다 같은 자리). */
function edgeProps(cells: { i: number; c: number; r: number; x: number; y: number }[]) {
  const isEdge = (c: { c: number; r: number }) => {
    let n = 0;
    for (const o of cells) if (Math.abs(o.c - c.c) <= 1 && Math.abs(o.r - c.r) <= 1 && !(o.c === c.c && o.r === c.r)) n++;
    return n <= 5;
  };
  const picks: { i: number; x: number; y: number; kind: "bush" | "rock" }[] = [];
  for (const c of [...cells].sort((a, b) => ((a.i * 2654435761) % 997) - ((b.i * 2654435761) % 997))) {
    if (picks.length >= 9 || !isEdge(c)) continue;
    if (picks.some(p => Math.hypot(p.x - c.x, p.y - c.y) < 70)) continue;
    picks.push({ i: c.i, x: c.x, y: c.y, kind: picks.length % 3 === 2 ? "rock" : "bush" });
  }
  return picks;
}

export default function BrainstormRoom() {
  const params = useSearchParams();
  const cid = params.get("class") || ""; const lid = params.get("lesson") || ""; const qid = params.get("q") || "";
  if (!cid || !lid || !qid) return <Notice title="브레인스토밍 주소가 올바르지 않아요" body="차시 화면의 브레인스토밍 활동에서 다시 열어 주세요." />;
  return <Room key={`${cid}/${lid}/${qid}`} cid={cid} lid={lid} qid={qid} />;
}

function Room({ cid, lid, qid }: { cid: string; lid: string; qid: string }) {
  const { user, loading, configured } = useAuth();
  const [member, setMember] = useState<Awaited<ReturnType<typeof getMemberProfile>> | undefined>(undefined);
  const [question, setQuestion] = useState<Question | null | undefined>(undefined);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [error, setError] = useState("");
  const [now, setNow] = useState(0);

  useEffect(() => {
    if (!user || !configured) return;
    let active = true;
    getMemberProfile(cid, user.uid).then(m => { if (active) setMember(m); }).catch(() => { if (active) setMember(null); });
    return () => { active = false; };
  }, [cid, user, configured]);
  useEffect(() => {
    if (!member) return;
    const offs = [
      watchQuestion(cid, lid, qid, setQuestion, () => setQuestion(null)),
      watchIdeas(cid, lid, qid, setIdeas, e => setError(e.message)),
      watchMembers(cid, setMembers),
    ];
    return () => offs.forEach(f => f());
  }, [cid, lid, qid, member]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  if (loading || (user && member === undefined)) return <Notice title="브레인스토밍 판에 들어가는 중…" />;
  if (!configured || !user) return <Notice title="학급 계정으로 들어와 주세요" body="학급에 가입한 계정으로 로그인한 뒤 다시 열어 주세요." action={<Link className={styles.primaryBtn} href="/">로그인하러 가기</Link>} />;
  if (!member) return <Notice title="이 학급 친구만 함께할 수 있어요" body="학급에 가입한 계정인지 확인해 주세요." />;
  if (question === undefined) return <Notice title="주제를 불러오고 있어요…" />;
  const teacher = member.role === "teacher";
  if (!question || question.kind !== "brainstorm") return <Notice title="브레인스토밍 활동을 찾을 수 없어요" body="선생님이 활동을 지웠거나 주소가 바뀌었을 수 있어요." />;
  if (!teacher && question.published === false) return <Notice title="아직 열리지 않은 활동이에요" body="선생님이 활동을 공개하면 여기서 바로 시작돼요." />;

  return <BrainstormBoard cid={cid} lid={lid} qid={qid} uid={user.uid} myName={member.displayName || user.displayName || "학생"} teacher={teacher}
    question={question} ideas={ideas} members={members} now={now} error={error} />;
}

export function BrainstormBoard({ cid, lid, qid, uid, myName, teacher, question, ideas, members, now, error }: {
  cid: string; lid: string; qid: string; uid: string; myName: string; teacher: boolean;
  question: Question; ideas: Idea[]; members: Member[]; now: number; error: string;
}) {
  const [showNames, setShowNames] = useState(true);
  const [panel, setPanel] = useState(false);
  const [focus, setFocus] = useState<string | null>(null);
  // 3D 로 그려지고 있는 학생들 / WebGL 을 못 쓰는 기기
  const [live3d, setLive3d] = useState<Set<string>>(() => new Set());
  const [no3d, setNo3d] = useState(false);
  const onLoaded = useCallback((uids: string[]) => setLive3d(prev => (prev.size === uids.length && uids.every(u => prev.has(u)) ? prev : new Set(uids))), []);
  const onFail = useCallback(() => setNo3d(true), []);
  const topic = question.title.trim() || "브레인스토밍";
  const detail = useMemo(() => blocksToPlainText(question.text).trim(), [question.text]);

  // 처음 아이디어를 낸 순서대로 자리를 잡는다(먼저 온 친구의 자리는 바뀌지 않는다)
  const people = useMemo(() => {
    const map = new Map<string, Idea[]>();
    for (const idea of ideas) { const list = map.get(idea.uid) ?? []; list.push(idea); map.set(idea.uid, list); }
    return [...map.entries()].map(([id, list]) => ({ uid: id, ideas: list, name: list[list.length - 1].name }));
  }, [ideas]);
  const painters: Painter[] = useMemo(() => people.map(p => ({ uid: p.uid, ideas: p.ideas.length })), [people]);
  const map = useMemo(() => paintTerritory(qid, painters), [qid, painters]);
  const chars = useMemo(() => assignChars(people.map(p => p.uid)), [people]);
  const actors: Actor[] = useMemo(() => people.flatMap((p, k) => {
    const home = map.homes[k];
    return home ? [{ uid: p.uid, char: chars[k], x: home.x, y: home.y + FEET, ideas: p.ideas.length }] : [];
  }), [people, map, chars]);
  const photo = useMemo(() => new Map(members.map(m => [m.uid, m.photoURL])), [members]);
  const nameOf = (id: string, fallback: string) => members.find(m => m.uid === id)?.displayName || fallback;
  const totalCells = map.cells.length;
  const ranking = people.map((p, k) => ({ ...p, k, share: totalCells ? map.area[k] / totalCells : 0 })).sort((a, b) => b.share - a.share || b.ideas.length - a.ideas.length);

  // 칸 → 학생 색으로 묶어 그린다(색마다 한 덩어리로 끈적하게 이어 붙이려고)
  const inkGroups = useMemo(() => {
    const groups = people.map(() => [] as { i: number; x: number; y: number }[]);
    for (const cell of map.cells) { const k = map.owner.get(cell.i); if (k !== undefined) groups[k].push(cell); }
    return groups;
  }, [map, people]);

  // 섬 가장자리 장식(덤불·바위) — 집 칸은 섬 안쪽이라 캐릭터와 겹치지 않는다
  const props = useMemo(() => edgeProps(map.cells), [map.cells]);

  return <main className={styles.page}>
    <header className={styles.top}>
      <div className={styles.topic}>
        <span className={styles.kicker}><Icon name="tips_and_updates" size={16} />브레인스토밍</span>
        <h1>{topic}</h1>
        {detail && <p>{detail}</p>}
      </div>
      <div className={styles.stats}>
        <span><b>{people.length}</b>명 참여</span>
        <span><b>{ideas.length}</b>개 아이디어</span>
      </div>
      <div className={styles.tools}>
        <button type="button" className={styles.chip} aria-pressed={showNames} onClick={() => setShowNames(v => !v)}><Icon name={showNames ? "badge" : "visibility_off"} size={18} />{showNames ? "이름 보임" : "이름 숨김"}</button>
        <button type="button" className={styles.chip} aria-pressed={panel} onClick={() => setPanel(v => !v)}><Icon name="format_list_bulleted" size={18} />아이디어 모아 보기</button>
        <button type="button" className={styles.chip} onClick={() => { if (document.fullscreenElement) void document.exitFullscreen(); else void document.documentElement.requestFullscreen?.().catch(() => {}); }} aria-label="전체 화면"><Icon name="fullscreen" size={18} /></button>
      </div>
    </header>
    {error && <p role="alert" className={styles.error}>{error}</p>}

    <div className={`${styles.body} ${panel ? styles.withPanel : ""}`}>
      <section className={styles.sea} aria-label="아이디어 땅따먹기 판">
        <div className={styles.board} style={{ aspectRatio: `${VIEW_W} / ${VIEW_H}`, "--char-h": `${(CHAR_H / VIEW_W) * 100}cqw` } as CSSProperties}>
          <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className={styles.map} aria-hidden="true">
            <defs>
              {/* 동그라미들을 녹여 붙여 한 덩어리로(섬·잉크 웅덩이) */}
              <filter id="bs-goo" x="-10%" y="-10%" width="120%" height="120%">
                <feGaussianBlur in="SourceGraphic" stdDeviation="3.2" result="b" />
                <feColorMatrix in="b" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -9" />
              </filter>
              {/* 브롤스타즈풍 굵은 검정 테두리 — 모양 바깥으로 부풀린 검정을 뒤에 깐다 */}
              <filter id="bs-edge" x="-5%" y="-5%" width="110%" height="110%">
                <feMorphology in="SourceAlpha" operator="dilate" radius="2" result="d" />
                <feFlood floodColor="#1b1b29" />
                <feComposite in2="d" operator="in" result="line" />
                <feMerge><feMergeNode in="line" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
              <filter id="bs-edge-thin" x="-5%" y="-5%" width="110%" height="110%">
                <feMorphology in="SourceAlpha" operator="dilate" radius="1.3" result="d" />
                <feFlood floodColor="#1b1b29" floodOpacity="0.9" />
                <feComposite in2="d" operator="in" result="line" />
                <feMerge><feMergeNode in="line" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
              {/* 섬 윗면: 연한 잔디 체크 타일(잉크 색이 잘 보이도록 옅게) */}
              <pattern id="bs-grass" width={TILE * 2} height={TILE * 2} patternUnits="userSpaceOnUse">
                <rect width={TILE * 2} height={TILE * 2} fill="#cdeea0" />
                <rect width={TILE} height={TILE} fill="#bfe58c" /><rect x={TILE} y={TILE} width={TILE} height={TILE} fill="#bfe58c" />
              </pattern>
              <mask id="bs-island" maskUnits="userSpaceOnUse" x="0" y="0" width={VIEW_W} height={VIEW_H + 20}>
                <g filter="url(#bs-goo)" fill="#fff">{map.cells.map(c => <circle key={c.i} cx={c.x} cy={c.y} r={CELL_R * 1.2} />)}</g>
              </mask>
            </defs>
            {/* 절벽(섬 옆면) → 윗면 → 잉크 → 가장자리 장식 */}
            <g filter="url(#bs-edge)" transform="translate(0 8)">
              <rect width={VIEW_W} height={VIEW_H} fill="#b8743f" mask="url(#bs-island)" />
            </g>
            <g filter="url(#bs-edge)">
              <rect width={VIEW_W} height={VIEW_H} fill="url(#bs-grass)" mask="url(#bs-island)" />
            </g>
            <g filter="url(#bs-edge-thin)">
              {inkGroups.map((cells, k) => <g key={people[k].uid} filter="url(#bs-goo)" fill={inkColor(k)} opacity={focus && focus !== people[k].uid ? 0.35 : 1}>
                {cells.map(c => <circle key={c.i} cx={c.x} cy={c.y} r={CELL_R * 1.08} className={styles.ink} style={{ transformOrigin: `${c.x}px ${c.y}px` }} />)}
              </g>)}
            </g>
            <g filter="url(#bs-edge-thin)">
              {props.map(d => d.kind === "bush"
                ? <g key={d.i} transform={`translate(${d.x} ${d.y})`}>
                    <circle cx={-5} cy={1} r={5.2} fill="#2f9e44" /><circle cx={5} cy={1} r={5.2} fill="#2f9e44" /><circle cx={0} cy={-3} r={6.2} fill="#37b24d" />
                    <circle cx={-1.5} cy={-5.5} r={2} fill="#69db7c" />
                  </g>
                : <g key={d.i} transform={`translate(${d.x} ${d.y})`}>
                    <rect x={-6.5} y={-5} width={13} height={10} rx={3.5} fill="#a5afc4" /><rect x={-4.5} y={-4} width={6} height={3} rx={1.5} fill="#d0d6e4" />
                  </g>)}
            </g>
          </svg>
          {!no3d && <CharacterLayer actors={actors} viewW={VIEW_W} viewH={VIEW_H} charH={CHAR_H} onLoaded={onLoaded} onFail={onFail} />}
          {people.map((p, k) => {
            const home = map.homes[k]; if (!home) return null;
            const latest = p.ideas[p.ideas.length - 1];
            const fresh = now > 0 && now - latest.at < FRESH_MS;
            // 새 아이디어는 바로 보여 주고, 아니면 학생마다 엇갈리게 돌아가며 보여 준다
            const shown = fresh ? latest : p.ideas[Math.floor((now + k * 1700) / BUBBLE_MS) % p.ideas.length];
            const in3d = live3d.has(p.uid);
            const left = (home.x / VIEW_W) * 100; const top = ((home.y + (in3d ? FEET : 0)) / VIEW_H) * 100;
            const name = nameOf(p.uid, p.name);
            return <button type="button" key={p.uid} className={`${styles.player} ${in3d ? styles.player3d : ""} ${fresh ? styles.fresh : ""} ${p.uid === uid ? styles.me : ""} ${focus === p.uid ? styles.focused : ""}`}
              style={{ left: `${left}%`, top: `${top}%`, "--ink": inkColor(k), "--delay": `${-(k * 0.37) % 3}s`, zIndex: focus === p.uid ? 300 : fresh ? 200 : Math.round(top) } as CSSProperties}
              onClick={() => { setFocus(f => (f === p.uid ? null : p.uid)); setPanel(true); }} aria-label={`${showNames ? name : "친구"}의 아이디어 ${p.ideas.length}개`}>
              <span className={styles.bubble} key={shown.id}><span className={styles.bubbleText}>{shown.text}</span>{p.ideas.length > 1 && <em>{p.ideas.length}</em>}</span>
              {in3d ? <span className={styles.body3d} /> : <span className={styles.char}>
                {/* 3D 를 못 쓰거나 불러오는 동안: 내 캐릭터 그림 → 없으면 프로필 사진 → 기본 얼굴 */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={charThumb(chars[k].id)} alt="" onError={e => { const img = e.currentTarget; const next = photo.get(p.uid); if (next && img.dataset.step !== "photo") { img.dataset.step = "photo"; img.src = next; } else img.src = fallbackFace(p.uid); }} />
              </span>}
              <span className={styles.shadow} />
              {showNames && <span className={styles.name}>{name}</span>}
            </button>;
          })}
          {!people.length && <div className={styles.empty}><Icon name="water_drop" size={32} /><strong>첫 아이디어를 기다리는 중</strong><span>아이디어를 쓰면 내 색 잉크가 섬에 퍼져요!</span></div>}
        </div>
      </section>

      {panel && <aside className={styles.panel} aria-label="아이디어 모아 보기">
        <div className={styles.panelHead}><strong>영역 순위</strong><button type="button" onClick={() => { setPanel(false); setFocus(null); }} aria-label="닫기"><Icon name="close" size={18} /></button></div>
        <ol className={styles.rank}>
          {ranking.map((p, i) => <li key={p.uid} className={focus === p.uid ? styles.rankOn : ""}>
            <button type="button" onClick={() => setFocus(f => (f === p.uid ? null : p.uid))}>
              <span className={styles.place}>{i + 1}</span><span className={styles.swatch} style={{ background: inkColor(p.k) }} />
              <span className={styles.rankName}>{showNames || p.uid === uid ? nameOf(p.uid, p.name) : `친구 ${i + 1}`}</span>
              <span className={styles.rankNum}>{Math.round(p.share * 100)}% · {p.ideas.length}개</span>
            </button>
            {(focus === p.uid || ranking.length <= 6) && <ul className={styles.ideaList}>
              {p.ideas.map(idea => <li key={idea.id}><span>{idea.text}</span>
                {(teacher || idea.uid === uid) && <button type="button" onClick={() => void deleteIdea(cid, lid, qid, idea.id)} aria-label="아이디어 지우기"><Icon name="delete" size={16} /></button>}
              </li>)}
            </ul>}
          </li>)}
        </ol>
      </aside>}
    </div>

    {/* 선생님도 써 볼 수 있다(테스트·예시 아이디어) — 선생님 글도 판에 똑같이 칠해진다 */}
    <Composer teacher={teacher} cid={cid} lid={lid} qid={qid} uid={uid} name={myName} mine={ideas.filter(i => i.uid === uid)} color={inkColor(Math.max(0, people.findIndex(p => p.uid === uid)))} joined={people.some(p => p.uid === uid)} />
  </main>;
}

/** 학생 아이디어 쓰기 칸 — 판 아래에 붙어 있다. */
function Composer({ teacher, cid, lid, qid, uid, name, mine, color, joined }: { teacher: boolean; cid: string; lid: string; qid: string; uid: string; name: string; mine: Idea[]; color: string; joined: boolean }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const full = mine.length >= IDEAS_PER_STUDENT;
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!text.trim() || busy || full) return;
    setBusy(true); setErr("");
    try { await addIdea(cid, lid, qid, uid, name, text); setText(""); }
    catch { setErr("아이디어를 올리지 못했어요. 잠시 뒤 다시 해 주세요."); }
    finally { setBusy(false); }
  }
  return <form className={styles.composer} onSubmit={submit} style={{ "--ink": joined ? color : "#ff2d8a" } as CSSProperties}>
    <div className={styles.inputRow}>
      <input value={text} onChange={e => setText(e.target.value.slice(0, IDEA_MAX_LEN))} maxLength={IDEA_MAX_LEN} disabled={full}
        placeholder={full ? `아이디어는 ${IDEAS_PER_STUDENT}개까지 쓸 수 있어요` : teacher ? "선생님도 써 볼 수 있어요(예시·테스트 아이디어)" : "떠오르는 생각을 자유롭게 써 보세요"} aria-label="아이디어 쓰기" />
      <span className={styles.count}>{text.length}/{IDEA_MAX_LEN}</span>
      <button type="submit" className={styles.send} disabled={busy || full || !text.trim()}><Icon name="water_drop" size={18} fill />{busy ? "칠하는 중…" : "잉크 뿌리기"}</button>
    </div>
    {err && <p role="alert" className={styles.composerErr}>{err}</p>}
    {mine.length > 0 && <ul className={styles.mine} aria-label="내 아이디어">
      {mine.map(idea => <li key={idea.id}><span>{idea.text}</span><button type="button" onClick={() => void deleteIdea(cid, lid, qid, idea.id)} aria-label="내 아이디어 지우기"><Icon name="close" size={14} /></button></li>)}
    </ul>}
  </form>;
}

function Notice({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return <main className={styles.notice}><div><strong>{title}</strong>{body && <p>{body}</p>}{action}</div></main>;
}
