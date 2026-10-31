// 잠만보 낚시터 — Three.js 2.5D 낚시 게임
// 보글보글 거품(등급·가짜)에 낚싯대를 던지고, 걸리면 방향키 콤보로 끌어올린다.
// 물고기·낚시꾼 모델은 Tripo. 물고기 동작은 정점 셰이더로 몸을 휜다(종마다 뼈 구성이 달라서).
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { analyze, shell, cut } from "./avatar.js?v=6";
import { NET, initNet, saveCatch, refresh, gate, quizNeeded, askQuiz, LOOK_PAL, serverNow, phaseNow, hasTicket, renderLobby, bindJoin } from "./town.js?v=17";

const $ = (id) => document.getElementById(id);
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (k, dt) => Math.min(1, dt * k);

// ------------------------------------------------------------------ 물고기 도감
// notes: 눌러야 할 방향키 수, win: 한 칸 제한 시간(초), mash: 연타 구간 수(마지막 끌어올리기 포함), zig: 좌우 버티기 구간 수
// water: fresh(민물) / sea(바다), disp: 화면 속 길이, len: 실제 크기(cm)
const T_COMMON = { notes: 6, win: 1.35, mash: 0, zig: 0 }, T_NORMAL = { notes: 9, win: 1.1, mash: 1, zig: 0 };
const T_RARE = { notes: 11, win: .95, mash: 1, zig: 1 }, T_LEGEND = { notes: 11, win: .88, mash: 1, zig: 1 };
const SPECIES = {
  // 민물
  boot:      { water: "fresh", name: "낡은 장화",  tier: "꽝",   points: 0,   disp: 0.42, len: [24, 30],   notes: 3, win: 1.6, mash: 0, zig: 0 },
  minnow:    { water: "fresh", name: "송사리",    tier: "흔함", points: 10,  disp: 0.6,  len: [3, 6],     ...T_COMMON, notes: 5, win: 1.4 },
  pirami:    { water: "fresh", name: "피라미",    tier: "흔함", points: 14,  disp: 0.7,  len: [8, 16],    ...T_COMMON },
  crucian:   { water: "fresh", name: "붕어",      tier: "흔함", points: 20,  disp: 0.95, len: [15, 32],   ...T_COMMON, notes: 7, win: 1.25 },
  bluegill:  { water: "fresh", name: "블루길",    tier: "흔함", points: 22,  disp: 0.8,  len: [10, 25],   ...T_COMMON, notes: 7, win: 1.25 },
  carp:      { water: "fresh", name: "잉어",      tier: "보통", points: 45,  disp: 1.4,  len: [40, 85],   ...T_NORMAL },
  bass:      { water: "fresh", name: "배스",      tier: "보통", points: 50,  disp: 1.2,  len: [25, 60],   ...T_NORMAL },
  trout:     { water: "fresh", name: "송어",      tier: "보통", points: 55,  disp: 1.2,  len: [25, 60],   ...T_NORMAL, zig: 1 },
  catfish:   { water: "fresh", name: "메기",      tier: "희귀", points: 80,  disp: 1.7,  len: [45, 110],  ...T_RARE },
  eel:       { water: "fresh", name: "뱀장어",    tier: "희귀", points: 90,  disp: 1.9,  len: [40, 100],  ...T_RARE, zig: 2 },
  mandarin:  { water: "fresh", name: "쏘가리",    tier: "희귀", points: 95,  disp: 1.2,  len: [25, 55],   ...T_RARE, notes: 10, win: .92 },
  snakehead: { water: "fresh", name: "가물치",    tier: "희귀", points: 100, disp: 1.6,  len: [40, 90],   ...T_RARE, notes: 10, win: .92 },
  sturgeon:  { water: "fresh", name: "철갑상어",  tier: "전설", points: 220, disp: 2.4,  len: [100, 190], ...T_LEGEND },
  goldkoi:   { water: "fresh", name: "황금 잉어", tier: "전설", points: 320, disp: 1.7,  len: [60, 95],   ...T_LEGEND, notes: 12, win: .84 },
  bagrid:    { water: "fresh", name: "동자개", tier: "보통", points: 40, disp: 1.0, len: [15, 30], ...T_NORMAL },
  nuchi:     { water: "fresh", name: "누치", tier: "흔함", points: 28, disp: 1.1, len: [20, 50], ...T_COMMON },
  mirrorcarp:{ water: "fresh", name: "향어", tier: "보통", points: 52, disp: 1.4, len: [40, 80], ...T_NORMAL },
  kkeokji:   { water: "fresh", name: "꺽지", tier: "희귀", points: 85, disp: 0.9, len: [12, 28], ...T_RARE, notes: 10, win: .92 },
  masu:      { water: "fresh", name: "산천어", tier: "희귀", points: 105, disp: 1.1, len: [20, 40], ...T_RARE },
  // 바다
  can:       { water: "sea", name: "녹슨 깡통",   tier: "꽝",   points: 0,   disp: 0.4,  len: [8, 12],    notes: 3, win: 1.6, mash: 0, zig: 0 },
  jack:      { water: "sea", name: "전갱이",      tier: "흔함", points: 14,  disp: 0.8,  len: [15, 35],   ...T_COMMON },
  mackerel:  { water: "sea", name: "고등어",      tier: "흔함", points: 18,  disp: 1.0,  len: [25, 45],   ...T_COMMON },
  rockfish:  { water: "sea", name: "우럭",        tier: "흔함", points: 25,  disp: 0.95, len: [20, 50],   ...T_COMMON, notes: 7, win: 1.25 },
  puffer:    { water: "sea", name: "복어",        tier: "보통", points: 45,  disp: 0.75, len: [15, 40],   ...T_NORMAL },
  cutlass:   { water: "sea", name: "갈치",        tier: "보통", points: 48,  disp: 2.2,  len: [60, 150],  ...T_NORMAL, zig: 1 },
  seabream:  { water: "sea", name: "참돔",        tier: "보통", points: 50,  disp: 1.2,  len: [30, 80],   ...T_NORMAL },
  flounder:  { water: "sea", name: "광어",        tier: "보통", points: 55,  disp: 1.2,  len: [35, 90],   ...T_NORMAL },
  yellowtail:{ water: "sea", name: "방어",        tier: "희귀", points: 100, disp: 1.8,  len: [60, 110],  ...T_RARE },
  sunfish:   { water: "sea", name: "개복치",      tier: "희귀", points: 120, disp: 1.8,  len: [100, 250], ...T_RARE, notes: 10, win: .92 },
  tuna:      { water: "sea", name: "참치",        tier: "전설", points: 250, disp: 2.4,  len: [120, 280], ...T_LEGEND },
  marlin:    { water: "sea", name: "청새치",      tier: "전설", points: 320, disp: 2.8,  len: [180, 400], ...T_LEGEND, notes: 12, win: .84 },
  seabass:   { water: "sea", name: "농어", tier: "보통", points: 58, disp: 1.3, len: [40, 100], ...T_NORMAL },
  mahimahi:  { water: "sea", name: "만새기", tier: "희귀", points: 110, disp: 1.6, len: [60, 150], ...T_RARE },
  kingfish:  { water: "sea", name: "부시리", tier: "희귀", points: 115, disp: 1.8, len: [60, 150], ...T_RARE, zig: 2 },
  hammerhead:{ water: "sea", name: "상어", tier: "전설", points: 280, disp: 2.6, len: [150, 350], ...T_LEGEND },
  sailfish:  { water: "sea", name: "돛새치", tier: "전설", points: 300, disp: 2.6, len: [150, 330], ...T_LEGEND, notes: 12, win: .84 },
};
// 어떤 물고기는 방향키 대신 화면에 뜨는 원을 터치(클릭)해서 잡는다. mix 는 방향키와 원이 번갈아
const PLAY_STYLE = { bluegill: "circle", trout: "circle", eel: "circle", mandarin: "circle", sturgeon: "mix", goldkoi: "mix",
  jack: "circle", puffer: "circle", cutlass: "circle", yellowtail: "circle", tuna: "mix", marlin: "mix",
  masu: "circle", mahimahi: "circle", sailfish: "mix", hammerhead: "mix" };
for (const id in PLAY_STYLE) SPECIES[id].play = PLAY_STYLE[id];
// 사투 중간에 끼는 미니게임: bar(타이밍 바) · hold(줄 텐션 유지) · track(물고기 따라잡기)
const MINIS = {
  minnow: ["bar"], pirami: ["bar"], crucian: ["hold"], bluegill: ["bar"], carp: ["hold", "track"], bass: ["track"], trout: ["bar"],
  catfish: ["hold", "track"], eel: ["track"], mandarin: ["bar"], snakehead: ["track", "hold"], sturgeon: ["hold", "track"], goldkoi: ["bar", "track", "hold"],
  jack: ["bar"], mackerel: ["track"], rockfish: ["hold"], puffer: ["bar"], cutlass: ["track"], seabream: ["bar", "hold"], flounder: ["hold"],
  yellowtail: ["track", "hold"], sunfish: ["bar", "hold"], tuna: ["track", "hold"], marlin: ["bar", "track", "hold"],
};
// 새 모드(타자·기억·릴·두더지)도 고르게 나눠 준다
Object.assign(MINIS, {
  minnow: ["bar", "whack"], pirami: ["typing"], crucian: ["hold", "spin"], bluegill: ["bar", "simon"], carp: ["hold", "typing"], bass: ["track", "whack"],
  trout: ["bar", "simon"], catfish: ["spin", "track"], eel: ["track", "typing"], mandarin: ["whack", "bar"], snakehead: ["spin", "hold"],
  sturgeon: ["hold", "simon", "spin"], goldkoi: ["bar", "typing", "whack"],
  jack: ["bar", "typing"], mackerel: ["track", "whack"], rockfish: ["hold", "simon"], puffer: ["whack"], cutlass: ["track", "spin"],
  seabream: ["bar", "typing"], flounder: ["hold", "whack"], yellowtail: ["spin", "simon"], sunfish: ["hold", "typing"], tuna: ["track", "spin", "simon"], marlin: ["bar", "whack", "hold"],
  bagrid: ["hold", "rhythm"], nuchi: ["bar", "typing"], mirrorcarp: ["hold", "whack"], kkeokji: ["dodge", "simon"], masu: ["track", "bar"], seabass: ["bar", "whack"], mahimahi: ["track", "rhythm"], kingfish: ["spin", "hold"], hammerhead: ["hold", "dodge"], sailfish: ["spin", "dodge"],
});
// 박자 낚시(rhythm)·장애물 피하기(dodge)도 섞는다
for (const [id, t] of Object.entries({ minnow: "rhythm", bluegill: "rhythm", crucian: "rhythm", sturgeon: "rhythm", mackerel: "rhythm", seabream: "rhythm", tuna: "rhythm", sunfish: "rhythm",
  bass: "dodge", trout: "dodge", eel: "dodge", snakehead: "dodge", goldkoi: "dodge", cutlass: "dodge", flounder: "dodge", marlin: "dodge", yellowtail: "dodge" })) MINIS[id].push(t);
// 점프 넘기(jump)·먹이 받기(feed)
for (const [id, t] of Object.entries({ pirami: "jump", carp: "feed", catfish: "jump", mandarin: "feed", bagrid: "jump", nuchi: "feed", masu: "jump", crucian: "feed",
  jack: "feed", rockfish: "jump", seabream: "feed", kingfish: "jump", mahimahi: "jump", seabass: "feed", sunfish: "feed", tuna: "jump" })) MINIS[id].push(t);
for (const id in MINIS) SPECIES[id].minis = MINIS[id];
// 보스: 경기 후반에 한 번 나타나는 거대한 그림자. 모든 미니게임을 다 거친다
Object.assign(SPECIES, {
  bossFresh: { water: "fresh", name: "메기 대왕", tier: "보스", points: 800, disp: 3.4, len: [250, 320], model: "catfish", notes: 9, win: .95, mash: 1, zig: 1, play: "mix", minis: ["bar", "typing", "track", "whack", "hold", "rhythm", "dodge", "jump", "feed"], boss: true },
  bossSea: { water: "sea", name: "청새치 대왕", tier: "보스", points: 900, disp: 4.2, len: [450, 600], model: "marlin", notes: 9, win: .95, mash: 1, zig: 1, play: "mix", minis: ["spin", "simon", "track", "whack", "hold", "rhythm", "dodge", "jump", "feed"], boss: true },
  // 보스 더(v24): 낚시터마다 셋 중 하나가 나온다
  bossgar: { water: "fresh", name: "악어가아 대왕", tier: "보스", points: 850, disp: 3.6, len: [250, 330], notes: 9, win: .95, mash: 1, zig: 1, play: "mix", minis: ["hold", "typing", "track", "dodge", "spin", "jump", "whack", "bar", "feed"], boss: true },
  bosskoi: { water: "fresh", name: "황금 용잉어", tier: "보스", points: 1000, disp: 3, len: [180, 240], notes: 9, win: .95, mash: 1, zig: 1, play: "mix", minis: ["rhythm", "simon", "bar", "typing", "feed", "jump", "whack", "track", "hold"], boss: true },
  bossshark: { water: "sea", name: "백상아리 대왕", tier: "보스", points: 950, disp: 4, len: [500, 650], notes: 9, win: .95, mash: 1, zig: 1, play: "mix", minis: ["dodge", "hold", "track", "spin", "whack", "jump", "bar", "typing", "rhythm"], boss: true },
  bosskraken: { water: "sea", name: "대왕오징어", tier: "보스", points: 1000, disp: 4.4, len: [800, 1200], notes: 9, win: .95, mash: 1, zig: 1, play: "mix", minis: ["spin", "simon", "hold", "whack", "typing", "dodge", "feed", "rhythm", "track"], boss: true },
});
// 물고기 2배(v24): 민물 18종·바다 18종 추가
Object.assign(SPECIES, {
  bingeo: { water: "fresh", name: "빙어", tier: "흔함", points: 12, disp: .5, len: [7, 15], ...T_COMMON },
  loach: { water: "fresh", name: "미꾸라지", tier: "흔함", points: 16, disp: .6, len: [10, 20], ...T_COMMON, zig: 1 },
  beodeulchi: { water: "fresh", name: "버들치", tier: "흔함", points: 13, disp: .55, len: [7, 15], ...T_COMMON },
  gakshi: { water: "fresh", name: "각시붕어", tier: "흔함", points: 15, disp: .5, len: [4, 8], ...T_COMMON, notes: 5, win: 1.4 },
  galgyeoni: { water: "fresh", name: "갈겨니", tier: "흔함", points: 18, disp: .7, len: [10, 20], ...T_COMMON },
  moraemuji: { water: "fresh", name: "모래무지", tier: "보통", points: 38, disp: .9, len: [15, 30], ...T_NORMAL },
  kkeuri: { water: "fresh", name: "끄리", tier: "보통", points: 46, disp: 1.2, len: [25, 50], ...T_NORMAL },
  gangjunchi: { water: "fresh", name: "강준치", tier: "보통", points: 50, disp: 1.4, len: [40, 100], ...T_NORMAL },
  eunuh: { water: "fresh", name: "은어", tier: "보통", points: 48, disp: .9, len: [15, 30], ...T_NORMAL },
  rainbowtrout: { water: "fresh", name: "무지개송어", tier: "보통", points: 56, disp: 1.2, len: [30, 70], ...T_NORMAL, zig: 1 },
  tilapia: { water: "fresh", name: "틸라피아", tier: "보통", points: 42, disp: 1, len: [20, 45], ...T_NORMAL },
  dongsari: { water: "fresh", name: "동사리", tier: "보통", points: 40, disp: .8, len: [10, 25], ...T_NORMAL },
  chamge: { water: "fresh", name: "참게", tier: "보통", points: 44, disp: .55, len: [6, 10], ...T_NORMAL },
  lenok: { water: "fresh", name: "열목어", tier: "희귀", points: 98, disp: 1.3, len: [30, 70], ...T_RARE },
  jara: { water: "fresh", name: "자라", tier: "희귀", points: 110, disp: .9, len: [20, 40], ...T_RARE },
  hwangsso: { water: "fresh", name: "황쏘가리", tier: "희귀", points: 120, disp: 1.2, len: [25, 55], ...T_RARE, notes: 10, win: .92 },
  arapaima: { water: "fresh", name: "피라루쿠", tier: "전설", points: 300, disp: 2.8, len: [150, 300], ...T_LEGEND },
  arowana: { water: "fresh", name: "아로와나", tier: "전설", points: 260, disp: 1.6, len: [60, 120], ...T_LEGEND, notes: 12, win: .84 },
  anchovy: { water: "sea", name: "멸치", tier: "흔함", points: 8, disp: .4, len: [5, 15], ...T_COMMON, notes: 5, win: 1.4 },
  saury: { water: "sea", name: "꽁치", tier: "흔함", points: 15, disp: .9, len: [25, 35], ...T_COMMON },
  halfbeak: { water: "sea", name: "학꽁치", tier: "흔함", points: 17, disp: .8, len: [20, 40], ...T_COMMON },
  bollak: { water: "sea", name: "볼락", tier: "흔함", points: 22, disp: .7, len: [15, 30], ...T_COMMON },
  noraemi: { water: "sea", name: "노래미", tier: "흔함", points: 24, disp: .85, len: [20, 45], ...T_COMMON },
  jwichi: { water: "sea", name: "쥐치", tier: "보통", points: 40, disp: .7, len: [15, 35], ...T_NORMAL },
  dodari: { water: "sea", name: "도다리", tier: "보통", points: 46, disp: .9, len: [20, 45], ...T_NORMAL },
  gamsungdom: { water: "sea", name: "감성돔", tier: "보통", points: 58, disp: 1.1, len: [25, 60], ...T_NORMAL },
  samchi: { water: "sea", name: "삼치", tier: "보통", points: 54, disp: 1.5, len: [50, 100], ...T_NORMAL, zig: 1 },
  squid: { water: "sea", name: "오징어", tier: "보통", points: 44, disp: .9, len: [20, 40], ...T_NORMAL },
  octopus: { water: "sea", name: "문어", tier: "희귀", points: 95, disp: 1.1, len: [40, 120], ...T_RARE },
  monkfish: { water: "sea", name: "아귀", tier: "희귀", points: 100, disp: 1.2, len: [40, 100], ...T_RARE },
  dolddom: { water: "sea", name: "돌돔", tier: "희귀", points: 118, disp: 1, len: [25, 60], ...T_RARE, notes: 10, win: .92 },
  salmon: { water: "sea", name: "연어", tier: "희귀", points: 105, disp: 1.5, len: [60, 100], ...T_RARE },
  stingray: { water: "sea", name: "가오리", tier: "희귀", points: 112, disp: 1.4, len: [50, 120], ...T_RARE },
  swordfish: { water: "sea", name: "황새치", tier: "전설", points: 310, disp: 2.8, len: [200, 450], ...T_LEGEND, notes: 12, win: .84 },
  manta: { water: "sea", name: "만타가오리", tier: "전설", points: 290, disp: 2.6, len: [300, 600], ...T_LEGEND },
  whaleshark: { water: "sea", name: "고래상어", tier: "전설", points: 330, disp: 3.2, len: [500, 1000], ...T_LEGEND },
});
Object.assign(PLAY_STYLE, {"gakshi": "circle", "galgyeoni": "circle", "eunuh": "circle", "rainbowtrout": "circle", "lenok": "circle", "hwangsso": "circle", "arapaima": "mix", "arowana": "mix", "halfbeak": "circle", "bollak": "circle", "samchi": "circle", "octopus": "circle", "dolddom": "circle", "salmon": "circle", "swordfish": "mix", "manta": "mix", "whaleshark": "mix"});
for (const [id, m] of Object.entries({"bingeo": ["simon", "track"], "loach": ["spin", "bar"], "beodeulchi": ["hold", "dodge"], "gakshi": ["hold", "simon"], "galgyeoni": ["jump", "bar"], "moraemuji": ["dodge", "typing"], "kkeuri": ["bar", "hold"], "gangjunchi": ["spin", "feed"], "eunuh": ["hold", "typing"], "rainbowtrout": ["hold", "dodge"], "tilapia": ["spin", "bar"], "dongsari": ["jump", "hold"], "chamge": ["typing", "jump"], "lenok": ["bar", "jump", "spin"], "jara": ["bar", "typing", "feed"], "hwangsso": ["dodge", "track", "whack"], "arapaima": ["spin", "track", "dodge"], "arowana": ["hold", "jump", "whack"], "anchovy": ["dodge", "track"], "saury": ["hold", "jump"], "halfbeak": ["jump", "typing"], "bollak": ["simon", "hold"], "noraemi": ["dodge", "hold"], "jwichi": ["jump", "bar"], "dodari": ["jump", "typing"], "gamsungdom": ["rhythm", "dodge"], "samchi": ["spin", "simon"], "squid": ["rhythm", "jump"], "octopus": ["rhythm", "simon", "whack"], "monkfish": ["typing", "track", "feed"], "dolddom": ["hold", "jump", "whack"], "salmon": ["dodge", "rhythm", "simon"], "stingray": ["rhythm", "whack", "hold"], "swordfish": ["hold", "dodge", "spin"], "manta": ["track", "simon", "feed"], "whaleshark": ["rhythm", "spin", "bar"]})) { SPECIES[id].minis = m; if (PLAY_STYLE[id]) SPECIES[id].play = PLAY_STYLE[id]; }
// 새 미니게임(번쩍 잡아채기·물고기 세기·거품 터뜨리기)을 고르게 나눠 준다. 보스는 셋 다
{ const NEW = ["reflex", "count", "bubble"]; let k = 0;
  for (const id of Object.keys(SPECIES)) { const sp = SPECIES[id]; if (!sp.minis) continue; if (sp.boss) sp.minis = [...sp.minis, ...NEW]; else if (k++ % 2 === 0) sp.minis = [...sp.minis, NEW[(k >> 1) % 3]]; } }
// 미끼: 등급별로 잘 무는 정도가 다르다
const BAITS = {
  worm: { name: "지렁이", key: "1", tip: "흔한 물고기가 잘 물어요", mul: { "꽝": 1, "흔함": 1.6, "보통": 1, "희귀": .6, "전설": .5 }, wait: 1 },
  shrimp: { name: "새우", key: "2", tip: "중간 크기·희귀한 물고기", mul: { "꽝": .8, "흔함": .7, "보통": 1.5, "희귀": 1.4, "전설": .8 }, wait: 1.1 },
  lure: { name: "반짝 루어", key: "3", tip: "전설이 좋아하지만 입질이 느려요", mul: { "꽝": .6, "흔함": .4, "보통": .8, "희귀": 1.2, "전설": 2.4 }, wait: 1.5 },
};
// 날씨: 판마다 바뀌고, 날씨를 좋아하는 물고기가 더 잘 나온다
const WEATHERS = {
  sunny: { name: "맑음", fav: [] },
  rain: { name: "비", fav: ["catfish", "eel", "snakehead", "carp", "cutlass", "rockfish", "flounder"], tierMul: { "희귀": 1.4 } },
  sunset: { name: "노을", fav: ["goldkoi", "trout", "mandarin", "seabream", "yellowtail", "tuna"], tierMul: { "전설": 1.4 } },
};
const TIER_ORDER = ["흔함", "보통", "희귀", "전설", "보스", "꽝"];
const TIER_COLOR = { "보스": "#e0245e", "꽝": "#6b7280", "흔함": "#3f8f5a", "보통": "#2f7fc0", "희귀": "#8a4fd8", "전설": "#d79a12" };
const PLACES = {
  fresh: { name: "민물 낚시터", junk: "boot" },
  sea: { name: "바다 낚시터", junk: "can" },
};
let PLACE = "fresh";
const placeIds = (w = PLACE, boss = true) => Object.keys(SPECIES).filter((id) => SPECIES[id].water === w && (boss || !SPECIES[id].boss)).sort((a, b) => TIER_ORDER.indexOf(SPECIES[a].tier) - TIER_ORDER.indexOf(SPECIES[b].tier) || SPECIES[a].points - SPECIES[b].points);

// 거품 등급 — 색이 화려할수록 대물. 보라·금빛·무지개는 가끔 가짜(물결이 없다). table 은 등급별 확률(같은 등급 안에서는 고르게)
const SPOT_TYPES = {
  white:   { name: "잔거품",     color: "#ffffff", weight: 38, life: [18, 26], r: 1.0,  rate: 9,  table: { "꽝": 14, "흔함": 86 } },
  blue:    { name: "파란 거품",  color: "#4fc3ff", weight: 30, life: [16, 24], r: 1.1,  rate: 12, table: { "꽝": 5, "흔함": 36, "보통": 49, "희귀": 10 } },
  purple:  { name: "보라 거품",  color: "#b26bff", weight: 18, life: [14, 20], r: 1.2,  rate: 15, table: { "보통": 18, "희귀": 72, "전설": 10 }, fake: 0.3 },
  gold:    { name: "금빛 거품",  color: "#ffd23f", weight: 10, life: [11, 15], r: 1.3,  rate: 19, table: { "희귀": 14, "전설": 86 }, fake: 0.3 },
  rainbow: { name: "무지개 거품", color: "rainbow", weight: 4, life: [9, 12],  r: 1.45, rate: 26, table: { "전설": 100 }, fake: 0.3, bonus: 2 },
  boss:    { name: "거대한 그림자", color: "#ff2a4d", weight: 0, life: [30, 34], r: 2.1, rate: 34, table: {}, bonus: 1, legendHidden: true },
};
const FAKE_TABLE = { "꽝": 70, "흔함": 30 };
function pickSpecies(tierTable) {
  const bait = BAITS[G.bait] || BAITS.worm, W = WEATHERS[G.weather] || WEATHERS.sunny, t = {};
  for (const k in tierTable) t[k] = tierTable[k] * (bait.mul[k] ?? 1) * (W.tierMul?.[k] ?? 1);
  const tier = pick(t), w = {};
  for (const id of placeIds(PLACE, false)) if (SPECIES[id].tier === tier) w[id] = W.fav.includes(id) ? 2.5 : 1;
  return pick(w);
}
function pick(table) {
  let sum = 0; for (const k in table) sum += table[k];
  let r = Math.random() * sum;
  for (const k in table) { r -= table[k]; if (r <= 0) return k; }
  return Object.keys(table)[0];
}

// ------------------------------------------------------------------ 렌더러·장면
const stage = $("stage");
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
stage.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const SKY = new THREE.Color("#9fdcf0");
scene.background = SKY;
scene.fog = new THREE.Fog(SKY, 22, 42);
const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
const hemi = new THREE.HemisphereLight("#f2fff8", "#4a6a44", 0.75); scene.add(hemi);
const sun = new THREE.DirectionalLight("#fff0d0", 1.0); sun.position.set(-6, 10, 6); scene.add(sun);

const grad = new THREE.DataTexture(new Uint8Array([90, 165, 240]), 3, 1, THREE.RedFormat);
grad.minFilter = grad.magFilter = THREE.NearestFilter; grad.needsUpdate = true;
const toon = (color, extra = {}) => new THREE.MeshToonMaterial({ color, gradientMap: grad, ...extra });

// 화면 가로를 약 720픽셀로 그린 뒤 키워서 살짝 픽셀 느낌. 느린 기기(크롬북)는 스스로 600·480으로 낮춘다
const QUALITY = [720, 600, 480]; let qLevel = 0;
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setPixelRatio(Math.min(1, QUALITY[qLevel] / Math.max(320, Math.min(w, h * 1.7))));
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.fov = w / h < 0.8 ? 58 : 40;
  camera.updateProjectionMatrix();
}
addEventListener("resize", resize); resize();

// ------------------------------------------------------------------ 물과 물가 (둥근 해안선)
const POND = { x: 0, z: -6.5, rx: 11, rz: 8.6 };
const shoreNoise = (a) => 1 + 0.07 * Math.sin(a * 3 + 1) + 0.05 * Math.sin(a * 5 + 2.4) + 0.03 * Math.sin(a * 9);
function pondPoint(a, k = 1) {
  const n = shoreNoise(a) * k;
  return new THREE.Vector2(POND.x + Math.cos(a) * POND.rx * n, POND.z + Math.sin(a) * POND.rz * n);
}
const DECK_Z = POND.z + POND.rz * shoreNoise(Math.PI / 2); // 연못 아래쪽 물가(바다에서는 해변 끝)
const pondGroup = new THREE.Group(), seaGroup = new THREE.Group();
scene.add(pondGroup, seaGroup);
const waterMat = new THREE.ShaderMaterial({
  uniforms: { t: { value: 0 }, sea: { value: 0 }, tint: { value: new THREE.Color(1, 1, 1) } },
  vertexShader: "varying vec2 vP; void main(){ vec4 w = modelMatrix*vec4(position,1.); vP = w.xz; gl_Position = projectionMatrix*viewMatrix*w; }",
  fragmentShader: `uniform float t; uniform float sea; uniform vec3 tint; varying vec2 vP;
    void main(){
      float w = sin(vP.x*1.6 + t*1.1) + sin(vP.y*2.1 - t*0.8) + sin((vP.x+vP.y)*1.05 + t*.55);
      vec3 c = mix(vec3(.10,.45,.58), vec3(.20,.62,.72), smoothstep(-1.,2.,w));
      float band = step(2.35, w + sin(vP.x*7.+t)*.15);
      c = mix(c, vec3(.85,.98,.95), band*.5);
      float d = length((vP - vec2(${POND.x.toFixed(1)}, ${POND.z.toFixed(1)})) / vec2(${POND.rx.toFixed(1)}, ${POND.rz.toFixed(1)}));
      vec3 pc = mix(c, vec3(.06,.28,.42), smoothstep(.75,.0,d)*.35);
      pc = mix(pc, vec3(.55,.85,.8), smoothstep(.8,1.0,d)*.45);
      // 바다: 더 짙은 파랑, 멀수록 깊고, 해변 쪽은 옥빛 + 밀려오는 흰 물결
      vec3 sc = mix(vec3(.05,.33,.62), vec3(.16,.55,.80), smoothstep(-1.,2.,w));
      sc = mix(sc, vec3(.85,.97,1.), band*.45);
      float shore = ${DECK_Z.toFixed(2)} - vP.y;
      sc = mix(sc, vec3(.03,.18,.42), smoothstep(6., 30., shore)*.6);
      sc = mix(sc, vec3(.35,.85,.82), smoothstep(5., .0, shore)*.55);
      float foam = step(.6, sin(shore*2.2 - t*1.6 + sin(vP.x*.7)*.8)) * smoothstep(3., .4, shore);
      sc = mix(sc, vec3(1.), foam*.6);
      c = mix(pc, sc, sea) * tint;
      gl_FragColor = vec4(c,1.);
      #include <colorspace_fragment>
    }`,
});
const water = new THREE.Mesh(new THREE.PlaneGeometry(240, 150), waterMat);
water.rotation.x = -Math.PI / 2; water.position.set(0, 0, -50); scene.add(water);

// 땅: 큰 판에 연못 모양 구멍을 뚫고, 모서리를 둥글게 깎아(베벨) 모래 물가가 보이게
{
  const outer = new THREE.Shape();
  outer.moveTo(-40, -40); outer.lineTo(40, -40); outer.lineTo(40, 30); outer.lineTo(-40, 30); outer.closePath();
  const hole = new THREE.Path();
  for (let i = 0; i <= 96; i++) { const p = pondPoint((i / 96) * Math.PI * 2, 1.0); i ? hole.lineTo(p.x, p.y) : hole.moveTo(p.x, p.y); }
  outer.holes.push(hole);
  const geo = new THREE.ExtrudeGeometry(outer, { depth: 0.6, bevelEnabled: true, bevelThickness: 0.35, bevelSize: 0.55, bevelSegments: 5, curveSegments: 12 });
  geo.rotateX(Math.PI / 2); // 위로 보이는 면 = 처음 면
  const land = new THREE.Mesh(geo, [toon("#7cc15a"), toon("#e2c98e")]);
  land.position.y = 0.32; pondGroup.add(land);
}
// 둥근 바위·덤불·부들·나무·꽃 (모두 둥근 도형)
const rock = (x, z, s) => { const m = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 7), toon(Math.random() < .5 ? "#a9b3b8" : "#8f9aa1")); m.scale.set(s * rand(1, 1.5), s * rand(.55, .8), s * rand(.9, 1.3)); m.position.set(x, 0.15, z); m.rotation.y = rand(0, 3); pondGroup.add(m); };
const bush = (x, z, s) => { const g = new THREE.Group(); for (let i = 0; i < 4; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(rand(.45, .7) * s, 10, 8), toon(i % 2 ? "#4f9a3f" : "#5fb048")); b.position.set(rand(-.5, .5) * s, rand(.3, .6) * s, rand(-.3, .3) * s); g.add(b); } g.position.set(x, 0.55, z); pondGroup.add(g); };
const tree = (x, z, s) => {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.18 * s, .26 * s, 1.6 * s, 8), toon("#8a5a32")); trunk.position.y = .8 * s; g.add(trunk);
  for (let i = 0; i < 5; i++) { const c = new THREE.Mesh(new THREE.SphereGeometry(rand(.7, 1.0) * s, 10, 8), toon(i % 2 ? "#3f8f3a" : "#52a944")); c.position.set(rand(-.6, .6) * s, (1.8 + rand(0, .9)) * s, rand(-.5, .5) * s); g.add(c); }
  g.position.set(x, 0.6, z); pondGroup.add(g);
};
const cattail = (x, z) => { const h = rand(.8, 1.5); const st = new THREE.Mesh(new THREE.CylinderGeometry(.03, .04, h, 5), toon("#8db04a")); st.position.set(x, h / 2 + .1, z); st.rotation.z = rand(-.15, .15); pondGroup.add(st); const top = new THREE.Mesh(new THREE.CapsuleGeometry(.07, .22, 3, 6), toon("#7a4a26")); top.position.set(x + st.rotation.z * -h / 2, h + .1, z); pondGroup.add(top); };
const flower = (x, z) => { const c = ["#ff8fb1", "#fff17a", "#ffffff", "#b38cff"][Math.floor(rand(0, 4))]; const f = new THREE.Mesh(new THREE.SphereGeometry(.09, 6, 5), toon(c)); f.position.set(x, .72, z); pondGroup.add(f); };
for (let i = 0; i < 64; i++) {
  const a = (i / 64) * Math.PI * 2 + rand(-.03, .03);
  if (Math.sin(a) > 0.82 && Math.abs(Math.cos(a)) < 0.3) continue; // 낚시꾼 자리 비우기
  const edge = pondPoint(a, 1.0), out = pondPoint(a, rand(1.08, 1.16)), far = pondPoint(a, rand(1.3, 1.7));
  if (i % 3 === 0) rock(edge.x, edge.y, rand(.25, .5));
  if (i % 2 === 0) cattail(out.x + rand(-.3, .3), out.y + rand(-.3, .3)), cattail(out.x + rand(-.4, .4), out.y + rand(-.4, .4));
  if (i % 4 === 1) bush(far.x, far.y, rand(.8, 1.3));
  if (i % 5 === 2) tree(far.x * 1.05, far.y - 1.5, rand(1, 1.5));
  if (i % 2 === 1) flower(out.x + rand(-.6, .6), out.y + rand(.3, 1));
}
// 연잎
for (let i = 0; i < 12; i++) {
  const a = rand(0, Math.PI * 2), p = pondPoint(a, rand(.6, .88));
  const pr = rand(.2, .34), pad = new THREE.Mesh(new THREE.CylinderGeometry(pr, pr, .04, 14, 1, false, 0.4, Math.PI * 2 - 0.4), toon("#63a94a"));
  pad.position.set(p.x, .03, p.y); pad.rotation.y = rand(0, 6); pondGroup.add(pad);
}
// 나무 데크(낚시꾼 자리)
const deck = new THREE.Group(); scene.add(deck);
for (let i = 0; i < 6; i++) {
  const plank = new THREE.Mesh(new THREE.BoxGeometry(2.2, .14, .4), toon(i % 2 ? "#b07a44" : "#c38a50"));
  plank.position.set(0, .42, DECK_Z - .4 - i * .42); deck.add(plank);
}
for (const x of [-1, 1]) for (const k of [0, 1]) {
  const post = new THREE.Mesh(new THREE.CylinderGeometry(.11, .13, 1.2, 8), toon("#7a4f2a")); post.position.set(x, -.05, DECK_Z - .5 - k * 1.9); deck.add(post);
}
const STAND = new THREE.Vector3(0, .49, DECK_Z - 2.1);

