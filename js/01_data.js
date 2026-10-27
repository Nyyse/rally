// ---------- surfaces ----------
// mu: base grip; rr: rolling resistance; loose: tyre group; ap: peak slip angle; fall: grip falloff past peak
// mu: peak friction with a matching tyre; rr: rolling resistance; ap: slip angle (rad) of peak grip; fall: grip lost past the peak
// Values follow real road figures: dry tarmac ~1.1, loose gravel ~0.7, packed snow ~0.4, ice ~0.15 (studs raise it a lot).
const SURF = {
  tarmac:  { name: 'Tarmac',  grp: 'tarmac', mu: 1.12, rr: .012, rough: .04, ap: .095, fall: .14,  fx: 'smoke' },
  gravel:  { name: 'Gravel',  grp: 'loose',  mu: .74,  rr: .028, rough: .5,  ap: .15,  fall: .1,  fx: 'dust' },
  dirt:    { name: 'Dirt',    grp: 'loose',  mu: .8,   rr: .024, rough: .4,  ap: .14,  fall: .1,  fx: 'dust' },
  sand:    { name: 'Sand',    grp: 'loose',  mu: .6,   rr: .085, rough: .3,  ap: .17,  fall: .06, fx: 'sand' },
  mud:     { name: 'Mud',     grp: 'loose',  mu: .52,  rr: .07,  rough: .55, ap: .17,  fall: .07, fx: 'mud' },
  snow:    { name: 'Snow',    grp: 'snow',   mu: .42,  rr: .035, rough: .22, ap: .14,  fall: .08, fx: 'snow' },
  ice:     { name: 'Ice',     grp: 'ice',    mu: .15,  rr: .01,  rough: .04, ap: .1,   fall: .2,  fx: 'ice' },
  grass:   { name: 'Grass',   grp: 'loose',  mu: .52,  rr: .075, rough: .65, ap: .15,  fall: .1,  fx: 'grass' },
  deepsnow:{ name: 'Deep snow', grp: 'snow', mu: .33,  rr: .17,  rough: .45, ap: .16,  fall: .07, fx: 'snow' },
  water:   { name: 'Ford',    grp: 'loose',  mu: .5,   rr: .24,  rough: .4,  ap: .16,  fall: .08, fx: 'splash' },
  deep:    { name: 'Deep water', grp: 'loose', mu: .3,  rr: .7,   rough: .2,  ap: .16,  fall: .08, fx: 'splash' },
};
const SURF_KEYS = Object.keys(SURF);
const TYRES = {
  tarmac: { name: 'Tarmac slicks', tarmac: 1.0,  loose: .8,  snow: .7,  ice: .9 },
  gravel: { name: 'Gravel',        tarmac: .9,   loose: 1.0, snow: .86, ice: 1.0 },
  snow:   { name: 'Studded snow',  tarmac: .8,   loose: .9,  snow: 1.28, ice: 2.4 },
};

