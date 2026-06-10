from pydantic import BaseModel, EmailStr, Field
from typing import Optional
from uuid import UUID


class TokenPayload(BaseModel):
    sub: str
    exp: Optional[int] = None
    email: Optional[str] = None


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6, max_length=200)
    display_name: Optional[str] = Field(default=None, max_length=100)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=200)
    remember_me: bool = True


class RefreshRequest(BaseModel):
    refresh_token: Optional[str] = Field(default=None, min_length=32, max_length=512)


class LogoutRequest(BaseModel):
    refresh_token: Optional[str] = Field(default=None, min_length=32, max_length=512)


class OAuthTokenRequest(BaseModel):
    id_token: str = Field(min_length=32, max_length=10000)
    remember_me: bool = True
    display_name: Optional[str] = Field(default=None, max_length=100)


class PasswordResetRequest(BaseModel):
    email: EmailStr


class PasswordResetConfirmRequest(BaseModel):
    token: str = Field(min_length=32, max_length=256)
    new_password: str = Field(min_length=6, max_length=200)


class PasswordChangeRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=200)
    new_password: str = Field(min_length=6, max_length=200)


class EmailVerificationRequest(BaseModel):
    email: EmailStr


class EmailVerificationConfirmRequest(BaseModel):
    token: str = Field(min_length=32, max_length=256)


class MessageResponse(BaseModel):
    message: str


class UserPublic(BaseModel):
    id: UUID
    email: str
    email_verified: bool = False


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: Optional[str] = None
    token_type: str = "bearer"
    user: UserPublic
