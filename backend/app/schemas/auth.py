from datetime import datetime
from typing import Optional
from pydantic import BaseModel, EmailStr, Field


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=4, max_length=128)
    name: Optional[str] = None
    phone: Optional[str] = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class VerifyEmailRequest(BaseModel):
    email: EmailStr
    code: str


class ResendVerifyRequest(BaseModel):
    email: EmailStr


class UserResponse(BaseModel):
    id: str
    email: EmailStr
    name: Optional[str] = None
    phone: Optional[str] = None
    created_at: datetime
    is_verified: bool = False

    model_config = {"from_attributes": True}
