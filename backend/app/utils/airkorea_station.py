"""
에어코리아 측정소 동적 조회

getMsrstnList(ver=1.1)로 전국 측정소 WGS84 좌표를 캐시한 뒤,
사용자 위경도 기준 최근접 측정소 stationName을 반환한다.
"""
from __future__ import annotations

import logging
import math
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx

logger = logging.getLogger(__name__)

MSRSTN_INFO_BASE = "http://apis.data.go.kr/B552584/MsrstnInfoInqireSvc"
_CACHE_TTL = timedelta(hours=24)

_cache: list[AirKoreaStation] | None = None
_cache_at: datetime | None = None


@dataclass(frozen=True)
class AirKoreaStation:
    name: str
    lat: float
    lon: float
    station_code: str | None = None


def _normalize_items(raw: Any) -> list[dict[str, Any]]:
    if not raw:
        return []
    if isinstance(raw, dict):
        return [raw]
    return list(raw)


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius_km = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lon2 - lon1)
    a = (
        math.sin(d_phi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    )
    return 2 * radius_km * math.asin(math.sqrt(a))


def find_nearest_station(
    lat: float, lon: float, stations: list[AirKoreaStation]
) -> AirKoreaStation | None:
    if not stations:
        return None

    nearest = min(stations, key=lambda s: _haversine_km(lat, lon, s.lat, s.lon))
    distance = _haversine_km(lat, lon, nearest.lat, nearest.lon)
    logger.info(
        "최근접 측정소: %s (%.1f km, lat=%.4f lon=%.4f)",
        nearest.name,
        distance,
        nearest.lat,
        nearest.lon,
    )
    return nearest


async def _fetch_all_stations(api_key: str) -> list[AirKoreaStation]:
    stations: list[AirKoreaStation] = []
    page = 1
    page_size = 100

    async with httpx.AsyncClient(timeout=30.0) as client:
        while True:
            params = {
                "serviceKey": api_key,
                "returnType": "json",
                "numOfRows": page_size,
                "pageNo": page,
                "ver": "1.1",
            }
            resp = await client.get(f"{MSRSTN_INFO_BASE}/getMsrstnList", params=params)
            resp.raise_for_status()
            body = resp.json()

            header = body.get("response", {}).get("header", {})
            if header.get("resultCode") != "00":
                raise RuntimeError(
                    f"getMsrstnList failed: {header.get('resultMsg', 'unknown')}"
                )

            payload = body.get("response", {}).get("body", {})
            items = _normalize_items(payload.get("items"))
            for item in items:
                item_text = str(item.get("item") or "")
                if "PM2.5" not in item_text and "PM10" not in item_text:
                    continue
                try:
                    lon = float(item["dmX"])
                    lat = float(item["dmY"])
                except (KeyError, TypeError, ValueError):
                    continue

                name = str(item.get("stationName") or "").strip()
                if not name:
                    continue

                stations.append(
                    AirKoreaStation(
                        name=name,
                        lat=lat,
                        lon=lon,
                        station_code=str(item.get("stationCode") or "") or None,
                    )
                )

            total_count = int(payload.get("totalCount") or 0)
            if page * page_size >= total_count:
                break
            page += 1

    logger.info("에어코리아 측정소 목록 로드: %d개", len(stations))
    return stations


async def get_station_cache(api_key: str) -> list[AirKoreaStation]:
    global _cache, _cache_at

    now = datetime.now(timezone.utc)
    if _cache is not None and _cache_at is not None and now - _cache_at < _CACHE_TTL:
        return _cache

    stations = await _fetch_all_stations(api_key)
    _cache = stations
    _cache_at = now
    return stations


def clear_station_cache() -> None:
    """테스트/재로드용 캐시 초기화."""
    global _cache, _cache_at
    _cache = None
    _cache_at = None


async def resolve_station_name(api_key: str, lat: float, lon: float) -> str | None:
    """위경도 기준 최근접 에어코리아 측정소명 반환."""
    if not api_key:
        return None

    try:
        stations = await get_station_cache(api_key)
    except Exception as exc:
        logger.warning("측정소 목록 조회 실패: %s", exc)
        return None

    nearest = find_nearest_station(lat, lon, stations)
    return nearest.name if nearest else None
