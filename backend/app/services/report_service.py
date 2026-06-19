# services/report_service.py
"""
PDF 보고서 생성 서비스
- 사용자 정보 섹션 추가
- 설문조사 결과 기반 맞춤 코멘트
- 실외 환경 데이터 (OutdoorDataCache)
- 수면 데이터 (MeasurementSession + Spike)
- q14 사용자 유형별 조건부 그래프
"""
import io
import json
import uuid
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.font_manager as fm
import matplotlib.dates as mdates
from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import Session

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, Image as RLImage,
)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase import cidfonts
from reportlab.lib.enums import TA_CENTER

from app.models.measurement import MeasurementSession, Spike
from app.models.outdoor import OutdoorDataCache
from app.models.report import ReportHistory
from app.models.user import User
from app.schemas.report import ReportHistoryItem, ReportPeriod

import os
from pathlib import Path

_ASSETS_DIR = Path(__file__).resolve().parent.parent / "assets" / "fonts"
_BUNDLED_FONT = _ASSETS_DIR / "NotoSansKR-Regular.otf"

# OS별·배포 환경별 한글 폰트 후보 (앞에서부터 우선)
_FONT_CANDIDATES: list[Path | str] = [
    _BUNDLED_FONT,
    os.environ.get("KOREAN_FONT_PATH", ""),
    # Linux (Render/Docker 등)
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
    "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
    "/usr/share/fonts/google-noto/NotoSansCJK-Regular.ttc",
    "/usr/share/fonts/truetype/nanum/NanumGothic.ttf",
    "/usr/share/fonts/nanum/NanumGothic.ttf",
    # Windows (로컬 개발)
    "C:/Windows/Fonts/malgun.ttf",
    "C:/Windows/Fonts/NanumGothic.ttf",
    # macOS
    "/System/Library/Fonts/AppleSDGothicNeo.ttc",
    "/Library/Fonts/AppleGothic.ttf",
]

_mpl_font_props: fm.FontProperties | None = None


def _resolve_korean_font_path() -> str | None:
    for candidate in _FONT_CANDIDATES:
        if not candidate:
            continue
        path = Path(candidate)
        if path.is_file():
            return str(path)
    return None


# ── 한글 폰트 등록 ──────────────────────────────────────────
def _register_font() -> str:
    font_path = _resolve_korean_font_path()
    if font_path:
        try:
            pdfmetrics.registerFont(TTFont("Korean", font_path))
            return "Korean"
        except Exception:
            pass

    try:
        pdfmetrics.registerFont(cidfonts.UnicodeCIDFont("HYGothic-Medium"))
        return "HYGothic-Medium"
    except Exception:
        pass

    return "Helvetica"


def _get_mpl_font() -> fm.FontProperties:
    global _mpl_font_props
    if _mpl_font_props is not None:
        return _mpl_font_props

    font_path = _resolve_korean_font_path()
    if font_path:
        try:
            fm.fontManager.addfont(font_path)
            _mpl_font_props = fm.FontProperties(fname=font_path)
            family = _mpl_font_props.get_name()
            plt.rcParams["font.family"] = family
            plt.rcParams["axes.unicode_minus"] = False
            return _mpl_font_props
        except Exception:
            pass

    _mpl_font_props = fm.FontProperties()
    return _mpl_font_props


def _fig_to_bytes(fig) -> io.BytesIO:
    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=150, bbox_inches="tight")
    plt.close(fig)
    buf.seek(0)
    return buf


