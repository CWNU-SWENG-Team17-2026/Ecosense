import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.measurement import MeasurementSession, Spike
from app.schemas.session import (
    CleanupResponse,
    ClearSessionsResponse,
    CreateSpikeRequest,
    DeleteSessionResponse,
    DeleteSpikeResponse,
    SessionDetailResponse,
    SessionListResponse,
    SessionSpikesResponse,
    SessionSummary,
    SpikeResponse,
    SpikeSummary,
)


def list_sessions(
    db: Session, user_id: int, offset: int = 0, limit: int = 20
) -> SessionListResponse:
    base_query = db.query(MeasurementSession).filter(MeasurementSession.user_id == user_id)
    total = base_query.count()

    sessions = (
        base_query.order_by(MeasurementSession.started_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    summaries: list[SessionSummary] = []
    for session in sessions:
        spike_count = (
            db.query(func.count(Spike.id))
            .filter(Spike.session_id == session.id)
            .scalar()
            or 0
        )
        summaries.append(
            SessionSummary(
                id=session.id,
                type=session.type,  # type: ignore[arg-type]
                started_at=session.started_at,
                ended_at=session.ended_at,
                spike_count=spike_count,
            )
        )

    return SessionListResponse(
        sessions=summaries,
        total=total,
        has_more=offset + limit < total,
    )


def get_session_detail(
    db: Session, user_id: int, session_id: str
) -> SessionDetailResponse | None:
    session = db.get(MeasurementSession, session_id)
    if not session or session.user_id != user_id:
        return None

    stats = (
        db.query(
            func.count(Spike.id),
            func.avg(Spike.db_level),
            func.max(Spike.db_level),
        )
        .filter(Spike.session_id == session_id)
        .one()
    )

    return SessionDetailResponse(
        id=session.id,
        type=session.type,  # type: ignore[arg-type]
        started_at=session.started_at,
        ended_at=session.ended_at,
        spike_summary=SpikeSummary(
            count=stats[0] or 0,
            avg_db_level=round(stats[1], 1) if stats[1] is not None else None,
            max_db_level=round(stats[2], 1) if stats[2] is not None else None,
        ),
    )


def get_session_spikes(
    db: Session, user_id: int, session_id: str
) -> SessionSpikesResponse | None:
    session = db.get(MeasurementSession, session_id)
    if not session or session.user_id != user_id:
        return None

    spikes = (
        db.query(Spike)
        .filter(Spike.session_id == session_id)
        .order_by(Spike.detected_at.asc())
        .all()
    )

    return SessionSpikesResponse(
        spikes=[
            SpikeResponse(
                id=spike.id,
                detected_at=spike.detected_at,
                db_level=spike.db_level,
                duration_sec=spike.duration_sec,
            )
            for spike in spikes
        ]
    )


def create_spike(
    db: Session,
    user_id: int,
    session_id: str,
    payload: CreateSpikeRequest,
) -> str | None:
    session = db.get(MeasurementSession, session_id)
    if not session or session.user_id != user_id:
        return None

    spike_id = str(uuid.uuid4())
    db.add(
        Spike(
            id=spike_id,
            session_id=session_id,
            user_id=user_id,
            detected_at=payload.detected_at,
            db_level=payload.db_level,
            duration_sec=payload.duration_sec,
        )
    )
    db.commit()
    return spike_id


def delete_session(
    db: Session, user_id: int, session_id: str
) -> DeleteSessionResponse | None:
    session = db.get(MeasurementSession, session_id)
    if not session or session.user_id != user_id:
        return None

    spike_count = (
        db.query(func.count(Spike.id))
        .filter(Spike.session_id == session_id)
        .scalar()
        or 0
    )
    db.delete(session)
    db.commit()
    return DeleteSessionResponse(deleted_spikes_count=spike_count)


def clear_all_sessions(db: Session, user_id: int) -> ClearSessionsResponse:
    sessions = (
        db.query(MeasurementSession)
        .filter(MeasurementSession.user_id == user_id)
        .all()
    )
    session_ids = [s.id for s in sessions]

    spike_count = 0
    if session_ids:
        spike_count = (
            db.query(func.count(Spike.id))
            .filter(Spike.session_id.in_(session_ids))
            .scalar()
            or 0
        )

    for session in sessions:
        db.delete(session)

    db.commit()
    return ClearSessionsResponse(
        deleted_sessions=len(sessions),
        deleted_spikes=spike_count,
    )


def delete_spike(
    db: Session, user_id: int, spike_id: str
) -> DeleteSpikeResponse | None:
    spike = db.get(Spike, spike_id)
    if not spike or spike.user_id != user_id:
        return None

    db.delete(spike)
    db.commit()
    return DeleteSpikeResponse(deleted_count=1)


def clear_session_spikes(
    db: Session, user_id: int, session_id: str
) -> DeleteSpikeResponse | None:
    session = db.get(MeasurementSession, session_id)
    if not session or session.user_id != user_id:
        return None

    count = (
        db.query(func.count(Spike.id))
        .filter(Spike.session_id == session_id)
        .scalar()
        or 0
    )
    db.query(Spike).filter(Spike.session_id == session_id).delete()
    db.commit()
    return DeleteSpikeResponse(deleted_count=count)


def cleanup_old_sessions(db: Session, user_id: int, days: int = 30) -> CleanupResponse:
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)

    old_sessions = (
        db.query(MeasurementSession)
        .filter(
            MeasurementSession.user_id == user_id,
            MeasurementSession.started_at < cutoff,
        )
        .all()
    )
    session_ids = [s.id for s in old_sessions]

    spike_count = 0
    if session_ids:
        spike_count = (
            db.query(func.count(Spike.id))
            .filter(Spike.session_id.in_(session_ids))
            .scalar()
            or 0
        )

    for session in old_sessions:
        db.delete(session)

    db.commit()
    return CleanupResponse(
        deleted_spikes=spike_count,
        deleted_sessions=len(old_sessions),
    )