/**
 * NexaPay Node.js SDK - Basic Usage Example
 *
 * This example demonstrates common usage patterns for the NexaPay SDK.
 * Replace placeholder values with your actual API keys and test data.
 */

// Import the NexaPay SDK (CommonJS syntax)
const NexaPay = require("@nexapay/node-sdk");

// ES Modules alternative:
// import NexaPay from '@nexapay/node-sdk';

// Initialize the client with your API key
const client = new NexaPay({
  apiKey: "nxp_merchant_abc123def456ghi789_12345678",
  // Optional: override default base URL for testing
  // baseURL: 'http://localhost:8088', // Local development
  // baseURL: 'https://backend.nexapay.space', // Production (default)
  timeout: 30000, // 30 seconds (default)
});

/**
 * Example 1: Create a Payment Intent
 *
 * Payment intents represent a request to collect payment from a customer.
 * After creating an intent, redirect the customer to the checkout_url.
 */
async function createPaymentIntent() {
  console.log("=== Example 1: Creating Payment Intent ===");

  try {
    const response = await client.paymentIntents.create({
      amount: 42000, // Amount in millimes (1 TND = 1000 millimes, so 42000 = 42.000 TND)
      currency: "TND", // Optional, defaults to 'TND'
      description: "Order #42", // Optional
      customer_email: "customer@example.tn", // Optional
      customer_name: "Ahmed Ben Ali", // Optional
      metadata: {
        // Optional custom metadata
        order_id: "42",
        product: "Premium Subscription",
      },
      idempotency_key: "order-42-attempt-1", // Optional, prevents duplicate payments
    });

    if (response.success) {
      console.log("✅ Payment intent created successfully!");
      console.log("Intent ID:", response.data.intent_id);
      console.log("Status:", response.data.status);
      console.log("Checkout URL:", response.data.checkout_url);
      console.log("Amount:", response.data.amount, response.data.currency);

      // In a real application, you would:
      // 1. Save the intent_id to your database
      // 2. Redirect the customer to response.data.checkout_url
      // 3. Wait for webhook notification or poll for status updates

      return response.data;
    } else {
      console.error("❌ Failed to create payment intent:", response.error);
    }
  } catch (error) {
    console.error("❌ Error creating payment intent:");
    handleError(error);
  }
}

/**
 * Example 2: Retrieve a Payment Intent
 *
 * Fetch details of an existing payment intent.
 */
async function retrievePaymentIntent(intentId) {
  console.log("\n=== Example 2: Retrieving Payment Intent ===");

  try {
    const response = await client.paymentIntents.get(intentId);

    if (response.success) {
      console.log("✅ Payment intent retrieved:");
      console.log("ID:", response.data.intent_id);
      console.log("Status:", response.data.status);
      console.log("Amount:", response.data.amount, response.data.currency);

      if (response.data.card_last4) {
        console.log(
          "Card:",
          response.data.card_brand,
          "••••",
          response.data.card_last4,
        );
      }

      return response.data;
    } else {
      console.error("❌ Failed to retrieve payment intent:", response.error);
    }
  } catch (error) {
    console.error("❌ Error retrieving payment intent:");
    handleError(error);
  }
}

/**
 * Example 3: Confirm a Payment Intent (Direct Integration)
 *
 * Note: In production, you should use the hosted checkout page.
 * This direct confirmation is for testing or specific use cases.
 *
 * Test card numbers:
 * - 4242424242424242 (PIN: 1234) - Success
 * - 5555555555554444 (PIN: 1234) - Success
 * - 4000000000000002 (PIN: 1234) - Declined
 */
async function confirmPaymentIntent(intentId) {
  console.log("\n=== Example 3: Confirming Payment Intent ===");

  try {
    const response = await client.paymentIntents.confirm(intentId, {
      method: "card",
      card_number: "4242424242424242",
      expiry_month: "12",
      expiry_year: "2026",
      cvv: "123",
      pin: "1234",
      customer_first_name: "John",
      customer_last_name: "Doe",
      customer_phone: "+21612345678",
    });

    if (response.success) {
      console.log("✅ Payment confirmed successfully!");
      console.log("Status:", response.data.status);
      console.log("Redirect URL:", response.data.redirect_url);

      if (response.data.failure_reason) {
        console.log("Failure reason:", response.data.failure_reason);
      }
    } else {
      console.error("❌ Payment confirmation failed:", response.error);
    }

    return response.data;
  } catch (error) {
    console.error("❌ Error confirming payment intent:");
    handleError(error);
  }
}

