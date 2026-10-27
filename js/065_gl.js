// ---------- GPU ground renderer (WebGL2) ----------
// Terrain, road, water, ground decor, skid marks, decals and shadows are drawn with real perspective and mipmapped
// textures here; standing objects, particles and post effects stay on the 2D canvas layered above.
const GL = { ok: false, gl: null, cv: null, P: {}, T: {}, B: {}, scene: null, lost: false };

const GLSL_LIGHT = `
uniform float uDark; uniform vec3 uAmb;
uniform vec4 uL[16]; uniform vec3 uLc[16]; uniform int uLn;
uniform vec4 uHead; uniform float uHeadOn;
vec3 lit(vec3 c, vec2 p) {
  if (uDark <= 0.001) return c;
  vec3 L = uAmb;
  vec2 d = p - uHead.xy; float dist = length(d);
  vec2 dir = vec2(cos(uHead.z), sin(uHead.z));
  float ca = dot(d / max(dist, .001), dir);
  float cone = smoothstep(.82, .97, ca) * (1. - smoothstep(uHead.w * .35, uHead.w, dist)) * smoothstep(.3, 2.5, dist);
  L += vec3(1., .92, .78) * cone * 1.9 * uHeadOn;
  for (int i = 0; i < 16; i++) { if (i >= uLn) break; vec2 q = p - uL[i].xy; float f = max(0., 1. - length(q) / uL[i].z); L += uLc[i] * f * f * uL[i].w; }
  return mix(c, c * L, uDark);
}`;

const VS_GROUND = `#version 300 es
in vec2 aPos; uniform mat4 uM; out vec2 vW;
void main() { vW = aPos; gl_Position = uM * vec4(aPos, 0., 1.); }`;

const FS_TERRAIN = `#version 300 es
precision highp float;
in vec2 vW; out vec4 o;
uniform sampler2D uBake, uDetail, uGround, uWater;
uniform vec2 uWorld, uWind; uniform float uTime, uFrozen, uCloud, uGA, uGS;
uniform vec3 uWaterS, uWaterD, uFoam, uSky, uSunC;
${GLSL_LIGHT}
void main() {
  vec2 uv = vW / uWorld;
  vec3 c = texture(uBake, uv).rgb;
  vec4 d = texture(uDetail, vW / 5.3), d2 = texture(uDetail, vW / 21. + .31);
  c *= .86 + .2 * d.r + .1 * d2.g;
  vec4 g = texture(uGround, vW / uGS), g2 = texture(uGround, vW.yx / (uGS * 2.7) + .5);
  c *= mix(1., g.r * 2., g.a * uGA) * mix(1., g2.r * 2., g2.a * uGA * .5);
  float e = texture(uWater, uv).r, wd = (e - .5) * 2.;
  if (wd > 0. && uFrozen < .5) {
    vec2 fl = uWind * uTime * .06;
    float n1 = texture(uDetail, vW / 8. + fl).r, n2 = texture(uDetail, vW / 3.7 - fl * 1.6).r;
    vec3 wc = mix(uWaterS, uWaterD, smoothstep(0., .7, wd));
    wc += uSky * (.1 + .12 * (n1 + n2 - 1.));
    wc += uSunC * pow(max(0., n1 * n2 * 2. - .62), 3.) * 3.;
    float shore = 1. - smoothstep(.0, .05, wd);
    wc = mix(wc, uFoam, shore * (.45 + .35 * sin(uTime * 1.3 + n1 * 7.)));
    c = mix(c, wc, smoothstep(0., .025, wd));
  }
  if (uCloud > 0.) { float cl = texture(uDetail, vW / 300. + uWind * uTime * .0035).b; c *= 1. - uCloud * smoothstep(.42, .7, cl); }
  o = vec4(lit(c, vW), 1.);
}`;

const VS_ROAD = `#version 300 es
in vec2 aPos; in vec2 aUV; in float aSurf; in float aMask; in vec2 aN;
uniform mat4 uM; out vec2 vW; out vec2 vUV; flat out int vSurf; out float vMask; out vec2 vN;
void main() { vW = aPos; vUV = aUV; vSurf = int(aSurf + .5); vMask = aMask; vN = aN; gl_Position = uM * vec4(aPos, 0., 1.); }`;

// the jump ramps: the same road surface, lifted off the flat ground
const VS_RAMP = `#version 300 es
in vec2 aPos; in vec2 aUV; in float aSurf; in float aMask; in vec2 aN; in float aZ;
uniform mat4 uM; out vec2 vW; out vec2 vUV; flat out int vSurf; out float vMask; out vec2 vN;
void main() { vW = aPos; vUV = aUV; vSurf = int(aSurf + .5); vMask = aMask; vN = aN; gl_Position = uM * vec4(aPos, aZ, 1.); }`;

const FS_ROAD = `#version 300 es
precision highp float;
in vec2 vW; in vec2 vUV; flat in int vSurf; in float vMask; in vec2 vN; out vec4 o;
uniform sampler2D uT0, uT1, uT2, uT3, uT4, uT5, uT6, uDetail;
uniform vec3 uTint[7]; uniform vec3 uShoulder;
uniform float uHW, uRX, uWet, uStart, uFinish, uTime;
uniform float uJ[6]; uniform int uNJ; uniform vec2 uSun; uniform vec3 uSky;
${GLSL_LIGHT}
vec3 tex(int k, vec2 t) {
  if (k == 0) return texture(uT0, t).rgb; if (k == 1) return texture(uT1, t).rgb; if (k == 2) return texture(uT2, t).rgb;
  if (k == 3) return texture(uT3, t).rgb; if (k == 4) return texture(uT4, t).rgb; if (k == 5) return texture(uT5, t).rgb; return texture(uT6, t).rgb;
}
void main() {
  float u = vUV.x, s = vUV.y, au = abs(u);
  int k = vSurf;
  float dn = texture(uDetail, vW / 2.3).r, dm = texture(uDetail, vW / 9.).g;
  vec2 tuv = vec2(u, s) / 3.6;
  vec3 c = uTint[k] * tex(k, tuv) * 2.;
  bool tarmac = k == 0, snowy = k >= 5;
  // wheel ruts, the lighter crown and loose stones near the edges
  if (!tarmac) {
    float r1 = exp(-pow((au - uHW * .46) / .45, 2.));
    c *= 1. - (snowy ? .16 : .24) * r1 * (.7 + .6 * dn);
    if (snowy) c = mix(c, c * vec3(.86, .9, 1.02), r1 * .6);
    c *= 1. + .06 * exp(-pow(u / .7, 2.));
    c = mix(c, c * 1.07 + .02, smoothstep(uHW * .72, uHW, au) * .5 * dn);
  } else {
    float wear = smoothstep(.35, .65, dm);
    if (uRX < .5) {
      float el = 1. - smoothstep(.05, .09, abs(au - (uHW - .42)));
      float cl = (1. - smoothstep(.05, .085, au)) * step(fract(s / 9.), .45);
      c = mix(c, vec3(.94, .92, .86) * (.85 + .15 * dn), max(el, cl) * (.9 - .5 * wear));
      c *= 1. - .07 * exp(-pow((au - uHW * .46) / .5, 2.)); // darker rubbered-in line
    } else {
      float kb = smoothstep(uHW - .7, uHW - .55, au);
      c = mix(c, mod(floor(s / 1.6), 2.) < 1. ? vec3(.86, .26, .22) : vec3(.95, .93, .9), kb);
    }
  }
  if (uWet > 0. && tarmac) { c *= .72; c += uSky * .1 * (1. - abs(vN.x * .3)) + vec3(.03) * pow(dn, 4.); }
  // crests: a sunlit lip and a shaded landing
  for (int j = 0; j < 6; j++) { if (j >= uNJ) break; float dd = s - uJ[j]; c *= 1. + .22 * exp(-pow((dd + 2.) / 1.3, 2.)) - .26 * exp(-pow((dd - 1.8) / 1.1, 2.)); }
  // start and finish chequers
  for (int q = 0; q < 2; q++) { float ls = q == 0 ? uStart : uFinish; if (ls < 0.) continue; float dd = s - ls; if (abs(dd) < 1.2) { float ch = mod(floor(u / .8) + floor((dd + 1.2) / 1.2), 2.); c = mix(c, ch < 1. ? vec3(.95, .93, .88) : vec3(.12, .11, .15), .92); } }
  // soft, irregular edge and the shoulder beyond it
  float edge = uHW + (dn - .5) * (tarmac ? .14 : .8);
  float ra = 1. - smoothstep(edge - .22, edge + .22, au);
  vec3 sc = uShoulder * tex(snowy ? 5 : 1, tuv * 1.3) * 2.;
  float sa = (1. - smoothstep(uHW, uHW + 2.5, au + (dm - .5) * 1.4)) * (snowy ? .95 : .7);
  if (snowy) { float bank = exp(-pow((au - uHW - 1.1) / .8, 2.)); sc = mix(sc, vec3(.98, .99, 1.), bank) * (1. + .14 * bank * sign(u) * dot(vN, -uSun)); sa = max(sa, bank * .95); }
  vec3 col = mix(sc, c, ra);
  float a = max(ra, sa) * vMask;
  o = vec4(lit(col, vW), a);
}`;

