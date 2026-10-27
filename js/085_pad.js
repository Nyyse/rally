// ---------- controllers: DualSense, Xbox, generic gamepads, and analog (Hall-effect) keyboards in gamepad mode ----------
// A binding reads one control:  btn {i, rest?, full?}  ax {i, rest, full} (one direction of an axis)  pair {l, r} (two binds -> -1..1)
const PAD = {
  idx: -1, prev: {}, navT: 0, lastDir: null, rumbleT: 0,
  pads() { try { return Array.from(navigator.getGamepads ? navigator.getGamepads() : []).filter(p => p && p.connected !== false); } catch (e) { return []; } },
  kind(p) {
    const id = p.id.toLowerCase();
    if (/054c|dualsense|dualshock|playstation|sony/.test(id) || /wireless controller/.test(id)) return 'ps';
    if (/xbox|xinput|045e|x-box/.test(id)) return 'xbox';
    if (/wooting|analog|keyboard|razer|1532|31e3|hall/.test(id)) return 'kb';
    return 'pad';
  },
  name(p) {
    let n = p.id.replace(/\(.*?(vendor|standard gamepad).*?\)/ig, '').replace(/^[0-9a-f]{4}-[0-9a-f]{4}-/i, '').replace(/\s+/g, ' ').trim();
    if (!n) n = 'Controller';
    return n.length > 42 ? n.slice(0, 40) + '…' : n;
  },
  kindLabel(k) { return { ps: 'PlayStation', xbox: 'Xbox', kb: 'Analog keyboard', pad: 'Gamepad' }[k]; },
  glyphs(k) {
    return k === 'ps' ? { gas: 'R2', brake: 'L2', hand: '✕ or R1', reset: '△', pause: 'Options', ok: '✕', back: '○', lb: 'L1', rb: 'R1', up: '○', down: '□' }
      : { gas: 'RT', brake: 'LT', hand: 'A or RB', reset: 'Y', pause: 'Menu', ok: 'A', back: 'B', lb: 'LB', rb: 'RB', up: 'B', down: 'X' };
  },
  active() {
    const ps = this.pads(); if (!ps.length) { this.idx = -1; return null; }
    let p = ps.find(q => q.index === this.idx);
    if (!p) { p = ps.find(q => q.id === SV.settings.padId) || ps[0]; this.idx = p.index; }
    return p;
  },
  setActive(i) { const p = this.pads().find(q => q.index === +i); if (p) { this.idx = p.index; SV.settings.padId = p.id; writeSave(); } },
  defaults(p) {
    const k = this.kind(p), std = p.mapping === 'standard', tune = { dz: .07, sat: .95, lin: 1.5, tdz: .04, sens: .85, resp: 7, tsat: .97, tlin: 1.35 };
    const stick = { t: 'pair', l: { t: 'ax', i: 0, rest: 0, full: -1 }, r: { t: 'ax', i: 0, rest: 0, full: 1 } };
    if (std) return { ...tune, steer: stick, gas: { t: 'btn', i: 7 }, brake: { t: 'btn', i: 6 }, hand: { t: 'btn', i: 0 }, hand2: { t: 'btn', i: 5 }, reset: { t: 'btn', i: 3 }, pause: { t: 'btn', i: 9 }, up: { t: 'btn', i: 1 }, down: { t: 'btn', i: 2 } };
    if (k === 'ps') // DualSense / DualShock without the standard mapping: triggers arrive as axes 3 and 4
      return { ...tune, steer: stick, gas: { t: 'ax', i: 4, rest: -1, full: 1 }, brake: { t: 'ax', i: 3, rest: -1, full: 1 }, hand: { t: 'btn', i: 1 }, hand2: { t: 'btn', i: 5 }, reset: { t: 'btn', i: 3 }, pause: { t: 'btn', i: 9 }, up: { t: 'btn', i: 2 }, down: { t: 'btn', i: 0 } };
    return { ...tune, steer: stick, gas: { t: 'btn', i: 7 }, brake: { t: 'btn', i: 6 }, hand: { t: 'btn', i: 0 }, hand2: { t: 'btn', i: 5 }, reset: { t: 'btn', i: 3 }, pause: { t: 'btn', i: 9 }, up: { t: 'btn', i: 1 }, down: { t: 'btn', i: 2 } };
  },
  profile(p) { const all = SV.settings.pads || (SV.settings.pads = {}); return { ...this.defaults(p), ...(all[p.id] || {}) }; },
  saveProfile(p, prof) { (SV.settings.pads || (SV.settings.pads = {}))[p.id] = prof; writeSave(); },
  // analog triggers report their travel in .value; the browser also flags them "pressed" after a light touch,
  // so the flag is only trusted for buttons that give no analog value at all
  btnVal(p, i) { const b = p.buttons[i]; if (!b) return 0; if (typeof b !== 'object') return +b; return b.value > 0 ? b.value : b.pressed ? 1 : 0; },
  raw(p, b) {
    if (!b) return 0;
    if (b.t === 'btn') { const v = this.btnVal(p, b.i); return b.full != null ? clamp((v - (b.rest || 0)) / ((b.full - (b.rest || 0)) || 1), 0, 1) : v; }
    if (b.t === 'ax') { const a = p.axes[b.i]; if (a == null) return 0; return clamp((a - b.rest) / ((b.full - b.rest) || 1), 0, 1); }
    if (b.t === 'pair') return this.raw(p, b.r) - this.raw(p, b.l);
    return 0;
  },
  shape(v, dz, sat, lin) { const a = Math.abs(v); if (a <= dz) return 0; const x = clamp((a - dz) / Math.max(.05, sat - dz), 0, 1); return Math.sign(v) * Math.pow(x, lin); },
  read(p) {
    const P = this.profile(p);
    return {
      steer: this.shape(this.raw(p, P.steer), P.dz, P.sat, P.lin) * (P.sens ?? 1), rate: P.resp ?? 16,
      gas: this.shape(this.raw(p, P.gas), P.tdz, P.tsat ?? .97, P.tlin ?? 1), brake: this.shape(this.raw(p, P.brake), P.tdz, P.tsat ?? .97, P.tlin ?? 1),
      hand: Math.max(this.raw(p, P.hand), this.raw(p, P.hand2)) > .5 ? 1 : 0,
      reset: this.raw(p, P.reset) > .5, pause: this.raw(p, P.pause) > .5,
      up: this.raw(p, P.up || this.defaults(p).up) > .5, down: this.raw(p, P.down || this.defaults(p).down) > .5,
    };
  },
  edge(key, v) { const was = this.prev[key]; this.prev[key] = !!v; return !!v && !was; },
  rumble(p, weak, strong, ms, force) {
    if (!SV.settings.rumble || !p || !p.vibrationActuator) return;
    const now = performance.now(); if (now < this.rumbleT && !force) return; this.rumbleT = now + (ms || 90) * .85;
    try { p.vibrationActuator.playEffect('dual-rumble', { startDelay: 0, duration: ms || 90, weakMagnitude: clamp(weak, 0, 1), strongMagnitude: clamp(strong, 0, 1) }); } catch (e) { }
  },
  snapshot(p) { return { ax: Array.from(p.axes, a => a || 0), bt: Array.from(p.buttons, (b, i) => this.btnVal(p, i)) }; },
  // biggest deviation from the resting snapshot
  strongest(p, rest) {
    let best = null, bd = 0;
    p.axes.forEach((a, i) => { const d = Math.abs((a || 0) - (rest.ax[i] || 0)); if (d > bd) { bd = d; best = { t: 'ax', i, rest: rest.ax[i] || 0, val: a || 0 }; } });
    p.buttons.forEach((b, i) => { const d = this.btnVal(p, i) - (rest.bt[i] || 0); if (d > bd) { bd = d; best = { t: 'btn', i, rest: rest.bt[i] || 0, val: this.btnVal(p, i) }; } });
    return best ? { ...best, d: bd } : null;
  },
  // controller navigation through menus (spatial focus, confirm, back)
  menuNav(dt) {
    const p = this.active(); if (!p) { this.hint(null); return; }
    if (UI.cal) return;
    const std = p.mapping === 'standard', k = this.kind(p);
    const ok = std ? 0 : k === 'ps' ? 1 : 0, back = std ? 1 : k === 'ps' ? 2 : 1, lb = 4, rb = 5;
    const b = i => this.btnVal(p, i) > .5, ax = p.axes[0] || 0, ay = p.axes[1] || 0;
    let dir = null;
    if (b(12) || ay < -.6) dir = 'up'; else if (b(13) || ay > .6) dir = 'down'; else if (b(14) || ax < -.6) dir = 'left'; else if (b(15) || ax > .6) dir = 'right';
    const any = dir || p.buttons.some((_, i) => this.btnVal(p, i) > .5);
    if (any && !document.body.classList.contains('pad-nav')) { document.body.classList.add('pad-nav'); const a = document.activeElement; if (a && UI.el.contains(a)) a.blur(), a.focus({ focusVisible: true }); }
    this.hint(p);
    this.navT -= dt;
    if (dir && (dir !== this.lastDir || this.navT <= 0)) { this.navT = dir !== this.lastDir ? .34 : .12; spatialFocus(dir); AUD.tick && AUD.tick(); }
    this.lastDir = dir;
    if (this.edge('m_ok', b(ok))) {
      AUD.init();
      const a = document.activeElement;
      if (a && UI.el.contains(a) && a !== UI.el && !a.disabled) a.click(); else { const first = UI.el.querySelector('[data-focus],[data-act]'); if (first) first.click(); }
    }
    if (this.edge('m_back', b(back))) { if (UI.back) UI.back(); else if (RACE && RACE.st === 'paused') togglePause(); }
    if (this.edge('m_lb', b(lb))) UI.shoulder(-1);
    if (this.edge('m_rb', b(rb))) UI.shoulder(1);
    if (this.edge('pause', this.raw(p, this.profile(p).pause) > .5) && RACE && RACE.st === 'paused') togglePause();
  },
  // button legend along the bottom of menus while a controller is in use
  hint(p) {
    const el = document.getElementById('padhint'); if (!el) return;
    const show = !!p && document.body.classList.contains('pad-nav') && !(GAME.mode === 'race' && RACE && RACE.st !== 'paused' && RACE.st !== 'done');
    if (!show) { if (!el.hidden) el.hidden = true; return; }
    const g = this.glyphs(this.kind(p)), tabs = !!UI.el.querySelector('.tabs, .grid .card.sel, .liveries');
    const key = g.ok + tabs;
    if (el._k !== key) { el._k = key; el.innerHTML = `<span><b>${g.ok}</b>Select</span><span><b>${g.back}</b>Back</span>${tabs ? `<span><b>${g.lb} ${g.rb}</b>Switch</span>` : ''}<span><b>✥</b>Move</span>`; }
    el.hidden = false;
  },
};

