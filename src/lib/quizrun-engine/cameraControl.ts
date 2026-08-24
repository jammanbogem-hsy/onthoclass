export const CAMERA_ZOOM_MIN = 0.55
export const CAMERA_ZOOM_MAX = 1.9
export const CAMERA_DRAG_YAW_SENSITIVITY = 0.009
export const CAMERA_DRAG_PITCH_SENSITIVITY = 0.016

function clampZoom(zoom: number): number {
  return Math.min(CAMERA_ZOOM_MAX, Math.max(CAMERA_ZOOM_MIN, zoom))
}

export function getWheelZoomTarget(
  currentZoom: number,
  deltaY: number,
  deltaMode: number,
  viewportHeight: number,
): number {
  const deltaScale =
    deltaMode === 1
      ? 16
      : deltaMode === 2
        ? Math.max(320, viewportHeight)
        : 1
  const nextZoom = currentZoom * Math.exp(deltaY * deltaScale * 0.002)
  return clampZoom(nextZoom)
}

export function getPinchZoomTarget(
  currentZoom: number,
  previousDistance: number,
  nextDistance: number,
): number {
  if (
    !Number.isFinite(previousDistance) ||
    !Number.isFinite(nextDistance) ||
    previousDistance <= 0 ||
    nextDistance <= 0
  ) {
    return clampZoom(currentZoom)
  }

  return clampZoom(currentZoom * (previousDistance / nextDistance))
}
