/**
 * Authentication Context Provider
 *
 * Manages authentication state, token management, and user session
 * using Azure AD B2C and MSAL.js
 */

'use client';

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
} from 'react';
import {
  PublicClientApplication,
  AccountInfo,
  AuthenticationResult,
  InteractionRequiredAuthError,
  EventType,
  EventMessage,
  AuthError,
} from '@azure/msal-browser';
import {
  msalConfig,
  loginRequest,
  silentRequest,
  logoutRequest,
  passwordResetRequest,
  editProfileRequest,
  isPasswordResetError,
  isCancelError,
} from './msal-config';
import { TokenManager } from '../api-client';
import { UserProfile } from '../types/api';
import apiClient from '../api-client';

// ============================================================================
// Types
// ============================================================================

interface AuthContextType {
  // State
  isAuthenticated: boolean;
  isLoading: boolean;
  user: UserProfile | null;
  account: AccountInfo | null;
  error: string | null;

  // Methods
  login: () => Promise<void>;
  loginPopup: () => Promise<void>;
  logout: () => Promise<void>;
  acquireToken: (forceRefresh?: boolean) => Promise<string | null>;
  resetPassword: () => Promise<void>;
  editProfile: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ============================================================================
// MSAL Instance (Singleton)
// ============================================================================

let msalInstance: PublicClientApplication | null = null;

function getMsalInstance(): PublicClientApplication {
  if (!msalInstance) {
    msalInstance = new PublicClientApplication(msalConfig);
  }
  return msalInstance;
}

// ============================================================================
// Auth Provider Component
// ============================================================================

interface AuthProviderProps {
  children: React.ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  const msal = useRef<PublicClientApplication | null>(null);
  const initializePromise = useRef<Promise<void> | null>(null);

  // ==========================================================================
  // Initialize MSAL
  // ==========================================================================

  const initializeMsal = useCallback(async () => {
    if (initializePromise.current) {
      return initializePromise.current;
    }

    initializePromise.current = (async () => {
      try {
        msal.current = getMsalInstance();
        await msal.current.initialize();

        // Handle redirect response after login
        const response = await msal.current.handleRedirectPromise();
        if (response) {
          await handleAuthenticationResponse(response);
        }

        // Set up event callback
        msal.current.addEventCallback((event: EventMessage) => {
          if (event.eventType === EventType.LOGIN_SUCCESS && event.payload) {
            const payload = event.payload as AuthenticationResult;
            handleAuthenticationResponse(payload);
          }

          if (event.eventType === EventType.LOGOUT_SUCCESS) {
            handleLogout();
          }
        });

        // Check if user is already logged in
        const accounts = msal.current.getAllAccounts();
        if (accounts.length > 0) {
          msal.current.setActiveAccount(accounts[0]);
          setAccount(accounts[0]);

          // Verify existing session with backend
          try {
            const token = await acquireToken(false);
            if (token) {
              await loadUserProfile();
              setIsAuthenticated(true);
            }
          } catch (error) {
            console.error('Failed to verify existing session:', error);
            // Clear invalid session
            TokenManager.clearTokens();
          }
        }
      } catch (error) {
        console.error('Failed to initialize MSAL:', error);
        setError('Failed to initialize authentication');
      } finally {
        setIsLoading(false);
      }
    })();

    return initializePromise.current;
  }, []);

  useEffect(() => {
    initializeMsal();

    // Listen for unauthorized events from API client
    const handleUnauthorized = () => {
      logout();
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('auth:unauthorized', handleUnauthorized);
      return () => {
        window.removeEventListener('auth:unauthorized', handleUnauthorized);
      };
    }
  }, [initializeMsal]);

  // ==========================================================================
  // Authentication Response Handler
  // ==========================================================================

  const handleAuthenticationResponse = async (response: AuthenticationResult) => {
    try {
      if (!msal.current) return;

      msal.current.setActiveAccount(response.account);
      setAccount(response.account);

      // Step 1: Verify ID token with backend and get access token
      if (response.idToken) {
        try {
          const verifyResponse = await apiClient.request<{
            user: UserProfile;
            access_token: string;
          }>({
            method: 'POST',
            url: '/auth/verify',
            data: { id_token: response.idToken },
          });

          // Store backend access token
          TokenManager.setToken(verifyResponse.access_token);

          // Set user profile
          setUser(verifyResponse.user);
        } catch (verifyError) {
          console.error('Token verification failed:', verifyError);
          setError('Authentication verification failed');
          await logout();
          return;
        }
      }

      setIsAuthenticated(true);
      setError(null);

      // Navigate to return URL if available
      const returnUrl = sessionStorage.getItem('auth_return_url');
      if (returnUrl) {
        sessionStorage.removeItem('auth_return_url');
        window.location.href = returnUrl;
      }
    } catch (error) {
      console.error('Error handling authentication response:', error);
      setError('Failed to complete authentication');
    }
  };

