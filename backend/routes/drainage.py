from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
from pydantic import BaseModel

from database.connection import get_db

router = APIRouter(
    prefix="/api/drainage",
    tags=["Drainage"]
)


@router.get("/pipelines")
def get_drainage_pipelines(
    city: str | None = None,
    state: str | None = None,
    db: Session = Depends(get_db)
):
    query = text("""
        SELECT
            id,
            pipeline_name,
            zone,
            diameter_m,
            status,
            material,
            depth_m,
            condition,
            water_level_percent,
            blocked,
            blockage_level_percent,
            last_checked,
            city,
            state,
            ST_AsGeoJSON(geometry) AS geometry
        FROM drainage_pipelines
        WHERE
            (:city IS NULL OR city = :city)
            AND
            (:state IS NULL OR state = :state)
        ORDER BY id;
    """)

    rows = db.execute(
        query,
        {
            "city": city,
            "state": state
        }
    ).mappings().all()

    return {
        "count": len(rows),
        "city": city,
        "state": state,
        "pipelines": [dict(row) for row in rows]
    }
from pydantic import BaseModel


class BlockageUpdate(BaseModel):
    blockage_level_percent: float


@router.patch("/pipelines/{pipeline_id}/blockage")
def update_pipeline_blockage(
    pipeline_id: int,
    data: BlockageUpdate,
    db: Session = Depends(get_db)
):
    blockage = max(0, min(100, data.blockage_level_percent))

    if blockage >= 70:
        blocked = True
        condition = "Blocked"
        status = "blocked"

    elif blockage >= 40:
        blocked = False
        condition = "Partial Blockage"
        status = "attention"

    else:
        blocked = False
        condition = "Normal"
        status = "normal"

    query = text("""
        UPDATE drainage_pipelines
        SET
            blockage_level_percent = :blockage,
            blocked = :blocked,
            condition = :condition,
            status = :status,
            last_checked = CURRENT_TIMESTAMP
        WHERE id = :pipeline_id
        RETURNING
            id,
            pipeline_name,
            blockage_level_percent,
            blocked,
            condition,
            status,
            last_checked;
    """)

    row = db.execute(
        query,
        {
            "pipeline_id": pipeline_id,
            "blockage": blockage,
            "blocked": blocked,
            "condition": condition,
            "status": status
        }
    ).mappings().first()

    if not row:
        return {"error": "Pipeline not found"}

    db.commit()

    return dict(row)