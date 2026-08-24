// 러닝 에너지 — 퀴즈런의 심장.
//
// 규칙(확정 사양):
//   · 움직이는 동안에만 초당 drainPerSec 만큼 닳는다.
//     멈춰서 다음 목표를 찾는 시간에는 줄지 않는다(초등학생이 화면을 살피는
//     동안 벌을 받지 않도록).
//   · 0 이 되면 이동 불가 — 문제를 풀어야 다시 움직인다.
//   · 정답 1개당 chargePerCorrect 충전, 상한 energyMax.
//   · 오답은 충전 없음 + wrongLockSec 동안 잠금 후 다음 문제.
//
// 이 파일은 순수 함수만 둔다(React·Firestore 없음) — 리듬을 수업에서 조정하려면
// 값을 바꿔가며 빠르게 확인할 수 있어야 하고, 물리/렌더와 얽히면 그게 어려워진다.

export type EnergyParams = {
  drainPerSec: number;
  chargePerCorrect: number;
  energyMax: number;
};

/** 이동 입력이 있는 프레임에서 에너지를 깎는다.
 *  moving=false 면 그대로 둔다. delta 는 프레임 간격(초). */
export function drain(
  energy: number,
  moving: boolean,
  delta: number,
  p: Pick<EnergyParams, "drainPerSec">
): number {
  if (!moving || delta <= 0) return energy;
  return Math.max(0, energy - p.drainPerSec * delta);
}

/** 정답 충전. 상한을 넘지 않는다. */
export function charge(
  energy: number,
  p: Pick<EnergyParams, "chargePerCorrect" | "energyMax">
): number {
  return Math.min(p.energyMax, energy + p.chargePerCorrect);
}

/** 움직일 수 있는가 — 이동 입력을 물리에 넘기기 전 이 게이트를 통과시킨다.
 *  (input.ts 의 결과를 0 으로 만들면 물리·렌더를 건드릴 필요가 없다) */
export function canMove(energy: number): boolean {
  return energy > 0;
}

/** 남은 에너지로 몇 초나 움직일 수 있나 — 학생 화면 게이지 보조 표시용 */
export function secondsLeft(
  energy: number,
  p: Pick<EnergyParams, "drainPerSec">
): number {
  if (p.drainPerSec <= 0) return Infinity;
  return energy / p.drainPerSec;
}
