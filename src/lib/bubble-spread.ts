// 말풍선 겹침 풀기 — 화면에 놓인 말풍선 사각형들을 서로 겹치지 않게 조금씩 밀어낸다.
// 옆으로 조금만 비키면 되는 겹침은 양쪽이 반씩 옆으로, 많이 겹치면 위쪽 말풍선이 주로 위로 올라간다
// (아래로 많이 밀면 자기 캐릭터 머리를 가리므로). 화면(bounds) 밖으로는 나가지 않는다.
// 순수 모듈 — tests/brainstorm-map.test.cjs 에서 함께 검사한다.

export type Box = { x: number; y: number; w: number; h: number };
export type Shift = { dx: number; dy: number };

export function spreadBubbles(boxes: Box[], bounds: Box, gap = 6, rounds = 60): Shift[] {
  const pos = boxes.map(b => ({ x: b.x, y: b.y }));
  const clamp = (i: number) => {
    const b = boxes[i]; const p = pos[i];
    p.x = Math.min(bounds.x + bounds.w - b.w, Math.max(bounds.x, p.x));
    p.y = Math.min(bounds.y + bounds.h - b.h, Math.max(bounds.y, p.y));
  };
  for (let r = 0; r < rounds; r++) {
    let moved = false;
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = pos[i]; const b = pos[j]; const A = boxes[i]; const B = boxes[j];
      const ox = Math.min(a.x + A.w, b.x + B.w) - Math.max(a.x, b.x) + gap;
      const oy = Math.min(a.y + A.h, b.y + B.h) - Math.max(a.y, b.y) + gap;
      if (ox <= 0 || oy <= 0) continue;
      moved = true;
      if (ox < oy * 1.6) {
        // 옆으로 반씩 비키기 — 한쪽이 화면 끝에 막히면 다른 쪽이 나머지만큼 더 비킨다
        const dir = a.x + A.w / 2 <= b.x + B.w / 2 ? -1 : 1;
        const ax = a.x; const bx = b.x;
        a.x += (dir * ox) / 2; clamp(i); b.x -= (dir * ox) / 2; clamp(j);
        const left = ox - Math.abs(a.x - ax) - Math.abs(b.x - bx);
        if (left > 0.5) { a.x += dir * left; clamp(i); b.x -= dir * left; clamp(j); }
      } else {
        // 위에 있는 말풍선이 더 위로(아래로 밀면 캐릭터 머리를 가린다) — 위가 막히면 아래쪽이 내려간다
        const [up, down, ui, di] = a.y <= b.y ? [a, b, i, j] : [b, a, j, i];
        // 위쪽이 대부분(70%) 올라가고 아래쪽도 조금(30%) 내려간다 — 셋 이상 줄줄이 겹쳐도 서로 밀며 풀린다
        const uy = up.y; const dy0 = down.y;
        up.y -= oy * 0.7; clamp(ui); down.y += oy * 0.3; clamp(di);
        const left = oy - (uy - up.y) - (down.y - dy0);
        if (left > 0.5) { up.y -= left; clamp(ui); down.y += oy - (uy - up.y) - (down.y - dy0); clamp(di); }
      }
    }
    if (!moved) break;
  }
  return boxes.map((b, i) => ({ dx: pos[i].x - b.x, dy: pos[i].y - b.y }));
}
