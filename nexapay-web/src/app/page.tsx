import { LandingHero } from "@/components/landing/landing-hero";
import { LandingLower } from "@/components/landing/landing-lower";
import { LandingNav } from "@/components/landing/landing-nav";

export default function Home() {
  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <LandingNav />
      <main>
        <LandingHero />
        <LandingLower />
      </main>
    </div>
  );
}
