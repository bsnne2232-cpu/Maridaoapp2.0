// === PRO DASHBOARD STATE ===
let currentProfessional = null;
let proRequestsListener  = null;
let proAcceptedListener  = null; // listener por proId (novos bookings)
let proAcceptedListener2 = null; // listener por acceptedByPro (bookings legados)
const declinedBookings = new Set();

// === PERSISTÊNCIA DE RECUSAS (localStorage por pro) ===
function _loadDeclined() {
  if (!CU) return;
  try {
    const saved = JSON.parse(localStorage.getItem('dec_' + CU.uid) || '[]');
    saved.forEach(id => declinedBookings.add(id));
  } catch (e) {}
}
function _saveDeclined() {
  if (!CU) return;
  try {
    const arr = [...declinedBookings].slice(-200);
    localStorage.setItem('dec_' + CU.uid, JSON.stringify(arr));
  } catch (e) {}
}

// === DETECTAR SE É PROFISSIONAL ===
async function checkIfProfessional() {
  if (!CU) return;
  try {
    // Busca por UID primeiro, fallback por email
    let snap = await db.collection('professionals')
      .where('uid', '==', CU.uid)
      .limit(1)
      .get();

    if (snap.empty) {
      snap = await db.collection('professionals')
        .where('email', '==', CU.email)
        .limit(1)
        .get();
    }

    if (!snap.empty) {
      snap.forEach(doc => {
        currentProfessional = { id: doc.id, ...doc.data() };
      });
      showProView();
    } else {
      currentProfessional = null;
      // Garante que a view de cliente apareça se não for profissional
      const proView = document.getElementById('proView');
      const clientView = document.getElementById('clientView');
      if (proView) proView.style.display = 'none';
      if (clientView) clientView.style.display = '';
      const btn = document.getElementById('proDashLink');
      if (btn) btn.style.display = 'none';
    }
  } catch (e) {
    console.error('Erro ao verificar profissional:', e);
  }
}

// === TROCAR PARA VIEW DO PROFISSIONAL ===
function showProView() {
  document.getElementById('clientView').style.display = 'none';
  document.getElementById('proView').style.display = 'block';
  // Esconder links de cliente no nav, mostrar link de dashboard
  const navLinks = document.querySelector('.nav-links');
  if (navLinks) navLinks.style.display = 'none';
  const proDashLink = document.getElementById('proDashLink');
  if (proDashLink) proDashLink.style.display = 'none'; // não precisa mais no dropdown
  const clientBookingsLink = document.getElementById('clientBookingsLink');
  if (clientBookingsLink) clientBookingsLink.style.display = 'none';
  window.scrollTo(0, 0);
  loadProDashboard();
}

// === VOLTAR PARA VIEW DO CLIENTE ===
function showClientView() {
  document.getElementById('proView').style.display = 'none';
  document.getElementById('clientView').style.display = '';
  const navLinks = document.querySelector('.nav-links');
  if (navLinks) navLinks.style.display = '';
  const clientBookingsLink = document.getElementById('clientBookingsLink');
  if (clientBookingsLink) clientBookingsLink.style.display = '';
  window.scrollTo(0, 0);
}

// === LOAD DASHBOARD ===
async function loadProDashboard() {
  if (!currentProfessional) return;
  _loadDeclined(); // restaura recusas salvas localmente

  // Update header
  document.getElementById('proNameDash').textContent = currentProfessional.name || 'Profissional';
  document.getElementById('proAvLg').textContent = (currentProfessional.name || 'P').charAt(0).toUpperCase();

  // Load each section
  loadProRating();
  loadPendingRequests();
  loadAcceptedRequests();
  loadCompletedRequests();
  loadEarningsData();
  loadProfileData();
  loadChatsHistory();

  // Real-time listener for new requests matching specialty
  if (proRequestsListener) {
    proRequestsListener(); // unsubscribe previous
    proRequestsListener = null;
  }

  const spec = currentProfessional.spec || '';
  proRequestsListener = db.collection('bookings')
    .where('service', '==', spec)
    .where('status', '==', 'chat')
    .where('acceptedByPro', '==', null)
    .onSnapshot(snap => {
      const list = document.getElementById('requestsList');
      if (!list) return;
      list.innerHTML = '';

      const visible = snap.docs.filter(doc => {
        if (declinedBookings.has(doc.id)) return false;
        const d = doc.data();
        if (CU && Array.isArray(d.declinedBy) && d.declinedBy.includes(CU.uid)) {
          declinedBookings.add(doc.id); // sincroniza cache local
          return false;
        }
        return true;
      });
      const noReq = document.getElementById('noRequests');

      if (visible.length === 0) {
        if (noReq) noReq.style.display = 'block';
      } else {
        if (noReq) noReq.style.display = 'none';
        visible.forEach(doc => renderRequestCard(doc.id, doc.data()));
      }

      // Update tab badge
      const tabBtn = document.querySelector('.pro-tab-btn[data-tab="requests"]');
      if (tabBtn) {
        tabBtn.textContent = '📋 Pedidos' + (visible.length > 0 ? ' (' + visible.length + ')' : '');
      }
    }, err => {
      console.error('Listener error:', err);
    });
}

// === RENDER REQUEST CARD ===
function renderRequestCard(bookingId, booking) {
  const list = document.getElementById('requestsList');
  if (!list) return;

  const createdDate = booking.createdAt ? booking.createdAt.toDate() : new Date();
  const secsAgo = Math.floor((Date.now() - createdDate.getTime()) / 1000);
  const timeStr = secsAgo < 60 ? 'Agora' :
    secsAgo < 3600 ? Math.floor(secsAgo / 60) + 'm atrás' :
      Math.floor(secsAgo / 3600) + 'h atrás';

  const rate = currentProfessional.rate || 100;
  const addr = esc(booking.details && booking.details.addr ? booking.details.addr : 'Endereço não informado');
  const date = esc(booking.details && booking.details.date ? booking.details.date : '—');
  const time = esc(booking.details && booking.details.time ? booking.details.time : '—');
  const desc = booking.details && booking.details.desc ? booking.details.desc.slice(0, 80) : '';
  const svc = booking.service || '';

  const card = document.createElement('div');
  card.className = 'pro-request-card';
  card.id = 'req-' + bookingId;
  const clientName = esc(booking.userName || (booking.userEmail ? booking.userEmail.split('@')[0] : 'Cliente'));

  // Indicador de orçamento do cliente (cego — não revela o valor)
  const clientHasBudget = !!booking.clientBudget;
  const budgetHint = clientHasBudget
    ? '<div style="font-size:.72rem;color:#10B981;margin-top:6px;padding:5px 8px;background:#D1FAE5;border-radius:6px">💡 Cliente já definiu um orçamento — defina seu preço para revelar na negociação</div>'
    : '';

  card.innerHTML =
    '<div style="display:flex;justify-content:space-between;align-items:start;gap:12px">' +
      '<div style="flex:1">' +
        '<h4 style="margin:0 0 8px 0">' + esc(booking.details && booking.details.svc ? booking.details.svc : (svc || 'Serviço')) + '</h4>' +
        '<div class="pro-request-info">' +
          '<div>👤 ' + clientName + '</div>' +
          '<div>📍 ' + addr + '</div>' +
          '<div>📅 ' + date + ' às ' + time + '</div>' +
          '<div>⏱️ ' + esc(timeStr) + '</div>' +
          (desc ? '<div>📝 "' + esc(desc) + '"</div>' : '') +
        '</div>' +
        budgetHint +
      '</div>' +
      '<div style="text-align:right;flex-shrink:0">' +
        '<div style="display:flex;gap:8px;flex-direction:column">' +
          '<button class="btn-accept" onclick="acceptRequest(\'' + bookingId + '\')">✅ Aceitar</button>' +
          '<button class="btn-decline" onclick="declineRequest(\'' + bookingId + '\')">❌ Recusar</button>' +
        '</div>' +
      '</div>' +
    '</div>' +
    // === CAMPO DE PREÇO — negociação a cegas ===
    '<div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border)">' +
      '<div style="font-size:.78rem;font-weight:700;margin-bottom:6px">💰 Qual o seu preço para este serviço?</div>' +
      '<div style="font-size:.7rem;color:var(--text2);margin-bottom:8px">🔒 O cliente só verá seu valor quando ambos entrarem no chat</div>' +
      '<div style="display:flex;gap:6px;align-items:flex-start">' +
        '<div style="flex:1">' +
          '<input type="number" id="proBudgetInput-' + bookingId + '" placeholder="Ex: 300" min="10" max="10000"' +
            ' style="width:100%;padding:8px 12px;border:1.5px solid var(--border);border-radius:var(--rs);font-size:.95rem;background:var(--bg);color:var(--text)"' +
            ' oninput="onProCardBudgetInput(\'' + bookingId + '\',\'' + esc(svc) + '\')">' +
          '<div id="proBudgetGauge-' + bookingId + '" style="margin-top:4px"></div>' +
        '</div>' +
        '<button class="btn-chat" onclick="proSetBudgetAndChat(\'' + bookingId + '\',\'' + esc(svc) + '\')" style="flex-shrink:0;white-space:nowrap">💬 Conversar</button>' +
      '</div>' +
    '</div>';

  list.appendChild(card);
}

// === LIVE GAUGE NO CARD DO PEDIDO (pro) ===
function onProCardBudgetInput(bookingId, svc) {
  const val = parseFloat(document.getElementById('proBudgetInput-' + bookingId).value);
  const gauge = document.getElementById('proBudgetGauge-' + bookingId);
  if (!gauge) return;
  if (!val || val < 10) { gauge.innerHTML = ''; return; }
  if (typeof getPriceGaugeHTML === 'function') {
    gauge.innerHTML = getPriceGaugeHTML(val, svc, 'pro');
  }
}

// === SALVAR PREÇO DO PRO E ABRIR CHAT ===
async function proSetBudgetAndChat(bookingId, svc) {
  const val = parseFloat(document.getElementById('proBudgetInput-' + bookingId).value);
  if (!val || val < 10) {
    toast('Digite seu preço para conversar com o cliente', 'err');
    document.getElementById('proBudgetInput-' + bookingId).focus();
    return;
  }
  try {
    await db.collection('bookings').doc(bookingId).update({ proBudget: Math.round(val) });
  } catch (e) {
    console.error('proBudget save:', e);
  }
  openProChat(bookingId);
}

