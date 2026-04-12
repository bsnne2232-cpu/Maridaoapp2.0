/**
 * Maridão App — Cloudflare Worker
 * =================================
 * Endpoints:
 *   POST /api/validate-cpf     (já existia; reimplementado aqui)
 *   POST /api/generate-codes   (já existia; mantido como fallback)
 *   POST /api/process-payment  (NOVO — orquestra Asaas + Firestore com segurança)
 *   POST /api/verify-code      (já existia; mantido)
 *
 * Segurança:
 *   - Todas as rotas (exceto /validate-cpf) exigem um Firebase ID Token no
 *     header Authorization: Bearer <token>. O token é verificado via JWKS
 *     do Google — sem isso, o Worker retorna 401 e nada toca o Firestore.
 *   - A atualização do booking no Firestore acontece via REST API
 *     authenticada com OAuth2 + service account JWT (gerado com SubtleCrypto).
 *     Isso bypassa as firestore.rules (o service account é god mode) —
 *     por isso NENHUMA rota confia em input do cliente para valor, status,
 *     ou códigos de verificação.
 *
 * Secrets esperados (wrangler.toml → [vars] + wrangler secret put):
 *   FIREBASE_PROJECT_ID                ex: maridaoapp-cbb4e
 *   FIREBASE_CLIENT_EMAIL              ex: firebase-adminsdk-xxx@...iam.gserviceaccount.com
 *   FIREBASE_PRIVATE_KEY               private key PEM, com '\n' literais
 *   ASAAS_API_KEY                      sandbox/produção
 *   ASAAS_ENV                          'sandbox' ou 'prod'
 *   ALLOWED_ORIGIN                     ex: https://maridao.app (ou * em dev)
 */

const MARIDAO_COMMISSION = 0.10;

// ---------------------------------------------------------------------------
// HANDLER
// ---------------------------------------------------------------------------
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(env) });
    }

    try {
      if (url.pathname === '/api/validate-cpf'    && request.method === 'POST') return withCors(await handleValidateCpf(request), env);
      if (url.pathname === '/api/generate-codes'  && request.method === 'POST') return withCors(await handleGenerateCodes(request, env), env);
      if (url.pathname === '/api/process-payment' && request.method === 'POST') return withCors(await handleProcessPayment(request, env), env);
      if (url.pathname === '/api/verify-code'     && request.method === 'POST') return withCors(await handleVerifyCode(request, env), env);
      return withCors(json({ error: 'not found' }, 404), env);
    } catch (e) {
      console.error('[worker]', e && e.stack || e);
      return withCors(json({ error: 'internal' }, 500), env);
    }
  }
};

// ---------------------------------------------------------------------------
// CORS HELPERS
// ---------------------------------------------------------------------------
function corsHeaders(env) {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400'
  };
}
function withCors(res, env) {
  const h = new Headers(res.headers);
  Object.entries(corsHeaders(env)).forEach(([k, v]) => h.set(k, v));
  return new Response(res.body, { status: res.status, headers: h });
}
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

// ---------------------------------------------------------------------------
// AUTH — verifica Firebase ID Token via JWKS do Google
// ---------------------------------------------------------------------------
let _jwksCache = null, _jwksCacheAt = 0;
const JWKS_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

async function verifyIdToken(request, env) {
  const hdr = request.headers.get('Authorization') || '';
  const m = hdr.match(/^Bearer\s+(.+)$/i);
  if (!m) return { ok: false, status: 401, error: 'missing bearer token' };
  const token = m[1];

  const parts = token.split('.');
  if (parts.length !== 3) return { ok: false, status: 401, error: 'malformed token' };
  const [h64, p64, s64] = parts;

  const header  = JSON.parse(atobUrl(h64));
  const payload = JSON.parse(atobUrl(p64));
  const sig     = atobUrlToBytes(s64);
  const signed  = new TextEncoder().encode(parts[0] + '.' + parts[1]);

  // Cache 1h — Google rotaciona as chaves raramente e elas vêm com max-age
  const now = Math.floor(Date.now() / 1000);
  if (!_jwksCache || now - _jwksCacheAt > 3600) {
    const res = await fetch(JWKS_URL);
    _jwksCache = await res.json();
    _jwksCacheAt = now;
  }
  const pem = _jwksCache[header.kid];
  if (!pem) return { ok: false, status: 401, error: 'unknown kid' };

  const key = await importX509(pem);
  const valid = await crypto.subtle.verify(
    { name: 'RSASSA-PKCS1-v1_5' }, key, sig, signed
  );
  if (!valid) return { ok: false, status: 401, error: 'bad signature' };

  // Claim checks
  if (payload.exp < now) return { ok: false, status: 401, error: 'expired' };
  if (payload.iat > now + 60) return { ok: false, status: 401, error: 'iat in future' };
  if (payload.aud !== env.FIREBASE_PROJECT_ID) return { ok: false, status: 401, error: 'bad audience' };
  if (payload.iss !== 'https://securetoken.google.com/' + env.FIREBASE_PROJECT_ID) {
    return { ok: false, status: 401, error: 'bad issuer' };
  }
  if (!payload.sub) return { ok: false, status: 401, error: 'no sub' };
  return { ok: true, uid: payload.sub, email: payload.email, claims: payload };
}

