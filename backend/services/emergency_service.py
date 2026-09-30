"""Emergency resource lookup helpers (nearest-first ordering)."""
import math
from sqlalchemy.orm import Session
from database import models


def haversine_km(lat1, lng1, lat2, lng2):
    R = 6371
    d_lat = math.radians(lat2 - lat1)
    d_lng = math.radians(lng2 - lng1)
    a = (math.sin(d_lat / 2) ** 2
         + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(d_lng / 2) ** 2)
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _coerce_resource_type(rtype: str):
    """Accepts 'Ambulance', 'ambulance', 'Fire Brigade', 'fire_brigade', etc."""
    if not rtype:
        return None
    normalized = rtype.strip().replace("-", " ").replace("_", " ").lower()
    for member in models.ResourceType:
        if member.value.lower() == normalized:
            return member
    return None


def list_resources(db: Session, city: str, rtype: str = None,
                    near_lat: float = None, near_lng: float = None):
    q = db.query(models.EmergencyResource).filter(models.EmergencyResource.city == city)
    if rtype:
        enum_type = _coerce_resource_type(rtype)
        q = q.filter(models.EmergencyResource.type == enum_type) if enum_type else q.filter(False)
    rows = q.all()
    if near_lat is not None and near_lng is not None:
        rows.sort(key=lambda r: haversine_km(near_lat, near_lng, r.latitude, r.longitude))
    return rows
