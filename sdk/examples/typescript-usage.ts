/**
 * NexaPay Node.js SDK - TypeScript Usage Example
 *
 * This example demonstrates TypeScript usage patterns for the NexaPay SDK.
 * It verifies that type definitions work correctly and shows best practices.
 */

import NexaPay, {
  NexaPayConfig,
  CreatePaymentIntentRequest,
  PaymentIntent,
  ConfirmPaymentIntentRequest,
  CreateRefundRequest,
  Refund,
  Balance,
  NexaPayApiError,
  NexaPayValidationError,
  NexaPayRateLimitError,
  NexaPayAuthenticationError,
  isNexaPayApiError,
  toNexaPayError,
} from "@nexapay/node-sdk";

/**
 * Example configuration with proper TypeScript typing
 */
const config: NexaPayConfig = {
  apiKey:
    process.env.NEXAPAY_API_KEY || "nxp_merchant_abc123def456ghi789_12345678",
  baseURL: process.env.NEXAPAY_BASE_URL || "https://backend.nexapay.space",
  timeout: 30000,
  headers: {
    "X-Custom-Header": "TypeScript-Example",
  },
};

/**
 * Initialize the client with TypeScript inference
 */
const client = new NexaPay(config);

/**
 * TypeScript interface for order data
 */
interface OrderData {
  orderId: string;
  productName: string;
  customerId: string;
  metadata?: Record<string, any>;
}

/**
 * Example 1: Create a Payment Intent with TypeScript
 *
 * Demonstrates proper typing for request and response
 */
export async function createPaymentIntent(
  amount: number,
  currency: string,
  order: OrderData,
  customerEmail?: string,
  customerName?: string,
): Promise<PaymentIntent | null> {
  console.log("=== Creating Payment Intent (TypeScript) ===");

  const requestData: CreatePaymentIntentRequest = {
    amount,
    currency: currency || "TND",
    description: `Order ${order.orderId}: ${order.productName}`,
    customer_email: customerEmail,
    customer_name: customerName,
    metadata: {
      ...order.metadata,
      internal_order_id: order.orderId,
      customer_id: order.customerId,
      timestamp: new Date().toISOString(),
    },
    idempotency_key: `order-${order.orderId}-${Date.now()}`,
  };

  try {
    const response = await client.paymentIntents.create(requestData);

    if (response.success && response.data) {
      console.log("✅ Payment intent created successfully");

      // TypeScript knows the shape of response.data
      const intent: PaymentIntent = response.data;

      console.log(`Intent ID: ${intent.intent_id}`);
      console.log(`Status: ${intent.status}`);
      console.log(`Amount: ${intent.amount} ${intent.currency}`);
      console.log(`Checkout URL: ${intent.checkout_url}`);

      // Type-safe access to optional properties
      if (intent.description) {
        console.log(`Description: ${intent.description}`);
      }

      if (intent.customer_email) {
        console.log(`Customer: ${intent.customer_email}`);
      }

      return intent;
    } else {
      console.error("❌ Failed to create payment intent:", response.error);
      return null;
    }
  } catch (error) {
    handleErrorWithTypeScript(error);
    return null;
  }
}

/**
 * Example 2: Retrieve and Process Payment Intent
 *
 * Shows TypeScript type guards and conditional logic
 */
export async function processPaymentIntent(intentId: string): Promise<void> {
  console.log("\n=== Processing Payment Intent (TypeScript) ===");

  try {
    const response = await client.paymentIntents.get(intentId);

    if (response.success && response.data) {
      const intent = response.data;

      // Type-safe status checking
      switch (intent.status) {
        case "requires_confirmation":
          console.log("📋 Payment requires confirmation");
          console.log(`Redirect customer to: ${intent.checkout_url}`);
          break;

        case "succeeded":
          console.log("✅ Payment succeeded!");

          // Type-safe access to confirmation details
          if (intent.confirmed_at) {
            console.log(
              `Confirmed at: ${new Date(intent.confirmed_at).toLocaleString()}`,
            );
          }

          if (intent.card_last4 && intent.card_brand) {
            console.log(
              `Paid with: ${intent.card_brand} •••• ${intent.card_last4}`,
            );
          }
          break;

        case "failed":
          console.log("❌ Payment failed");

          // Type-safe access to failure reason
          if (intent.failure_reason) {
            console.log(`Reason: ${intent.failure_reason}`);
          }
          break;

        case "refunded":
        case "partially_refunded":
          console.log("↩️ Payment was refunded");
          console.log(`Status: ${intent.status}`);
          break;

        default:
          // TypeScript will warn if we miss a case
          const exhaustiveCheck: never = intent.status;
          return exhaustiveCheck;
      }
    }
  } catch (error) {
    handleErrorWithTypeScript(error);
  }
}

