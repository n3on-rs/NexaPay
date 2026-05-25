"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Shield, LogOut, Users, LayoutDashboard, Receipt,
  ScrollText, Server, FileText
} from "lucide-react";

const NAV = [
  { label: "Dashboard", href: "/admin/dashboard", icon: LayoutDashboard },
  { label: "Users", href: "/admin/users", icon: Users },
  { label: "Transactions", href: "/admin/transactions", icon: Receipt },
  { label: "Nodes", href: "/admin/nodes", icon: Server },
  { label: "Logs", href: "/admin/logs", icon: FileText },
  { label: "Audit Log", href: "/admin/audit", icon: ScrollText },
];

export function AdminShell({ children, current }: { children: React.ReactNode; current: string }) {
  const router = useRouter();
  const logout = () => {
    localStorage.removeItem("admin_token");
    localStorage.removeItem("admin_username");
    localStorage.removeItem("admin_role");
    router.push("/admin/login");
  };

  return (
    <div className="min-h-screen bg-[#0b0b0b] text-white">
      {/* Top bar */}
      <div className="border-b border-white/[0.06] bg-[#0b0b0b]/80 px-4 lg:px-6 py-3 lg:py-4 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield className="h-5 w-5 text-[#00d4aa]" />
            <h1 className="text-lg font-bold hidden sm:block">NexaPay Admin</h1>
          </div>
          <button
            onClick={logout}
            className="rounded-lg p-2 text-[#666] transition-colors hover:bg-white/[0.04] hover:text-red-400"
            title="Logout"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Nav bar */}
      <div className="border-b border-white/[0.04] bg-[#0b0b0b]/50 px-4 lg:px-6 overflow-x-auto">
        <div className="mx-auto flex max-w-7xl gap-1 py-2">
          {NAV.map((n) => (
            <button
              key={n.href}
              onClick={() => router.push(n.href)}
              className={`flex items-center gap-1.5 lg:gap-2 rounded-lg px-3 lg:px-4 py-2 text-xs lg:text-sm font-medium transition-colors whitespace-nowrap ${
                current === n.label
                  ? "bg-white/[0.06] text-white"
                  : "text-[#666] hover:text-white"
              }`}
            >
              <n.icon className="h-3.5 w-3.5 lg:h-4 lg:w-4" />
              {n.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-7xl px-4 lg:px-6 py-6 lg:py-8">{children}</div>
    </div>
  );
}
