// ---------- rally mode: several stages in one region against a field of AI crews, on the clock ----------
const RIVALS = [
  { name: 'L. Varga', nat: 'HUN' }, { name: 'T. Halvorsen', nat: 'NOR' }, { name: 'C. Moreau', nat: 'FRA' }, { name: 'J. Okafor', nat: 'NGA' },
  { name: 'R. Kaur', nat: 'IND' }, { name: 'N. Ibarra', nat: 'ARG' }, { name: 'E. Lindqvist', nat: 'SWE' }, { name: 'P. Santos', nat: 'POR' },
  { name: 'H. Watanabe', nat: 'JPN' }, { name: 'D. Novak', nat: 'CZE' }, { name: 'G. Bianchi', nat: 'ITA' }, { name: 'A. Kowalczyk', nat: 'POL' },
  { name: 'M. Ferreira', nat: 'BRA' }, { name: 'S. Aaltonen', nat: 'FIN' }, { name: 'I. Petrov', nat: 'BUL' }, { name: 'B. Murphy', nat: 'IRL' },
];
const RALLIES = [
  { id: 'r1', name: 'Rally of the Pines', cls: 1, blurb: 'Five gravel stages through the lake forests, from golden afternoon into the night.', stages: [
    { name: 'Birch Hollow', biome: 'pines', type: 'stage', surf: 'gravel', cond: 'golden', len: 1500 },
    { name: 'Mill Ford', biome: 'pines', type: 'stage', surf: 'gravel', cond: 'day', len: 1600 },
    { name: 'Ridge Lake', biome: 'pines', type: 'stage', surf: 'gravel', cond: 'overcast', len: 1500 },
    { name: 'Twilight Pines', biome: 'pines', type: 'stage', surf: 'gravel', cond: 'dusk', len: 1700 },
    { name: 'Lantern Woods', biome: 'pines', type: 'stage', surf: 'gravel', cond: 'night', len: 1600 }] },
  { id: 'r2', name: 'Coastal Rally', cls: 2, blurb: 'Sealed roads above the sea: harbour loops, a cliff climb and a wet finale.', stages: [
    { name: 'Harbour Loop', biome: 'coast', type: 'stage', surf: 'tarmac', cond: 'day', len: 1700 },
    { name: 'Cliff Road', biome: 'coast', type: 'hillclimb', surf: 'tarmac', cond: 'dusk' },
    { name: 'Olive Terraces', biome: 'coast', type: 'stage', surf: 'tarmac', cond: 'golden', len: 1800 },
    { name: 'Lighthouse Night', biome: 'coast', type: 'stage', surf: 'tarmac', cond: 'night', len: 1700 },
    { name: 'Salt Wind', biome: 'coast', type: 'stage', surf: 'tarmac', cond: 'rain', len: 1800 }] },
  { id: 'r3', name: 'Ember Rally', cls: 3, blurb: 'Red mud and loose gravel in the autumn hills, with fog and rain on the way.', stages: [
    { name: 'Rust Valley', biome: 'ember', type: 'stage', surf: 'gravel', cond: 'golden', len: 1900 },
    { name: 'Copper Mire', biome: 'ember', type: 'stage', surf: 'mud', cond: 'overcast', len: 1800 },
    { name: 'Ash Ridge', biome: 'ember', type: 'stage', surf: 'gravel', cond: 'fog', len: 1900 },
    { name: 'Red Rain', biome: 'ember', type: 'stage', surf: 'mud', cond: 'rain', len: 1800 },
    { name: 'Furnace Run', biome: 'ember', type: 'stage', surf: 'gravel', cond: 'day', len: 2000 }] },
  { id: 'r4', name: 'Frost Rally', cls: 4, blurb: 'Snow, sheet ice and a frozen climb, much of it after dark.', stages: [
    { name: 'White Birches', biome: 'frost', type: 'stage', surf: 'snow', cond: 'day', len: 1900 },
    { name: 'Glass Lake', biome: 'frost', type: 'stage', surf: 'ice', cond: 'night', len: 1800 },
    { name: 'Snowfall Pass', biome: 'frost', type: 'stage', surf: 'snow', cond: 'snowfall', len: 2000 },
    { name: 'Frozen Climb', biome: 'frost', type: 'hillclimb', surf: 'snow', cond: 'day' },
    { name: 'Polar Night', biome: 'frost', type: 'stage', surf: 'snow', cond: 'night', len: 2000 }] },
  { id: 'r5', name: 'Mesa Rally', cls: 5, blurb: 'Fast desert dirt and sand between the red mesas, flat out to sunset.', stages: [
    { name: 'Canyon Floor', biome: 'mesa', type: 'stage', surf: 'dirt', cond: 'golden', len: 2100 },
    { name: 'Dune Line', biome: 'mesa', type: 'stage', surf: 'sand', cond: 'day', len: 2000 },
    { name: 'Dust Devil', biome: 'mesa', type: 'stage', surf: 'dirt', cond: 'fog', len: 2100 },
    { name: 'Mesa Climb', biome: 'mesa', type: 'hillclimb', surf: 'dirt', cond: 'golden' },
    { name: 'Sunset Mesa', biome: 'mesa', type: 'stage', surf: 'dirt', cond: 'dusk', len: 2200 }] },
];
RALLIES.forEach(r => r.stages.forEach((e, i) => { e.id = r.id + 's' + (i + 1); e.cls = r.cls; e.idx = i; e.rally = r.id; e.seed = strSeed(e.id + e.name); }));
const RALLY = Object.fromEntries(RALLIES.map(r => [r.id, r]));
const RALLY_PAY = [15000, 10000, 7000, 4500, 3600, 3000, 2500, 2000, 1600, 1200];
const SERVICE_AFTER = [1, 3]; // service park after SS2 and SS4 (indices)

