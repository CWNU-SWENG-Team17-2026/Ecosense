"""
OpenStreetMap Nominatim 기반 지오코딩 (전국 주소 검색 / GPS 역지오코딩).

별도 API 키 없이 사용 가능. 요청 빈도는 1초 1회 이하로 제한한다.
"""
from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass
from typing import Any

import httpx

logger = logging.getLogger(__name__)

NOMINATIM_BASE = "https://nominatim.openstreetmap.org"
_USER_AGENT = "EcoSense/1.0 (environment app; contact: dev@local)"
_last_request_at = 0.0
_rate_lock = asyncio.Lock()

_PROVINCE_SHORT: dict[str, str] = {
    "서울특별시": "서울",
    "부산광역시": "부산",
    "대구광역시": "대구",
    "인천광역시": "인천",
    "광주광역시": "광주",
    "대전광역시": "대전",
    "울산광역시": "울산",
    "세종특별자치시": "세종",
    "경기도": "경기",
    "강원특별자치도": "강원",
    "강원도": "강원",
    "충청북도": "충북",
    "충청남도": "충남",
    "전북특별자치도": "전북",
    "전라북도": "전북",
    "전라남도": "전남",
    "경상북도": "경북",
    "경상남도": "경남",
    "제주특별자치도": "제주",
}


@dataclass(frozen=True)
class GeoPlace:
    name: str
    lat: float
    lon: float


async def _throttle() -> None:
    global _last_request_at
    async with _rate_lock:
        now = time.monotonic()
        wait = 1.05 - (now - _last_request_at)
        if wait > 0:
            await asyncio.sleep(wait)
        _last_request_at = time.monotonic()


def _shorten_province(name: str) -> str:
    return _PROVINCE_SHORT.get(name, name)


def format_korean_address(address: dict[str, Any]) -> str:
    """Nominatim address 객체 → 한국식 짧은 지명."""
    province = address.get("state") or address.get("province") or ""
    province = _shorten_province(str(province)) if province else ""

    city = (
        address.get("city")
        or address.get("town")
        or address.get("county")
        or address.get("municipality")
        or ""
    )
    district = (
        address.get("borough")
        or address.get("city_district")
        or address.get("district")
        or address.get("suburb")
        or ""
    )

    parts = [p for p in (province, str(city), str(district)) if p]
    if parts:
        return " ".join(parts)

    return address.get("country", "알 수 없는 위치")


async def reverse_geocode(lat: float, lon: float) -> GeoPlace | None:
    """GPS 좌표 → 행정구역명."""
    await _throttle()
    params = {
        "lat": lat,
        "lon": lon,
        "format": "json",
        "accept-language": "ko",
        "zoom": 14,
        "addressdetails": 1,
    }
    try:
        async with httpx.AsyncClient(timeout=12.0, headers={"User-Agent": _USER_AGENT}) as client:
            resp = await client.get(f"{NOMINATIM_BASE}/reverse", params=params)
            resp.raise_for_status()
            body = resp.json()
    except Exception as exc:
        logger.warning("역지오코딩 실패 (%.4f, %.4f): %s", lat, lon, exc)
        return None

    address = body.get("address") or {}
    name = format_korean_address(address)
    if not name or name == "대한민국":
        name = body.get("display_name", name)
    return GeoPlace(name=name, lat=lat, lon=lon)


async def search_places(keyword: str, limit: int = 8) -> list[GeoPlace]:
    """키워드로 전국 장소 검색."""
    text = keyword.strip()
    if not text:
        return []

    await _throttle()
    params = {
        "q": text,
        "format": "json",
        "countrycodes": "kr",
        "limit": limit,
        "accept-language": "ko",
        "addressdetails": 1,
    }
    try:
        async with httpx.AsyncClient(timeout=12.0, headers={"User-Agent": _USER_AGENT}) as client:
            resp = await client.get(f"{NOMINATIM_BASE}/search", params=params)
            resp.raise_for_status()
            rows = resp.json()
    except Exception as exc:
        logger.warning("지역 검색 실패 (%s): %s", text, exc)
        return []

    results: list[GeoPlace] = []
    seen: set[str] = set()
    for row in rows:
        address = row.get("address") or {}
        name = format_korean_address(address)
        if not name or name in seen:
            display = row.get("display_name", "")
            if not display or display in seen:
                continue
            name = display.split(",")[0].strip()
        seen.add(name)
        try:
            lat = float(row["lat"])
            lon = float(row["lon"])
        except (KeyError, TypeError, ValueError):
            continue
        results.append(GeoPlace(name=name, lat=lat, lon=lon))

    return results


async def geocode_place_name(name: str) -> GeoPlace | None:
    """지역명 → 좌표."""
    results = await search_places(name, limit=1)
    return results[0] if results else None
