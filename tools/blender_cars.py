# Blender script that builds the Dustlight Rally car bodies (run in Blender's Python console or Text Editor).
# SPECS_JSON reads tools/car_specs.json (shape data from js/01_data.js); set its path below, then run.
# It writes ~/Documents/DustlightRally/cars.json; convert it with tools/convert_meshes.py into js/012_carmesh.js.
SPECS_JSON = open(r'C:/path/to/rally/tools/car_specs.json').read()  # point this at tools/car_specs.json
WANT = None
WHEEL = True
# Dustlight Rally car generator: builds low-poly rally cars with bmesh and returns compact triangle data.
# Runs inside Blender; touches nothing in the user's scene (pure bmesh, no objects are created).
import bmesh, math, json
from mathutils import Vector, Matrix

SPECS = json.loads(SPECS_JSON)
M = dict(body=0, glass=1, trim=2, head=3, tail=4, dark=5, rim=6, lens=7, accent=8, tyre=9, white=10, roof=11)

def smoothstep(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a))); return t * t * (3 - 2 * t)

def loft(bm, stations, mat, close_first=True, close_last=True):
    """stations: list of (u, ring) where ring is a list of (v, z) points, same count for all. Returns faces."""
    rows = []
    for u, ring in stations:
        rows.append([bm.verts.new((u, v, z)) for v, z in ring])
    faces = []
    n = len(rows[0])
    for a, b in zip(rows[:-1], rows[1:]):
        for i in range(n):
            j = (i + 1) % n
            try:
                f = bm.faces.new((a[i], a[j], b[j], b[i])); f.material_index = mat; faces.append(f)
            except ValueError:
                pass
    for row, ok in ((rows[0], close_first), (rows[-1], close_last)):
        if ok:
            try:
                f = bm.faces.new(row); f.material_index = mat; faces.append(f)
            except ValueError:
                pass
    return faces, rows

def box(bm, center, size, mat, rot=None):
    r = bmesh.ops.create_cube(bm, size=1.0)
    S = Matrix.Diagonal((size[0], size[1], size[2], 1.0))
    T = Matrix.Translation(Vector(center))
    Mx = T @ (rot.to_4x4() if rot else Matrix.Identity(4)) @ S
    bmesh.ops.transform(bm, matrix=Mx, verts=r['verts'])
    for f in {f for v in r['verts'] for f in v.link_faces}: f.material_index = mat
    return r['verts']

def disc(bm, center, radius, depth, axis, mat, segs=10, mat_face=None):
    r = bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segs, radius1=radius, radius2=radius, depth=depth)
    rot = {'x': Matrix.Rotation(math.pi / 2, 4, 'Y'), 'y': Matrix.Rotation(math.pi / 2, 4, 'X'), 'z': Matrix.Identity(4)}[axis]
    bmesh.ops.transform(bm, matrix=Matrix.Translation(Vector(center)) @ rot, verts=r['verts'])
    fs = {f for v in r['verts'] for f in v.link_faces}
    for f in fs:
        f.material_index = mat
        if mat_face is not None and len(f.verts) == segs:
            # the end cap facing outward along the axis
            c = f.calc_center_median() - Vector(center)
            ax = {'x': 0, 'y': 1, 'z': 2}[axis]
            if c[ax] > 0: f.material_index = mat_face
    return r['verts']

