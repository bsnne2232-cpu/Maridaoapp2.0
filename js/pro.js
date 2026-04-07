// === PRO FORM AUTO-FILL ===
function initProForm() {
  if (CU) {
    const emailField = document.getElementById('proEmail');
    const nameField = document.getElementById('proName');
    if (emailField) emailField.value = CU.email || '';
    if (nameField && !nameField.value && CU.displayName) nameField.value = CU.displayName;
  }
}

// === RATE LABEL BY SPECIALTY ===
const RATE_LABELS = {
  'Faxina / Diarista': 'Valor por dia (R$)',
  'Encanamento': 'Valor por serviço (R$)',
  'Elétrica': 'Valor por serviço (R$)',
  'Pintura': 'Valor por dia (R$)',
  'Montagem de móveis': 'Valor por serviço (R$)',
  'Ar-condicionado': 'Valor por serviço (R$)',
  'Jardinagem': 'Valor por dia (R$)',
  'Chaveiro': 'Valor por serviço (R$)',
  'Pet Sitter': 'Valor por dia (R$)',
  'Carreto': 'Valor por serviço (R$)',
  'Mudança': 'Valor por serviço (R$)',
  'Outro': 'Valor por serviço (R$)'
};

function updateRateLabel() {
  const spec = document.getElementById('proSpec').value;
  const lbl = document.getElementById('rateLbl');
  if (lbl) lbl.textContent = (RATE_LABELS[spec] || 'Valor por serviço (R$)') + ' *';
}

// === TERMS POPUP ===
function openTermsPro() {
  if (!reqLogin()) return;
  if (!document.getElementById('proSpec').value) return toast('Selecione especialidade', 'err');
  const rate = parseFloat(document.getElementById('proRate').value);
  if (!rate || rate <= 0 || rate > 10000) return toast('Valor inválido', 'err');
  const name = document.getElementById('proName').value.trim();
  if (name.length < 3 || name.length > 100) return toast('Nome inválido (mín. 3 caracteres)', 'err');
  const cep = document.getElementById('proCep').value.trim().replace(/\D/g, '');
  if (cep.length !== 8) return toast('CEP inválido', 'err');
  openM('termsProM');
}

// === PRO FORM NAVIGATION WITH VALIDATION ===
function proNext(s) {
  if (s === 1) { initProForm(); }
  if (s === 2) {
    if (!reqLogin()) return;
    const m = [];
    const nm = document.getElementById('proName').value.trim();
    const cep = document.getElementById('proCep').value.trim();
    if (!nm || nm.length < 3) m.push('nome (mín. 3 caracteres)');
    if (!cep || cep.replace(/\D/g, '').length !== 8) m.push('CEP válido');
    if (m.length) { toast('Preencha: ' + m.join(', '), 'err'); return; }
  }
  document.querySelectorAll('.form-card .panel').forEach(p => p.classList.remove('active'));
  document.getElementById('proS' + s).classList.add('active');
  ['fs1', 'fs2'].forEach((id, i) => {
    const e = document.getElementById(id);
    if (!e) return;
    e.classList.remove('active', 'done');
    if (i + 1 === s) e.classList.add('active');
    else if (i + 1 < s) e.classList.add('done');
  });
}

// === SUBMIT PRO PROFILE (called from terms modal) ===
async function submitPro() {
  if (!reqLogin()) return;
  if (!document.getElementById('proTermsCheck').checked) return toast('Aceite os termos de adesão', 'err');
  if (!document.getElementById('proSpec').value) return toast('Selecione especialidade', 'err');
  const rate = parseFloat(document.getElementById('proRate').value);
  if (!rate || rate <= 0 || rate > 10000) return toast('Valor inválido', 'err');
  const name = document.getElementById('proName').value.trim();
  if (name.length < 3 || name.length > 100) return toast('Nome inválido', 'err');
  const cep = document.getElementById('proCep').value.trim().replace(/\D/g, '');
  if (cep.length !== 8) return toast('CEP inválido', 'err');
  const bio = document.getElementById('proBio').value.trim().slice(0, 500);
  const d = {
    uid: CU.uid,
    name: name,
    email: CU.email,
    cep: cep,
    spec: document.getElementById('proSpec').value,
    rate: rate,
    radius: document.getElementById('proRadius').value,
    bio: bio,
    docsSubmitted: false, docsStatus: 'none', status: 'active',
    at: firebase.firestore.FieldValue.serverTimestamp()
  };
  const btn = document.getElementById('submitProBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Criando...'; }
  try {
    // Check if already registered
    const existing = await db.collection('professionals').where('uid', '==', CU.uid).limit(1).get();
    if (!existing.empty) {
      closeM('termsProM');
      toast('Você já tem um perfil profissional!', 'inf');
      if (btn) { btn.disabled = false; btn.textContent = 'Confirmar e criar perfil →'; }
      return;
    }
    await db.collection('professionals').add(d);
    closeM('termsProM');
    proNext(3);
    toast('Perfil criado! 🎉', 'ok');
  } catch (e) {
    toast('Erro ao criar perfil. Tente novamente.', 'err');
  }
  if (btn) { btn.disabled = false; btn.textContent = 'Confirmar e criar perfil →'; }
}

// === SUBMIT PRO DOCUMENTS (when accepting first service) ===
async function submitProDocs() {
  if (!CU) { toast('Faça login para continuar', 'err'); return; }
  const cpf = document.getElementById('dCPF').value.trim();
  const dob = document.getElementById('dDob').value;
  const pix = document.getElementById('dPix').value.trim();
  if (!cpf || cpf.replace(/\D/g, '').length !== 11) return toast('CPF inválido', 'err');
  if (!dob) return toast('Preencha data de nascimento', 'err');
  const dobDate = new Date(dob);
  const age = (Date.now() - dobDate.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
  if (age < 18) return toast('Você deve ter 18 anos ou mais', 'err');
  if (age > 120) return toast('Data de nascimento inválida', 'err');
  if (!document.getElementById('dUpDoc').classList.contains('uploaded')) return toast('Envie seu RG ou CNH', 'err');
  if (!document.getElementById('dUpSelfie').classList.contains('uploaded')) return toast('Envie a selfie', 'err');
  if (!document.getElementById('dUpAddr').classList.contains('uploaded')) return toast('Envie comprovante', 'err');
  if (!pix || pix.length < 5 || pix.length > 100) return toast('Chave PIX inválida', 'err');
  if (!document.getElementById('dTerms').checked) return toast('Aceite os termos', 'err');
  const cpfDigits = cpf.replace(/\D/g, '');
  const cpfMasked = '***.***.'+cpfDigits.slice(6,9)+'-**';
  try {
    const snap = await db.collection('professionals').where('uid', '==', CU.uid).limit(1).get();
    if (snap.empty) {
      // fallback to email lookup
      const snap2 = await db.collection('professionals').where('email', '==', CU.email).limit(1).get();
      if (snap2.empty) { toast('Perfil profissional não encontrado', 'err'); return; }
      snap2.forEach(d => d.ref.update({ cpfMasked, dob, pix, docsSubmitted: true, docsStatus: 'pending' }));
    } else {
      snap.forEach(d => d.ref.update({ cpfMasked, dob, pix, docsSubmitted: true, docsStatus: 'pending' }));
    }
    closeM('docsM'); openM('pendingM'); toast('Documentos enviados!', 'ok');
  } catch (e) { toast('Erro ao enviar documentos. Tente novamente.', 'err'); }
}
async function submitDocs() { await submitProDocs(); }
