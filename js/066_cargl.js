// ---------- cars on the GPU: the Blender-built bodies, lit and painted in a small offscreen WebGL pass ----------
// Each car is rendered with the same camera matrix as the ground into an offscreen canvas, then copied onto the 2D
// layer at its place in the depth-sorted list, so trees and spectators still pass correctly in front and behind.
const CGL = { ok: false, cv: null, gl: null, P: null, mesh: {}, wheel: null, scratch: null };
const MAT_N = 12;

const VS_CAR = `#version 300 es
in vec3 aP; in vec3 aN; in float aM;
uniform mat4 uVP, uM;
uniform vec4 uDent[8]; uniform int uND;
out vec3 vN; out vec3 vL; out vec3 vW; flat out int vM;
void main() {
  vec3 p = aP;
  // dents: panels near an impact are pushed in toward the middle of the car
  for (int i = 0; i < 8; i++) {
    if (i >= uND) break;
    vec3 d = p - uDent[i].xyz; float k = 1.0 - smoothstep(0.0, .8, length(d * vec3(1., 1., 1.6)));
    vec2 inward = -normalize(uDent[i].xy + vec2(1e-4));
    p.xy += inward * uDent[i].w * k * k; p.z -= uDent[i].w * .35 * k * k;
  }
  vec4 w = uM * vec4(p, 1.0); gl_Position = uVP * w; vN = mat3(uM) * aN; vL = aP; vW = w.xyz; vM = int(aM + .5);
}`;

const FS_CAR = `#version 300 es
precision highp float;
in vec3 vN; in vec3 vL; in vec3 vW; flat in int vM;
uniform vec3 uSun, uSunC, uSky, uGround, uEye, uBase, uStripe, uAccent, uHaze;
uniform float uDark, uBrake, uRev, uHead, uHL, uHW, uHazeK, uSunK, uDented;
uniform vec2 uHLok, uTLok;
uniform int uPat;
out vec4 o;
vec3 livery(vec3 p) {
  float u = p.x / uHL, v = p.y / uHW, av = abs(v);
  if (uPat == 0) { if (abs(p.y) > .13 && abs(p.y) < .36) return uStripe; }                    // twin stripes
  else if (uPat == 1) { if (abs(p.x) < .1) return uAccent; if (abs(p.x) < .36) return uStripe; } // band
  else if (uPat == 2) { float l = -.45 - .25 * v, r = .2 - .25 * v; if (u > l && u < r) return uStripe; if (u >= r && u < r + .17) return uAccent; } // sash
  else if (uPat == 3) { float a = .1 + .6 * av, b = .4 + .6 * av; if (u > a && u < b) return uStripe; }  // chevron
  else if (uPat == 4) { if (u > .05 && u < .19) return uAccent; if (u > .1) return uStripe; }   // split
  return uBase;
}
void main() {
  vec3 V = normalize(uEye - vW);
  // flat facets from the deformed surface itself, so dents catch the light
  vec3 n = uDented > .5 && vM != 1 ? normalize(cross(dFdx(vW), dFdy(vW))) : normalize(vN);
  if (dot(n, V) < 0.0) n = -n;
  vec3 base; float gloss = .35, emit = 0.0; vec3 ecol = vec3(0);
  if (vM == 0) base = livery(vL);
  else if (vM == 1) { base = vec3(.09, .12, .17); gloss = 1.0; }
  else if (vM == 2) { base = vec3(.15, .14, .17); gloss = .15; }
  else if (vM == 3) { float ok = vL.y > 0. ? uHLok.x : uHLok.y; base = mix(vec3(.2, .2, .22), vec3(.96, .93, .82), ok); emit = (.25 + .9 * uHead) * ok; ecol = vec3(1., .95, .8); }
  else if (vM == 4) { float ok = vL.y > 0. ? uTLok.x : uTLok.y; base = mix(vec3(.2, .08, .08), vec3(.62, .1, .08), ok); emit = (.25 + 1.2 * uBrake) * ok; ecol = vec3(1., .2, .1); }
  else if (vM == 5) { base = vec3(.1, .09, .11); gloss = .1; }
  else if (vM == 6) { base = vec3(.72, .7, .66); gloss = .6; }
  else if (vM == 7) { base = vec3(.98, .9, .62); emit = .2 + .8 * uHead; ecol = vec3(1., .92, .7); }
  else if (vM == 8) base = uAccent;
  else if (vM == 9) { base = vec3(.09, .085, .1); gloss = .05; }
  else if (vM == 10) base = vec3(.95, .93, .88);
  else base = uStripe;
  // sun, a sky/ground hemisphere fill, a soft rim, and a clear-coat glint
  float ndl = max(dot(n, uSun), 0.0);
  vec3 amb = mix(uGround, uSky, n.z * .5 + .5);
  vec3 col = base * (amb * (.62 - .18 * uDark) + uSunC * ndl * uSunK);
  vec3 H = normalize(uSun + V);
  float sp = pow(max(dot(n, H), 0.0), 40.0) * gloss * uSunK;
  float fr = pow(1.0 - max(dot(n, V), 0.0), 3.0);
  col += uSunC * sp * .55 + uSky * fr * (vM == 1 ? .3 : .12 * gloss);
  if (vM == 1) col += uSky * .08 * (n.z * .5 + .5);
  col = mix(col, uHaze, uHazeK);
  col += ecol * emit;
  o = vec4(col, 1.0);
}`;

