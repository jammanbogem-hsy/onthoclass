"use client";

// 학급 성과 공유 화면(/showcase/?t=토큰) — 로그인 없이 읽기 전용. 데이터는 /api/showcase/data(functions/src/showcase.ts).
// 학생 이름은 서버가 빼고 학생 번호만 보낸다 → 여기서는 번호 색의 모자이크로만 그린다.
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ExpandableGraph } from "@/components/ExpandableGraph";
import { Icon } from "@/components/Icon";
import { BADGE_CATALOG } from "@/lib/badges";
import type { Ontology } from "@/lib/lessons";
import s from "./Showcase.module.css";

const MOSAIC = "";
type Tab = "lessons" | "maps" | "boards" | "life";

/* ------------------------------------------------------------ 데이터 타입(서버와 같은 모양) */
type Overview = {
  class: { name: string; subject: string; description: string };
  students: number;
  projects: { id: string; name: string; parentId: string | null }[];
  lessons: { id: string; title: string; date: string; projectId: string | null; activities: number; responses: number; kinds: string[] }[];
  boards: { id: string; name: string }[];
  totals: { lessons: number; responses: number; praises: number; games: number };
};
type Comment = { by: number; text: string };
type Resp = { by: number; text: string; img: string[]; survey?: Record<string, number | string>; understanding?: number; interest?: number; application?: string; comments: Comment[] };
type Activity = {
  id: string; kind: string; phase: string; title: string; prompt: string;
  options?: string[]; answerIndex?: number;
  surveyItems?: { id: string; type: string; prompt: string; options: string[]; scaleMax: number }[];
  links?: { title: string; url: string }[];
  responses?: Resp[]; ideas?: { by: number; text: string }[];
  game?: { name: string; ranks: { by: number; rank: number }[]; words: { word: string; count: number }[] };
};
type Board = { id: string; name: string; pages: { id: string; name: string }[]; cards: { text: string; link?: string; color: string | null; page: string | null; by: number; img: string[] }[] };
type LessonData = {
  lesson: { id: string; title: string; date: string; preQuestion: string; postQuestion: string };
  resources: { title: string; type: string; url: string }[];
  activities: Activity[];
  reflections: { by: number; phase: string; text: string; understanding?: number; interest?: number }[];
  boards: Board[];
  map: Ontology | null;
};
type Maps = { map: Ontology | null; lessons: { id: string; title: string; date: string; top: string[] }[] };
type Life = {
  praises: { from: number; to: number; reason: string; at: number }[]; praiseTotal: number;
  games: { kind: string; name: string; at: number; players?: number; matches: { winner: number; scores: { by: number; score: number }[] }[] }[];
  market: { title: string; price: number; active: boolean; bought: number }[];
  fundings: { title: string; goal: number; raised: number; status: string; by: number; backers: number }[];
  stocks: { name: string; trades: number; volume: number }[];
  badges: { id: string; students: number }[];
  groups: { name: string; members: number[] }[];
};

/* ------------------------------------------------------------ 불러오기 */
function useShowcase<T>(token: string, query: string | null) {
  const [state, setState] = useState<{ data?: T; error?: string; key: string } | null>(null);
  const key = query ? `${token}|${query}` : "";
  useEffect(() => {
    if (!query) return;
    let alive = true;
    const run = (silent: boolean) => fetch(`/api/showcase/data?t=${encodeURIComponent(token)}&${query}`)
      .then(async r => { const j = await r.json().catch(() => null); if (!r.ok) throw new Error(j?.error || "불러오지 못했어요."); return j as T; })
      .then(data => { if (alive) setState({ data, key }); })
      .catch(e => { if (alive && !silent) setState({ error: e instanceof Error ? e.message : "불러오지 못했어요.", key }); });
    void run(false);
    // 실시간에 가깝게 — 화면이 보일 때 30초마다 새로 받는다
    const t = setInterval(() => { if (document.visibilityState === "visible") void run(true); }, 30_000);
    return () => { alive = false; clearInterval(t); };
  }, [token, query, key]);
  return state && state.key === key ? state : null;
}

