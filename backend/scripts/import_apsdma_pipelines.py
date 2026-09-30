import requests
from shapely.geometry import shape, LineString, MultiLineString
from sqlalchemy import text

from database.connection import SessionLocal


API_URL = "https://apsdmagis.ap.gov.in/gisserver/rest/services/Hosted/APSDMA_Infra/FeatureServer/30/query"


def get_pipelines():
    params = {
        "where": "1=1",
        "outFields": "*",
        "returnGeometry": "true",
        "f": "geojson",
        "resultRecordCount": 100
    }

    response = requests.get(API_URL, params=params, timeout=30)
    response.raise_for_status()

    data = response.json()
    return data.get("features", [])


def normalize_geometry(geometry):
    geom = shape(geometry)

    if isinstance(geom, LineString):
        return MultiLineString([geom])

    if isinstance(geom, MultiLineString):
        return geom

    return None


def import_pipelines():
    features = get_pipelines()

    print(f"Government GIS pipelines received: {len(features)}")

    db = SessionLocal()

    inserted = 0

    try:
        for feature in features:
            properties = feature.get("properties", {})
            geometry = feature.get("geometry")

            if not geometry:
                continue

            geom = normalize_geometry(geometry)

            if geom is None:
                continue

            pipeline_id = (
                properties.get("se_id")
                or properties.get("wrd_id")
                or properties.get("rd_id")
                or f"APSDMA-{inserted + 1}"
            )

            zone = (
                properties.get("tn_name")
                or properties.get("mandal")
                or properties.get("district_name")
                or "Unknown"
            )

            material = properties.get("cons_mat")

            diameter = properties.get("pipe_dia")

            try:
                diameter = float(diameter) / 1000 if diameter else None
            except (ValueError, TypeError):
                diameter = None

            length_m = properties.get("se_len")

            try:
                length_m = float(length_m) if length_m else None
            except (ValueError, TypeError):
                length_m = None

            wkt = geom.wkt

            sql = text("""
                INSERT INTO drainage_pipelines
                (
                    pipeline_name,
                    zone,
                    diameter_m,
                    status,
                    geometry,
                    material,
                    condition,
                    blockage_level_percent,
                    blocked,
                    last_checked
                )
                VALUES
                (
                    :pipeline_name,
                    :zone,
                    :diameter_m,
                    'normal',
                    ST_GeomFromText(:geometry, 4326),
                    :material,
                    'Normal',
                    0,
                    false,
                    CURRENT_TIMESTAMP
                )
            """)

            db.execute(
                sql,
                {
                    "pipeline_name": str(pipeline_id),
                    "zone": str(zone),
                    "diameter_m": diameter,
                    "geometry": wkt,
                    "material": material,
                }
            )

            inserted += 1

        db.commit()

        print(f"Successfully imported: {inserted} pipelines")

    except Exception as e:
        db.rollback()
        print("Import failed:")
        print(e)

    finally:
        db.close()


if __name__ == "__main__":
    import_pipelines()