// === ACCEPT REQUEST ===
async function acceptRequest(bookingId) {
  if (!currentProfessional || !CU) return;

  const btn = document.querySelector('#req-' + bookingId + ' .btn-accept');
  if (btn) { btn.disabled = true; btn.textContent = '⏳'; }

  // Captura o preço se o pro já preencheu o campo antes de aceitar
  const priceInput = document.getElementById('proBudgetInput-' + bookingId);
  const preBudget  = priceInput ? parseFloat(priceInput.value) : null;

  try {
    const updateData = {
      acceptedByPro: currentProfessional.name,
      proEmail: currentProfessional.email,
      proId: CU.uid,
      proDocId: currentProfessional.id,
      status: 'accepted',
      acceptedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    if (preBudget && preBudget >= 10) updateData.proBudget = Math.round(preBudget);
    await db.collection('bookings').doc(bookingId).update(updateData);

    // Notify client
    const bkSnap = await db.collection('bookings').doc(bookingId).get();
    const booking = bkSnap.data();
    if (booking && booking.userId) {
      await db.collection('notifications').add({
        userId: booking.userId,
        type: 'pro_accepted',
        message: (currentProfessional.name || 'Profissional') + ' aceitou seu pedido!',
        bookingId: bookingId,
        read: false,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    }

    toast('Pedido aceito! ✅ Aguarde o cliente no chat.', 'ok');

    // Switch to accepted tab
    setTimeout(() => {
      switchProTab('accepted');
      loadAcceptedRequests();
    }, 800);

  } catch (e) {
    toast('Erro ao aceitar pedido: ' + e.message, 'err');
    if (btn) { btn.disabled = false; btn.textContent = '✅ Aceitar'; }
  }
}

// === DECLINE REQUEST ===
function declineRequest(bookingId) {
  declinedBookings.add(bookingId);
  _saveDeclined(); // persiste no localStorage
  if (CU) {
    // Persiste no Firestore (evita reaparecer em outras sessões)
    db.collection('bookings').doc(bookingId).update({
      declinedBy: firebase.firestore.FieldValue.arrayUnion(CU.uid)
    }).catch(() => {});
    // Notifica o cliente via mensagem de sistema no chat
    db.collection('messages').add({
      bookingId: bookingId,
      text: '⚠️ Um profissional não pôde atender seu pedido. Aguarde outro profissional disponível.',
      sender: 'sys',
      seq: Date.now(),
      at: firebase.firestore.FieldValue.serverTimestamp()
    }).catch(() => {});
  }
  const card = document.getElementById('req-' + bookingId);
  if (card) card.remove();
  const list = document.getElementById('requestsList');
  if (list && list.children.length === 0) {
    const noReq = document.getElementById('noRequests');
    if (noReq) noReq.style.display = 'block';
  }
  toast('Pedido recusado', 'ok');
}

// === LOAD PENDING REQUESTS (initial load) ===
async function loadPendingRequests() {
  // Handled by real-time listener in loadProDashboard
  // This is a no-op; listener does the rendering
}

// === LOAD ACCEPTED REQUESTS (REAL-TIME) ===
// Usa DOIS listeners para cobrir bookings antigos (só têm acceptedByPro)
// e novos (têm proId). Ambos fazem queries de um único campo, sem índice
// composto. Os resultados são mesclados por ID no Map docsById.
// onSnapshot() reage imediatamente quando o cliente paga
// (status→payment_confirmed) ou quando o fluxo de tracking avança.
function loadAcceptedRequests() {
  if (!currentProfessional || !CU) return;

  // Cancela listeners anteriores
  if (proAcceptedListener)  { proAcceptedListener();  proAcceptedListener  = null; }
  if (proAcceptedListener2) { proAcceptedListener2(); proAcceptedListener2 = null; }

  const activeStatuses = ['accepted', 'payment_pending', 'payment_confirmed'];
  const docsById  = new Map(); // bookingId → doc snapshot
  const fromProId = new Set(); // IDs cobertos pelo listener 1 (proId)

  function rerender() {
    const filtered = [...docsById.values()]
      .filter(doc => activeStatuses.includes(doc.data().status));
    _renderAcceptedSnapshot({
      empty: filtered.length === 0,
      forEach: cb => filtered.forEach(cb)
    });
  }

  // Listener 1: bookings onde proId == uid (novos bookings)
  proAcceptedListener = db.collection('bookings')
    .where('proId', '==', CU.uid)
    .limit(30)
    .onSnapshot(snap => {
      snap.docChanges().forEach(change => {
        if (change.type === 'removed') {
          docsById.delete(change.doc.id);
          fromProId.delete(change.doc.id);
        } else {
          docsById.set(change.doc.id, change.doc);
          fromProId.add(change.doc.id);
        }
      });
      rerender();
    }, err => console.error('accepted listener (proId):', err));

  // Listener 2: bookings onde acceptedByPro == nome (bookings legados sem proId)
  if (currentProfessional.name) {
    proAcceptedListener2 = db.collection('bookings')
      .where('acceptedByPro', '==', currentProfessional.name)
      .limit(30)
      .onSnapshot(snap => {
        snap.docChanges().forEach(change => {
          if (change.type === 'removed') {
            // Só remove se não está coberto pelo listener 1
            if (!fromProId.has(change.doc.id)) docsById.delete(change.doc.id);
          } else {
            // Adiciona/atualiza apenas se o listener 1 não cobriu
            if (!fromProId.has(change.doc.id)) docsById.set(change.doc.id, change.doc);
          }
        });
        rerender();
      }, err => console.error('accepted listener (name):', err));
  }
}

function _renderAcceptedSnapshot(snap) {
  const list = document.getElementById('acceptedList');
  const noEl = document.getElementById('noAccepted');
  if (!list) return;
  list.innerHTML = '';

  if (snap.empty) {
    if (noEl) noEl.style.display = 'block';
    return;
  }
  if (noEl) noEl.style.display = 'none';

  snap.forEach(doc => {
      const booking = doc.data();
      const bookingId = doc.id;

      let statusBadge = '⏳ Aguardando pagamento';
      let statusColor = '#EAB308';
      if (booking.status === 'payment_confirmed') {
        statusBadge = '💳 Pago — pronto para iniciar';
        statusColor = '#10B981';
      } else if (booking.status === 'accepted') {
        statusBadge = '✅ Aceito — aguardando cliente';
        statusColor = '#1B65D6';
      }

      const ts = booking.trackStatus || '';
      const addr = esc(booking.details && booking.details.addr ? booking.details.addr : 'Local não informado');
      const clientName = esc(booking.userName || (booking.userEmail ? booking.userEmail.split('@')[0] : 'Cliente'));

      // === Tracking action area based on trackStatus ===
      let trackSection = '';
      if (booking.status === 'payment_confirmed') {
        if (!ts || ts === 'paid') {
          // Step 1: Pro can mark as on the way
          trackSection =
            '<div class="pro-track-box" id="trk-' + bookingId + '">' +
              '<div class="pro-track-status">📍 Você foi aceito! Vá até o local do cliente.</div>' +
              '<div style="display:flex;gap:8px;margin-top:10px">' +
                '<button class="btn-track-arrive" onclick="proMarkOnWay(\'' + bookingId + '\')">🚗 A caminho</button>' +
              '</div>' +
            '</div>';
        } else if (ts === 'pro_on_way') {
          // Step 2: Enter client's arrival code
          trackSection =
            '<div class="pro-track-box" id="trk-' + bookingId + '">' +
              '<div class="pro-track-status">🚗 Você está a caminho!</div>' +
              '<div style="margin-top:10px">' +
                '<div style="font-size:.8rem;font-weight:700;margin-bottom:6px">🔑 Chegou? Digite o código que o cliente mostrar:</div>' +
                '<div style="display:flex;gap:6px">' +
                  '<div style="display:flex;gap:4px">' +
                    '<input id="pAC1-' + bookingId + '" type="text" maxlength="1" inputmode="numeric"' +
                      ' class="trk-digit-input" oninput="pArrNext(this,1,\'' + bookingId + '\')">' +
                    '<input id="pAC2-' + bookingId + '" type="text" maxlength="1" inputmode="numeric"' +
                      ' class="trk-digit-input" oninput="pArrNext(this,2,\'' + bookingId + '\')">' +
                    '<input id="pAC3-' + bookingId + '" type="text" maxlength="1" inputmode="numeric"' +
                      ' class="trk-digit-input" oninput="pArrNext(this,3,\'' + bookingId + '\')">' +
                    '<input id="pAC4-' + bookingId + '" type="text" maxlength="1" inputmode="numeric"' +
                      ' class="trk-digit-input" oninput="pArrNext(this,4,\'' + bookingId + '\')">' +
                  '</div>' +
                  '<button class="btn-track-confirm" onclick="proVerifyArrival(\'' + bookingId + '\')">Confirmar chegada ✅</button>' +
                '</div>' +
                '<div id="pArrErr-' + bookingId + '" style="display:none;color:var(--red);font-size:.78rem;margin-top:6px">❌ Código incorreto. Peça ao cliente novamente.</div>' +
              '</div>' +
            '</div>';
        } else if (ts === 'pro_arrived') {
          // Step 3: Service in progress, pro can finish
          trackSection =
            '<div class="pro-track-box pro-track-active" id="trk-' + bookingId + '">' +
              '<div class="pro-track-status">🔧 Serviço em andamento!</div>' +
              '<div style="font-size:.78rem;color:var(--text2);margin-top:4px">Conclua o serviço e clique em terminar.</div>' +
              '<button class="btn-track-finish" onclick="proFinishService(\'' + bookingId + '\')" style="margin-top:10px;width:100%">✅ Terminar serviço</button>' +
            '</div>';
        }
      }

      const svcName = esc(booking.service || '—');
      const svcKey  = booking.service || '';

      // === SEÇÃO DE PREÇO — negociação a cegas ===
      let priceSection = '';
      if (booking.agreedPrice) {
        // Preço já combinado — só mostra o valor
        priceSection = '<div style="font-size:1.3rem;font-weight:800;color:var(--p)">R$ ' + booking.agreedPrice + ',00</div>';
      } else if (booking.proBudget) {
        // Pro já definiu preço mas aguarda revelação
        priceSection =
          '<div style="font-size:.72rem;color:var(--text2);margin-bottom:2px">Seu preço definido</div>' +
          '<div style="font-size:1.15rem;font-weight:800;color:#F97316">R$ ' + booking.proBudget + ',00</div>' +
          (booking.clientBudget
            ? '<div style="font-size:.68rem;color:#10B981;margin-top:2px">✅ Revelação pronta no chat!</div>'
            : '<div style="font-size:.68rem;color:var(--text2);margin-top:2px">⏳ Aguardando orçamento do cliente</div>') +
          '<button class="btn-chat" onclick="openProChat(\'' + bookingId + '\')" style="margin-top:6px">💬 Chat</button>';
      } else {
        // Pro ainda não definiu preço → força preenchimento
        priceSection =
          '<div style="font-size:.72rem;font-weight:700;color:var(--text);margin-bottom:4px">💰 Defina seu preço antes de conversar</div>' +
          '<div style="font-size:.65rem;color:var(--text2);margin-bottom:6px">🔒 O cliente só verá quando ambos entrarem no chat</div>' +
          '<input type="number" id="proBudgetInput-' + bookingId + '" placeholder="Ex: 300" min="10" max="10000"' +
            ' style="width:110px;padding:6px 10px;border:1.5px solid var(--p);border-radius:var(--rs);font-size:.9rem;background:var(--bg);color:var(--text);display:block;margin-bottom:4px"' +
            ' oninput="onProCardBudgetInput(\'' + bookingId + '\',\'' + svcKey + '\')">' +
          '<div id="proBudgetGauge-' + bookingId + '" style="margin-bottom:6px"></div>' +
          '<button class="btn-chat" onclick="proSetBudgetAndChat(\'' + bookingId + '\',\'' + svcKey + '\')">💬 Conversar</button>';
      }

      const card = document.createElement('div');
      card.className = 'pro-request-card';
      card.id = 'acc-' + bookingId;
      card.innerHTML =
        '<div style="display:flex;justify-content:space-between;align-items:start;gap:12px">' +
          '<div style="flex:1">' +
            '<h4 style="margin:0 0 4px 0">' + svcName + '</h4>' +
            '<div style="font-size:.85rem;color:var(--text2);margin-bottom:4px">👤 ' + clientName + '</div>' +
            '<div style="font-size:.85rem;color:var(--text2);margin-bottom:8px">📍 ' + addr + '</div>' +
            '<div style="display:inline-block;padding:4px 8px;border-radius:4px;font-size:.75rem;font-weight:700;background:' + statusColor + '22;color:' + statusColor + '">' + statusBadge + '</div>' +
          '</div>' +
          '<div style="text-align:right;flex-shrink:0;display:flex;flex-direction:column;align-items:flex-end;gap:4px">' +
            priceSection +
          '</div>' +
        '</div>' +
        (trackSection ? '<div style="margin-top:12px;border-top:1px solid var(--border);padding-top:12px">' + trackSection + '</div>' : '');

      list.appendChild(card);
  });
}

// Busca bookings do profissional combinando duas queries (proId + acceptedByPro)
// e mescla por ID para cobrir bookings antigos (sem proId) e novos.
async function _fetchProBookings() {
  const queries = [
    db.collection('bookings').where('proId', '==', CU.uid).limit(50).get()
  ];
  if (currentProfessional.name) {
    queries.push(
      db.collection('bookings').where('acceptedByPro', '==', currentProfessional.name).limit(50).get()
    );
  }
  const snaps = await Promise.all(queries);
  const byId = new Map();
  snaps.forEach(snap => snap.forEach(doc => { if (!byId.has(doc.id)) byId.set(doc.id, { id: doc.id, ...doc.data() }); }));
  return [...byId.values()];
}

// === LOAD COMPLETED REQUESTS ===
async function loadCompletedRequests() {
  if (!currentProfessional || !CU) return;
  try {
    const allDocs = await _fetchProBookings();

    const list = document.getElementById('completedList');
    const noEl = document.getElementById('noCompleted');
    if (!list) return;
    list.innerHTML = '';

    const completed = allDocs.filter(d => d.status === 'completed');

    if (completed.length === 0) {
      if (noEl) noEl.style.display = 'block';
      return;
    }
    if (noEl) noEl.style.display = 'none';

    // Sort client-side por completedAt desc
    const docs = completed;
    docs.sort((a, b) => {
      const ta = a.completedAt ? a.completedAt.toMillis() : 0;
      const tb = b.completedAt ? b.completedAt.toMillis() : 0;
      return tb - ta;
    });

    docs.forEach(booking => {
      const completedDate = booking.completedAt ? booking.completedAt.toDate() : new Date();
      const dateStr = completedDate.toLocaleDateString('pt-BR');
      const earned = booking.netToProCents ? (booking.netToProCents / 100).toFixed(2) : (booking.agreedPrice || booking.price ? (Math.round((booking.agreedPrice || booking.price) * 0.92 * 100) / 100).toFixed(2) : '—');

      const card = document.createElement('div');
      card.className = 'pro-request-card';
      card.innerHTML =
        '<div style="display:flex;justify-content:space-between;align-items:center">' +
          '<div style="flex:1">' +
            '<h4 style="margin:0 0 4px 0">' + esc(booking.service || '—') + '</h4>' +
            '<div style="font-size:.85rem;color:var(--text2)">' + esc(dateStr) + '</div>' +
          '</div>' +
          '<div style="text-align:right">' +
            '<div style="font-size:1.3rem;font-weight:800;color:#10B981;margin-bottom:4px">R$ ' + esc(String(earned)) + '</div>' +
            '<div style="font-size:.75rem;color:var(--text2)">Seu crédito (92%)</div>' +
          '</div>' +
        '</div>';

      list.appendChild(card);
    });
  } catch (e) {
    console.error('Erro ao carregar concluídos:', e);
  }
}

// === LOAD EARNINGS DATA ===
async function loadEarningsData() {
  if (!currentProfessional || !CU) return;
  try {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);

    // Busca todos os bookings do pro (proId + acceptedByPro)
    const allDocs = await _fetchProBookings();
    const completedDocs = allDocs.filter(d => d.status === 'completed');

    let monthEarnings = 0, monthCount = 0;
    let totalEarnings = 0, totalCount = 0;

    completedDocs.forEach(d => {
      const net = d.netToProCents ? d.netToProCents / 100 : Math.round((d.agreedPrice || d.price || 0) * 0.92 * 100) / 100;
      totalEarnings += net;
      totalCount++;
      const at = d.completedAt ? d.completedAt.toDate() : null;
      if (at && at >= firstDay) {
        monthEarnings += net;
        monthCount++;
      }
    });

    const emEl  = document.getElementById('earningsMonth');
    const scmEl = document.getElementById('serviceCountMonth');
    const etEl  = document.getElementById('earningsTotal');
    const sctEl = document.getElementById('serviceCountTotal');

    if (emEl)  emEl.textContent  = 'R$ ' + monthEarnings.toFixed(2);
    if (scmEl) scmEl.textContent = monthCount + ' serviço' + (monthCount !== 1 ? 's' : '');
    if (etEl)  etEl.textContent  = 'R$ ' + totalEarnings.toFixed(2);
    if (sctEl) sctEl.textContent = totalCount + ' serviço' + (totalCount !== 1 ? 's' : '');

    // Saldo disponível para saque (do documento do profissional)
    _renderSaqueCard();

    // Últimos 10 (sort client-side)
    completedDocs.sort((a, b) => {
      const ta = a.completedAt ? a.completedAt.toMillis() : 0;
      const tb = b.completedAt ? b.completedAt.toMillis() : 0;
      return tb - ta;
    });

    const payList = document.getElementById('paymentsList');
    if (!payList) return;
    payList.innerHTML = '';

    completedDocs.slice(0, 10).forEach(booking => {
      const date   = booking.completedAt ? booking.completedAt.toDate() : new Date();
      const earned = booking.netToProCents
        ? (booking.netToProCents / 100).toFixed(2)
        : (Math.round((booking.agreedPrice || booking.price || 0) * 0.92 * 100) / 100).toFixed(2);
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;justify-content:space-between;padding:10px;background:var(--bg2);border-radius:6px;align-items:center';
      row.innerHTML =
        '<div style="flex:1">' +
          '<div style="font-weight:600">' + esc(booking.service || '—') + '</div>' +
          '<div style="font-size:.85rem;color:var(--text2)">' + esc(date.toLocaleDateString('pt-BR')) + '</div>' +
        '</div>' +
        '<div style="font-weight:700;color:#10B981">R$ ' + esc(earned) + '</div>';
      payList.appendChild(row);
    });

  } catch (e) {
    console.error('Erro ao carregar ganhos:', e);
  }
}

// === RENDER SAQUE CARD ===
function _renderSaqueCard() {
  const container = document.getElementById('saqueSection');
  if (!container || !currentProfessional) return;

  // Lê saldo atual do objeto do profissional (atualizado pelo listener ou ao carregar)
  const balanceCents = currentProfessional.balance || 0;
  const balanceReais = (balanceCents / 100).toFixed(2);

  container.innerHTML =
    '<div style="background:var(--bg2);border:1.5px solid var(--border);border-radius:var(--rs);padding:16px;margin-bottom:16px">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">' +
        '<div>' +
          '<div style="font-size:.8rem;color:var(--text2);margin-bottom:4px">Saldo disponível para saque</div>' +
          '<div style="font-size:2rem;font-weight:800;color:' + (balanceCents > 0 ? '#10B981' : 'var(--text2)') + '">R$ ' + balanceReais + '</div>' +
        '</div>' +
      '</div>' +
      (balanceCents >= 100
        ? '<button class="btn btn-primary" onclick="requestSaque()" id="saqueBtn" style="width:100%">🏧 Solicitar saque via PIX</button>'
        : '<div style="font-size:.8rem;color:var(--text2);text-align:center;padding:8px">Saldo disponível após a conclusão de serviços pagos.</div>') +
    '</div>';
}

// === SOLICITAR SAQUE ===
async function requestSaque() {
  if (!CU) return;
  const btn = document.getElementById('saqueBtn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Solicitando...'; }

  try {
    const token = await CU.getIdToken();
    const res = await fetch(API_URL + '/api/request-saque', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token }
    });
    const data = await res.json();
    if (!res.ok) {
      toast(data.error || 'Erro ao solicitar saque', 'err');
      if (btn) { btn.disabled = false; btn.textContent = '🏧 Solicitar saque via PIX'; }
      return;
    }
    const valor = (data.amountCents / 100).toFixed(2);
    toast('✅ Saque de R$ ' + valor + ' solicitado! Enviaremos para sua chave PIX em até 1 dia útil.', 'ok');
    // Zera o saldo local e re-renderiza
    if (currentProfessional) currentProfessional.balance = 0;
    _renderSaqueCard();
  } catch (e) {
    toast('Erro ao solicitar saque: ' + e.message, 'err');
    if (btn) { btn.disabled = false; btn.textContent = '🏧 Solicitar saque via PIX'; }
  }
}