async function walletPayment(client) {
  // Step 1: create a payment intent
  const create = await client.paymentIntents.create({
    amount: 10000,
    description: "Wallet test",
    currency: "TND",
  });
  if (!create.ok) {
    console.error("Create failed:", create);
    return;
  }
  const intent = create.data;
  console.log("Intent created:", intent.intent_id);

  // Step 2: confirm with wallet (sends OTP)
  const step1 = await client.paymentIntents.confirm(intent.intent_id, {
    method: "wallet",
    phone: "+21612345678",
    pin: "1234",
  });
  if (!step1.ok) {
    console.error("Confirm failed:", step1);
    return;
  }
  console.log("Step 1:", step1.data);
  if (step1.data.step === "otp_required") {
    // In sandbox, dev_otp is provided
    const otp = step1.data.dev_otp || prompt("Enter OTP:");
    // Step 3: verify OTP
    const step2 = await client.paymentIntents.confirm(intent.intent_id, {
      method: "wallet",
      phone: "+21612345678",
      pin: "1234",
      otp,
    });
    console.log("Step 2:", step2.data);
  }
}

/**
 * Example 4: Get Merchant Balance
 *
 * Check available balance for payouts.
 */
async function getMerchantBalance() {
  console.log("\n=== Example 4: Getting Merchant Balance ===");

  try {
    const response = await client.balance.get();

    if (response.success) {
      console.log("✅ Balance retrieved:");
      console.log("Currency:", response.data.currency);
      console.log("Gross:", response.data.gross, "millimes");
      console.log("Refunded:", response.data.refunded, "millimes");
      console.log("Pending:", response.data.pending, "millimes");
      console.log("Available:", response.data.available, "millimes");
      console.log("Payouts:", response.data.payouts, "millimes");

      // Convert to TND for display
      const grossTND = response.data.gross / 1000;
      const availableTND = response.data.available / 1000;
      console.log(
        `\n📊 Summary: ${grossTND.toFixed(3)} TND gross, ${availableTND.toFixed(3)} TND available for payout`,
      );

      return response.data;
    } else {
      console.error("❌ Failed to get balance:", response.error);
    }
  } catch (error) {
    console.error("❌ Error getting balance:");
    handleError(error);
  }
}

/**
 * Example 5: Create a Refund
 *
 * Refund a successful payment (full or partial).
 */
async function createRefund(intentId) {
  console.log("\n=== Example 5: Creating Refund ===");

  try {
    const response = await client.refunds.create({
      intent_id: intentId,
      amount: 21000, // Optional, defaults to full amount (21000 = 21.000 TND)
      reason: "Customer requested refund", // Optional
    });

    if (response.success) {
      console.log("✅ Refund created successfully!");
      console.log("Refund ID:", response.data.refund_id);
      console.log("Amount:", response.data.amount, "millimes");
      console.log("Status:", response.data.status);
      console.log("Intent Status:", response.data.intent_status);

      return response.data;
    } else {
      console.error("❌ Failed to create refund:", response.error);
    }
  } catch (error) {
    console.error("❌ Error creating refund:");
    handleError(error);
  }
}

/**
 * Example 6: Webhook Verification
 *
 * Verify incoming webhook signatures in your Express/Node.js server.
 * This is a demonstration of the verification logic.
 */
function demonstrateWebhookVerification() {
  console.log("\n=== Example 6: Webhook Verification ===");

  // In a real Express app:
  /*
  app.post('/webhooks/nexapay', express.raw({ type: 'application/json' }), (req, res) => {
    const signature = req.headers['x-nexapay-signature'];
    const payload = req.body;
    const secret = 'your-webhook-signing-secret'; // From webhook creation

    try {
      // Verify the webhook signature
      const event = client.parseWebhookEvent(payload, signature, secret);

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
  */

  console.log("📝 Webhook verification logic shown in comments.");
  console.log("To use webhooks:");
  console.log("1. Create a webhook endpoint in your app");
  console.log("2. Register it with client.webhooks.create()");
  console.log("3. Use client.parseWebhookEvent() to verify incoming webhooks");
}

