"use client";

import {
  memo,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createPortal } from "react-dom";
import Lottie from "lottie-react";
import { useAuth } from "@/contexts/AuthContext";
import { GlassCard } from "@/components/Glass";
import { TopBar } from "@/components/TopBar";
import { Icon } from "@/components/Icon";
import { useDialog } from "@/components/Dialog";
import { CanvasIntro } from "@/components/CanvasIntro";
import {
  AttachmentField,
  AttachmentList,
  uploadImages,
} from "@/components/AttachmentField";
import type { Attachment } from "@/lib/lessons";
import { getMyRole, watchMembers, type Role } from "@/lib/classes";
import { listGroups, type Group } from "@/lib/groups";
import {
  actorOf,
  addComment,
  addNodeAttachments,
  CANVAS_SCHEMA,
  createEdge,
  createNode,
  deleteEdgeDoc,
  deleteFeedback,
  deleteNodeAndRefs,
  deleteNodesOnPage,
  ensureCanvas,
  migrateCanvasToV2,
  patchEdge,
  patchNode,
  REACTIONS,
  removeNodeAttachment,
  saveCanvasMeta,
  setBoardLayoutMode,
  toggleReaction,
  watchCanvasMeta,
  watchEdges,
  watchFeedback,
  watchNodes,
  type CanvasMeta,
  type CanvasPage,
  type CardEdge,
  type CardNode,
  type Feedback,
  type NodeChange,
  type ReactionType,
} from "@/lib/canvas";
import { deleteAttachment } from "@/lib/upload";
import {
  listQuestions,
  setQuestionSubmissionFor,
  type Question,
} from "@/lib/lessons";

