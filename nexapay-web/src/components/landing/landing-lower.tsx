import Link from "next/link";
import { ArrowRight } from "lucide-react";

export function LandingLower() {
  return (
    <section className="border-t border-white/[0.06] py-24 md:py-32">
      <div className="mx-auto max-w-[1200px] px-6 lg:px-8">
        <div className="flex flex-col items-center text-center">
          <h2 className="max-w-[800px] text-[clamp(2.5rem,7vw,4.5rem)] font-semibold leading-[1.05] tracking-tight">
            Open your account.
            <br />
            <span className="text-[#00d4aa]">It takes 2 minutes.</span>
          </h2>
          <p className="mt-6 max-w-[420px] text-[15px] leading-relaxed text-white/40">
            No branches. No paperwork. Just your phone.
          </p>
          <Link
            href="/register"
            className="mt-8 inline-flex items-center gap-2 rounded-full bg-[#00d4aa] px-8 py-3.5 text-[15px] font-semibold text-black transition-all hover:bg-[#00d4aa]/90 hover:gap-3"
          >
            Get started free <ArrowRight className="h-4 w-4" />
          </Link>

          <div className="mt-20 w-full border-t border-white/[0.06] pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-[12px] text-white/25">
            <p>NexaPay — Licensed financial institution, Tunisia</p>
            <div className="flex gap-6">
              <Link href="/login" className="hover:text-white/50 transition-colors">Log in</Link>
              <Link href="/register" className="hover:text-white/50 transition-colors">Sign up</Link>
              <span>contact@nexapay.space</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