function atobUrl(b64url) {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((b64url.length + 3) % 4);
  return atob(b64);
}
function atobUrlToBytes(b64url) {
  const bin = atobUrl(b64url);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
async function importX509(pem) {
  const b64 = pem
    .replace('-----BEGIN CERTIFICATE-----', '')
    .replace('-----END CERTIFICATE-----', '')
    .replace(/\s+/g, '');
  // The JWKS x509 is a full cert; Web Crypto wants SPKI. Extract SPKI from cert:
  const der = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const spki = extractSpkiFromX509(der);
  return crypto.subtle.importKey(
    'spki', spki, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']
  );
}
// Minimal ASN.1 walker to pull the SubjectPublicKeyInfo out of an X.509
// certificate. Works for the Google securetoken certs which follow the
// standard RFC5280 layout.
function extractSpkiFromX509(der) {
  // cert = SEQUENCE { tbsCertificate SEQUENCE { version, serial, sigAlgo,
  //                   issuer, validity, subject, subjectPublicKeyInfo, ... } }
  let p = 0;
  function readLen() {
    let l = der[p++];
    if (l & 0x80) {
      const n = l & 0x7f;
      l = 0;
      for (let i = 0; i < n; i++) l = (l << 8) | der[p++];
    }
    return l;
  }
  function skip() { p++; const l = readLen(); p += l; }
  function enter() { p++; readLen(); }
  enter();   // outer cert SEQ
  enter();   // tbsCertificate SEQ
  // version [0] EXPLICIT
  if (der[p] === 0xa0) { p++; const l = readLen(); p += l; }
  skip();    // serialNumber
  skip();    // signature AlgorithmIdentifier
  skip();    // issuer
  skip();    // validity
  skip();    // subject
  // subjectPublicKeyInfo
  const start = p;
  p++; const l = readLen();
  const end = p + l;
  return der.slice(start, end);
}

// ---------------------------------------------------------------------------
// FIRESTORE REST — service account OAuth2 flow
// ---------------------------------------------------------------------------
let _gcpToken = null, _gcpTokenExp = 0;

async function getAccessToken(env) {
  const now = Math.floor(Date.now() / 1000);
  if (_gcpToken && now < _gcpTokenExp - 60) return _gcpToken;

  const header = { alg: 'RS256', typ: 'JWT' };
  const claims = {
    iss: env.FIREBASE_CLIENT_EMAIL,
    scope: 'https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/cloud-platform',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  };
  const jwt = await signServiceAccountJwt(header, claims, env.FIREBASE_PRIVATE_KEY);

  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: jwt
  });
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  });
  if (!res.ok) throw new Error('oauth failed: ' + (await res.text()));
  const data = await res.json();
  _gcpToken = data.access_token;
  _gcpTokenExp = now + (data.expires_in || 3600);
  return _gcpToken;
}

async function signServiceAccountJwt(header, claims, pkPem) {
  const headerB64  = b64url(JSON.stringify(header));
  const payloadB64 = b64url(JSON.stringify(claims));
  const unsigned   = headerB64 + '.' + payloadB64;

  const pem = pkPem.replace(/\\n/g, '\n');
  const pemBody = pem.replace('-----BEGIN PRIVATE KEY-----', '')
                     .replace('-----END PRIVATE KEY-----', '')
                     .replace(/\s+/g, '');
  const der = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    'pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned)
  );
  return unsigned + '.' + b64urlBytes(new Uint8Array(sig));
}