// 작성자별 고유 색상 (uid 해시 → 팔레트)
const AUTHOR_COLORS = [
  "#4f7cff",
  "#23b27a",
  "#ef4444",
  "#f5a623",
  "#a66bff",
  "#ff6f91",
  "#0ea5e9",
  "#14b8a6",
];
function authorColor(uid: string): string {
  let h = 0;
  for (let i = 0; i < uid.length; i++) h = (h * 31 + uid.charCodeAt(i)) >>> 0;
  return AUTHOR_COLORS[h % AUTHOR_COLORS.length];
}
// 상대 시간 표시
function relTime(ms: number | null): string {
  if (!ms) return "방금";
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return "방금";
  if (s < 3600) return `${Math.floor(s / 60)}분 전`;
  if (s < 86400) return `${Math.floor(s / 3600)}시간 전`;
  const d = new Date(ms);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// 페이지 탭 색상/패턴
const PAGE_COLORS = [
  "#4f7cff",
  "#23b27a",
  "#ef4444",
  "#f5a623",
  "#a66bff",
  "#ff6f91",
  "#0ea5e9",
  "#14b8a6",
  "#64748b",
];

// 학생 구분용 카드 색 팔레트 (스펙트럼 + 톤 다양화)
const CARD_COLORS = [
  "#ef4444", // 빨강
  "#fb7185", // 산호
  "#f97316", // 주황
  "#f59e0b", // 호박
  "#fbbf24", // 노랑
  "#a3e635", // 라임
  "#22c55e", // 초록
  "#10b981", // 에메랄드
  "#14b8a6", // 청록
  "#06b6d4", // 시안
  "#0ea5e9", // 하늘
  "#3b82f6", // 파랑
  "#6366f1", // 인디고
  "#8b5cf6", // 보라
  "#d946ef", // 자홍
  "#ec4899", // 분홍
  "#f43f5e", // 로즈
  "#78716c", // 토프
];

function hexToRgb(h: string): [number, number, number] {
  const s = h.replace("#", "");
  return [
    parseInt(s.slice(0, 2), 16),
    parseInt(s.slice(2, 4), 16),
    parseInt(s.slice(4, 6), 16),
  ];
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0,
    g = 0,
    b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const to = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

// 여러 색을 "색상환(hue)" 기준으로 혼합 — 채도·명도를 선명하게 유지해
// 색이 많아져도 어두워지지 않고 생생한 새 색이 된다. (빨강+파랑=선명한 보라)
function blendColors(colors: string[]): string {
  if (colors.length === 0) return "#94a3b8";
  if (colors.length === 1) return colors[0];
  let sx = 0,
    sy = 0,
    sSat = 0,
    sLight = 0;
  for (const c of colors) {
    const [r, g, b] = hexToRgb(c);
    const [h, s, l] = rgbToHsl(r, g, b);
    const rad = (h * Math.PI) / 180;
    // 채도 가중(회색에 가까운 색이 색조를 흔들지 않게)
    const w = 0.25 + s;
    sx += Math.cos(rad) * w;
    sy += Math.sin(rad) * w;
    sSat += s;
    sLight += l;
  }
  const n = colors.length;
  let h = (Math.atan2(sy, sx) * 180) / Math.PI;
  if (h < 0) h += 360;
  const s = Math.min(0.85, Math.max(0.55, sSat / n)); // 채도 하한 → 칙칙함 방지
  const l = Math.min(0.62, Math.max(0.48, sLight / n)); // 명도 범위 → 어두워짐 방지
  return hslToHex(h, s, l);
}

// 색을 화사하게(채도·명도 올림) — 무지개 그라데이션 스톱용
function vivid(color: string): string {
  const [r, g, b] = hexToRgb(color);
  const [h] = rgbToHsl(r, g, b);
  return hslToHex(h, 0.82, 0.56);
}

// 여러 색 → 화사한 그라데이션 (색조 순 정렬, 섞일수록 무지개처럼)
function gradientFrom(colors: string[]): string {
  const stops = colors.map(vivid);
  if (stops.length === 1) return stops[0];
  return `linear-gradient(135deg, ${stops.join(", ")})`;
}

export type TeamColor = { solid: string; gradient: string | null };

// 카드별 피드백 집계 항목 — 반응(reactions) 신원 안정화(구조적 공유)에 사용
type FbEntry = {
  comments: number;
  reactions: Record<string, { count: number; mine: boolean }>;
};
// 두 집계 항목이 값(댓글수/반응 카운트/내반응 여부)까지 동일한지
function sameFbEntry(a: FbEntry, b: FbEntry): boolean {
  if (a.comments !== b.comments) return false;
  const ak = Object.keys(a.reactions);
  const bk = Object.keys(b.reactions);
  if (ak.length !== bk.length) return false;
  for (const k of ak) {
    const ra = a.reactions[k];
    const rb = b.reactions[k];
    if (!rb || ra.count !== rb.count || ra.mine !== rb.mine) return false;
  }
  return true;
}

// 규칙형(grid) 반응형 메이슨리 상수 — 균일 열너비/간격/상단 여백(월드 좌표)
const GRID_COL_W = 240;
const GRID_GAP = 20;
const GRID_TOP_PAD = 24;
// 뷰포트 컬링(가상화) 여백(월드 단위) — 화면 밖 이 거리까지는 미리 렌더해 팬 시 늦은 팝인 방지
const CULL_MARGIN = 600;

// CardView 에 내려가는 안정 콜백 묶음(카드 id 를 인자로 받아 신원을 고정)
type CardHandlers = {
  onCardDown: (e: React.PointerEvent, id: string) => void;
  onChangeText: (id: string, t: string) => void;
  onAddAttachments: (id: string, atts: Attachment[]) => void;
  onRemoveAttachment: (id: string, att: Attachment) => void;
  onChangeColor: (id: string, color: string | null) => void;
  onResize: (id: string, h: number) => void;
  onDelete: (id: string) => void;
  onToggleReaction: (id: string, type: ReactionType) => void;
  onOpenComments: (id: string, rect: DOMRect) => void;
  onToggleCheck: (id: string) => void;
  onSendToMap: (id: string) => void;
  onFocusText: (id: string) => void;
  onBlurText: (id: string) => void;
  onRecordingChange: (id: string, rec: boolean) => void;
};
const PAGE_PATTERNS: { id: string; label: string }[] = [
  { id: "none", label: "없음" },
  { id: "dots", label: "점" },
  { id: "stripes", label: "줄무늬" },
  { id: "grid", label: "격자" },
  { id: "checker", label: "체커" },
];
// 패턴 → CSS background-image (흰색 반투명 오버레이)
function patternCss(pattern?: string | null): React.CSSProperties {
  switch (pattern) {
    case "dots":
      return {
        backgroundImage:
          "radial-gradient(rgba(255,255,255,.55) 1.5px, transparent 1.6px)",
        backgroundSize: "8px 8px",
      };
    case "stripes":
      return {
        backgroundImage:
          "repeating-linear-gradient(45deg, rgba(255,255,255,.28) 0 4px, transparent 4px 8px)",
      };
    case "grid":
      return {
        backgroundImage:
          "linear-gradient(rgba(255,255,255,.4) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.4) 1px, transparent 1px)",
        backgroundSize: "9px 9px",
      };
    case "checker":
      return {
        backgroundImage:
          "repeating-conic-gradient(rgba(255,255,255,.28) 0% 25%, transparent 0% 50%)",
        backgroundSize: "12px 12px",
      };
    default:
      return {};
  }
}
function pageTabStyle(
  color: string | null | undefined,
  pattern: string | null | undefined,
  active: boolean
): React.CSSProperties {
  const c = color || "#4f7cff";
  // 활성/비활성 모두 자기 색을 또렷이 — 비활성은 살짝 흐리게만
  // (background 축약형 대신 backgroundColor 사용 — patternCss의 backgroundImage와 충돌 방지)
  return {
    backgroundColor: c,
    color: "#fff",
    opacity: active ? 1 : 0.5,
    ...patternCss(pattern),
  };
}

/** URL 정규화(naver.com → https://) */
function normUrl(u: string) {
  const s = (u || "").trim();
  if (!s) return s;
  if (/^(https?:|mailto:|tel:)/i.test(s)) return s;
  return "https://" + s.replace(/^\/+/, "");
}
function newId() {
  return Math.random().toString(36).slice(2, 10);
}

// 작성자별 결정적 생성 오프셋 — 20명이 동시에 카드를 만들 때 같은 좌표 충돌을 줄인다.
function authorJitter(uid: string): { dx: number; dy: number } {
  let h = 0;
  for (let i = 0; i < uid.length; i++) h = (h * 31 + uid.charCodeAt(i)) >>> 0;
  return { dx: (h % 7) * 26 - 78, dy: ((h >> 3) % 7) * 26 - 78 };
}

// 두 사각형이 (여백 gap 포함) 겹치는지
function rectsOverlap(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
  gap = 18
) {
  return !(
    a.x + a.w + gap <= b.x ||
    b.x + b.w + gap <= a.x ||
    a.y + a.h + gap <= b.y ||
    b.y + b.h + gap <= a.y
  );
}

// 기존 카드와 겹치지 않는 빈 자리를 찾아 반환(선호 위치에서 바깥으로 나선 탐색).
// others: 같은 페이지의 카드들. 학생이 동시에 만들어도 서로 다른 칸에 놓이도록.
function findFreeSpot(
  others: { x: number; y: number; w: number; h: number }[],
  w: number,
  h: number,
  sx: number,
  sy: number
): { x: number; y: number } {
  const fits = (x: number, y: number) =>
    !others.some((n) =>
      rectsOverlap({ x, y, w, h }, { x: n.x, y: n.y, w: n.w, h: n.h || 120 })
    );
  if (fits(sx, sy)) return { x: sx, y: sy };
  const step = 36;
  for (let ring = 1; ring <= 240; ring++) {
    for (let dx = -ring; dx <= ring; dx++) {
      for (let dy = -ring; dy <= ring; dy++) {
        // 현재 링의 테두리만 검사
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        const x = sx + dx * step;
        const y = sy + dy * step;
        if (fits(x, y)) return { x, y };
      }
    }
  }
  return { x: sx, y: sy };
}

function CanvasInner() {
  const { user, profile, loading } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const dialog = useDialog();
  const cid = params.get("class");
  const lid = params.get("lesson"); // 차시 보드면 lid 존재
  const boardId = params.get("q") || "main"; // 활동 id = 보드 doc id
  const isLessonBoard = !!lid;

  const [role, setRole] = useState<Role | null>(null);
  // [v2] 부모 메타 + 카드별 문서(Map). 변경된 카드만 갱신해 렉/클로버를 없앤다.
  const [meta, setMeta] = useState<CanvasMeta | null>(null);
  const [subNodes, setSubNodes] = useState<Map<string, CardNode>>(new Map());
  const [subEdges, setSubEdges] = useState<CardEdge[]>([]);
  // 색 혼합 축하: 서로 다른 색 카드가 새로 연결되면 그 지점에서 폭발 연출
  const [burst, setBurst] = useState<{
    id: number;
    x: number;
    y: number;
    color: string;
  } | null>(null);
  const seenEdgesRef = useRef<Set<string> | null>(null);
  const burstClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [authorMap, setAuthorMap] = useState<
    Record<string, { name: string; photo: string }>
  >({});
  const [groups, setGroups] = useState<Group[]>([]);
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [commentPop, setCommentPop] = useState<{
    cardId: string;
    x: number;
    y: number;
  } | null>(null);
  const actor = actorOf(user, profile?.name, profile?.avatar);
  const isTeacher = role === "teacher";
  const groupParam = params.get("group") || "";

  const [activePage, setActivePage] = useState<string>("p1");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // 드래그 중인 카드 — 그 카드만 최상위 레이어로(움직이는 카드가 가려지지 않게)
  const [draggingId, setDraggingId] = useState<string | null>(null);
  // 페이지 버튼 꾹 누르면 뜨는 말풍선 메뉴(교사)
  const [pageMenu, setPageMenu] = useState<{
    id: string;
    x: number;
    top: number;
    bottom: number;
  } | null>(null);
  const pressTimer = useRef<NodeJS.Timeout | null>(null);
  const pressFired = useRef(false);

  // 뷰포트 (pan/zoom)
  const [view, setView] = useState({ scale: 1, tx: 0, ty: 0 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const panRef = useRef<{ x: number; y: number } | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);

  // ---------- 뷰포트 컬링(가상화) ----------
  // view(팬/줌)·스테이지 크기로 "보이는 월드 사각형(+여백)"을 구해 화면 밖 카드/엣지는
  // 렌더에서 제외한다. rAF 스로틀로 팬 매 프레임 재계산을 프레임당 1회로 합친다.
  const [cullRect, setCullRect] = useState<{
    l: number;
    t: number;
    r: number;
    b: number;
  } | null>(null);
  const cullRafRef = useRef<number | null>(null);
  const computeCullRect = useCallback(() => {
    const el = stageRef.current;
    if (!el) return;
    const sw = el.clientWidth;
    const sh = el.clientHeight;
    if (!sw || !sh) return;
    const v = viewRef.current;
    const l = (0 - v.tx) / v.scale - CULL_MARGIN;
    const t = (0 - v.ty) / v.scale - CULL_MARGIN;
    const r = (sw - v.tx) / v.scale + CULL_MARGIN;
    const b = (sh - v.ty) / v.scale + CULL_MARGIN;
    setCullRect((prev) =>
      prev && prev.l === l && prev.t === t && prev.r === r && prev.b === b
        ? prev
        : { l, t, r, b }
    );
  }, []);
  const scheduleCull = useCallback(() => {
    if (cullRafRef.current != null) return;
    cullRafRef.current = requestAnimationFrame(() => {
      cullRafRef.current = null;
      computeCullRect();
    });
  }, [computeCullRect]);
  // 팬/줌 등 view 변경(+마운트) 시 가시영역 갱신(rAF 스로틀)
  useEffect(() => {
    scheduleCull();
  }, [view, scheduleCull]);
  useEffect(
    () => () => {
      if (cullRafRef.current != null) cancelAnimationFrame(cullRafRef.current);
    },
    []
  );

  // 드래그 / 연결 모드
  const dragRef = useRef<{
    nid: string;
    ox: number;
    oy: number;
    lastX: number;
    lastY: number;
  } | null>(null);
  const [connectMode, setConnectMode] = useState(false);
  const [pendingFrom, setPendingFrom] = useState<string | null>(null);

  // 캔버스 진입 인트로(Paint Brush 모션) — 멤버 확인 후 1회 노출
  const [showIntro, setShowIntro] = useState(false);
  const introShownRef = useRef(false);
  useEffect(() => {
    if (introShownRef.current) return;
    if (!loading && (role === "teacher" || role === "student")) {
      introShownRef.current = true;
      setShowIntro(true);
    }
  }, [loading, role]);

  // 렌더 소스로 쓰는 "유효 카드" Map — 핸들러가 클로저 캡처 없이 최신값을 조회.
  const nodesRef = useRef<Map<string, CardNode>>(new Map());
  // 내가 지금 만지는(드래그/편집/녹음) 카드는 원격 스냅샷 적용을 막는다(shield).
  //  state 'active' = 진행 중, 'ack' = 끝났고 내 쓰기의 서버확정(snapshot) 대기.
  //  until = 비정상 종료 대비 안전망 TTL.
  const shieldRef = useRef<
    Map<string, { state: "active" | "ack"; until: number }>
  >(new Map());
  // 드래그 좌표 스로틀 기록(카드별 마지막 전송 시각/타이머)
  const dragSendRef = useRef<{
    timer: ReturnType<typeof setTimeout> | null;
    last: number;
  }>({ timer: null, last: 0 });
  // 텍스트 입력 디바운스(카드별)
  const textTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map()
  );
  const migratedOnceRef = useRef<string | null>(null);

  // ---------- 모둠별 보드 파생값 ----------
  // 차시 보드 활동(질문)에서 boardMode 를 읽어 모둠별 분리 여부 결정
  const activity = isLessonBoard
    ? questions.find((q) => q.id === boardId)
    : undefined;
  const isGroupBoard = isLessonBoard && activity?.boardMode === "group";
  const myGroup = groups.find((g) => g.memberUids.includes(user?.uid ?? ""));
  // 실제 저장 doc id — 모둠별이면 활동id__g_모둠id
  const effectiveBoardId =
    isGroupBoard && groupParam ? `${boardId}__g_${groupParam}` : boardId;
  // 모둠 보드인데 아직 모둠 미선택 → 보드 미표시(선택 화면)
  const groupBoardPending = isGroupBoard && !groupParam;
  // 편집 권한: 학급 캔버스=교사, 차시 공용 보드=멤버, 차시 모둠 보드=교사 또는 본인 모둠
  const canEdit = !isLessonBoard
    ? isTeacher
    : isTeacher
      ? true
      : isGroupBoard
        ? !!myGroup && groupParam === myGroup.id
        : !!role;

  // ---------- 유효 카드/연결 (서브컬렉션 우선, 마이그레이션 전엔 레거시 배열) ----------
  const migrated = !!meta && meta.schema >= CANVAS_SCHEMA;
  // 서브컬렉션 시드가 (충분히) 들어왔으면 schema 승격 전이라도 그걸 사용(부분 이전 방지).
  const useSub =
    migrated ||
    (!!meta && subNodes.size > 0 && subNodes.size >= meta.legacyNodes.length);
  const effNodesMap = useMemo(() => {
    if (useSub) return subNodes;
    const m = new Map<string, CardNode>();
    (meta?.legacyNodes ?? []).forEach((n) => m.set(n.id, n));
    return m;
  }, [useSub, subNodes, meta]);
  nodesRef.current = effNodesMap;
  const effEdges = useMemo(
    () => (useSub ? subEdges : meta?.legacyEdges ?? []),
    [useSub, subEdges, meta]
  );
  // 읽기 호환용 canvas 객체(메타 전용) — name/pages/groupColorMode 만 노출.
  // 카드/연결은 effNodesMap/effEdges 로 분리해 드래그 시 canvas 신원이 바뀌지 않게 한다.
  const canvas = useMemo(
    () =>
      meta
        ? {
            id: meta.id,
            name: meta.name,
            pages: meta.pages,
            groupColorMode: meta.groupColorMode,
            updatedAt: meta.updatedAt,
          }
        : null,
    [meta]
  );

  // ---------- 배치 모드(자유형/규칙형) ----------
  const layoutMode: "free" | "grid" = meta?.layoutMode ?? "free";
  const isGrid = layoutMode === "grid";
  const isGridRef = useRef(isGrid);
  isGridRef.current = isGrid;
  // 규칙형 메이슨리: 카드별 계산 위치(월드좌표) + 측정 높이(모든 뷰어가 자기 렌더 높이 기록)
  const [gridPos, setGridPos] = useState<Map<string, { x: number; y: number }>>(
    new Map()
  );
  const measuredHeightsRef = useRef<Map<string, number>>(new Map());
  const gridRafRef = useRef<number | null>(null);

  const setGroupParam = useCallback(
    (gid: string) => {
      const p = new URLSearchParams(params.toString());
      if (gid) p.set("group", gid);
      else p.delete("group");
      router.replace(`/canvas/?${p.toString()}`);
    },
    [params, router]
  );

  useEffect(() => {
    if (!loading && !user) router.replace("/");
  }, [user, loading, router]);

  // 학급/멤버/모둠/질문 (보드 doc 과 무관한 정보)
  useEffect(() => {
    if (!user || !cid) return;
    getMyRole(cid, user.uid).then(setRole);
    const offMembers = watchMembers(cid, (ms) => {
      const m: Record<string, { name: string; photo: string }> = {};
      ms.forEach((x) => (m[x.uid] = { name: x.displayName, photo: x.photoURL }));
      setAuthorMap(m);
    });
    listGroups(cid).then(setGroups).catch(() => {});
    if (lid) listQuestions(cid, lid).then(setQuestions).catch(() => {});
    return () => offMembers();
  }, [user, cid, lid]);

  // 학생은 본인 모둠 보드로 자동 진입(모둠 보드 모드)
  useEffect(() => {
    if (!isGroupBoard || isTeacher) return;
    if (myGroup && groupParam !== myGroup.id) setGroupParam(myGroup.id);
  }, [isGroupBoard, isTeacher, myGroup, groupParam, setGroupParam]);

  // 카드 스냅샷 변경 적용 — shield(내가 만지는 카드)는 원격 덮어쓰기를 막는다.
  const applyNodeChanges = useCallback((changes: NodeChange[]) => {
    setSubNodes((prev) => {
      let next: Map<string, CardNode> | null = null;
      const ensure = () => (next ??= new Map(prev));
      const now = Date.now();
      for (const ch of changes) {
        const id = ch.node.id;
        if (ch.type === "removed") {
          shieldRef.current.delete(id); // 삭제는 항상 이김
          if (prev.has(id)) ensure().delete(id);
          continue;
        }
        const sh = shieldRef.current.get(id);
        if (sh && sh.until > now) {
          // 'active' = 진행 중 → 원격/내 echo 모두 무시(로컬이 최신).
          // 'ack' = 내 마지막 쓰기의 서버확정 대기 → 미확정(pending)은 보류,
          //         서버확정 스냅샷이 오면 해제하고 그 값(서버 진실)으로 반영.
          if (sh.state === "active") continue;
          if (ch.hasPendingWrites) continue;
          shieldRef.current.delete(id);
        } else if (sh) {
          shieldRef.current.delete(id); // TTL 만료
        }
        ensure().set(id, ch.node);
      }
      return next ?? prev;
    });
  }, []);

  // 보드 구독 (effectiveBoardId 단위) — 메타 + 카드별 노드/엣지. 모둠 미선택이면 대기.
  useEffect(() => {
    if (!user || !cid || groupBoardPending) {
      setMeta(null);
      setSubNodes(new Map());
      setSubEdges([]);
      setFeedback([]);
      return;
    }
    const boardLid = lid ?? undefined;
    ensureCanvas(
      cid,
      effectiveBoardId,
      isLessonBoard ? "차시 보드" : "기본 캔버스",
      boardLid
    ).catch(() => {});
    // 보드 전환 시 이전 보드 카드 잔상/보호 비움
    setSubNodes(new Map());
    setSubEdges([]);
    shieldRef.current.clear();
    measuredHeightsRef.current.clear(); // 규칙형 측정 높이/배치 초기화
    setGridPos(new Map());

    const offMeta = watchCanvasMeta(cid, effectiveBoardId, setMeta, boardLid);
    const offNodes = watchNodes(cid, effectiveBoardId, applyNodeChanges, boardLid);
    const offEdges = watchEdges(cid, effectiveBoardId, setSubEdges, boardLid);
    const offFeedback = watchFeedback(
      cid,
      effectiveBoardId,
      setFeedback,
      boardLid
    );
    return () => {
      offMeta();
      offNodes();
      offEdges();
      offFeedback();
    };
  }, [
    user,
    cid,
    lid,
    effectiveBoardId,
    isLessonBoard,
    groupBoardPending,
    applyNodeChanges,
  ]);

  // 1회 마이그레이션 (레거시 단일 doc 배열 → 카드별 문서). 편집자면 시드,
  // schema 승격/배열 비움은 교사만. 학생 먼저 열어도 시드되어 렌더가 전환된다.
  useEffect(() => {
    if (!cid || !meta || !canEdit) return;
    if (meta.schema >= CANVAS_SCHEMA) return;
    const key = `${cid}/${effectiveBoardId}`;
    if (migratedOnceRef.current === key) return;
    migratedOnceRef.current = key;
    migrateCanvasToV2(
      cid,
      effectiveBoardId,
      meta,
      isTeacher,
      lid ?? undefined
    ).catch(() => {
      migratedOnceRef.current = null; // 실패 시 재시도 허용
    });
  }, [cid, meta, canEdit, isTeacher, effectiveBoardId, lid]);

  // 언마운트/보드 전환 시 진행 중 드래그의 마지막 좌표를 강제 flush (pointerup 누락 대비)
  useEffect(() => {
    return () => {
      const d = dragRef.current;
      const send = dragSendRef.current;
      if (send.timer) {
        clearTimeout(send.timer);
        send.timer = null;
      }
      if (d && cid)
        patchNode(
          cid,
          effectiveBoardId,
          d.nid,
          { x: d.lastX, y: d.lastY },
          lid ?? undefined
        ).catch(() => {});
      dragRef.current = null;
    };
  }, [cid, effectiveBoardId, lid]);

  // 연결 축하 버스트 표시 (2초 후 자동 사라짐)
  const showBurst = useCallback((x: number, y: number, color: string) => {
    const id = Date.now();
    setBurst({ id, x, y, color });
    if (burstClearRef.current) clearTimeout(burstClearRef.current);
    burstClearRef.current = setTimeout(
      () => setBurst((cur) => (cur?.id === id ? null : cur)),
      2000
    );
  }, []);

  // 보드 전환/마이그레이션 시: 기존 연결을 "새 연결"로 오인하지 않도록 추적 초기화
  useEffect(() => {
    seenEdgesRef.current = null;
  }, [effectiveBoardId, lid, useSub]);

  // 새로 추가된 연결을 감지해 혼합색 폭발 연출. 좌표는 발화 시점 nodesRef 에서 조회
  //  → 드래그(좌표 변경)로 재실행되지 않게 deps 는 edges 만.
  useEffect(() => {
    const edges = effEdges;
    if (seenEdgesRef.current === null) {
      // 첫 스냅샷의 기존 연결은 무시
      seenEdgesRef.current = new Set(edges.map((e) => e.id));
      return;
    }
    const seen = seenEdgesRef.current;
    const byId = nodesRef.current;
    let hit: { x: number; y: number; color: string } | null = null;
    for (const e of edges) {
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      const a = byId.get(e.from);
      const b = byId.get(e.to);
      if (!a || !b) continue; // 상대 노드 미도착 → 조용히 보류
      const cs = [a.color, b.color].filter((c): c is string => !!c);
      const color = cs.length ? blendColors(cs) : "#6d7cff";
      hit = {
        x: (a.x + a.w / 2 + (b.x + b.w / 2)) / 2,
        y: (a.y + a.h / 2 + (b.y + b.h / 2)) / 2,
        color,
      };
    }
    if (!hit) return;
    const h = hit;
    setTimeout(() => showBurst(h.x, h.y, h.color), 0);
  }, [effEdges, showBurst]);

  // 모둠 → 색상, uid → 모둠 색/이름
  const groupInfo = useMemo(() => {
    const m: Record<string, { color: string; name: string }> = {};
    groups.forEach((g, i) => {
      const color = g.color || PAGE_COLORS[i % PAGE_COLORS.length];
      g.memberUids.forEach((u) => (m[u] = { color, name: g.name }));
    });
    return m;
  }, [groups]);
  const groupColorMode = !!canvas?.groupColorMode;

  function toggleGroupColor() {
    if (!cid || !meta) return;
    const next = !meta.groupColorMode;
    setMeta((m) => (m ? { ...m, groupColorMode: next } : m));
    saveCanvasMeta(
      cid,
      effectiveBoardId,
      { groupColorMode: next },
      lid ?? undefined
    ).catch(() => {});
  }

  // 카드별 피드백 집계 — 값이 동일한 카드 항목은 이전 객체 신원을 재사용(구조적 공유)해
  // 한 카드의 반응/댓글 변경이 다른 카드 리렌더를 유발하지 않게 한다(reactions prop 신원 안정화).
  const prevFbRef = useRef<Map<string, FbEntry>>(new Map());
  const feedbackByCard = useMemo(() => {
    const m = new Map<string, FbEntry>();
    const ensure = (cardId: string) => {
      if (!m.has(cardId))
        m.set(cardId, { comments: 0, reactions: {} });
      return m.get(cardId)!;
    };
    for (const f of feedback) {
      const e = ensure(f.cardId);
      if (f.kind === "comment") e.comments++;
      else if (f.type) {
        const r = e.reactions[f.type] ?? { count: 0, mine: false };
        r.count++;
        if (f.uid === user?.uid) r.mine = true;
        e.reactions[f.type] = r;
      }
    }
    // 구조적 공유: 값이 변하지 않은 카드는 이전 항목(=이전 reactions 신원) 유지
    const prev = prevFbRef.current;
    for (const [id, entry] of m) {
      const old = prev.get(id);
      if (old && sameFbEntry(old, entry)) m.set(id, old);
    }
    prevFbRef.current = m;
    return m;
  }, [feedback, user]);

  // ---------- shield: 내가 만지는(드래그/편집/녹음) 카드를 원격 덮어쓰기에서 보호 ----------
  // active TTL 은 넉넉히(90s) — 녹음 상한 60초/느린 타이핑을 커버. 드래그·타이핑은
  // 매 입력마다 갱신되고, 녹음은 시작~종료(onstop) 동안 유지된다. ack 는 서버확정 대기용 짧게.
  const shieldActive = useCallback((id: string) => {
    shieldRef.current.set(id, { state: "active", until: Date.now() + 90000 });
  }, []);
  const shieldAck = useCallback((id: string) => {
    // 진행 종료 → 내 마지막 쓰기의 서버확정 스냅샷이 올 때까지만 보호
    shieldRef.current.set(id, { state: "ack", until: Date.now() + 10000 });
  }, []);

  // ---------- 메타(페이지/이름/모둠색) 부분 저장 ----------
  const saveMeta = useCallback(
    (patch: Partial<Pick<CanvasMeta, "name" | "pages" | "groupColorMode">>) => {
      if (!cid) return;
      setMeta((m) => (m ? { ...m, ...patch } : m));
      saveCanvasMeta(cid, effectiveBoardId, patch, lid ?? undefined).catch(
        () => {}
      );
    },
    [cid, effectiveBoardId, lid]
  );

  // ---------- 카드: 로컬 즉시 반영 + 카드별 문서 기록(granular) ----------
  const setLocalNode = useCallback((node: CardNode) => {
    setSubNodes((prev) => new Map(prev).set(node.id, node));
  }, []);
  const patchLocalNode = useCallback((id: string, patch: Partial<CardNode>) => {
    setSubNodes((prev) => {
      const cur = prev.get(id);
      if (!cur) return prev;
      return new Map(prev).set(id, { ...cur, ...patch });
    });
  }, []);
  const removeLocalNode = useCallback((id: string) => {
    setSubNodes((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }, []);
  const isMissing = (e: unknown) =>
    (e as { code?: string })?.code === "not-found" ||
    String((e as { message?: string })?.message ?? e).includes("No document");
  // 쓰기 실패 처리: 문서 없음→로컬 제거(부활 방지), 그 외(권한거부 등)→shield 해제해
  //   서버 진실로 재동기(무음 desync 방지)
  const onWriteError = useCallback(
    (id: string, e: unknown) => {
      if (isMissing(e)) removeLocalNode(id);
      else shieldRef.current.delete(id);
    },
    [removeLocalNode]
  );

  // 카드 생성
  const addNode = useCallback(
    (node: CardNode) => {
      if (!cid) return;
      setLocalNode(node);
      createNode(cid, effectiveBoardId, node, lid ?? undefined).catch(() => {});
    },
    [cid, effectiveBoardId, lid, setLocalNode]
  );
  // 카드 부분 수정(즉시) — 삭제된 카드면 로컬 제거(부활 방지)
  const commitNode = useCallback(
    (id: string, patch: Partial<CardNode>) => {
      if (!cid) return;
      patchLocalNode(id, patch);
      patchNode(cid, effectiveBoardId, id, patch, lid ?? undefined).catch((e) =>
        onWriteError(id, e)
      );
    },
    [cid, effectiveBoardId, lid, patchLocalNode, onWriteError]
  );
  // 텍스트 입력: 로컬 즉시 + 카드별 디바운스 기록. 입력 중엔 shield 갱신(보호 유지).
  const commitNodeText = useCallback(
    (id: string, text: string) => {
      patchLocalNode(id, { text });
      shieldActive(id);
      if (!cid) return;
      const timers = textTimersRef.current;
      const prev = timers.get(id);
      if (prev) clearTimeout(prev);
      timers.set(
        id,
        setTimeout(() => {
          timers.delete(id);
          patchNode(cid, effectiveBoardId, id, { text }, lid ?? undefined).catch(
            (e) => onWriteError(id, e)
          );
        }, 400)
      );
    },
    [cid, effectiveBoardId, lid, patchLocalNode, shieldActive, onWriteError]
  );
  // 첨부 추가(원자 arrayUnion). 카드 부재 시 방금 올린 파일 정리(고아 방지).
  const addAttachments = useCallback(
    (id: string, atts: Attachment[]) => {
      if (!cid || atts.length === 0) return;
      setSubNodes((prev) => {
        const cur = prev.get(id);
        if (!cur) return prev;
        return new Map(prev).set(id, {
          ...cur,
          attachments: [...(cur.attachments ?? []), ...atts],
        });
      });
      addNodeAttachments(cid, effectiveBoardId, id, atts, lid ?? undefined).catch(
        (e) => {
          if (isMissing(e)) {
            atts.forEach((a) => deleteAttachment(a).catch(() => {}));
            removeLocalNode(id);
          }
        }
      );
    },
    [cid, effectiveBoardId, lid, removeLocalNode]
  );
  // 첨부 삭제(원자 arrayRemove)
  const removeAttachment = useCallback(
    (id: string, att: Attachment) => {
      if (!cid) return;
      setSubNodes((prev) => {
        const cur = prev.get(id);
        if (!cur) return prev;
        return new Map(prev).set(id, {
          ...cur,
          attachments: (cur.attachments ?? []).filter((a) => a.id !== att.id),
        });
      });
      removeNodeAttachment(
        cid,
        effectiveBoardId,
        id,
        att,
        lid ?? undefined
      ).catch(() => {});
    },
    [cid, effectiveBoardId, lid]
  );
  // 카드 삭제(+참조 엣지/피드백 정리) — shield/타이머도 정리해 뒤늦은 쓰기 차단
  const removeNode = useCallback(
    (id: string) => {
      if (!cid) return;
      shieldRef.current.delete(id);
      const t = textTimersRef.current.get(id);
      if (t) {
        clearTimeout(t);
        textTimersRef.current.delete(id);
      }
      removeLocalNode(id);
      setSubEdges((prev) => prev.filter((e) => e.from !== id && e.to !== id));
      deleteNodeAndRefs(cid, effectiveBoardId, id, lid ?? undefined).catch(
        () => {}
      );
    },
    [cid, effectiveBoardId, lid, removeLocalNode]
  );

  // ---------- 연결(엣지): 로컬 즉시 + 카드별 문서 ----------
  const addEdge = useCallback(
    (edge: CardEdge) => {
      if (!cid) return;
      setSubEdges((prev) => [...prev, edge]);
      createEdge(cid, effectiveBoardId, edge, lid ?? undefined).catch(() => {});
    },
    [cid, effectiveBoardId, lid]
  );
  const commitEdge = useCallback(
    (id: string, patch: Partial<CardEdge>) => {
      if (!cid) return;
      setSubEdges((prev) =>
        prev.map((e) => (e.id === id ? { ...e, ...patch } : e))
      );
      patchEdge(cid, effectiveBoardId, id, patch, lid ?? undefined).catch(
        () => {}
      );
    },
    [cid, effectiveBoardId, lid]
  );
  const removeEdge = useCallback(
    (id: string) => {
      if (!cid) return;
      setSubEdges((prev) => prev.filter((e) => e.id !== id));
      deleteEdgeDoc(cid, effectiveBoardId, id, lid ?? undefined).catch(() => {});
    },
    [cid, effectiveBoardId, lid]
  );

  // 활성 페이지: canvas 로드 시 첫 페이지로 보정
  useEffect(() => {
    if (canvas && !canvas.pages.some((p) => p.id === activePage)) {
      setActivePage(canvas.pages[0]?.id ?? "p1");
    }
  }, [canvas, activePage]);

  const firstPageId = meta?.pages[0]?.id ?? "p1";
  const pageOf = useCallback(
    (pg?: string) => pg ?? firstPageId,
    [firstPageId]
  );
  const pageNodes = useMemo(
    () =>
      Array.from(effNodesMap.values()).filter(
        (n) => pageOf(n.page) === activePage
      ),
    [effNodesMap, activePage, pageOf]
  );
  const pageEdges = useMemo(() => {
    const ids = new Set(pageNodes.map((n) => n.id));
    return effEdges.filter((e) => ids.has(e.from) && ids.has(e.to));
  }, [effEdges, pageNodes]);

  // 팀 색 계산 입력은 "색/연결"뿐 — 좌표(드래그)로는 재계산하지 않도록 시그니처로 묶음.
  const pageNodesRef = useRef(pageNodes);
  pageNodesRef.current = pageNodes;
  const pageEdgesRef = useRef(pageEdges);
  pageEdgesRef.current = pageEdges;
  // pageNodes/pageEdges 신원이 바뀔 때만 재계산(팬/줌·피드백 등 무관 렌더에선 캐시 유지).
  const colorSig = useMemo(
    () => pageNodes.map((n) => `${n.id}:${n.color || ""}`).join("|"),
    [pageNodes]
  );
  const edgeSig = useMemo(
    () => pageEdges.map((e) => `${e.from}>${e.to}`).join("|"),
    [pageEdges]
  );

  // ---------- 가시 집합(뷰포트 컬링) ----------
  // 보이는 영역(+CULL_MARGIN) 밖 카드는 렌더 제외. 단 드래그 원본/편집·녹음 보호(shield)
  // 카드는 항상 유지(작업 유실·MediaRecorder 언마운트 방지). 규칙형은 메이슨리 측정을 위해
  // 아직 미배치·미측정 카드도 유지(측정 후엔 폴백 높이로 배치 정확도 보존).
  const visibleNodes = useMemo(() => {
    if (!cullRect) return pageNodes;
    const now = Date.now();
    const { l, t, r, b } = cullRect;
    const measured = measuredHeightsRef.current;
    const shields = shieldRef.current;
    return pageNodes.filter((n) => {
      if (n.id === draggingId) return true; // 드래그 원본
      const s = shields.get(n.id);
      if (s && s.until > now) return true; // 편집/녹음/포커스 보호 중
      if (isGrid) {
        const gp = gridPos.get(n.id);
        if (!gp) return true; // 아직 배치 전 → 렌더(측정 필요)
        const mh = measured.get(n.id);
        if (mh === undefined) return true; // 미측정 → 렌더(메이슨리 정확도)
        return !(gp.x > r || gp.x + GRID_COL_W < l || gp.y > b || gp.y + mh < t);
      }
      const h = measured.get(n.id) ?? n.h ?? 160;
      return !(n.x > r || n.x + n.w < l || n.y > b || n.y + h < t);
    });
  }, [pageNodes, cullRect, isGrid, gridPos, draggingId]);

  // 가시 엣지(자유형 전용) — 양 끝 카드 경계의 합집합이 뷰포트와 겹치면 표시(가로지르는 긴 선 포함).
  const visibleEdges = useMemo(() => {
    if (isGrid) return [] as CardEdge[];
    if (!cullRect) return pageEdges;
    const { l, t, r, b } = cullRect;
    const measured = measuredHeightsRef.current;
    return pageEdges.filter((e) => {
      const a = effNodesMap.get(e.from);
      const c = effNodesMap.get(e.to);
      if (!a || !c) return false;
      const ah = measured.get(a.id) ?? a.h ?? 160;
      const ch = measured.get(c.id) ?? c.h ?? 160;
      const minX = Math.min(a.x, c.x);
      const minY = Math.min(a.y, c.y);
      const maxX = Math.max(a.x + a.w, c.x + c.w);
      const maxY = Math.max(a.y + ah, c.y + ch);
      return !(minX > r || maxX < l || minY > b || maxY < t);
    });
  }, [isGrid, pageEdges, cullRect, effNodesMap]);

  // ---------- 규칙형(grid) 반응형 메이슨리 레이아웃 (클라이언트 계산, x/y 미저장) ----------
  // createdAt 오름차순으로 카드를 "가장 짧은 열"에 채워 넣는다. 위치는 월드좌표(gridPos).
  const recomputeGridLayout = useCallback(() => {
    const el = stageRef.current;
    if (!el) return;
    const scale = viewRef.current.scale || 1;
    const stageW = el.clientWidth;
    // 스테이지 가시 월드폭 기준 열 개수
    const C = Math.max(
      1,
      Math.floor((stageW / scale - GRID_GAP) / (GRID_COL_W + GRID_GAP))
    );
    const blockWidth = C * GRID_COL_W + (C - 1) * GRID_GAP;
    const blockStartX = -blockWidth / 2; // 월드 x=0 을 중심으로 블록 가로 중앙정렬
    const colH: number[] = new Array(C).fill(0);
    // 생성 순서(createdAt) — 아직 확정 전(로컬)이면 맨 뒤로, 동률은 id 로 안정 정렬
    const ordered = [...pageNodesRef.current].sort((a, b) => {
      const ca = a.createdAt ?? Number.MAX_SAFE_INTEGER;
      const cb = b.createdAt ?? Number.MAX_SAFE_INTEGER;
      if (ca !== cb) return ca - cb;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
    const pos = new Map<string, { x: number; y: number }>();
    for (const n of ordered) {
      let col = 0;
      for (let i = 1; i < C; i++) if (colH[i] < colH[col]) col = i;
      pos.set(n.id, {
        x: blockStartX + col * (GRID_COL_W + GRID_GAP),
        y: GRID_TOP_PAD + colH[col],
      });
      const h = measuredHeightsRef.current.get(n.id) ?? n.h ?? 160;
      colH[col] += h + GRID_GAP;
    }
    setGridPos(pos);
  }, []);
  // rAF 디바운스 — 높이 보고 폭주(이미지 로드 등)를 프레임당 1회로 합침. 자유형이면 무시.
  const scheduleRelayout = useCallback(() => {
    if (!isGridRef.current) return;
    if (gridRafRef.current != null) return;
    gridRafRef.current = requestAnimationFrame(() => {
      gridRafRef.current = null;
      recomputeGridLayout();
    });
  }, [recomputeGridLayout]);
  // 카드가 보고한 렌더 높이 기록(작성자 무관) → 변할 때만 재배치 예약
  const recordMeasuredHeight = useCallback(
    (id: string, h: number) => {
      const prev = measuredHeightsRef.current.get(id);
      if (prev !== undefined && Math.abs(prev - h) <= 1) return;
      measuredHeightsRef.current.set(id, h);
      scheduleRelayout();
    },
    [scheduleRelayout]
  );

  // 규칙형 진입 시: 줌 100%로, 격자 상단이 보이도록 뷰 이동(가로 중앙). 연결 모드 해제.
  // (초깃값 false → 최초로 grid 로 전환/로드될 때도 뷰 리셋이 반드시 1회 실행되게)
  const prevGridRef = useRef(false);
  useEffect(() => {
    const was = prevGridRef.current;
    prevGridRef.current = isGrid;
    if (isGrid && !was) {
      setConnectMode(false);
      setPendingFrom(null);
      const el = stageRef.current;
      const w = el ? el.clientWidth : 0;
      setView({ scale: 1, tx: Math.round(w / 2), ty: 0 });
      scheduleRelayout();
    }
  }, [isGrid, scheduleRelayout]);

  // 카드 추가/삭제·페이지 전환 시 재배치(텍스트 편집만으론 안 흔들리게 id 목록 시그니처 사용).
  // 높이 변화는 각 카드 ResizeObserver → recordMeasuredHeight 가 별도로 처리.
  const gridNodeSig = isGrid ? pageNodes.map((n) => n.id).join(",") : "";
  useEffect(() => {
    if (!isGrid) return;
    scheduleRelayout();
  }, [isGrid, gridNodeSig, activePage, scheduleRelayout]);

  // 스테이지 크기 변화(반응형) → 열 개수 재계산 + 가시영역 갱신. 자유형이면 scheduleRelayout 이 무시.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      scheduleRelayout();
      scheduleCull();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [scheduleRelayout, scheduleCull]);

  // 연결된 카드 = 하나의 팀. 팀 구성원의 색을 혼합한 "팀 색"을 모두에게 적용.
  // (혼자면 본인 색 그대로, 색 없는 카드가 팀에 끼면 팀 색을 함께 입음)
  const teamColorByNode = useMemo(() => {
    const pageNodes = pageNodesRef.current;
    const pageEdges = pageEdgesRef.current;
    const adj = new Map<string, string[]>();
    for (const e of pageEdges) {
      (adj.get(e.from) ?? adj.set(e.from, []).get(e.from)!).push(e.to);
      (adj.get(e.to) ?? adj.set(e.to, []).get(e.to)!).push(e.from);
    }
    const colorOf = new Map(pageNodes.map((n) => [n.id, n.color || null]));
    const seen = new Set<string>();
    const result = new Map<string, TeamColor>();
    for (const start of pageNodes) {
      if (seen.has(start.id)) continue;
      const comp: string[] = [];
      const stack = [start.id];
      seen.add(start.id);
      while (stack.length) {
        const cur = stack.pop()!;
        comp.push(cur);
        for (const nb of adj.get(cur) ?? []) {
          if (!seen.has(nb)) {
            seen.add(nb);
            stack.push(nb);
          }
        }
      }
      const colors = comp
        .map((id) => colorOf.get(id))
        .filter((c): c is string => !!c);
      if (colors.length === 0) continue;
      // 색조 순으로 정렬한 고유 색 → 섞일수록 무지개 그라데이션
      const distinct = Array.from(new Set(colors)).sort((p, q) => {
        const [hp] = rgbToHsl(...hexToRgb(p));
        const [hq] = rgbToHsl(...hexToRgb(q));
        return hp - hq;
      });
      const team: TeamColor = {
        solid: blendColors(colors),
        gradient: distinct.length >= 2 ? gradientFrom(distinct) : null,
      };
      for (const id of comp) result.set(id, team);
    }
    return result;
  }, [colorSig, edgeSig]);

  function addPage() {
    if (!meta) return;
    const id = "p" + Math.random().toString(36).slice(2, 7);
    saveMeta({
      pages: [
        ...meta.pages,
        {
          id,
          name: `${meta.pages.length + 1}페이지`,
          color: PAGE_COLORS[meta.pages.length % PAGE_COLORS.length],
          pattern: "none",
        },
      ],
    });
    setActivePage(id);
  }

  // ---------- 좌표 변환 (화면 → 월드) ----------
  function toWorld(clientX: number, clientY: number) {
    const el = stageRef.current;
    if (!el) return { x: 0, y: 0 };
    const r = el.getBoundingClientRect();
    const v = viewRef.current;
    return {
      x: (clientX - r.left - v.tx) / v.scale,
      y: (clientY - r.top - v.ty) / v.scale,
    };
  }

  // 카드(월드 좌표 사각형)를 화면 정중앙에 오도록 뷰 이동(줌 100% 초기화).
  function centerViewOn(x: number, y: number, w: number, h: number) {
    const el = stageRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const scale = 1;
    const cx = x + w / 2;
    const cy = y + h / 2;
    setView({
      scale,
      tx: r.width / 2 - cx * scale,
      ty: r.height / 2 - cy * scale,
    });
  }

  // ---------- 배경 팬 / 휠 줌 ----------
  function onBgPointerDown(e: React.PointerEvent) {
    if (!isTeacher) {
      panRef.current = { x: e.clientX, y: e.clientY };
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
      return;
    }
    panRef.current = { x: e.clientX, y: e.clientY };
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  }
  // 드래그 좌표를 카드별 문서에 기록(스로틀). 마지막 좌표는 dragRef.lastX/Y 에 보관.
  function sendDragThrottled(id: string) {
    const send = dragSendRef.current;
    const now = Date.now();
    const write = () => {
      const d = dragRef.current;
      if (!d || !cid) return;
      send.last = Date.now();
      patchNode(
        cid,
        effectiveBoardId,
        id,
        { x: d.lastX, y: d.lastY },
        lid ?? undefined
      ).catch((e) => onWriteError(id, e));
    };
    if (now - send.last >= 100) {
      write();
    } else if (!send.timer) {
      // trailing 보장 — 마지막 이동도 한 번 더 나가게
      send.timer = setTimeout(() => {
        send.timer = null;
        write();
      }, 100);
    }
  }
  // 드래그 종료(모든 경로 공통): 겹침 회피 스냅 + 마지막 좌표 flush + shield ack
  function endDrag() {
    const d = dragRef.current;
    if (!d) return;
    const send = dragSendRef.current;
    if (send.timer) {
      clearTimeout(send.timer);
      send.timer = null;
    }
    // 패들렛식 겹침 금지: 떨어뜨린 자리가 다른 카드와 겹치면 가장 가까운 빈 자리로 스냅
    let fx = d.lastX;
    let fy = d.lastY;
    const node = nodesRef.current.get(d.nid);
    if (node) {
      const others = pageNodesRef.current.filter((n) => n.id !== d.nid);
      const spot = findFreeSpot(others, node.w, node.h || 120, d.lastX, d.lastY);
      fx = spot.x;
      fy = spot.y;
      if (fx !== d.lastX || fy !== d.lastY) patchLocalNode(d.nid, { x: fx, y: fy });
    }
    if (cid)
      patchNode(
        cid,
        effectiveBoardId,
        d.nid,
        { x: fx, y: fy },
        lid ?? undefined
      ).catch((e) => onWriteError(d.nid, e));
    shieldAck(d.nid);
    dragRef.current = null;
    setDraggingId(null);
  }
  function onBgPointerMove(e: React.PointerEvent) {
    if (dragRef.current) {
      const w = toWorld(e.clientX, e.clientY);
      const id = dragRef.current.nid;
      const nx = w.x - dragRef.current.ox;
      const ny = w.y - dragRef.current.oy;
      dragRef.current.lastX = nx;
      dragRef.current.lastY = ny;
      shieldActive(id); // 보호 시간 갱신(장시간 드래그도 만료되지 않게)
      patchLocalNode(id, { x: nx, y: ny }); // 로컬 즉시 반영
      sendDragThrottled(id); // 서버 기록(스로틀)
      return;
    }
    if (panRef.current) {
      const dx = e.clientX - panRef.current.x;
      const dy = e.clientY - panRef.current.y;
      panRef.current = { x: e.clientX, y: e.clientY };
      setView((v) => ({ ...v, tx: v.tx + dx, ty: v.ty + dy }));
    }
  }
  function onBgPointerUp() {
    panRef.current = null;
    endDrag();
  }
  function onWheel(e: React.WheelEvent) {
    e.preventDefault();
    const w = toWorld(e.clientX, e.clientY);
    setView((v) => {
      const scale = Math.max(
        0.25,
        Math.min(3, v.scale * (e.deltaY < 0 ? 1.12 : 1 / 1.12))
      );
      const el = stageRef.current!;
      const r = el.getBoundingClientRect();
      const sx = e.clientX - r.left;
      const sy = e.clientY - r.top;
      return { scale, tx: sx - w.x * scale, ty: sy - w.y * scale };
    });
  }

  // ---------- 카드 인터랙션 ----------
  // 학생은 본인이 만든 카드만 이동/연결 가능(교사는 전체). 협업 보드 무결성 보호.
  function canManipulate(n: CardNode) {
    if (!canEdit) return false;
    // 규칙형: 자유 드래그·연결 비활성(카드 위치는 자동 배치). 내용 편집은 별도 게이트라 유지.
    if (isGrid) return false;
    if (isTeacher) return true;
    return !n.authorUid || n.authorUid === user?.uid;
  }
  function onCardPointerDown(e: React.PointerEvent, n: CardNode) {
    if (!canManipulate(n)) return;
    e.stopPropagation();
    if (connectMode) {
      if (!pendingFrom) {
        setPendingFrom(n.id);
      } else if (pendingFrom !== n.id) {
        const newEdge: CardEdge = {
          id: newId(),
          from: pendingFrom,
          to: n.id,
          page: activePage,
          authorUid: user?.uid,
        };
        addEdge(newEdge);
        setPendingFrom(null);
        // 한 번 연결하면 연결 모드 자동 종료 (학생 혼란 방지)
        setConnectMode(false);
        // 연결 효과 즉시 발동(본인). 감지 effect 중복 방지 위해 seen 에 미리 등록.
        seenEdgesRef.current?.add(newEdge.id);
        const a = nodesRef.current.get(pendingFrom);
        if (a) {
          const cs = [a.color, n.color].filter((c): c is string => !!c);
          showBurst(
            (a.x + a.w / 2 + (n.x + n.w / 2)) / 2,
            (a.y + a.h / 2 + (n.y + n.h / 2)) / 2,
            cs.length ? blendColors(cs) : "#6d7cff"
          );
        }
      }
      return;
    }
    const w = toWorld(e.clientX, e.clientY);
    dragRef.current = {
      nid: n.id,
      ox: w.x - n.x,
      oy: w.y - n.y,
      lastX: n.x,
      lastY: n.y,
    };
    shieldActive(n.id); // 드래그 중 원격 덮어쓰기 차단(되돌아감 방지)
    setDraggingId(n.id); // 드래그 중인 카드를 최상위로
    // 스테이지에 캡처 → 카드 밖으로 나가도 pointermove가 계속 도달
    stageRef.current?.setPointerCapture?.(e.pointerId);
  }

  function addTextCard() {
    if (!meta) return;
    const W = 220;
    const H = 120;
    // 규칙형: 자리찾기·센터링 없이 추가 → 자동 배치가 가장 짧은 열로 흐르게 함.
    if (isGrid) {
      addNode({
        id: newId(),
        kind: "text",
        x: 0,
        y: 0,
        w: W,
        h: H,
        text: "",
        color: null,
        authorUid: user?.uid,
        authorName: user?.displayName ?? "",
        page: activePage,
      });
      return;
    }
    const el = stageRef.current!;
    const r = el.getBoundingClientRect();
    const center = toWorld(r.left + r.width / 2, r.top + r.height / 2);
    const others = pageNodes;
    const j = authorJitter(user?.uid ?? "");
    const spot = findFreeSpot(
      others,
      W,
      H,
      center.x - W / 2 + j.dx,
      center.y - H / 2 + j.dy
    );
    addNode({
      id: newId(),
      kind: "text",
      x: spot.x,
      y: spot.y,
      w: W,
      h: H,
      text: "",
      color: null,
      authorUid: user?.uid,
      authorName: user?.displayName ?? "",
      page: activePage,
    });
    centerViewOn(spot.x, spot.y, W, H); // 새 카드를 화면 중앙으로(처음 세팅)
  }

  async function addLinkCard() {
    const url = await dialog.prompt({
      title: "링크 카드",
      placeholder: "https://...",
      okLabel: "추가",
    });
    if (!url?.trim()) return;
    const title = await dialog.prompt({
      title: "표시할 제목",
      placeholder: "(선택) 비우면 URL 표시",
      okLabel: "추가",
    });
    if (!meta) return;
    const W = 320;
    const H = 104;
    // 규칙형: 자리찾기·센터링 없이 추가 → 자동 배치.
    if (isGrid) {
      addNode({
        id: newId(),
        kind: "link",
        x: 0,
        y: 0,
        w: W,
        h: H,
        text: title?.trim() || url,
        url,
        authorUid: user?.uid,
        authorName: user?.displayName ?? "",
        page: activePage,
      });
      return;
    }
    const el = stageRef.current!;
    const r = el.getBoundingClientRect();
    const center = toWorld(r.left + r.width / 2, r.top + r.height / 2);
    const others = pageNodes;
    const j = authorJitter(user?.uid ?? "");
    const spot = findFreeSpot(
      others,
      W,
      H,
      center.x - W / 2 + j.dx,
      center.y - H / 2 + j.dy
    );
    addNode({
      id: newId(),
      kind: "link",
      x: spot.x,
      y: spot.y,
      w: W,
      h: H,
      text: title?.trim() || url,
      url,
      authorUid: user?.uid,
      authorName: user?.displayName ?? "",
      page: activePage,
    });
    centerViewOn(spot.x, spot.y, W, H); // 새 카드를 화면 중앙으로(처음 세팅)
  }

  // 보드의 텍스트 카드를 이 보드(활동) 자신의 지식맵 입력으로 전송.
  // 작성자(uid)별로 카드 텍스트를 묶어 활동의 제출물로 기록 → 차시 지식맵 분석에 반영.
  async function sendCardsToMap(cards: CardNode[]) {
    if (!lid || !cid) return;
    const texts = cards.filter((c) => c.kind === "text" && c.text.trim());
    if (texts.length === 0) {
      await dialog.confirm({
        title: "보낼 카드 없음",
        body: "내용이 있는 텍스트 카드가 없습니다.",
        okLabel: "확인",
      });
      return;
    }
    // 이 보드 활동(=질문 doc) 자신을 대상으로. 활동의 phase 를 사용.
    const phase = activity?.phase ?? "pre";
    // 작성자별로 카드 텍스트 합쳐 한 제출로 (활동당 학생 1제출 제약)
    const byAuthor = new Map<string, { name: string; parts: string[] }>();
    for (const c of texts) {
      const uid = c.authorUid || user!.uid;
      const name = c.authorName || user?.displayName || "보드";
      if (!byAuthor.has(uid)) byAuthor.set(uid, { name, parts: [] });
      byAuthor.get(uid)!.parts.push(c.text.trim());
    }
    for (const [uid, { name, parts }] of byAuthor) {
      await setQuestionSubmissionFor(
        cid,
        lid,
        boardId,
        uid,
        name,
        phase,
        parts.join("\n")
      );
    }
    setSelected(new Set());
    await dialog.confirm({
      title: "전송 완료",
      body: `${texts.length}개 카드(${byAuthor.size}명)를 이 보드의 지식맵 입력으로 보냈습니다. 차시 ‘지식 맵’ 탭에서 “변경된 질문 분석(또는 분석)”을 실행하면 반영됩니다.`,
      okLabel: "확인",
    });
  }

  async function deleteCard(nid: string) {
    if (
      !(await dialog.confirm({
        title: "카드 삭제",
        body: "이 카드와 연결된 화살표를 삭제할까요?",
        danger: true,
      }))
    )
      return;
    removeNode(nid);
  }

  async function relabelEdge(eid: string) {
    const cur = effEdges.find((x) => x.id === eid);
    const label = await dialog.prompt({
      title: "연결 라벨",
      defaultValue: cur?.label ?? "",
      placeholder: "(선택)",
    });
    if (label === null) return;
    commitEdge(eid, { label });
  }

  async function deleteEdge(eid: string) {
    if (
      !(await dialog.confirm({
        title: "연결 삭제",
        body: "이 화살표를 삭제할까요?",
        danger: true,
      }))
    )
      return;
    removeEdge(eid);
  }

  // 카드 좌표(화살표 끝점 계산용) — 유효 카드 Map 을 그대로 사용
  const nodeMap = effNodesMap;

  // ---------- CardView 안정 콜백 (변경된 카드만 리렌더되도록 신원 고정) ----------
  // 자주 바뀌는 값/플레인 함수는 ref 로 최신만 읽어 콜백 신원을 고정한다.
  const actorRef = useRef(actor);
  actorRef.current = actor;
  const feedbackByCardRef = useRef(feedbackByCard);
  feedbackByCardRef.current = feedbackByCard;
  const onCardDownRef = useRef(onCardPointerDown);
  onCardDownRef.current = onCardPointerDown;
  const sendToMapRef = useRef(sendCardsToMap);
  sendToMapRef.current = sendCardsToMap;
  const deleteCardRef = useRef(deleteCard);
  deleteCardRef.current = deleteCard;
  const uploadTarget = useMemo(
    () => (user ? { cid: cid as string, uid: user.uid } : null),
    [user, cid]
  );

  const cardHandlers: CardHandlers = useMemo(
    () => ({
      onCardDown: (e: React.PointerEvent, id: string) => {
        const node = nodesRef.current.get(id);
        if (node) onCardDownRef.current(e, node);
      },
      onChangeText: (id: string, t: string) => commitNodeText(id, t),
      onAddAttachments: (id: string, atts: Attachment[]) =>
        addAttachments(id, atts),
      onRemoveAttachment: (id: string, att: Attachment) =>
        removeAttachment(id, att),
      onChangeColor: (id: string, color: string | null) =>
        commitNode(id, { color }),
      onResize: (id: string, h: number) => {
        // 규칙형 배치용 측정 높이는 작성자와 무관하게 모든 뷰어가 기록(자기 렌더 높이).
        recordMeasuredHeight(id, h);
        const node = nodesRef.current.get(id);
        // 높이 Firestore 기록은 작성자만 — 원격 ResizeObserver 핑퐁/무한 쓰기 차단
        if (!node || node.authorUid !== user?.uid) return;
        if (Math.abs(h - node.h) > 2) commitNode(id, { h });
      },
      onDelete: (id: string) => deleteCardRef.current(id),
      onToggleReaction: (id: string, type: ReactionType) => {
        if (!cid) return;
        const mine =
          feedbackByCardRef.current.get(id)?.reactions[type]?.mine ?? false;
        toggleReaction(
          cid,
          effectiveBoardId,
          id,
          actorRef.current,
          type,
          !mine,
          lid ?? undefined
        ).catch((e) =>
          dialog.confirm({
            title: "반응 실패",
            body: String(e?.message ?? e),
            okLabel: "확인",
          })
        );
      },
      onOpenComments: (id: string, rect: DOMRect) =>
        setCommentPop({ cardId: id, x: rect.right, y: rect.bottom }),
      onToggleCheck: (id: string) =>
        setSelected((s) => {
          const next = new Set(s);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        }),
      onSendToMap: (id: string) => {
        const node = nodesRef.current.get(id);
        if (node) sendToMapRef.current([node]);
      },
      onFocusText: (id: string) => shieldActive(id),
      onBlurText: (id: string) => shieldAck(id),
      onRecordingChange: (id: string, rec: boolean) =>
        rec ? shieldActive(id) : shieldAck(id),
    }),
    [
      cid,
      effectiveBoardId,
      lid,
      user,
      dialog,
      commitNodeText,
      addAttachments,
      removeAttachment,
      commitNode,
      shieldActive,
      shieldAck,
      recordMeasuredHeight,
    ]
  );

  if (loading || !user || !cid) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <div className="animate-pulse text-sm text-black/40">불러오는 중…</div>
      </main>
    );
  }
  if (role && role !== "teacher" && role !== "student") {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <GlassCard className="p-10 text-center">
          <p className="font-semibold">학급 멤버만 볼 수 있어요.</p>
        </GlassCard>
      </main>
    );
  }

  return (
    <>
      {showIntro && (
        <CanvasIntro
          name={profile?.name || user?.displayName || undefined}
          onDone={() => setShowIntro(false)}
        />
      )}
      <TopBar />
      <div className="flex h-[calc(100vh-80px)] flex-col">
        {/* 툴바 */}
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] px-4 py-2.5">
          <button
            onClick={() => router.push(`/class/?id=${cid}`)}
            className="flex items-center gap-1 text-sm text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)]"
          >
            <Icon name="arrow_back" size={16} />
            학급
          </button>
          <span className="ml-2 text-sm font-semibold">
            {canvas?.name ?? "캔버스"}
          </span>
          <span className="ml-1 rounded-full bg-[var(--md-sys-color-surface-container-high)] px-2 py-0.5 text-xs text-[var(--md-sys-color-on-surface-variant)]">
            {canEdit ? "편집 가능" : "보기만"}
          </span>
          <ShareBoardButton />
          {canEdit && (
            <>
              <button
                onClick={addTextCard}
                className="inline-flex items-center gap-1 rounded-full border border-[var(--md-sys-color-outline)] px-3 py-1.5 text-xs font-medium text-[var(--md-sys-color-primary)] hover:bg-[color-mix(in_srgb,var(--md-sys-color-primary)_8%,transparent)]"
              >
                <Icon name="note_add" size={14} />
                텍스트 카드
              </button>
              <button
                onClick={addLinkCard}
                className="inline-flex items-center gap-1 rounded-full border border-[var(--md-sys-color-outline)] px-3 py-1.5 text-xs font-medium text-[var(--md-sys-color-primary)] hover:bg-[color-mix(in_srgb,var(--md-sys-color-primary)_8%,transparent)]"
              >
                <Icon name="link" size={14} />
                링크 카드
              </button>
              {/* 연결(엣지)은 자유형 전용 */}
              {!isGrid && (
                <button
                  onClick={() => {
                    setConnectMode((v) => !v);
                    setPendingFrom(null);
                  }}
                  className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                    connectMode
                      ? "bg-[var(--md-sys-color-primary)] text-white"
                      : "border border-[var(--md-sys-color-outline)] text-[var(--md-sys-color-primary)]"
                  }`}
                >
                  <Icon name="trending_flat" size={14} />
                  {connectMode
                    ? pendingFrom
                      ? "대상 카드 선택…"
                      : "연결: 시작 카드 클릭"
                    : "연결"}
                </button>
              )}
            </>
          )}
          {/* 배치 모드 토글(교사 전용) — 자유형 / 규칙형 */}
          {isTeacher && (
            <div
              className="inline-flex items-center gap-0.5 rounded-full border border-[var(--md-sys-color-outline)] p-0.5"
              role="group"
              aria-label="보드 배치 모드"
            >
              {(
                [
                  {
                    m: "free",
                    label: "자유형",
                    icon: "open_with",
                    tip: "자유롭게 배치·연결하는 무한 캔버스",
                  },
                  {
                    m: "grid",
                    label: "규칙형",
                    icon: "grid_view",
                    tip: "격자로 자동 정렬(패들렛식) — 드래그·연결 없음",
                  },
                ] as const
              ).map(({ m, label, icon, tip }) => {
                const active = layoutMode === m;
                return (
                  <button
                    key={m}
                    onClick={() => {
                      if (!cid || layoutMode === m) return;
                      setMeta((prev) => (prev ? { ...prev, layoutMode: m } : prev));
                      setBoardLayoutMode(
                        cid,
                        effectiveBoardId,
                        m,
                        lid ?? undefined
                      ).catch(() => {});
                    }}
                    className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold transition ${
                      active
                        ? "bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)]"
                        : "text-[var(--md-sys-color-on-surface-variant)] hover:bg-[color-mix(in_srgb,var(--md-sys-color-primary)_8%,transparent)]"
                    }`}
                    title={tip}
                  >
                    <Icon name={icon} size={14} />
                    {label}
                  </button>
                );
              })}
            </div>
          )}
          {isTeacher && groups.length > 0 && (
            <button
              onClick={toggleGroupColor}
              className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                groupColorMode
                  ? "bg-[var(--md-sys-color-primary)] text-white"
                  : "border border-[var(--md-sys-color-outline)] text-[var(--md-sys-color-primary)]"
              }`}
              title="작성자의 모둠별로 카드 색을 구분합니다"
            >
              <Icon name="palette" size={14} />
              모둠별 색 구분
            </button>
          )}
          {isTeacher && isLessonBoard && !isGrid && (
            <>
              <span className="ml-1 h-4 w-px bg-[var(--md-sys-color-outline-variant)]" />
              <button
                onClick={() =>
                  sendCardsToMap(
                    pageNodes.filter(
                      (n) => selected.has(n.id) && n.kind === "text"
                    )
                  )
                }
                disabled={
                  pageNodes.filter(
                    (n) => selected.has(n.id) && n.kind === "text"
                  ).length === 0
                }
                className="inline-flex items-center gap-1 rounded-full bg-[var(--md-sys-color-primary)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                title="체크한 텍스트 카드만 지식맵 입력으로 보내기"
              >
                <Icon name="hub" size={14} />
                선택 보내기 (
                {
                  pageNodes.filter(
                    (n) => selected.has(n.id) && n.kind === "text"
                  ).length
                }
                )
              </button>
              <button
                onClick={() =>
                  sendCardsToMap(pageNodes.filter((n) => n.kind === "text"))
                }
                className="inline-flex items-center gap-1 rounded-full border border-[var(--md-sys-color-primary)] px-3 py-1.5 text-xs font-semibold text-[var(--md-sys-color-primary)] hover:bg-[color-mix(in_srgb,var(--md-sys-color-primary)_8%,transparent)]"
                title="현재 페이지의 모든 텍스트 카드를 지식맵 입력으로 보내기"
              >
                <Icon name="select_all" size={14} />
                이 페이지 전체 보내기
              </button>
            </>
          )}
          <div className="ml-auto flex items-center gap-1 text-xs text-black/40">
            <button
              onClick={() =>
                setView((v) => ({ ...v, scale: Math.min(3, v.scale * 1.15) }))
              }
              className="rounded bg-black/5 px-2 py-0.5 hover:bg-black/10"
            >
              +
            </button>
            <span className="w-10 text-center font-mono">
              {Math.round(view.scale * 100)}%
            </span>
            <button
              onClick={() =>
                setView((v) => ({ ...v, scale: Math.max(0.25, v.scale / 1.15) }))
              }
              className="rounded bg-black/5 px-2 py-0.5 hover:bg-black/10"
            >
              −
            </button>
            <button
              onClick={() => setView({ scale: 1, tx: 0, ty: 0 })}
              className="rounded bg-black/5 px-2 py-0.5 hover:bg-black/10"
              title="초기화"
            >
              ⌂
            </button>
          </div>
        </div>

        {/* 모둠별 보드 선택 바 */}
        {isGroupBoard && (
          <div className="flex flex-wrap items-center gap-2 border-b border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] px-4 py-2">
            <span className="inline-flex items-center gap-1 text-xs font-bold text-[var(--md-sys-color-primary)]">
              <Icon name="groups" size={15} />
              모둠 보드
            </span>
            {isTeacher ? (
              groups.length === 0 ? (
                <span className="text-xs text-black/45">
                  모둠이 없습니다. 학급 화면에서 모둠을 먼저 만드세요.
                </span>
              ) : (
                groups.map((g, i) => {
                  const color = g.color || PAGE_COLORS[i % PAGE_COLORS.length];
                  const active = groupParam === g.id;
                  return (
                    <button
                      key={g.id}
                      onClick={() => setGroupParam(g.id)}
                      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                        active
                          ? "text-white shadow-sm"
                          : "text-black/55 hover:bg-black/5"
                      }`}
                      style={
                        active
                          ? { backgroundColor: color }
                          : { border: `1.5px solid ${color}` }
                      }
                    >
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ background: active ? "#fff" : color }}
                      />
                      {g.name}
                      <span className={active ? "opacity-80" : "text-black/35"}>
                        {g.memberUids.length}
                      </span>
                    </button>
                  );
                })
              )
            ) : myGroup ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--md-sys-color-primary)] px-3 py-1.5 text-xs font-semibold text-white">
                <Icon name="lock" size={13} />
                {myGroup.name}
              </span>
            ) : (
              <span className="text-xs text-[var(--md-sys-color-error)]">
                배정된 모둠이 없어 참여할 수 없습니다. 선생님께 모둠 배정을 요청하세요.
              </span>
            )}
          </div>
        )}

        {/* 페이지 탭 (가운데 정렬, 크게) */}
        <div className="relative border-b border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)] px-4 py-2">
          <div className="flex flex-wrap items-center justify-center gap-2">
            {(canvas?.pages ?? []).map((p) => {
              const active = activePage === p.id;
              return (
                <button
                  key={p.id}
                  onPointerDown={(e) => {
                    if (!isTeacher) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    pressFired.current = false;
                    if (pressTimer.current) clearTimeout(pressTimer.current);
                    pressTimer.current = setTimeout(() => {
                      pressFired.current = true;
                      setPageMenu({
                        id: p.id,
                        x: rect.left + rect.width / 2,
                        top: rect.top,
                        bottom: rect.bottom,
                      });
                    }, 450);
                  }}
                  onPointerUp={() => {
                    if (pressTimer.current) clearTimeout(pressTimer.current);
                  }}
                  onPointerLeave={() => {
                    if (pressTimer.current) clearTimeout(pressTimer.current);
                  }}
                  onClick={() => {
                    if (pressFired.current) {
                      pressFired.current = false;
                      return;
                    }
                    setActivePage(p.id);
                    setSelected(new Set());
                  }}
                  className={`shrink-0 select-none rounded-xl px-5 py-2 text-sm font-bold shadow-sm transition hover:brightness-105 ${
                    active ? "ring-2 ring-black/10" : ""
                  }`}
                  style={pageTabStyle(p.color, p.pattern, active)}
                  title={isTeacher ? "꾹 누르면 색상·삭제 메뉴" : undefined}
                >
                  {p.name}
                </button>
              );
            })}

            {isTeacher && (
              <button
                onClick={addPage}
                className="ml-1 inline-flex h-9 items-center gap-0.5 rounded-xl border border-dashed border-[var(--md-sys-color-outline)] px-3 text-sm font-medium text-[var(--md-sys-color-on-surface-variant)] hover:bg-black/5"
                title="페이지 추가"
              >
                <Icon name="add" size={16} />
                페이지
              </button>
            )}
          </div>
          {isTeacher && (
            <p className="mt-1 text-center text-xs text-black/35">
              페이지 버튼을 꾹 누르면 색상·삭제 메뉴가 열립니다
            </p>
          )}
        </div>

        {/* 페이지 꾸미기 말풍선 (교사) */}
        {isTeacher && pageMenu && canvas && (
          <PageBubble
            page={
              canvas.pages.find((x) => x.id === pageMenu.id) ?? canvas.pages[0]
            }
            x={pageMenu.x}
            top={pageMenu.top}
            bottom={pageMenu.bottom}
            canDelete={canvas.pages.length > 1}
            onColor={(color) =>
              saveMeta({
                pages: canvas.pages.map((x) =>
                  x.id === pageMenu.id ? { ...x, color } : x
                ),
              })
            }
            onPattern={(pattern) =>
              saveMeta({
                pages: canvas.pages.map((x) =>
                  x.id === pageMenu.id ? { ...x, pattern } : x
                ),
              })
            }
            onDelete={async () => {
              if (
                !(await dialog.confirm({
                  title: "페이지 삭제",
                  body: "이 페이지의 카드와 연결이 모두 삭제됩니다.",
                  danger: true,
                }))
              )
                return;
              const pid = pageMenu.id;
              const isFirst = canvas.pages[0]?.id === pid;
              // 페이지 메타 먼저 제거 + 그 페이지의 카드/연결을 서버에서 일괄 삭제
              saveMeta({ pages: canvas.pages.filter((p) => p.id !== pid) });
              if (cid)
                deleteNodesOnPage(
                  cid,
                  effectiveBoardId,
                  pid,
                  isFirst,
                  lid ?? undefined
                ).catch(() => {});
              if (activePage === pid)
                setActivePage(
                  canvas.pages.find((p) => p.id !== pid)?.id ?? "p1"
                );
              setPageMenu(null);
            }}
            onRename={async () => {
              const cur = canvas.pages.find((x) => x.id === pageMenu.id);
              const name = await dialog.prompt({
                title: "페이지 이름",
                defaultValue: cur?.name ?? "",
                okLabel: "변경",
              });
              if (name === null || !name.trim()) return;
              saveMeta({
                pages: canvas.pages.map((x) =>
                  x.id === pageMenu.id ? { ...x, name: name.trim() } : x
                ),
              });
            }}
            onClose={() => setPageMenu(null)}
          />
        )}

        {/* 캔버스 스테이지 */}
        <div
          ref={stageRef}
          onPointerDown={onBgPointerDown}
          onPointerMove={onBgPointerMove}
          onPointerUp={onBgPointerUp}
          onPointerLeave={onBgPointerUp}
          onPointerCancel={onBgPointerUp}
          onLostPointerCapture={onBgPointerUp}
          onWheel={onWheel}
          className="relative flex-1 select-none overflow-hidden bg-[radial-gradient(circle,rgba(0,0,0,0.06)_1px,transparent_1px)] bg-[length:24px_24px]"
          style={{
            cursor: connectMode ? "crosshair" : panRef.current ? "grabbing" : "grab",
          }}
        >
          <div
            className="absolute left-0 top-0 origin-top-left"
            style={{
              transform: `translate(${view.tx}px,${view.ty}px) scale(${view.scale})`,
            }}
          >
            {/* SVG 화살표 레이어 — 규칙형에서는 렌더하지 않음(연결/엣지는 자유형 전용) */}
            {!isGrid && (
            <svg
              className="pointer-events-none absolute left-0 top-0 overflow-visible"
              style={{ width: 4000, height: 4000 }}
            >
              <defs>
                <marker
                  id="canvas-arrow"
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M0,0 L10,5 L0,10 z" fill="context-stroke" />
                </marker>
              </defs>
              {visibleEdges.map((e) => {
                const a = nodeMap.get(e.from);
                const b = nodeMap.get(e.to);
                if (!a || !b) return null;
                const ax = a.x + a.w / 2;
                const ay = a.y + a.h / 2;
                const bx = b.x + b.w / 2;
                const by = b.y + b.h / 2;
                // 두 카드 중심을 잇는 부드러운 곡선 (수평 접선 큐빅 베지어)
                const dx = bx - ax;
                const dy = by - ay;
                const horiz = Math.abs(dx) >= Math.abs(dy);
                const c1x = horiz ? ax + dx * 0.45 : ax;
                const c1y = horiz ? ay : ay + dy * 0.45;
                const c2x = horiz ? bx - dx * 0.45 : bx;
                const c2y = horiz ? by : by - dy * 0.45;
                const d = `M ${ax} ${ay} C ${c1x} ${c1y} ${c2x} ${c2y} ${bx} ${by}`;
                // 연결선 색 = 팀 색(연결된 카드들의 조합색). 색 없으면 회색.
                const teamC =
                  teamColorByNode.get(e.from) || teamColorByNode.get(e.to);
                const stroke = teamC?.solid || "rgba(80,90,120,0.55)";
                const colored = !!teamC;
                return (
                  <g
                    key={e.id}
                    className="pointer-events-auto"
                    style={{ cursor: "pointer" }}
                    onClick={() => relabelEdge(e.id)}
                    onDoubleClick={() => deleteEdge(e.id)}
                  >
                    {/* 클릭 영역 확대용 투명 굵은 선 */}
                    <path d={d} fill="none" stroke="transparent" strokeWidth={14} />
                    <path
                      d={d}
                      fill="none"
                      stroke={stroke}
                      strokeWidth={colored ? 3 : 2}
                      strokeLinecap="round"
                      markerEnd="url(#canvas-arrow)"
                    />
                    {e.label && (
                      <text
                        x={(ax + bx) / 2}
                        y={(ay + by) / 2 - 6}
                        textAnchor="middle"
                        className="fill-black/55"
                        style={{ fontSize: 12, fontWeight: 600 }}
                      >
                        {e.label}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
            )}

            {/* 카드 레이어 — 콜백/데이터 prop 신원 고정 → 변경된 카드만 리렌더. 가시 카드만(컬링) */}
            {visibleNodes.map((n) => (
              <CardView
                key={n.id}
                n={n}
                gridMode={isGrid}
                gridPos={isGrid ? gridPos.get(n.id) ?? null : null}
                team={isGrid ? null : teamColorByNode.get(n.id) ?? null}
                isTeacher={isTeacher || (canEdit && n.authorUid === user?.uid)}
                isFrom={pendingFrom === n.id}
                connectMode={connectMode}
                authorName={
                  (n.authorUid && authorMap[n.authorUid]?.name) ||
                  n.authorName ||
                  ""
                }
                authorPhoto={(n.authorUid && authorMap[n.authorUid]?.photo) || ""}
                groupColor={
                  groupColorMode ? groupInfo[n.authorUid ?? ""]?.color : undefined
                }
                groupName={
                  groupColorMode ? groupInfo[n.authorUid ?? ""]?.name : undefined
                }
                commentCount={feedbackByCard.get(n.id)?.comments ?? 0}
                reactions={feedbackByCard.get(n.id)?.reactions}
                canSendMap={isTeacher && isLessonBoard && !isGrid}
                checked={selected.has(n.id)}
                uploadTarget={uploadTarget}
                zIndex={
                  n.id === draggingId
                    ? 1000
                    : n.authorUid === user?.uid
                      ? 30
                      : 10
                }
                handlers={cardHandlers}
              />
            ))}
            {burst && (
              <ColorMergeBurst
                key={burst.id}
                x={burst.x}
                y={burst.y}
                color={burst.color}
              />
            )}
          </div>

          {/* 모둠 미선택(교사) — 위 모둠 바에서 보드 선택 안내 */}
          {groupBoardPending && (
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 text-black/40">
              <Icon name="groups" size={40} className="text-black/20" />
              <p className="text-sm">
                위에서 보려는 <b>모둠</b>을 선택하세요. 모둠마다 보드가 따로
                있습니다.
              </p>
            </div>
          )}

          {/* 빈 상태 */}
          {!groupBoardPending && canvas && pageNodes.length === 0 && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-black/40">
              {canEdit
                ? "상단의 “텍스트 카드” / “링크 카드” 로 시작하세요."
                : "아직 카드가 없습니다."}
            </div>
          )}
        </div>

        <p className="border-t border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] px-4 py-2 text-xs text-black/45">
          {isGrid
            ? "규칙형: 카드가 만든 순서대로 격자에 자동 정렬됩니다 · 배경 드래그=이동(세로 스크롤) · 내 카드만 편집·삭제 가능"
            : "휠=줌 · 배경 드래그=이동 · 카드 드래그=재배치 · 연결 모드에서 카드 두 개 차례로 클릭=화살표 · 화살표 클릭=라벨 · 화살표 더블클릭=삭제"}
        </p>
      </div>

      {commentPop && (
        <CommentsPopover
          anchorX={commentPop.x}
          anchorY={commentPop.y}
          comments={feedback
            .filter(
              (f) => f.kind === "comment" && f.cardId === commentPop.cardId
            )
            .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0))}
          isTeacher={isTeacher}
          myUid={user.uid}
          onClose={() => setCommentPop(null)}
          onAdd={(t) =>
            addComment(cid, effectiveBoardId, commentPop.cardId, actor, t, lid ?? undefined)
          }
          onDelete={(fid) =>
            deleteFeedback(cid, effectiveBoardId, fid, lid ?? undefined).catch((e) =>
              dialog.confirm({
                title: "삭제 실패",
                body: String(e?.message ?? e),
                okLabel: "확인",
              })
            )
          }
        />
      )}
    </>
  );
}

function CommentsPopover({
  anchorX,
  anchorY,
  comments,
  isTeacher,
  myUid,
  onClose,
  onAdd,
  onDelete,
}: {
  anchorX: number;
  anchorY: number;
  comments: Feedback[];
  isTeacher: boolean;
  myUid: string;
  onClose: () => void;
  onAdd: (text: string) => Promise<void> | void;
  onDelete: (fid: string) => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const W = 320;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const left = Math.min(Math.max(8, anchorX - W + 28), vw - W - 8);
  const top = Math.min(anchorY + 8, vh - 200);
  const maxH = Math.max(220, vh - top - 16);

  async function submit() {
    if (!text.trim() || busy) return;
    setBusy(true);
    setErr("");
    try {
      await onAdd(text);
      setText("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "등록에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60]" onClick={onClose}>
      <div
        className="absolute flex flex-col overflow-hidden rounded-2xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-high)] shadow-[var(--md-sys-elevation-3)]"
        style={{ left, top, width: W, maxHeight: maxH }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 border-b border-[var(--md-sys-color-outline-variant)] px-3 py-2">
          <p className="flex items-center gap-1.5 text-sm font-bold">
            <Icon
              name="chat_bubble"
              size={15}
              className="text-[var(--md-sys-color-primary)]"
            />
            댓글 {comments.length > 0 && comments.length}
          </p>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-highest)]"
          >
            <Icon name="close" size={16} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
          {comments.length === 0 ? (
            <p className="py-6 text-center text-sm text-black/40">
              첫 댓글을 남겨보세요.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {comments.map((c) => {
                const col = authorColor(c.uid);
                return (
                <li key={c.id} className="flex items-start gap-2">
                  {c.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={c.photo}
                      alt=""
                      className="h-7 w-7 shrink-0 rounded-full object-cover ring-2"
                      style={{ ["--tw-ring-color" as string]: col }}
                    />
                  ) : (
                    <span
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                      style={{ background: col }}
                    >
                      {(c.name || "?").slice(0, 1)}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5">
                      <span
                        className="text-xs font-bold"
                        style={{ color: col }}
                      >
                        {c.name}
                      </span>
                      <span className="text-xs text-black/35">
                        {relTime(c.createdAt)}
                      </span>
                    </p>
                    <p className="whitespace-pre-wrap break-words text-sm">
                      {c.text}
                    </p>
                  </div>
                  {(c.uid === myUid || isTeacher) && (
                    <button
                      onClick={() => onDelete(c.id)}
                      className="shrink-0 rounded-full p-0.5 text-black/30 hover:bg-[var(--md-sys-color-error-container)] hover:text-[var(--md-sys-color-error)]"
                      title="삭제"
                    >
                      <Icon name="close" size={13} />
                    </button>
                  )}
                </li>
                );
              })}
            </ul>
          )}
        </div>

        {err && (
          <p className="px-3 text-xs text-[var(--md-sys-color-error)]">{err}</p>
        )}
        <div className="flex items-end gap-1.5 border-t border-[var(--md-sys-color-outline-variant)] p-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="댓글 입력… (Enter 전송)"
            rows={1}
            autoFocus
            className="m3-field max-h-24 flex-1 resize-none"
          />
          <button
            onClick={submit}
            disabled={busy || !text.trim()}
            className="btn-accent shrink-0 px-3 py-2 text-xs font-semibold disabled:opacity-50"
          >
            등록
          </button>
        </div>
      </div>
    </div>
  );
}

const CardView = memo(function CardView({
  n,
  gridMode,
  gridPos,
  team: teamProp,
  isTeacher,
  isFrom,
  connectMode,
  authorName,
  authorPhoto,
  groupColor,
  groupName,
  commentCount,
  reactions: reactionsProp,
  canSendMap,
  checked,
  uploadTarget,
  zIndex,
  handlers,
}: {
  n: CardNode;
  gridMode: boolean;
  gridPos: { x: number; y: number } | null;
  team: TeamColor | null;
  isTeacher: boolean;
  isFrom: boolean;
  connectMode: boolean;
  authorName: string;
  authorPhoto: string;
  groupColor?: string;
  groupName?: string;
  commentCount: number;
  reactions?: Record<string, { count: number; mine: boolean }>;
  canSendMap: boolean;
  checked: boolean;
  uploadTarget: { cid: string; uid: string } | null;
  zIndex: number;
  handlers: CardHandlers;
}) {
  // 색 없는 단독 카드의 team 폴백은 내부에서 — prop 신원을 안정화(메모 유지)
  const team = teamProp ?? (n.color ? { solid: n.color, gradient: null } : null);
  const reactions = reactionsProp ?? {};
  const HANDLE = 28;
  const MIN_H = n.kind === "link" ? 84 : 96;
  const selectable = canSendMap && n.kind === "text";
  const showSendToMap = canSendMap && n.kind === "text";

  const rootRef = useRef<HTMLDivElement | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  // 높이 동기화 콜백은 최신 핸들러/ id 를 ref 로 — RO effect 는 mount 시 1회만 설치
  const onResizeRef = useRef<(h: number) => void>(() => {});
  onResizeRef.current = (h: number) => handlers.onResize(n.id, h);
  const [colorOpen, setColorOpen] = useState(false);
  const [colorRect, setColorRect] = useState<DOMRect | null>(null);

  // 텍스트 입력 → 높이 자동 확장
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }, [n.text, n.w]);

  // 실제 렌더 높이를 노드에 동기화(엣지 중심 계산용)
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      onResizeRef.current(Math.round(el.offsetHeight));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const highlighted = isFrom || (checked && selectable);
  return (
    <div
      ref={rootRef}
      style={{
        // 규칙형: 계산된 격자 위치 + 균일 열너비(표시만, Firestore 미저장). 높이는 내용 자동.
        left: gridMode && gridPos ? gridPos.x : n.x,
        top: gridMode && gridPos ? gridPos.y : n.y,
        width: gridMode ? GRID_COL_W : n.w,
        minHeight: MIN_H,
        zIndex,
        ...(groupColor && !highlighted
          ? {
              borderColor: groupColor,
              boxShadow: `0 0 0 2px color-mix(in srgb, ${groupColor} 35%, transparent)`,
            }
          : team && !highlighted
            ? {
                borderColor: team.solid,
                backgroundColor: `color-mix(in srgb, ${team.solid} 16%, white)`,
                boxShadow: `0 0 0 1px color-mix(in srgb, ${team.solid} 45%, transparent)`,
              }
            : {}),
      }}
      className={`absolute flex flex-col overflow-hidden rounded-2xl border bg-white shadow ${
        isFrom
          ? "border-[var(--md-sys-color-primary)] ring-2 ring-[var(--md-sys-color-primary)]"
          : checked && selectable
            ? "border-[var(--md-sys-color-primary)] ring-2 ring-[var(--md-sys-color-primary)]/60"
            : "border-[var(--md-sys-color-outline-variant)]"
      }`}
    >
      {/* 팀 색 상단 띠 — 섞일수록 무지개. 모두에게 보임(편집 불가자 포함) */}
      {team && !highlighted && (
        <div
          className="h-1.5 w-full shrink-0"
          style={{ background: team.gradient ?? team.solid }}
        />
      )}

      {/* 선택 체크박스 (교사·차시 보드) */}
      {selectable && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            handlers.onToggleCheck(n.id);
          }}
          onPointerDown={(e) => e.stopPropagation()}
          className={`absolute right-1.5 top-[34px] z-10 flex h-5 w-5 items-center justify-center rounded-md border ${
            checked
              ? "border-[var(--md-sys-color-primary)] bg-[var(--md-sys-color-primary)] text-white"
              : "border-black/25 bg-white text-transparent"
          }`}
          title="선택"
        >
          <Icon name="check" size={13} />
        </button>
      )}

      {/* 드래그 핸들 — macOS 타이틀바 스타일 (교사) */}
      {isTeacher && (
        <div
          onPointerDown={(e) => handlers.onCardDown(e, n.id)}
          style={{
            height: HANDLE,
            ...(team
              ? {
                  backgroundColor: `color-mix(in srgb, ${team.solid} 28%, var(--md-sys-color-surface-container-high))`,
                }
              : {}),
          }}
          className="group/bar flex shrink-0 cursor-grab items-center gap-1.5 border-b border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-high)] px-3 active:cursor-grabbing"
          title="끌어서 이동"
        >
          {/* 신호등 버튼 */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              handlers.onDelete(n.id);
            }}
            onPointerDown={(e) => e.stopPropagation()}
            className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[#ff5f57] ring-1 ring-black/10"
            title="카드 삭제"
          >
            {/* X 를 항상 표시 — 터치(태블릿) 학생도 삭제 버튼임을 알 수 있게(호버 의존 X) */}
            <Icon name="close" size={10} className="text-black/55" />
          </button>
          <span className="h-3 w-3 rounded-full bg-[#febc2e] ring-1 ring-black/10" />
          <span className="h-3 w-3 rounded-full bg-[#28c840] ring-1 ring-black/10" />

          {/* 카드 색 선택 */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setColorRect(e.currentTarget.getBoundingClientRect());
              setColorOpen((v) => !v);
            }}
            onPointerDown={(e) => e.stopPropagation()}
            className="ml-1 flex h-4 w-4 items-center justify-center rounded-full ring-1 ring-black/15"
            style={{ backgroundColor: n.color || "transparent" }}
            title="카드 색"
          >
            {!n.color && (
              <Icon name="palette" size={11} className="text-black/45" />
            )}
          </button>
          {colorOpen && colorRect && (
            <CardColorPopover
              rect={colorRect}
              current={n.color ?? null}
              onPick={(c) => {
                handlers.onChangeColor(n.id, c);
                setColorOpen(false);
              }}
              onCustom={(c) => handlers.onChangeColor(n.id, c)}
              onClose={() => setColorOpen(false)}
            />
          )}

          {showSendToMap && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handlers.onSendToMap(n.id);
              }}
              onPointerDown={(e) => e.stopPropagation()}
              className="ml-auto rounded px-1.5 py-0.5 text-xs font-semibold text-[var(--md-sys-color-primary)] hover:bg-black/5"
              title="이 카드 내용을 차시 지식맵 입력으로 보내기"
            >
              지식맵으로
            </button>
          )}
        </div>
      )}

      <div className="relative flex-1">
        {n.kind === "link" ? (
          <a
            href={normUrlSafe(n.url ?? "")}
            target="_blank"
            rel="noreferrer"
            className="flex w-full items-center gap-3 p-4"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--md-sys-color-primary)] text-white">
              <Icon name="link" size={22} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block break-words text-sm font-semibold leading-snug">
                {n.text || n.url}
              </span>
              <span className="mt-0.5 block break-all text-xs text-black/45">
                {n.url}
              </span>
            </span>
          </a>
        ) : isTeacher ? (
          <textarea
            ref={taRef}
            value={n.text}
            onChange={(e) => handlers.onChangeText(n.id, e.target.value)}
            onFocus={() => handlers.onFocusText(n.id)}
            onBlur={() => handlers.onBlurText(n.id)}
            onPaste={async (e) => {
              // 클립보드의 이미지(스크린샷·복사한 사진)를 바로 카드 첨부로(원자 추가)
              const imgs = Array.from(e.clipboardData?.files ?? []).filter((f) =>
                f.type.startsWith("image/")
              );
              if (imgs.length === 0 || !uploadTarget) return;
              e.preventDefault();
              try {
                const room = Math.max(0, 6 - (n.attachments?.length ?? 0));
                const added = await uploadImages(
                  { kind: "canvas", ...uploadTarget },
                  imgs,
                  room
                );
                handlers.onAddAttachments(n.id, added);
              } catch {
                /* 업로드 실패 무시 */
              }
            }}
            placeholder="텍스트… (사진 붙여넣기 가능)"
            rows={1}
            className="block min-h-[56px] w-full resize-none overflow-hidden whitespace-pre-wrap break-words bg-transparent p-3 text-sm leading-relaxed outline-none"
          />
        ) : (
          <div className="w-full whitespace-pre-wrap break-words p-3 text-sm leading-relaxed">
            {n.text}
          </div>
        )}

        {/* 사진·음성 첨부 (패들렛식) — 편집 가능하면 추가/삭제, 아니면 표시만.
            연결 모드에서도 내용(사진·음성)은 그대로 보이게 하고 편집 UI만 숨긴다. */}
        {n.kind !== "link" && (
          <div
            className="px-3 pb-3"
            onPointerDown={(e) => e.stopPropagation()}
          >
            {isTeacher && uploadTarget && !connectMode ? (
              <AttachmentField
                target={{ kind: "canvas", ...uploadTarget }}
                value={n.attachments ?? []}
                onAdd={(atts) => handlers.onAddAttachments(n.id, atts)}
                onRemove={(att) => handlers.onRemoveAttachment(n.id, att)}
                onRecordingChange={(rec) =>
                  handlers.onRecordingChange(n.id, rec)
                }
                compact
                imageLayout="full"
              />
            ) : (
              (n.attachments?.length ?? 0) > 0 && (
                <AttachmentList
                  attachments={n.attachments!}
                  compact
                  imageLayout="full"
                />
              )
            )}
          </div>
        )}

        {/* 연결 모드: 카드 전체를 클릭 타깃으로 덮음 */}
        {connectMode && (
          <div
            onPointerDown={(e) => handlers.onCardDown(e, n.id)}
            className="absolute inset-0 cursor-crosshair bg-[var(--md-sys-color-primary)]/5"
            title="연결할 카드 클릭"
          />
        )}
      </div>

      {/* 작성자 */}
      {(authorName || n.authorName) && (
        <div className="flex shrink-0 items-center gap-2 border-t border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-lowest)] px-3 py-2 text-[13px] font-medium text-black/65">
          {authorPhoto ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={authorPhoto}
              alt=""
              className="h-7 w-7 rounded-full object-cover"
            />
          ) : (
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--md-sys-color-primary-container)] text-xs font-bold text-[var(--md-sys-color-on-primary-container)]">
              {(authorName || n.authorName || "?").slice(0, 1)}
            </span>
          )}
          <span className="truncate">{authorName || n.authorName}</span>
        </div>
      )}

      {/* 반응 + 댓글 바 */}
      <div
        className="flex shrink-0 items-center gap-1 border-t border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-lowest)] px-1.5 py-1"
        onPointerDown={(e) => e.stopPropagation()}
      >
        {REACTIONS.map((r) => {
          const st = reactions[r.type];
          const mine = st?.mine ?? false;
          return (
            <button
              key={r.type}
              onClick={(e) => {
                e.stopPropagation();
                handlers.onToggleReaction(n.id, r.type);
              }}
              className={`flex items-center gap-0.5 rounded-full px-2 py-1 text-xs font-semibold transition ${
                mine ? "" : "text-black/45 hover:bg-black/5"
              }`}
              style={
                mine
                  ? {
                      color: r.color,
                      background: `color-mix(in srgb, ${r.color} 15%, transparent)`,
                    }
                  : undefined
              }
              title={r.label}
            >
              <Icon name={r.icon} size={15} fill={mine} />
              {st?.count ? st.count : ""}
            </button>
          );
        })}
        <button
          onClick={(e) => {
            e.stopPropagation();
            handlers.onOpenComments(n.id, e.currentTarget.getBoundingClientRect());
          }}
          className="ml-auto flex items-center gap-0.5 rounded-full px-2 py-1 text-xs font-semibold text-black/45 transition hover:bg-black/5"
          title="댓글"
        >
          <Icon name="chat_bubble" size={15} />
          {commentCount ? commentCount : ""}
        </button>
      </div>
    </div>
  );
});

