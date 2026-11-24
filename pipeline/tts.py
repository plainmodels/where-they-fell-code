"""Stage 1: narration. Synthesise each beat locally with Kokoro (Apache-2.0) and write the timeline.

    python tts.py <storyboard.json> <build_dir>

Outputs <build_dir>/audio/<beat>.wav, <build_dir>/narration.wav and <build_dir>/timeline.json.
Beats whose text and voice are unchanged are reused from cache, so edits re-synthesise only what changed.
"""
import hashlib
import json
import pathlib
import sys
import time

import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro

MODELS = pathlib.Path(__file__).resolve().parent / "models"
LEAD_IN = 0.6      # silence before the first beat
TAIL = 1.5         # silence after the last beat


def main(storyboard_path: str, build_dir: str) -> None:
    sb = json.loads(pathlib.Path(storyboard_path).read_text())
    build = pathlib.Path(build_dir)
    audio = build / "audio"
    audio.mkdir(parents=True, exist_ok=True)
    kokoro = None
    sr = 24000
    gap = float(sb.get("gap", 0.4))
    timeline, chunks, t = [], [np.zeros(int(LEAD_IN * sr), dtype=np.float32)], LEAD_IN
    started = time.time()

    engine = sb.get("engine", "kokoro")
    if engine == "gemini":
        # free tier allows ~10 requests a day, so send several beats per request and cut the take at the pauses
        import gemini_say
        def ckey(b): return hashlib.sha256(f"{engine}|{sb['voice']}|{sb['speed']}|{sb['lang']}|{b.get('say') or b['text']}".encode()).hexdigest()[:16]
        todo = [b for b in sb["beats"] if not ((audio / f"{b['id']}.wav").exists() and (audio / f"{b['id']}.key").exists() and (audio / f"{b['id']}.key").read_text() == ckey(b))]
        groups, cur, n = [], [], 0
        for b in todo:
            L = len(b.get("say") or b["text"])
            if cur and (n + L > 1500 or len(cur) >= 5): groups.append(cur); cur, n = [], 0
            cur.append(b); n += L
        if cur: groups.append(cur)
        print(f"gemini: {len(todo)} beats to voice in {len(groups)} requests", flush=True)
        for g in groups:
            parts, gsr = gemini_say.synth_group([b.get("say") or b["text"] for b in g], voice=sb["voice"])
            for b, s in zip(g, parts):
                nz = np.where(np.abs(s) > 0.01)[0]
                if len(nz): s = s[max(0, nz[0] - int(0.08 * gsr)): nz[-1] + int(0.25 * gsr)]
                sf.write(audio / f"{b['id']}.wav", s.astype(np.float32), gsr); (audio / f"{b['id']}.key").write_text(ckey(b))
            print("  done", [b["id"] for b in g], flush=True); time.sleep(3)
    for beat in sb["beats"]:
        say = beat.get("say") or beat["text"]
        key = hashlib.sha256(f"{engine}|{sb['voice']}|{sb['speed']}|{sb['lang']}|{say}".encode()).hexdigest()[:16]
        wav = audio / f"{beat['id']}.wav"
        tag = audio / f"{beat['id']}.key"
        if wav.exists() and tag.exists() and tag.read_text() == key:
            samples, sr = sf.read(wav, dtype="float32")
        else:
            if engine == "gemini":       # Gemini TTS (free key): natural Hindi prosody; trim edge silence so the beat gap stays ours
                import gemini_say
                samples, sr = gemini_say.synth(say, voice=sb["voice"])
                nz = np.where(np.abs(samples) > 0.01)[0]
                if len(nz): samples = samples[max(0, nz[0] - int(0.08 * sr)): nz[-1] + int(0.25 * sr)]
                time.sleep(2)
            else:
                if kokoro is None:
                    kokoro = Kokoro(str(MODELS / "kokoro-v1.0.onnx"), str(MODELS / "voices-v1.0.bin"))
                samples, sr = kokoro.create(say, voice=sb["voice"], speed=float(sb["speed"]), lang=sb["lang"])
            samples = np.asarray(samples, dtype=np.float32)
            sf.write(wav, samples, sr)
            tag.write_text(key)
        dur = len(samples) / sr
        bgap = float(beat.get("gap", gap))  # optional per-beat pause, e.g. to hold a short title card
        timeline.append({"id": beat["id"], "start": round(t, 3), "speech": round(dur, 3),
                         "dur": round(dur + bgap, 3)})
        chunks += [samples, np.zeros(int(bgap * sr), dtype=np.float32)]
        t += dur + bgap

    tail = float(sb.get("tail", TAIL))
    chunks.append(np.zeros(int(tail * sr), dtype=np.float32))
    total = t + tail
    sf.write(build / "narration.wav", np.concatenate(chunks), sr)
    (build / "timeline.json").write_text(json.dumps({"total": round(total, 3), "sr": sr, "beats": timeline}, indent=1))
    words = sum(len(b["text"].split()) for b in sb["beats"])
    print(f"beats={len(timeline)} words={words} total={total:.1f}s ({total/60:.2f} min) "
          f"synth_wall={time.time()-started:.0f}s")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
