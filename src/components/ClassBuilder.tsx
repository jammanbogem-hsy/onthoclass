"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { useRouter } from "next/navigation";
import type { User } from "firebase/auth";
import { useAuth } from "@/contexts/AuthContext";
import { GlassCard } from "@/components/Glass";
import { Icon } from "@/components/Icon";
import { BlockView } from "@/components/BlockEditor";
import { useDialog } from "@/components/Dialog";
import {
  createLesson,
  getOntology,
  listLessons,
  listQuestions,
  listSubmissions,
  moveLesson,
  updateLesson,
  type Lesson,
  type Ontology,
  type Submission,
} from "@/lib/lessons";
import { mergeOntologies } from "@/lib/ontology";
import { ExpandableGraph } from "@/components/ExpandableGraph";
import { ReflectAvgBadge } from "@/components/ReflectAvgBadge";
import {
  createProject,
  deleteProject,
  listProjects,
  moveProject,
  updateProject,
  type Project,
} from "@/lib/projects";
import {
  listAllResources,
  listResources,
  moveResource,
  type Resource,
} from "@/lib/resources";
import {
  loadFavs,
  saveFavs,
  type Fav,
  type FavKind,
} from "@/lib/favorites";

/* 색상 라벨 */
const COLORS: Record<
  string,
  { label: string; chip: string; on: string; tint: string }
> = {
  default: { label: "기본", chip: "var(--md-sys-color-surface-container-highest)", on: "var(--md-sys-color-on-surface-variant)", tint: "var(--md-sys-color-surface-container)" },
  teal: { label: "청록", chip: "var(--md-sys-color-primary)", on: "var(--md-sys-color-on-primary)", tint: "var(--md-sys-color-primary-container)" },
  mint: { label: "민트", chip: "var(--md-sys-color-p-80)", on: "var(--md-sys-color-p-20)", tint: "var(--md-brand-mint)" },
  peach: { label: "피치", chip: "var(--md-sys-color-s-80)", on: "var(--md-sys-color-s-20)", tint: "var(--md-sys-color-secondary-container)" },
  sage: { label: "세이지", chip: "var(--md-sys-color-t-80)", on: "var(--md-sys-color-t-20)", tint: "var(--md-sys-color-tertiary-container)" },
  rose: { label: "로즈", chip: "var(--md-sys-color-e-80)", on: "var(--md-sys-color-e-20)", tint: "var(--md-sys-color-error-container)" },
};
const colorOf = (k: string | null) => {
  if (!k) return COLORS.default;
  if (COLORS[k]) return COLORS[k];
  if (k.startsWith("hue:")) {
    const h = Math.max(0, Math.min(360, parseInt(k.slice(4), 10) || 0));
    return {
      label: `색 ${h}°`,
      chip: `hsl(${h} 70% 55%)`,
      on: "#fff",
      tint: `hsl(${h} 70% 93%)`,
    };
  }
  return COLORS.default;
};

const ICONS = [
  "folder", "folder_special", "menu_book", "book", "school", "science",
  "experiment", "calculate", "functions", "public", "language", "translate",
  "history_edu", "psychology", "lightbulb", "rocket_launch", "eco", "palette",
  "brush", "music_note", "sports_soccer", "groups", "quiz", "assignment",
  "flag", "star", "favorite", "map",
];

type DragItem =
  | { kind: "lesson"; id: string }
  | { kind: "resource"; id: string }
  | { kind: "project"; id: string };

type DropTarget =
  | { type: "folder"; projectId: string | null }
  | { type: "lesson"; lessonId: string }
  | { type: "order"; parentProjectId: string | null; afterId: string | null };

const sortPinned = <T extends { pinned: boolean; order: number }>(
  a: T,
  b: T
) => (a.pinned === b.pinned ? a.order - b.order : a.pinned ? -1 : 1);

type Ctx = {
  classId: string;
  isTeacher: boolean;
  user: User | null;
  router: ReturnType<typeof useRouter>;
  projChildren: Record<string, Project[]>;
  rootProjects: Project[];
  lessonsOfProject: Record<string, Lesson[]>;
  lessonChildren: Record<string, Lesson[]>;
  resOf: Record<string, Resource[]>;
  expanded: Record<string, boolean>;
  toggle: (id: string) => void;
  selectedLesson: string | null;
  selectLesson: (id: string) => void;
  openHdd: (focusProjectId?: string) => void;
  isFav: (kind: FavKind, id: string) => boolean;
  toggleFav: (kind: FavKind, id: string) => void;
  dropTarget: string | null;
  reload: () => Promise<void>;
  dragProps: (item: DragItem) => Record<string, unknown>;
  dropZone: (key: string, t: DropTarget) => Record<string, unknown>;
};

/* 인라인 이름 편집 */
function EditableName({
  value,
  onSave,
  className,
  canEdit,
}: {
  value: string;
  onSave: (v: string) => void;
  className?: string;
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(value);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => setV(value), [value]);
  useEffect(() => {
    if (editing) ref.current?.focus();
  }, [editing]);
  if (editing)
    return (
      <input
        ref={ref}
        value={v}
        onChange={(e) => setV(e.target.value)}
        onClick={(e) => e.stopPropagation()}
        onBlur={() => {
          setEditing(false);
          if (v.trim() && v !== value) onSave(v.trim());
          else setV(value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") {
            setV(value);
            setEditing(false);
          }
        }}
        className={`min-w-0 flex-1 rounded-md border border-[var(--md-sys-color-primary)] bg-[var(--md-sys-color-surface)] px-1.5 py-0.5 outline-none ${className ?? ""}`}
      />
    );
  return (
    <span
      onDoubleClick={(e) => {
        if (canEdit) {
          e.stopPropagation();
          setEditing(true);
        }
      }}
      className={`min-w-0 flex-1 truncate ${
        canEdit ? "cursor-pointer" : ""
      } ${className ?? ""}`}
      title={canEdit ? "더블클릭해 이름 수정" : undefined}
    >
      {value || "(제목 없음)"}
    </span>
  );
}

