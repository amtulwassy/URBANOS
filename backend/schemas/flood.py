from datetime import datetime
from typing import Optional, List, Any
from pydantic import BaseModel, ConfigDict


class WeatherOut(BaseModel):
    location: str
    latitude: float
    longitude: float
    rainfall: float
    temperature: Optional[float] = None
    humidity: Optional[float] = None
    wind_speed: Optional[float] = None
    condition: Optional[str] = None
    source: str
    recorded_at: datetime


class ForecastPoint(BaseModel):
    hours_ahead: int
    rainfall: float
    temperature: Optional[float] = None
    condition: Optional[str] = None


class ForecastOut(BaseModel):
    location: str
    source: str
    points: List[ForecastPoint]


class ZoneOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    zone_name: str
    city: Optional[str] = None
    latitude: float
    longitude: float
    elevation: float
    rainfall: float
    drainage_capacity: float
    drainage_blockage: float
    imperviousness: float
    water_level: float
    historical_flood_count: int
    risk_score: float
    risk_level: str
    updated_at: datetime


class ZoneUpdate(BaseModel):
    rainfall: Optional[float] = None
    water_level: Optional[float] = None
    drainage_blockage: Optional[float] = None


class GeoJSONGeometry(BaseModel):
    type: str = "Point"
    coordinates: List[float]


class GeoJSONFeature(BaseModel):
    type: str = "Feature"
    geometry: GeoJSONGeometry
    properties: dict


class GeoJSONFeatureCollection(BaseModel):
    type: str = "FeatureCollection"
    features: List[GeoJSONFeature]
