// GLB 모델 URL 목록 — 어솔은 Vite 의 `import x from '….glb?url'` 로 에셋을
// 번들에서 꺼냈지만 Next(정적 export)에는 그 문법이 없다. 그래서 모델 파일은
// public/quizrun/models/ 에 두고 여기서 경로만 내보낸다.
//
// 파일명은 어솔 원본 그대로다 — 한글·공백이 섞여 있어 URL 은 미리 퍼센트
// 인코딩해 뒀다. structuredCollectibleAssets 가 `레벨N_이름.glb` 를 파싱해
// 라벨과 등급을 뽑아내므로 이름을 바꾸면 안 된다.
//
// 어솔에서 모델을 다시 가져올 때는 assets/game/*.glb 를 public/quizrun/models/
// 로 복사하고 이 목록을 갱신하면 된다. 같은 이름으로 모델을 교체했다면
// MODEL_VERSION 을 올려야 한다 — hosting 에서 1년 immutable 캐시가 걸려 있어
// URL 이 그대로면 학생 기기가 옛 파일을 계속 쓴다.

const MODEL_VERSION = 'v1'
const BASE = '/quizrun/models/'
const suffix = `?${MODEL_VERSION}`

// ── 컴포넌트가 이름으로 직접 쓰는 모델 ──
export const athleteRunningShoeUrl = BASE + '%EC%84%A0%EC%88%98%20%EB%9F%AC%EB%8B%9D%ED%99%94.glb' + suffix
export const benchChairUrl = BASE + '%EB%B2%A4%EC%B9%98%20%EC%9D%98%EC%9E%90.glb' + suffix
export const beraIceCreamUrl = BASE + '%EB%B2%A0%EB%9D%BC%2B%EC%95%84%EC%9D%B4%EC%8A%A4%ED%81%AC%EB%A6%BC.glb' + suffix
export const blueTrashCanUrl = BASE + 'blue%20trash%20can%203d%20model.glb' + suffix
export const candyLegoUrl = BASE + 'level1_candy_lego.glb' + suffix
export const carUrl = BASE + '%EC%B0%A81.glb' + suffix
export const catDollUrl = BASE + '%EA%B3%A0%EC%96%91%EC%9D%B4%20%EC%9D%B8%ED%98%95.glb' + suffix
export const catUrl = BASE + '%EA%B3%A0%EC%96%91%EC%9D%B4.glb' + suffix
export const coneRedV1Url = BASE + 'cone_red_v1.glb' + suffix
export const coneRedV2Url = BASE + 'cone_red_v2.glb' + suffix
export const coneRedV3Url = BASE + 'cone_red_v3.glb' + suffix
export const drinkVendingMachineUrl = BASE + '%EC%9D%8C%EB%A3%8C%20%EC%9E%90%ED%8C%90%EA%B8%B0.glb' + suffix
export const energyDrinkUrl = BASE + '%EC%97%90%EB%84%88%EC%A7%80%EB%93%9C%EB%A7%81%ED%81%AC.glb' + suffix
export const fallenLogAObstacleUrl = BASE + '%EC%9E%A5%EC%95%A0%EB%AC%BC_%ED%86%B5%EB%82%98%EB%AC%B4.glb' + suffix
export const fallenLogBObstacleUrl = BASE + '%EC%9E%A5%EC%95%A0%EB%AC%BC_%ED%86%B5%EB%82%98%EB%AC%B42.glb' + suffix
export const femaleRunnerUrl = BASE + '%EB%8B%AC%EB%A6%AC%EB%8A%94%2B%EC%97%AC%EC%84%B1%2B%EB%9F%B0%EB%8B%9D%ED%81%AC%EB%A3%A8.glb' + suffix
export const greenLegoUrl = BASE + 'level1_green_lego.glb' + suffix
export const inlineSkatesUrl = BASE + '%EC%9D%B8%EB%9D%BC%EC%9D%B8%EC%8A%A4%EC%BC%80%EC%9D%B4%ED%8A%B8.glb' + suffix
export const jumpingWaterBottleUrl = BASE + '%EC%B0%B0%EB%9E%91%EB%AC%BC%EB%B3%91%2B%EC%A0%90%ED%94%84.glb' + suffix
export const level2DigitalWatchUrl = BASE + '%EC%A0%84%EC%9E%90%EC%8B%9C%EA%B3%84.glb' + suffix
export const level2HeadsetUrl = BASE + '%ED%97%A4%EB%93%9C%EC%85%8B.glb' + suffix
export const level2NoteUrl = BASE + '%EB%85%B8%ED%8A%B8.glb' + suffix
export const level2RunningShoeUrl = BASE + '%EB%9F%AC%EB%8B%9D%ED%99%94.glb' + suffix
export const lotteTowerUrl = BASE + '%EB%A1%AF%EB%8D%B0%ED%83%80%EC%9B%8C.glb' + suffix
export const lowPolyTreeAUrl = BASE + 'low%20poly%20tree%203d%20model.glb' + suffix
export const lowPolyTreeBUrl = BASE + 'low-poly%20tree%203d%20model.glb' + suffix
export const lowPolyTreeCUrl = BASE + 'low-poly%20tree%203d%20model%20%281%29.glb' + suffix
export const luxuryCar2Url = BASE + '%EB%8C%80%ED%98%95%20%EA%B3%A0%EA%B8%89%EC%B0%A82.glb' + suffix
export const luxuryCarUrl = BASE + '%EB%8C%80%ED%98%95%20%EA%B3%A0%EA%B8%89%EC%B0%A8.glb' + suffix
export const magnetBatteryUrl = BASE + '%EC%9E%90%EC%84%9D%20%EB%B0%B0%ED%84%B0%EB%A6%AC.glb' + suffix
export const maleRunnerUrl = BASE + '%EB%8B%AC%EB%A6%AC%EB%8A%94%2B%EB%82%A8%EC%84%B1%2B%EB%9F%B0%EB%8B%9D%ED%81%AC%EB%A3%A8.glb' + suffix
export const mudAObstacleUrl = BASE + '%EC%9E%A5%EC%95%A0%EB%AC%BC_%EC%A7%84%ED%9D%99%EB%B0%AD.glb' + suffix
export const mudBObstacleUrl = BASE + '%EC%9E%A5%EC%95%A0%EB%AC%BC_%EC%A7%84%ED%9D%99%EB%B0%AD2.glb' + suffix
export const noiseCancelingHeadsetUrl = BASE + '%EB%85%B8%EC%9D%B4%EC%A6%88%EC%BA%94%EC%8A%AC%EB%A7%81%20%ED%97%A4%EB%93%9C%EC%85%8B.glb' + suffix
export const orangeJuiceUrl = BASE + 'orange%20juice%20carton%203d%20model.glb' + suffix
export const phantomKeyringUrl = BASE + '%ED%8C%AC%ED%85%80%2B%ED%82%A4%EB%A7%81.glb' + suffix
export const polarBearUrl = BASE + '%EB%AC%B4%EC%84%9C%EC%9A%B4%2B%EB%B6%81%EA%B7%B9%EA%B3%B0.glb' + suffix
export const raccoonUrl = BASE + '%EB%84%88%EA%B5%AC%EB%A6%AC.glb' + suffix
export const redLegoUrl = BASE + 'level1_red_lego.glb' + suffix
export const rollingBallUrl = BASE + '%EA%B3%B5%20%EC%97%85%EB%8E%83.glb' + suffix
export const runModelUrl = BASE + 'crew_man_run2.glb' + suffix
export const runningMedalUrl = BASE + '%ED%95%A8%EA%BB%98%20%EB%8B%AC%EB%A6%B0%20%EB%A9%94%EB%8B%AC.glb' + suffix
export const runningSunglassesUrl = BASE + '%EB%9F%B0%EB%8B%9D%EC%9A%A9%EC%84%A0%EA%B8%80%EB%9D%BC%EC%8A%A4.glb' + suffix
export const runningVestUrl = BASE + '%EB%9F%AC%EB%8B%9D%20%EC%A1%B0%EB%81%BC.glb' + suffix
export const shibaInuUrl = BASE + '%EC%8B%9C%EB%B0%94%EA%B2%AC.glb' + suffix
export const shimmeringRunningBagUrl = BASE + '%EC%B0%B0%EB%9E%91%20%EB%9F%AC%EB%8B%9D%20%EA%B0%80%EB%B0%A9.glb' + suffix
export const shippingBoxUrl = BASE + 'shipping%20box%203d%20model.glb' + suffix
export const sodaCoolerUrl = BASE + '%ED%83%84%EC%82%B0%EC%9D%8C%EB%A3%8C%20%EC%95%84%EC%9D%B4%EC%8A%A4%EB%B0%95%EC%8A%A4.glb' + suffix
export const speedBootUrl = BASE + '%EC%8B%A0%EC%86%8D%EC%9D%98%EC%9E%A5%ED%99%94.glb' + suffix
export const standModelUrl = BASE + 'crew_man_stand.glb' + suffix
export const stopwatchModelUrl = BASE + 'stopwatch%203d%20model.glb' + suffix
export const taekwondoUniformUrl = BASE + '%ED%83%9C%EA%B6%8C%EB%8F%84%EB%B3%B5.glb' + suffix
export const treasureRadarUrl = BASE + '%EB%B3%B4%EB%AC%BC%EB%A0%88%EC%9D%B4%EB%8D%94.glb' + suffix
export const treeRootObstacleUrl = BASE + '%EC%9E%A5%EC%95%A0%EB%AC%BC_%EB%82%98%EB%AC%B4%20%EB%BF%8C%EB%A6%AC.glb' + suffix
export const waterBottleUrl = BASE + 'water%20bottle%203d%20model.glb' + suffix
export const yellowLegoUrl = BASE + 'level1_yellow_lego.glb' + suffix

