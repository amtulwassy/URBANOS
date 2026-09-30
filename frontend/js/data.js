/* ============ PER-CITY "DATABASE" — now backed by the FastAPI backend ============ */
/*
  This file keeps the exact same function names the rest of the app already
  calls (getDB, saveDB, addReport, advanceReportStage, assignReportContractor)
  so citizen.js / authority.js need only tiny changes (await the async calls).

  How it works:
   - initDB(cityName)  -> ASYNC. Call this once when a page loads, before the
     first getDB(cityName). It fetches zones / reports / emergency stations
     from the backend and populates an in-memory cache.
   - getDB(cityName)   -> SYNC, same as before. Reads the in-memory cache
     (or a localStorage-seeded fallback if the backend was unreachable).
   - addReport / advanceReportStage / assignReportContractor -> now ASYNC:
     they call the backend, then refresh the cache before resolving.

  If the backend cannot be reached (not started yet, wrong URL, offline),
  everything falls back to the previous local demo-data generator so the UI
  never goes blank — a small "(offline demo mode)" toast is shown instead.
*/

const API_ORIGIN = (typeof API_BASE_URL !== 'undefined') ? API_BASE_URL.replace(/\/api\/?$/, '') : '';

const __cache = {};      // cityName -> db object (same shape the old localStorage version used)
let __backendOnline = null; // null = unknown, true/false once we've tried

function dbKey(cityName){
  return 'urbanos_db_v2_' + (cityName || 'default').replace(/\s+/g,'_').toLowerCase();
}

/* ---- shape adapters: backend (snake_case) -> frontend (camelCase, same as the old seeded shape) ---- */
function mapZone(z){
  return {
    id: z.id,
    name: z.zone_name,
    elevation: z.elevation,
    drainageCapacity: z.drainage_capacity,
    drainageBlockage: z.drainage_blockage,
    imperviousArea: z.imperviousness,
    historicalIncidents: z.historical_flood_count,
    waterLevel: z.water_level,
    serverRiskScore: z.risk_score,
    serverRiskLevel: z.risk_level
  };
}
function photoUrl(image_url){
  if(!image_url) return null;
  if(image_url.startsWith('http') || image_url.startsWith('data:')) return image_url;
  return API_ORIGIN + image_url;
}
function mapReport(r){
  return {
    id: r.id,
    zone: r.zone_name,
    severity: r.severity,
    description: r.description,
    incidentType: r.incident_type,
    photo: photoUrl(r.image_url),
    status: r.status,
    stage: r.stage,
    stageHistory: [new Date(r.created_at).getTime()],
    contractor: r.contractor,
    worker: r.worker,
    createdAt: new Date(r.created_at).getTime(),
    saved: true
  };
}
function mapStation(s){
  return { id: s.id, type: mapResourceType(s.type), name: s.name, lat: s.latitude, lng: s.longitude,
    availability: s.availability, contact: s.contact };
}
function mapResourceType(t){
  const m = { 'Ambulance':'ambulance', 'Fire Brigade':'fire', 'Police':'police', 'Rescue Team':'rescue' };
  return m[t] || (t||'').toLowerCase();
}

function synthRainfallSeries(){
  const now = Date.now();
  const series = [];
  for(let i=23;i>=0;i--){ series.push({ t: now - i*3600*1000, mm: +(Math.random()*22).toFixed(1) }); }
  return series;
}
function synthAlerts(){
  const now = Date.now();
  return [
    { id:'a1', title:'Heavy rainfall expected', body:'IMD forecasts heavy showers over the next 6 hours.', severity:'medium', time: now - 3600*1000 },
    { id:'a2', title:'Drainage cleaning scheduled', body:'Municipal crews scheduled for low-lying wards tomorrow.', severity:'low', time: now - 7200*1000 },
    { id:'a3', title:'Water-logging reported', body:'Multiple citizen reports near market road.', severity:'high', time: now - 1800*1000 }
  ];
}

/* ---- Local (offline) fallback: same generators the app used before the backend existed ---- */
function seedDBLocal(cityName){
  const zones = (typeof getAllZoneRecords === 'function')
    ? getAllZoneRecords(cityName).map(z=>({
        id: z.id, name: z.name, elevation: z.elevation, drainageCapacity: z.drainageCapacity,
        drainageBlockage: z.drainageBlockage, imperviousArea: z.imperviousArea,
        historicalIncidents: z.historicalIncidents, waterLevel: z.waterLevel
      }))
    : [];
  return {
    city: cityName, zones, rainfall: synthRainfallSeries(), alerts: synthAlerts(),
    reports: [], stations: [
      { id:'s1', type:'ambulance', name:'City Hospital Ambulance', lat:null, lng:null },
      { id:'s2', type:'fire', name:'Central Fire Station', lat:null, lng:null },
      { id:'s3', type:'rescue', name:'NDRF Rescue Unit', lat:null, lng:null }
    ]
  };
}

