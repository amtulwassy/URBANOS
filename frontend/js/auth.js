/* ============================================================
   URBANOS AUTHENTICATION
   Login + Registration
   ============================================================ */

(function(){

  let selectedRole = 'authority';
  let registerRole = 'USER';


  /* ============================================================
     LOGIN ROLE SELECTION
     ============================================================ */

  const tabAuthority = document.getElementById('tab-authority');
  const tabCitizen = document.getElementById('tab-citizen');


  function setRole(role){

    selectedRole = role;

    if(role === 'authority'){

      tabAuthority.classList.add('active');
      tabAuthority.setAttribute('aria-selected', 'true');

      tabCitizen.classList.remove('active');
      tabCitizen.setAttribute('aria-selected', 'false');

    }else{

      tabCitizen.classList.add('active');
      tabCitizen.setAttribute('aria-selected', 'true');

      tabAuthority.classList.remove('active');
      tabAuthority.setAttribute('aria-selected', 'false');

    }
  }


  tabAuthority.addEventListener('click', () => {
    setRole('authority');
  });


  tabCitizen.addEventListener('click', () => {
    setRole('citizen');
  });


  setRole('authority');


  function backendRole(){

    return selectedRole === 'authority'
      ? 'AUTHORITY'
      : 'USER';

  }


  /* ============================================================
     PASSWORD SHOW / HIDE
     ============================================================ */

  const pwInput = document.getElementById('password');
  const toggleBtn = document.getElementById('toggle-password');


  toggleBtn.addEventListener('click', () => {

    const isPassword = pwInput.type === 'password';

    pwInput.type = isPassword
      ? 'text'
      : 'password';

    toggleBtn.textContent = isPassword
      ? '🙈'
      : '👁️';

  });


  /* ============================================================
     LOGIN
     ============================================================ */

  async function loginOrRegister(
    email,
    password,
    name
  ){

    try{

      return await apiLogin(
        email,
        password
      );

    }catch(err){

      /*
       * If the backend says the account does not exist,
       * automatically register it.
       *
       * This preserves the existing URBANOS demo behaviour.
       */

      if(err.status !== 401){
        throw err;
      }


      try{

        await apiRegister(
          name,
          email,
          password,
          backendRole()
        );

        return await apiLogin(
          email,
          password
        );

      }catch(regErr){

        if(regErr.status === 400){

          const wrongPassword =
            new Error(
              'Incorrect password for this email.'
            );

          wrongPassword.status = 401;

          throw wrongPassword;

        }

        throw regErr;

      }

    }

  }


  /* ============================================================
     COMPLETE LOGIN
     ============================================================ */

  async function completeLogin({
    email,
    password,
    name
  }){

    const submitBtn =
      document.querySelector(
        '#login-form button[type="submit"]'
      );


    if(submitBtn){
      submitBtn.disabled = true;
    }


    try{

      const res =
        await loginOrRegister(
          email,
          password,
          name
        );


      /* Save JWT */

      saveToken(
        res.access_token
      );


      /* Save URBANOS session */

      saveSession({

        role: selectedRole,

        email: res.user.email,

        name: res.user.name,

        userId: res.user.id,

        loggedInAt: Date.now()

      });


      showToast(
        'Login successful — redirecting…',
        'success'
      );


      setTimeout(() => {

        window.location.href =
          'location.html';

      }, 500);


    }catch(err){

      console.error(
        '[URBANOS] Login error:',
        err
      );


      if(err.status !== undefined){

        showToast(
          err.message ||
          'Login failed. Please check your email and password.',
          'error'
        );

      }else{

        showToast(
          'Server unavailable. Please start the backend and try again.',
          'error'
        );

      }

    }finally{

      if(submitBtn){
        submitBtn.disabled = false;
      }

    }

  }


  /* ============================================================
     LOGIN FORM SUBMIT
     ============================================================ */

  document
    .getElementById('login-form')
    .addEventListener('submit', async (e) => {

      e.preventDefault();


      const email =
        document
          .getElementById('email')
          .value
          .trim();


      const password =
        document
          .getElementById('password')
          .value
          .trim();


      if(!email || !password){

        showToast(
          'Please enter your email and password.',
          'error'
        );

        return;

      }


      const name =
        selectedRole === 'authority'
          ? 'Duty Officer'
          : 'Citizen User';


      await completeLogin({

        email,
        password,
        name

      });

    });


  /* ============================================================
     REGISTER MODAL
     ============================================================ */

  const registerModal =
    document.getElementById('register-modal');

  const registerLink =
    document.getElementById('register-link');

  const registerClose =
    document.getElementById('register-close');

  const registerCancel =
    document.getElementById('register-cancel');


  function openRegister(){

    registerModal.classList.add('show');

    registerModal.setAttribute(
      'aria-hidden',
      'false'
    );


    document
      .getElementById('register-name')
      .focus();

  }


  function closeRegister(){

    registerModal.classList.remove('show');

    registerModal.setAttribute(
      'aria-hidden',
      'true'
    );

  }


  registerLink.addEventListener(
    'click',
    (e) => {

      e.preventDefault();

      openRegister();

    }
  );


  registerClose.addEventListener(
    'click',
    closeRegister
  );


  registerCancel.addEventListener(
    'click',
    closeRegister
  );


  /* Close when clicking outside the card */

  registerModal.addEventListener(
    'click',
    (e) => {

      if(e.target === registerModal){

        closeRegister();

      }

    }
  );


  /* Close with Escape */

  document.addEventListener(
    'keydown',
    (e) => {

      if(
        e.key === 'Escape' &&
        registerModal.classList.contains('show')
      ){

        closeRegister();

      }

    }
  );


  /* ============================================================
     REGISTER ROLE
     ============================================================ */

  const registerCitizen =
    document.getElementById(
      'register-citizen'
    );

  const registerAuthority =
    document.getElementById(
      'register-authority'
    );


  function setRegisterRole(role){

    registerRole = role;


    if(role === 'USER'){

      registerCitizen.classList.add(
        'active'
      );

      registerAuthority.classList.remove(
        'active'
      );

    }else{

      registerAuthority.classList.add(
        'active'
      );

      registerCitizen.classList.remove(
        'active'
      );

    }

  }


  registerCitizen.addEventListener(
    'click',
    () => {

      setRegisterRole('USER');

    }
  );


  registerAuthority.addEventListener(
    'click',
    () => {

      setRegisterRole('AUTHORITY');

    }
  );


  setRegisterRole('USER');


  /* ============================================================
     REAL REGISTRATION
     ============================================================ */

  document
    .getElementById('register-form')
    .addEventListener(
      'submit',
      async (e) => {

        e.preventDefault();


        const name =
          document
            .getElementById('register-name')
            .value
            .trim();


        const email =
          document
            .getElementById('register-email')
            .value
            .trim();


        const password =
          document
            .getElementById('register-password')
            .value;


        const confirmPassword =
          document
            .getElementById(
              'register-confirm-password'
            )
            .value;


        /* ================= VALIDATION ================= */

        if(!name){

          showToast(
            'Please enter your full name.',
            'error'
          );

          return;

        }


        if(!email){

          showToast(
            'Please enter your email address.',
            'error'
          );

          return;

        }


        if(!password){

          showToast(
            'Please create a password.',
            'error'
          );

          return;

        }


        if(password.length < 6){

          showToast(
            'Password must contain at least 6 characters.',
            'error'
          );

          return;

        }


        if(password !== confirmPassword){

          showToast(
            'Passwords do not match.',
            'error'
          );

          return;

        }


        const submitButton =
          document.getElementById(
            'register-submit'
          );


        submitButton.disabled = true;


        try{

          /*
           * Call the REAL FastAPI registration endpoint.
           */

          const res =
            await apiRegister(
              name,
              email,
              password,
              registerRole
            );


          /* ================= SAVE TOKEN ================= */

          saveToken(
            res.access_token
          );


          /* ================= SAVE SESSION ================= */

          const sessionRole =
            registerRole === 'AUTHORITY'
              ? 'authority'
              : 'citizen';


          saveSession({

            role: sessionRole,

            email: res.user.email,

            name: res.user.name,

            userId: res.user.id,

            loggedInAt: Date.now()

          });


          /* ================= SUCCESS ================= */

          showToast(
            'Account created successfully — redirecting…',
            'success'
          );


          closeRegister();


          setTimeout(() => {

            window.location.href =
              'location.html';

          }, 700);


        }catch(err){

          console.error(
            '[URBANOS] Registration error:',
            err
          );


          if(err.status !== undefined){

            showToast(
              err.message ||
              'Registration failed.',
              'error'
            );

          }else{

            showToast(
              'Server unavailable. Please start the backend and try again.',
              'error'
            );

          }

        }finally{

          submitButton.disabled = false;

        }

      }
    );


  /* ============================================================
     GOOGLE LOGIN
     ============================================================ */

  /* ============================================================
   GOOGLE LOGIN
   ============================================================ */



/* ============================================================
   REAL GOOGLE LOGIN
   ============================================================ */

const GOOGLE_CLIENT_ID =
  '1053975221953-qp4tusgsldgp1da7pdltufvmff2u6v4j.apps.googleusercontent.com';


async function loginWithGoogleCredential(credential){

  try{

    const response = await fetch(
      'http://127.0.0.1:8000/api/auth/google',
      {
        method: 'POST',

        headers: {
          'Content-Type': 'application/json'
        },

        body: JSON.stringify({
          credential: credential,
          role:
            selectedRole === 'authority'
              ? 'AUTHORITY'
              : 'USER'
        })
      }
    );

    const data = await response.json();

    if(!response.ok){
      throw new Error(
        data.detail || 'Google login failed.'
      );
    }

    saveToken(data.access_token);

    saveSession({
      role: selectedRole,
      email: data.user.email,
      name: data.user.name,
      userId: data.user.id,
      loggedInAt: Date.now()
    });

    showToast(
      'Google login successful — redirecting…',
      'success'
    );

    setTimeout(() => {
      window.location.href = 'location.html';
    }, 500);

  }catch(error){

    console.error(
      '[URBANOS] Google login error:',
      error
    );

    showToast(
      error.message || 'Google login failed.',
      'error'
    );
  }
}


/* ============================================================
   GOOGLE IDENTITY SERVICES INITIALIZATION
   ============================================================ */

function initializeGoogleLogin(){

  if(
    !window.google ||
    !window.google.accounts ||
    !window.google.accounts.id
  ){

    console.warn(
      '[URBANOS] Google Identity Services not loaded yet.'
    );

    setTimeout(
      initializeGoogleLogin,
      500
    );

    return;
  }


  google.accounts.id.initialize({

    client_id: GOOGLE_CLIENT_ID,

    callback: (response) => {

      console.log(
        '[URBANOS] Google credential received'
      );

      if(
        !response ||
        !response.credential
      ){

        showToast(
          'Google did not return a valid credential.',
          'error'
        );

        return;
      }

      loginWithGoogleCredential(
        response.credential
      );
    }

  });


  console.log(
    '[URBANOS] Google Identity Services initialized.'
  );
}


/* ============================================================
   GOOGLE BUTTON
   ============================================================ */

document
  .getElementById('google-btn')
  .addEventListener(
    'click',
    () => {

      console.log(
        '[URBANOS] Google button clicked'
      );

      if(
        !window.google ||
        !window.google.accounts ||
        !window.google.accounts.id
      ){

        showToast(
          'Google Login is still loading. Please try again.',
          'error'
        );

        return;
      }

      google.accounts.id.prompt();
    }
  );


initializeGoogleLogin();

/* ============================================================
   FORGOT PASSWORD
   ============================================================ */

// your existing forgot-password code


  /* ============================================================
     FORGOT PASSWORD
     ============================================================ */

  document
    .getElementById('forgot-link')
    .addEventListener(
      'click',
      (e) => {

        e.preventDefault();

        showToast(
          'Password reset is currently in demo mode.'
        );

      }
    );

})();