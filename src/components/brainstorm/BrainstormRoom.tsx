"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { useAuth } from "@/contexts/AuthContext";
import { getMemberProfile, watchMembers, type Member } from "@/lib/classes";
import { watchQuestion, type Question } from "@/lib/lessons";
import { addIdea, deleteIdea, ensureSeat, watchIdeas, watchWorld, IDEA_MAX_LEN, IDEAS_PER_STUDENT, type BrainWorld, type Idea } from "@/lib/brainstorm";
import { CELL_R, inkColor, LABEL_H, paintTerritory, VIEW_H, VIEW_W, worldLayout, type Cell, type Painter, type Territory } from "@/lib/brainstorm-map";
import { assignChars, charThumb } from "@/lib/brainstorm-chars";
import { spreadBubbles } from "@/lib/bubble-spread";
import { blocksToPlainText } from "@/components/BlockEditor";
import type { Actor, BoardView } from "./CharacterLayer";
import { LinkIslandsDialog } from "./LinkIslandsDialog";
import { Icon } from "@/components/Icon";
import styles from "./Brainstorm.module.css";

/** 말풍선이 다음 아이디어로 넘어가는 간격 */
const BUBBLE_MS = 5000;
/** 아이디어가 이보다 많으면 말풍선을 접어 두고(최근 2개 + "N개 더 보기"), 누르면 펼친다 */
const COLLAPSE_AT = 3;
const PEEK = 2;
/** 방금 들어온 아이디어로 보는 시간(말풍선 통통·잉크 튀김) */
const FRESH_MS = 6000;

function hash(s: string) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }
/** 프로필 사진이 없으면 기본 캐릭터 그림 중 하나(학생마다 고정) */
const fallbackFace = (uid: string) => `/avatar/${(hash(uid) % 23) + 1}.png`;

// 3D 캐릭터(three.js)는 판을 열 때만 따로 불러온다
const CharacterLayer = dynamic(() => import("./CharacterLayer").then(m => m.CharacterLayer), { ssr: false });
/** 캐릭터 키(판 좌표) — 발은 집 칸 중심보다 조금 아래 */
const CHAR_H = CELL_R * 3.6;
const FEET = CELL_R * 0.5;
/** 잔디 체크 타일 한 칸(판 좌표) */
const TILE = 12;

/** 섬 가장자리 칸 중 서로 떨어진 몇 곳에 덤불·바위를 둔다(활동마다 같은 자리). */
function edgeProps(cells: Cell[]) {
  const has = new Set(cells.map(c => `${c.c},${c.r}`));
  const isEdge = (c: Cell) => {
    let n = 0;
    for (let dc = -1; dc <= 1; dc++) for (let dr = -1; dr <= 1; dr++) if ((dc || dr) && has.has(`${c.c + dc},${c.r + dr}`)) n++;
    return n <= 5;
  };
  const picks: { i: number; x: number; y: number; kind: "bush" | "rock" }[] = [];
  for (const c of [...cells].sort((a, b) => ((a.i * 2654435761) % 997) - ((b.i * 2654435761) % 997))) {
    if (picks.length >= 12 || !isEdge(c)) continue;
    if (picks.some(p => Math.hypot(p.x - c.x, p.y - c.y) < 70)) continue;
    picks.push({ i: c.i, x: c.x, y: c.y, kind: picks.length % 3 === 2 ? "rock" : "bush" });
  }
  return picks;
}

// 땅 계산은 섬마다 아이디어 수가 바뀔 때만 다시 한다(섬이 여러 개라도 바뀐 섬만)
const territoryCache = new Map<string, Territory>();
function territoryFor(seed: string, painters: Painter[]) {
  const key = `${seed}|${painters.map(p => `${p.uid}:${p.ideas}`).join(",")}`;
  let t = territoryCache.get(key);
  if (!t) {
    t = paintTerritory(seed, painters);
    if (territoryCache.size > 80) territoryCache.delete(territoryCache.keys().next().value!);
    territoryCache.set(key, t);
  }
  return t;
}
const propsCache = new Map<string, ReturnType<typeof edgeProps>>();
function propsFor(seed: string, cells: Cell[]) {
  let p = propsCache.get(seed);
  if (!p) { p = edgeProps(cells); propsCache.set(seed, p); }
  return p;
}

