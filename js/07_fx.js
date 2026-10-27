// ---------- particles, weather, atmosphere, frame composition ----------
const PMAX = 1900;
const PTS = Array.from({ length: PMAX }, () => ({ life: 0 }));
let pNext = 0;
function spawn(k, x, y, z, vx, vy, vz, life, size, grow, col, a) {
  const p = PTS[pNext]; pNext = (pNext + 1) % PMAX;
  p.k = k; p.x = x; p.y = y; p.z = z; p.vx = vx; p.vy = vy; p.vz = vz; p.life = p.max = life; p.size = size; p.grow = grow; p.col = col; p.a = a; p.rot = Math.random() * TAU;
  return p;
}
function clearParts() { for (const p of PTS) p.life = 0; }

function updateParts(dt) {
  const wx = S.wind[0], wy = S.wind[1];
  for (const p of PTS) {
    if (p.life <= 0) continue;
    p.life -= dt;
    if (p.k === 0 || p.k === 2) { // soft clouds / glows
      const drag = 1 - Math.min(1, 1.8 * dt);
      p.vx = p.vx * drag + wx * dt * .5; p.vy = p.vy * drag + wy * dt * .5; p.vz *= drag;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z = Math.max(0, p.z + p.vz * dt); p.size += p.grow * dt;
    } else if (p.k === 1) { // ballistic chunks
      p.vz -= 15 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.rot += dt * 9;
      if (p.z <= 0) {
        p.z = 0; p.vx = p.vy = p.vz = 0; if (p.life > .5) p.life = .5;
        if (p.splat) { addDecal(p.x, p.y, p.size * 2.2, p.col); p.splat = false; }
      }
    } else if (p.k === 3) { // confetti
      p.vz = Math.max(p.vz - 4 * dt, -1.4); p.x += (p.vx + Math.sin(p.rot) * 1.2) * dt; p.y += p.vy * dt; p.z = Math.max(0, p.z + p.vz * dt); p.rot += dt * 5;
    }
  }
}
function drawParts(ctx) {
  const x0 = GND.box[0] - 20, x1 = GND.box[2] + 20, y0 = GND.box[1] - 20, y1 = GND.box[3] + 20;
  for (const p of PTS) {
    if (p.life <= 0 || p.x < x0 || p.x > x1 || p.y < y0 || p.y > y1) continue;
    const t = p.life / p.max;
    proj(p.x, p.y, p.z, _p);
    if (p.k === 0) {
      const s = p.size * cam.ppm * _p[2], fade = Math.min(1, (1 - t) * 14) * Math.pow(t, .7) * clamp((R.H * 1.05 - _p[1]) / (R.H * .35), .25, 1);
      ctx.globalAlpha = p.a * fade; ctx.drawImage(softSprite(p.col), _p[0] - s, _p[1] - s, s * 2, s * 2);
    } else if (p.k === 2) {
      const s = p.size * cam.ppm * _p[2]; ctx.globalAlpha = p.a * t;
      ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(softSprite(p.col), _p[0] - s, _p[1] - s, s * 2, s * 2); ctx.globalCompositeOperation = 'source-over';
    } else {
      const s = Math.max(1, p.size * cam.ppm * _p[2]); ctx.globalAlpha = Math.min(1, t * 3) * p.a; ctx.fillStyle = p.col;
      ctx.save(); ctx.translate(_p[0], _p[1]); ctx.rotate(p.rot); ctx.fillRect(-s / 2, -s * (p.k === 3 ? .3 : .5), s, s * (p.k === 3 ? .6 : 1)); ctx.restore();
    }
  }
  ctx.globalAlpha = 1;
}
function addDecal(x, y, r, col) { S.decals.push({ x, y, r, col, a: Math.random() * TAU }); if (S.decals.length > 400) S.decals.shift(); }
function drawDecals(ctx) {
  for (const d of S.decals) { if (!inBox(d.x, d.y, 3)) continue; ctx.fillStyle = hexA(d.col, .55); ctx.beginPath(); ctx.ellipse(d.x, d.y, d.r, d.r * .6, d.a, 0, TAU); ctx.fill(); }
}

