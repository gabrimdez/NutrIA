"""Insignias: usuario (/me/badges) y admin (/admin/badges)."""

import re
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Annotated, Optional

import aiofiles
from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.admin_badges import BadgeAdminPrincipal, require_badges_admin_key
from app.core.image_uploads import extension_for_image_mime, read_limited_image_upload
from app.core.rate_limit import limit_if_enabled
from app.core.security import get_current_user_id
from app.db.session import get_db
from app.models.models import AppUser, BadgeCategory, BadgeDefinition, BadgeRarity, utc_now_naive
from app.repositories.badge_repo import BadgeRepository
from app.schemas.badges import (
    AdminBadgeCreateDTO,
    AdminBadgePatchDTO,
    AdminGrantDTO,
    AdminRecomputeDTO,
    AdminRevokeDTO,
    BadgeCatalogItemDTO,
    BadgeProgressDTO,
    FeaturedBadgeSlotDTO,
    FeaturedBadgesUpdateDTO,
)
from app.services.badge_orchestrator import BadgeOrchestrator

BADGES_DIR = Path(__file__).resolve().parents[5] / "uploads" / "badges"
BADGES_ASSETS_FALLBACK = Path(__file__).resolve().parents[5] / "mobile" / "assets" / "images" / "badges"
MAX_IMG = 5 * 1024 * 1024

router_user = APIRouter(prefix="/me/badges", tags=["badges"])
router_admin = APIRouter(prefix="/admin/badges", tags=["badges-admin"])

# Solo IDs seguros (semillas tipo `onboarding-complete`, uploads `uuid.hex`); evita traversal en rutas.
_BADGE_MEDIA_ASSET_ID = re.compile(r"^[a-zA-Z0-9_-]{1,120}$")


def _badge_asset_mtime(asset_id: str) -> int | None:
    """mtime del fichero en disco para bust de caché al sustituir PNG sin tocar la fila en BD."""
    for base in (BADGES_DIR, BADGES_ASSETS_FALLBACK):
        for ext in (".jpg", ".png", ".webp"):
            p = base / f"{asset_id}{ext}"
            if p.is_file():
                return int(p.stat().st_mtime)
    return None


def append_badge_media_cache_buster(image_url: str | None) -> str | None:
    if not image_url or not str(image_url).strip():
        return image_url
    u = str(image_url).strip()
    path_only = u.split("?", 1)[0]
    if "/me/badges/media/" not in path_only:
        return image_url
    tail = path_only.split("/me/badges/media/", 1)[-1]
    if not _BADGE_MEDIA_ASSET_ID.fullmatch(tail):
        return image_url
    mtime = _badge_asset_mtime(tail)
    if mtime is None:
        return image_url
    sep = "&" if "?" in u else "?"
    return f"{u}{sep}v={mtime}"


@router_user.get("/catalog", response_model=list[BadgeCatalogItemDTO])
async def user_badge_catalog(
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
    status: str = Query(default="all", pattern="^(all|unlocked|locked)$"),
    rarity: Optional[str] = Query(default=None),
    category: Optional[str] = Query(default=None),
):
    repo = BadgeRepository(db)
    orch = BadgeOrchestrator(db)
    defs = await repo.list_definitions(active_only=False)
    user_badges = await repo.get_user_badges_batch(user_id, [d.id for d in defs])
    out: list[BadgeCatalogItemDTO] = []
    for d in defs:
        r = d.rarity.value if hasattr(d.rarity, "value") else str(d.rarity)
        c = d.category.value if hasattr(d.category, "value") else str(d.category)
        if rarity and r != rarity:
            continue
        if category and c != category:
            continue
        ub = user_badges.get(d.id)
        unlocked = ub is not None and ub.revoked_at is None and ub.unlocked_at is not None
        if status == "unlocked" and not unlocked:
            continue
        if status == "locked" and unlocked:
            continue
        raw = await orch.build_catalog_item(user_id, d, ub)
        if not d.is_active and not unlocked:
            continue
        prog = raw.get("progress")
        out.append(
            BadgeCatalogItemDTO(
                badge_id=raw["badge_id"],
                name=raw["name"],
                description=raw["description"],
                unlock_criteria_text=raw["unlock_criteria_text"],
                image_url=append_badge_media_cache_buster(raw["image_url"]),
                rarity=raw["rarity"],
                category=raw["category"],
                is_active=raw["is_active"],
                unlocked=raw["unlocked"],
                unlocked_at=raw["unlocked_at"],
                revoked_at=raw["revoked_at"],
                progress=BadgeProgressDTO(**prog) if prog and prog.get("target") is not None else None,
                source=raw.get("source"),
            )
        )
    return out


