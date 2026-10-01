import { Clone, useAnimations, useGLTF } from '@react-three/drei'
import { useEffect, useLayoutEffect, useMemo } from 'react'
import { useThree } from '@react-three/fiber'
import {
  AnimationMixer,
  Group,
  Material,
  Mesh,
  Object3D,
  Quaternion,
  Texture,
  Vector3,
} from 'three'
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js'
import type {
  AttachmentNormal,
  LearningObject,
  StageTheme,
} from '@/lib/quizrun-engine/types'
import {
  getAttachedObjectVisualScale,
  isArchitectureCollectible,
} from '@/lib/quizrun-engine/collectibleScale'
import { getSizeTier } from '@/lib/quizrun-engine/mechanics'
import { getAssetBackedLevelUpModelId } from '@/lib/quizrun-engine/levelUpAssets'
import { getTreasureModel, TREASURE_MODEL_URLS } from '@/lib/quizrun-engine/treasureModels'
import {
  getStructuredCollectibleAsset,
  STRUCTURED_COLLECTIBLE_ASSETS,
} from '@/lib/quizrun-engine/structuredCollectibleAssets'
import {
  getLevelOneAssetVariant,
  type LevelOneAssetVariant,
} from '@/lib/quizrun-engine/levelOneAssets'
import {
  getTreeAssetVariation,
  type TreeAssetVariant,
} from '@/lib/quizrun-engine/treeAssets'
import type {
  MudAssetVariant,
  NaturalBlockAssetVariant,
  SurfaceZone,
  WorldObstacle,
} from '@/lib/quizrun-engine/worldPhysics'
import {
  athleteRunningShoeUrl,
  benchChairUrl,
  beraIceCreamUrl,
  candyLegoUrl,
  carUrl,
  catDollUrl,
  catUrl,
  drinkVendingMachineUrl,
  energyDrinkUrl,
  fallenLogAObstacleUrl,
  fallenLogBObstacleUrl,
  greenLegoUrl,
  inlineSkatesUrl,
  jumpingWaterBottleUrl,
  level2DigitalWatchUrl,
  level2HeadsetUrl,
  level2NoteUrl,
  level2RunningShoeUrl,
  lotteTowerUrl,
  lowPolyTreeAUrl,
  lowPolyTreeBUrl,
  lowPolyTreeCUrl,
  luxuryCar2Url,
  luxuryCarUrl,
  mudAObstacleUrl,
  mudBObstacleUrl,
  noiseCancelingHeadsetUrl,
  orangeJuiceUrl,
  phantomKeyringUrl,
  raccoonUrl,
  redLegoUrl,
  runningMedalUrl,
  runningSunglassesUrl,
  runningVestUrl,
  shibaInuUrl,
  shimmeringRunningBagUrl,
  sodaCoolerUrl,
  stopwatchModelUrl,
  taekwondoUniformUrl,
  treeRootObstacleUrl,
  waterBottleUrl,
  yellowLegoUrl,
} from '@/lib/quizrun-engine/data/modelUrls'

export interface LearningObjectMeshProps {
  item: LearningObject
  detail?: 'world' | 'attached'
}

export interface AttachedObjectMeshProps {
  item: LearningObject
  index: number
  orbRadius: number
  slotCount?: number
  attachmentNormal?: AttachmentNormal
}

export interface GardenSetDressingProps {
  floorSize?: number
  receiveShadow?: boolean
  theme?: StageTheme
  treeObstacles?: readonly Pick<WorldObstacle, 'id' | 'x' | 'z'>[]
}

export interface NaturalObstacleModelsProps {
  obstacles: readonly WorldObstacle[]
  surfaceZones: readonly SurfaceZone[]
  castShadow?: boolean
}

type VectorTuple = [number, number, number]

const PAPER = '#FFFDF7'
const INK = '#273548'
const WOOD = '#A96F45'
const GOLD = '#F8C84A'
const CAT_MODEL_FLOOR_OFFSET = -0.499
const WORLD_COLLECTIBLE_OFFSET = -0.58
const PALETTE = ['#FF6B6B', '#38BDF8', '#FBBF24', '#2DD4BF', '#A78BFA']
const LEVEL_ONE_ASSET_URLS: Record<LevelOneAssetVariant, string> = {
  'red-lego': redLegoUrl,
  'green-lego': greenLegoUrl,
  'yellow-lego': yellowLegoUrl,
  water: waterBottleUrl,
  candy: candyLegoUrl,
  'orange-juice': orangeJuiceUrl,
  'phantom-keyring': phantomKeyringUrl,
}
const TREE_ASSET_URLS: Record<TreeAssetVariant, string> = {
  'low-poly-tree-a': lowPolyTreeAUrl,
  'low-poly-tree-b': lowPolyTreeBUrl,
  'low-poly-tree-c': lowPolyTreeCUrl,
}
const NATURAL_BLOCK_ASSET_URLS: Record<
  NaturalBlockAssetVariant,
  string
> = {
  'tree-root': treeRootObstacleUrl,
  'fallen-log-a': fallenLogAObstacleUrl,
  'fallen-log-b': fallenLogBObstacleUrl,
}
const MUD_ASSET_URLS: Record<MudAssetVariant, string> = {
  'mud-a': mudAObstacleUrl,
  'mud-b': mudBObstacleUrl,
}
const SCENERY_THEMES = {
  'sunny-plaza': {
    ground: '#D9F1D3',
    track: '#EBD8B2',
    trail: '#F4E5C7',
    plaza: '#BFE6DA',
    trunk: '#8C5B3C',
    leaves: ['#327D50', '#3F995B', '#52A963', '#63B967'],
    markers: PALETTE,
  },
  'forest-trail': {
    ground: '#1D3029',
    track: '#394740',
    trail: '#465046',
    plaza: '#263D37',
    trunk: '#2B2425',
    leaves: ['#173128', '#204234', '#29533C', '#315E43'],
    markers: ['#FFD35A', '#FF8A65', '#66C7FF', '#B7E56D', '#F28AB2'],
  },
  'starlight-river': {
    ground: '#526B73',
    track: '#7D75A9',
    trail: '#A99EC8',
    plaza: '#5A7F91',
    trunk: '#46505D',
    leaves: ['#31546B', '#3C6477', '#4D7181', '#5B8191'],
    markers: ['#60A5FA', '#A78BFA', '#FBBF24', '#2DD4BF', '#FB7185'],
  },
} as const
const UP = new Vector3(0, 1, 0)
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))

function Paint({
  color,
  roughness = 0.74,
}: {
  color: string
  roughness?: number
}) {
  return (
    <meshStandardMaterial
      color={color}
      roughness={roughness}
      metalness={0.015}
    />
  )
}

