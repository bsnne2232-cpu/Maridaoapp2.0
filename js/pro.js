// === PRO FORM NAVIGATION WITH VALIDATION ===
function proNext(s) {
  if (s === 2) {
    const m = [];
    const nm = document.getElementById('proName').value.trim();
    const em = document.getElementById('proEmail').value.trim();
    const cep = document.getElementById('proCep').value.trim();
    if (!nm || nm.length < 3) m.push('nome (mín. 3 caracteres)');
    if (!em || !isValidEmail(em)) m.push('e-mail válido');
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

// === SUBMIT PRO PROFILE (basic info only, no docs) ===
async function submitPro() {
  if (!document.getElementById('proTerms').checked) return toast('Aceite os termos', 'err');
  if (!document.getElementById('proSpec').value) return toast('Selecione especialidade', 'err');
  const rate = parseFloat(document.getElementById('proRate').value);
  if (!rate || rate <= 0 || rate > 10000) return toast('Valor/hora inválido', 'err');
  const email = document.getElementById('proEmail').value.trim();
  if (!isValidEmail(email)) return toast('E-mail inválido', 'err');
  const name = document.getElementById('proName').value.trim();
  if (name.length < 3 || name.length > 100) return toast('Nome inválido', 'err');
  const cep = document.getElementById('proCep').value.trim().replace(/\D/g, '');
  if (cep.length !== 8) return toast('CEP inválido', 'err');
  const bio = document.getElementById('proBio').value.trim().slice(0, 500);
  const d = {
    name: name, email: email, cep: cep,
    spec: document.getElementById('proSpec').value,
    rate: rate,
    radius: document.getElementById('proRadius').value,
    bio: bio,
    docsSubmitted: false, docsStatus: 'none', status: 'active',
    at: firebase.firestore.FieldValue.serverTimestamp()
  };
  try {
    await db.collection('professionals').add(d);
    proNext(3); toast('Perfil criado! 🎉', 'ok');
  } catch (e) { toast('Erro ao criar perfil. Tente novamente.', 'err'); }
}

// === SUBMIT PRO DOCUMENTS (when accepting first service) ===
async function submitProDocs() {
  if (!CU) { toast('Faça login para continuar', 'err'); return; }
  const cpf = document.getElementById('dCPF').value.trim();
  const dob = document.getElementById('dDob').value;
  const pix = document.getElementById('dPix').value.trim();
  if (!cpf || cpf.replace(/\D/g, '').length !== 11) return toast('CPF inválido', 'err');
  if (!dob) return toast('Preencha data de nascimento', 'err');
  // Validate age (must be 18+)
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
    const snap = await db.collection('professionals').where('email', '==', CU.email).limit(1).get();
    if (snap.empty) { toast('Perfil profissional não encontrado', 'err'); return; }
    snap.forEach(d => d.ref.update({ cpfMasked, dob, pix, docsSubmitted: true, docsStatus: 'pending' }));
    closeM('docsM'); openM('pendingM'); toast('Documentos enviados!', 'ok');
  } catch (e) { toast('Erro ao enviar documentos. Tente novamente.', 'err'); }
}
async function submitDocs() { await submitProDocs(); }
