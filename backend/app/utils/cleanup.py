from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.models.measurement import MeasurementSession, Spike
from app.models.report import ReportHistory


def cleanup_expired_data(db: Session, days: int = 30) -> dict[str, int]:
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)

    deleted_spikes = (
        db.query(Spike)
        .filter(Spike.detected_at < cutoff)
        .delete(synchronize_session=False)
    )
    deleted_sessions = (
        db.query(MeasurementSession)
        .filter(MeasurementSession.started_at < cutoff)
        .delete(synchronize_session=False)
    )
    deleted_reports = (
        db.query(ReportHistory)
        .filter(ReportHistory.created_at < cutoff)
        .delete(synchronize_session=False)
    )

    db.commit()

    return {
        "deleted_spikes": deleted_spikes,
        "deleted_sessions": deleted_sessions,
        "deleted_reports": deleted_reports,
    }