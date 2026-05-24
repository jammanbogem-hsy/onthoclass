"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { GraphView } from "@/components/GraphView";
import { Icon } from "@/components/Icon";
import { getShare, type ShareDoc } from "@/lib/shares";

function ShareInner() {
  const params = useSearchParams();
  const id = params.get("id");
  const [doc, setDoc] = useState<ShareDoc | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "missing">("loading");

  useEffect(() => {
    if (!id) {
      setState("missing");
      return;
    }
    getShare(id)
      .then((d) => {
        if (d) {
          setDoc(d);
          setState("ok");
        } else {
          setState("missing");
        }
      })
      .catch(() => setState("missing"));
  }, [id]);

  if (state === "loading") {
    return (
      <main className="flex flex-1 items-center justify-center">
        <div className="animate-pulse text-sm text-black/40">불러오는 중…</div>
      </main>
    );
  }
  if (state === "missing" || !doc) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
        <Icon name="link_off" size={36} className="text-black/30" />
        <p className="font-semibold">공유된 지식맵을 찾을 수 없습니다.</p>
        <p className="text-sm text-black/45">
          링크가 만료되었거나 잘못되었을 수 있습니다.
        </p>
      </main>
    );
  }

  return (
    <main className="flex h-screen flex-col">
      <header className="flex items-center gap-2 border-b border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] px-5 py-3">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--md-sys-color-primary)] text-white">
          <Icon name="school" size={16} />
        </span>
        <span className="text-sm font-bold">잼클래스</span>
        <span className="mx-1 text-black/20">·</span>
        <span className="truncate text-sm font-semibold">{doc.title}</span>
        <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-[var(--md-sys-color-surface-container-high)] px-2.5 py-1 text-xs font-medium text-[var(--md-sys-color-on-surface-variant)]">
          <Icon name="visibility" size={13} />
          읽기전용 공유
        </span>
      </header>
      <div className="min-h-0 flex-1 overflow-hidden p-2">
        <GraphView
          data={doc.ontology}
          title={doc.title}
          height={
            typeof window !== "undefined"
              ? Math.round(window.innerHeight - 80)
              : 720
          }
        />
      </div>
    </main>
  );
}

export default function SharePage() {
  return (
    <Suspense
      fallback={
        <main className="flex flex-1 items-center justify-center">
          <div className="animate-pulse text-sm text-black/40">불러오는 중…</div>
        </main>
      }
    >
      <ShareInner />
    </Suspense>
  );
}
