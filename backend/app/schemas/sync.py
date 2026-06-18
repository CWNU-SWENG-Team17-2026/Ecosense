from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

SessionType = Literal["OUTDOOR", "INDOOR", "SLEEP"]


class SyncSessionPayload(BaseModel):
    id: str
    type: SessionType
    started_at: datetime
    ended_at: datetime | None = None


class SyncSpikePayload(BaseModel):
    session_id: str
    detected_at: datetime
    db_level: float
    duration_sec: int


class SyncUploadRequest(BaseModel):
    sessions: list[SyncSessionPayload] = Field(default_factory=list)
    spikes: list[SyncSpikePayload] = Field(default_factory=list)


class SyncUploadResponse(BaseModel):
    synced_sessions: int
    synced_spikes: int
    failed_session_ids: list[str] = Field(default_factory=list)


class SyncDownloadSpike(BaseModel):
    id: str
    session_id: str
    detected_at: datetime
    db_level: float
    duration_sec: int


class SyncDownloadResponse(BaseModel):
    sessions: list[SyncSessionPayload]
    spikes: list[SyncDownloadSpike]