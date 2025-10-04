/**
 * Spinner Components
 *
 * Loading spinners for API calls and async operations
 */

'use client';

import React from 'react';

// ============================================================================
// Base Spinner
// ============================================================================

interface SpinnerProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  color?: 'blue' | 'white' | 'gray' | 'green' | 'red';
  className?: string;
}

export function Spinner({
  size = 'md',
  color = 'blue',
  className = '',
}: SpinnerProps) {
  const sizeClasses = {
    xs: 'w-3 h-3',
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8',
    xl: 'w-12 h-12',
  };

  const colorClasses = {
    blue: 'border-blue-600',
    white: 'border-white',
    gray: 'border-gray-600',
    green: 'border-green-600',
    red: 'border-red-600',
  };

  return (
    <div
      className={`inline-block animate-spin rounded-full border-2 border-solid border-current border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite] ${sizeClasses[size]} ${colorClasses[color]} ${className}`}
      role="status"
    >
      <span className="sr-only">Loading...</span>
    </div>
  );
}

// ============================================================================
// Spinner with Label
// ============================================================================

interface SpinnerWithLabelProps {
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function SpinnerWithLabel({
  label = 'Loading...',
  size = 'md',
  className = '',
}: SpinnerWithLabelProps) {
  return (
    <div className={`flex flex-col items-center justify-center ${className}`}>
      <Spinner size={size} />
      <p className="mt-3 text-sm text-gray-600">{label}</p>
    </div>
  );
}

// ============================================================================
// Overlay Spinner (Full screen)
// ============================================================================

interface OverlaySpinnerProps {
  message?: string;
  show: boolean;
}

export function OverlaySpinner({ message, show }: OverlaySpinnerProps) {
  if (!show) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm">
      <div className="bg-white rounded-lg p-6 shadow-xl">
        <SpinnerWithLabel label={message} size="lg" />
      </div>
    </div>
  );
}

// ============================================================================
// Page Spinner (Centered in container)
// ============================================================================

interface PageSpinnerProps {
  message?: string;
  className?: string;
}

export function PageSpinner({
  message = 'Loading...',
  className = '',
}: PageSpinnerProps) {
  return (
    <div className={`min-h-[400px] flex items-center justify-center ${className}`}>
      <SpinnerWithLabel label={message} size="lg" />
    </div>
  );
}

// ============================================================================
// Dots Spinner
// ============================================================================

interface DotsSpinnerProps {
  color?: 'blue' | 'gray' | 'white';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function DotsSpinner({
  color = 'blue',
  size = 'md',
  className = '',
}: DotsSpinnerProps) {
  const sizeClasses = {
    sm: 'w-2 h-2',
    md: 'w-3 h-3',
    lg: 'w-4 h-4',
  };

  const colorClasses = {
    blue: 'bg-blue-600',
    gray: 'bg-gray-600',
    white: 'bg-white',
  };

  return (
    <div className={`flex space-x-2 ${className}`}>
      <div
        className={`${sizeClasses[size]} ${colorClasses[color]} rounded-full animate-bounce`}
        style={{ animationDelay: '0ms' }}
      />
      <div
        className={`${sizeClasses[size]} ${colorClasses[color]} rounded-full animate-bounce`}
        style={{ animationDelay: '150ms' }}
      />
      <div
        className={`${sizeClasses[size]} ${colorClasses[color]} rounded-full animate-bounce`}
        style={{ animationDelay: '300ms' }}
      />
    </div>
  );
}

// ============================================================================
// Pulse Spinner
// ============================================================================

export function PulseSpinner({ className = '' }: { className?: string }) {
  return (
    <div className={`flex space-x-2 ${className}`}>
      <div className="w-3 h-3 bg-blue-600 rounded-full animate-pulse" />
      <div className="w-3 h-3 bg-blue-600 rounded-full animate-pulse animation-delay-200" />
      <div className="w-3 h-3 bg-blue-600 rounded-full animate-pulse animation-delay-400" />
    </div>
  );
}

// ============================================================================
// Loading Button (Button with spinner)
// ============================================================================

interface LoadingButtonProps {
  loading?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit' | 'reset';
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  className?: string;
  loadingText?: string;
}

export function LoadingButton({
  loading = false,
  disabled = false,
  children,
  onClick,
  type = 'button',
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className = '',
  loadingText,
}: LoadingButtonProps) {
  const baseClasses = 'inline-flex items-center justify-center font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed';

  const variantClasses = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500',
    secondary: 'bg-gray-200 text-gray-900 hover:bg-gray-300 focus:ring-gray-500',
    danger: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500',
    ghost: 'bg-transparent text-blue-600 hover:bg-blue-50 focus:ring-blue-500',
  };

  const sizeClasses = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-base',
    lg: 'px-6 py-3 text-lg',
  };

  const spinnerSizes = {
    sm: 'xs' as const,
    md: 'sm' as const,
    lg: 'md' as const,
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={`
        ${baseClasses}
        ${variantClasses[variant]}
        ${sizeClasses[size]}
        ${fullWidth ? 'w-full' : ''}
        ${className}
      `}
    >
      {loading && (
        <Spinner
          size={spinnerSizes[size]}
          color={variant === 'secondary' ? 'gray' : 'white'}
          className="mr-2"
        />
      )}
      {loading && loadingText ? loadingText : children}
    </button>
  );
}

// ============================================================================
// Icon Button with Loading
// ============================================================================

interface LoadingIconButtonProps {
  loading?: boolean;
  disabled?: boolean;
  icon: React.ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  ariaLabel?: string;
}

export function LoadingIconButton({
  loading = false,
  disabled = false,
  icon,
  onClick,
  variant = 'primary',
  size = 'md',
  className = '',
  ariaLabel,
}: LoadingIconButtonProps) {
  const baseClasses = 'inline-flex items-center justify-center font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed';

  const variantClasses = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500',
    secondary: 'bg-gray-200 text-gray-900 hover:bg-gray-300 focus:ring-gray-500',
    danger: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500',
    ghost: 'bg-transparent text-gray-600 hover:bg-gray-100 focus:ring-gray-500',
  };

  const sizeClasses = {
    sm: 'p-1.5',
    md: 'p-2',
    lg: 'p-3',
  };

  const spinnerSizes = {
    sm: 'xs' as const,
    md: 'sm' as const,
    lg: 'md' as const,
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      aria-label={ariaLabel}
      className={`
        ${baseClasses}
        ${variantClasses[variant]}
        ${sizeClasses[size]}
        ${className}
      `}
    >
      {loading ? (
        <Spinner
          size={spinnerSizes[size]}
          color={variant === 'secondary' || variant === 'ghost' ? 'gray' : 'white'}
        />
      ) : (
        icon
      )}
    </button>
  );
}

// ============================================================================
// Inline Loading (for content areas)
// ============================================================================

interface InlineLoadingProps {
  message?: string;
  className?: string;
}

export function InlineLoading({
  message = 'Loading...',
  className = '',
}: InlineLoadingProps) {
  return (
    <div className={`flex items-center space-x-2 text-gray-600 ${className}`}>
      <Spinner size="sm" />
      <span className="text-sm">{message}</span>
    </div>
  );
}
