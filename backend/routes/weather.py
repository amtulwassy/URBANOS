from fastapi import APIRouter, Query, Depends
from sqlalchemy.orm import Session

from database.connection import get_db
from database import models
from schemas.flood import WeatherOut, ForecastOut
from services import weather_service

router = APIRouter(prefix="/api/weather", tags=["Weather"])


@router.get("/current", response_model=WeatherOut, summary="Current weather for a city")
async def current(city: str = Query(..., description="City name, e.g. Bhubaneswar"),
                   db: Session = Depends(get_db)):
    data = await weather_service.get_current_weather(city)
    # persist a snapshot so /api/zones risk scoring has fresh rainfall to read
    db.add(models.WeatherData(
        location=city, latitude=data["latitude"], longitude=data["longitude"],
        rainfall=data["rainfall"], temperature=data.get("temperature"),
        humidity=data.get("humidity"), wind_speed=data.get("wind_speed"),
        condition=data.get("condition"), source=data["source"],
    ))
    db.commit()
    return data


@router.get("/forecast", response_model=ForecastOut, summary="Short-term rainfall forecast for a city")
async def forecast(city: str = Query(...)):
    return await weather_service.get_forecast(city)
