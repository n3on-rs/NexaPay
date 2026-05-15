# NexaPay Node.js SDK

Official Node.js SDK for the NexaPay Tunisian Payment Gateway. This SDK provides a convenient way to integrate NexaPay payment processing into your Node.js applications.

## Features

- **TypeScript Support**: Full TypeScript definitions for all API resources
- **Promise-based API**: All methods return promises for async/await usage
- **Error Handling**: Comprehensive error classes for different failure scenarios
- **Webhook Verification**: Built-in utilities for verifying webhook signatures
- **Resource-oriented Design**: Intuitive API organized by resource type
- **Automatic Retries**: Configurable retry logic for transient failures
- **Rate Limit Handling**: Built-in rate limit awareness and backoff

## Installation

```bash
npm install @nexapay/node-sdk
```

Or with yarn:

```bash
yarn add @nexapay/node-sdk
```

## Quick Start

```javascript
const NexaPay = require('@nexapay/node-sdk');

// Or using ES modules/TypeScript:
// import NexaPay from '@nexapay/node-sdk';

// Initialize the client with your API key
const client = new NexaPay({
  apiKey: 'nxp_merchant_abc123def456ghi789_12345678',
  // Optional: override default base URL
  // baseURL: 'https://backend.nexapay.space',
  // timeout: 30000, // milliseconds
});

// Create a payment intent
async function createPayment() {
  try {
    const response = await client.paymentIntents.create({
      amount: 42000, // 42.000 TND in millimes
      currency: 'TND',
      description: 'Order #42',
      customer_email: 'customer@example.tn',
      customer_name: 'Ahmed Ben Ali',
      idempotency_key: 'order-42-attempt-1'
    });

    if (response.success) {
      console.log('Payment intent created:', response.data);
      // Redirect customer to checkout_url
      console.log('Checkout URL:', response.data.checkout_url);
    }
  } catch (error) {
    console.error('Error creating payment intent:', error.message);
  }
}
```

## Authentication

