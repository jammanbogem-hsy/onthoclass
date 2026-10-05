"use client";

/**
 * 퀴즈런 문제 세트 편집기 (교사용, 1차 = 교사 제작 모드).
 *
 * 학생 출제 모드는 2차. 그때는 빙고의 제출→선정 흐름을 문항으로 바꿔 쓰면 된다.
 * 문항 모양(options/answerIndex)은 러닝크루 차시 문항과 같으므로, 나중에
 * 차시 문항 가져오기나 문서 자동 생성(parseSurveyDoc) 결과를 그대로 꽂을 수 있다.
 */

import { useCallback, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import type { QuizItem } from "@/lib/quizrun";
import { QuizImportModal } from "@/components/quizrun/QuizImportModal";
import { saveQuizSet } from "@/lib/quizBank";
import { useDialog } from "@/components/Dialog";
import { quizCsvTemplate, quizFromCsv, quizToCsv } from "@/lib/puyo-quiz";

/** 엑셀이 저장한 한글 CSV 는 CP949(EUC-KR)인 경우가 많다 — UTF-8 로 안 읽히면 그쪽으로 다시 읽는다. */
async function readCsvText(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  try { return new TextDecoder("utf-8", { fatal: true }).decode(buf); }
  catch { return new TextDecoder("euc-kr").decode(buf); }
}

function saveFile(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a"); a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const newItem = (): QuizItem => ({
  id: "q_" + Math.random().toString(36).slice(2, 10),
  prompt: "",
  options: ["", ""],
  answerIndex: 0,
});

/** 문항이 게임에 쓰일 수 있는 상태인가 — 저장 전 검사와 목록 경고에 함께 쓴다 */
export function isIncomplete(it: QuizItem): boolean {
  return (
    !it.prompt.trim() ||
    it.options.filter((o) => o.trim()).length < 2 ||
    !it.options[it.answerIndex]?.trim()
  );
}

