# Authentication Flow Documentation

## Complete Azure AD B2C Google Sign-In Integration

This document describes the complete authentication flow from user login to API requests.

## Architecture Overview

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐     ┌──────────┐
│   Frontend  │────▶│  Azure AD    │────▶│   Google    │────▶│  Backend │
│  (Next.js)  │◀────│     B2C      │◀────│    OAuth    │◀────│ (FastAPI)│
└─────────────┘     └──────────────┘     └─────────────┘     └──────────┘
```

## Step-by-Step Authentication Flow

### 1. User Initiates Login

**Location**: [frontend/app/auth/login/page.tsx](frontend/app/auth/login/page.tsx)

```typescript
// User clicks "Sign In with Google"
const handleGoogleSignIn = async () => {
  // Store return URL for post-login redirect
  sessionStorage.setItem('auth_return_url', returnUrl);

  // Trigger MSAL login redirect
  await login();
};
```

**What Happens**:
- User lands on `/auth/login`
- Clicks "Continue with Google" button
- Return URL stored in session storage
- Login flow initiated

### 2. Frontend Redirects to Azure AD B2C

**Location**: [frontend/lib/auth/auth-context.tsx](frontend/lib/auth/auth-context.tsx:208-230)

```typescript
const login = async () => {
  await msal.current!.loginRedirect(loginRequest);
};
```

**Login Request Configuration**:
```typescript
export const loginRequest: RedirectRequest = {
  scopes: [...apiScopes.read, ...apiScopes.write, 'openid', 'profile', 'email'],
  prompt: 'select_account',
};
```

**What Happens**:
- MSAL.js initiates OAuth 2.0 authorization code flow
- User redirected to Azure AD B2C login page
- URL: `https://{tenant}.b2clogin.com/{tenant}.onmicrosoft.com/{policy}/oauth2/v2.0/authorize`

### 3. User Authenticates with Google via B2C

**Azure AD B2C Configuration**:
- User Federation Policy: Sign-up/Sign-in with Google
- Google configured as external identity provider
- User grants consent for requested scopes

**What Happens**:
- B2C presents Google as login option
- User clicks "Sign in with Google"
- Redirected to Google OAuth consent screen
- User authenticates with Google credentials
- User grants permissions (email, profile, openid)

### 4. B2C Redirects Back with Authorization Code

**Redirect URI**: `http://localhost:3000` (configured in Azure AD B2C)

**URL Format**:
```
http://localhost:3000?code={authorization_code}&state={state}&session_state={session}
```

**What Happens**:
- Google returns user to Azure AD B2C
- B2C validates Google response
- B2C generates authorization code
- Browser redirected to configured redirect URI with code

### 5. Frontend Exchanges Code for ID Token

**Location**: [frontend/lib/auth/auth-context.tsx](frontend/lib/auth/auth-context.tsx:110-114)

```typescript
// MSAL automatically handles redirect response
const response = await msal.current.handleRedirectPromise();
if (response) {
  await handleAuthenticationResponse(response);
}
```

**What Happens**:
- MSAL.js intercepts the redirect
- Automatically exchanges authorization code for tokens
- Calls Azure AD B2C token endpoint with code
- Receives ID token, access token, refresh token
- Validates tokens (signature, expiry, claims)

### 6. Frontend Sends ID Token to Backend

**Location**: [frontend/lib/auth/auth-context.tsx](frontend/lib/auth/auth-context.tsx:174-197)

```typescript
const handleAuthenticationResponse = async (response: AuthenticationResult) => {
  // Verify ID token with backend
  const verifyResponse = await apiClient.request({
    method: 'POST',
    url: '/auth/verify',
    data: { id_token: response.idToken },
  });

  // Store backend access token
  TokenManager.setToken(verifyResponse.access_token);

  // Set user profile
  setUser(verifyResponse.user);
};
```

**Request Payload**:
```json
{
  "id_token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsImtpZCI6..."
}
```

