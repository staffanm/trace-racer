import '@fontsource/chakra-petch/500.css';
import '@fontsource/chakra-petch/700.css';
import './style.css';

// ---------- constants ----------
const WW = 1920, WH = 1080;     // world frame: 16:9, each track is stretched to fill it
const TW = 100;                 // reference track width (each track point carries its own)
const CAR_SCALE = 1.35;          // cars are drawn this much larger than the 32x20 sprite size; physics is unchanged
const DS = 5;                   // centerline sample spacing
const PDS = 4;                  // player path sample spacing
const PH = { vmax: 1050, accel: 620, brake: 1250, aLat: 460, grassMax: 60, minLine: 50, drawGain: 1.3, kDead: 0.0012 };
// rivals: skill scales the ideal speed profile; wild is how often driving over the limit ends in a spin
const RIVALS = [
  { name: 'Steady', sprite: 'steady',   color: '#36c27a', skill: 0.96, wild: 0 },
  { name: 'Balanced', sprite: 'balanced', color: '#3d8cf0', skill: 1.0,  wild: 0 },
  { name: 'Hotshot', sprite: 'hotshot',  color: '#b05de0', skill: 1.05, wild: 0.9 },
  { name: 'Reckless', sprite: 'reckless', color: '#e8463c', skill: 1.1,  wild: 1.6 },
];
// surfaces: grip scales cornering limit, acc/brk scale pedal response, spring/damp shape how a slide recovers
const SURF = {
  a: { name: 'asphalt', grip: 1,    acc: 1,    brk: 1,    spring: 8,   damp: 4,   color: null },
  g: { name: 'gravel',  grip: 0.6,  acc: 0.75, brk: 0.7,  spring: 5,   damp: 3,   color: '#a88a58' },
  i: { name: 'ice',     grip: 0.3,  acc: 0.5,  brk: 0.35, spring: 1.5, damp: 1.2, color: '#cfe6f0' },
};
const TRACKS = [
  { name: 'Asphalt Circuit', blurb: 'A fast top straight into stacked hairpins. Full grip, so it is all about braking points.', stadium: false, pts: [[306,450,100,"a"],[426,237,100,"a"],[815,172,120,"a"],[1278,172,120,"a"],[1416,182,90,"a"],[1518,283,80,"a"],[1416,385,80,"a"],[1000,404,90,"a"],[815,422,80,"a"],[722,515,70,"a"],[815,607,80,"a"],[1185,635,90,"a"],[1389,644,80,"a"],[1472,728,70,"a"],[1389,811,80,"a"],[907,811,100,"a"],[537,774,100,"a"],[306,635,100,"a"]] },
  { name: 'Gravel Rally', blurb: 'A long flat-out run into a needle hairpin, then esses. Gravel: 60% grip and slow brakes.', stadium: false, pts: [[407,434,100,"g"],[525,252,110,"g"],[763,205,130,"g"],[1475,205,130,"g"],[1593,213,100,"g"],[1680,300,80,"g"],[1593,387,90,"g"],[1198,395,90,"g"],[1000,426,70,"g"],[858,347,70,"g"],[763,395,80,"g"],[699,442,80,"g"],[589,545,70,"g"],[699,648,80,"g"],[921,632,90,"g"],[1198,616,80,"g"],[1277,695,70,"g"],[1198,790,80,"g"],[842,806,110,"g"],[565,751,100,"g"]] },
  { name: 'Ice Lake', blurb: 'Flowing bends on sheet ice: 30% grip, and a slide barely corrects itself. Draw smooth and early.', stadium: false, pts: [[91,511,110,"i"],[242,171,110,"i"],[772,98,120,"i"],[1152,292,110,"i"],[1681,147,120,"i"],[1984,450,110,"i"],[1758,777,110,"i"],[1227,705,100,"i"],[772,826,110,"i"],[364,753,110,"i"]] },
  { name: 'Stadium Rallycross', blurb: 'Asphalt straights ending in jumps, gravel corners right after. No steering in the air.', stadium: true, pts: [[545,120,110,"a"],[1057,120,110,"jg"],[1387,143,100,"g"],[1614,314,90,"a"],[1625,461,90,"jg"],[1569,666,90,"g"],[1455,882,90,"g"],[1114,905,100,"a"],[602,905,100,"jg"],[295,848,90,"g"],[181,734,80,"g"],[295,621,80,"g"],[500,621,80,"g"],[613,507,80,"g"],[500,393,80,"g"],[295,393,80,"g"],[181,279,80,"g"],[295,166,90,"g"]] }
];

// ---------- helpers ----------
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const mod = (a, n) => ((a % n) + n) % n;
const hyp = Math.hypot;
function wrapDelta(i, last, n) { let d = i - last; if (d > n / 2) d -= n; if (d < -n / 2) d += n; return d; }