// ---------- locations (biomes) ----------
const BIOMES = {
  pines: {
    name: 'Northern Pines', blurb: 'Fast gravel through pine forest and still lakes.',
    ground: ['#2f4f4a', '#3b5e52', '#4b6e57', '#5f7f5c', '#7a8f63', '#98a06e', '#b6b07d'],
    shade: '#1b2c3a', light: '#f6d7a8', water: ['#78aeb0', '#2e5d6e'], foam: '#dff2ea', frozen: false,
    road: { gravel: '#c2ad8c', tarmac: '#57565e', dirt: '#a88d6a', mud: '#6d5640', snow: '#e9eef6', ice: '#cfe3f0', sand: '#d9c39a' },
    shoulder: '#8a8a66', offroad: 'grass',
    trees: [['pine', .72], ['birch', .28]], treeSp: 5.2, treeDen: .78, rockDen: .12,
    decor: ['tuft', 'tuft', 'fern', 'stone', 'flower'], decorCols: ['#5f7a52', '#4c6446', '#8a9a6a', '#d8b8c8', '#e6dca0'],
    house: { wall: '#9b3f35', roof: '#3a3236', trim: '#efe6d8' },
    haze: '#cfe6dc', motes: '#fff3d6',
    sky: ['#16323a', '#2c5a5c', '#5f8c7c', '#d3b48e', '#f4d3a6'], ridge: ['#3e6a64', '#24423f', '#122524'], glow: '#ffd7a0', sun: '#fff1d6', sunY: .44,
  },
  mesa: {
    name: 'Amber Mesa', blurb: 'Red dirt and drifting sand between stepped mesas.',
    ground: ['#8a4a3c', '#a05a42', '#b56d4a', '#c98757', '#d9a06a', '#e6b984', '#f0d2a2'],
    shade: '#4a2a3a', light: '#ffe0b0', water: ['#7fb6aa', '#3f7a7a'], foam: '#f3e6cc', frozen: false,
    road: { dirt: '#d4a679', sand: '#ebcd9f', gravel: '#c9a886', tarmac: '#5b5258', mud: '#8a5a40' },
    shoulder: '#c58a5e', offroad: 'sand',
    trees: [['acacia', .5], ['shrub', .32], ['cactus', .18]], treeSp: 13, treeDen: .5, rockDen: .35,
    decor: ['stone', 'tuft', 'stone', 'ripple'], decorCols: ['#a8664a', '#c9925e', '#8a5a3a', '#e9c48e'],
    house: { wall: '#e0b48a', roof: '#a8644a', trim: '#7a4a3a' },
    haze: '#f2c2a0', motes: '#ffe6c4',
    sky: ['#3b1f33', '#7a3a45', '#c4664f', '#eaa06a', '#f8d4a0'], ridge: ['#a8584a', '#6e3436', '#3a1a24'], glow: '#ffc890', sun: '#fff0d0', sunY: .46,
  },
  frost: {
    name: 'Frost Valley', blurb: 'Packed snow, sheet ice and spruce under a lavender sky.',
    ground: ['#8d9cc0', '#a3b0cf', '#b8c3dc', '#cad3e6', '#dae1ee', '#e8edf5', '#f6f8fc'],
    shade: '#4c5a86', light: '#fff4e8', water: ['#c9dfec', '#a7c3dc'], foam: '#ffffff', frozen: true,
    road: { snow: '#eef2f8', ice: '#d2e5f2', gravel: '#b8b0a6', tarmac: '#6a6e80' },
    shoulder: '#f6f8fc', offroad: 'deepsnow',
    trees: [['spruce', .86], ['birch', .14]], treeSp: 6.5, treeDen: .66, rockDen: .1,
    decor: ['snowlump', 'snowlump', 'twig'], decorCols: ['#ffffff', '#dfe6f3', '#6b6070'],
    house: { wall: '#8a5a48', roof: '#f4f6fb', trim: '#3a3040' },
    haze: '#e8eefa', motes: '#ffffff',
    sky: ['#2a3358', '#4b5a8a', '#8796c0', '#c8cfe6', '#f3eef2'], ridge: ['#8a96c4', '#5d6a9a', '#353f6a'], glow: '#ffe6f0', sun: '#ffffff', sunY: .40,
  },
  coast: {
    name: 'Saltwind Coast', blurb: 'Sunlit tarmac above the sea, olive groves and white villages.',
    ground: ['#6f6a4e', '#817b57', '#958c60', '#a99d6c', '#bcae7c', '#cdbf90', '#ddd0a8'],
    shade: '#3a3050', light: '#ffd9b8', water: ['#66b2b8', '#245a7e'], foam: '#f4f6ee', frozen: false,
    road: { tarmac: '#56535f', gravel: '#cbb998', dirt: '#b99a74' },
    shoulder: '#b8a882', offroad: 'grass',
    trees: [['olive', .48], ['cypress', .34], ['umbrella', .18]], treeSp: 10, treeDen: .55, rockDen: .18,
    decor: ['tuft', 'flower', 'stone', 'tuft'], decorCols: ['#8a8a5a', '#a0a066', '#f0e0a0', '#e8a0a8'],
    house: { wall: '#f1e8d8', roof: '#c4704c', trim: '#5f88a8' },
    haze: '#f4c9c0', motes: '#fff0e0',
    sky: ['#2c2648', '#5b4870', '#b06b78', '#f09a7e', '#ffd6a8'], ridge: ['#7a6080', '#4a3c60', '#26203a'], glow: '#ffc0a0', sun: '#fff0dc', sunY: .5,
  },
  ember: {
    name: 'Ember Woods', blurb: 'Muddy forest lanes under copper and crimson leaves.',
    ground: ['#3e2f2a', '#4f3a2e', '#634632', '#7b5636', '#93673c', '#ab7b46', '#c39255'],
    shade: '#2a1c26', light: '#ffd39a', water: ['#7f938a', '#3e4e4c'], foam: '#e6dccb', frozen: false,
    road: { mud: '#6e4c34', gravel: '#a68c6e', dirt: '#93704c', tarmac: '#4e4a50' },
    shoulder: '#5a4232', offroad: 'mud',
    trees: [['oak', .4], ['maple', .35], ['birchY', .25]], treeSp: 5.6, treeDen: .74, rockDen: .1,
    decor: ['leaf', 'leaf', 'leaf', 'tuft', 'stone'], decorCols: ['#d9772f', '#c4432c', '#e8b444', '#7a6a3a', '#8a7a6a'],
    house: { wall: '#7a3a2a', roof: '#3b3436', trim: '#d8c8a8' },
    haze: '#e8b58a', motes: '#ffd9a0',
    sky: ['#24161c', '#4a2428', '#8a3f2e', '#d17a3e', '#f2c07a'], ridge: ['#7a3a2a', '#4a2222', '#26121a'], glow: '#ffb070', sun: '#ffe2b0', sunY: .48,
  },
  clay: {
    name: 'Clay Bowl', blurb: 'A rallycross bowl of tarmac and clay under evening lights.',
    ground: ['#5d6a4a', '#687552', '#73805a', '#808c63', '#8e986c', '#9da477', '#aeb184'],
    shade: '#2d2440', light: '#ffd0a0', water: ['#6a9aa8', '#355a6e'], foam: '#eef0f4', frozen: false,
    road: { tarmac: '#4f4b5a', gravel: '#bb9c78', dirt: '#a8805a' },
    shoulder: '#8a7a5a', offroad: 'grass',
    trees: [['poplar', .6], ['oak', .4]], treeSp: 12, treeDen: .5, rockDen: .04,
    decor: ['tuft', 'tuft', 'flower'], decorCols: ['#6a7a4e', '#8a9660', '#f0d890'],
    house: { wall: '#d8d0c4', roof: '#5a4a6a', trim: '#f7b27a' },
    haze: '#e3b8c8', motes: '#ffe0f0',
    sky: ['#1d1834', '#3d2f5a', '#7e4f78', '#d9876f', '#f7c89a'], ridge: ['#5a4878', '#36294e', '#1c1430'], glow: '#ffb4a0', sun: '#fff0e0', sunY: .47,
  },
};
const BIOME_KEYS = Object.keys(BIOMES);