/* ------------------------------------------------------------ 모자이크 */
const hue = (n: number) => (n * 47) % 360;
export function Mosaic({ n, inline }: { n: number; inline?: boolean }) {
  if (n === -1) return <span className={s.teacher}>선생님</span>;
  return <span className={inline ? s.mosaicInline : s.mosaic} style={{ ["--h" as string]: n > 0 ? hue(n) : 0, ["--sat" as string]: n > 0 ? "30%" : "0%" }} role="img" aria-label="가려진 이름" />;
}
/** 글 속 가린 이름(MOSAIC) 자리를 모자이크로 */
function Masked({ text, className }: { text: string; className?: string }) {
  if (!text) return null;
  const parts = text.split(MOSAIC);
  return <span className={className}>{parts.map((p, i) => <span key={i}>{p}{i < parts.length - 1 && <Mosaic n={0} inline />}</span>)}</span>;
}
const labelText = (t: string) => t.split(MOSAIC).join("○○");

/* ------------------------------------------------------------ 화면 */
export default function Showcase() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("t") || "";
  const lid = params.get("l");
  const bid = params.get("b");
  const tab = (params.get("tab") as Tab) || "lessons";
  const go = (q: Record<string, string | null>) => {
    const u = new URLSearchParams({ t: token });
    for (const [k, v] of Object.entries(q)) if (v) u.set(k, v);
    router.push(`/showcase/?${u.toString()}`);
    window.scrollTo({ top: 0 });
  };
  const ov = useShowcase<Overview>(token, "v=overview");
  const [lightbox, setLightbox] = useState<string | null>(null);
  const file = (p: string) => `/api/showcase/file?t=${encodeURIComponent(token)}&p=${encodeURIComponent(p)}`;

  useEffect(() => { if (ov?.data) document.title = `${ov.data.class.name} · 학급 성과`; }, [ov?.data]);

  if (!token) return <Center title="공유 링크가 아니에요" body="선생님께 받은 링크 전체를 다시 열어 주세요." />;
  if (!ov) return <Center title="불러오는 중…" />;
  if (ov.error || !ov.data) return <Center title="볼 수 없는 링크예요" body={ov.error} />;
  const o = ov.data;
  const ctx: Ctx = { file, open: setLightbox };

  return <div className={s.page}>
    <header className={s.hero}>
      <div className={s.heroIn}>
        <span className={s.kicker}><Icon name="school" size={16} />러닝크루 학급 성과</span>
        <h1>{o.class.name}</h1>
        {o.class.subject && <p className={s.sub}>{o.class.subject}</p>}
        {o.class.description && <p className={s.desc}><Masked text={o.class.description} /></p>}
        <div className={s.stats}>
          <Stat icon="group" n={o.students} label="학생" />
          <Stat icon="menu_book" n={o.totals.lessons} label="차시" />
          <Stat icon="edit_note" n={o.totals.responses} label="응답" />
          <Stat icon="favorite" n={o.totals.praises} label="칭찬" />
        </div>
        <p className={s.privacy}><Icon name="visibility_off" size={16} />학생 이름은 <Mosaic n={3} inline /> 모자이크로 가려져 있어요. 같은 색은 같은 학생이에요.</p>
      </div>
    </header>
    <nav className={s.tabs} aria-label="보기">
      {([["lessons", "menu_book", "수업"], ["maps", "hub", "지식맵"], ...(o.boards.length ? [["boards", "dashboard", "보드"]] : []), ["life", "celebration", "학급 생활"]] as [Tab, string, string][])
        .map(([k, icon, label]) => <button key={k} type="button" aria-pressed={!lid && !bid && tab === k} className={s.tab} onClick={() => go({ tab: k === "lessons" ? null : k })}><Icon name={icon} size={18} />{label}</button>)}
    </nav>
    <main className={s.main}>
      {lid ? <LessonView token={token} lid={lid} ctx={ctx} onBack={() => go({})} />
        : bid ? <BoardPage token={token} bid={bid} ctx={ctx} onBack={() => go({ tab: "boards" })} />
        : tab === "maps" ? <MapsView token={token} onLesson={l => go({ l })} />
        : tab === "boards" ? <section className={s.grid}>{o.boards.map(b => <button key={b.id} type="button" className={s.lessonCard} onClick={() => go({ b: b.id })}><Icon name="dashboard" size={22} /><strong>{b.name}</strong></button>)}</section>
        : tab === "life" ? <LifeView token={token} />
        : <LessonList o={o} onOpen={l => go({ l })} />}
    </main>
    <footer className={s.foot}>러닝크루 · 읽기 전용 공유 화면</footer>
    {lightbox && <div className={s.lightbox} role="dialog" aria-modal="true" aria-label="사진 크게 보기" onClick={() => setLightbox(null)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={lightbox} alt="학생 첨부 사진" />
    </div>}
  </div>;
}

