/* ============ getUserMedia CAMERA CAPTURE (+ file-picker fallback) ============ */

let _cameraStream = null;

/*
 * Returns { ok:true } on success, or { ok:false, reason } on failure so the
 * caller can show a specific, useful message instead of a generic one.
 * reason is one of: 'unsupported' | 'denied' | 'nocamera' | 'busy' | 'insecure' | 'unknown'
 */
async function startCamera(videoEl){
  // Always stop any previous stream first — starting a new one while an old
  // one is still open is what makes the browser report the camera as busy
  // the next time it's requested.
  stopCamera();

  if(!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)){
    // file:// pages in Chrome/Edge are treated as a secure context and still work;
    // http (non-localhost) pages and some in-app browsers are the common failure case.
    const reason = (typeof window!=='undefined' && window.isSecureContext===false) ? 'insecure' : 'unsupported';
    return { ok:false, reason };
  }

  try{
    // Prefer the rear/back camera on phones, but don't hard-require it —
    // 'exact' constraints throw OverconstrainedError on laptops/desktops
    // that only have a single front-facing webcam.
    let stream;
    try{
      stream = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:{ ideal:'environment' } }, audio:false });
    }catch(innerErr){
      stream = await navigator.mediaDevices.getUserMedia({ video:true, audio:false });
    }
    _cameraStream = stream;
    videoEl.srcObject = stream;
    videoEl.muted = true;
    try{ await videoEl.play(); }catch(_playErr){ /* autoplay already handled by attribute */ }
    return { ok:true };
  }catch(e){
    console.warn('Camera unavailable, use file picker fallback', e);
    let reason = 'unknown';
    if(e && e.name){
      if(e.name==='NotAllowedError' || e.name==='SecurityError') reason='denied';
      else if(e.name==='NotFoundError' || e.name==='OverconstrainedError') reason='nocamera';
      else if(e.name==='NotReadableError' || e.name==='TrackStartError') reason='busy';
    }
    return { ok:false, reason };
  }
}

function stopCamera(videoEl){
  if(_cameraStream){
    _cameraStream.getTracks().forEach(t=>t.stop());
    _cameraStream = null;
  }
  // Detach so the browser releases the camera indicator immediately and the
  // <video> element doesn't keep showing the last frozen frame next time.
  if(videoEl) videoEl.srcObject = null;
}

function capturePhoto(videoEl, canvasEl, maxDim){
  maxDim = maxDim || 1280;
  const vw = videoEl.videoWidth || 640;
  const vh = videoEl.videoHeight || 480;
  // Cap the captured frame's longest side so a single photo stays small
  // enough for localStorage (full sensor resolution can be several MB and
  // silently fail to save, which is why a report's photo could vanish
  // before it ever reached the Authority dashboard).
  const scale = Math.min(1, maxDim / Math.max(vw, vh));
  const w = Math.max(1, Math.round(vw * scale));
  const h = Math.max(1, Math.round(vh * scale));
  canvasEl.width = w; canvasEl.height = h;
  const ctx = canvasEl.getContext('2d');
  ctx.drawImage(videoEl, 0, 0, w, h);
  return canvasEl.toDataURL('image/jpeg', 0.72);
}

// Downscales/recompresses an arbitrary image data URL (e.g. from a phone's
// file picker, which can easily be 3-8MB straight off the camera) so it's
// small enough to persist reliably. Falls back to the original data URL if
// decoding fails for any reason.
function resizeImageDataUrl(dataUrl, maxDim, quality){
  maxDim = maxDim || 1280; quality = quality || 0.72;
  return new Promise((resolve)=>{
    const img = new Image();
    img.onload = ()=>{
      const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(1, Math.round(img.naturalWidth * scale));
      const h = Math.max(1, Math.round(img.naturalHeight * scale));
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      try{ resolve(c.toDataURL('image/jpeg', quality)); }
      catch(e){ resolve(dataUrl); }
    };
    img.onerror = ()=>resolve(dataUrl);
    img.src = dataUrl;
  });
}

// Safety net: release the camera if the page is closed/refreshed/backgrounded
// while the stream is still open, so it's never left "busy" for next time.
if(typeof window !== 'undefined'){
  window.addEventListener('pagehide', ()=>stopCamera());
  window.addEventListener('beforeunload', ()=>stopCamera());
}

function readFileAsDataURL(file){
  return new Promise((resolve, reject)=>{
    const reader = new FileReader();
    reader.onload = ()=>resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
