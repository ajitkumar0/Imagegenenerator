'use client';

import React from 'react';
import { AlertCircle } from 'lucide-react';

interface PromptInputProps {
  value: string;
  onChange: (value: string) => void;
  error?: string;
  maxLength?: number;
  minLength?: number;
  disabled?: boolean;
}

export default function PromptInput({
  value,
  onChange,
  error,
  maxLength = 500,
  minLength = 3,
  disabled = false,
}: PromptInputProps) {
  const characterCount = value.length;
  const isValid = characterCount >= minLength && characterCount <= maxLength;
  const showError = error || (characterCount > 0 && characterCount < minLength);

  return (
    <div className="w-full">
      <label className="block text-sm font-semibold text-[#1F2937] mb-2">
        Describe your image
      </label>
      <div className="relative">
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder="A majestic mountain landscape at sunset with vibrant colors..."
          className={`w-full h-32 px-4 py-3 rounded-xl border-2 transition-all duration-300 resize-none focus:outline-none ${
            showError
              ? 'border-red-400 focus:border-red-500'
              : isValid
              ? 'border-green-400 focus:border-green-500'
              : 'border-gray-300 focus:border-[#FF6B9D]'
          } ${disabled ? 'bg-gray-100 cursor-not-allowed' : 'bg-white'}`}
          maxLength={maxLength}
        />

        {/* Character Counter */}
        <div className="absolute bottom-3 right-3 flex items-center gap-2">
          {showError && (
            <AlertCircle className="w-4 h-4 text-red-500" />
          )}
          <span
            className={`text-xs font-medium ${
              characterCount > maxLength * 0.9
                ? 'text-red-500'
                : characterCount >= minLength
                ? 'text-green-600'
                : 'text-gray-400'
            }`}
          >
            {characterCount}/{maxLength}
          </span>
        </div>
      </div>

      {/* Error Message */}
      {showError && (
        <p className="mt-2 text-sm text-red-500 flex items-center gap-1">
          <AlertCircle className="w-4 h-4" />
          {error || `Prompt must be at least ${minLength} characters`}
        </p>
      )}

      {/* Helper Text */}
      {!showError && characterCount === 0 && (
        <p className="mt-2 text-sm text-gray-500">
          Be specific and descriptive for best results
        </p>
      )}
    </div>
  );
}
