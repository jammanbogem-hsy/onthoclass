"use client";

import { useEffect, useRef, useState } from "react";
import { recolorPixels } from "@/features/jamworld/lib/render/avatar-look";
import type { AvatarLook } from "@/features/jamworld/lib/server/workshop/avatar";
import { recolorCharacterPixels } from "../lib/render/character-color";
import {
  characterPose,
  characterGaitFrame,
  type CharacterSheet,
} from "../lib/server/workshop/character-sprite";
import { WALK_PREVIEW_HZ } from "../lib/world/movement";

interface Sheet {
  image: HTMLImageElement;
  frames: Record<string, { x: number; y: number; w: number; h: number; mirror?: boolean }>;
}

const DIRECTION_PAIRS = [
  { label: "앞·뒤", td: ["s", "n"], iso: ["s", "n"], names: ["앞쪽", "뒤쪽"] },
  { label: "왼쪽·오른쪽", td: ["w", "e"], iso: ["w", "e"], names: ["왼쪽", "오른쪽"] },
  { label: "대각선 ↙↗", td: ["w", "e"], iso: ["sw", "ne"], names: ["왼쪽 아래", "오른쪽 위"] },
  { label: "대각선 ↖↘", td: ["w", "e"], iso: ["nw", "se"], names: ["왼쪽 위", "오른쪽 아래"] },
] as const;

async function loadSheet(name: string): Promise<Sheet | null> {
  try {
    const meta = (await (
      await fetch(`/jamworld/assets/atlas/${name}.json`)
    ).json()) as { image: string; frames: Sheet["frames"] };
    const image = new Image();
    image.src = `/jamworld/assets/atlas/${meta.image}`;
    await image.decode();
    return { image, frames: meta.frames };
  } catch {
    return null;
  }
}
async function loadCharacter(s: CharacterSheet): Promise<Sheet | null> {
  try {
    const image = new Image();
    image.src = s.image;
    await image.decode();
    if (
      image.naturalWidth !== s.columns * s.frameWidth ||
      image.naturalHeight !== s.rows * s.frameHeight
    )
      return null;
    const frames = Object.fromEntries(
      s.directions.flatMap((d) =>
        Array.from({ length: s.columns }, (_, f) => [
          `${d}${f}`,
          characterPose(s, d, f),
        ]),
      ),
    );
    return { image, frames };
  } catch {
    return null;
  }
}
async function loadStatic(url: string): Promise<Sheet | null> {
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const frame = { x: 0, y: 0, w: image.naturalWidth, h: image.naturalHeight };
    return { image, frames: { s0: frame, se0: frame } };
  } catch {
    return null;
  }
}

