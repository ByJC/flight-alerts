#!/usr/bin/env python3
"""Generate the Flight Alerts app icon: an alert (warning triangle + !) on a
warm gradient squircle. Renders a 4096px master with supersampling, then writes
a full macOS .iconset (downscaled with LANCZOS for clean anti-aliasing)."""
import math
import os
from PIL import Image, ImageDraw

BIG = 4096                      # supersampled master size
R_CORNER = round(BIG * 0.2235)  # macOS Big Sur squircle corner radius
TOP = (255, 169, 38)            # amber
BOT = (244, 56, 38)             # alert red
TRI_FILL = (255, 255, 255)      # white warning triangle
MARK = (240, 78, 38)            # exclamation mark (mid-gradient orange)

OUT_DIR = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.normpath(os.path.join(OUT_DIR, "..", "assets"))


def vertical_gradient(w, h, top, bot):
    grad = Image.new("RGB", (1, h))
    for y in range(h):
        t = y / (h - 1)
        grad.putpixel((0, y), tuple(round(top[i] + (bot[i] - top[i]) * t) for i in range(3)))
    return grad.resize((w, h), Image.BILINEAR)


def rounded_polygon(draw, verts, r, fill):
    """Fill a polygon with rounded corners of radius r."""
    n = len(verts)
    ring = []
    for i in range(n):
        cur = verts[i]
        prv = verts[(i - 1) % n]
        nxt = verts[(i + 1) % n]
        v1 = (prv[0] - cur[0], prv[1] - cur[1])
        v2 = (nxt[0] - cur[0], nxt[1] - cur[1])
        l1 = math.hypot(*v1)
        l2 = math.hypot(*v2)
        v1 = (v1[0] / l1, v1[1] / l1)
        v2 = (v2[0] / l2, v2[1] / l2)
        theta = math.acos(max(-1.0, min(1.0, v1[0] * v2[0] + v1[1] * v2[1])))
        tan_len = r / math.tan(theta / 2)
        t_prev = (cur[0] + v1[0] * tan_len, cur[1] + v1[1] * tan_len)
        t_next = (cur[0] + v2[0] * tan_len, cur[1] + v2[1] * tan_len)
        bis = (v1[0] + v2[0], v1[1] + v2[1])
        bl = math.hypot(*bis)
        bis = (bis[0] / bl, bis[1] / bl)
        cdist = r / math.sin(theta / 2)
        center = (cur[0] + bis[0] * cdist, cur[1] + bis[1] * cdist)
        draw.ellipse([center[0] - r, center[1] - r, center[0] + r, center[1] + r], fill=fill)
        ring.extend([t_prev, t_next])
    draw.polygon(ring, fill=fill)


def build_master():
    img = Image.new("RGBA", (BIG, BIG), (0, 0, 0, 0))

    # Squircle background filled with the vertical gradient.
    mask = Image.new("L", (BIG, BIG), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, BIG - 1, BIG - 1], radius=R_CORNER, fill=255)
    grad = vertical_gradient(BIG, BIG, TOP, BOT).convert("RGBA")
    img.paste(grad, (0, 0), mask)

    d = ImageDraw.Draw(img)
    cx = BIG / 2
    cy = BIG / 2 + BIG * 0.03   # nudge down a touch for optical centering
    R = BIG * 0.34              # triangle circumradius

    top_v = (cx, cy - R)
    bl = (cx - R * math.sin(math.radians(60)), cy + R * 0.5)
    br = (cx + R * math.sin(math.radians(60)), cy + R * 0.5)
    rounded_polygon(d, [top_v, br, bl], r=BIG * 0.055, fill=TRI_FILL)

    # Exclamation mark, centered in the triangle's lower body.
    stem_w = R * 0.135
    stem_top = cy - R * 0.30
    stem_bot = cy + R * 0.20
    d.rounded_rectangle(
        [cx - stem_w, stem_top, cx + stem_w, stem_bot],
        radius=stem_w, fill=MARK,
    )
    dot_r = R * 0.105
    dot_cy = cy + R * 0.40
    d.ellipse([cx - dot_r, dot_cy - dot_r, cx + dot_r, dot_cy + dot_r], fill=MARK)

    return img


def main():
    master = build_master()
    iconset = os.path.join(ASSETS, "AppIcon.iconset")
    os.makedirs(iconset, exist_ok=True)
    specs = [
        ("icon_16x16.png", 16), ("icon_16x16@2x.png", 32),
        ("icon_32x32.png", 32), ("icon_32x32@2x.png", 64),
        ("icon_128x128.png", 128), ("icon_128x128@2x.png", 256),
        ("icon_256x256.png", 256), ("icon_256x256@2x.png", 512),
        ("icon_512x512.png", 512), ("icon_512x512@2x.png", 1024),
    ]
    for name, size in specs:
        master.resize((size, size), Image.LANCZOS).save(os.path.join(iconset, name))
    master.resize((1024, 1024), Image.LANCZOS).save(os.path.join(ASSETS, "icon-preview.png"))
    print("iconset written to", iconset)


if __name__ == "__main__":
    main()
