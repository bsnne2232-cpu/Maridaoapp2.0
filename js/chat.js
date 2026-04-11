// === REFERENCE PRICE RANGES PER SERVICE (mercado BR) ===
const SVC_PRICE_RANGE = {
  'Faxina':              { min: 80,  fair: 160,  max: 400  },
  'Faxina / Diarista':   { min: 80,  fair: 160,  max: 400  },
  'Encanamento':         { min: 120, fair: 260,  max: 700  },
  'Elétrica':            { min: 120, fair: 260,  max: 700  },
  'Pintura':             { min: 200, fair: 500,  max: 1800 },
  'Montagem de móveis':  { min: 80,  fair: 180,  max: 450  },
  'Ar-condicionado':     { min: 150, fair: 320,  max: 900  },
  'Jardinagem':          { min: 100, fair: 210,  max: 550  },
  'Chaveiro':            { min: 80,  fair: 160,  max: 450  },
  'Pet Sitter':          { min: 60,  fair: 130,  max: 320  },
  'Mudança':             { min: 300, fair: 650,  max: 2200 },
  'Carreto':             { min: 150, fair: 320,  max: 900  },
};

// === PRICE GAUGE HTML BUILDER ===
function getPriceGaugeHTML(price, svc, side) {
  const range = SVC_PRICE_RANGE[svc] || { min: 60, fair: 200, max: 1000 };
  const pct = Math.min(98, Math.max(2, ((price - range.min) / (range.max - range.min)) * 100));

  let level, color, msg;
  if (price < range.min * 0.65) {
    level = 'Muito baixo'; color = '#EF4444';
    msg = side === 'client'
      ? '💡 Para um serviço de melhor qualidade, sugerimos aumentar o valor que está disposto a pagar.'
      : '⚠️ Valor muito abaixo do mercado. Pode ser difícil encontrar clientes com este preço.';
  } else if (price < range.min) {
    level = 'Abaixo do mercado'; color = '#F97316';
    msg = side === 'client'
      ? '💡 Valor um pouco baixo para este serviço. Aumentar as chances de um bom profissional aceitar.'
      : '💡 Valor abaixo da média do mercado. Considere revisar para atrair mais clientes.';
  } else if (price <= range.fair) {
    level = 'Justo'; color = '#10B981';
    msg = '✅ Ótimo! Valor dentro da faixa esperada para este serviço.';
  } else if (price <= range.max) {
    level = 'Acima da média'; color = '#3B82F6';
    msg = side === 'client'
      ? '👍 Valor generoso — atrai profissionais de alta qualidade.'
      : '👍 Valor competitivo — maior chance de fechar rapidamente.';
  } else {
    level = 'Premium'; color = '#8B5CF6';
    msg = '💎 Valor premium — serviço de alto padrão.';
  }

  return `<div class="price-gauge">
    <div style="display:flex;justify-content:space-between;font-size:.68rem;color:var(--text2);margin-bottom:3px">
      <span>Muito baixo</span><span>Justo (R$${range.fair})</span><span>Alto</span>
    </div>
    <div class="gauge-track">
      <div class="gauge-fill" style="width:${pct}%"></div>
      <div class="gauge-tip" style="left:${pct}%;background:${color}"></div>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:3px">
      <span style="font-size:.72rem;font-weight:700;color:${color}">${level}</span>
      <span style="font-size:.7rem;color:var(--text2)">Ref. mercado: R$${range.min}–R$${range.max}</span>
    </div>
    <div class="gauge-msg" style="color:${color}">${msg}</div>
  </div>`;
}

// === LIVE GAUGE UPDATE — CLIENT PRICE INPUT ===
function onClientPriceInput() {
  const val = parseFloat(document.getElementById('clientProposeVal').value);
  const gauge = document.getElementById('clientPriceGauge');
  if (!gauge) return;
  if (!val || val < 10) { gauge.innerHTML = ''; return; }
  gauge.innerHTML = getPriceGaugeHTML(val, selSvc || '', 'client');
}

