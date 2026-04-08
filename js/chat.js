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
  chatSt = { msgs: 0, details: { what: false, where: false, when: false }, agreed: false, price: 0 };
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
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    window.currentBookingId = ref.id;

    // Escuta documento de booking para capturar proposta do profissional em tempo real
    _bookingListener = db.collection('bookings').doc(ref.id).onSnapshot(snap => {
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
    // Rastreia último preço mencionado pelo profissional
    if (d.sender === 'pro' && !chatSt.agreed) {
      const pm = d.text.match(/(\d{2,})/);
      if (pm) {
        _lastProPrice = parseInt(pm[1]);
        showQuickAccept(_lastProPrice);
      }
    }
    addMsg(d.text, cls);
  });
}

// === BOTÃO RÁPIDO DE ACEITAR PROPOSTA DO PRO ===
function showQuickAccept(price) {
  if (chatSt.agreed) return;
  const qa = document.getElementById('chatQuickAccept');
  if (!qa) return;
  qa.style.display = 'block';
  qa.innerHTML = '<button onclick="quickAcceptPrice(' + price + ')" style="width:100%;padding:10px;background:linear-gradient(135deg,#10B981,#059669);color:#fff;border:none;border-radius:var(--rs);font-weight:700;cursor:pointer;font-size:.9rem">✅ Aceitar R$ ' + price + ',00 e pagar</button>';
}

function quickAcceptPrice(price) {
  if (chatSt.agreed) return;
  // Simula envio da mensagem de aceite pelo cliente
  const inp = document.getElementById('chatIn');
  if (inp) inp.value = 'aceito R$ ' + price;
  sendMsg();
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

  // Detect price agreement — aceita número na mensagem OU preço que o pro mencionou
  const lo = msg.toLowerCase();
  const pm = msg.match(/(\d{2,})/);
  const prFromMsg = pm ? parseInt(pm[1]) : 0;
  const prFromPro = _lastProPrice;
  const hasAgreementWord = /\b(topo|fechado?|fechar|ok|combinado|aceito|fecha|bora|sim|concordo|beleza|blz|topei|reais|r\$|certo|claro|pode|perfeito|ótimo|otimo|valeu|firmeza|embora|vai)\b/i.test(lo);
  const pr = prFromMsg >= 20 ? prFromMsg : (hasAgreementWord && prFromPro >= 20 ? prFromPro : 0);
  if (pr >= 20 && !chatSt.agreed && hasAgreementWord) {
    chatSt.agreed = true; chatSt.price = pr; agreedPrice = pr;
    const summaryTxt = '✅ Valor combinado: R$ ' + pr + ',00\n\nPagamento disponível abaixo 👇';
    // Save as sys message so both sides see it
    db.collection('messages').add({
      bookingId: window.currentBookingId,
      text: summaryTxt,
      sender: 'sys',
      userId: CU.uid,
      seq: Date.now() + 1,
      at: firebase.firestore.FieldValue.serverTimestamp()
    }).catch(() => {});
    // Update booking with agreed price
    db.collection('bookings').doc(window.currentBookingId).update({
      agreedPrice: pr,
      priceAgreedAt: firebase.firestore.FieldValue.serverTimestamp()
    }).catch(() => {});
    // Esconde botão rápido e mostra pagamento
    const qa = document.getElementById('chatQuickAccept');
    if (qa) qa.style.display = 'none';
    document.getElementById('chatPay').classList.add('show');
    document.getElementById('cpPrice').textContent = 'R$ ' + pr + ',00';
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
  chatSt = { msgs: 0, details: { what: false, where: false, when: false }, agreed: false, price: 0 };
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

  // Verifica se já tinha preço acordado
  try {
    const bkSnap = await db.collection('bookings').doc(bookingId).get();
    if (bkSnap.exists) {
      const bk = bkSnap.data();
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
      .limit(20)
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

    // Filtra: remove recusados e chats sem acordo > 7 dias
    const filtered = docs.filter(bk => {
      if (bk.declinedBy && bk.declinedBy.length > 0) return false;
      if (bk.agreedPrice) return true;
      if (['accepted', 'payment_pending', 'payment_confirmed', 'completed'].includes(bk.status)) return true;
      const ts = bk.createdAt ? bk.createdAt.toMillis() : 0;
      return Date.now() - ts < 7 * 24 * 60 * 60 * 1000;
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
