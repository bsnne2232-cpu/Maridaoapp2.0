// === GATEWAY FEES (uses backend API) ===
function gwFee(m, a) {
  if (m === 'card') {
    if (a >= 200) return { r: .03, l: 'cartão 3%', f: a * .03 };
    return { r: .0499, l: 'cartão ~5%', f: a * .0499 };
  }
  if (m === 'pix') return { r: .0099, l: 'PIX ~1%', f: a * .0099 };
  return { r: 0, l: 'boleto R$3,49', f: 3.49 };
}

// === UPDATE PAYMENT BREAKDOWN ===
function updPay() {
  const g = gwFee(payMethod, agreedPrice), cl = agreedPrice + g.f, cm = agreedPrice * .25, nt = agreedPrice * .75;
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
function validateAndPay() {
  if (payMethod === 'card') {
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
  }
  confirmPay();
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
