# NexaPay API Documentation

**Base URL:** `https://nexapay.space` (production) · `http://127.0.0.1:18080` (local)  
**Auth header:** `X-Account-Token: <jwt>` (all protected routes)  
**Content-Type:** `application/json` unless noted as `multipart/form-data`  
**Amounts:** all monetary values are in **millimes** (1 TND = 1000 millimes) as integers  

---

## 1. Authentication

### 1.1 Login with password
```
POST /auth/login
```
**Body**
```json
{
  "cin": "string",
  "password": "string"
}
```
**Response `200`**
```json
{
  "token": "string (JWT)",
  "address": "string (NXP...)",
  "full_name": "string"
}
```

---

### 1.2 Request OTP login
```
POST /auth/login/otp/request
```
**Body**
```json
{
  "phone": "string"
}
```
**Response `200`**
```json
{
  "message": "OTP sent",
  "phone_hint": "string (masked)"
}
```

---

### 1.3 Verify OTP login
```
POST /auth/login/otp/verify
```
**Body**
```json
{
  "phone": "string",
  "otp_code": "string"
}
```
**Response `200`**
```json
{
  "token": "string (JWT)",
  "address": "string (NXP...)",
  "full_name": "string"
}
```

---

## 2. KYC Onboarding

> No blockchain account is created until all 4 steps complete successfully.

### 2.1 Step 1 — Init registration
```
POST /auth/register/init
```
**Body**
```json
{
  "full_name": "string",
  "phone": "string (216XXXXXXXX)",
  "email": "string",
  "password": "string",
  "date_of_birth": "string (YYYY-MM-DD)",
  "cin_number": "string (8 digits)"
}
```
**Response `200`**
```json
{
  "session_id": "string (UUID)",
  "next_step": "verify_phone"
}
```
**Errors**

| Code | Error | Meaning |
|------|-------|---------|
| 400 | `INVALID_PHONE` | Phone not in 216XXXXXXXX format |
| 400 | `INVALID_CIN` | CIN not 8 digits |
| 400 | `UNDERAGE` | User is under 18 |
| 409 | `CIN_ALREADY_EXISTS` | CIN already registered |
| 409 | `PHONE_ALREADY_EXISTS` | Phone already registered |

---

### 2.2 Step 2 — Verify phone (OTP)
```
POST /auth/register/verify-phone
```
**Body**
```json
{
  "session_id": "string (UUID)",
  "otp_code": "string (6 digits)"
}
```
**Response `200`**
```json
{
  "session_id": "string",
  "next_step": "document_upload"
}
```
**Errors**

| Code | Error | Meaning |
|------|-------|---------|
| 400 | `INVALID_OTP` | Wrong code |
| 400 | `OTP_EXPIRED` | OTP older than 10 minutes |
| 429 | `TOO_MANY_ATTEMPTS` | 3+ failed attempts |

---

### 2.3 Step 3 — Upload documents
```
POST /auth/register/upload-documents
Content-Type: multipart/form-data
```
**Form fields**

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `session_id` | string | ✅ | UUID from step 1 |
| `cin_front` | file | ✅ | JPG/PNG/PDF, max 5 MB |
| `cin_back` | file | ✅ | JPG/PNG/PDF, max 5 MB |
| `proof_of_address` | file | ✅ | Utility bill/bank stmt ≤ 3 months old, max 5 MB |
| `address_line` | string | ✅ | Street address |
| `governorate` | string | ✅ | One of the 24 Tunisian governorates |
| `postal_code` | string | ✅ | 4-digit code |

**Response `200`**
```json
{
  "session_id": "string",
  "next_step": "liveness_check"
}
```
**Errors**

| Code | Error | Meaning |
|------|-------|---------|
| 400 | `INVALID_FILE_TYPE` | File not JPG/PNG/PDF |
| 400 | `FILE_TOO_LARGE` | File exceeds 5 MB |
| 400 | `BLANK_DOCUMENT` | Image appears blank |
| 404 | `SESSION_NOT_FOUND` | Invalid session_id |

---

