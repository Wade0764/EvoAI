#!/usr/bin/env python3
"""Procedural seamless 2x2 twill carbon-fiber tile, Royal Jewel greens.

No stock art. Warp tows run vertically and weft tows run horizontally.
A 2/2 twill puts two tows over and two under, stepping one tow each row,
so the cloth reads as a broken diagonal. Each tow is a bundle of fine
parallel strands. The tile period divides the image, so it repeats cleanly.
"""
import os
import numpy as np
from PIL import Image

SIZE = 128
TOW = 16          # 128 / 16 = 8 tows; the 2x2 repeat is 4 tows = 64px
STRANDS = 10      # filaments across one tow
SHADOW = np.array([3, 34, 24], dtype=np.float64)     # #032218
MID = np.array([10, 90, 66], dtype=np.float64)       # #0A5A42, 7.2:1 on ivory

HERE = os.path.dirname(os.path.abspath(__file__))
CLOUD = os.path.dirname(HERE)
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(CLOUD)))
OUTS = [
    os.path.join(ROOT, 'cloud', 'assets', 'carbon-twill.webp'),
    os.path.join(CLOUD, 'assets', 'carbon-twill.webp'),
]


def _lin(c):
    c = c / 255.0
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def _lum(rgb):
    r, g, b = _lin(rgb[..., 0]), _lin(rgb[..., 1]), _lin(rgb[..., 2])
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def _contrast(rgb, ink=(242, 240, 235)):
    li = _lum(np.array(ink, dtype=np.float64))
    lb = _lum(rgb)
    lighter = np.maximum(li, lb)
    darker = np.minimum(li, lb)
    return (lighter + 0.05) / (darker + 0.05)


def build():
    y, x = np.mgrid[0:SIZE, 0:SIZE]
    ix = x // TOW
    iy = y // TOW
    # 2/2 twill, stepped by one tow each weft row. Seamless because SIZE % (4*TOW) == 0.
    warp_top = ((ix - iy) % 4) < 2
    lx = (x % TOW).astype(np.float64)
    ly = (y % TOW).astype(np.float64)

    def strands(local):
        phase = (local / TOW) * STRANDS
        ridge = np.cos(2 * np.pi * phase) ** 2
        return 0.62 + 0.38 * ridge

    def groove(local):
        d = np.minimum(local, TOW - local)
        return np.clip(d / 2.4, 0.0, 1.0) ** 0.85

    # Anisotropic: horizontal (weft) tows face an overhead light and read lighter.
    warp = strands(lx) * (0.55 + 0.45 * groove(lx)) * 0.78
    weft = strands(ly) * (0.55 + 0.45 * groove(ly)) * 1.0
    lum = np.where(warp_top, warp, weft)

    # A dark line where a tow dives under its neighbour.
    edge = (warp_top != np.roll(warp_top, 1, axis=1)) | (warp_top != np.roll(warp_top, 1, axis=0))
    lum = np.where(edge, lum * 0.42, lum)

    # Slow, integer-frequency variation so the tile still meets itself at the edges.
    lum = lum + 0.035 * np.sin(2 * np.pi * x / SIZE * 2 + 0.6)
    lum = lum + 0.028 * np.cos(2 * np.pi * y / SIZE * 3)
    lum = np.clip(lum, 0.0, 1.0)

    # Bright strands stop at the mid green so ivory type stays at 7.2:1 or better.
    t = lum[..., None]
    rgb = SHADOW + (MID - SHADOW) * t

    ink_contrast = _contrast(rgb)
    return rgb, float(ink_contrast.min())


def main():
    rgb, worst = build()
    img = Image.fromarray(np.clip(np.round(rgb), 0, 255).astype(np.uint8), 'RGB')
    # Supersample was not required; the cosine strands are already band-limited.
    quality = 72
    raw = None
    for q in (72, 64, 56, 48, 42):
        from io import BytesIO
        buf = BytesIO()
        img.save(buf, 'WEBP', quality=q, method=6)
        raw = buf.getvalue()
        quality = q
        if len(raw) <= 15 * 1024:
            break
    if len(raw) > 15 * 1024:
        raise SystemExit('carbon tile is %d bytes' % len(raw))
    for path in OUTS:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        open(path, 'wb').write(raw)
    print('carbon-twill.webp %d bytes q=%d contrast>=%.2f' % (len(raw), quality, worst))


if __name__ == '__main__':
    main()
