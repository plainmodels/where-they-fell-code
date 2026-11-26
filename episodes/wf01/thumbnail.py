"""Draw the wf01 thumbnail (1280x720) with the channel engine: a generic keyboard-phone silhouette cracked in red (no logo,
no real product shape) and the two computed market values from data.csv: "$83B → $1.2B"."""
import base64, pathlib, sys
sys.path.insert(0, "youtube/pipeline")
from playwright.sync_api import sync_playwright
import render
ep = pathlib.Path(__file__).resolve().parent
JS = r"""() => {
  const big = document.createElement('canvas'); big.width = W; big.height = H; const keep = ctx; ctx = big.getContext('2d');
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H); ctx.drawImage(background(), 0, 0);
  const g = ctx.createRadialGradient(470, 560, 60, 470, 560, 700); g.addColorStop(0, 'rgba(226,56,45,0.22)'); g.addColorStop(1, 'rgba(14,15,17,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const MV = EP.data.market_value, hi = Math.round(MV['peak'].v), lo = MV['all-time low'].v.toFixed(1);
  // the phone, split along a red crack, the right half dropped and tilted
  const px = 250, py = 150, pw = 420, ph = 790;
  [[0, 0, 0], [1, 40, 0.07]].forEach(([k, dy, rot]) => { ctx.save(); ctx.translate(px + pw / 2, py + ph / 2); ctx.rotate(rot); ctx.translate(-(px + pw / 2), -(py + ph / 2) + dy);
    ctx.beginPath(); ctx.rect(k ? px + pw / 2 + 4 : 0, 0, k ? W : px + pw / 2 - 4, H); ctx.clip(); phoneKB(px, py, pw, ph, C.ink, '#1a1b1f'); ctx.restore(); });
  line([[px + pw / 2, py - 10], [px + pw / 2 - 18, py + 140], [px + pw / 2 + 16, py + 300], [px + pw / 2 - 12, py + 470], [px + pw / 2 + 20, py + 640], [px + pw / 2, py + ph + 30]], C.red, 10);
  text(`$${hi}B →`, 1830, 470, { px: 250, f: 'head', color: C.ink, align: 'right' });
  text(`$${lo}B`, 1830, 800, { px: 330, f: 'head', color: C.red, align: 'right' });
  ctx = keep; const c = document.createElement('canvas'); c.width = 1280; c.height = 720; c.getContext('2d').drawImage(big, 0, 0, 1280, 720);
  return c.toDataURL('image/png').split(',')[1]; }"""
with sync_playwright() as pw:
    b, p = render.open_page(pw, render.write_page(ep))
    (ep / "publish").mkdir(exist_ok=True); out = ep / "publish" / "thumbnail.png"; out.write_bytes(base64.b64decode(p.evaluate(JS))); b.close()
print("wrote", out)
