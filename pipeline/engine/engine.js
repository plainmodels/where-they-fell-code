/* Deterministic canvas renderer: renderAt(T) draws the frame for global time T (seconds).
   No timers, no randomness: the same T always gives the same pixels, so frames can be rendered
   in parallel and re-rendered exactly. Episode content comes from window.EP (data.js). */
"use strict";
const W = 1920, H = 1080;
const C = { bg: "#0d1117", panel: "#161b22", line: "#30363d", text: "#e6edf3", dim: "#8b949e",
            acc: "#58a6ff", bad: "#ff6b6b", good: "#3fb950", warn: "#f2cc60", ghost: "#6e4b1f" };
const SANS = '"Noto Sans", "Noto Sans Devanagari", sans-serif', MONO = '"Noto Sans Mono", "Noto Sans Devanagari", monospace';
let ctx;

const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const ease = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };
const prog = (t, a, b) => clamp((t - a) / (b - a));       // 0..1 between times a and b
const lerp = (a, b, x) => a + (b - a) * x;
function rnd(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

function font(px, family = SANS, weight = 400) { ctx.font = `${weight} ${px}px ${family}`; }
function text(s, x, y, o = {}) {
  ctx.save();
  font(o.px || 40, o.mono ? MONO : SANS, o.weight || 400);
  ctx.fillStyle = o.color || C.text; ctx.globalAlpha *= (o.alpha === undefined ? 1 : o.alpha);
  ctx.textAlign = o.align || "left"; ctx.textBaseline = o.base || "alphabetic";
  if (o.glow) { ctx.shadowColor = o.color || C.text; ctx.shadowBlur = o.glow; }
  ctx.fillText(s, x, y); ctx.restore();
}
function measure(s, px, mono, weight) { font(px, mono ? MONO : SANS, weight || 400); return ctx.measureText(s).width; }
function rect(x, y, w, h, fill, r = 0, stroke = null, lw = 2) {
  ctx.beginPath(); if (r) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
}
function panel(x, y, w, h, label) {
  ctx.save(); ctx.shadowColor = "rgba(0,0,0,0.55)"; ctx.shadowBlur = 50; ctx.shadowOffsetY = 18;
  rect(x, y, w, h, C.panel, 14); ctx.restore();
  rect(x, y, w, h, C.panel, 14, C.line);
  if (label) {
    rect(x, y, w, 56, "#1c2128", 14); rect(x, y + 40, w, 16, "#1c2128");
    ctx.fillStyle = C.line; ctx.fillRect(x, y + 56, w, 1);
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(x + 30 + i * 26, y + 28, 7, 0, 7); ctx.fillStyle = ["#ff5f56", "#ffbd2e", "#27c93f"][i]; ctx.fill(); }
    text(label, x + 120, y + 38, { px: 24, mono: true, color: C.dim });
  }
}
/* Draw a mono line with regex-highlighted parts. */
function hlLine(s, x, y, px, re, color, baseColor) {
  font(px, MONO); let cx = x;
  const parts = re ? s.split(new RegExp(`(${re})`, "g")) : [s];
  const rx = re ? new RegExp(`^(${re})$`) : null;
  for (const part of parts) {
    if (!part) continue;
    ctx.fillStyle = rx && rx.test(part) ? color : (baseColor || C.text);
    ctx.textAlign = "left"; ctx.textBaseline = "alphabetic"; ctx.fillText(part, cx, y);
    cx += ctx.measureText(part).width;
  }
}
function fadeIn(t, at, d = 0.5) { return ease(prog(t, at, at + d)); }
function arrow(x1, y1, x2, y2, color, lw = 4) {
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = lw;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  const a = Math.atan2(y2 - y1, x2 - x1), s = 16;
  ctx.beginPath(); ctx.moveTo(x2, y2); ctx.lineTo(x2 - s * Math.cos(a - 0.4), y2 - s * Math.sin(a - 0.4));
  ctx.lineTo(x2 - s * Math.cos(a + 0.4), y2 - s * Math.sin(a + 0.4)); ctx.closePath(); ctx.fill();
}
const fmt = (n) => Math.round(n).toLocaleString("en-US");

/* ---------- scenes: each is draw(t, dur, p) with t local to the beat ---------- */
const S = {};

S.title = (t, d, p) => {
  const n = p.title.length, y0 = H / 2 - (n - 1) * 62 - 20;
  p.title.forEach((l, i) => {
    const a = p.fast ? fadeIn(t, 0.05 + i * 0.15, 0.3) : fadeIn(t, 0.15 + i * 0.5, 0.7);
    ctx.globalAlpha = a; text(l, W / 2, y0 + i * 124 + (1 - a) * 24, { px: 92, weight: 700, align: "center", color: i === n - 1 && n > 1 ? C.acc : C.text, glow: i === n - 1 && n > 1 ? 28 : 0 });
  });
  ctx.globalAlpha = p.fast ? fadeIn(t, 0.2 + n * 0.15, 0.3) : fadeIn(t, 0.4 + n * 0.5, 0.8);
  if (p.sub) text(p.sub, W / 2, y0 + n * 124 + 10, { px: 34, align: "center", color: C.dim });
  ctx.globalAlpha = 1;
};

S.statement = (t, d, p) => {
  const n = p.lines.length, step = Math.min(1.6, (d * 0.55) / n), y0 = H / 2 - (n - 1) * 52 - (p.sub ? 30 : 0);
  p.lines.forEach((l, i) => {
    const a = fadeIn(t, 0.2 + i * step, 0.6);
    ctx.globalAlpha = a;
    text(l, W / 2, y0 + i * 104 + (1 - a) * 18, { px: 70, weight: 600, align: "center", color: (p.accent || []).includes(i) ? C.acc : C.text, glow: (p.accent || []).includes(i) ? 22 : 0 });
  });
  if (p.sub) { ctx.globalAlpha = fadeIn(t, 0.4 + n * step, 0.8); text(p.sub, W / 2, y0 + n * 104 + 30, { px: 32, align: "center", color: C.dim, mono: true }); }
  ctx.globalAlpha = 1;
};

S.bullets = (t, d, p) => {
  const n = p.items.length, step = (d * 0.72) / (n + 0.6), x = 300, y0 = 330 - (n > 3 ? 40 : 0);
  ctx.globalAlpha = fadeIn(t, 0.1); text(p.head, x, y0, { px: 54, weight: 700, color: C.acc });
  p.items.forEach((it, i) => {
    const a = fadeIn(t, 0.5 + i * step, 0.6), y = y0 + 130 + i * 130;
    ctx.globalAlpha = a;
    ctx.beginPath(); ctx.arc(x + 28, y - 16, 30, 0, 7); ctx.fillStyle = C.panel; ctx.fill(); ctx.strokeStyle = C.acc; ctx.lineWidth = 3; ctx.stroke();
    text(p.numbered ? String(i + 1) : "✓", x + 28, y - 3, { px: 32, weight: 700, align: "center", color: C.acc });
    text(it, x + 90 + (1 - a) * 20, y, { px: 48 });
  });
  if (p.note) { ctx.globalAlpha = fadeIn(t, 0.5 + n * step, 0.8); text(p.note, x, H - 150, { px: 26, mono: true, color: C.dim }); }
  ctx.globalAlpha = 1;
};

S.terminal = (t, d, p) => {
  const x = 140, y = 170, w = W - 280, h = H - 400;
  panel(x, y, w, h, p.label);
  let lines = p.lines;
  if (p.source === "bootlog") lines = EP.data.bootlog.slice(0, p.count);
  const px = p.big ? 40 : 29, lh = p.big ? 84 : 46, y0 = y + (p.big ? 170 : 112);
  const reveal = p.big ? 0.9 : d * 0.5;
  lines.forEach((l, i) => {
    const at = 0.3 + (i / Math.max(1, lines.length)) * reveal;
    if (t < at) return;
    let s = l;
    if (p.big) { const k = Math.floor((t - at) * 60); s = l.slice(0, k); }
    ctx.globalAlpha = p.big ? 1 : fadeIn(t, at, 0.25);
    hlLine(s, x + 50, y0 + i * lh, px, p.hl, C.bad, p.big ? C.text : C.dim);
    if (p.big && i === lines.length - 1 && Math.floor(t * 2) % 2 === 0) {
      font(px, MONO); ctx.fillStyle = C.acc; ctx.fillRect(x + 54 + ctx.measureText(s).width, y0 + i * lh - px * 0.82, px * 0.55, px);
    }
  });
  ctx.globalAlpha = 1;
  if (p.source === "bootlog") {
    const a = fadeIn(t, d * 0.62, 0.6); ctx.globalAlpha = a;
    rect(W - 620, y + h + 24, 480, 84, "#2d1517", 12, C.bad);
    text(`${EP.data.bootlog_total} lines on this boot`, W - 380, y + h + 78, { px: 34, align: "center", color: C.bad, weight: 600 });
    ctx.globalAlpha = 1;
  }
  if (p.note) { ctx.globalAlpha = fadeIn(t, d * 0.45, 0.8); [].concat(p.note).forEach((nl, i) => text(nl, x + 6, y + h + 56 + i * 40, { px: 26, mono: true, color: C.dim })); ctx.globalAlpha = 1; }
};

S.code = (t, d, p) => {
  const x = 170, y = 200, w = W - 340, lh = 62, h = p.lines.length * lh + 130;
  panel(x, y, w, h, p.label);
  const fi = t > d * 0.62 ? 1 : (t > d * 0.28 ? 0 : -1);
  p.lines.forEach((l, i) => {
    const f = fi >= 0 && i >= p.focus[fi][0] && i <= p.focus[fi][1];
    if (f) rect(x + 16, y + 84 + i * lh, w - 32, lh, fi === 0 ? "#12261e" : "#2d1517", 6);
    ctx.globalAlpha = fadeIn(t, 0.1 + i * 0.08, 0.3) * (fi >= 0 && !f ? 0.45 : 1);
    text(l, x + 50, y + 126 + i * lh, { px: 34, mono: true, color: f ? (fi === 0 ? C.good : C.bad) : C.text });
  });
  ctx.globalAlpha = fadeIn(t, d * 0.28);
  const lab = fi === 1 ? "2 · reserve those bytes: the allocator never sees them" : "1 · print the log line";
  if (fi >= 0) text(lab, x + 10, y + h + 70, { px: 38, color: fi === 0 ? C.good : C.bad, weight: 600 });
  ctx.globalAlpha = 1;
};

S.logline = (t, d, p) => {
  const parts = [["2222222222222222", "pattern under test", C.warn], [" bad mem addr ", null, C.dim],
                 ["0x00000001f4bb87f8", "first bad byte", C.bad], [" - ", null, C.dim],
                 ["0x00000001f4bb8800", "one past the last", C.acc], [" reserved", null, C.dim]];
  const px = 34; let x = 120; const y = 400;
  panel(70, 270, W - 140, 300, "kernel log");
  let k = 0;
  for (const [s, lab, col] of parts) {
    const w = measure(s, px, true);
    const at = lab ? 1.2 + k * d * 0.14 : 0;
    const a = lab ? fadeIn(t, at, 0.5) : 1;
    text(s, x, y, { px, mono: true, color: lab && a > 0.05 ? col : (lab ? C.text : col) });
    if (lab) {
      ctx.globalAlpha = a;
      ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x, y + 18); ctx.lineTo(x + w, y + 18); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + w / 2, y + 18); ctx.lineTo(x + w / 2, y + 62); ctx.stroke();
      text(lab, x + w / 2, y + 104, { px: 30, align: "center", color: col, weight: 600 });
      ctx.globalAlpha = 1; k++;
    }
    x += w;
  }
  const a2 = fadeIn(t, d * 0.58, 0.7); ctx.globalAlpha = a2;
  text("0x1f4bb8800  −  0x1f4bb87f8  =  8 bytes", W / 2, 720, { px: 56, mono: true, align: "center" });
  ctx.globalAlpha = fadeIn(t, d * 0.74, 0.7);
  text("one 64-bit word that did not read back what was written", W / 2, 810, { px: 40, align: "center", color: C.acc });
  ctx.globalAlpha = 1;
};

S.memmap = (t, d, p) => {
  const E = EP.data.e820, top = EP.data.e820_top, x0 = 130, bw = W - 260;
  const X = (addr) => x0 + (addr / top) * bw;
  const pages = p.mode === "pages";
  const by = pages ? 250 : 420, bh = pages ? 90 : 150;
  const grow = pages ? 1 : ease(prog(t, 0.4, 3.2));
  text("physical address space of this laptop", x0, by - 60, { px: 34, color: C.dim });
  rect(x0, by, bw, bh, "#0a0d12", 6, C.line);
  for (const r of E) {
    const xa = X(r.s), xb = Math.min(X(r.e), x0 + bw * grow);
    if (xb <= xa) continue;
    rect(xa, by, Math.max(1.5, xb - xa), bh, r.ram ? "#1f6feb" : "#3d444d");
  }
  for (let g = 0; g <= 18; g += 2) {
    const xx = X(g * 2 ** 30); ctx.fillStyle = C.dim; ctx.fillRect(xx, by + bh, 2, 14);
    text(g + (g === 0 ? "" : " GiB"), xx, by + bh + 50, { px: 26, align: "center", color: C.dim, mono: true });
  }
  if (!pages) {
    let a = fadeIn(t, d * 0.42); ctx.globalAlpha = a;
    rect(x0, by + 250, 40, 40, "#1f6feb", 4); text("usable RAM  (16 GiB in total)", x0 + 60, by + 283, { px: 36 });
    rect(x0 + 700, by + 250, 40, 40, "#3d444d", 4); text("reserved for firmware and devices", x0 + 760, by + 283, { px: 36 });
    a = fadeIn(t, d * 0.78); ctx.globalAlpha = a;
    const hx = X(2.9 * 2 ** 30);
    arrow(hx, by - 150, hx, by - 14, C.warn);
    text("hole below 4 GiB for hardware", hx, by - 172, { px: 34, align: "center", color: C.warn });
    ctx.globalAlpha = fadeIn(t, d * 0.55);
    text("table supplied by the firmware at power-on (BIOS-e820 lines in the kernel log)", x0, by + 400, { px: 28, color: C.dim, mono: true });
    ctx.globalAlpha = 1;
  } else {
    // zoom: a strip of page frames
    const lx = X(9.4 * 2 ** 30), a = fadeIn(t, 0.3, 0.8); ctx.globalAlpha = a;
    ctx.strokeStyle = C.acc; ctx.lineWidth = 3; ctx.strokeRect(lx - 8, by - 8, 16, bh + 16);
    ctx.beginPath(); ctx.moveTo(lx - 8, by + bh + 8); ctx.lineTo(x0, 520); ctx.moveTo(lx + 8, by + bh + 8); ctx.lineTo(x0 + bw, 520); ctx.strokeStyle = "#1f3a5f"; ctx.stroke();
    const n = 20, cw = bw / n;
    for (let i = 0; i < n; i++) {
      const ai = fadeIn(t, 0.8 + i * 0.07, 0.3); ctx.globalAlpha = a * ai;
      rect(x0 + i * cw + 4, 520, cw - 8, 150, "#11335f", 6, C.acc);
      text("4 KiB", x0 + i * cw + cw / 2, 606, { px: 22, align: "center", mono: true, color: "#9cc7ff" });
    }
    ctx.globalAlpha = fadeIn(t, 2.2); text("page frames", x0, 730, { px: 34, color: C.dim });
    const cnt = EP.data.page_frames * ease(prog(t, d * 0.3, d * 0.62));
    ctx.globalAlpha = fadeIn(t, d * 0.28);
    text(fmt(cnt), W / 2, 890, { px: 110, weight: 700, align: "center", mono: true, color: C.acc, glow: 26 });
    text("page frames of usable memory on this machine", W / 2, 960, { px: 34, align: "center", color: C.dim });
    ctx.globalAlpha = 1;
  }
};

function bitsOf(hex) { let out = []; for (const ch of hex) { const v = parseInt(ch, 16); for (let b = 3; b >= 0; b--) out.push((v >> b) & 1); } return out; }

S.word = (t, d, p) => {
  const bits = bitsOf(p.pattern), cols = 32, cw = 50, x0 = (W - cols * cw) / 2;
  const row = (y, label, upto, flipped, a) => {
    ctx.globalAlpha = a; text(label, x0, y - 22, { px: 32, color: C.dim });
    for (let i = 0; i < 64; i++) {
      const r = Math.floor(i / cols), c = i % cols, bx = x0 + c * cw, byy = y + r * 62;
      const shown = i < upto; let v = bits[i]; const bad = flipped && i === p.flip;
      if (bad) v = 1 - v;
      rect(bx + 3, byy, cw - 6, 52, shown ? (bad ? "#5c1a1d" : (v ? "#11335f" : "#161b22")) : "#0a0d12", 6, bad ? C.bad : C.line, bad ? 3 : 1);
      if (shown) text(String(v), bx + cw / 2, byy + 38, { px: 30, mono: true, align: "center", color: bad ? C.bad : (v ? "#9cc7ff" : C.dim) });
    }
  };
  const w = Math.floor(64 * ease(prog(t, d * 0.42, d * 0.62)));
  const r = Math.floor(64 * ease(prog(t, d * 0.66, d * 0.84)));
  row(330, "written   0x" + p.pattern, w, false, fadeIn(t, 0.2));
  row(610, "read back", r, true, fadeIn(t, d * 0.6));
  if (r > p.flip) {
    ctx.globalAlpha = fadeIn(t, d * 0.82, 0.5);
    const c = p.flip % cols, rr = Math.floor(p.flip / cols), bx = x0 + c * cw + cw / 2;
    arrow(bx, 610 + rr * 62 + 150, bx, 610 + rr * 62 + 62, C.bad);
    text("this bit came back wrong", bx, 610 + rr * 62 + 200, { px: 38, align: "center", color: C.bad, weight: 600 });
  }
  ctx.globalAlpha = 1;
  text("one 64-bit word of memory", W / 2, 215, { px: 44, align: "center", weight: 600 });
};

S.bitflip = (t, d, p) => {
  const s = p.before, n = s.length, cw = 170, x0 = (W - n * cw) / 2, flipT = d * 0.3, flipped = t > flipT;
  const part2 = fadeIn(t, d * 0.52, 0.7);
  const yy = lerp(330, 210, part2);
  for (let i = 0; i < n; i++) {
    let code = s.charCodeAt(i); const hit = i === p.index && flipped; if (hit) code ^= (1 << p.bit);
    const x = x0 + i * cw;
    rect(x + 8, yy, cw - 16, 150, hit ? "#2d1517" : C.panel, 12, hit ? C.bad : C.line, hit ? 4 : 2);
    text(String.fromCharCode(code) === " " ? "␣" : String.fromCharCode(code), x + cw / 2, yy + 108, { px: 96, weight: 700, align: "center", color: hit ? C.bad : C.text });
    const b = code.toString(2).padStart(8, "0");
    for (let k = 0; k < 8; k++) {
      const isBit = i === p.index && (7 - k) === p.bit;
      const pulse = isBit ? fadeIn(t, flipT - 0.5, 0.5) : 0;
      text(b[k], x + 22 + k * 16.5, yy + 200, { px: 25, mono: true, color: isBit && pulse > 0 ? C.bad : C.dim, weight: isBit ? 700 : 400 });
    }
  }
  ctx.globalAlpha = (1 - part2) * fadeIn(t, flipT + 0.2);
  text("one bit flipped in one byte", W / 2, yy + 300, { px: 40, align: "center", color: C.bad });
  ctx.globalAlpha = part2;
  // pointer example
  const py = 560, bw = 220, bx0 = 300;
  text("a pointer:", bx0, py, { px: 36, color: C.dim });
  const moved = ease(prog(t, d * 0.66, d * 0.76));
  text("0x00007ffd1c2a4e", bx0 + 220, py, { px: 44, mono: true });
  const pre = measure("0x00007ffd1c2a4e", 44, true);
  text(moved > 0.5 ? "30" : "10", bx0 + 220 + pre, py, { px: 44, mono: true, color: moved > 0.5 ? C.bad : C.text, weight: 700 });
  for (let i = 0; i < 6; i++) {
    const want = i === 1, got = i === 3;
    rect(bx0 + i * bw + 8, py + 150, bw - 16, 130, want ? "#12261e" : (got && moved > 0.5 ? "#2d1517" : C.panel), 10, want ? C.good : (got && moved > 0.5 ? C.bad : C.line), 3);
    text(want ? "your data" : (got ? "something else" : ""), bx0 + i * bw + bw / 2, py + 228, { px: 26, align: "center", color: want ? C.good : C.bad });
  }
  const ax = lerp(bx0 + 1 * bw + bw / 2, bx0 + 3 * bw + bw / 2, moved);
  arrow(ax, py + 40, ax, py + 138, moved > 0.5 ? C.bad : C.good);
  ctx.globalAlpha = fadeIn(t, d * 0.84);
  text("no crash at the moment of the flip. The damage appears later, somewhere else.", W / 2, py + 380, { px: 36, align: "center", color: C.dim });
  ctx.globalAlpha = 1;
};

