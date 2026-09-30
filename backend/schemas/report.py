from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field


class ReportCreate(BaseModel):
    city: str
    zone_name: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    description: Optional[str] = Field(default=None, max_length=2000)
    incident_type: Optional[str] = "Flood / Hazard"
    severity: str = "medium"   # low | medium | high
    image_url: Optional[str] = None  # set after uploading via /api/reports/{id}/photo


class ReportOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    user_id: Optional[str] = None
    city: str
    zone_name: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    description: Optional[str] = None
    incident_type: Optional[str] = None
    image_url: Optional[str] = None
    severity: str
    status: str
    stage: int
    contractor: Optional[str] = None
    worker: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class ReportStatusUpdate(BaseModel):
    status: Optional[str] = None   # Pending | Verified | Resolved
    stage: Optional[int] = Field(default=None, ge=0, le=5)
    contractor: Optional[str] = None
    worker: Optional[str] = None