// === SERVICE-SPECIFIC QUESTIONS ===
const SQ = {
  'Faxina': '📝 Pra calcular:\n1️⃣ Casa ou apto? Quantos cômodos?\n2️⃣ Quantos andares?\n3️⃣ Tem pet?\n4️⃣ Faxina completa ou parcial?\n5️⃣ Precisa de material?',
  'Encanamento': '📝 Me conta:\n1️⃣ Vazamento, entupimento ou instalação?\n2️⃣ Qual cômodo?\n3️⃣ Desde quando?\n4️⃣ Já tentou reparo?',
  'Elétrica': '📝 Preciso saber:\n1️⃣ Tomada, disjuntor, iluminação?\n2️⃣ Casa ou apto?\n3️⃣ É urgente?\n4️⃣ Material incluso?',
  'Pintura': '📝 Pra orçar:\n1️⃣ Interna ou externa?\n2️⃣ Quantos cômodos/m²?\n3️⃣ Precisa massa corrida?\n4️⃣ Tem tinta?\n5️⃣ Móveis pra mover?',
  'Montagem de móveis': '📝 Sobre a montagem:\n1️⃣ Que móvel?\n2️⃣ Quantas peças?\n3️⃣ Desmontar antigo?\n4️⃣ Andar? Elevador?',
  'Ar-condicionado': '📝 Me fala:\n1️⃣ Instalação ou manutenção?\n2️⃣ Split, janela ou central?\n3️⃣ BTUs?\n4️⃣ Suporte instalado?',
  'Jardinagem': '📝 Sobre o jardim:\n1️⃣ Poda, plantio ou manutenção?\n2️⃣ Tamanho da área?\n3️⃣ Tem ferramentas?\n4️⃣ Único ou periódico?',
  'Chaveiro': '📝 Situação:\n1️⃣ Residencial ou automotivo?\n2️⃣ Perdeu chave ou quebrou?\n3️⃣ Trocar fechadura?\n4️⃣ Urgência?',
  'Pet Sitter': '📝 Sobre o pet:\n1️⃣ Cão, gato?\n2️⃣ Porte?\n3️⃣ Quantas horas/dias?\n4️⃣ Passeio?\n5️⃣ Necessidade especial?',
  'Mudança': '📝 Pra calcular:\n1️⃣ Casa/apto? Andar?\n2️⃣ Elevador?\n3️⃣ Quantos cômodos?\n4️⃣ Itens pesados?\n5️⃣ Embalagem?',
  'Carreto': '📝 Transporte:\n1️⃣ O que transportar?\n2️⃣ Ajudante?\n3️⃣ Utilitário ou caminhão?\n4️⃣ Escada/elevador?'
};

// === BLOCKED PATTERNS ===
const BLOCK = [
  /\b\d{2}[\s.-]?\d{4,5}[\s.-]?\d{4}\b/, /whats\s*app/i, /wpp/i, /zap/i, /wts/i,
  /instagram/i, /insta/i, /@\w+/, /telegram/i, /face\s*book/i, /tik\s*tok/i,
  /\b[\w.-]+@[\w.-]+\.\w+\b/, /https?:\/\//i, /www\./i,
  /me\s+chama/i, /passa\s+(seu|teu)/i, /meu\s+(numero|telefone|cel|zap|whats|insta)/i
];

// === REAL-TIME CHAT STATE ===
let _chatListener = null;
let _seenMsgIds = new Set();
let _pendingSeqs = new Set(); // seqs de mensagens enviadas localmente (renderização otimista)
let _lastProPrice = 0; // último preço mencionado pelo profissional
let _bookingListener = null; // ouve mudanças no documento de booking (proposta do pro)