function normUrlSafe(u: string) {
  const s = (u || "").trim();
  if (!s) return "#";
  if (/^(https?:|mailto:|tel:)/i.test(s)) return s;
  return "https://" + s.replace(/^\/+/, "");
}

/** 현재 보드 링크 복사 — 주소(class·lesson·q·group)가 곧 이 보드 식별자 */
function ShareBoardButton() {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard?.writeText(window.location.href);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className={`ml-3 inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
        copied
          ? "border-transparent bg-[var(--md-sys-color-primary)] text-white"
          : "border-[var(--md-sys-color-outline)] text-[var(--md-sys-color-primary)] hover:bg-[color-mix(in_srgb,var(--md-sys-color-primary)_8%,transparent)]"
      }`}
      title="이 보드 링크를 복사해 공유"
    >
      <Icon name={copied ? "check" : "share"} size={14} />
      {copied ? "링크 복사됨" : "보드 공유"}
    </button>
  );
}

/** 카드 색 선택 팝업 — 카드 overflow 에 잘리지 않도록 body 로 portal 렌더 */
function CardColorPopover({
  rect,
  current,
  onPick,
  onCustom,
  onClose,
}: {
  rect: DOMRect;
  current: string | null;
  onPick: (c: string | null) => void;
  onCustom: (c: string) => void;
  onClose: () => void;
}) {
  if (typeof document === "undefined") return null;
  const W = 188;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const left = Math.min(Math.max(8, rect.left), vw - W - 8);
  const top = Math.min(rect.bottom + 6, vh - 220);
  return createPortal(
    <div
      className="fixed inset-0 z-[110]"
      onClick={onClose}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        style={{ left, top, width: W }}
        className="fixed rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-white p-2 shadow-[var(--md-sys-elevation-3)]"
      >
        <div className="grid grid-cols-6 gap-1.5">
          {CARD_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => onPick(c)}
              className={`h-5 w-5 rounded-full ring-1 ring-black/10 transition hover:scale-110 ${
                current === c ? "ring-2 ring-black/60" : ""
              }`}
              style={{ backgroundColor: c }}
              title={c}
            />
          ))}
        </div>
        <div className="mt-2 flex items-center gap-1.5 border-t border-[var(--md-sys-color-outline-variant)] pt-2">
          <label
            className="flex h-6 flex-1 cursor-pointer items-center gap-1 rounded-lg px-1.5 text-[11px] font-semibold text-[var(--md-sys-color-on-surface-variant)] hover:bg-black/5"
            title="직접 색 고르기"
          >
            <span
              className="h-4 w-4 rounded-full ring-1 ring-black/15"
              style={{
                background:
                  "conic-gradient(red, orange, yellow, lime, cyan, blue, magenta, red)",
              }}
            />
            직접 선택
            <input
              type="color"
              value={current || "#3b82f6"}
              onChange={(e) => onCustom(e.target.value)}
              className="h-0 w-0 opacity-0"
            />
          </label>
          <button
            onClick={() => onPick(null)}
            className="flex h-6 items-center gap-1 rounded-lg px-2 text-[11px] font-semibold text-[var(--md-sys-color-on-surface-variant)] hover:bg-black/5"
            title="색 없음"
          >
            <Icon name="format_color_reset" size={14} />
            없음
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

