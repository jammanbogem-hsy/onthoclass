"use client";

// 화면 전체가 깨졌을 때 — 배포 직후 옛 코드 조각을 못 찾은 경우면 자동으로 한 번 새로 고치고,
// 그래도 안 되면 쉬운 말로 새로 고침 버튼을 보여 준다(캐시를 지우지 않아도 된다).
import { useEffect } from "react";
import { isChunkError, reloadOnce } from "@/lib/chunk-reload";

export default function GlobalError({ error }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  const chunk = isChunkError(error);
  useEffect(() => { if (chunk) reloadOnce(); }, [chunk]);
  return <html lang="ko">
    <body style={{ margin: 0, minHeight: "100dvh", display: "grid", placeItems: "center", fontFamily: "system-ui, sans-serif", background: "#f6f7fb", color: "#1b1b29" }}>
      <div style={{ maxWidth: 420, padding: 24, textAlign: "center" }}>
        <h1 style={{ fontSize: 22, margin: "0 0 8px" }}>{chunk ? "새 버전으로 바뀌었어요" : "화면을 다시 불러와 주세요"}</h1>
        <p style={{ margin: "0 0 20px", lineHeight: 1.6, color: "#5b5b70" }}>{chunk ? "곧 저절로 다시 열려요. 그대로면" : "잠깐 문제가 생겼어요."} 아래 버튼을 누르면 바로 돌아와요.</p>
        <button type="button" onClick={() => window.location.reload()} style={{ minHeight: 48, padding: "0 24px", borderRadius: 999, border: 0, background: "#1b1b29", color: "#fff", fontSize: 16, fontWeight: 800, cursor: "pointer" }}>새로 고침</button>
      </div>
    </body>
  </html>;
}