function catmull(pts, perSeg) {
  const out = [], n = pts.length, D = Math.min(3, pts[0].length);
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    for (let j = 0; j < perSeg; j++) {
      const t = j / perSeg, t2 = t * t, t3 = t2 * t, q = [];
      for (let d = 0; d < D; d++) q.push(0.5 * (2 * p1[d] + (-p0[d] + p2[d]) * t + (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * t2 + (-p0[d] + 3 * p1[d] - 3 * p2[d] + p3[d]) * t3));
      q.push(i + t); // which control segment this sample belongs to
      out.push(q);
    }
  }
  return out;
}
// resample a polyline (points may carry a 3rd value that gets interpolated)
function resample(poly, ds, closed) {
  const pts = [], n = poly.length;
  let acc = 0, prev = poly[0];
  pts.push(prev.slice());
  const last = closed ? n : n - 1;
  for (let i = 1; i <= last; i++) {
    const p = (closed && i === n) ? [poly[0][0], poly[0][1], ...poly[n - 1].slice(2)] : poly[i % n];
    const total = hyp(p[0] - prev[0], p[1] - prev[1]);
    let seg = total, start = prev;
    while (seg > 0 && acc + seg >= ds) {
      const need = ds - acc, t = need / seg;
      const q = [start[0] + (p[0] - start[0]) * t, start[1] + (p[1] - start[1]) * t];
      if (p.length > 2) { const u = total > 0 ? (total - (seg - need)) / total : 1; for (let d = 2; d < p.length; d++) q.push(prev[d] + (p[d] - prev[d]) * u); }
      pts.push(q); seg -= need; start = q; acc = 0;
    }
    acc += seg; prev = p;
  }
  return pts;
}
function smoothArr(a, w, closed) {
  const n = a.length, out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0, c = 0;
    for (let j = -w; j <= w; j++) {
      let k = i + j;
      if (closed) k = mod(k, n); else if (k < 0 || k >= n) continue;
      s += a[k]; c++;
    }
    out[i] = s / c;
  }
  return out;
}
function curvature(pts, ds, closed, w) {
  const n = pts.length, k = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = pts[closed ? mod(i - 1, n) : Math.max(i - 1, 0)], b = pts[i], c = pts[closed ? (i + 1) % n : Math.min(i + 1, n - 1)];
    const a1 = Math.atan2(b[1] - a[1], b[0] - a[0]), a2 = Math.atan2(c[1] - b[1], c[0] - b[0]);
    let d = a2 - a1; d = Math.atan2(Math.sin(d), Math.cos(d));
    k[i] = d / ds;
  }
  return smoothArr(k, w, closed);
}
function nearestIdx(cl, p, from, win) {
  const n = cl.length; let best = from, bd = Infinity;
  for (let d = -win; d <= win; d++) {
    const i = mod(from + d, n), dx = cl[i][0] - p[0], dy = cl[i][1] - p[1], dd = dx * dx + dy * dy;
    if (dd < bd) { bd = dd; best = i; }
  }
  return { i: best, d: Math.sqrt(bd) };
}
function speedColor(v) { const r = clamp(v / PH.vmax, 0, 1); return `hsl(${120 * (1 - r)} 88% 54%)`; }

// ---------- track building ----------
function buildTrack(def) {
  const cl = resample(catmull(def.pts, 30), DS, true);
  const n = cl.length, L = n * DS;
  const k = curvature(cl, DS, true, 6);
  // AI speed profile with braking/acceleration limits
  // surface per sample (from the control point that starts the segment) and jump ramps
  const np = def.pts.length, surf = [], jumps = [];
  let lastCtrl = -1;
  for (let i = 0; i < n; i++) {
    const ctrl = mod(Math.floor(cl[i][3] + 1e-6), np), c = def.pts[ctrl][3] || 'a';
    if (c[0] === 'j') { if (ctrl !== lastCtrl) jumps.push(i); surf.push(SURF[c[1]] ? c[1] : 'a'); } else surf.push(SURF[c] ? c : 'a');
    lastCtrl = ctrl;
  }
  const prof = new Float32Array(n);
  for (let i = 0; i < n; i++) prof[i] = Math.min(PH.vmax, Math.sqrt(PH.aLat * SURF[surf[i]].grip / Math.max(Math.abs(k[i]), 1e-4)));
  for (let pass = 0; pass < 2; pass++) for (let i = n - 1; i >= 0; i--) { const nx = prof[(i + 1) % n]; prof[i] = Math.min(prof[i], Math.sqrt(nx * nx + 2 * PH.brake * SURF[surf[i]].brk * DS)); }
  for (let pass = 0; pass < 2; pass++) for (let i = 0; i < n; i++) { const pv = prof[mod(i - 1, n)]; prof[i] = Math.min(prof[i], Math.sqrt(pv * pv + 2 * PH.accel * SURF[surf[i]].acc * DS)); }
  // edges (variable width), ring polygon, bounds
  const left = [], right = [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    const a = cl[mod(i - 1, n)], b = cl[(i + 1) % n], tx = b[0] - a[0], ty = b[1] - a[1], len = hyp(tx, ty) || 1, h = cl[i][2] / 2;
    const l = [cl[i][0] - ty / len * h, cl[i][1] + tx / len * h], r = [cl[i][0] + ty / len * h, cl[i][1] - tx / len * h];
    left.push(l); right.push(r);
    for (const p of [l, r]) { minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]); minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); }
  }
  const m = 12;
  const bbox = { x: minX - m, y: minY - m, w: maxX - minX + 2 * m, h: maxY - minY + 2 * m };
  const loop = pts => { const p = new Path2D(); p.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) p.lineTo(pts[i][0], pts[i][1]); p.closePath(); return p; };
  const path = loop(cl), edgeL = loop(left), edgeR = loop(right);
  const ring = new Path2D(); ring.addPath(edgeL); ring.addPath(edgeR);
  // polygons for each run of non-asphalt surface
  const runs = [];
  let i = 0;
  while (i < n) {
    if (surf[i] === 'a') { i++; continue; }
    let j = i; while (j + 1 < n && surf[j + 1] === surf[i]) j++;
    const a = Math.max(0, i - 1), b = Math.min(n - 1, j + 1), p = new Path2D();
    p.moveTo(left[a][0], left[a][1]); for (let q = a + 1; q <= b; q++) p.lineTo(left[q][0], left[q][1]);
    for (let q = b; q >= a; q--) p.lineTo(right[q][0], right[q][1]); p.closePath();
    runs.push({ surf: surf[i], path: p });
    i = j + 1;
  }
  return { def, cl, n, L, k, prof, path, edgeL, edgeR, ring, bbox, left, right, surf, jumps, runs };
}
// Stretch a track so its bounding box (kerbs included) fills the WW x WH frame. Widths scale with the smaller axis.
function fitToFrame(def) {
  let pts = def.pts;
  for (let pass = 0; pass < 3; pass++) {
    const bb = buildTrack({ ...def, pts }).bbox, sx = WW / bb.w, sy = WH / bb.h, sw = Math.min(sx, sy);
    pts = pts.map(([x, y, w, c]) => [(x - bb.x) * sx, (y - bb.y) * sy, w * sw, c]);
  }
  return { ...def, pts };
}
const BUILT = TRACKS.map(d => buildTrack(fitToFrame(d)));

// ---------- bitmap art (art/ in the repository; the game draws flat shapes until an image has loaded) ----------
const ART_SCALE = 2560 / WW;    // the track images are 2560x1440 pixels
function loadImg(src, onload) { const im = new Image(); if (onload) im.onload = onload; im.src = src; return im; }
const ready = im => im && im.complete && im.naturalWidth > 0;
const TRACK_ART = TRACKS.map((t, i) => ({
  main: loadImg(`./art/track-${i}.webp`, () => { if (phase === 'title') buildCards(); }),
  tile: loadImg(`./art/texture-${i}.webp`),
}));
const CAR_ART = Object.fromEntries(['player', 'steady', 'balanced', 'hotshot', 'reckless'].map(k => [k, loadImg(`./art/car-${k}.png`)]));

