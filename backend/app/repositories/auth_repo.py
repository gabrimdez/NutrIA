from uuid import UUID

from sqlalchemy import and_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import AppUser, AuthIdentity, AuthRefreshToken, EmailVerificationToken, PasswordResetToken


class AuthRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_id(self, user_id: str) -> AppUser | None:
        try:
            uid = UUID(str(user_id))
        except (TypeError, ValueError):
            return None
        stmt = select(AppUser).where(AppUser.id == uid)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_email(self, email: str) -> AppUser | None:
        stmt = select(AppUser).where(AppUser.email == email.lower().strip())
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def create(self, email: str, password_hash: str | None) -> AppUser:
        user = AppUser(email=email.lower().strip(), password_hash=password_hash)
        self.db.add(user)
        await self.db.flush()
        return user

    async def get_identity(self, provider: str, provider_subject: str) -> AuthIdentity | None:
        stmt = select(AuthIdentity).where(
            AuthIdentity.provider == provider,
            AuthIdentity.provider_subject == provider_subject,
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def create_identity(
        self,
        *,
        user_id: UUID,
        provider: str,
        provider_subject: str,
        email: str | None,
        email_verified: bool,
    ) -> AuthIdentity:
        identity = AuthIdentity(
            user_id=user_id,
            provider=provider,
            provider_subject=provider_subject,
            email=email.lower().strip() if email else None,
            email_verified=bool(email_verified),
        )
        self.db.add(identity)
        await self.db.flush()
        return identity

    async def create_refresh_token(
        self,
        *,
        user_id: UUID,
        token_hash: str,
        token_version: int,
        expires_at,
    ) -> AuthRefreshToken:
        token = AuthRefreshToken(
            user_id=user_id,
            token_hash=token_hash,
            token_version=int(token_version or 0),
            expires_at=expires_at,
        )
        self.db.add(token)
        await self.db.flush()
        return token

    async def get_refresh_token(self, token_hash: str) -> AuthRefreshToken | None:
        stmt = select(AuthRefreshToken).where(AuthRefreshToken.token_hash == token_hash)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def revoke_refresh_token(self, token_hash: str, revoked_at, replaced_by_hash: str | None = None) -> None:
        stmt = (
            update(AuthRefreshToken)
            .where(AuthRefreshToken.token_hash == token_hash, AuthRefreshToken.revoked_at.is_(None))
            .values(revoked_at=revoked_at, replaced_by_hash=replaced_by_hash, last_used_at=revoked_at)
        )
        await self.db.execute(stmt)

    async def revoke_refresh_tokens_for_user(self, user_id: UUID, revoked_at) -> None:
        stmt = (
            update(AuthRefreshToken)
            .where(AuthRefreshToken.user_id == user_id, AuthRefreshToken.revoked_at.is_(None))
            .values(revoked_at=revoked_at)
        )
        await self.db.execute(stmt)

    async def update_password_hash_and_bump_token_version(self, user_id: UUID, password_hash: str) -> None:
        stmt = (
            update(AppUser)
            .where(AppUser.id == user_id)
            .values(password_hash=password_hash, token_version=AppUser.token_version + 1)
        )
        await self.db.execute(stmt)

    async def create_password_reset_token(
        self,
        user_id: UUID,
        token_hash: str,
        expires_at,
    ) -> PasswordResetToken:
        token = PasswordResetToken(user_id=user_id, token_hash=token_hash, expires_at=expires_at)
        self.db.add(token)
        await self.db.flush()
        return token

    async def get_password_reset_token(self, token_hash: str) -> PasswordResetToken | None:
        stmt = select(PasswordResetToken).where(PasswordResetToken.token_hash == token_hash)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def mark_password_reset_used(self, token_id: UUID, used_at) -> None:
        stmt = (
            update(PasswordResetToken)
            .where(PasswordResetToken.id == token_id)
            .values(used_at=used_at)
        )
        await self.db.execute(stmt)

    async def consume_password_reset_token(self, token_hash: str, used_at) -> PasswordResetToken | None:
        stmt = (
            update(PasswordResetToken)
            .where(
                and_(
                    PasswordResetToken.token_hash == token_hash,
                    PasswordResetToken.used_at.is_(None),
                    PasswordResetToken.expires_at > used_at,
                )
            )
            .values(used_at=used_at)
            .returning(PasswordResetToken)
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def revoke_password_reset_tokens(self, user_id: UUID, used_at) -> None:
        stmt = (
            update(PasswordResetToken)
            .where(PasswordResetToken.user_id == user_id, PasswordResetToken.used_at.is_(None))
            .values(used_at=used_at)
        )
        await self.db.execute(stmt)

    async def create_email_verification_token(
        self,
        user_id: UUID,
        token_hash: str,
        expires_at,
    ) -> EmailVerificationToken:
        token = EmailVerificationToken(user_id=user_id, token_hash=token_hash, expires_at=expires_at)
        self.db.add(token)
        await self.db.flush()
        return token

    async def consume_email_verification_token(self, token_hash: str, used_at) -> EmailVerificationToken | None:
        stmt = (
            update(EmailVerificationToken)
            .where(
                and_(
                    EmailVerificationToken.token_hash == token_hash,
                    EmailVerificationToken.used_at.is_(None),
                    EmailVerificationToken.expires_at > used_at,
                )
            )
            .values(used_at=used_at)
            .returning(EmailVerificationToken)
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def revoke_email_verification_tokens(self, user_id: UUID, used_at) -> None:
        stmt = (
            update(EmailVerificationToken)
            .where(EmailVerificationToken.user_id == user_id, EmailVerificationToken.used_at.is_(None))
            .values(used_at=used_at)
        )
        await self.db.execute(stmt)

    async def mark_email_verified(self, user_id: UUID, verified_at) -> None:
        stmt = update(AppUser).where(AppUser.id == user_id).values(email_verified_at=verified_at)
        await self.db.execute(stmt)
