"""Outdoor API smoke tests (requires running backend on :8000)."""

from __future__ import annotations

import sys

import httpx

BASE = "http://127.0.0.1:8000"
ORIGIN = "http://127.0.0.1:5173"


def main() -> int:
    failures: list[str] = []

    with httpx.Client(base_url=BASE, headers={"Origin": ORIGIN}, timeout=30.0) as client:
        def check(name: str, fn) -> None:
            try:
                fn()
                print(f"[OK] {name}")
            except Exception as exc:  # noqa: BLE001
                failures.append(name)
                print(f"[FAIL] {name}: {exc}")

        def health() -> None:
            res = client.get("/health")
            res.raise_for_status()
            if res.json().get("status") != "ok":
                raise RuntimeError(res.text)

        def outdoor_changwon_live_air() -> None:
            res = client.get(
                "/api/outdoor",
                params={"location": "경남 창원시 의창구"},
            )
            res.raise_for_status()
            data = res.json()
            if data.get("is_mock"):
                raise RuntimeError(f"expected live data, got mock: {data}")
            if data.get("weather_description") == "정보 없음":
                raise RuntimeError(f"weather not loaded: {data}")
            print(
                f"      pm25={data['pm25']} pm10={data.get('pm10')} "
                f"temp={data['temperature']} weather={data['weather_description']} "
                f"is_mock={data['is_mock']}"
            )

        def outdoor_gangnam() -> None:
            res = client.get(
                "/api/outdoor",
                params={"location": "서울"},
            )
            res.raise_for_status()
            data = res.json()
            if data.get("is_mock"):
                raise RuntimeError(f"expected live data: {data}")
            if data.get("weather_description") == "정보 없음":
                raise RuntimeError(f"weather not loaded: {data}")
            print(
                f"      pm25={data['pm25']} temp={data['temperature']} "
                f"weather={data['weather_description']}"
            )

        def outdoor_busan() -> None:
            res = client.get("/api/outdoor", params={"location": "부산"})
            res.raise_for_status()
            data = res.json()
            if data.get("is_mock") or data.get("weather_description") == "정보 없음":
                raise RuntimeError(f"busan failed: {data}")
            print(
                f"      pm25={data['pm25']} temp={data['temperature']} "
                f"weather={data['weather_description']}"
            )

        def outdoor_gps_coords() -> None:
            res = client.get(
                "/api/outdoor",
                params={"location": "35.2280,128.6820"},
            )
            res.raise_for_status()
            data = res.json()
            if data.get("is_mock"):
                raise RuntimeError(f"GPS coords should resolve live air: {data}")
            print(f"      pm25={data['pm25']} (GPS input)")

        def outdoor_history() -> None:
            res = client.get(
                "/api/outdoor/history",
                params={"location": "경남 창원시 의창구", "hours": 12},
            )
            res.raise_for_status()
            records = res.json().get("records", [])
            if not isinstance(records, list):
                raise RuntimeError(res.text)
            print(f"      history records={len(records)}")

        def location_search() -> None:
            res = client.get("/api/location/search", params={"keyword": "창원"})
            res.raise_for_status()
            results = res.json()
            if not results:
                raise RuntimeError("no search results")
            print(f"      results={len(results)} first={results[0]['name']}")

        check("GET /health", health)
        check("outdoor changwon (live)", outdoor_changwon_live_air)
        check("outdoor seoul (live)", outdoor_gangnam)
        check("outdoor busan (live)", outdoor_busan)
        check("outdoor GPS coords", outdoor_gps_coords)
        check("outdoor history", outdoor_history)
        check("location search", location_search)

    if failures:
        print(f"\nFAILED: {', '.join(failures)}")
        return 1

    print("\nOutdoor smoke tests passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
