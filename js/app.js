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
  if (!reqLogin()) return;
  const sel = document.getElementById('bkSvc');
  for (let i = 0; i < sel.options.length; i++) {
    if (sel.options[i].text === s || (sel.options[i].text === 'Montagem de móveis' && s === 'Montagem')) {
      sel.selectedIndex = i; break;
    }
  }
  toggleCarreto(); bkGo(1); openM('bookM');
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

function renderPros() {
  const f = [PDB['Encanamento'][0], PDB['Elétrica'][0], PDB['Faxina'][0]];
  document.getElementById('prosGrid').innerHTML = f.map(p =>
    `<div class="pro-card"><div class="pro-hdr"><div class="pro-av">${esc(p.e)}</div><div><div class="pro-nm">${esc(p.n)}</div><div class="pro-rl">${esc(p.t[0])}</div></div></div><div class="pro-rt">★ ${esc(String(p.r))} (${esc(String(p.rv))})</div><div class="pro-tags">${p.t.map(t => `<span>${esc(t)}</span>`).join('')}</div><div class="pro-pr">A partir de <b>R$ ${esc(String(p.p))}</b></div><button class="btn-book" onclick="quickBook('${esc(p.n)}')">Agendar</button></div>`
  ).join('');
}

function quickBook(nm) {
  if (!reqLogin()) return;
  for (const [s, ps] of Object.entries(PDB)) {
    const f = ps.find(p => p.n === nm);
    if (f) { openChat(f, s); return; }
  }
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

function searchPros() {
  const svc = document.getElementById('bkSvc').value, isC = svc === 'Carreto';
  // VALIDATION
  if (!isC) {
    const a = document.getElementById('bkAddr').value.trim(), d = document.getElementById('bkDate').value, t = document.getElementById('bkTime').value;
    const m = []; if (!a) m.push('endereço'); if (!d) m.push('data'); if (!t) m.push('horário');
    if (m.length) { toast('Preencha: ' + m.join(', '), 'err'); return; }
    window.bkDetails = { svc, addr: a, date: d, time: t, desc: document.getElementById('bkDesc').value };
  } else {
    const f = document.getElementById('cFrom').value.trim(), t = document.getElementById('cTo').value.trim(), d = document.getElementById('cDate').value, tm = document.getElementById('cTime').value;
    const m = []; if (!f) m.push('cidade de retirada'); if (!t) m.push('cidade de entrega'); if (!d) m.push('data'); if (!tm) m.push('horário');
    if (m.length) { toast('Preencha: ' + m.join(', '), 'err'); return; }
    window.bkDetails = { svc, from: f, to: t, date: d, time: tm };
  }
  const pros = PDB[svc] || PDB['Faxina'];
  document.getElementById('prosCount').textContent = pros.length + ' encontrados';
  // Store pros for safe onclick (avoid inline JSON injection)
  window._searchPros = pros;
  document.getElementById('prosResults').innerHTML = pros.map((p, idx) => {
    const ph = (!isC && p.p) ? `<div style="font-weight:700;color:var(--p)">R$ ${esc(String(p.p))}</div>` : '';
    return `<div class="pro-result" style="display:flex;align-items:center;gap:14px;padding:14px;border:1px solid var(--border);border-radius:var(--rs);margin-bottom:10px;cursor:pointer;transition:all .2s" onclick="pickPro(window._searchPros[${idx}],'${esc(svc)}')" onmouseover="this.style.borderColor='var(--p)'" onmouseout="this.style.borderColor=''"><div style="width:44px;height:44px;border-radius:50%;background:var(--pl);display:flex;align-items:center;justify-content:center;font-size:1.2rem">${esc(p.e)}</div><div style="flex:1"><div style="font-weight:700">${esc(p.n)} ${p.top ? '⭐' : ''}</div><div style="font-size:.78rem;color:var(--text2)">${p.t.map(t => esc(t)).join(' · ')} · ${esc(p.d)}</div><div style="font-size:.82rem;color:var(--yellow);font-weight:600">★ ${esc(String(p.r))}</div></div>${ph}</div>`;
  }).join('');
  bkGo(2);
}

function pickPro(p, s) { selPro = p; selSvc = s; closeM('bookM'); openChat(p, s); }
