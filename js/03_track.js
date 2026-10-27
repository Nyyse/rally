// ---------- track generation ----------
const DS = 2; // metres between track samples

function splineCR(P, closed, step) {
  const n = P.length, out = [];
  const get = i => {
    if (closed) return P[(i % n + n) % n];
    if (i < 0) return [2 * P[0][0] - P[1][0], 2 * P[0][1] - P[1][1]];
    if (i >= n) return [2 * P[n - 1][0] - P[n - 2][0], 2 * P[n - 1][1] - P[n - 2][1]];
    return P[i];
  };
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
    const d = (a, b) => Math.max(1e-3, Math.sqrt(hyp(b[0] - a[0], b[1] - a[1])));
    const t0 = 0, t1 = t0 + d(p0, p1), t2 = t1 + d(p1, p2), t3 = t2 + d(p2, p3);
    const L = hyp(p2[0] - p1[0], p2[1] - p1[1]), m = Math.max(2, Math.ceil(L / step));
    for (let k = 0; k < m; k++) {
      const t = t1 + (t2 - t1) * k / m, r = [0, 0];
      for (let c = 0; c < 2; c++) {
        const A1 = (t1 - t) / (t1 - t0) * p0[c] + (t - t0) / (t1 - t0) * p1[c];
        const A2 = (t2 - t) / (t2 - t1) * p1[c] + (t - t1) / (t2 - t1) * p2[c];
        const A3 = (t3 - t) / (t3 - t2) * p2[c] + (t - t2) / (t3 - t2) * p3[c];
        const B1 = (t2 - t) / (t2 - t0) * A1 + (t - t0) / (t2 - t0) * A2;
        const B2 = (t3 - t) / (t3 - t1) * A2 + (t - t1) / (t3 - t1) * A3;
        r[c] = (t2 - t) / (t2 - t1) * B1 + (t - t1) / (t2 - t1) * B2;
      }
      out.push(r);
    }
  }
  if (!closed) out.push(P[n - 1].slice());
  return out;
}

// resample to uniform spacing and compute frames
function analyzePoly(poly, closed) {
  const xs = [poly[0][0]], ys = [poly[0][1]];
  let carry = 0;
  const pts = closed ? poly.concat([poly[0]]) : poly;
  for (let i = 1; i < pts.length; i++) {
    let ax = pts[i - 1][0], ay = pts[i - 1][1];
    const bx = pts[i][0], by = pts[i][1];
    let seg = hyp(bx - ax, by - ay);
    while (carry + seg >= DS) {
      const need = DS - carry, t = need / seg;
      ax = ax + (bx - ax) * t; ay = ay + (by - ay) * t; seg -= need; carry = 0;
      xs.push(ax); ys.push(ay);
    }
    carry += seg;
  }
  if (closed) { // drop last if it nearly duplicates the first
    const n = xs.length; if (hyp(xs[n - 1] - xs[0], ys[n - 1] - ys[0]) < DS * .6) { xs.pop(); ys.pop(); }
  }
  const n = xs.length;
  const T = { n, closed, px: new Float32Array(xs), py: new Float32Array(ys), tx: new Float32Array(n), ty: new Float32Array(n), k: new Float32Array(n) };
  const idx = i => closed ? (i + n) % n : clamp(i, 0, n - 1);
  for (let i = 0; i < n; i++) {
    const a = idx(i - 1), b = idx(i + 1);
    let dx = T.px[b] - T.px[a], dy = T.py[b] - T.py[a]; const l = hyp(dx, dy) || 1;
    T.tx[i] = dx / l; T.ty[i] = dy / l;
  }
  const raw = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = idx(i - 2), b = idx(i + 2);
    raw[i] = wrapA(Math.atan2(T.ty[b], T.tx[b]) - Math.atan2(T.ty[a], T.tx[a])) / (DS * (closed ? 4 : (b - a || 1)));
  }
  for (let i = 0; i < n; i++) { let s = 0; for (let j = -3; j <= 3; j++) s += raw[idx(i + j)]; T.k[i] = s / 7; }
  T.len = closed ? n * DS : (n - 1) * DS;
  return T;
}

