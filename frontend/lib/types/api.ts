/**
 * TypeScript types for API requests and responses
 *
 * Provides type safety for all backend API interactions
 */

// ============================================================================
// User Types
// ============================================================================

export interface User {
  id: string;
  email: string;
  name?: string;
  azure_ad_id: string;
  stripe_customer_id?: string;
  created_at: string;
  updated_at: string;
}

export interface UserProfile extends User {
  subscription: Subscription;
  total_generations: number;
  total_credits_used: number;
}

// ============================================================================
// Subscription Types
// ============================================================================

export type SubscriptionTier = 'free' | 'basic' | 'premium';
export type SubscriptionStatus = 'active' | 'trialing' | 'past_due' | 'canceled' | 'unpaid';

export interface Subscription {
  id: string;
  user_id: string;
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  stripe_subscription_id?: string;
  stripe_customer_id?: string;
  credits_per_month: number;
  credits_remaining: number;
  credits_used_this_period: number;
  is_unlimited: boolean;
  current_period_start: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
  canceled_at?: string;
  created_at: string;
  updated_at: string;
}

export interface SubscriptionTierInfo {
  tier: SubscriptionTier;
  name: string;
  price_monthly: number;
  credits_per_month: number;
  is_unlimited: boolean;
  models: string[];
  features: string[];
  max_concurrent: number;
  priority: boolean;
  api_access: boolean;
  watermark: boolean;
}

export interface SubscriptionResponse {
  tier: string;
  status: string;
  credits_remaining: number;
  credits_per_month: number;
  is_unlimited: boolean;
  current_period_end: string;
  cancel_at_period_end: boolean;
  features: string[];
}

export interface UsageStats {
  tier: string;
  credits_remaining: number;
  credits_used: number;
  credits_per_month: number;
  is_unlimited: boolean;
  usage_percentage: number;
  period_end: string;
}

// ============================================================================
// Checkout & Payment Types
// ============================================================================

export interface CheckoutRequest {
  tier: SubscriptionTier;
  success_url?: string;
  cancel_url?: string;
}

export interface CheckoutResponse {
  checkout_url: string;
  session_id: string;
}

export interface PortalRequest {
  return_url?: string;
}

export interface PortalResponse {
  portal_url: string;
}

// ============================================================================
// Generation Types
// ============================================================================

export type GenerationStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
export type FluxModel = 'flux-schnell' | 'flux-dev' | 'flux-1.1-pro';

export interface GenerationRequest {
  prompt: string;
  negative_prompt?: string;
  image_url?: string; // For image-to-image transformations
  prompt_strength?: number; // 0-1, controls transformation strength for img2img
  model?: FluxModel;
  width?: number;
  height?: number;
  num_inference_steps?: number;
  guidance_scale?: number;
  seed?: number;
  output_format?: 'png' | 'jpg' | 'webp';
}

export interface Generation {
  id: string;
  user_id: string;
  prompt: string;
  negative_prompt?: string;
  model: FluxModel;
  status: GenerationStatus;
  replicate_prediction_id?: string;
  result_urls: string[];
  blob_urls: string[];
  width: number;
  height: number;
  num_inference_steps: number;
  guidance_scale: number;
  seed?: number;
  error_message?: string;
  processing_time_ms?: number;
  cost_credits: number;
  created_at: string;
  updated_at: string;
  started_at?: string;
  completed_at?: string;
}

export interface GenerationResponse {
  generation_id: string;
  status: GenerationStatus;
  message: string;
  estimated_time_seconds?: number;
}

export interface GenerationListResponse {
  generations: Generation[];
  total: number;
  page: number;
  page_size: number;
  has_more: boolean;
}

// ============================================================================
// Error Types
// ============================================================================

export interface APIError {
  detail: string;
  status_code: number;
  error_code?: string;
}

export interface ValidationError {
  loc: (string | number)[];
  msg: string;
  type: string;
}

export interface HTTPValidationError {
  detail: ValidationError[];
}

// ============================================================================
// Response Wrappers
// ============================================================================

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  has_more: boolean;
}

export interface APIResponse<T> {
  data: T;
  success: boolean;
  message?: string;
}

// ============================================================================
// Query Parameters
// ============================================================================

export interface PaginationParams {
  page?: number;
  page_size?: number;
}

export interface GenerationListParams extends PaginationParams {
  status?: GenerationStatus;
  model?: FluxModel;
  order_by?: 'created_at' | 'updated_at';
  order?: 'asc' | 'desc';
}

// ============================================================================
// WebSocket Types (for real-time updates)
// ============================================================================

export interface GenerationUpdate {
  generation_id: string;
  status: GenerationStatus;
  progress?: number;
  message?: string;
  blob_urls?: string[];
  error_message?: string;
}

export interface WebSocketMessage {
  type: 'generation_update' | 'credit_update' | 'error';
  data: GenerationUpdate | UsageStats | APIError;
}

// ============================================================================
// Health Check
// ============================================================================

export interface HealthCheckResponse {
  status: 'healthy' | 'unhealthy';
  version: string;
  timestamp: string;
  services: {
    database: boolean;
    storage: boolean;
    queue: boolean;
    replicate: boolean;
  };
}
