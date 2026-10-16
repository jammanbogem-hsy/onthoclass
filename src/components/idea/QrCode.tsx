"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

/** 주소를 QR(SVG)로 — 프로젝터에서 멀리서도 찍히게 여백을 조금 두고 크게 그린다. */
export function QrCode({ text, className }: { text: string; className?: string }) {
  const [svg, setSvg] = useState("");
  useEffect(() => {
    let alive = true;
    QRCode.toString(text, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#1b1b29", light: "#ffffff" } })
      .then(s => { if (alive) setSvg(s); }).catch(() => {});
    return () => { alive = false; };
  }, [text]);
  return <div className={className} role="img" aria-label={`참여 QR 코드: ${text}`} dangerouslySetInnerHTML={{ __html: svg }} />;
}
