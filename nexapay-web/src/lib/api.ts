const BASE_URL = "/api";

export function getApiBase(): string {
  return BASE_URL;
}

export interface ApiHeaders extends Record<string, string | undefined> {
  "X-Account-Token"?: string;
  "X-API-Key"?: string;
  "X-Idempotency-Key"?: string;
}

export async function parseResponseJson(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { _parseError: true, raw: text };
  }
}

function buildHeaders(extra?: ApiHeaders): Record<string, string> {
  const h: Record<string, string> = {};
  if (extra?.["X-Account-Token"]) h["X-Account-Token"] = extra["X-Account-Token"];
  if (extra?.["X-API-Key"]) h["X-API-Key"] = extra["X-API-Key"];
  return h;
}

export async function getJson(
  path: string,
  extraHeaders?: ApiHeaders,
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const fullUrl = `${getApiBase()}${path}`;
  const res = await fetch(fullUrl, {
    method: "GET",
    headers: buildHeaders(extraHeaders),
  });
  const data = await parseResponseJson(res);
  return { ok: res.ok, status: res.status, data };
}

export async function deleteJson(
  path: string,
  extraHeaders?: ApiHeaders,
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const fullUrl = `${getApiBase()}${path}`;
  const headers = buildHeaders(extraHeaders);
  const res = await fetch(fullUrl, { method: "DELETE", headers });
  const data = await parseResponseJson(res);
  return { ok: res.ok, status: res.status, data };
}

