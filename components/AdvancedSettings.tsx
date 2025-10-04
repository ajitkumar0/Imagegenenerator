'use client';

import React, { useState } from 'react';
import { ChevronDown, ChevronUp, HelpCircle } from 'lucide-react';

interface AdvancedSettingsProps {
  dimensions: string;
  setDimensions: (value: string) => void;
  steps: number;
  setSteps: (value: number) => void;
  guidanceScale: number;
  setGuidanceScale: (value: number) => void;
  seed: string;
  setSeed: (value: string) => void;
  negativePrompt: string;
  setNegativePrompt: (value: string) => void;
  disabled?: boolean;
}

const dimensionOptions = [
  { value: '512x512', label: '512 × 512 (Square)', credits: 1 },
  { value: '768x768', label: '768 × 768 (Square)', credits: 1 },
  { value: '1024x1024', label: '1024 × 1024 (Square)', credits: 2 },
  { value: '1024x1792', label: '1024 × 1792 (Portrait)', credits: 2 },
  { value: '1792x1024', label: '1792 × 1024 (Landscape)', credits: 2 },
  { value: '2048x2048', label: '2048 × 2048 (Square)', credits: 3 },
];

const Tooltip = ({ text }: { text: string }) => {
  const [show, setShow] = useState(false);

  return (
    <div className="relative inline-block">
      <HelpCircle
        className="w-4 h-4 text-gray-400 cursor-help"
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
      />
      {show && (
        <div className="absolute z-50 bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-64 p-3 bg-gray-900 text-white text-xs rounded-lg shadow-lg">
          {text}
          <div className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-1">
            <div className="border-4 border-transparent border-t-gray-900" />
          </div>
        </div>
      )}
    </div>
  );
};

export default function AdvancedSettings({
  dimensions,
  setDimensions,
  steps,
  setSteps,
  guidanceScale,
  setGuidanceScale,
  seed,
  setSeed,
  negativePrompt,
  setNegativePrompt,
  disabled = false,
}: AdvancedSettingsProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showNegativePrompt, setShowNegativePrompt] = useState(false);

  return (
    <div className="w-full space-y-4">
      {/* Negative Prompt (Collapsible) */}
      <div className="border-2 border-gray-200 rounded-xl overflow-hidden">
        <button
          onClick={() => setShowNegativePrompt(!showNegativePrompt)}
          disabled={disabled}
          className="w-full px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors flex items-center justify-between"
        >
          <span className="text-sm font-semibold text-[#1F2937]">
            Negative Prompt (Optional)
          </span>
          {showNegativePrompt ? (
            <ChevronUp className="w-5 h-5 text-gray-600" />
          ) : (
            <ChevronDown className="w-5 h-5 text-gray-600" />
          )}
        </button>
        <div
          className={`transition-all duration-300 overflow-hidden ${
            showNegativePrompt ? 'max-h-40' : 'max-h-0'
          }`}
        >
          <div className="p-4">
            <textarea
              value={negativePrompt}
              onChange={(e) => setNegativePrompt(e.target.value)}
              disabled={disabled}
              placeholder="Things to avoid: blurry, distorted, low quality..."
              className="w-full h-24 px-3 py-2 rounded-lg border-2 border-gray-300 focus:border-[#FF6B9D] focus:outline-none resize-none"
              maxLength={200}
            />
            <p className="mt-1 text-xs text-gray-500">
              {negativePrompt.length}/200
            </p>
          </div>
        </div>
      </div>

      {/* Advanced Settings (Collapsible) */}
      <div className="border-2 border-gray-200 rounded-xl overflow-hidden">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          disabled={disabled}
          className="w-full px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors flex items-center justify-between"
        >
          <span className="text-sm font-semibold text-[#1F2937]">
            Advanced Settings
          </span>
          {isExpanded ? (
            <ChevronUp className="w-5 h-5 text-gray-600" />
          ) : (
            <ChevronDown className="w-5 h-5 text-gray-600" />
          )}
        </button>

        <div
          className={`transition-all duration-300 overflow-hidden ${
            isExpanded ? 'max-h-[600px]' : 'max-h-0'
          }`}
        >
          <div className="p-4 space-y-6">
            {/* Image Dimensions */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-[#1F2937] mb-2">
                Image Dimensions
                <Tooltip text="Higher resolutions produce more detailed images but use more credits" />
              </label>
              <select
                value={dimensions}
                onChange={(e) => setDimensions(e.target.value)}
                disabled={disabled}
                className="w-full px-4 py-2 rounded-lg border-2 border-gray-300 focus:border-[#FF6B9D] focus:outline-none"
              >
                {dimensionOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label} - {option.credits} credit{option.credits > 1 ? 's' : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Number of Steps */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-[#1F2937] mb-2">
                Inference Steps: {steps}
                <Tooltip text="More steps = higher quality but slower generation. 20-50 is recommended" />
              </label>
              <input
                type="range"
                min="20"
                max="100"
                step="5"
                value={steps}
                onChange={(e) => setSteps(Number(e.target.value))}
                disabled={disabled}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider-thumb"
                style={{
                  background: `linear-gradient(to right, #FF6B9D 0%, #A855F7 ${
                    ((steps - 20) / 80) * 100
                  }%, #e5e7eb ${((steps - 20) / 80) * 100}%, #e5e7eb 100%)`,
                }}
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>20 (Fast)</span>
                <span>100 (Best Quality)</span>
              </div>
            </div>

            {/* Guidance Scale */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-[#1F2937] mb-2">
                Guidance Scale: {guidanceScale.toFixed(1)}
                <Tooltip text="How closely to follow your prompt. 7-12 is recommended. Higher = more literal" />
              </label>
              <input
                type="range"
                min="1"
                max="20"
                step="0.5"
                value={guidanceScale}
                onChange={(e) => setGuidanceScale(Number(e.target.value))}
                disabled={disabled}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                style={{
                  background: `linear-gradient(to right, #FF6B9D 0%, #A855F7 ${
                    ((guidanceScale - 1) / 19) * 100
                  }%, #e5e7eb ${((guidanceScale - 1) / 19) * 100}%, #e5e7eb 100%)`,
                }}
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>1 (Creative)</span>
                <span>20 (Strict)</span>
              </div>
            </div>

            {/* Seed */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-[#1F2937] mb-2">
                Seed (Optional)
                <Tooltip text="Set a specific seed for reproducible results. Leave empty for random" />
              </label>
              <input
                type="number"
                value={seed}
                onChange={(e) => setSeed(e.target.value)}
                disabled={disabled}
                placeholder="Random (leave empty)"
                className="w-full px-4 py-2 rounded-lg border-2 border-gray-300 focus:border-[#FF6B9D] focus:outline-none"
                min="0"
                max="999999999"
              />
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        .slider-thumb::-webkit-slider-thumb {
          appearance: none;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: linear-gradient(135deg, #FF6B9D, #A855F7);
          cursor: pointer;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
        }

        .slider-thumb::-moz-range-thumb {
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: linear-gradient(135deg, #FF6B9D, #A855F7);
          cursor: pointer;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
          border: none;
        }
      `}</style>
    </div>
  );
}
