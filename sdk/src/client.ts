/**
 * NexaPay Client
 * Main client class for interacting with the NexaPay API
 */

import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from "axios";
import {
  NexaPayConfig,
  RequestOptions,
  ApiResponse,
  ApiError,
  isApiResponse,
  extractResponseData,
} from "./types";
import {
  PaymentIntentsResource,
  RefundsResource,
  PayoutsResource,
  WebhooksResource,
  BalanceResource,
  TransactionsResource,
  DeveloperResource,
} from "./resources";

/**
 * Main client class for NexaPay API
 */
export class NexaPayClient {
  /**
   * Axios HTTP client instance
   */
  private readonly httpClient: AxiosInstance;

  /**
   * Configuration
   */
  private readonly config: NexaPayConfig;

  /**
   * Resources
   */
  public readonly paymentIntents: PaymentIntentsResource;
  public readonly refunds: RefundsResource;
  public readonly payouts: PayoutsResource;
  public readonly webhooks: WebhooksResource;
  public readonly balance: BalanceResource;
  public readonly transactions: TransactionsResource;
  public readonly developer: DeveloperResource;

  /**
   * Create a new NexaPay client
   * @param config Configuration for the client
   */
  constructor(config: NexaPayConfig) {
    // API key is now optional - some endpoints don't require authentication
    // Validation happens at the API level, not in the SDK

    // Set default configuration — baseURL from env var, then config, then default
    const defaultBaseURL = process.env.NEXAPAY_API_URL || "https://backend.nexapay.space";

    this.config = {
      baseURL: config.baseURL || defaultBaseURL,
      timeout: config.timeout || 30000,
      ...config,
    };

    // Build headers based on whether API key is provided
    const baseHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": `NexaPay-Node-SDK/0.1.2`,
      ...this.config.headers,
    };

    // Add API key header only if provided
    if (this.config.apiKey) {
      baseHeaders["X-API-Key"] = this.config.apiKey;
    }

    // Initialize HTTP client
    this.httpClient = axios.create({
      baseURL: this.config.baseURL,
      timeout: this.config.timeout,
      headers: baseHeaders,
    });

    // Add response interceptor for error handling
    this.httpClient.interceptors.response.use(
      (response: AxiosResponse) => response,
      (error: any) => {
        return this.handleError(error);
      },
    );

