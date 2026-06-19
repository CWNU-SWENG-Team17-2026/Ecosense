import logging
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger(__name__)
_INSECURE_SECRET = "dev-secret-change-in-production"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "EcoSense API"
    debug: bool = True
    secret_key: str = _INSECURE_SECRET
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7

    database_url: str = "sqlite:///./ecosense.db"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173"
    # Vercel preview URL 허용 (선택). 예: https://.*\.vercel\.app
    cors_origin_regex: str = ""

    kma_api_key: str = ""
    kma_forecast_service_key: str = ""
    airkorea_api_key: str = ""
    outdoor_cache_ttl_minutes: int = 10

    cookie_secure: bool = False
    cookie_samesite: str = "lax"

    # Brevo 이메일
    brevo_api_key: str = ""
    brevo_sender_email: str = "noreply@ecosense.app"
    reset_db_on_startup: bool = False

    @property
    def cors_origin_list(self) -> list[str]:
        origins: list[str] = []
        for origin in self.cors_origins.split(","):
            normalized = origin.strip().rstrip("/")
            if normalized and normalized not in origins:
                origins.append(normalized)
        return origins

    @property
    def cors_origin_regex_pattern(self) -> str | None:
        pattern = self.cors_origin_regex.strip()
        return pattern or None

@lru_cache
def get_settings() -> Settings:
    s = Settings()
    if s.secret_key == _INSECURE_SECRET and not s.debug:
        raise RuntimeError("SECRET_KEY must be changed from the default before running in production.")
    if s.secret_key == _INSECURE_SECRET:
        logger.warning("⚠️  SECRET_KEY가 기본값입니다. 운영 전에 변경하세요.")
    if s.cookie_secure is False and not s.debug:
        logger.warning("⚠️  COOKIE_SECURE=False in production. HTTPS 환경에서는 true로 설정하세요.")
    if not s.debug:
        logger.info("CORS allow_origins=%s", s.cors_origin_list)
        if s.cors_origin_regex_pattern:
            logger.info("CORS allow_origin_regex=%s", s.cors_origin_regex_pattern)
        if not any("vercel.app" in o for o in s.cors_origin_list) and not s.cors_origin_regex_pattern:
            logger.warning(
                "⚠️  CORS에 Vercel URL이 없습니다. Render에 CORS_ORIGINS=https://ecosense-sooty.vercel.app 설정 필요"
            )
    return s
