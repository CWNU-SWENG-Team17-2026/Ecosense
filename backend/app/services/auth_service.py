# services/auth_service.py
import random
import string
from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import Session

from app.models.user import User
from app.schemas.auth import RegisterRequest
from app.utils.security import hash_password, verify_password
from app.utils.email import send_verification_email


def get_user_by_email(db: Session, email: str) -> User | None:
    return db.query(User).filter(User.email == email).first()


def _generate_code(length: int = 6) -> str:
    return "".join(random.choices(string.digits, k=length))


def register_or_resend(db: Session, payload: RegisterRequest) -> tuple[User, bool, bool]:
    """
    회원가입 또는 미인증 계정 재시도 처리.

    Returns:
        (user, email_sent, is_new)
        - is_new=True  : 신규 가입
        - is_new=False : 미인증 계정에 코드 재발급

    Raises:
        ValueError("already_verified") : 이미 인증 완료된 이메일
    """
    existing = get_user_by_email(db, payload.email)

    code = _generate_code()
    expires = datetime.now(timezone.utc) + timedelta(minutes=10)

    if existing:
        if existing.is_verified:
            raise ValueError("already_verified")
        # 미인증 계정 — 입력 정보 및 코드 갱신
        existing.password_hash = hash_password(payload.password)
        existing.name = payload.name
        existing.phone = payload.phone
        existing.verify_code = code
        existing.verify_code_expires = expires
        db.commit()
        db.refresh(existing)
        email_sent = send_verification_email(payload.email, code)
        return existing, email_sent, False

    # 신규 가입
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
    email_sent = send_verification_email(payload.email, code)
    return user, email_sent, True


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


def resend_verify_code(db: Session, email: str) -> tuple[bool, bool]:
    """(user_exists_and_pending, email_sent)"""
    user = get_user_by_email(db, email)
    if not user or user.is_verified:
        return False, False

    code = _generate_code()
    user.verify_code = code
    user.verify_code_expires = datetime.now(timezone.utc) + timedelta(minutes=10)
    db.commit()

    email_sent = send_verification_email(email, code)
    return True, email_sent


def authenticate_user(db: Session, email: str, password: str) -> User | None:
    """비밀번호 검증. is_verified 체크는 라우터에서 수행."""
    user = get_user_by_email(db, email)
    if not user or not verify_password(password, user.password_hash):
        return None
    return user
