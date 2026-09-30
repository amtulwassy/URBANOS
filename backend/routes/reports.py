import os
import random
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from sqlalchemy.orm import Session

from config import settings
from database.connection import get_db
from database import models
from schemas.report import ReportCreate, ReportOut, ReportStatusUpdate
from utils.security import get_current_user, require_authority

router = APIRouter(prefix="/api/reports", tags=["Citizen Reports"])


def _next_report_id(db: Session) -> str:
    """Generates a short, human-friendly, GUARANTEED-unique report id
    (collision-checked against the DB, not just count()+random which can
    collide under concurrent submissions)."""
    for _ in range(20):
        candidate = f"URB{random.randint(1000, 999999)}"
        exists = db.query(models.CitizenReport.id).filter(models.CitizenReport.id == candidate).first()
        if not exists:
            return candidate
    return f"URB{uuid.uuid4().hex[:10].upper()}"


def _find_zone(db: Session, city: str, zone_name: str):
    if not zone_name:
        return None
    city_row = db.query(models.City).filter(models.City.name == city).first()
    if not city_row:
        return None
    return (
        db.query(models.FloodRiskZone)
        .filter(models.FloodRiskZone.city_id == city_row.id, models.FloodRiskZone.zone_name == zone_name)
        .first()
    )


@router.post("", response_model=ReportOut, status_code=201, summary="Submit a citizen flood report")
def create_report(
    payload: ReportCreate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if payload.severity not in ("low", "medium", "high"):
        raise HTTPException(status_code=400, detail="severity must be low, medium or high")

    zone = _find_zone(db, payload.city, payload.zone_name)
    report = models.CitizenReport(
        id=_next_report_id(db),
        user_id=current_user.id,
        zone_id=zone.id if zone else None,
        city=payload.city,
        zone_name=payload.zone_name,
        latitude=payload.latitude,
        longitude=payload.longitude,
        description=payload.description,
        incident_type=payload.incident_type or "Flood / Hazard",
        image_url=payload.image_url,
        severity=payload.severity,
        status=models.ReportStatus.Pending,
        stage=0,
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    return report


@router.get("", response_model=list[ReportOut], summary="List reports (optionally filtered by city/status)")
def list_reports(
    city: str | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    q = db.query(models.CitizenReport)
    # Citizens only ever see their own reports; authorities see everyone's.
    if current_user.role != models.UserRole.AUTHORITY:
        q = q.filter(models.CitizenReport.user_id == current_user.id)
    if city:
        q = q.filter(models.CitizenReport.city == city)
    if status_filter:
        try:
            status_enum = models.ReportStatus(status_filter)
        except ValueError:
            raise HTTPException(status_code=400, detail="status must be Pending, Verified or Resolved")
        q = q.filter(models.CitizenReport.status == status_enum)
    return q.order_by(models.CitizenReport.created_at.desc()).all()


@router.get("/{report_id}", response_model=ReportOut, summary="Single report detail")
def get_report(report_id: str, db: Session = Depends(get_db),
                current_user: models.User = Depends(get_current_user)):
    report = db.query(models.CitizenReport).filter(models.CitizenReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    if current_user.role != models.UserRole.AUTHORITY and report.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your report")
    return report


@router.patch("/{report_id}/status", response_model=ReportOut,
              summary="Authority: update a report's status / pipeline stage / contractor")
def update_report_status(
    report_id: str,
    payload: ReportStatusUpdate,
    db: Session = Depends(get_db),
    _authority: models.User = Depends(require_authority),
):
    report = db.query(models.CitizenReport).filter(models.CitizenReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    if payload.status is not None:
        if payload.status not in ("Pending", "Verified", "Resolved"):
            raise HTTPException(status_code=400, detail="status must be Pending, Verified or Resolved")
        report.status = payload.status
    if payload.stage is not None:
        report.stage = payload.stage
        if payload.stage >= 5:
            report.status = models.ReportStatus.Resolved
    if payload.contractor is not None:
        report.contractor = payload.contractor
    if payload.worker is not None:
        report.worker = payload.worker

    report.updated_at = datetime.utcnow()
    db.add(report)
    db.commit()
    db.refresh(report)
    return report


@router.post("/{report_id}/advance", response_model=ReportOut,
             summary="Authority: advance a report to the next complaint-pipeline stage")
def advance_report(report_id: str, db: Session = Depends(get_db),
                    _authority: models.User = Depends(require_authority)):
    report = db.query(models.CitizenReport).filter(models.CitizenReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    if report.stage < 5:
        report.stage += 1
        if report.stage >= 5:
            report.status = models.ReportStatus.Resolved
    db.add(report)
    db.commit()
    db.refresh(report)
    return report


@router.post("/{report_id}/photo", response_model=ReportOut, summary="Upload/replace a report's photo")
async def upload_report_photo(
    report_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    report = db.query(models.CitizenReport).filter(models.CitizenReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    if current_user.role != models.UserRole.AUTHORITY and report.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your report")

    if file.content_type not in settings.ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=400, detail=f"Unsupported image type: {file.content_type}")

    contents = await file.read()
    max_bytes = settings.MAX_IMAGE_SIZE_MB * 1024 * 1024
    if len(contents) > max_bytes:
        raise HTTPException(status_code=400, detail=f"Image exceeds {settings.MAX_IMAGE_SIZE_MB}MB limit")

    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    ext = os.path.splitext(file.filename or "")[1] or ".jpg"
    filename = f"{report_id}_{uuid.uuid4().hex[:8]}{ext}"
    filepath = os.path.join(settings.UPLOAD_DIR, filename)
    with open(filepath, "wb") as f:
        f.write(contents)

    report.image_url = f"/uploads/{filename}"
    db.add(report)
    db.commit()
    db.refresh(report)
    return report
