#!/usr/bin/env python3
"""
Generate `poop_staff_<color>.png` from `poop_staff_base.png` by recoloring only the aura
around the crystal. This preserves the base art (crystal, staff, shadows) and only tints
the halo/glow to match Minecraft dye colors.

Run from repo root:
    python3 tools/generate_aura_variants.py

Requires Pillow (pip install Pillow).
"""
from PIL import Image
import os

colors = {
    'white': (255,255,255),
    'orange': (255,165,0),
    'magenta': (255,0,255),
    'light_blue': (173,216,230),
    'yellow': (255,255,0),
    'lime': (0,255,0),
    'pink': (255,192,203),
    'gray': (128,128,128),
    'light_gray': (200,200,200),
    'cyan': (0,255,255),
    'purple': (160,32,240),
    'blue': (0,0,255),
    'brown': (150,75,0),
    'green': (0,128,0),
    'red': (255,0,0),
    'black': (30,30,30)
}

BASE = os.path.join('SmellyBlox_RP','textures','items','poop_staff_base.png')
OUTDIR = os.path.join('SmellyBlox_RP','textures','items')
os.makedirs(OUTDIR, exist_ok=True)

def is_halo_pixel(r,g,b):
    # Heuristic: halo is magenta/purple-ish: R and B are relatively high compared to G
    return (r > 90 and b > 90 and g < 140 and (r + b) > (g * 2))

def recolor_halo(base_img, target_rgb):
    im = base_img.copy().convert('RGBA')
    px = im.load()
    w,h = im.size
    for y in range(h):
        for x in range(w):
            r,g,b,a = px[x,y]
            if a == 0:
                continue
            if is_halo_pixel(r,g,b):
                # preserve shading: scale target color by original pixel brightness
                brightness = (r + g + b) / (3.0 * 255.0)
                nr = int(target_rgb[0] * brightness)
                ng = int(target_rgb[1] * brightness)
                nb = int(target_rgb[2] * brightness)
                px[x,y] = (nr, ng, nb, a)
    return im

def main():
    if not os.path.exists(BASE):
        print('Base image not found:', BASE)
        return
    base = Image.open(BASE).convert('RGBA')
    for name, rgb in colors.items():
        outp = os.path.join(OUTDIR, f'poop_staff_{name}.png')
        img = recolor_halo(base, rgb)
        img.save(outp)
        print('wrote', outp)

if __name__ == '__main__':
    main()