export function QuizSetEditor({
  cid,
  ownerUid,
  items,
  onChange,
  emptyHint = "학생은 이 문제를 풀어 러닝 에너지를 충전합니다.",
}: {
  /** 지난 게임·차시에서 문제를 불러오기 위해 필요 */
  cid: string;
  /** 문제 은행(교사 소유)에 저장·조회하기 위해 필요 */
  ownerUid: string;
  items: QuizItem[];
  onChange: (items: QuizItem[]) => void;
  /** 문제가 없을 때 안내 문구 끝에 붙이는 설명(게임마다 다름) */
  emptyHint?: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [csvNote, setCsvNote] = useState<{ added: number; errors: string[] } | null>(null);

  /** CSV 올리기 — 지금 목록 뒤에 이어 붙인다. 잘못된 줄은 건너뛰고 몇 번째 줄인지 알려 준다. */
  async function importCsv(file: File) {
    const text = await readCsvText(file);
    const { items: got, errors } = quizFromCsv(text, () => newItem().id);
    if (got.length) onChange([...items, ...got]);
    setCsvNote({ added: got.length, errors });
  }
  const [open, setOpen] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const dialog = useDialog();

  /** 지금 만든 문제를 은행에 저장 — 다른 반·다음 학기에서 쓰기 위해 */
  async function saveToBank() {
    const usable = items.filter((it) => !isIncomplete(it));
    if (usable.length === 0) return;
    const name = await dialog.prompt({
      title: "문제 은행에 저장",
      placeholder: "세트 이름 (예: 5학년 과학 3단원 용액)",
      okLabel: "저장",
    });
    if (!name?.trim()) return;
    await saveQuizSet(ownerUid, { name, items: usable });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const patch = useCallback(
    (id: string, p: Partial<QuizItem>) =>
      onChange(items.map((it) => (it.id === id ? { ...it, ...p } : it))),
    [items, onChange]
  );

  const add = () => {
    const it = newItem();
    onChange([...items, it]);
    setOpen(it.id);
  };

  const remove = (id: string) => onChange(items.filter((it) => it.id !== id));

  const setOption = (it: QuizItem, i: number, v: string) =>
    patch(it.id, { options: it.options.map((o, k) => (k === i ? v : o)) });

  const addOption = (it: QuizItem) =>
    patch(it.id, { options: [...it.options, ""] });

  /** 선택지를 지우면 정답 위치가 밀리므로 answerIndex 를 함께 보정한다 */
  const removeOption = (it: QuizItem, i: number) => {
    if (it.options.length <= 2) return; // 최소 2지선다
    const options = it.options.filter((_, k) => k !== i);
    const answerIndex =
      it.answerIndex === i
        ? 0
        : it.answerIndex > i
          ? it.answerIndex - 1
          : it.answerIndex;
    patch(it.id, { options, answerIndex });
  };

  const bad = items.filter(isIncomplete).length;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">
          문제 {items.length}개
          {bad > 0 && (
            <span className="ml-2 rounded-full bg-[var(--md-sys-color-error-container)] px-2 py-0.5 text-xs font-medium text-[var(--md-sys-color-on-error-container)]">
              미완성 {bad}개
            </span>
          )}
        </p>
        <div className="flex items-center gap-1.5">
          {items.some((it) => !isIncomplete(it)) && (
            <button
              type="button"
              onClick={saveToBank}
              className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold transition ${
                saved
                  ? "bg-[var(--md-sys-color-tertiary-container)] text-[var(--md-sys-color-on-tertiary-container)]"
                  : "border border-[var(--md-sys-color-outline)] text-[var(--md-sys-color-primary)]"
              }`}
            >
              <Icon name={saved ? "check" : "inventory_2"} size={15} />
              {saved ? "저장됨" : "은행에 저장"}
            </button>
          )}
          <button
            type="button"
            onClick={() => setImportOpen(true)}
            className="inline-flex items-center gap-1 rounded-full border border-[var(--md-sys-color-outline)] px-3 py-1.5 text-xs font-bold text-[var(--md-sys-color-primary)]"
          >
            <Icon name="download" size={15} />
            불러오기
          </button>
          <button
            type="button"
            onClick={add}
            className="inline-flex items-center gap-1 rounded-full bg-[var(--md-sys-color-primary)] px-3 py-1.5 text-xs font-bold text-[var(--md-sys-color-on-primary)]"
          >
            <Icon name="add" size={15} />
            문제 추가
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 rounded-xl bg-[var(--md-sys-color-surface-container)] px-3 py-2">
        <Icon name="table_view" size={16} className="text-[var(--md-sys-color-on-surface-variant)]" />
        <span className="mr-auto text-xs text-[var(--md-sys-color-on-surface-variant)]">엑셀로 한꺼번에 만들기</span>
        <button type="button" onClick={() => saveFile("문제_템플릿.csv", quizCsvTemplate())}
          className="inline-flex items-center gap-1 rounded-full border border-[var(--md-sys-color-outline)] px-3 py-1.5 text-xs font-bold text-[var(--md-sys-color-primary)]">
          <Icon name="download" size={15} />CSV 템플릿
        </button>
        <button type="button" onClick={() => fileRef.current?.click()}
          className="inline-flex items-center gap-1 rounded-full border border-[var(--md-sys-color-outline)] px-3 py-1.5 text-xs font-bold text-[var(--md-sys-color-primary)]">
          <Icon name="upload_file" size={15} />CSV 올리기
        </button>
        {items.some((it) => !isIncomplete(it)) && (
          <button type="button" onClick={() => saveFile("문제.csv", quizToCsv(items.filter((it) => !isIncomplete(it))))}
            className="inline-flex items-center gap-1 rounded-full border border-[var(--md-sys-color-outline)] px-3 py-1.5 text-xs font-bold text-[var(--md-sys-color-primary)]">
            <Icon name="ios_share" size={15} />CSV로 저장
          </button>
        )}
        <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void importCsv(f); }} />
        {csvNote && (
          <div role="status" className={`basis-full rounded-lg px-2.5 py-2 text-xs ${csvNote.errors.length ? "bg-[var(--md-sys-color-error-container)] text-[var(--md-sys-color-on-error-container)]" : "bg-[var(--md-sys-color-tertiary-container)] text-[var(--md-sys-color-on-tertiary-container)]"}`}>
            <b>{csvNote.added}개 문제를 추가했어요.</b>
            {csvNote.errors.length > 0 && <>
              {" "}건너뛴 줄 {csvNote.errors.length}개:
              <ul className="mt-1 list-disc pl-4">{csvNote.errors.slice(0, 5).map((e) => <li key={e}>{e}</li>)}{csvNote.errors.length > 5 && <li>…외 {csvNote.errors.length - 5}개</li>}</ul>
            </>}
          </div>
        )}
      </div>

      {items.length === 0 ? (
        <p className="rounded-xl bg-[var(--md-sys-color-surface-container)] px-3 py-6 text-center text-sm text-[var(--md-sys-color-on-surface-variant)]">
          문제를 추가하거나 <b>불러오기</b>·<b>CSV 올리기</b>로 문항을 가져오세요.
          {" "}{emptyHint}
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {items.map((it, idx) => {
            const isOpen = open === it.id;
            return (
              <li
                key={it.id}
                className="rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)]"
              >
                <div className="flex items-center gap-2 px-3 py-2">
                  <span className="w-6 shrink-0 text-xs font-bold text-[var(--md-sys-color-on-surface-variant)]">
                    {idx + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => setOpen(isOpen ? null : it.id)}
                    className="min-w-0 flex-1 truncate text-left text-sm"
                  >
                    {it.prompt.trim() || (
                      <span className="text-[var(--md-sys-color-on-surface-variant)]">
                        (문제 내용 없음)
                      </span>
                    )}
                  </button>
                  {isIncomplete(it) && (
                    <Icon
                      name="error"
                      size={16}
                      className="shrink-0 text-[var(--md-sys-color-error)]"
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => remove(it.id)}
                    aria-label="문제 삭제"
                    className="shrink-0 rounded-full p-1 text-[var(--md-sys-color-on-surface-variant)] hover:bg-black/5"
                  >
                    <Icon name="delete" size={16} />
                  </button>
                  <Icon
                    name={isOpen ? "expand_less" : "expand_more"}
                    size={18}
                    className="shrink-0 text-[var(--md-sys-color-on-surface-variant)]"
                  />
                </div>

                {isOpen && (
                  <div className="flex flex-col gap-2 border-t border-[var(--md-sys-color-outline-variant)] px-3 py-3">
                    <input
                      value={it.prompt}
                      onChange={(e) => patch(it.id, { prompt: e.target.value })}
                      placeholder="문제를 입력하세요"
                      className="m3-field"
                    />
                    <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                      선택지 — 왼쪽 동그라미로 정답을 고르세요
                    </p>
                    {it.options.map((o, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => patch(it.id, { answerIndex: i })}
                          aria-label={`${i + 1}번을 정답으로`}
                          aria-pressed={it.answerIndex === i}
                          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition ${
                            it.answerIndex === i
                              ? "border-[var(--md-sys-color-primary)] bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)]"
                              : "border-[var(--md-sys-color-outline)]"
                          }`}
                        >
                          {it.answerIndex === i && (
                            <Icon name="check" size={14} />
                          )}
                        </button>
                        <input
                          value={o}
                          onChange={(e) => setOption(it, i, e.target.value)}
                          placeholder={`선택지 ${i + 1}`}
                          className="m3-field flex-1"
                        />
                        <button
                          type="button"
                          onClick={() => removeOption(it, i)}
                          disabled={it.options.length <= 2}
                          aria-label="선택지 삭제"
                          className="shrink-0 rounded-full p-1 text-[var(--md-sys-color-on-surface-variant)] hover:bg-black/5 disabled:opacity-30"
                        >
                          <Icon name="close" size={15} />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => addOption(it)}
                      className="self-start rounded-full px-2.5 py-1 text-xs font-semibold text-[var(--md-sys-color-primary)] hover:bg-[color-mix(in_srgb,var(--md-sys-color-primary)_10%,transparent)]"
                    >
                      + 선택지 추가
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {importOpen && (
        <QuizImportModal
          cid={cid}
          ownerUid={ownerUid}
          onPick={(picked) => {
            onChange([...items, ...picked]);
            setImportOpen(false);
          }}
          onClose={() => setImportOpen(false)}
        />
      )}
    </div>
  );
}
