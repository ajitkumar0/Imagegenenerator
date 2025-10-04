/**
 * Subscription Management API Functions
 *
 * Handles subscription, billing, and Stripe integration
 */

import apiClient from '../api-client';
import {
  CheckoutRequest,
  CheckoutResponse,
  PortalRequest,
  PortalResponse,
  SubscriptionResponse,
  SubscriptionTierInfo,
} from '../types/api';

// ============================================================================
// Subscription Info
// ============================================================================

/**
 * Get current subscription details
 *
 * @returns Current subscription info
 */
export async function getSubscription(): Promise<SubscriptionResponse> {
  return await apiClient.getSubscription();
}

/**
 * Get available subscription tiers
 *
 * @returns List of all tiers with features and pricing
 */
export async function getSubscriptionTiers(): Promise<SubscriptionTierInfo[]> {
  const response = await apiClient.getSubscriptionTiers();
  return response.tiers;
}

// ============================================================================
// Stripe Checkout
// ============================================================================

/**
 * Create Stripe checkout session and redirect
 *
 * @param tier - Subscription tier (basic or premium)
 * @param successUrl - URL to redirect after successful payment
 * @param cancelUrl - URL to redirect if user cancels
 */
export async function createCheckoutSession(
  tier: 'basic' | 'premium',
  successUrl?: string,
  cancelUrl?: string
): Promise<void> {
  const request: CheckoutRequest = {
    tier,
    success_url:
      successUrl ||
      `${window.location.origin}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: cancelUrl || `${window.location.origin}/pricing`,
  };

  const response: CheckoutResponse = await apiClient.createCheckoutSession(request);

  // Redirect to Stripe Checkout
  window.location.href = response.checkout_url;
}

/**
 * Get checkout session URL without redirect
 *
 * @param tier - Subscription tier
 * @param successUrl - Success redirect URL
 * @param cancelUrl - Cancel redirect URL
 * @returns Checkout session data
 */
export async function getCheckoutSessionUrl(
  tier: 'basic' | 'premium',
  successUrl?: string,
  cancelUrl?: string
): Promise<CheckoutResponse> {
  const request: CheckoutRequest = {
    tier,
    success_url: successUrl,
    cancel_url: cancelUrl,
  };

  return await apiClient.createCheckoutSession(request);
}

// ============================================================================
// Stripe Billing Portal
// ============================================================================

/**
 * Create Stripe billing portal session and redirect
 *
 * Allows users to:
 * - Update payment method
 * - Change subscription plan
 * - Cancel subscription
 * - View invoices
 *
 * @param returnUrl - URL to return to after portal session
 */
export async function createPortalSession(returnUrl?: string): Promise<void> {
  const request: PortalRequest = {
    return_url: returnUrl || `${window.location.origin}/subscription`,
  };

  const response: PortalResponse = await apiClient.createPortalSession(request);

  // Redirect to Stripe Billing Portal
  window.location.href = response.portal_url;
}

/**
 * Get billing portal URL without redirect
 *
 * @param returnUrl - Return URL
 * @returns Portal session data
 */
export async function getPortalSessionUrl(
  returnUrl?: string
): Promise<PortalResponse> {
  const request: PortalRequest = {
    return_url: returnUrl,
  };

  return await apiClient.createPortalSession(request);
}

// ============================================================================
// Subscription Management
// ============================================================================

/**
 * Cancel subscription
 *
 * @param atPeriodEnd - If true, cancel at end of billing period (default: true)
 * @returns Cancellation confirmation
 */
export async function cancelSubscription(
  atPeriodEnd = true
): Promise<{ success: boolean; message: string; cancel_at_period_end: boolean }> {
  return await apiClient.cancelSubscription(atPeriodEnd);
}

/**
 * Reactivate cancelled subscription
 *
 * @returns Reactivation confirmation
 */
export async function reactivateSubscription(): Promise<{
  success: boolean;
  message: string;
}> {
  const response = await apiClient.request<{
    success: boolean;
    message: string;
  }>({
    method: 'POST',
    url: '/subscriptions/reactivate',
  });

  return response;
}

// ============================================================================
// Subscription Verification
// ============================================================================

/**
 * Verify subscription status after Stripe checkout
 *
 * @param sessionId - Stripe checkout session ID
 * @returns Subscription status
 */
export async function verifyCheckoutSession(
  sessionId: string
): Promise<{ success: boolean; subscription: SubscriptionResponse }> {
  const response = await apiClient.request<{
    success: boolean;
    subscription: SubscriptionResponse;
  }>({
    method: 'POST',
    url: '/subscriptions/verify-checkout',
    data: { session_id: sessionId },
  });

  return response;
}

/**
 * Check if user has active subscription
 *
 * @returns True if user has active paid subscription
 */
export async function hasActiveSubscription(): Promise<boolean> {
  try {
    const subscription = await getSubscription();
    return (
      subscription.status === 'active' &&
      (subscription.tier === 'basic' || subscription.tier === 'premium')
    );
  } catch (error) {
    return false;
  }
}

/**
 * Check if user can access specific feature
 *
 * @param feature - Feature name
 * @returns True if user's tier includes feature
 */
export async function canAccessFeature(feature: string): Promise<boolean> {
  try {
    const subscription = await getSubscription();
    const tiers = await getSubscriptionTiers();

    const currentTier = tiers.find((t) => t.tier === subscription.tier);
    if (!currentTier) return false;

    // Check if feature is in tier's features list
    return currentTier.features.some((f) =>
      f.toLowerCase().includes(feature.toLowerCase())
    );
  } catch (error) {
    return false;
  }
}

// ============================================================================
// Pricing Helpers
// ============================================================================

/**
 * Get tier by name
 *
 * @param tierName - Tier name (free, basic, premium)
 * @returns Tier information
 */
export async function getTierByName(
  tierName: string
): Promise<SubscriptionTierInfo | null> {
  const tiers = await getSubscriptionTiers();
  return tiers.find((t) => t.tier === tierName) || null;
}

/**
 * Compare two tiers
 *
 * @param tier1 - First tier name
 * @param tier2 - Second tier name
 * @returns -1 if tier1 < tier2, 0 if equal, 1 if tier1 > tier2
 */
export function compareTiers(tier1: string, tier2: string): number {
  const tierOrder = ['free', 'basic', 'premium'];
  const index1 = tierOrder.indexOf(tier1);
  const index2 = tierOrder.indexOf(tier2);

  if (index1 < index2) return -1;
  if (index1 > index2) return 1;
  return 0;
}

/**
 * Calculate savings for annual billing
 *
 * @param monthlyPrice - Monthly price
 * @returns Annual savings amount and percentage
 */
export function calculateAnnualSavings(monthlyPrice: number): {
  savings: number;
  percentage: number;
} {
  const annualPrice = monthlyPrice * 12;
  const discountRate = 0.2; // 20% discount
  const discountedAnnual = annualPrice * (1 - discountRate);
  const savings = annualPrice - discountedAnnual;
  const percentage = discountRate * 100;

  return { savings, percentage };
}
