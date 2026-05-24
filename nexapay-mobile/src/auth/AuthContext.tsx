import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import * as SecureStore from "expo-secure-store";
import * as LocalAuthentication from "expo-local-authentication";
import { api } from "../api/client";
import type { User } from "../types";

interface AuthState {
  user: User | null;
  token: string | null;
  address: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isBiometricAvailable: boolean;
  login: (phone: string, pin: string) => Promise<{ step: string; devOtp?: string; phoneHint?: string; error?: string }>;
  verifyOtp: (phone: string, otp: string) => Promise<boolean>;
  setAuth: (token: string, address: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  authenticateWithBiometrics: () => Promise<boolean>;
}

const AuthContext = createContext<AuthState>({} as AuthState);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isBiometricAvailable, setIsBiometricAvailable] = useState(false);

  useEffect(() => { checkBiometrics(); restoreSession(); }, []);

  const checkBiometrics = async () => {
    const compatible = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    setIsBiometricAvailable(compatible && enrolled);
  };

  const restoreSession = async () => {
    try {
      const storedToken = await SecureStore.getItemAsync("nexapay_token");
      const storedAddress = await SecureStore.getItemAsync("nexapay_address");
      if (storedToken && storedAddress) {
        setToken(storedToken);
        setAddress(storedAddress);
        await fetchUser(storedToken, storedAddress);
      }
    } catch {} finally { setIsLoading(false); }
  };

  const fetchUser = async (tok: string, addr: string) => {
    const res = await api.get<any>("/auth/me", { "X-Account-Token": tok });
    if (res.ok && res.data.full_name) {
      setUser({
        fullName: String(res.data.full_name),
        phone: String(res.data.phone || ""),
        email: String(res.data.email || ""),
        address: addr,
        chainAddress: String(res.data.chain_address || addr),
        cin: String(res.data.cin || ""),
        addressLine: res.data.address_line ?? null,
        delegation: res.data.delegation ?? null,
        governorate: res.data.governorate ?? null,
        avatarUrl: res.data.avatar_url ?? null,
        forcePinChange: Boolean(res.data.force_pin_change),
        isAgent: res.data.account_type === "Agent",
      });
    }
  };

  const login = async (phone: string, pin: string) => {
    const res = await api.post<any>("/auth/login", { phone, pin });
    return { step: res.data.step || "", devOtp: res.data.dev_otp, phoneHint: res.data.phone_hint, error: res.data.error };
  };

  const verifyOtp = async (phone: string, otp: string) => {
    const res = await api.post<any>("/auth/login/verify-otp", { phone, otp_code: otp });
    if (res.ok && res.data.token) {
      await SecureStore.setItemAsync("nexapay_token", res.data.token);
      await SecureStore.setItemAsync("nexapay_address", res.data.chain_address);
      setToken(res.data.token); setAddress(res.data.chain_address);
      await fetchUser(res.data.token, res.data.chain_address);
      return true;
    }
    return false;
  };

  const logout = async () => {
    if (token) await api.post("/auth/logout", {}, { "X-Account-Token": token });
    await SecureStore.deleteItemAsync("nexapay_token");
    await SecureStore.deleteItemAsync("nexapay_address");
    setUser(null); setToken(null); setAddress(null);
  };

  const refreshUser = async () => {
    if (token && address) await fetchUser(token, address);
  };

  const setAuth = async (tok: string, addr: string) => {
    await SecureStore.setItemAsync("nexapay_token", tok);
    await SecureStore.setItemAsync("nexapay_address", addr);
    setToken(tok);
    setAddress(addr);
    await fetchUser(tok, addr);
  };

  const authenticateWithBiometrics = async () => {
    if (!isBiometricAvailable) return false;
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: "Authenticate to access NexaPay",
      fallbackLabel: "Enter PIN",
    });
    return result.success;
  };

  return (
    <AuthContext.Provider value={{
      user, token, address,
      isAuthenticated: !!user, isLoading, isBiometricAvailable,
      login, verifyOtp, setAuth, logout, refreshUser, authenticateWithBiometrics,
    }}>
      {children}
    </AuthContext.Provider>
  );
}
