// === FIREBASE CONFIG ===
firebase.initializeApp({
  apiKey: "AIzaSyDzFg1cYsFbAkIiCbW26GM1vrYg2M7JCDU",
  authDomain: "maridaoapp-cbb4e.firebaseapp.com",
  projectId: "maridaoapp-cbb4e",
  storageBucket: "maridaoapp-cbb4e.firebasestorage.app",
  messagingSenderId: "817190352839",
  appId: "1:817190352839:web:7a9dd8196254a93bbd0be2"
});
const auth = firebase.auth(), db = firebase.firestore();
const API_URL = 'https://maridaoapi.bsnne2232.workers.dev';

async function getAuthHeaders(baseHeaders = {}) {
  const headers = { ...baseHeaders };
  if (CU) {
    try {
      const idToken = await CU.getIdToken(true);
      headers.Authorization = 'Bearer ' + idToken;
    } catch (_) {
      // If token retrieval fails, request will proceed without Authorization and fail on backend protected routes
    }
  }
  return headers;
}

async function safeFetch(url, options = {}, timeoutMs = 10000) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const baseHeaders = options.headers || {};
    const authHeaders = await getAuthHeaders(baseHeaders);
    const merged = {
      method: 'GET',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      ...options,
      headers: authHeaders,
      signal: ctrl.signal
    };
    return await fetch(url, merged);
  } finally {
    clearTimeout(id);
  }
}

// === STATE ===
let CU = null, selPro = null, selSvc = '', agreedPrice = 0, payMethod = 'card';
let chatSt = { msgs: 0, details: { what: false, where: false, when: false }, agreed: false, price: 0 };

