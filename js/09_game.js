// ---------- save data ----------
const SAVE_KEY = 'dustlight_rally_v1';
const DEF_SAVE = () => ({ v: 1, rally: null, rallyBest: {}, credits: 800, cars: ['pip'], up: {}, liv: {}, ev: {}, tt: {}, free: 0,
  settings: { touchSteer: 'tilt', tiltMax: 26, tiltInv: false, tiltZero: 0, phoneFull: true, assist: 'med', tc: true, abs: true, gearbox: 'auto', notes: true, voice: false, tilt: true, quality: 'high', sound: true, vol: .55, ghost: true, camera: 'chase', rumble: true, pads: {} } });
let SV = DEF_SAVE();
function loadSave() {
  try { const s = JSON.parse(localStorage.getItem(SAVE_KEY)); if (s && s.v === 1) { const d = DEF_SAVE(); SV = Object.assign(d, s); SV.settings = Object.assign(d.settings, s.settings || {}); return; } } catch (e) { }
  SV = DEF_SAVE();
}
function writeSave() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(SV)); } catch (e) { } }
function loadGhost(id) { try { const g = JSON.parse(localStorage.getItem('dustlight_g_' + id)); return g && g.d ? g : null; } catch (e) { return null; } }
function saveGhost(id, g) { try { localStorage.setItem('dustlight_g_' + id, JSON.stringify(g)); } catch (e) { } }
const upOf = id => SV.up[id] || (SV.up[id] = { engine: 0, gearbox: 0, tyres: 0, susp: 0, brakes: 0, weight: 0 });
const livOf = id => SV.liv[id] ?? CAR[id].liv;
const medalOf = id => (SV.ev[id] && SV.ev[id].medal) || 0;
const careerRecs = () => Object.entries(SV.ev).filter(([k]) => EVENTS[k]).map(([, e]) => e);
const goldCount = () => careerRecs().filter(e => e.medal >= 3).length;
const medalCount = () => careerRecs().filter(e => e.medal >= 1).length;
function champDone(cid) { const c = CHAMPS.find(c => c.id === cid); return c.events.every(e => medalOf(e.id) >= 1); }
function champOpen(cid) { if (SV.dev) return true; const i = CHAMPS.findIndex(c => c.id === cid); return i === 0 || champDone(CHAMPS[i - 1].id); }
function eventOpen(ev) { if (SV.dev) return true; if (!champOpen(ev.champ)) return false; if (ev.idx === 0) return true; const c = CHAMPS.find(c => c.id === ev.champ); return medalOf(c.events[ev.idx - 1].id) >= 1; }
function unlockText(car) {
  const u = car.unlock; if (!u) return '';
  if (u.ev) return `Earn a medal in ${EVENTS[u.ev].name}`;
  if (u.champ) return `Finish the ${CHAMPS.find(c => c.id === u.champ).name}`;
  if (u.golds) return `Win ${u.golds} gold medals (${goldCount()}/${u.golds})`;
  return '';
}
function checkUnlocks() {
  const fresh = [];
  for (const car of CARS) {
    if (SV.cars.includes(car.id) || !car.unlock) continue;
    const u = car.unlock;
    const ok = u.ev ? medalOf(u.ev) >= 1 : u.champ ? champDone(u.champ) : u.golds ? goldCount() >= u.golds : false;
    if (ok) { SV.cars.push(car.id); fresh.push(car); }
  }
  return fresh;
}

// ---------- input ----------
const IN = { k: {}, touch: {}, padPrev: {} };
const KEYMAP = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'gas', KeyW: 'gas', ArrowDown: 'brake', KeyS: 'brake', Space: 'hand', ShiftLeft: 'hand' };
addEventListener('keydown', e => {
  AUD.init();
  const m = KEYMAP[e.code];
  if (m && GAME.mode === 'race') { IN.k[m] = true; e.preventDefault(); }
  if (GAME.mode === 'race' && !e.repeat) {
    if (e.code === 'KeyR') resetCar();
    if (e.code === 'KeyE') IN.up = true;
    if (e.code === 'KeyQ') IN.down = true;
    if (e.code === 'Escape' || e.code === 'KeyP') togglePause();
    if (e.code === 'KeyC') { const ks = Object.keys(CAMS), i = (ks.indexOf(SV.settings.camera) + 1) % ks.length; SV.settings.camera = ks[i]; writeSave(); toast(CAMS[ks[i]].name + ' camera'); }
    if (e.code === 'KeyG') { SV.settings.ghost = !SV.settings.ghost; writeSave(); toast(SV.settings.ghost ? 'Ghost on' : 'Ghost off'); }
    if (e.code === 'KeyM') { SV.settings.sound = !SV.settings.sound; AUD.setOn(SV.settings.sound); writeSave(); toast(SV.settings.sound ? 'Sound on' : 'Sound off'); }
  } else if (e.code === 'Escape' && GAME.mode === 'menu' && UI.back) { UI.back(); }
});
addEventListener('keyup', e => { const m = KEYMAP[e.code]; if (m) IN.k[m] = false; });
addEventListener('blur', () => { IN.k = {}; IN.touch = {}; });
function bindTouch() {
  document.querySelectorAll('#touch [data-k]').forEach(b => {
    const k = b.dataset.k, pedal = !b.classList.contains('tb');
    const on = e => {
      e.preventDefault(); AUD.init(); IN.touch[k] = true; b.classList.add('on'); if (k === 'up') IN.up = true; if (k === 'down') IN.down = true;
      if (pedal) { try { b.setPointerCapture(e.pointerId); } catch (er) { } } // a thumb that slides on the pedal keeps it pressed
    };
    const off = e => { e.preventDefault(); IN.touch[k] = false; b.classList.remove('on'); };
    b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off);
    if (!pedal) b.addEventListener('pointerleave', off);
    b.addEventListener('contextmenu', e => e.preventDefault());
  });
}
function readInput() {
  const k = IN.k, t = IN.touch;
  let steer = ((k.right || t.right) ? 1 : 0) - ((k.left || t.left) ? 1 : 0), thr = (k.gas || t.gas) ? 1 : 0, brk = (k.brake || t.brake) ? 1 : 0, hand = (k.hand || t.hand) ? 1 : 0, analog = false;
  const p = PAD.active();
  if (p) {
    const v = PAD.read(p);
    if (Math.abs(v.steer) > .001 || !steer) { if (Math.abs(v.steer) > .001) { steer = v.steer; analog = true; } }
    IN.rate = v.rate;
    thr = Math.max(thr, v.gas); brk = Math.max(brk, v.brake); hand = Math.max(hand, v.hand);
    if (PAD.edge('reset', v.reset)) resetCar();
    if (PAD.edge('pause', v.pause)) togglePause();
    if (PAD.edge('up', v.up)) IN.up = true;
    if (PAD.edge('down', v.down)) IN.down = true;
  }
  // phone held as a wheel: the tilt angle steers (the arrow buttons still win if they are showing and pressed)
  let digiPed = false;
  const body = document.body;
  if (body.classList.contains('tiltsteer')) {
    if (TILT.live()) {
      const target = TILT.steer(); TILT.val += (target - TILT.val) * .5;
      if (!p || Math.abs(steer) < .001) { steer = TILT.val; analog = true; IN.rate = 14; digiPed = !p; }
      IN.tiltDead = 0;
    } else if (RACE && RACE.st !== 'paused') {
      IN.tiltDead = (IN.tiltDead || 0) + 1 / 60;
      // no sensor readings for a while: bring the steering buttons back rather than leave the car unsteerable
      if (IN.tiltDead > 2.5) {
        body.classList.remove('tiltsteer'); IN.tiltDead = 0;
        if (!TILT.noteShown) { TILT.noteShown = true; hudMsg(TILT.blocked || TILT.framed() ? 'Tilt not available in this page: buttons' : TILT.needsPermission() && TILT.perm !== 'granted' ? 'Tap Allow for motion to use tilt' : 'No tilt sensor: using buttons', 2.6); }
        if (!TILT.needsPermission() || TILT.perm !== 'unknown') TILT.blocked = true; // stop offering tilt for this visit
      }
    }
    updateTiltMeter(TILT.live() ? TILT.val : 0, TILT.live());
  }
  const manual = SV.settings.gearbox === 'manual', up = manual && !!IN.up, down = manual && !!IN.down;
  IN.up = IN.down = false;
  return { steer, thr, brk, hand, analog, manual, up, down, rate: IN.rate, digiPed };
}