// === LOAD PROFILE DATA ===
function loadProfileData() {
  if (!currentProfessional) return;

  // Docs status
  let badge = '📤 Enviar docs', badgeColor = '#3B82F6';
  let text = 'Você precisa enviar seus documentos para começar a receber pedidos.';

  if (currentProfessional.docsStatus === 'approved') {
    badge = '✅ Aprovado'; badgeColor = '#10B981';
    text = 'Seus documentos foram aprovados! Você já pode receber pedidos.';
  } else if (currentProfessional.docsStatus === 'pending') {
    badge = '🟡 Pendente'; badgeColor = '#EAB308';
    text = 'Seus documentos estão sendo analisados. Aguarde a aprovação.';
  } else if (currentProfessional.docsStatus === 'rejected') {
    badge = '❌ Rejeitado'; badgeColor = '#EF4444';
    text = 'Seus documentos foram rejeitados. Envie novamente abaixo.';
  }

  const badge_el = document.getElementById('docBadge');
  const text_el = document.getElementById('docText');
  if (badge_el) {
    badge_el.style.background = badgeColor + '22';
    badge_el.style.color = badgeColor;
    badge_el.textContent = badge;
  }
  if (text_el) text_el.textContent = text;

  const bioEl = document.getElementById('bioPro');
  const pixEl = document.getElementById('pixPro');
  const radiusEl = document.getElementById('radiusPro');
  const radiusDisp = document.getElementById('radiusDisplay');
  const specEl = document.getElementById('specPro');
  const rateEl = document.getElementById('ratePro');

  if (bioEl) bioEl.value = currentProfessional.bio || '';
  if (pixEl) pixEl.value = currentProfessional.pix || '';
  if (radiusEl) radiusEl.value = currentProfessional.radius || 15;
  if (radiusDisp) radiusDisp.textContent = (currentProfessional.radius || 15) + ' km';
  if (specEl) specEl.value = currentProfessional.spec || 'Faxina';
  if (rateEl) rateEl.value = currentProfessional.rate || '';
}

