#!/usr/bin/env python3
"""Composite big thumbnail text over a hero image (e.g. a Gemini-generated background).

    /usr/bin/python3 thumb_overlay.py spec.json

spec.json:
{"image": "hero.png", "out": "publish/thumbnail_b.png",
 "shade": "left",            # optional darkening gradient: left | right | top | bottom | none
 "lines": [{"text": "8,457 STORMS", "size": 120, "color": "#ffffff", "x": 50, "y": 180},
           {"text": "NONE CROSSED", "size": 150, "color": "#ffd400", "x": 50, "y": 320, "font": "impact"}]}

Coordinates are on a 1280x720 canvas. The image is cover-cropped to 16:9. Text gets a thick black stroke and a soft
drop shadow so it survives at phone size (168 px wide). Output is a JPEG-quality PNG under 2 MB.
Numbers in thumbnails must come from the episode's factcheck.csv; this tool only draws what the spec says.
"""
import json, sys, pathlib
from PIL import Image, ImageDraw, ImageFont, ImageFilter

FONTS = {"impact": "/usr/share/fonts/truetype/msttcorefonts/Impact.ttf",
         "black": "/usr/share/fonts/truetype/msttcorefonts/Arial_Black.ttf",
         "lato": "/usr/share/fonts/truetype/lato/Lato-Black.ttf"}
W, H = 1280, 720


def font(name, size):
    import subprocess
    path = FONTS.get(name, FONTS["impact"])
    if not pathlib.Path(path).exists():
        fam = {"impact": "Impact", "black": "Arial Black", "lato": "Lato Black"}.get(name, "Impact")
        path = subprocess.run(["fc-match", "-f", "%{file}", fam], capture_output=True, text=True).stdout
    return ImageFont.truetype(path, size)


def cover(im):
    im = im.convert("RGB"); r = max(W / im.width, H / im.height)
    im = im.resize((round(im.width * r), round(im.height * r)), Image.LANCZOS)
    x = (im.width - W) // 2; y = (im.height - H) // 2
    return im.crop((x, y, x + W, y + H))


def shade(im, side):
    if side in (None, "none"): return im
    g = Image.new("L", (W, H), 0); d = ImageDraw.Draw(g)
    for i in range(W if side in ("left", "right") else H):
        a = int(170 * max(0, 1 - i / ((W if side in ("left", "right") else H) * (0.6 if side in ("left", "right") else 0.45))))
        if side == "left": d.line([(i, 0), (i, H)], fill=a)
        elif side == "top": d.line([(0, i), (W, i)], fill=a)
        elif side == "right": d.line([(W - 1 - i, 0), (W - 1 - i, H)], fill=a)
        else: d.line([(0, H - 1 - i), (W, H - 1 - i)], fill=a)
    return Image.composite(Image.new("RGB", (W, H), (0, 0, 0)), im, g)


def main(spec_path):
    sp = pathlib.Path(spec_path); s = json.loads(sp.read_text()); base = sp.parent
    src = Image.open(base / s["image"])
    # Gemini stamps a sparkle in the bottom-right corner. "keep" (default 0.9) keeps that fraction of the width and
    # height from the top-left, which cuts the sparkle off. Set "keep": 1 for images without the mark.
    k = s.get("keep", 0.9)
    if k < 1: src = src.crop((0, 0, round(src.width * k), round(src.height * k)))
    im = shade(cover(src), s.get("shade", "left"))
    shadow = Image.new("L", (W, H), 0); sd = ImageDraw.Draw(shadow)
    for ln in s["lines"]:
        f = font(ln.get("font", "impact"), ln["size"])
        sd.text((ln["x"] + 6, ln["y"] + 8), ln["text"], font=f, fill=255, stroke_width=ln.get("stroke", max(4, ln["size"] // 14)))
    im = Image.composite(Image.new("RGB", (W, H), (0, 0, 0)), im, shadow.filter(ImageFilter.GaussianBlur(8)).point(lambda v: v * 0.7))
    d = ImageDraw.Draw(im)
    for ln in s["lines"]:
        f = font(ln.get("font", "impact"), ln["size"])
        d.text((ln["x"], ln["y"]), ln["text"], font=f, fill=ln.get("color", "#ffffff"),
               stroke_width=ln.get("stroke", max(4, ln["size"] // 14)), stroke_fill=ln.get("stroke_color", "#000000"))
    out = base / s["out"]; out.parent.mkdir(parents=True, exist_ok=True)
    im.save(out, optimize=True)
    if out.stat().st_size > 2_000_000:
        im.save(out.with_suffix(".jpg"), quality=90); out.unlink(); out = out.with_suffix(".jpg")
    im.resize((168, 94), Image.LANCZOS).save(out.with_name(out.stem + "_phone.png"))
    print(out, out.stat().st_size)


if __name__ == "__main__":
    main(sys.argv[1])
