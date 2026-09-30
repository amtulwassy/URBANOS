/* ============ AUTHORITY CONSOLE LOGIC ============ */
(async function(){
  const session = requireSession('index.html');
  if(!session.city){ window.location.href = 'location.html'; return; }
  const city = session.city;
  await initDB(city);   // pulls zones/reports/emergency stations from the backend
  let db = getDB(city);

  const CITY_COORDS = {
    "Bhubaneswar":{lat:20.2961,lng:85.8245}, "Mumbai":{lat:19.076,lng:72.8777},
    "New Delhi":{lat:28.6139,lng:77.2090}, "Bengaluru":{lat:12.9716,lng:77.5946},
    "Chennai":{lat:13.0827,lng:80.2707}, "Kolkata":{lat:22.5726,lng:88.3639},
    "Lucknow":{lat:26.8467,lng:80.9462}, "Ahmedabad":{lat:23.0225,lng:72.5714},
    "Jaipur":{lat:26.9124,lng:75.7873}, "Patna":{lat:25.5941,lng:85.1376},
    "Kochi":{lat:9.9312,lng:76.2673}, "Hyderabad":{lat:17.385,lng:78.4867}
  };
  function cityCenter(){ return CITY_COORDS[city] || {lat:20.2961,lng:85.8245}; }
  function zoneLatLng(z,i){
    const c = cityCenter();
    return { lat: c.lat + Math.sin(i*1.7)*0.035, lng: c.lng + Math.cos(i*1.7)*0.035 };
  }

  document.getElementById('topbar-sub').textContent = city + ' flood risk overview';
  document.getElementById('tb-name').textContent = session.name || 'Admin';
  document.getElementById('tb-avatar').textContent = (session.name||'A')[0].toUpperCase();
  document.getElementById('side-change-city-btn').addEventListener('click', ()=>window.location.href='location.html');
  document.getElementById('side-logout-btn').addEventListener('click', ()=>{ clearSession(); window.location.href='index.html'; });

  /* ---- View navigation ---- */
  const viewIds = ['dashboard','livemap','analysis','precaution','alerts','reports','infra','response','forecast'];
  const titles = {dashboard:'Dashboard',livemap:'Live Risk Map',analysis:'AI Risk Analysis',precaution:'Precaution Signals',alerts:'Alerts',reports:'Complaint Tracker',infra:'Infrastructure',response:'Emergency Response',forecast:'Forecast'};
  function showView(name){
    viewIds.forEach(v=>{
      const el = document.getElementById('view-'+(v==='alerts'?'alerts-full':v==='reports'?'reports-full':v));
      if(el) el.classList.toggle('hidden', v!==name);
    });
    document.querySelectorAll('.side-link[data-view]').forEach(b=>b.classList.toggle('active', b.getAttribute('data-view')===name));
    document.getElementById('topbar-title').textContent = titles[name] || 'Dashboard';
    if(name==='livemap') setTimeout(initLiveMap,50);
    if(name==='analysis') renderAnalysisGrid();
    if(name==='precaution') renderPrecautionFull();
    if(name==='alerts') renderFullAlerts();
    if(name==='reports') renderComplaintTable();
    if(name==='infra') {
  renderInfraTable();
  setTimeout(initInfraMap, 300);
}
    if(name==='forecast') renderForecastChart();
  }
  document.querySelectorAll('.side-link[data-view]').forEach(btn=>{
    btn.addEventListener('click', ()=>showView(btn.getAttribute('data-view')));
  });
  document.addEventListener('click',(e)=>{
    const g = e.target.closest('[data-goto]');
    if(g) showView(g.getAttribute('data-goto'));
  });

  /* ---- Analysis helpers over all zones ---- */
  function recentRain(){ return averageRecentRainfall(db.rainfall, 3); }
  function allZoneResults(){
    const rain = recentRain();
    return db.zones.map(z=>analyzeZone(z, rain));
  }

  /* ---- Dashboard stats ---- */
  function renderStats(){
    const results = allZoneResults();
    const rain24 = db.rainfall.reduce((a,b)=>a+b.mm,0).toFixed(0);
    const avgWater = (db.zones.reduce((a,z)=>a+(z.waterLevel||0),0)/Math.max(1,db.zones.length)).toFixed(2);
    const highRisk = results.filter(r=>r.level==='High'||r.level==='Critical').length;
    const affected = highRisk * (800 + Math.round(recentRain()*20));

    document.getElementById('stat-rainfall').textContent = rain24 + ' mm';
    document.getElementById('stat-rainfall-delta').textContent = '↑ last 24h';
    document.getElementById('stat-water').textContent = avgWater + ' m';
    document.getElementById('stat-highrisk').textContent = highRisk;
    document.getElementById('stat-highrisk-delta').textContent = highRisk>0 ? '↑ needs attention' : 'Stable';
    document.getElementById('stat-affected').textContent = affected.toLocaleString();
    document.getElementById('stat-affected-delta').textContent = 'Estimated';
    document.getElementById('stat-sensors').textContent = (db.zones.length*2)+'/'+(db.zones.length*2);
    document.getElementById('last-update-time').textContent = new Date().toLocaleTimeString();
  }

  /* ---- Precaution signals ---- */
  function precautionSignals(){ return simulatePrecautionSignals(db.zones, recentRain()); }
  function precautionRowHTML(s){
    return `<div class="list-row">
      <div><strong>${s.zoneName}</strong><div class="text-sm text-muted">${s.currentLevel} → <b>${s.futureLevel}</b> if rain continues</div></div>
      <button class="btn btn-outline btn-sm" data-notify="${s.zoneId}">Notify Zone &amp; Pre-position Crew</button>
    </div>`;
  }
  function renderPrecautionDash(){
    const signals = precautionSignals();
    document.getElementById('side-precaution-count').textContent = signals.length;
    document.getElementById('dash-precaution-list').innerHTML = signals.length
      ? signals.slice(0,3).map(precautionRowHTML).join('')
      : '<div class="text-sm text-muted">No zones projected to escalate right now.</div>';
  }
  function renderPrecautionFull(){
    const signals = precautionSignals();
    document.getElementById('precaution-full-list').innerHTML = signals.length
      ? signals.map(precautionRowHTML).join('')
      : '<div class="text-sm text-muted">No zones projected to escalate right now.</div>';
  }
  document.addEventListener('click',(e)=>{
    const btn = e.target.closest('[data-notify]');
    if(btn){ showToast('Advisory alert raised — crews notified to pre-position.', 'success'); }
  });

  /* ---- Risk donut ---- */
  let donutChart;
  function renderDonut(){
    const results = allZoneResults();
    const counts = {Low:0,Moderate:0,High:0,Critical:0};
    results.forEach(r=>counts[r.level]++);
    document.getElementById('donut-total').textContent = results.length;
    const ctx = document.getElementById('risk-donut');
    if(!ctx || typeof Chart==='undefined') return;
    if(donutChart) donutChart.destroy();
    donutChart = new Chart(ctx, {
      type:'doughnut',
      data:{ labels:Object.keys(counts), datasets:[{ data:Object.values(counts),
        backgroundColor:['#2e9e5b','#e0a712','#e8722c','#c62828'] }] },
      options:{ cutout:'68%', plugins:{legend:{display:false}} }
    });
    document.getElementById('donut-legend').innerHTML = Object.entries(counts).map(([k,v])=>
      `<span><span class="dot ${riskDotClass(k)}"></span>${k} (${v})</span>`).join('');
  }

  /* ---- Trend charts ---- */
  let rainTrendChart, waterTrendChart, forecastChart;
  function renderTrendCharts(){
    const ctxR = document.getElementById('rainfall-trend-chart');
    const ctxW = document.getElementById('water-trend-chart');
    const labels = db.rainfall.map(r=>new Date(r.t).getHours()+':00');
    if(ctxR && typeof Chart!=='undefined'){
      if(rainTrendChart) rainTrendChart.destroy();
      rainTrendChart = new Chart(ctxR,{type:'line',data:{labels,datasets:[{data:db.rainfall.map(r=>r.mm),borderColor:'#1565C0',tension:.3,fill:false}]},options:{plugins:{legend:{display:false}}}});
    }
    if(ctxW && typeof Chart!=='undefined'){
      const waterSeries = db.rainfall.map((r,i)=> +(0.4 + Math.sin(i/3)*0.15 + r.mm/120).toFixed(2));
      if(waterTrendChart) waterTrendChart.destroy();
      waterTrendChart = new Chart(ctxW,{type:'line',data:{labels,datasets:[{data:waterSeries,borderColor:'#0e9aa3',tension:.3,fill:false}]},options:{plugins:{legend:{display:false}}}});
    }
  }
  function renderForecastChart(){
    const ctx = document.getElementById('forecast-chart');
    if(!ctx || typeof Chart==='undefined') return;
    const labels = Array.from({length:24},(_,i)=> 'H+'+(i*3));
    const lastRain = db.rainfall[db.rainfall.length-1].mm;
    const data = labels.map((_,i)=> +Math.max(0, lastRain + Math.sin(i/3)*10 - i*0.3).toFixed(1));
    if(forecastChart) forecastChart.destroy();
    forecastChart = new Chart(ctx,{type:'line',data:{labels,datasets:[{label:'Illustrative mm/hr',data,borderColor:'#0b4f8a',tension:.35,fill:true,backgroundColor:'rgba(11,79,138,0.08)'}]},options:{plugins:{legend:{display:false}}}});
  }

  /* ---- Top at-risk zones table ---- */
  function renderTopZones(){
    const results = allZoneResults().sort((a,b)=>b.score-a.score).slice(0,5);
    document.getElementById('top-zones-table').querySelector('tbody').innerHTML = results.map(r=>{
      const zone = db.zones.find(z=>z.id===r.zoneId);
      const pop = 4000 + hashStr(r.zoneName)%9000;
      return `<tr data-zone="${r.zoneId}"><td>${r.zoneName}</td><td><span class="badge ${riskBadgeClass(r.level)}">${r.level}</span></td><td>${pop.toLocaleString()}</td><td>${r.score}</td></tr>`;
    }).join('');
  }

  /* ---- Reco actions ---- */
  function renderRecoActions(){
    const signals = precautionSignals();
    const results = allZoneResults();
    const items = [];
    results.filter(r=>r.level==='Critical').forEach(r=>items.push(`🚨 Deploy pumps and evacuate low-lying blocks in <strong>${r.zoneName}</strong> immediately.`));
    results.filter(r=>r.level==='High').forEach(r=>items.push(`⚠️ Pre-position drainage crews in <strong>${r.zoneName}</strong>.`));
    signals.forEach(s=>items.push(`📍 Monitor <strong>${s.zoneName}</strong> — projected to reach ${s.futureLevel} if rain continues.`));
    if(items.length===0) items.push('✅ No urgent actions — conditions stable across all zones.');
    document.getElementById('reco-actions').innerHTML = items.slice(0,6).map(i=>`<div class="reco-item">${i}</div>`).join('');
  }

  /* ---- Reports / Alerts lists on dashboard ---- */
  function renderDashLists(){
    document.getElementById('dash-reports-list').innerHTML = db.reports.slice(0,4).map(r=>`
      <div class="list-row"><div><strong>#${r.id}</strong> — ${r.zone}<div class="text-sm text-muted">${r.incidentType||'Report'}</div></div>
      <span class="badge badge-neutral">${REPORT_STAGES[r.stage]}</span></div>`).join('') || '<div class="text-sm text-muted">No reports yet.</div>';
    document.getElementById('dash-alerts-list').innerHTML = db.alerts.slice(0,4).map(a=>`
      <div class="list-row"><div><strong>${a.title}</strong><div class="text-sm text-muted">${a.body}</div></div>
      <span class="badge ${riskBadgeClass(a.severity)}">${a.severity}</span></div>`).join('');
    document.getElementById('tb-alert-badge').textContent = db.alerts.length;
    document.getElementById('side-alert-count').textContent = db.alerts.length;
  }
  function renderFullAlerts(){
    document.getElementById('full-alerts-list').innerHTML = db.alerts.map(a=>`
      <div class="list-row"><div><strong>${a.title}</strong><div class="text-sm text-muted">${a.body} · ${new Date(a.time).toLocaleString()}</div></div>
      <span class="badge ${riskBadgeClass(a.severity)}">${a.severity}</span></div>`).join('');
  }

  /* ---- New alert modal ---- */
  const newAlertZone = document.getElementById('new-alert-zone');
  db.zones.forEach(z=>{ const o=document.createElement('option'); o.value=z.name; o.textContent=z.name; newAlertZone.appendChild(o); });
  document.getElementById('new-alert-btn').addEventListener('click', ()=>openModal('new-alert-modal'));
  document.getElementById('new-alert-submit').addEventListener('click', ()=>{
    const msg = document.getElementById('new-alert-message').value.trim();
    if(!msg){ showToast('Enter a message', 'error'); return; }
    db.alerts.unshift({ id:'a'+Date.now(), title:'Alert — '+newAlertZone.value, body:msg,
      severity:document.getElementById('new-alert-severity').value, time:Date.now() });
    saveDB(city, db);
    showToast('Alert broadcast to citizens in '+newAlertZone.value, 'success');
    closeModal('new-alert-modal');
    document.getElementById('new-alert-message').value='';
    });
      /* ---- Infrastructure Drainage Map ---- */

  let infraMap = null;

  async function initInfraMap(){
    const mapElement = document.getElementById('infra-map');

    if(!mapElement) return;

    if(infraMap){
      infraMap.invalidateSize();
      return;
    }

    const c = cityCenter();

    infraMap = L.map('infra-map').setView([c.lat, c.lng], 12);

    L.tileLayer(
      'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      {
        attribution: '© OpenStreetMap'
      }
    ).addTo(infraMap);

    try{
      const response = await fetch(
        'http://127.0.0.1:8000/api/drainage/pipelines'
      );

      if(!response.ok){
        throw new Error(`Pipeline API returned ${response.status}`);
      }

      const pipelines = await response.json();

      console.log('Drainage pipelines loaded:', pipelines.length);

      pipelines.forEach(pipeline => {

        if(!pipeline.geometry) return;

        let geometry;

        try{
          geometry = JSON.parse(pipeline.geometry);
        }catch(e){
          console.warn('Invalid geometry:', pipeline.id);
          return;
        }

        const blockage = Number(
          pipeline.blockage_level_percent || 0
        );

        let color = '#2e9e5b';

        if(blockage >= 70){
          color = '#c62828';
        }else if(blockage >= 40){
          color = '#e0a712';
        }

        const geoJsonLayer = L.geoJSON(
          geometry,
          {
            style: {
              color: color,
              weight: 4,
              opacity: 0.85
            }
          }
        );

        geoJsonLayer.bindPopup(`
          <strong>${pipeline.pipeline_name || 'Unknown Pipeline'}</strong><br>
          <b>Zone:</b> ${pipeline.zone || 'N/A'}<br>
          <b>Material:</b> ${pipeline.material || 'N/A'}<br>
          <b>Diameter:</b> ${pipeline.diameter_m || 'N/A'} m<br>
          <b>Condition:</b> ${pipeline.condition || 'N/A'}<br>
          <b>Blockage:</b> ${blockage}%<br>
          <b>Status:</b> ${pipeline.status || 'N/A'}<br>
          <b>Last Checked:</b> ${pipeline.last_checked || 'N/A'}
        `);

        geoJsonLayer.addTo(infraMap);
      });

    }catch(error){
      console.error('Could not load drainage pipelines:', error);
    }

    setTimeout(() => {
      infraMap.invalidateSize();
    }, 300);
  }


  /* Open infrastructure map when Infrastructure is selected */

  document.querySelectorAll('.side-link[data-view="infra"]').forEach(btn => {
  btn.addEventListener('click', () => {
    setTimeout(() => {
      initInfraMap();
    }, 200);
  });
});
/*renderAll();
setTimeout(initDashMap, 60);
showView('dashboard');
  /* ---- Complaint tracker ---- */
  function renderComplaintTable(){
    const body = document.getElementById('complaint-table-body');
    body.innerHTML = db.reports.map(r=>`
      <tr data-report="${r.id}">
        <td>${r.photo ? `<img src="${r.photo}" class="report-thumb" alt="Report photo">` : `<span class="report-thumb report-thumb-empty">—</span>`}</td>
        <td>#${r.id}</td><td>${r.zone}</td>
        <td><span class="badge ${riskBadgeClass(r.severity)}">${r.severity}</span></td>
        <td>${REPORT_STAGES[r.stage]}</td>
        <td>${r.contractor ? r.contractor+' / '+(r.worker||'—') : '—'}</td>
      </tr>`).join('') || `<tr><td colspan="6" class="text-muted">No citizen reports yet.</td></tr>`;
    body.querySelectorAll('tr[data-report]').forEach(row=>{
      row.addEventListener('click', ()=>openComplaintDetail(row.getAttribute('data-report')));
    });
  }
  function openComplaintDetail(id){
    const r = db.reports.find(x=>x.id===id);
    if(!r) return;
    const times = r.stageHistory.map(t=>t?new Date(t).toLocaleTimeString():null);
    document.getElementById('rd-body').innerHTML = `
      ${r.photo?`<img src="${r.photo}" style="width:100%;border-radius:12px;margin-bottom:14px;max-height:220px;object-fit:cover;">`:''}
      <p class="text-sm"><strong>${r.incidentType||'Flood Report'}</strong> — ${r.description||'No description'}</p>
      <p class="text-sm text-muted">Zone: ${r.zone} · Severity: ${r.severity}</p>
      ${renderStepper(r.stage, times)}
      <div class="field" style="margin-top:16px;"><label>Contractor</label><input class="input" id="rd-contractor" value="${r.contractor||''}" placeholder="e.g. GreenCity Infra Pvt Ltd"></div>
      <div class="field"><label>Field worker</label><input class="input" id="rd-worker" value="${r.worker||''}" placeholder="e.g. Ramesh Kumar"></div>
      <button class="btn btn-outline btn-block" id="rd-assign-btn">Save Contractor / Worker</button>
      <button class="btn btn-primary btn-block" id="rd-advance-btn" style="margin-top:8px;" ${r.stage>=5?'disabled':''}>Advance to Next Stage →</button>
    `;
    openModal('report-detail-modal');
    document.getElementById('rd-assign-btn').addEventListener('click', async ()=>{
      try{
        await assignReportContractor(city, id, document.getElementById('rd-contractor').value, document.getElementById('rd-worker').value);
        db = getDB(city); showToast('Contractor/worker assigned', 'success'); openComplaintDetail(id); renderComplaintTable(); renderDashLists();
      }catch(err){
        showToast(err.status === 403 ? 'Only an Authority account can do this.' : ('Could not save: ' + (err.message||'unknown error')), 'error');
      }
    });
    document.getElementById('rd-advance-btn') && document.getElementById('rd-advance-btn').addEventListener('click', async ()=>{
      try{
        await advanceReportStage(city, id);
        db = getDB(city); showToast('Complaint stage advanced', 'success'); openComplaintDetail(id); renderComplaintTable(); renderDashLists();
      }catch(err){
        showToast(err.status === 403 ? 'Only an Authority account can do this.' : ('Could not advance stage: ' + (err.message||'unknown error')), 'error');
      }
    });
  }

  /* ---- Infrastructure table (demo) ---- */
  function renderInfraTable(){
    const assets = [];
    db.zones.forEach(z=>{
      const types = ['Pumping Station','Bridge','School','Sub-station'];
      types.forEach((t,i)=>{
        if((hashStr(z.name+t)%3)===0){
          assets.push({ name:t+' — '+z.name, zone:z.name, type:t, status: z.drainageBlockage>45 ? 'At Risk':'Normal' });
        }
      });
    });
    document.getElementById('infra-table-body').innerHTML = assets.map(a=>`
      <tr><td>${a.name}</td><td>${a.zone}</td><td>${a.type}</td>
      <td><span class="badge ${a.status==='At Risk'?'badge-high':'badge-low'}">${a.status}</span></td></tr>`).join('')
      || `<tr><td colspan="4" class="text-muted">No infrastructure flagged.</td></tr>`;
    document.getElementById('stat-infra').textContent = assets.filter(a=>a.status==='At Risk').length;
  }

  /* ---- Analysis view: zone cards + scenario simulator ---- */
  function renderAnalysisGrid(){
    const results = allZoneResults();
    document.getElementById('analysis-zone-grid').innerHTML = results.map(r=>`
      <div class="zone-card" data-zone="${r.zoneId}">
        <h4>${r.zoneName}</h4>
        <span class="badge ${riskBadgeClass(r.level)}">${r.level} · ${r.score}/100</span>
        <ul class="rec-list" style="margin-top:8px;">${r.contributors.slice(0,2).map(c=>`<li>${c}</li>`).join('')}</ul>
      </div>`).join('');
    document.querySelectorAll('.zone-card[data-zone]').forEach(card=>{
      card.addEventListener('click', ()=>openZoneDetail(card.getAttribute('data-zone')));
    });
  }
  function openZoneDetail(zoneId){
    const zone = db.zones.find(z=>z.id===zoneId);
    const result = analyzeZone(zone, recentRain());
    document.getElementById('zd-title').textContent = zone.name;
    document.getElementById('zd-body').innerHTML = `
      <span class="badge ${riskBadgeClass(result.level)}" style="font-size:13px;">${result.level} · Score ${result.score}/100</span>
      <table class="data-table" style="margin-top:14px;">
        <tbody>
          <tr><td>Elevation</td><td>${zone.elevation} m</td></tr>
          <tr><td>Drainage capacity</td><td>${zone.drainageCapacity}%</td></tr>
          <tr><td>Drainage blockage</td><td>${zone.drainageBlockage}%</td></tr>
          <tr><td>Impervious area</td><td>${zone.imperviousArea}%</td></tr>
          <tr><td>Historical incidents</td><td>${zone.historicalIncidents}</td></tr>
          <tr><td>Water level</td><td>${zone.waterLevel} m</td></tr>
        </tbody>
      </table>
      <h4 style="margin:14px 0 6px;font-size:13.5px;">Risk contributors</h4>
      <ul class="rec-list">${result.contributors.map(c=>`<li>${c}</li>`).join('')}</ul>
    `;
    openModal('zone-detail-modal');
  }
  document.querySelectorAll('#top-zones-table tbody').forEach(()=>{});
  document.addEventListener('click',(e)=>{
    const row = e.target.closest('#top-zones-table tr[data-zone]');
    if(row) openZoneDetail(row.getAttribute('data-zone'));
  });

  const scenarioRain = document.getElementById('scenario-rain');
  scenarioRain.addEventListener('input', ()=>{
    document.getElementById('scenario-rain-val').textContent = scenarioRain.value + ' mm';
  });
  document.getElementById('scenario-run-btn').addEventListener('click', ()=>{
    const extra = +scenarioRain.value;
    const hours = +document.getElementById('scenario-hours').value;
    const base = recentRain();
    const rows = db.zones.map(z=>{
      const before = analyzeZone(z, base);
      const after = analyzeZone(z, base + extra);
      return { z, before, after };
    }).filter(r=>r.after.level !== r.before.level || extra>0);
    document.getElementById('scenario-result').innerHTML = `
      <table class="data-table"><thead><tr><th>Zone</th><th>Current</th><th>Projected (+${extra}mm / ${hours}h)</th></tr></thead>
      <tbody>${rows.map(r=>`<tr><td>${r.z.name}</td>
        <td><span class="badge ${riskBadgeClass(r.before.level)}">${r.before.level} (${r.before.score})</span></td>
        <td><span class="badge ${riskBadgeClass(r.after.level)}">${r.after.level} (${r.after.score})</span></td></tr>`).join('')}</tbody></table>
    `;
  });

  /* ---- Analyze Now button ---- */
  document.getElementById('analyze-now-btn').addEventListener('click', ()=>{
    showToast('Running flood risk analysis on latest data…');
    setTimeout(renderAll, 400);
  });

  /* ---- Maps ---- */
  let dashMap, liveMap;
  async function paintZonesOnMap(map){
  try{
    // Remove previous zone markers
    map.eachLayer(layer => {
      if(layer instanceof L.CircleMarker || layer instanceof L.GeoJSON){
        map.removeLayer(layer);
      }
    });

    // Get real zone GeoJSON + backend ML risk data
    const response = await fetch(
      `http://127.0.0.1:8000/api/zones/geojson?city=${encodeURIComponent(city)}`
    );

    if(!response.ok){
      throw new Error(`Zone API returned ${response.status}`);
    }

    const geojson = await response.json();

    L.geoJSON(geojson, {
      pointToLayer: function(feature, latlng){

        const p = feature.properties || {};

        const level = p.risk_level || 'LOW';
        const score = p.risk_score ?? 0;

        const color = {
          LOW: '#2e9e5b',
          MODERATE: '#e0a712',
          HIGH: '#e8722c',
          CRITICAL: '#c62828'
        }[level] || '#777';

        return L.circleMarker(latlng, {
          radius: 12,
          color: color,
          fillColor: color,
          fillOpacity: 0.75,
          weight: 2
        });
      },

      onEachFeature: function(feature, layer){

        const p = feature.properties || {};

        layer.bindPopup(`
          <strong>${p.name || 'Unknown Zone'}</strong><br>
          <b>Risk:</b> ${p.risk_level || 'N/A'}<br>
          <b>Score:</b> ${p.risk_score ?? 'N/A'}/100<br>
          <b>Elevation:</b> ${p.elevation ?? 'N/A'} m<br>
          <b>Water Level:</b> ${p.water_level ?? 'N/A'} m
        `);
      }

    }).addTo(map);

  }catch(error){
    console.error('Could not load zone GeoJSON:', error);

    // Fallback to existing demo map
    const rain = recentRain();

    db.zones.forEach((z,i)=>{
      const {lat,lng} = zoneLatLng(z,i);
      const r = analyzeZone(z, rain);

      const color = {
        Low:'#2e9e5b',
        Moderate:'#e0a712',
        High:'#e8722c',
        Critical:'#c62828'
      }[r.level];

      L.circleMarker([lat,lng],{
        radius:12,
        color,
        fillColor:color,
        fillOpacity:0.75
      })
      .addTo(map)
      .bindPopup(
        `<strong>${z.name}</strong><br>${r.level} risk (${r.score}/100)`
      );
    });
  }
}
  function initDashMap(){
    if(dashMap){ dashMap.invalidateSize(); return; }
    const c = cityCenter();
    dashMap = L.map('dash-map').setView([c.lat,c.lng],12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap'}).addTo(dashMap);
    paintZonesOnMap(dashMap);
  }
  function initLiveMap(){
    if(liveMap){ liveMap.invalidateSize(); return; }
    const c = cityCenter();
    liveMap = L.map('live-map').setView([c.lat,c.lng],12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap'}).addTo(liveMap);
    paintZonesOnMap(liveMap);
  }

  /* ---- Emergency dispatch (authority) ---- */
  const authEmZone = document.getElementById('auth-em-zone');
  db.zones.forEach(z=>{ const o=document.createElement('option'); o.value=z.name; o.textContent=z.name; authEmZone.appendChild(o); });
  let authEmMap;
  document.getElementById('auth-em-dispatch').addEventListener('click', async ()=>{
    document.getElementById('auth-em-result').classList.remove('hidden');
    const c = cityCenter();
    const zone = db.zones.find(z=>z.name===authEmZone.value) || db.zones[0];
    const idx = db.zones.indexOf(zone);
    const target = zoneLatLng(zone, idx);
    const stationLat = c.lat + 0.01, stationLng = c.lng + 0.01;
    const route = await getRoute(stationLat, stationLng, target.lat, target.lng);
    const exposure = routeFloodExposure(db.zones, route.distanceKm);
    const type = document.getElementById('auth-em-type').value;

    if(!authEmMap){
      authEmMap = L.map('auth-em-map').setView([target.lat,target.lng],13);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap'}).addTo(authEmMap);
    }else{
      authEmMap.eachLayer(l=>{ if(!(l instanceof L.TileLayer)) authEmMap.removeLayer(l); });
      authEmMap.setView([target.lat,target.lng],13);
    }
    L.marker([target.lat,target.lng]).addTo(authEmMap).bindPopup(zone.name);
    L.marker([stationLat,stationLng]).addTo(authEmMap).bindPopup(type+' unit');
    L.polyline(route.coords,{color:'#c62828',weight:4}).addTo(authEmMap);

    document.getElementById('auth-route-stats').innerHTML = `
      <div class="list-row"><span>Distance</span><strong>${route.distanceKm} km</strong></div>
      <div class="list-row"><span>ETA</span><strong>${route.durationMin} min</strong></div>
      <div class="list-row"><span>Flood exposure</span><strong>${exposure.exposure}</strong></div>
      <div class="list-row"><span>Routing</span><strong>${route.live?'Live road route (OSRM)':'Straight-line estimate (offline)'}</strong></div>
    `;
    showToast(type[0].toUpperCase()+type.slice(1)+' dispatched to '+zone.name, 'success');
  });

  /* ---- Profile modal ---- */
  document.getElementById('tb-profile-btn').addEventListener('click', ()=>{ fillProfile(); openModal('profile-modal'); });
  document.getElementById('side-profile-btn').addEventListener('click', ()=>{ fillProfile(); openModal('profile-modal'); });
  function fillProfile(){
    document.getElementById('modal-profile-name').textContent = session.name || 'Admin';
    document.getElementById('modal-profile-email').textContent = session.email || '—';
    document.getElementById('modal-avatar').textContent = (session.name||'A')[0].toUpperCase();
  }
  document.getElementById('profile-save-btn').addEventListener('click', ()=>{
    showToast('Settings saved', 'success'); closeModal('profile-modal');
  });
  document.getElementById('tb-alert-btn').addEventListener('click', ()=>showView('alerts'));

  /* ---- Live weather (GET /api/weather/current) — folded into the rainfall stat card ---- */
  async function loadLiveWeather(){
    try{
      const w = await getCurrentWeather(city);
      document.getElementById('stat-rainfall-delta').textContent =
        `${w.condition || ''} · ${w.temperature}°C · ${w.humidity}% RH · ${w.wind_speed} km/h wind`
        + (w.source!=='live' ? ' (demo)' : '');
    }catch(e){ /* weather is supplementary — fail quietly if backend is offline */ }
  }

  /* ---- Render everything ---- */
  function renderAll(){
    db = getDB(city);
    renderStats();
    renderPrecautionDash();
    renderDonut();
    renderTrendCharts();
    renderTopZones();
    renderRecoActions();
    renderDashLists();
    loadLiveWeather();
    if(dashMap) paintZonesOnMap(dashMap);
  }

  renderAll();
  setTimeout(initDashMap, 60);
  showView('dashboard');

  /* ---- Auto-refresh: pull fresh weather/zones/reports from the backend
     every 2 minutes, so new citizen reports (and any photo attached to
     them) show up without a manual page reload. ---- */
  setInterval(async ()=>{
    try{
      await initDB(city);
      db = getDB(city);
      renderAll();
      renderComplaintTable();
      renderFullAlerts();
    }catch(e){ console.warn('Auto-refresh failed:', e.message); }
  }, 120000);
})();
