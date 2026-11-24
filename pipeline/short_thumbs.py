"""Draw a vertical thumbnail (1080x1920) for each Short from the episode's own frames.

    python short_thumbs.py <episode_dir>

Reads shorts.json; each entry may carry "thumb": {"big": [lines], "small": "line", "beat": id, "at": 0..1}.
Output: <episode_dir>/shorts/<id>_thumb.jpg
"""
import base64, json, pathlib, sys
from playwright.sync_api import sync_playwright
import render

JS = r"""([T, cfg, th]) => {
  if (typeof thumbShort === 'function') return thumbShort(T, cfg, th);   // a channel engine may draw its own
  frameShort(T, cfg);
  const c = shortCanvas.getContext('2d'), W = 1080;
  c.fillStyle = '#0d1117'; c.fillRect(0, 0, W, 496);
  c.textAlign = 'center'; c.textBaseline = 'alphabetic';
  c.font = '600 34px "Noto Sans"'; c.fillStyle = '#8b949e'; c.fillText('UNDER TEST', W / 2, 96);
  th.big.forEach((l, i) => { let s = 150; c.font = `800 ${s}px "Noto Sans"`;
    while (c.measureText(l).width > 980) { s -= 4; c.font = `800 ${s}px "Noto Sans"`; }
    const last = i === th.big.length - 1; c.fillStyle = last ? '#ff6b6b' : '#ffffff';
    c.shadowColor = last ? '#ff6b6b' : 'transparent'; c.shadowBlur = last ? 28 : 0; c.fillText(l, W / 2, 250 + i * 160); });
  c.shadowBlur = 0;
  const y = 1500; c.font = '700 64px "Noto Sans"'; c.fillStyle = '#58a6ff';
  wrapLines(c, th.small, 940).forEach((l, i) => c.fillText(l, W / 2, y + i * 84));
  return shortCanvas.toDataURL('image/jpeg', 0.92).split(',')[1];
}"""

def main(ep_dir):
    ep = pathlib.Path(ep_dir).resolve(); build = ep / "build"
    tl = {b["id"]: b for b in json.loads((build / "timeline.json").read_text())["beats"]}
    with sync_playwright() as pw:
        browser, page = render.open_page(pw, render.write_page(ep))
        for sh in json.loads((ep / "shorts.json").read_text()):
            th = sh.get("thumb")
            if not th: continue
            b = tl[th.get("beat", sh["beats"][-1])]; T = b["start"] + b["speech"] * th.get("at", 0.95)
            cfg = {"head": [], "cap": "", "sx": sh["sx"], "sw": sh["sw"], "tag": False}
            out = ep / "shorts" / f"{sh['id']}_thumb.jpg"
            out.write_bytes(base64.b64decode(page.evaluate(JS, [T, cfg, th])))
            print("wrote", out, out.stat().st_size // 1024, "KB")
        browser.close()

if __name__ == "__main__":
    main(sys.argv[1])