### 2.4 Step 4 — Liveness check
```
POST /auth/register/liveness
Content-Type: multipart/form-data
```
**Form fields**

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `session_id` | string | ✅ | UUID from step 1 |
| `liveness_video` | file | ✅ | MP4/WEBM, max 20 MB. User turns head left/right/up/down and blinks |
| `cin_front` | file | ✅ | Same CIN front as step 3 — used for face match |

**Response `200` — KYC Approved**
```json
{
  "status": "APPROVED",
  "session_id": "string",
  "next_step": "set_pin",
  "address": "string (NXP...)",
  "rib": "string (20 digits)",
  "iban": "string (TN59...)",
  "card_last4": "string",
  "card_expiry": "string (MM/YY)",
  "card_type": "VISA"
}
```
**Errors**

| Code | Error | Meaning |
|------|-------|---------|
| 422 | `LIVENESS_INSUFFICIENT_MOTION` | Not enough head movement detected |
| 422 | `LIVENESS_FACE_NOT_FOUND` | No face detected in video frames |
| 422 | `LIVENESS_FACE_MISMATCH` | Face doesn't match CIN photo (similarity < 0.78) |
| 429 | `LIVENESS_LOCKED` | 2 failed attempts — locked for 24 hours |

> **Note:** 2 retries allowed before the session is locked for 24 hours.

---

## 3. Account

### 3.1 Get account details
```
GET /accounts/:address
X-Account-Token: <jwt>
```
**Response `200`**
```json
{
  "address": "string (NXP...)",
  "full_name": "string",
  "balance": 0,
  "balance_display": "0.000 TND",
  "account_number": "string (20 digits)",
  "rib": "string (20 digits)",
  "iban": "string (TN59...)",
  "card": {
    "last4": "string",
    "expiry": "string (MM/YY)",
    "type": "VISA"
  },
  "kyc_status": "verified",
  "account_type": "User",
  "tx_count": 0,
  "created_at": "string (ISO 8601)"
}
```

---

### 3.2 Get public account info (masked)
```
GET /accounts/:address/public
```
No auth required.

**Response `200`**
```json
{
  "address": "string",
  "full_name": "string (first name + last initial)",
  "account_type": "string"
}
```

---

### 3.3 Search accounts
```
GET /accounts/:address/search?q=<query>
X-Account-Token: <jwt>
```
Resolves by NXP address, phone, or email.

**Response `200`**
```json
{
  "results": [
    {
      "address": "string",
      "full_name": "string",
      "phone_hint": "string (masked)"
    }
  ]
}
```

---

### 3.4 Get transaction history
```
GET /accounts/:address/transactions?page=1&limit=20
X-Account-Token: <jwt>
```
**Response `200`**
```json
{
  "transactions": [
    {
      "tx_hash": "string",
      "tx_type": "Transfer | AccountCreate | LoanDisburse | LoanRepay",
      "from": "string (NXP...)",
      "to": "string (NXP...)",
      "amount": 0,
      "fee": 0,
      "memo": "string",
      "timestamp": "string (ISO 8601)",
      "block_index": 0
    }
  ],
  "total": 0,
  "page": 1,
  "limit": 20
}
```

---

### 3.5 Set transaction PIN
```
POST /accounts/:address/set-pin
X-Account-Token: <jwt>
```
Called immediately after liveness approval (step `set_pin`).

**Body**
```json
{
  "pin": "string (4–6 digits)"
}
```
**Response `200`**
```json
{
  "success": true
}
```

---

### 3.6 Get notifications
```
GET /accounts/:address/notifications
X-Account-Token: <jwt>
```
**Response `200`**
```json
{
  "notifications": [
    {
      "id": "string (UUID)",
      "type": "TRANSFER | CREDIT | AGENT_APPROVED | AGENT_REJECTED",
      "from_address": "string",
      "from_name": "string",
      "amount": 0,
      "memo": "string",
      "is_read": false,
      "created_at": "string (ISO 8601)"
    }
  ]
}
```

---

## 4. Wallet Operations

### 4.1 Fund wallet (card payment)
```
POST /accounts/:address/fund
X-Account-Token: <jwt>
```
> MVP: only accepts NexaPay-issued cards (closed-loop). Production will connect to CMC/SMT rails.

