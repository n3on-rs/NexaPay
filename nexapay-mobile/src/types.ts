export interface User {
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
  isAgent: boolean;
}

export interface AccountDetails {
  address: string;
  full_name: string;
  balance: number;
  balance_display: string;
  account_number: string;
  rib: string;
  iban: string;
  card: { last4: string; expiry: string; type: string };
  kyc_status: string;
  account_type: string;
  tx_count: number;
  created_at: string;
  phone: string;
  email: string;
  cin: string;
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

export interface AgentStatus {
  application_id?: string;
  status?: string;
  business_name?: string;
  api_key?: string;
  risk_score?: number | null;
  monthly_volume_limit?: number | null;
}