/** 카드가 연결될 때 그 지점에서 "우리의 생각이 연결됐어요" 축하 연출 */
function ColorMergeBurst({
  x,
  y,
  color,
}: {
  x: number;
  y: number;
  color: string;
}) {
  const [data, setData] = useState<object | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/Geometric%20shape%20loader.json")
      .then((r) => r.json())
      .then((d) => alive && setData(d))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return (
    <div
      className="pointer-events-none absolute z-30 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
      style={{ left: x, top: y }}
    >
      <span
        className="jam-burst-ring absolute left-1/2 top-8 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full border-4"
        style={{ borderColor: color }}
      />
      <div className="h-24 w-24">
        {data && <Lottie animationData={data} loop autoplay />}
      </div>
      <span
        className="jam-burst-pop -mt-1 inline-flex items-center gap-1 whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-extrabold text-white shadow-lg"
        style={{ backgroundColor: color }}
      >
        🔗 우리의 생각이 연결됐어요
      </span>
    </div>
  );
}

// 페이지 버튼 위에 뜨는 말풍선 메뉴 — 색상/패턴/이름변경/삭제
function PageBubble({
  page,
  x,
  top,
  bottom,
  canDelete,
  onColor,
  onPattern,
  onDelete,
  onRename,
  onClose,
}: {
  page: CanvasPage;
  x: number;
  top: number;
  bottom: number;
  canDelete: boolean;
  onColor: (c: string) => void;
  onPattern: (p: string) => void;
  onDelete: () => void;
  onRename: () => void;
  onClose: () => void;
}) {
  const W = 268;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
  const left = Math.min(Math.max(W / 2 + 8, x), vw - W / 2 - 8);
  const curColor = page.color || "#4f7cff";
  const curPattern = page.pattern ?? "none";
  // 위 공간이 부족하면(상단 근처) 아래로 뒤집어 표시
  const below = top < 320;

  return (
    <div className="fixed inset-0 z-[65]" onClick={onClose}>
      <div
        className="absolute rounded-2xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] p-3 shadow-[var(--md-sys-elevation-3)]"
        style={{
          left,
          top: below ? bottom + 12 : top,
          width: W,
          transform: below
            ? "translate(-50%, 0)"
            : "translate(-50%, calc(-100% - 12px))",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="mb-2 flex items-center justify-between gap-2">
          <button
            onClick={onRename}
            className="flex min-w-0 items-center gap-1 truncate text-sm font-bold hover:text-[var(--md-sys-color-primary)]"
            title="이름 변경"
          >
            <span className="truncate">{page.name}</span>
            <Icon name="edit" size={13} className="shrink-0 text-black/35" />
          </button>
          <button
            onClick={onClose}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-black/40 hover:bg-black/10"
            title="닫기"
          >
            <Icon name="close" size={15} />
          </button>
        </div>

        {/* 색상 */}
        <div className="flex flex-wrap gap-1.5">
          {PAGE_COLORS.map((c) => {
            const sel = curColor === c;
            return (
              <button
                key={c}
                onClick={() => onColor(c)}
                className={`flex h-7 w-7 items-center justify-center rounded-full shadow transition hover:scale-110 ${
                  sel ? "ring-2 ring-black/40" : "ring-2 ring-white"
                }`}
                style={{ backgroundColor: c }}
                title="색상"
              >
                {sel && <Icon name="check" size={14} className="text-white" />}
              </button>
            );
          })}
        </div>

        {/* 패턴 */}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {PAGE_PATTERNS.map((pt) => (
            <button
              key={pt.id}
              onClick={() => onPattern(pt.id)}
              className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
                curPattern === pt.id
                  ? "bg-[var(--md-sys-color-primary)] text-white"
                  : "border border-[var(--md-sys-color-outline)] text-black/55 hover:bg-black/5"
              }`}
            >
              {pt.label}
            </button>
          ))}
        </div>

        {/* 삭제 */}
        {canDelete && (
          <button
            onClick={onDelete}
            className="mt-2 flex w-full items-center justify-center gap-1 rounded-xl border border-[var(--md-sys-color-error)] py-1.5 text-xs font-semibold text-[var(--md-sys-color-error)] hover:bg-[var(--md-sys-color-error-container)]"
          >
            <Icon name="delete" size={15} />
            페이지 삭제
          </button>
        )}

        {/* 말풍선 꼬리 */}
        <span
          className={`absolute left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 bg-[var(--md-sys-color-surface)] ${
            below
              ? "border-l border-t border-[var(--md-sys-color-outline-variant)]"
              : "border-b border-r border-[var(--md-sys-color-outline-variant)]"
          }`}
          style={below ? { top: -6 } : { bottom: -6 }}
        />
      </div>
    </div>
  );
}

export default function CanvasPage() {
  return (
    <Suspense
      fallback={
        <main className="flex flex-1 items-center justify-center">
          <div className="animate-pulse text-sm text-black/40">불러오는 중…</div>
        </main>
      }
    >
      <CanvasInner />
    </Suspense>
  );
}
