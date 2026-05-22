"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import {
  X,
  ArrowDownLeft,
  ArrowUpLeft,
  Copy,
  Check,
  Hash,
  Calendar,
  FileText,
  Building2,
  ArrowRight,
} from "lucide-react";

export interface TransactionDetail {
  id: string;
  type: string;
  direction: "credit" | "debit";
  amount: number;
  amount_display: string;
  from: string;
  to: string;
  from_name: string;
  to_name: string;
  memo: string;
  timestamp: string;
  block: number;
  hash: string;
}

interface TransactionDetailModalProps {
  tx: TransactionDetail | null;
  onClose: () => void;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatDate(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatTime(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

function parseTransactionMemo(memo: string): { label: string; isSystem: boolean; docHash?: string } {
  if (!memo) return { label: "Transfer", isSystem: false };
  try {
    const parsed = JSON.parse(memo);
    const txType = parsed.type || parsed.payload?.type || "";
    const docHash = parsed.doc_hash || parsed.payload?.doc_hash;
    switch (txType) {
      case "EsignAccount":
      case "esign_account":
        return { label: "Contract signed", isSystem: true, docHash };
      case "EsignTransfer":
      case "esign_transfer":
        return { label: "Transfer authorization", isSystem: true, docHash };
      case "InvoiceAnchor":
      case "invoice_anchor":
        return { label: "Invoice anchored", isSystem: true, docHash };
      default:
        return { label: memo, isSystem: false };
    }
  } catch {
    return { label: memo, isSystem: false };
  }
}

export function TransactionDetailModal({ tx, onClose }: TransactionDetailModalProps) {
  const [copiedKey, setCopiedKey] = React.useState("");

  React.useEffect(() => {
    if (tx) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [tx]);

  if (!tx) return null;

  const isCredit = tx.direction === "credit";
  const counterparty = isCredit ? tx.from : tx.to;
  const counterpartyName = isCredit ? tx.from_name : tx.to_name;

  // For bank transfers, parse beneficiary name from memo
  const bankTransferMatch = tx.memo.match(/^Bank transfer to (.+?) \(RIB:/);
  const isBankTransfer = !!bankTransferMatch;
  const beneficiaryName = bankTransferMatch ? bankTransferMatch[1] : null;

  const name = counterparty === "chain" ? "NexaPay" :
               counterparty === "BANK" && beneficiaryName ? beneficiaryName :
               counterpartyName;

  const handleCopy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(""), 2000);
    } catch { /* ignore */ }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 backdrop-blur-sm md:items-center">
      <div className="w-full max-w-sm rounded-t-3xl bg-[#111] p-6 md:rounded-3xl md:border md:border-white/[0.08]">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-full",
                isCredit ? "bg-[#00FF88]/10 text-[#00FF88]" : "bg-red-500/10 text-red-400"
              )}
            >
              {isCredit ? <ArrowDownLeft className="h-5 w-5" /> : <ArrowUpLeft className="h-5 w-5" />}
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">{parseTransactionMemo(tx.memo).isSystem ? parseTransactionMemo(tx.memo).label : (isCredit ? "Money received" : "Money sent")}</h3>
              <p className="text-[13px] text-[#888]">{formatDate(tx.timestamp)}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-full bg-white/[0.05] p-2 text-white/50 hover:text-white transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Amount */}
        <div className="flex flex-col items-center rounded-2xl border border-white/[0.04] bg-[#0a0a0a] py-6">
          <p className={cn("font-space-grotesk text-[32px] font-extrabold", isCredit ? "text-[#00FF88]" : "text-white")}>
            {isCredit ? "+" : "-"}{tx.amount_display}
          </p>
          <div className="mt-2 flex items-center gap-1.5 rounded-full bg-[#00FF88]/10 px-3 py-1">
            <div className="h-1.5 w-1.5 rounded-full bg-[#00FF88]" />
            <span className="text-[12px] font-medium text-[#00FF88]">Confirmed on chain</span>
          </div>
        </div>

