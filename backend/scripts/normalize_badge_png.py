#!/usr/bin/env python3
"""
Recorta márgenes transparentes, centra en un lienzo cuadrado y redimensiona.
Así dos insignias se ven más parecidas en la app (mismo tamaño útil dentro del PNG).

Uso (desde carpeta backend/):
  python scripts/normalize_badge_png.py "C:\\entrada.png" -o "C:\\salida.png"
  python scripts/normalize_badge_png.py entrada.png -o salida.png --size 500

Opcional: --margin 0.08  → deja ~8%% de aire alrededor del recorte antes del resize.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from PIL import Image


def _alpha_bbox(im: Image.Image) -> tuple[int, int, int, int] | None:
    if im.mode != "RGBA":
        im = im.convert("RGBA")
    a = im.split()[3]
    return a.getbbox()


def normalize_png(src: Path, dest: Path, *, out_size: int, margin: float) -> None:
    im = Image.open(src)
    im = im.convert("RGBA")
    bbox = _alpha_bbox(im)
    if not bbox:
        sys.exit("Imagen vacía o sin transparencia útil para recortar.")
    x0, y0, x1, y1 = bbox
    w, h = x1 - x0, y1 - y0
    if margin > 0:
        pad_x = int(w * margin)
        pad_y = int(h * margin)
        x0 = max(0, x0 - pad_x)
        y0 = max(0, y0 - pad_y)
        x1 = min(im.width, x1 + pad_x)
        y1 = min(im.height, y1 + pad_y)
    cropped = im.crop((x0, y0, x1, y1))
    cw, ch = cropped.size
    side = max(cw, ch)
    square = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    ox = (side - cw) // 2
    oy = (side - ch) // 2
    square.paste(cropped, (ox, oy), cropped)
    out = square.resize((out_size, out_size), Image.Resampling.LANCZOS)
    dest.parent.mkdir(parents=True, exist_ok=True)
    out.save(dest, "PNG")


def main() -> None:
    p = argparse.ArgumentParser(description="Cuadrar insignia PNG (trim + resize)")
    p.add_argument("input", type=Path, help="PNG de entrada")
    p.add_argument("-o", "--output", type=Path, required=True, help="PNG de salida")
    p.add_argument("--size", type=int, default=500, help="lado final en px (default 500)")
    p.add_argument("--margin", type=float, default=0.06, help="margen extra sobre el recorte (0–0.3, default 0.06)")
    args = p.parse_args()
    if not args.input.is_file():
        sys.exit("No existe el fichero de entrada")
    if args.size < 64 or args.size > 4096:
        sys.exit("--size razonable entre 64 y 4096")
    if args.margin < 0 or args.margin > 0.35:
        sys.exit("--margin entre 0 y 0.35")
    normalize_png(args.input, args.output, out_size=args.size, margin=args.margin)
    print(f"OK -> {args.output.resolve()} ({args.size}x{args.size})")


if __name__ == "__main__":
    main()
