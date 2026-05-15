const partners = [
  "BCT",
  "SMT",
  "VISA",
  "Tunisie Télécom",
  "Ooredoo",
];

export function LandingLower() {
  return (
    <section
      id="agents"
      className="border-t border-white/[0.06] pb-28 pt-12 md:pb-36 md:pt-16"
    >
      <div className="mx-auto max-w-[1400px] px-6 lg:px-10">
        <div className="border-b border-white/[0.06] pb-12 md:pb-14">
          <ul className="flex flex-wrap items-center justify-center gap-x-5 gap-y-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/35 sm:justify-between sm:gap-x-8 sm:text-xs">
            {partners.map((name, i) => (
              <li key={name} className="flex items-center gap-x-5 sm:gap-x-8">
                {i > 0 ? (
                  <span className="text-white/18 select-none" aria-hidden>
                    |
                  </span>
                ) : null}
                <span className="whitespace-nowrap">{name}</span>
              </li>
            ))}
          </ul>
        </div>

        <h2 className="font-display text-glitch-display mx-auto mt-16 max-w-[1100px] text-center text-[clamp(2.75rem,10vw,6.5rem)] leading-[0.9] md:mt-24">
          <span className="block text-white">Instant</span>
          <span className="mt-1 block text-[#00ff88]">Account.</span>
          <span className="mt-1 block text-white">Zero fees.</span>
        </h2>
      </div>
    </section>
  );
}
