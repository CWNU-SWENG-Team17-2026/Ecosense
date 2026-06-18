import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.models.measurement import MeasurementSession, Spike
from app.utils.datetime_utils import ensure_utc
from app.schemas.sync import (
    SyncDownloadResponse,
    SyncDownloadSpike,
    SyncSessionPayload,
    SyncUploadRequest,
    SyncUploadResponse,
)


def upload_sync_data(
    db: Session, user_id: int, payload: SyncUploadRequest
) -> SyncUploadResponse:
    synced_sessions = 0
    synced_spikes = 0
    failed_session_ids: list[str] = []

    for session_payload in payload.sessions:
        try:
            existing = db.get(MeasurementSession, session_payload.id)
            if existing:
                existing.type = session_payload.type
                existing.started_at = session_payload.started_at
                existing.ended_at = session_payload.ended_at
            else:
                db.add(
                    MeasurementSession(
                        id=session_payload.id,
                        user_id=user_id,
                        type=session_payload.type,
                        started_at=session_payload.started_at,
                        ended_at=session_payload.ended_at,
                    )
                )
            synced_sessions += 1
        except Exception:
            failed_session_ids.append(session_payload.id)

    db.flush()

    for spike_payload in payload.spikes:
        session = db.get(MeasurementSession, spike_payload.session_id)
        if not session or session.user_id != user_id:
            continue

        # 중복 방지: (session_id, detected_at) 기준 Upsert
        existing_spike = (
            db.query(Spike)
            .filter(
                Spike.session_id == spike_payload.session_id,
                Spike.detected_at == spike_payload.detected_at,
                Spike.user_id == user_id,
            )
            .first()
        )
        if existing_spike:
            existing_spike.db_level = spike_payload.db_level
            existing_spike.duration_sec = spike_payload.duration_sec
        else:
            spike_id = str(uuid.uuid4())
            db.add(
                Spike(
                    id=spike_id,
                    session_id=spike_payload.session_id,
                    user_id=user_id,
                    detected_at=spike_payload.detected_at,
                    db_level=spike_payload.db_level,
                    duration_sec=spike_payload.duration_sec,
                )
            )
        synced_spikes += 1

    db.commit()

    return SyncUploadResponse(
        synced_sessions=synced_sessions,
        synced_spikes=synced_spikes,
        failed_session_ids=failed_session_ids,
    )


def download_sync_data(db: Session, user_id: int, days: int = 30) -> SyncDownloadResponse:
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)

    sessions = (
        db.query(MeasurementSession)
        .filter(MeasurementSession.user_id == user_id)
        .order_by(MeasurementSession.started_at.desc())
        .all()
    )

    spikes = (
        db.query(Spike)
        .filter(Spike.user_id == user_id)
        .order_by(Spike.detected_at.desc())
        .all()
    )

    sessions = [
        session
        for session in sessions
        if (ensure_utc(session.started_at) or cutoff) >= cutoff
    ]
    spikes = [
        spike
        for spike in spikes
        if (ensure_utc(spike.detected_at) or cutoff) >= cutoff
    ]

    return SyncDownloadResponse(
        sessions=[
            SyncSessionPayload(
                id=session.id,
                type=session.type,  # type: ignore[arg-type]
                started_at=session.started_at,
                ended_at=session.ended_at,
            )
            for session in sessions
        ],
        spikes=[
            SyncDownloadSpike(
                id=spike.id,
                session_id=spike.session_id,
                detected_at=spike.detected_at,
                db_level=spike.db_level,
                duration_sec=spike.duration_sec,
            )
            for spike in spikes
        ],
    )