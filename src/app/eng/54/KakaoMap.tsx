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

function pinContent(
  pin: TownPin,
  mine: boolean,
  big: boolean,
  // tail/label 을 따로 끌 수 있다 — 이름표만 숨길 땐 꼬리를 남겨 동그라미 위치(좌표)가 안 흔들리게.
  // small: 가까이 몰린 곳에서 쓰는 작은 프로필(이름표·꼬리 없이 얼굴+감정만, 클릭만 되게).
  //   smallSize 로 지름을 줄 수 있다(몰릴수록 더 작게). 미지정 시 40px.
  opts: { tail?: boolean; label?: boolean; small?: boolean; smallSize?: number } = {}
): HTMLDivElement {
  const { tail: showTail = true, label: showLabel = true, small = false, smallSize } = opts;
  const emotion = EMOTION_BY_ID[pin.emotion];
  const place = PLACE_TYPE_BY_ID[pin.placeType];
  const category = CATEGORY_BY_ID[pin.category] ?? CATEGORY_BY_ID.visited;
  const color = category.color; // 테두리·라벨 색 = 카테고리(가봤던 곳/가고 싶은 곳)
  const size = small ? smallSize ?? 40 : big ? 56 : 48;
  const border = small ? 2 : 3;
  // 메인 = 학생 프로필(사진 없으면 동물 아바타), 내 핀은 금색 바깥 링
  const shadow = mine
    ? "0 0 0 3px rgba(255,193,7,.95), 0 3px 10px rgba(0,0,0,.28)"
    : "0 2px 7px rgba(0,0,0,.26)";
  const face = pin.photoURL
    ? `<img src="${escapeHtml(pin.photoURL)}" referrerpolicy="no-referrer" alt="" loading="lazy" decoding="async" style="width:100%;height:100%;border-radius:9999px;object-fit:cover">`
    : `<span class="emoji-noto" style="font-size:${Math.round(size * 0.55)}px;line-height:1">${avatarFromUid(pin.creatorUid)}</span>`;
  // 우측 상단 배지 = 감정 이모지. small 은 배지를 동그라미 안쪽에 붙여(거의 안 삐져나오게) 옆 얼굴을 안 가린다.
  const badgeSize = small ? Math.max(15, Math.round(size * 0.46)) : big ? 32 : 29;
  const badgeOff = small ? -Math.round(badgeSize * 0.12) : -12;
  const badge = `<span class="emoji-noto" style="position:absolute;top:${badgeOff}px;right:${badgeOff}px;width:${badgeSize}px;height:${badgeSize}px;border-radius:9999px;background:#fff;border:2px solid ${color};display:flex;align-items:center;justify-content:center;font-size:${badgeSize - (small ? 6 : 9)}px;line-height:1;box-shadow:0 1px 5px rgba(0,0,0,.3)">${emotion?.emoji ?? "📍"}</span>`;
  // 이름표를 숨긴 큰 핀(혼잡한 외톨이)엔 좌측 하단 장소 이모지를 글랜스 단서로 남긴다(small 은 제외).
  const placeBadge =
    showLabel || small
      ? ""
      : `<span class="emoji-noto" style="position:absolute;bottom:-9px;left:-9px;width:23px;height:23px;border-radius:9999px;background:#fff;border:2px solid ${color};display:flex;align-items:center;justify-content:center;font-size:13px;line-height:1;box-shadow:0 1px 4px rgba(0,0,0,.28)">${place?.emoji ?? "📍"}</span>`;
  const root = document.createElement("div");
  // small: 둘레에 투명 여백(패딩)을 둬 보이는 동그라미보다 큰 탭 영역을 확보(작을수록 여백도 작게 — 촘촘할 때 탭영역 겹침 최소화).
  const pad = small ? Math.round(size * 0.14) : 0;
  root.style.cssText = `display:flex;flex-direction:column;align-items:center;cursor:pointer;transform:translateZ(0);${pad ? `padding:${pad}px;` : ""}`;
  const tail = showTail
    ? `<div style="width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-top:9px solid ${color};margin-top:-1px"></div>`
    : "";
  const label = showLabel
    ? `<div style="margin-top:2px;max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;background:#fff;border:1.5px solid ${color};border-radius:9999px;padding:2px 10px;font-size:14px;font-weight:800;color:#222;box-shadow:0 1px 4px rgba(0,0,0,.18)">
      <span class="emoji-noto">${place?.emoji ?? "📍"}</span> ${escapeHtml(pin.placeName || place?.ko || "장소")}
    </div>`
    : "";
  root.innerHTML = `
    <div style="position:relative;width:${size}px;height:${size}px;border-radius:9999px;background:#fff;border:${border}px solid ${color};box-shadow:${shadow};display:flex;align-items:center;justify-content:center;">
      ${face}
      ${badge}
      ${placeBadge}
    </div>
    ${tail}
    ${label}`;
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
  // 핀/내 uid 는 지도 이동 시 화면좌표로 다시 묶을 때 ref 로 읽는다.
  const pinsRef = useRef<TownPin[]>(pins);
  const myUidRef = useRef<string | undefined>(myUid);
  const renderRef = useRef<() => void>(() => {});
  pinsRef.current = pins;
  myUidRef.current = myUid;

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
    // 핀 다시 그리기 — idle 이 한 번에 여러 번 떠도 rAF 로 묶어 한 프레임에 1회만(밀집 지도 부하↓)
    let pinRaf = 0;
    const renderPinsThrottled = () => {
      if (pinRaf) return;
      pinRaf = requestAnimationFrame(() => {
        pinRaf = 0;
        if (modeRef.current === "pins") renderRef.current?.();
      });
    };
    // 지도 이동/줌이 끝나면(핀 모드) 화면 좌표 기준으로 겹침을 다시 묶는다
    kakao.maps.event.addListener(map, "idle", () => {
      redraw();
      renderPinsThrottled();
    });

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
      if (pinRaf) cancelAnimationFrame(pinRaf);
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

  // 가까이 몰린 핀은 '뭉치기'(N명 버블) 없이 전부 작은 프로필로 펼쳐 보여준다.
  //   몰릴수록 프로필을 줄이고(profileDia) 촘촘히 배치(7명 이하 단일 링, 그 이상 해바라기 패킹).
  const GOLDEN = Math.PI * (3 - Math.sqrt(5)); // 황금각 — 해바라기 균일 분포
  // 묶음 인원 n 에 따른 작은 프로필 지름(px): 7명까지 40, 그 이상은 점점 작게(최소 24).
  const profileDia = (n: number) => (n <= 7 ? 40 : Math.max(24, 42 - n));
  // n개를 겹치지 않게 둘러 배치할 링 반지름(px) — 이웃 중심거리 ≈ 54 유지(프로필+탭여백).
  const ringRadius = (n: number) =>
    n <= 1 ? 0 : Math.max(30, Math.round(27 / Math.sin(Math.PI / n)));
  // 묶음 멤버들의 중심 기준 오프셋[dx,dy] — 2명 좌우, 7명까지 링, 그 이상 해바라기.
  const spreadOffsets = (n: number): [number, number][] => {
    if (n === 2) return [[-30, 0], [30, 0]];
    if (n <= 7) {
      const R = ringRadius(n);
      return Array.from({ length: n }, (_, i) => {
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
        return [R * Math.cos(a), R * Math.sin(a)] as [number, number];
      });
    }
    const step = profileDia(n) + 8; // 점 간 목표 간격(감정 배지·여백 고려)
    const k = step / Math.sqrt(Math.PI);
    return Array.from({ length: n }, (_, i) => {
      const r = k * Math.sqrt(i + 0.5);
      const a = i * GOLDEN;
      return [r * Math.cos(a), r * Math.sin(a)] as [number, number];
    });
  };
  // 묶음의 외곽 반경(px) — 2단계 중심합치기에서 이 거리로 묶음끼리 안 겹치게 띄운다(+여백).
  const groupFootR = (n: number): number => {
    if (n < 2) return 30;
    if (n === 2) return 54;
    if (n <= 7) return ringRadius(n) + 24;
    const step = profileDia(n) + 8;
    const k = step / Math.sqrt(Math.PI);
    return k * Math.sqrt(n - 0.5) + profileDia(n) / 2 + 6;
  };

  function clearPinLayer() {
    overlaysRef.current.forEach((o) => o.setMap(null));
    overlaysRef.current = [];
  }

  // 핀(겹침 묶음/펼침) · 군집 마커를 현재 화면 좌표 기준으로 다시 그린다.
  // idle 리스너에서도 호출되므로 props 대신 ref 값을 읽는다.
  function renderPins() {
    if (!mapRef.current) return;
    const kakao = window.kakao;
    const map = mapRef.current;
    const curMode = modeRef.current;

    clearPinLayer();
    if (clustererRef.current) {
      clustererRef.current.clear();
      clustererRef.current.setMap(null);
      clustererRef.current = null;
    }

    if (curMode === "pins") {
      const curPins = pinsRef.current;
      const myUid = myUidRef.current;
      const proj = map.getProjection();

      // 화면 밖 핀은 군집/투영 대상에서 제외(여유 CULL) — 합본 수천 핀도 보이는 만큼만 처리.
      const box = boxRef.current;
      const vw = box ? box.clientWidth : 0;
      const vh = box ? box.clientHeight : 0;
      const CULL = 160;
      const pts: { pin: TownPin; x: number; y: number }[] = [];
      for (const pin of curPins) {
        const cp = proj.containerPointFromCoords(
          new kakao.maps.LatLng(pin.lat, pin.lng)
        );
        if (
          vw &&
          vh &&
          (cp.x < -CULL || cp.y < -CULL || cp.x > vw + CULL || cp.y > vh + CULL)
        )
          continue;
        pts.push({ pin, x: cp.x, y: cp.y });
      }

      // ── 1단계: '서로 닿는' 핀을 한 묶음으로(연결요소, union-find 전이적).
      //   그리드 버킷으로 이웃만 비교하고, 이미 같은 묶음이면 거리계산을 건너뛴다
      //   (같은 장소 검색좌표가 똑같아 한 셀에 수십 개 몰려도 빠르게).
      const TH = 60; // 이 거리(px) 안쪽이면 시각적으로 겹치므로 한 묶음
      const cell = TH;
      const bucket = new Map<string, number[]>();
      pts.forEach((p, i) => {
        const k = `${Math.floor(p.x / cell)},${Math.floor(p.y / cell)}`;
        const arr = bucket.get(k);
        if (arr) arr.push(i);
        else bucket.set(k, [i]);
      });
      const parent = pts.map((_, i) => i);
      const find = (a: number): number => {
        while (parent[a] !== a) {
          parent[a] = parent[parent[a]];
          a = parent[a];
        }
        return a;
      };
      const TH2 = TH * TH;
      pts.forEach((p, i) => {
        const gx = Math.floor(p.x / cell);
        const gy = Math.floor(p.y / cell);
        for (let ox = -1; ox <= 1; ox++) {
          for (let oy = -1; oy <= 1; oy++) {
            const arr = bucket.get(`${gx + ox},${gy + oy}`);
            if (!arr) continue;
            for (const j of arr) {
              if (j <= i) continue;
              if (find(i) === find(j)) continue; // 이미 같은 묶음 — 거리계산 생략
              const dx = pts[j].x - p.x;
              const dy = pts[j].y - p.y;
              if (dx * dx + dy * dy < TH2) {
                const ra = find(i);
                const rb = find(j);
                if (ra !== rb) parent[ra] = rb;
              }
            }
          }
        }
      });
      const byRoot = new Map<number, { pin: TownPin; x: number; y: number }[]>();
      pts.forEach((p, i) => {
        const r = find(i);
        const g = byRoot.get(r);
        if (g) g.push(p);
        else byRoot.set(r, [p]);
      });
      let groups = Array.from(byRoot.values()).map((g) => {
        const cx = g.reduce((s, p) => s + p.x, 0) / g.length;
        const cy = g.reduce((s, p) => s + p.y, 0) / g.length;
        return { g, cx, cy };
      });

      // ── 2단계: 묶음끼리 겹침 방지 — 묶음 '중심'을 각자의 외곽 반경(groupFootR)까지 한 번 더 합친다.
      //   1단계는 점-점 60px 기준이라 끼인 두 스택의 중심이 ~60px로 붙어 펼친 프로필이 겹칠 수
      //   있다. groupFootR(n) 의 합보다 중심이 가까운 쌍을 합쳐 어떤 묶음도 안 겹치게 한다(외톨이-
      //   외톨이 기준은 60이라 멀찍한 두 핀이 묶여 사라지지 않음). 합치면 인원↑→footR↑ 이므로
      //   이웃 셀(MCELL)은 매 패스 현재 최대 footR 로 다시 잡는다. 패스 상한=그룹 수(체인 수렴 보장).
      const passCap = groups.length + 2;
      let merged = true;
      let pass = 0;
      while (merged && pass++ < passCap) {
        merged = false;
        let maxFoot = 30;
        for (const info of groups) {
          const f = groupFootR(info.g.length);
          if (f > maxFoot) maxFoot = f;
        }
        const MCELL = maxFoot * 2; // 3×3 스캔이 모든 합칠 쌍(거리<footR합≤2·maxFoot)을 포함
        const gb = new Map<string, number[]>();
        groups.forEach((info, i) => {
          const k = `${Math.floor(info.cx / MCELL)},${Math.floor(info.cy / MCELL)}`;
          const arr = gb.get(k);
          if (arr) arr.push(i);
          else gb.set(k, [i]);
        });
        const dead = new Array(groups.length).fill(false);
        for (let i = 0; i < groups.length; i++) {
          if (dead[i]) continue;
          const a = groups[i];
          const gx = Math.floor(a.cx / MCELL);
          const gy = Math.floor(a.cy / MCELL);
          for (let ox = -1; ox <= 1; ox++) {
            for (let oy = -1; oy <= 1; oy++) {
              const arr = gb.get(`${gx + ox},${gy + oy}`);
              if (!arr) continue;
              for (const j of arr) {
                if (j <= i || dead[j]) continue;
                const b = groups[j];
                const lim = groupFootR(a.g.length) + groupFootR(b.g.length);
                const dx = b.cx - a.cx;
                const dy = b.cy - a.cy;
                if (dx * dx + dy * dy < lim * lim) {
                  for (const m of b.g) a.g.push(m);
                  a.cx = a.g.reduce((s, p) => s + p.x, 0) / a.g.length;
                  a.cy = a.g.reduce((s, p) => s + p.y, 0) / a.g.length;
                  dead[j] = true;
                  merged = true;
                }
              }
            }
          }
        }
        if (merged) groups = groups.filter((_, i) => !dead[i]);
      }

      // 외톨이 이름표는 아주 가까운(60~78px) 다른 외톨이가 있을 때만 숨긴다(이름표끼리 겹침 방지).
      const LABEL_CLEAR = 78;
      const lcell = LABEL_CLEAR;
      const cbucket = new Map<string, number[]>();
      groups.forEach((info, idx) => {
        const k = `${Math.floor(info.cx / lcell)},${Math.floor(info.cy / lcell)}`;
        const arr = cbucket.get(k);
        if (arr) arr.push(idx);
        else cbucket.set(k, [idx]);
      });
      const isCrowded = (idx: number): boolean => {
        const info = groups[idx];
        const gx = Math.floor(info.cx / lcell);
        const gy = Math.floor(info.cy / lcell);
        for (let ox = -1; ox <= 1; ox++) {
          for (let oy = -1; oy <= 1; oy++) {
            const arr = cbucket.get(`${gx + ox},${gy + oy}`);
            if (!arr) continue;
            for (const j of arr) {
              if (j === idx) continue;
              const o = groups[j];
              const dx = o.cx - info.cx;
              const dy = o.cy - info.cy;
              if (dx * dx + dy * dy < LABEL_CLEAR * LABEL_CLEAR) return true;
            }
          }
        }
        return false;
      };

      // 핀 1개 오버레이 — showTail/showLabel/small/anchorY 로 모양·좌표고정을 제어.
      //   이름표만 숨길 땐(혼잡) 꼬리·앵커(0.78)를 유지해 동그라미가 안 흔들리게,
      //   몰린 곳 작은 프로필은 small=true + 좌표 중앙(anchorY 0.5)으로 그린다.
      const addPinOverlay = (
        pin: TownPin,
        position: any,
        z: number,
        opts: {
          showTail?: boolean;
          showLabel?: boolean;
          small?: boolean;
          smallSize?: number;
          big?: boolean;
          anchorY?: number;
        } = {}
      ) => {
        const {
          showTail = true,
          showLabel = true,
          small = false,
          smallSize,
          big,
          anchorY = 0.78,
        } = opts;
        const mine = !!myUid && pin.creatorUid === myUid;
        const el = pinContent(pin, mine, big ?? mine, {
          tail: showTail,
          label: showLabel,
          small,
          smallSize,
        });
        el.addEventListener("click", (ev) => {
          ev.stopPropagation();
          pinClickRef.current?.(pin);
        });
        const ov = new kakao.maps.CustomOverlay({
          position,
          content: el,
          yAnchor: anchorY,
          zIndex: mine ? z + 1 : z,
          clickable: true,
        });
        ov.setMap(map);
        overlaysRef.current.push(ov);
      };

      groups.forEach((info, idx) => {
        const { g, cx, cy } = info;
        if (g.length === 1) {
          // 외톨이 — 아주 가까운 다른 외톨이가 있으면 이름표만 숨긴다(꼬리·위치 유지).
          addPinOverlay(
            g[0].pin,
            new kakao.maps.LatLng(g[0].pin.lat, g[0].pin.lng),
            20,
            { showLabel: !isCrowded(idx) }
          );
          return;
        }
        // 가까이 몰린 친구들 — '뭉치기'(N명 버블) 없이 전부 작은 프로필로 펼친다.
        //   몰릴수록 프로필을 줄이고(profileDia) 촘촘히(spreadOffsets) 배치. 항상 펼쳐 있어 탭 불필요.
        const n = g.length;
        const dia = profileDia(n);
        const offs = spreadOffsets(n);
        g.forEach((m, i) => {
          const [dx, dy] = offs[i];
          const memLatLng = proj.coordsFromContainerPoint(
            new kakao.maps.Point(cx + dx, cy + dy)
          );
          // z를 멤버 순서로 올려, 탭 영역이 살짝 겹쳐도 '위에 보이는'(나중에 그린) 프로필이 탭을 받게.
          addPinOverlay(m.pin, memLatLng, 30 + i, {
            small: true,
            smallSize: dia,
            showTail: false,
            showLabel: false,
            anchorY: 0.5,
          });
        });
      });
    } else if (curMode === "cluster") {
      const markers = pinsRef.current.map(
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
  }
  renderRef.current = renderPins;

  // 핀/모드 반영
  useEffect(() => {
    if (!inited || !mapRef.current) return;
    modeRef.current = mode;
    renderPins();

    // 히트맵 데이터 갱신 + 즉시 1회 그리기
    heatRef.current =
      heatPoints ?? pins.map((p) => ({ lat: p.lat, lng: p.lng, w: 1 }));
    if (canvasRef.current && paletteRef.current) {
      if (mode === "heat") {
        drawHeat(
          canvasRef.current,
          mapRef.current,
          heatRef.current,
          paletteRef.current,
          42
        );
      } else {
        const ctx = canvasRef.current.getContext("2d");
        ctx?.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
