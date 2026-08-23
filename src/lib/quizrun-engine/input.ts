export type DriveControl = 'forward' | 'backward' | 'left' | 'right'

export interface RelativeHeading {
  x: number
  z: number
}

export interface RelativeDriveStep {
  headingX: number
  headingZ: number
  moveX: number
  moveZ: number
}

const KEY_CONTROLS: Record<string, DriveControl> = {
  w: 'forward',
  'ㅈ': 'forward',
  arrowup: 'forward',
  s: 'backward',
  'ㄴ': 'backward',
  arrowdown: 'backward',
  a: 'left',
  'ㅁ': 'left',
  arrowleft: 'left',
  d: 'right',
  'ㅇ': 'right',
  arrowright: 'right',
}

const CODE_CONTROLS: Record<string, DriveControl> = {
  KeyW: 'forward',
  KeyS: 'backward',
  KeyA: 'left',
  KeyD: 'right',
  ArrowUp: 'forward',
  ArrowDown: 'backward',
  ArrowLeft: 'left',
  ArrowRight: 'right',
}

export function getDriveControl(
  event: Pick<KeyboardEvent, 'key' | 'code'>,
): DriveControl | null {
  return CODE_CONTROLS[event.code] ?? KEY_CONTROLS[event.key.toLowerCase()] ?? null
}

export function stepRelativeDrive(
  heading: RelativeHeading,
  lateralInput: number,
  forwardInput: number,
): RelativeDriveStep {
  const headingLength = Math.hypot(heading.x, heading.z)
  const headingX = headingLength > 0.001 ? heading.x / headingLength : 0
  const headingZ = headingLength > 0.001 ? heading.z / headingLength : -1
  const rightX = -headingZ
  const rightZ = headingX
  const lateral = Math.max(-1, Math.min(1, lateralInput))
  const forward = Math.max(-1, Math.min(1, forwardInput))
  const rawX = headingX * forward + rightX * lateral
  const rawZ = headingZ * forward + rightZ * lateral
  const inputLength = Math.hypot(rawX, rawZ)
  const normalization = inputLength > 1 ? 1 / inputLength : 1

  return {
    headingX,
    headingZ,
    moveX: rawX * normalization,
    moveZ: rawZ * normalization,
  }
}
