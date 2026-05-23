// 온톨로지 롤업 유틸 — LLM 비용 0 (결정적·재현 가능)
//
// 설계: LLM 추출은 "질문 리프"에서만 1회. 학생별·차시·프로젝트·학급은
// 리프 결과를 머지/필터로 파생한다. 더티 해시로 재생성 최소화.
import type { Ontology, OntologyEdge, OntologyNode } from "@/lib/lessons";
import type { LabelClusters } from "@/lib/ai";

export const EMPTY_ONTOLOGY: Ontology = {
  nodes: [],
  edges: [],
  overallSentiment: { positive: 0, neutral: 0, negative: 0 },
  summary: "",
};

/** 제출물 집합의 안정 해시 (내용 변경 시에만 값이 바뀜) */
export function hashResponses(
  items: { uid: string; content: string }[]
): string {
  const joined = items
    .slice()
    .sort((a, b) => a.uid.localeCompare(b.uid))
    .map((x) => `${x.uid}${x.content}`)
    .join("");
  // djb2
  let h = 5381;
  for (let i = 0; i < joined.length; i++) {
    h = ((h << 5) + h + joined.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36) + ":" + items.length;
}

function dominantSentiment(
  buckets: Record<string, number>
): OntologyNode["sentiment"] {
  const order: OntologyNode["sentiment"][] = [
    "positive",
    "neutral",
    "negative",
  ];
  let best: OntologyNode["sentiment"] = "neutral";
  let bestV = -1;
  for (const s of order) {
    if ((buckets[s] ?? 0) > bestV) {
      bestV = buckets[s] ?? 0;
      best = s;
    }
  }
  return best;
}

/** 여러 온톨로지를 하나로 병합 (id 정규화 합산) */
export function mergeOntologies(list: Ontology[]): Ontology {
  const ons = list.filter((o) => o && (o.nodes?.length || o.edges?.length));
  if (ons.length === 0) return { ...EMPTY_ONTOLOGY };

  const nodeMap = new Map<
    string,
    {
      label: string;
      type: OntologyNode["type"];
      weight: number;
      sources: Set<string>;
      sentBuckets: Record<string, number>;
      sentCountFallback: number;
    }
  >();

  for (const o of ons) {
    for (const n of o.nodes ?? []) {
      const cur =
        nodeMap.get(n.id) ??
        {
          label: "",
          type: "keyword" as OntologyNode["type"],
          weight: 0,
          sources: new Set<string>(),
          sentBuckets: {} as Record<string, number>,
          sentCountFallback: 0,
        };
      if (!cur.label && n.label) cur.label = n.label;
      // 타입 우선순위: concept > emotion > keyword
      if (n.type === "concept") cur.type = "concept";
      else if (n.type === "emotion" && cur.type !== "concept")
        cur.type = "emotion";
      cur.weight += n.weight ?? 1;
      for (const s of n.sources ?? []) cur.sources.add(s);
      const w = n.sourceCount ?? n.sources?.length ?? n.weight ?? 1;
      cur.sentBuckets[n.sentiment] = (cur.sentBuckets[n.sentiment] ?? 0) + w;
      cur.sentCountFallback += n.sourceCount ?? 0;
      nodeMap.set(n.id, cur);
    }
  }

  const nodes: OntologyNode[] = [...nodeMap.entries()].map(([id, v]) => ({
    id,
    label: v.label || id,
    type: v.type,
    weight: v.weight,
    sentiment: dominantSentiment(v.sentBuckets),
    sources: [...v.sources],
    sourceCount: v.sources.size || v.sentCountFallback,
  }));

  const edgeMap = new Map<
    string,
    { e: OntologyEdge; evid: Set<string> }
  >();
  for (const o of ons) {
    for (const e of o.edges ?? []) {
      const key = `${e.source}${e.target}${e.relation}`;
      const cur = edgeMap.get(key);
      if (cur) {
        cur.e.weight += e.weight ?? 1;
        cur.e.sourceCount = (cur.e.sourceCount ?? 0) + (e.sourceCount ?? 0);
        if (e.evidence) cur.evid.add(e.evidence);
      } else {
        edgeMap.set(key, {
          e: {
            source: e.source,
            target: e.target,
            relation: e.relation,
            weight: e.weight ?? 1,
            sourceCount: e.sourceCount ?? 0,
            evidence: e.evidence ?? "",
          },
          evid: e.evidence ? new Set([e.evidence]) : new Set(),
        });
      }
    }
  }
  const edges: OntologyEdge[] = [...edgeMap.values()].map(({ e, evid }) => ({
    ...e,
    evidence: [...evid].slice(0, 2).join(" / "),
  }));

  const overallSentiment = ons.reduce(
    (acc, o) => ({
      positive: acc.positive + (o.overallSentiment?.positive ?? 0),
      neutral: acc.neutral + (o.overallSentiment?.neutral ?? 0),
      negative: acc.negative + (o.overallSentiment?.negative ?? 0),
    }),
    { positive: 0, neutral: 0, negative: 0 }
  );

  const summary = [...new Set(ons.map((o) => o.summary).filter(Boolean))]
    .join(" ")
    .slice(0, 600);

  return { nodes, edges, overallSentiment, summary };
}

/** 머지 그래프의 라벨 집합 해시 (정규화 캐시 더티 체크용) */
export function hashLabels(nodes: OntologyNode[]): string {
  const joined = nodes
    .map((n) => `${n.id}|${n.label}`)
    .sort()
    .join("§");
  let h = 5381;
  for (let i = 0; i < joined.length; i++) {
    h = ((h << 5) + h + joined.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36) + ":" + nodes.length;
}

/** 라벨 클러스터(동의어 통합)를 결정적으로 적용. LLM 호출 없음 */
export function applyLabelClusters(
  o: Ontology,
  lc: LabelClusters
): Ontology {
  const map = new Map<string, { id: string; label: string }>();
  for (const c of lc.clusters ?? []) {
    for (const m of c.members ?? []) {
      map.set(m, { id: c.canonicalId, label: c.canonicalLabel });
    }
  }
  // 별칭(B8): canonicalId → 원본 라벨 목록(자기 자신 제외, 중복 제거)
  const aliases: Record<string, string[]> = {};
  const origLabel = new Map<string, string>(
    (o.nodes ?? []).map((n) => [n.id, n.label || n.id])
  );
  for (const c of lc.clusters ?? []) {
    const set = new Set<string>();
    for (const m of c.members ?? []) {
      const lbl = origLabel.get(m);
      if (lbl && lbl !== c.canonicalLabel) set.add(lbl);
    }
    if (set.size) aliases[c.canonicalId] = [...set];
  }
  const remap = (id: string) => map.get(id)?.id ?? id;
  const nodes: OntologyNode[] = (o.nodes ?? []).map((n) => {
    const c = map.get(n.id);
    return c ? { ...n, id: c.id, label: c.label } : n;
  });
  const edges: OntologyEdge[] = (o.edges ?? [])
    .map((e) => ({
      ...e,
      source: remap(e.source),
      target: remap(e.target),
    }))
    .filter((e) => e.source !== e.target);
  const merged = mergeOntologies([{ ...o, nodes, edges }]);
  return { ...merged, aliases };
}

/** 수업 전↔후 개념 변화 (모순/성장 추적). LLM 호출 없음 */
export type ConceptChange = {
  id: string;
  label: string;
  status: "emerged" | "resolved" | "shifted" | "persisted";
  preCount: number;
  postCount: number;
  preSentiment: OntologyNode["sentiment"] | null;
  postSentiment: OntologyNode["sentiment"] | null;
};

export function diffPrePost(
  pre: Ontology,
  post: Ontology
): ConceptChange[] {
  const pm = new Map((pre.nodes ?? []).map((n) => [n.id, n]));
  const qm = new Map((post.nodes ?? []).map((n) => [n.id, n]));
  const ids = new Set<string>([...pm.keys(), ...qm.keys()]);
  const out: ConceptChange[] = [];
  for (const id of ids) {
    const a = pm.get(id);
    const b = qm.get(id);
    let status: ConceptChange["status"];
    if (a && !b) status = "resolved";
    else if (!a && b) status = "emerged";
    else if (a && b && a.sentiment !== b.sentiment) status = "shifted";
    else status = "persisted";
    out.push({
      id,
      label: (b ?? a)!.label || id,
      status,
      preCount: a?.sourceCount ?? a?.sources?.length ?? 0,
      postCount: b?.sourceCount ?? b?.sources?.length ?? 0,
      preSentiment: a?.sentiment ?? null,
      postSentiment: b?.sentiment ?? null,
    });
  }
  const rank = { emerged: 0, shifted: 1, persisted: 2, resolved: 3 };
  return out.sort(
    (x, y) =>
      rank[x.status] - rank[y.status] ||
      y.postCount + y.preCount - (x.postCount + x.preCount)
  );
}

/** 특정 학생이 기여한 부분만 추출 (sources∋uid). LLM 호출 없음 */
export function filterOntologyByStudent(
  o: Ontology,
  uid: string
): Ontology {
  const nodes = (o.nodes ?? []).filter((n) =>
    // sources 정보가 아예 없는 레거시 노드는 보존
    n.sources ? n.sources.includes(uid) : true
  );
  const keep = new Set(nodes.map((n) => n.id));
  const edges = (o.edges ?? []).filter(
    (e) => keep.has(e.source) && keep.has(e.target)
  );
  return {
    nodes,
    edges,
    overallSentiment: o.overallSentiment,
    summary: o.summary,
  };
}

/** 한 모둠(구성원 uid 집합)이 기여한 부분만 추출. LLM 호출 없음.
 *  sources 가 구성원 중 한 명이라도 포함하면 보존. 레거시(소스 없음)는 제외
 *  (모둠 비교에서는 누가 기여했는지 모르는 노드를 특정 모둠에 귀속할 수 없음). */
export function filterOntologyByGroup(
  o: Ontology,
  memberUids: string[]
): Ontology {
  const members = new Set(memberUids);
  const nodes = (o.nodes ?? []).filter((n) =>
    (n.sources ?? []).some((s) => members.has(s))
  );
  const keep = new Set(nodes.map((n) => n.id));
  const edges = (o.edges ?? []).filter(
    (e) => keep.has(e.source) && keep.has(e.target)
  );
  return {
    nodes,
    edges,
    overallSentiment: o.overallSentiment,
    summary: o.summary,
  };
}
