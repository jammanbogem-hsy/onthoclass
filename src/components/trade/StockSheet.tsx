"use client";

// 종목 상세 바텀시트(모바일 전용 모달 래퍼) — 실제 내용은 StockPanel 이 그린다.
// 데스크톱 우측 고정 패널은 이 래퍼 없이 StockPanel 을 카드에 바로 넣어 재사용한다.
import { StockPanel, type StockPanelProps } from "@/components/trade/StockPanel";

export function StockSheet(props: StockPanelProps & { onClose: () => void }) {
  return (
    <div
      className="trade-scope fixed inset-0 z-[70] flex items-end justify-center bg-[rgba(0,0,0,0.34)] p-0 sm:items-center sm:p-4"
      onClick={props.onClose}
    >
      <div
        className="flex max-h-[94vh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl bg-[var(--md-sys-color-surface-container-high)] shadow-[var(--md-sys-elevation-3)] sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <StockPanel {...props} />
      </div>
    </div>
  );
}
