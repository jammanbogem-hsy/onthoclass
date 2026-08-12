"use client";

// 핀 입력 모달 — 지도를 찍으면 열린다.
// ⓪ 가봤던 곳/가고 싶은 곳  ① 어떤 곳(유형+이름)  ② You can ___ there.
// ③ 어떤 기분  ④ 추억(가봤던 곳) / 가고 싶은 이유(가고 싶은 곳) — 선택 입력
// 입력하면 교과서식 영어 문장 미리보기를 만들어 준다.
import { useEffect, useState } from "react";
import {
  CAN_DO_SUGGESTIONS,
  CATEGORIES,
  EMOTIONS,
  PLACE_TYPES,
  pinSentence,
  type PinCategory,
  type TownPin,
} from "./types";

export type PinDraft = {
  placeName: string;
  placeType: string;
  canDo: string;
  emotion: string;
  category: PinCategory;
  memory: string;
};

export function PinModal({
  open,
  initial,
  presetName,
  busy,
  onSave,
  onDelete,
  onClose,
}: {
  open: boolean;
  /** 수정 모드면 기존 핀, 새 핀이면 null */
  initial: TownPin | null;
  /** 새 핀일 때 미리 채울 장소 이름(장소 검색에서 옴) */
  presetName?: string;
  busy: boolean;
  onSave: (draft: PinDraft) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const [category, setCategory] = useState<PinCategory>("visited");
  const [placeType, setPlaceType] = useState("park");
  const [placeName, setPlaceName] = useState("");
  const [canDo, setCanDo] = useState("");
  const [emotion, setEmotion] = useState("");
  const [memory, setMemory] = useState("");
  // 학생이 직접 추가한 "You can ___" 표현 칩(기기에 저장 — localStorage)
  const [myChips, setMyChips] = useState<string[]>([]);
  const [newChip, setNewChip] = useState("");

  // 열릴 때마다 초기화(수정이면 기존 값, 새 핀이면 검색 장소 이름 미리 채움)
  useEffect(() => {
    if (!open) return;
    setCategory(initial?.category ?? "visited");
    setPlaceType(initial?.placeType ?? "park");
    setPlaceName(initial?.placeName ?? presetName ?? "");
    setCanDo(initial?.canDo ?? "");
    setEmotion(initial?.emotion ?? "");
    setMemory(initial?.memory ?? "");
    setNewChip("");
    try {
      const saved = JSON.parse(localStorage.getItem("eng54:myCanDo") ?? "[]");
      if (Array.isArray(saved)) setMyChips(saved.filter((s) => typeof s === "string"));
    } catch {}
  }, [open, initial, presetName]);

  function saveChips(next: string[]) {
    setMyChips(next);
    try {
      localStorage.setItem("eng54:myCanDo", JSON.stringify(next));
    } catch {}
  }

  function addChip() {
    const t = newChip.trim().slice(0, 60);
    if (!t) return;
    saveChips(Array.from(new Set([...myChips, t])).slice(0, 20));
    setCanDo(t);
    setNewChip("");
  }

  if (!open) return null;

  const canSave = placeName.trim().length > 0 && canDo.trim().length > 0 && !!emotion && !busy;
  const sentence = pinSentence(placeType, placeName, canDo, emotion, category);
  const isWish = category === "wish";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-[var(--md-sys-color-surface)] p-5 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-[var(--md-sys-color-on-surface)]">
            <span className="emoji-noto">📍</span> {initial ? "내 핀 고치기" : "이곳은 어떤 곳인가요?"}
          </h2>
          <button
            onClick={onClose}
            className="rounded-full px-3 py-1 text-sm font-medium text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-high)]"
          >
            닫기 ✕
          </button>
        </div>

        {/* 0. 카테고리 — 가봤던 곳 / 가고 싶은 곳 (핀 색이 달라져요) */}
        <div className="mb-4 grid grid-cols-2 gap-1.5">
          {CATEGORIES.map((c) => {
            const on = category === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setCategory(c.id)}
                className="rounded-2xl border-2 py-2.5 text-sm font-bold transition"
                style={
                  on
                    ? { borderColor: c.color, background: `${c.color}1A`, color: c.color }
                    : {
                        borderColor: "var(--md-sys-color-outline-variant)",
                        color: "var(--md-sys-color-on-surface-variant)",
                      }
                }
              >
                <span className="emoji-noto">{c.emoji}</span> {c.ko}
              </button>
            );
          })}
        </div>

        {/* 1. 장소 유형 + 이름 */}
        <p className="mb-2 text-sm font-bold text-[var(--md-sys-color-on-surface)]">
          1. 어떤 곳인가요?
        </p>
        <div className="mb-2 flex flex-wrap gap-1.5">
          {PLACE_TYPES.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPlaceType(p.id)}
              className={[
                "flex items-center gap-1 rounded-full border px-2.5 py-1.5 text-[13px] font-medium transition",
                placeType === p.id
                  ? "border-[var(--md-sys-color-primary)] bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)]"
                  : "border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface-variant)]",
              ].join(" ")}
            >
              <span className="emoji-noto text-base leading-none">{p.emoji}</span>
              {p.ko}
            </button>
          ))}
        </div>
        <input
          value={placeName}
          onChange={(e) => setPlaceName(e.target.value.slice(0, 60))}
          placeholder={placeType === "etc" ? "영어로 적어요 (예: library)" : "장소 이름 (예: 늘푸른 공원)"}
          className="m3-field w-full"
        />
        {placeType === "etc" && (
          <p className="mt-1 text-xs text-[var(--md-sys-color-primary)]">
            💡 ‘기타’는 위에 적은 말이 영어 문장에 들어가요 — 영어로 적어 보세요!
          </p>
        )}

        {/* 2. 할 수 있는 일 */}
        <p className="mt-5 mb-2 text-sm font-bold text-[var(--md-sys-color-on-surface)]">
          2. 거기서 무엇을 할 수 {isWish ? "있을까요?" : "있나요?"}
        </p>
        <div className="flex items-center gap-2 rounded-2xl bg-[var(--md-sys-color-surface-container-high)] px-3 py-2.5">
          <span className="shrink-0 text-sm font-bold text-[var(--md-sys-color-primary)]">
            You can
          </span>
          <input
            value={canDo}
            onChange={(e) => setCanDo(e.target.value.slice(0, 140))}
            placeholder="fly a kite"
            className="w-full bg-transparent text-sm outline-none"
          />
          <span className="shrink-0 text-sm font-bold text-[var(--md-sys-color-primary)]">
            there.
          </span>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {CAN_DO_SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setCanDo(s)}
              className={[
                "rounded-full border px-2.5 py-1 text-xs transition",
                canDo === s
                  ? "border-[var(--md-sys-color-primary)] bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)] font-semibold"
                  : "border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface-variant)]",
              ].join(" ")}
            >
              {s}
            </button>
          ))}
          {/* 내가 추가한 표현 — ✕로 삭제 가능 */}
          {myChips.map((s) => (
            <span
              key={s}
              className={[
                "flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition",
                canDo === s
                  ? "border-[var(--md-sys-color-primary)] bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)] font-semibold"
                  : "border-dashed border-[var(--md-sys-color-outline)] bg-[var(--md-sys-color-secondary-container)] text-[var(--md-sys-color-on-secondary-container)]",
              ].join(" ")}
            >
              <button type="button" onClick={() => setCanDo(s)}>
                {s}
              </button>
              <button
                type="button"
                onClick={() => saveChips(myChips.filter((c) => c !== s))}
                className="opacity-60 hover:opacity-100"
                title="내 표현 삭제"
              >
                ✕
              </button>
            </span>
          ))}
        </div>
        {/* 나만의 표현 추가 */}
        <div className="mt-2 flex items-center gap-2">
          <input
            value={newChip}
            onChange={(e) => setNewChip(e.target.value.slice(0, 60))}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                e.preventDefault();
                addChip();
              }
            }}
            placeholder="나만의 표현 추가 (예: ride a horse)"
            className="m3-field flex-1 !py-2 text-sm"
          />
          <button
            type="button"
            onClick={addChip}
            disabled={!newChip.trim()}
            className="shrink-0 rounded-full border border-[var(--md-sys-color-primary)] px-3.5 py-2 text-xs font-bold text-[var(--md-sys-color-primary)] disabled:opacity-40"
          >
            + 추가
          </button>
        </div>

        {/* 3. 감정 */}
        <p className="mt-5 mb-2 text-sm font-bold text-[var(--md-sys-color-on-surface)]">
          3. {isWish ? "가면 어떤 기분이 들 것 같나요?" : "이곳에서 어떤 기분이 드나요?"}
        </p>
        <div className="grid grid-cols-4 gap-1.5">
          {EMOTIONS.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => setEmotion(e.id)}
              className={[
                "flex flex-col items-center gap-0.5 rounded-2xl border py-2.5 transition",
                emotion === e.id
                  ? "border-[var(--md-sys-color-primary)] bg-[var(--md-sys-color-primary-container)]"
                  : "border-[var(--md-sys-color-outline-variant)]",
              ].join(" ")}
            >
              <span className="emoji-noto text-[28px] leading-none">{e.emoji}</span>
              <span
                className={[
                  "text-[11px] font-semibold",
                  emotion === e.id
                    ? "text-[var(--md-sys-color-on-primary-container)]"
                    : "text-[var(--md-sys-color-on-surface-variant)]",
                ].join(" ")}
              >
                {e.ko}
              </span>
            </button>
          ))}
        </div>

        {/* 4. 추억 / 가고 싶은 이유 (선택) */}
        <p className="mt-5 mb-2 text-sm font-bold text-[var(--md-sys-color-on-surface)]">
          4. {isWish ? "왜 가 보고 싶나요?" : "이곳에서 어떤 추억이 있나요?"}{" "}
          <span className="font-normal text-[var(--md-sys-color-on-surface-variant)]">(선택)</span>
        </p>
        <textarea
          value={memory}
          onChange={(e) => setMemory(e.target.value.slice(0, 300))}
          placeholder={
            isWish
              ? "예: 친구가 정말 재미있다고 해서 꼭 가 보고 싶어요!"
              : "예: 가족과 자전거를 타다가 아이스크림을 먹었어요 🍦"
          }
          rows={3}
          className="m3-field w-full resize-none"
        />

        {/* 영어 문장 미리보기 */}
        {(placeName.trim() || canDo.trim() || emotion) && (
          <div className="mt-4 rounded-2xl bg-[var(--md-sys-color-tertiary-container)] px-4 py-3">
            <p className="text-[11px] font-bold text-[var(--md-sys-color-on-tertiary-container)] opacity-70">
              English sentence
            </p>
            <p className="mt-0.5 text-sm font-semibold leading-relaxed text-[var(--md-sys-color-on-tertiary-container)]">
              {sentence || "…"}
            </p>
          </div>
        )}

        <div className="mt-5 flex gap-2">
          {initial && onDelete && (
            <button
              onClick={onDelete}
              disabled={busy}
              className="rounded-full border border-[var(--md-sys-color-error)] px-4 py-3 text-sm font-bold text-[var(--md-sys-color-error)] disabled:opacity-40"
            >
              삭제
            </button>
          )}
          <button
            onClick={() =>
              canSave && onSave({ placeName, placeType, canDo, emotion, category, memory })
            }
            disabled={!canSave}
            className="flex-1 rounded-full bg-[var(--md-sys-color-primary)] px-6 py-3 text-base font-bold text-[var(--md-sys-color-on-primary)] transition hover:brightness-105 disabled:opacity-40"
          >
            {busy ? "저장 중…" : initial ? "고친 내용 저장" : "핀 꽂기 📌"}
          </button>
        </div>
      </div>
    </div>
  );
}
