"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { changePin } from "@/lib/api";
import { getSessionToken } from "@/lib/auth-utils";
import { Shield, ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function ChangePinPage() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [currentPin, setCurrentPin] = React.useState("");
  const [newPin, setNewPin] = React.useState("");
  const [confirmPin, setConfirmPin] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (newPin !== confirmPin) {
      setError("PINs do not match");
      return;
    }
    if (newPin.length !== 6 || !newPin.split("").every((c) => /\d/.test(c))) {
      setError("PIN must be exactly 6 digits");
      return;
    }
    const token = getSessionToken();
    if (!token) {
      setError("Session expired");
      return;
    }
    setLoading(true);
    try {
      const res = await changePin(token, currentPin, newPin, confirmPin);
      if (res.ok) {
        setSuccess(true);
        setTimeout(() => router.push("/dashboard"), 2000);
      } else {
        setError(String((res.data as any).error || "Failed to change PIN"));
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0b0b0b] px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-3">
          <Link href="/dashboard" className="text-[#888] hover:text-white transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-xl font-bold text-white">Change PIN</h1>
        </div>

        {user?.forcePinChange && (
          <div className="mb-6 rounded-xl border border-[#FF4444]/20 bg-[#FF4444]/10 p-4">
            <div className="flex items-start gap-3">
              <Shield className="mt-0.5 h-5 w-5 shrink-0 text-[#FF4444]" />
              <div>
                <p className="text-sm font-semibold text-[#FF4444]">Security Alert</p>
                <p className="text-[13px] text-[#FF4444]/80">
                  Someone may have accessed your account. Please change your PIN now to secure your account.
                </p>
              </div>
            </div>
          </div>
        )}

        {success ? (
          <div className="rounded-2xl border border-[#00d4aa]/20 bg-[#00d4aa]/10 p-6 text-center">
            <Shield className="mx-auto h-10 w-10 text-[#00d4aa]" />
            <p className="mt-3 text-lg font-bold text-[#00d4aa]">PIN Changed</p>
            <p className="mt-1 text-sm text-[#888]">Redirecting to dashboard...</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[#888]">Current PIN</label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={currentPin}
                onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, ""))}
                className="h-14 w-full rounded-2xl border border-white/[0.06] bg-[#111] px-4 text-center text-lg font-bold tracking-[0.5em] text-white placeholder:text-[#333] focus:border-[#00d4aa]/50 focus:outline-none"
                placeholder="••••••"
                required
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[#888]">New PIN</label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={newPin}
                onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))}
                className="h-14 w-full rounded-2xl border border-white/[0.06] bg-[#111] px-4 text-center text-lg font-bold tracking-[0.5em] text-white placeholder:text-[#333] focus:border-[#00d4aa]/50 focus:outline-none"
                placeholder="••••••"
                required
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[#888]">Confirm New PIN</label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={confirmPin}
                onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ""))}
                className="h-14 w-full rounded-2xl border border-white/[0.06] bg-[#111] px-4 text-center text-lg font-bold tracking-[0.5em] text-white placeholder:text-[#333] focus:border-[#00d4aa]/50 focus:outline-none"
                placeholder="••••••"
                required
              />
            </div>

            {error && (
              <p className="text-center text-sm text-[#FF4444]">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="flex h-14 w-full items-center justify-center rounded-full bg-[#00d4aa] font-bold text-[#0b0b0b] transition-all hover:opacity-90 disabled:opacity-50"
            >
              {loading ? "Changing..." : "Change PIN"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
