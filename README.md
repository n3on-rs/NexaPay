# NexaPay

Open-source fintech platform for Tunisia — digital wallet, payment gateway, and 3-validator BFT blockchain engine.

**Live:** [nexapay.space](https://nexapay.space) · **Sandbox:** [sandbox.nexapay.space](https://sandbox.nexapay.space) · **API:** [backend.nexapay.space](https://backend.nexapay.space) · **Docs:** [nexapay.space/docs](https://nexapay.space/docs)

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  nexapay.space (Landing)  │  sandbox.nexapay.space  │
│  auth.nexapay.space (Auth)│  (Dashboard + Agent)    │
│         Next.js 16 App Router + React 19            │
│                  Port :3001                         │
└──────────────────────┬──────────────────────────────┘
                       │ /api/* proxy
┌──────────────────────▼──────────────────────────────┐
│              Nginx Load Balancer :8088              │
└───────┬──────────────┬──────────────┬───────────────┘
        │              │              │
   Validator 0    Validator 1    Validator 2
   Port :8090     Port :8091     Port :8092
        │              │              │
        └──────────────┼──────────────┘
                       │ BFT Consensus (3/3)
┌──────────────────────▼──────────────────────────────┐
│  Rust / Axum API  │  PostgreSQL  │  Sled + SQLite  │
│  JWT + Cookie Auth │  Rate Limiting │  AES-256-GCM │
└─────────────────────────────────────────────────────┘
```

## Features

### Wallet & Banking
- Tunisian IBAN/RIB generation (virtual bank accounts)
- Virtual Visa card with encrypted storage (AES-256-GCM)
- PIN-based auth with Argon2id hashing + random per-user salt
- Instant on-chain transfers (zero domestic fees)
- Bank transfer support with OTP verification
- Contract e-signature with PDF generation (Tunisian Law No. 2002-50)

### Payment Gateway (Agent/Developer)
- Payment Intents API (Stripe-like) — create, confirm, refund
- No-Code payment links + QR codes
- Card and wallet payment methods
- Webhook delivery with HMAC-SHA256 signatures + 3-attempt retry
- Per-intent `success_webhook_url` / `failure_webhook_url`
- Merchant balance tracking with payouts

### Security (49 audited + patched)
- Separate JWT keys for user/admin tokens
- httpOnly session cookies with `Domain=.nexapay.space`
- Rate limiting on all auth + fund endpoints
- Webhook SSRF protection, file upload validation
- Timing-safe OTP comparison, SHA256 TOTP
- DB errors sanitized, CORS headers restricted

### Blockchain Engine
- 3-validator BFT consensus (Ed25519 signatures)
- Custom append-only chain with Sled persistence
- 12 transaction types: Transfer, AccountCreate, EsignAccount, InvoiceAnchor, etc.
- Pending tx mempool (500 max, 5-min expiry)
- On-chain document anchoring for e-signatures

### SDK
- `@nexapay/node-sdk` on [npm](https://www.npmjs.com/package/@nexapay/node-sdk)
- Full TypeScript definitions
- `NEXAPAY_API_URL` env-based configuration
- Webhook verification utilities

## Quick Start

```bash
# Clone and start everything
git clone https://github.com/Samer-Gassouma/NexaPay.git
cd NexaPay

# Set required environment variables
cp .env.example .env  # edit with your secrets

# Start (3 validators + LB + frontend + PostgreSQL)
docker compose up -d --build
```

**Published ports:** Frontend `:3001` | Backend LB `:8088` | PostgreSQL `:5433` | Validators `:8090-8092`

## Repository Structure

```
blockchain/       Rust API node, chain engine, consensus, crypto, DB migrations
nexapay-web/      Next.js 16 frontend (App Router, Tailwind v4)
sdk/              Node.js SDK (@nexapay/node-sdk)
deploy/nginx/     Nginx configs for LB + production
```

## Technology Stack

| Layer | Tech |
|-------|------|
| Backend | Rust 2021, Axum 0.7, Tokio, SQLx, Sled |
| Frontend | Next.js 16, React 19, Tailwind CSS v4, TypeScript |
| Database | PostgreSQL 16 (primary), SQLite (chain state), Sled (blocks) |
| Auth | HS256 JWT, Argon2id PIN hashing, httpOnly cookies |
| Crypto | AES-256-GCM, Ed25519, SHA-256, HMAC |
| Infra | Docker Compose, Nginx, Let's Encrypt, Azure VPS |

## Documentation

- [API Reference](https://nexapay.space/docs) — REST endpoints, SDK usage, test cards
- [SDK on npm](https://www.npmjs.com/package/@nexapay/node-sdk)
- [Agent Dashboard](https://sandbox.nexapay.space/agent/dashboard) — API keys, payments, webhooks

## Support

- Email: [contact@backendglitch.com](mailto:contact@backendglitch.com)
- Developer: [Glitch Inc / BackendGlitch Division](https://backendglitch.com)

## License

MIT
