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
from app.utils.airkorea_station import resolve_station_name
from app.utils.kma_grid import resolve_location_async
from app.utils.weather_api import fetch_airkorea, fetch_kma_weather

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

async def _skip_air_fetch() -> None:
    return None


async def _fetch_live_outdoor(location: str) -> OutdoorResponse | None:
    """기상청 + 에어코리아 실데이터 조합. 실패 시 None 반환."""
    place = await resolve_location_async(location)
    if place is None:
        logger.info("위치 좌표 매핑 없음: %s → mock 사용", location)
        return None

    lat, lon = place.lat, place.lon
    display_name = place.name
    air_station = await resolve_station_name(settings.airkorea_api_key, lat, lon)
    if settings.airkorea_api_key and not air_station:
        logger.warning("에어코리아 측정소 조회 실패: %s (%.4f, %.4f)", location, lat, lon)

    air_task = (
        fetch_airkorea(settings.airkorea_api_key, air_station)
        if air_station
        else _skip_air_fetch()
    )
    kma_task = (
        fetch_kma_weather(
            settings.kma_api_key,
            lat,
            lon,
            forecast_service_key=settings.kma_forecast_service_key,
        )
        if settings.kma_api_key or settings.kma_forecast_service_key
        else _skip_air_fetch()
    )
    kma_data, air_data = await asyncio.gather(
        kma_task,
        air_task,
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

    has_weather = kma_data is not None
    has_air = air_data is not None

    temp = float(kma_data["temperature"]) if has_weather else 20.0
    humidity = float(kma_data["humidity"]) if has_weather else 50.0
    rainfall = float(kma_data["rainfall"]) if has_weather else 0.0
    weather_desc = (
        kma_data["weather_description"] if has_weather else "정보 없음"
    )
    weather_source = kma_data.get("weather_source") if has_weather else None
    weather_station = kma_data.get("weather_station") if has_weather else None
    weather_observed_at = kma_data.get("weather_observed_at") if has_weather else None

    pm25 = float(air_data["pm25"]) if has_air else 15.0
    pm10 = float(air_data["pm10"]) if has_air else None
    aqi = float(air_data["aqi"]) if has_air else round(pm25 * 2.2, 1)
    aqi_grade = _pm25_to_grade(pm25)
    uv = _uv_estimate(hour, weather_desc)

    return OutdoorResponse(
        location=display_name,
        temperature=temp,
        humidity=humidity,
        rainfall=rainfall,
        aqi=aqi,
        aqi_grade=aqi_grade,
        pm25=pm25,
        pm10=pm10,
        uv_index=uv,
        weather_description=weather_desc,
        weather_source=weather_source,
        weather_station=weather_station,
        weather_observed_at=weather_observed_at,
        cached=False,
        is_mock=False,
        last_updated=now,
    )


# ─── 캐시 헬퍼 ──────────────────────────────────────────────────────

def _cache_has_weather(cache: OutdoorDataCache) -> bool:
    return cache.weather_description != "정보 없음"


def _is_fresh_cache(cache: OutdoorDataCache, now: datetime, ttl: timedelta) -> bool:
    """TTL 내 캐시이면서, API 키가 있을 때 해당 소스 데이터가 포함된 경우만 유효."""
    cached_at = ensure_utc(cache.cached_at)
    if cached_at is None or cached_at < now - ttl:
        return False
    if (settings.kma_api_key or settings.kma_forecast_service_key) and not _cache_has_weather(cache):
        return False
    return True


def _should_persist_cache(data: OutdoorResponse) -> bool:
    """기상/대기질 중 한쪽만 실패한 불완전 응답은 캐시하지 않는다."""
    if (settings.kma_api_key or settings.kma_forecast_service_key) and data.weather_description == "정보 없음":
        return False
    return True


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

def _run_async(coro):
    try:
        import asyncio as _asyncio
        return _asyncio.run(coro)
    except RuntimeError:
        import concurrent.futures
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            future = pool.submit(lambda: asyncio.run(coro))
            return future.result(timeout=20)


def get_outdoor_data(
    db: Session, location: str, force_refresh: bool = False
) -> OutdoorResponse:
    """
    캐시 확인 → 실 API 호출(키 있을 때) → mock 폴백 순서로 데이터 반환.
    NFR-R-001: 호출 실패 시 최근 캐시 반환 + cached=True 표시.

    GPS 좌표("35.22,128.68") 입력 시 가장 가까운 사전 지역명으로 정규화하여
    캐시 키를 통일하고 표시 지역명을 사람이 읽을 수 있게 변환한다.
    """
    normalized = location.strip() or "경남 창원시 의창구"
    ttl = timedelta(minutes=settings.outdoor_cache_ttl_minutes)
    now = datetime.now(timezone.utc)

    place = _run_async(resolve_location_async(normalized))
    cache_key = place.name if place else normalized
    fetch_input = f"{place.lat},{place.lon}" if place else normalized

    cache = (
        db.query(OutdoorDataCache)
        .filter(OutdoorDataCache.location == cache_key)
        .order_by(OutdoorDataCache.cached_at.desc())
        .first()
    )
    if not force_refresh and cache and _is_fresh_cache(cache, now, ttl):
        return _cache_to_response(cache, cached=True)

    live: OutdoorResponse | None = None
    if settings.kma_api_key or settings.kma_forecast_service_key or settings.airkorea_api_key:
        try:
            live = _run_async(_fetch_live_outdoor(fetch_input))
        except Exception as exc:
            logger.warning("실 API 호출 실패: %s", exc)
            live = None

    if live is not None:
        if _should_persist_cache(live):
            _save_cache(db, cache_key, live)
        return live.model_copy(update={"location": cache_key})

    if cache:
        logger.info("API 실패/키 없음 → 만료 캐시 반환: %s", cache_key)
        return _cache_to_response(cache, cached=True)

    return _build_mock_outdoor(cache_key)
