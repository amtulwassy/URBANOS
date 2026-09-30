"""
SQLAlchemy models for URBANOS.

PostGIS is used for geography columns (zone polygon, report point, station
point) via GeoAlchemy2. Every geo entity also keeps plain latitude/longitude
float columns so the API and simple SQL work even without spatial queries.
"""
import enum
import uuid
from datetime import datetime

from geoalchemy2 import Geometry
from sqlalchemy import (
    Column, String, Float, Integer, Boolean, DateTime, ForeignKey, Enum, Text
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from database.connection import Base


def gen_uuid():
    return str(uuid.uuid4())


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------
class UserRole(str, enum.Enum):
    USER = "USER"
    AUTHORITY = "AUTHORITY"


class ReportSeverity(str, enum.Enum):
    low = "low"
    medium = "medium"
    high = "high"


class ReportStatus(str, enum.Enum):
    Pending = "Pending"
    Verified = "Verified"
    Resolved = "Resolved"


# Fine-grained complaint pipeline stage, mirrors the frontend's stepper.
REPORT_STAGES = [
    "Submitted",
    "Municipal Review",
    "Contractor Assigned",
    "Worker Assigned",
    "Drainage Cleaning In Progress",
    "Resolved",
]


class RiskLevel(str, enum.Enum):
    LOW = "LOW"
    MODERATE = "MODERATE"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class ResourceType(str, enum.Enum):
    Ambulance = "Ambulance"
    Fire_Brigade = "Fire Brigade"
    Police = "Police"
    Rescue_Team = "Rescue Team"


# ---------------------------------------------------------------------------
# Users
# ---------------------------------------------------------------------------
class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    name = Column(String(120), nullable=False)
    email = Column(String(160), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    role = Column(Enum(UserRole), nullable=False, default=UserRole.USER)
    phone = Column(String(20), nullable=True)
    city = Column(String(80), nullable=True)
    state = Column(String(80), nullable=True)
    home_zone = Column(String(120), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    reports = relationship("CitizenReport", back_populates="user")


# ---------------------------------------------------------------------------
# Cities (lightweight - drives the state -> city picker & scoping)
# ---------------------------------------------------------------------------
class City(Base):
    __tablename__ = "cities"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    name = Column(String(80), unique=True, nullable=False, index=True)
    state = Column(String(80), nullable=False)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)

    zones = relationship("FloodRiskZone", back_populates="city_ref")


# ---------------------------------------------------------------------------
# Weather data
# ---------------------------------------------------------------------------
class WeatherData(Base):
    __tablename__ = "weather_data"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    location = Column(String(120), nullable=False)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    rainfall = Column(Float, default=0.0)          # mm / hour
    temperature = Column(Float, nullable=True)      # deg C
    humidity = Column(Float, nullable=True)          # %
    wind_speed = Column(Float, nullable=True)         # km/h
    condition = Column(String(60), nullable=True)      # e.g. "Rain", "Clear"
    source = Column(String(20), default="demo")          # demo | live
    recorded_at = Column(DateTime, default=datetime.utcnow, index=True)


# ---------------------------------------------------------------------------
# Flood risk zones (micro-zones)
# ---------------------------------------------------------------------------
class FloodRiskZone(Base):
    __tablename__ = "flood_risk_zones"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    city_id = Column(UUID(as_uuid=False), ForeignKey("cities.id"), nullable=False)
    zone_name = Column(String(120), nullable=False)

    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    # PostGIS point geometry (SRID 4326 = WGS84 lat/lng), used for map/GeoJSON queries.
    geom = Column(Geometry(geometry_type="POINT", srid=4326), nullable=True)

    elevation = Column(Float, default=0.0)                 # meters
    rainfall = Column(Float, default=0.0)                    # mm, latest observed
    drainage_capacity = Column(Float, default=50.0)           # 0-100 %
    drainage_blockage = Column(Float, default=0.0)             # 0-100 %
    imperviousness = Column(Float, default=50.0)                 # 0-100 %
    water_level = Column(Float, default=0.0)                       # meters
    historical_flood_count = Column(Integer, default=0)

    # cached values, recomputed by the risk engine whenever inputs change
    risk_score = Column(Float, default=0.0)
    risk_level = Column(Enum(RiskLevel), default=RiskLevel.LOW)

    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    city_ref = relationship("City", back_populates="zones")
    reports = relationship("CitizenReport", back_populates="zone_ref")


# ---------------------------------------------------------------------------
# Citizen reports
# ---------------------------------------------------------------------------
class CitizenReport(Base):
    __tablename__ = "citizen_reports"

    id = Column(String(20), primary_key=True)   # human friendly e.g. URB1042
    user_id = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=True)
    zone_id = Column(UUID(as_uuid=False), ForeignKey("flood_risk_zones.id"), nullable=True)

    city = Column(String(80), nullable=False, index=True)
    zone_name = Column(String(120), nullable=True)

    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    geom = Column(Geometry(geometry_type="POINT", srid=4326), nullable=True)

    description = Column(Text, nullable=True)
    incident_type = Column(String(80), default="Flood / Hazard")
    image_url = Column(String(255), nullable=True)
    severity = Column(Enum(ReportSeverity), default=ReportSeverity.medium)
    status = Column(Enum(ReportStatus), default=ReportStatus.Pending)

    # fine-grained pipeline (0..5, matches REPORT_STAGES) so the existing
    # frontend complaint tracker keeps working unmodified
    stage = Column(Integer, default=0)
    contractor = Column(String(120), nullable=True)
    worker = Column(String(120), nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", back_populates="reports")
    zone_ref = relationship("FloodRiskZone", back_populates="reports")


# ---------------------------------------------------------------------------
# Emergency resources
# ---------------------------------------------------------------------------
class EmergencyResource(Base):
    __tablename__ = "emergency_resources"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    city = Column(String(80), nullable=False, index=True)
    type = Column(Enum(ResourceType), nullable=False)
    name = Column(String(160), nullable=False)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    geom = Column(Geometry(geometry_type="POINT", srid=4326), nullable=True)
    availability = Column(String(40), default="Available")  # Available | Busy | Offline
    contact = Column(String(40), nullable=True)


class DrainagePipeline(Base):
    __tablename__ = "drainage_pipelines"

    pipeline_id = Column("id", Integer, primary_key=True, index=True)
    pipeline_name = Column(String(100), nullable=False)
    zone = Column(String(100), nullable=True)

    diameter_m = Column(Float, nullable=True)
    material = Column(String(50), nullable=True)
    depth_m = Column(Float, nullable=True)

    condition = Column(String(30), default="Normal")
    water_level_percent = Column(Float, default=0)
    blocked = Column(Boolean, default=False)
    blockage_level_percent = Column(Float, default=0)

    last_checked = Column(DateTime, nullable=True)

    geom = Column("geometry", Geometry("LINESTRING", srid=4326), nullable=True)