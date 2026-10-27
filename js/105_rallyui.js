// ---------- rally screens: choose a rally, the service-park hub between stages, and the timing sheets ----------
Object.assign(UI, {
  rallies() {
    clearInterval(this.cyc); GAME.mode = 'menu';
    setBackdrop(RALLIES[0].stages[0].biome);
    const cards = RALLIES.map(r => {
      const ok = rallyOpen(r), best = SV.rallyBest && SV.rallyBest[r.id];
      return `<button class="card${ok ? '' : ' locked'}" data-act="${ok ? 'pick' : 'none'}" data-arg="${r.id}">
        <div class="swatch"><canvas data-swatch="${r.stages[0].biome}"></canvas></div>
        <div class="t">${esc(r.name)}</div>
        <div class="sub">${esc(CLASS_NAMES[r.cls])} class · ${r.stages.length} stages</div>
        <div class="row">${[...new Set(r.stages.map(s => s.surf))].map(k => chip(surfName(k), SURF_DOT[k])).join('')}</div>
        <div class="best">${best ? (best === 1 ? '🏆 Won' : 'Best finish P' + best) : ok ? 'Not entered yet' : 'Needs a ' + esc(CLASS_NAMES[r.cls]) + ' car'}</div>
      </button>`;
    }).join('');
    this.set(`<div class="screen">
      <div class="topbar"><button class="back" data-act="back">Back</button><span class="spacer"></span><span class="eyebrow">Credits ${SV.credits.toLocaleString()}</span></div>
      <h2 class="h2">Rally</h2>
      <p class="muted" style="margin:0 0 14px;max-width:720px">Five stages, one car, nine rival crews. Times add up across the rally, damage stays with the car until the service park after stages 2 and 4, and there are no restarts.</p>
      <div class="grid">${cards}</div>
    </div>`, () => this.main(), {
      back: () => this.main(), none: () => toast('Get a car of this class first'),
      pick: id => { if (SV.rally && !SV.rally.done && SV.rally.id !== id) return this.rallyAbandonAsk(() => this.rallyCar(id)); this.rallyCar(id); },
    });
  },

  rallyAbandonAsk(then) {
    this.set(`<div class="screen" style="background:rgba(16,12,26,.45)"><div class="overlay-center panel" style="display:flex;flex-direction:column;gap:14px">
      <div class="eyebrow">${esc(RALLY[SV.rally.id].name)}</div><div class="h2">Abandon the rally?</div>
      <p class="muted" style="margin:0">You are on stage ${SV.rally.stage + 1}. Your times so far will be lost.</p>
      <div class="cols"><button class="ghostbtn" data-act="keep" data-focus>Keep going</button><button class="danger" data-act="drop">Abandon</button></div>
    </div></div>`, () => this.rallyHub(), { keep: () => this.rallyHub(), drop: () => { SV.rally = null; writeSave(); then(); } });
  },

  rallyCar(rid, sel) {
    const r = RALLY[rid], cars = CARS.filter(c => c.cls === r.cls && (SV.dev || SV.cars.includes(c.id)));
    sel = sel || (cars.find(c => c.id === this.lastCar) || cars[cars.length - 1] || {}).id;
    setBackdrop(r.stages[0].biome);
    const cards = cars.map(c => `<button class="card${c.id === sel ? ' sel' : ''}" data-act="car" data-arg="${c.id}" style="padding:10px">
        <canvas class="carview" style="aspect-ratio:16/8" data-car="${c.id}" data-liv="${livOf(c.id)}"></canvas>
        <div class="t" style="font-size:16px">${esc(c.make)} ${esc(c.model)}</div>
        <div class="sub">${c.year} · ${c.drive === 'A' ? 'AWD' : c.drive === 'R' ? 'RWD' : 'FWD'} · ${c.kw} kW</div></button>`).join('');
    const stages = r.stages.map((e, i) => `<div class="rst"><span class="ssn">SS${i + 1}</span><span>${esc(e.name)}</span><span class="row">${chip(surfName(e.surf), SURF_DOT[e.surf])}${chip(CONDS[e.cond].name, COND_DOT[e.cond])}</span></div>${SERVICE_AFTER.includes(i) ? '<div class="svc">Service park</div>' : ''}`).join('');
    this.set(`<div class="screen">
      <div class="topbar"><button class="back" data-act="back">Back</button><span class="spacer"></span><span class="eyebrow">${esc(CLASS_NAMES[r.cls])} class</span></div>
      <div class="two">
        <div class="panel" style="display:flex;flex-direction:column;gap:12px">
          <h2 class="h2" style="margin:0">${esc(r.name)}</h2><p class="muted" style="margin:0">${esc(r.blurb)}</p>
          <div class="rstages">${stages}</div>
          <div class="cols"><button class="cta" data-act="go" ${sel ? 'data-focus' : 'disabled'}>Enter the rally</button></div>
        </div>
        <div style="display:flex;flex-direction:column;gap:10px;min-width:0"><div class="eyebrow">Your car for the whole rally</div>
          <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(190px,1fr))">${cards}</div></div>
      </div></div>`, () => this.rallies(), {
      back: () => this.rallies(), car: id => { this.lastCar = id; this.rallyCar(rid, id); },
      go: () => { if (!sel) return; rallyNew(rid, sel); this.rallyHub(); },
    });
  },

  rallyTableHtml(rows, key, si) {
    const lead = rows[0] && rows[0][key];
    return `<div class="rtab">${rows.map((r, i) => {
      const t = r[key], out = t == null;
      return `<span class="p${r.me ? ' me' : ''}">${out ? '–' : i + 1}</span><span class="${r.me ? 'me' : ''}">${esc(r.name)}${r.nat ? ` <i>${r.nat}</i>` : ''}<small>${esc(CAR[r.car].make + ' ' + CAR[r.car].model)}</small></span><b class="${r.me ? 'me' : ''}">${out ? 'Retired' : fmtTime(t)}</b><em>${out || i === 0 ? '' : '+' + (t - lead).toFixed(2)}</em>`;
    }).join('')}</div>`;
  },

  rallyHub() {
    clearInterval(this.cyc); GAME.mode = 'menu';
    const R = SV.rally; if (!R) return this.rallies();
    const r = RALLY[R.id], si = R.stage, next = r.stages[si];
    setBackdrop((next || r.stages[0]).biome);
    const stages = r.stages.map((e, i) => {
      let res = '';
      if (i < si) { const st = rallyTable(i).sort(byTime('stage')); res = `${fmtTime(R.my[i])} <small>P${st.findIndex(x => x.me) + 1}</small>`; }
      return `<div class="rst${i === si ? ' now' : ''}"><span class="ssn">SS${i + 1}</span><span>${esc(e.name)}</span><span class="row">${chip(surfName(e.surf), SURF_DOT[e.surf])}${chip(CONDS[e.cond].name, COND_DOT[e.cond])}</span><b>${res}</b></div>${SERVICE_AFTER.includes(i) && i < r.stages.length - 1 ? `<div class="svc">Service park${i < si ? (SERVICE_AFTER.includes(si - 1) ? ' · car repaired' : '') : ''}</div>` : ''}`;
    }).join('');
    const overall = si > 0 ? this.rallyTableHtml(rallyTable(si - 1).sort(byTime('total')), 'total') : '<p class="muted">Standings appear after the first stage.</p>';
    const rec = next ? SURF_TYRE[next.surf] || 'gravel' : 'gravel', tyre = this.rTyre && this.rTyreFor === si ? this.rTyre : rec;
    const tyreSeg = Object.keys(TYRES).map(k => `<button class="${k === tyre ? 'on' : ''}" data-act="tyre" data-arg="${k}">${TYRES[k].name}${k === rec ? ' ★' : ''}</button>`).join('');
    const dm = R.dm ? damageList(R.dm) : [];
    this.set(`<div class="screen">
      <div class="topbar"><button class="back" data-act="back">Main menu</button><span class="spacer"></span><span class="eyebrow">${esc(CAR[R.car].make)} ${esc(CAR[R.car].model)}</span></div>
      <div class="two">
        <div class="panel" style="display:flex;flex-direction:column;gap:12px">
          <div class="eyebrow">${esc(CLASS_NAMES[r.cls])} class</div><h2 class="h2" style="margin:0">${esc(r.name)}</h2>
          <div class="rstages">${stages}</div>
          ${dm.length ? `<div class="lockline">Carrying damage: ${dm.slice(0, 3).map(([n, v]) => `${n} ${Math.round(v * 100)}%`).join(' · ')}</div>` : ''}
          ${next ? `<div class="opt" style="border:0;padding:0"><div>Tyres for SS${si + 1}<small>★ suits this surface</small></div><div class="seg">${tyreSeg}</div></div>
          <div class="cols"><button class="cta" data-act="start" data-focus>Start SS${si + 1} · ${esc(next.name)}</button><button class="ghostbtn" data-act="abandon">Abandon rally</button></div>` : ''}
        </div>
        <div class="panel"><div class="eyebrow" style="margin-bottom:10px">Overall standings${si > 0 ? ' after SS' + si : ''}</div>${overall}</div>
      </div></div>`, () => this.main(), {
      back: () => this.main(),
      tyre: k => { this.rTyre = k; this.rTyreFor = si; this.rallyHub(); },
      start: () => startRace(next, R.car, tyre),
      abandon: () => this.rallyAbandonAsk(() => this.rallies()),
    });
  },

  rallyStage(r) {
    const R = SV.rally, rl = RALLY[R.id];
    const head = r.done ? `<div class="eyebrow">${esc(rl.name)} · final classification</div><div class="res-time">${r.pos === 1 ? 'Rally winner' : 'P' + r.pos + ' overall'}</div>`
      : `<div class="eyebrow">${esc(rl.name)} · SS${r.si + 1} ${esc(r.ev.name)}</div><div class="res-time">${fmtTime(r.time)}</div><div class="res-medal">P${r.spos} on the stage · P${r.pos} overall</div>`;
    const dmg = r.parts && r.parts.length ? `<div class="muted">Damage: ${r.parts.slice(0, 4).map(([n, v]) => `${n} ${Math.round(v * 100)}%`).join(' · ')}${r.service ? ' · repaired at the service park' : ' · carried to the next stage'}</div>` : r.service && !r.done ? '<div class="muted">Service park next: the crew will check the car over.</div>' : '';
    this.set(`<div class="screen" style="background:linear-gradient(90deg,rgba(16,12,26,.7),rgba(16,12,26,.25))">
      <div style="margin:auto 0;display:flex;flex-direction:column;gap:16px;width:100%">
        ${head}
        <div class="two">
          <div class="panel"><div class="eyebrow" style="margin-bottom:10px">${r.done ? 'Final stage' : 'Stage'} times</div>${this.rallyTableHtml(r.stage, 'stage')}</div>
          <div class="panel"><div class="eyebrow" style="margin-bottom:10px">${r.done ? 'Final classification' : 'Overall standings'}</div>${this.rallyTableHtml(r.overall, 'total')}</div>
        </div>
        ${dmg}
        ${r.done ? `<div class="muted">+${r.pay.toLocaleString()} credits</div>` : ''}
        <div class="cols">${r.done ? '<button class="cta" data-act="out" data-focus>Rallies</button>' : `<button class="cta" data-act="hub" data-focus>${r.service ? 'To the service park' : 'Next stage'}</button>`}</div>
      </div></div>`, null, {
      hub: () => { quitRace(); this.rallyHub(); },
      out: () => { quitRace(); this.rallies(); },
    });
  },
});