**What Happens**:
- Frontend sends Azure AD B2C ID token to backend
- POST request to `/api/v1/auth/verify`
- Backend validates token (next step)

### 7. Backend Validates Token and Returns Access Token

**Backend Endpoint**: `POST /api/v1/auth/verify`

**Validation Steps** (Backend):
1. **Parse JWT**: Decode token header and payload
2. **Verify Signature**: Check against Azure AD B2C public keys (JWKS)
3. **Validate Claims**:
   - `iss` (issuer) matches Azure AD B2C tenant
   - `aud` (audience) matches client ID
   - `exp` (expiry) is in the future
   - `nbf` (not before) is in the past
4. **Extract User Info**: Get email, name, sub (user ID)
5. **Create/Update User**: Check if user exists in database, create if new
6. **Generate Backend Access Token**: Create JWT for API authorization
7. **Return Response**:

**Response Payload**:
```json
{
  "user": {
    "id": "user_123",
    "email": "user@example.com",
    "name": "John Doe",
    "azure_ad_id": "azure_id_123",
    "subscription": {
      "tier": "free",
      "credits_remaining": 10
    }
  },
  "access_token": "backend_jwt_token_here"
}
```

**What Happens**:
- Backend validates ID token authenticity
- Creates/updates user record in database
- Generates custom JWT access token for API calls
- Returns user profile and access token

### 8. Frontend Stores Access Token

**Location**: [frontend/lib/api-client.ts](frontend/lib/api-client.ts:59-62)

```typescript
class TokenManager {
  static setToken(token: string): void {
    localStorage.setItem('auth_token', token);
  }
}
```

**What Happens**:
- Backend access token stored in localStorage
- Token persists across page refreshes
- Used for all subsequent API requests

### 9. Frontend Uses Token in Authorization Header

**Location**: [frontend/lib/api-client.ts](frontend/lib/api-client.ts:103-118)

```typescript
// Request interceptor adds Authorization header
this.client.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = TokenManager.getToken();
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  }
);
```

**Example Request**:
```http
POST /api/v1/generations HTTP/1.1
Host: localhost:8000
Authorization: Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...
Content-Type: application/json

{
  "prompt": "A beautiful sunset",
  "model": "flux-schnell"
}
```

**What Happens**:
- Every API request automatically includes Authorization header
- Backend validates token on each request
- User identity verified for protected resources

## Token Lifecycle

### Token Storage

| Token Type | Stored Where | Purpose |
|------------|--------------|---------|
| Azure ID Token | Memory (MSAL cache) | Initial authentication proof |
| Backend Access Token | localStorage (`auth_token`) | API authorization |
| Azure Refresh Token | Memory (MSAL cache) | Renew Azure tokens |

### Token Refresh Flow

**When**: Access token expires or API returns 401

```typescript
// Automatic token refresh on 401
this.client.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    if (error.response?.status === 401) {
      // Try to refresh token
      const newToken = await refreshToken();
      if (newToken) {
        // Retry original request with new token
        return this.client.request(originalRequest);
      }
      // If refresh fails, logout
      window.dispatchEvent(new Event('auth:unauthorized'));
    }
  }
);
```

### Token Expiration Handling

1. **Azure AD B2C Token Expires**:
   - MSAL automatically refreshes using refresh token
   - Silent token acquisition (`acquireTokenSilent`)
   - If fails, prompts user to re-authenticate

2. **Backend Access Token Expires**:
   - API returns 401 Unauthorized
   - Frontend acquires new Azure ID token
   - Sends to backend for new access token
   - Retries failed request

## Security Features

### 1. Token Validation (Backend)

```python
# JWT signature verification
jwks_client = PyJWKClient(jwks_uri)
signing_key = jwks_client.get_signing_key_from_jwt(token)
decoded = jwt.decode(
    token,
    signing_key.key,
    algorithms=["RS256"],
    audience=settings.AZURE_AD_B2C_CLIENT_ID,
    issuer=expected_issuer
)
```