# ── 맞춤 코멘트 생성 (중복 선택 모두 반영) ──────────────────
def _generate_comments(user_types: list, survey: dict) -> list:
    comments = []

    interests = _parse_list(survey.get("q3_interests"))
    wanted_alerts = _parse_list(survey.get("q13_wanted_alerts"))
    important_factors = _parse_list(survey.get("q4_important_factors"))
    env_impact = survey.get("q5_env_impact", "")
    noise_needed = survey.get("q12_noise_needed", "")

    # 사용자 유형별 맞춤 코멘트 (중복 선택 모두 반영)
    for user_type in user_types:
        if user_type == "피부 민감 사용자":
            comments.append("💧 [피부 관리] 실내 습도를 40~60%로 유지하고 보습 크림을 자주 사용하세요.")
            if "자외선(UV)" in important_factors:
                comments.append("☀️ [피부 관리] 자외선 지수가 높은 날 외출 시 자외선 차단제를 꼭 바르세요.")

        elif user_type == "기관지 질환 사용자":
            comments.append("🫁 [기관지 건강] 공기청정기를 사용하여 실내 공기질을 관리하세요.")
            comments.append("🫁 [기관지 건강] 미세먼지 농도가 높은 날은 외출을 자제하고 마스크를 착용하세요.")
            if "초미세먼지(PM2.5)" in important_factors or "공기질(AQI)" in important_factors:
                comments.append("🫁 [기관지 건강] PM2.5 수치를 주기적으로 확인하는 것을 권장합니다.")

        elif user_type == "수면 환경 민감 사용자":
            comments.append("🌙 [수면 환경] 취침 전 실내 온도를 18~22°C로 맞춰 쾌적한 수면 환경을 만드세요.")
            comments.append("🌙 [수면 환경] 수면 중 소음을 최소화하여 수면의 질을 높이세요.")
            if noise_needed in ("매우 필요", "필요"):
                comments.append("🌙 [수면 환경] 실내 소음 측정 기능을 활용하여 수면 환경을 모니터링하세요.")

        elif user_type == "관광객/여행 사용자":
            comments.append("✈️ [여행 안내] 여행 전 목적지의 날씨와 대기질 정보를 미리 확인하세요.")
            if "GPS 기반 지역 환경 정보" in _parse_list(survey.get("q8_needed_features")):
                comments.append("✈️ [여행 안내] GPS 기반 위치 자동 감지 기능을 활용해 현지 환경 정보를 확인하세요.")

        elif user_type == "일반 사용자":
            comments.append("🌿 [생활 환경] 실내외 환경을 주기적으로 확인하여 건강한 생활을 유지하세요.")

    # 관심분야 기반 추가 코멘트
    if "에너지 절약" in interests:
        comments.append("⚡ [에너지 절약] 적정 실내 온도(여름 26°C, 겨울 20°C) 유지로 에너지를 절약하세요.")

    if "수면 환경" in interests and "수면 환경 민감 사용자" not in user_types:
        comments.append("💤 [수면 환경] 취침 전 환경 데이터를 확인하여 최적의 수면 환경을 만드세요.")

    # 원하는 알림 기반 코멘트
    if "습도 감소 시 보습 안내" in wanted_alerts:
        comments.append("🔔 [알림 설정] 습도 40% 이하 시 보습 알림이 활성화됩니다.")
    if "미세먼지 증가 시 마스크/환기 안내" in wanted_alerts:
        comments.append("🔔 [알림 설정] 미세먼지 증가 시 마스크 착용 및 환기 알림이 활성화됩니다.")
    if "자외선 위험 알림" in wanted_alerts:
        comments.append("🔔 [알림 설정] 자외선 지수 위험 단계 시 알림이 활성화됩니다.")

    if not comments:
        comments.append("🌿 현재 환경을 지속적으로 모니터링하여 건강한 생활을 유지하세요.")

    return comments


# ── 차트 ─────────────────────────────────────────────────────
def _chart_outdoor_trend(outdoor_trend: list, period: str):
    if not outdoor_trend:
        return None
    fp = _get_mpl_font()
    dates = [r["day"] for r in outdoor_trend]
    pm25 = [r["pm25"] for r in outdoor_trend]
    pm10 = [r["pm10"] for r in outdoor_trend]

    fig, ax = plt.subplots(figsize=(9, 3.5))
    fig.patch.set_facecolor("#f8fafc")
    ax.plot(dates, pm25, "o-", color="#ef4444", linewidth=1.8, markersize=4, label="PM2.5")
    ax.plot(dates, pm10, "s--", color="#f97316", linewidth=1.8, markersize=4, label="PM10")
    ax.axhline(35, color="#ef4444", linestyle=":", linewidth=1, alpha=0.6)
    ax.axhline(80, color="#f97316", linestyle=":", linewidth=1, alpha=0.6)
    ax.set_ylabel("농도 (㎍/㎥)", fontproperties=fp, fontsize=9)
    ax.legend(prop=fp, fontsize=7)
    ax.set_facecolor("#ffffff")
    ax.grid(axis="y", linestyle="--", alpha=0.4)
    fmt = mdates.DateFormatter("%m/%d")
    ax.xaxis.set_major_formatter(fmt)
    fig.autofmt_xdate(rotation=45)
    period_kr = "주간" if period == "weekly" else "월간"
    fig.suptitle(f"실외 미세먼지 추이 ({period_kr})", fontproperties=fp, fontsize=11)
    fig.tight_layout()
    return _fig_to_bytes(fig)


