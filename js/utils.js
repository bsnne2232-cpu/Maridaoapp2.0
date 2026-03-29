// === MODALS ===
function openM(id) { document.getElementById(id).classList.add('show'); document.body.style.overflow = 'hidden'; }
function closeM(id) { document.getElementById(id).classList.remove('show'); document.body.style.overflow = ''; }
document.querySelectorAll('.mo').forEach(o => o.addEventListener('click', e => {
  if (e.target === o) { o.classList.remove('show'); document.body.style.overflow = ''; }
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

// === CPF MASK (global input listener) ===
document.addEventListener('input', e => {
  if (e.target.id === 'proCpf' || e.target.id === 'sCPF' || e.target.id === 'dCPF') {
    let v = e.target.value.replace(/\D/g, ''); if (v.length > 11) v = v.slice(0, 11);
    v = v.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
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
