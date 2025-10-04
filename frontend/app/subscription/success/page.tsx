/**
 * Subscription Success Page
 *
 * Shown after successful Stripe checkout
 * Polls backend for subscription status update
 */

'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth/auth-context';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import apiClient from '@/lib/api-client';
import { SubscriptionResponse } from '@/lib/types/api';
import Link from 'next/link';

export default function SubscriptionSuccessPage() {
  return (
    <ProtectedRoute>
      <SubscriptionSuccessContent />
    </ProtectedRoute>
  );
}

function SubscriptionSuccessContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();

  const [subscription, setSubscription] = useState<SubscriptionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pollAttempts, setPollAttempts] = useState(0);

  const sessionId = searchParams.get('session_id');

  useEffect(() => {
    if (!sessionId) {
      setError('Invalid session');
      setLoading(false);
      return;
    }

    // Start polling for subscription update
    pollSubscriptionStatus();
  }, [sessionId]);

  const pollSubscriptionStatus = async () => {
    const maxAttempts = 10; // 10 attempts
    const pollInterval = 2000; // 2 seconds

    const poll = async (attempts: number) => {
      if (attempts >= maxAttempts) {
        setLoading(false);
        // Even if polling times out, subscription might still be active
        return;
      }

      try {
        const sub = await apiClient.getSubscription();
        setSubscription(sub);

        // Check if subscription is active
        if (sub.status === 'active' || sub.status === 'trialing') {
          setLoading(false);
          return;
        }

        // Continue polling
        setPollAttempts(attempts + 1);
        setTimeout(() => poll(attempts + 1), pollInterval);
      } catch (err: any) {
        console.error('Failed to poll subscription:', err);
        setPollAttempts(attempts + 1);
        setTimeout(() => poll(attempts + 1), pollInterval);
      }
    };

    poll(0);
  };

  const getTierColor = (tier: string) => {
    switch (tier) {
      case 'premium':
        return 'text-purple-600';
      case 'basic':
        return 'text-blue-600';
      default:
        return 'text-gray-600';
    }
  };

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50 to-pink-100 px-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Something went wrong</h1>
          <p className="text-gray-600 mb-6">{error}</p>
          <Link
            href="/pricing"
            className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700"
          >
            Back to Pricing
          </Link>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 px-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
          <div className="relative w-16 h-16 mx-auto mb-4">
            <div className="absolute inset-0 border-4 border-blue-200 rounded-full"></div>
            <div className="absolute inset-0 border-4 border-blue-600 rounded-full border-t-transparent animate-spin"></div>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Confirming Your Subscription
          </h1>
          <p className="text-gray-600 mb-2">
            Please wait while we process your payment...
          </p>
          <p className="text-sm text-gray-500">
            Attempt {pollAttempts + 1} of 10
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-emerald-100 px-4">
      <div className="max-w-2xl w-full bg-white rounded-2xl shadow-xl overflow-hidden">
        {/* Success Header */}
        <div className="bg-gradient-to-r from-green-500 to-emerald-600 p-8 text-center">
          <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-12 h-12 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">
            Welcome to {subscription?.tier && subscription.tier.charAt(0).toUpperCase() + subscription.tier.slice(1)}!
          </h1>
          <p className="text-green-100">
            Your subscription is now active
          </p>
        </div>

        {/* Subscription Details */}
        <div className="p-8">
          {subscription && (
            <>
              {/* Credits Info */}
              <div className="bg-blue-50 rounded-xl p-6 mb-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-gray-900">
                    Your Credits
                  </h2>
                  <span className={`text-3xl font-bold ${getTierColor(subscription.tier)}`}>
                    {subscription.is_unlimited ? '∞' : subscription.credits_remaining}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-gray-600">Monthly Allowance</p>
                    <p className="font-semibold text-gray-900">
                      {subscription.is_unlimited ? 'Unlimited' : `${subscription.credits_per_month} credits`}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-600">Renews On</p>
                    <p className="font-semibold text-gray-900">
                      {new Date(subscription.current_period_end).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              </div>

              {/* Features */}
              <div className="mb-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">
                  What's Included
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {subscription.features.map((feature, index) => (
                    <div key={index} className="flex items-start">
                      <svg className="h-5 w-5 text-green-500 mt-0.5 mr-2 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="text-sm text-gray-700">{feature}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Next Steps */}
              <div className="bg-gray-50 rounded-xl p-6 mb-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">
                  What's Next?
                </h2>
                <ol className="space-y-3">
                  <li className="flex items-start">
                    <span className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-semibold mr-3">
                      1
                    </span>
                    <div>
                      <p className="font-medium text-gray-900">Start Creating</p>
                      <p className="text-sm text-gray-600">Head to the generation page and start creating amazing AI images</p>
                    </div>
                  </li>
                  <li className="flex items-start">
                    <span className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-semibold mr-3">
                      2
                    </span>
                    <div>
                      <p className="font-medium text-gray-900">Explore Models</p>
                      <p className="text-sm text-gray-600">Try different FLUX models to find your perfect style</p>
                    </div>
                  </li>
                  <li className="flex items-start">
                    <span className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-semibold mr-3">
                      3
                    </span>
                    <div>
                      <p className="font-medium text-gray-900">Track Your Usage</p>
                      <p className="text-sm text-gray-600">Monitor your credits and generation history in your dashboard</p>
                    </div>
                  </li>
                </ol>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Link
                  href="/generate"
                  className="flex items-center justify-center px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
                >
                  <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Start Generating
                </Link>
                <Link
                  href="/subscription/manage"
                  className="flex items-center justify-center px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
                >
                  <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Manage Subscription
                </Link>
              </div>

              {/* Receipt Info */}
              <div className="mt-6 pt-6 border-t border-gray-200">
                <p className="text-sm text-gray-600 text-center">
                  A receipt has been sent to <span className="font-medium">{user?.email}</span>
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
