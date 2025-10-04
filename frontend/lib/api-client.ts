/**
 * API Client for Backend Communication
 *
 * Features:
 * - Automatic JWT token injection
 * - Request/response interceptors
 * - Error handling with retry logic
 * - Type-safe API calls
 * - Environment-based configuration
 */

import axios, {
  AxiosInstance,
  AxiosError,
  AxiosRequestConfig,
  InternalAxiosRequestConfig,
} from 'axios';
import {
  APIError,
  CheckoutRequest,
  CheckoutResponse,
  Generation,
  GenerationListParams,
  GenerationListResponse,
  GenerationRequest,
  GenerationResponse,
  HealthCheckResponse,
  PortalRequest,
  PortalResponse,
  SubscriptionResponse,
  SubscriptionTierInfo,
  UsageStats,
  UserProfile,
} from './types/api';

// ============================================================================
// Configuration
// ============================================================================

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const API_VERSION = '/api/v1';
const REQUEST_TIMEOUT = 30000; // 30 seconds
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second

// ============================================================================
// Token Management
// ============================================================================

class TokenManager {
  private static readonly TOKEN_KEY = 'auth_token';
  private static readonly REFRESH_TOKEN_KEY = 'refresh_token';

  static getToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(this.TOKEN_KEY);
  }

  static setToken(token: string): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(this.TOKEN_KEY, token);
  }

  static getRefreshToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(this.REFRESH_TOKEN_KEY);
  }

  static setRefreshToken(token: string): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(this.REFRESH_TOKEN_KEY, token);
  }

  static clearTokens(): void {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.REFRESH_TOKEN_KEY);
  }
}

// ============================================================================
// API Client Class
// ============================================================================

class APIClient {
  private client: AxiosInstance;
  private isRefreshing = false;
  private failedQueue: Array<{
    resolve: (token: string) => void;
    reject: (error: Error) => void;
  }> = [];

  constructor() {
    this.client = axios.create({
      baseURL: `${API_BASE_URL}${API_VERSION}`,
      timeout: REQUEST_TIMEOUT,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.setupInterceptors();
  }

  // ==========================================================================
  // Interceptor Setup
  // ==========================================================================

  private setupInterceptors(): void {
    // Request interceptor - add auth token
    this.client.interceptors.request.use(
      (config: InternalAxiosRequestConfig) => {
        const token = TokenManager.getToken();

        if (token && config.headers) {
          config.headers.Authorization = `Bearer ${token}`;
        }

        // Add request ID for tracking
        config.headers['X-Request-ID'] = this.generateRequestId();

        return config;
      },
      (error: AxiosError) => {
        return Promise.reject(error);
      }
    );

    // Response interceptor - handle errors and retries
    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError<APIError>) => {
        const originalRequest = error.config as AxiosRequestConfig & {
          _retry?: boolean;
          _retryCount?: number;
        };

        // Handle 401 Unauthorized - token expired
        if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
          if (this.isRefreshing) {
            // Queue requests while refreshing
            return new Promise((resolve, reject) => {
              this.failedQueue.push({ resolve, reject });
            })
              .then((token) => {
                if (originalRequest.headers) {
                  originalRequest.headers.Authorization = `Bearer ${token}`;
                }
                return this.client(originalRequest);
              })
              .catch((err) => Promise.reject(err));
          }

          originalRequest._retry = true;
          this.isRefreshing = true;

          try {
            const newToken = await this.refreshAccessToken();
            TokenManager.setToken(newToken);

            // Retry all queued requests
            this.failedQueue.forEach((prom) => prom.resolve(newToken));
            this.failedQueue = [];

            if (originalRequest.headers) {
              originalRequest.headers.Authorization = `Bearer ${newToken}`;
            }

            return this.client(originalRequest);
          } catch (refreshError) {
            this.failedQueue.forEach((prom) => prom.reject(refreshError as Error));
            this.failedQueue = [];

            // Redirect to login
            this.handleAuthenticationError();
            return Promise.reject(refreshError);
          } finally {
            this.isRefreshing = false;
          }
        }

        // Handle 429 Rate Limit - retry with exponential backoff
        if (error.response?.status === 429 && originalRequest) {
          const retryCount = originalRequest._retryCount || 0;

          if (retryCount < MAX_RETRIES) {
            originalRequest._retryCount = retryCount + 1;
            const delay = RETRY_DELAY * Math.pow(2, retryCount);

            await this.sleep(delay);
            return this.client(originalRequest);
          }
        }

        // Handle 5xx Server Errors - retry with backoff
        if (
          error.response?.status &&
          error.response.status >= 500 &&
          error.response.status < 600 &&
          originalRequest
        ) {
          const retryCount = originalRequest._retryCount || 0;

          if (retryCount < MAX_RETRIES) {
            originalRequest._retryCount = retryCount + 1;
            const delay = RETRY_DELAY * Math.pow(2, retryCount);

            await this.sleep(delay);
            return this.client(originalRequest);
          }
        }

        return Promise.reject(this.normalizeError(error));
      }
    );
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  private generateRequestId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async refreshAccessToken(): Promise<string> {
    // This will be implemented with MSAL.js
    // For now, throw error to trigger re-authentication
    throw new Error('Token refresh not implemented');
  }

