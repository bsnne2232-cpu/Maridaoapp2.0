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

// === OPEN CHAT (CLIENT SIDE) ===
async function openChat(p, s) {
  selPro = p; selSvc = s;
  chatSt = { msgs: 0, details: { what: false, where: false, when: false }, agreed: false, price: 0 };
  window.currentBookingId = null;
  _seenMsgIds = new Set();
  if (_chatListener) { _chatListener(); _chatListener = null; }

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
      .onSnapshot(snap => renderChatSnapshot(snap), err => console.error('chat listener:', err));
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
    let cls;
    if (d.sender === 'sys') cls = 'sys';
    else if (d.sender === 'user') cls = 'sent';
    else cls = 'recv'; // pro
    addMsg(d.text, cls);
  });
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
  if (!CU || !window.currentBookingId) {
    addMsg('⚠️ Faça login para enviar mensagens.', 'blk');
    return;
  }
  // Save to Firestore — listener will render it
  db.collection('messages').add({
    bookingId: window.currentBookingId,
    text: msg,
    sender: 'user',
    userId: CU.uid,
    seq: Date.now(),
    at: firebase.firestore.FieldValue.serverTimestamp()
  }).catch(e => console.error('sendMsg error:', e));
  chatSt.msgs++;

  // Detect price agreement
  const lo = msg.toLowerCase();
  const pm = msg.match(/(\d{2,})/);
  if (pm && /\b(topo|fechado?|fechar|ok|combinado|aceito|fecha|bora|sim|concordo|beleza|blz|topei|reais|r\$)\b/i.test(lo)) {
    const pr = parseInt(pm[1]);
    if (pr >= 20 && !chatSt.agreed) {
      chatSt.agreed = true; chatSt.price = pr; agreedPrice = pr;
      const summaryTxt = '📋 Valor combinado: R$ ' + pr + '\n• Comissão plataforma (25%): R$ ' + (pr * .25).toFixed(0) + '\n• Profissional recebe: R$ ' + (pr * .75).toFixed(0) + '\n\nPode pagar abaixo!';
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
      // Show pay button
      document.getElementById('chatPay').classList.add('show');
      document.getElementById('cpPrice').textContent = 'R$ ' + pr + ',00';
    }
  }
}

function chatPayNow() {
  if (_chatListener) { _chatListener(); _chatListener = null; }
  closeM('chatM');
  openPayM(selPro.n, selSvc, agreedPrice);
}
