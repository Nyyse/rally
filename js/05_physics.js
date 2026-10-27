// ---------- car physics ----------
const PHYS_DT = 1 / 120, GRAV_AIR = 13;
let _prs = 1; const physRnd = () => { _prs = (_prs * 16807) % 2147483647; return _prs / 2147483647; };

function carParams(spec, up, tyre, cond) {
  up = up || {};
  const P = { spec };
  P.m = spec.kg * (1 - .035 * (up.weight || 0)) + 85;
  P.pw = spec.kw * 1000 * (1 + .07 * (up.engine || 0));
  P.vtop = spec.top / 3.6 * (1 + .015 * (up.engine || 0));
  P.L = spec.s.wb; P.a = P.L * (1 - spec.fw); P.b = P.L * spec.fw; P.cgh = .48 - .02 * (up.susp || 0); P.track = spec.s.W * .86; P.tw = P.track / 2;
  P.I = P.m * P.a * P.b * 1.05;
  P.cd = P.pw * .86 / Math.pow(P.vtop, 3);
  P.aero = [0, .12, .16, .3, .42, .55][spec.cls] || .15; // downforce, N per (m/s)^2
  P.front = spec.drive === 'F' ? 1 : spec.drive === 'R' ? 0 : .42;
  P.grip = 1 + .035 * (up.tyres || 0);
  P.brk = 1 + .12 * (up.brakes || 0);
  P.bias = clamp(.54 + (spec.fw - .5) * .7, .5, .66); // brake balance follows the weight
  P.susp = up.susp || 0;
  // roll stiffness split: nose-heavy cars carry more of the load transfer up front (they push), mid-engined ones at the back
  P.rollF = clamp(.53 + (spec.fw - .52) * .55 + (spec.drive === 'F' ? .03 : 0), .44, .62);
  P.shiftT = .26 - .055 * (up.gearbox || 0);
  P.accel = 1 + .03 * (up.gearbox || 0);
  P.turbo = !!spec.turbo;
  P.ng = spec.gears;
  const r = Math.pow(.26 - .01 * (up.gearbox || 0), 1 / (P.ng - 1));
  P.vg = Array.from({ length: P.ng }, (_, i) => P.vtop * 1.04 * Math.pow(r, P.ng - 1 - i));
  P.tyre = TYRES[tyre] || TYRES.gravel; P.tyreKey = tyre;
  P.cond = cond || CONDS.day;
  P.hl = spec.s.L / 2; P.hw = spec.s.W / 2;
  P.Nf0 = P.m * G * P.b / P.L; P.Nr0 = P.m * G * P.a / P.L;
  // wheel positions: front-left, front-right, rear-left, rear-right (u forward, v left)
  // rally set-ups keep the rear a little stickier than the nose so the car rotates on purpose, not by accident
  P.rearG = spec.drive === 'R' ? 1.04 : 1.07;
  P.wu = [P.a, P.a, -P.b, -P.b]; P.wv = [P.tw, -P.tw, P.tw, -P.tw];
  return P;
}

function surfMu(P, key) {
  const S = SURF[key];
  let mu = S.mu * (P.tyre[S.grp] ?? 1) * P.grip;
  if (P.cond.wet) mu *= key === 'tarmac' ? .74 : .92;
  if (S.grp === 'loose') mu *= 1 + .012 * P.susp;
  return mu;
}

function makeCar(P, x, y, h) {
  return { P, x, y, h, vx: 0, vy: 0, r: 0, z: 0, vz: 0, steer: 0, delta: 0, gear: 0, rpm: 900, shift: 0, boost: 0, ax: 0, ay: 0, axR: 0, ayR: 0,
    thr: 0, brk: 0, thrIn: 0, brkIn: 0, hand: 0, rev: false, revT: 0, sF: 'gravel', sR: 'gravel', slipF: 0, slipR: 0, spin: 0, lock: 0, air: false,
    land: 0, hit: 0, pops: 0, lastThr: 0, odo: 0, roll: 0, pitch: 0, heave: 0, heaveV: 0, speed: 0, fwdV: 0, latV: 0,
    pq: 0, pqV: 0, qq: 0, qqV: 0, wN: [0, 0, 0, 0], wfy: [0, 0, 0, 0], ws: ['gravel', 'gravel', 'gravel', 'gravel'], aRp: 0, abs: 0,
    dmg: 0, pull: physRnd() < .5 ? -1 : 1, bump: 0, gz: 0, limiter: 0, misT: 0, shiftEv: 0,
    // damage by part: engine, radiator, gearbox, steering rack, suspension per corner (FL FR RL RR), lamps, bodywork
    dm: { eng: 0, rad: 0, gbx: 0, str: 0, sus: [0, 0, 0, 0], hl: [0, 0], tl: [0, 0], body: 0 }, dents: [] };
}

