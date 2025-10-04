'use client';

import React, { useState } from 'react';
import Header from '@/components/Header';
import PricingCard from '@/components/PricingCard';
import { Check, X } from 'lucide-react';

const pricingPlans = [
  {
    name: 'Free Tier',
    monthlyPrice: 0,
    annualPrice: 0,
    description: 'Perfect for trying out our AI image generation',
    features: [
      { text: '10 generations/month', included: true },
      { text: '1024x1024 resolution', included: true },
      { text: 'Watermarked images', included: true },
      { text: 'No watermarks', included: false },
      { text: 'Priority queue', included: false },
      { text: 'API access', included: false },
    ],
  },
  {
    name: 'Basic Tier',
    monthlyPrice: 9.99,
    annualPrice: 7.99, // 20% discount
    description: 'Great for hobbyists and content creators',
    features: [
      { text: '200 generations/month', included: true },
      { text: 'Up to 2048x2048 resolution', included: true },
      { text: 'No watermarks', included: true },
      { text: 'Priority queue', included: true },
      { text: 'Email support', included: true },
      { text: 'API access', included: false },
    ],
    isPopular: true,
  },
  {
    name: 'Premium Tier',
    monthlyPrice: 29.99,
    annualPrice: 23.99, // 20% discount
    description: 'For professionals and businesses',
    features: [
      { text: 'Unlimited generations', included: true },
      { text: 'Up to 4096x4096 resolution', included: true },
      { text: 'No watermarks', included: true },
      { text: 'Fastest processing', included: true },
      { text: 'Priority support', included: true },
      { text: 'API access', included: true },
      { text: 'Custom models (coming soon)', included: true },
    ],
    isPremium: true,
  },
];

const comparisonFeatures = [
  { feature: 'Monthly generations', free: '10', basic: '200', premium: 'Unlimited' },
  { feature: 'Maximum resolution', free: '1024x1024', basic: '2048x2048', premium: '4096x4096' },
  { feature: 'Watermarks', free: 'Yes', basic: 'No', premium: 'No' },
  { feature: 'Processing speed', free: 'Standard', basic: 'Fast', premium: 'Fastest' },
  { feature: 'Support', free: 'Community', basic: 'Email', premium: 'Priority' },
  { feature: 'API access', free: false, basic: false, premium: true },
  { feature: 'Custom models', free: false, basic: false, premium: 'Coming soon' },
  { feature: 'Commercial use', free: false, basic: true, premium: true },
];

