"""
Flood prediction / zone scoring orchestration.

This module sits ABOVE services/risk_engine.py on purpose: it is the single
place that decides *what* gets scored (which zone, which rainfall figure,
how recent citizen reports factor in) while risk_engine.py stays a pure,
stateless scoring function.

>>> WHERE TO PLUG IN A REAL ML MODEL LATER <<<
Replace the body of `score_zone()` with a call to your trained model
(e.g. `model.predict(features)`), keeping the same return shape
`(score: float, level: str, contributors: list[str])`. Everything else
in the app (routes, frontend) only depends on that return shape, so no
other file needs to change.
"""
from ml.predict import predict_risk
from sqlalchemy.orm import Session

from database import models
from services import risk_engine


def recent_rainfall_for_city(db: Session, city: str, hours: int = 3) -> float:
    rows = (
        db.query(models.WeatherData)
        .filter(models.WeatherData.location == city)
        .order_by(models.WeatherData.recorded_at.desc())
        .limit(hours)
        .all()
    )
    if not rows:
        return 0.0
    return round(sum(r.rainfall for r in rows) / len(rows), 1)


def nearby_report_count(db: Session, zone_id: str) -> int:
    return (
        db.query(models.CitizenReport)
        .filter(models.CitizenReport.zone_id == zone_id)
        .filter(models.CitizenReport.status != models.ReportStatus.Resolved)
        .count()
    )


def score_zone(db: Session, zone: models.FloodRiskZone, recent_rainfall_mm: float = None):
    """Prototype scorer with ML prediction."""

    if recent_rainfall_mm is None:
        recent_rainfall_mm = recent_rainfall_for_city(
            db,
            zone.city_ref.name if zone.city_ref else ""
        )

    incident_boost = min(2, nearby_report_count(db, zone.id))
    effective_history = zone.historical_flood_count + incident_boost

    score = predict_risk(
        rainfall=recent_rainfall_mm,
        elevation=zone.elevation,
        drainage_blockage=zone.drainage_blockage,
        imperviousness=zone.imperviousness,
        water_level=zone.water_level,
        historical_flood_count=effective_history,
    )

    level = risk_engine.risk_level_from_score(score)

    contributors = risk_engine.risk_contributors(
        elevation=zone.elevation,
        drainage_blockage=zone.drainage_blockage,
        imperviousness=zone.imperviousness,
        historical_flood_count=effective_history,
        recent_rainfall_mm=recent_rainfall_mm,
    )

    return score, level, contributors
def refresh_zone_risk(db: Session, zone: models.FloodRiskZone, commit: bool = True):
    """Recomputes and persists ML-based risk score and level."""

    score, level, _ = score_zone(db, zone)

    zone.risk_score = score
    zone.risk_level = level

    if commit:
        db.add(zone)
        db.commit()
        db.refresh(zone)

    return zone