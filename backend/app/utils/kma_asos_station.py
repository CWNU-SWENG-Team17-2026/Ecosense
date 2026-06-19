"""
기상청 ASOS(종관기상관측) 지점 정보

전국 ASOS 관측소 좌표를 기반으로 최근접 관측소를 찾는다.
기상청 API허브 지상관측 API(stn 파라미터)에 사용된다.
"""
from __future__ import annotations

import math
from dataclasses import dataclass


@dataclass(frozen=True)
class AsosStation:
    stn_id: int
    name: str
    lat: float
    lon: float


# 기상청 종관(ASOS) 주요 관측소 (전국 62개소 기준, KMA 공식 지점 좌표)
ASOS_STATIONS: tuple[AsosStation, ...] = (
    AsosStation(90, "속초", 38.25085, 128.56473),
    AsosStation(93, "백령도", 37.97403, 124.71237),
    AsosStation(95, "철원", 38.14787, 127.3042),
    AsosStation(98, "동두천", 37.90188, 127.0607),
    AsosStation(99, "파주", 37.88589, 126.76648),
    AsosStation(100, "대관령", 38.1191, 128.4523),
    AsosStation(101, "춘천", 37.94738, 127.75443),
    AsosStation(102, "백령", 37.97399, 124.7124),
    AsosStation(104, "북강릉", 37.80456, 128.85535),
    AsosStation(105, "강릉", 37.75147, 128.89099),
    AsosStation(106, "동해", 37.50709, 129.12433),
    AsosStation(108, "서울", 37.57142, 126.9658),
    AsosStation(112, "인천", 37.47772, 126.6249),
    AsosStation(114, "원주", 37.33749, 127.94659),
    AsosStation(115, "울릉도", 37.48129, 130.89863),
    AsosStation(119, "수원", 37.25746, 126.983),
    AsosStation(121, "영월", 37.18126, 128.45743),
    AsosStation(127, "충주", 36.97045, 127.9525),
    AsosStation(129, "서산", 36.77658, 126.4939),
    AsosStation(130, "울진", 36.99176, 129.41278),
    AsosStation(131, "청주", 36.63924, 127.44066),
    AsosStation(133, "대전", 36.36999, 127.3722),
    AsosStation(135, "추풍령", 36.22025, 127.99458),
    AsosStation(136, "안동", 36.57293, 128.70733),
    AsosStation(138, "포항", 36.03201, 129.38002),
    AsosStation(140, "군산", 36.0053, 126.76135),
    AsosStation(143, "대구", 35.88482, 128.6189),
    AsosStation(146, "전주", 35.84092, 127.1172),
    AsosStation(152, "울산", 35.58237, 129.3347),
    AsosStation(155, "창원", 35.17019, 128.57281),
    AsosStation(156, "광주", 35.17294, 126.89156),
    AsosStation(159, "부산", 35.10468, 129.03203),
    AsosStation(162, "통영", 34.84541, 128.43561),
    AsosStation(165, "목포", 34.81732, 126.38151),
    AsosStation(168, "여수", 34.76037, 127.66222),
    AsosStation(170, "완도", 34.3959, 126.70182),
    AsosStation(172, "고창", 35.42661, 126.70182),
    AsosStation(174, "순천", 34.95066, 127.4874),
    AsosStation(177, "홍성", 36.65759, 126.68772),
    AsosStation(184, "제주", 33.51411, 126.52969),
    AsosStation(185, "고산", 33.29382, 126.16283),
    AsosStation(188, "성산", 33.38677, 126.8802),
    AsosStation(189, "서귀포", 33.24616, 126.5653),
    AsosStation(192, "진주", 35.16378, 128.04004),
    AsosStation(201, "강화", 37.70739, 126.44634),
    AsosStation(202, "양평", 37.48863, 127.49446),
    AsosStation(203, "이천", 37.26497, 127.48421),
    AsosStation(211, "인제", 38.05986, 128.16714),
    AsosStation(212, "홍천", 37.6836, 127.88043),
    AsosStation(216, "태백", 37.17038, 128.98929),
    AsosStation(217, "정선군", 37.37732, 128.67348),
    AsosStation(221, "제천", 37.17632, 128.19056),
    AsosStation(226, "보은", 36.48761, 127.73415),
    AsosStation(232, "천안", 36.76217, 127.29282),
    AsosStation(235, "보령", 36.32724, 126.55744),
    AsosStation(236, "부여", 36.27242, 126.92078),
    AsosStation(238, "금산", 36.10563, 127.48175),
    AsosStation(243, "부안", 35.72961, 126.71657),
    AsosStation(244, "임실", 35.61203, 127.28583),
    AsosStation(245, "정읍", 35.56337, 126.83904),
    AsosStation(247, "남원", 35.4213, 127.39652),
    AsosStation(248, "장수", 35.65696, 127.52031),
    AsosStation(251, "영광군", 35.27718, 126.51181),
    AsosStation(252, "김해시", 35.87756, 128.87276),
    AsosStation(253, "북창원", 35.22655, 128.6726),
    AsosStation(254, "정선", 37.37732, 128.67348),
    AsosStation(257, "양산시", 35.30737, 129.02009),
    AsosStation(258, "보성군", 34.76335, 127.21226),
    AsosStation(259, "강진군", 34.64201, 126.79226),
    AsosStation(260, "장흥", 34.68886, 126.91951),
    AsosStation(261, "해남", 34.55375, 126.56907),
    AsosStation(262, "고흥", 34.61826, 127.27572),
    AsosStation(266, "광양시", 34.94339, 127.6914),
    AsosStation(268, "진도군", 34.48685, 126.26334),
    AsosStation(271, "봉화", 36.94361, 128.91449),
    AsosStation(272, "영주", 36.87183, 128.51687),
    AsosStation(273, "문경", 36.62727, 128.14879),
    AsosStation(276, "청송군", 36.4351, 129.04005),
    AsosStation(277, "영덕", 36.53336, 129.40924),
    AsosStation(278, "의성", 36.3561, 128.68862),
    AsosStation(279, "구미", 36.13055, 128.32055),
    AsosStation(281, "영천", 35.97742, 128.9514),
    AsosStation(283, "경주시", 35.8174, 129.2009),
    AsosStation(284, "거창", 35.686, 127.9099),
    AsosStation(285, "합천", 35.565, 128.167),
    AsosStation(288, "밀양", 35.49147, 128.74412),
    AsosStation(289, "산청", 35.413, 127.8791),
    AsosStation(294, "거제", 34.88818, 128.60459),
    AsosStation(295, "남해", 34.81662, 127.92641),
)


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