// ------------------------------------------------------------------ 바다 낚시터: 모래 해변(양옆이 앞으로 굽은 작은 만)·야자수·바위·먼 섬·등대·부표
const seaFront = (x) => DECK_Z + .3 - Math.max(0, Math.abs(x) - 3.4) * 1.35 + .45 * Math.sin(x * .45 + 1);
{
  const sh = new THREE.Shape();
  sh.moveTo(-60, 40);
  for (let i = 0; i <= 120; i++) { const x = -60 + i; sh.lineTo(x, Math.max(-38, seaFront(x))); }
  sh.lineTo(60, 40); sh.closePath();
  const geo = new THREE.ExtrudeGeometry(sh, { depth: .6, bevelEnabled: true, bevelThickness: .3, bevelSize: .7, bevelSegments: 5, curveSegments: 8 });
  geo.rotateX(Math.PI / 2);
  const beach = new THREE.Mesh(geo, [toon("#f2dca2"), toon("#d6b97c")]);
  beach.position.y = .3; seaGroup.add(beach);
}
const seaRock = (x, z, sc) => { const m = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 1), toon(Math.random() < .5 ? "#8c96a0" : "#727e8a")); m.scale.set(sc * rand(1, 1.5), sc * rand(.6, 1), sc * rand(.9, 1.3)); m.position.set(x, sc * .2, z); m.rotation.set(rand(0, 1), rand(0, 3), 0); seaGroup.add(m); };
const palm = (x, z, sc, lean) => {
  const g = new THREE.Group();
  let px = 0, py = 0;
  for (let i = 0; i < 7; i++) { // 마디진 줄기가 살짝 휘어 올라간다
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(.15 * sc, .19 * sc, .5 * sc, 7), toon(i % 2 ? "#a7743f" : "#8e6033"));
    px += lean * i * .03 * sc; py += .46 * sc; seg.position.set(px, py, 0); seg.rotation.z = -lean * i * .06; g.add(seg);
  }
  for (let k = 0; k < 7; k++) {
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 5), toon(k % 2 ? "#3f9a45" : "#55b94e"));
    const a = k / 7 * Math.PI * 2;
    leaf.scale.set(1.3 * sc, .1 * sc, .32 * sc);
    leaf.position.set(px + Math.cos(a) * .9 * sc, py + .1 * sc, Math.sin(a) * .9 * sc);
    leaf.rotation.set(0, -a, -.45); g.add(leaf);
  }
  for (let k = 0; k < 3; k++) { const c = new THREE.Mesh(new THREE.SphereGeometry(.13 * sc, 7, 6), toon("#6b4a26")); c.position.set(px + rand(-.15, .15) * sc, py - .1 * sc, rand(-.15, .15) * sc); g.add(c); }
  g.position.set(x, .55, z); seaGroup.add(g);
};
for (const sx of [-1, 1]) {
  for (const [x, sc] of [[5.2, .95], [7.4, 1.25], [10, 1.15], [13, 1.4]]) palm(sx * x, seaFront(sx * x) + 1.4 + rand(0, .8), sc, -sx * rand(.8, 1.3));
  for (let i = 0; i < 9; i++) { const x = sx * rand(5, 17), z = seaFront(x) - rand(-.3, .9); seaRock(x, z, rand(.3, .8)); }
}
// 파라솔
{
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(.04, .04, 1.9, 6), toon("#ffffff")); pole.position.y = .95; g.add(pole);
  const top = new THREE.Mesh(new THREE.ConeGeometry(1.1, .45, 12, 1, true), toon("#ff6b6b", { side: THREE.DoubleSide })); top.position.y = 1.9; g.add(top);
  const stripe = new THREE.Mesh(new THREE.ConeGeometry(1.12, .46, 12, 1, true, 0, Math.PI / 3), toon("#fff8e8", { side: THREE.DoubleSide })); stripe.position.y = 1.9; g.add(stripe);
  const stripe2 = stripe.clone(); stripe2.rotation.y = Math.PI * 2 / 3; g.add(stripe2);
  const stripe3 = stripe.clone(); stripe3.rotation.y = Math.PI * 4 / 3; g.add(stripe3);
  g.position.set(-6.4, .55, seaFront(-6.4) + 1.2); g.rotation.z = .1; g.scale.setScalar(.75); seaGroup.add(g);
}
// 먼 섬과 등대
const island = (x, z, r, h) => {
  const g = new THREE.Group();
  const sand = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.12, r * 1.2, .3, 20), toon("#f2dca2")); sand.position.y = .05; g.add(sand);
  const hill = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), toon("#4f9a46")); hill.scale.y = h; g.add(hill);
  g.position.set(x, 0, z); seaGroup.add(g);
};
island(-16, -46, 5, .6); island(9, -54, 7, .45); island(25, -42, 3.5, .8);
{
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.DodecahedronGeometry(2.2, 1), toon("#7d8791")); base.scale.y = .55; g.add(base);
  for (let i = 0; i < 5; i++) { const ring = new THREE.Mesh(new THREE.CylinderGeometry(.62 - i * .05, .67 - i * .05, .7, 12), toon(i % 2 ? "#ffffff" : "#ff5a5a")); ring.position.y = 1 + i * .7; g.add(ring); }
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(.45, .45, .5, 10), toon("#fff3a0", { emissive: "#ffd23f", emissiveIntensity: .8 })); lamp.position.y = 4.75; g.add(lamp);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(.6, .6, 10), toon("#ff5a5a")); cap.position.y = 5.3; g.add(cap);
  g.position.set(-8.5, 0, -24); g.scale.setScalar(.9); seaGroup.add(g);
}
const buoys = [];
for (const [x, z, c] of [[-7, -14, "#ff5a5a"], [8, -18, "#ffd23f"], [3, -26, "#ff5a5a"]]) {
  const g = new THREE.Group();
  const b = new THREE.Mesh(new THREE.SphereGeometry(.32, 10, 8), toon(c)); g.add(b);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(.33, .33, .12, 10), toon("#ffffff")); g.add(band);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(.03, .03, .6, 5), toon("#ffffff")); pole.position.y = .45; g.add(pole);
  g.position.set(x, .05, z); seaGroup.add(g); buoys.push(g);
}
// 움직이지 않는 풍경 조각(나무·바위·부들·꽃…)을 색을 꼭짓점에 담아 한 덩어리로 합친다: 그리는 횟수 수백 번 → 몇 번(크롬북용)
function bake(group, skip = new Set()) {
  group.updateMatrixWorld(true);
  const inv = group.matrixWorld.clone().invert(), buckets = new Map(), dead = [];
  group.traverse((o) => {
    if (!o.isMesh || Array.isArray(o.material) || !o.material.isMeshToonMaterial || o.material.map) return;
    for (let p = o; p && p !== group; p = p.parent) if (skip.has(p)) return;
    const m = o.material, key = `${m.side}|${m.emissive.getHexString()}|${m.emissiveIntensity}`;
    const g = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone());
    for (const k of Object.keys(g.attributes)) if (k !== "position" && k !== "normal") g.deleteAttribute(k);
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    const n = g.attributes.position.count, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) col.set([m.color.r, m.color.g, m.color.b], i * 3);
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    if (!buckets.has(key)) buckets.set(key, { m, gs: [] });
    buckets.get(key).gs.push(g); dead.push(o);
  });
  for (const o of dead) o.removeFromParent();
  for (const { m, gs } of buckets.values()) {
    const mesh = new THREE.Mesh(mergeGeometries(gs), toon("#ffffff", { vertexColors: true, side: m.side, emissive: m.emissive, emissiveIntensity: m.emissiveIntensity }));
    group.add(mesh);
  }
  // 빈 묶음 정리
  const empty = []; group.traverse((o) => { if (o !== group && !o.isMesh && !o.children.length) empty.push(o); }); empty.forEach((o) => o.removeFromParent());
}
bake(pondGroup); bake(seaGroup, new Set(buoys)); bake(deck);
const PLACE_LOOK = {
  fresh: { sky: "#9fdcf0", fog: [22, 42], sea: 0 },
  sea: { sky: "#86cdf7", fog: [34, 95], sea: 1 },
};
function setPlace(place) {
  PLACE = place;
  const L = PLACE_LOOK[place];
  pondGroup.visible = place === "fresh"; seaGroup.visible = place === "sea";
  SKY.set(L.sky); scene.fog.color.copy(SKY); scene.fog.near = L.fog[0]; scene.fog.far = L.fog[1];
  waterMat.uniforms.sea.value = L.sea;
  BGM.song = SONGS[place]; BGM.step = 0;
}

// ------------------------------------------------------------------ 입자
function makePoints(n, size) {
  const pos = new Float32Array(n * 3).fill(-99), col = new Float32Array(n * 3).fill(1);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  const pts = new THREE.Points(g, new THREE.PointsMaterial({ size, vertexColors: true, sizeAttenuation: true }));
  pts.frustumCulled = false; scene.add(pts);
  return { n, pos, col, g, vel: new Float32Array(n * 3), life: new Float32Array(n), next: 0 };
}
const drops = makePoints(400, 0.13);
const WHITE = new THREE.Color("#f4fbff");
function splash(x, z, n, power = 1, color = WHITE, y = .05) {
  for (let i = 0; i < n; i++) {
    const k = drops.next++ % drops.n;
    drops.pos.set([x + rand(-.25, .25), y, z + rand(-.25, .25)], k * 3);
    drops.vel.set([rand(-1.8, 1.8) * power, rand(1.8, 4.5) * power, rand(-1.8, 1.8) * power], k * 3);
    drops.col.set([color.r, color.g, color.b], k * 3); drops.life[k] = rand(.4, .9);
  }
}
function stepDrops(dt) {
  const P = drops;
  for (let k = 0; k < P.n; k++) {
    if (P.life[k] <= 0) { P.pos[k * 3 + 1] = -99; continue; }
    P.life[k] -= dt; P.vel[k * 3 + 1] -= 10 * dt;
    for (let a = 0; a < 3; a++) P.pos[k * 3 + a] += P.vel[k * 3 + a] * dt;
  }
  P.g.attributes.position.needsUpdate = true; P.g.attributes.color.needsUpdate = true;
}
const ringGeo = new THREE.RingGeometry(.86, 1, 32);
const rings = [];
function ripple(x, z, size = 1, color = "#effffb", life = .9) {
  const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .85, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.set(x, .035, z); scene.add(m);
  rings.push({ m, age: 0, size, life });
}
function stepRings(dt) {
  for (let i = rings.length - 1; i >= 0; i--) {
    const r = rings[i]; r.age += dt;
    r.m.scale.setScalar(.1 + (r.age / r.life) * 1.3 * r.size);
    r.m.material.opacity = Math.max(0, .85 * (1 - r.age / r.life));
    if (r.age > r.life) { scene.remove(r.m); r.m.material.dispose(); rings.splice(i, 1); }
  }
}

// 거품: 반짝이는 공 (등급 색, 무지개는 색이 돈다)
const BUBBLES = 420;
const bubbleMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshToonMaterial({ gradientMap: grad, transparent: true, opacity: .9, emissive: "#ffffff", emissiveIntensity: .3 }), BUBBLES);
bubbleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); bubbleMesh.frustumCulled = false; scene.add(bubbleMesh);
const bub = Array.from({ length: BUBBLES }, () => ({ life: 1, max: 1, x: 0, y: -9, z: 0, vy: 0, s: .1, c: new THREE.Color(), rainbow: false, hue: 0 }));
let bubNext = 0;
const tmpM = new THREE.Matrix4(), tmpC = new THREE.Color();
function emitBubble(x, z, size, color, rainbow) {
  const b = bub[bubNext++ % BUBBLES];
  Object.assign(b, { life: 0, max: rand(.7, 1.3), x, z, y: -.12, vy: rand(.18, .35), s: size * rand(.6, 1.2), rainbow, hue: rand(0, 1) });
  b.c.set(color === "rainbow" ? "#ffffff" : color);
}
function stepBubbles(dt, t) {
  let live = 0; // 살아 있는 거품만 앞쪽 칸에 모아 그 수만큼만 그린다(크롬북용)
  for (let i = 0; i < BUBBLES; i++) {
    const b = bub[i];
    if (b.life >= b.max) continue;
    b.life += dt; b.y = Math.min(.06, b.y + b.vy * dt);
    const k = b.life / b.max, pop = k > .85 ? 1 + (k - .85) * 4 : 1;
    const s = b.s * Math.min(1, k * 4) * pop * (1 + Math.sin(t * 12 + i) * .06);
    tmpM.makeScale(s, s * .8, s).setPosition(b.x, b.y, b.z);
    bubbleMesh.setMatrixAt(live, tmpM);
    if (b.rainbow) tmpC.setHSL((b.hue + t * .6) % 1, .9, .65); else tmpC.copy(b.c);
    bubbleMesh.setColorAt(live, tmpC); live++;
  }
  bubbleMesh.count = live; bubbleMesh.visible = live > 0;
  bubbleMesh.instanceMatrix.needsUpdate = true;
  if (bubbleMesh.instanceColor) bubbleMesh.instanceColor.needsUpdate = true;
}

// ------------------------------------------------------------------ 거품 자리
const spots = [];
const glowGeo = new THREE.CircleGeometry(1, 32);
function spotPos() {
  for (let tries = 0; tries < 40; tries++) {
    const a = rand(Math.PI * 1.05, Math.PI * 1.95), k = rand(.25, .78), p = pondPoint(a, k);
    if (p.y > DECK_Z - 3.2) continue; // 데크 바로 앞은 비운다
    if (PLACE === "sea" && p.y > seaFront(p.x) - 1.6) continue; // 바다: 만 양쪽 모래밭 위는 안 된다
    if (spots.every((s) => Math.hypot(s.x - p.x, s.z - p.y) > 3.4)) return p;
  }
  return new THREE.Vector2(rand(-2, 2), POND.z - rand(0, 3));
}
function rollType() {
  if (G.fever > 0) return pick(FEVER_TYPES);
  let sum = 0; for (const k in SPOT_TYPES) sum += SPOT_TYPES[k].weight;
  let r = Math.random() * sum;
  for (const k in SPOT_TYPES) { r -= SPOT_TYPES[k].weight; if (r <= 0) return k; }
  return "white";
}
// 물고기 그림자: 몸·꼬리·지느러미를 그린 흐린 실루엣. 꼬리 쪽이 정점 셰이더로 살랑인다
const shadowTex = (() => {
  const cv = document.createElement("canvas"); cv.width = 256; cv.height = 128;
  const c = cv.getContext("2d"); c.filter = "blur(5px)"; c.fillStyle = "#fff";
  c.beginPath(); c.ellipse(140, 64, 82, 30, 0, 0, Math.PI * 2); c.fill();                   // 몸
  c.beginPath(); c.moveTo(70, 64); c.lineTo(18, 26); c.quadraticCurveTo(34, 64, 18, 102); c.closePath(); c.fill(); // 갈라진 꼬리
  c.beginPath(); c.moveTo(118, 38); c.quadraticCurveTo(140, 14, 170, 36); c.closePath(); c.fill(); // 등지느러미
  c.beginPath(); c.moveTo(150, 86); c.quadraticCurveTo(140, 112, 120, 104); c.lineTo(132, 88); c.closePath(); c.fill(); // 가슴지느러미
  c.beginPath(); c.moveTo(150, 42); c.quadraticCurveTo(140, 16, 120, 24); c.lineTo(132, 40); c.closePath(); c.fill();
  c.beginPath(); c.ellipse(210, 64, 22, 24, 0, 0, Math.PI * 2); c.fill();                   // 둥근 머리
  const t = new THREE.CanvasTexture(cv); return t;
})();
const shadowGeo = new THREE.PlaneGeometry(2, 1, 12, 1);
function makeShadow(s, len) {
  const mat = new THREE.MeshBasicMaterial({ color: "#06121f", alphaMap: shadowTex, transparent: true, opacity: 0, depthWrite: false });
  const U = { uT: { value: 0 }, uAmp: { value: .18 } };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = "uniform float uT; uniform float uAmp;\n" + sh.vertexShader.replace("#include <begin_vertex>",
      "#include <begin_vertex>\n float tailK = clamp(-position.x * .6 + .4, 0., 1.);\n transformed.y += sin(position.x * 2.6 - uT) * uAmp * tailK;");
  };
  const m = new THREE.Mesh(shadowGeo, mat);
  m.rotation.x = -Math.PI / 2; m.scale.set(len / 2, len / 2, 1); m.position.set(s.x, .012, s.z); scene.add(m);
  s.shadow = m; s.shU = U; s.sh = { x: s.x, z: s.z, head: rand(0, Math.PI * 2), ph: rand(0, 9), len, swim: 0 };
}
function stepShadow(s, dt, t, fade) {
  const sh = s.sh, mine = R.spot === s, chasing = mine && ["waiting", "nibble", "bite"].includes(R.state);
  let tx, tz;
  if (chasing) { tx = R.target.x - Math.cos(sh.head) * sh.len * .4; tz = R.target.z + Math.sin(sh.head) * sh.len * .4; } // 찌 쪽으로 머리를 들이민다
  else { const r = s.boss ? 1.4 : .8 + sh.len * .2; tx = s.x + Math.cos(t * .45 + sh.ph) * r; tz = s.z + Math.sin(t * .31 + sh.ph * 1.7) * r * .7; }
  const dx = tx - sh.x, dz = tz - sh.z, d = Math.hypot(dx, dz), sp = chasing ? 1.3 : .5;
  if (d > .05) {
    const want = Math.atan2(-dz, dx); let dh = want - sh.head; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    sh.head += dh * Math.min(1, dt * 2.5);
    const v = Math.min(d, sp * dt); sh.x += Math.cos(sh.head) * v; sh.z -= Math.sin(sh.head) * v; sh.swim = Math.min(1, v / dt / sp);
  }
  if (R.state === "bite" && mine) sh.swim = 2; // 물었을 때 퍼덕
  s.shU.uT.value += dt * (4 + sh.swim * 6); s.shU.uAmp.value = .1 + sh.swim * .1;
  s.shadow.position.set(sh.x, .012, sh.z); s.shadow.rotation.z = sh.head;
  const hide = mine && (F || show || R.state === "fight");
  s.shadow.material.opacity = hide ? 0 : fade * (s.boss ? .6 : .4);
}
function newSpot(type = rollType()) {
  const T = SPOT_TYPES[type], p = spotPos();
  const glow = new THREE.Mesh(glowGeo, new THREE.MeshBasicMaterial({ color: T.color === "rainbow" ? "#ffffff" : T.color, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.rotation.x = -Math.PI / 2; glow.position.set(p.x, .025, p.y); scene.add(glow);
  const s = { x: p.x, z: p.y, type, T, fake: Math.random() < (T.fake || 0), age: 0, life: rand(...T.life), glow, busy: false };
  if (type !== "boss") { // 어떤 물고기가 숨어 있는지 미리 정해 두고, 그림자 크기로 보여 준다(꽝도 그럴듯한 그림자)
    s.species = pickSpecies(s.fake ? FAKE_TABLE : T.table); s.sizeT = Math.random();
    makeShadow(s, clamp(SPECIES[s.species].disp, .45, 3) * (.75 + .5 * s.sizeT) * 1.1);
  }
  spots.push(s);
  return s;
}
function removeSpot(s) { const i = spots.indexOf(s); if (i >= 0) spots.splice(i, 1); scene.remove(s.glow); s.glow.material.dispose(); if (s.shadow) { scene.remove(s.shadow); s.shadow.material.dispose(); } }
function resetSpots() { while (spots.length) removeSpot(spots[0]); newSpot("white"); newSpot("blue"); newSpot(); }
function stepSpots(dt, t) {
  if (spots.length < 3 || (spots.length < 4 && Math.random() < dt * .03)) newSpot();
  for (const s of [...spots]) {
    if (!s.busy) s.age += dt;
    const T = s.T, left = s.life - s.age;
    const fade = Math.min(1, s.age / 1.2, Math.max(0, left / 1.5));
    const pulse = .75 + .25 * Math.sin(t * (s.fake ? 7 : 3) + s.x);
    s.glow.material.opacity = fade * (s.type === "white" ? .18 : .32) * pulse;
    if (T.color === "rainbow") s.glow.material.color.setHSL((t * .5) % 1, .9, .6);
    s.glow.scale.setScalar(T.r * (1 + .06 * Math.sin(t * 2)));
    // 진짜 거품: 잔거품이 끊임없이 + 물결. 가짜: 큰 거품이 띄엄띄엄, 물결 없음
    const rate = (s.fake ? T.rate * .4 : T.rate) * fade;
    if (Math.random() < dt * rate) {
      const a = rand(0, Math.PI * 2), d = rand(0, T.r * .75);
      emitBubble(s.x + Math.cos(a) * d, s.z + Math.sin(a) * d, (s.fake ? .3 : .15 + (s.type === "white" ? 0 : .07)) * rand(.8, 1.4), T.color, T.color === "rainbow");
    }
    if (!s.fake && Math.random() < dt * (s.type === "white" ? .8 : 1.5) * fade) ripple(s.x + rand(-.3, .3), s.z + rand(-.3, .3), T.r * .6, T.color === "rainbow" ? "#ffffff" : "#effffb", 1);
    if (s.shadow) stepShadow(s, dt, t, fade);
    if (s.boss) { // 보스: 빨간 소용돌이와 물결
      s.glow.material.opacity = fade * (.35 + .25 * Math.sin(t * 6));
      if (Math.random() < dt * 3) ripple(s.x + rand(-1, 1), s.z + rand(-1, 1), 1.4, "#ffd0d8", 1.2);
    }
    if (left <= 0 && !s.busy) removeSpot(s);
  }
}
function spotAt(x, z) {
  let best = null;
  for (const s of spots) { const d = Math.hypot(s.x - x, s.z - z); if (d < s.T.r * 1.5 && (!best || d < best.d)) best = { s, d }; }
  return best?.s ?? null;
}

// ------------------------------------------------------------------ 낚시꾼
const angler = new THREE.Group(); angler.position.copy(STAND); scene.add(angler);
const body = new THREE.Group(); angler.add(body); // 기울기·점프용
const HAND = new THREE.Vector3(0.12, 0.62, -0.32); // 몸 기준 손 위치(모델 불러오면 다시 정함)
function voxelAngler() { // 모델을 못 불러왔을 때 쓰는 간단한 인형
  const g = new THREE.Group();
  const add = (geo, c, x, y, z) => { const m = new THREE.Mesh(geo, toon(c)); m.position.set(x, y, z); g.add(m); return m; };
  add(new THREE.CapsuleGeometry(.24, .35, 4, 10), "#ffc23a", 0, .55, 0);
  add(new THREE.SphereGeometry(.25, 14, 10), "#f6d0aa", 0, 1.02, 0);
  add(new THREE.CylinderGeometry(.34, .34, .05, 16), "#9aa35a", 0, 1.2, 0);
  add(new THREE.SphereGeometry(.2, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), "#9aa35a", 0, 1.18, 0);
  add(new THREE.CapsuleGeometry(.09, .2, 3, 8), "#3c6fd0", -.1, .14, 0); add(new THREE.CapsuleGeometry(.09, .2, 3, 8), "#3c6fd0", .1, .14, 0);
  add(new THREE.CapsuleGeometry(.07, .3, 3, 8), "#ffc23a", -.14, .62, -.2).rotation.x = 1.2; add(new THREE.CapsuleGeometry(.07, .3, 3, 8), "#ffc23a", .14, .62, -.2).rotation.x = 1.2;
  return g;
}
let anglerModel = voxelAngler(); body.add(anglerModel);
const A = { lean: 0, side: 0, jump: 0, vy: 0, kick: 0, slump: 0, cast: 0 };

// 낚싯대 (손에서 이어지는 휘는 막대) · 찌 · 줄
const rodSegs = Array.from({ length: 14 }, (_, k) => {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(.03 - k * .0015, .034 - k * .0015, 1, 6), toon(k > 11 ? "#ff4d6d" : k % 4 === 0 ? "#3a2a20" : "#5a3c26"));
  scene.add(m); return m;
});
const bobber = new THREE.Group();
bobber.add(new THREE.Mesh(new THREE.SphereGeometry(.12, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), toon("#ff3b4a")));
bobber.add(new THREE.Mesh(new THREE.SphereGeometry(.12, 10, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), toon("#ffffff")));
const stick = new THREE.Mesh(new THREE.CylinderGeometry(.015, .015, .2, 5), toon("#ff3b4a")); stick.position.y = .14; bobber.add(stick);
bobber.visible = false; scene.add(bobber);
const lineGeo = new THREE.BufferGeometry().setFromPoints(Array.from({ length: 24 }, () => new THREE.Vector3()));
const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: "#ffffff" })); line.frustumCulled = false; scene.add(line);
const rod = { tip: new THREE.Vector3() };
const rodBuzz = new THREE.Vector2(); // 낚싯대 끝 떨림
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
const _p0 = new THREE.Vector3(), _p1 = new THREE.Vector3(), _ctrl = new THREE.Vector3(), _tip = new THREE.Vector3();
function placeRod(hand, dirOut, pullTo, bend) {
  // 손에서 앞·위로 뻗은 낚싯대를 줄 쪽으로 휜다 (이차 곡선)
  const L = 2.6;
  _tip.copy(hand).addScaledVector(dirOut, L).lerp(pullTo, clamp(bend, 0, 1.3) * .5);
  _tip.y -= clamp(bend, 0, 1.3) * .6; // 휘면 끝이 아래로 처진다
  _tip.x += rodBuzz.x; _tip.y += rodBuzz.y;
  _ctrl.copy(hand).addScaledVector(dirOut, L * (.62 - clamp(bend, 0, 1.3) * .12));
  rod.tip.copy(_tip);
  const P = (u, out) => out.set(
    (1 - u) ** 2 * hand.x + 2 * (1 - u) * u * _ctrl.x + u * u * _tip.x,
    (1 - u) ** 2 * hand.y + 2 * (1 - u) * u * _ctrl.y + u * u * _tip.y,
    (1 - u) ** 2 * hand.z + 2 * (1 - u) * u * _ctrl.z + u * u * _tip.z);
  rodSegs.forEach((m, k) => {
    P(k / rodSegs.length, _p0); P((k + 1) / rodSegs.length, _p1);
    m.position.copy(_p0).add(_p1).multiplyScalar(.5);
    m.scale.y = _p0.distanceTo(_p1) + .01;
    m.quaternion.setFromUnitVectors(_up, _d.copy(_p1).sub(_p0).normalize());
  });
}
function drawLine(to, slack) {
  const pts = lineGeo.attributes.position;
  for (let k = 0; k < 24; k++) {
    const u = k / 23;
    _a.lerpVectors(rod.tip, to, u); _a.y -= Math.sin(u * Math.PI) * slack;
    pts.setXYZ(k, _a.x, Math.max(_a.y, .02), _a.z);
  }
  pts.needsUpdate = true;
}

// ------------------------------------------------------------------ 물고기 모델 (Tripo) + 셰이더 휘기
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder); // 모델은 meshopt 압축 + webp 텍스처(받는 양 줄이기)
const models = {};
const BEND_GLSL = `
  vec4 fp = uFish * vec4(transformed, 1.0);
  #ifdef FISH_OUTLINE
  fp.xyz += normalize(mat3(uFish) * normal) * 0.005; // 외곽선: 물고기 좌표(길이 1)에서 두께를 정해 모델 압축(양자화)과 상관없이 같은 굵기
  #endif
  float ft = clamp(fp.x + 0.5, 0.0, 1.0);
  float fs = 1.0 - ft;
  float fc = abs(ft - 0.5) * 2.0;
  fp.z += uBend.z * (fc * fc - 0.35) + uBend.y * fs * fs * sin(uBend.x - fs * 3.2) + uBend.w * ft * ft * sin(uBend.x + 1.2);
  transformed = (uFishInv * fp).xyz;
`;
function bendMaterial(base, U, outline) {
  const m = outline
    ? new THREE.MeshBasicMaterial({ color: "#2a1408", side: THREE.BackSide })
    : new THREE.MeshToonMaterial({ map: base.map, color: base.map ? "#ffffff" : base.color, gradientMap: grad });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uBend = U.bend; sh.uniforms.uFish = U.fish; sh.uniforms.uFishInv = U.fishInv;
    sh.vertexShader = "uniform vec4 uBend; uniform mat4 uFish; uniform mat4 uFishInv;\n" + sh.vertexShader.replace("#include <project_vertex>",
      (outline ? "#define FISH_OUTLINE\n" : "") + BEND_GLSL + "#include <project_vertex>");
  };
  m.customProgramCacheKey = () => (outline ? "fish-outline" : "fish-toon");
  return m;
}
function bodyPoints(root, step = 9) {
  const out = [], v = new THREE.Vector3();
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (!o.isMesh) return;
    const pos = o.geometry.attributes.position;
    for (let i = 0; i < pos.count; i += step) { v.fromBufferAttribute(pos, i); if (o.isSkinnedMesh) o.applyBoneTransform(i, v); out.push(v.applyMatrix4(o.matrixWorld).clone()); }
  });
  return out;
}
async function loadFish(id, file, yaw = 0, roll = 0, spin = 0) {
  const gltf = await loader.loadAsync(file);
  const root = gltf.scene, holder = new THREE.Group(), turn = new THREE.Group();
  turn.add(root); holder.add(turn);
  root.traverse((o) => { if (o.isMesh && o.material.map) { o.material.map.magFilter = THREE.NearestFilter; o.material.map.colorSpace = THREE.SRGBColorSpace; } });
  turn.rotation.set(THREE.MathUtils.degToRad(roll), THREE.MathUtils.degToRad(yaw), THREE.MathUtils.degToRad(spin), "YXZ"); // 머리 +x (모델마다 눈으로 확인한 값)
  const size = new THREE.Box3().setFromPoints(bodyPoints(holder)).getSize(new THREE.Vector3());
  turn.scale.setScalar(1 / Math.max(size.x, 1e-3));
  const box2 = new THREE.Box3().setFromPoints(bodyPoints(holder));
  turn.position.sub(box2.getCenter(new THREE.Vector3()));
  models[id] = { holder, half: box2.getSize(new THREE.Vector3()).multiplyScalar(.5) };
}
// 낚시꾼: 바탕 몸(반팔·반바지) 위에 옷 껍데기(비옷·조끼·장화)와 아이템(모자·안경·배낭…)을 입힌다(avatar.js)
// 머리카락 색만 바탕 몸 셰이더에서 바꾼다(머리 높이의 갈색. 눈은 거의 검정이라 빠지고, 눈썹은 머리색을 따라간다)
// 모자를 쓰면 모자 아랫단(cut)보다 위의 머리를 그 모자의 실제 안쪽 공간(반타원체, hatCavity로 잰 것) 안으로 끌어당긴다
// 머리 모양(포니테일·삐친 머리)이 어떻든 모자 겉면을 뚫지 않는다. 아랫단 아래(뒤로 내려온 포니테일·옆머리)는 그대로 둔다
const HAIR = { on: { value: 0 }, col: { value: new THREE.Color() }, ref: { value: new THREE.Color() }, toBody: { value: new THREE.Matrix4() }, fromBody: { value: new THREE.Matrix4() },
  cut: { value: 1e9 }, cav: { value: new THREE.Vector3() }, rad: { value: new THREE.Vector3(1, 1, 1) }, band: { value: .02 } };
