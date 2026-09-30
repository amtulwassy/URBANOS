# URBANOS — Urban Flood Early Warning & Response System (Pan-India)

A working prototype of a nationwide flood early-warning platform, built as
plain HTML/CSS/JavaScript — no build step, no framework, no API keys
required. Open it in VS Code, run it with Live Server (or any static
server), and it works end‑to‑end in the browser.

## What's new in this version

1. **Redesigned login page** — matches the reference design: full-bleed
   flood photo with the URBANOS brand story on the left ("Predict. Prevent.
   Protected.", feature highlights, skyline strip) and a floating login
   card on the right with Authority/User role cards, icon-labelled email &
   password fields with a show/hide password toggle, Remember me, Google
   sign-in, and a secure/reliable footer.
2. **All of India, not just Bhubaneswar** — after logging in, everyone
   goes through a **State → City → Micro-zone** picker
   (`location.html`). 25 states/UTs and 40 cities are wired up; a handful
   of major metros (Bhubaneswar, Mumbai, Delhi, Bengaluru, Chennai,
   Kolkata, Lucknow, Ahmedabad, Jaipur, Patna, Kochi, Hyderabad) have
   hand-curated micro-zones with realistic elevation/drainage/population
   data, and every other city gets deterministic, seeded micro-zones so
   the risk model always has something real-looking to chew on. The AI
   risk-analysis engine, live map, charts and emergency dispatch are all
   automatically scoped to whichever city is selected. Anyone can switch
   state/city later from their Profile (citizen) or sidebar (authority).
3. **Complaint / repair tracker** — every "Report Flood" submission now
   carries a status pipeline: **Submitted → Municipal (BMC) Review →
   Contractor Assigned → Worker Assigned → Drainage Cleaning In Progress →
   Resolved**. Citizens track their own reports under *My Reports* with a
   visual step tracker; authorities manage every complaint from the new
   **Complaint Tracker** view, assigning a contractor and field worker and
   advancing the stage — both sides always see the same live status.
4. **Emergency SOS best-route finder for both citizen and authority** —
   unchanged core routing (Leaflet + OSRM live road routing, flood-zone
   avoidance warnings) but now works for any city/zone in the location
   hierarchy, from either the citizen app's SOS button or the authority
   console's Response tab.
5. **Micro-zone precaution / early-warning signals** — URBANOS
   automatically simulates a moderate additional rainfall burst (+35mm
   over 6h) on top of live conditions and flags any micro-zone whose risk
   level would escalate *before it happens*. Authorities see this on a
   dedicated **Precaution Signals** dashboard/sidebar view (with a
   "Notify Zone & Pre-position Crew" action that raises an advisory
   alert), and citizens see a heads-up banner on Home if their own zone is
   flagged.

## Structure

```
urbanos/
├── index.html              Login (Authority / User cards)
├── location.html             State -> City -> Micro-zone picker
├── citizen.html                Citizen mobile app (SPA-style views)
├── authority.html                Authority command console (SPA-style views)
├── css/
│   ├── tokens.css              Design tokens: colors, type, spacing, reset
│   ├── components.css           Shared components: buttons, cards, badges,
│   │                             modals, toasts, complaint-tracker stepper,
│   │                             precaution banners
│   ├── login.css                 Login page layout (matches reference design)
│   ├── location.css               State/City/Zone picker layout
│   ├── citizen.css                 Citizen app (phone-frame) layout
│   └── authority.css                Authority dashboard (sidebar) layout
└── js/
    ├── locations.js              Pan-India State -> City -> micro-zone data
    │                              + seeded zone/station generators
    ├── data.js                    Session + per-city "database"
    │                              (localStorage), complaint-stage helpers
    ├── analysis.js                 AI-style flood risk scoring engine +
    │                                scenario simulator + precaution-signal
    │                                helper
    ├── emergency.js                  Emergency dispatch + live road routing
    │                                  (Leaflet + OSRM)
    ├── camera.js                      getUserMedia camera capture (+ file
    │                                   picker fallback)
    ├── ui-common.js                    Shared toast/modal/session helpers +
    │                                    complaint-tracker & precaution
    │                                    renderers
    ├── auth.js                          Login page logic
    ├── location.js                       State/City/Zone picker logic
    ├── citizen.js                         Citizen app logic
    └── authority.js                        Authority dashboard logic
```

## How to run

1. Open the `urbanos` folder in VS Code.
2. Install the "Live Server" extension (or run `python3 -m http.server 8000`
   from inside the folder).
3. Open `index.html` via Live Server (or visit `http://localhost:8000`).
4. Log in with **any** email/password — pick **Authority Login** or
   **User Login** first, since that decides which app you land in.
5. Pick a **State**, then a **City**, then (as a citizen) your home
   **micro-zone**. Authorities land straight on their city-wide console.

No API keys, no `npm install`, no backend. Map tiles come from OpenStreetMap
and routing from the public OSRM demo server, both free and keyless — if
you're offline, routing automatically falls back to a straight-line estimate
so the emergency feature never breaks.

## Data model

- **Session** (`urbanos_session_v1` in localStorage): who's logged in, their
  role, and the state/city/home-zone they picked. Kept separate from city
  data so switching cities never logs you out.
- **Per-city database** (`urbanos_db_v2_<cityId>`): zones, emergency
  stations, rainfall/water-level series, alerts, and citizen reports
  (complaints) for that city. Each city gets its own independent, persistent
  sandbox — switch cities and switch back, and your data is still there.
- Clear everything any time with, e.g.:
  ```js
  Object.keys(localStorage).filter(k => k.startsWith('urbanos_')).forEach(k => localStorage.removeItem(k));
  ```

## Swapping in a real backend later

`data.js` and `locations.js` are the only files that "own" state/config. To
connect a real backend, replace `getDB()`/`saveDB()` with `fetch()` calls to
your API, and replace the seeded generators in `locations.js` with real
municipal GIS/ward data — the rest of the app (analysis engine, complaint
tracker, routing, UI) talks only to `db`, never to `localStorage` directly.
