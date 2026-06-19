from fastapi import APIRouter, Query

from app.utils.geocoding import search_places
from app.utils.kma_asos_station import ASOS_STATIONS
from app.utils.kma_grid import _LOCATION_COORDS

router = APIRouter(prefix="/location", tags=["location"])


def _local_matches(keyword: str) -> list[dict[str, str | float]]:
    normalized = keyword.strip().lower()
    if not normalized:
        return []

    seen: set[str] = set()
    results: list[dict[str, str | float]] = []

    for name, (lat, lon) in _LOCATION_COORDS.items():
        if normalized in name.lower() and name not in seen:
            seen.add(name)
            results.append({"name": name, "lat": lat, "lon": lon})

    for station in ASOS_STATIONS:
        if normalized in station.name.lower() and station.name not in seen:
            seen.add(station.name)
            results.append(
                {"name": station.name, "lat": station.lat, "lon": station.lon}
            )

    return results


@router.get("/search")
async def search_locations(keyword: str = Query(min_length=1)):
    """전국 지역 검색 — OpenStreetMap 지오코딩 + 로컬 관측소/행정구역."""
    local = _local_matches(keyword)
    remote = await search_places(keyword, limit=8)

    seen: set[str] = set()
    merged: list[dict[str, str | float]] = []

    for item in local:
        name = str(item["name"])
        if name not in seen:
            seen.add(name)
            merged.append(item)

    for place in remote:
        if place.name not in seen:
            seen.add(place.name)
            merged.append(
                {"name": place.name, "lat": place.lat, "lon": place.lon}
            )

    if not merged:
        merged = [{"name": keyword.strip()}]

    return merged[:10]
