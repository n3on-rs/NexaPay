"use client";

import * as React from "react";
import { Zap } from "lucide-react";
import NoCodePanel from "./no-code-panel";

export default function PaymentsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Zap className="h-6 w-6 text-[#00d4aa]" />
          Payments
        </h1>
        <p className="mt-1 text-sm text-[#888]">
          Create payment links and QR codes — share them to accept payments instantly
        </p>
      </div>
      <NoCodePanel />
    </div>
  );
}
