const NexaPayModule = require("../sdk/dist/index.js");
const NexaPay = NexaPayModule.default || NexaPayModule;

const client = new NexaPay({
  apiKey: "nxp_developer_dbd9920d3116b3801ac896e8_0a6ba5ad",
  baseURL: "http://localhost:8088",
  timeout: 15000,
});

async function run() {
  console.log("=== NexaPay SDK Local Test ===\n");

  // 1. Balance
  console.log("--- Balance ---");
  const bal = await client.balance.get();
  console.log(bal.success ? `✅ Balance: ${JSON.stringify(bal.data)}` : `❌ ${bal.error}`);

  // 2. Create intent
  console.log("\n--- Create Payment Intent ---");
  const create = await client.paymentIntents.create({
    amount: 5000,
    currency: "TND",
    description: "SDK local test",
  });
  console.log(create.success ? `✅ Created: ${create.data.intent_id}` : `❌ ${create.error}`);
  if (!create.success) return;

  const intentId = create.data.intent_id;

  // 3. Retrieve intent
  console.log("\n--- Retrieve Payment Intent ---");
  const get = await client.paymentIntents.get(intentId);
  console.log(get.success ? `✅ Status: ${get.data.status}` : `❌ ${get.error}`);

  // 4. Confirm with card
  console.log("\n--- Confirm (card) ---");
  const confirm = await client.paymentIntents.confirm(intentId, {
    method: "card",
    card_number: "4242424242424242",
    expiry_month: "12",
    expiry_year: "2026",
    cvv: "123",
    pin: "1234",
    customer_first_name: "Test",
    customer_last_name: "User",
    customer_phone: "+21612345678",
  });
  console.log(confirm.success
    ? `✅ Confirmed: status=${confirm.data.status}`
    : `❌ ${confirm.error}`
  );
  if (confirm.success && confirm.data.failure_reason) {
    console.log(`   Reason: ${confirm.data.failure_reason}`);
  }

  // 5. List transactions
  console.log("\n--- Transactions ---");
  const txs = await client.transactions.list();
  console.log(txs.success
    ? `✅ Got ${txs.data?.intents?.length ?? 0} transactions`
    : `❌ ${txs.error}`
  );

  console.log("\n=== Done ===");
}

run().catch(console.error);
