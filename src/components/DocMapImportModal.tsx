"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { Button, IconButton } from "@/components/ui";
import { extractOntologyFromDoc } from "@/lib/ai";
import { getOntology, saveOntology, type Ontology } from "@/lib/lessons";
import { ExpandableGraph } from "@/components/ExpandableGraph";

const ACCEPT = "application/pdf,image/png,image/jpeg,image/webp,image/gif";
const ACCEPT_SET = new Set(ACCEPT.split(","));
const MAX_FILES = 5;
const MAX_BYTES = 8 * 1024 * 1024; // 파일당 8MB
// 외부 자료(PDF) 지식맵은 차시당 한 개 스코프에 보관 — 다시 가져오면 갱신.
const IMPORT_SCOPE = "import";

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result);
      resolve(s.slice(s.indexOf(",") + 1)); // data:...;base64, 접두 제거
    };
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

type Stage = "pick" | "parsing" | "view";

/** 패들렛 등 외부 에듀테크의 학생 응답 PDF·이미지 → 지식맵 생성/표시 (교사 전용). */
export function DocMapImportModal({
  cid,
  lid,
  onClose,
  onSaved,
}: {
  cid: string;
  lid: string;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const [stage, setStage] = useState<Stage>("pick");
  const [files, setFiles] = useState<File[]>([]);
  const [err, setErr] = useState("");
  const [ont, setOnt] = useState<Ontology | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // 이미 가져온 외부 자료 지식맵이 있으면 바로 보여준다.
  useEffect(() => {
    let alive = true;
    getOntology(cid, lid, IMPORT_SCOPE)
      .then((o) => {
        if (alive && o && (o.nodes?.length ?? 0) > 0) {
          setOnt(o);
          setStage("view");
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [cid, lid]);

  function addFiles(list: FileList | null) {
    if (!list) return;
    setErr("");
    const next = [...files];
    for (const f of Array.from(list)) {
      if (next.length >= MAX_FILES) break;
      if (f.type && !ACCEPT_SET.has(f.type)) {
        setErr(`${f.name}은(는) 지원하지 않는 형식입니다 (PDF·이미지).`);
        continue;
      }
      if (f.size > MAX_BYTES) {
        setErr(`${f.name}은(는) 너무 큽니다 (8MB 이하).`);
        continue;
      }
      next.push(f);
    }
    setFiles(next.slice(0, MAX_FILES));
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (stage === "parsing" || files.length >= MAX_FILES) return;
    addFiles(e.dataTransfer.files);
  }

  async function run() {
    if (files.length === 0) return;
    setStage("parsing");
    setErr("");
    try {
      const payload = await Promise.all(
        files.map(async (f) => ({
          mediaType: f.type || "application/octet-stream",
          data: await fileToBase64(f),
        }))
      );
      const result = await extractOntologyFromDoc({ classId: cid, files: payload });
      if (!result || (result.nodes?.length ?? 0) === 0) {
        setErr("자료에서 분석할 응답을 찾지 못했습니다. 다른 파일로 다시 시도해 주세요.");
        setStage("pick");
        return;
      }
      await saveOntology(cid, lid, IMPORT_SCOPE, result);
      setOnt(result);
      setFiles([]);
      setStage("view");
      onSaved?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "분석에 실패했습니다.");
      setStage("pick");
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[88vh] w-full max-w-2xl flex-col rounded-3xl bg-[var(--md-sys-color-surface-container-high)] shadow-[var(--md-sys-elevation-3)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-5 pb-2 pt-5">
          <Icon name="hub" size={20} className="text-[var(--md-sys-color-primary)]" />
          <h3 className="text-base font-semibold">외부 자료(PDF)로 지식맵</h3>
          <IconButton
            icon="close"
            label="닫기"
            size="md"
            onClick={onClose}
            className="ml-auto"
          />
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-5">
          {stage !== "view" && (
            <>
              <p className="mb-3 text-xs text-black/55">
                패들렛 등 다른 도구의 학생 응답을 PDF·이미지(캡처)로 올리면, 그 응답들을
                읽어 개념 지도(지식맵)를 만들어 줍니다.
              </p>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={stage === "parsing" || files.length >= MAX_FILES}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                className={`flex w-full flex-col items-center gap-1.5 rounded-2xl border-2 border-dashed px-4 py-8 text-sm text-[var(--md-sys-color-primary)] transition disabled:opacity-40 ${
                  dragging
                    ? "border-[var(--md-sys-color-primary)] bg-[color-mix(in_srgb,var(--md-sys-color-primary)_12%,transparent)]"
                    : "border-[var(--md-sys-color-outline)] hover:bg-[color-mix(in_srgb,var(--md-sys-color-primary)_6%,transparent)]"
                }`}
              >
                <Icon name="add_photo_alternate" size={28} />
                {dragging
                  ? "여기에 놓아주세요"
                  : `파일 선택 또는 드래그 (최대 ${MAX_FILES}개 · 각 8MB)`}
              </button>
              <input
                ref={inputRef}
                type="file"
                accept={ACCEPT}
                multiple
                hidden
                onChange={(e) => {
                  addFiles(e.target.files);
                  e.target.value = "";
                }}
              />

              {files.length > 0 && (
                <ul className="mt-3 flex flex-col gap-1.5">
                  {files.map((f, i) => (
                    <li
                      key={i}
                      className="flex items-center gap-2 rounded-xl bg-[var(--md-sys-color-surface-container)] px-3 py-2 text-sm"
                    >
                      <Icon
                        name={f.type === "application/pdf" ? "picture_as_pdf" : "image"}
                        size={16}
                        className="text-black/45"
                      />
                      <span className="truncate">{f.name}</span>
                      <span className="ml-auto shrink-0 text-[11px] text-black/40">
                        {(f.size / 1024).toFixed(0)}KB
                      </span>
                      {stage !== "parsing" && (
                        <IconButton
                          icon="close"
                          label={`${f.name} 제거`}
                          size="sm"
                          variant="danger"
                          onClick={() => setFiles(files.filter((_, j) => j !== i))}
                          className="-my-1"
                        />
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {err && (
                <p className="mt-3 rounded-xl bg-[var(--md-sys-color-error-container)] px-3 py-2 text-xs text-[var(--md-sys-color-on-error-container)]">
                  {err}
                </p>
              )}

              {stage === "parsing" && (
                <p className="mt-4 flex items-center justify-center gap-2 py-2 text-sm text-black/55">
                  <Icon name="progress_activity" size={18} className="animate-spin" />
                  자료를 읽고 지식맵을 만드는 중… (최대 1~2분)
                </p>
              )}
            </>
          )}

          {stage === "view" && ont && (
            <>
              <p className="mb-2 text-xs text-black/55">
                외부 자료에서 만든 지식맵입니다. 개념을 누르면 자세히 볼 수 있어요.
              </p>
              <ExpandableGraph data={ont} title="외부 자료 지식맵" />
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[var(--md-sys-color-outline-variant)] px-5 py-3">
          {stage === "view" ? (
            <Button
              type="button"
              variant="text"
              size="md"
              onClick={() => {
                setStage("pick");
                setErr("");
              }}
            >
              다시 가져오기
            </Button>
          ) : (
            <Button
              type="button"
              variant="filled"
              size="md"
              onClick={run}
              disabled={files.length === 0 || stage === "parsing"}
            >
              지식맵 만들기
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
