"use client";

import { Fragment, type ReactNode } from "react";

/**
 * 의존성 없는 최소 마크다운 렌더러.
 * 지원: #/##/### 제목, - / * 목록, 1. 순서목록, | 표 |, **굵게**, *기울임*, `코드`, 단락.
 * 안전: 원시 HTML 미삽입 (React 노드로만 구성).
 */

function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  // 토큰: **bold** | *italic* | `code`
  const re = /(\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[2] !== undefined)
      out.push(<strong key={`${keyBase}-b${i}`}>{m[2]}</strong>);
    else if (m[3] !== undefined)
      out.push(<em key={`${keyBase}-i${i}`}>{m[3]}</em>);
    else if (m[4] !== undefined)
      out.push(
        <code
          key={`${keyBase}-c${i}`}
          className="rounded bg-black/10 px-1 py-0.5 text-[0.85em] dark:bg-white/15"
        >
          {m[4]}
        </code>
      );
    last = m.index + m[0].length;
    i++;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ source }: { source: string }) {
  const lines = (source ?? "").replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let para: string[] = [];
  let list: string[] = [];
  let i = 0;

  const flushPara = () => {
    if (para.length) {
      blocks.push(
        <p key={`p${blocks.length}`} className="leading-relaxed">
          {inline(para.join(" "), `p${blocks.length}`)}
        </p>
      );
      para = [];
    }
  };
  const flushList = () => {
    if (list.length) {
      blocks.push(
        <ul
          key={`u${blocks.length}`}
          className="ml-5 list-disc space-y-1 leading-relaxed"
        >
          {list.map((it, k) => (
            <li key={k}>{inline(it, `u${blocks.length}-${k}`)}</li>
          ))}
        </ul>
      );
      list = [];
    }
  };

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // 표: 연속된 | ... | 줄
    if (/^\|.*\|$/.test(trimmed)) {
      flushPara();
      flushList();
      const rows: string[] = [];
      while (i < lines.length && /^\|.*\|$/.test(lines[i].trim())) {
        rows.push(lines[i].trim());
        i++;
      }
      const parse = (r: string) =>
        r
          .slice(1, -1)
          .split("|")
          .map((c) => c.trim());
      const header = parse(rows[0]);
      const bodyStart = rows[1] && /^[\s|:-]+$/.test(rows[1]) ? 2 : 1;
      const body = rows.slice(bodyStart).map(parse);
      blocks.push(
        <div
          key={`t${blocks.length}`}
          className="overflow-x-auto rounded-xl border border-white/50"
        >
          <table className="w-full text-sm">
            <thead className="bg-white/40 dark:bg-white/10">
              <tr>
                {header.map((h, k) => (
                  <th
                    key={k}
                    className="px-3 py-2 text-left font-semibold"
                  >
                    {inline(h, `th${k}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {body.map((row, r) => (
                <tr key={r} className="border-t border-white/40">
                  {row.map((c, k) => (
                    <td key={k} className="px-3 py-2 align-top">
                      {inline(c, `td${r}-${k}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    if (trimmed === "") {
      flushPara();
      flushList();
      i++;
      continue;
    }

    const h = /^(#{1,3})\s+(.*)$/.exec(trimmed);
    if (h) {
      flushPara();
      flushList();
      const lvl = h[1].length;
      const cls =
        lvl === 1
          ? "text-xl font-bold"
          : lvl === 2
            ? "text-lg font-bold"
            : "text-base font-semibold";
      blocks.push(
        <p key={`h${blocks.length}`} className={`${cls} mt-1`}>
          {inline(h[2], `h${blocks.length}`)}
        </p>
      );
      i++;
      continue;
    }

    const li = /^(?:[-*]|\d+\.)\s+(.*)$/.exec(trimmed);
    if (li) {
      flushPara();
      list.push(li[1]);
      i++;
      continue;
    }

    para.push(trimmed);
    i++;
  }
  flushPara();
  flushList();

  return (
    <div className="flex flex-col gap-3 text-sm text-black/80 dark:text-white/80">
      {blocks.length ? (
        blocks.map((b, k) => <Fragment key={k}>{b}</Fragment>)
      ) : (
        <p className="text-black/35 dark:text-white/35">내용이 없습니다.</p>
      )}
    </div>
  );
}
