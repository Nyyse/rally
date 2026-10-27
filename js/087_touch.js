// ---------- phones: tilt steering, pedals, landscape ----------
// Steering comes from how far the phone is turned in your hands, like a wheel. We rebuild the gravity
// direction from the orientation angles, move it into screen space, and read its angle in the screen plane,
// so it works whether the phone is held upright or tilted back, and in either landscape direction.
const TILT = {
  raw: 0, val: 0, last: 0, ok: false, asked: false, perm: 'unknown', mag: 0,
  isTouch() { return matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window; },
  needsPermission() { return typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function'; },
  // iOS only shows the motion prompt from a finished tap (click / touchend), so we try on each of those until
  // the player has answered; a call outside a tap is refused silently and simply retried on the next one
  request() {
    if (!this.needsPermission() || this.perm === 'granted' || this.perm === 'denied' || this.pending) return Promise.resolve(this.perm);
    this.pending = true; this.asked = true;
    let pr; try { pr = DeviceOrientationEvent.requestPermission(); } catch (e) { this.pending = false; return Promise.resolve(this.perm); }
    return Promise.resolve(pr).then(r => { this.perm = r; if (r === 'denied') this.block(); return r; })
      .catch(() => this.perm).finally(() => { this.pending = false; });
  },
  framed() { try { return window.self !== window.top; } catch (e) { return true; } },
  // no motion here for the rest of the visit: steer with the buttons, and say why once
  block() {
    if (this.blocked) return; this.blocked = true;
    document.body.classList.remove('tiltsteer');
    if (typeof UI !== 'undefined' && UI.blockedNote) return;
    toast(this.framed() ? 'Tilt is blocked inside this page: using steering buttons' : 'Motion access refused: using steering buttons');
  },
  whyBlocked() {
    return this.framed()
      ? 'Blocked here. iPhone does not allow tilt for a game shown inside another page (the Claude app or an artifact link). Open the game file as its own page in Safari to use tilt.'
      : 'Motion access was refused. Safari asks again only after the tab is closed and the page opened fresh.';
  },
  screenAngle() {
    if (FL.on) return FL.dir; // the game is drawn turned on its side inside an upright page
    const a = screen.orientation && typeof screen.orientation.angle === 'number' ? screen.orientation.angle : (typeof window.orientation === 'number' ? window.orientation : 0);
    return ((a % 360) + 360) % 360;
  },
  onOrient(e) {
    if (e.beta == null || e.gamma == null) return;
    const b = e.beta * Math.PI / 180, g = e.gamma * Math.PI / 180;
    // gravity in device axes (x right, y up the long edge, z out of the screen), from the spec's Z-X'-Y'' angles
    const gx = Math.sin(g) * Math.cos(b), gy = -Math.sin(b); this.gx = gx; this.gy = gy;
    const th = this.screenAngle() * Math.PI / 180, sx = gx * Math.cos(th) - gy * Math.sin(th), sy = gx * Math.sin(th) + gy * Math.cos(th);
    this.mag = Math.hypot(sx, sy); this.devT = performance.now();
    sidewaysCheck();
    if (this.mag < .18) return; // lying almost flat: no wheel angle to read, keep the last one
    this.raw = Math.atan2(sx, -sy) * 180 / Math.PI;
    this.last = performance.now(); this.ok = true;
  },
  live() { return this.ok && performance.now() - this.last < 700; },
  // -1..1 from the angle, with a little dead zone around centre and a gentle curve for fine corrections
  steer() {
    const s = SV.settings, max = s.tiltMax || 26, dz = 1.2;
    let a = this.raw - (s.tiltZero || 0); if (a > 180) a -= 360; if (a < -180) a += 360;
    if (s.tiltInv) a = -a;
    const m = Math.max(0, Math.abs(a) - dz) / (max - dz), v = Math.min(1, m);
    return Math.sign(a) * (v * .55 + v * v * .45);
  },
  init() {
    addEventListener('deviceorientation', e => this.onOrient(e));
    const ask = () => { if (SV.settings.touchSteer !== 'buttons' && this.isTouch()) this.request(); };
    addEventListener('click', ask, { capture: true }); addEventListener('touchend', ask, { capture: true, passive: true });
  },
};

// Landscape. If the page itself turns sideways, nothing to do. If it cannot (an app that stays upright, a locked
// screen), we turn the game ourselves: the whole stage is drawn rotated a quarter turn inside the upright page.
const FL = { on: false, dir: 90, autoPaused: false, flipT: 0 };
const PORTRAIT = matchMedia('(orientation: portrait)');
function viewW() { return FL.on ? innerHeight : innerWidth; }
function viewH() { return FL.on ? innerWidth : innerHeight; }
function setForceLand(on, dir) {
  const app = document.getElementById('app'); if (!app) return;
  const changed = on !== FL.on || (dir && dir !== FL.dir);
  FL.on = on; if (dir) FL.dir = dir;
  document.body.classList.toggle('forceland', on);
  if (on) {
    const w = innerWidth, h = innerHeight;
    app.style.cssText = `position:fixed;left:0;top:0;width:${h}px;height:${w}px;transform-origin:0 0;transform:${FL.dir === 90 ? `translate(${w}px,0) rotate(90deg)` : `translate(0,${h}px) rotate(-90deg)`}`;
  } else app.style.cssText = '';
  if (changed && typeof resizeRender === 'function' && R.cv) resizeRender();
}
function checkOrientation() {
  const b = document.body, racing = b.classList.contains('racing'), touch = b.classList.contains('touchdev'), upright = PORTRAIT.matches;
  if (!racing || !touch || !upright) { if (FL.on) setForceLand(false); }
  else if (FL.on) setForceLand(true); // re-fit after a resize
  const block = racing && touch && upright && !FL.on;
  document.getElementById('rotate').hidden = !block;
  if (block && RACE && (RACE.st === 'run' || RACE.st === 'countdown')) { togglePause(); FL.autoPaused = true; }
  if (!block && FL.autoPaused) { FL.autoPaused = false; if (RACE && RACE.st === 'paused') togglePause(); }
}
// the phone is physically on its side but the page stayed upright: turn the game to match, and follow a flip
function sidewaysCheck() {
  const b = document.body;
  if (!b.classList.contains('racing') || !b.classList.contains('touchdev') || !PORTRAIT.matches) return;
  const gx = TILT.gx || 0, gy = TILT.gy || 0, side = Math.abs(gx) > .62 && Math.abs(gx) > Math.abs(gy) * 1.4;
  if (!side) { FL.flipT = 0; return; }
  const want = gx < 0 ? 90 : 270, now = performance.now();
  if (FL.on && FL.dir === want) { FL.flipT = 0; return; }
  if (!FL.flipT) FL.flipT = now;
  if (now - FL.flipT > (FL.on ? 700 : 350)) { FL.flipT = 0; setForceLand(true, want); checkOrientation(); }
}
function playSideways(dir) { setForceLand(true, dir || ((TILT.gx || 0) > .3 ? 270 : 90)); checkOrientation(); }
PORTRAIT.addEventListener ? PORTRAIT.addEventListener('change', checkOrientation) : PORTRAIT.addListener(checkOrientation);
addEventListener('resize', () => setTimeout(checkOrientation, 60));

// on phones, go full screen and lock to landscape when a stage starts (quietly does nothing where not allowed)
function phoneFullscreen() {
  if (!TILT.isTouch() || SV.settings.phoneFull === false) return;
  try {
    const el = document.documentElement, lock = () => { try { const p = screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape'); if (p && p.catch) p.catch(() => { }); } catch (e) { } };
    if (!document.fullscreenElement && el.requestFullscreen) { const p = el.requestFullscreen({ navigationUI: 'hide' }); if (p && p.then) p.then(lock).catch(() => { }); } else lock();
  } catch (e) { }
}

// the small steering gauge above the pedals: where the wheel is, and when the sensor has gone quiet
function updateTiltMeter(v, live) {
  const el = document.getElementById('tiltmeter'); if (!el) return;
  el.classList.toggle('dead', !live);
  const i = el.firstElementChild; if (i) i.style.left = (50 + clamp(v, -1, 1) * 50).toFixed(1) + '%';
}
