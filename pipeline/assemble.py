"""Stage 3: sound, subtitles, final mux and automatic quality checks.

    python assemble.py <episode_dir>

Needs build/video_silent.mp4, build/narration.wav, build/timeline.json. Writes:
  build/bed.wav          original ambient bed synthesised here (no third-party audio)
  <episode>.srt          subtitles cut from the script, timed from the narration
  <episode>.mp4          final video (H.264 1080p30, AAC)
  build/qc.json          measured checks: duration, streams, loudness, narration-versus-script match
"""
import difflib
import json
import pathlib
import re
import subprocess
import sys

import numpy as np
import soundfile as sf

WHISPER = pathlib.Path.home() / "whisper.cpp/build/bin/whisper-cli"
WHISPER_MODEL = pathlib.Path.home() / "whisper.cpp/models/ggml-small.bin"


def run(cmd, **kw):
    return subprocess.run(cmd, check=True, capture_output=True, text=True, **kw)


def make_bed(path, seconds, sb=None, tl=None, sr=48000):
    """Sound bed synthesised from this code: a slow four-chord pad plus quiet cues. Nothing to license.

    Cues: a soft whoosh when the chapter changes, and 'hit', 'tick' or 'whoosh' cues written in the
    storyboard as [fraction of the beat's speech, type].
    """
    n = int(seconds * sr)
    t = np.arange(n) / sr
    chords = [[110.0, 164.81, 220.0, 261.63], [87.31, 130.81, 220.0, 261.63],      # A minor, F
              [130.81, 196.0, 261.63, 329.63], [98.0, 146.83, 246.94, 293.66]]      # C, G
    bar = 12.0
    pad = np.zeros(n)
    for i, ch in enumerate(chords):
        phase = ((t - i * bar) % (bar * len(chords))) / bar          # 0..4, this chord is "on" for 0..1
        env = np.clip(np.minimum(phase, 1.25 - phase) * 4, 0, 1) ** 2  # fades overlap, so chords cross-dissolve
        for j, f in enumerate(ch):
            trem = 0.8 + 0.2 * np.sin(2 * np.pi * (0.07 + 0.013 * j) * t + j)
            pad += env * trem * (np.sin(2 * np.pi * f * t) + 0.5 * np.sin(2 * np.pi * (f * 1.003) * t)) / (1 + j * 0.6)
    pad /= np.max(np.abs(pad))
    fade = int(3 * sr)
    pad[:fade] *= np.linspace(0, 1, fade)
    pad[-fade:] *= np.linspace(1, 0, fade)

    fx = np.zeros(n)
    rng = np.random.default_rng(7)

    def add(at, sig):
        i = int(at * sr)
        if 0 <= i < n:
            m = min(len(sig), n - i)
            fx[i:i + m] += sig[:m]

    def whoosh(dur=0.7):
        x = rng.standard_normal(int(dur * sr))
        k = int(sr / 900)                                             # crude low-pass by moving average
        x = np.convolve(x, np.ones(k) / k, mode="same")
        return x / np.max(np.abs(x)) * np.sin(np.pi * np.linspace(0, 1, len(x))) ** 2 * 0.5

    def hit(dur=0.9):
        tt = np.arange(int(dur * sr)) / sr
        return np.sin(2 * np.pi * (55 + 40 * np.exp(-tt * 9)) * tt) * np.exp(-tt * 5) * 0.9

    def tick(dur=0.12):
        tt = np.arange(int(dur * sr)) / sr
        return np.sin(2 * np.pi * 1400 * tt) * np.exp(-tt * 60) * 0.35

    if sb and tl:
        prev = None
        for beat, tm in zip(sb["beats"], tl["beats"]):
            if beat["chapter"] and beat["chapter"] != prev:
                add(tm["start"] - 0.15, whoosh())
            prev = beat["chapter"] or prev
            for frac, kind in beat.get("sfx", []):
                add(tm["start"] + frac * tm["speech"], {"hit": hit, "tick": tick, "whoosh": whoosh}[kind]())
    mix = pad * 0.5 + fx * 0.9
    sf.write(path, (mix / max(1.0, np.max(np.abs(mix)))).astype(np.float32), sr)


def srt_time(x):
    h, r = divmod(x, 3600)
    m, s = divmod(r, 60)
    return f"{int(h):02d}:{int(m):02d}:{int(s):02d},{int(round((s - int(s)) * 1000)):03d}"


def write_srt(sb, tl, path):
    """Split each beat into sentence-sized cues; time is shared by character count within the beat's speech."""
    cues, n = [], 1
    for beat, tm in zip(sb["beats"], tl["beats"]):
        parts = [p.strip() for p in re.split(r"(?<=[.?!])\s+", beat["text"]) if p.strip()]
        merged = []
        for p in parts:  # avoid one-word cues
            if merged and len(merged[-1]) < 28:
                merged[-1] += " " + p
            else:
                merged.append(p)
        total = sum(len(p) for p in merged)
        t = tm["start"]
        for p in merged:
            d = tm["speech"] * len(p) / total
            cues.append(f"{n}\n{srt_time(t)} --> {srt_time(t + d - 0.05)}\n{p}\n")
            n += 1
            t += d
    path.write_text("\n".join(cues))
    return n - 1


