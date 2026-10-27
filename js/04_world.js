// ---------- world generation (pure data, no DOM) ----------
const TREE_SPECS = {
  pine:    { h: [10, 17], cr: [2.3, 3.3], tr: .4 },  birch:  { h: [8, 13], cr: [2, 2.9], tr: .3 },
  spruce:  { h: [9, 15],  cr: [2.1, 3],   tr: .4 },  oak:    { h: [9, 13], cr: [3.4, 4.8], tr: .55 },
  maple:   { h: [8, 12],  cr: [3, 4.3],   tr: .45 }, birchY: { h: [8, 12], cr: [2.2, 3.2], tr: .3 },
  acacia:  { h: [5, 7],   cr: [3.4, 4.8], tr: .35 }, shrub:  { h: [1.2, 2], cr: [1, 1.8], tr: 0 },
  cactus:  { h: [2.4, 4.2], cr: [.45, .6], tr: .38 }, olive: { h: [4, 6], cr: [2.2, 3.1], tr: .4 },
  cypress: { h: [9, 14],  cr: [1, 1.4],   tr: .4 },  umbrella: { h: [8, 11], cr: [3.4, 4.8], tr: .45 },
  poplar:  { h: [14, 20], cr: [1.6, 2.2], tr: .45 },
};
const SPEC_COLS = ['#d8584a', '#f2c45a', '#5f8fd0', '#f1ebdf', '#3f6f5a', '#e68a3a', '#8a5aa8', '#2f3a5a', '#e9a8b0', '#9ec9c4', '#c4432c', '#ffffff'];
const SKINS = ['#f1c9a5', '#d9a47c', '#b07a52', '#8a5a3a', '#5e3b26', '#f6dcc0'];

function heightFn(biome, nz, W, H, rng) {
  const sd = rng() * TAU, dx = Math.cos(sd), dy = Math.sin(sd);
  switch (biome) {
    case 'pines': return (x, y) => (fbm(nz, x / 230, y / 230, 4) - .43) * 72;
    case 'mesa': return (x, y) => {
      const raw = Math.max(0, (fbm(nz, x / 270, y / 270, 4) - .3) * 95), t = raw / 7, fl = Math.floor(t);
      return (fl + smooth(.7, 1, t - fl)) * 7 + 1;
    };
    case 'frost': return (x, y) => { const r = 1 - Math.abs(2 * fbm(nz, x / 160 + 9, y / 160, 3) - 1); return (fbm(nz, x / 250, y / 250, 4) - .45) * 58 + r * r * 26; };
    case 'coast': return (x, y) => {
      const p = ((x - W / 2) * dx + (y - H / 2) * dy) / (.5 * Math.max(W, H));
      return (fbm(nz, x / 220, y / 220, 4) - .32) * 46 - smooth(.15, 1.05, p) * 46;
    };
    case 'ember': return (x, y) => (fbm(nz, x / 200, y / 200, 4) - .4) * 62;
    default: return (x, y) => (fbm(nz, x / 140, y / 140, 3) - .25) * 9;
  }
}

