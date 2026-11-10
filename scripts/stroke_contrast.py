"""Boundary contrast of the 1px #0C111D bot outline vs the pill pixels just outside each bot (median of ring samples above/below/left)."""
import json, statistics
from PIL import Image
B=json.load(open("screens/_tri/boxes.json"))
def L(c):
    r=[(v/255)/12.92 if v/255<=.04045 else ((v/255+.055)/1.055)**2.4 for v in c[:3]]
    return .2126*r[0]+.7152*r[1]+.0722*r[2]
cr=lambda a,b:(max(L(a),L(b))+.05)/(min(L(a),L(b))+.05)
S=(0x0c,0x11,0x1d); styles=["frosted","dark","iridescent","aurora","pixel","refraction"]; bds=["gradient","busy","light"]
out={}
for tri in ["violet","black"]:
  for st in styles:
    for bd in bds:
      n=f"{tri}-{st}-{bd}"; im=Image.open(f"screens/_tri/{n}.png").convert("RGB")
      for sh,b in B[n].items():
        x0,y0,x1,y1=[int(v*2) for v in (b["x"],b["y"],b["x"]+b["w"],b["y"]+b["h"])]
        px=[im.getpixel((x,y)) for x in range(x0+8,x1-8) for y in (y0-4,y0-3)]+[im.getpixel((x0-4,y)) for y in range(y0+8,y1-8)]
        out.setdefault(n,{})[sh]=round(statistics.median(cr(S,p) for p in px),2)
json.dump(out,open("screens/_tri/stroke-contrast.json","w"),indent=1)
for tri in ["violet","black"]:
  print(tri, "(blob square drop tri) gradient | busy | light")
  for st in styles: print(f"{st:11}"," | ".join(" ".join(f"{out[f'{tri}-{st}-{bd}'][s]:5}" for s in ["blob","square","drop","tri"]) for bd in bds))
