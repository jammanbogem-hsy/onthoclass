"use client";

import { useEffect, useState } from "react";

/**
 * 의존성 없는 타이핑 타이포 효과(typed.js 모사) — 단어들을 한 글자씩 치고 지우길 반복.
 * 깜빡이는 커서(.jam-caret) 포함. 정적 빌드/번들 안전(외부 라이브러리 없음).
 */
export function TypedText({
  words,
  typeMs = 140,
  deleteMs = 70,
  holdMs = 1400,
  loop = true,
  className = "",
  caretClassName = "",
}: {
  words: string[];
  typeMs?: number;
  deleteMs?: number;
  holdMs?: number;
  loop?: boolean;
  className?: string;
  caretClassName?: string;
}) {
  const [text, setText] = useState("");
  const [wordIdx, setWordIdx] = useState(0);
  const [phase, setPhase] = useState<"typing" | "holding" | "deleting">(
    "typing"
  );

  useEffect(() => {
    const word = words[wordIdx % words.length] ?? "";
    let t: ReturnType<typeof setTimeout>;

    if (phase === "typing") {
      if (text.length < word.length) {
        t = setTimeout(
          () => setText(word.slice(0, text.length + 1)),
          typeMs
        );
      } else {
        // 마지막 단어이고 loop=false 면 유지
        if (!loop && wordIdx === words.length - 1) return;
        t = setTimeout(() => setPhase("holding"), holdMs);
      }
    } else if (phase === "holding") {
      t = setTimeout(() => setPhase("deleting"), holdMs);
    } else {
      if (text.length > 0) {
        t = setTimeout(
          () => setText(word.slice(0, text.length - 1)),
          deleteMs
        );
      } else {
        setWordIdx((i) => i + 1);
        setPhase("typing");
        return;
      }
    }
    return () => clearTimeout(t);
  }, [text, phase, wordIdx, words, typeMs, deleteMs, holdMs, loop]);

  return (
    <span className={`inline-flex items-center ${className}`}>
      <span>{text}</span>
      <span className={`jam-caret ${caretClassName}`} aria-hidden />
    </span>
  );
}