def _naive_utc(dt: datetime) -> datetime:
    """Normaliza a UTC sin tzinfo para columnas `DateTime` naive (asyncpg + TIMESTAMP)."""
    if dt.tzinfo is None:
        return dt
    return dt.astimezone(timezone.utc).replace(tzinfo=None)


def _parse_badge_since(s: str | None) -> datetime:
    """UTC naive para comparar con `unlocked_at`. Vacío/inválido → hace 5 minutos (UTC)."""
    fallback = _naive_utc(datetime.now(timezone.utc) - timedelta(minutes=5))
    if not s or not str(s).strip():
        return fallback
    raw = str(s).strip()
    if raw.endswith("Z"):
        raw = raw[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(raw)
    except (ValueError, TypeError):
        return fallback
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return _naive_utc(dt.astimezone(timezone.utc))


@router_user.get("/recent", response_model=list[BadgeCatalogItemDTO])
async def user_badges_recent(
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
    since: Optional[str] = Query(
        default=None, description="ISO8601; si vacío o inválido, solo últimos 5 min (UTC)"
    ),
    limit: int = Query(default=10, ge=1, le=50),
):
    repo = BadgeRepository(db)
    orch = BadgeOrchestrator(db)
    since_dt = _parse_badge_since(since)
    rows = await repo.list_user_badges_unlocked_since(user_id, since_dt, limit=limit)
    out: list[BadgeCatalogItemDTO] = []
    for ub, d in rows:
        raw = await orch.build_catalog_item(user_id, d, ub)
        if not d.is_active and not raw.get("unlocked"):
            continue
        prog = raw.get("progress")
        out.append(
            BadgeCatalogItemDTO(
                badge_id=raw["badge_id"],
                name=raw["name"],
                description=raw["description"],
                unlock_criteria_text=raw["unlock_criteria_text"],
                image_url=append_badge_media_cache_buster(raw["image_url"]),
                rarity=raw["rarity"],
                category=raw["category"],
                is_active=raw["is_active"],
                unlocked=raw["unlocked"],
                unlocked_at=raw["unlocked_at"],
                revoked_at=raw["revoked_at"],
                progress=BadgeProgressDTO(**prog) if prog and prog.get("target") is not None else None,
                source=raw.get("source"),
            )
        )
    return out


@router_user.get("/featured", response_model=list[FeaturedBadgeSlotDTO])
async def user_featured_badges(
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    repo = BadgeRepository(db)
    rows = await repo.list_featured(user_id)
    slots: list[FeaturedBadgeSlotDTO] = []
    by_pos = {r.position: r for r in rows}
    for pos in (1, 2, 3):
        r = by_pos.get(pos)
        if not r:
            slots.append(FeaturedBadgeSlotDTO(position=pos, badge_id=None, name=None, image_url=None))
            continue
        d = await repo.get_definition_by_pk(r.badge_definition_id)
        slots.append(
            FeaturedBadgeSlotDTO(
                position=pos,
                badge_id=d.badge_id if d else None,
                name=d.name if d else None,
                image_url=append_badge_media_cache_buster(d.image_url) if d else None,
            )
        )
    return slots


@router_user.put("/featured", response_model=list[FeaturedBadgeSlotDTO])
async def user_set_featured(
    body: FeaturedBadgesUpdateDTO,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    repo = BadgeRepository(db)
    ids: list[uuid.UUID] = []
    seen: set[str] = set()
    for bid in body.badge_ids:
        if bid in seen:
            continue
        seen.add(bid)
        d = await repo.get_definition_by_badge_id(bid)
        if not d or not d.is_active:
            raise HTTPException(400, f"Insignia no disponible: {bid}")
        ub = await repo.get_user_badge_row(user_id, d.id)
        if not ub or ub.revoked_at is not None or not ub.unlocked_at:
            raise HTTPException(400, "Solo puedes destacar insignias desbloqueadas")
        ids.append(d.id)
    await repo.set_featured(user_id, ids)
    rows = await repo.list_featured(user_id)
    by_pos = {r.position: r for r in rows}
    slots: list[FeaturedBadgeSlotDTO] = []
    for pos in (1, 2, 3):
        r = by_pos.get(pos)
        if not r:
            slots.append(FeaturedBadgeSlotDTO(position=pos, badge_id=None, name=None, image_url=None))
            continue
        d = await repo.get_definition_by_pk(r.badge_definition_id)
        slots.append(
            FeaturedBadgeSlotDTO(
                position=pos,
                badge_id=d.badge_id if d else None,
                name=d.name if d else None,
                image_url=append_badge_media_cache_buster(d.image_url) if d else None,
            )
        )
    return slots


@router_user.get("/media/{asset_id}")
async def serve_badge_media(asset_id: str):
    """Público: `<Image>` / `<img>` no envían Bearer; solo sirve ficheros bajo uploads o assets embebidos."""
    if not _BADGE_MEDIA_ASSET_ID.fullmatch(asset_id or ""):
        raise HTTPException(400, "asset_id inválido")
    for base in (BADGES_DIR, BADGES_ASSETS_FALLBACK):
        base_resolved = base.resolve()
        for ext in (".jpg", ".png", ".webp"):
            try:
                path = (base / f"{asset_id}{ext}").resolve(strict=True)
            except OSError:
                continue
            try:
                path.relative_to(base_resolved)
            except ValueError:
                continue
            media = {".jpg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"}[ext]
            # Las URLs públicas salen con `?v=<mtime>` desde `append_badge_media_cache_buster`,
            # así que aquí podemos marcar el asset como inmutable y evitar revalidaciones en cada vista.
            return FileResponse(
                path,
                media_type=media,
                headers={"Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff"},
            )
    raise HTTPException(404, "Imagen no encontrada")


# --- Admin ---


@router_admin.post("/upload")
@limit_if_enabled("20/minute")
async def admin_upload_badge_image(
    request: Request,
    file: Annotated[UploadFile, File()],
    _: Annotated[BadgeAdminPrincipal, Depends(require_badges_admin_key)],
):
    data, mime = await read_limited_image_upload(file, MAX_IMG)
    aid = uuid.uuid4().hex
    ext = extension_for_image_mime(mime)
    BADGES_DIR.mkdir(parents=True, exist_ok=True)
    dest = BADGES_DIR / f"{aid}{ext}"
    async with aiofiles.open(dest, "wb") as f:
        await f.write(data)
    url = f"/api/v1/me/badges/media/{aid}"
    return {"image_url": url}


@router_admin.post("", status_code=201)
@limit_if_enabled("60/minute")
async def admin_create_badge(
    request: Request,
    body: AdminBadgeCreateDTO,
    db: AsyncSession = Depends(get_db),
    admin: BadgeAdminPrincipal = Depends(require_badges_admin_key),
):
    repo = BadgeRepository(db)
    if await repo.get_definition_by_badge_id(body.badge_id):
        raise HTTPException(409, "badge_id ya existe")
    row = BadgeDefinition(
        badge_id=body.badge_id.strip(),
        name=body.name.strip(),
        description=body.description.strip(),
        unlock_criteria_text=body.unlock_criteria_text.strip(),
        image_url=body.image_url,
        rarity=BadgeRarity(body.rarity),
        category=BadgeCategory(body.category),
        unlock_rule=body.unlock_rule,
        is_active=body.is_active,
    )
    await repo.create_definition(row)
    await repo.add_audit(
        admin.actor,
        "definition_create",
        badge_definition_id=row.id,
        details={"badge_id": row.badge_id, "key": admin.key_fingerprint},
    )
    return {"badge_id": row.badge_id, "id": str(row.id)}


@router_admin.patch("/{badge_id}")
@limit_if_enabled("60/minute")
async def admin_patch_badge(
    request: Request,
    badge_id: str,
    body: AdminBadgePatchDTO,
    db: AsyncSession = Depends(get_db),
    admin: BadgeAdminPrincipal = Depends(require_badges_admin_key),
):
    repo = BadgeRepository(db)
    d = await repo.get_definition_by_badge_id(badge_id)
    if not d:
        raise HTTPException(404, "No encontrada")
    vals = body.model_dump(exclude_unset=True)
    if "rarity" in vals and vals["rarity"] is not None:
        vals["rarity"] = BadgeRarity(vals["rarity"])
    if "category" in vals and vals["category"] is not None:
        vals["category"] = BadgeCategory(vals["category"])
    if vals:
        vals["updated_at"] = utc_now_naive()
        await repo.update_definition(d.id, vals)
    await repo.add_audit(
        admin.actor,
        "definition_patch",
        badge_definition_id=d.id,
        details={"badge_id": badge_id, "key": admin.key_fingerprint},
    )
    return {"ok": True}


@router_admin.post("/recompute")
@limit_if_enabled("5/minute")
async def admin_recompute(
    request: Request,
    body: AdminRecomputeDTO,
    db: AsyncSession = Depends(get_db),
    admin: BadgeAdminPrincipal = Depends(require_badges_admin_key),
):
    orch = BadgeOrchestrator(db)
    repo = BadgeRepository(db)
    if body.user_id:
        await orch.recompute_user(body.user_id.strip())
        await repo.add_audit(admin.actor, "recompute", user_id=body.user_id, details={"key": admin.key_fingerprint})
    else:
        from sqlalchemy import select as sa_select

        r = await db.execute(sa_select(AppUser.id))
        for (uid,) in r.all():
            await orch.recompute_user(str(uid))
        await repo.add_audit(admin.actor, "recompute_all", details={"key": admin.key_fingerprint})
    return {"ok": True}


@router_admin.post("/{badge_id}/grant")
@limit_if_enabled("60/minute")
async def admin_grant(
    request: Request,
    badge_id: str,
    body: AdminGrantDTO,
    db: AsyncSession = Depends(get_db),
    admin: BadgeAdminPrincipal = Depends(require_badges_admin_key),
):
    repo = BadgeRepository(db)
    orch = BadgeOrchestrator(db)
    d = await repo.get_definition_by_badge_id(badge_id)
    if not d:
        raise HTTPException(404, "No encontrada")
    await orch.grant_manual(body.user_id.strip(), d.id, actor=admin.actor)
    return {"ok": True}


@router_admin.post("/{badge_id}/revoke")
@limit_if_enabled("60/minute")
async def admin_revoke(
    request: Request,
    badge_id: str,
    body: AdminRevokeDTO,
    db: AsyncSession = Depends(get_db),
    admin: BadgeAdminPrincipal = Depends(require_badges_admin_key),
):
    repo = BadgeRepository(db)
    orch = BadgeOrchestrator(db)
    d = await repo.get_definition_by_badge_id(badge_id)
    if not d:
        raise HTTPException(404, "No encontrada")
    await orch.revoke_manual(body.user_id.strip(), d.id, body.reason.strip(), actor=admin.actor)
    return {"ok": True}
