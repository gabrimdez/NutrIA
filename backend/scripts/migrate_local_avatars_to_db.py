"""
Migra avatares antiguos desde uploads/avatars a profile_avatars.

Uso (desde backend/, con DATABASE_URL configurado):
  python scripts/migrate_local_avatars_to_db.py

No cambia profile.avatar_url: conserva el asset_id y solo copia el binario a PostgreSQL.
"""
from __future__ import annotations

import asyncio
import sys
from pathlib import Path
from urllib.parse import urlparse

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from app.core.config import get_settings
from app.db.session import _asyncpg_database_url, _build_connect_args


REPO_ROOT = Path(__file__).resolve().parents[2]
AVATARS_DIR = REPO_ROOT / "uploads" / "avatars"
MARKER = "/api/v1/me/avatar/"
MEDIA_TYPES = {".jpg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"}


def asset_id_from_url(avatar_url: str | None) -> str | None:
    if not avatar_url:
        return None
    path = urlparse(str(avatar_url)).path
    if MARKER not in path:
        return None
    asset_id = path.rsplit(MARKER, 1)[-1].strip("/")
    return asset_id if asset_id else None


def avatar_file(asset_id: str) -> tuple[Path, str] | None:
    for ext, mime in MEDIA_TYPES.items():
        path = AVATARS_DIR / f"{asset_id}{ext}"
        if path.exists() and path.is_file():
            return path, mime
    return None


async def main() -> None:
    settings = get_settings()
    if not (settings.database_url or "").strip():
        print("DATABASE_URL no está configurado.", file=sys.stderr)
        sys.exit(1)

    engine = create_async_engine(
        _asyncpg_database_url(settings.database_url),
        connect_args=_build_connect_args(settings.database_url),
    )
    migrated = 0
    skipped = 0
    async with engine.begin() as conn:
        rows = (
            await conn.execute(
                text("SELECT user_id, avatar_url FROM profiles WHERE avatar_url IS NOT NULL")
            )
        ).fetchall()
        for user_id, avatar_url in rows:
            asset_id = asset_id_from_url(avatar_url)
            found = avatar_file(asset_id) if asset_id else None
            if not asset_id or not found:
                skipped += 1
                continue
            path, mime = found
            data = path.read_bytes()
            await conn.execute(
                text(
                    """
                    INSERT INTO profile_avatars (asset_id, user_id, mime_type, data, size_bytes, created_at, updated_at)
                    VALUES (:asset_id, :user_id, :mime_type, :data, :size_bytes, now(), now())
                    ON CONFLICT (asset_id) DO UPDATE
                    SET user_id = EXCLUDED.user_id,
                        mime_type = EXCLUDED.mime_type,
                        data = EXCLUDED.data,
                        size_bytes = EXCLUDED.size_bytes,
                        updated_at = now()
                    """
                ),
                {
                    "asset_id": asset_id,
                    "user_id": str(user_id),
                    "mime_type": mime,
                    "data": data,
                    "size_bytes": len(data),
                },
            )
            migrated += 1
    await engine.dispose()
    print(f"OK: migrados={migrated} omitidos={skipped}")


if __name__ == "__main__":
    asyncio.run(main())