type Ctx = { file: (p: string) => string; open: (url: string) => void };

function Center({ title, body }: { title: string; body?: string }) {
  return <main className={s.center}><div><strong>{title}</strong>{body && <p>{body}</p>}</div></main>;
}
function Stat({ icon, n, label }: { icon: string; n: number; label: string }) {
  return <span className={s.stat}><Icon name={icon} size={18} /><b>{n.toLocaleString("ko-KR")}</b>{label}</span>;
}

/* ------------------------------------------------------------ 수업 목록 */
function LessonList({ o, onOpen }: { o: Overview; onOpen: (id: string) => void }) {
  const groups = useMemo(() => {
    const name = new Map(o.projects.map(p => [p.id, p.name]));
    const by = new Map<string, Overview["lessons"]>();
    for (const l of o.lessons) { const k = l.projectId && name.has(l.projectId) ? l.projectId : ""; by.set(k, [...(by.get(k) ?? []), l]); }
    const order = [...o.projects.map(p => p.id), ""];
    return order.filter(k => by.has(k)).map(k => ({ name: k ? name.get(k)! : "그 밖의 차시", lessons: by.get(k)! }));
  }, [o]);
  if (!o.lessons.length) return <p className={s.empty}>아직 공개된 차시가 없어요.</p>;
  return <>{groups.map(g => <section key={g.name} className={s.section}>
    <h2 className={s.h2}>{g.name}</h2>
    <div className={s.grid}>{g.lessons.map(l => <button key={l.id} type="button" className={s.lessonCard} onClick={() => onOpen(l.id)}>
      <span className={s.date}>{l.date}</span>
      <strong>{l.title || "차시"}</strong>
      <span className={s.meta}>활동 {l.activities} · 응답 {l.responses}</span>
    </button>)}</div>
  </section>)}</>;
}

/* ------------------------------------------------------------ 차시 */
const KIND: Record<string, [string, string]> = {
  question: ["질문", "chat"], canvas: ["보드", "dashboard"], quiz: ["문항", "quiz"], survey: ["설문", "ballot"], reflection: ["성찰", "self_improvement"],
  brainstorm: ["브레인스토밍", "bubble_chart"], link: ["링크", "link"], "game-result": ["게임 결과", "sports_esports"],
};

