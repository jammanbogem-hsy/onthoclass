"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/Icon";
import { IconButton } from "@/components/ui";
import {
  deleteAttachment,
  uploadCanvasAttachment,
  uploadFeedbackAttachment,
  uploadSubmissionAttachment,
} from "@/lib/upload";
import type { Attachment } from "@/lib/lessons";

const MAX_ATTACHMENTS = 6;

// 업로드 대상: 질문 제출 / 보드 카드 / 피드백
export type UploadTarget =
  | { kind: "submission"; cid: string; lid: string; qid: string; uid: string }
  | { kind: "canvas"; cid: string; uid: string }
  | { kind: "feedback"; cid: string; uid: string; fid: string };

function doUpload(
  target: UploadTarget,
  file: { type: "image" | "audio"; data: File | Blob; name: string; durationMs?: number }
): Promise<Attachment> {
  if (target.kind === "submission")
    return uploadSubmissionAttachment({ ...target, ...file });
  if (target.kind === "feedback")
    return uploadFeedbackAttachment({ ...target, ...file });
  return uploadCanvasAttachment({ ...target, ...file });
}

/**
 * 이미지 파일들을 업로드해 "새로 추가된 첨부만" 반환(최대 room 개). 이미지가
 * 아니거나 한도 초과분은 건너뛴다. 호출부가 최신 배열에 머지(arrayUnion 등)하도록
 * 델타만 돌려준다 — stale 한 전체배열 덮어쓰기를 피한다.
 */
export async function uploadImages(
  target: UploadTarget,
  files: File[],
  room: number
): Promise<Attachment[]> {
  const added: Attachment[] = [];
  for (const f of files) {
    if (added.length >= room) break;
    if (!f.type.startsWith("image/")) continue;
    added.push(
      await doUpload(target, { type: "image", data: f, name: f.name || "사진" })
    );
  }
  return added;
}

/**
 * (구) 전체배열 반환 버전 — 단일 사용자 로컬 state 용 호환 유지.
 */
export async function uploadImageFiles(
  target: UploadTarget,
  files: File[],
  existing: Attachment[]
): Promise<Attachment[]> {
  const room = Math.max(0, MAX_ATTACHMENTS - existing.length);
  return [...existing, ...(await uploadImages(target, files, room))];
}

/**
 * 첨부 입력 — 사진 촬영/선택 + 음성 녹음.
 * 업로드 즉시 Storage 에 올리고 Attachment 메타데이터를 onChange 로 전달한다.
 */
