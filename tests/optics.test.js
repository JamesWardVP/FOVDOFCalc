'use strict';

// Run from the repo root with:  node --test
const test = require('node:test');
const assert = require('node:assert/strict');
const O = require('../optics.js');

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} expected ${b}, got ${a}`);

test('DOF matches published reference values', () => {
  // 50 mm, f/2.8, CoC 0.03 mm, focus 3 m → H 29.81 m, near 2.729 m, far 3.330 m (DOFMaster).
  const r = O.dof(0.050, 2.8, 0.00003, 3);
  close(r.H, 29.8119, 1e-3, 'H');
  close(r.near, 2.7294, 1e-3, 'near');
  close(r.far, 3.3301, 1e-3, 'far');

  // 35 mm, f/8, CoC 0.025 mm, focus 5 m → H 6.160 m, near 2.7615 m, far 26.40 m
  // (near/far = s·f² / (f² ± N·c·(s − f)), computed by hand).
  const q = O.dof(0.035, 8, 0.000025, 5);
  close(q.H, 6.160, 1e-3, 'H');
  close(q.near, 2.7615, 1e-3, 'near');
  close(q.far, 26.40, 0.01, 'far');
});

test('far limit is infinite at/after the hyperfocal distance, near = H/2 there', () => {
  const f = 0.035, N = 4, c = 0.00002;
  const { H } = O.dof(f, N, c, 1);
  const r = O.dof(f, N, c, H);
  assert.equal(r.far, Infinity);
  close(r.near, H / 2, 1e-9);
  assert.equal(O.dof(f, N, c, H * 2).far, Infinity);
});

test('blur disc equals the CoC exactly at the near and far limits', () => {
  for (const [f, N, c, s] of [[0.035, 2.8, 0.0000226, 3], [0.085, 1.4, 0.00003, 2], [0.018, 11, 0.00002, 1.2]]) {
    const r = O.dof(f, N, c, s);
    close(O.blurDiameter(f, N, s, r.near), c, 1e-12, 'near');
    if (isFinite(r.far)) close(O.blurDiameter(f, N, s, r.far), c, 1e-12, 'far');
    assert.equal(O.blurDiameter(f, N, s, s), 0);
  }
});

test('blur formula matches the thin-lens construction', () => {
  // Image the point with 1/f = 1/d + 1/v and intersect the light cone with the sensor.
  const f = 0.05, N = 2, s = 3, d = 7;
  const A = f / N;
  const vs = 1 / (1 / f - 1 / s), vd = 1 / (1 / f - 1 / d);
  close(O.blurDiameter(f, N, s, d), (A * Math.abs(vd - vs)) / vd, 1e-15);
  close(O.imageDistance(f, s), vs, 1e-15);
});

test('inverse helpers put the far limit exactly on the requested distance', () => {
  const f = 0.035, c = 0.0000226, s = 3, D = 6.6;
  const N = O.stopForFarLimit(f, c, s, D);
  close(O.dof(f, N, c, s).far, D, 1e-9, 'stopForFarLimit');
  const sMax = O.maxFocusForFarLimit(f, 2.8, c, D);
  close(O.dof(f, 2.8, c, sMax).far, D, 1e-9, 'maxFocusForFarLimit');
});

test('Bessel J1 matches tabulated values', () => {
  const table = [[0, 0], [0.5, 0.2422684577], [1, 0.4400505857], [2.5, 0.4970941025],
    [3.8317059702, 0], [7, -0.0046828235], [10, 0.0434727462], [20, 0.0668331242], [-1, -0.4400505857]];
  for (const [x, y] of table) close(O.besselJ1(x), y, 2e-7, `J1(${x})`);
});

test('defocus contrast: 1 when sharp, 0 at the first zero, < 10% beyond the safe blur ratio', () => {
  close(O.defocusContrast(0, 0.01), 1, 1e-12);
  close(O.defocusContrast(3.8317059702 / Math.PI, 1), 0, 1e-7);
  for (let r = O.SAFE_BLUR_RATIO; r < 60; r += 0.01) {
    assert.ok(O.defocusContrast(r, 1) < 0.1, `contrast at blur/pitch ${r.toFixed(2)}`);
  }
});

test('moiré levels', () => {
  const photosite = 0.006;
  assert.equal(O.moireLevel(0.008, photosite, 0).level, 3);      // sharp, 1.3 photosites/pitch
  assert.equal(O.moireLevel(0.008, photosite, 0.08).level, 0);   // blurred 10× the pitch
  assert.equal(O.moireLevel(0.050, photosite, 0).level, 1);      // 8 photosites/pitch: resolved, not aliased
  const mid = O.moireLevel(0.008, photosite, 0.008 * 0.95);     // contrast between 10% and 30%
  assert.ok(mid.contrast >= 0.1 && mid.contrast < 0.3, `contrast ${mid.contrast}`);
  assert.equal(mid.level, 2);
});

test('curved wall keeps its width as arc length and has consistent normals', () => {
  for (const curve of [0, 30, 90, 180, 300, -45, -90]) {
    const shape = O.wallShape(10, curve);
    let len = 0, prev = O.wallPlan(shape, 0);
    for (let i = 1; i <= 2000; i++) {
      const p = O.wallPlan(shape, i / 2000);
      len += Math.hypot(p.x - prev.x, p.z - prev.z);
      prev = p;
    }
    close(len, 10, 1e-4, `arc length (${curve}°)`);
    for (const u of [0, 0.2, 0.5, 0.9, 1]) {
      const p = O.wallPlan(shape, u);
      close(Math.hypot(p.nx, p.nz), 1, 1e-12);
      close(p.nx * p.tx + p.nz * p.tz, 0, 1e-12, 'normal ⟂ tangent');
      close(O.wallU(shape, p.x, p.z), u, 1e-9, 'wallU round-trip');
      close(O.frontClearance(shape, p.x, p.z), 0, 1e-9, 'point lies on the surface');
    }
    const c = O.wallPlan(shape, 0.5);
    close(c.x, 0, 1e-12); close(c.z, 0, 1e-12); close(c.nz, 1, 1e-12);
  }
  // Concave ends come toward the stage; convex ends fall away.
  assert.ok(O.wallPlan(O.wallShape(10, 90), 0).z > 0);
  assert.ok(O.wallPlan(O.wallShape(10, -90), 0).z < 0);
  close(O.wallShape(10, 180).R, 10 / Math.PI, 1e-12, 'radius = W / θ');
});

test('ray/wall intersection', () => {
  const flat = O.wallShape(10, 0);
  let h = O.rayWall(flat, 0, 5, 0, -1);
  close(h.t, 5, 1e-12); close(h.u, 0.5, 1e-12); assert.ok(h.onWall);
  h = O.rayWall(flat, 0, 5, Math.sin(1.2), -Math.cos(1.2)); // misses the 10 m wall
  assert.ok(h && !h.onWall);
  assert.equal(O.rayWall(flat, 0, 5, 0, 1), null);           // facing away

  // From the centre of a concave arc every ray inside the arc travels exactly R.
  const cc = O.wallShape(10, 120);
  for (const a of [-0.9, -0.3, 0, 0.5, 1.0]) { // angles from straight at the wall
    const r = O.rayWall(cc, 0, cc.R, Math.sin(a), -Math.cos(a));
    close(r.t, cc.R, 1e-9); assert.ok(r.onWall);
  }
  // Convex: hits the front at the centre, and the back side is never reported.
  const cv = O.wallShape(10, -90);
  h = O.rayWall(cv, 0, 5, 0, -1);
  close(h.t, 5, 1e-9); assert.ok(h.onWall);
});

test('keepInFront moves points onto the stage side', () => {
  for (const curve of [0, 60, 200, -60]) {
    const shape = O.wallShape(8, curve);
    for (const [x, z] of [[0, -3], [6, -1], [0, 0], [3, 20], [-2, 0.1]]) {
      const p = O.keepInFront(shape, x, z, 0.3);
      assert.ok(O.frontClearance(shape, p.x, p.z) >= 0.3 - 1e-9 || (shape.R > 0 && shape.R < 0.3));
    }
  }
});
