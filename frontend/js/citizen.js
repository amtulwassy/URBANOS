/* ============ CITIZEN APP LOGIC ============ */
(async function(){
  const session = requireSession('index.html');
  if(!session.city){ window.location.href = 'location.html'; return; }

  const city = session.city;
  const homeZoneName = session.zone;
  await initDB(city);   // pulls zones/reports/emergency stations from the backend
  let db = getDB(city);
  let rainfallChart, dbUpdateTimer;

  document.getElementById('header-city-name').textContent = city + (session.state ? ', ' + session.state : '');
  document.getElementById('user-zone-name').textContent = homeZoneName || 'Whole City';

  /* ---- Navigation between SPA views ---- */
  const views = ['home','alerts','map','reports','profile'];
  function showView(name){
    views.forEach(v=>{
      const el = document.getElementById('view-'+v);
      if(el) el.classList.toggle('hidden', v!==name);
    });
    document.querySelectorAll('.nav-item[data-view]').forEach(btn=>{
      btn.classList.toggle('active', btn.getAttribute('data-view')===name);
    });
    if(name==='map') setTimeout(initCitizenMap, 50);
    if(name==='alerts') renderAllAlerts();
    if(name==='reports') renderMyReports();
    if(name==='profile') renderProfile();
  }
  document.querySelectorAll('.nav-item[data-view]').forEach(btn=>{
    btn.addEventListener('click', ()=>showView(btn.getAttribute('data-view')));
  });
  document.getElementById('nav-camera').addEventListener('click', ()=>openModal('report-modal'));
  document.getElementById('qa-report').addEventListener('click', ()=>openModal('report-modal'));
  document.getElementById('qa-map').addEventListener('click', ()=>showView('map'));
  document.getElementById('qa-emergency').addEventListener('click', ()=>openModal('emergency-modal'));
  document.getElementById('qa-safety').addEventListener('click', ()=>openModal('safety-modal'));
  document.getElementById('alerts-bell').addEventListener('click', ()=>showView('alerts'));
  document.getElementById('view-all-alerts').addEventListener('click', ()=>showView('alerts'));
  document.getElementById('reports-new-btn') && document.getElementById('reports-new-btn').addEventListener('click', ()=>openModal('report-modal'));
  document.getElementById('change-zone-btn').addEventListener('click', ()=>openModal('zone-modal'));
  document.getElementById('change-city-btn').addEventListener('click', ()=>window.location.href='location.html');
  document.getElementById('logout-btn').addEventListener('click', ()=>{ clearSession(); window.location.href='index.html'; });

  /* ---- Home zone helper ---- */
  function findHomeZone(){
    return db.zones.find(z=>z.name===homeZoneName) || db.zones[0];
  }

  /* ---- Risk card + AI analysis ---- */
  function runAnalysis(){
    const zone = findHomeZone();
    if(!zone){ return; }
    const recentRain = averageRecentRainfall(db.rainfall, 3);
    const result = analyzeZone(zone, recentRain);

    document.getElementById('risk-level-text').textContent = result.level;
    document.getElementById('risk-level-text').style.color =
      ({Low:'var(--risk-low)',Moderate:'var(--risk-medium)',High:'var(--risk-high)',Critical:'var(--risk-critical)'})[result.level];
    document.getElementById('risk-desc').textContent =
      `Risk score ${result.score}/100 for ${zone.name}. URBANOS combines rainfall, terrain, drainage and incident data to estimate this.`;
    document.getElementById('risk-updated').textContent = 'Updated ' + new Date().toLocaleTimeString();
    document.getElementById('risk-emoji').textContent =
      ({Low:'🌤️',Moderate:'🌧️',High:'⛈️',Critical:'🌊'})[result.level];

    document.getElementById('analysis-headline').textContent = `${result.level} risk — score ${result.score}/100`;
    const recs = document.getElementById('analysis-recs');
    recs.innerHTML = result.contributors.map(c=>`<li>${c}</li>`).join('');

    // precaution banner
    const signals = simulatePrecautionSignals(db.zones, recentRain);
    const mySignal = signals.find(s=>s.zoneId===zone.id);
    document.getElementById('precaution-banner-slot').innerHTML = mySignal ? renderPrecautionBanner(zone.name) : '';
  }
  document.getElementById('run-analysis-btn').addEventListener('click', runAnalysis);

  /* ---- Live weather (GET /api/weather/current) — small read-out under the risk card ---- */
  async function loadLiveWeather(){
    try{
      const w = await getCurrentWeather(city);
      let el = document.getElementById('live-weather-line');
      if(!el){
        el = document.createElement('div');
        el.id = 'live-weather-line';
        el.className = 'text-sm text-muted';
        el.style.marginTop = '6px';
        document.getElementById('risk-desc').insertAdjacentElement('afterend', el);
      }
      el.textContent = `Live weather: ${w.condition || '—'} · ${w.temperature}°C · ${w.humidity}% humidity · `
        + `${w.wind_speed} km/h wind · ${w.rainfall} mm rainfall${w.source!=='live' ? ' (demo data)' : ''}`;
    }catch(e){ /* weather is supplementary — fail quietly if backend is offline */ }
  }

  /* ---- Rainfall chart ---- */
  function renderRainfallChart(){
    const ctx = document.getElementById('rainfall-chart');
    if(!ctx || typeof Chart === 'undefined') return;
    const labels = db.rainfall.map(r=>new Date(r.t).getHours()+':00');
    const data = db.rainfall.map(r=>r.mm);
    if(rainfallChart) rainfallChart.destroy();
    rainfallChart = new Chart(ctx, {
      type:'bar',
      data:{ labels, datasets:[{ label:'mm/hr', data, backgroundColor:'#1565C0' }] },
      options:{ plugins:{legend:{display:false}}, scales:{ y:{ beginAtZero:true } } }
    });
  }

  /* ---- Alerts ---- */
  function alertItemHTML(a){
    return `<div class="list-row">
      <div>
        <div style="font-weight:700;font-size:13.5px;">${a.title}</div>
        <div class="text-sm text-muted">${a.body}</div>
      </div>
      <span class="badge ${riskBadgeClass(a.severity)}">${a.severity}</span>
    </div>`;
  }
  function renderRecentAlerts(){
    document.getElementById('recent-alerts-list').innerHTML =
      db.alerts.slice(0,3).map(alertItemHTML).join('') || '<div class="list-row text-muted">No alerts</div>';
    document.getElementById('alert-count').textContent = db.alerts.length;
  }
  function renderAllAlerts(){
    document.getElementById('all-alerts-list').innerHTML =
      db.alerts.map(alertItemHTML).join('') || '<div class="list-row text-muted">No alerts</div>';
  }

  /* ---- Reports (My Reports) ---- */
  function renderMyReports(){
    const list = document.getElementById('my-reports-list');
    if(!db.reports.length){
      list.innerHTML = '<div class="list-row text-muted">No reports submitted yet. Tap "+ New" to report a flood.</div>';
      return;
    }
    list.innerHTML = db.reports.map(r=>`
      <div class="list-row" style="cursor:pointer;" data-report="${r.id}">
        <div>
          <div style="font-weight:700;font-size:13.5px;">#${r.id} — ${r.incidentType||'Flood Report'}</div>
          <div class="text-sm text-muted">${new Date(r.createdAt).toLocaleString()}</div>
        </div>
        <span class="badge badge-neutral">${REPORT_STAGES[r.stage]}</span>
      </div>`).join('');
    list.querySelectorAll('[data-report]').forEach(row=>{
      row.addEventListener('click', ()=>openReportTracker(row.getAttribute('data-report')));
    });
  }
  function openReportTracker(id){
    const r = db.reports.find(x=>x.id===id);
    if(!r) return;
    const times = r.stageHistory.map(t=> t ? new Date(t).toLocaleTimeString() : null);
    document.getElementById('report-track-body').innerHTML = `
      ${r.photo ? `<img src="${r.photo}" style="width:100%;border-radius:12px;margin-bottom:14px;max-height:200px;object-fit:cover;">` : ''}
      <p class="text-sm"><strong>${r.incidentType||'Flood Report'}</strong> — ${r.description||''}</p>
      <p class="text-sm text-muted">Zone: ${r.zone} · Severity: ${r.severity}</p>
      ${renderStepper(r.stage, times)}
    `;
    openModal('report-track-modal');
  }

  /* ---- Report Flood modal ---- */
  const zoneSelect = document.getElementById('report-zone-select');
  db.zones.forEach(z=>{
    const opt = document.createElement('option'); opt.value=z.name; opt.textContent=z.name;
    zoneSelect.appendChild(opt);
  });
  if(homeZoneName) zoneSelect.value = homeZoneName;

  let selectedSeverity = 'medium';
  document.getElementById('severity-picker').addEventListener('click', (e)=>{
    const btn = e.target.closest('[data-sev]'); if(!btn) return;
    document.querySelectorAll('#severity-picker button').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active'); selectedSeverity = btn.getAttribute('data-sev');
  });

  let capturedPhoto = null;
  const video = document.getElementById('camera-video');
  const canvas = document.getElementById('camera-canvas');
  const preview = document.getElementById('camera-preview');
  const placeholder = document.getElementById('camera-placeholder');

  const fileInput = document.getElementById('cam-file-input');

  const camStartBtn = document.getElementById('cam-start-btn');
  const camShotBtn = document.getElementById('cam-shot-btn');
  const camRetakeBtn = document.getElementById('cam-retake-btn');
  const camBadge = document.getElementById('cam-permission-badge');

  const CAMERA_ERROR_MESSAGES = {
    insecure: 'Camera needs a secure (https) connection here — use "Upload Photo Instead".',
    denied: 'Camera permission was denied — allow camera access in your browser settings, or use "Upload Photo Instead".',
    nocamera: 'No camera was found on this device — use "Upload Photo Instead".',
    busy: 'Camera is already in use by another app/tab — close it and try again, or use "Upload Photo Instead".',
    unsupported: 'Camera isn\'t supported in this browser — use "Upload Photo Instead".',
    unknown: 'Camera unavailable here — use "Upload Photo Instead" to add a picture.'
  };

  // Fully resets the camera UI back to its initial state and releases any
  // open stream. Called on retake, on submit, and whenever the modal is
  // closed (✕ button / tapping outside) so the camera never stays "stuck"
  // and is always able to open again next time.
  function resetCameraUI(){
    stopCamera(video);
    capturedPhoto = null;
    preview.classList.add('hidden'); preview.src = '';
    video.classList.add('hidden');
    placeholder.classList.remove('hidden');
    camStartBtn.classList.remove('hidden');
    camShotBtn.classList.add('hidden');
    camRetakeBtn.classList.add('hidden');
    camBadge.textContent = 'Not checked';
    camBadge.className = 'badge badge-low';
  }

  function acceptCapturedFile(file){
    if(!file) return;
    readFileAsDataURL(file)
      .then(dataUrl=>resizeImageDataUrl(dataUrl))
      .then(resized=>{
        stopCamera(video);
        capturedPhoto = resized;
        preview.src = capturedPhoto; preview.classList.remove('hidden');
        video.classList.add('hidden'); placeholder.classList.add('hidden');
        camStartBtn.classList.add('hidden');
        camShotBtn.classList.add('hidden');
        camRetakeBtn.classList.remove('hidden');
        camBadge.textContent = 'Photo added';
        camBadge.className = 'badge badge-low';
      });
  }

  camStartBtn.addEventListener('click', async ()=>{
    camStartBtn.disabled = true;
    camBadge.textContent = 'Requesting…';
    camBadge.className = 'badge badge-neutral';
    const result = await startCamera(video);
    camStartBtn.disabled = false;
    if(result.ok){
      placeholder.classList.add('hidden'); video.classList.remove('hidden');
      camStartBtn.classList.add('hidden');
      camShotBtn.classList.remove('hidden');
      camBadge.textContent = 'Granted';
      camBadge.className = 'badge badge-low';
    }else{
      camBadge.textContent = 'Unavailable';
      camBadge.className = 'badge badge-high';
      showToast(CAMERA_ERROR_MESSAGES[result.reason] || CAMERA_ERROR_MESSAGES.unknown, 'error');
    }
  });

  // Always-available explicit fallback so a photo can be attached even when
  // getUserMedia is blocked (e.g. no camera, permission denied, or the page
  // isn't served over https/localhost).
  document.getElementById('cam-upload-btn').addEventListener('click', ()=>{
    fileInput.click();
  });
  fileInput.addEventListener('change', ()=>{
    acceptCapturedFile(fileInput.files[0]);
    fileInput.value = '';
  });

  camShotBtn.addEventListener('click', ()=>{
    capturedPhoto = capturePhoto(video, canvas);
    preview.src = capturedPhoto; preview.classList.remove('hidden'); video.classList.add('hidden');
    camShotBtn.classList.add('hidden');
    camRetakeBtn.classList.remove('hidden');
    stopCamera(video);
  });
  camRetakeBtn.addEventListener('click', ()=>{
    preview.classList.add('hidden'); preview.src=''; capturedPhoto=null;
    placeholder.classList.remove('hidden');
    camRetakeBtn.classList.add('hidden');
    camStartBtn.classList.remove('hidden');
    camBadge.textContent = 'Not checked';
    camBadge.className = 'badge badge-low';
  });

  // Release the camera the moment the Report modal is closed any way
  // (✕ button or tapping the dark overlay) — previously the stream was left
  // running in the background, so the browser reported it as "busy" and
  // refused to open it again the next time the user tapped the camera button.
  const reportModalEl = document.getElementById('report-modal');
  reportModalEl.addEventListener('click', (e)=>{
    const closedViaX = e.target.closest('[data-close="report-modal"]');
    const closedViaOverlay = e.target === reportModalEl;
    if(closedViaX || closedViaOverlay) resetCameraUI();
  });

  document.getElementById('submit-report-btn').addEventListener('click', async ()=>{
    const desc = document.getElementById('report-desc').value.trim();
    const submitBtn = document.getElementById('submit-report-btn');
    submitBtn.disabled = true;
    try{
      const report = await addReport(city, {
        zone: zoneSelect.value, severity: selectedSeverity, description: desc,
        incidentType: 'Flood / Hazard', photo: capturedPhoto
      });
      db = getDB(city);
      if(report.photoDropped){
        showToast('Report #'+report.id+' submitted, but the photo was too large to save — description and zone were still sent.', 'error');
      }else{
        showToast('Report #'+report.id+' submitted successfully', 'success');
      }
      closeModal('report-modal');
      resetCameraUI();
      document.getElementById('report-desc').value='';
      renderMyReports();
    }catch(err){
      // A real backend error (e.g. expired session) — do NOT close the modal
      // or pretend it worked, so the citizen knows to retry / log in again.
      console.error('Report submission failed:', err);
      showToast(err.status === 401
        ? 'Your session expired — please log out and log back in, then resubmit.'
        : ('Could not submit report: ' + (err.message || 'unknown error')), 'error');
    }finally{
      submitBtn.disabled = false;
    }
  });

  /* ---- Emergency SOS ---- */
  const emZoneSelect = document.getElementById('emergency-zone-select');
  db.zones.forEach(z=>{
    const opt = document.createElement('option'); opt.value=z.name; opt.textContent=z.name;
    emZoneSelect.appendChild(opt);
  });
  if(homeZoneName) emZoneSelect.value = homeZoneName;
  let emergencyType = 'ambulance';
  document.getElementById('emergency-type-picker').addEventListener('click', (e)=>{
    const btn = e.target.closest('[data-type]'); if(!btn) return;
    document.querySelectorAll('#emergency-type-picker button').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active'); emergencyType = btn.getAttribute('data-type');
  });

  let emergencyMap;
  document.getElementById('find-route-btn').addEventListener('click', async ()=>{
    document.getElementById('emergency-result').classList.remove('hidden');
    const zone = db.zones.find(z=>z.name===emZoneSelect.value) || db.zones[0];
    // Demo coordinates around city center with small deterministic offsets
    const center = cityCenterLatLng(city);
    const userLat = center.lat + (hashStr(zone.name)%100-50)/5000;
    const userLng = center.lng + (hashStr(zone.name+'x')%100-50)/5000;
    const stationLat = center.lat + 0.01; const stationLng = center.lng + 0.01;

    const route = await getRoute(stationLat, stationLng, userLat, userLng);
    const exposure = routeFloodExposure(db.zones, route.distanceKm);

    if(!emergencyMap){
      emergencyMap = L.map('emergency-map').setView([userLat,userLng], 13);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap'}).addTo(emergencyMap);
    }else{
      emergencyMap.eachLayer(l=>{ if(!(l instanceof L.TileLayer)) emergencyMap.removeLayer(l); });
      emergencyMap.setView([userLat,userLng],13);
    }
    L.marker([userLat,userLng]).addTo(emergencyMap).bindPopup('You are here');
    L.marker([stationLat,stationLng]).addTo(emergencyMap).bindPopup((emergencyType[0].toUpperCase()+emergencyType.slice(1))+' unit');
    L.polyline(route.coords, {color:'#c62828', weight:4}).addTo(emergencyMap);

    document.getElementById('route-stats').innerHTML = `
      <div class="list-row"><span>Distance</span><strong>${route.distanceKm} km</strong></div>
      <div class="list-row"><span>ETA</span><strong>${route.durationMin} min</strong></div>
      <div class="list-row"><span>Flood exposure</span><strong>${exposure.exposure}</strong></div>
      <div class="list-row"><span>Routing</span><strong>${route.live ? 'Live road route (OSRM)' : 'Straight-line estimate (offline)'}</strong></div>
    `;
    const warn = document.getElementById('route-warning');
    if(exposure.exposure !== 'Low'){
      warn.classList.remove('hidden');
      warn.innerHTML = `<div class="precaution-banner"><span class="pb-icon">⚠️</span><div><strong>Route caution</strong><p>This route may pass through ${exposure.highRiskZones} high-risk zone(s). Proceed carefully.</p></div></div>`;
    }else{
      warn.classList.add('hidden');
    }
  });

  function cityCenterLatLng(cityName){
    const CITY_COORDS = {
      "Bhubaneswar":{lat:20.2961,lng:85.8245}, "Mumbai":{lat:19.076,lng:72.8777},
      "New Delhi":{lat:28.6139,lng:77.2090}, "Bengaluru":{lat:12.9716,lng:77.5946},
      "Chennai":{lat:13.0827,lng:80.2707}, "Kolkata":{lat:22.5726,lng:88.3639},
      "Lucknow":{lat:26.8467,lng:80.9462}, "Ahmedabad":{lat:23.0225,lng:72.5714},
      "Jaipur":{lat:26.9124,lng:75.7873}, "Patna":{lat:25.5941,lng:85.1376},
      "Kochi":{lat:9.9312,lng:76.2673}, "Hyderabad":{lat:17.385,lng:78.4867}
    };
    return CITY_COORDS[cityName] || {lat:20.2961,lng:85.8245};
  }

  /* ---- Citizen live risk map ---- */
  let citizenMap;
  async function initCitizenMap(){
    const center = cityCenterLatLng(city);

    if(citizenMap){
        citizenMap.invalidateSize();
        return;
    }

    // Create map
    citizenMap = L.map('citizen-map').setView(
        [center.lat, center.lng],
        12
    );

    // OpenStreetMap
    L.tileLayer(
        'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        {
            attribution: '© OpenStreetMap'
        }
    ).addTo(citizenMap);

    // Existing risk zones
    const recentRain = averageRecentRainfall(db.rainfall, 3);

    db.zones.forEach((z,i)=>{
        const lat = center.lat + Math.sin(i*1.7)*0.03;
        const lng = center.lng + Math.cos(i*1.7)*0.03;

        const result = analyzeZone(z, recentRain);

        const color = ({
            Low:'#2e9e5b',
            Moderate:'#e0a712',
            High:'#e8722c',
            Critical:'#c62828'
        })[result.level];

        L.circleMarker(
            [lat,lng],
            {
                radius:11,
                color:color,
                fillColor:color,
                fillOpacity:0.7
            }
        )
        .addTo(citizenMap)
        .bindPopup(
            `<strong>${z.name}</strong><br>
             ${result.level} risk (${result.score}/100)`
        );
    });

    // ==========================================
    // LOAD DRAINAGE PIPELINES FROM FASTAPI
    // ==========================================

    try {
        const response = await fetch(
            'http://127.0.0.1:8000/api/drainage/pipelines'
        );

        if(!response.ok){
            throw new Error('Failed to load drainage pipelines');
        }

        const pipelines = await response.json();

        pipelines.forEach(pipeline => {

            if(!pipeline.geometry){
                return;
            }

            const coordinates =
                pipeline.geometry.coordinates.map(
                    point => [point[1], point[0]]
                );

            // Normal = blue
            // Blocked = red
            const isBlocked =
                pipeline.blocked === true ||
                pipeline.status?.toLowerCase() === 'blocked' ||
                pipeline.condition?.toLowerCase() === 'blocked';

            const lineColor = isBlocked ? '#d32f2f' : '#1976d2';

            L.polyline(
                coordinates,
                {
                    color: lineColor,
                    weight: 5,
                    opacity: 0.85
                }
            )
            .addTo(citizenMap)
            .bindPopup(`
                <strong>${pipeline.pipeline_name || 'Drainage Pipeline'}</strong><br>
                Zone: ${pipeline.zone || 'N/A'}<br>
                Status: ${isBlocked ? '🚨 BLOCKED' : 'Normal'}<br>
                Diameter: ${pipeline.diameter_m || 'N/A'} m<br>
                Water Level: ${pipeline.water_level_percent || 0}%<br>
                Blockage: ${pipeline.blockage_level_percent || 0}%
            `);
        });

        console.log(
            'Drainage pipelines loaded:',
            pipelines.length
        );

    } catch(error) {

        console.error(
            'Could not load drainage pipelines:',
            error
        );
    }
}

  /* ---- Zone picker modal ---- */
  function renderZonePickList(){
    const list = document.getElementById('zone-pick-list');
    list.innerHTML = db.zones.map(z=>`<button class="loc-chip" style="width:100%;text-align:left;margin-bottom:8px;display:block;" data-zone="${z.name}">${z.name}</button>`).join('');
    list.querySelectorAll('[data-zone]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        saveSession({ zone: btn.getAttribute('data-zone') });
        window.location.reload();
      });
    });
  }
  document.getElementById('change-zone-btn').addEventListener('click', ()=>{ renderZonePickList(); openModal('zone-modal'); });

  /* ---- Profile ---- */
  const profileZoneSelect = document.getElementById('profile-zone-select');
  function renderProfile(){
    document.getElementById('profile-name').textContent = session.name || 'Citizen User';
    document.getElementById('profile-email').textContent = session.email || '—';
    document.getElementById('profile-location-badge').textContent = city + (homeZoneName ? ' · '+homeZoneName : '');
    profileZoneSelect.innerHTML = db.zones.map(z=>`<option value="${z.name}">${z.name}</option>`).join('');
    if(homeZoneName) profileZoneSelect.value = homeZoneName;
  }
  document.getElementById('save-profile-btn').addEventListener('click', ()=>{
    saveSession({ zone: profileZoneSelect.value });
    showToast('Profile saved', 'success');
  });

  /* ---- Init ---- */
  renderRecentAlerts();
  renderRainfallChart();
  runAnalysis();
  loadLiveWeather();
  showView('home');

  /* ---- Auto-refresh: pull fresh weather/zones/reports from the backend
     every 2 minutes (spec section 13). Keeps "My Reports" status in sync
     with whatever an Authority user has done to it, without a reload. ---- */
  setInterval(async ()=>{
    try{
      await initDB(city);
      db = getDB(city);
      runAnalysis();
      loadLiveWeather();
      renderMyReports();
    }catch(e){ console.warn('Auto-refresh failed:', e.message); }
  }, 120000);
})();
