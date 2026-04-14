// === GATEWAY FEES ===
// Só para EXIBIÇÃO no frontend. O cálculo real de taxa é re-validado no backend
// (Cloudflare Worker) antes de qualquer debito — o cliente NUNCA pode mexer no valor final.
function gwFee(m, a) {
  if (m === 'card') {
    if (a >= 200) return { r: .03, l: 'cartão 3%', f: Math.round(a * .03 * 100) / 100 };
    return { r: .0499, l: 'cartão ~5%', f: Math.round(a * .0499 * 100) / 100 };
  }
  if (m === 'pix') return { r: .0099, l: 'PIX ~1%', f: Math.round(a * .0099 * 100) / 100 };
  return { r: 0, l: 'boleto R$3,49', f: 3.49 };
}

// === COMMISSION RATE ===
// 8% — esse valor é apenas exibição; o backend recalcula e grava.
const MARIDAO_COMMISSION = 0.08;

// ┌──────────────────────────────────────────────────────────────────────┐
// │  TEST_MODE — mude para false quando integrar o Asaas em produção.   │
// │  Com true: pula validação de cartão, aceita qualquer método e gera  │
// │  códigos localmente se o Worker não responder. Perfeito para testar │
// │  o fluxo completo (pagamento → tracking → chegada → conclusão) sem  │
// │  cobrar ninguém.                                                    │
// └──────────────────────────────────────────────────────────────────────┘
const TEST_MODE = true;

// === UPDATE PAYMENT BREAKDOWN (DISPLAY ONLY) ===
function updPay() {
  const g = gwFee(payMethod, agreedPrice);
  const cl = Math.round((agreedPrice + g.f) * 100) / 100;
  const cm = Math.round(agreedPrice * MARIDAO_COMMISSION * 100) / 100;
  const nt = Math.round(agreedPrice * (1 - MARIDAO_COMMISSION) * 100) / 100;
  document.getElementById('pyTotal').textContent = 'R$ ' + agreedPrice.toFixed(2);
  document.getElementById('pyCliSvc').textContent = 'R$ ' + agreedPrice.toFixed(2);
  document.getElementById('pyGwLbl').textContent = '(' + g.l + ')';
  document.getElementById('pyGw').textContent = '+ R$ ' + g.f.toFixed(2);
  document.getElementById('pyCliFinal').textContent = 'R$ ' + cl.toFixed(2);
  document.getElementById('pyProSvc').textContent = 'R$ ' + agreedPrice.toFixed(2);
  document.getElementById('pyComm').textContent = '- R$ ' + cm.toFixed(2);
  document.getElementById('pyNet').textContent = 'R$ ' + nt.toFixed(2);
}

// === OPEN PAYMENT MODAL ===
function openPayM(pro, svc, total) {
  agreedPrice = total;
  document.getElementById('pyPro').textContent = pro;
  document.getElementById('pySvc').textContent = svc;
  payMethod = 'card'; updPay();
  document.querySelectorAll('.pay-tab').forEach(t => t.classList.remove('active'));
  document.querySelector('.pay-tab').classList.add('active');
  document.querySelectorAll('.parea').forEach(a => a.classList.remove('active'));
  document.getElementById('paCard').classList.add('active');
  openM('payM');
}