// ---------- canvas / view ----------
const canvas = document.getElementById('c'), ctx = canvas.getContext('2d');
const lineCanvas = document.createElement('canvas'), lctx = lineCanvas.getContext('2d');
const view = { w: 0, h: 0, dpr: 1, scale: 1, ox: 0, oy: 0 };
function applyWorldTransform(c) { c.setTransform(view.dpr * view.scale, 0, 0, view.dpr * view.scale, view.dpr * view.ox, view.dpr * view.oy); }
let bgColor = '#2f6a3a';
function resize() {
  bgColor = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#2f6a3a';
  const r = canvas.getBoundingClientRect();
  view.w = r.width; view.h = r.height; view.dpr = Math.min(window.devicePixelRatio || 1, 3);
  canvas.width = lineCanvas.width = Math.max(1, Math.round(r.width * view.dpr));
  canvas.height = lineCanvas.height = Math.max(1, Math.round(r.height * view.dpr));
  view.scale = Math.min(r.width / WW, r.height / WH);
  view.ox = (r.width - WW * view.scale) / 2;
  view.oy = (r.height - WH * view.scale) / 2;
  redrawLine();
}
function toWorld(e) { const r = canvas.getBoundingClientRect(); return [(e.clientX - r.left - view.ox) / view.scale, (e.clientY - r.top - view.oy) / view.scale]; }
window.addEventListener('resize', resize);

// ---------- state ----------
let phase = 'title';            // title | draw | countdown | race | results
let track = BUILT[0], trackIdx = 0, laps = 3;
let cars = [], player = null, raceTime = 0, countdown = 0, lastT = 0;
let drawing = false, raw = [], drawProg = 0, drawLastI = 0;
let skids = [];
const $ = id => document.getElementById(id);
const msgEl = $('msg');
let msgTimer = null;
function msg(text, dur, big) {
  clearTimeout(msgTimer);
  msgEl.textContent = text; msgEl.classList.toggle('big', !!big); msgEl.classList.add('show');
  if (dur) msgTimer = setTimeout(() => msgEl.classList.remove('show'), dur);
}
function hideMsg() { clearTimeout(msgTimer); msgEl.classList.remove('show'); }

function gridPos(sIdx, lat) {
  const n = track.n, i = mod(sIdx, n), a = track.cl[i], b = track.cl[(i + 1) % n];
  const tx = b[0] - a[0], ty = b[1] - a[1], len = hyp(tx, ty) || 1;
  return { x: a[0] - ty / len * lat, y: a[1] + tx / len * lat, ang: Math.atan2(ty, tx) };
}
function setupRace(preset) {
  cars = []; skids = []; raw = []; drawProg = 0; drawLastI = 0; drawing = false; raceTime = 0;
  ghostRec = []; ghostNext = 0; loadGhost();
  const p0 = gridPos(0, -track.cl[0][2] * 0.25);
  player = { isPlayer: true, color: '#ffd23d', sprite: 'player', x: p0.x, y: p0.y, ang: p0.ang, sx: p0.x, sy: p0.y,
    s: 0, v: 0, lat: 0, latV: 0, skid: false, air: 0, airTotal: 1, offFrac: 0, off: false, prog: 0, lastI: 0, finished: false, finishTime: null, path: null };
  for (let i = 0; i < 4; i++) {
    const s = -(i + 1) * 32, off = (i % 2 ? -1 : 1) * track.cl[0][2] * 0.25, r = RIVALS[i];
    const g = gridPos(Math.round(s / DS), off);
    cars.push({ name: r.name, color: r.color, sprite: r.sprite, skill: r.skill, wild: r.wild, spin: 0, spinAng: 0, off, offPhase: Math.random() * 6, s, v: 0, prog: s, air: 0, airTotal: 1, lastI: mod(Math.round(s / DS), track.n),
      x: g.x, y: g.y, ang: g.ang, finished: false, finishTime: null });
  }
  cars.unshift(player);
  lctx.setTransform(1, 0, 0, 1, 0, 0); lctx.clearRect(0, 0, lineCanvas.width, lineCanvas.height);
  $('hud').classList.remove('hidden');
  if (preset) {
    if (preset.exact) { player.path = preset.exact; player.pathEnd = (preset.exact.length - 1) * PDS; }
    else buildPlayerPath(preset, 1);
    redrawLine();
    phase = 'countdown'; countdown = 3.0; updateHud(true);
    return;
  }
  phase = 'draw'; updateHud(true);
  msg(`Touch your car and draw ${laps} lap${laps > 1 ? 's' : ''} in one stroke`, 0);
}

