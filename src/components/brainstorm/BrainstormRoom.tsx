"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { useAuth } from "@/contexts/AuthContext";
import { getMemberProfile, watchMembers, type Member } from "@/lib/classes";
import { updateQuestion, watchQuestion, type Question } from "@/lib/lessons";
import { addIdea, deleteIdea, ensureSeat, setWorldShared, watchIdeas, watchWorld, IDEA_MAX_LEN, IDEAS_PER_STUDENT, type BrainWorld, type Idea } from "@/lib/brainstorm";
import { reloadOnce } from "@/lib/chunk-reload";
import { CELL_R, CLASS_GRID, INK_COLORS, inkColor, LABEL_H, LIFT_MAX, liftFor, mixColor, paintTerritory, seamsOf, worldLayout, type Cell, type Grid, type Painter, type Territory } from "@/lib/brainstorm-map";
import { downloadBrainstormCsv, type ExportMode } from "@/lib/brainstorm-export";
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
/** 이보다 사람이 많으면 캐릭터 둥실 움직임을 멈춰 가볍게 */
const CALM_AT = 20;

function hash(s: string) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }
/** 프로필 사진이 없으면 기본 캐릭터 그림 중 하나(학생마다 고정) */
const fallbackFace = (uid: string) => `/avatar/${(hash(uid) % 23) + 1}.png`;

// 3D 캐릭터(three.js)는 판을 열 때만 따로 불러온다
// 3D 층 코드는 따로 불러온다. 배포 직후 옛 탭이라 못 불러오면 판을 깨뜨리지 않고 한 번 새로 고침 → 그래도 안 되면 2D 그림으로
const CharacterLayer = dynamic(() => import("./CharacterLayer").then(m => m.CharacterLayer).catch(() => {
  reloadOnce();
  return function No3d({ onFail }: { onFail: () => void }) { useEffect(() => onFail(), [onFail]); return null; } as unknown as typeof import("./CharacterLayer").CharacterLayer;
}), { ssr: false });
/** 캐릭터 키(판 좌표) — 발은 집 칸 중심보다 조금 아래 */
const CHAR_H = CELL_R * 3.6;
const FEET = CELL_R * 0.5;
/** 잔디 체크 타일 한 칸(판 좌표) */
const TILE = 12;

/** 섬 가장자리 칸 중 서로 떨어진 몇 곳에 덤불·바위를 둔다(활동마다 같은 자리). */
function edgeProps(cells: Cell[], max = 12) {
  const has = new Set(cells.map(c => `${c.c},${c.r}`));
  const isEdge = (c: Cell) => {
    let n = 0;
    for (let dc = -1; dc <= 1; dc++) for (let dr = -1; dr <= 1; dr++) if ((dc || dr) && has.has(`${c.c + dc},${c.r + dr}`)) n++;
    return n <= 5;
  };
  const picks: { i: number; x: number; y: number; kind: "bush" | "rock" }[] = [];
  for (const c of [...cells].sort((a, b) => ((a.i * 2654435761) % 997) - ((b.i * 2654435761) % 997))) {
    if (picks.length >= max || !isEdge(c)) continue;
    if (picks.some(p => Math.hypot(p.x - c.x, p.y - c.y) < 70)) continue;
    picks.push({ i: c.i, x: c.x, y: c.y, kind: picks.length % 3 === 2 ? "rock" : "bush" });
  }
  return picks;
}

/** 잉크 색 번호 쌍(작은 번호 먼저) — 섞은 색 그라디언트 이름 */
const pairKey = (a: number, b: number) => { const x = a % INK_COLORS.length; const y = b % INK_COLORS.length; return x < y ? `${x}-${y}` : `${y}-${x}`; };

// 땅 계산은 섬마다 아이디어 수가 바뀔 때만 다시 한다(섬이 여러 개라도 바뀐 섬만)
const territoryCache = new Map<string, Territory>();
function territoryFor(seed: string, painters: Painter[], g: Grid) {
  const key = `${seed}|${g.cols}x${g.rows}|${painters.map(p => `${p.uid}:${p.ideas}`).join(",")}`;
  let t = territoryCache.get(key);
  if (!t) {
    t = paintTerritory(seed, painters, g);
    if (territoryCache.size > 80) territoryCache.delete(territoryCache.keys().next().value!);
    territoryCache.set(key, t);
  }
  return t;
}
const propsCache = new Map<string, ReturnType<typeof edgeProps>>();
function propsFor(seed: string, cells: Cell[], g: Grid) {
  const key = `${seed}|${g.cols}x${g.rows}`;
  let p = propsCache.get(key);
  if (!p) { p = edgeProps(cells, Math.round(12 * Math.sqrt(cells.length / 700))); propsCache.set(key, p); }
  return p;
}

