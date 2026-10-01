// 달그늘 탐험숲(2맵) 랜드마크 — 어솔 원본은 Vite `?url` import 였다.
// Next 에는 그 문법이 없어 public/quizrun/models/forest/ 경로를 직접 쓴다(data/modelUrls 참고).
import { MODEL_VERSION } from './data/modelUrls'

const BASE = '/quizrun/models/forest/'
const at = (name: string) => `${BASE}${name}.glb?${MODEL_VERSION}`

const treehouseUrl = at('giant-treehouse')
const glowMushroomUrl = at('glow-mushroom-large')
const mushroomClusterUrl = at('glow-mushroom-cluster')
const stoneArchUrl = at('stone-arch-ruin')
const hollowLogUrl = at('hollow-log-tunnel')
const moonAltarUrl = at('moon-altar')
const explorerCampUrl = at('explorer-camp')

export {
  explorerCampUrl,
  glowMushroomUrl,
  hollowLogUrl,
  moonAltarUrl,
  mushroomClusterUrl,
  stoneArchUrl,
  treehouseUrl,
}

export const FOREST_MODEL_URLS: readonly string[] = [
  treehouseUrl,
  glowMushroomUrl,
  mushroomClusterUrl,
  stoneArchUrl,
  hollowLogUrl,
  moonAltarUrl,
  explorerCampUrl,
]