// 머리카락 칠할 곳: 정수리 텍스처 색(= 그 모델의 머리색)과 비슷한 색인 꼭짓점만 hairW=1 (모델이 바뀌어도 그대로 맞는다). 눈·피부는 색이 달라 빠지고, 눈썹은 머리색을 따라간다
function hairMask(mesh, toBody, H) {
  const g = mesh.geometry, uv = g.attributes.uv, pos = g.attributes.position, n = pos.count, w = new Float32Array(n), img = mesh.material.map?.image, ref = new THREE.Color(.35, .22, .14);
  g.setAttribute("hairW", new THREE.BufferAttribute(w, 1));
  if (!img || !uv) return ref;
  const S = 256, cv = document.createElement("canvas"); cv.width = cv.height = S;
  const cx = cv.getContext("2d", { willReadFrequently: true }); cx.drawImage(img, 0, 0, S, S); const px = cx.getImageData(0, 0, S, S).data;
  const at = (i) => { const u = uv.getX(i) - Math.floor(uv.getX(i)), v = uv.getY(i) - Math.floor(uv.getY(i)), k = ((Math.min(S - 1, v * S | 0)) * S + Math.min(S - 1, u * S | 0)) * 4; return [px[k] / 255, px[k + 1] / 255, px[k + 2] / 255]; };
  const yb = new Float32Array(n), v = new THREE.Vector3();
  let top = 0; for (let i = 0; i < n; i++) { yb[i] = v.fromBufferAttribute(pos, i).applyMatrix4(toBody).y; top = Math.max(top, yb[i]); }
  const acc = [0, 0, 0]; let m = 0;
  for (let i = 0; i < n; i++) if (yb[i] > top - H * .04) { const c = at(i); acc[0] += c[0]; acc[1] += c[1]; acc[2] += c[2]; m++; }
  if (m) ref.setRGB(acc[0] / m, acc[1] / m, acc[2] / m);
  // 정수리에서 시작해 머리색 꼭짓점끼리 이어진 곳만 칠한다(피부에 둘러싸인 눈동자·눈썹은 닿지 않는다)
  const ok = new Uint8Array(n); for (let i = 0; i < n; i++) if (yb[i] > H * .3) { const c = at(i); ok[i] = Math.hypot(c[0] - ref.r, c[1] - ref.g, c[2] - ref.b) < .22 ? 1 : 0; }
  const same = new Map(), root = new Int32Array(n);
  for (let i = 0; i < n; i++) { v.fromBufferAttribute(pos, i); const k = `${Math.round(v.x * 3000)},${Math.round(v.y * 3000)},${Math.round(v.z * 3000)}`; if (!same.has(k)) same.set(k, i); root[i] = same.get(k); }
  const adj = Array.from({ length: n }, () => []), I = g.index ? g.index.array : null, T = I ? I.length : n;
  for (let t = 0; t < T; t += 3) { const a = root[I ? I[t] : t], b2 = root[I ? I[t + 1] : t + 1], c2 = root[I ? I[t + 2] : t + 2]; adj[a].push(b2, c2); adj[b2].push(a, c2); adj[c2].push(a, b2); }
  const seen = new Uint8Array(n), q = [];
  for (let i = 0; i < n; i++) if (ok[i] && yb[i] > top - H * .05 && !seen[root[i]]) { seen[root[i]] = 1; q.push(root[i]); }
  while (q.length) { const i = q.pop(); for (const j of adj[i]) if (!seen[j] && ok[j]) { seen[j] = 1; q.push(j); } }
  for (let i = 0; i < n; i++) if (seen[root[i]] && ok[i]) w[i] = 1;
  return ref; // sRGB 0~1
}
function hairShader(mesh) {
  mesh.material.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { hairOn: HAIR.on, hairCol: HAIR.col, hairRef: HAIR.ref, toBody: HAIR.toBody, fromBody: HAIR.fromBody, hatCut: HAIR.cut, hatCav: HAIR.cav, hatRad: HAIR.rad, hatBand: HAIR.band });
    sh.vertexShader = "uniform mat4 toBody, fromBody; uniform float hatCut, hatBand; uniform vec3 hatCav, hatRad; attribute float hairW; varying float vHairW;\n" + sh.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>
      vHairW = hairW;
      vec3 vB = (toBody * vec4(position, 1.)).xyz;
      if (vB.y > hatCut - hatBand) {
        vec3 d = vB - hatCav; d.y = max(d.y, 0.); // 아랫단 아래는 옆으로만
        float L = length(d / hatRad), k = smoothstep(hatCut - hatBand, hatCut, vB.y);
        if (L > 1.) {
          vec3 q = hatCav + d / L; q.y = vB.y > hatCut ? q.y : vB.y;
          transformed = (fromBody * vec4(mix(vB, q, k), 1.)).xyz;
        }
      }`);
    sh.fragmentShader = `uniform float hairOn; uniform vec3 hairCol, hairRef; varying float vHairW;
      ` + sh.fragmentShader.replace("#include <map_fragment>", `#include <map_fragment>
      if (hairOn > .5 && vHairW > .2) {
        vec3 s = pow(max(diffuseColor.rgb, vec3(0.)), vec3(1. / 2.2));
        float k = (1. - smoothstep(.15, .25, distance(s, hairRef))) * smoothstep(.2, .7, vHairW);
        float l = dot(s, vec3(.3, .59, .11)) / max(.05, dot(hairRef, vec3(.3, .59, .11)));
        k *= smoothstep(.4, .6, l); // 눈동자처럼 머리보다 훨씬 어두운 곳은 그대로
        diffuseColor.rgb = mix(diffuseColor.rgb, hairCol * clamp(l, .45, 1.6), k);
      }`).replace("#include <opaque_fragment>", `{ float ndv = clamp(dot(normalize(normal), normalize(vViewPosition)), 0., 1.); outgoingLight += vec3(1., .95, .88) * pow(1. - ndv, 3.) * .2; } // 테두리 빛
      #include <opaque_fragment>`);
  };
}
// 바탕 몸: 0 남자, 1 여자(단발머리가 어깨까지 와서 비옷·조끼를 그 아래·안쪽으로 자르고, 눈·입 높이가 다르다)
const BASES = [ // 실제 아이 비율(머리가 키의 1/5). land: 기준(2등신) 몸 높이 → 이 몸 높이 표(avatar.js landY)
  { file: "assets/avatar/boy4.glb?v=1", yaw: 90, prof: { land: [[0, 0], [.2, .3], [.45, .8], [1, 1]], fistY: [.6, .74], fistR: .03, fistK: .55, coatLo: .26, vestW: .1, vestK: .6, vestFront: -9, bootTop: .17, decoK: 1.5, itemK: .7 }, hatDrop: -.035, hatK: 1.12, eye: .895, mouth: .84 },
  { file: "assets/avatar/girl4.glb?v=1", yaw: 90, prof: { land: [[0, 0], [.2, .32], [.45, .74], [1, 1]], fistY: [.55, .69], fistR: .03, fistK: .55, coatLo: .28, vestW: .1, vestK: .6, vestFront: -9, bootTop: .17, decoK: 1.5, itemK: .7 }, hatDrop: -.035, hatK: 1.12, skullTop: .955, eye: .85, mouth: .8 } // 여자: 머리 묶음이 정수리 위로 솟아 왕관·토끼 귀는 머리통 꼭대기(skullTop)에,
];
const baseCache = {};
function loadBase(i) {
  return baseCache[i] ??= loader.loadAsync(BASES[i].file).then((gltf) => {
    const root = gltf.scene, turn = new THREE.Group(); turn.add(root);
    let mesh = null;
    root.traverse((o) => { if (o.isMesh) { const m = o.material; if (m.map) m.map.colorSpace = THREE.SRGBColorSpace; o.material = new THREE.MeshToonMaterial({ map: m.map, color: m.map ? "#ffffff" : m.color, gradientMap: grad }); hairShader(o); mesh = o; } });
    turn.rotation.y = THREE.MathUtils.degToRad(BASES[i].yaw);
    const box = new THREE.Box3().setFromPoints(bodyPoints(turn));
    turn.scale.setScalar(1.35 / (box.max.y - box.min.y));
    const b2 = new THREE.Box3().setFromPoints(bodyPoints(turn));
    turn.position.set(-(b2.min.x + b2.max.x) / 2, -b2.min.y, -(b2.min.z + b2.max.z) / 2);
    // 몸 좌표(발바닥 0, 앞 -z)로 바꾸는 행렬 → 옷 껍데기·아이템 기준점
    turn.updateMatrix(); turn.updateMatrixWorld(true);
    const toBody = new THREE.Matrix4().multiplyMatrices(turn.matrix, new THREE.Matrix4().multiplyMatrices(new THREE.Matrix4().copy(turn.matrixWorld).invert(), mesh.matrixWorld));
    // 모델이 쥔 주먹 끝(가장 앞쪽 점)에서 우리 낚싯대가 이어진다
    let tip = null;
    for (const p of bodyPoints(turn, 3)) if (p.y > .3 && p.y < 1.1 && (!tip || p.z < tip.z)) tip = p;
    const S = analyze(mesh, toBody, BASES[i].prof);
    return { turn, toBody, S, hairRef: hairMask(mesh, toBody, S.A.H), shells: {}, hand: S.A.fists.length === 2 ? new THREE.Vector3((S.A.fists[0][0] + S.A.fists[1][0]) / 2, (S.A.fists[0][1] + S.A.fists[1][1]) / 2, Math.min(S.A.fists[0][2], S.A.fists[1][2])) : tip ? tip.clone().add(new THREE.Vector3(0, 0, .02)) : new THREE.Vector3(0.05, .62, -.4) }; // 낚싯대는 두 주먹 사이
  });
}
async function loadAngler(i = 0) {
  AVA.want = i;
  const b = await loadBase(i);
  if (AVA.want !== i) return; // 받는 사이 다른 몸을 골랐으면 그쪽이 이어서 입힌다
  body.remove(anglerModel); anglerModel = b.turn; body.add(b.turn);
  AVA.base = i; AVA.S = b.S; AVA.shells = b.shells; HAND.copy(b.hand);
  const A = b.S.A, B = BASES[i];
  HAIR.toBody.value.copy(b.toBody); HAIR.fromBody.value.copy(b.toBody).invert(); 
  HAIR.ref.value.copy(b.hairRef);
  applyGear(GEAR.me); // 몸이 바뀌면 옷도 다시 맞춘다
}

