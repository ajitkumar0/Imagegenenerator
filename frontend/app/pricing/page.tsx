/**
 * Pricing Page
 *
 * Displays subscription tiers and handles Stripe checkout flow
 */

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/auth-context';
import apiClient from '@/lib/api-client';
import { SubscriptionTierInfo, SubscriptionResponse } from '@/lib/types/api';
import Link from 'next/link';

export default function PricingPage() {
  const { isAuthenticated, user } = useAuth();
  const router = useRouter();
  const [tiers, setTiers] = useState<SubscriptionTierInfo[]>([]);
  const [currentSubscription, setCurrentSubscription] = useState<SubscriptionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadPricingData();
  }, [isAuthenticated]);

  const loadPricingData = async () => {
    try {
      // Load tier information
      const tierData = await apiClient.getSubscriptionTiers();
      setTiers(tierData);

      // Load current subscription if authenticated
      if (isAuthenticated) {
        try {
          const subscription = await apiClient.getSubscription();
          setCurrentSubscription(subscription);
        } catch (err) {
          console.error('Failed to load subscription:', err);
        }
      }
    } catch (err: any) {
      console.error('Failed to load pricing:', err);
      setError('Failed to load pricing information');
    } finally {
      setLoading(false);
    }
  };

  const handleSubscribe = async (tier: 'basic' | 'premium') => {
    if (!isAuthenticated) {
      // Redirect to login with return URL
      router.push(`/auth/login?returnUrl=${encodeURIComponent('/pricing')}`);
      return;
    }

    setCheckoutLoading(tier);
    setError(null);

    try {
      // Create checkout session
      const successUrl = `${window.location.origin}/subscription/success`;
      const cancelUrl = `${window.location.origin}/pricing`;

      const response = await apiClient.createCheckoutSession({
        tier,
        success_url: successUrl,
        cancel_url: cancelUrl,
      });

      // Redirect to Stripe checkout
      window.location.href = response.checkout_url;
    } catch (err: any) {
      console.error('Checkout failed:', err);
      setError(err.detail || 'Failed to start checkout. Please try again.');
      setCheckoutLoading(null);
    }
  };

  const handleManageBilling = async () => {
    if (!isAuthenticated) {
      router.push('/auth/login');
      return;
    }

    setCheckoutLoading('portal');
    setError(null);

    try {
      const returnUrl = `${window.location.origin}/subscription/manage`;
      const response = await apiClient.createPortalSession({
        return_url: returnUrl,
      });

      // Redirect to Stripe portal
      window.location.href = response.portal_url;
    } catch (err: any) {
      console.error('Portal failed:', err);
      setError(err.detail || 'Failed to open billing portal. Please try again.');
      setCheckoutLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const isCurrentTier = (tierName: string) => {
    return currentSubscription?.tier === tierName.toLowerCase();
  };

  const getTierCTA = (tierName: string, tierKey: 'free' | 'basic' | 'premium') => {
    if (!isAuthenticated) {
      return 'Sign In to Subscribe';
    }

    if (isCurrentTier(tierName)) {
      return 'Current Plan';
    }

    if (tierKey === 'free') {
      return 'Current Plan';
    }

    if (currentSubscription?.tier === 'premium' && tierKey === 'basic') {
      return 'Downgrade';
    }

    if (currentSubscription?.tier === 'basic' && tierKey === 'premium') {
      return 'Upgrade';
    }

    return 'Subscribe';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Choose Your Plan
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Generate stunning AI images with flexible pricing that scales with your needs
          </p>
        </div>

        {/* Current Subscription Banner */}
        {isAuthenticated && currentSubscription && (
          <div className="max-w-3xl mx-auto mb-8 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-blue-900">
                  Current Plan: <span className="capitalize">{currentSubscription.tier}</span>
                </p>
                <p className="text-xs text-blue-700">
                  {currentSubscription.is_unlimited
                    ? 'Unlimited credits'
                    : `${currentSubscription.credits_remaining} credits remaining`}
                </p>
              </div>
              <button
                onClick={handleManageBilling}
                disabled={checkoutLoading === 'portal'}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {checkoutLoading === 'portal' ? 'Loading...' : 'Manage Billing'}
              </button>
            </div>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="max-w-3xl mx-auto mb-8 p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-start">
              <svg className="h-5 w-5 text-red-400 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              <div className="ml-3">
                <p className="text-sm text-red-800">{error}</p>
              </div>
              <button
                onClick={() => setError(null)}
                className="ml-auto text-red-400 hover:text-red-600"
              >
                <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {tiers.map((tier, index) => {
            const tierKey = tier.name.toLowerCase() as 'free' | 'basic' | 'premium';
            const isCurrent = isCurrentTier(tier.name);
            const isPremium = tier.name.toLowerCase() === 'premium';

            return (
              <div
                key={tier.name}
                className={`relative bg-white rounded-2xl shadow-xl overflow-hidden transition-transform hover:scale-105 ${
                  isPremium ? 'ring-2 ring-blue-600' : ''
                }`}
              >
                {/* Popular Badge */}
                {isPremium && (
                  <div className="absolute top-0 right-0 bg-blue-600 text-white px-4 py-1 text-xs font-semibold rounded-bl-lg">
                    POPULAR
                  </div>
                )}

                <div className="p-8">
                  {/* Tier Name */}
                  <h3 className="text-2xl font-bold text-gray-900 mb-2">
                    {tier.name}
                  </h3>

                  {/* Price */}
                  <div className="mb-6">
                    <span className="text-4xl font-bold text-gray-900">
                      ${tier.price}
                    </span>
                    {tier.price > 0 && (
                      <span className="text-gray-600">/month</span>
                    )}
                  </div>

                  {/* Description */}
                  <p className="text-gray-600 mb-6">{tier.description}</p>

                  {/* Credits */}
                  <div className="mb-6 p-4 bg-blue-50 rounded-lg">
                    <p className="text-sm font-medium text-blue-900">
                      {tier.is_unlimited
                        ? '∞ Unlimited Credits'
                        : `${tier.credits_per_month.toLocaleString()} Credits/month`}
                    </p>
                    {!tier.is_unlimited && (
                      <p className="text-xs text-blue-700 mt-1">
                        ~{tier.credits_per_month} generations
                      </p>
                    )}
                  </div>

                  {/* Features */}
                  <ul className="space-y-3 mb-8">
                    {tier.features.map((feature, idx) => (
                      <li key={idx} className="flex items-start">
                        <svg
                          className="h-5 w-5 text-green-500 mt-0.5 mr-3 flex-shrink-0"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                        <span className="text-sm text-gray-700">{feature}</span>
                      </li>
                    ))}
                  </ul>

                  {/* CTA Button */}
                  <button
                    onClick={() => {
                      if (tierKey === 'free') {
                        if (!isAuthenticated) {
                          router.push('/auth/login');
                        }
                      } else {
                        handleSubscribe(tierKey);
                      }
                    }}
                    disabled={isCurrent || checkoutLoading === tierKey}
                    className={`w-full py-3 px-6 rounded-lg font-semibold transition-colors ${
                      isCurrent
                        ? 'bg-gray-200 text-gray-600 cursor-not-allowed'
                        : isPremium
                        ? 'bg-blue-600 text-white hover:bg-blue-700'
                        : 'bg-gray-900 text-white hover:bg-gray-800'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    {checkoutLoading === tierKey ? (
                      <span className="flex items-center justify-center">
                        <svg
                          className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                          fill="none"
                          viewBox="0 0 24 24"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          />
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          />
                        </svg>
                        Loading...
                      </span>
                    ) : (
                      getTierCTA(tier.name, tierKey)
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* FAQ Section */}
        <div className="max-w-3xl mx-auto mt-16">
          <h2 className="text-2xl font-bold text-gray-900 mb-6 text-center">
            Frequently Asked Questions
          </h2>
          <div className="space-y-4">
            <div className="bg-white rounded-lg p-6 shadow">
              <h3 className="font-semibold text-gray-900 mb-2">
                Can I cancel anytime?
              </h3>
              <p className="text-gray-600 text-sm">
                Yes! You can cancel your subscription at any time from the billing portal. You'll continue to have access until the end of your billing period.
              </p>
            </div>
            <div className="bg-white rounded-lg p-6 shadow">
              <h3 className="font-semibold text-gray-900 mb-2">
                What happens if I run out of credits?
              </h3>
              <p className="text-gray-600 text-sm">
                Your credits reset at the start of each billing cycle. If you need more credits, you can upgrade to a higher tier at any time.
              </p>
            </div>
            <div className="bg-white rounded-lg p-6 shadow">
              <h3 className="font-semibold text-gray-900 mb-2">
                How do credits work?
              </h3>
              <p className="text-gray-600 text-sm">
                Each image generation costs 1 credit. Different models may have different credit costs. Credits reset monthly and don't roll over.
              </p>
            </div>
            <div className="bg-white rounded-lg p-6 shadow">
              <h3 className="font-semibold text-gray-900 mb-2">
                Can I upgrade or downgrade?
              </h3>
              <p className="text-gray-600 text-sm">
                Yes! You can change your plan at any time. Upgrades take effect immediately with prorated billing. Downgrades take effect at the end of your current billing period.
              </p>
            </div>
          </div>
        </div>

        {/* Bottom CTA */}
        <div className="text-center mt-12">
          <Link
            href="/generate"
            className="inline-block text-blue-600 hover:text-blue-700 font-medium"
          >
            Try it free first →
          </Link>
        </div>
      </div>
    </div>
  );
}