S.patterns = (t, d, p) => {
  const n = p.patterns.length, t0 = d * 0.36, per = (d * 0.62) / n;
  const cur = t < t0 ? -1 : Math.min(n - 1, Math.floor((t - t0) / per));
  const ph = cur < 0 ? 0 : clamp(((t - t0) - cur * per) / per);
  text("mm/memtest.c", 150, 215, { px: 30, mono: true, color: C.dim });
  p.patterns.forEach((h, i) => {
    const y = 290 + i * 84, on = i === cur, done = i < cur;
    ctx.globalAlpha = fadeIn(t, 0.3 + i * 0.12, 0.4);
    rect(140, y - 52, 650, 70, on ? "#11335f" : C.panel, 10, on ? C.acc : C.line, on ? 3 : 1);
    text("pass " + (i + 1), 164, y - 6, { px: 28, color: on ? C.text : C.dim });
    text("0x" + h.slice(0, 4) + "…", 300, y - 4, { px: 34, mono: true, color: on ? C.text : C.dim });
    text(bitsOf(h.slice(0, 2)).join("").replace(/(....)/, "$1 "), 510, y - 4, { px: 34, mono: true, color: on ? C.warn : C.dim });
    if (done) text("✓", 750, y - 4, { px: 34, color: C.good });
  });
  ctx.globalAlpha = 1;
  // memory strip
  const gx = 900, gy = 250, cols = 28, rows = 16, cs = 31;
  text("every free 64-bit word of RAM", gx, 215, { px: 30, color: C.dim });
  const total = cols * rows, wr = cur < 0 ? 0 : Math.floor(total * clamp(ph / 0.48)), rd = cur < 0 ? 0 : Math.floor(total * clamp((ph - 0.5) / 0.48));
  const bits = cur < 0 ? null : bitsOf(p.patterns[cur]);
  const shade = cur < 0 ? "#161b22" : ["#3a2d6b", "#2d4a6b", "#1f5c5c", "#2d5c2d", "#5c5a1f", "#5c3d1f", "#11335f", "#1b2028"][cur];
  for (let i = 0; i < total; i++) {
    const cx = gx + (i % cols) * cs, cy = gy + Math.floor(i / cols) * cs;
    rect(cx, cy, cs - 4, cs - 4, i < wr ? shade : "#12161c", 4, i < rd ? C.good : null, 2);
  }
  if (cur >= 0) {
    text(ph < 0.5 ? "write the pattern…" : "…read it back and compare", gx, gy + rows * cs + 56, { px: 36, color: ph < 0.5 ? C.acc : C.good, weight: 600 });
  } else {
    ctx.globalAlpha = fadeIn(t, d * 0.12);
    text("for each pass: write, read back, compare", gx, gy + rows * cs + 56, { px: 36, color: C.dim });
    ctx.globalAlpha = 1;
  }
};

S.easteregg = (t, d, p) => {
  const bytes = p.hex.match(/../g), n = 8, cw = 150, x0 = (W - n * cw) / 2, sw = ease(prog(t, d * 0.42, d * 0.6));
  text("pattern 17 of 17", W / 2, 230, { px: 36, align: "center", color: C.dim });
  text("0x" + p.hex, W / 2, 320, { px: 64, mono: true, align: "center", weight: 600 });
  ctx.globalAlpha = fadeIn(t, d * 0.3);
  text(sw < 0.5 ? "as written in the source" : "in memory order on a little-endian processor", W / 2, 440, { px: 32, align: "center", color: C.acc });
  for (let i = 0; i < n; i++) {
    const pos = lerp(i, n - 1 - i, sw), x = x0 + pos * cw;
    const lift = Math.sin(Math.PI * sw) * (i - 3.5) * 46;   // boxes pass over and under each other, never through
    rect(x + 8, 500 + lift, cw - 16, 120, C.panel, 12, C.line);
    text(bytes[i], x + cw / 2, 580 + lift, { px: 54, mono: true, align: "center" });
    const a = fadeIn(t, d * 0.64 + (n - 1 - i) * 0.12, 0.3); ctx.globalAlpha = a;
    text(String.fromCharCode(parseInt(bytes[i], 16)), x + cw / 2, 780, { px: 110, weight: 700, align: "center", color: C.warn });
    ctx.globalAlpha = fadeIn(t, d * 0.3);
  }
  ctx.globalAlpha = 1;
};

/* One 4 KiB page drawn as 32 x 16 words. */
function pageCells(px, py, cs, fn) {
  for (let i = 0; i < 512; i++) { const c = i % 32, r = Math.floor(i / 32); fn(i, px + c * cs, py + r * cs); }
}

S.pagefence = (t, d, p) => {
  const cs = 17, pw = 32 * cs, ph = 16 * cs, y = 400, gap = 70, x0 = (W - (3 * pw + 2 * gap)) / 2, bad = 5 * 32 + 19;
  const zoom = fadeIn(t, d * 0.36, 0.8), fence = fadeIn(t, d * 0.7, 0.8);
  text("three neighbouring page frames, each 512 words", x0, 250, { px: 34, color: C.dim });
  for (let k = 0; k < 3; k++) {
    const px = x0 + k * (pw + gap), mid = k === 1;
    pageCells(px, y, cs, (i, cx, cy) => {
      const isBad = mid && i === bad && t > d * 0.1;
      rect(cx, cy, cs - 3, cs - 3, isBad ? C.bad : (mid && fence > 0.5 ? "#3a1a1c" : "#12304f"), 3);
    });
    ctx.globalAlpha = zoom; ctx.strokeStyle = mid ? (fence > 0.5 ? C.bad : C.warn) : C.good; ctx.lineWidth = 5; ctx.strokeRect(px - 8, y - 8, pw + 13, ph + 13);
    text(mid ? (fence > 0.5 ? "never released: 4 KiB withheld" : "contains a reserved word") : "complete page: released to the allocator",
         px + pw / 2, y + ph + 62, { px: 24, align: "center", color: mid ? (fence > 0.5 ? C.bad : C.warn) : C.good });
    ctx.globalAlpha = 1;
  }
  if (t > d * 0.1) {
    const bx = x0 + pw + gap + (bad % 32) * cs + cs / 2, byy = y + Math.floor(bad / 32) * cs;
    ctx.globalAlpha = fadeIn(t, d * 0.1) * (1 - fence * 0.4);
    arrow(bx, byy - 110, bx, byy - 8, C.bad); text("8 bytes reserved by the memory test", bx, byy - 126, { px: 30, align: "center", color: C.bad });
    ctx.globalAlpha = 1;
  }
};

S.scale = (t, d, p) => {
  const x0 = 160, bw = W - 320, by = 420;
  text("16 GiB of RAM", x0, by - 40, { px: 40 });
  rect(x0, by, bw * ease(prog(t, 0.2, 1.6)), 110, "#1f6feb", 8);
  const mx = x0 + bw * (7.824 / 16), a = fadeIn(t, d * 0.3); ctx.globalAlpha = a;
  ctx.fillStyle = C.bad; ctx.fillRect(mx - 1.5, by - 26, 3, 162);
  arrow(mx, by + 280, mx, by + 150, C.bad);
  text("4 pages · 16 KiB at 0x1f4bb8000", mx, by + 330, { px: 40, align: "center", color: C.bad, mono: true });
  text("(drawn far wider than its true size, which would be about a thousandth of a pixel)", mx, by + 384, { px: 26, align: "center", color: C.dim });
  ctx.globalAlpha = fadeIn(t, d * 0.62);
  text("1 / 1,048,576", W / 2, by + 520, { px: 96, weight: 700, align: "center", mono: true, color: C.acc, glow: 26 });
  text("of this machine's memory", W / 2, by + 580, { px: 34, align: "center", color: C.dim });
  ctx.globalAlpha = 1;
};

S.barchart = (t, d, p) => {
  const B = EP.data.boots, n = B.length, x0 = 190, bw = W - 380, by = 860, hmax = 520, max = 120, cw = bw / n;
  text("bad 64-bit words found by the boot-time test, per boot", x0, 230, { px: 36, color: C.dim });
  for (let g = 0; g <= 120; g += 40) { const y = by - (g / max) * hmax; ctx.fillStyle = C.line; ctx.fillRect(x0, y, bw, 1); text(String(g), x0 - 18, y + 9, { px: 26, align: "right", color: C.dim, mono: true }); }
  B.forEach((b, i) => {
    const g = ease(prog(t, d * 0.2 + i * (d * 0.3 / n), d * 0.2 + i * (d * 0.3 / n) + 0.7)), h = (b.words / max) * hmax * g;
    const hi = p.hi.includes(i) && t > d * (i === p.hi[0] ? 0.74 : 0.86);
    rect(x0 + i * cw + 8, by - h, cw - 16, h, hi ? C.bad : "#1f6feb", 4);
    if (hi) text(String(b.words), x0 + i * cw + cw / 2, by - h - 18, { px: 44, weight: 700, align: "center", color: C.bad });
    text(b.date.slice(8), x0 + i * cw + cw / 2, by + 44, { px: 24, align: "center", color: C.dim, mono: true });
  });
  text("day of November 2026 (24 boots, 1 to 14 November)", x0, by + 100, { px: 28, color: C.dim });
};

function gridLayout() { const cs = 18, pw = 32 * cs, ph = 16 * cs, gx = 90, gy = 96; const x0 = (W - (2 * pw + gx)) / 2, y0 = 262;
  return { cs, pw, ph, pos: (k) => [x0 + (k % 2) * (pw + gx), y0 + Math.floor(k / 2) * (ph + gy)] }; }

S.pagegrid = (t, d, p) => {
  const L = gridLayout(), B = EP.data.boots, n = B.length, base = EP.data.pages;
  const seen = new Map(); let cur = new Set(), bi = 0, caption = "";
  if (p.mode === "boots") {
    bi = Math.min(n - 1, Math.floor(prog(t, d * 0.14, d * 0.6) * n));
    if (t < d * 0.14) bi = -1;
    for (let k = 0; k <= bi; k++) for (const w of B[k].idx) seen.set(w, (seen.get(w) || 0) + 1);
    if (bi >= 0 && t < d * 0.6) cur = new Set(B[bi].idx);
    caption = bi < 0 ? "" : (t < d * 0.6 ? `boot ${bi + 1} of ${n}  ·  ${B[bi].date}  ·  ${B[bi].words} bad words` : `all ${n} boots`);
  } else {
    cur = new Set(B[p.boot].idx); caption = `boot of ${B[p.boot].date}  ·  ${B[p.boot].words} bad words found`;
    if (t > d * 0.56) for (const [w, c] of Object.entries(EP.data.word_counts)) seen.set(Number(w), c);
  }
  text(caption, W / 2, 200, { px: 36, align: "center", mono: true, color: C.text });
  for (let k = 0; k < 4; k++) {
    const [px, py] = L.pos(k); let hits = 0;
    pageCells(px, py, L.cs, (i, cx, cy) => {
      const w = k * 512 + i, isCur = cur.has(w), c = seen.get(w) || 0; if (isCur) hits++;
      let fill = "#12304f";
      if (isCur) fill = C.bad; else if (c) fill = p.mode === "miss" ? "#b07a1f" : `rgb(${90 + Math.min(c, 8) * 14},46,50)`;
      rect(cx, cy, L.cs - 3, L.cs - 3, fill, 3);
    });
    text("page " + base[k], px, py - 14, { px: 24, mono: true, color: C.dim });
    if (p.mode === "miss") {
      const a = fadeIn(t, d * 0.3 + (hits ? 0 : d * 0.18), 0.6); ctx.globalAlpha = a;
      ctx.strokeStyle = hits ? C.good : C.bad; ctx.lineWidth = 6; ctx.strokeRect(px - 9, py - 9, L.pw + 15, L.ph + 15);
      text(hits ? `${hits} caught → fenced` : "0 caught → released as good memory", px + L.pw / 2, py + L.ph + 44, { px: 28, align: "center", color: hits ? C.good : C.bad, weight: 600 });
      ctx.globalAlpha = 1;
    }
  }
  if (p.mode === "boots") {
    ctx.globalAlpha = fadeIn(t, d * 0.16);
    text(`distinct words that have failed so far: ${seen.size}`, W / 2, H - 86, { px: 38, align: "center", color: C.warn, weight: 600 });
    if (t > d * 0.72) { ctx.globalAlpha = fadeIn(t, d * 0.72); text("failed on every boot: 0      failed exactly once: 80", W / 2, H - 36, { px: 32, align: "center", color: C.dim, mono: true }); }
    ctx.globalAlpha = 1;
  } else if (t > d * 0.56) {
    ctx.globalAlpha = fadeIn(t, d * 0.56);
    text("amber: words that failed on other boots", W / 2, H - 30, { px: 28, align: "center", color: "#d9a13a" });
    ctx.globalAlpha = 1;
  }
};

S.patternstats = (t, d, p) => {
  const P = EP.data.pattern_counts, tot = P.reduce((a, b) => a + b[1], 0), x0 = 560, bw = 1000, max = 800;
  text("detections by test pattern, in the order the passes run", 200, 230, { px: 34, color: C.dim });
  P.forEach(([h, c], i) => {
    const y = 300 + i * 84, g = ease(prog(t, 0.4 + i * 0.15, 1.4 + i * 0.15)), top = h.startsWith("2222");
    text("0x" + h.slice(0, 4) + "…", 200, y + 44, { px: 36, mono: true, color: top ? C.text : C.dim });
    rect(x0, y + 8, Math.max(3, (c / max) * bw * g), 50, top ? C.bad : "#1f6feb", 6);
    text(String(c), x0 + (c / max) * bw * g + 18, y + 46, { px: 34, mono: true, color: top ? C.bad : C.dim, weight: top ? 700 : 400 });
  });
  ctx.globalAlpha = fadeIn(t, d * 0.2);
  text(`${Math.round(100 * P.find(x => x[0].startsWith("2222"))[1] / tot)}% of ${tot} detections`, 1360, 620, { px: 44, color: C.bad, weight: 700 });
  ctx.globalAlpha = fadeIn(t, d * 0.72);
  text("The log records the pattern and the address. It does not record which bit was wrong.", W / 2, H - 70, { px: 32, align: "center", color: C.dim });
  ctx.globalAlpha = 1;
};

S.cost = (t, d, p) => {
  const x0 = 520, bw = 1100, max = 40;
  text("time for the kernel to start (median, from systemd's own boot records)", 200, 250, { px: 34, color: C.dim });
  [["without the test", p.off, p.n_off, "#1f6feb", 0.2], ["with memtest=8", p.on, p.n_on, C.bad, 0.42]].forEach(([lab, v, n, col, at], i) => {
    const y = 380 + i * 200, g = ease(prog(t, d * at, d * at + 1.4));
    text(lab, 200, y + 58, { px: 40 }); text(`${n} boots`, 200, y + 100, { px: 26, color: C.dim, mono: true });
    rect(x0, y, Math.max(4, (v / max) * bw * g), 110, col, 8);
    ctx.globalAlpha = fadeIn(t, d * at + 0.8); text(`${v} s`, x0 + (v / max) * bw + 24, y + 74, { px: 56, weight: 700, mono: true, color: col }); ctx.globalAlpha = 1;
  });
  ctx.globalAlpha = fadeIn(t, d * 0.66);
  text("+37 seconds on every boot", W / 2, 880, { px: 80, weight: 700, align: "center", color: C.warn, glow: 26 });
  ctx.globalAlpha = 1;
};

S.compare = (t, d, p) => {
  [[p.left, 150, C.warn, 0.2], [p.right, 990, C.good, d * 0.22]].forEach(([col, x, c, at]) => {
    ctx.globalAlpha = fadeIn(t, at, 0.6);
    rect(x, 250, 780, 560, C.panel, 16, c, 3);
    text(col.head, x + 50, 340, { px: 50, weight: 700, color: c });
    col.items.forEach((it, i) => { ctx.globalAlpha = fadeIn(t, at + 0.5 + i * 0.6, 0.5); text("•  " + it, x + 50, 450 + i * 110, { px: 38 }); });
  });
  ctx.globalAlpha = fadeIn(t, d * 0.62);
  text(p.foot || "The real repair is a new memory module. Fencing is what you do until then.", W / 2, 930, { px: 38, align: "center", color: C.dim });
  ctx.globalAlpha = 1;
};

S.endcard = (t, d, p) => {
  const a = fadeIn(t, 0.2, 0.8); ctx.globalAlpha = a;
  text("Under Test", 150, 300, { px: 110, weight: 700, glow: 18 });
  text("Real systems, measured.", 154, 372, { px: 44, color: C.acc });
  ctx.globalAlpha = fadeIn(t, 1.0, 0.8);
  text(p.next_label || "Next", 154, 560, { px: 30, color: C.dim });
  (p.next || []).forEach((l, i) => text(l, 154, 626 + i * 64, { px: 46, weight: 600 }));
  text("Sources, data and code are in the description.", 154, 900, { px: 30, color: C.dim });
  // clear space on the right for YouTube's own end-screen elements
  ctx.globalAlpha = fadeIn(t, 1.4, 0.8) * 0.9; ctx.setLineDash([14, 12]);
  rect(1130, 250, 640, 360, null, 18, C.line, 3); rect(1300, 680, 300, 300, null, 150, C.line, 3); ctx.setLineDash([]);
  ctx.globalAlpha = 1;
};

/* ---------- episode 2 scenes: latency plots, packets, sequence diagrams, traces ---------- */
S.latency = (t, d, p) => {
  const x0 = 240, y0 = 230, w = 1440, h = 560, A = EP.data.latA, B = EP.data.latB, R = EP.data.results, log = p.mode === "log";
  const Y = log ? (v) => y0 + h - ((Math.log10(Math.max(v, 0.01)) + 2) / 4) * h : (v) => y0 + h - (v / 50) * h;
  const X = (i) => x0 + (i / 399) * w;
  text(p.head || "400 requests · client and server on the same laptop", x0, y0 - 40, { px: 34, color: C.dim });
  rect(x0, y0, w, h, "#0a0d12", 6, C.line);
  (log ? [0.01, 0.1, 1, 10, 100] : [0, 10, 20, 30, 40, 50]).forEach((v) => {
    ctx.fillStyle = "#1c2128"; ctx.fillRect(x0, Y(v), w, 1);
    text(v + " ms", x0 - 18, Y(v) + 9, { px: 26, mono: true, color: C.dim, align: "right" });
  });
  [0, 100, 200, 300, 400].forEach((v) => text(String(v), x0 + (v / 400) * w, y0 + h + 44, { px: 26, mono: true, color: C.dim, align: "center" }));
  text("request number", x0 + w / 2, y0 + h + 92, { px: 28, color: C.dim, align: "center" });
  const nA = p.mode === "flat" ? Math.floor(400 * ease(prog(t, 0.5, d * 0.5))) : 400;
  ctx.fillStyle = C.bad; for (let i = 0; i < nA; i++) { ctx.beginPath(); ctx.arc(X(i), Y(A[i]), 4, 0, 7); ctx.fill(); }
  if (p.mode === "flat") {
    ctx.globalAlpha = fadeIn(t, d * 0.62, 0.6);
    text("41 ms", x0 + w - 40, Y(41) + 150, { px: 130, weight: 700, mono: true, color: C.bad, align: "right", glow: 26 });
    text("each", x0 + w - 40, Y(41) + 210, { px: 40, color: C.dim, align: "right" });
  } else if (p.mode === "band") {
    const a = fadeIn(t, 0.5, 0.7), ix = 620, iy = 400, iw = 1020, ih = 340; ctx.globalAlpha = a;
    panel(ix, iy, iw, ih); const Yz = (v) => iy + ih - 30 - ((v - 40.5) / 1.0) * (ih - 60);
    text("zoom: 40.5 to 41.5 ms", ix + 30, iy + 44, { px: 26, mono: true, color: C.dim });
    const lo = R.A.p10_ms, hi = R.A.p90_ms;
    ctx.globalAlpha = a * fadeIn(t, d * 0.3, 0.6) * 0.22; rect(ix + 20, Yz(hi), iw - 250, Yz(lo) - Yz(hi), C.warn); ctx.globalAlpha = a;
    ctx.fillStyle = C.bad; for (let i = 0; i < 400; i++) { if (A[i] < 40.5 || A[i] > 41.5) continue; ctx.beginPath(); ctx.arc(ix + 20 + (i / 399) * (iw - 250), Yz(A[i]), 3.5, 0, 7); ctx.fill(); }
    ctx.globalAlpha = a * fadeIn(t, d * 0.3, 0.6);
    text(hi.toFixed(2) + " ms", ix + iw - 210, Yz(hi) + 6, { px: 34, mono: true, color: C.warn, weight: 600 });
    text(lo.toFixed(2) + " ms", ix + iw - 210, Yz(lo) + 26, { px: 34, mono: true, color: C.warn, weight: 600 });
    ctx.globalAlpha = fadeIn(t, d * 0.42, 0.6);
    text("8 in 10 requests fall inside this band", x0 + w, y0 + h + 150, { px: 34, color: C.warn, align: "right" });
  } else {
    const nB = Math.floor(400 * ease(prog(t, 0.3, 1.8)));
    ctx.fillStyle = C.good; for (let i = 0; i < nB; i++) { ctx.beginPath(); ctx.arc(X(i), Y(B[i]), 4, 0, 7); ctx.fill(); }
    text(`two writes · ${R.A.median_ms.toFixed(0)} ms each · ${R.A.total_s.toFixed(1)} s for all 400`, x0 + 40, Y(41) + 62, { px: 34, color: C.bad, weight: 600 });
    ctx.globalAlpha = fadeIn(t, 1.2, 0.6);
    text(`one line changed · ${R.B.median_ms} ms each · ${R.B.total_s} s for all 400`, x0 + 40, Y(0.029) + 62, { px: 34, color: C.good, weight: 600 });
    ctx.globalAlpha = fadeIn(t, d * 0.3, 0.6);
    text("1,400× faster", x0 + w - 60, y0 + h / 2 + 30, { px: 96, weight: 700, color: C.acc, align: "right", glow: 24 });
    text("(logarithmic scale)", x0 + w - 60, y0 + h / 2 + 86, { px: 28, color: C.dim, align: "right" });
  }
  ctx.globalAlpha = 1;
};