function trackOK(T, win, minDist, minR) {
  let mk = 0; for (let i = 0; i < T.n; i++) mk = Math.max(mk, Math.abs(T.k[i]));
  if (mk > 1 / minR) return false;
  const cell = minDist, grid = new Map();
  for (let i = 0; i < T.n; i++) {
    const cx = Math.floor(T.px[i] / cell), cy = Math.floor(T.py[i] / cell);
    for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
      const l = grid.get((cx + ox) * 73856093 ^ (cy + oy) * 19349663); if (!l) continue;
      for (const j of l) {
        let di = Math.abs(i - j); if (T.closed) di = Math.min(di, T.n - di);
        if (di > win && hyp(T.px[i] - T.px[j], T.py[i] - T.py[j]) < minDist) return false;
      }
    }
    const key = cx * 73856093 ^ cy * 19349663; if (!grid.has(key)) grid.set(key, []); grid.get(key).push(i);
  }
  return true;
}

function fitWorld(T, margin) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (let i = 0; i < T.n; i++) { x0 = Math.min(x0, T.px[i]); y0 = Math.min(y0, T.py[i]); x1 = Math.max(x1, T.px[i]); y1 = Math.max(y1, T.py[i]); }
  const ox = margin - x0, oy = margin - y0;
  for (let i = 0; i < T.n; i++) { T.px[i] += ox; T.py[i] += oy; }
  T.W = Math.ceil(x1 - x0 + margin * 2); T.H = Math.ceil(y1 - y0 + margin * 2);
}

function genStage(rng, len) {
  const Wd = Math.round(clamp(Math.sqrt(len) * 19.5, 640, 980)), m = 70;
  for (let att = 0; att < 120; att++) {
    const cs = [[m, Wd - m], [Wd - m, Wd - m], [Wd - m, m], [m, m]], c = rng.int(0, 3);
    let [x, y] = cs[c]; const [gx, gy] = cs[(c + 2) % 4];
    let hd = Math.atan2(gy - y, gx - x) + rng.sym() * .5;
    const P = [[x, y]]; let total = 0, ok = true;
    while (total < len * 1.02) {
      let placed = false;
      for (let tr = 0; tr < 14 && !placed; tr++) {
        const step = rng.range(50, 95);
        let h = hd + rng.sym() * (tr < 6 ? 1.05 : 1.6);
        h += wrapA(Math.atan2(gy - y, gx - x) - h) * .14;
        const ex = x + Math.cos(h) * step * 1.7, ey = y + Math.sin(h) * step * 1.7;
        if (ex < m || ex > Wd - m || ey < m || ey > Wd - m) h += wrapA(Math.atan2(Wd / 2 - y, Wd / 2 - x) - h) * .75;
        if (Math.abs(wrapA(h - hd)) > 1.3) continue;
        const nx = x + Math.cos(h) * step, ny = y + Math.sin(h) * step;
        if (nx < m * .5 || nx > Wd - m * .5 || ny < m * .5 || ny > Wd - m * .5) continue;
        let bad = false;
        for (let i = 0; i < P.length - 2; i++) if (hyp(P[i][0] - nx, P[i][1] - ny) < 78) { bad = true; break; }
        if (bad) continue;
        P.push([nx, ny]); total += step; x = nx; y = ny; hd = h; placed = true;
      }
      if (!placed) { ok = false; break; }
    }
    if (!ok) continue;
    const T = analyzePoly(splineCR(P, false, 1), false);
    if (trackOK(T, 42, 46, 12)) { fitWorld(T, 90); return T; }
  }
  return null;
}

