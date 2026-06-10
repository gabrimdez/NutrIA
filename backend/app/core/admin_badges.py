import secrets
from dataclasses import dataclass
from hashlib import sha256

from fastapi import Header, HTTPException, status

from app.core.config import get_settings


@dataclass(frozen=True)
class BadgeAdminPrincipal:
    actor: str
    key_fingerprint: str


@dataclass(frozen=True)
class _ConfiguredBadgeAdminKey:
    actor: str
    key_hash: str

    @property
    def principal(self) -> BadgeAdminPrincipal:
        return BadgeAdminPrincipal(actor=self.actor, key_fingerprint=self.key_hash[:16])


def _configured_badge_admin_keys(raw: str) -> list[_ConfiguredBadgeAdminKey]:
    out: list[_ConfiguredBadgeAdminKey] = []
    for idx, part in enumerate((raw or "").split(","), start=1):
        value = part.strip()
        if not value:
            continue
        actor = "admin" if idx == 1 else f"admin-{idx}"
        secret = value
        if ":" in value:
            raw_actor, raw_secret = value.split(":", 1)
            if raw_actor.strip() and raw_secret.strip():
                actor = raw_actor.strip()[:80]
                secret = raw_secret.strip()
        out.append(_ConfiguredBadgeAdminKey(actor=actor, key_hash=sha256(secret.encode("utf-8")).hexdigest()))
    return out


async def require_badges_admin_key(x_admin_key: str | None = Header(default=None, alias="X-Admin-Key")) -> BadgeAdminPrincipal:
    raw = (get_settings().badges_admin_api_key or "").strip()
    configured = _configured_badge_admin_keys(raw)
    if not configured:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="BADGES_ADMIN_API_KEY no configurada",
        )
    if any(len(secret.strip().split(":", 1)[-1]) < 32 for secret in raw.split(",") if secret.strip()):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="BADGES_ADMIN_API_KEY debe tener al menos 32 caracteres",
        )
    provided = (x_admin_key or "").strip()
    if not provided:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Clave admin inválida")
    provided_hash = sha256(provided.encode("utf-8")).hexdigest()
    for configured_key in configured:
        if secrets.compare_digest(provided_hash, configured_key.key_hash):
            return configured_key.principal
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Clave admin inválida")
