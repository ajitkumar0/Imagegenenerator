/**
 * Usage & Credits API Functions
 *
 * Handles credit tracking, usage statistics, and analytics
 */

import apiClient from '../api-client';
import { UsageStats } from '../types/api';

// ============================================================================
// Current Usage
// ============================================================================

/**
 * Get current usage statistics
 *
 * @returns Usage stats for current billing period
 */
export async function getCurrentUsage(): Promise<UsageStats> {
  return await apiClient.getUsageStats();
}

/**
 * Get remaining credits
 *
 * @returns Number of credits remaining (-1 for unlimited)
 */
export async function getCreditsRemaining(): Promise<number> {
  const usage = await getCurrentUsage();
  return usage.credits_remaining;
}

/**
 * Check if user has enough credits
 *
 * @param required - Credits required
 * @returns True if user has enough credits or unlimited
 */
export async function hasEnoughCredits(required: number): Promise<boolean> {
  const usage = await getCurrentUsage();

  // Unlimited credits
  if (usage.is_unlimited) {
    return true;
  }

  return usage.credits_remaining >= required;
}

// ============================================================================
// Usage Analytics
// ============================================================================

/**
 * Get usage history
 *
 * @param startDate - Start date (optional)
 * @param endDate - End date (optional)
 * @returns Usage history data
 */
export async function getUsageHistory(
  startDate?: string,
  endDate?: string
): Promise<{
  daily: Array<{ date: string; credits_used: number; generations: number }>;
  total_credits_used: number;
  total_generations: number;
}> {
  const response = await apiClient.request<{
    daily: Array<{ date: string; credits_used: number; generations: number }>;
    total_credits_used: number;
    total_generations: number;
  }>({
    method: 'GET',
    url: '/subscriptions/usage/history',
    params: {
      start_date: startDate,
      end_date: endDate,
    },
  });

  return response;
}

/**
 * Get model usage breakdown
 *
 * @returns Usage by model type
 */
export async function getModelUsage(): Promise<{
  models: Array<{
    model: string;
    count: number;
    credits_used: number;
    percentage: number;
  }>;
}> {
  const response = await apiClient.request<{
    models: Array<{
      model: string;
      count: number;
      credits_used: number;
      percentage: number;
    }>;
  }>({
    method: 'GET',
    url: '/subscriptions/usage/models',
  });

  return response;
}

// ============================================================================
// Credit Calculations
// ============================================================================

/**
 * Calculate cost for generation
 *
 * @param model - Model name
 * @param numImages - Number of images
 * @returns Credit cost
 */
export function calculateGenerationCost(
  model: string,
  numImages = 1
): number {
  const costs: Record<string, number> = {
    'flux-schnell': 1,
    'flux-dev': 2,
    'flux-1.1-pro': 5,
  };

  const costPerImage = costs[model] || 1;
  return costPerImage * numImages;
}

/**
 * Estimate credits needed for month
 *
 * @param generationsPerDay - Average generations per day
 * @param model - Primary model used
 * @returns Estimated monthly credits
 */
export function estimateMonthlyCredits(
  generationsPerDay: number,
  model: string
): number {
  const daysInMonth = 30;
  const costPerGeneration = calculateGenerationCost(model);
  return generationsPerDay * daysInMonth * costPerGeneration;
}

// ============================================================================
// Usage Warnings
// ============================================================================

/**
 * Check if user is approaching credit limit
 *
 * @param threshold - Warning threshold (percentage)
 * @returns Warning info if approaching limit
 */
export async function checkCreditWarning(
  threshold = 80
): Promise<{
  warning: boolean;
  percentage: number;
  remaining: number;
  message?: string;
}> {
  const usage = await getCurrentUsage();

  if (usage.is_unlimited) {
    return {
      warning: false,
      percentage: 0,
      remaining: -1,
    };
  }

  const percentage = usage.usage_percentage;
  const remaining = usage.credits_remaining;

  if (percentage >= threshold) {
    return {
      warning: true,
      percentage,
      remaining,
      message: `You have used ${percentage.toFixed(0)}% of your monthly credits. ${remaining} credits remaining.`,
    };
  }

  return {
    warning: false,
    percentage,
    remaining,
  };
}

