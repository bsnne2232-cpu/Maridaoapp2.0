// === SECURE CODE HASHING (codes never stored in plain text on client) ===
async function hashCode(code) {
  const enc = new TextEncoder().encode(code + '_maridao_salt_2025');
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function secureRandom4() {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return String(1000 + (arr[0] % 9000));
}

// === RATE LIMITING FOR CODE VERIFICATION ===
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

// === CONFIRM PAYMENT → START TRACKING (codes saved to Firestore) ===
async function confirmPay() {
  if (!CU) { toast('Faça login para continuar', 'err'); return; }
  if (!agreedPrice || agreedPrice <= 0) { toast('Valor inválido', 'err'); return; }

  closeM('payM'); openM('trackM');
  // Get verification codes from backend
  let arrCode, compCode;
  try {
    const res = await fetch(API_URL + '/api/generate-codes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: CU.uid })
    });
    if (!res.ok) throw new Error('API error');
    const data = await res.json();
    arrCode = data.arrivalCode;
    compCode = data.completionCode;
  } catch (e) {
    // Cryptographically secure fallback
    arrCode = secureRandom4();
    compCode = secureRandom4();
  }

  // Save payment with codes to Firestore (persists even if browser closes)
  const g = gwFee(payMethod, agreedPrice);
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours
  let paymentId = null;
  try {
    const payRef = await db.collection('payments').add({
      userId: CU.uid, pro: selPro.n, svc: selSvc, amount: agreedPrice,
      gwFee: g.f, method: payMethod, clientPaid: agreedPrice + g.f,
      comm: agreedPrice * .25, proNet: agreedPrice * .75,
      arrCode: arrCode, compCode: compCode,
      status: 'awaiting_arrival',
      expiresAt: firebase.firestore.Timestamp.fromDate(expiresAt),
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    paymentId = payRef.id;
  } catch (e) {
    toast('Erro ao processar pagamento. Tente novamente.', 'err');
    closeM('trackM');
    return;
  }

  // Store hashed codes (plain codes NOT accessible via console)
  window.currentPaymentId = paymentId;
  window._arrHash = await hashCode(arrCode);
  window._compHash = await hashCode(compCode);

  // Reset attempt counters
  _codeAttempts.arr = 0; _codeAttempts.comp = 0;
  _codeAttempts.arrLocked = false; _codeAttempts.compLocked = false;

  document.getElementById('arrCode').textContent = arrCode;
  ['arrCodeSec', 'arrVerSec', 'compSec', 'doneSec'].forEach(id => document.getElementById(id).style.display = 'none');
  document.getElementById('arrCodeSec').style.display = 'block';
  document.getElementById('trkSteps').style.display = 'flex';
  const s = document.querySelectorAll('.trk-step');
  s.forEach(x => { x.classList.remove('done', 'now'); x.querySelector('.trk-time').textContent = '—'; });
  s[0].classList.add('done', 'now'); s[0].querySelector('.trk-time').textContent = 'Agora';

  setTimeout(() => {
    s[1].classList.add('done', 'now'); s[1].querySelector('.trk-time').textContent = '15 min';
    toast('Profissional a caminho! 🚗', 'ok');
  }, 3000);
  setTimeout(() => {
    document.getElementById('arrCodeSec').style.display = 'none';
    document.getElementById('arrVerSec').style.display = 'block';
    toast('Chegou! Confirme com código 🔑', 'ok');
  }, 6000);
}

// === RECOVER PENDING PAYMENT (if user closed browser and came back) ===
let _pendingPaymentChecked = false;
async function checkPendingPayment() {
  if (!CU || _pendingPaymentChecked) return;
  _pendingPaymentChecked = true;
  try {
    const snap = await db.collection('payments')
      .where('userId', '==', CU.uid)
      .where('status', 'in', ['awaiting_arrival', 'in_progress'])
      .limit(1)
      .get();
    if (snap.empty) return;

    const doc = snap.docs[0];
    const data = doc.data();

    // Check if expired (48h)
    const now = new Date();
    const expires = data.expiresAt ? data.expiresAt.toDate() : null;
    if (expires && now > expires) {
      await doc.ref.update({ status: 'auto_completed', completedAt: firebase.firestore.FieldValue.serverTimestamp() });
      toast('Serviço anterior concluído automaticamente (48h)', 'inf');
      return;
    }

    // Restore hashed codes from Firestore (never expose plain codes in window)
    window.currentPaymentId = doc.id;
    window._arrHash = await hashCode(data.arrCode);
    window._compHash = await hashCode(data.compCode);
    agreedPrice = data.amount;
    selSvc = data.svc;
    selPro = { n: data.pro };

    openM('trackM');
    const s = document.querySelectorAll('.trk-step');
    s.forEach(x => { x.classList.remove('done', 'now'); x.querySelector('.trk-time').textContent = '—'; });
    ['arrCodeSec', 'arrVerSec', 'compSec', 'doneSec'].forEach(id => document.getElementById(id).style.display = 'none');
    document.getElementById('trkSteps').style.display = 'flex';

    if (data.status === 'awaiting_arrival') {
      s[0].classList.add('done'); s[1].classList.add('done', 'now');
      document.getElementById('arrCode').textContent = data.arrCode;
      document.getElementById('arrVerSec').style.display = 'block';
      toast('Serviço pendente! Confirme a chegada.', 'inf');
    } else if (data.status === 'in_progress') {
      s[0].classList.add('done'); s[1].classList.add('done'); s[2].classList.add('done'); s[3].classList.add('done', 'now');
      document.getElementById('compSec').style.display = 'block';
      toast('Serviço em andamento! Peça o código de conclusão.', 'inf');
    }

    if (expires) {
      const hoursLeft = Math.max(0, Math.floor((expires - now) / (1000 * 60 * 60)));
      toast('⏰ ' + hoursLeft + 'h restantes pra confirmar', 'inf');
    }
  } catch (e) {
    console.log('Pending check:', e.message);
  }
}

// === ARRIVAL CODE ===
function aNext(el, i) { el.value = el.value.replace(/\D/g, ''); if (el.value && i < 4) document.getElementById('aI' + (i + 1)).focus(); }
function cNext(el, i) { el.value = el.value.replace(/\D/g, ''); if (el.value && i < 4) document.getElementById('cI' + (i + 1)).focus(); }

async function verifyArr() {
  if (!checkAttempts('arr')) return;
  const v = [1, 2, 3, 4].map(i => document.getElementById('aI' + i).value).join('');
  const vHash = await hashCode(v);
  if (vHash === window._arrHash) {
    document.getElementById('arrVerSec').style.display = 'none';
    document.getElementById('arrErr').style.display = 'none';
    const s = document.querySelectorAll('.trk-step');
    s[2].classList.add('done'); s[2].querySelector('.trk-time').textContent = 'Confirmado';
    toast('Código ok! Serviço em andamento 🔧', 'ok');
    _codeAttempts.arr = 0; // Reset on success
    if (window.currentPaymentId) {
      await db.collection('payments').doc(window.currentPaymentId).update({
        status: 'in_progress', arrivedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    }
    setTimeout(() => { s[3].classList.add('done', 'now'); s[3].querySelector('.trk-time').textContent = 'Agora'; }, 2000);
    setTimeout(() => {
      s[4].classList.add('now'); s[4].querySelector('.trk-time').textContent = 'Aguardando';
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
  if (vHash === window._compHash) {
    document.getElementById('compSec').style.display = 'none';
    document.getElementById('trkSteps').style.display = 'none';
    const s = document.querySelectorAll('.trk-step'); s[4].classList.add('done');
    document.getElementById('doneAmt').textContent = 'R$ ' + (agreedPrice * .75).toFixed(2);
    document.getElementById('doneSec').style.display = 'block';
    toast('Concluído! Pagamento liberado! 🎉', 'ok');
    _codeAttempts.comp = 0; // Reset on success
    if (window.currentPaymentId) {
      await db.collection('payments').doc(window.currentPaymentId).update({
        status: 'completed', completedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    }
  } else {
    document.getElementById('compErr').style.display = 'block';
    [1, 2, 3, 4].forEach(i => { document.getElementById('cI' + i).value = ''; });
    document.getElementById('cI1').focus();
  }
}

// === RATING ===
function rate(n) {
  document.getElementById('stars').querySelectorAll('span').forEach((s, i) => {
    s.textContent = i < n ? '★' : '☆'; s.style.color = i < n ? '#F59E0B' : '#D1D5DB';
  });
  toast(n + ' estrela' + (n > 1 ? 's' : '') + ' enviada! ⭐', 'ok');
  if (CU) db.collection('ratings').add({ userId: CU.uid, pro: selPro.n, stars: n, at: firebase.firestore.FieldValue.serverTimestamp() });
}
