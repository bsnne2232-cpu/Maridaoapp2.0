// === CATEGORIES ===
const CATS = [
  { i: '🔧', n: 'Encanamento', c: '324' }, { i: '⚡', n: 'Elétrica', c: '518' },
  { i: '🧹', n: 'Faxina', c: '1.2k' }, { i: '🪟', n: 'Pintura', c: '280' },
  { i: '🛠️', n: 'Montagem', c: '412' }, { i: '❄️', n: 'Ar-condicionado', c: '195' },
  { i: '🌿', n: 'Jardinagem', c: '167' }, { i: '🔒', n: 'Chaveiro', c: '89' },
  { i: '🐾', n: 'Pet Sitter', c: '203' }, { i: '📦', n: 'Mudança', c: '140' },
  { i: '🚚', n: 'Carreto', c: '98' }
];

function renderCats() {
  document.getElementById('catGrid').innerHTML = CATS.map(c =>
    `<div class="cat-card" onclick="openSvc('${esc(c.n)}')"><div class="ic">${esc(c.i)}</div><div class="nm">${esc(c.n)}</div><div class="ct">${esc(c.c)} profissionais</div></div>`
  ).join('');
}

function openSvc(s) {
  // Filtra a seção de profissionais pela especialidade clicada
  const specFilter = document.getElementById('prosSpecFilter');
  if (specFilter) {
    const map = { 'Montagem': 'Montagem de móveis', 'Faxina': 'Faxina / Diarista' };
    const val = map[s] || s;
    for (let i = 0; i < specFilter.options.length; i++) {
      if (specFilter.options[i].value === val) { specFilter.selectedIndex = i; break; }
    }
    if (typeof searchProsList === 'function') searchProsList();
  }
  const sec = document.getElementById('profissionais');
  if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// === PROFESSIONALS DATABASE ===
const PDB = {
  'Faxina': [
    { n: 'Fernanda Costa', e: '🧹', r: 4.99, rv: 541, t: ['Faxina completa', 'Pós-obra'], p: 120, d: '1.8 km', top: 1 },
    { n: 'Beatriz Souza', e: '🧹', r: 4.91, rv: 287, t: ['Residencial', 'Escritório'], p: 100, d: '3.2 km' },
    { n: 'Marcos Lima', e: '🧹', r: 4.85, rv: 156, t: ['Pós-obra', 'Vidros'], p: 90, d: '4.5 km' }
  ],
  'Elétrica': [
    { n: 'Ana Lima', e: '⚡', r: 4.94, rv: 198, t: ['Curto-circuito', 'SPDA'], p: 100, d: '2.1 km', top: 1 },
    { n: 'Paulo Braga', e: '⚡', r: 4.88, rv: 145, t: ['Instalação', 'Manutenção'], p: 110, d: '3.8 km' },
    { n: 'Diego Matos', e: '⚡', r: 4.82, rv: 97, t: ['Residencial', 'Comercial'], p: 95, d: '5.0 km' }
  ],
  'Encanamento': [
    { n: 'Carlos Mendes', e: '🔧', r: 4.97, rv: 312, t: ['Vazamentos', 'Desentupimento'], p: 80, d: '1.2 km', top: 1 },
    { n: 'Roberto Dias', e: '🔧', r: 4.89, rv: 201, t: ['Caixa d\'água', 'Esgoto'], p: 90, d: '2.9 km' },
    { n: 'Thiago Nunes', e: '🔧', r: 4.83, rv: 134, t: ['Aquecedor', 'Tubulação'], p: 85, d: '4.1 km' }
  ],
  'Pintura': [
    { n: 'Josué Ferreira', e: '🎨', r: 4.95, rv: 267, t: ['Interna', 'Textura'], p: 150, d: '2.3 km', top: 1 },
    { n: 'Leandro Alves', e: '🎨', r: 4.87, rv: 189, t: ['Comercial', 'Acabamento'], p: 130, d: '3.7 km' },
    { n: 'Sandra Costa', e: '🎨', r: 4.80, rv: 112, t: ['Efeitos', 'Grafiato'], p: 140, d: '5.2 km' }
  ],
  'Montagem de móveis': [
    { n: 'Wagner Silva', e: '🛠️', r: 4.93, rv: 234, t: ['Planejados', 'IKEA'], p: 90, d: '1.9 km', top: 1 },
    { n: 'Felipe Santos', e: '🛠️', r: 4.86, rv: 167, t: ['Cozinha', 'Escritório'], p: 80, d: '3.4 km' },
    { n: 'Adriano Rocha', e: '🛠️', r: 4.79, rv: 98, t: ['Prateleiras', 'TV'], p: 70, d: '4.8 km' }
  ],
  'Ar-condicionado': [
    { n: 'Ricardo Gomes', e: '❄️', r: 4.96, rv: 289, t: ['Instalação', 'Limpeza'], p: 120, d: '2.0 km', top: 1 },
    { n: 'Marcelo Pinto', e: '❄️', r: 4.88, rv: 176, t: ['Split', 'Janela'], p: 100, d: '3.5 km' },
    { n: 'Daniel Souza', e: '❄️', r: 4.81, rv: 103, t: ['Comercial', 'Residencial'], p: 110, d: '5.3 km' }
  ],
  'Jardinagem': [
    { n: 'Dona Maria', e: '🌿', r: 4.94, rv: 312, t: ['Poda', 'Paisagismo'], p: 80, d: '1.5 km', top: 1 },
    { n: 'Jorge Barbosa', e: '🌿', r: 4.87, rv: 198, t: ['Horta', 'Manutenção'], p: 90, d: '3.0 km' },
    { n: 'Cláudia Reis', e: '🌿', r: 4.80, rv: 124, t: ['Vasos', 'Jardim vertical'], p: 85, d: '4.2 km' }
  ],
  'Chaveiro': [
    { n: 'Nilson Chaves', e: '🔒', r: 4.95, rv: 245, t: ['Abertura', 'Fechadura'], p: 70, d: '0.8 km', top: 1 },
    { n: 'André Lima', e: '🔒', r: 4.88, rv: 167, t: ['Automotivo', 'Cofre'], p: 80, d: '2.3 km' },
    { n: 'Paulo César', e: '🔒', r: 4.82, rv: 98, t: ['24h', 'Urgência'], p: 90, d: '3.7 km' }
  ],
  'Pet Sitter': [
    { n: 'Camila Lopes', e: '🐾', r: 4.97, rv: 356, t: ['Cães', 'Gatos', 'Passeio'], p: 60, d: '1.3 km', top: 1 },
    { n: 'Bruno Tavares', e: '🐾', r: 4.90, rv: 213, t: ['Dog walker', 'Hospedagem'], p: 50, d: '2.8 km' },
    { n: 'Juliana Melo', e: '🐾', r: 4.84, rv: 145, t: ['Banho', 'Tosa'], p: 55, d: '4.0 km' }
  ],
  'Mudança': [
    { n: 'Toninho Mudanças', e: '📦', r: 4.93, rv: 278, t: ['Residencial', 'Comercial'], p: 250, d: '2.5 km', top: 1 },
    { n: 'Marcos Frete', e: '📦', r: 4.86, rv: 189, t: ['Local', 'Interestadual'], p: 300, d: '3.9 km' },
    { n: 'Ana Transportes', e: '📦', r: 4.80, rv: 112, t: ['Pequenas mudanças'], p: 180, d: '5.1 km' }
  ],
  'Carreto': [
    { n: 'Zé do Carreto', e: '🚚', r: 4.96, rv: 345, t: ['Utilitário', 'Rápido'], d: '1.0 km', top: 1 },
    { n: 'Leandro Frete', e: '🚚', r: 4.89, rv: 198, t: ['Caminhão', 'Baú'], d: '2.7 km' },
    { n: 'Mário Transporte', e: '🚚', r: 4.83, rv: 134, t: ['Longa distância'], d: '4.3 km' }
  ]
};

// === FAVORITES STATE ===
let userFavorites = new Set();
let showingFavs = false;

async function loadUserFavorites() {
  if (!CU) { userFavorites = new Set(); return; }
  try {
    const doc = await db.collection('users').doc(CU.uid).get();
    const favs = (doc.exists && doc.data().favorites) ? doc.data().favorites : [];
    userFavorites = new Set(favs);
    // Atualiza corações já visíveis
    document.querySelectorAll('.fav-btn[data-pid]').forEach(btn => {
      const pid = btn.dataset.pid;
      btn.textContent = userFavorites.has(pid) ? '❤️' : '🤍';
      btn.classList.toggle('faved', userFavorites.has(pid));
    });
  } catch (e) { console.warn('Favorites load failed:', e); }
}

async function toggleFavorite(proId, proName) {
  if (!reqLogin()) return;
  const isFaved = userFavorites.has(proId);
  try {
    if (isFaved) {
      userFavorites.delete(proId);
      await db.collection('users').doc(CU.uid).update({
        favorites: firebase.firestore.FieldValue.arrayRemove(proId)
      });
      toast('Removido dos favoritos', 'ok');
    } else {
      userFavorites.add(proId);
      await db.collection('users').doc(CU.uid).update({
        favorites: firebase.firestore.FieldValue.arrayUnion(proId)
      });
      toast(proName + ' favoritado ❤️', 'ok');
    }
    const btn = document.querySelector('.fav-btn[data-pid="' + CSS.escape(proId) + '"]');
    if (btn) {
      btn.textContent = userFavorites.has(proId) ? '❤️' : '🤍';
      btn.classList.toggle('faved', userFavorites.has(proId));
    }
    if (showingFavs) renderFavoritesList();
  } catch (e) { toast('Erro ao atualizar favoritos', 'err'); }
}

function toggleFavFilter() {
  showingFavs = !showingFavs;
  const btn = document.getElementById('favFilterBtn');
  if (btn) {
    btn.textContent = showingFavs ? '❤️ Favoritos' : '🤍 Favoritos';
    btn.classList.toggle('active-fav', showingFavs);
  }
  if (showingFavs) renderFavoritesList();
  else searchProsList();
}

async function renderFavoritesList() {
  if (!CU) { reqLogin(); return; }
  const grid = document.getElementById('prosGrid');
  const emptyEl = document.getElementById('prosEmpty');
  const msgEl = document.getElementById('prosEmptyMsg');
  if (!grid) return;
  grid.innerHTML = '';
  if (userFavorites.size === 0) {
    if (emptyEl) emptyEl.style.display = 'block';
    if (msgEl) msgEl.textContent = 'Você ainda não favoritou nenhum profissional.';
    return;
  }
  if (emptyEl) emptyEl.style.display = 'none';
  // Busca cada favorito no Firestore (até 10)
  const pros = [];
  for (const pid of Array.from(userFavorites).slice(0, 10)) {
    if (pid.startsWith('static_')) {
      // É um pro estático do PDB
      const name = pid.replace('static_', '');
      for (const [spec, list] of Object.entries(PDB)) {
        const found = list.find(p => p.n === name);
        if (found) { pros.push({ _static: true, id: pid, name: found.n, spec, rate: found.p || 0, icon: found.e, rating: found.r, reviewCount: found.rv, dist: found.d, tags: found.t, top: found.top }); break; }
      }
    } else {
      try {
        const doc = await db.collection('professionals').doc(pid).get();
        if (doc.exists) pros.push({ id: doc.id, ...doc.data(), _fromFirestore: true });
      } catch (_) {}
    }
  }
  renderProCards(pros);
}

// === BUSCAR PROFISSIONAIS NA SEÇÃO PRINCIPAL ===
async function searchProsList() {
  showingFavs = false;
  const btn = document.getElementById('favFilterBtn');
  if (btn) { btn.textContent = '🤍 Favoritos'; btn.classList.remove('active-fav'); }

  const nameFilter = (document.getElementById('prosNameSearch') ? document.getElementById('prosNameSearch').value : '').trim().toLowerCase();
  const specFilter = document.getElementById('prosSpecFilter') ? document.getElementById('prosSpecFilter').value : '';

  const loadEl = document.getElementById('prosLoading');
  const emptyEl = document.getElementById('prosEmpty');
  const grid = document.getElementById('prosGrid');
  if (loadEl) loadEl.style.display = 'block';
  if (emptyEl) emptyEl.style.display = 'none';
  if (grid) grid.innerHTML = '';

  const pros = [];

  // Busca reais no Firestore (todos ativos, independente de docs)
  try {
    let q = db.collection('professionals').where('status', '==', 'active');
    if (specFilter) q = q.where('spec', '==', specFilter);
    const snap = await q.limit(24).get();
    snap.forEach(doc => {
      const d = doc.data();
      if (!nameFilter || (d.name || '').toLowerCase().includes(nameFilter)) {
        pros.push({ id: doc.id, ...d, _fromFirestore: true });
      }
    });
  } catch (e) { console.warn('Firestore pro search:', e); }

  // Fallback / complemento com dados estáticos do PDB
  if (pros.length < 6) {
    for (const [spec, list] of Object.entries(PDB)) {
      if (specFilter && spec !== specFilter) continue;
      for (const p of list) {
        if (nameFilter && !p.n.toLowerCase().includes(nameFilter)) continue;
        // Evita duplicata por nome
        if (pros.some(x => (x.name || x.n) === p.n)) continue;
        pros.push({ _static: true, id: 'static_' + p.n, name: p.n, spec, rate: p.p || 0, icon: p.e, rating: p.r, reviewCount: p.rv, dist: p.d, tags: p.t, top: p.top });
      }
    }
  }

  if (loadEl) loadEl.style.display = 'none';
  renderProCards(pros);
}

// === RENDERIZAR CARDS DE PROFISSIONAIS ===
function renderProCards(pros) {
  const grid = document.getElementById('prosGrid');
  const emptyEl = document.getElementById('prosEmpty');
  const msgEl = document.getElementById('prosEmptyMsg');
  if (!grid) return;
  grid.innerHTML = '';
  if (pros.length === 0) {
    if (emptyEl) emptyEl.style.display = 'block';
    if (msgEl) msgEl.textContent = 'Nenhum profissional encontrado.';
    return;
  }
  if (emptyEl) emptyEl.style.display = 'none';

  pros.forEach(p => {
    const pid = p.id || ('static_' + (p.name || p.n));
    const isFaved = userFavorites.has(pid);
    const name = p.name || p.n || '—';
    const spec = p.spec || '—';
    const rate = p.rate || p.p || 0;
    const icon = p.icon || p.e || '👤';
    const rating = p.rating || p.r || null;
    const reviews = p.reviewCount || p.rv || 0;
    const dist = p.dist || p.d || '';
    const tags = p.tags || (p.bio ? p.bio.split(',').slice(0, 3) : (p.t ? p.t : []));
    const isTop = p.top;

    const card = document.createElement('div');
    card.className = 'pro-card';

    const isVerified = p.docsStatus === 'approved';
    const isPending = p.docsStatus === 'pending';
    const verifiedBadge = isVerified ? ' ✅' : (isPending ? ' 🟡' : '');
    const tagsHtml = tags.slice(0, 3).map(t => '<span>' + esc(String(t).trim()) + '</span>').join('');
    const ratingHtml = rating ? '<div class="pro-rt">★ ' + esc(String(rating)) + (reviews ? ' <span style="font-weight:400;color:var(--text2)">(' + esc(String(reviews)) + ')</span>' : '') + '</div>' : '';
    const distHtml = dist ? '<div style="font-size:.78rem;color:var(--text2);margin-bottom:8px">📍 ' + esc(String(dist)) + '</div>' : '';
    const priceHtml = rate ? '<div class="pro-pr">A partir de <b>R$ ' + esc(String(rate)) + '</b></div>' : '';

    card.innerHTML =
      '<div class="pro-hdr">' +
        '<div class="pro-av">' + esc(String(icon)) + '</div>' +
        '<div style="flex:1;min-width:0">' +
          '<div class="pro-nm">' + esc(name) + (isTop ? ' ⭐' : '') + verifiedBadge + '</div>' +
          '<div class="pro-rl">' + esc(spec) + '</div>' +
        '</div>' +
        '<button class="fav-btn' + (isFaved ? ' faved' : '') + '" data-pid="' + esc(pid) + '" title="' + (isFaved ? 'Remover favorito' : 'Favoritar') + '">' + (isFaved ? '❤️' : '🤍') + '</button>' +
      '</div>' +
      ratingHtml +
      distHtml +
      '<div class="pro-tags">' + tagsHtml + '</div>' +
      priceHtml +
      '<button class="btn-book">Agendar →</button>';

    // Eventos via addEventListener (evita injeção inline)
    card.querySelector('.fav-btn').addEventListener('click', e => {
      e.stopPropagation();
      toggleFavorite(pid, name);
    });
    card.querySelector('.btn-book').addEventListener('click', () => quickBook(name, spec));

    grid.appendChild(card);
  });
}

function renderPros() { searchProsList(); }

function quickBook(nm, spec, proData) {
  if (!reqLogin()) return;
  // Guarda o profissional pré-selecionado para pular o passo 2
  window._preselectedPro = proData || null;
  window._preselectedProName = nm;
  window._preselectedProSpec = spec;

  // Atualiza botão do modal para indicar que o pro já está escolhido
  const bookBtn = document.querySelector('#bkS1 .btn-primary');
  if (bookBtn) {
    bookBtn.textContent = nm ? 'Agendar com ' + nm + ' →' : 'Buscar profissionais →';
  }

  // Pré-seleciona especialidade no select
  const sel = document.getElementById('bkSvc');
  if (sel && spec) {
    for (let i = 0; i < sel.options.length; i++) {
      if (sel.options[i].value === spec || sel.options[i].text === spec ||
          sel.options[i].text.toLowerCase().includes((spec || '').toLowerCase().split('/')[0].trim())) {
        sel.selectedIndex = i; break;
      }
    }
  }
  toggleCarreto(); bkGo(1); openM('bookM');
}

// === BOOKING FLOW ===
function bkGo(n) {
  document.querySelectorAll('#bookM .panel').forEach(p => p.classList.remove('active'));
  document.getElementById('bkS' + n).classList.add('active');
}

function toggleCarreto() {
  const c = document.getElementById('bkSvc').value === 'Carreto';
  document.getElementById('normalF').style.display = c ? 'none' : 'block';
  document.getElementById('carretoF').style.display = c ? 'block' : 'none';
}

function parseYMDToLocalDate(ymd) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== (m - 1) || dt.getDate() !== d) return null;
  dt.setHours(0, 0, 0, 0);
  return dt;
}