const VS_DECOR = `#version 300 es
in vec2 aBase; in vec2 aCorner; in float aSize; in float aTile; in vec3 aCol; in float aFlat; in float aRot;
uniform mat4 uM; uniform vec2 uRight; uniform float uTiles, uTime; uniform vec2 uWind;
out vec2 vUV; out vec3 vC; out vec2 vW;
void main() {
  vec3 p;
  if (aFlat > .5) { float c = cos(aRot), s = sin(aRot); vec2 q = vec2(aCorner.x, aCorner.y * 2. - 1.) * aSize * .5; p = vec3(aBase + vec2(c * q.x - s * q.y, s * q.x + c * q.y), .02); }
  else { float sway = sin(uTime * 1.7 + aBase.x * .3 + aBase.y * .2) * .08 * aCorner.y; p = vec3(aBase + uRight * (aCorner.x * aSize * .5 + sway * aSize) + uWind * .01 * aCorner.y, aCorner.y * aSize * .8); }
  vUV = vec2((aTile + aCorner.x * .5 + .5) / uTiles, 1. - aCorner.y); vC = aCol; vW = p.xy;
  gl_Position = uM * vec4(p, 1.);
}`;
const FS_DECOR = `#version 300 es
precision highp float;
in vec2 vUV; in vec3 vC; in vec2 vW; out vec4 o; uniform sampler2D uAtlas;
${GLSL_LIGHT}
void main() { vec4 t = texture(uAtlas, vUV); if (t.a < .35) discard; o = vec4(lit(vC * t.rgb * 1.9, vW), 1.); }`;

const VS_SOFT = `#version 300 es
in vec2 aPos; in vec2 aLoc; in vec4 aCol; in vec2 aP;
uniform mat4 uM; out vec2 vL; out vec4 vC; out vec2 vP; out vec2 vW;
void main() { vL = aLoc; vC = aCol; vP = aP; vW = aPos; gl_Position = uM * vec4(aPos, 0., 1.); }`;
const FS_SOFT = `#version 300 es
precision highp float;
in vec2 vL; in vec4 vC; in vec2 vP; in vec2 vW; out vec4 o; uniform float uMask;
${GLSL_LIGHT}
void main() {
  float a;
  if (vP.y < .5) { float r = length(vL); a = 1. - smoothstep(vP.x, 1., r); }
  else if (vP.y < 1.5) { vec2 q = abs(vL); a = (1. - smoothstep(vP.x, 1., q.x)) * (1. - smoothstep(vP.x, 1., q.y)); }
  else { float r = length(vL); a = smoothstep(.1, 0., abs(r - .82)); }
  a *= vC.a;
  if (uMask > .5) o = vec4(a, 0., 0., 1.); else o = vec4(lit(vC.rgb, vW), a);
}`;

const VS_SKID = `#version 300 es
in vec2 aPos; in float aSide; in vec4 aCol; uniform mat4 uM; out float vS; out vec4 vC; out vec2 vW;
void main() { vS = aSide; vC = aCol; vW = aPos; gl_Position = uM * vec4(aPos, 0., 1.); }`;
const FS_SKID = `#version 300 es
precision highp float;
in float vS; in vec4 vC; in vec2 vW; out vec4 o; uniform sampler2D uDetail;
void main() { float n = texture(uDetail, vW / 1.3).r; o = vec4(vC.rgb, vC.a * (1. - vS * vS) * (.6 + .6 * n)); }`;

const VS_FULL = `#version 300 es
in vec2 aPos; out vec2 vT; void main() { vT = aPos * .5 + .5; gl_Position = vec4(aPos, 0., 1.); }`;
const FS_SHADE = `#version 300 es
precision highp float;
in vec2 vT; out vec4 o; uniform sampler2D uMaskT; uniform vec3 uShade; uniform float uA;
void main() { float m = texture(uMaskT, vT).r; o = vec4(mix(vec3(1.), uShade, clamp(m, 0., 1.) * uA), 1.); }`;

function glProgram(gl, vs, fs) {
  const mk = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  const p = gl.createProgram(); gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); u[info.name.replace('[0]', '')] = gl.getUniformLocation(p, info.name); }
  const a = {}, na = gl.getProgramParameter(p, gl.ACTIVE_ATTRIBUTES);
  for (let i = 0; i < na; i++) { const info = gl.getActiveAttrib(p, i); a[info.name] = gl.getAttribLocation(p, info.name); }
  return { p, u, a };
}