// rises like a sine to the peak slip angle, then sheds a little grip as the tyre slides
function tyreCurve(alpha, ap, fall) {
  const x = Math.abs(alpha) / ap;
  return x < 1 ? Math.sin(x * Math.PI / 2) : 1 - fall * Math.min(1, (x - 1) / 2.2);
}

const _wF = [0, 0, 0, 0];
// one fixed physics step: a four-wheel model. Each tyre carries its own load (static share, plus weight thrown
// forward/back and side to side by the sprung body), and makes force inside its own friction circle. A locked or
// spinning tyre slides, and a sliding tyre pushes straight against the way its contact patch is moving.
// inp: {steer,thr,brk,hand,analog}. assist: stability help 0..0.8. tc: traction control. abs: anti-lock brakes
function stepCar(c, inp, Wd, dt, assist, tc, abs) {
  const P = c.P, ch = Math.cos(c.h), sh = Math.sin(c.h);
  if (tc === undefined) tc = true; if (abs === undefined) abs = true; assist = assist ?? .55;
  let vx = c.vx * ch + c.vy * sh, vy = -c.vx * sh + c.vy * ch;
  const speed = hyp(c.vx, c.vy), av = Math.abs(vx);
  // pedals: a key press squeezes the pedal in over a fraction of a second, so the weight has time to move
  if (inp.analog && !inp.digiPed) { c.thrIn = inp.thr; c.brkIn = inp.brk; }
  else { c.thrIn += clamp(inp.thr - c.thrIn, -dt * 9, dt * 6); c.brkIn += clamp(inp.brk - c.brkIn, -dt * 12, dt * 6.5); }
  // steering: rate-limited, speed-sensitive lock
  const target = clamp(inp.steer, -1, 1);
  const rate = inp.analog ? (inp.rate || 16) : Math.abs(target) > Math.abs(c.steer) && sign(target) === sign(c.steer || target) ? 4.6 : 8.5;
  c.steer += clamp(target - c.steer, -rate * dt, rate * dt);
  const lock = .22 + .38 / (1 + speed * speed / 200);
  const beta = speed > 3 ? Math.atan2(vy, Math.abs(vx)) : 0, bx = Math.abs(beta) > .12 ? beta - sign(beta) * .12 : 0;

  // what each tyre is standing on; loose stones collect at the edges of gravel roads
  const rd = Wd.road(c.x, c.y), edge = Math.abs(rd.lat) / (Wd.T.width / 2), marb = edge > .72 && edge < 1.15;
  for (let i = 0; i < 4; i++) c.ws[i] = Wd.surface(c.x + ch * P.wu[i] - sh * P.wv[i], c.y + sh * P.wu[i] + ch * P.wv[i]);
  c.sF = c.ws[0]; c.sR = c.ws[2];
  const SF = SURF[c.sF], SR = SURF[c.sR];

  const D = c.dm;
  // a bent rack or a knocked-back front wheel pulls the car to one side
  // full lock is always there for counter-steer: steering toward the way the car is travelling may point the
  // wheels right along the slide (the speed-sensitive limit only applies to steering into the turn)
  const cLock = vx > 2 && sign(c.steer) === sign(beta) && Math.abs(beta) > .05 ? Math.max(lock, Math.min(.62, Math.abs(beta) + .28)) : lock;
  let dd = c.steer * cLock + bx * assist * .7 * (vx > 0 ? 1 : 0) + D.str * .045 * c.pull + (D.sus[1] - D.sus[0]) * .03;
  // the driver's hands: at speed, the wheels only turn as far as the front tyres can still use (a touch past peak).
  // The cap follows the front axle's own direction of travel when it helps the turn, but never forces counter-steer.
  if (vx > 4 && !c.air) {
    const base = Math.atan2(vy + P.a * c.r, vx), win = SF.ap * (inp.analog ? 1.5 : 1.25) * (inp.hand ? 1.5 : 1);
    const hi = Math.max(base, 0) + win, lo = Math.min(base, 0) - win;
    dd = lerp(dd, clamp(dd, lo, hi), smooth(4, 12, vx));
  }
  c.delta = clamp(dd, -.62, .62);
  const d = c.delta, cd = Math.cos(d), sd = Math.sin(d);
  const bumpN = SF.rough * (1 - .22 * P.susp) * (1 + (D.sus[0] + D.sus[1] + D.sus[2] + D.sus[3]) * .25);
  c.bump = (Math.sin(c.odo * 1.9) * .5 + Math.sin(c.odo * 4.7 + 1.3) * .3 + Math.sin(c.odo * 11.3 + .4) * .2) * bumpN;

  // gearbox / reverse
  let thr = c.thrIn, brk = c.brkIn;
  if (c.rev) { if (inp.thr > .1 && vx > -1) c.rev = false; else { const t = thr; thr = brk; brk = t; } }
  else if (inp.brk > .5 && inp.thr < .1 && av < 1) { c.revT += dt; if (c.revT > .35) { c.rev = true; c.revT = 0; } } else c.revT = 0;
  if (c.shift > 0) c.shift -= dt;
  c.shiftEv = 0;
  const shiftT = P.shiftT * (1 + 1.6 * D.gbx);
  // a damaged gearbox sometimes baulks: the shift takes far longer
  const baulk = () => D.gbx > .35 && physRnd() < (D.gbx - .35) * .7 ? 2.6 : 1;
  // driven-wheel speed: follows the road when the tyres grip, but in a slide with the throttle in, the wheels keep
  // turning at road speed (or spin up), so the revs, the gear and the push all hold through a drift
  const bz = speed > 2 ? Math.abs(Math.atan2(vy, Math.abs(vx) + .5)) : 0, slideK = smooth(.12, .55, bz) * clamp(thr * 1.4, 0, 1);
  const wvT = lerp(Math.max(av, c.vlDrv || 0), speed * (1 + .12 * thr), slideK) + c.spin * 9;
  c.wv = (c.wv ?? av) + (wvT - (c.wv ?? av)) * Math.min(1, dt * (wvT > (c.wv ?? 0) ? 9 : 14));
  const wv = c.wv;
  if (!c.rev) {
    const rn0 = wv / P.vg[c.gear];
    if (inp.manual) {
      if (inp.up && c.gear < P.ng - 1) { c.gear++; c.shift = shiftT * baulk(); c.shiftEv = 1; }
      else if (inp.down && c.gear > 0) {
        // over-rev protection: the box refuses a downshift that would throw the needle past the red line
        if (wv / P.vg[c.gear - 1] < 1.06) { c.gear--; c.shift = shiftT * .35 * baulk(); c.shiftEv = -1; } else c.shiftEv = -2;
      }
    } else {
      if (rn0 > (thr > .75 ? .985 : .93) && c.gear < P.ng - 1 && c.shift <= 0 && thr > .1) { c.gear++; c.shift = shiftT * baulk(); c.shiftEv = 1; }
      else if (c.gear > 0 && wv < P.vg[c.gear - 1] * (thr > .5 ? .7 : .55) && slideK < .3) { c.gear--; c.shift = shiftT * .35; c.shiftEv = -1; }
    }
  } else c.gear = 0;
  const rn = clamp(wv / P.vg[c.gear], 0, 1.08);
  c.rpm = lerp(c.rpm, 900 + rn * 6300 + (c.air || c.spin > .15 ? 1100 * thr : 0), .35);
  if (P.turbo) c.boost = clamp(c.boost + (thr > .5 ? dt / .55 : -dt / .3), 0, 1);
  if (c.lastThr > .7 && thr < .2 && rn > .55) c.pops = 2 + (physRnd() * 3 | 0);
  c.lastThr = thr; c.thr = thr; c.brk = brk; c.hand = inp.hand;

  const torqueCurve = .8 + .28 * Math.sin(clamp(rn, 0, 1) * Math.PI * .9);
  let Pe = P.pw * torqueCurve * (P.turbo ? .62 + .38 * c.boost : 1) * P.accel * (1 - .45 * D.eng);
  if (c.shift > 0) Pe *= .12;
  c.limiter = rn > 1.0 ? 1 : 0;
  if (rn > 1.0) Pe *= rn > 1.02 ? .08 : .4; // rev limiter
  // a hurt engine misfires; a holed radiator slowly cooks it under load
  if (c.misT > 0) { c.misT -= dt; Pe *= .25; }
  else if (D.eng > .4 && thr > .3 && physRnd() < (D.eng - .4) * .05) { c.misT = .05 + physRnd() * .08; c.pops = Math.max(c.pops, 1); }
  if (D.rad > .3 && thr > .3 && !c.noDamage) D.eng = Math.min(1, D.eng + dt * (D.rad - .3) * .006 * (.4 + rn));
  let drive = thr * Pe / Math.max(wv, 4) * (c.rev ? -.45 : 1);
  // engine braking on the driven wheels when lifting
  // engine braking on the driven wheels when lifting: strong in a low gear at high revs
  // it fades in over a quarter second after the lift, and the automatic box keeps it gentler
  c.ebK = thr < .12 && !c.rev && c.shift <= 0 ? Math.min(1, (c.ebK || 0) + dt * 4) : 0;
  if (c.ebK > 0 && av > 2) drive -= sign(vx) * c.ebK * P.m * (.08 + 1.4 * Math.pow(Math.min(rn, 1.08), 2.5)) * (1 - .06 * c.gear) * (inp.manual ? 1 : .6);

  // the sprung body: an effective longitudinal (pq) and lateral (qq) acceleration that lag and overshoot the real ones,
  // so weight surges forward under braking and swings across when the car is flicked from one corner into the next
  const m = P.m, Wt = m * G;
  c.pqV += (120 * (c.axR - c.pq) - 16 * c.pqV) * dt; c.pq += c.pqV * dt;
  c.qqV += (95 * (c.ayR - c.qq) - 11.5 * c.qqV) * dt; c.qq += c.qqV * dt;
  const dLong = m * c.pq * P.cgh / P.L / 2, dLat = m * c.qq * P.cgh / P.track, down = P.aero * vx * vx;
  const N0 = [P.Nf0 / 2, P.Nf0 / 2, P.Nr0 / 2, P.Nr0 / 2];
  const N = c.wN, rf = P.rollF;
  N[0] = N0[0] - dLong - dLat * rf + down * .225; N[1] = N0[1] - dLong + dLat * rf + down * .225;
  N[2] = N0[2] + dLong - dLat * (1 - rf) + down * .275; N[3] = N0[3] + dLong + dLat * (1 - rf) + down * .275;
  const bumpK = 1 - Math.abs(c.bump) * .1;
  for (let i = 0; i < 4; i++) N[i] = Math.max(0, N[i]) * bumpK;

  let FX = 0, FY = 0, TQ = 0;
  const gz0 = Wd.groundZ ? Wd.groundZ(c.x, c.y) : 0;
  c.air = c.z > gz0 + .03;
  c.spin = 0; c.lock = 0; c.abs = 0;
  let slipF = 0, slipR = 0, aRsum = 0, vlD = 0;
  if (!c.air) {
    const bTot = brk * Wt * 1.08 * P.brk, bDir = vx > .3 ? -1 : vx < -.3 ? 1 : 0;
    for (let i = 0; i < 4; i++) {
      const front = i < 2, S = SURF[c.ws[i]], u = P.wu[i], v = P.wv[i];
      let mu = surfMu(P, c.ws[i]); if (S.grp === 'loose' && marb) mu *= .9;
      // load sensitivity: a tyre pressed harder grips a little less per newton
      const n0 = N0[i], cap = mu * N[i] * (1 - .11 * clamp(N[i] / n0 - 1, -.8, 1.6)) * (front ? 1 : P.rearG) * (1 - .28 * D.sus[i]);
      // contact-patch velocity in the wheel's own frame
      const wvx = vx - c.r * v, wvy = vy + c.r * u;
      const cs = front ? cd : 1, sn = front ? sd : 0;
      const vl = wvx * cs + wvy * sn, vt = -wvx * sn + wvy * cs;
      const vls = Math.max(Math.abs(vl), 2), alpha = Math.atan2(vt, vls), ap = S.ap * (front ? 1 : (S.grp === 'tarmac' ? 1.08 : 1));
      // longitudinal demand: drive, brakes, handbrake
      const dshare = front ? P.front / 2 : (1 - P.front) / 2;
      let Fd = drive * dshare;
      if (tc && Fd * sign(vl || 1) > 0) {
        // traction control keeps the front from scrabbling, but lets the rear spin a little so the throttle can still
        // steer the car in a slide; only a slide that is getting away from you has its power trimmed
        const fyp = c.wfy[i], allowed = front ? Math.min(cap * .92, Math.max(cap * .25, Math.sqrt(Math.max(0, cap * cap * .95 - fyp * fyp)) + cap * .05))
          : cap * (1.1 - .32 * smooth(ap * 4, ap * 8, Math.abs(c.aRp)));
        if (Math.abs(Fd) > allowed) Fd = sign(Fd) * allowed;
      }
      let Fb = bDir * bTot * (front ? P.bias : 1 - P.bias) / 2;
      let locked = false, spinning = 0;
      if (!front && inp.hand && Math.abs(vl) > .5) locked = true;
      const FtWant = tyreCurve(alpha, ap, S.fall) * cap;
      if (abs && !locked) {
        // anti-lock: hold each tyre just short of locking, and leave it most of the grip it needs to turn
        const lim = Math.min(cap * .92, Math.sqrt(Math.max(0, cap * cap - (FtWant * .8) ** 2)));
        if (Math.abs(Fb) > lim) { Fb = sign(Fb) * lim; c.abs = 1; }
      } else if (Math.abs(Fb) > cap * 1.18) locked = true;           // well past the limit the wheel locks
      else if (Math.abs(Fb) > cap * .95) Fb = sign(Fb) * cap * .95;   // at the limit it stays rolling, just
      if (Math.abs(Fd) > cap * .98 && !locked) spinning = Math.min(14, (Math.abs(Fd) / Math.max(cap, 1) - .98) * 10 + 2);
      let Fl, Ft;
      const kin = .86 + .06 * (S.grp !== 'tarmac');
      if (locked) {
        // a locked tyre skids straight against its slide: no steering, no turning force of its own
        const sv = Math.hypot(vl, vt) || 1; Fl = -cap * kin * vl / sv; Ft = -cap * kin * vt / sv;
        c.lock = Math.max(c.lock, front ? 1 : .6); if (front) slipF += sv; else slipR += sv;
      } else if (spinning) {
        // a spinning tyre's patch slides backwards: drive force survives, sideways grip collapses
        const sv = Math.hypot(spinning, vt) || 1; Fl = sign(Fd) * cap * kin * spinning / sv; Ft = -cap * kin * vt / sv;
        c.spin = Math.max(c.spin, spinning / 12); if (front) slipF += spinning; else slipR += spinning;
      } else {
        Fl = Fd + Fb - (S.rr * N[i]) * (Math.abs(vl) > .2 ? sign(vl) : vl / .2);
        Ft = -sign(alpha) * FtWant;
        const lim = Math.sqrt(Math.max(0, cap * cap - Fl * Fl));
        if (Math.abs(Ft) > lim) Ft = sign(Ft) * lim;
        if (Math.abs(Fl) > cap) Fl = sign(Fl) * cap;
        const sl = Math.abs(alpha) * Math.abs(vls); if (front) slipF += sl; else slipR += sl;
      }
      c.wfy[i] = Ft; if (!front) aRsum += alpha;
      if (dshare > 0) vlD += Math.abs(vl) * (P.front === .42 ? .25 : .5);
      // back into the body frame
      const fx = Fl * cs - Ft * sn, fy = Fl * sn + Ft * cs;
      // the differential shares drive torque across the axle, so drive itself adds no twist about the track
      const dl = locked || spinning ? 0 : Fd;
      FX += fx; FY += fy; TQ += u * fy - v * (fx - dl * cs); _wF[i] = Ft;
    }
    c.slipF = slipF * .5 + (c.lock >= 1 ? 3 : 0); c.slipR = slipR * .5 + c.spin * 6 + (inp.hand ? av * .3 : 0);
  } else { c.slipF = c.slipR = 0; }
  c.aRp = aRsum / 2; c.vlDrv = c.air ? c.vlDrv : vlD;
  c.fyF = _wF[0] + _wF[1]; c.fyR = _wF[2] + _wF[3];

  // resistance and slope
  const drag = P.cd * vx * Math.abs(vx);
  let slope = 0;
  if (!c.air) { const h1 = Wd.heightAt(c.x + ch * 1.6, c.y + sh * 1.6), h0 = Wd.heightAt(c.x - ch * 1.6, c.y - sh * 1.6); slope = clamp((h1 - h0) / 3.2, -.25, .25) * Wt; }
  FX += -drag - slope; FY += -P.cd * vy * Math.abs(vy) * 3;
  // stability help: gently resists the slide angle changing quickly (the drift itself is left alone)
  const rPath = speed > 4 ? c.ayR / speed : c.r;
  TQ += -(c.r - rPath) * P.I * .65 * assist - c.r * P.I * .05;
  const axl = FX / m, ayl = FY / m;
  c.axR = axl; c.ayR = ayl;
  c.ax = lerp(c.ax, axl, .25); c.ay = lerp(c.ay, ayl, .2);
  vx += axl * dt; vy += ayl * dt;
  c.r += TQ / P.I * dt;
  if (c.air) c.r *= .996;
  // very low speed: blend toward rolling kinematics so the car never jitters, and hold it still on the brakes
  const kin = smooth(2.5, .3, av);
  if (kin > 0 && !c.air) {
    const rk = vx * Math.tan(d) / P.L;
    c.r = lerp(c.r, rk, kin * .35); vy = lerp(vy, 0, kin * .3);
    if ((thr < .05 && brk < .05 && av < .35) || (brk > .3 && !c.rev && av < .6)) vx *= .85;
  }
  c.vx = vx * ch - vy * sh; c.vy = vx * sh + vy * ch;
  c.h += c.r * dt;
  c.x += c.vx * dt; c.y += c.vy * dt;
  c.odo += av * dt;
  // vertical: jumps and landings
  c.land = 0;
  const gz = Wd.groundZ ? Wd.groundZ(c.x, c.y) : 0;
  if (c.z > gz + .001 || c.vz > 0) {
    c.z += c.vz * dt; c.vz -= GRAV_AIR * dt;
    if (c.z <= gz) {
      c.z = gz; const imp = -c.vz; c.vz = 0; c.land = imp;
      if (imp > 3) { const k = 1 - .03 * (imp - 3) * (1 - .22 * P.susp); c.vx *= k; c.vy *= k; c.heaveV -= imp * .5; }
      // flat landings bend the suspension, the nose takes the worst of it
      if (imp > 7.5 && !c.noDamage) { const e = (imp - 7.5) * .02 * (1 - .2 * P.susp); for (let i = 0; i < 4; i++) D.sus[i] = Math.min(1, D.sus[i] + e * (i < 2 ? 1.2 : .8)); dmgTotal(c); }
    }
  } else { c.z = gz; c.vz = 0; }
  c.gz = gz;
  // body attitude for drawing comes straight from the sprung weight transfer
  c.pitch = clamp(c.pq * .16, -1.4, 1.4); c.roll = clamp(c.qq / 7, -1.4, 1.4);
  c.heaveV += (-(90 + 30 * P.susp) * (c.heave + Math.abs(c.bump) * .6) - (9 + 3 * P.susp) * c.heaveV) * dt; c.heave += c.heaveV * dt;
  c.hit = 0;
  collideCar(c, Wd);
  if (c.x < 2) { c.x = 2; c.vx = Math.abs(c.vx) * .3; } if (c.y < 2) { c.y = 2; c.vy = Math.abs(c.vy) * .3; }
  if (c.x > Wd.W - 2) { c.x = Wd.W - 2; c.vx = -Math.abs(c.vx) * .3; } if (c.y > Wd.H - 2) { c.y = Wd.H - 2; c.vy = -Math.abs(c.vy) * .3; }
  c.speed = hyp(c.vx, c.vy); c.fwdV = vx; c.latV = vy;
}

