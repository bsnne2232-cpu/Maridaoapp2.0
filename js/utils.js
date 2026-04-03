// === SANITIZE HTML (prevent XSS) ===
function esc(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

// === VALIDATE EMAIL ===
function isValidEmail(e) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
}

// === MODALS ===
function openM(id) { document.getElementById(id).classList.add('show'); document.body.style.overflow = 'hidden'; }
function closeM(id) {
  document.getElementById(id).classList.remove('show'); document.body.style.overflow = '';
  // Se o modal de rastreamento for fechado manualmente, não reabre na mesma sessão
  if (id === 'trackM') sessionStorage.setItem('pendingChecked', '1');
}
document.querySelectorAll('.mo').forEach(o => o.addEventListener('click', e => {
  if (e.target === o) {
    o.classList.remove('show'); document.body.style.overflow = '';
    if (o.id === 'trackM') sessionStorage.setItem('pendingChecked', '1');
  }
}));

// === TOAST ===
function toast(m, t = 'inf') {
  const e = document.getElementById('toast'); e.textContent = m;
  e.className = 'toast show ' + t;
  setTimeout(() => e.classList.remove('show'), 3500);
}

// === THEME ===
function toggleTheme() {
  const d = document.documentElement, n = d.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  d.setAttribute('data-theme', n);
  document.getElementById('themeBtn').textContent = n === 'dark' ? '☀️' : '🌙';
  try { localStorage.setItem('mt', n); } catch (e) {}
}

// === UPLOAD SIMULATION ===
function simUpload(id) {
  const e = document.getElementById(id); e.classList.add('uploaded');
  const l = e.querySelector('.ul'); if (l) l.textContent = '✅ Enviado!';
}

// === COPY TEXT ===
function copyTxt(id, btn) {
  navigator.clipboard.writeText(document.getElementById(id).textContent);
  btn.textContent = '✅ Copiado!'; btn.classList.add('ok');
  setTimeout(() => { btn.textContent = 'Copiar'; btn.classList.remove('ok'); }, 2000);
}

// === INPUT MASKS (global input listener) ===
document.addEventListener('input', e => {
  // CPF mask
  if (e.target.id === 'proCpf' || e.target.id === 'sCPF' || e.target.id === 'dCPF') {
    let v = e.target.value.replace(/\D/g, ''); if (v.length > 11) v = v.slice(0, 11);
    v = v.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
    e.target.value = v;
  }
  // Card number mask (0000 0000 0000 0000)
  if (e.target.id === 'cardNum') {
    let v = e.target.value.replace(/\D/g, ''); if (v.length > 16) v = v.slice(0, 16);
    e.target.value = v.replace(/(\d{4})(?=\d)/g, '$1 ');
  }
  // Card expiry mask (MM/AA)
  if (e.target.id === 'cardExp') {
    let v = e.target.value.replace(/\D/g, ''); if (v.length > 4) v = v.slice(0, 4);
    if (v.length >= 2) v = v.slice(0, 2) + '/' + v.slice(2);
    e.target.value = v;
  }
  // CVV - digits only
  if (e.target.id === 'cardCvv') {
    e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4);
  }
  // CEP mask
  if (e.target.id === 'proCep') {
    let v = e.target.value.replace(/\D/g, ''); if (v.length > 8) v = v.slice(0, 8);
    if (v.length > 5) v = v.slice(0, 5) + '-' + v.slice(5);
    e.target.value = v;
  }
});

// === MISC ===
function heroSearchAction() {
  if (!reqLogin()) return;
  const q = document.getElementById('heroSearch').value.toLowerCase();
  const m = CATS.find(c => norm(c.n).includes(norm(q)));
  if (m) openSvc(m.n); else openM('bookM');
}
function showMyBookings() { toast('Em breve: histórico!', 'inf'); }
