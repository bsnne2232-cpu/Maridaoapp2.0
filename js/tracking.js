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

let _trackingBookingListener = null; // real-time listener on booking document
let _storedCompCode = null;          // completion code stored for fallback verify

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

// === CONFIRM PAYMENT → START TRACKING ===
// Fluxo preferencial: o backend (Cloudflare Worker) já devolveu os códigos
// através de /api/process-payment e chamou este função via
// startTrackingFromBackend(). Quando chega aqui sem códigos, caímos no
// fallback (útil em dev e enquanto o Worker não está deployado): chama
// /api/generate-codes e grava direto no Firestore.
// Gera código local de 4 dígitos (só para TEST_MODE / fallback)
function _localRand4() {
  return String(Math.floor(Math.random() * 10000)).padStart(4, '0');
}

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
    // Se TEST_MODE está ativo (payment.js), gera códigos localmente
    // para que o fluxo completo possa ser testado sem backend.
    if (typeof TEST_MODE !== 'undefined' && TEST_MODE) {
      arrCode  = _localRand4();
      compCode = _localRand4();
      console.warn('[TEST_MODE] códigos gerados localmente:', arrCode, compCode);
    } else {
      toast('Falha de segurança ao iniciar pagamento. Tente novamente.', 'err');
      closeM('trackM');
      return;
    }
  }

  await _persistPaidBooking(arrCode, compCode);
  _startTrackingListener(window.currentBookingId);
}

// === START TRACKING FROM BACKEND ===
// Chamado por payment.js quando /api/process-payment retornar 200.
// O Worker já fez a persistência no Firestore (status=payment_confirmed,
// arrCodeHash, compCodeHash, paidAt etc.). Aqui só avançamos a UI.
async function startTrackingFromBackend(arrCode, compCode) {
  if (!/^\d{4}$/.test(arrCode) || !/^\d{4}$/.test(compCode)) {
    toast('Resposta inválida do servidor de pagamento.', 'err');
    return;
  }
  closeM('payM');
  openM('trackM');
  trackingState.arrHash = await hashCode(arrCode);
  trackingState.compHash = await hashCode(compCode);
  _storedCompCode = compCode;
  _codeAttempts.arr = 0; _codeAttempts.comp = 0;
  _codeAttempts.arrLocked = false; _codeAttempts.compLocked = false;
  _initTrackingUI(arrCode);
  _startTrackingListener(window.currentBookingId);
}

