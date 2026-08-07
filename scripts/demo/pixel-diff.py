#!/usr/bin/env python3
"""Pixel-diff each Stitch reference against its real capture.

Resizes the reference to the real capture's dimensions (the refs are big
Stitch exports; the app is captured at a proportional viewport), computes the
fraction of pixels that differ beyond a small tolerance, and prints a table.
Also writes comparison.html pairing ref vs actual side by side.

Legitimate differences are expected (the real terminal is live, the wizard is
interactive): the diff is a guide, not a verdict.
"""
import os
from PIL import Image, ImageChops

HERE = os.path.join(os.path.dirname(__file__), '..', '..', 'brand', 'stitch')
HERE = os.path.normpath(HERE)

NAMES = [
    'landing', 'terminal', 'studio-dashboard', 'studio-login',
    'studio-builder', 'edit-journey', 'wizard-publish', 'profile-noscript',
    'inbox', 'terminal-mobile',
]

def diff_pct(ref_path, actual_path, tolerance=18, scale=0.5):
    ref = Image.open(ref_path).convert('RGB')
    act = Image.open(actual_path).convert('RGB')
    # Downscale for speed; a rough guide needs no full-res loop.
    w = int(act.width * scale)
    h = int(act.height * scale)
    act = act.resize((w, h), Image.LANCZOS)
    ref = ref.resize((w, h), Image.LANCZOS)
    # Fit the reference into the actual's dimensions (cover-crop centered).
    act_ratio = act.width / act.height
    ref_ratio = ref.width / ref.height
    if act_ratio > ref_ratio:
        new_h = act.height
        new_w = int(act.height * ref_ratio)
    else:
        new_w = act.width
        new_h = int(act.width / ref_ratio)
    ref = ref.resize((new_w, new_h), Image.LANCZOS)
    left = (act.width - new_w) // 2
    top = (act.height - new_h) // 2
    canvas = Image.new('RGB', (act.width, act.height), (11, 13, 14))
    canvas.paste(ref, (left, top))
    ref = canvas
    diff = ImageChops.difference(ref, act)
    lum = diff.convert('L')
    total = act.width * act.height
    data = lum.getdata()
    count = sum(1 for d in data if d > tolerance)
    return count / total * 100

rows = []
for name in NAMES:
    ref = os.path.join(HERE, f'{name}.png')
    act = os.path.join(HERE, f'actual-{name}.png')
    if not (os.path.exists(ref) and os.path.exists(act)):
        rows.append((name, None))
        continue
    pct = diff_pct(ref, act)
    rows.append((name, pct))

print(f"{'screen':<20} {'diff%':>7}  verdict")
print('-' * 42)
for name, pct in rows:
    if pct is None:
        print(f"{name:<20} {'n/a':>7}  missing")
        continue
    verdict = 'HIGH' if pct > 30 else ('MED' if pct > 12 else 'low')
    print(f"{name:<20} {pct:>6.1f}%  {verdict}")

# Write comparison.html
cards = []
for name, pct in rows:
    pct_label = 'n/a' if pct is None else f'{pct:.1f}%'
    cards.append(f'''
    <div class="pair">
      <h2>{name} <span class="diff">diff {pct_label}</span></h2>
      <div class="side"><h3>Stitch ref</h3><img src="{name}.png" alt="reference {name}"></div>
      <div class="side"><h3>Actual app</h3><img src="actual-{name}.png" alt="actual {name}"></div>
    </div>''')

html = f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>knockport — Stitch vs actual comparison</title>
<style>
  :root {{ --bg:#0b0d0e; --fg:#e8e6e1; --dim:#7d8285; --accent:#7fd6d1; --rule:rgba(232,230,225,.14); }}
  * {{ box-sizing:border-box; }}
  body {{ margin:0; background:var(--bg); color:var(--fg); font-family:'IBM Plex Mono',monospace; padding:2rem 1.5rem; }}
  h1 {{ font-size:1.3rem; }} p.muted {{ color:var(--dim); max-width:70ch; }}
  .pair {{ border:1px solid var(--rule); padding:1rem; margin:2rem 0; }}
  .pair h2 {{ font-size:.9rem; text-transform:uppercase; letter-spacing:.06em; color:var(--dim); margin:0 0 .5rem; }}
  .pair h2 .diff {{ color:var(--accent); margin-left:.5rem; }}
  .sides {{ display:grid; grid-template-columns:1fr 1fr; gap:1rem; }}
  .side h3 {{ font-size:.75rem; color:var(--dim); margin:0 0 .4rem; text-transform:uppercase; letter-spacing:.05em; }}
  .side img {{ width:100%; height:auto; border:1px solid var(--rule); background:#0a0c0d; }}
  @media (max-width:900px) {{ .sides {{ grid-template-columns:1fr; }} }}
</style></head>
<body>
  <h1>knockport — Stitch reference vs actual app</h1>
  <p class="muted">Each pair shows the Google Stitch reference (left) and the real
  app screen captured at a proportional viewport (right). The diff% is a rough
  pixel guide; legitimately different screens (a live terminal, an interactive
  wizard) will show a high number.</p>
  {''.join(cards)}
</body></html>'''

with open(os.path.join(HERE, 'comparison.html'), 'w') as f:
    f.write(html)
print('\nwrote comparison.html')