function initCarGL() {
  try {
    const cv = document.createElement('canvas'); cv.width = 4; cv.height = 4;
    const gl = cv.getContext('webgl2', { antialias: true, alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: false });
    if (!gl) return false;
    CGL.cv = cv; CGL.gl = gl; CGL.P = glProgram(gl, VS_CAR, FS_CAR);
    cv.addEventListener('webglcontextlost', e => { e.preventDefault(); CGL.ok = false; }, false);
    CGL.ok = true; return true;
  } catch (e) { console.warn('car renderer unavailable', e); CGL.ok = false; return false; }
}

function b64bytes(s) { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
// unpack one mesh into flat-shaded triangles: position, face normal, material
function cglMesh(key) {
  if (CGL.mesh[key]) return CGL.mesh[key];
  const src = CAR_MESH[key]; if (!src) return null;
  const gl = CGL.gl, pb = b64bytes(src.p), ib = b64bytes(src.i), mats = b64bytes(src.m);
  const pos = new Int16Array(pb.buffer, 0, pb.length >> 1), idx = new Uint16Array(ib.buffer, 0, ib.length >> 1);
  const nt = mats.length, data = new Float32Array(nt * 3 * 7);
  if (key === '_wheel') for (let t = 0; t < nt; t++) if (mats[t] !== 6) mats[t] = 9;
  let o = 0;
  for (let t = 0; t < nt; t++) {
    const a = idx[t * 3] * 3, b = idx[t * 3 + 1] * 3, c = idx[t * 3 + 2] * 3;
    const ax = pos[a] / 1000, ay = pos[a + 1] / 1000, az = pos[a + 2] / 1000, bx = pos[b] / 1000, by = pos[b + 1] / 1000, bz = pos[b + 2] / 1000, cx = pos[c] / 1000, cy = pos[c + 1] / 1000, cz = pos[c + 2] / 1000;
    let nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay), ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az), nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    for (const [x, y, z] of [[ax, ay, az], [bx, by, bz], [cx, cy, cz]]) { data[o++] = x; data[o++] = y; data[o++] = z; data[o++] = nx; data[o++] = ny; data[o++] = nz; data[o++] = mats[t]; }
  }
  const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
  const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  const P = CGL.P;
  for (const [nm, sz, off] of [['aP', 3, 0], ['aN', 3, 3], ['aM', 1, 6]]) { const loc = P.a[nm]; if (loc >= 0) { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, sz, gl.FLOAT, false, 28, off * 4); } }
  gl.bindVertexArray(null);
  return (CGL.mesh[key] = { vao, n: nt * 3, meta: src.meta });
}

