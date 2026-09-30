"""
Initializes the database:
  1. Enables the PostGIS extension (safe to run repeatedly).
  2. Creates all tables from the SQLAlchemy models.
  3. Seeds demo cities / zones / emergency resources / weather rows so the
     app is immediately usable, when the tables are empty.

Run directly:
    python -m database.init_db
It is also imported and called automatically from main.py on startup.
"""
import random
from datetime import datetime, timedelta

from sqlalchemy import text
from geoalchemy2.shape import from_shape
from shapely.geometry import Point

from database.connection import engine, SessionLocal, Base
from database import models
from database.seed_data import (
    STATE_CITIES, CURATED_ZONES, zones_for_city, build_zone_record,
    city_coords, zone_latlng,
)


def enable_postgis(conn):
    conn.execute(text("CREATE EXTENSION IF NOT EXISTS postgis"))


def create_tables():
    with engine.connect() as conn:
        enable_postgis(conn)
        conn.commit()
    Base.metadata.create_all(bind=engine)


def _point(lat: float, lng: float):
    return from_shape(Point(lng, lat), srid=4326)  # PostGIS point order is (lon, lat)


EMERGENCY_TEMPLATES = [
    (models.ResourceType.Ambulance, "City Hospital Ambulance Unit", "108"),
    (models.ResourceType.Fire_Brigade, "Central Fire Station", "101"),
    (models.ResourceType.Police, "City Police Control Room", "100"),
    (models.ResourceType.Rescue_Team, "NDRF Rescue Team", "1078"),
]


def seed_demo_data():
    db = SessionLocal()
    try:
        if db.query(models.City).count() > 0:
            print("[init_db] Demo data already present — skipping seed.")
            return

        print("[init_db] Seeding demo cities, zones, emergency resources, weather...")
        city_rows = {}
        for state, cities in STATE_CITIES.items():
            for city_name in cities:
                lat, lng = city_coords(city_name)
                city = models.City(name=city_name, state=state, latitude=lat, longitude=lng)
                db.add(city)
                city_rows[city_name] = city
        db.flush()

        # Seed zones + emergency resources for curated (major metro) cities fully,
        # and give every other city a lightweight generated set so no city is empty.
        for city_name, city in city_rows.items():
            zone_names = zones_for_city(city_name)
            for i, zname in enumerate(zone_names):
                rec = build_zone_record(city_name, zname)
                zlat, zlng = zone_latlng(city_name, i)
                zone = models.FloodRiskZone(
                    city_id=city.id,
                    zone_name=rec["zone_name"],
                    latitude=zlat,
                    longitude=zlng,
                    geom=_point(zlat, zlng),
                    elevation=rec["elevation"],
                    rainfall=rec["rainfall"],
                    drainage_capacity=rec["drainage_capacity"],
                    drainage_blockage=rec["drainage_blockage"],
                    imperviousness=rec["imperviousness"],
                    water_level=rec["water_level"],
                    historical_flood_count=rec["historical_flood_count"],
                )
                db.add(zone)

            clat, clng = city.latitude, city.longitude
            for rtype, name, contact in EMERGENCY_TEMPLATES:
                offset_lat = clat + random.uniform(-0.01, 0.01)
                offset_lng = clng + random.uniform(-0.01, 0.01)
                db.add(models.EmergencyResource(
                    city=city_name, type=rtype, name=f"{name} — {city_name}",
                    latitude=offset_lat, longitude=offset_lng,
                    geom=_point(offset_lat, offset_lng),
                    availability="Available", contact=contact,
                ))

            # 24h of synthetic hourly rainfall so charts/risk have something to show
            now = datetime.utcnow()
            for i in range(24, 0, -1):
                db.add(models.WeatherData(
                    location=city_name, latitude=clat, longitude=clng,
                    rainfall=round(random.uniform(0, 22), 1),
                    temperature=round(random.uniform(24, 34), 1),
                    humidity=round(random.uniform(55, 95), 1),
                    wind_speed=round(random.uniform(5, 28), 1),
                    condition=random.choice(["Clear", "Clouds", "Rain", "Thunderstorm"]),
                    source="demo",
                    recorded_at=now - timedelta(hours=i),
                ))

        db.commit()
        print("[init_db] Seed complete.")
    finally:
        db.close()


def main():
    create_tables()
    seed_demo_data()


if __name__ == "__main__":
    main()