All API requests require an API key. You can obtain API keys from the [NexaPay Developer Portal](https://nexapay.space/dev).

API keys follow the format: `nxp_{owner_tag}_{token}_{checksum}`

- **Merchant keys**: `nxp_merchant_...` - For merchant operations (create intents, refunds, etc.)
- **Developer keys**: `nxp_developer_...` - For developer operations (register merchants, get snippets)

## API Reference

### Payment Intents

Payment intents represent a request to collect payment from a customer. You create a payment intent and then redirect the customer to the checkout URL to complete payment.

```javascript
// Create a payment intent
const intent = await client.paymentIntents.create({
  amount: 42000, // Amount in millimes (1 TND = 1000 millimes)
  currency: 'TND', // Optional, defaults to 'TND'
  description: 'Order #42', // Optional
  customer_email: 'customer@example.tn', // Optional
  customer_name: 'Ahmed Ben Ali', // Optional
  metadata: { // Optional custom metadata
    order_id: '42',
    product: 'Premium Subscription'
  },
  idempotency_key: 'order-42-attempt-1' // Optional, prevents duplicate payments
});

// Retrieve a payment intent
const retrieved = await client.paymentIntents.get('pi_abc123def456ghi7');

// Confirm a payment intent with card details
const confirmed = await client.paymentIntents.confirm('pi_abc123def456ghi7', {
  card_number: '4242424242424242',
  expiry_month: '12',
  expiry_year: '2029',
  cvv: '123',
  pin: '1234',
  card_holder_name: 'Ahmed Ben Ali' // Optional
});
```

### Merchants

Merchants are businesses that accept payments through NexaPay. Developer keys can register new merchants.

```javascript
// Register a new merchant (requires developer key)
const merchant = await client.merchants.register({
  name: 'My Store',
  business_name: 'My Store SARL', // Optional
  support_email: 'support@mystore.tn',
  webhook_url: 'https://mystore.tn/webhooks/nexapay' // Optional
});

// Get merchant statistics (requires merchant key)
const stats = await client.merchants.stats();
```

### Refunds

Refund successful payments fully or partially.

```javascript
// Create a refund
const refund = await client.refunds.create({
  intent_id: 'pi_abc123def456ghi7',
  amount: 21000, // Optional, defaults to full amount
  reason: 'Customer requested refund' // Optional
});
```

### Payouts

Transfer available balance to a destination (e.g. wallet or payout target).

```javascript
// Create a payout
const payout = await client.payouts.create({
  amount: 4150000, // Amount in millimes
  destination: 'IBAN TN59 1000 1000 1000 1000 1000'
});
```

### Balance & Transactions

Monitor your merchant balance and transaction history.

```javascript
// Get current balance
const balance = await client.balance.get();

// Get transaction history
const transactions = await client.transactions.list();
```

### Webhooks

Set up webhooks to receive real-time payment events.

```javascript
// Create a webhook
const webhook = await client.webhooks.create({
  url: 'https://yourdomain.tn/webhooks/nexapay',
  event_types: [ // Optional, defaults to all payment events
    'payment_intent.succeeded',
    'payment_intent.failed',
    'payment_intent.refunded'
  ]
});

// List all webhooks
const webhooks = await client.webhooks.list();

// Get delivery logs for a webhook
const deliveries = await client.webhooks.deliveries('webhook-id-uuid');

// Test a webhook
const testResult = await client.webhooks.test('webhook-id-uuid');

// Delete a webhook
const deletion = await client.webhooks.delete('webhook-id-uuid');
```

## Error Handling

The SDK throws specific error classes for different failure scenarios:

```javascript
try {
  const intent = await client.paymentIntents.create({
    amount: 42000,
    currency: 'TND'
  });
} catch (error) {
  if (error.isNexaPayApiError) {
    console.error('API Error:', error.statusCode, error.message);
    
    if (error.isRateLimitError) {
      console.log('Rate limit exceeded, retry after:', error.retryAfter, 'seconds');
    } else if (error.isAuthenticationError) {
      console.log('Authentication failed, check your API key');
    } else if (error.isValidationError) {
      console.log('Validation failed:', error.validationErrors);
    }
  } else if (error.isNexaPayNetworkError) {
    console.error('Network error:', error.message);
  } else {
    console.error('Unexpected error:', error);
  }
}
```

### Available Error Classes

- `NexaPayApiError` - Base class for all API errors
- `NexaPayAuthenticationError` - Authentication failures (401, 403)
- `NexaPayRateLimitError` - Rate limit exceeded (429)
- `NexaPayValidationError` - Request validation failed (400, 422)
- `NexaPayNotFoundError` - Resource not found (404)
- `NexaPayServerError` - Server errors (5xx)
- `NexaPayWebhookError` - Webhook signature verification failed
- `NexaPayNetworkError` - Network connectivity issues
- `NexaPayInvalidApiKeyError` - Invalid API key format

## Webhook Verification

Verify incoming webhook signatures to ensure they come from NexaPay:

```javascript
// In your webhook handler (Express example)
app.post('/webhooks/nexapay', express.raw({ type: 'application/json' }), (req, res) => {
  const signature = req.headers['x-nexapay-signature'];
  const payload = req.body;
  
  try {
    // Verify signature and parse event
    const event = client.parseWebhookEvent(payload, signature, 'your-webhook-secret');
    
    // Handle different event types
    switch (event.event) {
      case 'payment_intent.succeeded':
        console.log('Payment succeeded:', event.data);
        // Update your database, send confirmation email, etc.
        break;
      case 'payment_intent.failed':
        console.log('Payment failed:', event.data);
        break;
      case 'payment_intent.refunded':
        console.log('Payment refunded:', event.data);
        break;
      case 'payout.created':
        console.log('Payout created:', event.data);
        break;
    }
    
    res.status(200).json({ received: true });
  } catch (error) {
    console.error('Webhook verification failed:', error.message);
    res.status(400).json({ error: 'Invalid signature' });
  }
});
```

## Testing

### Test Card Numbers

Use these test card numbers in development:

| Card Number | PIN | Result |
|-------------|-----|--------|
| `4242424242424242` | `1234` | Success |
| `5555555555554444` | `1234` | Success |
| `4000000000000002` | `1234` | Declined |

### Sandbox Environment

For testing, use the development base URL:

```javascript
const testClient = new NexaPay({
  apiKey: 'nxp_merchant_testkey_abcdef123456_12345678',
  baseURL: 'http://localhost:8088' // Local development
});
```

## Configuration Options

```javascript
const client = new NexaPay({
  // Required
  apiKey: 'nxp_merchant_abc123def456ghi789_12345678',
  
  // Optional
  baseURL: 'https://backend.nexapay.space', // Default
  timeout: 30000, // 30 seconds, default
  headers: {
    'X-Custom-Header': 'value'
  }
});
```

## Migration Guide

### Version 0.1.1 Changes

Version 0.1.1 introduces a breaking change to prepare for production deployment:

#### Breaking Changes
1. **Default Base URL Changed**: The default `baseURL` has been updated from `https://nexapay.space/backend` to `https://backend.nexapay.space`

#### Migration Steps

1. **Update Existing Code**: If you were using the default base URL, no changes are needed. If you explicitly set the baseURL, update it:

```javascript
// Before v0.1.1
const client = new NexaPay({
  apiKey: 'your-api-key',
  baseURL: 'https://nexapay.space/backend' // Old URL
});

// After v0.1.1  
const client = new NexaPay({
  apiKey: 'your-api-key',
  baseURL: 'https://backend.nexapay.space' // New URL
});
```

2. **Test Your Integration**: Verify your integration still works with the new URL:

```javascript
const NexaPay = require('@nexapay/node-sdk');

const client = new NexaPay({
  apiKey: 'your-api-key'
});

// Test connectivity
async function testConnection() {
  try {
    const response = await client.request('GET', '/chain/stats');
    console.log('✅ Connection successful');
    console.log('Base URL:', client.getBaseURL());
  } catch (error) {
    console.error('❌ Connection failed:', error.message);
  }
}

testConnection();
```

3. **Update Environment Variables**: If you use environment variables for configuration:

```bash
# Before
NEXAPAY_BASE_URL=https://nexapay.space/backend

# After
NEXAPAY_BASE_URL=https://backend.nexapay.space
```

4. **Check All API Calls**: Ensure all your API calls work correctly with the new base URL.

#### Why This Change?

The change was made to support the new production subdomain architecture:
- **Frontend Portal**: `https://nexapay.space` (Next.js application)
- **Backend API**: `https://backend.nexapay.space` (Rust API)

This separation provides better security, scalability, and maintainability.

#### Need Help?

If you encounter issues during migration:
1. Check the [GitHub Issues](https://github.com/nexapay/nexapay-node-sdk/issues)
2. Email support: contact@backendglitch.com
3. Visit the [Developer Portal](https://nexapay.space/dev)

## TypeScript Support

The SDK includes full TypeScript definitions:

```typescript
import NexaPay, {
  NexaPayConfig,
  CreatePaymentIntentRequest,
  PaymentIntent,
  NexaPayApiError
} from '@nexapay/node-sdk';

const config: NexaPayConfig = {
  apiKey: 'nxp_merchant_abc123def456ghi789_12345678',
};

const client = new NexaPay(config);

async function createPayment(
  request: CreatePaymentIntentRequest
): Promise<PaymentIntent> {
  try {
    const response = await client.paymentIntents.create(request);
    if (response.success) {
      return response.data;
    }
    throw new Error(response.error || 'Unknown error');
  } catch (error) {
    if (error instanceof NexaPayApiError) {
      console.error(`API Error ${error.statusCode}:`, error.message);
    }
    throw error;
  }
}
```

## Advanced Usage

### Custom HTTP Client

The SDK uses Axios internally. You can customize the HTTP client by accessing the underlying instance:

```javascript
// Access the underlying Axios instance
client.httpClient.interceptors.request.use((config) => {
  console.log('Making request to:', config.url);
  return config;
});

// Add response interceptor
client.httpClient.interceptors.response.use(
  (response) => {
    console.log('Response received:', response.status);
    return response;
  },
  (error) => {
    console.error('Request failed:', error.message);
    return Promise.reject(error);
  }
);
```

### Manual Request Handling

For advanced use cases, you can make requests directly:

```javascript
// Manual GET request
const response = await client.get('/gateway/v1/balance');

// Manual POST request
const response = await client.post('/gateway/v1/intents', {
  amount: 42000,
  currency: 'TND'
});

// With custom options
const response = await client.request('PATCH', '/some/endpoint', data, {
  timeout: 10000,
  headers: { 'X-Custom-Header': 'value' }
});
```

## Development

### Building from Source

```bash
# Clone the repository
git clone https://github.com/nexapay/nexapay-node-sdk.git
cd nexapay-node-sdk

# Install dependencies
npm install

# Build the SDK
npm run build

# Run tests
npm test

# Run linter
npm run lint
```

### Project Structure

```
src/
├── index.ts           # Main entry point
├── client.ts          # Main client class
├── types.ts           # TypeScript type definitions
├── resources.ts       # Resource classes
├── errors.ts          # Custom error classes
└── utils.ts           # Utility functions
```

## API Documentation

For complete API documentation, refer to:
- [OpenAPI Specification](https://nexapay.space/docs/api/openapi.yaml)
- [NexaPay Developer Portal](https://nexapay.space/dev)
- [Interactive API Docs](https://nexapay.space/docs)

## Support

- **Documentation**: [https://nexapay.space/docs](https://nexapay.space/docs)
- **Issues**: [GitHub Issues](https://github.com/nexapay/nexapay-node-sdk/issues)
- **Email**: contact@backendglitch.com
- **Website**: [https://nexapay.space](https://nexapay.space)

## License

MIT License. See [LICENSE](LICENSE) file for details.

---

Built with ❤️ by NexaPay for Tunisian developers.