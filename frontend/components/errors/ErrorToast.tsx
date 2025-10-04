/**
 * Error Toast Component
 *
 * Displays error notifications as dismissible toasts
 */

'use client';

import React, { useEffect, useState } from 'react';
import { classifyError, ErrorInfo } from '@/lib/errors';

interface ToastProps {
  error: ErrorInfo;
  onDismiss: () => void;
  duration?: number;
}

export function ErrorToast({ error, onDismiss, duration = 5000 }: ToastProps) {
  const [isVisible, setIsVisible] = useState(true);
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    if (!error.dismissible) {
      return;
    }

    const timer = setTimeout(() => {
      handleDismiss();
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, error.dismissible]);

  const handleDismiss = () => {
    setIsExiting(true);
    setTimeout(() => {
      setIsVisible(false);
      onDismiss();
    }, 300);
  };

  if (!isVisible) {
    return null;
  }

  const getIconColor = () => {
    switch (error.severity) {
      case 'critical':
      case 'high':
        return 'text-red-600';
      case 'medium':
        return 'text-yellow-600';
      case 'low':
        return 'text-blue-600';
      default:
        return 'text-gray-600';
    }
  };

  const getBgColor = () => {
    switch (error.severity) {
      case 'critical':
      case 'high':
        return 'bg-red-50 border-red-200';
      case 'medium':
        return 'bg-yellow-50 border-yellow-200';
      case 'low':
        return 'bg-blue-50 border-blue-200';
      default:
        return 'bg-gray-50 border-gray-200';
    }
  };

  return (
    <div
      className={`fixed bottom-4 right-4 max-w-md w-full ${
        isExiting ? 'animate-slide-out' : 'animate-slide-in'
      } z-50`}
    >
      <div
        className={`${getBgColor()} border rounded-lg shadow-lg p-4 transition-all`}
      >
        <div className="flex items-start">
          {/* Icon */}
          <div className="flex-shrink-0">
            <svg
              className={`h-6 w-6 ${getIconColor()}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              {error.severity === 'critical' || error.severity === 'high' ? (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              ) : (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              )}
            </svg>
          </div>

          {/* Content */}
          <div className="ml-3 flex-1">
            <h3 className="text-sm font-semibold text-gray-900">
              {error.title}
            </h3>
            <p className="mt-1 text-sm text-gray-700">{error.message}</p>

            {/* Action Button */}
            {error.action && (
              <button
                onClick={() => {
                  error.action!.onClick();
                  handleDismiss();
                }}
                className="mt-3 text-sm font-medium text-blue-600 hover:text-blue-700 underline"
              >
                {error.action.label}
              </button>
            )}
          </div>

          {/* Dismiss Button */}
          {error.dismissible && (
            <button
              onClick={handleDismiss}
              className="ml-4 flex-shrink-0 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <span className="sr-only">Dismiss</span>
              <svg
                className="h-5 w-5"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
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
    </div>
  );
}

// ============================================================================
// Toast Container - Manages multiple toasts
// ============================================================================

interface Toast {
  id: string;
  error: ErrorInfo;
}

export function ErrorToastContainer() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    // Listen for error events
    const handleError = (event: Event) => {
      const customEvent = event as CustomEvent<{ error: unknown }>;
      const errorInfo = classifyError(customEvent.detail.error);

      const toast: Toast = {
        id: Date.now().toString(),
        error: errorInfo,
      };

      setToasts((prev) => [...prev, toast]);
    };

    window.addEventListener('app:error' as any, handleError);

    return () => {
      window.removeEventListener('app:error' as any, handleError);
    };
  }, []);

  const handleDismiss = (id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  };

  return (
    <>
      {toasts.map((toast, index) => (
        <div
          key={toast.id}
          style={{ bottom: `${index * 120 + 16}px` }}
          className="fixed right-4 z-50"
        >
          <ErrorToast
            error={toast.error}
            onDismiss={() => handleDismiss(toast.id)}
          />
        </div>
      ))}
    </>
  );
}

// ============================================================================
// Helper function to show error toast
// ============================================================================

export function showErrorToast(error: unknown): void {
  if (typeof window !== 'undefined') {
    const event = new CustomEvent('app:error', {
      detail: { error },
    });
    window.dispatchEvent(event);
  }
}

// Add CSS animations to global styles
export const toastStyles = `
@keyframes slide-in {
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

@keyframes slide-out {
  from {
    transform: translateX(0);
    opacity: 1;
  }
  to {
    transform: translateX(100%);
    opacity: 0;
  }
}

.animate-slide-in {
  animation: slide-in 0.3s ease-out;
}

.animate-slide-out {
  animation: slide-out 0.3s ease-in;
}
`;
