import { useMemo } from 'react'
import type { GameStage, LearningObject } from '@/lib/quizrun-engine/types'
import type { PlayerMapPose } from './GameCanvas'
import { getSizeTier } from '@/lib/quizrun-engine/mechanics'
import { createWorldPhysicsLayout } from '@/lib/quizrun-engine/worldPhysics'
import { MaterialIcon } from './MaterialIcon'

interface GameMiniMapProps {
  stage: GameStage
  objects: LearningObject[]
  collectedIds: string[]
  player: PlayerMapPose
  radarTreasures?: LearningObject[]
}

const TIER_COLORS = ['#2FA47C', '#4169D8', '#E6A800', '#E85D4A']

export function GameMiniMap({
  stage,
  objects,
  collectedIds,
  player,
  radarTreasures = [],
}: GameMiniMapProps) {
  const layout = useMemo(() => createWorldPhysicsLayout(stage), [stage])
  const hasTunnels = layout.tunnels.length > 0
  const hasSlickZones = layout.surfaceZones.some(
    (zone) => zone.kind === 'slick',
  )
  const collectedSet = useMemo(
    () => new Set(collectedIds),
    [collectedIds],
  )
  const toMapX = (x: number) => (x / stage.mapSize + 0.5) * 100
  const toMapY = (z: number) => (z / stage.mapSize + 0.5) * 100
  const toMapSize = (size: number) => (size / stage.mapSize) * 100
  const playerRotation =
    Math.atan2(player.headingX, -player.headingZ) * (180 / Math.PI)

  return (
    <aside
      className={`game-minimap is-${stage.theme}`}
      aria-label={`${stage.title} 미니맵. 현재 위치 가로 ${Math.round(player.x)}, 세로 ${Math.round(player.z)}`}
    >
      <header>
        <span>
          <MaterialIcon name="map" />
          미니맵
        </span>
        <small>
          {hasTunnels
            ? '2층·승강기·터널 표시'
            : hasSlickZones
              ? '빙판 약 60%·승강기'
              : '2층·승강기 표시'}
        </small>
      </header>
      <svg
        viewBox="0 0 100 100"
        role="img"
        aria-label={
          hasTunnels
            ? '수집물과 2층 이동 구조, 터널이 표시된 현재 맵'
            : hasSlickZones
              ? '수집물과 2층 이동 구조, 빙판길이 표시된 현재 맵'
              : '수집물과 2층 이동 구조가 표시된 현재 맵'
        }
      >
        <defs>
          <pattern
            id="minimap-ice-hatch"
            width="4"
            height="4"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(18)"
          >
            <rect width="4" height="4" fill="#CDEEFF" />
            <path d="M 0 0 V 4" stroke="#FFFFFF" strokeWidth="0.85" />
          </pattern>
        </defs>
        <rect className="minimap-ground" x="1" y="1" width="98" height="98" rx="12" />
        <g className="minimap-surfaces">
          {layout.surfaceZones.map((zone) => (
            <ellipse
              key={zone.id}
              className={`is-${zone.kind}`}
              cx={toMapX(zone.x)}
              cy={toMapY(zone.z)}
              rx={toMapSize(zone.halfWidth)}
              ry={toMapSize(zone.halfDepth)}
              transform={`rotate(${zone.rotationY * (180 / Math.PI)} ${toMapX(zone.x)} ${toMapY(zone.z)})`}
            />
          ))}
        </g>
        <g className="minimap-tunnels">
          {layout.tunnels.map((tunnel) => (
            <rect
              key={tunnel.id}
              x={
                toMapX(tunnel.x) -
                toMapSize(tunnel.halfWidth + tunnel.wallThickness)
              }
              y={toMapY(tunnel.z) - toMapSize(tunnel.halfDepth)}
              width={toMapSize((tunnel.halfWidth + tunnel.wallThickness) * 2)}
              height={toMapSize(tunnel.halfDepth * 2)}
              rx="1.2"
              transform={`rotate(${tunnel.rotationY * (180 / Math.PI)} ${toMapX(tunnel.x)} ${toMapY(tunnel.z)})`}
            />
          ))}
        </g>
        <g className="minimap-routes">
          {layout.speedZones.map((zone) => (
            <rect
              key={zone.id}
              x={toMapX(zone.x) - toMapSize(zone.halfWidth)}
              y={toMapY(zone.z) - toMapSize(zone.halfDepth)}
              width={toMapSize(zone.halfWidth * 2)}
              height={toMapSize(zone.halfDepth * 2)}
              rx="1"
              transform={`rotate(${zone.rotationY * (180 / Math.PI)} ${toMapX(zone.x)} ${toMapY(zone.z)})`}
            />
          ))}
        </g>
        <g className="minimap-ridges">
          {layout.rideableObstacles
            .filter((obstacle) => obstacle.id.startsWith('forest-ridge-'))
            .map((obstacle) => (
              <rect
                key={obstacle.id}
                x={toMapX(obstacle.x) - toMapSize(obstacle.halfWidth)}
                y={toMapY(obstacle.z) - toMapSize(obstacle.halfDepth)}
                width={toMapSize(obstacle.halfWidth * 2)}
                height={Math.max(0.8, toMapSize(obstacle.halfDepth * 2))}
                rx="0.45"
                transform={`rotate(${obstacle.rotationY * (180 / Math.PI)} ${toMapX(obstacle.x)} ${toMapY(obstacle.z)})`}
              />
            ))}
        </g>
        <g className="minimap-upper-levels">
          {layout.elevatedPlatforms.map((platform) => (
            <rect
              key={platform.id}
              x={toMapX(platform.x) - toMapSize(platform.halfWidth)}
              y={toMapY(platform.z) - toMapSize(platform.halfDepth)}
              width={toMapSize(platform.halfWidth * 2)}
              height={toMapSize(platform.halfDepth * 2)}
              rx="1.6"
            />
          ))}
          {layout.terrainRamps.map((ramp) => {
            const directionX = Math.sin(ramp.rotationY)
            const directionZ = Math.cos(ramp.rotationY)
            return (
              <line
                key={ramp.id}
                x1={toMapX(ramp.x - directionX * ramp.halfDepth)}
                y1={toMapY(ramp.z - directionZ * ramp.halfDepth)}
                x2={toMapX(ramp.x + directionX * ramp.halfDepth)}
                y2={toMapY(ramp.z + directionZ * ramp.halfDepth)}
              />
            )
          })}
          {layout.elevators.map((elevator) => (
            <g
              key={elevator.id}
              transform={`translate(${toMapX(elevator.x)} ${toMapY(elevator.z)})`}
            >
              <circle r="2.2" />
              <path d="M 0 -1.25 L 1.25 0.25 H 0.5 V 1.35 H -0.5 V 0.25 H -1.25 Z" />
            </g>
          ))}
        </g>
        <g className="minimap-items">
          {objects.map((item) => {
            if (collectedSet.has(item.id)) return null
            const tier = getSizeTier(item.size)
            return (
              <circle
                key={item.id}
                cx={toMapX(item.position[0])}
                cy={toMapY(item.position[2])}
                r={item.position[1] > 0.2 ? 1.35 : 1}
                fill={TIER_COLORS[tier.level - 1]}
                className={item.position[1] > 0.2 ? 'is-elevated' : undefined}
              />
            )
          })}
        </g>
        {radarTreasures.length > 0 && (
          <g className="minimap-treasures">
            {radarTreasures.map((treasure) => (
              <g
                key={treasure.id}
                transform={`translate(${toMapX(treasure.position[0])} ${toMapY(treasure.position[2])})`}
              >
                <circle r="3.1" />
                <path d="M 0 -2.1 L 2 0 L 0 2.1 L -2 0 Z" />
              </g>
            ))}
          </g>
        )}
        <g
          className="minimap-player"
          transform={`translate(${toMapX(player.x)} ${toMapY(player.z)}) rotate(${playerRotation})`}
        >
          <circle r="3.5" />
          <path d="M 0 -3.4 L 2.5 2.4 L 0 1.4 L -2.5 2.4 Z" />
        </g>
      </svg>
      <footer>
        <i className="is-upper" />
        2층
        <i className="is-elevator" />
        승강기
        {hasTunnels && (
          <>
            <i className="is-tunnel" />
            터널
          </>
        )}
        {hasSlickZones && (
          <>
            <i className="is-slick" />
            빙판
          </>
        )}
      </footer>
    </aside>
  )
}