export default function BrainstormRoom() {
  const params = useSearchParams();
  const cid = params.get("class") || ""; const lid = params.get("lesson") || ""; const qid = params.get("q") || "";
  if (!cid || !lid || !qid) return <Notice title="브레인스토밍 주소가 올바르지 않아요" body="차시 화면의 브레인스토밍 활동에서 다시 열어 주세요." />;
  return <Room key={`${cid}/${lid}/${qid}`} cid={cid} lid={lid} qid={qid} />;
}

/** 판에 그릴 섬 하나 = 한 반의 브레인스토밍 활동 */
export type IslandData = { cid: string; lid: string; qid: string; name: string; ideas: Idea[] };

function Room({ cid, lid, qid }: { cid: string; lid: string; qid: string }) {
  const { user, loading, configured } = useAuth();
  const [member, setMember] = useState<Awaited<ReturnType<typeof getMemberProfile>> | undefined>(undefined);
  const [question, setQuestion] = useState<Question | null | undefined>(undefined);
  const [world, setWorld] = useState<{ id: string; w: BrainWorld | null } | null>(null);
  const [ideaMap, setIdeaMap] = useState<Record<string, Idea[]>>({});
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
    const offs = [watchQuestion(cid, lid, qid, setQuestion, () => setQuestion(null)), watchMembers(cid, setMembers)];
    return () => offs.forEach(f => f());
  }, [cid, lid, qid, member]);
  // 섬이 이어져 있으면: 내 자리를 잡고(다른 반 섬 읽기 권한) 세계를 지켜본다
  const wid = question?.world ?? "";
  useEffect(() => {
    if (!wid || !user) return;
    let off = () => {}; let active = true;
    ensureSeat(wid, user.uid, cid)
      .then(() => { if (active) off = watchWorld(wid, w => setWorld({ id: wid, w }), () => setWorld({ id: wid, w: null })); })
      .catch(() => { if (active) setWorld({ id: wid, w: null }); });
    return () => { active = false; off(); };
  }, [wid, user, cid]);

  const linked = wid && world?.id === wid && world.w?.islands.some(i => i.cid === cid && i.qid === qid) ? world.w : null;
  const islandsSig = linked ? linked.islands.map(i => `${i.cid}/${i.lid}/${i.qid}`).join("|") : `${cid}/${lid}/${qid}`;
  useEffect(() => {
    const offs = islandsSig.split("|").map(key => {
      const [c, l, q] = key.split("/");
      return watchIdeas(c, l, q, list => setIdeaMap(m => ({ ...m, [key]: list })), e => setError(c === cid ? e.message : "다른 반 섬을 불러오지 못했어요."));
    });
    return () => offs.forEach(f => f());
  }, [islandsSig, cid]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  if (loading || (user && member === undefined)) return <Notice title="브레인스토밍 판에 들어가는 중…" />;
  if (!configured || !user) return <Notice title="학급 계정으로 들어와 주세요" body="학급에 가입한 계정으로 로그인한 뒤 다시 열어 주세요." action={<Link className={styles.primaryBtn} href="/">로그인하러 가기</Link>} />;
  if (!member) return <Notice title="이 학급 친구만 함께할 수 있어요" body="학급에 가입한 계정인지 확인해 주세요." />;
  if (question === undefined) return <Notice title="주제를 불러오고 있어요…" />;
  const teacher = member.role === "teacher";
  if (!question || question.kind !== "brainstorm") return <Notice title="브레인스토밍 활동을 찾을 수 없어요" body="선생님이 활동을 지웠거나 주소가 바뀌었을 수 있어요." />;
  if (!teacher && question.published === false) return <Notice title="아직 열리지 않은 활동이에요" body="선생님이 활동을 공개하면 여기서 바로 시작돼요." />;
  if (wid && world?.id !== wid) return <Notice title="이어진 섬들을 불러오는 중…" />;

  const islands: IslandData[] = (linked ? linked.islands : [{ cid, lid, qid, name: "" }])
    .map(i => ({ ...i, ideas: ideaMap[`${i.cid}/${i.lid}/${i.qid}`] ?? [] }));
  const home = Math.max(0, islands.findIndex(i => i.cid === cid && i.qid === qid));
  return <BrainstormBoard islands={islands} home={home} uid={user.uid} myName={member.displayName || user.displayName || "학생"} teacher={teacher}
    canLink={teacher && (!linked || linked.ownerId === user.uid)} question={question} members={members} now={now} error={error} />;
}