/**
 * Example 3: Confirm Payment with Type-Safe Card Data
 *
 * Demonstrates TypeScript for form validation and request building
 */
export async function confirmPayment(
  intentId: string,
  cardData: {
    number: string;
    expiryMonth: string;
    expiryYear: string;
    cvv: string;
    pin: string;
    holderName?: string;
  },
): Promise<boolean> {
  console.log("\n=== Confirming Payment (TypeScript) ===");

  // Type-safe request building
  const requestData: ConfirmPaymentIntentRequest = {
    method: "card",
    card_number: cardData.number.replace(/\s/g, ""),
    expiry_month: cardData.expiryMonth.padStart(2, "0"),
    expiry_year: cardData.expiryYear,
    cvv: cardData.cvv,
    pin: cardData.pin,
    card_holder_name: cardData.holderName,
    customer_first_name: "John",
    customer_last_name: "Doe",
    customer_phone: "+21612345678",
  };

  try {
    const response = await client.paymentIntents.confirm(intentId, requestData);

    // TypeScript knows the response structure
    if (response.success && response.data) {
      console.log(`✅ Payment ${response.data.status}`);

      if (response.data.status === "succeeded") {
        console.log(`Redirect to: ${response.data.redirect_url}`);
        return true;
      } else if (response.data.failure_reason) {
        console.log(`Failure reason: ${response.data.failure_reason}`);
      }
    }

    return false;
  } catch (error) {
    handleErrorWithTypeScript(error);
    return false;
  }
}

/**
 * Example 4: Create Refund with TypeScript
 *
 * Shows proper typing for refund operations
 */
export async function createRefund(
  intentId: string,
  amount?: number,
  reason?: string,
): Promise<Refund | null> {
  console.log("\n=== Creating Refund (TypeScript) ===");

  const requestData: CreateRefundRequest = {
    intent_id: intentId,
    amount,
    reason,
  };

  try {
    const response = await client.refunds.create(requestData);

    if (response.success && response.data) {
      const refund: Refund = response.data;

      console.log("✅ Refund created successfully");
      console.log(`Refund ID: ${refund.refund_id}`);
      console.log(`Amount: ${refund.amount} millimes`);
      console.log(`Status: ${refund.status}`);
      console.log(`Intent Status: ${refund.intent_status}`);

      if (refund.reason) {
        console.log(`Reason: ${refund.reason}`);
      }

      return refund;
    }

    return null;
  } catch (error) {
    handleErrorWithTypeScript(error);
    return null;
  }
}

/**
 * Example 5: Get Balance with TypeScript
 *
 * Demonstrates TypeScript for financial data
 */
export async function getBalanceInfo(): Promise<Balance | null> {
  console.log("\n=== Getting Balance Info (TypeScript) ===");

  try {
    const response = await client.balance.get();

    if (response.success && response.data) {
      const balance: Balance = response.data;

      console.log("💰 Balance Information:");
      console.log(`Currency: ${balance.currency}`);
      console.log(`Gross: ${formatMillimes(balance.gross)}`);
      console.log(`Refunded: ${formatMillimes(balance.refunded)}`);
      console.log(`Pending: ${formatMillimes(balance.pending)}`);
      console.log(`Available: ${formatMillimes(balance.available)}`);
      console.log(`Payouts: ${formatMillimes(balance.payouts)}`);

      // Type-safe calculations
      const netAmount = balance.gross - balance.refunded;
      console.log(`Net: ${formatMillimes(netAmount)}`);

      return balance;
    }

    return null;
  } catch (error) {
    handleErrorWithTypeScript(error);
    return null;
  }
}

