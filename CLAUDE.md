# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## Project Overview

NexaPay is a full-stack fintech platform (Tunisia-focused Stripe-like payments) with four components:

- **`blockchain/`** — Rust (Axum) backend: REST API, custom blockchain engine, 3-validator BFT consensus, PostgreSQL persistence
- **`nexapay-web/`** — Next.js 16 (App Router) + React 19 + Tailwind CSS v4 frontend with subdomain routing
- **`sdk/`** — Node.js SDK (`@nexapay/node-sdk`) published on npm
- **`deploy/nginx/`** — Nginx load balancer config for multi-validator mode

## Common Commands

### Backend (Rust)
```bash
cd blockchain && cargo build          # Build
cd blockchain && cargo build --release # Release build
cd blockchain && cargo check           # Fast check
cd blockchain && cargo run             # Run (needs PostgreSQL + .env)
```

### Frontend (Next.js)
```bash
cd nexapay-web && npm run dev    # Dev server (:3000)
cd nexapay-web && npm run build  # Production build
cd nexapay-web && npm run lint   # ESLint
```

### SDK
```bash
cd sdk && npm run build  # Compile TypeScript → dist/
cd sdk && npm publish    # Publish to npm (needs 2FA)
```

### Docker Compose
```bash
docker compose up -d --build   # Full stack (3 validators + LB + frontend, Neon PG)
docker compose down             # Stop
docker compose down -v          # Stop + wipe chain volumes
```

**Published ports:** Frontend `:3001` | LB `:8088` | Validators `:8090-8092`
**Database:** Neon serverless PostgreSQL (no local PG container)

### Oracle Cloud Always Free Deployment
See `deploy/oracle-cloud/README.md` for full step-by-step.
Quick start: `bash deploy/oracle-cloud/setup.sh`

## Architecture

### Request flow
```
Browser → Nginx (:443) → Next.js (:3001) → /api/* rewrites → Nginx LB (:8088) → Validator (:8080)
```

Three subdomains served by one Next.js app via `middleware.ts`:
- `nexapay.space` → `/landing/*` (public)
- `sandbox.nexapay.space` → `/sandbox/*` (requires `nexapay_session` cookie)
- `auth.nexapay.space` → `/auth/*` (redirects to sandbox if already logged in)

### Backend (Rust)
Entry point: `blockchain/src/main.rs`. Initializes PG pool, SQLite, Sled, then starts Axum HTTP server with CORS, tracing, and consensus engine.

Router: `blockchain/src/api/mod.rs` — `build_router()` defines all routes. Key modules:
- `auth.rs` — registration, PIN login + OTP, session JWT + httpOnly cookies, change-pin, logout
- `accounts.rs` — wallet details, transfers, transactions, card management, profile, SSE events
- `gateway.rs` — Payment Intents API, card/wallet confirm, refunds, payouts, webhooks with retry, test cards
- `agent.rs` — Agent applications (multipart upload with size/type validation)
- `admin.rs` / `admin_auth.rs` — Admin dashboard, TOTP login (SHA256), agent approval
- `company.rs` — Company workspace, API key management, withdrawal to wallet
- `esign.rs` — Contract generation, e-signature, blockchain anchoring, PDF download
- `consensus_api.rs` — P2P BFT consensus endpoints (propose, vote, commit, sync)
- `middleware.rs` — Account token (cookie + header), API key auth, rate limiting, audit logging

**Auth model:** PIN + OTP login. httpOnly cookies (`Domain=.nexapay.space`) for browser sessions, `X-Account-Token` header for API. Separate admin JWT keys. Session revocation via DB check.

### Blockchain engine (`blockchain/src/chain.rs`)
- In-memory `HashMap<String, ChainAccount>` for account state
- `Vec<Block>` history, `Vec<Transaction>` mempool (500 max, 5-min expiry)
- 12 TxTypes: Transfer, AccountCreate, LoanDisburse, LoanRepay, BankJoin, AgentApply, DevRegister, EsignAccount, EsignTransfer, InvoiceAnchor, ValidatorJoin, ValidatorLeave
- `apply_transaction()` — modifies in-memory state; `add_pending_transaction()` — adds to mempool
- SYSTEM transfers: from=SYSTEM skips deduct, to=SYSTEM skips credit (settlement pool)
- Multi-validator: `mine_block()` refuses (returns InvalidProposal). Use `apply_transaction()` + `add_pending_transaction()` and let consensus mine.