**Body**
```json
{
  "amount": 5000000,
  "card_number": "string (16 digits)",
  "card_expiry_month": 12,
  "card_expiry_year": 2029,
  "card_holder_name": "string",
  "cvv": "string (3 digits)"
}
```
**Constraints:** minimum `1000` (1.000 TND) · maximum `10000000` (10,000.000 TND)

**Response `200`**
```json
{
  "transaction_id": "string",
  "amount_credited": 0,
  "fee": 0,
  "status": "PENDING",
  "estimated_confirmation": "~5 seconds"
}
```
**Errors**

| Code | Error | Meaning |
|------|-------|---------|
| 400 | `INVALID_CARD_NUMBER` | Fails Luhn check |
| 400 | `CARD_EXPIRED` | Expiry date in the past |
| 400 | `AMOUNT_TOO_LOW` | Below minimum |
| 402 | `CARD_DECLINED` | Card not found or CVV mismatch |
| 402 | `INSUFFICIENT_FUNDS_ON_CARD` | Source wallet has insufficient balance |

**Fee:** 0.5% of amount, minimum 100 millimes (0.100 TND)

---

### 4.2 Fund wallet — pay by card (public, no auth)
```
POST /wallets/:address/pay-by-card
```
No auth required. Used for guest top-up flow.

**Body**
```json
{
  "amount": 0,
  "card_number": "string",
  "expiry_month": "string",
  "expiry_year": "string",
  "cvv": "string",
  "pin": "string",
  "card_holder_name": "string",
  "memo": "string"
}
```
**Response `200`**
```json
{
  "success": true,
  "transaction_id": "string",
  "amount_credited": 0
}
```

---

### 4.3 Transfer to friend (same app)
```
POST /accounts/:address/transfer
X-Account-Token: <jwt>
```
**Body**
```json
{
  "to": "string (NXP address OR phone OR email)",
  "amount": 100000,
  "pin": "string (transaction PIN)",
  "memo": "string (optional, max 140 chars)"
}
```
**Fee:** 0 TND (zero-fee internal transfers)

**Response `200`**
```json
{
  "success": true,
  "tx_hash": "string",
  "to_name": "string (resolved full name)",
  "to_address": "string (NXP...)",
  "amount": 100000,
  "fee": 0,
  "status": "PENDING"
}
```
**Errors**

| Code | Error | Meaning |
|------|-------|---------|
| 400 | `WRONG_PIN` | Transaction PIN incorrect |
| 400 | `INSUFFICIENT_BALANCE` | Not enough funds |
| 404 | `USER_NOT_FOUND` | `to` could not be resolved |

---

### 4.4 Withdraw to bank account
```
POST /accounts/:address/withdraw-to-bank
Content-Type: multipart/form-data
X-Account-Token: <jwt>
```
**Form fields**

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `amount` | number | ✅ | Millimes, minimum 10000 (10.000 TND) |
| `rib` | string | ✅ | 20-digit Tunisian RIB |
| `account_holder_name` | string | ✅ | Name on the bank account |
| `rib_document` | file | ✅ | Certified RIB document, JPG/PNG/PDF, max 5 MB |
| `pin` | string | ✅ | Transaction PIN |

**Response `200`**
```json
{
  "withdrawal_id": "string (UUID)",
  "amount": 0,
  "fee": 0,
  "rib_masked": "****************1234",
  "status": "PENDING_REVIEW",
  "estimated_settlement": "1-2 business days",
  "message": "string"
}
```
**Errors**

| Code | Error | Meaning |
|------|-------|---------|
| 400 | `WRONG_PIN` | Transaction PIN incorrect |
| 400 | `INVALID_RIB` | RIB fails mod-97 check |
| 400 | `AMOUNT_TOO_LOW` | Below 10.000 TND |
| 402 | `INSUFFICIENT_BALANCE` | Balance + fee exceeds wallet balance |

**Fee:** 1% of amount · minimum 1,000 millimes · maximum 20,000 millimes

---

