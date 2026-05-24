export function LandingPricing() {
  const brackets = [
    { range: "0 – 10 TND", fee: "0.500 TND", desc: "Flat", example: "Coffee split" },
    { range: "10 – 50 TND", fee: "1.000 TND", desc: "Flat", example: "Lunch, bills" },
    { range: "50 – 200 TND", fee: "2.5% + 0.300 TND", desc: "% + Fixed", example: "Groceries, shopping" },
    { range: "200 – 1,000 TND", fee: "2.0% + 0.500 TND", desc: "% + Fixed", example: "Rent, electronics" },
    { range: "1,000 – 5,000 TND", fee: "1.5% + 1.000 TND", desc: "% + Fixed", example: "Wholesale, B2B" },
    { range: "5,000+ TND", fee: "1.0% + 5.000 TND", desc: "% + Fixed", example: "Vehicles, property" },
  ];

  return (
    <section className="border-t border-white/[0.06] py-24 md:py-32">
      <div className="mx-auto max-w-[1200px] px-6 lg:px-8">
        <div className="flex flex-col items-center text-center mb-16">
          <h2 className="max-w-[800px] text-[clamp(2rem,6vw,3.5rem)] font-semibold leading-[1.1] tracking-tight">
            Simple, transparent
            <br />
            <span className="text-[#00d4aa]">bracket-based pricing</span>
          </h2>
          <p className="mt-4 max-w-[480px] text-[15px] leading-relaxed text-white/40">
            One low fee per transaction. No hidden costs. No monthly fees. You only pay when you get paid.
          </p>
        </div>

        {/* Desktop table */}
        <div className="hidden md:block overflow-hidden rounded-2xl border border-white/[0.06]">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-white/[0.06] bg-white/[0.02]">
                <th className="px-6 py-4 text-xs font-medium uppercase tracking-wider text-[#666]">Amount range</th>
                <th className="px-6 py-4 text-xs font-medium uppercase tracking-wider text-[#666]">NexaPay fee</th>
                <th className="px-6 py-4 text-xs font-medium uppercase tracking-wider text-[#666]">Type</th>
                <th className="px-6 py-4 text-xs font-medium uppercase tracking-wider text-[#888] hidden lg:table-cell">Example</th>
              </tr>
            </thead>
            <tbody>
              {brackets.map((b, i) => (
                <tr
                  key={b.range}
                  className={i < brackets.length - 1 ? "border-b border-white/[0.04]" : ""}
                >
                  <td className="px-6 py-4 text-sm text-white font-medium">{b.range}</td>
                  <td className="px-6 py-4 text-sm text-[#00d4aa] font-semibold font-mono">{b.fee}</td>
                  <td className="px-6 py-4">
                    <span className="inline-flex rounded-full border border-white/[0.08] px-2.5 py-0.5 text-[11px] text-[#888]">
                      {b.desc}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-[13px] text-[#666] hidden lg:table-cell">{b.example}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="md:hidden space-y-3">
          {brackets.map((b) => (
            <div
              key={b.range}
              className="rounded-xl border border-white/[0.06] bg-[#0b0b0b] p-4 flex items-center justify-between"
            >
              <div>
                <p className="text-sm text-white font-medium">{b.range}</p>
                <p className="text-[11px] text-[#555] mt-0.5">{b.example}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-[#00d4aa] font-semibold font-mono">{b.fee}</p>
                <p className="text-[11px] text-[#555]">{b.desc}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-12 text-center">
          <p className="text-[13px] text-[#555]">
            Fees apply to all transactions: P2P transfers, checkout payments, bank withdrawals, and card funding.
            <br />
            Your customer always sees the total upfront — no surprises at checkout.
          </p>
        </div>
      </div>
    </section>
  );
}
