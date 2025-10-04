'use client';

import React from 'react';
import { Check } from 'lucide-react';

interface Feature {
  text: string;
  included: boolean;
}

interface PricingCardProps {
  name: string;
  monthlyPrice: number;
  annualPrice: number;
  description: string;
  features: Feature[];
  isPopular?: boolean;
  isPremium?: boolean;
  isAnnual: boolean;
}

export default function PricingCard({
  name,
  monthlyPrice,
  annualPrice,
  description,
  features,
  isPopular = false,
  isPremium = false,
  isAnnual,
}: PricingCardProps) {
  const displayPrice = isAnnual ? annualPrice : monthlyPrice;
  const savings = isAnnual && monthlyPrice > 0
    ? Number(((monthlyPrice * 12 - annualPrice * 12) / 12).toFixed(2))
    : 0;

  return (
    <div
      className={`relative bg-white rounded-2xl p-8 transition-all duration-300 ${
        isPopular
          ? 'shadow-2xl scale-105 border-2 border-[#FF6B9D]'
          : 'shadow-lg hover:shadow-xl hover:-translate-y-2 border border-gray-200'
      } ${
        isPremium
          ? 'bg-gradient-to-br from-white via-white to-[#FFF5F7]'
          : ''
      }`}
      style={
        isPremium
          ? {
              backgroundImage: 'linear-gradient(white, white), linear-gradient(135deg, #FF6B9D, #A855F7)',
              backgroundOrigin: 'border-box',
              backgroundClip: 'padding-box, border-box',
            }
          : undefined
      }
    >
      {/* Popular Badge */}
      {isPopular && (
        <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
          <span className="bg-gradient-to-r from-[#FF6B9D] to-[#A855F7] text-white px-6 py-2 rounded-full text-sm font-semibold shadow-lg">
            Most Popular
          </span>
        </div>
      )}

      {/* Plan Name */}
      <h3 className="text-2xl font-bold text-[#1F2937] mb-2">{name}</h3>

      {/* Description */}
      <p className="text-[#1F2937]/70 mb-6">{description}</p>

      {/* Price */}
      <div className="mb-6">
        <div className="flex items-baseline">
          <span className="text-5xl font-bold bg-gradient-to-r from-[#FF6B9D] to-[#A855F7] bg-clip-text text-transparent">
            ${displayPrice}
          </span>
          <span className="text-[#1F2937]/70 ml-2">/month</span>
        </div>
        {isAnnual && savings > 0 && (
          <p className="text-sm text-green-600 font-semibold mt-2">
            Save ${savings}/month
          </p>
        )}
        {isAnnual && monthlyPrice > 0 && (
          <p className="text-xs text-[#1F2937]/50 mt-1">
            Billed annually (${(displayPrice * 12).toFixed(2)}/year)
          </p>
        )}
      </div>

      {/* CTA Button */}
      <button
        className={`w-full py-4 rounded-full font-semibold text-lg transition-all duration-300 mb-8 ${
          isPopular || isPremium
            ? 'bg-gradient-to-r from-[#FF6B9D] to-[#A855F7] text-white hover:shadow-2xl hover:scale-105'
            : 'bg-white text-[#1F2937] border-2 border-gray-300 hover:border-[#FF6B9D] hover:shadow-lg'
        }`}
      >
        Get Started
      </button>

      {/* Features */}
      <div className="space-y-4">
        <p className="text-sm font-semibold text-[#1F2937] mb-4">What's included:</p>
        {features.map((feature, index) => (
          <div key={index} className="flex items-start">
            <div
              className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center mt-0.5 ${
                feature.included
                  ? 'bg-gradient-to-r from-[#FF6B9D] to-[#A855F7]'
                  : 'bg-gray-200'
              }`}
            >
              {feature.included && <Check className="w-3 h-3 text-white" />}
            </div>
            <span
              className={`ml-3 text-sm ${
                feature.included ? 'text-[#1F2937]' : 'text-[#1F2937]/40 line-through'
              }`}
            >
              {feature.text}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
