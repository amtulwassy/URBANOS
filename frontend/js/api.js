/* ============ CENTRAL API CONFIGURATION ============ */
/* Talks to the FastAPI backend (see /backend). Every function here returns
   a Promise. If the backend is unreachable, callers fall back to the
   existing local demo-data generators so the app never goes blank. */

const API_BASE_URL = "https://urbanos-backend-693m.onrender.com/api";
const TOKEN_KEY = "urbanos_token_v1";

function getToken(){ return localStorage.getItem(TOKEN_KEY); }
function saveToken(token){ if(token) localStorage.setItem(TOKEN_KEY, token); }
function clearToken(){ localStorage.removeItem(TOKEN_KEY); }

async function apiRequest(path, { method = "GET", body, auth = true, isForm = false } = {}){
  const headers = {};
  if(!isForm) headers["Content-Type"] = "application/json";
  if(auth){
    const token = getToken();
    if(token) headers["Authorization"] = "Bearer " + token;
  }
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body ? (isForm ? body : JSON.stringify(body)) : undefined
  });
  let data = null;
  try{ data = await res.json(); }catch(e){ /* empty body */ }
  if(!res.ok){
    const message = (data && (data.detail || data.error)) || `Request failed (${res.status})`;
    const err = new Error(typeof message === 'string' ? message : JSON.stringify(message));
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

/* ---- Auth ---- */
function apiRegister(name, email, password, role, extra){
  return apiRequest("/auth/register", {
    method: "POST", auth: false,
    body: Object.assign({ name, email, password, role }, extra || {})
  });
}
function apiLogin(email, password){
  return apiRequest("/auth/login", { method: "POST", auth: false, body: { email, password } });
}
function apiMe(){
  return apiRequest("/auth/me");
}
function apiUpdateMyLocation(city, state, home_zone){
  return apiRequest("/auth/me/location", { method: "PATCH", body: { city, state, home_zone } });
}

/* ---- Weather ---- */
function getCurrentWeather(city){
  return apiRequest(`/weather/current?city=${encodeURIComponent(city)}`, { auth: false });
}
function getForecast(city){
  return apiRequest(`/weather/forecast?city=${encodeURIComponent(city)}`, { auth: false });
}

/* ---- Zones / risk ---- */
function getRiskZones(city){
  return apiRequest(`/zones?city=${encodeURIComponent(city)}`, { auth: false });
}
function getZonesByRisk(city){
  return apiRequest(`/zones/risk?city=${encodeURIComponent(city)}`, { auth: false });
}
function getZoneRisk(zoneId){
  return apiRequest(`/zones/${encodeURIComponent(zoneId)}`, { auth: false });
}
function getZonesGeoJSON(city){
  return apiRequest(`/zones/geojson?city=${encodeURIComponent(city)}`, { auth: false });
}
function getRainfallScenario(city, extraRainMm){
  return apiRequest(`/flood/scenario?city=${encodeURIComponent(city)}&extra_rain_mm=${extraRainMm}`, { auth: false });
}
function getStateCities(){
  return apiRequest(`/flood/cities`, { auth: false });
}

/* ---- Reports ---- */
function submitFloodReport(report){
  return apiRequest("/reports", { method: "POST", body: report });
}
function getReports(city){
  const qs = city ? `?city=${encodeURIComponent(city)}` : "";
  return apiRequest(`/reports${qs}`);
}
function advanceReport(reportId){
  return apiRequest(`/reports/${encodeURIComponent(reportId)}/advance`, { method: "POST" });
}
function updateReportStatus(reportId, payload){
  return apiRequest(`/reports/${encodeURIComponent(reportId)}/status`, { method: "PATCH", body: payload });
}
function uploadReportPhoto(reportId, dataUrl){
  // Converts a data: URL (from the existing camera.js) into a File and posts multipart/form-data.
  return dataUrlToBlob(dataUrl).then(blob=>{
    const form = new FormData();
    form.append("file", blob, "report.jpg");
    return apiRequest(`/reports/${encodeURIComponent(reportId)}/photo`, { method: "POST", body: form, isForm: true });
  });
}
function dataUrlToBlob(dataUrl){
  return fetch(dataUrl).then(r=>r.blob());
}

/* ---- Emergency ---- */
function getEmergencyServices(city, lat, lng){
  let qs = `?city=${encodeURIComponent(city)}`;
  if(lat!=null && lng!=null) qs += `&lat=${lat}&lng=${lng}`;
  return apiRequest(`/emergency${qs}`, { auth: false });
}
function getEmergencyByType(city, type, lat, lng){
  let qs = `?city=${encodeURIComponent(city)}`;
  if(lat!=null && lng!=null) qs += `&lat=${lat}&lng=${lng}`;
  return apiRequest(`/emergency/${encodeURIComponent(type)}${qs}`, { auth: false });
}
// ==================== DRAINAGE PIPELINES ====================

async function getDrainagePipelines() {
    try {
        const data = await apiRequest("/drainage/pipelines", {
            method: "GET",
            auth: false
        });

        console.log("Drainage pipelines:", data);

        // API may return an array or an object containing pipelines
        return Array.isArray(data) ? data : (data.pipelines || []);

    } catch (error) {
        console.error("Failed to load drainage pipelines:", error);
        return [];
    }
}