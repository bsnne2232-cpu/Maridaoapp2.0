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
  btns.forEach(b => { b.disabled = true; b.innerHTML = '<span class="spinner"></span> Aguarde...'; });
  try {
    // SESSION persistence: usa sessionStorage em vez de indexedDB (mais confiável em Cloudflare)
    await auth.setPersistence(firebase.auth.Auth.Persistence.SESSION);
    await auth.signInWithRedirect(provider);
  } catch (e) {
    console.error('[Google Login] code:', e.code, '| msg:', e.message);
    const msgs = {
      'auth/unauthorized-domain': 'Domínio não autorizado no Firebase Console.',
      'auth/operation-not-allowed': 'Login com Google não está ativado no Firebase Console.',
      'auth/network-request-failed': 'Falha de rede. Verifique sua conexão.'
    };
    toast(msgs[e.code] || 'Erro ao iniciar login (' + (e.code || 'desconhecido') + ')', 'err');
    btns.forEach(b => { b.disabled = false; b.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg> Entrar com Google'; });
  }
}

// Captura resultado do redirect ao voltar do Google
auth.getRedirectResult().then(result => {
  if (result && result.user) {
    toast('Login realizado! 🎉', 'ok');
  }
}).catch(e => {
  console.error('[getRedirectResult] code:', e.code, '| msg:', e.message);
  if (e.code && e.code !== 'auth/no-auth-event') {
    toast('Erro no login com Google (' + e.code + ')', 'err');
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
