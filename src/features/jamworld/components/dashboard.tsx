"use client";

import { useClassroom } from "./classroom-context";
import { briefForEvidence, parseLessonEvidence } from "../lib/agent/lesson-evidence";
import { GlassButton, GlassLink } from "./glass-surface";

import { useEffect, useRef, useState } from "react";
import { PublishLessonButton } from "./classroom-ui";
import GlassSurface from "./glass-surface";
import { loadViewAtlases } from "@/features/jamworld/lib/render/atlas";
import { readView } from "@/features/jamworld/lib/render/view-pref";
import { drawMiniMap } from "@/features/jamworld/lib/render/minimap";
import { WorldRenderer } from "@/features/jamworld/lib/render/renderer";
import { parseBundle } from "@/features/jamworld/lib/world/bundle";
import { SAMPLE_BUILDERS } from "@/features/jamworld/lib/world/samples";
import {
  agentSessionKey,
  buildTemplate,
  createProject,
  deleteProject,
  importProjectState,
  newId,
  listProjects,
  loadMap,
  type TemplateKey,
} from "@/features/jamworld/lib/world/storage";
import type { MapDoc, Project } from "@/features/jamworld/lib/world/types";

/** 카드 썸네일: 실제 2.5D 렌더러로 맵 전체를 한 번 그린 뒤 캐시를 비운다 (아틀라스 로드 실패 시 미니맵) */
function MiniMap({ doc }: { doc: MapDoc | null }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !doc) return;
    let cancelled = false;
    const draw = () => {
      try {
        const r = new WorldRenderer(canvas, "low", view, true);
        r.resize();
        r.setDoc(doc);
        r.fitToMap(6);
        r.render({ mode: "edit", time: 0 });
        r.clearCaches();
      } catch {
        drawMiniMap(canvas, doc);
      }
    };
    const view = readView();
    void loadViewAtlases(view).then(() => {
      if (!cancelled) draw();
    });
    return () => {
      cancelled = true;
    };
  }, [doc]);
  if (!doc) return <div className="card-thumb blank">＋</div>;
  return (
    <div className="card-thumb">
      <canvas ref={ref} aria-hidden="true" />
    </div>
  );
}

const TEMPLATES: Array<{
  key: TemplateKey;
  name: string;
  description: string;
}> = [
  {
    key: "blank",
    name: "빈 월드",
    description: "잔디 40×30 맵에서 직접 만들기",
  },
  ...SAMPLE_BUILDERS.map((b) => ({
    key: b.key as TemplateKey,
    name: b.name,
    description: b.description,
  })),
];

function timeAgo(ts: number) {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return "방금";
  if (s < 3600) return `${Math.floor(s / 60)}분 전`;
  if (s < 86400) return `${Math.floor(s / 3600)}시간 전`;
  return new Date(ts).toLocaleDateString("ko-KR");
}

