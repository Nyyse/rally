// ---------- renderer: canvas, terrain bake, sprites, scene drawing ----------
const R = { cv: null, ctx: null, W: 1, H: 1, dpr: 1, t: 0, q: 'high', gs: 1, ft: 16, ftN: 0, ftT: 0 };
// 3D camera: (x,y) is the ground point it looks at; rot is the viewing direction; pitch is the angle below the horizon
const cam = { x: 0, y: 0, rot: -Math.PI / 2, pitch: 1, dist: 60, focal: 800, ppm: 12, base: 12, shake: 0, sx: 0, sy: 0, sa: 0, k: 1, ca: 1, sn: 0,
  cx: 0, cy: 0, hc: 50, fx: 0, fy: -1, rx: 1, ry: 0, cp: 0, sp: 1 };
let S = null; // current scene

function mkCanvas(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, w | 0); c.height = Math.max(1, h | 0); return c; }

function initRender() {
  R.cv = document.getElementById('game'); R.ctx = R.cv.getContext('2d');
  resizeRender(); addEventListener('resize', resizeRender);
}
function resizeRender() {
  R.W = viewW(); R.H = viewH();
  R.dpr = Math.min(devicePixelRatio || 1, R.q === 'high' ? 2 : 1.25);
  R.cv.width = Math.round(R.W * R.dpr); R.cv.height = Math.round(R.H * R.dpr);
  R.shadow = mkCanvas(R.W * .5, R.H * .5); R.shx = R.shadow.getContext('2d');
  R.light = mkCanvas(R.W * .5, R.H * .5); R.lix = R.light.getContext('2d');
  R.vig = null; cam.base = Math.min(R.W, R.H) < 600 ? Math.max(Math.sqrt(R.W * R.H) / 58, Math.min(R.W, R.H) / 32) : Math.sqrt(R.W * R.H) / 58;
}

// ---- small sprite helpers
const _soft = {};
function softSprite(col, hard) {
  const key = col + (hard || 0); if (_soft[key]) return _soft[key];
  const c = mkCanvas(64, 64), x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, hexA(col, 1)); g.addColorStop(hard || .35, hexA(col, .55)); g.addColorStop(1, hexA(col, 0));
  x.fillStyle = g; x.fillRect(0, 0, 64, 64); return (_soft[key] = c);
}

// ---- projection (world metres -> screen css px) through a pitched pinhole camera
function camDerive() {
  cam.fx = Math.cos(cam.rot); cam.fy = Math.sin(cam.rot); cam.rx = -cam.fy; cam.ry = cam.fx;
  cam.cp = Math.cos(cam.pitch); cam.sp = Math.sin(cam.pitch);
  cam.hc = cam.dist * cam.sp; const back = cam.dist * cam.cp;
  cam.cx = cam.x - cam.fx * back; cam.cy = cam.y - cam.fy * back;
  cam.ppm = cam.focal / cam.dist;
  cam.sa = -(cam.rot + Math.PI / 2); cam.ca = Math.cos(cam.sa); cam.sn = Math.sin(cam.sa); cam.k = cam.sp;
}
function proj(x, y, z, out) {
  z = z || 0;
  const dx = x - cam.cx, dy = y - cam.cy, u = dx * cam.rx + dy * cam.ry, v = dx * cam.fx + dy * cam.fy;
  const dep = Math.max(.5, v * cam.cp + (cam.hc - z) * cam.sp), up = v * cam.sp + (z - cam.hc) * cam.cp;
  out[0] = R.W / 2 + cam.focal * u / dep + cam.sx; out[1] = R.H / 2 - cam.focal * up / dep + cam.sy; out[2] = cam.focal / dep / cam.ppm; out[3] = dep;
  return out;
}
const _p = [0, 0, 1, 1], _q = [0, 0, 1, 1], _r = [0, 0, 1, 1];
// draw something flat-on-the-ground-ish at screen (X,Y): rotate by a world angle, squash by the camera tilt
function xform(ctx, X, Y, worldAng) {
  const a = (worldAng || 0) + cam.sa, c = Math.cos(a), s2 = Math.sin(a), d = R.dpr, k = cam.k;
  ctx.setTransform(c * d, s2 * k * d, -s2 * d, c * k * d, X * d, Y * d);
}
function xreset(ctx) { ctx.setTransform(R.dpr, 0, 0, R.dpr, 0, 0); }

// ---- ground layer: everything flat is painted top-down into GND, then warped into perspective strip by strip
const GND = { c: null, x: null, w: 1, h: 1, ppm: 8, vFar: 0, vNear: 0, m: [1, 0, 0, 1, 0, 0], box: [0, 0, 1, 1], sh: null, shx: null };
function vAtRow(y) { const t = (R.H / 2 - y) / cam.focal; return cam.hc * (cam.cp + t * cam.sp) / Math.max(.04, cam.sp - t * cam.cp); }
function rowOfV(v) { const t = (v * cam.sp - cam.hc * cam.cp) / (v * cam.cp + cam.hc * cam.sp); return R.H / 2 - t * cam.focal; }
function groundSetup(alloc) {
  // beyond VMAX the ground melts into haze, which keeps the ground canvas small and gives a soft horizon
  const VMAX = S && S.C.weather === 'fog' ? 85 : alloc === false ? 210 : R.q === 'high' ? 140 : 115;
  const vF = Math.min(vAtRow(-60) + 4, VMAX), vN = Math.max(.5, vAtRow(R.H + 40) - 3);
  const dF = vF * cam.cp + cam.hc * cam.sp, dN = vN * cam.cp + cam.hc * cam.sp;
  const uF = (R.W / 2 + 70) * dF / cam.focal, uN = (R.W / 2 + 70) * dN / cam.focal;
  let g = clamp(cam.focal / dN * (R.q === 'high' ? 1 : .66), 4, R.q === 'high' ? 22 : 12);
  const area = 2 * uF * (vF - vN), maxPx = (R.q === 'high' ? 2.8e6 : 1.2e6) * R.gs;
  if (area * g * g > maxPx) g = Math.sqrt(maxPx / area);
  const w = Math.ceil(2 * uF * g), h = Math.ceil((vF - vN) * g);
  if (alloc !== false && (!GND.c || GND.c.width < w || GND.c.height < h)) {
    GND.c = mkCanvas(Math.max(w, GND.c ? GND.c.width : 0) * 1.08 + 8, Math.max(h, GND.c ? GND.c.height : 0) * 1.08 + 8); GND.x = GND.c.getContext('2d');
    GND.sh = mkCanvas(GND.c.width / 2, GND.c.height / 2); GND.shx = GND.sh.getContext('2d');
  }
  GND.w = w; GND.h = h; GND.ppm = g; GND.vFar = vF; GND.vNear = vN; GND.yCut = rowOfV(vF);
  const a = g * cam.rx, c = g * cam.ry, b = -g * cam.fx, d = -g * cam.fy;
  GND.m = [a, b, c, d, w / 2 - a * cam.cx - c * cam.cy, vF * g - b * cam.cx - d * cam.cy];
  const pts = [[-uF, vF], [uF, vF], [-uN, vN], [uN, vN]].map(([u, v]) => [cam.cx + cam.rx * u + cam.fx * v, cam.cy + cam.ry * u + cam.fy * v]);
  GND.box = [Math.min(...pts.map(p => p[0])), Math.min(...pts.map(p => p[1])), Math.max(...pts.map(p => p[0])), Math.max(...pts.map(p => p[1]))];
}
function gSet(ctx, k) { const m = GND.m, s = k || 1; ctx.setTransform(m[0] * s, m[1] * s, m[2] * s, m[3] * s, m[4] * s, m[5] * s); }
function inBox(x, y, m) { const b = GND.box; return x > b[0] - m && x < b[2] + m && y > b[1] - m && y < b[3] + m; }
function warpGround(ctx) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const N = R.q === 'high' ? 130 : 76, d = R.dpr, g = GND.ppm, ys = clamp(GND.yCut + 1, 0, R.H);
  for (let i = 0; i < N; i++) {
    const y0 = ys + (R.H - ys) * i / N, y1 = ys + (R.H - ys) * (i + 1) / N;
    const v0 = vAtRow(y0), v1 = vAtRow(y1), vm = vAtRow((y0 + y1) / 2);
    const s = cam.focal / (vm * cam.cp + cam.hc * cam.sp), hu = (R.W / 2) / s;
    const gy0 = (GND.vFar - v0) * g, gy1 = (GND.vFar - v1) * g;
    ctx.drawImage(GND.c, GND.w / 2 - hu * g, gy0, 2 * hu * g, Math.max(.5, gy1 - gy0), cam.sx * d, (y0 + cam.sy) * d, R.W * d, (y1 - y0) * d + 1.2);
  }
}

// ---------- scene preparation ----------
function prepareScene(T, Wd, cond) {
  const B = BIOMES[T.ev.biome], C = CONDS[cond];
  S = { T, Wd, B, C, cond, ev: T.ev };
  const L = hyp(C.sun[0], C.sun[1]) || 1; S.sun = [C.sun[0] / L, C.sun[1] / L]; S.shLen = C.len;
  S.lightDir = [-S.sun[0], -S.sun[1]];
  bakeTerrain();
  S.gpat = groundPattern(B, T.ev.biome);
  S.rpat = { loose: roadPattern('loose'), tarmac: roadPattern('tarmac'), snow: roadPattern('snow') };
  const species = new Set(B.trees.map(t => t[0])); for (const o of Wd.objs) if (o.k === 'tree') species.add(o.sp);
  S.trees = {}; for (const sp of species) { S.trees[sp] = treeSprites(sp, B); S.trees[sp].side = treeSideSprites(sp, B); }
  S.rocks = rockSprites(B);
  S.skid = { n: 0, max: 5000, d: new Float32Array(5000 * 6) };
  S.decals = []; S.ripples = [];
  S.wind = [Math.cos(T.ev.seed % 7) * 2.2, Math.sin(T.ev.seed % 5) * 1.4];
  S.haze = Array.from({ length: 9 }, (_, i) => ({ x: 0, y: 0, z: 5 + i * 1.2, r: 16 + Math.random() * 22, init: true }));
  S.clouds = Array.from({ length: 5 }, () => ({ x: Math.random() * Wd.W, y: Math.random() * Wd.H, r: 60 + Math.random() * 70 }));
  initWeather();
  buildMinimap();
  if (GL.ok) { try { glPrepare(); } catch (e) { console.warn('GPU ground unavailable', e); GL.scene = null; } }
}

function bakeTerrain() {
  const { Wd, B, T } = S, W = Wd.W, H = Wd.H;
  const PXM = W * H > 650000 ? (R.q === 'high' ? 1.7 : 1.3) : (R.q === 'high' ? 2 : 1.5);
  const cw = Math.round(W * PXM), chh = Math.round(H * PXM);
  const c = mkCanvas(cw, chh), x = c.getContext('2d'), id = x.createImageData(cw, chh), d = id.data;
  const gcol = B.ground.map(hexRGB), sh = hexRGB(B.shade), li = hexRGB(B.light), wS = hexRGB(B.water[0]), wD = hexRGB(B.water[1]), foam = hexRGB(B.foam), shoulder = hexRGB(B.shoulder);
  const bands = Wd.bands, hgt = Wd.h, dist = Wd.dist, near = Wd.near, hw = T.width / 2;
  const n1 = makeNoise(T.ev.seed + 3), n2 = makeNoise(T.ev.seed + 5);
  const Ls = [S.lightDir[0] * .8, S.lightDir[1] * .8, 1]; const ll = Math.hypot(...Ls); Ls[0] /= ll; Ls[1] /= ll; Ls[2] /= ll;
  const flat = Ls[2];
  const roadRGB = SURF_KEYS.map(k => hexRGB(B.road[k] || B.road.gravel || '#b0a080'));
  const hAt = (gx, gy) => hgt[clamp(gy, 0, H - 1) * W + clamp(gx, 0, W - 1)];
  const frozen = B.frozen;
  const hb = (x, y) => { const gx = Math.floor(x - .5), gy = Math.floor(y - .5), fx = x - .5 - gx, fy = y - .5 - gy; return lerp(lerp(hAt(gx, gy), hAt(gx + 1, gy), fx), lerp(hAt(gx, gy + 1), hAt(gx + 1, gy + 1), fx), fy); };
  for (let py = 0; py < chh; py++) {
    const wy = (py + .5) / PXM, gy = Math.floor(wy - .5), fy = wy - .5 - gy;
    for (let px = 0; px < cw; px++) {
      const wx = (px + .5) / PXM, gx = Math.floor(wx - .5), fx = wx - .5 - gx;
      const h00 = hAt(gx, gy), h10 = hAt(gx + 1, gy), h01 = hAt(gx, gy + 1), h11 = hAt(gx + 1, gy + 1);
      const h = lerp(lerp(h00, h10, fx), lerp(h01, h11, fx), fy);
      const cell = clamp(Math.floor(wy), 0, H - 1) * W + clamp(Math.floor(wx), 0, W - 1);
      let r, g, b;
      const ni = near[cell], dd = Math.abs((wx - T.px[ni]) * -T.ty[ni] + (wy - T.py[ni]) * T.tx[ni]) + Math.max(0, dist[cell] - hw - 6);
      let wr = 0, wg = 0, wb = 0, wmix = 0;
      if (h < .12) {
        const hh = Math.min(h, 0);
        const dep = smooth(0, 3.5, -hh); r = lerp(wS[0], wD[0], dep); g = lerp(wS[1], wD[1], dep); b = lerp(wS[2], wD[2], dep);
        if (frozen) { const cr = Math.abs(n1(wx / 7, wy / 7) - .5); if (cr < .018) { r += 22; g += 22; b += 22; } const st = n2(wx / 2, wy / 22); r += (st - .5) * 14; g += (st - .5) * 14; b += (st - .5) * 10; }
        else { const f = 1 - smooth(0, .32, -hh); r = lerp(r, foam[0], f * .7); g = lerp(g, foam[1], f * .7); b = lerp(b, foam[2], f * .7); const rip = n1(wx / 5, wy / 3); r += (rip - .5) * 10; g += (rip - .5) * 12; b += (rip - .5) * 12; }
        wr = r; wg = g; wb = b; wmix = 1 - smooth(-.12, .12, h);
      }
      {
        const hw2 = h + (n1(wx / 15, wy / 15) - .5) * 1.6;
        let bi = 0; while (bi < 6 && hw2 > bands[bi]) bi++;
        const base = gcol[bi];
        const lo = bi > 0 ? bands[bi - 1] : -1e9, hi = bi < 6 ? bands[bi] : 1e9;
        const e = Math.min(hw2 - lo, hi - hw2), ink = 1 - smooth(0, .45, e);
        r = base[0]; g = base[1]; b = base[2];
        // soft blend into the next band near the upper edge
        if (bi < 6 && hi - hw2 < .25) { const nb = gcol[bi + 1], t = (1 - (hi - hw2) / .25) * .5; r = lerp(r, nb[0], t); g = lerp(g, nb[1], t); b = lerp(b, nb[2], t); }
        r *= 1 - ink * .1; g *= 1 - ink * .1; b *= 1 - ink * .08;
        // hillshade
        const gxv = (hb(wx + 1.2, wy) - hb(wx - 1.2, wy)) / 2.4, gyv = (hb(wx, wy + 1.2) - hb(wx, wy - 1.2)) / 2.4;
        const nl = 1 / Math.sqrt(gxv * gxv * 1.6 + gyv * gyv * 1.6 + 1), lam = (-gxv * 1.26 * Ls[0] - gyv * 1.26 * Ls[1] + Ls[2]) * nl - flat;
        if (lam > 0) { const t = Math.min(1, lam * 2.2); r = lerp(r, li[0], t * .5); g = lerp(g, li[1], t * .5); b = lerp(b, li[2], t * .5); }
        else { const t = Math.min(1, -lam * 2.6); r = lerp(r, sh[0], t * .62); g = lerp(g, sh[1], t * .62); b = lerp(b, sh[2], t * .62); }
        // shoulder & road base (exact lateral distance, so edges stay smooth)
        if (dd < hw + 3.6) {
          const t0 = 1 - smooth(hw - .4, hw + .3, dd), rc = roadRGB[T.surf[ni]], t1 = (1 - smooth(hw, hw + 3.6, dd)) * .62;
          r = lerp(r, shoulder[0], t1); g = lerp(g, shoulder[1], t1); b = lerp(b, shoulder[2], t1);
          r = lerp(r, rc[0], t0 * .9); g = lerp(g, rc[1], t0 * .9); b = lerp(b, rc[2], t0 * .9);
        }
        if (h < .3 && h > 0 && !frozen) { const t = 1 - h / .3; r = lerp(r, foam[0], t * .25); g = lerp(g, foam[1], t * .25); b = lerp(b, foam[2], t * .25); }
        if (wmix > 0) { r = lerp(r, wr, wmix); g = lerp(g, wg, wmix); b = lerp(b, wb, wmix); }
      }
      // watercolour granulation + blotches
      const bl = (n2(wx / 34, wy / 34) - .5) * .12, gr = (hash01(px, py) - .5) * 9;
      const k = (py * cw + px) * 4;
      d[k] = r * (1 + bl) + gr; d[k + 1] = g * (1 + bl) + gr; d[k + 2] = b * (1 + bl * .8) + gr; d[k + 3] = 255;
    }
  }
  x.putImageData(id, 0, 0);
  S.bake = c; S.PXM = PXM;
}

