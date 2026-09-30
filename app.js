'use strict';

/*
 * LED Wall Focus Planner
 *
 * World coordinates (metres):
 *   x — across the stage (left/right), wall centred on x = 0
 *   y — height above the floor
 *   z — distance in front of the wall; the wall face sits in the plane z = 0
 */

/* ------------------------------------------------------------------ */
/* Data                                                                */
/* ------------------------------------------------------------------ */

// Sensor dimensions (mm) for a typical recording mode of each camera.
const CAMERAS = [
  { id: 'alexa35', name: 'ARRI ALEXA 35 (4.6K Open Gate)', w: 27.99, h: 19.22 },
  { id: 'alexaminilf', name: 'ARRI ALEXA Mini LF (Open Gate)', w: 36.70, h: 25.54 },
  { id: 'alexamini', name: 'ARRI ALEXA Mini (3.4K Open Gate)', w: 28.25, h: 18.17 },
  { id: 'alexa65', name: 'ARRI ALEXA 65 (Open Gate)', w: 54.12, h: 25.58 },
  { id: 'vraptor', name: 'RED V-RAPTOR 8K VV', w: 40.96, h: 21.60 },
  { id: 'komodo', name: 'RED KOMODO 6K S35', w: 27.03, h: 14.26 },
  { id: 'venice2', name: 'Sony VENICE 2 8.6K (3:2)', w: 36.20, h: 24.10 },
  { id: 'fx6', name: 'Sony FX6 / FX3 (Full Frame)', w: 35.60, h: 23.80 },
  { id: 'ursa12k', name: 'Blackmagic URSA Mini Pro 12K', w: 27.03, h: 14.25 },
  { id: 'pocket6k', name: 'Blackmagic Pocket 6K', w: 23.10, h: 12.99 },
  { id: 'pocket4k', name: 'Blackmagic Pocket 4K (MFT)', w: 18.96, h: 10.00 },
  { id: 'c70', name: 'Canon C70 / C300 Mk III (S35)', w: 26.20, h: 13.80 },
  { id: 'ff', name: 'Generic Full Frame (36 × 24)', w: 36.00, h: 24.00 },
  { id: 's35', name: 'Generic Super 35 (4-perf)', w: 24.89, h: 18.66 },
  { id: 'mft', name: 'Generic Micro Four Thirds', w: 17.30, h: 13.00 },
  { id: 'custom', name: 'Custom sensor…', w: 36.00, h: 24.00 },
];

// Third-stop aperture scale.
const FSTOPS = [1, 1.1, 1.2, 1.4, 1.6, 1.8, 2, 2.2, 2.5, 2.8, 3.2, 3.5, 4, 4.5, 5, 5.6,
  6.3, 7.1, 8, 9, 10, 11, 13, 14, 16, 18, 20, 22];

const DEFAULTS = {
  wallW: 10, wallH: 4, wallBottom: 0,
  camX: 0, camZ: 7, camY: 1.5,
  subX: 0.5, subZ: 4, subH: 1.8, aimH: 1.6,
  body: 'alexa35', customW: 36, customH: 24,
  focal: 35, fstopIdx: FSTOPS.indexOf(2.8),
  focusAuto: true, focus: 3,
  cocAuto: true, coc: 0.025,
  stageDepth: 12,
};

const SLIDERS = {
  'ctl-wall': [
    { key: 'wallW', label: 'Width', min: 1, max: 30, step: 0.1, unit: 'm' },
    { key: 'wallH', label: 'Height', min: 0.5, max: 12, step: 0.1, unit: 'm' },
    { key: 'wallBottom', label: 'Bottom edge above floor', min: 0, max: 3, step: 0.05, unit: 'm' },
  ],
  'ctl-camera': [
    { key: 'camX', label: 'Position across stage (X)', min: -10, max: 10, step: 0.05, unit: 'm', dyn: 'x' },
    { key: 'camZ', label: 'Distance from wall (Z)', min: 0.3, max: 12, step: 0.05, unit: 'm', dyn: 'z' },
    { key: 'camY', label: 'Lens height', min: 0.1, max: 6, step: 0.05, unit: 'm' },
  ],
  'ctl-lens': [
    { key: 'focal', label: 'Focal length', min: 8, max: 300, step: 1, unit: 'mm', log: true },
    { key: 'fstopIdx', label: 'Aperture', min: 0, max: FSTOPS.length - 1, step: 1, format: i => 'f/' + FSTOPS[i] },
    { key: 'focus', label: 'Focus distance', min: 0.3, max: 60, step: 0.01, unit: 'm', log: true },
  ],
  'ctl-subject': [
    { key: 'subX', label: 'Position across stage (X)', min: -10, max: 10, step: 0.05, unit: 'm', dyn: 'x' },
    { key: 'subZ', label: 'Distance from wall (Z)', min: 0.2, max: 12, step: 0.05, unit: 'm', dyn: 'z' },
    { key: 'subH', label: 'Subject height', min: 0.5, max: 2.2, step: 0.01, unit: 'm' },
    { key: 'aimH', label: 'Aim point height', min: 0, max: 3, step: 0.01, unit: 'm' },
  ],
  'ctl-view': [
    { key: 'stageDepth', label: 'Stage depth shown', min: 4, max: 40, step: 0.5, unit: 'm' },
  ],
};

let state = { ...DEFAULTS };

/* ------------------------------------------------------------------ */
/* Vector helpers                                                      */
/* ------------------------------------------------------------------ */