def _chart_sleep_spikes(sleep_data: dict):
    if not sleep_data or not sleep_data.get("sessions"):
        return None
    fp = _get_mpl_font()
    sessions = sleep_data["sessions"][-14:]
    labels, spike_counts, max_dbs = [], [], []
    for s in sessions:
        dt = s.get("started_at")
        labels.append(dt.strftime("%m/%d") if isinstance(dt, datetime) else "-")
        spike_counts.append(s.get("spike_count", 0))
        max_dbs.append(s.get("max_db") or 0)

    x = range(len(labels))
    fig, ax1 = plt.subplots(figsize=(9, 3.5))
    fig.patch.set_facecolor("#f8fafc")
    ax1.bar(list(x), spike_counts, color="#7c3aed", alpha=0.75, label="소음 스파이크 횟수")
    ax1.set_ylabel("수면 스파이크 횟수", fontproperties=fp, fontsize=9)
    ax1.set_xticks(list(x))
    ax1.set_xticklabels(labels, fontproperties=fp, fontsize=8)
    ax1.set_facecolor("#ffffff")
    ax1.grid(axis="y", linestyle="--", alpha=0.4)
    ax2 = ax1.twinx()
    ax2.plot(list(x), max_dbs, "D-", color="#f59e0b", linewidth=1.5, markersize=5, label="최고 dB")
    ax2.set_ylabel("최고 소음 (dB)", fontproperties=fp, fontsize=9)
    lines1, labels1 = ax1.get_legend_handles_labels()
    lines2, labels2 = ax2.get_legend_handles_labels()
    ax1.legend(lines1 + lines2, labels1 + labels2, prop=fp, fontsize=7)
    fig.suptitle("수면 중 소음 스파이크 현황", fontproperties=fp, fontsize=11)
    fig.tight_layout()
    return _fig_to_bytes(fig)


# ── DB 조회 ───────────────────────────────────────────────────
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
        "latest_location": records[0].location if records else "-",
        "latest_weather": records[0].weather_description if records else "-",
    }


def _collect_outdoor_trend(db: Session, days: int) -> list:
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    records = (
        db.query(OutdoorDataCache)
        .filter(OutdoorDataCache.cached_at >= cutoff)
        .order_by(OutdoorDataCache.cached_at.asc())
        .all()
    )
    day_map = {}
    for r in records:
        d = r.cached_at.date()
        if d not in day_map:
            day_map[d] = {"pm25": [], "pm10": []}
        day_map[d]["pm25"].append(r.pm25)
        day_map[d]["pm10"].append(r.pm10 or 0)

    result = []
    for d, v in sorted(day_map.items()):
        result.append({
            "day": datetime.combine(d, datetime.min.time()),
            "pm25": sum(v["pm25"]) / len(v["pm25"]),
            "pm10": sum(v["pm10"]) / len(v["pm10"]),
        })
    return result


