"""Stage 2: picture. Render frames from the deterministic canvas engine in headless Chrome and encode.

    python render.py <episode_dir> [--fps 30] [--workers 6] [--still T ...]

Reads  <episode_dir>/storyboard.json, <episode_dir>/build/timeline.json, <episode_dir>/data.json
Writes <episode_dir>/build/video_silent.mp4, or PNG stills with --still (used for quality checks and thumbnails).
"""
import argparse
import base64
import json
import pathlib
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor

from playwright.sync_api import sync_playwright

HERE = pathlib.Path(__file__).resolve().parent
ENGINE = HERE / "engine"


def engine_for(ep: pathlib.Path) -> pathlib.Path:
    """A channel folder may carry its own engine (its own visual system): <channel>/engine/engine.js.
    Episodes of Under Test (youtube/epNN) have no such folder next to them and use the shared one."""
    own = ep.parent / "engine" / "engine.js"
    return own if own.exists() else ENGINE / "engine.js"


def write_page(ep: pathlib.Path) -> pathlib.Path:
    build = ep / "build"
    data = {
        "storyboard": json.loads((ep / "storyboard.json").read_text()),
        "timeline": json.loads((build / "timeline.json").read_text()),
        "data": json.loads((ep / "data.json").read_text()),
    }
    (build / "data.js").write_text("window.EP = " + json.dumps(data, ensure_ascii=False) + ";")
    page = build / "page.html"
    page.write_text(
        "<!doctype html><meta charset='utf-8'><style>html,body{margin:0;background:#000}canvas{display:block}</style>"
        "<canvas id='c' width='1920' height='1080'></canvas>"
        "<script src='data.js'></script>"
        f"<script>{engine_for(ep).read_text()}</script>"
        + (f"<script>{(ep / 'scenes.js').read_text()}</script>" if (ep / "scenes.js").exists() else "")
    )
    return page


def open_page(pw, page_path):
    browser = pw.chromium.launch(channel="chrome", headless=True)
    page = browser.new_page(viewport={"width": 1920, "height": 1080})
    page.goto(page_path.as_uri())
    page.evaluate("init()")
    return browser, page


def render_segment(args):
    page_path, out, f0, f1, fps = args
    enc = subprocess.Popen(
        ["ffmpeg", "-loglevel", "error", "-y", "-f", "image2pipe", "-framerate", str(fps), "-c:v", "mjpeg", "-i", "-",
         "-c:v", "libx264", "-preset", "medium", "-crf", "17", "-pix_fmt", "yuv420p", "-r", str(fps), str(out)],
        stdin=subprocess.PIPE)
    with sync_playwright() as pw:
        browser, page = open_page(pw, page_path)
        for f in range(f0, f1):
            b64 = page.evaluate("([t]) => frameJPEG(t, 0.94)", [f / fps])
            enc.stdin.write(base64.b64decode(b64))
        browser.close()
    enc.stdin.close()
    if enc.wait() != 0:
        raise RuntimeError(f"encoder failed for {out}")
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("episode")
    ap.add_argument("--fps", type=int, default=30)
    ap.add_argument("--workers", type=int, default=6)
    ap.add_argument("--still", type=float, nargs="*")
    a = ap.parse_args()
    ep = pathlib.Path(a.episode).resolve()
    build = ep / "build"
    page_path = write_page(ep)
    total = json.loads((build / "timeline.json").read_text())["total"]

    if a.still is not None:
        out = build / "stills"
        out.mkdir(exist_ok=True)
        with sync_playwright() as pw:
            browser, page = open_page(pw, page_path)
            for t in a.still:
                b64 = page.evaluate("([t]) => frameJPEG(t, 0.9)", [t])
                (out / f"t{t:07.2f}.jpg").write_bytes(base64.b64decode(b64))
            browser.close()
        print(f"wrote {len(a.still)} stills to {out}")
        return

    frames = int(total * a.fps)
    seg_dir = build / "segments"
    seg_dir.mkdir(exist_ok=True)
    bounds = [round(i * frames / a.workers) for i in range(a.workers + 1)]
    jobs = [(page_path, seg_dir / f"seg{i:02d}.mp4", bounds[i], bounds[i + 1], a.fps) for i in range(a.workers)]
    started = time.time()
    with ThreadPoolExecutor(max_workers=a.workers) as ex:
        segs = list(ex.map(render_segment, jobs))
    lst = build / "segments.txt"
    lst.write_text("".join(f"file '{s}'\n" for s in segs))
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", str(lst),
                    "-c", "copy", str(build / "video_silent.mp4")], check=True)
    wall = time.time() - started
    print(f"frames={frames} wall={wall:.0f}s ({frames / wall:.1f} fps) -> {build / 'video_silent.mp4'}")


if __name__ == "__main__":
    sys.exit(main())
