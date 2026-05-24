"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { GlassCard } from "@/components/Glass";
import { TopBar } from "@/components/TopBar";
import { Icon } from "@/components/Icon";
import { useDialog } from "@/components/Dialog";
import { CanvasIntro } from "@/components/CanvasIntro";
import { getMyRole, watchMembers, type Role } from "@/lib/classes";
import { listGroups, type Group } from "@/lib/groups";
import {
  actorOf,
  addComment,
  deleteFeedback,
  ensureCanvas,
  REACTIONS,
  saveCanvas,
  toggleReaction,
  watchCanvas,
  watchFeedback,
  type CanvasDoc,
  type CanvasPage,
  type CardEdge,
  type CardNode,
  type Feedback,
  type ReactionType,
} from "@/lib/canvas";
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
  const [canvas, setCanvas] = useState<CanvasDoc | null>(null);
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

  // 드래그 / 연결 모드
  const dragRef = useRef<{
    nid: string;
    sx: number;
    sy: number;
    ox: number;
    oy: number;
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

  // 변경 사항 디바운스 저장
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const localDirtyRef = useRef(false);

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

  // 보드 doc 구독 (effectiveBoardId 단위) — 모둠 미선택이면 대기
  useEffect(() => {
    if (!user || !cid || groupBoardPending) {
      setCanvas(null);
      setFeedback([]);
      return;
    }
    ensureCanvas(
      cid,
      effectiveBoardId,
      isLessonBoard ? "차시 보드" : "기본 캔버스",
      lid ?? undefined
    ).catch(() => {});
    const offCanvas = watchCanvas(
      cid,
      effectiveBoardId,
      (d) => {
        if (localDirtyRef.current) return;
        setCanvas(d);
      },
      lid ?? undefined
    );
    const offFeedback = watchFeedback(
      cid,
      effectiveBoardId,
      setFeedback,
      lid ?? undefined
    );
    return () => {
      offCanvas();
      offFeedback();
    };
  }, [user, cid, lid, effectiveBoardId, isLessonBoard, groupBoardPending]);

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
    if (!cid || !canvas) return;
    const next = !canvas.groupColorMode;
    setCanvas((c) => (c ? { ...c, groupColorMode: next } : c));
    localDirtyRef.current = true;
    saveCanvas(cid, effectiveBoardId, { groupColorMode: next }, lid ?? undefined)
      .finally(() => {
        localDirtyRef.current = false;
      })
      .catch(() => {});
  }

  // 카드별 피드백 집계
  const feedbackByCard = useMemo(() => {
    const m = new Map<
      string,
      {
        comments: number;
        reactions: Record<string, { count: number; mine: boolean }>;
      }
    >();
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
    return m;
  }, [feedback, user]);

  // 변경 → 디바운스 저장
  const scheduleSave = useCallback(
    (patch: Partial<Pick<CanvasDoc, "nodes" | "edges" | "name" | "pages">>) => {
      if (!cid) return;
      localDirtyRef.current = true;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(async () => {
        try {
          await saveCanvas(cid, effectiveBoardId, patch, lid ?? undefined);
        } finally {
          localDirtyRef.current = false;
        }
      }, 500);
    },
    [cid, effectiveBoardId, lid]
  );

  const update = useCallback(
    (mut: (c: CanvasDoc) => CanvasDoc) => {
      setCanvas((cur) => {
        if (!cur) return cur;
        const next = mut(cur);
        scheduleSave({
          nodes: next.nodes,
          edges: next.edges,
          name: next.name,
          pages: next.pages,
        });
        return next;
      });
    },
    [scheduleSave]
  );

  // 활성 페이지: canvas 로드 시 첫 페이지로 보정
  useEffect(() => {
    if (canvas && !canvas.pages.some((p) => p.id === activePage)) {
      setActivePage(canvas.pages[0]?.id ?? "p1");
    }
  }, [canvas, activePage]);

  const pageOf = (pg?: string) => pg ?? canvas?.pages[0]?.id ?? "p1";
  const pageNodes = (canvas?.nodes ?? []).filter(
    (n) => pageOf(n.page) === activePage
  );
  const pageEdges = (canvas?.edges ?? []).filter((e) => {
    const a = (canvas?.nodes ?? []).find((n) => n.id === e.from);
    const b = (canvas?.nodes ?? []).find((n) => n.id === e.to);
    return (
      a && b && pageOf(a.page) === activePage && pageOf(b.page) === activePage
    );
  });

  function addPage() {
    const id = "p" + Math.random().toString(36).slice(2, 7);
    update((c) => ({
      ...c,
      pages: [
        ...c.pages,
        {
          id,
          name: `${c.pages.length + 1}페이지`,
          color: PAGE_COLORS[c.pages.length % PAGE_COLORS.length],
          pattern: "none",
        },
      ],
    }));
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
  function onBgPointerMove(e: React.PointerEvent) {
    if (dragRef.current) {
      const w = toWorld(e.clientX, e.clientY);
      const id = dragRef.current.nid;
      const nx = w.x - dragRef.current.ox;
      const ny = w.y - dragRef.current.oy;
      update((c) => ({
        ...c,
        nodes: c.nodes.map((n) => (n.id === id ? { ...n, x: nx, y: ny } : n)),
      }));
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
    dragRef.current = null;
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
        };
        update((c) => ({ ...c, edges: [...c.edges, newEdge] }));
        setPendingFrom(null);
      }
      return;
    }
    const w = toWorld(e.clientX, e.clientY);
    dragRef.current = {
      nid: n.id,
      sx: w.x,
      sy: w.y,
      ox: w.x - n.x,
      oy: w.y - n.y,
    };
    // 스테이지에 캡처 → 카드 밖으로 나가도 pointermove가 계속 도달
    stageRef.current?.setPointerCapture?.(e.pointerId);
  }

  function addTextCard() {
    if (!canvas) return;
    const el = stageRef.current!;
    const r = el.getBoundingClientRect();
    const center = toWorld(r.left + r.width / 2, r.top + r.height / 2);
    const W = 220;
    const H = 120;
    const others = (canvas.nodes ?? []).filter(
      (n) => pageOf(n.page) === activePage
    );
    const spot = findFreeSpot(others, W, H, center.x - W / 2, center.y - H / 2);
    const node: CardNode = {
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
    };
    update((c) => ({ ...c, nodes: [...c.nodes, node] }));
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
    if (!canvas) return;
    const el = stageRef.current!;
    const r = el.getBoundingClientRect();
    const center = toWorld(r.left + r.width / 2, r.top + r.height / 2);
    const W = 320;
    const H = 104;
    const others = (canvas.nodes ?? []).filter(
      (n) => pageOf(n.page) === activePage
    );
    const spot = findFreeSpot(others, W, H, center.x - W / 2, center.y - H / 2);
    const node: CardNode = {
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
    };
    update((c) => ({ ...c, nodes: [...c.nodes, node] }));
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
    update((c) => ({
      ...c,
      nodes: c.nodes.filter((n) => n.id !== nid),
      edges: c.edges.filter((e) => e.from !== nid && e.to !== nid),
    }));
  }

  async function relabelEdge(eid: string) {
    const cur = canvas?.edges.find((x) => x.id === eid);
    const label = await dialog.prompt({
      title: "연결 라벨",
      defaultValue: cur?.label ?? "",
      placeholder: "(선택)",
    });
    if (label === null) return;
    update((c) => ({
      ...c,
      edges: c.edges.map((e) => (e.id === eid ? { ...e, label } : e)),
    }));
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
    update((c) => ({ ...c, edges: c.edges.filter((e) => e.id !== eid) }));
  }

  // 카드 좌표(화살표 끝점 계산용)
  const nodeMap = useMemo(() => {
    const m = new Map<string, CardNode>();
    for (const n of canvas?.nodes ?? []) m.set(n.id, n);
    return m;
  }, [canvas]);

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
          {canEdit && (
            <>
              <button
                onClick={addTextCard}
                className="ml-3 inline-flex items-center gap-1 rounded-full border border-[var(--md-sys-color-outline)] px-3 py-1.5 text-xs font-medium text-[var(--md-sys-color-primary)] hover:bg-[color-mix(in_srgb,var(--md-sys-color-primary)_8%,transparent)]"
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
            </>
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
          {isTeacher && isLessonBoard && (
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
              update((cv) => ({
                ...cv,
                pages: cv.pages.map((x) =>
                  x.id === pageMenu.id ? { ...x, color } : x
                ),
              }))
            }
            onPattern={(pattern) =>
              update((cv) => ({
                ...cv,
                pages: cv.pages.map((x) =>
                  x.id === pageMenu.id ? { ...x, pattern } : x
                ),
              }))
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
              update((c) => {
                const removed = new Set(
                  c.nodes
                    .filter((n) => pageOf(n.page) === pid)
                    .map((n) => n.id)
                );
                return {
                  ...c,
                  pages: c.pages.filter((p) => p.id !== pid),
                  nodes: c.nodes.filter((n) => pageOf(n.page) !== pid),
                  edges: c.edges.filter(
                    (e) => !removed.has(e.from) && !removed.has(e.to)
                  ),
                };
              });
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
              update((c) => ({
                ...c,
                pages: c.pages.map((x) =>
                  x.id === pageMenu.id ? { ...x, name: name.trim() } : x
                ),
              }));
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
            {/* SVG 화살표 레이어 */}
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
                  <path d="M0,0 L10,5 L0,10 z" fill="rgba(80,90,120,0.6)" />
                </marker>
              </defs>
              {pageEdges.map((e) => {
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
                      stroke="rgba(80,90,120,0.55)"
                      strokeWidth={2}
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

            {/* 카드 레이어 */}
            {pageNodes.map((n) => (
              <CardView
                key={n.id}
                n={n}
                isTeacher={
                  isTeacher || (canEdit && n.authorUid === user?.uid)
                }
                isFrom={pendingFrom === n.id}
                connectMode={connectMode}
                authorName={
                  (n.authorUid && authorMap[n.authorUid]?.name) ||
                  n.authorName ||
                  ""
                }
                authorPhoto={
                  (n.authorUid && authorMap[n.authorUid]?.photo) || ""
                }
                groupColor={
                  groupColorMode
                    ? groupInfo[n.authorUid ?? ""]?.color
                    : undefined
                }
                groupName={
                  groupColorMode
                    ? groupInfo[n.authorUid ?? ""]?.name
                    : undefined
                }
                commentCount={feedbackByCard.get(n.id)?.comments ?? 0}
                reactions={feedbackByCard.get(n.id)?.reactions ?? {}}
                onToggleReaction={(type) => {
                  const mine =
                    feedbackByCard.get(n.id)?.reactions[type]?.mine ?? false;
                  toggleReaction(
                    cid,
                    effectiveBoardId,
                    n.id,
                    actor,
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
                }}
                onOpenComments={(rect) =>
                  setCommentPop({
                    cardId: n.id,
                    x: rect.right,
                    y: rect.bottom,
                  })
                }
                canSendMap={isTeacher && isLessonBoard}
                checked={selected.has(n.id)}
                onToggleCheck={() =>
                  setSelected((s) => {
                    const next = new Set(s);
                    if (next.has(n.id)) next.delete(n.id);
                    else next.add(n.id);
                    return next;
                  })
                }
                onSendToMap={
                  isTeacher && isLessonBoard && n.kind === "text"
                    ? () => sendCardsToMap([n])
                    : undefined
                }
                onPointerDown={(e) => onCardPointerDown(e, n)}
                onChangeText={(t) =>
                  update((c) => ({
                    ...c,
                    nodes: c.nodes.map((x) =>
                      x.id === n.id ? { ...x, text: t } : x
                    ),
                  }))
                }
                onResize={(h) => {
                  if (Math.abs(h - n.h) > 2)
                    update((c) => ({
                      ...c,
                      nodes: c.nodes.map((x) =>
                        x.id === n.id ? { ...x, h } : x
                      ),
                    }));
                }}
                onDelete={() => deleteCard(n.id)}
              />
            ))}
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
          휠=줌 · 배경 드래그=이동 · 카드 드래그=재배치 · 연결 모드에서 카드 두
          개 차례로 클릭=화살표 · 화살표 클릭=라벨 · 화살표 더블클릭=삭제
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
            className="m3-field max-h-24 flex-1 resize-none !py-1.5 !text-sm"
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

function CardView({
  n,
  isTeacher,
  isFrom,
  connectMode,
  authorName,
  authorPhoto,
  groupColor,
  groupName,
  commentCount,
  reactions,
  onToggleReaction,
  onOpenComments,
  canSendMap,
  checked,
  onToggleCheck,
  onPointerDown,
  onChangeText,
  onResize,
  onDelete,
  onSendToMap,
}: {
  n: CardNode;
  isTeacher: boolean;
  isFrom: boolean;
  connectMode: boolean;
  authorName: string;
  authorPhoto: string;
  groupColor?: string;
  groupName?: string;
  commentCount: number;
  reactions: Record<string, { count: number; mine: boolean }>;
  onToggleReaction: (type: ReactionType) => void;
  onOpenComments: (rect: DOMRect) => void;
  canSendMap: boolean;
  checked: boolean;
  onToggleCheck: () => void;
  onPointerDown: (e: React.PointerEvent) => void;
  onChangeText: (t: string) => void;
  onResize?: (h: number) => void;
  onDelete: () => void;
  onSendToMap?: () => void;
}) {
  const HANDLE = 28;
  const MIN_H = n.kind === "link" ? 84 : 96;
  const selectable = canSendMap && n.kind === "text";

  const rootRef = useRef<HTMLDivElement | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const onResizeRef = useRef(onResize);
  onResizeRef.current = onResize;

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
      onResizeRef.current?.(Math.round(el.offsetHeight));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const highlighted = isFrom || (checked && selectable);
  return (
    <div
      ref={rootRef}
      style={{
        left: n.x,
        top: n.y,
        width: n.w,
        minHeight: MIN_H,
        ...(groupColor && !highlighted
          ? {
              borderColor: groupColor,
              boxShadow: `0 0 0 2px color-mix(in srgb, ${groupColor} 35%, transparent)`,
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
      {/* 선택 체크박스 (교사·차시 보드) */}
      {selectable && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleCheck();
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
          onPointerDown={onPointerDown}
          style={{ height: HANDLE }}
          className="group/bar flex shrink-0 cursor-grab items-center gap-1.5 border-b border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-high)] px-3 active:cursor-grabbing"
          title="끌어서 이동"
        >
          {/* 신호등 버튼 */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            onPointerDown={(e) => e.stopPropagation()}
            className="flex h-3 w-3 items-center justify-center rounded-full bg-[#ff5f57] ring-1 ring-black/10"
            title="카드 삭제"
          >
            <Icon
              name="close"
              size={8}
              className="text-black/55 opacity-0 transition group-hover/bar:opacity-100"
            />
          </button>
          <span className="h-3 w-3 rounded-full bg-[#febc2e] ring-1 ring-black/10" />
          <span className="h-3 w-3 rounded-full bg-[#28c840] ring-1 ring-black/10" />

          {n.kind === "text" && onSendToMap && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSendToMap();
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
            onChange={(e) => onChangeText(e.target.value)}
            placeholder="텍스트…"
            rows={1}
            className="block min-h-[56px] w-full resize-none overflow-hidden whitespace-pre-wrap break-words bg-transparent p-3 text-sm leading-relaxed outline-none"
          />
        ) : (
          <div className="w-full whitespace-pre-wrap break-words p-3 text-sm leading-relaxed">
            {n.text}
          </div>
        )}

        {/* 연결 모드: 카드 전체를 클릭 타깃으로 덮음 */}
        {connectMode && (
          <div
            onPointerDown={onPointerDown}
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
                onToggleReaction(r.type);
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
            onOpenComments(e.currentTarget.getBoundingClientRect());
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
}

function normUrlSafe(u: string) {
  const s = (u || "").trim();
  if (!s) return "#";
  if (/^(https?:|mailto:|tel:)/i.test(s)) return s;
  return "https://" + s.replace(/^\/+/, "");
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
