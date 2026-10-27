import json, base64, struct
SP='/tmp/claude-0/-home-claude/5bbfe2f5-99a7-5948-8949-7c5e3106215d/scratchpad'
d=json.load(open('cars.json'))
out=[]
for k,m in d.items():
    v=m['v']; t=m['t']
    pos=struct.pack('<%dh'%len(v), *[int(round(x*1000)) for x in v])
    idx=[]; mats=[]
    for i in range(0,len(t),4): idx+=t[i:i+3]; mats.append(t[i+3])
    rec={'p':base64.b64encode(pos).decode(),'i':base64.b64encode(struct.pack('<%dH'%len(idx),*idx)).decode(),'m':base64.b64encode(bytes(mats)).decode()}
    if 'meta' in m: rec['meta']={a:(round(b,3) if isinstance(b,float) else [round(x,3) for x in b] if isinstance(b,list) else b) for a,b in m['meta'].items()}
    out.append(f"  {json.dumps(k)}: {json.dumps(rec,separators=(',',':'))}")
js="// low-poly car bodies modelled in Blender (bmesh, bevelled creases), stored as mm int16 positions, uint16 triangles and per-triangle material ids\nconst CAR_MESH = {\n"+",\n".join(out)+"\n};\n"
open('js/012_carmesh.js','w').write(js); print(len(js))
