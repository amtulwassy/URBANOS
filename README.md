# URBANOS — Full-Stack Setup Guide

> **Fixed in this version:** login/password verification was silently
> breaking because `passlib` 1.7.4 is incompatible with `bcrypt` 4.1+
> (a known upstream issue — bcrypt removed an attribute passlib probes for
> at import time). Every register/login call was 500-ing on the backend,
> and the frontend was masking that by quietly falling back to a
> browser-only "offline demo" session — so login *looked* like it worked,
> but no real JWT existed, so submitted reports (and their photos) only
> ever landed in the citizen's own browser, never in Postgres, so an
> Authority user could never see them. Fixed by (1) hashing passwords with
> `bcrypt` directly instead of through passlib, and (2) making the frontend
> only fall back to offline mode on a genuine *network-unreachable* error —
> a real 401/500 from a running backend now surfaces as an actual error
> instead of silently succeeding locally. **Delete your old `venv` and
> re-run `pip install -r requirements.txt`** if you already installed the
> previous version, since `passlib` has been dropped from the dependency list.

Your existing HTML/CSS/JS frontend, unchanged in branding/UI/navigation, now
talks to a real **FastAPI + PostgreSQL/PostGIS** backend.

```
URBANOS/
├── frontend/            <- your original app (unchanged pages/CSS; a few JS files updated — see below)
└── backend/              <- new FastAPI backend
```

---

## 1. What changed in the frontend, and why

Nothing was redesigned. The pages, CSS, branding and navigation are byte-for-byte
what you had. Six JS files were touched so the app talks to the real backend
instead of `localStorage`:

| File | Change |
|---|---|
| `js/api.js` | **NEW.** `API_BASE_URL` + every `apiXxx()` / `getXxx()` fetch helper. |
| `js/data.js` | Rewritten. Same function names (`getDB`, `saveDB`, `addReport`, `advanceReportStage`, `assignReportContractor`) so nothing else had to change shape — they now call the backend, with automatic fallback to the old local demo generator if the backend isn't running. Adds `initDB(city)`. |
| `js/auth.js` | Login/Google buttons now call `POST /api/auth/login` (auto-registering on first use so the "any email/password" demo feel is kept, but accounts are real, persisted, and password-hashed). |
| `js/citizen.js` | 2-line changes: `await initDB(city)` on load, `await addReport(...)` on submit. |
| `js/authority.js` | 2-line changes: `await initDB(city)`, `await assignReportContractor/advanceReportStage(...)`. Also now shows live weather in the rainfall stat card. |
| `js/ui-common.js` | `clearSession()` also clears the JWT on logout. |

`js/locations.js` (state/city picker data) and `js/analysis.js` (the
client-side risk-score display logic) are **unchanged** — the backend now
also computes risk server-side (`risk_score`/`risk_level` on every zone
returned by `/api/zones`), but the original client-side analysis engine is
left in place so the existing UI code (`analyzeZone()`, the scenario
simulator, precaution signals) keeps working exactly as before, just now
seeded with real, persisted zone data instead of `localStorage`.

**If the backend isn't running**, every page falls back automatically to the
original local demo-data behaviour (a toast says "offline demo mode") — the
app never goes blank.

---

## 2. Backend stack

FastAPI · Uvicorn · PostgreSQL + PostGIS · SQLAlchemy · GeoAlchemy2 · Pydantic
· JWT (python-jose + passlib/bcrypt) · httpx · python-dotenv

