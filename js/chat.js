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

// === OPEN CHAT ===
let _proReplyListener = null;
let _shownMsgIds = new Set();

function openChat(p, s) {
  selPro = p; selSvc = s;
  chatSt = { msgs: 0, details: { what: false, where: false, when: false }, agreed: false, price: 0 };
  window.currentBookingId = null;
  _shownMsgIds = new Set();
  if (_proReplyListener) { _proReplyListener(); _proReplyListener = null; }

  document.getElementById('chatAv').textContent = p.e;
  document.getElementById('chatNm').textContent = p.n;
  document.getElementById('chatMsgs').innerHTML = '';
  document.getElementById('chatPay').classList.remove('show');
  openM('chatM');
  addMsg('💡 Descreva bem o serviço para um preço justo. O valor combinado não pode ser alterado depois.', 'sys');
  if (window.bkDetails) {
    let d = '📋 Agendamento:\n• Serviço: ' + window.bkDetails.svc;
    if (window.bkDetails.addr) d += '\n• Local: ' + window.bkDetails.addr;
    if (window.bkDetails.from) d += '\n• De: ' + window.bkDetails.from + ' → ' + window.bkDetails.to;
    d += '\n• Data: ' + window.bkDetails.date + ' às ' + window.bkDetails.time;
    if (window.bkDetails.desc) d += '\n• Obs: ' + window.bkDetails.desc;
    addMsg(d, 'sys');
  }
  setTimeout(() => {
    addMsg('Oi! Vi que precisa de ' + s.toLowerCase() + '. Aguarde uma resposta do profissional 😊', 'recv');
  }, 600);

  if (CU) {
    db.collection('bookings').add({
      userId: CU.uid, proName: p.n, service: s,
      details: window.bkDetails || {}, status: 'chat',
      acceptedByPro: null,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    }).then(ref => {
      window.currentBookingId = ref.id;
      // Escuta respostas reais do profissional
      _proReplyListener = db.collection('messages')
        .where('bookingId', '==', ref.id)
        .where('sender', '==', 'pro')
        .orderBy('at', 'asc')
        .onSnapshot(snap => {
          snap.docChanges().forEach(change => {
            if (change.type === 'added' && !_shownMsgIds.has(change.doc.id)) {
              _shownMsgIds.add(change.doc.id);
              addMsg(change.doc.data().text, 'recv');
            }
          });
        }, () => {});
    });
  }
}

// === ADD MESSAGE ===
function addMsg(t, c) {
  const d = document.createElement('div'); d.className = 'cmsg ' + c; d.textContent = t;
  const m = document.getElementById('chatMsgs'); m.appendChild(d); m.scrollTop = m.scrollHeight;
}

// === SEND MESSAGE ===
function sendMsg() {
  const inp = document.getElementById('chatIn'), msg = inp.value.trim();
  if (!msg) return; inp.value = '';
  // Block external contacts
  if (BLOCK.some(p => p.test(msg))) { addMsg('⛔ Contato externo bloqueado', 'blk'); return; }
  // Block price change after agreement
  if (chatSt.agreed && /(\d{2,})/.test(msg) && /\b(topo|fecha|muda|trocar|alterar)\b/i.test(msg)) {
    addMsg(msg, 'sent');
    setTimeout(() => addMsg('⚠️ Valor já combinado em R$ ' + chatSt.price + '. Use o botão Pagar abaixo.', 'sys'), 600);
    return;
  }
  addMsg(msg, 'sent'); chatSt.msgs++;
  // Salva no Firestore com bookingId para o profissional receber
  if (CU) db.collection('messages').add({
    userId: CU.uid, pro: selPro.n, text: msg, sender: 'user',
    bookingId: window.currentBookingId || null,
    at: firebase.firestore.FieldValue.serverTimestamp()
  });
  // Detecção de acordo de preço (cliente digita valor e confirma)
  const lo = msg.toLowerCase();
  const pm = msg.match(/(\d{2,})/);
  if (pm && /\b(topo|fechado|ok|combinado|aceito|fecha|bora|sim|concordo|beleza|blz|topei|r\$)\b/i.test(lo)) {
    const pr = parseInt(pm[1]);
    if (pr >= 20 && !chatSt.agreed) {
      chatSt.agreed = true; chatSt.price = pr;
      setTimeout(() => {
        addMsg('📋 Valor combinado: R$ ' + pr + '\n• Comissão plataforma (25%): R$ ' + (pr * .25).toFixed(0) + '\n• Profissional recebe: R$ ' + (pr * .75).toFixed(0) + '\n\nPode pagar abaixo!', 'sys');
        document.getElementById('chatPay').classList.add('show');
        document.getElementById('cpPrice').textContent = 'R$ ' + pr + ',00';
        agreedPrice = pr;
      }, 400);
      return;
    }
  }
  // Placeholder até o profissional responder
  setTimeout(() => {
    if (!chatSt.agreed) addMsg('✅ Mensagem enviada. Aguarde a resposta do profissional.', 'sys');
  }, 700 + Math.random() * 600);
}

function chatPayNow() { closeM('chatM'); openPayM(selPro.n, selSvc, agreedPrice); }
