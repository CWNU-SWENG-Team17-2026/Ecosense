"""
PDF 보고서 생성 서비스

포함 내용:
- 실외 환경 요약 (기온, 습도, PM2.5, AQI)
- 수면/소음 통계 (세션 수, 스파이크 수, 평균 소음)
- 한글 폰트: reportlab 내장 HYGothic-Medium (CIDFont)
"""
import uuid
from datetime import datetime, timedelta, timezone
from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.pdfbase import cidfonts, pdfmetrics
from reportlab.platypus import (
    HRFlowable,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.measurement import MeasurementSession, Spike
from app.models.outdoor import OutdoorDataCache
from app.models.report import ReportHistory
from app.schemas.report import ReportHistoryItem, ReportPeriod

# ─── 한글 폰트 등록 ──────────────────────────────────────────────────
try:
    pdfmetrics.registerFont(cidfonts.UnicodeCIDFont("HYGothic-Medium"))
    _KO_FONT = "HYGothic-Medium"
except Exception:
    _KO_FONT = "Helvetica"


def _ko_style(size: int = 11, bold: bool = False, color=colors.black):
    """한글 Paragraph 스타일 반환."""
    from reportlab.lib.styles import ParagraphStyle
    return ParagraphStyle(
        "ko",
        fontName=_KO_FONT,
        fontSize=size,
        textColor=color,
        leading=size * 1.5,
        spaceAfter=4,
    )


# ─── 데이터 집계 ─────────────────────────────────────────────────────

def _collect_outdoor(db: Session, days: int) -> dict:
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    records = (
        db.query(OutdoorDataCache)
        .filter(OutdoorDataCache.cached_at >= cutoff)
        .order_by(OutdoorDataCache.cached_at.desc())
        .limit(100)
        .all()
    )
    if not records:
        return {}
    temps = [r.temperature for r in records]
    hums = [r.humidity for r in records]
    pm25s = [r.pm25 for r in records]
    return {
        "count": len(records),
        "avg_temp": round(sum(temps) / len(temps), 1),
        "min_temp": round(min(temps), 1),
        "max_temp": round(max(temps), 1),
        "avg_humidity": round(sum(hums) / len(hums), 1),
        "avg_pm25": round(sum(pm25s) / len(pm25s), 1),
        "max_pm25": round(max(pm25s), 1),
        "latest_location": records[0].location if records else "–",
        "latest_weather": records[0].weather_description if records else "–",
    }


def _collect_sleep(db: Session, user_id: int, days: int) -> dict:
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    session_count = (
        db.query(func.count(MeasurementSession.id))
        .filter(
            MeasurementSession.user_id == user_id,
            MeasurementSession.started_at >= cutoff,
        )
        .scalar()
        or 0
    )
    spike_count = (
        db.query(func.count(Spike.id))
        .filter(Spike.user_id == user_id, Spike.detected_at >= cutoff)
        .scalar()
        or 0
    )
    avg_db = (
        db.query(func.avg(Spike.db_level))
        .filter(Spike.user_id == user_id, Spike.detected_at >= cutoff)
        .scalar()
    )
    max_db = (
        db.query(func.max(Spike.db_level))
        .filter(Spike.user_id == user_id, Spike.detected_at >= cutoff)
        .scalar()
    )
    return {
        "session_count": session_count,
        "spike_count": spike_count,
        "avg_db": round(avg_db, 1) if avg_db else None,
        "max_db": round(max_db, 1) if max_db else None,
    }


# ─── PDF 생성 ────────────────────────────────────────────────────────

def _aqi_grade_kor(grade: str) -> str:
    return {"good": "좋음", "moderate": "보통", "bad": "나쁨", "very_bad": "매우 나쁨"}.get(grade, grade)


def generate_report_pdf(
    db: Session, user_id: int, period: ReportPeriod
) -> tuple[bytes, ReportHistoryItem]:
    days = 7 if period == "weekly" else 30
    period_label = "주간" if period == "weekly" else "월간"
    outdoor = _collect_outdoor(db, days)
    sleep = _collect_sleep(db, user_id, days)

    report_id = str(uuid.uuid4())
    created_at = datetime.now(timezone.utc)

    # 요약 문자열 (DB 저장용)
    avg_db_str = f"{sleep['avg_db']}dB" if sleep["avg_db"] else "측정 없음"
    summary = (
        f"{period_label} 보고서 | "
        f"수면 {sleep['session_count']}회 · 스파이크 {sleep['spike_count']}회 · 평균소음 {avg_db_str} | "
        f"실외 평균기온 {outdoor.get('avg_temp', '–')}℃ · PM2.5 {outdoor.get('avg_pm25', '–')}㎍/㎥"
    )

    # ─── Platypus PDF 빌드 ─────────────────────────────────────────
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=2 * cm,
        rightMargin=2 * cm,
        topMargin=2.5 * cm,
        bottomMargin=2 * cm,
    )

    story = []
    W = A4[0] - 4 * cm  # 실제 텍스트 폭

    def para(text, size=11, color=colors.black):
        return Paragraph(text, _ko_style(size, color=color))

    def section_title(text):
        return para(f"<b>{text}</b>", size=13, color=colors.HexColor("#1a7a4a"))

    def hr():
        return HRFlowable(width=W, thickness=0.5, color=colors.HexColor("#e4e4e7"))

    # 제목
    story.append(para("EcoSense 환경 보고서", size=20, color=colors.HexColor("#1a7a4a")))
    story.append(Spacer(1, 0.3 * cm))
    story.append(para(f"기간: {period_label}  ·  생성일: {created_at.strftime('%Y년 %m월 %d일 %H:%M UTC')}", size=10, color=colors.HexColor("#71717a")))
    story.append(Spacer(1, 0.5 * cm))
    story.append(hr())
    story.append(Spacer(1, 0.4 * cm))

    # 1. 실외 환경
    story.append(section_title("1. 실외 환경 요약"))
    story.append(Spacer(1, 0.2 * cm))
    if outdoor:
        outdoor_rows = [
            ["항목", "값"],
            ["측정 횟수", f"{outdoor['count']}회"],
            ["위치", outdoor["latest_location"]],
            ["날씨 상태", outdoor["latest_weather"]],
            ["평균 기온", f"{outdoor['avg_temp']}℃ (최저 {outdoor['min_temp']} / 최고 {outdoor['max_temp']})"],
            ["평균 습도", f"{outdoor['avg_humidity']}%"],
            ["평균 PM2.5", f"{outdoor['avg_pm25']} ㎍/㎥"],
            ["최고 PM2.5", f"{outdoor['max_pm25']} ㎍/㎥"],
        ]
        t = Table(outdoor_rows, colWidths=[4 * cm, W - 4 * cm])
        t.setStyle(TableStyle([
            ("FONTNAME", (0, 0), (-1, -1), _KO_FONT),
            ("FONTSIZE", (0, 0), (-1, -1), 10),
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#18181b")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.HexColor("#f4f4f5"), colors.white]),
            ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#e4e4e7")),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ]))
        story.append(t)
    else:
        story.append(para("해당 기간 실외 데이터가 없습니다.", color=colors.HexColor("#71717a")))

    story.append(Spacer(1, 0.6 * cm))
    story.append(hr())
    story.append(Spacer(1, 0.4 * cm))

    # 2. 수면/소음
    story.append(section_title("2. 수면 / 소음 측정 요약"))
    story.append(Spacer(1, 0.2 * cm))
    sleep_rows = [
        ["항목", "값"],
        ["수면 세션 수", f"{sleep['session_count']}회"],
        ["소음 스파이크 감지", f"{sleep['spike_count']}회"],
        ["평균 소음 수준", f"{sleep['avg_db']}dB" if sleep["avg_db"] else "측정 없음"],
        ["최대 소음 수준", f"{sleep['max_db']}dB" if sleep["max_db"] else "측정 없음"],
    ]
    t2 = Table(sleep_rows, colWidths=[4 * cm, W - 4 * cm])
    t2.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), _KO_FONT),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#18181b")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.HexColor("#f4f4f5"), colors.white]),
        ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#e4e4e7")),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
    ]))
    story.append(t2)

    # 수면 환경 코멘트
    story.append(Spacer(1, 0.4 * cm))
    comment = _sleep_comment(sleep)
    story.append(para(f"종합 의견: {comment}", size=10, color=colors.HexColor("#52525b")))

    story.append(Spacer(1, 0.6 * cm))
    story.append(hr())
    story.append(Spacer(1, 0.4 * cm))

    # 3. 안내
    story.append(section_title("3. 안내 사항"))
    story.append(Spacer(1, 0.2 * cm))
    notes = [
        "이 보고서는 EcoSense 앱의 측정 데이터를 기반으로 자동 생성되었습니다.",
        "수면 분석은 마이크 기반 소음 감지를 활용한 휴리스틱 근사값으로, 의학적 정확도를 보장하지 않습니다.",
        "실외 대기질 데이터는 기상청 및 에어코리아 Open API를 통해 제공됩니다.",
    ]
    for n in notes:
        story.append(para(f"• {n}", size=9, color=colors.HexColor("#71717a")))

    doc.build(story)

    # DB 저장
    history = ReportHistory(
        id=report_id,
        user_id=user_id,
        period=period,
        summary_text=summary,
        created_at=created_at,
    )
    db.add(history)
    db.commit()

    item = ReportHistoryItem(
        id=report_id,
        period=period,
        created_at=created_at,
        summary_text=summary,
    )
    return buffer.getvalue(), item