function collideCar(c, Wd) {
  if (c.z - (c.gz || 0) > 1.2) return;
  const P = c.P, ch = Math.cos(c.h), sh = Math.sin(c.h), rad = P.hw * .95;
  for (const off of [P.hl * .62, 0, -P.hl * .62]) {
    const cx = c.x + ch * off, cy = c.y + sh * off;
    Wd.query(cx, cy, rad + 4, o => {
      if (o.brk) { // fences give way: the car ploughs through and loses a little speed
        if (o.broken) return;
        const ex = o.x1 - o.x0, ey = o.y1 - o.y0, l2 = ex * ex + ey * ey || 1, u = clamp(((cx - o.x0) * ex + (cy - o.y0) * ey) / l2, 0, 1);
        if (hyp(cx - (o.x0 + ex * u), cy - (o.y0 + ey * u)) > rad + .12) return;
        o.broken = 1; c.fence = o;
        const wall = o.st === 'wall', f = wall ? .84 : .95; c.vx *= f; c.vy *= f; c.r *= .8;
        if (wall && c.speed > 7 && !c.noDamage) applyImpact(c, off, 0, (c.speed - 7) * .18);
        return;
      }
      if (!o.c) return;
      const list = o.circles || [o];
      for (const oc of list) {
        let dx = cx - oc.x, dy = cy - oc.y; const dd = hyp(dx, dy), minD = rad + oc.r;
        if (dd >= minD || dd < 1e-4) continue;
        const nx = dx / dd, ny = dy / dd, pen = minD - dd;
        c.x += nx * pen; c.y += ny * pen;
        const rcx = cx - nx * rad - c.x, rcy = cy - ny * rad - c.y;
        const vcx = c.vx - c.r * rcy, vcy = c.vy + c.r * rcx, vn = vcx * nx + vcy * ny;
        if (vn >= 0) continue;
        const e = o.soft ? .05 : .22, rn = rcx * ny - rcy * nx;
        const j = -(1 + e) * vn / (1 / P.m + rn * rn / P.I);
        c.vx += j * nx / P.m; c.vy += j * ny / P.m; c.r += rn * j / P.I * .6;
        // tangential friction
        const tx = -ny, ty = nx, vt = vcx * tx + vcy * ty, jt = clamp(-vt / (1 / P.m), -j * .35, j * .35);
        c.vx += jt * tx / P.m; c.vy += jt * ty / P.m;
        if (o.soft) { c.vx *= .9; c.vy *= .9; }
        if (-vn > c.hit) { c.hit = -vn; c.hitK = o.k; } o.hitT = 1;
        // where on the car it struck decides what breaks
        if (-vn > 3.5 && !c.noDamage) {
          const px = cx - nx * rad - c.x, py = cy - ny * rad - c.y;
          applyImpact(c, px * ch + py * sh, -px * sh + py * ch, (-vn - 3.5) * (o.soft ? .2 : 1));
        }
      }
    });
  }
}