export default function BrainstormRoom() {
  const params = useSearchParams();
  const cid = params.get("class") || ""; const lid = params.get("lesson") || ""; const qid = params.get("q") || "";
  if (!cid || !lid || !qid) return <Notice title="브레인스토밍 주소가 올바르지 않아요" body="차시 화면의 브레인스토밍 활동에서 다시 열어 주세요." />;
  return <Room key={`${cid}/${lid}/${qid}`} cid={cid} lid={lid} qid={qid} />;
}

/** 판에 그릴 섬 하나 = 한 반의 브레인스토밍 활동 */
export type IslandData = { cid: string; lid: string; qid: string; name: string; ideas: Idea[]; hidden?: boolean };

/** 아이디어 쓰기·지우기 — 학급 판은 차시 활동에, 따로 여는 세션 판(/idea)은 세션에 저장한다. */
export type BoardStore = {
  add: (island: IslandData, uid: string, name: string, text: string) => Promise<void>;
  remove: (island: IslandData, ideaId: string) => Promise<void>;
};
const classStore: BoardStore = {
  add: (I, uid, name, text) => addIdea(I.cid, I.lid, I.qid, uid, name, text),
  remove: (I, id) => deleteIdea(I.cid, I.lid, I.qid, id),
};

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
  // 다른 반 섬 내용: 선생님은 언제나, 학생은 선생님이 '보여 주기'를 켰을 때만(규칙에서도 막는다)
  const isTeacher = member?.role === "teacher";
  const seeOthers = !!linked && (isTeacher || linked.shared);
  const islandsSig = linked ? linked.islands.filter(i => seeOthers || (i.cid === cid && i.qid === qid)).map(i => `${i.cid}/${i.lid}/${i.qid}`).join("|") : `${cid}/${lid}/${qid}`;
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
    .map(i => {
      const hidden = !seeOthers && !(i.cid === cid && i.qid === qid);
      return { ...i, hidden, ideas: hidden ? [] : ideaMap[`${i.cid}/${i.lid}/${i.qid}`] ?? [] };
    });
  const home = Math.max(0, islands.findIndex(i => i.cid === cid && i.qid === qid));
  return <BrainstormBoard islands={islands} home={home} uid={user.uid} myName={member.displayName || user.displayName || "학생"} teacher={teacher}
    canLink={teacher && (!linked || linked.ownerId === user.uid)} question={question} members={members} now={now} error={error}
    hideIdeas={!!question.hideIdeas} onHide={teacher ? v => void Promise.all(islands.map(i => updateQuestion(i.cid, i.lid, i.qid, { hideIdeas: v })))
      .catch(() => setError("응답 가리기를 바꾸지 못했어요.")) : undefined}
    shared={linked?.shared} onShare={linked && linked.ownerId === user.uid ? v => void setWorldShared(linked.id, v).catch(() => setError("공개 설정을 바꾸지 못했어요.")) : undefined} />;
}

type BoardProps = {
  islands: IslandData[]; home: number; uid: string; myName: string; teacher: boolean; canLink?: boolean;
  question: Pick<Question, "title" | "text">; members: Member[]; now: number; error: string;
  /** 판 크기(인원이 많은 세션은 더 큰 판) · 저장소 · 머리글 꼬리표 · 머리글 도구 더하기 · 판 위에 띄울 것 */
  grid?: Grid; store?: BoardStore; kicker?: string; extraTools?: ReactNode; overlay?: ReactNode;
  /** 아래 쓰기 칸을 보일지 · 마감돼 못 쓸 때 쓰기 칸 대신 보일 말 · 내 자리가 생기면 거기로 확대해 보여 주기(휴대폰 참여자) */
  composer?: boolean; closedNote?: string; startOnMe?: boolean;
  /** 여러 반 섬: 학생에게 다른 반 섬 내용을 보여 주는지 · 바꾸기(세계를 만든 선생님만) */
  shared?: boolean; onShare?: (v: boolean) => void;
  /** 응답 가리기 — 켜져 있으면 학생에게 다른 친구 응답 글은 안 보이고 개수만(선생님·자기 응답은 그대로) · 바꾸기(선생님) */
  hideIdeas?: boolean; onHide?: (v: boolean) => void;
};

/** 여러 반 섬: 위쪽 탭으로 '모두' 또는 반 하나만 골라 그 섬만 크게 본다(다른 반 섬은 아예 그리지 않는다).
 *  학생은 우리 반 섬부터, 선생님은 모두부터. 섬 이름표를 눌러도 그 반만 보기로 들어간다. */