def norm_words(s):
    return re.findall(r"[a-z0-9]+", s.lower())


def main(ep_dir):
    ep = pathlib.Path(ep_dir).resolve()
    build = ep / "build"
    sb = json.loads((ep / "storyboard.json").read_text())
    tl = json.loads((build / "timeline.json").read_text())
    name = sb["episode"]

    make_bed(build / "bed.wav", tl["total"], sb, tl)
    final = ep / f"{name}.mp4"
    # Narration normalised to -16 LUFS; bed sits about 30 dB under it.
    run(["ffmpeg", "-loglevel", "error", "-y", "-i", str(build / "video_silent.mp4"), "-i", str(build / "narration.wav"),
         "-i", str(build / "bed.wav"), "-filter_complex",
         "[1:a]aresample=48000,loudnorm=I=-16:TP=-1.5:LRA=11[n];[2:a]volume=-22dB[b];[n][b]amix=inputs=2:duration=first:normalize=0[a]",
         "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-ar", "48000", "-b:a", "192k", "-movflags", "+faststart",
         "-metadata", f"title={sb['title']}", str(final)])
    cues = write_srt(sb, tl, ep / f"{name}.srt")

    probe = json.loads(run(["ffprobe", "-v", "error", "-print_format", "json", "-show_format", "-show_streams", str(final)]).stdout)
    v = next(s for s in probe["streams"] if s["codec_type"] == "video")
    a = next(s for s in probe["streams"] if s["codec_type"] == "audio")
    loud = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(final), "-af", "ebur128=peak=true", "-f", "null", "-"],
                          capture_output=True, text=True).stderr
    integ = re.findall(r"I:\s+(-?[\d.]+) LUFS", loud)
    peak = re.findall(r"Peak:\s+(-?[\d.]+) dBFS", loud)

    # Narration check: transcribe each beat of the synthetic voice and compare with what it was asked to say.
    # Numbers are ignored on both sides because the transcriber writes digits where the script has words.
    NUM = set("zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen "
              "seventeen eighteen nineteen twenty thirty forty fifty sixty seventy eighty ninety hundred thousand point and "
              "first second third thirteenth".split())
    def content(s):
        return [w for w in norm_words(s) if w not in NUM and not w.isdigit() and not re.fullmatch(r"\d+(st|nd|rd|th)", w)]
    diffs, asked_n, same_n, low = [], 0, 0, []
    for beat in sb["beats"]:
        w16 = build / "audio" / f"{beat['id']}.16k.wav"
        run(["ffmpeg", "-loglevel", "error", "-y", "-i", str(build / "audio" / f"{beat['id']}.wav"), "-ar", "16000", "-ac", "1", str(w16)])
        heard = content(run([str(WHISPER), "-m", str(WHISPER_MODEL), "-l", "en", "-f", str(w16), "-nt"]).stdout)
        asked = content(beat.get("say") or beat["text"])
        sm = difflib.SequenceMatcher(a=asked, b=heard, autojunk=False)
        same = sum(i2 - i1 for op, i1, i2, j1, j2 in sm.get_opcodes() if op == "equal")
        asked_n += len(asked); same_n += same
        if asked and same / len(asked) < 0.9:
            low.append(beat["id"])
        diffs += [(beat["id"], " ".join(asked[i1:i2]), " ".join(heard[j1:j2])) for op, i1, i2, j1, j2 in sm.get_opcodes() if op != "equal"]
        w16.unlink()
    class _R:  # keeps the report fields below unchanged
        def ratio(self): return same_n / max(1, asked_n)
    sm = _R(); asked = list(range(asked_n))

    qc = {
        "file": str(final), "size_mb": round(final.stat().st_size / 1e6, 1),
        "duration_s": round(float(probe["format"]["duration"]), 2), "duration_min": round(float(probe["format"]["duration"]) / 60, 2),
        "video": f"{v['codec_name']} {v['width']}x{v['height']} {v['r_frame_rate']}", "audio": f"{a['codec_name']} {a['sample_rate']} Hz",
        "loudness_lufs": float(integ[-1]) if integ else None, "true_peak_dbfs": float(peak[-1]) if peak else None,
        "subtitle_cues": cues, "script_words": len(asked), "narration_match_ratio": round(sm.ratio(), 4),
        "narration_differences": diffs, "beats_below_90_percent": low,
    }
    (build / "qc.json").write_text(json.dumps(qc, indent=1))
    print(json.dumps({k: v for k, v in qc.items() if k != "narration_differences"}, indent=1))
    print(f"differences between script and transcription: {len(diffs)}")
    for bid, want, got in diffs[:60]:
        print(f"   {bid}: asked {want!r:34} heard {got!r}")


if __name__ == "__main__":
    main(sys.argv[1])