function initGL() {
  const cv = document.getElementById('gl'); GL.cv = cv;
  let gl = null;
  try { gl = cv.getContext('webgl2', { antialias: true, alpha: false, premultipliedAlpha: false, powerPreference: 'high-performance' }); } catch (e) { gl = null; }
  if (!gl) return false;
  GL.gl = gl; GL.aniso = gl.getExtension('EXT_texture_filter_anisotropic');
  try {
    GL.P.terrain = glProgram(gl, VS_GROUND, FS_TERRAIN);
    GL.P.road = glProgram(gl, VS_ROAD, FS_ROAD);
    GL.P.ramp = glProgram(gl, VS_RAMP, FS_ROAD);
    GL.P.decor = glProgram(gl, VS_DECOR, FS_DECOR);
    GL.P.soft = glProgram(gl, VS_SOFT, FS_SOFT);
    GL.P.skid = glProgram(gl, VS_SKID, FS_SKID);
    GL.P.shade = glProgram(gl, VS_FULL, FS_SHADE);
  } catch (e) { console.warn('WebGL shaders failed, using 2D ground', e); return false; }
  GL.B.full = glBuf(gl, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]));
  GL.B.soft = gl.createBuffer(); GL.B.shadow = gl.createBuffer();
  GL.T.detail = glTexture(gl, detailTexture(), true, true);
  cv.addEventListener('webglcontextlost', e => { e.preventDefault(); GL.ok = false; GL.lost = true; }, false);
  cv.addEventListener('webglcontextrestored', () => { GL.lost = false; if (initGL() && S) glPrepare(); }, false);
  GL.ok = true;
  return true;
}
function glBuf(gl, data, usage) { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, usage || gl.STATIC_DRAW); return b; }
function glTexture(gl, src, repeat, mip, single) {
  const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  if (single) gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, src.w, src.h, 0, gl.RED, gl.UNSIGNED_BYTE, src.data);
  else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
  const wrap = repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  if (mip) { gl.generateMipmap(gl.TEXTURE_2D); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); if (GL.aniso) gl.texParameterf(gl.TEXTURE_2D, GL.aniso.TEXTURE_MAX_ANISOTROPY_EXT, 8); }
  else gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  return t;
}

