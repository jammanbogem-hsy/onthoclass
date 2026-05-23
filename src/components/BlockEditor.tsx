"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { Icon } from "@/components/Icon";

/**
 * 노션형 경량 블록 에디터 (의존성 없음).
 * 슬래시(/) 팝업 메뉴로 블록 추가·변환. 본문/제목/목록/번호/인용/콜아웃/
 * 구분선/링크/표. 저장: JSON 문자열. value/onChange/readOnly API 호환.
 */

type BlockType =
  | "p"
  | "h1"
  | "h2"
  | "h3"
  | "bullet"
  | "numbered"
  | "quote"
  | "callout"
  | "divider"
  | "link"
  | "table";

type Block = {
  id: string;
  type: BlockType;
  text: string;
  url?: string;
  rows?: string[][];
};

type Cmd = {
  type: BlockType;
  label: string;
  icon: string;
  kw: string;
};
const COMMANDS: Cmd[] = [
  { type: "p", label: "본문", icon: "notes", kw: "text 본문 글 paragraph" },
  { type: "h1", label: "제목 1", icon: "title", kw: "h1 제목 heading" },
  { type: "h2", label: "제목 2", icon: "title", kw: "h2 제목 heading" },
  { type: "h3", label: "제목 3", icon: "title", kw: "h3 소제목 heading" },
  {
    type: "bullet",
    label: "글머리 목록",
    icon: "format_list_bulleted",
    kw: "bullet list 목록 리스트",
  },
  {
    type: "numbered",
    label: "번호 목록",
    icon: "format_list_numbered",
    kw: "number 번호 ordered list",
  },
  { type: "quote", label: "인용", icon: "format_quote", kw: "quote 인용" },
  {
    type: "callout",
    label: "콜아웃",
    icon: "lightbulb",
    kw: "callout 강조 안내 박스",
  },
  {
    type: "divider",
    label: "구분선",
    icon: "horizontal_rule",
    kw: "divider hr 구분선 선",
  },
  { type: "link", label: "링크", icon: "link", kw: "link 링크 url 주소" },
  { type: "table", label: "표", icon: "table", kw: "table 표 grid 격자" },
];

let _seq = 0;
const newId = () => `b${Date.now()}_${_seq++}`;

function parse(value: string): Block[] {
  const fallback = (): Block[] => [{ id: newId(), type: "p", text: "" }];
  if (!value || !value.trim()) return fallback();
  try {
    const v = JSON.parse(value);
    if (!Array.isArray(v) || v.length === 0) return fallback();
    if (v[0] && typeof v[0] === "object" && "type" in v[0]) {
      return (v as Block[]).map((b) => ({
        id: b.id || newId(),
        type: (b.type as BlockType) || "p",
        text: typeof b.text === "string" ? b.text : "",
        url: typeof b.url === "string" ? b.url : undefined,
        rows: Array.isArray(b.rows) ? b.rows : undefined,
      }));
    }
    // 과거 BlockNote 호환
    const toText = (c: unknown): string =>
      typeof c === "string"
        ? c
        : Array.isArray(c)
          ? c
              .map((x) =>
                x &&
                typeof x === "object" &&
                typeof (x as { text?: unknown }).text === "string"
                  ? (x as { text: string }).text
                  : ""
              )
              .join("")
          : "";
    return (v as Record<string, unknown>[])
      .map((blk) => ({
        id: newId(),
        type: "p" as BlockType,
        text: toText(blk.content),
      }))
      .filter((b) => b.text.trim())
      .concat([{ id: newId(), type: "p", text: "" }]);
  } catch {
    return [{ id: newId(), type: "p", text: value }];
  }
}

export function blocksToPlainText(json: string): string {
  if (!json || !json.trim()) return "";
  let arr: unknown;
  try {
    arr = JSON.parse(json);
  } catch {
    return json;
  }
  if (!Array.isArray(arr)) return "";
  return (arr as Block[])
    .map((b) => {
      const t = b.type ?? "p";
      if (t === "divider") return "";
      if (t === "table" && Array.isArray(b.rows))
        return b.rows.map((r) => r.join(" | ")).join("\n");
      if (t === "link")
        return `${b.text || "링크"}${b.url ? ` (${b.url})` : ""}`;
      if (t === "bullet") return `- ${b.text ?? ""}`;
      if (t === "numbered") return `• ${b.text ?? ""}`;
      return b.text ?? "";
    })
    .filter((s) => s.trim())
    .join("\n");
}