const PAT_ID = { stripes: 0, band: 1, sash: 2, chevron: 3, split: 4 };
const rgb01 = h => hexRGB(h).map(v => v / 255);
// column-major 4x4 helpers
function m4(r00, r01, r02, tx, r10, r11, r12, ty, r20, r21, r22, tz) { return new Float32Array([r00, r10, r20, 0, r01, r11, r21, 0, r02, r12, r22, 0, tx, ty, tz, 1]); }
function m4mul(a, b) { const o = new Float32Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; }

// scene lighting for the car shader, taken from the stage's biome and conditions
function cglLights(night, rx) {
  const B = S.B, C = S.C, el = Math.atan(1 / Math.max(.25, C.len || .6)), ld = S.lightDir || [.6, .6];
  const L = Math.hypot(ld[0], ld[1]) || 1, ce = Math.cos(el);
  return {
    sun: [ld[0] / L * ce, ld[1] / L * ce, Math.sin(el)],
    sunC: C.night ? [.35, .4, .6] : rgb01(mixHex(B.light, '#ffffff', .2)),
    sunK: C.night ? .25 : clamp(.35 + (C.shA || .3) * 1.6, .5, 1.15) * (1 - C.dark * .6),
    sky: rgb01(C.night ? '#2a3256' : mixHex(B.sky[3], '#ffffff', .25)),
    ground: rgb01(C.night ? '#141626' : mixHex(B.ground[3] || B.ground[0], '#000000', .25)),
    haze: rgb01(B.haze), dark: C.dark,
  };
}

