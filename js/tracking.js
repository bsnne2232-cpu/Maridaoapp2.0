// === SECURE CODE HASHING (codes never stored in plain text on client) ===
async function hashCode(code) {
  const enc = new TextEncoder().encode(code + '_maridao_salt_2025');
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// === RATE LIMITING FOR CODE VERIFICATION ===
const trackingState = { currentPaymentId: null, arrHash: null, compHash: null };
const _codeAttempts = { arr: 0, comp: 0, arrLocked: false, compLocked: false };
const MAX_CODE_ATTEMPTS = 5;
const LOCKOUT_MS = 60000; // 1 minute lockout

function checkAttempts(type) {
  if (_codeAttempts[type + 'Locked']) {
    toast('Muitas tentativas. Aguarde 1 minuto.', 'err');
    return false;
  }
  _codeAttempts[type]++;
  if (_codeAttempts[type] >= MAX_CODE_ATTEMPTS) {
    _codeAttempts[type + 'Locked'] = true;
    setTimeout(() => { _codeAttempts[type] = 0; _codeAttempts[type + 'Locked'] = false; }, LOCKOUT_MS);
    toast('Limite de tentativas atingido. Aguarde 1 minuto.', 'err');
    return false;
  }
  return true;
}

// === CONFIRM PAYMENT → START TRACKING (compatible with current backend endpoints) ===
async function confirmPay() {
  if (!CU) { toast('Faça login para continuar', 'err'); return; }
  if (!agreedPrice || agreedPrice <= 0) { toast('Valor inválido', 'err'); return; }

  closeM('payM');
  openM('trackM');

  let arrCode = null, compCode = null;
  try {
    const res = await safeFetch(API_URL + '/api/generate-codes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: CU.uid })
    }, 12000);

    if (!res.ok) throw new Error('generate-codes failed');
    const data = await res.json();

    arrCode = String(data.arrivalCode || '');
    compCode = String(data.completionCode || '');

    if (!/^\d{4}$/.test(arrCode) || !/^\d{4}$/.test(compCode)) {
      throw new Error('invalid backend code payload');
    }
  } catch (_) {
    toast('Falha de segurança ao iniciar pagamento. Tente novamente.', 'err');
    closeM('trackM');
    return;
  }

  // Keep only hashed codes in memory; never persist plain codes
  trackingState.currentPaymentId = null;
  trackingState.arrHash = await hashCode(arrCode);
  trackingState.compHash = await hashCode(compCode);

  _codeAttempts.arr = 0; _codeAttempts.comp = 0;
  _codeAttempts.arrLocked = false; _codeAttempts.compLocked = false;

  document.getElementById('arrCode').textContent = arrCode;
  ['arrCodeSec', 'arrVerSec', 'compSec', 'doneSec'].forEach(id => document.getElementById(id).style.display = 'none');
  document.getElementById('arrCodeSec').style.display = 'block';
  document.getElementById('trkSteps').style.display = 'flex';
  const s = document.querySelectorAll('.trk-step');
  s.forEach(x => { x.classList.remove('done', 'now'); x.querySelector('.trk-time').textContent = '—'; });
  s[0].classList.add('done', 'now');
  s[0].querySelector('.trk-time').textContent = 'Agora';

  setTimeout(() => {
    s[1].classList.add('done', 'now');
    s[1].querySelector('.trk-time').textContent = '15 min';
    toast('Profissional a caminho! 🚗', 'ok');
  }, 3000);

  setTimeout(() => {
    document.getElementById('arrCodeSec').style.display = 'none';
    document.getElementById('arrVerSec').style.display = 'block';
    toast('Chegou! Confirme com código 🔑', 'ok');
  }, 6000);
}

// === RECOVER PENDING PAYMENT ===
// Sem endpoint de pendência no backend atual; evitamos reconstruir estado sensível.
async function checkPendingPayment() {
  return;
}

// === ARRIVAL CODE ===
function aNext(el, i) { el.value = el.value.replace(/\D/g, ''); if (el.value && i < 4) document.getElementById('aI' + (i + 1)).focus(); }
function cNext(el, i) { el.value = el.value.replace(/\D/g, ''); if (el.value && i < 4) document.getElementById('cI' + (i + 1)).focus(); }

async function verifyArr() {
  if (!checkAttempts('arr')) return;
  const v = [1, 2, 3, 4].map(i => document.getElementById('aI' + i).value).join('');
  const vHash = await hashCode(v);

  if (!trackingState.arrHash) {
    toast('Código não disponível nesta sessão. Inicie um novo fluxo de pagamento.', 'err');
    return;
  }

  if (vHash === trackingState.arrHash) {
    document.getElementById('arrVerSec').style.display = 'none';
    document.getElementById('arrErr').style.display = 'none';
    const s = document.querySelectorAll('.trk-step');
    s[2].classList.add('done');
    s[2].querySelector('.trk-time').textContent = 'Confirmado';
    toast('Código ok! Serviço em andamento 🔧', 'ok');
    _codeAttempts.arr = 0;

    setTimeout(() => {
      s[3].classList.add('done', 'now');
      s[3].querySelector('.trk-time').textContent = 'Agora';
    }, 2000);

    setTimeout(() => {
      s[4].classList.add('now');
      s[4].querySelector('.trk-time').textContent = 'Aguardando';
      document.getElementById('compSec').style.display = 'block';
      toast('Peça o código de conclusão ao profissional ✅', 'ok');
    }, 5000);
  } else {
    document.getElementById('arrErr').style.display = 'block';
    [1, 2, 3, 4].forEach(i => { document.getElementById('aI' + i).value = ''; });
    document.getElementById('aI1').focus();
  }
}

// === COMPLETION CODE ===
async function verifyComp() {
  if (!checkAttempts('comp')) return;
  const v = [1, 2, 3, 4].map(i => document.getElementById('cI' + i).value).join('');
  const vHash = await hashCode(v);

  if (!trackingState.compHash) {
    toast('Código não disponível nesta sessão. Inicie um novo fluxo de pagamento.', 'err');
    return;
  }

  // Optional backend validation (if endpoint supports this code type)
  try {
    await safeFetch(API_URL + '/api/verify-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: CU ? CU.uid : null, type: 'completion', code: v })
    }, 10000);
  } catch (_) {}

  if (vHash === trackingState.compHash) {
    document.getElementById('compSec').style.display = 'none';
    document.getElementById('trkSteps').style.display = 'none';
    const s = document.querySelectorAll('.trk-step');
    s[4].classList.add('done');
    document.getElementById('doneAmt').textContent = 'R$ ' + (agreedPrice * .75).toFixed(2);
    document.getElementById('doneSec').style.display = 'block';
    toast('Concluído! Pagamento liberado! 🎉', 'ok');
    _codeAttempts.comp = 0;
  } else {
    document.getElementById('compErr').style.display = 'block';
    [1, 2, 3, 4].forEach(i => { document.getElementById('cI' + i).value = ''; });
    document.getElementById('cI1').focus();
  }
}

// === RATING ===
function rate(n) {
  document.getElementById('stars').querySelectorAll('span').forEach((s, i) => {
    s.textContent = i < n ? '★' : '☆';
    s.style.color = i < n ? '#F59E0B' : '#D1D5DB';
  });
  toast(n + ' estrela' + (n > 1 ? 's' : '') + ' enviada! ⭐', 'ok');
  if (CU) db.collection('ratings').add({ userId: CU.uid, pro: selPro.n, stars: n, at: firebase.firestore.FieldValue.serverTimestamp() });
}