export function BrainstormBoard({ islands, home, uid, myName, teacher, canLink, question, members, now, error }: {
  islands: IslandData[]; home: number; uid: string; myName: string; teacher: boolean; canLink?: boolean;
  question: Question; members: Member[]; now: number; error: string;
}) {
  const multi = islands.length > 1;
  const layout = useMemo(() => worldLayout(islands.length), [islands.length]);
  const WW = layout.w; const WH = layout.h;
  const zoomMax = 4 * Math.max(layout.cols, layout.rows);
  const clampView = useCallback((v: BoardView): BoardView => {
    const s = Math.min(zoomMax, Math.max(1, v.s));
    return { s, x: Math.min(WW * (1 - 1 / s), Math.max(0, v.x)), y: Math.min(WH * (1 - 1 / s), Math.max(0, v.y)) };
  }, [WW, WH, zoomMax]);
  /** 섬 하나가 화면에 꽉 차게 */
  const islandView = useCallback((n: number) => {
    const o = layout.offsets[n] ?? { x: 0, y: 0 };
    const s = Math.min(WW / (VIEW_W * 1.04), WH / ((VIEW_H + LABEL_H) * 1.08));
    return clampView({ s, x: o.x + VIEW_W / 2 - WW / s / 2, y: o.y + (VIEW_H - LABEL_H) / 2 - WH / s / 2 });
  }, [layout, WW, WH, clampView]);

  const [showNames, setShowNames] = useState(true);
  const [panel, setPanel] = useState(false);
  const [focus, setFocus] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);
  // 말풍선: 모두(쓴 아이디어 — 많으면 접어 두고 눌러서 펼침) / 하나씩(돌아가며)
  const [bubbleAll, setBubbleAll] = useState(true);
  const [opened, setOpened] = useState<Set<string>>(() => new Set());
  const toggleOpen = (id: string) => setOpened(prev => { const next = new Set(prev); if (!next.delete(id)) next.add(id); return next; });
  // 확대·이동 — 판 좌표로 화면 왼쪽 위(x, y)와 배율(s). 섬이 여럿이면 학생은 우리 반 섬부터, 선생님은 전체부터.
  const startView = () => (multi && !teacher ? islandView(home) : { x: 0, y: 0, s: 1 });
  const [view, setView] = useState<BoardView>(startView);
  const layoutKey = `${islands.length}:${home}`;
  const [viewFor, setViewFor] = useState(layoutKey);
  if (viewFor !== layoutKey) { setViewFor(layoutKey); setView(startView()); }
  const boardRef = useRef<HTMLDivElement>(null);
  const zoomAt = useCallback((factor: number, fx = 0.5, fy = 0.5) => setView(v => {
    const s = Math.min(zoomMax, Math.max(1, v.s * factor));
    const ux = v.x + (fx * WW) / v.s; const uy = v.y + (fy * WH) / v.s;
    return clampView({ s, x: ux - (fx * WW) / s, y: uy - (fy * WH) / s });
  }), [WW, WH, zoomMax, clampView]);
  usePanZoom(boardRef, WW, WH, setView, zoomAt, clampView);
  const seaRef = useRef<HTMLElement>(null);
  // 3D 로 그려지고 있는 학생들 / WebGL 을 못 쓰는 기기
  const [live3d, setLive3d] = useState<Set<string>>(() => new Set());
  const [no3d, setNo3d] = useState(false);
  const onLoaded = useCallback((ids: string[]) => setLive3d(prev => (prev.size === ids.length && ids.every(u => prev.has(u)) ? prev : new Set(ids))), []);
  const onFail = useCallback(() => setNo3d(true), []);
  const topic = question.title.trim() || "브레인스토밍";
  const detail = useMemo(() => blocksToPlainText(question.text).trim(), [question.text]);

  // 섬마다: 처음 아이디어를 낸 순서대로 자리를 잡는다(먼저 온 친구의 자리는 바뀌지 않는다)
  const isles = useMemo(() => islands.map((is, n) => {
    const byUid = new Map<string, Idea[]>();
    for (const idea of is.ideas) { const list = byUid.get(idea.uid) ?? []; list.push(idea); byUid.set(idea.uid, list); }
    const people = [...byUid.entries()].map(([id, list]) => ({ uid: id, ideas: list, name: list[list.length - 1].name }));
    const map = territoryFor(is.qid, people.map(p => ({ uid: p.uid, ideas: p.ideas.length })));
    const chars = assignChars(people.map(p => p.uid));
    return { ...is, n, key: `${is.cid}/${is.qid}`, people, map, chars, off: layout.offsets[n] ?? { x: 0, y: 0 }, props: propsFor(is.qid, map.cells) };
  }), [islands, layout]);
  // 판 위 모든 학생(섬 여럿이면 같은 사람도 섬마다 따로 — 선생님이 여러 반에 쓴 경우)
  const everyone = useMemo(() => isles.flatMap(I => I.people.map((p, k) => {
    const h = I.map.homes[k];
    return { id: `${I.n}:${p.uid}`, k, p, I, char: I.chars[k], color: inkColor(k), home: h ? { x: I.off.x + h.x, y: I.off.y + h.y } : null };
  })), [isles]);
  const actors: Actor[] = useMemo(() => everyone.flatMap(e => (e.home ? [{ uid: e.id, char: e.char, x: e.home.x, y: e.home.y + FEET, ideas: e.p.ideas.length }] : [])), [everyone]);
  const photo = useMemo(() => new Map(members.map(m => [m.uid, m.photoURL])), [members]);
  const nameOf = (n: number, id: string, fallback: string) => (n === home ? members.find(m => m.uid === id)?.displayName : "") || fallback;
  const totalIdeas = islands.reduce((a, i) => a + i.ideas.length, 0);
  const select = (id: string) => { setFocus(f => (f === id ? null : id)); setPanel(true); };

  const worldStyle = { transform: `scale(${view.s}) translate(${(-view.x / WW) * 100}%, ${(-view.y / WH) * 100}%)`, "--zoom": view.s } as CSSProperties;
  // 말풍선 겹침 풀기 — 화면에 그려진 뒤 실제 크기를 재서 서로 비키게 한다(리액트 상태 없이 스타일만 바꿈)
  const [resizeTick, setResizeTick] = useState(0);
  useEffect(() => {
    const sea = seaRef.current; if (!sea) return;
    const ro = new ResizeObserver(() => setResizeTick(t => t + 1)); ro.observe(sea);
    return () => ro.disconnect();
  }, []);
  useLayoutEffect(() => {
    const board = boardRef.current; const sea = seaRef.current; if (!board || !sea) return;
    const all = [...board.querySelectorAll<HTMLElement>("[data-bubble]")];
    for (const w of all) { w.style.setProperty("--bx", "0px"); w.style.setProperty("--by", "0px"); w.removeAttribute("data-far"); }
    const area = sea.getBoundingClientRect();
    // 화면 밖(확대해서 안 보이는 섬)의 말풍선은 셈하지 않는다
    const wraps = all.filter(w => { const r = w.getBoundingClientRect(); return r.width > 0 && r.right > area.left && r.left < area.right && r.bottom > area.top && r.top < area.bottom; });
    // 반응형: 말풍선이 화면을 많이 차지하면(붐빔) 한 줄씩 보이는 작은 말풍선으로
    const crowd = () => wraps.reduce((n, w) => { const r = w.getBoundingClientRect(); return n + r.width * r.height; }, 0) / (area.width * area.height);
    // 1단계: 최근 2개 한 줄씩 / 2단계(여러 반 섬을 한눈에 볼 때처럼 아주 붐빔): 최근 1개만, 더 작게
    delete board.dataset.compact;
    if (bubbleAll && crowd() > 0.28) {
      board.dataset.compact = "1";
      if (crowd() > 0.3) board.dataset.compact = "2";
    }
    const rects = wraps.map(w => w.getBoundingClientRect());
    const shifts = spreadBubbles(rects.map(r => ({ x: r.left, y: r.top, w: r.width, h: r.height })), { x: area.left + 4, y: area.top + 4, w: area.width - 8, h: area.height - 8 });
    shifts.forEach((d, i) => {
      const w = wraps[i];
      w.style.setProperty("--bx", `${d.dx}px`); w.style.setProperty("--by", `${d.dy}px`);
      const len = Math.hypot(d.dx, d.dy);
      if (len > 14) { w.dataset.far = ""; w.style.setProperty("--ll", `${len}px`); w.style.setProperty("--la", `${Math.atan2(-d.dy, -d.dx)}rad`); }
    });
  }, [everyone, view, bubbleAll, opened, showNames, live3d, panel, now, resizeTick]);

  const myIsle = isles[home];
  const myK = myIsle ? myIsle.people.findIndex(p => p.uid === uid) : -1;
  return <main className={styles.page}>
    <header className={styles.top}>
      <div className={styles.topic}>
        <span className={styles.kicker}><Icon name="tips_and_updates" size={16} />브레인스토밍{multi ? ` · ${islands.length}개 반이 함께` : ""}</span>
        <h1>{topic}</h1>
        {detail && <p>{detail}</p>}
      </div>
      <div className={styles.stats}>
        <span><b>{everyone.length}</b>명 참여</span>
        <span><b>{totalIdeas}</b>개 아이디어</span>
      </div>
      <div className={styles.tools}>
        <button type="button" className={styles.chip} aria-pressed={showNames} onClick={() => setShowNames(v => !v)}><Icon name={showNames ? "badge" : "visibility_off"} size={18} />{showNames ? "이름 보임" : "이름 숨김"}</button>
        <button type="button" className={styles.chip} aria-pressed={bubbleAll} onClick={() => setBubbleAll(v => !v)}><Icon name="chat_bubble" size={18} />{bubbleAll ? "말풍선 모두" : "말풍선 하나씩"}</button>
        <button type="button" className={styles.chip} aria-pressed={panel} onClick={() => setPanel(v => !v)}><Icon name="format_list_bulleted" size={18} />아이디어 모아 보기</button>
        {canLink && <button type="button" className={styles.chip} onClick={() => setLinking(true)}><Icon name="travel_explore" size={18} />{multi ? "반 섬 관리" : "다른 반과 섬 잇기"}</button>}
        <button type="button" className={styles.chip} onClick={() => { if (document.fullscreenElement) void document.exitFullscreen(); else void document.documentElement.requestFullscreen?.().catch(() => {}); }} aria-label="전체 화면"><Icon name="fullscreen" size={18} /></button>
      </div>
    </header>
    {error && <p role="alert" className={styles.error}>{error}</p>}

    <div className={`${styles.body} ${panel ? styles.withPanel : ""}`}>
      <section ref={seaRef} className={styles.sea} aria-label="아이디어 땅따먹기 판">
        <div ref={boardRef} className={`${styles.board} ${view.s > 1 ? styles.zoomed : ""}`}
          style={{ aspectRatio: `${WW} / ${WH}`, width: `min(100%, calc((100dvh - 230px) * ${(WW / WH).toFixed(3)}))`, maxWidth: multi ? "none" : 1500, "--char-h": `${(CHAR_H / WW) * 100}cqw` } as CSSProperties}>
          {/* 층: 섬·잉크(SVG) → 3D 캐릭터(WebGL) → 말풍선·이름(HTML). 섬과 말풍선은 같은 변환으로 확대·이동하고, 3D 는 카메라를 맞춘다 */}
          <div className={styles.world} style={worldStyle}>
          <svg viewBox={`0 0 ${WW} ${WH}`} className={styles.map} aria-hidden="true">
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
              {isles.map(I => <mask key={I.key} id={`bs-island-${I.n}`} maskUnits="userSpaceOnUse" x="0" y="0" width={VIEW_W} height={VIEW_H + 20}>
                <g filter="url(#bs-goo)" fill="#fff">{I.map.cells.map(c => <circle key={c.i} cx={c.x} cy={c.y} r={CELL_R * 1.2} />)}</g>
              </mask>)}
            </defs>
            {isles.map(I => <g key={I.key} transform={`translate(${I.off.x} ${I.off.y})`} opacity={multi && focus && !focus.startsWith(`${I.n}:`) ? 0.6 : 1}>
              {/* 절벽(섬 옆면) → 윗면 → 잉크 → 가장자리 장식 */}
              <g filter="url(#bs-edge)" transform="translate(0 8)">
                <rect width={VIEW_W} height={VIEW_H} fill="#b8743f" mask={`url(#bs-island-${I.n})`} />
              </g>
              <g filter="url(#bs-edge)">
                <rect width={VIEW_W} height={VIEW_H} fill="url(#bs-grass)" mask={`url(#bs-island-${I.n})`} />
              </g>
              {/* 학생마다 따로 테두리 — 영역이 맞닿으면 그 경계에도 검정 선이 생긴다 */}
              {I.people.map((p, k) => {
                const cells = I.map.cells.filter(c => I.map.owner.get(c.i) === k);
                const id = `${I.n}:${p.uid}`;
                return <g key={p.uid} filter="url(#bs-edge-thin)" opacity={focus && focus !== id ? 0.35 : 1}>
                  <g filter="url(#bs-goo)" fill={inkColor(k)}>
                    {cells.map(c => <circle key={c.i} cx={c.x} cy={c.y} r={CELL_R * 1.08} className={styles.ink} style={{ transformOrigin: `${c.x}px ${c.y}px` }} />)}
                  </g>
                </g>;
              })}
              <g filter="url(#bs-edge-thin)">
                {I.props.map(d => d.kind === "bush"
                  ? <g key={d.i} transform={`translate(${d.x} ${d.y})`}>
                      <circle cx={-5} cy={1} r={5.2} fill="#2f9e44" /><circle cx={5} cy={1} r={5.2} fill="#2f9e44" /><circle cx={0} cy={-3} r={6.2} fill="#37b24d" />
                      <circle cx={-1.5} cy={-5.5} r={2} fill="#69db7c" />
                    </g>
                  : <g key={d.i} transform={`translate(${d.x} ${d.y})`}>
                      <rect x={-6.5} y={-5} width={13} height={10} rx={3.5} fill="#a5afc4" /><rect x={-4.5} y={-4} width={6} height={3} rx={1.5} fill="#d0d6e4" />
                    </g>)}
              </g>
            </g>)}
          </svg>
          </div>
          {!no3d && <CharacterLayer actors={actors} viewW={WW} viewH={WH} charH={CHAR_H} view={view} onLoaded={onLoaded} onFail={onFail} />}
          <div className={styles.world} style={worldStyle}>
          {/* 섬마다 반 이름표 — 누르면 그 섬으로 */}
          {multi && isles.map(I => <div key={I.key} className={styles.isleTag} style={{ left: `${((I.off.x + VIEW_W / 2) / WW) * 100}%`, top: `${((I.off.y - LABEL_H * 0.45) / WH) * 100}%` }}>
            <button type="button" className={`${styles.isleBtn} ${I.n === home ? styles.isleHome : ""}`} onClick={() => setView(islandView(I.n))}>
              <Icon name="flag" size={16} fill />{I.name || "반"}<span>{I.people.length}명 · {I.ideas.length}개</span>{I.n === home && <em>우리 반</em>}
            </button>
          </div>)}
          {everyone.map(({ id, k, p, I, char, color, home: pos }) => {
            if (!pos) return null;
            const latest = p.ideas[p.ideas.length - 1];
            const fresh = now > 0 && now - latest.at < FRESH_MS;
            const n = p.ideas.length;
            const open = opened.has(id);
            // 모두: 3개까지는 전부, 더 많으면 최근 2개 + "N개 더 보기"(누르면 펼침) / 하나씩: 새 아이디어 먼저, 아니면 엇갈리게 돌아가며
            const collapsible = bubbleAll && n > COLLAPSE_AT;
            const shown = fresh ? latest : p.ideas[Math.floor((now + k * 1700) / BUBBLE_MS) % n];
            const lines = !bubbleAll ? [shown] : collapsible && !open ? p.ideas.slice(-PEEK) : p.ideas;
            const more = n - lines.length;
            const in3d = live3d.has(id);
            const left = (pos.x / WW) * 100; const top = ((pos.y + (in3d ? FEET : 0)) / WH) * 100;
            const name = nameOf(I.n, p.uid, p.name);
            const mine = I.n === home && p.uid === uid;
            return <div key={id} className={`${styles.player} ${in3d ? styles.player3d : ""} ${fresh ? styles.fresh : ""} ${mine ? styles.me : ""} ${focus === id ? styles.focused : ""} ${open ? styles.opened : ""}`}
              style={{ left: `${left}%`, top: `${top}%`, "--ink": color, "--delay": `${-(k * 0.37) % 3}s`, zIndex: open ? 350 : focus === id ? 300 : fresh ? 200 : Math.round(top) } as CSSProperties}>
              {/* 겹침 풀기로 옮겨지는 껍데기 — 많이 비켜나면 캐릭터까지 가는 선(leader)이 생긴다 */}
              <span className={styles.bubbleWrap} data-bubble="" data-open={open ? "" : undefined}>
                <span className={styles.leader} aria-hidden="true" />
                <button type="button" className={`${styles.bubble} ${bubbleAll && (lines.length > 1 || more > 0) ? styles.bubbleList : ""}`} key={bubbleAll ? "all" : shown.id}
                  onClick={() => (collapsible ? toggleOpen(id) : select(id))} aria-expanded={collapsible ? open : undefined}
                  aria-label={collapsible ? `${showNames ? name : "친구"}의 아이디어 ${n}개 ${open ? "접기" : "모두 보기"}` : undefined}>
                  <span className={styles.lines} data-scroll={open ? "" : undefined}>
                    {lines.map(i => <span key={i.id} className={`${styles.bubbleText} ${bubbleAll && fresh && i.id === latest.id ? styles.newLine : ""}`}>{i.text}</span>)}
                  </span>
                  {collapsible && <small className={styles.more}>{open ? <><Icon name="expand_less" size={14} />접기</> : <><Icon name="expand_more" size={14} />{more}개 더 보기</>}</small>}
                  {n > 1 && <em>{n}</em>}
                </button>
              </span>
              <button type="button" className={styles.charBtn} onClick={() => select(id)} aria-label={`${showNames ? name : "친구"}의 아이디어 ${n}개 모아 보기`}>
                {in3d ? <span className={styles.body3d} /> : <span className={styles.char}>
                  {/* 3D 를 못 쓰거나 불러오는 동안: 내 캐릭터 그림 → 없으면 프로필 사진 → 기본 얼굴 */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={charThumb(char.id)} alt="" onError={e => { const img = e.currentTarget; const next = I.n === home ? photo.get(p.uid) : undefined; if (next && img.dataset.step !== "photo") { img.dataset.step = "photo"; img.src = next; } else img.src = fallbackFace(p.uid); }} />
                </span>}
              </button>
              <span className={styles.shadow} />
              {showNames && <span className={styles.name}>{name}</span>}
            </div>;
          })}
          </div>
          {!everyone.length && <div className={styles.empty}><Icon name="water_drop" size={32} /><strong>첫 아이디어를 기다리는 중</strong><span>아이디어를 쓰면 내 색 잉크가 섬에 퍼져요!</span></div>}
        </div>
        <div className={styles.zoomBar} role="group" aria-label="판 확대·축소">
          <button type="button" onClick={() => zoomAt(1.4)} aria-label="확대" disabled={view.s >= zoomMax}><Icon name="add" size={20} /></button>
          <span>{Math.round(view.s * 100)}%</span>
          <button type="button" onClick={() => zoomAt(1 / 1.4)} aria-label="축소" disabled={view.s <= 1}><Icon name="remove" size={20} /></button>
          {multi && <button type="button" onClick={() => setView(islandView(home))} aria-label="우리 반 섬으로"><Icon name="home" size={20} /></button>}
          <button type="button" onClick={() => setView({ x: 0, y: 0, s: 1 })} aria-label="전체 보기" disabled={view.s === 1}><Icon name="fit_screen" size={20} /></button>
        </div>
      </section>

      {panel && <aside className={styles.panel} aria-label="아이디어 모아 보기">
        <div className={styles.panelHead}><strong>영역 순위</strong><button type="button" onClick={() => { setPanel(false); setFocus(null); }} aria-label="닫기"><Icon name="close" size={18} /></button></div>
        {/* 섬이 여럿이면 우리 반 섬부터, 섬마다 따로 순위 */}
        {[...isles].sort((a, b) => (a.n === home ? -1 : b.n === home ? 1 : a.n - b.n)).map(I => {
          const total = I.map.cells.length;
          const ranking = I.people.map((p, k) => ({ ...p, k, id: `${I.n}:${p.uid}`, share: total ? I.map.area[k] / total : 0 })).sort((a, b) => b.share - a.share || b.ideas.length - a.ideas.length);
          return <section key={I.key} className={styles.panelIsle}>
            {multi && <h3>{I.name || "반"}{I.n === home ? " (우리 반)" : ""}<span>{I.people.length}명 · {I.ideas.length}개</span></h3>}
            {!ranking.length ? <p className={styles.panelEmpty}>아직 아이디어가 없어요</p> : <ol className={styles.rank}>
              {ranking.map((p, i) => <li key={p.id} className={focus === p.id ? styles.rankOn : ""}>
                <button type="button" onClick={() => setFocus(f => (f === p.id ? null : p.id))}>
                  <span className={styles.place}>{i + 1}</span><span className={styles.swatch} style={{ background: inkColor(p.k) }} />
                  <span className={styles.rankName}>{showNames || (I.n === home && p.uid === uid) ? nameOf(I.n, p.uid, p.name) : `친구 ${i + 1}`}</span>
                  <span className={styles.rankNum}>{Math.round(p.share * 100)}% · {p.ideas.length}개</span>
                </button>
                {(focus === p.id || ranking.length <= 6) && <ul className={styles.ideaList}>
                  {p.ideas.map(idea => <li key={idea.id}><span>{idea.text}</span>
                    {(teacher || (I.n === home && idea.uid === uid)) && <button type="button" onClick={() => void deleteIdea(I.cid, I.lid, I.qid, idea.id)} aria-label="아이디어 지우기"><Icon name="delete" size={16} /></button>}
                  </li>)}
                </ul>}
              </li>)}
            </ol>}
          </section>;
        })}
      </aside>}
    </div>

    {/* 선생님도 써 볼 수 있다(테스트·예시 아이디어) — 선생님 글도 판에 똑같이 칠해진다. 쓰는 곳은 언제나 우리 반 섬 */}
    {myIsle && <Composer teacher={teacher} cid={myIsle.cid} lid={myIsle.lid} qid={myIsle.qid} uid={uid} name={myName} mine={myIsle.ideas.filter(i => i.uid === uid)} color={inkColor(Math.max(0, myK))} joined={myK >= 0} />}
    {linking && <LinkIslandsDialog cid={islands[home].cid} lid={islands[home].lid} question={question} onClose={() => setLinking(false)} />}
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

/**
 * 판 확대·이동: 마우스 휠(가리킨 곳 중심) · 끌기 · 두 손가락 벌리기/좁히기.
 * 살짝 누른 것(6px 미만 이동)은 캐릭터·말풍선 클릭으로 그대로 둔다. 펼친 말풍선 안에서는 스크롤.
 */
function usePanZoom(ref: React.RefObject<HTMLDivElement | null>, ww: number, wh: number, setView: (f: (v: BoardView) => BoardView) => void,
  zoomAt: (factor: number, fx?: number, fy?: number) => void, clampView: (v: BoardView) => BoardView) {
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const inScroll = (t: EventTarget | null) => !!(t as HTMLElement | null)?.closest?.("[data-scroll]");
    const frac = (cx: number, cy: number) => { const r = el.getBoundingClientRect(); return [(cx - r.left) / r.width, (cy - r.top) / r.height] as const; };
    const onWheel = (e: WheelEvent) => {
      if (inScroll(e.target)) return;
      e.preventDefault();
      const [fx, fy] = frac(e.clientX, e.clientY);
      zoomAt(Math.exp(-e.deltaY * 0.0015), fx, fy);
    };
    const pts = new Map<number, { x: number; y: number }>();
    let moved = 0; let pinch = 0;
    const down = (e: PointerEvent) => { if (inScroll(e.target)) return; pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); moved = 0; if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); } };
    const move = (e: PointerEvent) => {
      const prev = pts.get(e.pointerId); if (!prev) return;
      const cur = { x: e.clientX, y: e.clientY }; pts.set(e.pointerId, cur);
      const r = el.getBoundingClientRect();
      if (pts.size === 2) {
        const [a, b] = [...pts.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch > 0) { const [fx, fy] = frac((a.x + b.x) / 2, (a.y + b.y) / 2); zoomAt(d / pinch, fx, fy); }
        pinch = d; moved += 10; return;
      }
      const dx = cur.x - prev.x; const dy = cur.y - prev.y; moved += Math.abs(dx) + Math.abs(dy);
      if (moved < 6) return;
      if (!el.hasPointerCapture(e.pointerId)) el.setPointerCapture(e.pointerId);
      setView(v => clampView({ s: v.s, x: v.x - (dx / r.width) * (ww / v.s), y: v.y - (dy / r.height) * (wh / v.s) }));
    };
    const up = (e: PointerEvent) => { pts.delete(e.pointerId); if (pts.size < 2) pinch = 0; };
    // 끌어서 옮긴 뒤 손을 뗄 때 캐릭터가 눌린 것으로 치지 않게
    const click = (e: MouseEvent) => { if (moved >= 6) { e.stopPropagation(); e.preventDefault(); moved = 0; } };
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("pointerdown", down); el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up);
    el.addEventListener("click", click, true);
    return () => {
      el.removeEventListener("wheel", onWheel); el.removeEventListener("pointerdown", down); el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up); el.removeEventListener("pointercancel", up); el.removeEventListener("click", click, true);
    };
  }, [ref, ww, wh, setView, zoomAt, clampView]);
}
