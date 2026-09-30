"""
Weather retrieval.

DATA_MODE=demo (default) -> generates safe, clearly-labelled synthetic
weather so the app runs fully offline with zero API keys.

DATA_MODE=live -> calls the configured external weather API
(OpenWeatherMap-compatible "current weather" + "5 day / 3 hour forecast"
endpoints by default). If the external call fails for any reason, this
falls back to demo data and reports so in the response rather than
raising, so a flaky/rate-limited API never breaks the frontend.
"""
import random
from datetime import datetime
from typing import Optional

import httpx

from config import settings
from database.seed_data import city_coords


def _demo_current(city: str) -> dict:
    lat, lng = city_coords(city)
    return {
        "location": city,
        "latitude": lat,
        "longitude": lng,
        "rainfall": round(random.uniform(0, 24), 1),
        "temperature": round(random.uniform(23, 35), 1),
        "humidity": round(random.uniform(55, 95), 1),
        "wind_speed": round(random.uniform(4, 30), 1),
        "condition": random.choice(["Clear", "Clouds", "Rain", "Thunderstorm", "Drizzle"]),
        "source": "demo",
        "recorded_at": datetime.utcnow(),
    }


def _demo_forecast(city: str) -> dict:
    points = []
    base_rain = random.uniform(0, 15)
    for i in range(8):  # next 24h in 3h steps
        points.append({
            "hours_ahead": (i + 1) * 3,
            "rainfall": round(max(0, base_rain + random.uniform(-6, 10)), 1),
            "temperature": round(random.uniform(23, 34), 1),
            "condition": random.choice(["Clear", "Clouds", "Rain", "Thunderstorm"]),
        })
    return {"location": city, "source": "demo", "points": points}


async def get_current_weather(city: str) -> dict:
    if settings.DATA_MODE != "live" or not settings.WEATHER_API_KEY:
        return _demo_current(city)

    lat, lng = city_coords(city)
    url = f"{settings.WEATHER_API_BASE_URL}/weather"
    params = {"lat": lat, "lon": lng, "appid": settings.WEATHER_API_KEY, "units": "metric"}
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()
        return {
            "location": city,
            "latitude": lat,
            "longitude": lng,
            "rainfall": (data.get("rain", {}) or {}).get("1h", 0.0),
            "temperature": data.get("main", {}).get("temp"),
            "humidity": data.get("main", {}).get("humidity"),
            "wind_speed": data.get("wind", {}).get("speed", 0.0) * 3.6,  # m/s -> km/h
            "condition": (data.get("weather") or [{}])[0].get("main"),
            "source": "live",
            "recorded_at": datetime.utcnow(),
        }
    except Exception as e:
        print("WEATHER API ERROR:", e)

        fallback = _demo_current(city)
        fallback["source"] = "demo-fallback"
        return fallback


async def get_forecast(city: str) -> dict:
    if settings.DATA_MODE != "live" or not settings.WEATHER_API_KEY:
        return _demo_forecast(city)

    lat, lng = city_coords(city)
    url = f"{settings.WEATHER_API_BASE_URL}/forecast"
    params = {"lat": lat, "lon": lng, "appid": settings.WEATHER_API_KEY, "units": "metric"}
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()
        points = []
        for i, item in enumerate(data.get("list", [])[:8]):
            points.append({
                "hours_ahead": (i + 1) * 3,
                "rainfall": (item.get("rain", {}) or {}).get("3h", 0.0),
                "temperature": item.get("main", {}).get("temp"),
                "condition": (item.get("weather") or [{}])[0].get("main"),
            })
        return {"location": city, "source": "live", "points": points}
    except Exception:
        fallback = _demo_forecast(city)
        fallback["source"] = "demo-fallback"
        return fallback
