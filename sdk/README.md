# NexaPay Node.js SDK

Official Node.js SDK for [NexaPay](https://nexapay.space) — Tunisia-focused payment gateway (Stripe-like). Create payment intents, process card/wallet payments, manage webhooks, refunds, and payouts. Full TypeScript support.

## Features

- **Full TypeScript** — Complete type definitions for all API resources
- **Promise-based** — All methods return promises for async/await
- **Error handling** — Typed error classes for every failure scenario
- **Webhook verification** — HMAC-SHA256 signature verification built in
- **Per-intent webhooks** — Set `success_webhook_url` / `failure_webhook_url` per payment
- **Zero config** — Defaults to `https://backend.nexapay.space`, or set `NEXAPAY_API_URL`

## Installation

```bash
npm install @nexapay/node-sdk
```

## Quick Start

```typescript
import NexaPay from "@nexapay/node-sdk";

const client = new NexaPay({
  apiKey: "nxp_developer_your_key_here",
  // baseURL defaults to https://backend.nexapay.space
});

// Create a 42 TND payment intent
const { data } = await client.paymentIntents.create({
  amount: 42000, // millimes (1 TND = 1000)
  description: "Order #42",
  customer_name: "Ahmed Ben Ali",
  customer_email: "ahmed@example.tn",
  success_webhook_url: "https://mysite.tn/webhooks/success",
});

// Redirect customer to checkout
window.location.href = data.checkout_url;

// List recent intents
const { data: intents } = await client.paymentIntents.list({ limit: 10 });

// Cancel an intent
await client.paymentIntents.cancel("pi_abc123");

// Get your balance
const { data: balance } = await client.balance.get();
console.log(balance.available, balance.currency); // 50000, "TND"

// Create a refund
const { data: refund } = await client.refunds.create({
  intent_id: "pi_abc123",
  amount: 21000,
  reason: "customer_request",
});

// Withdraw to bank
const { data: payout } = await client.payouts.create({
  amount: 100000,
  rib: "99000236175790748382",
  account_holder_name: "Ahmed Ben Ali",
});
```

## Authentication

API keys follow the format: `nxp_{type}_{token}_{checksum}`

- **Developer keys** (`nxp_developer_...`) — Full gateway access
- Obtain keys from the [Agent Dashboard](https://nexapay.space/agent/dashboard/api-keys)

## API Reference

### Payment Intents

```typescript
// Create
const intent = await client.paymentIntents.create({
  amount: 42000,                    // Required: amount in millimes
  currency: "TND",                  // Optional: defaults to TND
  description: "Order #42",         // Optional
  customer_name: "Ahmed Ben Ali",   // Optional
  customer_email: "a@example.tn",   // Optional
  customer_phone: "50123456",       // Optional
  success_webhook_url: "https://...", // Optional: payment succeeded
  failure_webhook_url: "https://...", // Optional: payment failed
});

// Retrieve
const details = await client.paymentIntents.get("pi_abc123");

// List all (with pagination)
const list = await client.paymentIntents.list({ limit: 10 });

// Cancel
await client.paymentIntents.cancel("pi_abc123");

// Confirm with card
const result = await client.paymentIntents.confirm("pi_abc123", {
  method: "card",
  card_number: "4242424242424242",
  expiry_month: "12",
  expiry_year: "2029",
  cvv: "123",
  card_holder_name: "Ahmed Ben Ali",
});

// Confirm with wallet (two-step: PIN → OTP)
const step1 = await client.paymentIntents.confirm("pi_abc123", {
  method: "wallet",
  phone: "21653249239",
  pin: "123456",
});
// step1.data.step === "otp_required"
const step2 = await client.paymentIntents.confirm("pi_abc123", {
  method: "wallet",
  phone: "21653249239",
  pin: "123456",
  otp: "123456",
});
```

### Refunds

```typescript
// Create
const refund = await client.refunds.create({
  intent_id: "pi_abc123",
  amount: 21000,              // Optional: partial refund
  reason: "customer_request", // Optional
});

// List all
const refunds = await client.refunds.list();
```

### Payouts

```typescript
// Withdraw to bank
const payout = await client.payouts.create({
  amount: 100000,                      // millimes
  rib: "99000236175790748382",        // 20-digit Tunisian RIB
  account_holder_name: "Ahmed Ben Ali",
});

// List all
const payouts = await client.payouts.list();
```

### Balance & Transactions

```typescript
const balance = await client.balance.get();
// → { available, gross, refunded, payouts, pending, currency }

const txns = await client.transactions.list();
```

### Webhooks

```typescript
// Create
const webhook = await client.webhooks.create({
  url: "https://mysite.tn/webhooks/nexapay",
  event_types: ["payment_intent.succeeded", "payment_intent.failed"],
});

// List all
const webhooks = await client.webhooks.list();

// Delivery history
const deliveries = await client.webhooks.deliveries(webhook.data.id);

// Test webhook
await client.webhooks.test(webhook.data.id);

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

## Test Cards (Sandbox)

| Brand | Number | CVV | Result |
|-------|--------|-----|--------|
| Visa | `4242424242424242` | 123 | Success |
| MasterCard | `5555555555554444` | 123 | Success |
| Visa | `4000000000000002` | 123 | Declined |
| Visa | `4000000000009995` | 123 | Insufficient Funds |
| MasterCard | `5105105105105100` | 123 | Declined |

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
git clone https://github.com/n3on-rs/NexaPay.git
cd NexaPay/sdk
npm install
npm run build
```

## Links

- **Website**: https://nexapay.space
- **API Docs**: https://nexapay.space/docs
- **NPM**: https://www.npmjs.com/package/@nexapay/node-sdk
- **GitHub**: https://github.com/n3on-rs/NexaPay
- **Support**: contact@backendglitch.com
- **Built by**: [Glitch Inc / BackendGlitch Division](https://backendglitch.com)

## License

MIT — free to use, modify, and distribute. See [LICENSE](./LICENSE).
