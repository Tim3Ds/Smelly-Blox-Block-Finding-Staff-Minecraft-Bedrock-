#!/usr/bin/env python3
"""
Prepare staff icons and particle textures.

Actions:
- Normalize transparency (alpha threshold) and create 64x64 icons for item textures.
- Generate small particle sprite textures for each dye color.
- Write simple particle JSON files under SmellyBlox_RP/particles/ for each color.

Run from repo root: python3 tools/prepare_icons_and_particles.py
Requires Pillow and numpy (already available).
"""
from PIL import Image, ImageDraw, ImageFilter
import os
colors=['white','orange','magenta','light_blue','yellow','lime','pink','gray','light_gray','cyan','purple','blue','brown','green','red','black']
base_dir=os.path.join('SmellyBlox_RP','textures','items')
particles_dir=os.path.join('SmellyBlox_RP','textures','particles')
particles_json_dir=os.path.join('SmellyBlox_RP','particles')
os.makedirs(particles_dir, exist_ok=True)
os.makedirs(particles_json_dir, exist_ok=True)

def clamp_alpha(im, thresh=200):
    im = im.convert('RGBA')
    px = im.load()
    w,h = im.size
    for y in range(h):
        for x in range(w):
            r,g,b,a = px[x,y]
            if a < thresh:
                px[x,y] = (r,g,b,0)
            else:
                px[x,y] = (r,g,b,255)
    return im

def make_icon(src_path, dst_path, size=64):
    im = Image.open(src_path).convert('RGBA')
    im = clamp_alpha(im, thresh=200)
    # Create thumbnail preserving aspect
    im.thumbnail((size,size), Image.LANCZOS)
    canvas = Image.new('RGBA', (size,size), (0,0,0,0))
    # center
    ox = (size - im.width)//2
    oy = (size - im.height)//2
    canvas.paste(im, (ox,oy), im)
    canvas.save(dst_path)

def make_particle_texture(dst_path, color_rgb, size=32):
    img = Image.new('RGBA', (size,size), (0,0,0,0))
    draw = ImageDraw.Draw(img)
    # radial gradient
    cx,cy = size/2,size/2
    maxr = size/2
    for r in range(int(maxr),0,-1):
        f = r/maxr
        alpha = int(255 * (f**2))
        col = (int(color_rgb[0]*f), int(color_rgb[1]*f), int(color_rgb[2]*f), alpha)
        draw.ellipse((cx-r,cy-r,cx+r,cy+r), fill=col)
    img = img.filter(ImageFilter.GaussianBlur(radius=1))
    img.save(dst_path)

rgb_map={
 'white':(255,255,255),'orange':(255,165,0),'magenta':(255,0,255),'light_blue':(173,216,230),'yellow':(255,255,0),'lime':(0,255,0),'pink':(255,192,203),'gray':(128,128,128),'light_gray':(200,200,200),'cyan':(0,255,255),'purple':(160,32,240),'blue':(0,0,255),'brown':(150,75,0),'green':(0,128,0),'red':(255,0,0),'black':(30,30,30)
}

for c in colors:
    src = os.path.join(base_dir, f'poop_staff_{c}.png')
    if not os.path.exists(src):
        print('missing',src);
        continue
    # replace with 64x64 cleaned icon
    make_icon(src, src, size=64)
    # particle texture
    ptex = os.path.join(particles_dir, f'beam_{c}.png')
    make_particle_texture(ptex, rgb_map.get(c,(255,255,255)), size=32)
    # particle json
    pj = os.path.join(particles_json_dir, f'beam_{c}.json')
    identifier = f"smellyblox:beam_{c}"
    txt = f'''{{
  "format_version": "1.16.0",
  "particle": {{
    "description": {{
      "identifier": "{identifier}",
      "textures": ["textures/particles/beam_{c}"],
      "lifetime": {{"min": 5, "max": 10}},
      "size": 0.2,
      "render_method": "billboard"
    }}
  }}
}}'''
    with open(pj,'w') as f:
        f.write(txt)
    print('wrote particle',identifier)

print('done')
