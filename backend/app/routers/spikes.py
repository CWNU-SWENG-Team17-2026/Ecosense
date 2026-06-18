from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.session import DeleteSpikeResponse
from app.services.session_service import delete_spike

router = APIRouter(prefix="/spikes", tags=["spikes"])


@router.delete("/{spike_id}", response_model=DeleteSpikeResponse)
def remove_spike(
    spike_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = delete_spike(db, current_user.id, spike_id)
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="스파이크를 찾을 수 없습니다.",
        )
    return result