// ---------- game state ----------
const GAME = { mode: 'menu', t: 0, last: 0 };
let RACE = null;
const REF_CAR = { 1: 'pip', 2: 'cigale', 3: 'k4', 4: 'zenith', 5: 'raiden' };
const ASSIST = { off: 0, low: .3, med: .55, high: .8 };

function makeFreeEvent(biome, type, surf, cond) {
  const id = `free_${biome}_${type}_${surf}_${cond}`;
  return { id, name: BIOMES[biome].name + ' ' + TYPES[type].name, biome, type, surf, cond, len: type === 'roam' ? 2600 : 2000, seed: strSeed(id + (SV.free || 0)), free: true, jumps: type === 'roam' ? 3 : undefined };
}

function startRace(ev, carId, tyre) {
  phoneFullscreen();
  GAME.mode = 'loading';
  setBackdrop(ev.biome);
  UI.loading(ev);
  setTimeout(() => {
    const t0 = performance.now();
    const T = buildTrack(ev), Wd = buildWorld(T);
    prepareScene(T, Wd, ev.cond);
    clearParts();
    const spec = CAR[carId], P = carParams(spec, upOf(carId), tyre, CONDS[ev.cond]);
    // reference run → target times & the gold ghost
    let gold = null, gGhost = null, refT = null;
    if (ev.type !== 'roam') {
      const refId = ev.free ? carId : REF_CAR[ev.cls];
      const refUp = ev.free ? upOf(carId) : { engine: 1, gearbox: 1, tyres: 1, susp: 1, brakes: 1, weight: 1 };
      const RP = carParams(CAR[refId], refUp, SURF_TYRE[ev.surf] || 'gravel', CONDS[ev.cond]);
      const sim = simulateRun(T, Wd, RP, .855, 420);
      if (sim.time) { gold = Math.round((sim.time - sim.resets * 2) * .985 * 10) / 10; gGhost = { d: sim.ghost, spec: CAR[refId], liv: CAR[refId].liv }; }
      if (gold && !ev.free && !ev.rally) { SV.tt[ev.id] = gold; writeSave(); }
      refT = sim.time ? sim.time - sim.resets * 2 : T.len / 21;
    }
    for (const o of Wd.objs) if (o.broken) o.broken = 0; // whatever the reference run knocked over stands again
    const car = makeCar(P, 0, 0, 0); placeOnRoad(car, T, T.startS);
    // in a rally the car arrives with whatever the last stage did to it
    if (ev.rally && SV.rally && SV.rally.dm) { car.dm = JSON.parse(JSON.stringify(SV.rally.dm)); car.dents = (SV.rally.dents || []).slice(); dmgTotal(car); }
    const best = SV.ev[ev.id] || null, myGhost = SV.settings.ghost ? loadGhost(ev.id) : null;
    RACE = {
      ev, T, Wd, spec, carId, liv: livOf(carId), tyre, P, car, st: 'countdown', cd: 3.6, t: 0, acc: 0,
      total: 0, lastS: T.startS, target: T.closed ? T.laps * T.len : T.finishS - T.startS, splits: [], cpNext: 0, lap: 1, lapStart: 0, lapTimes: [],
      gold, refT, rally: !!ev.rally, targets: gold && !ev.rally ? [gold * 1.18, gold * 1.08, gold] : null, goldGhost: gGhost, myGhost, rec: [], recT: 0,
      resets: 0, pen: 0, wrong: 0, lanterns: 0, noteIdx: 0, msgT: 0, hudT: 0, best, cheer: 0, finishT: 0, introT: 1.6, spoken: -1,
    };
    cam.x = car.x; cam.y = car.y; cam.rot = (CAMS[SV.settings.camera] || CAMS.chase).rotate ? car.h + 1.1 : -Math.PI / 2; cam.pitch = 62 * Math.PI / 180; cam.focal = R.H * 1.2; cam.dist = cam.distB = 50; cam.acc = cam.accS = cam.lag = cam.lagV = 0; cam.shake = 0;
    AUD.init(); AUD.startEngine(spec.turbo);
    GAME.mode = 'race';
    UI.hud(true);
    console.log('stage ready in', Math.round(performance.now() - t0), 'ms');
  }, 80);
}

