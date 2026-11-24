/* Where They Fell: deterministic canvas renderer. renderAt(T) draws the frame for global time T (seconds); the same T always
   gives the same pixels, so frames render in parallel. Episode content comes from window.EP (data.js).
   Visual system: a dark case file. Near-black desk, bone-white type, ONE warning red for the thing that matters; condensed
   news-style headings (Nimbus Sans Narrow), typewriter labels and sources (Nimbus Mono PS); a year ruler along the bottom
   whose red cursor shows when each beat happens. Quotes are typed on paper cards with the attribution under them.
   Deliberately unlike Under Test (terminal panels, Noto Sans, blue), Contour Notes (survey sheet, serif, gold) and
   Earth Worked Out (warm paper, Lato). No logos, no product photos, no portraits: devices are generic diagrams. */
"use strict";
const W = 1920, H = 1080;
const C = { bg: "#0e0f11", bg2: "#15161a", card: "#1b1c20", line: "#2b2d32", faint: "#3b3e44", ink: "#ece9e1", dim: "#9a9ca2",
            bone: "#cfc8b8", steel: "#6d7179", paper: "#e7e0cf", paperInk: "#1d1b18", paperDim: "#6b655a",
            red: "#e2382d", redDim: "rgba(226,56,45,0.18)", redGlow: "rgba(226,56,45,0.45)" };
const HEAD = '"Nimbus Sans Narrow", "Liberation Sans Narrow", sans-serif', BODY = '"Nimbus Sans", "Liberation Sans", sans-serif',
      MONO = '"Nimbus Mono PS", "Courier New", monospace';
const Y0 = 1984, Y1 = 2027;       // the year ruler
let ctx;

const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const ease = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };
const prog = (t, a, b) => clamp((t - a) / (b - a));
const lerp = (a, b, x) => a + (b - a) * x;
const fadeIn = (t, at, d = 0.5) => ease(prog(t, at, at + d));
const fmt = (n) => Math.round(n).toLocaleString("en-US");
const FAM = { head: HEAD, body: BODY, mono: MONO };
function font(px, f, weight) { ctx.font = `${weight || 400} ${px}px ${FAM[f || "body"]}`; }
/* text(s, x, y, {px, f: head|body|mono, weight, color, align, maxW}): maxW shrinks the type until the line fits */
const noLig = (s) => String(s).replace(/f(?=[fil])/g, "f\u200C");
function text(s, x, y, o = {}) {
  s = noLig(s); let px = o.px || 40; const f = o.f || "body", wt = o.weight || (f === "head" ? 700 : 400);
  font(px, f, wt); if (o.maxW) while (ctx.measureText(s).width > o.maxW && px > 12) { px -= 1; font(px, f, wt); }
  ctx.fillStyle = o.color || C.ink; ctx.textAlign = o.align || "left"; ctx.textBaseline = "alphabetic"; ctx.fillText(s, x, y);
  return ctx.measureText(s).width;
}
function measure(s, px, f, weight) { s = noLig(s); font(px, f, weight || (f === "head" ? 700 : 400)); return ctx.measureText(s).width; }
function wrap(s, px, f, maxW, weight) { font(px, f, weight || (f === "head" ? 700 : 400)); const out = []; let cur = "";
  for (const w of s.split(" ")) { const tt = cur ? cur + " " + w : w; if (ctx.measureText(tt).width > maxW && cur) { out.push(cur); cur = w; } else cur = tt; }
  if (cur) out.push(cur); return out; }
function rect(x, y, w, h, fill, r = 0, stroke = null, lw = 2) {
  ctx.beginPath(); ctx.roundRect(x, y, w, h, r); if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
}
function line(pts, col, lw = 3, dash) { ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.lineJoin = "round"; ctx.lineCap = "round"; ctx.setLineDash(dash || []);
  ctx.beginPath(); pts.forEach(([a, b], i) => i ? ctx.lineTo(a, b) : ctx.moveTo(a, b)); ctx.stroke(); ctx.setLineDash([]); }
function arrow(x1, y1, x2, y2, col, lw = 4, head = 16) {
  line([[x1, y1], [x2, y2]], col, lw); const a = Math.atan2(y2 - y1, x2 - x1); ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - head * Math.cos(a - 0.42), y2 - head * Math.sin(a - 0.42)); ctx.lineTo(x2 - head * Math.cos(a + 0.42), y2 - head * Math.sin(a + 0.42)); ctx.closePath(); ctx.fill();
}
/* a case-file card: dark panel, hairline border, typed tab label at the top left */
function card(x, y, w, h, label, hot) {
  rect(x, y, w, h, C.card, 3, hot ? C.red : C.line, 2);
  if (label) { const lw = measure(label.toUpperCase(), 22, "mono", 700) + 28; rect(x + 24, y - 15, lw, 30, hot ? C.red : C.bone, 2);
    text(label.toUpperCase(), x + 38, y + 7, { px: 22, f: "mono", weight: 700, color: C.bg }); }
}
/* a paper card for quotes: typed text, attribution underneath, a red rule down the left edge */
function paperCard(x, y, w, h) { ctx.save(); ctx.shadowColor = "rgba(0,0,0,0.6)"; ctx.shadowBlur = 40; ctx.shadowOffsetY = 14; rect(x, y, w, h, C.paper, 2); ctx.restore();
  ctx.fillStyle = C.red; ctx.fillRect(x, y, 8, h); }
function stamp(s, x, y, a, rot = -0.06, px = 40) {        // a red rubber stamp
  if (a <= 0) return; ctx.save(); ctx.globalAlpha *= a; ctx.translate(x, y); ctx.rotate(rot); const s2 = 1 + 0.25 * (1 - a); ctx.scale(s2, s2);
  const w = measure(s, px, "mono", 700) + 40; rect(-w / 2, -px * 0.95, w, px * 1.5, null, 4, C.red, 4);
  text(s, 0, px * 0.18, { px, f: "mono", weight: 700, color: C.red, align: "center" }); ctx.restore();
}
function src(s, x, y, a = 1, align = "left") { ctx.globalAlpha = a; text(s, x, y, { px: 24, f: "mono", color: C.dim, align, maxW: 1780 }); ctx.globalAlpha = 1; }

/* ---------- generic device diagrams (no real product shapes, no logos) ---------- */
function phoneKB(x, y, w, h, col, fill) {        // generic keyboard phone: screen on top, thumb keyboard below
  rect(x, y, w, h, fill || C.bg2, w * 0.14, col || C.bone, Math.max(2, w / 60));
  rect(x + w * 0.1, y + h * 0.08, w * 0.8, h * 0.42, "#0b0c0e", w * 0.03, col || C.bone, Math.max(1, w / 120));
  const kx = x + w * 0.1, ky = y + h * 0.58, kw = w * 0.8, kh = h * 0.32, cols = 8, rows = 4;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++)
    rect(kx + c * kw / cols + kw / cols * 0.12, ky + r * kh / rows + kh / rows * 0.14, kw / cols * 0.76, kh / rows * 0.7, col || C.bone, w * 0.02);
}
function phoneSlab(x, y, w, h, col, fill) {      // generic all-screen phone
  rect(x, y, w, h, fill || C.bg2, w * 0.16, col || C.bone, Math.max(2, w / 60));
  rect(x + w * 0.08, y + h * 0.09, w * 0.84, h * 0.8, "#0b0c0e", w * 0.04, col || C.bone, Math.max(1, w / 120));
  ctx.beginPath(); ctx.arc(x + w / 2, y + h * 0.945, w * 0.05, 0, 7); ctx.strokeStyle = col || C.bone; ctx.lineWidth = Math.max(1, w / 90); ctx.stroke();
}
function tablet(x, y, w, h, col) { rect(x, y, w, h, C.bg2, 22, col || C.bone, 3); rect(x + 30, y + 26, w - 60, h - 52, "#0b0c0e", 8, col || C.bone, 2); }
function envelope(x, y, s, col, fill) { rect(x - s, y - s * 0.65, s * 2, s * 1.3, fill || C.bg, 3, col || C.ink, 2.5);
  line([[x - s, y - s * 0.65], [x, y + s * 0.1], [x + s, y - s * 0.65]], col || C.ink, 2.5); }
function lock(x, y, s, col) { rect(x - s * 0.6, y - s * 0.1, s * 1.2, s * 0.95, col, 3); ctx.beginPath(); ctx.arc(x, y - s * 0.1, s * 0.4, Math.PI, 0); ctx.strokeStyle = col; ctx.lineWidth = s * 0.16; ctx.stroke(); }
function server(x, y, w, h, col) { for (let i = 0; i < 3; i++) { rect(x, y + i * h / 3, w, h / 3 - 6, C.bg2, 4, col || C.bone, 2.5);
  ctx.fillStyle = col || C.bone; ctx.beginPath(); ctx.arc(x + w - 18, y + i * h / 3 + h / 6 - 3, 4, 0, 7); ctx.fill(); line([[x + 14, y + i * h / 3 + h / 6 - 3], [x + w * 0.55, y + i * h / 3 + h / 6 - 3]], col || C.bone, 2); } }
function tower(x, y, s, col) { line([[x - s * 0.35, y + s], [x, y - s * 0.4], [x + s * 0.35, y + s]], col, 3); line([[x - s * 0.22, y + s * 0.5], [x + s * 0.22, y + s * 0.5]], col, 2);
  for (const r of [0.35, 0.6]) { ctx.beginPath(); ctx.arc(x, y - s * 0.4, s * r, -Math.PI * 0.8, -Math.PI * 0.2); ctx.strokeStyle = col; ctx.lineWidth = 2.5; ctx.stroke(); } }
function counter(v, x, y, px, col, suffix = "", align = "center") { return text(fmt(v) + suffix, x, y, { px, f: "head", color: col || C.ink, align }); }

/* ---------- background: registration marks on a near-black desk; the year ruler is drawn in renderAt ---------- */
let bgCache = null;
function background() {
  if (!bgCache) { bgCache = document.createElement("canvas"); bgCache.width = W + 240; bgCache.height = H; const c = bgCache.getContext("2d");
    c.strokeStyle = "#1d1f23"; c.lineWidth = 2;
    for (let x = 60; x < W + 240; x += 120) for (let y = 60; y < H; y += 120) { c.beginPath(); c.moveTo(x - 7, y); c.lineTo(x + 7, y); c.moveTo(x, y - 7); c.lineTo(x, y + 7); c.stroke(); }
    const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "rgba(14,15,17,0)"); g.addColorStop(1, "rgba(14,15,17,0.6)"); c.fillStyle = g; c.fillRect(0, 0, W + 240, H); }
  return bgCache;
}

