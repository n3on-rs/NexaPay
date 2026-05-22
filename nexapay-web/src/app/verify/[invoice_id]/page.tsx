"use client";

import * as React from "react";
import { useParams, useSearchParams } from "next/navigation";
import { verifyInvoice } from "@/lib/api";
import { Shield, ShieldCheck, ShieldAlert, Search, Loader2 } from "lucide-react";

interface VerifyData {
  valid?: boolean;
  status?: string;
  invoice_number?: string;
  amount?: number | string;
  currency?: string;
  block_number?: number | string;
  anchored_at?: string;
  [key: string]: string | number | boolean | undefined;
}

export default function VerifyInvoicePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const invoiceId = String(params.invoice_id || "");
  const docHash = searchParams.get("doc_hash") || undefined;

  const [result, setResult] = React.useState<{
    status: "loading" | "verified" | "not_found" | "not_anchored" | "tampered" | "error";
    data?: VerifyData;
  }>({ status: "loading" });

  React.useEffect(() => {
    if (!invoiceId) {
      setResult({ status: "error" });
      return;
    }
    verifyInvoice(invoiceId, docHash).then((res) => {
      if (!res.ok) {
        setResult({ status: "error" });
        return;
      }
      const data = res.data as VerifyData;
      const valid = Boolean(data.valid);
      const status = String(data.status || "");
      if (status === "not_found") {
        setResult({ status: "not_found", data });
      } else if (status === "not_anchored") {
        setResult({ status: "not_anchored", data });
      } else if (!valid) {
        setResult({ status: "tampered", data });
      } else {
        setResult({ status: "verified", data });
      }
    }).catch(() => setResult({ status: "error" }));
  }, [invoiceId, docHash]);

  return (
    <div className="min-h-screen bg-[#080808] text-white flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="mx-auto w-16 h-16 bg-[#00FF88]/10 rounded-full flex items-center justify-center mb-4 border border-[#00FF88]/20">
            <Shield className="w-8 h-8 text-[#00FF88]" />
          </div>
          <h1 className="text-2xl font-space-grotesk font-bold">Invoice Verification</h1>
          <p className="text-[#888] text-sm mt-1">Verify authenticity on the NexaPay blockchain</p>
        </div>

        {result.status === "loading" && (
          <div className="flex flex-col items-center gap-3 py-10">
            <Loader2 className="animate-spin w-8 h-8 text-[#00FF88]" />
            <p className="text-[#888] text-sm">Verifying on-chain...</p>
          </div>
        )}

        {result.status === "verified" && (
          <div className="bg-[#00FF88]/5 border border-[#00FF88]/20 rounded-2xl p-6 text-center">
            <ShieldCheck className="w-12 h-12 text-[#00FF88] mx-auto mb-3" />
            <p className="text-lg font-bold text-[#00FF88] mb-1">Valid ✓</p>
            <p className="text-sm text-[#888] mb-4">This invoice is immutably recorded on the NexaPay blockchain.</p>
            {result.data?.invoice_number && (
              <div className="bg-white/5 rounded-xl p-4 text-left space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-[#888]">Invoice</span>
                  <span className="font-mono font-bold">{String(result.data.invoice_number || "")}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[#888]">Amount</span>
                  <span className="font-bold">{String(result.data.amount ?? "-")} {String(result.data.currency ?? "TND")}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[#888]">Block</span>
                  <span className="font-mono">{String(result.data.block_number ?? "-")}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[#888]">Anchored</span>
                  <span className="font-mono text-xs">{String(result.data.anchored_at ?? "-").slice(0, 16)}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {result.status === "tampered" && (
          <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-6 text-center">
            <ShieldAlert className="w-12 h-12 text-red-500 mx-auto mb-3" />
            <p className="text-lg font-bold text-red-500 mb-1">Tampered ✗</p>
            <p className="text-sm text-[#888]">Document hash mismatch. This invoice may have been altered.</p>
          </div>
        )}

        {result.status === "not_anchored" && (
          <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-2xl p-6 text-center">
            <ShieldAlert className="w-12 h-12 text-yellow-500 mx-auto mb-3" />
            <p className="text-lg font-bold text-yellow-500 mb-1">Not Anchored</p>
            <p className="text-sm text-[#888]">Invoice found but not yet recorded on the blockchain.</p>
          </div>
        )}

        {result.status === "not_found" && (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 text-center">
            <Search className="w-12 h-12 text-[#888] mx-auto mb-3" />
            <p className="text-lg font-bold text-[#888] mb-1">Not Found</p>
            <p className="text-sm text-[#888]">No invoice or anchor record matches this ID.</p>
          </div>
        )}

        {result.status === "error" && (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 text-center">
            <ShieldAlert className="w-12 h-12 text-[#888] mx-auto mb-3" />
            <p className="text-lg font-bold text-[#888] mb-1">Verification Error</p>
            <p className="text-sm text-[#888]">Could not verify. Please check the invoice ID and try again.</p>
          </div>
        )}

        <div className="text-center mt-8">
          <a href="/" className="text-sm text-[#00FF88] hover:underline font-bold">← Back to NexaPay</a>
        </div>
      </div>
    </div>
  );
}