function genHill(rng) {
  for (let att = 0; att < 60; att++) {
    const legs = rng.int(5, 6), span = rng.range(300, 360);
    let dir = rng.chance(.5) ? 1 : -1, x = dir > 0 ? 0 : span, y = 0;
    const P = [[x, y]];
    for (let leg = 0; leg < legs; leg++) {
      const xe = dir > 0 ? span - rng.range(0, 70) : rng.range(0, 70), climb = rng.range(34, 56);
      const wob = rng.range(8, 22) * (rng.chance(.5) ? 1 : -1);
      P.push([lerp(x, xe, .34), y - climb * .34 + wob]);
      P.push([lerp(x, xe, .68), y - climb * .68 - wob * .7]);
      P.push([xe, y - climb]);
      y -= climb; x = xe;
      if (leg === legs - 1) break;
      const R = rng.range(12.5, 18), cx = x, cy = y - R;
      for (const a of [45, 0, -45]) { const t = a * Math.PI / 180; P.push([cx + dir * R * 1.15 * Math.cos(t), cy + R * Math.sin(t)]); }
      y -= 2 * R; P.push([x, y]); dir = -dir;
      const lead = rng.range(30, 45); x -= dir * -lead; P.push([x, y - 2]); y -= 2;
    }
    const T = analyzePoly(splineCR(P, false, .8), false);
    if (trackOK(T, 40, 24, 10)) { fitWorld(T, 90); return T; }
  }
  return null;
}

function genCross(rng) {
  for (let att = 0; att < 80; att++) {
    const R0 = rng.range(88, 108), f1 = rng() * TAU, f2 = rng() * TAU, f3 = rng() * TAU;
    const a2 = rng.range(.18, .3), a3 = rng.range(.08, .16), a5 = rng.range(.03, .08), sx = rng.range(1.05, 1.35);
    const P = [];
    for (let i = 0; i < 26; i++) {
      const t = i / 26 * TAU, r = R0 * (1 + a2 * Math.sin(2 * t + f1) + a3 * Math.sin(3 * t + f2) + a5 * Math.sin(5 * t + f3));
      P.push([Math.cos(t) * r * sx, Math.sin(t) * r]);
    }
    const T = analyzePoly(splineCR(P, true, 1), true);
    if (trackOK(T, 40, 34, 13)) { fitWorld(T, 95); return T; }
  }
  return null;
}

function genFallback() { // a gentle S that always works
  const P = []; for (let i = 0; i <= 20; i++) P.push([i * 70, Math.sin(i * .8) * 90]);
  const T = analyzePoly(splineCR(P, false, 1), false); fitWorld(T, 90); return T;
}

// surfaces, features, notes
function surfAt(T, s) { const i = clamp(Math.round(s / DS), 0, T.n - 1); return SURF_KEYS[T.surf[i]]; }