/** 위에서 보기·입체로 보기 아바타 미리보기 (색 적용, 걷기 프레임 순환) */
export default function AvatarPreview({ look }: { look: AvatarLook }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [pair, setPair] = useState(0);
  const [sheets, setSheets] = useState<{
    td: Sheet | null;
    iso: Sheet | null;
  } | null>(null);
  const tinted = useRef<{ td?: HTMLCanvasElement; iso?: HTMLCanvasElement }>(
    {},
  );
  const custom = look.asset,
    sprite = custom?.sprites,
    legacy = !!custom && !sprite;

  useEffect(() => {
    let live = true;
    void Promise.all(
      sprite
        ? [loadCharacter(sprite.td), loadCharacter(sprite.iso)]
        : custom
          ? [loadStatic(custom.td), loadStatic(custom.iso)]
          : [loadSheet("td-avatar"), loadSheet("iso-avatar")],
    ).then(([td, iso]) => {
      if (live) setSheets({ td, iso });
    });
    return () => {
      live = false;
    };
    // The server gives fixed geometry for each immutable sheet URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sprite?.td.image, sprite?.iso.image, custom?.td, custom?.iso]);

  // 외형이 바뀔 때만 색 적용 (한 번 계산)
  useEffect(() => {
    if (!sheets) return;
    for (const v of ["td", "iso"] as const) {
      const s = sheets[v];
      if (!s) continue;
      const c = tinted.current[v] ?? document.createElement("canvas");
      c.width = s.image.naturalWidth;
      c.height = s.image.naturalHeight;
      const g = c.getContext("2d", { willReadFrequently: true })!;
      g.clearRect(0, 0, c.width, c.height);
      g.drawImage(s.image, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height);
      if (custom) recolorCharacterPixels(d.data, look.assetColors ?? []);
      else recolorPixels(d.data, look);
      g.putImageData(d, 0, 0);
      tinted.current[v] = c;
    }
  }, [sheets, look, custom]);

  // 짧은 통과 포즈도 빠뜨리지 않도록 보이는 동안만 20fps로 그린다.
  useEffect(() => {
    if (!sheets) return;
    let raf = 0;
    let last = 0;
    const draw = (t: number) => {
      raf = requestAnimationFrame(draw);
      if (document.hidden || t - last < 50) return;
      last = t;
      const c = ref.current;
      if (!c) return;
      const g = c.getContext("2d")!;
      g.clearRect(0, 0, c.width, c.height);
      const phase = ((t / 1000) * WALK_PREVIEW_HZ) % 1;
      const directions = DIRECTION_PAIRS[pair];
      const items: Array<
        [Sheet | null, HTMLCanvasElement | undefined, string, number, string]
      > = legacy
        ? [
            [sheets.td, tinted.current.td, "s", 60, "위에서 보기"],
            [sheets.iso, tinted.current.iso, "se", 280, "입체로 보기"],
          ]
        : [
            [sheets.td, tinted.current.td, directions.td[0], 40, pair === 0 ? "앞쪽" : "왼쪽"],
            [sheets.td, tinted.current.td, directions.td[1], 140, pair === 0 ? "뒤쪽" : "오른쪽"],
            [sheets.iso, tinted.current.iso, directions.iso[0], 260, directions.names[0]],
            [sheets.iso, tinted.current.iso, directions.iso[1], 360, directions.names[1]],
          ];
      g.font = "bold 12px system-ui";
      g.fillStyle = "#4a5574";
      g.textAlign = "center";
      if (!legacy) { g.fillText("위에서 보기", 130, 18); g.fillText("입체로 보기", 350, 18); }
      for (const [s, img, name, x, label] of items) {
        const f = legacy
          ? 0
          : characterGaitFrame(phase, true, s?.frames[`${name}4`] ? 5 : 4);
        const fr = s?.frames[`${name}${f}`] ?? s?.frames[`${name}0`];
        if (!s || !img || !fr) continue;
        const h = 150;
        const w = (h * fr.w) / fr.h;
        g.fillStyle = "rgba(24,28,58,0.18)";
        g.beginPath();
        g.ellipse(x + 40, 178, 26, 9, 0, 0, Math.PI * 2);
        g.fill();
        g.save(); g.translate(x + 40, 182);
        if (fr.mirror) g.scale(-1, 1);
        g.drawImage(img, fr.x, fr.y, fr.w, fr.h, -w / 2, -h, w, h);
        g.restore();
        if (label) {
          g.fillStyle = "#4a5574";
          g.fillText(label, x + 40, 204);
        }
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [sheets, legacy, pair]);

  return (
    <div>
      {!legacy && <div className="avatar-direction-options" role="group" aria-label="캐릭터 방향 확인">
        {DIRECTION_PAIRS.map((item, index) => <button key={item.label} type="button" className={`btn sm ${pair === index ? "primary" : "ghost"}`} aria-pressed={pair === index} onClick={() => setPair(index)}>{item.label}</button>)}
      </div>}
      <canvas
        ref={ref}
        width={460}
        height={212}
        style={{
          width: "100%",
          maxWidth: 460,
          background: "#e9f6ee",
          borderRadius: 14,
        }}
        aria-label="아바타 미리보기"
      />
      {!sheets && <p className="ws-note">미리보기 불러오는 중…</p>}
      {sheets && (!sheets.td || !sheets.iso) && (
        <p className="ws-note" role="alert">
          아바타 그림을 불러오지 못했어요.
        </p>
      )}
    </div>
  );
}