// === AUTH STATE ===
auth.onAuthStateChanged(async u => {
  CU = u;
  if (u) {
    // Wrapped in try/catch — if Firestore write fails, updNav() still runs
    try {
      await db.collection('users').doc(u.uid).set({
        name: u.displayName || '', email: u.email,
        lastLogin: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    } catch (e) {
      console.warn('User record write failed (check Firestore rules):', e.code);
    }
  } else {
    if (typeof cleanupProDashboard === 'function') cleanupProDashboard();
    const btn = document.getElementById('proDashLink');
    if (btn) btn.style.display = 'none';
  }
  updNav();
  if (typeof initProForm === 'function') initProForm();
  if (typeof loadUserFavorites === 'function') loadUserFavorites();
  if (u && typeof checkIfProfessional === 'function') {
    checkIfProfessional().catch(e => console.error('Pro check error:', e));
  }
});

function updNav() {
  const a = document.getElementById('authBtns'), u = document.getElementById('userArea');
  if (CU) {
    a.style.display = 'none'; u.classList.add('show');
    const n = CU.displayName || (CU.email ? CU.email.split('@')[0] : 'U');
    document.getElementById('userAv').textContent = n.charAt(0).toUpperCase();
  } else {
    a.style.display = 'flex'; u.classList.remove('show');
  }
}

function reqLogin() {
  if (!CU) { openM('loginM'); toast('Faça login para continuar', 'err'); return false; }
  return true;
}

// === GOOGLE LOGIN ===
async function googleLogin() {
  const provider = new firebase.auth.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const btns = document.querySelectorAll('.btn-google');
  btns.forEach(b => { b.disabled = true; b.style.opacity = '.6'; });
  try {
    const result = await auth.signInWithPopup(provider);
    if (result && result.user) {
      closeM('loginM'); closeM('signupM');
      toast('Login realizado! 🎉', 'ok');
    }
  } catch (e) {
    const silent = ['auth/popup-closed-by-user', 'auth/cancelled-popup-request'];
    if (['auth/popup-blocked', 'auth/web-storage-unsupported'].includes(e.code)) {
      // Popup bloqueado — tenta redirect como fallback
      toast('Redirecionando para login...', 'inf');
      try {
        await auth.setPersistence(firebase.auth.Auth.Persistence.SESSION);
        await auth.signInWithRedirect(provider);
        return; // página vai navegar, não restaurar botões
      } catch (_) {}
    } else if (!silent.includes(e.code)) {
      console.error('[Google Login]', e.code, e.message);
      toast('Erro ao fazer login com Google. Tente novamente.', 'err');
    }
  }
  btns.forEach(b => { b.disabled = false; b.style.opacity = ''; });
}

// Captura resultado caso o popup tenha feito redirect internamente
auth.getRedirectResult().then(result => {
  if (result && result.user) {
    closeM('loginM'); closeM('signupM');
    toast('Login realizado! 🎉', 'ok');
  }
}).catch(e => {
  if (e.code && e.code !== 'auth/no-auth-event') {
    console.error('[getRedirectResult]', e.code, e.message);
  }
});



// === EMAIL LOGIN ===
async function emailLogin() {
  const em = document.getElementById('logEmail').value.trim(), pw = document.getElementById('logPass').value;
  if (!em) return showErr('logEmailErr', 'Digite seu e-mail');
  if (!isValidEmail(em)) return showErr('logEmailErr', 'E-mail inválido');
  if (!pw) return showErr('logPassErr', 'Digite sua senha');
  const b = document.getElementById('logBtn'); b.disabled = true; b.innerHTML = '<span class="spinner"></span> Entrando...';
  try {
    await auth.signInWithEmailAndPassword(em, pw);
    closeM('loginM'); toast('Bem-vindo! 👋', 'ok');
  } catch (e) { showErr('logEmailErr', 'E-mail ou senha incorretos'); }
  b.disabled = false; b.textContent = 'Entrar →';
}

// === EMAIL SIGNUP (CPF goes to backend, only masked version saved) ===
async function signupStep2() {
  const nm = document.getElementById('sName').value.trim(), em = document.getElementById('sEmail').value.trim();
  const cpf = document.getElementById('sCPF').value.trim(), pw = document.getElementById('sPass').value;
  hideErr();
  if (!nm || nm.length < 3) return toast('Nome deve ter ao menos 3 caracteres', 'err');
  if (nm.length > 100) return toast('Nome muito longo', 'err');
  if (!em) return showErr('sEmailErr', 'Digite seu e-mail');
  if (!isValidEmail(em)) return showErr('sEmailErr', 'E-mail inválido');
  if (!cpf || cpf.replace(/\D/g, '').length !== 11) return toast('CPF inválido', 'err');
  if (pw.length < 8) return showErr('sPassErr', 'Mínimo 8 caracteres');
  if (!/[A-Z]/.test(pw)) return showErr('sPassErr', 'Inclua ao menos uma letra maiúscula');
  if (!/[0-9]/.test(pw)) return showErr('sPassErr', 'Inclua ao menos um número');
  if (!/[^A-Za-z0-9]/.test(pw)) return showErr('sPassErr', 'Inclua ao menos um caractere especial');
  const b = document.querySelector('#sS1 .btn-primary'); b.disabled = true; b.innerHTML = '<span class="spinner"></span>';
  try {
    // Send CPF to backend for validation and masking
    let cpfResponse;
    try {
      cpfResponse = await safeFetch(API_URL + '/api/validate-cpf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cpf: cpf.replace(/\D/g, '') })
      }, 10000);
    } catch (e) {
      toast('Falha de conexão ao validar CPF. Tente novamente.', 'err');
      b.disabled = false; b.textContent = 'Criar conta grátis →';
      return;
    }
    if (!cpfResponse.ok) { toast('Erro ao validar CPF. Tente novamente.', 'err'); b.disabled = false; b.textContent = 'Criar conta grátis →'; return; }
    const cpfRes = await cpfResponse.json();
    if (!cpfRes.valid) { toast('CPF inválido', 'err'); b.disabled = false; b.textContent = 'Criar conta grátis →'; return; }
    // Create Firebase account
    const c = await auth.createUserWithEmailAndPassword(em, pw);
    await c.user.updateProfile({ displayName: nm });
    // Save ONLY masked CPF - full CPF never touches Firestore
    await db.collection('users').doc(c.user.uid).set({
      name: nm, email: em, cpfMasked: cpfRes.masked, role: 'client',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    closeM('signupM'); toast('Conta criada! 🎉', 'ok'); updNav();
  } catch (e) {
    const msgs = { 'auth/email-already-in-use': 'E-mail já cadastrado', 'auth/invalid-email': 'E-mail inválido', 'auth/weak-password': 'Senha muito fraca' };
    toast(msgs[e.code] || 'Erro ao criar conta. Tente novamente.', 'err');
  }
  b.disabled = false; b.textContent = 'Criar conta grátis →';
}
async function signupSubmit() { await signupStep2(); }

// === LOGOUT ===
function logoutUser() {
  auth.signOut();
  sessionStorage.removeItem('pendingChecked');
  toast('Saiu da conta', 'ok');
  document.getElementById('userDd').classList.remove('show');
}

function showErr(id, m) { const e = document.getElementById(id); e.textContent = m; e.style.display = 'block'; }
function hideErr() { document.querySelectorAll('.ferr').forEach(e => e.style.display = 'none'); }
