// ---------- GRIS-style menu backdrops ----------
const BD = { cache: {}, key: '', biome: 'pines', fade: 1, prev: null, puffs: [], motes: [] };

function ridgeY(L, x, w, h, seed, biome) {
  const n = (s, f) => Math.sin(x * f + s) * .5 + Math.sin(x * f * 2.3 + s * 1.7) * .3 + Math.sin(x * f * 5.1 + s * .3) * .2;
  const baseY = h * (.56 + L * .11), amp = h * (.05 + L * .035);
  let y = baseY - amp * n(seed + L * 3.1, .0042 / (1 + L * .3) * (1400 / w));
  if (biome === 'frost' && L === 0) y -= Math.max(0, Math.sin(x / w * Math.PI * 1.3 + .4)) * h * .16;
  if (biome === 'mesa' && L < 2) { const t = Math.sin(x / w * 7 + L * 2 + seed); y -= t > .3 ? h * .05 * (L + 1) : 0; }
  return y;
}
function buildBackdrop(biome, w, h) {
  const key = biome + w + 'x' + h; if (BD.cache[key]) return BD.cache[key];
  const B = BIOMES[biome], SR = Math.min(2, devicePixelRatio || 1), c = mkCanvas(w * SR, h * SR), x = c.getContext('2d'); x.scale(SR, SR);
  const seed = biome.length * 1.7;
  const sky = x.createLinearGradient(0, 0, 0, h * .8); B.sky.forEach((col, i) => sky.addColorStop(i / (B.sky.length - 1), col));
  x.fillStyle = sky; x.fillRect(0, 0, w, h);
  // sun halo
  const sxp = w * .7, syp = h * B.sunY, sg = x.createRadialGradient(sxp, syp, 0, sxp, syp, h * .8);
  sg.addColorStop(0, B.sun); sg.addColorStop(.1, hexA(B.glow, .55)); sg.addColorStop(.4, hexA(B.glow, .12)); sg.addColorStop(1, 'rgba(0,0,0,0)');
  x.globalCompositeOperation = 'screen'; x.fillStyle = sg; x.fillRect(0, 0, w, h);
  x.beginPath(); x.arc(sxp, syp, h * .05, 0, TAU); x.fillStyle = B.sun; x.fill();
  for (let i = 0; i < 6; i++) { const yy = h * (.26 + i * .1), bg = x.createLinearGradient(0, yy - 40, 0, yy + 40); bg.addColorStop(0, 'rgba(0,0,0,0)'); bg.addColorStop(.5, hexA(B.haze, .05 + i * .012)); bg.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = bg; x.fillRect(0, yy - 40, w, 80); }
  x.globalCompositeOperation = 'source-over';
  const step = Math.max(8, w / 160);
  for (let L = 0; L < 3; L++) {
    if (L === 1) landmark(x, biome, w, h, B);
    const col = L === 0 ? mixHex(B.ridge[0], B.haze, .35) : B.ridge[L];
    x.fillStyle = col; x.beginPath(); x.moveTo(0, h);
    for (let px = 0; px <= w + step; px += step) x.lineTo(px, ridgeY(L, px, w, h, seed, biome));
    x.lineTo(w, h); x.closePath(); x.fill();
    // silhouettes standing on the ridge
    const r = RNG(L * 31 + biome.length);
    if (L > 0) for (let px = 0; px < w; px += r.range(6, 26) * (L === 2 ? 1 : 1.6)) {
      const y = ridgeY(L, px, w, h, seed, biome) + 2, s = (L === 2 ? 1 : .55) * h / 900;
      x.fillStyle = col;
      if ((biome === 'pines' || biome === 'frost') && r.chance(.75)) { const th = r.range(30, 70) * s; x.beginPath(); x.moveTo(px, y - th); x.lineTo(px + th * .22, y); x.lineTo(px - th * .22, y); x.fill(); }
      else if (biome === 'coast' && r.chance(.3)) { const th = r.range(40, 80) * s; x.beginPath(); x.ellipse(px, y - th / 2, th * .09, th / 2, 0, 0, TAU); x.fill(); }
      else if (biome === 'mesa' && r.chance(.12)) { const th = r.range(25, 45) * s; x.fillRect(px - 3 * s, y - th, 6 * s, th); x.fillRect(px - 12 * s, y - th * .6, 4 * s, th * .3); x.fillRect(px - 12 * s, y - th * .35, 12 * s, 4 * s); }
      else if ((biome === 'ember' || biome === 'clay') && r.chance(.5)) { const rr = r.range(12, 26) * s; x.beginPath(); x.arc(px, y - rr * .8, rr, 0, TAU); x.fill(); }
    }
    // rim light
    x.globalCompositeOperation = 'screen'; x.strokeStyle = hexA(B.glow, .14 - L * .03); x.lineWidth = 2; x.beginPath();
    for (let px = 0; px <= w + step; px += step) { const y = ridgeY(L, px, w, h, seed, biome); px ? x.lineTo(px, y) : x.moveTo(px, y); }
    x.stroke(); x.globalCompositeOperation = 'source-over';
    if (L === 1) { // mist band in front of the far layers
      const mb = x.createLinearGradient(0, h * .5, 0, h * .78); mb.addColorStop(0, hexA(B.haze, 0)); mb.addColorStop(.6, hexA(B.haze, .22)); mb.addColorStop(1, hexA(B.haze, 0));
      x.fillStyle = mb; x.fillRect(0, h * .5, w, h * .28);
    }
  }
  // the road the little car follows (on the middle ridge)
  x.strokeStyle = hexA(mixHex(B.road.gravel || B.road.tarmac || '#c0a080', B.haze, .4), .55); x.lineWidth = Math.max(2, h * .006); x.beginPath();
  for (let px = 0; px <= w + step; px += step) { const y = roadY(px, w, h, seed, biome); px ? x.lineTo(px, y) : x.moveTo(px, y); }
  x.stroke();
  const vg = x.createRadialGradient(w / 2, h / 2, h * .3, w / 2, h / 2, h * .9); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(8,4,16,.45)');
  x.fillStyle = vg; x.fillRect(0, 0, w, h);
  // left-side ink wash so menu text reads
  const lw = x.createLinearGradient(0, 0, w * .62, 0); lw.addColorStop(0, 'rgba(18,14,28,.5)'); lw.addColorStop(1, 'rgba(18,14,28,0)');
  x.fillStyle = lw; x.fillRect(0, 0, w, h);
  BD.cache[key] = c; return c;
}
function roadY(px, w, h, seed, biome) { return ridgeY(1, px, w, h, seed, biome) + h * .035 + Math.sin(px * .006) * h * .012; }
function landmark(x, biome, w, h, B) {
  const col = mixHex(B.ridge[0], B.haze, .2); x.fillStyle = col;
  const bx = w * .82, by = ridgeY(0, w * .82, w, h, biome.length * 1.7, biome);
  if (biome === 'coast') { x.fillRect(bx - 8, by - h * .2, 16, h * .2); x.beginPath(); x.moveTo(bx - 12, by - h * .2); x.lineTo(bx + 12, by - h * .2); x.lineTo(bx, by - h * .235); x.fill(); x.globalCompositeOperation = 'screen'; x.fillStyle = hexA(B.glow, .5); x.beginPath(); x.arc(bx, by - h * .19, 6, 0, TAU); x.fill(); x.globalCompositeOperation = 'source-over'; }
  else if (biome === 'mesa') { x.beginPath(); x.moveTo(bx - w * .1, by + 4); x.lineTo(bx - w * .07, by - h * .14); x.lineTo(bx + w * .05, by - h * .14); x.lineTo(bx + w * .08, by + 4); x.fill(); }
  else if (biome === 'clay') { for (const o of [-1, 1]) { const tx = bx + o * w * .06; x.fillRect(tx - 2, by - h * .22, 4, h * .22); x.fillRect(tx - 14, by - h * .23, 28, 8); x.globalCompositeOperation = 'screen'; x.drawImage(softSprite('#ffe8c0'), tx - 40, by - h * .23 - 40, 80, 80); x.globalCompositeOperation = 'source-over'; x.fillStyle = col; } }
  else if (biome === 'ember') { x.fillRect(bx - 3, by - h * .17, 6, h * .17); x.save(); x.translate(bx, by - h * .17); for (let i = 0; i < 4; i++) { x.rotate(Math.PI / 2); x.fillRect(-2, 0, 4, h * .08); } x.restore(); }
  else if (biome === 'pines') { x.fillRect(bx - 10, by - h * .07, 20, h * .07); x.beginPath(); x.moveTo(bx - 14, by - h * .07); x.lineTo(bx, by - h * .1); x.lineTo(bx + 14, by - h * .07); x.fill(); }
}

