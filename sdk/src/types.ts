/**
 * Core configuration for the NexaPay SDK client
 */
export interface NexaPayConfig {
  /**
   * Your NexaPay API key (optional for endpoints that don't require authentication)
   * Format: nxp_{owner_tag}_{token}_{checksum}
   * Example: nxp_dev_abc123def456ghi789_12345678
   */
  apiKey?: string;

  /**
   * Base URL for the NexaPay API
   * @default 'https://backend.nexapay.space'
   */
  baseURL?: string;

  /**
   * Timeout for API requests in milliseconds
   * @default 30000
   */
  timeout?: number;

  /**
   * Additional headers to include with each request
   */
  headers?: Record<string, string>;
}

/**
 * Options for individual API requests
 */
export interface RequestOptions {
  /**
   * Request-specific timeout in milliseconds
   */
  timeout?: number;

  /**
   * Request-specific headers
   */
  headers?: Record<string, string>;

  /**
   * Maximum number of retry attempts on failure
   * @default 0
   */
  maxRetries?: number;
}

/**
 * Pagination parameters for list endpoints
 */
export interface PaginationParams {
  /**
   * Number of items per page
   * @default 50
   */
  limit?: number;

  /**
   * Page token or offset for pagination
   */
  page?: string | number;

  /**
   * Field to sort by
   */
  sortBy?: string;

  /**
   * Sort direction
   * @default 'desc'
   */
  sortDirection?: "asc" | "desc";
}

/**
 * Common list parameters
 */
export interface ListParams extends PaginationParams {
  /**
   * Filter criteria
   */
  filter?: Record<string, any>;

  /**
   * Date range start
   */
  startDate?: Date | string;

  /**
   * Date range end
   */
  endDate?: Date | string;
}

/**
 * Standard API response structure for endpoints that follow the success/error pattern
 */
export interface ApiResponse<T = any> {
  /**
   * Whether the request was successful
   */
  success: boolean;

  /**
   * Response data (present when success is true)
   */
  data?: T;

  /**
   * Error message if success is false
   */
  error?: string;

  /**
   * Additional error details (optional)
   */
  details?: any;

  /**
   * Additional metadata for paginated responses
   */
  metadata?: {
    /**
     * Total number of items (for paginated responses)
     */
    total?: number;

    /**
     * Current page number
     */
    page?: number;

    /**
     * Number of items per page
     */
    limit?: number;

    /**
     * Whether there are more pages
     */
    hasMore?: boolean;

    /**
     * Next page token
     */
    nextPage?: string;
  };
}

/**
 * API error structure returned by the NexaPay API
 */
export interface ApiError {
  /**
   * HTTP status code
   */
  statusCode: number;

  /**
   * Error message
   */
  message: string;

  /**
   * Error code for programmatic handling (optional)
   */
  code?: string;

  /**
   * Request ID for debugging (optional)
   */
  requestId?: string;

  /**
   * Additional error details (optional)
   */
  details?: any;
}

/**
 * Union type representing possible API responses
 * Some endpoints return ApiResponse<T>, others return raw data T
 */
export type NexaPayResponse<T = any> = ApiResponse<T> | T;

/**
 * Type guard to check if a response is an ApiResponse
 */
export function isApiResponse<T>(response: any): response is ApiResponse<T> {
  return (
    response &&
    typeof response === "object" &&
    "success" in response &&
    typeof response.success === "boolean"
  );
}

/**
 * Extract data from a NexaPayResponse
 * If the response is an ApiResponse, returns data property
 * If the response is raw data, returns the data itself
 */
export function extractResponseData<T>(
  response: NexaPayResponse<T>,
): T | undefined {
  if (isApiResponse(response)) {
    return response.data;
  }
  return response;
}

/**
 * Check if a response indicates success
 */
export function isResponseSuccessful(response: any): boolean {
  if (isApiResponse(response)) {
    return response.success === true;
  }
  // Raw responses without success field are considered successful
  return true;
}

/**
 * Get error message from a response
 */
export function getResponseError(response: any): string | undefined {
  if (isApiResponse(response) && response.error) {
    return response.error;
  }
  return undefined;
}

/**
 * Payment intent creation request
 */
export interface CreatePaymentIntentRequest {
  /**
   * Amount in millimes (1 TND = 1000 millimes)
   * Example: 42000 = 42.000 TND
   */
  amount: number;

  /**
   * Currency code (ISO 4217)
   * @default 'TND'
   */
  currency?: string;

  /**
   * Description of the payment (optional)
   */
  description?: string;