export default function Dashboard() {
  const classroom = useClassroom();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [previews, setPreviews] = useState<Record<string, MapDoc | null>>({});
  const [templatePreviews, setTemplatePreviews] = useState<
    Record<string, MapDoc>
  >({});
  const [naming, setNaming] = useState<{
    key: TemplateKey;
    name: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const list = listProjects();
    // Initialize the view from browser-local map storage after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProjects(list);
    const p: Record<string, MapDoc | null> = {};
    for (const pr of list) p[pr.id] = loadMap(pr.mapIds[0]);
    setPreviews(p);
    const t: Record<string, MapDoc> = {};
    for (const b of SAMPLE_BUILDERS)
      t[b.key] = buildTemplate(b.key as TemplateKey, `preview-${b.key}`);
    setTemplatePreviews(t);
  }, []);

  function create() {
    if (!naming) return;
    try {
      const { project } = createProject(
        naming.name.trim() || "새 월드",
        naming.key,
      );
      window.location.href = `/jamworldmake/?view=editor&id=${project.id}`;
    } catch (e) {
      setError(e instanceof Error ? e.message : "만들 수 없습니다");
    }
  }

  async function onImport(file: File) {
    // 프로젝트 번들(여러 페이지·페이지 간 포털)과 맵 한 장 JSON 모두 받는다. 새 id 로 새 월드를 만든다
    const contents = await file.text();
    let raw;try{raw=JSON.parse(contents);}catch{/* Existing map importer provides the JSON error. */}
    if(raw?.format === "moa.lesson-evidence.v1"){
      const evidence=file.size<=250000 ? parseLessonEvidence(raw) : null;
      if(!evidence){setError("수업 기록 파일 형식을 확인해 주세요(최대 250KB).");return;}
      if(classroom?.me?.role!=="teacher"){setError("수업 기록으로 만들기는 교사 로그인 후 사용할 수 있어요.");return;}
      let created: Project | null = null;
      try {
        const {project,map}=createProject((evidence.options.goal || `${evidence.lesson.title} 다음 수업`).slice(0,60),"blank");created=project;
        localStorage.setItem(agentSessionKey(project.id),JSON.stringify({[map.id]:[{role:"user",text:`수업 기록 불러옴: ${evidence.lesson.title}`,evidence,brief:briefForEvidence(evidence)}]}));
        window.location.href=`/jamworldmake/?view=editor&id=${project.id}`;
      }catch(e){if(created)deleteProject(created.id);setError(e instanceof Error?e.message:"기록을 불러오지 못했어요.");}
      return;
    }
    const r = parseBundle(contents, () => newId("map"));
    if (!r.ok) {
      setError(`가져오기 실패: ${r.errors.map((e) => e.message).join(", ")}`);
      return;
    }
    try {
      const p = importProjectState(r.name, r.description, r.ps);
      window.location.href = `/jamworldmake/?view=editor&id=${p.id}`;
    } catch (e) {
      setError(
        `가져오기 실패: ${e instanceof Error ? e.message : "저장소 오류"}`,
      );
    }
  }

  function remove(p: Project) {
    if (!window.confirm(`'${p.name}' 월드를 삭제할까요? 되돌릴 수 없습니다.`))
      return;
    deleteProject(p.id);
    setProjects(listProjects());
  }

  return (
    <main className="dash world-dashboard">
      <header className="dash-top">
        <h1>내 월드</h1>
        <div className="row">
          <GlassButton className="btn" onClick={() => fileRef.current?.click()}>
            파일 가져오기
          </GlassButton>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            aria-label="월드 또는 수업 기록 파일"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onImport(f);
              e.target.value = "";
            }}
          />
          <GlassButton
            className="btn primary"
            onClick={() => setNaming({ key: "blank", name: "새 월드" })}
          >
            ＋ 새 월드
          </GlassButton>
        </div>
      </header>

      <GlassSurface
        className="world-intro"
        contentClassName="hero"
        frost={0.04}
        radius={28}
      >
        <div>
          <h2>어떤 세상을 만들까요?</h2>
          <p>새 월드를 만들거나 아래 예시에서 시작해 보세요.</p>
        </div>
        <div className="hero-art">
          <MiniMap doc={templatePreviews.school ?? null} />
        </div>
      </GlassSurface>

      <div className="section-title">
        <h2>예시로 시작하기</h2>
      </div>
      <div className="grid-cards template-grid">
        {TEMPLATES.map((t) => (
          <GlassSurface
            className="card world-tile"
            contentClassName="world-card-content"
            key={t.key}
            role="article"
            frost={0.04}
          >
            <MiniMap
              doc={t.key === "blank" ? null : (templatePreviews[t.key] ?? null)}
            />
            <div className="card-body">
              <h3>{t.name}</h3>
              <p>{t.description}</p>
              <div className="card-actions">
                <GlassButton
                  className="btn primary sm"
                  onClick={() =>
                    setNaming({
                      key: t.key,
                      name: t.key === "blank" ? "새 월드" : t.name,
                    })
                  }
                >
                  이 월드로 시작
                </GlassButton>
              </div>
            </div>
          </GlassSurface>
        ))}
      </div>

      <div className="section-title">
        <h2>최근 작업</h2>
        <span className="chip">이 브라우저에 저장됨</span>
      </div>
      {projects === null ? null : projects.length === 0 ? (
        <div className="empty">
          아직 만든 월드가 없어요. 새 월드를 만들어 보세요.
        </div>
      ) : (
        <div className="grid-cards">
          {projects.map((p) => (
            <GlassSurface
              className="card world-tile"
              contentClassName="world-card-content"
              key={p.id}
              data-testid="project-card"
              role="article"
              frost={0.04}
            >
              <MiniMap doc={previews[p.id] ?? null} />
              <div className="card-body">
                <h3>{p.name}</h3>
                <p>
                  맵 {p.mapIds.length}개 · {timeAgo(p.updatedAt)} 수정
                </p>
                <div className="card-actions">
                  <GlassLink
                    className="btn sm"
                    href={`/jamworldmake/?view=editor&id=${p.id}`}
                  >
                    편집
                  </GlassLink>
                  <GlassLink
                    className="btn coral sm"
                    href={`/jamworldmake/?view=play&id=${p.id}`}
                  >
                    입장
                  </GlassLink>
                  <PublishLessonButton projectId={p.id} />
                  <GlassButton
                    className="btn ghost sm"
                    onClick={() => remove(p)}
                    aria-label={`${p.name} 삭제`}
                  >
                    삭제
                  </GlassButton>
                </div>
              </div>
            </GlassSurface>
          ))}
        </div>
      )}

      {naming && (
        <div className="modal-back" onClick={() => setNaming(null)}>
          <GlassSurface
            className="modal world-modal"
            frost={0.12}
            radius={28}
            onClick={(e) => e.stopPropagation()}
          >
            <form
              className="world-modal-form"
              role="dialog"
              aria-modal="true"
              aria-labelledby="new-space-title"
              onKeyDown={(e) => {
                if (e.key === "Escape") setNaming(null);
              }}
              onClick={(e) => e.stopPropagation()}
              onSubmit={(e) => {
                e.preventDefault();
                create();
              }}
            >
              <h3 id="new-space-title">새 월드 만들기</h3>
              <div className="field">
                <label htmlFor="space-name">월드 이름</label>
                <input
                  id="space-name"
                  className="input"
                  autoFocus
                  value={naming.name}
                  maxLength={40}
                  onChange={(e) =>
                    setNaming({ ...naming, name: e.target.value })
                  }
                />
              </div>
              <div className="field">
                <label htmlFor="space-tpl">시작 맵</label>
                <select
                  id="space-tpl"
                  className="select"
                  value={naming.key}
                  onChange={(e) =>
                    setNaming({ ...naming, key: e.target.value as TemplateKey })
                  }
                >
                  {TEMPLATES.map((t) => (
                    <option key={t.key} value={t.key}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="row" style={{ justifyContent: "flex-end" }}>
                <GlassButton
                  type="button"
                  className="btn"
                  onClick={() => setNaming(null)}
                >
                  취소
                </GlassButton>
                <GlassButton type="submit" className="btn primary">
                  만들고 편집하기
                </GlassButton>
              </div>
            </form>
          </GlassSurface>
        </div>
      )}
      {error && (
        <div className="toast err" role="alert" onClick={() => setError(null)}>
          {error}
        </div>
      )}
    </main>
  );
}
