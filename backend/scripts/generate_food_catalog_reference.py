"""Escribe data/food_catalog_reference.json desde food_catalog_data.py."""
from __future__ import annotations

import json
import sys
from pathlib import Path

_SCRIPT_DIR = Path(__file__).resolve().parent
if str(_SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPT_DIR))

from food_catalog_data import EXPAND_FOODS, SEED_FOODS


def _row(t: tuple) -> dict:
    name, name_es, cat, kcal, p, c, f, fib, verified, ref = t
    return {
        "name": name,
        "name_es": name_es,
        "category": cat,
        "provider": "generic",
        "kcal_per_100g": kcal,
        "protein_per_100g": p,
        "carbs_per_100g": c,
        "fat_per_100g": f,
        "fiber_per_100g": fib,
        "is_verified": verified,
        "source_ref": ref,
    }


def main() -> None:
    root = Path(__file__).resolve().parents[2]
    out = root / "data" / "food_catalog_reference.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    foods = [_row(t) for t in SEED_FOODS] + [_row(t) for t in EXPAND_FOODS]
    payload = {
        "version": 1,
        "unit": "per_100g",
        "description": "Catálogo unificado seed + migración 005; referencia USDA FDC salvo source_ref.",
        "foods": foods,
    }
    out.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {len(foods)} foods to {out}")


if __name__ == "__main__":
    main()