  // ==========================================================================
  // Load User Profile
  // ==========================================================================

  const loadUserProfile = async () => {
    try {
      const userProfile = await apiClient.getCurrentUser();
      setUser(userProfile);
    } catch (error) {
      console.error('Failed to load user profile:', error);
      // Don't set error state here, as token might be valid but profile fetch failed
    }
  };

  // ==========================================================================
  // Login (Redirect)
  // ==========================================================================

  const login = async () => {
    if (!msal.current) {
      await initializeMsal();
    }

    try {
      setIsLoading(true);
      setError(null);
      await msal.current!.loginRedirect(loginRequest);
    } catch (error) {
      console.error('Login failed:', error);

      if (isPasswordResetError(error)) {
        await resetPassword();
        return;
      }

      if (!isCancelError(error)) {
        setError('Login failed. Please try again.');
      }
      setIsLoading(false);
    }
  };

  // ==========================================================================
  // Login (Popup)
  // ==========================================================================

  const loginPopup = async () => {
    if (!msal.current) {
      await initializeMsal();
    }

    try {
      setIsLoading(true);
      setError(null);

      const response = await msal.current!.loginPopup(loginRequest);
      await handleAuthenticationResponse(response);
    } catch (error) {
      console.error('Popup login failed:', error);

      if (isPasswordResetError(error)) {
        await resetPassword();
        return;
      }

      if (!isCancelError(error)) {
        setError('Login failed. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // ==========================================================================
  // Logout
  // ==========================================================================

  const logout = async () => {
    if (!msal.current) return;

    try {
      setIsLoading(true);
      TokenManager.clearTokens();

      const currentAccount = msal.current.getActiveAccount();
      if (currentAccount) {
        await msal.current.logoutRedirect({
          ...logoutRequest,
          account: currentAccount,
        });
      }

      handleLogout();
    } catch (error) {
      console.error('Logout failed:', error);
      setError('Logout failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setUser(null);
    setAccount(null);
    TokenManager.clearTokens();
  };

  // ==========================================================================
  // Acquire Token (with Silent Refresh)
  // ==========================================================================

  const acquireToken = async (forceRefresh = false): Promise<string | null> => {
    if (!msal.current) {
      await initializeMsal();
    }

    const currentAccount = msal.current!.getActiveAccount();
    if (!currentAccount) {
      return null;
    }

    try {
      const response = await msal.current!.acquireTokenSilent({
        ...silentRequest,
        account: currentAccount,
        forceRefresh,
      });

      if (response.idToken) {
        TokenManager.setToken(response.idToken);
        return response.idToken;
      }

      return null;
    } catch (error) {
      if (error instanceof InteractionRequiredAuthError) {
        try {
          // Fallback to interactive method
          const response = await msal.current!.acquireTokenPopup({
            ...silentRequest,
            account: currentAccount,
          });

          if (response.idToken) {
            TokenManager.setToken(response.idToken);
            return response.idToken;
          }
        } catch (popupError) {
          console.error('Token acquisition failed:', popupError);
          if (!isCancelError(popupError)) {
            await logout();
          }
        }
      } else {
        console.error('Token acquisition failed:', error);
      }

      return null;
    }
  };

  // ==========================================================================
  // Password Reset
  // ==========================================================================

  const resetPassword = async () => {
    if (!msal.current) {
      await initializeMsal();
    }

    try {
      setError(null);
      await msal.current!.loginRedirect(passwordResetRequest);
    } catch (error) {
      console.error('Password reset failed:', error);
      if (!isCancelError(error)) {
        setError('Password reset failed. Please try again.');
      }
    }
  };

  // ==========================================================================
  // Edit Profile
  // ==========================================================================

  const editProfile = async () => {
    if (!msal.current) {
      await initializeMsal();
    }

    try {
      setError(null);
      await msal.current!.loginRedirect(editProfileRequest);
    } catch (error) {
      console.error('Profile edit failed:', error);
      if (!isCancelError(error)) {
        setError('Profile edit failed. Please try again.');
      }
    }
  };

  // ==========================================================================
  // Clear Error
  // ==========================================================================

  const clearError = () => {
    setError(null);
  };

  // ==========================================================================
  // Context Value
  // ==========================================================================

  const value: AuthContextType = {
    isAuthenticated,
    isLoading,
    user,
    account,
    error,
    login,
    loginPopup,
    logout,
    acquireToken,
    resetPassword,
    editProfile,
    clearError,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ============================================================================
// useAuth Hook
// ============================================================================

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);

  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
}

// ============================================================================
// Export
// ============================================================================

export default AuthProvider;