/* ---- Public: call once per page load, before the first getDB() ---- */
async function initDB(cityName){
  try{
    const [zonesRaw, reportsRaw, stationsRaw] = await Promise.all([
      getRiskZones(cityName),
      getReports(cityName).catch(()=>[]),   // needs auth; citizen/authority both logged in
      getEmergencyServices(cityName).catch(()=>[])
    ]);
    __cache[cityName] = {
      city: cityName,
      zones: zonesRaw.map(mapZone),
      rainfall: synthRainfallSeries(),   // backend has no historical series endpoint yet — see README
      alerts: synthAlerts(),
      reports: reportsRaw.map(mapReport),
      stations: stationsRaw.map(mapStation)
    };
    __backendOnline = true;
  }catch(e){
    console.warn('[URBANOS] Backend unreachable, falling back to local demo mode:', e.message);
    __backendOnline = false;
    let local;
    try{ local = JSON.parse(localStorage.getItem(dbKey(cityName))); }catch(err){ local = null; }
    __cache[cityName] = local || seedDBLocal(cityName);
    localStorage.setItem(dbKey(cityName), JSON.stringify(__cache[cityName]));
    if(typeof showToast === 'function'){
      showToast('Backend not reachable — running in offline demo mode.', 'error');
    }
  }
  return __cache[cityName];
}

function isBackendOnline(){ return __backendOnline === true; }

/* ---- Sync read (unchanged call sites everywhere else in the app) ---- */
function getDB(cityName){
  if(__cache[cityName]) return __cache[cityName];
  // Safety net: something rendered before initDB() finished — seed a local
  // placeholder so nothing throws; the real data lands on the next render.
  const local = seedDBLocal(cityName);
  __cache[cityName] = local;
  return local;
}
function saveDB(cityName, db){
  __cache[cityName] = db;
  try{ localStorage.setItem(dbKey(cityName), JSON.stringify(db)); return true; }
  catch(e){ console.warn('saveDB local cache failed', e); return false; }
}

/* ---- Reports (citizen complaints) — now real backend writes ---- */
async function addReport(cityName, report){
  if(isBackendOnline()){
    try{
      const created = await submitFloodReport({
        city: cityName,
        zone_name: report.zone,
        description: report.description,
        incident_type: report.incidentType || 'Flood / Hazard',
        severity: report.severity || 'medium'
      });
      if(report.photo){
        // Photo upload failing is reported to the caller (not silently
        // dropped) — an expired/invalid session must surface as an error,
        // not as a report that "succeeded" without its photo.
        await uploadReportPhoto(created.id, report.photo);
      }
      const refreshed = await apiRequest(`/reports/${encodeURIComponent(created.id)}`);
      const mapped = mapReport(refreshed);
      const db = getDB(cityName);
      db.reports.unshift(mapped);
      saveDB(cityName, db);
      return mapped;
    }catch(e){
      if(e.status !== undefined){
        // Backend WAS reached and rejected the request (expired token,
        // validation error, server bug). Falling back to a local-only save
        // here is exactly what made reports/photos invisible to the
        // Authority dashboard before — surface the real error instead.
        throw e;
      }
      console.warn('addReport: backend unreachable, saving locally instead:', e.message);
    }
  }
  // Offline fallback (backend unreachable / never came online): identical
  // to the original local-only behaviour. This report will NOT be visible
  // to other users/devices until the backend is back up and this device
  // resubmits it.
  const db = getDB(cityName);
  report.id = 'URB' + (1000 + db.reports.length + Math.floor(Math.random()*90));
  report.stage = 0;
  report.createdAt = Date.now();
  report.stageHistory = [Date.now()];
  db.reports.unshift(report);
  let ok = saveDB(cityName, db);
  if(!ok && report.photo){
    report.photo = null;
    report.photoDropped = true;
    ok = saveDB(cityName, db);
  }
  report.saved = ok;
  return report;
}

async function advanceReportStage(cityName, reportId){
  const db = getDB(cityName);
  const r = db.reports.find(x=>x.id===reportId);
  if(isBackendOnline()){
    try{
      const updated = await advanceReport(reportId);
      const mapped = mapReport(updated);
      const idx = db.reports.findIndex(x=>x.id===reportId);
      if(idx>=0) db.reports[idx] = mapped; else db.reports.unshift(mapped);
      saveDB(cityName, db);
      return mapped;
    }catch(e){
      if(e.status !== undefined) throw e;   // real backend rejection — surface it
      console.warn('advanceReportStage: backend unreachable, updating locally instead:', e.message);
    }
  }
  if(r && r.stage < 5){
    r.stage += 1;
    r.stageHistory[r.stage] = Date.now();
    saveDB(cityName, db);
  }
  return r;
}

async function assignReportContractor(cityName, reportId, contractor, worker){
  const db = getDB(cityName);
  if(isBackendOnline()){
    try{
      const updated = await updateReportStatus(reportId, { contractor, worker });
      const mapped = mapReport(updated);
      const idx = db.reports.findIndex(x=>x.id===reportId);
      if(idx>=0) db.reports[idx] = mapped; else db.reports.unshift(mapped);
      saveDB(cityName, db);
      return mapped;
    }catch(e){
      if(e.status !== undefined) throw e;   // real backend rejection — surface it
      console.warn('assignReportContractor: backend unreachable, updating locally instead:', e.message);
    }
  }
  const r = db.reports.find(x=>x.id===reportId);
  if(r){ r.contractor = contractor; r.worker = worker; saveDB(cityName, db); }
  return r;
}
