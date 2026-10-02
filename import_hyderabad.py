import requests
import psycopg2
from psycopg2.extras import Json

# -------------------------------------------------
# Hyderabad Government Sewerage Network Import
# SAFE APPEND VERSION
# Imports only 1,000 records for prototype
# Does NOT delete existing records
# -------------------------------------------------

ARC_GIS_URL = (
    "https://tgrac.telangana.gov.in/arcgis/rest/services/"
    "TCUR_Folder/TCUR_Telangana_Core_Urban_Region_V2/"
    "MapServer/39/query"
)

DB_CONFIG = {
    "host": "localhost",
    "port": 5432,
    "database": "urbanos",
    "user": "postgres",
    "password": input("Enter PostgreSQL password: ")
}

BATCH_SIZE = 1000

params = {
    "where": "1=1",
    "outFields": (
        "OBJECTID_1,SP_ID,SP_PIPE_DI,SP_DEPTH,SP_STATUS,"
        "SP_MATERIA,SP_MH_TO_M,SP_CIRCLE_,SP_DIVISIO,"
        "SP_SUB_DIV,SP_SECTION,SP_YEAR_OF"
    ),
    "returnGeometry": "true",
    "outSR": "4326",
    "resultOffset": 0,
    "resultRecordCount": BATCH_SIZE,
    "f": "geojson"
}

print("\nDownloading Hyderabad sewerage GIS data...")

response = requests.get(
    ARC_GIS_URL,
    params=params,
    timeout=120
)

response.raise_for_status()

data = response.json()
features = data.get("features", [])

print(f"Records received: {len(features)}")

conn = psycopg2.connect(**DB_CONFIG)
cur = conn.cursor()

inserted = 0
skipped = 0

for feature in features:

    properties = feature.get("properties", {})
    geometry = feature.get("geometry")

    if not geometry:
        skipped += 1
        continue

    pipeline_name = properties.get("SP_ID")

    if not pipeline_name:
        skipped += 1
        continue

    # Prevent duplicate Hyderabad imports
    cur.execute(
        """
        SELECT id
        FROM drainage_pipelines
        WHERE pipeline_name = %s
          AND city = 'Hyderabad'
          AND state = 'Telangana'
        LIMIT 1
        """,
        (pipeline_name,)
    )

    if cur.fetchone():
        skipped += 1
        continue

    diameter_m = properties.get("SP_PIPE_DI")

    try:
        if diameter_m is not None:
            diameter_m = float(diameter_m)

            # Convert mm to metres if source value is large
            if diameter_m > 10:
                diameter_m = diameter_m / 1000.0

    except (ValueError, TypeError):
        diameter_m = None

    depth_m = properties.get("SP_DEPTH")

    try:
        if depth_m is not None:
            depth_m = float(depth_m)
    except (ValueError, TypeError):
        depth_m = None

    cur.execute(
        """
        INSERT INTO drainage_pipelines (
            pipeline_name,
            zone,
            diameter_m,
            status,
            geometry,
            material,
            depth_m,
            condition,
            water_level_percent,
            blocked,
            blockage_level_percent,
            city,
            state
        )
        VALUES (
            %s,
            %s,
            %s,
            'unknown',
            ST_Multi(
                ST_SetSRID(
                    ST_GeomFromGeoJSON(%s),
                    4326
                )
            ),
            %s,
            %s,
            'Unknown',
            0,
            FALSE,
            0,
            'Hyderabad',
            'Telangana'
        )
        """,
        (
            pipeline_name,
            properties.get("SP_DIVISIO"),
            diameter_m,
            Json(geometry),
            properties.get("SP_MATERIA"),
            depth_m
        )
    )

    inserted += 1

conn.commit()

print("\n---------------------------------------")
print("Hyderabad import completed")
print("---------------------------------------")
print(f"Government records received : {len(features)}")
print(f"New records inserted        : {inserted}")
print(f"Duplicates/skipped          : {skipped}")
print("---------------------------------------")

cur.close()
conn.close()