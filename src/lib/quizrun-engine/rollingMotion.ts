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

const MIN_GROWTH_RADIUS = 0.42
const MAX_GROWTH_RADIUS = 2.08
const MIN_ROLLING_TOP_SPEED = 4.85
const MAX_ROLLING_TOP_SPEED = 5.65
export const MAX_COMPOSITE_ROLLING_SPEED = 7.8
const ICE_TRACTION_THRESHOLD = 0.5

function getGrowthProgress(ballRadius: number): number {
  return Math.min(
    1,
    Math.max(
      0,
      (ballRadius - MIN_GROWTH_RADIUS) /
        (MAX_GROWTH_RADIUS - MIN_GROWTH_RADIUS),
    ),
  )
}

export function getRollingTopSpeed(ballRadius: number): number {
  const growthProgress = getGrowthProgress(ballRadius)
  return (
    MIN_ROLLING_TOP_SPEED +
    (MAX_ROLLING_TOP_SPEED - MIN_ROLLING_TOP_SPEED) * growthProgress
  )
}

export function getCappedRollingSpeedMultiplier(
  ballRadius: number,
  requestedMultiplier: number,
): number {
  return Math.min(
    Math.max(0, requestedMultiplier),
    MAX_COMPOSITE_ROLLING_SPEED / getRollingTopSpeed(ballRadius),
  )
}

export function stepRollingMotion(
  current: RollingMotionState,
  inputX: number,
  inputZ: number,
  ballRadius: number,
  delta: number,
  traction = 1,
): RollingMotionStep {
  const frameDelta = Math.min(Math.max(delta, 0), 1 / 30)
  const inputLength = Math.hypot(inputX, inputZ)
  const hasInput = inputLength > 0.05
  const normalizedX = hasInput ? inputX / Math.max(1, inputLength) : 0
  const normalizedZ = hasInput ? inputZ / Math.max(1, inputLength) : 0
  const topSpeed = getRollingTopSpeed(ballRadius)
  const inputStrength = Math.min(1, inputLength)
  const targetSpeed = hasInput ? topSpeed * inputStrength : 0
  const baseSmoothing = hasInput
    ? 10 - getGrowthProgress(ballRadius) * 1.2
    : 6.5
  const clampedTraction = Math.min(1, Math.max(0.02, traction))

  if (clampedTraction < ICE_TRACTION_THRESHOLD) {
    const currentSpeed = Math.hypot(current.velocityX, current.velocityZ)
    const currentDirectionX = currentSpeed > 0.02
      ? current.velocityX / currentSpeed
      : normalizedX
    const currentDirectionZ = currentSpeed > 0.02
      ? current.velocityZ / currentSpeed
      : normalizedZ || -1
    let directionX = currentDirectionX
    let directionZ = currentDirectionZ
    let settledSpeed: number

    if (hasInput) {
      const currentAngle = Math.atan2(currentDirectionX, currentDirectionZ)
      const desiredAngle = Math.atan2(normalizedX, normalizedZ)
      const angleDelta = Math.atan2(
        Math.sin(desiredAngle - currentAngle),
        Math.cos(desiredAngle - currentAngle),
      )
      const highSpeedTurnRate = 0.62 + clampedTraction * 2.4
      const speedTurnProgress = Math.min(
        1,
        currentSpeed / Math.max(0.01, topSpeed * 0.55),
      )
      const turnRate =
        4.2 + (highSpeedTurnRate - 4.2) * speedTurnProgress
      const turnStep = Math.max(
        -turnRate * frameDelta,
        Math.min(turnRate * frameDelta, angleDelta),
      )
      const nextAngle = currentAngle + turnStep
      directionX = Math.sin(nextAngle)
      directionZ = Math.cos(nextAngle)

      const alignment =
        currentDirectionX * normalizedX +
        currentDirectionZ * normalizedZ
      const brakingTarget = alignment < -0.25
        ? targetSpeed * Math.max(0, (alignment + 1) / 0.75)
        : targetSpeed
      const speedResponse = alignment < -0.25 ? 0.65 : 3.4
      settledSpeed = damp(
        currentSpeed,
        brakingTarget,
        speedResponse,
        frameDelta,
      )
    } else {
      // Ice should preserve direction, but it still needs enough rolling
      // resistance for the player to read a clear, gradual slowdown.
      const coastDrag = 0.24 + clampedTraction * 1.3
      settledSpeed = currentSpeed * Math.exp(-coastDrag * frameDelta)
    }

    if (settledSpeed < 0.015) settledSpeed = 0
    const velocityX = directionX * settledSpeed
    const velocityZ = directionZ * settledSpeed

    return {
      velocityX,
      velocityZ,
      directionX: settledSpeed > 0 ? directionX : 0,
      directionZ: settledSpeed > 0 ? directionZ : -1,
      distance: settledSpeed * frameDelta,
      speed: settledSpeed,
      speedRatio: Math.min(1, settledSpeed / topSpeed),
    }
  }

  const smoothing =
    baseSmoothing *
    (hasInput
      ? 0.28 + clampedTraction * 0.72
      : 0.12 + clampedTraction * 0.88)
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
