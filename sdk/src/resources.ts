/**
 * Resource classes for NexaPay API endpoints
 */

import { NexaPayClient } from './client';
import {
  CreatePaymentIntentRequest,
  PaymentIntent,
  ConfirmPaymentIntentRequest,
  ConfirmPaymentIntentResponse,
  CreateRefundRequest,
  Refund,
  CreatePayoutRequest,
  Payout,
  CreateWebhookRequest,
  Webhook,
  WebhookDelivery,
  Balance,
  TransactionsResponse,
  DocsSnippets,
  ListParams,
  RequestOptions,
  ApiResponse
} from './types';

/**
 * Base resource class with common functionality
 */
export abstract class BaseResource {
  /**
   * Client instance
   */
  protected readonly client: NexaPayClient;

  /**
   * Resource path prefix
   */
  protected abstract readonly resourcePath: string;

  constructor(client: NexaPayClient) {
    this.client = client;
  }

  /**
   * Build full path for resource endpoint
   * @param endpoint Endpoint path
   */
  protected buildPath(endpoint: string = ''): string {
    return `${this.resourcePath}${endpoint}`;
  }
}

/**
 * Payment Intents resource for payment processing
 */
export class PaymentIntentsResource extends BaseResource {
  protected readonly resourcePath = '/gateway/v1/intents';

  /**
   * Create a new payment intent
   * @param data Payment intent creation data
   * @param options Request options
   */
  async create(
    data: CreatePaymentIntentRequest,
    options?: RequestOptions
  ): Promise<ApiResponse<PaymentIntent>> {
    return this.client.post(this.resourcePath, data, options);
  }

  /**
   * Retrieve a payment intent by ID
   * @param intentId Payment intent ID
   * @param options Request options
   */
  async get(
    intentId: string,
    options?: RequestOptions
  ): Promise<ApiResponse<PaymentIntent>> {
    return this.client.get(`${this.resourcePath}/${intentId}`, options);
  }

  /**
   * Confirm a payment intent with card details
   * @param intentId Payment intent ID
   * @param data Card details for confirmation
   * @param options Request options
   */
  async confirm(
    intentId: string,
    data: ConfirmPaymentIntentRequest,
    options?: RequestOptions
  ): Promise<ApiResponse<ConfirmPaymentIntentResponse>> {
    return this.client.post(
      `${this.resourcePath}/${intentId}/confirm`,
      data,
      options
    );
  }
}

/**
 * Refunds resource for refund operations
 */
export class RefundsResource extends BaseResource {
  protected readonly resourcePath = '/gateway/v1/refunds';

  /**
   * Create a refund for a payment intent
   * @param data Refund creation data
   * @param options Request options
   */
  async create(
    data: CreateRefundRequest,
    options?: RequestOptions
  ): Promise<ApiResponse<Refund>> {
    return this.client.post(this.resourcePath, data, options);
  }
}

/**
 * Payouts resource for merchant payout operations
 */
export class PayoutsResource extends BaseResource {
  protected readonly resourcePath = '/gateway/v1/payout';

  /**
   * Create a payout request
   * @param data Payout creation data
   * @param options Request options
   */
  async create(
    data: CreatePayoutRequest,
    options?: RequestOptions
  ): Promise<ApiResponse<Payout>> {
    return this.client.post(this.resourcePath, data, options);
  }
}

/**
 * Webhooks resource for webhook management
 */
export class WebhooksResource extends BaseResource {
  protected readonly resourcePath = '/gateway/v1/webhooks';

  /**
   * Create a new webhook
   * @param data Webhook creation data
   * @param options Request options
   */
  async create(
    data: CreateWebhookRequest,
    options?: RequestOptions
  ): Promise<ApiResponse<Webhook>> {
    return this.client.post(this.resourcePath, data, options);
  }

  /**
   * List all webhooks
   * @param options Request options
   */
  async list(options?: RequestOptions): Promise<ApiResponse<Webhook[]>> {
    return this.client.get(this.resourcePath, options);
  }

  /**
   * Get webhook delivery logs
   * @param webhookId Webhook ID
   * @param options Request options
   */
  async deliveries(
    webhookId: string,
    options?: RequestOptions
  ): Promise<ApiResponse<WebhookDelivery[]>> {
    return this.client.get(
      `${this.resourcePath}/${webhookId}/deliveries`,
      options
    );
  }

  /**
   * Test a webhook
   * @param webhookId Webhook ID
   * @param options Request options
   */
  async test(
    webhookId: string,
    options?: RequestOptions
  ): Promise<ApiResponse<any>> {
    return this.client.post(
      `${this.resourcePath}/${webhookId}/test`,
      undefined,
      options
    );
  }

  /**
   * Delete (deactivate) a webhook
   * @param webhookId Webhook ID
   * @param options Request options
   */
  async delete(
    webhookId: string,
    options?: RequestOptions
  ): Promise<ApiResponse<{ deleted: string }>> {
    return this.client.delete(`${this.resourcePath}/${webhookId}`, options);
  }
}

/**
 * Balance resource for merchant balance operations
 */
export class BalanceResource extends BaseResource {
  protected readonly resourcePath = '/gateway/v1/balance';

  /**
   * Get merchant balance
   * @param options Request options
   */
  async get(options?: RequestOptions): Promise<ApiResponse<Balance>> {
    return this.client.get(this.resourcePath, options);
  }
}

/**
 * Transactions resource for transaction history
 */
export class TransactionsResource extends BaseResource {
  protected readonly resourcePath = '/gateway/v1/transactions';

  /**
   * Get merchant transactions
   * @param options Request options
   */
  async list(options?: RequestOptions): Promise<ApiResponse<TransactionsResponse>> {
    return this.client.get(this.resourcePath, options);
  }
}

/**
 * Developer resource for developer-specific endpoints
 */
export class DeveloperResource extends BaseResource {
  protected readonly resourcePath = '/dev';

  /**
   * Get developer documentation snippets
   * @param options Request options
   */
  async docsSnippets(options?: RequestOptions): Promise<ApiResponse<DocsSnippets>> {
    return this.client.get(`${this.resourcePath}/docs/snippets`, options);
  }
}
