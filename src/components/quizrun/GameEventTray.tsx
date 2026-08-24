import type { CSSProperties } from 'react'
import {
  POWER_UP_CONFIG,
  POWER_UP_ORDER,
  type ActivePowerUps,
  type PowerUpKind,
} from '@/lib/quizrun-engine/powerUps'
import {
  MaterialIcon,
  type MaterialIconName,
} from './MaterialIcon'

const EVENT_CONTENT: Record<
  PowerUpKind,
  {
    icon: MaterialIconName
    description: string
  }
> = {
  radar: {
    icon: 'radar',
    description: '숨은 보물 표시',
  },
  magnet: {
    icon: 'battery_charging_full',
    description: '가까운 물건 당기기',
  },
  speed: {
    icon: 'steps',
    description: '구르기 속도 50% 상승',
  },
}

interface GameEventTrayProps {
  activePowerUps: ActivePowerUps
  radarTreasureCount: number
}

export function GameEventTray({
  activePowerUps,
  radarTreasureCount,
}: GameEventTrayProps) {
  const activeKinds = POWER_UP_ORDER.filter(
    (kind) => activePowerUps[kind] > 0,
  )
  if (activeKinds.length === 0) return null

  return (
    <section
      className="game-event-tray"
      aria-label="발동 중인 이벤트 효과"
    >
      {activeKinds.map((kind) => {
        const config = POWER_UP_CONFIG[kind]
        const remainingMs = activePowerUps[kind]
        const remainingSeconds = Math.max(1, Math.ceil(remainingMs / 1000))
        const description =
          kind === 'radar'
            ? `숨은 보물 ${radarTreasureCount}개`
            : EVENT_CONTENT[kind].description

        return (
          <div
            key={kind}
            className={`game-event-chip is-${kind} ${
              remainingMs <= 3000 ? 'is-ending' : ''
            }`}
            role="timer"
            aria-label={`${config.label}, ${description}, ${remainingSeconds}초 남음`}
            style={
              {
                '--event-progress': Math.min(
                  1,
                  remainingMs / config.durationMs,
                ),
              } as CSSProperties
            }
          >
            <span className="game-event-chip__icon">
              <MaterialIcon name={EVENT_CONTENT[kind].icon} />
            </span>
            <span className="game-event-chip__copy">
              <strong>{config.label}</strong>
              <small>{description}</small>
            </span>
            <strong className="game-event-chip__time" aria-hidden="true">
              {remainingSeconds}초
            </strong>
            <i className="game-event-chip__timer" aria-hidden="true" />
          </div>
        )
      })}
    </section>
  )
}
