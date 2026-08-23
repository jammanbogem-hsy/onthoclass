export interface RollingMotionState {
  velocityX: number
  velocityZ: number
}

export interface RollingMotionStep extends RollingMotionState {
  directionX: number
  directionZ: number
  distance: number
  speed: number
  speedRatio: number
}

const damp = (current: number, target: number, smoothing: number, delta: number) =>
  target + (current - target) * Math.exp(-smoothing * delta)

export function getRollingTopSpeed(ballRadius: number): number {
  return Math.max(3.2, 5.4 - ballRadius * 0.65)
}

export function stepRollingMotion(
  current: RollingMotionState,
  inputX: number,
  inputZ: number,
  ballRadius: number,
  delta: number,
): RollingMotionStep {
  const frameDelta = Math.min(Math.max(delta, 0), 1 / 30)
  const inputLength = Math.hypot(inputX, inputZ)
  const hasInput = inputLength > 0.05
  const normalizedX = hasInput ? inputX / Math.max(1, inputLength) : 0
  const normalizedZ = hasInput ? inputZ / Math.max(1, inputLength) : 0
  const topSpeed = getRollingTopSpeed(ballRadius)
  const inputStrength = Math.min(1, inputLength)
  const targetSpeed = hasInput ? topSpeed * inputStrength : 0
  const smoothing = hasInput ? 9.5 : 6.5
  let velocityX = damp(
    current.velocityX,
    normalizedX * targetSpeed,
    smoothing,
    frameDelta,
  )
  let velocityZ = damp(
    current.velocityZ,
    normalizedZ * targetSpeed,
    smoothing,
    frameDelta,
  )
  const speed = Math.hypot(velocityX, velocityZ)

  if (!hasInput && speed < 0.025) {
    velocityX = 0
    velocityZ = 0
  }

  const settledSpeed = Math.hypot(velocityX, velocityZ)

  return {
    velocityX,
    velocityZ,
    directionX: settledSpeed > 0 ? velocityX / settledSpeed : 0,
    directionZ: settledSpeed > 0 ? velocityZ / settledSpeed : -1,
    distance: settledSpeed * frameDelta,
    speed: settledSpeed,
    speedRatio: Math.min(1, settledSpeed / topSpeed),
  }
}
