"""
기상청 격자 좌표 변환 유틸리티
Lambert Conformal Conic 투영 (기상청 표준)

도/분/초 → 위경도 → 격자 좌표(nx, ny)
"""
import math

# 기상청 격자 변환 상수 (기상청 공식 문서 기준)
_RE = 6371.00877       # 지구 반경 (km)
_GRID = 5.0            # 격자 간격 (km)
_SLAT1 = 30.0          # 투영 위도 1 (도)
_SLAT2 = 60.0          # 투영 위도 2 (도)
_OLON = 126.0          # 기준점 경도 (도)
_OLAT = 38.0           # 기준점 위도 (도)
_XO = 43               # 기준점 격자 X
_YO = 136              # 기준점 격자 Y

# 미리 계산
_DEGRAD = math.pi / 180.0
_re = _RE / _GRID
_slat1 = _SLAT1 * _DEGRAD
_slat2 = _SLAT2 * _DEGRAD
_olon = _OLON * _DEGRAD
_olat = _OLAT * _DEGRAD

_sn = math.tan(math.pi * 0.25 + _slat2 * 0.5) / math.tan(math.pi * 0.25 + _slat1 * 0.5)
_sn = math.log(math.cos(_slat1) / math.cos(_slat2)) / math.log(_sn)
_sf = math.tan(math.pi * 0.25 + _slat1 * 0.5)
_sf = (_sf ** _sn) * math.cos(_slat1) / _sn
_ro = math.tan(math.pi * 0.25 + _olat * 0.5)
_ro = _re * _sf / (_ro ** _sn)


def latlon_to_grid(lat: float, lon: float) -> tuple[int, int]:
    """위경도 → 기상청 격자 좌표 (nx, ny)"""
    ra = math.tan(math.pi * 0.25 + lat * _DEGRAD * 0.5)
    ra = _re * _sf / (ra ** _sn)
    theta = lon * _DEGRAD - _olon
    if theta > math.pi:
        theta -= 2.0 * math.pi
    if theta < -math.pi:
        theta += 2.0 * math.pi
    theta *= _sn

    nx = int(ra * math.sin(theta) + _XO + 0.5)
    ny = int(_ro - ra * math.cos(theta) + _YO + 0.5)
    return nx, ny


# 주요 지역 사전 매핑 (위치 이름 → 위경도)
# 기상청 검색이 한국어 지명을 받으므로 자주 쓰는 도시를 미리 매핑
_LOCATION_COORDS: dict[str, tuple[float, float]] = {
    "경남 창원시 의창구": (35.2280, 128.6820),
    "경남 창원시 성산구": (35.2196, 128.6921),
    "경남 창원시 마산합포구": (35.1855, 128.5745),
    "경남 창원시 마산회원구": (35.2157, 128.5822),
    "경남 창원시 진해구": (35.1531, 128.6892),
    "서울특별시 종로구": (37.5735, 126.9789),
    "서울특별시 강남구": (37.5172, 127.0473),
    "부산광역시 해운대구": (35.1631, 129.1639),
    "대구광역시 수성구": (35.8586, 128.6306),
    "인천광역시 연수구": (37.4104, 126.6783),
    "서울": (37.5665, 126.9780),
    "부산": (35.1796, 129.0756),
    "대구": (35.8714, 128.6014),
    "인천": (37.4563, 126.7052),
    "광주": (35.1595, 126.8526),
    "대전": (36.3504, 127.3845),
    "울산": (35.5384, 129.3114),
    "창원": (35.2280, 128.6820),
}

# 에어코리아 측정소 매핑 (지역명 → 측정소 이름)
_STATION_MAP: dict[str, str] = {
    "경남 창원시 의창구": "창원",
    "경남 창원시 성산구": "창원",
    "경남 창원시 마산합포구": "마산",
    "경남 창원시 마산회원구": "마산",
    "경남 창원시 진해구": "창원",
    "서울특별시 종로구": "종로구",
    "서울특별시 강남구": "강남구",
    "부산광역시 해운대구": "해운대구",
    "대구광역시 수성구": "수성구",
    "인천광역시 연수구": "연수구",
    "서울": "종로구",
    "부산": "해운대구",
    "대구": "수성구",
    "인천": "연수구",
    "광주": "서구",
    "대전": "서구",
    "울산": "중구",
    "창원": "창원",
}


def _parse_latlon(location: str) -> tuple[float, float] | None:
    try:
        parts = location.split(",")
        if len(parts) == 2:
            return float(parts[0].strip()), float(parts[1].strip())
    except ValueError:
        pass
    return None


def _nearest_location_name(location: str) -> str | None:
    """위경도 문자열이면 가장 가까운 사전 지역명 반환."""
    coords = _parse_latlon(location)
    if coords is None:
        return None
    lat, lon = coords
    best_name: str | None = None
    best_dist = float("inf")
    for name, (clat, clon) in _LOCATION_COORDS.items():
        dist = (lat - clat) ** 2 + (lon - clon) ** 2
        if dist < best_dist:
            best_dist = dist
            best_name = name
    return best_name


def get_coords(location: str) -> tuple[float, float] | None:
    """지역명으로 위경도 반환. 없으면 None."""
    # 정확히 일치
    if location in _LOCATION_COORDS:
        return _LOCATION_COORDS[location]
    # 부분 일치 (앞부분)
    for key, coords in _LOCATION_COORDS.items():
        if key in location or location in key:
            return coords
    # 위경도 문자열 직접 입력 ("37.5,126.9" 형태)
    return _parse_latlon(location)


def get_station(location: str) -> str:
    """지역명으로 에어코리아 측정소 이름 반환."""
    if location in _STATION_MAP:
        return _STATION_MAP[location]
    for key, station in _STATION_MAP.items():
        if key in location or location in key:
            return station
    nearest = _nearest_location_name(location)
    if nearest and nearest in _STATION_MAP:
        return _STATION_MAP[nearest]
    return "종로구"  # 기본값