function resetCar() {
  if (!RACE || RACE.st !== 'run') return;
  const rd = RACE.Wd.road(RACE.car.x, RACE.car.y);
  placeOnRoad(RACE.car, RACE.T, rd.s); RACE.car.fx = null;
  RACE.resets++; if (RACE.ev.type !== 'roam') { RACE.pen += 2; hudMsg('Reset  +2.0'); }
}
function togglePause() {
  if (!RACE) return;
  if (RACE.st === 'paused') { RACE.st = RACE.prevSt; UI.close(); AUD.ac && AUD.ac.resume(); }
  else if (RACE.st === 'run' || RACE.st === 'countdown') { RACE.prevSt = RACE.st; RACE.st = 'paused'; UI.pause(); AUD.ac && AUD.ac.suspend(); }
}
function quitRace() { cam.roll = 0; applyCamRoll(0); const tb = document.getElementById('tilt-bot'); if (tb) tb.style.backdropFilter = tb.style.webkitBackdropFilter = ''; cam.blurPx = 0; AUD.stopEngine(); if (AUD.ac) AUD.ac.resume(); RACE = null; GAME.mode = 'menu'; UI.hud(false); }

function hudMsg(text, dur) { const el = document.getElementById('h-msg'); el.textContent = text; el.style.opacity = 1; RACE.msgT = dur || 1.8; }

function raceStep(dt) {
  const RC = RACE, car = RC.car, T = RC.T, Wd = RC.Wd;
  if (RC.st === 'paused') return;
  let inp = readInput();
  if (RC.st === 'countdown') {
    const prev = Math.ceil(RC.cd - .6);
    RC.cd -= dt;
    const now = Math.ceil(RC.cd - .6);
    if (now !== prev && now >= 0 && now < 3) { AUD.beep(false); document.getElementById('h-center').textContent = String(now + 1); }
    if (RC.cd <= .6 && RC.st === 'countdown') { RC.st = 'run'; AUD.beep(true); document.getElementById('h-center').textContent = 'Go'; setTimeout(() => { const el = document.getElementById('h-center'); if (el) el.textContent = ''; }, 700); }
    car.rpm = lerp(car.rpm, 900 + inp.thr * 5200, .1); car.thr = inp.thr;
    inp = { steer: 0, thr: 0, brk: 1, hand: 1 };
    if (RC.st === 'countdown') { AUD.update(car, 0, S.C.weather === 'rain', dt); return; }
  }
  if (RC.st === 'done') inp = { steer: inp.steer * .3, thr: 0, brk: .85, hand: 0 };
  RC.acc += dt;
  const assist = ASSIST[SV.settings.assist] ?? .55;
  let landMax = 0, hitMax = 0;
  while (RC.acc >= PHYS_DT) {
    RC.acc -= PHYS_DT;
    stepCar(car, inp, Wd, PHYS_DT, assist, SV.settings.tc !== false, SV.settings.abs !== false);
    if (car.shiftEv) { if (car.shiftEv === -2) { AUD.deny(); hudMsg('Too fast for that gear', .9); } }
    inp.up = inp.down = false;
    if (RC.st === 'run') RC.t += PHYS_DT;
    const rd = Wd.road(car.x, car.y);
    let ds = rd.s - RC.lastS; if (T.closed) { if (ds < -T.len / 2) ds += T.len; if (ds > T.len / 2) ds -= T.len; }
    if (Math.abs(ds) < 20 && Math.abs(rd.lat) < T.width * 2.5 + 20) RC.total += ds;
    for (const j of T.jumps) {
      const crossed = T.closed ? (RC.lastS < j.s && rd.s >= j.s && ds > 0) : (RC.lastS < j.s && rd.s >= j.s);
      if (crossed && Math.abs(rd.lat) < T.width / 2 + 1.2 && !car.air && car.speed > 12) car.vz = jumpKick(car, j);
    }
    RC.lastS = rd.s; RC.curS = rd.s; RC.lat = rd.lat; RC.tan = rd.i;
    landMax = Math.max(landMax, car.land); hitMax = Math.max(hitMax, car.hit);
    if (car.land > 2.5) { burstLanding(car, car.land); AUD.land(car.land); cam.shake = Math.max(cam.shake, car.land * .8); }
    if (car.lastHit && car.lastHit.at == null) car.lastHit.at = RC.t;
    if (car.fence) { fenceBreak(car, car.fence); car.fence = null; }
    if (car.hit > 1.5) { AUD.hit(car.hit, car.hitK); cam.shake = Math.max(cam.shake, car.hit * .7); burstHit(car.x + Math.cos(car.h) * 2, car.y + Math.sin(car.h) * 2, S.B.trees.length ? (TREE_LOOK[S.B.trees[0][0]] || {}).cols?.[2] : null); }
  }
  // puddles on wet days: a splash and a sheet of spray as a wheel goes through
  if (Wd.puddles.length && car.speed > 6 && !car.air) {
    for (const pd of Wd.puddles) {
      const dx = car.x - pd.x, dy = car.y - pd.y; if (dx * dx + dy * dy > pd.rx * pd.rx + 2) { if (pd.hitT) pd.hitT = 0; continue; }
      if (pd.hitT) continue; pd.hitT = 1; AUD.puddle(car.speed);
      const cl = S.fxc ? S.fxc.water : '#cfe0ea';
      for (let k = 0; k < 14; k++) spawn(1, pd.x + (Math.random() - .5) * pd.rx, pd.y + (Math.random() - .5) * pd.ry, .2, car.vx * .25 + (Math.random() - .5) * 5, car.vy * .25 + (Math.random() - .5) * 5, 2 + Math.random() * 3, .9, .1, 0, cl, .85);
    }
  }
  // controller rumble: road texture and slides as a light buzz, landings and impacts as heavy thumps
  const pad = PAD.active();
  if (pad && RC.st !== 'done') {
    const rough = car.air ? 0 : SURF[car.sR].rough * Math.min(1, car.speed / 25) * (1 - .2 * car.P.susp);
    const weak = rough * .16 + Math.min(.28, car.slipR * .01) + (car.spin > .2 ? .08 : 0) + (car.abs ? .14 : 0), strong = Math.max(landMax > 2.5 ? Math.min(1, landMax * .12) : 0, hitMax > 1.5 ? Math.min(1, hitMax * .1) : 0);
    if (strong > 0) PAD.rumble(pad, weak, strong, 170, true); else if (weak > .03) PAD.rumble(pad, weak, rough * .06, 90);
  }
  // progress, splits, laps, finish
  if (RC.st === 'run') {
    if (RC.ev.type === 'roam') {
      for (const l of Wd.lanterns) if (!l.got && hyp(l.x - car.x, l.y - car.y) < 5) { l.got = true; RC.lanterns++; burstLantern(l.x, l.y); AUD.chime(); hudMsg(`Lantern ${RC.lanterns} of ${Wd.lanterns.length}`); if (RC.lanterns >= Wd.lanterns.length) finishRace(); }
    } else {
      const tt = RC.t + RC.pen;
      if (!T.closed) {
        while (RC.cpNext < T.checks.length && RC.total >= T.checks[RC.cpNext] - T.startS) {
          RC.splits.push(tt);
          if (RC.rally) { const lead = rallyLeaderAt((T.checks[RC.cpNext] - T.startS) / RC.target); showSplit(lead != null ? tt - lead : null, `Split ${RC.cpNext + 1} vs leader`); }
          else { const bs = RC.best && RC.best.splits && RC.best.splits[RC.cpNext]; showSplit(bs != null ? tt - bs : null, `Split ${RC.cpNext + 1}`); }
          RC.cpNext++;
        }
      } else {
        const lapNow = Math.min(T.laps, Math.floor(RC.total / T.len) + 1);
        if (lapNow > RC.lap) {
          const lt = tt - RC.lapStart; RC.lapTimes.push(lt); RC.lapStart = tt; RC.lap = lapNow; RC.splits.push(tt);
          const bs = RC.best && RC.best.splits && RC.best.splits[RC.lap - 2];
          showSplit(bs != null ? tt - bs : null, lapNow === T.laps ? 'Final lap' : `Lap ${lapNow}`);
        }
      }
      if (RC.total >= RC.target) finishRace();
    }
    // wrong way
    const i = clamp(RC.tan, 0, T.n - 1), dv = car.vx * T.tx[i] + car.vy * T.ty[i];
    RC.wrong = dv < -3 ? RC.wrong + dt : 0;
    if (RC.wrong > 1.5 && RC.msgT <= 0) hudMsg('Wrong way', 1.2);
    // ghost recording
    RC.recT += dt; if (RC.recT >= .1) { RC.recT -= .1; RC.rec.push(Math.round(car.x * 10) / 10, Math.round(car.y * 10) / 10, Math.round(car.h * 100) / 100); }
  }
  if (RC.st === 'done') { RC.finishT += dt; if (RC.finishT > 1.6 && !RC.shown) { RC.shown = true; document.getElementById('h-center').textContent = ''; document.getElementById('h-notes').hidden = true; UI.results(RC.result); } }
  // pass-bys: posts, trees and poles that flick past close to the car each push a whoosh of air
  if (car.speed > 13 && !car.air) passBys(car, Wd);
  // fx & world life
  emitCarFx(car, dt, false);
  RC.cheer = updateSpectators(car, dt, GAME.t);
  updateParts(dt); updateWeather(dt, GAME.t);
  AUD.update(car, RC.cheer, S.C.weather === 'rain', dt);
  updateCamera(dt);
  if (RC.msgT > 0) { RC.msgT -= dt; if (RC.msgT <= 0) document.getElementById('h-msg').style.opacity = 0; }
}