function groundPattern(B, biome) {
  const c = mkCanvas(256, 256), x = c.getContext('2d'), r = RNG(99 + biome.length);
  const dark = shade(B.ground[2], -.35), light = shade(B.ground[4], .25);
  if (biome === 'mesa') {
    x.lineWidth = 1.4; for (let i = 0; i < 70; i++) { x.strokeStyle = hexA(r.chance(.5) ? dark : light, .22); const y = r() * 256, x0 = r() * 256; x.beginPath(); x.moveTo(x0, y); x.quadraticCurveTo(x0 + 18, y - 5, x0 + 40, y); x.stroke(); }
  }
  for (let i = 0; i < (biome === 'frost' ? 260 : 650); i++) {
    const px = r() * 256, py = r() * 256;
    if (biome === 'frost') { x.fillStyle = hexA(r.chance(.6) ? '#ffffff' : '#9aa8cc', .5); x.fillRect(px, py, 1.4, 1.4); continue; }
    const len = r.range(2, 6), a = -Math.PI / 2 + r.sym() * .7;
    x.strokeStyle = hexA(r.chance(.55) ? dark : light, r.range(.18, .4)); x.lineWidth = r.range(.8, 1.6);
    x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a) * len, py + Math.sin(a) * len); x.stroke();
  }
  const p = R.ctx.createPattern(c, 'repeat'); return p;
}
function roadPattern(kind) {
  const c = mkCanvas(128, 128), x = c.getContext('2d'), r = RNG(kind.length * 7);
  const n = kind === 'tarmac' ? 900 : kind === 'snow' ? 300 : 700;
  for (let i = 0; i < n; i++) {
    const px = r() * 128, py = r() * 128, s = kind === 'tarmac' ? r.range(.6, 1.2) : r.range(.8, 2.4);
    x.fillStyle = kind === 'snow' ? hexA(r.chance(.5) ? '#ffffff' : '#a8b4d0', .45) : hexA(r.chance(.5) ? '#000000' : '#ffffff', kind === 'tarmac' ? .12 : r.range(.12, .3));
    x.beginPath(); x.arc(px, py, s / 2, 0, TAU); x.fill();
  }
  return R.ctx.createPattern(c, 'repeat');
}

// ---------- tree & rock sprites ----------
const POLEISH = { post: 1, lamp: 1, pole: 1, sign: 1, jboard: 1, jpost: 1, stake: 1, chev: 1, tpole: 1, slamp: 1, pump: 1 };
const TREE_LOOK = {
  pine:    { cols: ['#1d3a37', '#2a5046', '#3b6856', '#79a275'], kind: 'star', layers: [[.35, 1], [.62, .74], [.88, .46]], spikes: 11 },
  spruce:  { cols: ['#1b3044', '#284658', '#3a606c', '#7f9cae'], kind: 'star', layers: [[.3, 1], [.58, .76], [.86, .48]], spikes: 13, snow: true },
  birch:   { cols: ['#557f44', '#6f9a52', '#9bbd66', '#d7e59c'], kind: 'blob', layers: [[.55, 1], [.85, .66]], blobs: 7, trunk: '#e8e2d6' },
  birchY:  { cols: ['#a8782a', '#cf9b36', '#ebc254', '#fbe7a2'], kind: 'blob', layers: [[.55, 1], [.85, .66]], blobs: 7, trunk: '#e8e2d6' },
  oak:     { cols: ['#7e331c', '#a84e28', '#d2722e', '#f4b45c'], kind: 'blob', layers: [[.55, 1], [.8, .7], [.95, .4]], blobs: 9 },
  maple:   { cols: ['#661c22', '#91292a', '#c0412c', '#ef8150'], kind: 'blob', layers: [[.55, 1], [.8, .7], [.95, .4]], blobs: 9 },
  acacia:  { cols: ['#45552a', '#5f7032', '#828e48', '#bebc7a'], kind: 'blob', layers: [[.86, 1], [.98, .6]], blobs: 11, flat: true },
  shrub:   { cols: ['#655f36', '#827d46', '#a39b5c', '#d0c58a'], kind: 'blob', layers: [[.5, 1], [.95, .6]], blobs: 4 },
  olive:   { cols: ['#56664f', '#6f8066', '#90a083', '#c8d0b6'], kind: 'blob', layers: [[.6, 1], [.9, .62]], blobs: 8 },
  umbrella:{ cols: ['#263f2c', '#365638', '#527748', '#90ad72'], kind: 'blob', layers: [[.84, 1], [.97, .6]], blobs: 10, flat: true },
  cypress: { cols: ['#1a2c24', '#273f31', '#3a5642', '#6e8e68'], kind: 'column', layers: [[.15, 1], [.32, .95], [.5, .85], [.68, .7], [.84, .5], [.97, .26]] },
  poplar:  { cols: ['#365428', '#4c6f36', '#6d9246', '#a7c56c'], kind: 'column', layers: [[.15, 1], [.35, .95], [.55, .85], [.75, .66], [.95, .32]] },
  cactus:  { cols: ['#3e6650', '#4f7c60', '#6a9a76', '#a6c8a0'], kind: 'cactus' },
};
const SPPM = 40;
function treeSprites(sp, B) {
  const look = TREE_LOOK[sp], vars = [], ld = S.lightDir;
  if (look.kind === 'cactus') return { look, vars };
  for (let v = 0; v < 4; v++) {
    const r = RNG(sp.length * 131 + v * 17), layers = [];
    look.layers.forEach(([zf, rf], li) => {
      const rad = 1 * rf, size = Math.ceil((rad * 2.3) * SPPM * 4.8), c = mkCanvas(size, size), x = c.getContext('2d');
      x.translate(size / 2, size / 2); x.scale(SPPM * 4.8 / 4.8, SPPM * 4.8 / 4.8);
      // shapes in units where canopy radius = 4.8 * rf (scaled at draw time)
      const R0 = 4.8 * rf * .95, shape = () => {
        x.beginPath();
        if (look.kind === 'star' || look.kind === 'column') {
          const sp2 = look.spikes || 9, pts = sp2 * 2;
          for (let i = 0; i <= pts; i++) { const a = i / pts * TAU + v, rr = R0 * (i % 2 ? .72 + r() * .1 : 1 - r() * .06); i ? x.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : x.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); }
          x.closePath();
        } else {
          const nb = look.blobs || 6;
          for (let i = 0; i < nb; i++) { const a = i / nb * TAU + r() * .6, dd = R0 * (i === 0 ? 0 : r.range(.35, .55)), rr = R0 * (i === 0 ? .62 : r.range(.38, .52)); x.moveTo(Math.cos(a) * dd + rr, Math.sin(a) * dd); x.arc(Math.cos(a) * dd, Math.sin(a) * dd, rr, 0, TAU); }
        }
      };
      const cIdx = Math.min(look.cols.length - 2, li);
      shape(); x.fillStyle = look.cols[cIdx]; x.fill();
      // light side
      x.save(); x.globalCompositeOperation = 'source-atop';
      x.translate(ld[0] * R0 * .32, ld[1] * R0 * .32); shape(); x.fillStyle = look.cols[cIdx + 1]; x.fill();
      x.translate(ld[0] * R0 * .22, ld[1] * R0 * .22); x.scale(.7, .7); shape(); x.fillStyle = hexA(look.cols[3], .55); x.fill();
      x.restore();
      // shadow side wash
      x.save(); x.globalCompositeOperation = 'source-atop';
      const g = x.createLinearGradient(ld[0] * R0, ld[1] * R0, -ld[0] * R0, -ld[1] * R0); g.addColorStop(.45, 'rgba(0,0,0,0)'); g.addColorStop(1, hexA(B.shade, .45));
      x.fillStyle = g; x.fillRect(-R0 * 1.2, -R0 * 1.2, R0 * 2.4, R0 * 2.4); x.restore();
      if (look.snow) { x.save(); x.globalCompositeOperation = 'source-atop'; x.fillStyle = 'rgba(250,252,255,.92)'; for (let i = 0; i < 7; i++) { const a = r() * TAU, dd = R0 * r.range(.2, .8); x.beginPath(); x.ellipse(Math.cos(a) * dd + ld[0] * R0 * .2, Math.sin(a) * dd + ld[1] * R0 * .2, R0 * r.range(.12, .28), R0 * r.range(.08, .16), a, 0, TAU); x.fill(); } x.restore(); }
      layers.push({ c, zf, rf, size });
    });
    vars.push(layers);
  }
  return { look, vars };
}
// side-view tree sprites for the low chase camera. Normalised: x spans ±1.15 canopy radii, y spans the tree height.
// Three lighting variants per shape: light from the left, from behind/front, and from the right.
function treeSideSprites(sp, B) {
  const look = TREE_LOOK[sp]; if (!look || look.kind === 'cactus') return null;
  const W2 = 220, H2 = 300, out = [];
  for (let v = 0; v < 4; v++) {
    const set = [];
    for (const side of [-1, 0, 1]) {
      const r = RNG(sp.length * 97 + v * 31), c = mkCanvas(W2, H2), x = c.getContext('2d');
      const X = u => W2 / 2 + u * W2 / 2.3, Y = f => H2 * (1 - f); // u in canopy radii, f = height fraction
      const cols = look.cols, lightG = (x0, x1) => { const g = x.createLinearGradient(X(x0), 0, X(x1), 0); const dark = cols[0], mid = cols[1], lite = cols[2];
        if (side < 0) { g.addColorStop(0, lite); g.addColorStop(.5, mid); g.addColorStop(1, dark); } else if (side > 0) { g.addColorStop(0, dark); g.addColorStop(.5, mid); g.addColorStop(1, lite); } else { g.addColorStop(0, dark); g.addColorStop(.5, lite); g.addColorStop(1, dark); } return g; };
      const trunk = (f, w) => { x.fillStyle = look.trunk || '#4a3a34'; x.fillRect(X(-w), Y(f), X(w) - X(-w), Y(0) - Y(f)); if (look.trunk) { x.fillStyle = 'rgba(30,26,30,.6)'; for (let i = 0; i < 5; i++) x.fillRect(X(-w), Y(r() * f), X(w) - X(-w), 3); } };
      if (sp === 'pine' || sp === 'spruce') {
        trunk(.22, .07);
        const tiers = sp === 'spruce' ? 6 : 5;
        for (let i = 0; i < tiers; i++) {
          const f0 = .1 + i * (.82 / tiers), f1 = Math.min(1, f0 + .3 - i * .015), w = (1 - i / tiers * .82) * (sp === 'spruce' ? .92 : 1) * (.95 + r() * .1);
          x.fillStyle = lightG(-w, w); x.beginPath(); x.moveTo(X(0), Y(f1));
          const teeth = 7; for (let k = 0; k <= teeth; k++) { const t2 = k / teeth; x.lineTo(X(t2 * w), Y(f1 - (f1 - f0) * t2) + (k % 2 ? 4 : 0)); }
          for (let k = teeth; k >= 0; k--) { const t2 = k / teeth; x.lineTo(X(-t2 * w), Y(f1 - (f1 - f0) * t2) + (k % 2 ? 4 : 0)); }
          x.closePath(); x.fill();
          x.fillStyle = 'rgba(10,20,25,.28)'; x.beginPath(); x.moveTo(X(-w), Y(f0)); x.lineTo(X(w), Y(f0)); x.lineTo(X(w * .8), Y(f0 + .04)); x.lineTo(X(-w * .8), Y(f0 + .04)); x.fill();
          if (look.snow) { x.fillStyle = 'rgba(250,252,255,.95)'; x.beginPath(); x.moveTo(X(0), Y(f1)); x.lineTo(X(w * .55 * (side >= 0 ? 1 : .7)), Y(f1 - (f1 - f0) * .5)); x.lineTo(X(w * .2), Y(f1 - (f1 - f0) * .42)); x.lineTo(X(-w * .45), Y(f1 - (f1 - f0) * .48)); x.closePath(); x.fill(); }
        }
      } else if (look.kind === 'column') {
        trunk(.12, .1);
        x.fillStyle = lightG(-1, 1); x.beginPath(); x.moveTo(X(0), Y(1));
        x.bezierCurveTo(X(.9), Y(.75), X(1), Y(.3), X(.55), Y(.07)); x.lineTo(X(-.55), Y(.07)); x.bezierCurveTo(X(-1), Y(.3), X(-.9), Y(.75), X(0), Y(1)); x.fill();
        x.strokeStyle = 'rgba(10,20,15,.22)'; x.lineWidth = 3; for (let i = 0; i < 9; i++) { const u = r.sym() * .6, f = r.range(.15, .85); x.beginPath(); x.moveTo(X(u), Y(f)); x.quadraticCurveTo(X(u * 1.1), Y(f + .08), X(u * .8), Y(f + .16)); x.stroke(); }
      } else {
        const flat = look.flat, shrub = sp === 'shrub', tf = shrub ? 0 : flat ? .62 : sp === 'olive' ? .3 : .38, cy = shrub ? .45 : flat ? .8 : .66, ch = shrub ? .45 : flat ? .2 : .36;
        if (!shrub) trunk(tf + .05, flat ? .06 : .08);
        if (!shrub && !flat) { x.strokeStyle = look.trunk || '#4a3a34'; x.lineWidth = 6; for (const s2 of [-1, 1]) { x.beginPath(); x.moveTo(X(0), Y(tf)); x.quadraticCurveTo(X(s2 * .3), Y(tf + .1), X(s2 * .5), Y(tf + .22)); x.stroke(); } }
        const blobs = (look.blobs || 8) + 4;
        const pts = Array.from({ length: blobs }, (_, i) => ({ u: r.sym() * (flat ? .85 : .62), f: cy + r.sym() * ch * (flat ? .4 : .75), rr: r.range(.28, .48) * (flat ? .9 : 1) }));
        pts.sort((a, b2) => a.f - b2.f);
        for (const p of pts) { x.fillStyle = cols[0]; x.beginPath(); x.ellipse(X(p.u), Y(p.f), p.rr * W2 / 2.3, p.rr * W2 / 2.3 * (flat ? .55 : .85), 0, 0, TAU); x.fill(); }
        for (const p of pts) {
          const lx = side * .12 * p.rr, ly = .1 * p.rr;
          x.fillStyle = cols[1]; x.beginPath(); x.ellipse(X(p.u + lx * .5), Y(p.f + ly * .3), p.rr * .82 * W2 / 2.3, p.rr * .7 * W2 / 2.3 * (flat ? .6 : 1), 0, 0, TAU); x.fill();
          x.fillStyle = cols[2]; x.beginPath(); x.ellipse(X(p.u + lx), Y(p.f + ly), p.rr * .5 * W2 / 2.3, p.rr * .42 * W2 / 2.3 * (flat ? .6 : 1), 0, 0, TAU); x.fill();
        }
        x.fillStyle = hexA(cols[3], .5); for (const p of pts.slice(-3)) { x.beginPath(); x.ellipse(X(p.u + side * .1 * p.rr), Y(p.f + .1 * p.rr), p.rr * .25 * W2 / 2.3, p.rr * .2 * W2 / 2.3, 0, 0, TAU); x.fill(); }
      }
      set.push(c);
    }
    out.push(set);
  }
  return out;
}
function rockSprites(B) {
  const out = [];
  for (let v = 0; v < 6; v++) {
    const r = RNG(77 + v * 9), size = 192, c = mkCanvas(size, size), x = c.getContext('2d'); x.translate(size / 2, size / 2); x.scale(2.4, 2.4);
    const pts = []; const n = r.int(6, 9); for (let i = 0; i < n; i++) { const a = i / n * TAU + r.sym() * .2, rr = 32 * r.range(.7, 1); pts.push([Math.cos(a) * rr, Math.sin(a) * rr]); }
    const path = (s, ox, oy) => { x.beginPath(); pts.forEach(([a, b], i) => i ? x.lineTo(a * s + ox, b * s + oy) : x.moveTo(a * s + ox, b * s + oy)); x.closePath(); };
    const base = mixHex(B.ground[2], '#8a8a90', .55);
    path(1, 0, 0); x.fillStyle = shade(base, -.25); x.fill();
    x.save(); x.globalCompositeOperation = 'source-atop';
    path(.8, S.lightDir[0] * 8, S.lightDir[1] * 8); x.fillStyle = shade(base, .12); x.fill();
    path(.45, S.lightDir[0] * 14, S.lightDir[1] * 14); x.fillStyle = shade(base, .3); x.fill();
    if (BIOMES.frost === B) { path(.55, S.lightDir[0] * 10, S.lightDir[1] * 10); x.fillStyle = '#f6f8fc'; x.fill(); }
    x.restore();
    out.push(c);
  }
  return out;
}

