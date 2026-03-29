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
function openChat(p, s) {
  selPro = p; selSvc = s;
  chatSt = { msgs: 0, details: { what: false, where: false, when: false }, agreed: false, price: 0 };
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
    addMsg('Oi! Vi que precisa de ' + s.toLowerCase() + '. Vou te fazer umas perguntas 😊', 'recv');
    setTimeout(() => addMsg(SQ[s] || 'Me conta o que precisa!', 'recv'), 800);
  }, 600);
  if (CU) db.collection('bookings').add({
    userId: CU.uid, proName: p.n, service: s,
    details: window.bkDetails || {}, status: 'chat',
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
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
  // Save to Firestore
  if (CU) db.collection('messages').add({
    userId: CU.uid, pro: selPro.n, text: msg, sender: 'user',
    at: firebase.firestore.FieldValue.serverTimestamp()
  });
  const lo = msg.toLowerCase();
  // Track details
  if (/consert|trocar|instalar|limpar|faxina|pintar|montar|desentup|vaz|chuveir|tomada|pia|torneira|mudança|carreto|frete|caixa|sofá|geladeira/i.test(lo)) chatSt.details.what = true;
  if (/rua|avenida|bairro|centro|apartamento|casa|andar|cep|endereço/i.test(lo)) chatSt.details.where = true;
  if (/hoje|amanhã|segunda|terça|quarta|quinta|sexta|sábado|domingo|manhã|tarde|noite|hora|horário|dia|urgente/i.test(lo)) chatSt.details.when = true;
  // Price agreement
  const pm = msg.match(/(\d{2,})/);
  if (pm && /\b(topo|fechado|ok|combinado|pode|aceito|fecha|bora|sim|concordo|beleza|blz|topei|reais|r\$)\b/i.test(lo)) {
    const pr = parseInt(pm[1]);
    if (pr >= 20 && !chatSt.agreed) {
      if (chatSt.msgs < 3 && !(chatSt.details.what && chatSt.details.where)) {
        setTimeout(() => addMsg('Calma! Antes de fechar, me conta mais detalhes do serviço 😊', 'recv'), 800);
        return;
      }
      const bp = selPro.p || 100;
      if (pr > bp * 5) {
        setTimeout(() => addMsg('R$ ' + pr + ' parece alto. Normalmente cobro R$ ' + bp + ' a R$ ' + (bp * 3) + '. Vamos combinar melhor?', 'recv'), 800);
        return;
      }
      chatSt.agreed = true; chatSt.price = pr;
      setTimeout(() => {
        addMsg('Fechado em R$ ' + pr + ',00! 👍', 'recv');
        setTimeout(() => {
          addMsg('📋 Resumo:\n• Serviço: R$ ' + pr + '\n• Comissão (25%): R$ ' + (pr * .25).toFixed(0) + '\n• Eu recebo: R$ ' + (pr * .75).toFixed(0) + '\n\nPode pagar abaixo!', 'recv');
          document.getElementById('chatPay').classList.add('show');
          document.getElementById('cpPrice').textContent = 'R$ ' + pr + ',00';
          agreedPrice = pr;
        }, 1000);
      }, 800);
      return;
    }
  }
  // Smart replies
  setTimeout(() => {
    let re;
    if (/quanto|preço|valor|cobra|custa/i.test(lo)) {
      if (!(chatSt.details.what && chatSt.details.where)) {
        const m = [];
        if (!chatSt.details.what) m.push('o que precisa');
        if (!chatSt.details.where) m.push('endereço');
        re = 'Pra valor justo, preciso saber: ' + m.join(', ') + '!';
      } else if (selPro.p) re = 'Pelo que descreveu, fica entre R$ ' + selPro.p + ' e R$ ' + (selPro.p * 2.5).toFixed(0) + '. Me fala um valor!';
      else re = 'Preciso avaliar pessoalmente. Qual sua expectativa?';
    } else if (/horário|hora|disponível|agenda/i.test(lo)) re = 'Tenho horários! Qual dia fica melhor?';
    else if (/seguro|garantia/i.test(lo)) re = 'Pagamento retido até você confirmar com código. Total segurança!';
    else if (/tempo|demora/i.test(lo)) re = 'Geralmente 1 a 3 horas. Avalio melhor quando chegar!';
    else if (/desconto|barato/i.test(lo)) re = 'Meu valor já é justo! Me fala sua proposta 😊';
    else if (/obrigad|valeu|beleza|ok/i.test(lo)) {
      re = chatSt.details.what && !chatSt.agreed ? 'Por nada! Vamos fechar o valor? Me fala quanto acha justo 😄' : 'Por nada! Qualquer dúvida, fala aqui 😄';
    } else {
      const g = ['Entendi! Me conta mais detalhes.', 'Certo! Mais alguma coisa?', 'Boa! Qualquer dúvida, pergunta aqui.', 'Perfeito, vamos combinar!'];
      re = g[Math.floor(Math.random() * g.length)];
    }
    addMsg(re, 'recv');
  }, 700 + Math.random() * 600);
}

function chatPayNow() { closeM('chatM'); openPayM(selPro.n, selSvc, agreedPrice); }