/* ⋮ 설정 메뉴 */
function ItemMenu({
  pinned,
  color,
  icon,
  fallbackIcon,
  favOn,
  onToggleFav,
  onPin,
  onColor,
  onIcon,
  onDelete,
}: {
  pinned: boolean;
  color: string | null;
  icon: string | null;
  fallbackIcon: string;
  favOn?: boolean;
  onToggleFav?: () => void;
  onPin: () => void;
  onColor: (k: string | null) => void;
  onIcon: (n: string) => void;
  onDelete?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number }>({
    top: 0,
    left: 0,
  });
  const btnRef = useRef<HTMLButtonElement>(null);
  const W = 240;
  function toggle(e: React.MouseEvent) {
    e.stopPropagation();
    const r = btnRef.current?.getBoundingClientRect();
    if (r) {
      const left = Math.max(
        8,
        Math.min(r.right - W, window.innerWidth - W - 8)
      );
      const top = Math.min(r.bottom + 6, window.innerHeight - 360);
      setPos({ top: Math.max(8, top), left });
    }
    setOpen((o) => !o);
  }
  return (
    <div className="shrink-0">
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        title="설정"
        className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-highest)]"
      >
        <Icon name="more_vert" size={18} />
      </button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-[55]"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
            }}
          />
          <div
            style={{ position: "fixed", top: pos.top, left: pos.left, width: W }}
            className="z-[60] max-h-[80vh] overflow-y-auto rounded-2xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-high)] p-3 shadow-[var(--md-sys-elevation-3)]"
            onClick={(e) => e.stopPropagation()}
          >
            {onToggleFav && (
              <button
                type="button"
                onClick={() => {
                  onToggleFav();
                  setOpen(false);
                }}
                className="mb-2 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-[var(--md-sys-color-surface-container-highest)]"
              >
                <Icon
                  name="star"
                  size={18}
                  fill={favOn}
                  className={
                    favOn ? "text-[var(--md-sys-color-primary)]" : ""
                  }
                />
                {favOn ? "즐겨찾기에서 제거" : "즐겨찾기에 추가"}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                onPin();
                setOpen(false);
              }}
              className="mb-2 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-[var(--md-sys-color-surface-container-highest)]"
            >
              <Icon
                name="push_pin"
                size={18}
                fill={pinned}
                className={pinned ? "text-[var(--md-sys-color-primary)]" : ""}
              />
              {pinned ? "상단 고정 해제" : "상단 고정"}
            </button>
            <p className="px-2 pb-1 text-xs font-medium text-[var(--md-sys-color-on-surface-variant)]">
              아이콘
            </p>
            <div className="mb-2 grid grid-cols-7 gap-1 px-1">
              {ICONS.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => onIcon(n)}
                  className={`flex h-7 w-7 items-center justify-center rounded-lg hover:bg-[var(--md-sys-color-surface-container-highest)] ${
                    (icon ?? fallbackIcon) === n
                      ? "bg-[var(--md-sys-color-secondary-container)] text-[var(--md-sys-color-on-secondary-container)]"
                      : "text-[var(--md-sys-color-on-surface-variant)]"
                  }`}
                >
                  <Icon name={n} size={18} />
                </button>
              ))}
            </div>
            {/* 색상: 프리셋 + hue 휠 (마지막에) */}
            <p className="px-2 pb-1 text-xs font-medium text-[var(--md-sys-color-on-surface-variant)]">
              색상
            </p>
            <div className="mb-2 flex flex-wrap gap-1.5 px-2">
              {Object.entries(COLORS).map(([k, c]) => (
                <button
                  key={k}
                  type="button"
                  title={c.label}
                  onClick={() => onColor(k === "default" ? null : k)}
                  className={`h-7 w-7 rounded-full ring-1 ring-[var(--md-sys-color-outline-variant)] ${
                    (color ?? "default") === k
                      ? "outline outline-2 outline-[var(--md-sys-color-primary)]"
                      : ""
                  }`}
                  style={{ background: c.chip }}
                />
              ))}
            </div>
            <div className="mb-2 flex flex-col items-center gap-2 px-2">
              <div
                role="button"
                title="원에서 색을 선택"
                onClick={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  const cx = r.left + r.width / 2;
                  const cy = r.top + r.height / 2;
                  let deg =
                    (Math.atan2(e.clientY - cy, e.clientX - cx) * 180) /
                      Math.PI +
                    90;
                  if (deg < 0) deg += 360;
                  onColor(`hue:${Math.round(deg)}`);
                }}
                className="relative h-32 w-32 cursor-crosshair rounded-full shadow-inner"
                style={{
                  background:
                    "conic-gradient(from 0deg, hsl(0 70% 55%), hsl(60 70% 55%), hsl(120 70% 55%), hsl(180 70% 55%), hsl(240 70% 55%), hsl(300 70% 55%), hsl(360 70% 55%))",
                }}
              >
                <div className="absolute inset-5 flex items-center justify-center rounded-full bg-[var(--md-sys-color-surface-container-high)] text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)]">
                  {(() => {
                    const cur = color ?? "";
                    if (cur.startsWith("hue:"))
                      return `${cur.slice(4)}°`;
                    if (COLORS[cur]) return COLORS[cur].label;
                    return "기본";
                  })()}
                </div>
                {/* 현재 hue 표시 점 */}
                {color?.startsWith("hue:") &&
                  (() => {
                    const h =
                      Math.max(
                        0,
                        Math.min(360, parseInt(color.slice(4), 10) || 0)
                      ) % 360;
                    const rad = ((h - 90) * Math.PI) / 180;
                    const R = 56; // 휠 반경 - 점 안쪽
                    const x = 64 + R * Math.cos(rad);
                    const y = 64 + R * Math.sin(rad);
                    return (
                      <span
                        className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
                        style={{
                          left: x,
                          top: y,
                          background: `hsl(${h} 70% 55%)`,
                        }}
                      />
                    );
                  })()}
              </div>
              <button
                type="button"
                onClick={() => onColor(null)}
                className="rounded-full border border-[var(--md-sys-color-outline)] px-3 py-1 text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-highest)]"
              >
                기본(색 없음)
              </button>
            </div>
            {onDelete && (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onDelete();
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-[var(--md-sys-color-error)] hover:bg-[var(--md-sys-color-surface-container-highest)]"
              >
                <Icon name="delete" size={18} />
                삭제
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/* 형제 사이 재정렬 드롭 라인 (프로젝트 순서) */
function OrderLine({
  ctx,
  parentProjectId,
  afterId,
}: {
  ctx: Ctx;
  parentProjectId: string | null;
  afterId: string | null;
}) {
  const key = `order:${parentProjectId ?? "root"}:${afterId ?? "head"}`;
  const hi = ctx.dropTarget === key;
  if (!ctx.isTeacher) return null;
  return (
    <div
      {...ctx.dropZone(key, { type: "order", parentProjectId, afterId })}
      className="h-2"
    >
      <div
        className={`mx-2 h-0.5 rounded-full transition ${
          hi ? "bg-[var(--md-sys-color-primary)]" : "bg-transparent"
        }`}
      />
    </div>
  );
}

/* 차시 노드 */
function LessonNode({
  l,
  depth,
  ctx,
  navigate = false,
}: {
  l: Lesson;
  depth: number;
  ctx: Ctx;
  /** true=클릭 시 차시 페이지로 이동(클래스 그리드), false=우측 선택(HDD) */
  navigate?: boolean;
}) {
  const { classId, isTeacher } = ctx;
  const kids = (ctx.lessonChildren[l.id] ?? []).slice().sort(sortPinned);
  const res = ctx.resOf[l.id] ?? [];
  const open = ctx.expanded[l.id];
  const sel = ctx.selectedLesson === l.id;
  const hi = ctx.dropTarget === `lesson:${l.id}`;
  const c = colorOf(l.color);
  const hasChildren = kids.length > 0 || res.length > 0;
  return (
    <div>
      <div
        {...ctx.dragProps({ kind: "lesson", id: l.id })}
        {...ctx.dropZone(`lesson:${l.id}`, {
          type: "lesson",
          lessonId: l.id,
        })}
        onClick={() =>
          navigate
            ? ctx.router.push(`/lesson/?class=${ctx.classId}&id=${l.id}`)
            : ctx.selectLesson(l.id)
        }
        className={`group flex cursor-pointer items-center gap-1.5 rounded-lg py-2.5 pr-2 transition ${
          sel
            ? "bg-[var(--md-sys-color-secondary-container)]"
            : hi
              ? "ring-2 ring-[var(--md-sys-color-primary)]"
              : "hover:bg-[var(--md-sys-color-surface-container-high)]"
        }`}
        style={{
          paddingLeft: 8 + depth * 18,
          background: hi ? c.tint : undefined,
        }}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (hasChildren) ctx.toggle(l.id);
          }}
          className={`text-[var(--md-sys-color-on-surface-variant)] ${
            hasChildren ? "" : "invisible"
          }`}
        >
          <Icon name={open ? "expand_more" : "chevron_right"} size={20} />
        </button>
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
          style={{ background: c.chip, color: c.on }}
        >
          <Icon name={l.icon || "menu_book"} size={17} />
        </span>
        <EditableName
          value={l.title}
          canEdit={isTeacher}
          className="text-[15px] font-medium"
          onSave={(v) =>
            updateLesson(classId, l.id, { title: v }).then(ctx.reload)
          }
        />
        {l.pinned && (
          <Icon
            name="push_pin"
            size={15}
            fill
            className="shrink-0 text-[var(--md-sys-color-primary)]"
          />
        )}
        {isTeacher && (
          <ReflectAvgBadge cid={classId} lid={l.id} className="ml-auto" />
        )}
        {isTeacher && (
          <ItemMenu
            pinned={l.pinned}
            color={l.color}
            icon={l.icon}
            fallbackIcon="menu_book"
            favOn={ctx.isFav("lesson", l.id)}
            onToggleFav={() => ctx.toggleFav("lesson", l.id)}
            onPin={() =>
              updateLesson(classId, l.id, { pinned: !l.pinned }).then(
                ctx.reload
              )
            }
            onColor={(k) =>
              updateLesson(classId, l.id, { color: k }).then(ctx.reload)
            }
            onIcon={(n) =>
              updateLesson(classId, l.id, { icon: n }).then(ctx.reload)
            }
          />
        )}
      </div>
      {open && hasChildren && (
        <div>
          {res.map((r) => (
            <div
              key={r.id}
              {...ctx.dragProps({ kind: "resource", id: r.id })}
              className="flex items-center gap-1.5 py-1 text-[12px] text-[var(--md-sys-color-on-surface-variant)]"
              style={{ paddingLeft: 8 + (depth + 1) * 18 + 28 }}
            >
              <Icon
                name={
                  r.type === "link"
                    ? "link"
                    : r.type === "file"
                      ? "attach_file"
                      : "sticky_note_2"
                }
                size={13}
              />
              <span className="truncate">{r.title || r.url}</span>
              {isTeacher && (
                <Icon
                  name="drag_indicator"
                  size={11}
                  className="ml-1 cursor-grab"
                />
              )}
            </div>
          ))}
          {kids.map((k) => (
            <LessonNode
              key={k.id}
              l={k}
              depth={depth + 1}
              ctx={ctx}
              navigate={navigate}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* 폴더(프로젝트) 노드 — 재귀 (하위 폴더 + 차시) */
function FolderNode({
  project,
  depth,
  ctx,
}: {
  project: Project;
  depth: number;
  ctx: Ctx;
}) {
  const { classId, isTeacher } = ctx;
  const subs = (ctx.projChildren[project.id] ?? []).slice().sort(sortPinned);
  const lessons = (ctx.lessonsOfProject[project.id] ?? [])
    .slice()
    .sort(sortPinned);
  const open = ctx.expanded[project.id] ?? true;
  const hi = ctx.dropTarget === `folder:${project.id}`;
  const c = colorOf(project.color);
  const dialog = useDialog();
  return (
    <div>
      <div
        {...ctx.dragProps({ kind: "project", id: project.id })}
        {...ctx.dropZone(`folder:${project.id}`, {
          type: "folder",
          projectId: project.id,
        })}
        onClick={() => ctx.toggle(project.id)}
        className={`group flex cursor-pointer items-center gap-1.5 rounded-lg py-3 pr-2 transition ${
          hi
            ? "ring-2 ring-[var(--md-sys-color-primary)]"
            : "hover:bg-[var(--md-sys-color-surface-container-high)]"
        }`}
        style={{
          paddingLeft: 8 + depth * 18,
          background: hi ? c.tint : undefined,
        }}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            ctx.toggle(project.id);
          }}
          className="text-[var(--md-sys-color-on-surface-variant)]"
        >
          <Icon name={open ? "expand_more" : "chevron_right"} size={20} />
        </button>
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
          style={{ background: c.chip, color: c.on }}
        >
          <Icon name={project.icon || "folder"} size={19} />
        </span>
        <EditableName
          value={project.name}
          canEdit={isTeacher}
          className="text-[16px] font-semibold"
          onSave={(v) =>
            updateProject(classId, project.id, { name: v }).then(ctx.reload)
          }
        />
        <span className="shrink-0 text-xs text-[var(--md-sys-color-on-surface-variant)]">
          {subs.length + lessons.length}
        </span>
        {isTeacher && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              ctx.router.push(
                `/project-path/?class=${classId}&project=${project.id}`
              );
            }}
            className="shrink-0 inline-flex items-center gap-1 rounded-full border border-[var(--md-sys-color-primary)] px-2 py-0.5 text-xs font-extrabold tracking-wide text-[var(--md-sys-color-primary)] transition hover:bg-[color-mix(in_srgb,var(--md-sys-color-primary)_8%,transparent)]"
            title="과정중심평가 · 학생별 응답 스트림"
          >
            <Icon name="timeline" size={13} />
            PATH
          </button>
        )}
        {project.pinned && (
          <Icon
            name="push_pin"
            size={15}
            fill
            className="shrink-0 text-[var(--md-sys-color-primary)]"
          />
        )}
        {isTeacher && (
          <ItemMenu
            pinned={project.pinned}
            color={project.color}
            icon={project.icon}
            fallbackIcon="folder"
            favOn={ctx.isFav("project", project.id)}
            onToggleFav={() => ctx.toggleFav("project", project.id)}
            onPin={() =>
              updateProject(classId, project.id, {
                pinned: !project.pinned,
              }).then(ctx.reload)
            }
            onColor={(k) =>
              updateProject(classId, project.id, { color: k }).then(
                ctx.reload
              )
            }
            onIcon={(n) =>
              updateProject(classId, project.id, { icon: n }).then(
                ctx.reload
              )
            }
            onDelete={async () => {
              if (
                await dialog.confirm({
                  title: "폴더 삭제",
                  body: `폴더 "${project.name}" 을(를) 삭제할까요? 안의 차시는 미분류로, 하위 폴더는 상위로 이동합니다.`,
                  danger: true,
                })
              ) {
                await Promise.all([
                  ...lessons.map((l) =>
                    moveLesson(classId, l.id, { projectId: null })
                  ),
                  ...subs.map((s) =>
                    moveProject(classId, s.id, {
                      parentProjectId: project.parentProjectId,
                    })
                  ),
                ]);
                await deleteProject(classId, project.id);
                ctx.reload();
              }
            }}
          />
        )}
      </div>
      {open && (
        <div>
          {isTeacher && (
            <OrderLine
              ctx={ctx}
              parentProjectId={project.id}
              afterId={null}
            />
          )}
          {subs.map((s) => (
            <div key={s.id}>
              <FolderNode project={s} depth={depth + 1} ctx={ctx} />
              {isTeacher && (
                <OrderLine
                  ctx={ctx}
                  parentProjectId={project.id}
                  afterId={s.id}
                />
              )}
            </div>
          ))}
          {lessons.map((l) => (
            <LessonNode key={l.id} l={l} depth={depth + 1} ctx={ctx} />
          ))}
          {subs.length + lessons.length === 0 && (
            <p
              className="py-2 text-xs text-[var(--md-sys-color-on-surface-variant)]"
              style={{ paddingLeft: 8 + (depth + 1) * 18 }}
            >
              비어 있음 — 차시·폴더를 끌어다 놓으세요
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/* 차시 상세: 자료 + 학생 산출물 */
function DetailPane({
  ctx,
  lessonId,
}: {
  ctx: Ctx;
  lessonId: string | null;
}) {
  const [res, setRes] = useState<Resource[]>([]);
  const [subs, setSubs] = useState<Submission[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [graph, setGraph] = useState<Ontology | null>(null);
  const lesson = useMemo(() => {
    for (const arr of Object.values(ctx.lessonsOfProject))
      for (const l of arr) if (l.id === lessonId) return l;
    for (const arr of Object.values(ctx.lessonChildren))
      for (const l of arr) if (l.id === lessonId) return l;
    return null;
  }, [lessonId, ctx.lessonsOfProject, ctx.lessonChildren]);

  useEffect(() => {
    if (!lessonId) return;
    setOpen(null);
    listResources(ctx.classId, lessonId).then(setRes).catch(() => {});
    if (ctx.isTeacher)
      listSubmissions(ctx.classId, lessonId).then(setSubs).catch(() => {});
  }, [lessonId, ctx.classId, ctx.isTeacher]);

  // 차시 지식 그래프 (질문 리프 머지)
  useEffect(() => {
    if (!lessonId) {
      setGraph(null);
      return;
    }
    let alive = true;
    setGraph(null);
    (async () => {
      const qs = await listQuestions(ctx.classId, lessonId).catch(() => []);
      const leaves = (
        await Promise.all(
          qs
            .filter((q) => q.kind === "question")
            .map((q) =>
              getOntology(ctx.classId, lessonId, `q:${q.id}`).catch(
                () => null
              )
            )
        )
      ).filter(Boolean) as Ontology[];
      if (alive) setGraph(mergeOntologies(leaves));
    })();
    return () => {
      alive = false;
    };
  }, [lessonId, ctx.classId]);

  const studentNames = useMemo(() => {
    const m: Record<string, string> = {};
    for (const s of subs) m[s.uid] = s.studentName;
    return m;
  }, [subs]);

  if (!lessonId || !lesson)
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-10 text-center text-sm leading-relaxed text-[var(--md-sys-color-on-surface-variant)]">
        <Icon name="folder_open" size={44} />
        왼쪽 폴더 구조에서 차시를 선택하면
        <br />
        제공 자료와 학생 산출물을 볼 수 있어요.
      </div>
    );

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-[var(--md-sys-color-outline-variant)] p-4">
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold">{lesson.title}</p>
          <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
            {lesson.date || "날짜 미지정"}
          </p>
        </div>
        <button
          onClick={() =>
            ctx.router.push(
              `/lesson/?class=${ctx.classId}&id=${lesson.id}`
            )
          }
          className="btn-accent inline-flex shrink-0 items-center gap-1.5 px-4 py-2 text-xs font-semibold"
        >
          <Icon name="open_in_new" size={16} />
          차시 열기
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {/* 차시 지식 그래프 미리보기 (클릭=확대) */}
        <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
          <Icon name="network_intelligence" size={18} />
          지식 그래프
        </p>
        {graph && graph.nodes.length > 0 ? (
          <div className="mb-5 overflow-hidden rounded-2xl border border-[var(--md-sys-color-outline-variant)] bg-white/40 p-2">
            <ExpandableGraph
              data={graph}
              studentNames={studentNames}
              height={300}
              title={`${lesson.title} 지식맵`}
            />
          </div>
        ) : (
          <p className="mb-5 text-xs text-[var(--md-sys-color-on-surface-variant)]">
            아직 분석된 지식 그래프가 없습니다. “차시 열기 → 지식 맵”에서
            생성하세요.
          </p>
        )}

        <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
          <Icon name="folder" size={18} />
          제공 자료 ({res.length})
        </p>
        {res.length === 0 ? (
          <p className="mb-5 text-xs text-[var(--md-sys-color-on-surface-variant)]">
            자료가 없습니다.
          </p>
        ) : (
          <ul className="mb-5 flex flex-col gap-1.5">
            {res.map((r) => (
              <li
                key={r.id}
                className="flex items-center gap-2 rounded-lg bg-[var(--md-sys-color-surface-container)] px-3 py-2 text-sm"
              >
                <Icon
                  name={
                    r.type === "link"
                      ? "link"
                      : r.type === "file"
                        ? "attach_file"
                        : "sticky_note_2"
                  }
                  size={16}
                  className="text-[var(--md-sys-color-on-surface-variant)]"
                />
                {r.url ? (
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noreferrer"
                    className="min-w-0 flex-1 truncate text-[var(--md-sys-color-primary)] hover:underline"
                  >
                    {r.title || r.url}
                  </a>
                ) : (
                  <span className="min-w-0 flex-1 truncate">
                    {r.title}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}

        {ctx.isTeacher && (
          <>
            <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
              <Icon name="groups" size={18} />
              학생 산출물 ({subs.length})
            </p>
            {subs.length === 0 ? (
              <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                제출물이 없습니다.
              </p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {subs.map((s) => (
                  <li
                    key={s.uid + s.phase}
                    className="rounded-lg bg-[var(--md-sys-color-surface-container)]"
                  >
                    <button
                      onClick={() =>
                        setOpen((o) =>
                          o === s.uid + s.phase ? null : s.uid + s.phase
                        )
                      }
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
                    >
                      <Icon
                        name="description"
                        size={16}
                        className="text-[var(--md-sys-color-on-surface-variant)]"
                      />
                      <span className="flex-1 truncate font-medium">
                        {s.studentName}
                      </span>
                      <span className="rounded-full bg-[var(--md-sys-color-surface-container-highest)] px-2 py-0.5 text-xs text-[var(--md-sys-color-on-surface-variant)]">
                        {s.phase === "pre" ? "수업 전" : "수업 후"}
                      </span>
                      <Icon
                        name={
                          open === s.uid + s.phase
                            ? "expand_less"
                            : "expand_more"
                        }
                        size={18}
                        className="text-[var(--md-sys-color-on-surface-variant)]"
                      />
                    </button>
                    {open === s.uid + s.phase && (
                      <div className="border-t border-[var(--md-sys-color-outline-variant)] p-3">
                        <BlockView value={s.content} />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* 카드형 프로젝트 (기본 보기) */
function ProjectCard({
  project,
  ctx,
}: {
  project: Project;
  ctx: Ctx;
}) {
  const { classId, isTeacher } = ctx;
  const dialog = useDialog();
  const subs = (ctx.projChildren[project.id] ?? []).slice().sort(sortPinned);
  const lessons = (ctx.lessonsOfProject[project.id] ?? [])
    .slice()
    .sort(sortPinned);
  const hi = ctx.dropTarget === `folder:${project.id}`;
  const c = colorOf(project.color);
  return (
    <div
      {...ctx.dragProps({ kind: "project", id: project.id })}
      {...ctx.dropZone(`folder:${project.id}`, {
        type: "folder",
        projectId: project.id,
      })}
      className={`flex flex-col rounded-2xl border bg-[var(--md-sys-color-surface-container-low)] transition sm:aspect-square ${
        hi
          ? "border-[var(--md-sys-color-primary)] ring-2 ring-[var(--md-sys-color-primary)]"
          : "border-[var(--md-sys-color-outline-variant)]"
      }`}
      style={{ borderTop: `4px solid ${c.chip}` }}
    >
      <div className="flex items-center gap-2 border-b border-[var(--md-sys-color-outline-variant)] px-3.5 py-3">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
          style={{ background: c.chip, color: c.on }}
        >
          <Icon name={project.icon || "folder"} size={22} />
        </span>
        <EditableName
          value={project.name}
          canEdit={isTeacher}
          className="text-lg font-semibold"
          onSave={(v) =>
            updateProject(classId, project.id, { name: v }).then(ctx.reload)
          }
        />
        <span className="shrink-0 text-sm text-[var(--md-sys-color-on-surface-variant)]">
          {subs.length + lessons.length}
        </span>
        {project.pinned && (
          <Icon
            name="push_pin"
            size={16}
            fill
            className="shrink-0 text-[var(--md-sys-color-primary)]"
          />
        )}
        {isTeacher && (
          <ItemMenu
            pinned={project.pinned}
            color={project.color}
            icon={project.icon}
            fallbackIcon="folder"
            favOn={ctx.isFav("project", project.id)}
            onToggleFav={() => ctx.toggleFav("project", project.id)}
            onPin={() =>
              updateProject(classId, project.id, {
                pinned: !project.pinned,
              }).then(ctx.reload)
            }
            onColor={(k) =>
              updateProject(classId, project.id, { color: k }).then(
                ctx.reload
              )
            }
            onIcon={(n) =>
              updateProject(classId, project.id, { icon: n }).then(
                ctx.reload
              )
            }
            onDelete={async () => {
              if (
                await dialog.confirm({
                  title: "폴더 삭제",
                  body: `폴더 "${project.name}" 을(를) 삭제할까요? 안의 차시는 미분류로, 하위 폴더는 상위로 이동합니다.`,
                  danger: true,
                })
              ) {
                await Promise.all([
                  ...lessons.map((l) =>
                    moveLesson(classId, l.id, { projectId: null })
                  ),
                  ...subs.map((s) =>
                    moveProject(classId, s.id, {
                      parentProjectId: project.parentProjectId,
                    })
                  ),
                ]);
                await deleteProject(classId, project.id);
                ctx.reload();
              }
            }}
          />
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {subs.length > 0 && (
          <button
            onClick={() => ctx.openHdd(project.id)}
            className="mb-1 flex w-full items-center gap-1.5 rounded-lg bg-[var(--md-sys-color-surface-container)] px-3 py-2 text-xs text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-high)]"
          >
            <Icon name="folder" size={15} />
            하위 폴더 {subs.length}개 — 탐색기에서 열기
          </button>
        )}
        {lessons.length === 0 && subs.length === 0 ? (
          <p className="flex h-full items-center justify-center px-2 text-center text-sm text-[var(--md-sys-color-on-surface-variant)]">
            {isTeacher ? "여기로 차시를 끌어다 놓으세요" : "차시가 없습니다"}
          </p>
        ) : (
          <div className="flex flex-col gap-0.5">
            {lessons.map((l) => (
              <LessonNode key={l.id} l={l} depth={0} ctx={ctx} navigate />
            ))}
          </div>
        )}
      </div>

      {isTeacher && (
        <button
          onClick={async () => {
            if (!ctx.user) return;
            const t = await dialog.prompt({
              title: "새 차시 만들기",
              placeholder: "차시 제목을 입력하세요",
              okLabel: "만들기",
            });
            if (t?.trim()) {
              const lid = await createLesson(classId, ctx.user, {
                title: t,
                date: new Date().toISOString().slice(0, 10),
              });
              await moveLesson(classId, lid, { projectId: project.id });
              ctx.reload();
            }
          }}
          className="flex items-center justify-center gap-1.5 border-t border-[var(--md-sys-color-outline-variant)] py-2.5 text-sm font-medium text-[var(--md-sys-color-primary)] hover:bg-[color-mix(in_srgb,var(--md-sys-color-primary)_8%,transparent)]"
        >
          <Icon name="add" size={18} />
          차시 추가
        </button>
      )}
    </div>
  );
}

export function ClassBuilder({
  classId,
  isTeacher,
}: {
  classId: string;
  isTeacher: boolean;
}) {
  const { user } = useAuth();
  const router = useRouter();
  const dialog = useDialog();
  const [projects, setProjects] = useState<Project[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [selectedLesson, setSelectedLesson] = useState<string | null>(null);
  const [hddOpen, setHddOpen] = useState(false);
  const [favs, setFavs] = useState<Fav[]>([]);
  const dragRef = useRef<DragItem | null>(null);
  const ensuringRef = useRef(false);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const [p0, l0, r] = await Promise.all([
      listProjects(classId),
      listLessons(classId),
      listAllResources(classId),
    ]);
    let p = p0;
    let l = l0;
    const orphans = l.filter((x) => !x.parentLessonId && !x.projectId);
    if (isTeacher && user && orphans.length > 0 && !ensuringRef.current) {
      ensuringRef.current = true;
      try {
        let bucket = p.find((x) => x.name === "미분류");
        if (!bucket) {
          const id = await createProject(classId, user, "미분류");
          p = await listProjects(classId);
          bucket = p.find((x) => x.id === id) ?? bucket;
        }
        if (bucket) {
          const bid = bucket.id;
          await Promise.all(
            orphans.map((o) =>
              moveLesson(classId, o.id, { projectId: bid })
            )
          );
          l = await listLessons(classId);
        }
      } finally {
        ensuringRef.current = false;
      }
    }
    setProjects(p);
    setLessons(l);
    setResources(r);
    setExpanded((prev) => {
      const next = { ...prev };
      for (const pr of p) if (!(pr.id in next)) next[pr.id] = true; // 폴더 기본 펼침
      return next;
    });
    setLoading(false);
  }, [classId, isTeacher, user]);

  useEffect(() => {
    reload();
  }, [reload]);

  const rootProjects = useMemo(
    () =>
      projects
        .filter((p) => !p.parentProjectId)
        .slice()
        .sort(sortPinned),
    [projects]
  );
  const projChildren = useMemo(() => {
    const m: Record<string, Project[]> = {};
    for (const p of projects)
      if (p.parentProjectId) (m[p.parentProjectId] ??= []).push(p);
    return m;
  }, [projects]);
  const lessonsOfProject = useMemo(() => {
    const m: Record<string, Lesson[]> = {};
    for (const l of lessons)
      if (!l.parentLessonId && l.projectId)
        (m[l.projectId] ??= []).push(l);
    return m;
  }, [lessons]);
  const lessonChildren = useMemo(() => {
    const m: Record<string, Lesson[]> = {};
    for (const l of lessons)
      if (l.parentLessonId) (m[l.parentLessonId] ??= []).push(l);
    return m;
  }, [lessons]);
  const resOf = useMemo(() => {
    const m: Record<string, Resource[]> = {};
    for (const r of resources) (m[r.lessonId] ??= []).push(r);
    return m;
  }, [resources]);

  const isDescendant = useCallback(
    (maybeChild: string, ofId: string): boolean => {
      let cur = projects.find((p) => p.id === maybeChild);
      while (cur?.parentProjectId) {
        if (cur.parentProjectId === ofId) return true;
        cur = projects.find((p) => p.id === cur!.parentProjectId);
      }
      return false;
    },
    [projects]
  );

  const applyDrop = useCallback(
    async (target: DropTarget) => {
      const drag = dragRef.current;
      if (!drag) return;

      if (target.type === "order" && drag.kind === "project") {
        const parentId = target.parentProjectId;
        if (drag.id === parentId || isDescendant(parentId ?? "", drag.id)) {
          dragRef.current = null;
          setDropTarget(null);
          return;
        }
        const siblings = projects
          .filter((p) => (p.parentProjectId ?? null) === parentId && p.id !== drag.id)
          .sort(sortPinned);
        const idx = target.afterId
          ? siblings.findIndex((s) => s.id === target.afterId) + 1
          : 0;
        const reordered = [...siblings];
        const moved = projects.find((p) => p.id === drag.id);
        if (moved) reordered.splice(idx, 0, moved);
        await Promise.all(
          reordered.map((s, i) =>
            moveProject(classId, s.id, {
              parentProjectId: parentId,
              order: i * 1000,
            })
          )
        );
      } else if (target.type === "folder") {
        if (drag.kind === "lesson") {
          await moveLesson(classId, drag.id, {
            projectId: target.projectId,
            parentLessonId: null,
            order: Date.now(),
          });
        } else if (drag.kind === "project" && target.projectId) {
          if (
            drag.id !== target.projectId &&
            !isDescendant(target.projectId, drag.id)
          )
            await moveProject(classId, drag.id, {
              parentProjectId: target.projectId,
            });
        }
      } else if (target.type === "lesson") {
        if (drag.kind === "resource") {
          await moveResource(classId, drag.id, target.lessonId);
        } else if (drag.kind === "lesson" && drag.id !== target.lessonId) {
          const t = lessons.find((x) => x.id === target.lessonId);
          const parentId = t?.parentLessonId ?? target.lessonId;
          if (parentId !== drag.id)
            await moveLesson(classId, drag.id, {
              projectId: t?.projectId ?? null,
              parentLessonId: parentId,
              order: Date.now(),
            });
        }
      }
      dragRef.current = null;
      setDropTarget(null);
      await reload();
    },
    [classId, lessons, projects, reload, isDescendant]
  );

  const dragProps = useCallback(
    (item: DragItem) =>
      isTeacher
        ? {
            draggable: true,
            onDragStart: (e: React.DragEvent) => {
              dragRef.current = item;
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", item.id);
              e.stopPropagation();
            },
            onDragEnd: () => {
              dragRef.current = null;
              setDropTarget(null);
            },
          }
        : {},
    [isTeacher]
  );

  const dropZone = useCallback(
    (key: string, target: DropTarget) =>
      isTeacher
        ? {
            onDragOver: (e: React.DragEvent) => {
              e.preventDefault();
              e.stopPropagation();
              setDropTarget((k) => (k === key ? k : key));
            },
            onDragLeave: () =>
              setDropTarget((k) => (k === key ? null : k)),
            onDrop: (e: React.DragEvent) => {
              e.preventDefault();
              e.stopPropagation();
              applyDrop(target);
            },
          }
        : {},
    [isTeacher, applyDrop]
  );

  const toggle = useCallback(
    (id: string) => setExpanded((s) => ({ ...s, [id]: !s[id] })),
    []
  );
  const selectLesson = useCallback(
    (id: string) => setSelectedLesson(id),
    []
  );
  const openHdd = useCallback((focusProjectId?: string) => {
    if (focusProjectId)
      setExpanded((s) => ({ ...s, [focusProjectId]: true }));
    setHddOpen(true);
  }, []);

  useEffect(() => {
    if (user) setFavs(loadFavs(classId, user.uid));
  }, [classId, user]);

  const isFav = useCallback(
    (kind: FavKind, id: string) =>
      favs.some((f) => f.kind === kind && f.id === id),
    [favs]
  );
  const toggleFav = useCallback(
    (kind: FavKind, id: string) =>
      setFavs((prev) => {
        const exists = prev.some(
          (f) => f.kind === kind && f.id === id
        );
        const next = exists
          ? prev.filter((f) => !(f.kind === kind && f.id === id))
          : [...prev, { kind, id }];
        if (user) saveFavs(classId, user.uid, next);
        return next;
      }),
    [classId, user]
  );

  const ctx: Ctx = {
    classId,
    isTeacher,
    user,
    router,
    projChildren,
    rootProjects,
    lessonsOfProject,
    lessonChildren,
    resOf,
    expanded,
    toggle,
    selectedLesson,
    selectLesson,
    openHdd,
    isFav,
    toggleFav,
    dropTarget,
    reload,
    dragProps,
    dropZone,
  };

  const rootHi = dropTarget === "folder:root";

  if (loading)
    return (
      <div className="h-72 animate-pulse rounded-2xl bg-[var(--md-sys-color-surface-container)]" />
    );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {isTeacher && (
          <>
            <button
              onClick={async () => {
                if (!user) return;
                const n = await dialog.prompt({
                  title: "새 폴더 만들기",
                  placeholder: "폴더(프로젝트) 이름",
                  okLabel: "만들기",
                });
                if (n?.trim())
                  await createProject(classId, user, n).then(reload);
              }}
              className="btn-accent inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold"
            >
              <Icon name="create_new_folder" size={18} />
              폴더 만들기
            </button>
            <button
              onClick={async () => {
                if (!user) return;
                const t = await dialog.prompt({
              title: "새 차시 만들기",
              placeholder: "차시 제목을 입력하세요",
              okLabel: "만들기",
            });
                if (t?.trim())
                  await createLesson(classId, user, {
                    title: t,
                    date: new Date().toISOString().slice(0, 10),
                  }).then(reload);
              }}
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--md-sys-color-outline)] px-4 py-2 text-sm font-medium text-[var(--md-sys-color-primary)] hover:bg-[color-mix(in_srgb,var(--md-sys-color-primary)_8%,transparent)]"
            >
              <Icon name="add" size={18} />
              차시 만들기
            </button>
          </>
        )}
        <button
          onClick={() => openHdd()}
          className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-[var(--md-sys-color-primary)] px-4 py-2 text-sm font-semibold text-[var(--md-sys-color-on-primary)] hover:brightness-105"
        >
          <Icon name="hard_drive" size={18} />
          클래스 HDD
        </button>
      </div>

      {/* 기본: 카드형 보기 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {rootProjects.length === 0 ? (
          <GlassCard className="col-span-full flex flex-col items-center gap-2 p-12 text-center">
            <Icon
              name="folder_open"
              size={40}
              className="text-[var(--md-sys-color-on-surface-variant)]"
            />
            <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">
              폴더가 없습니다. 폴더·차시를 만들어 보세요.
            </p>
          </GlassCard>
        ) : (
          rootProjects.map((p) => (
            <ProjectCard key={p.id} project={p} ctx={ctx} />
          ))
        )}
      </div>

      {isTeacher && (
        <p className="flex items-center gap-2 px-1 text-xs text-[var(--md-sys-color-on-surface-variant)]">
          <Icon name="info" size={16} />
          전체 폴더 구조·드래그 정리·학생 산출물 열람은 우측 상단
          &quot;클래스 HDD&quot;에서.
        </p>
      )}

      {/* 클래스 HDD — 폴더 탐색기 모달 */}
      {hddOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(0,0,0,0.32)] p-4"
          onClick={() => setHddOpen(false)}
        >
          <div
            className="flex h-[88vh] min-h-[560px] w-full max-w-6xl flex-col overflow-hidden rounded-3xl bg-[var(--md-sys-color-surface-container-high)] shadow-[var(--md-sys-elevation-3)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 border-b border-[var(--md-sys-color-outline-variant)] px-6 py-5">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)]">
                <Icon name="hard_drive" size={20} />
              </span>
              <p className="text-lg font-semibold">클래스 HDD</p>
              <button
                onClick={() => setHddOpen(false)}
                className="ml-auto flex h-9 w-9 items-center justify-center rounded-full text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-highest)]"
              >
                <Icon name="close" size={20} />
              </button>
            </div>

            <div className="grid min-h-0 flex-1 gap-0 md:grid-cols-[220px_1fr] lg:grid-cols-[240px_1.1fr_1.3fr]">
              {/* 즐겨찾기 사이드바 (Finder식) */}
              <div className="flex min-h-0 flex-col border-b border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] md:border-b-0 md:border-r lg:col-span-1">
                <p className="flex items-center gap-1.5 px-5 py-3.5 text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)]">
                  <Icon name="star" size={15} />
                  즐겨찾기
                </p>
                <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
                  {favs.length === 0 ? (
                    <p className="px-2 py-4 text-xs leading-relaxed text-[var(--md-sys-color-on-surface-variant)]">
                      폴더·차시의 ⋮ 메뉴에서 &quot;즐겨찾기에
                      추가&quot;하면 여기에 표시됩니다.
                    </p>
                  ) : (
                    favs.map((f) => {
                      const proj =
                        f.kind === "project"
                          ? projects.find((p) => p.id === f.id)
                          : null;
                      const les =
                        f.kind === "lesson"
                          ? lessons.find((l) => l.id === f.id)
                          : null;
                      const node = proj ?? les;
                      if (!node) return null;
                      const fc = colorOf(node.color);
                      return (
                        <div
                          key={f.kind + f.id}
                          className="group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-[var(--md-sys-color-surface-container-high)]"
                        >
                          <button
                            onClick={() => {
                              if (proj)
                                setExpanded((s) => ({
                                  ...s,
                                  [proj.id]: true,
                                }));
                              if (les) selectLesson(les.id);
                            }}
                            className="flex min-w-0 flex-1 items-center gap-2 text-left"
                          >
                            <span
                              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md"
                              style={{ background: fc.chip, color: fc.on }}
                            >
                              <Icon
                                name={
                                  node.icon ||
                                  (f.kind === "project"
                                    ? "folder"
                                    : "menu_book")
                                }
                                size={14}
                              />
                            </span>
                            <span className="truncate text-[13px]">
                              {proj ? proj.name : les?.title}
                            </span>
                          </button>
                          <button
                            onClick={() => toggleFav(f.kind, f.id)}
                            title="즐겨찾기 제거"
                            className="shrink-0 text-[var(--md-sys-color-on-surface-variant)] opacity-0 group-hover:opacity-100"
                          >
                            <Icon name="close" size={14} />
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* 폴더 트리 */}
              <div className="flex min-h-0 flex-col border-b border-[var(--md-sys-color-outline-variant)] md:border-b-0 md:border-r">
                <div
                  {...dropZone("folder:root", {
                    type: "folder",
                    projectId: null,
                  })}
                  className={`flex items-center gap-2 border-b px-5 py-3 text-xs transition ${
                    rootHi
                      ? "border-[var(--md-sys-color-primary)] bg-[var(--md-sys-color-primary-container)]"
                      : "border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface-variant)]"
                  }`}
                >
                  <Icon name="drive_folder_upload" size={16} />
                  최상위로 빼려면 여기로 드롭
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto p-3">
                  {isTeacher && (
                    <OrderLine
                      ctx={ctx}
                      parentProjectId={null}
                      afterId={null}
                    />
                  )}
                  {rootProjects.length === 0 ? (
                    <p className="px-3 py-8 text-center text-sm text-[var(--md-sys-color-on-surface-variant)]">
                      폴더가 없습니다.
                    </p>
                  ) : (
                    rootProjects.map((p) => (
                      <div key={p.id}>
                        <FolderNode project={p} depth={0} ctx={ctx} />
                        {isTeacher && (
                          <OrderLine
                            ctx={ctx}
                            parentProjectId={null}
                            afterId={p.id}
                          />
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* 상세: 자료 + 산출물 */}
              <div className="min-h-0 overflow-y-auto border-t border-[var(--md-sys-color-outline-variant)] md:col-span-2 md:border-t-0 lg:col-span-1 lg:border-l">
                <DetailPane ctx={ctx} lessonId={selectedLesson} />
              </div>
            </div>

            {isTeacher && (
              <p className="flex items-center gap-2 border-t border-[var(--md-sys-color-outline-variant)] px-6 py-3.5 text-xs text-[var(--md-sys-color-on-surface-variant)]">
                <Icon name="drag_pan" size={16} />
                폴더를 다른 폴더 위에 놓으면 합치기, 폴더 사이 선에 놓으면
                순서 변경, 위 막대에 놓으면 최상위로. 차시·자료도 드래그
                이동.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
