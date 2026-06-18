from datetime import datetime
from typing import Literal

from pydantic import BaseModel

SessionType = Literal["OUTDOOR", "INDOOR", "SLEEP"]


class SessionSummary(BaseModel):
    id: str
    type: SessionType
    started_at: datetime
    ended_at: datetime | None = None
    spike_count: int


class SessionListResponse(BaseModel):
    sessions: list[SessionSummary]
    total: int
    has_more: bool


class SpikeSummary(BaseModel):
    count: int
    avg_db_level: float | None = None
    max_db_level: float | None = None


class SessionDetailResponse(BaseModel):
    id: str
    type: SessionType
    started_at: datetime
    ended_at: datetime | None = None
    spike_summary: SpikeSummary


class SpikeResponse(BaseModel):
    id: str
    detected_at: datetime
    db_level: float
    duration_sec: int


class SessionSpikesResponse(BaseModel):
    spikes: list[SpikeResponse]


class CreateSpikeRequest(BaseModel):
    detected_at: datetime
    db_level: float
    duration_sec: int


class CreateSpikeResponse(BaseModel):
    spike_id: str


class DeleteSessionResponse(BaseModel):
    deleted_spikes_count: int


class ClearSessionsResponse(BaseModel):
    deleted_sessions: int
    deleted_spikes: int


class DeleteSpikeResponse(BaseModel):
    deleted_count: int


class CleanupResponse(BaseModel):
    deleted_spikes: int
    deleted_sessions: int