// === LOAD PRO RATING ===
async function loadProRating() {
  if (!currentProfessional) return;
  try {
    const snap = await db.collection('ratings')
      .where('pro', '==', currentProfessional.name)
      .get();

    let total = 0;
    snap.forEach(doc => { total += doc.data().stars || 0; });
    const avg = snap.size > 0 ? (total / snap.size).toFixed(2) : null;
    const label = avg ? avg + '★ (' + snap.size + ' avaliações)' : 'Sem avaliações ainda';

    const specDash = document.getElementById('proSpecDash');
    const avgEl = document.getElementById('avgRating');
    if (specDash) specDash.textContent = (currentProfessional.spec || '') + ' • ' + label;
    if (avgEl) avgEl.textContent = avg || '—';
  } catch (e) {
    const specDash = document.getElementById('proSpecDash');
    if (specDash) specDash.textContent = currentProfessional.spec || '';
  }
}

// === SAVE BIO ===
async function saveBio() {
  if (!currentProfessional) return;
  const bio = (document.getElementById('bioPro').value || '').trim().slice(0, 500);
  try {
    await db.collection('professionals').doc(currentProfessional.id).update({ bio });
    currentProfessional.bio = bio;
    toast('Bio salva! ✅', 'ok');
  } catch (e) {
    toast('Erro ao salvar: ' + e.message, 'err');
  }
}

// === SAVE PIX ===
async function savePix() {
  if (!currentProfessional) return;
  const pix = (document.getElementById('pixPro').value || '').trim();
  if (!pix || pix.length < 5 || pix.length > 100) return toast('Chave PIX inválida', 'err');
  try {
    await db.collection('professionals').doc(currentProfessional.id).update({ pix });
    currentProfessional.pix = pix;
    toast('Chave PIX salva! ✅', 'ok');
  } catch (e) {
    toast('Erro ao salvar: ' + e.message, 'err');
  }
}

// === SAVE RADIUS ===
async function saveRadius() {
  if (!currentProfessional) return;
  const radius = parseInt(document.getElementById('radiusPro').value, 10);
  try {
    await db.collection('professionals').doc(currentProfessional.id).update({ radius });
    currentProfessional.radius = radius;
    document.getElementById('radiusDisplay').textContent = radius + ' km';
    toast('Raio de atendimento atualizado! ✅', 'ok');
  } catch (e) {
    toast('Erro ao salvar: ' + e.message, 'err');
  }
}

// === SAVE SPECIALTY + RATE ===
async function saveTax() {
  if (!currentProfessional) return;
  const spec = document.getElementById('specPro').value;
  const rate = parseFloat(document.getElementById('ratePro').value);
  if (!rate || rate <= 0 || rate > 10000) return toast('Taxa inválida', 'err');
  try {
    await db.collection('professionals').doc(currentProfessional.id).update({ spec, rate });
    currentProfessional.spec = spec;
    currentProfessional.rate = rate;
    toast('Dados atualizados! ✅', 'ok');
  } catch (e) {
    toast('Erro ao salvar: ' + e.message, 'err');
  }
}

// === SWITCH TAB ===
function switchProTab(tab) {
  document.querySelectorAll('.pro-tab-content').forEach(el => el.classList.remove('active'));
  const content = document.getElementById('tab-' + tab);
  if (content) content.classList.add('active');

  document.querySelectorAll('.pro-tab-btn').forEach(btn => btn.classList.remove('active'));
  const activeBtn = document.querySelector('.pro-tab-btn[data-tab="' + tab + '"]');
  if (activeBtn) activeBtn.classList.add('active');
}

// === CHATS ANTIGOS ===
async function loadChatsHistory() {
  if (!currentProfessional) return;
  const list = document.getElementById('chatHistoryList');
  const noEl = document.getElementById('noChats');
  if (!list) return;
  list.innerHTML = '';

  try {
    // Busca mensagens onde o pro é o profissional atual
    const snap = await db.collection('messages')
      .where('pro', '==', currentProfessional.name)
      .orderBy('at', 'desc')
      .limit(100)
      .get();

    if (snap.empty) {
      if (noEl) noEl.style.display = 'block';
      return;
    }
    if (noEl) noEl.style.display = 'none';

    // Agrupa mensagens por userId (cada userId = uma conversa)
    const convMap = new Map();
    snap.forEach(doc => {
      const d = doc.data();
      const key = d.userId || 'anon';
      if (!convMap.has(key)) {
        convMap.set(key, { userId: key, msgs: [], lastAt: d.at, service: d.service || '' });
      }
      const conv = convMap.get(key);
      conv.msgs.push(d);
      // Mantém a data mais recente
      if (d.at && (!conv.lastAt || d.at.toMillis() > conv.lastAt.toMillis())) {
        conv.lastAt = d.at;
      }
    });

    // Ordena conversas por data desc
    const convs = Array.from(convMap.values()).sort((a, b) => {
      const ta = a.lastAt ? a.lastAt.toMillis() : 0;
      const tb = b.lastAt ? b.lastAt.toMillis() : 0;
      return tb - ta;
    });

    convs.forEach(conv => {
      const lastMsg = conv.msgs.find(m => m.text) || {};
      const dateStr = conv.lastAt ? conv.lastAt.toDate().toLocaleDateString('pt-BR') : '—';
      const timeStr = conv.lastAt ? conv.lastAt.toDate().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
      const preview = lastMsg.text ? lastMsg.text.slice(0, 80) + (lastMsg.text.length > 80 ? '…' : '') : '(sem mensagem)';
      const msgCount = conv.msgs.length;

      const card = document.createElement('div');
      card.className = 'pro-request-card';
      card.style.cursor = 'pointer';
      card.innerHTML =
        '<div style="display:flex;justify-content:space-between;align-items:start;gap:12px">' +
          '<div style="flex:1;min-width:0">' +
            '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">' +
              '<div style="width:36px;height:36px;border-radius:50%;background:var(--pl);display:flex;align-items:center;justify-content:center;font-weight:700;color:var(--p);flex-shrink:0">👤</div>' +
              '<div>' +
                '<div style="font-weight:600;font-size:.9rem">Cliente</div>' +
                '<div style="font-size:.78rem;color:var(--text2)">' + msgCount + ' mensagem' + (msgCount !== 1 ? 's' : '') + '</div>' +
              '</div>' +
            '</div>' +
            '<div style="font-size:.83rem;color:var(--text2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(preview) + '</div>' +
          '</div>' +
          '<div style="text-align:right;flex-shrink:0">' +
            '<div style="font-size:.78rem;color:var(--text2)">' + esc(dateStr) + '</div>' +
            '<div style="font-size:.75rem;color:var(--text2)">' + esc(timeStr) + '</div>' +
          '</div>' +
        '</div>';

      // Expandir mensagens ao clicar
      card.addEventListener('click', () => {
        const existing = card.querySelector('.chat-history-msgs');
        if (existing) { existing.remove(); return; }
        const msgsDiv = document.createElement('div');
        msgsDiv.className = 'chat-history-msgs';
        msgsDiv.style.cssText = 'margin-top:12px;padding-top:12px;border-top:1px solid var(--border);display:flex;flex-direction:column;gap:6px;max-height:260px;overflow-y:auto';
        const sorted = [...conv.msgs].sort((a, b) => {
          const ta = a.at ? a.at.toMillis() : 0;
          const tb = b.at ? b.at.toMillis() : 0;
          return ta - tb;
        });
        sorted.forEach(m => {
          const bubble = document.createElement('div');
          const isUser = m.sender === 'user';
          bubble.style.cssText = 'max-width:80%;padding:8px 10px;border-radius:10px;font-size:.83rem;' +
            (isUser ? 'align-self:flex-end;background:var(--p);color:#fff;margin-left:auto' : 'align-self:flex-start;background:var(--bg2);color:var(--text)');
          bubble.textContent = m.text || '';
          msgsDiv.appendChild(bubble);
        });
        card.appendChild(msgsDiv);
        msgsDiv.scrollTop = msgsDiv.scrollHeight;
      });

      list.appendChild(card);
    });

  } catch (e) {
    console.error('Erro ao carregar chats:', e);
    if (noEl) { noEl.style.display = 'block'; noEl.querySelector('p').textContent = 'Erro ao carregar chats.'; }
  }
}