/**
 * Example 6: Advanced Error Handling with TypeScript
 *
 * Shows TypeScript type guards and discriminated unions
 */
export function handleErrorWithTypeScript(error: unknown): void {
  console.log("\n=== Error Handling (TypeScript) ===");

  // Convert any error to NexaPayError
  const nexaPayError = toNexaPayError(error);

  // Type guard checks
  if (isNexaPayApiError(nexaPayError)) {
    console.log(
      `📡 API Error ${nexaPayError.statusCode}: ${nexaPayError.message}`,
    );

    // Type-specific properties
    if (nexaPayError.requestId) {
      console.log(`Request ID: ${nexaPayError.requestId}`);
    }

    // Type-safe error classification
    if (nexaPayError.isRateLimitError) {
      console.log("⏱️ Rate limit exceeded");

      // Type assertion for rate limit errors
      const rateLimitError = nexaPayError as NexaPayRateLimitError;
      if (rateLimitError.retryAfter) {
        console.log(`Retry after: ${rateLimitError.retryAfter} seconds`);
      }
    } else if (nexaPayError.isAuthenticationError) {
      console.log("🔐 Authentication error - check your API key");

      // Type assertion for auth errors
      const authError = nexaPayError as NexaPayAuthenticationError;
      console.log(`Auth error details:`, authError.details);
    } else if (nexaPayError.isValidationError) {
      console.log("📋 Validation error - check your request data");

      // Type assertion for validation errors
      const validationError = nexaPayError as NexaPayValidationError;
      if (validationError.validationErrors) {
        console.log("Validation errors:", validationError.validationErrors);
      }
    } else if (nexaPayError.isServerError) {
      console.log("🖥️ Server error - please try again later");
    }
  } else {
    // Generic error handling
    console.log("❓ Error:", nexaPayError.message);

    if (nexaPayError.details) {
      console.log("Details:", nexaPayError.details);
    }
  }
}

/**
 * Example 7: Webhook Handling with TypeScript
 *
 * Demonstrates TypeScript for webhook event handling
 */
export interface WebhookEvent {
  id: string;
  event: string;
  created_at: string;
  data: any;
}

export function handleWebhookEvent(
  payload: string | Buffer,
  signature: string,
  secret: string,
): WebhookEvent | null {
  console.log("\n=== Handling Webhook (TypeScript) ===");

  try {
    // Type-safe webhook parsing
    const event = client.parseWebhookEvent(payload, signature, secret);

    // Basic type checking
    if (typeof event === "object" && event !== null) {
      const webhookEvent = event as WebhookEvent;

      console.log(`📨 Webhook received: ${webhookEvent.event}`);
      console.log(`Event ID: ${webhookEvent.id}`);
      console.log(`Created: ${webhookEvent.created_at}`);

      // Type-safe event handling
      switch (webhookEvent.event) {
        case "payment_intent.succeeded":
          console.log("💰 Payment succeeded!");
          console.log("Data:", webhookEvent.data);
          break;

        case "payment_intent.failed":
          console.log("❌ Payment failed");
          console.log("Data:", webhookEvent.data);
          break;

        case "payment_intent.refunded":
          console.log("↩️ Payment refunded");
          console.log("Data:", webhookEvent.data);
          break;

        case "payout.created":
          console.log("💸 Payout created");
          console.log("Data:", webhookEvent.data);
          break;

        default:
          console.log(`ℹ️ Unknown event type: ${webhookEvent.event}`);
      }

      return webhookEvent;
    }

    return null;
  } catch (error) {
    console.error("❌ Webhook verification failed:");
    handleErrorWithTypeScript(error);
    return null;
  }
}

/**
 * Example 8: Using All Resource Classes with TypeScript
 *
 * Demonstrates TypeScript for all available resources
 */
