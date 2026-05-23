"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";
import { Icon } from "@/components/Icon";
import { useAuth } from "@/contexts/AuthContext";
import { useDialog } from "@/components/Dialog";
import { createShare } from "@/lib/shares";
import type { Ontology, OntologyNode } from "@/lib/lessons";

/**
 * 인터랙티브 지식 그래프 (의존성 없는 SVG + 자체 force 시뮬레이션).
 * - 실시간 물리: 반발 + 스프링 + 충돌(겹침 방지) + 약한 중심 인력
 * - 줌(휠) · 팬(배경 드래그) · 노드 드래그
 * - 노드 클릭 → 상세 패널(관계·언급 학생 수·기여자·근거)
 * - 호버 시 이웃 강조
 */

const SENT_COLOR: Record<string, string> = {
  positive: "#23b27a",
  neutral: "#4f7cff",
  negative: "#ff6f91",
};
const SENT_LABEL: Record<string, string> = {
  positive: "긍정",
  neutral: "중립",
  negative: "부정",
};

// 공유도(중첩 학생 수) → 선명한 다색 스펙트럼
// 적음=보라 → 청록 → 초록 → 주황 → 많음=빨강 (모두 채도 높음, 무채색 없음)
function shareColor(sc: number, max: number): string {
  const t = max <= 1 ? 0 : Math.min(1, Math.max(0, (sc - 1) / (max - 1)));
  const hue = 270 - t * 270; // 270(보라) → 0(빨강)
  return `hsl(${Math.round(hue)}, 80%, 52%)`;
}

const W = 1000;
const H = 640;

type SimNode = SimulationNodeDatum & {
  id: string;
  imp: number;
  x: number;
  y: number;
};
type SimLink = SimulationLinkDatum<SimNode>;

function radius(n: OntologyNode) {
  return 16 + Math.min(28, (n.weight ?? 1) * 1.8);
}

// 중요도(중첩 학생 수 + 연결 수)에 따른 반지름 — 옵시디언처럼 허브가 크고 잎이 작게
function radiusFromImp(imp: number) {
  return 10 + Math.min(46, imp * 3);
}
// 사용자 선택 크기기준 정규화 반지름 (시각용)
function radiusFromSize(v: number, max: number) {
  return 8 + Math.min(46, (v / Math.max(1, max)) * 46);
}

