/**
 * Error Handling Utilities
 *
 * Provides error classification, user-friendly messages, and recovery actions
 */

import { APIError } from './types/api';

// ============================================================================
// Error Types
// ============================================================================

export enum ErrorType {
  AUTHENTICATION = 'authentication',
  AUTHORIZATION = 'authorization',
  RATE_LIMIT = 'rate_limit',
  PAYMENT_REQUIRED = 'payment_required',
  VALIDATION = 'validation',
  NOT_FOUND = 'not_found',
  SERVER_ERROR = 'server_error',
  NETWORK_ERROR = 'network_error',
  TIMEOUT = 'timeout',
  UNKNOWN = 'unknown',
}

export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export interface ErrorInfo {
  type: ErrorType;
  severity: ErrorSeverity;
  title: string;
  message: string;
  action?: ErrorAction;
  retry?: boolean;
  dismissible?: boolean;
}

export interface ErrorAction {
  label: string;
  onClick: () => void;
}

// ============================================================================
// Error Classification
// ============================================================================

export function classifyError(error: APIError | Error | unknown): ErrorInfo {
  // Handle APIError from backend
  if (isAPIError(error)) {
    return classifyAPIError(error);
  }

  // Handle JavaScript Error
  if (error instanceof Error) {
    return {
      type: ErrorType.UNKNOWN,
      severity: ErrorSeverity.MEDIUM,
      title: 'Error',
      message: error.message,
      retry: true,
      dismissible: true,
    };
  }

  // Handle unknown error
  return {
    type: ErrorType.UNKNOWN,
    severity: ErrorSeverity.MEDIUM,
    title: 'Unexpected Error',
    message: 'An unexpected error occurred. Please try again.',
    retry: true,
    dismissible: true,
  };
}

function isAPIError(error: unknown): error is APIError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status_code' in error &&
    'detail' in error
  );
}

function classifyAPIError(error: APIError): ErrorInfo {
  const statusCode = error.status_code;

  // 401 Unauthorized
  if (statusCode === 401) {
    return {
      type: ErrorType.AUTHENTICATION,
      severity: ErrorSeverity.HIGH,
      title: 'Authentication Required',
      message: 'Your session has expired. Please sign in again.',
      action: {
        label: 'Sign In',
        onClick: () => {
          window.location.href = '/auth/login';
        },
      },
      retry: false,
      dismissible: false,
    };
  }

  // 403 Forbidden
  if (statusCode === 403) {
    return {
      type: ErrorType.AUTHORIZATION,
      severity: ErrorSeverity.HIGH,
      title: 'Upgrade Required',
      message: 'This feature requires a premium subscription.',
      action: {
        label: 'View Plans',
        onClick: () => {
          window.location.href = '/pricing';
        },
      },
      retry: false,
      dismissible: true,
    };
  }

  // 402 Payment Required (Insufficient Credits)
  if (statusCode === 402) {
    return {
      type: ErrorType.PAYMENT_REQUIRED,
      severity: ErrorSeverity.MEDIUM,
      title: 'Insufficient Credits',
      message: error.detail || 'You don\'t have enough credits for this operation.',
      action: {
        label: 'Upgrade Plan',
        onClick: () => {
          window.location.href = '/pricing';
        },
      },
      retry: false,
      dismissible: true,
    };
  }

  // 429 Too Many Requests
  if (statusCode === 429) {
    return {
      type: ErrorType.RATE_LIMIT,
      severity: ErrorSeverity.MEDIUM,
      title: 'Rate Limit Exceeded',
      message: 'You\'re making too many requests. Please wait a moment and try again.',
      retry: true,
      dismissible: true,
    };
  }

  // 404 Not Found
  if (statusCode === 404) {
    return {
      type: ErrorType.NOT_FOUND,
      severity: ErrorSeverity.LOW,
      title: 'Not Found',
      message: error.detail || 'The requested resource was not found.',
      retry: false,
      dismissible: true,
    };
  }

  // 422 Validation Error
  if (statusCode === 422) {
    return {
      type: ErrorType.VALIDATION,
      severity: ErrorSeverity.LOW,
      title: 'Validation Error',
      message: error.detail || 'Please check your input and try again.',
      retry: false,
      dismissible: true,
    };
  }

  // 500+ Server Errors
  if (statusCode >= 500) {
    return {
      type: ErrorType.SERVER_ERROR,
      severity: ErrorSeverity.HIGH,
      title: 'Server Error',
      message: 'Something went wrong on our end. Please try again in a moment.',
      retry: true,
      dismissible: true,
    };
  }

  // Network Error
  if (error.error_code === 'NETWORK_ERROR') {
    return {
      type: ErrorType.NETWORK_ERROR,
      severity: ErrorSeverity.HIGH,
      title: 'Connection Failed',
      message: 'Unable to connect to the server. Please check your internet connection and try again.',
      retry: true,
      dismissible: true,
    };
  }

  // Timeout
  if (error.error_code === 'TIMEOUT') {
    return {
      type: ErrorType.TIMEOUT,
      severity: ErrorSeverity.MEDIUM,
      title: 'Request Timeout',
      message: 'The request took too long to complete. Please try again.',
      retry: true,
      dismissible: true,
    };
  }

  // Default error
  return {
    type: ErrorType.UNKNOWN,
    severity: ErrorSeverity.MEDIUM,
    title: 'Error',
    message: error.detail || 'An error occurred. Please try again.',
    retry: true,
    dismissible: true,
  };
}