// ---------- car effects ----------
const FXCOL = {};
function fxCols() {
  const B = S.B, r = B.road;
  return {
    dust: mixHex(r.gravel || r.dirt || '#c0a080', B.haze, .35), dirt: mixHex(r.dirt || r.gravel || '#b08a60', B.haze, .3), sand: mixHex(r.sand || '#e8cfa0', '#fff4e0', .3),
    mud: r.mud || '#6a4a34', snow: '#f4f7fd', smoke: '#d8d4dc', chunk: shade(r.gravel || r.dirt || '#a08060', -.35), grass: shade(B.ground[3], -.1), water: '#e6f2f6', leaf: '#d9772f',
  };
}
function emitCarFx(car, dt, isGhost) {
  if (isGhost) return;
  const P = car.P, ch = Math.cos(car.h), sh = Math.sin(car.h), sp = car.speed;
  if (!car.fx) car.fx = { last: null, acc: 0, pop: 0 };
  const C = S.fxc || (S.fxc = fxCols());
  const wheels = [];
  for (const sd of [-1, 1]) wheels.push([car.x - ch * P.b * .95 - sh * sd * P.hw * .85, car.y - sh * P.b * .95 + ch * sd * P.hw * .85]);
  const fwh = []; for (const sd of [-1, 1]) fwh.push([car.x + ch * P.a - sh * sd * P.hw * .85, car.y + sh * P.a + ch * sd * P.hw * .85]);
  const slip = car.slipR + car.slipF * .5, k = car.sR, grp = SURF[k].grp, onG = !car.air;
  // skid marks
  if (car.fx.last && onG) {
    const L = car.fx.last;
    const mv = hyp(wheels[0][0] - L[0][0], wheels[0][1] - L[0][1]);
    if (mv > .35 && mv < 6) {
      let a = 0, col = 0, w = .26;
      if (k === 'tarmac') { a = slip > 3.5 ? clamp((slip - 3.5) / 8, 0, 1) * .9 : 0; col = 0; }
      else if (k === 'snow' || k === 'deepsnow') { a = .45 + Math.min(.4, slip * .03); col = 2; w = .34; }
      else if (k === 'ice') { a = slip > 3 ? .35 : 0; col = 2; w = .2; }
      else if (k === 'mud') { a = .55; col = 1; w = .32; }
      else if (k === 'water' || k === 'deep') a = 0;
      else { a = .18 + Math.min(.5, slip * .04); col = k === 'grass' ? 3 : 1; w = .3; }
      if (a > .02) for (let i = 0; i < 2; i++) addSkid(L[0 + i][0], L[0 + i][1], wheels[i][0], wheels[i][1], w, a, col);
      if (car.lock >= 1 && k === 'tarmac') for (let i = 0; i < 2; i++) addSkid(L[2 + i][0], L[2 + i][1], fwh[i][0], fwh[i][1], .24, .6, 0);
      car.fx.last = [wheels[0], wheels[1], fwh[0], fwh[1]];
    } else if (mv >= 6) car.fx.last = [wheels[0], wheels[1], fwh[0], fwh[1]];
  } else car.fx.last = [wheels[0], wheels[1], fwh[0], fwh[1]];
  // a holed radiator breathes white steam; a hurt engine smokes dark from under the bonnet
  const D = car.dm;
  if (D && (D.rad > .3 || D.eng > .4)) {
    const steam = D.rad > .3 ? (D.rad - .25) : 0, smoke = D.eng > .4 ? (D.eng - .35) : 0;
    car.fx.smk = (car.fx.smk || 0) + dt * (steam + smoke) * 18;
    while (car.fx.smk >= 1) {
      car.fx.smk--;
      const dark = Math.random() * (steam + smoke) < smoke;
      spawn(0, car.x + ch * P.a * .9 + (Math.random() - .5) * .7, car.y + sh * P.a * .9 + (Math.random() - .5) * .7, (car.z || 0) + 1.1, car.vx * .55 + (Math.random() - .5), car.vy * .55 + (Math.random() - .5), .9 + Math.random() * .8, 1.4 + Math.random(), .45, 1.8, dark ? (D.eng > .75 ? '#3e3a44' : '#7a7682') : '#eef1f4', clamp((dark ? smoke : steam) * .6, .08, .3));
    }
  }
  if (!onG) return;
  const fx = SURF[k].fx, rate = (sp * .95 + slip * 2.2 + car.spin * 26 + car.thr * Math.min(sp, 20) * .3) * dt, bvx = -car.vx * .12, bvy = -car.vy * .12;
  const lat = () => (Math.random() - .5) * 2.2;
  let n = rate * (R.q === 'high' ? 1 : .6); car.fx.acc += n; n = Math.floor(car.fx.acc); car.fx.acc -= n;
  for (let i = 0; i < n; i++) {
    const w = wheels[i & 1], x = w[0] + (Math.random() - .5) * .4, y = w[1] + (Math.random() - .5) * .4;
    if (fx === 'dust' || fx === 'sand') {
      const col = fx === 'sand' ? C.sand : k === 'dirt' ? C.dirt : C.dust;
      // dust is dragged along in the car's wake before it stalls, so it trails as a cloud instead of vanishing under the camera
      // sunlit dust is paler than the road it comes off; a mix of tones makes it read as billows, not haze
      const r3 = Math.random(), pc = r3 < .35 ? ((C.dustLo || (C.dustLo = {}))[col] || (C.dustLo[col] = shade(col, -.16))) : r3 < .55 ? col : (C.dustHi || (C.dustHi = {}))[col] || (C.dustHi[col] = mixHex(col, '#fff7ea', .32));
      const spread = 1.6 + Math.min(2.4, sp * .06 + slip * .08);
      spawn(0, x, y, .45, car.vx * .42 + lat() - sh * lat() * spread, car.vy * .42 + lat() + ch * lat() * spread, 1.1 + Math.random() * 1.4 + Math.min(1, sp * .03), 2.4 + Math.random() * 2 + sp * .05, .8 + Math.min(.6, sp * .02), 1.5 + sp * .05 + (fx === 'sand' ? .7 : 0), pc, (S.C.wet ? .3 : fx === 'sand' ? 1.05 : 1) * (.3 + .44 * smooth(6, 26, sp)));
      if (Math.random() < .55) spawn(1, x, y, .2, bvx * 2.4 + lat() * 2, bvy * 2.4 + lat() * 2, 2 + Math.random() * 3, 1.2, .07 + Math.random() * .08, 0, C.chunk, .9);
    } else if (fx === 'mud') {
      if (Math.random() < .6) { const p = spawn(1, x, y, .3, bvx * 2.8 + lat() * 2, bvy * 2.8 + lat() * 2, 2.5 + Math.random() * 3.5, 1.4, .12 + Math.random() * .1, 0, C.mud, 1); p.splat = Math.random() < .3; }
      if (Math.random() < .25) spawn(0, x, y, .3, bvx + lat(), bvy + lat(), .3, 1.6, .5, 1.1, shade(C.mud, .25), .18);
    } else if (fx === 'snow') {
      spawn(0, x, y, .3, car.vx * .38 + lat(), car.vy * .38 + lat(), .7 + Math.random(), 1.4 + Math.random(), .55, 1.6 + sp * .03, C.snow, (k === 'deepsnow' ? .55 : .42) * (.3 + .7 * smooth(5, 24, sp)));
      if (Math.random() < .5) spawn(1, x, y, .2, bvx * 2.5 + lat() * 2, bvy * 2.5 + lat() * 2, 2 + Math.random() * 3, 1.2, .13, 0, '#ffffff', 1);
    } else if (fx === 'ice') {
      if (slip > 2 && Math.random() < .5) spawn(0, x, y, .2, bvx + lat() * .5, bvy + lat() * .5, .3, 1.1, .4, .9, '#eef6ff', .3);
    } else if (fx === 'smoke') {
      if (slip > 3.5 || car.spin > .2) spawn(0, x, y, .3, bvx * .5 + lat() * .5, bvy * .5 + lat() * .5, .5, 2, .5, 1.4, C.smoke, clamp(slip / 26, .06, .26));
      else if (S.C.wet && sp > 9 && Math.random() < .5) spawn(0, x, y, .2, bvx + lat() * .4, bvy + lat() * .4, .4, .9, .5, 1.4, '#e8eef6', .16);
    } else if (fx === 'grass') {
      if (Math.random() < .6) spawn(1, x, y, .2, bvx * 2.2 + lat() * 2, bvy * 2.2 + lat() * 2, 2 + Math.random() * 2, 1, .1, 0, Math.random() < .5 ? C.grass : C.chunk, 1);
      if (Math.random() < .3) spawn(0, x, y, .3, bvx + lat(), bvy + lat(), .4, 1.6, .5, 1.2, C.dust, .16);
      if (S.ev.biome === 'ember' && Math.random() < .3) spawn(1, x, y, .3, bvx * 2 + lat() * 2, bvy * 2 + lat() * 2, 3 + Math.random() * 2, 1.6, .2, 0, Math.random() < .5 ? '#d9772f' : '#c4432c', 1);
    } else if (fx === 'splash') {
      for (let j = 0; j < 3; j++) spawn(1, x, y, .3, bvx * 3 + lat() * 3, bvy * 3 + lat() * 3, 2.5 + Math.random() * 4, 1, .1, 0, C.water, .9);
      spawn(0, x, y, .5, bvx + lat(), bvy + lat(), 1, 1.2, .6, 1.8, '#f2f8fb', .35);
      if (Math.random() < .3) S.ripples.push({ x, y, t: 0, m: 1.2 });
    }
  }
  // roost: the driven wheels fling stones and a sheet of fine dirt back over the car's wake, hardest under power
  // and wheelspin and when the car is sliding
  if (grp !== 'tarmac' && fx !== 'splash' && fx !== 'ice') {
    const drv = car.P.front >= 1 ? fwh : car.P.front <= 0 ? wheels : [wheels[0], wheels[1], fwh[0], fwh[1]];
    const slide = clamp(Math.abs(car.latV || 0) / 6, 0, 1), push = car.thr * (.35 + car.spin * 2.2 + slide * .9) * Math.min(1, sp / 6 + .3);
    car.fx.roost = (car.fx.roost || 0) + push * dt * (R.q === 'high' ? 70 : 40);
    const rc = fx === 'snow' ? '#ffffff' : fx === 'mud' ? C.mud : C.chunk, dc = fx === 'snow' ? C.snow : fx === 'mud' ? shade(C.mud, .25) : fx === 'sand' ? C.sand : k === 'dirt' ? C.dirt : C.dust;
    while (car.fx.roost >= 1) {
      car.fx.roost--;
      const w = drv[(Math.random() * drv.length) | 0], back = 4 + sp * .3 + car.spin * 6;
      const vx = -ch * back + car.vx * .55 + (Math.random() - .5) * 3.5, vy = -sh * back + car.vy * .55 + (Math.random() - .5) * 3.5;
      const pr = spawn(1, w[0], w[1], .25, vx, vy, 2.5 + Math.random() * 4.5, 1.3, .06 + Math.random() * .1, 0, rc, 1); if (fx === 'mud') pr.splat = Math.random() < .25;
      if (Math.random() < .5) spawn(0, w[0], w[1], .5, vx * .45, vy * .45, 1 + Math.random(), 1.6 + Math.random() * 1.4, .6, 2.2, dc, fx === 'snow' ? .4 : .28);
    }
  }
  if (S.ev.biome === 'ember' && grp !== 'tarmac' && sp > 10 && Math.random() < dt * sp * .25) { const w = wheels[0]; spawn(1, w[0], w[1], .4, bvx * 2 + lat() * 2, bvy * 2 + lat() * 2, 3 + Math.random() * 2, 1.8, .22, 0, Math.random() < .5 ? '#e08a3a' : '#c84a2c', 1); }
  // exhaust pops
  if (car.pops > 0) {
    car.fx.pop -= dt;
    if (car.fx.pop <= 0) {
      car.pops--; car.fx.pop = .06 + Math.random() * .08;
      const ex = car.x - ch * (P.hl + .1) - sh * .4, ey = car.y - sh * (P.hl + .1) + ch * .4;
      spawn(2, ex, ey, .4, -ch * 3 + car.vx, -sh * 3 + car.vy, 0, .14, .7, 2, '#ff9a3c', .9);
      spawn(0, ex, ey, .4, -ch * 2 + car.vx * .5, -sh * 2 + car.vy * .5, .4, .8, .3, 1, '#9a96a0', .25);
      AUD.pop();
    }
  }
}
function burstLanding(car, imp) {
  const C = S.fxc || (S.fxc = fxCols()), k = car.sR, fx = SURF[k].fx;
  const col = fx === 'snow' ? C.snow : fx === 'mud' ? C.mud : fx === 'splash' ? C.water : fx === 'smoke' ? C.smoke : C.dust;
  for (let i = 0; i < 14 + imp * 2; i++) { const a = Math.random() * TAU, v = 2 + Math.random() * 4; spawn(0, car.x, car.y, .2, Math.cos(a) * v + car.vx * .3, Math.sin(a) * v + car.vy * .3, .4, 1.8 + Math.random(), .9, 1.6, col, fx === 'smoke' ? .2 : .3); }
}
// a fence or wall section goes over: splinters or stones, a crack, a little jolt
function fenceBreak(car, o) {
  const wall = o.st === 'wall', cols = wall ? ['#a39883', '#c8bda5', '#7d7364'] : o.st === 'snowf' ? ['#e2562e', '#f4f7fd', '#3a3238'] : ['#8c6c4e', '#5a4434', '#c9a477'];
  const n = wall ? 16 : 12, sp = car.speed;
  for (let i = 0; i < n; i++) {
    const u = Math.random(), x = lerp(o.x0, o.x1, u), y = lerp(o.y0, o.y1, u), a = Math.random() * TAU, v = 1.5 + Math.random() * 3;
    spawn(1, x, y, .4 + Math.random() * .6, car.vx * (.35 + Math.random() * .3) + Math.cos(a) * v, car.vy * (.35 + Math.random() * .3) + Math.sin(a) * v, 2.5 + Math.random() * 3, 1.6, wall ? .18 + Math.random() * .14 : .1 + Math.random() * .1, 0, cols[i % 3], 1);
  }
  if (o.st === 'snowf' || S.ev.biome === 'frost') for (let i = 0; i < 6; i++) spawn(0, o.x, o.y, .5, car.vx * .3 + (Math.random() - .5) * 3, car.vy * .3 + (Math.random() - .5) * 3, .8, 1.4, .7, 1.8, '#f4f7fd', .45);
  AUD.hit(Math.min(9, 3 + sp * .15), wall ? 'rock' : 'post'); cam.shake = Math.max(cam.shake, wall ? 2.2 : 1.1);
}
function burstHit(x, y, col) { for (let i = 0; i < 10; i++) { const a = Math.random() * TAU, v = 2 + Math.random() * 4; spawn(1, x, y, .8, Math.cos(a) * v, Math.sin(a) * v, 3 + Math.random() * 3, 1.2, .12, 0, col || '#5a7a4a', 1); } }
function burstLantern(x, y) { for (let i = 0; i < 26; i++) { const a = Math.random() * TAU, v = 1 + Math.random() * 5; spawn(2, x, y, 3, Math.cos(a) * v, Math.sin(a) * v, 1 + Math.random() * 3, 1 + Math.random(), .4, -.1, i % 3 ? '#ffc070' : '#fff0c0', .9); } }
function burstConfetti(x, y) { const cols = ['#f7b27a', '#9ec9c4', '#e98f8a', '#f2cf73', '#f4ecdc', '#b8a4e0']; for (let i = 0; i < 120; i++) spawn(3, x + (Math.random() - .5) * 16, y + (Math.random() - .5) * 16, 6 + Math.random() * 8, (Math.random() - .5) * 2, (Math.random() - .5) * 2, 0, 4 + Math.random() * 3, .32, 0, cols[i % cols.length], 1); }