function BoxPart({
  color,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = [1, 1, 1],
  shadow = true,
}: {
  color: string
  position?: VectorTuple
  rotation?: VectorTuple
  scale?: VectorTuple
  shadow?: boolean
}) {
  return (
    <mesh
      castShadow={shadow}
      position={position}
      rotation={rotation}
      scale={scale}
    >
      <boxGeometry />
      <Paint color={color} />
    </mesh>
  )
}

function RunnerLace({ color }: { color: string }) {
  return (
    <group rotation={[Math.PI / 2, 0, 0.18]}>
      <mesh position={[-0.18, 0, 0]}>
        <torusGeometry args={[0.33, 0.055, 6, 18, Math.PI * 1.6]} />
        <Paint color={color} roughness={0.55} />
      </mesh>
      <mesh position={[0.18, 0.04, 0]} rotation={[0, 0, Math.PI]}>
        <torusGeometry args={[0.33, 0.055, 6, 18, Math.PI * 1.6]} />
        <Paint color={color} roughness={0.55} />
      </mesh>
      {[-0.5, 0.5].map((x) => (
        <BoxPart
          key={x}
          color={PAPER}
          position={[x, -0.06, 0]}
          scale={[0.16, 0.08, 0.08]}
        />
      ))}
    </group>
  )
}

function Badge({
  color,
  medal = false,
}: {
  color: string
  medal?: boolean
}) {
  return (
    <group>
      {medal && (
        <>
          <BoxPart
            color="#4D96FF"
            position={[-0.17, 0.42, 0]}
            rotation={[0, 0, -0.26]}
            scale={[0.22, 0.64, 0.09]}
          />
          <BoxPart
            color="#FF6B6B"
            position={[0.17, 0.42, 0]}
            rotation={[0, 0, 0.26]}
            scale={[0.22, 0.64, 0.09]}
          />
        </>
      )}
      <mesh castShadow rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[medal ? 0.48 : 0.42, 0.48, 0.18, 10]} />
        <Paint color={color} roughness={0.52} />
      </mesh>
      <mesh position={[0, 0, 0.12]} rotation={[0, 0, Math.PI / 4]}>
        <octahedronGeometry args={[medal ? 0.24 : 0.2, 0]} />
        <Paint color={PAPER} />
      </mesh>
    </group>
  )
}

function Gem({
  color,
  scale = 1,
}: {
  color: string
  scale?: number
}) {
  return (
    <mesh castShadow scale={scale} rotation={[0.08, 0.2, -0.06]}>
      <octahedronGeometry args={[0.52, 0]} />
      <Paint color={color} roughness={0.28} />
    </mesh>
  )
}

function Wristband({ color }: { color: string }) {
  return (
    <group rotation={[Math.PI / 2, 0.12, 0]}>
      <mesh castShadow>
        <torusGeometry args={[0.42, 0.13, 7, 20]} />
        <Paint color={color} roughness={0.58} />
      </mesh>
      <BoxPart color={PAPER} position={[0, 0.42, 0]} scale={[0.2, 0.1, 0.08]} />
    </group>
  )
}

function KeyCharm({ color }: { color: string }) {
  return (
    <group rotation={[0, 0, -0.45]}>
      <mesh castShadow position={[0, 0.3, 0]}>
        <torusGeometry args={[0.24, 0.09, 7, 18]} />
        <Paint color={color} roughness={0.4} />
      </mesh>
      <BoxPart color={color} position={[0, -0.12, 0]} scale={[0.12, 0.62, 0.12]} />
      <BoxPart
        color={color}
        position={[0.16, -0.36, 0]}
        scale={[0.3, 0.12, 0.12]}
      />
      <BoxPart
        color={color}
        position={[0.11, -0.2, 0]}
        scale={[0.22, 0.1, 0.12]}
      />
    </group>
  )
}

function DrinkCan({
  color,
  compact = false,
}: {
  color: string
  compact?: boolean
}) {
  return (
    <group>
      <mesh castShadow>
        <cylinderGeometry args={[0.35, 0.35, 0.9, 12]} />
        <Paint color={color} roughness={0.46} />
      </mesh>
      <mesh position={[0, 0.47, 0]}>
        <cylinderGeometry args={[0.33, 0.33, 0.06, 12]} />
        <Paint color="#D5DEE8" roughness={0.32} />
      </mesh>
      {!compact && (
        <mesh position={[0.08, 0.51, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.08, 0.025, 5, 12]} />
          <Paint color={INK} />
        </mesh>
      )}
      <BoxPart
        color={PAPER}
        position={[0, 0, 0.36]}
        rotation={[0, 0, -0.18]}
        scale={[0.18, 0.42, 0.04]}
      />
    </group>
  )
}

function WaterBottle({
  color,
  compact = false,
}: {
  color: string
  compact?: boolean
}) {
  return (
    <group>
      <mesh castShadow position={[0, -0.08, 0]}>
        <cylinderGeometry args={[0.32, 0.4, 0.92, 10]} />
        <meshStandardMaterial
          color={color}
          roughness={0.35}
          metalness={0.01}
          transparent
          opacity={0.9}
        />
      </mesh>
      <mesh castShadow position={[0, 0.49, 0]}>
        <cylinderGeometry args={[0.2, 0.23, 0.22, 10]} />
        <Paint color={INK} roughness={0.48} />
      </mesh>
      {!compact && (
        <mesh position={[0.24, 0.45, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.18, 0.045, 6, 14, Math.PI * 1.45]} />
          <Paint color={INK} />
        </mesh>
      )}
    </group>
  )
}

function RunningCap({
  color,
  pin = false,
}: {
  color: string
  pin?: boolean
}) {
  if (pin) return <Badge color={color} />

  return (
    <group position={[0, -0.2, 0]}>
      <mesh castShadow>
        <sphereGeometry
          args={[0.54, 12, 7, 0, Math.PI * 2, 0, Math.PI / 2]}
        />
        <Paint color={color} />
      </mesh>
      <BoxPart
        color={color}
        position={[0, 0.02, 0.42]}
        scale={[0.62, 0.08, 0.46]}
      />
      <BoxPart color={PAPER} position={[0, 0.2, 0.5]} scale={[0.2, 0.08, 0.05]} />
    </group>
  )
}

function Wristwatch({ color }: { color: string }) {
  return (
    <group>
      <BoxPart color={color} scale={[0.34, 1.25, 0.12]} />
      <mesh castShadow position={[0, 0, 0.12]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.4, 0.4, 0.2, 12]} />
        <Paint color={INK} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0, 0.24]}>
        <circleGeometry args={[0.3, 14]} />
        <Paint color={PAPER} />
      </mesh>
      <BoxPart
        color={color}
        position={[0.08, 0.06, 0.28]}
        rotation={[0, 0, -0.5]}
        scale={[0.2, 0.045, 0.035]}
      />
    </group>
  )
}

