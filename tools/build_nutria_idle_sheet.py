"""
Build an 8-frame horizontal sprite sheet (256x32) from the generated otter grid.

Input : assets/nutria-idle-spritesheet.png  (1376x768, 6x2 grid of otters on a
        fake checkerboard "transparent" background)
Output (opcional / herramienta; la app usa `nutria-frame-00..11` en NutriaIdleSprite, no estos frames):
        mobile/assets/images/streak/nutria-idle-sheet.png  (256x32, real alpha)
        mobile/assets/images/streak/nutria-idle-sheet@2x.png (512x64, real alpha)
        mobile/assets/images/streak/nutria-idle-frame-0..7.png (32x32 each)
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image

SRC = Path(
    r"C:\\Users\\Practicas\\.cursor\\projects\\c-Users-Practicas-Documents-Nutricionista\\assets\\nutria-idle-spritesheet.png"
)
OUT_DIR = Path(__file__).resolve().parents[1] / "mobile" / "assets" / "images" / "streak"
OUT_DIR.mkdir(parents=True, exist_ok=True)


def checker_to_alpha(img: Image.Image) -> Image.Image:
    """Replace the fake checkerboard background (light + dark grey squares)
    with real transparency. Keeps the otter pixels intact."""
    img = img.convert("RGBA")
    px = img.load()
    w, h = img.size
    # Checker colors observed in the generated image are near (204,204,204)
    # and (255,255,255). We treat anything "greyish and bright" as background.
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            # grey-ish = channels close to each other AND bright
            max_c = max(r, g, b)
            min_c = min(r, g, b)
            if max_c >= 190 and (max_c - min_c) <= 12:
                px[x, y] = (0, 0, 0, 0)
    return img


def bbox_of_otter(cell: Image.Image) -> tuple[int, int, int, int]:
    """Return a tight bbox of the non-transparent otter inside a cell."""
    bbox = cell.getbbox()
    if bbox is None:
        return (0, 0, cell.width, cell.height)
    return bbox


def square_pad(img: Image.Image, margin: int = 2) -> Image.Image:
    """Center the otter on a transparent square canvas with a small margin."""
    w, h = img.size
    side = max(w, h) + margin * 2
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(img, ((side - w) // 2, (side - h) // 2), img)
    return canvas


def main() -> None:
    raw = Image.open(SRC)
    sheet = checker_to_alpha(raw)

    # Grid is 6 columns x 2 rows of otters.
    W, H = sheet.size
    cols, rows = 6, 2
    cw, ch = W // cols, H // rows

    otters: list[Image.Image] = []
    for r in range(rows):
        for c in range(cols):
            cell = sheet.crop((c * cw, r * ch, (c + 1) * cw, (r + 1) * ch))
            bb = bbox_of_otter(cell)
            otters.append(cell.crop(bb))

    # We have 12 otters. Pick 8 for the idle loop.
    # Rows in the generated image (top to bottom, left to right) roughly are:
    # row0: 0 open-eyes, 1 smile-closed, 2 smile-closed, 3 sleepy, 4 sleepy, 5 sleepy
    # row1: 6 open, 7 open, 8 open, 9 open, 10 wink, 11 half-smile
    # For a subtle idle we want mostly "open eyes" variants + one blink.
    # Chosen order (seamless loop, blink at frame 7):
    #   base, up1, up2, peak, down1, down2, blink, base
    # indices into `otters`:
    order = [0, 6, 7, 8, 9, 11, 10, 0]

    frames: list[Image.Image] = []
    for idx in order:
        o = otters[idx]
        padded = square_pad(o, margin=4)
        small = padded.resize((32, 32), Image.LANCZOS)
        frames.append(small)

    # Save individual frames
    for i, f in enumerate(frames):
        f.save(OUT_DIR / f"nutria-idle-frame-{i}.png")

    # Horizontal sheet 256x32
    sheet_out = Image.new("RGBA", (32 * 8, 32), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        sheet_out.paste(f, (i * 32, 0), f)
    sheet_out.save(OUT_DIR / "nutria-idle-sheet.png")

    # @2x version at 64px per frame for crisper rendering on high-DPI
    sheet_2x = Image.new("RGBA", (64 * 8, 64), (0, 0, 0, 0))
    for i, idx in enumerate(order):
        o = otters[idx]
        padded = square_pad(o, margin=4)
        big = padded.resize((64, 64), Image.LANCZOS)
        sheet_2x.paste(big, (i * 64, 0), big)
    sheet_2x.save(OUT_DIR / "nutria-idle-sheet@2x.png")

    print("OK")
    print("out:", OUT_DIR / "nutria-idle-sheet.png")
    print("out:", OUT_DIR / "nutria-idle-sheet@2x.png")


if __name__ == "__main__":
    main()