S.packet = (t, d, p) => {
  const n = 40 + p.data, cw = 38, x0 = (W - 41 * cw) / 2, y = 400, ch = 150;
  text(p.head, x0, 270, { px: 44, weight: 600 });
  for (let i = 0; i < n; i++) {
    const a = fadeIn(t, 0.3 + i * 0.035, 0.25); ctx.globalAlpha = a;
    const col = i < 20 ? "#1f3a5f" : i < 40 ? "#274b7a" : C.warn;
    rect(x0 + i * cw + 2, y, cw - 4, ch, col, 4, i >= 40 ? C.warn : null);
  }
  ctx.globalAlpha = fadeIn(t, 1.2, 0.5);
  [["IP header · 20 bytes", 0, 20, C.acc], ["TCP header · 20 bytes", 20, 20, C.acc]].forEach(([lab, a0, k, col]) => {
    const xa = x0 + a0 * cw, xb = xa + k * cw; ctx.strokeStyle = col; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(xa + 6, y + ch + 22); ctx.lineTo(xa + 6, y + ch + 40); ctx.lineTo(xb - 6, y + ch + 40); ctx.lineTo(xb - 6, y + ch + 22); ctx.stroke();
    text(lab, (xa + xb) / 2, y + ch + 92, { px: 34, align: "center", color: col });
  });
  ctx.globalAlpha = fadeIn(t, d * 0.3, 0.5);
  if (p.data) { arrow(x0 + 40.5 * cw, y - 90, x0 + 40.5 * cw, y - 10, C.warn); text("the keystroke · 1 byte", x0 + 41 * cw, y - 110, { px: 34, align: "right", color: C.warn, weight: 600 }); }
  else text("data · 0 bytes", x0 + 41 * cw, y - 30, { px: 34, align: "right", color: C.warn, weight: 600 });
  ctx.globalAlpha = fadeIn(t, d * 0.62, 0.6);
  text(p.big, W / 2, 800, { px: 84, weight: 700, align: "center", color: C.warn, glow: 24 });
  if (p.src) text(p.src, W / 2, 870, { px: 28, align: "center", mono: true, color: C.dim });
  ctx.globalAlpha = 1;
};

S.quote = (t, d, p) => {
  const n = p.lines.length, lh = 76, h = n * lh + 190, x = 190, w = W - 380, y = (H - h) / 2 - 10;
  panel(x, y, w, h);
  text("“", x + 40, y + 130, { px: 160, color: C.acc, weight: 700 });
  const step = Math.min(1.2, (d * 0.5) / n);
  p.lines.forEach((l, i) => { ctx.globalAlpha = fadeIn(t, 0.3 + i * step, 0.6);
    const hot = (p.hl || []).includes(i); text(l, x + 150, y + 122 + i * lh, { px: 46, color: hot ? C.warn : C.text, weight: hot ? 600 : 400 }); });
  ctx.globalAlpha = fadeIn(t, 0.5 + n * step, 0.6);
  text(p.src, x + 150, y + h - 44, { px: 28, mono: true, color: C.dim });
  if (p.foot) text(p.foot, W / 2, y + h + 90, { px: 40, align: "center", color: C.acc, weight: 600 });
  ctx.globalAlpha = 1;
};

S.nagle = (t, d, p) => {
  const cx = 300, sx = 1620, y = 520, bw = 360, bh = 300;
  [[cx, "sender"], [sx, "receiver"]].forEach(([x, lab]) => { rect(x - bw / 2, y - bh / 2, bw, bh, C.panel, 16, C.line, 3); text(lab, x, y - bh / 2 - 26, { px: 36, align: "center", color: C.dim }); });
  const wx0 = cx + bw / 2 + 20, wx1 = sx - bw / 2 - 20; ctx.fillStyle = C.line; ctx.fillRect(wx0, y - 1, wx1 - wx0, 2);
  const u = t / d, cell = (x, yy, ch, col) => { rect(x - 26, yy - 30, 52, 60, col, 8); text(ch, x, yy + 13, { px: 36, mono: true, align: "center", color: "#0d1117", weight: 700 }); };
  // first byte leaves at once
  const g1 = prog(u, 0.05, 0.42); if (g1 < 1) cell(lerp(cx, sx, ease(g1)), y - 60, "a", C.warn); else cell(sx - 110, y, "a", C.warn);
  // more bytes arrive at the sender and are held
  const held = ["b", "c", "d", "e"], go = ease(prog(u, 0.74, 0.98));
  held.forEach((chh, i) => { const at = 0.14 + i * 0.1; if (u < at) return; const hx = cx - 84 + i * 56; cell(lerp(hx, sx - 50 + i * 56, go), y + 70 * Math.sin(Math.PI * go), chh, C.acc); });
  // acknowledgement comes back
  const ga = prog(u, 0.46, 0.72);
  if (ga > 0 && ga < 1) { const ax = lerp(sx - bw / 2, cx + bw / 2, ease(ga)); rect(ax - 70, y - 100, 140, 56, null, 10, C.good, 3); text("ACK", ax, y - 60, { px: 32, mono: true, align: "center", color: C.good, weight: 700 }); }
  const lab = u < 0.14 ? "nothing outstanding: send at once" : u < 0.46 ? "data unacknowledged: hold new bytes" : u < 0.74 ? "acknowledgement arrives" : "send everything held, as one packet";
  text(lab, W / 2, 880, { px: 48, align: "center", color: u < 0.14 || u >= 0.74 ? C.good : u < 0.46 ? C.warn : C.acc, weight: 600 });
  text("Nagle's rule", W / 2, 230, { px: 40, align: "center", color: C.dim });
};

S.calc = (t, d, p) => {
  const x = 190, y = 250, w = W - 380;
  panel(x, y, w, 230, p.label);
  ctx.globalAlpha = fadeIn(t, 0.3, 0.5); hlLine(p.code, x + 60, y + 160, 44, p.hl, C.warn, C.text); ctx.globalAlpha = 1;
  p.steps.forEach((s, i) => { ctx.globalAlpha = fadeIn(t, d * (0.34 + i * 0.17), 0.6); text(s, W / 2, y + 340 + i * 84, { px: 46, align: "center", mono: true, color: C.dim }); });
  ctx.globalAlpha = fadeIn(t, d * (0.34 + p.steps.length * 0.17), 0.6);
  text(p.big, W / 2, y + 380 + p.steps.length * 84 + 80, { px: 120, weight: 700, align: "center", color: C.warn, glow: 28 });
  ctx.globalAlpha = 1;
};

S.codehl = (t, d, p) => {
  const lh = 66, x = 230, w = W - 460, h = p.lines.length * lh + 130, y = 210;
  panel(x, y, w, h, p.label); const on = t > d * p.at;
  p.lines.forEach((l, i) => {
    const f = on && p.hl.includes(i);
    if (f) rect(x + 16, y + 84 + i * lh, w - 32, lh, "#2d1517", 6);
    ctx.globalAlpha = fadeIn(t, 0.15 + i * 0.1, 0.3) * (on && !f ? 0.45 : 1);
    text(l, x + 56, y + 128 + i * lh, { px: 38, mono: true, color: f ? C.bad : C.text });
  });
  ctx.globalAlpha = fadeIn(t, d * p.at, 0.6);
  text(p.caption, W / 2, y + h + 90, { px: 44, align: "center", color: C.bad, weight: 600 });
  ctx.globalAlpha = 1;
};

/* The stall as a sequence diagram, revealed in five stages; time runs downward. */
S.seq = (t, d, p) => {
  const cx = 580, sx = 1340, top = 250, bot = 960, st = p.stage;
  const on = (s) => (s < st ? 1 : s === st ? 1 : 0), loc = (s, a, b) => (s < st ? 1 : s === st ? ease(prog(t, d * a, d * b)) : 0);
  [[cx, "client"], [sx, "server"]].forEach(([x, lab]) => { rect(x - 130, top - 80, 260, 64, C.panel, 12, C.line, 3); text(lab, x, top - 37, { px: 36, align: "center", weight: 600 });
    ctx.fillStyle = C.line; ctx.fillRect(x - 1, top - 16, 3, bot - top + 16); });
  const pkt = (g, y, dir, lab, col, bare) => { if (g <= 0) return; const xa = dir > 0 ? cx : sx, xb = dir > 0 ? sx : cx, xe = lerp(xa, xb, g), ye = y + 36 * g;
    ctx.save(); if (bare) ctx.setLineDash([16, 10]); arrow(xa, y, xe, ye, col, 5); ctx.restore();
    ctx.globalAlpha = Math.min(1, g * 3); text(lab, (cx + sx) / 2, y - 6, { px: 34, align: "center", color: col, weight: 600 }); ctx.globalAlpha = 1; };
  pkt(loc(1, 0.25, 0.6), 290, 1, "header · 8 bytes", C.acc);
  if (st === 1) { ctx.globalAlpha = fadeIn(t, d * 0.55, 0.5); text("nothing unacknowledged: goes at once", cx + 30, 420, { px: 30, color: C.good }); ctx.globalAlpha = 1; }
  // stage 2: body held on the client
  let a2 = loc(2, 0.3, 0.5), rel = loc(5, 0.42, 0.5);
  if (a2 > 0 && rel < 1) { ctx.globalAlpha = a2 * (1 - rel); rect(cx - 470, 400, 400, 96, "#2d2410", 12, C.warn, 3);
    text("body · 100 bytes", cx - 270, 442, { px: 32, align: "center", color: C.warn, weight: 600 }); text("held: waiting for ACK", cx - 270, 480, { px: 26, align: "center", color: C.warn }); ctx.globalAlpha = 1; }
  // stage 3: server has half a request
  let a3 = loc(3, 0.2, 0.4);
  if (a3 > 0 && rel < 1) { ctx.globalAlpha = a3 * (1 - rel); rect(sx + 70, 400, 420, 96, "#10202d", 12, C.acc, 3);
    text("has header, needs body", sx + 280, 442, { px: 30, align: "center", color: C.acc, weight: 600 }); text("ACK delayed: timer runs", sx + 280, 480, { px: 26, align: "center", color: C.acc }); ctx.globalAlpha = 1; }
  // stage 4: both wait, clock runs
  const a4 = loc(4, 0.1, 0.3);
  if (a4 > 0) { ctx.globalAlpha = a4; ctx.strokeStyle = C.bad; ctx.lineWidth = 6; ctx.setLineDash([6, 12]);
    [cx, sx].forEach((x) => { ctx.beginPath(); ctx.moveTo(x, 360); ctx.lineTo(x, 640); ctx.stroke(); }); ctx.setLineDash([]);
    const ms = st === 4 ? Math.floor(38 * prog(t, d * 0.15, d)) : 40;
    text(ms + " ms", (cx + sx) / 2, 540, { px: 110, weight: 700, mono: true, align: "center", color: C.bad, glow: 22 });
    text(st === 4 ? "each is waiting for the other" : "the server's timer runs out", (cx + sx) / 2, 600, { px: 34, align: "center", color: C.dim }); ctx.globalAlpha = 1; }
  // stage 5: release
  pkt(loc(5, 0.26, 0.4), 670, -1, "bare ACK · 0 bytes", C.good, true);
  pkt(loc(5, 0.44, 0.56), 750, 1, "body · 100 bytes", C.warn);
  pkt(loc(5, 0.58, 0.7), 830, -1, "reply · 4 bytes", C.acc);
  if (st === 5) { ctx.globalAlpha = fadeIn(t, d * 0.76, 0.6); text("41 ms in total · 40 of them waiting", (cx + sx) / 2, 1000, { px: 44, align: "center", color: C.bad, weight: 700 }); ctx.globalAlpha = 1; }
};

/* Packets of one real request, from the tcpdump recording. */
S.trace = (t, d, p) => {
  const pk = EP.data.trace[p.variant][p.req === undefined ? 1 : p.req], x = 200, w = W - 400, lh = 86, h = pk.length * lh + 110 + (p.gap ? 70 : 0), y = Math.max(190, (H - h) / 2 - 50);
  panel(x, y, w, h, p.label);
  const name = (q) => q.dir === "c2s" ? (q.len === 8 ? "header · 8 bytes" : q.len === 100 ? "body · 100 bytes" : q.len === 108 ? "header + body · 108 bytes" : "ACK · 0 bytes")
                                      : (q.len === 4 ? (p.variant === "C" && (p.req === undefined || p.req === 1) ? "reply · 4 bytes, carrying the ACK" : "reply · 4 bytes") : "ACK · 0 bytes");
  let yy = y + 122;
  pk.forEach((q, i) => {
    const a = fadeIn(t, 0.4 + i * Math.min(1.1, (d * 0.6) / pk.length), 0.5); ctx.globalAlpha = a;
    const c2s = q.dir === "c2s", col = q.len === 0 ? C.dim : c2s ? C.warn : C.acc, hot = (p.hot || []).includes(i);
    if (p.gap && i === p.gap) { text("· · ·  " + p.gapText + "  · · ·", x + w / 2, yy - 8, { px: 38, align: "center", color: C.bad, weight: 700 }); yy += 70; }
    if (hot) rect(x + 16, yy - 56, w - 32, lh - 6, "#2d1517", 8);
    text(fmt(q.us) + " µs", x + 330, yy, { px: 38, mono: true, align: "right", color: hot ? C.bad : C.text });
    text(c2s ? "client → server" : "server → client", x + 400, yy, { px: 34, mono: true, color: c2s ? C.warn : C.acc });
    text(name(q), x + 800, yy, { px: 38, color: hot ? C.bad : col, weight: q.len ? 600 : 400 });
    yy += lh;
  });
  ctx.globalAlpha = fadeIn(t, d * 0.72, 0.6);
  text(p.foot, W / 2, Math.min(y + h + 80, H - 60), { px: 42, align: "center", color: p.footColor === "good" ? C.good : C.bad, weight: 600 });
  ctx.globalAlpha = 1;
};

S.variants = (t, d, p) => {
  const R = EP.data.results, rows = [["A", "two writes, default sockets", "the stall", C.bad], ["B", "two writes, TCP_NODELAY on the client", "removes Nagle's rule", C.good],
    ["D", "two writes, server acknowledges at once", "removes the delayed ACK", C.good], ["C", "one write, default sockets", "removes the two writes", C.good]];
  const x = 150, w = W - 300, y = 250, lh = 150;
  text(p.head || "four versions of the same request · 400 requests each · median", x, y - 30, { px: 32, color: C.dim });
  rows.forEach(([v, desc, ing, col], i) => {
    const shown = p.show.includes(v), cur = p.show[p.show.length - 1] === v && !p.all, yy = y + i * lh;
    ctx.globalAlpha = fadeIn(t, 0.2 + i * 0.25, 0.5);
    rect(x, yy, w, lh - 20, C.panel, 14, cur ? col : C.line, cur ? 4 : 2);
    text(v, x + 60, yy + 86, { px: 64, weight: 700, mono: true, align: "center", color: shown ? col : C.dim });
    text(desc, x + 130, yy + (p.all ? 62 : 80), { px: 38 });
    if (p.all) text(ing, x + 130, yy + 108, { px: 30, color: col });
    const a = shown ? (cur ? fadeIn(t, d * 0.55, 0.5) : 1) : 0;
    ctx.globalAlpha *= 1; if (!shown) text("?", x + w - 60, yy + 88, { px: 60, mono: true, align: "right", color: C.dim });
    else { ctx.globalAlpha = a * fadeIn(t, 0.2 + i * 0.25, 0.5); text(R[v].median_ms.toFixed(3) + " ms", x + w - 60, yy + 88, { px: 60, weight: 700, mono: true, align: "right", color: col }); }
  });
  ctx.globalAlpha = 1;
};

S.first20 = (t, d, p) => {
  const F = EP.data.results.A.first_20_ms, x0 = 260, y0 = 260, w = 1400, h = 440, bw = w / 20;
  text("variant A · the first 20 of 400 requests", x0, y0 - 40, { px: 34, color: C.dim });
  rect(x0, y0, w, h, "#0a0d12", 6, C.line);
  [0, 20, 40].forEach((v) => text(v + " ms", x0 - 18, y0 + h - (v / 45) * h + 9, { px: 26, mono: true, color: C.dim, align: "right" }));
  F.forEach((v, i) => { const g = ease(prog(t, 0.3 + i * 0.05, 0.9 + i * 0.05)), bh = Math.max(4, (v / 45) * h * g);
    rect(x0 + i * bw + 8, y0 + h - bh, bw - 16, bh, i === 0 ? C.warn : "#8a3b3b", 4); });
  ctx.globalAlpha = fadeIn(t, d * 0.2, 0.6);
  arrow(x0 + bw / 2, y0 + h - 170, x0 + bw / 2, y0 + h - 20, C.warn); rect(x0 + 14, y0 + h - 246, 420, 66, "#0d1117", 10, C.warn, 2); text("request 1: " + F[0] + " ms", x0 + 34, y0 + h - 200, { px: 40, color: C.warn, weight: 700 });
  ctx.globalAlpha = fadeIn(t, d * 0.4, 0.6);
  text("packet trace: the server acknowledged that first header after " + EP.data.trace.A[0][1].us + " µs, with no delay", x0, y0 + h + 90, { px: 32, color: C.text });
  ctx.globalAlpha = fadeIn(t, d * 0.62, 0.6);
  text("“…will once again enter/leave quickack mode depending on internal protocol processing…”", x0, y0 + h + 160, { px: 30, color: C.dim });
  text("tcp(7), TCP_QUICKACK · why it applied here: not established", x0, y0 + h + 206, { px: 26, mono: true, color: C.warn });
  ctx.globalAlpha = 1;
};

/* ---------- episode 3 scenes: hybrid cores ---------- */
const JOB = { int: ["integer chain", C.acc], mem: ["pointer chasing", C.warn], vec: ["vector arithmetic", C.bad] };
S.scaling = (t, d, p) => {
  const x0 = 260, y0 = 220, w = 1100, h = 640, D = EP.data, X = (k) => x0 + ((k - 1) / 11) * w, Y = (v) => y0 + h - (v / 12) * h;
  text(p.head || "work done as more copies run together (1 = one copy alone)", x0, y0 - 40, { px: 32, color: C.dim });
  rect(x0, y0, w, h, "#0a0d12", 6, C.line);
  for (let v = 0; v <= 12; v += 2) { ctx.fillStyle = "#1c2128"; ctx.fillRect(x0, Y(v), w, 1); text(v + "×", x0 - 18, Y(v) + 9, { px: 26, mono: true, color: C.dim, align: "right" }); }
  for (let k = 1; k <= 12; k++) text(String(k), X(k), y0 + h + 42, { px: 26, mono: true, color: C.dim, align: "center" });
  text("copies running at once", x0 + w / 2, y0 + h + 90, { px: 28, color: C.dim, align: "center" });
  ctx.save(); ctx.setLineDash([10, 12]); ctx.strokeStyle = C.dim; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(X(1), Y(1)); ctx.lineTo(X(12), Y(12)); ctx.stroke(); ctx.restore();
  text("if all 12 threads were equal", X(8.2), Y(9.6), { px: 26, color: C.dim });
  const endOf = (m) => m === "vec" && !p.hot ? D.vec_repeat.mean[6] / D.vec_repeat.mean[0] : D.scaling[m][11] / D.scaling[m][0];
  const order = [...p.modes].sort((a, b) => endOf(b) - endOf(a)), ly = {}; let prev = -1e9;
  order.forEach((m) => { const yv = Math.max(Y(endOf(m)) + 20, prev + 120); ly[m] = yv; prev = yv; });
  p.modes.forEach((m, mi) => {
    const cur = mi === p.modes.length - 1, col = JOB[m][1];
    const pts = m === "vec" && !p.hot ? D.vec_repeat.k.map((k, i) => [k, D.vec_repeat.mean[i] / D.vec_repeat.mean[0]]) : D.scaling[m].map((v, i) => [i + 1, v / D.scaling[m][0]]);
    const g = cur ? ease(prog(t, d * 0.12, d * 0.55)) : 1, upto = 1 + 11 * g;
    ctx.strokeStyle = col; ctx.lineWidth = 6; ctx.beginPath(); let last = pts[0];
    pts.forEach(([k, v], i) => { if (k > upto) return; if (i === 0) ctx.moveTo(X(k), Y(v)); else ctx.lineTo(X(k), Y(v)); last = [k, v]; }); ctx.stroke();
    pts.forEach(([k, v]) => { if (k > upto) return; ctx.beginPath(); ctx.arc(X(k), Y(v), 9, 0, 7); ctx.fillStyle = col; ctx.fill(); });
    const a = cur ? fadeIn(t, d * 0.58, 0.5) : 1; ctx.globalAlpha = a; const end = pts[pts.length - 1];
    text(end[1].toFixed(1) + "×", x0 + w + 40, ly[m], { px: 72, weight: 700, mono: true, color: col, glow: cur ? 20 : 0 });
    text(JOB[m][0] + (m === "vec" && !p.hot ? " · mean of 3 runs" : ""), x0 + w + 44, ly[m] + 38, { px: 26, color: col }); ctx.globalAlpha = 1;
  });
  if (p.note) { ctx.globalAlpha = fadeIn(t, d * 0.7, 0.6); text(p.note, x0 + 30, y0 + 60, { px: 32, color: C.text }); ctx.globalAlpha = 1; }
};