// ---------- light & weather ----------
// sun: direction shadows fall (x,y), len: shadow length per metre of height
const CONDS = {
  day:      { name: 'Clear',        sun: [.62, .5],  len: .6, shA: .42, tint: null,      tintA: 0,   dark: 0,   glow: .5,  weather: null,     motes: .6, grip: 1 },
  golden:   { name: 'Golden hour',  sun: [.85, .3],  len: 1.35, shA: .46, tint: '#ffaa66', tintA: .13, dark: 0,   glow: 1,   weather: null,     motes: 1,  grip: 1 },
  dusk:     { name: 'Dusk',         sun: [.9, -.2],  len: 1.7, shA: .3,  tint: '#a85c94', tintA: .17, dark: .2,  glow: .8,  weather: null,     motes: .8, grip: 1 },
  overcast: { name: 'Overcast',     sun: [.4, .4],   len: .25, shA: .18, tint: '#93a2b4', tintA: .12, dark: .05, glow: .1,  weather: null,     motes: .2, grip: 1 },
  rain:     { name: 'Rain',         sun: [.4, .4],   len: .2,  shA: .15, tint: '#7a8aa4', tintA: .16, dark: .14, glow: .05, weather: 'rain',   motes: 0,  grip: .88, wet: true },
  snowfall: { name: 'Snowfall',     sun: [.4, .4],   len: .2,  shA: .14, tint: '#d8def0', tintA: .12, dark: .04, glow: .15, weather: 'snow',   motes: 0,  grip: .97 },
  fog:      { name: 'Fog',          sun: [.5, .4],   len: .25, shA: .14, tint: '#e8e4ec', tintA: .1,  dark: 0,   glow: .3,  weather: 'fog',    motes: .3, grip: 1 },
  night:    { name: 'Night',        sun: [.3, .5],   len: .3,  shA: .12, tint: '#0c1236', tintA: 0,   dark: .8,  glow: 0,   weather: null,     motes: 0,  grip: 1, night: true },
};

