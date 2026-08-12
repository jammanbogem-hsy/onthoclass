"use client";

// 실행취소(Ctrl+Z)/다시실행(Ctrl+Shift+Z·Ctrl+Y)이 동작하는 제어형 입력 컴포넌트.
// 활동 편집기의 controlled <input>/<textarea> 를 그대로 대체한다.
//   <UndoableInput value={x} onValueChange={setX} className=... placeholder=... />
// onValueChange 는 새 문자열을 받는다(기존 onChange={(e)=>setX(e.target.value)} 대체).
import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";
import { useUndoableInput } from "./useUndoableInput";

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & {
  value: string;
  onValueChange: (v: string) => void;
};

export function UndoableInput({ value, onValueChange, onKeyDown, ...rest }: InputProps) {
  const u = useUndoableInput(value, onValueChange);
  return (
    <input
      {...rest}
      value={value}
      onChange={(e) => u.change(e.target.value)}
      onKeyDown={(e) => {
        if (u.handleKey(e)) return;
        onKeyDown?.(e);
      }}
    />
  );
}

type AreaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange"> & {
  value: string;
  onValueChange: (v: string) => void;
};

export function UndoableTextarea({ value, onValueChange, onKeyDown, ...rest }: AreaProps) {
  const u = useUndoableInput(value, onValueChange);
  return (
    <textarea
      {...rest}
      value={value}
      onChange={(e) => u.change(e.target.value)}
      onKeyDown={(e) => {
        if (u.handleKey(e)) return;
        onKeyDown?.(e);
      }}
    />
  );
}