function spatialFocus(dir) {
  const els = Array.from(UI.el.querySelectorAll('button:not([disabled]), input[type=range]')).filter(e => e.offsetParent !== null);
  if (!els.length) return;
  const cur = els.includes(document.activeElement) ? document.activeElement : null;
  if (!cur) { (UI.el.querySelector('[data-focus]') || els[0]).focus({ focusVisible: true }); return; }
  if (cur.type === 'range' && (dir === 'left' || dir === 'right')) {
    const st = +cur.step || 1; cur.value = clamp(+cur.value + (dir === 'right' ? st : -st), +cur.min, +cur.max); cur.dispatchEvent(new Event('input', { bubbles: true })); return;
  }
  const r = cur.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, v = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[dir];
  let best = null, bs = 1e9;
  for (const e of els) {
    if (e === cur) continue;
    const q = e.getBoundingClientRect(), dx = q.left + q.width / 2 - cx, dy = q.top + q.height / 2 - cy, along = dx * v[0] + dy * v[1];
    if (along <= 4) continue;
    const sc = along + Math.abs(dx * v[1] - dy * v[0]) * 2.2; if (sc < bs) { bs = sc; best = e; }
  }
  if (best) { best.focus({ preventScroll: true, focusVisible: true }); best.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
}
addEventListener('gamepadconnected', e => { if (PAD.idx < 0) PAD.idx = e.gamepad.index; toast(`${PAD.name(e.gamepad)} connected`); if (UI.onPads) UI.onPads(); });
addEventListener('gamepaddisconnected', e => { if (PAD.idx === e.gamepad.index) PAD.idx = -1; toast('Controller disconnected'); if (UI.onPads) UI.onPads(); });

// the mouse or a touch takes over again: drop the controller focus styling
for (const ev of ['mousedown', 'touchstart']) addEventListener(ev, () => { document.body.classList.remove('pad-nav'); const el = document.getElementById('padhint'); if (el) el.hidden = true; }, { passive: true });
