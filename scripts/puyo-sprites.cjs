// 뿌요 캐릭터 SVG 생성기 — 피규어 조명을 5종에 일관 적용:
// 좌상단 키라이트 + 우하단 형태 그림자(터미네이터) + 좌상단 림라이트 + 하단 색 반사광 + 창문 반사 + 접지 그림자.
const fs = require("fs"), path = require("path");
const out = process.argv[2] || path.join(__dirname, "../public/puyo/assets");

// 몸통에서 몸통을 (dx,dy)만큼 민 모양을 뺀 초승달 — 가장자리 빛/그림자를 만드는 마스크
const crescent = (id, body, dx, dy, blur) => `<mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="96" height="96"><rect width="96" height="96" fill="#fff"/><path d="${body}" transform="translate(${dx} ${dy})" fill="#000" filter="url(#${blur})"/></mask>`;

const common = (c) => `
  <filter id="blur05" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation=".6"/></filter>
  <filter id="blur1" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="1.1"/></filter>
  <filter id="blur2" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="2.4"/></filter>
  <filter id="blur3" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="3.4"/></filter>
  <radialGradient id="body" cx="${c.lx ?? .38}" cy="${c.ly ?? .3}" r=".82" fx="${(c.lx ?? .38) - .06}" fy="${(c.ly ?? .3) - .08}">
    <stop offset="0" stop-color="${c.light}"/><stop offset=".42" stop-color="${c.base}"/><stop offset=".84" stop-color="${c.deep}"/><stop offset="1" stop-color="${c.core}"/>
  </radialGradient>
  <radialGradient id="ao" cx=".44" cy=".4" r=".68"><stop offset=".6" stop-color="${c.core}" stop-opacity="0"/><stop offset="1" stop-color="${c.core}" stop-opacity=".5"/></radialGradient>
  <linearGradient id="spec" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset="1" stop-color="#fff" stop-opacity=".05"/></linearGradient>
  <radialGradient id="shadow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="${c.core}" stop-opacity=".55"/><stop offset="1" stop-color="${c.core}" stop-opacity="0"/></radialGradient>
  <clipPath id="clip"><path d="${c.body}"/></clipPath>
  ${crescent("term", c.body, -6, -7, "blur2")}
  ${crescent("rim", c.body, 2.4, 2.8, "blur05")}
  ${crescent("kick", c.body, -2.2, -2.6, "blur05")}`;

const eye = (cx, cy, rx, ry, _iris, id) => `
  <ellipse cx="${cx}" cy="${cy + 1}" rx="${rx + 1.4}" ry="${ry + 1.4}" fill="#000" opacity=".2" filter="url(#blur1)"/>
  <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="url(#sclera)"/>
  <ellipse cx="${cx + .5}" cy="${cy + .9}" rx="${rx * .76}" ry="${ry * .84}" fill="url(#${id})"/>
  <ellipse cx="${cx + .5}" cy="${cy + .9}" rx="${rx * .76}" ry="${ry * .84}" stroke="#000" stroke-opacity=".35" stroke-width=".8"/>
  <ellipse cx="${cx + .6}" cy="${cy + 1.6}" rx="${rx * .36}" ry="${ry * .46}" fill="#0b0b14" opacity=".85"/>
  <ellipse cx="${cx + .6}" cy="${cy + ry * .5}" rx="${rx * .5}" ry="${ry * .22}" fill="#fff" opacity=".28" filter="url(#blur05)"/>
  <ellipse cx="${cx - rx * .22}" cy="${cy - ry * .32}" rx="${rx * .36}" ry="${ry * .26}" fill="#fff"/>
  <circle cx="${cx + rx * .34}" cy="${cy + ry * .36}" r="${rx * .15}" fill="#fff" opacity=".9"/>
  <circle cx="${cx + rx * .1}" cy="${cy - ry * .55}" r="${rx * .08}" fill="#fff" opacity=".8"/>`;