// ---- procedural textures ----
function tileNoise(sz, cell, seed) { // seamless value noise
  const n = sz / cell, r = RNG(seed), g = new Float32Array(n * n); for (let i = 0; i < g.length; i++) g[i] = r();
  return (x, y) => { const gx = x / cell, gy = y / cell, x0 = Math.floor(gx), y0 = Math.floor(gy), fx = gx - x0, fy = gy - y0, sx2 = fx * fx * (3 - 2 * fx), sy2 = fy * fy * (3 - 2 * fy);
    const i0 = ((x0 % n) + n) % n, i1 = (i0 + 1) % n, j0 = ((y0 % n) + n) % n, j1 = (j0 + 1) % n;
    const a = g[j0 * n + i0], b = g[j0 * n + i1], c = g[j1 * n + i0], d = g[j1 * n + i1]; return a + (b - a) * sx2 + (c - a) * sy2 + (a - b - c + d) * sx2 * sy2; };
}
let _detailTex = null;
function detailTexture() {
  if (_detailTex) return _detailTex;
  const sz = 512, c = mkCanvas(sz, sz), x = c.getContext('2d'), id = x.createImageData(sz, sz), d = id.data;
  const a = [tileNoise(sz, 4, 1), tileNoise(sz, 8, 2), tileNoise(sz, 16, 3)], b = [tileNoise(sz, 32, 4), tileNoise(sz, 64, 5)], cl = [tileNoise(sz, 128, 6), tileNoise(sz, 64, 7), tileNoise(sz, 32, 8)];
  for (let y = 0; y < sz; y++) for (let x2 = 0; x2 < sz; x2++) {
    const k = (y * sz + x2) * 4;
    d[k] = (a[0](x2, y) * .5 + a[1](x2, y) * .3 + a[2](x2, y) * .2) * 255;
    d[k + 1] = (b[0](x2, y) * .6 + b[1](x2, y) * .4) * 255;
    d[k + 2] = (cl[0](x2, y) * .6 + cl[1](x2, y) * .28 + cl[2](x2, y) * .12) * 255;
    d[k + 3] = 255;
  }
  x.putImageData(id, 0, 0); return (_detailTex = c);
}
const _roadTex = {};
// luminance-centred (0.5 = the biome's road tint) surface tiles covering 3.6 m
function roadTexture(kind) {
  if (_roadTex[kind]) return _roadTex[kind];
  const sz = 512, c = mkCanvas(sz, sz), x = c.getContext('2d'), r = RNG(kind.length * 977 + 3);
  const base = { tarmac: 128, gravel: 128, dirt: 128, sand: 132, mud: 122, snow: 132, ice: 130 }[kind];
  // base grain
  const id = x.createImageData(sz, sz), d = id.data, n1 = tileNoise(sz, 4, 11), n2 = tileNoise(sz, 32, 12), n3 = tileNoise(sz, 128, 13), n4 = tileNoise(sz, 2, 14);
  for (let y = 0; y < sz; y++) for (let x2 = 0; x2 < sz; x2++) {
    let v = base;
    if (kind === 'tarmac') v += (n4(x2, y) - .5) * 34 + (n1(x2, y) - .5) * 14 + (n3(x2, y) - .5) * 18;
    else if (kind === 'sand') v += Math.sin((y + n2(x2, y) * 60) / sz * TAU * 9) * 9 + (n4(x2, y) - .5) * 22 + (n3(x2, y) - .5) * 14;
    else if (kind === 'snow') v += (n1(x2, y) - .5) * 10 + (n2(x2, y) - .5) * 12 + (n4(x2, y) > .93 ? 26 : 0);
    else if (kind === 'ice') v += (n2(x2, y) - .5) * 10 + Math.sin((x2 + n3(x2, y) * 80) / sz * TAU * 14) * 4;
    else if (kind === 'mud') v += (n2(x2, y) - .5) * 26 + (n3(x2, y) - .5) * 20 + (n4(x2, y) - .5) * 8;
    else v += (n4(x2, y) - .5) * 26 + (n1(x2, y) - .5) * 18 + (n3(x2, y) - .5) * 16;
    const k = (y * sz + x2) * 4; d[k] = d[k + 1] = d[k + 2] = clamp(v, 0, 255); d[k + 3] = 255;
  }
  x.putImageData(id, 0, 0);
  const wrapDraw = fn => { for (const ox of [-sz, 0, sz]) for (const oy of [-sz, 0, sz]) { x.save(); x.translate(ox, oy); fn(); x.restore(); } };
  const stones = (n, rmin, rmax, lo, hi) => {
    for (let i = 0; i < n; i++) {
      const px = r() * sz, py = r() * sz, rr = r.range(rmin, rmax), a = r() * TAU, v = r.range(lo, hi);
      wrapDraw(() => {
        x.fillStyle = `rgba(20,20,20,.35)`; x.beginPath(); x.ellipse(px + rr * .3, py + rr * .35, rr, rr * .72, a, 0, TAU); x.fill();
        x.fillStyle = `rgb(${v},${v},${v})`; x.beginPath(); x.ellipse(px, py, rr, rr * .72, a, 0, TAU); x.fill();
        x.fillStyle = `rgba(255,255,255,.28)`; x.beginPath(); x.ellipse(px - rr * .25, py - rr * .25, rr * .45, rr * .3, a, 0, TAU); x.fill();
      });
    }
  };
  if (kind === 'gravel') stones(2600, 1.2, 4.2, 70, 200);
  if (kind === 'dirt') { stones(500, 1, 3, 80, 180); x.globalAlpha = .12; for (let i = 0; i < 60; i++) { const px = r() * sz; wrapDraw(() => { x.fillStyle = r.chance(.5) ? '#000' : '#fff'; x.fillRect(px, 0, r.range(2, 8), sz); }); } x.globalAlpha = 1; }
  if (kind === 'tarmac') { stones(900, .6, 1.6, 60, 210); x.strokeStyle = 'rgba(20,20,20,.35)'; x.lineWidth = 1.2; for (let i = 0; i < 5; i++) { let px = r() * sz, py = r() * sz; x.beginPath(); x.moveTo(px, py); for (let k = 0; k < 8; k++) { px += r.sym() * 22; py += r.range(8, 26); x.lineTo(px, py); } x.stroke(); } x.globalAlpha = .1; x.fillStyle = '#000'; for (let i = 0; i < 4; i++) { x.beginPath(); x.ellipse(r() * sz, r() * sz, r.range(30, 70), r.range(20, 50), r() * TAU, 0, TAU); x.fill(); } x.globalAlpha = 1; }
  if (kind === 'mud') { x.globalAlpha = .3; for (let i = 0; i < 40; i++) { const px = r() * sz, py = r() * sz; wrapDraw(() => { x.fillStyle = r.chance(.6) ? '#ffffff' : '#000000'; x.beginPath(); x.ellipse(px, py, r.range(6, 24), r.range(2, 6), r.sym() * .3 + Math.PI / 2, 0, TAU); x.fill(); }); } x.globalAlpha = 1; stones(300, 1, 2.6, 60, 150); }
  if (kind === 'sand') stones(300, .5, 1.2, 120, 190);
  if (kind === 'snow') { x.globalAlpha = .18; for (let i = 0; i < 200; i++) { const px = r() * sz, py = r() * sz; wrapDraw(() => { x.fillStyle = r.chance(.5) ? '#ffffff' : '#7080a0'; x.beginPath(); x.ellipse(px, py, r.range(3, 12), r.range(2, 7), r() * TAU, 0, TAU); x.fill(); }); } x.globalAlpha = 1; }
  if (kind === 'ice') { x.strokeStyle = 'rgba(255,255,255,.35)'; x.lineWidth = 1; for (let i = 0; i < 40; i++) { let px = r() * sz, py = r() * sz; x.beginPath(); x.moveTo(px, py); for (let k = 0; k < 4; k++) { px += r.sym() * 40; py += r.sym() * 40; x.lineTo(px, py); } x.stroke(); } }
  return (_roadTex[kind] = c);
}
// luminance strokes for the off-road ground (grass, sand grains, snow sparkle)
function groundDetailTexture(biome) {
  const sz = 1024, c = mkCanvas(sz, sz), x = c.getContext('2d'), r = RNG(biome.length * 131);
  const wrapDraw = fn => { for (const ox of [-sz, 0, sz]) for (const oy of [-sz, 0, sz]) { x.save(); x.translate(ox, oy); fn(); x.restore(); } };
  if (biome === 'frost') {
    for (let i = 0; i < 5000; i++) { const px = r() * sz, py = r() * sz, v = r.chance(.7) ? 250 : 60; x.fillStyle = `rgba(${v},${v},${v},${r.range(.15, .5)})`; x.fillRect(px, py, r.range(1, 2.4), r.range(1, 2.4)); }
    for (let i = 0; i < 160; i++) { const px = r() * sz, py = r() * sz; wrapDraw(() => { x.fillStyle = `rgba(${r.chance(.5) ? 255 : 90},${r.chance(.5) ? 255 : 100},255,.12)`; x.beginPath(); x.ellipse(px, py, r.range(8, 30), r.range(5, 16), r() * TAU, 0, TAU); x.fill(); }); }
  } else if (biome === 'mesa') {
    for (let i = 0; i < 9000; i++) { const px = r() * sz, py = r() * sz, v = r.chance(.5) ? 230 : 40; x.fillStyle = `rgba(${v},${v},${v},${r.range(.12, .4)})`; x.fillRect(px, py, r.range(1, 3), r.range(1, 3)); }
    x.lineWidth = 2; for (let i = 0; i < 120; i++) { const px = r() * sz, py = r() * sz; wrapDraw(() => { x.strokeStyle = `rgba(${r.chance(.5) ? 255 : 0},${r.chance(.5) ? 255 : 0},0,.12)`.replace(/rgba\((\d+),(\d+),0/, (m, a) => `rgba(${a},${a},${a}`); x.beginPath(); x.moveTo(px - 30, py); x.quadraticCurveTo(px, py - 8, px + 30, py); x.stroke(); }); }
  } else {
    for (let i = 0; i < 16000; i++) {
      const px = r() * sz, py = r() * sz, len = r.range(4, 14), a = r() * TAU, v = r.chance(.55) ? 30 : 235;
      x.strokeStyle = `rgba(${v},${v},${v},${r.range(.12, .38)})`; x.lineWidth = r.range(1, 2.2);
      x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a) * len, py + Math.sin(a) * len); x.stroke();
    }
    for (let i = 0; i < 2600; i++) { const px = r() * sz, py = r() * sz, v = r.chance(.5) ? 20 : 240; x.fillStyle = `rgba(${v},${v},${v},${r.range(.1, .3)})`; x.beginPath(); x.arc(px, py, r.range(1, 3), 0, TAU); x.fill(); }
  }
  return c;
}
function decorAtlas(B) {
  // 8 tiles: 0 tuft, 1 fern, 2 flower, 3 stone, 4 leaf, 5 snowlump, 6 twig, 7 ripple (white/grey, tinted per instance)
  const T = 128, c = mkCanvas(T * 8, T), x = c.getContext('2d'), r = RNG(5);
  const tile = (i, fn) => { x.save(); x.translate(i * T, 0); fn(); x.restore(); };
  tile(0, () => { x.lineCap = 'round'; for (let b = 0; b < 14; b++) { const bx = 64 + r.sym() * 26, a = -Math.PI / 2 + r.sym() * .55, l = r.range(70, 120); x.strokeStyle = `rgb(${150 + r() * 90},${150 + r() * 90},${150 + r() * 90})`; x.lineWidth = r.range(3, 6); x.beginPath(); x.moveTo(bx, 127); x.quadraticCurveTo(bx + Math.cos(a) * l * .5 + r.sym() * 10, 127 + Math.sin(a) * l * .5, bx + Math.cos(a) * l, 127 + Math.sin(a) * l); x.stroke(); } });
  tile(1, () => { x.strokeStyle = '#c8c8c8'; x.lineWidth = 4; for (let b = 0; b < 5; b++) { const a = -Math.PI / 2 + (b - 2) * .32; x.beginPath(); x.moveTo(64, 127); x.lineTo(64 + Math.cos(a) * 110, 127 + Math.sin(a) * 110); x.stroke(); for (let k = 1; k < 9; k++) { const px = 64 + Math.cos(a) * k * 12, py = 127 + Math.sin(a) * k * 12; x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a - 1) * 14, py + Math.sin(a - 1) * 14); x.moveTo(px, py); x.lineTo(px + Math.cos(a + 1) * 14, py + Math.sin(a + 1) * 14); x.stroke(); } } });
  tile(2, () => { x.strokeStyle = '#9aa88a'; x.lineWidth = 4; for (const fx of [40, 64, 90]) { x.beginPath(); x.moveTo(fx, 127); x.lineTo(fx + r.sym() * 8, 60 + r() * 30); x.stroke(); } for (const [fx, fy] of [[38, 62], [66, 50], [92, 70]]) { x.fillStyle = '#ffffff'; for (let p = 0; p < 5; p++) { const a = p / 5 * TAU; x.beginPath(); x.arc(fx + Math.cos(a) * 9, fy + Math.sin(a) * 9, 7, 0, TAU); x.fill(); } x.fillStyle = '#ffe9a0'; x.beginPath(); x.arc(fx, fy, 5, 0, TAU); x.fill(); } });
  tile(3, () => { x.fillStyle = '#7a7a7a'; x.beginPath(); x.ellipse(64, 70, 50, 40, 0, 0, TAU); x.fill(); x.fillStyle = '#c8c8c8'; x.beginPath(); x.ellipse(52, 58, 34, 24, 0, 0, TAU); x.fill(); });
  tile(4, () => { x.fillStyle = '#d8d8d8'; x.beginPath(); x.ellipse(64, 64, 40, 18, .6, 0, TAU); x.fill(); x.strokeStyle = '#8a8a8a'; x.lineWidth = 3; x.beginPath(); x.moveTo(34, 86); x.lineTo(94, 42); x.stroke(); });
  tile(5, () => { const g = x.createRadialGradient(56, 56, 4, 64, 64, 58); g.addColorStop(0, '#ffffff'); g.addColorStop(.75, '#dfe6f0'); g.addColorStop(1, 'rgba(200,210,230,0)'); x.fillStyle = g; x.beginPath(); x.ellipse(64, 64, 60, 44, 0, 0, TAU); x.fill(); });
  tile(6, () => { x.strokeStyle = '#6a6a6a'; x.lineWidth = 6; x.lineCap = 'round'; x.beginPath(); x.moveTo(20, 100); x.lineTo(108, 30); x.moveTo(64, 65); x.lineTo(90, 90); x.stroke(); });
  tile(7, () => { x.strokeStyle = '#d0d0d0'; x.lineWidth = 6; x.beginPath(); x.moveTo(10, 70); x.quadraticCurveTo(64, 50, 118, 70); x.stroke(); });
  return c;
}
const DECOR_TILE = { tuft: 0, fern: 1, flower: 2, stone: 3, leaf: 4, snowlump: 5, twig: 6, ripple: 7 };
const DECOR_FLAT = { stone: 1, leaf: 1, snowlump: 1, ripple: 1, twig: 1 };

