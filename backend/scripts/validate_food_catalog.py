"""
Valida coherencia energética del catálogo (4P + 4C + 9F) y rangos plausibles.

Uso:
  python validate_food_catalog.py
  python validate_food_catalog.py --json ../../data/food_catalog_reference.json

Códigos de salida: 0 si OK, 1 si hay fallos (CI).
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def energy_atwater_gross(p: float, c: float, f: float) -> float:
    return 4.0 * p + 4.0 * c + 9.0 * f


def energy_atwater_net_carbs(p: float, c: float, f: float, fiber: float) -> float:
    net_c = max(0.0, c - max(0.0, fiber))
    return 4.0 * p + 4.0 * net_c + 9.0 * f


def _energy_passes(kcal: float, eg: float, en: float) -> bool:
    """Acepta si la etiqueta kcal está cerca de Atwater bruto o (con fibra) del flujo neto."""
    m = max(kcal, eg, 1.0)
    if abs(kcal - eg) <= max(12.0, 0.18 * m):
        return True
    mn = max(kcal, en, 1.0)
    if abs(kcal - en) <= max(15.0, 0.22 * mn):
        return True
    return False


def validate_food(
    f: dict,
    *,
    kcal_abs_floor: float = 15.0,
) -> list[str]:
    errs: list[str] = []
    name = f.get("name", "?")
    kcal = float(f.get("kcal_per_100g") or 0)
    p = float(f.get("protein_per_100g") or 0)
    c = float(f.get("carbs_per_100g") or 0)
    fat = float(f.get("fat_per_100g") or 0)
    fiber = float(f.get("fiber_per_100g") or 0)

    if kcal < 0 or p < 0 or c < 0 or fat < 0 or fiber < 0:
        errs.append(f"{name}: valores negativos no permitidos")

    if kcal > 900 and fat < 85:
        errs.append(f"{name}: kcal muy altas ({kcal}) sin grasa casi pura")

    eg = energy_atwater_gross(p, c, fat)
    en = energy_atwater_net_carbs(p, c, fat, fiber)
    if kcal <= kcal_abs_floor and eg <= kcal_abs_floor:
        return errs

    is_honey = name == "Honey" or f.get("name_es") == "Miel"
    if is_honey:
        if not (abs(kcal - eg) <= max(25.0, 0.25 * max(kcal, eg, 1.0)) or abs(kcal - en) <= max(25.0, 0.28 * max(kcal, en, 1.0))):
            errs.append(
                f"{name}: miel kcal={kcal:.1f} vs bruto={eg:.1f} neto={en:.1f} "
                f"(etiquetas vs 4-4-9 con azúcares)"
            )
        return errs

    if not _energy_passes(kcal, eg, en):
        errs.append(
            f"{name}: kcal={kcal:.1f} vs Atwater bruto={eg:.1f} neto_carb={en:.1f}; "
            f"P={p} C={c} F={fat} fib={fiber}"
        )

    return errs


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--json",
        type=Path,
        default=Path(__file__).resolve().parents[2] / "data" / "food_catalog_reference.json",
        help="Ruta al food_catalog_reference.json",
    )
    args = ap.parse_args()
    if not args.json.is_file():
        print(f"No existe {args.json}; ejecuta generate_food_catalog_reference.py", file=sys.stderr)
        return 1
    data = json.loads(args.json.read_text(encoding="utf-8"))
    foods = data.get("foods") or []
    all_errs: list[str] = []
    for f in foods:
        all_errs.extend(validate_food(f))

    if all_errs:
        print(f"Fallos ({len(all_errs)}):")
        for e in all_errs:
            print(f"  - {e}")
        return 1
    print(f"OK: {len(foods)} alimentos pasan validación energética (bruta o neta con fibra).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