// ---------- spectators ----------
function updateSpectators(car, dt, t) {
  let cheer = 0;
  for (const o of S.Wd.specs) {
    const dx = o.x - car.x, dy = o.y - car.y, d = hyp(dx, dy);
    if (d > 90 && o.st === 0) { o.cheer *= .97; o.jz = 0; continue; }
    const near = d < 42 && car.speed > 4;
    o.cheer = lerp(o.cheer, near ? 1 : 0, dt * 3);
    cheer += o.cheer;
    if (o.st === 0 && d < 9 + car.speed * .2 && car.speed > 5) {
      o.st = 1; o.t = 0; const l = d || 1; let fx = dx / l + o.nx * .8, fy = dy / l + o.ny * .8; const fl = hyp(fx, fy) || 1;
      o.vx = fx / fl * 6; o.vy = fy / fl * 6; o.face = Math.atan2(o.vy, o.vx);
    }
    if (o.st === 1) { o.t += dt; o.x += o.vx * dt; o.y += o.vy * dt; o.vx *= 1 - 2 * dt; o.vy *= 1 - 2 * dt; o.jz = Math.max(0, Math.sin(o.t * 8)) * .2; if (o.t > 1.4) o.st = 2; }
    else if (o.st === 2) { const hx = o.hx - o.x, hy = o.hy - o.y, hd = hyp(hx, hy); if (hd < .2) { o.st = 0; o.face = Math.atan2(-o.ny, -o.nx); } else { o.x += hx / hd * 1.3 * dt; o.y += hy / hd * 1.3 * dt; o.face = Math.atan2(hy, hx); } o.jz = 0; }
    else { o.jz = o.cheer > .4 ? Math.max(0, Math.sin(t * 7 + o.ph)) * .22 * o.cheer : 0; o.face = Math.atan2(car.y - o.y, car.x - o.x) * .3 + Math.atan2(-o.ny, -o.nx) * .7; }
    if (o.prop === 'cam') { o.flash = Math.max(0, (o.flash || 0) - dt * 6); if (near && Math.random() < dt * .8) o.flash = 1; }
    if (o.prop === 'flare' && Math.random() < dt * 4) spawn(0, o.x, o.y, 2, S.wind[0] * .3, S.wind[1] * .3, 1.2, 2.4, .25, .9, '#d07068', .22);
  }
  return cheer;
}

