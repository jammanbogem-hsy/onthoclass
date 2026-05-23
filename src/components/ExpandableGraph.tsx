"use client";

import { useEffect, useState, type ReactNode } from "react";
import { GraphView } from "@/components/GraphView";
import { Icon } from "@/components/Icon";
import type { Ontology, OntologyNode } from "@/lib/lessons";

/** 인라인 그래프 + "크게 보기" 전체 팝업 */
export function ExpandableGraph({
  data,
  studentNames,
  height = 460,
  variant = "inline",
  title,
  nodeColor,
  modalHeader,
}: {
  data: Ontology;
  studentNames?: Record<string, string>;
  height?: number;
  variant?: "inline" | "button";
  title?: string;
  nodeColor?: (n: OntologyNode) => string | undefined;
  // 확대 모달 상단에 함께 표시할 요소(예: 사전/사후/공통/차이 탭)
  modalHeader?: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const nodeCount = data.nodes?.length ?? 0;

  return (
    <div className="relative">
      <style>{`
        @keyframes jam-rainbow { 0%{background-position:0% 50%} 100%{background-position:300% 50%} }
        .jam-rainbow-btn{
          background:linear-gradient(90deg,#ff6f91,#ffb86b,#ffe66d,#23b27a,#4f7cff,#a66bff,#ff6f91);
          background-size:300% 100%; animation:jam-rainbow 6s linear infinite;
        }
      `}</style>

      {variant === "button" ? (
        <button
          onClick={() => setOpen(true)}
          className="jam-rainbow-btn group flex w-full items-center justify-center gap-2.5 rounded-2xl px-5 py-4 text-base font-extrabold text-white shadow-lg transition hover:brightness-105 active:scale-[0.99]"
          title="지식 맵 크게 보기"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/25 backdrop-blur">
            <Icon name="hub" size={22} />
          </span>
          지식 맵 펼쳐보기
          <span className="rounded-full bg-white/25 px-2 py-0.5 text-xs font-bold">
            개념 {nodeCount}
          </span>
          <Icon name="open_in_full" size={18} />
        </button>
      ) : (
        <>
          <button
            onClick={() => setOpen(true)}
            className="absolute right-2 top-2 z-10 inline-flex items-center gap-1 rounded-full bg-white/85 px-3 py-1.5 text-xs font-semibold text-black/70 shadow-sm backdrop-blur transition hover:bg-white"
            title="크게 보기"
          >
            <Icon name="open_in_full" size={14} />
            크게 보기
          </button>
          <GraphView
            data={data}
            studentNames={studentNames}
            height={height}
            title={title}
            nodeColor={nodeColor}
          />
        </>
      )}

      {open && (
        <div
          className="fixed inset-0 z-[60] flex flex-col bg-black/55 p-3 backdrop-blur-sm sm:p-6"
          onClick={() => setOpen(false)}
        >
          <div
            className="glass-strong flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl p-3 sm:p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between px-1">
              <p className="text-sm font-semibold">{title ?? "지식 맵"} (확대)</p>
              <button
                onClick={() => setOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-black/5 hover:bg-black/10 dark:bg-white/10"
                title="닫기 (Esc)"
              >
                <Icon name="close" size={18} />
              </button>
            </div>
            {modalHeader && (
              <div className="mb-2 px-1">{modalHeader}</div>
            )}
            <div className="min-h-0 flex-1 overflow-auto rounded-2xl bg-white/40 p-2 dark:bg-white/5">
              <GraphView
                data={data}
                studentNames={studentNames}
                title={title}
                nodeColor={nodeColor}
                height={
                  typeof window !== "undefined"
                    ? Math.round(window.innerHeight * 0.78)
                    : 720
                }
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