### Database
- **PostgreSQL** — users, sessions, cards, payment_intents, webhooks, signed_documents, agent_applications, etc. Migrations in `blockchain/src/db/migrations/`
- **SQLite** — chain account snapshots, tx records, card refs
- **Sled** — persistent block storage in `chain_data/`

### Frontend structure
```
nexapay-web/src/
  app/                  # App Router pages
    layout.tsx           # Root layout (fonts, metadata, SandboxBanner)
    landing/             # nexapay.space — landing page, how-it-works, footer
    sandbox/              # sandbox.nexapay.space — dashboard, send, fund, agent, admin
    auth/                 # auth.nexapay.space — login, register, loading-screen session check
    checkout/             # Public payment checkout
    docs/                 # /docs — API reference, SDK guide, test cards
  components/            # Reusable: protected-route, sandbox-banner, signature-canvas, landing/*
  contexts/              # AuthContext — cookie-first session validation, localStorage fallback
  lib/                   # api.ts (fetch + credentials:include), sse.ts (fetch-based SSE), auth-utils.ts
  middleware.ts           # Subdomain routing + auth guard (cookie check)
```

## Key Environment Variables

| Variable | Purpose |
|---|---|
| `NEXAPAY_DATABASE_URL` | PostgreSQL connection string (Neon serverless) |
| `NEXAPAY_JWT_SECRET` | HS256 key for user session tokens |
| `NEXAPAY_ENCRYPTION_KEY` | 64 hex chars — AES-256-GCM |
| `NEXAPAY_SYSTEM_PRIVATE_KEY` | 64 hex chars — Ed25519 system key |
| `NEXAPAY_ADMIN_SEED_KEY` | Required in production — creates first admin |
| `COOKIE_DOMAIN` | Default `.nexapay.space` — session cookie domain |
| `APP_ENV` / `NEXAPAY_ENV` | `development`, `sandbox`, `production` |
| `DEV_SHOW_OTP` | Show OTP in API responses (sandbox only) |
| `NEXAPAY_VALIDATOR_COUNT` | 3 for multi-validator BFT |
| `NEXAPAY_VALIDATOR_N_KEY` | 64 hex chars — per-validator Ed25519 key |
| `NEXAPAY_PORTAL_URL` | Frontend origin for CORS |
| `API_PROXY_URL` | Backend proxy target for Next.js rewrites |
| `NEXAPAY_API_URL` | SDK base URL (defaults to backend.nexapay.space) |

## Gateway Payment Flow (`blockchain/src/api/gateway.rs`)

### `confirm_intent` — wallet payment flow
1. PIN step → OTP step → balance check → deduct payer → credit merchant
2. **Balance validation happens BEFORE chain state changes** — returns `400 "Insufficient wallet balance. Required: X.XXX TND, available: Y.YYY TND"` if payer can't cover amount + fee
3. After deducting `payer → SYSTEM`, immediately creates `SYSTEM → merchant` credit transaction so the store's on-chain wallet balance updates without waiting for a manual withdrawal
4. Card payments also credit the merchant via `SYSTEM → merchant` (since no payer wallet is debited)
5. Frontend displays "Insufficient funds" overlay when error contains `"insufficient"`

### `pay_wallet_by_card` — card-to-wallet top-up
- Creates `SYSTEM → recipient` transfer (funds originate from SYSTEM, not a wallet)

### key pattern for merchant credit
```rust
// SYSTEM → merchant (SYSTEM as sender skips deduction per chain rules)
// Merchant chain address is developers.owner_user_address (NOT user_address!)
let merchant_addr = sqlx::query_scalar::<_, String>(
    "SELECT owner_user_address FROM developers WHERE id = $1 LIMIT 1"
)
```

## Database Schema Notes

- **`developers`** table uses `owner_user_address` (not `user_address`) for the merchant's chain wallet
- **`payment_intents.merchant_id`** references `developers.id` (UUID)
- **Migration `202507221500_remove_merchants.sql`** — wrapped `DELETE FROM api_keys` in a table-existence guard to prevent failures on fresh databases where `api_keys` doesn't exist yet
- Migration ordering: `202507221500` runs before `202604180001` (init), so newer migrations must guard against tables that don't exist yet