// ---------- weather & atmosphere ----------
let WX = { drops: [], flakes: [], leaves: [], motes: [], weeds: [], birds: null, birdT: 6 };
function initWeather() {
  WX = { drops: [], flakes: [], leaves: [], motes: [], weeds: [], birds: null, birdT: 4 + Math.random() * 6 };
  const C = S.C, hi = R.q === 'high';
  if (C.weather === 'rain') for (let i = 0; i < (hi ? 320 : 160); i++) WX.drops.push({ x: 0, y: 0, z: Math.random() * 26, init: true });
  if (C.weather === 'snow') for (let i = 0; i < (hi ? 360 : 180); i++) WX.flakes.push({ x: 0, y: 0, z: Math.random() * 30, ph: Math.random() * TAU, s: .05 + Math.random() * .09, init: true });
  if (S.ev.biome === 'ember' && !C.weather) for (let i = 0; i < 40; i++) WX.leaves.push({ x: 0, y: 0, z: Math.random() * 18, ph: Math.random() * TAU, c: ['#d9772f', '#c4432c', '#e8b444'][i % 3], init: true });
  // tumbleweeds bowling across the mesa on the wind
  WX.weeds = S.ev.biome === 'mesa' && !C.weather ? Array.from({ length: 5 }, () => ({ x: 0, y: 0, z: Math.random() * 2, vz: 0, r: .45 + Math.random() * .4, rot: Math.random() * TAU, init: true })) : [];
  const nm = Math.round(70 * (C.motes || 0) + (C.night ? 40 : 0));
  for (let i = 0; i < nm; i++) WX.motes.push({ x: 0, y: 0, z: 1.5 + Math.random() * 12, ph: Math.random() * TAU, init: true, ff: !!C.night });
}
function viewRand(o) { const b = GND.box; o.x = lerp(b[0], b[2], Math.random()); o.y = lerp(b[1], b[3], Math.random()); o.init = false; }
function wrapView(o) {
  const b = GND.box, w = b[2] - b[0], h = b[3] - b[1];
  if (o.x < b[0] - 4) o.x += w; else if (o.x > b[2] + 4) o.x -= w;
  if (o.y < b[1] - 4) o.y += h; else if (o.y > b[3] + 4) o.y -= h;
}
function updateWeather(dt, t) {
  const [wx, wy] = S.wind;
  for (const d of WX.drops) { if (d.init) viewRand(d); d.z -= 30 * dt; d.x += wx * 2 * dt; d.y += wy * 2 * dt; wrapView(d); if (d.z <= 0) { if (Math.random() < .35) S.ripples.push({ x: d.x, y: d.y, t: 0, m: .5 }); d.z = 20 + Math.random() * 8; viewRand(d); d.z = 20 + Math.random() * 8; } }
  for (const f of WX.flakes) { if (f.init) viewRand(f); f.z -= 2.4 * dt; f.x += (wx * .8 + Math.sin(t * .9 + f.ph) * .8) * dt; f.y += (wy * .8 + Math.cos(t * .7 + f.ph) * .5) * dt; wrapView(f); if (f.z <= 0) { viewRand(f); f.z = 26 + Math.random() * 6; } }
  for (const l of WX.leaves) { if (l.init) viewRand(l); l.z -= 1.4 * dt; l.x += (wx + Math.sin(t * 1.3 + l.ph) * 1.6) * dt; l.y += (wy + Math.cos(t + l.ph)) * dt; wrapView(l); if (l.z <= 0) { viewRand(l); l.z = 16 + Math.random() * 4; } }
  for (const m of WX.motes) { if (m.init) viewRand(m); m.x += (wx * .3 + Math.sin(t * .5 + m.ph) * .4) * dt; m.y += (wy * .3 + Math.cos(t * .4 + m.ph) * .4) * dt; wrapView(m); }
  for (const w of WX.weeds) {
    if (w.init) viewRand(w);
    const sp = 3.5 + hyp(wx, wy) * 1.4, wl = hyp(wx, wy) || 1;
    w.x += wx / wl * sp * dt; w.y += wy / wl * sp * dt; w.rot += sp / w.r * dt; w.vz -= 9.8 * dt; w.z += w.vz * dt;
    if (w.z <= 0) { w.z = 0; w.vz = 1.2 + Math.random() * 2.6; }
    wrapView(w);
  }
  for (const r of S.ripples) r.t += dt;
  S.ripples = S.ripples.filter(r => r.t < .7);
  if (S.ripples.length > 220) S.ripples.splice(0, S.ripples.length - 220);
  for (const h of S.haze) { if (h.init) viewRand(h); h.x += wx * 1.2 * dt; h.y += wy * 1.2 * dt; wrapView(h); }
  for (const c of S.clouds) { c.x += wx * 3 * dt; c.y += wy * 3 * dt; if (c.x > S.Wd.W + 200) c.x = -200; if (c.x < -200) c.x = S.Wd.W + 200; if (c.y > S.Wd.H + 200) c.y = -200; if (c.y < -200) c.y = S.Wd.H + 200; }
  // birds
  if (!S.C.night && !S.C.weather) {
    WX.birdT -= dt;
    if (!WX.birds && WX.birdT <= 0) {
      const a = Math.random() * TAU, d = 70, n = 5 + (Math.random() * 6 | 0), bx = cam.x - Math.cos(a) * d, by = cam.y - Math.sin(a) * d;
      WX.birds = { t: 0, list: Array.from({ length: n }, (_, i) => ({ x: bx - Math.cos(a) * (i % 2 ? i : -i) * 2 + Math.sin(a) * i * 2.5, y: by - Math.sin(a) * (i % 2 ? i : -i) * 2 - Math.cos(a) * i * 2.5, ph: Math.random() * TAU })), vx: Math.cos(a) * 14, vy: Math.sin(a) * 14 };
    }
    if (WX.birds) { WX.birds.t += dt; for (const b of WX.birds.list) { b.x += WX.birds.vx * dt; b.y += WX.birds.vy * dt; } if (WX.birds.t > 14) { WX.birds = null; WX.birdT = 12 + Math.random() * 18; } }
  }
}
function drawWeatherLow(ctx) { // ground layer, world units
  if (!S.ripples.length) return;
  ctx.strokeStyle = 'rgba(225,235,248,.5)'; ctx.lineWidth = 1.2 / GND.ppm; ctx.beginPath();
  for (const r of S.ripples) { const rr = .1 + r.t * r.m * 1.2; ctx.moveTo(r.x + rr, r.y); ctx.ellipse(r.x, r.y, rr, rr * .7, 0, 0, TAU); }
  ctx.stroke();
}
function drawWeatherHigh(ctx, t) {
  if (WX.drops.length) {
    ctx.strokeStyle = 'rgba(222,234,250,.5)'; ctx.lineWidth = 1.2; ctx.beginPath();
    for (const d of WX.drops) { proj(d.x, d.y, d.z, _p); proj(d.x - S.wind[0] * .12, d.y - S.wind[1] * .12, d.z + 3.5, _q); ctx.moveTo(_p[0], _p[1]); ctx.lineTo(_q[0], _q[1]); }
    ctx.stroke();
  }
  if (WX.flakes.length) {
    ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.beginPath();
    for (const f of WX.flakes) { proj(f.x, f.y, f.z, _p); const r = Math.max(.7, f.s * cam.ppm * _p[2]); ctx.moveTo(_p[0] + r, _p[1]); ctx.arc(_p[0], _p[1], r, 0, TAU); }
    ctx.fill();
  }
  for (const l of WX.leaves) { proj(l.x, l.y, l.z, _p); const s = .22 * cam.ppm * _p[2]; ctx.fillStyle = l.c; ctx.beginPath(); ctx.ellipse(_p[0], _p[1], s, s * Math.abs(Math.sin(t * 3 + l.ph)) * .6 + 1, t * 2 + l.ph, 0, TAU); ctx.fill(); }
  if (WX.motes.length) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const spr = softSprite(WX.motes[0].ff ? '#d8ff9a' : S.B.motes);
    for (const m of WX.motes) { proj(m.x, m.y, m.z, _p); const tw = .5 + .5 * Math.sin(t * (m.ff ? 4 : 2) + m.ph), s = (m.ff ? .35 : .22) * cam.ppm * _p[2]; ctx.globalAlpha = (m.ff ? .65 : .35) * tw; ctx.drawImage(spr, _p[0] - s, _p[1] - s, s * 2, s * 2); }
    ctx.restore();
  }
  if (WX.weeds && WX.weeds.length) {
    const spr = weedSprite();
    for (const w of WX.weeds) { if (w.init) continue; proj(w.x, w.y, w.z + w.r, _p); const s = w.r * 1.15 * cam.ppm * _p[2]; if (s < 1 || _p[3] < 4) continue; xform(ctx, _p[0], _p[1], w.rot); ctx.drawImage(spr, -s, -s, s * 2, s * 2); xreset(ctx); }
  }
  if (WX.birds) {
    ctx.strokeStyle = 'rgba(30,26,40,.75)'; ctx.lineWidth = 1.4; ctx.lineCap = 'round'; ctx.beginPath();
    const a = Math.atan2(WX.birds.vy, WX.birds.vx) + cam.sa;
    for (const b of WX.birds.list) {
      proj(b.x, b.y, 20, _p); const s = .7 * cam.ppm * _p[2], fl = Math.sin(t * 10 + b.ph) * .5;
      const bx = Math.cos(a + Math.PI), by = Math.sin(a + Math.PI), nx = -by, ny = bx;
      ctx.moveTo(_p[0] + bx * s * .5 + nx * s, _p[1] + by * s * .5 + ny * s + fl * s * .4); ctx.lineTo(_p[0], _p[1]); ctx.lineTo(_p[0] + bx * s * .5 - nx * s, _p[1] + by * s * .5 - ny * s + fl * s * .4);
    }
    ctx.stroke();
  }
}