// ---------- original makes & cars ----------
const MAKES = {
  Aldwyn:  'Small-car specialists from a coastal workshop town.',
  Valtari: 'Northern builders of tough, square-shouldered cars.',
  Morello: 'Light, loud sports cars with rear-drive manners.',
  Bellac:  'Nimble hatchbacks and one notorious mid-engine monster.',
  Kessler: 'Engineers of the first turbo all-wheel-drive rally cars.',
  Nakara:  'Precise, relentless all-wheel-drive turbos.',
};
const LIVERIES = [
  { name: 'Dawn',   base: '#f1ebdf', stripe: '#de6152', accent: '#2f3a5a' },
  { name: 'Lagoon', base: '#2f6f7a', stripe: '#f2d28a', accent: '#f1ebdf' },
  { name: 'Ember',  base: '#d4553e', stripe: '#f6c35a', accent: '#2a2230' },
  { name: 'Moss',   base: '#4a6a3e', stripe: '#efe2c0', accent: '#c9873e' },
  { name: 'Ink',    base: '#25253c', stripe: '#9ec9c4', accent: '#f7b27a' },
  { name: 'Petal',  base: '#e9a8b0', stripe: '#ffffff', accent: '#5a3a6a' },
  { name: 'Dune',   base: '#d8c49a', stripe: '#7a3e2e', accent: '#2f4a5a' },
  { name: 'Sky',    base: '#8fb7dc', stripe: '#ffffff', accent: '#e0655a' },
];
// style: L,W,wb,cab[rear,front] as fraction of length, roofW fraction, nose/tail taper, extras
const CARS = [
  { id: 'pip', make: 'Aldwyn', model: 'Pip 1000', cls: 1, year: 1964, drive: 'F', kw: 58, kg: 640, top: 148, gears: 4, fw: .62,
    s: { L: 3.1, W: 1.46, wb: 2.04, cab: [.2, .7], roofW: .84, nose: .16, tail: .1, pods: 2, wing: 0, pat: 'band', roofCol: true }, liv: 0, num: 7,
    unlock: null, desc: 'A tiny front-driver that dances on gravel and forgives everything.' },
  { id: 'v1300', make: 'Valtari', model: '1300 S', cls: 1, year: 1967, drive: 'R', kw: 72, kg: 880, top: 166, gears: 4, fw: .56,
    s: { L: 4.05, W: 1.6, wb: 2.42, cab: [.27, .64], roofW: .82, nose: .08, tail: .06, pods: 4, wing: 0, pat: 'stripes' }, liv: 3, num: 12,
    unlock: { ev: 'c1e2' }, desc: 'Boxy, rear-driven and happy to hang its tail out.' },
  { id: 'allegra', make: 'Morello', model: 'Allegra 1600', cls: 1, year: 1969, drive: 'R', kw: 86, kg: 910, top: 182, gears: 5, fw: .54,
    s: { L: 4.0, W: 1.6, wb: 2.36, cab: [.22, .56], roofW: .76, nose: .2, tail: .14, pods: 2, wing: 0, pat: 'stripes' }, liv: 2, num: 21,
    unlock: { ev: 'c1e4' }, desc: 'A long-nosed coupé with a singing twin-cam.' },
  { id: 'cigale', make: 'Bellac', model: 'Cigale R', cls: 2, year: 1974, drive: 'F', kw: 102, kg: 840, top: 184, gears: 5, fw: .63,
    s: { L: 3.6, W: 1.6, wb: 2.4, cab: [.07, .62], roofW: .84, nose: .12, tail: .06, pods: 4, wing: 1, pat: 'sash' }, liv: 7, num: 5,
    unlock: { champ: 'c1' }, desc: 'Front-drive hatchback that pivots on the handbrake.' },
  { id: 'falke', make: 'Kessler', model: 'Falke 2.0', cls: 2, year: 1975, drive: 'R', kw: 132, kg: 1000, top: 196, gears: 5, fw: .55,
    s: { L: 4.3, W: 1.68, wb: 2.5, cab: [.26, .62], roofW: .8, nose: .1, tail: .08, pods: 4, wing: 1, pat: 'split', flares: true }, liv: 0, num: 3,
    unlock: { ev: 'c2e2' }, desc: 'A four-door with flared arches and a short fuse.' },
  { id: 'saetta', make: 'Morello', model: 'Saetta', cls: 2, year: 1977, drive: 'R', kw: 172, kg: 980, top: 212, gears: 5, fw: .43,
    s: { L: 3.9, W: 1.76, wb: 2.24, cab: [.4, .74], roofW: .7, nose: .3, tail: .12, pods: 4, wing: 2, pat: 'chevron', louvers: true, mid: true }, liv: 4, num: 1,
    unlock: { golds: 5 }, desc: 'Mid-engined, short and twitchy. Brilliant once tamed.' },
  { id: 'k4', make: 'Kessler', model: 'K4 Turbo', cls: 3, year: 1982, drive: 'A', kw: 250, kg: 1150, top: 214, gears: 5, fw: .58, turbo: true,
    s: { L: 4.4, W: 1.76, wb: 2.52, cab: [.22, .58], roofW: .78, nose: .08, tail: .08, pods: 4, wing: 1, pat: 'stripes', flares: true, scoop: true }, liv: 0, num: 2,
    unlock: { champ: 'c2' }, desc: 'The car that brought four-wheel drive and boost to the forest.' },
  { id: 'furie', make: 'Bellac', model: 'Furie 4', cls: 3, year: 1985, drive: 'A', kw: 290, kg: 960, top: 206, gears: 5, fw: .42, turbo: true,
    s: { L: 3.85, W: 1.78, wb: 2.4, cab: [.36, .7], roofW: .8, nose: .12, tail: .04, pods: 4, wing: 3, pat: 'sash', flares: true, louvers: true, mid: true }, liv: 2, num: 6,
    unlock: { ev: 'c3e3' }, desc: 'A hatchback shape hiding a mid-mounted turbo engine.' },
  { id: 'routa', make: 'Valtari', model: 'Routa 4x4', cls: 3, year: 1986, drive: 'A', kw: 240, kg: 1060, top: 210, gears: 5, fw: .55, turbo: true,
    s: { L: 4.2, W: 1.74, wb: 2.5, cab: [.24, .6], roofW: .8, nose: .06, tail: .06, pods: 4, wing: 2, pat: 'band', flares: true, scoop: true }, liv: 1, num: 9,
    unlock: { golds: 10 }, desc: 'Square, stubborn and unbreakable. Loves snow.' },
  { id: 'zenith', make: 'Nakara', model: 'Zenith GT4', cls: 4, year: 1993, drive: 'A', kw: 220, kg: 1230, top: 216, gears: 6, fw: .58, turbo: true,
    s: { L: 4.35, W: 1.74, wb: 2.56, cab: [.26, .62], roofW: .78, nose: .14, tail: .1, pods: 4, wing: 2, pat: 'stripes', scoop: true }, liv: 7, num: 4,
    unlock: { champ: 'c3' }, desc: 'Turbo sedan with clever diffs and a long wing.' },
  { id: 'kestrel', make: 'Aldwyn', model: 'Kestrel Kit', cls: 4, year: 1997, drive: 'F', kw: 192, kg: 990, top: 202, gears: 6, fw: .62,
    s: { L: 3.85, W: 1.8, wb: 2.48, cab: [.08, .62], roofW: .82, nose: .12, tail: .06, pods: 4, wing: 2, pat: 'chevron', flares: true }, liv: 5, num: 11,
    unlock: { ev: 'c4e2' }, desc: 'A wide-arched front-drive kit car. Loves tarmac.' },
  { id: 'raiden', make: 'Nakara', model: 'Raiden RS', cls: 5, year: 2008, drive: 'A', kw: 268, kg: 1190, top: 214, gears: 6, fw: .57, turbo: true,
    s: { L: 4.1, W: 1.8, wb: 2.56, cab: [.12, .62], roofW: .8, nose: .1, tail: .06, pods: 4, wing: 3, pat: 'split', flares: true, scoop: true }, liv: 4, num: 8,
    unlock: { champ: 'c4' }, desc: 'Modern all-wheel-drive hatch. Grip for days.' },
  { id: 'aurora', make: 'Valtari', model: 'Aurora R', cls: 5, year: 2016, drive: 'A', kw: 282, kg: 1170, top: 216, gears: 6, fw: .56, turbo: true,
    s: { L: 4.15, W: 1.84, wb: 2.6, cab: [.1, .6], roofW: .78, nose: .12, tail: .04, pods: 4, wing: 3, pat: 'sash', flares: true, scoop: true }, liv: 1, num: 10,
    unlock: { ev: 'c5e3' }, desc: 'The fastest thing in the valley, and it knows it.' },
];
const CAR = Object.fromEntries(CARS.map(c => [c.id, c]));
const CLASS_NAMES = { 1: 'Sixties', 2: 'Seventies', 3: 'Turbo Eighties', 4: 'Nineties', 5: 'Modern' };