export function BrainstormBoard(props: BoardProps) {
  const { islands, home, teacher } = props;
  const keyOf = (i: IslandData) => `${i.cid}/${i.qid}`;
  const [solo, setSolo] = useState<string | null>(() => (islands.length > 1 && !teacher && islands[home] ? keyOf(islands[home]) : null));
  if (islands.length < 2) return <Board {...props} />;
  const n = solo ? islands.findIndex(i => keyOf(i) === solo) : -1;
  const tabs = <div className={styles.isleTabs} data-nopan="" role="tablist" aria-label="볼 섬 고르기">
    <button type="button" role="tab" aria-selected={n < 0} onClick={() => setSolo(null)}><Icon name="public" size={18} />모두</button>
    {islands.map((I, k) => <button key={keyOf(I)} type="button" role="tab" aria-selected={k === n} onClick={() => setSolo(keyOf(I))}>
      <Icon name={I.hidden ? "lock" : k === home ? "home" : "flag"} size={16} fill={k === n} />{I.name || "반"}
    </button>)}
  </div>;
  if (n < 0) return <Board {...props} isleTabs={tabs} onIsle={k => setSolo(keyOf(islands[k]))} />;
  return <Board {...props} islands={[islands[n]]} home={n === home ? 0 : -1} homeIsland={islands[home]} linkedCount={islands.length} isleTabs={tabs} />;
}

