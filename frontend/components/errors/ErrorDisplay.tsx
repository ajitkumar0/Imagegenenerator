/**
 * Inline Error Display Components
 *
 * Display errors inline within forms and pages
 */

'use client';

import React from 'react';
import { classifyError, ErrorInfo } from '@/lib/errors';

interface ErrorDisplayProps {
  error: unknown;
  onRetry?: () => void;
  onDismiss?: () => void;
  className?: string;
}

export function ErrorDisplay({
  error,
  onRetry,
  onDismiss,
  className = '',
}: ErrorDisplayProps) {
  if (!error) return null;

  const errorInfo = classifyError(error);

  return (
    <div
      className={`rounded-lg border p-4 ${className} ${
        errorInfo.severity === 'high' || errorInfo.severity === 'critical'
          ? 'bg-red-50 border-red-200'
          : errorInfo.severity === 'medium'
          ? 'bg-yellow-50 border-yellow-200'
          : 'bg-blue-50 border-blue-200'
      }`}
    >
      <div className="flex items-start">
        <div className="flex-shrink-0">
          <svg
            className={`h-5 w-5 ${
              errorInfo.severity === 'high' || errorInfo.severity === 'critical'
                ? 'text-red-400'
                : errorInfo.severity === 'medium'
                ? 'text-yellow-400'
                : 'text-blue-400'
            }`}
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
              clipRule="evenodd"
            />
          </svg>
        </div>

        <div className="ml-3 flex-1">
          <h3
            className={`text-sm font-semibold ${
              errorInfo.severity === 'high' || errorInfo.severity === 'critical'
                ? 'text-red-900'
                : errorInfo.severity === 'medium'
                ? 'text-yellow-900'
                : 'text-blue-900'
            }`}
          >
            {errorInfo.title}
          </h3>
          <p
            className={`mt-1 text-sm ${
              errorInfo.severity === 'high' || errorInfo.severity === 'critical'
                ? 'text-red-800'
                : errorInfo.severity === 'medium'
                ? 'text-yellow-800'
                : 'text-blue-800'
            }`}
          >
            {errorInfo.message}
          </p>

          {/* Action Buttons */}
          <div className="mt-3 flex space-x-3">
            {errorInfo.retry && onRetry && (
              <button
                onClick={onRetry}
                className="text-sm font-medium text-blue-600 hover:text-blue-700 underline"
              >
                Try Again
              </button>
            )}

            {errorInfo.action && (
              <button
                onClick={errorInfo.action.onClick}
                className="text-sm font-medium text-blue-600 hover:text-blue-700 underline"
              >
                {errorInfo.action.label}
              </button>
            )}
          </div>
        </div>

        {/* Dismiss Button */}
        {errorInfo.dismissible && onDismiss && (
          <button
            onClick={onDismiss}
            className={`ml-auto flex-shrink-0 ${
              errorInfo.severity === 'high' || errorInfo.severity === 'critical'
                ? 'text-red-400 hover:text-red-600'
                : errorInfo.severity === 'medium'
                ? 'text-yellow-400 hover:text-yellow-600'
                : 'text-blue-400 hover:text-blue-600'
            } transition-colors`}
          >
            <span className="sr-only">Dismiss</span>
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Compact Error Display (for forms)
// ============================================================================

interface CompactErrorProps {
  error: unknown;
  className?: string;
}

export function CompactError({ error, className = '' }: CompactErrorProps) {
  if (!error) return null;

  const errorInfo = classifyError(error);

  return (
    <div className={`flex items-center space-x-2 text-sm text-red-600 ${className}`}>
      <svg className="h-4 w-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
          clipRule="evenodd"
        />
      </svg>
      <span>{errorInfo.message}</span>
    </div>
  );
}

// ============================================================================
// Empty State with Error
// ============================================================================

interface EmptyStateProps {
  error?: unknown;
  title?: string;
  message?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function EmptyStateError({
  error,
  title = 'Something went wrong',
  message = 'We encountered an error loading this content.',
  action,
}: EmptyStateProps) {
  const errorInfo = error ? classifyError(error) : null;

  return (
    <div className="text-center py-12">
      <svg
        className="mx-auto h-12 w-12 text-gray-400"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
        />
      </svg>
      <h3 className="mt-4 text-lg font-semibold text-gray-900">
        {errorInfo?.title || title}
      </h3>
      <p className="mt-2 text-sm text-gray-600">
        {errorInfo?.message || message}
      </p>
      {(errorInfo?.action || action) && (
        <button
          onClick={errorInfo?.action?.onClick || action?.onClick}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
        >
          {errorInfo?.action?.label || action?.label}
        </button>
      )}
    </div>
  );
}

// ============================================================================
// Loading State with Error Fallback
// ============================================================================

interface LoadingStateProps {
  loading: boolean;
  error: unknown;
  children: React.ReactNode;
  onRetry?: () => void;
  loadingMessage?: string;
}

export function LoadingStateWithError({
  loading,
  error,
  children,
  onRetry,
  loadingMessage = 'Loading...',
}: LoadingStateProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">{loadingMessage}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return <EmptyStateError error={error} action={onRetry ? { label: 'Try Again', onClick: onRetry } : undefined} />;
  }

  return <>{children}</>;
}
