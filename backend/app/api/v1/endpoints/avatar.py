import logging
import re
import uuid
import hmac
from hashlib import sha256
from pathlib import Path
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, Response, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.image_uploads import extension_for_image_mime, read_limited_image_upload
from app.core.rate_limit import limit_if_enabled
from app.core.security import get_current_user_id
from app.core.config import get_settings
from app.db.session import get_async_session_maker, get_db
from app.repositories.profile_repo import ProfileRepository

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/me", tags=["avatar"])

MAX_FILE_SIZE = 5 * 1024 * 1024

AVATARS_DIR = Path(__file__).resolve().parents[5] / "uploads" / "avatars"
_AVATAR_ID_RE = re.compile(r"^[a-f0-9]{16,32}$")


def _avatar_signature(asset_id: str) -> str:
    secret = (get_settings().jwt_secret or get_settings().secret_key or "").strip()
    if not secret:
        raise HTTPException(503, "Servidor sin secreto de firma configurado")
    return hmac.new(secret.encode("utf-8"), f"avatar:{asset_id}".encode("utf-8"), sha256).hexdigest()[:32]


def _signed_avatar_url(asset_id: str, cache_bust: str) -> str:
    return f"/api/v1/me/avatar/{asset_id}?v={cache_bust}&sig={_avatar_signature(asset_id)}"


def _require_valid_avatar_signature(asset_id: str, sig: str | None) -> None:
    if not sig or not hmac.compare_digest(sig, _avatar_signature(asset_id)):
        raise HTTPException(403, "Firma de avatar invalida")


def _avatar_id_from_url(avatar_url: str | None) -> str | None:
    if not avatar_url:
        return None
    path = urlparse(str(avatar_url)).path
    marker = "/api/v1/me/avatar/"
    if marker not in path:
        return None
    asset_id = path.rsplit(marker, 1)[-1].strip("/")
    return asset_id if _AVATAR_ID_RE.fullmatch(asset_id) else None


def _delete_avatar_asset(asset_id: str | None) -> None:
    if not asset_id or not _AVATAR_ID_RE.fullmatch(asset_id):
        return
    base_resolved = AVATARS_DIR.resolve()
    for ext in (".jpg", ".png", ".webp"):
        path = (AVATARS_DIR / f"{asset_id}{ext}").resolve()
        try:
            path.relative_to(base_resolved)
        except ValueError:
            continue
        if path.exists():
            path.unlink(missing_ok=True)


@router.post("/avatar")
@limit_if_enabled("20/minute")
async def upload_avatar(
    request: Request,
    file: UploadFile = File(...),
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    data, mime = await read_limited_image_upload(file, MAX_FILE_SIZE)
    extension_for_image_mime(mime)

    repo = ProfileRepository(db)
    profile = await repo.get_by_user_id(user_id)
    old_asset_id = _avatar_id_from_url(getattr(profile, "avatar_url", None))
    await repo.delete_avatar_by_asset_id(old_asset_id)
    _delete_avatar_asset(old_asset_id)

    asset_id = uuid.uuid4().hex
    await repo.save_avatar(user_id, asset_id=asset_id, mime_type=mime, data=data)

    cache_bust = uuid.uuid4().hex[:8]
    avatar_url = _signed_avatar_url(asset_id, cache_bust)

    await repo.update_profile(user_id, avatar_url=avatar_url)
    await db.commit()

    return {"avatar_url": avatar_url}


@router.get("/avatar/{avatar_id}")
async def get_avatar(
    avatar_id: str,
    sig: str | None = Query(default=None, min_length=16, max_length=128),
):
    if not _AVATAR_ID_RE.fullmatch(avatar_id or ""):
        raise HTTPException(400, "avatar_id invalido")
    _require_valid_avatar_signature(avatar_id, sig)
    if (get_settings().database_url or "").strip():
        try:
            factory = get_async_session_maker()
            async with factory() as db:
                repo = ProfileRepository(db)
                avatar = await repo.get_avatar_by_asset_id(avatar_id)
                if avatar:
                    return Response(
                        content=avatar.data,
                        media_type=avatar.mime_type,
                        headers={"Cache-Control": "public, max-age=86400", "X-Content-Type-Options": "nosniff"},
                    )
        except Exception:
            logger.exception("No se pudo leer avatar desde BD; intentando fallback local")

    base_resolved = AVATARS_DIR.resolve()
    for ext in (".jpg", ".png", ".webp"):
        try:
            path = (AVATARS_DIR / f"{avatar_id}{ext}").resolve(strict=True)
        except OSError:
            continue
        try:
            path.relative_to(base_resolved)
        except ValueError:
            raise HTTPException(400, "avatar_id invalido") from None
        media = {".jpg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"}[ext]
        return FileResponse(
            path,
            media_type=media,
            headers={"Cache-Control": "public, max-age=86400", "X-Content-Type-Options": "nosniff"},
        )
    raise HTTPException(404, "Sin avatar")


@router.delete("/avatar")
async def delete_avatar(
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    repo = ProfileRepository(db)
    profile = await repo.get_by_user_id(user_id)
    old_asset_id = _avatar_id_from_url(getattr(profile, "avatar_url", None))
    await repo.delete_avatar_by_asset_id(old_asset_id)
    _delete_avatar_asset(old_asset_id)
    await repo.clear_avatar(user_id)
    await db.commit()

    return {"avatar_url": None}