function Board({ islands, home, uid, myName, teacher, canLink, question, members, now, error,
  grid = CLASS_GRID, store = classStore, kicker = "브레인스토밍", extraTools, overlay, composer = true, closedNote, startOnMe, shared, onShare, hideIdeas, onHide,
  linkedCount = islands.length, homeIsland = islands[home], isleTabs, onIsle }: BoardProps & {
  /** 반 하나만 보기일 때: 이어진 섬 수 · 쓰기 칸이 쓸 우리 반 섬(지금 보는 섬이 다른 반이어도) · 섬 고르기 탭 · 이름표 눌러 그 반만 보기 */
  linkedCount?: number; homeIsland?: IslandData; isleTabs?: ReactNode; onIsle?: (n: number) => void;
}) {
  const linked = linkedCount > 1;
  const VIEW_W = grid.w; const VIEW_H = grid.h;
  const multi = islands.length > 1;
  const layout = useMemo(() => worldLayout(islands.length, 1.9, grid), [islands.length, grid]);
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
  }, [layout, WW, WH, VIEW_W, VIEW_H, clampView]);

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
  const layoutKey = `${islands.map(i => i.qid).join()}:${home}`;
  const [viewFor, setViewFor] = useState(layoutKey);
  if (viewFor !== layoutKey) { setViewFor(layoutKey); setView(startView()); }
  const boardRef = useRef<HTMLDivElement>(null);
  const zoomAt = useCallback((factor: number, fx = 0.5, fy = 0.5) => setView(v => {
    const s = Math.min(zoomMax, Math.max(1, v.s * factor));
    const ux = v.x + (fx * WW) / v.s; const uy = v.y + (fy * WH) / v.s;
    return clampView({ s, x: ux - (fx * WW) / s, y: uy - (fy * WH) / s });
  }), [WW, WH, zoomMax, clampView]);
  const seaRef = useRef<HTMLElement>(null);
  // 판 바깥 바다 여백에서도 끌기·확대가 된다(좌표 계산은 판 기준)
  usePanZoom(seaRef, boardRef, WW, WH, setView, zoomAt, clampView);
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
    const map = territoryFor(is.qid, people.map(p => ({ uid: p.uid, ideas: p.ideas.length })), grid);
    const chars = assignChars(people.map(p => p.uid));
    // 많이 쓴 친구일수록 땅이 솟는다. 앞(아래)쪽 땅이 뒤쪽 땅의 옆면을 가리도록 집이 위에 있는 친구부터 그린다.
    const lifts = people.map(p => liftFor(p.ideas.length));
    const order = people.map((_, k) => k).sort((a, b) => (map.homes[a]?.y ?? 0) - (map.homes[b]?.y ?? 0));
    return { ...is, n, key: `${is.cid}/${is.qid}`, people, map, chars, lifts, order, seams: seamsOf(map, grid), off: layout.offsets[n] ?? { x: 0, y: 0 }, props: propsFor(is.qid, map.cells, grid) };
  }), [islands, layout, grid]);
  // 판 위 모든 학생(섬 여럿이면 같은 사람도 섬마다 따로 — 선생님이 여러 반에 쓴 경우)
  const everyone = useMemo(() => isles.flatMap(I => I.people.map((p, k) => {
    const h = I.map.homes[k];
    return { id: `${I.n}:${p.uid}`, k, p, I, char: I.chars[k], color: inkColor(k), home: h ? { x: I.off.x + h.x, y: I.off.y + h.y - I.lifts[k] } : null };
  })), [isles]);
  // 판에 실제로 나오는 색 쌍만 그라디언트를 만든다
  const mixPairs = useMemo(() => [...new Set(isles.flatMap(I => I.seams.map(m => pairKey(m.a, m.b))))].map(k => k.split("-").map(Number)), [isles]);
  const actors: Actor[] = useMemo(() => everyone.flatMap(e => (e.home ? [{ uid: e.id, char: e.char, x: e.home.x, y: e.home.y + FEET, ideas: e.p.ideas.length }] : [])), [everyone]);
  const photo = useMemo(() => new Map(members.map(m => [m.uid, m.photoURL])), [members]);
  const nameOf = (n: number, id: string, fallback: string) => (n === home ? members.find(m => m.uid === id)?.displayName : "") || fallback;
  const totalIdeas = islands.reduce((a, i) => a + i.ideas.length, 0);
  const select = (id: string) => { setFocus(f => (f === id ? null : id)); setPanel(true); };
  // AI 분석용 CSV — 보이는 섬(가려진 섬 제외)의 학생을 처음 쓴 순서대로
  const [csvMenu, setCsvMenu] = useState(false);
  const exportCsv = (mode: ExportMode) => {
    setCsvMenu(false);
    downloadBrainstormCsv(topic, isles.filter(I => !I.hidden).map(I => ({
      name: I.name || "우리 반",
      students: I.people.map((p, k) => ({ name: nameOf(I.n, p.uid, p.name), ideas: p.ideas, share: I.map.cells.length ? I.map.area[k] / I.map.cells.length : 0 })),
    })), mode);
  };
  // 휴대폰 참여자: 내 땅이 처음 생기면 그 자리로 확대해 보여 준다(한 번만)
  const myPos = startOnMe ? everyone.find(e => e.id === `${home}:${uid}`)?.home : null;
  const [centered, setCentered] = useState(false);
  if (myPos && !centered) {
    setCentered(true);
    const s = Math.min(zoomMax, 2.4);
    setView(clampView({ s, x: myPos.x - WW / s / 2, y: myPos.y - WH / s / 2 }));
  }

  const worldStyle = { transform: `scale(${view.s}) translate(${(-view.x / WW) * 100}%, ${(-view.y / WH) * 100}%)`, "--zoom": view.s } as CSSProperties;
  // 말풍선 겹침 풀기 — 화면에 그려진 뒤 실제 크기를 재서 서로 비키게 한다(리액트 상태 없이 스타일만 바꿈)
  const [resizeTick, setResizeTick] = useState(0);
  // 확대·이동 중에는 매 프레임 재지 않고, 멈춘 뒤(0.15초) 한 번만 다시 비킨다
  const [settledView, setSettledView] = useState(view);
  useEffect(() => { const t = setTimeout(() => setSettledView(view), 150); return () => clearTimeout(t); }, [view]);
  // 시계는 매초 가지만 말풍선 모양이 바뀌는 때는 '방금 쓴' 친구가 바뀔 때뿐(하나씩 보기는 돌아가니 매번)
  const bubbleTick = bubbleAll ? everyone.filter(e => { const l = e.p.ideas[e.p.ideas.length - 1]; return now > 0 && now - l.at < FRESH_MS; }).map(e => e.id).join() : String(now);
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
      // 3단계(수십 명이 한 판에): 방금 쓴·내·고른 친구 말풍선만 — 확대하면 다시 보인다
      if (crowd() > 0.34) board.dataset.compact = "3";
    }
    const shown = wraps.filter(w => w.getBoundingClientRect().width > 0);
    const rects = shown.map(w => w.getBoundingClientRect());
    const shifts = spreadBubbles(rects.map(r => ({ x: r.left, y: r.top, w: r.width, h: r.height })), { x: area.left + 4, y: area.top + 4, w: area.width - 8, h: area.height - 8 });
    shifts.forEach((d, i) => {
      const w = shown[i];
      w.style.setProperty("--bx", `${d.dx}px`); w.style.setProperty("--by", `${d.dy}px`);
      const len = Math.hypot(d.dx, d.dy);
      if (len > 14) { w.dataset.far = ""; w.style.setProperty("--ll", `${len}px`); w.style.setProperty("--la", `${Math.atan2(-d.dy, -d.dx)}rad`); }
    });
  }, [everyone, settledView, bubbleAll, opened, showNames, live3d, panel, bubbleTick, resizeTick]);

  // 쓰기 칸은 언제나 우리 반 섬에 쓴다(다른 반 섬만 보고 있어도). 내 색 = 우리 섬에서 처음 쓴 순서
  const myIsle = homeIsland;
  const myK = useMemo(() => (myIsle ? [...new Set(myIsle.ideas.map(i => i.uid))].indexOf(uid) : -1), [myIsle, uid]);
  // 섬·잉크 SVG(필터가 많아 비싸다)는 땅이 바뀔 때만 다시 만든다 — 매초 시계·말풍선 갱신 때는 그대로
  const mapSvg = useMemo(() => (
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
              {/* 솟은 땅의 옆면 — 잉크를 어둡게 해서 아래로 여러 번 겹쳐 찍는다(높이마다 하나) */}
              {Array.from({ length: LIFT_MAX / 2 }, (_, j) => (j + 1) * 2).map(L => <filter key={L} id={`bs-lift-${L}`} x="-10%" y="-50%" width="120%" height="200%">
                <feComponentTransfer in="SourceGraphic" result="dark">
                  <feFuncR type="linear" slope="0.62" /><feFuncG type="linear" slope="0.62" /><feFuncB type="linear" slope="0.62" />
                </feComponentTransfer>
                {Array.from({ length: L / 2 }, (_, j) => <feOffset key={j} in="dark" dy={L - j * 2} result={`o${j}`} />)}
                <feMerge>{Array.from({ length: L / 2 }, (_, j) => <feMergeNode key={j} in={`o${j}`} />)}<feMergeNode in="SourceGraphic" /></feMerge>
              </filter>)}
              {/* 맞닿은 두 친구 땅 사이 — 가운데는 섞은 색, 가장자리로 갈수록 투명(흐림 필터보다 훨씬 가볍다). 색 쌍마다 하나 */}
              {mixPairs.map(([a, b]) => <radialGradient key={`${a}-${b}`} id={`bs-mix-${a}-${b}`}>
                <stop offset="0%" stopColor={mixColor(INK_COLORS[a], INK_COLORS[b])} stopOpacity={0.95} />
                <stop offset="55%" stopColor={mixColor(INK_COLORS[a], INK_COLORS[b])} stopOpacity={0.7} />
                <stop offset="100%" stopColor={mixColor(INK_COLORS[a], INK_COLORS[b])} stopOpacity={0} />
              </radialGradient>)}
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
              {/* 학생마다 따로 테두리 + 아이디어 수만큼 솟은 언덕 */}
              {I.order.map(k => {
                const p = I.people[k];
                const cells = I.map.cells.filter(c => I.map.owner.get(c.i) === k);
                const id = `${I.n}:${p.uid}`; const L = I.lifts[k];
                // 옆면은 잉크만으로 만들고(줄무늬 없이) 테두리는 솟은 덩어리 전체에 한 번만
                return <g key={p.uid} transform={`translate(0 ${-L})`} filter="url(#bs-edge-thin)" opacity={focus && focus !== id ? 0.35 : 1}>
                  <g filter={L ? `url(#bs-lift-${L})` : undefined}>
                    <g filter="url(#bs-goo)" fill={inkColor(k)}>
                      {cells.map(c => <circle key={c.i} cx={c.x} cy={c.y} r={CELL_R * 1.08} className={styles.ink} style={{ transformOrigin: `${c.x}px ${c.y}px` }} />)}
                    </g>
                  </g>
                </g>;
              })}
              {/* 친구 땅끼리 맞닿은 곳은 두 색이 섞여 번진다(높이는 둘의 중간) */}
              {!focus && I.seams.length > 0 && <g>
                {I.seams.map(m => <circle key={`${m.x},${m.y}`} cx={m.x} cy={m.y - (I.lifts[m.a] + I.lifts[m.b]) / 2} r={CELL_R * 1.15} fill={`url(#bs-mix-${pairKey(m.a, m.b)})`} />)}
              </g>}
              {/* 아직 공개되지 않은 다른 반 섬 — 구름에 가려 둔다 */}
              {I.hidden && <g>
                <rect width={VIEW_W} height={VIEW_H} fill="#f3f6ff" opacity={0.78} mask={`url(#bs-island-${I.n})`} />
                {[[0.3, 0.38], [0.62, 0.3], [0.45, 0.62], [0.74, 0.62]].map(([fx, fy], j) => <g key={j} transform={`translate(${VIEW_W * fx} ${VIEW_H * fy})`} fill="#fff" opacity={0.95}>
                  <circle r={VIEW_H * 0.09} /><circle cx={VIEW_H * 0.1} cy={VIEW_H * 0.02} r={VIEW_H * 0.07} /><circle cx={-VIEW_H * 0.1} cy={VIEW_H * 0.03} r={VIEW_H * 0.065} />
                </g>)}
              </g>}
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
  ), [isles, focus, multi, mixPairs, WW, WH, VIEW_W, VIEW_H]);
  // 캐릭터·말풍선 층 — 확대·이동(view)과 무관하니 그때는 다시 만들지 않는다. 시계(now)는 '방금 쓴' 친구가 바뀔 때만 반영(bubbleTick)
  const playersLayer = useMemo(() => (
    everyone.map(({ id, k, p, I, char, color, home: pos }) => {
            if (!pos) return null;
            const latest = p.ideas[p.ideas.length - 1];
            const fresh = now > 0 && now - latest.at < FRESH_MS;
            const n = p.ideas.length;
            const open = opened.has(id);
            // 모두: 3개까지는 전부, 더 많으면 최근 2개 + "N개 더 보기"(누르면 펼침) / 하나씩: 새 아이디어 먼저, 아니면 엇갈리게 돌아가며
            const mine = I.n === home && p.uid === uid;
            // 선생님이 응답을 가리면: 학생 화면에서 다른 친구 말풍선은 글 없이 개수만
            const veiled = !!hideIdeas && !teacher && !mine;
            const collapsible = !veiled && bubbleAll && n > COLLAPSE_AT;
            const shown = fresh ? latest : p.ideas[Math.floor((now + k * 1700) / BUBBLE_MS) % n];
            const lines = !bubbleAll ? [shown] : collapsible && !open ? p.ideas.slice(-PEEK) : p.ideas;
            const more = n - lines.length;
            const in3d = live3d.has(id);
            const left = (pos.x / WW) * 100; const top = ((pos.y + (in3d ? FEET : 0)) / WH) * 100;
            const name = nameOf(I.n, p.uid, p.name);
            return <div key={id} className={`${styles.player} ${in3d ? styles.player3d : ""} ${fresh ? styles.fresh : ""} ${mine ? styles.me : ""} ${focus === id ? styles.focused : ""} ${open ? styles.opened : ""}`}
              style={{ left: `${left}%`, top: `${top}%`, "--ink": color, "--delay": `${-(k * 0.37) % 3}s`, zIndex: open ? 350 : focus === id ? 300 : fresh ? 200 : Math.round(top) } as CSSProperties}>
              {/* 겹침 풀기로 옮겨지는 껍데기 — 많이 비켜나면 캐릭터까지 가는 선(leader)이 생긴다 */}
              <span className={styles.bubbleWrap} data-bubble="" data-open={open ? "" : undefined}>
                <span className={styles.leader} aria-hidden="true" />
                <button type="button" className={`${styles.bubble} ${bubbleAll && (lines.length > 1 || more > 0) ? styles.bubbleList : ""}`} key={bubbleAll ? "all" : shown.id}
                  onClick={() => (collapsible ? toggleOpen(id) : select(id))} aria-expanded={collapsible ? open : undefined}
                  aria-label={collapsible ? `${showNames ? name : "친구"}의 아이디어 ${n}개 ${open ? "접기" : "모두 보기"}` : undefined}>
                  <span className={styles.lines} data-scroll={open ? "" : undefined}>
                    {veiled ? <span className={`${styles.bubbleText} ${styles.veiled}`}><Icon name="visibility_off" size={14} />아이디어 {n}개</span>
                      : lines.map(i => <span key={i.id} className={`${styles.bubbleText} ${bubbleAll && fresh && i.id === latest.id ? styles.newLine : ""}`}>{i.text}</span>)}
                  </span>
                  {collapsible && <small className={styles.more}>{open ? <><Icon name="expand_less" size={14} />접기</> : <><Icon name="expand_more" size={14} />{more}개 더 보기</>}</small>}
                  {n > 1 && !veiled && <em>{n}</em>}
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
          })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [everyone, bubbleTick, opened, focus, showNames, live3d, bubbleAll, hideIdeas, teacher, home, uid, members, photo, WW, WH, store]);

  // 섬 그림 굽기 — 필터(번짐·테두리·언덕)가 많은 SVG 를 확대·이동할 때마다 다시 그리면 무겁다.
  // 땅이 바뀌거나 확대 단계(1·2·4배)가 바뀔 때만 캔버스에 한 장으로 구워 두고, 확대·이동은 그 그림을 늘이기만 한다.
  const svgHostRef = useRef<HTMLDivElement>(null);
  const bakeRef = useRef<HTMLCanvasElement>(null);
  const [baked, setBaked] = useState(false);
  const bakeScale = settledView.s > 2.2 ? 4 : settledView.s > 1.1 ? 2 : 1;
  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => {
      const svg = svgHostRef.current?.querySelector("svg"); const cv = bakeRef.current; const board = boardRef.current;
      if (!svg || !cv || !board || !board.clientWidth) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      let w = board.clientWidth * dpr * bakeScale; let h = (w * WH) / WW;
      // 캔버스 한계(브라우저마다 다름) 안으로: 한 변 8192, 넓이 1600만 화소
      const k = Math.min(1, 8192 / w, 8192 / h, Math.sqrt(16e6 / (w * h))); w = Math.round(w * k); h = Math.round(h * k);
      const copy = svg.cloneNode(true) as SVGSVGElement;
      copy.setAttribute("width", String(w)); copy.setAttribute("height", String(h));
      copy.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(copy)], { type: "image/svg+xml" }));
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url); if (!alive) return;
        cv.width = w; cv.height = h;
        const ctx = cv.getContext("2d"); if (!ctx) return;
        ctx.drawImage(img, 0, 0, w, h); setBaked(true);
      };
      img.onerror = () => { URL.revokeObjectURL(url); if (alive) setBaked(false); };
      img.src = url;
    }, 80);
    return () => { alive = false; clearTimeout(t); };
  }, [mapSvg, bakeScale, resizeTick, WW, WH]);

  return <main className={styles.page}>
    <header className={styles.top}>
      <div className={styles.topic}>
        <span className={styles.kicker}><Icon name="tips_and_updates" size={16} />{kicker}{linked ? ` · ${linkedCount}개 반이 함께` : ""}</span>
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
        {extraTools}
        {onHide && <button type="button" className={styles.chip} aria-pressed={!!hideIdeas} onClick={() => onHide(!hideIdeas)}>
          <Icon name={hideIdeas ? "speaker_notes_off" : "speaker_notes"} size={18} />{hideIdeas ? "응답 가림" : "응답 보임"}
        </button>}
        {linked && onShare && <button type="button" className={styles.chip} aria-pressed={!!shared} onClick={() => onShare(!shared)}>
          <Icon name={shared ? "visibility" : "visibility_off"} size={18} />{shared ? "다른 반 섬 보임" : "다른 반 섬 가림"}
        </button>}
        {teacher && totalIdeas > 0 && <span className={styles.menuWrap}>
          <button type="button" className={styles.chip} aria-expanded={csvMenu} onClick={() => setCsvMenu(v => !v)}><Icon name="download" size={18} />CSV</button>
          {csvMenu && <span className={styles.menu} role="menu">
            <button type="button" role="menuitem" onClick={() => exportCsv("student")}><Icon name="person" size={18} /><span><b>학생별</b>한 줄에 한 학생 · 아이디어 목록</span></button>
            <button type="button" role="menuitem" onClick={() => exportCsv("idea")}><Icon name="lightbulb" size={18} /><span><b>아이디어별</b>한 줄에 한 아이디어 · 묶기·분류용</span></button>
          </span>}
        </span>}
        {canLink && <button type="button" className={styles.chip} onClick={() => setLinking(true)}><Icon name="travel_explore" size={18} />{linked ? "반 섬 관리" : "다른 반과 섬 잇기"}</button>}
        <button type="button" className={styles.chip} onClick={() => { if (document.fullscreenElement) void document.exitFullscreen(); else void document.documentElement.requestFullscreen?.().catch(() => {}); }} aria-label="전체 화면"><Icon name="fullscreen" size={18} /></button>
      </div>
    </header>
    {error && <p role="alert" className={styles.error}>{error}</p>}

    <div className={`${styles.body} ${panel ? styles.withPanel : ""}`}>
      <section ref={seaRef} className={styles.sea} aria-label="아이디어 땅따먹기 판">
        <div ref={boardRef} className={`${styles.board} ${view.s > 1 ? styles.zoomed : ""}`} data-calm={everyone.length > CALM_AT ? "" : undefined}
          style={{ aspectRatio: `${WW} / ${WH}`, width: `min(100%, calc((100dvh - 230px) * ${(WW / WH).toFixed(3)}))`, maxWidth: multi ? "none" : 1500, "--char-h": `${(CHAR_H / WW) * 100}cqw` } as CSSProperties}>
          {/* 층: 섬·잉크(SVG) → 3D 캐릭터(WebGL) → 말풍선·이름(HTML). 섬과 말풍선은 같은 변환으로 확대·이동하고, 3D 는 카메라를 맞춘다 */}
          <div className={styles.world} style={worldStyle}>
            {/* 실제 SVG 는 숨겨 두고(그리지 않음) 구운 그림만 보인다 — 굽기 전·실패하면 SVG 를 그대로 */}
            <div ref={svgHostRef} className={styles.mapHost} style={{ visibility: baked ? "hidden" : "visible" }}>{mapSvg}</div>
            <canvas ref={bakeRef} className={styles.mapHost} aria-hidden="true" />
          </div>
          {!no3d && <CharacterLayer actors={actors} viewW={WW} viewH={WH} charH={CHAR_H} view={view} onLoaded={onLoaded} onFail={onFail} frameRef={seaRef} />}
          <div className={styles.world} style={worldStyle}>
          {/* 섬마다 반 이름표 — 누르면 그 섬으로 */}
          {multi && isles.map(I => <div key={I.key} className={styles.isleTag} style={{ left: `${((I.off.x + VIEW_W / 2) / WW) * 100}%`, top: `${((I.off.y - LABEL_H * 0.45) / WH) * 100}%` }}>
            <button type="button" className={`${styles.isleBtn} ${I.n === home ? styles.isleHome : ""}`} onClick={() => (onIsle ? onIsle(I.n) : setView(islandView(I.n)))} aria-label={`${I.name || "반"} 섬만 크게 보기`}>
              <Icon name={I.hidden ? "lock" : "flag"} size={16} fill />{I.name || "반"}<span>{I.hidden ? "선생님이 열면 보여요" : `${I.people.length}명 · ${I.ideas.length}개`}</span>{I.n === home && <em>우리 반</em>}
            </button>
          </div>)}
          {playersLayer}
          </div>
          {!everyone.length && <div className={styles.empty}><Icon name="water_drop" size={32} /><strong>첫 아이디어를 기다리는 중</strong><span>아이디어를 쓰면 내 색 잉크가 섬에 퍼져요!</span></div>}
        </div>
        {isleTabs}
        {overlay}
        <div className={styles.zoomBar} data-nopan="" role="group" aria-label="판 확대·축소">
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
        {isles.filter(I => !I.hidden).sort((a, b) => (a.n === home ? -1 : b.n === home ? 1 : a.n - b.n)).map(I => {
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
                {(focus === p.id || ranking.length <= 6) && !(hideIdeas && !teacher && !(I.n === home && p.uid === uid)) && <ul className={styles.ideaList}>
                  {p.ideas.map(idea => <li key={idea.id}><span>{idea.text}</span>
                    {(teacher || (I.n === home && idea.uid === uid)) && <button type="button" onClick={() => void store.remove(I, idea.id)} aria-label="아이디어 지우기"><Icon name="delete" size={16} /></button>}
                  </li>)}
                </ul>}
              </li>)}
            </ol>}
          </section>;
        })}
      </aside>}
    </div>

    {/* 선생님도 써 볼 수 있다(테스트·예시 아이디어) — 선생님 글도 판에 똑같이 칠해진다. 쓰는 곳은 언제나 우리 반 섬 */}
    {myIsle && composer && (closedNote ? <p className={styles.closedNote}><Icon name="lock" size={18} />{closedNote}</p>
      : <Composer teacher={teacher} island={myIsle} store={store} uid={uid} name={myName} mine={myIsle.ideas.filter(i => i.uid === uid)} color={inkColor(Math.max(0, myK))} joined={myK >= 0} />)}
    {linking && myIsle && <LinkIslandsDialog cid={myIsle.cid} lid={myIsle.lid} question={question as Question} onClose={() => setLinking(false)} />}
  </main>;
}