function b64url(str) {
  return btoa(unescape(encodeURIComponent(str)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlBytes(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function firestoreBase(env) {
  return 'https://firestore.googleapis.com/v1/projects/' + env.FIREBASE_PROJECT_ID + '/databases/(default)/documents';
}

// Converte um valor JS em Firestore REST "Value"
function fsValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string')  return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number')  return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (v instanceof Date)      return { timestampValue: v.toISOString() };
  if (Array.isArray(v))       return { arrayValue: { values: v.map(fsValue) } };
  if (typeof v === 'object')  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fsValue(x)])) } };
  return { stringValue: String(v) };
}
function fsUnwrap(val) {
  if (!val) return null;
  if ('stringValue'    in val) return val.stringValue;
  if ('booleanValue'   in val) return val.booleanValue;
  if ('integerValue'   in val) return parseInt(val.integerValue, 10);
  if ('doubleValue'    in val) return val.doubleValue;
  if ('timestampValue' in val) return val.timestampValue;
  if ('nullValue'      in val) return null;
  if ('arrayValue'     in val) return (val.arrayValue.values || []).map(fsUnwrap);
  if ('mapValue'       in val) {
    const o = {};
    for (const [k, v] of Object.entries(val.mapValue.fields || {})) o[k] = fsUnwrap(v);
    return o;
  }
  return null;
}

async function firestoreGet(env, collection, docId) {
  const tok = await getAccessToken(env);
  const res = await fetch(firestoreBase(env) + '/' + collection + '/' + docId, {
    headers: { Authorization: 'Bearer ' + tok }
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('firestore get failed: ' + (await res.text()));
  const doc = await res.json();
  const out = {};
  for (const [k, v] of Object.entries(doc.fields || {})) out[k] = fsUnwrap(v);
  return out;
}

// PATCH apenas os campos listados, preservando os demais (updateMask).
async function firestorePatch(env, collection, docId, fields) {
  const tok = await getAccessToken(env);
  const mask = Object.keys(fields).map(k => 'updateMask.fieldPaths=' + encodeURIComponent(k)).join('&');
  const body = {
    fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, fsValue(v)]))
  };
  const res = await fetch(firestoreBase(env) + '/' + collection + '/' + docId + '?' + mask, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error('firestore patch failed: ' + (await res.text()));
  return res.json();
}