function buildTrack(ev) {
  const rng = RNG(ev.seed);
  let T = ev.type === 'rallycross' ? genCross(rng) : ev.type === 'hillclimb' ? genHill(rng) : genStage(rng, ev.len || (ev.type === 'roam' ? 2600 : 2000));
  if (!T) T = genFallback();
  T.ev = ev;
  T.width = ev.type === 'rallycross' ? 11 : { tarmac: 7.2, gravel: 6.6, dirt: 6.8, sand: 7.2, mud: 6.4, snow: 7, ice: 7.2 }[ev.surf] || 6.8;
  T.laps = ev.type === 'rallycross' ? 3 : 1;
  // surfaces
  const sIdx = k => SURF_KEYS.indexOf(k);
  T.surf = new Uint8Array(T.n);
  const fill = (a, b, k) => { for (let i = Math.max(0, Math.floor(a / DS)); i < Math.min(T.n, Math.ceil(b / DS)); i++) T.surf[i] = sIdx(k); };
  const prim = ev.surf === 'mixed' ? 'gravel' : ev.surf;
  fill(0, T.len + DS, prim);
  T.villages = [];
  if (ev.surf === 'mixed') {
    const cuts = [0]; let s = 0; while (s < T.len) { s += rng.range(.18, .32) * T.len; cuts.push(Math.min(s, T.len)); }
    for (let i = 0; i < cuts.length - 1; i++) fill(cuts[i], cuts[i + 1], i % 2 ? 'gravel' : 'tarmac');
  } else {
    const patch = (k, cnt, a, b) => { for (let i = 0; i < cnt; i++) { const L = rng.range(a, b), s0 = rng.range(140, Math.max(160, T.len - 140 - L)); fill(s0, s0 + L, k); } };
    if (prim === 'snow') patch('ice', rng.int(3, 5), 30, 70);
    if (prim === 'ice') patch('snow', 3, 40, 90);
    if (prim === 'mud') patch(rng.chance(.5) ? 'dirt' : 'gravel', 2, 80, 150);
    if (prim === 'sand') patch('dirt', 2, 100, 190);
    if (prim === 'dirt') patch('gravel', 2, 70, 130);
    if (prim === 'gravel' && ev.biome === 'pines' && ev.type !== 'roam' && rng.chance(.7)) {
      const L = rng.range(150, 230), s0 = rng.range(.3, .6) * T.len; fill(s0, s0 + L, 'tarmac'); T.villages.push([s0 + 20, s0 + L - 20]);
    }
  }
  if (!T.villages.length && ev.type !== 'rallycross') {
    const cnt = ev.biome === 'coast' ? 2 : ev.biome === 'clay' ? 0 : 1;
    for (let i = 0; i < cnt; i++) { const s0 = rng.range(.15 + i * .45, .4 + i * .45) * T.len; T.villages.push([s0, s0 + rng.range(90, 160)]); }
  }
  // jumps / crests on straights
  T.jumps = [];
  const straight = (s, half) => { for (let d = -half; d <= half; d += DS) { const i = Math.round((s + d) / DS); if (i < 0 || i >= T.n || Math.abs(T.k[i]) > 1 / 170) return false; } return true; };
  const wantJ = ev.jumps ?? (ev.type === 'rallycross' ? 1 : ev.type === 'hillclimb' ? 1 : ev.type === 'roam' ? 3 : { pines: 3, ember: 2, mesa: 2, frost: 1, coast: 1 }[ev.biome] || 1);
  for (let tries = 0; tries < 300 && T.jumps.length < wantJ; tries++) {
    const s = rng.range(170, T.len - 150);
    if (!straight(s, 24)) continue;
    if (T.jumps.some(j => Math.abs(j.s - s) < 170)) continue;
    const big = ev.biome === 'pines' || ev.type === 'rallycross' || rng.chance(.35);
    // a real ramp in the road: a kicker that rises over L1 metres to the lip, then a landing that falls away
    T.jumps.push({ s, kick: big ? .26 : .14, big, hJ: big ? 1.05 : .55, L1: big ? 17 : 13, L2: big ? 10 : 8 });
  }
  T.jumps.sort((a, b) => a.s - b.s);
  // fords
  T.fords = [];
  if ((ev.biome === 'pines' || ev.biome === 'ember') && ev.type !== 'rallycross' && ev.surf !== 'tarmac') {
    const want = ev.biome === 'ember' ? 2 : 1;
    for (let tries = 0; tries < 200 && T.fords.length < want; tries++) {
      const s = rng.range(220, T.len - 200);
      if (!straight(s, 16) || T.jumps.some(j => Math.abs(j.s - s) < 80) || T.fords.some(f => Math.abs(f.s - s) < 300)) continue;
      if (SURF_KEYS[T.surf[Math.round(s / DS)]] === 'tarmac') continue;
      T.fords.push({ s, s0: s - 8, s1: s + 8 });
    }
  }
  // hay-bale chicanes on long straights: two staggered walls of bales, left then right (or the other way)
  T.chicanes = [];
  if (ev.type === 'stage' || ev.type === 'roam') {
    const want = rng.chance(.75) ? (T.len > 2600 ? 2 : 1) : 0;
    for (let tries = 0; tries < 300 && T.chicanes.length < want; tries++) {
      const s = rng.range(260, T.len - 220);
      if (!straight(s + 9, 42)) continue;
      if (T.jumps.some(j => Math.abs(j.s - s) < 110) || T.fords.some(f => Math.abs(f.s - s) < 90) || T.chicanes.some(c => Math.abs(c.s - s) < 400)) continue;
      if ([.25, .5, .75].some(f => Math.abs(f * T.len - s) < 40)) continue;
      T.chicanes.push({ s, sd: rng.chance(.5) ? 1 : -1, gap: 18 });
    }
  }
  // checkpoints
  T.checks = T.closed ? [] : [.25, .5, .75].map(f => f * T.len);
  T.startS = T.closed ? 6 : 10;
  T.finishS = T.closed ? 0 : T.len - 12;
  T.notes = makeNotes(T);
  // corner character: safe cuts worn into the inside, hidden rocks that punish a cut, a ditch on the outside,
  // and square junction corners in the villages
  T.cuts = []; T.hazards = [];
  const inVillage = s => T.villages.some(([a, b]) => s > a - 10 && s < b + 10);
  for (const nt of T.notes) {
    if (nt.kind !== 'corner' || ev.type === 'rallycross') continue;
    const len = nt.e - nt.s, mid = (nt.s + nt.e) / 2;
    let turn = 0; for (let i = Math.round(nt.s / DS); i < Math.round(nt.e / DS); i++) turn += (T.k[i] || 0) * DS;
    turn = Math.abs(turn);
    if (turn > 1.0 && turn < 1.9 && len < (inVillage(mid) ? 110 : 80) && '12'.includes(nt.grade)) nt.square = true;
    if (nt.s < 60 || nt.e > T.len - 40 || inVillage(mid)) continue;
    if (!'2345'.includes(nt.grade) || len < 14) continue;
    const r = rng();
    if (r < .2) { nt.dontcut = true; T.hazards.push({ kind: 'rocks', s: mid, side: nt.dir, n: rng.int(2, 3) }); }
    else if (r < .4 && ev.surf !== 'tarmac') { nt.cut = true; T.cuts.push({ s0: nt.s + len * .1, s1: nt.e - len * .1, side: nt.dir, w: clamp(len * .06, 2.2, 3.8) }); }
    else if (r < .52) { nt.keepin = true; T.hazards.push({ kind: 'ditch', s: mid, side: -nt.dir, n: rng.int(3, 4) }); }
  }
  for (const nt of T.notes) nt.text = noteText(nt);
  return T;
}

