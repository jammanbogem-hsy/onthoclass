"use client";
import { useState } from "react";
import type { MapDoc } from "../lib/world/types";
import type { MapOp } from "../lib/world/ops";
import { effectDescription, type ZoneEffects } from "../lib/world/effects";
import { GlassButton } from "./glass-surface";

export default function MapBehaviors({
  doc,
  disabled,
  onOps,
}: {
  doc: MapDoc;
  disabled: boolean;
  onOps: (ops: MapOp[], label: string) => boolean;
}) {
  const update = (zoneId: string, effects: ZoneEffects) =>
    onOps([{ op: "zoneEffect", zoneId, effects }], "공간 효과");
  return (
    <div className="map-behaviors">
      <p className="ws-note">
        구역에 들어가면 효과가 켜지고, 나오면 자동으로 꺼져요. 도우미에게 말로
        부탁해도 돼요.
      </p>
      {!doc.zones.length && (
        <p className="empty">‘구역’ 도구로 공간을 먼저 만들어 주세요.</p>
      )}
      {doc.zones.map((z) => {
        const e = z.effects || {};
        return (
          <fieldset className="behavior-zone" key={z.id} disabled={disabled}>
            <legend>{z.name}</legend>
            <p>{effectDescription(e)}</p>
            <label>
              <input
                type="checkbox"
                checked={!!e.shake}
                onChange={(event) =>
                  update(z.id, { ...e, shake: event.target.checked ? 3 : 0 })
                }
              />
              화면 흔들기
            </label>
            <label>
              <input
                type="checkbox"
                checked={!!e.reverseControls}
                onChange={(event) =>
                  update(z.id, { ...e, reverseControls: event.target.checked })
                }
              />
              방향키 반대로
            </label>
            <label>
              <input
                type="checkbox"
                checked={!!e.vision}
                onChange={(event) => {
                  const next = { ...e };
                  if (event.target.checked) next.vision = 4;
                  else delete next.vision;
                  update(z.id, next);
                }}
              />
              시야 좁히기
            </label>
            <label>
              이동 속도
              <select
                value={e.speed || 1}
                onChange={(event) =>
                  update(z.id, { ...e, speed: Number(event.target.value) })
                }
              >
                {e.speed && ![0.5, 1, 1.5, 2].includes(e.speed) && (
                  <option value={e.speed}>{e.speed}배</option>
                )}
                <option value={0.5}>천천히</option>
                <option value={1}>보통</option>
                <option value={1.5}>빠르게</option>
                <option value={2}>아주 빠르게</option>
              </select>
            </label>
            <label>
              들어갈 때 안내
              <input
                key={`${z.id}:${e.message}`}
                defaultValue={e.message || ""}
                maxLength={100}
                placeholder="여기는 방향키가 반대예요"
                onBlur={(event) => {
                  if (event.target.value !== (e.message || ""))
                    update(z.id, { ...e, message: event.target.value });
                }}
              />
            </label>
            <GlassButton
              className="btn sm ghost"
              onClick={() => update(z.id, {})}
            >
              효과 지우기
            </GlassButton>
          </fieldset>
        );
      })}
      <details className="map-script-editor">
        <summary>JavaScript로 직접 만들기</summary>
        <ScriptEditor
          key={`${doc.id}:${doc.script}`}
          source={doc.script || ""}
          disabled={disabled}
          onApply={(source) => onOps([{ op: "setScript", source }], "맵 코드")}
        />
      </details>
    </div>
  );
}
function ScriptEditor({
  source,
  disabled,
  onApply,
}: {
  source: string;
  disabled: boolean;
  onApply: (source: string) => boolean;
}) {
  const [code, setCode] = useState(source);
  const example =
    'World.onEnter("광장", () => {\n  World.shake(3, 1500);\n  World.message("광장에 오신 걸 환영해요!", 2000);\n});\n\nWorld.onUpdate(ctx => {\n  if (ctx.zones.includes("비밀 정원")) {\n    World.reverseControls(true, 500);\n    World.vision(4, 500);\n  }\n});';
  return (
    <>
      <p className="ws-note">
        맵 효과 전용 공간에서 실행해요. 구역 이름이나 id로 입장·퇴장·시간에 따른
        동작을 만들 수 있어요.
      </p>
      <textarea
        className="textarea script-source"
        aria-label="맵 JavaScript"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        maxLength={8000}
        spellCheck={false}
        disabled={disabled}
        rows={13}
      />
      <div className="row">
        <GlassButton
          className="btn primary sm"
          disabled={disabled || code === source}
          onClick={() => onApply(code)}
        >
          코드 적용
        </GlassButton>
        <GlassButton
          className="btn sm"
          disabled={disabled}
          onClick={() => setCode(example)}
        >
          예시 넣기
        </GlassButton>
      </div>
      <details>
        <summary>사용할 수 있는 명령</summary>
        <p className="ws-note">
          World.onEnter(구역, 함수), World.onLeave(구역, 함수),
          World.onUpdate(함수). 함수에는 x·y·time(초)·zones가 전달돼요.
        </p>
        <p className="ws-note">
          World.shake(0~6, ms), World.reverseControls(true/false, ms),
          World.vision(2~12, ms), World.speed(0.25~2, ms), World.message(문자,
          ms). 시간은 100~10000ms예요.
        </p>
      </details>
    </>
  );
}
