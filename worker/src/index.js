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

const MARIDAO_COMMISSION = 0.08; // 8% de comissão — profissional recebe 92%

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
      if (url.pathname === '/api/request-saque'   && request.method === 'POST') return withCors(await handleRequestSaque(request, env), env);
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
  const projectId = env.FIREBASE_PROJECT_ID || 'maridaoapp-cbb4e';
  if (payload.aud !== projectId) return { ok: false, status: 401, error: 'bad audience' };
  if (payload.iss !== 'https://securetoken.google.com/' + projectId) {
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

// Cria documento com ID gerado automaticamente pelo Firestore.
async function firestoreCreate(env, collection, fields) {
  const tok = await getAccessToken(env);
  const body = { fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, fsValue(v)])) };
  const res = await fetch(firestoreBase(env) + '/' + collection, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error('firestore create failed: ' + (await res.text()));
  const doc = await res.json();
  return doc.name.split('/').pop();
}

// Busca o primeiro documento de uma coleção onde fieldPath == value.
async function firestoreQueryOne(env, collection, fieldPath, value) {
  const tok = await getAccessToken(env);
  const body = {
    structuredQuery: {
      from: [{ collectionId: collection }],
      where: { fieldFilter: { field: { fieldPath }, op: 'EQUAL', value: fsValue(value) } },
      limit: 1
    }
  };
  const res = await fetch(
    'https://firestore.googleapis.com/v1/projects/' + env.FIREBASE_PROJECT_ID + '/databases/(default)/documents:runQuery',
    { method: 'POST', headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  );
  if (!res.ok) throw new Error('firestore query failed: ' + (await res.text()));
  const results = await res.json();
  if (!results || results.length === 0 || !results[0].document) return null;
  const doc = results[0].document;
  const out = { id: doc.name.split('/').pop() };
  for (const [k, v] of Object.entries(doc.fields || {})) out[k] = fsUnwrap(v);
  return out;
}

// Incrementa atomicamente um campo numérico (inteiro) via commit API.
async function firestoreIncrement(env, collection, docId, fieldPath, delta) {
  const tok = await getAccessToken(env);
  const docName = firestoreBase(env) + '/' + collection + '/' + docId;
  const body = {
    writes: [{
      transform: {
        document: docName,
        fieldTransforms: [{ fieldPath, increment: { integerValue: String(Math.round(delta)) } }]
      }
    }]
  };
  const res = await fetch(
    'https://firestore.googleapis.com/v1/projects/' + env.FIREBASE_PROJECT_ID + '/databases/(default)/documents:commit',
    { method: 'POST', headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  );
  if (!res.ok) throw new Error('firestore increment failed: ' + (await res.text()));
}

// Executa dois writes atomicamente: cria doc em saques + decrementa balance do pro.
async function firestoreCommitSaque(env, proDocId, saqueFields, decrementCents) {
  const tok = await getAccessToken(env);
  const base = firestoreBase(env);
  const saqueId = Array.from(crypto.getRandomValues(new Uint8Array(16))).map(b => b.toString(16).padStart(2, '0')).join('');
  const saqueName = base + '/saques/' + saqueId;
  const proDocName = base + '/professionals/' + proDocId;
  const body = {
    writes: [
      { update: { name: saqueName, fields: Object.fromEntries(Object.entries(saqueFields).map(([k, v]) => [k, fsValue(v)])) } },
      { transform: { document: proDocName, fieldTransforms: [{ fieldPath: 'balance', increment: { integerValue: String(-Math.round(decrementCents)) } }] } }
    ]
  };
  const res = await fetch(
    'https://firestore.googleapis.com/v1/projects/' + env.FIREBASE_PROJECT_ID + '/databases/(default)/documents:commit',
    { method: 'POST', headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  );
  if (!res.ok) throw new Error('firestore commit saque failed: ' + (await res.text()));
  return saqueId;
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
// ASAAS — cobrança ao cliente (sem split automático; repasse via saque)
// ---------------------------------------------------------------------------
async function asaasCharge(env, { amountCents, description, payerName, payerEmail, method }) {
  if (!env.ASAAS_API_KEY) {
    if (env.ASAAS_ENV === 'prod') throw new Error('Asaas not configured');
    return { id: 'mock_' + Date.now(), status: 'CONFIRMED', mocked: true };
  }
  const base = env.ASAAS_ENV === 'prod'
    ? 'https://api.asaas.com/v3'
    : 'https://sandbox.asaas.com/api/v3';
  const res = await fetch(base + '/payments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'access_token': env.ASAAS_API_KEY },
    body: JSON.stringify({
      customer: payerEmail,
      billingType: method === 'pix' ? 'PIX' : method === 'card' ? 'CREDIT_CARD' : 'BOLETO',
      value: amountCents / 100,
      description: description
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

  let body = {};
  try { body = await request.json(); } catch (_) {}

  const bookingId = String(body.bookingId || '').trim();

  const arrivalCode    = rand4();
  const completionCode = rand4();

  // Se bookingId foi fornecido, grava hashes + status no Firestore
  // via service account (bypassa firestore.rules), igual ao process-payment.
  if (bookingId) {
    try {
      const booking = await firestoreGet(env, 'bookings', bookingId);
      if (booking && booking.userId === auth.uid) {
        const arrCodeHash  = await sha256Hex(arrivalCode);
        const compCodeHash = await sha256Hex(completionCode);
        await firestorePatch(env, 'bookings', bookingId, {
          status:      'payment_confirmed',
          trackStatus: 'paid',
          paidAt:      new Date(),
          arrCodeHash,
          compCode:    completionCode,
          compCodeHash
        });
      }
    } catch (e) {
      // Não bloqueia — retorna os códigos mesmo se o patch falhar.
      console.error('generate-codes firestore patch failed:', e.message);
    }
  }

  return json({ arrivalCode, completionCode });
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
  const amountCents     = Math.round(priceReais * 100);
  const commissionCents = Math.round(amountCents * MARIDAO_COMMISSION);
  const netToProCents   = amountCents - commissionCents;

  // 3) Cria cobrança no Asaas (sem split — repasse via saque manual)
  let charge;
  try {
    charge = await asaasCharge(env, {
      amountCents,
      description: 'Maridão — ' + (booking.service || 'serviço'),
      payerName:  booking.userName  || '',
      payerEmail: booking.userEmail || '',
      method
    });
  } catch (e) {
    console.error('asaas error:', e.message);
    return json({ error: 'payment gateway error' }, 502);
  }
  if (charge.status && !['CONFIRMED', 'RECEIVED', 'PENDING'].includes(charge.status)) {
    return json({ error: 'payment not confirmed' }, 402);
  }

  // 4) Gera e hasheia códigos
  const arrivalCode    = rand4();
  const completionCode = rand4();
  const arrCodeHash    = await sha256Hex(arrivalCode);
  const compCodeHash   = await sha256Hex(completionCode);

  // 5) Persiste dados do pagamento no booking
  await firestorePatch(env, 'bookings', bookingId, {
    status:        'payment_confirmed',
    trackStatus:   'paid',
    paidAt:        new Date(),
    asaasChargeId: charge.id || null,
    paymentMethod: method,
    amountCents,
    commissionCents,
    netToProCents,
    arrCodeHash,
    compCode:     completionCode,
    compCodeHash
  });

  // 6) Credita saldo do profissional (netToProCents) — será sacado manualmente
  try {
    const proDocId = booking.proDocId || null;
    if (proDocId) {
      await firestoreIncrement(env, 'professionals', proDocId, 'balance', netToProCents);
    } else if (booking.proId) {
      // Fallback: busca o documento do pro pelo uid
      const pro = await firestoreQueryOne(env, 'professionals', 'uid', booking.proId);
      if (pro) await firestoreIncrement(env, 'professionals', pro.id, 'balance', netToProCents);
    }
  } catch (e) {
    // Não bloqueia o pagamento — saldo pode ser corrigido manualmente pelo admin
    console.error('balance increment failed:', e.message);
  }

  // 7) Devolve códigos para o cliente exibir
  return json({
    ok: true,
    arrivalCode,
    completionCode,
    chargeId: charge.id || null,
    mocked: !!charge.mocked
  });
}

// --- /api/request-saque  (auth) ---
// Profissional solicita saque do saldo acumulado.
// Cria documento em /saques e zera o saldo atomicamente.
async function handleRequestSaque(request, env) {
  const auth = await verifyIdToken(request, env);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  if (rateLimited(request, 'saque', 3)) return json({ error: 'rate limited' }, 429);

  // Busca documento do profissional pelo uid
  const pro = await firestoreQueryOne(env, 'professionals', 'uid', auth.uid);
  if (!pro) return json({ error: 'Profissional não encontrado' }, 404);

  const balanceCents = pro.balance || 0;
  if (balanceCents < 100) return json({ error: 'Saldo insuficiente (mínimo R$ 1,00)' }, 400);
  if (!pro.pix) return json({ error: 'Configure sua chave PIX no perfil antes de solicitar saque' }, 400);

  // Verifica se já existe saque pendente
  const existingSaque = await firestoreQueryOne(env, 'saques', 'proId', auth.uid);
  if (existingSaque && existingSaque.status === 'pending') {
    return json({ error: 'Você já tem um saque pendente de R$ ' + (existingSaque.amountCents / 100).toFixed(2) + '. Aguarde o processamento.' }, 409);
  }

  // Cria saque e zera saldo atomicamente
  const saqueId = await firestoreCommitSaque(env, pro.id, {
    proId:      auth.uid,
    proDocId:   pro.id,
    proName:    pro.name    || '',
    pixKey:     pro.pix,
    amountCents: balanceCents,
    status:     'pending',
    createdAt:  new Date()
  }, balanceCents);

  return json({ ok: true, saqueId, amountCents: balanceCents });
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
  const bookingId = String(body.bookingId || '').trim();
  const type      = body.type; // 'arrival' | 'completion'
// Trim + force string para preservar zeros iniciais (ex: 0123)
  const code      = String(body.code || '').trim();
  if (!bookingId || !/^(arrival|completion)$/.test(type) || !/^\d{4}$/.test(code)) {
    return json({ error: 'bad payload' }, 400);
  }
  const booking = await firestoreGet(env, 'bookings', bookingId);
  if (!booking) return json({ error: 'not found' }, 404);
  if (booking.userId !== auth.uid && booking.proId !== auth.uid) return json({ error: 'forbidden' }, 403);

  const expected = type === 'arrival' ? booking.arrCodeHash : booking.compCodeHash;
  const hash = await sha256Hex(code);

  // Log de depuração — confirma que o Worker está buscando o documento correto
  console.log('[verify-code]', {
    bookingId,
    type,
    codeReceived: code,
    hashCalculated: hash,
    hashExpected: expected || '(não encontrado)',
    match: expected === hash
  });

  if (!expected || String(expected).trim() !== String(hash).trim()) return json({ ok: false }, 200);

  if (type === 'arrival') {
    await firestorePatch(env, 'bookings', bookingId, {
      trackStatus: 'pro_arrived',
      arrivedAt: new Date()
    });
  } else if (type === 'completion') {
    await firestorePatch(env, 'bookings', bookingId, {
      status: 'completed',
      trackStatus: 'completed',
      completedAt: new Date()
    });
  }
  return json({ ok: true });
}