const WHOOSH = { tree: 2, tpole: 1, slamp: 1, stake: 1, chev: 1, jpost: 1, jboard: 1, sign: 1, pole: 1, lamp: 1, house: 2, mill: 2, pump: 1, logs: 2, hay: 1, rock: 1 };
function passBys(car, Wd) {
  const sp = car.speed, vx = car.vx / sp, vy = car.vy / sp, now = GAME.t;
  Wd.query(car.x, car.y, 11, o => {
    const kind = WHOOSH[o.k]; if (!kind || (o.k === 'tree' && o.h < 2.5) || (o.k === 'rock' && o.h < 1.2)) return;
    const dx = o.x - car.x, dy = o.y - car.y, d = dx * vx + dy * vy, l = dx * -vy + dy * vx, prev = o._pb, fresh = now - (o._pbT || -9) < .3;
    o._pb = d; o._pbT = now;
    if (!fresh || prev <= 0 || d > 0) return;
    const al = Math.abs(l) - (o.cr || o.r || 0) * .6; if (al > 7.5) return;
    if (now - (AUD.lastWh || 0) < .05) return; AUD.lastWh = now;
    AUD.whoosh(clamp(l / 5, -1, 1) * .85, Math.min(.11, (sp - 11) * .0045) * (1 - al / 8.5) * (kind === 2 ? 1.25 : 1), kind === 2);
  });
}
function showSplit(delta, label) {
  const el = document.getElementById('h-split');
  el.textContent = label + (delta != null ? '   ' + fmtDelta(delta) : '');
  el.className = delta == null ? '' : delta <= 0 ? 'good' : 'bad';
  el.style.opacity = 1; clearTimeout(showSplit.tm); showSplit.tm = setTimeout(() => { el.style.opacity = 0; }, 3200);
}

