// === PRO DASHBOARD STATE ===
let currentProfessional = null;
let proRequestsListener = null;
const declinedBookings = new Set();

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

  const card = document.createElement('div');
  card.className = 'pro-request-card';
  card.id = 'req-' + bookingId;
  const clientName = esc(booking.userName || (booking.userEmail ? booking.userEmail.split('@')[0] : 'Cliente'));

  card.innerHTML =
    '<div style="display:flex;justify-content:space-between;align-items:start;gap:12px">' +
      '<div style="flex:1">' +
        '<h4 style="margin:0 0 8px 0">' + esc(booking.details && booking.details.svc ? booking.details.svc : (booking.service || 'Serviço')) + '</h4>' +
        '<div class="pro-request-info">' +
          '<div>👤 ' + clientName + '</div>' +
          '<div>📍 ' + addr + '</div>' +
          '<div>📅 ' + date + ' às ' + time + '</div>' +
          '<div>⏱️ ' + esc(timeStr) + '</div>' +
          (desc ? '<div>📝 "' + esc(desc) + '"</div>' : '') +
        '</div>' +
      '</div>' +
      '<div style="text-align:right;flex-shrink:0">' +
        '<div style="font-size:.75rem;color:var(--text2);margin-bottom:4px">Estimativa</div>' +
        '<div style="font-size:1.3rem;font-weight:800;color:var(--p);margin-bottom:12px">R$ ' + esc(String(rate)) + '</div>' +
        '<div style="display:flex;gap:8px;flex-direction:column">' +
          '<button class="btn-chat" onclick="openProChat(\'' + bookingId + '\')">💬 Conversar</button>' +
          '<button class="btn-accept" onclick="acceptRequest(\'' + bookingId + '\')">✅ Aceitar</button>' +
          '<button class="btn-decline" onclick="declineRequest(\'' + bookingId + '\')">❌ Recusar</button>' +
        '</div>' +
      '</div>' +
    '</div>';

  list.appendChild(card);
}

