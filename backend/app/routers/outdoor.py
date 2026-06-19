from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.outdoor import OutdoorHistoryResponse, OutdoorResponse
from app.services.outdoor_service import get_outdoor_data, get_outdoor_history

router = APIRouter(prefix="/outdoor", tags=["outdoor"])


@router.get("", response_model=OutdoorResponse)
def get_outdoor(
    location: str = Query(default="경남 창원시 의창구"),
    force_refresh: bool = Query(default=False),
    db: Session = Depends(get_db),
):
    return get_outdoor_data(db, location, force_refresh=force_refresh)


@router.get("/history", response_model=OutdoorHistoryResponse)
def get_outdoor_hist(
    location: str = Query(default="경남 창원시 의창구"),
    hours: int = Query(default=12, ge=1, le=72),
    db: Session = Depends(get_db),
):
    records = get_outdoor_history(db, location, hours=hours)
    return OutdoorHistoryResponse(records=records)