const v3 = (x, y, z) => ({ x, y, z });
const vsub = (a, b) => v3(a.x - b.x, a.y - b.y, a.z - b.z);
const vadd = (a, b) => v3(a.x + b.x, a.y + b.y, a.z + b.z);
const vmul = (a, k) => v3(a.x * k, a.y * k, a.z * k);
const vdot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const vcross = (a, b) => v3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
const vlen = a => Math.hypot(a.x, a.y, a.z);
const vnorm = a => { const l = vlen(a); return l > 0 ? vmul(a, 1 / l) : a; };
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/* ------------------------------------------------------------------ */
/* Scene model                                                         */
/* ------------------------------------------------------------------ */

// Half-width of the stage shown in the top view (also the X limit for camera/subject).
const stageHalfWidth = () => Math.max(state.wallW / 2 + 2, 4);

// A point on the wall face. u runs left→right (0..1), v bottom→top (0..1).
// Curvature (future) only needs to change this function.
function wallPoint(u, v) {
  return v3(-state.wallW / 2 + u * state.wallW, state.wallBottom + v * state.wallH, 0);
}

function sensor() {
  if (state.body === 'custom') return { w: state.customW, h: state.customH };
  return CAMERAS.find(c => c.id === state.body) || CAMERAS[0];
}

// Camera position and orthonormal basis, aimed at the subject's aim point.
function cameraBasis() {
  const cam = v3(state.camX, state.camY, state.camZ);
  const aim = v3(state.subX, state.aimH, state.subZ);
  let F = vsub(aim, cam);
  if (vlen(F) < 1e-6) F = v3(0, 0, -1);
  F = vnorm(F);
  let R = vcross(F, v3(0, 1, 0));
  if (vlen(R) < 1e-6) R = v3(1, 0, 0);
  R = vnorm(R);
  const U = vcross(R, F);
  const horiz = Math.hypot(F.x, F.z);
  const tilt = Math.atan2(F.y, horiz);
  const heading = horiz > 1e-6 ? { x: F.x / horiz, z: F.z / horiz } : { x: 0, z: -1 };
  return { cam, aim, F, R, U, tilt, heading, subjectDist: vlen(vsub(aim, cam)) };
}

function compute() {
  const cb = cameraBasis();
  const sen = sensor();
  const fmm = state.focal;
  const f = fmm / 1000;
  const cocMm = state.cocAuto ? Math.hypot(sen.w, sen.h) / 1500 : state.coc;
  const c = cocMm / 1000;
  const N = FSTOPS[state.fstopIdx];

  if (state.focusAuto) state.focus = cb.subjectDist;
  const s = Math.max(state.focus, f * 1.5);

  // Thin-lens depth of field, all in metres.
  const H = (f * f) / (N * c) + f;
  const near = (s * (H - f)) / (H + s - 2 * f);
  const far = s < H ? (s * (H - f)) / (H - s) : Infinity;

  const hfov = 2 * Math.atan(sen.w / (2 * fmm));
  const vfov = 2 * Math.atan(sen.h / (2 * fmm));

  const o = {
    cb, sen, fmm, f, cocMm, c, N, s, H, near, far, hfov, vfov,
    th: Math.tan(hfov / 2), tv: Math.tan(vfov / 2),
  };
  o.wall = analyseWall(o);
  o.section = sightSection(cb);
  return o;
}

// Classify a world point relative to the camera: in frame? inside the DOF?
function evalPoint(p, o) {
  const { cam, F, R, U } = o.cb;
  const d = vsub(p, cam);
  const depth = vdot(d, F);
  if (depth <= 1e-6) return { visible: false, inDof: false, inFocus: false, depth };
  const x = vdot(d, R) / depth;
  const y = vdot(d, U) / depth;
  const visible = Math.abs(x) <= o.th + 1e-9 && Math.abs(y) <= o.tv + 1e-9;
  const inDof = depth >= o.near && depth <= o.far;
  return { visible, inDof, inFocus: visible && inDof, depth };
}

const WALL_NU = 161;
const WALL_NV = 61;

function analyseWall(o) {
  const cols = [];
  let visible = 0, inFocus = 0, minDepth = Infinity, maxDepth = -Infinity;
  for (let i = 0; i < WALL_NU; i++) {
    const u = i / (WALL_NU - 1);
    const col = { u, visible: false, inFocus: false };
    for (let j = 0; j < WALL_NV; j++) {
      const e = evalPoint(wallPoint(u, j / (WALL_NV - 1)), o);
      if (!e.visible) continue;
      visible++;
      col.visible = true;
      minDepth = Math.min(minDepth, e.depth);
      maxDepth = Math.max(maxDepth, e.depth);
      if (e.inFocus) { inFocus++; col.inFocus = true; }
    }
    cols.push(col);
  }
  return {
    cols, visible, inFocus, minDepth, maxDepth,
    fraction: visible ? inFocus / visible : 0,
  };
}

// Where the vertical plane through the line of sight meets the wall plane.
function sightSection(cb) {
  const h = cb.heading;
  if (h.z >= -1e-6) return null;
  const t = -state.camZ / h.z; // horizontal distance from camera to wall plane
  const x = state.camX + t * h.x;
  const u = (x + state.wallW / 2) / state.wallW;
  return { t, x, u, onWall: u >= 0 && u <= 1 };
}

/* ------------------------------------------------------------------ */
/* Formatting                                                          */
/* ------------------------------------------------------------------ */

