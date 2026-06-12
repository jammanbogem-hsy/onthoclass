"use client";

// 카카오맵 래퍼 — SDK 로더(싱글턴) + 동네 핀 지도 컴포넌트.
//  · pins   : 큰 이모지 말풍선 커스텀 오버레이(감정색 테두리 + 장소 이름 라벨)
//  · heat   : 캔버스 오버레이 밀도 히트맵(simpleheat 방식 — 그레이 블롭 → 팔레트 색입힘)
//  · cluster: MarkerClusterer 군집(개수 버블)
// SDK 의존 코드라 타입은 any 기반(공식 d.ts 없음). 키는 NEXT_PUBLIC_KAKAO_MAP_KEY.
import { useEffect, useRef, useState } from "react";
import {
  CATEGORY_BY_ID,
  EMOTION_BY_ID,
  PLACE_TYPE_BY_ID,
  avatarFromUid,
  type TownPin,
} from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    kakao: any;
  }
}

export const DEFAULT_CENTER = { lat: 37.5665, lng: 126.978 }; // 서울시청(키 없을 때 폴백)

let loaderPromise: Promise<void> | null = null;

/** 카카오맵 SDK 로드(1회). 키가 없거나 로드 실패 시 reject. */
export function loadKakao(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.kakao?.maps?.Map) return Promise.resolve();
  if (loaderPromise) return loaderPromise;
  loaderPromise = new Promise<void>((resolve, reject) => {
    const key = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY;
    if (!key) {
      loaderPromise = null;
      reject(new Error("kakao-key-missing"));
      return;
    }
    const s = document.createElement("script");
    s.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${key}&autoload=false&libraries=services,clusterer`;
    s.async = true;
    s.onload = () => {
      try {
        window.kakao.maps.load(() => resolve());
      } catch {
        loaderPromise = null;
        reject(new Error("kakao-load-failed"));
      }
    };
    s.onerror = () => {
      loaderPromise = null;
      reject(new Error("kakao-load-failed"));
    };
    document.head.appendChild(s);
  });
  return loaderPromise;
}

export function useKakaoReady(): "loading" | "ready" | "error" {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  useEffect(() => {
    let alive = true;
    loadKakao()
      .then(() => alive && setState("ready"))
      .catch(() => alive && setState("error"));
    return () => {
      alive = false;
    };
  }, []);
  return state;
}

/** 학교 이름 → 좌표 (키워드 검색, localStorage 캐시). 실패 시 null. */
export async function locateSchool(
  schoolName: string
): Promise<{ lat: number; lng: number } | null> {
  const cacheKey = `eng54:school:${schoolName}`;
  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) return JSON.parse(cached);
  } catch {}
  try {
    await loadKakao();
  } catch {
    return null;
  }
  return new Promise((resolve) => {
    try {
      const ps = new window.kakao.maps.services.Places();
      ps.keywordSearch(schoolName, (data: any[], status: string) => {
        if (
          status === window.kakao.maps.services.Status.OK &&
          data?.[0]?.y &&
          data?.[0]?.x
        ) {
          const pos = { lat: Number(data[0].y), lng: Number(data[0].x) };
          try {
            localStorage.setItem(cacheKey, JSON.stringify(pos));
          } catch {}
          resolve(pos);
        } else {
          resolve(null);
        }
      });
    } catch {
      resolve(null);
    }
  });
}

// ─────────────────── 장소 검색 ───────────────────

export type PlaceHit = { name: string; address: string; lat: number; lng: number };

/** 카카오 장소 키워드 검색 콤보박스 — 결과를 고르면 onPick 으로 좌표·이름 전달.
 *  near 가 있으면 그 근처(학교 주변)를 우선 정렬한다. */
export function PlaceSearch({
  near,
  onPick,
  placeholder = "장소 이름으로 검색 (예: ○○공원, ○○도서관)",
}: {
  near?: { lat: number; lng: number } | null;
  onPick: (hit: PlaceHit) => void;
  placeholder?: string;
}) {
  const ready = useKakaoReady();
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState(""); // 마지막 선택값 — 같은 글자 재검색 방지
  const [results, setResults] = useState<PlaceHit[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const query = q.trim();
    if (ready !== "ready" || query.length < 2 || query === picked) {
      setResults([]);
      return;
    }
    let alive = true;
    setSearching(true);
    const t = setTimeout(() => {
      try {
        const ps = new window.kakao.maps.services.Places();
        const opts: Record<string, unknown> = {};
        if (near) {
          opts.location = new window.kakao.maps.LatLng(near.lat, near.lng);
          opts.radius = 10000; // 학교 반경 10km 우선
          opts.sort = window.kakao.maps.services.SortBy.DISTANCE;
        }
        ps.keywordSearch(
          query,
          (data: any[], status: string) => {
            if (!alive) return;
            setSearching(false);
            if (status === window.kakao.maps.services.Status.OK && Array.isArray(data)) {
              setResults(
                data.slice(0, 7).map((d) => ({
                  name: d.place_name as string,
                  address: (d.road_address_name || d.address_name || "") as string,
                  lat: Number(d.y),
                  lng: Number(d.x),
                }))
              );
            } else {
              setResults([]);
            }
          },
          opts
        );
      } catch {
        setSearching(false);
        setResults([]);
      }
    }, 350);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q, picked, near, ready]);

  return (
    <div className="relative z-20">
      <div className="flex items-center gap-2 rounded-full border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-high)] px-4 py-2.5">
        <span className="emoji-noto shrink-0 text-base leading-none">🔍</span>
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPicked("");
          }}
          placeholder={placeholder}
          className="w-full bg-transparent text-sm outline-none placeholder:text-[var(--md-sys-color-on-surface-variant)]"
        />
        {q && (
          <button
            type="button"
            onClick={() => {
              setQ("");
              setPicked("");
              setResults([]);
            }}
            className="shrink-0 text-xs text-[var(--md-sys-color-on-surface-variant)]"
          >
            ✕
          </button>
        )}
      </div>
      {searching && (
        <p className="absolute left-4 top-full mt-1 text-xs text-[var(--md-sys-color-on-surface-variant)]">
          검색 중…
        </p>
      )}
      {results.length > 0 && (
        <ul className="absolute left-0 right-0 top-full mt-1 max-h-56 overflow-y-auto rounded-2xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] shadow-lg">
          {results.map((r, i) => (
            <li key={i}>
              <button
                type="button"
                onClick={() => {
                  setQ(r.name);
                  setPicked(r.name);
                  setResults([]);
                  onPick(r);
                }}
                className="flex w-full flex-col items-start px-4 py-2 text-left hover:bg-[var(--md-sys-color-surface-container-high)]"
              >
                <span className="text-sm font-medium text-[var(--md-sys-color-on-surface)]">
                  {r.name}
                </span>
                <span className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                  {r.address}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─────────────────── 히트맵 렌더러 ───────────────────

/** 팔레트 스트립(256×1) — 파랑→초록→노랑→빨강 (밀도용) */
function buildPalette(stops: Record<number, string>): Uint8ClampedArray {
  const cv = document.createElement("canvas");
  cv.width = 256;
  cv.height = 1;
  const ctx = cv.getContext("2d")!;
  const grad = ctx.createLinearGradient(0, 0, 256, 0);
  for (const [pos, color] of Object.entries(stops)) {
    grad.addColorStop(Number(pos), color);
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 1);
  return ctx.getImageData(0, 0, 256, 1).data;
}

const DENSITY_STOPS: Record<number, string> = {
  0.2: "#4FC3F7",
  0.45: "#66BB6A",
  0.65: "#FFEE58",
  0.85: "#FFA726",
  1.0: "#EF5350",
};

function drawHeat(
  canvas: HTMLCanvasElement,
  map: any,
  points: { lat: number; lng: number; w: number }[],
  palette: Uint8ClampedArray,
  radius: number
) {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (!w || !h) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
    canvas.width = w * dpr;
    canvas.height = h * dpr;
  }
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  if (points.length === 0) return;

  const proj = map.getProjection();
  // 1) 그레이 블롭을 알파 누적으로 그린다
  for (const p of points) {
    const pt = proj.containerPointFromCoords(
      new window.kakao.maps.LatLng(p.lat, p.lng)
    );
    const x = pt.x;
    const y = pt.y;
    if (x < -radius || y < -radius || x > w + radius || y > h + radius) continue;
    const alpha = Math.min(0.05 + p.w * 0.4, 0.85);
    const grad = ctx.createRadialGradient(x, y, 0, x, y, radius);
    grad.addColorStop(0, `rgba(0,0,0,${alpha})`);
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  // 2) 누적 알파 → 팔레트 색으로 치환
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3];
    if (a === 0) continue;
    const j = a * 4;
    d[i] = palette[j];
    d[i + 1] = palette[j + 1];
    d[i + 2] = palette[j + 2];
    d[i + 3] = Math.min(a + 40, 215); // 살짝 진하게, 지도는 비치게
  }
  ctx.putImageData(img, 0, 0);
}

// ─────────────────── 핀 오버레이 ───────────────────

function pinContent(pin: TownPin, mine: boolean, big: boolean): HTMLDivElement {
  const emotion = EMOTION_BY_ID[pin.emotion];
  const place = PLACE_TYPE_BY_ID[pin.placeType];
  const category = CATEGORY_BY_ID[pin.category] ?? CATEGORY_BY_ID.visited;
  const color = category.color; // 테두리·라벨 색 = 카테고리(가봤던 곳/가고 싶은 곳)
  const size = big ? 56 : 48;
  // 메인 = 학생 프로필(사진 없으면 동물 아바타), 내 핀은 금색 바깥 링
  const shadow = mine
    ? "0 0 0 3px rgba(255,193,7,.95), 0 3px 10px rgba(0,0,0,.28)"
    : "0 3px 10px rgba(0,0,0,.28)";
  const face = pin.photoURL
    ? `<img src="${escapeHtml(pin.photoURL)}" referrerpolicy="no-referrer" alt="" style="width:100%;height:100%;border-radius:9999px;object-fit:cover">`
    : `<span class="emoji-noto" style="font-size:${Math.round(size * 0.55)}px;line-height:1">${avatarFromUid(pin.creatorUid)}</span>`;
  // 우측 상단 배지 = 감정 이모지 (잘 보이게 크게)
  const badgeSize = big ? 32 : 29;
  const badge = `<span class="emoji-noto" style="position:absolute;top:-12px;right:-12px;width:${badgeSize}px;height:${badgeSize}px;border-radius:9999px;background:#fff;border:2px solid ${color};display:flex;align-items:center;justify-content:center;font-size:${badgeSize - 9}px;line-height:1;box-shadow:0 1px 5px rgba(0,0,0,.3)">${emotion?.emoji ?? "📍"}</span>`;
  const root = document.createElement("div");
  root.style.cssText =
    "display:flex;flex-direction:column;align-items:center;cursor:pointer;transform:translateZ(0)";
  root.innerHTML = `
    <div style="position:relative;width:${size}px;height:${size}px;border-radius:9999px;background:#fff;border:3px solid ${color};box-shadow:${shadow};display:flex;align-items:center;justify-content:center;">
      ${face}
      ${badge}
    </div>
    <div style="width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-top:9px solid ${color};margin-top:-1px"></div>
    <div style="margin-top:2px;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;background:#fff;border:1.5px solid ${color};border-radius:9999px;padding:2px 10px;font-size:14px;font-weight:800;color:#222;box-shadow:0 1px 4px rgba(0,0,0,.18)">
      <span class="emoji-noto">${place?.emoji ?? "📍"}</span> ${escapeHtml(pin.placeName || place?.ko || "장소")}
    </div>`;
  return root;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ─────────────────── 지도 컴포넌트 ───────────────────

export type MapMode = "pins" | "heat" | "cluster";

export function TownMap({
  pins,
  mode = "pins",
  heatPoints,
  myUid,
  tempPin,
  onMapClick,
  onPinClick,
  center,
  panTo,
  fitKey,
  level = 4,
  className = "h-[420px]",
}: {
  pins: TownPin[];
  mode?: MapMode;
  /** heat 모드에서 사용할 점(미지정 시 pins 전체, w=1) */
  heatPoints?: { lat: number; lng: number; w: number }[];
  myUid?: string;
  /** 입력 중 임시 핀(모달 열림 동안 표시) */
  tempPin?: { lat: number; lng: number } | null;
  onMapClick?: (lat: number, lng: number) => void;
  onPinClick?: (pin: TownPin) => void;
  center?: { lat: number; lng: number } | null;
  /** 검색 등으로 특정 위치로 이동(확대) — ts 가 바뀔 때마다 이동 */
  panTo?: { lat: number; lng: number; ts: number } | null;
  /** 값이 바뀌면 핀 전체가 보이도록 화면 맞춤 */
  fitKey?: number;
  level?: number;
  className?: string;
}) {
  const ready = useKakaoReady();
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mapRef = useRef<any>(null);
  const overlaysRef = useRef<any[]>([]);
  const clustererRef = useRef<any>(null);
  const tempOverlayRef = useRef<any>(null);
  const paletteRef = useRef<Uint8ClampedArray | null>(null);
  const heatRef = useRef<{ lat: number; lng: number; w: number }[]>([]);
  const modeRef = useRef<MapMode>(mode);
  const clickRef = useRef<typeof onMapClick>(onMapClick);
  const pinClickRef = useRef<typeof onPinClick>(onPinClick);
  clickRef.current = onMapClick;
  pinClickRef.current = onPinClick;

  const [inited, setInited] = useState(false);

  // 지도 생성 (1회)
  useEffect(() => {
    if (ready !== "ready" || !boxRef.current || mapRef.current) return;
    const kakao = window.kakao;
    const c = center ?? DEFAULT_CENTER;
    const map = new kakao.maps.Map(boxRef.current, {
      center: new kakao.maps.LatLng(c.lat, c.lng),
      level,
    });
    mapRef.current = map;
    paletteRef.current = buildPalette(DENSITY_STOPS);

    kakao.maps.event.addListener(map, "click", (e: any) => {
      clickRef.current?.(e.latLng.getLat(), e.latLng.getLng());
    });

    // 히트맵 다시 그리기 — 드래그 중에도 rAF 스로틀로 부드럽게
    let raf = 0;
    const redraw = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        if (modeRef.current === "heat" && canvasRef.current && paletteRef.current) {
          drawHeat(canvasRef.current, map, heatRef.current, paletteRef.current, 42);
        }
      });
    };
    kakao.maps.event.addListener(map, "center_changed", redraw);
    kakao.maps.event.addListener(map, "zoom_changed", redraw);
    kakao.maps.event.addListener(map, "idle", redraw);

    // 컨테이너 크기 변동(탭 전환 등) 시 재배치
    const ro = new ResizeObserver(() => {
      map.relayout();
      redraw();
    });
    ro.observe(boxRef.current);
    setInited(true);
    return () => {
      ro.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // center 변경 반영(학교 위치 조회가 늦게 끝나는 경우)
  useEffect(() => {
    if (!inited || !mapRef.current || !center) return;
    mapRef.current.setCenter(new window.kakao.maps.LatLng(center.lat, center.lng));
  }, [inited, center]);

  // 검색 위치로 이동(확대)
  useEffect(() => {
    if (!inited || !mapRef.current || !panTo) return;
    mapRef.current.setLevel(3);
    mapRef.current.setCenter(new window.kakao.maps.LatLng(panTo.lat, panTo.lng));
  }, [inited, panTo]);

  // 핀/모드 반영
  useEffect(() => {
    if (!inited || !mapRef.current) return;
    const kakao = window.kakao;
    const map = mapRef.current;
    modeRef.current = mode;

    // 기존 오버레이/클러스터 정리
    overlaysRef.current.forEach((o) => o.setMap(null));
    overlaysRef.current = [];
    if (clustererRef.current) {
      clustererRef.current.clear();
      clustererRef.current.setMap(null);
      clustererRef.current = null;
    }

    if (mode === "pins") {
      for (const pin of pins) {
        const mine = !!myUid && pin.creatorUid === myUid;
        const el = pinContent(pin, mine, mine);
        el.addEventListener("click", () => pinClickRef.current?.(pin));
        const overlay = new kakao.maps.CustomOverlay({
          position: new kakao.maps.LatLng(pin.lat, pin.lng),
          content: el,
          yAnchor: 0.78, // 삼각형 끝이 좌표에 닿도록(라벨이 아래로 더 내려감)
          zIndex: mine ? 30 : 20,
          clickable: true,
        });
        overlay.setMap(map);
        overlaysRef.current.push(overlay);
      }
    } else if (mode === "cluster") {
      const markers = pins.map(
        (pin) =>
          new kakao.maps.Marker({
            position: new kakao.maps.LatLng(pin.lat, pin.lng),
          })
      );
      clustererRef.current = new kakao.maps.MarkerClusterer({
        map,
        markers,
        averageCenter: true,
        minLevel: 1,
        minClusterSize: 2,
        calculator: [5, 15, 30],
        styles: [28, 36, 44, 52].map((s, i) => ({
          width: `${s + 12}px`,
          height: `${s + 12}px`,
          background: ["#42A5F5E6", "#66BB6AE6", "#FFA726E6", "#EF5350E6"][i],
          borderRadius: "9999px",
          color: "#fff",
          textAlign: "center",
          lineHeight: `${s + 12}px`,
          fontSize: "14px",
          fontWeight: "800",
          boxShadow: "0 2px 8px rgba(0,0,0,.3)",
        })),
      });
    }

    // 히트맵 데이터 갱신 + 즉시 1회 그리기
    heatRef.current =
      heatPoints ?? pins.map((p) => ({ lat: p.lat, lng: p.lng, w: 1 }));
    if (canvasRef.current && paletteRef.current) {
      if (mode === "heat") {
        drawHeat(canvasRef.current, map, heatRef.current, paletteRef.current, 42);
      } else {
        const ctx = canvasRef.current.getContext("2d");
        ctx?.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      }
    }
  }, [inited, pins, mode, heatPoints, myUid]);

  // 임시 핀(입력 중) 표시
  useEffect(() => {
    if (!inited || !mapRef.current) return;
    const kakao = window.kakao;
    if (tempOverlayRef.current) {
      tempOverlayRef.current.setMap(null);
      tempOverlayRef.current = null;
    }
    if (tempPin) {
      const el = document.createElement("div");
      el.className = "animate-bounce";
      el.innerHTML = `<span class="emoji-noto" style="font-size:40px;filter:drop-shadow(0 3px 4px rgba(0,0,0,.35))">📍</span>`;
      tempOverlayRef.current = new kakao.maps.CustomOverlay({
        position: new kakao.maps.LatLng(tempPin.lat, tempPin.lng),
        content: el,
        yAnchor: 0.95,
        zIndex: 50,
      });
      tempOverlayRef.current.setMap(mapRef.current);
    }
  }, [inited, tempPin]);

  // 핀 전체 화면 맞춤
  useEffect(() => {
    if (!inited || !mapRef.current || !fitKey || pins.length === 0) return;
    const kakao = window.kakao;
    const bounds = new kakao.maps.LatLngBounds();
    pins.forEach((p) => bounds.extend(new kakao.maps.LatLng(p.lat, p.lng)));
    mapRef.current.setBounds(bounds, 48);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inited, fitKey]);

  if (ready === "error") {
    return (
      <div
        className={`flex items-center justify-center rounded-2xl bg-[var(--md-sys-color-surface-container-high)] p-6 text-center text-sm text-[var(--md-sys-color-on-surface-variant)] ${className}`}
      >
        지도를 불러오지 못했어요. 카카오맵 키(NEXT_PUBLIC_KAKAO_MAP_KEY)와
        <br />
        카카오 개발자 콘솔의 사이트 도메인 등록을 확인해 주세요.
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden rounded-2xl ${className}`}>
      <div ref={boxRef} className="absolute inset-0" />
      <canvas
        ref={canvasRef}
        className="pointer-events-none absolute inset-0 h-full w-full"
        style={{ zIndex: 5, display: mode === "heat" ? "block" : "none" }}
      />
      {ready === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center bg-[var(--md-sys-color-surface-container)] text-sm text-[var(--md-sys-color-on-surface-variant)]">
          지도를 불러오는 중…
        </div>
      )}
    </div>
  );
}
