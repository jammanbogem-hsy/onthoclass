/**
 * 뿌요뿌요 배경음악 — 8비트 게임기 느낌의 짧은 반복곡 4곡(직접 작곡, 저작권 걱정 없음).
 * 음원 파일 없이 WebAudio 로 그 자리에서 합성한다: 펄스파 멜로디 + 삼각파 베이스 + 잡음 드럼.
 *
 * 스케줄링은 '앞으로 0.15초 안에 울릴 음표만 미리 예약'하는 방식이라
 * 탭이 바빠도 박자가 밀리지 않는다. 정지하면 버스 볼륨을 짧게 줄인 뒤 연결을 끊는다.
 */

const LOOK_AHEAD = 0.15;

// 마디마다 8분음표 8개. 숫자 = MIDI 음 높이, -1 = 앞 음 늘이기, 0 = 쉼표
type Bar = { root: number; lead: number[] };
const _ = -1;

/** 베이스: bounce=근음↔옥타브 통통 / walk=4분음표로 근음·5도 산책 / drive=8분 근음 몰아치기 */
type BassStyle = "bounce" | "walk" | "drive";
/** 드럼: pop=기본 8비트 / drive=킥이 많은 빠른 박자 / soft=느긋한 반박자 */
type DrumStyle = "pop" | "drive" | "soft";

export type BgmTrack = {
  id: string; name: string; bpm: number;
  /** 멜로디 펄스파 듀티(0.125 날카로움 · 0.25 패미컴 · 0.5 부드러움) */
  duty: number; leadVol: number;
  bass: BassStyle; drums: DrumStyle; bars: Bar[];
};

/** 1. 말랑 행진 — 통통 튀는 기본곡(C장조) */
const MARCH: Bar[] = [
  { root: 48, lead: [76, 79, 84, 79, 76, 79, 81, 79] }, // C
  { root: 45, lead: [81, _, 76, 81, 84, 83, 81, 76] }, // Am
  { root: 41, lead: [77, 81, 84, 81, 79, 77, 76, 77] }, // F
  { root: 43, lead: [79, _, 74, 79, 83, 81, 79, 74] }, // G
  { root: 48, lead: [76, 79, 84, 88, 86, 84, 83, 84] }, // C
  { root: 45, lead: [81, 84, 88, 84, 83, 81, 79, 81] }, // Am
  { root: 41, lead: [77, 81, 84, 86, 84, 81, 79, 77] }, // F
  { root: 43, lead: [79, 83, 86, _, 0, 83, 84, 86] }, // G
  { root: 41, lead: [81, _, 84, _, 81, 79, 77, _] }, // F
  { root: 43, lead: [83, _, 86, _, 83, 81, 79, _] }, // G
  { root: 40, lead: [79, 83, 88, 83, 79, 83, 88, 91] }, // Em
  { root: 45, lead: [88, _, 84, _, 81, _, 76, _] }, // Am
  { root: 41, lead: [77, 81, 84, 89, 88, 84, 81, 84] }, // F
  { root: 43, lead: [86, 83, 79, 83, 86, 88, 89, 86] }, // G
  { root: 48, lead: [88, _, 91, _, 88, 84, 79, 76] }, // C
  { root: 43, lead: [84, _, 0, 79, 81, 83, 84, 86] }, // G → 처음으로
];

/** 2. 두근두근 대결 — 빠르고 긴장감 있는 단조(A단조) */
const DUEL: Bar[] = [
  { root: 45, lead: [69, 72, 76, 72, 81, _, 76, 72] }, // Am
  { root: 41, lead: [77, _, 76, 74, 72, 74, 76, 77] }, // F
  { root: 43, lead: [79, _, 74, 79, 83, 81, 79, 74] }, // G
  { root: 40, lead: [80, _, 76, 80, 83, _, 80, 76] }, // E
  { root: 45, lead: [81, _, 84, 81, 76, _, 81, 84] }, // Am
  { root: 41, lead: [89, _, 88, 86, 84, 86, 88, 89] }, // F
  { root: 43, lead: [91, _, 86, 83, 79, 83, 86, _] }, // G
  { root: 40, lead: [88, 86, 84, 83, 80, _, 0, 76] }, // E
  { root: 38, lead: [77, _, 74, 77, 81, _, 77, 74] }, // Dm
  { root: 43, lead: [79, _, 74, 79, 83, _, 79, 74] }, // G
  { root: 48, lead: [76, 79, 84, 79, 76, 79, 84, 88] }, // C
  { root: 40, lead: [83, _, 80, _, 76, _, 80, 83] }, // E
  { root: 41, lead: [84, _, 81, 77, 84, _, 86, _] }, // F
  { root: 43, lead: [86, _, 83, 79, 86, _, 88, _] }, // G
  { root: 45, lead: [88, 84, 81, 76, 81, 84, 88, 93] }, // Am
  { root: 40, lead: [88, _, 83, _, 80, _, 76, _] }, // E → 처음으로
];

