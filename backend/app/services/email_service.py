import asyncio
import logging
import smtplib
from email.message import EmailMessage

from app.core.config import get_settings
from app.core.log_sanitize import anonymize_email_for_log

logger = logging.getLogger(__name__)


def _send_message_sync(message: EmailMessage) -> None:
    settings = get_settings()
    if settings.smtp_use_tls:
        with smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, timeout=15) as smtp:
            if settings.smtp_username:
                smtp.login(settings.smtp_username, settings.smtp_password)
            smtp.send_message(message)
        return

    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as smtp:
        if settings.smtp_starttls:
            smtp.starttls()
        if settings.smtp_username:
            smtp.login(settings.smtp_username, settings.smtp_password)
        smtp.send_message(message)


async def send_password_reset_email(recipient: str, reset_url: str, expires_minutes: int) -> bool:
    settings = get_settings()
    if not settings.smtp_host or not settings.smtp_from_email:
        if settings.environment == "development":
            logger.warning(
                "DEV password reset requested for %s; configure SMTP to deliver links.",
                anonymize_email_for_log(recipient),
            )
        else:
            logger.error("SMTP no configurado; no se pudo enviar recuperacion a %s", anonymize_email_for_log(recipient))
        return False

    message = EmailMessage()
    message["Subject"] = "Recupera tu contrasena de NutrIA"
    message["From"] = settings.smtp_from_email
    message["To"] = recipient
    message.set_content(
        "\n".join(
            [
                "Hemos recibido una solicitud para restablecer tu contrasena de NutrIA.",
                "",
                f"Abre este enlace para crear una nueva contrasena: {reset_url}",
                "",
                f"El enlace caduca en {expires_minutes} minutos.",
                "Si no has solicitado este cambio, puedes ignorar este correo.",
            ]
        )
    )

    await asyncio.to_thread(_send_message_sync, message)
    return True


async def send_email_verification_email(recipient: str, verify_url: str, expires_minutes: int) -> bool:
    settings = get_settings()
    if not settings.smtp_host or not settings.smtp_from_email:
        if settings.environment == "development":
            logger.warning(
                "DEV email verification requested for %s; configure SMTP to deliver links.",
                anonymize_email_for_log(recipient),
            )
        else:
            logger.error("SMTP no configurado; no se pudo enviar verificacion a %s", anonymize_email_for_log(recipient))
        return False

    message = EmailMessage()
    message["Subject"] = "Verifica tu email de NutrIA"
    message["From"] = settings.smtp_from_email
    message["To"] = recipient
    message.set_content(
        "\n".join(
            [
                "Confirma tu email para activar tu cuenta de NutrIA.",
                "",
                f"Abre este enlace para verificar tu cuenta: {verify_url}",
                "",
                f"El enlace caduca en {expires_minutes} minutos.",
                "Si no has creado esta cuenta, puedes ignorar este correo.",
            ]
        )
    )

    await asyncio.to_thread(_send_message_sync, message)
    return True
