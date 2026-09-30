from typing import Optional
from pydantic import BaseModel, ConfigDict


class EmergencyResourceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    city: str
    type: str
    name: str
    latitude: float
    longitude: float
    availability: str
    contact: Optional[str] = None