def _sleep_comment(sleep: dict) -> str:
    sc = sleep["spike_count"]
    ss = sleep["session_count"]
    if ss == 0:
        return "측정된 수면 세션이 없습니다."
    if sc == 0:
        return "수면 중 소음이 감지되지 않았습니다. 조용한 수면 환경이었습니다."
    avg = sleep["avg_db"]
    if sc <= 3:
        return f"소음 이벤트가 {sc}회로 적었습니다. 비교적 안정적인 수면 환경입니다."
    if sc <= 8:
        return f"{sc}회의 소음이 감지되어 수면이 다소 방해받았을 수 있습니다. 평균 {avg}dB."
    return f"{sc}회의 잦은 소음 이벤트가 감지되었습니다. 수면 환경 개선을 권장합니다. 평균 {avg}dB."


# ─── 이력 조회 ───────────────────────────────────────────────────────

def list_report_history(
    db: Session, user_id: int, limit: int = 10
) -> list[ReportHistoryItem]:
    reports = (
        db.query(ReportHistory)
        .filter(ReportHistory.user_id == user_id)
        .order_by(ReportHistory.created_at.desc())
        .limit(limit)
        .all()
    )
    return [
        ReportHistoryItem(
            id=report.id,
            period=report.period,  # type: ignore[arg-type]
            created_at=report.created_at,
            summary_text=report.summary_text,
        )
        for report in reports
    ]