function LessonView({ token, lid, ctx, onBack }: { token: string; lid: string; ctx: Ctx; onBack: () => void }) {
  const st = useShowcase<LessonData>(token, `v=lesson&l=${encodeURIComponent(lid)}`);
  if (!st) return <p className={s.empty}>차시를 불러오는 중…</p>;
  if (st.error || !st.data) return <p className={s.empty}>{st.error}</p>;
  const d = st.data;
  return <article>
    <button type="button" className={s.back} onClick={onBack}><Icon name="arrow_back" size={18} />수업 목록</button>
    <h2 className={s.lessonTitle}><span className={s.date}>{d.lesson.date}</span>{d.lesson.title}</h2>
    {(d.lesson.preQuestion || d.lesson.postQuestion) && <p className={s.prompt}><Masked text={[d.lesson.preQuestion, d.lesson.postQuestion].filter(Boolean).join("\n")} /></p>}
    {d.resources.length > 0 && <div className={s.chips}>{d.resources.map((r, i) => <a key={i} className={s.chip} href={r.url} target="_blank" rel="noreferrer"><Icon name="attach_file" size={16} /><Masked text={r.title || "자료"} /></a>)}</div>}
    {d.map && d.map.nodes.length > 0 && <section className={s.section}>
      <h3 className={s.h3}><Icon name="hub" size={20} />이 차시 지식맵</h3>
      <Graph data={d.map} title={`${d.lesson.title} 지식맵`} />
    </section>}
    {d.activities.map(a => <ActivityBlock key={a.id} a={a} ctx={ctx} />)}
    {d.reflections.length > 0 && <section className={s.section}>
      <h3 className={s.h3}><Icon name="self_improvement" size={20} />차시 성찰</h3>
      <div className={s.cards}>{d.reflections.map((r, i) => <div key={i} className={s.card}><Author n={r.by} /><Masked className={s.text} text={r.text} /></div>)}</div>
    </section>}
    {d.boards.filter(b => b.cards.length).map(b => <section key={b.id} className={s.section}><h3 className={s.h3}><Icon name="dashboard" size={20} />{b.name}</h3><BoardCards b={b} ctx={ctx} /></section>)}
    {!d.activities.length && !d.boards.length && <p className={s.empty}>이 차시에는 공개된 활동이 없어요.</p>}
  </article>;
}

function Author({ n }: { n: number }) { return <span className={s.author}><Mosaic n={n} /></span>; }
function Images({ list, ctx }: { list: string[]; ctx: Ctx }) {
  if (!list?.length) return null;
  return <div className={s.imgs}>{list.map(p => <button key={p} type="button" className={s.imgBtn} onClick={() => ctx.open(ctx.file(p))} aria-label="사진 크게 보기">
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={ctx.file(p)} alt="학생 첨부 사진" loading="lazy" />
  </button>)}</div>;
}

