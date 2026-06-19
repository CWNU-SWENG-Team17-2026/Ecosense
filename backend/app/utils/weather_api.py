"""
기상청(KMA) + 에어코리아 Open API 클라이언트

- 기상(실황): 공공데이터 초단기실황 (serviceKey, 10분 갱신) — 가능 시 우선
- 기상(관측): 기상청 API허브 ASOS 시간자료 (authKey, 매시 정시 관측소 값)
- 대기질: 에어코리아 실시간 측정 (ArpltnInforInqireSvc)
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx

from app.utils.kma_asos_station import ASOS_STATIONS, resolve_asos_station_id
from app.utils.kma_grid import latlon_to_grid

logger = logging.getLogger(__name__)

KST = timezone(timedelta(hours=9))
KMA_APIHUB_SFCTM2 = "https://apihub.kma.go.kr/api/typ01/url/kma_sfctm2.php"
KMA_FORECAST_BASE = "https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0"
AIRKOREA_BASE = "https://apis.data.go.kr/B552584/ArpltnInforInqireSvc"

_SKY_CODE = {"1": "맑음", "3": "구름 많음", "4": "흐림"}
_PTY_CODE = {
    "0": "",
    "1": "비",
    "2": "비/눈",
    "3": "눈",
    "4": "소나기",
    "5": "빗방울",
    "6": "빗방울/눈날림",
    "7": "눈날림",
}
_NCST_PTY_CODE = _PTY_CODE

# GTS 과거일기 코드 (WP)
_WP_DESC: dict[str, str] = {
    "3": "황사",
    "4": "안개",
    "5": "가랑비",
    "6": "비",
    "7": "눈",
    "8": "소나기",
    "9": "뇌전",
    "10": "비",
    "11": "눈",
    "12": "비/눈",
}


def _is_apihub_key(api_key: str) -> bool:
    """API허브 authKey(짧음) vs 공공데이터 serviceKey(김) 구분."""
    return len(api_key) < 40


def _forecast_service_key(kma_api_key: str, forecast_service_key: str) -> str:
    """초단기실황/단기예보용 공공데이터 serviceKey."""
    if forecast_service_key:
        return forecast_service_key
    if kma_api_key and not _is_apihub_key(kma_api_key):
        return kma_api_key
    return ""


def _parse_observed_at_kst(raw: str) -> datetime | None:
    try:
        return datetime.strptime(raw, "%Y%m%d%H%M").replace(tzinfo=KST)
    except (TypeError, ValueError):
        return None


def _ultra_base_datetime(now: datetime) -> tuple[str, str]:
    """초단기실황: 매시 정시 발표, 10분 이후 데이터 확보 가정."""
    base = now.replace(minute=0, second=0, microsecond=0)
    if now.minute < 10:
        base -= timedelta(hours=1)
    return base.strftime("%Y%m%d"), base.strftime("%H00")


def _parse_kma_value(raw: str, default: float = 0.0) -> float:
    try:
        val = float(raw)
        if val < 0:  # KMA 결측값 (-9, -99 등)
            return default
        return val
    except (TypeError, ValueError):
        return default


def _weather_from_asos(wp: str, wc: str, ca_tot: str) -> str:
    wp_str = str(wp).strip()
    if wp_str in _WP_DESC and wp_str not in ("-9", ""):
        return _WP_DESC[wp_str]

    wc_str = str(wc).strip()
    if wc_str not in ("-9", "", "-"):
        if wc_str in ("6", "7", "8"):
            return _WP_DESC.get(wc_str, "비")
        if wc_str in ("4",):
            return "안개"

    try:
        cloud = float(ca_tot)
        if cloud >= 0 and cloud <= 2:
            return "맑음"
        if cloud <= 5:
            return "구름 많음"
        if cloud > 5:
            return "흐림"
    except (TypeError, ValueError):
        pass

    return "맑음"


def _parse_sfctm_line(line: str) -> dict[str, Any] | None:
    """API허브 고정폭 지상관측 한 줄 파싱."""
    parts = line.split()
    if len(parts) < 16:
        return None

    temp = _parse_kma_value(parts[11])
    humidity = _parse_kma_value(parts[13], default=50.0)
    rainfall = _parse_kma_value(parts[15], default=0.0)
    wp = parts[23] if len(parts) > 23 else "-9"
    wc = parts[22] if len(parts) > 22 else "-9"
    ca_tot = parts[32] if len(parts) > 32 else "-9"

    return {
        "temperature": temp,
        "humidity": humidity,
        "rainfall": rainfall,
        "weather_description": _weather_from_asos(wp, wc, ca_tot),
        "observed_at": parts[0],
        "stn_id": int(parts[1]),
    }


async def fetch_kma_asos(api_key: str, stn_id: int) -> dict[str, Any] | None:
    """기상청 API허브 ASOS 시간자료 → 기온·습도·강수·날씨 반환."""
    if not api_key:
        return None

    station_name = next((s.name for s in ASOS_STATIONS if s.stn_id == stn_id), str(stn_id))

    now = datetime.now(KST)
    async with httpx.AsyncClient(timeout=15.0) as client:
        for hours_ago in range(0, 8):
            tm = (now - timedelta(hours=hours_ago)).replace(
                minute=0, second=0, microsecond=0
            )
            tm_str = tm.strftime("%Y%m%d%H00")
            params = {
                "tm": tm_str,
                "stn": str(stn_id),
                "help": "0",
                "authKey": api_key,
            }
            try:
                resp = await client.get(KMA_APIHUB_SFCTM2, params=params)
                resp.raise_for_status()
            except Exception as exc:
                logger.warning("KMA ASOS 호출 실패 (stn=%s, tm=%s): %s", stn_id, tm_str, exc)
                continue

            for line in resp.text.splitlines():
                if not line.startswith("20"):
                    continue
                parsed = _parse_sfctm_line(line)
                if parsed is not None:
                    observed = _parse_observed_at_kst(parsed["observed_at"])
                    logger.info(
                        "KMA ASOS 성공: stn=%s tm=%s TA=%s HM=%s",
                        stn_id,
                        tm_str,
                        parsed["temperature"],
                        parsed["humidity"],
                    )
                    return {
                        **parsed,
                        "weather_source": "asos_hourly",
                        "weather_station": station_name,
                        "weather_observed_at": observed,
                    }

    logger.warning("KMA ASOS: 유효 데이터 없음 (stn=%s)", stn_id)
    return None


async def fetch_kma_ultra_ncst(
    service_key: str, lat: float, lon: float
) -> dict[str, Any] | None:
    """공공데이터 초단기실황 — 격자 기준 10분 단위 실황 (날씨앱과 유사)."""
    if not service_key:
        return None

    nx, ny = latlon_to_grid(lat, lon)
    now = datetime.now(KST)
    base_date, base_time = _ultra_base_datetime(now)

    params = {
        "serviceKey": service_key,
        "numOfRows": 100,
        "pageNo": 1,
        "dataType": "JSON",
        "base_date": base_date,
        "base_time": base_time,
        "nx": nx,
        "ny": ny,
    }

    try:
        async with httpx.AsyncClient(timeout=12.0) as client:
            resp = await client.get(
                f"{KMA_FORECAST_BASE}/getUltraSrtNcst", params=params
            )
            resp.raise_for_status()
            body = resp.json()
    except Exception as exc:
        logger.warning("KMA 초단기실황 호출 실패 (nx=%s, ny=%s): %s", nx, ny, exc)
        return None

    header = body.get("response", {}).get("header", {})
    result_code = str(header.get("resultCode", ""))
    if result_code not in ("00", "0"):
        logger.warning("KMA 초단기실황 오류: %s", header)
        return None

    items = body.get("response", {}).get("body", {}).get("items", {}).get("item", [])
    if not items:
        return None

    data: dict[str, str] = {item["category"]: item["obsrValue"] for item in items}

    def _ncst_float(key: str, default: float = 0.0) -> float:
        raw = data.get(key, "")
        try:
            val = float(raw)
            if val <= -900 or val >= 900:
                return default
            return val
        except (TypeError, ValueError):
            return default

    temp = _ncst_float("T1H")
    humidity = _ncst_float("REH", 50.0)
    rainfall = _ncst_float("RN1", 0.0)
    pty = _NCST_PTY_CODE.get(data.get("PTY", "0"), "")
    weather_desc = pty if pty else "맑음"

    observed = datetime.strptime(
        f"{base_date}{base_time}", "%Y%m%d%H%M"
    ).replace(tzinfo=KST)

    return {
        "temperature": temp,
        "humidity": humidity,
        "rainfall": rainfall,
        "weather_description": weather_desc,
        "weather_source": "ultra_ncst",
        "weather_station": f"격자({nx},{ny})",
        "weather_observed_at": observed,
    }


def _base_time_for_now(now: datetime) -> tuple[str, str]:
    hour = now.hour
    base_hours = [2, 5, 8, 11, 14, 17, 20, 23]
    base_h = 23
    for h in reversed(base_hours):
        if hour >= h:
            base_h = h
            break
    base_date = now.strftime("%Y%m%d")
    if hour < 2:
        prev = now - timedelta(days=1)
        base_date = prev.strftime("%Y%m%d")
        base_h = 23
    return base_date, f"{base_h:02d}00"


async def fetch_kma_forecast(api_key: str, nx: int, ny: int) -> dict[str, Any] | None:
    """공공데이터포털 단기예보 API (serviceKey 전용)."""
    if not api_key:
        return None

    now = datetime.now(KST)
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
            resp = await client.get(f"{KMA_FORECAST_BASE}/getVilageFcst", params=params)
            resp.raise_for_status()
            body = resp.json()

        items = (
            body.get("response", {})
            .get("body", {})
            .get("items", {})
            .get("item", [])
        )
        if not items:
            logger.warning("KMA 단기예보: 데이터 없음 (nx=%s, ny=%s)", nx, ny)
            return None

        data: dict[str, str] = {}
        for item in items:
            if item.get("fcstDate") == today and item.get("fcstTime", "") <= cur_hour:
                data[item["category"]] = item["fcstValue"]

        if not data:
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
        logger.warning("KMA 단기예보 API 호출 실패: %s", exc)
        return None


async def fetch_kma_weather(
    kma_api_key: str,
    lat: float,
    lon: float,
    forecast_service_key: str = "",
) -> dict[str, Any] | None:
    """위경도 기준 기상 데이터 조회 (초단기실황 우선 → ASOS 시간관측 폴백)."""
    service_key = _forecast_service_key(kma_api_key, forecast_service_key)
    if service_key:
        ncst = await fetch_kma_ultra_ncst(service_key, lat, lon)
        if ncst is not None:
            return ncst

    if not kma_api_key:
        return None

    if _is_apihub_key(kma_api_key):
        stn_id = resolve_asos_station_id(lat, lon)
        return await fetch_kma_asos(kma_api_key, stn_id)

    nx, ny = latlon_to_grid(lat, lon)
    forecast = await fetch_kma_forecast(kma_api_key, nx, ny)
    if forecast is None:
        return None
    return {
        **forecast,
        "weather_source": "vilage_fcst",
        "weather_station": f"격자({nx},{ny})",
        "weather_observed_at": None,
    }


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
        pm25 = _safe_float(row.get("pm25Value"), default=-1)
        pm10 = _safe_float(row.get("pm10Value"), default=-1)
        if pm25 < 0 and pm10 < 0:
            return None

        if pm25 < 0:
            pm25 = 10.0
        if pm10 < 0:
            pm10 = 20.0

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