// ---------- road ----------
function visibleRuns(margin) {
  const T = S.T, n = T.n, x0 = GND.box[0] - margin, x1 = GND.box[2] + margin, y0 = GND.box[1] - margin, y1 = GND.box[3] + margin;
  const vis = new Uint8Array(n); let any = false;
  for (let i = 0; i < n; i++) if (T.px[i] > x0 && T.px[i] < x1 && T.py[i] > y0 && T.py[i] < y1) { vis[i] = 1; any = true; }
  if (!any) return [];
  const runs = []; let st = -1;
  for (let i = 0; i <= n; i++) {
    const v = i < n && vis[i];
    if (v && st < 0) st = i;
    if (!v && st >= 0) { runs.push([Math.max(0, st - 1), Math.min(n - 1, i)]); st = -1; }
  }
  if (T.closed && runs.length > 1 && runs[0][0] === 0 && runs[runs.length - 1][1] === n - 1) { const last = runs.pop(); runs[0] = [last[0], runs[0][1] + n]; }
  return runs;
}
function pathRun(ctx, a, b, off) {
  const T = S.T, n = T.n; ctx.beginPath();
  for (let j = a; j <= b; j++) { const i = j % n, x = T.px[i] - T.ty[i] * off, y = T.py[i] + T.tx[i] * off; j === a ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
}
function inFord(i) { for (const f of S.T.fords) { const s = i * DS; if (s > f.s0 - 1 && s < f.s1 + 1) return true; } return false; }

function drawRoad(ctx) {
  const T = S.T, B = S.B, n = T.n, w = T.width, runs = visibleRuns(30);
  ctx.save(); gSet(ctx);
  ctx.lineJoin = 'round';
  for (const [a, b] of runs) {
    // split into surface sub-runs (and skip fords)
    const subs = []; let st = a, cur = T.surf[a % n], ford = inFord(a % n);
    for (let j = a + 1; j <= b + 1; j++) {
      const i = j % n, s2 = j <= b ? T.surf[i] : -1, f2 = j <= b ? inFord(i) : !ford;
      if (s2 !== cur || f2 !== ford) { if (!ford) subs.push([st, Math.min(j, b), SURF_KEYS[cur]]); st = j - 1; cur = s2; ford = f2; }
    }
    // shoulder
    ctx.lineCap = 'butt';
    for (const [sa, sb, k] of subs) {
      const snowy = k === 'snow' || k === 'ice';
      pathRun(ctx, sa, sb, 0); ctx.lineWidth = w + (snowy ? 4.2 : 2.8); ctx.strokeStyle = hexA(snowy ? '#ffffff' : B.shoulder, snowy ? .95 : .5); ctx.stroke();
    }
    for (const [sa, sb, k] of subs) {
      const col = B.road[k] || B.road.gravel || '#b8a080', grp = SURF[k].grp;
      ctx.lineCap = 'butt';
      pathRun(ctx, sa, sb, 0); ctx.lineWidth = w; ctx.strokeStyle = col; ctx.stroke();
      ctx.globalAlpha = grp === 'tarmac' ? .7 : .85; ctx.strokeStyle = S.rpat[grp === 'tarmac' ? 'tarmac' : grp === 'snow' ? 'snow' : 'loose']; ctx.stroke(); ctx.globalAlpha = 1;
      if (S.C.wet && grp === 'tarmac') { ctx.strokeStyle = 'rgba(160,190,220,.12)'; ctx.lineWidth = w * .6; ctx.stroke(); }
      if (grp !== 'tarmac') {
        // wheel ruts and the lighter crown between them
        for (const o of [-w * .23, w * .23]) { pathRun(ctx, sa, sb, o); ctx.lineWidth = 1.1; ctx.strokeStyle = hexA(shade(col, -.35), k === 'snow' || k === 'ice' ? .3 : .22); ctx.stroke(); }
        pathRun(ctx, sa, sb, 0); ctx.lineWidth = 1.6; ctx.strokeStyle = hexA(shade(col, .2), .2); ctx.stroke();
      } else if (T.ev.type !== 'rallycross') {
        for (const o of [-w / 2 + .45, w / 2 - .45]) { pathRun(ctx, sa, sb, o); ctx.lineWidth = .15; ctx.strokeStyle = 'rgba(246,240,224,.75)'; ctx.stroke(); }
        pathRun(ctx, sa, sb, 0); ctx.setLineDash([3, 5]); ctx.lineWidth = .14; ctx.strokeStyle = 'rgba(246,240,224,.7)'; ctx.stroke(); ctx.setLineDash([]);
      } else {
        for (const o of [-w / 2 + .3, w / 2 - .3]) { pathRun(ctx, sa, sb, o); ctx.setLineDash([1.2, 1.2]); ctx.lineWidth = .5; ctx.strokeStyle = 'rgba(232,90,80,.8)'; ctx.stroke(); ctx.setLineDash([]); }
      }
      if (k === 'snow' || k === 'ice') { // snowbank shadow on the sun side
        for (const o of [-1, 1]) { const off = o * (w / 2 + 1.6), sd = o * (S.sun[0] * -T.ty[sa % n] + S.sun[1] * T.tx[sa % n]); if (sd > 0) continue; pathRun(ctx, sa, sb, off - o * .9); ctx.lineWidth = 1; ctx.strokeStyle = hexA(B.shade, .18); ctx.stroke(); }
      }
    }
  }
  // crests: light band then shade
  for (const j of T.jumps) {
    const i = Math.round(j.s / DS); if (i >= n) continue;
    const x = T.px[i], y = T.py[i], tx = T.tx[i], ty = T.ty[i];
    for (const [o, col] of [[-2.2, 'rgba(255,248,230,.22)'], [1.6, hexA(B.shade, .2)]]) {
      ctx.beginPath(); ctx.moveTo(x + tx * o + ty * w * .55, y + ty * o - tx * w * .55); ctx.lineTo(x + tx * o - ty * w * .55, y + ty * o + tx * w * .55); ctx.lineWidth = 2.2; ctx.strokeStyle = col; ctx.stroke();
    }
  }
  // start / finish chequers
  const lines = [T.startS + 2, T.closed ? null : T.finishS].filter(v => v != null);
  for (const s of lines) {
    const i = clamp(Math.round(s / DS), 0, n - 1), x = T.px[i], y = T.py[i], tx = T.tx[i], ty = T.ty[i];
    const cells = 10, cw = w / cells;
    for (let k = 0; k < cells; k++) for (let r = 0; r < 2; r++) {
      ctx.fillStyle = (k + r) % 2 ? 'rgba(20,18,30,.85)' : 'rgba(250,246,236,.92)';
      const o = -w / 2 + k * cw, cx = x - ty * o + tx * (r - 1) * cw, cy = y + tx * o + ty * (r - 1) * cw;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx - ty * cw, cy + tx * cw); ctx.lineTo(cx - ty * cw + tx * cw, cy + tx * cw + ty * cw); ctx.lineTo(cx + tx * cw, cy + ty * cw); ctx.fill();
    }
  }
  // puddles
  if (S.Wd.puddles.length) for (const p of S.Wd.puddles) {
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.fillStyle = 'rgba(70,80,100,.35)'; ctx.beginPath(); ctx.ellipse(0, 0, p.rx, p.ry, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(200,220,240,.18)'; ctx.beginPath(); ctx.ellipse(-p.rx * .2, -p.ry * .2, p.rx * .6, p.ry * .4, 0, 0, TAU); ctx.fill(); ctx.restore();
  }
  drawSkids(ctx);
  ctx.restore();
}

// ---------- skid marks ----------
function addSkid(x1, y1, x2, y2, w, a, col) {
  if (GL.ok && GL.scene) glAddSkid(x1, y1, x2, y2, w, a, col);
  const k = S.skid, i = (k.n % k.max) * 6;
  k.d[i] = x1; k.d[i + 1] = y1; k.d[i + 2] = x2; k.d[i + 3] = y2; k.d[i + 4] = w; k.d[i + 5] = Math.round(clamp(a, 0, 1) * 3) + col * 4;
  k.n++;
}
const SKID_COLS = ['#16141c', '#3c2c22', '#7c8cb0', '#2a2a2a'];
function drawSkids(ctx) {
  const k = S.skid, cnt = Math.min(k.n, k.max), x0 = GND.box[0] - 5, x1 = GND.box[2] + 5, y0 = GND.box[1] - 5, y1 = GND.box[3] + 5;
  ctx.lineCap = 'round';
  for (let bucket = 0; bucket < 16; bucket++) {
    const al = (bucket & 3), col = bucket >> 2; if (!al) continue;
    ctx.beginPath(); let any = false, lw = .3;
    for (let j = 0; j < cnt; j++) {
      const i = j * 6; if (k.d[i + 5] !== bucket) continue;
      const ax = k.d[i], ay = k.d[i + 1]; if (ax < x0 || ax > x1 || ay < y0 || ay > y1) continue;
      ctx.moveTo(ax, ay); ctx.lineTo(k.d[i + 2], k.d[i + 3]); lw = k.d[i + 4]; any = true;
    }
    if (!any) continue;
    ctx.lineWidth = lw; ctx.strokeStyle = hexA(SKID_COLS[col], al * .09); ctx.stroke();
  }
}

// ---------- decor on the ground ----------
function drawDecor(ctx) {
  const Wd = S.Wd, dc = Wd.decor, B = S.B, HC = Wd.HC, bx = GND.box;
  const gx0 = clamp(Math.floor(bx[0] / HC), 0, Wd.hcw - 1), gx1 = clamp(Math.floor(bx[2] / HC), 0, Wd.hcw - 1);
  const gy0 = clamp(Math.floor(bx[1] / HC), 0, Wd.hch - 1), gy1 = clamp(Math.floor(bx[3] / HC), 0, Wd.hch - 1);
  const byCol = B.decorCols.map(() => []);
  for (let gy = gy0; gy <= gy1; gy++) for (let gx = gx0; gx <= gx1; gx++) for (const i of Wd.dgrid[gy * Wd.hcw + gx]) byCol[dc.c[i]].push(i);
  ctx.save(); gSet(ctx);
  const up = cam.rot; // blades point away from the camera, so they read as standing up
  byCol.forEach((list, ci) => {
    if (!list.length) return;
    ctx.fillStyle = B.decorCols[ci]; ctx.strokeStyle = B.decorCols[ci]; ctx.lineWidth = Math.max(1.1 / GND.ppm, .08);
    ctx.beginPath(); const strokes = [];
    for (const i of list) {
      const t = B.decor[dc.t[i]], X = dc.x[i], Y = dc.y[i], s = dc.s[i], rot = dc.r[i];
      if (t === 'tuft' || t === 'fern' || t === 'twig' || t === 'ripple') strokes.push(i);
      else if (t === 'stone') { ctx.moveTo(X + s * .22, Y); ctx.ellipse(X, Y, s * .22, s * .15, rot, 0, TAU); }
      else if (t === 'flower') { ctx.moveTo(X + s * .09, Y); ctx.arc(X, Y, s * .09, 0, TAU); ctx.moveTo(X + s * .47, Y + s * .2); ctx.arc(X + s * .4, Y + s * .2, s * .07, 0, TAU); }
      else if (t === 'leaf') { ctx.moveTo(X + s * .16, Y); ctx.ellipse(X, Y, s * .16, s * .08, rot, 0, TAU); }
      else if (t === 'snowlump') { ctx.moveTo(X + s * .5, Y); ctx.ellipse(X, Y, s * .5, s * .3, rot, 0, TAU); }
    }
    ctx.fill();
    if (strokes.length) {
      ctx.beginPath();
      for (const i of strokes) {
        const t = B.decor[dc.t[i]], X = dc.x[i], Y = dc.y[i], s = dc.s[i], rot = dc.r[i];
        if (t === 'ripple') { const ca = Math.cos(rot), sa = Math.sin(rot); ctx.moveTo(X - ca * s * .8, Y - sa * s * .8); ctx.quadraticCurveTo(X - sa * s * .3, Y + ca * s * .3, X + ca * s * .8, Y + sa * s * .8); continue; }
        for (let b = 0; b < 4; b++) { const a = up + (b - 1.5) * .45 + rot * .1; ctx.moveTo(X, Y); ctx.lineTo(X + Math.cos(a) * s * .55, Y + Math.sin(a) * s * .55); }
      }
      ctx.stroke();
    }
  });
  ctx.restore();
}
// ---------- shadows ----------
function shadowBlob(c, x, y, r, len) {
  c.save(); c.translate(x + S.sun[0] * len * .5, y + S.sun[1] * len * .5); c.rotate(Math.atan2(S.sun[1], S.sun[0]));
  c.drawImage(softSprite('#000000', .55), -r - len * .5, -r, r * 2 + len, r * 2); c.restore();
}
function drawShadows(list, g) {
  const c = GND.shx; c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, GND.w / 2 + 2, GND.h / 2 + 2);
  gSet(c, .5);
  const L = S.shLen;
  for (const it of list) {
    const o = it.o;
    if (it.k === 'tree') { const sl = o.h * L; shadowBlob(c, o.x + S.sun[0] * sl * .55, o.y + S.sun[1] * sl * .55, o.cr * .9, o.h * L * .35); if (o.sp !== 'shrub') shadowBlob(c, o.x, o.y, .8, 0); }
    else if (it.k === 'rock') shadowBlob(c, o.x + S.sun[0] * o.h * L * .4, o.y + S.sun[1] * o.h * L * .4, o.r, o.h * L * .3);
    else if (it.k === 'hay') shadowBlob(c, o.x + S.sun[0] * .5 * L, o.y + S.sun[1] * .5 * L, .9, .4);
    else if (it.k === 'spec') shadowBlob(c, o.x + S.sun[0] * .8 * L, o.y + S.sun[1] * .8 * L, .35, 1.6 * L);
    else if (it.k === 'house') {
      c.save(); c.fillStyle = '#000';
      const steps = 6, ca = Math.cos(o.a), sa = Math.sin(o.a);
      for (let st = 0; st <= steps; st++) {
        const ox = S.sun[0] * o.h * L * st / steps, oy = S.sun[1] * o.h * L * st / steps; c.beginPath();
        for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) c.lineTo(o.x + ca * u * o.L / 2 - sa * v * o.Wb / 2 + ox, o.y + sa * u * o.L / 2 + ca * v * o.Wb / 2 + oy);
        c.fill();
      }
      c.restore();
    }
    else if (it.k === 'car') {
      const car = it.o, P = car.P, off = .5 + car.z * 1.1, Ls = Math.max(.4, L);
      c.save(); c.translate(car.x + S.sun[0] * off * Ls, car.y + S.sun[1] * off * Ls); c.rotate(car.h);
      c.globalAlpha = it.ghost ? .3 : clamp(1 - car.z * .1, .4, 1);
      c.drawImage(softSprite('#000000', .7), -P.hl * 1.2, -P.hw * 1.35, P.hl * 2.4, P.hw * 2.7); c.restore();
    }
    else if (it.k === 'logs' || it.k === 'mill') shadowBlob(c, o.x + S.sun[0] * o.h * L * .4, o.y + S.sun[1] * o.h * L * .4, it.k === 'mill' ? 2.2 : 1.4, o.h * L * .4);
    else if (POLEISH[it.k]) {
      c.strokeStyle = '#000'; c.lineWidth = .18; c.beginPath(); c.moveTo(o.x, o.y); c.lineTo(o.x + S.sun[0] * o.h * L, o.y + S.sun[1] * o.h * L); c.stroke();
    }
  }
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = S.C.shA; g.drawImage(GND.sh, 0, 0, GND.w / 2, GND.h / 2, 0, 0, GND.w, GND.h); g.restore();
}
// ---------- standing objects ----------
function drawTree(ctx, o) {
  const TS = S.trees[o.sp]; if (!TS) return;
  const look = TS.look, ppm = cam.ppm;
  if (look.kind === 'cactus') {
    proj(o.x, o.y, 0, _p); proj(o.x, o.y, o.h, _q);
    ctx.lineCap = 'round'; ctx.strokeStyle = look.cols[1]; ctx.lineWidth = ppm * .55 * _q[2]; ctx.beginPath(); ctx.moveTo(_p[0], _p[1]); ctx.lineTo(_q[0], _q[1]); ctx.stroke();
    for (const s of [-1, 1]) { proj(o.x + s * .7, o.y, o.h * .55, _r); const ax = _r[0], ay = _r[1]; proj(o.x + s * .7, o.y, o.h * .85, _r); ctx.lineWidth = ppm * .36 * _r[2]; ctx.beginPath(); ctx.moveTo(lerp(_p[0], _q[0], .45), lerp(_p[1], _q[1], .45)); ctx.lineTo(ax, ay); ctx.lineTo(_r[0], _r[1]); ctx.stroke(); }
    ctx.fillStyle = look.cols[3]; ctx.beginPath(); ctx.arc(_q[0], _q[1], ppm * .18 * _q[2], 0, TAU); ctx.fill();
    return;
  }
  if (TS.side && cam.pitch < 1.22) { // side-view billboard between the projected base and top
    proj(o.x, o.y, 0, _p); proj(o.x, o.y, o.h, _q);
    const lu = S.lightDir[0] * cam.rx + S.lightDir[1] * cam.ry, img = TS.side[o.v][lu < -.33 ? 0 : lu > .33 ? 2 : 1];
    const dx = _q[0] - _p[0], dy = _q[1] - _p[1], len = Math.hypot(dx, dy); if (len < 2) return;
    const w = o.cr * 2.3 * ppm * (_p[2] + _q[2]) * .5, ang = Math.atan2(dx, -dy), d = R.dpr, c = Math.cos(ang), s2 = Math.sin(ang);
    ctx.setTransform(c * d, s2 * d, -s2 * d, c * d, _p[0] * d, _p[1] * d);
    ctx.drawImage(img, -w / 2, -len, w, len);
    xreset(ctx); return;
  }
  const layers = TS.vars[o.v];
  proj(o.x, o.y, 0, _p);
  if (o.sp !== 'shrub') {
    proj(o.x, o.y, o.h * (look.flat ? .82 : .5), _q);
    ctx.strokeStyle = look.trunk || '#4a3a34'; ctx.lineCap = 'round'; ctx.lineWidth = Math.max(1, ppm * _p[2] * (look.trunk ? .3 : .35));
    ctx.beginPath(); ctx.moveTo(_p[0], _p[1]); ctx.lineTo(_q[0], _q[1]); ctx.stroke();
  }
  const sc = o.cr / 4.8, far = o.cr * ppm * _p[2] < 9;
  for (let li = 0; li < layers.length; li++) {
    if (far && li !== layers.length - 2 && layers.length > 1) continue;
    const L = layers[li];
    proj(o.x, o.y, o.h * L.zf, _q);
    const size = L.size / SPPM * sc * ppm * _q[2];
    if (size < 1) continue;
    xform(ctx, _q[0], _q[1], 0); ctx.drawImage(L.c, -size / 2, -size / 2, size, size);
  }
  xreset(ctx);
}
function drawRock(ctx, o) {
  proj(o.x, o.y, o.h * .5, _q);
  const s = o.r * 2.5 * cam.ppm * _q[2];
  xform(ctx, _q[0], _q[1], o.rot); ctx.drawImage(S.rocks[o.v], -s / 2, -s / 2, s, s); xreset(ctx);
}
function poly4(ctx, pts) { ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath(); }
function drawHouse(ctx, o) {
  const H2 = S.B.house, ca = Math.cos(o.a), sa = Math.sin(o.a), rh = o.flat ? 0 : o.Wb * .45;
  const corner = (u, v, z) => { const x = o.x + ca * u * o.L / 2 - sa * v * o.Wb / 2, y = o.y + sa * u * o.L / 2 + ca * v * o.Wb / 2; return proj(x, y, z, [0, 0, 1, 1]); };
  const depthAt = (u, v, z) => corner(u, v, z)[3];
  const C = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  const base = C.map(([u, v]) => corner(u, v, 0)), top = C.map(([u, v]) => corner(u, v, o.h));
  const walls = [];
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4, mx = (base[i][0] + base[j][0]) / 2, my = (base[i][1] + base[j][1]) / 2;
    const nx = (C[i][0] + C[j][0]) / 2, ny = (C[i][1] + C[j][1]) / 2, wnx = ca * nx - sa * ny, wny = sa * nx + ca * ny;
    walls.push({ i, j, d: depthAt(nx, ny, o.h / 2), lit: -(wnx * S.sun[0] + wny * S.sun[1]) });
  }
  walls.sort((a, b) => b.d - a.d);
  for (const w of walls) {
    poly4(ctx, [base[w.i], base[w.j], top[w.j], top[w.i]]);
    ctx.fillStyle = w.lit > 0 ? shade(H2.wall, .08 + w.lit * .12) : shade(H2.wall, -.18 + w.lit * .1); ctx.fill();
    // windows
    for (const t of [.3, .7]) {
      const lerpP = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k)];
      const b0 = lerpP(base[w.i], base[w.j], t - .08), b1 = lerpP(base[w.i], base[w.j], t + .08), t0 = lerpP(top[w.i], top[w.j], t - .08), t1 = lerpP(top[w.i], top[w.j], t + .08);
      const q = [lerpP(b0, t0, .35), lerpP(b1, t1, .35), lerpP(b1, t1, .68), lerpP(b0, t0, .68)];
      poly4(ctx, q); ctx.fillStyle = o.lit ? '#ffd790' : hexA(H2.trim, .85); ctx.fill();
    }
  }
  if (o.flat) {
    poly4(ctx, top); ctx.fillStyle = shade(H2.roof, .05); ctx.fill();
    ctx.strokeStyle = shade(H2.roof, -.2); ctx.lineWidth = Math.max(1, cam.ppm * .25); ctx.stroke();
  } else {
    const r0 = corner(-1, 0, o.h + rh), r1 = corner(1, 0, o.h + rh);
    const planes = [[top[0], top[1], r1, r0, -1], [top[3], top[2], r1, r0, 1]];
    planes.sort((a, b) => depthAt(0, b[4] * .5, o.h) - depthAt(0, a[4] * .5, o.h));
    for (const [a, b, c, d, side] of planes) {
      const wnx = -sa * side, wny = ca * side, lit = -(wnx * S.sun[0] + wny * S.sun[1]);
      poly4(ctx, [a, b, c, d]); ctx.fillStyle = lit > 0 ? shade(H2.roof, .1 + lit * .15) : shade(H2.roof, -.15 + lit * .12); ctx.fill();
    }
    ctx.strokeStyle = shade(H2.roof, .25); ctx.lineWidth = Math.max(1, cam.ppm * .12); ctx.beginPath(); ctx.moveTo(r0[0], r0[1]); ctx.lineTo(r1[0], r1[1]); ctx.stroke();
  }
}
function drawSpectator(ctx, o, t) {
  const ppm = cam.ppm * 1.25, z0 = o.jz;
  proj(o.x, o.y, 1.25 + z0, _p);
  const bodyW = .3 * ppm * _p[2], bodyL = .2 * ppm * _p[2];
  ctx.save(); xform(ctx, _p[0], _p[1], o.face);
  ctx.fillStyle = o.col; ctx.beginPath(); ctx.ellipse(0, 0, bodyL, bodyW, 0, 0, TAU); ctx.fill();
  if (o.cheer > .2) { // arms up
    ctx.strokeStyle = o.col2; ctx.lineWidth = Math.max(1, ppm * .09); ctx.lineCap = 'round';
    const wave = Math.sin(t * 9 + o.ph) * .25;
    ctx.beginPath(); ctx.moveTo(0, -bodyW * .8); ctx.lineTo(bodyL * (1 + wave), -bodyW * 1.5); ctx.moveTo(0, bodyW * .8); ctx.lineTo(bodyL * (1 - wave), bodyW * 1.5); ctx.stroke();
  }
  ctx.restore(); xreset(ctx);
  proj(o.x, o.y, 1.7 + z0, _q);
  ctx.fillStyle = o.skin; ctx.beginPath(); ctx.arc(_q[0], _q[1], .12 * ppm * _q[2], 0, TAU); ctx.fill();
  if (o.hat) { ctx.fillStyle = o.hat; ctx.beginPath(); ctx.arc(_q[0], _q[1], .105 * ppm * _q[2], 0, TAU); ctx.fill(); }
  if (o.prop === 'umb') {
    proj(o.x, o.y, 2.1 + z0, _r); const rr = .62 * ppm * _r[2];
    xform(ctx, _r[0], _r[1], o.ph);
    for (let i = 0; i < 6; i++) { ctx.fillStyle = i % 2 ? o.col2 : o.col; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, rr, i / 6 * TAU, (i + 1) / 6 * TAU); ctx.fill(); }
    xreset(ctx);
  } else if (o.prop === 'flag') {
    proj(o.x, o.y, 2.7 + z0, _r);
    ctx.strokeStyle = '#3a3036'; ctx.lineWidth = Math.max(1, ppm * .05); ctx.beginPath(); ctx.moveTo(_p[0], _p[1]); ctx.lineTo(_r[0], _r[1]); ctx.stroke();
    const wv = Math.sin(t * 6 + o.ph) * .3, fl = .9 * ppm * _r[2];
    ctx.fillStyle = o.col2; ctx.beginPath(); ctx.moveTo(_r[0], _r[1]); ctx.quadraticCurveTo(_r[0] + fl * .5, _r[1] + fl * wv, _r[0] + fl, _r[1] + fl * .1); ctx.lineTo(_r[0] + fl, _r[1] + fl * .55); ctx.quadraticCurveTo(_r[0] + fl * .5, _r[1] + fl * (.5 + wv), _r[0], _r[1] + fl * .45); ctx.fill();
  } else if (o.prop === 'flare') {
    proj(o.x + Math.cos(o.face) * .3, o.y + Math.sin(o.face) * .3, 1.9 + z0, _r);
    const fl = .9 + Math.sin(t * 30 + o.ph) * .15;
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(softSprite('#ff4630'), _r[0] - ppm * fl, _r[1] - ppm * fl, ppm * 2 * fl, ppm * 2 * fl); ctx.restore();
  } else if (o.prop === 'cam' && o.flash > 0) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = o.flash; ctx.drawImage(softSprite('#ffffff'), _q[0] - ppm * 1.4, _q[1] - ppm * 1.4, ppm * 2.8, ppm * 2.8); ctx.restore();
  }
}
function drawHay(ctx, o) {
  proj(o.x, o.y, 1, _q); const r = .8 * cam.ppm * _q[2];
  proj(o.x, o.y, 0, _p);
  ctx.fillStyle = '#a8843e'; ctx.fillRect(_q[0] - r, _q[1], r * 2, Math.max(0, _p[1] - _q[1])); // the bale's side
  const k = cam.k;
  ctx.fillStyle = '#c9a85a'; ctx.beginPath(); ctx.ellipse(_q[0], _q[1], r, r * k, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#a8843e'; ctx.lineWidth = Math.max(1, cam.ppm * .08); ctx.beginPath(); ctx.ellipse(_q[0], _q[1], r * .6, r * .6 * k, 0, 0, TAU); ctx.moveTo(_q[0] + r * .3, _q[1]); ctx.ellipse(_q[0], _q[1], r * .3, r * .3 * k, 0, 0, TAU); ctx.stroke();
  ctx.fillStyle = 'rgba(255,240,200,.25)'; ctx.beginPath(); ctx.arc(_q[0] + S.lightDir[0] * r * .3, _q[1] + S.lightDir[1] * r * .3, r * .5, 0, TAU); ctx.fill();
}
function drawPoleLike(ctx, o, t) {
  proj(o.x, o.y, 0, _p); proj(o.x, o.y, o.h, _q);
  ctx.lineCap = 'round';
  if (o.k === 'pole') {
    ctx.strokeStyle = '#2f2a36'; ctx.lineWidth = Math.max(1, cam.ppm * .1); ctx.beginPath(); ctx.moveTo(_p[0], _p[1]); ctx.lineTo(_q[0], _q[1]); ctx.stroke();
    ctx.strokeStyle = '#ef7d3a'; ctx.beginPath(); ctx.moveTo(lerp(_p[0], _q[0], .75), lerp(_p[1], _q[1], .75)); ctx.lineTo(_q[0], _q[1]); ctx.stroke();
  } else if (o.k === 'sign') {
    ctx.strokeStyle = '#2f2a36'; ctx.lineWidth = Math.max(1, cam.ppm * .1); ctx.beginPath(); ctx.moveTo(_p[0], _p[1]); ctx.lineTo(_q[0], _q[1]); ctx.stroke();
    const ca = Math.cos(o.a), sa = Math.sin(o.a), w = 1.2;
    const pts = [[-w, .9], [w, .9], [w, 1.6], [-w, 1.6]].map(([u, z]) => proj(o.x + ca * u, o.y + sa * u, z, [0, 0, 1]));
    poly4(ctx, pts); ctx.fillStyle = '#f4efe2'; ctx.fill();
    ctx.fillStyle = '#25202c';
    for (let k = -1; k <= 1; k++) {
      const c = proj(o.x + ca * k * .7, o.y + sa * k * .7, 1.25, [0, 0, 1]), d = cam.ppm * .28 * c[2] * o.dir;
      ctx.beginPath(); ctx.moveTo(c[0] - d * ca, c[1] - d * sa - cam.ppm * .2); ctx.lineTo(c[0] + d * ca, c[1] + d * sa); ctx.lineTo(c[0] - d * ca, c[1] - d * sa + cam.ppm * .2); ctx.lineWidth = Math.max(1, cam.ppm * .1); ctx.strokeStyle = '#25202c'; ctx.stroke();
    }
  } else if (o.k === 'stake') {
    // a white roadside post with a black band and an amber reflector that catches the light
    const w = Math.max(1.2, cam.ppm * .12);
    ctx.strokeStyle = '#efeae0'; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(_p[0], _p[1]); ctx.lineTo(_q[0], _q[1]); ctx.stroke();
    ctx.strokeStyle = '#26222b'; ctx.beginPath(); ctx.moveTo(lerp(_p[0], _q[0], .72), lerp(_p[1], _q[1], .72)); ctx.lineTo(lerp(_p[0], _q[0], .9), lerp(_p[1], _q[1], .9)); ctx.stroke();
    ctx.fillStyle = S.C.dark > .3 ? '#ffb24a' : '#e8892e'; ctx.fillRect(lerp(_p[0], _q[0], .78) - w * .35, lerp(_p[1], _q[1], .78) - w * .5, w * .7, w);
  } else if (o.k === 'jboard') {
    // a yellow warning board on two legs, square to the oncoming car, with a crest-and-car pictogram
    const nx = -Math.sin(o.a), ny = Math.cos(o.a), w = .75, P2 = (u, z) => proj(o.x + nx * u, o.y + ny * u, z, [0, 0, 1, 1]);
    ctx.strokeStyle = '#2f2a36'; ctx.lineWidth = Math.max(1, cam.ppm * .08);
    for (const u of [-w * .7, w * .7]) { const a = P2(u, 0), b = P2(u, 1.1); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
    const q = [P2(-w, 1.05), P2(w, 1.05), P2(w, 1.95), P2(-w, 1.95)];
    poly4(ctx, q); ctx.fillStyle = '#f2c230'; ctx.fill(); ctx.lineWidth = Math.max(1, cam.ppm * .06); ctx.strokeStyle = '#1e1a22'; ctx.stroke();
    const L2 = (u0, z0, u1, z1) => { const a = P2(u0, z0), b = P2(u1, z1); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); };
    ctx.beginPath(); ctx.lineWidth = Math.max(1.2, cam.ppm * .1); ctx.lineCap = 'round';
    L2(-.6, 1.2, -.15, 1.55); L2(-.15, 1.55, .6, 1.2); // the crest
    if (o.big) { L2(-.05, 1.72, .35, 1.82); L2(.35, 1.82, .55, 1.7); } // a car in the air above it
    ctx.stroke();
  } else if (o.k === 'jpost') {
    // a tall red-and-white marker at the lip with a flag that flutters
    const n = 6;
    for (let i = 0; i < n; i++) { const a = proj(o.x, o.y, o.h * i / n, [0, 0, 1, 1]), b = proj(o.x, o.y, o.h * (i + 1) / n, [0, 0, 1, 1]); ctx.strokeStyle = i % 2 ? '#f4efe4' : '#d8473a'; ctx.lineWidth = Math.max(1.4, cam.ppm * .13); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
    const fl = Math.sin(t * 7 + o.ph) * .18, ta = o.a + Math.PI / 2;
    const f0 = proj(o.x, o.y, o.h, [0, 0, 1, 1]), f1 = proj(o.x + Math.cos(ta + fl) * .9, o.y + Math.sin(ta + fl) * .9, o.h - .25, [0, 0, 1, 1]), f2 = proj(o.x, o.y, o.h - .5, [0, 0, 1, 1]);
    ctx.fillStyle = '#f2c230'; ctx.beginPath(); ctx.moveTo(f0[0], f0[1]); ctx.lineTo(f1[0], f1[1]); ctx.lineTo(f2[0], f2[1]); ctx.closePath(); ctx.fill();
  } else if (o.k === 'lamp') {
    ctx.strokeStyle = '#2a2530'; ctx.lineWidth = Math.max(1, cam.ppm * .12); ctx.beginPath(); ctx.moveTo(_p[0], _p[1]); ctx.lineTo(_q[0], _q[1]); ctx.stroke();
    ctx.fillStyle = '#ffe2a8'; ctx.beginPath(); ctx.arc(_q[0], _q[1], cam.ppm * .25 * _q[2], 0, TAU); ctx.fill();
  }
}
function drawArch(ctx, o, t) {
  const ca = Math.cos(o.a), sa = Math.sin(o.a), nx = -sa, ny = ca, w = o.w / 2;
  const posts = [-1, 1].map(s => [proj(o.x + nx * s * w, o.y + ny * s * w, 0, [0, 0, 1]), proj(o.x + nx * s * w, o.y + ny * s * w, o.h, [0, 0, 1])]);
  ctx.strokeStyle = '#2b2634'; ctx.lineWidth = Math.max(2, cam.ppm * .35); ctx.lineCap = 'round';
  for (const [a, b] of posts) { ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
  const P4 = (u, v) => proj(o.x + nx * u + ca * v, o.y + ny * u + sa * v, o.h, [0, 0, 1]);
  const q = [P4(-w, -.7), P4(w, -.7), P4(w, .7), P4(-w, .7)];
  poly4(ctx, q); ctx.fillStyle = 'rgba(20,16,28,.35)'; ctx.fill();
  const q2 = [P4(-w, -.6), P4(w, -.6), P4(w, .6), P4(-w, .6)];
  poly4(ctx, q2); ctx.fillStyle = o.label === 'finish' ? '#f4efe2' : '#e86a56'; ctx.fill();
  const segs = 16;
  for (let k = 0; k < segs; k += 2) { const u0 = -w + 2 * w * k / segs, u1 = -w + 2 * w * (k + 1) / segs; poly4(ctx, [P4(u0, .32), P4(u1, .32), P4(u1, .6), P4(u0, .6)]); ctx.fillStyle = '#25202c'; ctx.fill(); }
  const c = P4(0, -.1);
  let ang = Math.atan2(q[1][1] - q[0][1], q[1][0] - q[0][0]); if (Math.cos(ang) < 0) ang += Math.PI;
  ctx.save(); ctx.translate(c[0], c[1]); ctx.rotate(ang);
  ctx.fillStyle = o.label === 'finish' ? '#25202c' : '#fff7ea'; ctx.font = `600 ${Math.max(8, cam.ppm * .62 * c[2])}px Jost, Futura, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(o.label === 'finish' ? 'F I N I S H' : 'S T A R T', 0, 0); ctx.restore();
}
function drawLantern(ctx, l, t) {
  if (l.got) return;
  const z = 3 + Math.sin(t * 1.4 + l.ph) * .5;
  proj(l.x, l.y, z, _q); const s = cam.ppm * _q[2];
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = .55 + .2 * Math.sin(t * 3 + l.ph);
  ctx.drawImage(softSprite('#ffb066'), _q[0] - s * 3, _q[1] - s * 3, s * 6, s * 6); ctx.restore();
  ctx.fillStyle = '#ffd9a0'; ctx.beginPath(); ctx.ellipse(_q[0], _q[1], s * .55, s * .7, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#e8643c'; ctx.fillRect(_q[0] - s * .4, _q[1] - s * .75, s * .8, s * .14); ctx.fillRect(_q[0] - s * .4, _q[1] + s * .62, s * .8, s * .14);
}

// ---------- the car ----------
// ---------- roadside furniture and landmarks ----------
const _W = [0, 0, 1, 1];
function pz(x, y, z) { return proj(x, y, z, [0, 0, 1, 1]); }
function line3(ctx, a, b) { ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
function camFacing(a) { return Math.cos(a) * cam.fx + Math.sin(a) * cam.fy; } // > 0: looking the same way the road runs here
// a yellow board on one leg with a big black arrow pointing round the corner
function drawChev(ctx, o) {
  const nx = -Math.sin(o.a), ny = Math.cos(o.a), P2 = (u, z) => pz(o.x + nx * u, o.y + ny * u, z), front = camFacing(o.a) > -.15;
  const b = P2(0, 0), t = P2(0, .8), sc = cam.ppm * (b[2] + t[2]) * .5;
  ctx.lineCap = 'round'; ctx.strokeStyle = '#2b2630'; ctx.lineWidth = Math.max(1, sc * .09); ctx.beginPath(); line3(ctx, b, t); ctx.stroke();
  const q = [P2(-.55, .78), P2(.55, .78), P2(.55, 1.45), P2(-.55, 1.45)];
  poly4(ctx, q); ctx.fillStyle = front ? '#f3c22c' : '#6d6a70'; ctx.fill(); ctx.lineWidth = Math.max(1, sc * .05); ctx.strokeStyle = '#1e1a22'; ctx.stroke();
  if (!front) return;
  const d = o.dir; ctx.beginPath(); ctx.lineWidth = Math.max(1.5, sc * .13); ctx.lineJoin = 'miter'; ctx.strokeStyle = '#1b171f';
  for (const u0 of [-.3, .02]) { const a1 = P2(u0, .9), a2 = P2(u0 + .24 * d, 1.115), a3 = P2(u0, 1.33); ctx.moveTo(a1[0], a1[1]); ctx.lineTo(a2[0], a2[1]); ctx.lineTo(a3[0], a3[1]); }
  ctx.stroke(); ctx.lineJoin = 'round';
}
// a timber telegraph pole with a cross-arm; its wires sag across to the next pole
function drawTPole(ctx, o) {
  const nx = -Math.sin(o.a), ny = Math.cos(o.a), b = pz(o.x, o.y, 0), t = pz(o.x + nx * o.lean * o.h, o.y + ny * o.lean * o.h, o.h), sc = cam.ppm * (b[2] + t[2]) * .5;
  ctx.lineCap = 'butt'; ctx.strokeStyle = '#4b3a2e'; ctx.lineWidth = Math.max(1.2, sc * .24); ctx.beginPath(); line3(ctx, b, t); ctx.stroke();
  ctx.strokeStyle = shade('#4b3a2e', .25); ctx.lineWidth = Math.max(.6, sc * .07); ctx.beginPath(); line3(ctx, [b[0] + sc * .05, b[1]], [t[0] + sc * .05, t[1]]); ctx.stroke();
  const za = o.h - .45, ax = o.x + nx * o.lean * za, ay = o.y + ny * o.lean * za;
  const a0 = pz(ax - nx * .85, ay - ny * .85, za), a1 = pz(ax + nx * .85, ay + ny * .85, za);
  ctx.strokeStyle = '#3d3028'; ctx.lineWidth = Math.max(1, sc * .14); ctx.beginPath(); line3(ctx, a0, a1); ctx.stroke();
  ctx.fillStyle = '#e8e4da'; for (const u of [-.7, .7]) { const ip = pz(ax + nx * u, ay + ny * u, za + .14); ctx.fillRect(ip[0] - sc * .05, ip[1] - sc * .1, sc * .1, sc * .14); }
  const n2 = o.next; if (!n2) return;
  const mx2 = -Math.sin(n2.a), my2 = Math.cos(n2.a);
  ctx.strokeStyle = S.C.night ? 'rgba(150,160,200,.35)' : 'rgba(28,24,34,.5)'; ctx.lineWidth = 1; ctx.beginPath();
  for (const u of [-.7, .7]) {
    const p0 = pz(ax + nx * u, ay + ny * u, za + .2), bx2 = n2.x + mx2 * n2.lean * za, by2 = n2.y + my2 * n2.lean * za, p1 = pz(bx2 + mx2 * u, by2 + my2 * u, za + .2);
    const pm = pz((ax + nx * u + bx2 + mx2 * u) / 2, (ay + ny * u + by2 + my2 * u) / 2, za - .75);
    if (p0[3] < 1 || p1[3] < 1) continue;
    ctx.moveTo(p0[0], p0[1]); ctx.quadraticCurveTo(2 * pm[0] - (p0[0] + p1[0]) / 2, 2 * pm[1] - (p0[1] + p1[1]) / 2, p1[0], p1[1]);
  }
  ctx.stroke();
}
// fences, walls and snow fences; once knocked down only the stumps and a fallen rail are left
function drawFence(ctx, o) {
  const b0 = pz(o.x0, o.y0, 0), b1 = pz(o.x1, o.y1, 0), sc = cam.ppm * (b0[2] + b1[2]) * .5, H = o.h;
  if (o.broken) {
    ctx.strokeStyle = o.st === 'wall' ? '#8e8474' : '#5a4636'; ctx.lineWidth = Math.max(1, sc * (o.st === 'wall' ? .35 : .12)); ctx.lineCap = 'round'; ctx.beginPath();
    if (o.st === 'wall') { const m = pz(lerp(o.x0, o.x1, .5) + o.v - .5, lerp(o.y0, o.y1, .5), .1); line3(ctx, b0, m); }
    else { line3(ctx, b0, pz(o.x0, o.y0, .3)); line3(ctx, b1, pz(o.x1, o.y1, .3)); const r0 = pz(o.x0 + (o.v - .5) * 1.5, o.y0 + .6, .05), r1 = pz(o.x1 + .4, o.y1 + (o.v - .5) * 1.8, .05); line3(ctx, r0, r1); }
    ctx.stroke(); return;
  }
  if (o.st === 'wall') {
    const dx = o.x1 - o.x0, dy = o.y1 - o.y0, l = hyp(dx, dy) || 1, nx = -dy / l * .28, ny = dx / l * .28;
    const lit = -(nx * S.sun[0] + ny * S.sun[1]) / .28, toCam = -(nx * cam.fx + ny * cam.fy) > 0 ? 1 : -1;
    const f = [pz(o.x0 + nx * toCam, o.y0 + ny * toCam, 0), pz(o.x1 + nx * toCam, o.y1 + ny * toCam, 0), pz(o.x1 + nx * toCam, o.y1 + ny * toCam, H), pz(o.x0 + nx * toCam, o.y0 + ny * toCam, H)];
    poly4(ctx, f); ctx.fillStyle = shade('#a39883', lit * toCam * .12 - .05); ctx.fill();
    const tp = [pz(o.x0 + nx, o.y0 + ny, H), pz(o.x1 + nx, o.y1 + ny, H), pz(o.x1 - nx, o.y1 - ny, H), pz(o.x0 - nx, o.y0 - ny, H)];
    poly4(ctx, tp); ctx.fillStyle = '#c8bda5'; ctx.fill();
    ctx.fillStyle = 'rgba(60,50,45,.28)'; for (let i = 0; i < 4; i++) { const u = (i + .5 + (o.v - .5) * .6) / 4, z = .2 + ((i * 7 + o.v * 10) % 3) * .2, p = pz(lerp(o.x0, o.x1, u) + nx * toCam * 1.05, lerp(o.y0, o.y1, u) + ny * toCam * 1.05, z); ctx.fillRect(p[0] - sc * .2, p[1] - sc * .06, sc * .4, sc * .1); }
    return;
  }
  const t0 = pz(o.x0, o.y0, H), t1 = pz(o.x1, o.y1, H);
  if (o.st === 'snowf') {
    const q = [pz(o.x0, o.y0, .1), pz(o.x1, o.y1, .1), t1, t0]; poly4(ctx, q); ctx.fillStyle = 'rgba(226,86,46,.72)'; ctx.fill();
    ctx.strokeStyle = 'rgba(150,40,20,.55)'; ctx.lineWidth = 1; ctx.beginPath(); for (const z of [.4, .7, 1]) line3(ctx, pz(o.x0, o.y0, z), pz(o.x1, o.y1, z)); ctx.stroke();
  }
  ctx.lineCap = 'butt';
  ctx.strokeStyle = o.st === 'wire' ? '#5c4c40' : o.st === 'snowf' ? '#3a3238' : '#5a4434'; ctx.lineWidth = Math.max(1, sc * (o.st === 'wire' ? .09 : .13));
  ctx.beginPath(); line3(ctx, b0, pz(o.x0, o.y0, H + .1)); ctx.stroke();
  if (o.st === 'rail') {
    ctx.strokeStyle = '#8c6c4e'; ctx.lineWidth = Math.max(1, sc * .1); ctx.beginPath(); for (const z of [.45, .95]) line3(ctx, pz(o.x0, o.y0, z), pz(o.x1, o.y1, z + (o.v - .5) * .08)); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,235,200,.25)'; ctx.lineWidth = Math.max(.5, sc * .03); ctx.beginPath(); for (const z of [.5, 1]) line3(ctx, pz(o.x0, o.y0, z), pz(o.x1, o.y1, z)); ctx.stroke();
  } else if (o.st === 'wire') {
    ctx.strokeStyle = 'rgba(40,36,40,.5)'; ctx.lineWidth = 1; ctx.beginPath(); for (const z of [.4, .72, 1.02]) line3(ctx, pz(o.x0, o.y0, z), pz(o.x1, o.y1, z - .04)); ctx.stroke();
  }
}
let _bankSpr = null;
function bankSprite(v) {
  if (!_bankSpr) {
    _bankSpr = [];
    for (let k = 0; k < 4; k++) {
      const c = mkCanvas(200, 80), x = c.getContext('2d'), r = RNG(911 + k * 37);
      const lumps = Array.from({ length: 4 + (k & 1) }, (_, i) => ({ cx: 30 + i * (140 / (3 + (k & 1))) + r.sym() * 10, rx: 34 + r() * 22, ry: 22 + r() * 26 }));
      const shape = () => { x.beginPath(); for (const l of lumps) { x.moveTo(l.cx + l.rx, 80); x.ellipse(l.cx, 80, l.rx, l.ry, 0, Math.PI, TAU); } };
      const g = x.createLinearGradient(0, 20, 0, 80); g.addColorStop(0, '#ffffff'); g.addColorStop(.6, '#eef2f9'); g.addColorStop(1, 'rgba(214,224,240,0)');
      shape(); x.fillStyle = g; x.fill();
      x.save(); x.globalCompositeOperation = 'source-atop'; x.fillStyle = 'rgba(160,178,210,.35)';
      for (const l of lumps) { x.beginPath(); x.ellipse(l.cx + l.rx * .35, 80, l.rx * .7, l.ry * .8, 0, Math.PI, TAU); x.fill(); }
      x.restore();
      _bankSpr.push(c);
    }
  }
  return _bankSpr[v];
}
function drawBank(ctx, o) {
  const b = pz(o.x, o.y, 0), w = 1.6 * o.s * cam.ppm * b[2];
  if (w < 1) return;
  const hh = w * (.28 + .18 * cam.cp);
  ctx.drawImage(bankSprite((o.v * 4) | 0), b[0] - w, b[1] - hh * .82, w * 2, hh);
}
// a street lamp whose arm reaches out over the road
function drawSLamp(ctx, o) {
  const nx = -Math.sin(o.a), ny = Math.cos(o.a), b = pz(o.x, o.y, 0), t = pz(o.x, o.y, o.h), sc = cam.ppm * (b[2] + t[2]) * .5;
  const ex = o.x - nx * o.side * 1.7, ey = o.y - ny * o.side * 1.7, e = pz(ex, ey, o.h - .15), m = pz(o.x - nx * o.side * .9, o.y - ny * o.side * .9, o.h + .25);
  ctx.lineCap = 'round'; ctx.strokeStyle = '#34303a'; ctx.lineWidth = Math.max(1, sc * .13); ctx.beginPath(); line3(ctx, b, t); ctx.quadraticCurveTo(m[0], m[1], e[0], e[1]); ctx.stroke();
  const lit = S.C.dark > .25;
  ctx.fillStyle = lit ? '#fff0c4' : '#cfcac2'; ctx.beginPath(); ctx.ellipse(e[0], e[1] + sc * .06, Math.max(1.5, sc * .28), Math.max(1, sc * .1), 0, 0, TAU); ctx.fill();
  if (lit) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = .55 * S.C.dark; const r = sc * 2.2; ctx.drawImage(softSprite('#ffd890'), e[0] - r, e[1] - r, r * 2, r * 2); ctx.restore(); }
}
// a stack of cut logs, round ends towards you
function drawLogs(ctx, o) {
  const ca = Math.cos(o.a), sa = Math.sin(o.a), nx = -sa, ny = ca, hl = o.L / 2, rows = [[.24, [-.66, -.22, .22, .66]], [.62, [-.44, 0, .44]], [1, [-.22, .22]]];
  const endSign = (ca * cam.fx + sa * cam.fy) > 0 ? -1 : 1; // the end facing the camera
  for (const [z, us] of rows) {
    const kf = nx * cam.fx + ny * cam.fy, sorted = us.slice().sort((a, b) => (b - a) * kf); // far logs first
    for (const u of sorted) {
      const A = pz(o.x + nx * u - ca * hl, o.y + ny * u - sa * hl, z), Bp = pz(o.x + nx * u + ca * hl, o.y + ny * u + sa * hl, z), r = .23 * cam.ppm * (A[2] + Bp[2]) * .5;
      ctx.lineCap = 'butt'; ctx.strokeStyle = '#6a4a34'; ctx.lineWidth = Math.max(1, r * 2); ctx.beginPath(); line3(ctx, A, Bp); ctx.stroke();
      ctx.strokeStyle = o.snow && z > .9 ? '#f4f7fd' : '#8a6446'; ctx.lineWidth = Math.max(.6, r * .7); ctx.beginPath(); line3(ctx, [A[0], A[1] - r * .55], [Bp[0], Bp[1] - r * .55]); ctx.stroke();
      const E = endSign > 0 ? Bp : A; ctx.fillStyle = '#d9bb8c'; ctx.beginPath(); ctx.arc(E[0], E[1], Math.max(1, r * .95), 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(120,80,50,.6)'; ctx.lineWidth = Math.max(.5, r * .15); ctx.beginPath(); ctx.arc(E[0], E[1], r * .5, 0, TAU); ctx.stroke();
    }
  }
}
// a whitewashed tower mill whose sails turn slowly over the fields
function drawMill(ctx, o, t) {
  const b = pz(o.x, o.y, 0), tp = pz(o.x, o.y, o.h), sb = cam.ppm * b[2], st = cam.ppm * tp[2];
  const fx = Math.cos(o.a), fy = Math.sin(o.a), px = -fy, py = fx, hubZ = o.h - .4, hub = [o.x + fx * 1.7, o.y + fy * 1.7];
  const sailsFront = -(fx * cam.fx + fy * cam.fy) > 0, lu = S.lightDir[0] * cam.rx + S.lightDir[1] * cam.ry;
  const sails = () => {
    const th = o.ph + t * o.spd;
    for (let i = 0; i < 4; i++) {
      const a = th + i * Math.PI / 2, ca2 = Math.cos(a), sa2 = Math.sin(a), cb = Math.cos(a + Math.PI / 2), sb2 = Math.sin(a + Math.PI / 2);
      const P = (r, w) => pz(hub[0] + px * (r * ca2 + w * cb), hub[1] + py * (r * ca2 + w * cb), hubZ + r * sa2 + w * sb2);
      const h0 = P(0, 0), h1 = P(6.6, 0);
      ctx.strokeStyle = '#4a3a32'; ctx.lineWidth = Math.max(1, st * .14); ctx.beginPath(); line3(ctx, h0, h1); ctx.stroke();
      poly4(ctx, [P(1.3, .12), P(6.4, .12), P(6.4, 1.05), P(1.3, .95)]); ctx.fillStyle = 'rgba(240,230,212,.88)'; ctx.fill();
      ctx.strokeStyle = 'rgba(80,64,54,.55)'; ctx.lineWidth = 1; ctx.beginPath(); for (let r = 2.3; r < 6.4; r += 1) line3(ctx, P(r, .12), P(r, 1)); line3(ctx, P(1.3, .55), P(6.4, .6)); ctx.stroke();
    }
    const hp = pz(hub[0], hub[1], hubZ); ctx.fillStyle = '#3a2e28'; ctx.beginPath(); ctx.arc(hp[0], hp[1], Math.max(1.5, st * .3), 0, TAU); ctx.fill();
  };
  if (!sailsFront) sails();
  const g = ctx.createLinearGradient(b[0] - sb * 2.2, 0, b[0] + sb * 2.2, 0), lite = '#f2ebdd', dark = '#b9ad9c';
  g.addColorStop(0, lu < 0 ? lite : dark); g.addColorStop(.55, lu < 0 ? '#e1d8c8' : '#e1d8c8'); g.addColorStop(1, lu < 0 ? dark : lite);
  ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(b[0] - sb * 2.1, b[1]); ctx.lineTo(tp[0] - st * 1.35, tp[1]); ctx.lineTo(tp[0] + st * 1.35, tp[1]); ctx.lineTo(b[0] + sb * 2.1, b[1]); ctx.closePath(); ctx.fill();
  const dw = pz(o.x - fx * 0, o.y, 1.1); ctx.fillStyle = '#4b3a34'; ctx.fillRect(dw[0] - sb * .4, dw[1] - sb * .3, sb * .8, sb * 1.5);
  const wn = pz(o.x, o.y, o.h * .6); ctx.fillStyle = '#3e3436'; ctx.fillRect(wn[0] - st * .25, wn[1] - st * .35, st * .5, st * .6);
  const cap = pz(o.x, o.y, o.h + 1.8); ctx.fillStyle = '#5c4238'; ctx.beginPath(); ctx.moveTo(tp[0] - st * 1.6, tp[1]); ctx.quadraticCurveTo(tp[0] - st * 1.2, cap[1], cap[0], cap[1]); ctx.quadraticCurveTo(tp[0] + st * 1.2, cap[1], tp[0] + st * 1.6, tp[1]); ctx.closePath(); ctx.fill();
  if (sailsFront) sails();
}
// an iron wind pump: a lattice tower with a fan of blades and a tail vane
function drawPump(ctx, o, t) {
  const fx = Math.cos(o.a), fy = Math.sin(o.a), px = -fy, py = fx, b = pz(o.x, o.y, 0), tp = pz(o.x, o.y, o.h), sb = cam.ppm * b[2], st = cam.ppm * tp[2];
  ctx.strokeStyle = '#5a5250'; ctx.lineWidth = Math.max(1, st * .1); ctx.lineCap = 'round'; ctx.beginPath();
  const L0 = [b[0] - sb * 1.3, b[1]], R0 = [b[0] + sb * 1.3, b[1]], L1 = [tp[0] - st * .3, tp[1]], R1 = [tp[0] + st * .3, tp[1]];
  line3(ctx, L0, L1); line3(ctx, R0, R1);
  for (let i = 0; i < 5; i++) { const f0 = i / 5, f1 = (i + 1) / 5, l = [lerp(L0[0], L1[0], f0), lerp(L0[1], L1[1], f0)], r = [lerp(R0[0], R1[0], f1), lerp(R0[1], R1[1], f1)], l2 = [lerp(L0[0], L1[0], f1), lerp(L0[1], L1[1], f1)], r2 = [lerp(R0[0], R1[0], f0), lerp(R0[1], R1[1], f0)]; line3(ctx, l, r); line3(ctx, r2, l2); }
  ctx.stroke();
  const hz = o.h + .3, hub = [o.x + fx * .5, o.y + fy * .5], th = o.ph + t * o.spd;
  const tail0 = pz(o.x - fx * .2, o.y - fy * .2, hz), tail1 = pz(o.x - fx * 2.4, o.y - fy * 2.4, hz + .1);
  ctx.strokeStyle = '#4a4442'; ctx.lineWidth = Math.max(1, st * .08); ctx.beginPath(); line3(ctx, tail0, tail1); ctx.stroke();
  const v = [pz(o.x - fx * 1.7, o.y - fy * 1.7, hz - .5), pz(o.x - fx * 2.5, o.y - fy * 2.5, hz - .5), pz(o.x - fx * 2.5, o.y - fy * 2.5, hz + .7), pz(o.x - fx * 1.7, o.y - fy * 1.7, hz + .4)];
  poly4(ctx, v); ctx.fillStyle = '#b8b2aa'; ctx.fill();
  ctx.fillStyle = '#d7d0c4'; ctx.strokeStyle = '#6a625c'; ctx.lineWidth = 1;
  for (let i = 0; i < 16; i++) {
    const a = th + i / 16 * TAU, P = (r, da) => pz(hub[0] + px * r * Math.cos(a + da), hub[1] + py * r * Math.cos(a + da), hz + r * Math.sin(a + da));
    const q = [P(.45, 0), P(1.75, -.05), P(1.75, .17), P(.45, .12)]; poly4(ctx, q); ctx.fill(); ctx.stroke();
  }
  const hp = pz(hub[0], hub[1], hz); ctx.fillStyle = '#3e3836'; ctx.beginPath(); ctx.arc(hp[0], hp[1], Math.max(1.2, st * .2), 0, TAU); ctx.fill();
}

function drawCarBody(ctx, spec, liv, scale, opts) {
  const s = spec.s, L = s.L, W = s.W, hl = L / 2, hw = W / 2, Lv = LIVERIES[liv] || LIVERIES[0];
  const nose = s.nose, tail = s.tail;
  const body = () => {
    ctx.beginPath();
    ctx.moveTo(-hl + .2, -hw * (1 - tail));
    ctx.quadraticCurveTo(-hl, -hw * (1 - tail), -hl, -hw * (1 - tail) + .3);
    ctx.lineTo(-hl, hw * (1 - tail) - .3);
    ctx.quadraticCurveTo(-hl, hw * (1 - tail), -hl + .2, hw * (1 - tail));
    if (s.flares) { ctx.lineTo(-hl + .45, hw); ctx.lineTo(hl - .7, hw); } else ctx.lineTo(-hl + .5, hw);
    ctx.lineTo(hl - .55, hw);
    ctx.quadraticCurveTo(hl, hw, hl, hw * (1 - nose));
    ctx.lineTo(hl, -hw * (1 - nose));
    ctx.quadraticCurveTo(hl, -hw, hl - .55, -hw);
    ctx.lineTo(-hl + .5, -hw); ctx.closePath();
  };
  // wheels
  const wb = s.wb / 2, wx = [wb + (s.mid ? -.05 : .05), -wb], tw = hw - .1;
  if (!opts.noWheels) {
    ctx.fillStyle = '#1c1a22';
    for (let i = 0; i < 2; i++) for (const sd of [-1, 1]) {
      ctx.save(); ctx.translate(wx[i], sd * tw); if (i === 0) ctx.rotate(opts.delta || 0);
      ctx.fillRect(-.32, -.11, .64, .22); ctx.restore();
    }
  }
  if (opts.silhouette) { body(); ctx.fillStyle = shade(Lv.base, -.42); ctx.fill(); return; }
  // body
  body(); ctx.fillStyle = Lv.base; ctx.fill();
  ctx.save(); body(); ctx.clip();
  // livery pattern
  ctx.fillStyle = Lv.stripe;
  if (s.pat === 'stripes') { ctx.fillRect(-hl, -.36, L, .22); ctx.fillRect(-hl, .14, L, .22); }
  else if (s.pat === 'band') { ctx.fillRect(-.35, -hw, .7, W); ctx.fillStyle = Lv.accent; ctx.fillRect(-.1, -hw, .2, W); }
  else if (s.pat === 'sash') { ctx.beginPath(); ctx.moveTo(-hl * .2, -hw); ctx.lineTo(hl * .45, -hw); ctx.lineTo(-hl * .05, hw); ctx.lineTo(-hl * .7, hw); ctx.fill(); ctx.fillStyle = Lv.accent; ctx.beginPath(); ctx.moveTo(hl * .45, -hw); ctx.lineTo(hl * .62, -hw); ctx.lineTo(hl * .12, hw); ctx.lineTo(-hl * .05, hw); ctx.fill(); }
  else if (s.pat === 'chevron') { ctx.beginPath(); ctx.moveTo(hl, -hw); ctx.lineTo(hl * .4, 0); ctx.lineTo(hl, hw); ctx.lineTo(hl * .7, hw); ctx.lineTo(hl * .1, 0); ctx.lineTo(hl * .7, -hw); ctx.fill(); }
  else if (s.pat === 'split') { ctx.fillRect(hl * .1, -hw, hl, W); ctx.fillStyle = Lv.accent; ctx.fillRect(hl * .05, -hw, .14, W); }
  // curvature shading: darker flanks, lighter spine
  const g = ctx.createLinearGradient(0, -hw, 0, hw);
  g.addColorStop(0, 'rgba(10,8,20,.32)'); g.addColorStop(.25, 'rgba(255,255,255,.04)'); g.addColorStop(.5, 'rgba(255,255,255,.12)'); g.addColorStop(.75, 'rgba(255,255,255,.04)'); g.addColorStop(1, 'rgba(10,8,20,.32)');
  ctx.fillStyle = g; ctx.fillRect(-hl, -hw, L, W);
  if (s.louvers) { ctx.fillStyle = 'rgba(20,16,26,.5)'; for (let i = 0; i < 6; i++) ctx.fillRect(-hl + .35 + i * .16, -hw * .5, .07, hw); }
  if (s.scoop) { ctx.fillStyle = 'rgba(20,16,26,.55)'; ctx.fillRect(hl * .38, -.18, .4, .36); }
  ctx.restore();
  // edge line
  body(); ctx.lineWidth = .05; ctx.strokeStyle = 'rgba(20,16,26,.5)'; ctx.stroke();
  // front lights & light pods
  ctx.fillStyle = '#f6efd8';
  for (const sd of [-1, 1]) { ctx.beginPath(); ctx.ellipse(hl - .08, sd * (hw - .25), .07, .16, 0, 0, TAU); ctx.fill(); }
  if (s.pods) { ctx.fillStyle = '#f7e2a0'; const n = s.pods; for (let i = 0; i < n; i++) { const yy = (i - (n - 1) / 2) * .34; ctx.beginPath(); ctx.arc(hl + .05, yy, .11, 0, TAU); ctx.fill(); ctx.strokeStyle = '#2a2530'; ctx.lineWidth = .03; ctx.stroke(); } }
  if (opts.deck) return;
  // tail lights
  ctx.fillStyle = opts.brake ? '#ff4a3a' : '#a8302c';
  for (const sd of [-1, 1]) ctx.fillRect(-hl - .02, sd * (hw - .3) - .14, .07, .28);
  // mud flaps
  ctx.fillStyle = '#2a2530'; for (const sd of [-1, 1]) ctx.fillRect(-wb - .45, sd * (hw - .18) - .12, .06, .24);
}
function drawCabin(ctx, spec, liv, opts) {
  const s = spec.s, L = s.L, W = s.W, hl = L / 2, Lv = LIVERIES[liv] || LIVERIES[0];
  const c0 = -hl + L * s.cab[0], c1 = -hl + L * s.cab[1], rw = W * s.roofW / 2, len = c1 - c0;
  // glasshouse
  ctx.beginPath(); ctx.moveTo(c0, -rw + .05); ctx.lineTo(c1 - .1, -rw - .02); ctx.quadraticCurveTo(c1 + .05, 0, c1 - .1, rw + .02); ctx.lineTo(c0, rw - .05); ctx.closePath();
  ctx.fillStyle = '#26303f'; ctx.fill();
  // windscreen highlight
  ctx.fillStyle = 'rgba(190,215,235,.35)'; ctx.beginPath(); ctx.moveTo(c1 - len * .28, -rw * .8); ctx.lineTo(c1 - .12, -rw * .7); ctx.lineTo(c1 - .12, -rw * .2); ctx.lineTo(c1 - len * .24, -rw * .3); ctx.fill();
  // roof
  const r0 = c0 + len * .14, r1 = c1 - len * .3;
  ctx.beginPath(); ctx.roundRect ? ctx.roundRect(r0, -rw + .1, r1 - r0, rw * 2 - .2, .18) : ctx.rect(r0, -rw + .1, r1 - r0, rw * 2 - .2);
  ctx.fillStyle = s.roofCol ? Lv.stripe : Lv.base; ctx.fill();
  const g = ctx.createLinearGradient(0, -rw, 0, rw); g.addColorStop(0, 'rgba(10,8,20,.22)'); g.addColorStop(.5, 'rgba(255,255,255,.14)'); g.addColorStop(1, 'rgba(10,8,20,.22)');
  ctx.fillStyle = g; ctx.fill();
  // roof number panel
  const mx = (r0 + r1) / 2, nw = Math.min(.62, (r1 - r0) * .8);
  ctx.fillStyle = '#f7f1e3'; ctx.beginPath(); ctx.ellipse(mx, 0, nw / 2, Math.min(.36, rw * .55), 0, 0, TAU); ctx.fill();
  ctx.save(); ctx.translate(mx, 0); ctx.rotate(Math.PI / 2); ctx.scale(.02, .02); ctx.fillStyle = '#25202c'; ctx.font = '600 23px Jost, Futura, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(opts.num ?? spec.num), 0, 1.5); ctx.restore();
  if (s.wing) {
    const wy = s.wing >= 3 ? W * .52 : W * .46, wx = -hl + .18 + (s.wing >= 2 ? 0 : .1);
    ctx.fillStyle = s.wing >= 2 ? Lv.accent : Lv.base; ctx.fillRect(wx - (s.wing >= 3 ? .2 : .1), -wy, s.wing >= 3 ? .34 : .18, wy * 2);
  }
}
// the race car: a small low-poly body projected through the real camera, so the chase view sees
// flanks, a rear panel with tail lights, a raked glasshouse and wheels in their arches
const CARZ = { sill: .22, belt: .76, roof: 1.36 };
const _shc = new Map();
function shadeC(h, t) { const k = h + (t * 50 | 0); let v = _shc.get(k); if (!v) { v = shade(h, (t * 50 | 0) / 50); _shc.set(k, v); } return v; }
function carGeo(spec) {
  if (spec._geo) return spec._geo;
  const s = spec.s, hl = s.L / 2, hw = s.W / 2, hwN = hw * (1 - s.nose), hwT = hw * (1 - s.tail * .7), cf = Math.min(.5, .24 + s.nose * 1.3);
  const nm = hwN + (hw - hwN) * .6;
  const out = [[hl - cf, -hw], [hl - cf * .35, -nm], [hl, -hwN], [hl, hwN], [hl - cf * .35, nm], [hl - cf, hw], [-hl + .45, hw], [-hl + .1, hwT], [-hl, hwT - .14], [-hl, -(hwT - .14)], [-hl + .1, -hwT], [-hl + .45, -hw]];
  const c0 = -hl + s.L * s.cab[0], c1 = -hl + s.L * s.cab[1], len = c1 - c0, rw = s.W * s.roofW / 2;
  const belt = CARZ.belt - (s.L < 3.4 ? .06 : 0), roof = CARZ.roof - (s.L < 3.4 ? .06 : 0) - (s.mid ? .1 : 0);
  const cab = { b: [[c0, -rw], [c1, -rw], [c1, rw], [c0, rw]], t: [[c0 + len * .16, -(rw - .12)], [c1 - len * .34, -(rw - .12)], [c1 - len * .34, rw - .12], [c0 + len * .16, rw - .12]] };
  return (spec._geo = { hl, hw, hwT, out, cab, belt, roof, wb: s.wb / 2 });
}
const _V = Array.from({ length: 64 }, () => [0, 0, 1, 1]);
// set the canvas transform so local car metres (u forward, v left) at height z land where the camera puts them
function affineAt(P3, u, v, z) {
  const o = P3(u, v, z, true), ox = o[0], oy = o[1], a = P3(u + .5, v, z, true), ax = (a[0] - ox) * 2, ay = (a[1] - oy) * 2, b = P3(u, v + .5, z, true), bx = (b[0] - ox) * 2, by = (b[1] - oy) * 2, d = R.dpr;
  _ctxT(ax * d, ay * d, bx * d, by * d, (ox - ax * u - bx * v) * d, (oy - ay * u - by * v) * d);
}
let _ctxT = () => { };
function drawCar(ctx, car, spec, liv, opts) {
  if (CGL.ok && !opts.flat && drawCarGL(ctx, car, spec, liv, opts)) return;
  const G3 = carGeo(spec), s = spec.s, Lv = LIVERIES[liv] || LIVERIES[0];
  const ch = Math.cos(car.h), sh = Math.sin(car.h), X = car.x, Y = car.y, Z = car.z || 0, Zb = clamp((car.heave || 0) * .3, -.12, .06);
  const kr = clamp(car.roll || 0, -1.4, 1.4) * .042, kp = clamp(car.pitch || 0, -1.3, 1.3) * .022;
  const brake = (car.brk > .3 || car.hand) && !opts.ghost, sun = S && S.sun ? S.sun : [.5, .5];
  let vi = 0;
  const P3 = (u, v, z, body) => { const o = _V[vi++ & 63]; return proj(X + ch * u - sh * v, Y + sh * u + ch * v, Z + z + (body ? Zb + v * kr + u * kp : 0), o); };
  const area = q => { let a = 0; for (let i = 0; i < q.length; i++) { const A = q[i], B = q[(i + 1) % q.length]; a += A[0] * B[1] - B[0] * A[1]; } return a; };
  const path = q => { ctx.beginPath(); ctx.moveTo(q[0][0], q[0][1]); for (let i = 1; i < q.length; i++) ctx.lineTo(q[i][0], q[i][1]); ctx.closePath(); };
  const fill = (q, col) => { path(q); ctx.fillStyle = col; ctx.fill(); };
  // light on a face whose outward plan normal is (nu, nv) in car space
  const lit = (nu, nv) => { const wx = ch * nu - sh * nv, wy = sh * nu + ch * nv; return -(wx * sun[0] + wy * sun[1]); };
  ctx.save(); xreset(ctx); ctx.globalAlpha = opts.alpha ?? 1; ctx.lineJoin = 'round';
  _ctxT = (a, b, c, d, e, f) => ctx.setTransform(a, b, c, d, e, f);
  const O = G3.out, n = O.length, zb = CARZ.sill, zt = G3.belt;
  const bot = O.map(([u, v]) => P3(u, v, zb, true).slice()), top = O.map(([u, v]) => P3(u * .985, v * .965, zt, true).slice());
  const ref = Math.sign(area(top)) || 1, vis = q => Math.sign(area(q)) === ref;
  const flank = shadeC(Lv.base, -.16), dark = '#1d1a24';
  // wheels first on the far side are hidden by the body; near-side wheels are drawn over the flank below
  const wheel = (u, sd, steer) => {
    const v = sd * (G3.hw - .02), r = .31, cd = Math.cos(steer), sd2 = Math.sin(steer), pts = [];
    for (let k = 0; k < 10; k++) { const a = k / 10 * TAU, du = Math.cos(a) * r, dz = Math.sin(a) * r; pts.push(P3(u + du * cd, v + du * sd2, r + dz, false).slice()); }
    return pts;
  };
  const wx = [G3.wb + (s.mid ? -.05 : .05), -G3.wb];
  // tyres as dark blocks: their bottoms show under the sills from every angle, so the car sits on the road
  const wl = []; for (let w = 0; w < 2; w++) for (const sd of [-1, 1]) wl.push([w, sd, P3(wx[w], sd * (G3.hw - .14), .3, false)[3]]);
  wl.sort((a, b) => b[2] - a[2]);
  for (const [w, sd] of wl) {
    const st = w === 0 ? car.delta || 0 : 0, cs = Math.cos(st), sn = Math.sin(st), u = wx[w], vc = sd * (G3.hw - .14);
    const cor = []; for (const [a, b] of [[-.3, -.11], [.3, -.11], [.3, .11], [-.3, .11]]) for (const z of [0, .56]) cor.push(P3(u + a * cs - b * sn, vc + a * sn + b * cs, z, false).slice());
    // corners: [i*2] bottom, [i*2+1] top for the four plan corners (CCW)
    for (let i = 0; i < 4; i++) { const j = (i + 1) % 4, q = [cor[i * 2], cor[j * 2], cor[j * 2 + 1], cor[i * 2 + 1]]; if (vis(q)) fill(q, i % 2 ? '#2a2631' : '#1b1820'); }
    fill([cor[1], cor[3], cor[5], cor[7]], '#2c2833');
  }
  // lower body: flanks, nose and tail panels
  const sides = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, q = [bot[i], bot[j], top[j], top[i]];
    if (!vis(q)) continue;
    const du = O[j][0] - O[i][0], dv = O[j][1] - O[i][1], L = Math.hypot(du, dv) || 1, nu = dv / L, nv = -du / L;
    sides.push({ q, i, nu, nv });
  }
  for (const f of sides) {
    const l = lit(f.nu, f.nv);
    fill(f.q, shadeC(f.i === 8 || f.i === 2 ? Lv.base : Lv.base, -.2 + l * .14 + (f.i === 8 ? -.04 : 0)));
    // a darker sill along the bottom of every panel
    const sq = [f.q[0], f.q[1], [lerp(f.q[1][0], f.q[2][0], .22), lerp(f.q[1][1], f.q[2][1], .22)], [lerp(f.q[0][0], f.q[3][0], .22), lerp(f.q[0][1], f.q[3][1], .22)]];
    fill(sq, 'rgba(22,18,30,.55)');
    if (Math.abs(f.nv) > .9) { // long flanks: wheels in their arches, a livery stripe
      const sd = f.nv > 0 ? 1 : -1;
      if (s.pat === 'stripes' || s.pat === 'split') { const a = .58, b = .74; fill([[lerp(f.q[0][0], f.q[3][0], a), lerp(f.q[0][1], f.q[3][1], a)], [lerp(f.q[1][0], f.q[2][0], a), lerp(f.q[1][1], f.q[2][1], a)], [lerp(f.q[1][0], f.q[2][0], b), lerp(f.q[1][1], f.q[2][1], b)], [lerp(f.q[0][0], f.q[3][0], b), lerp(f.q[0][1], f.q[3][1], b)]], Lv.stripe); }
      for (let w = 0; w < 2; w++) {
        const arch = []; for (let k = 0; k < 6; k++) { const a = Math.PI * k / 5; arch.push(P3(wx[w] + Math.cos(a) * (s.flares ? .46 : .4), sd * (G3.hw + .01), .31 + Math.sin(a) * (s.flares ? .46 : .4), true).slice()); }
        arch.push(P3(wx[w] - (s.flares ? .46 : .4), sd * (G3.hw + .01), .1, true).slice()); arch.unshift(P3(wx[w] + (s.flares ? .46 : .4), sd * (G3.hw + .01), .1, true).slice());
        fill(arch, '#14111a');
        const tq = wheel(wx[w], sd, w === 0 ? car.delta || 0 : 0); fill(tq, '#24212b');
        const hc = P3(wx[w], sd * (G3.hw - .02), .31, false), hub = tq.map(p => [lerp(p[0], hc[0], .42), lerp(p[1], hc[1], .42)]);
        fill(hub, s.mid || spec.cls >= 4 ? '#d8d2c6' : '#8e8a96');
      }
    }
    if (f.i === 8) { // tail panel: bumper, tail lights, plate
      const T = (u, v, z) => P3(u, v, z, true).slice(), hwT = G3.hwT - .14, u0 = -G3.hl - .015;
      fill([T(u0, -hwT, zb), T(u0, hwT, zb), T(u0, hwT, zb + .14), T(u0, -hwT, zb + .14)], '#1f1b26');
      fill([T(u0, -.24, zb + .17), T(u0, .24, zb + .17), T(u0, .24, zb + .29), T(u0, -.24, zb + .29)], '#efe8d8');
      for (const sd of [-1, 1]) {
        const a = sd * (hwT - .04), b = sd * (hwT - .4), z0 = zt - .27, z1 = zt - .07;
        const q = [T(u0, a, z0), T(u0, b, z0), T(u0, b, z1), T(u0, a, z1)];
        fill(q, brake ? '#ff5a3e' : '#b4302a');
        const q2 = [T(u0, a, z0 + .06), T(u0, lerp(a, b, .45), z0 + .06), T(u0, lerp(a, b, .45), z1 - .05), T(u0, a, z1 - .05)];
        fill(q2, brake ? '#ffd2a8' : '#e2584a');
        if (car.rev) fill([T(u0, b, z0), T(u0, b + sd * .12 * -1, z0), T(u0, b + sd * .12 * -1, z1), T(u0, b, z1)], '#f6f2ff');
      }
    }
    if (f.i === 2) { // nose: grille and lamps
      const T = (u, v, z) => P3(u, v, z, true).slice(), hn = O[2][1], u0 = G3.hl + .015;
      fill([T(u0, hn, zb), T(u0, -hn, zb), T(u0, -hn, zb + .15), T(u0, hn, zb + .15)], '#1f1b26');
      fill([T(u0, .3, zt - .3), T(u0, -.3, zt - .3), T(u0, -.3, zt - .14), T(u0, .3, zt - .14)], '#2a2532');
      for (const sd of [-1, 1]) fill([T(u0, sd * (Math.abs(hn) - .05), zt - .3), T(u0, sd * (Math.abs(hn) - .34), zt - .3), T(u0, sd * (Math.abs(hn) - .34), zt - .1), T(u0, sd * (Math.abs(hn) - .05), zt - .1)], '#f6efd8');
    }
  }
  // the deck (bonnet and boot lid) carries the livery: drawn as a flat plane through the camera
  // fill the true projected outline, then paint the livery through a local affine fit clipped to it
  fill(top, shadeC(Lv.base, .03));
  ctx.save(); path(top); ctx.clip();
  affineAt(P3, 0, 0, zt); ctx.scale(.985, .965);
  drawCarBody(ctx, spec, liv, 1, { noWheels: true, deck: true });
  ctx.restore(); xreset(ctx);
  // glasshouse: pillars in body colour with glass inset, roof on top
  const C = G3.cab, cb = C.b.map(([u, v]) => P3(u, v, zt - .01, true).slice()), ct = C.t.map(([u, v]) => P3(u, v, G3.roof, true).slice());
  const glass = S && S.B ? shadeC(mixHex('#1f2836', S.B.sky[2], .22), -.05) : '#253042', glassHi = 'rgba(214,228,240,.3)';
  const cfaces = [];
  for (let i = 0; i < 4; i++) { const j = (i + 1) % 4, q = [cb[i], cb[j], ct[j], ct[i]]; if (vis(q)) cfaces.push({ q, i }); }
  for (const f of cfaces) {
    const nrm = [[0, -1], [1, 0], [0, 1], [-1, 0]][f.i], l = lit(nrm[0], nrm[1]);
    fill(f.q, shadeC(s.roofCol ? Lv.stripe : Lv.base, -.12 + l * .12));
    const ins = (p, c, t) => [lerp(p[0], c[0], t), lerp(p[1], c[1], t)];
    const cx = (f.q[0][0] + f.q[1][0] + f.q[2][0] + f.q[3][0]) / 4, cy = (f.q[0][1] + f.q[1][1] + f.q[2][1] + f.q[3][1]) / 4;
    const k = f.i === 1 || f.i === 3 ? .13 : .1;
    const gq = f.q.map(p => ins(p, [cx, cy], k)); gq[0] = ins(f.q[0], [cx, cy], k * .6); gq[1] = ins(f.q[1], [cx, cy], k * .6);
    fill(gq, glass);
    // a sky reflection across the upper glass
    const hq = [ins(gq[3], gq[0], .05), ins(gq[2], gq[1], .05), ins(gq[2], gq[1], f.i === 1 ? .55 : .35), ins(gq[3], gq[0], f.i === 1 ? .35 : .55)];
    fill(hq, glassHi);
  }
  // roof
  fill(ct, shadeC(s.roofCol ? Lv.stripe : Lv.base, .04));
  ctx.save(); affineAt(P3, (C.t[0][0] + C.t[1][0]) / 2, 0, G3.roof);
  const rl = C.t[1][0] - C.t[0][0], rww = C.t[2][1], nw = Math.min(.6, rl * .8);
  ctx.fillStyle = '#f7f1e3'; ctx.beginPath(); ctx.ellipse(0, 0, nw / 2, Math.min(.34, rww * .6), 0, 0, TAU); ctx.fill();
  ctx.translate(0, 0); ctx.rotate(Math.PI / 2); ctx.scale(.02, .02); ctx.fillStyle = '#25202c'; ctx.font = '600 23px Jost, Futura, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(opts.num ?? spec.num), 0, 1.5);
  ctx.restore(); xreset(ctx);
  // rear wing: posts and a blade above the boot
  if (s.wing) {
    const hi = s.wing >= 2, wu = -G3.hl + (s.wing >= 3 ? .22 : hi ? .3 : .12), wz = zt + (s.wing >= 3 ? .34 : hi ? .24 : .05), ww = (s.wing >= 3 ? G3.hw * 1.0 : G3.hw * .84);
    if (hi) for (const sd of [-.6, .6]) { const a = P3(wu, sd * ww, zt, true), ax = a[0], ay = a[1], b = P3(wu, sd * ww, wz, true); ctx.strokeStyle = '#25202c'; ctx.lineWidth = Math.max(1, cam.ppm * .06 * b[2]); ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
    const d = s.wing >= 3 ? .34 : hi ? .2 : .1;
    const bl = [P3(wu - d / 2, -ww, wz, true).slice(), P3(wu + d / 2, -ww, wz + .03, true).slice(), P3(wu + d / 2, ww, wz + .03, true).slice(), P3(wu - d / 2, ww, wz, true).slice()];
    const edge = [P3(wu - d / 2, -ww, wz - .07, true).slice(), P3(wu - d / 2, ww, wz - .07, true).slice(), bl[3], bl[0]];
    fill(edge, shadeC(hi ? Lv.accent : Lv.base, -.3));
    fill(bl, hi ? Lv.accent : Lv.base);
  }
  ctx.restore(); xreset(ctx);
}

// ---------- mini-map ----------
function buildMinimap() {
  const T = S.T, c = mkCanvas(300, 300), x = c.getContext('2d'), sc = 260 / Math.max(T.W, T.H);
  S.mm = { c, sc, ox: (300 - T.W * sc) / 2, oy: (300 - T.H * sc) / 2 };
  x.translate(S.mm.ox, S.mm.oy); x.scale(sc, sc);
  x.lineJoin = x.lineCap = 'round';
  x.beginPath(); for (let i = 0; i < T.n; i++) i ? x.lineTo(T.px[i], T.py[i]) : x.moveTo(T.px[i], T.py[i]); if (T.closed) x.closePath();
  x.strokeStyle = 'rgba(25,23,38,.55)'; x.lineWidth = 9 / sc; x.stroke();
  x.strokeStyle = 'rgba(244,236,220,.85)'; x.lineWidth = 3.2 / sc; x.stroke();
  if (!T.closed) { x.fillStyle = '#f2cf73'; x.beginPath(); x.arc(T.px[T.n - 1], T.py[T.n - 1], 6 / sc, 0, TAU); x.fill(); }
}
