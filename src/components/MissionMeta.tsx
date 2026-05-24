"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { listLessons } from "@/lib/lessons";
import { listProjects } from "@/lib/projects";
import type { Quest } from "@/lib/xp";

export type LessonMeta = Record<
  string,
  { title: string; date: string; projectName: string }
>;

/** 학급의 차시 → {제목, 날짜, 프로젝트명} 매핑 로드 (미션 라벨용) */
export function useLessonMeta(cid: string | null): LessonMeta {
  const [meta, setMeta] = useState<LessonMeta>({});
  useEffect(() => {
    if (!cid) return;
    let alive = true;
    Promise.all([listLessons(cid), listProjects(cid)])
      .then(([lessons, projects]) => {
        if (!alive) return;
        const pname: Record<string, string> = {};
        projects.forEach((p) => (pname[p.id] = p.name));
        const m: LessonMeta = {};
        lessons.forEach((l) => {
          m[l.id] = {
            title: l.title,
            date: l.date,
            projectName: l.projectId ? (pname[l.projectId] ?? "") : "",
          };
        });
        setMeta(m);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [cid]);
  return meta;
}

function fmtMs(ms: number | null): string {
  if (!ms) return "";
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** 미션 라벨: 날짜 · 프로젝트 · 차시(활동) */
export function MissionMeta({
  quest,
  meta,
}: {
  quest: Quest;
  meta: LessonMeta;
}) {
  const link = quest.link;
  const lm = link ? meta[link.lessonId] : undefined;
  const date = lm?.date || fmtMs(quest.createdAt);

  const chip =
    "inline-flex items-center gap-1 rounded-full bg-[var(--md-sys-color-surface-container-high)] px-2 py-0.5 text-xs font-medium text-black/55";

  return (
    <div className="mt-1 flex flex-wrap gap-1.5">
      {date && (
        <span className={chip}>
          <Icon name="calendar_today" size={12} />
          {date}
        </span>
      )}
      {lm?.projectName && (
        <span className={chip}>
          <Icon name="folder" size={12} />
          {lm.projectName}
        </span>
      )}
      {link && (
        <span className={chip}>
          <Icon name="menu_book" size={12} />
          {link.lessonTitle}
          {link.activityTitle ? ` · ${link.activityTitle}` : ""}
        </span>
      )}
    </div>
  );
}