// ---------------------------------------------------------------------------
// UTILS — código de 4 dígitos + hash SHA-256 com salt
// ---------------------------------------------------------------------------
function rand4() {
  const buf = new Uint8Array(2);
  crypto.getRandomValues(buf);
  const n = ((buf[0] << 8) | buf[1]) % 10000;
  return String(n).padStart(4, '0');
}
async function sha256Hex(str) {
  const data = new TextEncoder().encode(str + '_maridao_salt_2025');
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// CPF dígitos verificadores (mesma lógica do frontend)
function validateCpfDigits(cpf) {
  cpf = cpf.replace(/\D/g, '');
  if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false;
  let s = 0, r;
  for (let i = 0; i < 9; i++)  s += +cpf[i] * (10 - i);
  r = (s * 10) % 11; if (r >= 10) r = 0;
  if (r !== +cpf[9]) return false;
  s = 0;
  for (let i = 0; i < 10; i++) s += +cpf[i] * (11 - i);
  r = (s * 10) % 11; if (r >= 10) r = 0;
  return r === +cpf[10];
}

// ---------------------------------------------------------------------------
// ASAAS — integração de split
// ---------------------------------------------------------------------------
async function asaasCharge(env, { amountCents, description, payerName, payerEmail, method, proPix, commissionCents }) {
  if (!env.ASAAS_API_KEY) {
    // Modo dev/sandbox sem Asaas configurado: simula uma cobrança aprovada.
    // NUNCA habilite em produção — retorne erro se não tiver a chave.
    if (env.ASAAS_ENV === 'prod') throw new Error('Asaas not configured');
    return { id: 'mock_' + Date.now(), status: 'CONFIRMED', mocked: true };
  }
  const base = env.ASAAS_ENV === 'prod'
    ? 'https://api.asaas.com/v3'
    : 'https://sandbox.asaas.com/api/v3';
  // NB: a criação real de cobrança no Asaas exige customerId. Em produção,
  // você deve criar/buscar o customer antes (POST /customers). Aqui o código
  // é um stub educativo — adapte para o seu fluxo.
  const res = await fetch(base + '/payments', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'access_token': env.ASAAS_API_KEY
    },
    body: JSON.stringify({
      customer: payerEmail, // substituir pelo customerId real
      billingType: method === 'pix' ? 'PIX' : method === 'card' ? 'CREDIT_CARD' : 'BOLETO',
      value: amountCents / 100,
      description: description,
      split: proPix ? [{
        walletId: proPix,               // wallet do profissional
        fixedValue: (amountCents - commissionCents) / 100
      }] : undefined
    })
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error('asaas failed: ' + res.status + ' ' + body);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// RATE LIMIT em memória (por IP). Simples — para 1k usuários é suficiente.
// ---------------------------------------------------------------------------
const _rl = new Map();
function rateLimited(request, key, maxPerMin) {
  const ip = request.headers.get('CF-Connecting-IP') || 'anon';
  const slot = key + ':' + ip + ':' + Math.floor(Date.now() / 60000);
  const c = (_rl.get(slot) || 0) + 1;
  _rl.set(slot, c);
  if (_rl.size > 5000) { // cleanup grosseiro
    for (const k of _rl.keys()) { _rl.delete(k); if (_rl.size < 2500) break; }
  }
  return c > maxPerMin;
}

// ===========================================================================
// HANDLERS
// ===========================================================================

// --- /api/validate-cpf  (público, sem auth) ---
async function handleValidateCpf(request) {
  if (rateLimited(request, 'cpf', 10)) return json({ error: 'rate limited' }, 429);
  let body;
  try { body = await request.json(); } catch (_) { return json({ error: 'bad json' }, 400); }
  const cpf = (body.cpf || '').replace(/\D/g, '');
  if (!validateCpfDigits(cpf)) return json({ valid: false });
  const masked = '***.***.' + cpf.slice(6, 9) + '-**';
  return json({ valid: true, masked });
}

// --- /api/generate-codes  (auth) ---
// Fallback histórico. Agora /api/process-payment também gera e grava os
// códigos, mas mantemos este endpoint para compatibilidade reversa.
async function handleGenerateCodes(request, env) {
  const auth = await verifyIdToken(request, env);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  if (rateLimited(request, 'gen', 20)) return json({ error: 'rate limited' }, 429);
  return json({ arrivalCode: rand4(), completionCode: rand4() });
}

// --- /api/process-payment  (auth) ---
// Entrada autorizada única para pagamentos. O cliente envia APENAS:
//   { bookingId, method, card? }
// O Worker:
//   1. Valida ID token → uid
//   2. Carrega /bookings/{bookingId} via Firestore REST
//   3. Confirma que auth.uid == booking.userId
//   4. Lê agreedPrice do DOCUMENTO (ignora qualquer valor do payload)
//   5. Calcula comissão (10%) e taxa de gateway localmente
//   6. Busca dados do profissional (PIX) e dispara cobrança no Asaas com split
//   7. Gera códigos de chegada/conclusão e grava tudo no booking
//   8. Retorna arrivalCode + completionCode para o cliente exibir na tela
//      de rastreamento — nunca trafega compCodeHash no payload de retorno.
async function handleProcessPayment(request, env) {
  const auth = await verifyIdToken(request, env);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  if (rateLimited(request, 'pay', 10)) return json({ error: 'rate limited' }, 429);

  let body;
  try { body = await request.json(); } catch (_) { return json({ error: 'bad json' }, 400); }
  const bookingId = String(body.bookingId || '').trim();
  const method    = String(body.method || 'card');
  if (!bookingId) return json({ error: 'missing bookingId' }, 400);
  if (!['card', 'pix', 'boleto'].includes(method)) return json({ error: 'bad method' }, 400);

  // 1) Carrega o booking (fonte única da verdade p/ valor)
  const booking = await firestoreGet(env, 'bookings', bookingId);
  if (!booking) return json({ error: 'booking not found' }, 404);
  if (booking.userId !== auth.uid) return json({ error: 'forbidden' }, 403);
  if (booking.trackStatus === 'paid' || booking.status === 'payment_confirmed') {
    return json({ error: 'already paid' }, 409);
  }
  const priceReais = Number(booking.agreedPrice || 0);
  if (!priceReais || priceReais < 10 || priceReais > 50000) {
    return json({ error: 'invalid booking price' }, 400);
  }

  // 2) Calcula valores — SEMPRE no servidor, ignora payload
  const amountCents = Math.round(priceReais * 100);
  const commissionCents = Math.round(amountCents * MARIDAO_COMMISSION);

  // 3) Busca dados do profissional p/ o split (PIX/wallet)
  let proPix = null;
  if (booking.proId) {
    try {
      // professionals é indexado por docId, mas proId é o uid → precisamos buscar
      // OU, se o app já gravou proDocId no booking no momento do accept, use isso.
      // Aqui assumimos que o dashboard grava proId = CU.uid e, em outro fluxo,
      // grava proDocId = id do doc em /professionals. Ajuste conforme seu schema.
      const proDocId = booking.proDocId || null;
      if (proDocId) {
        const pro = await firestoreGet(env, 'professionals', proDocId);
        if (pro && pro.pix) proPix = pro.pix;
      }
    } catch (_) { /* best effort */ }
  }

  // 4) Cria cobrança no Asaas (ou mock em sandbox)
  let charge;
  try {
    charge = await asaasCharge(env, {
      amountCents,
      commissionCents,
      description: 'Maridão — ' + (booking.service || 'serviço'),
      payerName: booking.userName || '',
      payerEmail: booking.userEmail || '',
      method,
      proPix
    });
  } catch (e) {
    console.error('asaas error:', e.message);
    return json({ error: 'payment gateway error' }, 502);
  }
  if (charge.status && !['CONFIRMED', 'RECEIVED', 'PENDING'].includes(charge.status)) {
    return json({ error: 'payment not confirmed' }, 402);
  }

  // 5) Gera e hasheia códigos
  const arrivalCode    = rand4();
  const completionCode = rand4();
  const arrCodeHash    = await sha256Hex(arrivalCode);
  const compCodeHash   = await sha256Hex(completionCode);

  // 6) Persiste tudo no Firestore (bypass rules via service account)
  await firestorePatch(env, 'bookings', bookingId, {
    status: 'payment_confirmed',
    trackStatus: 'paid',
    paidAt: new Date(),
    asaasChargeId: charge.id || null,
    paymentMethod: method,
    amountCents: amountCents,
    commissionCents: commissionCents,
    netToProCents: amountCents - commissionCents,
    arrCodeHash: arrCodeHash,
    compCode: completionCode,   // pro lê este para mostrar ao cliente
    compCodeHash: compCodeHash
  });

  // 7) Devolve códigos para o cliente exibir (arrivalCode aparece no celular
  //    do cliente; ele mostra ao profissional quando chega).
  return json({
    ok: true,
    arrivalCode,
    completionCode,
    chargeId: charge.id || null,
    mocked: !!charge.mocked
  });
}

// --- /api/verify-code  (auth) ---
// Usado pelo cliente para confirmar o código de conclusão via backend.
// Como uma camada extra, também marca o booking como completed.
async function handleVerifyCode(request, env) {
  const auth = await verifyIdToken(request, env);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  if (rateLimited(request, 'verify', 20)) return json({ error: 'rate limited' }, 429);

  let body;
  try { body = await request.json(); } catch (_) { return json({ error: 'bad json' }, 400); }
  const bookingId = String(body.bookingId || '');
  const type      = body.type; // 'arrival' | 'completion'
  const code      = String(body.code || '');
  if (!bookingId || !/^(arrival|completion)$/.test(type) || !/^\d{4}$/.test(code)) {
    return json({ error: 'bad payload' }, 400);
  }
  const booking = await firestoreGet(env, 'bookings', bookingId);
  if (!booking) return json({ error: 'not found' }, 404);
  if (booking.userId !== auth.uid && booking.proId !== auth.uid) return json({ error: 'forbidden' }, 403);

  const expected = type === 'arrival' ? booking.arrCodeHash : booking.compCodeHash;
  const hash = await sha256Hex(code);
  if (!expected || expected !== hash) return json({ ok: false }, 200);

  if (type === 'completion') {
    await firestorePatch(env, 'bookings', bookingId, {
      status: 'completed',
      trackStatus: 'completed',
      completedAt: new Date()
    });
  }
  return json({ ok: true });
}