// === VALIDATE PAYMENT FORM ===
// IMPORTANTE: o frontend apenas coleta dados e valida formato.
// A criação da cobrança no Asaas, o débito e qualquer atualização de
// saldo/status no Firestore acontecem EXCLUSIVAMENTE no Cloudflare Worker.
// Mesmo que um usuário adultere esse arquivo via DevTools, o backend
// valida o Firebase ID Token, recalcula o valor e só então autoriza o split.
async function validateAndPay() {
  if (!CU) { toast('Faça login para continuar', 'err'); return; }
  if (!agreedPrice || agreedPrice <= 0) { toast('Valor inválido', 'err'); return; }
  if (!window.currentBookingId) { toast('Reserva não encontrada. Reabra o chat.', 'err'); return; }

  // Payload que será enviado ao backend. Nunca inclua valor, comissão ou status
  // computados no cliente — o Worker recalcula tudo com base no bookingId.
  const payload = {
    bookingId: window.currentBookingId,
    method: payMethod
  };

  if (payMethod === 'card' && !TEST_MODE) {
    const num = (document.getElementById('cardNum').value || '').replace(/\D/g, '');
    const exp = (document.getElementById('cardExp').value || '').trim();
    const cvv = (document.getElementById('cardCvv').value || '').replace(/\D/g, '');
    if (num.length < 13 || num.length > 16) return toast('Número do cartão inválido', 'err');
    if (!/^\d{2}\/\d{2}$/.test(exp)) return toast('Validade inválida (MM/AA)', 'err');
    const [mm, yy] = exp.split('/').map(Number);
    if (mm < 1 || mm > 12) return toast('Mês inválido', 'err');
    const now = new Date();
    const expDate = new Date(2000 + yy, mm);
    if (expDate <= now) return toast('Cartão vencido', 'err');
    if (cvv.length < 3) return toast('CVV inválido', 'err');
    payload.card = { number: num, exp, cvv };
  }

  const btn = document.getElementById('payConfirmBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Processando...'; }

  let res;
  try {
    const token = await CU.getIdToken();
    res = await safeFetch(API_URL + '/api/process-payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify(payload)
    }, 20000);
  } catch (e) {
    // Sem rede / worker indisponível → cai pro fluxo legado (confirmPay()
    // chamando /api/generate-codes). Isso mantém o app usável enquanto o
    // /api/process-payment não está deployado.
    console.warn('process-payment network fail, falling back:', e);
    if (btn) { btn.disabled = false; btn.textContent = 'Pagar agora →'; }
    confirmPay();
    return;
  }

  // 404 → endpoint ainda não deployado no Worker. Fallback para fluxo legado.
  if (res.status === 404) {
    console.warn('process-payment 404, falling back to legacy flow');
    if (btn) { btn.disabled = false; btn.textContent = 'Pagar agora →'; }
    confirmPay();
    return;
  }

  if (!res.ok) {
    if (btn) { btn.disabled = false; btn.textContent = 'Pagar agora →'; }
    let msg = 'Erro ao processar pagamento.';
    try {
      const err = await res.json();
      if (err && err.error) msg = err.error;
    } catch (_) {}
    if (res.status === 401 && (!msg || msg === 'Erro ao processar pagamento.')) msg = 'Sessão expirada. Faça login novamente.';
    if (res.status === 403) msg = 'Operação não autorizada.';
    if (res.status === 409) msg = 'Este serviço já foi pago.';
    if (res.status === 429) msg = 'Muitas tentativas. Aguarde alguns segundos.';
    if (res.status === 502) msg = 'Gateway de pagamento indisponível. Tente novamente.';
    toast(msg, 'err');
    return;
  }

  // Sucesso — o backend já gravou tudo no Firestore (status=payment_confirmed,
  // trackStatus=paid, arrCodeHash, compCode, compCodeHash) e já chamou Asaas
  // com o split. Aqui só avançamos a UI de tracking do cliente.
  let data = {};
  try { data = await res.json(); } catch (_) {}
  if (btn) { btn.disabled = false; btn.textContent = 'Pagar agora →'; }

  if (data && data.arrivalCode && data.completionCode && typeof startTrackingFromBackend === 'function') {
    startTrackingFromBackend(data.arrivalCode, data.completionCode);
  } else {
    // Backend respondeu 200 mas sem códigos? Não deveria acontecer — usa fallback.
    console.warn('process-payment ok without codes, using legacy UI');
    confirmPay();
  }
}

// === SELECT PAYMENT METHOD ===
function selPay(m, el) {
  payMethod = m;
  document.querySelectorAll('.pay-tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  document.querySelectorAll('.parea').forEach(a => a.classList.remove('active'));
  document.getElementById('pa' + m.charAt(0).toUpperCase() + m.slice(1)).classList.add('active');
  updPay();
}
