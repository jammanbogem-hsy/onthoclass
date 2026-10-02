/**
 * 뿌요뿌요 배경음악 — 8비트 게임기 느낌의 짧은 반복곡(직접 작곡, 저작권 걱정 없음).
 * 음원 파일 없이 WebAudio 로 그 자리에서 합성한다: 펄스파 멜로디 + 삼각파 베이스 + 잡음 드럼.
 *
 * 스케줄링은 '앞으로 0.15초 안에 울릴 음표만 미리 예약'하는 방식이라
 * 탭이 바빠도 박자가 밀리지 않는다. 정지하면 버스 볼륨을 짧게 줄인 뒤 연결을 끊는다.
 */

const BPM = 150;
const STEP = 60 / BPM / 2; // 8분음표 하나
const LOOK_AHEAD = 0.15;

// 마디마다 8분음표 8개. 숫자 = MIDI 음 높이, -1 = 앞 음 늘이기, 0 = 쉼표
type Bar = { root: number; lead: number[] };
const _ = -1;
const SONG: Bar[] = [
  // A — 통통 튀는 주제
  { root: 48, lead: [76, 79, 84, 79, 76, 79, 81, 79] }, // C
  { root: 45, lead: [81, _, 76, 81, 84, 83, 81, 76] }, // Am
  { root: 41, lead: [77, 81, 84, 81, 79, 77, 76, 77] }, // F
  { root: 43, lead: [79, _, 74, 79, 83, 81, 79, 74] }, // G
  { root: 48, lead: [76, 79, 84, 88, 86, 84, 83, 84] }, // C
  { root: 45, lead: [81, 84, 88, 84, 83, 81, 79, 81] }, // Am
  { root: 41, lead: [77, 81, 84, 86, 84, 81, 79, 77] }, // F
  { root: 43, lead: [79, 83, 86, _, 0, 83, 84, 86] }, // G
  // B — 올라갔다 내려오는 후렴
  { root: 41, lead: [81, _, 84, _, 81, 79, 77, _] }, // F
  { root: 43, lead: [83, _, 86, _, 83, 81, 79, _] }, // G
  { root: 40, lead: [79, 83, 88, 83, 79, 83, 88, 91] }, // Em
  { root: 45, lead: [88, _, 84, _, 81, _, 76, _] }, // Am
  { root: 41, lead: [77, 81, 84, 89, 88, 84, 81, 84] }, // F
  { root: 43, lead: [86, 83, 79, 83, 86, 88, 89, 86] }, // G
  { root: 48, lead: [88, _, 91, _, 88, 84, 79, 76] }, // C
  { root: 43, lead: [84, _, 0, 79, 81, 83, 84, 86] }, // G → 처음으로
];
const STEPS = SONG.length * 8;

const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

/** 듀티 25% 펄스파 — 패미컴 멜로디 소리 */
function pulseWave(ctx: AudioContext, duty = 0.25) {
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
  private readonly pulse: PeriodicWave;
  private readonly noise: AudioBuffer;

  constructor(private readonly ctx: AudioContext, private readonly volume = 0.5) {
    this.pulse = pulseWave(ctx);
    this.noise = noiseBuffer(ctx);
  }

  get playing() { return this.timer !== null; }

  start() {
    if (this.timer) return;
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
      this.playStep(bus, this.step % STEPS, this.nextAt);
      this.step++; this.nextAt += STEP;
    }
  }

  private playStep(bus: GainNode, step: number, at: number) {
    const bar = SONG[Math.floor(step / 8)]; const i = step % 8;
    // 멜로디: 늘이기(-1)가 몇 칸 이어지는지 세어 음 길이를 정한다
    const note = bar.lead[i];
    if (note > 0) {
      let len = 1; while (i + len < 8 && bar.lead[i + len] === _) len++;
      this.tone(bus, this.pulse, hz(note), at, STEP * len * 0.9, 0.07);
    }
    // 베이스: 근음 ↔ 한 옥타브 위를 8분음표로 통통
    this.tone(bus, "triangle", hz(bar.root + (i % 2 ? 12 : 0)), at, STEP * 0.8, 0.12);
    // 드럼: 1·3박 킥, 2·4박 스네어, 엇박 하이햇
    if (i % 4 === 0) this.kick(bus, at);
    if (i % 4 === 2) this.hit(bus, at, 0.09, 1800, 0.05);
    if (i % 2 === 1) this.hit(bus, at, 0.03, 7000, 0.02);
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
