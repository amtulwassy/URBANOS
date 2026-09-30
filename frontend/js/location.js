/* ============ STATE -> CITY -> MICRO-ZONE PICKER ============ */
(function(){
  const session = requireSession('index.html');

  document.getElementById('loc-logout-btn').addEventListener('click', ()=>{
    clearSession(); window.location.href='index.html';
  });

  let selectedState = session.state || null;
  let selectedCity = session.city || null;

  const stepIndState = document.getElementById('step-ind-state');
  const stepIndCity = document.getElementById('step-ind-city');
  const stepIndZone = document.getElementById('step-ind-zone');
  const panelState = document.getElementById('panel-state');
  const panelCity = document.getElementById('panel-city');
  const panelZone = document.getElementById('panel-zone');

  function showPanel(which){
    [panelState,panelCity,panelZone].forEach(p=>p.classList.add('hidden'));
    [stepIndState,stepIndCity,stepIndZone].forEach(s=>s.classList.remove('active'));
    if(which==='state'){ panelState.classList.remove('hidden'); stepIndState.classList.add('active'); }
    if(which==='city'){ panelCity.classList.remove('hidden'); stepIndCity.classList.add('active'); }
    if(which==='zone'){ panelZone.classList.remove('hidden'); stepIndZone.classList.add('active'); }
  }

  function renderStateGrid(filter){
    const grid = document.getElementById('state-grid');
    grid.innerHTML = '';
    INDIA_STATES.filter(s=>!filter || s.toLowerCase().includes(filter.toLowerCase())).forEach(state=>{
      const btn = document.createElement('button');
      btn.className = 'loc-chip' + (state===selectedState ? ' active' : '');
      btn.textContent = state;
      btn.addEventListener('click', ()=>{
        selectedState = state;
        renderCityGrid();
        document.getElementById('city-title').textContent = 'Select your City in ' + state;
        showPanel('city');
      });
      grid.appendChild(btn);
    });
  }
  document.getElementById('state-search').addEventListener('input', (e)=>renderStateGrid(e.target.value));

  function renderCityGrid(){
    const grid = document.getElementById('city-grid');
    grid.innerHTML = '';
    const cities = STATE_CITIES[selectedState] || [];
    cities.forEach(city=>{
      const btn = document.createElement('button');
      btn.className = 'loc-chip' + (city===selectedCity ? ' active' : '');
      btn.textContent = city;
      btn.addEventListener('click', ()=>{
        selectedCity = city;
        renderZoneGrid();

document.getElementById('zone-title').textContent =
  'Select your Micro-zone in ' + city;

showPanel('zone');
      });
      grid.appendChild(btn);
    });
  }
  document.getElementById('back-to-state').addEventListener('click', ()=>showPanel('state'));
  document.getElementById('back-to-city').addEventListener('click', ()=>showPanel('city'));

  let selectedZone = null;
  function renderZoneGrid(){
    const grid = document.getElementById('zone-grid');
    grid.innerHTML = '';
    const zones = getZonesForCity(selectedCity);
    zones.forEach(zone=>{
      const btn = document.createElement('button');
      btn.className = 'loc-chip';
      btn.textContent = zone;
      btn.addEventListener('click', ()=>{
        selectedZone = zone;
        [...grid.children].forEach(c=>c.classList.remove('active'));
        btn.classList.add('active');
      });
      grid.appendChild(btn);
    });
  }
  document.getElementById('zone-continue-btn').addEventListener('click', ()=>{
    if(!selectedZone){ showToast('Please select a micro-zone', 'error'); return; }
    finish(selectedZone);
  });

  function finish(zone){
    saveSession({ state: selectedState, city: selectedCity, zone: zone });
    // ensure a per-city DB exists
    getDB(selectedCity);
    window.location.href = session.role === 'authority' ? 'authority.html' : 'citizen.html';
  }

  renderStateGrid();
  showPanel('state');
  if(selectedState){ renderCityGrid(); showPanel('city'); }
})();