function Headphones({
  color,
  giant = false,
}: {
  color: string
  giant?: boolean
}) {
  const size = giant ? 1.2 : 1
  return (
    <group scale={size}>
      <mesh rotation={[0, 0, -Math.PI * 0.12]}>
        <torusGeometry args={[0.5, 0.09, 7, 22, Math.PI * 1.25]} />
        <Paint color={color} />
      </mesh>
      {[-0.49, 0.49].map((x) => (
        <group key={x} position={[x, -0.2, 0]}>
          <BoxPart color={INK} scale={[0.2, 0.44, 0.27]} />
          <BoxPart color={color} position={[0, 0, 0.18]} scale={[0.15, 0.34, 0.13]} />
        </group>
      ))}
    </group>
  )
}

function GiftBox({
  color,
  large = false,
}: {
  color: string
  large?: boolean
}) {
  const width = large ? 1.25 : 0.9
  return (
    <group>
      <BoxPart
        color={color}
        position={[0, -0.12, 0]}
        scale={[width, large ? 0.72 : 0.62, large ? 0.9 : 0.72]}
      />
      <BoxPart
        color={PAPER}
        position={[0, 0.25, 0]}
        scale={[width + 0.08, 0.16, large ? 0.98 : 0.8]}
      />
      <BoxPart
        color={GOLD}
        position={[0, 0.02, 0.42]}
        scale={[0.16, 0.8, 0.05]}
      />
    </group>
  )
}

function RunningShoe({
  color,
  compact = false,
}: {
  color: string
  compact?: boolean
}) {
  const laceRows = compact
    ? [{ x: 0.02, y: 0.2 }]
    : [
        { x: -0.14, y: 0.23 },
        { x: 0.04, y: 0.19 },
        { x: 0.22, y: 0.13 },
      ]

  return (
    <group rotation={[0, -0.14, 0]}>
      {/* Dark rubber outsole: a flattened capsule keeps the footprint rounded. */}
      <mesh
        castShadow
        receiveShadow
        position={[0.04, -0.38, 0]}
        rotation={[0, 0, Math.PI / 2]}
        scale={[0.3, 1, 0.96]}
      >
        <capsuleGeometry args={[0.3, 0.68, 5, 18]} />
        <Paint color={INK} roughness={0.88} />
      </mesh>

      {/* The light midsole separates the upper from the ground at every scale. */}
      <mesh
        castShadow
        receiveShadow
        position={[0.04, -0.29, 0]}
        rotation={[0, 0, Math.PI / 2]}
        scale={[0.42, 1, 1]}
      >
        <capsuleGeometry args={[0.3, 0.69, 5, 18]} />
        <Paint color={PAPER} roughness={0.76} />
      </mesh>

      {/* Layered textile upper: heel quarter, forefoot and toe cap. */}
      <mesh
        castShadow
        receiveShadow
        position={[-0.3, -0.01, 0]}
        rotation={[0, 0, Math.PI / 2 - 0.08]}
        scale={[0.78, 0.62, 0.98]}
      >
        <capsuleGeometry args={[0.31, 0.45, 5, 18]} />
        <Paint color={color} roughness={0.62} />
      </mesh>
      <mesh
        castShadow
        receiveShadow
        position={[0.27, -0.1, 0]}
        scale={[0.54, 0.25, 0.45]}
      >
        <sphereGeometry args={[1, 18, 10]} />
        <Paint color={color} roughness={0.58} />
      </mesh>
      <mesh
        castShadow
        position={[0.59, -0.18, 0]}
        scale={[0.25, 0.16, 0.43]}
      >
        <sphereGeometry args={[1, 16, 8]} />
        <Paint color={PAPER} roughness={0.72} />
      </mesh>

      {/* Padded heel collar and a fabric tongue make the shoe readable in profile. */}
      <mesh
        castShadow
        position={[-0.43, 0.27, 0]}
        rotation={[Math.PI / 2, 0, 0]}
        scale={[1.18, 0.82, 0.78]}
      >
        <torusGeometry args={[0.22, 0.075, 7, 22]} />
        <Paint color={INK} roughness={0.82} />
      </mesh>
      <BoxPart
        color={INK}
        position={[-0.08, 0.24, 0]}
        rotation={[0, 0, -0.3]}
        scale={[0.43, 0.48, 0.36]}
      />
      <BoxPart
        color={color}
        position={[-0.04, 0.28, 0]}
        rotation={[0, 0, -0.3]}
        scale={[0.34, 0.42, 0.38]}
      />

      {/* Contrasting side chevrons stay visible from either camera side. */}
      {[-1, 1].flatMap((side) => [
        <BoxPart
          key={`stripe-a-${side}`}
          color={PAPER}
          position={[0.03, -0.01, side * 0.42]}
          rotation={[0, 0, -0.32]}
          scale={[0.43, 0.085, 0.035]}
          shadow={false}
        />,
        <BoxPart
          key={`stripe-b-${side}`}
          color={PAPER}
          position={[0.3, -0.06, side * 0.4]}
          rotation={[0, 0, 0.24]}
          scale={[0.28, 0.075, 0.035]}
          shadow={false}
        />,
      ])}

      {/* Cross-laced bars sit above the tongue instead of being painted on. */}
      {laceRows.flatMap(({ x, y }) => [
        <BoxPart
          key={`lace-left-${x}`}
          color={PAPER}
          position={[x, y, 0]}
          rotation={[0, 0.19, -0.08]}
          scale={[0.045, 0.035, 0.58]}
          shadow={false}
        />,
        <BoxPart
          key={`lace-right-${x}`}
          color={PAPER}
          position={[x, y + 0.006, 0]}
          rotation={[0, -0.19, -0.08]}
          scale={[0.045, 0.035, 0.58]}
          shadow={false}
        />,
        ...(!compact
          ? [
              <mesh
                key={`eyelet-left-${x}`}
                position={[x - 0.055, y, 0.3]}
                rotation={[Math.PI / 2, 0, 0]}
              >
                <torusGeometry args={[0.035, 0.012, 5, 10]} />
                <Paint color={GOLD} roughness={0.42} />
              </mesh>,
              <mesh
                key={`eyelet-right-${x}`}
                position={[x - 0.055, y, -0.3]}
                rotation={[Math.PI / 2, 0, 0]}
              >
                <torusGeometry args={[0.035, 0.012, 5, 10]} />
                <Paint color={GOLD} roughness={0.42} />
              </mesh>,
            ]
          : []),
      ])}

      {!compact && (
        <>
          {/* Tread blocks catch light during rolling and sell the rubber sole. */}
          {[-0.42, -0.14, 0.14, 0.42].map((x) => (
            <BoxPart
              key={`tread-${x}`}
              color={INK}
              position={[x, -0.49, 0]}
              scale={[0.17, 0.045, 0.45]}
            />
          ))}
          {/* Small toe vents and a rear pull loop add close-up detail. */}
          {[-0.16, 0, 0.16].map((z) => (
            <mesh
              key={`vent-${z}`}
              position={[0.4, 0.02, z]}
              scale={[0.022, 0.022, 0.022]}
            >
              <sphereGeometry args={[1, 7, 5]} />
              <Paint color={INK} roughness={0.9} />
            </mesh>
          ))}
          <mesh
            castShadow
            position={[-0.62, 0.39, 0]}
            scale={[0.55, 0.92, 0.55]}
          >
            <torusGeometry args={[0.12, 0.025, 6, 14]} />
            <Paint color={color} roughness={0.72} />
          </mesh>
          <BoxPart
            color={color}
            position={[-0.62, 0.28, 0]}
            scale={[0.07, 0.25, 0.08]}
          />
        </>
      )}

      {/* A slim heel counter prevents the rounded layers from reading as a toy. */}
      <BoxPart
        color={INK}
        position={[-0.59, 0.02, 0]}
        rotation={[0, 0, -0.07]}
        scale={[0.1, 0.43, 0.43]}
      />
      {!compact && (
        <BoxPart
          color={PAPER}
          position={[-0.645, 0.01, 0]}
          rotation={[0, 0, -0.07]}
          scale={[0.025, 0.16, 0.45]}
          shadow={false}
        />
      )}
    </group>
  )
}

