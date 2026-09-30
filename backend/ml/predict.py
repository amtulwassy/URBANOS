import os
import joblib
import pandas as pd


# Path to trained ML model
MODEL_PATH = os.path.join(
    os.path.dirname(__file__),
    "flood_risk_model.pkl"
)

# Load model once when backend starts
model = joblib.load(MODEL_PATH)


FEATURES = [
    "rainfall",
    "elevation",
    "drainage_blockage",
    "imperviousness",
    "water_level",
    "historical_flood_count"
]


def predict_risk(
    rainfall: float,
    elevation: float,
    drainage_blockage: float,
    imperviousness: float,
    water_level: float,
    historical_flood_count: int,
):
    """
    Predict flood risk score using the trained Random Forest model.
    """

    data = pd.DataFrame([{
        "rainfall": rainfall,
        "elevation": elevation,
        "drainage_blockage": drainage_blockage,
        "imperviousness": imperviousness,
        "water_level": water_level,
        "historical_flood_count": historical_flood_count,
    }])

    prediction = model.predict(data)[0]

    # Keep score within 0-100
    score = max(0.0, min(100.0, float(prediction)))

    return round(score, 1)


def risk_level(score: float) -> str:
    if score >= 75:
        return "CRITICAL"
    elif score >= 50:
        return "HIGH"
    elif score >= 25:
        return "MODERATE"
    else:
        return "LOW"