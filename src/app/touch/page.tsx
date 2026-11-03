"use client";

// /touch — 뽑기 게임(랜덤 추첨). 독립 페이지로, LMS 로그인 없이 교실 화면에서 바로 쓴다.
// 분할 시스템: 화면을 1~4개 통(pane)으로 나눠 각 통마다 다른 항목을 넣고,
// "다 같이 뽑기!"(또는 스페이스바)로 동시에 뽑을 수 있다. 각 통은 독립적으로
// 항목·필터·기록을 갖고 localStorage에 따로 저장된다(새로고침해도 유지).
//   • "뽑은 항목 제외" 켜짐 → 한 번 나온 건 빠져 다시 안 나옴(중복 없이 끝까지).
//   • 꺼짐 → 매번 전체에서 다시 뽑아 같은 항목이 또 나올 수 있음.
import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { Icon } from "@/components/Icon";
import { Button, IconButton, Switch, Textarea } from "@/components/ui";

const GLOBAL_KEY = "jamtouch:v2"; // { paneCount, soundOn }
const LEGACY_KEY = "jamtouch:v1"; // 단일 버전 데이터(0번 통으로 승계)
const paneKey = (i: number) => `jamtouch:pane:${i}`;
const MAX_PANES = 4;
const DEFAULT_NAMES = ["왼쪽", "오른쪽", "세 번째", "네 번째"];

// ── 효과음(Web Audio로 합성 — 음원 파일 없이 오프라인·정적배포에서 동작) ──
// AudioContext는 첫 사용자 제스처(뽑기 클릭/키) 때 lazily 생성·resume 한다.
let _audio: AudioContext | null = null;
let _master: AudioNode | null = null;
function getAudio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  // 오디오 생성 실패(브라우저 미지원·자동재생 정책·AudioContext 개수 한도 등)에도
  // 절대 뽑기 자체가 깨지지 않도록 통째로 try/catch → 실패 시 무음으로 폴백.
  try {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AC) return null;
    if (!_audio) {
      _audio = new AC();
      // 여러 통이 동시에 울려도 합이 1.0을 넘어 깨지지(클리핑) 않게 마지막에
      // 리미터(컴프레서)만 둔다. 게인은 0.9로 거의 그대로 — 한 통일 때 음량 유지.
      const comp = _audio.createDynamicsCompressor();
      comp.threshold.value = -8;
      comp.knee.value = 0;
      comp.ratio.value = 20;
      comp.attack.value = 0.003;
      comp.release.value = 0.12;
      const g = _audio.createGain();
      g.gain.value = 0.9;
      g.connect(comp).connect(_audio.destination);
      _master = g;
    }
    if (_audio.state === "suspended") void _audio.resume();
    return _audio;
  } catch {
    return null;
  }
}
// 모든 소리의 출력 지점(마스터 버스). 만들기 전이면 destination 으로 폴백.
function out(ctx: AudioContext): AudioNode {
  return _master ?? ctx.destination;
}

// ── 일레븐랩스로 만든 효과음(public/sounds/touch, scripts/touch/make-sfx.mjs) ──
// 페이지가 열리면 파일만 미리 받아 두고, 첫 클릭으로 AudioContext가 생기면 디코드한다.
// 파일을 못 받거나 디코드 전이면 아래 신스 소리로 대신 낸다(뽑기는 절대 막지 않음).
const SFX_NAMES = ["drumroll", "spin", "stop", "rimshot", "jackpot", "cheer"] as const;
type SfxName = (typeof SFX_NAMES)[number];
const _raw: Partial<Record<SfxName, Promise<ArrayBuffer | null>>> = {};
const _buf: Partial<Record<SfxName, AudioBuffer>> = {};
let _decoding: Promise<void> | null = null;
function preloadSfx() {
  for (const n of SFX_NAMES) {
    _raw[n] ??= fetch(`/sounds/touch/${n}.mp3`)
      .then((r) => (r.ok ? r.arrayBuffer() : null))
      .catch(() => null);
  }
}
function sfxReady(ctx: AudioContext): Promise<void> {
  preloadSfx();
  _decoding ??= Promise.all(
    SFX_NAMES.map(async (n) => {
      try {
        const ab = await _raw[n];
        if (ab) _buf[n] = await ctx.decodeAudioData(ab.slice(0));
      } catch {
        /* 이 소리만 신스로 */
      }
    })
  ).then(() => undefined);
  return _decoding;
}
type Voice = { stop: (fade?: number) => void };
function playSfx(
  ctx: AudioContext,
  name: SfxName,
  { gain = 1, at = 0, loop = false, rate = 1 } = {}
): Voice | null {
  const b = _buf[name];
  if (!b) return null;
  const t = ctx.currentTime + at;
  const src = ctx.createBufferSource();
  src.buffer = b;
  src.loop = loop;
  src.playbackRate.value = rate;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  src.connect(g).connect(out(ctx));
  src.start(t);
  return {
    stop(fade = 0.08) {
      try {
        const n = ctx.currentTime;
        g.gain.cancelScheduledValues(n);
        g.gain.setValueAtTime(g.gain.value, n);
        g.gain.linearRampToValueAtTime(0, n + fade);
        src.stop(n + fade + 0.02);
      } catch {
        /* 이미 멈춤 */
      }
    },
  };
}

// 릴이 한 칸 넘어갈 때마다 '딱' — 짧고 마른 클릭(속도에 따라 음높이).
function playTick(ctx: AudioContext, speed: number) {
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "square";
  osc.frequency.setValueAtTime(900 + Math.min(1, speed) * 700, t);
  osc.frequency.exponentialRampToValueAtTime(300, t + 0.03);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.05, t + 0.002);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
  osc.connect(gain).connect(out(ctx));
  osc.start(t);
  osc.stop(t + 0.05);
}

// 쭈욱 올라가는 슬라이드 휘파람.
function playSlideWhistle(ctx: AudioContext, start: number) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(420, start);
  osc.frequency.exponentialRampToValueAtTime(1500, start + 0.26);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(0.1, start + 0.03);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.3);
  osc.connect(gain).connect(out(ctx));
  osc.start(start);
  osc.stop(start + 0.32);
}