function rallyOpen(r) { return SV.dev || CARS.some(c => c.cls === r.cls && SV.cars.includes(c.id)); }

// a new rally: nine rivals with their own pace, cars from the class and a little day-to-day form
function rallyNew(rid, carId) {
  const r = RALLY[rid], pool = RIVALS.slice().sort(() => Math.random() - .5).slice(0, 9), cars = CARS.filter(c => c.cls === r.cls);
  const rivals = pool.map((d, i) => ({ ...d, car: cars[(i + 1) % cars.length].id, pace: .975 + i * .016 + (Math.random() - .5) * .02, form: (Math.random() - .5) * .01 }));
  SV.rally = { id: rid, car: carId, stage: 0, rivals, times: rivals.map(() => []), my: [], dm: null, dents: [], refs: [], done: false, started: Date.now() };
  writeSave();
}

// the field's times on the stage just driven, from the reference pace of the stage
function rallyFieldTimes(ref) {
  const R = SV.rally;
  R.rivals.forEach((d, i) => {
    const prev = R.times[i];
    if (prev.some(t => t == null)) { prev.push(null); return; } // already out
    let t = ref * (d.pace + d.form) * (1 + (Math.random() + Math.random() + Math.random() - 1.5) * .014);
    const m = Math.random();
    if (m < .012) { prev.push(null); return; }                   // off the road and out of the rally
    if (m < .035) t += 25 + Math.random() * 60;                  // a big moment: stuck in a ditch
    else if (m < .12) t += 2 + Math.random() * 10;                // a spin, an overshoot
    prev.push(Math.round(t * 100) / 100);
  });
}

// standings after stage index si (inclusive): total time, or out
function rallyTable(si) {
  const R = SV.rally, rows = [];
  rows.push({ me: true, name: 'You', nat: '', car: R.car, stage: R.my[si], total: R.my.slice(0, si + 1).reduce((a, b) => a + b, 0) });
  R.rivals.forEach((d, i) => {
    const ts = R.times[i].slice(0, si + 1), out = ts.some(t => t == null);
    rows.push({ name: d.name, nat: d.nat, car: d.car, stage: R.times[i][si], total: out ? null : ts.reduce((a, b) => a + b, 0) });
  });
  return rows;
}
const byTime = k => (a, b) => (a[k] == null) - (b[k] == null) || (a[k] ?? 0) - (b[k] ?? 0);

// the player's stage result arrives here; returns the summary for the results screen
function rallyStageDone(time, ref, car) {
  const R = SV.rally, si = R.stage;
  R.my[si] = time; R.refs[si] = ref;
  rallyFieldTimes(ref);
  // damage goes with the car to the next stage, unless the service park is next
  const service = SERVICE_AFTER.includes(si);
  R.dm = service ? null : JSON.parse(JSON.stringify(car.dm)); R.dents = service ? [] : car.dents.slice();
  R.stage++;
  const stage = rallyTable(si).sort(byTime('stage')), overall = rallyTable(si).sort(byTime('total'));
  const pos = overall.findIndex(r => r.me) + 1, spos = stage.findIndex(r => r.me) + 1;
  let pay = 0;
  if (R.stage >= RALLY[R.id].stages.length) {
    R.done = true;
    pay = Math.round(((RALLY_PAY[pos - 1] || 800) * (1 + .3 * (RALLY[R.id].cls - 1))) / 10) * 10;
    SV.credits += pay;
    SV.rallyBest = SV.rallyBest || {};
    SV.rallyBest[R.id] = Math.min(SV.rallyBest[R.id] || 99, pos);
  }
  writeSave();
  return { si, stage, overall, pos, spos, service, pay, done: R.done, dmg: car.dmg, parts: damageList(car.dm) };
}

// projected rival time at a fraction of the stage, for live split comparisons
function rallyLeaderAt(frac) {
  const R = SV.rally, si = R.stage, ref = RACE && RACE.refT; if (!ref) return null;
  const best = Math.min(...R.rivals.map((d, i) => R.times[i].some(t => t == null) ? 1e9 : d.pace + d.form));
  return ref * best * frac;
}
