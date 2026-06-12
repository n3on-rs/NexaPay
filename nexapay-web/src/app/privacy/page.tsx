export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#0b0b0b] text-white">
      <div className="mx-auto max-w-[800px] px-6 py-16">
        <h1 className="text-3xl font-bold tracking-tight mb-2">Privacy Policy</h1>
        <p className="text-sm text-white/40 mb-12">Last updated: June 2026</p>

        <div className="space-y-10 text-sm leading-relaxed text-white/60">
          <section>
            <h2 className="text-lg font-semibold text-white mb-3">1. Data Controller</h2>
            <p>NexaPay is operated by Glitch Inc, a Tunisian company. We are the data controller for personal data collected through the NexaPay platform. Our processing activities comply with Tunisian Organic Law No. 2004-63 on the Protection of Personal Data and are subject to the Instance Nationale de Protection des Données Personnelles (INPDP).</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">2. Data We Collect</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li><strong>Identity data:</strong> Full name, CIN number, date of birth, signature image.</li>
              <li><strong>Contact data:</strong> Phone number, email address, physical address.</li>
              <li><strong>Financial data:</strong> Transaction history, wallet balance, card details (last 4 digits only), bank account details (RIB, IBAN).</li>
              <li><strong>KYC data:</strong> Identity document images, verification status, KYC session records.</li>
              <li><strong>Technical data:</strong> IP address, device information, browser type, login timestamps.</li>
              <li><strong>Agent data:</strong> Business name, tax registration number, RNE, business documents.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">3. How We Use Your Data</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>To provide, maintain, and improve the NexaPay service.</li>
              <li>To process transactions and maintain blockchain records.</li>
              <li>To verify identity and comply with KYC/AML obligations.</li>
              <li>To prevent fraud, money laundering, and unauthorized access.</li>
              <li>To communicate with you about your account, transactions, and service updates.</li>
              <li>To comply with legal obligations under Tunisian law.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">4. Data Retention</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>Account data: Retained while account is active, plus 5 years after closure (tax law requirement).</li>
              <li>Transaction data: Retained permanently on the blockchain. Personal metadata retained 10 years.</li>
              <li>KYC documents: Retained 5 years after account closure per AML regulations.</li>
              <li>Session and login data: Retained 90 days for security auditing.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">5. Data Sharing</h2>
            <p>We do not sell your personal data. We may share data with:</p>
            <ul className="list-disc pl-5 space-y-2 mt-2">
              <li><strong>Service providers:</strong> Infrastructure (Hugging Face, Vercel), database hosting (Neon), SMS/email gateways.</li>
              <li><strong>Financial partners:</strong> Banks and payment networks as required to process transactions.</li>
              <li><strong>Legal authorities:</strong> Tunisian regulatory bodies (BCT, INPDP), law enforcement when legally required.</li>
              <li><strong>Merchants/Agents:</strong> Transaction details relevant to payments you make to them.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">6. Data Security</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>All data is encrypted in transit (TLS 1.3) and at rest (AES-256-GCM).</li>
              <li>PINs are hashed with Argon2id and never stored in plain text.</li>
              <li>API authentication uses HMAC-SHA256 JWT with short-lived tokens.</li>
              <li>Webhook payloads are signed with HMAC-SHA256 for integrity verification.</li>
              <li>Access to personal data is logged and audited.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">7. Your Rights</h2>
            <p>Under Tunisian data protection law, you have the right to:</p>
            <ul className="list-disc pl-5 space-y-2 mt-2">
              <li><strong>Access:</strong> Request a copy of your personal data.</li>
              <li><strong>Rectification:</strong> Correct inaccurate or incomplete data.</li>
              <li><strong>Erasure:</strong> Request deletion of your data (subject to legal retention obligations).</li>
              <li><strong>Object:</strong> Object to processing in certain circumstances.</li>
              <li><strong>Portability:</strong> Receive your data in a structured format.</li>
            </ul>
            <p className="mt-2">To exercise these rights, email <a href="mailto:contact@backendglitch.com" className="text-[#00d4aa] hover:underline">contact@backendglitch.com</a> with your account phone number and CIN.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">8. Cookies</h2>
            <p>NexaPay uses essential cookies only:</p>
            <ul className="list-disc pl-5 space-y-2 mt-2">
              <li><strong>nexapay_session:</strong> HTTP-only secure cookie for session authentication. Required for the service to function.</li>
              <li><strong>Domain cookies:</strong> Set on .nexapay.space for cross-subdomain auth (sandbox, auth, backend).</li>
            </ul>
            <p className="mt-2">We do not use tracking cookies, analytics cookies, or third-party advertising cookies.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">9. International Data Transfers</h2>
            <p>Your data may be processed on servers located outside Tunisia (EU, US) through our infrastructure providers (Neon, Hugging Face, Vercel). These providers maintain adequate data protection standards. By using NexaPay, you consent to such transfers as necessary to provide the service.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">10. Contact</h2>
            <p>Data protection inquiries: <a href="mailto:contact@backendglitch.com" className="text-[#00d4aa] hover:underline">contact@backendglitch.com</a></p>
            <p className="mt-1">You may also lodge a complaint with the <a href="https://www.inpdp.nat.tn" target="_blank" rel="noopener noreferrer" className="text-[#00d4aa] hover:underline">INPDP</a>.</p>
          </section>
        </div>

        <div className="mt-16 pt-8 border-t border-white/[0.06]">
          <p className="text-xs text-white/20">
            Glitch Inc — Auto-entrepreneur — Tax Code: 1950237P — Compliant with Tunisian Organic Law No. 2004-63
          </p>
        </div>
      </div>
    </div>
  );
}
