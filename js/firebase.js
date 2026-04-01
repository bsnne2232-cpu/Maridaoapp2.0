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

// === STATE ===
let CU = null, selPro = null, selSvc = '', agreedPrice = 0, payMethod = 'card';
let chatSt = { msgs: 0, details: { what: false, where: false, when: false }, agreed: false, price: 0 };

// === AUTH STATE ===
auth.onAuthStateChanged(async u => {
  CU = u;
  if (u) {
    await db.collection('users').doc(u.uid).set({
      name: u.displayName || '', email: u.email,
      lastLogin: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  }
  updNav();
});

function updNav() {
  const a = document.getElementById('authBtns'), u = document.getElementById('userArea');
  if (CU) {
    a.style.display = 'none'; u.classList.add('show');
    const n = CU.displayName || CU.email.split('@')[0];
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
  try {
    await auth.signInWithPopup(new firebase.auth.GoogleAuthProvider());
    closeM('loginM'); closeM('signupM');
    toast('Login realizado! 🎉', 'ok');
  } catch (e) { toast('Erro: ' + e.message, 'err'); }
}

// === EMAIL LOGIN ===
async function emailLogin() {
  const em = document.getElementById('logEmail').value.trim(), pw = document.getElementById('logPass').value;
  if (!em) return showErr('logEmailErr', 'Digite seu e-mail');
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
  if (!nm) return toast('Preencha seu nome', 'err');
  if (!em) return showErr('sEmailErr', 'Digite seu e-mail');
  if (!cpf || cpf.replace(/\D/g, '').length < 11) return toast('CPF inválido', 'err');
  if (pw.length < 6) return showErr('sPassErr', 'Mínimo 6 caracteres');
  const b = document.querySelector('#sS1 .btn-primary'); b.disabled = true; b.innerHTML = '<span class="spinner"></span>';
  try {
    // Send CPF to backend for validation and masking
    const cpfRes = await fetch(API_URL + '/api/validate-cpf', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cpf })
    }).then(r => r.json());
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
  } catch (e) { toast(e.code === 'auth/email-already-in-use' ? 'E-mail já cadastrado' : e.message, 'err'); }
  b.disabled = false; b.textContent = 'Criar conta grátis →';
}
async function signupSubmit() { signupStep2(); }

// === LOGOUT ===
function logoutUser() {
  auth.signOut(); toast('Saiu da conta', 'ok');
  document.getElementById('userDd').classList.remove('show');
}

function showErr(id, m) { const e = document.getElementById(id); e.textContent = m; e.style.display = 'block'; }
function hideErr() { document.querySelectorAll('.ferr').forEach(e => e.style.display = 'none'); }
