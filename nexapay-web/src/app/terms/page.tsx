export default function TermsPage() {
  return (
    <div className="min-h-screen bg-[#0b0b0b] text-white">
      <div className="mx-auto max-w-[800px] px-6 py-16">
        <h1 className="text-3xl font-bold tracking-tight mb-2">Terms of Service</h1>
        <p className="text-sm text-white/40 mb-12">Last updated: June 2026</p>

        <div className="space-y-10 text-sm leading-relaxed text-white/60">
          <section>
            <h2 className="text-lg font-semibold text-white mb-3">1. About NexaPay</h2>
            <p>NexaPay is a digital payment platform operated by Glitch Inc, a Tunisian company registered under the auto-entrepreneur regime (startup card). Tax Code (Matricule Fiscal): 1950237P.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">2. Account Registration</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>You must be at least 18 years old to create an account.</li>
              <li>You must provide accurate and complete information during registration, including full name, phone number, and CIN (Carte d'Identité Nationale).</li>
              <li>You are responsible for maintaining the confidentiality of your PIN, OTP codes, and session credentials.</li>
              <li>One account per individual. Duplicate or fraudulent accounts will be terminated.</li>
              <li>NexaPay reserves the right to refuse service to anyone for any lawful reason.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">3. Wallet & Transactions</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>All balances are denominated in Tunisian Dinars (TND) with 3-decimal precision (millimes).</li>
              <li>NexaPay is not a bank. Wallet funds are held in segregated settlement accounts pending disbursement.</li>
              <li>You are responsible for verifying transaction details before confirming any payment.</li>
              <li>Transactions are final and irreversible once confirmed on the blockchain, except where refund rights apply under Tunisian consumer law.</li>
              <li>NexaPay may impose transaction limits, velocity checks, and fraud screening at its discretion.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">4. Fees</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>Transaction fees are calculated using a bracket-based algorithm displayed at checkout.</li>
              <li>Merchant/agent fees are deducted from each payment before settlement.</li>
              <li>NexaPay reserves the right to modify its fee schedule with 30 days notice.</li>
              <li>Bank withdrawal fees, card issuance fees, and premium features may have separate pricing.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">5. Agent & Merchant Services</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>Agent applications require business documentation including tax registration and RNE.</li>
              <li>Agents are responsible for compliance with all applicable Tunisian laws, including anti-money laundering (AML) and counter-terrorism financing (CTF) regulations.</li>
              <li>API keys are issued per agent and must not be shared, resold, or used to build competing services.</li>
              <li>Agents must maintain accurate transaction records for a minimum of 5 years as required by Tunisian tax law.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">6. Prohibited Activities</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>Gambling, betting, and games of chance.</li>
              <li>Sale of illegal goods, controlled substances, or unlicensed pharmaceuticals.</li>
              <li>Adult content, escort services, or sexually explicit material involving payment.</li>
              <li>Fraudulent schemes, pyramid structures, or multi-level marketing without tangible product.</li>
              <li>Cryptocurrency trading, mixing, or unregistered virtual asset services.</li>
              <li>Any activity violating Tunisian law or international sanctions applicable in Tunisia.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">7. Limitation of Liability</h2>
            <p>NexaPay is provided "as is" without warranty. Glitch Inc shall not be liable for indirect, incidental, or consequential damages arising from the use of the service. Our total liability for any claim is limited to the fees paid by you in the 12 months preceding the claim. This limitation does not apply to liability that cannot be excluded under Tunisian law.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">8. Governing Law</h2>
            <p>These Terms are governed by the laws of the Republic of Tunisia. Any disputes shall be submitted to the competent courts of Tunis.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">9. Contact</h2>
            <p>For questions about these Terms, contact us at <a href="mailto:contact@backendglitch.com" className="text-[#00d4aa] hover:underline">contact@backendglitch.com</a>.</p>
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
