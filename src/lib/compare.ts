// 사전/사후 온톨로지 오버레이 빌더 (LLM 호출 0, 결정적).
// 차시 활동별 비교(lesson)·위계 지식맵 비교(class-map) 공용.
import type { Ontology } from "@/lib/lessons";

export type PrePostStatus = "pre" | "post" | "both";

export function buildPrePostOverlay(
  pre: Ontology | null,
  post: Ontology | null
): {
  overlay: Ontology;
  statusByKey: Record<string, PrePostStatus>;
  counts: { pre: number; post: number; both: number };
} {
  const keyOf = (n: { id: string; label: string }) =>
    (n.label || n.id).trim().toLowerCase() || n.id;
  const byKey = new Map<
    string,
    { node: Ontology["nodes"][number]; inPre: boolean; inPost: boolean }
  >();
  const preKeys = new Map<string, string>();
  const postKeys = new Map<string, string>();
  (pre?.nodes ?? []).forEach((n) => {
    const k = keyOf(n);
    preKeys.set(n.id, k);
    const e = byKey.get(k);
    if (e) e.inPre = true;
    else byKey.set(k, { node: { ...n, id: k }, inPre: true, inPost: false });
  });
  (post?.nodes ?? []).forEach((n) => {
    const k = keyOf(n);
    postKeys.set(n.id, k);
    const e = byKey.get(k);
    if (e) {
      e.inPost = true;
      e.node = { ...n, id: k };
    } else byKey.set(k, { node: { ...n, id: k }, inPre: false, inPost: true });
  });
  const statusByKey: Record<string, PrePostStatus> = {};
  const counts = { pre: 0, post: 0, both: 0 };
  byKey.forEach((e, k) => {
    const s: PrePostStatus = e.inPre && e.inPost ? "both" : e.inPre ? "pre" : "post";
    statusByKey[k] = s;
    counts[s] += 1;
  });
  const remap = (edges: Ontology["edges"], keys: Map<string, string>) =>
    edges.map((ed) => ({
      ...ed,
      source: keys.get(ed.source) ?? ed.source,
      target: keys.get(ed.target) ?? ed.target,
    }));
  const edgeMap = new Map<string, Ontology["edges"][number]>();
  [
    ...remap(pre?.edges ?? [], preKeys),
    ...remap(post?.edges ?? [], postKeys),
  ].forEach((ed) => {
    const id = `${ed.source}__${ed.target}`;
    if (!edgeMap.has(id)) edgeMap.set(id, ed);
  });
  return {
    overlay: {
      nodes: [...byKey.values()].map((e) => e.node),
      edges: [...edgeMap.values()],
      overallSentiment: (post ?? pre)?.overallSentiment ?? {
        positive: 0,
        neutral: 1,
        negative: 0,
      },
      summary: "",
    } as Ontology,
    statusByKey,
    counts,
  };
}

// 강조 모드(전체/사전/사후/공통/차이)로 오버레이 노드 필터
export function filterOverlayByMode(
  overlay: Ontology,
  statusByKey: Record<string, PrePostStatus>,
  mode: "all" | "pre" | "post" | "both" | "diff"
): Ontology {
  if (mode === "all") return overlay;
  const keep = (s: PrePostStatus) =>
    mode === "diff" ? s !== "both" : s === mode;
  const nodes = overlay.nodes.filter((n) => keep(statusByKey[n.id] ?? "both"));
  const ids = new Set(nodes.map((n) => n.id));
  return {
    ...overlay,
    nodes,
    edges: overlay.edges.filter((e) => ids.has(e.source) && ids.has(e.target)),
  };
}
