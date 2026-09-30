from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from database.connection import get_db
from database import models
from database.seed_data import STATE_CITIES
from services import flood_prediction, risk_engine

router = APIRouter(prefix="/api/flood", tags=["Flood"])


@router.get("/cities", summary="Pan-India state -> city list used by the location picker")
def list_states_cities():
    return {"states": list(STATE_CITIES.keys()), "state_cities": STATE_CITIES}


@router.get("/scenario", summary="What-if: project zone risk if rainfall increases by N mm")
def rainfall_scenario(
    city: str = Query(...),
    extra_rain_mm: float = Query(35.0, ge=0, le=300),
    db: Session = Depends(get_db),
):
    city_row = db.query(models.City).filter(models.City.name == city).first()
    if not city_row:
        raise HTTPException(status_code=404, detail=f"Unknown city '{city}'")
    zones = db.query(models.FloodRiskZone).filter(models.FloodRiskZone.city_id == city_row.id).all()

    base_rain = flood_prediction.recent_rainfall_for_city(db, city)
    results = []
    for z in zones:
        before_score, before_level, _ = flood_prediction.score_zone(db, z, base_rain)
        after_score, after_level, _ = flood_prediction.score_zone(db, z, base_rain + extra_rain_mm)
        results.append({
            "zone_id": z.id,
            "zone_name": z.zone_name,
            "current_score": before_score,
            "current_level": before_level,
            "projected_score": after_score,
            "projected_level": after_level,
            "escalates": after_level != before_level,
        })
    return {"city": city, "base_rainfall_mm": base_rain, "extra_rain_mm": extra_rain_mm, "zones": results}


@router.get("/thresholds", summary="Current risk-level score thresholds (configurable via .env)")
def thresholds():
    from config import settings
    return {
        "LOW": [0, settings.RISK_THRESHOLD_MODERATE - 1],
        "MODERATE": [settings.RISK_THRESHOLD_MODERATE, settings.RISK_THRESHOLD_HIGH - 1],
        "HIGH": [settings.RISK_THRESHOLD_HIGH, settings.RISK_THRESHOLD_CRITICAL - 1],
        "CRITICAL": [settings.RISK_THRESHOLD_CRITICAL, 100],
    }
