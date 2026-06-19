# routers/auth.py
import logging

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response, status
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.auth import (
    LoginRequest, RegisterRequest, ResendVerifyRequest,
    UserResponse, VerifyEmailRequest,
)
from app.services.auth_service import (
    authenticate_user, create_user, get_user_by_email,
    verify_email, resend_verify_code,
)
from app.utils.jwt_utils import (
    TOKEN_TYPE_REFRESH,
    create_access_token,
    create_refresh_token,
    validate_token,
)

router = APIRouter(prefix="/auth", tags=["auth"])
settings = get_settings()
logger = logging.getLogger(__name__)


def _cookie_kwargs() -> dict:
    samesite = settings.cookie_samesite.lower()
    if samesite not in ("lax", "strict", "none"):
        samesite = "lax"
    return {
        "httponly": True,
        "secure": settings.cookie_secure,
        "samesite": samesite,
        "path": "/",
    }


def _set_auth_cookies(response: Response, user: User) -> None:
    cookie_opts = _cookie_kwargs()
    response.set_cookie(
        key="access_token",
        value=create_access_token(user.id, user.email),
        max_age=settings.access_token_expire_minutes * 60,
        **cookie_opts,
    )
    response.set_cookie(
        key="refresh_token",
        value=create_refresh_token(user.id, user.email),
        max_age=settings.refresh_token_expire_days * 24 * 60 * 60,
        **cookie_opts,
    )


def _clear_auth_cookies(response: Response) -> None:
    cookie_opts = _cookie_kwargs()
    response.delete_cookie(key="access_token", **cookie_opts)
    response.delete_cookie(key="refresh_token", **cookie_opts)


@router.post("/register")
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    """
    회원가입 요청
    - DB에 저장하지 않고 인증코드만 발송
    - 이미 가입된 이메일이면 409 반환
    """
    # 이미 가입된 이메일 확인
    if get_user_by_email(db, payload.email):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="이미 가입된 이메일입니다. 로그인 페이지에서 로그인해주세요.",
        )

    try:
        _, email_sent = create_user(db, payload)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="이미 가입된 이메일입니다. 로그인 페이지에서 로그인해주세요.",
        ) from None
    except SQLAlchemyError:
        db.rollback()
        logger.exception("register failed (database)")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "회원가입 DB 오류입니다. Render PostgreSQL 스키마가 구버전일 수 있습니다. "
                "RESET_DB_ON_STARTUP=true 로 1회 재배포 후 false로 되돌리세요."
            ),
        ) from None

    if not email_sent:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "회원 정보는 저장되었으나 인증 메일 발송에 실패했습니다. "
                "Render에 BREVO_API_KEY, BREVO_SENDER_EMAIL(verified sender)을 확인한 뒤 "
                "인증코드 재발송을 시도해주세요."
            ),
        )

    return {"message": f"{payload.email}로 인증코드를 발송했습니다. 10분 이내에 인증해주세요."}


@router.post("/verify")
def verify(payload: VerifyEmailRequest, db: Session = Depends(get_db)):
    """
    이메일 인증코드 확인
    - 인증 완료 후 DB에 사용자 저장
    """
    success = verify_email(db, payload.email, payload.code)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="인증코드가 올바르지 않거나 만료되었습니다.",
        )
    return {"message": "이메일 인증이 완료되었습니다. 로그인해주세요."}


@router.post("/resend-verify")
def resend_verify(payload: ResendVerifyRequest, db: Session = Depends(get_db)):
    user_ok, email_sent = resend_verify_code(db, payload.email)
    if not user_ok:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="인증코드 재발송에 실패했습니다.",
        )
    if not email_sent:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "인증코드는 갱신되었으나 메일 발송에 실패했습니다. "
                "BREVO_API_KEY와 BREVO_SENDER_EMAIL 설정을 확인해주세요."
            ),
        )
    return {"message": "인증코드가 재발송되었습니다."}


@router.post("/login", response_model=UserResponse)
def login(payload: LoginRequest, response: Response, db: Session = Depends(get_db)):
    user = authenticate_user(db, payload.email, payload.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="이메일 또는 비밀번호가 올바르지 않습니다.",
        )
    _set_auth_cookies(response, user)
    return UserResponse(
        id=str(user.id),
        email=user.email,
        name=user.name,
        phone=user.phone,
        created_at=user.created_at,
        is_verified=user.is_verified,
    )


@router.post("/logout")
def logout(response: Response):
    _clear_auth_cookies(response)
    return {"message": "로그아웃 되었습니다."}


@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    return UserResponse(
        id=str(current_user.id),
        email=current_user.email,
        name=current_user.name,
        phone=current_user.phone,
        created_at=current_user.created_at,
        is_verified=current_user.is_verified,
    )


@router.post("/refresh")
def refresh_token(
    response: Response,
    refresh_token: str | None = Cookie(default=None),
    db: Session = Depends(get_db),
):
    if not refresh_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh Token이 없습니다.",
        )
    payload = validate_token(refresh_token, TOKEN_TYPE_REFRESH)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="유효하지 않은 Refresh Token입니다.",
        )
    user = db.get(User, int(payload["sub"]))
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="사용자를 찾을 수 없습니다.",
        )
    _set_auth_cookies(response, user)
    return {"message": "Token이 갱신되었습니다."}
