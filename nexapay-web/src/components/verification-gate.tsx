"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { getKycStatus } from "@/lib/api";
import { getSessionToken } from "@/lib/auth-utils";
import { Shield, Lock, AlertTriangle, Loader2, ArrowRight } from "lucide-react";

interface VerificationGateProps {
  children: React.ReactNode;
}

export function VerificationGate({ children }: VerificationGateProps) {
  const router = useRouter();
  const { user, isAuthenticated, isLoading } = useAuth();
  const [kycStatus, setKycStatus] = React.useState<string | null>(null);
  const [checking, setChecking] = React.useState(true);
  const [failureReason, setFailureReason] = React.useState("");

  React.useEffect(() => {
    if (isLoading || !isAuthenticated || !user?.address) return;

    const token = getSessionToken();
    if (!token) return;

    getKycStatus(user.address, token)
      .then((res) => {
        if (res.ok) {
          const st = String(res.data.kyc_status || "verified");
          setKycStatus(st);
          if (st === "failed") {
            setFailureReason(String(res.data.failure_reason || ""));
          }
        } else {
          // If endpoint doesn't exist yet or errors, default to verified (backwards compat)
          setKycStatus("verified");
        }
      })
      .catch(() => {
        setKycStatus("verified");
      })
      .finally(() => setChecking(false));
  }, [isLoading, isAuthenticated, user?.address]);

  if (isLoading || checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#080808]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#00FF88] border-t-transparent" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  // Verified, skipped, and unverified users can access the dashboard
  // The dashboard itself shows KYC banner and restricts features
  if (kycStatus === "verified" || kycStatus === "skipped" || kycStatus === "unverified") {
    return <>{children}</>;
  }

  // Pending / failed — show gate with option to go to dashboard
  return (
    <div className="min-h-screen bg-[#080808] text-white font-inter flex flex-col items-center justify-center p-6 selection:bg-[#00FF88] selection:text-black">
      <div className="w-full max-w-md text-center">
        {kycStatus === "pending" && (
          <>
            <div className="mx-auto w-20 h-20 bg-yellow-500/10 rounded-full flex items-center justify-center mb-6 border border-yellow-500/20">
              <Loader2 className="w-8 h-8 text-yellow-500 animate-spin" />
            </div>
            <h2 className="text-2xl font-space-grotesk font-bold mb-2">Verification in Progress</h2>
            <p className="text-[#888] text-sm mb-6 leading-relaxed">
              Your identity verification is being processed. This usually takes a few seconds.
              You&apos;ll be notified when it&apos;s complete.
            </p>
            <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-xl p-4 mb-6">
              <div className="flex items-center gap-2 text-yellow-500 text-xs font-bold">
                <AlertTriangle className="w-4 h-4" />
                Some features are limited while verification is in progress
              </div>
            </div>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => router.push("/dashboard")}
                className="w-full h-12 rounded-full bg-[#00FF88] text-[#080808] font-bold text-sm flex items-center justify-center hover:bg-[#00FF88]/90 transition-all"
              >
                Go to Dashboard →
              </button>
              <button
                onClick={() => router.push("/verify")}
                className="w-full h-12 rounded-full bg-white/5 border border-white/10 text-sm font-bold hover:bg-white/10 transition-all flex items-center justify-center gap-2"
              >
                Check Status <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </>
        )}

        {kycStatus === "failed" && (
          <>
            <div className="mx-auto w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mb-6 border border-red-500/20">
              <AlertTriangle className="w-8 h-8 text-red-500" />
            </div>
            <h2 className="text-2xl font-space-grotesk font-bold mb-2">Verification Failed</h2>
            <p className="text-[#888] text-sm mb-2 leading-relaxed">
              {failureReason || "Your identity verification was unsuccessful."}
            </p>
            <p className="text-[#555] text-xs mb-6">
              Please try again with clear, well-lit photos of your CIN card.
            </p>
            <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-4 mb-6">
              <div className="flex items-center gap-2 text-red-500 text-xs font-bold">
                <Lock className="w-4 h-4" />
                Some features are limited until verification succeeds
              </div>
            </div>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => router.push("/dashboard")}
                className="w-full h-12 rounded-full bg-white/5 border border-white/10 text-sm font-bold hover:bg-white/10 transition-all flex items-center justify-center gap-2"
              >
                Go to Dashboard →
              </button>
              <button
                onClick={() => router.push("/verify")}
                className="w-full h-12 rounded-full bg-[#00FF88] text-[#080808] font-bold text-sm flex items-center justify-center hover:bg-[#00FF88]/90 transition-all shadow-[0_0_20px_rgba(0,255,136,0.2)]"
              >
                Retry Verification →
              </button>
            </div>
          </>
        )}

        {(kycStatus === "unverified" || !kycStatus) && (
          <>
            <div className="mx-auto w-20 h-20 bg-[#00FF88]/10 rounded-full flex items-center justify-center mb-6 border border-[#00FF88]/20">
              <Shield className="w-8 h-8 text-[#00FF88]" />
            </div>
            <h2 className="text-2xl font-space-grotesk font-bold mb-2">Verify Your Identity</h2>
            <p className="text-[#888] text-sm mb-6 leading-relaxed">
              To access your account features — transfers, payments, and more — you need to complete identity verification with your Tunisian CIN card.
            </p>
            <div className="bg-white/5 border border-white/10 rounded-xl p-4 mb-6">
              <div className="flex items-center gap-2 text-[#888] text-xs font-bold">
                <Lock className="w-4 h-4" />
                Account features are locked until verification
              </div>
            </div>
            <button
              onClick={() => router.push("/verify")}
              className="w-full h-14 rounded-full bg-[#00FF88] text-[#080808] font-extrabold text-lg flex items-center justify-center hover:bg-[#00FF88]/90 transition-all shadow-[0_0_20px_rgba(0,255,136,0.2)]"
            >
              Start Verification →
            </button>
          </>
        )}
      </div>
    </div>
  );
}