export function AttachmentField({
  target,
  value,
  onChange,
  onAdd,
  onRemove,
  onRecordingChange,
  disabled,
  compact,
  imageLayout,
}: {
  target: UploadTarget;
  value: Attachment[];
  /** 전체배열 치환(단일 소유 로컬 state 용). onAdd/onRemove 가 있으면 그쪽 우선. */
  onChange?: (next: Attachment[]) => void;
  /** 델타 추가(공유 doc 용 — arrayUnion 등 원자 머지). */
  onAdd?: (added: Attachment[]) => void;
  /** 델타 삭제(공유 doc 용 — arrayRemove). */
  onRemove?: (att: Attachment) => void;
  /** 녹음 시작/종료 알림(부모가 해당 카드를 shield 하도록). */
  onRecordingChange?: (recording: boolean) => void;
  disabled?: boolean;
  compact?: boolean;
  imageLayout?: "thumb" | "full";
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const startedRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 비동기 콜백(rec.onstop, 업로드 완료)이 항상 "최신" 첨부/핸들러를 보도록 ref 미러.
  // → 캡처된 stale value 로 전체배열을 덮어써 녹음/사진이 사라지던 버그 차단.
  const valueRef = useRef(value);
  valueRef.current = value;
  const handlersRef = useRef({ onChange, onAdd, onRemove });
  handlersRef.current = { onChange, onAdd, onRemove };
  const recChangeRef = useRef(onRecordingChange);
  recChangeRef.current = onRecordingChange;

  const commitAdd = (added: Attachment[]) => {
    if (added.length === 0) return;
    const h = handlersRef.current;
    if (h.onAdd) h.onAdd(added);
    else h.onChange?.([...valueRef.current, ...added]);
  };
  const commitRemove = (att: Attachment) => {
    const h = handlersRef.current;
    if (h.onRemove) h.onRemove(att);
    else h.onChange?.(valueRef.current.filter((a) => a.id !== att.id));
  };

  const full = value.length >= MAX_ATTACHMENTS;

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      const rec = recRef.current;
      // 녹음 중 언마운트(페이지/보드 전환, 연결모드 등): 가능하면 저장(onstop)하고
      // 부모 shield 를 반드시 해제(stuck 방지). onstop 미발화로 보호가 남는 문제 차단.
      if (rec && rec.state !== "inactive") {
        try {
          rec.stop();
        } catch {
          /* noop */
        }
      }
      rec?.stream.getTracks().forEach((t) => t.stop());
      recChangeRef.current?.(false);
    };
  }, []);

  async function onPickPhoto(files: FileList | File[] | null) {
    if (!files || files.length === 0) return;
    setErr("");
    setBusy(true);
    try {
      const room = Math.max(0, MAX_ATTACHMENTS - valueRef.current.length);
      commitAdd(await uploadImages(target, Array.from(files), room));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "사진 업로드에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function startRecording() {
    setErr("");
    // 보안 컨텍스트(HTTPS·localhost)가 아니면 getUserMedia 자체가 없다.
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      setErr(
        "이 연결에서는 녹음을 쓸 수 없어요. HTTPS 또는 localhost 로 접속해 주세요."
      );
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const durationMs = Date.now() - startedRef.current;
        const blob = new Blob(chunksRef.current, {
          type: rec.mimeType || "audio/webm",
        });
        setBusy(true);
        try {
          const att = await doUpload(target, {
            type: "audio",
            data: blob,
            name: `녹음 ${new Date().toLocaleTimeString("ko-KR", {
              hour: "2-digit",
              minute: "2-digit",
            })}`,
            durationMs,
          });
          commitAdd([att]);
        } catch (e) {
          setErr(e instanceof Error ? e.message : "음성 업로드에 실패했습니다.");
        } finally {
          setBusy(false);
          onRecordingChange?.(false);
        }
      };
      recRef.current = rec;
      startedRef.current = Date.now();
      rec.start();
      setRecording(true);
      onRecordingChange?.(true); // 부모가 이 카드를 shield(원격 덮어쓰기 차단)
      setElapsed(0);
      timerRef.current = setInterval(() => {
        const s = Math.floor((Date.now() - startedRef.current) / 1000);
        setElapsed(s);
        if (s >= 60) stopRecording(); // 60초 상한(비용·용량 관리)
      }, 250);
    } catch (e) {
      const name = (e as { name?: string })?.name;
      if (name === "NotAllowedError" || name === "SecurityError") {
        setErr(
          "마이크 권한이 거부돼 있어요. 주소창의 자물쇠(사이트 정보) → 마이크를 '허용'으로 바꾼 뒤 다시 눌러주세요."
        );
      } else if (
        name === "NotFoundError" ||
        name === "DevicesNotFoundError"
      ) {
        setErr("마이크를 찾을 수 없어요. 마이크 연결을 확인해 주세요.");
      } else {
        setErr("마이크를 시작할 수 없어요. 권한을 허용한 뒤 다시 시도해 주세요.");
      }
    }
  }

  function stopRecording() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setRecording(false);
    if (recRef.current && recRef.current.state !== "inactive")
      recRef.current.stop();
  }

  async function remove(att: Attachment) {
    commitRemove(att);
    await deleteAttachment(att);
  }

  return (
    <div className="flex flex-col gap-2">
      {/* 자료(사진·녹음)는 버튼 위에 먼저 보이도록 */}
      {value.length > 0 && (
        <AttachmentList
          attachments={value}
          onRemove={disabled ? undefined : remove}
          compact={compact}
          imageLayout={imageLayout}
        />
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={disabled || busy || full || recording}
          onClick={() => fileRef.current?.click()}
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-[var(--md-sys-color-outline)] px-4 py-2.5 text-sm font-semibold text-[var(--md-sys-color-on-surface)] transition hover:bg-black/5 disabled:opacity-40"
        >
          <Icon name="photo_camera" size={18} />
          사진
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            onPickPhoto(e.target.files);
            e.target.value = "";
          }}
        />
        {recording ? (
          <button
            type="button"
            onClick={stopRecording}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full bg-[var(--md-sys-color-error-container)] px-4 py-2.5 text-sm font-semibold text-[var(--md-sys-color-on-error-container)] transition hover:brightness-105"
          >
            <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--md-sys-color-error)]" />
            녹음 멈춤 ({elapsed}s)
          </button>
        ) : (
          <button
            type="button"
            disabled={disabled || busy || full}
            onClick={startRecording}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-[var(--md-sys-color-outline)] px-4 py-2.5 text-sm font-semibold text-[var(--md-sys-color-on-surface)] transition hover:bg-black/5 disabled:opacity-40"
          >
            <Icon name="mic" size={18} />
            음성 녹음
          </button>
        )}
        {busy && (
          <span className="flex items-center gap-1 text-xs text-[var(--md-sys-color-on-surface-variant)]">
            <Icon name="progress_activity" size={14} className="animate-spin" />
            올리는 중…
          </span>
        )}
        {full && (
          <span className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
            최대 {MAX_ATTACHMENTS}개
          </span>
        )}
      </div>

      {err && (
        <p className="rounded-lg bg-[var(--md-sys-color-error-container)] px-3 py-1.5 text-xs text-[var(--md-sys-color-on-error-container)]">
          {err}
        </p>
      )}
    </div>
  );
}