    // Initialize resources
    this.paymentIntents = new PaymentIntentsResource(this);
    this.refunds = new RefundsResource(this);
    this.payouts = new PayoutsResource(this);
    this.webhooks = new WebhooksResource(this);
    this.balance = new BalanceResource(this);
    this.transactions = new TransactionsResource(this);
    this.developer = new DeveloperResource(this);
  }

  /**
   * Get the current configuration
   */
  public getConfig(): NexaPayConfig {
    return { ...this.config };
  }

  /**
   * Get the base URL
   */
  public getBaseURL(): string {
    return this.config.baseURL || process.env.NEXAPAY_API_URL || "https://backend.nexapay.space";
  }

  /**
   * Make a request to the NexaPay API
   * @param method HTTP method
   * @param path API path
   * @param data Request body (optional)
   * @param options Request options (optional)
   */
  public async request<T = any>(
    method: string,
    path: string,
    data?: any,
    options?: RequestOptions,
  ): Promise<ApiResponse<T>> {
    const requestConfig: AxiosRequestConfig = {
      method,
      url: path,
      data,
      timeout: options?.timeout || this.config.timeout,
    };

    // Merge headers - options headers override config headers
    const headers: Record<string, string> = { ...this.config.headers };
    if (this.config.apiKey && !headers["X-API-Key"]) {
      headers["X-API-Key"] = this.config.apiKey;
    }
    if (options?.headers) {
      Object.assign(headers, options.headers);
    }
    requestConfig.headers = headers;

    try {
      const response = await this.httpClient.request(requestConfig);

      // Normalize the response to ApiResponse format
      return this.transformToApiResponse<T>(response.data, false);
    } catch (error: any) {
      // Error is already processed by interceptor, but we need to ensure it's properly formatted
      if (error && typeof error === "object" && "response" in error) {
        const axiosError = error as any;
        if (axiosError.response && axiosError.response.data) {
          return this.transformToApiResponse<T>(axiosError.response.data, true);
        }
      }

      // Fallback error - create ApiResponse format
      const errorMessage = error?.message || "Unknown error occurred";
      return {
        success: false,
        error: errorMessage,
        details: error,
      };
    }
  }

  /**
   * Handle API errors
   * @param error Axios error
   */
  private handleError(error: any): Promise<never> {
    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      const { status, data } = error.response;

      // Extract error message from different possible formats
      let message = `HTTP ${status}`;

      if (data && typeof data === "object") {
        if (data.error && typeof data.error === "string") {
          message = data.error;
        } else if (data.message && typeof data.message === "string") {
          message = data.message;
        } else if (typeof data === "string") {
          message = data;
        }
      }

      throw this.createError(status, message, data);
    } else if (error.request) {
      // The request was made but no response was received
      throw this.createError(
        0,
        "No response received from server",
        error.request,
      );
    } else {
      // Something happened in setting up the request that triggered an Error
      throw this.createError(0, error.message || "Request setup failed", error);
    }
  }

  /**
   * Create a standardized error object
   * @param statusCode HTTP status code
   * @param message Error message
   * @param details Additional error details
   */
  private createError(
    statusCode: number,
    message: string,
    details?: any,
  ): ApiError {
    const error: ApiError = {
      statusCode,
      message,
      details,
    };

    // Extract request ID if available
    if (details?.headers?.["x-request-id"]) {
      error.requestId = details.headers["x-request-id"];
    }

    return error;
  }

  /**
   * Transform any response to proper ApiResponse format
   * Handles both proper ApiResponse objects and hybrid responses
   * @param response Raw response data
   * @param isError Whether this is an error response
   */
  private transformToApiResponse<T>(
    response: any,
    isError: boolean = false,
  ): ApiResponse<T> {
    // Handle null/undefined
    if (response == null) {
      return {
        success: !isError,
        error: isError ? "Null response" : undefined,
        data: response as T,
      };
    }

    // Handle primitive types (string, number, boolean)
    if (typeof response !== "object") {
      if (isError) {
        return {
          success: false,
          error: String(response),
          data: response as T,
        };
      } else {
        return {
          success: true,
          data: response as T,
        };
      }
    }

    // For object responses, check if it looks like an ApiResponse
    const hasSuccess =
      "success" in response && typeof response.success === "boolean";
    const hasError = "error" in response && typeof response.error === "string";
    const hasData = "data" in response;

    if (hasSuccess) {
      // This looks like an ApiResponse or hybrid format
      if (hasData) {
        // Proper ApiResponse with data field
        return response as ApiResponse<T>;
      } else {
        // Hybrid format: success field at root with other fields
        // Extract all fields except success, error, metadata, details into data
        const { success, error, metadata, details, ...otherFields } = response;
        const data =
          Object.keys(otherFields).length > 0 ? otherFields : undefined;

        return {
          success,
          error: hasError ? error : isError ? "Unknown error" : undefined,
          data: data as T,
          metadata,
          details,
        };
      }
    } else {
      // Not an ApiResponse format - wrap it
      if (isError) {
        let errorMessage = "Unknown error";
        if (typeof response.error === "string") {
          errorMessage = response.error;
        } else if (typeof response.message === "string") {
          errorMessage = response.message;
        }

        return {
          success: false,
          error: errorMessage,
          data: response as T,
        };
      } else {
        return {
          success: true,
          data: response as T,
        };
      }
    }
  }

  /**
   * Make a GET request
   * @param path API path
   * @param options Request options (optional)
   */
  public async get<T = any>(
    path: string,
    options?: RequestOptions,
  ): Promise<ApiResponse<T>> {
    return this.request<T>("GET", path, undefined, options);
  }

  /**
   * Make a POST request
   * @param path API path
   * @param data Request body
   * @param options Request options (optional)
   */
  public async post<T = any>(
    path: string,
    data?: any,
    options?: RequestOptions,
  ): Promise<ApiResponse<T>> {
    return this.request<T>("POST", path, data, options);
  }

  /**
   * Make a PUT request
   * @param path API path
   * @param data Request body
   * @param options Request options (optional)
   */
  public async put<T = any>(
    path: string,
    data?: any,
    options?: RequestOptions,
  ): Promise<ApiResponse<T>> {
    return this.request<T>("PUT", path, data, options);
  }

  /**
   * Make a PATCH request
   * @param path API path
   * @param data Request body
   * @param options Request options (optional)
   */
  public async patch<T = any>(
    path: string,
    data?: any,
    options?: RequestOptions,
  ): Promise<ApiResponse<T>> {
    return this.request<T>("PATCH", path, data, options);
  }

  /**
   * Make a DELETE request
   * @param path API path
   * @param options Request options (optional)
   */
  public async delete<T = any>(
    path: string,
    options?: RequestOptions,
  ): Promise<ApiResponse<T>> {
    return this.request<T>("DELETE", path, undefined, options);
  }

  /**
   * Verify webhook signature
   * @param payload Raw webhook payload
   * @param signature Signature from X-NexaPay-Signature header
   * @param secret Webhook signing secret
   */
  public verifyWebhookSignature(
    payload: string | Buffer,
    signature: string,
    secret: string,
  ): boolean {
    // Convert payload to string if it's a Buffer
    const payloadStr = Buffer.isBuffer(payload)
      ? payload.toString("utf-8")
      : payload;

    // Calculate expected signature
    const crypto = require("crypto");
    const expectedSignature = crypto
      .createHash("sha256")
      .update(secret + "." + payloadStr)
      .digest("hex");

    // Compare signatures (use constant-time comparison to prevent timing attacks)
    return crypto.timingSafeEqual(
      Buffer.from(signature, "hex"),
      Buffer.from(expectedSignature, "hex"),
    );
  }

  /**
   * Parse webhook event
   * @param payload Raw webhook payload
   * @param signature Signature from X-NexaPay-Signature header
   * @param secret Webhook signing secret
   */
  public parseWebhookEvent(
    payload: string | Buffer,
    signature: string,
    secret: string,
  ): any {
    // Verify signature first
    if (!this.verifyWebhookSignature(payload, signature, secret)) {
      throw this.createError(400, "Invalid webhook signature");
    }

    // Parse payload
    const payloadStr = Buffer.isBuffer(payload)
      ? payload.toString("utf-8")
      : payload;

    try {
      return JSON.parse(payloadStr);
    } catch (error: any) {
      throw this.createError(400, "Invalid webhook payload", error.message);
    }
  }

  /**
   * Extract data from any API response (handles both ApiResponse and raw data)
   * @param response Response from any API call
   */
  public extractData<T>(response: any): T | undefined {
    return extractResponseData<T>(response);
  }

  /**
   * Check if a response indicates success
   * @param response Response from any API call
   */
  public isSuccess(response: any): boolean {
    if (isApiResponse(response)) {
      return response.success === true;
    }
    // Raw responses without success field are considered successful
    return true;
  }

  /**
   * Get error message from a response
   * @param response Response from any API call
   */
  public getErrorMessage(response: any): string | undefined {
    if (isApiResponse(response) && response.error) {
      return response.error;
    }
    return undefined;
  }
}
