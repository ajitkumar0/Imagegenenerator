/**
 * Auth Callback Page
 *
 * Handles the redirect from Azure AD B2C after authentication.
 * MSAL will automatically process the response and trigger the
 * authentication flow in the AuthProvider.
 */

'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/auth-context';

export default function AuthCallbackPage() {
  const { isAuthenticated, isLoading, error } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // If authenticated, redirect to return URL or dashboard
    if (!isLoading && isAuthenticated) {
      const returnUrl = sessionStorage.getItem('auth_return_url') || '/generate';
      sessionStorage.removeItem('auth_return_url');
      router.push(returnUrl);
    }

    // If error, redirect to login
    if (!isLoading && error) {
      setTimeout(() => {
        router.push('/auth/login?error=authentication_failed');
      }, 2000);
    }
  }, [isAuthenticated, isLoading, error, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="text-center">
        {error ? (
          <>
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Authentication Failed</h2>
            <p className="text-gray-600 mb-4">{error}</p>
            <p className="text-sm text-gray-500">Redirecting to login...</p>
          </>
        ) : (
          <>
            <div className="relative w-16 h-16 mx-auto mb-4">
              <div className="absolute inset-0 border-4 border-blue-200 rounded-full"></div>
              <div className="absolute inset-0 border-4 border-blue-600 rounded-full border-t-transparent animate-spin"></div>
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Completing Sign In</h2>
            <p className="text-gray-600">Please wait while we verify your credentials...</p>
          </>
        )}
      </div>
    </div>
  );
}
