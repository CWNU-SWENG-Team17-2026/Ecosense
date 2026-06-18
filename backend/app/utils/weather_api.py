"""
기상청(KMA) + 에어코리아 Open API 클라이언트

- 기상청 단기예보 API (VilageFcstInfoService_2.0)
- 에어코리아 실시간 측정 API (ArpltnInforInqireSvc)
- API 키가 없거나 호출 실패 시 None 반환 → 호출부에서 mock 폴백
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

import httpx

logger = logging.getLogger(__name__)

KMA_BASE = "http://apis.data.go.kr/1360000/VilageFcstInfoService_2.0"
AIRKOREA_BASE = "http://apis.data.go.kr/B552584/ArpltnInforInqireSvc"

# 기상청 하늘상태 코드 → 설명
_SKY_CODE = {"1": "맑음", "3": "구름 많음", "4": "흐림"}
# 기상청 강수형태 코드
_PTY_CODE = {"0": "", "1": "비", "2": "비/눈", "3": "눈", "5": "빗방울", "6": "빗방울/눈날림", "7": "눈날림"}


def _base_time_for_now(now: datetime) -> tuple[str, str]:
    """현재 시각에서 가장 최근 기상청 예보 base_date, base_time 계산.
    단기예보 발표 시각: 0200, 0500, 0800, 1100, 1400, 1700, 2000, 2300
    """
    hour = now.hour
    base_hours = [2, 5, 8, 11, 14, 17, 20, 23]
    base_h = 23
    for h in reversed(base_hours):
        if hour >= h:
            base_h = h
            break
    base_date = now.strftime("%Y%m%d")
    # 발표 시각이 아직 안 됐으면 전날 23시
    if hour < 2:
        from datetime import timedelta
        prev = now - timedelta(days=1)
        base_date = prev.strftime("%Y%m%d")
        base_h = 23
    return base_date, f"{base_h:02d}00"


async def fetch_kma_forecast(api_key: str, nx: int, ny: int) -> dict[str, Any] | None:
    """기상청 단기예보 API 호출 → 파싱된 현재 날씨 dict 반환."""
    if not api_key:
        return None

    now = datetime.now(timezone.utc).astimezone()
    base_date, base_time = _base_time_for_now(now)
    today = now.strftime("%Y%m%d")
    cur_hour = f"{now.hour:02d}00"

    params = {
        "serviceKey": api_key,
        "numOfRows": 300,
        "pageNo": 1,
        "base_date": base_date,
        "base_time": base_time,
        "nx": nx,
        "ny": ny,
        "dataType": "JSON",
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"{KMA_BASE}/getVilageFcst", params=params)
            resp.raise_for_status()
            body = resp.json()

        items = (
            body.get("response", {})
            .get("body", {})
            .get("items", {})
            .get("item", [])
        )
        if not items:
            logger.warning("KMA: 예보 데이터 없음 (nx=%s, ny=%s)", nx, ny)
            return None

        # 가장 가까운 예보 시각 데이터 추출
        data: dict[str, str] = {}
        for item in items:
            if item.get("fcstDate") == today and item.get("fcstTime", "") <= cur_hour:
                data[item["category"]] = item["fcstValue"]

        if not data:
            # 오늘 시각 이전 데이터가 없으면 첫 번째 예보 시각 사용
            first_date = items[0]["fcstDate"]
            first_time = items[0]["fcstTime"]
            for item in items:
                if item["fcstDate"] == first_date and item["fcstTime"] == first_time:
                    data[item["category"]] = item["fcstValue"]

        temp = float(data.get("TMP", 0))
        humidity = float(data.get("REH", 50))
        sky = _SKY_CODE.get(data.get("SKY", "1"), "맑음")
        pty = _PTY_CODE.get(data.get("PTY", "0"), "")
        pcp_raw = data.get("PCP", "0mm")
        try:
            rainfall = float(pcp_raw.replace("mm", "").replace("강수없음", "0").strip())
        except ValueError:
            rainfall = 0.0

        weather_desc = pty if pty else sky

        return {
            "temperature": temp,
            "humidity": humidity,
            "rainfall": rainfall,
            "weather_description": weather_desc,
        }

    except Exception as exc:
        logger.warning("KMA API 호출 실패: %s", exc)
        return None


async def fetch_airkorea(api_key: str, station_name: str) -> dict[str, Any] | None:
    """에어코리아 실시간 측정 API → pm25, pm10, aqi 반환."""
    if not api_key:
        return None

    params = {
        "serviceKey": api_key,
        "returnType": "json",
        "numOfRows": 1,
        "pageNo": 1,
        "stationName": station_name,
        "dataTerm": "DAILY",
        "ver": "1.3",
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                f"{AIRKOREA_BASE}/getMsrstnAcctoRltmMesureDnsty", params=params
            )
            resp.raise_for_status()
            body = resp.json()

        items = body.get("response", {}).get("body", {}).get("items", [])
        if not items:
            logger.warning("에어코리아: 측정 데이터 없음 (station=%s)", station_name)
            return None

        row = items[0]
        pm25 = _safe_float(row.get("pm25Value"), 10.0)
        pm10 = _safe_float(row.get("pm10Value"), 20.0)
        # 한국 PM2.5 기준 AQI 환산 (단순 선형)
        aqi = round(pm25 * 2.2, 1)

        return {"pm25": pm25, "pm10": pm10, "aqi": aqi}

    except Exception as exc:
        logger.warning("에어코리아 API 호출 실패: %s", exc)
        return None


def _safe_float(val: Any, default: float) -> float:
    try:
        return float(val)
    except (TypeError, ValueError):
        return default