export async function postJson(
  path: string,
  body: Record<string, unknown>,
  extraHeaders?: ApiHeaders,
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const fullUrl = `${getApiBase()}${path}`;
  const headers = buildHeaders(extraHeaders);
  headers["Content-Type"] = "application/json";
  const res = await fetch(fullUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const data = await parseResponseJson(res);
  return { ok: res.ok, status: res.status, data };
}

export async function putJson(
  path: string,
  body: Record<string, unknown>,
  extraHeaders?: ApiHeaders,
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const fullUrl = `${getApiBase()}${path}`;
  const headers = buildHeaders(extraHeaders);
  headers["Content-Type"] = "application/json";
  const res = await fetch(fullUrl, {
    method: "PUT",
    headers,
    body: JSON.stringify(body),
  });
  const data = await parseResponseJson(res);
  return { ok: res.ok, status: res.status, data };
}

export async function postFormData(
  path: string,
  form: FormData,
  extraHeaders?: ApiHeaders,
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const fullUrl = `${getApiBase()}${path}`;
  const res = await fetch(fullUrl, {
    method: "POST",
    headers: buildHeaders(extraHeaders),
    body: form,
  });
  const data = await parseResponseJson(res);
  return { ok: res.ok, status: res.status, data };
}

// ─── Dashboard Types ───

export interface CardSummary {
  last4: string;
  expiry: string;
  type: string;
}

export interface AccountDetails {
  address: string;
  full_name: string;
  balance: number;
  balance_display: string;
  account_number: string;
  rib: string;
  iban: string;
  card: CardSummary;
  kyc_status: string;
  account_type: string;
  tx_count: number;
  created_at: string;
  phone: string;
  email: string;
  cin: string;
  address_line: string | null;
  delegation: string | null;
  governorate: string | null;
  avatar_url: string | null;
  card_frozen: boolean;
  card_lost_reported: boolean;
}

export interface TransactionView {
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

export interface TransactionList {
  transactions: TransactionView[];
}

export interface AccountNotification {
  id: string;
  type: string;
  amount: number;
  amount_display: string;
  from_address: string;
  from_name: string;
  memo: string;
  created_at: string;
  is_read: boolean;
}

export interface NotificationsList {
  notifications: AccountNotification[];
}

// ─── Typed Dashboard Helpers ───

export async function fetchAccountDetails(
  address: string,
  token: string,
): Promise<{ ok: boolean; status: number; data: AccountDetails | Record<string, unknown> }> {
  const res = await getJson(`/accounts/${address}`, { "X-Account-Token": token });
  if (!res.ok) return { ok: false, status: res.status, data: res.data };
  return { ok: true, status: res.status, data: res.data as unknown as AccountDetails };
}

export async function fetchAccountTransactions(
  address: string,
  token: string,
): Promise<{ ok: boolean; status: number; data: TransactionList | Record<string, unknown> }> {
  const res = await getJson(`/accounts/${address}/transactions`, { "X-Account-Token": token });
  if (!res.ok) return { ok: false, status: res.status, data: res.data };
  return { ok: true, status: res.status, data: res.data as unknown as TransactionList };
}

export async function fetchAccountNotifications(
  address: string,
  token: string,
): Promise<{ ok: boolean; status: number; data: NotificationsList | Record<string, unknown> }> {
  const res = await getJson(`/accounts/${address}/notifications`, { "X-Account-Token": token });
  if (!res.ok) return { ok: false, status: res.status, data: res.data };
  return { ok: true, status: res.status, data: res.data as unknown as NotificationsList };
}

export async function markNotificationRead(
  address: string,
  token: string,
  txId: string,
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  return postJson(
    `/accounts/${address}/notifications/${txId}/read`,
    {},
    { "X-Account-Token": token },
  );
}

export async function markAllNotificationsRead(
  address: string,
  token: string,
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  return postJson(
    `/accounts/${address}/notifications/read-all`,
    {},
    { "X-Account-Token": token },
  );
}

export async function freezeCard(
  address: string,
  token: string,
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const res = await postJson(`/accounts/${address}/card/freeze`, {}, { "X-Account-Token": token });
  return { ok: res.ok, status: res.status, data: res.data };
}

export async function reportLostCard(
  address: string,
  token: string,
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const res = await postJson(`/accounts/${address}/card/lost`, {}, { "X-Account-Token": token });
  return { ok: res.ok, status: res.status, data: res.data };
}

export async function updateProfile(
  address: string,
  token: string,
  body: { address_line?: string; delegation?: string; governorate?: string },
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const res = await postJson(`/accounts/${address}/profile`, body as Record<string, unknown>, { "X-Account-Token": token });
  return { ok: res.ok, status: res.status, data: res.data };
}

export async function uploadAvatar(
  address: string,
  token: string,
  file: File,
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const form = new FormData();
  form.append("avatar", file);
  const res = await postFormData(`/accounts/${address}/avatar`, form, { "X-Account-Token": token });
  return { ok: res.ok, status: res.status, data: res.data };
}

export async function resolveSecurityAlert(
  token: string,
  sessionId: string,
  isMe: boolean,
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  return postJson(
    "/auth/security-alert",
    { session_id: sessionId, is_me: isMe },
    { "X-Account-Token": token },
  );
}

export async function changePin(
  token: string,
  currentPin: string,
  newPin: string,
  pinConfirm: string,
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  return postJson(
    "/auth/change-pin",
    { current_pin: currentPin, new_pin: newPin, pin_confirm: pinConfirm },
    { "X-Account-Token": token },
  );
}

export async function requestTransferOtp(
  address: string,
  token: string,
  to: string,
  amount: number,
  pin: string,
  memo?: string,
  idempotencyKey?: string,
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  return postJson(
    `/accounts/${address}/transfer/request-otp`,
    { to, amount, memo, pin },
    { "X-Account-Token": token, "X-Idempotency-Key": idempotencyKey },
  );
}

export async function verifyTransferOtp(
  address: string,
  token: string,
  otpId: string,
  otpCode: string,
  idempotencyKey?: string,
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  return postJson(
    `/accounts/${address}/transfer/verify-otp`,
    { otp_id: otpId, otp_code: otpCode },
    { "X-Account-Token": token, "X-Idempotency-Key": idempotencyKey },
  );
}

export async function bankTransfer(
  address: string,
  token: string,
  rib: string,
  beneficiaryName: string,
  amount: number,
  pin: string,
  otpId: string,
  otpCode: string,
  memo?: string,
  idempotencyKey?: string,
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  return postJson(
    `/accounts/${address}/bank-transfer`,
    { rib, beneficiary_name: beneficiaryName, amount, pin, otp_id: otpId, otp_code: otpCode, memo },
    { "X-Account-Token": token, "X-Idempotency-Key": idempotencyKey },
  );
}

export async function fetchBankTransfers(
  address: string,
  token: string,
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  return getJson(`/accounts/${address}/bank-transfers`, { "X-Account-Token": token });
}

export async function fetchSavedBeneficiaries(
  address: string,
  token: string,
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  return getJson(`/accounts/${address}/saved-beneficiaries`, { "X-Account-Token": token });
}

export async function addSavedBeneficiary(
  address: string,
  token: string,
  rib: string,
  beneficiaryName: string,
  bankName?: string,
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  return postJson(
    `/accounts/${address}/saved-beneficiaries`,
    { rib, beneficiary_name: beneficiaryName, bank_name: bankName },
    { "X-Account-Token": token },
  );
}

export async function deleteSavedBeneficiary(
  address: string,
  token: string,
  beneficiaryId: string,
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  return deleteJson(
    `/accounts/${address}/saved-beneficiaries/${beneficiaryId}`,
    { "X-Account-Token": token },
  );
}

// ─── Agent Application ───

export interface AgentApplicationStatus {
  application_id?: string;
  status?: "PENDING" | "UNDER_REVIEW" | "APPROVED" | "REJECTED" | string;
  risk_score?: number | null;
  rejection_reason?: string | null;
  reviewer_notes?: string | null;
  tax_document_path?: string | null;
  rne_document_path?: string | null;
  business_address?: string | null;
  business_governorate?: string | null;
  business_description?: string | null;
  created_at?: string;
  business_name?: string;
  monthly_volume_limit?: number | null;
  docs_url?: string;
  has_api_key?: boolean;
}

export async function applyAgent(
  address: string,
  token: string,
  form: FormData,
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  return postFormData(`/accounts/${address}/agent/apply`, form, { "X-Account-Token": token });
}

export async function getAgentStatus(
  address: string,
  token: string,
): Promise<{ ok: boolean; status: number; data: AgentApplicationStatus }> {
  const res = await getJson(`/accounts/${address}/agent/status`, { "X-Account-Token": token });
  return { ok: res.ok, status: res.status, data: res.data as AgentApplicationStatus };
}

// ─── Gateway API (Agent Portal) ───

export async function getGatewayBalance(apiKey: string): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  return getJson("/gateway/v1/balance", { "X-API-Key": apiKey });
}

export async function getGatewayTransactions(
  apiKey: string,
  page = 1,
  limit = 20,
  status?: string,
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (status) params.append("status", status);
  return getJson(`/gateway/v1/transactions?${params.toString()}`, { "X-API-Key": apiKey });
}

export async function getCompanyDashboard(
  address: string,
  token: string,
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  return getJson(`/accounts/${address}/company`, { "X-Account-Token": token });
}

export async function getApiKeysUsage(token: string): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  return getJson("/api-keys/usage", { "X-Account-Token": token });
}

