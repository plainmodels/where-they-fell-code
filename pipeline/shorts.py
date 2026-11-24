"""Cut vertical Shorts from a finished episode.

    python shorts.py <episode_dir>

Reads <episode_dir>/shorts.json: a list of {id, title, head: [lines], beats: [beat ids], sx, sw, tag}.
For each: renders 1080x1920 frames from the same engine (scene cropped, headline above, the narration's
own words as captions below), takes the audio for those beats from the finished episode, and appends a
short end tag. Output: <episode_dir>/shorts/<id>.mp4
"""
import base64, json, pathlib, re, subprocess, sys
from playwright.sync_api import sync_playwright
import render

FPS, TAG_S = 30, 2.6

def cues(beat, tm):
    parts = [p.strip() for p in re.split(r"(?<=[.?!])\s+", beat["text"]) if p.strip()]
    merged = []
    for p in parts:
        if merged and len(merged[-1]) < 28: merged[-1] += " " + p
        else: merged.append(p)
    total, t, out = sum(len(p) for p in merged), tm["start"], []
    for p in merged:
        d = tm["speech"] * len(p) / total; out.append((t, t + d, p)); t += d
    return out

def main(ep_dir):
    ep = pathlib.Path(ep_dir).resolve(); build = ep / "build"; outdir = ep / "shorts"; outdir.mkdir(exist_ok=True)
    sb = json.loads((ep / "storyboard.json").read_text()); tl = json.loads((build / "timeline.json").read_text())
    beats = {b["id"]: b for b in sb["beats"]}; times = {b["id"]: b for b in tl["beats"]}
    final = ep / f"{sb['episode']}.mp4"; page_path = render.write_page(ep)
    with sync_playwright() as pw:
        browser, page = render.open_page(pw, page_path)
        only = sys.argv[2:] 
        for sh in [x for x in json.loads((ep / "shorts.json").read_text()) if not only or x["id"] in only]:
            segs = [(times[b]["start"], times[b]["start"] + times[b]["speech"] + 0.35) for b in sh["beats"]]
            allcues = [c for b in sh["beats"] for c in cues(beats[b], times[b])]
            silent = build / f"short_{sh['id']}_silent.mp4"
            enc = subprocess.Popen(["ffmpeg", "-loglevel", "error", "-y", "-f", "image2pipe", "-framerate", str(FPS), "-c:v", "mjpeg", "-i", "-",
                                    "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", str(silent)], stdin=subprocess.PIPE)
            n = 0
            for a, b in segs:
                for f in range(int((b - a) * FPS)):
                    T = a + f / FPS
                    cap = next((c[2] for c in allcues if c[0] <= T < c[1]), "")
                    cfg = {"head": sh["head"], "cap": cap, "sx": sh["sx"], "sw": sh["sw"], "tag": False}
                    enc.stdin.write(base64.b64decode(page.evaluate("([t, c]) => frameShort(t, c)", [T, cfg]))); n += 1
            tagcfg = {"head": sh["head"], "cap": sh.get("tag", "Full video on the channel"), "sx": sh["sx"], "sw": sh["sw"], "tag": True}
            tagframe = base64.b64decode(page.evaluate("([t, c]) => frameShort(t, c)", [segs[-1][1], tagcfg]))
            for _ in range(int(TAG_S * FPS)): enc.stdin.write(tagframe); n += 1
            enc.stdin.close(); enc.wait()
            # audio: the same ranges from the finished episode, then silence under the end tag
            parts = "".join(f"[0:a]atrim={a}:{b},asetpts=PTS-STARTPTS,afade=t=in:d=0.05,afade=t=out:st={b - a - 0.12}:d=0.12[a{i}];" for i, (a, b) in enumerate(segs))
            cat = "".join(f"[a{i}]" for i in range(len(segs))) + f"concat=n={len(segs)}:v=0:a=1,apad=pad_dur={TAG_S}[a]"
            out = outdir / f"{sh['id']}.mp4"
            subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", str(final), "-i", str(silent), "-filter_complex", parts + cat,
                            "-map", "1:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-ar", "48000", "-b:a", "160k", "-shortest",
                            "-movflags", "+faststart", str(out)], check=True)
            print(f"{sh['id']}: {n / FPS:.1f}s -> {out} ({out.stat().st_size / 1e6:.1f} MB)")
        browser.close()

if __name__ == "__main__":
    main(sys.argv[1])