// === ACCEPT REQUEST ===
async function acceptRequest(bookingId) {
  if (!currentProfessional || !CU) return;

  const btn = document.querySelector('#req-' + bookingId + ' .btn-accept');
  if (btn) { btn.disabled = true; btn.textContent = '⏳'; }

  try {
    await db.collection('bookings').doc(bookingId).update({
      acceptedByPro: currentProfessional.name,
      proEmail: currentProfessional.email,
      proId: CU.uid,
      status: 'accepted',
      acceptedAt: firebase.firestore.FieldValue.serverTimestamp()
    });

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
  // Persiste no Firestore para não voltar ao reabrir o dashboard
  if (CU) {
    db.collection('bookings').doc(bookingId).update({
      declinedBy: firebase.firestore.FieldValue.arrayUnion(CU.uid)
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

// === LOAD ACCEPTED REQUESTS ===
async function loadAcceptedRequests() {
  if (!currentProfessional) return;
  try {
    const snap = await db.collection('bookings')
      .where('acceptedByPro', '==', currentProfessional.name)
      .where('status', 'in', ['accepted', 'payment_pending', 'payment_confirmed'])
      .limit(10)
      .get();

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
        statusBadge = '💳 Pagamento confirmado';
        statusColor = '#10B981';
      } else if (booking.status === 'accepted') {
        statusBadge = '✅ Aceito — aguardando cliente';
        statusColor = '#1B65D6';
      }

      const price = booking.price ? 'R$ ' + booking.price.toFixed(2) : '—';
      const addr = esc(booking.details && booking.details.addr ? booking.details.addr : 'Local não informado');
      const clientName = esc(booking.userName || (booking.userEmail ? booking.userEmail.split('@')[0] : 'Cliente'));

      const card = document.createElement('div');
      card.className = 'pro-request-card';
      card.innerHTML =
        '<div style="display:flex;justify-content:space-between;align-items:start;gap:12px">' +
          '<div style="flex:1">' +
            '<h4 style="margin:0 0 4px 0">' + esc(booking.service || '—') + '</h4>' +
            '<div style="font-size:.85rem;color:var(--text2);margin-bottom:4px">👤 ' + clientName + '</div>' +
            '<div style="font-size:.85rem;color:var(--text2);margin-bottom:8px">📍 ' + addr + '</div>' +
            '<div style="display:inline-block;padding:4px 8px;border-radius:4px;font-size:.75rem;font-weight:700;background:' + statusColor + '22;color:' + statusColor + '">' + statusBadge + '</div>' +
          '</div>' +
          '<div style="text-align:right;flex-shrink:0;display:flex;flex-direction:column;align-items:flex-end;gap:8px">' +
            '<div style="font-size:1.3rem;font-weight:800;color:var(--p)">' + price + '</div>' +
            '<button class="btn-chat" onclick="openProChat(\'' + bookingId + '\')">💬 Conversar</button>' +
          '</div>' +
        '</div>';

      list.appendChild(card);
    });
  } catch (e) {
    console.error('Erro ao carregar pedidos aceitos:', e);
  }
}

// === LOAD COMPLETED REQUESTS ===
async function loadCompletedRequests() {
  if (!currentProfessional) return;
  try {
    const snap = await db.collection('bookings')
      .where('acceptedByPro', '==', currentProfessional.name)
      .where('status', '==', 'completed')
      .limit(30)
      .get();

    const list = document.getElementById('completedList');
    const noEl = document.getElementById('noCompleted');
    if (!list) return;
    list.innerHTML = '';

    if (snap.empty) {
      if (noEl) noEl.style.display = 'block';
      return;
    }
    if (noEl) noEl.style.display = 'none';

    // Sort client-side by completedAt desc (avoids composite index requirement)
    const docs = [];
    snap.forEach(doc => docs.push({ id: doc.id, ...doc.data() }));
    docs.sort((a, b) => {
      const ta = a.completedAt ? a.completedAt.toMillis() : 0;
      const tb = b.completedAt ? b.completedAt.toMillis() : 0;
      return tb - ta;
    });

    docs.forEach(booking => {
      const completedDate = booking.completedAt ? booking.completedAt.toDate() : new Date();
      const dateStr = completedDate.toLocaleDateString('pt-BR');
      const earned = booking.price ? (booking.price * 0.75).toFixed(2) : '—';

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
            '<div style="font-size:.75rem;color:var(--text2)">Você recebeu</div>' +
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
  if (!currentProfessional) return;
  try {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);

    // This month
    const monthSnap = await db.collection('bookings')
      .where('acceptedByPro', '==', currentProfessional.name)
      .where('status', '==', 'completed')
      .get();

    let monthEarnings = 0, monthCount = 0;
    let totalEarnings = 0, totalCount = 0;

    monthSnap.forEach(doc => {
      const d = doc.data();
      totalEarnings += (d.price || 0) * 0.75;
      totalCount++;
      const at = d.completedAt ? d.completedAt.toDate() : null;
      if (at && at >= firstDay) {
        monthEarnings += (d.price || 0) * 0.75;
        monthCount++;
      }
    });

    const emEl = document.getElementById('earningsMonth');
    const scmEl = document.getElementById('serviceCountMonth');
    const etEl = document.getElementById('earningsTotal');
    const sctEl = document.getElementById('serviceCountTotal');

    if (emEl) emEl.textContent = 'R$ ' + monthEarnings.toFixed(2);
    if (scmEl) scmEl.textContent = monthCount + ' serviço' + (monthCount !== 1 ? 's' : '');
    if (etEl) etEl.textContent = 'R$ ' + totalEarnings.toFixed(2);
    if (sctEl) sctEl.textContent = totalCount + ' serviço' + (totalCount !== 1 ? 's' : '');

    // Last 10 payments (sort client-side)
    const docs = [];
    monthSnap.forEach(doc => docs.push({ id: doc.id, ...doc.data() }));
    docs.sort((a, b) => {
      const ta = a.completedAt ? a.completedAt.toMillis() : 0;
      const tb = b.completedAt ? b.completedAt.toMillis() : 0;
      return tb - ta;
    });

    const payList = document.getElementById('paymentsList');
    if (!payList) return;
    payList.innerHTML = '';

    docs.slice(0, 10).forEach(booking => {
      const date = booking.completedAt ? booking.completedAt.toDate() : new Date();
      const earned = ((booking.price || 0) * 0.75).toFixed(2);
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
  if (_proChatListener) {
    _proChatListener();
    _proChatListener = null;
  }
  currentProfessional = null;
  if (typeof showClientView === 'function') showClientView();
}

// === PRO CHAT (real-time) ===
let _proChatListener = null;
let _proChatBookingId = null;
let _proSeenMsgIds = new Set();

async function openProChat(bookingId) {
  if (!CU || !currentProfessional) return;
  _proChatBookingId = bookingId;
  _proSeenMsgIds = new Set();
  if (_proChatListener) { _proChatListener(); _proChatListener = null; }

  document.getElementById('proChatMsgs').innerHTML = '';
  document.getElementById('proChatNm').textContent = 'Cliente';
  document.getElementById('proChatAddr').textContent = '';
  document.getElementById('proChatSvc').textContent = '';
  document.getElementById('proChatAv').textContent = '👤';
  openM('proChatM');

  // Fetch booking details for header
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
    }
  } catch (e) {
    console.error('booking fetch error:', e);
  }

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
        let cls;
        if (d.sender === 'sys') cls = 'sys';
        else if (d.sender === 'pro') cls = 'sent';
        else cls = 'recv';
        const div = document.createElement('div');
        div.className = 'cmsg ' + cls;
        div.textContent = d.text;
        m.appendChild(div);
      });
      m.scrollTop = m.scrollHeight;
    }, err => console.error('pro chat listener:', err));
}

function closeProChat() {
  if (_proChatListener) { _proChatListener(); _proChatListener = null; }
  _proChatBookingId = null;
  _proSeenMsgIds = new Set();
  closeM('proChatM');
}

function sendProMsg() {
  const inp = document.getElementById('proChatIn'), msg = inp.value.trim();
  if (!msg || !_proChatBookingId || !CU || !currentProfessional) return;
  inp.value = '';
  // Block external contacts (reuse global BLOCK from chat.js)
  if (typeof BLOCK !== 'undefined' && BLOCK.some(p => p.test(msg))) {
    const m = document.getElementById('proChatMsgs');
    const blk = document.createElement('div');
    blk.className = 'cmsg blk';
    blk.textContent = '⛔ Contato externo bloqueado';
    m.appendChild(blk);
    m.scrollTop = m.scrollHeight;
    return;
  }
  db.collection('messages').add({
    bookingId: _proChatBookingId,
    text: msg,
    sender: 'pro',
    proName: currentProfessional.name,
    proId: CU.uid,
    seq: Date.now(),
    at: firebase.firestore.FieldValue.serverTimestamp()
  }).catch(e => console.error('sendProMsg error:', e));
}