function buildWorld(T) {
  const ev = T.ev, B = BIOMES[ev.biome], rng = RNG(ev.seed ^ 0x5bd1e995), hw = T.width / 2;
  const W = T.W, H = T.H, N = W * H;
  const Wd = { T, B, W, H, ev };
  // ---- distance field to the road (nearest sample per 1 m cell)
  const near = new Int32Array(N).fill(-1), dist = new Float32Array(N).fill(1e9);
  for (let i = 0; i < T.n; i++) {
    const cx = Math.floor(T.px[i]), cy = Math.floor(T.py[i]);
    for (let oy = -2; oy <= 2; oy++) for (let ox = -2; ox <= 2; ox++) {
      const x = cx + ox, y = cy + oy; if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const c = y * W + x, d = hyp(x + .5 - T.px[i], y + .5 - T.py[i]);
      if (d < dist[c]) { dist[c] = d; near[c] = i; }
    }
  }
  const relax = (c, nb, x, y) => { const j = near[nb]; if (j < 0) return; const d = hyp(x + .5 - T.px[j], y + .5 - T.py[j]); if (d < dist[c]) { dist[c] = d; near[c] = j; } };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = y * W + x;
    if (x > 0) relax(c, c - 1, x, y);
    if (y > 0) { relax(c, c - W, x, y); if (x > 0) relax(c, c - W - 1, x, y); if (x < W - 1) relax(c, c - W + 1, x, y); }
  }
  for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) {
    const c = y * W + x;
    if (x < W - 1) relax(c, c + 1, x, y);
    if (y < H - 1) { relax(c, c + W, x, y); if (x < W - 1) relax(c, c + W + 1, x, y); if (x > 0) relax(c, c + W - 1, x, y); }
  }
  Wd.near = near; Wd.dist = dist;

  // ---- heights
  const nz = makeNoise(ev.seed + 11), nz2 = makeNoise(ev.seed + 29), hf = heightFn(ev.biome, nz, W, H, rng);
  const CS = 4, cw = Math.ceil(W / CS) + 2, ch = Math.ceil(H / CS) + 2, coarse = new Float32Array(cw * ch);
  for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) coarse[j * cw + i] = hf(i * CS, j * CS);
  const detail = { pines: 1.3, mesa: .5, frost: 1, coast: 1.1, ember: 1.5, clay: .5 }[ev.biome];
  const h = new Float32Array(N);
  const isFord = i => { const s = i * DS; for (const f of T.fords) if (s > f.s0 - 6 && s < f.s1 + 6) return f; return null; };
  const fordPts = T.fords.map(f => { const i = Math.round(f.s / DS); return { x: T.px[i], y: T.py[i], tx: T.tx[i], ty: T.ty[i] }; });
  const hill = ev.type === 'hillclimb';
  // smooth road-bed profile along the track, grade-limited
  const bedS = new Float32Array(T.n);
  for (let i = 0; i < T.n; i++) bedS[i] = Math.max(1.2, lerp(coarse[Math.floor(T.py[i] / CS) * cw + Math.floor(T.px[i] / CS)], 2, .35));
  const tmp = new Float32Array(T.n);
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i < T.n; i++) { let s = 0, c = 0; for (let j = -15; j <= 15; j++) { let q = i + j; if (T.closed) q = (q + T.n) % T.n; else if (q < 0 || q >= T.n) continue; s += bedS[q]; c++; } tmp[i] = s / c; }
    bedS.set(tmp);
  }
  for (let i = 1; i < T.n; i++) bedS[i] = clamp(bedS[i], bedS[i - 1] - .12, bedS[i - 1] + .12);
  for (let i = T.n - 2; i >= 0; i--) bedS[i] = clamp(bedS[i], bedS[i + 1] - .12, bedS[i + 1] + .12);
  for (let i = 0; i < T.n; i++) bedS[i] = Math.max(1.2, bedS[i]);
  for (let y = 0; y < H; y++) {
    const gy = y / CS, j0 = Math.floor(gy), fy = gy - j0;
    for (let x = 0; x < W; x++) {
      const gx = x / CS, i0 = Math.floor(gx), fx = gx - i0, k = j0 * cw + i0;
      let v = lerp(lerp(coarse[k], coarse[k + 1], fx), lerp(coarse[k + cw], coarse[k + cw + 1], fx), fy);
      v += (nz2(x / 9, y / 9) - .5) * detail;
      const c = y * W + x, d = dist[c];
      // road bed: blend toward the road's own gentle height, always above water
      const ri = 1 - smooth(hw + 1.5, hw + 22, d);
      if (ri > 0) {
        v = lerp(v, bedS[near[c]], ri);
      }
      // fords: a shallow stream crossing the road
      if (d < 96) for (const f of fordPts) {
        const ox = x + .5 - f.x, oy = y + .5 - f.y, along = ox * f.tx + oy * f.ty, across = -ox * f.ty + oy * f.tx;
        if (Math.abs(across) > 90) continue;
        const w = 6.5 + Math.abs(across) * .03, a = Math.abs(along - Math.sin(across * .05) * 6);
        if (a < w + 9) v = Math.min(v, lerp(-.42, v, smooth(w - 2, w + 9, a)));
      }
      if (hill) v += (H - y) * .25;
      h[c] = v;
    }
  }
  Wd.h = h;
  // band thresholds from land heights
  const samp = [];
  for (let c = 0; c < N; c += 37) if (h[c] > .3) samp.push(h[c]);
  samp.sort((a, b) => a - b);
  const q = p => samp.length ? samp[Math.floor(p * (samp.length - 1))] : p * 10;
  Wd.bands = [.12, .27, .42, .57, .72, .87].map(q);

  // ---- helpers
  const cellAt = (x, y) => clamp(Math.floor(y), 0, H - 1) * W + clamp(Math.floor(x), 0, W - 1);
  Wd.cellAt = cellAt;
  Wd.heightAt = (x, y) => h[cellAt(x, y)];
  // keep-clear circles, bucketed so thousands of them stay cheap to test
  const EXC = 16, exw = Math.ceil(W / EXC) + 2, exGrid = new Map();
  const excl = { push(e) {
    for (let gy = Math.floor((e.y - e.r) / EXC); gy <= Math.floor((e.y + e.r) / EXC); gy++) for (let gx = Math.floor((e.x - e.r) / EXC); gx <= Math.floor((e.x + e.r) / EXC); gx++) {
      const k = gy * exw + gx; let b = exGrid.get(k); if (!b) exGrid.set(k, b = []); b.push(e);
    } } };
  const excluded = (x, y) => { const b = exGrid.get(Math.floor(y / EXC) * exw + Math.floor(x / EXC)); if (!b) return false; for (const e of b) if (hyp(x - e.x, y - e.y) < e.r) return true; return false; };
  const objs = []; Wd.objs = objs;
  const roadPos = (s, off) => { const i = clamp(Math.round(s / DS), 0, T.n - 1); return { x: T.px[i] - T.ty[i] * off, y: T.py[i] + T.tx[i] * off, i, a: Math.atan2(T.ty[i], T.tx[i]) }; };

  // ---- spectators
  const specs = []; Wd.specs = specs; Wd.tapes = [];
  const night = CONDS[ev.cond].night, wet = ev.cond === 'rain', isX = ev.type === 'rallycross';
  if (ev.type !== 'roam') {
    const spots = [];
    for (const nt of T.notes) if ((nt.kind === 'corner' && 'H123'.includes(nt.grade)) || nt.kind === 'jump') spots.push(nt);
    if (isX) for (let s = 30; s < T.len; s += rng.range(70, 110)) spots.push({ kind: 'x', s, e: s + 30 });
    let last = -999;
    for (const sp of spots) {
      const mid = (sp.s + sp.e) / 2;
      if (mid - last < (isX ? 60 : 130) || mid < 60 || mid > T.len - 40) continue;
      if (!isX && rng() < .25) continue;
      last = mid;
      const i = Math.round(mid / DS), inside = sp.kind === 'corner' ? sign(T.k[i]) : rng.chance(.5) ? 1 : -1;
      const side = rng.chance(isX ? .5 : .78) ? inside : -inside;
      const L = isX ? rng.range(30, 46) : rng.range(16, 34), s0 = mid - L / 2, s1 = mid + L / 2;
      const tapeOff = hw + (isX ? 4 : 3);
      const tape = [];
      for (let s = s0; s <= s1; s += 2) { const p = roadPos(s, side * tapeOff); tape.push([p.x, p.y]); }
      Wd.tapes.push({ pts: tape, night });
      const cnt = Math.round(L * rng.range(.45, .8) * (isX ? 1.4 : 1));
      for (let k = 0; k < cnt; k++) {
        const s = rng.range(s0, s1), off = tapeOff + rng.range(1.2, isX ? 9 : 7), p = roadPos(s, side * off);
        const prop = night ? (rng.chance(.18) ? 'flare' : rng.chance(.2) ? 'torch' : null) : wet ? (rng.chance(.55) ? 'umb' : null) : rng.chance(.12) ? 'flag' : rng.chance(.12) ? 'cam' : null;
        specs.push({ x: p.x, y: p.y, hx: p.x, hy: p.y, nx: -T.ty[p.i] * side, ny: T.tx[p.i] * side, col: rng.pick(SPEC_COLS), col2: rng.pick(SPEC_COLS), skin: rng.pick(SKINS),
          hat: rng.chance(.4) ? rng.pick(SPEC_COLS) : null, prop, ph: rng() * TAU, st: 0, vx: 0, vy: 0, jz: 0, cheer: 0, face: Math.atan2(-T.tx[p.i] * side, T.ty[p.i] * side) });
      }
      const c = roadPos(mid, side * (tapeOff + 4)); excl.push({ x: c.x, y: c.y, r: L / 2 + 7 });
      if (night) { const lp = roadPos(mid + rng.sym() * L * .3, side * (tapeOff + 9)); objs.push({ k: 'lamp', x: lp.x, y: lp.y, h: 4.5, r: .2, c: false }); }
    }
  }
  // ---- jumps: warning boards on the approach, striped marker posts at the lip, bales along the landing
  for (const j of T.jumps) {
    for (const sd of [-1, 1]) {
      const b = roadPos(j.s - 42, sd * (hw + 2.2)); if (dist[cellAt(b.x, b.y)] > hw + 1.2) objs.push({ k: 'jboard', x: b.x, y: b.y, r: .15, h: 1.9, c: false, a: b.a, big: j.big });
      const q = roadPos(j.s, sd * (hw + 1.3)); if (dist[cellAt(q.x, q.y)] > hw + .6) objs.push({ k: 'jpost', x: q.x, y: q.y, r: .12, h: 3.2, c: false, a: q.a, ph: rng() * TAU });
      for (let d = j.L2 + 2; d < j.L2 + 14; d += 1.8) { const h2 = roadPos(j.s + d, sd * (hw + 2.4)); if (dist[cellAt(h2.x, h2.y)] > hw + 1.4) objs.push({ k: 'hay', x: h2.x, y: h2.y, r: .8, h: 1, c: true, soft: true, a: h2.a }); }
    }
    const c = roadPos(j.s, 0); excl.push({ x: c.x, y: c.y, r: 14 });
  }
  // ---- chicanes: staggered walls of round bales, plus one on each shoulder so nobody drives round them
  for (const ch of T.chicanes) {
    for (const [gs, side] of [[ch.s, ch.sd], [ch.s + ch.gap, -ch.sd]]) {
      for (const off of [hw - .8, hw - 2.3, hw + .9]) { const p = roadPos(gs, side * off); objs.push({ k: 'hay', x: p.x, y: p.y, r: .8, h: 1, c: true, soft: true, a: p.a, chic: true }); }
      const o = roadPos(gs, -side * (hw + 1.1)); objs.push({ k: 'hay', x: o.x, y: o.y, r: .8, h: 1, c: true, soft: true, a: o.a, chic: true });
      const c = roadPos(gs, 0); excl.push({ x: c.x, y: c.y, r: 9 });
    }
  }
  // ---- corner hazards: rocks on the inside of "don't cut" corners, a rocky ditch outside "keep in" corners
  for (const hz of T.hazards) {
    for (let k = 0; k < hz.n; k++) {
      const s = hz.s + (k - (hz.n - 1) / 2) * (hz.kind === 'ditch' ? 3.4 : 2.6) + rng.sym() * .6;
      const off = hz.side * (hw + (hz.kind === 'ditch' ? 1.1 : .55) + rng.range(0, .5));
      const p = roadPos(s, off); if (Math.abs(dist[cellAt(p.x, p.y)] - Math.abs(off)) > 1.5) continue; // another bit of road is too close
      const r = rng.range(.55, .85);
      objs.push({ k: 'rock', x: p.x, y: p.y, r, h: r * rng.range(.7, 1), c: true, v: rng.int(0, 5), rot: rng() * TAU, hazard: true });
    }
  }
  // ---- cuts: keep the inside clear where the line is worn in
  Wd.cutPatches = [];
  for (const ct of T.cuts) {
    for (let s = ct.s0; s <= ct.s1; s += 2) {
      const w = ct.w * Math.sin(Math.PI * (s - ct.s0) / (ct.s1 - ct.s0)), p = roadPos(s, ct.side * (hw + w * .5));
      if (w > .4) { Wd.cutPatches.push({ x: p.x, y: p.y, a: p.a, rx: 1.5, ry: w * .5 + .5 }); excl.push({ x: p.x, y: p.y, r: w * .5 + 2 }); }
    }
  }
  // ---- villages
  for (const [v0, v1] of T.villages) {
    for (let s = v0; s < v1; s += rng.range(15, 26)) {
      const side = rng.chance(.5) ? 1 : -1, L = rng.range(7, 11), Wb = rng.range(5, 7.5), off = hw + rng.range(6.5, 11) + Wb / 2;
      const p = roadPos(s, side * off);
      if (excluded(p.x, p.y) || h[cellAt(p.x, p.y)] < .5) continue;
      // keep clear of other road parts
      let clear = true;
      for (const a of [-1, 1]) for (const b of [-1, 1]) { const cx = p.x + Math.cos(p.a) * a * L / 2 - Math.sin(p.a) * b * Wb / 2, cy = p.y + Math.sin(p.a) * a * L / 2 + Math.cos(p.a) * b * Wb / 2; if (dist[cellAt(cx, cy)] < hw + 3) clear = false; }
      if (!clear) continue;
      const o = { k: 'house', x: p.x, y: p.y, L, Wb, h: rng.range(3.6, 5.2), a: p.a + rng.sym() * .06, flat: ev.biome === 'mesa', c: true, lit: night && rng.chance(.7) };
      o.circles = [-1, 0, 1].map(t => ({ x: p.x + Math.cos(o.a) * t * (L / 2 - Wb / 2), y: p.y + Math.sin(o.a) * t * (L / 2 - Wb / 2), r: Wb / 2 }));
      objs.push(o); excl.push({ x: p.x, y: p.y, r: Math.max(L, Wb) / 2 + 3 });
    }
  }
  // ---- hay bales & chevron boards at tight corners
  for (const nt of T.notes) {
    if (nt.kind !== 'corner' || !'H12'.includes(nt.grade)) continue;
    const mid = (nt.s + nt.e) / 2, out = -nt.dir;
    if ((ev.surf === 'tarmac' || isX || ev.biome === 'pines' || ev.biome === 'clay') && rng.chance(.7)) {
      for (let s = mid - 6; s <= mid + 6; s += 1.9) { const p = roadPos(s, out * (hw + 2.2)); if (dist[cellAt(p.x, p.y)] < hw + 1) continue; objs.push({ k: 'hay', x: p.x, y: p.y, r: .8, h: 1, c: true, soft: true, a: p.a }); }
    }
  }
  // chevron boards: a row of yellow arrows round the outside of every tighter corner, pointing where the road goes
  if (!isX) for (const nt of T.notes) {
    if (nt.kind !== 'corner' || !'H123'.includes(nt.grade)) continue;
    const out = -nt.dir, n = nt.grade === '3' ? 2 : nt.grade === '2' ? 3 : 4, step = clamp((nt.e - nt.s) / n, 5, 9);
    for (let k = 0; k < n; k++) {
      const p = roadPos(nt.s - 3 + k * step, out * (hw + 2.7));
      if (dist[cellAt(p.x, p.y)] < hw + 1.7) continue;
      objs.push({ k: 'chev', x: p.x, y: p.y, r: .1, h: 1.45, c: false, a: p.a, dir: nt.dir });
    }
  }
  // roadside marker stakes: a steady rhythm of white posts flicking past is what sells the speed
  if (ev.biome !== 'frost' && !isX) for (let s = 24; s < T.len - 10; s += 46) for (const sd of [-1, 1]) {
    const p = roadPos(s + (sd > 0 ? 0 : 23), sd * (hw + 1.7));
    if (dist[cellAt(p.x, p.y)] > hw + 1 && !excluded(p.x, p.y)) objs.push({ k: 'stake', x: p.x, y: p.y, r: .08, h: 1.05, c: false, a: p.a });
  }
  if (ev.biome === 'frost' && !isX) for (let s = 20; s < T.len; s += 34) for (const sd of [-1, 1]) { const p = roadPos(s, sd * (hw + 1.6)); if (dist[cellAt(p.x, p.y)] > hw + .8) objs.push({ k: 'pole', x: p.x, y: p.y, r: .1, h: 2.4, c: false }); }

  // ---- the lived-in roadside: wires, fences, lamps, woodpiles, windmills, orchards
  const bio = ev.biome, land = (x, y) => h[cellAt(x, y)] > .35;
  const freeSpot = (p, need) => dist[cellAt(p.x, p.y)] > need && land(p.x, p.y) && !excluded(p.x, p.y);
  if (!isX) {
    // telegraph poles carrying sagging wires alongside long stretches
    for (let r = rng.int(1, 3); r > 0; r--) {
      const L = rng.range(320, 700), s0 = rng.range(30, Math.max(40, T.len - L - 30)), side = rng.chance(.5) ? 1 : -1, off = side * (hw + rng.range(6, 8.5));
      let prev = null;
      for (let s = s0; s < Math.min(T.len - 15, s0 + L); s += 31) {
        const p = roadPos(s, off);
        if (!freeSpot(p, hw + 4.6)) { prev = null; continue; }
        const o = { k: 'tpole', x: p.x, y: p.y, r: .2, h: bio === 'mesa' ? 6.8 : 7.6, c: true, a: p.a, next: null, lean: rng.sym() * .03 };
        if (prev && hyp(prev.x - o.x, prev.y - o.y) < 44 && dist[cellAt((prev.x + o.x) / 2, (prev.y + o.y) / 2)] > hw + 2.5) prev.next = o;
        objs.push(o); excl.push({ x: p.x, y: p.y, r: 2.4 }); prev = o;
      }
    }
    // fences: split rails in the forests, wire on the mesa, dry-stone walls by the sea, red snow fences in the frost.
    // They are knocked flat if you go through them.
    const FST = { pines: 'rail', ember: 'rail', mesa: 'wire', coast: 'wall', frost: 'snowf' }[bio];
    if (FST) for (let r = rng.int(2, 4); r > 0; r--) {
      const L = rng.range(50, 160), s0 = rng.range(40, Math.max(50, T.len - L - 30)), side = rng.chance(.5) ? 1 : -1, off = side * (hw + rng.range(3.8, 5.2));
      let last = roadPos(s0, off);
      for (let s = s0 + 3; s <= s0 + L; s += 3) {
        const p = roadPos(s, off), mx = (p.x + last.x) / 2, my = (p.y + last.y) / 2;
        if (hyp(p.x - last.x, p.y - last.y) < 4.5 && dist[cellAt(mx, my)] > Math.abs(off) - 1.2 && land(mx, my) && !excluded(mx, my)) {
          objs.push({ k: 'fence', st: FST, x: mx, y: my, x0: last.x, y0: last.y, x1: p.x, y1: p.y, r: 1.7, h: FST === 'wall' ? .85 : FST === 'snowf' ? 1.25 : 1.15, c: false, brk: true, v: rng() });
          excl.push({ x: mx, y: my, r: 2.2 });
        }
        last = p;
      }
    }
    // street lamps through the villages, lit after dark
    for (const [v0, v1] of T.villages) for (let s = v0 + 6, sd = 1; s < v1; s += 27, sd = -sd) {
      const p = roadPos(s, sd * (hw + 2.1)); if (!freeSpot(p, hw + 1.3)) continue;
      objs.push({ k: 'slamp', x: p.x, y: p.y, r: .16, h: 5.8, c: true, a: p.a, side: sd }); excl.push({ x: p.x, y: p.y, r: 1.6 });
    }
    // stacked timber at the forest edge
    if (bio === 'pines' || bio === 'frost' || bio === 'ember') for (let k = rng.int(2, 5), tries = 0; k > 0 && tries < 40; tries++) {
      const side = rng.chance(.5) ? 1 : -1, p = roadPos(rng.range(60, T.len - 40), side * (hw + rng.range(4.8, 7.5)));
      if (!freeSpot(p, hw + 3.8)) continue;
      const a = p.a + rng.sym() * .15, L = rng.range(3.6, 5.6), ca = Math.cos(a), sa = Math.sin(a);
      objs.push({ k: 'logs', x: p.x, y: p.y, a, L, r: 2.4, h: 1.25, c: true, snow: bio === 'frost', circles: [-1, 0, 1].map(t => ({ x: p.x + ca * t * L * .33, y: p.y + sa * t * L * .33, r: .75 })) });
      excl.push({ x: p.x, y: p.y, r: L / 2 + 2.5 }); k--;
    }
    // landmarks you see from a long way off: windmills turning over the fields, a wind pump on the mesa
    const LM = { coast: ['mill', rng.int(1, 2)], ember: ['mill', rng.int(1, 2)], pines: ['mill', rng.chance(.5) ? 1 : 0], mesa: ['pump', rng.int(2, 3)] }[bio];
    if (LM) for (let k = LM[1], tries = 0; k > 0 && tries < 60; tries++) {
      const side = rng.chance(.5) ? 1 : -1, p = roadPos(rng.range(80, T.len - 60), side * (hw + rng.range(13, 32)));
      if (!freeSpot(p, hw + 10) || h[cellAt(p.x, p.y)] < .8) continue;
      const mill = LM[0] === 'mill';
      objs.push({ k: LM[0], x: p.x, y: p.y, a: p.a + Math.PI / 2 + rng.sym() * .6, h: mill ? rng.range(9.5, 11.5) : rng.range(8, 9.5), r: mill ? 2.3 : .9, c: true, ph: rng() * TAU, spd: mill ? rng.range(.35, .6) : rng.range(1.6, 2.6) });
      excl.push({ x: p.x, y: p.y, r: mill ? 9 : 6 }); k--;
    }
    // orchards: neat rows of trees running beside the road
    const ORCH = { coast: 'olive', ember: 'maple' }[bio];
    if (ORCH) for (let k = rng.int(1, 2), tries = 0; k > 0 && tries < 20; tries++) {
      const L = rng.range(60, 120), s0 = rng.range(60, Math.max(70, T.len - L - 40)), side = rng.chance(.5) ? 1 : -1, rows = rng.int(3, 6), S0 = TREE_SPECS[ORCH];
      if (!freeSpot(roadPos(s0 + L / 2, side * (hw + 9)), hw + 6)) continue;
      for (let j = 0; j < rows; j++) for (let s = s0 + (j % 2) * 2.5; s < s0 + L; s += 5.5) {
        const p = roadPos(s, side * (hw + 7 + j * 5.6)); if (!freeSpot(p, hw + 5.5)) continue;
        const ht = ORCH === 'olive' ? rng.range(3.6, 4.8) : rng.range(4.6, 5.8);
        objs.push({ k: 'tree', sp: ORCH, x: p.x + rng.sym() * .3, y: p.y + rng.sym() * .3, h: ht, cr: ORCH === 'olive' ? rng.range(1.9, 2.4) : rng.range(2.2, 2.7), r: S0.tr, c: true, v: rng.int(0, 3), rot: rng() * TAU });
        excl.push({ x: p.x, y: p.y, r: 2.6 });
      }
      k--;
    }
    // low scrub hugging the verges, so the edge of the road is never a bare line
    if (bio !== 'frost') for (let s = 20; s < T.len - 10; s += rng.range(5, 11)) {
      if (rng() > (bio === 'mesa' ? .55 : .35)) continue;
      const p = roadPos(s, (rng.chance(.5) ? 1 : -1) * (hw + rng.range(3, 6.5)));
      if (!freeSpot(p, hw + 2.6)) continue;
      objs.push({ k: 'tree', sp: 'shrub', x: p.x, y: p.y, h: rng.range(.9, 1.7), cr: rng.range(.8, 1.5), r: 0, c: false, v: rng.int(0, 3), rot: rng() * TAU });
    }
    // banks of ploughed snow along both sides of frozen roads
    if (bio === 'frost') for (let s = 4; s < T.len; s += 2.5 + rng() * .6) for (const sd of [-1, 1]) {
      const p = roadPos(s, sd * (hw + 3.2 + Math.sin(s * .07 + sd) * .5 + rng.sym() * .35)); if (dist[cellAt(p.x, p.y)] < hw + 2.3 || excluded(p.x, p.y)) continue;
      objs.push({ k: 'bank', x: p.x, y: p.y, a: p.a, r: 0, h: .9, c: false, s: .8 + rng() * .55 + Math.max(0, Math.sin(s * .031 + sd * 2)) * .35, v: rng() });
    }
  }

  // ---- lanterns (free roam)
  Wd.lanterns = [];
  if (ev.type === 'roam') {
    for (let tries = 0; tries < 400 && Wd.lanterns.length < 8; tries++) {
      const s = rng.range(80, T.len - 40), p = roadPos(s, (rng.chance(.5) ? 1 : -1) * (hw + rng.range(5, 30)));
      if (h[cellAt(p.x, p.y)] < .4 || Wd.lanterns.some(l => hyp(l.x - p.x, l.y - p.y) < 110)) continue;
      Wd.lanterns.push({ x: p.x, y: p.y, ph: rng() * TAU, got: false }); excl.push({ x: p.x, y: p.y, r: 7 });
    }
  }
  // ---- start / finish arches
  const sp = roadPos(T.startS + 6, 0); objs.push({ k: 'arch', x: sp.x, y: sp.y, a: sp.a, w: T.width + 3, h: 5.5, label: T.closed ? 'start' : 'start', c: false });
  if (!T.closed) { const fp = roadPos(T.finishS, 0); objs.push({ k: 'arch', x: fp.x, y: fp.y, a: fp.a, w: T.width + 3, h: 5.5, label: 'finish', c: false }); }
  for (const a of objs.filter(o => o.k === 'arch')) for (const sd of [-1, 1]) objs.push({ k: 'post', x: a.x - Math.sin(a.a) * sd * a.w / 2, y: a.y + Math.cos(a.a) * sd * a.w / 2, r: .35, h: 5.5, c: true, hidden: true });

  // ---- trees
  const nz3 = makeNoise(ev.seed + 71), sp2 = B.treeSp, totalW = B.trees.reduce((a, t) => a + t[1], 0);
  for (let gy = 0; gy < H; gy += sp2) for (let gx = 0; gx < W; gx += sp2) {
    const x = gx + rng() * sp2, y = gy + rng() * sp2;
    if (x < 1 || y < 1 || x > W - 1 || y > H - 1) continue;
    const dn = fbm(nz3, x / 85, y / 85, 3);
    if (rng() > B.treeDen * smooth(.36, .58, dn) + .03) continue;
    const c = cellAt(x, y), d = dist[c];
    if (d < hw + 3 + rng() * 3.5 || h[c] < .5 || excluded(x, y)) continue;
    let pick = (nz3(x / 40 + 50, y / 40) * .8 + rng() * .45) * totalW / 1.25, sp = B.trees[0][0];
    for (const [k, w] of B.trees) { if (pick < w) { sp = k; break; } pick -= w; }
    const S = TREE_SPECS[sp], ht = rng.range(S.h[0], S.h[1]), cr = rng.range(S.cr[0], S.cr[1]) * (.85 + ht / S.h[1] * .2);
    objs.push({ k: 'tree', sp, x, y, h: ht, cr, r: S.tr, c: S.tr > 0, v: rng.int(0, 3), rot: rng() * TAU });
  }
  // ---- rocks
  for (let gy = 0; gy < H; gy += 9) for (let gx = 0; gx < W; gx += 9) {
    if (rng() > B.rockDen * .5) continue;
    const x = gx + rng() * 9, y = gy + rng() * 9, c = cellAt(x, y);
    if (dist[c] < hw + 2.5 || h[c] < .2 || excluded(x, y)) continue;
    const r = rng.range(.6, ev.biome === 'mesa' ? 2.6 : 1.8);
    objs.push({ k: 'rock', x, y, r, h: r * rng.range(.6, 1.1), c: true, v: rng.int(0, 5), rot: rng() * TAU });
  }
  // ---- ground decor (packed)
  const dec = { x: [], y: [], t: [], s: [], c: [], r: [] };
  for (let gy = 0; gy < H; gy += 3.4) for (let gx = 0; gx < W; gx += 3.4) {
    if (rng() > .5) continue;
    const x = gx + rng() * 3.4, y = gy + rng() * 3.4, c = cellAt(x, y);
    if (dist[c] < hw + .8 || h[c] < .15) continue;
    const ti = rng.int(0, B.decor.length - 1);
    dec.x.push(x); dec.y.push(y); dec.t.push(ti); dec.s.push(rng.range(.6, 1.4)); dec.c.push(rng.int(0, B.decorCols.length - 1)); dec.r.push(rng() * TAU);
  }
  Wd.decor = { x: Float32Array.from(dec.x), y: Float32Array.from(dec.y), t: Uint8Array.from(dec.t), s: Float32Array.from(dec.s), c: Uint8Array.from(dec.c), r: Float32Array.from(dec.r), n: dec.x.length };

  // ---- spatial hash
  const HC = 12, hcw = Math.ceil(W / HC), hch = Math.ceil(H / HC);
  Wd.HC = HC; Wd.hcw = hcw; Wd.hch = hch;
  Wd.grid = Array.from({ length: hcw * hch }, () => []);
  objs.forEach((o, i) => { const gx = clamp(Math.floor(o.x / HC), 0, hcw - 1), gy = clamp(Math.floor(o.y / HC), 0, hch - 1); Wd.grid[gy * hcw + gx].push(i); });
  Wd.dgrid = Array.from({ length: hcw * hch }, () => []);
  for (let i = 0; i < Wd.decor.n; i++) { const gx = clamp(Math.floor(Wd.decor.x[i] / HC), 0, hcw - 1), gy = clamp(Math.floor(Wd.decor.y[i] / HC), 0, hch - 1); Wd.dgrid[gy * hcw + gx].push(i); }
  // water glint points
  Wd.glints = [];
  for (let k = 0; k < 4000 && Wd.glints.length < 700; k++) { const x = rng() * W, y = rng() * H; if (h[cellAt(x, y)] < -.3) Wd.glints.push([x, y, rng() * TAU, rng.range(.6, 1.6)]); }

  // ---- queries
  const shoulderSurf = { tarmac: ev.biome === 'frost' ? 'snow' : ev.biome === 'mesa' ? 'dirt' : 'gravel', snow: 'deepsnow', ice: 'snow' };
  Wd.road = (x, y) => { // nearest road sample, signed lateral offset
    const c = cellAt(x, y), i = near[c];
    const lat = (x - T.px[i]) * -T.ty[i] + (y - T.py[i]) * T.tx[i];
    const fwd = (x - T.px[i]) * T.tx[i] + (y - T.py[i]) * T.ty[i];
    return { i, s: i * DS + fwd, lat, d: dist[c] };
  };
  const cutW = (s, lat) => { for (const ct of T.cuts) if (s > ct.s0 && s < ct.s1 && sign(lat) === ct.side) return ct.w * Math.sin(Math.PI * (s - ct.s0) / (ct.s1 - ct.s0)); return 0; };
  Wd.surface = (x, y) => {
    const r = Wd.road(x, y), al = Math.abs(r.lat), c = cellAt(x, y), hh = h[c];
    if (al < hw + .2 && r.d < hw + 2) { if (isFord(r.i) && hh < 0) return 'water'; return SURF_KEYS[T.surf[r.i]]; }
    if (T.cuts.length && al < hw + 4.5 && al < hw + .2 + cutW(r.s, r.lat)) return SURF_KEYS[T.surf[r.i]];
    if (hh < 0) return B.frozen ? 'ice' : hh < -1 ? 'deep' : 'water';
    if (al < hw + 2) return shoulderSurf[SURF_KEYS[T.surf[r.i]]] || SURF_KEYS[T.surf[r.i]];
    return B.offroad;
  };
  Wd.isFord = isFord;
  // height of the road surface above the flat ground (only the jump ramps rise out of it)
  Wd.groundZ = (x, y) => {
    if (!T.jumps.length) return 0;
    const r = Wd.road(x, y); let z = 0;
    for (const j of T.jumps) { const d = r.s - j.s; if (d > -j.L1 && d < j.L2) z = Math.max(z, rampZ(j, d) * (1 - smooth(hw + .4, hw + 3.4, Math.abs(r.lat)))); }
    return z;
  };
  Wd.query = (x, y, r, fn) => {
    const x0 = clamp(Math.floor((x - r) / HC), 0, hcw - 1), x1 = clamp(Math.floor((x + r) / HC), 0, hcw - 1), y0 = clamp(Math.floor((y - r) / HC), 0, hch - 1), y1 = clamp(Math.floor((y + r) / HC), 0, hch - 1);
    for (let gy = y0; gy <= y1; gy++) for (let gx = x0; gx <= x1; gx++) for (const i of Wd.grid[gy * hcw + gx]) fn(objs[i], i);
  };
  // puddles on wet days
  Wd.puddles = [];
  if (wet) for (let s = 60; s < T.len; s += rng.range(25, 70)) { const p = roadPos(s, rng.sym() * hw * .6); Wd.puddles.push({ x: p.x, y: p.y, rx: rng.range(1.2, 3.2), ry: rng.range(.8, 2), a: p.a + rng.sym() * .4 }); }
  return Wd;
}