// ---------- upgrades ----------
const PARTS = [
  { id: 'engine',  name: 'Engine',     desc: 'More power across the rev range.', fx: '+7% power' },
  { id: 'gearbox', name: 'Gearbox',    desc: 'Faster shifts, shorter ratios.', fx: 'Quicker shifts' },
  { id: 'tyres',   name: 'Tyre compound', desc: 'Stickier rubber on every surface.', fx: '+3.5% grip' },
  { id: 'susp',    name: 'Suspension', desc: 'Calmer over bumps, softer landings.', fx: 'Less bump steer' },
  { id: 'brakes',  name: 'Brakes',     desc: 'Bigger discs, later braking.', fx: '+15% brake force' },
  { id: 'weight',  name: 'Weight',     desc: 'Strip interior, thinner panels.', fx: '−3.5% mass' },
];
const PART_COST = [450, 1000, 1900];
const partCost = (cls, lvl) => Math.round(PART_COST[lvl] * (1 + .35 * (cls - 1)) / 10) * 10;

// ---------- rally types ----------
const TYPES = {
  stage:      { name: 'Stage',      desc: 'Point to point against the clock.' },
  hillclimb:  { name: 'Hillclimb',  desc: 'Switchbacks up the mountainside.' },
  rallycross: { name: 'Rallycross', desc: 'Three laps of a mixed-surface circuit.', laps: 3 },
  roam:       { name: 'Free Roam',  desc: 'No clock. Find the eight paper lanterns.' },
};

