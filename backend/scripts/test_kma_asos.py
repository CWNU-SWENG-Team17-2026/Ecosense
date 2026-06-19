"""Test KMA keys against ASOS (surface observation) APIs."""

from __future__ import annotations

import asyncio
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

KST = timezone(timedelta(hours=9))
CHANGWON_STN = "155"  # 창원 ASOS
SEOUL_STN = "108"


async def test_apihub(key: str, stn: str) -> None:
    """KMA API허브 지상관측 시간자료 (kma_sfctm2.php)."""
    now = datetime.now(KST).replace(minute=0, second=0, microsecond=0)
    tm = now.strftime("%Y%m%d%H00")
    url = "https://apihub.kma.go.kr/api/typ01/url/kma_sfctm2.php"
    params = {"tm": tm, "stn": stn, "help": "0", "authKey": key}
    print(f"\n=== API허브 kma_sfctm2 (stn={stn}, tm={tm}) ===")
    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await client.get(url, params=params)
        print(f"HTTP {resp.status_code}")
        text = resp.text[:800]
        print(text)
        # Parse TA (col 12), HM (col 14) from fixed-width if success
        for line in text.splitlines():
            if line.startswith("20") and len(line) > 100:
                parts = line.split()
                if len(parts) >= 15:
                    print(f"  parsed: STN={parts[1]} TA={parts[11]} HM={parts[13]} RN={parts[15]}")


async def test_asos_hourly(key: str, stn: str) -> None:
    """공공데이터포털 AsosHourlyInfoService."""
    now = datetime.now(KST)
    # 최근 1시간 (API는 전일까지 제공, 당일은 지연 가능)
    end = now - timedelta(hours=1)
    start = end - timedelta(hours=2)
    params = {
        "serviceKey": key,
        "pageNo": 1,
        "numOfRows": 10,
        "dataType": "JSON",
        "dataCd": "ASOS",
        "dateCd": "HR",
        "startDt": start.strftime("%Y%m%d"),
        "startHh": start.strftime("%H"),
        "endDt": end.strftime("%Y%m%d"),
        "endHh": end.strftime("%H"),
        "stnIds": stn,
    }
    url = "http://apis.data.go.kr/1360000/AsosHourlyInfoService/getWthrDataList"
    print(f"\n=== 공공데이터 AsosHourly (stn={stn}) ===")
    async with httpx.AsyncClient(timeout=20.0) as client:
        for scheme_host in (
            "http://apis.data.go.kr/1360000/AsosHourlyInfoService/getWthrDataList",
            "https://apis.data.go.kr/1360000/AsosHourlyInfoService/getWthrDataList",
        ):
            resp = await client.get(scheme_host, params=params)
            print(f"[{scheme_host[:5]}] HTTP {resp.status_code}")
            if resp.status_code != 200:
                print(resp.text[:300])
                continue
            try:
                body = resp.json()
                header = body.get("response", {}).get("header", {})
                print(f"  resultCode={header.get('resultCode')} msg={header.get('resultMsg')}")
                items = body.get("response", {}).get("body", {}).get("items", {}).get("item", [])
                if isinstance(items, dict):
                    items = [items]
                for item in items[-3:]:
                    print(
                        f"  {item.get('tm')} TA={item.get('ta')} HM={item.get('hm')} "
                        f"RN={item.get('rn')} stn={item.get('stnId')}"
                    )
            except Exception as exc:  # noqa: BLE001
                print(f"  parse error: {exc}")
                print(resp.text[:400])


async def test_vilage_fcst(key: str) -> None:
    """기존 단기예보 API (비교용)."""
    from app.utils.kma_grid import latlon_to_grid
    from app.utils.weather_api import _base_time_for_now

    nx, ny = latlon_to_grid(35.2280, 128.6820)
    now = datetime.now(KST)
    base_date, base_time = _base_time_for_now(now)
    params = {
        "serviceKey": key,
        "numOfRows": 10,
        "pageNo": 1,
        "base_date": base_date,
        "base_time": base_time,
        "nx": nx,
        "ny": ny,
        "dataType": "JSON",
    }
    url = "http://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst"
    print(f"\n=== 단기예보 VilageFcst (비교용, nx={nx} ny={ny}) ===")
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(url, params=params)
        print(f"HTTP {resp.status_code} | {resp.text[:200]}")


async def main() -> None:
    from app.config import get_settings

    key = sys.argv[1] if len(sys.argv) > 1 else get_settings().kma_api_key
    if not key:
        print("No KMA key configured")
        sys.exit(1)
    print(f"Key length: {len(key)}")
    await test_apihub(key, CHANGWON_STN)
    await test_asos_hourly(key, CHANGWON_STN)
    await test_vilage_fcst(key)


if __name__ == "__main__":
    asyncio.run(main())
