"use client";

import * as React from "react";
import { Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import NoCodePanel from "./no-code-panel";
import ApiPanel from "./api-panel";

export default function PaymentsPage() {
  const [activeTab, setActiveTab] = React.useState<"nocode" | "api">("nocode");

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Zap className="h-6 w-6 text-[#00d4aa]" />
            Payments
          </h1>
          <p className="mt-1 text-sm text-[#888]">
            Accept payments without code or integrate with our API
          </p>
        </div>
        <div className="flex rounded-xl bg-[#111] p-1 border border-white/[0.06]">
          <button
            onClick={() => setActiveTab("nocode")}
            className={cn(
              "rounded-lg px-5 py-2 text-sm font-medium transition-all",
              activeTab === "nocode"
                ? "bg-[#00d4aa] text-black shadow-lg shadow-[#00d4aa]/20"
                : "text-[#888] hover:text-white"
            )}
          >
            No-Code
          </button>
          <button
            onClick={() => setActiveTab("api")}
            className={cn(
              "rounded-lg px-5 py-2 text-sm font-medium transition-all",
              activeTab === "api"
                ? "bg-[#00d4aa] text-black shadow-lg shadow-[#00d4aa]/20"
                : "text-[#888] hover:text-white"
            )}
          >
            API Integration
          </button>
        </div>
      </div>

      {activeTab === "nocode" ? <NoCodePanel /> : <ApiPanel />}
    </div>
  );
}
