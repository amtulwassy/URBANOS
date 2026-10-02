import requests
import psycopg2
from psycopg2.extras import Json

# -------------------------------------------------
# Bhubaneswar Government Sewerage Network Import
# SAFE APPEND VERSION
# Does NOT delete existing records
# -------------------------------------------------

ARC_GIS_URL = (
    "https://bhubaneswarone.in/arcgis/rest/services/"
    "BhubaneswarOne/SewerageInfrastructure/MapServer/5/query"
)

DB_CONFIG = {
    "host": "localhost",
    "port": 5432,
    "database": "urbanos",
    "user": "postgres",
    "password": input("Enter PostgreSQL password: ")
}

BATCH_SIZE = 1000
offset = 0
total_received = 0
total_inserted = 0
total_skipped = 0

conn = psycopg2.connect(**DB_CONFIG)
cur = conn.cursor()

print("\nConnected to urbanos database.")
print("Starting SAFE Bhubaneswar sewerage import...\n")

while True:

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
    "f": "json"
}
    print(f"Downloading records {offset + 1} to {offset + BATCH_SIZE}...")

    response = requests.get(
        ARC_GIS_URL,
        params=params,
        timeout=60
    )

    response.raise_for_status()

    data = response.json()
    features = data.get("features", [])

    if not features:
        break

    total_received += len(features)

    for feature in features:

        properties = feature.get("properties", {})
        geometry = feature.get("geometry")

        if not geometry:
            total_skipped += 1
            continue

        pipeline_name = properties.get("code")

        if not pipeline_name:
            total_skipped += 1
            continue

        # Avoid duplicate import if script is run again
        cur.execute(
            """
            SELECT id
            FROM drainage_pipelines
            WHERE pipeline_name = %s
              AND city = 'Bhubaneswar'
              AND state = 'Odisha'
            LIMIT 1
            """,
            (pipeline_name,)
        )

        if cur.fetchone():
            total_skipped += 1
            continue

        # Government source gives pipe size as string.
        # Convert mm -> metres when numeric.
        diameter_m = None

        try:
            size_value = str(properties.get("size_", "")).strip()

            if size_value:
                diameter_m = float(size_value) / 1000.0

        except (ValueError, TypeError):
            diameter_m = None

        # Insert WITHOUT deleting existing records
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
                NULL,
                'Unknown',
                0,
                FALSE,
                0,
                'Bhubaneswar',
                'Odisha'
            )
            """,
            (
                pipeline_name,
                properties.get("division"),
                diameter_m,
                Json(geometry),
                properties.get("material")
            )
        )

        total_inserted += 1

    conn.commit()

    print(
        f"Batch complete | "
        f"Received: {len(features)} | "
        f"Inserted: {total_inserted} | "
        f"Skipped: {total_skipped}"
    )

    if len(features) < BATCH_SIZE:
        break

    offset += BATCH_SIZE


print("\n---------------------------------------")
print("Bhubaneswar import completed")
print("---------------------------------------")
print(f"Government records received : {total_received}")
print(f"New records inserted        : {total_inserted}")
print(f"Duplicates/skipped          : {total_skipped}")
print("---------------------------------------")

cur.close()
conn.close()