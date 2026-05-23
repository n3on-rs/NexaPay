# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

NexaPay is a full-stack fintech platform (Tunisia-focused Stripe-like payments) with three main components:

- **`blockchain/`** — Rust (Axum) backend: REST API, custom blockchain engine, PostgreSQL persistence
- **`nexapay-web/`** — Next.js 16 (App Router) + React 19 + Tailwind CSS v4 frontend portal
- **`sdk/`** — Node.js SDK (`@nexapay/node-sdk`) for the gateway API

## Common Commands

### Backend (Rust)

```bash
# Build
cd blockchain && cargo build

# Build release
cd blockchain && cargo build --release

# Run locally (needs PostgreSQL + .env)
cd blockchain && cargo run

# Run tests (none currently defined)
cd blockchain && cargo test
```

### Frontend (Next.js)

```bash
# Dev server (port 3000 by default)
cd nexapay-web && npm run dev

# Build
cd nexapay-web && npm run build

# Lint
cd nexapay-web && npm run lint
```

### Docker Compose (full stack)

```bash
# Start the full stack (3-validator BFT + load balancer + frontend)
docker compose up -d --build

# Teardown
docker compose down
```

Published ports: frontend on `:3001`, backend on `:8088`, PostgreSQL on `:5433`.

## Architecture

### Request flow

```
Browser → Next.js (port 3000) → /api/* rewrites → Rust backend (port 8080)
```

Next.js proxies all `/api/*` requests to the Rust backend via `next.config.ts` rewrites using `API_PROXY_URL`. The frontend API client (`nexapay-web/src/lib/api.ts`) sets `BASE_URL = "/api"` and uses `fetch` with auth headers (`X-Account-Token`, `X-API-Key`, `X-Admin-Token`).

### Backend (Rust)

Entry point: `blockchain/src/main.rs`. Initializes PostgreSQL pool, SQLite state, Sled block storage, then starts the Axum HTTP server with CORS, tracing, and the consensus engine.

Router: `blockchain/src/api/mod.rs` — `build_router()` defines all routes. Module structure mirrors API domains:
- `auth.rs` — registration, login (PIN-based + OTP), session tokens (JWT)
- `accounts.rs` — wallet details, transactions, transfers, card management, profile
- `gateway.rs` — Payment Intents API (Stripe-like), refunds, payouts, webhooks
- `agent.rs` / `admin.rs` — Agent (developer) onboarding and admin panel
- `kyc.rs` / `kyc_verify.rs` — Multi-step KYC with OTP, document upload, liveness
- `company.rs` — Company workspaces, API key management, vendor requests
- `esign.rs` — E-signature for account contracts and transfer authorizations
- `invoice.rs` — Invoice generation and verification
- `consensus_api.rs` — P2P endpoints for multi-validator BFT consensus
- `middleware.rs` — JWT session tokens, API key auth with rate limiting, audit logging

State (`AppState`): shared via `Arc<Mutex<Blockchain>>` for the chain, `PgPool` for Postgres, `SqliteState` for local persistence, HS256 JWT keys, encryption key, Twilio OTP config.

**Auth model**: PIN-based login with OTP verification. Session tokens are HS256 JWTs (24h expiry) passed as `X-Account-Token`. API keys use the `X-API-Key` header with SHA-256 hashing, rate limiting (per-minute + daily windows), and permission-based access control.

### Blockchain engine

Custom append-only chain in `blockchain/src/chain.rs`:
- In-memory `HashMap<String, ChainAccount>` for account state
- `Vec<Block>` for block history, `Vec<Transaction>` as mempool (max 500 pending, 200 per block, 5-min expiry)
- Sled-backed persistent block storage (`blockchain/src/storage.rs`)
- Consensus ticker runs every 5 seconds (`blockchain/src/consensus.rs`) — in single-validator mode, auto-mines; in multi-validator mode, runs BFT proposal → vote → commit rounds with P2P networking
- Multi-validator mode uses `NEXAPAY_VALIDATOR_COUNT`, `NEXAPAY_VALIDATOR_INDEX`, per-validator keys and URLs

### Database

- **PostgreSQL** — primary data store (users, sessions, transactions, API keys, audit logs). Migrations in `blockchain/src/db/migrations/` run via `sqlx::migrate!` at startup.
- **SQLite** — local chain state (`nexapay_state.sqlite`)
- **Sled** — persistent block storage in `chain_data/`

### Frontend structure

```
nexapay-web/src/
  app/           # Next.js App Router pages (dashboard, login, register, send, checkout, admin, agent, etc.)
  components/    # Shared UI: auth forms, landing page, protected-route, verification-gate, shadcn/ui
  contexts/      # AuthContext — session management, user state, periodic refresh
  lib/           # API client (api.ts), auth utilities, Tunisia governorates data
```

- All auth-protected pages wrap content in `<ProtectedRoute>` which redirects to `/login` if unauthenticated
- `<AuthProvider>` in root layout validates session on mount, focus, and every 5 minutes
- Session stored in localStorage (`nexapay_token`, `nexapay_address`)
- `KYC status` is checked via `verification-gate.tsx` for routes requiring verified identity

## Key Environment Variables

| Variable | Purpose |
|---|---|
| `NEXAPAY_DATABASE_URL` | PostgreSQL connection string |
| `NEXAPAY_JWT_SECRET` | HS256 key for session tokens (min 32 chars in prod) |
| `NEXAPAY_ENCRYPTION_KEY` | 64 hex chars for AES-GCM field encryption |
| `NEXAPAY_SYSTEM_PRIVATE_KEY` | 64 hex chars — system Ed25519 key |
| `NEXAPAY_PORT` | Backend listen port (default 8080) |
| `NEXAPAY_PORTAL_URL` | Frontend origin for CORS |
| `NEXAPAY_PAYMENT_SESSION_MINUTES` | Payment intent session TTL |
| `NEXT_PUBLIC_API_URL` | Frontend API base URL (build-time arg) |
| `API_PROXY_URL` | Backend proxy target for Next.js rewrites |
| `APP_ENV` / `NEXAPAY_ENV` | Environment: `development`, `sandbox`, `production` |

Production mode enforces non-default secrets at startup and restricts CORS origins. Development mode enables legacy register endpoint and allows `localhost` origins.