// lift off a ramp's lip: what the slope gives, or the stage's hand-tuned kick if that is bigger
function jumpKick(c, j) { return Math.min(7.5, Math.max(c.speed * 2 * j.hJ / j.L1 * .85, (c.speed - 10) * j.kick)); }

// an impact at local point (u forward, v left), severity in m/s beyond what the car shrugs off
function applyImpact(c, u, v, sev) {
  if (sev <= 0) return;
  const P = c.P, D = c.dm, fu = u / P.hl, fv = v / P.hw, e = sev, L = fv > 0 ? 0 : 1, corner = Math.abs(fv) > .45;
  if (fu > .4) {            // nose: radiator first, then the engine behind it, the steering and the front corner
    if (Math.abs(fv) < .75) { D.rad += e * .04; D.eng += e * .014; }
    D.sus[L] += e * (corner ? .045 : .012); D.str += e * (corner ? .03 : .012);
    if (e > 1.2) D.hl[L] = 1; if (e > 3 && !corner) D.hl[1 - L] = 1;
    if (corner) c.pull = fv > 0 ? 1 : -1;
  } else if (fu < -.4) {    // tail: the rear corner, and on rear and four-wheel-drive cars the gearbox
    if (Math.abs(fv) < .75) D.gbx += e * (P.front < 1 ? .028 : .012);
    D.sus[L + 2] += e * (corner ? .045 : .012);
    if (e > 1.2) D.tl[L] = 1; if (e > 3 && !corner) D.tl[1 - L] = 1;
  } else {                  // flank: doors take it, both wheels on that side feel it
    D.body += e * .03; D.sus[L] += e * .014; D.sus[L + 2] += e * .014;
  }
  D.body += e * .015;
  for (const k of ['eng', 'rad', 'gbx', 'str', 'body']) D[k] = Math.min(1, D[k]);
  for (let i = 0; i < 4; i++) D.sus[i] = Math.min(1, D.sus[i]);
  // a dent where it hit, for the body shader
  const z = .55, near = c.dents.find(d => Math.hypot(d.u - u, d.v - v) < .45);
  if (near) near.s = Math.min(.22, near.s + e * .02); else { c.dents.push({ u, v, z, s: Math.min(.2, .03 + e * .025) }); if (c.dents.length > 8) c.dents.shift(); }
  c.lastHit = { zone: fu > .4 ? 'front' : fu < -.4 ? 'rear' : 'side', t: 0 };
  dmgTotal(c);
}
function dmgTotal(c) {
  const D = c.dm, sm = Math.max(...D.sus);
  c.dmg = clamp(.3 * D.eng + .2 * D.rad + .15 * D.gbx + .15 * D.str + .15 * sm + .05 * D.body, 0, 1) / .95;
}