// draw one car into the offscreen canvas; returns the screen rectangle (CSS px) that holds it, or null
function cglDrawCar(car, spec, liv, opts) {
  const gl = CGL.gl, mesh = cglMesh(spec.id), wheel = cglMesh('_wheel');
  if (!mesh || !wheel) return null;
  const dpr = Math.min(R.dpr, 1.5), W = Math.round(R.W * dpr), H = Math.round(R.H * dpr);
  if (CGL.cv.width !== W || CGL.cv.height !== H) { CGL.cv.width = W; CGL.cv.height = H; }
  // screen box from the car's corners
  const hl = spec.s.L / 2 + .5, hw = spec.s.W / 2 + .4, ch = Math.cos(car.h), sh = Math.sin(car.h), z0 = car.z || 0;
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, dmin = 1e9;
  for (const u of [-hl, hl]) for (const v of [-hw, hw]) for (const z of [0, 1.9]) {
    proj(car.x + ch * u - sh * v, car.y + sh * u + ch * v, z0 + z, _p);
    x0 = Math.min(x0, _p[0]); x1 = Math.max(x1, _p[0]); y0 = Math.min(y0, _p[1]); y1 = Math.max(y1, _p[1]); dmin = Math.min(dmin, _p[3]);
  }
  x0 = Math.floor(clamp(x0 - 4, 0, R.W)); y0 = Math.floor(clamp(y0 - 4, 0, R.H)); x1 = Math.ceil(clamp(x1 + 4, 0, R.W)); y1 = Math.ceil(clamp(y1 + 4, 0, R.H));
  if (x1 - x0 < 2 || y1 - y0 < 2 || dmin < 1) return null;
  const sx = Math.floor(x0 * dpr), sy = Math.floor(y0 * dpr), sw = Math.ceil((x1 - x0) * dpr), shh = Math.ceil((y1 - y0) * dpr);
  gl.viewport(0, 0, W, H);
  gl.enable(gl.SCISSOR_TEST); gl.scissor(sx, H - sy - shh, sw, shh);
  gl.clearColor(0, 0, 0, 0); gl.clearDepth(1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.disable(gl.CULL_FACE); gl.disable(gl.BLEND);
  const P = CGL.P; gl.useProgram(P.p);
  gl.uniformMatrix4fv(P.u.uVP, false, glMatrix());
  if (CGL.ltS !== S) { CGL.lt = cglLights(); CGL.ltS = S; }
  const Lt = CGL.lt;
  const Lv = LIVERIES[liv] || LIVERIES[0];
  gl.uniform3fv(P.u.uSun, Lt.sun); gl.uniform3fv(P.u.uSunC, Lt.sunC); gl.uniform1f(P.u.uSunK, Lt.sunK);
  gl.uniform3fv(P.u.uSky, Lt.sky); gl.uniform3fv(P.u.uGround, Lt.ground); gl.uniform3fv(P.u.uHaze, Lt.haze);
  gl.uniform1f(P.u.uDark, Lt.dark); gl.uniform1f(P.u.uHazeK, S.C.weather === 'fog' ? .22 : S.C.weather ? .08 : .03);
  gl.uniform3f(P.u.uEye, cam.cx, cam.cy, cam.hc);
  gl.uniform3fv(P.u.uBase, rgb01(Lv.base)); gl.uniform3fv(P.u.uStripe, rgb01(Lv.stripe)); gl.uniform3fv(P.u.uAccent, rgb01(Lv.accent));
  gl.uniform1i(P.u.uPat, PAT_ID[spec.s.pat] ?? 0); gl.uniform1f(P.u.uHL, spec.s.L / 2); gl.uniform1f(P.u.uHW, spec.s.W / 2);
  const night = clamp(Math.max(S.C.dark * 1.2, S.C.weather ? .4 : 0), 0, 1);
  gl.uniform1f(P.u.uBrake, (car.brk > .2 || car.hand) && !opts.ghost ? 1 : 0); gl.uniform1f(P.u.uHead, night);
  // damage: dents in the shell, broken lamps, and a corner that sags on a bent suspension
  const D = car.dm || { sus: [0, 0, 0, 0], hl: [0, 0], tl: [0, 0] }, dents = car.dents || [];
  const dv = new Float32Array(32); dents.slice(-8).forEach((d, i) => dv.set([d.u, d.v, d.z, d.s], i * 4));
  gl.uniform4fv(P.u.uDent, dv); gl.uniform1i(P.u.uND, Math.min(8, dents.length)); gl.uniform1f(P.u.uDented, dents.length ? 1 : 0);
  gl.uniform2f(P.u.uHLok, 1 - D.hl[0], 1 - D.hl[1]); gl.uniform2f(P.u.uTLok, 1 - D.tl[0], 1 - D.tl[1]);
  const sagR = ((D.sus[1] + D.sus[3]) - (D.sus[0] + D.sus[2])) * .03, sagP = ((D.sus[0] + D.sus[1]) - (D.sus[2] + D.sus[3])) * .025;
  // body: heading, then pitch and roll from the sprung weight, lifted by suspension heave
  const roll = clamp(car.roll || 0, -1.4, 1.4) * .045 + sagR, pitch = -clamp(car.pitch || 0, -1.4, 1.4) * .024 + sagP, Zb = z0 + clamp((car.heave || 0) * .3, -.12, .06) - Math.max(...D.sus) * .04;
  const cr = Math.cos(roll), sr = Math.sin(roll), cpi = Math.cos(pitch), spi = Math.sin(pitch);
  // local rotation = Ry(pitch) * Rx(roll)
  const Rl = m4(cpi, spi * sr, spi * cr, 0, 0, cr, -sr, 0, -spi, cpi * sr, cpi * cr, 0);
  const Wm = m4(ch, -sh, 0, car.x, sh, ch, 0, car.y, 0, 0, 1, Zb);
  gl.uniformMatrix4fv(P.u.uM, false, m4mul(Wm, Rl));
  gl.bindVertexArray(mesh.vao); gl.drawArrays(gl.TRIANGLES, 0, mesh.n);
  // wheels sit on the road, steer at the front, and spin with the distance covered
  const tw = spec.s.W * .43, wx = mesh.meta.wx, spin = (car.odo || 0) / .31, cs = Math.cos(spin), sn = Math.sin(spin);
  const Wg = m4(ch, -sh, 0, car.x, sh, ch, 0, car.y, 0, 0, 1, z0);
  gl.bindVertexArray(wheel.vao); gl.uniform1i(P.u.uND, 0); gl.uniform1f(P.u.uDented, 0);
  for (let i = 0; i < 4; i++) {
    const u = wx[i < 2 ? 0 : 1], v = i % 2 ? -tw : tw, st = (i < 2 ? car.delta || 0 : 0) + (D.sus[i] || 0) * .12 * (i % 2 ? -1 : 1), c2 = Math.cos(st), s2 = Math.sin(st);
    // a broken corner leans its wheel over (camber)
    const cb = (D.sus[i] || 0) * .3 * (i % 2 ? 1 : -1), cc = Math.cos(cb), sc2 = Math.sin(cb);
    const Wl = m4mul(Wg, m4mul(m4(c2, -s2, 0, u, s2, c2, 0, v, 0, 0, 1, .31), m4mul(m4(1, 0, 0, 0, 0, cc, -sc2, 0, 0, sc2, cc, 0), m4(cs, 0, sn, 0, 0, 1, 0, 0, -sn, 0, cs, 0))));
    gl.uniformMatrix4fv(P.u.uM, false, Wl); gl.drawArrays(gl.TRIANGLES, 0, wheel.n);
  }
  gl.bindVertexArray(null); gl.disable(gl.SCISSOR_TEST);
  return { sx, sy, sw, sh: shh, dx: sx / dpr, dy: sy / dpr, dw: sw / dpr, dh: shh / dpr };
}

function drawCarGL(ctx, car, spec, liv, opts) {
  const r = cglDrawCar(car, spec, liv, opts);
  if (!r) return false;
  ctx.save(); xreset(ctx); ctx.globalAlpha = (opts.alpha ?? 1) * (ctx.globalAlpha || 1);
  ctx.drawImage(CGL.cv, r.sx, r.sy, r.sw, r.sh, r.dx, r.dy, r.dw, r.dh);
  // the door number on the roof roundel, painted through a local affine fit of the roof plane
  const mm = CAR_MESH[spec.id] && CAR_MESH[spec.id].meta;
  if (mm && cam.ppm > 6) {
    const ch = Math.cos(car.h), sh = Math.sin(car.h), z = (car.z || 0) + mm.roof + .02, P3 = (u, v) => proj(car.x + ch * u - sh * v, car.y + sh * u + ch * v, z, [0, 0, 1, 1]);
    const o = P3(mm.roofU, 0), a = P3(mm.roofU + .5, 0), b = P3(mm.roofU, .5), d = R.dpr;
    const ax = (a[0] - o[0]) * 2, ay = (a[1] - o[1]) * 2, bx = (b[0] - o[0]) * 2, by = (b[1] - o[1]) * 2;
    ctx.setTransform(ax * d, ay * d, bx * d, by * d, o[0] * d, o[1] * d);
    ctx.rotate(Math.PI / 2); ctx.scale(.02, .02);
    ctx.fillStyle = '#25202c'; ctx.font = '600 21px Jost, Futura, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(opts.num ?? spec.num), 0, 1.5);
  }
  ctx.restore();
  return true;
}

// garage and results previews: a three-quarter studio shot of the real model
function cglPreview(canvas, carId, liv, bg) {
  if (!CGL.ok) return false;
  const spec = CAR[carId], mesh = cglMesh(carId), wheel = cglMesh('_wheel'); if (!mesh || !wheel) return false;
  const w = canvas.clientWidth || 300, h = canvas.clientHeight || 190, d = Math.min(2, devicePixelRatio || 1), W = Math.round(w * d), H = Math.round(h * d);
  const gl = CGL.gl;
  if (CGL.cv.width < W || CGL.cv.height < H) { CGL.cv.width = Math.max(CGL.cv.width, W); CGL.cv.height = Math.max(CGL.cv.height, H); }
  const CH = CGL.cv.height;
  gl.viewport(0, CH - H, W, H); gl.enable(gl.SCISSOR_TEST); gl.scissor(0, CH - H, W, H);
  gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); gl.enable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
  // camera orbiting at three-quarter front, slightly above
  const ang = 2.45, el = .38, dist = spec.s.L * 2.05 + 1.6, tgt = [0, 0, .6];
  const eye = [Math.cos(ang) * Math.cos(el) * dist * -1, Math.sin(ang) * Math.cos(el) * dist, Math.sin(el) * dist + .6];
  const f = [tgt[0] - eye[0], tgt[1] - eye[1], tgt[2] - eye[2]], fl = Math.hypot(...f); f[0] /= fl; f[1] /= fl; f[2] /= fl;
  let r = [f[1], -f[0], 0]; const rl = Math.hypot(...r); r = r.map(x => x / rl);
  const up = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
  const view = new Float32Array([r[0], up[0], -f[0], 0, r[1], up[1], -f[1], 0, r[2], up[2], -f[2], 0,
    -(r[0] * eye[0] + r[1] * eye[1] + r[2] * eye[2]), -(up[0] * eye[0] + up[1] * eye[1] + up[2] * eye[2]), (f[0] * eye[0] + f[1] * eye[1] + f[2] * eye[2]), 1]);
  const fov = .5, asp = W / H, n = .5, fa = 60, t = 1 / Math.tan(fov / 2);
  const projM = new Float32Array([t / asp, 0, 0, 0, 0, t, 0, 0, 0, 0, (fa + n) / (n - fa), -1, 0, 0, 2 * fa * n / (n - fa), 0]);
  const P = CGL.P; gl.useProgram(P.p); gl.uniformMatrix4fv(P.u.uVP, false, m4mul(projM, view));
  const Lv = LIVERIES[liv] || LIVERIES[0], sky = bg ? mixHex(bg, '#ffffff', .45) : '#b8b4d0';
  gl.uniform3fv(P.u.uSun, (() => { const s = [-.35, .55, .75], l = Math.hypot(...s); return s.map(x => x / l); })());
  gl.uniform3fv(P.u.uSunC, rgb01('#fff0dc')); gl.uniform1f(P.u.uSunK, .95); gl.uniform3fv(P.u.uSky, rgb01(sky)); gl.uniform3fv(P.u.uGround, rgb01(bg ? shade(bg, -.3) : '#3a3450'));
  gl.uniform3fv(P.u.uHaze, rgb01(sky)); gl.uniform1f(P.u.uHazeK, 0); gl.uniform1f(P.u.uDark, 0); gl.uniform3f(P.u.uEye, eye[0], eye[1], eye[2]);
  gl.uniform3fv(P.u.uBase, rgb01(Lv.base)); gl.uniform3fv(P.u.uStripe, rgb01(Lv.stripe)); gl.uniform3fv(P.u.uAccent, rgb01(Lv.accent));
  gl.uniform1i(P.u.uPat, PAT_ID[spec.s.pat] ?? 0); gl.uniform1f(P.u.uHL, spec.s.L / 2); gl.uniform1f(P.u.uHW, spec.s.W / 2);
  gl.uniform1f(P.u.uBrake, 0); gl.uniform1f(P.u.uHead, .15);
  gl.uniform1i(P.u.uND, 0); gl.uniform1f(P.u.uDented, 0); gl.uniform2f(P.u.uHLok, 1, 1); gl.uniform2f(P.u.uTLok, 1, 1);
  gl.uniformMatrix4fv(P.u.uM, false, m4(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0));
  gl.bindVertexArray(mesh.vao); gl.drawArrays(gl.TRIANGLES, 0, mesh.n);
  gl.bindVertexArray(wheel.vao);
  const tw = spec.s.W * .43, wx = mesh.meta.wx;
  for (let i = 0; i < 4; i++) { const st = i < 2 ? .3 : 0, c2 = Math.cos(st), s2 = Math.sin(st); gl.uniformMatrix4fv(P.u.uM, false, m4(c2, -s2, 0, wx[i < 2 ? 0 : 1], s2, c2, 0, i % 2 ? -tw : tw, 0, 0, 1, .31)); gl.drawArrays(gl.TRIANGLES, 0, wheel.n); }
  gl.bindVertexArray(null); gl.disable(gl.SCISSOR_TEST);
  canvas.width = W; canvas.height = H;
  const x = canvas.getContext('2d');
  const g = x.createRadialGradient(W / 2, H * .55, 10, W / 2, H * .55, Math.max(W, H) * .7);
  g.addColorStop(0, bg ? mixHex(bg, '#ffffff', .15) : '#3a3450'); g.addColorStop(1, bg ? shade(bg, -.35) : '#191726');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  x.globalAlpha = .5; x.drawImage(softSprite('#000000', .6), W * .14, H * .58, W * .72, H * .3); x.globalAlpha = 1;
  x.drawImage(CGL.cv, 0, 0, W, H, 0, 0, W, H);
  return true;
}