## 5. Agent System

### 5.1 Apply to become an agent
```
POST /accounts/:address/agent/apply
Content-Type: multipart/form-data
X-Account-Token: <jwt>
```
> Requires KYC status = `verified`. User cannot have a pending or approved application.

**Form fields**

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `user_address` | string | ✅ | Must match `:address` in path |
| `business_name` | string | ✅ | Commercial name |
| `business_type` | string | ✅ | `FREELANCER` · `SME` · `ASSOCIATION` · `STARTUP` |
| `tax_registration_number` | string | ✅ | Matricule fiscal format: `[0-9]{7}[A-Z]/[A-Z]/[0-9]{3}` |
| `tax_document` | file | ✅ | Patente / Auto-entrepreneur cert, max 10 MB |
| `business_address` | string | ✅ | |
| `business_governorate` | string | ✅ | |
| `business_description` | string | ✅ | Max 500 chars |
| `expected_monthly_volume` | number | ✅ | TND |

**Response `200`**
```json
{
  "application_id": "string (UUID)",
  "status": "PENDING",
  "message": "Application submitted. You will be notified within 24 hours."
}
```

---

### 5.2 Get agent application status
```
GET /accounts/:address/agent/status
```
No auth required.

**Response `200`**
```json
{
  "application_id": "string (UUID)",
  "status": "PENDING | UNDER_REVIEW | APPROVED | REJECTED",
  "risk_score": 0.0,
  "rejection_reason": "string | null",
  "business_name": "string",
  "monthly_volume_limit": 0
}
```
If `status` is `APPROVED`, also includes:
```json
{
  "api_key": "string",
  "docs_url": "https://nexapay.space/docs"
}
```
**Errors**

| Code | Error | Meaning |
|------|-------|---------|
| 404 | `No application found` | No application for this address |

---

### 5.3 Agent dashboard
```
GET /accounts/:address/agent/dashboard
X-Account-Token: <jwt>
```
**Response `200`**
```json
{
  "status": "APPROVED",
  "business_name": "string",
  "api_key": "string",
  "permissions": {
    "merchants": true,
    "payment_intents": true,
    "refunds": true,
    "payouts": true,
    "webhooks": true,
    "balance": true,
    "transactions": true
  },
  "monthly_volume_limit": 0,
  "docs_url": "https://nexapay.space/docs"
}
```

---

## 6. Payment Gateway

> All gateway routes require API key authentication via header: `X-Api-Key: <key>`

### 6.1 Register merchant
```
POST /gateway/v1/merchants/register
```
**Body**
```json
{
  "name": "string",
  "email": "string",
  "webhook_url": "string (optional)"
}
```

---

### 6.2 Merchant stats
```
GET /gateway/v1/merchants/stats
```

---

### 6.3 Create payment intent
```
POST /gateway/v1/intents
```
**Body**
```json
{
  "amount": 0,
  "currency": "TND",
  "customer_email": "string",
  "metadata": {},
  "idempotency_key": "string (optional)"
}
```
**Response `200`**
```json
{
  "intent_id": "string",
  "amount": 0,
  "status": "PENDING",
  "checkout_url": "string"
}
```

---

### 6.4 Get payment intent
```
GET /gateway/v1/intents/:intent_id
```

---

### 6.5 Confirm payment
```
POST /gateway/v1/intents/:intent_id/confirm
```
**Body**
```json
{
  "card_number": "string",
  "expiry_month": 0,
  "expiry_year": 0,
  "cvv": "string",
  "pin": "string"
}
```

---

### 6.6 Create refund
```
POST /gateway/v1/refunds
```
**Body**
```json
{
  "intent_id": "string",
  "amount": 0,
  "reason": "string"
}
```

---

### 6.7 Gateway balance
```
GET /gateway/v1/balance
```

---

### 6.8 Gateway transactions
```
GET /gateway/v1/transactions?page=1&limit=20
```

---

### 6.9 Create payout
```
POST /gateway/v1/payout
```
**Body**
```json
{
  "amount": 0,
  "destination": "string (NXP address or RIB)"
}
```

---