function placeOnRoad(c, T, s) {
  const i = T.closed ? ((Math.round(s / DS) % T.n) + T.n) % T.n : clamp(Math.round(s / DS), 0, T.n - 1);
  c.x = T.px[i]; c.y = T.py[i]; c.h = Math.atan2(T.ty[i], T.tx[i]);
  c.vx = c.vy = c.r = c.vz = 0; c.z = c.gz || 0; c.gear = 0; c.rev = false; c.steer = 0; c.boost = 0; c.pq = c.pqV = c.qq = c.qqV = c.axR = c.ayR = c.ax = c.ay = 0; c.thrIn = c.brkIn = 0; c.wv = 0; c.vlDrv = 0; c.ebK = 0;
}

// ---------- AI driver (used for target times and the gold ghost) ----------
function speedProfile(T, P, skill) {
  const v = new Float32Array(T.n), n = T.n;
  for (let i = 0; i < n; i++) {
    const mu = surfMu(P, SURF_KEYS[T.surf[i]]) * (T.closed ? 1 : 1);
    const k = Math.abs(T.k[i]) + 1e-4;
    v[i] = Math.min(P.vtop * .97, Math.sqrt(mu * G / k) * skill);
  }
  for (const j of T.jumps) { const i = Math.round(j.s / DS); for (let q = -4; q <= 2; q++) if (v[i + q] !== undefined) v[i + q] = Math.min(v[i + q], j.big ? 27 : 33); }
  for (const f of T.fords) for (let s = f.s0 - 6; s < f.s1; s += DS) { const i = Math.round(s / DS); if (v[i] !== undefined) v[i] = Math.min(v[i], 17); }
  for (const ch of T.chicanes || []) for (let s = ch.s - 14; s < ch.s + ch.gap + 8; s += DS) { const i = Math.round(s / DS); if (v[i] !== undefined) v[i] = Math.min(v[i], 14.5); }
  const passes = T.closed ? 2 : 1;
  for (let p = 0; p < passes; p++) for (let q = n - 2 + (T.closed ? n : 0); q >= 0; q--) {
    const i = q % n, j = (q + 1) % n, mu = surfMu(P, SURF_KEYS[T.surf[i]]);
    v[i] = Math.min(v[i], Math.sqrt(v[j] * v[j] + 2 * mu * G * .62 * DS));
  }
  return v;
}