// ---------- drawing phase ----------
function addRaw(x, y, t) {
  const last = raw[raw.length - 1];
  if (last && hyp(x - last[0], y - last[1]) < 1.5) return;
  let v = 0;
  if (last) {
    const dt = Math.max(1, t - last[2]);
    const inst = hyp(x - last[0], y - last[1]) / dt * 1000;
    const a = 1 - Math.exp(-dt / 160);
    v = last[3] + (inst - last[3]) * a;
  }
  raw.push([x, y, t, v]);
  if (last) drawSegOnLine(last, [x, y], v);
  const nr = nearestIdx(track.cl, [x, y], drawLastI, 70);
  drawProg += wrapDelta(nr.i, drawLastI, track.n) * DS; drawLastI = nr.i;
  updateHud();
  if (drawProg >= laps * track.L) finishDrawing();
}
function drawSegOnLine(a, b, v) {
  applyWorldTransform(lctx);
  lctx.lineCap = 'round'; lctx.lineWidth = 5; lctx.strokeStyle = speedColor(v);
  lctx.beginPath(); lctx.moveTo(a[0], a[1]); lctx.lineTo(b[0], b[1]); lctx.stroke();
}
function redrawLine() {
  lctx.setTransform(1, 0, 0, 1, 0, 0); lctx.clearRect(0, 0, lineCanvas.width, lineCanvas.height);
  if (player && player.path) {
    const p = player.path;
    for (let i = 1; i < p.length; i++) drawSegOnLine([p[i - 1].x, p[i - 1].y], [p[i].x, p[i].y], p[i].v);
  } else {
    for (let i = 1; i < raw.length; i++) drawSegOnLine(raw[i - 1], raw[i], raw[i][3]);
  }
}
function finishDrawing() {
  drawing = false;
  // smooth positions, keep speed
  const sm = raw.map((p, i) => {
    let sx = 0, sy = 0, c = 0;
    for (let j = -2; j <= 2; j++) { const q = raw[i + j]; if (q) { sx += q[0]; sy += q[1]; c++; } }
    return [sx / c, sy / c, p[3]];
  });
  buildPlayerPath(sm, PH.drawGain);
  redrawLine();
  phase = 'countdown'; countdown = 3.0;
}
function buildPlayerPath(sm, gain) {
  const rs0 = resample(sm, PDS, false);
  // second smoothing pass over distance (±20 units) so finger jitter at low speed does not become wobble
  const sm2 = rs0.map((p, i) => { let sx = 0, sy = 0, c = 0; for (let j = -5; j <= 5; j++) { const q = rs0[i + j]; if (q) { sx += q[0]; sy += q[1]; c++; } } return [sx / c, sy / c, p[2]]; });
  const rs = resample(sm2, PDS, false);
  const k = curvature(rs, PDS, false, 10);
  const vs = smoothArr(rs.map(p => Math.max(PH.minLine, p[2] * gain)), 10, false);
  player.path = rs.map((p, i) => ({ x: p[0], y: p[1], v: vs[i], k: Math.sign(k[i]) * Math.max(0, Math.abs(k[i]) - PH.kDead) }));
  player.pathEnd = (rs.length - 1) * PDS;
}

// ---------- share codes ----------
// Header: version, track, laps, flags, start x/y (uint16 LE). Body: per 8-unit step a heading (256 directions,
// chosen greedily so the reconstruction tracks the true line) and a speed byte, each stored as deltas from the
// previous step (headings first, then speeds), then deflated when the browser can, and written in base-76 using
// only characters that survive URLs and chat apps unescaped.
const STEP = 8;
const B76 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-._~!$*+=:@/?&';
const B76N = BigInt(B76.length), CHUNK = 39;
const charsFor = n => Math.ceil(n * 8 / Math.log2(B76.length));
function b76encode(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const n = Math.min(CHUNK, bytes.length - i);
    let v = 0n; for (let j = 0; j < n; j++) v = (v << 8n) | BigInt(bytes[i + j]);
    let str = ''; for (let c = charsFor(n); c > 0; c--) { str = B76[Number(v % B76N)] + str; v /= B76N; }
    out += str;
  }
  return out;
}
function b76decode(str) {
  const bytes = [], full = charsFor(CHUNK);
  const bytesFor = c => { for (let n = 1; n <= CHUNK; n++) if (charsFor(n) === c) return n; return 0; };
  for (let i = 0; i < str.length; i += full) {
    const part = str.slice(i, i + full), n = bytesFor(part.length);
    if (!n) throw new Error('bad length');
    let v = 0n; for (const ch of part) { const d = B76.indexOf(ch); if (d < 0) throw new Error('bad char'); v = v * B76N + BigInt(d); }
    const chunk = []; for (let j = 0; j < n; j++) { chunk.unshift(Number(v & 255n)); v >>= 8n; }
    bytes.push(...chunk);
  }
  return new Uint8Array(bytes);
}
async function deflate(bytes) {
  const cs = new CompressionStream('deflate-raw'), w = cs.writable.getWriter(); w.write(bytes); w.close();
  return new Uint8Array(await new Response(cs.readable).arrayBuffer());
}
async function inflate(bytes) {
  const ds = new DecompressionStream('deflate-raw'), w = ds.writable.getWriter(); w.write(bytes); w.close();
  return new Uint8Array(await new Response(ds.readable).arrayBuffer());
}
async function encodeLine(path, ti, l) {
  const dirs = [], sp = [];
  let cx = Math.round(path[0].x), cy = Math.round(path[0].y);
  const x0 = cx, y0 = cy;
  for (let i = STEP / PDS; i < path.length; i += STEP / PDS) {
    const p = path[i], ang = Math.atan2(p.y - cy, p.x - cx);
    const d = mod(Math.round(ang / (2 * Math.PI) * 256), 256), a = d / 256 * 2 * Math.PI;
    cx += Math.cos(a) * STEP; cy += Math.sin(a) * STEP;
    dirs.push(d); sp.push(clamp(Math.round(p.v / PH.vmax * 255), 0, 255));
  }
  const body = new Uint8Array(dirs.length * 2);
  let pd = 0, ps = 0;
  for (let i = 0; i < dirs.length; i++) { body[i] = (dirs[i] - pd) & 255; pd = dirs[i]; body[dirs.length + i] = (sp[i] - ps) & 255; ps = sp[i]; }
  let payload = body, flags = 0;
  if (typeof CompressionStream !== 'undefined') { try { const z = await deflate(body); if (z.length < body.length) { payload = z; flags = 1; } } catch (e) {} }
  const out = new Uint8Array(8 + payload.length);
  out.set([3, ti, l, flags, x0 & 255, x0 >> 8, y0 & 255, y0 >> 8]); out.set(payload, 8);
  return b76encode(out);
}
async function decodeLine(code) {
  try {
    const b = b76decode(code);
    if (b[0] !== 3 || b[1] >= TRACKS.length || b[2] < 1 || b[2] > 3 || b.length < 10) return null;
    let body = b.subarray(8);
    if (b[3] & 1) { if (typeof DecompressionStream === 'undefined') return { error: 'This browser cannot read compressed lines' }; body = await inflate(body); }
    const n = body.length >> 1;
    let cx = b[4] | (b[5] << 8), cy = b[6] | (b[7] << 8), pd = 0, ps = 0;
    const pts = [];
    for (let i = 0; i < n; i++) {
      pd = (pd + body[i]) & 255; ps = (ps + body[n + i]) & 255;
      if (i === 0) pts.push([cx, cy, ps / 255 * PH.vmax]);
      const a = pd / 256 * 2 * Math.PI; cx += Math.cos(a) * STEP; cy += Math.sin(a) * STEP;
      pts.push([cx, cy, ps / 255 * PH.vmax]);
    }
    return { track: b[1], laps: b[2], pts };
  } catch (e) { return null; }
}
async function shareUrl() { return location.href.split('#')[0] + '#l=' + await encodeLine(player.path, trackIdx, laps); }

