"""
실외 환경 데이터 서비스

우선순위:
1. 캐시 유효 → 캐시 반환
2. API 키 있음 → KMA + 에어코리아 실데이터 호출
3. 실패 또는 키 없음 → mock 데이터 생성
4. 항상 DB에 캐시 저장
"""
import asyncio
import hashlib
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.config import get_settings
from app.models.outdoor import OutdoorDataCache
from app.schemas.outdoor import AqiGrade, OutdoorResponse
from app.utils.datetime_utils import ensure_utc
from app.utils.kma_grid import get_coords, get_station, latlon_to_grid
from app.utils.weather_api import fetch_airkorea, fetch_kma_forecast

logger = logging.getLogger(__name__)
settings = get_settings()


# ─── 등급 변환 ────────────────────────────────────────────────────────

def _pm25_to_grade(pm25: float) -> AqiGrade:
    if pm25 <= 15:
        return "good"
    if pm25 <= 35:
        return "moderate"
    if pm25 <= 75:
        return "bad"
    return "very_bad"


def _uv_estimate(hour: int, weather: str) -> float:
    """시간대 + 날씨로 UV 지수 근사 추정 (기상청 UV API 미사용 시)."""
    if "비" in weather or "눈" in weather or "흐" in weather:
        base = 1.0
    elif "구름" in weather:
        base = 3.0
    else:
        base = 6.0
    # 낮 시간대 보정 (11~15시 피크)
    if 11 <= hour <= 15:
        return min(10.0, base * 1.5)
    if 9 <= hour < 11 or 15 < hour <= 17:
        return max(1.0, base * 0.8)
    return max(0.0, base * 0.3)


# ─── Mock 데이터 ──────────────────────────────────────────────────────

def _build_mock_outdoor(location: str) -> OutdoorResponse:
    """API 키 없음 / 호출 실패 시 결정론적 mock 데이터 생성."""
    seed = int(hashlib.md5(location.encode("utf-8")).hexdigest()[:8], 16)
    now = datetime.now(timezone.utc)
    hour = now.astimezone().hour

    temperature = round(18 + (seed % 120) / 10, 1)
    humidity = round(40 + (seed % 350) / 10, 1)
    pm25 = round(8 + (seed % 40), 1)
    aqi_grade = _pm25_to_grade(pm25)
    rainfall = 0.0 if seed % 3 else round((seed % 50) / 10, 1)
    weather_desc = "맑음" if seed % 2 == 0 else "구름 많음"
    uv = _uv_estimate(hour, weather_desc)

    return OutdoorResponse(
        location=location,
        temperature=temperature,
        humidity=humidity,
        rainfall=rainfall,
        aqi=round(pm25 * 2.2, 1),
        aqi_grade=aqi_grade,
        pm25=pm25,
        pm10=round(pm25 * 1.4, 1),
        uv_index=uv,
        weather_description=weather_desc,
        cached=False,
        is_mock=True,
        last_updated=now,
    )


# ─── API 실데이터 페치 ──────────────────────────────────────────────

async def _fetch_live_outdoor(location: str) -> OutdoorResponse | None:
    """KMA + 에어코리아 실데이터 조합. 실패 시 None 반환."""
    coords = get_coords(location)
    if coords is None:
        logger.info("위치 좌표 매핑 없음: %s → mock 사용", location)
        return None

    lat, lon = coords
    nx, ny = latlon_to_grid(lat, lon)
    station = get_station(location)

    kma_data, air_data = await asyncio.gather(
        fetch_kma_forecast(settings.kma_api_key, nx, ny),
        fetch_airkorea(settings.airkorea_api_key, station),
        return_exceptions=True,
    )

    # 어느 한 쪽만 실패해도 부분 데이터로 구성 가능
    if isinstance(kma_data, Exception):
        kma_data = None
    if isinstance(air_data, Exception):
        air_data = None

    if kma_data is None and air_data is None:
        return None

    now = datetime.now(timezone.utc)
    hour = now.astimezone().hour

    temp = float(kma_data["temperature"]) if kma_data else 20.0
    humidity = float(kma_data["humidity"]) if kma_data else 50.0
    rainfall = float(kma_data["rainfall"]) if kma_data else 0.0
    weather_desc = kma_data["weather_description"] if kma_data else "정보 없음"

    pm25 = float(air_data["pm25"]) if air_data else 15.0
    pm10 = float(air_data["pm10"]) if air_data else None
    aqi = float(air_data["aqi"]) if air_data else round(pm25 * 2.2, 1)
    aqi_grade = _pm25_to_grade(pm25)
    uv = _uv_estimate(hour, weather_desc)

    return OutdoorResponse(
        location=location,
        temperature=temp,
        humidity=humidity,
        rainfall=rainfall,
        aqi=aqi,
        aqi_grade=aqi_grade,
        pm25=pm25,
        pm10=pm10,
        uv_index=uv,
        weather_description=weather_desc,
        cached=False,
        is_mock=False,
        last_updated=now,
    )