def find_nearest_asos_station(lat: float, lon: float) -> AsosStation:
    """위경도 기준 최근접 ASOS 관측소 반환."""
    return min(ASOS_STATIONS, key=lambda s: _haversine_km(lat, lon, s.lat, s.lon))


def resolve_asos_station_id(lat: float, lon: float) -> int:
    return find_nearest_asos_station(lat, lon).stn_id


def find_asos_coords_by_name(location: str) -> tuple[float, float] | None:
    """지역명으로 ASOS 관측소 좌표 검색 (부분 일치)."""
    text = location.strip().lower()
    if not text:
        return None

    # 정확/부분 일치 우선
    for station in ASOS_STATIONS:
        name = station.name.lower()
        if name == text or name in text or text in name:
            return station.lat, station.lon

    # 시·도 단위 별칭
    aliases: dict[str, str] = {
        "서울특별시": "서울",
        "부산광역시": "부산",
        "대구광역시": "대구",
        "인천광역시": "인천",
        "광주광역시": "광주",
        "대전광역시": "대전",
        "울산광역시": "울산",
        "세종": "대전",
        "제주특별자치도": "제주",
        "제주도": "제주",
        "경남 창원": "북창원",
        "창원시": "북창원",
        "의창구": "북창원",
        "경남": "북창원",
    }
    for alias, target in aliases.items():
        if alias.lower() in text:
            for station in ASOS_STATIONS:
                if station.name == target:
                    return station.lat, station.lon

    return None


def resolve_display_name_from_coords(lat: float, lon: float) -> str:
    """GPS 좌표 → 가장 가까운 ASOS 관측소명."""
    station = find_nearest_asos_station(lat, lon)
    return station.name