// ---------- ghost (previous best run) ----------
let ghost = null, ghostRec = [], ghostNext = 0;
function ghostKey() { return `trace-racer-v2-ghost-${trackIdx}-${laps}`; }
function loadGhost() {
  ghost = null;
  try { const g = JSON.parse(localStorage.getItem(ghostKey())); if (g && g.length > 2) ghost = g; } catch (e) {}
}
function ghostPose(t) {
  const g = ghost; let lo = 0, hi = g.length - 1;
  if (t <= g[0][0]) return g[0]; if (t >= g[hi][0]) return g[hi];
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (g[mid][0] <= t) lo = mid; else hi = mid; }
  const a = g[lo], b = g[hi], u = (t - a[0]) / Math.max(1e-6, b[0] - a[0]);
  let da = b[3] - a[3]; da = Math.atan2(Math.sin(da), Math.cos(da));
  return [t, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u, a[3] + da * u];
}
function cancelDrawing(why) {
  drawing = false; raw = []; drawProg = 0; drawLastI = 0;
  lctx.setTransform(1, 0, 0, 1, 0, 0); lctx.clearRect(0, 0, lineCanvas.width, lineCanvas.height);
  updateHud();
  msg(why, 2200);
  setTimeout(() => { if (phase === 'draw' && !drawing) msg(`Touch your car and draw ${laps} lap${laps > 1 ? 's' : ''} in one stroke`, 0); }, 2300);
}
canvas.addEventListener('pointerdown', e => {
  if (phase !== 'draw') return;
  e.preventDefault();
  const p = toWorld(e);
  if (hyp(p[0] - player.sx, p[1] - player.sy) > 60) { msg('Start the line on your yellow car', 1500); return; }
  canvas.setPointerCapture(e.pointerId);
  drawing = true; raw = []; drawProg = 0; drawLastI = 0; hideMsg();
  addRaw(player.sx, player.sy, performance.now());
  addRaw(p[0], p[1], performance.now());
});
canvas.addEventListener('pointermove', e => {
  if (!drawing) return;
  e.preventDefault();
  const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
  for (const ev of (evs.length ? evs : [e])) { const p = toWorld(ev); addRaw(p[0], p[1], ev.timeStamp || performance.now()); if (!drawing) break; }
});
function endPointer(e) {
  if (!drawing) return;
  e.preventDefault();
  if (drawProg >= laps * track.L - 40) finishDrawing();
  else cancelDrawing(`Line too short: draw all ${laps} lap${laps > 1 ? 's' : ''} without lifting`);
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);

