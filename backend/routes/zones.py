from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from database.connection import get_db
from database import models
from schemas.flood import ZoneOut, GeoJSONFeatureCollection, GeoJSONFeature, GeoJSONGeometry
from services import flood_prediction

router = APIRouter(prefix="/api/zones", tags=["Zones"])


def _zone_out(zone: models.FloodRiskZone) -> dict:
    return {
        "id": zone.id,
        "zone_name": zone.zone_name,
        "city": zone.city_ref.name if zone.city_ref else None,
        "latitude": zone.latitude,
        "longitude": zone.longitude,
        "elevation": zone.elevation,
        "rainfall": zone.rainfall,
        "drainage_capacity": zone.drainage_capacity,
        "drainage_blockage": zone.drainage_blockage,
        "imperviousness": zone.imperviousness,
        "water_level": zone.water_level,
        "historical_flood_count": zone.historical_flood_count,
        "risk_score": zone.risk_score,
        "risk_level": zone.risk_level.value if hasattr(zone.risk_level, "value") else zone.risk_level,
        "updated_at": zone.updated_at,
    }


def _get_city_zones(db: Session, city: str):
    city_row = db.query(models.City).filter(models.City.name == city).first()
    if not city_row:
        raise HTTPException(status_code=404, detail=f"Unknown city '{city}'")
    return db.query(models.FloodRiskZone).filter(models.FloodRiskZone.city_id == city_row.id).all()


@router.get("", response_model=list[ZoneOut], summary="List all micro-zones for a city, with live risk scores")
def list_zones(city: str = Query(..., description="City name"), db: Session = Depends(get_db)):
    zones = _get_city_zones(db, city)
    out = []
    for z in zones:
        flood_prediction.refresh_zone_risk(db, z, commit=False)
        out.append(_zone_out(z))
    db.commit()
    return out


@router.get("/risk", response_model=list[ZoneOut], summary="Zones for a city sorted by descending risk score")
def zones_by_risk(city: str = Query(...), db: Session = Depends(get_db)):
    zones = _get_city_zones(db, city)
    for z in zones:
        flood_prediction.refresh_zone_risk(db, z, commit=False)
    db.commit()
    zones.sort(key=lambda z: z.risk_score, reverse=True)
    return [_zone_out(z) for z in zones]


@router.get("/geojson", response_model=GeoJSONFeatureCollection, summary="Zones for a city as GeoJSON")
def zones_geojson(city: str = Query(...), db: Session = Depends(get_db)):
    zones = _get_city_zones(db, city)
    features = []
    for z in zones:
        flood_prediction.refresh_zone_risk(db, z, commit=False)
        features.append(GeoJSONFeature(
            geometry=GeoJSONGeometry(coordinates=[z.longitude, z.latitude]),
            properties={
                "id": z.id,
                "zone_name": z.zone_name,
                "risk_score": z.risk_score,
                "risk_level": z.risk_level.value if hasattr(z.risk_level, "value") else z.risk_level,
                "elevation": z.elevation,
                "water_level": z.water_level,
            },
        ))
    db.commit()
    return GeoJSONFeatureCollection(features=features)


@router.get("/{zone_id}", response_model=ZoneOut, summary="Single zone detail with live risk score")
def get_zone(zone_id: str, db: Session = Depends(get_db)):
    zone = db.query(models.FloodRiskZone).filter(models.FloodRiskZone.id == zone_id).first()
    if not zone:
        raise HTTPException(status_code=404, detail="Zone not found")
    flood_prediction.refresh_zone_risk(db, zone)
    return _zone_out(zone)