let _weed = null;
function weedSprite() {
  if (_weed) return _weed;
  const c = mkCanvas(96, 96), x = c.getContext('2d'), r = RNG(424242); x.translate(48, 48); x.lineCap = 'round';
  for (let i = 0; i < 70; i++) { const a = r() * TAU, rr = 18 + r() * 26, a2 = a + r.sym() * 1.6; x.strokeStyle = i % 3 ? 'rgba(120,88,52,.85)' : 'rgba(176,140,92,.9)'; x.lineWidth = 1.2 + r() * 1.6; x.beginPath(); x.arc(r.sym() * 8, r.sym() * 8, rr, a, a2, r() < .5); x.stroke(); }
  return (_weed = c);
}
// ---------- paper grain (GRIS skill) ----------
let _paper = null;
function makePaperTile(sz, seed) {
  const c = mkCanvas(sz, sz), g = c.getContext('2d'), id = g.createImageData(sz, sz), d = id.data;
  let rs = seed; const rnd = () => { rs = (rs * 16807) % 2147483647; return rs / 2147483647; };
  const oct = cell => {
    const n = Math.ceil(sz / cell) + 1, gr = new Float32Array(n * n); for (let k = 0; k < gr.length; k++) gr[k] = rnd();
    return (x, y) => { const gx = x / cell, gy = y / cell, x0 = Math.floor(gx), y0 = Math.floor(gy), fx = gx - x0, fy = gy - y0, sx2 = fx * fx * (3 - 2 * fx), sy2 = fy * fy * (3 - 2 * fy), w = n;
      const a = gr[(y0 % (w - 1)) * w + (x0 % (w - 1))], b = gr[(y0 % (w - 1)) * w + ((x0 + 1) % (w - 1))], c2 = gr[((y0 + 1) % (w - 1)) * w + (x0 % (w - 1))], e = gr[((y0 + 1) % (w - 1)) * w + ((x0 + 1) % (w - 1))];
      return a + (b - a) * sx2 + (c2 - a) * sy2 + (a - b - c2 + e) * sx2 * sy2; };
  };
  const o1 = oct(64), o2 = oct(32), o3 = oct(8), amp = 15;
  for (let y = 0; y < sz; y++) for (let x = 0; x < sz; x++) {
    const v = o1(x, y) * .5 + o2(x, y) * .3 + o3(x, y) * .2 + (rnd() - .5) * .3, k = (y * sz + x) * 4, dv = v - .5;
    d[k] = d[k + 1] = d[k + 2] = dv > 0 ? 248 : 20; d[k + 3] = Math.min(255, Math.abs(dv) * 2 * amp);
  }
  g.putImageData(id, 0, 0); return c;
}
function drawGrain(ctx, t, W, H) {
  if (!_paper) { const a = makePaperTile(256, 7), b = makePaperTile(256, 31); _paper = [ctx.createPattern(a, 'repeat'), ctx.createPattern(b, 'repeat')]; }
  const breath = .85 + .15 * Math.sin(t * .6);
  ctx.save(); ctx.globalAlpha = breath;
  for (let L = 0; L < 2; L++) {
    const dx = Math.sin(t * (L ? .045 : .07) + L * 2) * 18 + t * (L ? -1.6 : 1.1), dy = Math.cos(t * (L ? .06 : .05) + L) * 14 + t * (L ? .9 : -.7);
    ctx.save(); ctx.translate((dx % 256 + 256) % 256 - 256, (dy % 256 + 256) % 256 - 256); ctx.fillStyle = _paper[L]; ctx.fillRect(0, 0, W + 512, H + 512); ctx.restore();
  }
  ctx.restore();
}
function vignetteSprite() {
  if (R.vig && R.vig.width === Math.round(R.W / 2)) return R.vig;
  const c = mkCanvas(R.W / 2, R.H / 2), x = c.getContext('2d'), w = c.width, h = c.height;
  const g = x.createRadialGradient(w / 2, h / 2, Math.min(w, h) * .3, w / 2, h / 2, Math.hypot(w, h) * .62);
  g.addColorStop(0, 'rgba(20,14,30,0)'); g.addColorStop(1, 'rgba(20,14,30,.5)'); x.fillStyle = g; x.fillRect(0, 0, w, h);
  return (R.vig = c);
}

// ---------- frame composition ----------
function gatherStanding(car, ghost) {
  const Wd = S.Wd, HC = Wd.HC, m = 24, b = GND.box, out = [], lowQ = R.q !== 'high';
  const gx0 = clamp(Math.floor((b[0] - m) / HC), 0, Wd.hcw - 1), gx1 = clamp(Math.floor((b[2] + m) / HC), 0, Wd.hcw - 1), gy0 = clamp(Math.floor((b[1] - m) / HC), 0, Wd.hch - 1), gy1 = clamp(Math.floor((b[3] + m) / HC), 0, Wd.hch - 1);
  const add = (k, o, ghostFlag) => { proj(o.x, o.y, 0, _p); if (_p[0] < -260 || _p[0] > R.W + 260 || _p[1] < -340 || _p[1] > R.H + 220) return; out.push({ k, o, d: _p[3], ghost: ghostFlag }); };
  for (let gy = gy0; gy <= gy1; gy++) for (let gx = gx0; gx <= gx1; gx++) for (const i of Wd.grid[gy * Wd.hcw + gx]) { const o = Wd.objs[i]; if (o.hidden || (lowQ && ((o.k === 'bank' && (i & 1)) || (o.sp === 'shrub' && o.h < 1.25)))) continue; add(o.k, o); }
  for (const o of Wd.specs) if (inBox(o.x, o.y, 10)) add('spec', o);
  for (const l of Wd.lanterns) if (!l.got && inBox(l.x, l.y, 10)) add('lantern', l);
  if (ghost) add('car', ghost, true);
  if (car) add('car', car);
  out.sort((a, b2) => b2.d - a.d);
  return out;
}

