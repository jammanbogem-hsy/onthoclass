import type { AnimationClip, KeyframeTrack } from 'three'

function findHipPositionTrack(clip: AnimationClip): KeyframeTrack | undefined {
  return clip.tracks.find((track) => track.name.endsWith('Hip.position'))
}

/**
 * Keeps the authored running pose while removing the clip's baked forward
 * travel. Without this, the hip advances every loop and snaps back to frame 0.
 */
export function makeInPlaceRunClip(
  source: AnimationClip,
  standClip?: AnimationClip,
): AnimationClip {
  const inPlaceClip = source.clone()
  const hipPosition = findHipPositionTrack(inPlaceClip)
  if (!hipPosition) return inPlaceClip

  const standHipPosition = standClip
    ? findHipPositionTrack(standClip)
    : undefined
  const valueSize = hipPosition.getValueSize()
  const forwardAxisIndex = 1
  const baseline = Number(
    standHipPosition?.values[forwardAxisIndex] ??
      hipPosition.values[forwardAxisIndex] ??
      0,
  )

  for (
    let index = forwardAxisIndex;
    index < hipPosition.values.length;
    index += valueSize
  ) {
    hipPosition.values[index] = baseline
  }

  return inPlaceClip
}

/** Keeps an animated creature centered on its physics body. */
export function makeRootTranslationInPlaceClip(
  source: AnimationClip,
): AnimationClip {
  const inPlaceClip = source.clone()
  const rootPosition = inPlaceClip.tracks.find((track) =>
    track.name.endsWith('Root.position'),
  )
  if (!rootPosition) return inPlaceClip

  const valueSize = rootPosition.getValueSize()
  const baseline = Array.from(
    { length: valueSize },
    (_, axis) => Number(rootPosition.values[axis] ?? 0),
  )

  for (let index = 0; index < rootPosition.values.length; index += 1) {
    rootPosition.values[index] = baseline[index % valueSize]
  }

  return inPlaceClip
}