## VPS & Deployment

### Oracle Cloud Always Free (Production)
- 4 ARM cores, 24 GB RAM, 200 GB disk — **$0/month forever**
- Setup: `bash deploy/oracle-cloud/setup.sh`
- Full guide: `deploy/oracle-cloud/README.md`

### Production VPS (nexapay.space)
- SSH: `ssh nexapay` → `/home/ivan/NexaPay`
- Run: `docker compose -f ~/NexaPay/docker-compose.yml up -d --build`
- Logs: `docker compose -f ~/NexaPay/docker-compose.yml logs validator-0`
- Fresh start: `docker compose -f ~/NexaPay/docker-compose.yml down -v && docker compose -f ~/NexaPay/docker-compose.yml up -d --build`

### KYC VPS (4.233.137.88)
- SSH: `ssh kyc` — hosts `fabrix.sbs`, `terraintel.fun` (NexaPay NOT deployed here)
- Uses PM2 (not Docker): `pm2 list`
- Nginx sites: `/etc/nginx/sites-enabled/{fabrix,kyc}`

### DNS (nexapay.space)
- All A records point to the NexaPay VPS: `@`, `sandbox`, `auth`, `admin`, `backend`, `kyc`
- Subdomain routing handled by Next.js `middleware.ts` + Nginx on the VPS

## E2E Testing the API

```bash
# Against local: BASE="http://localhost:8088"  
# Against production: BASE="https://backend.nexapay.space"

# 1. Register users (two-step: init → set-pin)
curl -s -X POST "$BASE/auth/register/init" -H "Content-Type: application/json" \
  -d '{"full_name":"...","phone":"50xxxxxx","email":"...@t.com","date_of_birth":"1990-01-01"}'
# → returns {"address":"NXP..."}

curl -s -X POST "$BASE/auth/register/set-pin" -H "Content-Type: application/json" \
  -d '{"address":"NXP...","pin":"123456","pin_confirm":"123456"}'

# 2. Login (two-step: PIN → OTP → token)
curl -s -X POST "$BASE/auth/login" -H "Content-Type: application/json" \
  -d '{"phone":"50xxxxxx","pin":"123456"}'  # → {"dev_otp":"..."}

curl -s -X POST "$BASE/auth/login/verify-otp" -H "Content-Type: application/json" \
  -d '{"phone":"50xxxxxx","otp_code":"..."}'  # → {"token":"..."}

# 3. Auth header for all authenticated requests:
#    -H "X-Account-Token: <token>"

# 4. Create company workspace (to get API key):
curl -s -X POST "$BASE/accounts/{address}/company" -H "X-Account-Token: ..." \
  -H "Content-Type: application/json" -d '{"company_name":"...","company_email":"..."}'

# 5. Create payment intent + test checkout:
#    POST /gateway/v1/intents (with X-API-Key)
#    POST /gateway/v1/intents/{id}/session
#    POST /gateway/v1/intents/{id}/confirm (wallet: PIN step → OTP step)
```

## Security Notes

- **Never** call `mine_block()` in multi-validator mode — it returns InvalidProposal
- **Always** use `apply_transaction()` + `add_pending_transaction()` for chain state changes
- SYSTEM transfers: `from=SYSTEM` skips sender deduction, `to=SYSTEM` skips receiver credit
- CORS requires explicit origins when `allow_credentials(true)` — add new subdomains to main.rs
- Cookie auth checks BEFORE header auth in `extract_account_token` to prevent placeholder bypass
- `verify_session_with_revocation_check` must be used (not raw `verify_session_token`)
- Per-user PIN salt stored in `cards.pin_salt` — use `generate_pin_salt()` for new users

## SDK (`@nexapay/node-sdk`)

Published on npm. Key files: `src/client.ts` (NexaPayClient), `src/types.ts` (all types), `src/resources.ts` (PaymentIntents, Refunds, Payouts, Webhooks, Balance, Transactions), `src/errors.ts` (typed error hierarchy).

Build: `npm run build` → compiles `src/` → `dist/`. Publish: `npm publish --access public` (needs 2FA).
