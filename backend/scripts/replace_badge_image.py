#!/usr/bin/env python3
"""
Sustituye el asset en disco para una insignia con URL tipo /api/v1/me/badges/media/{badge_id}.

Uso:
  python scripts/replace_badge_image.py coach-first-chat --image ruta/nueva.png
  python scripts/replace_badge_image.py --json definicion.json --image ruta/nueva.png

`definicion.json` puede ser un objeto con "badge_id" o una lista (usa --badge-id para elegir fila).

Solo toca ficheros bajo uploads/badges y mobile/assets/images/badges (no modifica la BD).
Para cambiar a un UUID nuevo tras /admin/badges/upload, usa PATCH admin con image_url.
"""
from __future__ import annotations

import argparse
import json
import re
import shutil
import sys
from pathlib import Path

# backend/scripts/this.py -> repo root (NutrIA/)
ROOT = Path(__file__).resolve().parents[2]
UPLOADS = ROOT / "uploads" / "badges"
MOBILE = ROOT / "mobile" / "assets" / "images" / "badges"
_BADGE_ID = re.compile(r"^[a-zA-Z0-9_-]{1,120}$")
_ALLOWED_EXT = {".png", ".jpg", ".jpeg", ".webp"}


def _resolve_badge_id(args: argparse.Namespace) -> str:
    if args.json_file:
        raw = Path(args.json_file).read_text(encoding="utf-8")
        data = json.loads(raw)
        if isinstance(data, dict):
            bid = (args.badge_id or data.get("badge_id") or data.get("id") or "").strip()
            if not bid:
                sys.exit("JSON objeto: falta badge_id (en JSON o como primer argumento)")
        elif isinstance(data, list):
            if not args.json_pick:
                sys.exit("JSON es lista: pasa --badge-id")
            bid = args.json_pick.strip()
        else:
            sys.exit("JSON debe ser objeto o lista")
    else:
        if not args.badge_id:
            sys.exit("Indica badge_id como primer argumento o usa --json")
        bid = args.badge_id.strip()
    if not _BADGE_ID.fullmatch(bid):
        sys.exit(f"badge_id inválido: {bid!r}")
    return bid


def main() -> None:
    p = argparse.ArgumentParser(description="Copia nueva imagen para asset /media/{badge_id}")
    p.add_argument("badge_id", nargs="?", help="p. ej. coach-first-chat (omitir si --json objeto trae badge_id)")
    p.add_argument("--image", "-i", required=True, help="ruta al .png/.jpg/.webp")
    p.add_argument("--json", dest="json_file", metavar="FILE", help="JSON con badge_id (objeto) o lista + --badge-id")
    p.add_argument("--badge-id", dest="json_pick", metavar="ID", help="Con JSON lista: cuál actualizar")
    args = p.parse_args()

    src = Path(args.image).resolve()
    if not src.is_file():
        sys.exit("--image debe ser un fichero existente")

    suf = src.suffix.lower()
    if suf == ".jpeg":
        suf = ".jpg"
    if suf not in _ALLOWED_EXT:
        sys.exit(f"Extensión no soportada: {suf} (usa .png, .jpg, .webp)")

    bid = _resolve_badge_id(args)

    UPLOADS.mkdir(parents=True, exist_ok=True)
    MOBILE.mkdir(parents=True, exist_ok=True)

    for base in (UPLOADS, MOBILE):
        for ext in (".jpg", ".png", ".webp"):
            old = base / f"{bid}{ext}"
            if old.exists() and ext != suf:
                old.unlink()
        dest = base / f"{bid}{suf}"
        shutil.copy2(src, dest)
        print(f"OK {dest} ({dest.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
