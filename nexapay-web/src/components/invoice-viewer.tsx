"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { FileText, Shield } from "lucide-react";

interface Invoice {
  id: string;
  invoice_number: string;
  amount: number;
  currency: string;
  status: string;
  buyer_name: string;
  buyer_address: string;
  blockchain_status: string;
  created_at: string;
}

interface InvoiceViewerProps {
  invoices: Invoice[];
  className?: string;
}

export default function InvoiceViewer({ invoices, className }: InvoiceViewerProps) {
  if (!invoices || invoices.length === 0) {
    return (
      <div className={cn("flex flex-col items-center justify-center py-10 text-[#888]", className)}>
        <FileText className="w-10 h-10 mb-3 opacity-30" />
        <p className="text-sm">No invoices yet</p>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {invoices.map((inv) => (
        <div
          key={inv.id}
          className="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-white/20 transition-colors"
        >
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-[#00d4aa]/10 rounded-lg flex items-center justify-center shrink-0">
              <FileText className="w-5 h-5 text-[#00d4aa]" />
            </div>
            <div>
              <p className="text-sm font-bold text-white">{inv.invoice_number}</p>
              <p className="text-xs text-[#888]">{inv.buyer_name} • {inv.buyer_address.slice(0, 12)}...</p>
              <div className="flex items-center gap-2 mt-1">
                <span className={cn(
                  "text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full",
                  inv.blockchain_status === "confirmed" ? "bg-[#00d4aa]/10 text-[#00d4aa]" : "bg-yellow-500/10 text-yellow-500"
                )}>
                  {inv.blockchain_status}
                </span>
                <span className="text-[10px] text-[#666]">{new Date(inv.created_at).toLocaleDateString()}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <p className="text-sm font-bold text-white whitespace-nowrap">
              {inv.amount.toLocaleString()} {inv.currency}
            </p>
            <a
              href={`/verify/${inv.invoice_number}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-8 h-8 bg-white/5 rounded-lg flex items-center justify-center hover:bg-white/10 transition-colors"
              title="Verify on blockchain"
            >
              <Shield className="w-4 h-4 text-[#888]" />
            </a>
          </div>
        </div>
      ))}
    </div>
  );
}
