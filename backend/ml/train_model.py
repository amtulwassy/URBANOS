import os
import sys
import joblib
import pandas as pd

sys.path.append(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
)

from sklearn.ensemble import RandomForestRegressor
from sqlalchemy import create_engine, text
from config import settings


# ==========================================
# 1. Connect to PostgreSQL
# ==========================================

engine = create_engine(settings.DATABASE_URL)


# ==========================================
# 2. Read zone data
# ==========================================

query = text("""
    SELECT
        elevation,
        drainage_blockage,
        imperviousness,
        water_level,
        historical_flood_count,
        rainfall
    FROM flood_risk_zones
""")

with engine.connect() as connection:
    df = pd.read_sql(query, connection)


print("\nTraining records loaded:", len(df))


# ==========================================
# 3. Create meaningful training target
# ==========================================
#
# This reproduces the existing URBANOS
# risk-engine logic to create training labels.
#
# ML will learn the relationship between
# environmental factors and flood risk.
# ==========================================

df["elevation_factor"] = (
    (15 - df["elevation"]) / 15
).clip(0, 1)

df["rain_factor"] = (
    df["rainfall"] / 60
).clip(0, 1)

df["blockage_factor"] = (
    df["drainage_blockage"] / 100
).clip(0, 1)

df["impervious_factor"] = (
    df["imperviousness"] / 100
).clip(0, 1)

df["history_factor"] = (
    df["historical_flood_count"] / 8
).clip(0, 1)

df["water_factor"] = (
    df["water_level"] / 2
).clip(0, 1)


# Same weighting currently used by URBANOS
df["risk_target"] = (
    df["rain_factor"] * 32
    + df["elevation_factor"] * 22
    + df["blockage_factor"] * 20
    + df["impervious_factor"] * 10
    + df["history_factor"] * 8
    + df["water_factor"] * 8
).clip(0, 100)


# ==========================================
# 4. Features
# ==========================================

features = [
    "rainfall",
    "elevation",
    "drainage_blockage",
    "imperviousness",
    "water_level",
    "historical_flood_count"
]

X = df[features]
y = df["risk_target"]


# ==========================================
# 5. Train Random Forest
# ==========================================

model = RandomForestRegressor(
    n_estimators=200,
    random_state=42
)

model.fit(X, y)


# ==========================================
# 6. Feature importance
# ==========================================

print("\nFeature importance:")

for feature, importance in zip(
    features,
    model.feature_importances_
):
    print(f"{feature}: {importance:.3f}")


# ==========================================
# 7. Save model
# ==========================================

model_path = os.path.join(
    os.path.dirname(__file__),
    "flood_risk_model.pkl"
)

joblib.dump(model, model_path)


print("\n==========================================")
print("URBANOS ML MODEL RETRAINED SUCCESSFULLY")
print("==========================================")
print("Training records:", len(df))
print("Risk target range:",
      round(y.min(), 1),
      "to",
      round(y.max(), 1))
print("Model saved to:", model_path)