function ActivityBlock({ a, ctx }: { a: Activity; ctx: Ctx }) {
  const [label, icon] = KIND[a.kind] ?? ["활동", "assignment"];
  const head = <>
    <h3 className={s.h3}><Icon name={icon} size={20} /><span className={s.kind}>{a.phase === "post" ? "수업 후" : a.phase === "pre" ? "수업 전" : ""} {label}</span>{a.title && <Masked text={a.title} />}</h3>
    {a.prompt && <p className={s.prompt}><Masked text={a.prompt} /></p>}
  </>;
  let body: ReactNode = null;
  if (a.kind === "brainstorm") {
    const by = new Map<number, string[]>();
    for (const i of a.ideas ?? []) by.set(i.by, [...(by.get(i.by) ?? []), i.text]);
    body = by.size ? <div className={s.cards}>{[...by.entries()].map(([n, list]) => <div key={n} className={s.card}><Author n={n} /><div className={s.ideas}>{list.map((t, i) => <span key={i} className={s.idea}><Masked text={t} /></span>)}</div></div>)}</div> : <p className={s.empty}>아직 아이디어가 없어요.</p>;
  } else if (a.kind === "game-result" && a.game) {
    body = <div className={s.split}>
      <ol className={s.rank}>{a.game.ranks.slice().sort((x, y) => x.rank - y.rank).map((r, i) => <li key={i}><b>{r.rank}위</b><Mosaic n={r.by} /></li>)}</ol>
      <div className={s.cloud}>{a.game.words.map((w, i) => <span key={i} style={{ fontSize: `${Math.min(28, 13 + w.count * 2)}px` }}>{labelText(w.word)}</span>)}</div>
    </div>;
  } else if (a.kind === "link") {
    body = <div className={s.chips}>{(a.links ?? []).map((k, i) => <a key={i} className={s.chip} href={k.url} target="_blank" rel="noreferrer"><Icon name="link" size={16} /><Masked text={k.title || k.url} /></a>)}</div>;
  } else if (a.kind === "quiz") {
    const opts = a.options ?? [];
    const counts = opts.map(o => (a.responses ?? []).filter(r => r.text.trim() === o.trim()).length);
    const total = Math.max(1, a.responses?.length ?? 0);
    body = <div className={s.bars}>{opts.map((o, i) => <div key={i} className={s.bar} data-correct={i === a.answerIndex ? "" : undefined}>
      <span className={s.barLabel}>{i === a.answerIndex && <Icon name="check_circle" size={16} />}<Masked text={o} /></span>
      <span className={s.barTrack}><span style={{ width: `${(counts[i] / total) * 100}%` }} /></span><b>{counts[i]}명</b>
    </div>)}<p className={s.meta}>응답 {a.responses?.length ?? 0}명</p></div>;
  } else if (a.kind === "survey") {
    const rs = a.responses ?? [];
    body = <div className={s.survey}>{(a.surveyItems ?? []).map(it => {
      const vals = rs.map(r => r.survey?.[it.id]).filter(v => v !== undefined && v !== "");
      return <div key={it.id} className={s.card}>
        <strong><Masked text={it.prompt} /></strong>
        {it.type === "scale" ? <p className={s.meta}>평균 <b>{vals.length ? (vals.reduce<number>((t, v) => t + Number(v), 0) / vals.length).toFixed(1) : "-"}</b> / {it.scaleMax} · {vals.length}명</p>
          : it.type === "choice" ? <div className={s.bars}>{it.options.map((op, i) => { const c = vals.filter(v => v === op || v === i).length; return <div key={i} className={s.bar}><span className={s.barLabel}><Masked text={op} /></span><span className={s.barTrack}><span style={{ width: `${(c / Math.max(1, vals.length)) * 100}%` }} /></span><b>{c}명</b></div>; })}</div>
          : <ul className={s.answers}>{vals.map((v, i) => <li key={i}><Masked text={String(v)} /></li>)}</ul>}
      </div>;
    })}</div>;
  } else {
    const rs = (a.responses ?? []).filter(r => r.text.trim() || r.img.length);
    const avg = (k: "understanding" | "interest") => { const v = rs.map(r => r[k]).filter((x): x is number => typeof x === "number"); return v.length ? (v.reduce((t, x) => t + x, 0) / v.length).toFixed(1) : null; };
    body = <>
      {a.kind === "reflection" && (avg("understanding") || avg("interest")) && <p className={s.meta}>이해도 평균 <b>{avg("understanding") ?? "-"}</b> · 흥미 평균 <b>{avg("interest") ?? "-"}</b></p>}
      {rs.length ? <div className={s.cards}>{rs.map((r, i) => <div key={i} className={s.card}>
        <Author n={r.by} />
        <Masked className={s.text} text={r.text} />
        {r.application && <p className={s.meta}><Masked text={r.application} /></p>}
        <Images list={r.img} ctx={ctx} />
        {r.comments.length > 0 && <ul className={s.comments}>{r.comments.map((c, j) => <li key={j}><Mosaic n={c.by} inline /><Masked text={c.text} /></li>)}</ul>}
      </div>)}</div> : <p className={s.empty}>아직 응답이 없어요.</p>}
    </>;
  }
  return <section className={s.section}>{head}{body}</section>;
}

