export default function AgentAgreementPage() {
  return (
    <div className="min-h-screen bg-[#0b0b0b] text-white">
      <div className="mx-auto max-w-[800px] px-6 py-16">
        <h1 className="text-3xl font-bold tracking-tight mb-2">Merchant & Agent Agreement</h1>
        <p className="text-sm text-white/40 mb-12">Last updated: June 2026</p>

        <div className="space-y-10 text-sm leading-relaxed text-white/60">
          <section>
            <h2 className="text-lg font-semibold text-white mb-3">1. Definitions</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li><strong>NexaPay:</strong> The payment platform operated by Glitch Inc, Tax Code 1950237P, Tunisia.</li>
              <li><strong>Agent/Merchant ("you"):</strong> An approved business entity using the NexaPay API to accept payments.</li>
              <li><strong>API Key:</strong> A unique credential issued to the Agent for authenticating API requests.</li>
              <li><strong>Payment Intent:</strong> A request to initiate a payment from a customer to the Agent.</li>
              <li><strong>Settlement:</strong> The transfer of collected funds to the Agent's wallet or bank account.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">2. Agent Eligibility</h2>
            <p>To become a NexaPay Agent, you must:</p>
            <ul className="list-disc pl-5 space-y-2 mt-2">
              <li>Be a legally registered business in Tunisia (or approved jurisdiction) with a valid Tax Code.</li>
              <li>Submit a complete application including business name, type, tax registration, and supporting documents.</li>
              <li>Pass NexaPay's automated risk scoring and manual review process.</li>
              <li>Maintain active KYC verification — including valid identity documents for all beneficial owners.</li>
              <li>Not be engaged in any prohibited activity as defined in the NexaPay Terms of Service.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">3. API Key Management</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>API keys are issued exclusively to approved agents through the Agent Dashboard.</li>
              <li>Each agent may generate multiple keys for different environments (sandbox, production).</li>
              <li>Keys must be stored securely server-side. Never expose API keys in client code, mobile apps, or public repositories.</li>
              <li>You are fully responsible for all activity occurring under your API keys.</li>
              <li>Report compromised keys immediately. NexaPay will revoke compromised keys within 1 business hour of notification.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">4. Fees & Settlement</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li><strong>Transaction fees:</strong> Calculated per-transaction using NexaPay's bracket-based fee algorithm. The fee is displayed to the customer at checkout and deducted before settlement.</li>
              <li><strong>Settlement schedule:</strong> Funds are credited to your on-chain wallet immediately upon successful payment confirmation. Withdrawal to bank account (RIB) is available on-demand.</li>
              <li><strong>Chargebacks:</strong> In the event of a disputed transaction, the disputed amount plus a 5 TND processing fee may be deducted from your balance pending investigation.</li>
              <li><strong>Fee changes:</strong> NexaPay may modify its fee schedule with 30 calendar days notice to agents.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">5. KYC & Compliance Obligations</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>You must verify the identity of your customers in accordance with Tunisian AML/CTF regulations.</li>
              <li>You must retain transaction records for a minimum of 5 years as required by Tunisian tax law (Code des Droits et Procédures Fiscaux).</li>
              <li>You must report suspicious transactions to the Tunisian Financial Analysis Commission (CTAF) where applicable.</li>
              <li>You must cooperate with any NexaPay audit, compliance review, or information request within 5 business days.</li>
              <li>NexaPay may suspend or terminate your agent status for failure to meet KYC obligations.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">6. Chargebacks & Disputes</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>Customers may dispute transactions within 30 calendar days.</li>
              <li>Upon receiving a dispute, NexaPay will notify you and place a temporary hold on the disputed amount.</li>
              <li>You have 7 calendar days to submit evidence (receipts, delivery confirmation, communication records).</li>
              <li>NexaPay's dispute resolution decision is final. Unresolved chargebacks in the customer's favor will be deducted from your balance.</li>
              <li>Excessive chargeback rates (over 1% of transactions) may result in account review or termination.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">7. Branding & Attribution</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>You must display "Powered by NexaPay" or the NexaPay logo on your checkout page where NexaPay is the payment method.</li>
              <li>You may not use the NexaPay name or logo in a way that implies partnership, endorsement, or sponsorship without written permission.</li>
              <li>You may not white-label NexaPay or represent NexaPay services as your own proprietary technology.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">8. Data & Privacy</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>Customer data provided through NexaPay (name, phone, email, transaction details) may only be used for the specific transaction and related customer service.</li>
              <li>You may not sell, share, or use customer data for marketing without explicit opt-in consent.</li>
              <li>You must process customer data in compliance with the NexaPay Privacy Policy and Tunisian Organic Law No. 2004-63.</li>
              <li>You must notify NexaPay within 48 hours of any data breach affecting NexaPay customer data.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">9. Termination</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>Either party may terminate this agreement with 30 calendar days written notice.</li>
              <li>NexaPay may terminate immediately for: violation of prohibited activities, fraud, API key compromise not reported, excessive chargebacks, or failure to meet KYC obligations.</li>
              <li>Upon termination: your API keys are revoked, pending settlements are completed per normal schedule, and data retention obligations survive termination.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">10. Governing Law</h2>
            <p>This Agreement is governed by the laws of the Republic of Tunisia. Any disputes shall be submitted to the competent courts of Tunis.</p>
          </section>
        </div>

        <div className="mt-16 pt-8 border-t border-white/[0.06]">
          <p className="text-xs text-white/20">
            Glitch Inc — Auto-entrepreneur — Tax Code (Matricule Fiscal): 1950237P — Tunisia
          </p>
        </div>
      </div>
    </div>
  );
}
