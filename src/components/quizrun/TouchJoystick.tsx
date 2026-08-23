import { useRef, useState, type PointerEvent } from 'react'

export interface ControlVector {
  x: number
  z: number
}

interface TouchJoystickProps {
  onChange: (vector: ControlVector) => void
}

const MAX_DISTANCE = 34

export function TouchJoystick({ onChange }: TouchJoystickProps) {
  const areaRef = useRef<HTMLDivElement>(null)
  const [knob, setKnob] = useState({ x: 0, y: 0 })

  const update = (event: PointerEvent<HTMLDivElement>) => {
    const area = areaRef.current
    if (!area) return

    const rect = area.getBoundingClientRect()
    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2
    const rawX = event.clientX - centerX
    const rawY = event.clientY - centerY
    const distance = Math.hypot(rawX, rawY)
    const scale = distance > MAX_DISTANCE ? MAX_DISTANCE / distance : 1
    const x = rawX * scale
    const y = rawY * scale

    setKnob({ x, y })
    onChange({ x: x / MAX_DISTANCE, z: y / MAX_DISTANCE })
  }

  const end = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.releasePointerCapture?.(event.pointerId)
    setKnob({ x: 0, y: 0 })
    onChange({ x: 0, z: 0 })
  }

  return (
    <div
      ref={areaRef}
      className="touch-joystick"
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId)
        update(event)
      }}
      onPointerMove={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) update(event)
      }}
      onPointerUp={end}
      onPointerCancel={end}
      aria-label="화면 이동 조이스틱"
      role="application"
    >
      <span
        className="touch-joystick__knob"
        style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }}
      />
    </div>
  )
}