function validateScheduleDate(ymd) {
  const selected = parseYMDToLocalDate(ymd);
  if (!selected) return { ok: false, msg: 'Data inválida' };

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  // Regra solicitada: permitir somente hoje ou amanhã.
  // Bloqueia datas passadas e datas a partir de depois de amanhã.
  if (selected < today) {
    return { ok: false, msg: 'Não é permitido agendar para datas passadas' };
  }
  if (selected > tomorrow) {
    return { ok: false, msg: 'Só é permitido agendar para hoje ou amanhã' };
  }

  return { ok: true };
}

function searchPros() {
  const svc = document.getElementById('bkSvc').value, isC = svc === 'Carreto';
  if (!isC) {
    const a = document.getElementById('bkAddr').value.trim(), d = document.getElementById('bkDate').value, t = document.getElementById('bkTime').value;
    const m = []; if (!a) m.push('endereço'); if (!d) m.push('data'); if (!t) m.push('horário');
    if (m.length) { toast('Preencha: ' + m.join(', '), 'err'); return; }
    const dateCheck = validateScheduleDate(d);
    if (!dateCheck.ok) { toast(dateCheck.msg, 'err'); return; }
    window.bkDetails = { svc, addr: a, date: d, time: t, desc: document.getElementById('bkDesc').value };
  } else {
    const f = document.getElementById('cFrom').value.trim(), t = document.getElementById('cTo').value.trim(), d = document.getElementById('cDate').value, tm = document.getElementById('cTime').value;
    const m = []; if (!f) m.push('cidade de retirada'); if (!t) m.push('cidade de entrega'); if (!d) m.push('data'); if (!tm) m.push('horário');
    if (m.length) { toast('Preencha: ' + m.join(', '), 'err'); return; }
    const dateCheck = validateScheduleDate(d);
    if (!dateCheck.ok) { toast(dateCheck.msg, 'err'); return; }
    window.bkDetails = { svc, from: f, to: t, date: d, time: tm };
  }

  // Se tem profissional pré-selecionado, vai direto ao chat
  if (window._preselectedProName) {
    const nm = window._preselectedProName;
    const spec = window._preselectedProSpec || svc;
    window._preselectedProName = null;
    window._preselectedPro = null;
    window._preselectedProSpec = null;
    // Restaura texto do botão
    const bookBtn = document.querySelector('#bkS1 .btn-primary');
    if (bookBtn) bookBtn.textContent = 'Buscar profissionais →';
    // Monta objeto no formato esperado pelo chat
    const proObj = { n: nm, e: '👤', p: 100 };
    // Tenta achar no PDB para pegar ícone/preço
    for (const [s, list] of Object.entries(PDB)) {
      const found = list.find(p => p.n === nm);
      if (found) { proObj.e = found.e; proObj.p = found.p || 100; break; }
    }
    closeM('bookM');
    openChat(proObj, spec);
    return;
  }

  // Sem pro pré-selecionado: mostra lista do passo 2
  const pros = PDB[svc] || PDB['Faxina'];
  document.getElementById('prosCount').textContent = pros.length + ' encontrados';
  window._searchPros = pros;
  document.getElementById('prosResults').innerHTML = pros.map((p, idx) => {
    const ph = (!isC && p.p) ? `<div style="font-weight:700;color:var(--p)">R$ ${esc(String(p.p))}</div>` : '';
    return `<div class="pro-result" style="display:flex;align-items:center;gap:14px;padding:14px;border:1px solid var(--border);border-radius:var(--rs);margin-bottom:10px;cursor:pointer;transition:all .2s" onclick="pickPro(window._searchPros[${idx}],'${esc(svc)}')" onmouseover="this.style.borderColor='var(--p)'" onmouseout="this.style.borderColor=''"><div style="width:44px;height:44px;border-radius:50%;background:var(--pl);display:flex;align-items:center;justify-content:center;font-size:1.2rem">${esc(p.e)}</div><div style="flex:1"><div style="font-weight:700">${esc(p.n)} ${p.top ? '⭐' : ''}</div><div style="font-size:.78rem;color:var(--text2)">${p.t.map(t => esc(t)).join(' · ')} · ${esc(p.d)}</div><div style="font-size:.82rem;color:var(--yellow);font-weight:600">★ ${esc(String(p.r))}</div></div>${ph}</div>`;
  }).join('');
  bkGo(2);
}

function pickPro(p, s) { selPro = p; selSvc = s; closeM('bookM'); openChat(p, s); }