function finishRace() {
  const RC = RACE; if (RC.st === 'done') return;
  RC.st = 'done';
  const time = Math.round((RC.t + RC.pen) * 100) / 100, ev = RC.ev;
  if (RC.rally) {
    RC.result = { ...rallyStageDone(time, RC.refT || time, RC.car), time, rally: true, ev, resets: RC.resets };
    if (RC.result.done && RC.result.pos <= 3) AUD.fanfare(); else AUD.beep(true);
    document.getElementById('h-center').textContent = fmtTime(time);
    return;
  }
  let medal = 0;
  if (RC.targets) medal = time <= RC.targets[2] ? 3 : time <= RC.targets[1] ? 2 : time <= RC.targets[0] ? 1 : 0;
  if (ev.type === 'roam') medal = 0;
  const prev = SV.ev[ev.id] || null, isBest = !prev || !prev.best || time < prev.best;
  let pay = ev.type === 'roam' ? 400 : MEDAL_PAY[medal] * (1 + .3 * ((ev.cls || CAR[RC.carId].cls) - 1));
  if (ev.free) pay *= .5;
  if (prev && (prev.medal || 0) >= medal && !ev.free) pay *= .5;
  pay = Math.round(pay / 10) * 10;
  SV.credits += pay;
  const prevMedal = prev ? prev.medal || 0 : 0;
  if (!ev.free || ev.type !== 'roam') SV.ev[ev.id] = { best: isBest ? time : prev.best, medal: Math.max(prevMedal, medal), splits: isBest ? RC.splits.slice() : (prev && prev.splits) || [], car: isBest ? RC.carId : prev && prev.car };
  if (isBest && ev.type !== 'roam') saveGhost(ev.id, { d: RC.rec, car: RC.carId, liv: RC.liv, t: time });
  const champWas = ev.champ ? champDone(ev.champ) : true;
  const fresh = checkUnlocks();
  const champNow = ev.champ ? champDone(ev.champ) : true;
  writeSave();
  RC.result = { time, medal, prevMedal, pay, isBest, prevBest: prev && prev.best, fresh, champDone: !champWas && champNow, ev, targets: RC.targets, splits: RC.splits, lapTimes: RC.lapTimes, resets: RC.resets, lanterns: RC.lanterns, dmg: RC.car.dmg, parts: damageList(RC.car.dm) };
  burstConfetti(RC.car.x + Math.cos(RC.car.h) * 10, RC.car.y + Math.sin(RC.car.h) * 10);
  if (medal >= 1 || ev.type === 'roam') AUD.fanfare(); else AUD.beep(true);
  document.getElementById('h-center').textContent = ev.type === 'roam' ? 'All found' : fmtTime(time);
}

// camera presets: pitch is degrees below the horizon, dist is metres from the camera to its aim point
const CAMS = {
  chase: { name: 'Chase', pitch: 21, dist: 15.5, rotate: true, focal: .95, lead: 4.6 },
  high:  { name: 'High chase', pitch: 36, dist: 27, rotate: true, focal: 1.1, lead: 5 },
  fixed: { name: 'Fixed', pitch: 60, dist: 62, rotate: false, focal: 1.2, lead: 0 },
};
function updateCamera(dt) {
  const RC = RACE, car = RC.car, mode = CAMS[SV.settings.camera] || CAMS.chase, sp = car.speed;
  const velA = Math.atan2(car.vy, car.vx), moving = sp > 2.5 && car.fwdV > -.5;
  const intro = RC.st === 'countdown' ? clamp((RC.cd - .6) / 3, 0, 1) : 0;
  // face between the car's nose and where it is travelling, so drifts show the car's angle
  let want = mode.rotate ? (moving ? car.h + wrapA(velA - car.h) * .55 : car.h) + intro * 1.2 : -Math.PI / 2;
  cam.rot += wrapA(want - cam.rot) * (1 - Math.exp(-dt * (RC.st === 'countdown' ? 1.8 : 3.2)));
  const pd = (mode.pitch - Math.min(5, sp * .11) + intro * 26) * Math.PI / 180;
  cam.pitch += (pd - cam.pitch) * (1 - Math.exp(-dt * 2.4));
  const fa = mode.rotate ? cam.rot : velA, lead = mode.rotate ? mode.lead + Math.min(mode.lead, sp * .09) : (moving ? Math.min(22, sp * .42) : 0);
  const k = 1 - Math.exp(-dt * 7);
  cam.x += (car.x + Math.cos(fa) * lead - cam.x) * k; cam.y += (car.y + Math.sin(fa) * lead - cam.y) * k;
  // weight: the camera trails under acceleration and closes in under braking; it pulls back and widens with speed
  cam.acc = lerp(cam.acc || 0, car.ax, 1 - Math.exp(-dt * 4));
  const aspect = clamp(1.3 - R.W / R.H * .28, 1, 1.25);
  // camera lag: when the car leaps forward the camera is left behind for a beat, then reels it back in.
  // Driven by the change in acceleration, so a steady pull does not keep the car small.
  cam.accS = lerp(cam.accS || 0, car.ax, 1 - Math.exp(-dt * .9));
  const lagT = clamp((cam.acc - cam.accS) * .028 + cam.acc * .004, -.07, .15);
  cam.lagV = (cam.lagV || 0) + ((lagT - (cam.lag || 0)) * 38 - (cam.lagV || 0) * 7.5) * dt;
  cam.lag = (cam.lag || 0) + cam.lagV * dt;
  const dt2 = mode.dist * aspect * (1 + Math.min(.22, sp / 150)) * (1 + intro * .6);
  cam.distB = cam.distB || cam.dist; cam.distB += (dt2 - cam.distB) * (1 - Math.exp(-dt * 2.6));
  cam.dist = cam.distB * (1 + cam.lag);
  // speed feel: the lens widens with speed and kicks wider still when the car squats under power
  const punch = clamp(cam.acc * .007, -.03, .05);
  const ft = R.H * (mode.focal - Math.min(.24, sp / 140) - punch) * (R.W < R.H ? 1.12 : 1);
  cam.focal += (ft - cam.focal) * (1 - Math.exp(-dt * 3));
  // the road comes up through the camera: surface texture, plus a fine buzz that grows past 70 km/h
  const rough = car.air ? 0 : SURF[car.sR].rough * (1 - .2 * car.P.susp);
  cam.shake = Math.max(cam.shake * Math.exp(-dt * 6), rough * Math.min(1, sp / 32) * .75 + Math.max(0, sp - 19) * .025);
  cam.sx = (Math.random() - .5) * cam.shake * 2; cam.sy = (Math.random() - .5) * cam.shake * 2;
  // the camera leans a little into the corner and settles back, like a car-mounted rig
  const rollT = mode.rotate && RC.st !== 'countdown' ? clamp(-car.ay * .0032, -.028, .028) : 0;
  cam.roll = (cam.roll || 0) + (rollT - (cam.roll || 0)) * (1 - Math.exp(-dt * 3.5));
  applyCamRoll(cam.roll);
  // the near ground smears more the faster you go
  const blur = 3.5 + clamp((sp - 14) * .14, 0, 4.5);
  if (Math.abs(blur - (cam.blurPx || 0)) > .35) { cam.blurPx = blur; const tb = document.getElementById('tilt-bot'); if (tb) tb.style.backdropFilter = tb.style.webkitBackdropFilter = `blur(${blur.toFixed(1)}px)`; }
}
function applyCamRoll(r) {
  if (Math.abs(r - (cam.rollApplied ?? 0)) < .0006) return; cam.rollApplied = r;
  const tf = Math.abs(r) < .0006 ? '' : `rotate(${r.toFixed(4)}rad) scale(${(1 + Math.abs(r) * 1.9).toFixed(4)})`;
  for (const id of ['game', 'gl']) { const el = document.getElementById(id); if (el) el.style.transform = tf; }
}