// ---- scene setup: textures and static geometry ----
function glPrepare() {
  if (!GL.ok || !S) return;
  const gl = GL.gl, { T, Wd, B } = S;
  const sc = GL.scene = { roadN: 0, decorN: 0 };
  sc.bake = glTexture(gl, S.bake, false, true);
  // water depth as one channel (0.5 = shoreline)
  const ww = Wd.W, wh = Wd.H, wdata = new Uint8Array(ww * wh);
  for (let i = 0; i < ww * wh; i++) wdata[i] = clamp(Math.round((.5 - Wd.h[i] / 6) * 255), 0, 255);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  sc.water = glTexture(gl, { w: ww, h: wh, data: wdata }, false, false, true);
  sc.ground = glTexture(gl, groundDetailTexture(T.ev.biome), true, true);
  sc.atlas = glTexture(gl, decorAtlas(B), false, true);
  sc.road = ['tarmac', 'gravel', 'dirt', 'sand', 'mud', 'snow', 'ice'].map(k => glTexture(gl, roadTexture(k), true, true));
  // terrain quad (with a margin beyond the world edge)
  const m = 600; sc.terrain = glBuf(gl, new Float32Array([-m, -m, Wd.W + m, -m, -m, Wd.H + m, Wd.W + m, Wd.H + m]));
  // road strip: position, uv (lateral m, along m), surface, mask, normal
  const hw = T.width / 2, ext = hw + 2.7, n = T.n, closed = T.closed, cnt = closed ? n + 1 : n;
  const SI = { tarmac: 0, gravel: 1, dirt: 2, sand: 3, mud: 4, snow: 5, ice: 6 };
  const v = new Float32Array(cnt * 2 * 8);
  for (let j = 0; j < cnt; j++) {
    const i = j % n, nx = -T.ty[i], ny = T.tx[i], sf = SI[SURF_KEYS[T.surf[i]]] ?? 1, s = j * DS;
    let mask = 1; for (const f of T.fords) { const d = Math.max(f.s0 - s, s - f.s1); if (d < 6) mask = Math.min(mask, clamp(d / 6, 0, 1)); }
    for (let side = 0; side < 2; side++) {
      const sg = side ? 1 : -1, k = (j * 2 + side) * 8;
      v[k] = T.px[i] + nx * ext * sg; v[k + 1] = T.py[i] + ny * ext * sg; v[k + 2] = ext * sg; v[k + 3] = s; v[k + 4] = sf; v[k + 5] = mask; v[k + 6] = nx; v[k + 7] = ny;
    }
  }
  sc.road = sc.road; sc.roadBuf = glBuf(gl, v); sc.roadN = cnt * 2;
  // jump ramps: a lifted patch of road (and its shoulders) from the kicker to the landing
  const rv = [], ri = [], LAT = [-(hw + 3.6), -(hw + 2.4), -(hw + .9), -hw * .55, 0, hw * .55, hw + .9, hw + 2.4, hw + 3.6];
  for (const jp of T.jumps) {
    const base = rv.length / 9; let rows = 0;
    for (let d = -jp.L1 - 1; d <= jp.L2 + 1; d += .5, rows++) {
      const ss = jp.s + d, fi = clamp(ss / DS, 0, n - 1.001), i0 = Math.floor(fi), f = fi - i0, i1 = Math.min(n - 1, i0 + 1);
      const px = lerp(T.px[i0], T.px[i1], f), py = lerp(T.py[i0], T.py[i1], f), nx = -lerp(T.ty[i0], T.ty[i1], f), ny = lerp(T.tx[i0], T.tx[i1], f), sf = SI[SURF_KEYS[T.surf[i0]]] ?? 1;
      for (const lat of LAT) rv.push(px + nx * lat, py + ny * lat, lat, ss, sf, 1, nx, ny, rampZ(jp, d) * (1 - smooth(hw + .4, hw + 3.4, Math.abs(lat))));
    }
    for (let r = 0; r < rows - 1; r++) for (let c = 0; c < LAT.length - 1; c++) { const a = base + r * LAT.length + c, b = a + LAT.length; ri.push(a, b, a + 1, a + 1, b, b + 1); }
  }
  sc.rampN = ri.length;
  if (ri.length) { sc.rampBuf = glBuf(gl, new Float32Array(rv)); sc.rampIdx = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, sc.rampIdx); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(ri), gl.STATIC_DRAW); }
  sc.cutCol = hexRGB(B.road[SURF_KEYS[T.surf[0]]] || B.road.gravel || '#b0a080').map(x => x / 255 * .92);
  // ground decor: upright tufts and flowers, flat stones and leaves
  const dc = Wd.decor, N = dc.n, dv = new Float32Array(N * 4 * 11), di = new Uint32Array(N * 6), cols = B.decorCols.map(hexRGB);
  const corners = [[-1, 0], [1, 0], [1, 1], [-1, 1]];
  for (let i = 0; i < N; i++) {
    const type = B.decor[dc.t[i]], tile = DECOR_TILE[type] ?? 0, flat = DECOR_FLAT[type] ? 1 : 0, col = cols[dc.c[i]];
    const size = (flat ? .55 : .6) * dc.s[i] * (type === 'snowlump' ? 1.6 : type === 'flower' ? .8 : 1);
    for (let c = 0; c < 4; c++) {
      const k = (i * 4 + c) * 11;
      dv[k] = dc.x[i]; dv[k + 1] = dc.y[i]; dv[k + 2] = corners[c][0]; dv[k + 3] = corners[c][1]; dv[k + 4] = size; dv[k + 5] = tile;
      dv[k + 6] = col[0] / 255; dv[k + 7] = col[1] / 255; dv[k + 8] = col[2] / 255; dv[k + 9] = flat; dv[k + 10] = dc.r[i];
    }
    di.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
  }
  sc.decorBuf = glBuf(gl, dv); sc.decorIdx = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, sc.decorIdx); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, di, gl.STATIC_DRAW); sc.decorN = N * 6;
  // skid ring buffer
  sc.skidMax = 6000; sc.skidBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, sc.skidBuf); gl.bufferData(gl.ARRAY_BUFFER, sc.skidMax * 4 * 7 * 4, gl.DYNAMIC_DRAW);
  const si = new Uint32Array(sc.skidMax * 6); for (let i = 0; i < sc.skidMax; i++) si.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
  sc.skidIdx = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, sc.skidIdx); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, si, gl.STATIC_DRAW);
  sc.skidN = 0; sc.skidTmp = new Float32Array(4 * 7);
  sc.softIdx = gl.createBuffer(); const qi = new Uint32Array(4000 * 6); for (let i = 0; i < 4000; i++) qi.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, sc.softIdx); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, qi, gl.STATIC_DRAW);
  sc.softData = new Float32Array(4000 * 4 * 10);
  sc.tints = SURF_KEYS.slice(0, 0);
  const tint = k => hexRGB(B.road[k] || B.road.gravel || B.road.dirt || '#b0a080').map(v => v / 255);
  sc.tint = new Float32Array(['tarmac', 'gravel', 'dirt', 'sand', 'mud', 'snow', 'ice'].flatMap(tint));
  sc.shoulder = hexRGB(B.shoulder).map(v => v / 255);
}
function glAddSkid(x1, y1, x2, y2, w, a, col) {
  const sc = GL.scene; if (!GL.ok || !sc) return;
  const gl = GL.gl, dx = x2 - x1, dy = y2 - y1, l = Math.hypot(dx, dy) || 1, nx = -dy / l * w * .5, ny = dx / l * w * .5;
  const c = hexRGB(SKID_COLS[col]), t = sc.skidTmp, slot = sc.skidN % sc.skidMax;
  const P = [[x1 - nx, y1 - ny, -1], [x2 - nx, y2 - ny, -1], [x2 + nx, y2 + ny, 1], [x1 + nx, y1 + ny, 1]];
  for (let i = 0; i < 4; i++) { t.set([P[i][0], P[i][1], P[i][2], c[0] / 255, c[1] / 255, c[2] / 255, a * .55], i * 7); }
  gl.bindBuffer(gl.ARRAY_BUFFER, sc.skidBuf); gl.bufferSubData(gl.ARRAY_BUFFER, slot * 4 * 7 * 4, t);
  sc.skidN++;
}