def build(s):
    bm = bmesh.new()
    L, W, wb = s['L'], s['W'], s['wb']
    hl, hw = L / 2, W / 2
    nose, tail = s['nose'], s['tail']
    mid = s.get('mid', False)
    flares = s.get('flares', False)
    small = L < 3.4
    wx = [wb / 2 + (-.05 if mid else .05), -wb / 2]
    R = .31
    c0 = -hl + L * s['cab'][0]; c1 = -hl + L * s['cab'][1]; clen = c1 - c0
    hatch = s['cab'][0] < .16
    belt = .74 if small else .8
    roof = belt + (.52 if small else .56) - (.08 if mid else 0)
    noseH = belt - .14 - nose * .3
    tailH = belt - (.0 if hatch else .05)

    def half_w(u):
        w = hw
        if u > hl - .7: w -= hw * nose * ((u - (hl - .7)) / .7) ** 2
        if u < -hl + .6: w -= hw * tail * .6 * ((-hl + .6 - u) / .6) ** 2
        if flares:
            for x in wx: w += .045 * (1 - smoothstep(.0, .55, abs(u - x)))
        return w

    def top_z(u):
        if u >= c1: return belt + (noseH - belt) * smoothstep(c1, hl, u) ** .8
        if u <= c0: return belt + (tailH - belt) * smoothstep(c0, -hl, u)
        return belt

    def bot_z(u):
        z = .22
        if u > hl - .35: z += .1 * smoothstep(hl - .35, hl, u)
        if u < -hl + .3: z += .08 * smoothstep(-hl + .3, -hl, u)
        for x in wx:
            d = abs(u - x)
            ar = R + (.1 if flares else .07)
            if d < ar: z = max(z, R + math.sqrt(ar * ar - d * d) * .72)
        return z

    # stations: dense around arches and ends
    us = set()
    for k in range(0, 23): us.add(round(-hl + L * k / 22, 3))
    for x in wx:
        for k in range(-5, 6): us.add(round(x + k * .085, 3))
    us.update([round(-hl + .03, 3), round(hl - .03, 3), round(c0, 3), round(c1, 3)])
    us = sorted(u for u in us if -hl <= u <= hl)
    st = []
    for u in us:
        w, zt, zb = half_w(u), top_z(u), bot_z(u)
        end = 1 - min(1, min(u + hl, hl - u) / .05)  # 1 at the very ends
        w *= 1 - .07 * end; zt -= .05 * end; zb += .04 * end
        zb = min(zb, zt - .22)
        sh = .06 if not small else .05
        half = [(w - .05, zb), (w, zb + .05), (w + .005, zt - .16), (w - .03, zt - .05), (w - .14, zt)]
        ring = [(0, zb)] + half + [(0, zt + .025)] + [(-v, z) for v, z in reversed(half)]
        st.append((u, ring))
    shell, rows = loft(bm, st, M['body'])
    # lower band of the shell reads as dark sills and bumpers
    for f in shell:
        zc = f.calc_center_median().z
        if zc < .3: f.material_index = M['trim']

    # bevel the hard creases so highlights roll over the shoulders
    edges = [e for e in bm.edges if e.is_manifold and len(e.link_faces) == 2 and e.calc_face_angle(0) > math.radians(28)]
    try: bmesh.ops.bevel(bm, geom=edges, offset=.018, offset_type='OFFSET', segments=1, profile=.5, affect='EDGES')
    except Exception: pass

    # glasshouse
    rwb = min(hw - .06, W * s['roofW'] / 2 + .05)
    rwt = W * s['roofW'] / 2 - .12
    r0 = c0 + clen * (.12 if hatch else .26)
    r1 = c1 - clen * .32
    def cab_ring(h):
        zt = belt + h
        b2 = belt + min(h, .07)
        half = [(rwb, belt - .02), (rwb - .01, b2), (rwt, zt - .05), (rwt - .07, zt)]
        return [(-v, z) for v, z in half] + [(v, z) for v, z in reversed(half)]
    H = roof - belt
    cst = [(c0 - .02, cab_ring(.02)), (r0, cab_ring(H)), (r1, cab_ring(H)), (c1 + .02, cab_ring(.02))]
    cfaces, crows = loft(bm, cst, M['body'], close_first=False, close_last=False)
    glass = []
    for f in cfaces:
        c = f.calc_center_median(); n = f.normal
        if c.z > belt + .06 and c.z < roof - .03:
            f.material_index = M['glass']; glass.append(f)
        elif c.z >= roof - .03:
            f.material_index = M['roof'] if s.get('roofCol') else M['body']
    # frames and pillars: inset every pane, the ring stays body coloured
    if glass:
        r = bmesh.ops.inset_individual(bm, faces=glass, thickness=.045, depth=-.006)
        for f in r['faces']: f.material_index = M['roof'] if s.get('roofCol') else M['body']
    # roof number roundel
    mx = (r0 + r1) / 2
    disc(bm, (mx, 0, roof + .006), min(.25, (r1 - r0) * .38), .012, 'z', M['white'], 12)

    # lights, grille, bumpers
    zt_n = top_z(hl - .02); wn = half_w(hl - .02) * .93
    round_lights = s['cls'] <= 2
    for sd in (-1, 1):
        if round_lights:
            disc(bm, (hl - .005, sd * (wn - .2), zt_n - .13), .085, .03, 'x', M['trim'], 10, M['head'])
        else:
            box(bm, (hl - .005, sd * (wn - .24), zt_n - .12), (.03, .3, .1), M['head'])
    box(bm, (hl - .005, 0, zt_n - .13), (.03, max(.3, wn - .6), .11), M['dark'])
    box(bm, (hl + .02, 0, .3), (.08, wn * 2 - .05, .13), M['trim'])
    zt_t = top_z(-hl + .02); wt = half_w(-hl + .02) * .93
    for sd in (-1, 1):
        box(bm, (-hl + .005, sd * (wt - .22), zt_t - .14), (.03, .3, .12), M['tail'])
    box(bm, (-hl - .02, 0, .3), (.08, wt * 2 - .05, .13), M['trim'])
    box(bm, (-hl - .005, 0, .42), (.02, .42, .11), M['white'])  # plate
    # door mirrors, sitting on the shoulder just behind the windscreen base
    for sd in (-1, 1):
        box(bm, (c1 - .1, sd * (rwb + .02), belt + .06), (.07, .07, .06), M['trim'])
    # rally light pods on the nose
    n = s.get('pods', 0)
    for i in range(n):
        yy = (i - (n - 1) / 2) * .3
        disc(bm, (hl - .02, yy, zt_n + .08), .09, .07, 'x', M['trim'], 10, M['lens'])
    # bonnet / roof scoop
    if s.get('scoop'):
        box(bm, (c1 + (hl - c1) * .35, 0, top_z(c1 + (hl - c1) * .35) + .03), (.32, .34, .06), M['dark'])
    # louvres on the rear deck of mid-engined cars
    if s.get('louvers'):
        for i in range(5):
            box(bm, (c0 - .15 - i * .1, 0, top_z(c0 - .15 - i * .1) + .012), (.05, rwb * 1.4, .02), M['dark'])
    # wing
    wg = s.get('wing', 0)
    if wg:
        if wg == 1:
            box(bm, (-hl + .14, 0, tailH + .05), (.14, hw * 1.6, .03), M['body'])
        else:
            hgt = .2 if wg == 2 else .3
            span = hw * (1.7 if wg == 2 else 1.9)
            wu = -hl + (.25 if wg == 2 else .2)
            box(bm, (wu, 0, tailH + hgt), (.3 if wg == 3 else .22, span, .035), M['accent'], Matrix.Rotation(-.12, 3, 'Y'))
            for sd in (-1, 1):
                box(bm, (wu + .02, sd * span * .32, tailH + hgt / 2), (.1, .03, hgt), M['trim'])
                if wg == 3: box(bm, (wu, sd * span / 2, tailH + hgt - .02), (.34, .02, .14), M['accent'])
    # mud flaps
    for x in wx:
        for sd in (-1, 1):
            box(bm, (x - .42, sd * (hw - .18), .17), (.02, .2, .22), M['trim'])

    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bmesh.ops.triangulate(bm, faces=list(bm.faces))
    bm.verts.index_update()
    V = []
    for v in bm.verts: V += [round(v.co.x, 3), round(v.co.y, 3), round(v.co.z, 3)]
    T = []
    for f in bm.faces: T += [f.verts[0].index, f.verts[1].index, f.verts[2].index, f.material_index]
    bm.free()
    return {'v': V, 't': T, 'meta': {'belt': belt, 'roof': roof, 'wx': wx, 'tailH': tailH, 'noseH': zt_n, 'hl': hl, 'hw': hw, 'tailZ': zt_t - .14, 'tailV': wt - .22, 'headZ': zt_n - .13, 'headV': wn - .22, 'roofU': (r0 + r1) / 2}}