S.corebars = (t, d, p) => {
  const R = EP.data.pinned[p.mode], S2 = EP.data.summary[p.mode], x0 = 150, y0 = 250, h = 520, bw = 86, max = p.max || 1.5;
  text(JOB[p.mode][0] + " · pinned to each processor in turn · best of 3 runs", x0, y0 - 40, { px: 32, color: C.dim });
  R.forEach((r, i) => { const P = i < 4, x = x0 + i * bw + (P ? 0 : 60), g = ease(prog(t, 0.3 + i * 0.08, 1.0 + i * 0.08)), bh = (r.s / max) * h * g;
    rect(x + 10, y0 + h - bh, bw - 20, bh, P ? C.acc : C.warn, 6); text(String(i), x + bw / 2, y0 + h + 42, { px: 28, mono: true, align: "center", color: C.dim }); });
  text("performance threads", x0 + 2 * bw, y0 + h + 92, { px: 28, align: "center", color: C.acc }); text("efficient cores", x0 + 60 + 8 * bw, y0 + h + 92, { px: 28, align: "center", color: C.warn });
  ctx.globalAlpha = fadeIn(t, d * 0.25, 0.5); text(S2.P_s.toFixed(2) + " s", x0 + 2 * bw, y0 + h - (S2.P_s / max) * h - 24, { px: 48, weight: 700, mono: true, align: "center", color: C.acc });
  ctx.globalAlpha = fadeIn(t, d * 0.5, 0.5); text(S2.E_s.toFixed(2) + " s", x0 + 60 + 8 * bw, y0 + h - (S2.E_s / max) * h - 24, { px: 48, weight: 700, mono: true, align: "center", color: C.warn });
  ctx.globalAlpha = fadeIn(t, d * 0.72, 0.5); text(p.big, 1580, 500, { px: 76, weight: 700, align: "center", color: C.bad, glow: 22 }); text(p.sub || "", 1580, 566, { px: 32, align: "center", color: C.dim });
  ctx.globalAlpha = 1;
};

S.chip = (t, d, p) => {
  const x0 = 250, y0 = 300; text("Intel Core i5-1235U, as the operating system sees it", x0, y0 - 60, { px: 34, color: C.dim });
  for (let c = 0; c < 2; c++) { const a = fadeIn(t, 0.4 + c * 0.5, 0.5), x = x0 + c * 330; ctx.globalAlpha = a; rect(x, y0, 300, 300, "#10202d", 16, C.acc, 4);
    text("performance core", x + 150, y0 + 44, { px: 26, align: "center", color: C.acc });
    for (let k = 0; k < 2; k++) { rect(x + 20 + k * 135, y0 + 70, 125, 210, "#1f3a5f", 10); text(String(c * 2 + k), x + 82 + k * 135, y0 + 195, { px: 64, weight: 700, mono: true, align: "center" }); } }
  for (let e = 0; e < 8; e++) { const a = fadeIn(t, d * 0.42 + e * 0.12, 0.4), x = x0 + 720 + (e % 4) * 180, y = y0 + Math.floor(e / 4) * 160; ctx.globalAlpha = a;
    rect(x, y, 160, 140, "#2d2410", 12, C.warn, 3); text(String(4 + e), x + 80, y + 92, { px: 56, weight: 700, mono: true, align: "center", color: C.warn }); }
  ctx.globalAlpha = fadeIn(t, d * 0.42, 0.5); text("efficient cores", x0 + 720 + 350, y0 - 14, { px: 26, align: "center", color: C.warn });
  ctx.globalAlpha = fadeIn(t, d * 0.8, 0.6); text("2 × 2  +  8  =  12 threads", W / 2, 800, { px: 80, weight: 700, mono: true, align: "center", glow: 18 });
  text("Intel product specification: 2 performance cores, 8 efficient cores, 12 threads", W / 2, 870, { px: 28, align: "center", mono: true, color: C.dim }); ctx.globalAlpha = 1;
};

S.worktable = (t, d, p) => {
  const x = 140, w = W - 280, y = 300, lh = 150, cols = [x + 40, x + 700, x + 960, x + 1220, x + 1480];
  ["job", "P-core", "E-core", "E is slower by", "clock P / E"].forEach((hh, i) => text(hh, cols[i] + (i ? 0 : 0), y - 30, { px: 28, color: C.dim, align: i ? "right" : "left" }));
  p.rows.forEach((m, i) => { const s = EP.data.summary[m], cur = i === p.rows.length - 1, yy = y + i * lh, a = cur ? fadeIn(t, 0.3, 0.6) : 1; ctx.globalAlpha = a;
    rect(x, yy, w, lh - 22, C.panel, 14, cur ? JOB[m][1] : C.line, cur ? 4 : 2);
    text(JOB[m][0], cols[0], yy + 80, { px: 40, color: JOB[m][1], weight: 600 });
    text(s.P_s.toFixed(2) + " s", cols[1], yy + 82, { px: 44, mono: true, align: "right" }); text(s.E_s.toFixed(2) + " s", cols[2], yy + 82, { px: 44, mono: true, align: "right" });
    ctx.globalAlpha = a * (cur ? fadeIn(t, d * 0.35, 0.5) : 1);
    text(s.E_over_P_time < 2 ? Math.round((s.E_over_P_time - 1) * 100) + "%" : s.E_over_P_time.toFixed(1) + "×", cols[3], yy + 84, { px: 56, weight: 700, mono: true, align: "right", color: JOB[m][1] });
    text((s.P_mhz / 1000).toFixed(1) + " / " + (s.E_mhz / 1000).toFixed(1) + " GHz", cols[4] + 120, yy + 82, { px: 34, mono: true, align: "right", color: C.dim }); });
  ctx.globalAlpha = fadeIn(t, d * 0.62, 0.6); text(p.foot, W / 2, y + p.rows.length * lh + 90, { px: 44, align: "center", color: C.text, weight: 600 }); ctx.globalAlpha = 1;
};

S.placement = (t, d, p) => {
  const U = EP.data.unpinned, x0 = 240, bw = 120, y = 330, tot = U.samples_on_P + U.samples_on_E;
  text("one unpinned integer job · which processor is it on? · sampled 100 times a second, 20 runs", x0, y - 70, { px: 30, color: C.dim });
  for (let i = 0; i < 12; i++) { const P = i < 4; rect(x0 + i * bw + 8, y, bw - 16, 120, P ? "#10202d" : "#2d2410", 10, P ? C.acc : C.warn, 3); text(String(i), x0 + i * bw + bw / 2, y + 78, { px: 44, mono: true, align: "center", color: P ? C.acc : C.warn }); }
  const step = Math.floor(t / 0.22), r = rnd(step * 7919 + 13)(), cpu = r < U.share_on_P ? Math.floor(rnd(step * 31 + 5)() * 4) : 4 + Math.floor(rnd(step * 17 + 3)() * 8);
  ctx.beginPath(); ctx.arc(x0 + cpu * bw + bw / 2, y - 26, 16, 0, 7); ctx.fillStyle = C.text; ctx.shadowColor = C.text; ctx.shadowBlur = 16; ctx.fill(); ctx.shadowBlur = 0;
  const bx = x0, bwid = 12 * bw, by = 600, g = ease(prog(t, d * 0.45, d * 0.7)); ctx.globalAlpha = fadeIn(t, d * 0.42, 0.5);
  rect(bx, by, bwid, 90, "#2d2410", 10); rect(bx, by, bwid * U.share_on_P * g, 90, C.acc, 10);
  text(Math.round(U.share_on_P * 100) + "% on a performance thread", bx + 30, by + 60, { px: 40, weight: 700, color: "#0d1117" });
  text(fmt(U.samples_on_P) + " of " + fmt(tot) + " samples", bx, by + 150, { px: 32, mono: true, color: C.dim }); ctx.globalAlpha = 1;
};

S.pairs = (t, d, p) => {
  const D = EP.data.pairs, names = { alone_on_P: "one copy, alone on a P-core", two_P_cores: "two copies on two P-cores (each)", same_P_core_two_threads: "two copies on the two threads of one P-core (each)", two_E_cores: "two copies on two E-cores (each)" };
  const x0 = 180, bx = 180, y = 280, lh = 170, max = 1.3, bw = 1100;
  text("integer job · seconds per copy, and the clock speed while it ran", x0, y - 40, { px: 32, color: C.dim });
  p.rows.forEach((k, i) => { const cur = i === p.rows.length - 1, a = cur ? fadeIn(t, d * (p.at || 0.25), 0.5) : 1, r = D[k], yy = y + i * lh, col = k === "alone_on_P" ? C.acc : k === "two_E_cores" ? C.warn : C.bad; ctx.globalAlpha = a;
    text(names[k], x0, yy + 36, { px: 34 }); const g = cur ? ease(prog(t, d * (p.at || 0.25), d * (p.at || 0.25) + 1)) : 1;
    rect(bx, yy + 54, (r.s / max) * bw * g, 64, col, 8); text(r.s.toFixed(2) + " s", bx + (r.s / max) * bw + 24, yy + 100, { px: 44, weight: 700, mono: true, color: col });
    text((r.mhz / 1000).toFixed(1) + " GHz", bx + (r.s / max) * bw + 230, yy + 100, { px: 44, mono: true, color: C.text }); });
  ctx.globalAlpha = fadeIn(t, d * 0.7, 0.6); text(p.foot, W / 2, y + p.rows.length * lh + 60, { px: 42, align: "center", color: C.warn, weight: 600 }); ctx.globalAlpha = 1;
};

/* ---------- episode 4 scenes: a regular expression, two engines ---------- */
S.incident = (t, d, p) => {
  const E = EP.data.timeline, x0 = 240, x1 = W - 240, y = 520, T0 = 13 * 60 + 30, T1 = 15 * 60, X = (hm) => { const [h, m] = hm.split(":").map(Number); return x0 + ((h * 60 + m - T0) / (T1 - T0)) * (x1 - x0); };
  text(p.head || "2 July 2019 · times in UTC · from Cloudflare's published report", x0, 250, { px: 32, color: C.dim });
  ctx.fillStyle = C.line; ctx.fillRect(x0, y, x1 - x0, 4);
  ["13:30", "14:00", "14:30", "15:00"].forEach((h) => { ctx.fillStyle = C.dim; ctx.fillRect(X(h), y - 10, 2, 24); text(h, X(h), y + 60, { px: 26, mono: true, align: "center", color: C.dim }); });
  const g = ease(prog(t, d * 0.3, d * 0.6)), xa = X("13:42"), xb = X("14:09");
  rect(xa, y - 26, (xb - xa) * g, 56, C.bad, 6);
  E.forEach(([hm, lab], i) => { const a = fadeIn(t, d * (0.12 + i * 0.22), 0.5); ctx.globalAlpha = a; const up = i % 2 === 0, yy = up ? y - 110 : y + 150;
    arrow(X(hm), up ? yy + 20 : yy - 50, X(hm), up ? y - 34 : y + 84, i === 0 ? C.bad : C.good, 3);
    text(hm, X(hm), yy - 34, { px: 44, weight: 700, mono: true, align: "center", color: i === 0 ? C.bad : C.good }); text(lab, X(hm), yy + 4, { px: 30, align: "center" }); });
  ctx.globalAlpha = fadeIn(t, d * 0.62, 0.6); text("27 minutes", W / 2, 880, { px: 110, weight: 700, align: "center", color: C.bad, glow: 26 }); ctx.globalAlpha = 1;
};

S.regexshow = (t, d, p) => {
  const L = EP.data.pattern, x = 110, y = 240, w = W - 220, hot = ".*(?:.*=.*)";
  panel(x, y, w, 300, "the pattern, as published in the report (wrapped onto two lines)");
  L.forEach((l, i) => { ctx.globalAlpha = fadeIn(t, 0.3 + i * 0.5, 0.5); const yy = y + 150 + i * 80, k = l.indexOf(hot), on = t > d * 0.45 && k >= 0;
    if (!on) text(l, x + 40, yy, { px: 28, mono: true, color: t > d * 0.45 ? C.dim : C.text });
    else { const a = l.slice(0, k), wa = measure(a, 28, true); text(a, x + 40, yy, { px: 28, mono: true, color: C.dim }); rect(x + 36 + wa, yy - 36, measure(hot, 28, true) + 8, 50, "#2d1517", 6, C.bad);
      text(hot, x + 40 + wa, yy, { px: 28, mono: true, color: C.bad, weight: 700 }); text(l.slice(k + hot.length), x + 40 + wa + measure(hot, 28, true), yy, { px: 28, mono: true, color: C.dim }); } });
  ctx.globalAlpha = fadeIn(t, d * 0.7, 0.6);
  text(".*.*=.*", W / 2, 760, { px: 150, weight: 700, mono: true, align: "center", color: C.bad, glow: 28 });
  text("the report's own simplification of the part that matters", W / 2, 840, { px: 32, align: "center", color: C.dim }); ctx.globalAlpha = 1;
};

S.readpattern = (t, d, p) => {
  const parts = [[".*", "anything"], [".*", "anything"], ["=", "an equals sign"], [".*", "anything"]], cw = 300, x0 = (W - parts.length * cw) / 2;
  parts.forEach(([s, lab], i) => { const a = fadeIn(t, d * (0.08 + i * 0.16), 0.5); ctx.globalAlpha = a; const col = s === "=" ? C.warn : C.acc;
    text(s, x0 + i * cw + cw / 2, 430, { px: 150, weight: 700, mono: true, align: "center", color: col }); text(lab, x0 + i * cw + cw / 2, 520, { px: 36, align: "center", color: col }); });
  ctx.globalAlpha = fadeIn(t, d * 0.72, 0.6); text(p.foot, W / 2, 760, { px: 52, align: "center", weight: 600 }); ctx.globalAlpha = 1;
};

/* The backtracker on n x's with no '=': each try splits the text between the two .* and then looks for '='. */
S.backtrk = (t, d, p) => {
  const N = EP.data.n, T = EP.data.tries, cw = 150, x0 = (W - (N + 1) * cw) / 2, y = 380;
  const k = Math.min(T.length - 1, Math.floor(p.from + (p.to - p.from) * ease(prog(t, d * 0.08, d * 0.92)))), [s, a, b] = T[k];
  text("input: " + N + " characters, no equals sign · pattern  .*.*=.*", x0, 190, { px: 32, color: C.dim });
  for (let i = 0; i < N; i++) { const inA = i >= s && i < a, inB = i >= a && i < b; rect(x0 + i * cw + 8, y, cw - 16, 130, inA ? "#10202d" : inB ? "#12261e" : C.panel, 12, inA ? C.acc : inB ? C.good : C.line, 3);
    text("x", x0 + i * cw + cw / 2, y + 92, { px: 80, mono: true, align: "center", color: i < s ? C.dim : C.text }); }
  const bar = (i0, i1, col, lab, yy) => { const xa = x0 + i0 * cw + 8, xb = x0 + i1 * cw - 8; if (i1 > i0) { rect(xa, yy, xb - xa, 14, col, 7); text(lab, (xa + xb) / 2, yy + 56, { px: 30, align: "center", color: col }); }
    else text(lab + ": nothing", x0 + i0 * cw, yy + 56, { px: 26, align: "center", color: col }); };
  bar(s, a, C.acc, "first .*", y + 150); bar(a, b, C.good, "second .*", y + 230);
  const xq = x0 + b * cw + (b < N ? cw / 2 : 20); arrow(xq, y - 90, xq, y - 10, C.bad); text("= ?  no", xq, y - 104, { px: 36, mono: true, align: "center", color: C.bad, weight: 700 });
  if (s > 0) text("starting again from character " + (s + 1), x0, y + 360, { px: 32, color: C.warn });
  text("try " + (k + 1) + " of " + T.length, W / 2, 900, { px: 84, weight: 700, mono: true, align: "center", color: C.bad, glow: 20 });
};

/* The state-set matcher: one pass, a small set of active places in the pattern. */
S.stateset = (t, d, p) => {
  const N = EP.data.n, cw = 150, x0 = (W - (N + 1) * cw) / 2, y = 300, pos = Math.min(N, Math.floor((N + 1) * prog(t, d * 0.15, d * 0.85)));
  text("same input, same pattern · read once, left to right", x0, 230, { px: 32, color: C.dim });
  for (let i = 0; i < N; i++) { rect(x0 + i * cw + 8, y, cw - 16, 130, i < pos ? "#12261e" : C.panel, 12, i === pos ? C.warn : i < pos ? C.good : C.line, 3); text("x", x0 + i * cw + cw / 2, y + 92, { px: 80, mono: true, align: "center", color: i < pos ? C.good : C.text }); }
  if (pos < N) arrow(x0 + pos * cw + cw / 2, y - 80, x0 + pos * cw + cw / 2, y - 8, C.warn);
  const st = [[".*", true], [".*", true], ["=", true], [".*", false], ["match", false]], sw = 250, sx = (W - st.length * sw) / 2, sy = 590;
  text("places in the pattern the engine could be right now", sx, sy - 30, { px: 30, color: C.dim });
  st.forEach(([lab, on], i) => { const pulse = on ? 0.75 + 0.25 * Math.sin(t * 5 + i) : 1; ctx.globalAlpha = pulse; rect(sx + i * sw + 10, sy, sw - 20, 120, on ? "#10202d" : C.panel, 14, on ? C.acc : C.line, on ? 4 : 2);
    text(lab, sx + i * sw + sw / 2, sy + 80, { px: 56, mono: true, align: "center", color: on ? C.acc : C.dim, weight: 700 }); ctx.globalAlpha = 1; });
  text("characters read: " + pos + " of " + N + " · never goes back", W / 2, 900, { px: 64, weight: 700, mono: true, align: "center", color: C.good, glow: 16 });
};

S.doubling = (t, d, p) => {
  const R = EP.data.nomatch.filter((r) => r.n >= 40), x = 200, w = W - 400, y = 300, lh = 130, cols = [x + 60, x + 760, x + 1020, x + 1440];
  ["input length", "backtracking: steps", "× previous", p.sim ? "all paths at once: steps" : ""].forEach((h, i) => text(h, cols[i], y - 30, { px: 28, color: C.dim, align: i ? "right" : "left" }));
  R.forEach((r, i) => { const a = fadeIn(t, d * (0.1 + i * 0.17), 0.5); ctx.globalAlpha = a; const yy = y + i * lh; rect(x, yy, w, lh - 20, C.panel, 14, C.line);
    text(r.n + " characters", cols[0], yy + 72, { px: 40 }); text(fmt(r.back), cols[1], yy + 74, { px: 48, mono: true, align: "right", color: C.bad, weight: 700 });
    if (i) text("× " + (r.back / R[i - 1].back).toFixed(1), cols[2], yy + 74, { px: 44, mono: true, align: "right", color: C.warn });
    if (p.sim) { ctx.globalAlpha = a * fadeIn(t, d * 0.55, 0.5); text(fmt(r.sim), cols[3], yy + 74, { px: 48, mono: true, align: "right", color: C.good, weight: 700 }); } });
  ctx.globalAlpha = fadeIn(t, d * 0.8, 0.6); text(p.foot, W / 2, y + R.length * lh + 70, { px: 46, align: "center", color: p.sim ? C.good : C.warn, weight: 600 }); ctx.globalAlpha = 1;
};

