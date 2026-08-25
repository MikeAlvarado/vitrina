"""Cut a specimen out of a museum photograph, for compositing over near-black.

The whole point of the edge handling: a matte lifted against a light background
leaves the ramp pixels carrying background colour. Over paper that is invisible;
over #08080A it is a milky halo. So the mask is ERODED before it is feathered
(the ramp then sits on pixels that were interior foreground) and the colour of
every transparent pixel is overwritten by the nearest foreground colour, so no
resampling — the browser's, or the encoder's — can pull the background back in.
"""

import numpy as np
from PIL import Image, ImageOps
from scipy import ndimage


def _work(path, max_side):
    im = ImageOps.exif_transpose(Image.open(path)).convert("RGB")
    if max(im.size) > max_side:
        s = max_side / max(im.size)
        im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    return im


def _bg_stats(a, band):
    """Median and spread of the border frame — the background, whatever it is."""
    h, w = a.shape[:2]
    b = min(band, h // 4, w // 4)
    frame = np.concatenate([
        a[:b].reshape(-1, 3), a[-b:].reshape(-1, 3),
        a[:, :b].reshape(-1, 3), a[:, -b:].reshape(-1, 3),
    ])
    med = np.median(frame, axis=0)
    dist = np.abs(frame - med).max(axis=1)
    return med, float(np.percentile(dist, 90))


def _largest_blob(mask):
    lab, n = ndimage.label(mask)
    if n == 0:
        return mask
    sizes = ndimage.sum(mask, lab, range(1, n + 1))
    return lab == (int(np.argmax(sizes)) + 1)


def _fill_holes(mask):
    return ndimage.binary_fill_holes(mask)


def _decontaminate(rgb, alpha, rounds=14):
    """Push foreground colour outwards so transparent pixels hold no background."""
    out = rgb.astype(np.float32).copy()
    known = alpha > 0.02
    k = np.array([[1, 1, 1], [1, 0, 1], [1, 1, 1]], np.float32)
    for _ in range(rounds):
        if known.all():
            break
        kf = known.astype(np.float32)
        cnt = ndimage.convolve(kf, k, mode="nearest")
        acc = np.stack([ndimage.convolve(out[..., c] * kf, k, mode="nearest") for c in range(3)], -1)
        grow = (~known) & (cnt > 0)
        if not grow.any():
            break
        out[grow] = acc[grow] / cnt[grow][:, None]
        known = known | grow
    return out


def cutout(path, target=640, max_side=1600, pad_frac=0.02, erode=2, feather=1.1,
           tol_scale=1.0, shadow=True, shadow_floor=0.42, shadow_ceil=1.06):
    im = _work(path, max_side)
    a = np.asarray(im, np.float32)
    med, spread = _bg_stats(a, band=max(6, min(im.size) // 40))

    dist = np.abs(a - med).max(axis=2)
    lo = max(10.0, spread * 1.6) * tol_scale
    hi = max(22.0, spread * 3.2) * tol_scale

    # A cast shadow is the background with the light taken out: same chromaticity,
    # lower luminance. Left in, it becomes a grey puddle welded to the specimen —
    # over near-black, the most obvious tell that something was cut out badly.
    if shadow and med.mean() > 60:
        ratio = a / np.maximum(med, 1.0)
        neutral = ratio.max(axis=2) - ratio.min(axis=2) < 0.14
        shade = (ratio.max(axis=2) < shadow_ceil) & (ratio.min(axis=2) > shadow_floor)
        dist = np.where(neutral & shade, 0.0, dist)

    seeds = _largest_blob(dist > hi)
    if seeds.sum() < 64:
        return None, "no seed"
    # Hysteresis: grow the confident core through everything above the low bar.
    weak = dist > lo
    lab, n = ndimage.label(weak)
    keep = np.unique(lab[seeds & (lab > 0)])
    mask = np.isin(lab, keep[keep > 0])

    mask = ndimage.binary_closing(mask, np.ones((5, 5)))
    mask = _fill_holes(mask)
    mask = _largest_blob(mask)
    mask = _fill_holes(mask)

    frac = mask.mean()
    if frac < 0.006:
        return None, f"subject too small ({frac:.3%})"
    if frac > 0.86:
        return None, f"background not separable ({frac:.1%})"
    # A blob that touches three or more sides is a failed lift, not a specimen.
    h, w = mask.shape
    edges = sum([mask[0].any(), mask[-1].any(), mask[:, 0].any(), mask[:, -1].any()])
    if edges >= 3:
        return None, "subject bleeds to the frame"

    inner = ndimage.binary_erosion(mask, np.ones((3, 3)), iterations=erode)
    if inner.sum() < 64:
        inner = mask
    alpha = ndimage.gaussian_filter(inner.astype(np.float32), feather)
    alpha = np.clip((alpha - 0.12) / 0.76, 0, 1)

    ys, xs = np.where(alpha > 0.02)
    pad = round(max(im.size) * pad_frac)
    y0, y1 = max(0, ys.min() - pad), min(h, ys.max() + 1 + pad)
    x0, x1 = max(0, xs.min() - pad), min(w, xs.max() + 1 + pad)
    a, alpha = a[y0:y1, x0:x1], alpha[y0:y1, x0:x1]

    rgb = _decontaminate(a, alpha)
    out = Image.merge("RGBA", (
        *[Image.fromarray(np.clip(rgb[..., c], 0, 255).astype(np.uint8), "L") for c in range(3)],
        Image.fromarray((alpha * 255).round().astype(np.uint8), "L"),
    ))
    if max(out.size) > target:
        s = target / max(out.size)
        out = out.resize((max(1, round(out.width * s)), max(1, round(out.height * s))), Image.LANCZOS)
    return out, None