function PlayBall({ color }: { color: string }) {
  return (
    <group>
      <mesh castShadow>
        <icosahedronGeometry args={[0.58, 2]} />
        <Paint color={color} roughness={0.48} />
      </mesh>
      {[0, Math.PI / 2].map((rotation) => (
        <mesh key={rotation} rotation={[rotation, 0, Math.PI / 4]}>
          <torusGeometry args={[0.55, 0.035, 5, 24]} />
          <Paint color={PAPER} />
        </mesh>
      ))}
    </group>
  )
}

function Skateboard({ color }: { color: string }) {
  return (
    <group rotation={[0.08, 0.12, -0.04]}>
      <BoxPart color={color} scale={[1.28, 0.14, 0.48]} />
      {[-0.42, 0.42].flatMap((x) =>
        [-0.28, 0.28].map((z) => (
          <mesh
            key={`${x}-${z}`}
            castShadow
            position={[x, -0.2, z]}
            rotation={[Math.PI / 2, 0, 0]}
          >
            <cylinderGeometry args={[0.12, 0.12, 0.12, 8]} />
            <Paint color={INK} />
          </mesh>
        )),
      )}
      <BoxPart color={PAPER} position={[0, 0.1, 0]} scale={[0.28, 0.03, 0.28]} />
    </group>
  )
}

function GemCluster({ color }: { color: string }) {
  return (
    <group>
      <group position={[0, 0.15, 0]} scale={1.05}>
        <Gem color={color} />
      </group>
      <group position={[-0.4, -0.18, 0.12]} scale={0.7}>
        <Gem color="#38BDF8" />
      </group>
      <group position={[0.42, -0.16, 0.05]} scale={0.76}>
        <Gem color="#F472B6" />
      </group>
    </group>
  )
}

function TreasureBox({
  color,
  large = false,
  compact = false,
}: {
  color: string
  large?: boolean
  compact?: boolean
}) {
  const width = large ? 1.25 : 1
  return (
    <group>
      <BoxPart
        color={color}
        position={[0, -0.22, 0]}
        scale={[width, large ? 0.72 : 0.58, large ? 0.88 : 0.72]}
      />
      <mesh
        castShadow
        position={[0, large ? 0.32 : 0.24, 0]}
        rotation={[0, 0, Math.PI / 2]}
        scale={[large ? 0.48 : 0.4, width, large ? 0.88 : 0.72]}
      >
        <cylinderGeometry
          args={[0.5, 0.5, 1, compact ? 6 : 10, 1, false, 0, Math.PI]}
        />
        <Paint color={color} />
      </mesh>
      <BoxPart
        color={GOLD}
        position={[0, -0.05, large ? 0.47 : 0.39]}
        scale={[0.18, 0.72, 0.06]}
      />
      <BoxPart
        color={INK}
        position={[0, -0.03, large ? 0.52 : 0.44]}
        scale={[0.12, 0.18, 0.04]}
      />
    </group>
  )
}

function Trophy({ color }: { color: string }) {
  return (
    <group>
      <mesh castShadow position={[0, 0.2, 0]}>
        <cylinderGeometry args={[0.34, 0.52, 0.72, 12]} />
        <Paint color={color} roughness={0.38} />
      </mesh>
      {[-0.48, 0.48].map((x) => (
        <mesh key={x} position={[x, 0.3, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.28, 0.07, 6, 16, Math.PI]} />
          <Paint color={color} roughness={0.38} />
        </mesh>
      ))}
      <BoxPart color={color} position={[0, -0.3, 0]} scale={[0.16, 0.45, 0.16]} />
      <BoxPart color={INK} position={[0, -0.55, 0]} scale={[0.72, 0.16, 0.5]} />
    </group>
  )
}

function FinishGate({ color }: { color: string }) {
  return (
    <group>
      {[-0.62, 0.62].map((x, index) => (
        <group key={x}>
          <BoxPart
            color={index ? '#38BDF8' : '#FF6B6B'}
            position={[x, -0.05, 0]}
            scale={[0.18, 1.35, 0.18]}
          />
          <BoxPart
            color={PAPER}
            position={[x, -0.05, 0.1]}
            scale={[0.2, 0.14, 0.04]}
          />
        </group>
      ))}
      <BoxPart color={color} position={[0, 0.62, 0]} scale={[1.4, 0.34, 0.2]} />
      <BoxPart color={GOLD} position={[0, 0.62, 0.14]} scale={[0.34, 0.2, 0.05]} />
    </group>
  )
}

