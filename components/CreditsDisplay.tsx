'use client';

import React from 'react';
import { Zap, AlertTriangle } from 'lucide-react';

interface CreditsDisplayProps {
  currentCredits: number;
  maxCredits: number;
  tier: 'free' | 'basic' | 'premium';
  onUpgrade?: () => void;
}

export default function CreditsDisplay({
  currentCredits,
  maxCredits,
  tier,
  onUpgrade,
}: CreditsDisplayProps) {
  const percentage = maxCredits > 0 ? (currentCredits / maxCredits) * 100 : 0;
  const isLow = percentage < 20;
  const isUnlimited = tier === 'premium' && maxCredits === Infinity;

  const tierColors = {
    free: 'from-gray-400 to-gray-600',
    basic: 'from-blue-400 to-blue-600',
    premium: 'from-[#FF6B9D] to-[#A855F7]',
  };

  const tierLabels = {
    free: 'Free',
    basic: 'Basic',
    premium: 'Premium',
  };

  return (
    <div className="w-full bg-white rounded-xl p-6 shadow-lg border-2 border-gray-100">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className={`p-2 rounded-lg bg-gradient-to-r ${tierColors[tier]}`}>
            <Zap className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-sm text-[#1F2937]/70">Your Credits</p>
            <p className="text-xs text-[#1F2937]/50">{tierLabels[tier]} Plan</p>
          </div>
        </div>

        {isLow && !isUnlimited && (
          <AlertTriangle className="w-5 h-5 text-yellow-500" />
        )}
      </div>

      {/* Credits Display */}
      {isUnlimited ? (
        <div className="text-center py-4">
          <p className="text-4xl font-bold bg-gradient-to-r from-[#FF6B9D] to-[#A855F7] bg-clip-text text-transparent mb-2">
            ∞
          </p>
          <p className="text-sm text-[#1F2937]/70">Unlimited Generations</p>
        </div>
      ) : (
        <>
          {/* Numbers */}
          <div className="flex items-baseline justify-center gap-2 mb-4">
            <span className={`text-4xl font-bold bg-gradient-to-r ${tierColors[tier]} bg-clip-text text-transparent`}>
              {currentCredits}
            </span>
            <span className="text-lg text-[#1F2937]/50">/ {maxCredits}</span>
          </div>

          {/* Progress Bar */}
          <div className="relative w-full h-3 bg-gray-200 rounded-full overflow-hidden mb-4">
            <div
              className={`absolute inset-y-0 left-0 bg-gradient-to-r ${tierColors[tier]} transition-all duration-500 rounded-full`}
              style={{ width: `${percentage}%` }}
            />
          </div>

          {/* Status Message */}
          <p className={`text-sm text-center ${isLow ? 'text-yellow-600' : 'text-[#1F2937]/70'}`}>
            {isLow
              ? 'Running low on credits!'
              : `${currentCredits} generation${currentCredits !== 1 ? 's' : ''} remaining`}
          </p>
        </>
      )}

      {/* Upgrade Button */}
      {tier !== 'premium' && onUpgrade && (
        <button
          onClick={onUpgrade}
          className="w-full mt-4 px-6 py-3 bg-gradient-to-r from-[#FF6B9D] to-[#A855F7] text-white rounded-xl font-semibold hover:shadow-xl hover:scale-105 transition-all duration-300"
        >
          Upgrade for More Credits
        </button>
      )}

      {/* Refill Message for Free Tier */}
      {tier === 'free' && (
        <div className="mt-4 p-3 bg-blue-50 rounded-lg">
          <p className="text-xs text-blue-800 text-center">
            Credits refill monthly on the 1st
          </p>
        </div>
      )}
    </div>
  );
}
