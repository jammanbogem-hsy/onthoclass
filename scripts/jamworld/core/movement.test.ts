import { test } from "node:test";
import assert from "node:assert/strict";
import { isometric } from "../../../src/features/jamworld/lib/render/projection";
import { createMap } from "../../../src/features/jamworld/lib/world/map";
import {
  DIR8,
  ISO_SCREEN_SPEED,
  WALK_CYCLE_PX,
  moveIso,
  moveTopDown,
  screenDir8,
  stableScreenDir8,
  walkFrame,
} from "../../../src/features/jamworld/lib/world/movement";
import { applyOps } from "../../../src/features/jamworld/lib/world/ops";
import {
  PlayWorld,
  type PlayerState,
} from "../../../src/features/jamworld/lib/world/play";

const open = () => new PlayWorld(createMap("m", "t", 60, 60));
const start = (): PlayerState => ({ x: 30.5, y: 30.5, dir: 0, moving: false });

function screenTravel(ix: number, iy: number, secs = 1) {
  const w = open();
  let p = start();
  for (let i = 0; i < secs * 30; i++) p = moveIso(w, p, ix, iy, 1 / 30);
  const a = isometric.toScreen(30.5, 30.5);
  const b = isometric.toScreen(p.x, p.y);
  return { dx: b.x - a.x, dy: b.y - a.y, p };
}

test("iso: 상하좌우·대각 모두 화면 속도가 같다 (격자 정규화로 수평이 2배 빠르던 문제)", () => {
  const reference = screenTravel(1, 0).dx;
  for (const [ix, iy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [-1, 1],
  ]) {
    const { dx, dy } = screenTravel(ix, iy);
    const sp = Math.hypot(dx, dy);
    assert.ok(Math.abs(sp - reference) < 1e-6, `${ix},${iy}: ${sp}`);
    assert.ok(
      sp < ISO_SCREEN_SPEED && sp > ISO_SCREEN_SPEED * 0.9,
      "Start-up eases into the full speed",
    );
    // 화면에서 입력 방향으로 곧게 움직인다
    const cross = dx * iy - dy * ix;
    assert.ok(
      Math.abs(cross) < 1e-6 * ISO_SCREEN_SPEED,
      `${ix},${iy} 방향 어긋남`,
    );
  }
});

test("iso: 화면 기준 8방향 표시 (오른쪽=동, 위=북, 오른쪽 아래=남동)", () => {
  const face = (ix: number, iy: number) =>
    DIR8[screenTravel(ix, iy, 0.2).p.face8!];
  assert.equal(face(1, 0), "e");
  assert.equal(face(-1, 0), "w");
  assert.equal(face(0, -1), "n");
  assert.equal(face(0, 1), "s");
  assert.equal(face(1, 1), "se");
  assert.equal(face(-1, -1), "nw");
  assert.equal(screenDir8(1, -1), 5);
});

