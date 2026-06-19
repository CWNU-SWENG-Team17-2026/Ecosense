# services/auth_service.py
import random
import string
from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.models.user import User
from app.schemas.auth import RegisterRequest
from app.utils.security import hash_password, verify_password
from app.utils.email import send_verification_email


def get_user_by_email(db: Session, email: str) -> User | None:
    return db.query(User).filter(User.email == email).first()


def _generate_code(length: int = 6) -> str:
    return "".join(random.choices(string.digits, k=length))


def create_user(db: Session, payload: RegisterRequest) -> User:
    code = _generate_code()
    expires = datetime.now(timezone.utc) + timedelta(minutes=10)

    user = User(
        email=payload.email,
        password_hash=hash_password(payload.password),
        name=payload.name,
        phone=payload.phone,
        verify_code=code,
        verify_code_expires=expires,
        is_verified=False,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    send_verification_email(payload.email, code)
    return user


def verify_email(db: Session, email: str, code: str) -> bool:
    user = get_user_by_email(db, email)
    if not user:
        return False
    if user.is_verified:
        return True
    if user.verify_code != code:
        return False
    now = datetime.now(timezone.utc)
    exp = user.verify_code_expires
    if exp and exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    if exp and now > exp:
        return False

    user.is_verified = True
    user.verify_code = None
    user.verify_code_expires = None
    db.commit()
    return True


def resend_verify_code(db: Session, email: str) -> bool:
    user = get_user_by_email(db, email)
    if not user or user.is_verified:
        return False

    code = _generate_code()
    user.verify_code = code
    user.verify_code_expires = datetime.now(timezone.utc) + timedelta(minutes=10)
    db.commit()

    send_verification_email(email, code)
    return True


def authenticate_user(db: Session, email: str, password: str) -> User | None:
    user = get_user_by_email(db, email)
    if not user or not verify_password(password, user.password_hash):
        return None
    return user
