#!/usr/bin/env python3
"""Shot compositor: renders an episode from <ep>/shots.json + <ep>/assets/ over the finished episode's own audio.

    python shotcomp.py <ep_dir> [--from 0 --to 60] [--workers 3] [--assets DIR] [--out PATH] [--contact]
    python shotcomp.py <ep_dir> --short all|<id> [--assets DIR]          # 9:16 Shorts from <ep>/shorts.json

Run renders under the shared lock:  flock ~/project-zero/.render.lock .venv/bin/python youtube/pipeline/shotcomp.py ...

Shot kinds (see cmjmoto/cm01/make_shots.py):
  image  assets/iNNN.png  2.5D parallax from a Depth-Anything-V2 depth map (cached in assets/.depth/) + camera move + overlay
  video  assets/vNN.mp4   plays its window of the clip (half a = first half, half b = second half); slowed (max 1.6x,
                          frame-blended) if the shot is longer than the window, ping-pong beyond that; never freezes
  chart  number card drawn here (Hindi via Pillow+raqm) over the shot's image, blurred and darkened
Missing assets render as labelled placeholder frames, so the cut can be checked before the art exists.
Cross-fades 0.4 s (shots.json "xfade"). Audio: the old episode file's audio, untouched (it is already -16 LUFS);
the result is measured with ebur128 and printed. Nothing is burned in for the long video (subtitles stay as .srt);
Shorts get their headline + Hindi captions + end tag, like the old Shorts.
"""
import argparse, io, json, math, os, pathlib, subprocess, sys, textwrap, zlib
import numpy as np, cv2
from PIL import Image, ImageDraw, ImageFont, ImageFilter

HERE = pathlib.Path(__file__).resolve().parent
DEPTH_MODEL = HERE / "models" / "depth_anything_v2_small.onnx"
FONT_B = "/usr/share/fonts/truetype/noto/NotoSansDevanagari-Bold.ttf"
FONT_R = "/usr/share/fonts/truetype/noto/NotoSansDevanagari-Regular.ttf"
FPS, OVERSCAN, TAG_S = 30, 1.18, 2.6
INK, CREAM, HOT, TEAL, MUTED = (43, 29, 20), (243, 230, 204), (214, 92, 26), (38, 110, 110), (120, 96, 74)

def font(px, bold=True): return ImageFont.truetype(FONT_B if bold else FONT_R, int(px))
def ease(p): p = min(max(p, 0.0), 1.0); return 0.65 * p + 0.35 * (0.5 - 0.5 * math.cos(math.pi * p))

# ---------------- depth ----------------
_sess = None
def depth_map(img_path, cache_dir):
    cache_dir.mkdir(parents=True, exist_ok=True)
    out = cache_dir / (pathlib.Path(img_path).stem + ".png")
    if out.exists() and out.stat().st_mtime >= os.path.getmtime(img_path): return cv2.imread(str(out), cv2.IMREAD_GRAYSCALE)
    global _sess
    if _sess is None:
        import onnxruntime as ort
        so = ort.SessionOptions(); so.intra_op_num_threads = 4
        _sess = ort.InferenceSession(str(DEPTH_MODEL), so, providers=["CPUExecutionProvider"])
    img = cv2.imread(str(img_path))[:, :, ::-1]; h, w = img.shape[:2]
    H = 518; W = max(14, int(round(H * w / h / 14)) * 14)
    x = cv2.resize(img, (W, H), interpolation=cv2.INTER_AREA).astype(np.float32) / 255
    x = ((x - [0.485, 0.456, 0.406]) / [0.229, 0.224, 0.225]).transpose(2, 0, 1)[None].astype(np.float32)
    d = _sess.run(None, {_sess.get_inputs()[0].name: x})[0][0]
    lo, hi = np.percentile(d, 2), np.percentile(d, 98); d = np.clip((d - lo) / max(hi - lo, 1e-6), 0, 1)
    d = cv2.GaussianBlur((d * 255).astype(np.uint8), (0, 0), 3)
    cv2.imwrite(str(out), d); return d

# ---------------- placeholder ----------------
def placeholder(shot, W, H, label=None):
    kind = shot["kind"]; top, bot = ((70, 52, 40), (28, 20, 16)) if kind != "video" else ((40, 70, 72), (14, 26, 28))
    g = np.linspace(0, 1, H)[:, None, None]; arr = (np.array(top) * (1 - g) + np.array(bot) * g).repeat(W, 1).astype(np.uint8)
    im = Image.fromarray(arr); d = ImageDraw.Draw(im); s = min(W, H) / 1080
    for k in range(1, 12):                                   # floor grid so camera moves read
        y = int(H * (0.55 + 0.45 * (k / 11) ** 2)); d.line([(0, y), (W, y)], fill=(90, 70, 55), width=2)
    for k in range(-8, 9): d.line([(W / 2 + k * 40 * s, H * 0.55), (W / 2 + k * 260 * s, H)], fill=(90, 70, 55), width=2)
    name = label or pathlib.Path(shot["asset"]).name
    d.text((60 * s, 50 * s), f"{name}   [{kind.upper()} · MISSING]", font=font(64 * s), fill=(255, 214, 150))
    d.text((60 * s, 135 * s), f"{shot['id']} · {shot['start']:.1f}-{shot['end']:.1f}s · {shot.get('motion', '')} {shot.get('overlay') or ''}",
           font=font(34 * s, False), fill=(230, 210, 180))
    wrap = textwrap.wrap(shot.get("subject", ""), width=70 if W > H else 36)
    for i, line in enumerate(wrap[:8]): d.text((60 * s, (200 + i * 46) * s), line, font=font(34 * s, False), fill=(245, 235, 220))
    return np.array(im)[:, :, ::-1].copy()