/** `레벨N_이름.glb` 묶음 — 원본의 import.meta.glob 자리를 대신한다.
 *  fileName 은 라벨·등급 파싱에 쓰이고, url 은 실제 내려받을 경로다. */
export const LEVEL_ASSET_ENTRIES: readonly {
  fileName: string
  url: string
}[] = [
  { fileName: '레벨1_감자튀김.glb', url: BASE + '%EB%A0%88%EB%B2%A81_%EA%B0%90%EC%9E%90%ED%8A%80%EA%B9%80.glb' + suffix },
  { fileName: '레벨1_기훈이의 뽀삐인형.glb', url: BASE + '%EB%A0%88%EB%B2%A81_%EA%B8%B0%ED%9B%88%EC%9D%B4%EC%9D%98%20%EB%BD%80%EC%82%90%EC%9D%B8%ED%98%95.glb' + suffix },
  { fileName: '레벨1_떡볶이.glb', url: BASE + '%EB%A0%88%EB%B2%A81_%EB%96%A1%EB%B3%B6%EC%9D%B4.glb' + suffix },
  { fileName: '레벨1_바나나 우유.glb', url: BASE + '%EB%A0%88%EB%B2%A81_%EB%B0%94%EB%82%98%EB%82%98%20%EC%9A%B0%EC%9C%A0.glb' + suffix },
  { fileName: '레벨1_복숭아.glb', url: BASE + '%EB%A0%88%EB%B2%A81_%EB%B3%B5%EC%88%AD%EC%95%84.glb' + suffix },
  { fileName: '레벨1_줄넘기.glb', url: BASE + '%EB%A0%88%EB%B2%A81_%EC%A4%84%EB%84%98%EA%B8%B0.glb' + suffix },
  { fileName: '레벨1_파인애플.glb', url: BASE + '%EB%A0%88%EB%B2%A81_%ED%8C%8C%EC%9D%B8%EC%95%A0%ED%94%8C.glb' + suffix },
  { fileName: '레벨2_기아타이거즈 야구모자.glb', url: BASE + '%EB%A0%88%EB%B2%A82_%EA%B8%B0%EC%95%84%ED%83%80%EC%9D%B4%EA%B1%B0%EC%A6%88%20%EC%95%BC%EA%B5%AC%EB%AA%A8%EC%9E%90.glb' + suffix },
  { fileName: '레벨2_런닝용 반바지.glb', url: BASE + '%EB%A0%88%EB%B2%A82_%EB%9F%B0%EB%8B%9D%EC%9A%A9%20%EB%B0%98%EB%B0%94%EC%A7%80.glb' + suffix },
  { fileName: '레벨2_매콤한 신라면.glb', url: BASE + '%EB%A0%88%EB%B2%A82_%EB%A7%A4%EC%BD%A4%ED%95%9C%20%EC%8B%A0%EB%9D%BC%EB%A9%B4.glb' + suffix },
  { fileName: '레벨2_치킨.glb', url: BASE + '%EB%A0%88%EB%B2%A82_%EC%B9%98%ED%82%A8.glb' + suffix },
  { fileName: '레벨2_크리퍼.glb', url: BASE + '%EB%A0%88%EB%B2%A82_%ED%81%AC%EB%A6%AC%ED%8D%BC.glb' + suffix },
  { fileName: '레벨2_후라이팬.glb', url: BASE + '%EB%A0%88%EB%B2%A82_%ED%9B%84%EB%9D%BC%EC%9D%B4%ED%8C%AC.glb' + suffix },
  { fileName: '레벨3_닌텐도.glb', url: BASE + '%EB%A0%88%EB%B2%A83_%EB%8B%8C%ED%85%90%EB%8F%84.glb' + suffix },
  { fileName: '레벨3_서윤이의 크레비티 앨범.glb', url: BASE + '%EB%A0%88%EB%B2%A83_%EC%84%9C%EC%9C%A4%EC%9D%B4%EC%9D%98%20%ED%81%AC%EB%A0%88%EB%B9%84%ED%8B%B0%20%EC%95%A8%EB%B2%94.glb' + suffix },
  { fileName: '레벨3_스켈레톤.glb', url: BASE + '%EB%A0%88%EB%B2%A83_%EC%8A%A4%EC%BC%88%EB%A0%88%ED%86%A4.glb' + suffix },
  { fileName: '레벨3_안전한 자동차.glb', url: BASE + '%EB%A0%88%EB%B2%A83_%EC%95%88%EC%A0%84%ED%95%9C%20%EC%9E%90%EB%8F%99%EC%B0%A8.glb' + suffix },
  { fileName: '레벨3_재희의 NC굿즈.glb', url: BASE + '%EB%A0%88%EB%B2%A83_%EC%9E%AC%ED%9D%AC%EC%9D%98%20NC%EA%B5%BF%EC%A6%88.glb' + suffix },
  { fileName: '레벨3_트리케라톱스.glb', url: BASE + '%EB%A0%88%EB%B2%A83_%ED%8A%B8%EB%A6%AC%EC%BC%80%EB%9D%BC%ED%86%B1%EC%8A%A4.glb' + suffix },
  { fileName: '레벨3_티라노사우루스.glb', url: BASE + '%EB%A0%88%EB%B2%A83_%ED%8B%B0%EB%9D%BC%EB%85%B8%EC%82%AC%EC%9A%B0%EB%A3%A8%EC%8A%A4.glb' + suffix },
  { fileName: '레벨3_학교.glb', url: BASE + '%EB%A0%88%EB%B2%A83_%ED%95%99%EA%B5%90.glb' + suffix },
  { fileName: '레벨3_화장실 변기.glb', url: BASE + '%EB%A0%88%EB%B2%A83_%ED%99%94%EC%9E%A5%EC%8B%A4%20%EB%B3%80%EA%B8%B0.glb' + suffix },
  { fileName: '레벨4_63빌딩.glb', url: BASE + '%EB%A0%88%EB%B2%A84_63%EB%B9%8C%EB%94%A9.glb' + suffix },
  { fileName: '레벨4_덕수궁.glb', url: BASE + '%EB%A0%88%EB%B2%A84_%EB%8D%95%EC%88%98%EA%B6%81.glb' + suffix },
  { fileName: '레벨4_서울N타워.glb', url: BASE + '%EB%A0%88%EB%B2%A84_%EC%84%9C%EC%9A%B8N%ED%83%80%EC%9B%8C.glb' + suffix },
  { fileName: '레벨4_아파트.glb', url: BASE + '%EB%A0%88%EB%B2%A84_%EC%95%84%ED%8C%8C%ED%8A%B8.glb' + suffix },
  { fileName: '레벨4_야구장.glb', url: BASE + '%EB%A0%88%EB%B2%A84_%EC%95%BC%EA%B5%AC%EC%9E%A5.glb' + suffix },
  { fileName: '레벨4_에펠탑.glb', url: BASE + '%EB%A0%88%EB%B2%A84_%EC%97%90%ED%8E%A0%ED%83%91.glb' + suffix },
  { fileName: '레벨4_자유의 여신상.glb', url: BASE + '%EB%A0%88%EB%B2%A84_%EC%9E%90%EC%9C%A0%EC%9D%98%20%EC%97%AC%EC%8B%A0%EC%83%81.glb' + suffix },
  { fileName: '레벨4_테슬라.glb', url: BASE + '%EB%A0%88%EB%B2%A84_%ED%85%8C%EC%8A%AC%EB%9D%BC.glb' + suffix },
  { fileName: '레벨5_지구.glb', url: BASE + '%EB%A0%88%EB%B2%A85_%EC%A7%80%EA%B5%AC.glb' + suffix },
  { fileName: '레벨5_토성.glb', url: BASE + '%EB%A0%88%EB%B2%A85_%ED%86%A0%EC%84%B1.glb' + suffix },
]