export default function PricingPage() {
  const [isAnnual, setIsAnnual] = useState(false);

  return (
    <main className="min-h-screen">
      <Header />

      {/* Hero Section */}
      <section className="w-full py-20 px-4 md:px-8 lg:px-16">
        <div className="max-w-7xl mx-auto text-center">
          <h1 className="text-5xl md:text-6xl font-bold mb-6">
            Simple,{' '}
            <span className="bg-gradient-to-r from-[#FF6B9D] to-[#A855F7] bg-clip-text text-transparent">
              Transparent Pricing
            </span>
          </h1>
          <p className="text-lg md:text-xl text-[#1F2937]/70 mb-12 max-w-3xl mx-auto">
            Choose the perfect plan for your creative needs. Upgrade or downgrade anytime.
          </p>

          {/* Billing Toggle */}
          <div className="flex items-center justify-center gap-4 mb-16">
            <span
              className={`text-lg font-semibold transition-colors ${
                !isAnnual ? 'text-[#1F2937]' : 'text-[#1F2937]/50'
              }`}
            >
              Monthly
            </span>
            <button
              onClick={() => setIsAnnual(!isAnnual)}
              className={`relative w-16 h-8 rounded-full transition-colors duration-300 ${
                isAnnual ? 'bg-gradient-to-r from-[#FF6B9D] to-[#A855F7]' : 'bg-gray-300'
              }`}
            >
              <div
                className={`absolute top-1 left-1 w-6 h-6 bg-white rounded-full transition-transform duration-300 ${
                  isAnnual ? 'transform translate-x-8' : ''
                }`}
              />
            </button>
            <span
              className={`text-lg font-semibold transition-colors ${
                isAnnual ? 'text-[#1F2937]' : 'text-[#1F2937]/50'
              }`}
            >
              Annual
            </span>
            {isAnnual && (
              <span className="ml-2 bg-green-100 text-green-700 px-3 py-1 rounded-full text-sm font-semibold animate-pulse">
                Save 20%
              </span>
            )}
          </div>

          {/* Pricing Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-20">
            {pricingPlans.map((plan, index) => (
              <PricingCard
                key={index}
                name={plan.name}
                monthlyPrice={plan.monthlyPrice}
                annualPrice={plan.annualPrice}
                description={plan.description}
                features={plan.features}
                isPopular={plan.isPopular}
                isPremium={plan.isPremium}
                isAnnual={isAnnual}
              />
            ))}
          </div>
        </div>
      </section>

      {/* Feature Comparison Table */}
      <section className="w-full py-20 px-4 md:px-8 lg:px-16 bg-gradient-to-b from-white to-[#FFF5F7]">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-4xl font-bold text-center mb-12 text-[#1F2937]">
            Compare Plans
          </h2>

          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full bg-white rounded-2xl shadow-xl overflow-hidden">
              <thead>
                <tr className="bg-gradient-to-r from-[#FF6B9D] to-[#A855F7]">
                  <th className="py-6 px-6 text-left text-white font-semibold">Feature</th>
                  <th className="py-6 px-6 text-center text-white font-semibold">Free</th>
                  <th className="py-6 px-6 text-center text-white font-semibold">Basic</th>
                  <th className="py-6 px-6 text-center text-white font-semibold">Premium</th>
                </tr>
              </thead>
              <tbody>
                {comparisonFeatures.map((item, index) => (
                  <tr
                    key={index}
                    className={`border-b border-gray-100 ${
                      index % 2 === 0 ? 'bg-gray-50' : 'bg-white'
                    }`}
                  >
                    <td className="py-4 px-6 text-[#1F2937] font-medium">{item.feature}</td>
                    <td className="py-4 px-6 text-center">
                      {typeof item.free === 'boolean' ? (
                        item.free ? (
                          <Check className="w-6 h-6 text-green-500 mx-auto" />
                        ) : (
                          <X className="w-6 h-6 text-red-400 mx-auto" />
                        )
                      ) : (
                        <span className="text-[#1F2937]/70">{item.free}</span>
                      )}
                    </td>
                    <td className="py-4 px-6 text-center">
                      {typeof item.basic === 'boolean' ? (
                        item.basic ? (
                          <Check className="w-6 h-6 text-green-500 mx-auto" />
                        ) : (
                          <X className="w-6 h-6 text-red-400 mx-auto" />
                        )
                      ) : (
                        <span className="text-[#1F2937]/70">{item.basic}</span>
                      )}
                    </td>
                    <td className="py-4 px-6 text-center">
                      {typeof item.premium === 'boolean' ? (
                        item.premium ? (
                          <Check className="w-6 h-6 text-green-500 mx-auto" />
                        ) : (
                          <X className="w-6 h-6 text-red-400 mx-auto" />
                        )
                      ) : (
                        <span className="text-[#1F2937]/70">{item.premium}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden space-y-6">
            {['free', 'basic', 'premium'].map((tier) => (
              <div key={tier} className="bg-white rounded-2xl shadow-lg p-6">
                <h3 className="text-2xl font-bold mb-4 capitalize bg-gradient-to-r from-[#FF6B9D] to-[#A855F7] bg-clip-text text-transparent">
                  {tier} Tier
                </h3>
                <div className="space-y-3">
                  {comparisonFeatures.map((item, index) => (
                    <div key={index} className="flex justify-between items-center py-2 border-b border-gray-100">
                      <span className="text-sm text-[#1F2937] font-medium">{item.feature}</span>
                      <span className="text-sm text-[#1F2937]/70">
                        {typeof item[tier as keyof typeof item] === 'boolean' ? (
                          item[tier as keyof typeof item] ? (
                            <Check className="w-5 h-5 text-green-500" />
                          ) : (
                            <X className="w-5 h-5 text-red-400" />
                          )
                        ) : (
                          item[tier as keyof typeof item]
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ or CTA Section */}
      <section className="w-full py-20 px-4 md:px-8 lg:px-16">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl font-bold mb-6 text-[#1F2937]">Still have questions?</h2>
          <p className="text-lg text-[#1F2937]/70 mb-8">
            Our team is here to help. Contact us for more information about our plans.
          </p>
          <button className="px-8 py-4 bg-gradient-to-r from-[#FF6B9D] to-[#A855F7] text-white rounded-full font-semibold text-lg hover:shadow-2xl hover:scale-105 transition-all duration-300">
            Contact Sales
          </button>
        </div>
      </section>
    </main>
  );
}
