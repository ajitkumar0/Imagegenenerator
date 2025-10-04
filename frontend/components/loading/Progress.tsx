/**
 * Progress Indicator Components
 *
 * Display progress for long-running operations (0-100%)
 */

'use client';

import React from 'react';

// ============================================================================
// Linear Progress Bar
// ============================================================================

interface ProgressBarProps {
  value: number; // 0-100
  className?: string;
  showLabel?: boolean;
  color?: 'blue' | 'green' | 'purple' | 'red';
  size?: 'sm' | 'md' | 'lg';
  indeterminate?: boolean;
}

export function ProgressBar({
  value,
  className = '',
  showLabel = false,
  color = 'blue',
  size = 'md',
  indeterminate = false,
}: ProgressBarProps) {
  const normalizedValue = Math.min(Math.max(value, 0), 100);

  const colorClasses = {
    blue: 'bg-blue-600',
    green: 'bg-green-600',
    purple: 'bg-purple-600',
    red: 'bg-red-600',
  };

  const sizeClasses = {
    sm: 'h-1',
    md: 'h-2',
    lg: 'h-3',
  };

  return (
    <div className={className}>
      {showLabel && (
        <div className="flex justify-between text-sm text-gray-700 mb-1">
          <span>Progress</span>
          <span>{Math.round(normalizedValue)}%</span>
        </div>
      )}
      <div className={`w-full bg-gray-200 rounded-full overflow-hidden ${sizeClasses[size]}`}>
        {indeterminate ? (
          <div className={`${sizeClasses[size]} ${colorClasses[color]} animate-indeterminate`} />
        ) : (
          <div
            className={`${sizeClasses[size]} ${colorClasses[color]} transition-all duration-300 ease-out`}
            style={{ width: `${normalizedValue}%` }}
          />
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Circular Progress
// ============================================================================

interface CircularProgressProps {
  value: number; // 0-100
  size?: number;
  strokeWidth?: number;
  className?: string;
  showLabel?: boolean;
  color?: 'blue' | 'green' | 'purple' | 'red';
  indeterminate?: boolean;
}

export function CircularProgress({
  value,
  size = 80,
  strokeWidth = 8,
  className = '',
  showLabel = true,
  color = 'blue',
  indeterminate = false,
}: CircularProgressProps) {
  const normalizedValue = Math.min(Math.max(value, 0), 100);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (normalizedValue / 100) * circumference;

  const colorClasses = {
    blue: 'stroke-blue-600',
    green: 'stroke-green-600',
    purple: 'stroke-purple-600',
    red: 'stroke-red-600',
  };

  return (
    <div className={`relative inline-flex items-center justify-center ${className}`}>
      <svg
        width={size}
        height={size}
        className={indeterminate ? 'animate-spin' : ''}
      >
        {/* Background Circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-gray-200"
        />
        {/* Progress Circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={indeterminate ? circumference * 0.25 : offset}
          strokeLinecap="round"
          className={`${colorClasses[color]} transition-all duration-300 ease-out`}
          style={{
            transform: 'rotate(-90deg)',
            transformOrigin: 'center',
          }}
        />
      </svg>
      {showLabel && !indeterminate && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-sm font-semibold text-gray-700">
            {Math.round(normalizedValue)}%
          </span>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Step Progress
// ============================================================================

interface Step {
  label: string;
  description?: string;
}

interface StepProgressProps {
  steps: Step[];
  currentStep: number;
  className?: string;
}

export function StepProgress({
  steps,
  currentStep,
  className = '',
}: StepProgressProps) {
  return (
    <div className={className}>
      <div className="flex items-center justify-between">
        {steps.map((step, index) => {
          const isCompleted = index < currentStep;
          const isCurrent = index === currentStep;
          const isUpcoming = index > currentStep;

          return (
            <React.Fragment key={index}>
              <div className="flex flex-col items-center flex-1">
                {/* Circle */}
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold transition-colors ${
                    isCompleted
                      ? 'bg-green-600 text-white'
                      : isCurrent
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-600'
                  }`}
                >
                  {isCompleted ? (
                    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  ) : (
                    index + 1
                  )}
                </div>

                {/* Label */}
                <div className="mt-2 text-center">
                  <p
                    className={`text-sm font-medium ${
                      isCurrent ? 'text-blue-600' : 'text-gray-600'
                    }`}
                  >
                    {step.label}
                  </p>
                  {step.description && (
                    <p className="text-xs text-gray-500 mt-1">
                      {step.description}
                    </p>
                  )}
                </div>
              </div>

              {/* Connector Line */}
              {index < steps.length - 1 && (
                <div className="flex-1 h-0.5 mx-2 mb-8">
                  <div
                    className={`h-full transition-colors ${
                      isCompleted ? 'bg-green-600' : 'bg-gray-200'
                    }`}
                  />
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// Generation Progress (Specific to app)
// ============================================================================

interface GenerationProgressProps {
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress?: number;
  message?: string;
  className?: string;
}

export function GenerationProgress({
  status,
  progress = 0,
  message,
  className = '',
}: GenerationProgressProps) {
  const getStatusColor = () => {
    switch (status) {
      case 'completed':
        return 'green';
      case 'failed':
        return 'red';
      case 'processing':
        return 'blue';
      default:
        return 'blue';
    }
  };

  const getStatusIcon = () => {
    switch (status) {
      case 'completed':
        return (
          <svg className="w-6 h-6 text-green-600" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
              clipRule="evenodd"
            />
          </svg>
        );
      case 'failed':
        return (
          <svg className="w-6 h-6 text-red-600" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
              clipRule="evenodd"
            />
          </svg>
        );
      default:
        return null;
    }
  };

  const getStatusMessage = () => {
    if (message) return message;

    switch (status) {
      case 'pending':
        return 'Waiting to start...';
      case 'processing':
        return `Generating image... ${Math.round(progress)}%`;
      case 'completed':
        return 'Generation complete!';
      case 'failed':
        return 'Generation failed';
      default:
        return '';
    }
  };

  return (
    <div className={`bg-white rounded-lg border border-gray-200 p-6 ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Generation Status</h3>
        {getStatusIcon()}
      </div>

      {status === 'processing' || status === 'pending' ? (
        <>
          <ProgressBar
            value={progress}
            color={getStatusColor()}
            size="lg"
            className="mb-3"
          />
          <p className="text-sm text-gray-600 text-center">{getStatusMessage()}</p>
        </>
      ) : (
        <p className="text-sm text-gray-600">{getStatusMessage()}</p>
      )}
    </div>
  );
}

// ============================================================================
// Upload Progress
// ============================================================================

interface UploadProgressProps {
  filename: string;
  progress: number;
  status: 'uploading' | 'completed' | 'error';
  onCancel?: () => void;
  className?: string;
}

export function UploadProgress({
  filename,
  progress,
  status,
  onCancel,
  className = '',
}: UploadProgressProps) {
  return (
    <div className={`bg-white rounded-lg border border-gray-200 p-4 ${className}`}>
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center space-x-3 flex-1 min-w-0">
          {/* File Icon */}
          <div className="flex-shrink-0">
            {status === 'completed' ? (
              <svg className="w-8 h-8 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
            ) : status === 'error' ? (
              <svg className="w-8 h-8 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd"
                />
              </svg>
            ) : (
              <svg className="w-8 h-8 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                <path d="M8 4a3 3 0 00-3 3v4a5 5 0 0010 0V7a1 1 0 112 0v4a7 7 0 11-14 0V7a5 5 0 0110 0v4a3 3 0 11-6 0V7a1 1 0 012 0v4a1 1 0 102 0V7a3 3 0 00-3-3z" />
              </svg>
            )}
          </div>

          {/* Filename and Status */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{filename}</p>
            <p className="text-xs text-gray-500">
              {status === 'uploading' && `${Math.round(progress)}% uploaded`}
              {status === 'completed' && 'Upload complete'}
              {status === 'error' && 'Upload failed'}
            </p>
          </div>
        </div>

        {/* Cancel Button */}
        {status === 'uploading' && onCancel && (
          <button
            onClick={onCancel}
            className="ml-4 text-gray-400 hover:text-gray-600"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        )}
      </div>

      {/* Progress Bar */}
      {status === 'uploading' && (
        <ProgressBar value={progress} color="blue" size="sm" />
      )}
    </div>
  );
}

// Add indeterminate animation to global CSS
export const progressStyles = `
@keyframes indeterminate {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(400%);
  }
}

.animate-indeterminate {
  width: 25%;
  animation: indeterminate 1.5s infinite ease-in-out;
}
`;