def wheel():
    bm = bmesh.new()
    segs = 14
    r = bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segs, radius1=.31, radius2=.31, depth=.2)
    bmesh.ops.transform(bm, matrix=Matrix.Rotation(math.pi / 2, 4, 'X'), verts=r['verts'])
    for f in bm.faces:
        f.material_index = M['tyre']
    caps = [f for f in bm.faces if len(f.verts) == segs]
    ins = bmesh.ops.inset_individual(bm, faces=caps, thickness=.08, depth=-.03)
    for f in caps: f.material_index = M['rim']
    # bevel the tyre shoulders a touch
    edges = [e for e in bm.edges if e.is_manifold and e.calc_face_angle(0) > math.radians(60)]
    try: bmesh.ops.bevel(bm, geom=edges, offset=.025, offset_type='OFFSET', segments=1, profile=.5, affect='EDGES')
    except Exception: pass
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bmesh.ops.triangulate(bm, faces=list(bm.faces))
    bm.verts.index_update()
    V = []
    for v in bm.verts: V += [round(v.co.x, 3), round(v.co.y, 3), round(v.co.z, 3)]
    T = []
    for f in bm.faces: T += [f.verts[0].index, f.verts[1].index, f.verts[2].index, f.material_index]
    bm.free()
    return {'v': V, 't': T}

out = {}
for s in SPECS:
    if WANT and s['id'] not in WANT: continue
    out[s['id']] = build(s)
if WHEEL: out['_wheel'] = wheel()
import os
OUTDIR = os.path.join(os.path.expanduser('~'), 'Documents', 'DustlightRally')
os.makedirs(OUTDIR, exist_ok=True)
with open(os.path.join(OUTDIR, 'cars.json'), 'w') as fh: fh.write(json.dumps(out, separators=(',', ':')))
result = {'dir': OUTDIR, 'tris': {k: len(v['t']) // 4 for k, v in out.items()}}
