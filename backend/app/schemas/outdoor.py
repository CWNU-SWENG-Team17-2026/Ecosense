from datetime import datetime
from typing import Literal

from pydantic import BaseModel

AqiGrade = Literal["good", "moderate", "bad", "very_bad"]


class OutdoorResponse(BaseModel):
    location: str
    temperature: float
    humidity: float
    rainfall: float | None = None
    aqi: float
    aqi_grade: AqiGrade
    pm25: float
    pm10: float | None = None
    uv_index: float | None = None
    weather_description: str
    cached: bool
    is_mock: bool = False
    last_updated: datetime


class OutdoorHistoryResponse(BaseModel):
    records: list[OutdoorResponse]