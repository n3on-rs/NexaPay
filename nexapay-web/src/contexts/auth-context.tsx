"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { getJson } from "@/lib/api";
import {
  getSessionToken,
  getSessionAddress,
  getSessionFullName,
  getSessionPhone,
  clearSession,
  persistSession,
} from "@/lib/auth-utils";

export interface AuthUser {
  fullName: string;
  phone: string;
  email: string;
  address: string;
  chainAddress: string;
  cin: string;
  addressLine: string | null;
  delegation: string | null;
  governorate: string | null;
  avatarUrl: string | null;
  forcePinChange: boolean;
  kycStatus: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  logout: () => void;
  setAuth: (token: string, address: string, fullName?: string, phone?: string) => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = React.createContext<AuthContextValue>({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  logout: () => {},
  setAuth: () => {},
  refreshUser: async () => {},
});

export function useAuth() {
  return React.useContext(AuthContext);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = React.useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  const fetchUser = React.useCallback(async (token: string) => {
    const res = await getJson("/auth/me", { "X-Account-Token": token });
    if (res.ok && res.data.full_name) {
      const forcePinChange = Boolean(res.data.force_pin_change);
      setUser({
        fullName: String(res.data.full_name),
        phone: String(res.data.phone || ""),
        email: String(res.data.email || ""),
        address: String(res.data.address || ""),
        chainAddress: String(res.data.chain_address || ""),
        cin: String(res.data.cin || ""),
        addressLine: res.data.address_line ? String(res.data.address_line) : null,
        delegation: res.data.delegation ? String(res.data.delegation) : null,
        governorate: res.data.governorate ? String(res.data.governorate) : null,
        avatarUrl: res.data.avatar_url ? String(res.data.avatar_url) : null,
        forcePinChange,
        kycStatus: String(res.data.kyc_status || "verified"),
      });
      if (forcePinChange && typeof window !== "undefined" && window.location.pathname !== "/change-pin") {
        router.push("/change-pin");
      }
      return true;
    }
    return false;
  }, []);

  const validateSession = React.useCallback(async () => {
    const token = getSessionToken();
    const address = getSessionAddress();
    if (!token || !address) {
      setUser(null);
      setIsLoading(false);
      return;
    }

    const ok = await fetchUser(token);
    if (!ok) {
      clearSession();
      setUser(null);
    }
    setIsLoading(false);
  }, [fetchUser]);

  const logout = React.useCallback(() => {
    clearSession();
    setUser(null);
    router.push("/");
  }, [router]);

  const setAuth = React.useCallback(
    (token: string, address: string, fullName?: string, phone?: string) => {
      persistSession(token, address, fullName, phone);
      const fn = fullName || getSessionFullName();
      const ph = phone || getSessionPhone();
      setUser({
        fullName: fn,
        phone: ph,
        email: "",
        address,
        chainAddress: address,
        cin: "",
        addressLine: null,
        delegation: null,
        governorate: null,
        avatarUrl: null,
        forcePinChange: false,
        kycStatus: "unverified",
      });
      // Immediately fetch fresh user data
      fetchUser(token);
    },
    [fetchUser]
  );

  const refreshUser = React.useCallback(async () => {
    const token = getSessionToken();
    if (!token) {
      setUser(null);
      return;
    }
    const ok = await fetchUser(token);
    if (!ok) {
      clearSession();
      setUser(null);
    }
  }, [fetchUser]);

  // Initial validation on mount
  React.useEffect(() => {
    validateSession();
  }, [validateSession]);

  // Re-validate on window focus
  React.useEffect(() => {
    const onFocus = () => {
      const token = getSessionToken();
      if (token) fetchUser(token);
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [fetchUser]);

  // Periodic session check every 5 minutes
  React.useEffect(() => {
    const id = window.setInterval(() => {
      const token = getSessionToken();
      if (token) fetchUser(token);
    }, 5 * 60 * 1000);
    return () => window.clearInterval(id);
  }, [fetchUser]);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        logout,
        setAuth,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
