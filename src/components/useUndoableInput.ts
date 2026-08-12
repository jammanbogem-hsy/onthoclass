"use client";

// 제어형(controlled) 텍스트 입력의 Ctrl+Z / Ctrl+Shift+Z(·Ctrl+Y) 실행취소·다시실행.
// React 가 value 를 직접 세팅하면 브라우저 기본 실행취소가 깨지므로 직접 기록한다.
//   const u = useUndoableInput(title, setTitle);
//   <input value={title} onChange={(e) => u.change(e.target.value)}
//          onKeyDown={(e) => { if (u.handleKey(e)) return; /* 기존 키처리 */ }} />
import { useCallback, useEffect, useRef } from "react";
import type { KeyboardEvent } from "react";

export function useUndoableInput(value: string, setValue: (v: string) => void) {
  const undo = useRef<string[]>([]);
  const redo = useRef<string[]>([]);
  const last = useRef(0); // 마지막 스냅샷 시각(타이핑 묶기용)
  const self = useRef<string | null>(null); // 훅 자신이 마지막에 세팅한 값

  // 외부에서 value 가 바뀌면(예: 다른 활동 로드/리셋) 히스토리를 비운다.
  useEffect(() => {
    if (value !== self.current) {
      undo.current = [];
      redo.current = [];
      last.current = 0;
    }
  }, [value]);

  const change = useCallback(
    (next: string) => {
      const now = Date.now();
      if (now - last.current > 500) {
        undo.current.push(value);
        if (undo.current.length > 200) undo.current.shift();
        last.current = now;
      }
      redo.current = [];
      self.current = next;
      setValue(next);
    },
    [value, setValue]
  );

  // 실행취소/다시실행을 처리했으면 true 반환(호출측에서 early-return).
  const handleKey = useCallback(
    (e: KeyboardEvent): boolean => {
      if (!(e.ctrlKey || e.metaKey)) return false;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) {
        const prev = undo.current.pop();
        if (prev === undefined) return false;
        e.preventDefault();
        redo.current.push(value);
        last.current = 0;
        self.current = prev;
        setValue(prev);
        return true;
      }
      if ((k === "z" && e.shiftKey) || k === "y") {
        const nxt = redo.current.pop();
        if (nxt === undefined) return false;
        e.preventDefault();
        undo.current.push(value);
        last.current = 0;
        self.current = nxt;
        setValue(nxt);
        return true;
      }
      return false;
    },
    [value, setValue]
  );

  return { change, handleKey };
}
