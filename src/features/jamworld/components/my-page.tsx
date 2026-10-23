"use client";

/* Saved character previews come from our same-origin asset API. */
/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import GlassSurface, { GlassButton, GlassLink } from "./glass-surface";
import AvatarPreview from "./avatar-preview";
import CharacterColorEditor from "./character-color-editor";
import { api, type LibraryAsset, type Me } from "./workshop-api";
import {
  AVATAR_COLORS, COLOR_HSL, COLOR_KO, DEFAULT_LOOK, type AvatarLook,
} from "../lib/server/workshop/avatar";

// Persist only choices, never resolved URLs or sprite metadata supplied by a client.
function selection(look: AvatarLook): AvatarLook {
  return {
    base: "explorer", top: look.top, pack: look.pack, shoes: look.shoes, hair: look.hair,
    ...(look.assetId ? { assetId: look.assetId } : {}),
    ...(look.assetId && look.assetColors?.length ? { assetColors: look.assetColors } : {}),
  };
}
const sameLook = (a: AvatarLook, b: AvatarLook) =>
  JSON.stringify(selection(a)) === JSON.stringify(selection(b));

export default function MyPage({ me, assetId, onSaved }: {
  me: Me; assetId?: string; onSaved: (look: AvatarLook) => void;
}) {
  const initial = me.avatar ?? me.student?.avatar ?? DEFAULT_LOOK;
  const [saved, setSaved] = useState(initial);
  const [look, setLook] = useState<AvatarLook>(() =>
    assetId && assetId !== initial.assetId
      ? { ...selection(initial), assetId, assetColors: undefined }
      : initial,
  );
  const [characters, setCharacters] = useState<LibraryAsset[] | null>(null);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const savingRef = useRef(false);
  const requestRef = useRef(0);
  const load = useCallback(async () => {
    const request = ++requestRef.current;
    try {
      const data = await api<{ assets: LibraryAsset[] }>("/api/jamworld/workshop/catalog");
      if (request !== requestRef.current) return;
      setCharacters(data.assets.filter(a => a.category === "character" && a.appearance.kind === "views"));
      setLoadError("");
    } catch (e) {
      if (request === requestRef.current)
        setLoadError(e instanceof Error ? e.message : "인물을 불러오지 못했어요.");
    }
  }, []);
  useEffect(() => {
    void Promise.resolve().then(load);
    const refresh = () => { if (!document.hidden) void load(); };
    window.addEventListener("focus", refresh);
    window.addEventListener("jamworld-assets", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      // Invalidate pending catalog responses when leaving this page.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      requestRef.current++;
      window.removeEventListener("focus", refresh);
      window.removeEventListener("jamworld-assets", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [load]);
  const selected = characters?.find(a => a.id === look.assetId);
  const missing = !!look.assetId && characters !== null && !selected;
  const preview: AvatarLook = selected?.appearance.kind === "views" ? {
    ...selection(look),
    asset: {
      name: selected.name, td: selected.urls.td!, iso: selected.urls.iso!,
      ...(selected.appearance.sprites ? { sprites: {
        td: { ...selected.appearance.sprites.td, image: selected.urls.tdSheet! },
        iso: { ...selected.appearance.sprites.iso, image: selected.urls.isoSheet! },
      } } : {}),
    },
  } : { ...selection(look), ...(!missing && saved.assetId === look.assetId && saved.asset ? { asset: saved.asset } : {}) };
  const dirty = !sameLook(look, saved);
  const choose = (a?: LibraryAsset) => {
    if (savingRef.current) return;
    if (a?.id === look.assetId || (!a && !look.assetId)) return;
    setLook(a ? (a.id === saved.assetId ? saved : { ...selection(look), assetId: a.id, assetColors: undefined }) : !saved.assetId ? saved : { ...DEFAULT_LOOK });
    setMessage("");
  };
  const save = async () => {
    if (savingRef.current || !dirty || missing) return;
    savingRef.current = true;
    setSaving(true); setError(""); setMessage("");
    try {
      const result = await api<{ look: AvatarLook }>("/api/jamworld/workshop/avatar", {
        method: "PUT", json: { look: selection(look) },
      });
      setLook(result.look); setSaved(result.look); onSaved(result.look);
      setMessage("내 아바타로 설정했어요. 맵에 들어가면 이 캐릭터로 시작해요.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "아바타를 저장하지 못했어요.");
      void load();
    } finally {
      savingRef.current = false; setSaving(false);
    }
  };
  const name = selected?.name || (!missing && look.assetId ? saved.asset?.name : "") || "기본 탐험가";
  const slot = (key: "top" | "pack" | "shoes", label: string) => (
    <div className="field" key={key}>
      <label>{label}</label>
      <div className="swatches" role="radiogroup" aria-label={label}>
        {AVATAR_COLORS.map(c => <button key={c} role="radio" aria-checked={look[key] === c}
          aria-label={COLOR_KO[c]} title={COLOR_KO[c]} className={`swatch ${look[key] === c ? "on" : ""}`}
          style={{ background: `hsl(${COLOR_HSL[c][0]} ${COLOR_HSL[c][1] * 100}% ${COLOR_HSL[c][2] * 100}%)` }}
          onClick={() => { setLook(l => ({ ...l, [key]: c })); setMessage(""); }} />)}
      </div>
    </div>
  );
  return <main className="dash ws my-page">
    <div className="studio-heading"><div><h1>마이페이지</h1><p>{me.student?.nickname || me.teacher?.name}님의 캐릭터를 골라 보세요.</p></div></div>
    <div className="ws-avatar profile-avatar">
      <GlassSurface className="card profile-preview" contentClassName="panel-pad" frost={0.1}>
        <h2>내 아바타</h2>
        <AvatarPreview key={look.assetId || "explorer"} look={preview} />
        <div className="profile-selection"><h3>{missing ? "다른 인물을 골라 주세요" : name}</h3>
          <span className={`chip ${dirty ? "" : "teal"}`}>{dirty ? "선택 중" : "사용 중"}</span></div>
        <p className="ws-note">저장하면 모든 맵에서 내 기본 캐릭터로 사용해요.</p>
        {missing && <p className="issue err" role="alert">이 인물은 삭제되었거나 사용할 수 없어요.</p>}
        {error && <p className="issue err" role="alert">{error}</p>}
        <fieldset className="profile-options" disabled={saving}>
          <details><summary>색 바꾸기</summary><div className="profile-colors">
            {look.assetId ? (selected && <CharacterColorEditor
              key={selected.id} td={selected.urls.tdSheet || selected.urls.td!}
              iso={selected.urls.isoSheet || selected.urls.iso!} changes={look.assetColors ?? []}
              onChange={assetColors => { setLook(l => ({ ...l, assetColors })); setMessage(""); }} />)
              : [slot("top", "옷"), slot("pack", "가방"), slot("shoes", "신발")]}
          </div></details>
        </fieldset>
        <GlassButton className="btn primary profile-save" disabled={saving || !dirty || missing || (!!look.assetId && !selected)} onClick={() => void save()}>
          {saving ? "저장 중…" : dirty ? "내 아바타로 저장" : "내 아바타로 사용 중"}
        </GlassButton>
        {dirty && <GlassButton className="btn ghost sm profile-cancel" disabled={saving} onClick={() => { setLook(saved); setMessage(""); }}>선택 취소</GlassButton>}
        {message && <div className="profile-saved" role="status"><p>{message}</p><GlassLink href="/jamworldmake/?view=worlds">내 월드로 가기 <Icon name="arrow_forward" size={16} /></GlassLink></div>}
      </GlassSurface>
      <GlassSurface className="card character-picker profile-picker" contentClassName="panel-pad" frost={0.06}>
        <div className="section-title"><h2>인물 고르기</h2><GlassButton className="btn sm ghost" onClick={() => void load()}>새로고침</GlassButton></div>
        <p className="ws-note">공방에서 완성하고 ‘내 에셋에 저장’한 인물이 여기에 모여요.</p>
        {loadError && <p className="issue err" role="alert">{loadError}</p>}
        {characters === null && !loadError && <p role="status">인물을 불러오고 있어요…</p>}
        {!!characters && characters.length > 8 && <input className="input" aria-label="인물 이름 검색" placeholder="인물 이름 검색" value={query} onChange={e => setQuery(e.target.value)} />}
        <div className="character-grid" role="group" aria-label="아바타 인물 선택">
          <button className={`character-choice ${!look.assetId ? "on" : ""}`} aria-pressed={!look.assetId} disabled={saving} onClick={() => choose()}>
            <span className="profile-explorer" aria-hidden="true" /><b>기본 탐험가</b>
            <span className="profile-choice-state">{!saved.assetId ? "사용 중" : !look.assetId ? "선택 중" : "기본 캐릭터"}</span>
          </button>
          {characters?.filter(a => a.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).map(a => <button key={a.id}
            className={`character-choice ${look.assetId === a.id ? "on" : ""}`} aria-pressed={look.assetId === a.id} disabled={saving} onClick={() => choose(a)}>
            <img src={a.urls.iso || a.urls.td || ""} alt="" loading="lazy" /><b>{a.name}</b>
            <span className="profile-choice-state">{saved.assetId === a.id ? "사용 중" : look.assetId === a.id ? "선택 중" : a.appearance.kind === "views" && a.appearance.sprites ? "걷는 캐릭터" : "인물 그림"}</span>
          </button>)}
        </div>
        {characters?.length === 0 && <p className="empty">아직 완성된 인물이 없어요. 공방에서 첫 캐릭터를 만들어 보세요.</p>}
        <GlassLink className="btn profile-create" href="/jamworldmake/?view=workshop&category=character"><Icon name="auto_awesome" size={18} />공방에서 인물 만들기</GlassLink>
      </GlassSurface>
    </div>
  </main>;
}