/* ---------- scenes: draw(t, dur, p), t local to the beat ---------- */
const S = {};
S.title = (t, d, p) => {
  const n = p.title.length, y0 = 400 - (n - 1) * 60;
  ctx.globalAlpha = fadeIn(t, 0.05); text(p.kicker || "CASE FILE", 170, y0 - 120, { px: 30, f: "mono", weight: 700, color: C.red });
  p.title.forEach((l, i) => { const a = fadeIn(t, 0.2 + i * 0.4, 0.6); ctx.globalAlpha = a;
    text(l, 166, y0 + i * 128 + (1 - a) * 18, { px: 118, f: "head", color: i === n - 1 ? C.red : C.ink, maxW: 1600 }); });
  ctx.globalAlpha = fadeIn(t, 0.4 + n * 0.4); if (p.sub) text(p.sub, 170, y0 + (n - 1) * 128 + 90, { px: 36, color: C.dim, maxW: 1580 });
  if (p.counter) { const a = fadeIn(t, d * 0.35, 0.6); ctx.globalAlpha = a; const v = p.counter.to * ease(prog(t, d * 0.35, d * 0.75));
    counter(v, 170, 800, 92, C.ink, "+", "left"); text(p.counter.label, 170, 850, { px: 30, f: "mono", color: C.dim }); }
  ctx.globalAlpha = 1;
};
S.statement = (t, d, p) => {
  const n = p.lines.length, step = Math.min(1.6, (d * 0.55) / n), lh = p.px ? p.px * 1.45 : 104, y0 = 520 - (n - 1) * lh / 2 - (p.sub ? 30 : 0);
  p.lines.forEach((l, i) => { const a = fadeIn(t, 0.2 + i * step, 0.6), acc = (p.accent || []).includes(i); ctx.globalAlpha = a;
    text(l, W / 2, y0 + i * lh + (1 - a) * 16, { px: p.px || 72, f: "head", align: "center", color: acc ? C.red : C.ink, maxW: 1700 }); });
  if (p.sub) { ctx.globalAlpha = fadeIn(t, 0.4 + n * step, 0.8); text(p.sub, W / 2, y0 + n * lh + 10, { px: 30, f: "mono", align: "center", color: C.dim, maxW: 1700 }); }
  if (p.src) src(p.src, W / 2, 960, fadeIn(t, 0.8), "center");
  ctx.globalAlpha = 1;
};
S.bullets = (t, d, p) => {
  const n = p.items.length, step = (d * 0.7) / (n + 0.5), lh = n > 5 ? 108 : 124, x = 250, y0 = 520 - (n * lh) / 2 + 40;
  ctx.globalAlpha = fadeIn(t, 0.1); text(p.head.toUpperCase(), x, y0 - 60, { px: 56, f: "head", color: C.ink });
  ctx.fillStyle = C.red; ctx.fillRect(x, y0 - 40, 120 * ease(prog(t, 0.2, 0.9)), 5);
  p.items.forEach((it, i) => { const a = fadeIn(t, 0.5 + i * step, 0.5), y = y0 + 50 + i * lh; ctx.globalAlpha = a;
    rect(x, y - 44, 64, 58, i === (p.hot ?? -1) ? C.red : null, 2, C.red, 2);
    text(p.numbered === false ? "▪" : String(i + 1).padStart(2, "0"), x + 32, y - 3, { px: 32, f: "mono", weight: 700, align: "center", color: i === (p.hot ?? -1) ? C.bg : C.red });
    text(it, x + 100 + (1 - a) * 20, y, { px: p.px || 46, maxW: W - x - 220 }); });
  ctx.globalAlpha = 1;
};
/* timeline: dated events on a horizontal rule; cards alternate above and below; optional red span bracket */
S.timeline = (t, d, p) => {
  const ev = p.events, n = ev.length, x0 = 170, x1 = W - 170, y = p.y || 540, gap = (x1 - x0) / n, step = (d * (p.spread || 0.7)) / n;
  if (p.head) { ctx.globalAlpha = fadeIn(t, 0.1); text(p.head.toUpperCase(), x0, 190, { px: 44, f: "head", maxW: 1580 }); ctx.globalAlpha = 1; }
  const g = ease(prog(t, 0.1, p.ats ? d * p.ats[n - 1] + 0.5 : 0.1 + step * n)); line([[x0 - 40, y], [x0 - 40 + (x1 - x0 + 80) * g, y]], C.faint, 4);
  ev.forEach((e, i) => { const at = p.ats ? d * p.ats[i] : 0.3 + i * step, a = fadeIn(t, at, 0.5); if (a <= 0) return; ctx.globalAlpha = a;
    const cx = x0 + gap * (i + 0.5), hot = (p.hl || []).includes(i), up = p.below ? false : i % 2 === 0, col = hot ? C.red : C.bone;
    ctx.beginPath(); ctx.arc(cx, y, hot ? 13 : 10, 0, 7); ctx.fillStyle = hot ? C.red : C.bg; ctx.fill(); ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.stroke();
    const cw = Math.min(gap - 26, 520), tl = wrap(e.t, 38, "head", cw - 44).slice(0, 2), ch = 124 + (e.s ? 46 : 0) + (tl.length > 1 ? 42 : 0), cy = up ? y - 50 - ch : y + 50; line([[cx, up ? y - 14 : y + 14], [cx, up ? y - 50 : y + 50]], col, 2);
    card(cx - cw / 2, cy, cw, ch, null, hot);
    text(e.d, cx - cw / 2 + 22, cy + 42, { px: 28, f: "mono", weight: 700, color: hot ? C.red : C.dim, maxW: cw - 40 });
    tl.forEach((l, k) => text(l, cx - cw / 2 + 22, cy + 88 + k * 42, { px: 38, f: "head", maxW: cw - 44 }));
    if (e.s) text(e.s, cx - cw / 2 + 22, cy + ch - 22, { px: 23, f: "mono", color: C.dim, maxW: cw - 44 });
    const iy = up ? y + 40 : y - 190; if (e.icon === "kb") phoneKB(cx - 34, iy, 68, 150, col); if (e.icon === "slab") phoneSlab(cx - 34, iy, 68, 150, col);
    if (e.icon === "grey") { ctx.globalAlpha = a * (1 - 0.7 * ease(prog(t, at + 0.6, at + 2))); phoneKB(cx - 34, iy, 68, 150, C.steel); }
  });
  ctx.globalAlpha = 1;
  if (p.span) { const [i, j, lab] = p.span, a = fadeIn(t, d * 0.62, 0.6), xa = x0 + gap * (i + 0.5), xb = x0 + gap * (j + 0.5);
    ctx.globalAlpha = a; const yy = y + (p.spanY || 300); line([[xa, yy - 20], [xa, yy], [lerp(xa, xb, ease(prog(t, d * 0.62, d * 0.85))), yy]], C.red, 4);
    if (t > d * 0.85) { line([[xb, yy], [xb, yy - 20]], C.red, 4); }
    text(lab, (xa + xb) / 2, yy + 52, { px: 40, f: "head", color: C.red, align: "center" }); ctx.globalAlpha = 1; }
  if (p.after) { const a = fadeIn(t, d * 0.66, 0.7); ctx.globalAlpha = a; const bx = W - 760, by = 760; rect(bx, by, 590, 170, "rgba(30,36,46,0.9)", 3, C.bone, 2);
    ctx.strokeStyle = "rgba(207,200,184,0.18)"; ctx.lineWidth = 1; for (let gx = bx + 20; gx < bx + 590; gx += 22) { ctx.beginPath(); ctx.moveTo(gx, by); ctx.lineTo(gx, by + 170); ctx.stroke(); }
    for (let gy = by + 20; gy < by + 170; gy += 22) { ctx.beginPath(); ctx.moveTo(bx, gy); ctx.lineTo(bx + 590, gy); ctx.stroke(); }
    text(p.after[0], bx + 295, by + 80, { px: 46, f: "head", align: "center", maxW: 550 }); text(p.after[1], bx + 295, by + 130, { px: 26, f: "mono", color: C.dim, align: "center", maxW: 550 }); ctx.globalAlpha = 1; }
  if (p.src) src(p.src, x0 - 40, 975, fadeIn(t, 1));
};
/* pull versus push */
S.pushpull = (t, d, p) => {
  const half = d * 0.42;
  [[0, "PULL", "the device keeps asking"], [1, "PUSH", "the server sends it at once"]].forEach(([k, lab, sub]) => {
    const x = 150 + k * 840, y = 220, w = 780, h = 640, at = k ? half : 0.1, a = fadeIn(t, at, 0.6); if (a <= 0) return; ctx.globalAlpha = a;
    card(x, y, w, h, lab, k === 1); text(sub, x + 40, y + 80, { px: 34, f: "head", color: C.dim });
    server(x + 60, y + 220, 170, 210); text("mail server", x + 145, y + 480, { px: 26, f: "mono", color: C.dim, align: "center" });
    phoneKB(x + w - 200, y + 180, 120, 260); text("device", x + w - 140, y + 480, { px: 26, f: "mono", color: C.dim, align: "center" });
    const tt = t - at, xa = x + 250, xb = x + w - 220;
    if (k === 0) { const cyc = 2.4, ph = (tt % cyc) / cyc, ask = ph < 0.5;
      if (tt > 0.4) { const q = ask ? ph * 2 : (ph - 0.5) * 2; const px = ask ? lerp(xb, xa, q) : lerp(xa, xb, q);
        arrow(ask ? xb : xa, y + 300, ask ? xa + (xb - xa) * (1 - q) : xa + (xb - xa) * q, y + 300, ask ? C.bone : C.steel, 3, 12);
        text(ask ? "anything new?" : "no.", (xa + xb) / 2, y + 270, { px: 28, f: "mono", align: "center", color: ask ? C.ink : C.dim }); void px; }
      const ang = tt * 2.6; ctx.beginPath(); ctx.arc(x + w / 2, y + 470, 46, 0, 7); ctx.strokeStyle = C.bone; ctx.lineWidth = 3; ctx.stroke();
      line([[x + w / 2, y + 470], [x + w / 2 + 34 * Math.sin(ang), y + 470 - 34 * Math.cos(ang)]], C.bone, 3);
      text("check, wait, check again", x + w / 2, y + 590, { px: 30, f: "mono", color: C.dim, align: "center", maxW: w - 60 });
    } else { const cyc = 3.2, ph = (tt % cyc) / cyc;
      if (tt > 0.3) { const arr = ph < 0.25; envelope(x + 145, y + 175, 26, C.red); if (!arr) { const q = ease((ph - 0.25) / 0.35);
        if (q < 1) envelope(lerp(xa, xb, q), y + 300, 24, C.red); else { ctx.globalAlpha = a * (1 - prog(ph, 0.6, 1)); text("delivered", xb + 20, y + 140, { px: 30, f: "mono", color: C.red, align: "center" }); ctx.globalAlpha = a; } }
        line([[xa, y + 300], [xb, y + 300]], C.faint, 2, [8, 8]); }
      text("mail arrives → sent straight on", x + w / 2, y + 590, { px: 30, f: "mono", color: C.dim, align: "center", maxW: w - 60 }); }
  });
  ctx.globalAlpha = 1;
};
/* the network: office mail server -> enterprise server -> firewall -> NOC -> carriers -> handsets */
S.network = (t, d, p) => {
  const mode = p.mode || "normal", y = 470, out = mode === "outage";
  const nodes = [["mail server", "at the company", 190], ["enterprise server", "RIM software", 470], ["firewall", "one connection out", 730],
                 ["N O C", "RIM's operations centre", 1040], ["carriers", "mobile networks", 1390], ["handsets", "", 1700]];
  const step = mode === "normal" ? (d * 0.62) / nodes.length : 0.15, show = (i) => fadeIn(t, 0.2 + i * step, 0.5);
  const hubRed = out ? ease(prog(t, 0.8, 2.2)) : 0;
  for (let i = 0; i < nodes.length - 1; i++) { const a = Math.min(show(i), show(i + 1)); if (a <= 0) continue; ctx.globalAlpha = a;
    const xa = nodes[i][2] + 70, xb = nodes[i + 1][2] - 70; line([[xa, y], [xb, y]], i >= 2 && out ? C.redDim : C.faint, 6); }
  ctx.globalAlpha = 1;
  if (mode !== "outage") {   // messages travelling the path, drawn behind the nodes
    const n = 4, per = 3.2; for (let k = 0; k < n; k++) { const ph = ((t + k * per / n) % per) / per, sx = lerp(190, 1700, ph); if (t < 1.2) break;
      const big = mode === "compress" ? (sx < 1040 ? 26 : 13) : 20; envelope(sx, y - 0, big, mode === "compress" && sx >= 1040 ? C.red : C.ink, C.bg); }
  }
  nodes.forEach(([lab, sub, x], i) => { const a = show(i); if (a <= 0) return; ctx.globalAlpha = a;
    if (i === 0) server(x - 70, y - 100, 140, 180); if (i === 1) server(x - 70, y - 100, 140, 180, C.ink);
    if (i === 2) { rect(x - 52, y - 144, 104, 288, C.bg, 0); for (let r = 0; r < 7; r++) for (let c = 0; c < 2; c++) rect(x - 40 + c * 40 + (r % 2) * 20 - 10, y - 140 + r * 40, 38, 36, C.bg2, 2, C.steel, 2); }
    if (i === 3) { const col = hubRed > 0 ? C.red : C.ink; ctx.beginPath(); ctx.arc(x, y, 96, 0, 7); ctx.fillStyle = hubRed > 0.5 ? C.redDim : C.bg2; ctx.fill(); ctx.strokeStyle = col; ctx.lineWidth = 5; ctx.stroke();
      text("NOC", x, y + 18, { px: 56, f: "head", align: "center", color: col }); }
    if (i === 4) { rect(x - 110, y - 90, 220, 170, C.bg, 0); tower(x - 60, y - 40, 80, C.bone); tower(x + 60, y - 40, 80, C.bone); }
    if (i === 5) { for (let k = 0; k < 3; k++) phoneKB(x - 110 + k * 76, y - 100, 64, 150); }
    text(lab, x, y + 170, { px: 34, f: "head", align: "center", color: i === 3 && hubRed > 0.5 ? C.red : C.ink });
    if (sub) text(sub, x, y + 210, { px: 22, f: "mono", align: "center", color: C.dim }); });
  ctx.globalAlpha = 1;
  if (mode === "normal") {   // outbound only: an arrow out through the firewall, a crossed-out inbound arrow
    const a = fadeIn(t, d * 0.7, 0.6); ctx.globalAlpha = a; arrow(640, y - 210, 830, y - 210, C.ink, 4); text("out only", 735, y - 235, { px: 26, f: "mono", align: "center" });
    arrow(830, y - 290, 640, y - 290, C.steel, 3); line([[715, y - 315], [755, y - 265]], C.red, 5); line([[755, y - 315], [715, y - 265]], C.red, 5);
    text("no door opened from outside", 735, y - 330, { px: 26, f: "mono", align: "center", color: C.red }); ctx.globalAlpha = 1; }
  if (mode === "compress") { const a = fadeIn(t, d * 0.3, 0.6); ctx.globalAlpha = a;
    for (const lx of [330, 600, 880, 1215, 1545]) lock(lx, y - 130, 26, C.red);
    text("compressed at the NOC", 1040, y - 160, { px: 32, f: "head", align: "center", color: C.red });
    text("encrypted from end to end", W / 2, y + 330, { px: 40, f: "head", align: "center" });
    text("reliable delivery · efficient use of the network · security", W / 2, y + 380, { px: 28, f: "mono", align: "center", color: C.dim });
    src("RIM annual report (40-F), fiscal 2009", W / 2, 975, a, "center"); ctx.globalAlpha = 1; }
  if (out) {   // the hub fails: messages queue up in front of it, regions dim one by one
    const q = Math.floor(16 * ease(prog(t, 1.2, d * 0.7))); for (let k = 0; k < q; k++) envelope(886 + (k % 2) * 52, y - 40 - Math.floor(k / 2) * 30, 22, k > 9 ? C.red : C.ink, C.bg);
    const regs = ["Europe, Middle East, Africa", "India", "Latin America", "North America"];
    regs.forEach((r, i) => { const at = d * 0.25 + i * d * 0.13, a = fadeIn(t, at, 0.5); if (a <= 0) return; ctx.globalAlpha = a;
      const yy = 175 + i * 52; ctx.beginPath(); ctx.arc(1260, yy - 10, 9, 0, 7); ctx.fillStyle = C.red; ctx.fill();
      text(r, 1285, yy, { px: 32, f: "head", color: i === 3 ? C.red : C.ink }); text(i === 3 ? "problems spread" : "service disrupted", 1285 + measure(r, 32, "head") + 20, yy, { px: 24, f: "mono", color: C.dim }); });
    ctx.globalAlpha = fadeIn(t, 0.6, 0.6); text("OCTOBER 2011", 150, 860, { px: 34, f: "mono", weight: 700, color: C.red });
    text("a core switch failed; the backup did not work as tested", 150, 905, { px: 28, f: "mono", color: C.dim }); ctx.globalAlpha = 1; }
};
/* money: three streams into RIM; mode "thin" squeezes the service fee */
S.flow = (t, d, p) => {
  const thin = p.mode === "thin", rx = 1420, ry = 520;
  const streams = [["the device", "sold once", 300], ["server software", "sold to companies", 520], ["monthly service fee", "per user, every month, via the carrier", 740]];
  rect(rx, ry - 170, 300, 340, C.bg2, 4, C.ink, 3); text("RIM", rx + 150, ry + 22, { px: 80, f: "head", align: "center" });
  streams.forEach(([lab, sub, y], i) => { const a = thin ? 1 : fadeIn(t, 0.4 + i * d * 0.2, 0.6); if (a <= 0) return; ctx.globalAlpha = a;
    let lw = 34; let col = C.bone;
    if (i === 2) { col = C.red; if (thin) lw = lerp(34, 5, ease(prog(t, d * 0.15, d * 0.8))); }
    const g = thin ? 1 : ease(prog(t, 0.4 + i * d * 0.2, 1.6 + i * d * 0.2)), x0 = 620;
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, x0 + (rx - x0) * g, H); ctx.clip();
    ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.lineCap = "butt"; ctx.beginPath(); ctx.moveTo(x0, y); ctx.bezierCurveTo(1000, y, 1100, ry + (i - 1) * 60, rx, ry + (i - 1) * 60); ctx.stroke(); ctx.restore();
    text(lab, 150, y + 4, { px: 46, f: "head", color: i === 2 ? C.red : C.ink }); text(sub, 150, y + 44, { px: 24, f: "mono", color: C.dim, maxW: 460 });
    if (i === 2) { rect(820, y - 50, 170, 100, C.bg, 4, C.bone, 2); text("carrier", 905, y + 10, { px: 28, f: "mono", align: "center" }); } });
  ctx.globalAlpha = 1;
  if (thin) { const a = fadeIn(t, d * 0.3, 0.6); ctx.globalAlpha = a; text("many competitors did not charge such a fee", 150, 900, { px: 32, f: "mono", color: C.ink });
    ctx.globalAlpha = fadeIn(t, d * 0.55, 0.6); text("pressure to cut it · expected to keep falling", 150, 945, { px: 32, f: "mono", color: C.red }); ctx.globalAlpha = 1;
    src("BlackBerry annual report (40-F), fiscal 2013", W - 150, 975, a, "right"); }
  else { const a = fadeIn(t, d * 0.8, 0.6); ctx.globalAlpha = a; text("three ways to earn", rx + 150, ry + 230, { px: 30, f: "mono", align: "center", color: C.dim }); ctx.globalAlpha = 1; }
};
/* the thumb keyboard and messages addressed by PIN (generic, not a real product) */
S.keyboard = (t, d, p) => {
  const a = fadeIn(t, 0.1, 0.6); ctx.globalAlpha = a; const kx = 150, ky = 300, kw = 860, kh = 420; rect(kx, ky, kw, kh, C.bg2, 40, C.bone, 3);
  const rows = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"], press = Math.floor(t * 5) % 26;
  rows.forEach((r, ri) => { const n = r.length, kwid = 72, gap = 10, x0 = kx + (kw - n * (kwid + gap)) / 2; [...r].forEach((ch, ci) => {
    const hot = (ri * 10 + ci) === press && t > 1; rect(x0 + ci * (kwid + gap), ky + 60 + ri * 110, kwid, 88, hot ? C.red : C.card, 16, C.bone, 2);
    text(ch, x0 + ci * (kwid + gap) + kwid / 2, ky + 60 + ri * 110 + 58, { px: 34, f: "body", weight: 700, align: "center", color: hot ? C.bg : C.ink }); }); });
  text("two thumbs, real keys", kx, ky - 40, { px: 34, f: "mono", color: C.dim });
  const b = fadeIn(t, d * 0.42, 0.6); ctx.globalAlpha = b; const bx = 1130, by = 210;
  card(bx, by, 640, 640, "messenger · 2005"); text("to PIN  2A7F 91C0", bx + 40, by + 80, { px: 30, f: "mono", weight: 700, color: C.red });
  text("(an example, not a real PIN)", bx + 40, by + 118, { px: 22, f: "mono", color: C.dim });
  const msgs = [["in the meeting, 5 min", 0], ["ok. sending the file now", 1], ["got it", 0], ["call after?", 1]];
  msgs.forEach(([m, side], i) => { const ai = fadeIn(t, d * 0.5 + i * d * 0.08, 0.4); if (ai <= 0) return; ctx.globalAlpha = b * ai;
    const w = measure(m, 32, "body") + 50, x = side ? bx + 600 - w : bx + 40, y = by + 170 + i * 104; rect(x, y, w, 70, side ? C.bone : C.line, 18);
    text(m, x + 25, y + 46, { px: 32, color: side ? C.bg : C.ink }); });
  ctx.globalAlpha = fadeIn(t, d * 0.75, 0.6); text("addressed by a PIN code, not a phone number", bx + 320, by + 610, { px: 24, f: "mono", color: C.dim, align: "center" });
  ctx.globalAlpha = 1;
};
/* vertical bars, e.g. subscriber accounts */
S.vbars = (t, d, p) => {
  const rows = p.rows, n = rows.length, x0 = 260, x1 = W - 260, base = 860, top = 260, bw = Math.min(220, (x1 - x0) / n * 0.6), step = (d * 0.6) / n;
  ctx.globalAlpha = fadeIn(t, 0.1); text(p.head.toUpperCase(), x0 - 90, 180, { px: 44, f: "head", maxW: 1600 }); line([[x0 - 60, base], [x1 + 60, base]], C.faint, 3);
  rows.forEach((r, i) => { const at = p.ats ? d * p.ats[i] : 0.4 + i * step, g = ease(prog(t, at, at + 0.9)); if (g <= 0) return; const cx = x0 + (x1 - x0) * (i + 0.5) / n, h = (base - top) * r.v / p.max * g;
    ctx.globalAlpha = 1; rect(cx - bw / 2, base - h, bw, h, r.hl ? C.red : C.bone, 2); ctx.globalAlpha = prog(g, 0.6, 1);
    text(r.txt, cx, base - h - 20, { px: 52, f: "head", align: "center", color: r.hl ? C.red : C.ink });
    text(r.label, cx, base + 50, { px: 30, f: "mono", align: "center", color: C.dim, maxW: (x1 - x0) / n - 10 }); });
  ctx.globalAlpha = 1; if (p.foot) src(p.foot, x0 - 90, 975, fadeIn(t, 1));
};
/* horizontal comparison bars (apps), with an optional loop diagram */
S.apps = (t, d, p) => {
  const rows = p.rows, max = Math.max(...rows.map((r) => r.v)), x0 = 150, wmax = 1350;
  ctx.globalAlpha = fadeIn(t, 0.1); text(p.head.toUpperCase(), x0, 200, { px: 44, f: "head", maxW: 1600 });
  const out = p.loop ? 1 - fadeIn(t, d * 0.5, 0.6) : 1;
  rows.forEach((r, i) => { const at = 0.5 + i * d * 0.18, g = ease(prog(t, at, at + 1.0)); if (g <= 0 || out <= 0) return; const y = 380 + i * 220; ctx.globalAlpha = out;
    text(r.label, x0, y, { px: 32, f: "mono", color: C.dim }); rect(x0, y + 20, Math.max(6, wmax * r.v / max * g), 90, r.hl ? C.red : C.bone, 2);
    ctx.globalAlpha = out * prog(g, 0.6, 1); text(r.txt, x0 + Math.max(6, wmax * r.v / max * g) + 24, y + 86, { px: 56, f: "head", color: r.hl ? C.red : C.ink }); });
  ctx.globalAlpha = 1; if (p.foot) src(p.foot, x0, 975, fadeIn(t, 1) * out);
  if (p.loop) { const a = fadeIn(t, d * 0.55, 0.7); if (a <= 0) return; ctx.globalAlpha = a; const cx = W / 2, cy = 560, r = 200;
    ctx.strokeStyle = C.red; ctx.lineWidth = 6; const sweep = ease(prog(t, d * 0.55, d * 0.85)) * Math.PI * 1.75;
    ctx.beginPath(); ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + sweep); ctx.stroke();
    const ea = -Math.PI / 2 + sweep; arrow(cx + r * Math.cos(ea - 0.05), cy + r * Math.sin(ea - 0.05), cx + r * Math.cos(ea), cy + r * Math.sin(ea), C.red, 6, 26);
    text("people", cx, cy - r - 30, { px: 40, f: "head", align: "center" }); text("apps", cx, cy + r + 60, { px: 40, f: "head", align: "center" });
    text("developers build for", cx + r + 30, cy - 10, { px: 30, f: "mono", color: C.dim }); text("the phones people own", cx + r + 30, cy + 26, { px: 30, f: "mono", color: C.dim });
    text("people buy the phones", cx - r - 30, cy - 10, { px: 30, f: "mono", color: C.dim, align: "right" }); text("that have the apps", cx - r - 30, cy + 26, { px: 30, f: "mono", color: C.dim, align: "right" });
    ctx.globalAlpha = 1; }
};
/* the moat: push email as a castle's water; Exchange ActiveSync drops a bridge */
S.moat = (t, d, p) => {
  const a = fadeIn(t, 0.1, 0.6); ctx.globalAlpha = a; const cx = 1250, base = 700;
  rect(cx - 220, base - 360, 440, 360, C.bg2, 0, C.bone, 3); for (let k = 0; k < 5; k++) rect(cx - 220 + k * 98, base - 400, 54, 42, C.bg2, 0, C.bone, 3);
  rect(cx - 50, base - 140, 100, 140, C.bg, 40, C.bone, 3); text("RIM", cx, base - 220, { px: 64, f: "head", align: "center" });
  const drain = ease(prog(t, d * 0.4, d * 0.7)), wl = 90 * (1 - drain * 0.9);
  rect(260, base, 1460, 150, null, 0, C.faint, 2); ctx.fillStyle = "rgba(109,113,121,0.55)"; ctx.fillRect(262, base + 150 - wl - 2, 1456, wl);
  text("push email: RIM's moat", 1520, base + 60, { px: 40, f: "head", color: C.ink, align: "center" });
  const b = ease(prog(t, d * 0.18, d * 0.4)), hx = cx - 230, ang = (1 - b) * 1.25;   // the bridge falls from upright to flat
  ctx.save(); ctx.translate(hx, base); ctx.rotate(-Math.PI + ang); rect(0, -14, 420, 28, C.red, 2); ctx.restore();
  ctx.globalAlpha = a * fadeIn(t, d * 0.35, 0.5); text("Exchange ActiveSync", hx - 230, base - 60, { px: 42, f: "head", color: C.red, align: "center" });
  text("push email on another phone · March 2008", hx - 230, base - 20, { px: 24, f: "mono", color: C.dim, align: "center" });
  ctx.globalAlpha = fadeIn(t, d * 0.68, 0.6); text("and the App Store: a phone as a small computer", W / 2, 230, { px: 44, f: "head", align: "center" });
  text("full of other people's software", W / 2, 280, { px: 28, f: "mono", color: C.dim, align: "center" }); ctx.globalAlpha = 1;
};
/* revenue bars by fiscal year with the devices line; used as a full scene or inside a box */
function revenueChart(t, d, p, box) {
  const R = EP.data.revenue, i0 = p.from || 0, i1 = p.to ?? R.length - 1, rows = R.slice(i0, i1 + 1), n = rows.length;
  const [bx, by, bw, bh] = box, vmax = 20000, dmax = 60, slot = bw / n, X = (i) => bx + slot * (i + 0.5), Y = (v) => by + bh - v / vmax * bh;
  const grow = p.grow ?? 0, gstep = (d * (p.gspan || 0.55)) / Math.max(1, n - grow), gat = (i) => i < grow ? -1 : d * (p.gat ?? 0.1) + (i - grow) * gstep;
  for (let g = 0; g <= vmax; g += 5000) { line([[bx, Y(g)], [bx + bw, Y(g)]], g ? C.line : C.faint, g ? 1.5 : 3); text(`$${g / 1000}bn`, bx - 14, Y(g) + 9, { px: 24, f: "mono", color: C.dim, align: "right" }); }
  if (p.devices) for (let g = 0; g <= dmax; g += 20) text(`${g}m`, bx + bw + 14, by + bh - g / dmax * bh + 9, { px: 24, f: "mono", color: C.red });
  const dev = Object.fromEntries(EP.data.devices.map((x) => [x.fy, x])), pts = [];
  rows.forEach((r, i) => { const g = gat(i) < 0 ? 1 : ease(prog(t, gat(i), gat(i) + 0.7)); const w = slot * 0.66, h = r.v / vmax * bh * g, x = X(i) - w / 2;
    if (g > 0) { rect(x, by + bh - h, w, h, r.cont ? null : ((p.hl || []).includes(r.fy) ? C.ink : C.bone), 1, r.cont ? C.bone : null, 2);
      if (r.cont) { ctx.save(); ctx.beginPath(); ctx.rect(x, by + bh - h, w, h); ctx.clip(); ctx.strokeStyle = C.bone; ctx.lineWidth = 2;
        for (let k = -h; k < w; k += 9) { ctx.beginPath(); ctx.moveTo(x + k, by + bh); ctx.lineTo(x + k + h, by + bh - h); ctx.stroke(); } ctx.restore(); } }
    const lab = (p.labels || []).includes(r.fy); if (lab && g > 0.7) { ctx.globalAlpha = prog(g, 0.7, 1); text(r.v >= 1000 ? `$${(r.v / 1000).toFixed(1)}bn` : `$${r.v.toFixed(0)}m`, X(i), by + bh - h - 16, { px: n > 12 ? 26 : 34, f: "head", align: "center" }); ctx.globalAlpha = 1; }
    text(n > 12 ? `'${r.fy.slice(4)}` : `FY${r.fy.slice(4)}`, X(i), by + bh + 36, { px: n > 12 ? 22 : 26, f: "mono", color: C.dim, align: "center" });
    if (p.devices && dev[r.fy] && g > 0.5) pts.push([X(i), by + bh - dev[r.fy].v / dmax * bh, dev[r.fy], g]); });
  if (p.devices && pts.length) { line(pts.map((q) => [q[0], q[1]]), C.red, 4);
    pts.forEach(([x, y, dv]) => { ctx.beginPath(); ctx.arc(x, y, 8, 0, 7); ctx.fillStyle = dv.recognised ? C.bg : C.red; ctx.fill(); ctx.strokeStyle = C.red; ctx.lineWidth = 3; ctx.stroke(); });
    const last = pts[pts.length - 1]; if (p.devlab) (p.devlab).forEach((fy) => { const q = pts.find((z) => z[2].fy === fy); if (q) { const lastPt = q === pts[pts.length - 1] && pts.length === n; const lab = `${q[2].v.toFixed(1)}m`, lw = measure(lab, 26, "mono", 700), lx = q[0] + (lastPt ? -14 - lw : 14), ly = q[1] + (lastPt ? 34 : -14); rect(lx - 6, ly - 24, lw + 12, 32, C.bg, 3); text(lab, lx, ly, { px: 26, f: "mono", weight: 700, color: C.red }); } });
    void last; }
  if (p.iphone) { const fi = R.findIndex((r) => r.fy === "FY2007") - i0; if (fi >= 0 && fi < n) { const a = fadeIn(t, d * (p.iphoneAt ?? 0.05), 0.6), xi = bx + slot * (fi + 0.85);
    ctx.globalAlpha = a; line([[xi, by - 10], [xi, by + bh]], C.red, 3, [10, 8]); text("iPhone announced", xi + 10, by + 20, { px: 28, f: "head", color: C.red });
    text("9 Jan 2007", xi + 10, by + 52, { px: 22, f: "mono", color: C.red }); ctx.globalAlpha = 1; } }
}
S.revenue = (t, d, p) => {
  const box = p.box || [230, 230, 1460, 610];
  ctx.globalAlpha = fadeIn(t, 0.1); text("RIM / BLACKBERRY: REVENUE BY FISCAL YEAR" + (p.devices ? ", AND DEVICES SOLD" : ""), 170, 170, { px: 42, f: "head", maxW: 1560 }); ctx.globalAlpha = 1;
  revenueChart(t, d, p, box);
  let foot = "Bars: revenue, USD. Fiscal years end late Feb / early Mar.";
  if (p.devices) foot += " Line: devices sold, millions" + (EP.data.devices.some((x) => x.recognised) && (p.to ?? 99) >= 8 ? " (hollow = recognised, not shipped)." : ".");
  if ((p.to ?? 99) >= 19) foot += " Hatched: continuing operations, after the Cylance sale.";
  src(foot, 170, 940, fadeIn(t, 0.8)); src("Source: RIM / BlackBerry annual reports (40-F, 10-K), SEC EDGAR", 170, 975, fadeIn(t, 0.8));
  if (p.peak) { const a = fadeIn(t, d * (p.peakAt ?? 0.8), 0.6); stamp(p.peak, 1120, 290, a); }
};
/* smartphone share line (Gartner, via press reports): filled = full year, hollow = one quarter */
function shareChart(t, d, p, box) {
  const [bx, by, bw, bh] = box, x0 = 2008, x1 = 2017.1, vmax = 25, X = (v) => bx + (v - x0) / (x1 - x0) * bw, Y = (v) => by + bh - v / vmax * bh;
  for (let g = 0; g <= vmax; g += 5) { line([[bx, Y(g)], [bx + bw, Y(g)]], g ? C.line : C.faint, g ? 1.5 : 3); text(`${g}%`, bx - 14, Y(g) + 9, { px: 24, f: "mono", color: C.dim, align: "right" }); }
  for (let yr = 2008; yr <= 2016; yr += (bw < 900 ? 2 : 1)) text(String(yr), X(yr + 0.5), by + bh + 36, { px: 22, f: "mono", color: C.dim, align: "center" });
  const pts = EP.data.share.slice(0, p.upto ?? 99), step = (d * 0.55) / Math.max(1, pts.length - (p.from || 0)), at0 = p.atF != null ? d * p.atF : (p.at || 0.6);
  const vis = pts.map((s, i) => [s, i < (p.from || 0) ? 1 : fadeIn(t, p.ats ? d * p.ats[i] : at0 + (i - (p.from || 0)) * step, 0.5)]).filter(([, a]) => a > 0);
  if (vis.length > 1) line(vis.map(([s]) => [X(s.x), Y(s.v)]), C.ink, 4);
  vis.forEach(([s, a], i) => { ctx.globalAlpha = a; ctx.beginPath(); ctx.arc(X(s.x), Y(s.v), 10, 0, 7); ctx.fillStyle = s.quarter ? C.bg : C.ink; ctx.fill(); ctx.strokeStyle = C.ink; ctx.lineWidth = 3; ctx.stroke();
    const lab = (s.v < 1 ? s.v.toFixed(2) : s.v.toFixed(1)) + "%", big = bw > 900; const px = big ? 32 : 26;
    if (s.quarter) { text(lab, X(s.x) + 16, Y(s.v) - 40, { px, f: "head", color: C.red }); text(`${s.period}, quarter`, X(s.x) + 16, Y(s.v) - 12, { px: big ? 24 : 20, f: "mono", color: C.red }); }
    else text(lab, X(s.x), Y(s.v) - 22, { px, f: "head", align: "center", color: (p.hl || []).includes(s.period) ? C.red : C.ink }); void i; });
  ctx.globalAlpha = 1;
  if (p.android) { const A = EP.data.facts.android_share, a = fadeIn(t, d * (p.androidAt ?? 0.6), 0.6); ctx.globalAlpha = a;
    line([[X(2009.5), Y(A.CY2009)], [X(2010.5), Y(A.CY2010)]], C.steel, 3, [10, 8]);
    [[2009.5, A.CY2009], [2010.5, A.CY2010]].forEach(([x, v]) => { ctx.beginPath(); ctx.arc(X(x), Y(v), 7, 0, 7); ctx.fillStyle = C.steel; ctx.fill(); text(`${v}%`, X(x) + 16, Y(v) + 9, { px: 28, f: "head", color: C.dim }); });
    text("Android", X(2010.5) + 16, Y(A.CY2010) - 26, { px: 28, f: "mono", weight: 700, color: C.dim }); ctx.globalAlpha = 1; }
  text("Gartner, via press reports", bx + bw, by - 16, { px: 22, f: "mono", color: C.dim, align: "right" });
}
S.share = (t, d, p) => {
  ctx.globalAlpha = fadeIn(t, 0.1); text("BLACKBERRY'S SHARE OF SMARTPHONES SOLD WORLDWIDE", 170, 170, { px: 42, f: "head", maxW: 1560 }); ctx.globalAlpha = 1;
  shareChart(t, d, p, [230, 250, 1460, 600]);
  src("Gartner, via press reports: sales to end users by operating system. Filled point = full calendar year; hollow = one quarter.", 170, 940, fadeIn(t, 0.8));
  src("BlackBerry OS only: BlackBerry-branded Android phones are not counted.", 170, 975, fadeIn(t, 0.8));
  if (p.note) { const a = fadeIn(t, d * (p.noteAt ?? 0.75), 0.6); ctx.globalAlpha = a; text(p.note, 1690, 330, { px: 40, f: "head", color: C.red, align: "right" }); ctx.globalAlpha = 1; }
};
/* revenue and share side by side (the chart returns in chapter 4) */
S.combo = (t, d, p) => {
  ctx.globalAlpha = fadeIn(t, 0.1); text("REVENUE AND DEVICES", 170, 170, { px: 40, f: "head" }); text("SHARE OF SMARTPHONES SOLD", 1180, 170, { px: 40, f: "head" }); ctx.globalAlpha = 1;
  revenueChart(t, d, Object.assign({}, p.rev), [230, 260, 760, 580]);
  const a = fadeIn(t, d * (p.shareAt ?? 0.55), 0.6); ctx.globalAlpha = a; shareChart(t, d, Object.assign({ at: d * (p.shareAt ?? 0.55) + 0.2 }, p.share), [1240, 260, 540, 580]); ctx.globalAlpha = 1;
  src("Revenue and devices: RIM / BlackBerry 40-F filings. Hollow device point: recognised, not shipped.", 170, 940, fadeIn(t, 0.8));
  src("Share: Gartner, via press reports. Hollow share point: Q4 2011, one quarter (no full-year 2011 figure found).", 170, 975, fadeIn(t, 0.8));
};
/* market value bars */
S.valuebars = (t, d, p) => {
  const MV = EP.data.market_value, rows = p.bars.map((b) => Object.assign({}, b, MV[b.k])), n = rows.length, max = 85, base = 820, top = 260;
  const x0 = 380, x1 = W - 380, bw = Math.min(260, (x1 - x0) / n * 0.55), step = (d * 0.55) / n;
  ctx.globalAlpha = fadeIn(t, 0.1); text((p.head || "What the stock market said it was worth").toUpperCase(), 170, 170, { px: 42, f: "head" }); line([[x0 - 80, base], [x1 + 80, base]], C.faint, 3);
  rows.forEach((r, i) => { const at = p.ats ? d * p.ats[i] : 0.4 + i * step, g = ease(prog(t, at, at + 1.0)); if (g <= 0) return; const cx = x0 + (x1 - x0) * (i + 0.5) / n, h = Math.max(4, (base - top) * r.v / max * g), last = i === n - 1;
    ctx.globalAlpha = 1; rect(cx - bw / 2, base - h, bw, h, last ? C.red : C.bone, 2); ctx.globalAlpha = prog(g, 0.6, 1);
    text(`$${r.v >= 10 ? r.v.toFixed(0) : r.v.toFixed(1)}bn`, cx, base - h - 22, { px: 64, f: "head", align: "center", color: last ? C.red : C.ink });
    text(r.label, cx, base + 50, { px: 30, f: "head", align: "center", color: C.ink }); text(r.sub || "", cx, base + 88, { px: 22, f: "mono", align: "center", color: C.dim }); });
  ctx.globalAlpha = 1; src(p.foot || "Our estimates: closing share price x shares outstanding from the company's filings. Prices: Yahoo Finance.", 170, 975, fadeIn(t, 1));
  if (p.stamp) stamp(p.stamp, W - 420, 330, fadeIn(t, d * 0.7, 0.4));
};
/* cold open: a generic keyboard phone cracks; a dashboard glows behind it */
S.coldopen = (t, d, p) => {
  const glow = ease(prog(t, d * 0.45, d * 0.9)), cx = W / 2;
  if (glow > 0) { ctx.globalAlpha = glow; const g = ctx.createRadialGradient(cx, 640, 40, cx, 640, 640); g.addColorStop(0, "rgba(231,224,207,0.16)"); g.addColorStop(1, "rgba(231,224,207,0)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); ctx.strokeStyle = C.bone; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(180, 900); ctx.quadraticCurveTo(cx, 470, W - 180, 900); ctx.stroke();
    rect(cx - 220, 610, 440, 220, "rgba(207,200,184,0.08)", 10, C.bone, 3); for (const k of [-1, 1]) { ctx.beginPath(); ctx.arc(cx + k * 520, 760, 110, 0, 7); ctx.stroke(); }
    line([[cx - 170, 720], [cx + 170, 720]], C.dim, 3); line([[cx - 170, 770], [cx + 80, 770]], C.dim, 3); text("software in the car", cx, 880, { px: 28, f: "mono", color: C.bone, align: "center" }); }
  const crack = ease(prog(t, d * 0.25, d * 0.42)), split = ease(prog(t, d * 0.42, d * 0.75)), fade = 1 - 0.85 * split;
  const pw = 300, ph = 560, px0 = cx - pw / 2, py0 = 170 + split * 120;
  const halves = [[-1, 0], [1, pw / 2]];
  halves.forEach(([s, off]) => { ctx.save(); ctx.globalAlpha = fadeIn(t, 0.1, 0.8) * fade; ctx.translate(s * split * 90, 0); ctx.rotate(s * split * 0.06);
    ctx.beginPath(); ctx.rect(px0 + off, 0, pw / 2, H); ctx.clip(); phoneKB(px0, py0, pw, ph, C.ink); ctx.restore(); });
  if (crack > 0 && split < 1) { ctx.globalAlpha = 1 - split; const zz = [[0, 0], [-14, 0.12], [12, 0.25], [-10, 0.4], [16, 0.55], [-8, 0.72], [10, 0.86], [0, 1]];
    const pts = zz.filter((z) => z[1] <= crack).map(([dx, f]) => [cx + dx, py0 + f * ph]); if (pts.length > 1) line(pts, C.red, 5); }
  ctx.globalAlpha = fadeIn(t, d * 0.3, 0.6); text(`−${Math.floor(EP.data.derived.drop_pct)}%`, 210, 330, { px: 150, f: "head", color: C.red });
  text("of its stock-market value", 214, 380, { px: 28, f: "mono", color: C.dim }); ctx.globalAlpha = 1;
};
/* storm: a generic touchscreen slab that clicks when pressed, and the quote */
S.storm = (t, d, p) => {
  const a = fadeIn(t, 0.1, 0.6), cyc = 1.6, ph = (t % cyc) / cyc, press = ph > 0.4 && ph < 0.6 ? 1 : 0; ctx.globalAlpha = a;
  const x = 230, y = 220, w = 300, h = 560; phoneSlab(x, y + press * 8, w, h, C.ink); if (press) { ctx.beginPath(); ctx.arc(x + w / 2, y + h * 0.45, 60, 0, 7); ctx.strokeStyle = C.red; ctx.lineWidth = 4; ctx.stroke();
    text("click", x + w / 2, y + h * 0.45 + 10, { px: 30, f: "mono", weight: 700, color: C.red, align: "center" }); }
  text("the whole screen clicked", x + w / 2, y + h + 60, { px: 26, f: "mono", color: C.dim, align: "center" }); text("like a button", x + w / 2, y + h + 92, { px: 26, f: "mono", color: C.dim, align: "center" });
  quoteBox(t, d, p.quote, [700, 230, 1060, 360], d * 0.35);
  const b = fadeIn(t, d * 0.65, 0.6); ctx.globalAlpha = b; text("REVIEWERS REPORTED", 700, 700, { px: 30, f: "mono", weight: 700, color: C.red });
  ["software bugs", "lag", "an awkward on-screen keyboard"].forEach((s, i) => { const bi = fadeIn(t, d * 0.68 + i * 0.5, 0.4); ctx.globalAlpha = b * bi; const xx = 700 + [0, 300, 470][i];
    rect(xx, 730, measure(s, 32, "head") + 40, 64, null, 3, C.bone, 2); text(s, xx + 20, 773, { px: 32, f: "head" }); });
  ctx.globalAlpha = 1;
};
/* attributed text card; `quote` = {lines, who, where} */
function quoteBox(t, d, q, box, at = 0.2) {
  const [x, y, w, h] = box, a = fadeIn(t, at, 0.6); if (a <= 0) return; ctx.globalAlpha = a; paperCard(x, y + (1 - a) * 14, w, h);
  const px = q.px || 46, lh = px * 1.3; let ty = y + 70 + px * 0.4;
  text("“", x + 40, y + 96, { px: 120, f: "head", color: C.red });
  q.lines.forEach((l, i) => { const ai = fadeIn(t, at + 0.2 + i * 0.25, 0.4); ctx.globalAlpha = a * ai; text(l, x + 110, ty + i * lh, { px, f: "mono", weight: 700, color: C.paperInk, maxW: w - 150 }); });
  ctx.globalAlpha = a * fadeIn(t, at + 0.4 + q.lines.length * 0.25, 0.5); line([[x + 110, y + h - 92], [x + 190, y + h - 92]], C.red, 4);
  text(q.who, x + 110, y + h - 52, { px: 30, f: "head", color: C.paperInk, maxW: w - 150 }); text(q.where, x + 110, y + h - 20, { px: 22, f: "mono", color: C.paperDim, maxW: w - 150 });
  ctx.globalAlpha = 1;
}
S.quote = (t, d, p) => {
  const n = p.quote.lines.length, px = p.quote.px || 50, h = n * px * 1.3 + 220, w = p.w || 1500, x = (W - w) / 2, y = 520 - h / 2;
  if (p.head) { ctx.globalAlpha = fadeIn(t, 0.1); text(p.head.toUpperCase(), x, y - 50, { px: 34, f: "mono", weight: 700, color: C.red }); ctx.globalAlpha = 1; }
  quoteBox(t, d, p.quote, [x, y, w, h], 0.3);
  if (p.foot) { ctx.globalAlpha = fadeIn(t, d * (p.footAt || 0.6), 0.6); p.foot.forEach((f, i) => text(f, W / 2, y + h + 80 + i * 48, { px: i ? 30 : 40, f: i ? "mono" : "head", align: "center", color: i ? C.dim : C.ink, maxW: 1700 })); ctx.globalAlpha = 1; }
};
/* figures: big numbers stacked like entries in a file */
S.figures = (t, d, p) => {
  const n = p.items.length, lh = p.lh || 190, y0 = 540 - (n - 1) * lh / 2 + 30, step = (d * 0.6) / n;
  if (p.head) { ctx.globalAlpha = fadeIn(t, 0.1); text(p.head.toUpperCase(), 250, y0 - 150, { px: 34, f: "mono", weight: 700, color: C.red }); ctx.globalAlpha = 1; }
  p.items.forEach((it, i) => { const a = fadeIn(t, p.ats ? d * p.ats[i] : 0.3 + i * step, 0.6); if (a <= 0) return; ctx.globalAlpha = a; const y = y0 + i * lh;
    line([[250, y + 40], [W - 250, y + 40]], C.line, 2); const bw = text(it.big, 250, y, { px: it.px || 100, f: "head", color: it.hot ? C.red : C.ink, maxW: 900 });
    text(it.small, 250 + Math.min(bw, 900) + 40, y - 8, { px: 36, f: "head", color: C.dim, maxW: W - 540 - Math.min(bw, 900) }); });
  ctx.globalAlpha = 1; if (p.src) src(p.src, 250, 975, fadeIn(t, 0.8)); if (p.stamp) stamp(p.stamp, W - 430, 230, fadeIn(t, d * 0.75, 0.4));
};
/* QNX slides in under a tablet and a phone */
S.qnx = (t, d, p) => {
  const a = fadeIn(t, 0.1, 0.6); ctx.globalAlpha = a; text("9 APRIL 2010 · RIM AGREES TO BUY QNX SOFTWARE SYSTEMS FROM HARMAN", 170, 180, { px: 30, f: "mono", weight: 700, color: C.red, maxW: 1580 });
  const s = ease(prog(t, d * 0.15, d * 0.45)), bx = lerp(-700, 560, s); rect(bx, 700, 800, 150, C.paper, 3); text("Q N X", bx + 400, 790, { px: 80, f: "head", color: C.paperInk, align: "center" });
  text("small, reliable operating system for embedded machines", bx + 400, 835, { px: 24, f: "mono", color: C.paperDim, align: "center" });
  const o = fadeIn(t, d * 0.45, 0.8); ctx.globalAlpha = a * (0.25 + 0.75 * o); tablet(620, 330, 440, 320, o > 0.5 ? C.ink : C.steel); phoneSlab(1150, 330, 170, 320, o > 0.5 ? C.ink : C.steel);
  ctx.globalAlpha = a * o; text("1 · a tablet", 840, 690, { px: 28, f: "mono", align: "center" }); text("2 · new phones", 1235, 690, { px: 28, f: "mono", align: "center" });
  ctx.globalAlpha = fadeIn(t, d * 0.7, 0.6); text("already strong in cars", 170, 930, { px: 40, f: "head", color: C.red }); ctx.globalAlpha = 1;
};
/* the tablet that needed a phone for email */
S.bridge = (t, d, p) => {
  const a = fadeIn(t, 0.1, 0.6); ctx.globalAlpha = a; tablet(200, 300, 700, 470); phoneKB(1380, 330, 220, 420);
  text("tablet, April 2011", 550, 840, { px: 28, f: "mono", align: "center", color: C.dim }); text("BlackBerry phone", 1490, 840, { px: 28, f: "mono", align: "center", color: C.dim });
  const link = ease(prog(t, d * 0.35, d * 0.55)); line([[900, 530], [lerp(900, 1380, link), 530]], C.red, 5, [16, 10]);
  if (link > 0.9) { text("Bridge", 1140, 505, { px: 40, f: "head", color: C.red, align: "center" }); envelope(550, 535, 70, C.red); }
  else { ctx.globalAlpha = a * fadeIn(t, d * 0.12, 0.5); text("no built-in email app", 550, 545, { px: 40, f: "head", align: "center", color: C.dim }); }
  ctx.globalAlpha = fadeIn(t, d * 0.75, 0.6); text("built-in email, calendar and contacts came later, in software 2.0", W / 2, 960, { px: 30, f: "mono", align: "center" }); ctx.globalAlpha = 1;
};
/* the office: identical keyboard phones become a mixed row of phones */
S.byod = (t, d, p) => {
  const m = ease(prog(t, d * 0.35, d * 0.65)), n = 6, x0 = 250, gap = 250;
  ctx.globalAlpha = fadeIn(t, 0.1); rect(150, 760, W - 300, 24, C.bg2, 2, C.line, 2);
  for (let i = 0; i < n; i++) { const x = x0 + i * gap; ctx.globalAlpha = 1 - m; phoneKB(x, 400, 150, 340, C.bone);
    ctx.globalAlpha = m; const ws = [150, 170, 140, 180, 155, 165][i], hs = [340, 360, 320, 350, 330, 355][i]; phoneSlab(x + (150 - ws) / 2, 740 - hs, ws, hs, i === 2 ? C.bone : C.ink); }
  ctx.globalAlpha = 1 - m; text("IT department rule: carry a BlackBerry", W / 2, 260, { px: 46, f: "head", align: "center" });
  ctx.globalAlpha = m; text("new rule: choose your own phone", W / 2, 260, { px: 46, f: "head", align: "center", color: C.red });
  text("bring your own device", W / 2, 310, { px: 28, f: "mono", align: "center", color: C.dim });
  ctx.globalAlpha = 1; src("BlackBerry annual report (40-F)", 150, 975, fadeIn(t, 1));
};
/* 207,900 of 432 million: the sliver */
S.sliver = (t, d, p) => {
  const F = EP.data.facts.q4_2016, share = F.bb_units / (F.total_m * 1e6), side = 640, x = 260, y = 230, a = fadeIn(t, 0.1, 0.6);
  ctx.globalAlpha = a; rect(x, y, side, side, "rgba(207,200,184,0.12)", 0, C.bone, 2); text(`${fmt(F.total_m * 1e6)}`, x, y - 70, { px: 54, f: "head" });
  text("smartphones sold worldwide, Oct–Dec 2016", x, y - 30, { px: 24, f: "mono", color: C.dim });
  const s = side * Math.sqrt(share), g = fadeIn(t, d * 0.35, 0.6); ctx.globalAlpha = g; rect(x + side - s, y + side - s, s, s, C.red);
  line([[x + side - s / 2, y + side - s / 2], [1080, 640]], C.red, 3); ctx.beginPath(); ctx.arc(x + side - s / 2, y + side - s / 2, 26, 0, 7); ctx.strokeStyle = C.red; ctx.lineWidth = 3; ctx.stroke();
  text(fmt(F.bb_units), 1100, 640, { px: 110, f: "head", color: C.red }); text("ran BlackBerry's own system", 1104, 690, { px: 30, f: "mono", color: C.ink });
  ctx.globalAlpha = fadeIn(t, d * 0.6, 0.6); text(`about ${EP.data.derived.q4_2016_share_pct.toFixed(2)}%`, 1100, 820, { px: 72, f: "head" }); text("Gartner's table rounds it to 0.0%", 1104, 870, { px: 30, f: "mono", color: C.dim });
  ctx.globalAlpha = 1; src("Gartner, via press reports (Global News, Feb 2017). The red square is drawn to scale.", 260, 975, fadeIn(t, 1));
};
/* the car: a side outline with the dashboard screen and driver-assistance sensors */
S.car = (t, d, p) => {
  const a = fadeIn(t, 0.1, 0.6); ctx.globalAlpha = a; const ox = 160, oy = 380;
  ctx.strokeStyle = C.bone; ctx.lineWidth = 4; ctx.lineJoin = "round"; ctx.beginPath();
  ctx.moveTo(ox, oy + 260); ctx.lineTo(ox, oy + 170); ctx.quadraticCurveTo(ox + 20, oy + 120, ox + 170, oy + 105); ctx.lineTo(ox + 330, oy + 20);
  ctx.quadraticCurveTo(ox + 470, oy - 30, ox + 640, oy + 20); ctx.lineTo(ox + 800, oy + 110); ctx.quadraticCurveTo(ox + 960, oy + 130, ox + 990, oy + 200); ctx.lineTo(ox + 990, oy + 260); ctx.closePath(); ctx.stroke();
  for (const wx of [ox + 200, ox + 800]) { ctx.beginPath(); ctx.arc(wx, oy + 260, 72, 0, 7); ctx.fillStyle = C.bg; ctx.fill(); ctx.stroke(); }
  line([[ox + 350, oy + 40], [ox + 480, oy + 40], [ox + 480, oy + 105], [ox + 230, oy + 105]], C.faint, 3);
  const s = fadeIn(t, d * 0.2, 0.6); ctx.globalAlpha = a * s; rect(ox + 520, oy + 50, 120, 60, C.redDim, 4, C.red, 3); text("cockpit screen", ox + 580, oy - 40, { px: 24, f: "mono", color: C.red, align: "center" });
  line([[ox + 580, oy - 30], [ox + 580, oy + 48]], C.red, 2);
  const r = fadeIn(t, d * 0.35, 0.6); ctx.globalAlpha = a * r; for (const [sx, sy, dir] of [[ox + 995, oy + 200, 1], [ox - 5, oy + 200, -1]]) {
    for (let k = 1; k <= 3; k++) { ctx.beginPath(); ctx.arc(sx, sy, k * 34 + ((t * 40) % 34), dir > 0 ? -0.5 : Math.PI - 0.5, dir > 0 ? 0.5 : Math.PI + 0.5); ctx.strokeStyle = C.red; ctx.lineWidth = 3; ctx.globalAlpha = a * r * (1 - k / 4); ctx.stroke(); } }
  ctx.globalAlpha = a * r; text("driver-assistance sensors", ox + 1060, oy + 290, { px: 24, f: "mono", color: C.red });
  const c = fadeIn(t, d * 0.15, 0.6); ctx.globalAlpha = c; const F = EP.data.facts, v = F.vehicles_m * 1e6 * ease(prog(t, d * 0.15, d * 0.5));
  counter(v, 1760, 250, 104, C.ink, "+", "right"); text("vehicles with QNX technology", 1760, 300, { px: 28, f: "mono", color: C.dim, align: "right" });
  ctx.globalAlpha = fadeIn(t, d * 0.55, 0.6); text(`${F.carmakers}+ carmakers, including the top 10`, 1760, 385, { px: 40, f: "head", align: "right" });
  ctx.globalAlpha = fadeIn(t, d * 0.75, 0.6); text("paid largely as royalties, as the cars are built", 1760, 430, { px: 26, f: "mono", color: C.dim, align: "right" });
  ctx.globalAlpha = 1; src("BlackBerry annual report (10-K), fiscal 2026", 160, 975, fadeIn(t, 1));
};
/* one 100% bar split into segments, with an optional side card */
S.splitbar = (t, d, p) => {
  const x = 170, y = 420, w = W - 340, h = 150, tot = p.parts.reduce((s, q) => s + q.v, 0);
  ctx.globalAlpha = fadeIn(t, 0.1); text(p.head.toUpperCase(), x, 220, { px: 44, f: "head", maxW: 1580 }); const tw = text(p.total, x, 300, { px: 72, f: "head", color: C.ink }); if (p.total2) text(p.total2, x + tw + 40, 296, { px: 30, f: "mono", color: C.dim });
  let cx = x; p.parts.forEach((q, i) => { const g = ease(prog(t, 0.6 + i * d * 0.16, 1.4 + i * d * 0.16)), ww = w * q.v / tot; if (g <= 0) { cx += ww; return; } ctx.globalAlpha = 1;
    rect(cx, y, ww * g, h, q.col === "red" ? C.red : q.col === "steel" ? C.steel : C.bone, 0); ctx.globalAlpha = prog(g, 0.6, 1);
    const lx = ww > 200 ? cx + 24 : cx + ww - 4, al = ww > 200 ? "left" : "right", ly = ww > 200 ? y + h + 70 : y + h + 70 + 0;
    text(q.label, lx, ly, { px: 40, f: "head", align: al, color: q.col === "red" ? C.red : C.ink }); text(q.txt, lx, ly + 44, { px: 30, f: "mono", align: al, color: C.dim }); cx += ww; });
  ctx.globalAlpha = 1; if (p.card) { const a = fadeIn(t, d * 0.72, 0.6); ctx.globalAlpha = a; card(W - 700, 760, 530, 150, p.card[0]); text(p.card[1], W - 670, 850, { px: 52, f: "head", color: C.red }); text(p.card[2], W - 670, 890, { px: 24, f: "mono", color: C.dim }); ctx.globalAlpha = 1; }
  if (p.src) src(p.src, x, 975, fadeIn(t, 1));
};
/* then and now: one row per measure, peak against latest, on a shared scale within each row */
S.ledger = (t, d, p) => {
  ctx.globalAlpha = fadeIn(t, 0.1); text("THEN AND NOW", 170, 175, { px: 48, f: "head" }); ctx.fillStyle = C.red; ctx.fillRect(170, 195, 140, 5); ctx.globalAlpha = 1;
  const x0 = 640, wmax = 760; const RA = (i) => p.ats ? d * p.ats[i] : 0.4 + i * d * 0.25;
  p.rows.forEach((r, i) => { const y = 280 + i * 230, a = p.instant ? 1 : fadeIn(t, RA(i), 0.6); if (a <= 0) return; ctx.globalAlpha = a;
    text(r.label, 170, y + 50, { px: 50, f: "head" }); text(r.unit || "", 170, y + 90, { px: 22, f: "mono", color: C.dim });
    const max = Math.max(...r.bars.map((b) => b.v)); r.bars.forEach((b, k) => { const ba = b.late ? fadeIn(t, d * (p.lateAt ?? 0.3), 0.6) : (p.instant ? 1 : ease(prog(t, RA(i) + 0.2 + k * (p.kgap || 0.6), RA(i) + 1.0 + k * (p.kgap || 0.6))));
      if (ba <= 0) return; ctx.globalAlpha = a * (b.late ? ba : 1); const yy = y + k * 62, ww = Math.max(5, wmax * b.v / max * (b.late ? 1 : ba));
      rect(x0, yy, ww, 46, b.late ? null : (k === 0 ? C.bone : C.red), 1, b.late ? C.red : null, 3);
      text(b.txt, x0 + ww + 18, yy + 37, { px: 38, f: "head", color: k === 0 ? C.ink : C.red }); text(b.when, x0 + ww + 28 + measure(b.txt, 38, "head"), yy + 36, { px: 22, f: "mono", color: C.dim }); }); });
  ctx.globalAlpha = 1; if (p.src) src(p.src, 170, 975, fadeIn(t, 1));
};
S.endcard = (t, d, p) => {
  text("WHERE THEY FELL", 150, 300, { px: 128, f: "head" }); ctx.fillStyle = C.red; ctx.fillRect(154, 330, measure("WHERE THEY FELL", 128, "head") * ease(prog(t, 0.3, 1.3)), 7);
  text("Tech companies, told through the decisions", 154, 400, { px: 32, f: "mono", color: C.bone }); text("they made and the numbers that followed.", 154, 442, { px: 32, f: "mono", color: C.bone });
  text("Sources and the data behind every chart are in the description.", 154, 900, { px: 28, f: "mono", color: C.dim });
  ctx.setLineDash([10, 10]); rect(1220, 170, 560, 315, null, 4, C.faint, 3); ctx.beginPath(); ctx.arc(1500, 720, 160, 0, 7); ctx.strokeStyle = C.faint; ctx.stroke(); ctx.setLineDash([]);
};

/* ---------- frame ---------- */
function rulerX(y) { return 130 + (y - Y0) / (Y1 - Y0) * (W - 260); }
function renderAt(T) {
  const tl = EP.timeline.beats; let k = 0;
  while (k < tl.length - 1 && T >= tl[k + 1].start) k++;
  const b = tl[k], beat = EP.storyboard.beats[k], t = Math.max(0, T - b.start), last = k === tl.length - 1, d = last ? (EP.timeline.total - b.start) : b.dur;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
  const dr = (T * 2) % 120; ctx.drawImage(background(), -dr, 0);
  const g = ctx.createRadialGradient(W / 2, H / 2, 300, W / 2, H / 2, 1250); g.addColorStop(0, "rgba(14,15,17,0)"); g.addColorStop(1, "rgba(0,0,0,0.6)"); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const edge = Math.min(ease(prog(t, 0, 0.35)), last ? 1 : 1 - ease(prog(t, d - 0.25, d)));
  const z = 1 + 0.01 * prog(t, 0, d) + 0.02 * (1 - edge);
  ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(z, z); ctx.translate(-W / 2, -H / 2);
  S[beat.scene](t, b.speech + 0.01, beat.p || {});
  ctx.restore(); ctx.globalAlpha = 1;
  if (edge < 1) { ctx.globalAlpha = 1 - edge; ctx.fillStyle = C.bg; ctx.fillRect(0, 100, W, H - 100 - 70); ctx.globalAlpha = 1; }
  // header: chapter tab on the left, the case on the right
  if (beat.chapter) { const fresh = k === 0 || EP.storyboard.beats[k - 1].chapter !== beat.chapter, s1 = fresh ? ease(prog(t, 0.05, 0.6)) : 1;
    const label = beat.chapter.toUpperCase(), w = measure(label, 24, "mono", 700) + 44; ctx.globalAlpha = s1;
    rect(60 - (1 - s1) * 40, 36, w, 46, C.bg2, 2, C.line, 2); ctx.fillStyle = C.red; ctx.fillRect(60 - (1 - s1) * 40, 36, 6, 46);
    text(label, 84 - (1 - s1) * 40, 67, { px: 24, f: "mono", weight: 700, color: C.ink }); ctx.globalAlpha = 1; }
  text(EP.storyboard.case || "", W - 60, 66, { px: 22, f: "mono", weight: 700, color: C.dim, align: "right" });
  // the year ruler along the bottom; the red cursor eases from the previous beat's year to this one's
  const yr = beat.yr, prev = k > 0 ? EP.storyboard.beats[k - 1].yr : yr;
  const ry = H - 52; ctx.fillStyle = C.line; ctx.fillRect(130, ry, W - 260, 2);
  for (let y = Y0; y <= Y1; y++) { const x = rulerX(y), big = y % 5 === 0; ctx.fillRect(x, ry - (big ? 12 : 6), 2, big ? 12 : 6); if (big) text(String(y), x, ry + 28, { px: 18, f: "mono", color: "#5d6066", align: "center" }); }
  if (yr) { const cy = prev ? lerp(prev, yr, ease(prog(t, 0, 0.9))) : yr, x = rulerX(cy); ctx.fillStyle = C.red; ctx.fillRect(x - 2, ry - 22, 4, 26);
    ctx.beginPath(); ctx.moveTo(x - 9, ry - 30); ctx.lineTo(x + 9, ry - 30); ctx.lineTo(x, ry - 20); ctx.closePath(); ctx.fill(); }
  ctx.fillStyle = C.bg2; ctx.fillRect(0, H - 6, W, 6); ctx.fillStyle = C.red; ctx.fillRect(0, H - 6, W * (T / EP.timeline.total), 6);
}
function init() { const c = document.getElementById("c"); ctx = c.getContext("2d");
  return Promise.all([`700 40px ${HEAD}`, `400 40px ${BODY}`, `700 40px ${BODY}`, `400 40px ${MONO}`, `700 40px ${MONO}`].map((f) => document.fonts.load(f))).then(() => true); }
function frameJPEG(T, q) { renderAt(T); return document.getElementById("c").toDataURL("image/jpeg", q || 0.93).split(",")[1]; }

/* ---------- vertical Shorts ---------- */
let shortCanvas = null;
function wrapLines(c2, str, maxW) { const words = str.split(" "), lines = []; let cur = "";
  for (const w of words) { const tt = cur ? cur + " " + w : w; if (c2.measureText(tt).width > maxW && cur) { lines.push(cur); cur = w; } else cur = tt; }
  if (cur) lines.push(cur); return lines; }
function frameShort(T, cfg) {
  renderAt(T);
  if (!shortCanvas) { shortCanvas = document.createElement("canvas"); shortCanvas.width = 1080; shortCanvas.height = 1920; }
  const c2 = shortCanvas.getContext("2d"), SW = 1080, SH = 1920, main = document.getElementById("c");
  c2.fillStyle = C.bg; c2.fillRect(0, 0, SW, SH); c2.drawImage(background(), 0, 0, SW, SH * 0.6);
  const sx = cfg.sx, sw = cfg.sw, sy = cfg.sy || 104, sh = cfg.sh || 880, dh = Math.round(sh * SW / sw), dy = 520;
  if (!cfg.tag) { c2.drawImage(main, sx, sy, sw, sh, 0, dy, SW, dh); c2.fillStyle = C.red; c2.fillRect(0, dy - 4, SW, 4); c2.fillStyle = C.line; c2.fillRect(0, dy + dh, SW, 3); }
  c2.textAlign = "center"; c2.textBaseline = "alphabetic";
  cfg.head.forEach((l, i) => { let s = 84; c2.font = `700 ${s}px ${HEAD}`; while (c2.measureText(l).width > 1000 && s > 40) { s -= 2; c2.font = `700 ${s}px ${HEAD}`; }
    c2.fillStyle = i === cfg.head.length - 1 ? C.red : C.ink; c2.fillText(l, SW / 2, 290 + i * 100); });
  if (cfg.tag) { c2.font = `700 120px ${HEAD}`; c2.fillStyle = C.ink; c2.fillText("WHERE THEY FELL", SW / 2, 880); c2.fillStyle = C.red; c2.fillRect(SW / 2 - 300, 910, 600, 7);
    c2.font = `400 38px ${MONO}`; c2.fillStyle = C.bone; c2.fillText("Tech companies, decision by decision.", SW / 2, 990);
    c2.font = `700 52px ${BODY}`; c2.fillStyle = C.ink; wrapLines(c2, cfg.cap, 920).forEach((l, i) => c2.fillText(l, SW / 2, 1180 + i * 72)); }
  else if (cfg.cap) { const y0 = dy + dh + 110; let s = 52, lines;
    for (;;) { c2.font = `700 ${s}px ${BODY}`; lines = wrapLines(c2, cfg.cap, 940); if (y0 + (lines.length - 1) * s * 1.35 + s * 0.3 <= SH - 60 || s <= 32) break; s -= 2; }
    lines.forEach((l, i) => { c2.fillStyle = C.ink; c2.fillText(l, SW / 2, y0 + i * s * 1.35); }); }
  c2.font = `700 34px ${MONO}`; c2.fillStyle = C.red; c2.fillText("WHERE THEY FELL", SW / 2, 130);
  return shortCanvas.toDataURL("image/jpeg", 0.93).split(",")[1];
}
function thumbShort(T, cfg, th) {
  frameShort(T, cfg); const c = shortCanvas.getContext("2d"), SW = 1080;
  c.fillStyle = C.bg; c.fillRect(0, 0, SW, 512); c.textAlign = "center";
  c.font = `700 34px ${MONO}`; c.fillStyle = C.red; c.fillText("WHERE THEY FELL", SW / 2, 110);
  th.big.forEach((l, i) => { let s = 160; c.font = `700 ${s}px ${HEAD}`; while (c.measureText(l).width > 1000) { s -= 4; c.font = `700 ${s}px ${HEAD}`; }
    c.fillStyle = i === th.big.length - 1 ? C.red : C.ink; c.fillText(l, SW / 2, 280 + i * 165); });
  c.fillStyle = C.bg; c.fillRect(0, 1440, SW, 480); c.font = `700 58px ${BODY}`; c.fillStyle = C.bone; wrapLines(c, th.small, 960).forEach((l, i) => c.fillText(l, SW / 2, 1560 + i * 78));
  return shortCanvas.toDataURL("image/jpeg", 0.92).split(",")[1];
}