function ghostAt(g, t) {
  if (!g || !g.d || g.d.length < 6) return null;
  const f = t / .1, i = Math.floor(f), n = g.d.length / 3;
  if (i >= n - 1) return null;
  const a = i * 3, b = a + 3, u = f - i;
  return { x: lerp(g.d[a], g.d[b], u), y: lerp(g.d[a + 1], g.d[b + 1], u), h: g.d[a + 2] + wrapA(g.d[b + 2] - g.d[a + 2]) * u, z: 0, roll: 0, pitch: 0, delta: 0, P: RACE.P };
}

// ---------- HUD ----------
const NOTE_SVG = {};
function noteIcon(nt) {
  const key = nt.kind + (nt.dir || 0) + (nt.grade || '') + (nt.square ? 'q' : '');
  if (NOTE_SVG[key]) return NOTE_SVG[key];
  let path = '';
  if (nt.kind === 'corner') {
    const ang = { H: 175, 1: 135, 2: 110, 3: 85, 4: 62, 5: 42, 6: 25 }[nt.grade] * Math.PI / 180, r = nt.grade === 'H' ? 7 : 10, d = nt.dir;
    let x = 20 - d * (nt.grade === 'H' ? 7 : 4), y = 34, h = -Math.PI / 2;
    path = `M${x} ${y} L${x} ${y - 8}`; y -= 8;
    const steps = 12; let pts = '';
    for (let i = 1; i <= steps; i++) { h += d * ang / steps; x += Math.cos(h) * r * ang / steps; y += Math.sin(h) * r * ang / steps; pts += ` L${x.toFixed(1)} ${y.toFixed(1)}`; }
    x += Math.cos(h) * 4; y += Math.sin(h) * 4; pts += ` L${x.toFixed(1)} ${y.toFixed(1)}`;
    const ah = (a) => `${(x + Math.cos(h + a) * 6).toFixed(1)} ${(y + Math.sin(h + a) * 6).toFixed(1)}`;
    path += pts + ` M${ah(Math.PI * .78)} L${x.toFixed(1)} ${y.toFixed(1)} L${ah(-Math.PI * .78)}`;
  } else if (nt.kind === 'jump' || nt.kind === 'crest') path = 'M4 30 Q20 6 36 30 M20 4 L20 14';
  else if (nt.kind === 'chicane') path = nt.dir > 0 ? 'M26 36 L26 26 L14 18 L14 10 L26 4 M10 8 L14 4 L18 8' : 'M14 36 L14 26 L26 18 L26 10 L14 4 M22 8 L26 4 L30 8';
  else if (nt.kind === 'ford') path = 'M4 16 Q10 10 16 16 T28 16 T40 16 M4 26 Q10 20 16 26 T28 26 T40 26';
  else if (nt.kind === 'surface') path = 'M6 30 L34 30 M10 22 L14 22 M20 22 L24 22 M28 22 L32 22 M14 14 L18 14 M24 14 L28 14';
  else path = 'M8 6 L8 34 M8 6 L32 6 L32 20 L8 20';
  return (NOTE_SVG[key] = `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="${path}" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`);
}
function upcomingNotes() {
  const RC = RACE, T = RC.T, s = RC.curS ?? T.startS, out = [];
  for (const nt of T.notes) {
    let d = nt.s - s; if (T.closed && d < -T.len / 2) d += T.len;
    if (nt.e - s < -2 && !(T.closed && d > 0)) continue;
    if (d > -2 && d < 150) out.push({ nt, d });
    if (out.length >= 2) break;
  }
  if (T.closed && out.length < 2) for (const nt of T.notes) { const d = nt.s + T.len - s; if (d > 0 && d < 150 && !out.some(o => o.nt === nt)) out.push({ nt, d }); if (out.length >= 2) break; }
  return out;
}
let _hudNotesKey = '';
function updateHud(dt) {
  const RC = RACE; if (!RC) return;
  RC.hudT -= dt; if (RC.hudT > 0) return; RC.hudT = .05;
  const T = RC.T, car = RC.car;
  const tt = RC.st === 'countdown' ? 0 : RC.t + RC.pen;
  document.getElementById('h-time').textContent = RC.ev.type === 'roam' ? `${RC.lanterns} / ${RC.Wd.lanterns.length}` : fmtTime(tt);
  let sub = '';
  if (T.closed) sub = `Lap ${RC.lap} of ${T.laps}`;
  else if (RC.ev.type === 'roam') sub = 'Lanterns found';
  else sub = `${Math.round(clamp(RC.total / RC.target, 0, 1) * 100)}%  ·  ${(Math.max(0, RC.target - RC.total) / 1000).toFixed(2)} km to go`;
  if (RC.targets && RC.ev.type !== 'roam') sub += `  ·  gold ${fmtTime(RC.targets[2])}`;
  if (RC.rally && SV.rally) sub = `SS${SV.rally.stage + 1} of ${RALLY[SV.rally.id].stages.length}  ·  ` + sub;
  document.getElementById('h-sub').textContent = sub;
  document.getElementById('h-prog').style.width = (clamp(RC.total / RC.target, 0, 1) * 100) + '%';
  const gp = document.getElementById('h-gprog');
  if (RC.gGhostProg != null) { gp.style.left = (RC.gGhostProg * 100) + '%'; gp.hidden = false; } else gp.hidden = true;
  // surface chips
  const sk = car.sR, chips = `<span class="chip"><i style="background:${S.B.road[sk] || S.B.ground[3]}"></i>${SURF[sk].name}</span><span class="chip">${TYRES[RC.tyre].name}</span>`;
  const sEl = document.getElementById('h-surf'); if (sEl._k !== chips) { sEl.innerHTML = chips; sEl._k = chips; }
  // pace notes
  const nEl = document.getElementById('h-notes');
  if (SV.settings.notes && RC.ev.type !== 'roam') {
    const ups = upcomingNotes(), key = ups.map(u => u.nt.s + ':' + Math.round(u.d / 10)).join('|');
    if (key !== _hudNotesKey) {
      _hudNotesKey = key;
      nEl.innerHTML = ups.map((u, i) => `<div class="note${i ? ' next' : ''}${u.nt.text.warn ? ' warn' : ''}">${noteIcon(u.nt)}<div class="g">${u.nt.text.big}</div><div class="w">${u.nt.text.line}${i === 0 ? `<br>${Math.max(0, Math.round(u.d / 10) * 10)} m` : ''}</div></div>`).join('');
      if (SV.settings.voice && ups[0] && ups[0].nt !== RC.spokenNt && ups[0].d < 110 && 'speechSynthesis' in window) {
        RC.spokenNt = ups[0].nt; try { const u = new SpeechSynthesisUtterance(ups[0].nt.text.say); u.rate = 1.25; u.volume = .8; speechSynthesis.cancel(); speechSynthesis.speak(u); } catch (e) { }
      }
    }
  } else if (nEl.innerHTML) nEl.innerHTML = '';
  drawMinimap(); drawGauge();
}
function drawMinimap() {
  const c = document.getElementById('h-map'), x = c.getContext('2d'), mm = S.mm, RC = RACE;
  x.clearRect(0, 0, 300, 300);
  x.save(); x.globalAlpha = .9; x.drawImage(mm.c, 0, 0); x.restore();
  const dot = (wx, wy, col, r) => { x.fillStyle = col; x.beginPath(); x.arc(mm.ox + wx * mm.sc, mm.oy + wy * mm.sc, r, 0, TAU); x.fill(); };
  for (const l of RC.Wd.lanterns) if (!l.got) dot(l.x, l.y, '#ffb066', 6);
  if (RC.ghostPos) dot(RC.ghostPos.x, RC.ghostPos.y, 'rgba(242,207,115,.9)', 7);
  x.strokeStyle = '#191726'; x.lineWidth = 4; x.beginPath(); x.arc(mm.ox + RC.car.x * mm.sc, mm.oy + RC.car.y * mm.sc, 9, 0, TAU); x.stroke();
  dot(RC.car.x, RC.car.y, '#f7b27a', 9);
}
function drawGauge() {
  const c = document.getElementById('h-gauge'), x = c.getContext('2d'), car = RACE.car, w = 380, h = 240;
  x.clearRect(0, 0, w, h);
  const cx = w / 2 + 30, cy = 175, r = 140, a0 = Math.PI * 1.08, a1 = Math.PI * 1.92, rn = clamp((car.rpm - 900) / 6300, 0, 1);
  x.lineCap = 'round';
  x.strokeStyle = 'rgba(25,23,38,.45)'; x.lineWidth = 16; x.beginPath(); x.arc(cx, cy, r, a0, a1); x.stroke();
  x.strokeStyle = 'rgba(233,143,138,.6)'; x.lineWidth = 10; x.beginPath(); x.arc(cx, cy, r, a0 + (a1 - a0) * .86, a1); x.stroke();
  x.strokeStyle = rn > .9 ? '#e98f8a' : '#f4ecdc'; x.lineWidth = 8; x.beginPath(); x.arc(cx, cy, r, a0, a0 + (a1 - a0) * rn); x.stroke();
  for (let i = 0; i <= 7; i++) { const a = a0 + (a1 - a0) * i / 7; x.strokeStyle = 'rgba(244,236,220,.5)'; x.lineWidth = 3; x.beginPath(); x.moveTo(cx + Math.cos(a) * (r - 18), cy + Math.sin(a) * (r - 18)); x.lineTo(cx + Math.cos(a) * (r - 28), cy + Math.sin(a) * (r - 28)); x.stroke(); }
  x.fillStyle = '#f4ecdc'; x.textAlign = 'right'; x.textBaseline = 'alphabetic';
  x.font = '500 82px "DM Mono", ui-monospace, monospace'; x.shadowColor = 'rgba(10,8,20,.6)'; x.shadowBlur = 14;
  x.fillText(String(Math.round(car.speed * 3.6)), cx + 40, cy - 8);
  x.shadowBlur = 0; x.font = '500 22px Jost, Futura, sans-serif'; x.fillStyle = 'rgba(244,236,220,.65)'; x.fillText('KM/H', cx + 40, cy + 24);
  x.textAlign = 'left'; x.font = '500 54px "DM Mono", ui-monospace, monospace'; x.fillStyle = '#f7b27a';
  x.fillText(car.rev ? 'R' : String(car.gear + 1), cx + 62, cy - 10);
  if (car.P.turbo) { x.fillStyle = 'rgba(244,236,220,.2)'; x.fillRect(cx + 64, cy + 6, 46, 8); x.fillStyle = '#9ec9c4'; x.fillRect(cx + 64, cy + 6, 46 * car.boost, 8); }
  // manual gearbox: an M tag and a shift light that comes on near the red line
  if (SV.settings.gearbox === 'manual') {
    x.font = '500 18px Jost, Futura, sans-serif'; x.fillStyle = 'rgba(244,236,220,.6)'; x.textAlign = 'left'; x.fillText('M', cx + 64, cy - 66);
    if (rn > .88) { x.fillStyle = car.limiter ? (GAME.t * 12 % 2 < 1 ? '#ff5a3e' : '#7a2a24') : rn > .94 ? '#ff7a4a' : '#f2c27a'; x.beginPath(); x.arc(cx + 96, cy - 72, 8, 0, TAU); x.fill(); }
  }
  drawDamage(x, car);
}
// damage diagram: the car seen from above, nose up, each part tinted by how hurt it is
const DMG_COL = d => d < .05 ? 'rgba(244,236,220,.22)' : d < .3 ? '#f2d38a' : d < .6 ? '#f0a35e' : '#e8665a';
function drawDamage(x, car) {
  const D = car.dm; if (!D) return;
  const any = Math.max(D.eng, D.rad, D.gbx, D.str, D.body, ...D.sus);
  if (any < .03) return;
  const ox = 26, oy = 52, W = 64, H = 132, flash = car.lastHit && RACE && car.lastHit.at != null ? clamp(1 - (RACE.t - car.lastHit.at) / .8, 0, 1) : 0;
  const rr = (X, Y, w, h, r) => { x.beginPath(); if (x.roundRect) x.roundRect(X, Y, w, h, r); else x.rect(X, Y, w, h); };
  x.save(); x.globalAlpha = .92;
  x.fillStyle = 'rgba(25,23,38,.45)'; rr(ox - 10, oy - 14, W + 20, H + 28, 14); x.fill();
  x.strokeStyle = DMG_COL(D.body); x.lineWidth = 3; rr(ox + 8, oy, W - 16, H, 12); x.stroke();
  // wheels: FL FR RL RR, with the car's left on the left of the drawing
  const wy = [oy + 18, oy + 18, oy + H - 40, oy + H - 40];
  for (let i = 0; i < 4; i++) { x.fillStyle = DMG_COL(D.sus[i]); x.fillRect(i % 2 ? ox + W - 10 : ox, wy[i], 10, 24); }
  x.fillStyle = DMG_COL(D.rad); x.fillRect(ox + 16, oy + 4, W - 32, 7);          // radiator
  x.fillStyle = DMG_COL(D.eng); x.fillRect(ox + 18, oy + 15, W - 36, 24);        // engine
  x.fillStyle = DMG_COL(D.str); x.fillRect(ox + 10, oy + 44, W - 20, 5);         // steering rack
  x.fillStyle = DMG_COL(D.gbx); x.fillRect(ox + W / 2 - 7, oy + 58, 14, 30);     // gearbox
  if (flash > 0) { x.globalAlpha = flash * .8; x.strokeStyle = '#ff6a50'; x.lineWidth = 4; rr(ox - 10, oy - 14, W + 20, H + 28, 14); x.stroke(); }
  x.restore();
}
const PART_NAMES = { eng: 'Engine', rad: 'Radiator', gbx: 'Gearbox', str: 'Steering', body: 'Bodywork' };
function damageList(D) {
  if (!D) return [];
  const out = Object.entries(PART_NAMES).map(([k, n]) => [n, D[k]]);
  ['Front-left', 'Front-right', 'Rear-left', 'Rear-right'].forEach((n, i) => out.push([n + ' suspension', D.sus[i]]));
  return out.filter(([, v]) => v > .04).sort((a, b) => b[1] - a[1]);
}

