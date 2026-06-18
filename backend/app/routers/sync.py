from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.sync import SyncDownloadResponse, SyncUploadRequest, SyncUploadResponse
from app.services.sync_service import download_sync_data, upload_sync_data

router = APIRouter(prefix="/sync", tags=["sync"])


@router.post("/upload", response_model=SyncUploadResponse)
def sync_upload(
    payload: SyncUploadRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return upload_sync_data(db, current_user.id, payload)


@router.get("/download", response_model=SyncDownloadResponse)
def sync_download(
    days: int = Query(default=30, ge=1, le=30),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return download_sync_data(db, current_user.id, days)