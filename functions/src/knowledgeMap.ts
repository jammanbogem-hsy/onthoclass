/**
 * 지식맵(질문 리프 온톨로지) 공용 도구 — 화면(src/lib/ontology.ts)과 같은 규칙을 서버에서도 쓴다.
 * hashResponses 는 화면의 “분석 필요” 판정과 한 글자도 달라지면 안 된다(같으면 이미 최신으로 본다).
 */

export type LeafNode = { id: string; label: string; type: string; weight: number; sentiment: string; sourceCount: number; sources: string[] };
export type LeafEdge = { source: string; target: string; relation: string; weight: number; evidence: string; sourceCount: number };
export type Leaf = { nodes: LeafNode[]; edges: LeafEdge[]; overallSentiment?: { positive: number; neutral: number; negative: number }; summary?: string; inputHash?: string };

/** 제출물 집합의 안정 해시 (src/lib/ontology.ts 와 동일) */
export function hashResponses(items: { uid: string; content: string }[]): string {
  const joined = items.slice().sort((a, b) => a.uid.localeCompare(b.uid)).map(x => `${x.uid}\u0001${x.content}`).join("\u0002");
  let h = 5381;
  for (let i = 0; i < joined.length; i++) h = ((h << 5) + h + joined.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36) + ":" + items.length;
}

/** 지식맵을 만드는 활동 — 질문·보드만(문항·링크·성찰 제외), 화면과 같다 */
export const MAP_KINDS = new Set(["question", "canvas"]);

/** 여러 리프를 하나로(차시 전체 지식맵). src/lib/ontology.ts mergeOntologies 와 같은 규칙 */
export function mergeLeaves(list: Leaf[]): Leaf {
  const ons = list.filter(o => o && (o.nodes?.length || o.edges?.length));
  const nodeMap = new Map<string, { label: string; type: string; weight: number; sources: Set<string>; sent: Record<string, number> }>();
  for (const o of ons) for (const n of o.nodes ?? []) {
    const cur = nodeMap.get(n.id) ?? { label: "", type: "keyword", weight: 0, sources: new Set<string>(), sent: {} };
    if (!cur.label && n.label) cur.label = n.label;
    if (n.type === "concept") cur.type = "concept"; else if (n.type === "emotion" && cur.type !== "concept") cur.type = "emotion";
    cur.weight += n.weight ?? 1;
    for (const s of n.sources ?? []) cur.sources.add(s);
    cur.sent[n.sentiment] = (cur.sent[n.sentiment] ?? 0) + (n.sourceCount ?? n.sources?.length ?? n.weight ?? 1);
    nodeMap.set(n.id, cur);
  }
  const nodes: LeafNode[] = [...nodeMap.entries()].map(([id, v]) => ({
    id, label: v.label || id, type: v.type, weight: v.weight,
    sentiment: (["positive", "neutral", "negative"] as const).reduce((b, k) => ((v.sent[k] ?? 0) > (v.sent[b] ?? -1) ? k : b), "neutral" as string),
    sources: [...v.sources], sourceCount: v.sources.size,
  }));
  const edgeMap = new Map<string, { e: LeafEdge; evid: Set<string> }>();
  for (const o of ons) for (const e of o.edges ?? []) {
    const key = `${e.source}\u0001${e.target}\u0001${e.relation}`;
    const cur = edgeMap.get(key);
    if (cur) { cur.e.weight += e.weight ?? 1; cur.e.sourceCount += e.sourceCount ?? 0; if (e.evidence) cur.evid.add(e.evidence); }
    else edgeMap.set(key, { e: { source: e.source, target: e.target, relation: e.relation, weight: e.weight ?? 1, sourceCount: e.sourceCount ?? 0, evidence: "" }, evid: new Set(e.evidence ? [e.evidence] : []) });
  }
  const edges = [...edgeMap.values()].map(({ e, evid }) => ({ ...e, evidence: [...evid].slice(0, 2).join(" / ") }));
  const overallSentiment = ons.reduce((a, o) => ({
    positive: a.positive + (o.overallSentiment?.positive ?? 0), neutral: a.neutral + (o.overallSentiment?.neutral ?? 0), negative: a.negative + (o.overallSentiment?.negative ?? 0),
  }), { positive: 0, neutral: 0, negative: 0 });
  const summary = [...new Set(ons.map(o => o.summary).filter(Boolean))].join(" ").slice(0, 600);
  return { nodes, edges, overallSentiment, summary };
}

/** 리치 에디터 JSON(또는 평문) → 평문 */
export function plain(text: unknown): string {
  if (typeof text !== "string") return "";
  try {
    const out: string[] = [];
    const walk = (n: unknown) => {
      if (Array.isArray(n)) return n.forEach(walk);
      if (n && typeof n === "object") {
        const o = n as Record<string, unknown>;
        if (typeof o.text === "string") out.push(o.text);
        for (const [k, x] of Object.entries(o)) if (k !== "text" && typeof x === "object") walk(x);
      }
    };
    walk(JSON.parse(text));
    return out.join("\n").trim() || text;
  } catch { return text; }
}
