import { LandingHero } from "@/components/landing/landing-hero";
import { LandingLower } from "@/components/landing/landing-lower";
import { LandingNav } from "@/components/landing/landing-nav";
import { LandingPricing } from "@/components/landing/landing-pricing";
import { HowItWorks } from "@/components/landing/how-it-works";
import { UserFlow } from "@/components/landing/user-flow";
import { AgentFlow } from "@/components/landing/agent-flow";

export default function Home() {
  return (
    <div className="min-h-screen bg-[#0b0b0b]">
      <LandingNav />
      <main>
        <LandingHero />
        <HowItWorks />
        <LandingPricing />
        <UserFlow />
        <AgentFlow />
        <LandingLower />
      </main>
    </div>
  );
}
