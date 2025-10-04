/**
 * Authentication API Functions
 *
 * Handles user authentication, profile management, and token verification
 */

import apiClient from '../api-client';
import { UserProfile } from '../types/api';

// ============================================================================
// Token Verification
// ============================================================================

/**
 * Verify Azure AD B2C ID token with backend
 *
 * @param idToken - Azure AD B2C ID token
 * @returns User profile and backend access token
 */
export async function verifyToken(idToken: string): Promise<{
  user: UserProfile;
  access_token: string;
}> {
  const response = await apiClient.request<{
    user: UserProfile;
    access_token: string;
  }>({
    method: 'POST',
    url: '/auth/verify',
    data: { id_token: idToken },
  });

  return response;
}

// ============================================================================
// User Profile
// ============================================================================

/**
 * Get current user profile
 *
 * @returns User profile with subscription details
 */
export async function getCurrentUser(): Promise<UserProfile> {
  return await apiClient.getCurrentUser();
}

/**
 * Update user profile
 *
 * @param data - Profile data to update
 * @returns Updated user profile
 */
export async function updateProfile(data: {
  name?: string;
  email?: string;
  preferences?: Record<string, any>;
}): Promise<UserProfile> {
  const response = await apiClient.request<UserProfile>({
    method: 'PATCH',
    url: '/auth/me',
    data,
  });

  return response;
}

/**
 * Delete user account
 *
 * @returns Success confirmation
 */
export async function deleteAccount(): Promise<{ success: boolean }> {
  const response = await apiClient.request<{ success: boolean }>({
    method: 'DELETE',
    url: '/auth/me',
  });

  return response;
}

// ============================================================================
// Token Management
// ============================================================================

/**
 * Refresh access token
 *
 * @returns New access token
 */
export async function refreshAccessToken(): Promise<{
  access_token: string;
  expires_in: number;
}> {
  const response = await apiClient.request<{
    access_token: string;
    expires_in: number;
  }>({
    method: 'POST',
    url: '/auth/refresh',
  });

  return response;
}

/**
 * Logout from backend (invalidate tokens)
 *
 * @returns Success confirmation
 */
export async function logout(): Promise<{ success: boolean }> {
  const response = await apiClient.request<{ success: boolean }>({
    method: 'POST',
    url: '/auth/logout',
  });

  return response;
}