export async function createApiKey(
  address: string,
  token: string,
  body: { name: string; permissions?: Record<string, boolean> },
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  return postJson(`/accounts/${address}/company/api-keys/create`, body, { "X-Account-Token": token });
}

export async function revokeApiKey(
  address: string,
  token: string,
  keyPrefix: string,
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  return postJson(`/accounts/${address}/company/api-keys/revoke`, { key_prefix: keyPrefix }, { "X-Account-Token": token });
}

export async function listWebhooks(
  apiKey: string,
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  return getJson("/gateway/v1/webhooks", { "X-API-Key": apiKey });
}

export async function createWebhook(
  apiKey: string,
  url: string,
  events?: string[],
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  return postJson("/gateway/v1/webhooks", { url, events: events ?? ["payment_intent.succeeded", "payment_intent.failed"] }, { "X-API-Key": apiKey });
}

export async function deleteWebhook(
  apiKey: string,
  id: string,
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  return deleteJson(`/gateway/v1/webhooks/${id}`, { "X-API-Key": apiKey });
}

export async function createRefund(
  apiKey: string,
  body: { intent_id: string; amount: number; reason: string },
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  return postJson("/gateway/v1/refunds", body, { "X-API-Key": apiKey });
}

export async function createPayout(
  apiKey: string,
  body: { amount: number; destination: string },
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  return postJson("/gateway/v1/payout", body, { "X-API-Key": apiKey });
}