function drawBackdrop(t, dt) {
  const ctx = R.ctx, w = R.W, h = R.H, B = BIOMES[BD.biome];
  ctx.setTransform(R.dpr, 0, 0, R.dpr, 0, 0);
  const bg = buildBackdrop(BD.biome, w, h);
  ctx.drawImage(bg, 0, 0, w, h);
  if (BD.prev && BD.fade < 1) { ctx.globalAlpha = 1 - BD.fade; ctx.drawImage(buildBackdrop(BD.prev, w, h), 0, 0, w, h); ctx.globalAlpha = 1; BD.fade = Math.min(1, BD.fade + dt * 1.6); }
  const seed = BD.biome.length * 1.7;
  // haze blobs
  ctx.save(); ctx.globalCompositeOperation = 'screen'; const blob = softSprite(B.haze, .3);
  for (let i = 0; i < 5; i++) { const spd = 6 + i * 5, xx = ((t * spd + i * 430) % (w + 520)) - 260, yy = h * (.2 + i * .1); ctx.globalAlpha = .1 + .03 * i; ctx.drawImage(blob, xx - 260, yy - 70, 520, 140); }
  ctx.restore();
  // the tiny rally car and its dust
  const span = w + 240, cx = ((t * 52) % span) - 120, cy = roadY(cx, w, h, seed, BD.biome), cy2 = roadY(cx + 4, w, h, seed, BD.biome), ang = Math.atan2(cy2 - cy, 4);
  if (Math.random() < .7) BD.puffs.push({ x: cx - Math.cos(ang) * 8, y: cy - 3, r: 3, a: .5, vx: -8 - Math.random() * 6, vy: -3 - Math.random() * 3 });
  ctx.save(); const ds = softSprite(mixHex(B.road.gravel || '#c0a080', B.haze, .5));
  for (const p of BD.puffs) { p.x += p.vx * dt; p.y += p.vy * dt; p.r += 9 * dt; p.a -= .22 * dt; if (p.a <= 0) continue; ctx.globalAlpha = p.a; ctx.drawImage(ds, p.x - p.r, p.y - p.r, p.r * 2, p.r * 2); }
  BD.puffs = BD.puffs.filter(p => p.a > 0).slice(-160);
  ctx.globalAlpha = 1; ctx.translate(cx, cy - 3); ctx.rotate(ang); const sc = h / 900;
  ctx.fillStyle = B.ridge[2]; ctx.beginPath(); ctx.moveTo(-11 * sc, 0); ctx.lineTo(-10 * sc, -5 * sc); ctx.lineTo(-4 * sc, -6 * sc); ctx.lineTo(-1 * sc, -10 * sc); ctx.lineTo(6 * sc, -10 * sc); ctx.lineTo(9 * sc, -5 * sc); ctx.lineTo(12 * sc, -4 * sc); ctx.lineTo(12 * sc, 0); ctx.fill();
  for (const wx of [-6, 7]) { ctx.beginPath(); ctx.arc(wx * sc, 0, 2.6 * sc, 0, TAU); ctx.fill(); }
  ctx.globalCompositeOperation = 'screen'; ctx.drawImage(softSprite('#fff2c8'), 10 * sc, -9 * sc, 14 * sc, 10 * sc);
  ctx.restore();
  // motes
  if (BD.motes.length < 50) for (let i = 0; i < 50; i++) BD.motes.push({ x: Math.random(), y: Math.random(), z: .4 + Math.random() * .8, ph: Math.random() * TAU, sz: .8 + Math.random() * 1.8 });
  ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.fillStyle = B.motes;
  for (const m of BD.motes) {
    let px = (m.x * w + Math.sin(t * .3 * m.z + m.ph) * 30 * m.z + t * 10 * m.z) % (w + 40); if (px < -20) px += w + 40;
    let py = (m.y * h - t * 9 * m.z + Math.cos(t * .4 + m.ph) * 16) % (h + 40); if (py < -20) py += h + 40;
    ctx.globalAlpha = (.12 + .3 * (.5 + .5 * Math.sin(t * 3 + m.ph))) * m.z; ctx.beginPath(); ctx.arc(px, py, m.sz * m.z, 0, TAU); ctx.fill();
  }
  ctx.restore();
  drawGrain(ctx, t, w, h);
}
function setBackdrop(biome) { if (biome === BD.biome) return; BD.prev = BD.biome; BD.biome = biome; BD.fade = 0; BD.puffs = []; }
