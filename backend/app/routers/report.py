from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.report import ReportHistoryItem, ReportPeriod
from app.services.report_service import generate_report_pdf, list_report_history

router = APIRouter(prefix="/report", tags=["report"])


@router.get("/history", response_model=list[ReportHistoryItem])
def get_report_history(
    limit: int = Query(default=10, ge=1, le=50),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return list_report_history(db, current_user.id, limit=limit)


@router.get("/download")
def download_report(
    period: ReportPeriod = Query(default="weekly"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        pdf_bytes, _ = generate_report_pdf(db, current_user.id, period)
    except Exception as exc:
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"보고서 생성에 실패했습니다: {exc}",
        ) from exc

    filename = (
        "ecosense-weekly-report.pdf"
        if period == "weekly"
        else "ecosense-monthly-report.pdf"
    )

    return StreamingResponse(
        iter([pdf_bytes]),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