// ---- per-frame ----
function glMatrix() {
  const W = R.W, H = R.H, F = cam.focal, kx = 2 * F / W, ky = 2 * F / H, ox = 2 * cam.sx / W, oy = -2 * cam.sy / H;
  const uo = -(cam.rx * cam.cx + cam.ry * cam.cy), vo = -(cam.fx * cam.cx + cam.fy * cam.cy);
  const d0 = cam.cp * vo + cam.sp * cam.hc, p0 = cam.sp * vo - cam.cp * cam.hc;
  const r0 = [kx * cam.rx + ox * cam.cp * cam.fx, kx * cam.ry + ox * cam.cp * cam.fy, -ox * cam.sp, kx * uo + ox * d0];
  const r1 = [ky * cam.sp * cam.fx + oy * cam.cp * cam.fx, ky * cam.sp * cam.fy + oy * cam.cp * cam.fy, ky * cam.cp - oy * cam.sp, ky * p0 + oy * d0];
  const r3 = [cam.cp * cam.fx, cam.cp * cam.fy, -cam.sp, d0], r2 = [r3[0], r3[1], r3[2], r3[3] - .5];
  return new Float32Array([r0[0], r1[0], r2[0], r3[0], r0[1], r1[1], r2[1], r3[1], r0[2], r1[2], r2[2], r3[2], r0[3], r1[3], r2[3], r3[3]]);
}
function glResize() {
  if (!GL.ok) return;
  const w = Math.round(R.W * R.dpr), h = Math.round(R.H * R.dpr);
  if (GL.cv.width !== w || GL.cv.height !== h) { GL.cv.width = w; GL.cv.height = h; GL.mask = null; }
}
function glMaskTarget() {
  const gl = GL.gl, w = Math.max(1, GL.cv.width >> 1), h = Math.max(1, GL.cv.height >> 1);
  if (GL.mask && GL.mask.w === w && GL.mask.h === h) return GL.mask;
  const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return (GL.mask = { t, fb, w, h });
}
function glAttr(gl, prog, name, size, stride, off) { const loc = prog.a[name]; if (loc === undefined || loc < 0) return; gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride * 4, off * 4); }
function glReset(gl) { for (let i = 0; i < 12; i++) gl.disableVertexAttribArray(i); }
function glLights(gl, P, L) {
  gl.uniform1f(P.u.uDark, L.dark); gl.uniform3fv(P.u.uAmb, L.amb);
  gl.uniform1i(P.u.uLn, L.n); if (L.n) { gl.uniform4fv(P.u.uL, L.pos); gl.uniform3fv(P.u.uLc, L.col); }
  gl.uniform4fv(P.u.uHead, L.head); gl.uniform1f(P.u.uHeadOn, L.headOn);
}
// soft quads: [x,y, lx,ly, r,g,b,a, hard, mode] x4
function softQuad(arr, n, cx, cy, ax, ay, hx, hy, col, a, hard, mode) {
  if (n >= 4000) return n;
  const k = n * 40, C = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  for (let c = 0; c < 4; c++) { const o = k + c * 10, u = C[c][0], v = C[c][1]; arr[o] = cx + ax * u * hx - ay * v * hy; arr[o + 1] = cy + ay * u * hx + ax * v * hy; arr[o + 2] = u; arr[o + 3] = v; arr[o + 4] = col[0]; arr[o + 5] = col[1]; arr[o + 6] = col[2]; arr[o + 7] = a; arr[o + 8] = hard; arr[o + 9] = mode; }
  return n + 1;
}
function glDrawSoft(gl, n, mask, L) {
  if (!n) return;
  const P = GL.P.soft, sc = GL.scene; gl.useProgram(P.p); glReset(gl);
  gl.uniformMatrix4fv(P.u.uM, false, GL.M); gl.uniform1f(P.u.uMask, mask ? 1 : 0); if (!mask) glLights(gl, P, L);
  gl.bindBuffer(gl.ARRAY_BUFFER, GL.B.soft); gl.bufferData(gl.ARRAY_BUFFER, sc.softData.subarray(0, n * 40), gl.DYNAMIC_DRAW);
  glAttr(gl, P, 'aPos', 2, 10, 0); glAttr(gl, P, 'aLoc', 2, 10, 2); glAttr(gl, P, 'aCol', 4, 10, 4); glAttr(gl, P, 'aP', 2, 10, 8);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, sc.softIdx); gl.drawElements(gl.TRIANGLES, n * 6, gl.UNSIGNED_INT, 0);
}