/** 학생 아이디어 쓰기 칸 — 판 아래에 붙어 있다. */
function Composer({ teacher, island, store, uid, name, mine, color, joined }: { teacher: boolean; island: IslandData; store: BoardStore; uid: string; name: string; mine: Idea[]; color: string; joined: boolean }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const full = mine.length >= IDEAS_PER_STUDENT;
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!text.trim() || busy || full) return;
    setBusy(true); setErr("");
    try { await store.add(island, uid, name, text); setText(""); }
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
      {mine.map(idea => <li key={idea.id}><span>{idea.text}</span><button type="button" onClick={() => void store.remove(island, idea.id)} aria-label="내 아이디어 지우기"><Icon name="close" size={14} /></button></li>)}
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
function usePanZoom(areaRef: React.RefObject<HTMLElement | null>, ref: React.RefObject<HTMLDivElement | null>, ww: number, wh: number, setView: (f: (v: BoardView) => BoardView) => void,
  zoomAt: (factor: number, fx?: number, fy?: number) => void, clampView: (v: BoardView) => BoardView) {
  useEffect(() => {
    const el = ref.current; const area = areaRef.current; if (!el || !area) return;
    // 말풍선 목록 스크롤·판 위 버튼 묶음(확대 막대·반 탭·QR)에서는 판을 움직이지 않는다
    const inScroll = (t: EventTarget | null) => !!(t as HTMLElement | null)?.closest?.("[data-scroll],[data-nopan]");
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
      if (!area.hasPointerCapture(e.pointerId)) area.setPointerCapture(e.pointerId);
      setView(v => clampView({ s: v.s, x: v.x - (dx / r.width) * (ww / v.s), y: v.y - (dy / r.height) * (wh / v.s) }));
    };
    const up = (e: PointerEvent) => { pts.delete(e.pointerId); if (pts.size < 2) pinch = 0; };
    // 끌어서 옮긴 뒤 손을 뗄 때 캐릭터가 눌린 것으로 치지 않게
    const click = (e: MouseEvent) => { if (moved >= 6) { e.stopPropagation(); e.preventDefault(); moved = 0; } };
    area.addEventListener("wheel", onWheel, { passive: false });
    area.addEventListener("pointerdown", down); area.addEventListener("pointermove", move);
    area.addEventListener("pointerup", up); area.addEventListener("pointercancel", up);
    area.addEventListener("click", click, true);
    return () => {
      area.removeEventListener("wheel", onWheel); area.removeEventListener("pointerdown", down); area.removeEventListener("pointermove", move);
      area.removeEventListener("pointerup", up); area.removeEventListener("pointercancel", up); area.removeEventListener("click", click, true);
    };
  }, [areaRef, ref, ww, wh, setView, zoomAt, clampView]);
}
