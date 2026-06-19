from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.database import SessionLocal, init_db
from app.routers import auth, location, outdoor, report, sessions, spikes, sync, survey
from app.utils.cleanup import cleanup_expired_data

settings = get_settings()


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    with SessionLocal() as db:
        cleanup_expired_data(db, days=30)
    yield


app = FastAPI(title=settings.app_name, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
