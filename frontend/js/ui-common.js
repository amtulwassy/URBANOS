/* ============ SHARED UI HELPERS (toast, modal, session) ============ */

function showToast(message, type){
  const root = document.getElementById('toast-root');
  if(!root) return;
  const el = document.createElement('div');
  el.className = 'toast' + (type ? ' ' + type : '');
  el.textContent = message;
  root.appendChild(el);
  setTimeout(()=>{ el.style.opacity='0'; el.style.transition='opacity .3s'; setTimeout(()=>el.remove(),300); }, 2600);
}

function openModal(id){
  const m = document.getElementById(id);
  if(m) m.classList.add('open');
}
function closeModal(id){
  const m = document.getElementById(id);
  if(m) m.classList.remove('open');
}
document.addEventListener('click', (e)=>{
  const closeBtn = e.target.closest('[data-close]');
  if(closeBtn){ closeModal(closeBtn.getAttribute('data-close')); }
  if(e.target.classList && e.target.classList.contains('modal-overlay')){
    e.target.classList.remove('open');
  }
});

/* ---- Session helpers ---- */
const SESSION_KEY = 'urbanos_session_v1';

function getSession(){
  try{ return JSON.parse(localStorage.getItem(SESSION_KEY)) || null; }
  catch(e){ return null; }
}
function saveSession(data){
  const current = getSession() || {};
  const merged = Object.assign({}, current, data);
  localStorage.setItem(SESSION_KEY, JSON.stringify(merged));
  return merged;
}
function clearSession(){
  localStorage.removeItem(SESSION_KEY);
  if(typeof clearToken === 'function') clearToken(); // also drops the JWT (see js/api.js)
}
function requireSession(redirectTo){
  const s = getSession();
  if(!s){ window.location.href = redirectTo || 'index.html'; return null; }
  return s;
}

/* ---- Complaint tracker stepper renderer ---- */
const REPORT_STAGES = [
  'Submitted',
  'Municipal (BMC) Review',
  'Contractor Assigned',
  'Worker Assigned',
  'Drainage Cleaning In Progress',
  'Resolved'
];
function renderStepper(currentStageIndex, timestamps){
  timestamps = timestamps || [];
  let html = '<ul class="stepper">';
  REPORT_STAGES.forEach((label, i)=>{
    let cls = '';
    if(i < currentStageIndex) cls = 'done';
    else if(i === currentStageIndex) cls = 'current';
    html += `<li class="${cls}"><span class="step-label">${label}</span>` +
      (timestamps[i] ? `<div class="step-time">${timestamps[i]}</div>` : '') + `</li>`;
  });
  html += '</ul>';
  return html;
}

/* ---- Precaution banner renderer ---- */
function renderPrecautionBanner(zoneName){
  return `<div class="precaution-banner">
    <span class="pb-icon">⚠️</span>
    <div>
      <strong>Early Warning — ${zoneName}</strong>
      <p>Simulated rainfall burst (+35mm over 6h) may escalate risk in your zone before it happens. Stay alert and avoid low-lying routes.</p>
    </div>
  </div>`;
}

function riskBadgeClass(level){
  switch((level||'').toLowerCase()){
    case 'low': return 'badge-low';
    case 'medium': case 'moderate': return 'badge-medium';
    case 'high': return 'badge-high';
    case 'critical': return 'badge-critical';
    default: return 'badge-neutral';
  }
}
function riskDotClass(level){
  switch((level||'').toLowerCase()){
    case 'low': return 'dot-low';
    case 'medium': case 'moderate': return 'dot-medium';
    case 'high': return 'dot-high';
    case 'critical': return 'dot-critical';
    default: return '';
  }
}