// === CLEANUP (chamado no logout) ===
function cleanupProDashboard() {
  if (proRequestsListener) {
    proRequestsListener();
    proRequestsListener = null;
  }
  if (proAcceptedListener) {
    proAcceptedListener();
    proAcceptedListener = null;
  }
  if (proAcceptedListener2) {
    proAcceptedListener2();
    proAcceptedListener2 = null;
  }
  if (_proChatListener) {
    _proChatListener();
    _proChatListener = null;
  }
  if (_proBookingDocListener) {
    _proBookingDocListener();
    _proBookingDocListener = null;
  }
  currentProfessional = null;
  if (typeof showClientView === 'function') showClientView();
}

// === PRO CHAT (real-time) ===
let _proChatListener = null;
let _proChatBookingId = null;
let _proSeenMsgIds = new Set();
let _proPendingSeqs = new Set(); // renderização otimista do pro
let _proBookingDocListener = null; // listener no documento do booking para sync de status
let _proChatBookingStatus = null;  // trackStatus corrente para bloquear chat quando concluído

async function openProChat(bookingId) {
  if (!CU || !currentProfessional) return;
  _proChatBookingId = bookingId;
  _proSeenMsgIds = new Set();
  _proPendingSeqs = new Set();
  if (_proChatListener) { _proChatListener(); _proChatListener = null; }
  if (_proBookingDocListener) { _proBookingDocListener(); _proBookingDocListener = null; }

  document.getElementById('proChatMsgs').innerHTML = '';
  const actionArea = document.getElementById('proChatActionArea');
  if (actionArea) { actionArea.style.display = 'none'; actionArea.innerHTML = ''; }
  // Reset chat input (pode ter ficado desabilitado de um chat concluído)
  const chatInEl = document.getElementById('proChatIn');
  if (chatInEl) { chatInEl.disabled = false; chatInEl.placeholder = 'Responda ao cliente...'; chatInEl.value = ''; }
  const chatSendEl = document.getElementById('proChatSendBtn');
  if (chatSendEl) chatSendEl.disabled = false;
  document.getElementById('proChatNm').textContent = 'Cliente';
  document.getElementById('proChatAddr').textContent = '';
  document.getElementById('proChatSvc').textContent = '';
  document.getElementById('proChatAv').textContent = '👤';
  openM('proChatM');

  // Fetch booking details for header + check blind negotiation reveal
  try {
    const bkSnap = await db.collection('bookings').doc(bookingId).get();
    if (bkSnap.exists) {
      const bk = bkSnap.data();
      const name = bk.userName || (bk.userEmail ? bk.userEmail.split('@')[0] : 'Cliente');
      document.getElementById('proChatNm').textContent = name;
      document.getElementById('proChatAv').textContent = name.charAt(0).toUpperCase();
      const addr = (bk.details && bk.details.addr) || bk.addr || '';
      document.getElementById('proChatAddr').textContent = addr ? '📍 ' + addr : '';
      const svc = (bk.details && bk.details.svc) || bk.service || '';
      document.getElementById('proChatSvc').textContent = svc;

      // === AUTO-ACORDO: preços iguais → fecha automaticamente ===
      const proReveal = document.getElementById('proBlindReveal');
      if (proReveal) proReveal.style.display = 'none';
      if (bk.clientBudget && bk.proBudget && !bk.agreedPrice) {
        if (Math.round(bk.clientBudget) === Math.round(bk.proBudget)) {
          _proAutoAgree(bk.clientBudget, bookingId);
        } else if (typeof showBlindNegoReveal === 'function') {
          showBlindNegoReveal(bk.clientBudget, bk.proBudget, svc, 'pro');
        }
      }
      // Trava UI se já tem preço acordado ou pagamento feito
      if (bk.agreedPrice || bk.status === 'payment_confirmed') {
        _lockProNegotiationUI(bk);
      }
    }
  } catch (e) {
    console.error('booking fetch error:', e);
  }

  // === LISTENER REAL-TIME NO BOOKING — sync de status (pagamento, chegada, conclusão) ===
  _proChatBookingStatus = null;
  _proBookingDocListener = db.collection('bookings').doc(bookingId).onSnapshot(snap => {
    if (!snap.exists) return;
    const bk = snap.data();
    _proChatBookingStatus = bk.trackStatus || bk.status || null;
    _updateProChatActions(bookingId, bk);
  }, err => console.error('pro booking doc listener:', err));

  // Real-time listener for ALL messages on this booking
  _proChatListener = db.collection('messages')
    .where('bookingId', '==', bookingId)
    .onSnapshot(snap => {
      const docs = [];
      snap.forEach(doc => docs.push({ id: doc.id, ...doc.data() }));
      docs.sort((a, b) => (a.seq || 0) - (b.seq || 0));
      const m = document.getElementById('proChatMsgs');
      docs.forEach(d => {
        if (_proSeenMsgIds.has(d.id)) return;
        _proSeenMsgIds.add(d.id);
        // Mensagem já renderizada otimisticamente (pro enviou)
        if (d.sender === 'pro' && d.proId === CU.uid && _proPendingSeqs.has(d.seq)) {
          _proPendingSeqs.delete(d.seq);
          return;
        }
        let cls;
        if (d.sender === 'sys') cls = 'sys';
        else if (d.sender === 'pro') cls = 'sent';
        else cls = 'recv';
        const div = document.createElement('div');
        div.className = 'cmsg ' + cls;
        div.textContent = d.text;
        m.appendChild(div);

        // Detecta proposta do CLIENTE → mostra caixa de negociação para o pro
        if (d.sender === 'user') {
          const fm = d.text.match(/Proponho[:\s]+R?\$?\s*(\d+)/i) || d.text.match(/R\$\s*(\d+)/i);
          if (fm) {
            const clientPrice = parseInt(fm[1]);
            if (clientPrice >= 10) {
              const acceptArea = document.getElementById('proClientProposalAccept');
              if (acceptArea) {
                acceptArea.style.display = 'block';
                acceptArea.innerHTML = buildProNegoBox(clientPrice);
              }
            }
          }
        }
      });
      m.scrollTop = m.scrollHeight;
    }, err => {
      console.error('pro chat listener:', err);
      if (err.code === 'permission-denied') {
        const m = document.getElementById('proChatMsgs');
        if (m) { const blk = document.createElement('div'); blk.className = 'cmsg blk'; blk.textContent = '⚠️ Sem permissão para acessar mensagens.'; m.appendChild(blk); }
      }
    });
}

function closeProChat() {
  if (_proChatListener) { _proChatListener(); _proChatListener = null; }
  if (_proBookingDocListener) { _proBookingDocListener(); _proBookingDocListener = null; }
  _proChatBookingId = null;
  _proChatBookingStatus = null;
  _proSeenMsgIds = new Set();
  _proPendingSeqs = new Set();
  const acceptArea = document.getElementById('proClientProposalAccept');
  if (acceptArea) { acceptArea.style.display = 'none'; acceptArea.innerHTML = ''; }
  const actionArea = document.getElementById('proChatActionArea');
  if (actionArea) { actionArea.style.display = 'none'; actionArea.innerHTML = ''; }
  closeM('proChatM');
}

// Adiciona mensagem ao DOM do pro chat
function _proAddMsg(text, cls) {
  const m = document.getElementById('proChatMsgs');
  if (!m) return;
  const div = document.createElement('div');
  div.className = 'cmsg ' + cls;
  div.textContent = text;
  m.appendChild(div);
  m.scrollTop = m.scrollHeight;
}

function sendProMsg() {
  if (_proChatBookingStatus === 'completed') {
    toast('Chat encerrado — serviço concluído.', 'err');
    return;
  }
  const inp = document.getElementById('proChatIn'), msg = inp.value.trim();
  if (!msg || !_proChatBookingId || !CU || !currentProfessional) return;
  inp.value = '';
  // Block external contacts (usa filtro normalizado de chat.js)
  if (typeof _hasForbiddenContact === 'function' && _hasForbiddenContact(msg)) {
    _proAddMsg('⛔ Contato externo bloqueado. Negocie tudo pelo chat do Maridão.', 'blk');
    return;
  }
  // Renderização otimista: exibe imediatamente
  const seq = Date.now();
  _proPendingSeqs.add(seq);
  _proAddMsg(msg, 'sent');
  db.collection('messages').add({
    bookingId: _proChatBookingId,
    text: msg,
    sender: 'pro',
    proName: currentProfessional.name,
    proId: CU.uid,
    seq: seq,
    at: firebase.firestore.FieldValue.serverTimestamp()
  }).catch(e => { console.error('sendProMsg error:', e); _proPendingSeqs.delete(seq); });
}

