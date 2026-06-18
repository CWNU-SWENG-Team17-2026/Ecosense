from fastapi import APIRouter, Query

router = APIRouter(prefix="/location", tags=["location"])

_LOCATIONS = [
    "경남 창원시 의창구",
    "경남 창원시 성산구",
    "경남 창원시 마산합포구",
    "경남 창원시 마산회원구",
    "경남 창원시 진해구",
    "서울특별시 종로구",
    "서울특별시 강남구",
    "부산광역시 해운대구",
    "대구광역시 수성구",
    "인천광역시 연수구",
]


@router.get("/search")
def search_locations(keyword: str = Query(min_length=1)):
    normalized = keyword.strip().lower()
    results = [
        {"name": name}
        for name in _LOCATIONS
        if normalized in name.lower()
    ]

    if not results and normalized:
        results = [{"name": keyword.strip()}]

    return results[:10]