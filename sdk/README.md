# NexaPay Node.js SDK

Official Node.js SDK for the NexaPay Payment Gateway. Process payments, manage webhooks, handle refunds, and more — with full TypeScript support.

## Features

- **Full TypeScript** — Complete type definitions for all API resources
- **Promise-based** — All methods return promises for async/await
- **Error handling** — Typed error classes for every failure scenario
- **Webhook verification** — HMAC-SHA256 signature verification built in
- **Per-intent webhooks** — Set `success_webhook_url` / `failure_webhook_url` per payment
- **Env-configurable** — `NEXAPAY_API_URL` env var for base URL

## Installation

```bash
npm install @nexapay/node-sdk
```

## Quick Start

```typescript
import NexaPay from "@nexapay/node-sdk";

const client = new NexaPay({
  apiKey: "nxp_developer_abc123def456ghi789_12345678",
});

// Create a payment intent
const { data } = await client.paymentIntents.create({
  amount: 42000, // 42.000 TND (in millimes)
  description: "Order #42",
});

// Redirect customer to checkout
console.log(data.checkout_url);
// → https://nexapay.space/checkout/pi_abc123...
```

## Authentication

API keys follow the format: `nxp_{type}_{token}_{checksum}`

- **Developer keys** (`nxp_developer_...`) — Full gateway access
- Obtain keys from the Agent Dashboard → API Keys

## API Reference

### Payment Intents

```typescript
// Create
const intent = await client.paymentIntents.create({
  amount: 42000,                    // Required: amount in millimes (1 TND = 1000)
  currency: "TND",                  // Optional: defaults to TND
  description: "Order #42",         // Optional
  customer_name: "Ahmed Ben Ali",   // Optional
  customer_email: "a@example.tn",   // Optional
  idempotency_key: "order-42",      // Optional: prevents duplicates
  webhook_url: "https://...",       // Optional: all events
  success_webhook_url: "https://...", // Optional: payment succeeded only
  failure_webhook_url: "https://...", // Optional: payment failed only
});

// Retrieve
const details = await client.paymentIntents.get("pi_abc123...");

// Confirm with card
const result = await client.paymentIntents.confirm("pi_abc123...", {
  method: "card",
  card_number: "4242424242424242",
  expiry_month: "12",
  expiry_year: "2029",
  cvv: "123",
  card_holder_name: "Ahmed Ben Ali",
});
```

### Refunds

```typescript
const refund = await client.refunds.create({
  intent_id: "pi_abc123...",
  amount: 21000,                          // Optional: partial refund
  reason: "Customer request",             // Optional
});
```

### Payouts

```typescript
const payout = await client.payouts.create({
  amount: 100000,   // millimes
  destination: "wallet_address_or_rib",
});
```

### Balance & Transactions

```typescript
const balance = await client.balance.get();
// → { available, gross, refunded, payouts, pending, currency }

const txns = await client.transactions.list();
// → { intents: [...], refunds: [...] }
```

### Webhooks

```typescript
// Create
const webhook = await client.webhooks.create({
  url: "https://mysite.tn/webhooks/nexapay",
  event_types: [
    "payment_intent.succeeded",
    "payment_intent.failed",
    "payment_intent.refunded",
  ],
});

// List all
const webhooks = await client.webhooks.list();

// Delivery history
const deliveries = await client.webhooks.deliveries(webhook.data.id);

// Delete
await client.webhooks.delete(webhook.data.id);
```

## Webhook Verification

```typescript
// Express example
app.post("/webhooks", express.json(), (req, res) => {
  const signature = req.headers["x-nexapay-signature"];
  const event = client.parseWebhookEvent(req.body, signature, "whsec_...");

  switch (event.event) {
    case "payment_intent.succeeded":
      // Fulfill order
      break;
    case "payment_intent.failed":
      // Notify customer
      break;
  }
  res.json({ received: true });
});
```

## Error Handling

```typescript
import { NexaPayApiError } from "@nexapay/node-sdk";

try {
  await client.paymentIntents.create({ amount: 42000 });
} catch (error) {
  if (error instanceof NexaPayApiError) {
    console.error(`API ${error.statusCode}: ${error.message}`);
    if (error.isRateLimitError) console.log("Retry after:", error.retryAfter);
    if (error.isAuthenticationError) console.log("Check your API key");
    if (error.isValidationError) console.log("Validation:", error.validationErrors);
  }
}
```

## Test Cards

| Card Number | CVV | Result |
|---|---|---|
| `4242424242424242` | 123 | Success |
| `5555555555554444` | 123 | Success |
| `4000000000000002` | 123 | Declined |
| `4000000000009995` | 123 | Insufficient Funds |
| `5105105105105100` | 123 | Declined |

Expiry: any future date (e.g. 12/2029). These only work in sandbox mode.

## Configuration

```typescript
const client = new NexaPay({
  apiKey: "nxp_developer_...",               // Required
  baseURL: "https://backend.nexapay.space",  // Default, or set NEXAPAY_API_URL env var
  timeout: 30000,                             // 30s default
  headers: { "X-Custom": "value" },          // Optional extra headers
});
```

## Development

```bash
git clone https://github.com/Samer-Gassouma/NexaPay.git
cd NexaPay/sdk
npm install
npm run build
```

## Links

- **Developer Portal**: https://nexapay.space
- **API Docs**: https://docs.nexapay.space
- **NPM**: https://www.npmjs.com/package/@nexapay/node-sdk
- **Support**: contact@backendglitch.com
- **Developer**: [Glitch Inc / BackendGlitch Division](https://backendglitch.com)

## License

MIT
