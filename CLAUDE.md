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
docker compose up -d --build   # Full stack (3 validators + LB + frontend + PG)
docker compose down             # Stop
docker compose down -v          # Stop + wipe volumes (fresh DB)
```

**Published ports:** Frontend `:3001` | LB `:8088` | PostgreSQL `:5433` | Validators `:8090-8092`

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
| `NEXAPAY_DATABASE_URL` | PostgreSQL connection string |
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