  /**
   * Customer email address (optional)
   */
  customer_email?: string;

  /**
   * Customer name (optional)
   */
  customer_name?: string;

  /**
   * Additional metadata (optional)
   */
  metadata?: Record<string, any>;

  /**
   * Idempotency key to prevent duplicate payments (optional)
   */
  idempotency_key?: string;
}

/**
 * Payment intent response
 */
export interface PaymentIntent {
  /**
   * Payment intent identifier
   * Format: pi_{hash}
   */
  intent_id: string;

  /**
   * Current status
   */
  status:
    | "requires_confirmation"
    | "succeeded"
    | "failed"
    | "refunded"
    | "partially_refunded";

  /**
   * Amount in millimes
   */
  amount: number;

  /**
   * Currency code
   */
  currency: string;

  /**
   * Description if provided
   */
  description?: string;

  /**
   * Customer email if provided
   */
  customer_email?: string;

  /**
   * Customer name if provided
   */
  customer_name?: string;

  /**
   * Customer phone if provided
   */
  customer_phone?: string;

  /**
   * Checkout URL for customer payment
   */
  checkout_url: string;

  /**
   * Client secret for secure operations
   */
  client_secret: string;

  /**
   * Whether this intent was reused from idempotency key
   */
  reused?: boolean;

  /**
   * Card last 4 digits (if confirmed)
   */
  card_last4?: string;

  /**
   * Card brand (if confirmed)
   */
  card_brand?: "visa" | "mastercard" | "unknown";

  /**
   * Failure reason if status is 'failed'
   */
  failure_reason?: string;

  /**
   * Creation timestamp
   */
  created_at?: string;

  /**
   * Confirmation timestamp
   */
  confirmed_at?: string;
}

/**
 * Payment intent confirmation request
 */
export interface ConfirmPaymentIntentRequest {
  /**
   * Payment method: 'card' or 'wallet'
   */
  method?: "card" | "wallet";

  /**
   * Card number (e.g., 4242424242424242)
   */
  card_number?: string;

  /**
   * Expiry month (MM)
   */
  expiry_month?: string;

  /**
   * Expiry year (YYYY)
   */
  expiry_year?: string;

  /**
   * CVV
   */
  cvv?: string;

  /**
   * 4-digit card PIN or wallet PIN
   */
  pin?: string;

  /**
   * OTP code (for wallet payment step 2)
   */
  otp?: string;

  /**
   * Phone number with +216 prefix (for wallet payment)
   */
  phone?: string;

  /**
   * Card holder name
   */
  card_holder_name?: string;

  /**
   * Customer first name
   */
  customer_first_name?: string;

  /**
   * Customer last name
   */
  customer_last_name?: string;

  /**
   * Customer phone
   */
  customer_phone?: string;

  /**
   * Optional: custom amount for variable-amount intents (in millimes)
   */
  amount?: number;
}

/**
 * Payment intent confirmation response
 */
export interface ConfirmPaymentIntentResponse {
  /**
   * Whether the confirmation succeeded
   */
  success: boolean;

  /**
   * Intent ID
   */
  intent_id: string;

  /**
   * Payment status after confirmation
   */
  status: string;

  /**
   * Optional: failure reason if declined
   */
  failure_reason?: string;

  /**
   * Optional: redirect URL after payment
   */
  redirect_url?: string;

  /**
   * Optional: OTP flow step (e.g. 'otp_required')
   */
  step?: string;

  /**
   * Optional: masked phone hint for OTP
   */
  phone_hint?: string;

  /**
   * Optional: dev OTP (sandbox only)
   */
  dev_otp?: string;
}

/**
 * Refund creation request
 */
export interface CreateRefundRequest {
  /**
   * Payment intent ID to refund
   */
  intent_id: string;

  /**
   * Amount to refund in millimes (optional, defaults to full amount)
   */
  amount?: number;

  /**
   * Reason for refund (optional)
   */
  reason?: string;

  /**
   * Optional: card brand
   */
  card_brand?: string;

  /**
   * Optional: customer name
   */
  customer_name?: string;

  /**
   * Optional: customer phone
   */
  customer_phone?: string;
}

/**
 * Refund response
 */
export interface Refund {
  /**
   * Refund identifier
   * Format: rf_{hash}
   */
  refund_id: string;

  /**
   * Associated payment intent ID
   */
  intent_id: string;

  /**
   * Refund amount in millimes
   */
  amount: number;

  /**
   * Refund status
   */
  status: "succeeded" | "pending" | "failed";