function drawWorld(t, car, ghost, carSpec, liv, ghostSpec) {
  const ctx = R.ctx, B = S.B, C = S.C, Wd = S.Wd, useGL = GL.ok && GL.scene && !GL.lost;
  camDerive(); groundSetup(!useGL);
  const list = gatherStanding(car, ghost);
  if (useGL) {
    glRender(t, list, buildLights(t, car));
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.clearRect(0, 0, R.cv.width, R.cv.height);
  } else {
    const g = GND.x, bx = GND.box;
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    g.fillStyle = B.ground[0]; g.fillRect(0, 0, GND.w, GND.h);
    gSet(g);
    const x0 = clamp(bx[0] - 2, 0, Wd.W), y0 = clamp(bx[1] - 2, 0, Wd.H), x1 = clamp(bx[2] + 2, 0, Wd.W), y1 = clamp(bx[3] + 2, 0, Wd.H);
    if (x1 > x0 && y1 > y0) g.drawImage(S.bake, x0 * S.PXM, y0 * S.PXM, (x1 - x0) * S.PXM, (y1 - y0) * S.PXM, x0, y0, x1 - x0, y1 - y0);
    g.save(); g.scale(18 / 256, 18 / 256); g.globalAlpha = .32; g.fillStyle = S.gpat; g.fillRect(bx[0] * 256 / 18, bx[1] * 256 / 18, (bx[2] - bx[0]) * 256 / 18, (bx[3] - bx[1]) * 256 / 18); g.restore();
    drawRoad(g);
    gSet(g); drawDecals(g); drawDecor(g); gSet(g); drawWeatherLow(g);
    drawShadows(list, g);
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = B.ground[0]; ctx.fillRect(0, 0, R.cv.width, R.cv.height);
    warpGround(ctx);
  }
  xreset(ctx);
  // horizon: painted GRIS ridges above the far haze line (drawn before standing objects so far trees overlap them)
  const hzc = C.night ? mixHex(B.ridge[2], '#0a0c20', .5) : mixHex(B.haze, B.sky[3], .35), yc = GND.yCut;
  if (yc > -2) drawSkyBand(ctx, yc, t, hzc);
  // aerial perspective: mist that swallows the foot of the ridges and the distant ground (objects fade into it by depth)
  const fog = C.weather === 'fog', da = fog ? 1 : C.night ? .85 : .92, span = R.H * (fog ? .55 : .38), ycg = yc > 0 ? yc : Math.min(yc, -R.H * .08);
  const dg = ctx.createLinearGradient(0, ycg, 0, ycg + span + (yc - ycg)); dg.addColorStop(0, hexA(hzc, da)); dg.addColorStop(.35, hexA(hzc, da * .38)); dg.addColorStop(1, hexA(hzc, 0));
  ctx.fillStyle = dg; ctx.fillRect(0, Math.max(0, yc), R.W, span + 4);
  if (yc > 0) { const mh = R.H * .075, mg = ctx.createLinearGradient(0, yc - mh, 0, yc); mg.addColorStop(0, hexA(hzc, 0)); mg.addColorStop(1, hexA(hzc, da)); ctx.fillStyle = mg; ctx.fillRect(0, yc - mh, R.W, mh + .5); }
  const depFar = GND.vFar * cam.cp + cam.hc * cam.sp;
  // tapes on posts
  for (const tp of Wd.tapes) {
    const pm = tp.pts[tp.pts.length >> 1]; if (!inBox(pm[0], pm[1], 30)) continue;
    ctx.lineWidth = Math.max(1, cam.ppm * .07); ctx.strokeStyle = '#2a2530';
    ctx.beginPath(); tp.pts.forEach((p, i) => { if (i % 3) return; proj(p[0], p[1], 0, _p); proj(p[0], p[1], 1.05, _q); ctx.moveTo(_p[0], _p[1]); ctx.lineTo(_q[0], _q[1]); }); ctx.stroke();
    ctx.beginPath(); tp.pts.forEach((p, i) => { proj(p[0], p[1], 1, _q); i ? ctx.lineTo(_q[0], _q[1]) : ctx.moveTo(_q[0], _q[1]); });
    ctx.setLineDash([cam.ppm * .5, cam.ppm * .5]); ctx.strokeStyle = '#f3efe6'; ctx.lineWidth = Math.max(1, cam.ppm * .1); ctx.stroke();
    ctx.lineDashOffset = cam.ppm * .5; ctx.strokeStyle = '#e04c3c'; ctx.stroke(); ctx.setLineDash([]); ctx.lineDashOffset = 0;
  }
  // standing objects, far to near; anything between the camera and the car turns see-through
  let cx0 = -1e9, cy0 = -1e9, cd = 0;
  if (car) { proj(car.x, car.y, .6, _p); cx0 = _p[0]; cy0 = _p[1]; cd = _p[3]; }
  const fr = Math.min(R.W, R.H) * .22;
  for (const it of list) {
    const o = it.o; if (it.d < 3) continue;
    let fade = 1;
    if (car && it.k !== 'car' && it.d < cd - 1 && (it.k === 'tree' || it.k === 'house' || it.k === 'rock' || it.k === 'arch' || it.k === 'mill' || it.k === 'pump' || it.k === 'logs' || it.k === 'tpole')) {
      proj(o.x, o.y, (o.h || 2) * .55, _q);
      const r = ((o.cr || o.r || o.L / 2 || 3) + 1) * cam.ppm * _q[2];
      if (Math.abs(_q[0] - cx0) < r + fr * .5 && _q[1] + r > cy0 - fr * 1.1 && _q[1] - r * 1.5 < cy0 + fr * .4) fade = .26;
    }
    if (it.d < 9) fade = Math.min(fade, (it.d - 3) / 6);
    if (it.d > depFar * .45) fade = Math.min(fade, 1 - .92 * smooth(depFar * .45, depFar * .98, it.d));
    ctx.globalAlpha = fade;
    switch (it.k) {
      case 'tree': drawTree(ctx, o); break;
      case 'rock': drawRock(ctx, o); break;
      case 'house': drawHouse(ctx, o); break;
      case 'spec': drawSpectator(ctx, o, t); break;
      case 'hay': drawHay(ctx, o); break;
      case 'arch': drawArch(ctx, o, t); break;
      case 'lantern': drawLantern(ctx, o, t); break;
      case 'pole': case 'sign': case 'lamp': case 'jboard': case 'jpost': case 'stake': drawPoleLike(ctx, o, t); break;
      case 'chev': drawChev(ctx, o); break;
      case 'tpole': drawTPole(ctx, o); break;
      case 'fence': drawFence(ctx, o); break;
      case 'bank': drawBank(ctx, o); break;
      case 'slamp': drawSLamp(ctx, o); break;
      case 'logs': drawLogs(ctx, o); break;
      case 'mill': drawMill(ctx, o, t); break;
      case 'pump': drawPump(ctx, o, t); break;
      case 'car': if (it.ghost) drawCar(ctx, o, ghostSpec, o.liv ?? 4, { alpha: .42, ghost: true, num: '★' }); else drawCar(ctx, o, carSpec, liv, {}); break;
    }
  }
  ctx.globalAlpha = 1; xreset(ctx);
  drawParts(ctx);
  if (car) drawStreaks(ctx, car, t);
  drawCarGlows(ctx, ghost, true, t); drawCarGlows(ctx, car, false, t);
  // low drifting haze wisps
  const hz = softSprite(B.haze, .3);
  for (const h of S.haze) { if (h.init) continue; proj(h.x, h.y, h.z, _p); if (_p[3] < 12) continue; const r = h.r * cam.ppm * _p[2] * (fog ? 1.4 : 1); ctx.globalAlpha = fog ? .3 : .09; ctx.drawImage(hz, _p[0] - r, _p[1] - r * .5, r * 2, r); }
  ctx.globalAlpha = 1;
  drawWeatherHigh(ctx, t);
  if (C.dark > 0) drawLights(ctx, t, car, useGL);
  // sun glow + rays, placed by where the light comes from relative to the camera
  const lu = S.lightDir[0] * cam.rx + S.lightDir[1] * cam.ry, lv = S.lightDir[0] * cam.fx + S.lightDir[1] * cam.fy;
  if (C.glow > 0) {
    const sxp = R.W / 2 + lu * R.W * .62, syp = Math.min(R.H / 2 - lv * R.H * .7, yc > 0 ? yc : 1e9), rad = Math.max(R.W, R.H) * .75;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = C.glow * .28; ctx.drawImage(softSprite(B.glow, .15), sxp - rad, syp - rad, rad * 2, rad * 2);
    ctx.globalAlpha = C.glow * .024; ctx.fillStyle = B.sun;
    const base = Math.atan2(R.H / 2 - syp, R.W / 2 - sxp);
    for (let i = 0; i < 5; i++) {
      const a = base + (i - 2) * .2 + Math.sin(t * .13 + i * 1.7) * .04, w = .012 + (i % 3) * .007, L = Math.hypot(R.W, R.H) * 1.2;
      ctx.beginPath(); ctx.moveTo(sxp, syp); ctx.lineTo(sxp + Math.cos(a - w) * L, syp + Math.sin(a - w) * L); ctx.lineTo(sxp + Math.cos(a + w) * L, syp + Math.sin(a + w) * L); ctx.fill();
    }
    ctx.restore();
  }
  if (fog) {
    let fx0 = R.W / 2, fy0 = R.H * .62; if (car) { proj(car.x, car.y, 0, _p); fx0 = _p[0]; fy0 = _p[1]; }
    const fg = ctx.createRadialGradient(fx0, fy0, Math.min(R.W, R.H) * .2, fx0, fy0, Math.max(R.W, R.H) * .62);
    fg.addColorStop(0, hexA(B.haze, 0)); fg.addColorStop(1, hexA(mixHex(B.haze, '#ffffff', .3), .7)); ctx.fillStyle = fg; ctx.fillRect(0, 0, R.W, R.H);
  }
  if (C.tint && C.tintA) { ctx.globalAlpha = C.tintA; ctx.fillStyle = C.tint; ctx.fillRect(0, 0, R.W, R.H); ctx.globalAlpha = 1; }
  const gw = ctx.createLinearGradient(R.W / 2 + lu * R.W * .6, R.H / 2 - lv * R.H * .6, R.W / 2 - lu * R.W * .6, R.H / 2 + lv * R.H * .6);
  gw.addColorStop(0, hexA(B.light, C.night ? 0 : .09)); gw.addColorStop(1, hexA(B.shade, C.night ? .1 : .14)); ctx.fillStyle = gw; ctx.fillRect(0, 0, R.W, R.H);
  ctx.drawImage(vignetteSprite(), 0, 0, R.W, R.H);
  drawGrain(ctx, t, R.W, R.H);
}