function aiInput(c, T, Wd, prof) {
  const rd = Wd.road(c.x, c.y), sp = c.speed, n = T.n;
  const idx = s => { const i = Math.round(s / DS); return T.closed ? ((i % n) + n) % n : clamp(i, 0, n - 1); };
  const pi = idx(rd.s + 3 + sp * .22), kt = T.k[idx(rd.s + sp * .3)];
  const th = Math.atan2(T.ty[pi], T.tx[pi]), tv = sp > 3 && c.fwdV > 0 ? Math.atan2(c.vy, c.vx) : c.h;
  let want = clamp(-kt * 90, -1, 1) * T.width * .2; // hug the inside a little
  const cg = chicaneGate(T, rd.s + sp * .3 + 2); if (cg) want = -cg.side * 1.6; // thread the gap between the bales
  const e = rd.lat - want, eh = wrapA(th - tv) + wrapA(tv - c.h) * .45; // part heading-based so the AI catches slides
  const lock = .2 + .4 / (1 + sp * sp / 170);
  const dl = eh * 1.05 - Math.atan(1.1 * e / (sp + 2.5)) + c.P.L * kt * 1.2 - (c.r - sp * kt) * .07;
  let vt = 1e9; for (let s = 0; s <= sp * .5 + 4; s += DS) vt = Math.min(vt, prof[idx(rd.s + s)]);
  const slide = Math.abs(Math.atan2(c.latV, Math.abs(c.fwdV) + .1));
  const off = Math.abs(e) > T.width * .5;
  // a driver who runs out of steering lifts off (weight onto the nose) and, if it is getting worse, brushes the brakes
  const sat = Math.abs(dl / lock), wide = Math.abs(e) > T.width * .22 && sign(e) === -sign(kt) ? 1 : 0;
  c.aiSat = sat > 1 ? (c.aiSat || 0) + PHYS_DT : 0;
  let thr = slide > .32 ? .4 : sp < vt * (off ? .8 : 1) ? 1 : sp < vt + 1 ? .3 : 0, brk = sp > vt + 1.8 ? 1 : 0;
  if (sat > 1) { thr = Math.min(thr, wide ? 0 : .35); if (wide && c.aiSat > .25 && sp > 8) brk = Math.max(brk, .35); }
  return { steer: clamp(dl / lock, -1, 1), thr, brk,
    hand: Math.abs(T.k[idx(rd.s + 5)]) > 1 / 15 && sp > 9 && sp < 17 ? 1 : 0, s: rd.s };
}