// ---------- main loop ----------
function adaptDetail(dt) {
  R.ftT += dt * 1000; R.ftN++;
  if (R.ftT < 1500) return;
  const avg = R.ftT / R.ftN; R.ftT = 0; R.ftN = 0;
  if (avg > 21) R.gs = Math.max(.3, R.gs * .82); else if (avg < 15.5) R.gs = Math.min(1, R.gs * 1.06);
}
function frame(now) {
  const dt = Math.min(.05, (now - (GAME.last || now)) / 1000); GAME.last = now; GAME.t += dt;
  if (GAME.mode === 'race') adaptDetail(dt);
  if (GAME.mode !== 'race' || (RACE && (RACE.st === 'paused' || RACE.st === 'done'))) PAD.menuNav(dt);
  try {
    if (GAME.mode === 'race' && RACE && S) {
      raceStep(RACE.st === 'paused' ? 0 : dt);
      let ghost = null;
      if (SV.settings.ghost && RACE.st !== 'countdown') {
        const gt = RACE.t + RACE.pen;
        const mine = RACE.myGhost && ghostAt(RACE.myGhost, gt), gold = RACE.goldGhost && ghostAt(RACE.goldGhost, gt);
        ghost = mine || gold;
        if (ghost) { ghost.liv = mine ? RACE.myGhost.liv : 4; ghost.spec = mine ? CAR[RACE.myGhost.car] || RACE.spec : RACE.goldGhost.spec; const gp = RACE.gP || (RACE.gP = {}); ghost.P = gp[ghost.spec.id] || (gp[ghost.spec.id] = carParams(ghost.spec, null, 'gravel', CONDS.day)); }
        RACE.ghostPos = ghost;
        if (gold) { const rd = RACE.Wd.road(gold.x, gold.y); RACE.gGhostProg = RACE.T.closed ? null : clamp((rd.s - RACE.T.startS) / RACE.target, 0, 1); } else RACE.gGhostProg = null;
      } else RACE.ghostPos = null;
      drawWorld(GAME.t, RACE.car, ghost, RACE.spec, RACE.liv, ghost && ghost.spec);
      updateHud(dt);
    } else {
      drawBackdrop(GAME.t, dt);
    }
  } catch (e) { console.error(e); }
  requestAnimationFrame(frame);
}