```
backend/
├── main.py                  FastAPI app, CORS, routers, error handlers, startup DB init
├── config.py                 Loads .env
├── requirements.txt
├── .env.example                Copy to .env and edit
├── database/
│   ├── connection.py            SQLAlchemy engine/session
│   ├── models.py                 ORM models (Users, Cities, WeatherData, FloodRiskZone,
│   │                              CitizenReport, EmergencyResource) incl. PostGIS geometry
│   ├── seed_data.py               Demo city/zone generator (ported 1:1 from the frontend's
│   │                               old js/locations.js hashing logic)
│   └── init_db.py                  Creates the PostGIS extension + tables + seeds demo data
├── schemas/                          Pydantic request/response models
├── routes/
│   ├── auth.py       POST /api/auth/register, /login · GET /api/auth/me · PATCH /api/auth/me/location
│   ├── weather.py    GET /api/weather/current, /forecast
│   ├── zones.py      GET /api/zones, /api/zones/{id}, /api/zones/risk, /api/zones/geojson
│   ├── reports.py    POST /api/reports · GET /api/reports, /api/reports/{id}
│   │                 PATCH /api/reports/{id}/status · POST /api/reports/{id}/advance
│   │                 POST /api/reports/{id}/photo
│   ├── emergency.py  GET /api/emergency, /api/emergency/{type}
│   └── flood.py      GET /api/flood/cities, /api/flood/scenario, /api/flood/thresholds
├── services/
│   ├── weather_service.py     demo/live weather with automatic fallback
│   ├── risk_engine.py          the transparent scoring formula (see below)
│   ├── flood_prediction.py      orchestrates risk_engine.py over a zone — THIS is where
│   │                             you plug in a trained ML model later (see the file's docstring)
│   └── emergency_service.py       nearest-station lookups
└── utils/security.py                password hashing + JWT
```

---

## 3. Install & run (Windows / VS Code)