// 심벌 '챠앙' — 화이트노이즈를 하이패스로 깎아 짧게.
function playCymbal(ctx: AudioContext, start: number) {
  const dur = 0.45;
  const buf = ctx.createBuffer(
    1,
    Math.floor(ctx.sampleRate * dur),
    ctx.sampleRate
  );
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 1.5);
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 6000;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.16, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  src.connect(hp).connect(gain).connect(out(ctx));
  src.start(start);
  src.stop(start + dur);
}

// 당첨 축하 — 슬라이드 휘파람 → 상행 팡파르 → 심벌.
function playCelebrate(ctx: AudioContext) {
  const t0 = ctx.currentTime;
  playSlideWhistle(ctx, t0);
  const notes = [523.25, 659.25, 783.99, 1046.5];
  notes.forEach((f, i) => {
    const t = t0 + 0.22 + i * 0.09;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(f, t);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.16, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    osc.connect(gain).connect(out(ctx));
    osc.start(t);
    osc.stop(t + 0.32);
  });
  playCymbal(ctx, t0 + 0.22);
}

// 당첨 순간의 장난스러운 외침(무작위)
const WIN_PHRASES = [
  "짜잔! 🎉",
  "두구두구… 당첨!",
  "오늘의 주인공! ⭐",
  "빰빠라밤! 🎺",
  "축하해요! 🎊",
  "바로 이 사람! 👏",
  "운명의 선택! ✨",
  "와글와글~ 당첨! 🥳",
];

// 색종이 색(브랜드 + M3 역할색 혼합) + 이모지 색종이
const CONFETTI_COLORS = [
  "var(--md-sys-color-primary)",
  "var(--md-sys-color-tertiary)",
  "var(--md-sys-color-secondary)",
  "#F5C4B3",
  "#C0DD97",
  "#FFD166",
];
const CONFETTI_EMOJI = ["🎉", "🎊", "⭐", "🎈", "✨", "🥳", "🌈", "🍬"];
const NBSP = String.fromCharCode(0xa0); // 안 들리는(스크린리더 무음) 공백 — 재announce 토글용

// 텍스트(줄바꿈/쉼표로 구분) → 항목 배열. 앞뒤 공백·빈 항목 제거.
function parseItems(text: string): string[] {
  return text
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// 제외 필터를 적용한 "뽑을 수 있는 풀". 중복 항목도 뽑힌 개수만큼만 빠지도록
// 값 기준으로 한 개씩 제거한다. (이미 목록에서 사라진 옛 기록은 자연히 무시됨)
function computePool(
  items: string[],
  drawn: string[],
  exclude: boolean
): string[] {
  if (!exclude) return items;
  const remaining = [...items];
  for (const d of drawn) {
    const i = remaining.indexOf(d);
    if (i >= 0) remaining.splice(i, 1);
  }
  return remaining;
}

const onlyStrings = (a: unknown): string[] =>
  Array.isArray(a) ? a.filter((x): x is string => typeof x === "string") : [];

// ── 전체화면(Fullscreen API) — Safari 등 webkit 접두사까지 폴백 ──
// 모두 호출 시에만 document를 만지므로 SSR(prerender)에 안전하다.
type FsDoc = Document & {
  webkitExitFullscreen?: () => Promise<void> | void;
  webkitFullscreenElement?: Element | null;
};
type FsEl = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};
function fsElement(): Element | null {
  return document.fullscreenElement ?? (document as FsDoc).webkitFullscreenElement ?? null;
}
function requestFullscreen(el: HTMLElement): Promise<void> {
  const e = el as FsEl;
  if (el.requestFullscreen) return el.requestFullscreen();
  if (e.webkitRequestFullscreen) return Promise.resolve(e.webkitRequestFullscreen());
  return Promise.reject(new Error("Fullscreen 미지원"));
}
function exitFullscreen(): Promise<void> {
  if (!fsElement()) return Promise.resolve();
  const d = document as FsDoc;
  if (document.exitFullscreen) return document.exitFullscreen();
  if (d.webkitExitFullscreen) return Promise.resolve(d.webkitExitFullscreen());
  return Promise.resolve();
}

type PaneSaved = {
  name: string;
  items: string[];
  excludeDrawn: boolean;
  drawn: string[];
};

export type PickerHandle = { draw: () => void };