function cornerGrade(R) { return R < 17 ? 'H' : R < 30 ? '1' : R < 48 ? '2' : R < 72 ? '3' : R < 105 ? '4' : R < 150 ? '5' : '6'; }

function makeNotes(T) {
  const notes = [], thr = 1 / 165, n = T.n;
  let i = 0;
  while (i < n) {
    if (Math.abs(T.k[i]) > thr) {
      const st = i, dir = sign(T.k[i]);
      let mk = 0, mi = i;
      while (i < n && Math.abs(T.k[i]) > thr * .7 && sign(T.k[i]) === dir) { if (Math.abs(T.k[i]) > mk) { mk = Math.abs(T.k[i]); mi = i; } i++; }
      const len = (i - st) * DS;
      if (len >= 10) {
        const prev = notes[notes.length - 1];
        if (prev && prev.kind === 'corner' && prev.dir === dir && st * DS - prev.e < 14) {
          prev.e = i * DS; if (mk > prev.mk) { prev.tight = true; prev.mk = mk; prev.grade = cornerGrade(1 / mk); }
          prev.long = prev.e - prev.s > 70;
        } else {
          const R = 1 / mk;
          let a = 0, b = 0; const mid = (st + i) >> 1;
          for (let j = st; j < i; j++) { if (j < mid) a = Math.max(a, Math.abs(T.k[j])); else b = Math.max(b, Math.abs(T.k[j])); }
          notes.push({ kind: 'corner', s: st * DS, e: i * DS, dir, mk, grade: cornerGrade(R), long: len > 70, tight: b > a * 1.45 && len > 30, open: a > b * 1.45 && len > 30 });
        }
      }
    } else i++;
  }
  for (const j of T.jumps) notes.push({ kind: j.big ? 'jump' : 'crest', s: j.s - 6, e: j.s + 4 });
  for (const c of T.chicanes || []) notes.push({ kind: 'chicane', s: c.s - 10, e: c.s + c.gap + 6, dir: c.sd });
  for (const f of T.fords) notes.push({ kind: 'ford', s: f.s0, e: f.s1 });
  for (let k = 1; k < n; k++) if (T.surf[k] !== T.surf[k - 1]) notes.push({ kind: 'surface', to: SURF_KEYS[T.surf[k]], s: k * DS, e: k * DS + 4 });
  if (!T.closed) notes.push({ kind: 'finish', s: T.finishS, e: T.finishS + 1 });
  notes.sort((a, b) => a.s - b.s);
  for (let k = 0; k < notes.length - 1; k++) if (notes[k + 1].s - notes[k].e < 26 && notes[k].kind === 'corner') notes[k].into = true;
  for (const nt of notes) nt.text = noteText(nt);
  return notes;
}
function noteText(nt) {
  if (nt.kind === 'corner') {
    const d = nt.dir > 0 ? 'Right' : 'Left', g = nt.grade === 'H' ? 'Hairpin' : nt.grade;
    const mods = [nt.long && 'long', nt.tight && 'tightens', nt.open && 'opens', nt.dontcut && "don't cut", nt.cut && 'cut', nt.keepin && 'keep in', nt.into && 'into'].filter(Boolean).join(' · ');
    if (nt.square) return { big: '⌐', line: 'Square ' + d.toLowerCase() + (mods ? ' · ' + mods : ''), say: 'Square ' + d + (mods ? ' ' + mods.replace(/ · /g, ' ') : '') };
    return { big: nt.grade === 'H' ? 'H' : nt.grade, line: d + (nt.grade === 'H' ? ' hairpin' : '') + (mods ? ' · ' + mods : ''), say: d + ' ' + g + (mods ? ' ' + mods.replace(/ · /g, ' ') : ''), warn: !!(nt.dontcut || nt.keepin) };
  }
  if (nt.kind === 'chicane') { const a = nt.dir > 0 ? 'left' : 'right', b = nt.dir > 0 ? 'right' : 'left'; /* bales stand on side dir first, so the line goes the other way */ return { big: '⇄', line: 'Chicane · ' + a + ' then ' + b, say: 'Chicane ' + a + ' ' + b, warn: true }; }
  if (nt.kind === 'jump') return { big: '!', line: 'Jump · keep straight', say: 'Jump' };
  if (nt.kind === 'crest') return { big: '^', line: 'Over crest', say: 'Over crest' };
  if (nt.kind === 'ford') return { big: '~', line: 'Water splash', say: 'Water splash' };
  if (nt.kind === 'surface') return { big: '·', line: 'Onto ' + SURF[nt.to].name.toLowerCase(), say: 'Onto ' + SURF[nt.to].name };
  return { big: '▮', line: 'Flying finish', say: 'Flat to finish' };
}

// ramp height above the flat road at distance d past a jump's lip
function rampZ(j, d) {
  if (d <= -j.L1 || d >= j.L2) return 0;
  if (d <= 0) { const t = 1 + d / j.L1; return j.hJ * t * t; }
  const t = d / j.L2; return j.hJ * (1 - t * t * (3 - 2 * t));
}
// which side of the road a chicane gate's bales stand on, and where the gap is, for the driver at distance s
function chicaneGate(T, s) {
  for (const c of T.chicanes || []) for (const [gs, side] of [[c.s, c.sd], [c.s + c.gap, -c.sd]]) if (s > gs - 26 && s < gs + 5) return { gs, side };
  return null;
}
