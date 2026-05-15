export function extractToken(data: Record<string, unknown>): string {
  const t = data.token ?? data.access_token;
  return typeof t === "string" ? t : "";
}

export function extractAddress(data: Record<string, unknown>): string {
  const a = data.address ?? data.wallet_address ?? data.account_address ?? data.chain_address;
  return typeof a === "string" ? a : "";
}

export function persistSession(token: string, address: string, fullName?: string, phone?: string): void {
  if (typeof window === "undefined") return;
  if (token) localStorage.setItem("nexapay_token", token);
  if (address) localStorage.setItem("nexapay_address", address);
  if (fullName) localStorage.setItem("nexapay_full_name", fullName);
  if (phone) localStorage.setItem("nexapay_phone", phone);
}

export function getSessionToken(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("nexapay_token") || "";
}

export function getSessionAddress(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("nexapay_address") || "";
}

export function getSessionFullName(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("nexapay_full_name") || "";
}

export function getSessionPhone(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("nexapay_phone") || "";
}

export function clearSession(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem("nexapay_token");
  localStorage.removeItem("nexapay_address");
  localStorage.removeItem("nexapay_full_name");
  localStorage.removeItem("nexapay_phone");
  localStorage.removeItem("nexapay_api_key");
}

export function persistApiKey(apiKey: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem("nexapay_api_key", apiKey);
}

export function getApiKey(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("nexapay_api_key") || "";
}

export function messageFromResponse(data: Record<string, unknown>): string {
  const m = data.message ?? data.error ?? data.detail;
  if (typeof m === "string") return m;
  if (Array.isArray(m)) return m.map(String).join(", ");
  return "Something went wrong. Try again.";
}

export function maskPhoneDisplay(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 5) return phone;
  const head = digits.slice(0, 3);
  const tail = digits.slice(-2);
  const midLen = Math.max(0, digits.length - 5);
  const bullets = "•".repeat(Math.min(midLen, 8)) || "••••••";
  return `${head}${bullets}${tail}`;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 8) return `216${digits}`;
  if (digits.length === 11 && digits.startsWith("216")) return digits;
  return digits;
}

export function isValidTunisianPhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 8) return /^[2-9]/.test(digits);
  if (digits.length === 11 && digits.startsWith("216")) return /^216[2-9]/.test(digits);
  return false;
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function isValidCin(cin: string): boolean {
  return cin.trim().length >= 6;
}

export function isValidDateOfBirth(dob: string): boolean {
  const d = new Date(dob);
  const now = new Date();
  const age = now.getFullYear() - d.getFullYear();
  return !isNaN(d.getTime()) && age >= 18 && age <= 120 && d < now;
}