# ---------------- image source: 2.5D parallax ----------------
MOTIONS = {   # z0, z1, (cx0, cy0) -> (cx1, cy1) as fraction of free slack, lateral parallax (dx, dy) px@1080p, radial R
    "push_in":    (1.00, 1.13, (0, 0), (0, -0.15), (0, 0), 0.07),
    "pull_out":   (1.13, 1.00, (0, -0.15), (0, 0), (0, 0), -0.07),
    "pan_right":  (1.06, 1.06, (-0.7, 0), (0.7, 0), (38, 0), 0.0),
    "pan_left":   (1.06, 1.06, (0.7, 0), (-0.7, 0), (-38, 0), 0.0),
    "tilt_up":    (1.07, 1.07, (0, 0.7), (0, -0.7), (0, -26), 0.0),
    "tilt_down":  (1.07, 1.07, (0, -0.7), (0, 0.7), (0, 26), 0.0),
    "orbit_left": (1.09, 1.11, (0.15, 0), (-0.15, 0), (-60, 0), 0.0),
    "orbit_right":(1.09, 1.11, (-0.15, 0), (0.15, 0), (60, 0), 0.0),
    "drift":      (1.04, 1.08, (-0.2, 0.1), (0.2, -0.1), (16, 0), 0.02),
}

class ImageSrc:
    def __init__(self, shot, path, W, H, depth_dir, vertical=False, label=None):
        self.W, self.H, self.shot = W, H, shot
        if path and path.exists():
            img = cv2.imread(str(path)); dep = depth_map(path, depth_dir); self.missing = False
        else:
            img = placeholder(shot, 1920 if not vertical else 1080, 1080 if not vertical else 1920, label)
            hh = img.shape[0]; dep = (np.linspace(0, 255, hh)[:, None] ** 1.0).repeat(img.shape[1], 1).astype(np.uint8); self.missing = True
        ih, iw = img.shape[:2]; sc = max(W * OVERSCAN / iw, H * OVERSCAN / ih)
        BW, BH = int(iw * sc + 0.5), int(ih * sc + 0.5)
        self.img = cv2.resize(img, (BW, BH), interpolation=cv2.INTER_CUBIC if sc > 1 else cv2.INTER_AREA)
        self.dep = cv2.resize(dep, (BW, BH), interpolation=cv2.INTER_LINEAR).astype(np.float32) / 255 - 0.5
        self.BW, self.BH = BW, BH
        m = shot.get("motion") or "drift"; self.m = MOTIONS.get(m, MOTIONS["drift"])
        if vertical and m in ("pan_left", "pan_right"):           # a 16:9 still has lots of slack sideways in 9:16
            z0, z1, c0, c1, par, R = self.m; self.m = (z0, z1, (c0[0] * 0.35, c0[1]), (c1[0] * 0.35, c1[1]), par, R)
        xs, ys = np.meshgrid(np.arange(W, dtype=np.float32) - W / 2, np.arange(H, dtype=np.float32) - H / 2)
        self.xs, self.ys = xs, ys; self.k = min(W, H) / 1080
        self.fx = shot.get("fx", 0.5)

    def frame(self, lt, dur):
        z0, z1, c0, c1, (pdx, pdy), R = self.m; e = ease(lt / max(dur, 1e-3))
        z = z0 + (z1 - z0) * e; win_w, win_h = self.W / z, self.H / z
        sx_free, sy_free = (self.BW - win_w) / 2 - 8, (self.BH - win_h) / 2 - 8
        base_cx = self.BW / 2 + (self.fx - 0.5) * 2 * max(sx_free, 0)
        cx = base_cx + (c0[0] + (c1[0] - c0[0]) * e) * sx_free * 0.6
        cy = self.BH / 2 + (c0[1] + (c1[1] - c0[1]) * e) * sy_free * 0.6
        cx = float(np.clip(cx, win_w / 2 + 4, self.BW - win_w / 2 - 4)); cy = float(np.clip(cy, win_h / 2 + 4, self.BH - win_h / 2 - 4))
        A = np.float32([[1 / z, 0, cx - self.W / 2 / z], [0, 1 / z, cy - self.H / 2 / z]])
        d = cv2.warpAffine(self.dep, A, (self.W, self.H), flags=cv2.INTER_LINEAR | cv2.WARP_INVERSE_MAP, borderMode=cv2.BORDER_REPLICATE)
        lat = (2 * e - 1) * self.k
        rad = 1 - 2 * abs(R) * (e if R > 0 else (1 - e)) * d if R else 1
        mx = cx + self.xs / z * rad + d * (pdx * lat)
        my = cy + self.ys / z * rad + d * (pdy * lat)
        return cv2.remap(self.img, mx, my, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)

# ---------------- video source ----------------
def probe_len(p):
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(p)], capture_output=True, text=True)
    return float(r.stdout.strip() or 0)

