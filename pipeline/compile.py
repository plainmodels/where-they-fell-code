"""Join finished episodes into one long compilation video, with chapters and merged captions.

    python compile.py <out_dir> <ep_dir> [<ep_dir> ...]

Each episode is cut just before its end card (the last one keeps its end card), re-encoded once into <out_dir>/compilation.mp4.
Writes chapters.txt (one chapter per episode, YouTube format) and compilation.srt (each episode's captions shifted).
Episode titles come from each storyboard.json. Run under the render lock: flock .render.lock ...
"""
import json, pathlib, re, subprocess, sys

def ts(s): h, r = divmod(s, 3600); m, s2 = divmod(r, 60); return f"{int(h):02d}:{int(m):02d}:{s2:06.3f}".replace(".", ",")
def pts(x): h, m, s = x.replace(",", ".").split(":"); return int(h) * 3600 + int(m) * 60 + float(s)

def main(out, eps):
    out = pathlib.Path(out); out.mkdir(parents=True, exist_ok=True); parts, chapters, cues, t0 = [], [], [], 0.0
    for i, e in enumerate(eps):
        e = pathlib.Path(e).resolve(); sb = json.loads((e / "storyboard.json").read_text()); tl = json.loads((e / "build/timeline.json").read_text())
        mp4 = e / f"{sb['episode']}.mp4"; srt = e / f"{sb['episode']}.srt"
        last = i == len(eps) - 1; end_beat = next((k for k, b in enumerate(sb["beats"]) if b["scene"] == "endcard" or b["scene"].endswith("_endcard")), None)
        cut = tl["total"] if (last or end_beat is None) else tl["beats"][end_beat]["start"] + 0.4
        parts.append((mp4, cut)); chapters.append((t0, sb["title"]))
        if srt.exists():
            for block in srt.read_text().strip().split("\n\n"):
                L = block.splitlines()
                if len(L) < 3 or "-->" not in L[1]: continue
                a, b = [pts(x.strip()) for x in L[1].split("-->")]
                if a < cut: cues.append((t0 + a, t0 + min(b, cut), "\n".join(L[2:])))
        t0 += cut
    inputs = sum([["-i", str(p)] for p, _ in parts], [])
    fc = "".join(f"[{i}:v]trim=0:{c},setpts=PTS-STARTPTS[v{i}];[{i}:a]atrim=0:{c},asetpts=PTS-STARTPTS,afade=t=out:st={max(0, c - 0.3)}:d=0.3[a{i}];" for i, (_, c) in enumerate(parts))
    fc += "".join(f"[v{i}][a{i}]" for i in range(len(parts))) + f"concat=n={len(parts)}:v=1:a=1[v][a]"
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", *inputs, "-filter_complex", fc, "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-preset", "medium",
                    "-crf", "20", "-pix_fmt", "yuv420p", "-r", "30", "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-movflags", "+faststart", str(out / "compilation.mp4")], check=True)
    (out / "chapters.txt").write_text("\n".join(f"{int(s // 3600)}:{int(s % 3600 // 60):02d}:{int(s % 60):02d} {t}" if t0 >= 3600 else f"{int(s // 60):02d}:{int(s % 60):02d} {t}" for s, t in chapters) + "\n")
    (out / "compilation.srt").write_text("\n\n".join(f"{k + 1}\n{ts(a)} --> {ts(b)}\n{x}" for k, (a, b, x) in enumerate(cues)) + "\n")
    print(f"{len(parts)} episodes, {t0 / 60:.1f} min -> {out / 'compilation.mp4'}"); print((out / "chapters.txt").read_text())

if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2:])
