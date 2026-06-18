from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.session import (
    CleanupResponse,
    ClearSessionsResponse,
    CreateSpikeRequest,
    CreateSpikeResponse,
    DeleteSessionResponse,
    DeleteSpikeResponse,
    SessionDetailResponse,
    SessionListResponse,
    SessionSpikesResponse,
)
from app.services.session_service import (
    cleanup_old_sessions,
    clear_all_sessions,
    clear_session_spikes,
    create_spike,
    delete_session,
    get_session_detail,
    get_session_spikes,
    list_sessions,
)

router = APIRouter(prefix="/sessions", tags=["sessions"])


# --- 고정 경로 먼저 (/{session_id} 보다 앞에 위치해야 함) ---

@router.get("", response_model=SessionListResponse)
def get_sessions(
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return list_sessions(db, current_user.id, offset=offset, limit=limit)


@router.delete("", response_model=ClearSessionsResponse)
def clear_sessions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return clear_all_sessions(db, current_user.id)


@router.post("/cleanup", response_model=CleanupResponse)
def run_cleanup(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return cleanup_old_sessions(db, current_user.id, days=30)


# --- 동적 경로 ---

@router.get("/{session_id}", response_model=SessionDetailResponse)
def get_session(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    detail = get_session_detail(db, current_user.id, session_id)
    if not detail:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="세션을 찾을 수 없습니다.")
    return detail


@router.delete("/{session_id}", response_model=DeleteSessionResponse)
def remove_session(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = delete_session(db, current_user.id, session_id)
    if result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="세션을 찾을 수 없습니다.")
    return result


@router.get("/{session_id}/spikes", response_model=SessionSpikesResponse)
def get_spikes(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = get_session_spikes(db, current_user.id, session_id)
    if not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="세션을 찾을 수 없습니다.")
    return result


@router.post("/{session_id}/spikes", response_model=CreateSpikeResponse)
def post_spike(
    session_id: str,
    payload: CreateSpikeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    spike_id = create_spike(db, current_user.id, session_id, payload)
    if not spike_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="세션을 찾을 수 없습니다.")
    return CreateSpikeResponse(spike_id=spike_id)


@router.delete("/{session_id}/spikes", response_model=DeleteSpikeResponse)
def delete_spikes_for_session(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = clear_session_spikes(db, current_user.id, session_id)
    if result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="세션을 찾을 수 없습니다.")
    return result
