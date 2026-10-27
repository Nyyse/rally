// ---------- synthesized audio ----------
// Engine: a harmonic wavetable (warm, even-order heavy like a four-cylinder), two slightly detuned voices,
// gentle saturation and a load-dependent low-pass. Everything sits under a soft compressor and a 9 kHz roll-off.
const AUD = {
  ac: null, on: true, vol: .55, eng: null, lastGear: 0, lastBoost: 0,
  init() {
    if (this.ac) { if (this.ac.state === 'suspended') this.ac.resume(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      const ac = this.ac = new AC();
      this.master = ac.createGain(); this.master.gain.value = this.on ? this.vol : 0;
      const tone = ac.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = 9000; tone.Q.value = .4;
      const comp = ac.createDynamicsCompressor(); comp.threshold.value = -22; comp.knee.value = 18; comp.ratio.value = 3; comp.attack.value = .01; comp.release.value = .25;
      this.master.connect(tone); tone.connect(comp); comp.connect(ac.destination);
      const nb = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate), d = nb.getChannelData(0);
      let b0 = 0; for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; b0 = .985 * b0 + .015 * w; d[i] = w * .7 + b0 * 3; } // slightly pink
      this.noiseBuf = nb;
      const N = 28, re = new Float32Array(N), im = new Float32Array(N);
      for (let n = 1; n < N; n++) im[n] = Math.pow(n, -1.3) * (n % 2 ? .55 : 1.25) * (n === 2 ? 1.3 : 1);
      this.wave = ac.createPeriodicWave(re, im);
    } catch (e) { this.ac = null; }
  },
  setOn(v) { this.on = v; if (this.master) this.master.gain.setTargetAtTime(v ? this.vol : 0, this.ac.currentTime, .05); },
  setVol(v) { this.vol = v; if (this.master && this.on) this.master.gain.setTargetAtTime(v, this.ac.currentTime, .05); },
  noise() { const s = this.ac.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true; s.start(0, Math.random() * 1.5); return s; },
  filt(type, f, q) { const b = this.ac.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q || .7; return b; },
  gain(v) { const g = this.ac.createGain(); g.gain.value = v; return g; },
  startEngine(turbo) {
    if (!this.ac) return; this.stopEngine();
    const ac = this.ac, E = this.eng = {};
    const voice = det => { const o = ac.createOscillator(); o.setPeriodicWave(this.wave); o.detune.value = det; return o; };
    E.o1 = voice(-5); E.o2 = voice(6); E.sub = ac.createOscillator(); E.sub.type = 'sine';
    const sh = ac.createWaveShaper(), curve = new Float32Array(512);
    for (let i = 0; i < 512; i++) { const x = i / 256 - 1; curve[i] = Math.tanh(x * 1.25) / Math.tanh(1.25); }
    sh.curve = curve; sh.oversample = '2x';
    E.lp = this.filt('lowpass', 500, .5); E.body = this.filt('peaking', 180, .9); E.body.gain.value = 3;
    E.am = this.gain(1); E.g = this.gain(0);
    const m1 = this.gain(.32), m2 = this.gain(.26), m3 = this.gain(.34);
    E.o1.connect(m1); E.o2.connect(m2); E.sub.connect(m3); [m1, m2, m3].forEach(m => m.connect(sh));
    sh.connect(E.lp); E.lp.connect(E.body); E.body.connect(E.am); E.am.connect(E.g); E.g.connect(this.master);
    // a slow, irregular wobble on the level makes the idle feel mechanical rather than synthetic
    E.lfo = ac.createOscillator(); E.lfo.type = 'sine'; E.lfoG = this.gain(.08); E.lfo.connect(E.lfoG); E.lfoG.connect(E.am.gain);
    [E.o1, E.o2, E.sub, E.lfo].forEach(o => o.start());
    const mk = (type, f, q) => { const n = this.noise(), fl = this.filt(type, f, q), g = this.gain(0); n.connect(fl); fl.connect(g); g.connect(this.master); return { n, fl, g }; };
    E.intake = mk('bandpass', 1400, .8);
    E.grav = mk('bandpass', 1500, .55); E.rumble = mk('lowpass', 150, .6); E.wind = mk('bandpass', 420, .35);
    E.skid = mk('bandpass', 1050, 7); E.crowd = mk('bandpass', 1000, .45); E.rain = mk('highpass', 3000, .4); E.splash = mk('bandpass', 700, .6);
    E.rasp = mk('bandpass', 2300, 1.6); // exhaust rasp that opens up near the red line
    E.spray = mk('highpass', 2600, .5); E.slosh = mk('lowpass', 260, .8); E.hiss = mk('highpass', 4200, .6);
    // kerbs: a low buzzing drum as the tyres hammer over the painted ridges
    E.kerb = ac.createOscillator(); E.kerb.type = 'square'; E.kerbF = this.filt('lowpass', 220, .7); E.kerbG = this.gain(0); E.kerb.connect(E.kerbF); E.kerbF.connect(E.kerbG); E.kerbG.connect(this.master); E.kerb.start();
    this.inWater = false; this.lim = 0;
    if (turbo) { E.tb = ac.createOscillator(); E.tb.type = 'sine'; E.tbg = this.gain(0); E.tb.connect(E.tbg); E.tbg.connect(this.master); E.tb.start(); }
    this.lastGear = 0; this.lastBoost = 0;
  },
  stopEngine() {
    const E = this.eng; if (!E) return; this.eng = null;
    const t = this.ac.currentTime;
    if (E.g) E.g.gain.setTargetAtTime(0, t, .03);
    for (const k of Object.keys(E)) { const v = E[k]; try { if (v && v.stop) v.stop(t + .15); if (v && v.n) v.n.stop(t + .15); } catch (e) { } }
  },
  update(car, cheer, rain, dt) {
    const E = this.eng; if (!E || !this.ac) return;
    const t = this.ac.currentTime, T = .05, sp = car.speed, rn = clamp((car.rpm - 900) / 6300, 0, 1), thr = car.thr;
    const f = car.rpm / 60 * 2; // four-cylinder firing frequency
    E.o1.frequency.setTargetAtTime(f * .5, t, T); E.o2.frequency.setTargetAtTime(f * .5, t, T); E.sub.frequency.setTargetAtTime(f, t, T);
    E.lfo.frequency.setTargetAtTime(3 + rn * 9, t, .2); E.lfoG.gain.setTargetAtTime(.1 * (1 - rn) + .02, t, .2);
    E.lp.frequency.setTargetAtTime(260 + rn * 900 + thr * (500 + rn * 1600), t, .06);
    const load = car.shift > 0 ? .45 : 1;
    // the rev limiter chops the engine on and off; a misfire drops it for a beat
    this.lim = car.limiter ? (this.lim + 1) % 3 : 0;
    const chop = car.limiter ? (this.lim === 0 ? .25 : 1) : car.misT > 0 ? .3 : 1;
    E.g.gain.setTargetAtTime((.045 + thr * .06 + rn * .035) * load * chop, t, car.limiter || car.misT > 0 ? .008 : .05);
    E.intake.g.gain.setTargetAtTime(thr * rn * .03, t, .06); E.intake.fl.frequency.setTargetAtTime(900 + rn * 2600, t, .08);
    E.rasp.g.gain.setTargetAtTime(thr * rn * rn * .022 * load * chop, t, .05); E.rasp.fl.frequency.setTargetAtTime(1600 + rn * 1800, t, .08);
    // gear change: a soft mechanical thunk
    if (car.gear !== this.lastGear) {
      if (car.gear > this.lastGear) { this.blip(95, .09, 'sine', .07, 55); if (car.thr > .6) { this.burst(420, 1.2, .07, .05, 'lowpass'); this.burst(1500, 2.5, .05, .02); } } // ignition cut: a short brap
      else { this.blip(70, .07, 'sine', .05, 50); this.burst(1800, 2, .04, .018); } // a downshift: clack of the lever
      this.lastGear = car.gear;
    }
    const grp = SURF[car.sR].grp, onG = !car.air, loose = grp === 'loose' && onG, snow = grp === 'snow' && onG;
    const crunch = loose ? Math.min(.075, sp * .0024 + car.slipR * .003) * (.8 + Math.random() * .4) : snow ? Math.min(.04, sp * .0014) : 0;
    E.grav.g.gain.setTargetAtTime(crunch, t, .05);
    E.grav.fl.frequency.setTargetAtTime(snow ? 800 : car.sR === 'sand' ? 1000 : car.sR === 'mud' ? 600 : 1500, t, .15);
    E.rumble.g.gain.setTargetAtTime(onG ? Math.min(.11, sp * .003) : 0, t, .08);
    // wind rush: rises with the square of speed, opens up brighter, and gusts a little
    E.wind.g.gain.setTargetAtTime(Math.min(.095, sp * sp * .000085) * (.82 + .18 * Math.sin(t * 1.3) * Math.sin(t * .37 + 1)), t, .15);
    E.wind.fl.frequency.setTargetAtTime(260 + sp * 13, t, .3);
    const squeal = car.sR === 'tarmac' && onG ? clamp((car.slipR + car.slipF - 5) / 16, 0, 1) : 0;
    E.skid.g.gain.setTargetAtTime(squeal * .03, t, .08); E.skid.fl.frequency.setTargetAtTime(950 + sp * 4, t, .1);
    E.crowd.g.gain.setTargetAtTime(Math.min(.05, cheer * .002), t, .3);
    E.rain.g.gain.setTargetAtTime(rain ? .025 : 0, t, .4);
    // water: a big whoosh going in, sloshing and spray while wading, drips after
    const wet = (car.ws || [car.sF, car.sR]).some(k => k === 'water' || k === 'deep') && onG;
    if (wet && !this.inWater && sp > 3) this.splashIn(sp);
    if (!wet && this.inWater && sp > 3) this.drips();
    this.inWater = wet;
    const wade = wet ? Math.min(1, sp / 18) : 0;
    E.splash.g.gain.setTargetAtTime(wade * (.07 + .05 * Math.random()), t, .04); E.splash.fl.frequency.setTargetAtTime(500 + Math.random() * 500, t, .05);
    E.spray.g.gain.setTargetAtTime(wade * .045, t, .06); E.slosh.g.gain.setTargetAtTime(wade * (.06 + .06 * Math.sin(t * 9)), t, .05);
    // a holed radiator hisses
    const rad = car.dm ? car.dm.rad : 0; E.hiss.g.gain.setTargetAtTime(rad > .3 ? (rad - .3) * .035 : 0, t, .3);
    // kerbs in rallycross
    const kerb = RACE && RACE.ev.type === 'rallycross' && onG && RACE.lat != null && Math.abs(RACE.lat) > RACE.T.width / 2 - .75 && Math.abs(RACE.lat) < RACE.T.width / 2 + .1 && sp > 3;
    E.kerb.frequency.setTargetAtTime(Math.max(20, sp / .8), t, .03); E.kerbG.gain.setTargetAtTime(kerb ? .045 : 0, t, .02);
    // stones pinging off the floor on loose roads
    if (loose && sp > 12 && Math.random() < sp * .0035) this.blip(2400 + Math.random() * 2400, .025, 'triangle', .006 + Math.random() * .008);
    if (E.tb) {
      E.tb.frequency.setTargetAtTime(1900 + car.boost * 2300, t, .12); E.tbg.gain.setTargetAtTime(car.boost * thr * .007, t, .1);
      if (this.lastBoost > .65 && thr < .2) this.burst(2600, .6, .28, .045, 'highpass'); // blow-off
      this.lastBoost = thr > .2 ? car.boost : 0;
    }
  },
  blip(freq, dur, type, vol, slide) {
    if (!this.ac) return; const ac = this.ac, t = ac.currentTime, o = ac.createOscillator(), g = this.gain(0);
    o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol || .1, t + .012); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + .03);
  },
  burst(f, q, dur, vol, type) {
    if (!this.ac) return; const ac = this.ac, t = ac.currentTime, n = this.noise(), fl = this.filt(type || 'bandpass', f, q), g = this.gain(0);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + .008); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    n.connect(fl); fl.connect(g); g.connect(this.master); n.stop(t + dur + .03);
  },
  // a pass-by: air shoved aside by something close to the car, panned to its side and falling in pitch
  whoosh(pan, v, big) {
    if (!this.ac || !this.eng) return; const ac = this.ac, t = ac.currentTime, n = this.noise(), dur = big ? .42 : .24;
    const fl = this.filt('bandpass', big ? 1100 : 2000, big ? .8 : 1.3), g = this.gain(0);
    fl.frequency.setValueAtTime(big ? 1300 : 2400, t); fl.frequency.exponentialRampToValueAtTime(big ? 360 : 650, t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + dur * .4); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    n.connect(fl); fl.connect(g);
    if (ac.createStereoPanner) { const p = ac.createStereoPanner(); p.pan.value = clamp(pan, -1, 1); g.connect(p); p.connect(this.master); } else g.connect(this.master);
    n.stop(t + dur + .05);
  },
  pop() { this.burst(700 + Math.random() * 400, 1.2, .06, .05); if (Math.random() < .5) this.blip(80, .06, 'sine', .04, 50); },
  // impacts sound like what was hit: straw thumps, timber knocks, stone crunches, posts snap
  hit(i, kind) {
    const v = Math.min(1, i / 10);
    if (kind === 'hay') { this.blip(70, .18, 'sine', .1 * v + .03, 45); this.burst(2600, .7, .22, .05 * v + .015, 'bandpass'); this.burst(300, .7, .15, .06 * v, 'lowpass'); return; }
    if (kind === 'tree' || kind === 'post' || kind === 'house') { this.blip(150, .14, 'triangle', .1 * v + .02, 80); this.burst(700, 1.4, .12, .09 * v + .02); this.burst(3200, 1, .05, .04 * v); this.blip(52, .22, 'sine', .14 * v, 34); return; }
    if (kind === 'rock') { this.burst(1700, 1.6, .22, .1 * v + .02); this.burst(160, .7, .28, .16 * v, 'lowpass'); this.burst(4200, .8, .35, .03 * v, 'highpass'); this.blip(48, .2, 'sine', .14 * v, 32); return; }
    this.burst(170, .7, .3, Math.min(.22, i * .025), 'lowpass'); this.blip(52, .22, 'sine', Math.min(.2, i * .02), 34);
  },
  land(i) { this.blip(46, .24, 'sine', Math.min(.16, i * .025), 32); this.burst(240, .6, .16, Math.min(.08, i * .012), 'lowpass'); if (i > 6) this.burst(3000, .9, .25, Math.min(.05, (i - 6) * .012), 'highpass'); },
  splashIn(sp) {
    const v = Math.min(1, sp / 22);
    this.burst(900, .5, .55, .14 * v + .04, 'bandpass'); this.burst(300, .6, .45, .12 * v + .03, 'lowpass'); this.burst(3800, .6, .7, .05 * v + .01, 'highpass');
    this.blip(110, .3, 'sine', .06 * v, 60);
  },
  drips() { for (let k = 0; k < 7; k++) setTimeout(() => this.blip(1400 + Math.random() * 1600, .04, 'sine', .012 + Math.random() * .01, 900), 120 + k * (90 + Math.random() * 120)); },
  puddle(sp) { const v = Math.min(1, sp / 25); this.burst(1100, .6, .25, .07 * v + .02); this.burst(3600, .6, .3, .03 * v, 'highpass'); },
  beep(hi) { this.blip(hi ? 784 : 523, hi ? .55 : .2, 'sine', .08); },
  click() { this.blip(1100, .04, 'sine', .025); },
  tick() { this.blip(820, .025, 'sine', .01); },
  deny() { this.blip(220, .12, 'square', .03, 180); },
  chime() { [660, 880, 1320].forEach((f, i) => setTimeout(() => this.blip(f, .6, 'sine', .07), i * 90)); },
  fanfare() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.blip(f, .8, 'triangle', .06), i * 120)); },
};