function fmtM(d) {
  if (!isFinite(d)) return '∞';
  if (d >= 1000) return '> 1 km';
  if (d >= 100) return d.toFixed(0) + ' m';
  if (d >= 10) return d.toFixed(1) + ' m';
  return d.toFixed(2) + ' m';
}
const fmtDeg = r => (r * 180 / Math.PI).toFixed(1) + '°';
const fmtStop = n => 'f/' + (n >= 10 ? n.toFixed(0) : n.toFixed(1)).replace(/\.0$/, '');

/* ------------------------------------------------------------------ */
/* Canvas helpers                                                      */
/* ------------------------------------------------------------------ */

let colors = {};
function readColors() {
  const cs = getComputedStyle(document.documentElement);
  const names = ['canvas-bg', 'grid', 'floor', 'text', 'muted', 'wall', 'wall-lit', 'frustum',
    'frustum-line', 'dof', 'focus', 'near', 'far', 'hyper', 'cam', 'subject', 'hazard-a', 'hazard-b'];
  colors = {};
  for (const n of names) colors[n] = cs.getPropertyValue('--' + n).trim();
}

const hazardCache = new WeakMap();
function hazard(ctx) {
  if (hazardCache.has(ctx)) return hazardCache.get(ctx);
  const S = 12;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = colors['hazard-b'] || '#111';
  g.fillRect(0, 0, S, S);
  g.strokeStyle = colors['hazard-a'] || '#f5c400';
  g.lineWidth = 4.2;
  for (let off = -S; off <= S; off += S) {
    g.beginPath();
    g.moveTo(off, S);
    g.lineTo(off + S, 0);
    g.stroke();
  }
  const p = ctx.createPattern(c, 'repeat');
  hazardCache.set(ctx, p);
  return p;
}

function prepCanvas(cv) {
  const r = cv.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const w = Math.max(1, Math.round(r.width * dpr));
  const h = Math.max(1, Math.round(r.height * dpr));
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = colors['canvas-bg'];
  ctx.fillRect(0, 0, r.width, r.height);
  return { ctx, w: r.width, h: r.height };
}

// Uniform-scale fit of a world rectangle into the canvas.
// flipY: world "b" grows upward (side view); otherwise downward (top view, z toward camera).
function makeView(w, h, amin, amax, bmin, bmax, flipY, pad = 22) {
  const k = Math.min((w - 2 * pad) / (amax - amin), (h - 2 * pad) / (bmax - bmin));
  const ox = (w - k * (amax - amin)) / 2;
  const oy = (h - k * (bmax - bmin)) / 2;
  return {
    k, amin, amax, bmin, bmax,
    X: a => ox + (a - amin) * k,
    Y: b => flipY ? oy + (bmax - b) * k : oy + (b - bmin) * k,
    A: sx => amin + (sx - ox) / k,
    B: sy => flipY ? bmax - (sy - oy) / k : bmin + (sy - oy) / k,
  };
}

function poly(ctx, pts) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
}

function line(ctx, x1, y1, x2, y2) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function drawGrid(ctx, V, w, h) {
  const step = V.k < 14 ? 5 : V.k < 30 ? 2 : 1;
  ctx.strokeStyle = colors.grid;
  ctx.lineWidth = 1;
  for (let a = Math.ceil(V.A(0) / step) * step; V.X(a) < w; a += step) line(ctx, V.X(a), 0, V.X(a), h);
  const b0 = Math.min(V.B(0), V.B(h)), b1 = Math.max(V.B(0), V.B(h));
  for (let b = Math.ceil(b0 / step) * step; b <= b1; b += step) line(ctx, 0, V.Y(b), w, V.Y(b));
  // Scale bar
  ctx.strokeStyle = colors.muted;
  ctx.fillStyle = colors.muted;
  ctx.lineWidth = 2;
  const x0 = 12, y0 = h - 12, len = V.k * step;
  line(ctx, x0, y0, x0 + len, y0);
  line(ctx, x0, y0 - 4, x0, y0 + 0);
  line(ctx, x0 + len, y0 - 4, x0 + len, y0 + 0);
  ctx.font = '11px system-ui, sans-serif';
  ctx.textBaseline = 'bottom';
  ctx.textAlign = 'left';
  ctx.fillText(step + ' m', x0 + len + 6, y0 + 4);
}

function label(ctx, text, x, y, color, align = 'left') {
  ctx.font = '600 11px system-ui, sans-serif';
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 3;
  ctx.strokeStyle = colors['canvas-bg'];
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

function marker(ctx, x, y, kind) {
  ctx.lineWidth = 2;
  if (kind === 'near') {
    ctx.fillStyle = colors.near;
    ctx.beginPath(); ctx.arc(x, y, 4.5, 0, Math.PI * 2); ctx.fill();
  } else if (kind === 'far') {
    ctx.fillStyle = colors.far;
    ctx.strokeStyle = colors.far;
    ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.stroke();
  } else if (kind === 'hyper') {
    ctx.fillStyle = colors.hyper;
    poly(ctx, [[x, y - 6], [x + 6, y], [x, y + 6], [x - 6, y]]);
    ctx.fill();
  } else if (kind === 'focus') {
    ctx.strokeStyle = colors.focus;
    ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.stroke();
    line(ctx, x - 8, y, x + 8, y);
    line(ctx, x, y - 8, x, y + 8);
  }
}

// Camera glyph at screen (x, y) pointing along screen angle `ang`.
function drawCamera(ctx, x, y, ang, active) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.fillStyle = colors.cam;
  ctx.strokeStyle = colors['canvas-bg'];
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(-16, -8, 20, 16, 3);
  ctx.fill(); ctx.stroke();
  poly(ctx, [[4, -4], [13, -8], [13, 8], [4, 4]]);
  ctx.fill(); ctx.stroke();
  ctx.restore();
  if (active) {
    ctx.strokeStyle = colors.focus;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x, y, 20, 0, Math.PI * 2); ctx.stroke();
  }
}