def _collect_sleep(db: Session, user_id: int, days: int) -> dict:
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    sessions = (
        db.query(MeasurementSession)
        .filter(
            MeasurementSession.user_id == user_id,
            MeasurementSession.started_at >= cutoff,
        )
        .order_by(MeasurementSession.started_at.desc())
        .all()
    )
    if not sessions:
        return {"session_count": 0, "spike_count": 0, "avg_db": None, "max_db": None, "sessions": []}

    session_list = []
    total_spikes = 0
    all_dbs = []

    for s in sessions:
        spikes = db.query(Spike).filter(Spike.session_id == s.id).all()
        spike_count = len(spikes)
        max_db = max((sp.db_level for sp in spikes), default=None)
        total_spikes += spike_count
        if max_db:
            all_dbs.append(max_db)
        session_list.append({
            "started_at": s.started_at,
            "ended_at": s.ended_at,
            "spike_count": spike_count,
            "max_db": max_db,
        })

    return {
        "session_count": len(sessions),
        "spike_count": total_spikes,
        "avg_db": round(sum(all_dbs) / len(all_dbs), 1) if all_dbs else None,
        "max_db": round(max(all_dbs), 1) if all_dbs else None,
        "sessions": session_list,
    }


def _get_survey(db: Session, user_id: int) -> dict:
    from sqlalchemy import text
    result = db.execute(
        text("SELECT * FROM user_preferences WHERE user_id = :uid"),
        {"uid": user_id}
    ).fetchone()
    if result:
        return dict(result._mapping)
    return {}


def _parse_list(v) -> list:
    if isinstance(v, list): return v
    if isinstance(v, str):
        try: return json.loads(v)
        except: return [v] if v else []
    return []


SURVEY_LABELS = {
    "q1_age": "연령대", "q2_lifestyle": "생활 유형", "q3_interests": "관심 분야",
    "q4_important_factors": "중요 환경 요소", "q5_env_impact": "환경이 일상에 미치는 영향",
    "q6_check_frequency": "환경 정보 확인 빈도", "q7_alert_needed": "알림 기능 필요 여부",
    "q8_needed_features": "필요한 기능", "q9_skin_dryness": "피부 건조 경험",
    "q10_respiratory": "호흡기 불편 경험", "q11_sleep_impact": "수면 영향",
    "q12_noise_needed": "소음 측정 필요 여부", "q13_wanted_alerts": "원하는 알림 종류",
    "q14_user_types": "사용자 유형",
    "q14a_reason": "[일반] 확인 이유", "q14a_display": "[일반] 정보 표시 방식",
    "q14b_travel_info": "[여행] 중요한 여행 정보", "q14b_gps": "[여행] GPS 사용 의향",
    "q14c_air_frequency": "[기관지] 공기질 확인 빈도", "q14c_sensitive_factor": "[기관지] 민감 요소",
    "q14c_alert_type": "[기관지] 알림 종류", "q14d_skin_factor": "[피부] 민감 요소",
    "q14d_uv_alert": "[피부] 자외선 알림 필요", "q14d_skin_guide": "[피부] 피부 관리 안내 필요",
    "q14e_sleep_factor": "[수면] 영향 요소", "q14e_sleep_alert": "[수면] 알림 필요 여부",
    "q14e_sleep_feature": "[수면] 원하는 수면 기능",
}


