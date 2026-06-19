"""KMA API key connectivity check."""

from __future__ import annotations

import asyncio
import sys
from datetime import datetime, timezone
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.utils.kma_grid import latlon_to_grid
from app.utils.weather_api import _base_time_for_now, fetch_kma_forecast

KMA_BASE = "http://apis.data.go.kr/1360000/VilageFcstInfoService_2.0"
# 창원 의창구
LAT, LON = 35.2280, 128.6820
NX, NY = latlon_to_grid(LAT, LON)


async def probe_raw(key: str, label: str) -> None:
    now = datetime.now(timezone.utc).astimezone()
    base_date, base_time = _base_time_for_now(now)
    params = {
        "serviceKey": key,
        "numOfRows": 10,
        "pageNo": 1,
        "base_date": base_date,
        "base_time": base_time,
        "nx": NX,
        "ny": NY,
        "dataType": "JSON",
    }
    print(f"\n=== {label} ===")
    print(f"grid nx={NX}, ny={NY} | base_date={base_date} base_time={base_time}")
    async with httpx.AsyncClient(timeout=15.0) as client:
        for scheme in ("http", "https"):
            url = f"{scheme}://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst"
            resp = await client.get(url, params=params)
            print(f"  [{scheme}] HTTP {resp.status_code}")
            text = resp.text[:600]
            if resp.status_code == 200:
                try:
                    body = resp.json()
                    header = body.get("response", {}).get("header", {})
                    print(f"  resultCode={header.get('resultCode')} msg={header.get('resultMsg')}")
                    items = (
                        body.get("response", {})
                        .get("body", {})
                        .get("items", {})
                        .get("item", [])
                    )
                    if items:
                        cats = {i["category"]: i["fcstValue"] for i in items[:20] if "category" in i}
                        print(f"  sample categories: {list(cats.keys())[:8]}")
                        if "TMP" in cats:
                            print(f"  TMP(기온)={cats['TMP']}")
                except Exception as exc:  # noqa: BLE001
                    print(f"  parse error: {exc}")
                    print(f"  body preview: {text}")
            else:
                print(f"  body preview: {text}")


async def main() -> None:
    key = sys.argv[1] if len(sys.argv) > 1 else ""
    if not key:
        print("Usage: test_kma_key.py <KMA_API_KEY>")
        sys.exit(1)

    print(f"Key length: {len(key)}")
    await probe_raw(key, "raw key test")

    result = await fetch_kma_forecast(key, NX, NY)
    print("\n=== fetch_kma_forecast() ===")
    if result:
        print("SUCCESS:", result)
    else:
        print("FAILED: returned None")


if __name__ == "__main__":
    asyncio.run(main())