// === CONSTRÓI CARD DE PROPOSTA (proposta do cliente → pro vê, sem Contrapropor) ===
function buildProNegoBox(clientPrice) {
  const svc = (document.getElementById('proChatSvc') || {}).textContent || '';
  const range = (typeof SVC_PRICE_RANGE !== 'undefined' && SVC_PRICE_RANGE[svc]) || { min: 60, fair: 200, max: 1000 };
  const pct = Math.min(98, Math.max(2, ((clientPrice - range.min) / (range.max - range.min)) * 100));

  let levelColor = '#10B981';
  if (clientPrice < range.min * 0.65) levelColor = '#EF4444';
  else if (clientPrice < range.min) levelColor = '#F97316';
  else if (clientPrice > range.max) levelColor = '#8B5CF6';
  else if (clientPrice > range.fair) levelColor = '#3B82F6';

  return '<div class="nego-box">' +
    '<div class="nego-header">' +
      '<div style="font-size:.7rem;font-weight:700;color:var(--text2);letter-spacing:.6px;margin-bottom:6px">PROPOSTA DO CLIENTE</div>' +
      '<div style="font-size:1.5rem;font-weight:800;color:var(--p)">R$ ' + clientPrice + ',00</div>' +
      '<div style="margin-top:8px">' +
        '<div style="display:flex;justify-content:space-between;font-size:.66rem;color:var(--text2);margin-bottom:2px"><span>Muito baixo</span><span>Justo (R$' + range.fair + ')</span><span>Alto</span></div>' +
        '<div class="gauge-track">' +
          '<div class="gauge-fill" style="width:' + pct + '%"></div>' +
          '<div class="gauge-tip" style="left:' + pct + '%;background:' + levelColor + '"></div>' +
        '</div>' +
      '</div>' +
    '</div>' +
    '<div class="nego-actions">' +
      '<button class="nego-btn nego-accept" onclick="proAcceptClientProposal(' + clientPrice + ')">Aceitar R$ ' + clientPrice + '</button>' +
      '<button class="nego-btn nego-reject" onclick="proRejectProposal(' + clientPrice + ')">Recusar</button>' +
    '</div>' +
  '</div>';
}

// === AUTO-ACORDO PRO: preços iguais → fecha automaticamente ===
function _proAutoAgree(price, bookingId) {
  const roundedPrice = Math.round(price);
  // Grava no Firestore
  db.collection('bookings').doc(bookingId).update({
    agreedPrice: roundedPrice,
    status: 'payment_pending',
    priceAgreedAt: firebase.firestore.FieldValue.serverTimestamp()
  }).catch(e => console.error('proAutoAgree update:', e));

  // Mensagem de sistema
  const sysMsg = 'Negociacao Fechada: R$ ' + roundedPrice + ',00 — Os valores propostos sao iguais!';
  const seq = Date.now();
  _proAddMsg(sysMsg, 'sys');
  db.collection('messages').add({
    bookingId: bookingId, text: sysMsg, sender: 'sys', seq,
    at: firebase.firestore.FieldValue.serverTimestamp()
  }).catch(() => {});

  _lockProNegotiationUI({ agreedPrice: roundedPrice, status: 'payment_pending' });
  toast('Valores iguais! Negociacao fechada em R$ ' + roundedPrice + ',00', 'ok');
}

// === TRAVA DE UI PRO: esconde TODOS os campos de negociação, mostra banner ===
function _lockProNegotiationUI(bk) {
  const ids = ['proBlindReveal', 'proProposeArea', 'proClientProposalAccept'];
  ids.forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });

  if (bk && bk.agreedPrice) {
    const area = document.getElementById('proChatActionArea');
    if (area && !bk.trackStatus) {
      const isPaid = bk.status === 'payment_confirmed';
      area.style.display = 'block';
      area.style.background = isPaid ? '#D1FAE5' : '#DBEAFE';
      area.style.borderColor = isPaid ? '#059669' : '#3B82F6';
      area.innerHTML = '<div style="text-align:center;padding:10px;font-weight:700;font-size:.9rem;color:' +
        (isPaid ? '#065F46' : '#1D4ED8') + '">' +
        (isPaid ? 'Pago' : 'Negociacao Fechada') + ': R$ ' + bk.agreedPrice + ',00</div>';
    }
  }
}

// === PRO ACEITA PROPOSTA DO CLIENTE ===
function proAcceptClientProposal(price) {
  if (!_proChatBookingId || !CU || !currentProfessional) return;
  // Desabilita botões imediatamente para evitar duplo-clique
  document.querySelectorAll('.nego-accept, .nego-reject, .nego-counter').forEach(b => { b.disabled = true; b.style.opacity = '.5'; });
  const msg = '✅ Aceito sua proposta de R$ ' + price + ',00! Pode pagar pelo app.';
  const seq = Date.now();
  _proPendingSeqs.add(seq);
  _proAddMsg(msg, 'sent');
  db.collection('messages').add({
    bookingId: _proChatBookingId, text: msg,
    sender: 'pro', proName: currentProfessional.name, proId: CU.uid,
    seq: seq,
    at: firebase.firestore.FieldValue.serverTimestamp()
  }).catch(e => { _proPendingSeqs.delete(seq); });
  db.collection('bookings').doc(_proChatBookingId).update({ lastProPosal: price }).catch(() => {});
  const acceptArea = document.getElementById('proClientProposalAccept');
  if (acceptArea) acceptArea.style.display = 'none';
  const proposeArea = document.getElementById('proProposeArea');
  if (proposeArea) proposeArea.style.display = 'none';
  toast('Aceite enviado! Aguardando pagamento do cliente 💰', 'ok');
}

// === PRO RECUSA PROPOSTA — pede valor mínimo que aceita ===
function proRejectProposal(clientPrice) {
  const acceptArea = document.getElementById('proClientProposalAccept');
  if (!acceptArea) return;
  acceptArea.innerHTML =
    '<div style="padding:6px 2px">' +
      '<div style="font-size:.82rem;font-weight:700;color:var(--text);margin-bottom:8px">❌ A partir de quanto você aceitaria fazer este serviço?</div>' +
      '<div style="display:flex;gap:6px">' +
        '<input type="number" id="proRejectMinVal" placeholder="Ex: 200" min="10" max="10000"' +
          ' style="flex:1;padding:8px 12px;border:1px solid var(--border);border-radius:var(--rs);font-size:.9rem;background:var(--bg);color:var(--text)">' +
        '<button onclick="proSendRejectWithMin(' + clientPrice + ')"' +
          ' style="padding:8px 14px;background:var(--p);color:#fff;border:none;border-radius:var(--rs);font-weight:700;cursor:pointer">Enviar</button>' +
        '<button onclick="document.getElementById(\'proClientProposalAccept\').style.display=\'none\'"' +
          ' style="padding:8px 10px;background:var(--bg);border:1px solid var(--border);border-radius:var(--rs);cursor:pointer">✕</button>' +
      '</div>' +
    '</div>';
}

// === ENVIA RECUSA COM VALOR MÍNIMO DO PRO ===
function proSendRejectWithMin(clientPrice) {
  const minVal = parseFloat(document.getElementById('proRejectMinVal').value);
  if (!minVal || minVal < 10 || minVal > 10000) { toast('Valor inválido', 'err'); return; }
  const msg = '❌ Não consigo aceitar R$ ' + clientPrice + ',00. Aceito a partir de R$ ' + Math.round(minVal) + ',00.';
  const seq = Date.now();
  _proPendingSeqs.add(seq);
  _proAddMsg(msg, 'sent');
  db.collection('messages').add({
    bookingId: _proChatBookingId, text: msg,
    sender: 'pro', proName: currentProfessional.name, proId: CU.uid, seq: seq,
    at: firebase.firestore.FieldValue.serverTimestamp()
  }).catch(() => {});
  db.collection('bookings').doc(_proChatBookingId).update({ lastProPosal: Math.round(minVal) }).catch(() => {});
  const acceptArea = document.getElementById('proClientProposalAccept');
  if (acceptArea) acceptArea.style.display = 'none';
  // Abre área de proposta com o valor mínimo preenchido
  const pa = document.getElementById('proProposeArea');
  if (pa) {
    pa.style.display = 'block';
    const vi = document.getElementById('proProposeVal');
    if (vi) { vi.value = Math.round(minVal); onProPriceInput(); }
  }
  toast('Recusa enviada com contra-proposta 💬', 'ok');
}

// === LIVE GAUGE UPDATE — PRO PRICE INPUT ===
function onProPriceInput() {
  const val = parseFloat(document.getElementById('proProposeVal').value);
  const gauge = document.getElementById('proPriceGauge');
  if (!gauge) return;
  if (!val || val < 10) { gauge.innerHTML = ''; return; }
  const svc = (document.getElementById('proChatSvc') || {}).textContent || '';
  gauge.innerHTML = (typeof getPriceGaugeHTML !== 'undefined') ? getPriceGaugeHTML(val, svc, 'pro') : '';
}

// === PROPOSTA DE VALOR (pro → cliente) ===
function sendProProposal() {
  if (!_proChatBookingId || !CU || !currentProfessional) return;
  const valEl = document.getElementById('proProposeVal');
  const val = parseFloat(valEl.value);
  if (!val || val < 10 || val > 10000) { toast('Valor inválido (entre R$ 10 e R$ 10.000)', 'err'); return; }
  // Desabilita botões para evitar duplo-clique
  document.querySelectorAll('#proProposeArea button').forEach(b => { b.disabled = true; b.style.opacity = '.5'; });
  const proReceives = (val * 0.92).toFixed(0);
  const msg = '💰 Proposta: R$ ' + val.toFixed(0) + ',00\n\nResponda "aceito" para confirmar!';
  const seq = Date.now();
  _proPendingSeqs.add(seq);
  _proAddMsg(msg, 'sent');
  db.collection('messages').add({
    bookingId: _proChatBookingId,
    text: msg,
    sender: 'pro',
    proName: currentProfessional.name,
    proId: CU.uid,
    seq: seq,
    at: firebase.firestore.FieldValue.serverTimestamp()
  }).catch(e => { console.error('sendProProposal error:', e); _proPendingSeqs.delete(seq); });
  db.collection('bookings').doc(_proChatBookingId).update({
    lastProPosal: Math.round(val)
  }).catch(e => console.error('update lastProPosal:', e));
  valEl.value = '';
  const gauge = document.getElementById('proPriceGauge');
  if (gauge) gauge.innerHTML = '';
  document.getElementById('proProposeArea').style.display = 'none';
  toast('Proposta de R$ ' + val.toFixed(0) + ' enviada! Você recebe R$ ' + proReceives + ' (92%) 💰', 'ok');
}

// ====================================================================
// === RASTREAMENTO DO SERVIÇO — LADO DO PROFISSIONAL ==================
// ====================================================================

// Input helper: move para próximo campo de código
function pArrNext(el, i, bookingId) {
  el.value = el.value.replace(/\D/g, '');
  if (el.value && i < 4) {
    const next = document.getElementById('pAC' + (i + 1) + '-' + bookingId);
    if (next) next.focus();
  }
}