/* ------------------------------------------------------------ 보드 */
function BoardCards({ b, ctx }: { b: Board; ctx: Ctx }) {
  const pages = b.pages.length > 1 ? b.pages : [];
  const [page, setPage] = useState<string | null>(pages[0]?.id ?? null);
  const cards = pages.length ? b.cards.filter(c => (c.page ?? pages[0].id) === page) : b.cards;
  return <>
    {pages.length > 0 && <div className={s.chips}>{pages.map(p => <button key={p.id} type="button" className={s.chip} aria-pressed={p.id === page} onClick={() => setPage(p.id)}>{p.name || "페이지"}</button>)}</div>}
    <div className={s.cards}>{cards.map((c, i) => <div key={i} className={s.card} style={c.color ? { borderTopColor: c.color } : undefined} data-colored={c.color ? "" : undefined}>
      <Author n={c.by} />
      <Masked className={s.text} text={c.text} />
      {c.link && <a className={s.chip} href={c.link} target="_blank" rel="noreferrer"><Icon name="link" size={16} />링크</a>}
      <Images list={c.img} ctx={ctx} />
    </div>)}</div>
  </>;
}
function BoardPage({ token, bid, ctx, onBack }: { token: string; bid: string; ctx: Ctx; onBack: () => void }) {
  const st = useShowcase<Board>(token, `v=board&b=${encodeURIComponent(bid)}`);
  return <article>
    <button type="button" className={s.back} onClick={onBack}><Icon name="arrow_back" size={18} />보드 목록</button>
    {!st ? <p className={s.empty}>보드를 불러오는 중…</p> : st.error || !st.data ? <p className={s.empty}>{st.error}</p>
      : <><h2 className={s.lessonTitle}>{st.data.name}</h2>{st.data.cards.length ? <BoardCards b={st.data} ctx={ctx} /> : <p className={s.empty}>아직 카드가 없어요.</p>}</>}
  </article>;
}

/* ------------------------------------------------------------ 지식맵 */
function Graph({ data, title }: { data: Ontology; title: string }) {
  const names = useMemo(() => Object.fromEntries((data.nodes ?? []).flatMap(n => n.sources ?? []).map(id => [id, "○○○"])), [data]);
  return <ExpandableGraph data={data} studentNames={names} title={title} />;
}
function MapsView({ token, onLesson }: { token: string; onLesson: (id: string) => void }) {
  const st = useShowcase<Maps>(token, "v=maps");
  if (!st) return <p className={s.empty}>지식맵을 불러오는 중…</p>;
  if (st.error || !st.data) return <p className={s.empty}>{st.error}</p>;
  const d = st.data;
  if (!d.map) return <p className={s.empty}>아직 만든 지식맵이 없어요.</p>;
  return <>
    <section className={s.section}><h2 className={s.h2}>학급 전체 지식맵</h2><p className={s.meta}>학생들의 응답에서 나온 개념과 관계를 모두 합친 지도예요.</p><Graph data={d.map} title="학급 전체 지식맵" /></section>
    <section className={s.section}><h2 className={s.h2}>차시별 주요 개념</h2>
      <div className={s.grid}>{d.lessons.map(l => <button key={l.id} type="button" className={s.lessonCard} onClick={() => onLesson(l.id)}>
        <span className={s.date}>{l.date}</span><strong>{l.title}</strong>
        <span className={s.ideas}>{l.top.map((t, i) => <span key={i} className={s.idea}>{t}</span>)}</span>
      </button>)}</div>
    </section>
  </>;
}