function DrinkCrate({
  color,
  compact = false,
}: {
  color: string
  compact?: boolean
}) {
  const cans = compact ? 2 : 6
  return (
    <group>
      <BoxPart color={color} position={[0, -0.2, 0]} scale={[1.2, 0.62, 0.92]} />
      <BoxPart color={INK} position={[0, 0.1, 0.5]} scale={[0.84, 0.22, 0.05]} />
      {Array.from({ length: cans }, (_, index) => (
        <group
          key={index}
          position={[
            -0.36 + (index % 3) * 0.36,
            0.25,
            index > 2 ? -0.2 : 0.2,
          ]}
          scale={0.38}
        >
          <DrinkCan color={PALETTE[index % PALETTE.length]} compact />
        </group>
      ))}
    </group>
  )
}

function CrewKiosk({
  color,
  compact = false,
}: {
  color: string
  compact?: boolean
}) {
  return (
    <group>
      <BoxPart color={color} position={[0, -0.15, 0]} scale={[1.3, 1.12, 0.82]} />
      <BoxPart
        color={PAPER}
        position={[0, 0.1, 0.44]}
        scale={[0.86, 0.54, 0.08]}
      />
      <BoxPart color="#FF6B6B" position={[0, 0.65, 0.45]} scale={[1.48, 0.2, 0.18]} />
      {!compact && (
        <group position={[0, 0.1, 0.56]} scale={0.48}>
          <WaterBottle color="#38BDF8" compact />
        </group>
      )}
      <BoxPart color={WOOD} position={[0, -0.64, 0.36]} scale={[1.46, 0.18, 0.32]} />
    </group>
  )
}

function FallbackShape({ item }: { item: LearningObject }) {
  if (item.shape === 'sphere') return <Gem color={item.color} />
  if (item.shape === 'torus') return <Wristband color={item.color} />
  if (item.shape === 'cylinder') return <DrinkCan color={item.color} />
  return <GiftBox color={item.color} />
}

function ImportedCollectibleMesh({
  url,
  detail,
  modelScale = 1,
  castShadow = true,
}: {
  url: string
  detail: 'world' | 'attached'
  modelScale?: number
  castShadow?: boolean
}) {
  const { scene } = useGLTF(url)
  const model = useMemo(() => scene.clone(true), [scene])

  useLayoutEffect(() => {
    model.traverse((child) => {
      if (!(child instanceof Mesh)) return
      child.castShadow = castShadow
      child.receiveShadow = true
    })
  }, [castShadow, model])

  return (
    <primitive
      object={model}
      position={[0, detail === 'world' ? -0.58 : 0, 0]}
      scale={modelScale}
    />
  )
}

function useSkinnedSceneClone(scene: Object3D) {
  const model = useMemo(() => cloneSkeleton(scene), [scene])

  useLayoutEffect(() => {
    model.traverse((child) => {
      if (!(child instanceof Mesh)) return
      child.castShadow = true
      child.receiveShadow = true
    })
  }, [model])

  return model
}

function JumpingWaterBottle() {
  const { scene, animations } = useGLTF(jumpingWaterBottleUrl)
  const model = useSkinnedSceneClone(scene)
  const { actions, names } = useAnimations(animations, model)

  useEffect(() => {
    const action = names[0] ? actions[names[0]] : undefined
    action?.reset().fadeIn(0.12).play()
    return () => {
      action?.fadeOut(0.08)
    }
  }, [actions, names])

  return <primitive object={model} position={[0, -0.58, 0]} />
}

function AttachedWaterBottle() {
  const { scene, animations } = useGLTF(jumpingWaterBottleUrl)
  const model = useSkinnedSceneClone(scene)

  useLayoutEffect(() => {
    const clip = animations[0]
    if (!clip) return

    const mixer = new AnimationMixer(model)
    const action = mixer.clipAction(clip)
    action.play()
    mixer.setTime(1 / 24)
    model.updateMatrixWorld(true)

    return () => {
      action.stop()
      mixer.uncacheAction(clip, model)
      mixer.uncacheRoot(model)
    }
  }, [animations, model])

  return <primitive object={model} />
}

function ShimmeringWaterBottle({
  detail,
}: {
  detail: 'world' | 'attached'
}) {
  return detail === 'world' ? (
    <JumpingWaterBottle />
  ) : (
    <AttachedWaterBottle />
  )
}

function MovingRaccoon() {
  const { scene, animations } = useGLTF(raccoonUrl)
  const model = useSkinnedSceneClone(scene)
  const { actions, names } = useAnimations(animations, model)

  useEffect(() => {
    const action = names[0] ? actions[names[0]] : undefined
    action?.reset().fadeIn(0.12).play()
    return () => {
      action?.fadeOut(0.08)
    }
  }, [actions, names])

  return <primitive object={model} position={[0, -0.827, 0]} />
}

function AttachedRaccoon() {
  const { scene, animations } = useGLTF(raccoonUrl)
  const model = useSkinnedSceneClone(scene)

  useLayoutEffect(() => {
    const clip = animations[0]
    if (!clip) return

    const mixer = new AnimationMixer(model)
    const action = mixer.clipAction(clip)
    action.play()
    mixer.setTime(1 / 24)
    model.updateMatrixWorld(true)

    return () => {
      action.stop()
      mixer.uncacheAction(clip, model)
      mixer.uncacheRoot(model)
    }
  }, [animations, model])

  return <primitive object={model} position={[0, -0.247, 0]} />
}

function RaccoonCollectible({
  detail,
}: {
  detail: 'world' | 'attached'
}) {
  return detail === 'world' ? <MovingRaccoon /> : <AttachedRaccoon />
}

function MovingCat() {
  const { scene, animations } = useGLTF(catUrl)
  const model = useSkinnedSceneClone(scene)
  const { actions, names } = useAnimations(animations, model)

  useEffect(() => {
    const action = names[0] ? actions[names[0]] : undefined
    action?.reset().fadeIn(0.12).play()
    return () => {
      action?.fadeOut(0.08)
    }
  }, [actions, names])

  return (
    <primitive
      object={model}
      position={[0, CAT_MODEL_FLOOR_OFFSET + WORLD_COLLECTIBLE_OFFSET, 0]}
    />
  )
}

function AttachedCat() {
  const { scene, animations } = useGLTF(catUrl)
  const model = useSkinnedSceneClone(scene)

  useLayoutEffect(() => {
    const clip = animations[0]
    if (!clip) return

    const mixer = new AnimationMixer(model)
    const action = mixer.clipAction(clip)
    action.play()
    mixer.setTime(1 / 24)
    model.updateMatrixWorld(true)

    return () => {
      action.stop()
      mixer.uncacheAction(clip, model)
      mixer.uncacheRoot(model)
    }
  }, [animations, model])

  return (
    <primitive object={model} position={[0, CAT_MODEL_FLOOR_OFFSET, 0]} />
  )
}

function CatCollectible({
  detail,
}: {
  detail: 'world' | 'attached'
}) {
  return detail === 'world' ? <MovingCat /> : <AttachedCat />
}

