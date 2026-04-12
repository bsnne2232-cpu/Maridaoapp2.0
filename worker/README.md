# Maridão Worker

Cloudflare Worker que fica em `https://maridaoapi.bsnne2232.workers.dev` e é
o **único** componente autorizado a:

- Validar CPF antes do signup
- Gerar os códigos de chegada/conclusão
- Debitar no Asaas com split de 10% (comissão Maridão) / 90% (profissional)
- Gravar `status=payment_confirmed`, `trackStatus=paid`, `arrCodeHash`,
  `compCode`, `compCodeHash` e `paidAt` no booking

Como ele usa um **service account do Firebase**, ele bypassa as
`firestore.rules` — por isso o cliente nunca escreve nesses campos
diretamente.

## Endpoints

| Rota                    | Auth  | Descrição                                      |
|-------------------------|-------|------------------------------------------------|
| `POST /api/validate-cpf`  | não   | Valida dígitos + retorna CPF mascarado         |
| `POST /api/generate-codes`| sim   | (legado) gera 2 códigos de 4 dígitos           |
| `POST /api/process-payment` | sim | Orquestra Asaas + split + persistência       |
| `POST /api/verify-code`   | sim   | Verifica hash do código e marca completed     |

"Auth sim" = header `Authorization: Bearer <Firebase ID Token>`. Os tokens
são verificados contra o JWKS `securetoken@system.gserviceaccount.com` com
checagem de `aud`, `iss`, `exp` e `iat`.

## Deploy

```bash
cd worker
npm install
npx wrangler login
```

Crie uma service account no Firebase console (Project settings → Service
accounts → Generate new private key). Depois registre os segredos:

```bash
# 1) Email da service account (firebase-adminsdk-xxx@...iam.gserviceaccount.com)
npx wrangler secret put FIREBASE_CLIENT_EMAIL

# 2) Private key (cole o PEM inteiro — o Worker troca \n literal por newline)
npx wrangler secret put FIREBASE_PRIVATE_KEY

# 3) Chave Asaas (sandbox ou prod)
npx wrangler secret put ASAAS_API_KEY
```

Edite `wrangler.toml` para ajustar `FIREBASE_PROJECT_ID`, `ASAAS_ENV` e
`ALLOWED_ORIGIN` (em produção, setar o domínio da sua Pages Cloudflare —
nunca deixar `*`). Depois:

```bash
npx wrangler deploy
```

## Como o frontend fala com o worker

O frontend em `js/payment.js` chama `POST /api/process-payment` com o
payload mínimo `{ bookingId, method, card? }`. O Worker:

1. Verifica o token → `uid`
2. Busca `/bookings/{bookingId}` via REST
3. Confere `booking.userId == uid`
4. Lê `agreedPrice` do **documento** (ignora qualquer valor que viesse no
   payload — é assim que impedimos adulteração pelo DevTools do browser)
5. Calcula comissão (10%) e chama Asaas
6. Gera os dois códigos, hasheia e grava no booking
7. Retorna `{ arrivalCode, completionCode }` p/ o cliente exibir

## Segurança

- ID Token é verificado com `RSASSA-PKCS1-v1_5` via `crypto.subtle.verify`
  (Web Crypto nativa do Workers runtime) — não depende de `jsonwebtoken`.
- O Firestore access token é rodado via assinatura RS256 local (SubtleCrypto
  importando a private key como `pkcs8`).
- Rate limit em memória por IP: 10 cobranças/min, 20 verificações/min,
  10 CPFs/min. Para escalar além de ~1k usuários, migrar p/ Durable Objects.
- Sem logs de dados sensíveis (código, PIX, CPF) — apenas `console.error`
  em caminhos de falha.

## Schema esperado em `/bookings/{id}`

```
userId       string   (uid do cliente)
userName     string
userEmail    string
proId        string   (uid do profissional)
proDocId     string   (id do documento em /professionals)  // opcional
service      string
agreedPrice  number   (reais, inteiro)
status       string   ('chat' | 'accepted' | 'payment_confirmed' | 'completed')
trackStatus  string   ('new' | 'chat' | 'paid' | 'pro_on_way' | 'pro_arrived' | 'completed')
```

Após `/api/process-payment`:
```
status=payment_confirmed, trackStatus=paid, paidAt, arrCodeHash,
compCode, compCodeHash, asaasChargeId, paymentMethod, amountCents,
commissionCents, netToProCents
```
