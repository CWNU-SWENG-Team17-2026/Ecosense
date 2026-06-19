from fastapi import APIRouter, Cookie, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.auth import LoginRequest, RegisterRequest, UserResponse
from app.services.auth_service import authenticate_user, create_user, get_user_by_email
from app.utils.jwt_utils import (
    TOKEN_TYPE_REFRESH,
    create_access_token,
    create_refresh_token,
    validate_token,
)

router = APIRouter(prefix="/auth", tags=["auth"])
settings = get_settings()


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


@router.post("/register", response_model=UserResponse)
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    if get_user_by_email(db, payload.email):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="이미 등록된 이메일입니다.",
        )

    user = create_user(db, payload)
    return UserResponse(
        id=str(user.id),
        email=user.email,
        created_at=user.created_at,
    )


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
        created_at=user.created_at,
    )


@router.post("/logout")
def logout(response: Response):
    _clear_auth_cookies(response)
    return {"message": "로그아웃되었습니다."}


@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    return UserResponse(
        id=str(current_user.id),
        email=current_user.email,
        created_at=current_user.created_at,
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
            detail="리프레시 토큰이 없습니다.",
        )

    payload = validate_token(refresh_token, TOKEN_TYPE_REFRESH)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="유효하지 않은 리프레시 토큰입니다.",
        )

    user = db.get(User, int(payload["sub"]))
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="사용자를 찾을 수 없습니다.",
        )

    _set_auth_cookies(response, user)
    return {"message": "토큰이 갱신되었습니다."}