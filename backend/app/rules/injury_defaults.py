"""Tags por defecto según zona anatómica y fase; fusión con excludeTags del usuario."""

from __future__ import annotations

# Tags alineados con la taxonomía del producto (subset MVP)
DEFAULT_EXCLUDES_BY_ZONE_PHASE: dict[str, dict[str, list[str]]] = {
    "shoulder": {
        "acute": [
            "overhead_press",
            "shoulder_end_range_abduction",
            "shoulder_external_rotation_load",
        ],
        "rehab_only": [
            "overhead_press",
            "shoulder_end_range_abduction",
            "shoulder_external_rotation_load",
        ],
        "trainable_low_pain": [],
        "return_to_training": [],
    },
    "knee": {
        "acute": [
            "deep_knee_flexion",
            "jumping_impact",
            "running_impact",
            "change_of_direction",
        ],
        "rehab_only": [
            "deep_knee_flexion",
            "jumping_impact",
            "running_impact",
            "change_of_direction",
        ],
        "trainable_low_pain": [],
        "return_to_training": [],
    },
    "lumbar": {
        "acute": [
            "loaded_spinal_flexion",
            "loaded_spinal_rotation",
            "axial_loading",
        ],
        "rehab_only": [
            "loaded_spinal_flexion",
            "loaded_spinal_rotation",
            "axial_loading",
        ],
        "trainable_low_pain": [],
        "return_to_training": [],
    },
    "hip": {
        "acute": ["jumping_impact", "change_of_direction", "deep_knee_flexion"],
        "rehab_only": ["jumping_impact", "change_of_direction", "deep_knee_flexion"],
        "trainable_low_pain": [],
        "return_to_training": [],
    },
    "ankle_foot": {
        "acute": ["jumping_impact", "running_impact", "change_of_direction", "ankle_plyometric_load"],
        "rehab_only": ["jumping_impact", "running_impact", "change_of_direction", "ankle_plyometric_load"],
        "trainable_low_pain": [],
        "return_to_training": [],
    },
    "elbow": {
        "acute": ["wrist_extension_load"],
        "rehab_only": ["wrist_extension_load"],
        "trainable_low_pain": [],
        "return_to_training": [],
    },
    "wrist_hand": {
        "acute": ["wrist_extension_load"],
        "rehab_only": ["wrist_extension_load"],
        "trainable_low_pain": [],
        "return_to_training": [],
    },
    "cervical": {
        "acute": ["loaded_spinal_flexion", "axial_loading"],
        "rehab_only": ["loaded_spinal_flexion", "axial_loading"],
        "trainable_low_pain": [],
        "return_to_training": [],
    },
    "thoracic": {
        "acute": ["loaded_spinal_rotation", "loaded_spinal_flexion"],
        "rehab_only": ["loaded_spinal_rotation", "loaded_spinal_flexion"],
        "trainable_low_pain": [],
        "return_to_training": [],
    },
    "other": {
        "acute": [],
        "rehab_only": [],
        "trainable_low_pain": [],
        "return_to_training": [],
    },
}


def default_exclude_tags_for_zone_phase(body_zone: str, phase: str) -> list[str]:
    z = DEFAULT_EXCLUDES_BY_ZONE_PHASE.get(body_zone)
    if not z:
        return []
    return list(z.get(phase, []))