// ───────────────────────── 부모: 분할 컨트롤러 ─────────────────────────
export default function TouchDrawPage() {
  const [paneCount, setPaneCount] = useState(1);
  const [soundOn, setSoundOn] = useState(true);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [play, setPlay] = useState(false); // 실행(몰입) 모드 — 추첨 화면만
  const [hydrated, setHydrated] = useState(false);
  const pickerRefs = useRef<(PickerHandle | null)[]>([]);
  const runBtnRef = useRef<HTMLButtonElement>(null); // "실행하기" 버튼(이탈 시 포커스 복원)
  const drawAllRef = useRef<HTMLButtonElement>(null); // "다 같이 뽑기" 버튼(진입 시 포커스)
  const prevPlay = useRef(false);

  // ── 전역 설정 불러오기(+ 레거시 v1의 soundOn 승계) ──
  // 정적 export 대비: localStorage는 마운트 이후 effect에서만 읽어 하이드레이션
  // 불일치를 피한다(외부 시스템 동기화 — 규칙상 setState 허용 케이스).
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(GLOBAL_KEY);
      if (raw) {
        const g = JSON.parse(raw) as Partial<{
          paneCount: number;
          soundOn: boolean;
        }>;
        if (typeof g.paneCount === "number")
          setPaneCount(Math.min(MAX_PANES, Math.max(1, Math.round(g.paneCount))));
        if (typeof g.soundOn === "boolean") setSoundOn(g.soundOn);
      } else {
        const legacy = localStorage.getItem(LEGACY_KEY);
        if (legacy) {
          const l = JSON.parse(legacy) as Partial<{ soundOn: boolean }>;
          if (typeof l.soundOn === "boolean") setSoundOn(l.soundOn);
        }
      }
    } catch {
      /* 손상된 저장값 무시 */
    }
    setHydrated(true);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  // ── 전역 설정 저장 ──
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(GLOBAL_KEY, JSON.stringify({ paneCount, soundOn }));
    } catch {
      /* 저장 실패 무시 */
    }
  }, [paneCount, soundOn, hydrated]);

  // ── 효과음 파일 미리 받기 + 첫 터치에 오디오 깨우기(첫 뽑기부터 소리가 바로 나게) ──
  useEffect(() => {
    preloadSfx();
    if (!soundOn) return;
    const wake = () => {
      const ctx = getAudio();
      if (ctx) void sfxReady(ctx);
    };
    window.addEventListener("pointerdown", wake, { once: true, capture: true });
    window.addEventListener("keydown", wake, { once: true, capture: true });
    return () => {
      window.removeEventListener("pointerdown", wake, { capture: true });
      window.removeEventListener("keydown", wake, { capture: true });
    };
  }, [soundOn]);

  // ── "동작 줄이기" 설정 감지(마운트 이후 — export-safe) ──
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduceMotion(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  // ── 실행(몰입) 모드 진입/이탈 — 전체화면도 함께 토글 ──
  // 전체화면 요청은 사용자 제스처(버튼 클릭) 안에서 호출해야 한다.
  const enterPlay = useCallback(() => {
    setPlay(true);
    requestFullscreen(document.documentElement).catch(() => {
      /* 전체화면 거부·미지원 — 몰입 레이아웃만으로 진행(폴백) */
    });
  }, []);
  const exitPlay = useCallback(() => {
    setPlay(false);
    exitFullscreen().catch(() => {});
  }, []);

  // 사용자가 Esc/F11 등으로 전체화면을 빠져나가면 세팅 화면으로 동기화
  useEffect(() => {
    const onFsChange = () => {
      if (!fsElement()) setPlay(false);
    };
    document.addEventListener("fullscreenchange", onFsChange);
    document.addEventListener("webkitfullscreenchange", onFsChange);
    return () => {
      document.removeEventListener("fullscreenchange", onFsChange);
      document.removeEventListener("webkitfullscreenchange", onFsChange);
    };
  }, []);

  // 모드 전환 시 포커스 정리(키보드/스크린리더 길잡이) — 진입 시 주 동작 버튼으로,
  // 이탈 시 "실행하기"로 되돌려 매번 처음부터 Tab 하지 않게 한다.
  useEffect(() => {
    if (play && !prevPlay.current) drawAllRef.current?.focus();
    else if (!play && prevPlay.current) runBtnRef.current?.focus();
    prevPlay.current = play;
  }, [play]);

  // ── 모든 통을 동시에 뽑기 ──
  const drawAll = useCallback(() => {
    for (let i = 0; i < paneCount; i++) pickerRefs.current[i]?.draw();
  }, [paneCount]);

  // ── 스페이스/엔터로 "다 같이 뽑기"(입력 중·스크롤 필요 시 제외) ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isEnter = e.code === "Enter" || e.code === "NumpadEnter";
      const isSpace = e.code === "Space";
      if (!isEnter && !isSpace) return;
      // 입력 중이거나 버튼에 포커스가 있으면 가로채지 않는다(타이핑·버튼 기본동작 보존).
      // 키보드 스크롤이 필요하면 방향키/PageDown 으로 — 스페이스는 뽑기 전용.
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "BUTTON") return;
      e.preventDefault();
      drawAll();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawAll]);

  const multi = paneCount > 1;
  const cols = paneCount <= 1 ? 1 : paneCount === 3 ? 3 : 2; // 2→2, 4→2x2, 3→3
  // 실행(전체화면) 모드에선 여백을 줄이려 살짝 넓게 잡는다.
  const maxW = play
    ? paneCount <= 1
      ? "max-w-4xl"
      : paneCount === 2
        ? "max-w-6xl"
        : "max-w-7xl"
    : paneCount <= 1
      ? "max-w-3xl"
      : paneCount === 2
        ? "max-w-5xl"
        : "max-w-7xl";

  return (
    <main className="flex min-h-screen flex-col items-center bg-[var(--md-sys-color-surface)] px-3 py-6 text-[var(--md-sys-color-on-surface)] sm:px-4">
      <div
        className={`flex w-full flex-1 flex-col ${maxW} ${
          play ? "justify-center" : ""
        }`}
      >
        {/* 헤더 (세팅 모드에서만 — 실행 모드는 추첨에만 몰입) */}
        {!play && (
          <header className="mb-3 text-center">
            <p className="text-sm font-semibold text-[var(--md-sys-color-primary)]">
              랜덤 추첨
            </p>
            <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
              🎲 뽑기 게임
            </h1>
            <p className="mt-1 text-sm text-[var(--md-sys-color-on-surface-variant)]">
              {multi
                ? "통마다 다른 항목을 넣고 ‘다 같이 뽑기!’(스페이스바)로 동시에 뽑아요."
                : "미리 넣어 둔 항목 중 하나를 무작위로 뽑아요. 화면을 나눠 동시에 뽑을 수도 있어요."}
            </p>
          </header>
        )}

        {/* 툴바 */}
        <div className="mb-4 flex flex-wrap items-center justify-center gap-3">
          {play ? (
            // 실행 모드: 세팅으로 돌아가기
            <Button variant="tonal" icon="arrow_back" onClick={exitPlay}>
              세팅
            </Button>
          ) : (
            // 세팅 모드: 분할 수 선택
            <div className="inline-flex items-center gap-2">
              <span className="text-sm font-bold text-[var(--md-sys-color-on-surface-variant)]">
                분할
              </span>
              <div className="inline-flex rounded-full bg-[var(--md-sys-color-surface-container-high)] p-1">
                {Array.from({ length: MAX_PANES }, (_, i) => i + 1).map((n) => (
                  <button
                    key={n}
                    onClick={() => setPaneCount(n)}
                    aria-pressed={paneCount === n}
                    aria-label={`${n}분할`}
                    className={`h-9 w-10 rounded-full text-sm font-bold transition ${
                      paneCount === n
                        ? "bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)]"
                        : "text-[var(--md-sys-color-on-surface-variant)] hover:bg-[color-mix(in_srgb,var(--md-sys-color-on-surface)_8%,transparent)]"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          )}

          <IconButton
            icon={soundOn ? "volume_up" : "volume_off"}
            variant="tonal"
            label={soundOn ? "효과음 끄기" : "효과음 켜기"}
            onClick={() => setSoundOn((v) => !v)}
          />

          {!play && (
            // 세팅을 마치고 추첨 화면(실행 모드 + 전체화면)으로
            <Button ref={runBtnRef} size="lg" icon="play_arrow" onClick={enterPlay}>
              실행하기
            </Button>
          )}
        </div>

        {/* 다 같이 뽑기 (분할 시) */}
        {multi && (
          <div className="mb-4 flex justify-center">
            <button
              ref={drawAllRef}
              onClick={(e) => {
                drawAll();
                if (e.detail > 0) e.currentTarget.blur(); // 마우스 클릭이면 포커스 해제 → 다음 스페이스는 전체 뽑기로
              }}
              className="touch-jiggle inline-flex h-14 select-none items-center justify-center gap-2 rounded-full bg-[var(--md-sys-color-primary)] px-8 text-xl font-black text-[var(--md-sys-color-on-primary)] shadow-lg transition active:scale-95 hover:brightness-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--md-sys-color-primary)]"
            >
              <Icon name="casino" size={26} />
              다 같이 뽑기! 🎉
            </button>
          </div>
        )}

        {/* 통(pane) 그리드 */}
        <div
          className="grid grid-cols-1 gap-3 sm:gap-4 sm:[grid-template-columns:var(--cols)]"
          style={
            {
              "--cols": `repeat(${cols}, minmax(0, 1fr))`,
            } as React.CSSProperties
          }
        >
          {Array.from({ length: paneCount }, (_, i) => (
            <Picker
              key={i}
              ref={(el) => {
                pickerRefs.current[i] = el;
              }}
              storageKey={paneKey(i)}
              legacyKey={i === 0 ? LEGACY_KEY : undefined}
              defaultName={DEFAULT_NAMES[i] ?? `${i + 1}번`}
              showName={multi}
              compact={multi}
              play={play}
              soundOn={soundOn}
              reduceMotion={reduceMotion}
            />
          ))}
        </div>

        {!play && (
          <p className="mt-auto pt-6 text-center text-xs text-[var(--md-sys-color-on-surface-variant)]">
            입력한 항목은 이 브라우저에만 저장돼요.
          </p>
        )}
      </div>
    </main>
  );
}

// ───────────────────────── 통(pane) 하나 = 독립 뽑기 ─────────────────────────
const Picker = forwardRef<
  PickerHandle,
  {
    storageKey: string;
    legacyKey?: string;
    defaultName: string;
    showName: boolean;
    compact: boolean;
    play: boolean;
    soundOn: boolean;
    reduceMotion: boolean;
  }
>(function Picker(
  {
    storageKey,
    legacyKey,
    defaultName,
    showName,
    compact,
    play,
    soundOn,
    reduceMotion,
  },
  ref
) {
  const [name, setName] = useState(defaultName);
  const [items, setItems] = useState<string[]>([]);
  const [excludeDrawn, setExcludeDrawn] = useState(true);
  const [drawn, setDrawn] = useState<string[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const [rolling, setRolling] = useState(false);
  const [strip, setStrip] = useState<string[]>([]); // 슬롯 릴에 지나갈 이름들(마지막에서 두 번째가 당첨)
  const [winPhrase, setWinPhrase] = useState("");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [count, setCount] = useState("30");
  const [burst, setBurst] = useState(0);
  const [hydrated, setHydrated] = useState(false);

  const switchId = useId();
  const rafRef = useRef<number | null>(null);
  const reelRef = useRef<HTMLDivElement>(null); // 위아래로 구르는 이름 띠
  const stageRef = useRef<HTMLDivElement>(null); // 확대·흔들림을 주는 무대
  const voicesRef = useRef<Voice[]>([]); // 도는 동안 울리는 소리(드럼롤·릴)

  const clearTimer = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    voicesRef.current.forEach((v) => v.stop());
    voicesRef.current = [];
    if (stageRef.current) stageRef.current.style.transform = "";
  }, []);

  // ── 통 저장값 불러오기(없으면 0번 통은 레거시 v1로 승계) ──
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    try {
      let raw = localStorage.getItem(storageKey);
      if (!raw && legacyKey) raw = localStorage.getItem(legacyKey);
      if (raw) {
        const s = JSON.parse(raw) as Partial<PaneSaved>;
        if (typeof s.name === "string") setName(s.name); // 일부러 비운 이름도 그대로 복원
        if (Array.isArray(s.items)) setItems(onlyStrings(s.items));
        if (typeof s.excludeDrawn === "boolean") setExcludeDrawn(s.excludeDrawn);
        if (Array.isArray(s.drawn)) setDrawn(onlyStrings(s.drawn));
      }
    } catch {
      /* 손상된 저장값 무시 */
    }
    setHydrated(true);
    // storageKey/legacyKey는 통 인덱스에 고정 — 재실행 불필요
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  // ── 통 저장 ──
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({ name, items, excludeDrawn, drawn } satisfies PaneSaved)
      );
    } catch {
      /* 저장 실패 무시 */
    }
  }, [storageKey, name, items, excludeDrawn, drawn, hydrated]);

  // ── 언마운트 시 타이머 정리 ──
  useEffect(() => clearTimer, [clearTimer]);

  const pool = useMemo(
    () => computePool(items, drawn, excludeDrawn),
    [items, drawn, excludeDrawn]
  );
  const exhausted = excludeDrawn && items.length > 0 && pool.length === 0;
  const canDraw = !rolling && pool.length > 0;

  // ── 당첨 순간: 무대가 '쾅' 커졌다 흔들리고, 당첨 소리 ──
  const land = useCallback(
    (winner: string, ctx: AudioContext | null) => {
      const vol = compact ? 0.6 : 1; // 여러 통이 같이 울리면 조금 작게
      if (ctx && _buf.jackpot) {
        playSfx(ctx, "stop", { gain: 0.9 * vol });
        playSfx(ctx, "rimshot", { gain: 0.8 * vol });
        playSfx(ctx, "jackpot", { gain: 0.75 * vol, at: 0.12 });
        playSfx(ctx, "cheer", { gain: 0.7 * vol, at: 0.32 });
      } else if (ctx) playCelebrate(ctx);
      const st = stageRef.current;
      if (st && !reduceMotion && st.animate) {
        st.animate(
          [
            { transform: "scale(1.06)" },
            { transform: "scale(1.16) rotate(-1.5deg)", offset: 0.12 },
            { transform: "scale(0.97) translate(-10px, 4px) rotate(1.5deg)", offset: 0.28 },
            { transform: "scale(1.04) translate(8px, -4px) rotate(-1deg)", offset: 0.44 },
            { transform: "scale(0.99) translate(-5px, 2px)", offset: 0.6 },
            { transform: "scale(1.01) translate(3px, -1px)", offset: 0.78 },
            { transform: "none" },
          ],
          { duration: 620, easing: "ease-out" }
        );
      }
      setWinPhrase(WIN_PHRASES[Math.floor(Math.random() * WIN_PHRASES.length)]);
      setRolling(false);
      setCurrent(winner);
      setDrawn((prev) => [...prev, winner]);
      setBurst((b) => b + 1);
    },
    [compact, reduceMotion]
  );

  // ── 뽑기: 슬롯머신 릴이 빠르게 돌다 점점 느려지고, 당첨을 살짝 지나쳤다 되돌아와 멈춘다 ──
  const draw = useCallback(() => {
    if (rolling) return;
    const p = computePool(items, drawn, excludeDrawn);
    if (p.length === 0) return;
    const winner = p[Math.floor(Math.random() * p.length)];
    const ctx = soundOn ? getAudio() : null;
    if (ctx) void sfxReady(ctx);

    setCurrent(null);

    // 동작 줄이기 → 릴 없이 바로 공개(흔들림·색종이 없음, 소리는 그대로)
    if (reduceMotion) {
      land(winner, ctx);
      return;
    }

    // 릴에 지나갈 이름 띠 — 같은 이름이 연달아 붙지 않게, 당첨 바로 앞뒤는 다른 이름(아깝다! 효과)
    const others = p.length > 1 ? p.filter((x) => x !== winner) : [winner];
    const pick = (avoid?: string) => {
      const src = p.length > 1 ? p : [winner];
      let f = src[Math.floor(Math.random() * src.length)];
      if (src.length > 1 && f === avoid) f = src[(src.indexOf(f) + 1) % src.length];
      return f;
    };
    const N = compact ? 22 : 30;
    const s: string[] = [];
    for (let i = 0; i < N - 1; i++) s.push(pick(s[i - 1]));
    s.push(others[Math.floor(Math.random() * others.length)]);
    s.push(winner);
    s.push(others[Math.floor(Math.random() * others.length)]);
    s.push(pick());
    const W = N; // 당첨 위치
    setStrip(s);
    setRolling(true);

    // 도는 동안 소리: 드럼롤 + 릴 도는 소리(파일 준비되면 바로)
    if (ctx) {
      void sfxReady(ctx).then(() => {
        if (rafRef.current == null) return;
        const vol = compact ? 0.6 : 1;
        voicesRef.current = [
          playSfx(ctx, "drumroll", { gain: 0.8 * vol }),
          playSfx(ctx, "spin", { gain: 0.7 * vol, loop: true }),
        ].filter((v): v is Voice => !!v);
      });
    }

    const D = compact ? 3000 : 3900;
    const OV = 0.42; // 당첨을 살짝 지나치는 정도(칸)
    const A = 0.84; // 이 시점까지 감속하며 지나치고, 나머지 시간에 되돌아옴
    const t0 = performance.now();
    let prevPos = 0;
    let prevNow = t0;
    let lastRow = 0;
    let lastTick = 0;
    const frame = (now: number) => {
      const t = Math.min(1, (now - t0) / D);
      let pos: number;
      if (t < A) pos = (W + OV) * (1 - Math.pow(1 - t / A, 3.4));
      else {
        const b = (t - A) / (1 - A);
        const e = b < 0.5 ? 2 * b * b : 1 - Math.pow(-2 * b + 2, 2) / 2;
        pos = W + OV - OV * e;
      }
      const v = (Math.abs(pos - prevPos) / Math.max(1, now - prevNow)) * 1000; // 초당 칸
      prevPos = pos;
      prevNow = now;

      const reel = reelRef.current;
      if (reel) {
        reel.style.transform = `translate3d(0, calc(${(-pos).toFixed(3)} * var(--row)), 0)`;
        reel.style.filter = v > 8 ? `blur(${Math.min(3.5, v * 0.06).toFixed(1)}px)` : "none";
      }
      // 느려질수록 무대가 다가오고(확대) 두근두근 떨린다
      const st = stageRef.current;
      if (st) {
        const k = Math.max(0, Math.min(1, (t - 0.45) / 0.55));
        const ease = k * k * (3 - 2 * k);
        const amp = ease * (compact ? 2 : 3.5);
        const jx = Math.sin(now * 0.083) * amp;
        const jy = Math.cos(now * 0.117) * amp * 0.6;
        st.style.transform = `scale(${(1 + 0.06 * ease).toFixed(4)}) translate(${jx.toFixed(2)}px, ${jy.toFixed(2)}px)`;
      }
      // 한 칸 넘어갈 때마다 '딱'
      const row = Math.round(pos);
      if (row !== lastRow) {
        lastRow = row;
        if (ctx && now - lastTick > 30) {
          playTick(ctx, v / 30);
          lastTick = now;
        }
      }

      if (t >= 1) {
        rafRef.current = null;
        voicesRef.current.forEach((x) => x.stop(0.12));
        voicesRef.current = [];
        if (reel) reel.style.filter = "none";
        land(winner, ctx);
        return;
      }
      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);
  }, [rolling, items, drawn, excludeDrawn, reduceMotion, soundOn, compact, land]);

  useImperativeHandle(ref, () => ({ draw }), [draw]);

  // ── 진행 초기화(목록은 유지) ──
  const resetSession = useCallback(() => {
    clearTimer();
    setRolling(false);
    setDrawn([]);
    setCurrent(null);
    setStrip([]);
    setWinPhrase("");
  }, [clearTimer]);

  // ── 편집 열기/저장 ──
  function openEditor() {
    setDraft(items.join("\n"));
    setEditing(true);
  }
  function saveEditor() {
    setItems(parseItems(draft));
    resetSession();
    setEditing(false);
  }
  function fillNumbers() {
    const n = Math.max(0, Math.min(200, parseInt(count, 10) || 0));
    setDraft(Array.from({ length: n }, (_, i) => `${i + 1}`).join("\n"));
  }

  const draftCount = useMemo(() => parseItems(draft).length, [draft]);

  // 분할 시 더 촘촘하게(글자/무대 크기 축소). 실행 모드는 옵션이 사라져
  // 여백이 생기므로 무대를 더 키워 몰입감을 준다.
  const sz = compact
    ? {
        stage: play ? "min-h-[42vh]" : "min-h-[28vh]",
        drum: "text-lg sm:text-xl",
        roll: "text-3xl sm:text-4xl",
        result: "text-4xl sm:text-5xl",
        emoji: "text-2xl sm:text-3xl",
        btn: "h-12 min-w-[8rem] px-6 text-lg",
      }
    : {
        stage: play ? "min-h-[62vh]" : "min-h-[44vh]",
        drum: "text-2xl sm:text-3xl",
        roll: "text-5xl sm:text-6xl",
        result: "text-5xl sm:text-7xl",
        emoji: "text-3xl sm:text-5xl",
        btn: "h-16 min-w-[12rem] px-10 text-2xl",
      };

  return (
    <section
      className={
        compact
          ? "flex flex-col gap-3 rounded-3xl bg-[var(--md-sys-color-surface-container-low)] p-3 ring-1 ring-[var(--md-sys-color-outline-variant)]"
          : "flex flex-col gap-3"
      }
    >
      {/* 통 이름 — 세팅 때는 편집 가능, 실행 때는 큰 제목 */}
      {showName &&
        (play ? (
          <p className="truncate px-2 text-center text-xl font-extrabold text-[var(--md-sys-color-on-surface)] sm:text-2xl">
            {name || defaultName}
          </p>
        ) : (
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label="통 이름"
            placeholder={defaultName}
            maxLength={20}
            className="w-full truncate rounded-xl bg-transparent px-2 py-1 text-center text-lg font-extrabold text-[var(--md-sys-color-on-surface)] outline-none placeholder:text-[var(--md-sys-color-on-surface-variant)] focus:bg-[var(--md-sys-color-surface-container-high)]"
          />
        ))}

      {/* 무대 — 결과 표시 */}
      <div
        ref={stageRef}
        className={`relative flex flex-col items-center justify-center overflow-hidden rounded-[2rem] bg-[var(--md-sys-color-surface-container)] p-5 will-change-transform ${sz.stage} ${
          rolling ? "touch-stage-rolling" : ""
        }`}
      >
        {/* 슬롯머신 전구 — 도는 동안 빠르게, 당첨 뒤엔 천천히 줄지어 깜빡 */}
        {items.length > 0 && !reduceMotion && (rolling || current) && (
          <Bulbs fast={rolling} />
        )}
        {/* 당첨 순간 번쩍 + 뒤에서 도는 빛줄기 */}
        {!rolling && current && !reduceMotion && (
          <>
            <div key={`ray${burst}`} aria-hidden className="touch-rays" />
            <div key={`fl${burst}`} aria-hidden className="touch-flash" />
          </>
        )}
        {/* 색종이 (동작 줄이기에서는 생략) */}
        {burst > 0 && !rolling && current && !reduceMotion && (
          <Confetti seed={burst} dense={!compact} />
        )}

        {/* 스크린리더용 결과 안내 — 굴러가는 동안은 비우고 정착된 당첨만 읽음 */}
        <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
          {!rolling && current
            ? // 같은 당첨자가 연속으로 나와도 DOM 텍스트가 바뀌어 다시 읽히도록
              // 뽑을 때마다 끝에 안 들리는 공백(nbsp) 개수를 토글한다.
              `${showName && name ? `${name} ` : ""}당첨: ${current}${NBSP.repeat(
                burst % 2
              )}`
            : ""}
        </p>

        {/* 남은/전체 배지 */}
        {items.length > 0 && (
          <div className="absolute left-3 top-3 flex flex-wrap gap-1.5 text-xs font-bold">
            <span className="rounded-full bg-[var(--md-sys-color-secondary-container)] px-2.5 py-1 text-[var(--md-sys-color-on-secondary-container)]">
              남은 {pool.length} / 전체 {items.length}
            </span>
            {drawn.length > 0 && (
              <span className="rounded-full bg-[var(--md-sys-color-surface-container-highest)] px-2.5 py-1 text-[var(--md-sys-color-on-surface-variant)]">
                뽑음 {drawn.length}
              </span>
            )}
          </div>
        )}

        {/* 결과 콘텐츠 */}
        <div className="z-[1] flex w-full flex-col items-center text-center">
          {items.length === 0 ? (
            play ? (
              <div className="flex flex-col items-center gap-2 text-[var(--md-sys-color-on-surface-variant)]">
                <p className="text-4xl">📭</p>
                <p className="font-bold">이 통은 비어 있어요</p>
                <p className="text-sm">‘세팅’에서 항목을 넣어 주세요.</p>
              </div>
            ) : (
              <EmptyHint onAdd={openEditor} />
            )
          ) : rolling ? (
            <div className="flex w-full flex-col items-center gap-3">
              <p
                aria-hidden
                className={`touch-wiggle font-extrabold text-[var(--md-sys-color-tertiary)] ${sz.drum}`}
              >
                🥁 두구두구…
              </p>
              {/* 릴 창: 가운데 줄이 당첨 칸, 위아래는 흐리게 */}
              <div
                aria-hidden
                className={`touch-reel relative w-full max-w-[32rem] overflow-hidden rounded-3xl bg-[var(--md-sys-color-surface-container-lowest)] font-black ring-4 ring-[var(--md-sys-color-primary)] ${sz.roll}`}
              >
                <div className="pointer-events-none absolute inset-x-2 top-1/2 z-[1] h-[var(--row)] -translate-y-1/2 rounded-2xl bg-[color-mix(in_srgb,var(--md-sys-color-primary)_14%,transparent)]" />
                <span className="pointer-events-none absolute left-1 top-1/2 z-[2] -translate-y-1/2 text-[0.5em] text-[var(--md-sys-color-primary)]">▶</span>
                <span className="pointer-events-none absolute right-1 top-1/2 z-[2] -translate-y-1/2 text-[0.5em] text-[var(--md-sys-color-primary)]">◀</span>
                <div ref={reelRef} className="absolute inset-x-0 top-[var(--row)] will-change-transform">
                  {strip.map((f, i) => (
                    <div
                      key={i}
                      className="flex h-[var(--row)] items-center justify-center truncate px-8 text-[var(--md-sys-color-primary)]"
                    >
                      <span className="truncate">{f}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : current ? (
            <div key={burst} className="touch-pop flex flex-col items-center">
              <p className="mb-2 text-base font-extrabold text-[var(--md-sys-color-tertiary)] sm:text-lg">
                {winPhrase || "🎉 당첨!"}
              </p>
              <div className="flex items-center justify-center gap-2 sm:gap-3">
                <span aria-hidden className={`touch-bounce ${sz.emoji}`}>
                  🎉
                </span>
                <p
                  className={`break-keep font-black leading-tight text-[var(--md-sys-color-primary)] ${sz.result}`}
                >
                  {current}
                </p>
                <span
                  aria-hidden
                  className={`touch-bounce ${sz.emoji}`}
                  style={{ animationDelay: "0.18s" }}
                >
                  🎊
                </span>
              </div>
            </div>
          ) : exhausted ? (
            <div className="flex flex-col items-center gap-1">
              <p className="text-4xl">✅</p>
              <p className="text-xl font-extrabold sm:text-2xl">모두 뽑았어요!</p>
              <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">
                아래 “다시 채우기”로 처음부터 다시 뽑을 수 있어요.
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 text-[var(--md-sys-color-on-surface-variant)]">
              <p className="text-5xl sm:text-6xl">🎰</p>
              <p className="text-base font-bold sm:text-lg">뽑기 버튼을 눌러요!</p>
            </div>
          )}
        </div>
      </div>

      {/* 통 액션 */}
      <div className="flex flex-col items-center gap-2">
        {exhausted ? (
          <Button size="lg" icon="refresh" onClick={resetSession}>
            다시 채우기
          </Button>
        ) : (
          <button
            onClick={(e) => {
              draw();
              if (e.detail > 0) e.currentTarget.blur(); // 마우스 클릭이면 포커스 해제 → 다음 스페이스는 전체 뽑기로
            }}
            disabled={!canDraw}
            className={`inline-flex select-none items-center justify-center gap-2 rounded-full bg-[var(--md-sys-color-primary)] font-black text-[var(--md-sys-color-on-primary)] shadow-lg transition active:scale-95 disabled:pointer-events-none disabled:opacity-40 hover:brightness-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--md-sys-color-primary)] ${sz.btn} ${
              !compact && canDraw && !current ? "touch-jiggle" : ""
            }`}
          >
            <Icon name="touch_app" size={compact ? 22 : 28} />
            {rolling ? "뽑는 중…" : current ? "또 뽑기" : "뽑기!"}
          </button>
        )}
        {drawn.length > 0 && !exhausted && (
          <button
            onClick={resetSession}
            className="text-sm font-bold text-[var(--md-sys-color-on-surface-variant)] underline-offset-2 hover:underline"
          >
            ↺ 처음부터 다시
          </button>
        )}
      </div>

      {/* 옵션 + 목록 (실행 모드에서는 숨김 — 추첨에만 집중) */}
      {!play && (
        <div className="flex flex-col gap-3 rounded-3xl bg-[var(--md-sys-color-surface-container-low)] p-4">
          {/* 필터 토글 */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <label htmlFor={switchId} className="cursor-pointer font-bold">
              뽑은 항목 제외
            </label>
            <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">
              {excludeDrawn
                ? "한 번 나온 건 빼고 뽑아요 (중복 없이 끝까지)."
                : "매번 전체에서 다시 뽑아요 (같은 게 또 나올 수 있어요)."}
            </p>
          </div>
          <Switch id={switchId} checked={excludeDrawn} onChange={setExcludeDrawn} />
        </div>

        <div className="h-px bg-[var(--md-sys-color-outline-variant)]" />

        {/* 목록 헤더 */}
        <div className="flex items-center justify-between gap-2">
          <p className="font-bold">
            항목 목록{" "}
            <span className="font-normal text-[var(--md-sys-color-on-surface-variant)]">
              ({items.length}개)
            </span>
          </p>
          {!editing && (
            <Button
              size="sm"
              variant="tonal"
              icon={items.length ? "edit" : "add"}
              onClick={openEditor}
            >
              {items.length ? "편집" : "항목 추가"}
            </Button>
          )}
        </div>

        {editing ? (
          <div className="flex flex-col gap-3">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={7}
              placeholder={"한 줄에 하나씩 입력하세요.\n예)\n김철수\n이영희\n박민준"}
              supporting={`줄바꿈 또는 쉼표로 구분 · ${draftCount}개 인식됨`}
              autoFocus
            />
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-bold text-[var(--md-sys-color-on-surface-variant)]">
                번호로 채우기
              </span>
              <input
                type="number"
                min={1}
                max={200}
                value={count}
                onChange={(e) => setCount(e.target.value)}
                className="m3-field h-10 w-20 text-center"
                aria-label="번호 개수"
              />
              <Button size="sm" variant="outlined" onClick={fillNumbers}>
                1~{Math.max(0, Math.min(200, parseInt(count, 10) || 0))}번
              </Button>
              <Button
                size="sm"
                variant="text"
                onClick={() => setDraft("")}
                disabled={!draft}
              >
                모두 지우기
              </Button>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="text" onClick={() => setEditing(false)}>
                취소
              </Button>
              <Button icon="check" onClick={saveEditor}>
                저장 ({draftCount}개)
              </Button>
            </div>
            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
              저장하면 진행 상황(뽑은 기록)이 초기화돼요.
            </p>
          </div>
        ) : (
          items.length > 0 && (
            <ChipList items={items} drawn={drawn} excludeDrawn={excludeDrawn} />
          )
        )}

        {/* 뽑은 기록 */}
        {!editing && drawn.length > 0 && (
          <>
            <div className="h-px bg-[var(--md-sys-color-outline-variant)]" />
            <p className="font-bold">
              뽑은 순서{" "}
              <span className="font-normal text-[var(--md-sys-color-on-surface-variant)]">
                ({drawn.length}개)
              </span>
            </p>
            <ol className="flex flex-wrap gap-2">
              {drawn.map((d, i) => (
                <li
                  key={`${d}-${i}`}
                  className="inline-flex items-center gap-1.5 rounded-full bg-[var(--md-sys-color-surface-container-high)] py-1 pl-2 pr-3 text-sm font-bold"
                >
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[var(--md-sys-color-primary)] text-xs text-[var(--md-sys-color-on-primary)]">
                    {i + 1}
                  </span>
                  <span className="break-keep">{d}</span>
                </li>
              ))}
            </ol>
          </>
        )}
        </div>
      )}
    </section>
  );
});

/** 무대 테두리의 슬롯머신 전구(장식) */
function Bulbs({ fast }: { fast: boolean }) {
  const n = 14;
  const row = (side: "top" | "bottom") => (
    <div
      className={`pointer-events-none absolute inset-x-4 ${side === "top" ? "top-1.5" : "bottom-1.5"} flex justify-between`}
    >
      {Array.from({ length: n }, (_, i) => (
        <span
          key={i}
          className={`touch-bulb ${fast ? "touch-bulb-fast" : ""}`}
          style={{ animationDelay: `${(side === "top" ? i : n - i) * (fast ? 40 : 110)}ms` }}
        />
      ))}
    </div>
  );
  return (
    <div aria-hidden>
      {row("top")}
      {row("bottom")}
    </div>
  );
}

/** 항목이 하나도 없을 때의 안내 */
function EmptyHint({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <p className="text-5xl sm:text-6xl">📝</p>
      <p className="font-bold sm:text-lg">먼저 뽑을 항목을 넣어 주세요</p>
      <p className="max-w-xs text-sm text-[var(--md-sys-color-on-surface-variant)]">
        학생 이름이나 번호를 입력하면 그 중에서 무작위로 뽑아요.
      </p>
      <Button size="md" icon="add" onClick={onAdd}>
        항목 추가하기
      </Button>
    </div>
  );
}

/** 전체 항목 칩 — 제외 모드에서 이미 뽑힌 항목은 흐리게 + 줄긋기 */
function ChipList({
  items,
  drawn,
  excludeDrawn,
}: {
  items: string[];
  drawn: string[];
  excludeDrawn: boolean;
}) {
  // 뽑힌 개수만큼만 "소진" 표시(중복 항목 고려)
  const usedCount = new Map<string, number>();
  for (const d of drawn) usedCount.set(d, (usedCount.get(d) ?? 0) + 1);
  const seen = new Map<string, number>();

  return (
    <ul className="flex max-h-44 flex-wrap gap-2 overflow-y-auto">
      {items.map((it, i) => {
        const n = (seen.get(it) ?? 0) + 1;
        seen.set(it, n);
        const used = excludeDrawn && n <= (usedCount.get(it) ?? 0);
        return (
          <li
            key={`${it}-${i}`}
            className={`break-keep rounded-full px-3 py-1 text-sm font-semibold ${
              used
                ? "bg-[var(--md-sys-color-surface-container-highest)] text-[var(--md-sys-color-on-surface-variant)] line-through opacity-60"
                : "bg-[var(--md-sys-color-secondary-container)] text-[var(--md-sys-color-on-secondary-container)]"
            }`}
          >
            {it}
          </li>
        );
      })}
    </ul>
  );
}

/** 당첨 순간의 색종이(색 조각 + 이모지). seed로 매번 다시 떨어진다(키 교체로 재생). */
function Confetti({ seed, dense = true }: { seed: number; dense?: boolean }) {
  const nColor = dense ? 26 : 16;
  const nEmoji = dense ? 12 : 8;
  const pieces = Array.from({ length: nColor }, (_, i) => {
    const left = (i * 53 + seed * 17) % 100;
    const delay = (i % 7) * 60;
    const dur = 1500 + ((i * 37 + seed * 11) % 900);
    const color = CONFETTI_COLORS[(i + seed) % CONFETTI_COLORS.length];
    return { left, delay, dur, color, i };
  });
  const emojis = Array.from({ length: nEmoji }, (_, i) => {
    const left = (i * 61 + seed * 23 + 7) % 100;
    const delay = (i % 5) * 90;
    const dur = 1700 + ((i * 53 + seed * 13) % 1100);
    const e = CONFETTI_EMOJI[(i + seed) % CONFETTI_EMOJI.length];
    return { left, delay, dur, e, i };
  });
  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      {pieces.map((p) => (
        <span
          key={`c${p.i}`}
          className="touch-confetti-piece"
          style={
            {
              left: `${p.left}%`,
              background: p.color,
              "--delay": `${p.delay}ms`,
              "--dur": `${p.dur}ms`,
            } as React.CSSProperties
          }
        />
      ))}
      {emojis.map((p) => (
        <span
          key={`e${p.i}`}
          aria-hidden
          className="touch-confetti-emoji"
          style={
            {
              left: `${p.left}%`,
              "--delay": `${p.delay}ms`,
              "--dur": `${p.dur}ms`,
            } as React.CSSProperties
          }
        >
          {p.e}
        </span>
      ))}
    </div>
  );
}