export function GraphView({
  data,
  studentNames,
  height = 460,
  title = "지식맵",
  nodeColor,
}: {
  data: Ontology;
  studentNames?: Record<string, string>;
  height?: number;
  title?: string;
  /** 노드 색을 강제로 지정(사전/사후 비교 등). 반환 없으면 기본 색 사용 */
  nodeColor?: (n: OntologyNode) => string | undefined;
}) {
  const nodes = useMemo(() => data.nodes ?? [], [data]);
  const edges = useMemo(
    () =>
      (data.edges ?? []).filter(
        (e) =>
          nodes.some((n) => n.id === e.source) &&
          nodes.some((n) => n.id === e.target)
      ),
    [data, nodes]
  );

  const idx = useMemo(
    () => new Map(nodes.map((n, i) => [n.id, i])),
    [nodes]
  );

  // 상태 선언 (memo 들이 참조하므로 위쪽에 둠)
  const [selected, setSelected] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [colorMode, setColorMode] = useState<
    "sentiment" | "shared" | "group"
  >("sentiment");
  const [panelOpen, setPanelOpen] = useState(false);
  const [repulsionK, setRepulsionK] = useState(28000);
  const [centerForce, setCenterForce] = useState(0.0018);
  const [springK, setSpringK] = useState(0.018);
  const [springLen, setSpringLen] = useState(110);
  const [search, setSearch] = useState("");
  const [localOnly, setLocalOnly] = useState(false);
  const [localDepth, setLocalDepth] = useState(1);
  const [showArrows, setShowArrows] = useState(true);
  const [labelOpacity, setLabelOpacity] = useState(1);
  const [hideIsolated, setHideIsolated] = useState(false);
  const [sizeMode, setSizeMode] = useState<
    "importance" | "degree" | "sources"
  >("importance");
  const [groupRules, setGroupRules] = useState<
    { query: string; color: string }[]
  >([]);

  // 연결도(degree) — 시뮬·시각 위계에 사용
  const degree = useMemo(() => {
    const deg = new Array(nodes.length).fill(0);
    for (const e of edges) {
      const i = idx.get(e.source);
      const j = idx.get(e.target);
      if (i != null) deg[i]++;
      if (j != null) deg[j]++;
    }
    return deg;
  }, [nodes, edges, idx]);
  // 중요도 = 언급 학생 수 + 연결도. 허브가 중심으로 모이도록 사용.
  const importance = useMemo(
    () =>
      nodes.map(
        (n, i) =>
          (n.sourceCount ?? n.sources?.length ?? 1) + degree[i]
      ),
    [nodes, degree]
  );
  const maxImp = useMemo(
    () => Math.max(1, ...importance),
    [importance]
  );
  // 크기 기준(중요도/연결도/언급수)
  const sizeVal = useMemo(
    () =>
      nodes.map((n, i) =>
        sizeMode === "degree"
          ? degree[i]
          : sizeMode === "sources"
            ? n.sourceCount ?? n.sources?.length ?? 0
            : importance[i]
      ),
    [nodes, degree, importance, sizeMode]
  );
  const maxSize = useMemo(
    () => Math.max(1, ...sizeVal),
    [sizeVal]
  );
  // 인접 맵 (로컬 그래프 BFS)
  const adj = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const n of nodes) m.set(n.id, new Set());
    for (const e of edges) {
      m.get(e.source)?.add(e.target);
      m.get(e.target)?.add(e.source);
    }
    return m;
  }, [nodes, edges]);
  // 검색 매칭 노드
  const matchedIds = useMemo(() => {
    const q = search.trim();
    if (!q) return null;
    const set = new Set<string>();
    for (const n of nodes) {
      if ((n.label || n.id).includes(q)) set.add(n.id);
    }
    return set;
  }, [search, nodes]);
  // 로컬 그래프: 선택 노드의 깊이 N 이웃
  const localIds = useMemo(() => {
    if (!localOnly || !selected) return null;
    const seen = new Set<string>([selected]);
    let frontier = [selected];
    for (let d = 0; d < localDepth; d++) {
      const next: string[] = [];
      for (const x of frontier) {
        for (const y of adj.get(x) ?? []) {
          if (!seen.has(y)) {
            seen.add(y);
            next.push(y);
          }
        }
      }
      frontier = next;
    }
    return seen;
  }, [localOnly, selected, localDepth, adj]);
  // 그룹 색상 매핑
  function groupColorOf(label: string): string | null {
    for (const r of groupRules) {
      if (r.query.trim() && label.includes(r.query.trim())) return r.color;
    }
    return null;
  }

  // 위치 (d3-force 가 직접 갱신하는 노드 배열)
  const posRef = useRef<SimNode[]>([]);
  const [, force] = useState(0); // 리렌더 트리거
  const rerender = useCallback(() => force((v) => (v + 1) % 1_000_000), []);

  // d3 시뮬레이션 제어
  const simRef = useRef<Simulation<SimNode, SimLink> | null>(null);
  const linksRef = useRef<SimLink[]>([]);
  const dragRef = useRef<{ i: number; moved: boolean } | null>(null);
  const tickFrameRef = useRef(0);

  // 뷰포트 (줌/팬)
  const [view, setView] = useState({ scale: 1, tx: 0, ty: 0 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const panRef = useRef<{ x: number; y: number } | null>(null);

  const maxShare = useMemo(
    () =>
      Math.max(
        1,
        ...(data.nodes ?? []).map(
          (n) => n.sourceCount ?? n.sources?.length ?? 1
        )
      ),
    [data]
  );
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [dlOpen, setDlOpen] = useState(false);
  const { user } = useAuth();
  const dialog = useDialog();
  const [sharing, setSharing] = useState(false);

  const kick = useCallback((a = 0.7) => {
    const sim = simRef.current;
    if (sim) sim.alpha(Math.max(sim.alpha(), a)).restart();
  }, []);

  // d3-force 시뮬레이션 구성 (노드/엣지 변경 시 재구성)
  useEffect(() => {
    // 기존 위치 보존(같은 id면 이어쓰기) — 부드러운 갱신
    const prev = new Map(posRef.current.map((p) => [p.id, p]));
    const simNodes: SimNode[] = nodes.map((nd, i) => {
      const old = prev.get(nd.id);
      return {
        id: nd.id,
        imp: importance[i],
        x: old?.x ?? W / 2 + (Math.random() - 0.5) * 200,
        y: old?.y ?? H / 2 + (Math.random() - 0.5) * 200,
      };
    });
    const byId = new Map(simNodes.map((s) => [s.id, s]));
    const simLinks: SimLink[] = edges
      .filter((e) => byId.has(e.source) && byId.has(e.target))
      .map((e) => ({ source: e.source, target: e.target }));
    posRef.current = simNodes;
    linksRef.current = simLinks;

    const sim = forceSimulation<SimNode>(simNodes)
      .force(
        "charge",
        forceManyBody<SimNode>().strength(-repulsionK / 100)
      )
      .force(
        "link",
        forceLink<SimNode, SimLink>(simLinks)
          .id((d) => d.id)
          .distance(springLen)
          .strength(Math.min(1, springK * 8))
      )
      .force(
        "collide",
        forceCollide<SimNode>().radius(
          (d) => radiusFromImp(d.imp) + 14
        )
      )
      .force("x", forceX<SimNode>(W / 2).strength(centerForce * 22))
      .force("y", forceY<SimNode>(H / 2).strength(centerForce * 22))
      .velocityDecay(0.42);

    sim.on("tick", () => {
      tickFrameRef.current++;
      if (dragRef.current || tickFrameRef.current % 2 === 0) rerender();
    });
    sim.on("end", () => rerender());
    simRef.current = sim;
    setSelected(null);
    setHover(null);
    setView({ scale: 1, tx: 0, ty: 0 });

    return () => {
      sim.stop();
      simRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges]);

  // 슬라이더 변경 → 힘만 갱신(재구성 X)
  useEffect(() => {
    const sim = simRef.current;
    if (!sim) return;
    (sim.force("charge") as ReturnType<typeof forceManyBody> | null)?.strength(
      -repulsionK / 100
    );
    const lf = sim.force("link") as ReturnType<
      typeof forceLink<SimNode, SimLink>
    > | null;
    lf?.distance(springLen).strength(Math.min(1, springK * 8));
    (sim.force("x") as ReturnType<typeof forceX> | null)?.strength(
      centerForce * 22
    );
    (sim.force("y") as ReturnType<typeof forceY> | null)?.strength(
      centerForce * 22
    );
    sim.alpha(0.5).restart();
  }, [repulsionK, centerForce, springK, springLen]);

  /* ---------- 좌표 변환 (화면 → 월드) ---------- */
  const toWorld = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const r = svg.getBoundingClientRect();
    const sx = ((clientX - r.left) / r.width) * W;
    const sy = ((clientY - r.top) / r.height) * H;
    const v = viewRef.current;
    return { x: (sx - v.tx) / v.scale, y: (sy - v.ty) / v.scale };
  }, []);

  /* ---------- 포인터: 노드 드래그 / 배경 팬 ---------- */
  function onNodePointerDown(e: React.PointerEvent, i: number) {
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    dragRef.current = { i, moved: false };
    const p = posRef.current[i];
    if (p) {
      p.fx = p.x;
      p.fy = p.y;
    }
    simRef.current?.alphaTarget(0.3).restart();
  }
  function onBgPointerDown(e: React.PointerEvent) {
    panRef.current = { x: e.clientX, y: e.clientY };
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (dragRef.current) {
      const w = toWorld(e.clientX, e.clientY);
      const p = posRef.current[dragRef.current.i];
      if (p) {
        p.fx = w.x;
        p.fy = w.y;
        dragRef.current.moved = true;
      }
      return;
    }
    if (panRef.current) {
      const dx = e.clientX - panRef.current.x;
      const dy = e.clientY - panRef.current.y;
      panRef.current = { x: e.clientX, y: e.clientY };
      const svg = svgRef.current;
      const rw = svg ? svg.getBoundingClientRect().width : W;
      const k = W / Math.max(1, rw);
      setView((v) => ({ ...v, tx: v.tx + dx * k, ty: v.ty + dy * k }));
    }
  }
  function onPointerUp() {
    panRef.current = null;
    if (dragRef.current) {
      const p = posRef.current[dragRef.current.i];
      if (p) {
        p.fx = null;
        p.fy = null;
      }
      simRef.current?.alphaTarget(0);
      dragRef.current = null;
    }
  }

  /* ---------- 줌 (휠, 커서 기준) ---------- */
  function onWheel(e: React.WheelEvent) {
    e.preventDefault();
    const w = toWorld(e.clientX, e.clientY);
    setView((v) => {
      const scale = Math.max(
        0.35,
        Math.min(4, v.scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15))
      );
      // 커서 아래 월드 좌표가 고정되도록 tx,ty 보정
      const svg = svgRef.current;
      const r = svg?.getBoundingClientRect();
      const sx = r ? ((e.clientX - r.left) / r.width) * W : W / 2;
      const sy = r ? ((e.clientY - r.top) / r.height) * H : H / 2;
      return { scale, tx: sx - w.x * scale, ty: sy - w.y * scale };
    });
  }

  function zoomBy(f: number) {
    setView((v) => {
      const scale = Math.max(0.35, Math.min(4, v.scale * f));
      const cx = W / 2;
      const cy = H / 2;
      const wx = (cx - v.tx) / v.scale;
      const wy = (cy - v.ty) / v.scale;
      return { scale, tx: cx - wx * scale, ty: cy - wy * scale };
    });
  }
  function resetView() {
    setView({ scale: 1, tx: 0, ty: 0 });
    kick();
  }

  const neighborIds = useMemo(() => {
    const key = hover ?? selected;
    if (!key) return null;
    const set = new Set<string>([key]);
    for (const e of edges) {
      if (e.source === key) set.add(e.target);
      if (e.target === key) set.add(e.source);
    }
    return set;
  }, [hover, selected, edges]);

  const selNode = nodes.find((n) => n.id === selected) ?? null;
  const selEdges = useMemo(
    () =>
      selected
        ? edges
            .filter((e) => e.source === selected || e.target === selected)
            .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))
        : [],
    [edges, selected]
  );

  const nameOf = useCallback(
    (sid: string) => studentNames?.[sid] ?? sid,
    [studentNames]
  );

  if (!nodes.length) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-black/40">
        그래프 데이터가 없습니다.
      </div>
    );
  }

  const pos = posRef.current;

  // ---------- 내보내기 (HTML / SVG / PNG) ----------
  function colorOf(nd: OntologyNode): string {
    if (colorMode === "group") return groupColorOf(nd.label || nd.id) ?? "#9ca3af";
    if (colorMode === "shared")
      return shareColor(nd.sourceCount ?? nd.sources?.length ?? 1, maxShare);
    return SENT_COLOR[nd.sentiment] ?? SENT_COLOR.neutral;
  }
  function xmlEsc(s: string): string {
    return s.replace(/[<>&'"]/g, (c) =>
      c === "<"
        ? "&lt;"
        : c === ">"
          ? "&gt;"
          : c === "&"
            ? "&amp;"
            : c === "'"
              ? "&apos;"
              : "&quot;"
    );
  }
  // 현재 시뮬레이션 위치 기준의 깔끔한 독립 SVG 문자열(전체 맞춤, 모든 라벨 표시)
  function buildSvg(): string {
    const PAD = 80;
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    nodes.forEach((nd, i) => {
      const p = pos[i];
      if (!p) return;
      const r = radiusFromSize(sizeVal[i], maxSize) + 24;
      minX = Math.min(minX, p.x - r);
      minY = Math.min(minY, p.y - r);
      maxX = Math.max(maxX, p.x + r);
      maxY = Math.max(maxY, p.y + r);
    });
    if (!isFinite(minX)) {
      minX = 0;
      minY = 0;
      maxX = W;
      maxY = H;
    }
    const vbX = minX - PAD;
    const vbY = minY - PAD - 36;
    const vbW = maxX - minX + PAD * 2;
    const vbH = maxY - minY + PAD * 2 + 36;

    const edgeSvg = edges
      .map((e) => {
        const a = pos[idx.get(e.source)!];
        const b = pos[idx.get(e.target)!];
        if (!a || !b) return "";
        const sw = 1 + Math.min(5, (e.weight ?? 1) / 2.5);
        const lbl = e.relation
          ? `<text x="${(a.x + b.x) / 2}" y="${
              (a.y + b.y) / 2 - 4
            }" text-anchor="middle" font-size="11" fill="rgba(60,70,90,0.6)">${xmlEsc(
              e.relation
            )}</text>`
          : "";
        return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="rgba(80,90,120,0.4)" stroke-width="${sw}" marker-end="url(#exp-arrow)"/>${lbl}`;
      })
      .join("");

    const nodeSvg = nodes
      .map((nd, i) => {
        const p = pos[i];
        if (!p) return "";
        const r = radiusFromSize(sizeVal[i], maxSize);
        const c = colorOf(nd);
        const tImp = importance[i] / maxImp;
        const isHub = tImp >= 0.6;
        const fillOp = colorMode === "shared" ? 0.7 : 0.22;
        const badge =
          (nd.sourceCount ?? 0) > 0
            ? `<circle cx="${p.x + r * 0.72}" cy="${p.y - r * 0.72}" r="9" fill="${c}"/><text x="${
                p.x + r * 0.72
              }" y="${
                p.y - r * 0.72 + 3.5
              }" text-anchor="middle" font-size="10" font-weight="700" fill="#fff">${nd.sourceCount}</text>`
            : "";
        const label = `<text x="${p.x}" y="${p.y + r + 14}" text-anchor="middle" font-size="${
          isHub ? 14 : 12
        }" font-weight="${isHub ? 700 : 500}" fill="#1b1b1f">${xmlEsc(
          nd.label || nd.id
        )}</text>`;
        return `<circle cx="${p.x}" cy="${p.y}" r="${r}" fill="${c}" fill-opacity="${fillOp}" stroke="${c}" stroke-width="2"/>${badge}${label}`;
      })
      .join("");

    const stamp = new Date().toLocaleString("ko-KR");
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vbX} ${vbY} ${vbW} ${vbH}" font-family="Pretendard, system-ui, sans-serif">
<defs><marker id="exp-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="rgba(80,90,120,0.5)"/></marker></defs>
<rect x="${vbX}" y="${vbY}" width="${vbW}" height="${vbH}" fill="#ffffff"/>
<text x="${vbX + 16}" y="${vbY + 24}" font-size="16" font-weight="800" fill="#1b1b1f">${xmlEsc(
      title
    )}</text>