// ---------- career ----------
const CHAMPS = [
  { id: 'c1', name: 'Sixties Cup', cls: 1, events: [
    { name: 'Lakeshore Run',   biome: 'pines', type: 'stage',      surf: 'gravel', cond: 'golden',   len: 1500 },
    { name: 'Lighthouse Road', biome: 'coast', type: 'stage',      surf: 'tarmac', cond: 'day',      len: 1500 },
    { name: 'Clay Bowl Sprint',biome: 'clay',  type: 'rallycross', surf: 'mixed',  cond: 'day' },
    { name: 'Red Canyon',      biome: 'mesa',  type: 'stage',      surf: 'dirt',   cond: 'golden',   len: 1600 },
    { name: 'First Snow',      biome: 'frost', type: 'stage',      surf: 'snow',   cond: 'snowfall', len: 1500 },
  ]},
  { id: 'c2', name: 'Seventies Trophy', cls: 2, events: [
    { name: 'Copper Lane',     biome: 'ember', type: 'stage',      surf: 'mud',    cond: 'overcast', len: 1700 },
    { name: 'Cliffside Climb', biome: 'coast', type: 'hillclimb',  surf: 'tarmac', cond: 'dusk' },
    { name: 'Lantern Forest',  biome: 'pines', type: 'stage',      surf: 'gravel', cond: 'night',    len: 1800 },
    { name: 'Dune Sea',        biome: 'mesa',  type: 'stage',      surf: 'sand',   cond: 'day',      len: 1800 },
    { name: 'Evening Bowl',    biome: 'clay',  type: 'rallycross', surf: 'mixed',  cond: 'dusk' },
  ]},
  { id: 'c3', name: 'Turbo Eighties', cls: 3, events: [
    { name: 'Thousand Crests', biome: 'pines', type: 'stage',      surf: 'gravel', cond: 'day',      len: 2100, jumps: 5 },
    { name: 'Glass Lake',      biome: 'frost', type: 'stage',      surf: 'ice',    cond: 'night',    len: 1800 },
    { name: 'Hollow Mist',     biome: 'ember', type: 'stage',      surf: 'gravel', cond: 'fog',      len: 2000 },
    { name: 'Mesa Ascent',     biome: 'mesa',  type: 'hillclimb',  surf: 'dirt',   cond: 'golden' },
    { name: 'Storm Coast',     biome: 'coast', type: 'stage',      surf: 'tarmac', cond: 'rain',     len: 2000 },
  ]},
  { id: 'c4', name: 'Nineties Masters', cls: 4, events: [
    { name: 'Summit Pass',     biome: 'frost', type: 'hillclimb',  surf: 'snow',   cond: 'day' },
    { name: 'Rainbarrow',      biome: 'ember', type: 'stage',      surf: 'mud',    cond: 'rain',     len: 2100 },
    { name: 'Floodlit Bowl',   biome: 'clay',  type: 'rallycross', surf: 'mixed',  cond: 'night' },
    { name: 'Midsummer',       biome: 'pines', type: 'stage',      surf: 'gravel', cond: 'golden',   len: 2300, jumps: 4 },
    { name: 'Sandstorm Edge',  biome: 'mesa',  type: 'stage',      surf: 'sand',   cond: 'dusk',     len: 2100 },
  ]},
  { id: 'c5', name: 'Modern Grand Prix', cls: 5, events: [
    { name: 'Golden Switchbacks', biome: 'coast', type: 'hillclimb', surf: 'tarmac', cond: 'golden' },
    { name: 'Wet Pines',       biome: 'pines', type: 'stage',      surf: 'gravel', cond: 'rain',     len: 2300 },
    { name: 'Whiteout',        biome: 'frost', type: 'stage',      surf: 'snow',   cond: 'snowfall', len: 2200 },
    { name: 'Ghost Canyon',    biome: 'mesa',  type: 'stage',      surf: 'dirt',   cond: 'fog',      len: 2300 },
    { name: 'Last Light',      biome: 'ember', type: 'stage',      surf: 'gravel', cond: 'golden',   len: 2400, jumps: 4 },
  ]},
];
CHAMPS.forEach(c => c.events.forEach((e, i) => { e.id = c.id + 'e' + (i + 1); e.champ = c.id; e.cls = c.cls; e.idx = i; e.seed = strSeed(e.id + e.name); }));
const EVENTS = Object.fromEntries(CHAMPS.flatMap(c => c.events.map(e => [e.id, e])));
const BIOME_SURFS = { pines: ['gravel', 'tarmac', 'snow'], mesa: ['dirt', 'sand', 'gravel'], frost: ['snow', 'ice'], coast: ['tarmac', 'gravel'], ember: ['mud', 'gravel', 'dirt'], clay: ['mixed', 'tarmac', 'gravel'] };
const SURF_TYRE = { tarmac: 'tarmac', snow: 'snow', ice: 'snow' };
const MEDAL_NAMES = ['Finished', 'Bronze', 'Silver', 'Gold'];
const MEDAL_PAY = [250, 550, 850, 1300];
