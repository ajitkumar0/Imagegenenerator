'use client';

import React from 'react';
import { HelpCircle } from 'lucide-react';

interface StrengthSliderProps {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}

export default function StrengthSlider({ value, onChange, disabled = false }: StrengthSliderProps) {
  const [showTooltip, setShowTooltip] = React.useState(false);

  const getStrengthLabel = (val: number): string => {
    if (val <= 0.3) return 'Subtle';
    if (val <= 0.6) return 'Moderate';
    if (val <= 0.8) return 'Strong';
    return 'Maximum';
  };

  const getStrengthColor = (val: number): string => {
    if (val <= 0.3) return 'text-blue-600';
    if (val <= 0.6) return 'text-green-600';
    if (val <= 0.8) return 'text-orange-600';
    return 'text-red-600';
  };

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <label className="text-sm font-semibold text-[#1F2937]">
            Transformation Strength
          </label>
          <div className="relative inline-block">
            <HelpCircle
              className="w-4 h-4 text-gray-400 cursor-help"
              onMouseEnter={() => setShowTooltip(true)}
              onMouseLeave={() => setShowTooltip(false)}
            />
            {showTooltip && (
              <div className="absolute z-50 bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-64 p-3 bg-gray-900 text-white text-xs rounded-lg shadow-lg">
                <p className="mb-2">Controls how much to transform your image:</p>
                <ul className="space-y-1 text-xs">
                  <li>• <strong>0.0-0.3:</strong> Subtle changes (keeps original look)</li>
                  <li>• <strong>0.4-0.6:</strong> Moderate transformation</li>
                  <li>• <strong>0.7-0.8:</strong> Strong changes</li>
                  <li>• <strong>0.9-1.0:</strong> Maximum transformation</li>
                </ul>
                <div className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-1">
                  <div className="border-4 border-transparent border-t-gray-900" />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Strength Value and Label */}
        <div className="flex items-center gap-2">
          <span className={`text-sm font-bold ${getStrengthColor(value)}`}>
            {getStrengthLabel(value)}
          </span>
          <span className="text-sm font-semibold text-[#1F2937]">
            {value.toFixed(2)}
          </span>
        </div>
      </div>

      {/* Slider */}
      <div className="relative">
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          disabled={disabled}
          className="w-full h-3 bg-gray-200 rounded-lg appearance-none cursor-pointer strength-slider"
          style={{
            background: `linear-gradient(to right,
              #3B82F6 0%,
              #10B981 ${value * 33}%,
              #F59E0B ${value * 66}%,
              #EF4444 ${value * 100}%,
              #e5e7eb ${value * 100}%,
              #e5e7eb 100%)`,
          }}
        />

        {/* Markers */}
        <div className="flex justify-between mt-2 px-1">
          <div className="flex flex-col items-center">
            <div className="w-px h-2 bg-gray-400" />
            <span className="text-xs text-gray-500 mt-1">0.0</span>
            <span className="text-xs text-blue-600 font-medium">Subtle</span>
          </div>
          <div className="flex flex-col items-center">
            <div className="w-px h-2 bg-gray-400" />
            <span className="text-xs text-gray-500 mt-1">0.3</span>
          </div>
          <div className="flex flex-col items-center">
            <div className="w-px h-2 bg-gray-400" />
            <span className="text-xs text-gray-500 mt-1">0.5</span>
            <span className="text-xs text-green-600 font-medium">Moderate</span>
          </div>
          <div className="flex flex-col items-center">
            <div className="w-px h-2 bg-gray-400" />
            <span className="text-xs text-gray-500 mt-1">0.7</span>
          </div>
          <div className="flex flex-col items-center">
            <div className="w-px h-2 bg-gray-400" />
            <span className="text-xs text-gray-500 mt-1">1.0</span>
            <span className="text-xs text-red-600 font-medium">Maximum</span>
          </div>
        </div>
      </div>

      {/* Description based on current value */}
      <div className="mt-4 p-3 bg-gray-50 rounded-lg">
        <p className="text-xs text-[#1F2937]/70">
          {value <= 0.3 && (
            <>
              <strong>Subtle transformation:</strong> The AI will make minimal changes, preserving most
              of the original image structure and details.
            </>
          )}
          {value > 0.3 && value <= 0.6 && (
            <>
              <strong>Moderate transformation:</strong> Balanced changes that blend your prompt with the
              original image features.
            </>
          )}
          {value > 0.6 && value <= 0.8 && (
            <>
              <strong>Strong transformation:</strong> Significant changes while maintaining some original
              elements.
            </>
          )}
          {value > 0.8 && (
            <>
              <strong>Maximum transformation:</strong> The AI will heavily transform the image, using your
              prompt as the primary guide.
            </>
          )}
        </p>
      </div>

      <style jsx>{`
        .strength-slider::-webkit-slider-thumb {
          appearance: none;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: linear-gradient(135deg, #FF6B9D, #A855F7);
          cursor: pointer;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
          border: 3px solid white;
        }

        .strength-slider::-moz-range-thumb {
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: linear-gradient(135deg, #FF6B9D, #A855F7);
          cursor: pointer;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
          border: 3px solid white;
        }

        .strength-slider:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
}
