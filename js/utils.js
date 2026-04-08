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
  // CEP mask (pro form — bkCep is handled by onBkCepInput)
  if (e.target.id === 'proCep') {
    let v = e.target.value.replace(/\D/g, ''); if (v.length > 8) v = v.slice(0, 8);
    if (v.length > 5) v = v.slice(0, 5) + '-' + v.slice(5);
    e.target.value = v;
    // Trigger ViaCEP lookup quando completo
    if (v.replace(/\D/g, '').length === 8) onProCepComplete(v);
  }
});

// === CPF VALIDATION (algoritmo dígitos verificadores) ===
function validateCPF(cpf) {
  cpf = cpf.replace(/\D/g, '');
  if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false;
  let sum = 0, rem;
  for (let i = 0; i < 9; i++) sum += +cpf[i] * (10 - i);
  rem = (sum * 10) % 11; if (rem >= 10) rem = 0;
  if (rem !== +cpf[9]) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += +cpf[i] * (11 - i);
  rem = (sum * 10) % 11; if (rem >= 10) rem = 0;
  return rem === +cpf[10];
}

// === CEP LOOKUP via ViaCEP (gratuito, sem autenticação) ===
async function lookupCEP(cep) {
  const c = cep.replace(/\D/g, '');
  if (c.length !== 8) return null;
  try {
    const res = await fetch('https://viacep.com.br/ws/' + c + '/json/', { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const data = await res.json();
    return data.erro ? null : data;
  } catch (e) { return null; }
}

// === MISC ===
function heroSearchAction() {
  const q = document.getElementById('heroSearch').value.trim();
  if (!q) { openM('bookM'); return; }
  const qn = q.toLowerCase();
  const match = CATS.find(c => c.n.toLowerCase().includes(qn) || qn.includes(c.n.toLowerCase().split(' ')[0]));
  const sec = document.getElementById('profissionais');
  if (match) {
    // Usa filterSpec para mostrar especialidade específica (ou scroll para seção)
    const specLabel = match.n === 'Montagem' ? 'Montagem de móveis' : (match.n === 'Faxina' ? 'Faxina / Diarista' : match.n);
    if (typeof openSvc === 'function') { openSvc(match.n); return; }
    if (typeof filterSpec === 'function') filterSpec(specLabel);
  } else {
    // Busca por nome
    const nameInput = document.getElementById('prosNameSearch');
    if (nameInput) nameInput.value = q;
    if (typeof searchProsList === 'function') searchProsList();
  }
  if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
// showMyBookings() defined in chat.js