/* ------------------------------------------------------------------ */
/* Top view                                                            */
/* ------------------------------------------------------------------ */

const topCanvas = document.getElementById('top');
const sideCanvas = document.getElementById('side');
let topView = null, sideView = null;
let hover = { top: null, side: null };
let drag = null;

function drawTop(o) {
  const { ctx, w, h } = prepCanvas(topCanvas);
  const half = stageHalfWidth();
  const V = makeView(w, h, -half, half, -1, state.stageDepth, false);
  topView = V;
  drawGrid(ctx, V, w, h);

  const { cam, F, R, heading } = o.cb;
  const P = p => [V.X(p.x), V.Y(p.z)];
  const at = (d, side) => vadd(cam, vmul(vadd(F, vmul(R, side * o.th)), d)); // point at axial depth d on a FOV edge
  const FAR = 400;

  // Region in front of the wall (z >= 0) – everything the camera can "see".
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, V.Y(0), w, h);
  ctx.clip();

  // Field of view
  poly(ctx, [P(cam), P(at(FAR, -1)), P(at(FAR, 1))]);
  ctx.fillStyle = colors.frustum;
  ctx.fill();
  ctx.strokeStyle = colors['frustum-line'];
  ctx.lineWidth = 1.5;
  line(ctx, ...P(cam), ...P(at(FAR, -1)));
  line(ctx, ...P(cam), ...P(at(FAR, 1)));

  // Depth of field band
  const farD = isFinite(o.far) ? o.far : FAR;
  poly(ctx, [P(at(o.near, -1)), P(at(o.near, 1)), P(at(farD, 1)), P(at(farD, -1))]);
  ctx.fillStyle = colors.dof;
  ctx.fill();
  ctx.strokeStyle = colors.near;
  ctx.lineWidth = 1.5;
  line(ctx, ...P(at(o.near, -1)), ...P(at(o.near, 1)));
  if (isFinite(o.far)) line(ctx, ...P(at(o.far, -1)), ...P(at(o.far, 1)));

  // Focus plane
  ctx.strokeStyle = colors.focus;
  ctx.lineWidth = 2.5;
  line(ctx, ...P(at(o.s, -1)), ...P(at(o.s, 1)));

  // Optical axis
  ctx.setLineDash([5, 5]);
  ctx.strokeStyle = colors.muted;
  ctx.lineWidth = 1;
  line(ctx, ...P(cam), ...P(vadd(cam, vmul(F, FAR))));
  ctx.setLineDash([]);
  ctx.restore();

  // Wall (drawn as a slab behind the face at z = 0)
  const thick = Math.max(0.25, 7 / V.k);
  const segW = state.wallW / (WALL_NU - 1);
  for (const col of o.wall.cols) {
    const x = -state.wallW / 2 + col.u * state.wallW;
    const x0 = V.X(Math.max(-state.wallW / 2, x - segW / 2));
    const x1 = V.X(Math.min(state.wallW / 2, x + segW / 2));
    ctx.fillStyle = col.inFocus ? hazard(ctx) : col.visible ? colors['wall-lit'] : colors.wall;
    ctx.fillRect(x0, V.Y(-thick), x1 - x0 + 0.5, V.Y(0) - V.Y(-thick));
  }
  ctx.strokeStyle = colors.text;
  ctx.lineWidth = 1;
  ctx.strokeRect(V.X(-state.wallW / 2), V.Y(-thick), state.wallW * V.k, thick * V.k);
  label(ctx, `LED wall ${state.wallW.toFixed(1)} m × ${state.wallH.toFixed(1)} m`, V.X(0), V.Y(-thick) - 9, colors.muted, 'center');

  // Axis markers (projected onto the floor plan)
  const perp = { x: -heading.z, z: heading.x };
  const axisPt = d => P(vadd(cam, vmul(F, d)));
  const tag = (d, kind, text, sideSign) => {
    const [x, y] = axisPt(d);
    // Points behind the wall face are not drawn here (see the side view / readouts).
    if (vadd(cam, vmul(F, d)).z < 0 || x < -20 || x > w + 20 || y < -20 || y > h + 20) return;
    marker(ctx, x, y, kind);
    const lx = x + perp.x * 16 * sideSign, ly = y + perp.z * 16 * sideSign;
    label(ctx, text, lx, ly, colors[kind], perp.x * sideSign >= 0 ? 'left' : 'right');
  };
  tag(o.H, 'hyper', 'Hyperfocal ' + fmtM(o.H), 1);
  if (isFinite(o.far)) tag(o.far, 'far', 'Far ' + fmtM(o.far), -1);
  tag(o.near, 'near', 'Near ' + fmtM(o.near), 1);

  // Focus-plane label at the edge of frame
  const [fx, fy] = P(at(o.s, 1));
  if (fy > V.Y(0)) label(ctx, 'Focus ' + fmtM(o.s), fx + 6, fy, colors.focus);

  // Subject (top-down person: shoulders + head, facing the camera)
  const sx = V.X(state.subX), sy = V.Y(state.subZ);
  const toCam = Math.atan2(cam.z - state.subZ, cam.x - state.subX);
  const pk = Math.max(V.k, 30);
  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(toCam);
  ctx.fillStyle = colors.subject;
  ctx.beginPath();
  ctx.ellipse(0, 0, 0.12 * pk, 0.25 * pk, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = colors['canvas-bg'];
  ctx.beginPath(); ctx.arc(0, 0, 0.1 * pk + 1.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = colors.subject;
  ctx.beginPath(); ctx.arc(0, 0, 0.1 * pk, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = colors['canvas-bg'];
  ctx.beginPath(); ctx.arc(0.07 * pk, 0, 0.025 * pk, 0, Math.PI * 2); ctx.fill(); // nose
  ctx.restore();
  if (hover.top === 'subject' || drag?.target === 'subject') {
    ctx.strokeStyle = colors.focus;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(sx, sy, 0.28 * pk + 4, 0, Math.PI * 2); ctx.stroke();
  }

  // Camera
  const [cx, cy] = P(cam);
  drawCamera(ctx, cx, cy, Math.atan2(heading.z, heading.x), hover.top === 'camera' || drag?.target === 'camera');
  label(ctx, 'Camera', cx, cy + 26, colors.cam, 'center');
}

/* ------------------------------------------------------------------ */
/* Side view — vertical section along the line of sight               */
/* ------------------------------------------------------------------ */

function drawSide(o) {
  const { ctx, w, h } = prepCanvas(sideCanvas);
  const { tilt } = o.cb;
  const sec = o.section;
  const subDist = Math.hypot(state.subX - state.camX, state.subZ - state.camZ);
  const wallTop = state.wallBottom + state.wallH;

  const sMax = (sec ? Math.min(sec.t, 80) : Math.max(subDist * 1.5, 6)) + 1.2;
  const yMax = Math.max(wallTop, state.camY, state.subH, state.aimH) + 0.8;
  const V = makeView(w, h, -1.2, sMax, -0.4, yMax, true);
  sideView = V;
  drawGrid(ctx, V, w, h);

  // Floor
  ctx.fillStyle = colors.floor;
  ctx.fillRect(0, V.Y(0), w, h - V.Y(0));
  ctx.strokeStyle = colors.muted;
  ctx.lineWidth = 1;
  line(ctx, 0, V.Y(0), w, V.Y(0));

  const ct = Math.cos(tilt), st = Math.sin(tilt);
  const P = (s, y) => [V.X(s), V.Y(y)];
  // Point at axial depth d along the vertical FOV edge `side` (−1 bottom, +1 top), in section coords.
  const at = (d, side) => {
    const a = side * o.tv;
    return P((ct - a * st) * d, state.camY + (st + a * ct) * d);
  };
  const FAR = 400;

  ctx.save();
  ctx.beginPath();
  const clipS = sec ? V.X(sec.t) : w;
  ctx.rect(0, 0, clipS, V.Y(0));
  ctx.clip();

  poly(ctx, [P(0, state.camY), at(FAR, -1), at(FAR, 1)]);
  ctx.fillStyle = colors.frustum;
  ctx.fill();
  ctx.strokeStyle = colors['frustum-line'];
  ctx.lineWidth = 1.5;
  line(ctx, ...P(0, state.camY), ...at(FAR, -1));
  line(ctx, ...P(0, state.camY), ...at(FAR, 1));

  const farD = isFinite(o.far) ? o.far : FAR;
  poly(ctx, [at(o.near, -1), at(o.near, 1), at(farD, 1), at(farD, -1)]);
  ctx.fillStyle = colors.dof;
  ctx.fill();
  ctx.strokeStyle = colors.near;
  line(ctx, ...at(o.near, -1), ...at(o.near, 1));
  if (isFinite(o.far)) line(ctx, ...at(o.far, -1), ...at(o.far, 1));

  ctx.strokeStyle = colors.focus;
  ctx.lineWidth = 2.5;
  line(ctx, ...at(o.s, -1), ...at(o.s, 1));

  ctx.setLineDash([5, 5]);
  ctx.strokeStyle = colors.muted;
  ctx.lineWidth = 1;
  line(ctx, ...P(0, state.camY), ...P(ct * FAR, state.camY + st * FAR));
  ctx.setLineDash([]);
  ctx.restore();

  // Wall section
  if (sec) {
    const thick = Math.max(0.25, 7 / V.k);
    const x0 = V.X(sec.t), x1 = V.X(sec.t + thick);
    if (sec.onWall) {
      const n = WALL_NV;
      const segH = state.wallH / (n - 1);
      for (let j = 0; j < n; j++) {
        const v = j / (n - 1);
        const y = state.wallBottom + v * state.wallH;
        const e = evalPoint(v3(sec.x, y, 0), o);
        const y0 = V.Y(Math.min(wallTop, y + segH / 2));
        const y1 = V.Y(Math.max(state.wallBottom, y - segH / 2));
        ctx.fillStyle = e.inFocus ? hazard(ctx) : e.visible ? colors['wall-lit'] : colors.wall;
        ctx.fillRect(x0, y0, x1 - x0, y1 - y0 + 0.5);
      }
      ctx.strokeStyle = colors.text;
      ctx.lineWidth = 1;
      ctx.strokeRect(x0, V.Y(wallTop), x1 - x0, state.wallH * V.k);
      label(ctx, 'LED wall', x0 - 6, V.Y(wallTop) - 10, colors.muted, 'right');
    } else {
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = colors.muted;
      ctx.strokeRect(x0, V.Y(wallTop), x1 - x0, state.wallH * V.k);
      ctx.setLineDash([]);
      label(ctx, 'Line of sight misses the wall', x0 - 6, V.Y(wallTop) - 10, colors.muted, 'right');
    }
  } else {
    label(ctx, 'Camera is facing away from the wall', w - 12, 16, colors.muted, 'right');
  }

  // Axis markers
  const axisPt = d => P(ct * d, state.camY + st * d);
  const tag = (d, kind, text, dy) => {
    const [x, y] = axisPt(d);
    if (x < -20 || x > w + 20 || y < -20 || y > h + 20) return;
    ctx.globalAlpha = sec && ct * d > sec.t ? 0.45 : 1;
    marker(ctx, x, y, kind);
    label(ctx, text, x, y + dy, colors[kind], 'center');
    ctx.globalAlpha = 1;
  };
  tag(o.H, 'hyper', 'Hyperfocal', -14);
  if (isFinite(o.far)) tag(o.far, 'far', 'Far', 16);
  tag(o.near, 'near', 'Near', 16);
  const [fx, fy] = at(o.s, 1);
  label(ctx, 'Focus', fx, fy - 10, colors.focus, 'center');

  // Subject silhouette (side-on), facing the camera
  const sh = state.subH;
  const headR = 0.11 * sh / 1.8;
  const sx = V.X(subDist);
  ctx.fillStyle = colors.subject;
  ctx.beginPath();
  ctx.arc(sx, V.Y(sh - headR), headR * V.k, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.roundRect(sx - 0.13 * V.k, V.Y(sh - 2 * headR - 0.04), 0.26 * V.k, (sh - 2 * headR - 0.04) * V.k, 0.08 * V.k);
  ctx.fill();

  // Aim point
  const ax = V.X(subDist), ay = V.Y(state.aimH);
  const aimActive = hover.side === 'aim' || drag?.target === 'aim';
  ctx.strokeStyle = aimActive ? colors.focus : colors.text;
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(ax, ay, 6, 0, Math.PI * 2); ctx.stroke();
  line(ctx, ax - 10, ay, ax - 3, ay);
  line(ctx, ax + 3, ay, ax + 10, ay);
  label(ctx, 'Aim', ax + 12, ay, colors.text);

  // Camera on a stand
  const [cx, cy] = P(0, state.camY);
  ctx.strokeStyle = colors.muted;
  ctx.lineWidth = 2;
  line(ctx, cx, cy, cx, V.Y(0));
  line(ctx, cx - 10, V.Y(0), cx, cy + 20 > V.Y(0) ? V.Y(0) : cy + 20);
  line(ctx, cx + 10, V.Y(0), cx, cy + 20 > V.Y(0) ? V.Y(0) : cy + 20);
  drawCamera(ctx, cx, cy, -tilt, hover.side === 'camera' || drag?.target === 'camera');
  label(ctx, `Tilt ${(tilt * 180 / Math.PI).toFixed(1)}°`, cx + 4, cy - 22, colors.muted);
}

/* ------------------------------------------------------------------ */
/* Readouts, advice and status                                         */
/* ------------------------------------------------------------------ */

function stat(k, v, s = '', bad = false) {
  return `<div class="stat${bad ? ' bad' : ''}"><div class="k">${k}</div><div class="v">${v}</div>${s ? `<div class="s">${s}</div>` : ''}</div>`;
}

function renderReadouts(o) {
  const wall = o.wall;
  const D = wall.minDepth;
  const inShot = wall.visible > 0;
  const hazardOn = wall.inFocus > 0;
  const gap = inShot && isFinite(o.far) ? D - o.far : null;

  document.getElementById('readouts').innerHTML = [
    stat('Horizontal FOV', fmtDeg(o.hfov), `Vertical ${fmtDeg(o.vfov)}`),
    stat('Focus distance', fmtM(o.s), state.focusAuto ? 'following subject' : 'manual'),
    stat('Nearest sharp', fmtM(o.near)),
    stat('Furthest sharp', fmtM(o.far), '', hazardOn),
    stat('Total depth of field', fmtM(o.far - o.near)),
    stat('Hyperfocal distance', fmtM(o.H), `at ${fmtStop(o.N)}`),
    stat('Nearest wall in frame', inShot ? fmtM(D) : '—', inShot ? `furthest ${fmtM(wall.maxDepth)}` : 'wall not in shot', hazardOn),
    stat('Far limit → wall', gap === null ? (inShot ? 'wall sharp' : '—') : (gap >= 0 ? fmtM(gap) : '−' + fmtM(-gap)),
      gap === null ? '' : gap >= 0 ? 'clearance behind DOF' : 'wall is inside DOF', hazardOn),
    stat('Circle of confusion', o.cocMm.toFixed(4) + ' mm', `${o.sen.w.toFixed(2)} × ${o.sen.h.toFixed(2)} mm sensor`),
  ].join('');

  // Advice
  const tips = [];
  if (inShot) {
    const { f, c, s, H } = o;
    // Aperture at which the far limit lands exactly on the nearest visible wall.
    if (D > s) {
      const Hreq = (s * (D - f)) / (D - s);
      const nLimit = (f * f) / (c * (Hreq - f));
      if (hazardOn) {
        tips.push(nLimit >= FSTOPS[0]
          ? `Open up to wider than <b>${fmtStop(nLimit)}</b> to push the far limit in front of the wall.`
          : `Even wide open (${fmtStop(FSTOPS[0])}) the wall stays sharp at this focus distance — move the subject/camera away from the wall or use a longer lens.`);
      } else {
        tips.push(`Stopping down past <b>${fmtStop(nLimit)}</b> will bring the wall into focus.`);
      }
      // Furthest focus distance at the current stop before the wall sharpens.
      const sMax = (D * H) / (H - f + D);
      tips.push(`At ${fmtStop(o.N)}, keep focus closer than <b>${fmtM(sMax)}</b> to keep the wall soft.`);
    } else {
      tips.push('Focus is set at or beyond the nearest visible part of the wall — the wall will be sharp.');
    }
    if (hazardOn) {
      tips.push(`<b>${Math.round(wall.fraction * 100)}%</b> of the wall visible in frame is inside the depth of field (hazard-striped in both views).`);
    }
    tips.push(`Subject-to-wall gap along the lens axis: <b>${fmtM(D - o.cb.subjectDist)}</b> (nearest visible wall). More gap = softer wall.`);
  } else {
    tips.push('The LED wall is not in frame — pan the camera toward the wall or widen the lens.');
  }
  document.getElementById('advice').innerHTML = `<h3>Guidance</h3><ul>${tips.map(t => `<li>${t}</li>`).join('')}</ul>`;

  // Status banner
  const el = document.getElementById('status');
  if (!inShot) {
    el.className = 'status neutral';
    el.textContent = 'LED wall not in frame';
  } else if (hazardOn) {
    el.className = 'status hazard';
    el.innerHTML = `<span>⚠ LED wall in focus — ${Math.round(wall.fraction * 100)}% of the visible wall is inside the depth of field</span>`;
  } else {
    el.className = 'status ok';
    el.textContent = `✓ Wall out of focus — ${fmtM(gap)} beyond the far limit`;
  }
}

/* ------------------------------------------------------------------ */
/* Controls                                                            */
/* ------------------------------------------------------------------ */

const rows = []; // { spec, range, num, out }

// Log-scale sliders use 0..1000 positions.
const toPos = (spec, v) => spec.log ? Math.round(1000 * Math.log(v / spec.min) / Math.log(spec.max / spec.min)) : v;
const fromPos = (spec, p) => spec.log ? spec.min * Math.pow(spec.max / spec.min, p / 1000) : +p;
const decimals = step => (String(step).split('.')[1] || '').length;

function buildControls() {
  for (const [containerId, specs] of Object.entries(SLIDERS)) {
    const box = document.getElementById(containerId);
    for (const spec of specs) {
      const id = 'in-' + spec.key;
      const row = document.createElement('div');
      row.className = 'row';
      row.innerHTML = `
        <div class="row-head">
          <label for="${id}">${spec.label}</label>
          <span class="val">${spec.format ? '<output></output>' : `<input type="number" step="${spec.step}"> ${spec.unit}`}</span>
        </div>
        <input id="${id}" type="range">`;
      box.appendChild(row);
      const range = row.querySelector('input[type=range]');
      const num = row.querySelector('input[type=number]');
      const out = row.querySelector('output');
      if (spec.log) { range.min = 0; range.max = 1000; range.step = 1; }
      else { range.min = spec.min; range.max = spec.max; range.step = spec.step; }

      range.addEventListener('input', () => {
        const d = decimals(spec.step);
        set(spec.key, +fromPos(spec, range.value).toFixed(d));
      });
      num?.addEventListener('change', () => {
        if (num.value === '' || !isFinite(+num.value)) return sync();
        set(spec.key, +num.value);
      });
      rows.push({ spec, range, num, out, row });
    }
  }

  const bodySel = document.getElementById('body');
  bodySel.innerHTML = CAMERAS.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  bodySel.addEventListener('change', () => set('body', bodySel.value));

  for (const key of ['customW', 'customH', 'coc']) {
    const el = document.getElementById(key);
    el.addEventListener('change', () => {
      if (el.value === '' || !isFinite(+el.value) || +el.value <= 0) return sync();
      set(key, +el.value);
    });
  }
  for (const key of ['focusAuto', 'cocAuto']) {
    const el = document.getElementById(key);
    el.addEventListener('change', () => set(key, el.checked));
  }
  document.getElementById('reset').addEventListener('click', () => {
    state = { ...DEFAULTS };
    update();
  });
}

function set(key, value) {
  state[key] = value;
  if (key === 'focus') state.focusAuto = false; // moving the focus slider takes manual control
  update();
}

// Keep the scene physically sensible.
function normalise() {
  const s = state;
  const half = stageHalfWidth();
  for (const row of rows) {
    const { key, min, max } = row.spec;
    if (row.spec.dyn) continue;
    s[key] = clamp(s[key], min, max);
  }
  s.camX = clamp(s.camX, -half, half);
  s.subX = clamp(s.subX, -half, half);
  s.camZ = clamp(s.camZ, 0.3, s.stageDepth);
  s.subZ = clamp(s.subZ, 0.2, s.stageDepth);
  s.fstopIdx = Math.round(clamp(s.fstopIdx, 0, FSTOPS.length - 1));
  if (!CAMERAS.some(c => c.id === s.body)) s.body = DEFAULTS.body;
  s.customW = clamp(s.customW, 1, 80);
  s.customH = clamp(s.customH, 1, 60);
  s.coc = clamp(s.coc, 0.002, 0.1);
}

function sync(o) {
  const half = stageHalfWidth();
  for (const { spec, range, num, out } of rows) {
    if (spec.dyn === 'x') { range.min = -half; range.max = half; }
    if (spec.dyn === 'z') { range.max = state.stageDepth; }
    const v = state[spec.key];
    range.value = toPos(spec, v);
    if (num && document.activeElement !== num) num.value = (+v).toFixed(decimals(spec.step));
    if (out) out.textContent = spec.format(v);
  }
  const focusRow = rows.find(r => r.spec.key === 'focus');
  focusRow.row.classList.toggle('following', state.focusAuto);

  document.getElementById('body').value = state.body;
  document.getElementById('custom-sensor').hidden = state.body !== 'custom';
  document.getElementById('customW').value = state.customW;
  document.getElementById('customH').value = state.customH;
  document.getElementById('focusAuto').checked = state.focusAuto;
  document.getElementById('cocAuto').checked = state.cocAuto;
  const cocEl = document.getElementById('coc');
  cocEl.disabled = state.cocAuto;
  if (o && document.activeElement !== cocEl) cocEl.value = o.cocMm.toFixed(4);
  if (o) {
    const diag = Math.hypot(o.sen.w, o.sen.h);
    document.getElementById('sensor-info').textContent =
      `Sensor ${o.sen.w.toFixed(2)} × ${o.sen.h.toFixed(2)} mm · diagonal ${diag.toFixed(1)} mm · crop ${(43.27 / diag).toFixed(2)}× vs full frame`;
  }
}

/* ------------------------------------------------------------------ */
/* Dragging                                                            */
/* ------------------------------------------------------------------ */

function localPos(cv, e) {
  const r = cv.getBoundingClientRect();
  return [e.clientX - r.left, e.clientY - r.top];
}

function hitTop(sx, sy) {
  const V = topView;
  if (!V) return null;
  const dCam = Math.hypot(sx - V.X(state.camX), sy - V.Y(state.camZ));
  const dSub = Math.hypot(sx - V.X(state.subX), sy - V.Y(state.subZ));
  const R = 22;
  if (dCam < R && dCam <= dSub) return 'camera';
  if (dSub < R) return 'subject';
  return null;
}

function hitSide(sx, sy) {
  const V = sideView;
  if (!V) return null;
  const subDist = Math.hypot(state.subX - state.camX, state.subZ - state.camZ);
  const dCam = Math.hypot(sx - V.X(0), sy - V.Y(state.camY));
  const dAim = Math.hypot(sx - V.X(subDist), sy - V.Y(state.aimH));
  if (dAim < 16) return 'aim';
  if (dCam < 22) return 'camera';
  return null;
}

function setupDrag(cv, which) {
  const hit = which === 'top' ? hitTop : hitSide;
  cv.addEventListener('pointerdown', e => {
    const [sx, sy] = localPos(cv, e);
    const target = hit(sx, sy);
    if (!target) return;
    drag = { which, target };
    cv.setPointerCapture(e.pointerId);
    e.preventDefault();
    update();
  });
  cv.addEventListener('pointermove', e => {
    const [sx, sy] = localPos(cv, e);
    if (drag && drag.which === which) {
      if (which === 'top') {
        const V = topView;
        const x = +V.A(sx).toFixed(2), z = +V.B(sy).toFixed(2);
        if (drag.target === 'camera') { state.camX = x; state.camZ = z; }
        else { state.subX = x; state.subZ = z; }
      } else {
        const y = +sideView.B(sy).toFixed(2);
        if (drag.target === 'camera') state.camY = y;
        else state.aimH = y;
      }
      update();
      return;
    }
    const h = hit(sx, sy);
    if (h !== hover[which]) {
      hover[which] = h;
      cv.style.cursor = h ? 'grab' : 'default';
      update(false);
    }
  });
  const end = () => {
    if (!drag) return;
    drag = null;
    update();
  };
  cv.addEventListener('pointerup', end);
  cv.addEventListener('pointercancel', end);
  cv.addEventListener('pointerleave', () => {
    if (hover[which] && !drag) { hover[which] = null; update(false); }
  });
}

/* ------------------------------------------------------------------ */
/* URL state (shareable links)                                         */
/* ------------------------------------------------------------------ */

function loadHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  for (const k of Object.keys(DEFAULTS)) {
    if (!p.has(k)) continue;
    const v = p.get(k), d = DEFAULTS[k];
    if (typeof d === 'number') state[k] = isFinite(+v) && v !== '' ? +v : d;
    else if (typeof d === 'boolean') state[k] = v === '1';
    else state[k] = v;
  }
}

let hashTimer = null;
function saveHash() {
  clearTimeout(hashTimer);
  hashTimer = setTimeout(() => {
    const p = new URLSearchParams();
    for (const k of Object.keys(DEFAULTS)) {
      const v = state[k];
      p.set(k, typeof v === 'boolean' ? (v ? '1' : '0') : typeof v === 'number' ? String(+v.toFixed(3)) : v);
    }
    history.replaceState(null, '', '#' + p.toString());
  }, 250);
}

/* ------------------------------------------------------------------ */
/* Main loop                                                           */
/* ------------------------------------------------------------------ */

function update(persist = true) {
  normalise();
  const o = compute();
  drawTop(o);
  drawSide(o);
  renderReadouts(o);
  sync(o);
  if (persist) saveHash();
}

function init() {
  readColors();
  loadHash();
  buildControls();
  setupDrag(topCanvas, 'top');
  setupDrag(sideCanvas, 'side');
  new ResizeObserver(() => update(false)).observe(document.querySelector('.views'));
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    readColors();
    hazardCache.delete(topCanvas.getContext('2d'));
    hazardCache.delete(sideCanvas.getContext('2d'));
    update(false);
  });
  update();
}

init();