/** 3. 구름 산책 — 느긋하고 귀여운 곡(F장조) */
const STROLL: Bar[] = [
  { root: 41, lead: [72, _, 69, 72, 77, _, 76, 74] }, // F
  { root: 38, lead: [74, _, _, 69, 74, 77, 76, 74] }, // Dm
  { root: 46, lead: [70, _, 74, 77, 82, _, 81, 79] }, // B♭
  { root: 48, lead: [79, _, 76, 72, 74, 76, 77, 79] }, // C
  { root: 41, lead: [81, _, 77, _, 72, _, 77, 81] }, // F
  { root: 38, lead: [84, _, 81, 77, 74, _, 77, _] }, // Dm
  { root: 46, lead: [82, 81, 79, 77, 74, _, 77, 79] }, // B♭
  { root: 48, lead: [79, _, _, _, 0, 72, 74, 76] }, // C
  { root: 43, lead: [79, _, 74, 70, 74, _, 79, 82] }, // Gm
  { root: 48, lead: [84, _, 79, 76, 72, _, 76, 79] }, // C
  { root: 41, lead: [81, _, 77, 72, 77, _, 81, 84] }, // F
  { root: 38, lead: [86, _, 81, 78, 74, _, 78, 81] }, // D
  { root: 46, lead: [82, _, 77, 74, 82, _, 81, 79] }, // B♭
  { root: 48, lead: [76, _, 79, _, 84, _, 82, 79] }, // C
  { root: 41, lead: [77, _, _, 72, 77, 81, 79, 77] }, // F
  { root: 48, lead: [76, _, 74, _, 72, _, 0, 0] }, // C → 처음으로
];

/** 4. 별빛 점프 — 반짝이는 아르페지오(G장조) */
const STARS: Bar[] = [
  { root: 43, lead: [79, 74, 71, 74, 79, 83, 86, 83] }, // G
  { root: 40, lead: [79, 76, 71, 76, 79, 83, 88, 83] }, // Em
  { root: 48, lead: [76, 72, 67, 72, 76, 79, 84, 79] }, // C
  { root: 38, lead: [78, 74, 69, 74, 78, 81, 86, _] }, // D
  { root: 43, lead: [91, _, 86, 83, 79, _, 83, 86] }, // G
  { root: 40, lead: [88, _, 83, 79, 76, _, 79, 83] }, // Em
  { root: 48, lead: [84, _, 88, _, 86, 84, 83, 81] }, // C
  { root: 38, lead: [83, _, 81, _, 78, _, 0, 74] }, // D
  { root: 48, lead: [76, _, 79, _, 84, _, 83, 84] }, // C
  { root: 38, lead: [86, _, 81, _, 78, _, 81, 86] }, // D
  { root: 47, lead: [83, _, 78, _, 74, 78, 83, 86] }, // Bm
  { root: 40, lead: [88, _, _, 86, 83, _, 79, _] }, // Em
  { root: 48, lead: [84, 83, 84, 88, 86, _, 84, _] }, // C
  { root: 38, lead: [83, 81, 83, 86, 81, _, 78, _] }, // D
  { root: 43, lead: [79, 83, 86, 91, 86, 83, 79, 74] }, // G
  { root: 38, lead: [78, _, 81, _, 74, _, 0, 0] }, // D → 처음으로
];

/** 고를 수 있는 곡들 — 모두 직접 만든 곡이라 저작권 걱정이 없다. */
export const BGM_TRACKS: BgmTrack[] = [
  { id: "march", name: "말랑 행진", bpm: 150, duty: 0.25, leadVol: 0.07, bass: "bounce", drums: "pop", bars: MARCH },
  { id: "duel", name: "두근두근 대결", bpm: 172, duty: 0.25, leadVol: 0.065, bass: "drive", drums: "drive", bars: DUEL },
  { id: "stroll", name: "구름 산책", bpm: 126, duty: 0.5, leadVol: 0.06, bass: "walk", drums: "soft", bars: STROLL },
  { id: "stars", name: "별빛 점프", bpm: 160, duty: 0.125, leadVol: 0.06, bass: "bounce", drums: "pop", bars: STARS },
];
export const bgmTrack = (id: string) => BGM_TRACKS.find(t => t.id === id) ?? BGM_TRACKS[0];

const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

/** 펄스파 — 패미컴 멜로디 소리(듀티가 좁을수록 날카롭다) */
function pulseWave(ctx: AudioContext, duty: number) {
  const n = 32; const real = new Float32Array(n); const imag = new Float32Array(n);
  for (let k = 1; k < n; k++) real[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty);
  return ctx.createPeriodicWave(real, imag);
}

function noiseBuffer(ctx: AudioContext) {
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.25), ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

export class PuyoBgm {
  private bus: GainNode | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private step = 0;
  private nextAt = 0;
  private track: BgmTrack = BGM_TRACKS[0];
  private readonly waves = new Map<number, PeriodicWave>();
  private readonly noise: AudioBuffer;

  constructor(private readonly ctx: AudioContext, private readonly volume = 0.5) {
    this.noise = noiseBuffer(ctx);
  }

  get playing() { return this.timer !== null; }
  /** 마지막으로 튼 곡(아직 한 번도 안 틀었으면 null) */
  get current(): BgmTrack | null { return this.started ? this.track : null; }
  private started = false;