# ─── 캐시 헬퍼 ──────────────────────────────────────────────────────

def _cache_to_response(cache: OutdoorDataCache, cached: bool) -> OutdoorResponse:
    return OutdoorResponse(
        location=cache.location,
        temperature=cache.temperature,
        humidity=cache.humidity,
        rainfall=cache.rainfall,
        aqi=cache.aqi,
        aqi_grade=cache.aqi_grade,  # type: ignore[arg-type]
        pm25=cache.pm25,
        pm10=cache.pm10,
        uv_index=cache.uv_index,
        weather_description=cache.weather_description,
        cached=cached,
        is_mock=False,
        last_updated=ensure_utc(cache.cached_at) or datetime.now(timezone.utc),
    )


def _save_cache(db: Session, location: str, data: OutdoorResponse) -> None:
    db.add(
        OutdoorDataCache(
            location=location,
            temperature=data.temperature,
            humidity=data.humidity,
            rainfall=data.rainfall or 0.0,
            aqi=data.aqi,
            aqi_grade=data.aqi_grade,
            pm25=data.pm25,
            pm10=data.pm10,
            uv_index=data.uv_index,
            weather_description=data.weather_description,
            cached_at=datetime.now(timezone.utc),
        )
    )
    db.commit()


# ─── 히스토리 ────────────────────────────────────────────────────────

def get_outdoor_history(
    db: Session, location: str, hours: int = 12
) -> list[OutdoorResponse]:
    """최근 N시간의 시계열 캐시 데이터 반환 (그래프용)."""
    cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
    records = (
        db.query(OutdoorDataCache)
        .filter(
            OutdoorDataCache.location == location,
            OutdoorDataCache.cached_at >= cutoff,
        )
        .order_by(OutdoorDataCache.cached_at.asc())
        .all()
    )
    return [_cache_to_response(r, cached=True) for r in records]


# ─── 메인 진입점 ─────────────────────────────────────────────────────

def get_outdoor_data(db: Session, location: str) -> OutdoorResponse:
    """
    캐시 확인 → 실 API 호출(키 있을 때) → mock 폴백 순서로 데이터 반환.
    NFR-R-001: 호출 실패 시 최근 캐시 반환 + cached=True 표시.
    """
    normalized = location.strip() or "경남 창원시 의창구"
    ttl = timedelta(minutes=settings.outdoor_cache_ttl_minutes)
    now = datetime.now(timezone.utc)

    # 1. 캐시 확인
    cache = (
        db.query(OutdoorDataCache)
        .filter(OutdoorDataCache.location == normalized)
        .order_by(OutdoorDataCache.cached_at.desc())
        .first()
    )
    cached_at = ensure_utc(cache.cached_at) if cache else None
    if cache and cached_at and cached_at >= now - ttl:
        return _cache_to_response(cache, cached=True)

    # 2. 실 API 호출
    live: OutdoorResponse | None = None
    if settings.kma_api_key or settings.airkorea_api_key:
        try:
            import asyncio as _asyncio
            live = _asyncio.run(_fetch_live_outdoor(normalized))
        except RuntimeError:
            # FastAPI async 컨텍스트에서 호출될 때 (이미 이벤트 루프 있음)
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
                future = pool.submit(
                    lambda: asyncio.run(_fetch_live_outdoor(normalized))  # type: ignore[arg-type]
                )
                try:
                    live = future.result(timeout=15)
                except Exception as exc:
                    logger.warning("실 API 스레드 호출 실패: %s", exc)
                    live = None
        except Exception as exc:
            logger.warning("실 API 호출 실패: %s", exc)
            live = None

    if live is not None:
        _save_cache(db, normalized, live)
        return live

    # 3. Mock 폴백
    # NFR-R-001: 실패 시 최근 캐시 우선 반환
    if cache:
        logger.info("API 실패/키 없음 → 만료 캐시 반환: %s", normalized)
        return _cache_to_response(cache, cached=True)

    # 최초 진입 + 키 없음 → mock
    outdoor = _build_mock_outdoor(normalized)
    _save_cache(db, normalized, outdoor)
    return outdoor