// ---------- race simulation ----------
function crossedJump(last, cur, n) {
  const d = wrapDelta(cur, last, n); if (d <= 0) return false;
  for (const j of track.jumps) { const dj = mod(j - last, n); if (dj > 0 && dj <= d) return true; }
  return false;
}
function stepAI(c, dt) {
  if (c.finished) return;
  const n = track.n, sm = mod(c.s, track.L), f = sm / DS, i = Math.floor(f) % n, j = (i + 1) % n, t = f - Math.floor(f);
  if (c.air > 0) c.air -= dt;
  else if (c.spin > 0) { c.spin -= dt; c.v *= Math.exp(-dt * 4); c.spinAng += dt * 9; }
  else {
    const sf = SURF[track.surf[i]], target = track.prof[i] * c.skill;
    c.v += clamp(target - c.v, -PH.brake * sf.brk * dt, PH.accel * sf.acc * dt);
    if (c.wild > 0) {
      const lim = Math.sqrt(PH.aLat * sf.grip / Math.max(Math.abs(track.k[i]), 1e-4));
      const overshoot = c.v / lim - 1;
      if (overshoot > 0 && Math.random() < c.wild * overshoot * dt) { c.spin = 1.4; c.spinAng = 0; }
    }
  }
  c.s += c.v * dt; c.prog = c.s;
  if (crossedJump(c.lastI, i, n)) { c.airTotal = c.air = 0.22 + c.v / 3200; }
  c.lastI = i;
  const a = track.cl[i], b = track.cl[j];
  const tx = b[0] - a[0], ty = b[1] - a[1], len = hyp(tx, ty) || 1;
  const off = (c.off + 12 * Math.sin(sm / 350 + c.offPhase)) * (a[2] / 100);
  c.x = a[0] + tx * t - ty / len * off; c.y = a[1] + ty * t + tx / len * off; c.ang = Math.atan2(ty, tx) + (c.spin > 0 ? c.spinAng : 0);
  if (c.prog >= laps * track.L) { c.finished = true; c.finishTime = raceTime; }
}
function stepPlayer(p, dt) {
  if (p.finished) return;
  const path = p.path, n = path.length;
  if (p.air > 0) {
    // airborne: no grip, no steering; fly straight on the current heading
    p.air -= dt;
    p.x += Math.cos(p.ang) * p.v * dt; p.y += Math.sin(p.ang) * p.v * dt;
    if (p.air <= 0) {
      // landed: re-attach to the drawn line at the nearest point ahead, carrying any sideways error as slide
      const i0 = Math.floor(p.s / PDS); let bi = i0, bd = Infinity;
      for (let q = i0; q < Math.min(n, i0 + 220); q++) { const d = (path[q].x - p.x) ** 2 + (path[q].y - p.y) ** 2; if (d < bd) { bd = d; bi = q; } }
      const a = path[bi], b = path[Math.min(bi + 1, n - 1)], tx = b.x - a.x, ty = b.y - a.y, len = hyp(tx, ty) || 1;
      p.s = bi * PDS; p.lat = ((p.x - a.x) * -ty + (p.y - a.y) * tx) / len; p.latV = 0; p.v *= 0.97;
      if (p.s >= p.pathEnd) { p.s = p.pathEnd; p.finished = true; p.finishTime = raceTime; }
    }
  } else {
  let f = Math.min(p.s / PDS, n - 1.0001), i = Math.floor(f), t = f - i;
  let a = path[i], b = path[Math.min(i + 1, n - 1)];
  const sf = SURF[track.surf[p.lastI]];
  const drawn = a.v + (b.v - a.v) * t, g = p.offFrac;   // 0 on the road, 1 fully on grass
  let target = drawn * (1 - g) + Math.min(drawn, PH.grassMax) * g;
  p.v += clamp(target - p.v, -PH.brake * sf.brk * dt, PH.accel * sf.acc * dt);
  const k = a.k, lim = Math.sqrt(PH.aLat * sf.grip / Math.max(Math.abs(k), 1e-4)) * (1 - 0.6 * g);
  const over = p.v - lim;
  if (over > 0) {
    // tyres scrub: bleed the excess and get pushed to the outside of the bend
    // sliding tyres: the excess goes quickly, and scrubbing keeps costing speed for as long as the slide lasts
    p.v = Math.max(lim, p.v - PH.brake * 1.3 * sf.brk * dt) - 320 * dt * sf.grip;   // sliding cannot shed speed faster than hard braking
    const deficit = p.v * p.v * Math.abs(k) - PH.aLat * sf.grip * (1 - 0.6 * g);   // lateral acceleration the tyres cannot supply
    p.latV += -Math.sign(k) * Math.max(0, deficit) * dt;
    p.skid = true;
  } else {
    p.skid = false;
    p.latV -= p.lat * dt * sf.spring;  // spring back toward the drawn line
  }
  p.latV *= Math.exp(-dt * sf.damp);  // damping
  // steering back toward the line is limited to a shallow angle: no faster than ~a fifth of forward speed
  if (p.latV * p.lat < 0) { const maxBack = Math.max(20, p.v * 0.2 * sf.grip); p.latV = clamp(p.latV, -maxBack, maxBack); }
  p.lat = clamp(p.lat + p.latV * dt, -track.cl[p.lastI][2] * 1.2, track.cl[p.lastI][2] * 1.2);
  if (g > 0) p.v *= Math.exp(-dt * 9 * g);
  p.s += p.v * dt;
  if (p.s >= p.pathEnd) { p.s = p.pathEnd; p.finished = true; p.finishTime = raceTime; }
  f = Math.min(p.s / PDS, n - 1.0001); i = Math.floor(f); t = f - i; a = path[i]; b = path[Math.min(i + 1, n - 1)];
  const tx = b.x - a.x, ty = b.y - a.y, len = hyp(tx, ty) || 1;
  const h0 = path[Math.max(0, i - 2)], h1 = path[Math.min(n - 1, i + 3)];
  p.x = a.x + tx * t - ty / len * p.lat; p.y = a.y + ty * t + tx / len * p.lat; p.ang = Math.atan2(h1.y - h0.y, h1.x - h0.x);
  }
  const nr = nearestIdx(track.cl, [p.x, p.y], p.lastI, 50);
  p.offFrac = clamp((nr.d - track.cl[nr.i][2] / 2) / 16, 0, 1); p.off = p.offFrac > 0.5;
  if (p.air <= 0 && crossedJump(p.lastI, nr.i, track.n)) { p.airTotal = p.air = 0.22 + p.v / 3200; p.skid = false; }
  p.prog += wrapDelta(nr.i, p.lastI, track.n) * DS; p.lastI = nr.i;
  if (p.skid && p.air <= 0) {
    const c = Math.cos(p.ang), s = Math.sin(p.ang);
    skids.push({ x: p.x - c * 9 - s * 5, y: p.y - s * 9 + c * 5, a: 1 }, { x: p.x - c * 9 + s * 5, y: p.y - s * 9 - c * 5, a: 1 });
    if (skids.length > 800) skids.splice(0, skids.length - 800);
  }
  if (!p.finished && p.prog >= laps * track.L) { p.finished = true; p.finishTime = raceTime; }
}
const rankKey = c => c.finished ? 1e7 - c.finishTime : c.prog;
function position() { return cars.slice().sort((a, b) => rankKey(b) - rankKey(a)).indexOf(player) + 1; }

let hudCache = '', hudNext = 0;
function updateHud(force) {
  const now = performance.now();
  if (!force && now < hudNext) return;
  hudNext = now + 100;
  const prog = phase === 'draw' ? drawProg : player.prog;
  const lap = Math.min(Math.floor(Math.max(0, prog) / track.L) + 1, laps);
  const pos = phase === 'race' ? position() : 1;
  const text = `${lap}|${pos}|${raceTime.toFixed(2)}`;
  if (text === hudCache) return; hudCache = text;
  $('hud-lap').textContent = `Lap ${lap}/${laps}`;
  $('hud-pos').textContent = phase === 'race' ? `Pos ${pos}/${cars.length}` : (phase === 'draw' ? 'Drawing' : '');
  $('hud-time').textContent = phase === 'draw' ? '' : raceTime.toFixed(2);
}
function bestKey() { return `trace-racer-v2-best-${trackIdx}-${laps}`; }
function showResults() {
  phase = 'results';
  const pos = position(), time = player.finishTime;
  $('res-title').textContent = pos === 1 ? 'You won' : (pos === 2 ? 'Close one' : 'Finished');
  $('res-pos').textContent = pos; $('res-n').textContent = cars.length; $('res-time').textContent = time.toFixed(2);
  let best = null;
  try { best = parseFloat(localStorage.getItem(bestKey())); if (isNaN(best)) best = null; } catch (e) { best = null; }
  let line;
  if (best === null || time < best) {
    line = best === null ? 'First time on this track' : `New best time (was ${best.toFixed(2)} s)`;
    try { localStorage.setItem(bestKey(), String(time)); localStorage.setItem(ghostKey(), JSON.stringify(ghostRec)); } catch (e) {}
  }
  else line = `Best on this track: ${best.toFixed(2)} s`;
  $('res-best').textContent = line;
  if (trackIdx + 1 < TRACKS.length && unlockedCount() < trackIdx + 2) {
    try { localStorage.setItem('trace-racer-unlocked', String(trackIdx + 2)); } catch (e) {}
    $('res-best').textContent += ` · ${TRACKS[trackIdx + 1].name} unlocked`;
  }
  $('results').classList.add('show');
}

