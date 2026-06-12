export default function APITermsPage() {
  return (
    <div className="min-h-screen bg-[#0b0b0b] text-white">
      <div className="mx-auto max-w-[800px] px-6 py-16">
        <h1 className="text-3xl font-bold tracking-tight mb-2">API Terms of Use</h1>
        <p className="text-sm text-white/40 mb-12">Last updated: June 2026</p>

        <div className="space-y-10 text-sm leading-relaxed text-white/60">
          <section>
            <h2 className="text-lg font-semibold text-white mb-3">1. Acceptance</h2>
            <p>By using the NexaPay API, you agree to these API Terms of Use, the NexaPay Terms of Service, and the Privacy Policy. If you are integrating on behalf of a business, you represent that you have authority to bind that business to these terms.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">2. API Keys</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>API keys are issued to approved agents and merchants only.</li>
              <li>Keys must be kept confidential. Do not expose them in client-side code, public repositories, or share them with third parties.</li>
              <li>You may generate multiple keys for different environments (development, production).</li>
              <li>NexaPay may revoke keys at any time for violation of these terms or suspicious activity.</li>
              <li>Report compromised keys immediately to <a href="mailto:contact@backendglitch.com" className="text-[#00d4aa] hover:underline">contact@backendglitch.com</a>.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">3. Rate Limits</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>Production: 100 requests per minute per API key.</li>
              <li>Sandbox: 30 requests per minute per API key.</li>
              <li>Rate limit headers are included in all API responses (X-RateLimit-*).</li>
              <li>Exceeding limits returns HTTP 429. Implement exponential backoff.</li>
              <li>Contact us if you need higher limits for legitimate use cases.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">4. Acceptable Use</h2>
            <p>You may NOT use the NexaPay API to:</p>
            <ul className="list-disc pl-5 space-y-2 mt-2">
              <li>Process payments for prohibited activities (see Terms of Service, Section 6).</li>
              <li>Build a competing payment service or white-label NexaPay.</li>
              <li>Scrape, extract, or resell NexaPay data, transaction records, or user information.</li>
              <li>Conduct load testing, penetration testing, or security scanning without prior authorization.</li>
              <li>Bypass KYC requirements, transaction limits, or fraud detection systems.</li>
              <li>Submit fraudulent, stolen, or synthetic identity documents.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">5. Webhooks</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>Your webhook endpoint must respond with HTTP 2xx within 10 seconds.</li>
              <li>Failed deliveries are retried up to 3 times with exponential backoff.</li>
              <li>Verify webhook signatures using the X-NexaPay-Signature header (HMAC-SHA256).</li>
              <li>We recommend idempotency handling — the same event may be delivered more than once.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">6. Sandbox vs Production</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>Sandbox environment: test API keys, test cards, no real money movement. Suitable for development.</li>
              <li>Production environment: live API keys, real transactions, real money. Requires approved agent status and production API key.</li>
              <li>Test cards only work in sandbox. Do not use real card numbers in sandbox.</li>
              <li>Agent must pass KYC verification and scoring before production access is granted.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">7. Service Level</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>NexaPay aims for 99.5% API uptime. No SLA is guaranteed on the free/sandbox tier.</li>
              <li>Scheduled maintenance is announced 48 hours in advance via email and the agent dashboard.</li>
              <li>Emergency maintenance may occur without notice for security incidents.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">8. Termination</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>You may stop using the API at any time.</li>
              <li>NexaPay may suspend or terminate API access for violation of these terms, with 7 days notice where reasonably possible.</li>
              <li>Upon termination, your API keys are revoked immediately. Pending transactions are settled according to normal processing.</li>
              <li>Data retention obligations survive termination (see Privacy Policy, Section 4).</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">9. Disclaimer</h2>
            <p>The API is provided "as is" without warranty. Glitch Inc is not liable for any damages resulting from API unavailability, data loss, or integration errors. You are responsible for testing your integration thoroughly in sandbox before going live.</p>
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