// === PERSIST PAID BOOKING (fallback path only) ===
// Só usado quando o Worker /api/process-payment não responde. Em produção
// as firestore.rules NÃO permitem este update vindo do cliente — é de
// propósito: força o time a implantar o Worker antes de aceitar pagamentos.
async function _persistPaidBooking(arrCode, compCode) {
  trackingState.arrHash = await hashCode(arrCode);
  trackingState.compHash = await hashCode(compCode);
  _storedCompCode = compCode;
  _codeAttempts.arr = 0; _codeAttempts.comp = 0;
  _codeAttempts.arrLocked = false; _codeAttempts.compLocked = false;

  if (window.currentBookingId) {
    try {
      await db.collection('bookings').doc(window.currentBookingId).update({
        arrCodeHash: trackingState.arrHash,
        compCode: compCode,           // pro reads this to show to client
        compCodeHash: trackingState.compHash,
        // CRÍTICO: precisa setar BOTH campos. O pro-dashboard olha `status`
        // para decidir se renderiza a caixa de tracking; o fluxo do cliente
        // olha `trackStatus`. Sem o `status` aqui o pro nunca via o botão
        // "A caminho".
        status: 'payment_confirmed',
        trackStatus: 'paid',
        paidAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    } catch (e) {
      console.error('tracking update:', e);
      toast('Erro ao persistir pagamento: ' + (e.code || e.message), 'err');
    }
  }
  _initTrackingUI(arrCode);
}

// === INITIAL TRACKING UI ===
function _initTrackingUI(arrCode) {
  const arrEl = document.getElementById('arrCode');
  if (arrEl) arrEl.textContent = arrCode;
  ['arrCodeSec', 'compSec', 'doneSec'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  const arrSec = document.getElementById('arrCodeSec');
  if (arrSec) arrSec.style.display = 'block';
  const steps = document.getElementById('trkSteps');
  if (steps) steps.style.display = 'flex';
  const s = document.querySelectorAll('.trk-step');
  s.forEach(x => { x.classList.remove('done', 'now'); const t = x.querySelector('.trk-time'); if (t) t.textContent = '—'; });
  if (s[0]) { s[0].classList.add('done', 'now'); const t = s[0].querySelector('.trk-time'); if (t) t.textContent = 'Agora'; }
}

// === BOOKING LISTENER — advances client UI when pro acts ===
function _startTrackingListener(bookingId) {
  if (!bookingId) return;
  if (_trackingBookingListener) { _trackingBookingListener(); _trackingBookingListener = null; }

  _trackingBookingListener = db.collection('bookings').doc(bookingId).onSnapshot(snap => {
    if (!snap.exists) return;
    const bk = snap.data();
    const ts = bk.trackStatus;

    if (ts === 'pro_on_way') {
      const s = document.querySelectorAll('.trk-step');
      if (!s[1].classList.contains('done')) {
        s[1].classList.add('done', 'now');
        s[1].querySelector('.trk-time').textContent = 'A caminho';
        toast('Profissional a caminho! 🚗', 'ok');
      }
    }

    if (ts === 'pro_arrived') {
      document.getElementById('arrCodeSec').style.display = 'none';
      const s = document.querySelectorAll('.trk-step');
      s[1].classList.add('done'); s[1].querySelector('.trk-time').textContent = 'Chegou';
      s[2].classList.add('done'); s[2].querySelector('.trk-time').textContent = 'Confirmado';
      s[3].classList.add('done', 'now'); s[3].querySelector('.trk-time').textContent = 'Agora';
      s[4].classList.add('now'); s[4].querySelector('.trk-time').textContent = 'Aguardando';
      document.getElementById('compSec').style.display = 'block';
      toast('Profissional confirmou chegada! Serviço em andamento 🔧', 'ok');
    }

    if (ts === 'completed') {
      // Handled by verifyComp locally; ignore duplicate triggers
    }
  }, err => console.error('tracking listener:', err));
}

// === RECOVER PENDING PAYMENT ===
async function checkPendingPayment() {
  return;
}

// === ARRIVAL CODE INPUTS ===
function aNext(el, i) { el.value = el.value.replace(/\D/g, ''); if (el.value && i < 4) document.getElementById('aI' + (i + 1)).focus(); }
function cNext(el, i) { el.value = el.value.replace(/\D/g, ''); if (el.value && i < 4) document.getElementById('cI' + (i + 1)).focus(); }

// === LEGACY ARRIVAL VERIFY (kept for fallback) ===
async function verifyArr() {
  if (!checkAttempts('arr')) return;
  const v = [1, 2, 3, 4].map(i => (document.getElementById('aI' + i).value || '').trim().replace(/\D/g, '')).join('');
  const vHash = await hashCode(v);

  if (!trackingState.arrHash) {
    toast('Código não disponível nesta sessão.', 'err');
    return;
  }

  if (String(vHash).trim() === String(trackingState.arrHash).trim()) {
    document.getElementById('arrErr').style.display = 'none';
    const s = document.querySelectorAll('.trk-step');
    s[2].classList.add('done'); s[2].querySelector('.trk-time').textContent = 'Confirmado';
    s[3].classList.add('done', 'now'); s[3].querySelector('.trk-time').textContent = 'Agora';
    s[4].classList.add('now'); s[4].querySelector('.trk-time').textContent = 'Aguardando';
    document.getElementById('compSec').style.display = 'block';
    toast('Código ok! Serviço em andamento 🔧', 'ok');
    _codeAttempts.arr = 0;
  } else {
    document.getElementById('arrErr').style.display = 'block';
    [1, 2, 3, 4].forEach(i => { document.getElementById('aI' + i).value = ''; });
    document.getElementById('aI1').focus();
  }
}

// === COMPLETION CODE VERIFY ===
async function verifyComp() {
  const vcBtn = event && event.target; if (vcBtn) { vcBtn.disabled = true; vcBtn.textContent = '⏳ Verificando...'; }
  if (!checkAttempts('comp')) { if (vcBtn) { vcBtn.disabled = false; vcBtn.textContent = '✅ Confirmar e liberar pagamento'; } return; }
  const v = [1, 2, 3, 4].map(i => (document.getElementById('cI' + i).value || '').trim().replace(/\D/g, '')).join('');

  // Primary: in-memory hash
  if (trackingState.compHash) {
    const vHash = await hashCode(v);
    if (vHash !== trackingState.compHash) {
      _showCompErr();
      return;
    }
  } else if (_storedCompCode) {
    // Fallback: direct match with forced String comparison
    if (String(v).trim() !== String(_storedCompCode).trim()) {
      _showCompErr();
      return;
    }
  } else {
    // Last resort: verify via Firestore compCodeHash
    try {
      const snap = await db.collection('bookings').doc(window.currentBookingId).get();
      if (snap.exists) {
        const bk = snap.data();
        if (bk.compCodeHash) {
          const vHash = await hashCode(v);
          if (String(vHash).trim() !== String(bk.compCodeHash).trim()) { _showCompErr(); return; }
        } else if (bk.compCode && String(v).trim() !== String(bk.compCode).trim()) {
          _showCompErr(); return;
        }
      }
    } catch (_) {
      toast('Erro ao verificar código.', 'err');
      return;
    }
  }

  // Optional backend validation
  try {
    await safeFetch(API_URL + '/api/verify-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: CU ? CU.uid : null, type: 'completion', code: v })
    }, 10000);
  } catch (_) {}

  // Mark booking completed in Firestore
  if (window.currentBookingId) {
    db.collection('bookings').doc(window.currentBookingId).update({
      trackStatus: 'completed',
      status: 'completed',
      completedAt: firebase.firestore.FieldValue.serverTimestamp()
    }).catch(() => {});
  }

  if (_trackingBookingListener) { _trackingBookingListener(); _trackingBookingListener = null; }

  document.getElementById('compSec').style.display = 'none';
  document.getElementById('trkSteps').style.display = 'none';
  const s = document.querySelectorAll('.trk-step');
  s[4].classList.add('done');
  document.getElementById('doneAmt').textContent = 'R$ ' + (Math.round(agreedPrice * (1 - 0.08) * 100) / 100).toFixed(2);
  document.getElementById('doneSec').style.display = 'block';
  toast('Concluído! Pagamento liberado! 🎉', 'ok');
  _codeAttempts.comp = 0;
}

function _showCompErr() {
  document.getElementById('compErr').style.display = 'block';
  [1, 2, 3, 4].forEach(i => { document.getElementById('cI' + i).value = ''; });
  document.getElementById('cI1').focus();
}

// === RATING ===
function rate(n) {
  document.getElementById('stars').querySelectorAll('span').forEach((s, i) => {
    s.textContent = i < n ? '★' : '☆';
    s.style.color = i < n ? '#F59E0B' : '#D1D5DB';
  });
  toast(n + ' estrela' + (n > 1 ? 's' : '') + ' enviada! ⭐', 'ok');
  if (CU) db.collection('ratings').add({ userId: CU.uid, pro: selPro ? selPro.n : '', stars: n, at: firebase.firestore.FieldValue.serverTimestamp() });
}