// 아이템(Tripo, assets/avatar/<id>.glb): 처음 입을 때 받아 두고 다시 쓴다
// yaw: 앞이 -z(낚시꾼 앞)가 되게 돌리는 각도. at: 붙이는 자리, w: 너비(머리·몸통 너비 배수 또는 m), 나머지는 자리별 미세 조정
const ITEM_FIT = {
  // 모자: line=모자 아랫단 높이(기준 몸 키 배수). 머리는 모자 안쪽 공간(hatCavity)으로 저절로 들어간다
  hat_bucket: { at: "head", w: .92, line: .8 },
  hat_straw: { at: "head", w: 1.3, line: .83 }, // base: 턱끈처럼 아랫단보다 아래로 늘어진 몫
  hat_beanie: { at: "head", w: .88, line: .79 },
  hat_pirate: { at: "head", w: 1.05, line: .8, yaw: 90 },
  crown: { at: "head", w: .55, sink: .2 },
  cap: { at: "head", w: .82, line: .8, yaw: 90, z: -.04 },
  flower: { at: "pin", w: .2, yaw: 90 },
  bunny: { at: "head", w: .8, sink: .3, yaw: 90 },
  glasses: { at: "face", w: .62, yaw: 90 },
  roundglasses: { at: "face", w: .62, yaw: 90 },
  mustache: { at: "mouth", w: .3, yaw: 90 },
  backpack: { at: "back", w: .34, yaw: -90 },
  flag: { at: "pole", w: .38, yaw: -90 },
  wings: { at: "wings", w: .8, yaw: 90 },
  cape: { at: "cape", w: .46 },
  chair: { at: "deck", w: .52 }, fire: { at: "deck", w: .5 }, cooler: { at: "deck", w: .42 }, lantern: { at: "deck", w: .2 }, cat: { at: "deck", w: .32, yaw: 90 },
};
const ITEM_V2 = new Set(["hat_bucket", "hat_straw", "hat_beanie", "hat_pirate", "crown", "cap", "flower", "bunny", "glasses", "roundglasses", "mustache", "backpack", "wings", "cape"]); // Tripo v3 정밀로 다시 만든 것
const AVA = { base: -1, want: -1, S: null, shells: {}, items: {}, loading: {} };
function itemModel(id) {
  if (!ITEM_FIT[id]) return Promise.resolve(null);
  return AVA.loading[id] ??= loader.loadAsync(`assets/avatar/${id}.glb?v=${ITEM_V2.has(id) ? 2 : 1}`).then((g) => {
    const turn = new THREE.Group(); turn.add(g.scene);
    g.scene.traverse((o) => { if (o.isMesh) { const m = o.material; if (m.map) m.map.colorSpace = THREE.SRGBColorSpace; o.material = new THREE.MeshToonMaterial({ map: m.map, color: m.map ? "#ffffff" : m.color, gradientMap: grad }); } });
    turn.rotation.y = THREE.MathUtils.degToRad(ITEM_FIT[id].yaw || 0);
    const box = new THREE.Box3().setFromPoints(bodyPoints(turn, 1)), sz = box.getSize(new THREE.Vector3());
    const k = 1 / Math.max(sz.x, 1e-3); turn.scale.setScalar(k);
    const b2 = new THREE.Box3().setFromPoints(bodyPoints(turn, 1));
    turn.position.set(-(b2.min.x + b2.max.x) / 2, -b2.min.y, -(b2.min.z + b2.max.z) / 2); // 바닥 가운데가 원점, 너비 1
    const holder = new THREE.Group(); holder.add(turn);
    AVA.items[id] = { holder, size: b2.getSize(new THREE.Vector3()) };
    if (ITEM_FIT[id].line) AVA.items[id].cav = hatCavity(holder, AVA.items[id].size, ITEM_FIT[id].base || 0);
    return AVA.items[id];
  }).catch((e) => { console.warn("아이템", id, e); return null; });
}
// 모자 안쪽 공간 재기(너비 1 기준): 아랫단 조금 위 가운데에서 사방·위로 광선을 쏴 처음 닿는 벽까지 = 반타원체(가운데 x,z·반지름 rx,ry,rz)
// 속이 막힌 모델이어도 겉벽에서 멈추니 그대로 쓸 수 있다. 챙·턱끈이 아니라 정수리 쪽 벽을 재려고 아랫단보다 조금 위에서 잰다
function hatCavity(holder, sz, base) {
  holder.updateMatrixWorld(true);
  const meshes = []; holder.traverse((o) => { if (o.isMesh) { o.material.side = THREE.DoubleSide; meshes.push(o); } });
  const rc = new THREE.Raycaster(), yo = sz.y * base, y0 = yo + (sz.y - yo) * .12, o = new THREE.Vector3(), dir = new THREE.Vector3();
  const hit = (x, y, z, dx, dy, dz, miss) => { rc.set(o.set(x, y, z), dir.set(dx, dy, dz).normalize()); const h = rc.intersectObjects(meshes, false)[0]; return h ? h.distance : miss; };
  const px = hit(0, y0, 0, 1, 0, 0, .5), nx = hit(0, y0, 0, -1, 0, 0, .5), pz = hit(0, y0, 0, 0, 0, 1, sz.z / 2), nz = hit(0, y0, 0, 0, 0, -1, sz.z / 2);
  const cx = (px - nx) / 2, cz = (pz - nz) / 2, rx = (px + nx) / 2, rz = (pz + nz) / 2;
  let ry = hit(cx, yo + .001, cz, 0, 1, 0, sz.y - yo); // 아랫단에서 정수리 안쪽까지
  // 대각선으로도 재서 둥근 정수리가 반타원체보다 좁으면 그만큼 낮춘다(챙 모자처럼 위가 좁은 모자)
  for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const ex = Math.cos(a) * rx * .7, ez = Math.sin(a) * rz * .7, d = hit(cx, yo + .001, cz, ex, ry * .7, ez, 1e3), want = Math.hypot(ex, ry * .7, ez);
    if (d < want) ry *= Math.max(.5, d / want);
  }
  holder.traverse((m) => { if (m.isMesh) m.material.side = THREE.FrontSide; });
  return { cx, cz, rx, ry, rz };
}
// 몸 기준 자리에 맞춰 복제해 놓는다. 아직 안 받았으면 받고 나서 옷을 다시 입힌다
function placeItem(id, parent, tint) {
  const it = AVA.items[id], f = ITEM_FIT[id], S = AVA.S;
  if (!it) { itemModel(id).then((r) => { if (r) applyGear(GEAR.me); }); return null; }
  const o = it.holder.clone(true), sz = it.size;
  if (tint) o.traverse((m) => { if (m.isMesh) { m.material = m.material.clone(); m.material.color.set(tint); } });
  if (!S) return null;
  const A = S.A, H = A.H, hd = A.head;
  let w = f.w, x = 0, y = 0, z = 0;
  if (f.at === "head") {
    w *= hd.w * (BASES[AVA.base].hatK || 1); x = hd.cx; z = hd.cz + (f.z || 0) * H;
    if (f.line) { // 모자 아랫단을 머리의 정해진 높이에 두고, 그 위 머리를 모자 안쪽 공간에 넣는다
      const line = A.Y(f.line) + H * (BASES[AVA.base].hatDrop || 0), below = sz.y * w * (f.base || 0); y = line - below;
      const c = it.cav, k = w * .9; // 안쪽 벽보다 10% 안쪽(모자 두께)
      HAIR.cut.value = line; HAIR.band.value = H * .05;
      HAIR.cav.value.set(x + c.cx * w, line, z + c.cz * w); HAIR.rad.value.set(c.rx * k, c.ry * k, c.rz * k);
    } else y = Math.min(hd.top, H * (BASES[AVA.base].skullTop || 1)) - sz.y * w * f.sink;
  }
  else if (f.at === "pin") { w *= H; x = hd.cx + hd.w * .26; y = A.Y(.86); z = hd.front + (hd.back - hd.front) * .45; o.rotation.z = -.5; }
  else if (f.at === "face") { w *= hd.w; x = hd.cx; const ey = H * BASES[AVA.base].eye; y = ey - sz.y * w / 2; z = A.frontAt(ey) - hd.w * .067 + sz.z * w / 2; }
  else if (f.at === "mouth") { w *= hd.w; x = hd.cx; const my = H * BASES[AVA.base].mouth; y = my - sz.y * w / 2; z = A.frontAt(my) - hd.w * .027 + sz.z * w / 2; }
  else if (f.at === "back") { w *= H * (BASES[AVA.base].prof.itemK ?? 1); y = A.Y(.27); z = A.torso.back + sz.z * w / 2 - H * .1; } // 앞쪽 멜빵은 몸속에 묻히게 붙인다
  else if (f.at === "pole") { w *= H; x = H * .08; y = A.Y(.3); z = A.torso.back + H * .03; }
  else if (f.at === "wings") { w *= H * (BASES[AVA.base].prof.itemK ?? 1); y = A.Y(.28); z = A.torso.back + sz.z * w / 2; }
  else if (f.at === "cape") { w *= H * (BASES[AVA.base].prof.itemK ?? 1); y = A.Y(.52) - sz.y * w; z = (A.torso.front + A.torso.back) / 2 + H * .03; } // 어깨에 두르는 망토(목 둘레가 뚫린 모양)
  else w = f.w; // 데크 장식은 m 단위
  o.scale.setScalar(w); o.position.set(x, y, z); parent.add(o);
  return o;
}
function shellOf(kind) {
  if (!AVA.S) return null;
  return AVA.shells[kind] ??= shell(AVA.S, cut(AVA.S, kind, BASES[AVA.base].prof), { coat: .014, vest: .02, boots: .012 }[kind], toon("#ffffff", { side: THREE.DoubleSide })).geometry;
}
// 옷 셰이더: 껍데기는 몸을 부풀린 것이라 무늬가 없다 → 텍스처 없이 화면에서 바로 그린다(크롬북도 가볍게)
// 자른 면을 따라 단(밑단·소매·목) 띠와 박음질, 비옷은 지퍼·주머니·반짝이는 비닐 광택, 조끼는 테두리·주머니 줄, 장화는 고무 밑창·발목 띠
// 좌표는 몸 좌표(발바닥 0, 앞 -z, 키 H). 모든 옷에 테두리 빛(rim)과 아주 옅은 천 결
const CLOTH_GLSL = `
  uniform vec4 cPlanes[8], cSph[2]; uniform float cH, cFront, cGloss, cTrimW; uniform vec3 cTrim, cDark, cMap;
  varying vec3 vC;
  float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.55); }
  float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
  float edgeDist() { float d = 1e3; for (int i = 0; i < 8; i++) { if (dot(cPlanes[i].xyz, cPlanes[i].xyz) < .5) continue; d = min(d, dot(cPlanes[i].xyz, vC) + cPlanes[i].w); } for (int i = 0; i < 2; i++) if (cSph[i].w > 0.) d = min(d, length(vC - cSph[i].xyz) - cSph[i].w); return d; }
  float rect(vec2 p, vec2 lo, vec2 hi, float w) { vec2 a = step(lo, p) * step(p, hi); float inside = a.x * a.y; vec2 b = step(lo + w, p) * step(p, hi - w); return inside - b.x * b.y; } // 테두리만 1
  float inRect(vec2 p, vec2 lo, vec2 hi) { vec2 a = step(lo, p) * step(p, hi); return a.x * a.y; }
`;
function clothMat(kind, col, planes) {
  const m = toon(col, { side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }), H = AVA.S.A.H, c = new THREE.Color(col); // 살짝 앞으로 그려서 속옷이 비치지 않게
  const pl = planes.filter((x) => x.length === 4), sp = planes.filter((x) => x.length === 5);
  const P = Array.from({ length: 8 }, (_, i) => new THREE.Vector4(...(pl[i] || [0, 0, 0, 0]))), SP = Array.from({ length: 2 }, (_, i) => sp[i] ? new THREE.Vector4(sp[i][1], sp[i][2], sp[i][3], sp[i][4]) : new THREE.Vector4());
  const front = AVA.S.A.torso.front + (kind === "vest" ? AVA.S.A.H * .03 : 0);
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { cPlanes: { value: P }, cSph: { value: SP }, cH: { value: H }, cFront: { value: front }, cGloss: { value: kind === "vest" ? .15 : kind === "boots" ? 1 : .8 },
      cTrim: { value: c.clone().offsetHSL(0, -.05, kind === "coat" ? -.14 : -.09) }, cTrimW: { value: kind === "vest" ? .012 : .024 }, cDark: { value: c.clone().multiplyScalar(.35) },
      cMap: { value: new THREE.Vector3(AVA.S.A.Y(.3) / H, .3, BASES[AVA.base].prof.decoK ?? 1) } });
    sh.vertexShader = "varying vec3 vC;\n" + sh.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\n vC = position;");
    sh.fragmentShader = CLOTH_GLSL + "#define CLOTH_" + kind.toUpperCase() + "\n" + sh.fragmentShader
      .replace("#include <color_fragment>", `#include <color_fragment>
      {
        float e = edgeDist() / cH, y = vC.y / cH, ax = abs(vC.x) / cH;
        #ifndef CLOTH_BOOTS
          y = cMap.y + (y - cMap.x) * cMap.z; ax *= cMap.z; // 주머니·지퍼 자리: 이 몸의 허리를 기준 몸 허리에 맞춘다(실제 비율 몸은 몸통이 길고 좁다)
        #endif
        vec3 col = diffuseColor.rgb;
        col *= .96 + .08 * vnoise(vC.xy / cH * 90.) ; // 천 결
        float trim = 1. - step(cTrimW, e), stitch = step(cTrimW + .007, e) * (1. - step(cTrimW + .013, e)) * step(.5, fract((vC.x + vC.y + vC.z) / cH * 60.));
        #ifdef CLOTH_COAT
          bool fr = vC.z < cFront + .06 * cH; // 앞면
          float zip = fr ? 1. - step(.009, ax) : 0., teeth = zip * step(.5, fract(y * 160.));
          col = mix(col, cDark * 1.4, zip); col = mix(col, vec3(.85), teeth * .6);
          float pl = fr ? step(.022, ax) * (1. - step(.027, ax)) * step(.5, fract(y * 70.)) : 0.; // 지퍼 옆 박음질
          vec2 pk = vec2(ax, y);
          float pocket = fr ? rect(pk, vec2(.045, .235), vec2(.115, .305), .006) : 0., flap = fr ? inRect(pk, vec2(.042, .29), vec2(.118, .312)) : 0.;
          col = mix(col, cTrim, max(flap * .7, pocket));
          col = mix(col, cDark * 1.6, pl * .8);
        #endif
        #ifdef CLOTH_VEST
          bool fr = vC.z < cFront + .05 * cH;
          vec2 pk = vec2(ax, y);
          float p1 = fr ? rect(pk, vec2(.035, .3), vec2(.1, .35), .005) : 0., p2 = fr ? rect(pk, vec2(.04, .37), vec2(.095, .41), .005) : 0.;
          float ring = fr ? 1. - step(.006, length(pk - vec2(.07, .43))) : 0.;
          col = mix(col, cTrim, max(p1, p2)); col = mix(col, vec3(.8, .78, .7), ring);
          col *= .93 + .07 * step(.5, fract(vC.x / cH * 45.) ) * step(.5, fract(vC.y / cH * 45.)); // 그물 결
        #endif
        #ifdef CLOTH_BOOTS
          float sole = 1. - step(.028, y), toe = (1. - step(.06, y)) * step(.028, y) * (vC.z < cFront ? 1. : 0.);
          col = mix(col, vec3(.16, .16, .19), sole); col = mix(col, col * 1.15 + .05, toe * .7);
          col = mix(col, col * .7, (1. - step(.012, abs(y - .028))) * .8);
        #endif
        col = mix(col, cTrim, trim); col = mix(col, cDark * 1.8, stitch * .55);
        diffuseColor.rgb = col;
      }`)
      .replace("#include <opaque_fragment>", `{
        vec3 V = normalize(vViewPosition), N = normalize(normal);
        float ndv = clamp(dot(N, V), 0., 1.), rim = pow(1. - ndv, 3.);
        vec3 Lh = normalize(vec3(-.35, .75, .55) + V);
        float spec = smoothstep(.95, .985, dot(N, Lh)) * cGloss; // 만화 같은 반짝 하이라이트(비닐·고무)
        outgoingLight += vec3(1., .97, .9) * (rim * .2 + spec * .3);
      }
      #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => "cloth-" + kind;
  return m;
}

class Fish {
  constructor(id, sizeT) {
    const sp = SPECIES[id], m = models[sp.model || id];
    this.id = id; this.sp = sp;
    this.group = new THREE.Group(); this.body = new THREE.Group(); this.group.add(this.body);
    this.len = sp.disp * (.85 + sizeT * .35);
    this.U = { bend: { value: new THREE.Vector4() } };
    if (m) {
      const norm = SkeletonUtils.clone(m.holder);
      norm.scale.setScalar(this.len); this.body.add(norm); this.norm = norm;
      this.halfH = m.half.y * this.len;
      norm.updateMatrixWorld(true);
      const normInv = norm.matrixWorld.clone().invert(), meshes = [];
      norm.traverse((o) => { if (o.isMesh) meshes.push(o); });
      for (const o of meshes) {
        // 메시 좌표 → 물고기 공간(머리 +x, 길이 1) 변환은 복제 직후 한 번만 정하면 된다
        const fish = new THREE.Matrix4().multiplyMatrices(normInv, o.matrixWorld);
        const U = { bend: this.U.bend, fish: { value: fish }, fishInv: { value: fish.clone().invert() } };
        const base = o.material;
        o.material = bendMaterial(base, U, false); o.frustumCulled = false;
        const ol = o.isSkinnedMesh ? new THREE.SkinnedMesh(o.geometry, bendMaterial(base, U, true)) : new THREE.Mesh(o.geometry, bendMaterial(base, U, true));
        if (o.isSkinnedMesh) ol.bind(o.skeleton, o.bindMatrix);
        ol.position.copy(o.position); ol.quaternion.copy(o.quaternion); ol.scale.copy(o.scale); ol.frustumCulled = false;
        o.parent.add(ol);
      }
    } else {
      const b = new THREE.Mesh(new THREE.SphereGeometry(.5, 12, 8), toon("#e8a040")); b.scale.set(this.len, this.len * .45, this.len * .3); this.body.add(b);
      this.halfH = this.len * .22;
    }
    scene.add(this.group);
  }
  // phase: 꼬리 물결 위상, amp: 꼬리 흔들기, arc: C자 휘기, head: 머리 흔들기 (몸길이 비율)
  wave(phase, amp, arc, head = amp * .3) { this.U.bend.value.set(phase, amp, arc, head); if (!this.norm) this.body.rotation.y = Math.sin(phase) * amp; }
  mouth(out) { return this.norm ? out.set(.48, 0, 0).applyMatrix4(this.norm.matrixWorld) : out.set(this.len * .48, 0, 0).applyMatrix4(this.body.matrixWorld); }
  dispose() { scene.remove(this.group); }
}

// ------------------------------------------------------------------ 구경거리: 물고기가 가끔 펄쩍 뛰거나, 등을 내밀고 지나가거나, 보글보글 숨을 쉰다
const JUMPERS = []; let jumpNext = 3;
function spawnJumper() {
  const ids = realIds(PLACE).filter((id) => models[SPECIES[id].model || id] && SPECIES[id].tier !== "전설");
  if (!ids.length) return;
  const id = ids[Math.floor(Math.random() * ids.length)], f = new Fish(id, rand(0, .6)), kind = Math.random() < .55 ? "jump" : Math.random() < .55 ? "fin" : "bubble";
  let p = null;
  for (let k = 0; k < 20 && !p; k++) { const q = pondPoint(rand(Math.PI * 1.05, Math.PI * 1.95), rand(.3, .85)); if (q.y < DECK_Z - 4 && (PLACE !== "sea" || q.y < seaFront(q.x) - 2) && spots.every((s) => Math.hypot(s.x - q.x, s.z - q.y) > 2.5)) p = q; }
  if (!p) { f.dispose(); return; }
  const head = Math.random() < .5 ? 0 : Math.PI, len = f.len;
  const J = { f, kind, x: p.x, z: p.y, head, age: 0, phase: rand(0, 9),
    dur: kind === "jump" ? .8 + len * .18 : kind === "fin" ? 3.2 : 2.6, h: .7 + len * .35, d: kind === "jump" ? .8 + len * 1.1 : 2.2 + len };
  f.group.rotation.y = head; f.group.position.set(p.x, -5, p.y);
  if (kind === "jump") { splash(p.x, p.y, 10, .8); ripple(p.x, p.y, 1.2); sample("splash", { vol: .25, rate: rand(1, 1.3) }); }
  JUMPERS.push(J);
}
function stepJumpers(dt, t) {
  // 낚시 대회 중 사투가 아닐 때, 그리고 시작 화면에서
  if (!F && !show && JUMPERS.length < 2 && (jumpNext -= dt) <= 0) { jumpNext = rand(4, 9); spawnJumper(); }
  for (let i = JUMPERS.length - 1; i >= 0; i--) {
    const J = JUMPERS[i], f = J.f; J.age += dt;
    const k = J.age / J.dur, dir = Math.cos(J.head), gp = f.group.position;
    J.phase += dt * (J.kind === "jump" ? 14 : 8);
    if (J.kind === "jump") { // 포물선으로 튀어 올랐다가 머리부터 들어간다
      const x = J.x + dir * J.d * k, y = J.h * 4 * k * (1 - k) - .1, vy = J.h * 4 * (1 - 2 * k) / J.dur, vx = J.d / J.dur;
      gp.set(x, y, J.z); f.body.rotation.z = Math.atan2(vy, vx) * .9;
      f.wave(J.phase, .14, Math.sin(k * Math.PI) * .1);
      if (k >= 1) { splash(x, J.z, 14, 1); ripple(x, J.z, 1.4); ripple(x, J.z, .8, "#effffb", 1.3); sample("splash", { vol: .3, rate: rand(.9, 1.2) }); }
    } else if (J.kind === "fin") { // 등지느러미만 물 위로 내밀고 스르륵
      const up = Math.min(1, k * 4, (1 - k) * 4), x = J.x + dir * J.d * (k - .5);
      gp.set(x, -f.halfH * 1.6 + up * f.halfH * .9, J.z); f.body.rotation.z = 0;
      f.wave(J.phase, .1, 0);
      if (Math.random() < dt * 6 * up) ripple(x - dir * f.len * .3, J.z + rand(-.1, .1), .5 + f.len * .3, "#effffb", .8);
    } else { // 수면 아래에서 보글보글: 몸은 안 보이고 거품만 줄줄이
      const x = J.x + dir * J.d * .3 * (k - .5);
      gp.set(x, -5, J.z);
      if (Math.random() < dt * 14) emitBubble(x + rand(-.15, .15), J.z + rand(-.15, .15), rand(.07, .16), "#e8fbff", false);
      if (Math.random() < dt * 2) ripple(x, J.z, .4, "#effffb", .7);
    }
    if (k >= 1 || F || show) { f.dispose(); f.group.traverse((o) => { if (o.material) o.material.dispose(); }); JUMPERS.splice(i, 1); }
  }
}

// ------------------------------------------------------------------ 내 장비(로그인하면 서버에서): 낚싯대 단계·옷·장식
// 낚싯대 Lv2 캐스팅 칸 넓게 · Lv3 연타 쉽게+미니게임 시간 · Lv4 하트 +1 · Lv5 큰 물고기
const GEAR = { me: null, rod: 1, wear: {}, own: {} };
const gearGroup = new THREE.Group(); body.add(gearGroup);
const decoGroup = new THREE.Group(); scene.add(decoGroup);
const ROD_COLORS = [["#3a2a20", "#5a3c26"], ["#6b4a2a", "#9a6a3a"], ["#22252e", "#454b5c"], ["#1f4fa0", "#3f7fe0"], ["#b8860b", "#ffd23f"]];
function applyGear(me) {
  Object.assign(GEAR, me ? { me, rod: me.rod || 1, wear: me.wear || {}, own: me.own || {} } : { me: null, rod: 1, wear: {}, own: {} });
  const rc = ROD_COLORS[GEAR.rod - 1] || ROD_COLORS[0];
  rodSegs.forEach((m, k) => { if (k <= 11) { m.material.dispose(); m.material = toon(k % 4 === 0 ? rc[0] : rc[1], GEAR.rod === 5 ? { emissive: "#5a3a00" } : {}); } });
  // 옷: 바탕 몸에 비옷(조끼를 입으면 조끼)·장화 껍데기, 모자(없으면 벙거지)·얼굴·등 아이템
  const want = me?.look?.base === 1 ? 1 : 0;
  if (AVA.base >= 0 && want !== AVA.base && AVA.want !== want) { AVA.want = want; loadAngler(want).catch((e) => console.warn("낚시꾼", e)); }
  gearGroup.clear(); gearGroup.userData.flag = null; HAIR.cut.value = 1e9;
  const w = GEAR.wear, L = me?.look || {}, P = LOOK_PAL;
  HAIR.on.value = L.hair ? 1 : 0; HAIR.col.value.set(P.hair[L.hair || 0]).convertSRGBToLinear();
  if (AVA.S) {
    const A = AVA.S.A, H = A.H;
    const wearShell = (kind, col) => { const g = shellOf(kind); if (g) gearGroup.add(new THREE.Mesh(g, clothMat(kind, col, cut(AVA.S, kind, BASES[AVA.base].prof)))); };
    if (w.body === "vest") {
      wearShell("vest", "#4f7a3a");
    } else if (w.body !== "cape") wearShell("coat", P.coat[L.coat || 0]);
    wearShell("boots", P.boots[L.boots || 0]);
    if (w.body === "scarf") {
      const k = A.head.w / (H * .42); // 목도리 굵기는 머리 너비에 맞춘다(실제 비율 몸은 머리가 작다)
      const r = new THREE.Mesh(new THREE.TorusGeometry(H * .1 * k, H * .035 * k, 8, 20), toon("#e0483c")); r.rotation.x = Math.PI / 2; r.position.set(0, A.Y(.48), (A.torso.front + A.torso.back) / 2); gearGroup.add(r);
      for (let i = 0; i < 3; i++) { const t = new THREE.Mesh(new THREE.BoxGeometry(H * .06 * k, H * .05 * k, H * .03 * k), toon(i % 2 ? "#f4f1e8" : "#e0483c")); t.position.set(H * .06 * k, A.Y(.47) - H * i * .05 * k, A.torso.front - H * .05 * k); gearGroup.add(t); }
    }
    placeItem(w.head || "hat_bucket", gearGroup, w.head ? null : P.hat[L.hat || 0]);
    if (w.face) placeItem(w.face, gearGroup);
    if (w.back === "flag") { // 깃발은 도형: 등에 꽂은 막대 + 펄럭이는 삼각 천 + 금색 공
      const g = new THREE.Group(); g.position.set(H * .1, A.Y(.3), A.torso.back + H * .03); g.rotation.z = -.12; gearGroup.add(g);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(H * .008, H * .008, H * 1.22, 6), toon("#c4c8d2")); pole.position.y = H * .61; g.add(pole);
      const tri = new THREE.Shape(); tri.moveTo(0, 0); tri.lineTo(H * .22, -H * .06); tri.lineTo(0, -H * .13);
      const cloth = new THREE.Mesh(new THREE.ShapeGeometry(tri), toon("#e0483c", { side: THREE.DoubleSide })); cloth.position.set(0, H * 1.2, 0); cloth.rotation.y = -.3; g.add(cloth); gearGroup.userData.flag = cloth;
      const ball = new THREE.Mesh(new THREE.SphereGeometry(H * .018, 8, 6), toon("#ffd23f", { emissive: "#5a3a00" })); ball.position.y = H * 1.23; g.add(ball);
    } else if (w.back) placeItem(w.back, gearGroup);
    if (w.body === "cape") placeItem("cape", gearGroup);
  }
  // 장식: 데크 위(Tripo 모델). 모닥불은 불꽃만 움직이는 도형, 고양이는 숨 쉬듯 들썩
  decoGroup.clear(); decoGroup.userData.flames = []; decoGroup.userData.cat = null;
  const at = (x, z) => new THREE.Vector3(STAND.x + x, .49, STAND.z + z);
  const deco = (id, x, z, ry) => { if (!GEAR.own[id]) return null; const g = new THREE.Group(); g.position.copy(at(x, z)); g.rotation.y = ry; decoGroup.add(g); placeItem(id, g); return g; };
  deco("chair", 1.05, .55, -.5);
  const fire = deco("fire", -1.15, .45, 0);
  if (fire) for (const [c, sz, y] of [["#ff4d1f", .09, .19], ["#ffb13a", .065, .22], ["#fff1a0", .04, .24]]) { const f = new THREE.Mesh(new THREE.ConeGeometry(sz, sz * 2.6, 7), new THREE.MeshBasicMaterial({ color: c })); f.position.y = y; fire.add(f); decoGroup.userData.flames.push(f); }
  deco("cooler", -.55, .85, .3);
  deco("lantern", .5, -.25, 0);
  decoGroup.userData.cat = deco("cat", .6, .9, 2.6);
  avatarDirty = true;
}
// 시작 화면·꾸미기에서 보는 내 낚시꾼(작은 화면에 따로 그린다). 끌어서 돌려 볼 수 있다
let avatarDirty = true;
const AV = { cv: $("charView"), r: null, sc: new THREE.Scene(), cam: new THREE.PerspectiveCamera(26, 1, .1, 40), g: new THREE.Group(), spin: 0, drag: null, w: 0, h: 0, ht: 1.4 };
AV.sc.add(new THREE.HemisphereLight("#ffffff", "#556070", 2.3)); { const d = new THREE.DirectionalLight("#ffffff", 1.5); d.position.set(-2, 3, -3); AV.sc.add(d); } AV.sc.add(AV.g);
function stepAvatar(dt, t) {
  const cv = AV.cv, slot = $("lobby").hidden ? $("charSlot") : $("lobbySlot"); if (!cv) return; // 꾸미기 탭이 다시 그려져도 캔버스를 잃지 않게 참조를 쥐고 있는다
  if ($("town").hidden && slot && cv.parentElement !== slot) slot.append(cv);
  if (!cv.offsetParent) return;
  if (!AV.r) {
    AV.r = new THREE.WebGLRenderer({ canvas: cv, alpha: true, antialias: true }); AV.r.setPixelRatio(Math.min(1.5, devicePixelRatio));
    cv.addEventListener("pointerdown", (e) => { AV.drag = e.clientX; cv.setPointerCapture(e.pointerId); });
    cv.addEventListener("pointermove", (e) => { if (AV.drag == null) return; AV.spin += (e.clientX - AV.drag) * .012; AV.drag = e.clientX; });
    for (const ev of ["pointerup", "pointercancel"]) cv.addEventListener(ev, () => { AV.drag = null; });
  }
  const w = cv.clientWidth, h = cv.clientHeight;
  if (w !== AV.w || h !== AV.h) { AV.w = w; AV.h = h; AV.r.setSize(w, h, false); AV.cam.aspect = w / Math.max(1, h); AV.cam.updateProjectionMatrix(); }
  if (avatarDirty) {
    AV.g.clear(); const holder = new THREE.Group(); holder.add(anglerModel.clone(), gearGroup.clone());
    const box = new THREE.Box3().setFromObject(holder), c = box.getCenter(new THREE.Vector3());
    holder.position.set(-c.x, -box.min.y, -c.z); AV.g.add(holder); AV.ht = Math.max(.5, box.max.y - box.min.y); avatarDirty = false;
  }
  AV.g.rotation.y = AV.spin + (AV.drag == null ? Math.sin(t * .5) * .45 : 0);
  const d = AV.ht * .5 / Math.tan(THREE.MathUtils.degToRad(13)) / Math.min(1, AV.cam.aspect * 1.25);
  AV.cam.position.set(0, AV.ht * (AV.pitch ?? .62), -d); AV.cam.lookAt(0, AV.ht * .5, 0);
  AV.r.render(AV.sc, AV.cam);
}
function mountAvatar(el) { if (AV.cv && el) el.append(AV.cv); }
function stepDeco(t) { const fl = gearGroup.userData.flag; if (fl) fl.rotation.y = -.3 + Math.sin(t * 5) * .35; const cat = decoGroup.userData.cat; if (cat) { cat.scale.set(1, 1 + Math.sin(t * 2.4) * .04, 1); cat.rotation.y = 2.6 + Math.sin(t * .7) * .25; } decoGroup.userData.flames?.forEach((f, i) => { f.scale.set(1 + Math.sin(t * 13 + i) * .12, 1 + Math.sin(t * 17 + i * 2) * .25, 1 + Math.cos(t * 11 + i) * .12); f.rotation.y = t * (2 + i); }); }

// ------------------------------------------------------------------ 소리
// assets/sfx 에 일레븐랩스로 만든 효과음이 있으면 그걸 쓰고, 없으면 칩튠 신스로 낸다.
let ac = null;
function audio() { if (!ac) try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch { ac = null; } if (ac?.state === "suspended") ac.resume(); return ac; }
function tone(freq, dur, type = "sine", vol = .15, slide = 0, delay = 0) {
  const a = audio(); if (!a) return;
  const o = a.createOscillator(), g = a.createGain(), t = a.currentTime + delay;
  o.type = type; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + dur);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur);
}
function noise(dur, vol = .12, hp = 800, delay = 0) {
  const a = audio(); if (!a) return;
  const b = a.createBuffer(1, Math.ceil(a.sampleRate * dur), a.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  f.type = "highpass"; f.frequency.value = hp; g.gain.value = vol;
  s.buffer = b; s.connect(f).connect(g).connect(a.destination); s.start(a.currentTime + delay);
}
const SAMPLES = {};
fetch("assets/sfx/sfx.json").then((r) => (r.ok ? r.json() : {})).then((list) => {
  const a = audio(); if (!a) return;
  for (const [name, file] of Object.entries(list)) fetch(`assets/sfx/${file}`).then((r) => r.arrayBuffer()).then((buf) => a.decodeAudioData(buf)).then((b) => { SAMPLES[name] = prepSample(b); }).catch(() => {});
}).catch(() => {});
// 앞쪽 무음은 건너뛰고(박자에 딱 붙게) 크기는 고르게 맞춘다
function prepSample(b) {
  const d = b.getChannelData(0); let peak = 0;
  for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
  let on = 0; while (on < d.length && Math.abs(d[on]) < peak * .08) on++;
  return { b, offset: Math.max(0, on / b.sampleRate - .004), gain: peak > 0 ? Math.min(3, .7 / peak) : 1 };
}
function sample(name, { rate = 1, vol = .8, delay = 0 } = {}) {
  const S = SAMPLES[name]; if (!S || !ac) return false;
  const s = ac.createBufferSource(), g = ac.createGain();
  s.buffer = S.b; s.playbackRate.value = rate; g.gain.value = vol * S.gain;
  s.connect(g).connect(ac.destination); s.start(ac.currentTime + delay, S.offset);
  return true;
}
const semi = (n) => Math.pow(2, n / 12);
function sampleLoop(name, vol = .5) { // 비 소리·줄 삐걱임처럼 이어지는 소리
  const S = SAMPLES[name]; if (!S || !ac) return { stop() {}, rate() {} };
  const s = ac.createBufferSource(), g = ac.createGain();
  s.buffer = S.b; s.loop = true; s.loopStart = S.offset; s.loopEnd = S.b.duration;
  g.gain.value = 0; g.gain.setTargetAtTime(vol * S.gain, ac.currentTime, .2);
  s.connect(g).connect(ac.destination); s.start(0, S.offset);
  return { stop() { try { g.gain.setTargetAtTime(0, ac.currentTime, .08); s.stop(ac.currentTime + .4); } catch {} }, rate(r) { s.playbackRate.value = r; } };
}

// 사투 중 깔리는 칩튠 박자. 연타 소리는 가까운 16분 박자에 붙여서 리듬이 맞게 들린다.
const BEAT = { on: false, bpm: 132, next: 0, step: 0, mode: "" };
function beatStart(bpm) { const a = audio(); if (!a) return; BEAT.on = true; BEAT.bpm = bpm; BEAT.next = a.currentTime + .05; BEAT.step = 0; }
function beatStop() { BEAT.on = false; }
function beatTick() {
  if (!BEAT.on || !ac) return;
  const sixteenth = 60 / BEAT.bpm / 4;
  while (BEAT.next < ac.currentTime + .12) {
    const d = BEAT.next - ac.currentTime, st = BEAT.step % 16;
    if (st % 4 === 0) tone(st === 0 ? 70 : 60, .16, "sine", .22, -30, d);         // 쿵
    if (st === 4 || st === 12) noise(.09, .07, 1800, d);                             // 짝
    if (st % 2 === 1) noise(.025, .025, 7000, d);                                    // 츳
    const bar = (BEAT.step >> 4) % 4;
    if (BEAT.mode === "boss") { // 보스: 낮게 내려가는 베이스와 묵직한 쿵, 네 마디마다 북 몰아치기
      if (st % 2 === 0) tone([98, 92.5, 87.3, 82.4][bar], .12, "sawtooth", .045, 0, d);
      if (st === 0) tone(55, .45, "sawtooth", .07, -15, d);
      if (bar === 3 && st >= 12) tone(180 - (st - 12) * 25, .1, "triangle", .12, -60, d);
    } else if (BEAT.mode === "big") { // 대물: 반짝이는 분산화음을 얹는다
      if (st % 4 === 2) tone([110, 110, 131, 98][bar] * 2, .1, "square", .03, 0, d);
      if (st % 2 === 0) tone([523, 659, 784, 1047][(st >> 1) % 4] * (bar === 3 ? .89 : 1), .07, "triangle", .035, 0, d);
    } else if (st % 4 === 2) tone([110, 110, 131, 98][bar], .1, "square", .03, 0, d); // 베이스
    BEAT.next += sixteenth; BEAT.step++;
  }
}
// 가장 가까운 16분 박자까지 남은 시간(35ms 안쪽이면 그 박자에 붙이고, 아니면 바로)
function onBeat() {
  if (!BEAT.on || !ac) return 0;
  const sixteenth = 60 / BEAT.bpm / 4, wait = BEAT.next - ac.currentTime;
  const w = ((wait % sixteenth) + sixteenth) % sixteenth;
  return w < .035 ? w : 0;
}
const MASH_RIFF = [0, 0, 7, 0, 3, 0, 10, 7, 0, 0, 12, 10, 7, 3, 5, 7]; // 연타할수록 이어지는 리프
const NOTE_PITCH = { up: 784, right: 880, down: 659, left: 587, reel: 523, circle: 988 };
const NOTE_SEMI = { up: 4, right: 7, down: 2, left: 0, reel: -5, circle: 9 };
const SFX = {
  cast: () => sample("cast", { vol: .6 }) || (noise(.25, .06, 2500), tone(420, .3, "triangle", .07, 600)),
  plop: () => sample("plop") || (tone(330, .2, "sine", .22, -220), noise(.12, .05, 1500)),
  nibble: () => tone(760, .05, "square", .05),
  bite: () => sample("bite") || (tone(988, .09, "square", .1), tone(1318, .14, "square", .1, 0, .08)),
  hook: () => sample("hook") || (noise(.2, .14, 500), tone(220, .25, "sawtooth", .08, 400)),
  hit: (dir, perfect) => {
    const d = onBeat();
    if (dir === "reel") return sample("reel", { delay: d, rate: perfect ? 1.15 : 1 }) || (noise(.12, .08, 2500, d), tone(523, .14, "square", .08, 500, d));
    if (!sample(perfect ? "perfect" : "tap", { delay: d, rate: semi(NOTE_SEMI[dir]) * .9, vol: .7 })) tone(NOTE_PITCH[dir] * (perfect ? 2 : 1), .09, "square", .07, 0, d);
    noise(.05, .04, 3000, d);
  },
  mash: (n, need) => { // n번째 연타: 리프를 따라 올라가고, 큰 놈일수록 낮고 묵직하게
    const d = onBeat(), up = MASH_RIFF[(n - 1) % 16] + Math.floor((n - 1) / 16) * 12, heavy = need > 14 ? -5 : 0;
    const drum = n % 4 === 0 ? "snare" : "taiko";
    if (!sample(drum, { delay: d, rate: semi((n * .4) | 0) })) { if (drum === "snare") noise(.08, .1, 1500, d); else tone(90, .1, "sine", .25, -40, d); }
    tone(262 * semi(up + heavy), .07, "square", .06, 0, d);
  },
  mashDone: () => sample("perfect", { rate: 1.3 }) || [0, 4, 7, 12].forEach((k, i) => tone(523 * semi(k), .08, "square", .07, 0, i * .04)),
  miss: () => sample("miss") || (tone(160, .25, "sawtooth", .12, -60), noise(.2, .1, 300)),
  splash: () => sample("splash", { vol: .5, rate: rand(.9, 1.15) }) || noise(.35, .12, 400),
  snap: () => sample("snap") || (noise(.3, .22, 2000), tone(1400, .25, "sawtooth", .07, -1200)),
  catch: () => sample("catch") || [523, 659, 784, 1046].forEach((f, i) => tone(f, .16, "square", .07, 0, i * .09)),
  legend: () => sample("legend") || [523, 659, 784, 1046, 1318, 1568, 2093].forEach((f, i) => tone(f, .2, "square", .07, 0, i * .08)),
  lose: () => { tone(400, .2, "triangle", .1); tone(300, .3, "triangle", .1, 0, .15); },
};

// ------------------------------------------------------------------ 배경 음악: 칩튠을 직접 연주(낚시터마다 다른 곡, 사투 중엔 줄이고 사투 박자를 깐다)
const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);
function seeded(seed) { let x = seed; return () => ((x = (x * 1103515245 + 12345) % 2147483648) / 2147483648); }
function makeMelody(seed, prog) { // 8분음표 32칸(4마디): 화음 음을 따라 걷고 가끔 쉰다
  const r = seeded(seed), out = []; let cur = 0;
  for (let i = 0; i < 32; i++) {
    const chord = prog[Math.floor(i / 8)];
    if (r() < .22 && i % 8 !== 0) { out.push(null); continue; }
    const cand = [...chord, chord[0] + 12, chord[1] + 12];
    cur = cand.reduce((b, c) => (Math.abs(c - cur - (r() * 6 - 3)) < Math.abs(b - cur) ? c : b), cand[Math.floor(r() * cand.length)]);
    out.push(cur);
  }
  return out;
}
const SONGS = {
  fresh: { bpm: 104, root: 60, lead: "triangle", prog: [[0, 4, 7], [-3, 0, 4], [-7, -3, 0], [-5, -1, 2]] }, // C Am F G
  sea: { bpm: 118, root: 65, lead: "square", prog: [[0, 4, 7], [-5, -1, 2], [-3, 0, 4], [-7, -3, 0]] },     // F C Dm Bb
};
for (const [k, S] of Object.entries(SONGS)) S.mel = [makeMelody(k === "sea" ? 7 : 3, S.prog), makeMelody(k === "sea" ? 11 : 19, S.prog)];
const BGM = { on: true, gain: null, next: 0, step: 0, song: SONGS.fresh, noise: null };
try { BGM.on = localStorage.getItem("jamfish-bgm") !== "off"; } catch {}
function bgmLevel() { return BGM.on && !F && !calmReady() ? .55 : 0; } // 잔잔한 곡이 준비되면 칩튠은 쉼
function bgmStart() {
  const a = audio(); if (!a) return;
  if (!BGM.gain) {
    BGM.gain = a.createGain(); BGM.gain.gain.value = 0; BGM.gain.connect(a.destination);
    const b = a.createBuffer(1, a.sampleRate * .2, a.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    BGM.noise = b; BGM.next = a.currentTime + .1;
  }
  BGM.gain.gain.setTargetAtTime(bgmLevel(), a.currentTime, .3);
  if (!CALM.gain) { CALM.gain = a.createGain(); CALM.gain.gain.value = 0; CALM.gain.connect(a.destination); }
}
function bgmTone(m, dur, type, vol, when) {
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.value = midi(m);
  g.gain.setValueAtTime(vol, when); g.gain.exponentialRampToValueAtTime(.001, when + dur);
  o.connect(g).connect(BGM.gain); o.start(when); o.stop(when + dur + .02);
}
function bgmHit(dur, vol, hp, when) {
  const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  s.buffer = BGM.noise; f.type = "highpass"; f.frequency.value = hp;
  g.gain.setValueAtTime(vol, when); g.gain.exponentialRampToValueAtTime(.001, when + dur);
  s.connect(f).connect(g).connect(BGM.gain); s.start(when); s.stop(when + dur);
}
// 가만히 있을 때 깔리는 잔잔한 곡(일레븐랩스 30초 루프). 낚시터·날씨마다 곡이 2개씩 있어서 한 바퀴마다 번갈아 튼다.
// 시작 화면과 끝 화면은 title. 사투에 들어가면 잦아들고 칩튠 박자가 대신 나온다.
const CALM = { list: {}, bufs: {}, vol: {}, span: {}, loading: {}, gain: null, cur: null, group: "", name: "", t0: 0 };
fetch("assets/bgm/bgm.json").then((r) => (r.ok ? r.json() : {})).then((l) => { CALM.list = l; }).catch(() => {});
function calmGroup() { return G.playing ? `${PLACE}-${G.weather}` : "title"; }
function calmNames(g) { return Object.keys(CALM.list).filter((n) => n === g || n.startsWith(g + "-")); }
function calmLoad(n) {
  if (CALM.bufs[n] || CALM.loading[n] || !ac) return;
  CALM.loading[n] = true;
  fetch(`assets/bgm/${CALM.list[n]}`).then((r) => r.arrayBuffer()).then((b) => ac.decodeAudioData(b)).then((b) => { CALM.span[n] = calmSpan(b); CALM.vol[n] = calmVol(b, CALM.span[n]); CALM.bufs[n] = b; }).catch(() => { CALM.loading[n] = false; });
}
function calmSpan(b) { // 긴 곡(Music API)은 앞뒤에 정적·페이드아웃이 있어서 소리 나는 구간만 쓴다
  const d = b.getChannelData(0), sr = b.sampleRate; let on = 0, off = d.length - 1;
  while (on < d.length && Math.abs(d[on]) < .02) on++;
  while (off > on && Math.abs(d[off]) < .02) off--;
  return [on / sr, Math.max(on / sr + 5, off / sr)];
}
function calmVol(b, [on, off]) { // 곡마다 크기가 달라서 평균 세기(rms)를 맞춘다
  const d = b.getChannelData(0), a = Math.floor(on * b.sampleRate), z = Math.floor(off * b.sampleRate); let q = 0, n = 0;
  for (let i = a; i < z; i += 16) { q += d[i] * d[i]; n++; }
  return Math.min(1.8, .12 / Math.max(.02, Math.sqrt(q / Math.max(1, n))));
}
function calmReady() { return calmNames(calmGroup()).some((n) => CALM.bufs[n]); }
function calmPlay(n, fade) {
  const now = ac.currentTime, s = ac.createBufferSource(), g = ac.createGain();
  const [on, off] = CALM.span[n];
  s.buffer = CALM.bufs[n]; s.loop = true; s.loopStart = on; s.loopEnd = off; // 틱이 멈춰도(탭 숨김) 같은 곡이 계속 돈다
  g.gain.setValueAtTime(0, now); g.gain.linearRampToValueAtTime(CALM.vol[n] || 1, now + fade);
  s.connect(g).connect(CALM.gain); s.start(now, on);
  if (CALM.cur) { const o = CALM.cur; o.g.gain.cancelScheduledValues(now); o.g.gain.setValueAtTime(o.g.gain.value, now); o.g.gain.linearRampToValueAtTime(0, now + fade); o.s.stop(now + fade + .05); }
  CALM.cur = { s, g }; CALM.name = n; CALM.t0 = now;
}
function calmTick() {
  if (!CALM.gain) return;
  CALM.gain.gain.setTargetAtTime(BGM.on ? (F ? 0 : .42) : 0, ac.currentTime, F ? .3 : 1.5);
  const g = calmGroup(), names = calmNames(g);
  names.forEach(calmLoad);
  const ready = names.filter((n) => CALM.bufs[n]);
  if (!ready.length) return;
  if (CALM.group !== g) { // 낚시터·날씨가 바뀌면 긴 곡(-m)부터, 아직 안 왔으면 있는 곡으로
    const long = ready.filter((n) => n.endsWith("-m")), pool = long.length ? long : ready;
    CALM.group = g; return calmPlay(pool[Math.floor(Math.random() * pool.length)], 2.5);
  }
  const sp = CALM.span[CALM.name] || [0, 30], dur = sp[1] - sp[0];
  if (ac.currentTime - CALM.t0 > dur - 2.2) { // 한 바퀴 끝나 갈 때 다른 곡으로 겹쳐 넘김
    const other = ready.filter((n) => n !== CALM.name);
    if (other.length) calmPlay(other[Math.floor(Math.random() * other.length)], 2.2); else CALM.t0 += dur;
  }
}
function bgmTick() {
  if (!BGM.gain || !ac) return;
  calmTick();
  BGM.gain.gain.setTargetAtTime(bgmLevel(), ac.currentTime, F ? .15 : .8);
  const S = BGM.song, six = 60 / S.bpm / 4;
  if (BGM.next < ac.currentTime - .5) BGM.next = ac.currentTime + .05; // 탭이 쉬다 돌아왔을 때
  while (BGM.next < ac.currentTime + .15) {
    const w = BGM.next, st = BGM.step % 64, bar = Math.floor(st / 16), chord = S.prog[bar], R = S.root;
    if (bgmLevel() > 0 || BGM.gain.gain.value > .01) {
      if (st % 16 === 0) bgmTone(R - 24 + chord[0], six * 7, "triangle", .32, w);
      if (st % 16 === 8) bgmTone(R - 24 + chord[0] + 7, six * 5, "triangle", .24, w);
      if (st % 16 === 12) bgmTone(R - 24 + chord[0] + 12, six * 3, "triangle", .2, w);
      if (st % 2 === 0) bgmTone(R + 12 + chord[(st / 2) % 3], six * 1.4, "square", .025, w); // 반짝이는 분산화음
      if (st % 2 === 0) { const note = S.mel[Math.floor(BGM.step / 64) % 2][st / 2]; if (note != null) bgmTone(R + note, six * 2.6, S.lead, S.lead === "square" ? .05 : .11, w); }
      if (st % 8 === 0) bgmTone(48, .12, "sine", .22, w);       // 쿵
      if (st % 8 === 4) bgmHit(.08, .05, 2000, w);             // 짝
      if (st % 4 === 2) bgmHit(.03, .025, 7000, w);            // 츳
    }
    BGM.next += six; BGM.step++;
  }
}
function setSound(on) {
  BGM.on = on; $("soundTxt").textContent = on ? "ON" : "OFF";
  try { localStorage.setItem("jamfish-bgm", on ? "on" : "off"); } catch {}
  bgmStart();
}
$("soundTxt").textContent = BGM.on ? "ON" : "OFF";
$("soundBtn").addEventListener("click", (e) => { e.stopPropagation(); setSound(!BGM.on); });
// 브라우저는 사용자가 한 번 누른 뒤에야 소리를 내 준다. 시작 화면에서 처음 누를 때 title 곡을 켠다.
const firstTouch = () => { bgmStart(); removeEventListener("pointerdown", firstTouch); removeEventListener("keydown", firstTouch); };
addEventListener("pointerdown", firstTouch); addEventListener("keydown", firstTouch);

// ------------------------------------------------------------------ 화면 효과 (사투 화면은 픽셀 그림)
function pxSvg(rows, fill = "#13162e", rot = 0, extra = "") {
  const h = rows.length, w = rows[0].length;
  let r = "";
  rows.forEach((row, y) => [...row].forEach((c, x) => { if (c === "#") r += `<rect x="${x}" y="${y}" width="1.02" height="1.02"/>`; }));
  return `<svg viewBox="0 0 ${w} ${h}"><g fill="${fill}" transform="rotate(${rot} ${w / 2} ${h / 2})">${r}</g>${extra}</svg>`;
}
const UP_PX = ["....##....", "...####...", "..######..", ".########.", "##########", "...####...", "...####...", "...####...", "...####...", "...####..."];
const ARROW_SVG = { up: pxSvg(UP_PX), right: pxSvg(UP_PX, undefined, 90), down: pxSvg(UP_PX, undefined, 180), left: pxSvg(UP_PX, undefined, 270) };
const KEY_HTML = (dir) => dir === "reel" ? `<div class="kb"><span class="kb-desk">SPACE</span><span class="kb-touch">감기</span><small class="kb-desk">릴 감기!</small><small class="kb-touch">화면 톡!</small></div>` : ARROW_SVG[dir];
const HEART = pxSvg([".##.##.", "#######", "#######", ".#####.", "..###..", "...#..."], "#ff4d6d", 0, '<rect x="1" y="1" width="1" height="1" fill="#fff8e8"/>');
document.querySelectorAll(".dpad button").forEach((b) => { b.innerHTML = ARROW_SVG[b.dataset.dir]; });
// 남은 시간 = 열쇠 둘레의 네모 칸(시계 방향으로 꺼진다)
const FRAME_N = 24, frameRects = [];
{
  const svg = $("frame"), L = 142, o = 9, B = 14;
  for (let i = 0; i < FRAME_N; i++) {
    let d = ((i / FRAME_N) * 4 * L + L / 2) % (4 * L), x, y;
    if (d < L) { x = o + d; y = o; } else if (d < 2 * L) { x = o + L; y = o + d - L; } else if (d < 3 * L) { x = o + L - (d - 2 * L); y = o + L; } else { x = o; y = o + L - (d - 3 * L); }
    const r = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    r.setAttribute("x", (x - B / 2).toFixed(0)); r.setAttribute("y", (y - B / 2).toFixed(0)); r.setAttribute("width", B); r.setAttribute("height", B);
    svg.appendChild(r); frameRects.push(r);
  }
}
let frameLit = -1;
function setFrame(k) { const n = Math.ceil(k * FRAME_N); if (n === frameLit) return; frameLit = n; frameRects.forEach((r, i) => r.classList.toggle("on", i < n)); }
function pxWave() { const w = $("wave"); w.classList.remove("go"); void w.offsetWidth; w.classList.add("go"); }
function shout(text, cls = "sun", sec = .9) {
  const el = $("shout"); el.textContent = text; el.className = `shout ${cls}`;
  void el.offsetWidth; el.style.animationDuration = `${sec}s`; el.classList.add("pop");
}
function flash(kind) { const el = $("flash"); el.className = "flash"; void el.offsetWidth; el.className = `flash ${kind}`; }
function hint(html) { const h = $("hint"); h.innerHTML = html || ""; h.hidden = !html; }
let shake = 0, punch = 0; // punch: 화면이 쾅 다가오는 정도(+) / 밀려나는 정도(-)
const renderLegend = () => $("legend").innerHTML = Object.values(SPOT_TYPES).filter((T) => !T.legendHidden).map((T) => `<span><i style="background:${T.color === "rainbow" ? "conic-gradient(red,orange,yellow,lime,cyan,blue,violet,red)" : T.color}"></i>${T.name}</span>`).join("") + "<span>물결 없는 거품은 가짜일지도?</span>";
renderLegend();

// ------------------------------------------------------------------ 게임 상태
const G = { playing: false, time: 180, score: 0, caught: [], book: new Set(), ending: false, lastResult: "",
  bait: "worm", weather: "sunny", streak: 0, fever: 0, bossSpawned: false, stat: { barPerfect: 0, circlePerfect: 0 } };
const store = { get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };

// ------------------------------------------------------------------ 도감 (판이 끝나도 남는다)
const BOOK = store.get("jamfish-book", {});
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
function bookAdd(id, cm, grade, kg) {
  const e = BOOK[id] || { n: 0, best: 0, grade: "", first: today() }, isNew = !BOOK[id];
  const record = !isNew && kg > (e.kg || 0); // 같은 물고기를 또 잡았을 때 가장 무거운 기록을 넘으면 기록 경신
  e.n++; if (cm > e.best) { e.best = cm; e.grade = grade; }
  if (kg > (e.kg || 0)) e.kg = kg;
  BOOK[id] = e; if (grade === "월척") BOOK._wol = (BOOK._wol || 0) + 1;
  store.set("jamfish-book", BOOK);
  return { isNew, record };
}
// 무게(kg) = 몸 모양 계수 × (길이 m)³ × 통통함. 길쭉한 물고기는 가볍고 둥근 물고기는 무겁다
const WEIGHT_K = { bingeo: 8, loach: 3, beodeulchi: 10, gakshi: 14, galgyeoni: 10, moraemuji: 9, kkeuri: 9, gangjunchi: 7, eunuh: 10, rainbowtrout: 11, tilapia: 20, dongsari: 12, chamge: 390, lenok: 11, jara: 74, hwangsso: 13, arapaima: 8, arowana: 6, anchovy: 8, saury: 3, halfbeak: 2.5, bollak: 13, noraemi: 11, jwichi: 20, dodari: 14, gamsungdom: 16, samchi: 7, squid: 8, octopus: 6, monkfish: 20, dolddom: 18, salmon: 11, stingray: 12, swordfish: 4, manta: 1.5, whaleshark: 1.2, bossgar: 6, bosskoi: 14, bossshark: 7, bosskraken: 1, mirrorcarp: 16, mahimahi: 9, sailfish: 3, minnow: 10, pirami: 9, eel: 2, cutlass: 1.5, marlin: 5, bossSea: 5, sturgeon: 7, snakehead: 9, catfish: 9, bossFresh: 9, sunfish: 30, puffer: 25, flounder: 14, tuna: 18, yellowtail: 13 };
const kgOf = (id, cm, cond) => Math.max(.01, (WEIGHT_K[id] || 12) * (cm / 100) ** 3 * cond);
const kgText = (kg) => (kg >= 100 ? `${Math.round(kg)}kg` : kg >= 1 ? `${kg.toFixed(1)}kg` : `${Math.round(kg * 1000)}g`);
// 보스: 이 낚시터 보스 중 하나. 도감에 아직 없는 보스가 두 배 잘 나온다
function pickBoss() {
  const ids = placeIds(PLACE).filter((id) => SPECIES[id].boss), w = ids.map((id) => BOOK[id] ? 1 : 2);
  let r = Math.random() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < ids.length; i++) if ((r -= w[i]) <= 0) return ids[i];
  return ids[0];
}
const realIds = (w) => placeIds(w).filter((id) => SPECIES[id].points && !SPECIES[id].boss);
function titles() {
  const got = (w) => realIds(w).filter((id) => BOOK[id]).length, all = [...realIds("fresh"), ...realIds("sea")];
  return [
    { name: "첫 낚시", ok: all.some((id) => BOOK[id]) },
    { name: "도감 절반", ok: got("fresh") + got("sea") >= Math.ceil(all.length / 2) },
    { name: "민물 낚시왕", ok: got("fresh") === realIds("fresh").length },
    { name: "바다의 왕", ok: got("sea") === realIds("sea").length },
    { name: "월척 사냥꾼", ok: (BOOK._wol || 0) >= 5, tip: `월척 ${Math.min(5, BOOK._wol || 0)}/5` },
    { name: "보스 헌터", ok: Object.keys(SPECIES).some((id) => SPECIES[id].boss && BOOK[id]) },
  ];
}

// ------------------------------------------------------------------ 오늘의 미션 (날마다 3개)
const MISSION_POOL = [
  { id: "wolchuk", text: "월척 1마리 낚기", goal: 1 }, { id: "legend", text: "전설 물고기 1마리", goal: 1 },
  { id: "circlePerfect", text: "원 터치 PERFECT 10번", goal: 10 }, { id: "barPerfect", text: "타이밍 바 PERFECT 5번", goal: 5 },
  { id: "fever", text: "피버 타임 1번", goal: 1 }, { id: "score", text: "한 판에 1000점", goal: 1000, max: true },
  { id: "sea5", text: "바다에서 5마리", goal: 5 }, { id: "fresh5", text: "민물에서 5마리", goal: 5 },
  { id: "release", text: "놔주자급 2번 놓아주기", goal: 2 }, { id: "boss", text: "보스 물고기 낚기", goal: 1 },
  { id: "newfish", text: "도감에 새 물고기 2종", goal: 2 }, { id: "lure", text: "반짝 루어로 3마리", goal: 3 },
  { id: "rainfish", text: "비 오는 날 3마리", goal: 3 },
];
const MS = (() => {
  const d = today(), saved = store.get("jamfish-mission", null);
  if (saved?.date === d) return saved;
  const r = seeded([...d].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) % 2147483647), pool = [...MISSION_POOL], ids = [];
  while (ids.length < 3) ids.push(pool.splice(Math.floor(r() * pool.length), 1)[0].id);
  return { date: d, ids, prog: {}, done: {} };
})();
function missionEvent(id, amount = 1) {
  if (!MS.ids.includes(id) || MS.done[id]) return;
  const M = MISSION_POOL.find((m) => m.id === id);
  MS.prog[id] = M.max ? Math.max(MS.prog[id] || 0, amount) : (MS.prog[id] || 0) + amount;
  if (MS.prog[id] >= M.goal) {
    MS.done[id] = true;
    toast(`미션 완료! ${M.text} <b>+150</b>`); sample("mission") || SFX.catch();
    if (G.playing) { G.score += 150; $("score").textContent = G.score; }
  }
  store.set("jamfish-mission", MS); renderMissions();
}
function renderMissions() {
  const html = MS.ids.map((id) => { const M = MISSION_POOL.find((m) => m.id === id), p = Math.min(M.goal, MS.prog[id] || 0);
    return `<li class="${MS.done[id] ? "done" : ""}"><span>${MS.done[id] ? "✓" : "□"} ${M.text}</span><b>${MS.done[id] ? "완료" : `${p}/${M.goal}`}</b></li>`; }).join("");
  document.querySelectorAll(".missions").forEach((el) => { el.innerHTML = html; });
}
let toastT = 0;
function toast(html) { const el = $("toast"); el.innerHTML = html; el.hidden = false; el.classList.remove("go"); void el.offsetWidth; el.classList.add("go"); clearTimeout(toastT); toastT = setTimeout(() => { el.hidden = true; }, 2600); }

// ------------------------------------------------------------------ 미끼
const BAIT_KEYS = { 1: "worm", 2: "shrimp", 3: "lure" };
function setBait(id) {
  G.bait = id; sample("bait") || SFX.nibble();
  document.querySelectorAll("[data-bait]").forEach((b) => b.classList.toggle("on", b.dataset.bait === id));
  if (G.playing && !F) hint(`<em>${BAITS[id].name}</em> — ${BAITS[id].tip}`);
}

// ------------------------------------------------------------------ 피버 타임: 하트를 안 잃고 3마리 연속
const FEVER_TYPES = { blue: 25, purple: 35, gold: 28, rainbow: 12 };
function startFever() {
  G.fever = 20; G.streak = 0;
  document.body.classList.add("fever");
  shout("FEVER TIME!!", "sun", 1.4); flash("gold"); shake = .6; sample("fever") || SFX.legend();
  for (const sp of [...spots]) if (!sp.busy && !sp.boss && (sp.type === "white" || sp.type === "blue")) { sp.age = sp.life; newSpot(pick(FEVER_TYPES)); }
  missionEvent("fever");
}
function stepFever(dt) {
  if (G.fever > 0 && !F) { G.fever -= dt; if (G.fever <= 0) { document.body.classList.remove("fever"); shout("피버 끝!", "cream", .9); } }
  const chip = $("feverChip");
  chip.hidden = !G.playing || (G.fever <= 0 && G.streak <= 0);
  $("feverTxt").textContent = G.fever > 0 ? `FEVER ${Math.ceil(G.fever)}` : `연속 ${G.streak}/3`;
  chip.classList.toggle("hot", G.fever > 0);
}

// ------------------------------------------------------------------ 날씨: 맑음·비·노을
const rainGeo = new THREE.BufferGeometry(), RAIN_N = 420, rainPos = new Float32Array(RAIN_N * 6);
for (let i = 0; i < RAIN_N; i++) { const x = rand(-16, 16), y = rand(0, 11), z = rand(-24, 9); rainPos.set([x, y, z, x - .06, y - .5, z + .03], i * 6); }
rainGeo.setAttribute("position", new THREE.BufferAttribute(rainPos, 3));
const rain = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color: "#dbe9f7", transparent: true, opacity: .55 }));
rain.visible = false; rain.frustumCulled = false; scene.add(rain);
let rainLoop = null;
function applyWeather() {
  const w = G.weather, L = PLACE_LOOK[PLACE];
  SKY.set(w === "rain" ? (PLACE === "sea" ? "#7d93a6" : "#869aa3") : w === "sunset" ? "#ffb48a" : L.sky);
  scene.fog.color.copy(SKY);
  sun.color.set(w === "sunset" ? "#ffb070" : "#fff0d0"); sun.intensity = w === "rain" ? .45 : w === "sunset" ? .9 : 1;
  hemi.intensity = w === "rain" ? .55 : .75; hemi.color.set(w === "sunset" ? "#ffd6c0" : "#f2fff8");
  waterMat.uniforms.tint.value.set(w === "sunset" ? "#ffc9a8" : w === "rain" ? "#c9d3dc" : "#ffffff");
  rain.visible = w === "rain";
  if (rainLoop) { rainLoop.stop(); rainLoop = null; }
  if (w === "rain" && G.playing) rainLoop = sampleLoop("rain", .35);
  $("weatherTxt").textContent = WEATHERS[w].name;
}
function stepRain(dt) {
  if (!rain.visible) return;
  const a = rainGeo.attributes.position.array;
  for (let i = 0; i < RAIN_N; i++) {
    const o = i * 6; let y = a[o + 1] - 16 * dt;
    if (y < 0) { if (Math.random() < .08) ripple(a[o], a[o + 2], .25, "#e8f4ff", .5); y += 11; }
    a[o + 1] = y; a[o + 4] = y - .5;
  }
  rainGeo.attributes.position.needsUpdate = true;
}

// ------------------------------------------------------------------ 보스: 남은 시간 75초에 거대한 그림자
function spawnBoss() {
  G.bossSpawned = true;
  const s = newSpot("boss"); s.boss = true; s.fake = false; s.bossId = pickBoss();
  makeShadow(s, 5.2);
  shout("거대한 그림자가…!!", "hot", 1.6); flash("red"); shake = .8; sample("boss") || SFX.legend();
  hint("<em>빨간 소용돌이</em>에 던지면 보스와 승부!");
}
const R = { state: "idle", spot: null, species: null, target: new THREE.Vector3(), from: new THREE.Vector3(), fly: 0, flyDur: .8, timer: 0, nibbles: 0, dip: 0 };
let F = null; // 사투
let show = null; // 잡은 물고기 연출
let card = 0;

function resetRod() {
  if (R.spot) R.spot.busy = false;
  $("castM").hidden = true; $("aimLabels").hidden = true; aimRing.visible = false; aimDots.forEach((d) => { d.visible = false; });
  R.spot = null; R.state = "idle"; bobber.visible = false; $("bite").hidden = true;
  if (G.playing && !show) hint("물 위를 <em>꾹</em> 누르고 방향을 맞춘 뒤 <em>떼서</em> 던져요");
}
// 캐스팅: 꾹 누르고 있으면 힘 게이지가 오르내리고, 떼는 순간 날아간다. 방향은 누른 채 손가락(마우스)을 움직이거나 ← → 로
// 조준 고리가 거품 한가운데면 PERFECT(더 큰 물고기·빠른 입질), 거품 안이면 보통, 밖이면 아무것도 안 문다
const aimRing = new THREE.Mesh(new THREE.RingGeometry(.42, .58, 24), new THREE.MeshBasicMaterial({ color: "#fff8e8", transparent: true, opacity: .9, depthWrite: false }));
aimRing.rotation.x = -Math.PI / 2; aimRing.visible = false; scene.add(aimRing);
const aimDots = Array.from({ length: 10 }, () => { const m = new THREE.Mesh(new THREE.CircleGeometry(.07, 8), aimRing.material); m.rotation.x = -Math.PI / 2; m.visible = false; scene.add(m); return m; });
const AIM = { t: 0, pos: 0, dir: -Math.PI / 2, minD: 2.5, maxD: 20, speed: .7, key: false, spot: null, q: "miss" };
function aimStart(p) {
  if (R.state !== "idle" || F || show) return;
  audio();
  if (quizNeeded() && !G.quizPass) { HOLD.ptr = false; askQuiz(() => { G.quizPass = true; hint("정답! 이제 물 위를 <em>꾹</em> 눌러 던져요"); }); return; } // 문제를 맞혀야 던질 수 있다
  R.state = "aiming"; AIM.t = 0; AIM.key = !p;
  if (p) aimToward(p);
  AIM.maxD = Math.max(8, ...spots.map((s) => Math.hypot(s.x - angler.position.x, s.z - angler.position.z))) * 1.2;
  // 게이지에 m 눈금과 거품마다 거리 표시(거품 색). 물 위 거품 위에도 같은 거리 이름표
  const range = AIM.maxD - AIM.minD, at = (d) => `${clamp((d - AIM.minD) / range, 0, 1) * 100}%`;
  let marks = "";
  for (let m = Math.ceil(AIM.minD / 5) * 5; m <= AIM.maxD; m += 5) marks += `<i class="ctick" style="left:${at(m)}"><u>${m}m</u></i>`;
  for (const s of spots) {
    const d = Math.hypot(s.x - angler.position.x, s.z - angler.position.z), col = s.T.color === "rainbow" ? "linear-gradient(90deg,#ff4d6d,#ffd23f,#9cf25a,#3ec7ff,#b26bff)" : s.T.color;
    marks += `<i class="cmark" style="left:${at(d)};--c:${col}"></i>`;
    s.aimLabel = `<b class="alabel" style="--c:${col}">${d.toFixed(1)}m</b>`;
  }
  $("castMarks").innerHTML = marks;
  $("aimLabels").innerHTML = spots.map((s) => s.aimLabel).join(""); $("aimLabels").hidden = false;
  $("castM").hidden = false; aimRing.visible = true; aimDots.forEach((d) => { d.visible = true; }); A.cast = -.6; sample("reel", { rate: 1.3, vol: .4 });
  hint(TOUCH ? "누른 채로 <em>방향</em>을 맞추고, 고리가 거품에 오면 <em>떼요!</em>" : "누른 채로 <em>방향</em>(마우스·← →)을 맞추고, 고리가 거품에 오면 <em>떼요!</em>");
}
const castK = () => (GEAR.rod >= 2 ? 1.25 : 1);
function aimToward(p) { AIM.dir = Math.atan2(p.z - angler.position.z, p.x - angler.position.x); }
function aimPoint(pos, out) { const d = AIM.minD + pos * (AIM.maxD - AIM.minD); return out.set(angler.position.x + Math.cos(AIM.dir) * d, 0, angler.position.z + Math.sin(AIM.dir) * d); }
function stepAim(dt) {
  if (R.state !== "aiming") return;
  if (HOLD.left) AIM.dir -= dt * 1.1;
  if (HOLD.right) AIM.dir += dt * 1.1;
  AIM.dir = clamp(AIM.dir, -Math.PI + .25, -.25); // 물 쪽(앞)으로만
  AIM.t += dt; AIM.pos = tri(AIM.t * AIM.speed * 2);
  aimPoint(AIM.pos, aimRing.position); aimRing.position.y = .03;
  aimDots.forEach((d, i) => { aimPoint(AIM.pos * (i + 1) / 11, d.position); d.position.y = .03; });
  // 조준선 위에 있는 거품: 게이지에 그 거품 구간을 초록으로 보여 준다
  const cx = Math.cos(AIM.dir), cz = Math.sin(AIM.dir), range = AIM.maxD - AIM.minD;
  let zone = null;
  for (const s of spots) {
    if (s.busy) continue;
    const vx = s.x - angler.position.x, vz = s.z - angler.position.z, along = vx * cx + vz * cz, lat = Math.abs(vx * cz - vz * cx), r = s.T.r * 1.1 * castK();
    if (lat < r) { const half = Math.sqrt(r * r - lat * lat); const z = { s, c: (along - AIM.minD) / range, w: 2 * half / range, pc: (along - AIM.minD) / range, pw: 2 * Math.min(half, s.T.r * .35 * castK()) / range }; if (!zone || Math.abs(z.c - AIM.pos) < Math.abs(zone.c - AIM.pos)) zone = z; }
  }
  const zEl = $("castZone"); zEl.hidden = !zone;
  if (zone) { zEl.style.left = `${(zone.c - zone.w / 2) * 100}%`; zEl.style.width = `${zone.w * 100}%`; $("castPf").style.width = `${zone.pw / zone.w * 100}%`; }
  $("castNeedle").style.left = `${AIM.pos * 100}%`;
  $("castDist").textContent = `${(AIM.minD + AIM.pos * range).toFixed(1)}m`;
  const labels = $("aimLabels").children, r = renderer.domElement.getBoundingClientRect();
  spots.forEach((s, i) => { const el = labels[i]; if (!el) return; tmpV.set(s.x, .6, s.z).project(camera); el.style.transform = `translate(${r.left + (tmpV.x + 1) / 2 * r.width}px, ${r.top + (1 - tmpV.y) / 2 * r.height}px) translate(-50%, -100%)`; el.classList.toggle("on", AIM.spot === s); });
  const land = aimRing.position, hit = spots.find((s) => !s.busy && Math.hypot(s.x - land.x, s.z - land.z) < s.T.r * 1.1 * castK());
  AIM.spot = hit || null;
  AIM.q = !hit ? "miss" : Math.hypot(hit.x - land.x, hit.z - land.z) < hit.T.r * .35 * castK() ? "perfect" : "good";
  aimRing.material.color.set(AIM.q === "perfect" ? "#ffd23f" : AIM.q === "good" ? "#9cf25a" : "#fff8e8");
}
function castRelease() {
  if (R.state !== "aiming") return;
  G.quizPass = false; // 한 번 던지면 다음엔 또 문제
  $("aimLabels").hidden = true;
  $("castM").hidden = true; aimRing.visible = false; aimDots.forEach((d) => { d.visible = false; });
  R.state = "idle";
  const at = aimPoint(AIM.pos, new THREE.Vector3()), spot = AIM.spot;
  if (AIM.q === "perfect") { shout("나이스 캐스팅!!", "sun", 1); sample("perfect"); spot.castBonus = .12; }
  else if (spot) spot.castBonus = 0;
  castTo(spot, AIM.q, at);
}
function castTo(spot, quality = "good", at = null) {
  if (R.state !== "idle" || F || show) return;
  audio();
  R.spot = spot; if (spot) spot.busy = true; R.cast = spot ? quality : "miss";
  if (at) R.target.copy(at);
  else { const k = quality === "perfect" ? .08 : .3; R.target.set(spot.x + rand(-k, k), 0, spot.z + rand(-k, k)); }
  R.from.copy(rod.tip);
  R.fly = 0; R.flyDur = .45 + R.target.distanceTo(angler.position) * .045; R.state = "flying"; bobber.visible = true;
  A.cast = 1; SFX.cast(); hint("");
}
function landed() {
  SFX.plop(); ripple(R.target.x, R.target.z, .8); splash(R.target.x, R.target.z, 10, .45);
  const s = R.spot;
  if (R.cast === "miss") { // 거품 밖: 아무도 안 문다. 잠깐 뒤 줄을 걷는다
    shout("거품 밖이에요!", "cream", 1); SFX.lose();
    R.state = "missed"; setTimeout(() => { if (R.state === "missed") resetRod(); }, 900);
    return;
  }
  R.species = s.boss ? s.bossId || pickBoss() : s.species || pickSpecies(s.fake ? FAKE_TABLE : s.T.table);
  R.timer = (s.boss ? rand(1, 1.6) : rand(1.4, 3.6) * BAITS[G.bait].wait) * (R.cast === "perfect" ? .55 : 1); R.nibbles = s.boss ? 0 : Math.floor(rand(0, 3));
  R.state = "waiting"; hint("찌가 <em>쏙!</em> 들어가면 눌러요. 톡톡은 기다려요");
}
function earlyStrike() {
  shout("앗, 너무 빨라!", "hot", 1); SFX.lose(); flash("red");
  R.spot.age = R.spot.life; // 놀란 물고기가 흩어진다
  resetRod();
}

// 콤보 악보: 한 칸씩 + 우다다(빠른 방향키 묶음 → 감기로 마무리) + 좌우 버티기 + 가끔 감기
// 결정적인 순간(중간 고비·마지막 끌어올리기)은 "계속 연타하세요!" — 연타 속도(초당 횟수)가 기준보다 빠르면 원이 커지고
// 느리면 작아진다. 기준선을 넘으면 성공, 원이 다 사라지면 실패. 기준 속도는 사람 손에 맞춰 초당 2.4~4.6번.
// 같은 물고기라도 클수록(sizeT) 칸이 많고 빠르며, 연타 기준 속도가 높고 오래 버텨야 한다.
const DIRS = ["up", "down", "left", "right"];
// 크기 등급: 같은 물고기도 크기(sizeT)에 따라 월척 > S급 > A급 > B급 > 놔주자급
const GRADES = [
  { min: .92, name: "월척", color: "#ff4d6d", mult: 1.7 },
  { min: .72, name: "S급", color: "#d79a12", mult: 1.3 },
  { min: .45, name: "A급", color: "#3f8f5a", mult: 1.1 },
  { min: .18, name: "B급", color: "#2f7fc0", mult: 1 },
  { min: 0, name: "놔주자급", color: "#6b7280", mult: .5, release: true },
];
const gradeOf = (t) => GRADES.find((g) => t >= g.min);
function mashNote(sp, sizeT, final) {
  const power = Math.min(1, sp.points / 320);
  const hold = 2.2 + power * .8 + sizeT * .6;     // 초당 이만큼 눌러야 원이 그대로 (어린이 연타 초당 5~7번 기준, 보스도 초당 3.6번)
  const dur = 3 + power * 1.2 + sizeT * 1;        // 기준보다 초당 2번 빠르게 누르면 이만큼 걸려 성공
  return { type: "mash", dir: "any", hold: hold * (GEAR.rod >= 3 ? .9 : 1), grow: .65 / (2 * dur), win: 22, final };
}
// 미니게임 칸: 크기·등급이 클수록 영역이 좁고 빠르다(큰 물고기·보스가 너무 어렵다는 피드백으로 차이를 줄임)
function miniNote(type, sp, sizeT, hard = false) {
  const o = miniNote0(type, sp, sizeT);
  if (hard) HARD_MINI[o.type]?.(o, sp);
  return o;
}
// 어려운 물고기(S급·월척·보스)의 미니게임: 칸이 좁고, 더 많이, 더 빠르게
const HARD_MINI = {
  bar: (o) => { o.zone *= .72; o.speed *= 1.2; o.need = 3; o.win += 3; },
  rhythm: (o) => { o.need += 3; o.gap *= .85; o.win = 1.2 + (o.need + 4) * o.gap + 2.5; },
  dodge: (o) => { o.lanes = 5; o.gap *= .62; o.speed *= 1.15; o.dur += 2; o.win = o.dur + 4; }, // 세 줄 → 다섯 줄, 장애물 많이
  jump: (o) => { o.gap *= .78; o.speed *= 1.15; o.dur += 2; o.win = o.dur + 4; },
  feed: (o) => { o.need += 2; o.fall *= 1.2; o.gap *= .85; o.win = 6 + o.need * 1.6; },
  hold: (o) => { o.need *= 1.25; o.jerk *= 1.3; },
  simon: (o) => { o.len += 2; },
  spin: (o) => { o.need += 1; o.win += 2.6; },
  whack: (o) => { o.need += 3; o.stay *= .72; o.double = true; o.win = 6 + o.need * 1.8; }, // 두 마리가 같이 튀어나오기도
  track: (o) => { o.box *= .8; o.speed *= 1.25; },
  typing: (o) => { const L = Math.min(4, o.word.length + 1), list = WORDS.filter((w) => w.length === L); o.word = list[Math.floor(Math.random() * list.length)]; o.win = 4 + L * 2.4; },
  reflex: (o) => { o.need += 1; o.react *= .7; o.win += 3; },
  count: (o) => { o.need += 1; o.show *= .65; o.lo += 2; o.hi += 3; },
  bubble: (o) => { o.need += 4; o.rise *= 1.4; o.gap *= .7; o.win = 6 + o.need * 1.2; },
};
function miniNote0(type, sp, sizeT) {
  const power = Math.min(1, sp.points / 320) * .6; sizeT *= .6;
  // 타이밍 바: 초록 칸 넓게, 바늘 느리게. 빗나가도 하트는 안 깎이고 시간만 조금 줄어든다
  if (type === "bar") return { type, dir: "any", win: 8, zone: .32 - power * .08 - sizeT * .07, speed: .42 + power * .35 + sizeT * .3, need: 2 };
  if (type === "rhythm") { // 박자 낚시: 흘러오는 북을 선에 닿을 때 톡
    const need = 6 + Math.round(power * 3 + sizeT * 3), gap = .62 - power * .12 - sizeT * .1;
    return { type, dir: "any", need, gap, speed: 62 + power * 20, win: 1.2 + (need + 4) * gap + 2.5 };
  }
  if (type === "dodge") { // 장애물 피하기: 물고기를 위아래로 옮겨 바위·수초·깡통을 모두 피한다
    const dur = 7 + power * 2 + sizeT * 2;
    return { type, dir: "dodge", dur, speed: 52 + power * 20 + sizeT * 14, gap: .82 - power * .2 - sizeT * .15, win: dur + 4 };
  }
  if (type === "jump") { // 점프 넘기: 떠내려오는 통나무를 눌러서 뛰어넘는다
    const dur = 7 + power * 2 + sizeT * 2;
    return { type, dir: "any", dur, speed: 46 + power * 16 + sizeT * 12, gap: 1.15 - power * .25 - sizeT * .15, win: dur + 4 };
  }
  if (type === "feed") { // 먹이 받기: 뜰채를 좌우로 옮겨 떨어지는 지렁이는 받고 깡통은 피한다
    const need = 6 + Math.round(power * 3 + sizeT * 2);
    return { type, dir: "track", need, fall: 26 + power * 10 + sizeT * 8, gap: .62 - power * .1, win: 6 + need * 1.6 };
  }
  if (type === "hold") return { type, dir: "hold", win: 16, need: 2.6 + power * 1.4 + sizeT * 1.2, pull: .5 + power * .5 + sizeT * .3, jerk: .5 + power * 1.2 + sizeT * .6 };
  if (type === "typing") { // 영어 단어 타자: 클수록 긴 단어
    const L = clamp(Math.round(2 + power * 1.2 + sizeT * .9), 2, 4), list = WORDS.filter((w) => w.length === L);
    return { type, dir: "typing", word: list[Math.floor(Math.random() * list.length)], win: 4 + L * 2.4 };
  }
  if (type === "simon") return { type, dir: "simon", len: 3 + Math.round(power * 1.5 + sizeT), win: 40 };
  if (type === "spin") { const need = 2 + Math.round(power * 1.5 + sizeT); return { type, dir: "spin", need, win: 4 + need * 2.6 }; }
  if (type === "whack") { const need = 5 + Math.round(power * 2 + sizeT * 2); return { type, dir: "whack", need, stay: 1.25 - power * .3 - sizeT * .2, win: 6 + need * 2 }; }
  if (type === "reflex") { const need = 3; return { type, dir: "any", need, react: .7 - power * .15, win: 8 + need * 3 }; } // 번쩍 잡아채기
  if (type === "count") return { type, dir: "count", need: 2, show: 1.7 - power * .3, lo: 3, hi: 6 + Math.round(power * 2), win: 60 }; // 물고기 세기
  if (type === "bubble") { const need = 7 + Math.round(power * 2 + sizeT * 2); return { type, dir: "bubble", need, rise: .3 + power * .1, gap: .6 - power * .1, win: 6 + need * 1.3 }; } // 거품 터뜨리기
  // 따라잡기: 물고기가 느긋하게 헤엄치고 상자는 넉넉하게
  return { type: "track", dir: "track", win: 18, box: .38 - power * .07 - sizeT * .05, speed: .13 + power * .13 + sizeT * .09 };
}
function makeChart(sp, sizeT, hard = false) {
  const notes = [];
  let last = "";
  const arrow = () => { let d = DIRS[Math.floor(rand(0, 4))]; if (d === last && Math.random() < .6) d = DIRS[(DIRS.indexOf(d) + 1 + Math.floor(rand(0, 3))) % 4]; last = d; return d; };
  const n = Math.max(3, sp.notes + Math.round(sizeT * 2) - 1), winK = 1.12 - sizeT * .26;
  const mid = Math.max(0, sp.mash - 1);
  const mashAt = new Set(), zigAt = new Set(), burstAt = new Set();
  for (let i = 0; i < mid; i++) mashAt.add(Math.floor(n * (i + 1) / (mid + 1)));
  for (let i = 0; i < sp.zig; i++) zigAt.add(Math.max(1, Math.floor(n * (i + .5) / (sp.zig + .5))));
  const bursts = sp.tier === "흔함" || sp.tier === "꽝" ? (n >= 7 ? 1 : 0) : sp.tier === "보통" ? 1 : 2;
  for (let i = 0; i < bursts; i++) burstAt.add(Math.floor(n * (i + .3) / (bursts + .3)) + 1);
  for (let i = 0; i < n; i++) {
    const win = sp.win * winK * Math.pow(.975, i);
    if (mashAt.has(i)) { notes.push(mashNote(sp, sizeT, false)); last = ""; continue; }
    if (zigAt.has(i)) {
      const first = Math.random() < .5 ? "left" : "right", other = first === "left" ? "right" : "left";
      for (let k = 0; k < 4; k++) notes.push({ type: "tap", dir: k % 2 ? other : first, win: win * 1.1, zig: true });
      last = ""; continue;
    }
    if (burstAt.has(i)) { // 우다다: 짧은 시간에 방향키 3~4개, 감기로 마무리
      const len = sp.tier === "전설" ? 4 : 3;
      for (let k = 0; k < len; k++) notes.push({ type: "tap", dir: arrow(), win: Math.max(.45, win * .62), burst: true });
      notes.push({ type: "tap", dir: "reel", win: win * .9, finisher: true });
      continue;
    }
    if (i > 1 && Math.random() < .14) { notes.push({ type: "tap", dir: "reel", win }); continue; }
    notes.push({ type: "tap", dir: arrow(), win });
  }
  // 원 터치: 리듬 게임처럼 바깥 고리가 줄어드는 동안 원을 누른다. 다음 원은 앞 원 근처에 뜬다
  const style = sp.play || "arrow";
  if (style !== "arrow") {
    let on = style === "circle", run = 0, px = rand(.35, .65), py = rand(.42, .6), no = 0;
    for (const n of notes) {
      if (n.type !== "tap" || n.dir === "reel") { no = 0; continue; }
      if (style === "mix" && run-- <= 0) { on = !on; run = 2 + Math.floor(rand(0, 3)); no = 0; }
      if (!on) { no = 0; continue; }
      let nx, ny, tries = 0;
      do { nx = clamp(px + rand(-.3, .3), .16, .84); ny = clamp(py + rand(-.2, .2), .34, .72); } while (Math.hypot(nx - px, (ny - py) * .6) < .14 && ++tries < 12);
      px = nx; py = ny;
      Object.assign(n, { type: "circle", dir: "circle", x: px, y: py, no: ++no, win: n.win * (n.burst ? 1.5 : 1.3) + .2 });
      if (hard && !n.burst && Math.random() < (sp.boss ? .6 : .45)) { // 어려운 물고기: 원 두 개를 둘 다 눌러야 한다
        const sx = px > .5 ? -1 : 1; n.x2 = clamp(px + sx * rand(.2, .3), .14, .86); n.y2 = clamp(py + rand(-.14, .14), .34, .72); n.win *= 1.3;
      }
    }
  }
  // 미니게임을 사이사이에 고르게 끼운다. 목록에서 무작위로 몇 개만: 보스 3, 전설 2, 나머지 1
  const minis = [...(sp.minis || [])].sort(() => Math.random() - .5).slice(0, (sp.boss ? 3 : sp.tier === "전설" ? 2 : 1) + (hard ? 1 : 0));
  minis.forEach((type, k) => notes.splice(Math.round((notes.length * (k + 1)) / (minis.length + 1)) + k, 0, miniNote(type, sp, sizeT, hard)));
  notes.push(mashNote(sp, sizeT, true)); // 마지막 끌어올리기
  if (GEAR.rod >= 3) for (const n of notes) if (MINI_TYPES.has(n.type)) n.win *= 1.15; // 카본 낚싯대: 미니게임 시간 넉넉히
  return notes;
}

function hook() {
  if (R.state !== "bite") return;
  $("bite").hidden = true;
  const s = R.spot, sp = SPECIES[R.species];
  SFX.hook(); flash("white"); shake = .5;
  splash(R.target.x, R.target.z, 26, 1.2); ripple(R.target.x, R.target.z, 1.6);
  const sizeT = SPECIES[R.species].boss ? rand(.93, 1) : clamp((s?.sizeT ?? Math.random()) + (s?.castBonus || 0) + (GEAR.rod >= 5 ? .08 : 0), 0, 1);
  const fish = new Fish(R.species, sizeT);
  const hard = !!sp.boss || sizeT >= .72; // S급·월척·보스: 원 두 개 동시, 다섯 줄 피하기 등 더 어렵게
  const chart = makeChart(sp, sizeT, hard);
  const weight = chart.reduce((a, n) => a + (MINI_TYPES.has(n.type) || n.type === "mash" ? 3 : n.finisher ? 2 : 1), 0);
  F = { fish, sp, sizeT, cond: rand(.85, 1.15), chart, i: 0, weight, got: 0, hearts: (sp.boss ? 5 : 3) + (GEAR.rod >= 4 ? 1 : 0), maxHearts: (sp.boss ? 5 : 3) + (GEAR.rod >= 4 ? 1 : 0), ms: null, combo: 0, maxCombo: 0, perfect: 0, t: 0, noteT: 0, gauge: 0, taps: 0, gpop: 0, tapT: [], rate: 0, mood: "", tug: 0, tugSide: 1,
    hard, from: R.target.clone(), dist0: R.target.distanceTo(angler.position), leap: 0, leapV: 0, heading: 0, phase: 0, pulse: 0, bonus: s.fake ? 1 : s.T.bonus || 1 };
  R.state = "fight"; hint(""); document.body.classList.add("fighting");
  $("fight").hidden = false;
  const gr = gradeOf(sizeT), cm = Math.round(lerp(sp.len[0], sp.len[1], sizeT)), junk = sp.tier === "꽝";
  $("ftier").textContent = junk ? "???" : sp.tier; $("ftier").style.background = TIER_COLOR[sp.tier];
  $("fsize").textContent = junk ? "?" : `${gr.name} 약${cm}cm`; $("fsize").style.background = junk ? "" : gr.color; $("fsize").style.color = junk ? "" : "#fff8e8";
  $("fsize").classList.toggle("xl", gr.name === "월척" && !junk);
  $("fnameText").textContent = junk ? "걸렸다!" : gr.name === "월척" ? "월척이다!!" : sp.tier === "전설" ? "엄청난 힘이다!!" : sp.tier === "희귀" || gr.name === "S급" ? "묵직하다!" : "걸렸다!";
  $("hearts").innerHTML = HEART.repeat(F.hearts);
  $("combo").hidden = true;
  const big = sp.tier === "전설" || sp.boss || (gr.name === "월척" && sp.points >= 45);
  // 보스·대물은 사투 화면부터 다르게: 보스는 붉은 경고 화면과 체력바, 대물은 금빛 테두리
  document.body.classList.toggle("boss-fight", !!sp.boss); document.body.classList.toggle("big-fight", big && !sp.boss);
  if (sp.boss) {
    $("bossName").textContent = sp.name; $("bossHp").style.width = "100%";
    const w = $("warning"); w.hidden = false; w.classList.remove("go"); void w.offsetWidth; w.classList.add("go"); setTimeout(() => { w.hidden = true; }, 2400);
    SKY.set("#4a2a3c"); scene.fog.color.copy(SKY); sun.intensity = .5; sun.color.set("#ff8a8a"); waterMat.uniforms.tint.value.set("#b98aa0");
  }
  BEAT.mode = sp.boss ? "boss" : big ? "big" : "";
  if (sp.boss) { sample("bigsplash"); shake = 1; }
  shout(sp.boss ? "보스 등장!!" : big ? "대물이다!!" : "걸렸다!", big ? "hot" : "sun", sp.boss ? 1.4 : 1);
  if (big) { flash("gold"); SFX.legend(); }
  if (sp.boss) setTimeout(() => { if (F?.sp.boss && F.i === 0) { F.intro = 1.3; showModeCard(modeOf(F.chart[0]), F.chart[0]); } }, 2300); // 경고 띠가 지나간 뒤 모드 안내
  beatStart(sp.boss ? 156 : sp.tier === "전설" ? 150 : sp.tier === "희귀" ? 140 : 128);
  showNote();
  if (sp.boss) F.intro = 9; // 경고 띠 동안은 멈춤(위 타이머가 1.3으로 되돌린다)
}
function showNote() {
  const n = F.chart[F.i];
  const cur = $("cur"), key = $("curKey"), mash = n.type === "mash", circ = n.type === "circle";
  cur.classList.toggle("mashing", mash);
  $("lane").classList.toggle("circling", circ || MINI_TYPES.has(n.type));
  startMini(n);
  document.body.classList.toggle("finale", mash && !!n.final);
  showCircles(n);
  key.className = `key px k-${n.dir}`; key.innerHTML = mash ? "" : KEY_HTML(n.dir);
  cur.classList.remove("urgent", "pressed");
  key.style.animation = "none"; void key.offsetWidth; key.style.animation = ""; // 다시 튀어나오게
  $("curMash").hidden = !mash; $("curCount").hidden = !mash; $("mashCv").hidden = !mash;
  if (mash) {
    F.gauge = .35; F.taps = 0; F.tapT = []; F.rate = 0; F.mood = ""; $("curCount").textContent = "0";
    $("curMash").innerHTML = `계속 연타하세요!<small id="mashMood"><span class="kb-desk">아무 키나 · 스페이스를 빠르게</span><span class="kb-touch">화면을 빠르게 톡톡톡</span></small>`;
    if (n.final) { flash("red"); shake = .6; beatStart(Math.max(BEAT.bpm, 172)); } // 이름은 모드 카드가 알려 준다
  }
  if (n.zig && !F.chart[F.i - 1]?.zig) shout("좌우로 버텨!", "lime", .9);
  if (n.burst && !F.chart[F.i - 1]?.burst) shout("우다다다!", "hot", .8);
  if (n.finisher) shout("지금 감아!", "sun", .7);
  $("queue").innerHTML = F.chart.slice(F.i + 1, F.i + 4).map((q) => q.type === "mash" ? `<div class="key px k-mash"><div class="kb">연타</div></div>`
    : q.type === "circle" ? `<div class="key px k-circle"><i></i></div>`
    : MINI_TYPES.has(q.type) ? `<div class="key px k-mini" style="background:${MODES[q.type].color}"><div class="kb">${MODES[q.type].short}</div></div>`
    : `<div class="key px k-${q.dir}">${KEY_HTML(q.dir)}</div>`).join("");
  // 모드가 바뀌면 안내 카드
  const mode = modeOf(n);
  if (mode !== F.mode) { F.mode = mode; F.intro = 1.3; showModeCard(mode, n); }
  F.noteT = 0; frameLit = -1;
}
function judge(text, cls) { const el = $("judge"); el.textContent = text; el.className = `judge ${cls}`; void el.offsetWidth; el.classList.add("go"); }
function press(dir) {
  audio();
  if (R.state === "bite") return hook();
  if (R.state === "waiting" || R.state === "nibble") return earlyStrike();
  if (!F || F.intro > 0) return; // 모드 안내 중에는 쉬어요
  const n = F.chart[F.i];
  const cur = $("cur"); cur.classList.add("pressed"); setTimeout(() => cur.classList.remove("pressed"), 70);
  const fp = F.fish.group.position;
  if (n.type === "bar") return barPress(n, fp);
  if (n.type === "simon") return simonPress(n, dir);
  if (n.type === "spin") return spinPress(n, dir);
  if (n.type === "rhythm") return rhythmPress(n);
  if (n.type === "dodge") return dodgePress(n, dir);
  if (n.type === "jump") { const m = F.ms; if (m.y <= .01) { m.vy = 112; sample("bait", { rate: 1.6, vol: .5 }); } return; }
  if (n.type === "feed") return; // 좌우로 옮기기는 updateMini 가 본다
  if (n.type === "reflex") return reflexPress(n);
  if (n.type === "typing" || n.type === "whack" || n.type === "count" || n.type === "bubble") return; // 글자·칸·답·거품은 따로 받는다
  if (n.type === "hold" || n.type === "track") return; // 누르고 있기·따라가기는 updateMini 가 본다
  if (n.type === "mash") { // 무엇을 눌러도 된다. 원의 크기는 연타 속도로 정해진다(updateFight)
    F.tugSide = -F.tugSide; F.tug = F.tugSide; // 누를 때마다 물고기가 좌우로 휘청이며 끌려온다
    F.taps++; F.tapT.push(F.t); F.gpop = 1; F.gauge = Math.min(1, F.gauge + .004);
    const c = $("curCount"); c.textContent = F.taps; c.classList.remove("tick"); void c.offsetWidth; c.classList.add("tick");
    SFX.mash(F.taps, n.hold > 4.4 ? 20 : 8);
    A.kick = .7; shake = Math.max(shake, .1 + F.gauge * .14); F.pulse = 1; punch = .3 + F.gauge * .45;
    splash(fp.x, fp.z, 3 + Math.round(F.gauge * 6), .5 + F.gauge * .6);
    return;
  }
  if (dir === "tap" && TOUCH && n.type === "tap" && n.dir === "reel") dir = "reel"; // 휴대폰: 감기 칸은 화면 아무 데나 톡
  if (dir === "tap") return; // 그 밖의 화면 톡톡은 연타 때만
  if (n.type === "circle" && dir !== "circle") return; // 원 차례엔 키보드는 쉬고
  if (dir === "circle" && n.type !== "circle") return;
  if (dir !== n.dir) return miss("틀렸어!");
  const perfect = n.type === "circle" ? F.noteT >= n.win * .55 : F.noteT < n.win * .45; // 원: 고리가 원에 닿을 때 누르면 PERFECT
  F.tug = n.type === "circle" ? (n.x - .5) * 2.4 : dir === "left" ? -1 : dir === "right" ? 1 : (F.tugSide = -F.tugSide) * .6;
  if (n.type === "circle") { popCircle(n, perfect); if (perfect) { G.stat.circlePerfect++; missionEvent("circlePerfect"); } }
  F.got += 1; F.combo++; if (perfect) F.perfect++;
  punch = perfect ? 1 : .6; pxWave();
  judge(n.finisher ? (perfect ? "릴 감기 PERFECT!" : "릴 감기!") : perfect ? "PERFECT!" : "GOOD", perfect ? "perfect" : "good");
  if (n.finisher) { F.got += 1; flash("white"); A.kick = 1.4; }
  SFX.hit(dir, perfect);
  A.kick = 1; if (n.zig) A.side = dir === "left" ? -1 : 1;
  shake = Math.max(shake, perfect ? .22 : .12); F.pulse = 1;
  splash(fp.x, fp.z, perfect ? 12 : 6, .8);
  nextNote();
}
function nextNote() {
  F.maxCombo = Math.max(F.maxCombo, F.combo);
  const c = $("combo"); c.hidden = F.combo < 2; $("comboN").textContent = F.combo;
  c.classList.remove("bump"); void c.offsetWidth; c.classList.add("bump");
  F.i++;
  if (F.i >= F.chart.length) return endFight("caught");
  showNote();
}
// 잡은 물고기(왼쪽 아래): 종마다 한 줄, 썸네일은 모델을 작은 화면에 한 번 그려 둔다
let thumbR = null; const thumbs = {};
function fishThumb(id) {
  if (id in thumbs) return thumbs[id];
  const m = models[SPECIES[id].model || id]; if (!m) return "";
  try {
    if (!thumbR) { thumbR = new THREE.WebGLRenderer({ alpha: true, antialias: false, preserveDrawingBuffer: true }); thumbR.setPixelRatio(1); thumbR.setSize(112, 68); }
    const sc = new THREE.Scene(); sc.add(new THREE.HemisphereLight("#ffffff", "#556070", 2.4));
    const d = new THREE.DirectionalLight("#ffffff", 1.4); d.position.set(1, 2, 3); sc.add(d);
    sc.add(SkeletonUtils.clone(m.holder));
    const cam = new THREE.OrthographicCamera(-.66, .66, .4, -.4, .01, 10); cam.position.set(0, .1, 3); cam.lookAt(0, 0, 0);
    thumbR.render(sc, cam); thumbs[id] = thumbR.domElement.toDataURL();
  } catch { thumbs[id] = ""; }
  return thumbs[id];
}
// 기존 3D 모델에서 미리 렌더링한 투명 WebP. 추가 WebGL 컨텍스트 없이 바로 표시한다.
function miniFishThumb(id) {
  const sp = SPECIES[id];
  return `assets/minigames/fish/${sp ? sp.model || id : "minnow"}.webp`;
}
const fishImages = new Map();
function fishImage(id) {
  const src = miniFishThumb(id);
  if (!fishImages.has(src)) {
    const img = new Image(); img.src = src;
    fishImages.set(src, img);
  }
  return fishImages.get(src);
}
// 미니게임은 픽셀(도트) 화면이라 물고기도 도트로: 3D 모델을 찍은 그림을 가로 24칸으로 줄이고, 색을 몇 단계로 묶고, 남색 테두리 1칸을 두른다
// 종마다 모양·색은 그대로 살고 그림체는 미니게임 도트와 같아진다. 한 번 만든 것은 캔버스(그리기용)·data URL(두더지·거품·세기용)로 둔다
const sprites = new Map();
function pixelFish(img, W = 24) {
  const big = document.createElement("canvas"); big.width = img.naturalWidth; big.height = img.naturalHeight;
  const bx = big.getContext("2d", { willReadFrequently: true }); bx.drawImage(img, 0, 0);
  const a = bx.getImageData(0, 0, big.width, big.height).data; let x0 = big.width, y0 = big.height, x1 = 0, y1 = 0;
  for (let y = 0; y < big.height; y++) for (let x = 0; x < big.width; x++) if (a[(y * big.width + x) * 4 + 3] > 40) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  if (x1 <= x0) return null;
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1, h = Math.max(4, Math.min(Math.round(W * .75), Math.round(W * bh / bw)));
  // 반씩 줄여 가며 작게(한 번에 줄이면 얇은 지느러미가 끊긴다)
  let src = big, sx = x0, sy = y0, sw = bw, sh = bh;
  while (sw > W * 4) { const c = document.createElement("canvas"); c.width = Math.ceil(sw / 2); c.height = Math.ceil(sh / 2); const cx = c.getContext("2d"); cx.imageSmoothingQuality = "high"; cx.drawImage(src, sx, sy, sw, sh, 0, 0, c.width, c.height); src = c; sx = sy = 0; sw = c.width; sh = c.height; }
  const cv = document.createElement("canvas"); cv.width = W + 2; cv.height = h + 2;
  const cx = cv.getContext("2d", { willReadFrequently: true }); cx.imageSmoothingQuality = "high"; cx.drawImage(src, sx, sy, sw, sh, 1, 1, W, h);
  const d = cx.getImageData(0, 0, cv.width, cv.height), p = d.data, N = cv.width * cv.height, on = new Uint8Array(N);
  const q = (v) => Math.round(Math.min(255, v * .96) / 42.5) * 42.5; // 7단계 색(흰 물고기가 하얗게 날아가지 않게 살짝 어둡게)
  for (let i = 0; i < N; i++) { const k = i * 4; if (p[k + 3] > 110) { on[i] = 1; const al = p[k + 3] / 255; p[k] = q(p[k] / al); p[k + 1] = q(p[k + 1] / al); p[k + 2] = q(p[k + 2] / al); p[k + 3] = 255; } else p[k + 3] = 0; }
  for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) {
    const i = y * cv.width + x; if (on[i]) continue;
    if ((x > 0 && on[i - 1]) || (x < cv.width - 1 && on[i + 1]) || (y > 0 && on[i - cv.width]) || (y < cv.height - 1 && on[i + cv.width])) { const k = i * 4; p[k] = 19; p[k + 1] = 22; p[k + 2] = 46; p[k + 3] = 255; }
  }
  cx.putImageData(d, 0, 0);
  return { cv, url: cv.toDataURL() };
}
// W=24: 두더지·거품·세기 칸(크게) / W=12: 캔버스 미니게임(도트 한 칸 = 미니게임 화면 한 칸, 예전 노란 물고기 크기)
function fishSprite(id, W = 24) {
  const key = id + ":" + W; if (sprites.has(key)) return sprites.get(key);
  const img = fishImage(id); if (!img.complete || !img.naturalWidth) return null;
  let sp = null; try { sp = pixelFish(img, W); } catch (e) { console.warn("도트 물고기", id, e); }
  sprites.set(key, sp); return sp;
}
const portraitLoads = {};
function preloadFishPics(place) {
  return portraitLoads[place] ||= Promise.all(MINI_FISH[place].map((id) => fishImage(id).decode().then(() => { fishSprite(id); fishSprite(id, 12); }).catch(() => {})));
}
function updateBag() {
  const by = new Map();
  for (const c of G.caught) { const e = by.get(c.id) || { n: 0, top: null, at: 0 }; e.n++; e.at = by.size + G.caught.indexOf(c); if (!e.top || c.cm > e.top.cm) e.top = c; by.delete(c.id); by.set(c.id, e); }
  const rows = [...by.entries()].slice(innerWidth < 560 ? -3 : -6); // 아래에서 위로 쌓여서 최근에 잡은 종이 맨 위
  const total = G.caught.filter((c) => SPECIES[c.id].points).length;
  $("bag").innerHTML = rows.length ? rows.map(([id, e]) => {
    const g = GRADES.find((x) => x.name === e.top.grade);
    return `<div class="row"><img alt="" src="${fishThumb(id)}"><span>${SPECIES[id].name}</span>${g ? `<span class="g" style="background:${g.color}">${g.name}</span>` : ""}<span class="n">×${e.n}</span></div>`;
  }).join("") + `<div class="title">잡은 물고기 ${total}마리</div>` : "";
}
// 원 터치 화면: 지금 원(누를 수 있음) + 다음 원(흐릿하게 미리 보기)
function showCircles(n) {
  const box = $("circles"); box.innerHTML = "";
  if (!n || n.type !== "circle") return;
  const next = F.chart[F.i + 1];
  if (next?.type === "circle") box.insertAdjacentHTML("beforeend", `<div class="hitc ghost" style="left:${next.x * 100}%;top:${next.y * 100}%"><b>${next.no}</b></div>`);
  const two = n.x2 != null; // 원 두 개: 둘 다 눌러야 한 번
  box.insertAdjacentHTML("beforeend", `<div class="hitc ${two ? "dual" : ""}" id="hitc" style="left:${n.x * 100}%;top:${n.y * 100}%"><i class="appr" id="appr"></i><b>${n.no}</b>${two ? "<small>둘 다!</small>" : ""}</div>`
    + (two ? `<div class="hitc dual" id="hitc2" style="left:${n.x2 * 100}%;top:${n.y2 * 100}%"><i class="appr"></i><b>${n.no}</b><small>둘 다!</small></div>` : ""));
  for (const el of box.querySelectorAll(".hitc:not(.ghost)")) el.addEventListener("pointerdown", (e) => {
    e.preventDefault(); e.stopPropagation();
    if (!two) return press("circle");
    if (el.classList.contains("done") || !F || F.intro > 0) return;
    el.classList.add("done"); sample("tap", { rate: 1.3, vol: .6 }) || SFX.hit("up", false);
    if (box.querySelectorAll(".hitc.done").length >= 2) press("circle");
  });
}
function ringCircle(n) {
  const k = clamp(F.noteT / n.win, 0, 1);
  for (const a of $("circles").querySelectorAll(".hitc:not(.ghost) .appr")) {
    a.style.transform = `translate(-50%, -50%) scale(${(1 + 2.3 * (1 - k)).toFixed(3)})`;
    a.classList.toggle("now", k >= .55);
  }
}
function popCircle(n, perfect) {
  const el = document.createElement("div");
  el.className = `hitpop ${perfect ? "perfect" : ""}`; el.style.left = `${n.x * 100}%`; el.style.top = `${n.y * 100}%`;
  el.textContent = perfect ? "PERFECT" : "GOOD";
  $("fight").appendChild(el); setTimeout(() => el.remove(), 500);
}
// ------------------------------------------------------------------ 미니게임: 타이밍 바 · 줄 텐션 · 물고기 따라잡기
const MINI_TYPES = new Set(["bar", "hold", "track", "typing", "simon", "spin", "whack", "rhythm", "dodge", "jump", "feed", "reflex", "count", "bubble"]);
// 타자 낚시 단어(한글). 클수록 긴 단어
const WORDS = ["낚시", "바다", "강물", "붕어", "잉어", "미끼", "파도", "거품", "연못", "고래", "조개", "그물", "바람", "노을", "수달", "문어", "모래", "등대",
  "물고기", "낚싯대", "물방울", "소나기", "무지개", "물보라", "지렁이", "개구리", "해파리", "오징어", "갈매기", "뱃고동",
  "낚시대회", "바닷바람", "물고기떼", "고기잡이", "여름방학", "파도소리", "갈매기떼", "보물상자"];
const DECOY = [..."가나다라마바사아자차카타파하고누도루무부수우주"];
// 모드가 바뀔 때 1.3초 동안 이름과 방법을 먼저 보여 준다
const MODES = {
  arrow: { title: "방향키 콤보", tip: "나오는 화살표를 빠르게!", tipTouch: "나오는 화살표 버튼을 빠르게!", color: "#ffd23f" },
  circle: { title: "원 터치", tip: "고리가 원에 닿을 때 클릭!", tipTouch: "고리가 원에 닿을 때 톡!", color: "#ff6bb5" },
  bar: { title: "타이밍 바", tip: "바늘이 초록 칸일 때 스페이스!", tipTouch: "바늘이 초록 칸일 때 톡!", color: "#9cf25a", short: "바" },
  hold: { title: "줄 버티기", tip: "스페이스를 꾹 — 빨개지면 떼요", tipTouch: "화면을 꾹 — 빨개지면 떼요", color: "#3ec7ff", short: "줄" },
  track: { title: "따라잡기", tip: "← → 로 상자를 물고기에!", tipTouch: "화면을 좌우로 끌어 상자를 물고기에!", color: "#3ec7ff", short: "추적" },
  typing: { title: "타자 낚시", tip: "나온 낱말을 한글로 쳐요", tipTouch: "글자를 순서대로 눌러요", color: "#b26bff", short: "가나" },
  simon: { title: "기억 낚시", tip: "보여준 화살표 순서를 기억해 똑같이!", tipTouch: "보여준 화살표 순서를 기억해 똑같이!", color: "#ffd23f", short: "기억" },
  spin: { title: "릴 돌리기", tip: "↑ → ↓ ← 순서로 빙글빙글!", tipTouch: "화면을 빙글빙글 돌려요!", color: "#9cf25a", short: "릴" },
  whack: { title: "튀어나온 물고기 잡기", tip: "튀어나온 물고기를 클릭! (키 Q W E / A S D / Z X C)", tipTouch: "튀어나온 물고기를 톡!", color: "#ff9f1c", short: "잡기" },
  rhythm: { title: "박자 낚시", tip: "북이 선에 닿을 때 스페이스!", tipTouch: "북이 선에 닿을 때 톡!", color: "#ff6bb5", short: "박자" },
  dodge: { title: "장애물 피하기", tip: "↑ ↓ 로 물고기를 옮겨 바위·수초·깡통을 모두 피해요!", tipTouch: "화면 위·아래를 눌러 바위·수초·깡통을 모두 피해요!", color: "#9cf25a", short: "피하기" },
  jump: { title: "점프 넘기", tip: "통나무가 오면 스페이스로 폴짝!", tipTouch: "통나무가 오면 화면을 톡 — 폴짝!", color: "#ffd23f", short: "점프" },
  feed: { title: "먹이 받기", tip: "← → 로 뜰채를 옮겨 지렁이만 받아요!", tipTouch: "화면을 좌우로 끌어 지렁이만 받아요!", color: "#ff9f1c", short: "먹이" },
  reflex: { title: "번쩍 잡아채기", tip: "'지금!'이 뜨면 바로 아무 키나! 먼저 누르면 안 돼요", tipTouch: "'지금!'이 뜨면 바로 톡! 먼저 누르면 안 돼요", color: "#ff4d6d", short: "번쩍" },
  count: { title: "물고기 세기", tip: "잠깐 보인 물고기는 몇 마리? (1 2 3 키)", tipTouch: "잠깐 보인 물고기는 몇 마리?", color: "#3ec7ff", short: "세기" },
  bubble: { title: "거품 터뜨리기", tip: "올라가는 거품을 클릭해 터뜨려요!", tipTouch: "올라가는 거품을 톡톡 터뜨려요!", color: "#b26bff", short: "거품" },
  mash: { title: "연타!", tip: "아무 키나 빠르게 마구!", tipTouch: "화면을 빠르게 톡톡톡!", color: "#ff4d6d" },
};
const modeOf = (n) => (n.type === "tap" ? "arrow" : n.type);
const TOUCH = matchMedia("(hover: none), (pointer: coarse)").matches;
function showModeCard(mode, n) {
  const M = MODES[mode], el = $("modeCard");
  el.style.setProperty("--mc", M.color);
  $("modeTitle").textContent = mode === "mash" && n.final ? "마지막 한 방!" : M.title;
  $("modeTip").textContent = TOUCH ? M.tipTouch : M.tip;
  el.hidden = false; el.classList.remove("go"); void el.offsetWidth; el.classList.add("go");
  document.body.classList.add("intro");
  sample("bait", { rate: .8 });
}
function endIntro() {
  $("modeCard").hidden = true; document.body.classList.remove("intro");
  if (!TOUCH && F?.chart[F.i]?.type === "typing") $("typeIn")?.focus();
  const key = $("curKey"); key.style.animation = "none"; void key.offsetWidth; key.style.animation = "";
}
const HOLD = { space: false, left: false, right: false, ptr: false, px: .5 };
const miniCtx = $("miniCv").getContext("2d");
// 판정 좌표는 128×40 그대로 두고, 그림만 4배 해상도로 그려 눈·지느러미를 살린다.
miniCtx.setTransform(4, 0, 0, 4, 0, 0);
let tensionLoop = null;
const MINI_CAP = {
  typing: '<span class="kb-desk">입력칸에 한글로 쳐요 (영어가 나오면 <b style="color:var(--sun)">한/영</b> 키!)</span><span class="kb-touch">아래 글자를 순서대로 눌러요</span>',
  simon: '잘 보고 → 똑같은 순서로 <span class="kb-desk">방향키</span><span class="kb-touch">화살표 버튼</span>!',
  spin: '<span class="kb-desk">↑ → ↓ ← 순서로 계속 눌러 릴을 감아요</span><span class="kb-touch">릴 둘레를 손가락으로 빙글빙글 돌려요</span>',
  whack: '튀어나온 물고기를 <span class="kb-desk">클릭하거나 Q W E / A S D / Z X C</span><span class="kb-touch">톡!</span> 3마리 놓치면 실패',
  bar: '바늘이 <b style="color:var(--lime)">초록 칸</b>에 왔을 때 눌러요! <span class="kb-desk">(스페이스·방향키)</span><span class="kb-touch">(화면 톡)</span>',
  hold: '<span class="kb-desk">스페이스를</span><span class="kb-touch">화면을</span> 꾹 눌러 감고, <b style="color:var(--hot)">빨개지면 떼요!</b> 초록에서 버티기',
  rhythm: '흘러오는 북이 <b style="color:var(--sun)">노란 선</b>에 닿을 때 <span class="kb-desk">스페이스(아무 키)</span><span class="kb-touch">화면 톡</span>! 4개 놓치면 실패',
  dodge: '<span class="kb-desk">↑ ↓ 로</span><span class="kb-touch">화면 위·아래를 눌러</span> 물고기를 옮겨 <b style="color:var(--hot)">바위·수초·깡통 모두</b> 피해요! 3번 부딪히면 실패',
  jump: '통나무가 다가오면 <span class="kb-desk">스페이스(아무 키)</span><span class="kb-touch">화면 톡</span>으로 폴짝 뛰어넘어요! 3번 부딪히면 실패',
  feed: '<span class="kb-desk">← → 로</span><span class="kb-touch">화면을 좌우로 끌어</span> 뜰채를 옮겨 <b style="color:var(--sun)">지렁이</b>는 받고 <b style="color:var(--hot)">깡통</b>은 피해요! 깡통 3개면 실패',
  reflex: '<b style="color:var(--hot)">지금!</b>이 뜨면 바로 <span class="kb-desk">아무 키</span><span class="kb-touch">화면 톡</span>! 먼저 누르거나 늦으면 X, 3번이면 실패',
  count: '잠깐 보인 물고기를 세어 맞는 수를 골라요 <span class="kb-desk">(1 2 3 키)</span>',
  bubble: '거품이 위로 빠져나가기 전에 <span class="kb-desk">클릭</span><span class="kb-touch">톡</span>! 4개 놓치면 실패',
  track: '<span class="kb-desk">← → 를 눌러</span><span class="kb-touch">화면을 좌우로 끌어</span> 상자로 물고기를 따라가요!',
};
function startMini(n) {
  const on = !!n && MINI_TYPES.has(n.type);
  $("mini").hidden = !on;
  if (document.activeElement?.id === "typeIn") document.activeElement.blur();
  if (tensionLoop) { tensionLoop.stop(); tensionLoop = null; }
  if (!on) return;
  F.ms = n.type === "bar" ? { hits: 0, zc: rand(.3, .7), cool: 0, pos: 0 }
    : n.type === "hold" ? { ten: .35, prog: 0, jerkT: rand(.8, 1.6), slack: 0 }
    : n.type === "track" ? { fx: .5, ft: rand(.15, .85), bx: .5, prog: .3, burst: 0 }
    : n.type === "typing" ? { idx: 0 }
    : n.type === "simon" ? { seq: Array.from({ length: n.len }, () => DIRS[Math.floor(Math.random() * 4)]), phase: "watch", t: -.3, idx: 0, limit: 2.5 + n.len * 1.1 }
    : n.type === "spin" ? { turns: 0, last: -1, pa: null }
    : n.type === "rhythm" ? { notes: rhythmNotes(n), hits: 0, esc: 0, cool: 0, flash: 0 }
    : n.type === "dodge" ? { lane: (n.lanes || 3) >> 1, y: (n.lanes || 3) >> 1, obs: [], spawn: 1, t: 0, hit: 0, inv: 0 }
    : n.type === "jump" ? { y: 0, vy: 0, obs: [], spawn: 1, t: 0, hit: 0, inv: 0 }
    : n.type === "feed" ? { bx: .5, drops: [], spawn: .4, got: 0, bad: 0, lost: 0, pop: 0 }
    : n.type === "reflex" ? { phase: "wait", t: rand(1.1, 2.3), hits: 0, bad: 0 }
    : n.type === "count" ? { ok: 0, phase: "show", t: 0, k: 0 }
    : n.type === "bubble" ? { bubs: [], spawn: .2, hits: 0, esc: 0, id: 0 }
    : { cell: -1, t: 0, next: .5, hits: 0, esc: 0 };
  const dom = DOM_MINIS.has(n.type);
  $("miniCv").hidden = dom; $("miniDom").hidden = !dom;
  $("miniCap").innerHTML = MINI_CAP[n.type] || "";
  renderMiniDom(n);
}
const DOM_MINIS = new Set(["typing", "simon", "whack", "reflex", "count", "bubble"]);
// 작은 칸에서도 눈·꼬리가 잘 구별되는 종을 사용한다. 이미지 디코딩을 마친 뒤에만 등장시킨다.
const MINI_FISH = {
  fresh: ["minnow", "pirami", "gakshi", "crucian", "bluegill", "carp", "bass", "trout", "mandarin", "goldkoi"],
  sea: ["jack", "mackerel", "puffer", "seabream", "yellowtail", "tuna", "bollak", "gamsungdom"],
};
const fishPics = () => MINI_FISH[PLACE].filter((id) => fishSprite(id));
const fishPic = () => { const ids = fishPics(); return ids.length ? fishSprite(ids[Math.floor(Math.random() * ids.length)]).url : BLANK_PX; };
// 캔버스 미니게임(점프·피하기·따라가기): 도트 한 칸이 화면 픽셀 정수배가 되게 크기를 맞춰 또렷하게(캔버스는 4배 해상도)
function drawMiniFish(c, x, y, w, h, dir = 1) {
  const sp = fishSprite(PLACE === "sea" ? "seabream" : "pirami", 12) || fishSprite(fishPics()[0], 12); if (!sp) return;
  const W = sp.cv.width, Hh = sp.cv.height, k = Math.max(2, Math.min(4, Math.round(Math.min(w / W, h / Hh) * 4))) / 4; // 도트 한 칸 = 2~4 화면 픽셀
  c.save(); c.imageSmoothingEnabled = false; c.translate(Math.round(x * 4) / 4, Math.round(y * 4) / 4); c.scale(dir, 1);
  c.drawImage(sp.cv, Math.round(-W * k * 2) / 4, Math.round(-Hh * k * 2) / 4, W * k, Hh * k); c.restore();
}
// 점프 넘기·먹이 받기에 떨어질/떠내려올 것 하나 만들기
const feedDrop = () => ({ x: rand(8, 120), y: -4, bad: Math.random() < .3, k: Math.floor(rand(0, 3)) });
const tri = (x) => { const f = x % 2; return f < 1 ? f : 2 - f; };
function barPress(n, fp) {
  const m = F.ms; if (m.cool > 0) return;
  m.cool = .18;
  const d = Math.abs(m.pos - m.zc);
  if (d > n.zone / 2) { // 빗나감: 하트 대신 시간을 조금 쓴다
    m.cool = .45; F.noteT += .6; judge("빗나감", "miss"); SFX.nibble(); shake = Math.max(shake, .15);
    return;
  }
  const perfect = d < n.zone / 6;
  m.hits++; m.zc = rand(.22, .78); if (perfect) { F.perfect++; G.stat.barPerfect++; missionEvent("barPerfect"); }
  judge(perfect ? "PERFECT!" : "GOOD", perfect ? "perfect" : "good"); pxWave();
  sample("ding", { rate: perfect ? 1.25 : 1 }) || SFX.hit("up", perfect);
  F.tug = (F.tugSide = -F.tugSide); A.kick = 1; shake = Math.max(shake, .2); punch = .8; F.pulse = 1; splash(fp.x, fp.z, 10, .8);
  if (m.hits >= n.need) miniWin(n);
}
// ---- 타자·기억·릴·두더지: 화면 그리기(DOM)와 입력
const WHACK_KEYS = ["KeyQ", "KeyW", "KeyE", "KeyA", "KeyS", "KeyD", "KeyZ", "KeyX", "KeyC"];
function renderMiniDom(n) {
  const box = $("miniDom"), m = F.ms;
  if (n.type === "typing") {
    const decoys = DECOY.filter((c) => !n.word.includes(c)).sort(() => Math.random() - .5).slice(0, 2);
    const letters = [...new Set([...n.word, ...decoys])].sort(() => Math.random() - .5);
    box.className = "minidom typing";
    box.innerHTML = `<div class="word">${[...n.word].map((c, i) => `<span class="${i < m.idx ? "ok" : i === m.idx ? "now" : ""}">${c}</span>`).join("")}</div>
      <input class="typein kb-desk" id="typeIn" autocomplete="off" autocapitalize="off" spellcheck="false" lang="ko" placeholder="여기에 한글로!">
      <div class="letters kb-touch">${letters.map((c) => `<button class="px" data-letter="${c}">${c}</button>`).join("")}</div>`;
    box.querySelectorAll("[data-letter]").forEach((b) => b.addEventListener("pointerdown", (e) => { e.preventDefault(); e.stopPropagation(); typeLetter(b.dataset.letter); }));
    const inp = $("typeIn");
    inp.addEventListener("input", (e) => typeCheck(e.isComposing));
    inp.addEventListener("compositionend", () => typeCheck(false));
    inp.addEventListener("pointerdown", (e) => e.stopPropagation());
    if (!TOUCH && !(F.intro > 0)) setTimeout(() => inp.focus(), 0);
  } else if (n.type === "simon") {
    box.className = "minidom simon";
    box.innerHTML = `<div class="phase" id="simonPhase">잘 봐요!</div><div class="slots">${m.seq.map((d, i) => `<div class="key px slot" data-i="${i}"></div>`).join("")}</div>`;
  } else if (n.type === "whack") {
    box.className = "minidom whack";
    box.innerHTML = `<div class="grid">${WHACK_KEYS.map((k, i) => `<button class="hole px" data-cell="${i}" aria-label="${k.slice(3)} 칸 물고기 잡기"><img class="wf" alt="" src="${fishPic()}" draggable="false"><i class="kb-desk">${k.slice(3)}</i></button>`).join("")}</div><div class="whackinfo" id="whackInfo"></div>`;
    box.querySelectorAll("[data-cell]").forEach((b) => b.addEventListener("pointerdown", (e) => { e.preventDefault(); e.stopPropagation(); whackCell(+b.dataset.cell); }));
  } else if (n.type === "reflex") {
    box.className = "minidom reflex";
    box.innerHTML = `<button class="rfx px" id="rfx"><b id="rfxT">기다려…</b></button><div class="whackinfo" id="rfxInfo"></div>`;
    $("rfx").addEventListener("pointerdown", (e) => { e.preventDefault(); e.stopPropagation(); press("tap"); });
  } else if (n.type === "count") {
    box.className = "minidom count";
    box.innerHTML = `<div class="cpond px" id="cpond"></div><div class="copts" id="copts"></div><div class="whackinfo" id="cntInfo"></div>`;
    countRound(n);
  } else if (n.type === "bubble") {
    box.className = "minidom bubble";
    box.innerHTML = `<div class="bpond px" id="bpond"></div><div class="whackinfo" id="bubInfo"></div>`;
  } else { box.className = "minidom"; box.innerHTML = ""; }
}
// ---- 물고기 세기: 물고기를 잠깐 보여 주고 몇 마리였는지 고른다
function countRound(n) {
  const m = F.ms, k = Math.floor(rand(n.lo, n.hi + 1)), pond = $("cpond"), used = [];
  m.k = k; m.phase = "show"; m.t = 0;
  const pics = Array.from({ length: k }, () => { let x, y, tries = 0; do { x = rand(4, 80); y = rand(6, 70); } while (used.some((u) => Math.hypot(u[0] - x, (u[1] - y) * .8) < 15) && ++tries < 30); used.push([x, y]); return `<img alt="" src="${fishPic()}" style="left:${x}%;top:${y}%;transform:scaleX(${Math.random() < .5 ? -1 : 1})">`; });
  pond.innerHTML = pics.join(""); pond.classList.remove("hide");
  const opts = [...new Set([k, k + (Math.random() < .5 ? 1 : -1), k + (Math.random() < .5 ? 2 : -2), k + 1, k - 1])].filter((v) => v > 0).slice(0, 3).sort((a, b) => a - b);
  $("copts").innerHTML = opts.map((v, i) => `<button class="go alt px" data-cnt="${v}" disabled><i class="kb-desk">${i + 1}</i> ${v}마리</button>`).join("");
  $("copts").querySelectorAll("[data-cnt]").forEach((b) => b.addEventListener("pointerdown", (e) => { e.preventDefault(); e.stopPropagation(); countPick(n, +b.dataset.cnt); }));
  $("cntInfo").textContent = `${m.ok} / ${n.need}번 맞히기`;
}
function countPick(n, v) {
  const m = F.ms; if (!F || F.intro > 0 || m.phase !== "pick") return;
  if (v !== m.k) { m.phase = "wrong"; $("cpond").classList.remove("hide"); return miss(`${m.k}마리였어!`); }
  m.ok++; sample("ding", { rate: 1.2 }) || SFX.hit("up", true); goodHit(true); judge("정답!", "perfect");
  if (m.ok >= n.need) return miniWin(n);
  countRound(n);
}
// ---- 번쩍 잡아채기: '지금!'이 뜨면 바로 누른다(먼저 누르면 헛손질)
function reflexPress(n) {
  const m = F.ms, el = $("rfx");
  if (m.phase === "wait") { m.bad++; m.t = rand(1, 2); judge("너무 빨라!", "miss"); SFX.nibble(); shake = Math.max(shake, .25); if (m.bad >= 3) return miss("헛손질 세 번!"); return; }
  const perfect = m.t > n.react * .5;
  m.hits++; m.phase = "wait"; m.t = rand(.9, 2.1); el?.classList.remove("go"); $("rfxT").textContent = "기다려…";
  judge(perfect ? "번쩍 PERFECT!" : "잡았다!", perfect ? "perfect" : "good"); sample("bait", { rate: 1.5 }) || SFX.hit("up", perfect); goodHit(perfect);
  if (m.hits >= n.need) miniWin(n);
}
function goodHit(perfect) {
  const fp = F.fish.group.position;
  F.tug = (F.tugSide = -F.tugSide); A.kick = 1; shake = Math.max(shake, .18); punch = .7; F.pulse = 1; splash(fp.x, fp.z, 8, .7);
  if (perfect) F.perfect++;
}
// 컴퓨터: 입력칸의 한글을 낱말과 비교. 조합 중인 마지막 글자(곡→고기)는 아직 판정하지 않는다
function typeCheck(composing) {
  if (!F || F.intro > 0) return;
  const n = F.chart[F.i], m = F.ms, inp = $("typeIn"); if (n.type !== "typing" || !inp) return;
  const v = inp.value.replace(/\s/g, "");
  if (/[a-z]/i.test(v)) { inp.value = n.word.slice(0, m.idx); toastHint("한/영 키를 눌러 한글로 바꿔요!"); return; }
  if (v === n.word) { setTyped(n, n.word.length); F.perfect++; inp.blur(); return miniWin(n); }
  const done = composing ? v.slice(0, -1) : v;
  if (!n.word.startsWith(done)) { // 틀린 글자: 시간 조금 깎고 맞는 데까지 되돌린다
    F.noteT += .8; shake = Math.max(shake, .2); SFX.nibble(); typoShake();
    inp.blur(); inp.value = n.word.slice(0, m.idx); inp.focus();
    return;
  }
  if (done.length > m.idx) setTyped(n, done.length);
}
function setTyped(n, k) {
  const m = F.ms;
  while (m.idx < k) { m.idx++; sample("ding", { rate: semi(m.idx * 2) * .9 }) || SFX.hit("up", true); goodHit(false); }
  $("miniDom").querySelectorAll(".word span").forEach((s, i) => { s.className = i < m.idx ? "ok" : i === m.idx ? "now" : ""; });
}
function typoShake() { const w = $("miniDom").querySelector(".word"); if (!w) return; w.classList.remove("bad"); void w.offsetWidth; w.classList.add("bad"); }
let hintT = 0;
function toastHint(text) { if (performance.now() - hintT < 1500) return; hintT = performance.now(); toast(text); }
// 휴대폰: 글자 버튼을 순서대로
function typeLetter(c) {
  if (!F || F.intro > 0) return;
  const n = F.chart[F.i]; if (n.type !== "typing") return;
  const m = F.ms;
  if (c !== n.word[m.idx]) { F.noteT += .6; shake = Math.max(shake, .2); SFX.nibble(); typoShake(); return; }
  setTyped(n, m.idx + 1);
  if (m.idx >= n.word.length) { F.perfect++; miniWin(n); }
}
function simonPress(n, dir) {
  const m = F.ms;
  if (m.phase !== "input" || !DIRS.includes(dir)) return;
  const slot = $("miniDom").querySelector(`[data-i="${m.idx}"]`);
  if (dir !== m.seq[m.idx]) return miss("순서가 틀렸어!");
  if (slot) { slot.className = `key px slot k-${dir}`; slot.innerHTML = ARROW_SVG[dir]; }
  m.idx++; sample("ding", { rate: semi(m.idx * 2) }) || SFX.hit(dir, true); goodHit(true);
  if (m.idx >= m.seq.length) miniWin(n);
}
const SPIN_ORDER = ["up", "right", "down", "left"];
function spinPress(n, dir) {
  const m = F.ms, i = SPIN_ORDER.indexOf(dir);
  if (i < 0) return;
  if (m.last < 0 || i === (m.last + 1) % 4) { if (m.last >= 0) spinAdd(n, .25); m.last = i; }
  else shake = Math.max(shake, .08); // 거꾸로 돌리면 헛돈다
}
function spinAdd(n, d) {
  const m = F.ms, before = Math.floor(m.turns * 4);
  m.turns += d;
  if (Math.floor(m.turns * 4) > before) { SFX.mash(Math.floor(m.turns * 4), 8); goodHit(false); }
  if (m.turns >= n.need) miniWin(n);
}
function whackCell(i) {
  if (!F || F.intro > 0) return;
  const n = F.chart[F.i]; if (n.type !== "whack") return;
  const m = F.ms, k = (m.up || []).findIndex((u) => u.c === i);
  if (k < 0) return;
  m.hits++; m.up.splice(k, 1); m.next = Math.min(m.next, rand(.15, .4));
  const b = $("miniDom").querySelector(`[data-cell="${i}"]`); if (b) { b.classList.remove("up"); b.classList.add("bonk"); setTimeout(() => b.classList.remove("bonk"), 200); }
  sample("bait", { rate: 1.3 }) || SFX.hit("up", true); goodHit(true);
  if (m.hits >= n.need) miniWin(n);
}
function updateDomMini(n, dt) {
  const m = F.ms;
  if (n.type === "typing") { m.danger = .4 + .6 * (1 - F.noteT / n.win); return; }
  if (n.type === "simon") {
    if (m.phase === "watch") {
      F.noteT = 0; // 보여 주는 동안은 시간이 안 간다
      m.t += dt;
      const step = .75, i = Math.floor(m.t / step), on = m.t - i * step < .55;
      $("miniDom").querySelectorAll(".slot").forEach((s, k) => {
        const show = k === i && on && m.t >= 0;
        s.className = `key px slot ${show ? `k-${m.seq[k]} lit` : ""}`; s.innerHTML = show ? ARROW_SVG[m.seq[k]] : k < i ? "?" : "";
      });
      if (i >= m.seq.length) { m.phase = "input"; F.noteT = 0; $("simonPhase").textContent = "따라 눌러요!"; $("miniDom").querySelectorAll(".slot").forEach((s) => { s.className = "key px slot"; s.innerHTML = "?"; }); }
    } else if (F.noteT > m.limit) return miss("시간 초과!");
    m.danger = m.phase === "input" ? .4 + .6 * (1 - F.noteT / m.limit) : 1;
    return;
  }
  if (n.type === "reflex") {
    m.t -= dt; const el = $("rfx");
    if (m.phase === "wait" && m.t <= 0) { m.phase = "go"; m.t = n.react; el?.classList.add("go"); $("rfxT").textContent = "지금!"; sample("tap", { rate: 1.4 }) || SFX.bite(); }
    else if (m.phase === "go" && m.t <= 0) { m.bad++; m.phase = "wait"; m.t = rand(1, 2); el?.classList.remove("go"); $("rfxT").textContent = "기다려…"; judge("늦었어!", "miss"); SFX.nibble(); if (m.bad >= 3) return miss("너무 늦었어!"); }
    $("rfxInfo").textContent = `${m.hits} / ${n.need}번 · 헛손질 ${m.bad}/3`;
    m.danger = m.bad >= 2 ? .3 : 1; return;
  }
  if (n.type === "count") {
    m.t += dt;
    if (m.phase === "show") { F.noteT = 0; if (m.t >= n.show) { m.phase = "pick"; m.t = 0; $("cpond").classList.add("hide"); $("copts").querySelectorAll("button").forEach((b) => { b.disabled = false; }); } }
    else if (m.phase === "pick" && m.t > 6) { m.phase = "wrong"; $("cpond").classList.remove("hide"); return miss(`시간 초과! ${m.k}마리였어`); }
    m.danger = m.phase === "pick" ? .4 + .6 * (1 - m.t / 6) : 1; return;
  }
  if (n.type === "bubble") {
    const pond = $("bpond"); if (!pond) return;
    m.spawn -= dt;
    if (m.spawn <= 0) {
      m.spawn = n.gap * rand(.7, 1.3);
      const b = { id: ++m.id, x: rand(6, 86), y: 100, s: rand(.85, 1.2), w: rand(0, 6) }, el = document.createElement("button");
      el.className = "bub"; el.style.left = b.x + "%"; el.style.setProperty("--s", b.s); if (Math.random() < .35) el.innerHTML = `<img alt="" src="${fishPic()}">`;
      el.addEventListener("pointerdown", (e) => { e.preventDefault(); e.stopPropagation(); if (b.done || !F || F.intro > 0) return; b.done = true; el.classList.add("pop"); setTimeout(() => el.remove(), 180); m.hits++; sample("tap", { rate: 1.5 + Math.random() * .3, vol: .7 }) || SFX.hit("up", true); goodHit(false); if (m.hits >= n.need) miniWin(n); });
      pond.appendChild(el); b.el = el; m.bubs.push(b);
    }
    for (const b of m.bubs) if (!b.done) {
      b.y -= n.rise * 100 * dt; b.el.style.top = b.y + "%"; b.el.style.marginLeft = Math.sin(F.t * 3 + b.w) * 6 + "px";
      if (b.y < -14) { b.done = true; b.el.remove(); m.esc++; SFX.nibble(); if (m.esc >= 4) return miss("거품이 다 날아갔어!"); }
    }
    m.bubs = m.bubs.filter((b) => !b.done);
    $("bubInfo").textContent = `${m.hits} / ${n.need}개 · 놓침 ${m.esc}/4`;
    m.danger = m.esc >= 3 ? .3 : 1; return;
  }
  // whack: 구멍마다 이 낚시터 물고기 그림. 어려운 물고기는 두 마리가 같이 튀어나오기도
  m.up ??= [];
  m.up = m.up.filter((u) => { u.t -= dt; if (u.t > 0) return true; m.esc++; SFX.nibble(); return false; });
  if (m.esc >= 3) return miss("다 도망갔어!");
  m.next -= dt;
  if (m.next <= 0 && m.up.length < (n.double ? 2 : 1)) {
    let c; do c = Math.floor(Math.random() * 9); while (c === m.last || m.up.some((u) => u.c === c));
    m.last = c; m.up.push({ c, t: n.stay }); m.next = n.double && Math.random() < .5 ? rand(.05, .2) : rand(.25, .5);
    const w = $("miniDom").querySelector(`[data-cell="${c}"] .wf`); if (w) w.src = fishPic();
  }
  $("miniDom").querySelectorAll(".hole").forEach((b, i) => b.classList.toggle("up", m.up.some((u) => u.c === i)));
  $("whackInfo").textContent = `${m.hits} / ${n.need}마리 · 놓침 ${m.esc}/3`;
  m.danger = m.esc >= 2 ? .3 : 1;
}
// ---- 박자 낚시: 북이 흘러와 선(x=16)에 닿을 때 누른다
function rhythmNotes(n) {
  const out = []; let t = 1.2;
  for (let k = 0; k < n.need + 4; k++) { out.push({ t, hit: false, gone: false, big: Math.random() < .2 }); t += k > 1 && Math.random() < .2 && n.gap > .5 ? n.gap / 2 : n.gap; }
  return out;
}
function rhythmPress(n) {
  const m = F.ms; if (m.cool > 0) return;
  let best = null;
  for (const o of m.notes) if (!o.hit && !o.gone && (!best || Math.abs(o.t - F.noteT) < Math.abs(best.t - F.noteT))) best = o;
  const d = best ? Math.abs(best.t - F.noteT) : 9;
  if (d > .17) { m.cool = .25; SFX.nibble(); return; } // 헛침: 잠깐 못 누른다
  m.cool = .06; best.hit = true; m.hits++; m.flash = 1;
  const perfect = d < .07;
  judge(perfect ? "PERFECT!" : "GOOD", perfect ? "perfect" : "good");
  sample(best.big ? "taiko" : "tap", { rate: perfect ? 1.1 : 1, vol: .8 }) || SFX.hit("up", perfect); goodHit(perfect);
  if (m.hits >= n.need) miniWin(n);
}
// ---- 장애물 피하기: 세 줄 물길에서 물고기를 위아래로
function dodgePress(n, dir) {
  const m = F.ms;
  if (dir === "up") m.lane = Math.max(0, m.lane - 1);
  else if (dir === "down") m.lane = Math.min((n.lanes || 3) - 1, m.lane + 1);
  else return;
  sample("bait", { rate: 1.4, vol: .5 });
}
function miniWin(n) {
  F.got += 3; F.combo += 2;
  judge({ bar: "명중!!", hold: "버텨냈다!", track: "따라잡았다!", rhythm: "박자 완벽!", dodge: "다 피했다!", jump: "다 넘었다!", feed: "배불리 먹였다!", typing: "다 쳤다!", simon: "기억 완벽!", spin: "감았다!", whack: "다 잡았다!", reflex: "번개 손!", count: "다 맞혔다!", bubble: "다 터뜨렸다!" }[n.type] || "성공!", "perfect");
  flash("white"); SFX.mashDone(); pxWave(); shake = .45; punch = 1.2; A.kick = 1.5; F.leapV = 4.5;
  nextNote();
}
function updateMini(n, dt, t) {
  if (DOM_MINIS.has(n.type)) return updateDomMini(n, dt);
  const m = F.ms, holding = HOLD.space || HOLD.ptr;
  if (n.type === "spin") {
    if (HOLD.ptr) { // 화면을 릴 중심 둘레로 돌리면 감긴다(시계 방향)
      const r = $("miniCv").getBoundingClientRect(), cx = r.left + r.width * (24 / 128), cy = r.top + r.height / 2;
      const a = Math.atan2(HOLD.cy - cy, HOLD.cx - cx);
      if (m.pa != null) { let d = a - m.pa; if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; if (d > 0) spinAdd(n, d / (Math.PI * 2)); }
      m.pa = a;
    } else m.pa = null;
    if (!F || F.chart[F.i] !== n) return;
    m.turns = Math.max(0, m.turns - .05 * dt); // 물고기가 조금씩 끌고 간다
    m.danger = .4 + .6 * (1 - F.noteT / n.win);
    return drawMini(n, t);
  }
  if (n.type === "rhythm") {
    m.cool = Math.max(0, m.cool - dt); m.flash = Math.max(0, m.flash - dt * 6);
    for (const o of m.notes) if (!o.hit && !o.gone && F.noteT - o.t > .17) { o.gone = true; m.esc++; SFX.nibble(); shake = Math.max(shake, .12); }
    if (m.esc >= 4) return miss("박자를 놓쳤어!");
    if (m.notes.every((o) => o.hit || o.gone)) m.notes.push(...rhythmNotes(n).map((o) => ({ ...o, t: o.t + F.noteT }))); // 혹시 모자라면 더
    m.danger = m.esc >= 3 ? .3 : 1;
    return drawMini(n, t);
  }
  if (n.type === "dodge") {
    m.t += dt; m.inv = Math.max(0, m.inv - dt);
    const NL = n.lanes || 3;
    if (HOLD.ptr) { const r = $("miniCv").getBoundingClientRect(); m.lane = clamp(Math.floor((HOLD.cy - r.top) / r.height * NL), 0, NL - 1); }
    m.y = lerp(m.y, m.lane, ease(16, dt));
    m.spawn -= dt;
    if (m.spawn <= 0 && m.t < n.dur - 1.2) {
      m.spawn = n.gap * rand(.8, 1.25);
      const many = NL > 3 ? 1 + Math.floor(rand(1, NL - 1)) : m.t > 1.5 && Math.random() < .45 ? 2 : 1; // 늘 한 줄은 비어 있다(다섯 줄은 2~3개씩)
      const lanes = Array.from({ length: NL }, (_, i) => i).sort(() => Math.random() - .5).slice(0, Math.min(NL - 1, many));
      for (const l of lanes) { const r = Math.random(); m.obs.push({ x: 134, lane: l, weed: r < .35, can: r > .78 }); }
    }
    for (const o of m.obs) o.x -= n.speed * dt;
    m.obs = m.obs.filter((o) => o.x > -10);
    for (const o of m.obs) if (!o.done && Math.abs(o.x - 22) < 7 && o.lane === Math.round(m.y) && m.inv <= 0) {
      o.done = true; m.hit++; m.inv = 1; shake = Math.max(shake, .35); punch = -.6; SFX.nibble(); judge("쿵!", "miss"); F.leapV = 2.5;
      if (m.hit >= 3) return miss("바위에 부딪혔어!");
    }
    F.tug = lerp(F.tug, (m.y - 1) * 1.2, ease(6, dt));
    m.danger = m.hit >= 2 ? .3 : 1;
    if (m.t >= n.dur) return miniWin(n);
    return drawMini(n, t);
  }
  if (n.type === "jump") {
    m.t += dt; m.inv = Math.max(0, m.inv - dt);
    m.vy -= 330 * dt; m.y = Math.max(0, m.y + m.vy * dt); if (m.y <= 0) m.vy = 0;
    m.spawn -= dt;
    if (m.spawn <= 0 && m.t < n.dur - 1.2) { m.spawn = n.gap * rand(.75, 1.35); m.obs.push({ x: 136, w: Math.random() < .3 ? 14 : 9 }); }
    for (const o of m.obs) o.x -= n.speed * dt;
    m.obs = m.obs.filter((o) => o.x > -16);
    for (const o of m.obs) if (!o.done && o.x < 26 && o.x + o.w > 16 && m.y < 7 && m.inv <= 0) {
      o.done = true; m.hit++; m.inv = 1; shake = Math.max(shake, .35); punch = -.6; SFX.nibble(); judge("쿵!", "miss"); F.leapV = 2.5;
      if (m.hit >= 3) return miss("통나무에 부딪혔어!");
    }
    m.danger = m.hit >= 2 ? .3 : 1;
    if (m.t >= n.dur) return miniWin(n);
    return drawMini(n, t);
  }
  if (n.type === "feed") {
    m.pop = Math.max(0, m.pop - dt * 4);
    if (HOLD.ptr) { const r = $("miniCv").getBoundingClientRect(); const tx = clamp((HOLD.cx - r.left) / r.width, 0, 1); m.bx += clamp(tx - m.bx, -1.6 * dt, 1.6 * dt); }
    else m.bx += ((HOLD.right ? 1 : 0) - (HOLD.left ? 1 : 0)) * .95 * dt;
    m.bx = clamp(m.bx, .08, .92);
    m.spawn -= dt;
    if (m.spawn <= 0) { m.spawn = n.gap * rand(.8, 1.3); m.drops.push(feedDrop()); }
    const nx = 4 + m.bx * 120;
    for (const o of m.drops) {
      o.y += n.fall * dt;
      if (!o.done && o.y > 28 && o.y < 34 && Math.abs(o.x - nx) < 10) {
        o.done = true;
        if (o.bad) { m.bad++; shake = Math.max(shake, .3); SFX.nibble(); judge("깡통!", "miss"); if (m.bad >= 3) return miss("깡통을 너무 많이 받았어!"); }
        else { m.got++; m.pop = 1; judge("냠!", "good"); sample("tap", { rate: 1.2, vol: .7 }) || SFX.hit("up", false); goodHit(false); if (m.got >= n.need) return miniWin(n); }
      }
    }
    m.drops = m.drops.filter((o) => !o.done && o.y < 44);
    F.tug = lerp(F.tug, (m.bx - .5) * 2, ease(6, dt));
    m.danger = m.bad >= 2 ? .3 : .4 + .6 * (1 - F.noteT / n.win);
    return drawMini(n, t);
  }
  if (n.type === "bar") {
    m.cool = Math.max(0, m.cool - dt);
    m.pos = tri(F.noteT * n.speed * 2);
    m.danger = .4 + .6 * (1 - F.noteT / n.win);
  } else if (n.type === "hold") {
    m.jerkT -= dt;
    if (m.jerkT <= 0) { m.jerkT = rand(.7, 1.6) / n.jerk; m.ten += rand(.1, .2) * (holding ? 1.2 : .6); F.tug = (F.tugSide = -F.tugSide); F.leapV = 3; shake = Math.max(shake, .2); } // 물고기가 확 당긴다
    m.ten += (holding ? .42 + n.pull * .25 : -.55) * dt + Math.sin(t * 7) * .04 * dt;
    m.ten = Math.max(0, m.ten);
    const inBand = m.ten > .45 && m.ten < .8;
    // 초록 안이면 감을 때 빨리, 쉬어도 조금씩 차오른다
    if (inBand) { m.prog += dt * (holding ? 1 : .6); A.kick = Math.max(A.kick, .4); if (Math.random() < dt * 6) splash(F.fish.group.position.x, F.fish.group.position.z, 3, .6); }
    m.slack = m.ten < .1 ? m.slack + dt : 0;
    if (holding && m.ten > .62 && !tensionLoop) tensionLoop = sampleLoop("tension", .5);
    if (tensionLoop && (!holding || m.ten <= .62)) { tensionLoop.stop(); tensionLoop = null; }
    if (tensionLoop) tensionLoop.rate(.85 + m.ten * .5);
    m.danger = m.ten > .8 ? Math.max(0, 1 - (m.ten - .8) * 5) * .4 : 1;
    if (m.ten >= 1) { m.ten = .5; return miss("줄이 끊어질 뻔!"); }
    if (m.slack > 1.6) return miss("줄이 느슨해!");
    if (m.prog >= n.need) return miniWin(n);
  } else {
    // 물고기: 목표 지점으로 헤엄치다 가끔 확 방향을 튼다
    if (Math.abs(m.fx - m.ft) < .03 || Math.random() < dt * .25) m.ft = clamp(m.fx + rand(-.45, .45), .08, .92);
    if (Math.random() < dt * .3) m.burst = .5;
    m.burst = Math.max(0, m.burst - dt);
    m.fx += Math.sign(m.ft - m.fx) * Math.min(Math.abs(m.ft - m.fx), n.speed * (1 + m.burst * 1.2) * dt);
    // 상자: 방향키로 밀거나 화면을 끈 곳으로
    if (HOLD.ptr) { const r = $("miniCv").getBoundingClientRect(); const tx = clamp((HOLD.cx - r.left) / r.width, 0, 1); m.bx += clamp(tx - m.bx, -1.3 * dt, 1.3 * dt); }
    else m.bx += ((HOLD.right ? 1 : 0) - (HOLD.left ? 1 : 0)) * .8 * dt;
    m.bx = clamp(m.bx, n.box / 2, 1 - n.box / 2);
    const inBox = Math.abs(m.fx - m.bx) < n.box / 2;
    m.prog += (inBox ? .34 : -.15) * dt;
    if (inBox && Math.random() < dt * 5) splash(F.fish.group.position.x, F.fish.group.position.z, 3, .6);
    F.tug = lerp(F.tug, (m.fx - .5) * 2.4, ease(6, dt));
    m.danger = m.prog < .25 ? m.prog / .25 * .4 : 1;
    if (m.prog <= 0) { m.prog = .3; return miss("놓칠 뻔!"); }
    if (m.prog >= 1) return miniWin(n);
  }
  drawMini(n, t);
}
// 128×40 논리 좌표: 픽셀 UI와 고해상도 물고기 이미지를 함께 그린다.
function drawMini(n, t) {
  const c = miniCtx, m = F.ms;
  c.clearRect(0, 0, 128, 40);
  const box = (x, y, w, h, col) => { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
  if (n.type === "bar") {
    box(2, 12, 124, 16, "#13162e"); box(4, 14, 120, 12, "#2a3160");
    const zl = 4 + (m.zc - n.zone / 2) * 120, zw = n.zone * 120;
    box(zl, 14, zw, 12, "#9cf25a"); box(4 + (m.zc - n.zone / 6) * 120, 14, n.zone / 3 * 120, 12, "#ffd23f");
    const x = 4 + m.pos * 120;
    box(x - 1, 8, 3, 24, "#13162e"); box(x, 9, 1, 22, "#ffffff");
    for (let i = 0; i < n.need; i++) { box(64 - n.need * 6 + i * 12, 1, 8, 8, "#13162e"); box(65 - n.need * 6 + i * 12, 2, 6, 6, i < m.hits ? "#ffd23f" : "rgba(255,248,232,.35)"); }
  } else if (n.type === "rhythm") {
    box(0, 10, 128, 20, "#13162e"); box(0, 12, 128, 16, "#2a3160");
    box(14, 9, 4, 22, m.flash > 0 ? "#ffffff" : "#ffd23f"); // 치는 선
    for (const o of m.notes) {
      if (o.hit || o.gone) continue;
      const x = 16 + (o.t - F.noteT) * n.speed; if (x > 132) continue;
      const r = o.big ? 7 : 5;
      c.fillStyle = "#13162e"; c.beginPath(); c.arc(Math.round(x), 20, r + 1, 0, Math.PI * 2); c.fill();
      c.fillStyle = o.big ? "#ff4d6d" : "#3ec7ff"; c.beginPath(); c.arc(Math.round(x), 20, r, 0, Math.PI * 2); c.fill();
      box(x - 1, 18 - (o.big ? 2 : 1), 2, 2, "#fff8e8");
    }
    for (let i = 0; i < n.need; i++) box(64 - n.need * 4 + i * 8, 2, 6, 5, i < m.hits ? "#ffd23f" : "rgba(255,248,232,.3)");
    for (let i = 0; i < 4; i++) box(100 + i * 6, 33, 4, 4, i < m.esc ? "#ff4d6d" : "rgba(255,248,232,.3)");
  } else if (n.type === "jump") {
    box(0, 0, 128, 24, "#2a3160"); box(0, 24, 128, 14, "#1d5f8a");
    for (let x = 0; x < 128; x += 8) box(((x - t * n.speed) % 128 + 128) % 128, 24, 4, 1, "#3e8fbf");
    for (const o of m.obs) { box(o.x, 19, o.w, 6, "#13162e"); box(o.x + 1, 20, o.w - 2, 4, "#8a5a2b"); box(o.x + 1, 20, 2, 4, "#c48a4a"); }
    const fy = 19 - m.y, blink = m.inv > 0 && Math.sin(t * 40) > 0;
    if (m.y > 1) box(16, 25, 10, 1, "rgba(255,248,232,.35)");
    if (!blink) drawMiniFish(c, 21, fy + 2 + (m.y > 1 ? 0 : Math.sin(t * 9) > 0 ? 0 : .5), 18, 11, 1);
    box(2, 35, 124, 4, "#13162e"); box(3, 36, 122 * clamp(m.t / n.dur, 0, 1), 2, "#ffd23f");
    for (let i = 0; i < 3; i++) box(110 + i * 6, 2, 4, 4, i < m.hit ? "#ff4d6d" : "rgba(255,248,232,.35)");
  } else if (n.type === "feed") {
    box(0, 0, 128, 40, "#1d5f8a");
    for (const o of m.drops) {
      if (o.bad) { box(o.x - 3, o.y - 3, 6, 7, "#13162e"); box(o.x - 2, o.y - 2, 4, 5, "#9aa3b5"); box(o.x - 2, o.y, 4, 1, "#d94a5a"); }
      else for (let k = 0; k < 4; k++) box(o.x - 3 + k * 2, o.y + Math.sin(t * 12 + k) * 1.2, 2, 2, "#ff8fa3");
    }
    const nx = 4 + m.bx * 120;
    box(nx - 10, 30, 20, 2, "#fff8e8"); box(nx - 10, 32, 2, 4, "#fff8e8"); box(nx + 8, 32, 2, 4, "#fff8e8"); box(nx - 8, 35, 16, 1, "#fff8e8");
    box(nx - 8, 32, 16, 3, m.pop > 0 ? "rgba(255,210,63,.55)" : "rgba(255,248,232,.18)");
    for (let i = 0; i < n.need; i++) box(64 - n.need * 3 + i * 6, 2, 4, 4, i < m.got ? "#ffd23f" : "rgba(255,248,232,.3)");
    for (let i = 0; i < 3; i++) box(110 + i * 6, 9, 4, 4, i < m.bad ? "#ff4d6d" : "rgba(255,248,232,.35)");
  } else if (n.type === "dodge") {
    const NL = n.lanes || 3, LH = 32 / NL, oh = Math.min(8, LH - 1.5), oy = (LH - oh) / 2; // 줄 높이(세 줄 10.7, 다섯 줄 6.4)
    box(0, 2, 128, 32, "#1d5f8a");
    for (let l = 1; l < NL; l++) for (let x = 0; x < 128; x += 8) box((x - t * n.speed) % 128 + (x - t * n.speed < 0 ? 128 : 0), 2 + l * LH, 4, 1, "#3e8fbf");
    for (const o of m.obs) {
      const y = 2 + o.lane * LH + oy;
      if (o.weed) { for (let k = 0; k < 3; k++) box(o.x - 4 + k * 3, y + Math.sin(t * 6 + k) * .6, 2, oh + 1, "#3f8f5a"); }
      else if (o.can) { box(o.x - 4, y, 8, oh, "#13162e"); box(o.x - 3, y + 1, 6, oh - 2, "#d94a5a"); box(o.x - 3, y + oh / 2 - .5, 6, 1, "#fff8e8"); }
      else { box(o.x - 5, y, 10, oh, "#13162e"); box(o.x - 4, y + 1, 8, oh - 2, "#8a8f9c"); box(o.x - 3, y + 1, 3, 2, "#c4c8d2"); }
    }
    const fy = 2 + m.y * LH + (LH - 5) / 2, blink = m.inv > 0 && Math.sin(t * 40) > 0;
    if (!blink) drawMiniFish(c, 21, fy + 2.5 + (Math.sin(t * 9) > 0 ? 0 : .5), Math.min(18, LH * 1.6), Math.min(11, LH), 1);
    box(2, 35, 124, 4, "#13162e"); box(3, 36, 122 * clamp(m.t / n.dur, 0, 1), 2, "#9cf25a");
    for (let i = 0; i < 3; i++) box(110 + i * 6, 28, 4, 4, i < m.hit ? "#ff4d6d" : "rgba(255,248,232,.35)");
  } else if (n.type === "spin") {
    const cx = 24, cy = 20, a = m.turns * Math.PI * 2 - Math.PI / 2;
    for (let i = 0; i < 24; i++) { const q = i / 24 * Math.PI * 2; box(cx + Math.cos(q) * 16 - 1, cy + Math.sin(q) * 16 - 1, 3, 3, "#13162e"); }
    for (let i = 0; i < 20; i++) { const q = i / 20 * Math.PI * 2; box(cx + Math.cos(q) * 13 - 1, cy + Math.sin(q) * 13 - 1, 2, 2, "#fff8e8"); }
    box(cx - 3, cy - 3, 6, 6, "#ffd23f");
    for (let k = 0; k < 12; k++) box(cx + Math.cos(a) * k - 1, cy + Math.sin(a) * k - 1, 2, 2, "#ff4d6d");
    box(cx + Math.cos(a) * 13 - 3, cy + Math.sin(a) * 13 - 3, 6, 6, "#ff4d6d");
    box(48, 12, 76, 16, "#13162e"); box(50, 14, 72 * clamp(m.turns / n.need, 0, 1), 12, "#9cf25a");
    for (let i = 1; i < n.need; i++) box(50 + 72 * i / n.need, 12, 1, 16, "#13162e");
  } else if (n.type === "hold") {
    box(2, 6, 124, 14, "#13162e"); box(4, 8, 120, 10, "#2a3160");
    box(4 + .45 * 120, 8, .35 * 120, 10, "#9cf25a"); box(4 + .8 * 120, 8, .2 * 120, 10, Math.sin(t * 20) > 0 ? "#ff4d6d" : "#c2324f");
    const x = 4 + Math.min(1, m.ten) * 120;
    box(x - 1, 3, 3, 20, "#13162e"); box(x, 4, 1, 18, "#ffffff");
    box(2, 26, 124, 8, "#13162e"); box(4, 28, 120 * Math.min(1, m.prog / n.need), 4, "#3ec7ff");
  } else {
    box(2, 6, 124, 20, "#13162e"); box(4, 8, 120, 16, "#1d5f8a");
    for (let i = 0; i < 6; i++) box(4 + ((i * 23 + t * 18) % 118), 12 + (i % 3) * 4, 3, 1, "#3e8fbf");
    const bx = 4 + (m.bx - n.box / 2) * 120, bw = n.box * 120, inBox = Math.abs(m.fx - m.bx) < n.box / 2;
    c.strokeStyle = inBox ? "#9cf25a" : "#fff8e8"; c.lineWidth = 2; c.strokeRect(Math.round(bx) + 1, 8, Math.round(bw) - 2, 16);
    box(bx, 8, bw, 16, inBox ? "rgba(156,242,90,.25)" : "rgba(255,248,232,.12)");
    const fx = 4 + m.fx * 120, dir = m.ft > m.fx ? 1 : -1;
    drawMiniFish(c, fx, 16 + (Math.sin(t * 9) > 0 ? 0 : .5), 16, 10, dir);
    box(2, 30, 124, 8, "#13162e"); box(4, 32, 120 * clamp(m.prog, 0, 1), 4, m.prog < .25 ? "#ff4d6d" : "#9cf25a");
  }
}
function mashWin(n) {
  F.got += 3; F.combo += 3; F.perfect++;
  judge(n.final ? "끌어올렸다!!" : "연타 성공!", "perfect"); flash("white"); SFX.mashDone(); pxWave();
  shake = .5; punch = 1.4; A.kick = 1.6; F.leapV = 5;
  nextNote();
}
function updateMash(n, dt) {
  const f = F;
  while (f.tapT.length && f.tapT[0] < f.t - 1) f.tapT.shift();
  f.rate = lerp(f.rate, f.tapT.length / Math.min(1, Math.max(.35, f.noteT)), ease(8, dt));
  if (f.noteT > 1) { const ex = f.rate - n.hold; f.gauge += (ex > 0 ? ex : ex * .7) * n.grow * dt; } // 처음 1초는 손 풀 시간
  f.gpop = Math.max(0, f.gpop - dt * 8);
  const mood = f.noteT < 1 ? "" : f.rate < n.hold - .3 ? "slow" : f.rate > n.hold + 2.2 ? "fire" : "ok";
  if (mood !== f.mood) {
    f.mood = mood;
    const el = $("mashMood");
    if (el && mood) el.innerHTML = mood === "slow" ? '<b style="color:var(--hot)">▼ 더 빨리!!</b>' : mood === "fire" ? '<b style="color:var(--sun)">▲▲ 불타오른다!!</b>' : '<b style="color:var(--lime)">▲ 좋아요, 계속!</b>';
  }
  if (f.gauge >= 1) return mashWin(n);
  if (f.gauge <= 0) return miss("힘이 모자라!");
}
// 연타 원(64×64 캔버스를 키워서 픽셀로 보이게): 안쪽 원 = 연타 힘, 점선 = 기준선, 바깥 점 = 연타 속도(빨간 눈금 = 기준 속도)
const mashCtx = $("mashCv").getContext("2d");
function drawMash(n, k, t) {
  const c = mashCtx, C = 32, target = 21;
  c.clearRect(0, 0 , 64, 64);
  const g = Math.min(1.15, F.gauge), r = Math.max(1.5, g * target * (1 + F.gpop * .08));
  const hot = g > .75;
  c.fillStyle = hot ? "#ff4d6d" : "#ffd23f";
  c.beginPath(); c.arc(C, C, r, 0, Math.PI * 2); c.fill();
  c.fillStyle = "rgba(255,255,255,.55)"; c.beginPath(); c.arc(C - r * .3, C - r * .35, r * .32, 0, Math.PI * 2); c.fill();
  // 기준선(깜빡이는 점선)
  for (let i = 0; i < 36; i++) {
    if (i % 2) continue;
    const a = i / 36 * Math.PI * 2 + t * .8;
    c.fillStyle = g >= .9 && Math.sin(t * 30) > 0 ? "#ffffff" : "#fff8e8";
    c.fillRect(Math.round(C + Math.cos(a) * target) - 1, Math.round(C + Math.sin(a) * target) - 1, 2, 2);
  }
  // 연타 속도계 (꽉 차면 기준 + 초당 3번)
  const dots = 32, top = n.hold + 3, lit = Math.round(Math.min(1, F.rate / top) * dots), mark = Math.round(n.hold / top * dots);
  for (let i = 0; i < dots; i++) {
    const a = -Math.PI / 2 + i / dots * Math.PI * 2;
    c.fillStyle = i === mark ? "#ff4d6d" : i < lit ? (F.rate < n.hold ? "#ffd23f" : "#9cf25a") : "rgba(19,22,46,.6)";
    const sz = i === mark ? 4 : 3;
    c.fillRect(Math.round(C + Math.cos(a) * 29) - sz / 2, Math.round(C + Math.sin(a) * 29) - sz / 2, sz, sz);
  }
}
function miss(text) {
  G.misses = [...(G.misses || []).slice(-20), `${F.chart[F.i].type}:${text}`]; // 점검용
  F.hearts--; F.combo = 0; $("combo").hidden = true;
  judge(text || "MISS", "miss"); SFX.miss(); flash("red"); shake = .6; punch = -1.2;
  A.slump = 1; F.leapV = 3.5; // 물고기가 확 뛰어오른다
  splash(F.fish.group.position.x, F.fish.group.position.z, 20, 1.2); SFX.splash();
  $("hearts").querySelectorAll("svg").forEach((h, k) => { h.classList.toggle("lost", k >= F.hearts); h.classList.toggle("hit", k === F.hearts); });
  if (F.hearts <= 0) return endFight("snap");
  showNote(); // 같은 칸을 다시 (연타는 처음부터)
}
function endFight(result) {
  const f = F; if (!f) return;
  if (f.sp.boss) applyWeather(); // 보스 화면 색을 원래대로
  F = null; G.lastResult = result; beatStop(); document.body.classList.remove("fighting", "finale", "boss-fight", "big-fight"); showCircles(null); $("lane").classList.remove("circling"); startMini(null); endIntro();
  $("fight").hidden = true; $("danger").style.boxShadow = "";
  if (R.spot) R.spot.age = R.spot.life; // 그 자리 거품은 끝
  if (result === "caught") {
    const sp = f.sp, cm = Math.round(lerp(sp.len[0], sp.len[1], f.sizeT));
    const junk = !sp.points, gr = gradeOf(f.sizeT);
    // 점수: 기본 점수 × 크기(0.5~2배, 클수록 가파르게) × 통통함(무게). 같은 등급 안에서도 크고 무거울수록 높다
    const cond = f.cond || 1, kg = junk ? 0 : kgOf(f.fish.id, cm, cond);
    const base = sp.points * (.5 + 1.5 * f.sizeT ** 1.2) * cond ** 1.5 * (gr.release ? .5 : 1);
    const fever = G.fever > 0 && !junk;
    const { isNew, record } = junk || G.practice ? {} : bookAdd(f.fish.id, cm, gr.name, kg); // 연습은 도감에 안 넣는다
    const pts = Math.round((base * (1 + f.perfect * .04) + (sp.points ? f.maxCombo * 2 : 0)) * f.bonus * (fever ? 2 : 1) * (record ? 1.3 : 1));
    if (isNew || record) { sample("stamp"); if (isNew) missionEvent("newfish"); }
    if (!junk && !G.practice) {
      if (gr.name === "월척") missionEvent("wolchuk");
      if (sp.tier === "전설") missionEvent("legend");
      if (sp.boss) { missionEvent("boss"); sample("bigsplash"); }
      missionEvent(PLACE === "sea" ? "sea5" : "fresh5");
      if (gr.release) missionEvent("release");
      if (G.bait === "lure") missionEvent("lure");
      if (G.weather === "rain") missionEvent("rainfish");
      // 피버: 하트를 하나도 안 잃고 잡은 게 3마리 이어지면
      if (f.hearts === f.maxHearts) { if (G.fever <= 0 && ++G.streak >= 3) setTimeout(startFever, 900); } else G.streak = 0;
    }
    G.book.add(f.fish.id); G.caught.push({ id: f.fish.id, cm, kg, pts, grade: junk ? "" : gr.name }); G.score += pts;
    $("score").textContent = G.score; $("count").textContent = G.caught.filter((c) => SPECIES[c.id].points).length;
    updateBag();
    $("cardTier").textContent = sp.tier; $("cardTier").style.background = TIER_COLOR[sp.tier];
    $("cardGrade").hidden = junk; $("cardGrade").textContent = gr.name; $("cardGrade").style.background = gr.color;
    $("cardName").textContent = sp.name; $("cardSize").textContent = junk ? `${cm}cm` : `${cm}cm · ${kgText(kg)}`;
    $("cardPoints").textContent = pts ? `+${pts}` : "꽝!";
    $("cardBonus").textContent = [f.perfect ? `PERFECT ${f.perfect}` : "", f.maxCombo > 2 ? `최대 ${f.maxCombo}콤보` : "", f.bonus > 1 ? "무지개 ×2" : "", fever ? "피버 ×2" : "", record ? "내 기록 경신 ×1.3" : "", !junk && gr.release ? "작으니까 다시 놓아줘요" : ""].filter(Boolean).join(" · ");
    if (!junk && NET.me && !G.practice) saveCatch(f.fish.id, cm, kg, G.score, pts).then((r) => {
      if (!r) return;
      toast(r.release ? `물로 돌려보냈어요 · 손맛 +${r.taste}` : r.saved ? `살림망에 넣었어요 · 오늘 시세 <b style="color:var(--sun)">${r.price.toLocaleString("ko-KR")}원</b>` : "살림망이 꽉 찼어요! 수산시장에서 팔아요");
    });
    $("cardNew").hidden = !(isNew || record); $("cardNew").textContent = isNew ? "새 물고기!" : "기록 경신!";
    const c = $("card"); c.hidden = false; c.style.animation = "none"; void c.offsetWidth; c.style.animation = ""; card = 2.8;
    (sp.tier === "전설" || sp.boss ? SFX.legend : sp.points ? SFX.catch : SFX.lose)();
    if (sp.tier === "전설" || sp.boss) flash("gold");
    if (sp.boss) shout("보스를 낚았다!!!", "sun", 1.6);
    // 물고기를 들어 올려 데크 위에서 파닥
    f.fish.group.position.set(angler.position.x + 1.1, .5, angler.position.z + .2);
    show = { fish: f.fish, t: 0, y: 1.6, vy: 2, roll: Math.PI / 2, heading: rand(-.5, .5), next: .1, release: !junk && gr.release };
    splash(angler.position.x + 1.1, angler.position.z + .2, 16, .8, WHITE, .5);
    A.jump = 1; A.vy = 4.2;
  } else {
    f.fish.dispose(); G.streak = 0;
    if (result === "snap") { shout("툭! 줄이 끊어졌다", "hot", 1.3); SFX.snap(); A.slump = 1.5; }
    else shout("놓쳤어요…", "cream", 1.2);
  }
  resetRod();
  if (G.ending) setTimeout(finish, 1500);
}

// ------------------------------------------------------------------ 입력
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), waterPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
function waterPoint(e) {
  const r = renderer.domElement.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const p = new THREE.Vector3();
  return ray.ray.intersectPlane(waterPlane, p) ? p : null;
}
renderer.domElement.addEventListener("pointerdown", (e) => {
  audio();
  HOLD.ptr = true; HOLD.cx = e.clientX; HOLD.cy = e.clientY;
  if (!G.playing) return;
  if (R.state === "bite") return hook();
  if (R.state === "waiting" || R.state === "nibble") return earlyStrike();
  if (F) return press("tap");
  if (R.state !== "idle" || show) return;
  const p = waterPoint(e); if (!p) return;
  aimStart(p);
});
const KEYMAP = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right", KeyW: "up", KeyS: "down", KeyA: "left", KeyD: "right" };
// 누르고 있기(줄 텐션)·좌우 이동(따라잡기)용 상태
addEventListener("pointermove", (e) => { if (HOLD.ptr) { HOLD.cx = e.clientX; HOLD.cy = e.clientY; if (R.state === "aiming" && !AIM.key) { const p = waterPoint(e); if (p) aimToward(p); } } });
for (const ev of ["pointerup", "pointercancel"]) addEventListener(ev, () => {
  if (R.state === "aiming" && !AIM.key) castRelease(); HOLD.ptr = false; HOLD.space = false; HOLD.left = false; HOLD.right = false; });
addEventListener("blur", () => { Object.assign(HOLD, { space: false, left: false, right: false, ptr: false }); });
addEventListener("keyup", (e) => {
  if (e.code === "Space") { HOLD.space = false; if (R.state === "aiming" && AIM.key) castRelease(); }
  if (KEYMAP[e.code] === "left") HOLD.left = false;
  if (KEYMAP[e.code] === "right") HOLD.right = false;
});
addEventListener("keydown", (e) => {
  if (e.target.id === "typeIn" || e.target.closest?.("input, textarea, form")) return; // 입력칸(한글 타자·입장 양식)은 그대로 두고
  const dir = KEYMAP[e.code];
  if (dir || e.code === "Space") e.preventDefault();
  if (e.code === "Space") HOLD.space = true;
  if (dir === "left") HOLD.left = true;
  if (dir === "right") HOLD.right = true;
  if (e.repeat || !G.playing) return;
  const cn = F?.chart[F.i];
  if (cn?.type === "typing" && !TOUCH) { $("typeIn")?.focus(); return; } // 입력칸 밖에서 눌러도 입력칸으로
  if (cn?.type === "whack" && WHACK_KEYS.includes(e.code)) { e.preventDefault(); return whackCell(WHACK_KEYS.indexOf(e.code)); }
  if (cn?.type === "count" && /^(Digit|Numpad)[123]$/.test(e.code)) { e.preventDefault(); const b = $("copts")?.querySelectorAll("button")[+e.code.slice(-1) - 1]; if (b) countPick(cn, +b.dataset.cnt); return; }
  if (!F && R.state === "idle" && BAIT_KEYS[e.key]) return setBait(BAIT_KEYS[e.key]);
  if (dir) { pressPad(dir); press(dir); }
  else if (e.code === "Space") { if (F) { pressPad("reel"); press("reel"); } else if (R.state === "idle" && !show) aimStart(null); else if (["bite", "waiting", "nibble"].includes(R.state)) press("up"); }
});
function pressPad(dir) { const b = document.querySelector(`[data-dir="${dir}"]`); if (!b) return; b.classList.add("on"); setTimeout(() => b.classList.remove("on"), 90); }
document.querySelectorAll(".dpad button, .reelbtn").forEach((b) => b.addEventListener("pointerdown", (e) => {
  e.preventDefault(); e.stopPropagation();
  const d = b.dataset.dir;
  if (d === "reel") HOLD.space = true; if (d === "left") HOLD.left = true; if (d === "right") HOLD.right = true;
  pressPad(d); press(d);
}));

// ------------------------------------------------------------------ 갱신
const handW = new THREE.Vector3(), rodDir = new THREE.Vector3(), tmpV = new THREE.Vector3();
function updateAngler(dt, t) {
  // 기울기·점프·움찔: 과장된 몸짓
  A.kick = Math.max(0, A.kick - dt * 5); A.slump = Math.max(0, A.slump - dt * 1.4); A.cast = Math.max(0, A.cast - dt * 2.2);
  A.side = lerp(A.side, 0, ease(3, dt));
  if (A.vy > 0 || body.position.y > 0) { A.vy -= 14 * dt; body.position.y = Math.max(0, body.position.y + A.vy * dt); if (body.position.y === 0) A.vy = 0; }
  const mashing = F?.chart[F.i]?.type === "mash";
  const wantLean = F ? .28 + A.kick * .22 + (mashing ? .15 + Math.sin(t * 40) * .05 : 0) : A.cast > .5 ? -.35 : A.cast > 0 ? .3 : 0;
  A.lean = lerp(A.lean, wantLean - A.slump * .35, ease(10, dt));
  body.rotation.x = A.lean; // + 뒤로 젖힘
  body.rotation.z = -A.side * .32 + (F ? Math.sin(t * 13) * .03 : 0) + A.slump * Math.sin(t * 20) * .1;
  const breathe = 1 + Math.sin(t * 2.4) * .015;
  body.scale.set(1 + A.kick * .06, breathe - A.kick * .06, 1 + A.kick * .06);
  body.updateMatrixWorld(true);
  handW.copy(HAND).applyMatrix4(body.matrixWorld);
  const target = F ? F.fish.group.position : R.state !== "idle" ? bobber.position : _a.set(angler.position.x, 0, angler.position.z - 6);
  rodDir.set(target.x - handW.x, 0, target.z - handW.z).normalize().multiplyScalar(.75);
  rodDir.y = F ? .95 + A.kick * .25 : .75; // 싸울 때는 세워 든다
  if (A.cast > .5) rodDir.set(rodDir.x * -.3, 1.4, -rodDir.z * .3 + .3); // 던지기 직전 뒤로 젖힘
  rodDir.normalize();
}
function updateRodAndLine(dt, t) {
  let pullTo = bobber.position, bend = .05, slack = .35;
  if (R.state === "flying") {
    R.fly += dt / R.flyDur; const u = Math.min(1, R.fly);
    bobber.position.lerpVectors(R.from, R.target, u); bobber.position.y += Math.sin(u * Math.PI) * 3;
    slack = .1;
    if (u >= 1) landed();
  } else if (R.state === "waiting" || R.state === "nibble" || R.state === "bite") {
    R.timer -= dt;
    if (R.state === "waiting" && R.timer <= 0) {
      if (R.nibbles > 0) { R.nibbles--; R.state = "nibble"; R.timer = .35; SFX.nibble(); ripple(R.target.x, R.target.z, .4); }
      else {
        R.state = "bite"; const sp = SPECIES[R.species];
        R.timer = sp.tier === "전설" ? .85 : sp.tier === "희귀" ? 1 : 1.2;
        SFX.bite(); splash(R.target.x, R.target.z, 14, .7); ripple(R.target.x, R.target.z, 1);
        $("bite").hidden = false; flash("white"); shake = .5; punch = 1.2; hint("");
      }
    } else if (R.state === "nibble" && R.timer <= 0) { R.state = "waiting"; R.timer = rand(.6, 1.5); }
    else if (R.state === "bite" && R.timer <= 0) { shout("미끼만 뺏겼어요", "cream", 1.1); SFX.lose(); resetRod(); }
    const dip = R.state === "bite" ? -.2 + Math.sin(t * 34) * .05 : R.state === "nibble" ? -.07 : 0;
    R.dip = lerp(R.dip, dip, ease(20, dt));
    bobber.position.set(R.target.x, .05 + Math.sin(t * 2) * .02 + R.dip, R.target.z);
    bend = R.state === "bite" ? .45 : .06;
  }
  if (F) {
    const urgent = clamp(F.noteT / F.chart[F.i].win, 0, 1), mash = F.chart[F.i]?.type === "mash";
    pullTo = F.fish.mouth(tmpV); bend = .7 + A.kick * .45 + urgent * .3 + (mash ? .3 : 0) + F.pulse * .2;
    const amp = .04 + urgent * .1 + (mash ? .12 : 0);
    rodBuzz.set(Math.sin(t * 47) * amp, Math.sin(t * 61) * amp);
  } else rodBuzz.set(0, R.state === "bite" ? Math.sin(t * 50) * .08 : 0);
  placeRod(handW, rodDir, pullTo, bend);
  line.visible = R.state !== "idle";
  if (line.visible) drawLine(pullTo, F ? .05 : slack);
  line.material.color.set(F && F.noteT > F.chart[F.i].win * .6 ? "#ff4d6d" : "#ffffff");
}
function updateFight(dt, t) {
  if (!F) return;
  const f = F, n = f.chart[f.i];
  const intro = f.intro > 0;
  if (intro) { f.intro -= dt; if (f.intro <= 0) endIntro(); }
  f.t += dt; if (!intro) f.noteT += dt; beatTick();
  if (!intro && f.noteT >= n.win) { miss(n.type === "mash" ? "힘이 모자라!" : "늦었어!"); if (!F) return; }
  const cn = F.chart[F.i];
  let k = clamp(1 - F.noteT / cn.win, 0, 1);
  if (intro) { if (["bar", "hold", "track", "spin"].includes(cn.type)) drawMini(cn, t); }
  else if (cn.type === "mash") { updateMash(cn, dt); if (!F) return; if (F.chart[F.i] === cn) drawMash(cn, k, t); }
  else if (cn.type === "circle") ringCircle(cn);
  else if (MINI_TYPES.has(cn.type)) { updateMini(cn, dt, t); if (!F || F.chart[F.i] !== cn) return; k = F.ms.danger ?? k; }
  else setFrame(k);
  if (F.chart[F.i] !== cn) return;
  if (cn.type === "mash") k = F.gauge < .25 ? F.gauge / .25 * .4 : .4 + F.gauge * .6; // 원이 작아지면 화면이 빨갛게
  $("cur").classList.toggle("urgent", cn.type === "mash" ? F.mood === "slow" : k < .4);
  $("danger").style.boxShadow = k < .4 ? `inset 0 0 ${60 + Math.sin(t * 30) * 20}px ${20 + (1 - k) * 30}px rgba(255, 40, 70, ${((.4 - k) * 1.3).toFixed(2)})` : "";
  // 끌어온 정도
  const prog = f.got / f.weight;
  $("reelFill").style.width = `${Math.round(prog * 100)}%`;
  if (F.sp.boss) $("bossHp").style.width = `${Math.round((1 - prog) * 100)}%`;
  f.tug = lerp(f.tug, 0, ease(5, dt));
  const dist = Math.max(2.6, f.dist0 * (1 - prog * .7) - (cn.type === "mash" ? f.gauge * 1.4 : 0));
  $("reelText").textContent = `${dist.toFixed(1)}m`;
  // 물고기: 줄 끝에서 몸부림 (급할수록, 연타 중일수록 더 세게)
  const ax = angler.position.x, az = angler.position.z;
  const dir = _a.set(f.from.x - ax, 0, f.from.z - az).normalize();
  const sway = Math.sin(t * 1.7) * 1.4 * (1 - prog * .6) * (cn.type === "mash" ? .3 : 1) + (cn.zig ? A.side * -1.4 : 0) + f.tug * 1.1;
  const fx = ax + dir.x * dist + dir.z * sway, fz = az + dir.z * dist - dir.x * sway;
  f.pulse = Math.max(0, f.pulse - dt * 3);
  const mash = cn.type === "mash";
  if (mash && cn.final) shake = Math.max(shake, .16 + f.gauge * .3); // 마지막 다다다다: 화면이 계속 흔들린다
  if (mash && Math.random() < dt * 1.6 && f.leap <= 0) f.leapV = 4.5; // 연타 중엔 물 밖으로 펄쩍
  f.leapV -= 15 * dt; f.leap = Math.max(0, f.leap + f.leapV * dt);
  if (f.leap === 0 && f.leapV < -3) { splash(fx, fz, 18, 1.1); ripple(fx, fz, 1.4); SFX.splash(); shake = Math.max(shake, .25); }
  if (f.leap === 0) f.leapV = Math.max(f.leapV, 0);
  const g = f.fish.group;
  g.position.set(fx, f.fish.halfH * .35 + f.leap + Math.abs(Math.sin(t * 10)) * .05, fz);
  const away = Math.atan2(fz - az, fx - ax);
  f.heading = lerp(f.heading, away + Math.sin(t * 2.3) * .7 * (mash ? .3 : 1) - f.tug * .9, ease(mash ? 12 : 4, dt));
  g.rotation.order = "YXZ"; g.rotation.y = -f.heading; g.rotation.z = f.leap > 0 ? Math.sin(t * 8) * .6 : 0;
  const urg = 1 - k;
  f.phase += dt * (6 + urg * 10 + (mash ? 12 : 0) + f.pulse * 8) * Math.PI;
  const amp = .2 + urg * .2 + (mash ? .25 : 0) + f.pulse * .2;
  f.fish.wave(f.phase, amp, Math.sin(t * 1.4) * (.12 + urg * .15), amp * .35);
  f.fish.body.rotation.x = Math.sin(f.phase * .5) * (.15 + urg * .3);
  if (Math.random() < dt * (8 + urg * 30)) splash(fx - Math.cos(f.heading) * f.fish.len * .4, fz - Math.sin(f.heading) * f.fish.len * .4, 2, .5 + urg * .5);
  if (Math.random() < dt * 2.5) ripple(fx, fz, .5 + f.fish.len * .4);
}
function updateShow(dt, t) {
  if (!show) return;
  const s = show, f = s.fish, g = f.group;
  s.t += dt;
  s.vy -= 14 * dt; s.y += s.vy * dt;
  if (s.y <= 0) { s.y = 0; s.vy = 0; s.next -= dt; if (s.next <= 0) { s.vy = rand(2.6, 4.4); s.next = rand(.25, .6); if (Math.random() < .3) s.roll = -s.roll; s.heading += rand(-.7, .7); } }
  const air = s.y > 0, w = t * (air ? 18 : 12), amp = air ? .5 : .25;
  f.wave(w, amp * .5, Math.sin(w * .5) * amp * .5, amp * .3);
  g.rotation.order = "YXZ"; g.rotation.y = s.heading; g.rotation.z = 0;
  f.body.rotation.x = s.roll;
  g.position.y = .5 + f.len * .1 + s.y;
  if (s.release && s.t > 1.6) { // 놔주자급: 물로 퐁당 돌려보낸다
    if (!s.toss) { s.toss = 1; s.vy = 5; s.heading = -Math.PI / 2; }
    g.position.z -= dt * 3.2; g.position.y = .5 + s.y;
    if (s.y <= 0 && s.t > 1.9) { splash(g.position.x, g.position.z, 14, .8); ripple(g.position.x, g.position.z, .8); SFX.plop(); f.dispose(); show = null; resetRod(); }
    return;
  }
  if (s.t > 2.8) { g.scale.multiplyScalar(Math.pow(.02, dt)); if (s.t > 3.3) { f.dispose(); show = null; resetRod(); } }
}

// ------------------------------------------------------------------ 진행
function start() {
  audio(); beatStop(); document.body.classList.remove("fighting", "fever", "finale", "boss-fight", "big-fight");
  if (F) { F.fish.dispose(); F = null; }
  if (show) { show.fish.dispose(); show = null; }
  const w = Math.random(), practice = practiceNext; practiceNext = false;
  const g = DEV_FREE || practice ? {} : gate();
  // 학급 대회: 모두 같은 순간에 끝나도록 서버 시계로 남은 시간을 잰다
  const left = g.room?.endAt && !g.free ? Math.max(3, (g.room.endAt - serverNow()) / 1000) : g.room?.roundSec || 180; // 자유 낚시는 판마다 한 판 시간
  if (g.room) G.round = g.room.round;
  Object.assign(G, { playing: true, practice, time: practice ? 60 : left, quizPass: false, score: 0, caught: [], book: new Set(), ending: false,
    streak: 0, fever: 0, bossSpawned: false, stat: { barPerfect: 0, circlePerfect: 0 }, weather: w < .5 ? "sunny" : w < .75 ? "rain" : "sunset" });
  applyWeather(); setBait(G.bait);
  $("score").textContent = 0; $("count").textContent = 0; $("timerChip").classList.remove("low");
  $("start").hidden = true; $("end").hidden = true; $("fight").hidden = true; $("card").hidden = true; $("practag").hidden = !practice;
  resetSpots(); resetRod(); updateBag();
  shout(practice ? "연습 시작!" : G.weather === "rain" ? "비 오는 날!" : G.weather === "sunset" ? "노을 낚시!" : "시작!", "sun", 1.1);
}
function finish() {
  if (!G.playing) return;
  G.playing = false; G.ending = false; resetRod(); hint("");
  $("practag").hidden = true;
  $("endTitle").innerHTML = G.practice ? "연습 <em>끝!</em>" : "대회 <em>끝!</em>";
  if (G.practice) $("againBtn").hidden = true;
  refresh().catch(() => {}); // 살림망·손맛 점수를 서버 값으로
  if (!G.practice) missionEvent("score", G.score);
  document.body.classList.remove("fever"); if (rainLoop) { rainLoop.stop(); rainLoop = null; }
  let best = 0; try { best = +localStorage.getItem("jamfish-best") || 0; if (G.score > best && !G.practice) { best = G.score; localStorage.setItem("jamfish-best", String(best)); } } catch { best = Math.max(best, G.score); }
  $("endScore").textContent = `${G.score}점`;
  const totalKg = G.caught.reduce((t, c) => t + (c.kg || 0), 0);
  $("endBest").textContent = (G.score >= best && G.score > 0 ? "최고 기록이에요!" : `최고 기록 ${best}점`) + (totalKg ? ` · 잡은 무게 ${kgText(totalKg)}` : "");
  $("endList").innerHTML = placeIds().map((id) => {
    const list = G.caught.filter((c) => c.id === id), top = list.reduce((m, c) => (!m || c.cm > m.cm ? c : m), null);
    return `<div class="${list.length ? "" : "none"}"><b class="nm">${SPECIES[id].name}</b><span>${top ? `${list.length}마리 · ${top.grade ? top.grade + " " : ""}${top.cm}cm${top.kg ? " " + kgText(top.kg) : ""}` : "-"}</span></div>`;
  }).join("");
  $("card").hidden = true; card = 0;
  renderMissions();
  $("end").hidden = false;
}
// ------------------------------------------------------------------ 도감 화면
let bookTab = "fresh";
async function openBook(tab = bookTab) {
  bookTab = tab; $("book").hidden = false;
  document.querySelectorAll("[data-booktab]").forEach((b) => b.classList.toggle("on", b.dataset.booktab === tab));
  const ids = placeIds(tab), got = realIds(tab).filter((id) => BOOK[id]).length;
  $("bookCount").textContent = `${got} / ${realIds(tab).length}종`;
  $("titles").innerHTML = titles().map((x) => `<span class="${x.ok ? "ok" : ""}">${x.ok ? "★" : "☆"} ${x.name}${!x.ok && x.tip ? ` <small>${x.tip}</small>` : ""}</span>`).join("");
  const draw = () => { $("bookGrid").innerHTML = ids.filter((id) => SPECIES[id].points || BOOK[id]).map((id) => {
    const sp = SPECIES[id], e = BOOK[id], g = e && GRADES.find((x) => x.name === e.grade);
    return `<div class="bcard ${e ? "" : "locked"} ${sp.boss ? "boss" : ""}"><img alt="" src="${fishThumb(id)}"><b>${e ? sp.name : "???"}</b>
      <small style="background:${TIER_COLOR[sp.tier]}">${sp.tier}</small>
      <p>${e ? `${e.best}cm ${g ? `<i style="background:${g.color}">${g.name}</i>` : ""}<br>${e.n}마리 · ${e.first.slice(5).replace("-", "/")} 첫 낚시` : "아직 못 만났어요"}</p></div>`;
  }).join(""); };
  draw();
  await loadPlace(tab); // 모델을 불러온 뒤 그림을 다시
  if (bookTab === tab && !$("book").hidden) draw();
}
document.querySelectorAll("[data-openbook]").forEach((b) => b.addEventListener("click", () => openBook()));
document.querySelectorAll("[data-booktab]").forEach((b) => b.addEventListener("click", () => openBook(b.dataset.booktab)));
$("bookClose").addEventListener("click", () => { $("book").hidden = true; });
document.querySelectorAll("[data-bait]").forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); setBait(b.dataset.bait); }));
renderMissions();

// 낚시터 버튼: 교사는 언제나, 학생은 선생님이 연 방의 장소만, 그 밖에는 막고 이유를 보여 준다
let MODELS_READY = false;
const DEV_FREE = (() => { try { return localStorage.getItem("jamfish-dev") === "1"; } catch { return false; } })(); // 점검용
function applyGate() {
  const g = DEV_FREE ? { ok: true } : gate();
  document.querySelectorAll("[data-place]").forEach((b) => { b.disabled = !MODELS_READY || !g.ok || (g.room && g.room.mode !== "free" && (g.room.place === "sea" ? "sea" : "fresh") !== b.dataset.place); });
  if (MODELS_READY) $("loadText").textContent = g.ok ? (g.room ? `낚시터가 열렸어요! ${g.room.mode === "free" ? "낚시터를 골라요" : (g.room.place === "sea" ? "바다" : "민물") + " 낚시터로 가요"}` : "낚시터를 골라요!") : g.why;
  // 낚시 중에 선생님이 방을 닫거나 대기실로 돌리면 그 판을 마친다
  if (G.playing && !g.ok && NET.role === "student" && !G.practice) { shout(phaseNow() === "closed" ? "낚시터가 닫혔어요" : "대기실로!", "cream", 1.4); finish(); }
  screens();
}
// ------------------------------------------------------------------ 학급 대회: 학생 전용 주소(/student)·입장·대기실·다 같이 시작
const STUDENT_PAGE = /\/student\/?$/.test(location.pathname);
let lobPlace = "fresh"; try { lobPlace = localStorage.getItem("jamfish-place") === "sea" ? "sea" : "fresh"; } catch {}
let autoStarting = false;
// 낚시터: 자유시간에는 학생이 고른 곳, 아니면 선생님이 정한 곳
const placeFor = (r) => r.mode === "free" ? lobPlace : r.place === "sea" ? "sea" : "fresh";
// 지금 보여 줄 화면: 낚시 중·끝 화면이면 그대로, 학생은 대기실, 학생 주소에서 아직 안 들어왔으면 입장 화면
function screens() {
  const student = NET.role === "student" || (hasTicket() && !NET.ready);
  document.body.classList.toggle("student", student);
  const free = phaseNow() === "free";
  $("againBtn").hidden = student && !free; $("placeBtn").textContent = student ? "대기실로" : "메인 화면으로";
  if (G.playing || autoStarting || !$("end").hidden) { $("lobby").hidden = $("join").hidden = true; return; }
  $("join").hidden = !(STUDENT_PAGE && !student);
  $("lobby").hidden = !student;
  $("start").hidden = student || STUDENT_PAGE;
  if (student) { renderLobby(); if (!lobbyTut && NET.ready) { lobbyTut = true; let seen = false; try { seen = localStorage.getItem("jamfish-tut") === "1"; } catch {} if (!seen) tutOpen(); } }
}
let lobbyTut = false;
function lobbyTick() {
  if (NET.role !== "student") { $("countdown").hidden = true; return; }
  const r = NET.room, ph = phaseNow();
  const cd = $("countdown"), sec = ph === "countdown" ? Math.max(1, Math.ceil((r.startAt - serverNow()) / 1000)) : 0;
  cd.hidden = !sec;
  if (sec && cd.dataset.n !== String(sec)) { cd.dataset.n = sec; const b = cd.querySelector("b"); b.textContent = sec; b.style.animation = "none"; void b.offsetWidth; b.style.animation = ""; SFX.bite(); }
  if (ph === "countdown" || ph === "play") { const pl = placeFor(r); loadPlace(pl); if (G.practice) stopPractice("연습 끝! 대회 시작!"); }
  // 시작! 아직 이번 판을 안 했으면 바로 낚시터로(늦게 들어와도 남은 시간만큼)
  if (ph === "play" && !G.playing && !autoStarting && G.round !== r.round && MODELS_READY) {
    autoStarting = true;
    for (const id of ["town", "book", "tut", "end", "lobby", "start"]) $(id).hidden = true;
    $("tutVid").pause();
    choosePlace(placeFor(r)).finally(() => { autoStarting = false; });
  }
}
setInterval(lobbyTick, 200);
function setLobPlace(p) { lobPlace = p; try { localStorage.setItem("jamfish-place", p); } catch {} document.querySelectorAll("[data-lobplace]").forEach((b) => b.classList.toggle("on", b.dataset.lobplace === p)); }
document.querySelectorAll("[data-lobplace]").forEach((b) => b.addEventListener("click", () => { audio(); setLobPlace(b.dataset.lobplace); }));
setLobPlace(lobPlace);
document.querySelectorAll("[data-tut]").forEach((b) => b.addEventListener("click", () => tutOpen()));
// 연습: 대회를 기다리는 동안 1분짜리 판. 잡은 물고기는 도감·살림망·미션에 안 들어가고, 선생님이 시작하면 바로 멈추고 대회로
let practiceNext = false;
$("lobPractice").addEventListener("click", () => {
  if (!MODELS_READY || autoStarting || !["lobby", "done"].includes(phaseNow())) return;
  autoStarting = true; $("lobby").hidden = true;
  choosePlace(placeFor(NET.room), true).finally(() => { autoStarting = false; });
});
function stopPractice(text) {
  if (!G.playing || !G.practice) return;
  if (F) endFight("lost"); finish(); $("end").hidden = true; shout(text, "sun", 1.2);
}
// 자유 낚시: 대기실에서 바로 낚시터로
$("lobGo").addEventListener("click", () => {
  const r = NET.room; if (!MODELS_READY || autoStarting || phaseNow() !== "free") return;
  autoStarting = true; $("lobby").hidden = true;
  choosePlace(placeFor(r)).finally(() => { autoStarting = false; });
});
bindJoin();
screens();
async function choosePlace(place, practice = false) {
  audio();
  const g = DEV_FREE || practice ? { ok: true } : gate();
  if (!g.ok) { toast(g.why); return; }
  document.querySelectorAll("[data-place]").forEach((b) => { b.disabled = true; });
  setPlace(place); renderLegend(); bgmStart();
  await loadPlace(place);
  applyGate();
  practiceNext = practice; start();
}
document.querySelectorAll("[data-place]").forEach((b) => b.addEventListener("click", () => choosePlace(b.dataset.place)));

// ------------------------------------------------------------------ 하는 법 팝업(처음 한 번 자동, 시작 화면 버튼으로 다시)
// 영상은 게임을 실제로 플레이하며 한 프레임씩 찍은 것(assets/tut). 휴대폰은 세로 화면 영상(-m)
const TUT = [
  { v: "cast", t: "1. 조준하고 던지기", d: TOUCH
    ? "물 위를 <em>꾹 누른 채</em> 손가락을 움직여 방향을 맞춰요. 힘 바늘이 오르내리다 <span class='g'>초록 칸</span>(가운데 <em>노랑</em>은 PERFECT)에 올 때 <em>손을 떼면</em> 휙! 물속 <em>그림자가 클수록</em> 큰 물고기예요."
    : "물 위를 <em>꾹 누른 채</em> 마우스(또는 ← →)로 방향을 맞춰요. 힘 바늘이 오르내리다 <span class='g'>초록 칸</span>(가운데 <em>노랑</em>은 PERFECT)에 올 때 <em>떼면</em> 휙! 스페이스를 꾹 눌렀다 떼도 돼요. 물속 <em>그림자가 클수록</em> 큰 물고기예요." },
  { v: "bite", t: "2. 쏙! 하면 챔기", d: `찌가 <em>톡톡</em> 움직이는 건 간 보는 중이니 기다려요. <span class='r'>쏙!!</span> 하고 들어가면 바로 ${TOUCH ? "<em>화면을 톡</em>" : "<em>스페이스바</em>"}! 너무 빨리 누르면 물고기가 도망가요.` },
  { v: "combo", t: "3. 방향키 콤보", d: TOUCH
    ? "나오는 화살표를 <em>오른쪽 아래 버튼</em>으로 빠르게! <em>감기</em> 칸은 <em>화면 아무 데나 톡</em>. 분홍 원은 고리가 원에 닿을 때 톡. 늦거나 틀리면 하트가 하나 깎여요."
    : "나오는 화살표를 <em>방향키</em>로 빠르게! <em>SPACE</em> 칸은 스페이스바로 릴을 감아요. 분홍 원은 고리가 원에 닿을 때 클릭. 늦거나 틀리면 하트가 하나 깎여요." },
  { v: "mini", t: "4. 미니게임", d: "사투 중간에 <em>모드 카드</em>가 뜨면 방법을 읽어요. 타이밍 바·박자 낚시·줄 버티기·따라잡기·장애물 피하기·점프 넘기·먹이 받기·타자·기억·릴 돌리기·두더지까지 물고기마다 달라요. 큰 물고기와 <span class='r'>보스</span>는 미니게임이 더 나와요." },
  { v: "mash", t: "5. 끌어올리기와 점수", d: `마지막엔 <span class='r'>계속 연타!</span> ${TOUCH ? "화면을" : "아무 키나"} 빠르게 두드려 원을 선 밖까지 키워요. 점수는 <em>크기 × 무게</em>로 정해져요. 같은 물고기라도 <em>내 기록보다 무거우면 ×1.3</em>! 미끼(${TOUCH ? "아래 버튼" : "1·2·3"})·피버·보스도 노려 봐요.` },
];
let tutI = 0;
function tutShow(i) {
  tutI = clamp(i, 0, TUT.length - 1);
  const T = TUT[tutI], v = $("tutVid"), sfx = TOUCH ? "-m" : "";
  v.poster = `assets/tut/${T.v}${sfx}.jpg`; v.src = `assets/tut/${T.v}${sfx}.webm`; v.play?.().catch(() => {});
  $("tutStep").textContent = `${tutI + 1} / ${TUT.length}`; $("tutTitle").textContent = T.t; $("tutText").innerHTML = T.d;
  $("tutDots").innerHTML = TUT.map((_, k) => `<i class="${k === tutI ? "on" : ""}" data-k="${k}"></i>`).join("");
  $("tutPrev").disabled = tutI === 0; $("tutNext").textContent = tutI === TUT.length - 1 ? "낚시하러 가기!" : "다음";
}
function tutOpen() { $("tut").hidden = false; tutShow(0); }
function tutClose() { $("tut").hidden = true; $("tutVid").pause(); $("tutVid").removeAttribute("src"); try { localStorage.setItem("jamfish-tut", "1"); } catch {} }
$("tutOpen").addEventListener("click", tutOpen);
$("tutClose").addEventListener("click", tutClose);
$("tutPrev").addEventListener("click", () => tutShow(tutI - 1));
$("tutNext").addEventListener("click", () => (tutI === TUT.length - 1 ? tutClose() : tutShow(tutI + 1)));
$("tutDots").addEventListener("click", (e) => { const k = e.target.dataset?.k; if (k != null) tutShow(+k); });
setTimeout(() => initNet({ SPECIES, toast, sample, fishThumb: (id) => fishThumb(id) || BLANK_PX, onProfile: applyGear, onGate: applyGate, onLobby: () => { if (!$("lobby").hidden) renderLobby(); }, mountAvatar }), 600);
const BLANK_PX = "data:image/gif;base64,R0lGODlhAQABAAAAACw=";
let tutSeen = false; try { tutSeen = localStorage.getItem("jamfish-tut") === "1"; } catch {}
if (!tutSeen && !STUDENT_PAGE) tutOpen(); // 학생 주소에서는 입장한 뒤 대기실에서 보여 준다
// 한 판 더: 학생은 그사이 선생님이 바꾼 낚시터로(예전 판 장소를 그대로 쓰지 않게)
$("againBtn").addEventListener("click", () => { const r = NET.role === "student" && NET.room; if (r && placeFor(r) !== PLACE) { $("end").hidden = true; choosePlace(placeFor(r)); } else start(); });
document.addEventListener("click", (e) => { if (e.target.closest?.("[data-town]")) { loadPlace("fresh").then(() => loadPlace("sea")).then(() => { if (!$("town").hidden) import("./town.js?v=17").then((m) => m.renderTown()); }); } }, true);
$("placeBtn").addEventListener("click", () => { $("end").hidden = true; if (NET.role === "student") screens(); else $("start").hidden = false; });

const CAM = { pos: new THREE.Vector3(1.4, 6.4, STAND.z + 7.2), look: new THREE.Vector3(0, 0, POND.z) };
let last = performance.now(), clock = 0, perfT = 0, perfN = 0, perfSum = 0, perfGood = 0;
function frame(now) {
  // 메뉴만 떠 있을 때는 초당 30번만 그린다(배경은 거의 안 움직이니까)
  const menu = !G.playing && (!$("start").hidden || !$("town").hidden || !$("end").hidden || !$("lobby").hidden || !$("join").hidden || !$("host").hidden);
  if (menu && now - last < 31) { requestAnimationFrame(frame); return; }
  const raw = (now - last) / 1000;
  const dt = Math.min(.05, raw); last = now; clock += dt;
  // 낚시 중 2초마다 평균 프레임 간격을 보고, 느리면 해상도를 한 단계 낮춘다(빠르게 오래 돌면 다시 올린다)
  if (!menu && !document.hidden && raw < .5) {
    perfSum += raw; perfN++; perfT += raw;
    if (perfT > 2) {
      const avg = perfSum / perfN; perfT = perfSum = perfN = 0;
      if (avg > .021 && qLevel < QUALITY.length - 1) { qLevel++; perfGood = 0; resize(); }
      else if (avg < .0135 && qLevel > 0 && ++perfGood >= 4) { qLevel--; perfGood = 0; resize(); }
    }
  }
  const t = clock;
  if (G.playing) {
    G.time -= dt;
    const left = Math.max(0, G.time);
    $("timer").textContent = `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, "0")}`;
    $("timerChip").classList.toggle("low", left < 20);
    if (G.time <= 0 && !G.ending) { if (F) { G.ending = true; shout("마지막 승부!", "hot", 1.2); } else finish(); }
  }
  stepSpots(dt, t); stepJumpers(dt, t); stepAim(dt); stepDeco(t); stepAvatar(dt, t); stepBubbles(dt, t); stepRain(dt); stepFever(dt);
  if (G.playing && !G.bossSpawned && G.time < 75 && !F && !show) spawnBoss();
  $("baits").hidden = !G.playing || !!F || R.state !== "idle";
  updateAngler(dt, t);
  updateFight(dt, t);
  updateRodAndLine(dt, t);
  updateShow(dt, t);
  stepDrops(dt); stepRings(dt);
  if (card > 0) { card -= dt; if (card <= 0) $("card").hidden = true; }
  waterMat.uniforms.t.value = t;
  bgmTick();
  if (seaGroup.visible) buoys.forEach((b, i) => { b.position.y = .05 + Math.sin(t * 1.6 + i * 2) * .07; b.rotation.z = Math.sin(t * 1.2 + i) * .12; });
  // 카메라: 평소엔 연못 전체, 싸울 때는 낚시꾼 어깨 너머로 다가가 물고기를 본다
  const gp = _c.set(1.4, 6.4, STAND.z + 7.2), gl = _d.set(0, 0, POND.z + 1);
  if (F && F.chart[F.i]?.type === "mash") { // 연타: 물고기 코앞으로 클로즈업, 누를 때마다 같이 휘청
    const fp = F.fish.group.position, bx = angler.position.x - fp.x, bz = angler.position.z - fp.z, bl = Math.hypot(bx, bz) || 1;
    const back = 2.4 + F.fish.len * 1.1;
    gp.set(fp.x + bx / bl * back + .6 + F.tug * .35, 1.5 + F.fish.len * .55, fp.z + bz / bl * back);
    gl.set(fp.x + F.tug * .25, .35, fp.z);
  } else if (F) { const fp = F.fish.group.position; gp.set(fp.x * .35 + 1.2, 4.6, STAND.z + 5); gl.set(fp.x * .7, 0, (fp.z + STAND.z) / 2 - 1.2); }
  else if (show) { const p = show.fish.group.position; gp.set(p.x + .8, 3.2, p.z + 4.2); gl.set(p.x - .3, .6, p.z - 1); }
  if (camera.aspect < .8) gp.sub(gl).multiplyScalar(1.15).add(gl);
  const mashCam = F && F.chart[F.i]?.type === "mash";
  CAM.pos.lerp(gp, ease(mashCam ? 4 : 2.2, dt)); CAM.look.lerp(gl, ease(mashCam ? 6 : 2.6, dt));
  shake = Math.max(0, shake - dt * 1.6);
  camera.position.set(CAM.pos.x + Math.sin(t * 53) * shake * .35, CAM.pos.y + Math.cos(t * 47) * shake * .25, CAM.pos.z);
  punch = lerp(punch, 0, ease(9, dt));
  const baseFov = camera.aspect < .8 ? 58 : 40;
  camera.fov = baseFov - punch * 4 - (F ? 2 : 0); camera.updateProjectionMatrix();
  camera.lookAt(CAM.look);
  // 집중선: 연타·우다다·급할 때
  const hype = F && (F.chart[F.i]?.type === "mash" || F.chart[F.i]?.burst || F.noteT / F.chart[F.i].win > .6);
  $("speed").classList.toggle("on", !!hype);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
setPlace("fresh");
resetSpots();
requestAnimationFrame(frame);

// ------------------------------------------------------------------ 모델 불러오기
// 낚시꾼은 바로, 물고기는 고른 낚시터 것만 불러온다(민물·바다 합치면 크니까)
let MODEL_LIST = [];
const loading = {};
function loadPlace(place) {
  if (loading[place]) return loading[place];
  const list = MODEL_LIST.filter((m) => SPECIES[m.id]?.water === place && !models[m.id]);
  let done = 0;
  const show = () => { $("loadText").textContent = `${PLACES[place].name} 물고기 부르는 중… ${done}/${list.length}`; };
  show();
  return (loading[place] = Promise.all([preloadFishPics(place), ...list.map(async (m) => {
    try { await loadFish(m.id, m.file, m.yaw, m.roll, m.spin); } catch (e) { console.warn("모델", m.id, e); }
    done++; show();
  })]).then(() => { if (MODELS_READY) applyGate(); else $("loadText").textContent = "준비 완료!"; }));
}
(async () => {
  try { MODEL_LIST = await (await fetch("models.json", { cache: "no-cache" })).json(); } catch { MODEL_LIST = []; }
  $("loadText").textContent = "낚시꾼 준비 중…";
  try { await loadAngler(GEAR.me?.look?.base || 0); } catch (e) { console.warn("낚시꾼", e); }
  MODELS_READY = true; applyGate();
  loadPlace("fresh"); // 미리 받아 두기
})();

// 점검용 훅
window.__fish = { get AVA() { return AVA; }, get AV() { return AV; }, MINI_FISH, fishSprite, get PLACE() { return PLACE; }, endFight, HAIR, avShot(spin, pitch = .62) { AV.spin = spin; AV.drag = 0; AV.pitch = pitch; stepAvatar(0, 0); AV.drag = null; AV.pitch = null; return AV.cv.toDataURL(); }, renderer, scene, get qLevel() { return qLevel; }, applyGear: (m) => applyGear(m ?? NET.me), screenOf(x, z) { tmpV.set(x, 0, z).project(camera); const r = renderer.domElement.getBoundingClientRect(); return { x: r.left + (tmpV.x + 1) / 2 * r.width, y: r.top + (1 - tmpV.y) / 2 * r.height }; }, CALM, miniNote, MINI_TYPES, aimStart, castRelease, AIM, stepAim, get ac() { return ac; }, jump(type) { const i = F.chart.findIndex((n) => n.type === type); if (i >= 0) { F.i = i; showNote(); } }, typeLetter, whackCell, BOOK, MS, missionEvent, startFever, spawnBoss, setBait, applyWeather, openBook, HOLD, PLAY_STYLE, setPlace, loadPlace, choosePlace, GRADES, SAMPLES, G, R, spots, SPECIES, castTo, press, start, finish, models, get F() { return F; }, newSpot, hook, spawnJumper, JUMPERS };