function LevelOneAssetMesh({
  itemId,
  detail,
}: {
  itemId: string
  detail: 'world' | 'attached'
}) {
  const variant = getLevelOneAssetVariant(itemId)
  return (
    <ImportedCollectibleMesh
      url={LEVEL_ONE_ASSET_URLS[variant]}
      detail={detail}
    />
  )
}

useGLTF.preload(redLegoUrl)
useGLTF.preload(greenLegoUrl)
useGLTF.preload(yellowLegoUrl)
useGLTF.preload(waterBottleUrl)
useGLTF.preload(candyLegoUrl)
useGLTF.preload(orangeJuiceUrl)
useGLTF.preload(stopwatchModelUrl)
useGLTF.preload(jumpingWaterBottleUrl)
useGLTF.preload(runningSunglassesUrl)
useGLTF.preload(level2HeadsetUrl)
useGLTF.preload(level2NoteUrl)
useGLTF.preload(level2RunningShoeUrl)
useGLTF.preload(level2DigitalWatchUrl)
useGLTF.preload(shimmeringRunningBagUrl)
useGLTF.preload(catDollUrl)
useGLTF.preload(athleteRunningShoeUrl)
useGLTF.preload(raccoonUrl)
useGLTF.preload(inlineSkatesUrl)
useGLTF.preload(runningVestUrl)
useGLTF.preload(runningMedalUrl)
useGLTF.preload(sodaCoolerUrl)
useGLTF.preload(catUrl)
useGLTF.preload(carUrl)
useGLTF.preload(noiseCancelingHeadsetUrl)
useGLTF.preload(luxuryCarUrl)
useGLTF.preload(luxuryCar2Url)
useGLTF.preload(drinkVendingMachineUrl)

/**
 * Every collectible GLB the world can mount. They are all preloaded up front:
 * a model first requested mid-game used to suspend the whole scene (black
 * frame), and chained requests created a slow loading waterfall.
 */
const COLLECTIBLE_MODEL_URLS: readonly string[] = [
  ...Object.values(LEVEL_ONE_ASSET_URLS),
  stopwatchModelUrl,
  jumpingWaterBottleUrl,
  runningSunglassesUrl,
  level2HeadsetUrl,
  level2NoteUrl,
  level2RunningShoeUrl,
  level2DigitalWatchUrl,
  shimmeringRunningBagUrl,
  catDollUrl,
  beraIceCreamUrl,
  energyDrinkUrl,
  taekwondoUniformUrl,
  athleteRunningShoeUrl,
  raccoonUrl,
  inlineSkatesUrl,
  runningVestUrl,
  runningMedalUrl,
  sodaCoolerUrl,
  catUrl,
  shibaInuUrl,
  carUrl,
  noiseCancelingHeadsetUrl,
  luxuryCarUrl,
  luxuryCar2Url,
  drinkVendingMachineUrl,
  lotteTowerUrl,
  ...TREASURE_MODEL_URLS,
  ...STRUCTURED_COLLECTIBLE_ASSETS.map((asset) => asset.url),
]

COLLECTIBLE_MODEL_URLS.forEach((url) => useGLTF.preload(url))

/**
 * Compiles every collectible's shaders and uploads its textures once, right
 * after the world appears, so the first level-up item on screen does not
 * stall the frame while the GPU program is built.
 */
export function CollectibleGpuWarmup({ extraUrls = [] }: { extraUrls?: readonly string[] }) {
  const gltfs = useGLTF([...COLLECTIBLE_MODEL_URLS, ...extraUrls])
  const { gl, scene, camera } = useThree()

  useEffect(() => {
    let cancelled = false
    const holder = new Group()
    holder.name = 'gpu-warmup'
    const textures = new Set<Texture>()
    gltfs.forEach(({ scene: model }) => {
      const copy = model.clone(true)
      copy.traverse((child: Object3D) => {
        const material = (child as Mesh).material as Material | Material[] | undefined
        if (!material) return
        ;(Array.isArray(material) ? material : [material]).forEach((entry) => {
          Object.values(entry).forEach((value) => {
            if (value instanceof Texture) textures.add(value)
          })
        })
      })
      holder.add(copy)
    })
    // Parked under the floor; compile() ignores frustum culling.
    holder.position.set(0, -500, 0)
    scene.add(holder)
    textures.forEach((texture) => gl.initTexture(texture))
    gl.compileAsync(scene, camera)
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) scene.remove(holder)
      })
    return () => {
      cancelled = true
      scene.remove(holder)
    }
  }, [camera, gl, gltfs, scene])

  return null
}


/**
 * Every generated level-up collectible is backed by an imported GLB. The
 * procedural cases below remain only as compatibility fallbacks for old data.
 */
