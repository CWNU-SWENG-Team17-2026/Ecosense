from datetime import datetime
from typing import Literal

from pydantic import BaseModel

ReportPeriod = Literal["weekly", "monthly"]


class ReportHistoryItem(BaseModel):
    id: str
    period: ReportPeriod
    created_at: datetime
    summary_text: str | None = None