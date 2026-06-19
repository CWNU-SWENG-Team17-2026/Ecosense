import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError, SQLAlchemyError

from app.config import get_settings
from app.database import SessionLocal, init_db
from app.routers import auth, location, outdoor, report, sessions, spikes, sync, survey
from app.utils.cleanup import cleanup_expired_data

settings = get_settings()
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI):
    if settings.reset_db_on_startup:
        from app.database import engine
        from app.utils.schema import drop_all_tables

        if str(engine.url).startswith("postgresql"):
            logger.warning("RESET_DB_ON_STARTUP=true → 전체 테이블 재생성")
            drop_all_tables(engine)

    init_db()
    with SessionLocal() as db:
        cleanup_expired_data(db, days=30)
    yield


app = FastAPI(title=settings.app_name, lifespan=lifespan)

_cors_kwargs: dict = {
    "allow_origins": settings.cors_origin_list,
    "allow_credentials": True,
    "allow_methods": ["*"],
    "allow_headers": ["*"],
}
if settings.cors_origin_regex_pattern:
    _cors_kwargs["allow_origin_regex"] = settings.cors_origin_regex_pattern

app.add_middleware(CORSMiddleware, **_cors_kwargs)
logger.info("CORSMiddleware enabled: origins=%s", settings.cors_origin_list)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    if isinstance(exc, HTTPException):
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": exc.detail},
        )
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


app.include_router(auth.router, prefix="/api")
app.include_router(location.router, prefix="/api")
app.include_router(outdoor.router, prefix="/api")
app.include_router(sync.router, prefix="/api")
app.include_router(sessions.router, prefix="/api")
app.include_router(spikes.router, prefix="/api")
app.include_router(report.router, prefix="/api")
app.include_router(survey.router, prefix="/api")


@app.get("/")
def root():
    return {"message": "EcoSense API", "docs": "/docs"}


@app.get("/health")
def health():
    return {"status": "ok"}