  /** 곡을 정해 튼다 — 이미 같은 곡이 흐르고 있으면 그대로 두고, 다른 곡이면 처음부터 바꿔 튼다. */
  start(track: BgmTrack = this.track) {
    if (this.timer && track === this.track) return;
    if (this.timer) this.stop();
    this.track = track; this.started = true;
    const bus = this.ctx.createGain();
    bus.gain.value = this.volume; bus.connect(this.ctx.destination);
    this.bus = bus; this.step = 0; this.nextAt = this.ctx.currentTime + 0.08;
    this.timer = setInterval(() => this.schedule(), 25);
    this.schedule();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    const bus = this.bus; this.bus = null;
    if (!bus) return;
    const t = this.ctx.currentTime;
    bus.gain.setValueAtTime(bus.gain.value, t); bus.gain.linearRampToValueAtTime(0, t + 0.12);
    setTimeout(() => bus.disconnect(), 300);
  }

  private schedule() {
    const bus = this.bus; if (!bus) return;
    while (this.nextAt < this.ctx.currentTime + LOOK_AHEAD) {
      this.playStep(bus, this.step % (this.track.bars.length * 8), this.nextAt);
      this.step++; this.nextAt += 60 / this.track.bpm / 2;
    }
  }

  private wave(duty: number) {
    let w = this.waves.get(duty);
    if (!w) { w = pulseWave(this.ctx, duty); this.waves.set(duty, w); }
    return w;
  }

  private playStep(bus: GainNode, step: number, at: number) {
    const t = this.track; const STEP = 60 / t.bpm / 2;
    const bar = t.bars[Math.floor(step / 8)]; const i = step % 8;
    // 멜로디: 늘이기(-1)가 몇 칸 이어지는지 세어 음 길이를 정한다
    const note = bar.lead[i];
    if (note > 0) {
      let len = 1; while (i + len < 8 && bar.lead[i + len] === _) len++;
      this.tone(bus, this.wave(t.duty), hz(note), at, STEP * len * 0.9, t.leadVol);
    }
    // 베이스
    if (t.bass === "bounce") this.tone(bus, "triangle", hz(bar.root + (i % 2 ? 12 : 0)), at, STEP * 0.8, 0.12);
    else if (t.bass === "drive") this.tone(bus, "triangle", hz(bar.root + (i === 3 || i === 7 ? 12 : 0)), at, STEP * 0.7, 0.12);
    else if (i % 2 === 0) this.tone(bus, "triangle", hz(bar.root + [0, 7, 12, 7][i / 2]), at, STEP * 1.7, 0.11);
    // 드럼
    if (t.drums === "pop") {
      if (i % 4 === 0) this.kick(bus, at);
      if (i % 4 === 2) this.hit(bus, at, 0.09, 1800, 0.05);
      if (i % 2 === 1) this.hit(bus, at, 0.03, 7000, 0.02);
    } else if (t.drums === "drive") {
      if (i === 0 || i === 3 || i === 4) this.kick(bus, at);
      if (i % 4 === 2) this.hit(bus, at, 0.08, 1800, 0.055);
      this.hit(bus, at, 0.02, 8000, i % 2 ? 0.02 : 0.012);
    } else {
      if (i === 0) this.kick(bus, at);
      if (i === 4) this.hit(bus, at, 0.1, 2200, 0.035);
      if (i % 2 === 0) this.hit(bus, at, 0.025, 8000, 0.012);
    }
  }

  private tone(bus: GainNode, wave: PeriodicWave | OscillatorType, freq: number, at: number, dur: number, vol: number) {
    const osc = this.ctx.createOscillator(); const g = this.ctx.createGain();
    if (wave instanceof PeriodicWave) osc.setPeriodicWave(wave); else osc.type = wave;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(vol, at + 0.008);
    g.gain.setValueAtTime(vol, at + Math.max(0.01, dur - 0.04)); g.gain.linearRampToValueAtTime(0, at + dur);
    osc.connect(g); g.connect(bus); osc.start(at); osc.stop(at + dur + 0.02);
  }

  private kick(bus: GainNode, at: number) {
    const osc = this.ctx.createOscillator(); const g = this.ctx.createGain();
    osc.frequency.setValueAtTime(140, at); osc.frequency.exponentialRampToValueAtTime(45, at + 0.1);
    g.gain.setValueAtTime(0.14, at); g.gain.exponentialRampToValueAtTime(0.001, at + 0.12);
    osc.connect(g); g.connect(bus); osc.start(at); osc.stop(at + 0.13);
  }

  private hit(bus: GainNode, at: number, dur: number, cutoff: number, vol: number) {
    const src = this.ctx.createBufferSource(); const f = this.ctx.createBiquadFilter(); const g = this.ctx.createGain();
    src.buffer = this.noise; f.type = "highpass"; f.frequency.value = cutoff;
    g.gain.setValueAtTime(vol, at); g.gain.exponentialRampToValueAtTime(0.001, at + dur);
    src.connect(f); f.connect(g); g.connect(bus); src.start(at); src.stop(at + dur + 0.01);
  }
}
