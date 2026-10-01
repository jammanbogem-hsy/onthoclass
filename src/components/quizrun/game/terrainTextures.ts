import { CanvasTexture, Color, SRGBColorSpace } from 'three'
import { createSeededRandom, fbm2D, hashString, smoothstep } from '@/lib/quizrun-engine/terrainArt'

export function hexToRgb(hex: string): [number, number, number] {
  const color = new Color(hex)
  return [
    Math.round(color.r * 255),
    Math.round(color.g * 255),
    Math.round(color.b * 255),
  ]
}

export function createNoiseLayer(
  resolution: number,
  frequency: number,
  seed: number,
  color: string,
  low: number,
  high: number,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = resolution
  canvas.height = resolution
  const context = canvas.getContext('2d')!
  const image = context.createImageData(resolution, resolution)
  const [red, green, blue] = hexToRgb(color)
  for (let y = 0; y < resolution; y += 1) {
    for (let x = 0; x < resolution; x += 1) {
      const offset = (y * resolution + x) * 4
      const alpha = smoothstep(low, high, fbm2D(x * frequency, y * frequency, seed, 3))
      image.data[offset] = red
      image.data[offset + 1] = green
      image.data[offset + 2] = blue
      image.data[offset + 3] = Math.round(alpha * 255)
    }
  }
  context.putImageData(image, 0, 0)
  return canvas
}

/* ------------------------------------------------------------------------ */
/* Ice texture for slick zones                                              */
/* ------------------------------------------------------------------------ */

let iceTextureCache: CanvasTexture | null = null

/**
 * A shared procedural ice sheet: bright frost near the rim, deeper blue in
 * the middle, hairline cracks and trapped bubbles, fading out at the edge.
 */
export function getIceTexture(): CanvasTexture {
  if (iceTextureCache) return iceTextureCache
  const size = 1024
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')!
  const random = createSeededRandom(hashString('ice-sheet'))
  const center = size / 2

  const depth = context.createRadialGradient(center, center, 0, center, center, center)
  depth.addColorStop(0, '#A9D6F2')
  depth.addColorStop(0.55, '#C4E6FA')
  depth.addColorStop(0.85, '#E4F4FF')
  depth.addColorStop(0.95, '#F6FBFF')
  depth.addColorStop(1, 'rgba(246,251,255,0)')
  context.fillStyle = depth
  context.fillRect(0, 0, size, size)

  const frost = createNoiseLayer(128, 0.06, 5, '#FFFFFF', 0.5, 0.85)
  context.globalAlpha = 0.55
  context.drawImage(frost, 0, 0, size, size)
  const deep = createNoiseLayer(128, 0.045, 19, '#7FB5DC', 0.55, 0.85)
  context.globalAlpha = 0.35
  context.drawImage(deep, 0, 0, size, size)

  // Branching hairline cracks.
  context.lineCap = 'round'
  for (let crack = 0; crack < 26; crack += 1) {
    const angle = random() * Math.PI * 2
    const radius = random() * center * 0.8
    let x = center + Math.cos(angle) * radius
    let y = center + Math.sin(angle) * radius
    let heading = random() * Math.PI * 2
    const steps = 10 + Math.floor(random() * 22)
    context.strokeStyle = random() > 0.4 ? '#FFFFFF' : '#E1F2FF'
    context.globalAlpha = 0.45 + random() * 0.45
    context.lineWidth = 0.8 + random() * 1.8
    context.beginPath()
    context.moveTo(x, y)
    for (let step = 0; step < steps; step += 1) {
      heading += (random() - 0.5) * 0.9
      x += Math.cos(heading) * (8 + random() * 14)
      y += Math.sin(heading) * (8 + random() * 14)
      context.lineTo(x, y)
      if (random() > 0.86) {
        const branchHeading = heading + (random() > 0.5 ? 1 : -1) * (0.6 + random() * 0.6)
        context.moveTo(x, y)
        context.lineTo(x + Math.cos(branchHeading) * 30, y + Math.sin(branchHeading) * 30)
        context.moveTo(x, y)
      }
    }
    context.stroke()
  }

  // Trapped air bubbles.
  context.fillStyle = '#FFFFFF'
  for (let bubble = 0; bubble < 420; bubble += 1) {
    const angle = random() * Math.PI * 2
    const radius = Math.sqrt(random()) * center * 0.9
    context.globalAlpha = 0.2 + random() * 0.45
    context.beginPath()
    context.arc(
      center + Math.cos(angle) * radius,
      center + Math.sin(angle) * radius,
      0.8 + random() * 2.6,
      0,
      Math.PI * 2,
    )
    context.fill()
  }

  // Feather the rim so the sheet blends into the painted snow bank.
  context.globalAlpha = 1
  context.globalCompositeOperation = 'destination-in'
  const rim = context.createRadialGradient(center, center, center * 0.82, center, center, center)
  rim.addColorStop(0, 'rgba(0,0,0,1)')
  rim.addColorStop(1, 'rgba(0,0,0,0)')
  context.fillStyle = rim
  context.fillRect(0, 0, size, size)
  context.globalCompositeOperation = 'source-over'

  iceTextureCache = new CanvasTexture(canvas)
  iceTextureCache.colorSpace = SRGBColorSpace
  return iceTextureCache
}
