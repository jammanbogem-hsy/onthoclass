import { useMemo } from 'react'
import type { GameStage, LearningObject } from '@/lib/quizrun-engine/types'
import type { PlayerMapPose } from './GameCanvas'
import { getSizeTier } from '@/lib/quizrun-engine/mechanics'
import { createWorldPhysicsLayout } from '@/lib/quizrun-engine/worldPhysics'
import { MaterialIcon } from './MaterialIcon'

interface GameMiniMapProps {
  stage: GameStage
  collectedIds: string[]
  player: PlayerMapPose
  radarTreasures?: LearningObject[]
}

const TIER_COLORS = ['#2FA47C', '#4169D8', '#E6A800', '#E85D4A']

export function GameMiniMap({
  stage,
  collectedIds,
  player,
  radarTreasures = [],
}: GameMiniMapProps) {
  const layout = useMemo(() => createWorldPhysicsLayout(stage), [stage])
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
        <small>2층·승강기 표시</small>
      </header>
      <svg
        viewBox="0 0 100 100"
        role="img"
        aria-label="수집물과 2층 이동 구조가 표시된 현재 맵"
      >
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
          {stage.objects.map((item) => {
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
      </footer>
    </aside>
  )
}
