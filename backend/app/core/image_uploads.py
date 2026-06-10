from __future__ import annotations

from fastapi import HTTPException, UploadFile

JPEG = "image/jpeg"
PNG = "image/png"
WEBP = "image/webp"
GIF = "image/gif"

ALLOWED_IMAGE_MIMES = frozenset({JPEG, PNG, WEBP})
_MIME_ALIASES = {"image/jpg": JPEG}
_EXT_BY_MIME = {JPEG: ".jpg", PNG: ".png", WEBP: ".webp"}


def normalize_image_mime(mime: str | None) -> str | None:
    if not mime:
        return None
    clean = mime.split(";", 1)[0].strip().lower()
    return _MIME_ALIASES.get(clean, clean)


def extension_for_image_mime(mime: str) -> str:
    return _EXT_BY_MIME.get(mime, ".jpg")


def sniff_image_mime(data: bytes) -> str | None:
    if data.startswith(b"\xff\xd8\xff"):
        return JPEG
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return PNG
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return WEBP
    if data.startswith(b"GIF87a") or data.startswith(b"GIF89a"):
        return GIF
    return None


async def read_limited_image_upload(file: UploadFile, max_size: int) -> tuple[bytes, str]:
    data = bytearray()
    while True:
        chunk = await file.read(64 * 1024)
        if not chunk:
            break
        data.extend(chunk)
        if len(data) > max_size:
            raise HTTPException(status_code=400, detail="Imagen demasiado grande")

    raw = bytes(data)
    if not raw:
        raise HTTPException(status_code=400, detail="Imagen vacia")

    detected = sniff_image_mime(raw)
    if detected not in ALLOWED_IMAGE_MIMES:
        raise HTTPException(status_code=400, detail="Tipo de imagen no permitido. Usa JPEG, PNG o WebP.")

    declared = normalize_image_mime(file.content_type)
    if declared and declared != detected:
        raise HTTPException(status_code=400, detail="El tipo declarado no coincide con el contenido de la imagen")

    return raw, detected