// === OPEN CHAT (CLIENT SIDE) ===
async function openChat(p, s) {
  selPro = p; selSvc = s;
  chatSt = { msgs: 0, details: { what: false, where: false, when: false }, agreed: false, price: 0, blindRevealed: false, revealDismissed: false };
  window.currentBookingId = null;
  _seenMsgIds = new Set();
  _pendingSeqs = new Set();
  _lastProPrice = 0;
  if (_chatListener) { _chatListener(); _chatListener = null; }
  if (_bookingListener) { _bookingListener(); _bookingListener = null; }

  document.getElementById('chatAv').textContent = p.e;
  document.getElementById('chatNm').textContent = p.n;
  document.getElementById('chatMsgs').innerHTML = '';
  document.getElementById('chatPay').classList.remove('show');
  openM('chatM');

  if (!CU) {
    addMsg('⚠️ Faça login para conversar com o profissional.', 'blk');
    return;
  }

  // Build address string for booking + initial summary
  const bk = window.bkDetails || {};
  let addr = bk.addr || '';
  if (!addr && bk.from && bk.to) addr = bk.from + ' → ' + bk.to;
  const userName = CU.displayName || (CU.email ? CU.email.split('@')[0] : 'Cliente');

  try {
    const ref = await db.collection('bookings').add({
      userId: CU.uid,
      userName: userName,
      userEmail: CU.email || '',
      proName: p.n,
      service: s,
      details: bk,
      addr: addr,
      status: 'chat',
      acceptedByPro: null,
      clientBudget: bk.budget || null,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    window.currentBookingId = ref.id;

    // Escuta documento de booking para capturar proposta do profissional em tempo real
    // e detectar quando o profissional definiu seu preço (negociação a cegas)
    _bookingListener = db.collection('bookings').doc(ref.id).onSnapshot(snap => {
      if (!snap.exists || chatSt.agreed) return;
      const bk = snap.data();

      // === NEGOCIAÇÃO A CEGAS: revela quando ambos definiram preço ===
      if (bk.clientBudget && bk.proBudget && !chatSt.blindRevealed) {
        chatSt.blindRevealed = true;
        showBlindNegoReveal(bk.clientBudget, bk.proBudget, s, 'client');
      }

      if (bk.lastProPosal && bk.lastProPosal !== _lastProPrice) {
        _lastProPrice = bk.lastProPosal;
        // Só mostra proposta rápida se reveal já foi dispensado
        if (chatSt.blindRevealed && chatSt.revealDismissed) showQuickAccept(_lastProPrice);
      }
      if (bk.agreedPrice) {
        chatSt.agreed = true; chatSt.price = bk.agreedPrice; agreedPrice = bk.agreedPrice;
        const qa = document.getElementById('chatQuickAccept');
        if (qa) qa.style.display = 'none';
        const br = document.getElementById('chatBlindReveal');
        if (br) br.style.display = 'none';
        document.getElementById('chatPay').classList.add('show');
        document.getElementById('cpPrice').textContent = 'R$ ' + bk.agreedPrice + ',00';
      }
    }, err => console.error('booking listener:', err));

    // Save initial system messages so professional can see context
    const t0 = Date.now();
    const initial = [];
    initial.push('💡 Descreva bem o serviço para um preço justo. O valor combinado não pode ser alterado depois.');

    let summary = '📋 Agendamento:\n• Cliente: ' + userName;
    summary += '\n• Serviço: ' + (bk.svc || s);
    if (addr) summary += '\n• Local: ' + addr;
    if (bk.date) summary += '\n• Data: ' + bk.date + (bk.time ? ' às ' + bk.time : '');
    if (bk.desc) summary += '\n• Obs: ' + bk.desc;
    initial.push(summary);

    initial.push('Oi! Preciso de ' + s.toLowerCase() + '. Aguardando o profissional 👋');
    if (SQ[s]) initial.push(SQ[s]);

    for (let i = 0; i < initial.length; i++) {
      db.collection('messages').add({
        bookingId: ref.id,
        text: initial[i],
        sender: 'sys',
        userId: CU.uid,
        seq: t0 + i,
        at: firebase.firestore.Timestamp.fromMillis(t0 + i)
      }).catch(e => console.error('initial msg error:', e));
    }

    // Real-time listener for ALL messages on this booking
    _chatListener = db.collection('messages')
      .where('bookingId', '==', ref.id)
      .onSnapshot(snap => renderChatSnapshot(snap), err => {
        console.error('chat listener:', err);
        if (err.code === 'permission-denied') addMsg('⚠️ Sem permissão para acessar mensagens. Verifique as regras do Firestore.', 'blk');
      });
  } catch (e) {
    console.error('openChat error:', e);
    addMsg('⚠️ Erro ao iniciar chat. Tente novamente.', 'blk');
  }
}

// === RENDER NEW MESSAGES FROM SNAPSHOT ===
function renderChatSnapshot(snap) {
  const docs = [];
  snap.forEach(doc => docs.push({ id: doc.id, ...doc.data() }));
  docs.sort((a, b) => (a.seq || 0) - (b.seq || 0));
  docs.forEach(d => {
    if (_seenMsgIds.has(d.id)) return;
    _seenMsgIds.add(d.id);
    // Mensagem já renderizada otimisticamente (o cliente enviou)
    if (d.sender === 'user' && d.userId === (CU && CU.uid) && _pendingSeqs.has(d.seq)) {
      _pendingSeqs.delete(d.seq);
      return; // já está no DOM
    }
    let cls;
    if (d.sender === 'sys') cls = 'sys';
    else if (d.sender === 'user') cls = 'sent';
    else cls = 'recv'; // pro
    // Detecta proposta do profissional e mostra botão de aceite
    if (d.sender === 'pro' && !chatSt.agreed) {
      // Prioridade 1: formato da proposta formal "💰 Proposta: R$ X,00"
      const formalMatch = d.text.match(/Proposta[:\s]+R?\$?\s*(\d+)/i);
      // Prioridade 2: "R$ X" ou "X reais"
      const priceMatch = d.text.match(/R\$\s*(\d+)|(\d+)\s*reais/i);
      // Prioridade 3: qualquer número >= 10
      const anyNum = d.text.match(/\b(\d{2,})\b/);
      const proPrice = formalMatch ? parseInt(formalMatch[1])
        : priceMatch ? parseInt(priceMatch[1] || priceMatch[2])
        : anyNum ? parseInt(anyNum[1]) : 0;
      if (proPrice >= 10) {
        _lastProPrice = proPrice;
        showQuickAccept(proPrice);
      }
    }
    addMsg(d.text, cls);
  });
}

// ============================================================
// === NEGOCIAÇÃO A CEGAS — REVEAL DOS DOIS VALORES =========
// ============================================================

function showBlindNegoReveal(clientBudget, proBudget, svc, side) {
  const revealId = side === 'client' ? 'chatBlindReveal' : 'proBlindReveal';
  const el = document.getElementById(revealId);
  if (!el) return;

  const fair = Math.round((clientBudget + proBudget) / 2);
  const fairMin = Math.round(fair * 0.92);
  const fairMax = Math.round(fair * 1.08);
  const range = SVC_PRICE_RANGE[svc] || { min: 60, fair: 200, max: 1000 };

  // Posição do valor justo no termômetro
  const pct = Math.min(96, Math.max(4, ((fair - range.min) / (range.max - range.min)) * 100));
  let fairColor = '#10B981';
  if (fair < range.min * 0.65) fairColor = '#EF4444';
  else if (fair < range.min) fairColor = '#F97316';
  else if (fair > range.max) fairColor = '#8B5CF6';
  else if (fair > range.fair) fairColor = '#3B82F6';

  const gap = Math.abs(proBudget - clientBudget);
  const gapPct = Math.round((gap / Math.max(clientBudget, proBudget)) * 100);

  let gapMsg = '';
  if (gapPct <= 15) gapMsg = '✅ Valores muito próximos! Boa chance de acordo.';
  else if (gapPct <= 35) gapMsg = '💬 Diferença moderada — o valor justo está no meio.';
  else gapMsg = '⚠️ Diferença grande — considere o valor justo como ponto de partida.';

  const clientLabel = side === 'client' ? '💰 Você ofereceu' : '💰 Cliente ofereceu';
  const proLabel    = side === 'client' ? '🔧 Profissional quer' : '🔧 Você quer';
  const clientVal   = side === 'client' ? clientBudget : clientBudget;
  const proVal      = side === 'client' ? proBudget    : proBudget;

  const acceptFn   = side === 'client' ? 'acceptFairPrice(' + fair + ')' : 'proAcceptFairReveal(' + fair + ')';
  const negotiateFn = side === 'client' ? 'negotiateInChat()' : 'proNegotiateInChat()';
  const rejectFn   = side === 'client' ? 'clientRejectReveal(' + proBudget + ')' : 'proRejectReveal(' + clientBudget + ')';

  el.style.display = 'block';
  el.innerHTML =
    '<div style="font-size:.7rem;font-weight:800;color:var(--p);letter-spacing:.8px;margin-bottom:8px">🎭 NEGOCIAÇÃO A CEGAS — REVELAÇÃO</div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">' +
      '<div style="background:var(--bg);border-radius:var(--rs);padding:10px;text-align:center">' +
        '<div style="font-size:.68rem;color:var(--text2);margin-bottom:4px">' + clientLabel + '</div>' +
        '<div style="font-size:1.3rem;font-weight:800;color:var(--p)">R$ ' + clientVal + '</div>' +
      '</div>' +
      '<div style="background:var(--bg);border-radius:var(--rs);padding:10px;text-align:center">' +
        '<div style="font-size:.68rem;color:var(--text2);margin-bottom:4px">' + proLabel + '</div>' +
        '<div style="font-size:1.3rem;font-weight:800;color:#F97316">R$ ' + proVal + '</div>' +
      '</div>' +
    '</div>' +
    '<div style="background:var(--bg);border-radius:var(--rs);padding:10px;margin-bottom:8px">' +
      '<div style="font-size:.68rem;color:var(--text2);margin-bottom:4px;text-align:center">⚖️ VALOR JUSTO SUGERIDO</div>' +
      '<div style="font-size:1.4rem;font-weight:800;color:' + fairColor + ';text-align:center;margin-bottom:8px">' +
        'R$ ' + fairMin + ' – R$ ' + fairMax +
      '</div>' +
      '<div style="display:flex;justify-content:space-between;font-size:.64rem;color:var(--text2);margin-bottom:3px">' +
        '<span>Muito baixo</span><span>Justo (R$' + range.fair + ')</span><span>Alto</span>' +
      '</div>' +
      '<div class="gauge-track">' +
        '<div class="gauge-fill" style="width:' + pct + '%"></div>' +
        '<div class="gauge-tip" style="left:' + pct + '%;background:' + fairColor + '"></div>' +
      '</div>' +
      '<div style="font-size:.72rem;color:var(--text2);margin-top:6px;text-align:center">' + gapMsg + '</div>' +
    '</div>' +
    '<div class="nego-actions">' +
      '<button class="nego-btn nego-accept" onclick="' + acceptFn + '">✅ Aceitar justo</button>' +
      '<button class="nego-btn nego-counter" onclick="' + negotiateFn + '">💬 Negociar</button>' +
      '<button class="nego-btn nego-reject" onclick="' + rejectFn + '">❌ Recusar</button>' +
    '</div>';
}

// === CLIENTE ACEITA O VALOR JUSTO ===
function acceptFairPrice(fair) {
  if (chatSt.agreed || !window.currentBookingId || !CU) return;
  chatSt.agreed = true; chatSt.price = fair; agreedPrice = fair;
  const el = document.getElementById('chatBlindReveal');
  if (el) el.style.display = 'none';
  document.getElementById('chatPay').classList.add('show');
  document.getElementById('cpPrice').textContent = 'R$ ' + fair + ',00';
  const msg = '✅ Aceito o valor justo de R$ ' + fair + ',00!';
  const seq = Date.now();
  _pendingSeqs.add(seq);
  addMsg(msg, 'sent');
  db.collection('messages').add({ bookingId: window.currentBookingId, text: msg, sender: 'user', userId: CU.uid, seq, at: firebase.firestore.FieldValue.serverTimestamp() }).catch(() => {});
  db.collection('bookings').doc(window.currentBookingId).update({ agreedPrice: fair, status: 'payment_pending', priceAgreedAt: firebase.firestore.FieldValue.serverTimestamp() }).catch(() => {});
}

// === CLIENTE ABRE CHAT NORMAL (dispensar reveal) ===
function negotiateInChat() {
  chatSt.revealDismissed = true;
  const el = document.getElementById('chatBlindReveal');
  if (el) el.style.display = 'none';
  toast('Negocie livremente no chat 💬', 'ok');
}

// === CLIENTE REJEITA — pede mínimo que o pro precisaria receber ===
function clientRejectReveal(proBudget) {
  const el = document.getElementById('chatBlindReveal');
  if (!el) return;
  chatSt.revealDismissed = true;
  el.innerHTML =
    '<div style="font-size:.82rem;font-weight:700;color:var(--text);margin-bottom:8px">❌ A partir de quanto você está disposto a pagar?</div>' +
    '<div style="display:flex;gap:6px">' +
      '<input type="number" id="clientRevRejectVal" placeholder="Ex: 200" min="10" max="10000"' +
        ' style="flex:1;padding:8px 12px;border:1px solid var(--border);border-radius:var(--rs);font-size:.9rem;background:var(--bg);color:var(--text)">' +
      '<button onclick="sendClientRevReject(' + proBudget + ')"' +
        ' style="padding:8px 14px;background:var(--p);color:#fff;border:none;border-radius:var(--rs);font-weight:700;cursor:pointer">Enviar</button>' +
      '<button onclick="document.getElementById(\'chatBlindReveal\').style.display=\'none\'"' +
        ' style="padding:8px 10px;background:var(--bg);border:1px solid var(--border);border-radius:var(--rs);cursor:pointer">✕</button>' +
    '</div>';
}

function sendClientRevReject(proBudget) {
  const val = parseFloat(document.getElementById('clientRevRejectVal').value);
  if (!val || val < 10) { toast('Valor inválido', 'err'); return; }
  const msg = '❌ Não aceito R$ ' + proBudget + ',00. Estou disposto a pagar a partir de R$ ' + Math.round(val) + ',00.';
  const seq = Date.now(); _pendingSeqs.add(seq); addMsg(msg, 'sent');
  db.collection('messages').add({ bookingId: window.currentBookingId, text: msg, sender: 'user', userId: CU.uid, seq, at: firebase.firestore.FieldValue.serverTimestamp() }).catch(() => {});
  const el = document.getElementById('chatBlindReveal');
  if (el) el.style.display = 'none';
  // Abre área de proposta
  const ca = document.getElementById('chatClientProposeArea');
  if (ca) { ca.style.display = 'block'; const vi = document.getElementById('clientProposeVal'); if (vi) { vi.value = Math.round(val); onClientPriceInput(); } }
}

// === CAIXA DE NEGOCIAÇÃO (3 opções) — PROPOSTA DO PRO ===
function showQuickAccept(price) {
  if (chatSt.agreed) return;
  const qa = document.getElementById('chatQuickAccept');
  if (!qa) return;
  qa.style.display = 'block';

  const range = SVC_PRICE_RANGE[selSvc] || { min: 60, fair: 200, max: 1000 };
  const pct = Math.min(98, Math.max(2, ((price - range.min) / (range.max - range.min)) * 100));

  let levelColor = '#10B981';
  if (price < range.min) levelColor = '#F97316';
  else if (price > range.max) levelColor = '#8B5CF6';
  else if (price > range.fair) levelColor = '#3B82F6';

  qa.innerHTML =
    '<div class="nego-box">' +
      '<div class="nego-header">' +
        '<div style="font-size:.7rem;font-weight:700;color:var(--text2);letter-spacing:.6px;margin-bottom:6px">💰 PROPOSTA DO PROFISSIONAL</div>' +
        '<div style="font-size:1.5rem;font-weight:800;color:var(--p)">R$ ' + price + ',00</div>' +
        '<div style="margin-top:8px">' +
          '<div style="display:flex;justify-content:space-between;font-size:.66rem;color:var(--text2);margin-bottom:2px"><span>Muito baixo</span><span>Justo (R$' + range.fair + ')</span><span>Alto</span></div>' +
          '<div class="gauge-track">' +
            '<div class="gauge-fill" style="width:' + pct + '%"></div>' +
            '<div class="gauge-tip" style="left:' + pct + '%;background:' + levelColor + '"></div>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="nego-actions">' +
        '<button class="nego-btn nego-accept" onclick="quickAcceptPrice(' + price + ')">✅ Aceitar</button>' +
        '<button class="nego-btn nego-reject" onclick="rejectProposal(' + price + ')">❌ Recusar</button>' +
        '<button class="nego-btn nego-counter" onclick="openCounterPropose(' + price + ')">💬 Contrapropor</button>' +
      '</div>' +
    '</div>';
}

// === RECUSAR PROPOSTA DO PRO — pede valor mínimo do cliente ===
function rejectProposal(price) {
  const qa = document.getElementById('chatQuickAccept');
  if (!qa) return;
  qa.innerHTML =
    '<div style="padding:6px 2px">' +
      '<div style="font-size:.82rem;font-weight:700;color:var(--text);margin-bottom:8px">❌ A partir de quanto você está disposto a pagar?</div>' +
      '<div style="display:flex;gap:6px">' +
        '<input type="number" id="rejectMinVal" placeholder="Ex: 120" min="10" max="10000"' +
          ' style="flex:1;padding:8px 12px;border:1px solid var(--border);border-radius:var(--rs);font-size:.9rem;background:var(--bg);color:var(--text)">' +
        '<button onclick="sendRejectWithMin(' + price + ')"' +
          ' style="padding:8px 14px;background:var(--p);color:#fff;border:none;border-radius:var(--rs);font-weight:700;cursor:pointer">Enviar</button>' +
        '<button onclick="document.getElementById(\'chatQuickAccept\').style.display=\'none\'"' +
          ' style="padding:8px 10px;background:var(--bg);border:1px solid var(--border);border-radius:var(--rs);cursor:pointer">✕</button>' +
      '</div>' +
    '</div>';
}

// === ENVIA RECUSA COM VALOR MÍNIMO DISPOSTO ===
function sendRejectWithMin(originalPrice) {
  const minVal = parseFloat(document.getElementById('rejectMinVal').value);
  if (!minVal || minVal < 10 || minVal > 10000) { toast('Valor inválido (entre R$ 10 e R$ 10.000)', 'err'); return; }
  const msg = '❌ Não aceito R$ ' + originalPrice + ',00. Estou disposto a pagar a partir de R$ ' + Math.round(minVal) + ',00.';
  const seq = Date.now();
  _pendingSeqs.add(seq);
  addMsg(msg, 'sent');
  db.collection('messages').add({
    bookingId: window.currentBookingId, text: msg,
    sender: 'user', userId: CU.uid, seq: seq,
    at: firebase.firestore.FieldValue.serverTimestamp()
  }).catch(() => {});
  const qa = document.getElementById('chatQuickAccept');
  if (qa) qa.style.display = 'none';
  // Abre área de proposta com o valor sugerido preenchido
  const ca = document.getElementById('chatClientProposeArea');
  if (ca) {
    ca.style.display = 'block';
    const vi = document.getElementById('clientProposeVal');
    if (vi) { vi.value = Math.round(minVal); onClientPriceInput(); }
  }
}

// === ABRIR CONTRAPROPOSTA ===
function openCounterPropose(price) {
  const qa = document.getElementById('chatQuickAccept');
  if (qa) qa.style.display = 'none';
  const ca = document.getElementById('chatClientProposeArea');
  if (ca) {
    ca.style.display = 'block';
    const vi = document.getElementById('clientProposeVal');
    if (vi) { vi.focus(); }
  }
}

// Aceita a proposta DIRETAMENTE — sem depender de parsing de texto em sendMsg()
function quickAcceptPrice(price) {
  if (chatSt.agreed || !window.currentBookingId || !CU) return;
  chatSt.agreed = true; chatSt.price = price; agreedPrice = price;

  // Esconde áreas de negociação e mostra pagamento imediatamente
  const qa = document.getElementById('chatQuickAccept');
  if (qa) qa.style.display = 'none';
  const pa = document.getElementById('chatClientProposeArea');
  if (pa) pa.style.display = 'none';
  document.getElementById('chatPay').classList.add('show');
  document.getElementById('cpPrice').textContent = 'R$ ' + price + ',00';

  // Confirma no chat com mensagem do cliente
  const confirmMsg = '✅ Aceito! Combinamos R$ ' + price + ',00.';
  const seq = Date.now();
  _pendingSeqs.add(seq);
  addMsg(confirmMsg, 'sent');
  db.collection('messages').add({
    bookingId: window.currentBookingId, text: confirmMsg,
    sender: 'user', userId: CU.uid, seq: seq,
    at: firebase.firestore.FieldValue.serverTimestamp()
  }).catch(() => {});

  // Salva acordo no booking (cliente tem permissão pois é o dono do documento)
  db.collection('bookings').doc(window.currentBookingId).update({
    agreedPrice: price,
    status: 'payment_pending',
    priceAgreedAt: firebase.firestore.FieldValue.serverTimestamp()
  }).catch(e => console.error('quickAcceptPrice update:', e));
}

// === PROPOSTA DO CLIENTE ===
function clientProposePrice() {
  if (!window.currentBookingId || !CU) return;
  const valEl = document.getElementById('clientProposeVal');
  const val = parseFloat(valEl.value);
  if (!val || val < 10 || val > 10000) { toast('Valor inválido (entre R$ 10 e R$ 10.000)', 'err'); return; }

  // Aviso se valor muito baixo (abaixo de 65% do mínimo de referência)
  const range = SVC_PRICE_RANGE[selSvc] || { min: 60, fair: 200, max: 1000 };
  if (val < range.min * 0.65) {
    toast('⚠️ Valor muito baixo — para um serviço de qualidade sugerimos no mínimo R$ ' + range.min, 'err');
    return;
  }

  const msg = '💰 Proponho: R$ ' + Math.round(val) + ',00';
  const seq = Date.now();
  _pendingSeqs.add(seq);
  addMsg(msg, 'sent');
  db.collection('messages').add({
    bookingId: window.currentBookingId, text: msg,
    sender: 'user', userId: CU.uid, seq: seq,
    at: firebase.firestore.FieldValue.serverTimestamp()
  }).catch(e => { console.error('clientProposePrice:', e); _pendingSeqs.delete(seq); });
  valEl.value = '';
  const gauge = document.getElementById('clientPriceGauge');
  if (gauge) gauge.innerHTML = '';
  document.getElementById('chatClientProposeArea').style.display = 'none';
  toast('Proposta de R$ ' + Math.round(val) + ' enviada! 💰', 'ok');
}

// === ADD MESSAGE TO DOM ===
function addMsg(t, c) {
  const d = document.createElement('div'); d.className = 'cmsg ' + c; d.textContent = t;
  const m = document.getElementById('chatMsgs'); m.appendChild(d); m.scrollTop = m.scrollHeight;
}

// === SEND USER MESSAGE ===
function sendMsg() {
  const inp = document.getElementById('chatIn'), msg = inp.value.trim();
  if (!msg) return; inp.value = '';
  // Block external contacts
  if (BLOCK.some(p => p.test(msg))) { addMsg('⛔ Contato externo bloqueado', 'blk'); return; }
  // Block price change after agreement
  if (chatSt.agreed && /(\d{2,})/.test(msg) && /\b(topo|fecha|muda|trocar|alterar)\b/i.test(msg)) {
    setTimeout(() => addMsg('⚠️ Valor já combinado em R$ ' + chatSt.price + '. Use o botão Pagar abaixo.', 'sys'), 200);
    return;
  }
  if (!CU) { addMsg('⚠️ Faça login para enviar mensagens.', 'blk'); return; }
  if (!window.currentBookingId) { addMsg('⚠️ Chat não iniciado. Feche e reabra o chat.', 'blk'); return; }
  // Renderização otimista: exibe imediatamente no DOM
  const seq = Date.now();
  _pendingSeqs.add(seq);
  addMsg(msg, 'sent');
  // Salva no Firestore — listener confirma e sincroniza
  db.collection('messages').add({
    bookingId: window.currentBookingId,
    text: msg,
    sender: 'user',
    userId: CU.uid,
    seq: seq,
    at: firebase.firestore.FieldValue.serverTimestamp()
  }).catch(e => { console.error('sendMsg error:', e); _pendingSeqs.delete(seq); });
  chatSt.msgs++;

  // Fallback: se usuário digitou "aceito" manualmente e já há um preço do pro → aceita
  if (!chatSt.agreed && _lastProPrice >= 10) {
    const lo = msg.toLowerCase();
    if (/\b(aceito|topo|fechado?|combinado|ok|pode|sim|blz|beleza)\b/i.test(lo)) {
      // Extrai número da mensagem ou usa o último preço do pro
      const pm = msg.match(/\b(\d{2,})\b/);
      const pr = pm ? parseInt(pm[1]) : _lastProPrice;
      if (pr >= 10) quickAcceptPrice(pr);
    }
  }
}

function chatPayNow() {
  if (_chatListener) { _chatListener(); _chatListener = null; }
  if (_bookingListener) { _bookingListener(); _bookingListener = null; }
  closeM('chatM');
  openPayM(selPro.n, selSvc, agreedPrice);
}

// === REABRIR CHAT EXISTENTE (sem criar novo booking) ===
async function reopenClientChat(bookingId, proName, proIcon) {
  if (!CU) return;
  _seenMsgIds = new Set();
  _pendingSeqs = new Set();
  _lastProPrice = 0;
  chatSt = { msgs: 0, details: { what: false, where: false, when: false }, agreed: false, price: 0, blindRevealed: false, revealDismissed: false };
  if (_chatListener) { _chatListener(); _chatListener = null; }
  if (_bookingListener) { _bookingListener(); _bookingListener = null; }
  window.currentBookingId = bookingId;

  document.getElementById('chatAv').textContent = proIcon || '🔧';
  document.getElementById('chatNm').textContent = proName || 'Profissional';
  document.getElementById('chatMsgs').innerHTML = '';
  document.getElementById('chatPay').classList.remove('show');
  const qa = document.getElementById('chatQuickAccept');
  if (qa) qa.style.display = 'none';
  closeM('clientChatsM');
  openM('chatM');

  // Verifica estado atual do booking
  try {
    const bkSnap = await db.collection('bookings').doc(bookingId).get();
    if (bkSnap.exists) {
      const bk = bkSnap.data();
      // Mostra reveal se ambos ainda não chegaram a acordo
      if (bk.clientBudget && bk.proBudget && !bk.agreedPrice) {
        chatSt.blindRevealed = true;
        showBlindNegoReveal(bk.clientBudget, bk.proBudget, bk.service || selSvc, 'client');
      }
      if (bk.agreedPrice && bk.status !== 'completed') {
        chatSt.agreed = true; chatSt.price = bk.agreedPrice; agreedPrice = bk.agreedPrice;
        document.getElementById('chatPay').classList.add('show');
        document.getElementById('cpPrice').textContent = 'R$ ' + bk.agreedPrice + ',00';
      }
      selSvc = bk.service || '';
      if (!selPro) selPro = { n: proName || '', e: proIcon || '🔧', p: 100 };
    }
  } catch (e) {}

  // Listener real-time no booking existente
  _chatListener = db.collection('messages')
    .where('bookingId', '==', bookingId)
    .onSnapshot(snap => renderChatSnapshot(snap), err => {
      console.error('reopen listener:', err);
      if (err.code === 'permission-denied') addMsg('⚠️ Sem permissão para acessar mensagens.', 'blk');
    });

  // Escuta documento de booking para capturar proposta do profissional em tempo real
  _bookingListener = db.collection('bookings').doc(bookingId).onSnapshot(snap => {
    if (!snap.exists || chatSt.agreed) return;
    const bk = snap.data();
    if (bk.lastProPosal && bk.lastProPosal !== _lastProPrice) {
      _lastProPrice = bk.lastProPosal;
      showQuickAccept(_lastProPrice);
    }
    if (bk.agreedPrice) {
      chatSt.agreed = true; chatSt.price = bk.agreedPrice; agreedPrice = bk.agreedPrice;
      const qa = document.getElementById('chatQuickAccept');
      if (qa) qa.style.display = 'none';
      document.getElementById('chatPay').classList.add('show');
      document.getElementById('cpPrice').textContent = 'R$ ' + bk.agreedPrice + ',00';
    }
  }, err => console.error('reopen booking listener:', err));
}

// === CARREGAR CHATS DO CLIENTE ===
async function showMyBookings() {
  if (!CU) { openM('loginM'); toast('Faça login para ver seus chats', 'err'); return; }
  openM('clientChatsM');
  const list = document.getElementById('clientChatsList');
  list.innerHTML = '<div style="text-align:center;padding:32px;color:var(--text2)">⏳ Carregando...</div>';

  try {
    const snap = await db.collection('bookings')
      .where('userId', '==', CU.uid)
      .limit(50)
      .get();

    if (snap.empty) {
      list.innerHTML = '<div style="text-align:center;padding:32px;color:var(--text2)">😴 Nenhum chat ainda.<br>Agende um serviço para começar!</div>';
      return;
    }

    // Ordena por data decrescente client-side
    const docs = [];
    snap.forEach(doc => docs.push({ id: doc.id, ...doc.data() }));
    docs.sort((a, b) => {
      const ta = a.createdAt ? a.createdAt.toMillis() : 0;
      const tb = b.createdAt ? b.createdAt.toMillis() : 0;
      return tb - ta;
    });

    // Filtra: remove recusados e chats sem acordo com mais de 4 horas
    const filtered = docs.filter(bk => {
      if (bk.declinedBy && bk.declinedBy.length > 0) return false;
      if (bk.agreedPrice) return true;
      if (['accepted', 'payment_pending', 'payment_confirmed', 'completed'].includes(bk.status)) return true;
      // Chats em aberto: só mostrar se criados há menos de 4 horas
      const ts = bk.createdAt ? bk.createdAt.toMillis() : 0;
      return Date.now() - ts < 4 * 60 * 60 * 1000;
    });

    if (filtered.length === 0) {
      list.innerHTML = '<div style="text-align:center;padding:32px;color:var(--text2)">😴 Nenhum serviço ativo ainda.<br>Agende um serviço para começar!</div>';
      return;
    }

    list.innerHTML = '';
    for (const bk of filtered) {
      const card = document.createElement('div');
      card.style.cssText = 'border:1px solid var(--border);border-radius:var(--rs);padding:14px;cursor:pointer;transition:all .2s;background:var(--bg2)';
      card.onmouseover = () => card.style.borderColor = 'var(--p)';
      card.onmouseout = () => card.style.borderColor = '';

      const date = bk.createdAt ? bk.createdAt.toDate() : new Date();
      const dateStr = date.toLocaleDateString('pt-BR') + ' ' + date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

      let statusLabel = '💬 Em aberto';
      let statusColor = '#3B82F6';
      if (bk.status === 'accepted' || bk.status === 'payment_pending') { statusLabel = '✅ Aceito'; statusColor = '#10B981'; }
      else if (bk.status === 'payment_confirmed') { statusLabel = '💳 Pago'; statusColor = '#059669'; }
      else if (bk.status === 'completed') { statusLabel = '🏆 Concluído'; statusColor = '#6B7280'; }

      const addr = (bk.details && bk.details.addr) || bk.addr || '';
      const svc = (bk.details && bk.details.svc) || bk.service || 'Serviço';

      card.innerHTML =
        '<div style="display:flex;justify-content:space-between;align-items:start;gap:8px">' +
          '<div style="flex:1;min-width:0">' +
            '<div style="font-weight:700;margin-bottom:4px">' + esc(svc) + '</div>' +
            '<div style="font-size:.82rem;color:var(--text2);margin-bottom:4px">🔧 ' + esc(bk.proName || 'Aguardando profissional') + '</div>' +
            (addr ? '<div style="font-size:.78rem;color:var(--text2)">📍 ' + esc(addr) + '</div>' : '') +
          '</div>' +
          '<div style="text-align:right;flex-shrink:0">' +
            '<div style="font-size:.72rem;padding:3px 8px;border-radius:20px;font-weight:700;background:' + statusColor + '22;color:' + statusColor + ';margin-bottom:6px">' + statusLabel + '</div>' +
            '<div style="font-size:.72rem;color:var(--text2)">' + esc(dateStr) + '</div>' +
          '</div>' +
        '</div>';

      card.onclick = () => reopenClientChat(bk.id, bk.proName || 'Profissional', '🔧');
      list.appendChild(card);
    }
  } catch (e) {
    list.innerHTML = '<div style="text-align:center;padding:32px;color:var(--red)">❌ Erro ao carregar chats. Tente novamente.</div>';
    console.error('showMyBookings:', e);
  }
}
