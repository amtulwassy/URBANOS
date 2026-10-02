"""
URBANOS backend entrypoint.

Run with:
    uvicorn main:app --reload
"""
import os
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException

from config import settings
from database import init_db
from routes import auth, weather, zones, reports, emergency, flood, drainage

app = FastAPI(
    title=settings.APP_NAME,
    description="AI-Powered Urban Disaster Early Warning & Response System — REST API",
    version="1.0.0",
    contact={"name": "URBANOS"},
)


# ---------------------------------------------------------------------------
# CORS — allows the static HTML/CSS/JS frontend (served separately) to call
# this API from the browser.
# ---------------------------------------------------------------------------
app.add_middleware( CORSMiddleware,
allow_origins=[
    "http://127.0.0.1:5501",
    "http://localhost:5501",
    "http://127.0.0.1:5500",
    "http://localhost:5500",
    "https://urbanosnexus.vercel.app",
],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Static file serving for uploaded report photos
# ---------------------------------------------------------------------------
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=settings.UPLOAD_DIR), name="uploads")

# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------
app.include_router(auth.router)
app.include_router(weather.router)
app.include_router(zones.router)
app.include_router(reports.router)
app.include_router(emergency.router)
app.include_router(flood.router)
app.include_router(drainage.router)

# ---------------------------------------------------------------------------
# Consistent JSON error responses (400 / 401 / 403 / 404 / 422 / 500)
# ---------------------------------------------------------------------------
@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": True, "status_code": exc.status_code, "detail": exc.detail},
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={"error": True, "status_code": 422, "detail": exc.errors()},
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"error": True, "status_code": 500, "detail": "Internal server error"},
    )


@app.on_event("startup")
def on_startup():
    """Creates tables + PostGIS extension + demo seed data automatically,
    so `uvicorn main:app --reload` alone is enough to get a working DB."""
    init_db.main()


@app.get("/", tags=["Health"], summary="Health check")
def root():
    return {
        "status": "ok",
        "service": settings.APP_NAME,
        "data_mode": settings.DATA_MODE,
        "docs": "/docs",
    }
