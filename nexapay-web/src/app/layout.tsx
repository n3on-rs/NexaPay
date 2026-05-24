import type { Metadata } from "next";
import { Bebas_Neue, Geist_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { SandboxBanner, SandboxBannerSpacer } from "@/components/sandbox-banner";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const bebasNeue = Bebas_Neue({
  variable: "--font-bebas",
  subsets: ["latin"],
  weight: "400",
});

export const metadata: Metadata = {
  title: "NexaPay — Digital Banking for Tunisia",
  description:
    "Open a full bank account in minutes. No branches. No paperwork. Built by Glitch Inc.",
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "NexaPay — Digital Banking for Tunisia",
    description: "Open a full bank account in minutes. No branches. No paperwork.",
    images: ["/logo.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`dark ${geistMono.variable} ${spaceGrotesk.variable} ${bebasNeue.variable} h-full scroll-smooth antialiased`}
      data-scroll-behavior="smooth"
    >
      <body className="min-h-full bg-[#0b0b0b] font-sans text-white">
        <SandboxBanner />
        <SandboxBannerSpacer />
        {children}
      </body>
    </html>
  );
}