// distant ridges and sky above the far haze line; they turn with the camera like a panorama
function drawSkyBand(ctx, yc, t, hzc) {
  const B = S.B, C = S.C, h = yc + 3, nightK = C.night ? .78 : C.dark * .6;
  const sky = ctx.createLinearGradient(0, yc - R.H * .55, 0, h);
  B.sky.forEach((c, i) => sky.addColorStop(i / (B.sky.length - 1), mixHex(c, '#05060f', nightK)));
  ctx.fillStyle = sky; ctx.fillRect(0, 0, R.W, h);
  const fovH = 2 * Math.atan(R.W / 2 / cam.focal);
  const sunA = Math.atan2(S.lightDir[1], S.lightDir[0]), dA = wrapA(sunA - cam.rot);
  if (C.glow > 0 && Math.abs(dA) < fovH * .7) {
    const sxp = R.W / 2 + Math.tan(dA) * cam.focal, syp = yc - R.H * .07, rr = R.H * .4;
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = .5 * C.glow; ctx.drawImage(softSprite(B.glow, .12), sxp - rr, syp - rr, rr * 2, rr * 2); ctx.restore();
    ctx.fillStyle = B.sun; ctx.beginPath(); ctx.arc(sxp, syp, R.H * .028, 0, TAU); ctx.fill();
  }
  for (let L = 0; L < 3; L++) {
    const col = mixHex(mixHex(B.ridge[L], B.haze, .5 - L * .14), '#05060f', nightK * .8), amp = R.H * (.045 + L * .028);
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, h);
    for (let x = 0; x <= R.W + 8; x += 8) {
      const a = cam.rot + Math.atan((x - R.W / 2) / cam.focal) * (1 + L * .06);
      const n = Math.sin(a * 3 + L * 1.7) * .42 + Math.sin(a * 7 + L * 2.9) * .28 + Math.sin(a * 13 + L * .7) * .14 + Math.sin(a * 29 + L) * .05;
      ctx.lineTo(x, yc - amp * (.6 + n * .65));
    }
    ctx.lineTo(R.W, h); ctx.closePath(); ctx.fill();
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = .08; ctx.strokeStyle = B.glow; ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore();
  }
}