### 3.0 Prerequisites
- **Python 3.10+** (the code uses `str | None` syntax — Python 3.10 or newer required)
- **PostgreSQL 14+** with the **PostGIS** extension available
  - Easiest on Windows: install via the [PostgreSQL installer](https://www.postgresql.org/download/windows/)
    and tick "Stack Builder" → add **PostGIS** during/after install.

### 3.1 Create the database
Open `psql` (or pgAdmin) and run:
```sql
CREATE DATABASE urbanos_db;
CREATE USER urbanos_user WITH PASSWORD 'urbanos_pass';
GRANT ALL PRIVILEGES ON DATABASE urbanos_db TO urbanos_user;
\c urbanos_db
CREATE EXTENSION IF NOT EXISTS postgis;   -- also done automatically on backend startup, safe to repeat
```

### 3.2 Backend
```powershell
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
```
Edit `.env` if your DB user/password/host differ from the defaults, then:
```powershell
uvicorn main:app --reload
```
On first run this automatically creates the PostGIS extension, all tables, and
seeds demo cities/zones/emergency resources — you should see
`[init_db] Seeding demo cities, zones, emergency resources, weather...`.

Backend is now live at **http://localhost:8000** — open **http://localhost:8000/docs**
for interactive Swagger docs (also `/redoc`).

### 3.3 Frontend
No build step. From the `frontend/` folder, either:
- **VS Code Live Server** extension → right-click `index.html` → "Open with Live Server", or
- `python -m http.server 8080` and open `http://localhost:8080`

> Whatever port you use, add it to `CORS_ORIGINS` in `backend/.env` (a few common
> ones are already included by default: 5500, 8080, 3000).

Open the frontend URL, log in (Authority or Citizen tab, any email/password),
pick a state/city, and you're in.

---

## 4. `.env` reference

See `backend/.env.example` — every variable is documented there:
`DATABASE_URL`, `JWT_SECRET_KEY`, `CORS_ORIGINS`, `DATA_MODE` (`demo`/`live`),
`WEATHER_API_KEY` + `WEATHER_API_BASE_URL`, risk thresholds, upload limits.

**DATA_MODE=demo** (default): zero external dependencies — weather is
synthetic but clearly labelled `"source": "demo"` in every response.
**DATA_MODE=live**: set `WEATHER_API_KEY` to any OpenWeatherMap-compatible
key; if the external call fails for any reason the API automatically falls
back to demo data (`"source": "demo-fallback"`) rather than erroring out.

---

## 5. API endpoint list

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/register` | – | Create a USER or AUTHORITY account |
| POST | `/api/auth/login` | – | Returns a JWT + user profile |
| GET | `/api/auth/me` | JWT | Current user |
| PATCH | `/api/auth/me/location` | JWT | Save selected city/state/zone |
| GET | `/api/weather/current?city=` | – | Current weather (demo or live) |
| GET | `/api/weather/forecast?city=` | – | Short-term rainfall forecast |
| GET | `/api/zones?city=` | – | All micro-zones + live risk score |
| GET | `/api/zones/{id}` | – | Single zone detail |
| GET | `/api/zones/risk?city=` | – | Zones sorted by risk, descending |
| GET | `/api/zones/geojson?city=` | – | Zones as a GeoJSON FeatureCollection |
| POST | `/api/reports` | JWT | Submit a citizen flood report |
| GET | `/api/reports?city=` | JWT | List reports (own for USER, all for AUTHORITY) |
| GET | `/api/reports/{id}` | JWT | Report detail |
| PATCH | `/api/reports/{id}/status` | JWT (AUTHORITY) | Update status/stage/contractor/worker |
| POST | `/api/reports/{id}/advance` | JWT (AUTHORITY) | Advance to next complaint-pipeline stage |
| POST | `/api/reports/{id}/photo` | JWT | Upload/replace a report photo |
| GET | `/api/emergency?city=&lat=&lng=` | – | Emergency resources, nearest first |
| GET | `/api/emergency/{type}?city=` | – | Filter by Ambulance / Fire Brigade / Police / Rescue Team |
| GET | `/api/flood/cities` | – | State → city list |
| GET | `/api/flood/scenario?city=&extra_rain_mm=` | – | What-if rainfall projection per zone |
| GET | `/api/flood/thresholds` | – | Current LOW/MODERATE/HIGH/CRITICAL score cut-offs |

Full interactive docs with request/response schemas: **`/docs`**.

---

## 6. How the frontend connects to the backend

`frontend/js/api.js` defines `API_BASE_URL = "http://localhost:8000/api"` and
one small `fetch()`-wrapped function per endpoint above (`apiLogin`,
`apiRegister`, `getCurrentWeather`, `getRiskZones`, `getZoneRisk`,
`submitFloodReport`, `getReports`, `getEmergencyServices`, …), all with
JWT `Authorization: Bearer <token>` headers attached automatically, JSON
parsing, and error handling. `js/data.js` is the adapter layer between those
calls and the rest of the app's existing code.

---

## 7. Testing checklist

1. `venv\Scripts\activate` then `uvicorn main:app --reload` — confirm the
   startup log shows tables created + demo data seeded.
2. Open `http://localhost:8000/docs` — confirm all routes listed above appear.
3. Open the frontend, register/login as **Authority**, then log out and
   log in as **Citizen** with a different email — confirm both land on the
   correct dashboard.
4. Citizen → pick a city/zone → Home tab shows a live risk score and the new
   "Live weather:" line under it (pulled from `/api/weather/current`).
5. Citizen → Live Map tab — zones render from `/api/zones` (open Network tab
   to confirm the request), not from `localStorage`.
6. Citizen → "+ New" → submit a flood report with a photo → confirm a toast
   with a real `URBxxxx` ID, then check **Authority → Complaint Tracker** in
   another browser/tab logged in as Authority for the same city — the report
   should appear (proves it round-tripped through Postgres, not just local
   state).
7. Authority → open the report → assign a contractor/worker, click
   "Advance to Next Stage" → refresh the page → confirm the stage persisted
   (i.e. survives a reload — proves it's server-side, not `localStorage`).
8. Authority → Emergency Response tab → dispatch → route still draws (OSRM,
   unchanged); `/api/emergency` is now available for `db.stations` if you
   want to swap in real station coordinates later.
9. Stop the backend (`Ctrl+C`) and reload the frontend — confirm you get the
   "offline demo mode" toast and the app still works instead of breaking.
10. In `/docs`, try `POST /api/auth/login` with a wrong password — confirm a
    `401` with the consistent `{"error": true, "status_code": 401, "detail": ...}` shape.

---

## 8. Where to plug in a real ML flood-prediction model later

Everything scoring-related is isolated in **`backend/services/risk_engine.py`**
(the pure math) and **`backend/services/flood_prediction.py`** (the
orchestration layer that decides what to feed the scorer). Replace the body
of `flood_prediction.score_zone()` with a call to your trained model
(e.g. `model.predict(features)`) and return the same
`(score: float, level: str, contributors: list[str])` shape — no route, no
schema, and no frontend code needs to change, because they only ever call
`score_zone()` / read `zone.risk_score` and `zone.risk_level` off the
`FloodRiskZone` row.

The current implementation is explicitly a transparent, hand-weighted
prototype (see the module docstring) — not a trained model — so this
substitution is a clean drop-in, not a rewrite.