/* ------------------------------------------------------------ 학급 생활 */
function LifeView({ token }: { token: string }) {
  const st = useShowcase<Life>(token, "v=life");
  const [more, setMore] = useState(40);
  if (!st) return <p className={s.empty}>불러오는 중…</p>;
  if (st.error || !st.data) return <p className={s.empty}>{st.error}</p>;
  const d = st.data;
  const badge = new Map(BADGE_CATALOG.map(b => [b.id, b]));
  return <>
    <section className={s.section}>
      <h2 className={s.h2}><Icon name="favorite" size={22} />칭찬 {d.praiseTotal.toLocaleString("ko-KR")}개</h2>
      {d.praises.length ? <ul className={s.praises}>{d.praises.slice(0, more).map((p, i) => <li key={i}><Mosaic n={p.from} inline /><Icon name="arrow_forward" size={16} /><Mosaic n={p.to} inline /><Masked text={p.reason} /></li>)}</ul> : <p className={s.empty}>아직 칭찬이 없어요.</p>}
      {d.praises.length > more && <button type="button" className={s.chip} onClick={() => setMore(m => m + 80)}>더 보기</button>}
    </section>
    {d.badges.length > 0 && <section className={s.section}><h2 className={s.h2}><Icon name="military_tech" size={22} />배지</h2>
      <div className={s.chips}>{d.badges.map(b => { const def = badge.get(b.id); return <span key={b.id} className={s.badge} style={{ ["--h" as string]: def?.hue ?? 210 }}><Icon name={def?.icon ?? "military_tech"} size={18} />{def?.label ?? b.id}<b>{b.students}명</b></span>; })}</div>
    </section>}
    {d.games.length > 0 && <section className={s.section}><h2 className={s.h2}><Icon name="sports_esports" size={22} />게임</h2>
      <div className={s.cards}>{d.games.map((g, i) => <div key={i} className={s.card}>
        <strong>{g.kind === "puyo" ? "뿌요뿌요" : g.kind}{g.name && <> · <Masked text={g.name} /></>}</strong>
        <span className={s.meta}>{g.at ? new Date(g.at).toLocaleDateString("ko-KR") : ""}{g.players ? ` · ${g.players}명` : ""}</span>
        {g.matches.slice(0, 8).map((m, j) => <div key={j} className={s.match}>{m.scores.map((x, k) => <span key={k} data-win={x.by === m.winner ? "" : undefined}><Mosaic n={x.by} inline />{x.score.toLocaleString("ko-KR")}</span>)}</div>)}
      </div>)}</div>
    </section>}
    {d.fundings.length > 0 && <section className={s.section}><h2 className={s.h2}><Icon name="volunteer_activism" size={22} />크라우드펀딩</h2>
      <div className={s.cards}>{d.fundings.map((f, i) => <div key={i} className={s.card}>
        <strong><Masked text={f.title} /></strong>
        <span className={s.barTrack}><span style={{ width: `${Math.min(100, (f.raised / Math.max(1, f.goal)) * 100)}%` }} /></span>
        <span className={s.meta}>{f.raised.toLocaleString("ko-KR")} / {f.goal.toLocaleString("ko-KR")} 만보 · {f.backers}명 참여 · {f.status === "completed" ? "구매 완료" : f.status === "funded" ? "목표 달성" : "모으는 중"}</span>
      </div>)}</div>
    </section>}
    {d.market.length > 0 && <section className={s.section}><h2 className={s.h2}><Icon name="storefront" size={22} />러닝마켓</h2>
      <div className={s.chips}>{d.market.map((m, i) => <span key={i} className={s.chip}><Masked text={m.title} /> · {m.price.toLocaleString("ko-KR")}만보{m.bought ? ` · ${m.bought}번 구매` : ""}</span>)}</div>
    </section>}
    {d.stocks.length > 0 && <section className={s.section}><h2 className={s.h2}><Icon name="candlestick_chart" size={22} />모의 투자</h2>
      <div className={s.chips}>{d.stocks.map(x => <span key={x.name} className={s.chip}>{x.name} · 거래 {x.trades}번</span>)}</div>
    </section>}
    {d.groups.length > 0 && <section className={s.section}><h2 className={s.h2}><Icon name="groups" size={22} />모둠</h2>
      <div className={s.cards}>{d.groups.map((g, i) => <div key={i} className={s.card}><strong><Masked text={g.name} /></strong><span className={s.ideas}>{g.members.map((n, j) => <Mosaic key={j} n={n} inline />)}</span></div>)}</div>
    </section>}
  </>;
}