function glRender(t, list, L) {
  const gl = GL.gl, sc = GL.scene, B = S.B, C = S.C, Wd = S.Wd, T = S.T;
  glResize(); GL.M = glMatrix();
  gl.viewport(0, 0, GL.cv.width, GL.cv.height);
  const bg = hexRGB(B.ground[0]); gl.clearColor(bg[0] / 255, bg[1] / 255, bg[2] / 255, 1); gl.clear(gl.COLOR_BUFFER_BIT);
  gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);
  const bind = (unit, tex) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex); };
  const hz = hexRGB(B.haze).map(v => v / 255), sunC = hexRGB(B.sun).map(v => v / 255);
  // terrain
  let P = GL.P.terrain; gl.useProgram(P.p); glReset(gl);
  gl.uniformMatrix4fv(P.u.uM, false, GL.M);
  bind(0, sc.bake); bind(1, GL.T.detail); bind(2, sc.ground); bind(3, sc.water);
  gl.uniform1i(P.u.uBake, 0); gl.uniform1i(P.u.uDetail, 1); gl.uniform1i(P.u.uGround, 2); gl.uniform1i(P.u.uWater, 3);
  gl.uniform2f(P.u.uWorld, Wd.W, Wd.H); gl.uniform2f(P.u.uWind, S.wind[0], S.wind[1]); gl.uniform1f(P.u.uTime, t);
  gl.uniform1f(P.u.uFrozen, B.frozen ? 1 : 0); gl.uniform1f(P.u.uCloud, !C.night && C.shA > .2 && !C.weather ? .12 : 0);
  gl.uniform1f(P.u.uGA, T.ev.biome === 'frost' ? .5 : .75); gl.uniform1f(P.u.uGS, 7.5);
  gl.uniform3fv(P.u.uWaterS, hexRGB(B.water[0]).map(v => v / 255)); gl.uniform3fv(P.u.uWaterD, hexRGB(B.water[1]).map(v => v / 255)); gl.uniform3fv(P.u.uFoam, hexRGB(B.foam).map(v => v / 255));
  gl.uniform3fv(P.u.uSky, hz); gl.uniform3fv(P.u.uSunC, C.night ? [.2, .22, .3] : sunC);
  glLights(gl, P, L);
  gl.bindBuffer(gl.ARRAY_BUFFER, sc.terrain); glAttr(gl, P, 'aPos', 2, 2, 0); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  // road
  P = GL.P.road; gl.useProgram(P.p); glReset(gl);
  gl.uniformMatrix4fv(P.u.uM, false, GL.M);
  for (let i = 0; i < 7; i++) { bind(i, sc.road[i]); gl.uniform1i(P.u['uT' + i], i); }
  bind(7, GL.T.detail); gl.uniform1i(P.u.uDetail, 7);
  gl.uniform3fv(P.u.uTint, sc.tint); gl.uniform3fv(P.u.uShoulder, sc.shoulder);
  gl.uniform1f(P.u.uHW, T.width / 2); gl.uniform1f(P.u.uRX, T.ev.type === 'rallycross' ? 1 : 0); gl.uniform1f(P.u.uWet, C.wet ? 1 : 0); gl.uniform1f(P.u.uTime, t);
  gl.uniform1f(P.u.uStart, T.startS + 2); gl.uniform1f(P.u.uFinish, T.closed ? -1 : T.finishS);
  const js = new Float32Array(6); T.jumps.slice(0, 6).forEach((j, i) => js[i] = j.s); gl.uniform1fv(P.u.uJ, js); gl.uniform1i(P.u.uNJ, Math.min(6, T.jumps.length));
  gl.uniform2f(P.u.uSun, S.sun[0], S.sun[1]); gl.uniform3fv(P.u.uSky, hz);
  glLights(gl, P, L);
  gl.bindBuffer(gl.ARRAY_BUFFER, sc.roadBuf);
  glAttr(gl, P, 'aPos', 2, 8, 0); glAttr(gl, P, 'aUV', 2, 8, 2); glAttr(gl, P, 'aSurf', 1, 8, 4); glAttr(gl, P, 'aMask', 1, 8, 5); glAttr(gl, P, 'aN', 2, 8, 6);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, sc.roadN);
  // skid marks
  if (sc.skidN) {
    P = GL.P.skid; gl.useProgram(P.p); glReset(gl);
    gl.uniformMatrix4fv(P.u.uM, false, GL.M); bind(0, GL.T.detail); gl.uniform1i(P.u.uDetail, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, sc.skidBuf); glAttr(gl, P, 'aPos', 2, 7, 0); glAttr(gl, P, 'aSide', 1, 7, 2); glAttr(gl, P, 'aCol', 4, 7, 3);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, sc.skidIdx); gl.drawElements(gl.TRIANGLES, Math.min(sc.skidN, sc.skidMax) * 6, gl.UNSIGNED_INT, 0);
  }
  // decals, puddles, ripples
  let n = 0; const arr = sc.softData;
  for (const p of Wd.puddles) if (inBox(p.x, p.y, 4)) { n = softQuad(arr, n, p.x, p.y, Math.cos(p.a), Math.sin(p.a), p.rx, p.ry, [.24, .28, .36], .5, .55, 0); n = softQuad(arr, n, p.x - .3, p.y - .2, Math.cos(p.a), Math.sin(p.a), p.rx * .6, p.ry * .5, [.72, .78, .88], .22, .3, 0); }
  for (const d of S.decals) if (inBox(d.x, d.y, 3)) { const c = hexRGB(d.col); n = softQuad(arr, n, d.x, d.y, Math.cos(d.a), Math.sin(d.a), d.r, d.r * .6, [c[0] / 255, c[1] / 255, c[2] / 255], .6, .5, 0); }
  for (const r of S.ripples) { const rr = .15 + r.t * r.m * 1.2; n = softQuad(arr, n, r.x, r.y, 1, 0, rr, rr * .75, [.88, .92, .97], .5 * (1 - r.t / .7), 0, 2); }
  // the worn line across the inside of corners that can be cut
  for (const p of Wd.cutPatches || []) if (inBox(p.x, p.y, 4)) n = softQuad(arr, n, p.x, p.y, Math.cos(p.a), Math.sin(p.a), p.rx, p.ry, sc.cutCol, .5, .35, 0);
  glDrawSoft(gl, n, false, L);
  // jump ramps on top of the flat road
  if (sc.rampN) {
    P = GL.P.ramp; gl.useProgram(P.p); glReset(gl);
    gl.uniformMatrix4fv(P.u.uM, false, GL.M);
    for (let i = 0; i < 7; i++) { bind(i, sc.road[i]); gl.uniform1i(P.u['uT' + i], i); }
    bind(7, GL.T.detail); gl.uniform1i(P.u.uDetail, 7);
    gl.uniform3fv(P.u.uTint, sc.tint); gl.uniform3fv(P.u.uShoulder, sc.shoulder);
    gl.uniform1f(P.u.uHW, T.width / 2); gl.uniform1f(P.u.uRX, T.ev.type === 'rallycross' ? 1 : 0); gl.uniform1f(P.u.uWet, C.wet ? 1 : 0); gl.uniform1f(P.u.uTime, t);
    gl.uniform1f(P.u.uStart, -1); gl.uniform1f(P.u.uFinish, -1);
    const js2 = new Float32Array(6); T.jumps.slice(0, 6).forEach((j, i) => js2[i] = j.s); gl.uniform1fv(P.u.uJ, js2); gl.uniform1i(P.u.uNJ, Math.min(6, T.jumps.length));
    gl.uniform2f(P.u.uSun, S.sun[0], S.sun[1]); gl.uniform3fv(P.u.uSky, hz);
    glLights(gl, P, L);
    gl.bindBuffer(gl.ARRAY_BUFFER, sc.rampBuf);
    glAttr(gl, P, 'aPos', 2, 9, 0); glAttr(gl, P, 'aUV', 2, 9, 2); glAttr(gl, P, 'aSurf', 1, 9, 4); glAttr(gl, P, 'aMask', 1, 9, 5); glAttr(gl, P, 'aN', 2, 9, 6); glAttr(gl, P, 'aZ', 1, 9, 8);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, sc.rampIdx); gl.drawElements(gl.TRIANGLES, sc.rampN, gl.UNSIGNED_INT, 0);
  }
  // decor
  P = GL.P.decor; gl.useProgram(P.p); glReset(gl);
  gl.uniformMatrix4fv(P.u.uM, false, GL.M); bind(0, sc.atlas); gl.uniform1i(P.u.uAtlas, 0);
  gl.uniform2f(P.u.uRight, cam.rx, cam.ry); gl.uniform1f(P.u.uTiles, 8); gl.uniform1f(P.u.uTime, t); gl.uniform2f(P.u.uWind, S.wind[0], S.wind[1]);
  glLights(gl, P, L);
  gl.disable(gl.BLEND);
  gl.bindBuffer(gl.ARRAY_BUFFER, sc.decorBuf);
  glAttr(gl, P, 'aBase', 2, 11, 0); glAttr(gl, P, 'aCorner', 2, 11, 2); glAttr(gl, P, 'aSize', 1, 11, 4); glAttr(gl, P, 'aTile', 1, 11, 5); glAttr(gl, P, 'aCol', 3, 11, 6); glAttr(gl, P, 'aFlat', 1, 11, 9); glAttr(gl, P, 'aRot', 1, 11, 10);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, sc.decorIdx); gl.drawElements(gl.TRIANGLES, sc.decorN, gl.UNSIGNED_INT, 0);
  // shadows: max-blended into a half-res mask, then multiplied over the ground
  const mk = glMaskTarget();
  gl.bindFramebuffer(gl.FRAMEBUFFER, mk.fb); gl.viewport(0, 0, mk.w, mk.h); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
  gl.enable(gl.BLEND); gl.blendEquation(gl.MAX); gl.blendFunc(gl.ONE, gl.ONE);
  n = buildShadows(arr, list);
  glDrawSoft(gl, n, true, L);
  gl.blendEquation(gl.FUNC_ADD); gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, GL.cv.width, GL.cv.height);
  P = GL.P.shade; gl.useProgram(P.p); glReset(gl);
  bind(0, mk.t); gl.uniform1i(P.u.uMaskT, 0); gl.uniform3fv(P.u.uShade, hexRGB(mixHex(B.shade, '#000000', .35)).map(v => v / 255)); gl.uniform1f(P.u.uA, Math.min(.8, C.shA * 1.35));
  gl.blendFunc(gl.DST_COLOR, gl.ZERO);
  gl.bindBuffer(gl.ARRAY_BUFFER, GL.B.full); glAttr(gl, P, 'aPos', 2, 2, 0); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.disable(gl.BLEND);
}
// soft shadow footprints for everything standing: sun-cast blobs plus tight contact shadows
function buildShadows(arr, list) {
  let n = 0; const L = S.shLen, sx2 = S.sun[0], sy2 = S.sun[1], one = [1, 1, 1];
  for (const it of list) {
    const o = it.o;
    if (it.k === 'tree') { const sl = o.h * L; n = softQuad(arr, n, o.x + sx2 * sl * .5, o.y + sy2 * sl * .5, sx2, sy2, o.cr * .95 + sl * .28, o.cr * .9, one, .85, .25, 0); if (o.sp !== 'shrub') n = softQuad(arr, n, o.x, o.y, 1, 0, 1.1, 1.1, one, .6, .2, 0); }
    else if (it.k === 'rock') n = softQuad(arr, n, o.x + sx2 * o.h * L * .4, o.y + sy2 * o.h * L * .4, sx2, sy2, o.r * 1.15 + o.h * L * .3, o.r * 1.05, one, .9, .35, 0);
    else if (it.k === 'hay') n = softQuad(arr, n, o.x + sx2 * .45 * L, o.y + sy2 * .45 * L, sx2, sy2, 1.1, .95, one, .85, .4, 0);
    else if (it.k === 'spec') n = softQuad(arr, n, o.x + sx2 * .8 * L, o.y + sy2 * .8 * L, sx2, sy2, .35 + .8 * L, .38, one, .7, .3, 0);
    else if (it.k === 'house') {
      const ca = Math.cos(o.a), sa = Math.sin(o.a);
      n = softQuad(arr, n, o.x, o.y, ca, sa, o.L / 2 + .3, o.Wb / 2 + .3, one, 1, .8, 1);
      n = softQuad(arr, n, o.x + sx2 * o.h * L * .55, o.y + sy2 * o.h * L * .55, ca, sa, o.L / 2 + o.h * L * .3, o.Wb / 2 + o.h * L * .3, one, .9, .6, 1);
    }
    else if (it.k === 'car') {
      const car = it.o, P = car.P, ca = Math.cos(car.h), sa = Math.sin(car.h), z = Math.max(0, (car.z || 0) - (car.gz || 0)), g = it.ghost ? .35 : 1;
      n = softQuad(arr, n, car.x, car.y, ca, sa, P.hl * 1.02 + z * .3, P.hw * 1.12 + z * .3, one, (.95 - Math.min(.6, z * .25)) * g, .55, 1);
      const off = (.45 + z) * Math.max(.35, L);
      n = softQuad(arr, n, car.x + sx2 * off, car.y + sy2 * off, ca, sa, P.hl * 1.08, P.hw * 1.25, one, (.75 - Math.min(.4, z * .12)) * g, .4, 1);
    }
    else if (POLEISH[it.k]) { const l = o.h * L; n = softQuad(arr, n, o.x + sx2 * l * .5, o.y + sy2 * l * .5, sx2, sy2, l * .5 + .1, it.k === 'pump' ? .4 : .12, one, .7, .4, 1); }
    else if (it.k === 'logs') { const ca = Math.cos(o.a), sa = Math.sin(o.a); n = softQuad(arr, n, o.x + sx2 * .5 * L, o.y + sy2 * .5 * L, ca, sa, o.L / 2 + .3 + .4 * L, 1.1, one, .85, .5, 1); }
    else if (it.k === 'mill') { const sl = o.h * L; n = softQuad(arr, n, o.x + sx2 * sl * .5, o.y + sy2 * sl * .5, sx2, sy2, 2 + sl * .5, 2.1, one, .85, .45, 0); }
    else if (it.k === 'fence' && !o.broken && o.st !== 'wire') { const dx = o.x1 - o.x0, dy = o.y1 - o.y0, l = hyp(dx, dy) || 1, sl = o.h * L * .5; n = softQuad(arr, n, o.x + sx2 * sl, o.y + sy2 * sl, dx / l, dy / l, l / 2 + .1, .25 + sl * .5, one, o.st === 'wall' ? .8 : .45, .4, 1); }
  }
  return n;
}
