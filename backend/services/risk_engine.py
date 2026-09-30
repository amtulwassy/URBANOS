"""
URBANOS Urban Flood Risk Engine — PROTOTYPE.

IMPORTANT: this is a transparent, hand-weighted heuristic scorer, NOT a
trained machine-learning model. It mirrors the weighting already used by
the existing frontend (js/analysis.js) so risk scores stay consistent
before/after the backend migration.

Risk Score = rainfall + elevation + drainage(capacity & blockage)
             + imperviousness + water level + historical incidents contributions

See services/flood_prediction.py for where a real ML model would later be
substituted in (same call signature: score_zone(...) -> (score, level)).
"""
from config import settings

# Weight of each factor out of 100. Kept as named constants so they are easy
# to retune without touching the scoring logic itself.
WEIGHTS = {
    "rainfall": 32,
    "elevation": 22,
    "drainage_blockage": 20,
    "imperviousness": 10,
    "historical": 8,
    "water_level": 8,
}


def _clamp01(x: float) -> float:
    return max(0.0, min(1.0, x))


def compute_risk_score(
    elevation: float,
    drainage_capacity: float,
    drainage_blockage: float,
    imperviousness: float,
    water_level: float,
    historical_flood_count: int,
    recent_rainfall_mm: float,
) -> float:
    """Returns a 0-100 risk score. `drainage_capacity` is accepted for API
    completeness / future weighting but the current model (matching the
    frontend prototype) scores blockage directly, since blockage is the
    factor that actively drives risk up."""
    elevation_factor = _clamp01((15 - elevation) / 15)          # lower elevation -> higher risk
    drainage_factor = _clamp01(drainage_blockage / 100)
    impervious_factor = _clamp01(imperviousness / 100)
    history_factor = _clamp01(historical_flood_count / 8)
    rain_factor = _clamp01(recent_rainfall_mm / 60)
    water_factor = _clamp01(water_level / 2)

    score = (
        rain_factor * WEIGHTS["rainfall"]
        + elevation_factor * WEIGHTS["elevation"]
        + drainage_factor * WEIGHTS["drainage_blockage"]
        + impervious_factor * WEIGHTS["imperviousness"]
        + history_factor * WEIGHTS["historical"]
        + water_factor * WEIGHTS["water_level"]
    )
    return round(min(100.0, score), 1)


def risk_level_from_score(score: float) -> str:
    if score >= settings.RISK_THRESHOLD_CRITICAL:
        return "CRITICAL"
    if score >= settings.RISK_THRESHOLD_HIGH:
        return "HIGH"
    if score >= settings.RISK_THRESHOLD_MODERATE:
        return "MODERATE"
    return "LOW"


def risk_contributors(
    elevation: float,
    drainage_blockage: float,
    imperviousness: float,
    historical_flood_count: int,
    recent_rainfall_mm: float,
) -> list:
    factors = []
    if recent_rainfall_mm > 25:
        factors.append("Heavy rainfall")
    if elevation < 6:
        factors.append("Low elevation")
    if drainage_blockage > 40:
        factors.append("Drainage blockage")
    if historical_flood_count > 3:
        factors.append("History of waterlogging")
    if imperviousness > 65:
        factors.append("High impervious surface area")
    if not factors:
        factors.append("No major risk contributors detected")
    return factors