  private handleAuthenticationError(): void {
    TokenManager.clearTokens();

    // Emit event for auth context to handle
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('auth:unauthorized'));
    }
  }

  private normalizeError(error: AxiosError<APIError>): APIError {
    if (error.response?.data) {
      return error.response.data;
    }

    if (error.message === 'Network Error') {
      return {
        detail: 'Network error. Please check your connection.',
        status_code: 0,
        error_code: 'NETWORK_ERROR',
      };
    }

    if (error.code === 'ECONNABORTED') {
      return {
        detail: 'Request timeout. Please try again.',
        status_code: 408,
        error_code: 'TIMEOUT',
      };
    }

    return {
      detail: error.message || 'An unexpected error occurred',
      status_code: error.response?.status || 500,
      error_code: 'UNKNOWN_ERROR',
    };
  }

  // ==========================================================================
  // Authentication Endpoints
  // ==========================================================================

  async getCurrentUser(): Promise<UserProfile> {
    const response = await this.client.get<UserProfile>('/auth/me');
    return response.data;
  }

  // ==========================================================================
  // Subscription Endpoints
  // ==========================================================================

  async getSubscription(): Promise<SubscriptionResponse> {
    const response = await this.client.get<SubscriptionResponse>('/subscriptions');
    return response.data;
  }

  async getSubscriptionTiers(): Promise<{ tiers: SubscriptionTierInfo[] }> {
    const response = await this.client.get<{ tiers: SubscriptionTierInfo[] }>(
      '/subscriptions/tiers'
    );
    return response.data;
  }

  async getUsageStats(): Promise<UsageStats> {
    const response = await this.client.get<UsageStats>('/subscriptions/usage');
    return response.data;
  }

  async createCheckoutSession(
    request: CheckoutRequest
  ): Promise<CheckoutResponse> {
    const response = await this.client.post<CheckoutResponse>(
      '/subscriptions/checkout',
      request
    );
    return response.data;
  }

  async createPortalSession(
    request: PortalRequest = {}
  ): Promise<PortalResponse> {
    const response = await this.client.post<PortalResponse>(
      '/subscriptions/portal',
      request
    );
    return response.data;
  }

  async cancelSubscription(
    atPeriodEnd = true
  ): Promise<{ success: boolean; message: string }> {
    const response = await this.client.delete<{ success: boolean; message: string }>(
      `/subscriptions?at_period_end=${atPeriodEnd}`
    );
    return response.data;
  }

  // ==========================================================================
  // Generation Endpoints
  // ==========================================================================

  async createGeneration(request: GenerationRequest): Promise<GenerationResponse> {
    const response = await this.client.post<GenerationResponse>(
      '/generate/text-to-image',
      request
    );
    return response.data;
  }

  async getGeneration(generationId: string): Promise<Generation> {
    const response = await this.client.get<Generation>(
      `/generate/${generationId}`
    );
    return response.data;
  }

  async listGenerations(
    params: GenerationListParams = {}
  ): Promise<GenerationListResponse> {
    const response = await this.client.get<GenerationListResponse>('/generate', {
      params,
    });
    return response.data;
  }

  async deleteGeneration(generationId: string): Promise<{ success: boolean }> {
    const response = await this.client.delete<{ success: boolean }>(
      `/generate/${generationId}`
    );
    return response.data;
  }

  async cancelGeneration(generationId: string): Promise<{ success: boolean }> {
    const response = await this.client.post<{ success: boolean }>(
      `/generate/${generationId}/cancel`
    );
    return response.data;
  }

  // ==========================================================================
  // Health Check
  // ==========================================================================

  async healthCheck(): Promise<HealthCheckResponse> {
    const response = await this.client.get<HealthCheckResponse>('/health');
    return response.data;
  }

  // ==========================================================================
  // Custom Request Method
  // ==========================================================================

  async request<T>(config: AxiosRequestConfig): Promise<T> {
    const response = await this.client.request<T>(config);
    return response.data;
  }
}

// ============================================================================
// Export Singleton Instance
// ============================================================================

const apiClient = new APIClient();
export default apiClient;

// Export TokenManager for auth context
export { TokenManager };

// Export types
export type { APIError };
