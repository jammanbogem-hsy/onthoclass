"use client";
import { useEffect, useState } from "react";
import {
  AVATAR_COLORS,
  COLOR_HSL,
  COLOR_KO,
  type AssetColorChange,
} from "../lib/server/workshop/avatar";
import {
  loadCharacterPalette,
  type CharacterColor,
} from "../lib/render/character-color";

export default function CharacterColorEditor({
  td,
  iso,
  changes,
  onChange,
}: {
  td: string;
  iso: string;
  changes: AssetColorChange[];
  onChange: (changes: AssetColorChange[]) => void;
}) {
  const [loaded, setLoaded] = useState<{
    key: string;
    palette: CharacterColor[];
    error?: string;
  } | null>(null);
  const [chosen, setChosen] = useState<number | null>(null);
  const key = `${td}|${iso}`;
  useEffect(() => {
    let live = true;
    loadCharacterPalette([td, iso])
      .then((palette) => {
        if (live) setLoaded({ key: `${td}|${iso}`, palette });
      })
      .catch(() => {
        if (live)
          setLoaded({
            key: `${td}|${iso}`,
            palette: [],
            error: "색을 불러오지 못했어요",
          });
      });
    return () => {
      live = false;
    };
  }, [td, iso]);
  const palette = loaded?.key === key ? loaded.palette : [];
  const source = palette.find((c) => c.hue === chosen)?.hue ?? palette[0]?.hue;
  const current = changes.find((c) => c.source === source)?.target;
  const reset = () => onChange(changes.filter((c) => c.source !== source));
  return (
    <div className="character-color-editor">
      <h3>내 인물 색 바꾸기</h3>
      <p className="ws-note">
        AI 재생성 없이 바로 바꿔요. 그림에서 같은 색이 함께 바뀌며, 내
        아바타에만 적용돼요.
      </p>
      {loaded?.key !== key ? (
        <p role="status">그림의 색을 찾는 중…</p>
      ) : !palette.length ? (
        <p className="ws-note" role="status">
          {loaded.error
            ? "그림의 색을 불러오지 못했어요. 다른 인물을 골랐다가 다시 선택해 주세요."
            : "이 그림에서는 바꿀 수 있는 선명한 색을 찾지 못했어요."}
        </p>
      ) : (
        <>
          <div className="field">
            <label>바꿀 색</label>
            <div className="swatches" role="radiogroup" aria-label="바꿀 색">
              {palette.map((c, i) => (
                <button
                  key={c.hue}
                  className={`swatch ${source === c.hue ? "on" : ""}`}
                  role="radio"
                  aria-checked={source === c.hue}
                  aria-label={`그림 색 ${i + 1}`}
                  style={{ background: c.css }}
                  onClick={() => setChosen(c.hue)}
                />
              ))}
            </div>
          </div>
          <div className="field">
            <label>새 색</label>
            <div className="swatches" role="radiogroup" aria-label="새 색">
              {AVATAR_COLORS.map((color) => (
                <button
                  key={color}
                  className={`swatch ${current === color ? "on" : ""}`}
                  role="radio"
                  aria-checked={current === color}
                  aria-label={COLOR_KO[color]}
                  title={COLOR_KO[color]}
                  style={{
                    background: `hsl(${COLOR_HSL[color][0]} ${COLOR_HSL[color][1] * 100}% ${COLOR_HSL[color][2] * 100}%)`,
                  }}
                  onClick={() => {
                    if (source !== undefined)
                      onChange(
                        [
                          ...changes.filter((c) => c.source !== source),
                          { source, target: color },
                        ].slice(-4),
                      );
                  }}
                />
              ))}
            </div>
          </div>
          <div className="row">
            <button className="btn sm" onClick={reset} disabled={!current}>
              이 색 원래대로
            </button>
            <button
              className="btn sm"
              onClick={() => onChange([])}
              disabled={!changes.length}
            >
              모든 색 원래대로
            </button>
          </div>
        </>
      )}
    </div>
  );
}