S.growth = (t, d, p) => {
  const x0 = 280, y0 = 220, w = 1000, h = 620, exp = p.mode === "exp", D = exp ? EP.data.exponential : EP.data.nomatch.filter((r) => r.n >= 5);
  const xs = D.map((r) => r.n), lo = Math.min(...xs), hi = Math.max(...xs), X = exp ? (n) => x0 + ((n - lo) / (hi - lo)) * w : (n) => x0 + (Math.log(n / lo) / Math.log(hi / lo)) * w;
  const ymax = exp ? 7 : 8, Y = (v) => y0 + h - (Math.log10(v) / ymax) * h;
  text(exp ? "pattern (x+x+)+y on n x's · steps, logarithmic scale" : "pattern .*.*=.* on n x's · steps against input length, both axes logarithmic", x0, y0 - 40, { px: 30, color: C.dim });
  rect(x0, y0, w, h, "#0a0d12", 6, C.line);
  for (let e = 0; e <= ymax; e += exp ? 1 : 2) { ctx.fillStyle = "#1c2128"; ctx.fillRect(x0, Y(10 ** e), w, 1); text("10" + (e ? "^" + e : "⁰").replace("^", "^"), x0 - 16, Y(10 ** e) + 9, { px: 24, mono: true, color: C.dim, align: "right" }); }
  xs.forEach((n) => text(String(n), X(n), y0 + h + 40, { px: 24, mono: true, color: C.dim, align: "center" })); text("input length (characters)", x0 + w / 2, y0 + h + 88, { px: 28, color: C.dim, align: "center" });
  const g = ease(prog(t, d * 0.1, d * 0.5));
  [["back", C.bad], ["sim", C.good]].forEach(([key, col]) => { ctx.strokeStyle = col; ctx.lineWidth = 6; ctx.beginPath(); let started = false;
    D.forEach((r, i) => { if (i / (D.length - 1) > g) return; const xx = X(r.n), yy = Y(r[key]); if (!started) { ctx.moveTo(xx, yy); started = true; } else ctx.lineTo(xx, yy); }); ctx.stroke();
    D.forEach((r, i) => { if (i / (D.length - 1) > g) return; ctx.beginPath(); ctx.arc(X(r.n), Y(r[key]), 8, 0, 7); ctx.fillStyle = col; ctx.fill(); }); });
  ctx.globalAlpha = fadeIn(t, d * 0.55, 0.6); const lx = x0 + w + 40;
  text(exp ? "backtracking" : "backtracking", lx, Y(D[D.length - 1].back) + 10, { px: 34, color: C.bad, weight: 700 }); text(exp ? "× 2 per extra character" : "× 8 per doubling: a cube", lx, Y(D[D.length - 1].back) + 54, { px: 30, color: C.bad });
  text("all paths at once", lx, Y(D[D.length - 1].sim) - 20, { px: 34, color: C.good, weight: 700 }); text(exp ? "a straight line here too" : "× 2 per doubling: a line", lx, Y(D[D.length - 1].sim) + 24, { px: 30, color: C.good });
  if (p.big) { ctx.globalAlpha = fadeIn(t, d * 0.75, 0.6); text(p.big, x0 + 40, y0 + 80, { px: 60, weight: 700, color: C.warn, glow: 18 }); } ctx.globalAlpha = 1;
};

S.walltime = (t, d, p) => {
  const R = EP.data.full.runs.filter((r) => r.n >= 200), x0 = 200, y = 300, lh = 130, bw = 860, max = Math.log10(200 / 0.01);
  text(p.head || "the full published pattern · Python's built-in engine · input: n digits, nothing else", x0, y - 50, { px: 30, color: C.dim });
  R.forEach((r, i) => { const a = p.all ? 1 : fadeIn(t, d * (0.12 + i * 0.2), 0.5); ctx.globalAlpha = a; const yy = y + i * lh, g = p.all ? 1 : ease(prog(t, d * (0.12 + i * 0.2), d * (0.12 + i * 0.2) + 1.2)), len = (Math.log10(r.seconds / 0.01) / max) * bw * g, last = i === R.length - 1;
    text(fmt(r.n) + " digits", x0, yy + 62, { px: 40 }); rect(x0 + 300, yy + 16, Math.max(6, len), 70, last ? C.bad : "#8a3b3b", 8);
    text(r.seconds >= 60 ? Math.floor(r.seconds / 60) + " min " + Math.round(r.seconds % 60) + " s" : r.seconds >= 1 ? r.seconds.toFixed(1) + " s" : r.seconds.toFixed(2) + " s", x0 + 300 + len + 24, yy + 68, { px: last ? 60 : 44, weight: 700, mono: true, color: last ? C.bad : C.text, glow: last ? 20 : 0 }); });
  ctx.globalAlpha = fadeIn(t, d * 0.82, 0.6); text(p.foot || "", W / 2, y + R.length * lh + 70, { px: 42, align: "center", color: C.warn, weight: 600 });
  text("bar lengths are logarithmic", x0 + 300, y + R.length * lh + 6, { px: 24, color: C.dim }); ctx.globalAlpha = 1;
};

/* ---------- episode 5 scenes: tokenisers ---------- */
const ENCNAME = { gpt2: ["GPT-2 tokeniser", "2019"], cl100k_base: ["cl100k_base · used by GPT-4", "2023"], o200k_base: ["o200k_base · used by GPT-4o", "2024"] };
function chipRow(P, x0, y0, maxW, t, at, px) {
  let x = x0, y = y0; const h = px * 1.7, cols = ["#1f3a5f", "#274b7a", "#3a2d5f", "#1f4d3a", "#5f3a1f"];
  P.forEach(([s, nb, ok], i) => { const w = ok ? Math.max(px * 0.7, measure(s, px, false, 600) + 22) : px * 0.62;
    if (x + w > x0 + maxW) { x = x0; y += h + 14; }
    ctx.globalAlpha = fadeIn(t, at + i * 0.03, 0.2); rect(x, y, w - 6, h, ok ? cols[i % cols.length] : "#5a2327", 8, ok ? null : C.bad, 1);
    if (ok) text(s.replace(/ /g, "␣").replace(/^␣/, " "), x + (w - 6) / 2, y + h * 0.68, { px, weight: 600, align: "center" }); x += w; });
  ctx.globalAlpha = 1; return y + h;
}
S.tokchips = (t, d, p) => {
  const E = EP.data.example, T = E.tokens[p.enc], x0 = 150, w = W - 300;
  text(ENCNAME[p.enc][0] + " · " + ENCNAME[p.enc][1], x0, 210, { px: 34, color: C.dim });
  text(E.en, x0, 290, { px: 44 }); let y = chipRow(T.en, x0, 320, w, t, 0.4, 40);
  ctx.globalAlpha = fadeIn(t, 1.2, 0.5); text(T.en.length + " tokens", x0 + w, y - 12, { px: 60, weight: 700, mono: true, align: "right", color: C.good }); ctx.globalAlpha = 1;
  const a = fadeIn(t, d * 0.42, 0.6); ctx.globalAlpha = a; text(E.hi, x0, y + 110, { px: 44 }); ctx.globalAlpha = 1;
  if (t > d * 0.42) { const y2 = chipRow(T.hi, x0, y + 140, w - 420, t, d * 0.5, 40);
    ctx.globalAlpha = fadeIn(t, d * 0.72, 0.5); text(T.hi.length + " tokens", x0 + w, y2 - 12, { px: 60, weight: 700, mono: true, align: "right", color: T.hi.length > 20 ? C.bad : C.warn, glow: 18 });
    if (p.note) text(p.note, x0, y2 + 80, { px: 32, color: C.bad }); ctx.globalAlpha = 1; }
};

S.utf8 = (t, d, p) => {
  const U = EP.data.utf8, x0 = 220; text("the same text as the bytes a computer stores (UTF-8)", x0, 230, { px: 34, color: C.dim });
  [["en", 320, C.acc], ["hi", 620, C.warn]].forEach(([k, y, col], r) => { let x = x0; const a = fadeIn(t, r ? d * 0.38 : 0.3, 0.6); ctx.globalAlpha = a;
    U[k].forEach(([ch, bytes]) => { const w = bytes.length * 110; rect(x, y, w - 14, 110, C.panel, 12, col, 3); text(ch === "ी" || ch === "ं" ? "◌" + ch : ch, x + (w - 14) / 2, y + 78, { px: 64, weight: 600, align: "center" });
      bytes.forEach((b, i) => { rect(x + i * 110, y + 130, 96, 70, "#0a0d12", 8, C.line); text(b, x + i * 110 + 48, y + 178, { px: 34, mono: true, align: "center", color: col }); }); x += w + 30; });
    text(r ? "each Devanagari letter or sign: 3 bytes" : "each English letter: 1 byte", x0, y - 22, { px: 36, color: col, weight: 600 }); });
  ctx.globalAlpha = fadeIn(t, d * 0.75, 0.6); text(p.foot, W / 2, 950, { px: 44, align: "center", weight: 600 }); ctx.globalAlpha = 1;
};

S.bpedemo = (t, d, p) => {
  const St = EP.data.demo.steps, k = Math.min(p.to, p.from + Math.floor((p.to - p.from + 1) * prog(t, d * 0.25, d * 0.98))), s = St[k], x0 = 150;
  text("byte-pair encoding by hand · text: “" + EP.data.demo.text + "”", x0, 230, { px: 34, color: C.dim });
  let x = x0, y = 330; const px = 46, h = 84;
  s.tokens.forEach((tok) => { const w = Math.max(44, measure(tok, px, true, 600) + 26), hot = s.merge && tok === s.merge[0] + s.merge[1];
    if (x + w > W - 150) { x = x0; y += h + 16; } rect(x, y, w - 8, h, hot ? "#12261e" : C.panel, 10, hot ? C.good : C.line, hot ? 4 : 2);
    text(tok.replace(/ /g, "␣"), x + (w - 8) / 2, y + 58, { px, mono: true, weight: 600, align: "center", color: hot ? C.good : C.text }); x += w; });
  text(s.tokens.length + " tokens", x0, 640, { px: 80, weight: 700, mono: true, color: C.acc });
  text(k === 0 ? "start: one token per byte" : "merge " + k + ":  “" + s.merge[0].replace(/ /g, "␣") + "” + “" + s.merge[1].replace(/ /g, "␣") + "”  →  one token", x0, 740, { px: 48, color: k ? C.good : C.dim, weight: 600 });
  text("rule: find the most frequent neighbouring pair, replace it everywhere, repeat", x0, 900, { px: 32, color: C.dim });
};

S.ownbpe = (t, d, p) => {
  const O = EP.data.own, rows = [["trained on English only", O.english_only], ["trained on English + Hindi", O.english_and_hindi]].slice(0, p.rows), x = 150, w = W - 300, y = 330, lh = 190;
  text("my own tokeniser · 2,000 merges · tested on 197 held-out sentence pairs", x, 230, { px: 32, color: C.dim });
  ["", "English test", "Hindi test", "Hindi ÷ English"].forEach((hh, i) => text(hh, x + [40, 880, 1220, 1560][i], y - 30, { px: 28, color: C.dim, align: i ? "right" : "left" }));
  rows.forEach(([lab, r], i) => { const cur = i === rows.length - 1, a = cur ? fadeIn(t, 0.3, 0.6) : 1, yy = y + i * lh; ctx.globalAlpha = a; rect(x, yy, w, lh - 30, C.panel, 14, cur ? C.acc : C.line, cur ? 4 : 2);
    text(lab, x + 40, yy + 96, { px: 42, weight: 600 }); text(fmt(r.en_tokens), x + 880, yy + 100, { px: 56, mono: true, align: "right", color: C.good, weight: 700 });
    ctx.globalAlpha = a * (cur ? fadeIn(t, d * 0.4, 0.5) : 1); text(fmt(r.hi_tokens), x + 1220, yy + 100, { px: 56, mono: true, align: "right", color: r.hi_tokens > 3 * r.en_tokens ? C.bad : C.warn, weight: 700 });
    ctx.globalAlpha = a * (cur ? fadeIn(t, d * 0.6, 0.5) : 1); text((r.hi_tokens / r.en_tokens).toFixed(r.hi_tokens > 3 * r.en_tokens ? 1 : 2) + "×", x + 1560, yy + 100, { px: 64, mono: true, align: "right", weight: 700, color: r.hi_tokens > 3 * r.en_tokens ? C.bad : C.good }); });
  ctx.globalAlpha = fadeIn(t, d * 0.78, 0.6); text(p.foot, W / 2, y + rows.length * lh + 70, { px: 42, align: "center", color: C.warn, weight: 600 });
  text("test text: " + fmt(O.test_bytes.en) + " bytes of English, " + fmt(O.test_bytes.hi) + " bytes of Hindi", x, 990, { px: 26, mono: true, color: C.dim }); ctx.globalAlpha = 1;
};

S.gens = (t, d, p) => {
  const H = EP.data.hindi, keys = ["gpt2", "cl100k_base", "o200k_base"].slice(0, p.upto || 3), cw = 520, x0 = (W - 3 * cw) / 2, base = 800, max = 8;
  text("tokens for the Hindi text ÷ tokens for the same English text · 997 translated sentences", x0, 230, { px: 32, color: C.dim });
  keys.forEach((k, i) => { const cur = i === keys.length - 1, g = cur ? ease(prog(t, d * 0.15, d * 0.15 + 1.2)) : 1, a = cur ? fadeIn(t, d * 0.1, 0.5) : 1, bh = (H[k] / max) * 480 * g, x = x0 + i * cw; ctx.globalAlpha = a;
    rect(x + 110, base - bh, 300, bh, i === 2 ? C.good : i === 1 ? C.warn : C.bad, 10);
    text(H[k].toFixed(1) + "×", x + 260, base - bh - 26, { px: 96, weight: 700, mono: true, align: "center", color: i === 2 ? C.good : i === 1 ? C.warn : C.bad, glow: cur ? 20 : 0 });
    text(ENCNAME[k][1], x + 260, base + 64, { px: 52, weight: 700, align: "center" }); text(ENCNAME[k][0], x + 260, base + 112, { px: 28, align: "center", color: C.dim }); });
  ctx.fillStyle = C.line; ctx.fillRect(x0, base, 3 * cw, 3); ctx.globalAlpha = 1;
  const y1 = base - (1 / max) * 480; ctx.save(); ctx.setLineDash([10, 10]); ctx.strokeStyle = C.dim; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x0, y1); ctx.lineTo(x0 + 3 * cw, y1); ctx.stroke(); ctx.restore();
  text("1×", x0 - 14, y1 + 9, { px: 28, mono: true, color: C.dim, align: "right" }); text("= same as English", x0, base + 170, { px: 26, color: C.dim });
};

S.langbars = (t, d, p) => {
  const L = EP.data.langs, x0 = 420, y0 = 240, lh = 50, max = p.max, bw = 1200;
  text("tokens needed, relative to English · same 997 sentences · " + ENCNAME[p.enc][0] + " (" + ENCNAME[p.enc][1] + ")", 150, 200, { px: 30, color: C.dim });
  L.forEach((r, i) => { const v = r[p.enc], g = ease(prog(t, 0.3 + i * 0.07, 1.1 + i * 0.07)), hot = (p.hl || []).includes(r.name), y = y0 + i * lh;
    text(r.name, x0 - 24, y + 34, { px: 32, align: "right", color: hot ? C.text : C.dim, weight: hot ? 700 : 400 });
    rect(x0, y + 6, Math.max(4, (v / max) * bw * g), lh - 14, hot ? C.bad : r.name === "English" ? C.good : "#1f6feb", 6);
    ctx.globalAlpha = g; text(v.toFixed(2) + "×", x0 + (v / max) * bw * g + 16, y + 34, { px: 30, mono: true, color: hot ? C.bad : C.text, weight: hot ? 700 : 400 }); ctx.globalAlpha = 1; });
};

/* ---------- episode 6 scenes: caches as a staircase ---------- */
const RUNCOL = { P_random: C.acc, E_random: C.warn, P_seq: C.good, P_random_huge: "#c297ff", E_seq: C.good, E_random_huge: "#c297ff" };
const RUNNAME = { P_random: "performance core · random order", E_random: "efficient core · random order", P_seq: "performance core · in order", P_random_huge: "performance core · random, huge pages" };
S.staircase = (t, d, p) => {
  const x0 = 230, y0 = 210, w = 1040, h = 640, D = EP.data, lx0 = Math.log(4096), lx1 = Math.log(512 * 1048576), X = (b) => x0 + ((Math.log(b) - lx0) / (lx1 - lx0)) * w;
  const Y = (v) => y0 + h - ((Math.log10(v) - Math.log10(1)) / (Math.log10(200) - Math.log10(1))) * h;
  text(p.head || "time for one memory access, as the data grows · both axes logarithmic", x0, y0 - 36, { px: 30, color: C.dim });
  rect(x0, y0, w, h, "#0a0d12", 6, C.line);
  [1, 2, 5, 10, 20, 50, 100, 200].forEach((v) => { ctx.fillStyle = "#1c2128"; ctx.fillRect(x0, Y(v), w, 1); text(v + " ns", x0 - 16, Y(v) + 9, { px: 24, mono: true, color: C.dim, align: "right" }); });
  [["4 KB", 4096], ["64 KB", 65536], ["1 MB", 1048576], ["16 MB", 16777216], ["256 MB", 268435456]].forEach(([l, b]) => text(l, X(b), y0 + h + 40, { px: 24, mono: true, color: C.dim, align: "center" }));
  text("size of the data being hopped around in", x0 + w / 2, y0 + h + 86, { px: 28, color: C.dim, align: "center" });
  (p.lines || []).forEach(([core, level], i) => { const c = D.caches[core].find((q) => q.level === level), xx = X(c.kb * 1024), a = fadeIn(t, d * (p.lineAt || 0.45) + i * 0.6, 0.5), col = core === "P" ? C.acc : C.warn; ctx.globalAlpha = a;
    ctx.save(); ctx.setLineDash([10, 8]); ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(xx, y0); ctx.lineTo(xx, y0 + h); ctx.stroke(); ctx.restore();
    text("L" + level + (core === "E" ? " (E)" : "") + " · " + (c.kb >= 1024 ? c.kb / 1024 + " MB" : c.kb + " KB"), xx + 8, y0 + h - 16 - (core === "E" ? 40 : 0), { px: 26, color: col, weight: 600 }); ctx.globalAlpha = 1; });
  p.runs.forEach((run, ri) => { const cur = ri === p.runs.length - 1 && !p.static, pts = D.runs[run], g = cur ? ease(prog(t, d * 0.08, d * (p.drawTo || 0.5))) : 1, n = Math.max(1, Math.floor(pts.length * g)), col = RUNCOL[run];
    ctx.strokeStyle = col; ctx.lineWidth = 5; ctx.beginPath(); pts.slice(0, n).forEach(([b, v], i) => i ? ctx.lineTo(X(b), Y(v)) : ctx.moveTo(X(b), Y(v))); ctx.stroke();
    pts.slice(0, n).forEach(([b, v]) => { ctx.beginPath(); ctx.arc(X(b), Y(v), 7, 0, 7); ctx.fillStyle = col; ctx.fill(); });
    ctx.globalAlpha = cur ? fadeIn(t, d * (p.drawTo || 0.5), 0.5) : 1; text(RUNNAME[run], x0 + w + 30, y0 + 60 + ri * 96, { px: 28, color: col, weight: 700 });
    text(pts[pts.length - 1][1].toFixed(pts[pts.length - 1][1] < 10 ? 1 : 0) + " ns at the largest size", x0 + w + 30, y0 + 96 + ri * 96, { px: 24, color: C.dim }); ctx.globalAlpha = 1; });
  if (p.big) { ctx.globalAlpha = fadeIn(t, d * 0.75, 0.6); text(p.big, x0 + 40, y0 + 80, { px: 52, weight: 700, color: C.warn, glow: 18 }); ctx.globalAlpha = 1; }
};

S.ladder = (t, d, p) => {
  const L = EP.data.levels[p.core || "P"], rows = [["first-level cache", "L1"], ["second-level cache", "L2"], ["third-level cache", "L3"], ["main memory", "RAM"]], x0 = 300, y = 280, lh = 150, max = Math.log10(200);
  text(p.head || "one memory access on a performance core of this laptop", x0, y - 50, { px: 32, color: C.dim });
  rows.forEach(([lab, k], i) => { const a = fadeIn(t, d * (0.08 + i * 0.2), 0.5), g = ease(prog(t, d * (0.08 + i * 0.2), d * (0.08 + i * 0.2) + 1)), v = L[k], col = [C.good, C.acc, C.warn, C.bad][i]; ctx.globalAlpha = a;
    text(lab, x0, y + i * lh + 60, { px: 40 }); rect(x0 + 440, y + i * lh + 14, Math.max(6, (Math.log10(v) / max) * 620 * g), 70, col, 8);
    text(v.toFixed(v < 100 ? 1 : 0) + " ns", x0 + 440 + (Math.log10(v) / max) * 620 + 24, y + i * lh + 68, { px: 64, weight: 700, mono: true, color: col, glow: i === 3 ? 18 : 0 }); });
  ctx.globalAlpha = fadeIn(t, d * 0.85, 0.6); text(p.foot || "", W / 2, y + 4 * lh + 60, { px: 44, align: "center", color: C.warn, weight: 600 }); text("bar lengths are logarithmic", x0 + 440, y + 4 * lh - 4, { px: 22, color: C.dim }); ctx.globalAlpha = 1;
};

