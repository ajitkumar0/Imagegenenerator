/**
 * Dashboard Page
 *
 * Displays user statistics, recent generations, subscription info, and credits
 */

'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth/auth-context';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import apiClient from '@/lib/api-client';
import {
  UsageStats,
  SubscriptionResponse,
  Generation,
  GenerationListParams,
} from '@/lib/types/api';
import { ErrorDisplay } from '@/components/errors/ErrorDisplay';
import { SkeletonCard, SkeletonGrid } from '@/components/loading/Skeleton';
import Link from 'next/link';

export default function DashboardPage() {
  return (
    <ProtectedRoute>
      <DashboardContent />
    </ProtectedRoute>
  );
}

function DashboardContent() {
  const { user } = useAuth();

  // State
  const [usageStats, setUsageStats] = useState<UsageStats | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionResponse | null>(null);
  const [recentGenerations, setRecentGenerations] = useState<Generation[]>([]);

  // Loading states
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [subscriptionLoading, setSubscriptionLoading] = useState(true);
  const [generationsLoading, setGenerationsLoading] = useState(true);

  // Error states
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    setLoading(true);
    setError(null);

    try {
      // Load all data in parallel
      const [statsData, subscriptionData, generationsData] = await Promise.allSettled([
        apiClient.getUsageStats().finally(() => setStatsLoading(false)),
        apiClient.getSubscription().finally(() => setSubscriptionLoading(false)),
        apiClient.getGenerations({ limit: 6, offset: 0 }).finally(() => setGenerationsLoading(false)),
      ]);

      // Handle stats
      if (statsData.status === 'fulfilled') {
        setUsageStats(statsData.value);
      }

      // Handle subscription
      if (subscriptionData.status === 'fulfilled') {
        setSubscription(subscriptionData.value);
      }

      // Handle generations
      if (generationsData.status === 'fulfilled') {
        setRecentGenerations(generationsData.value.items || []);
      }
    } catch (err) {
      console.error('Failed to load dashboard:', err);
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
          <p className="mt-2 text-gray-600">
            Welcome back, {user?.name || user?.email}!
          </p>
        </div>

        {/* Error Display */}
        {error && !loading && (
          <ErrorDisplay
            error={error}
            onRetry={loadDashboardData}
            className="mb-6"
          />
        )}

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Credits Widget */}
          <div className="lg:col-span-1">
            {statsLoading ? (
              <SkeletonCard showImage={false} />
            ) : usageStats ? (
              <CreditsWidget stats={usageStats} />
            ) : null}
          </div>

          {/* Subscription Widget */}
          <div className="lg:col-span-2">
            {subscriptionLoading ? (
              <SkeletonCard showImage={false} />
            ) : subscription ? (
              <SubscriptionWidget subscription={subscription} />
            ) : null}
          </div>
        </div>

        {/* Usage Statistics */}
        {statsLoading ? (
          <div className="mb-8">
            <SkeletonCard showImage={false} />
          </div>
        ) : usageStats ? (
          <UsageStatistics stats={usageStats} className="mb-8" />
        ) : null}

        {/* Recent Generations */}
        <div className="bg-white rounded-xl shadow-lg p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-gray-900">
              Recent Generations
            </h2>
            <Link
              href="/gallery"
              className="text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              View All →
            </Link>
          </div>

          {generationsLoading ? (
            <SkeletonGrid items={6} columns={3} />
          ) : recentGenerations.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {recentGenerations.map((generation) => (
                <GenerationCard key={generation.id} generation={generation} />
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <svg
                className="mx-auto h-12 w-12 text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
              <h3 className="mt-4 text-lg font-semibold text-gray-900">
                No generations yet
              </h3>
              <p className="mt-2 text-sm text-gray-600">
                Start creating amazing AI-generated images!
              </p>
              <Link
                href="/generate"
                className="mt-4 inline-block px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
              >
                Create Your First Image
              </Link>
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link
            href="/generate/text-to-image"
            className="block p-6 bg-white rounded-lg shadow hover:shadow-lg transition-shadow"
          >
            <div className="flex items-center space-x-3">
              <div className="flex-shrink-0 w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <svg className="w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">New Generation</h3>
                <p className="text-sm text-gray-600">Create AI image</p>
              </div>
            </div>
          </Link>

          <Link
            href="/subscription/manage"
            className="block p-6 bg-white rounded-lg shadow hover:shadow-lg transition-shadow"
          >
            <div className="flex items-center space-x-3">
              <div className="flex-shrink-0 w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                <svg className="w-6 h-6 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                </svg>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Manage Plan</h3>
                <p className="text-sm text-gray-600">View subscription</p>
              </div>
            </div>
          </Link>

          <Link
            href="/pricing"
            className="block p-6 bg-white rounded-lg shadow hover:shadow-lg transition-shadow"
          >
            <div className="flex items-center space-x-3">
              <div className="flex-shrink-0 w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Upgrade Plan</h3>
                <p className="text-sm text-gray-600">Get more credits</p>
              </div>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Credits Widget
// ============================================================================

interface CreditsWidgetProps {
  stats: UsageStats;
}

function CreditsWidget({ stats }: CreditsWidgetProps) {
  const percentage = stats.usage_percentage;
  const isLow = percentage > 80;

  return (
    <div className="bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl shadow-lg p-6 text-white">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Credits</h3>
        <svg className="w-8 h-8 opacity-80" fill="currentColor" viewBox="0 0 20 20">
          <path d="M8.433 7.418c.155-.103.346-.196.567-.267v1.698a2.305 2.305 0 01-.567-.267C8.07 8.34 8 8.114 8 8c0-.114.07-.34.433-.582zM11 12.849v-1.698c.22.071.412.164.567.267.364.243.433.468.433.582 0 .114-.07.34-.433.582a2.305 2.305 0 01-.567.267z" />
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v.092a4.535 4.535 0 00-1.676.662C6.602 6.234 6 7.009 6 8c0 .99.602 1.765 1.324 2.246.48.32 1.054.545 1.676.662v1.941c-.391-.127-.68-.317-.843-.504a1 1 0 10-1.51 1.31c.562.649 1.413 1.076 2.353 1.253V15a1 1 0 102 0v-.092a4.535 4.535 0 001.676-.662C13.398 13.766 14 12.991 14 12c0-.99-.602-1.765-1.324-2.246A4.535 4.535 0 0011 9.092V7.151c.391.127.68.317.843.504a1 1 0 101.511-1.31c-.563-.649-1.413-1.076-2.354-1.253V5z" clipRule="evenodd" />
        </svg>
      </div>

      <div className="mb-2">
        <div className="text-4xl font-bold">
          {stats.is_unlimited ? '∞' : stats.credits_remaining.toLocaleString()}
        </div>
        {!stats.is_unlimited && (
          <div className="text-sm opacity-90">
            of {stats.credits_per_month.toLocaleString()} credits
          </div>
        )}
      </div>

      {!stats.is_unlimited && (
        <>
          <div className="w-full h-2 bg-white bg-opacity-30 rounded-full overflow-hidden mb-2">
            <div
              className={`h-full transition-all duration-300 ${
                isLow ? 'bg-yellow-300' : 'bg-white'
              }`}
              style={{ width: `${100 - percentage}%` }}
            />
          </div>

          {isLow && (
            <div className="text-xs bg-yellow-400 bg-opacity-20 rounded px-2 py-1 inline-block">
              ⚠️ Running low on credits
            </div>
          )}
        </>
      )}

      <div className="mt-4 pt-4 border-t border-white border-opacity-30">
        <div className="text-sm opacity-90">
          Resets on {new Date(stats.period_end).toLocaleDateString()}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Subscription Widget
// ============================================================================

interface SubscriptionWidgetProps {
  subscription: SubscriptionResponse;
}

function SubscriptionWidget({ subscription }: SubscriptionWidgetProps) {
  const getTierColor = () => {
    switch (subscription.tier) {
      case 'premium':
        return 'from-purple-500 to-pink-600';
      case 'basic':
        return 'from-blue-500 to-indigo-600';
      default:
        return 'from-gray-500 to-gray-600';
    }
  };

  const getTierIcon = () => {
    switch (subscription.tier) {
      case 'premium':
        return '👑';
      case 'basic':
        return '⭐';
      default:
        return '🆓';
    }
  };

  return (
    <div className={`bg-gradient-to-r ${getTierColor()} rounded-xl shadow-lg p-6 text-white`}>
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center space-x-2 mb-2">
            <span className="text-2xl">{getTierIcon()}</span>
            <h3 className="text-2xl font-bold capitalize">{subscription.tier} Plan</h3>
          </div>
          <p className="text-sm opacity-90">
            {subscription.cancel_at_period_end
              ? `Active until ${new Date(subscription.current_period_end).toLocaleDateString()}`
              : `Renews on ${new Date(subscription.current_period_end).toLocaleDateString()}`}
          </p>
        </div>
        <span
          className={`px-3 py-1 rounded-full text-xs font-semibold ${
            subscription.status === 'active'
              ? 'bg-green-500 bg-opacity-30'
              : 'bg-yellow-500 bg-opacity-30'
          }`}
        >
          {subscription.status}
        </span>
      </div>

      {/* Cancellation Notice */}
      {subscription.cancel_at_period_end && (
        <div className="mb-4 bg-yellow-400 bg-opacity-20 rounded-lg p-3">
          <p className="text-sm">
            ⚠️ Your subscription will end on{' '}
            {new Date(subscription.current_period_end).toLocaleDateString()}
          </p>
        </div>
      )}

      {/* Features */}
      <div className="grid grid-cols-2 gap-3">
        {subscription.features.slice(0, 4).map((feature, index) => (
          <div key={index} className="flex items-center space-x-2 text-sm">
            <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                clipRule="evenodd"
              />
            </svg>
            <span className="opacity-90">{feature}</span>
          </div>
        ))}
      </div>

      {/* Action Buttons */}
      <div className="mt-6 pt-4 border-t border-white border-opacity-30 flex space-x-3">
        <Link
          href="/subscription/manage"
          className="flex-1 bg-white bg-opacity-20 hover:bg-opacity-30 rounded-lg px-4 py-2 text-center text-sm font-medium transition-colors"
        >
          Manage Plan
        </Link>
        {subscription.tier !== 'premium' && (
          <Link
            href="/pricing"
            className="flex-1 bg-white text-blue-600 hover:bg-gray-100 rounded-lg px-4 py-2 text-center text-sm font-medium transition-colors"
          >
            Upgrade
          </Link>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Usage Statistics
// ============================================================================

interface UsageStatisticsProps {
  stats: UsageStats;
  className?: string;
}

function UsageStatistics({ stats, className = '' }: UsageStatisticsProps) {
  return (
    <div className={`bg-white rounded-xl shadow-lg p-6 ${className}`}>
      <h3 className="text-lg font-bold text-gray-900 mb-6">Usage This Period</h3>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Credits Used */}
        <div className="text-center">
          <div className="text-3xl font-bold text-blue-600">
            {stats.credits_used.toLocaleString()}
          </div>
          <div className="text-sm text-gray-600 mt-1">Credits Used</div>
        </div>

        {/* Credits Remaining */}
        <div className="text-center">
          <div className="text-3xl font-bold text-green-600">
            {stats.is_unlimited ? '∞' : stats.credits_remaining.toLocaleString()}
          </div>
          <div className="text-sm text-gray-600 mt-1">Credits Left</div>
        </div>

        {/* Usage Percentage */}
        <div className="text-center">
          <div className="text-3xl font-bold text-purple-600">
            {stats.usage_percentage.toFixed(0)}%
          </div>
          <div className="text-sm text-gray-600 mt-1">Usage Rate</div>
        </div>

        {/* Tier */}
        <div className="text-center">
          <div className="text-3xl font-bold text-gray-900 capitalize">
            {stats.tier}
          </div>
          <div className="text-sm text-gray-600 mt-1">Current Tier</div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Generation Card
// ============================================================================

interface GenerationCardProps {
  generation: Generation;
}

function GenerationCard({ generation }: GenerationCardProps) {
  const getStatusColor = () => {
    switch (generation.status) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'processing':
        return 'bg-blue-100 text-blue-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="bg-gray-50 rounded-lg overflow-hidden hover:shadow-md transition-shadow">
      {/* Image */}
      {generation.blob_urls.length > 0 ? (
        <img
          src={generation.blob_urls[0]}
          alt={generation.prompt}
          className="w-full h-48 object-cover"
        />
      ) : (
        <div className="w-full h-48 bg-gray-200 flex items-center justify-center">
          <svg
            className="w-12 h-12 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
        </div>
      )}

      {/* Content */}
      <div className="p-4">
        <p className="text-sm text-gray-900 line-clamp-2 mb-2">
          {generation.prompt}
        </p>
        <div className="flex items-center justify-between">
          <span className={`text-xs px-2 py-1 rounded-full ${getStatusColor()}`}>
            {generation.status}
          </span>
          <span className="text-xs text-gray-500">
            {new Date(generation.created_at).toLocaleDateString()}
          </span>
        </div>
      </div>
    </div>
  );
}