export async function demonstrateAllResources(): Promise<void> {
  console.log("\n=== Using All Resources (TypeScript) ===");

  // All resources are typed on the client
  console.log("Available resources:");
  console.log("- merchants:", typeof client.merchants);
  console.log("- paymentIntents:", typeof client.paymentIntents);
  console.log("- refunds:", typeof client.refunds);
  console.log("- payouts:", typeof client.payouts);
  console.log("- webhooks:", typeof client.webhooks);
  console.log("- balance:", typeof client.balance);
  console.log("- transactions:", typeof client.transactions);
  console.log("- developer:", typeof client.developer);

  // Example: Get transactions
  try {
    const response = await client.transactions.list();

    if (response.success && response.data) {
      console.log("\n📊 Transactions:");

      // Type-safe array iteration
      response.data.intents.forEach((transaction, index) => {
        console.log(
          `${index + 1}. ${transaction.type.toUpperCase()}: ${transaction.id}`,
        );
        console.log(`   Amount: ${formatMillimes(transaction.amount)}`);
        console.log(`   Status: ${transaction.status}`);

        if (transaction.description) {
          console.log(`   Description: ${transaction.description}`);
        }
      });
    }
  } catch (error) {
    console.log(
      "Note: Could not fetch transactions (might need specific permissions)",
    );
  }
}

/**
 * Utility function to format millimes as TND
 */
function formatMillimes(millimes: number): string {
  const tnd = millimes / 1000;
  return `${tnd.toFixed(3)} TND (${millimes.toLocaleString()} millimes)`;
}

/**
 * Main function to run TypeScript examples
 */
async function runTypeScriptExamples(): Promise<void> {
  console.log("🚀 Running NexaPay TypeScript Examples");
  console.log("=======================================\n");

  // Example order data with TypeScript interface
  const order: OrderData = {
    orderId: "TS-123",
    productName: "TypeScript Course",
    customerId: "cust-ts-456",
    metadata: {
      category: "education",
      platform: "web",
    },
  };

  // Run examples
  const intent = await createPaymentIntent(
    29900,
    "TND",
    order,
    "student@example.tn",
    "TypeScript Learner",
  );

  if (intent) {
    await processPaymentIntent(intent.intent_id);

    // Example card data (test card)
    const testCard = {
      number: "4242424242424242",
      expiryMonth: "12",
      expiryYear: "2029",
      cvv: "123",
      pin: "1234",
      holderName: "TypeScript Tester",
    };

    // Note: In production, use hosted checkout instead of direct confirmation
    // await confirmPayment(intent.intent_id, testCard);

    // Example wallet payment with OTP
    // await confirmWalletPayment(intent.intent_id);

    // Example refund (would need successful payment first)
    // await createRefund(intent.intent_id, 14950, 'Partial refund requested');
  }

  await getBalanceInfo();
  await demonstrateAllResources();

  // Example error handling
  console.log("\n=== Demonstrating Error Handling ===");
  try {
    // This will fail with invalid endpoint
    await client.get("/invalid-endpoint");
  } catch (error) {
    handleErrorWithTypeScript(error);
  }

  console.log("\n=======================================");
  console.log("✅ TypeScript examples completed!");
  console.log("\n📝 TypeScript Features Demonstrated:");
  console.log("• Type-safe API requests and responses");
  console.log("• Interface definitions for custom data");
  console.log("• Type guards for error handling");
  console.log("• Discriminated unions for status handling");
  console.log("• Generic type parameters");
  console.log("• Type assertions when needed");
  console.log("• Utility types for common patterns");
}

// Export all functions for use in other modules
export {
  createPaymentIntent,
  processPaymentIntent,
  confirmPayment,
  createRefund,
  getBalanceInfo,
  handleErrorWithTypeScript,
  handleWebhookEvent,
  demonstrateAllResources,
  runTypeScriptExamples,
};

// Run examples if this file is executed directly
if (require.main === module) {
  runTypeScriptExamples().catch(console.error);
}
