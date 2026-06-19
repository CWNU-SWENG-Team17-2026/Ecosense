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

    kma_api_key: str = ""
    kma_forecast_service_key: str = ""
    airkorea_api_key: str = ""
    outdoor_cache_ttl_minutes: int = 10

    cookie_secure: bool = False
    cookie_samesite: str = "lax"

    # Brevo 이메일
    brevo_api_key: str = ""
    brevo_sender_email: str = "noreply@ecosense.app"

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    s = Settings()
    if s.secret_key == _INSECURE_SECRET and not s.debug:
        raise RuntimeError("SECRET_KEY must be changed from the default before running in production.")
    if s.secret_key == _INSECURE_SECRET:
        logger.warning("⚠️  SECRET_KEY가 기본값입니다. 운영 전에 변경하세요.")
    return s
