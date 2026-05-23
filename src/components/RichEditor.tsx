"use client";

import BlockEditor, {
  blocksToPlainText as _toText,
} from "@/components/BlockEditor";

export function RichEditor({
  value,
  onChange,
  readOnly,
}: {
  value: string;
  onChange?: (json: string) => void;
  readOnly?: boolean;
  /** 호환용(미사용) */
  placeholder?: string;
  minRows?: number;
}) {
  return (
    <BlockEditor value={value} onChange={onChange} readOnly={readOnly} />
  );
}

/** 블록 JSON → 평문 (의미 분석/추출용) */
export function blocksToPlainText(json: string): string {
  return _toText(json);
}
