from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from database.connection import get_db
from schemas.emergency import EmergencyResourceOut
from services import emergency_service

router = APIRouter(prefix="/api/emergency", tags=["Emergency Services"])


@router.get("", response_model=list[EmergencyResourceOut],
            summary="List emergency resources for a city, nearest-first if lat/lng given")
def list_emergency(
    city: str = Query(...),
    lat: float | None = Query(default=None),
    lng: float | None = Query(default=None),
    db: Session = Depends(get_db),
):
    return emergency_service.list_resources(db, city, near_lat=lat, near_lng=lng)


@router.get("/{resource_type}", response_model=list[EmergencyResourceOut],
            summary="List emergency resources of one type (Ambulance, Fire Brigade, Police, Rescue Team)")
def list_emergency_by_type(
    resource_type: str,
    city: str = Query(...),
    lat: float | None = Query(default=None),
    lng: float | None = Query(default=None),
    db: Session = Depends(get_db),
):
    return emergency_service.list_resources(db, city, rtype=resource_type, near_lat=lat, near_lng=lng)
