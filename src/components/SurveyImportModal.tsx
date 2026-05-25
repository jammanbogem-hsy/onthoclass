"use client";

import { useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { parseSurveyDoc } from "@/lib/ai";
import type { SurveyItem } from "@/lib/lessons";

const ACCEPT = "application/pdf,image/png,image/jpeg,image/webp,image/gif";
const ACCEPT_SET = new Set(ACCEPT.split(","));
const MAX_FILES = 5;
const MAX_BYTES = 8 * 1024 * 1024; // 파일당 8MB

function newId() {
  return "it_" + Math.random().toString(36).slice(2, 9);
}

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

type Stage = "pick" | "parsing" | "review";

/** PDF·이미지·문서 → 설문 문항 추출 후 교사 검토/추가 모달. */
export function SurveyImportModal({
  classId,
  onClose,
  onAdd,
}: {
  classId: string;
  onClose: () => void;
  onAdd: (items: SurveyItem[]) => void;
}) {
  const [stage, setStage] = useState<Stage>("pick");
  const [files, setFiles] = useState<File[]>([]);
  const [err, setErr] = useState("");
  const [draft, setDraft] = useState<SurveyItem[]>([]);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

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
      const res = await parseSurveyDoc({ classId, files: payload });
      const items: SurveyItem[] = (res.items ?? []).map((it) => ({
        id: newId(),
        type: it.type,
        prompt: it.prompt,
        ...(it.type === "choice"
          ? { options: it.options?.length ? it.options : ["", ""] }
          : {}),
        ...(it.type === "scale"
          ? {
              scaleMax: it.scaleMax > 0 ? it.scaleMax : 5,
              ...(it.scaleLow || it.scaleHigh
                ? { scaleLabels: { low: it.scaleLow, high: it.scaleHigh } }
                : {}),
            }
          : {}),
      }));
      if (items.length === 0) {
        setErr("문항을 찾지 못했습니다. 다른 파일로 다시 시도해 주세요.");
        setStage("pick");
        return;
      }
      setDraft(items);
      setPicked(new Set(items.map((_, i) => i)));
      setStage("review");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "파싱에 실패했습니다.");
      setStage("pick");
    }
  }

  function confirm() {
    const chosen = draft.filter((_, i) => picked.has(i));
    if (chosen.length === 0) return;
    onAdd(chosen);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-3xl bg-[var(--md-sys-color-surface-container-high)] shadow-[var(--md-sys-elevation-3)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-5 pb-2 pt-5">
          <Icon
            name="upload_file"
            size={20}
            className="text-[var(--md-sys-color-primary)]"
          />
          <h3 className="text-base font-semibold">문서에서 문항 가져오기</h3>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto rounded-full p-1.5 text-black/45 hover:bg-black/5"
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-5">
          {stage !== "review" && (
            <>
              <p className="mb-3 text-xs text-black/55">
                PDF·이미지·캡처를 올리면 척도/객관식/주관식 문항을 자동으로
                추출합니다. 추출 후 검토·수정할 수 있어요.
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
                        name={
                          f.type === "application/pdf"
                            ? "picture_as_pdf"
                            : "image"
                        }
                        size={16}
                        className="text-black/45"
                      />
                      <span className="truncate">{f.name}</span>
                      <span className="ml-auto shrink-0 text-[11px] text-black/40">
                        {(f.size / 1024).toFixed(0)}KB
                      </span>
                      {stage !== "parsing" && (
                        <button
                          type="button"
                          onClick={() =>
                            setFiles(files.filter((_, j) => j !== i))
                          }
                          className="rounded p-0.5 text-black/30 hover:text-rose-500"
                        >
                          <Icon name="close" size={14} />
                        </button>
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
                  문항을 추출하는 중…
                </p>
              )}
            </>
          )}

          {stage === "review" && (
            <>
              <p className="mb-3 text-xs text-black/55">
                추출된 {draft.length}개 문항입니다. 추가할 항목을 선택하세요
                (추가 후 빌더에서 세부 수정 가능).
              </p>
              <ul className="flex flex-col gap-2">
                {draft.map((it, i) => (
                  <li
                    key={it.id}
                    className={`rounded-2xl border px-3 py-2.5 transition ${
                      picked.has(i)
                        ? "border-[var(--md-sys-color-primary)] bg-[color-mix(in_srgb,var(--md-sys-color-primary)_6%,transparent)]"
                        : "border-[var(--md-sys-color-outline-variant)] opacity-60"
                    }`}
                  >
                    <label className="flex cursor-pointer items-start gap-2.5">
                      <input
                        type="checkbox"
                        checked={picked.has(i)}
                        onChange={() => {
                          const n = new Set(picked);
                          if (n.has(i)) n.delete(i);
                          else n.add(i);
                          setPicked(n);
                        }}
                        className="mt-0.5"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">
                          {it.prompt || "(문항)"}
                        </p>
                        <span className="mt-1 inline-block rounded-full bg-[var(--md-sys-color-surface-container-high)] px-2 py-0.5 text-[10px] text-black/55">
                          {it.type === "scale"
                            ? `척도 ${it.scaleMax ?? 5}점`
                            : it.type === "choice"
                              ? `객관식 ${it.options?.length ?? 0}개`
                              : "주관식"}
                        </span>
                        {it.type === "choice" && (it.options?.length ?? 0) > 0 && (
                          <p className="mt-1 truncate text-[11px] text-black/45">
                            {(it.options ?? []).join(" · ")}
                          </p>
                        )}
                      </div>
                    </label>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[var(--md-sys-color-outline-variant)] px-5 py-3">
          {stage === "review" ? (
            <>
              <button
                type="button"
                onClick={() => setStage("pick")}
                className="rounded-full px-4 py-2 text-sm font-medium text-black/55 hover:bg-black/5"
              >
                다시 선택
              </button>
              <button
                type="button"
                onClick={confirm}
                disabled={picked.size === 0}
                className="btn-accent px-5 py-2 text-sm disabled:opacity-40"
              >
                {picked.size}개 추가
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={run}
              disabled={files.length === 0 || stage === "parsing"}
              className="btn-accent px-5 py-2 text-sm disabled:opacity-40"
            >
              문항 추출
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
