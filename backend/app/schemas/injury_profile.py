"""Contrato estructurado de lesiones para adaptación de rutinas."""

from __future__ import annotations

import uuid
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.rules.injury_defaults import default_exclude_tags_for_zone_phase

InjuryPhase = Literal["acute", "rehab_only", "trainable_low_pain", "return_to_training"]
InjuryGoal = Literal[
    "prioritize_recovery",
    "maintain_fitness",
    "maintain_strength",
    "return_to_performance",
]
BodyZone = Literal[
    "cervical",
    "shoulder",
    "elbow",
    "wrist_hand",
    "thoracic",
    "lumbar",
    "hip",
    "knee",
    "ankle_foot",
    "other",
]
Laterality = Literal["left", "right", "bilateral", "midline"]

_LEGACY_ZONE_MAP: dict[str, BodyZone] = {
    "hombro": "shoulder",
    "shoulder": "shoulder",
    "rodilla": "knee",
    "knee": "knee",
    "lumbar": "lumbar",
    "lumbares": "lumbar",
    "cervical": "cervical",
    "codo": "elbow",
    "elbow": "elbow",
    "muñeca": "wrist_hand",
    "muneca": "wrist_hand",
    "mano": "wrist_hand",
    "tobillo": "ankle_foot",
    "pie": "ankle_foot",
    "cadera": "hip",
    "dorsal": "thoracic",
    "torácico": "thoracic",
    "toracico": "thoracic",
    "tórax": "thoracic",
    "torax": "thoracic",
}


def normalize_legacy_zone(zone: str) -> BodyZone:
    z = (zone or "").strip().lower()
    if z in _LEGACY_ZONE_MAP:
        return _LEGACY_ZONE_MAP[z]
    for k, v in _LEGACY_ZONE_MAP.items():
        if k in z:
            return v
    return "other"


class InjuryProfile(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    id: str = Field(default_factory=lambda: str(uuid.uuid4())[:12])
    body_zone: BodyZone = Field(alias="bodyZone")
    laterality: Laterality = "bilateral"
    diagnosis_label: Optional[str] = Field(None, alias="diagnosisLabel", max_length=200)
    custom_body_zone_label: Optional[str] = Field(None, alias="customBodyZoneLabel", max_length=120)
    phase: InjuryPhase = "trainable_low_pain"
    goal: InjuryGoal = "maintain_fitness"
    pain_at_rest: Optional[int] = Field(None, ge=0, le=10, alias="painAtRest")
    pain_with_movement: Optional[int] = Field(None, ge=0, le=10, alias="painWithMovement")
    exclude_tags: list[str] = Field(default_factory=list, alias="excludeTags")
    caution_tags: list[str] = Field(default_factory=list, alias="cautionTags")
    preferred_tags: list[str] = Field(default_factory=list, alias="preferredTags")
    custom_avoid_movements: list[str] = Field(default_factory=list, alias="customAvoidMovements")
    notes: Optional[str] = Field(None, max_length=500)
    red_flags_reported: bool = Field(False, alias="redFlagsReported")

    @field_validator("diagnosis_label", "custom_body_zone_label", "notes", mode="before")
    @classmethod
    def _strip_optional_text(cls, v):
        if v is None:
            return None
        s = str(v).strip()
        return s or None

    @field_validator("exclude_tags", "caution_tags", "preferred_tags", mode="before")
    @classmethod
    def _strip_tags(cls, v):
        if v is None:
            return []
        if isinstance(v, list):
            out: list[str] = []
            seen: set[str] = set()
            for x in v:
                s = str(x).strip()
                if s and s not in seen:
                    out.append(s)
                    seen.add(s)
            return out
        return []

    @field_validator("custom_avoid_movements", mode="before")
    @classmethod
    def _strip_custom_movements(cls, v):
        if v is None:
            return []
        if not isinstance(v, list):
            return []
        out: list[str] = []
        seen: set[str] = set()
        for x in v:
            s = str(x).strip()
            if not s or s in seen:
                continue
            if len(s) > 80:
                raise ValueError("Cada movimiento personalizado debe tener 80 caracteres o menos")
            out.append(s)
            seen.add(s)
        if len(out) > 10:
            raise ValueError("No se pueden indicar más de 10 movimientos personalizados")
        return out

    @model_validator(mode="after")
    def _require_custom_zone_label_for_other(self):
        if self.body_zone == "other" and not self.custom_body_zone_label:
            raise ValueError("customBodyZoneLabel es obligatorio cuando bodyZone es 'other'")
        return self


def injury_profile_from_dict(raw: dict) -> Optional[InjuryProfile]:
    """Parse JSON dict from DB; acepta legacy {zone, severity, notes}."""
    if not isinstance(raw, dict) or not raw:
        return None
    if raw.get("bodyZone") or raw.get("body_zone"):
        try:
            p = InjuryProfile.model_validate(raw)
            if not p.exclude_tags:
                return p.model_copy(
                    update={
                        "exclude_tags": default_exclude_tags_for_zone_phase(
                            p.body_zone, p.phase
                        )
                    }
                )
            return p
        except Exception:
            pass
    zone = str(raw.get("zone") or "").strip()
    if not zone:
        return None
    bz = normalize_legacy_zone(zone)
    sev = str(raw.get("severity") or "leve").lower()
    phase: InjuryPhase = "trainable_low_pain"
    if sev == "alta":
        phase = "acute"
    elif sev == "moderada":
        phase = "trainable_low_pain"
    notes = (raw.get("notes") or "").strip()
    ex = default_exclude_tags_for_zone_phase(bz, phase)
    return InjuryProfile(
        bodyZone=bz,
        customBodyZoneLabel=zone if bz == "other" else None,
        diagnosisLabel=zone if bz == "other" else None,
        phase=phase,
        goal="prioritize_recovery" if sev == "alta" else "maintain_fitness",
        excludeTags=ex,
        notes=notes or None,
    )


def parse_injury_list(raw_list: list) -> list[InjuryProfile]:
    out: list[InjuryProfile] = []
    for item in raw_list or []:
        if not isinstance(item, dict):
            continue
        p = injury_profile_from_dict(item)
        if p:
            out.append(p)
    return out