# ── PDF 생성 ──────────────────────────────────────────────────
def generate_report_pdf(
    db: Session, user_id: int, period: ReportPeriod
) -> tuple[bytes, ReportHistoryItem]:
    days = 7 if period == "weekly" else 30
    period_label = "주간" if period == "weekly" else "월간"

    font_name = _register_font()
    user = db.get(User, user_id)
    outdoor = _collect_outdoor(db, days)
    outdoor_trend = _collect_outdoor_trend(db, days)
    sleep = _collect_sleep(db, user_id, days)
    survey = _get_survey(db, user_id)

    user_types = _parse_list(survey.get("q14_user_types"))
    interests = _parse_list(survey.get("q3_interests"))
    created_at = datetime.now(timezone.utc)
    report_id = str(uuid.uuid4())

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=A4,
        topMargin=2*cm, bottomMargin=2*cm,
        leftMargin=2*cm, rightMargin=2*cm,
    )

    title_style = ParagraphStyle("Title", fontName=font_name, fontSize=20, alignment=TA_CENTER,
                                  textColor=colors.HexColor("#1a7a4a"), spaceAfter=6)
    subtitle_style = ParagraphStyle("Sub", fontName=font_name, fontSize=11, alignment=TA_CENTER,
                                     textColor=colors.HexColor("#71717a"), spaceAfter=4)
    section_style = ParagraphStyle("Section", fontName=font_name, fontSize=13,
                                    textColor=colors.HexColor("#1a5c8a"), spaceBefore=14, spaceAfter=6)
    body_style = ParagraphStyle("Body", fontName=font_name, fontSize=10,
                                 textColor=colors.HexColor("#334155"), spaceAfter=4, leading=16)
    comment_style = ParagraphStyle("Comment", fontName=font_name, fontSize=10,
                                    textColor=colors.HexColor("#1e293b"), spaceAfter=6, leading=16, leftIndent=10)

    def make_table(data, col_widths, header_color="#1a5c8a", row_colors=None):
        t = Table(data, colWidths=col_widths)
        rc = row_colors or [colors.HexColor("#f8fafc"), colors.white]
        t.setStyle(TableStyle([
            ("BACKGROUND", (0,0), (-1,0), colors.HexColor(header_color)),
            ("TEXTCOLOR", (0,0), (-1,0), colors.white),
            ("FONTNAME", (0,0), (-1,-1), font_name),
            ("FONTSIZE", (0,0), (-1,-1), 10),
            ("ROWBACKGROUNDS", (0,1), (-1,-1), rc),
            ("GRID", (0,0), (-1,-1), 0.5, colors.HexColor("#e2e8f0")),
            ("ALIGN", (0,0), (-1,-1), "LEFT"),
            ("PADDING", (0,0), (-1,-1), 8),
        ]))
        return t

    story = []

    # 제목
    story.append(Spacer(1, 0.5*cm))
    story.append(Paragraph("🌿 EcoSense", title_style))
    story.append(Paragraph("환경 상태 분석 리포트", title_style))
    story.append(Paragraph(f"{period_label} 보고서 · {created_at.strftime('%Y년 %m월 %d일')}", subtitle_style))
    story.append(HRFlowable(width="100%", thickness=2, color=colors.HexColor("#1a7a4a")))
    story.append(Spacer(1, 0.3*cm))

    # 1. 사용자 정보 (추가된 섹션)
    story.append(Paragraph("1. 사용자 정보", section_style))
    user_rows = [
        ["항목", "내용"],
        ["이름", user.name if user and user.name else "-"],
        ["이메일", user.email if user else "-"],
        ["사용자 유형", ", ".join(user_types) if user_types else "-"],
        ["연령대", survey.get("q1_age") or "-"],
        ["생활 유형", survey.get("q2_lifestyle") or "-"],
        ["주요 관심 분야", ", ".join(interests) if interests else "-"],
        ["리포트 생성일", created_at.strftime("%Y-%m-%d %H:%M")],
    ]
    story.append(make_table(user_rows, [5*cm, 12*cm], header_color="#2e7d5e",
                             row_colors=[colors.HexColor("#f0fdf4"), colors.white]))
    story.append(Spacer(1, 0.3*cm))

    # 2. 실외 환경
    story.append(Paragraph("2. 실외 환경 현황", section_style))
    if outdoor:
        rows = [
            ["항목", "값"],
            ["측정 횟수", f"{outdoor['count']}회"],
            ["위치", outdoor["latest_location"]],
            ["날씨", outdoor["latest_weather"]],
            ["평균 온도", f"{outdoor['avg_temp']}°C (최저 {outdoor['min_temp']} / 최고 {outdoor['max_temp']})"],
            ["평균 습도", f"{outdoor['avg_humidity']}%"],
            ["평균 PM2.5", f"{outdoor['avg_pm25']} ㎍/㎥"],
            ["최고 PM2.5", f"{outdoor['max_pm25']} ㎍/㎥"],
        ]
        story.append(make_table(rows, [5*cm, 12*cm], header_color="#0f6e56",
                                 row_colors=[colors.HexColor("#f0fdf4"), colors.white]))
    else:
        story.append(Paragraph("해당 기간 실외 데이터가 없습니다.", body_style))

    # 실외 미세먼지 차트 (기관지/관광객 선택 시)
    needs_air = any(t in user_types for t in ["기관지 질환 사용자", "관광객/여행 사용자"])
    if needs_air and outdoor_trend:
        chart = _chart_outdoor_trend(outdoor_trend, period)
        if chart:
            story.append(Spacer(1, 0.3*cm))
            story.append(RLImage(chart, width=16*cm, height=6*cm))
    story.append(Spacer(1, 0.3*cm))

    # 3. 수면/소음
    story.append(Paragraph("3. 수면 / 소음 측정 현황", section_style))
    sleep_rows = [
        ["항목", "값"],
        ["수면 측정 횟수", f"{sleep['session_count']}회"],
        ["소음 스파이크 횟수", f"{sleep['spike_count']}회"],
        ["평균 소음 레벨", f"{sleep['avg_db']}dB" if sleep["avg_db"] else "측정 없음"],
        ["최고 소음 레벨", f"{sleep['max_db']}dB" if sleep["max_db"] else "측정 없음"],
    ]
    story.append(make_table(sleep_rows, [5*cm, 12*cm], header_color="#3C3489",
                             row_colors=[colors.HexColor("#f5f3ff"), colors.white]))

    # 수면 차트 (수면 환경 민감 사용자 선택 시)
    if "수면 환경 민감 사용자" in user_types and sleep.get("sessions"):
        spike_chart = _chart_sleep_spikes(sleep)
        if spike_chart:
            story.append(Spacer(1, 0.3*cm))
            story.append(RLImage(spike_chart, width=16*cm, height=6*cm))
    story.append(Spacer(1, 0.3*cm))

    # 4. 맞춤 코멘트 (추가된 섹션)
    story.append(Paragraph("4. 사용자 맞춤 분석 및 코멘트", section_style))
    if user_types:
        story.append(Paragraph(f"선택된 사용자 유형: {', '.join(user_types)}", body_style))
    comments = _generate_comments(user_types, survey)
    for comment in comments:
        story.append(Paragraph(f"• {comment}", comment_style))
    story.append(Spacer(1, 0.3*cm))

    # 5. 설문조사 응답
    story.append(Paragraph("5. 설문조사 응답 요약", section_style))
    survey_rows = [["설문 항목", "응답 내용"]]
    for key, label in SURVEY_LABELS.items():
        val = survey.get(key)
        if not val: continue
        if isinstance(val, str):
            try:
                parsed = json.loads(val)
                if isinstance(parsed, list): val = parsed
            except: pass
        display = ", ".join(str(v) for v in val) if isinstance(val, list) else str(val)
        survey_rows.append([label, display])

    if len(survey_rows) > 1:
        story.append(make_table(survey_rows, [6*cm, 11*cm], header_color="#475569"))
    else:
        story.append(Paragraph("설문조사 응답 내용이 없습니다.", body_style))
    story.append(Spacer(1, 0.3*cm))

    # 6. 참고사항
    story.append(Paragraph("6. 참고사항", section_style))
    story.append(Paragraph("• 본 리포트는 실외 환경 API, 수면 측정 및 설문조사 결과를 기반으로 생성되었습니다.", body_style))
    story.append(Paragraph("• 실제 환경 상태와 일부 차이가 발생할 수 있습니다.", body_style))
    story.append(Spacer(1, 0.3*cm))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#e2e8f0")))
    story.append(Paragraph("EcoSense · 환경 모니터링 대시보드", subtitle_style))

    doc.build(story)

    # 이력 저장
    avg_db_str = f"{sleep['avg_db']}dB" if sleep["avg_db"] else "측정 없음"
    summary = (
        f"{period_label} 보고서 | "
        f"수면 {sleep['session_count']}회 · 스파이크 {sleep['spike_count']}회 · 평균소음 {avg_db_str} | "
        f"실외 평균온도 {outdoor.get('avg_temp', '-')}°C · PM2.5 {outdoor.get('avg_pm25', '-')}㎍/㎥"
    )

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


def list_report_history(db: Session, user_id: int, limit: int = 10) -> list[ReportHistoryItem]:
    reports = (
        db.query(ReportHistory)
        .filter(ReportHistory.user_id == user_id)
        .order_by(ReportHistory.created_at.desc())
        .limit(limit)
        .all()
    )
    return [
        ReportHistoryItem(
            id=r.id,
            period=r.period,
            created_at=r.created_at,
            summary_text=r.summary_text,
        )
        for r in reports
    ]