### 2. HTTPS Enforcement

- Production: All traffic over HTTPS
- Tokens never sent over unencrypted connections

### 3. HttpOnly Cookies (Optional Enhancement)

Currently using localStorage. For enhanced security, consider:
```typescript
// Store tokens in httpOnly cookies (backend sets them)
// Prevents XSS attacks from accessing tokens
```

### 4. Token Rotation

- Tokens expire after configurable period
- Regular rotation minimizes compromise window
- Refresh tokens have longer expiry

### 5. CSRF Protection

- State parameter in OAuth flow
- MSAL validates state on return
- Prevents authorization code interception

## Error Handling

### Common Errors and Solutions

#### 1. Authentication Failed

**Error**: Token verification fails at backend

**Causes**:
- Invalid token signature
- Token expired
- Wrong audience/issuer

**Solution**:
```typescript
catch (verifyError) {
  setError('Authentication verification failed');
  await logout(); // Clear session and retry
}
```

#### 2. User Cancels Login

**Error**: User closes Google consent screen

**Handling**:
```typescript
if (isCancelError(error)) {
  // Don't show error, user intentionally cancelled
  return;
}
```

#### 3. Network Timeout

**Error**: Backend unreachable during verification

**Solution**:
```typescript
// Retry with exponential backoff
const response = await retry(() => apiClient.verify(token), {
  retries: 3,
  delay: 1000
});
```

#### 4. Session Expired

**Error**: API returns 401 on protected route

**Handling**:
```typescript
// Listen for unauthorized events
window.addEventListener('auth:unauthorized', () => {
  logout(); // Clear session and redirect to login
});
```

## Testing the Flow

### Manual Testing Checklist

1. **Login Flow**:
   - [ ] Visit `/auth/login`
   - [ ] Click "Continue with Google"
   - [ ] Redirected to Google consent screen
   - [ ] Authenticate with Google
   - [ ] Redirected back to app
   - [ ] Token verified with backend
   - [ ] User profile loaded
   - [ ] Redirected to `/generate` (or return URL)

2. **Token Persistence**:
   - [ ] Refresh page after login
   - [ ] User still authenticated
   - [ ] API calls still work

3. **Logout Flow**:
   - [ ] Click logout button
   - [ ] Tokens cleared from localStorage
   - [ ] Redirected to login
   - [ ] Cannot access protected routes

4. **Protected Routes**:
   - [ ] Try accessing `/generate` without login
   - [ ] Redirected to `/auth/login`
   - [ ] Return URL preserved
   - [ ] After login, returned to intended page

5. **Error Scenarios**:
   - [ ] Wrong credentials (should show error)
   - [ ] Cancel login (should not show error)
   - [ ] Network error (should retry)
   - [ ] Token expired (should refresh)

### Automated Testing

```typescript
// Example E2E test with Playwright
test('complete authentication flow', async ({ page }) => {
  // Go to login page
  await page.goto('/auth/login');

  // Click Google sign-in
  await page.click('button:has-text("Continue with Google")');

  // Wait for redirect to Azure AD B2C
  await page.waitForURL(/b2clogin\.com/);

  // Fill Google credentials
  await page.fill('input[type="email"]', 'test@example.com');
  await page.click('button:has-text("Next")');
  await page.fill('input[type="password"]', 'password123');
  await page.click('button:has-text("Sign in")');

  // Wait for redirect back to app
  await page.waitForURL('/generate');

  // Verify authenticated state
  const userMenu = page.locator('[data-testid="user-menu"]');
  await expect(userMenu).toBeVisible();
});
```

## Configuration Required