/** 첨부 표시(사진 썸네일 + 음성 플레이어). onRemove 가 있으면 편집 모드. */
export function AttachmentList({
  attachments,
  onRemove,
  compact,
  imageLayout = "thumb",
}: {
  attachments: Attachment[];
  onRemove?: (att: Attachment) => void;
  compact?: boolean;
  /** thumb=작은 격자 썸네일 · full=카드 폭 가득(패들렛식) */
  imageLayout?: "thumb" | "full";
}) {
  const images = attachments.filter((a) => a.type === "image");
  const thumb = compact ? "h-16 w-16" : "h-24 w-24";
  const full = imageLayout === "full";
  const [zoom, setZoom] = useState<Attachment | null>(null);
  return (
    <div className="flex flex-col gap-2">
      <div className={full ? "flex flex-col gap-2" : "flex flex-wrap gap-2"}>
        {images.map((a) => (
          <div key={a.id} className="relative">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setZoom(a);
              }}
              className="block w-full cursor-zoom-in"
              title="크게 보기"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={a.url}
                alt={a.name}
                // 크롬북 메모리 보호 — 20명 보드는 사진 수십 장이 한 페이지에 모인다.
                // 화면에 들어올 때만 받고(lazy), 디코딩은 메인스레드 밖에서(async).
                loading="lazy"
                decoding="async"
                className={
                  full
                    ? "max-h-56 w-full rounded-xl object-cover ring-1 ring-[var(--md-sys-color-outline-variant)]"
                    : `${thumb} rounded-xl object-cover ring-1 ring-[var(--md-sys-color-outline-variant)]`
                }
              />
            </button>
            {onRemove && (
              <button
                type="button"
                onClick={() => onRemove(a)}
                className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--md-sys-color-error)] text-white shadow"
              >
                <Icon name="close" size={12} />
              </button>
            )}
          </div>
        ))}
      </div>
      {attachments
        .filter((a) => a.type === "audio")
        .map((a) => (
          <div
            key={a.id}
            className="flex items-center gap-2 rounded-xl bg-[var(--md-sys-color-surface-container)] px-3 py-2"
          >
            <Icon
              name="graphic_eq"
              size={16}
              className="shrink-0 text-[var(--md-sys-color-primary)]"
            />
            <audio src={a.url} controls className="h-8 max-w-full flex-1" />
            {onRemove && (
              <IconButton
                icon="close"
                label="첨부 삭제"
                size="md"
                onClick={() => onRemove(a)}
                className="text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-error)]"
              />
            )}
          </div>
        ))}
      {zoom && <Lightbox att={zoom} onClose={() => setZoom(null)} />}
    </div>
  );
}

/** 사진 확대 — 캔버스 transform 영향을 피하려 body 로 portal 렌더. */
function Lightbox({ att, onClose }: { att: Attachment; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-label="사진 크게 보기"
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white transition hover:bg-white/25"
        aria-label="닫기"
      >
        <Icon name="close" size={22} />
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={att.url}
        alt={att.name}
        decoding="async"
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] max-w-[92vw] rounded-2xl object-contain shadow-2xl animate-float-in"
      />
    </div>,
    document.body
  );
}