// ---------- rendering ----------
function rr(c, x, y, w, h, r) {
  c.beginPath(); c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.arcTo(x + w, y, x + w, y + r, r);
  c.lineTo(x + w, y + h - r); c.arcTo(x + w, y + h, x + w - r, y + h, r); c.lineTo(x + r, y + h);
  c.arcTo(x, y + h, x, y + h - r, r); c.lineTo(x, y + r); c.arcTo(x, y, x + r, y, r); c.closePath();
}
function drawCar(c, car, pulse) {
  const h = car.air > 0 ? Math.sin(Math.PI * (1 - car.air / car.airTotal)) : 0; // 0..1 height while airborne
  if (h > 0) { c.save(); c.translate(car.x + 10 * h, car.y + 14 * h); c.rotate(car.ang); c.scale(CAR_SCALE, CAR_SCALE); c.fillStyle = 'rgba(0,0,0,.35)'; rr(c, -13, -7, 26, 14, 4); c.fill(); c.restore(); }
  c.save(); c.translate(car.x, car.y); c.rotate(car.ang); c.scale(CAR_SCALE * (1 + 0.45 * h), CAR_SCALE * (1 + 0.45 * h));
  if (pulse !== undefined) {
    c.beginPath(); c.arc(0, 0, 28 + 6 * Math.sin(pulse * 4), 0, Math.PI * 2);
    c.strokeStyle = 'rgba(255,210,61,.8)'; c.lineWidth = 3; c.stroke();
  }
  if (ready(CAR_ART[car.sprite])) { c.drawImage(CAR_ART[car.sprite], -16, -10, 32, 20); c.restore(); return; }
  c.fillStyle = '#15171a';
  c.fillRect(-11, -9, 7, 3); c.fillRect(-11, 6, 7, 3); c.fillRect(5, -9, 7, 3); c.fillRect(5, 6, 7, 3);
  rr(c, -13, -7, 26, 14, 4); c.fillStyle = car.color; c.fill(); c.strokeStyle = 'rgba(0,0,0,.55)'; c.lineWidth = 1.5; c.stroke();
  c.fillStyle = 'rgba(20,30,40,.85)'; c.fillRect(1, -5, 6, 10);
  c.restore();
}
function drawTrackBody(c, t) {
  c.lineJoin = 'round'; c.lineCap = 'round';
  c.lineWidth = 12; c.strokeStyle = '#ece8da'; c.stroke(t.edgeL); c.stroke(t.edgeR);
  c.setLineDash([16, 16]); c.strokeStyle = '#d6443a'; c.stroke(t.edgeL); c.stroke(t.edgeR); c.setLineDash([]);
  c.fillStyle = '#4a4e56'; c.fill(t.ring, 'evenodd');
  for (const r of t.runs) { c.fillStyle = SURF[r.surf].color; c.fill(r.path); }
  c.setLineDash([18, 32]); c.strokeStyle = 'rgba(255,255,255,.14)'; c.lineWidth = 2; c.stroke(t.path); c.setLineDash([]);
  // start / finish
  { const a = t.cl[0], b = t.cl[1], ang = Math.atan2(b[1] - a[1], b[0] - a[0]), w0 = a[2], cs = w0 / 8;
    c.save(); c.translate(a[0], a[1]); c.rotate(ang);
    for (let r = 0; r < 2; r++) for (let q = 0; q < 8; q++) { c.fillStyle = (r + q) % 2 ? '#111' : '#f3f3f3'; c.fillRect((r - 1) * cs, -w0 / 2 + q * cs, cs, cs); }
    c.restore(); }
  // jump ramps: striped bar across the road
  for (const j of t.jumps) {
    const a = t.cl[j], b = t.cl[(j + 1) % t.n], ang = Math.atan2(b[1] - a[1], b[0] - a[0]), w = a[2], cs = w / 6;
    c.save(); c.translate(a[0], a[1]); c.rotate(ang);
    c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(-18, -w / 2, 10, w);
    for (let q = 0; q < 6; q++) { c.fillStyle = q % 2 ? '#1a1a1a' : '#ffcf33'; c.fillRect(-8, -w / 2 + q * cs, 16, cs); }
    c.restore();
  }
}
function render(now) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const art = TRACK_ART[trackIdx];
  if (ready(art.main)) {
    // the ground texture fills the screen, lined up with the main image so its faded edges meet the tile
    ctx.fillStyle = bgColor;
    if (ready(art.tile)) {
      const pat = ctx.createPattern(art.tile, 'repeat'), k = view.dpr * view.scale / ART_SCALE;
      pat.setTransform(new DOMMatrix([k, 0, 0, k, view.dpr * view.ox, view.dpr * view.oy]));
      ctx.fillStyle = pat;
    }
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    applyWorldTransform(ctx);
    ctx.drawImage(art.main, 0, 0, WW, WH);
  } else {
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  applyWorldTransform(ctx);
  // mown stripes
  ctx.fillStyle = 'rgba(255,255,255,.035)';
  for (let x = -400; x < WW + 400; x += 160) ctx.fillRect(x, -400, 80, WH + 800);
  if (track.def.stadium) { ctx.fillStyle = '#9a7a55'; ctx.fillRect(0, 0, WW, WH); }
  drawTrackBody(ctx, track);
  }
  // skid marks
  ctx.fillStyle = '#1c1c1c';
  for (const s of skids) { ctx.globalAlpha = s.a * 0.55; ctx.beginPath(); ctx.arc(s.x, s.y, 2.6, 0, Math.PI * 2); ctx.fill(); }
  ctx.globalAlpha = 1;
  // player line
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = phase === 'race' || phase === 'countdown' ? 0.55 : 0.95;
  ctx.drawImage(lineCanvas, 0, 0); ctx.globalAlpha = 1;
  applyWorldTransform(ctx);
  // finger marker while drawing
  if (drawing && raw.length) { const p = raw[raw.length - 1]; ctx.beginPath(); ctx.arc(p[0], p[1], 10, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fill(); }
  // ghost of the previous best run
  if (ghost && (phase === 'race' || phase === 'countdown')) {
    const g = ghostPose(phase === 'race' ? raceTime : 0);
    ctx.globalAlpha = 0.45; drawCar(ctx, { x: g[1], y: g[2], ang: g[3], color: '#ffffff', air: 0, airTotal: 1 }); ctx.globalAlpha = 1;
  }
  // cars: AI first, player on top
  if (cars.length) {
    for (let i = cars.length - 1; i >= 1; i--) drawCar(ctx, cars[i]);
    drawCar(ctx, player, phase === 'draw' && !drawing ? now / 1000 : undefined);
  }
}

