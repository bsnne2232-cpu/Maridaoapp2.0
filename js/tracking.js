// === CONFIRM PAYMENT → START TRACKING ===
function confirmPay() {
  closeM('payM'); openM('trackM');
  window.arrCode = String(Math.floor(1000 + Math.random() * 9000));
  window.compCode = String(Math.floor(1000 + Math.random() * 9000));
  document.getElementById('arrCode').textContent = window.arrCode;
  ['arrCodeSec', 'arrVerSec', 'compSec', 'doneSec'].forEach(id => document.getElementById(id).style.display = 'none');
  document.getElementById('arrCodeSec').style.display = 'block';
  document.getElementById('trkSteps').style.display = 'flex';
  const s = document.querySelectorAll('.trk-step');
  s.forEach(x => { x.classList.remove('done', 'now'); x.querySelector('.trk-time').textContent = '—'; });
  s[0].classList.add('done', 'now'); s[0].querySelector('.trk-time').textContent = 'Agora';
  // Save to Firestore
  if (CU) {
    const g = gwFee(payMethod, agreedPrice);
    db.collection('payments').add({
      userId: CU.uid, pro: selPro.n, svc: selSvc, amount: agreedPrice,
      gwFee: g.f, method: payMethod, clientPaid: agreedPrice + g.f,
      comm: agreedPrice * .25, proNet: agreedPrice * .75,
      arrCode: window.arrCode, compCode: window.compCode,
      status: 'pending', at: firebase.firestore.FieldValue.serverTimestamp()
    });
  }
  // Simulate: professional on the way
  setTimeout(() => {
    s[1].classList.add('done', 'now'); s[1].querySelector('.trk-time').textContent = '15 min';
    toast('Profissional a caminho! 🚗', 'ok');
  }, 3000);
  // Simulate: professional arrives
  setTimeout(() => {
    document.getElementById('arrCodeSec').style.display = 'none';
    document.getElementById('arrVerSec').style.display = 'block';
    toast('Chegou! Confirme com código 🔑', 'ok');
  }, 6000);
}

// === ARRIVAL CODE ===
function aNext(el, i) { el.value = el.value.replace(/\D/g, ''); if (el.value && i < 4) document.getElementById('aI' + (i + 1)).focus(); }
function cNext(el, i) { el.value = el.value.replace(/\D/g, ''); if (el.value && i < 4) document.getElementById('cI' + (i + 1)).focus(); }

function verifyArr() {
  const v = [1, 2, 3, 4].map(i => document.getElementById('aI' + i).value).join('');
  if (v === window.arrCode) {
    document.getElementById('arrVerSec').style.display = 'none';
    document.getElementById('arrErr').style.display = 'none';
    const s = document.querySelectorAll('.trk-step');
    s[2].classList.add('done'); s[2].querySelector('.trk-time').textContent = 'Confirmado';
    toast('Código ok! Serviço em andamento 🔧', 'ok');
    setTimeout(() => { s[3].classList.add('done', 'now'); s[3].querySelector('.trk-time').textContent = 'Agora'; }, 2000);
    setTimeout(() => {
      s[4].classList.add('now'); s[4].querySelector('.trk-time').textContent = 'Aguardando';
      document.getElementById('compSec').style.display = 'block';
      toast('Peça o código de conclusão ao profissional ✅', 'ok');
      setTimeout(() => toast('🛠️ Código de conclusão: ' + window.compCode, 'ok'), 1500);
    }, 5000);
  } else {
    document.getElementById('arrErr').style.display = 'block';
    [1, 2, 3, 4].forEach(i => { document.getElementById('aI' + i).value = ''; });
    document.getElementById('aI1').focus();
  }
}

// === COMPLETION CODE ===
function verifyComp() {
  const v = [1, 2, 3, 4].map(i => document.getElementById('cI' + i).value).join('');
  if (v === window.compCode) {
    document.getElementById('compSec').style.display = 'none';
    document.getElementById('trkSteps').style.display = 'none';
    const s = document.querySelectorAll('.trk-step'); s[4].classList.add('done');
    document.getElementById('doneAmt').textContent = 'R$ ' + (agreedPrice * .75).toFixed(2);
    document.getElementById('doneSec').style.display = 'block';
    toast('Concluído! Pagamento liberado! 🎉', 'ok');
    if (CU) db.collection('payments').where('userId', '==', CU.uid).where('status', '==', 'pending').limit(1).get().then(sn => sn.forEach(d => d.ref.update({ status: 'completed' })));
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