// font 축약 대신 개별 속성 사용 — 축약(font)과 fontStyle 을 섞으면
// 블록 타입 전환(quote↔기타) 시 React 가 fontStyle 제거를 경고함.
function textStyle(type: BlockType): CSSProperties {
  const brand = "var(--md-sys-font-brand)";
  const plain = "var(--md-sys-font-plain)";
  switch (type) {
    case "h1":
      return { fontWeight: 700, fontSize: 26, lineHeight: "34px", fontFamily: brand, fontStyle: "normal" };
    case "h2":
      return { fontWeight: 600, fontSize: 21, lineHeight: "30px", fontFamily: brand, fontStyle: "normal" };
    case "h3":
      return { fontWeight: 600, fontSize: 17, lineHeight: "26px", fontFamily: brand, fontStyle: "normal" };
    case "quote":
      return { fontWeight: 400, fontSize: 15, lineHeight: "24px", fontFamily: plain, fontStyle: "italic" };
    default:
      return { fontWeight: 400, fontSize: 15, lineHeight: "24px", fontFamily: plain, fontStyle: "normal" };
  }
}

/* ───────── 읽기 전용 ───────── */
export function BlockView({ value }: { value: string }) {
  const blocks = parse(value).filter(
    (b) =>
      b.type === "divider" ||
      b.type === "table" ||
      b.type === "link" ||
      b.text.trim()
  );
  if (blocks.length === 0)
    return (
      <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">
        내용이 없습니다.
      </p>
    );
  let n = 0;
  return (
    <div className="flex flex-col gap-2 text-[var(--md-sys-color-on-surface)]">
      {blocks.map((b) => {
        if (b.type === "divider")
          return (
            <hr
              key={b.id}
              className="my-1 border-[var(--md-sys-color-outline-variant)]"
            />
          );
        if (b.type === "link")
          return (
            <a
              key={b.id}
              href={b.url || "#"}
              target="_blank"
              rel="noreferrer"
              className="inline-flex w-fit items-center gap-2 rounded-lg border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] px-3 py-2 text-sm text-[var(--md-sys-color-primary)] hover:underline"
            >
              <Icon name="link" size={16} />
              {b.text || b.url || "링크"}
            </a>
          );
        if (b.type === "table" && b.rows)
          return (
            <div
              key={b.id}
              className="overflow-x-auto rounded-lg border border-[var(--md-sys-color-outline-variant)]"
            >
              <table className="w-full border-collapse text-sm">
                <tbody>
                  {b.rows.map((row, ri) => (
                    <tr key={ri}>
                      {row.map((cell, ci) => (
                        <td
                          key={ci}
                          className={`border border-[var(--md-sys-color-outline-variant)] px-3 py-1.5 ${
                            ri === 0
                              ? "bg-[var(--md-sys-color-surface-container)] font-semibold"
                              : ""
                          }`}
                        >
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        if (b.type === "callout")
          return (
            <div
              key={b.id}
              className="flex gap-2 rounded-xl bg-[var(--md-sys-color-secondary-container)] p-3 text-sm text-[var(--md-sys-color-on-secondary-container)]"
            >
              <Icon name="lightbulb" size={18} />
              <span>{b.text}</span>
            </div>
          );
        if (b.type === "bullet")
          return (
            <div key={b.id} className="flex gap-2 text-sm leading-6">
              <span className="text-[var(--md-sys-color-on-surface-variant)]">
                •
              </span>
              <span>{b.text}</span>
            </div>
          );
        if (b.type === "numbered") {
          n += 1;
          return (
            <div key={b.id} className="flex gap-2 text-sm leading-6">
              <span className="text-[var(--md-sys-color-on-surface-variant)]">
                {n}.
              </span>
              <span>{b.text}</span>
            </div>
          );
        }
        return (
          <div
            key={b.id}
            style={textStyle(b.type)}
            className={
              b.type === "quote"
                ? "border-l-[3px] border-[var(--md-sys-color-primary)] pl-3 text-[var(--md-sys-color-on-surface-variant)]"
                : ""
            }
          >
            {b.text || " "}
          </div>
        );
      })}
    </div>
  );
}

/* ───────── 편집기 ───────── */
export default function BlockEditor({
  value,
  onChange,
  readOnly,
}: {
  value: string;
  onChange?: (json: string) => void;
  readOnly?: boolean;
}) {
  const [blocks, setBlocks] = useState<Block[]>(() => parse(value));
  const [slash, setSlash] = useState<{
    id: string;
    top: number;
    left: number;
  } | null>(null);
  const refs = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const focusNext = useRef<string | null>(null);

  useEffect(() => {
    setBlocks(parse(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const emit = useCallback(
    (next: Block[]) => {
      setBlocks(next);
      onChange?.(JSON.stringify(next));
    },
    [onChange]
  );

  useEffect(() => {
    const id = focusNext.current;
    if (id && refs.current[id]) {
      const el = refs.current[id]!;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
      focusNext.current = null;
    }
  });

  if (readOnly) return <BlockView value={value} />;

  const update = (id: string, patch: Partial<Block>) =>
    emit(blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)));

  function addAfter(id: string) {
    const i = blocks.findIndex((b) => b.id === id);
    const nb: Block = { id: newId(), type: "p", text: "" };
    const next = [...blocks];
    next.splice(i + 1, 0, nb);
    focusNext.current = nb.id;
    emit(next);
  }
  function removeBlock(id: string) {
    if (blocks.length === 1) {
      emit([{ id: newId(), type: "p", text: "" }]);
      return;
    }
    const i = blocks.findIndex((b) => b.id === id);
    const next = blocks.filter((b) => b.id !== id);
    focusNext.current = next[Math.max(0, i - 1)]?.id ?? null;
    emit(next);
  }
  function applyCommand(id: string, type: BlockType) {
    setSlash(null);
    const patch: Partial<Block> = { type, text: "" };
    if (type === "link") {
      patch.url = "";
      patch.text = "";
    }
    if (type === "table")
      patch.rows = [
        ["", ""],
        ["", ""],
      ];
    update(id, patch);
    if (type !== "divider" && type !== "table")
      focusNext.current = id;
  }

  function openSlash(id: string) {
    const el = refs.current[id];
    if (!el) return;
    const r = el.getBoundingClientRect();
    setSlash({
      id,
      top: Math.min(r.bottom + 4, window.innerHeight - 320),
      left: r.left,
    });
  }

  const slashQuery =
    slash && blocks.find((b) => b.id === slash.id)?.text.startsWith("/")
      ? (blocks.find((b) => b.id === slash.id)?.text ?? "").slice(1)
      : "";
  const slashList = COMMANDS.filter(
    (c) =>
      !slashQuery ||
      c.label.includes(slashQuery) ||
      c.kw.toLowerCase().includes(slashQuery.toLowerCase())
  );

  return (
    <div className="rounded-2xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] p-3">
      {blocks.map((b, idx) => (
        <div
          key={b.id}
          className="group flex items-start gap-1.5 py-0.5"
        >
          <div className="flex w-6 shrink-0 justify-center pt-1.5">
            <button
              type="button"
              onClick={() => addAfter(b.id)}
              title="아래에 블록 추가"
              className="text-[var(--md-sys-color-on-surface-variant)] opacity-0 transition group-hover:opacity-100"
            >
              <Icon name="add" size={16} />
            </button>
          </div>

          <div className="min-w-0 flex-1">
            {b.type === "divider" ? (
              <div className="flex items-center gap-2 py-2">
                <hr className="flex-1 border-[var(--md-sys-color-outline-variant)]" />
                <button
                  type="button"
                  onClick={() => removeBlock(b.id)}
                  className="text-[var(--md-sys-color-on-surface-variant)] opacity-0 group-hover:opacity-100"
                >
                  <Icon name="close" size={14} />
                </button>
              </div>
            ) : b.type === "link" ? (
              <div className="flex flex-col gap-1.5 rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] p-2.5">
                <div className="flex items-center gap-1.5 text-xs text-[var(--md-sys-color-on-surface-variant)]">
                  <Icon name="link" size={14} /> 링크 블록
                  <button
                    type="button"
                    onClick={() => removeBlock(b.id)}
                    className="ml-auto"
                  >
                    <Icon name="close" size={14} />
                  </button>
                </div>
                <input
                  value={b.text}
                  onChange={(e) => update(b.id, { text: e.target.value })}
                  placeholder="표시할 이름"
                  className="rounded-md bg-[var(--md-sys-color-surface)] px-2 py-1.5 text-sm outline-none"
                />
                <input
                  value={b.url ?? ""}
                  onChange={(e) => update(b.id, { url: e.target.value })}
                  placeholder="https://..."
                  className="rounded-md bg-[var(--md-sys-color-surface)] px-2 py-1.5 text-sm outline-none"
                />
              </div>
            ) : b.type === "table" ? (
              <TableBlock
                block={b}
                onChange={(rows) => update(b.id, { rows })}
                onRemove={() => removeBlock(b.id)}
              />
            ) : (
              <div
                className={
                  b.type === "callout"
                    ? "flex gap-2 rounded-xl bg-[var(--md-sys-color-secondary-container)] p-2.5"
                    : b.type === "quote"
                      ? "border-l-[3px] border-[var(--md-sys-color-primary)] pl-3"
                      : ""
                }
              >
                {b.type === "callout" && (
                  <Icon
                    name="lightbulb"
                    size={18}
                    className="mt-1.5 shrink-0 text-[var(--md-sys-color-on-secondary-container)]"
                  />
                )}
                {b.type === "bullet" && (
                  <span className="select-none pt-1.5 text-[var(--md-sys-color-on-surface-variant)]">
                    •
                  </span>
                )}
                {b.type === "numbered" && (
                  <span className="select-none pt-1.5 text-[var(--md-sys-color-on-surface-variant)]">
                    {blocks
                      .slice(0, idx + 1)
                      .filter((x) => x.type === "numbered").length}
                    .
                  </span>
                )}
                <textarea
                  ref={(el) => {
                    refs.current[b.id] = el;
                  }}
                  value={b.text}
                  rows={1}
                  placeholder={
                    idx === 0
                      ? "내용을 입력하거나 '/' 로 블록 추가"
                      : "'/' 로 블록 추가"
                  }
                  onChange={(e) => {
                    const v = e.target.value;
                    update(b.id, { text: v });
                    e.target.style.height = "auto";
                    e.target.style.height = e.target.scrollHeight + "px";
                    if (v.startsWith("/")) openSlash(b.id);
                    else if (slash?.id === b.id) setSlash(null);
                  }}
                  onKeyDown={(e) => {
                    if (slash?.id === b.id && e.key === "Escape") {
                      setSlash(null);
                      return;
                    }
                    if (e.key === "Enter" && !e.shiftKey && !slash) {
                      e.preventDefault();
                      addAfter(b.id);
                    }
                    if (e.key === "Backspace" && b.text === "") {
                      // 빈 리스트/인용/제목은 먼저 일반 문단으로 되돌림
                      if (b.type !== "p") {
                        e.preventDefault();
                        update(b.id, { type: "p" });
                        return;
                      }
                      if (blocks.length > 1) {
                        e.preventDefault();
                        removeBlock(b.id);
                      }
                    }
                  }}
                  className="w-full flex-1 resize-none overflow-hidden bg-transparent py-1 outline-none placeholder:text-[var(--md-sys-color-on-surface-variant)]"
                  style={
                    b.type === "callout"
                      ? {
                          ...textStyle("p"),
                          color: "var(--md-sys-color-on-secondary-container)",
                        }
                      : textStyle(b.type)
                  }
                />
              </div>
            )}
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={() => addAfter(blocks[blocks.length - 1].id)}
        className="mt-1 flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-high)]"
      >
        <Icon name="add" size={16} />
        블록 추가
      </button>

      {/* 슬래시 명령 팝업 */}
      {slash && (
        <>
          <div
            className="fixed inset-0 z-[55]"
            onClick={() => setSlash(null)}
          />
          <div
            style={{
              position: "fixed",
              top: slash.top,
              left: slash.left,
              width: 240,
            }}
            className="z-[60] max-h-72 overflow-y-auto rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-high)] p-1.5 shadow-[var(--md-sys-elevation-3)]"
          >
            {slashList.length === 0 ? (
              <p className="px-2 py-3 text-xs text-[var(--md-sys-color-on-surface-variant)]">
                일치하는 블록 없음
              </p>
            ) : (
              slashList.map((c) => (
                <button
                  key={c.type + c.label}
                  type="button"
                  onClick={() => applyCommand(slash.id, c.type)}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm hover:bg-[var(--md-sys-color-surface-container-highest)]"
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[var(--md-sys-color-surface-container)]">
                    <Icon name={c.icon} size={16} />
                  </span>
                  {c.label}
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

function TableBlock({
  block,
  onChange,
  onRemove,
}: {
  block: Block;
  onChange: (rows: string[][]) => void;
  onRemove: () => void;
}) {
  const rows = block.rows ?? [
    ["", ""],
    ["", ""],
  ];
  const setCell = (r: number, c: number, v: string) => {
    const next = rows.map((row) => [...row]);
    next[r][c] = v;
    onChange(next);
  };
  const addRow = () => onChange([...rows, rows[0].map(() => "")]);
  const addCol = () => onChange(rows.map((row) => [...row, ""]));
  return (
    <div className="rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] p-2">
      <div className="mb-1.5 flex items-center gap-1.5 text-xs text-[var(--md-sys-color-on-surface-variant)]">
        <Icon name="table" size={14} /> 표
        <button type="button" onClick={addRow} className="ml-auto hover:underline">
          + 행
        </button>
        <button type="button" onClick={addCol} className="hover:underline">
          + 열
        </button>
        <button type="button" onClick={onRemove}>
          <Icon name="close" size={14} />
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri}>
                {row.map((cell, ci) => (
                  <td
                    key={ci}
                    className="border border-[var(--md-sys-color-outline-variant)] p-0"
                  >
                    <input
                      value={cell}
                      onChange={(e) => setCell(ri, ci, e.target.value)}
                      placeholder={ri === 0 ? "머리글" : ""}
                      className={`w-full bg-transparent px-2 py-1.5 text-sm outline-none ${
                        ri === 0 ? "font-semibold" : ""
                      }`}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
