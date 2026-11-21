#!/usr/bin/env python3
"""Procedural seamless 2x2 twill, baked for phone-size carbon trim.

No stock art. The repeat is 96px and is shown at 32 CSS px, so each tow is
about 2.7 CSS px (3x density). Tows meet edge to edge: there is no groove.
One direction is a little lighter and glossier, the other a little darker
and flatter. Filaments are only a whisper, so they disappear at arm's length.
Every texel stays at or below #0A5A42, which is 7.2:1 against ivory.
"""
import os
from io import BytesIO
import numpy as np
from PIL import Image

SIZE = 96
TOW = 8                 # 96 / 8 = 12 tows; 2x2 period is 32px, three repeats
SHADOW = np.array([3, 34, 24], dtype=np.float64)    # #032218
MID = np.array([10, 90, 66], dtype=np.float64)      # #0A5A42

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
    # Draw at 2x and box-filter down so the tow edges stay soft but seamless.
    n = SIZE * 2
    tow = TOW * 2
    y, x = np.mgrid[0:n, 0:n]
    ix = x // tow
    iy = y // tow
    # 2/2 twill, one-tow step each row. n is a multiple of 4*tow.
    glossy = ((ix - iy) % 4) < 2
    lx = (x % tow).astype(np.float64) / tow
    ly = (y % tow).astype(np.float64) / tow

    # A broad sheen along each tow, not a dark outline. Center is only a little brighter.
    def sheen(local):
        return 0.94 + 0.06 * np.cos(2 * np.pi * (local - 0.5)) ** 2

    # A hint of filament, too small to read at 1x.
    def filament(local):
        return 1.0 + 0.018 * np.cos(2 * np.pi * local * 7)

    # Glossy tows (the ones facing the light) sit near the mid green.
    # Matte tows sit lower, toward the shadow, with almost no internal flash.
    light = sheen(ly) * filament(ly) * (0.86 + 0.06 * np.sin(2 * np.pi * x / n * 2))
    matte = sheen(lx) * filament(lx) * 0.46
    lum = np.where(glossy, light, matte)
    lum = np.clip(lum, 0.0, 1.0)

    rgb = SHADOW + (MID - SHADOW) * lum[..., None]
    # Average 2x2 blocks. The period survives because 2 divides the repeat.
    rgb = rgb.reshape(SIZE, 2, SIZE, 2, 3).mean(axis=(1, 3))
    return rgb, float(_contrast(rgb).min())


def main():
    rgb, worst = build()
    if worst < 7.0:
        raise SystemExit('contrast fell to %.2f' % worst)
    img = Image.fromarray(np.clip(np.round(rgb), 0, 255).astype(np.uint8), 'RGB')
    quality = 80
    raw = None
    for q in (80, 72, 64, 56, 48):
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
    print('carbon-twill.webp %d bytes q=%d contrast>=%.2f tow=%.2fcss' % (
        len(raw), quality, worst, TOW / SIZE * 32))


if __name__ == '__main__':
    main()
