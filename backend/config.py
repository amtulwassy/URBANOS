"""
URBANOS backend configuration.
All values are loaded from environment variables (see .env.example).
Nothing sensitive is hard-coded here.
"""
import os
from dotenv import load_dotenv

load_dotenv()


def _bool(name: str, default: str = "false") -> bool:
    return os.getenv(name, default).strip().lower() in ("1", "true", "yes", "on")


class Settings:
    # ---- App ----
    APP_NAME: str = "URBANOS Backend"
    ENV: str = os.getenv("ENV", "development")
    DEBUG: bool = _bool("DEBUG", "true")

    # ---- Database ----
    # Example: postgresql+psycopg2://urbanos_user:urbanos_pass@localhost:5432/urbanos_db
    DATABASE_URL: str = os.getenv(
    "DATABASE_URL",
    "postgresql+psycopg2://postgres:Amtul2006@localhost:5432/urbanos",
)

    # ---- JWT / security ----
    JWT_SECRET_KEY: str = os.getenv("JWT_SECRET_KEY", "CHANGE_ME_DEV_ONLY_NOT_FOR_PRODUCTION")
    JWT_ALGORITHM: str = os.getenv("JWT_ALGORITHM", "HS256")
    JWT_EXPIRE_MINUTES: int = int(os.getenv("JWT_EXPIRE_MINUTES", "1440"))  # 24h

    # ---- CORS ----
    # Comma separated list of allowed origins for the static frontend.
    CORS_ORIGINS: list = [
        o.strip()
        for o in os.getenv(
            "CORS_ORIGINS",
            "http://localhost:5500,http://127.0.0.1:5500,"
"http://localhost:5501,http://127.0.0.1:5501,"
"http://localhost:8080,http://127.0.0.1:8080,"
            "http://127.0.0.1:8080,http://localhost:3000,null",
        ).split(",")
        if o.strip()
    ]

    # ---- Data mode ----
    # "demo"  -> weather + zone bootstrap data is generated locally, no external calls required
    # "live"  -> weather is fetched from the configured external API
    DATA_MODE: str = os.getenv("DATA_MODE", "demo")

    # ---- Weather API (used only when DATA_MODE=live) ----
    # Any OpenWeatherMap-compatible "current weather" endpoint works out of the box.
    WEATHER_API_KEY: str = os.getenv("WEATHER_API_KEY", "")
    WEATHER_API_BASE_URL: str = os.getenv(
        "WEATHER_API_BASE_URL", "https://api.openweathermap.org/data/2.5"
    )

    # ---- Risk engine thresholds (kept configurable, see services/risk_engine.py) ----
    RISK_THRESHOLD_MODERATE: int = int(os.getenv("RISK_THRESHOLD_MODERATE", "30"))
    RISK_THRESHOLD_HIGH: int = int(os.getenv("RISK_THRESHOLD_HIGH", "55"))
    RISK_THRESHOLD_CRITICAL: int = int(os.getenv("RISK_THRESHOLD_CRITICAL", "75"))

    # ---- Uploads ----
    UPLOAD_DIR: str = os.getenv("UPLOAD_DIR", "uploads")
    MAX_IMAGE_SIZE_MB: int = int(os.getenv("MAX_IMAGE_SIZE_MB", "5"))
    ALLOWED_IMAGE_TYPES: list = ["image/jpeg", "image/png", "image/webp", "image/gif"]


settings = Settings()
