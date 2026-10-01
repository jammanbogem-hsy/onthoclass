/** Where the pushing crew character stands relative to the ball centre. */
export const CREW_PUSH_DISTANCE = 0.44
export const CREW_PUSH_SIDE_OFFSET = 0.18
const CREW_BODY_RADIUS = 0.3
/** Small forgiveness so a visible brush counts even between physics steps. */
export const HAZARD_CONTACT_MARGIN = 0.06

export interface PlayerContactProbe {
  x: number
  y: number
  z: number
  ballRadius: number
  /** Unit rolling direction (the character stands behind it). */
  motionX: number
  motionZ: number
}

export interface HazardBody {
  x: number
  z: number
  radius: number
  height: number
}

export function getCrewCharacterPosition(probe: PlayerContactProbe): [number, number] {
  const distance = probe.ballRadius + CREW_PUSH_DISTANCE
  return [
    probe.x - probe.motionX * distance + probe.motionZ * CREW_PUSH_SIDE_OFFSET,
    probe.z - probe.motionZ * distance - probe.motionX * CREW_PUSH_SIDE_OFFSET,
  ]
}

/**
 * Geometric contact test between a roaming hazard and the player: the ball
 * or the crew character pushing it. Physics contact events alone miss the
 * character (it has no collider) and sustained contact after the first touch.
 */
export function isHazardTouchingPlayer(
  hazard: HazardBody,
  probe: PlayerContactProbe,
  margin = HAZARD_CONTACT_MARGIN,
): boolean {
  // A ball rolling on a deck or bridge passes safely over ground hazards.
  if (probe.y - probe.ballRadius > hazard.height) return false
  const ballDistance = Math.hypot(hazard.x - probe.x, hazard.z - probe.z)
  if (ballDistance <= hazard.radius + probe.ballRadius + margin) return true
  const [characterX, characterZ] = getCrewCharacterPosition(probe)
  return (
    Math.hypot(hazard.x - characterX, hazard.z - characterZ) <=
    hazard.radius + CREW_BODY_RADIUS + margin
  )
}
