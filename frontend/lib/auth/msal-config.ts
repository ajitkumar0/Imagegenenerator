/**
 * Microsoft Authentication Library (MSAL) Configuration
 *
 * Azure AD B2C configuration for authentication
 */

import {
  Configuration,
  PopupRequest,
  RedirectRequest,
  SilentRequest,
  EndSessionRequest,
} from '@azure/msal-browser';

// ============================================================================
// Environment Variables
// ============================================================================

const TENANT_NAME = process.env.NEXT_PUBLIC_AZURE_AD_B2C_TENANT!;
const CLIENT_ID = process.env.NEXT_PUBLIC_AZURE_AD_B2C_CLIENT_ID!;
const POLICY_NAME = process.env.NEXT_PUBLIC_AZURE_AD_B2C_POLICY_NAME || 'B2C_1_signupsignin';
const REDIRECT_URI = process.env.NEXT_PUBLIC_REDIRECT_URI || `${typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'}/auth/callback`;
const POST_LOGOUT_REDIRECT_URI = process.env.NEXT_PUBLIC_POST_LOGOUT_REDIRECT_URI || `${typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'}`;

// Validate required environment variables
if (typeof window !== 'undefined') {
  if (!TENANT_NAME) {
    console.error('NEXT_PUBLIC_AZURE_AD_B2C_TENANT is not set');
  }
  if (!CLIENT_ID) {
    console.error('NEXT_PUBLIC_AZURE_AD_B2C_CLIENT_ID is not set');
  }
}

// ============================================================================
// B2C Authority URLs
// ============================================================================

const B2C_DOMAIN = `${TENANT_NAME}.b2clogin.com`;
const AUTHORITY_DOMAIN = `https://${B2C_DOMAIN}/${TENANT_NAME}.onmicrosoft.com`;

export const b2cPolicies = {
  names: {
    signUpSignIn: POLICY_NAME,
    forgotPassword: process.env.NEXT_PUBLIC_AZURE_AD_B2C_FORGOT_PASSWORD_POLICY || 'B2C_1_password_reset',
    editProfile: process.env.NEXT_PUBLIC_AZURE_AD_B2C_EDIT_PROFILE_POLICY || 'B2C_1_profile_edit',
  },
  authorities: {
    signUpSignIn: {
      authority: `${AUTHORITY_DOMAIN}/${POLICY_NAME}`,
    },
    forgotPassword: {
      authority: `${AUTHORITY_DOMAIN}/${process.env.NEXT_PUBLIC_AZURE_AD_B2C_FORGOT_PASSWORD_POLICY || 'B2C_1_password_reset'}`,
    },
    editProfile: {
      authority: `${AUTHORITY_DOMAIN}/${process.env.NEXT_PUBLIC_AZURE_AD_B2C_EDIT_PROFILE_POLICY || 'B2C_1_profile_edit'}`,
    },
  },
  authorityDomain: B2C_DOMAIN,
};

// ============================================================================
// API Scopes
// ============================================================================

export const apiScopes = {
  read: [process.env.NEXT_PUBLIC_API_SCOPE || `https://${TENANT_NAME}.onmicrosoft.com/api/read`],
  write: [process.env.NEXT_PUBLIC_API_SCOPE || `https://${TENANT_NAME}.onmicrosoft.com/api/write`],
};

// ============================================================================
// MSAL Configuration
// ============================================================================

export const msalConfig: Configuration = {
  auth: {
    clientId: CLIENT_ID,
    authority: b2cPolicies.authorities.signUpSignIn.authority,
    knownAuthorities: [b2cPolicies.authorityDomain],
    redirectUri: REDIRECT_URI,
    postLogoutRedirectUri: POST_LOGOUT_REDIRECT_URI,
    navigateToLoginRequestUrl: false,
  },
  cache: {
    cacheLocation: 'localStorage', // Use localStorage for persistence across sessions
    storeAuthStateInCookie: false, // Set to true for IE11 or Edge support
    secureCookies: process.env.NODE_ENV === 'production',
  },
  system: {
    loggerOptions: {
      loggerCallback: (level, message, containsPii) => {
        if (containsPii) {
          return;
        }
        switch (level) {
          case 0: // Error
            console.error(message);
            return;
          case 1: // Warning
            console.warn(message);
            return;
          case 2: // Info
            console.info(message);
            return;
          case 3: // Verbose
            console.debug(message);
            return;
        }
      },
      logLevel: process.env.NODE_ENV === 'development' ? 3 : 1,
    },
    windowHashTimeout: 60000,
    iframeHashTimeout: 6000,
    loadFrameTimeout: 0,
  },
};

// ============================================================================
// Login Request Configuration
// ============================================================================

export const loginRequest: RedirectRequest = {
  scopes: [...apiScopes.read, ...apiScopes.write, 'openid', 'profile', 'email'],
  prompt: 'select_account',
};

export const loginPopupRequest: PopupRequest = {
  scopes: [...apiScopes.read, ...apiScopes.write, 'openid', 'profile', 'email'],
  prompt: 'select_account',
};

// ============================================================================
// Silent Token Request Configuration
// ============================================================================

export const silentRequest: SilentRequest = {
  scopes: [...apiScopes.read, ...apiScopes.write],
  forceRefresh: false,
};

// ============================================================================
// Logout Request Configuration
// ============================================================================

export const logoutRequest: EndSessionRequest = {
  postLogoutRedirectUri: POST_LOGOUT_REDIRECT_URI,
};

// ============================================================================
// Password Reset Configuration
// ============================================================================

export const passwordResetRequest: RedirectRequest = {
  authority: b2cPolicies.authorities.forgotPassword.authority,
  scopes: ['openid'],
};

// ============================================================================
// Profile Edit Configuration
// ============================================================================

export const editProfileRequest: RedirectRequest = {
  authority: b2cPolicies.authorities.editProfile.authority,
  scopes: ['openid'],
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if error is a password reset error
 */
export function isPasswordResetError(error: any): boolean {
  return (
    error?.errorMessage?.includes('AADB2C90118') ||
    error?.message?.includes('AADB2C90118')
  );
}

/**
 * Check if error is a cancel error (user closed the dialog)
 */
export function isCancelError(error: any): boolean {
  return (
    error?.errorMessage?.includes('user_cancelled') ||
    error?.message?.includes('user_cancelled') ||
    error?.errorCode === 'user_cancelled'
  );
}

/**
 * Get token from MSAL account
 */
export function getTokenFromAccount(account: any): string | null {
  if (!account || !account.idToken) {
    return null;
  }
  return account.idToken;
}

/**
 * Extract claims from ID token
 */
export function extractClaims(idToken: string): Record<string, any> {
  try {
    const base64Url = idToken.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch (error) {
    console.error('Failed to parse ID token:', error);
    return {};
  }
}

// ============================================================================
// Type Guards
// ============================================================================

export function hasRequiredScopes(
  account: any,
  requiredScopes: string[]
): boolean {
  if (!account || !account.idTokenClaims) {
    return false;
  }

  const scopes = account.idTokenClaims.scp?.split(' ') || [];
  return requiredScopes.every((scope) => scopes.includes(scope));
}