test("iso: 걷기 위상은 실제 이동 거리 기준, 벽에 막히면 대기 프레임", () => {
  const { p, dx, dy } = screenTravel(1, 0, 0.5);
  assert.ok(p.moving && walkFrame(p) > 0);
  assert.ok(Math.abs((p.walk ?? 0) - Math.hypot(dx, dy)) < 1e-6);
  // 정면이 막힌 벽: 화면 오른쪽(격자 +x,−y) 방향을 막는다
  const doc = applyOps(createMap("m", "t", 20, 20), [
    { op: "setSpawn", x: 2, y: 2 },
    { op: "line", assetId: "wall.stone", x1: 6, y1: 0, x2: 6, y2: 19 },
    { op: "line", assetId: "wall.stone", x1: 0, y1: 4, x2: 5, y2: 4 },
  ]).doc;
  const w = new PlayWorld(doc);
  let q: PlayerState = { x: 5.65, y: 4.35 - 1, dir: 0, moving: false };
  // 구석(동쪽 벽·남쪽 벽)으로 계속 밀면 멈추고 대기
  for (let i = 0; i < 60; i++) q = moveIso(w, q, 1, 1, 1 / 30);
  assert.equal(q.moving, false);
  assert.equal(walkFrame(q), 0);
  assert.equal(DIR8[q.face8!], "se");
});
test("iso: 출발은 가속하고 놓거나 교사가 멈추면 즉시 정지한다", () => {
  const world = open(),
    p = start();
  const first = moveIso(world, p, 1, 0, 1 / 60);
  assert.ok(
    first.screenVelocity!.x > 0 &&
      first.screenVelocity!.x < ISO_SCREEN_SPEED / 4,
  );
  const cruising = screenTravel(1, 0, 0.3).p;
  assert.equal(cruising.screenVelocity!.x, ISO_SCREEN_SPEED);
  const stopped = moveIso(world, cruising, 0, 0, 1 / 60);
  assert.equal(stopped.x, cruising.x);
  assert.equal(stopped.y, cruising.y);
  assert.equal(stopped.moving, false);
  assert.equal(walkFrame(stopped), 0);
  const restarted = moveIso(world, stopped, 1, 0, 1 / 60);
  assert.equal(walkFrame(restarted), 1);
});
test("iso: 30/60/120fps에서도 보행 거리와 박자가 같다", () => {
  const results = [30, 60, 120].map((fps) => {
    let p = start();
    const world = open();
    for (let i = 0; i < fps; i++) p = moveIso(world, p, 1, 0, 1 / fps);
    return p;
  });
  for (const p of results) {
    assert.ok(Math.abs(p.x - results[0].x) < 1e-6);
    assert.ok(Math.abs(p.walk! - results[0].walk!) < 1e-6);
  }
});
test("iso: 약한 조이스틱 입력은 천천히 걷고 방향 경계에서는 떨지 않는다", () => {
  const p = screenTravel(0.3, 0, 1).p;
  assert.ok(
    p.screenVelocity!.x < ISO_SCREEN_SPEED * 0.31 &&
      p.screenVelocity!.x > ISO_SCREEN_SPEED * 0.29,
  );
  assert.equal(stableScreenDir8(1, Math.tan((24 * Math.PI) / 180), 6), 6);
  assert.equal(stableScreenDir8(1, Math.tan((31 * Math.PI) / 180), 6), 7);
  assert.equal(stableScreenDir8(1, Math.tan((24 * Math.PI) / 180), 7), 7);
});
test("iso: 새 시트는 네 보행 포즈를 앞으로 재생하고 예전 시트도 호환된다", () => {
  const phases = [0.1, 0.4, 0.6, 0.9].map((n) => ({
    ...start(),
    moving: true,
    walk: WALK_CYCLE_PX * n,
  }));
  assert.deepEqual(
    phases.map((p) => walkFrame(p)),
    [1, 2, 3, 4],
  );
  assert.deepEqual(
    phases.map((p) => walkFrame(p, 4)),
    [1, 2, 3, 2],
  );
});

test("탑뷰 이동은 그대로(격자 정규화 4.2셀/초, 4방향)", () => {
  const w = open();
  let p = start();
  for (let i = 0; i < 30; i++) p = moveTopDown(w, p, 1, 0, 1 / 30);
  assert.ok(Math.abs(p.x - 30.5 - 4.2) < 1e-6 && p.dir === 3);
  assert.ok(Math.abs(p.walk! - 4.2 * 64) < 1e-6);
  assert.equal(walkFrame(moveTopDown(w, p, 0, 0, 1 / 30)), 0);
});

test("Top-down facing follows actual sliding movement and clears the previous isometric heading", () => {
  const world = new PlayWorld(applyOps(createMap("m", "slide", 20, 20), [{ op: "line", assetId: "wall.stone", x1: 5, y1: 0, x2: 5, y2: 19 }]).doc);
  const p: PlayerState = { x: 4.69, y: 10.5, dir: 3, face8: 6, moving: true };
  const next = moveTopDown(world, p, 1, -0.25, 1 / 30);
  assert.equal(next.x, p.x);
  assert.ok(next.y < p.y);
  assert.equal(next.dir, 2, "Sliding north must face north, even when the input points mostly east");
  assert.equal(next.face8, undefined, "A previous isometric direction cannot override the new top-down facing");
});