  /**
   * Reason for refund if provided
   */
  reason?: string;

  /**
   * Updated payment intent status
   */
  intent_status: "refunded" | "partially_refunded";

  /**
   * Creation timestamp
   */
  created_at?: string;
}

/**
 * Payout creation request
 */
export interface CreatePayoutRequest {
  /**
   * Amount in millimes
   */
  amount: number;

  /**
   * Destination identifier (bank account, wallet, etc.)
   */
  destination: string;
}

/**
 * Payout response
 */
export interface Payout {
  /**
   * Payout identifier
   * Format: po_{hash}
   */
  payout_id: string;

  /**
   * Payout status
   */
  status: "queued" | "processing" | "paid" | "failed" | "cancelled";

  /**
   * Amount in millimes
   */
  amount: number;

  /**
   * Destination identifier
   */
  destination: string;

  /**
   * Creation timestamp
   */
  created_at?: string;
}

/**
 * Balance information
 */
export interface Balance {
  /**
   * Currency code
   */
  currency: string;

  /**
   * Gross amount collected (in millimes)
   */
  gross: number;

  /**
   * Total amount refunded (in millimes)
   */
  refunded: number;

  /**
   * Total amount in pending payouts (in millimes)
   */
  payouts: number;

  /**
   * Total amount in pending payments (in millimes)
   */
  pending: number;

  /**
   * Available balance for payout (in millimes)
   */
  available: number;
}

/**
 * Transaction item (can be intent or refund)
 */
export interface TransactionItem {
  /**
   * Transaction type
   */
  type: "intent" | "refund";

  /**
   * Transaction identifier
   */
  id: string;

  /**
   * Amount in millimes
   */
  amount: number;

  /**
   * Currency code
   */
  currency: string;

  /**
   * Transaction status
   */
  status: string;

  /**
   * Description if available
   */
  description?: string;

  /**
   * Reason if applicable (for refunds)
   */
  reason?: string;

  /**
   * Creation timestamp
   */
  created_at?: string;
}

/**
 * Transactions list response
 */
export interface TransactionsResponse {
  /**
   * List of payment intents
   */
  intents: TransactionItem[];

  /**
   * List of refunds
   */
  refunds: TransactionItem[];
}

/**
 * Webhook creation request
 */
export interface CreateWebhookRequest {
  /**
   * Webhook URL (must be http:// or https://)
   */
  url: string;

  /**
   * Event types to subscribe to (optional)
   * Default: all payment events
   */
  event_types?: string[];
}

/**
 * Webhook response
 */
export interface Webhook {
  /**
   * Webhook identifier
   */
  id: string;

  /**
   * Webhook URL
   */
  url: string;

  /**
   * Subscribed event types
   */
  event_types: string[];

  /**
   * Signing secret for webhook verification
   */
  signing_secret: string;

  /**
   * Whether the webhook is active
   */
  is_active: boolean;

  /**
   * Creation timestamp
   */
  created_at?: string;
}

/**
 * Webhook delivery record
 */
export interface WebhookDelivery {
  /**
   * Event type
   */
  event_type: string;

  /**
   * HTTP response status code
   */
  response_status?: number;

  /**
   * Response body (truncated)
   */
  response_body?: string;

  /**
   * Whether delivery was successful
   */
  success: boolean;

  /**
   * Attempt number
   */
  attempt: number;

  /**
   * Delivery timestamp
   */
  delivered_at?: string;
}

/**
 * Developer documentation snippets
 */
export interface DocsSnippets {
  /**
   * Test card numbers for development
   */
  test_cards: Array<{
    card_number: string;
    pin: string;
    result: string;
  }>;

  /**
   * Example cURL commands
   */
  create_intent_curl: string;
  confirm_intent_curl: string;

  /**
   * Webhook signature verification note
   */
  webhook_signature_note: string;

  /**
   * Checkout URL pattern
   */
  checkout_url_pattern: string;
}

/**
 * Webhook event types
 */
export type WebhookEventType =
  | "payment_intent.succeeded"
  | "payment_intent.failed"
  | "payment_intent.refunded"
  | "payout.created"
  | "payout.completed"
  | "payout.failed"
  | "webhook.test";

/**
 * Webhook event base interface
 */
export interface WebhookEvent {
  /**
   * Event identifier
   */
  id: string;

  /**
   * Event type
   */
  event: WebhookEventType;

  /**
   * Creation timestamp
   */
  created_at: string;

  /**
   * Event data
   */
  data: Record<string, any>;
}