S.hop = (t, d, p) => {
  const cols = 24, rows = 6, cw = 62, x0 = (W - cols * cw) / 2, y0 = 330, n = cols * rows, step = Math.floor(t / 0.16), r = rnd(977);
  const order = []; for (let i = 0; i < n; i++) order.push(i); if (p.mode === "random") for (let i = n - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  text(p.mode === "random" ? "random order: the next node could be anywhere" : "in order: the next node is always the neighbour", x0, y0 - 60, { px: 36, color: p.mode === "random" ? C.bad : C.good, weight: 600 });
  for (let i = 0; i < n; i++) rect(x0 + (i % cols) * cw + 4, y0 + Math.floor(i / cols) * cw + 4, cw - 8, cw - 8, "#12304f", 6);
  const trail = 14; ctx.lineWidth = 4;
  for (let k = Math.max(0, step - trail); k <= step; k++) { const i = order[k % n], a = 1 - (step - k) / (trail + 1), cx = x0 + (i % cols) * cw + cw / 2, cy = y0 + Math.floor(i / cols) * cw + cw / 2;
    ctx.globalAlpha = a; rect(cx - cw / 2 + 4, cy - cw / 2 + 4, cw - 8, cw - 8, p.mode === "random" ? C.bad : C.good, 6);
    if (k > Math.max(0, step - trail)) { const j = order[(k - 1) % n]; ctx.strokeStyle = C.text; ctx.beginPath(); ctx.moveTo(x0 + (j % cols) * cw + cw / 2, y0 + Math.floor(j / cols) * cw + cw / 2); ctx.lineTo(cx, cy); ctx.stroke(); } }
  ctx.globalAlpha = 1; text("each square: one 64-byte node holding the position of the next", x0, y0 + rows * cw + 60, { px: 30, color: C.dim });
  ctx.globalAlpha = fadeIn(t, d * 0.6, 0.6); text(p.foot || "", W / 2, 940, { px: 46, align: "center", weight: 600 }); ctx.globalAlpha = 1;
};

/* ---------- episode 7 scenes: branches ---------- */
S.levels = (t, d, p) => {
  const L = EP.data.levels[p.core || "P"], ks = ["O0", "O1", "O2", "O3"].slice(0, p.upto || 4), x0 = 260, base = 820, max = p.max || 6.5, hgt = 520, gw = 340;
  text(p.head || "nanoseconds per number · " + ((p.core || "P") === "P" ? "performance core" : "efficient core") + " · gcc 15.2", x0, 230, { px: 32, color: C.dim });
  ks.forEach((k, i) => { const cur = i === ks.length - 1 && !p.static, a = cur ? fadeIn(t, d * (p.at || 0.25), 0.5) : 1, g = cur ? ease(prog(t, d * (p.at || 0.25), d * (p.at || 0.25) + 1.2)) : 1, x = x0 + i * gw; ctx.globalAlpha = a;
    [["random", C.bad, 0], ["sorted", C.good, 130]].forEach(([m, col, dx]) => { const v = L[k][m], bh = Math.max(4, (v / max) * hgt * g); rect(x + dx, base - bh, 110, bh, col, 8);
      text(v.toFixed(v < 1 ? 3 : 1), x + dx + 55, base - bh - 16, { px: v < 1 ? 30 : 44, weight: 700, mono: true, align: "center", color: col }); });
    text(k === "O0" ? "optimiser off" : "level " + k[1], x + 120, base + 56, { px: 34, align: "center", weight: 600 }); text("-" + k, x + 120, base + 96, { px: 26, mono: true, align: "center", color: C.dim }); });
  ctx.globalAlpha = 1; ctx.fillStyle = C.line; ctx.fillRect(x0 - 20, base, 4 * gw, 3);
  rect(x0 + 4 * gw + 10, 300, 36, 36, C.bad, 6); text("random order", x0 + 4 * gw + 60, 330, { px: 30 }); rect(x0 + 4 * gw + 10, 360, 36, 36, C.good, 6); text("sorted", x0 + 4 * gw + 60, 390, { px: 30 });
  if (p.foot) { ctx.globalAlpha = fadeIn(t, d * 0.7, 0.6); text(p.foot, W / 2, 990, { px: 42, align: "center", color: C.warn, weight: 600 }); ctx.globalAlpha = 1; }
};

S.xy = (t, d, p) => {
  const x0 = 260, y0 = 220, w = 1100, h = 600, K = p.kind, D = EP.data[K], max = 7, per = K === "period";
  const X = per ? (v) => x0 + ((Math.log2(v) - 1) / 14) * w : (v) => x0 + v * w, Y = (v) => y0 + h - (v / max) * h;
  text(p.head, x0, y0 - 36, { px: 30, color: C.dim }); rect(x0, y0, w, h, "#0a0d12", 6, C.line);
  for (let v = 0; v <= max; v++) { ctx.fillStyle = "#1c2128"; ctx.fillRect(x0, Y(v), w, 1); text(v + " ns", x0 - 16, Y(v) + 9, { px: 24, mono: true, color: C.dim, align: "right" }); }
  (per ? [2, 8, 32, 128, 512, 2048, 8192, 32768] : [0, 0.25, 0.5, 0.75, 1]).forEach((v) => text(per ? fmt(v) : v * 100 + "%", X(v), y0 + h + 40, { px: 24, mono: true, color: C.dim, align: "center" }));
  text(p.xlabel, x0 + w / 2, y0 + h + 88, { px: 28, color: C.dim, align: "center" });
  p.cores.forEach((c, ci) => { const cur = ci === p.cores.length - 1, pts = D[c], g = cur ? ease(prog(t, d * 0.1, d * 0.55)) : 1, n = Math.max(1, Math.ceil(pts.length * g)), col = c === "P" ? C.acc : C.warn;
    ctx.strokeStyle = col; ctx.lineWidth = 5; ctx.beginPath(); pts.slice(0, n).forEach(([a, v], i) => i ? ctx.lineTo(X(a), Y(v)) : ctx.moveTo(X(a), Y(v))); ctx.stroke();
    pts.slice(0, n).forEach(([a, v]) => { ctx.beginPath(); ctx.arc(X(a), Y(v), 8, 0, 7); ctx.fillStyle = col; ctx.fill(); });
    text(c === "P" ? "performance core" : "efficient core", x0 + w + 30, y0 + 60 + ci * 50, { px: 30, color: col, weight: 700 }); });
  if (p.big) { ctx.globalAlpha = fadeIn(t, d * 0.7, 0.6); text(p.big, x0 + 40, y0 + 64, { px: 38, weight: 700, color: C.warn, glow: 14 }); ctx.globalAlpha = 1; }
  text("one run per point, best of 3 timings · optimiser off", x0, y0 + h + 130, { px: 24, color: C.dim });
};

/* A toy predictor ("guess the same as last time") run over sorted or random data. Illustration only. */
S.predict = (t, d, p) => {
  const n = 28, cw = 58, x0 = (W - n * cw) / 2, y = 330, r = rnd(4242), vals = [];
  for (let i = 0; i < n; i++) vals.push(Math.floor(r() * 256)); if (p.mode === "sorted") vals.sort((a, b) => a - b);
  const shown = Math.min(n, Math.floor(n * prog(t, d * 0.1, d * 0.8)) + 1); let right = 0, last = false;
  text(p.mode === "sorted" ? "sorted numbers" : "the same numbers in random order", x0, y - 70, { px: 36, color: C.dim });
  text("≥ 128 ?", x0 - 20, y + 48, { px: 26, align: "right", color: C.dim }); text("guess", x0 - 20, y + 138, { px: 26, align: "right", color: C.dim });
  for (let i = 0; i < n; i++) { const take = vals[i] >= 128, ok = take === last; if (i < shown) { if (ok) right++;
      rect(x0 + i * cw + 3, y, cw - 6, 70, take ? "#12261e" : "#161b22", 6, take ? C.good : C.line, 2); text(take ? "add" : "skip", x0 + i * cw + cw / 2, y + 44, { px: 20, align: "center", color: take ? C.good : C.dim });
      rect(x0 + i * cw + 3, y + 90, cw - 6, 70, ok ? "#10202d" : "#2d1517", 6, ok ? C.acc : C.bad, 2); text(ok ? "✓" : "✗", x0 + i * cw + cw / 2, y + 138, { px: 34, align: "center", color: ok ? C.acc : C.bad, weight: 700 }); }
    last = take; }
  text(right + " of " + shown + " guesses right", W / 2, 700, { px: 84, weight: 700, mono: true, align: "center", color: p.mode === "sorted" ? C.good : C.bad, glow: 18 });
  text("a toy predictor for illustration: “guess the same as last time” · real predictors are far cleverer", W / 2, 800, { px: 28, align: "center", color: C.dim });
};

/* ---------- episode 8 scenes: the page cache ---------- */
S.membar = (t, d, p) => {
  const St = EP.data.steps, x0 = 430, bw = 1180, y0 = 300, lh = p.rows.length > 3 ? 150 : 190, tot = St[0].meminfo.MemTotal, gib = (m) => (m / 1024).toFixed(1);
  text(p.head || "this laptop's 15.3 GiB of memory, as /proc/meminfo reports it", 150, 220, { px: 32, color: C.dim });
  p.rows.forEach(([idx, lab], i) => { const m = St[idx].meminfo, cur = i === p.rows.length - 1, a = cur ? fadeIn(t, d * (p.at || 0.3), 0.6) : 1, y = y0 + i * lh, used = tot - m.MemFree - m.Cached; ctx.globalAlpha = a;
    text(lab, x0 - 24, y + 52, { px: 30, align: "right", color: cur ? C.text : C.dim, weight: cur ? 600 : 400 });
    let x = x0; [[used, "#3d444d", "programs"], [m.Cached, C.warn, "cache"], [m.MemFree, C.good, "free"]].forEach(([v, col, nm]) => { const w = (v / tot) * bw; rect(x, y, Math.max(2, w - 3), 80, col, 6);
      if (w > 110) text(gib(v), x + w / 2, y + 52, { px: 34, mono: true, weight: 700, align: "center", color: nm === "programs" ? C.text : "#0d1117" }); x += w; });
    const aw = (m.MemAvailable / tot) * bw; ctx.fillStyle = C.acc; ctx.fillRect(x0 + bw - aw, y + 92, aw - 3, 8);
    text("available: " + gib(m.MemAvailable) + " GiB", x0 + bw - aw, y + 132, { px: 26, color: C.acc }); });
  ctx.globalAlpha = 1; let lx = x0; [["#3d444d", "programs and kernel"], [C.warn, "file cache"], [C.good, "free"], [C.acc, "available (the kernel's estimate)"]].forEach(([col, nm]) => { rect(lx, y0 - 50, 28, 28, col, 5); text(nm, lx + 40, y0 - 27, { px: 26 }); lx += 70 + measure(nm, 26); });
  if (p.foot) { ctx.globalAlpha = fadeIn(t, d * 0.72, 0.6); text(p.foot, W / 2, y0 + p.rows.length * lh + 50, { px: 42, align: "center", color: C.warn, weight: 600 }); ctx.globalAlpha = 1; }
};

S.readbars = (t, d, p) => {
  const St = EP.data.steps, x0 = 520, y0 = 300, lh = 150, bw = 900, max = 3.6;
  text(p.head || "reading the same 4 GiB file from start to end", 200, y0 - 60, { px: 32, color: C.dim });
  p.rows.forEach(([idx, lab], i) => { const r = St[idx].read, cur = i === p.rows.length - 1, a = cur ? fadeIn(t, d * (p.at || 0.3), 0.5) : 1, g = cur ? ease(prog(t, d * (p.at || 0.3), d * (p.at || 0.3) + 1.2)) : 1, y = y0 + i * lh, col = r.seconds > 2 ? C.bad : r.seconds > 0.6 ? C.warn : C.good; ctx.globalAlpha = a;
    text(lab, x0 - 24, y + 58, { px: 34, align: "right" }); rect(x0, y + 10, Math.max(6, (r.seconds / max) * bw * g), 76, col, 8);
    text(r.seconds.toFixed(2) + " s", x0 + (r.seconds / max) * bw + 24, y + 66, { px: 56, weight: 700, mono: true, color: col });
    text((r.mb_per_s / 1000).toFixed(1) + " GB/s", x0 + (r.seconds / max) * bw + 250, y + 66, { px: 34, mono: true, color: C.dim }); });
  if (p.foot) { ctx.globalAlpha = fadeIn(t, d * 0.75, 0.6); text(p.foot, W / 2, y0 + p.rows.length * lh + 60, { px: 42, align: "center", color: C.warn, weight: 600 }); } ctx.globalAlpha = 1;
};

S.dirtychart = (t, d, p) => {
  const D = EP.data.dirty, x0 = 260, y0 = 230, w = 1300, h = 560, X = (s) => x0 + (s / 40) * w, Y = (v) => y0 + h - (v / 1600) * h, ws = D.write_started_at;
  text("data written by the program but not yet on the drive (“dirty” memory), second by second", x0, y0 - 36, { px: 30, color: C.dim }); rect(x0, y0, w, h, "#0a0d12", 6, C.line);
  [0, 400, 800, 1200, 1600].forEach((v) => { ctx.fillStyle = "#1c2128"; ctx.fillRect(x0, Y(v), w, 1); text(v + " MiB", x0 - 16, Y(v) + 9, { px: 24, mono: true, color: C.dim, align: "right" }); });
  [0, 10, 20, 30, 40].forEach((v) => text(v + " s", X(v), y0 + h + 40, { px: 24, mono: true, color: C.dim, align: "center" }));
  const pts = D.samples.map(([s, v]) => [s - ws, v]).filter(([s]) => s >= -0.5), g = ease(prog(t, d * 0.1, d * 0.6)), n = Math.max(1, Math.floor(pts.length * g));
  ctx.strokeStyle = C.bad; ctx.lineWidth = 6; ctx.beginPath(); pts.slice(0, n).forEach(([s, v], i) => i ? ctx.lineTo(X(Math.max(0, s)), Y(v)) : ctx.moveTo(X(Math.max(0, s)), Y(v))); ctx.stroke();
  ctx.globalAlpha = fadeIn(t, d * 0.2, 0.5); arrow(X(D.write_returned_after_s), y0 + 60, X(D.write_returned_after_s), Y(1300), C.good, 3); text("program told “written” after " + D.write_returned_after_s.toFixed(1) + " s", X(D.write_returned_after_s) + 20, y0 + 56, { px: 32, color: C.good, weight: 600 });
  ctx.globalAlpha = fadeIn(t, d * 0.65, 0.5); arrow(X(D.dirty_cleared_after_s), y0 + 330, X(D.dirty_cleared_after_s), Y(60), C.acc, 3); text("all of it on the drive after " + D.dirty_cleared_after_s.toFixed(0) + " s", X(D.dirty_cleared_after_s) - 20, y0 + 340, { px: 32, color: C.acc, weight: 600, align: "right" });
  ctx.globalAlpha = 1; if (p.foot) { ctx.globalAlpha = fadeIn(t, d * 0.8, 0.6); text(p.foot, W / 2, y0 + h + 120, { px: 42, align: "center", color: C.warn, weight: 600 }); ctx.globalAlpha = 1; }
};

/* ---------- episode 9 scenes: what "saved" means ---------- */
S.layers = (t, d, p) => {
  const L = [["your program's buffer", "inside the process", C.warn], ["the kernel's page cache", "in memory, outside the process", C.acc], ["the drive", "survives a power cut", C.good]], bw = 460, gap = 110, x0 = (W - 3 * bw - 2 * gap) / 2, y = 380, h = 260;
  text(p.head || "three places your bytes can be", x0, 250, { px: 34, color: C.dim });
  L.forEach(([nm, sub, col], i) => { const x = x0 + i * (bw + gap), dead = (p.dead || []).includes(i), on = i === p.at; ctx.globalAlpha = dead ? 0.35 : 1;
    rect(x, y, bw, h, on ? "#10202d" : C.panel, 18, dead ? C.bad : col, on ? 6 : 3); text(nm, x + bw / 2, y + 70, { px: 36, weight: 700, align: "center", color: col }); text(sub, x + bw / 2, y + 116, { px: 26, align: "center", color: C.dim });
    if (dead) { ctx.strokeStyle = C.bad; ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(x + 30, y + 30); ctx.lineTo(x + bw - 30, y + h - 30); ctx.moveTo(x + bw - 30, y + 30); ctx.lineTo(x + 30, y + h - 30); ctx.stroke(); }
    ctx.globalAlpha = 1; if (i < 2) { arrow(x + bw + 14, y + h / 2, x + bw + gap - 14, y + h / 2, C.dim, 4); text(i === 0 ? "write()" : "fsync()", x + bw + gap / 2, y + h / 2 - 22, { px: 21, mono: true, align: "center", color: C.text }); } });
  if (p.at !== undefined) { const from = p.from === undefined ? p.at : p.from, g = ease(prog(t, d * 0.2, d * 0.5)), cx = lerp(x0 + from * (bw + gap) + bw / 2, x0 + p.at * (bw + gap) + bw / 2, g);
    rect(cx - 90, y + 150, 180, 70, C.text, 10); text("record", cx, y + 197, { px: 32, mono: true, weight: 700, align: "center", color: "#0d1117" }); }
  ctx.globalAlpha = fadeIn(t, d * 0.55, 0.6); text(p.foot || "", W / 2, y + h + 110, { px: 46, align: "center", weight: 600, color: p.footColor === "bad" ? C.bad : C.text }); ctx.globalAlpha = 1;
};

S.killtable = (t, d, p) => {
  const K = EP.data.kill, rows = [["stdio", "buffered: fwrite(), never flushed"], ["write", "write() for every record"], ["fsync", "write() + fsync() for every record"]].slice(0, p.rows), x = 130, w = W - 260, y = 330, lh = 170;
  text("a program appends 64-byte records, and is killed after half a second · 20 kills each", x, 230, { px: 30, color: C.dim });
  ["", "records in 0.5 s", "kills that lost records", "most lost"].forEach((hh, i) => text(hh, x + [40, 980, 1330, 1600][i], y - 30, { px: 26, color: C.dim, align: i ? "right" : "left" }));
  rows.forEach(([m, lab], i) => { const r = K[m], cur = i === rows.length - 1, a = cur ? fadeIn(t, d * 0.15, 0.6) : 1, yy = y + i * lh, bad = r.runs_that_lost_records > 0; ctx.globalAlpha = a;
    rect(x, yy, w, lh - 28, C.panel, 14, cur ? (bad ? C.bad : C.good) : C.line, cur ? 4 : 2); text(lab, x + 40, yy + 88, { px: 36, weight: 600 });
    text(fmt(r.median_records), x + 980, yy + 92, { px: 50, mono: true, align: "right", weight: 700 });
    ctx.globalAlpha = a * (cur ? fadeIn(t, d * 0.45, 0.5) : 1); text(r.runs_that_lost_records + " of 20", x + 1330, yy + 92, { px: 50, mono: true, align: "right", weight: 700, color: bad ? C.bad : C.good });
    text(String(Math.max(0, r.lost_max)), x + 1600, yy + 92, { px: 50, mono: true, align: "right", weight: 700, color: bad ? C.bad : C.good }); });
  ctx.globalAlpha = fadeIn(t, d * 0.75, 0.6); text(p.foot || "", W / 2, y + rows.length * lh + 60, { px: 42, align: "center", color: C.warn, weight: 600 }); ctx.globalAlpha = 1;
};

S.latbars = (t, d, p) => {
  const L = EP.data.latency, rows = [["write", "write() only", C.good], ["fsync", "write() + fsync()", C.bad], ["fdatasync", "write() + fdatasync()", C.warn]].slice(0, p.rows || 3), x0 = 620, y0 = 300, lh = 160, bw = 760, max = Math.log10(1000);
  text("time to append 4 KB to a file · median of 2,000 · ext4 on an NVMe drive", 200, y0 - 60, { px: 30, color: C.dim });
  rows.forEach(([m, lab, col], i) => { const v = L[m].median_us, cur = i === rows.length - 1, a = cur ? fadeIn(t, d * 0.2, 0.5) : 1, g = cur ? ease(prog(t, d * 0.2, d * 0.2 + 1.2)) : 1, y = y0 + i * lh, len = Math.max(8, (Math.log10(Math.max(v, 1)) / max) * bw * g); ctx.globalAlpha = a;
    text(lab, x0 - 24, y + 60, { px: 34, align: "right", mono: true }); rect(x0, y + 10, len, 80, col, 8); text(v < 10 ? v.toFixed(1) + " µs" : Math.round(v) + " µs", x0 + len + 24, y + 70, { px: 64, weight: 700, mono: true, color: col }); });
  ctx.globalAlpha = fadeIn(t, d * 0.7, 0.6); text(p.foot || "", W / 2, y0 + rows.length * lh + 70, { px: 44, align: "center", color: C.warn, weight: 600 }); text("bar lengths are logarithmic", x0, y0 + rows.length * lh + 4, { px: 22, color: C.dim }); ctx.globalAlpha = 1;
};

S.groupbars = (t, d, p) => {
  const G = EP.data.group, ks = ["1", "10", "100", "1000"], x0 = 620, y0 = 300, lh = 140, bw = 760, max = 240000;
  text("4 KB appends per second, with one fsync() for every K writes", 200, y0 - 60, { px: 30, color: C.dim });
  ks.forEach((k, i) => { const v = G[k].writes_per_s, a = fadeIn(t, d * (0.1 + i * 0.17), 0.5), g = ease(prog(t, d * (0.1 + i * 0.17), d * (0.1 + i * 0.17) + 1.2)), y = y0 + i * lh, len = Math.max(8, (v / max) * bw * g); ctx.globalAlpha = a;
    text("fsync every " + fmt(+k) + (k === "1" ? " write" : " writes"), x0 - 24, y + 56, { px: 32, align: "right" }); rect(x0, y + 10, len, 70, i === 0 ? C.bad : C.acc, 8);
    text(fmt(v) + " / s", x0 + len + 24, y + 62, { px: 52, weight: 700, mono: true, color: i === 0 ? C.bad : C.acc }); });
  ctx.globalAlpha = fadeIn(t, d * 0.8, 0.6); text(p.foot || "", W / 2, y0 + 4 * lh + 60, { px: 42, align: "center", color: C.warn, weight: 600 }); ctx.globalAlpha = 1;
};

/* ---------- episode 10 scenes: two clocks ---------- */
S.logsteps = (t, d, p) => {
  const L = EP.data.log, x = 130, w = W - 260, y = 270, lh = 92;
  panel(x, y, w, L.length * lh + 120, "journalctl -u chrony · this laptop · 16 November 2026 (IST)");
  L.forEach(([ts, msg], i) => { const a = fadeIn(t, 0.3 + i * d * 0.12, 0.4), back = i >= 2, hot = back && t > d * 0.55; ctx.globalAlpha = a;
    if (hot) rect(x + 16, y + 82 + i * lh, w - 32, lh - 10, i === 2 ? "#2d1517" : "#1c1416", 6);
    text(ts, x + 50, y + 140 + i * lh, { px: 40, mono: true, weight: 700, color: hot ? C.bad : C.acc });
    text(msg, x + 430, y + 140 + i * lh, { px: 34, mono: true, color: hot ? C.text : C.dim }); });
  ctx.globalAlpha = fadeIn(t, d * 0.6, 0.5); const ax = x + 34, y1 = y + 128 + lh, y2 = y + 128 + 2 * lh;
  arrow(ax, y1, ax, y2 - 4, C.bad, 5); text("the next line is 1.49 s earlier", x + w - 40, y + L.length * lh + 200, { px: 46, weight: 700, align: "right", color: C.bad, glow: 16 }); ctx.globalAlpha = 1;
};

S.stepchart = (t, d, p) => {
  const St = EP.data.steps, x0 = 230, x1 = W - 170, y0 = 330, h = 520, day = (s) => Date.parse(s.slice(0, 10) + "T00:00:00Z"), D0 = day("2026-10-10"), D1 = day("2026-11-17"),
    X = (s) => x0 + ((day(s) - D0) / (D1 - D0)) * (x1 - x0), Y = (v) => y0 + (v / 11) * h, big = St.reduce((a, b) => (Math.abs(b.step_s) > Math.abs(a.step_s) ? b : a));
  text("each time chrony stepped this laptop's clock, from its own log · seconds", x0, 250, { px: 30, color: C.dim });
  ctx.fillStyle = C.line; ctx.fillRect(x0, y0, x1 - x0, 3);
  [0, 2, 4, 6, 8, 10].forEach((v) => { ctx.fillStyle = "#1c2128"; ctx.fillRect(x0, Y(v), x1 - x0, 1); text(v ? "−" + v + " s" : "0", x0 - 16, Y(v) + 9, { px: 24, mono: true, color: C.dim, align: "right" }); });
  [["2026-10-10", "10 Oct"], ["2026-10-20", "20 Oct"], ["2026-11-01", "1 Nov"], ["2026-11-10", "10 Nov"], ["2026-11-16", "16 Nov"]].forEach(([s, l]) => text(l, X(s), y0 - 18, { px: 24, mono: true, color: C.dim, align: "center" }));
  St.forEach((s, i) => { const g = ease(prog(t, d * 0.08 + i * d * 0.02, d * 0.08 + i * d * 0.02 + 0.5)), hv = p.hl && s === big, last = i === St.length - 1;
    rect(X(s.logged_at) - 9, y0 + 3, 18, Math.max(2, (Y(-s.step_s) - y0) * g), hv ? C.bad : last ? C.warn : C.acc, 3); });
  if (p.hl) { ctx.globalAlpha = fadeIn(t, d * 0.5, 0.5); text("−" + Math.abs(big.step_s).toFixed(2) + " s · 30 Oct", X(big.logged_at) + 22, Y(-big.step_s) + 10, { px: 40, weight: 700, color: C.bad }); }
  ctx.globalAlpha = fadeIn(t, d * 0.35, 0.5); text("16 Nov: −1.49 s", X(St[St.length - 1].logged_at), Y(4.2), { px: 30, color: C.warn, align: "center", weight: 600 });
  ctx.globalAlpha = fadeIn(t, d * 0.7, 0.6); text(p.foot || "", W / 2, y0 + h + 140, { px: 42, align: "center", color: C.warn, weight: 600 }); ctx.globalAlpha = 1;
};

S.twoclocks = (t, d, p) => {
  const bw = 760, x0 = (W - 2 * bw - 80) / 2, y = 300, h = 430, sec = 5521.3 + t, wall = 9 * 3600 + 18 * 60 + 30 + t;
  [["wall clock", "CLOCK_REALTIME", "what time is it?", C.acc], ["monotonic clock", "CLOCK_MONOTONIC", "how much time has passed?", C.good]].forEach(([nm, id, q, col], i) => {
    const x = x0 + i * (bw + 80), a = fadeIn(t, i === 0 ? 0.3 : d * 0.5, 0.6); ctx.globalAlpha = a;
    rect(x, y, bw, h, C.panel, 18, col, 4); text(nm, x + bw / 2, y + 70, { px: 44, weight: 700, align: "center", color: col }); text(id, x + bw / 2, y + 118, { px: 28, mono: true, align: "center", color: C.dim });
    const hh = Math.floor(wall / 3600) % 24, mm = Math.floor(wall / 60) % 60, ss = wall % 60;
    const big = i === 0 ? `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${ss.toFixed(1).padStart(4, "0")}` : sec.toFixed(1) + " s";
    text(big, x + bw / 2, y + 260, { px: 96, mono: true, weight: 700, align: "center", glow: 14 });
    text(i === 0 ? "seconds since 1 January 1970, shown as a date" : "seconds since this laptop booted", x + bw / 2, y + 330, { px: 28, align: "center", color: C.dim });
    text(q, x + bw / 2, y + h + 80, { px: 46, weight: 600, align: "center", color: col }); });
  ctx.globalAlpha = 1;
};

S.driftchart = (t, d, p) => {
  const R = EP.data.drift, S_ = R.series, hrs = R.hours, x0 = 300, y0 = 260, w = 1240, h = 520, mx = Math.max(1, Math.ceil(Math.max(...S_.map((s) => Math.abs(s.mono_minus_raw_ms))))),
    X = (s) => x0 + (s / (hrs * 3600)) * w, Y = (v) => y0 + h - (v / mx) * h;
  text("corrected clock (CLOCK_MONOTONIC) minus raw clock (CLOCK_MONOTONIC_RAW), milliseconds", x0, y0 - 36, { px: 28, color: C.dim }); rect(x0, y0, w, h, "#0a0d12", 6, C.line);
  for (let v = 0; v <= mx; v += Math.max(1, Math.round(mx / 5))) { ctx.fillStyle = "#1c2128"; ctx.fillRect(x0, Y(v), w, 1); text(v + " ms", x0 - 16, Y(v) + 9, { px: 24, mono: true, color: C.dim, align: "right" }); }
  for (let hh = 0; hh <= hrs + 1e-9; hh += hrs > 3 ? 1 : 0.5) text(hh + " h", X(hh * 3600), y0 + h + 40, { px: 24, mono: true, color: C.dim, align: "center" });
  const g = ease(prog(t, d * 0.1, d * 0.65)), n = Math.max(2, Math.floor(S_.length * g));
  ctx.strokeStyle = C.acc; ctx.lineWidth = 6; ctx.beginPath(); S_.slice(0, n).forEach((s, i) => i ? ctx.lineTo(X(s.t_s), Y(s.mono_minus_raw_ms)) : ctx.moveTo(X(s.t_s), Y(s.mono_minus_raw_ms))); ctx.stroke();
  const e = S_[n - 1]; ctx.beginPath(); ctx.arc(X(e.t_s), Y(e.mono_minus_raw_ms), 10, 0, 7); ctx.fillStyle = C.acc; ctx.fill();
  ctx.globalAlpha = fadeIn(t, d * 0.68, 0.5);
  text(Math.abs(R.mono_minus_raw_change_ms).toFixed(1) + " ms in " + hrs.toFixed(1) + " hours", x0 + 40, y0 + 70, { px: 52, weight: 700, color: C.acc, glow: 14 });
  text("about " + Math.abs(R.mono_minus_raw_slope_ppm).toFixed(2) + " parts per million: the time service's correction, measured", x0 + 40, y0 + 124, { px: 30, color: C.text });
  ctx.globalAlpha = 1; text("one sample per second · this laptop · " + R.date, x0, y0 + h + 90, { px: 24, color: C.dim });
};

S.durbars = (t, d, p) => {
  const R = EP.data.duration, rows = [["normal", "normal", "no step"], ["step_back_1.494193", "back", "clock stepped back 1.494 s"], ["step_forward_10", "fwd", "clock stepped forward 10 s"]].slice(0, p.rows),
    x0 = 860, zero = x0 + 170, sc = 66, y0 = 300, lh = 190;
  text("one 100 ms sleep, timed with each clock · median of 20 runs", 150, 240, { px: 30, color: C.dim });
  ctx.fillStyle = C.line; ctx.fillRect(zero, y0 - 20, 2, rows.length * lh);
  rows.forEach(([k, , lab], i) => { const r = R[k], cur = i === rows.length - 1, a = cur ? fadeIn(t, d * 0.15, 0.5) : 1, g = cur ? ease(prog(t, d * 0.25, d * 0.25 + 1.0)) : 1, y = y0 + i * lh; ctx.globalAlpha = a;
    text(lab, 150, y + 66, { px: 36, weight: 600 });
    [["wall", r.wall_median_s, Math.abs(r.wall_median_s - 0.1) > 0.05 ? C.bad : C.acc], ["monotonic", r.mono_median_s, C.good]].forEach(([nm, v, col], j) => { const yy = y + j * 70, len = v * sc * g;
      text(nm, x0 - 20, yy + 40, { px: 26, align: "right", color: C.dim, mono: true }); rect(Math.min(zero, zero + len), yy + 8, Math.max(4, Math.abs(len)), 44, col, 6);
      text((v >= 0 ? "" : "−") + Math.abs(v).toFixed(3) + " s", Math.max(zero, zero + len) + 18, yy + 44, { px: 40, mono: true, weight: 700, color: col }); }); });
  ctx.globalAlpha = fadeIn(t, d * 0.6, 0.6); text(p.foot || "", W / 2, y0 + rows.length * lh + 50, { px: 42, align: "center", weight: 600, color: p.footColor === "bad" ? C.bad : C.warn });
  if (p.rows > 1) text("the step is replayed inside this one program by a small library (shim.c); the real clock is not touched", W / 2, H - 60, { px: 24, align: "center", color: C.dim });
  ctx.globalAlpha = 1;
};

S.leaptick = (t, d, p) => {
  const L = EP.data.leap_tick, x = 380, w = W - 760, y = 210, lh = 46, shown = Math.min(L.length, Math.floor(prog(t, d * 0.25, d * 0.85) * L.length) + 1);
  panel(x, y, w, L.length * lh + 120, "the night of 31 December 2016, replayed · wall clock in UTC");
  text("wall clock", x + 60, y + 100, { px: 26, color: C.dim }); text("monotonic", x + w - 60, y + 100, { px: 26, color: C.dim, align: "right" });
  L.slice(0, shown).forEach(([dt, tm, mono], i) => { const rep = i >= 8 && i < 12, yy = y + 150 + i * lh;
    if (rep) rect(x + 16, yy - 34, w - 32, lh - 4, "#2d1517", 6);
    text(dt + "  " + tm, x + 60, yy, { px: 32, mono: true, color: rep ? C.bad : C.text, weight: rep ? 700 : 400 });
    text((+mono - +L[0][2]).toFixed(2) + " s", x + w - 60, yy, { px: 32, mono: true, color: C.good, align: "right" });
    if (i === 8) text("← 23:59:59 again", x + w + 24, yy, { px: 32, color: C.bad, weight: 700 }); });
  ctx.globalAlpha = 1;
};

S.cfcase = (t, d, p) => {
  const B = [["rtt := time.Now().Sub(start)", "measure how fast another server answered", C.text], ["the leap second: rtt < 0", "the wall clock went back during the measurement", C.warn], ["the smoothed average < 0", "several negative measurements, averaged", C.warn], ["rand.Int63n(negative)", "a random-number function that panics on a negative number", C.bad]],
    x = 300, w = W - 600, y0 = 250, lh = 150;
  text("Cloudflare's DNS software, 1 January 2017 · from Cloudflare's own report", x, 210, { px: 28, color: C.dim });
  B.forEach(([code, sub, col], i) => { const a = fadeIn(t, d * (0.08 + i * 0.16), 0.5), y = y0 + i * lh; ctx.globalAlpha = a;
    rect(x, y, w, lh - 40, C.panel, 12, col, 3); text(code, x + 40, y + 52, { px: 36, mono: true, weight: 700, color: col }); text(sub, x + 40, y + 92, { px: 26, color: C.dim });
    if (i < 3) arrow(x + w / 2, y + lh - 36, x + w / 2, y + lh - 4, C.dim, 3); });
  ctx.globalAlpha = fadeIn(t, d * 0.75, 0.6); text("≈0.2% of DNS queries at the peak · fixed everywhere by 06:45 UTC", W / 2, y0 + 4 * lh + 40, { px: 38, align: "center", weight: 600, color: C.warn }); ctx.globalAlpha = 1;
};

S.clockchoice = (t, d, p) => {
  const R = [["a timestamp for people, logs, other machines", "wall clock, in UTC", "CLOCK_REALTIME", C.acc], ["a duration, timeout, retry delay, rate", "monotonic clock", "CLOCK_MONOTONIC", C.good], ["a duration that includes sleep (suspend)", "boot-time clock", "CLOCK_BOOTTIME (Linux)", C.warn]],
    x = 150, w = W - 300, y0 = 300, lh = 180;
  text("you need", x + 30, y0 - 40, { px: 28, color: C.dim }); text("use", x + 1050, y0 - 40, { px: 28, color: C.dim });
  R.forEach(([need, use, id, col], i) => { const a = fadeIn(t, d * (0.05 + i * 0.27), 0.5), y = y0 + i * lh; ctx.globalAlpha = a;
    rect(x, y, w, lh - 30, C.panel, 14, col, 3); text(need, x + 30, y + 88, { px: 38 }); text(use, x + 1050, y + 70, { px: 42, weight: 700, color: col }); text(id, x + 1050, y + 112, { px: 26, mono: true, color: C.dim }); });
  ctx.globalAlpha = 1;
};

S.plaincode = (t, d, p) => {
  const x = 230, y = 230, w = W - 460, lh = 70, h = p.lines.length * lh + 130;
  panel(x, y, w, h, p.label);
  p.lines.forEach((l, i) => { ctx.globalAlpha = fadeIn(t, 0.2 + i * d * 0.12, 0.4); const sp = l.indexOf("  ");
    text(l.slice(0, sp), x + 56, y + 130 + i * lh, { px: 36, mono: true, color: C.dim }); text(l.slice(sp).trim(), x + 380, y + 130 + i * lh, { px: 36, mono: true, color: C.good, weight: 600 }); });
  ctx.globalAlpha = 1;
};

S.costbars = (t, d, p) => {
  const Cn = EP.data.cost_ns, rows = [["realtime", "wall clock", C.acc], ["monotonic", "monotonic", C.good], ["monotonic_raw", "raw", C.dim], ["boottime", "boot-time", C.warn]], x0 = 620, y0 = 300, lh = 130, bw = 800, max = 20;
  text("time to read each clock once · best of 5 runs of 10 million reads", 200, y0 - 60, { px: 30, color: C.dim });
  rows.forEach(([k, lab, col], i) => { const v = Cn[k], g = ease(prog(t, d * (0.1 + i * 0.12), d * (0.1 + i * 0.12) + 0.8)), y = y0 + i * lh; ctx.globalAlpha = fadeIn(t, d * (0.1 + i * 0.12), 0.4);
    text(lab, x0 - 24, y + 56, { px: 34, align: "right" }); rect(x0, y + 10, (v / max) * bw * g, 66, col, 8); text(v.toFixed(1) + " ns", x0 + (v / max) * bw + 24, y + 62, { px: 50, mono: true, weight: 700, color: col }); });
  ctx.globalAlpha = fadeIn(t, d * 0.7, 0.6); text(p.foot || "", W / 2, y0 + 4 * lh + 60, { px: 42, align: "center", color: C.warn, weight: 600 }); ctx.globalAlpha = 1;
};

/* ---------- episode 11 scenes: queues ---------- */
/* A single queue, simulated in the frame itself: arrivals at random (seeded, so every frame agrees), one server, first come
   first served. One service-time unit = p.unit seconds of video. */
function qsim(u, seed, horizon) {
  const r = rnd(seed), ev = []; let t = 0.3, free = 0;
  while (t < horizon) { t += -Math.log(1 - r()) / u; const s = -Math.log(1 - r()); const st = Math.max(t, free); free = st + s; ev.push({ a: t, s: st, e: free }); }
  return ev;
}
S.queueanim = (t, d, p) => {
  const unit = p.unit || 0.55, T = t / unit, ev = qsim(p.u, p.seed || 11, d / unit + 5), sx = 1260, sy = 520, qx = sx - 90, gap = 46;
  text(p.head || `requests arrive at random · one server · ${Math.round(p.u * 100)}% busy on average`, 150, 230, { px: 32, color: C.dim });
  rect(sx, sy - 110, 240, 220, C.panel, 18, C.acc, 4); text("server", sx + 120, sy - 130, { px: 30, align: "center", color: C.acc });
  let waiting = 0, last = null, maxw = 0;
  ev.forEach((e) => {
    if (e.a > T) { return; }
    if (T < e.s) { const pos = waiting++; const x = qx - pos * gap, y = sy; if (x > 120) { ctx.beginPath(); ctx.arc(x, y, 17, 0, 7); ctx.fillStyle = C.warn; ctx.fill(); } }
    else if (T < e.e) { ctx.beginPath(); ctx.arc(sx + 120, sy, 26, 0, 7); ctx.fillStyle = C.good; ctx.fill(); const g = (T - e.s) / (e.e - e.s); rect(sx + 30, sy + 70, 180 * g, 14, C.good, 4); }
    else { const k = T - e.e; if (k < 1.2) { ctx.globalAlpha = 1 - k / 1.2; ctx.beginPath(); ctx.arc(sx + 260 + k * 260, sy, 15, 0, 7); ctx.fillStyle = C.dim; ctx.fill(); ctx.globalAlpha = 1; } last = e; }
  });
  ev.forEach((e) => { if (e.e <= T) maxw = Math.max(maxw, e.e - e.a); });
  ctx.fillStyle = C.line; ctx.fillRect(120, sy + 40, qx - 100, 2);
  text("waiting: " + waiting, 150, 760, { px: 60, mono: true, weight: 700, color: waiting > 6 ? C.bad : waiting > 2 ? C.warn : C.text });
  if (last) text("last request took " + (last.e - last.a).toFixed(1) + " × the work", 150, 840, { px: 40, mono: true, color: C.dim });
  text("one dot = one request · yellow: waiting · green: being served", 150, 930, { px: 26, color: C.dim });
};

const Q = () => EP.data;
function qcurve(t, d, p) {
  const x0 = 260, y0 = 220, w = 1180, h = 600, ymax = p.ymax || 20, X = (u) => x0 + u * w, Y = (v) => y0 + h - (Math.min(v, ymax) / ymax) * h;
  text(p.head || "response time, in multiples of the time one request takes to serve", x0, y0 - 36, { px: 28, color: C.dim }); rect(x0, y0, w, h, "#0a0d12", 6, C.line);
  for (let v = 0; v <= ymax; v += ymax / 5) { ctx.fillStyle = "#1c2128"; ctx.fillRect(x0, Y(v), w, 1); text(v + "×", x0 - 16, Y(v) + 9, { px: 24, mono: true, color: C.dim, align: "right" }); }
  for (let u = 0; u <= 1.0001; u += 0.1) text(Math.round(u * 100) + "%", X(u), y0 + h + 40, { px: 24, mono: true, color: C.dim, align: "center" });
  text("how busy the server is (utilisation)", x0 + w / 2, y0 + h + 86, { px: 28, color: C.dim, align: "center" });
  return { x0, y0, w, h, X, Y, ymax };
}
function line(fn, X, Y, u1, col, lw, g, dash) { ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.setLineDash(dash || []); ctx.beginPath(); let first = true;
  for (let u = 0; u <= u1 * g; u += 0.002) { const v = fn(u); if (!isFinite(v)) break; first ? ctx.moveTo(X(u), Y(v)) : ctx.lineTo(X(u), Y(v)); first = false; } ctx.stroke(); ctx.setLineDash([]); }
S.curve = (t, d, p) => {
  const k = qcurve(t, d, p), { X, Y } = k, sh = p.show || ["theory"], D = Q(), at = (i) => d * (0.1 + i * 0.25), g0 = ease(prog(t, at(0), at(0) + 2.2));
  if (sh.includes("theory")) { line((u) => 1 / (1 - u), X, Y, 0.995, C.acc, 5, g0); ctx.globalAlpha = fadeIn(t, at(0) + 1.5); text("theory: 1 / (1 − utilisation)", X(0.06), Y(2.6), { px: 30, color: C.acc }); ctx.globalAlpha = 1; }
  if (sh.includes("p99theory")) { const g = ease(prog(t, at(1), at(1) + 2)); line((u) => Math.log(100) / (1 - u), X, Y, 0.995, C.bad, 5, g, [14, 10]); }
  if (sh.includes("sim")) { ctx.globalAlpha = fadeIn(t, at(1), 0.5); D.sim.points.forEach((q, i) => { if (t < at(1) + i * 0.12) return; ctx.beginPath(); ctx.arc(X(q.u), Y(q.random.mean), 10, 0, 7); ctx.fillStyle = C.warn; ctx.fill(); });
    text("simulated: 200,000 to 2,000,000 requests per point", X(0.06), Y(ymaxL(p) * 0.92), { px: 28, color: C.warn }); ctx.globalAlpha = 1; }
  if (sh.includes("p99sim")) { ctx.globalAlpha = fadeIn(t, at(1), 0.5); D.sim.points.forEach((q, i) => { if (t < at(1) + i * 0.12) return; ctx.beginPath(); ctx.arc(X(q.u), Y(q.random.p99), 10, 0, 7); ctx.fillStyle = C.bad; ctx.fill(); });
    text("slowest 1 in 100 (99th percentile)", X(0.06), Y(ymaxL(p) * 0.92), { px: 30, color: C.bad, weight: 600 }); ctx.globalAlpha = 1; }
  if (sh.includes("real")) { const S_ = D.service_us, o = D.overhead_us; ctx.globalAlpha = fadeIn(t, at(1), 0.5);
    D.real.forEach((q, i) => { if (t < at(1) + i * 0.15 || q.offered >= 1) return; const v = (q.mean_us - o) / S_; ctx.beginPath(); ctx.arc(X(q.offered), Y(v), 11, 0, 7); ctx.fillStyle = C.good; ctx.fill(); });
    text("measured: a real server on this laptop", X(0.06), Y(ymaxL(p) * 0.92), { px: 30, color: C.good, weight: 600 }); ctx.globalAlpha = 1; }
  if (sh.includes("four")) { ctx.globalAlpha = fadeIn(t, at(1), 0.5); ctx.strokeStyle = C.good; ctx.lineWidth = 5; ctx.beginPath(); D.sim.points.forEach((q, i) => i ? ctx.lineTo(X(q.u), Y(q.four_servers_random.mean)) : ctx.moveTo(X(q.u), Y(q.four_servers_random.mean))); ctx.stroke();
    text("four servers sharing one queue", X(0.06), Y(ymaxL(p) * 0.92), { px: 30, color: C.good, weight: 600 }); ctx.globalAlpha = 1; }
  (p.marks || []).forEach((u, i) => { const a = fadeIn(t, d * (p.markAt || 0.45) + i * 0.6, 0.4); if (!a) return; ctx.globalAlpha = a; const v = (p.markP99 ? Math.log(100) : 1) / (1 - u);
    ctx.fillStyle = C.text; ctx.fillRect(X(u) - 1, Y(v), 2, k.y0 + k.h - Y(v)); ctx.beginPath(); ctx.arc(X(u), Y(v), 12, 0, 7); ctx.fillStyle = C.text; ctx.fill();
    text(Math.round(v * (p.markP99 ? 1 : 10)) / (p.markP99 ? 1 : 10) + "×", X(u) - 16, Y(v) - 22, { px: 44, weight: 700, mono: true, align: "right", color: C.text }); }); ctx.globalAlpha = 1;
  if (p.foot) { ctx.globalAlpha = fadeIn(t, d * 0.75, 0.6); text(p.foot, W / 2, H - 50, { px: 40, align: "center", weight: 600, color: C.warn }); ctx.globalAlpha = 1; }
};
function ymaxL(p) { return p.ymax || 20; }

S.multtable = (t, d, p) => {
  const R = [[0.5, "2×"], [0.8, "5×"], [0.9, "10×"], [0.95, "20×"]], x0 = 520, y0 = 290, lh = 150, bw = 820;
  text("average response time, as a multiple of the work itself · one queue, random arrivals", 250, 230, { px: 30, color: C.dim });
  R.forEach(([u, lab], i) => { const a = fadeIn(t, d * (0.08 + i * 0.18), 0.5), g = ease(prog(t, d * (0.08 + i * 0.18), d * (0.08 + i * 0.18) + 0.9)), y = y0 + i * lh, v = 1 / (1 - u), col = u >= 0.9 ? C.bad : u >= 0.8 ? C.warn : C.good; ctx.globalAlpha = a;
    text(Math.round(u * 100) + "% busy", x0 - 30, y + 58, { px: 46, weight: 700, align: "right", mono: true }); rect(x0, y + 10, (v / 20) * bw * g, 70, col, 8); text(lab, x0 + (v / 20) * bw + 24, y + 64, { px: 58, weight: 700, mono: true, color: col }); });
  ctx.globalAlpha = fadeIn(t, d * 0.82, 0.5); text(p.foot || "", W / 2, y0 + 4 * lh + 60, { px: 42, align: "center", color: C.warn, weight: 600 }); ctx.globalAlpha = 1;
};

S.realbars = (t, d, p) => {
  const R = Q().real.filter((q) => p.pick.includes(q.u_target)), x0 = 560, y0 = 300, lh = 150, bw = 900, max = p.max || 3.2;
  text(p.head || "a real server on this laptop · average response time", 200, y0 - 60, { px: 30, color: C.dim });
  R.forEach((q, i) => { const a = fadeIn(t, d * (0.08 + i * 0.2), 0.5), g = ease(prog(t, d * (0.08 + i * 0.2), d * (0.08 + i * 0.2) + 1)), y = y0 + i * lh, v = q.mean_us / 1000, col = q.offered > 0.9 ? C.bad : q.offered > 0.75 ? C.warn : C.good; ctx.globalAlpha = a;
    text(Math.round(q.offered * 100) + "% busy", x0 - 30, y + 56, { px: 44, weight: 700, align: "right", mono: true }); rect(x0, y + 10, Math.min(bw, (v / max) * bw * g), 70, col, 8);
    text(v.toFixed(2) + " ms", x0 + Math.min(bw, (v / max) * bw) + 24, y + 62, { px: 54, weight: 700, mono: true, color: col }); });
  ctx.globalAlpha = fadeIn(t, d * 0.75, 0.6); text(p.foot || "", W / 2, y0 + R.length * lh + 60, { px: 42, align: "center", color: C.warn, weight: 600 }); ctx.globalAlpha = 1;
};

S.fixedbars = (t, d, p) => {
  const P = Q().sim.points.filter((q) => [0.8, 0.9].includes(q.u)), x0 = 640, y0 = 300, lh = 120, bw = 820, max = 11;
  text("same average work per request: random service times against fixed ones · simulated", 200, y0 - 60, { px: 30, color: C.dim });
  P.forEach((q, i) => [["random", q.random.mean, C.bad], ["fixed", q.fixed.mean, C.good]].forEach(([nm, v, col], j) => { const k = i * 2 + j, a = fadeIn(t, d * (0.1 + k * 0.14), 0.5), g = ease(prog(t, d * (0.1 + k * 0.14), d * (0.1 + k * 0.14) + 0.9)), y = y0 + k * lh + i * 40; ctx.globalAlpha = a;
    text(Math.round(q.u * 100) + "% busy, " + nm, x0 - 30, y + 52, { px: 36, align: "right", mono: true }); rect(x0, y + 10, (v / max) * bw * g, 60, col, 8); text(v.toFixed(1) + "×", x0 + (v / max) * bw + 24, y + 58, { px: 50, weight: 700, mono: true, color: col }); }));
  ctx.globalAlpha = fadeIn(t, d * 0.75, 0.6); text(p.foot || "", W / 2, y0 + 4 * lh + 140, { px: 42, align: "center", color: C.warn, weight: 600 }); ctx.globalAlpha = 1;
};

S.coplot = (t, d, p) => {
  const CO = Q().co, modes = p.modes || ["closed", "open"], x0 = 300, w = 1360, hh = 250, ymax = 200;
  text("every 25th request, in the order sent · server freezes for 100 ms once a second · response time in ms (cut at 200)", x0, 220, { px: 26, color: C.dim });
  modes.forEach((m, i) => { const S_ = CO[m].series_ms, y0 = 270 + i * (hh + 110), g = prog(t, d * (0.1 + i * 0.3), d * (0.1 + i * 0.3) + 2.5), n = Math.floor(S_.length * g), col = m === "open" ? C.bad : C.acc;
    ctx.globalAlpha = fadeIn(t, d * (0.05 + i * 0.3), 0.4); rect(x0, y0, w, hh, "#0a0d12", 6, C.line);
    text(m === "open" ? "open loop: sends on schedule, measures from the scheduled time" : "closed loop: sends the next request only after the last reply", x0, y0 - 14, { px: 28, color: col, weight: 600 });
    [0, 100, 200].forEach((v) => text(v + "", x0 - 14, y0 + hh - (v / ymax) * hh + 8, { px: 22, mono: true, color: C.dim, align: "right" }));
    ctx.fillStyle = col; for (let j = 0; j < n; j++) { const v = Math.min(S_[j], ymax); ctx.fillRect(x0 + (j / S_.length) * w, y0 + hh - (v / ymax) * hh - 2, 3, 3); }
    ctx.globalAlpha = fadeIn(t, d * (0.35 + i * 0.3), 0.5); text("99th percentile: " + (CO[m].p99_us / 1000).toFixed(1) + " ms", x0 + w - 10, y0 + 50, { px: 40, weight: 700, mono: true, align: "right", color: col }); });
  ctx.globalAlpha = fadeIn(t, d * 0.8, 0.6); text(p.foot || "", W / 2, H - 50, { px: 40, align: "center", weight: 600, color: C.warn }); ctx.globalAlpha = 1;
};

S.cotable = (t, d, p) => {
  const CO = Q().co, rows = [["closed", "closed loop"], ["open", "open loop"]], x = 170, w = W - 340, y = 340, lh = 180, cols = [["requests sent", (r) => fmt(r.n)], ["median", (r) => (r.p50_us / 1000).toFixed(2) + " ms"], ["99th percentile", (r) => (r.p99_us / 1000).toFixed(1) + " ms"], ["99.9th", (r) => (r.p999_us / 1000).toFixed(1) + " ms"]];
  text("the same server, the same 20 seconds, the same 100 ms freezes · two ways to measure", x, 240, { px: 30, color: C.dim });
  cols.forEach(([hd], j) => text(hd, x + 700 + j * 290, y - 26, { px: 26, color: C.dim, align: "right" }));
  rows.forEach(([m, lab], i) => { const r = CO[m], a = fadeIn(t, d * (0.1 + i * 0.3), 0.5), yy = y + i * lh, col = m === "open" ? C.bad : C.acc; ctx.globalAlpha = a;
    rect(x, yy, w, lh - 30, C.panel, 14, col, 3); text(lab, x + 40, yy + 88, { px: 40, weight: 700, color: col });
    cols.forEach(([, f], j) => text(f(r), x + 700 + j * 290, yy + 92, { px: 44, mono: true, weight: 700, align: "right" })); });
  ctx.globalAlpha = fadeIn(t, d * 0.7, 0.6); text(p.foot || "", W / 2, y + 2 * lh + 80, { px: 42, align: "center", color: C.warn, weight: 600 }); ctx.globalAlpha = 1;
};

S.budget = (t, d, p) => {
  const R = [["2×", 0.5], ["4×", 0.75], ["5×", 0.8], ["10×", 0.9]], x = 360, w = W - 720, y0 = 330, lh = 130;
  text("if the average response may be at most … the work itself", x, y0 - 50, { px: 30, color: C.dim }); text("keep the server below", x + w - 30, y0 - 50, { px: 30, color: C.dim, align: "right" });
  R.forEach(([k, u], i) => { const a = fadeIn(t, d * (0.08 + i * 0.16), 0.5), y = y0 + i * lh; ctx.globalAlpha = a;
    rect(x, y, w, lh - 24, C.panel, 12, C.line); text(k, x + 40, y + 70, { px: 52, mono: true, weight: 700 }); text(Math.round(u * 100) + "% busy", x + w - 40, y + 70, { px: 52, mono: true, weight: 700, align: "right", color: u > 0.85 ? C.bad : u > 0.7 ? C.warn : C.good }); });
  ctx.globalAlpha = fadeIn(t, d * 0.75, 0.6); text(p.foot || "utilisation = 1 − 1 / allowed multiple · one queue, random arrivals and service", W / 2, y0 + 4 * lh + 60, { px: 32, align: "center", color: C.dim }); ctx.globalAlpha = 1;
};

/* ---------- frame ---------- */
function renderAt(T) {
  const tl = EP.timeline.beats; let k = 0;
  while (k < tl.length - 1 && T >= tl[k + 1].start) k++;
  const b = tl[k], beat = EP.storyboard.beats[k], t = Math.max(0, T - b.start);
  const last = k === tl.length - 1, d = last ? (EP.timeline.total - b.start) : b.dur;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
  // background: slowly drifting grid under a soft vignette
  const drift = (T * 4) % 60;
  ctx.fillStyle = "#121821"; for (let x = -60 + drift; x < W; x += 60) ctx.fillRect(x, 0, 1, H); for (let y = -60 + drift * 0.5; y < H; y += 60) ctx.fillRect(0, y, W, 1);
  const g = ctx.createRadialGradient(W / 2, H * 0.45, 200, W / 2, H / 2, 1250);
  g.addColorStop(0, "rgba(31,111,235,0.07)"); g.addColorStop(0.55, "rgba(13,17,23,0)"); g.addColorStop(1, "rgba(0,0,0,0.55)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // scene, with a slow push-in so nothing is ever completely still
  const edge = Math.min(ease(prog(t, 0, 0.35)), last ? 1 : 1 - ease(prog(t, d - 0.25, d)));
  const z = 1 + 0.014 * prog(t, 0, d) + 0.02 * (1 - edge);
  ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(z, z); ctx.translate(-W / 2, -H / 2);
  S[beat.scene](t, b.speech + 0.01, beat.p || {});
  ctx.restore(); ctx.globalAlpha = 1;
  // dissolve at the edges of each beat
  if (edge < 1) { ctx.globalAlpha = 1 - edge; ctx.fillStyle = C.bg; ctx.fillRect(0, 96, W, H - 110); ctx.fillStyle = g; ctx.fillRect(0, 96, W, H - 110); ctx.globalAlpha = 1; }
  // chapter label, with a stinger when the chapter changes
  if (beat.chapter) {
    const fresh = k === 0 || EP.storyboard.beats[k - 1].chapter !== beat.chapter;
    const s1 = fresh ? ease(prog(t, 0.05, 0.6)) : 1, s2 = fresh ? ease(prog(t, 1.5, 2.2)) : 1;
    const px = lerp(46, 26, s2), col = s2 < 1 ? C.text : C.dim;
    font(px, SANS, 600); const label = beat.chapter.toUpperCase(), w = ctx.measureText(label).width;
    ctx.globalAlpha = s1; text(label, 70 - (1 - s1) * 60, 78, { px, color: col, weight: 600 });
    ctx.fillStyle = C.acc; ctx.globalAlpha = s1 * (1 - s2); ctx.fillRect(70, 94, w * s1, 4); ctx.globalAlpha = 1;
  }
  ctx.fillStyle = "#1c2128"; ctx.fillRect(0, H - 8, W, 8); ctx.fillStyle = C.acc; ctx.fillRect(0, H - 8, W * (T / EP.timeline.total), 8);
}
function init() { const c = document.getElementById("c"); ctx = c.getContext("2d"); return document.fonts.ready.then(() => true); }
function frameJPEG(T, q) { renderAt(T); return document.getElementById("c").toDataURL("image/jpeg", q || 0.93).split(",")[1]; }

/* ---------- vertical Shorts: the 16:9 scene is cropped into a 1080x1920 frame with a headline and captions ---------- */
let shortCanvas = null;
function wrapLines(c2, str, maxW) {
  const words = str.split(" "), lines = []; let cur = "";
  for (const w of words) { const t = cur ? cur + " " + w : w; if (c2.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; }
  if (cur) lines.push(cur); return lines;
}
function frameShort(T, cfg) {
  renderAt(T);
  if (!shortCanvas) { shortCanvas = document.createElement("canvas"); shortCanvas.width = 1080; shortCanvas.height = 1920; }
  const c2 = shortCanvas.getContext("2d"), SW = 1080, SH = 1920, main = document.getElementById("c");
  c2.fillStyle = C.bg; c2.fillRect(0, 0, SW, SH);
  const g = c2.createRadialGradient(SW / 2, 820, 150, SW / 2, 960, 1150);
  g.addColorStop(0, "rgba(31,111,235,0.10)"); g.addColorStop(0.6, "rgba(13,17,23,0)"); g.addColorStop(1, "rgba(0,0,0,0.6)");
  c2.fillStyle = g; c2.fillRect(0, 0, SW, SH);
  const sx = cfg.sx, sw = cfg.sw, sy = 104, sh = 968, dh = Math.round(sh * SW / sw), dy = 500;
  if (!cfg.tag) {
    c2.drawImage(main, sx, sy, sw, sh, 0, dy, SW, dh);
    c2.fillStyle = C.line; c2.fillRect(0, dy - 2, SW, 2); c2.fillRect(0, dy + dh, SW, 2);
  }
  c2.textAlign = "center"; c2.textBaseline = "alphabetic";
  cfg.head.forEach((l, i) => { c2.font = `700 72px ${SANS}`; c2.fillStyle = i === cfg.head.length - 1 ? C.acc : C.text; c2.fillText(l, SW / 2, 250 + i * 92); });
  if (cfg.tag) {
    c2.font = `700 96px ${SANS}`; c2.fillStyle = C.text; c2.fillText("Under Test", SW / 2, 880);
    c2.font = `400 46px ${SANS}`; c2.fillStyle = C.acc; c2.fillText("Real systems, measured.", SW / 2, 960);
    c2.font = `600 50px ${SANS}`; c2.fillStyle = C.text; wrapLines(c2, cfg.cap, 900).forEach((l, i) => c2.fillText(l, SW / 2, 1150 + i * 70));
  } else if (cfg.cap) {
    c2.font = `600 50px ${SANS}`; const lines = wrapLines(c2, cfg.cap, 900), y0 = dy + dh + 110;
    lines.forEach((l, i) => { c2.fillStyle = C.text; c2.fillText(l, SW / 2 - 30, y0 + i * 68); });
  }
  c2.font = `600 34px ${SANS}`; c2.fillStyle = C.dim; c2.fillText("UNDER TEST", SW / 2, 120);
  return shortCanvas.toDataURL("image/jpeg", 0.93).split(",")[1];
}