// ---------- main loop ----------
function frame(now) {
  const dt = Math.min(0.04, (now - lastT) / 1000 || 0); lastT = now;
  if (phase === 'countdown') {
    countdown -= dt;
    if (countdown > 0) msg(String(Math.ceil(countdown)), 0, true);
    else { phase = 'race'; msg('Go', 700, true); }
  } else if (phase === 'race') {
    raceTime += dt;
    stepPlayer(player, dt);
    if (raceTime >= ghostNext || player.finished) { ghostRec.push([Math.round(raceTime * 1000) / 1000, Math.round(player.x), Math.round(player.y), Math.round(player.ang * 100) / 100]); ghostNext = raceTime + 0.05; }
    for (let i = 1; i < cars.length; i++) stepAI(cars[i], dt);
    for (const s of skids) s.a -= dt * 0.12;
    while (skids.length && skids[0].a <= 0) skids.shift();
    updateHud();
    if (player.finished) { updateHud(true); showResults(); }
  }
  render(now);
  requestAnimationFrame(frame);
}

// ---------- UI ----------
function unlockedCount() { try { return clamp(parseInt(localStorage.getItem('trace-racer-unlocked') || '1', 10) || 1, 1, TRACKS.length); } catch (e) { return 1; } }
function bestFor(i, l) { try { const v = parseFloat(localStorage.getItem(`trace-racer-v2-best-${i}-${l}`)); return isNaN(v) ? null : v; } catch (e) { return null; } }
function drawThumb(cv, t) {
  const c = cv.getContext('2d'), sc = cv.width / WW;
  c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, cv.width, cv.height);
  c.setTransform(sc, 0, 0, sc, 0, 0);
  const art = TRACK_ART[BUILT.indexOf(t)].main;
  if (ready(art)) c.drawImage(art, 0, 0, WW, WH); else drawTrackBody(c, t);
}
const tracksEl = $('tracks');
function buildCards() {
  tracksEl.innerHTML = '';
  const unlocked = unlockedCount();
  TRACKS.forEach((t, i) => {
    const locked = i >= unlocked;
    const b = document.createElement('button'); b.className = 'card' + (locked ? ' locked' : '');
    const cv = document.createElement('canvas'); cv.width = 320; cv.height = 180; drawThumb(cv, BUILT[i]);
    const name = document.createElement('div'); name.className = 'name'; name.textContent = t.name;
    const sub = document.createElement('div'); sub.className = 'sub';
    const best = bestFor(i, laps);
    sub.textContent = locked ? `Finish ${TRACKS[i - 1].name} to unlock` : (best !== null ? `${t.blurb} Best: ${best.toFixed(2)} s` : t.blurb);
    b.append(cv, name, sub);
    if (locked) b.disabled = true;
    else b.addEventListener('click', () => { trackIdx = i; track = BUILT[i]; resize(); goFull(); $('title').classList.remove('show'); setupRace(); });
    tracksEl.appendChild(b);
  });
}
buildCards();
document.querySelectorAll('[data-laps]').forEach(b => b.addEventListener('click', () => {
  laps = parseInt(b.dataset.laps, 10);
  document.querySelectorAll('[data-laps]').forEach(x => x.classList.toggle('on', x === b));
  buildCards();
}));
$('btn-redraw').addEventListener('click', () => { $('results').classList.remove('show'); setupRace(); });
$('btn-replay').addEventListener('click', () => { const line = player.path; $('results').classList.remove('show'); setupRace({ exact: line }); });
$('btn-share').addEventListener('click', async () => {
  const url = await shareUrl(), b = $('btn-share');
  try {
    if (navigator.share) await navigator.share({ title: 'Trace Racer line', text: `My ${laps}-lap line on ${TRACKS[trackIdx].name}: ${player.finishTime.toFixed(2)} s`, url });
    else { await navigator.clipboard.writeText(url); b.textContent = 'Link copied'; setTimeout(() => b.textContent = 'Share this line', 2000); }
  } catch (e) { try { await navigator.clipboard.writeText(url); b.textContent = 'Link copied'; setTimeout(() => b.textContent = 'Share this line', 2000); } catch (e2) { prompt('Copy this link', url); } }
});
// a shared line in the URL: offer to race it
(async () => {
  const mt = /^#l=(.+)$/.exec(location.hash), shared = mt && await decodeLine(decodeURIComponent(mt[1]));
  if (shared && shared.error) { const p = document.createElement('p'); p.textContent = shared.error; tracksEl.parentNode.insertBefore(p, tracksEl); return; }
  if (shared) {
    const row = document.createElement('div'); row.className = 'row';
    const b = document.createElement('button'); b.className = 'primary';
    b.textContent = `Race the shared line: ${TRACKS[shared.track].name}, ${shared.laps} lap${shared.laps > 1 ? 's' : ''}`;
    b.addEventListener('click', () => {
      trackIdx = shared.track; track = BUILT[trackIdx]; laps = shared.laps;
      document.querySelectorAll('[data-laps]').forEach(x => x.classList.toggle('on', parseInt(x.dataset.laps, 10) === laps));
      resize(); goFull(); $('title').classList.remove('show'); setupRace(shared.pts);
    });
    row.appendChild(b); tracksEl.parentNode.insertBefore(row, tracksEl);
  }
})();
function goTitle() {
  drawing = false;
  $('results').classList.remove('show'); $('hud').classList.add('hidden'); hideMsg();
  cars = []; player = null; raw = []; skids = [];
  lctx.setTransform(1, 0, 0, 1, 0, 0); lctx.clearRect(0, 0, lineCanvas.width, lineCanvas.height);
  phase = 'title'; buildCards(); $('title').classList.add('show');
}
$('btn-tracks').addEventListener('click', goTitle);
$('btn-quit').addEventListener('click', goTitle);
async function goFull() {
  try { if (!document.fullscreenElement && document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen({ navigationUI: 'hide' }); } catch (e) {}
  try { if (screen.orientation && screen.orientation.lock) await screen.orientation.lock('landscape'); } catch (e) {}
}

// the portrait overlay: on a touch device ask for a turn, on a desktop ask for a wider window
if (!matchMedia('(pointer: coarse)').matches) {
  $('rotate').textContent = screen.width > screen.height ? 'Maximize your browser to race' : 'Make your browser wider to race';
}

resize();
requestAnimationFrame(frame);
