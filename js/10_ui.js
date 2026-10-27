// ---------- menus ----------
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function toast(msg) { const t = document.getElementById('toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toast.tm); toast.tm = setTimeout(() => t.classList.remove('on'), 1800); }
const SURF_DOT = { tarmac: '#56535f', gravel: '#c2ad8c', dirt: '#b98a5c', sand: '#ebcd9f', mud: '#6e4c34', snow: '#eef2f8', ice: '#bcd6ec', mixed: 'linear-gradient(90deg,#56535f 50%,#c2ad8c 50%)' };
const COND_DOT = { day: '#ffe6a8', golden: '#f7b27a', dusk: '#b86a9a', overcast: '#9aa6b4', rain: '#7a9ac4', snowfall: '#e8eefa', fog: '#d8d4dc', night: '#2a3060' };
const chip = (label, dot) => `<span class="chip">${dot ? `<i style="background:${dot}"></i>` : ''}${esc(label)}</span>`;
const surfName = s => s === 'mixed' ? 'Mixed' : SURF[s].name;
const medalDot = m => `<span class="medal m${m}" title="${MEDAL_NAMES[m] || 'No medal'}"></span>`;

function paintSwatch(canvas, biome) {
  const w = canvas.clientWidth || 260, h = canvas.clientHeight || 58, d = Math.min(2, devicePixelRatio || 1);
  canvas.width = w * d; canvas.height = h * d;
  const x = canvas.getContext('2d'); x.drawImage(buildBackdrop(biome, 360, 150), 0, 30, 360, 120 * h / w * 2.2, 0, 0, canvas.width, canvas.height);
}
function paintCar(canvas, carId, liv, bg) {
  if (cglPreview(canvas, carId, liv, bg)) return;
  const spec = CAR[carId], w = canvas.clientWidth || 300, h = canvas.clientHeight || 190, d = Math.min(2, devicePixelRatio || 1);
  canvas.width = w * d; canvas.height = h * d;
  const x = canvas.getContext('2d'); x.scale(d, d);
  const g = x.createRadialGradient(w / 2, h * .55, 10, w / 2, h * .55, Math.max(w, h) * .7);
  g.addColorStop(0, bg ? mixHex(bg, '#ffffff', .15) : '#3a3450'); g.addColorStop(1, bg ? shade(bg, -.35) : '#191726');
  x.fillStyle = g; x.fillRect(0, 0, w, h);
  const sc = Math.min(w / (spec.s.L * 1.55), h / (spec.s.W * 2.6)), ang = -.42;
  x.save(); x.translate(w / 2 + 12, h / 2 + 10); x.rotate(ang); x.scale(sc, sc);
  x.globalAlpha = .45; x.drawImage(softSprite('#000000', .6), -spec.s.L * .62, -spec.s.W * .75, spec.s.L * 1.24, spec.s.W * 1.5); x.globalAlpha = 1;
  x.restore();
  x.save(); x.translate(w / 2, h / 2); x.rotate(ang); x.scale(sc, sc);
  drawCarBody(x, spec, liv, sc, { delta: .25 });
  x.restore();
  x.save(); x.translate(w / 2 + 3, h / 2 - 7); x.rotate(ang); x.scale(sc * 1.04, sc * 1.04);
  drawCabin(x, spec, liv, {});
  x.restore();
}

const UI = {
  el: null, back: null, acts: {},
  init() {
    this.el = document.getElementById('ui');
    this.el.addEventListener('click', e => {
      const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
      AUD.init(); AUD.click();
      const fn = this.acts[b.dataset.act]; if (fn) fn(b.dataset.arg, b);
    });
  },
  set(html, back, acts) {
    const ae = document.activeElement, keep = ae && this.el.contains(ae) && ae.dataset ? ae.dataset.act + '|' + (ae.dataset.arg || '') : null;
    this.el.innerHTML = html; this.back = back || null; this.acts = acts || {};
    requestAnimationFrame(() => {
      if (keep) { const m = Array.from(this.el.querySelectorAll('[data-act]')).find(e => e.dataset.act + '|' + (e.dataset.arg || '') === keep); if (m) { m.focus({ preventScroll: true }); return this._paint(); } }
      this._paint();
      const f = ['[data-focus]', '.card.sel', '.tab.on', '.card:not(.locked)', '.cta', 'button:not(.back)'].map(q => this.el.querySelector(q)).find(Boolean);
      if (f) f.focus({ preventScroll: true, focusVisible: document.body.classList.contains('pad-nav') });
    });
  },
  _paint() {
    {
      this.el.querySelectorAll('canvas[data-swatch]').forEach(c => paintSwatch(c, c.dataset.swatch));
      this.el.querySelectorAll('canvas[data-car]').forEach(c => paintCar(c, c.dataset.car, +c.dataset.liv, c.dataset.bg));
    }
  },
  close() { this.el.innerHTML = ''; this.back = null; },
  // shoulder buttons: next/previous tab, car or livery on the current screen
  shoulder(d) {
    const tabs = Array.from(this.el.querySelectorAll('.tabs .tab:not(.locked)'));
    if (tabs.length) { const i = tabs.findIndex(t => t.classList.contains('on')); const n = tabs[(i + d + tabs.length) % tabs.length]; if (n && n !== tabs[i]) { n.click(); this.focusAfter('.tabs .tab.on'); } return; }
    const cards = Array.from(this.el.querySelectorAll('.grid .card[data-act="car"], .grid .card[data-act="pick"]'));
    if (cards.length) { const i = cards.findIndex(t => t.classList.contains('sel')); const n = cards[(i + d + cards.length) % cards.length]; if (n) { n.click(); this.focusAfter('.grid .card.sel'); } return; }
  },
  focusAfter(sel) { setTimeout(() => { const e = this.el.querySelector(sel); if (e) { e.focus({ preventScroll: true, focusVisible: true }); e.scrollIntoView({ block: 'nearest' }); } }, 40); },
  hud(on) {
    document.getElementById('hud').hidden = !on; document.body.classList.toggle('racing', !!on); document.body.classList.toggle('manual', SV.settings.gearbox === 'manual');
    const touch = TILT.isTouch();
    document.getElementById('touch').hidden = !(on && touch);
    document.body.classList.toggle('touchdev', !!(on && touch));
    document.body.classList.toggle('tiltsteer', !!(on && touch && SV.settings.touchSteer !== 'buttons' && !TILT.blocked));
    IN.tiltDead = 0; IN.touch = {}; document.querySelectorAll('#touch .on').forEach(b => b.classList.remove('on'));
    checkOrientation();
    document.getElementById('h-center').textContent = ''; document.getElementById('h-notes').innerHTML = ''; document.getElementById('h-notes').hidden = false; document.getElementById('h-split').style.opacity = 0; _hudNotesKey = '';
    if (on) this.close();
  },

  title() {
    GAME.mode = 'menu'; setBackdrop('pines');
    this.set(`<div class="screen" data-act="go" data-focus tabindex="-1" style="cursor:pointer"><div class="title-wrap" style="margin-bottom:6vh">
      <div class="eyebrow">Top-down rallying through light, dust and weather</div>
      <h1 class="brand">Dustlight<em>Rally</em></h1>
      <div class="press">Press any key</div></div></div>`, null, { go: () => this.main() });
    const k = e => { if (this.el.querySelector('.brand') && GAME.mode === 'menu') { removeEventListener('keydown', k); this.main(); } };
    addEventListener('keydown', k);
  },

  main() {
    GAME.mode = 'menu'; clearInterval(this.cyc);
    let bi = 0; this.cyc = setInterval(() => { if (this.el.querySelector('.menu-list')) setBackdrop(BIOME_KEYS[++bi % BIOME_KEYS.length]); else clearInterval(this.cyc); }, 9000);
    const done = CHAMPS.reduce((a, c) => a + c.events.filter(e => medalOf(e.id) >= 1).length, 0), all = Object.keys(EVENTS).length;
    const recs = careerRecs(), g = recs.filter(e => e.medal === 3).length, s = recs.filter(e => e.medal === 2).length, b = recs.filter(e => e.medal === 1).length;
    this.set(`<div class="screen">
      <div class="eyebrow" style="margin-top:auto">Dustlight Rally</div>
      <div class="menu-list" role="menu">
        <button class="mi" data-act="career" data-focus>Career <small>${done} of ${all} stages</small></button>
        <button class="mi" data-act="rally">Rally <small>${SV.rally && !SV.rally.done ? 'Resume · SS' + (SV.rally.stage + 1) + ' of ' + RALLY[SV.rally.id].name : 'Five stages against the field'}</small></button>
        <button class="mi" data-act="free">Free run <small>Any place, any weather</small></button>
        <button class="mi" data-act="garage">Garage <small>${SV.cars.length} of ${CARS.length} cars</small></button>
        <button class="mi" data-act="settings">Settings</button>
      </div>
      <div class="wallet"><span>Credits <b>${SV.credits.toLocaleString()}</b></span><span>${medalDot(3)} <b>${g}</b></span><span>${medalDot(2)} <b>${s}</b></span><span>${medalDot(1)} <b>${b}</b></span></div>
    </div>`, null, { career: () => this.career(), rally: () => SV.rally && !SV.rally.done ? this.rallyHub() : this.rallies(), free: () => this.free(), garage: () => this.garage(), settings: () => this.settings() });
  },

  career(cid) {
    clearInterval(this.cyc);
    cid = cid || (CHAMPS.slice().reverse().find(c => champOpen(c.id)) || CHAMPS[0]).id;
    const ch = CHAMPS.find(c => c.id === cid);
    setBackdrop(ch.events.find(e => eventOpen(e) && medalOf(e.id) < 3)?.biome || ch.events[0].biome);
    const tabs = CHAMPS.map(c => `<button class="tab${c.id === cid ? ' on' : ''}${champOpen(c.id) ? '' : ' locked'}" data-act="tab" data-arg="${c.id}">${esc(c.name)}</button>`).join('');
    const open = champOpen(cid);
    const cards = ch.events.map((e, i) => {
      const ok = eventOpen(e), rec = SV.ev[e.id];
      return `<button class="card${ok ? '' : ' locked'}" data-act="${ok ? 'ev' : 'none'}" data-arg="${e.id}" ${ok ? '' : 'aria-disabled="true"'}>
        <span class="num">${String(i + 1).padStart(2, '0')}</span>
        <div class="swatch"><canvas data-swatch="${e.biome}"></canvas></div>
        <div class="t">${esc(e.name)}</div>
        <div class="sub">${esc(BIOMES[e.biome].name)} · ${TYPES[e.type].name}</div>
        <div class="row">${chip(surfName(e.surf), SURF_DOT[e.surf])}${chip(CONDS[e.cond].name, COND_DOT[e.cond])}</div>
        <div class="best">${medalDot(rec ? rec.medal : 0)} ${rec && rec.best ? fmtTime(rec.best) : ok ? 'Not driven yet' : 'Locked'}</div>
      </button>`;
    }).join('');
    const prevName = CHAMPS[CHAMPS.indexOf(ch) - 1]?.name;
    this.set(`<div class="screen">
      <div class="topbar"><button class="back" data-act="back">Back</button><span class="spacer"></span><span class="eyebrow">Credits ${SV.credits.toLocaleString()}</span></div>
      <h2 class="h2">Career</h2>
      <div class="tabs" role="tablist">${tabs}</div>
      <p class="muted" style="margin:0 0 14px">${esc(CLASS_NAMES[ch.cls])} class cars. ${open ? 'Earn any medal to open the next stage. Medal every stage to open the next championship.' : `Medal every stage of the ${esc(prevName)} to open this championship.`}</p>
      <div class="grid">${cards}</div>
    </div>`, () => this.main(), { back: () => this.main(), tab: id => this.career(id), ev: id => this.prerace(EVENTS[id]), none: () => toast('Earn a medal on the previous stage first') });
  },

  prerace(ev, sel) {
    setBackdrop(ev.biome);
    const eligible = ev.free ? CARS.filter(c => SV.cars.includes(c.id)) : CARS.filter(c => c.cls === ev.cls);
    const owned = eligible.filter(c => SV.cars.includes(c.id));
    sel = sel || {};
    const carId = sel.car && SV.cars.includes(sel.car) ? sel.car : (owned.find(c => c.id === this.lastCar) || owned[owned.length - 1] || {}).id;
    const rec = SURF_TYRE[ev.surf] || 'gravel', tyre = sel.tyre || rec;
    const tt = SV.tt[ev.id], best = SV.ev[ev.id];
    const targets = tt && ev.type !== 'roam' ? `<div class="tlist"><span>${medalDot(3)}</span><span>Gold</span><b>${fmtTime(tt)}</b><span>${medalDot(2)}</span><span>Silver</span><b>${fmtTime(tt * 1.08)}</b><span>${medalDot(1)}</span><span>Bronze</span><b>${fmtTime(tt * 1.18)}</b>${best && best.best ? `<span></span><span>Your best</span><b>${fmtTime(best.best)}</b>` : ''}</div>` : ev.type === 'roam' ? '' : `<p class="muted">Target times are set when the stage is first painted.</p>`;
    const carCards = eligible.map(c => {
      const own = SV.cars.includes(c.id);
      return `<button class="card${c.id === carId ? ' sel' : ''}${own ? '' : ' locked'}" data-act="${own ? 'car' : 'none'}" data-arg="${c.id}" style="padding:10px">
        <canvas class="carview" style="aspect-ratio:16/8" data-car="${c.id}" data-liv="${livOf(c.id)}"></canvas>
        <div class="t" style="font-size:16px">${esc(c.make)} ${esc(c.model)}</div>
        <div class="sub">${c.year} · ${c.drive === 'A' ? 'AWD' : c.drive === 'R' ? 'RWD' : 'FWD'} · ${c.kw} kW</div>
        ${own ? '' : `<div class="lockline">${esc(unlockText(c))}</div>`}
      </button>`;
    }).join('');
    const tyreSeg = Object.keys(TYRES).map(k => `<button class="${k === tyre ? 'on' : ''}" data-act="tyre" data-arg="${k}">${TYRES[k].name}${k === rec ? ' ★' : ''}</button>`).join('');
    this.set(`<div class="screen">
      <div class="topbar"><button class="back" data-act="back">Back</button><span class="spacer"></span><span class="eyebrow">${ev.free ? 'Free run' : esc(CHAMPS.find(c => c.id === ev.champ).name)}</span></div>
      <div class="two">
        <div class="panel" style="display:flex;flex-direction:column;gap:14px">
          <div><div class="eyebrow">${esc(BIOMES[ev.biome].name)} · ${TYPES[ev.type].name}</div><h2 class="h2">${esc(ev.name)}</h2>
          <p class="muted" style="margin:0">${esc(BIOMES[ev.biome].blurb)} ${esc(TYPES[ev.type].desc)}</p></div>
          <div class="cols">${chip(surfName(ev.surf), SURF_DOT[ev.surf])}${chip(CONDS[ev.cond].name, COND_DOT[ev.cond])}${ev.len && ev.type === 'stage' ? chip('~' + (ev.len / 1000).toFixed(1) + ' km') : ''}</div>
          ${targets}
          <div class="opt" style="border:0;padding:0"><div>Tyres<small>★ suits this surface</small></div><div class="seg">${tyreSeg}</div></div>
          <div class="cols"><button class="cta" data-act="start" ${carId ? 'data-focus' : 'disabled'}>Start ${ev.type === 'roam' ? 'drive' : 'stage'}</button>${ev.free ? '<button class="ghostbtn" data-act="reroll">New layout</button>' : ''}</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:10px;min-width:0">
          <div class="eyebrow">${ev.free ? 'Your cars' : esc(CLASS_NAMES[ev.cls]) + ' class'}</div>
          <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(190px,1fr))">${carCards}</div>
        </div>
      </div></div>`, () => ev.free ? this.free() : this.career(ev.champ), {
      back: () => ev.free ? this.free() : this.career(ev.champ),
      car: id => { this.lastCar = id; this.prerace(ev, { car: id, tyre }); },
      tyre: k => this.prerace(ev, { car: carId, tyre: k }),
      none: () => toast('This car is still locked'),
      reroll: () => { SV.free = (SV.free || 0) + 1; writeSave(); const e2 = makeFreeEvent(ev.biome, ev.type, ev.surf, ev.cond); this.prerace(e2, { car: carId, tyre }); toast('New layout'); },
      start: () => { if (!carId) return; this.lastCar = carId; this.lastEv = ev; this.lastTyre = tyre; startRace(ev, carId, tyre); },
    });
  },

  free(st) {
    clearInterval(this.cyc);
    st = st || this.freeSt || { biome: 'pines', type: 'stage', surf: 'gravel', cond: 'golden' };
    if (!BIOME_SURFS[st.biome].includes(st.surf)) st.surf = BIOME_SURFS[st.biome][0];
    if (st.type === 'rallycross') st.surf = st.biome === 'clay' ? st.surf : BIOME_SURFS[st.biome][0];
    this.freeSt = st; setBackdrop(st.biome);
    const locs = BIOME_KEYS.map(k => `<button class="card${k === st.biome ? ' sel' : ''}" data-act="biome" data-arg="${k}" style="padding:10px"><div class="swatch" style="height:44px"><canvas data-swatch="${k}"></canvas></div><div class="t" style="font-size:16px">${esc(BIOMES[k].name)}</div></button>`).join('');
    const seg = (key, list, label) => `<div class="opt"><div>${label}</div><div class="seg">${list.map(([v, n]) => `<button class="${st[key] === v ? 'on' : ''}" data-act="set" data-arg="${key}:${v}">${n}</button>`).join('')}</div></div>`;
    this.set(`<div class="screen">
      <div class="topbar"><button class="back" data-act="back">Back</button><span class="spacer"></span><span class="eyebrow">Free run pays half credits</span></div>
      <h2 class="h2">Free run</h2>
      <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(160px,1fr));margin-bottom:12px">${locs}</div>
      <div class="panel" style="max-width:760px">
        ${seg('type', Object.keys(TYPES).map(k => [k, TYPES[k].name]), 'Rally type')}
        ${seg('surf', BIOME_SURFS[st.biome].map(k => [k, surfName(k)]), 'Surface')}
        ${seg('cond', Object.keys(CONDS).map(k => [k, CONDS[k].name]), 'Light & weather')}
        <div class="cols" style="margin-top:12px"><button class="cta" data-act="next" data-focus>Choose car</button></div>
      </div></div>`, () => this.main(), {
      back: () => this.main(), biome: k => this.free({ ...st, biome: k }),
      set: a => { const [k, v] = a.split(':'); this.free({ ...st, [k]: v }); },
      next: () => this.prerace(makeFreeEvent(st.biome, st.type, st.surf, st.cond)),
    });
  },

  garage(sel) {
    clearInterval(this.cyc);
    sel = sel || this.gSel || SV.cars[SV.cars.length - 1]; this.gSel = sel;
    const car = CAR[sel], own = SV.cars.includes(sel), up = upOf(sel), liv = livOf(sel);
    const P0 = carParams(car, {}, 'gravel'), P1 = carParams(car, up, 'gravel');
    const mx = { pw: 330000, m: 1350, grip: 1.12, vtop: 64 };
    const bar = (label, a, b, txt) => `<div class="stat">${label}<div class="bar"><b style="width:${clamp(b, 0, 1) * 100}%"></b><i style="width:${clamp(a, 0, 1) * 100}%"></i></div><span>${txt}</span></div>`;
    const list = CARS.map(c => `<button class="card${c.id === sel ? ' sel' : ''}${SV.cars.includes(c.id) ? '' : ' locked'}" data-act="pick" data-arg="${c.id}" style="padding:10px">
        <canvas class="carview" style="aspect-ratio:16/8" data-car="${c.id}" data-liv="${livOf(c.id)}"></canvas>
        <div class="t" style="font-size:15px">${esc(c.make)} ${esc(c.model)}</div><div class="sub">${esc(CLASS_NAMES[c.cls])}</div></button>`).join('');
    const parts = PARTS.map(p => {
      const lvl = up[p.id], cost = lvl < 3 ? partCost(car.cls, lvl) : 0;
      return `<div class="part"><div><div class="pn">${p.name}</div><div class="pd">${p.desc} ${p.fx} per level.</div></div>
        <div class="pips">${[0, 1, 2].map(i => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('')}</div>
        ${lvl >= 3 ? '<span class="pd">Maxed</span>' : `<button class="buy" data-act="buy" data-arg="${p.id}" ${own && SV.credits >= cost ? '' : 'disabled'}>${cost.toLocaleString()} cr</button>`}</div>`;
    }).join('');
    const livs = LIVERIES.map((L, i) => `<button class="liv${i === liv ? ' on' : ''}" data-act="liv" data-arg="${i}" aria-label="${L.name} livery" ${own ? '' : 'disabled'}><span style="background:${L.base}"></span><span style="background:${L.stripe}"></span><span style="background:${L.accent}"></span></button>`).join('');
    this.set(`<div class="screen">
      <div class="topbar"><button class="back" data-act="back">Back</button><span class="spacer"></span><span class="eyebrow">Credits <b style="color:var(--paper)">${SV.credits.toLocaleString()}</b></span></div>
      <h2 class="h2">Garage</h2>
      <div class="two">
        <div class="panel" style="display:flex;flex-direction:column;gap:12px">
          <canvas class="carview" data-car="${sel}" data-liv="${liv}" data-bg="${BIOMES[BD.biome].ground[3]}"></canvas>
          <div><div class="eyebrow">${esc(car.make)} · ${car.year} · ${esc(CLASS_NAMES[car.cls])}</div><div class="h2" style="font-size:clamp(28px,4vw,44px)">${esc(car.model)}</div>
          <p class="muted" style="margin:0">${esc(car.desc)} <span style="color:var(--paper-faint)">${esc(MAKES[car.make])}</span></p></div>
          ${own ? '' : `<div class="lockline">Locked. ${esc(unlockText(car))}.</div>`}
          <div style="display:flex;flex-direction:column;gap:8px">
            ${bar('Power', P0.pw / mx.pw, P1.pw / mx.pw, Math.round(P1.pw / 1000) + ' kW')}
            ${bar('Top speed', P0.vtop / mx.vtop, P1.vtop / mx.vtop, Math.round(P1.vtop * 3.6))}
            ${bar('Lightness', 1 - P0.m / mx.m + .25, 1 - P1.m / mx.m + .25, Math.round(P1.m) + ' kg')}
            ${bar('Grip', P0.grip / mx.grip, P1.grip / mx.grip, '+' + Math.round((P1.grip - 1) * 100) + '%')}
            ${bar('Drive', 1, 1, car.drive === 'A' ? 'AWD' : car.drive === 'R' ? 'RWD' : 'FWD')}
          </div>
          <div><div class="eyebrow" style="margin-bottom:8px">Livery</div><div class="liveries">${livs}</div></div>
          <div>${parts}</div>
        </div>
        <div style="min-width:0"><div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(170px,1fr))">${list}</div></div>
      </div></div>`, () => this.main(), {
      back: () => this.main(), pick: id => this.garage(id),
      buy: pid => { const lvl = up[pid], cost = partCost(car.cls, lvl); if (!own || lvl >= 3 || SV.credits < cost) return; SV.credits -= cost; up[pid]++; writeSave(); toast(`${PARTS.find(p => p.id === pid).name} upgraded`); this.garage(sel); },
      liv: i => { if (!own) return; SV.liv[sel] = +i; writeSave(); this.garage(sel); },
    });
  },

  settings() {
    clearInterval(this.cyc);
    const s = SV.settings;
    if (TILT.isTouch()) this.cyc = setInterval(() => {
      const el = document.getElementById('tiltlive'); if (!el) return clearInterval(this.cyc);
      if (TILT.perm === 'denied' || (TILT.blocked && !TILT.live())) { el.textContent = TILT.whyBlocked(); return; }
      if (TILT.needsPermission() && TILT.perm !== 'granted') { el.textContent = 'Tap any button here to allow motion access'; return; }
      if (!TILT.live()) { el.textContent = TILT.framed() ? 'No tilt reading. This page may be blocking motion: if so, open the game as its own page' : 'No tilt reading yet: turn the phone sideways'; return; }
      const v = TILT.steer(), pct = Math.round(Math.abs(v) * 100);
      el.textContent = pct < 2 ? 'Reading: straight ahead' : `Reading: ${pct}% ${v > 0 ? 'right' : 'left'}`;
    }, 120);
    const seg = (key, opts) => `<div class="seg">${opts.map(([v, n]) => `<button class="${String(s[key]) === String(v) ? 'on' : ''}" data-act="set" data-arg="${key}:${v}">${n}</button>`).join('')}</div>`;
    const onoff = [['true', 'On'], ['false', 'Off']];
    const p = PAD.active(), g = PAD.glyphs(p ? PAD.kind(p) : 'xbox'), touch = TILT.isTouch();
    const phoneOpts = `        <div class="opt"><div>Phone steering<small>Tilt: hold the phone sideways like a wheel. Buttons: arrows on the left, pedals on the right</small></div>${seg('touchSteer', [['tilt', 'Tilt'], ['buttons', 'Buttons']])}</div>
        ${s.touchSteer !== 'buttons' ? `<div class="opt"><div>Tilt response<small>How far you turn the phone for full lock</small></div>${seg('tiltMax', [['36', 'Gentle'], ['26', 'Normal'], ['18', 'Quick']])}</div>
        <div class="opt"><div>Tilt centre<small id="tiltlive">${TILT.isTouch() ? 'Turn your phone sideways to see the reading' : 'Needs a phone or tablet'}</small></div><div class="cols"><button class="ghostbtn" data-act="tiltzero">Set centre</button><button class="ghostbtn" data-act="tiltinv">${s.tiltInv ? 'Normal direction' : 'Reverse direction'}</button></div></div>` : ''}
        <div class="opt"><div>Full screen on phones<small>Goes full screen and locks to landscape when a stage starts, where the browser allows it</small></div>${seg('phoneFull', onoff)}</div>
`;
    this.set(`<div class="screen">
      <div class="topbar"><button class="back" data-act="back">Back</button></div>
      <h2 class="h2">Settings</h2>
      <div class="two"><div class="panel">
        ${touch ? phoneOpts : ''}
        <div class="opt"><div>Camera<small>Chase follows behind the car; Fixed keeps north up like a classic top-down</small></div>${seg('camera', Object.entries(CAMS).map(([k, c]) => [k, c.name]))}</div>
        <div class="opt"><div>Steering assist<small>Counter-steer and stability help when the tail steps out</small></div>${seg('assist', [['off', 'Off'], ['low', 'Low'], ['med', 'Medium'], ['high', 'High']])}</div>
        <div class="opt"><div>Traction control<small>On trims wheelspin but still lets the throttle hold a slide; off gives you all of it</small></div>${seg('tc', onoff)}</div>
        <div class="opt"><div>Gearbox<small>Manual: E / Q, or ${g.up} / ${g.down} on a controller. Low gears give strong engine braking</small></div>${seg('gearbox', [['auto', 'Automatic'], ['manual', 'Manual']])}</div>
        <div class="opt"><div>Anti-lock brakes<small>Off lets the wheels lock and skid, and a car on locked front wheels will not steer</small></div>${seg('abs', onoff)}</div>
        ${touch ? '' : phoneOpts}
        <div class="opt"><div>Controllers<small>${p ? esc(PAD.name(p)) + ' connected' : 'DualSense, Xbox and analog keyboards'}</small></div><button class="ghostbtn" data-act="pads">Set up</button></div>
        <div class="opt"><div>Pace notes<small>Co-driver cards for the next corners</small></div>${seg('notes', onoff)}</div>
        <div class="opt"><div>Co-driver voice<small>Reads the notes aloud with your system voice</small></div>${seg('voice', onoff)}</div>
        <div class="opt"><div>Ghost car<small>Your best run, or the gold-time ghost</small></div>${seg('ghost', onoff)}</div>
        <div class="opt"><div>Tilt-shift blur</div>${seg('tilt', onoff)}</div>
        <div class="opt"><div>Detail<small>Low helps older phones and laptops. High also scales itself down if frames drop</small></div>${seg('quality', [['high', 'High'], ['low', 'Low']])}</div>
        <div class="opt"><div>Sound</div>${seg('sound', onoff)}</div>
        <div class="opt"><div>Volume</div>${seg('vol', [['0.3', 'Low'], ['0.55', 'Medium'], ['0.85', 'High']])}</div>
        <div class="opt"><div>Developer mode<small>${SV.dev ? 'On: every car, stage and championship is open' : 'Unlocks every car, stage and championship and fills your wallet'}</small></div><div class="seg"><button class="${SV.dev ? 'on' : ''}" data-act="dev" data-arg="1">On</button><button class="${SV.dev ? '' : 'on'}" data-act="dev" data-arg="0">Off</button></div></div>
        <div class="opt"><div>Progress<small>Clears medals, cars, upgrades and ghosts</small></div><div id="rst"><button class="danger" data-act="reset">Reset progress</button></div></div>
      </div>
      <div class="panel"><div class="eyebrow" style="margin-bottom:12px">Controls</div><div class="keys">
        <kbd>W / ↑</kbd><span>Throttle</span><kbd>S / ↓</kbd><span>Brake, hold to reverse</span><kbd>A D / ← →</kbd><span>Steer</span><kbd>Space</kbd><span>Handbrake</span>
        <kbd>E / Q</kbd><span>Shift up / down (manual)</span><kbd>R</kbd><span>Reset to the road (+2 s)</span><kbd>C</kbd><span>Change camera</span><kbd>Esc / P</kbd><span>Pause</span><kbd>G</kbd><span>Toggle ghost</span><kbd>M</kbd><span>Mute</span>
        <kbd>${g.gas} / ${g.brake}</kbd><span>Throttle and brake (analog)</span><kbd>Left stick</kbd><span>Steer</span><kbd>${g.hand}</kbd><span>Handbrake</span><kbd>${g.up} / ${g.down}</kbd><span>Shift up / down (manual)</span><kbd>${g.reset}</kbd><span>Reset</span><kbd>${g.pause}</kbd><span>Pause</span></div>
        ${touch ? '<p class="muted" style="margin-top:14px">On a phone: turn it sideways and tilt it like a wheel to steer. Gas is the tall pedal on the right; brake and handbrake are on the left. If the car pulls one way when you hold the phone naturally, use Set centre.</p>' : ''}
        <p class="muted" style="margin-top:14px">Lift off before the corner, flick in, and let the handbrake swing the tail through the hairpins. Gravel rewards early turn-in; tarmac rewards a clean line.</p></div>
      </div></div>`, () => this.main(), {
      back: () => this.main(), pads: () => this.controllers(),
      tiltzero: () => { TILT.request(); if (!TILT.live()) return toast('No tilt reading yet: turn the phone sideways'); s.tiltZero = Math.round(TILT.raw * 10) / 10; s.tiltInv = s.tiltInv; writeSave(); toast('Centre set'); },
      tiltinv: () => { TILT.request(); s.tiltInv = !s.tiltInv; writeSave(); this.settings(); },
      set: a => {
        const [k, v] = a.split(':'); s[k] = v === 'true' ? true : v === 'false' ? false : isNaN(+v) ? v : +v;
        if (k === 'tilt') document.body.classList.toggle('no-tilt', !s.tilt);
        if (k === 'quality') { R.q = s.quality; R.gs = 1; resizeRender(); }
        if (k === 'sound') AUD.setOn(s.sound);
        if (k === 'vol') AUD.setVol(s.vol);
        writeSave(); this.settings();
      },
      dev: v => {
        SV.dev = v === '1';
        if (SV.dev) { CARS.forEach(c => { if (!SV.cars.includes(c.id)) SV.cars.push(c.id); }); SV.credits = Math.max(SV.credits, 9999999); toast('Developer mode: everything unlocked'); }
        else toast('Developer mode off (unlocked cars stay in your garage)');
        writeSave(); this.settings();
      },
      reset: () => { document.getElementById('rst').innerHTML = `<div class="confirm">Erase everything? <button class="danger" data-act="reset2">Erase</button><button class="back" data-act="cancel">Keep</button></div>`; },
      reset2: () => { try { Object.keys(localStorage).filter(k => k.startsWith('dustlight')).forEach(k => localStorage.removeItem(k)); } catch (e) { } SV = DEF_SAVE(); writeSave(); toast('Progress erased'); this.settings(); },
      cancel: () => this.settings(),
    });
  },

  // ---------- controllers & calibration ----------
  CAL_STEPS: [
    { k: 'rest', txt: 'Let go of every control', sub: 'Measuring the resting position of each axis and button.' },
    { k: 'left', txt: 'Steer fully left and hold', sub: 'Stick, wheel, or the analog key you want for left.' },
    { k: 'right', txt: 'Steer fully right and hold', sub: 'Same control in the other direction, or another key.' },
    { k: 'gas', txt: 'Press the throttle all the way and hold' },
    { k: 'brake', txt: 'Press the brake all the way and hold' },
    { k: 'hand', txt: 'Press the handbrake', opt: true },
    { k: 'reset', txt: 'Press the button for reset to road', opt: true },
    { k: 'up', txt: 'Press the button for shift up', opt: true, sub: 'Used with the manual gearbox. Skip to keep the default.' },
    { k: 'down', txt: 'Press the button for shift down', opt: true, sub: 'Used with the manual gearbox. Skip to keep the default.' },
  ],
  controllers() {
    clearInterval(this.cyc); cancelAnimationFrame(this.ctlRAF); this.cal = null;
    const s = SV.settings, pads = PAD.pads(), act = PAD.active(), prof = act ? PAD.profile(act) : null;
    const list = pads.length ? pads.map(p => `<button class="card${act && p.index === act.index ? ' sel' : ''}" data-act="usepad" data-arg="${p.index}" style="padding:12px">
        <div class="t" style="font-size:16px">${esc(PAD.name(p))}</div>
        <div class="row">${chip(PAD.kindLabel(PAD.kind(p)))}${chip(p.mapping === 'standard' ? 'Standard layout' : 'Raw layout')}${s.pads && s.pads[p.id] ? chip('Calibrated', '#9ec9c4') : ''}</div></button>`).join('')
      : `<p class="muted" style="margin:0">No controller found. Connect a DualSense, an Xbox controller or an analog keyboard in gamepad mode, then press any button on it.</p>`;
    const pct = v => Math.round(v * 100) + '%';
    const slider = (key, label, sub, min, max, step, fmt) => `<div class="opt"><div>${label}<small>${sub}</small></div><div class="rng"><input type="range" id="rg-${key}" data-key="${key}" min="${min}" max="${max}" step="${step}" value="${prof ? prof[key] : min}" ${prof ? '' : 'disabled'} aria-label="${label}"><output id="ro-${key}">${prof ? fmt(prof[key]) : '–'}</output></div></div>`;
    const g = PAD.glyphs(act ? PAD.kind(act) : 'xbox');
    this.set(`<div class="screen">
      <div class="topbar"><button class="back" data-act="back">Back</button><span class="spacer"></span><span class="eyebrow">Gamepads and analog keyboards</span></div>
      <h2 class="h2">Controllers</h2>
      <div class="two">
        <div class="panel" style="display:flex;flex-direction:column;gap:14px">
          <div class="eyebrow">Devices</div>
          <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(220px,1fr))">${list}</div>
          <div class="eyebrow">Live input</div>
          <div style="display:flex;flex-direction:column;gap:8px">
            <div class="stat">Steer<div class="bar bi"><b id="lv-steer"></b></div><span id="lt-steer">0</span></div>
            <div class="stat">Throttle<div class="bar"><b id="lv-gas"></b></div><span id="lt-gas">0</span></div>
            <div class="stat">Brake<div class="bar"><b id="lv-brake"></b></div><span id="lt-brake">0</span></div>
            <div class="stat">Handbrake<div class="bar"><b id="lv-hand"></b></div><span id="lt-hand">0</span></div>
          </div>
          <div class="raw" id="rawin"></div>
          <div id="calbox" class="calbox calmodal" hidden></div>
          <div class="cols" id="calbtns"><button class="cta" data-act="cal" ${act ? 'data-focus' : 'disabled'}>Calibrate</button><button class="ghostbtn" data-act="defaults" ${act ? '' : 'disabled'}>Use defaults</button><button class="ghostbtn" data-act="buzz" ${act ? '' : 'disabled'}>Test vibration</button></div>
        </div>
        <div class="panel">
          <div class="eyebrow" style="margin-bottom:4px">Tuning</div>
          ${slider('sens', 'Steering sensitivity', 'How much lock a full push of the stick gives', .3, 1, .01, pct)}
          ${slider('resp', 'Steering speed', 'How quickly the wheels follow the stick; lower is smoother', 2, 16, .5, v => (+v).toFixed(1))}
          ${slider('dz', 'Steering dead zone', 'Ignore small movements around the centre', 0, .3, .01, pct)}
          ${slider('sat', 'Full lock at', 'How far you push before steering is maxed', .6, 1, .01, pct)}
          ${slider('lin', 'Steering curve', '1.0 is linear; higher is gentler near the centre', .5, 3, .05, v => (+v).toFixed(2) + '×')}
          ${slider('tdz', 'Pedal dead zone', 'Throttle and brake travel ignored at the start', 0, .3, .01, pct)}
          ${slider('tsat', 'Pedal full at', 'How far you press the trigger before it counts as 100%', .5, 1, .01, pct)}
          ${slider('tlin', 'Pedal curve', '1.0 is linear; higher gives finer control at light throttle', .6, 3, .05, v => (+v).toFixed(2) + '×')}
          <div class="opt"><div>Vibration<small>Road texture, slides, landings and impacts</small></div><div class="seg"><button class="${s.rumble ? 'on' : ''}" data-act="rumble" data-arg="1">On</button><button class="${s.rumble ? '' : 'on'}" data-act="rumble" data-arg="0">Off</button></div></div>
          <div class="keys" style="margin-top:14px"><kbd>${g.gas}</kbd><span>Throttle</span><kbd>${g.brake}</kbd><span>Brake</span><kbd>Left stick</kbd><span>Steer</span><kbd>${g.hand}</kbd><span>Handbrake</span><kbd>${g.reset}</kbd><span>Reset to the road</span><kbd>${g.pause}</kbd><span>Pause</span><kbd>D-pad · ${g.ok} · ${g.back}</kbd><span>Move, select, back in menus</span></div>
          <p class="muted" style="margin-top:14px">Hall-effect keyboards (Wooting, Razer Analog and similar) need their gamepad or joystick mode switched on in the keyboard's own software. Then press Calibrate and use the keys you want for steering, throttle and brake: how deep you press becomes analog input.</p>
        </div>
      </div></div>`, () => this.leaveControllers(), {
      back: () => this.leaveControllers(),
      usepad: i => { PAD.setActive(i); this.controllers(); },
      defaults: () => { const p = PAD.active(); if (!p) return; delete SV.settings.pads[p.id]; writeSave(); toast('Default layout restored'); this.controllers(); },
      buzz: () => { const p = PAD.active(); PAD.rumble(p, .5, .8, 300, true); if (!p || !p.vibrationActuator) toast('This controller does not report vibration to the browser'); },
      rumble: v => { SV.settings.rumble = v === '1'; writeSave(); this.controllers(); },
      cal: () => this.startCal(),
      calskip: () => this.calNext(true),
      calcancel: () => { this.cal = null; this.controllers(); },
    });
    this.el.oninput = e => {
      const t = e.target; if (!t.dataset || !t.dataset.key) return;
      const p = PAD.active(); if (!p) return;
      const P = { ...PAD.profile(p) }; P[t.dataset.key] = +t.value; PAD.saveProfile(p, P);
      const o = document.getElementById('ro-' + t.dataset.key); if (o) o.textContent = t.dataset.key === 'lin' || t.dataset.key === 'tlin' ? (+t.value).toFixed(2) + '×' : t.dataset.key === 'resp' ? (+t.value).toFixed(1) : pct(+t.value);
    };
    UI.onPads = () => { if (!this.cal && document.getElementById('lv-steer')) this.controllers(); };
    let last = performance.now();
    const loop = now => {
      if (!document.getElementById('lv-steer')) { UI.onPads = null; return; }
      const dt = Math.min(.1, (now - last) / 1000); last = now;
      const p = PAD.active();
      if (p) {
        const v = PAD.read(p), set = (id, w, l) => { const e = document.getElementById(id); if (e) { e.style.width = (w * 100) + '%'; e.style.left = ((l ?? 0) * 100) + '%'; } };
        set('lv-steer', Math.abs(v.steer) / 2, v.steer >= 0 ? .5 : .5 + v.steer / 2); set('lv-gas', v.gas); set('lv-brake', v.brake); set('lv-hand', v.hand);
        const tx = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
        tx('lt-steer', v.steer.toFixed(2)); tx('lt-gas', v.gas.toFixed(2)); tx('lt-brake', v.brake.toFixed(2)); tx('lt-hand', v.hand ? 'on' : 'off');
        const raw = document.getElementById('rawin');
        if (raw && (!raw._t || now - raw._t > 60)) {
          raw._t = now;
          raw.innerHTML = Array.from(p.axes).map((a, i) => `<span class="ax">A${i}<i><b style="left:${Math.min(50, 50 + a * 50)}%;width:${Math.abs(a) * 50}%"></b></i></span>`).join('')
            + Array.from(p.buttons).map((b, i) => `<span class="bt${PAD.btnVal(p, i) > .4 ? ' on' : ''}">${i}</span>`).join('');
        }
        if (this.cal) this.calTick(p, dt);
      }
      this.ctlRAF = requestAnimationFrame(loop);
    };
    this.ctlRAF = requestAnimationFrame(loop);
  },
  leaveControllers() { cancelAnimationFrame(this.ctlRAF); this.cal = null; UI.onPads = null; this.el.oninput = null; this.settings(); },
  startCal() {
    const p = PAD.active(); if (!p) return;
    this.cal = { step: 0, t: 0, sum: null, n: 0, rest: null, need: 'press', hold: 0, peak: null, res: {} };
    document.getElementById('calbtns').hidden = true;
    this.calRender();
  },
  calRender() {
    const c = this.cal, box = document.getElementById('calbox'); if (!c || !box) return;
    const st = this.CAL_STEPS[c.step];
    box.hidden = false;
    box.innerHTML = `<div class="eyebrow">Step ${c.step + 1} of ${this.CAL_STEPS.length}</div><div class="big">${c.need === 'release' ? 'Release' : st.txt}</div>
      <div class="muted" style="margin:0">${c.need === 'release' ? 'Let the control return to rest.' : st.sub || 'Hold it until the bar fills.'}</div>
      <div class="bar"><b id="calprog" style="width:0%"></b></div>
      <div class="muted" id="caldet" style="margin:0;min-height:1.3em;font-family:var(--f-num);font-size:12px"></div>
      <div class="cols"><button class="ghostbtn" data-act="calskip">Skip</button><button class="back" data-act="calcancel">Cancel</button></div>`;
  },
  calTick(p, dt) {
    const c = this.cal, st = this.CAL_STEPS[c.step], prog = document.getElementById('calprog');
    if (st.k === 'rest') {
      // give the hands a moment to leave the controller (the button that started this may still be down)
      c.t += dt; if (prog) prog.style.width = Math.min(100, c.t / 1.3 * 100) + '%';
      if (c.t < .35) return;
      const snap = PAD.snapshot(p);
      if (!c.sum) c.sum = { ax: snap.ax.map(() => 0), bt: snap.bt.map(() => 0) };
      snap.ax.forEach((a, i) => c.sum.ax[i] += a); snap.bt.forEach((b, i) => c.sum.bt[i] += b); c.n++;
      if (c.t >= 1.3) { c.rest = { ax: c.sum.ax.map(v => v / c.n), bt: c.sum.bt.map(v => v / c.n) }; this.calNext(); }
      return;
    }
    const s = PAD.strongest(p, c.rest), det = document.getElementById('caldet');
    if (det) det.textContent = s && s.d > .15 ? `Detected: ${s.t === 'ax' ? 'axis ' + s.i + (s.val < s.rest ? ' −' : ' +') : 'button ' + s.i}  ·  ${Math.round(s.d * 100)}%` : 'Waiting for input…';
    if (c.need === 'release') { if (!s || s.d < .2) { c.need = 'press'; c.hold = 0; c.peak = null; this.calRender(); } return; }
    if (s && s.d > .45) {
      if (!c.peak || s.i !== c.peak.i || s.t !== c.peak.t || sign(s.val - s.rest) !== sign(c.peak.val - c.peak.rest)) { c.peak = s; c.hold = 0; }
      else { c.hold += dt; if (Math.abs(s.val - s.rest) > Math.abs(c.peak.val - c.peak.rest)) c.peak = s; }
      if (prog) prog.style.width = Math.min(100, c.hold / .35 * 100) + '%';
      if (c.hold > .35) { c.res[st.k] = c.peak; AUD.click(); this.calNext(); }
    } else { c.hold = 0; if (prog) prog.style.width = '0%'; }
  },
  calNext(skip) {
    const c = this.cal; if (!c) return;
    c.step++; c.t = 0; c.hold = 0; c.peak = null; c.need = c.step > 1 && !skip ? 'release' : 'press';
    if (c.step >= this.CAL_STEPS.length) return this.calFinish();
    this.calRender();
  },
  calFinish() {
    const p = PAD.active(), c = this.cal; if (!p || !c) return;
    const P = { ...PAD.profile(p) }, r = c.res;
    const uni = q => q && (q.t === 'ax' ? { t: 'ax', i: q.i, rest: q.rest, full: q.val } : { t: 'btn', i: q.i, rest: q.rest, full: Math.max(q.val, q.rest + .3) });
    if (r.left && r.right) P.steer = { t: 'pair', l: uni(r.left), r: uni(r.right) };
    if (r.gas) P.gas = uni(r.gas);
    if (r.brake) P.brake = uni(r.brake);
    if (r.hand) { P.hand = uni(r.hand); P.hand2 = null; }
    if (r.reset) P.reset = uni(r.reset);
    if (r.up) P.up = uni(r.up);
    if (r.down) P.down = uni(r.down);
    PAD.saveProfile(p, P); this.cal = null; toast('Calibration saved'); this.controllers();
  },

  pause() {
    this.set(`<div class="screen" style="background:rgba(16,12,26,.45)"><div class="overlay-center panel" style="display:flex;flex-direction:column;gap:14px">
      <div class="eyebrow">${esc(RACE.ev.name)}</div><div class="h2">Paused</div>
      <div class="cols"><button class="cta" data-act="resume" data-focus>Resume</button>${FL.on ? '<button class="ghostbtn" data-act="flip">Flip screen</button>' : ''}${RACE.rally ? '<button class="ghostbtn" data-act="retire">Retire from stage</button>' : '<button class="ghostbtn" data-act="restart">Restart</button><button class="ghostbtn" data-act="quit">Leave stage</button>'}</div>
      ${RACE.rally ? '<p class="muted" style="margin:0">In a rally there are no restarts. Retiring books the stage at a heavy penalty time and the rally goes on.</p>' : ''}
      <div class="keys" style="margin-top:6px"><kbd>R</kbd><span>Reset to the road</span><kbd>G</kbd><span>Ghost ${SV.settings.ghost ? 'on' : 'off'}</span><kbd>Space</kbd><span>Handbrake</span></div>
    </div></div>`, () => togglePause(), {
      resume: () => togglePause(),
      flip: () => { setForceLand(true, FL.dir === 90 ? 270 : 90); },
      restart: () => { const r = RACE; quitRace(); startRace(r.ev, r.carId, r.tyre); },
      quit: () => { const ev = RACE.ev; quitRace(); this.prerace(ev); },
      retire: () => { const RC = RACE; RC.pen += Math.max(60, (RC.refT || 120) * .5); RC.t = Math.max(RC.t, (RC.refT || 120) * 1.1); RC.st = 'run'; AUD.ac && AUD.ac.resume(); this.close(); finishRace(); RC.finishT = 1.5; },
    });
  },

  results(r) {
    document.getElementById('hud').hidden = true; document.getElementById('touch').hidden = true;
    if (r.rally) return this.rallyStage(r);
    const ev = r.ev, next = !ev.free && CHAMPS.find(c => c.id === ev.champ).events[ev.idx + 1];
    const targets = r.targets ? `<div class="tlist">${[3, 2, 1].map(m => `<span>${medalDot(m)}</span><span>${MEDAL_NAMES[m]}</span><b>${fmtTime(r.targets[m - 1])}</b>`).join('')}</div>` : '';
    const splits = r.lapTimes.length ? `<div class="tlist">${r.lapTimes.map((t, i) => `<span>Lap ${i + 1}</span><span></span><b>${fmtTime(t)}</b>`).join('')}</div>` : '';
    const unlocks = r.fresh.map(c => `<div class="unlock"><canvas class="carview" style="width:120px;aspect-ratio:16/9" data-car="${c.id}" data-liv="${c.liv}"></canvas><div><div class="eyebrow">New car</div>${esc(c.make)} ${esc(c.model)}</div></div>`).join('')
      + (r.champDone ? `<div class="unlock"><div><div class="eyebrow">Championship complete</div>${esc(CHAMPS.find(c => c.id === ev.champ).name)}${CHAMPS[CHAMPS.findIndex(c => c.id === ev.champ) + 1] ? ' · next championship open' : ''}</div></div>` : '');
    const medalLine = ev.type === 'roam' ? `<div class="res-medal">All lanterns found</div>` : `<div class="res-medal">${medalDot(r.medal)} ${r.medal ? MEDAL_NAMES[r.medal] : 'No medal'}${r.isBest && r.prevBest ? ` · new best by ${(r.prevBest - r.time).toFixed(2)} s` : r.isBest ? ' · first finish' : ''}</div>`;
    this.set(`<div class="screen" style="background:linear-gradient(90deg,rgba(16,12,26,.62),rgba(16,12,26,.1))">
      <div style="margin:auto 0;display:flex;flex-direction:column;gap:18px;max-width:560px">
        <div class="eyebrow">${esc(ev.name)} · ${esc(CAR[RACE.carId].make)} ${esc(CAR[RACE.carId].model)}</div>
        <div class="res-time">${fmtTime(r.time)}</div>
        ${medalLine}
        <div class="cols" style="align-items:flex-start;gap:28px">${targets}${splits}${r.parts && r.parts.length ? `<div class="tlist">${r.parts.slice(0, 5).map(([n, v]) => `<span></span><span>${n}</span><b>${Math.round(v * 100)}%</b>`).join('')}</div>` : ''}</div>
        <div class="muted">+${r.pay.toLocaleString()} credits${r.resets ? ` · ${r.resets} reset${r.resets > 1 ? 's' : ''}` : ''}${r.dmg > .02 ? ` · car ${Math.round(r.dmg * 100)}% damaged` : ' · car clean'}</div>
        ${unlocks}
        <div class="cols">${next && eventOpen(next) ? `<button class="cta" data-act="next" data-focus>Next stage</button>` : ''}<button class="${next && eventOpen(next) ? 'ghostbtn' : 'cta'}" data-act="retry" ${next && eventOpen(next) ? '' : 'data-focus'}>Drive again</button><button class="ghostbtn" data-act="menu">${ev.free ? 'Free run' : 'Career'}</button></div>
      </div></div>`, null, {
      retry: () => { const R2 = RACE; quitRace(); startRace(R2.ev, R2.carId, R2.tyre); },
      next: () => { quitRace(); this.prerace(next); },
      menu: () => { quitRace(); ev.free ? this.free() : this.career(ev.champ); },
    });
  },

  loading(ev) {
    this.set(`<div class="screen"><div style="margin:auto 0 8vh;display:flex;flex-direction:column;gap:10px">
      <div class="eyebrow">${esc(BIOMES[ev.biome].name)} · ${TYPES[ev.type].name} · ${CONDS[ev.cond].name}</div>
      <div class="brand" style="font-size:clamp(44px,8vw,110px)">${esc(ev.name)}</div>
      <div class="press" style="animation-duration:1.4s">Painting the stage</div></div></div>`);
  },
};