// === MARCAR "A CAMINHO" ===
async function proMarkOnWay(bookingId) {
  const btn = event && event.target; if (btn) { btn.disabled = true; btn.textContent = '⏳ Enviando...'; }
  try {
    await db.collection('bookings').doc(bookingId).update({
      trackStatus: 'pro_on_way',
      onWayAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    toast('Ótimo! Cliente notificado que você está a caminho 🚗', 'ok');
    loadAcceptedRequests();
  } catch (e) {
    toast('Erro ao atualizar status: ' + e.message, 'err');
  }
}

// === VERIFICAR CÓDIGO DE CHEGADA (digitado pelo profissional) ===
async function proVerifyArrival(bookingId) {
  const verBtn = event && event.target; if (verBtn) { verBtn.disabled = true; verBtn.textContent = '⏳...'; }
  const digits = [1, 2, 3, 4].map(i => {
    const el = document.getElementById('pAC' + i + '-' + bookingId);
    return el ? el.value.trim().replace(/\D/g, '') : '';
  });
  const code = digits.join('');

  if (!/^\d{4}$/.test(code)) {
    toast('Digite os 4 dígitos do código', 'err');
    return;
  }

  try {
    const snap = await db.collection('bookings').doc(bookingId).get();
    if (!snap.exists) { toast('Pedido não encontrado', 'err'); return; }
    const bk = snap.data();

    if (!bk.arrCodeHash) {
      toast('Código ainda não disponível. Peça ao cliente para efetuar o pagamento.', 'err');
      return;
    }

    // Hash the entered code and compare (same salt as tracking.js)
    const enteredHash = await hashCode(code);
    if (String(enteredHash).trim() !== String(bk.arrCodeHash).trim()) {
      const errEl = document.getElementById('pArrErr-' + bookingId);
      if (errEl) errEl.style.display = 'block';
      [1, 2, 3, 4].forEach(i => {
        const el = document.getElementById('pAC' + i + '-' + bookingId);
        if (el) el.value = '';
      });
      document.getElementById('pAC1-' + bookingId).focus();
      return;
    }

    // Código correto → confirmar chegada
    await db.collection('bookings').doc(bookingId).update({
      trackStatus: 'pro_arrived',
      arrivedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    toast('Chegada confirmada! Inicie o serviço 🔧', 'ok');
    loadAcceptedRequests();

  } catch (e) {
    toast('Erro ao verificar código: ' + e.message, 'err');
  }
}

// === TERMINAR SERVIÇO — mostra código de conclusão ao profissional ===
async function proFinishService(bookingId) {
  const btn = event && event.target; if (btn) { btn.disabled = true; btn.textContent = '⏳...'; }
  try {
    const snap = await db.collection('bookings').doc(bookingId).get();
    if (!snap.exists) { toast('Pedido não encontrado', 'err'); return; }
    const bk = snap.data();

    const compCode = bk.compCode;
    if (!compCode) {
      toast('Código de conclusão não disponível. Peça ao cliente para verificar o pagamento.', 'err');
      return;
    }

    // Mostrar código de conclusão em modal dedicado
    _showProCompCodeModal(bookingId, compCode);

  } catch (e) {
    toast('Erro ao obter código: ' + e.message, 'err');
  }
}

// === MODAL COM CÓDIGO DE CONCLUSÃO (pro mostra ao cliente) ===
function _showProCompCodeModal(bookingId, code) {
  // Remove modal anterior se existir
  const existing = document.getElementById('proCompCodeModal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'proCompCodeModal';
  modal.style.cssText =
    'position:fixed;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;' +
    'justify-content:center;z-index:9999;padding:20px';

  modal.innerHTML =
    '<div style="background:var(--bg);border-radius:var(--r);padding:28px 24px;max-width:360px;width:100%;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.3)">' +
      '<div style="font-size:2rem;margin-bottom:8px">✅</div>' +
      '<h3 style="margin:0 0 6px">Serviço concluído!</h3>' +
      '<p style="font-size:.85rem;color:var(--text2);margin-bottom:20px">Mostre este código ao cliente para confirmar a conclusão e liberar seu pagamento:</p>' +
      '<div style="background:linear-gradient(135deg,#059669,#10B981);border-radius:16px;padding:20px;color:#fff;margin-bottom:20px">' +
        '<div style="font-size:.72rem;opacity:.8;margin-bottom:8px;letter-spacing:1px">CÓDIGO DE CONCLUSÃO</div>' +
        '<div style="font-size:3rem;font-weight:800;letter-spacing:16px;font-family:monospace;' +
          'background:rgba(255,255,255,.2);border-radius:12px;padding:12px">' +
          esc(code) +
        '</div>' +
        '<div style="font-size:.72rem;opacity:.75;margin-top:8px">O cliente digita este código para liberar o pagamento</div>' +
      '</div>' +
      '<button onclick="_closeProCompCodeModal()" ' +
        'style="width:100%;padding:12px;border-radius:var(--rs);background:var(--p);color:#fff;' +
        'font-weight:700;border:none;cursor:pointer;font-size:.95rem">Fechar</button>' +
    '</div>';

  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) _closeProCompCodeModal(); });
}

function _closeProCompCodeModal() {
  const modal = document.getElementById('proCompCodeModal');
  if (modal) modal.remove();
  loadAcceptedRequests();
}

// ================================================================
// === NEGOCIAÇÃO A CEGAS — AÇÕES DO LADO DO PROFISSIONAL =========
// ================================================================

// Pro aceita o valor justo (midpoint)
function proAcceptFairReveal(fair) {
  if (!_proChatBookingId || !CU || !currentProfessional) return;
  const el = document.getElementById('proBlindReveal');
  if (el) el.style.display = 'none';
  const msg = '✅ Aceito o valor justo de R$ ' + fair + ',00! Pode efetuar o pagamento.';
  const seq = Date.now(); _proPendingSeqs.add(seq); _proAddMsg(msg, 'sent');
  db.collection('messages').add({ bookingId: _proChatBookingId, text: msg, sender: 'pro', proName: currentProfessional.name, proId: CU.uid, seq, at: firebase.firestore.FieldValue.serverTimestamp() }).catch(() => {});
  db.collection('bookings').doc(_proChatBookingId).update({ lastProPosal: fair }).catch(() => {});
  toast('Aceite enviado! Aguardando pagamento do cliente 💰', 'ok');
}

// Pro quer negociar no chat
function proNegotiateInChat() {
  const el = document.getElementById('proBlindReveal');
  if (el) el.style.display = 'none';
  toast('Negocie livremente no chat 💬', 'ok');
}

// Pro rejeita — pede valor mínimo a aceitar
function proRejectReveal(clientBudget) {
  const el = document.getElementById('proBlindReveal');
  if (!el) return;
  el.innerHTML =
    '<div style="font-size:.82rem;font-weight:700;color:var(--text);margin-bottom:8px">❌ A partir de quanto você aceitaria fazer este serviço?</div>' +
    '<div style="display:flex;gap:6px">' +
      '<input type="number" id="proRevRejectVal" placeholder="Ex: 250" min="10" max="10000"' +
        ' style="flex:1;padding:8px 12px;border:1px solid var(--border);border-radius:var(--rs);font-size:.9rem;background:var(--bg);color:var(--text)">' +
      '<button onclick="sendProRevReject(' + clientBudget + ')"' +
        ' style="padding:8px 14px;background:var(--p);color:#fff;border:none;border-radius:var(--rs);font-weight:700;cursor:pointer">Enviar</button>' +
      '<button onclick="document.getElementById(\'proBlindReveal\').style.display=\'none\'"' +
        ' style="padding:8px 10px;background:var(--bg);border:1px solid var(--border);border-radius:var(--rs);cursor:pointer">✕</button>' +
    '</div>';
}

function sendProRevReject(clientBudget) {
  const val = parseFloat(document.getElementById('proRevRejectVal').value);
  if (!val || val < 10) { toast('Valor inválido', 'err'); return; }
  const msg = '❌ Não consigo aceitar R$ ' + clientBudget + ',00. Aceito a partir de R$ ' + Math.round(val) + ',00.';
  const seq = Date.now(); _proPendingSeqs.add(seq); _proAddMsg(msg, 'sent');
  db.collection('messages').add({ bookingId: _proChatBookingId, text: msg, sender: 'pro', proName: currentProfessional.name, proId: CU.uid, seq, at: firebase.firestore.FieldValue.serverTimestamp() }).catch(() => {});
  db.collection('bookings').doc(_proChatBookingId).update({ lastProPosal: Math.round(val) }).catch(() => {});
  const el = document.getElementById('proBlindReveal');
  if (el) el.style.display = 'none';
  const pa = document.getElementById('proProposeArea');
  if (pa) { pa.style.display = 'block'; const vi = document.getElementById('proProposeVal'); if (vi) { vi.value = Math.round(val); onProPriceInput(); } }
  toast('Recusa enviada com contra-proposta 💬', 'ok');
}

// ====================================================================
// === PRO CHAT — AÇÕES EM TEMPO REAL (pagamento → chegada → conclusão)
// ====================================================================

// Atualiza a área de ação no chat do profissional baseado no status do booking.
// Chamado pelo onSnapshot no documento do booking.
function _updateProChatActions(bookingId, bk) {
  const area = document.getElementById('proChatActionArea');
  if (!area) return;

  // Trava negociação quando preço foi acordado OU pago
  if (bk.agreedPrice || bk.status === 'payment_confirmed' || bk.trackStatus === 'paid' || bk.trackStatus === 'pro_on_way' || bk.trackStatus === 'pro_arrived' || bk.trackStatus === 'completed') {
    const proposeArea = document.getElementById('proProposeArea');
    if (proposeArea) proposeArea.style.display = 'none';
    const acceptArea = document.getElementById('proClientProposalAccept');
    if (acceptArea) acceptArea.style.display = 'none';
    const reveal = document.getElementById('proBlindReveal');
    if (reveal) reveal.style.display = 'none';
  }

  // Desabilita input do chat quando concluído
  const chatIn = document.getElementById('proChatIn');
  const chatSendBtn = document.getElementById('proChatSendBtn');
  if (bk.trackStatus === 'completed') {
    if (chatIn) { chatIn.disabled = true; chatIn.placeholder = 'Chat encerrado — serviço concluído'; }
    if (chatSendBtn) chatSendBtn.disabled = true;
  } else {
    if (chatIn) { chatIn.disabled = false; chatIn.placeholder = 'Digite...'; }
    if (chatSendBtn) chatSendBtn.disabled = false;
  }

  // Estado: preço acordado mas ainda não pagou
  if (bk.agreedPrice && bk.status !== 'payment_confirmed' && bk.status !== 'completed' && !bk.trackStatus) {
    area.style.display = 'block';
    area.style.background = '#FEF3C7'; area.style.borderColor = '#F59E0B';
    area.innerHTML =
      '<div style="text-align:center;padding:8px">' +
        '<div style="font-size:.82rem;font-weight:700;color:#D97706;margin-bottom:4px">⏳ Negociação concluída — R$ ' + bk.agreedPrice + ',00</div>' +
        '<div style="font-size:.75rem;color:var(--text2)">Aguardando pagamento do cliente...</div>' +
      '</div>';
    return;
  }

  if (bk.status === 'payment_confirmed' && (!bk.trackStatus || bk.trackStatus === 'paid')) {
    area.style.display = 'block';
    area.style.background = '#D1FAE5'; area.style.borderColor = '#059669';
    area.innerHTML =
      '<div style="text-align:center">' +
        '<div style="font-size:.82rem;font-weight:700;color:#059669;margin-bottom:6px">💳 Pagamento confirmado! R$ ' + (bk.agreedPrice || 0) + ',00</div>' +
        '<div style="font-size:.75rem;color:var(--text2);margin-bottom:12px">Vá até o local e confirme sua chegada com o código do cliente.</div>' +
        '<button onclick="_openArrivalCodeModal(\'' + bookingId + '\')" style="width:100%;padding:12px;border-radius:var(--rs);background:var(--p);color:#fff;font-weight:700;border:none;cursor:pointer;font-size:.95rem">🔑 Confirmar Chegada</button>' +
      '</div>';
  } else if (bk.trackStatus === 'pro_on_way') {
    area.style.display = 'block';
    area.style.background = '#FFF7ED'; area.style.borderColor = '#F97316';
    area.innerHTML =
      '<div style="text-align:center">' +
        '<div style="font-size:.82rem;font-weight:700;color:#F97316;margin-bottom:6px">🚗 Você está a caminho!</div>' +
        '<div style="font-size:.75rem;color:var(--text2);margin-bottom:12px">Chegou? Digite o código que o cliente mostrar.</div>' +
        '<button onclick="_openArrivalCodeModal(\'' + bookingId + '\')" style="width:100%;padding:12px;border-radius:var(--rs);background:var(--p);color:#fff;font-weight:700;border:none;cursor:pointer;font-size:.95rem">🔑 Confirmar Chegada</button>' +
      '</div>';
  } else if (bk.trackStatus === 'pro_arrived') {
    area.style.display = 'block';
    area.style.background = '#DBEAFE'; area.style.borderColor = '#3B82F6';
    area.innerHTML =
      '<div style="text-align:center">' +
        '<div style="font-size:.82rem;font-weight:700;color:#3B82F6;margin-bottom:6px">🔧 Serviço em andamento!</div>' +
        '<div style="font-size:.75rem;color:var(--text2);margin-bottom:12px">Conclua o serviço e mostre o código ao cliente.</div>' +
        '<button onclick="proFinishService(\'' + bookingId + '\')" style="width:100%;padding:12px;border-radius:var(--rs);background:#059669;color:#fff;font-weight:700;border:none;cursor:pointer;font-size:.95rem">✅ Finalizar Serviço</button>' +
      '</div>';
  } else if (bk.trackStatus === 'completed') {
    area.style.display = 'block';
    area.style.background = '#D1FAE5'; area.style.borderColor = '#059669';
    area.innerHTML =
      '<div style="text-align:center">' +
        '<div style="font-size:2rem;margin-bottom:6px">🎉</div>' +
        '<div style="font-size:.85rem;font-weight:700;color:#059669">Serviço concluído!</div>' +
        '<div style="font-size:.75rem;color:var(--text2);margin-top:4px">Pagamento creditado na sua conta.</div>' +
      '</div>';
  } else {
    area.style.display = 'none';
  }
}

// === MODAL DE CÓDIGO DE CHEGADA (pro digita o código que o cliente mostra) ===
function _openArrivalCodeModal(bookingId) {
  const existing = document.getElementById('proArrivalModal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'proArrivalModal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px';

  modal.innerHTML =
    '<div style="background:var(--bg);border-radius:var(--r);padding:28px 24px;max-width:360px;width:100%;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.3)">' +
      '<div style="font-size:2rem;margin-bottom:8px">🔑</div>' +
      '<h3 style="margin:0 0 6px">Confirmar Chegada</h3>' +
      '<p style="font-size:.85rem;color:var(--text2);margin-bottom:20px">Digite o código de 4 dígitos que o cliente mostrará na tela dele.</p>' +
      '<div style="display:flex;gap:8px;justify-content:center;margin-bottom:12px">' +
        '<input id="proArr1" type="text" maxlength="1" inputmode="numeric" style="width:52px;height:58px;text-align:center;font-size:1.5rem;font-weight:800;border:2px solid var(--border);border-radius:12px;background:var(--bg2);color:var(--text)" oninput="_proArrModalNext(this,1)">' +
        '<input id="proArr2" type="text" maxlength="1" inputmode="numeric" style="width:52px;height:58px;text-align:center;font-size:1.5rem;font-weight:800;border:2px solid var(--border);border-radius:12px;background:var(--bg2);color:var(--text)" oninput="_proArrModalNext(this,2)">' +
        '<input id="proArr3" type="text" maxlength="1" inputmode="numeric" style="width:52px;height:58px;text-align:center;font-size:1.5rem;font-weight:800;border:2px solid var(--border);border-radius:12px;background:var(--bg2);color:var(--text)" oninput="_proArrModalNext(this,3)">' +
        '<input id="proArr4" type="text" maxlength="1" inputmode="numeric" style="width:52px;height:58px;text-align:center;font-size:1.5rem;font-weight:800;border:2px solid var(--border);border-radius:12px;background:var(--bg2);color:var(--text)" oninput="_proArrModalNext(this,4)">' +
      '</div>' +
      '<div id="proArrModalErr" style="display:none;color:var(--red);font-size:.82rem;margin-bottom:8px">❌ Código incorreto. Peça ao cliente novamente.</div>' +
      '<button id="proArrModalBtn" onclick="_submitArrivalCode(\'' + bookingId + '\')" style="width:100%;padding:12px;border-radius:var(--rs);background:var(--p);color:#fff;font-weight:700;border:none;cursor:pointer;font-size:.95rem;margin-bottom:8px">Confirmar ✅</button>' +
      '<button onclick="_closeArrivalModal()" style="width:100%;padding:10px;border-radius:var(--rs);background:var(--bg2);color:var(--text2);font-weight:600;border:1px solid var(--border);cursor:pointer;font-size:.85rem">Cancelar</button>' +
    '</div>';

  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) _closeArrivalModal(); });
  setTimeout(() => { const f = document.getElementById('proArr1'); if (f) f.focus(); }, 100);
}