const irisDef = (id, a, b) => `<radialGradient id="${id}" cx=".45" cy=".7" r=".8"><stop offset="0" stop-color="${a}"/><stop offset=".55" stop-color="${b}"/><stop offset="1" stop-color="#000" stop-opacity=".9"/></radialGradient>`;
const sclera = `<radialGradient id="sclera" cx=".42" cy=".32" r=".75"><stop offset="0" stop-color="#fff"/><stop offset=".8" stop-color="#eef1f8"/><stop offset="1" stop-color="#c9cfdf"/></radialGradient>`;

function svg(c) {
  const sx = c.sx ?? 33, sy = c.sy ?? 30, sr = c.sr ?? -24;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" fill="none"><title>${c.title}</title><defs>${common(c)}${c.defs || ""}</defs>
<ellipse cx="48" cy="87.5" rx="32" ry="5.5" fill="url(#shadow)"/>
<ellipse cx="48" cy="86.8" rx="20" ry="2.4" fill="${c.core}" opacity=".4" filter="url(#blur1)"/>
${c.behind || ""}
<path d="${c.body}" fill="url(#body)"/>
<path d="${c.body}" fill="url(#ao)"/>
<g clip-path="url(#clip)">
  <rect width="96" height="96" fill="${c.core}" opacity=".42" mask="url(#term)"/>
  <ellipse cx="50" cy="${c.bounceY ?? 93}" rx="34" ry="12" fill="${c.bounce}" opacity=".8" filter="url(#blur3)"/>
  <rect width="96" height="96" fill="${c.bounce}" opacity=".85" mask="url(#kick)"/>
  <rect width="96" height="96" fill="#fff" opacity=".55" mask="url(#rim)"/>
  ${c.inside || ""}
</g>
<path d="${c.body}" stroke="${c.core}" stroke-width="2.2" stroke-linejoin="round" opacity=".7"/>
${c.front || ""}
<g clip-path="url(#clip)">
  <ellipse cx="${sx}" cy="${sy}" rx="${c.srx ?? 13}" ry="${c.sry ?? 7.5}" transform="rotate(${sr} ${sx} ${sy})" fill="url(#spec)" opacity=".7" filter="url(#blur2)"/>
</g>
<g transform="rotate(${sr} ${sx - 3} ${sy - 1.5})" fill="#fff">
  <rect x="${sx - 8.5}" y="${sy - 4.5}" width="6.2" height="5.4" rx="2.2" opacity=".95"/>
  <rect x="${sx - 1.3}" y="${sy - 4.5}" width="3.6" height="5.4" rx="1.6" opacity=".8"/>
</g>
<circle cx="${sx + 7}" cy="${sy - 5}" r="1.2" fill="#fff" opacity=".85"/>
${c.face}
</svg>`;
}

const chars = {
  gengar: {
    title: "보라 팬텀 뿌요",
    light: "#E2C8FF", base: "#9A5CF0", deep: "#5B26B4", core: "#34106F", bounce: "#D59CFF",
    body: "M17 44 13 23 30 29 36 13 47 24 61 11 66 28 83 21 78 43C89 61 83 80 66 84 53 88 32 87 22 80 9 72 9 56 17 44Z",
    sx: 31, sy: 36, sr: -28,
    behind: `<path d="m15 57-6 7 9 3m63-10 6 7-9 3" fill="#7F45D6" stroke="#34106F" stroke-width="1.8" stroke-linejoin="round" stroke-opacity=".6"/>`,
    defs: `${sclera}<radialGradient id="redeye" cx=".4" cy=".3" r=".8"><stop offset="0" stop-color="#FFB3C4"/><stop offset=".6" stop-color="#FF4F7E"/><stop offset="1" stop-color="#C21B4F"/></radialGradient>
      <linearGradient id="teeth" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#E4DCEF"/></linearGradient>`,
    face: `<path d="m24 42 17 6c-1 11-15 12-17-6Zm48 0-17 6c1 11 15 12 17-6Z" fill="url(#redeye)" stroke="#2A0C55" stroke-width="1.6"/>
      <path d="M27 45c3 2 6 3 9 3" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity=".75"/><path d="M60 48c3 0 6-1 9-3" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity=".75"/>
      <path d="m33 47 1 6m29-6-1 6" stroke="#4A0F2A" stroke-width="3" stroke-linecap="round"/>
      <path d="M25 62c14 5 32 5 46-1-3 13-15 17-23 17-10 0-20-5-23-16Z" fill="#2A0C55" opacity=".25" transform="translate(0 1.5)" filter="url(#blur1)"/>
      <path d="M25 61c14 5 32 5 46-1-3 13-15 17-23 17-10 0-20-5-23-16Z" fill="url(#teeth)" stroke="#2A0C55" stroke-width="1.8" stroke-linejoin="round"/>
      <path d="m36 65 1 8m11-7v10m12-11-1 8" stroke="#9C87B8" stroke-width="1.4"/>
      <path d="m22 39 20 8m32-8-20 8" stroke="#34106F" stroke-width="3.6" stroke-linecap="round"/>`,
  },
  snorlax: {
    title: "초록 잠만보 뿌요",
    light: "#B9F7D6", base: "#38C48C", deep: "#178462", core: "#09503A", bounce: "#8FF0C4",
    body: "M20 35 22 13q2-5 6 0l12 12q8-2 16 0l12-12q4-5 6 0l2 22C88 45 88 68 78 79c-11 12-49 12-60 0C8 68 8 45 20 35Z",
    sx: 30, sy: 31, sr: -20, srx: 11,
    defs: `<radialGradient id="cream" cx=".42" cy=".3" r=".8"><stop offset="0" stop-color="#FFFBEA"/><stop offset=".7" stop-color="#F6E7BC"/><stop offset="1" stop-color="#D9C189"/></radialGradient>`,
    inside: `<path d="M22 58C18 48 25 35 35 35q8 0 13 7 5-7 13-7c10 0 17 13 13 23 9 14 0 25-26 25S13 72 22 58Z" fill="#09503A" opacity=".28" transform="translate(0 2)" filter="url(#blur1)"/>
      <path d="M22 58C18 48 25 35 35 35q8 0 13 7 5-7 13-7c10 0 17 13 13 23 9 14 0 25-26 25S13 72 22 58Z" fill="url(#cream)"/>
      <path d="M30 41c4-3 9-3 12 0" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity=".8"/>`,
    front: `<path d="M22 31 25 20l8 10m31 0 7-10 2 11" fill="#D2FFE6" opacity=".55"/>
      <path d="M17 58c-5 8-2 14 7 16m55-16c5 8 2 14-7 16" stroke="#0E6A4C" stroke-width="2.6" stroke-linecap="round"/>`,
    face: `<path d="m28 48 11 2m18 0 11-2" stroke="#2C4235" stroke-width="3.1" stroke-linecap="round"/>
      <path d="M36 60q12 5 24 0" stroke="#2C4235" stroke-width="2.6" stroke-linecap="round"/>
      <path d="m35 60 3 6 3-5m14 0 3 5 3-6" fill="#FFF" stroke="#2C4235" stroke-width="1.3" stroke-linejoin="round"/>
      <ellipse cx="25" cy="58" rx="5.5" ry="3" fill="#F29C93" opacity=".55" filter="url(#blur1)"/><ellipse cx="71" cy="58" rx="5.5" ry="3" fill="#F29C93" opacity=".55" filter="url(#blur1)"/>`,
  },
  charmander: {
    title: "빨강 파이리 뿌요",
    light: "#FFD2A6", base: "#FF6A4E", deep: "#D8343C", core: "#7E1420", bounce: "#FFB07A",
    body: "M15 50C15 28 27 17 44 17c19 0 30 14 30 34 0 6 5 10 5 17 0 13-15 18-34 18S10 79 10 67c0-7 5-11 5-17Z",
    sx: 30, sy: 28, sr: -30,
    defs: `${sclera}${irisDef("ch-iris", "#3E7C78", "#102B2A")}
      <linearGradient id="flame" x1="83" y1="36" x2="80" y2="68" gradientUnits="userSpaceOnUse"><stop stop-color="#FFF08A"/><stop offset=".45" stop-color="#FFA126"/><stop offset="1" stop-color="#F0402E"/></linearGradient>
      <radialGradient id="belly" cx=".45" cy=".25" r=".8"><stop offset="0" stop-color="#FFF6D6"/><stop offset=".7" stop-color="#FFDDA0"/><stop offset="1" stop-color="#E9B26C"/></radialGradient>
      <radialGradient id="glow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#FFC94A" stop-opacity=".7"/><stop offset="1" stop-color="#FF7A2A" stop-opacity="0"/></radialGradient>`,
    behind: `<circle cx="82" cy="54" r="15" fill="url(#glow)"/>
      <path d="M68 68q13 8 14-8" stroke="#9C2430" stroke-width="10" stroke-linecap="round"/><path d="M68 68q13 8 14-8" stroke="#FF7A55" stroke-width="5.5" stroke-linecap="round"/>
      <path d="M81 64c-10-5-8-12-3-17q0 7 4 5c4-5 3-11 1-15 13 13 13 23-2 27Z" fill="url(#flame)"/>
      <path d="M81 61q-5-4 1-10 0 5 4 4 1 4-5 6" fill="#FFFBD0"/>`,
    inside: `<path d="M28 77c0-11 7-17 17-17s18 6 18 17c-9 6-26 6-35 0Z" fill="#7E1420" opacity=".3" transform="translate(0 -1.5)" filter="url(#blur1)"/>
      <path d="M28 77c0-11 7-17 17-17s18 6 18 17c-9 6-26 6-35 0Z" fill="url(#belly)"/>`,
    front: `<path d="m16 64 6 5m51-5-6 5" stroke="#8E1D2A" stroke-width="2.6" stroke-linecap="round"/>`,
    face: `${eye(29, 44, 5.5, 9, "", "ch-iris")}${eye(59, 44, 5.5, 9, "", "ch-iris")}
      <path d="M33 58q11 11 23 0" fill="#9E2C3D" stroke="#7E1420" stroke-width="2" stroke-linecap="round"/>
      <path d="M38 62q6 3 12 0" stroke="#FF8D9A" stroke-width="2.2" stroke-linecap="round"/>
      <path d="m35 59 3 4 2-3m11 0 2 3 2-4" fill="#FFF8E4"/>
      <path d="m41 51 1 1m6-1 1 1" stroke="#A0333A" stroke-width="1.8" stroke-linecap="round"/>
      <ellipse cx="21" cy="55" rx="4.5" ry="2.4" fill="#FFB892" opacity=".8" filter="url(#blur1)"/><ellipse cx="67" cy="55" rx="4.5" ry="2.4" fill="#FFB892" opacity=".8" filter="url(#blur1)"/>`,
  },
  squirtle: {
    title: "파랑 꼬부기 뿌요",
    light: "#D4F6FF", base: "#55C2F5", deep: "#2380D4", core: "#0E3F7C", bounce: "#9BE7FF",
    body: "M17 42C17 25 31 15 48 15s31 10 31 27c0 12-8 18-13 23 7 5 8 13 3 17-8 5-36 5-43 0-5-4-4-12 3-17-5-5-12-11-12-23Z",
    sx: 31, sy: 26, sr: -18, srx: 12,
    defs: `${sclera}${irisDef("sq-iris", "#B35C88", "#4A1834")}
      <radialGradient id="shell" cx=".4" cy=".3" r=".85"><stop offset="0" stop-color="#E7AE74"/><stop offset=".6" stop-color="#B9773F"/><stop offset="1" stop-color="#7A4620"/></radialGradient>
      <radialGradient id="belly" cx=".45" cy=".25" r=".85"><stop offset="0" stop-color="#FFF7D6"/><stop offset=".7" stop-color="#F3CF8A"/><stop offset="1" stop-color="#D5A55E"/></radialGradient>
      <radialGradient id="tail" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#B7EEFF"/><stop offset="1" stop-color="#2D8FD8"/></radialGradient>`,
    behind: `<path d="M70 78c18 2 23-11 15-17-6-4-12 2-8 6q3 3 6 0" stroke="#0E3F7C" stroke-opacity=".55" stroke-width="7" stroke-linecap="round"/>
      <path d="M70 78c18 2 23-11 15-17-6-4-12 2-8 6q3 3 6 0" stroke="url(#tail)" stroke-width="4.6" stroke-linecap="round"/>
      <path d="M20 50C6 54 8 76 23 80l49-1C86 70 84 52 72 49Z" fill="url(#shell)"/>
      <path d="M20 50C6 54 8 76 23 80l49-1C86 70 84 52 72 49Z" stroke="#5C3214" stroke-width="1.6" stroke-opacity=".6"/>
      <path d="M19 55C8 63 14 77 24 78m49-23c10 8 6 20-3 23" stroke="#FFE8BC" stroke-width="3" stroke-linecap="round" opacity=".9"/>`,
    inside: `<path d="M33 63q15 7 30 0l2 16q-17 9-34 0Z" fill="#0E3F7C" opacity=".3" transform="translate(0 -1.5)" filter="url(#blur1)"/>
      <path d="M33 63q15 7 30 0l2 16q-17 9-34 0Z" fill="url(#belly)"/>
      <path d="M33 73h30M48 68v10m0 0-9 6m9-6 9 6" stroke="#C3965A" stroke-width="1.6"/>`,
    front: `<path d="m26 66-8 6m52-6 7 6" stroke="#174F94" stroke-width="2.6" stroke-linecap="round"/>`,
    face: `${eye(32, 41, 6, 9, "", "sq-iris")}${eye(64, 41, 6, 9, "", "sq-iris")}
      <path d="M35 55q13 11 26-1" fill="#B9566F" stroke="#0E3F7C" stroke-width="2" stroke-linecap="round"/>
      <path d="M42 61q6-4 12-1" stroke="#FFB3BF" stroke-width="2.4" stroke-linecap="round"/>
      <ellipse cx="24" cy="52" rx="4.8" ry="2.4" fill="#FFC2D0" opacity=".55" filter="url(#blur1)"/><ellipse cx="72" cy="52" rx="4.8" ry="2.4" fill="#FFC2D0" opacity=".55" filter="url(#blur1)"/>`,
  },
  nuisance: {
    title: "회색 방해 뿌요",
    light: "#F7F9FF", base: "#B4BDD3", deep: "#7A84A2", core: "#3A4360", bounce: "#DCE3F7",
    body: "M17 51C17 34 28 21 48 21s31 13 31 30c0 8 7 12 7 19 0 11-15 16-38 16S10 81 10 70c0-7 7-11 7-19Z",
    sx: 32, sy: 33, sr: -22,
    defs: `<radialGradient id="dot" cx=".4" cy=".3" r=".8"><stop offset="0" stop-color="#6B7595"/><stop offset="1" stop-color="#262D44"/></radialGradient>`,
    inside: `<path d="M40 70c5 2 11 2 16 0" stroke="#7A84A2" stroke-width="1.4" stroke-linecap="round" opacity=".5"/>`,
    face: `<path d="m28 46 13 4m27-4-13 4" stroke="#545D7B" stroke-width="3" stroke-linecap="round"/>
      <ellipse cx="33" cy="57" rx="4.6" ry="6" fill="#000" opacity=".15" filter="url(#blur1)"/><ellipse cx="63" cy="57" rx="4.6" ry="6" fill="#000" opacity=".15" filter="url(#blur1)"/>
      <ellipse cx="33" cy="56" rx="4" ry="5.5" fill="url(#dot)"/><ellipse cx="63" cy="56" rx="4" ry="5.5" fill="url(#dot)"/>
      <ellipse cx="34" cy="53.6" rx="1.5" ry="1.2" fill="#F2F5FF"/><ellipse cx="64" cy="53.6" rx="1.5" ry="1.2" fill="#F2F5FF"/>
      <path d="M41 68q7-4 14 0" stroke="#4D5674" stroke-width="2.8" stroke-linecap="round"/>`,
  },
};
for (const [name, c] of Object.entries(chars)) fs.writeFileSync(path.join(out, name + ".svg"), svg(c).replace(/\n\s*/g, ""));
