/* ============ LOGIN PAGE LOGIC — now calls the real backend ============ */
(function(){
  let selectedRole = 'authority'; // maps to backend role AUTHORITY | USER

  const tabAuthority = document.getElementById('tab-authority');
  const tabCitizen = document.getElementById('tab-citizen');

  function setRole(role){
    selectedRole = role;
    if(role === 'authority'){
      tabAuthority.classList.add('active'); tabAuthority.setAttribute('aria-selected','true');
      tabCitizen.classList.remove('active'); tabCitizen.setAttribute('aria-selected','false');
    }else{
      tabCitizen.classList.add('active'); tabCitizen.setAttribute('aria-selected','true');
      tabAuthority.classList.remove('active'); tabAuthority.setAttribute('aria-selected','false');
    }
  }
  tabAuthority.addEventListener('click', ()=>setRole('authority'));
  tabCitizen.addEventListener('click', ()=>setRole('citizen'));
  setRole('authority');

  const pwInput = document.getElementById('password');
  const toggleBtn = document.getElementById('toggle-password');
  toggleBtn.addEventListener('click', ()=>{
    const isPw = pwInput.type === 'password';
    pwInput.type = isPw ? 'text' : 'password';
    toggleBtn.textContent = isPw ? '🙈' : '👁️';
  });

  function backendRole(){ return selectedRole === 'authority' ? 'AUTHORITY' : 'USER'; }

  // Logs in against the backend, auto-registering on first use so the demo
  // keeps its original "any email/password works" feel while still creating
  // a real, persisted account with a hashed password server-side.
  
  async function loginOrRegister(email, password, name){
  try{
    return await apiLogin(email, password);
  }catch(err){

    if(err.status !== 401){
      throw err;
    }

    try{
      await apiRegister(name, email, password, backendRole());
      return await apiLogin(email, password);
    }catch(regErr){

      if(regErr.status === 400){
        const wrongPw = new Error('Incorrect password for this email.');
        wrongPw.status = 401;
        throw wrongPw;
      }

      throw regErr;
    }
  }
}
  async function completeLogin({ email, password, name, isGoogle }){
    const submitBtn = document.querySelector('#login-form button[type="submit"]');
    if(submitBtn) submitBtn.disabled = true;
    try{
      const res = await loginOrRegister(email, password, name);
      saveToken(res.access_token);
      saveSession({
        role: selectedRole,
        email: res.user.email,
        name: res.user.name,
        userId: res.user.id,
        loggedInAt: Date.now()
      });
      showToast('Login successful — redirecting…', 'success');
      setTimeout(()=>{ window.location.href = 'location.html'; }, 500);
    }catch(err){
      if(err.status !== undefined){
        // The backend WAS reached and rejected the request (wrong password,
        // validation error, server bug, etc.) — this is a real failure, not
        // "offline". Show it and do NOT log the user in, otherwise a wrong
        // password would silently succeed via the offline fallback below.
        console.error('[URBANOS] Login rejected by backend:', err.status, err.message);
        showToast(err.message || 'Login failed — please check your email/password.', 'error');
        return;
      }
      // Only a genuine network failure (backend not running / unreachable)
      // falls back to local offline demo mode.
      console.error('[URBANOS] Backend unavailable:', err.message);
showToast('Server unavailable. Please start the backend and try again.', 'error');
return;
    }finally{
      if(submitBtn) submitBtn.disabled = false;
    }
  }

  document.getElementById('login-form').addEventListener('submit', (e)=>{ 
  e.preventDefault(); 

  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value.trim();

  if(!email || !password){
    showToast('Please enter your email and password.', 'error');
    return;
  }

  const name = selectedRole === 'authority' ? 'Duty Officer' : 'Citizen User';

  completeLogin({ email, password, name }); 
});

  document.getElementById('google-btn').addEventListener('click', ()=>{
    completeLogin({
      email: 'google.user@gmail.com',
      password: 'urbanos-google-demo',
      name: 'Google User',
      isGoogle: true
    });
  });

  document.getElementById('forgot-link').addEventListener('click', (e)=>{
    e.preventDefault();
    showToast('Password reset link sent (demo mode).');
  });
  document.getElementById('register-link').addEventListener('click', (e)=>{
    e.preventDefault();
    showToast('Enter any email & password above — an account is created automatically on first login.');
  });
})();