// run the AI over a whole event; returns {time, ghost}
function simulateRun(T, Wd, P, skill, maxT) {
  _prs = 12345;
  const c = makeCar(P, 0, 0, 0); placeOnRoad(c, T, T.startS);
  const prof = speedProfile(T, P, skill);
  const ghost = []; let t = 0, lap = 0, lastS = T.startS, gt = 0, jumpI = 0, done = false, total = 0;
  const lapLen = T.len, target = T.closed ? T.laps * lapLen : T.finishS - T.startS;
  let stuck = 0, resets = 0, offT = 0;
  while (t < (maxT || 400) && !done) {
    const inp = aiInput(c, T, Wd, prof);
    if (c.speed < 2) stuck += PHYS_DT; else stuck = 0;
    if (stuck > 1.2) { const rd0 = Wd.road(c.x, c.y); placeOnRoad(c, T, rd0.s); t += 2; stuck = 0; resets++; }
    c.noDamage = true; stepCar(c, inp, Wd, PHYS_DT, .55, true);
    const rd = Wd.road(c.x, c.y);
    let ds = rd.s - lastS; if (T.closed) { if (ds < -T.len / 2) ds += T.len; if (ds > T.len / 2) ds -= T.len; }
    if (Math.abs(ds) < 20) total += ds;
    if (Math.abs(rd.lat) > T.width / 2 + 1) offT += PHYS_DT;
    // jumps
    for (const j of T.jumps) if (lastS < j.s && rd.s >= j.s && Math.abs(rd.lat) < T.width / 2 + 1 && !c.air && c.speed > 12) c.vz = jumpKick(c, j);
    lastS = rd.s; t += PHYS_DT;
    if ((gt += PHYS_DT) >= .1) { gt = 0; ghost.push(Math.round(c.x * 10) / 10, Math.round(c.y * 10) / 10, Math.round(c.h * 100) / 100); }
    if (total >= target) done = true;
    if (!isFinite(c.x)) break;
  }
  return { time: done ? t : null, ghost, progress: total / target, resets, offT };
}
