"""Draw the episode thumbnail from the episode's own data: python thumbnail.py <episode_dir>"""
import base64, json, pathlib, sys
from playwright.sync_api import sync_playwright
ep = pathlib.Path(sys.argv[1]).resolve()
data = json.loads((ep / "data.json").read_text())
JS = r"""
([counts]) => {
  const W = 1280, H = 720, c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
  x.fillStyle = '#0d1117'; x.fillRect(0, 0, W, H);
  const g = x.createRadialGradient(930, 360, 60, 930, 360, 700); g.addColorStop(0, 'rgba(255,107,107,0.22)'); g.addColorStop(1, 'rgba(13,17,23,0)');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  // one real faulty page: 32 x 16 words, every word that ever failed is lit
  const cs = 19, gx = 640, gy = 110, page = 3;
  for (let i = 0; i < 512; i++) { const bad = counts[String(page * 512 + i)]; x.fillStyle = bad ? '#ff6b6b' : '#12304f';
    if (bad) { x.shadowColor = '#ff6b6b'; x.shadowBlur = 10; } else x.shadowBlur = 0;
    x.beginPath(); x.roundRect(gx + (i % 32) * cs, gy + Math.floor(i / 32) * cs * 1.6, cs - 4, cs * 1.6 - 4, 3); x.fill(); }
  x.shadowBlur = 0;
  x.textBaseline = 'alphabetic'; x.fillStyle = '#ffffff'; x.font = '800 132px "Noto Sans"'; x.fillText('BROKEN', 56, 250);
  x.fillStyle = '#ff6b6b'; x.shadowColor = '#ff6b6b'; x.shadowBlur = 30; x.fillText('RAM', 56, 390); x.shadowBlur = 0;
  x.fillStyle = '#58a6ff'; x.font = '700 62px "Noto Sans"'; x.fillText('still boots.', 60, 500);
  x.fillStyle = '#e6edf3'; x.font = '600 40px "Noto Sans Mono"'; x.fillText('319 faults mapped · 24 boots', 60, 640);
  return c.toDataURL('image/png').split(',')[1];
}"""
with sync_playwright() as pw:
    b = pw.chromium.launch(channel="chrome", headless=True); p = b.new_page(); p.set_content("<html><body></body></html>")
    p.evaluate("Promise.all([document.fonts.load('800 100px \"Noto Sans\"'), document.fonts.load('600 40px \"Noto Sans Mono\"')])")
    out = ep / "publish" / "thumbnail.png"; out.write_bytes(base64.b64decode(p.evaluate(JS, [data["word_counts"]]))); b.close()
print("wrote", out, out.stat().st_size // 1024, "KB")