// emissive lamps: tail, brake, reverse and headlights with soft halos, plus a beam through the air at night
function drawCarGlows(ctx, car, ghost, t) {
  if (!car || !car.P) return;
  const C = S.C, P = car.P, ch = Math.cos(car.h), sh = Math.sin(car.h), k = ghost ? .35 : 1;
  const night = clamp(Math.max(C.dark * 1.2, C.weather ? .4 : 0, S.cond === 'dusk' || S.cond === 'overcast' ? .35 : 0), 0, 1);
  const brake = car.brk > .2 || car.hand, z = car.z || 0;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const G3 = carGeo(car.spec || P.spec), MM = CGL.ok && CAR_MESH[(car.spec || P.spec).id] ? CAR_MESH[(car.spec || P.spec).id].meta : null;
  const tv = MM ? MM.tailV : G3.hwT - .36, tz = MM ? MM.tailZ : G3.belt - .17;
  // lamp cores only show on the faces turned to the camera (the body hides the rest)
  const away = ch * cam.fx + sh * cam.fy, tailV = smooth(-.45, .05, away), headV = smooth(-.05, .45, -away);
  const DM = car.dm || { hl: [0, 0], tl: [0, 0] }, headsOk = 2 - DM.hl[0] - DM.hl[1];
  for (const sd of [-1, 1]) {
    const tx = car.x - ch * (P.hl + .05) - sh * sd * tv, ty = car.y - sh * (P.hl + .05) + ch * sd * tv;
    proj(tx, ty, tz + z, _p); const s = cam.ppm * _p[2];
    const li = sd > 0 ? 0 : 1, ti = (brake ? 1 : .18 + .5 * night) * k * (1 - DM.tl[li]);
    ctx.globalAlpha = ti * tailV; ctx.drawImage(softSprite('#ff4630', .5), _p[0] - s * .42, _p[1] - s * .42, s * .84, s * .84);
    ctx.globalAlpha = ti * (brake ? .5 : .3) * (.4 + .6 * night); ctx.drawImage(softSprite('#ff2010', .08), _p[0] - s * 2.4, _p[1] - s * 2.4, s * 4.8, s * 4.8);
    if (car.rev) { ctx.globalAlpha = .8 * k * tailV; ctx.drawImage(softSprite('#f6f4ff', .5), _p[0] - s * .35 + sd * s * .2, _p[1] - s * .35, s * .7, s * .7); }
    const hv = MM ? MM.headV : Math.abs(G3.out[2][1]) - .2, hx = car.x + ch * (P.hl + .04) - sh * sd * hv, hy = car.y + sh * (P.hl + .04) + ch * sd * hv;
    proj(hx, hy, (MM ? MM.headZ : G3.belt - .2) + z, _q); const hs = cam.ppm * _q[2];
    if (DM.hl[li]) continue;
    ctx.globalAlpha = (.12 + .7 * night) * k * headV; ctx.drawImage(softSprite('#fff4dc', .45), _q[0] - hs * .5, _q[1] - hs * .5, hs, hs);
    if (night > .25) { ctx.globalAlpha = .2 * night * k; ctx.drawImage(softSprite('#ffe8b8', .06), _q[0] - hs * 2.6, _q[1] - hs * 2.6, hs * 5.2, hs * 5.2); }
  }
  if (night > .3 && !ghost && headsOk > 0) {
    const fx = car.x + ch * (P.hl + .2), fy = car.y + sh * (P.hl + .2); proj(fx, fy, .62 + z, _p);
    const pts = [-.32, 0, .32].map(a => { proj(fx + Math.cos(car.h + a) * 34, fy + Math.sin(car.h + a) * 34, .5, _q); return [_q[0], _q[1]]; });
    // the beam starts clear so it never paints over the car's own roof, brightest a few metres out
    const g = ctx.createLinearGradient(_p[0], _p[1], pts[1][0], pts[1][1]), bA = .16 * night * headsOk / 2;
    g.addColorStop(0, 'rgba(255,236,200,0)'); g.addColorStop(.1 * (1 - headV) + .01, `rgba(255,236,200,${bA * headV})`); g.addColorStop(.24, `rgba(255,236,200,${bA})`); g.addColorStop(1, 'rgba(255,236,200,0)');
    ctx.globalAlpha = 1; ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(_p[0], _p[1]); ctx.lineTo(pts[0][0], pts[0][1]); ctx.quadraticCurveTo(pts[1][0], pts[1][1], pts[2][0], pts[2][1]); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

// lights for the GPU ground: headlight spot, tail lights and the stage's lamps, flares and windows
function buildLights(t, car) {
  const C = S.C, L = { dark: C.dark, amb: C.night ? [.17, .2, .34] : [.62, .5, .66], n: 0, pos: new Float32Array(64), col: new Float32Array(48), head: [0, 0, 0, 1], headOn: 0 };
  if (C.dark <= 0) return L;
  const cand = [];
  const add = (x, y, r, i, col) => { if (inBox(x, y, r)) cand.push([x, y, r, i, col]); };
  if (car) {
    const ch = Math.cos(car.h), sh = Math.sin(car.h), P = car.P, brake = car.brk > .2 || car.hand;
    const hk = car.dm ? 2 - car.dm.hl[0] - car.dm.hl[1] : 2; L.head = [car.x + ch * P.hl, car.y + sh * P.hl, car.h, hk === 2 ? 58 : 34]; L.headOn = hk > 0 ? (hk === 2 ? 1 : .55) : 0;
    add(car.x - ch * (P.hl + 1.6), car.y - sh * (P.hl + 1.6), brake ? 7 : 4.5, brake ? 1.5 : .55, [1, .14, .08]);
    if (car.rev) add(car.x - ch * (P.hl + 2), car.y - sh * (P.hl + 2), 5, .9, [.95, .95, 1]);
    add(car.x, car.y, 5, .35, [1, .9, .75]);
  }
  for (const o of S.Wd.specs) if (o.prop === 'flare') add(o.x, o.y, 10, .9 + .25 * Math.sin(t * 22 + o.ph), [1, .25, .15]); else if (o.prop === 'torch') add(o.x, o.y, 5, .5, [1, .95, .85]);
  for (const o of S.Wd.objs) { if (o.k === 'lamp') add(o.x, o.y, 16, 1.1, [1, .82, .55]); else if (o.k === 'slamp') add(o.x + Math.sin(o.a) * o.side * 1.7, o.y - Math.cos(o.a) * o.side * 1.7, 13, 1, [1, .84, .58]); else if (o.k === 'house' && o.lit) add(o.x, o.y, 12, .55, [1, .7, .4]); else if (o.k === 'arch') add(o.x, o.y, 18, .8, [1, .9, .75]); }
  for (const l of S.Wd.lanterns) if (!l.got) add(l.x, l.y, 12, .9, [1, .65, .35]);
  if (car) cand.sort((a, b) => hyp(a[0] - car.x, a[1] - car.y) - hyp(b[0] - car.x, b[1] - car.y));
  for (const c of cand.slice(0, 16)) { L.pos.set([c[0], c[1], c[2], c[3]], L.n * 4); L.col.set(c[4], L.n * 3); L.n++; }
  return L;
}

function drawLights(ctx, t, car, useGL) {
  const L = R.lix, w = R.light.width, h = R.light.height, C = S.C, k = cam.k;
  L.setTransform(1, 0, 0, 1, 0, 0); L.globalCompositeOperation = 'source-over';
  L.fillStyle = C.night ? '#070a1e' : mixHex(C.tint || '#30204a', '#100a20', .5); L.fillRect(0, 0, w, h);
  L.globalCompositeOperation = 'destination-out';
  const spr = softSprite('#ffffff', .25);
  const hole = (x, y, r, a, z) => { proj(x, y, z || 0, _p); const X = _p[0] * .5, Y = _p[1] * .5, rr = r * cam.ppm * _p[2] * .5; if (X < -rr || Y < -rr || X > w + rr || Y > h + rr) return; L.globalAlpha = a; L.drawImage(spr, X - rr, Y - rr * k, rr * 2, rr * 2 * k); };
  const glows = [];
  if (car) {
    const ch = Math.cos(car.h), sh = Math.sin(car.h), P = car.P, ox = car.x + ch * P.hl, oy = car.y + sh * P.hl;
    proj(ox, oy, 0, _p); const X0 = _p[0] * .5, Y0 = _p[1] * .5;
    proj(ox + ch * 46, oy + sh * 46, 0, _q); const len = Math.max(20, hyp(_q[0] * .5 - X0, _q[1] * .5 - Y0));
    const gr = L.createRadialGradient(X0, Y0, 0, X0, Y0, len); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.6, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    // the cone opens a few metres ahead of the nose, so it lights trees and people but not the car's own roof
    L.globalAlpha = car.dm ? (2 - car.dm.hl[0] - car.dm.hl[1]) / 2 : 1; L.fillStyle = gr; L.beginPath();
    const n4x = ox + ch * 4, n4y = oy + sh * 4; proj(n4x + sh * 1.6, n4y - ch * 1.6, 0, _q); L.moveTo(_q[0] * .5, _q[1] * .5);
    for (let i = 0; i <= 10; i++) { const a = car.h - .42 + .84 * i / 10; proj(ox + Math.cos(a) * 50, oy + Math.sin(a) * 50, 0, _q); L.lineTo(_q[0] * .5, _q[1] * .5); }
    proj(n4x - sh * 1.6, n4y + ch * 1.6, 0, _q); L.lineTo(_q[0] * .5, _q[1] * .5);
    L.closePath(); L.fill();
    hole(car.x, car.y, 7, .8);
    glows.push([car.x + ch * (P.hl + 2), car.y + sh * (P.hl + 2), 6, '#fff1d0', .35]);
    glows.push([car.x - ch * P.hl, car.y - sh * P.hl, (car.brk > .3 || car.hand) ? 3 : 2, '#ff3a2a', (car.brk > .3 || car.hand) ? .5 : .25]);
  }
  for (const o of S.Wd.specs) if ((o.prop === 'flare' || o.prop === 'torch') && inBox(o.x, o.y, 20)) { const f = o.prop === 'flare'; hole(o.x, o.y, f ? 9 : 5, f ? .7 + .1 * Math.sin(t * 20 + o.ph) : .5); if (f) glows.push([o.x, o.y, 6, '#ff4a30', .35]); }
  for (const o of S.Wd.objs) {
    if (!inBox(o.x, o.y, 20)) continue;
    if (o.k === 'lamp') { hole(o.x, o.y, 14, .85); glows.push([o.x, o.y, 5, '#ffd28a', .4, 4.5]); }
    else if (o.k === 'slamp') { const ex = o.x + Math.sin(o.a) * o.side * 1.7, ey = o.y - Math.cos(o.a) * o.side * 1.7; hole(ex, ey, 11, .8); glows.push([ex, ey, 4, '#ffd890', .35, 5.4]); }
    else if (o.k === 'house' && o.lit) { hole(o.x, o.y, 11, .55); glows.push([o.x, o.y, 8, '#ffc070', .22]); }
    else if (o.k === 'arch') hole(o.x, o.y, 16, .8);
  }
  for (const l of S.Wd.lanterns) if (!l.got) hole(l.x, l.y, 10, .8);
  if (WX.motes.length && WX.motes[0].ff) for (const m of WX.motes) hole(m.x, m.y, 1.2, .3, m.z);
  L.globalAlpha = 1; L.globalCompositeOperation = 'source-over';
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = C.dark; if (useGL) ctx.globalCompositeOperation = 'source-atop'; ctx.drawImage(R.light, 0, 0, R.cv.width, R.cv.height); ctx.restore();
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (const [x, y, r, col, a, z] of glows) { proj(x, y, z || .5, _p); const rr = r * cam.ppm * _p[2]; ctx.globalAlpha = a * C.dark; ctx.drawImage(softSprite(col), _p[0] - rr, _p[1] - rr, rr * 2, rr * 2); }
  ctx.restore();
}

// speed lines: thin streaks of air hanging beside the road. They are fixed in the world and drawn
// smeared along the car's motion, so they rush past the edges of the screen like the air itself.
const SPL = Array.from({ length: 64 }, () => ({ live: false, x: 0, y: 0, z: 0, w: 1 }));
function drawStreaks(ctx, car, t) {
  const sp = car.speed, k = clamp((sp - 13) / 20, 0, 1), dt = Math.min(.05, Math.max(0, t - (drawStreaks.t ?? t))); drawStreaks.t = t;
  if (S.C.weather === 'fog') return;
  const vx = car.vx / (sp || 1), vy = car.vy / (sp || 1), nx = -vy, ny = vx;
  drawStreaks.acc = (drawStreaks.acc || 0) + dt * k * (28 + sp * 1.4);
  while (drawStreaks.acc >= 1) {
    drawStreaks.acc--;
    const s = SPL.find(q => !q.live); if (!s) break;
    const ahead = 30 + Math.random() * 45, side = (Math.random() < .5 ? -1 : 1) * (4.6 + Math.random() * Math.random() * 12);
    s.x = car.x + vx * ahead + nx * side; s.y = car.y + vy * ahead + ny * side; s.z = .4 + Math.random() * Math.random() * 6; s.w = .6 + Math.random() * 1.2; s.live = true; s.born = t;
  }
  ctx.save(); ctx.lineCap = 'round'; ctx.strokeStyle = S.C.night ? '#c8d2ff' : '#fffaf0';
  const smear = Math.min(9, sp * .2);
  for (const s of SPL) {
    if (!s.live) continue;
    proj(s.x, s.y, s.z, _p);
    if (_p[3] < 2.2 || _p[0] < -200 || _p[0] > R.W + 200 || _p[1] > R.H + 200 || t - s.born > 4) { s.live = false; continue; }
    proj(s.x - car.vx / (sp || 1) * smear, s.y - car.vy / (sp || 1) * smear, s.z, _q);
    // fade in from far away, strongest as they whip past close by
    const near = smooth(60, 18, _p[3]); if (near <= 0) continue;
    ctx.globalAlpha = k * .5 * near; ctx.lineWidth = Math.max(.9, s.w * _p[2] * cam.ppm * .055);
    ctx.beginPath(); ctx.moveTo(_p[0], _p[1]); ctx.lineTo(_q[0], _q[1]); ctx.stroke();
  }
  ctx.restore();
}