// ============================================================================
// User-Friendly Error Messages
// ============================================================================

export function getUserFriendlyMessage(error: APIError | Error | unknown): string {
  const errorInfo = classifyError(error);
  return errorInfo.message;
}

export function getErrorTitle(error: APIError | Error | unknown): string {
  const errorInfo = classifyError(error);
  return errorInfo.title;
}

export function shouldRetry(error: APIError | Error | unknown): boolean {
  const errorInfo = classifyError(error);
  return errorInfo.retry ?? false;
}

// ============================================================================
// Error Logging
// ============================================================================

export function logError(
  error: APIError | Error | unknown,
  context?: Record<string, any>
): void {
  const errorInfo = classifyError(error);

  // Log to console in development
  if (process.env.NODE_ENV === 'development') {
    console.error('[Error]', {
      ...errorInfo,
      context,
      originalError: error,
    });
  }

  // In production, send to error tracking service (e.g., Sentry)
  if (process.env.NODE_ENV === 'production') {
    // Example: Sentry.captureException(error, { contexts: { custom: context } });
  }
}

// ============================================================================
// Error Recovery Strategies
// ============================================================================

export interface RetryOptions {
  maxAttempts?: number;
  delay?: number;
  backoff?: boolean;
  onRetry?: (attempt: number) => void;
}

export async function retryOperation<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    delay = 1000,
    backoff = true,
    onRetry,
  } = options;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      // Don't retry on authentication errors
      if (isAPIError(error) && error.status_code === 401) {
        throw error;
      }

      // Don't retry on validation errors
      if (isAPIError(error) && error.status_code === 422) {
        throw error;
      }

      // Don't retry if not retriable
      if (!shouldRetry(error)) {
        throw error;
      }

      // Last attempt, throw error
      if (attempt === maxAttempts) {
        throw error;
      }

      // Calculate delay with exponential backoff
      const retryDelay = backoff ? delay * Math.pow(2, attempt - 1) : delay;

      // Notify about retry
      onRetry?.(attempt);

      // Wait before retrying
      await new Promise((resolve) => setTimeout(resolve, retryDelay));
    }
  }

  throw lastError;
}

// ============================================================================
// Specific Error Handlers
// ============================================================================

export function handleAuthenticationError(): void {
  // Clear tokens
  if (typeof window !== 'undefined') {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('refresh_token');

    // Redirect to login with return URL
    const returnUrl = encodeURIComponent(window.location.pathname);
    window.location.href = `/auth/login?returnUrl=${returnUrl}`;
  }
}

export function handleInsufficientCreditsError(): void {
  if (typeof window !== 'undefined') {
    window.location.href = '/pricing';
  }
}

export function handleRateLimitError(): void {
  // Show toast notification
  if (typeof window !== 'undefined') {
    // Will be implemented with toast system
    console.warn('Rate limit exceeded. Please wait before making more requests.');
  }
}

export function handleServerError(): void {
  // Log error for monitoring
  logError(new Error('Server error encountered'));
}

// ============================================================================
// Error Boundary Support
// ============================================================================

export function isRecoverableError(error: Error): boolean {
  // Check if error is recoverable (non-fatal)
  const fatalErrors = [
    'ChunkLoadError', // Code splitting error
    'Module not found', // Build error
  ];

  return !fatalErrors.some((fatalError) =>
    error.message.includes(fatalError)
  );
}

export function getRecoveryAction(error: Error): (() => void) | null {
  // ChunkLoadError - reload page
  if (error.message.includes('ChunkLoadError')) {
    return () => window.location.reload();
  }

  return null;
}
