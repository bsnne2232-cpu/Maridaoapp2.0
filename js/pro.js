// === PRO FORM NAVIGATION WITH VALIDATION ===
function proNext(s) {
  if (s === 2) {
    const m = [];
    if (!document.getElementById('proName').value.trim()) m.push('nome');
    if (!document.getElementById('proEmail').value.trim()) m.push('e-mail');
    if (!document.getElementById('proCep').value.trim()) m.push('CEP');
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

// === SUBMIT PRO PROFILE (basic info only, no docs) ===
async function submitPro() {
  if (!document.getElementById('proTerms').checked) return toast('Aceite os termos', 'err');
  if (!document.getElementById('proSpec').value) return toast('Selecione especialidade', 'err');
  if (!document.getElementById('proRate').value) return toast('Preencha valor/hora', 'err');
  const d = {
    name: document.getElementById('proName').value,
    email: document.getElementById('proEmail').value,
    cep: document.getElementById('proCep').value,
    spec: document.getElementById('proSpec').value,
    rate: document.getElementById('proRate').value,
    radius: document.getElementById('proRadius').value,
    bio: document.getElementById('proBio').value,
    docsSubmitted: false, docsStatus: 'none', status: 'active',
    at: firebase.firestore.FieldValue.serverTimestamp()
  };
  try {
    await db.collection('professionals').add(d);
    proNext(3); toast('Perfil criado! 🎉', 'ok');
  } catch (e) { toast('Erro: ' + e.message, 'err'); }
}

// === SUBMIT PRO DOCUMENTS (when accepting first service) ===
async function submitProDocs() {
  const cpf = document.getElementById('dCPF').value.trim();
  const dob = document.getElementById('dDob').value;
  const pix = document.getElementById('dPix').value.trim();
  if (!cpf || cpf.replace(/\D/g, '').length < 11) return toast('CPF inválido', 'err');
  if (!dob) return toast('Preencha data de nascimento', 'err');
  if (!document.getElementById('dUpDoc').classList.contains('uploaded')) return toast('Envie seu RG ou CNH', 'err');
  if (!document.getElementById('dUpSelfie').classList.contains('uploaded')) return toast('Envie a selfie', 'err');
  if (!document.getElementById('dUpAddr').classList.contains('uploaded')) return toast('Envie comprovante', 'err');
  if (!pix) return toast('Preencha sua chave PIX', 'err');
  if (!document.getElementById('dTerms').checked) return toast('Aceite os termos', 'err');
  const cpfMasked = '***.***.'+cpf.replace(/\D/g,'').slice(7,10)+'-**';
  try {
    const snap = await db.collection('professionals').where('email', '==', CU.email).limit(1).get();
    snap.forEach(d => d.ref.update({ cpfMasked, dob, pix, docsSubmitted: true, docsStatus: 'pending' }));
    closeM('docsM'); openM('pendingM'); toast('Documentos enviados!', 'ok');
  } catch (e) { toast('Erro: ' + e.message, 'err'); }
}
async function submitDocs() { submitProDocs(); }
