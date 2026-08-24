import type { StageTheme } from './types'

export interface StageLightingProfile {
  ambientIntensity: number
  directionalIntensity: number
  hemisphereIntensity: number
  directionalColor: string
  hemisphereSkyColor: string
  hemisphereGroundColor: string
  fogNearRatio: number
  fogFarRatio: number
  ballLightIntensity: number
  ballLightDistance: number
  ballGlowOpacity: number
  lightPercent: number
}

function clampProgress(progress: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0))
}

function smoothProgress(progress: number): number {
  const clamped = clampProgress(progress)
  return clamped * clamped * (3 - 2 * clamped)
}

export function getStageLightingProfile(
  theme: StageTheme,
  collectionProgress: number,
): StageLightingProfile {
  if (theme === 'forest-trail') {
    const progress = clampProgress(collectionProgress)
    const eased = smoothProgress(progress)

    return {
      ambientIntensity: 0.24 + eased * 0.62,
      directionalIntensity: 0.34 + eased * 0.92,
      hemisphereIntensity: 0.28 + eased * 0.62,
      directionalColor: '#9EC7E8',
      hemisphereSkyColor: '#7194B7',
      hemisphereGroundColor: '#14241F',
      fogNearRatio: 0.16 + eased * 0.24,
      fogFarRatio: 0.48 + eased * 0.42,
      ballLightIntensity: 14 + eased * 126,
      ballLightDistance: 8 + eased * 23,
      ballGlowOpacity: 0.07 + eased * 0.17,
      lightPercent: Math.round(progress * 100),
    }
  }

  if (theme === 'starlight-river') {
    return {
      ambientIntensity: 1.1,
      directionalIntensity: 1.45,
      hemisphereIntensity: 1.1,
      directionalColor: '#BFD4FF',
      hemisphereSkyColor: '#9BB8FF',
      hemisphereGroundColor: '#263B45',
      fogNearRatio: 0.48,
      fogFarRatio: 1.08,
      ballLightIntensity: 0,
      ballLightDistance: 0,
      ballGlowOpacity: 0,
      lightPercent: 100,
    }
  }

  return {
    ambientIntensity: 1.45,
    directionalIntensity: 2.1,
    hemisphereIntensity: 1.1,
    directionalColor: '#FFF3D0',
    hemisphereSkyColor: '#E6F6FF',
    hemisphereGroundColor: '#77A869',
    fogNearRatio: 0.48,
    fogFarRatio: 1.08,
    ballLightIntensity: 0,
    ballLightDistance: 0,
    ballGlowOpacity: 0,
    lightPercent: 100,
  }
}