/**
 * Example 7: Error Handling
 *
 * Demonstrate comprehensive error handling.
 */
async function demonstrateErrorHandling() {
  console.log("\n=== Example 7: Error Handling ===");

  try {
    // This will fail with invalid API key
    const invalidClient = new NexaPay({
      apiKey: "invalid_key",
    });

    await invalidClient.balance.get();
  } catch (error) {
    console.log("Example error handling:");

    if (error.isNexaPayApiError) {
      console.log("📡 API Error:", error.statusCode, error.message);

      if (error.isRateLimitError) {
        console.log(
          "⏱️  Rate limit exceeded, retry after:",
          error.retryAfter,
          "seconds",
        );
      } else if (error.isAuthenticationError) {
        console.log("🔐 Authentication failed, check your API key");
      } else if (error.isValidationError) {
        console.log("📋 Validation failed:", error.validationErrors);
      } else if (error.isServerError) {
        console.log("🖥️  Server error, please try again later");
      }
    } else if (error.isNexaPayNetworkError) {
      console.log("🌐 Network error:", error.message);
    } else {
      console.log("❓ Unexpected error:", error);
    }
  }
}

/**
 * Helper function to handle errors consistently
 */
function handleError(error) {
  if (error.isNexaPayApiError) {
    console.log("API Error", error.statusCode + ":", error.message);

    if (error.requestId) {
      console.log("Request ID:", error.requestId);
    }
  } else if (error.isNexaPayNetworkError) {
    console.log("Network Error:", error.message);
  } else {
    console.log("Error:", error.message || error);
  }
}

/**
 * Main function to run all examples
 */
async function runAllExamples() {
  console.log("🚀 Starting NexaPay SDK Examples");
  console.log("================================\n");

  // Note: These examples require actual API calls.
  // Uncomment and modify to run with your actual credentials.

  /*
  // Example 1: Create a payment intent
  const intent = await createPaymentIntent();

  if (intent) {
    // Example 2: Retrieve the created intent
    await retrievePaymentIntent(intent.intent_id);

    // Example 3: Confirm the payment (only for testing)
    // await confirmPaymentIntent(intent.intent_id);

    // Example 4: Check balance
    await getMerchantBalance();

    // Example 5: Create refund (would need actual successful payment first)
    // await createRefund(intent.intent_id);
  }
  */

  // Example 6: Webhook verification (conceptual)
  demonstrateWebhookVerification();

  // Example 7: Error handling
  await demonstrateErrorHandling();

  console.log("\n================================");
  console.log("✅ Examples completed!");
  console.log("\n📚 Next steps:");
  console.log("1. Get an API key from https://nexapay.space/dev");
  console.log("2. Update the API key in this example");
  console.log("3. Uncomment the example calls above");
  console.log("4. Run with: node examples/basic.js");
}

/**
 * Developer Documentation Snippets
 *
 * Example of using developer-specific endpoints.
 */
async function getDeveloperSnippets() {
  console.log("\n=== Developer Documentation Snippets ===");

  // Requires a developer API key (nxp_developer_...)
  const devClient = new NexaPay({
    apiKey: "nxp_developer_abc123def456ghi789_87654321",
  });

  try {
    const response = await devClient.developer.docsSnippets();

    if (response.success) {
      console.log("📖 Documentation snippets available");
      console.log(
        "Test cards:",
        JSON.stringify(response.data.test_cards, null, 2),
      );
      console.log("Checkout URL pattern:", response.data.checkout_url_pattern);
    }
  } catch (error) {
    console.log("Note: This requires a developer API key");
  }
}

// Run the examples if this file is executed directly
if (require.main === module) {
  runAllExamples().catch(console.error);
}

// Export functions for use in other files
module.exports = {
  createPaymentIntent,
  retrievePaymentIntent,
  confirmPaymentIntent,
  getMerchantBalance,
  createRefund,
  demonstrateWebhookVerification,
  demonstrateErrorHandling,
  getDeveloperSnippets,
};