// ─── E-Signature ───

export async function signAccountContract(
  address: string,
  token: string,
  signatureImageBase64: string,
  signatureType = "draw",
  termsAccepted = false,
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  return postJson(
    `/accounts/${address}/esign/account`,
    { signature_image_base64: signatureImageBase64, signature_type: signatureType, terms_accepted: termsAccepted },
    { "X-Account-Token": token },
  );
}

export async function getAccountContract(
  address: string,
  token: string,
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  return getJson(`/accounts/${address}/esign/contract`, { "X-Account-Token": token });
}

export async function downloadSignedContract(
  address: string,
  docId: string,
  token: string,
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  return getJson(`/accounts/${address}/esign/account/${docId}/download`, { "X-Account-Token": token });
}

export async function signTransferAuthorization(
  address: string,
  token: string,
  transferId: string,
  amount: number,
  destinationHash: string,
  signatureImageBase64: string,
  signatureType = "draw",
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  return postJson(
    `/accounts/${address}/esign/transfer`,
    {
      transfer_id: transferId,
      amount,
      destination_hash: destinationHash,
      signature_image_base64: signatureImageBase64,
      signature_type: signatureType,
    },
    { "X-Account-Token": token },
  );
}

export async function listSignedDocuments(
  address: string,
  token: string,
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  return getJson(`/accounts/${address}/esign/documents`, { "X-Account-Token": token });
}

// ─── Invoices ───

export async function generateInvoice(
  address: string,
  token: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  return postJson(`/accounts/${address}/invoices/generate`, body, { "X-Account-Token": token });
}

export async function listInvoices(
  address: string,
  token: string,
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  return getJson(`/accounts/${address}/invoices`, { "X-Account-Token": token });
}

export async function verifyInvoice(
  invoiceId?: string,
  docHash?: string,
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const params = new URLSearchParams();
  if (invoiceId) params.append("invoice_id", invoiceId);
  if (docHash) params.append("doc_hash", docHash);
  return getJson(`/verify/invoice?${params.toString()}`);
}

// ─── KYC Verification ───

export async function startKyc(
  address: string,
  token: string,
  frontImage: File,
  backImage: File,
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const form = new FormData();
  form.append("front", frontImage);
  form.append("back", backImage);
  return postFormData(`/accounts/${address}/kyc/start`, form, { "X-Account-Token": token });
}

export async function finalizeKyc(
  address: string,
  token: string,
  sessionId: string,
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  return postJson(`/accounts/${address}/kyc/finalize`, { session_id: sessionId }, { "X-Account-Token": token });
}

export async function getKycStatus(
  address: string,
  token: string,
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  return getJson(`/accounts/${address}/kyc/status`, { "X-Account-Token": token });
}

export async function skipKyc(
  address: string,
  token: string,
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  return postJson(`/accounts/${address}/kyc/skip`, {}, { "X-Account-Token": token });
}

export async function uploadFacePhoto(
  address: string,
  token: string,
  photo: File,
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const form = new FormData();
  form.append("face", photo);
  return postFormData(`/accounts/${address}/kyc/face`, form, { "X-Account-Token": token });
}

export async function verifyRegistrationOtp(
  sessionId: string,
  otpCode: string,
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  return postJson("/auth/register/verify-otp", { session_id: sessionId, otp_code: otpCode });
}

export async function submitCin(
  address: string,
  token: string,
  cin: string,
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  return postJson(`/accounts/${address}/cin`, { cin }, { "X-Account-Token": token });
}