export function LearningObjectMesh({
  item,
  detail = 'world',
}: LearningObjectMeshProps) {
  if (item.modelId === 'radar-treasure') {
    return (
      <ImportedCollectibleMesh
        url={getTreasureModel(item.id).url}
        detail={detail}
      />
    )
  }

  const structuredAsset = getStructuredCollectibleAsset(item.modelId)
  if (structuredAsset) {
    return (
      <ImportedCollectibleMesh
        url={structuredAsset.url}
        detail={detail}
        modelScale={structuredAsset.sourceLevel > 4 ? 1.2 : 1}
        castShadow={
          detail === 'world' || !isArchitectureCollectible(item)
        }
      />
    )
  }

  if (getSizeTier(item.size).level === 1) {
    return <LevelOneAssetMesh itemId={item.id} detail={detail} />
  }

  const compact = detail === 'attached'

  switch (getAssetBackedLevelUpModelId(item)) {
    case 'runner-lace':
      return <RunnerLace color={item.color} />
    case 'crew-badge':
      return <Badge color={item.color} />
    case 'treasure-shard':
    case 'tiny-gem':
      return <Gem color={item.color} />
    case 'wristband':
      return <Wristband color={item.color} />
    case 'key-charm':
      return <KeyCharm color={item.color} />
    case 'mini-can':
      return <DrinkCan color={item.color} compact={compact} />
    case 'cap-pin':
      return <RunningCap color={item.color} pin />
    case 'water-bottle':
      return <ShimmeringWaterBottle detail={detail} />
    case 'stopwatch':
      return (
        <ImportedCollectibleMesh
          url={stopwatchModelUrl}
          detail={detail}
        />
      )
    case 'running-cap':
      return <RunningCap color={item.color} />
    case 'sunglasses':
      return (
        <ImportedCollectibleMesh
          url={runningSunglassesUrl}
          detail={detail}
        />
      )
    case 'wristwatch':
      return <Wristwatch color={item.color} />
    case 'headphones':
      return <Headphones color={item.color} />
    case 'small-box':
      return <GiftBox color={item.color} />
    case 'running-shoe':
      return <RunningShoe color={item.color} compact={compact} />
    case 'level2-headset':
      return <ImportedCollectibleMesh url={level2HeadsetUrl} detail={detail} />
    case 'level2-note':
      return <ImportedCollectibleMesh url={level2NoteUrl} detail={detail} />
    case 'level2-running-shoe':
      return (
        <ImportedCollectibleMesh url={level2RunningShoeUrl} detail={detail} />
      )
    case 'level2-digital-watch':
      return (
        <ImportedCollectibleMesh url={level2DigitalWatchUrl} detail={detail} />
      )
    case 'hydration-pack':
      return (
        <ImportedCollectibleMesh url={shimmeringRunningBagUrl} detail={detail} />
      )
    case 'level2-cat-doll':
      return <ImportedCollectibleMesh url={catDollUrl} detail={detail} />
    case 'level2-bera-ice-cream':
      return <ImportedCollectibleMesh url={beraIceCreamUrl} detail={detail} />
    case 'level2-energy-drink':
      return <ImportedCollectibleMesh url={energyDrinkUrl} detail={detail} />
    case 'level2-taekwondo-uniform':
      return (
        <ImportedCollectibleMesh url={taekwondoUniformUrl} detail={detail} />
      )
    case 'crew-medal':
      return <ImportedCollectibleMesh url={runningMedalUrl} detail={detail} />
    case 'play-ball':
      return <PlayBall color={item.color} />
    case 'skateboard':
      return <Skateboard color={item.color} />
    case 'gem-cluster':
      return <GemCluster color={item.color} />
    case 'treasure-box':
      return <TreasureBox color={item.color} compact={compact} />
    case 'running-shoe-pair':
      return (
        <group>
          <group position={[-0.3, 0, 0.24]} rotation={[0, -0.14, 0]} scale={0.72}>
            <RunningShoe color={item.color} compact={compact} />
          </group>
          <group position={[0.3, 0, -0.24]} rotation={[0, 0.14, 0]} scale={0.72}>
            <RunningShoe color="#FF6B6B" compact={compact} />
          </group>
        </group>
      )
    case 'level3-athlete-running-shoe':
      return (
        <ImportedCollectibleMesh url={athleteRunningShoeUrl} detail={detail} />
      )
    case 'level3-raccoon':
      return <RaccoonCollectible detail={detail} />
    case 'level3-inline-skates':
      return <ImportedCollectibleMesh url={inlineSkatesUrl} detail={detail} />
    case 'level3-running-vest':
      return <ImportedCollectibleMesh url={runningVestUrl} detail={detail} />
    case 'level3-soda-cooler':
      return <ImportedCollectibleMesh url={sodaCoolerUrl} detail={detail} />
    case 'level3-cat':
      return <CatCollectible detail={detail} />
    case 'level3-shiba-inu':
      return <ImportedCollectibleMesh url={shibaInuUrl} detail={detail} />
    case 'giant-sneaker':
      return (
        <group scale={1.12}>
          <RunningShoe color={item.color} compact={compact} />
        </group>
      )
    case 'trophy-cup':
      return <Trophy color={item.color} />
    case 'finish-banner':
      return <FinishGate color={item.color} />
    case 'giant-headphones':
      return <Headphones color={item.color} giant />
    case 'drink-crate':
      return <DrinkCrate color={item.color} compact={compact} />
    case 'treasure-chest':
      return <TreasureBox color={item.color} large compact={compact} />
    case 'crew-kiosk':
      return <CrewKiosk color={item.color} compact={compact} />
    case 'level4-car':
      return (
        <ImportedCollectibleMesh
          url={carUrl}
          detail={detail}
          modelScale={1.3}
        />
      )
    case 'level4-noise-canceling-headset':
      return (
        <ImportedCollectibleMesh
          url={noiseCancelingHeadsetUrl}
          detail={detail}
        />
      )
    case 'level4-luxury-car':
      return (
        <ImportedCollectibleMesh
          url={luxuryCarUrl}
          detail={detail}
          modelScale={1.45}
        />
      )
    case 'level4-luxury-car-2':
      return (
        <ImportedCollectibleMesh
          url={luxuryCar2Url}
          detail={detail}
          modelScale={1.45}
        />
      )
    case 'level4-drink-vending-machine':
      return (
        <ImportedCollectibleMesh url={drinkVendingMachineUrl} detail={detail} />
      )
    case 'level4-lotte-tower':
      return (
        <ImportedCollectibleMesh
          url={lotteTowerUrl}
          detail={detail}
          castShadow={detail === 'world'}
        />
      )
    default:
      return <FallbackShape item={item} />
  }
}

/**
 * Mount inside the rolling-orb group. New collections preserve their actual
 * contact normal; legacy collections fall back to Fibonacci-sphere slots.
 */
export function AttachedObjectMesh({
  item,
  index,
  orbRadius,
  slotCount = 30,
  attachmentNormal,
}: AttachedObjectMeshProps) {
  const transform = useMemo(() => {
    let normal: Vector3
    if (attachmentNormal) {
      normal = new Vector3(...attachmentNormal).normalize()
    } else {
      const slots = Math.max(1, slotCount)
      const slot = ((index % slots) + 0.5) / slots
      const y = 1 - slot * 2
      const ring = Math.sqrt(Math.max(0, 1 - y * y))
      const theta = index * GOLDEN_ANGLE
      normal = new Vector3(
        Math.cos(theta) * ring,
        y,
        Math.sin(theta) * ring,
      ).normalize()
    }
    const scale = getAttachedObjectVisualScale(item, orbRadius)
    const surfaceInset = Math.min(scale * 0.025, orbRadius * 0.025)
    const position = normal.clone().multiplyScalar(orbRadius - surfaceInset)
    const orientation = new Quaternion().setFromUnitVectors(UP, normal)
    const seed = Array.from(item.id).reduce(
      (total, character) => total + character.charCodeAt(0),
      0,
    )
    orientation.multiply(
      new Quaternion().setFromAxisAngle(UP, ((seed % 24) / 24) * Math.PI * 2),
    )
    return { orientation, position, scale }
  }, [attachmentNormal, index, item, orbRadius, slotCount])

  return (
    <group
      position={transform.position}
      quaternion={transform.orientation}
      scale={transform.scale}
      name={`attached-${item.id}`}
      userData={{ sightOccluder: true, sightMinOpacity: 0.82 }}
    >
      <LearningObjectMesh item={item} detail="attached" />
    </group>
  )
}

