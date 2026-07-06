#!/usr/bin/env python3
"""
post.py — turn raw gpt-image-2 renders into sphere-ready texture maps.

Reads:  tools/_raw/ai/<key>.png   (raw renders Codex produced)
Writes: assets/img/textures/<key>.webp              (2048x1024, seam-blended, WebP)
        assets/img/textures/local-data/<key>.js     (matching data URL for file://)

WebP is ~2x smaller than JPEG at equal quality, so the whole 17-body set loads
fast from GitHub Pages while keeping full 2048 resolution for close-up flight.

Post-processing:
  1. feather the left/right wrap so the 0deg/360deg meridian tiles (no seam line),
  2. resize to 2048x1024 (equirectangular 2:1),
  3. save as WebP and matching file:// sidecar.

Pillow-only (no numpy). Usage:
  python3 tools/post.py            # process every png in tools/_raw/ai/
  python3 tools/post.py satis set  # process only these keys
"""
import base64, json, pathlib, sys
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC  = ROOT / "tools" / "_raw" / "ai"
DST  = ROOT / "assets" / "img" / "textures"
LOCAL_DST = DST / "local-data"
OUT_W, OUT_H = 2048, 1024
BAND_FRAC = 0.04          # seam feather width as a fraction of image width
WEBP_Q = 74               # WebP quality — full 2048 sharpness at ~1/2 the JPEG size

def _mask(b, h):
    """Column k -> alpha t(k)=0.5*(1-k/b): 0.5 at the seam, 0 at the band edge."""
    row = bytes(int(255 * 0.5 * (1 - k / b)) for k in range(b))
    return Image.frombytes("L", (b, 1), row).resize((b, h))

def seam_blend(im):
    """Feather the two vertical edges toward each other so they tile horizontally."""
    w, h = im.size
    b = max(1, int(w * BAND_FRAC))
    Lb  = im.crop((0, 0, b, h))
    Rbf = im.crop((w - b, 0, w, h)).transpose(Image.FLIP_LEFT_RIGHT)  # mirror: col k <-> global w-1-k
    m = _mask(b, h)
    new_left  = Image.composite(Rbf, Lb, m)                            # Lb*(1-t) + Rbf*t
    new_right = Image.composite(Lb, Rbf, m).transpose(Image.FLIP_LEFT_RIGHT)  # Rb*(1-t) + Lb*t
    im.paste(new_left,  (0, 0))
    im.paste(new_right, (w - b, 0))
    return im

def process(key):
    src = SRC / f"{key}.png"
    if not src.exists():
        print(f"skip {key}: {src} not found"); return False
    img = Image.open(src).convert("RGB")
    in_size = img.size
    img = seam_blend(img).resize((OUT_W, OUT_H), Image.LANCZOS)
    DST.mkdir(parents=True, exist_ok=True)
    dst = DST / f"{key}.webp"
    img.save(dst, "WEBP", quality=WEBP_Q, method=6)
    write_local_sidecar(key, dst)
    print(f"ok   {key:10s} {in_size[0]}x{in_size[1]} -> {OUT_W}x{OUT_H}  {dst.stat().st_size//1024} KB")
    return True

def write_local_sidecar(key, webp_path):
    """Embed the WebP as a tiny JS data-url assignment for file:// browser loads."""
    LOCAL_DST.mkdir(parents=True, exist_ok=True)
    data = base64.b64encode(webp_path.read_bytes()).decode("ascii")
    js = (
        f"// Generated from ../{webp_path.name} for local file:// texture loading.\n"
        "window.RA_LOCAL_TEXTURES=window.RA_LOCAL_TEXTURES||{};\n"
        f"window.RA_LOCAL_TEXTURES[{json.dumps(key)}]={json.dumps('data:image/webp;base64,' + data)};\n"
    )
    (LOCAL_DST / f"{key}.js").write_text(js, encoding="utf-8")

def main():
    from PIL import features
    if not features.check("webp"):
        sys.exit("this Pillow build lacks WebP support (pip install --upgrade pillow)")
    keys = sys.argv[1:]
    if not keys:
        keys = sorted(p.stem for p in SRC.glob("*.png")) if SRC.exists() else []
    if not keys:
        print(f"no inputs in {SRC}"); return
    n = sum(process(k) for k in keys)
    print(f"\n{n} texture(s) -> {DST}")

if __name__ == "__main__":
    main()