/**
 * Get days until credit reset
 *
 * @returns Days until next billing period
 */
export async function getDaysUntilReset(): Promise<number> {
  const usage = await getCurrentUsage();
  const periodEnd = new Date(usage.period_end);
  const now = new Date();
  const diffTime = periodEnd.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  return Math.max(0, diffDays);
}

// ============================================================================
// Recommendations
// ============================================================================

/**
 * Get tier recommendation based on usage
 *
 * @returns Recommended tier and reason
 */
export async function getTierRecommendation(): Promise<{
  recommended_tier: string;
  reason: string;
  savings?: number;
}> {
  const usage = await getCurrentUsage();
  const currentTier = usage.tier;

  // If unlimited, no need to upgrade
  if (usage.is_unlimited) {
    return {
      recommended_tier: currentTier,
      reason: 'You have unlimited credits on your current plan.',
    };
  }

  // Get usage percentage
  const usagePercent = usage.usage_percentage;

  // Frequently running out
  if (usagePercent >= 90) {
    if (currentTier === 'free') {
      return {
        recommended_tier: 'basic',
        reason: 'You are using 90%+ of your free credits. Upgrade to Basic for 200 credits/month.',
      };
    } else if (currentTier === 'basic') {
      return {
        recommended_tier: 'premium',
        reason: 'You are using 90%+ of your credits. Upgrade to Premium for unlimited generations.',
      };
    }
  }

  // Moderate usage
  if (usagePercent >= 70 && currentTier === 'free') {
    return {
      recommended_tier: 'basic',
      reason: 'You are using 70%+ of your free credits. Consider upgrading to Basic.',
    };
  }

  // Current tier is appropriate
  return {
    recommended_tier: currentTier,
    reason: 'Your current plan fits your usage pattern.',
  };
}

// ============================================================================
// Export Helpers
// ============================================================================

/**
 * Export usage data as CSV
 *
 * @param startDate - Start date
 * @param endDate - End date
 * @returns CSV file download
 */
export async function exportUsageCSV(
  startDate?: string,
  endDate?: string
): Promise<void> {
  try {
    const response = await apiClient.request<Blob>({
      method: 'GET',
      url: '/subscriptions/usage/export',
      params: {
        start_date: startDate,
        end_date: endDate,
        format: 'csv',
      },
      responseType: 'blob',
    });

    // Create download link
    const url = window.URL.createObjectURL(response);
    const link = document.createElement('a');
    link.href = url;
    link.download = `usage-${startDate || 'all'}-to-${endDate || 'now'}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Failed to export usage:', error);
    throw new Error('Failed to export usage data');
  }
}

// ============================================================================
// Quota Management
// ============================================================================

/**
 * Check if operation would exceed quota
 *
 * @param creditsNeeded - Credits needed for operation
 * @returns Whether operation is allowed and reason
 */
export async function checkQuota(
  creditsNeeded: number
): Promise<{
  allowed: boolean;
  reason?: string;
  credits_remaining: number;
}> {
  const usage = await getCurrentUsage();

  if (usage.is_unlimited) {
    return {
      allowed: true,
      credits_remaining: -1,
    };
  }

  const hasCredits = usage.credits_remaining >= creditsNeeded;

  if (!hasCredits) {
    return {
      allowed: false,
      reason: `Insufficient credits. Required: ${creditsNeeded}, Available: ${usage.credits_remaining}`,
      credits_remaining: usage.credits_remaining,
    };
  }

  return {
    allowed: true,
    credits_remaining: usage.credits_remaining,
  };
}