interface ImportedTreeSpec {
  id: string
  variant: TreeAssetVariant
  position: VectorTuple
  rotationY: number
  scale: number
}

function ImportedTree({ spec }: { spec: ImportedTreeSpec }) {
  const url = TREE_ASSET_URLS[spec.variant]
  const { scene } = useGLTF(url)

  return (
    <Clone
      name={`imported-tree-${spec.variant}`}
      userData={{ sightOccluder: true }}
      object={scene}
      position={spec.position}
      rotation={[0, spec.rotationY, 0]}
      scale={spec.scale}
      castShadow
      receiveShadow
    />
  )
}

function ImportedTrees({ specs }: { specs: ImportedTreeSpec[] }) {
  return (
    <>
      {specs.map((spec) => (
        <ImportedTree key={spec.id} spec={spec} />
      ))}
    </>
  )
}

interface ImportedBenchSpec {
  id: string
  position: VectorTuple
  rotationY: number
}

function ImportedBench({ spec }: { spec: ImportedBenchSpec }) {
  const { scene } = useGLTF(benchChairUrl)

  return (
    <Clone
      name="imported-bench-chair"
      userData={{ sightOccluder: true }}
      object={scene}
      position={spec.position}
      rotation={[0, spec.rotationY, 0]}
      scale={2.1}
      castShadow
      receiveShadow
    />
  )
}

function ImportedBenches({ specs }: { specs: ImportedBenchSpec[] }) {
  return (
    <>
      {specs.map((spec) => (
        <ImportedBench key={spec.id} spec={spec} />
      ))}
    </>
  )
}

function NaturalBlockModel({
  obstacle,
  castShadow,
}: {
  obstacle: WorldObstacle & { assetVariant: NaturalBlockAssetVariant }
  castShadow: boolean
}) {
  const { scene } = useGLTF(
    NATURAL_BLOCK_ASSET_URLS[obstacle.assetVariant],
  )

  return (
    <Clone
      name={`natural-obstacle-${obstacle.assetVariant}`}
      userData={{ sightOccluder: true }}
      object={scene}
      position={[obstacle.x, 0.01, obstacle.z]}
      rotation={[0, obstacle.rotationY ?? 0, 0]}
      scale={obstacle.modelScale ?? [1, 1, 1]}
      castShadow={castShadow}
      receiveShadow
    />
  )
}

function MudModel({
  zone,
}: {
  zone: SurfaceZone & { assetVariant: MudAssetVariant }
}) {
  const { scene } = useGLTF(MUD_ASSET_URLS[zone.assetVariant])

  return (
    <Clone
      name={`natural-surface-${zone.assetVariant}`}
      object={scene}
      position={[zone.x, -0.015, zone.z]}
      rotation={[0, zone.rotationY, 0]}
      scale={zone.modelScale ?? [1, 1, 1]}
      castShadow={false}
      receiveShadow
    />
  )
}

export function NaturalObstacleModels({
  obstacles,
  surfaceZones,
  castShadow = true,
}: NaturalObstacleModelsProps) {
  const naturalBlockers = obstacles.filter(
    (
      obstacle,
    ): obstacle is WorldObstacle & {
      assetVariant: NaturalBlockAssetVariant
    } => obstacle.assetVariant !== undefined,
  )
  const mudZones = surfaceZones.filter(
    (
      zone,
    ): zone is SurfaceZone & { assetVariant: MudAssetVariant } =>
      zone.assetVariant !== undefined,
  )

  return (
    <>
      {naturalBlockers.map((obstacle) => (
        <NaturalBlockModel
          key={obstacle.id}
          obstacle={obstacle}
          castShadow={castShadow}
        />
      ))}
      {mudZones.map((zone) => (
        <MudModel key={zone.id} zone={zone} />
      ))}
    </>
  )
}

useGLTF.preload(lowPolyTreeAUrl)
useGLTF.preload(lowPolyTreeBUrl)
useGLTF.preload(lowPolyTreeCUrl)
useGLTF.preload(benchChairUrl)
useGLTF.preload(treeRootObstacleUrl)
useGLTF.preload(fallenLogAObstacleUrl)
useGLTF.preload(fallenLogBObstacleUrl)
useGLTF.preload(mudAObstacleUrl)
useGLTF.preload(mudBObstacleUrl)

/**
 * Deterministic stage landmarks: imported trees, benches and crew kiosks.
 * Ground, trails, grass and rocks come from NaturalTerrain.
 */
export function GardenSetDressing({
  floorSize = 60,
  theme = 'sunny-plaza',
  treeObstacles = [],
}: GardenSetDressingProps) {
  const parkSize = Math.max(88, Math.min(220, floorSize))
  const themeColors = SCENERY_THEMES[theme]
  const treeSpecs = useMemo<ImportedTreeSpec[]>(
    () =>
      treeObstacles
        .filter((obstacle) => obstacle.id.includes('tree'))
        .map((obstacle) => {
          const variation = getTreeAssetVariation(
            `${theme}-${obstacle.id}`,
          )
          const baseScale = obstacle.id.startsWith('forest-tree')
            ? 3.05
            : theme === 'starlight-river'
              ? 3.35
              : 3.5

          return {
            id: obstacle.id,
            variant: variation.variant,
            position: [obstacle.x, 0, obstacle.z],
            rotationY: variation.rotationY,
            scale: baseScale * variation.scaleMultiplier,
          }
        }),
    [theme, treeObstacles],
  )
  const benchSpecs = useMemo<ImportedBenchSpec[]>(
    () =>
      treeObstacles
        .filter((obstacle) => obstacle.id.startsWith('bench-'))
        .map((obstacle) => {
          const angle = Math.atan2(obstacle.z, obstacle.x)
          return {
            id: obstacle.id,
            position: [obstacle.x, 0, obstacle.z],
            rotationY: -angle,
          }
        }),
    [treeObstacles],
  )
  return (
    <group>
      <ImportedTrees specs={treeSpecs} />
      <ImportedBenches specs={benchSpecs} />

      {theme !== 'forest-trail' && (<>
      <group position={[-parkSize * 0.35, 0, parkSize * 0.24]} userData={{ sightOccluder: true }}>
        <CrewKiosk
          color={themeColors.markers[0]}
          compact={theme !== 'sunny-plaza'}
        />
      </group>
      <group
        position={[parkSize * 0.35, 0, -parkSize * 0.24]}
        rotation={[0, Math.PI, 0]}
        userData={{ sightOccluder: true }}
      >
        <CrewKiosk
          color={themeColors.markers[1]}
          compact={theme !== 'sunny-plaza'}
        />
      </group>
      </>)}
    </group>
  )
}
