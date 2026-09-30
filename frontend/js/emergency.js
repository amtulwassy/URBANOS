/* ============ EMERGENCY DISPATCH + LIVE ROAD ROUTING (Leaflet + OSRM demo) ============ */
/* Uses the free public OSRM demo server for real road routing. Falls back to a
   straight-line estimate if OSRM is unreachable (e.g. offline), so the feature
   never breaks the demo. */

function nearestStation(stations, type){
  return stations.find(s=>s.type===type) || stations[0];
}

function haversineKm(lat1,lng1,lat2,lng2){
  const R = 6371;
  const dLat = (lat2-lat1)*Math.PI/180;
  const dLng = (lng2-lng1)*Math.PI/180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2*Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

async function fetchOSRMRoute(fromLat, fromLng, toLat, toLng){
  const url = `https://router.project-osrm.org/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}?overview=full&geometries=geojson`;
  try{
    const res = await fetch(url, { signal: AbortSignal.timeout ? AbortSignal.timeout(6000) : undefined });
    const data = await res.json();
    if(data && data.routes && data.routes[0]){
      const r = data.routes[0];
      return {
        coords: r.geometry.coordinates.map(c=>[c[1],c[0]]),
        distanceKm: +(r.distance/1000).toFixed(2),
        durationMin: Math.round(r.duration/60),
        live: true
      };
    }
  }catch(e){ /* fall through to estimate */ }
  return null;
}

function straightLineEstimate(fromLat, fromLng, toLat, toLng){
  const km = haversineKm(fromLat, fromLng, toLat, toLng);
  return {
    coords: [[fromLat,fromLng],[toLat,toLng]],
    distanceKm: +km.toFixed(2),
    durationMin: Math.round((km / 28) * 60), // assume ~28km/h urban avg
    live: false
  };
}

async function getRoute(fromLat, fromLng, toLat, toLng){
  const live = await fetchOSRMRoute(fromLat, fromLng, toLat, toLng);
  return live || straightLineEstimate(fromLat, fromLng, toLat, toLng);
}

/* Assign a flood-exposure / risk penalty to a route based on zones it may pass through. */
function routeFloodExposure(zones, distanceKm){
  const highRiskZones = zones.filter(z => z.drainageBlockage > 45 || z.elevation < 6).length;
  const exposure = highRiskZones === 0 ? 'Low' : (highRiskZones <= 2 ? 'Medium' : 'High');
  return { exposure, highRiskZones };
}