function _proArrModalNext(el, i) {
  el.value = el.value.replace(/\D/g, '');
  if (el.value && i < 4) {
    const next = document.getElementById('proArr' + (i + 1));
    if (next) next.focus();
  }
}

function _closeArrivalModal() {
  const modal = document.getElementById('proArrivalModal');
  if (modal) modal.remove();
}

async function _submitArrivalCode(bookingId) {
  // trim() + replace(/\D/g,'') remove espaços invisíveis que o teclado mobile insere
  const code = [1, 2, 3, 4].map(i => (document.getElementById('proArr' + i).value || '').trim().replace(/\D/g, '')).join('');
  if (!/^\d{4}$/.test(code)) { toast('Digite os 4 dígitos', 'err'); return; }

  const btn = document.getElementById('proArrModalBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Verificando...'; }

  try {
    // Validação via API/Worker
    const res = await safeFetch(API_URL + '/api/verify-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookingId: bookingId, type: 'arrival', code: code })
    }, 15000);

    const data = await res.json();
    if (!data.ok) {
      document.getElementById('proArrModalErr').style.display = 'block';
      [1, 2, 3, 4].forEach(i => { const el = document.getElementById('proArr' + i); if (el) el.value = ''; });
      const f = document.getElementById('proArr1'); if (f) f.focus();
      if (btn) { btn.disabled = false; btn.textContent = 'Confirmar ✅'; }
      return;
    }

    // API já atualizou o booking — o onSnapshot vai atualizar a UI
    _closeArrivalModal();
    toast('Chegada confirmada! Inicie o serviço 🔧', 'ok');
    loadAcceptedRequests(); // atualiza aba "Em andamento" do dashboard

  } catch (e) {
    // Fallback: verificação local (se API não responder)
    console.warn('verify-code API fail, trying local fallback:', e);
    try {
      const snap = await db.collection('bookings').doc(bookingId).get();
      if (!snap.exists) { toast('Reserva não encontrada', 'err'); if (btn) { btn.disabled = false; btn.textContent = 'Confirmar ✅'; } return; }
      const bk = snap.data();
      if (!bk.arrCodeHash) { toast('Código não disponível', 'err'); if (btn) { btn.disabled = false; btn.textContent = 'Confirmar ✅'; } return; }

      const enteredHash = await hashCode(code);
      if (String(enteredHash).trim() !== String(bk.arrCodeHash).trim()) {
        document.getElementById('proArrModalErr').style.display = 'block';
        [1, 2, 3, 4].forEach(i => { const el = document.getElementById('proArr' + i); if (el) el.value = ''; });
        const f = document.getElementById('proArr1'); if (f) f.focus();
        if (btn) { btn.disabled = false; btn.textContent = 'Confirmar ✅'; }
        return;
      }

      // Verificação local OK — atualiza Firestore direto
      await db.collection('bookings').doc(bookingId).update({
        trackStatus: 'pro_arrived',
        arrivedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      _closeArrivalModal();
      toast('Chegada confirmada! Inicie o serviço 🔧', 'ok');
      loadAcceptedRequests();
    } catch (e2) {
      toast('Erro ao verificar código: ' + e2.message, 'err');
      if (btn) { btn.disabled = false; btn.textContent = 'Confirmar ✅'; }
    }
  }
}