        {/* Details */}
        <div className="mt-6 space-y-4">
          {/* From / To */}
          <div className="flex items-start gap-3">
            <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-[#888]" />
            <div className="flex-1">
              <p className="text-[12px] text-[#888]">{isCredit ? "From" : "To"}</p>
              <div className="flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-white/[0.06] text-[10px] font-bold text-white">
                  {getInitials(name)}
                </div>
                <p className="text-[14px] font-medium text-white">{name}</p>
              </div>
            </div>
          </div>

          {/* Time */}
          <div className="flex items-start gap-3">
            <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-[#888]" />
            <div>
              <p className="text-[12px] text-[#888]">Time</p>
              <p className="text-[14px] font-medium text-white">{formatTime(tx.timestamp)}</p>
            </div>
          </div>

          {/* Block */}
          <div className="flex items-start gap-3">
            <Hash className="mt-0.5 h-4 w-4 shrink-0 text-[#888]" />
            <div>
              <p className="text-[12px] text-[#888]">Block</p>
              <p className="text-[14px] font-medium text-white">#{tx.block.toLocaleString()}</p>
            </div>
          </div>

          {/* Memo */}
          {tx.memo && (
            <div className="flex items-start gap-3">
              <FileText className="mt-0.5 h-4 w-4 shrink-0 text-[#888]" />
              <div className="flex-1 min-w-0">
                <p className="text-[12px] text-[#888]">{parseTransactionMemo(tx.memo).isSystem ? "Type" : "Memo"}</p>
                <p className="text-[14px] font-medium text-white">{parseTransactionMemo(tx.memo).label}</p>
                {parseTransactionMemo(tx.memo).docHash && (
                  <div className="mt-1 flex items-center gap-2">
                    <code className="truncate text-[11px] text-[#555]">Doc: {parseTransactionMemo(tx.memo).docHash!.slice(0, 16)}...</code>
                    <button
                      onClick={() => handleCopy(parseTransactionMemo(tx.memo).docHash!, "docHash")}
                      className="text-[#888] hover:text-[#00FF88] transition-colors shrink-0"
                    >
                      {copiedKey === "docHash" ? <Check className="h-3 w-3 text-[#00FF88]" /> : <Copy className="h-3 w-3" />}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Tx Hash */}
          <div className="flex items-start gap-3">
            <Hash className="mt-0.5 h-4 w-4 shrink-0 text-[#888]" />
            <div className="flex-1 min-w-0">
              <p className="text-[12px] text-[#888]">Transaction hash</p>
              <div className="flex items-center gap-2">
                <code className="truncate text-[13px] text-[#888]">{tx.hash.slice(0, 14)}...{tx.hash.slice(-8)}</code>
                <button
                  onClick={() => handleCopy(tx.hash, "hash")}
                  className="text-[#888] hover:text-[#00FF88] transition-colors shrink-0"
                >
                  {copiedKey === "hash" ? <Check className="h-3.5 w-3.5 text-[#00FF88]" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>
          </div>

          {/* Tx ID */}
          <div className="flex items-start gap-3">
            <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-[#888]" />
            <div className="flex-1 min-w-0">
              <p className="text-[12px] text-[#888]">Transaction ID</p>
              <div className="flex items-center gap-2">
                <code className="truncate text-[13px] text-[#888]">{tx.id}</code>
                <button
                  onClick={() => handleCopy(tx.id, "id")}
                  className="text-[#888] hover:text-[#00FF88] transition-colors shrink-0"
                >
                  {copiedKey === "id" ? <Check className="h-3.5 w-3.5 text-[#00FF88]" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Close button */}
        <button
          onClick={onClose}
          className="mt-8 flex h-14 w-full items-center justify-center rounded-full bg-white/[0.06] text-white font-semibold transition-all hover:bg-white/[0.10]"
        >
          Close
        </button>
      </div>
    </div>
  );
}