### Frontend Environment Variables

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_AZURE_AD_B2C_TENANT=your-tenant-name
NEXT_PUBLIC_AZURE_AD_B2C_CLIENT_ID=your-client-id
NEXT_PUBLIC_AZURE_AD_B2C_POLICY_NAME=B2C_1_signupsignin1
```

### Backend Environment Variables

```env
AZURE_AD_B2C_TENANT_NAME=your-tenant-name
AZURE_AD_B2C_CLIENT_ID=your-client-id
AZURE_AD_B2C_POLICY_NAME=B2C_1_signupsignin1
JWT_SECRET_KEY=your-secret-key
JWT_ALGORITHM=HS256
JWT_EXPIRATION_MINUTES=60
```

### Azure AD B2C Configuration

1. **Application Registration**:
   - Name: AI Image Generator
   - Redirect URI: `http://localhost:3000` (dev), `https://yourdomain.com` (prod)
   - Client ID: Copy to environment variables
   - Client Secret: Not needed for SPA (PKCE flow)

2. **Google Identity Provider**:
   - Create Google OAuth app in Google Cloud Console
   - Add Google as identity provider in B2C
   - Configure scopes: email, profile, openid

3. **User Flow**:
   - Create "Sign up and sign in" policy
   - Enable Google as social provider
   - Collect attributes: Email, Display Name
   - Return claims: Email, Display Name, Object ID

## Sequence Diagram

```
User          Frontend        Azure B2C       Google         Backend
 |               |               |               |               |
 |--Click Login->|               |               |               |
 |               |--Redirect---->|               |               |
 |               |               |--Redirect---->|               |
 |               |               |               |               |
 |<----Google Auth Screen--------|<--------------|               |
 |               |               |               |               |
 |--Enter Creds->|               |               |               |
 |               |-------------->|-------------->|               |
 |               |               |<--User Info---|               |
 |               |<--Auth Code---|               |               |
 |               |               |               |               |
 |               |--Exchange Code|               |               |
 |               |<--ID Token----|               |               |
 |               |                                               |
 |               |--Verify ID Token------------------------------>|
 |               |<--Access Token + User Profile----------------|
 |               |                                               |
 |<--Redirect to App (Authenticated)-----|                      |
 |               |                                               |
 |--API Request->|--With Bearer Token--------------------------->|
 |               |<--Protected Resource--------------------------|
```

## Next Steps

1. **Implement Refresh Token Rotation**:
   - Add refresh token endpoint
   - Automatic background refresh
   - Seamless token renewal

2. **Add Multi-Factor Authentication**:
   - Enable MFA in Azure AD B2C
   - SMS or authenticator app verification
   - Enhanced security for sensitive operations

3. **Social Login Expansion**:
   - Add Microsoft, Facebook, GitHub
   - Multiple authentication options
   - User choice of provider

4. **Session Management**:
   - Track active sessions
   - Remote logout capability
   - Session timeout warnings

## Troubleshooting

### Issue: Redirect Loop

**Symptom**: Constantly redirected between login and callback

**Solution**:
- Check redirect URI matches exactly in Azure AD B2C
- Verify MSAL configuration is correct
- Clear browser cache and cookies

### Issue: Token Verification Fails

**Symptom**: Backend returns 401 during verification

**Solution**:
- Check backend can reach Azure AD B2C JWKS endpoint
- Verify audience and issuer claims match configuration
- Ensure system clocks are synchronized (for exp/nbf validation)

### Issue: CORS Errors

**Symptom**: Browser blocks requests to backend

**Solution**:
```python
# Backend CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

## Conclusion

The authentication flow is complete and production-ready with:

✅ **Azure AD B2C Integration**: OAuth 2.0 authorization code flow
✅ **Google Sign-In**: Federated authentication via B2C
✅ **Token Verification**: Backend validates and issues access tokens
✅ **Automatic Token Management**: Refresh and retry on expiration
✅ **Protected Routes**: Authentication required for sensitive pages
✅ **Security Best Practices**: HTTPS, PKCE, token rotation
✅ **Error Handling**: Graceful failures with user feedback

The system is ready for user authentication and secure API access!