<text x="${vbX + vbW - 16}" y="${vbY + 24}" text-anchor="end" font-size="11" fill="#9aa0a6">개념 ${
      nodes.length
    } · 연결 ${edges.length} · ${stamp}</text>
${edgeSvg}
${nodeSvg}
</svg>`;
  }

  function fileBase(): string {
    return (
      title.replace(/[\\/:*?"<>|]+/g, "_").slice(0, 60) || "knowledge-map"
    );
  }
  function triggerDownload(blob: Blob, ext: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${fileBase()}.${ext}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setDlOpen(false);
  }
  function exportSvg() {
    triggerDownload(
      new Blob([buildSvg()], { type: "image/svg+xml;charset=utf-8" }),
      "svg"
    );
  }
  // 인터랙티브 HTML: 현재 배치를 그대로 담되 줌·이동·노드 드래그·클릭 상세 지원
  function exportHtml() {
    const expNodes = nodes.map((nd, i) => {
      const p = pos[i] ?? { x: 0, y: 0 };
      return {
        id: nd.id,
        x: Math.round(p.x),
        y: Math.round(p.y),
        r: Math.round(radiusFromSize(sizeVal[i], maxSize)),
        color: colorOf(nd),
        label: nd.label || nd.id,
        type: nd.type,
        sentiment: nd.sentiment,
        sc: nd.sourceCount ?? nd.sources?.length ?? 0,
        hub: maxImp ? importance[i] / maxImp >= 0.6 : false,
        by: (nd.sources ?? []).map((s) => nameOf(s)),
      };
    });
    const expEdges = edges.map((e) => ({
      s: e.source,
      t: e.target,
      rel: e.relation || "",
    }));
    const payload = JSON.stringify({ nodes: expNodes, edges: expEdges }).replace(
      /</g,
      "\\u003c"
    );

    const SCRIPT = `(function(){
var G=JSON.parse(document.getElementById('gdata').textContent);
var NS='http://www.w3.org/2000/svg',svg=document.getElementById('svg'),vp=document.getElementById('vp');
var byId={};G.nodes.forEach(function(n){byId[n.id]=n;});
var adj={};G.nodes.forEach(function(n){adj[n.id]={};});
var edgeEls=[];
G.edges.forEach(function(e){var a=byId[e.s],b=byId[e.t];if(!a||!b)return;adj[e.s][e.t]=1;adj[e.t][e.s]=1;
var ln=document.createElementNS(NS,'path');ln.setAttribute('fill','none');ln.setAttribute('stroke','rgba(80,90,120,0.4)');ln.setAttribute('stroke-width','1.5');vp.appendChild(ln);
var tx=null;if(e.rel){tx=document.createElementNS(NS,'text');tx.setAttribute('text-anchor','middle');tx.setAttribute('font-size','11');tx.setAttribute('fill','rgba(60,70,90,0.65)');tx.textContent=e.rel;vp.appendChild(tx);}
edgeEls.push({e:e,ln:ln,tx:tx});});
var nodeEls={};
G.nodes.forEach(function(n){var g=document.createElementNS(NS,'g');g.style.cursor='grab';
var c=document.createElementNS(NS,'circle');c.setAttribute('r',n.r);c.setAttribute('fill',n.color);c.setAttribute('fill-opacity','0.22');c.setAttribute('stroke',n.color);c.setAttribute('stroke-width','2');g.appendChild(c);
var badge=null,bt=null;if(n.sc>0){badge=document.createElementNS(NS,'circle');badge.setAttribute('r','9');badge.setAttribute('fill',n.color);g.appendChild(badge);bt=document.createElementNS(NS,'text');bt.setAttribute('text-anchor','middle');bt.setAttribute('font-size','10');bt.setAttribute('font-weight','700');bt.setAttribute('fill','#fff');bt.textContent=n.sc;g.appendChild(bt);}
var t=document.createElementNS(NS,'text');t.setAttribute('text-anchor','middle');t.setAttribute('font-size',n.hub?14:12);t.setAttribute('font-weight',n.hub?'700':'500');t.setAttribute('fill','#1b1b1f');t.textContent=n.label;g.appendChild(t);
vp.appendChild(g);nodeEls[n.id]={g:g,c:c,t:t,badge:badge,bt:bt};
g.addEventListener('pointerdown',function(ev){ev.stopPropagation();sd(ev,n);});
g.addEventListener('click',function(ev){ev.stopPropagation();det(n);});
g.addEventListener('mouseenter',function(){hi(n.id);});
g.addEventListener('mouseleave',function(){hi(null);});});
function place(){edgeEls.forEach(function(o){var a=byId[o.e.s],b=byId[o.e.t];var dx=b.x-a.x,dy=b.y-a.y,h=Math.abs(dx)>=Math.abs(dy);var c1x=h?a.x+dx*0.45:a.x,c1y=h?a.y:a.y+dy*0.45,c2x=h?b.x-dx*0.45:b.x,c2y=h?b.y:b.y-dy*0.45;o.ln.setAttribute('d','M '+a.x+' '+a.y+' C '+c1x+' '+c1y+' '+c2x+' '+c2y+' '+b.x+' '+b.y);if(o.tx){o.tx.setAttribute('x',(a.x+b.x)/2);o.tx.setAttribute('y',(a.y+b.y)/2-4);}});
G.nodes.forEach(function(n){var el=nodeEls[n.id];el.c.setAttribute('cx',n.x);el.c.setAttribute('cy',n.y);el.t.setAttribute('x',n.x);el.t.setAttribute('y',n.y+n.r+14);if(el.badge){el.badge.setAttribute('cx',n.x+n.r*0.72);el.badge.setAttribute('cy',n.y-n.r*0.72);el.bt.setAttribute('x',n.x+n.r*0.72);el.bt.setAttribute('y',n.y-n.r*0.72+3.5);}});}
var view={s:1,tx:0,ty:0};
function apply(){vp.setAttribute('transform','translate('+view.tx+','+view.ty+') scale('+view.s+')');}
function toW(cx,cy){var r=svg.getBoundingClientRect();return{x:(cx-r.left-view.tx)/view.s,y:(cy-r.top-view.ty)/view.s};}
function fit(){var mnx=1e9,mny=1e9,mxx=-1e9,mxy=-1e9;G.nodes.forEach(function(n){mnx=Math.min(mnx,n.x-n.r);mny=Math.min(mny,n.y-n.r);mxx=Math.max(mxx,n.x+n.r);mxy=Math.max(mxy,n.y+n.r);});if(mnx>mxx)return;var r=svg.getBoundingClientRect(),pad=70;var s=Math.min((r.width-pad*2)/((mxx-mnx)||1),(r.height-pad*2)/((mxy-mny)||1));s=Math.max(0.2,Math.min(2,s));view.s=s;view.tx=(r.width-(mxx+mnx)*s)/2;view.ty=(r.height-(mxy+mny)*s)/2;apply();}
var pan=null,drag=null;
svg.addEventListener('pointerdown',function(ev){pan={x:ev.clientX,y:ev.clientY};});
window.addEventListener('pointermove',function(ev){if(drag){var p=toW(ev.clientX,ev.clientY);drag.n.x=p.x-drag.ox;drag.n.y=p.y-drag.oy;place();return;}if(pan){view.tx+=ev.clientX-pan.x;view.ty+=ev.clientY-pan.y;pan={x:ev.clientX,y:ev.clientY};apply();}});
window.addEventListener('pointerup',function(){pan=null;drag=null;});
svg.addEventListener('click',function(){det(null);});
svg.addEventListener('wheel',function(ev){ev.preventDefault();var r=svg.getBoundingClientRect(),mx=ev.clientX-r.left,my=ev.clientY-r.top,w=toW(ev.clientX,ev.clientY);var ns=Math.max(0.15,Math.min(5,view.s*(ev.deltaY<0?1.12:1/1.12)));view.s=ns;view.tx=mx-w.x*ns;view.ty=my-w.y*ns;apply();},{passive:false});
function sd(ev,n){var p=toW(ev.clientX,ev.clientY);drag={n:n,ox:p.x-n.x,oy:p.y-n.y};}
function hi(id){G.nodes.forEach(function(n){var on=id===null||n.id===id||adj[id][n.id];nodeEls[n.id].g.style.opacity=on?'1':'0.15';});edgeEls.forEach(function(o){var on=id===null||o.e.s===id||o.e.t===id;o.ln.style.opacity=on?'1':'0.06';if(o.tx)o.tx.style.opacity=on?'1':'0.06';});}
var SENT={positive:'긍정',neutral:'중립',negative:'부정'},TYP={concept:'개념',keyword:'키워드',emotion:'감정'};
function esc(s){return String(s).replace(/[<>&]/g,function(c){return c==='<'?'&lt;':c==='>'?'&gt;':'&amp;';});}
function det(n){var d=document.getElementById('detail');if(!n){d.style.display='none';return;}var by=n.by&&n.by.length?'<div class="row"><b>기여 학생</b> '+n.by.map(esc).join(', ')+'</div>':'';d.innerHTML='<button id="dx">✕</button><h3>'+esc(n.label)+'</h3><div class="tags"><span>'+(TYP[n.type]||n.type)+'</span><span>'+(SENT[n.sentiment]||'')+'</span>'+(n.sc?'<span>학생 '+n.sc+'명</span>':'')+'</div>'+by;d.style.display='block';document.getElementById('dx').addEventListener('click',function(){det(null);});}
place();fit();
})();`;

    const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${xmlEsc(title)} — 지식맵</title>
<style>*{box-sizing:border-box}html,body{margin:0;height:100%;font-family:Pretendard,system-ui,-apple-system,sans-serif;background:#f4f5f7}
header{position:fixed;top:0;left:0;right:0;height:52px;display:flex;align-items:baseline;gap:12px;padding:0 18px;background:#fff;border-bottom:1px solid #e7e8ec;z-index:5}
header h1{font-size:15px;margin:0;font-weight:800;align-self:center}header .sub{font-size:12px;color:#9aa0a6}
#svg{position:fixed;top:52px;left:0;width:100%;height:calc(100% - 52px);touch-action:none;cursor:grab;background:radial-gradient(circle,rgba(0,0,0,.05) 1px,transparent 1px);background-size:24px 24px}
#svg:active{cursor:grabbing}
#detail{position:fixed;right:16px;bottom:16px;width:264px;max-height:62%;overflow:auto;background:#fff;border-radius:16px;box-shadow:0 8px 30px rgba(0,0,0,.18);padding:16px;z-index:6}
#detail h3{margin:0 0 8px;font-size:15px}#detail .tags{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px}
#detail .tags span{background:#eef0f4;border-radius:999px;padding:2px 8px;font-size:11px}
#detail .row{font-size:12px;color:#555;margin-top:6px;line-height:1.5}#detail #dx{float:right;border:0;background:transparent;cursor:pointer;font-size:14px;color:#999}
.hint{position:fixed;left:16px;bottom:12px;font-size:11px;color:#9aa0b5;z-index:5}</style></head>
<body>
<header><h1>${xmlEsc(title)}</h1><span class="sub">개념 ${
      nodes.length
    } · 연결 ${edges.length} · ${new Date().toLocaleString("ko-KR")}</span></header>
<svg id="svg"><g id="vp"></g></svg>
<div id="detail" style="display:none"></div>
<div class="hint">휠 = 줌 · 배경 드래그 = 이동 · 노드 드래그 = 재배치 · 노드 클릭 = 상세</div>
<script type="application/json" id="gdata">${payload}</script>
<script>${SCRIPT}</script>
</body></html>`;
    triggerDownload(
      new Blob([html], { type: "text/html;charset=utf-8" }),
      "html"
    );
  }
  function exportPng() {
    const svgStr = buildSvg();
    const m = svgStr.match(/viewBox="([\d.\- ]+)"/);
    const [, , vw, vh] = (m?.[1] ?? `0 0 ${W} ${H}`).split(" ").map(Number);
    const scale = 2;
    const img = new Image();
    const svgUrl =
      "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgStr);
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(vw * scale);
      canvas.height = Math.round(vh * scale);
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (blob) triggerDownload(blob, "png");
      }, "image/png");
    };
    img.src = svgUrl;
  }

  // 읽기전용 공유 링크 발행 — 현재 지식맵 그대로(앱과 동일한 화면)를 보여준다
  async function shareLink() {
    if (!user) return;
    setDlOpen(false);
    setSharing(true);
    try {
      const id = await createShare(data, title, user.uid);
      const url = `${window.location.origin}/share/?id=${id}`;
      let copied = false;
      try {
        await navigator.clipboard.writeText(url);
        copied = true;
      } catch {
        /* 클립보드 권한 없으면 무시 */
      }
      await dialog.prompt({
        title: "읽기전용 공유 링크",
        description: copied
          ? "링크를 클립보드에 복사했습니다. 로그인 없이 누구나 이 지식맵을 (읽기전용으로) 볼 수 있습니다."
          : "아래 링크로 로그인 없이 누구나 이 지식맵을 (읽기전용으로) 볼 수 있습니다.",
        defaultValue: url,
        okLabel: "확인",
      });
    } catch {
      await dialog.confirm({
        title: "공유 실패",
        body: "공유 링크를 만들지 못했습니다. 교사 계정으로 로그인했는지 확인해 주세요.",
        okLabel: "확인",
      });
    } finally {
      setSharing(false);
    }
  }

  return (
    <div className="relative w-full">
      {/* 색상 모드 토글 — 비교 그래프(nodeColor 지정)에서는 숨김 */}
      {!nodeColor && (
        <div className="absolute left-2 top-2 z-10 flex rounded-full bg-white/85 p-0.5 text-[11px] font-semibold shadow-sm backdrop-blur">
          {(
            [
              ["sentiment", "감정 극성"],
              ["shared", "공유도(중첩)"],
              ["group", "그룹"],
            ] as const
          ).map(([m, label]) => (
            <button
              key={m}
              onClick={() => setColorMode(m)}
              className={`rounded-full px-2.5 py-1 transition ${
                colorMode === m
                  ? "bg-[var(--md-sys-color-primary)] text-white"
                  : "text-black/55"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {/* 컨트롤 */}
      <div className="absolute right-2 top-2 z-10 flex flex-col gap-1">
        <button
          onClick={() => zoomBy(1.25)}
          className="graph-ctrl"
          title="확대"
        >
          <Icon name="add" size={16} />
        </button>
        <button
          onClick={() => zoomBy(1 / 1.25)}
          className="graph-ctrl"
          title="축소"
        >
          <Icon name="remove" size={16} />
        </button>
        <button onClick={resetView} className="graph-ctrl" title="초기화">
          <Icon name="filter_center_focus" size={16} />
        </button>
        <button
          onClick={() => {
            // 랜덤 재배치 → 시뮬 재가열 (같은 데이터라도 다른 자리에서 안정화)
            for (const p of posRef.current) {
              p.x = 80 + Math.random() * (W - 160);
              p.y = 80 + Math.random() * (H - 160);
              p.vx = 0;
              p.vy = 0;
              p.fx = null;
              p.fy = null;
            }
            setView({ scale: 1, tx: 0, ty: 0 });
            kick(1);
          }}
          className="graph-ctrl"
          title="레이아웃 재배치 (랜덤 재시작)"
        >
          <Icon name="shuffle" size={16} />
        </button>
        <div className="relative">
          <button
            onClick={() => setDlOpen((v) => !v)}
            className="graph-ctrl"
            title="지식맵 내보내기"
          >
            <Icon name="download" size={16} />
          </button>
          {dlOpen && (
            <div className="absolute right-0 top-9 z-30 w-44 overflow-hidden rounded-xl bg-white/97 text-xs shadow-lg backdrop-blur">
              <p className="border-b border-black/5 px-3 py-1.5 font-semibold text-black/45">
                내보내기
              </p>
              <button
                onClick={exportPng}
                className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-black/5"
              >
                <Icon name="image" size={15} />
                PNG 이미지
              </button>
              <button
                onClick={exportSvg}
                className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-black/5"
              >
                <Icon name="shapes" size={15} />
                SVG (벡터)
              </button>
              <button
                onClick={exportHtml}
                className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-black/5"
              >
                <Icon name="language" size={15} />
                HTML (인터랙티브)
              </button>
              <p className="px-3 pb-1 pt-0.5 text-[10px] leading-tight text-black/40">
                HTML은 줌·드래그·클릭이 되는 동적 파일입니다.
              </p>
              {user && (
                <>
                  <p className="border-t border-black/5 px-3 py-1.5 font-semibold text-black/45">
                    공유
                  </p>
                  <button
                    onClick={shareLink}
                    disabled={sharing}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-black/5 disabled:opacity-50"
                  >
                    <Icon name="link" size={15} />
                    {sharing ? "링크 만드는 중…" : "읽기전용 링크 만들기"}
                  </button>
                  <p className="px-3 pb-2 pt-0.5 text-[10px] leading-tight text-black/40">
                    앱과 동일한 화면을 로그인 없이 볼 수 있는 링크입니다.
                  </p>
                </>
              )}
            </div>
          )}
        </div>
        <button
          onClick={() => setPanelOpen((v) => !v)}
          className="graph-ctrl"
          title="설정"
        >
          <Icon name="tune" size={16} />
        </button>
      </div>

      {/* 설정 드로어 */}
      {panelOpen && (
        <div className="absolute right-12 top-2 z-20 w-72 rounded-2xl bg-white/95 p-3 text-xs shadow-lg backdrop-blur">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-semibold text-black/60">그래프 설정</span>
            <button
              onClick={() => setPanelOpen(false)}
              className="flex h-6 w-6 items-center justify-center rounded-full text-black/45 hover:bg-black/10"
              title="닫기"
            >
              <Icon name="close" size={15} />
            </button>
          </div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="검색 (라벨 포함)"
            className="m3-field w-full !py-1.5 !text-xs"
          />
          <div className="mt-3 flex flex-col gap-2">
            <label className="flex flex-col gap-0.5">
              <span className="flex items-center justify-between text-black/55">
                <span>반발력</span>
                <span className="font-mono">{repulsionK}</span>
              </span>
              <input
                type="range"
                min={5000}
                max={80000}
                step={1000}
                value={repulsionK}
                onChange={(e) => {
                  setRepulsionK(+e.target.value);
                  kick();
                }}
              />
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="flex items-center justify-between text-black/55">
                <span>중심력</span>
                <span className="font-mono">{centerForce.toFixed(4)}</span>
              </span>
              <input
                type="range"
                min={0}
                max={0.02}
                step={0.0005}
                value={centerForce}
                onChange={(e) => {
                  setCenterForce(+e.target.value);
                  kick();
                }}
              />
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="flex items-center justify-between text-black/55">
                <span>링크 강도</span>
                <span className="font-mono">{springK.toFixed(3)}</span>
              </span>
              <input
                type="range"
                min={0}
                max={0.1}
                step={0.002}
                value={springK}
                onChange={(e) => {
                  setSpringK(+e.target.value);
                  kick();
                }}
              />
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="flex items-center justify-between text-black/55">
                <span>링크 거리</span>
                <span className="font-mono">{springLen}</span>
              </span>
              <input
                type="range"
                min={40}
                max={300}
                step={5}
                value={springLen}
                onChange={(e) => {
                  setSpringLen(+e.target.value);
                  kick();
                }}
              />
            </label>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <label className="flex items-center gap-1 text-black/55">
              <input
                type="checkbox"
                checked={showArrows}
                onChange={(e) => setShowArrows(e.target.checked)}
              />
              화살표
            </label>
            <label className="flex items-center gap-1 text-black/55">
              <input
                type="checkbox"
                checked={hideIsolated}
                onChange={(e) => setHideIsolated(e.target.checked)}
              />
              고립 노드 숨김
            </label>
            <label className="col-span-2 flex flex-col gap-0.5">
              <span className="flex items-center justify-between text-black/55">
                <span>라벨 투명도</span>
                <span className="font-mono">
                  {labelOpacity.toFixed(2)}
                </span>
              </span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={labelOpacity}
                onChange={(e) => setLabelOpacity(+e.target.value)}
              />
            </label>
          </div>

          <div className="mt-3 flex flex-col gap-1">
            <span className="text-black/55">크기 기준</span>
            <select
              value={sizeMode}
              onChange={(e) =>
                setSizeMode(
                  e.target.value as "importance" | "degree" | "sources"
                )
              }
              className="m3-field !w-full !py-1.5 !text-xs"
            >
              <option value="importance">중요도(중첩+연결)</option>
              <option value="degree">연결도</option>
              <option value="sources">언급 학생 수</option>
            </select>
          </div>

          <div className="mt-3 flex flex-col gap-1">
            <label className="flex items-center justify-between text-black/55">
              <span className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={localOnly}
                  onChange={(e) => setLocalOnly(e.target.checked)}
                />
                로컬 그래프(선택 노드 중심)
              </span>
              <span className="font-mono">깊이 {localDepth}</span>
            </label>
            <input
              type="range"
              min={1}
              max={3}
              step={1}
              value={localDepth}
              onChange={(e) => setLocalDepth(+e.target.value)}
              disabled={!localOnly}
            />
          </div>

          {colorMode === "group" && (
            <div className="mt-3 flex flex-col gap-1.5 border-t border-black/10 pt-3">
              <div className="flex items-center justify-between text-black/55">
                <span>그룹 색상 규칙</span>
                <button
                  onClick={() =>
                    setGroupRules((r) => [
                      ...r,
                      { query: "", color: "#23b27a" },
                    ])
                  }
                  className="inline-flex items-center gap-0.5 rounded-full bg-[var(--md-sys-color-primary)] px-2 py-0.5 text-[10px] font-semibold text-white"
                >
                  <Icon name="add" size={12} />
                  규칙
                </button>
              </div>
              {groupRules.length === 0 && (
                <p className="text-[11px] text-black/40">
                  검색어를 포함하는 노드를 그 색으로 표시 (위→아래 우선)
                </p>
              )}
              {groupRules.map((r, gi) => (
                <div key={gi} className="flex items-center gap-1.5">
                  <input
                    type="color"
                    value={r.color}
                    onChange={(e) =>
                      setGroupRules((rs) =>
                        rs.map((x, j) =>
                          j === gi ? { ...x, color: e.target.value } : x
                        )
                      )
                    }
                    className="h-6 w-7 cursor-pointer rounded"
                  />
                  <input
                    value={r.query}
                    onChange={(e) =>
                      setGroupRules((rs) =>
                        rs.map((x, j) =>
                          j === gi ? { ...x, query: e.target.value } : x
                        )
                      )
                    }
                    placeholder="검색어"
                    className="m3-field flex-1 !py-1 !text-xs"
                  />
                  <button
                    onClick={() =>
                      setGroupRules((rs) => rs.filter((_, j) => j !== gi))
                    }
                    className="flex items-center text-black/30 hover:text-rose-500"
                    title="규칙 삭제"
                  >
                    <Icon name="close" size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <style>{`
        .graph-ctrl{width:30px;height:30px;border-radius:9999px;
          background:rgba(255,255,255,.85);border:1px solid rgba(0,0,0,.08);
          font-size:16px;font-weight:700;color:#334;cursor:pointer;
          display:flex;align-items:center;justify-content:center;
          backdrop-filter:blur(4px)}
        .graph-ctrl:hover{background:#fff}
      `}</style>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-none select-none"
        style={{ height, cursor: panRef.current ? "grabbing" : "grab" }}
        onPointerDown={onBgPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onWheel={onWheel}
        onClick={() => setSelected(null)}
      >
        <defs>
          <marker
            id="arrow"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M0,0 L10,5 L0,10 z" fill="rgba(80,90,120,0.5)" />
          </marker>
        </defs>

        <g transform={`translate(${view.tx},${view.ty}) scale(${view.scale})`}>
          {/* 엣지 */}
          {edges.map((e, k) => {
            const a = pos[idx.get(e.source)!];
            const b = pos[idx.get(e.target)!];
            if (!a || !b) return null;
            const active =
              !neighborIds ||
              (neighborIds.has(e.source) && neighborIds.has(e.target));
            const localHide =
              localIds && (!localIds.has(e.source) || !localIds.has(e.target));
            const matchHide =
              matchedIds &&
              !(matchedIds.has(e.source) || matchedIds.has(e.target));
            const op = localHide ? 0 : matchHide ? 0.08 : active ? 1 : 0.12;
            const mx = (a.x + b.x) / 2;
            const my = (a.y + b.y) / 2;
            return (
              <g key={k} opacity={op}>
                <line
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke="rgba(80,90,120,0.4)"
                  strokeWidth={1 + Math.min(5, (e.weight ?? 1) / 2.5)}
                  markerEnd={showArrows ? "url(#arrow)" : undefined}
                />
                {e.relation && (
                  <text
                    x={mx}
                    y={my - 4}
                    textAnchor="middle"
                    className="fill-black/45 dark:fill-white/45"
                    style={{ fontSize: 11 }}
                  >
                    {e.relation}
                  </text>
                )}
              </g>
            );
          })}

          {/* 노드 */}
          {nodes.map((nd, i) => {
            const p = pos[i];
            if (!p) return null;
            const imp = importance[i];
            const r = radiusFromSize(sizeVal[i], maxSize);
            const tImp = imp / maxImp; // 0~1
            const isHub = tImp >= 0.6;
            const isMid = !isHub && tImp >= 0.25;
            const color =
              nodeColor?.(nd) ??
              (colorMode === "group"
                ? groupColorOf(nd.label || nd.id) ?? "#9ca3af"
                : colorMode === "shared"
                  ? shareColor(
                      nd.sourceCount ?? nd.sources?.length ?? 1,
                      maxShare
                    )
                  : SENT_COLOR[nd.sentiment] ?? SENT_COLOR.neutral);
            const matchHide = matchedIds ? !matchedIds.has(nd.id) : false;
            const localHide = localIds ? !localIds.has(nd.id) : false;
            const isoHide = hideIsolated && degree[i] === 0;
            const active = !neighborIds || neighborIds.has(nd.id);
            const isSel = selected === nd.id;
            const baseAlpha = isHub ? 1 : isMid ? 0.7 : 0.45;
            const nodeOpacity = isoHide
              ? 0
              : localHide
                ? 0.04
                : matchHide
                  ? 0.1
                  : active
                    ? baseAlpha
                    : 0.14;
            const showLabel =
              !matchHide &&
              !localHide &&
              !isoHide &&
              (isHub ||
                isSel ||
                hover === nd.id ||
                (neighborIds?.has(nd.id) ?? false) ||
                (matchedIds?.has(nd.id) ?? false));
            return (
              <g
                key={nd.id}
                opacity={nodeOpacity}
                style={{ cursor: "pointer" }}
                onPointerDown={(ev) => onNodePointerDown(ev, i)}
                onPointerEnter={() => setHover(nd.id)}
                onPointerLeave={() => setHover(null)}
                onClick={(ev) => {
                  ev.stopPropagation();
                  if (!dragRef.current?.moved) setSelected(nd.id);
                }}
              >
                {nd.type === "emotion" && (
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={r + 5}
                    fill="none"
                    stroke="#ff5fa2"
                    strokeWidth={2}
                    strokeDasharray="4 3"
                  />
                )}
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={r}
                  fill={color}
                  fillOpacity={
                    nodeColor
                      ? isSel
                        ? 0.92
                        : 0.62
                      : colorMode === "shared"
                        ? isSel
                          ? 0.85
                          : 0.7
                        : isSel
                          ? 0.4
                          : 0.22
                  }
                  stroke={color}
                  strokeWidth={
                    isSel ? 4 : nodeColor || colorMode === "shared" ? 2.5 : 2
                  }
                />
                {nd.type === "emotion" && (
                  <text
                    x={p.x - r * 0.72}
                    y={p.y - r * 0.72 + 4}
                    textAnchor="middle"
                    style={{ fontSize: 13 }}
                  >
                    ❤
                  </text>
                )}
                {(nd.sourceCount ?? 0) > 0 && (
                  <>
                    <circle
                      cx={p.x + r * 0.72}
                      cy={p.y - r * 0.72}
                      r={9}
                      fill={color}
                    />
                    <text
                      x={p.x + r * 0.72}
                      y={p.y - r * 0.72 + 3.5}
                      textAnchor="middle"
                      style={{ fontSize: 10, fontWeight: 700, fill: "#fff" }}
                    >
                      {nd.sourceCount}
                    </text>
                  </>
                )}
                {showLabel && (
                  <text
                    x={p.x}
                    y={p.y + r + 14}
                    textAnchor="middle"
                    className="fill-black/80 dark:fill-white/85"
                    opacity={labelOpacity}
                    style={{
                      fontSize: isHub ? 14 : 12,
                      fontWeight: isHub ? 700 : 500,
                    }}
                  >
                    {nd.label || nd.id}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>

      {/* 노드 상세 패널 */}
      {selNode && (
        <div className="absolute right-2 bottom-2 z-10 max-h-[80%] w-72 overflow-y-auto rounded-2xl border border-black/5 bg-white/90 p-4 text-sm shadow-lg backdrop-blur dark:bg-black/70">
          <div className="flex items-start justify-between gap-2">
            <p className="font-bold">{selNode.label || selNode.id}</p>
            <button
              onClick={() => setSelected(null)}
              className="flex items-center text-black/40 hover:text-black/70"
              title="닫기"
            >
              <Icon name="close" size={16} />
            </button>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
            <span className="rounded-full bg-black/5 px-2 py-0.5 dark:bg-white/10">
              {selNode.type === "concept" ? "개념" : "키워드"}
            </span>
            <span
              className="rounded-full px-2 py-0.5 text-white"
              style={{
                background: SENT_COLOR[selNode.sentiment] ?? SENT_COLOR.neutral,
              }}
            >
              {SENT_LABEL[selNode.sentiment] ?? "중립"}
            </span>
            <span className="rounded-full bg-black/5 px-2 py-0.5 dark:bg-white/10">
              강도 {selNode.weight}
            </span>
          </div>

          <p className="mt-3 text-xs font-semibold text-black/55 dark:text-white/55">
            언급한 학생 {selNode.sourceCount ?? selNode.sources?.length ?? 0}명
          </p>
          {selNode.sources && selNode.sources.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {selNode.sources.map((s) => (
                <span
                  key={s}
                  className="rounded-full bg-[var(--md-sys-color-secondary-container)] px-2 py-0.5 text-[11px] text-[var(--md-sys-color-on-secondary-container)]"
                >
                  {nameOf(s)}
                </span>
              ))}
            </div>
          )}

          {data.aliases?.[selNode.id]?.length ? (
            <>
              <p className="mt-3 text-xs font-semibold text-black/55 dark:text-white/55">
                별칭 (동의어 통합)
              </p>
              <div className="mt-1 flex flex-wrap gap-1">
                {data.aliases[selNode.id].map((a) => (
                  <span
                    key={a}
                    className="rounded-full bg-black/5 px-2 py-0.5 text-[11px] text-black/60 dark:bg-white/10"
                  >
                    {a}
                  </span>
                ))}
              </div>
            </>
          ) : null}

          <p className="mt-3 text-xs font-semibold text-black/55 dark:text-white/55">
            관계 {selEdges.length}개
          </p>
          <ul className="mt-1 flex flex-col gap-2">
            {selEdges.map((e, k) => {
              const other = e.source === selected ? e.target : e.source;
              const dir = e.source === selected ? "→" : "←";
              const on = nodes.find((x) => x.id === other);
              return (
                <li
                  key={k}
                  className="rounded-xl bg-black/5 px-3 py-2 dark:bg-white/10"
                >
                  <button
                    className="text-left text-xs font-medium hover:underline"
                    onClick={() => setSelected(other)}
                  >
                    {dir} {on?.label || other}{" "}
                    <span className="text-black/45 dark:text-white/45">
                      ({e.relation})
                    </span>
                  </button>
                  {e.evidence && (
                    <p className="mt-1 text-[11px] leading-snug text-black/55 dark:text-white/55">
                      “{e.evidence}”
                    </p>
                  )}
                  {(e.sourceCount ?? 0) > 0 && (
                    <p className="mt-0.5 text-[10px] text-black/40">
                      {e.sourceCount}명 응답에서 발견
                    </p>
                  )}
                </li>
              );
            })}
            {selEdges.length === 0 && (
              <li className="text-xs text-black/40">연결된 관계 없음</li>
            )}
          </ul>
        </div>
      )}

      <p className="mt-1 px-1 text-[11px] text-black/40">
        휠=확대 · 배경 드래그=이동 · 노드 드래그=재배치 · 노드 클릭=상세 ·
        배지 숫자=언급 학생 수 · ❤점선=감정어 노드
        {!nodeColor && (
          <>
            {" · "}
            {colorMode === "shared"
              ? "색=공유도(연파랑 적음 → 빨강 많음)"
              : "색=감정 극성(초록 긍정·파랑 중립·분홍 부정)"}
          </>
        )}
      </p>
    </div>
  );
}

export function SentimentBar({
  s,
}: {
  s: Ontology["overallSentiment"];
}) {
  const total = Math.max(1, s.positive + s.neutral + s.negative);
  const seg = (v: number, c: string, label: string) =>
    v > 0 ? (
      <div
        className="flex items-center justify-center text-[10px] font-semibold text-white"
        style={{ width: `${(v / total) * 100}%`, background: c }}
        title={`${label} ${v}`}
      >
        {Math.round((v / total) * 100)}%
      </div>
    ) : null;
  return (
    <div className="flex h-6 overflow-hidden rounded-full">
      {seg(s.positive, SENT_COLOR.positive, "긍정")}
      {seg(s.neutral, SENT_COLOR.neutral, "중립")}
      {seg(s.negative, SENT_COLOR.negative, "부정")}
    </div>
  );
}