### 6.10 Webhooks
```
POST   /gateway/v1/webhooks          — Create webhook
GET    /gateway/v1/webhooks          — List webhooks
DELETE /gateway/v1/webhooks/:id      — Delete webhook
GET    /gateway/v1/webhooks/:id/deliveries  — Delivery logs
POST   /gateway/v1/webhooks/:id/test — Test webhook
```
**Webhook signature:** `SHA-256(secret + "." + payload)`

**Webhook events:** `payment.confirmed` · `payment.failed` · `refund.created` · `payout.created`

---

## 7. Admin

> No auth for MVP. Add IP whitelist before production.

### 7.1 List agent applications
```
GET /admin/agents/applications?status=UNDER_REVIEW
```
**Response `200`**
```json
{
  "applications": [
    {
      "id": "string (UUID)",
      "user_address": "string",
      "business_name": "string",
      "status": "string",
      "risk_score": 0.0,
      "created_at": "string"
    }
  ]
}
```

---

### 7.2 Get application detail
```
GET /admin/agents/applications/:id
```

---

### 7.3 Approve application
```
POST /admin/agents/applications/:id/approve
```
**Body**
```json
{
  "reviewer_notes": "string (optional)"
}
```
**Response `200`**
```json
{ "status": "APPROVED" }
```

---

### 7.4 Reject application
```
POST /admin/agents/applications/:id/reject
```
**Body**
```json
{
  "rejection_reason": "string"
}
```
**Response `200`**
```json
{ "status": "REJECTED" }
```

---

### 7.5 Process bank withdrawal
```
POST /admin/withdrawals/:id/process
```
**Body**
```json
{
  "action": "COMPLETE | REJECT",
  "rejection_reason": "string (required if REJECT)"
}
```
**Response `200`**
```json
{ "status": "COMPLETED | REJECTED" }
```

---

## 8. Chain Observability

### 8.1 Chain stats
```
GET /chain/stats
```
**Response `200`**
```json
{
  "height": 0,
  "total_transactions": 0,
  "total_accounts": 0,
  "network_status": "online",
  "block_time_secs": 5
}
```

---

### 8.2 List blocks
```
GET /chain/blocks?page=1&limit=20
```

---

### 8.3 Get block by index
```
GET /chain/blocks/:index
```
**Response `200`**
```json
{
  "index": 0,
  "timestamp": 0,
  "hash": "string",
  "previous_hash": "string",
  "validator": "string",
  "signature": "string",
  "state_root": "string",
  "transactions": []
}
```

---

### 8.4 Find transaction by hash
```
GET /chain/transactions/:hash
```

---

## 9. API Key Management

> Used by agents to manage their gateway access keys.

```
POST /api-keys/rotate      — Rotate an API key
POST /api-keys/revoke      — Revoke an API key
GET  /api-keys/usage       — Usage statistics
POST /api-keys/permissions — Update permissions
```

---

## 10. Agent Scoring Algorithm

Applications are scored automatically every 30 seconds. Score range: `0.0 → 1.0`.

| Criterion | Weight | Max Score Condition |
|-----------|--------|-------------------|
| KYC account age | 15% | Account > 30 days old |
| Transaction history | 20% | > 10 txs and > 500 TND volume |
| Wallet balance | 15% | Balance > 1,000 TND |
| Tax document quality | 25% | File present, > 50 KB, non-blank |
| Business profile completeness | 25% | Description > 250 chars, valid tax number, reasonable volume |

| Score | Decision |
|-------|----------|
| ≥ 0.70 | Auto-approved |
| 0.45 – 0.69 | Flagged for manual review |
| < 0.45 | Auto-rejected (may reapply after 30 days) |

---

## 11. Error Format

All errors follow this structure:

```json
{
  "error": "ERROR_CODE",
  "message": "Human readable description"
}
```

---

## 12. Test Cards (development only)

| Card Number | Scenario |
|-------------|----------|
| `4242424242424242` | Always succeeds |
| `4000000000000002` | Always declined |

CVV: any 3 digits · Expiry: any future date · PIN: `1234`

> Test cards only work when `APP_ENV=development`.