class VideoSrc:
    def __init__(self, shot, path, W, H, need, lt0):
        self.W, self.H, self.path, self.shot = W, H, path, shot
        L = probe_len(path); w0, w1 = shot.get("window", [0, 8]); s = L / 8.0
        w0, w1 = w0 * s, (L if w1 >= 8 else w1 * s); avail = max(w1 - w0 - 0.05, 0.5)
        self.rate, self.pingpong = 1.0, False
        if need <= avail: start = w0 if shot.get("half", "a") == "a" else max(w0, w1 - need)
        else:
            start = w0; self.rate = avail / need
            if self.rate < 0.62: self.rate, self.pingpong = 1.0, True
        self.start, self.avail, self.lt0 = start, avail, lt0     # clip time(lt) = start + (lt - lt0) * rate
        self.proc, self.idx, self.last, self.frames = None, -1, None, None

    def _open(self, skip_s):
        vf = f"scale={self.W}:{self.H}:force_original_aspect_ratio=increase,crop={self.W}:{self.H}"
        ss = self.start + max(skip_s, 0) * self.rate
        if self.rate < 0.999: vf = f"setpts=PTS/{self.rate:.4f}," + vf + f",framerate=fps={FPS}"
        else: vf += f",fps={FPS}"
        self.proc = subprocess.Popen(["ffmpeg", "-loglevel", "error", "-ss", f"{ss:.3f}", "-t", f"{self.avail + 0.5:.3f}", "-i", str(self.path),
                                      "-vf", vf, "-an", "-f", "rawvideo", "-pix_fmt", "bgr24", "-"], stdout=subprocess.PIPE)

    def _read(self):
        n = self.W * self.H * 3; buf = self.proc.stdout.read(n)
        return np.frombuffer(buf, np.uint8).reshape(self.H, self.W, 3) if len(buf) == n else None

    def frame(self, lt, dur):
        if self.pingpong:
            if self.frames is None:
                self._open(0); self.frames = []
                while (f := self._read()) is not None: self.frames.append(cv2.imencode(".jpg", f, [cv2.IMWRITE_JPEG_QUALITY, 93])[1])
            k = max(int(round((lt - self.lt0) * FPS)), 0)
            n = len(self.frames); j = k % (2 * n - 2) if n > 1 else 0; j = j if j < n else 2 * n - 2 - j
            img = cv2.imdecode(self.frames[j], cv2.IMREAD_COLOR)
        else:
            if self.proc is None: self.lt_open = lt; self._open(lt - self.lt0)
            k = int(round((lt - self.lt_open) * FPS))
            while self.idx < k:
                f = self._read(); self.idx += 1
                if f is None: break
                self.last = f
            img = self.last if self.last is not None else np.zeros((self.H, self.W, 3), np.uint8)
        z = 1.0 + 0.035 * ease(lt / max(dur, 1e-3))                 # gentle push so cuts between halves breathe
        M = cv2.getRotationMatrix2D((self.W / 2, self.H / 2), 0, z)
        return cv2.warpAffine(img, M, (self.W, self.H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)

    def close(self):
        if self.proc: self.proc.stdout.close(); self.proc.kill(); self.proc.wait()

# ---------------- chart ----------------
def rgba_text(txt, px, bold=True, fill=INK):
    f = font(px, bold); l, t, r, b = f.getbbox(txt); im = Image.new("RGBA", (r - l + 8, int(px * 1.5)), (0, 0, 0, 0))
    ImageDraw.Draw(im).text((4 - l, int(px * 0.2)), txt, font=f, fill=fill); return im

def bgra(im): a = np.array(im.convert("RGBA")); return a[..., [2, 1, 0, 3]].copy()

def wrap_px(txt, px, maxw, bold=False):
    f = font(px, bold); out, cur = [], ""
    for w in txt.split():
        t = (cur + " " + w).strip()
        if f.getlength(t) <= maxw or not cur: cur = t
        else: out.append(cur); cur = w
    if cur: out.append(cur)
    return out

class ChartSrc:
    """number card on top of the shot's painted image (blurred, darkened). Elements appear at their own narration times."""
    def __init__(self, shot, bg, W, H):
        self.bg, self.W, self.H, self.shot = bg, W, H, shot; c = shot["chart"]; v = H > W
        s = (W / 1920) if not v else (W / 1080) * 0.95
        PW = int((1360 if not v else 980) * (W / 1920 if not v else W / 1080)); pad = int(56 * s)
        rows = c["rows"]; head = c.get("head"); layers = []          # (Image RGBA, (x, y), t_abs, kind, extra)
        if c["type"] == "numbers" and not v:                          # fit the card to its content
            need = max(font(96 * s).getlength(r["big"]) for r in rows) + 50 * s + max(font(42 * s, False).getlength(r["small"]) for r in rows)
            if head: need = max(need, font(50 * s).getlength(head))
            PW = int(min(max(need + 2 * pad + 10 * s, 900 * s), PW))
        y = pad
        if head:
            for line in wrap_px(head, 50 * s, PW - 2 * pad, True):
                layers.append((rgba_text(line, 50 * s, True, INK), (pad, y), None, "static", None)); y += int(66 * s)
            y += int(18 * s)
        if c["type"] == "numbers":
            bigw = max(font(96 * s).getlength(r["big"]) for r in rows) + 50 * s
            for r in rows:
                col = HOT if r.get("hot") else INK
                big = rgba_text(r["big"], 96 * s, True, col)
                if not v:
                    sm = wrap_px(r["small"], 42 * s, PW - 2 * pad - bigw)
                    layers.append((big, (pad, y), r["t"], "rise", None))
                    for i, line in enumerate(sm[:2]):
                        layers.append((rgba_text(line, 42 * s, False, MUTED if not r.get("hot") else INK), (int(pad + bigw), int(y + 44 * s + i * 54 * s - (len(sm) - 1) * 26 * s)), r["t"], "rise", None))
                    y += int(150 * s)
                else:
                    layers.append((big, (pad, y), r["t"], "rise", None)); y += int(130 * s)
                    for line in wrap_px(r["small"], 40 * s, PW - 2 * pad)[:2]:
                        layers.append((rgba_text(line, 40 * s, False, MUTED), (pad, y), r["t"], "rise", None)); y += int(54 * s)
                    y += int(30 * s)
        else:
            labw = 0 if v else int(380 * s); barw = PW - 2 * pad - labw - int(200 * s)
            for r in rows:
                col = HOT if r.get("hot") else TEAL
                layers.append((rgba_text(r["label"], 46 * s, True, INK), (pad, y), r["t"], "rise", None))
                if r.get("sub"):
                    for i, line in enumerate(wrap_px(r["sub"], 26 * s, (labw - 20 * s) if labw else PW - 2 * pad)[:2]):
                        layers.append((rgba_text(line, 26 * s, False, MUTED), (pad, int(y + 64 * s + i * 34 * s)), r["t"], "rise", None))
                by = y + (int(6 * s) if labw else int(140 * s)); bx = pad + labw
                L = max(int(barw * r["v"] / c["max"]), int(10 * s)); bh = int(64 * s)
                bar = Image.new("RGBA", (L + int(220 * s), bh), (0, 0, 0, 0)); d = ImageDraw.Draw(bar)
                d.rounded_rectangle([0, 0, L, bh - 1], radius=int(10 * s), fill=col + (255,), outline=INK + (255,), width=max(2, int(3 * s)))
                d.text((L + int(18 * s), int(-6 * s)), r["txt"], font=font(52 * s), fill=(HOT if r.get("hot") else INK) + (255,))
                layers.append((bar, (bx, by), r["t"], "wipe", L + int(220 * s)))
                y += int((150 if labw else 240) * s)
        if c.get("src"):
            y += int(6 * s); layers.append((rgba_text(c["src"], 24 * s, False, MUTED), (pad, y), None, "static", None)); y += int(40 * s)
        PH = y + pad
        panel = Image.new("RGBA", (PW + int(18 * s), PH + int(18 * s)), (0, 0, 0, 0)); d = ImageDraw.Draw(panel)
        d.rounded_rectangle([int(14 * s), int(14 * s), PW + int(14 * s), PH + int(14 * s)], radius=int(22 * s), fill=INK + (235,))
        d.rounded_rectangle([0, 0, PW, PH], radius=int(22 * s), fill=CREAM + (250,), outline=INK + (255,), width=max(3, int(5 * s)))
        d.rectangle([int(5 * s), int(26 * s), int(16 * s), PH - int(26 * s)], fill=HOT + (255,))
        rng = np.random.default_rng(7); tex = (rng.normal(0, 6, (PH, PW))).astype(np.int16)  # paper grain
        a = np.array(panel).astype(np.int16); a[:PH, :PW, :3] = np.clip(a[:PH, :PW, :3] + tex[..., None] * (a[:PH, :PW, 3:4] > 0), 0, 255)
        self.panel = a.astype(np.uint8)[..., [2, 1, 0, 3]].copy()
        self.px, self.py = (W - PW) // 2, (H - PH) // 2 + (0 if not v else int(H * 0.04))
        self.layers = [(bgra(im), xy, t, kind, ex) for im, xy, t, kind, ex in layers]
        self.stamp = None
        if c.get("stamp"):
            st = rgba_text(c["stamp"]["txt"], 52 * s, True, (200, 40, 30)); sw, sh = st.size
            box = Image.new("RGBA", (sw + int(40 * s), sh + int(20 * s)), (0, 0, 0, 0)); ImageDraw.Draw(box).rounded_rectangle(
                [2, 2, box.size[0] - 3, box.size[1] - 3], radius=int(8 * s), outline=(200, 40, 30, 255), width=max(3, int(6 * s)))
            box.alpha_composite(st, (int(20 * s), int(4 * s))); box = box.rotate(7, expand=True, resample=Image.BICUBIC)
            self.stamp = (bgra(box), (self.px + PW - box.size[0] + int(30 * s), self.py - int(box.size[1] * 0.45)), c["stamp"]["t"])
        self.t0 = shot["start"]          # lt is time since the original shot start, so episode time = start + lt

    @staticmethod
    def _over(dst, rgba, x, y, alpha=1.0, w=None):
        h, wd = rgba.shape[:2]; wd = wd if w is None else max(0, min(w, wd))
        x0, y0, x1, y1 = max(x, 0), max(y, 0), min(x + wd, dst.shape[1]), min(y + h, dst.shape[0])
        if x1 <= x0 or y1 <= y0 or alpha <= 0: return
        src = rgba[y0 - y:y1 - y, x0 - x:x1 - x].astype(np.float32); a = src[..., 3:4] / 255 * alpha
        roi = dst[y0:y1, x0:x1].astype(np.float32); dst[y0:y1, x0:x1, :3] = (roi[..., :3] * (1 - a) + src[..., :3] * a).astype(np.uint8)

    def frame(self, lt, dur):
        f = self.bg.frame(lt, dur); sm = cv2.resize(f, (self.W // 4, self.H // 4), interpolation=cv2.INTER_AREA)
        f = cv2.resize(cv2.GaussianBlur(sm, (0, 0), 1.6), (self.W, self.H), interpolation=cv2.INTER_LINEAR)
        f = cv2.convertScaleAbs(f, alpha=0.72, beta=0)
        T = self.t0 + lt; pin = ease((lt + 0.2) / 0.6)
        panel = self.panel.copy()
        for im, (x, y), t, kind, ex in self.layers:
            if t is None: self._over(panel, im, x, y, 1.0); continue
            g = ease((T - t) / 0.55) if T > t - 0.01 else 0.0
            if t <= self.t0 + 0.05: g = 1.0
            if g <= 0: continue
            if kind == "wipe": self._over(panel, im, x, y, 1.0, int(ex * ease((T - t) / 0.9)) if t > self.t0 + 0.05 else None)
            else: self._over(panel, im, x, y + int((1 - g) * 18), g)
        if pin < 1:
            sc = 0.94 + 0.06 * pin; panel = cv2.resize(panel, None, fx=sc, fy=sc, interpolation=cv2.INTER_AREA)
            dx = (self.panel.shape[1] - panel.shape[1]) // 2; dy = (self.panel.shape[0] - panel.shape[0]) // 2
        else: dx = dy = 0
        self._over(f, panel, self.px + dx, self.py + dy, pin)
        if self.stamp:
            im, (x, y), t = self.stamp
            if T >= t: self._over(f, im, x, y, ease((T - t) / 0.3))
        return f

# ---------------- overlays ----------------
def smooth_noise(n, seed, octaves=4):
    rng = np.random.default_rng(seed); out = np.zeros((n, n), np.float32)
    for o in range(octaves):
        k = 4 * 2 ** o; small = rng.random((k, k)).astype(np.float32)
        small = np.pad(small, 1, mode="wrap"); big = cv2.resize(small, (n + 2 * n // k, n + 2 * n // k), interpolation=cv2.INTER_CUBIC)
        out += big[n // k:n // k + n, n // k:n // k + n] / 2 ** o
    out -= out.min(); return out / out.max()

class Overlay:
    def __init__(self, kind, W, H, seed):
        self.kind, self.W, self.H = kind, W, H; rng = np.random.default_rng(seed); self.rng = rng
        if kind in ("dust", "sparks"):
            n = 110 if kind == "dust" else 70
            self.p = rng.random((n, 2)).astype(np.float32); self.sz = rng.uniform(1, 3.6, n); self.ph = rng.random(n) * 6.28
            self.br = rng.uniform(0.35, 1.0, n); self.sp = rng.uniform(0.3, 1.0, n)
        if kind in ("smoke", "haze"):
            self.tex = smooth_noise(256, seed); self.tex2 = smooth_noise(256, seed + 1)
            g = np.linspace(0, 1, H, dtype=np.float32)[:, None]
            self.mask = (np.clip((g - 0.35) / 0.65, 0, 1) ** 1.2) if kind == "smoke" else (0.55 + 0.45 * (1 - g))
        if kind == "rain":
            n = 420; self.p = rng.random((n, 2)).astype(np.float32); self.sp = rng.uniform(0.8, 1.3, n)
        if kind == "flicker": self.fl = smooth_noise(64, seed, 3)[0]
        if kind == "heat": self.ys, self.xs = np.mgrid[0:H, 0:W].astype(np.float32)

    def apply(self, f, lt):
        k, W, H = self.kind, self.W, self.H; s = min(W, H) / 1080
        if k == "dust" or k == "sparks":
            layer = np.zeros_like(f)
            if k == "dust":
                x = (self.p[:, 0] + lt * 0.012 * self.sp + 0.01 * np.sin(lt * 0.8 + self.ph)) % 1 * W
                y = (self.p[:, 1] - lt * 0.006 * self.sp + 0.012 * np.sin(lt * 0.6 + self.ph * 2)) % 1 * H
                for xi, yi, r, b in zip(x, y, self.sz, self.br):
                    c = int(150 * b); cv2.circle(layer, (int(xi), int(yi)), max(1, int(r * s)), (c * 0.75, c * 0.9, c), -1, cv2.LINE_AA)
                layer = cv2.GaussianBlur(layer, (0, 0), 1.2)
            else:
                life = (lt * 0.9 * self.sp + self.ph) % 1.0
                x = (0.35 + 0.3 * self.p[:, 0] + (self.p[:, 0] - 0.5) * 0.25 * life) * W
                y = (0.62 - 0.35 * life * self.sp + 0.18 * life ** 2) * H
                for xi, yi, r, l in zip(x, y, self.sz, life):
                    c = 255 * (1 - l); cv2.circle(layer, (int(xi), int(yi)), max(1, int(r * s * 0.8)), (c * 0.3, c * 0.7, c), -1, cv2.LINE_AA)
                layer = cv2.add(layer, cv2.GaussianBlur(layer, (0, 0), 3))
            return cv2.add(f, layer)
        if k in ("smoke", "haze"):
            t1 = np.roll(self.tex, (int(lt * 6), int(-lt * 14 if k == "smoke" else -lt * 5)), (0, 1))
            t2 = np.roll(self.tex2, (int(-lt * 4), int(lt * 9)), (0, 1))
            n = cv2.resize((t1 * 0.6 + t2 * 0.4), (W, H), interpolation=cv2.INTER_CUBIC)
            a = (np.clip((n - 0.35) * 1.8, 0, 1) * self.mask * (0.42 if k == "smoke" else 0.2))[..., None]
            col = np.array([205, 200, 190] if k == "smoke" else [170, 200, 235], np.float32)
            return (f.astype(np.float32) * (1 - a) + col * a).astype(np.uint8)
        if k == "flicker":
            v = self.fl[int(lt * 9) % 64] * 0.6 + self.fl[int(lt * 23) % 64] * 0.4
            return cv2.convertScaleAbs(f, alpha=0.93 + 0.12 * v, beta=0)
        if k == "rain":
            layer = np.zeros_like(f); L = 34 * s
            x = (self.p[:, 0] + lt * 0.08) % 1 * W; y = (self.p[:, 1] + lt * 1.6 * self.sp) % 1 * H
            for xi, yi in zip(x, y): cv2.line(layer, (int(xi), int(yi)), (int(xi - L * 0.25), int(yi - L)), (120, 125, 130), 1, cv2.LINE_AA)
            f = cv2.convertScaleAbs(f, alpha=0.9, beta=0); return cv2.add(f, layer)
        if k == "heat":
            band = np.clip((self.ys / H - 0.45) / 0.55, 0, 1)
            dx = np.sin(self.ys * 0.09 + lt * 7) * 1.6 * s * band; dy = np.sin(self.xs * 0.05 + lt * 5) * 0.8 * s * band
            return cv2.remap(f, self.xs + dx, self.ys + dy, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
        return f

class Grade:
    def __init__(self, W, H):
        yy, xx = np.mgrid[0:H, 0:W].astype(np.float32); r = np.sqrt(((xx - W / 2) / (W / 2)) ** 2 + ((yy - H / 2) / (H / 2)) ** 2)
        self.vig = np.clip(1.0 - 0.22 * np.clip(r - 0.55, 0, 1) ** 1.6, 0, 1)[..., None].astype(np.float32)
        rng = np.random.default_rng(3); self.grain = rng.normal(0, 3.2, (H + 64, W + 64)).astype(np.float32)
    def apply(self, f, fi):
        o = (fi * 37) % 64; g = self.grain[o:o + f.shape[0], (fi * 17) % 64:(fi * 17) % 64 + f.shape[1]]
        return np.clip(f.astype(np.float32) * self.vig + g[..., None], 0, 255).astype(np.uint8)

# ---------------- text (Shorts) ----------------
def text_block(lines, px, maxw, fill=(255, 255, 255), stroke=(20, 12, 8), bold=True, align="center"):
    f = font(px, bold); out = []
    for ln in lines: out += wrap_px(ln, px, maxw, bold)
    lh = int(px * 1.45); W = int(maxw + px); im = Image.new("RGBA", (W, lh * len(out) + int(px * 0.6)), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    for i, ln in enumerate(out):
        w = f.getlength(ln); x = (W - w) / 2 if align == "center" else px / 2
        d.text((x, i * lh + px * 0.1), ln, font=f, fill=fill, stroke_width=max(2, px // 12), stroke_fill=stroke)
    return bgra(im)

def srt_cues(path):
    import re
    out = []
    for blk in pathlib.Path(path).read_text(encoding="utf-8").strip().split("\n\n"):
        L = blk.strip().split("\n")
        m = re.match(r"(\d+):(\d+):(\d+),(\d+) --> (\d+):(\d+):(\d+),(\d+)", L[1])
        g = list(map(int, m.groups())); a = g[0] * 3600 + g[1] * 60 + g[2] + g[3] / 1000; b = g[4] * 3600 + g[5] * 60 + g[6] + g[7] / 1000
        out.append((a, b, " ".join(L[2:])))
    return out

# ---------------- timeline + render ----------------
def make_src(sh, ep, assets, W, H, vertical, need, lt0):
    p = assets / pathlib.Path(sh["asset"]).name if sh.get("asset") else None
    if sh["kind"] == "video":
        if p and p.exists(): return VideoSrc(sh, p, W, H, need, lt0)
        still = p.with_suffix(".png") if p else None        # fallback: a painted still of the clip, animated in code
        if still and still.exists():
            return ImageSrc(dict(sh, motion="push_in" if sh.get("half", "a") == "a" else "pull_out"), still, W, H, assets / ".depth", vertical)
        return ImageSrc(dict(sh, motion="push_in"), None, W, H, assets / ".depth", vertical, label=f"{p.name} ({sh.get('half', 'a')} half)")
    img = ImageSrc(sh, p, W, H, assets / ".depth", vertical)
    if sh["kind"] == "chart": return ChartSrc(sh, img, W, H)
    return img

def render(vshots, total, W, H, out, ep, assets, captions=None, head=None, tag=None, xf=0.4, f0=0, f1=None, log=True):
    """vshots: [{..shot.., vstart, vend, voff}] on the output timeline. Writes video-only H.264 to out."""
    vertical = H > W; grade = Grade(W, H); f1 = f1 if f1 is not None else int(round(total * FPS))
    enc = subprocess.Popen(["ffmpeg", "-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
                            "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-r", str(FPS), str(out)], stdin=subprocess.PIPE)
    live, ovl = {}, {}; hx = xf / 2; cap_cache = {}
    head_img = text_block(head, 64, W - 160) if head else None
    for fi in range(f0, f1):
        t = fi / FPS; act = []
        for i, s in enumerate(vshots):
            a, b = s["vstart"] - (hx if i else 0), s["vend"] + (hx if i < len(vshots) - 1 else 0)
            if a <= t < b or (i == len(vshots) - 1 and t >= a): act.append(i)
        for i in list(live):
            if i not in act:
                if hasattr(live[i], "close"): live[i].close()
                del live[i]; ovl.pop(i, None)
        frames = []
        for i in act:
            s = vshots[i]; dur = s["dur"]; lt = t - s["vstart"] + s["voff"]
            if i not in live:
                need = (s["vend"] - s["vstart"]) + 2 * hx + 0.1
                lt0 = s["voff"] - (hx if i else 0)
                live[i] = make_src(s, ep, assets, W, H, vertical, need, lt0)
                if s.get("overlay"): ovl[i] = Overlay(s["overlay"], W, H, seed=zlib.crc32(s["id"].encode()) & 0xffff)
            fr = live[i].frame(lt, dur)
            if i in ovl: fr = ovl[i].apply(fr, lt)
            w = 1.0
            if len(act) > 1:
                if i == act[0]: w = 1 - ease((t - (vshots[act[1]]["vstart"] - hx)) / xf)
                else: w = ease((t - (s["vstart"] - hx)) / xf)
            frames.append((fr, w))
        f = frames[0][0] if len(frames) == 1 else cv2.addWeighted(frames[0][0], frames[0][1], frames[1][0], 1 - frames[0][1], 0)
        f = grade.apply(f, fi)
        if vertical and (head_img is not None or captions):
            if tag and t >= tag[0]:
                f = cv2.convertScaleAbs(f, alpha=0.45); tb = cap_cache.setdefault("__tag", text_block([tag[1]], 70, W - 160))
                ChartSrc._over(f, tb, (W - tb.shape[1]) // 2, (H - tb.shape[0]) // 2, ease((t - tag[0]) / 0.4))
            else:
                if head_img is not None: ChartSrc._over(f, head_img, (W - head_img.shape[1]) // 2, int(H * 0.08))
                cue = next((c for c in (captions or []) if c[0] <= t < c[1]), None)
                if cue:
                    cb = cap_cache.get(cue[2])
                    if cb is None: cb = cap_cache.setdefault(cue[2], text_block([cue[2]], 54, W - 140, fill=(255, 238, 200)))
                    ChartSrc._over(f, cb, (W - cb.shape[1]) // 2, int(H * 0.74))
        enc.stdin.write(f.tobytes())
        if log and fi % (FPS * 10) == 0: print(f"  {t:7.1f}s  {[vshots[i]['id'] for i in act]}", flush=True)
    for s in live.values():
        if hasattr(s, "close"): s.close()
    enc.stdin.close(); enc.wait()

def virtual(shots, ranges):
    """Map [(a, b), ...] ranges of the episode onto one continuous output timeline."""
    out, T = [], 0.0
    for a, b in ranges:
        for s in shots:
            lo, hi = max(s["start"], a), min(s["end"], b)
            if hi - lo > 0.05: out.append(dict(s, vstart=T + lo - a, vend=T + hi - a, voff=lo - s["start"]))
        T += b - a
    return out, T

def _worker(args):
    vs, total, W, H, out, ep, assets, f0, f1 = args
    render(vs, total, W, H, pathlib.Path(out), pathlib.Path(ep), pathlib.Path(assets), f0=f0, f1=f1, log=(f0 == 0))
    return out

def precompute_depth(shots, assets):
    paths = sorted({assets / pathlib.Path(s["asset"]).name for s in shots if s["kind"] != "video"})
    for p in paths:
        if p.exists(): depth_map(p, assets / ".depth")

def loudness(path):
    r = subprocess.run(["ffmpeg", "-hide_banner", "-i", str(path), "-vn", "-af", "ebur128=framelog=quiet", "-f", "null", "-"], capture_output=True, text=True)
    lines = [l for l in r.stderr.splitlines() if l.strip().startswith("I:")]
    return lines[-1].split()[1] if lines else "?"

def contact_sheet(video, vshots, out, cols=5):
    tiles = []
    for s in vshots:
        t = (s["vstart"] + s["vend"]) / 2
        r = subprocess.run(["ffmpeg", "-loglevel", "error", "-ss", f"{t:.2f}", "-i", str(video), "-frames:v", "1", "-vf", "scale=384:-2", "-f", "image2pipe", "-vcodec", "png", "-"], capture_output=True)
        if not r.stdout: continue
        im = Image.open(__import__("io").BytesIO(r.stdout)).convert("RGB"); d = ImageDraw.Draw(im)
        d.rectangle([0, 0, im.width, 26], fill=(0, 0, 0)); d.text((6, 2), f"{s['id']} {s['kind']} {s['vstart']:.1f}s", font=font(16), fill=(255, 220, 160))
        tiles.append(im)
    if not tiles: return
    w, h = tiles[0].size; rows = math.ceil(len(tiles) / cols); sheet = Image.new("RGB", (w * cols, h * rows), (10, 10, 10))
    for i, im in enumerate(tiles): sheet.paste(im, ((i % cols) * w, (i // cols) * h))
    sheet.save(out, quality=88); print("contact sheet:", out)

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("ep"); ap.add_argument("--assets"); ap.add_argument("--from", dest="t0", type=float)
    ap.add_argument("--to", dest="t1", type=float); ap.add_argument("--out"); ap.add_argument("--workers", type=int, default=1)
    ap.add_argument("--short"); ap.add_argument("--contact", action="store_true"); a = ap.parse_args()
    ep = pathlib.Path(a.ep).resolve(); doc = json.loads((ep / "shots.json").read_text()); shots = doc["shots"]
    for s in shots: s.setdefault("dur", s["end"] - s["start"])
    assets = pathlib.Path(a.assets).resolve() if a.assets else ep / "assets"; assets.mkdir(exist_ok=True)
    audio_src = ep / doc.get("audio", f"{doc['episode']}.mp4"); build = ep / "build_v2"; build.mkdir(exist_ok=True)
    precompute_depth(shots, assets)
    xf = doc.get("xfade", 0.4)
    if a.short:
        tl = {b["id"]: b for b in json.loads((ep / "build" / "timeline.json").read_text())["beats"]}
        cues = srt_cues(ep / f"{doc['episode']}.srt"); outdir = ep / "shorts_v2"; outdir.mkdir(exist_ok=True)
        for sh in json.loads((ep / "shorts.json").read_text()):
            if a.short != "all" and sh["id"] != a.short: continue
            segs = [(tl[b]["start"], tl[b]["start"] + tl[b]["speech"] + 0.35) for b in sh["beats"]]
            vs, T = virtual(shots, segs); vs[-1]["vend"] += TAG_S          # last shot keeps moving under the end tag
            caps, off = [], 0.0
            for s0, s1 in segs:
                caps += [(max(c0, s0) - s0 + off, min(c1, s1) - s0 + off, txt) for c0, c1, txt in cues if c1 > s0 and c0 < s1]; off += s1 - s0
            silent = build / f"short_{sh['id']}_silent.mp4"; print(f"{sh['id']}: {T + TAG_S:.1f}s, {len(vs)} shots")
            render(vs, T + TAG_S, 1080, 1920, silent, ep, assets, captions=caps, head=sh["head"], tag=(T, sh.get("tag", "")), xf=xf)
            parts = "".join(f"[0:a]atrim={x}:{y},asetpts=PTS-STARTPTS,afade=t=in:d=0.05,afade=t=out:st={y - x - 0.12}:d=0.12[a{i}];" for i, (x, y) in enumerate(segs))
            cat = "".join(f"[a{i}]" for i in range(len(segs))) + f"concat=n={len(segs)}:v=0:a=1,apad=pad_dur={TAG_S}[a]"
            out = outdir / f"{sh['id']}.mp4"
            subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", str(audio_src), "-i", str(silent), "-filter_complex", parts + cat, "-map", "1:v",
                            "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-ar", "48000", "-b:a", "160k", "-shortest", "-movflags", "+faststart", str(out)], check=True)
            print(" ->", out)
            if a.contact: contact_sheet(out, vs, build / f"contact_{sh['id']}.jpg", cols=6)
        return
    W, H = doc.get("size", [1920, 1080]); total = doc["total"]
    t0, t1 = a.t0 or 0.0, a.t1 if a.t1 is not None else total
    vs, T = virtual(shots, [(t0, t1)])
    out = pathlib.Path(a.out) if a.out else (ep / f"{doc['episode']}_v2.mp4" if (t0, t1) == (0.0, total) else build / f"preview_{int(t0)}_{int(t1)}.mp4")
    silent = build / (out.stem + "_silent.mp4"); nF = int(round(T * FPS))
    if a.workers > 1:
        from multiprocessing import Pool
        cuts = [int(nF * k / a.workers) for k in range(a.workers + 1)]
        jobs = [(vs, T, W, H, str(build / f"{out.stem}_part{k}.mp4"), str(ep), str(assets), cuts[k], cuts[k + 1]) for k in range(a.workers)]
        with Pool(a.workers) as pool: parts = pool.map(_worker, jobs)
        lst = build / f"{out.stem}_parts.txt"; lst.write_text("".join(f"file '{p}'\n" for p in parts))
        subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", str(lst), "-c", "copy", str(silent)], check=True)
        for p in parts: os.remove(p)
        lst.unlink()
    else:
        render(vs, T, W, H, silent, ep, assets, xf=xf)
    full = (t0, t1) == (0.0, total)
    acmd = ["-i", str(audio_src)] if full else ["-ss", f"{t0:.3f}", "-t", f"{T:.3f}", "-i", str(audio_src)]
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", str(silent)] + acmd + ["-map", "0:v", "-map", "1:a", "-c:v", "copy"] +
                   (["-c:a", "copy"] if full else ["-c:a", "aac", "-ar", "48000", "-b:a", "192k"]) + ["-shortest", "-movflags", "+faststart", str(out)], check=True)
    silent.unlink()
    print(f"wrote {out}  ({T:.1f}s, {len(vs)} shots)  loudness I = {loudness(out)} LUFS (source {doc.get('audio')})")
    missing = sorted({pathlib.Path(s['asset']).name for s in vs if not (assets / pathlib.Path(s['asset']).name).exists()})
    print(f"missing assets in this range: {len(missing)}")
    if a.contact: contact_sheet(out, vs, build / f"contact_{out.stem}.jpg")

if __name__ == "__main__":
    main()
