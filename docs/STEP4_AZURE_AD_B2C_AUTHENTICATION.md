# STEP 4: Azure AD B2C Authentication with Google OAuth

## Overview

This document covers the implementation of Azure Active Directory B2C (Azure AD B2C) authentication with Google OAuth for the ImageGenerator API. This solution provides secure, enterprise-grade identity management with support for multiple authentication providers including Google, GitHub, Microsoft, and email/password.

## Architecture

### Authentication Flow

```
┌─────────────┐         ┌──────────────┐         ┌─────────────┐
│   Client    │         │  Azure AD    │         │   FastAPI   │
│ Application │         │     B2C      │         │   Backend   │
└──────┬──────┘         └──────┬───────┘         └──────┬──────┘
       │                       │                        │
       │  1. Initiate Auth     │                        │
       ├──────────────────────>│                        │
       │                       │                        │
       │  2. Redirect to Google│                        │
       │<──────────────────────┤                        │
       │                       │                        │
       │  3. User Authenticates│                        │
       │    with Google        │                        │
       │                       │                        │
       │  4. JWT Token         │                        │
       │<──────────────────────┤                        │
       │                       │                        │
       │  5. Send Token        │                        │
       ├─────────────────────────────────────────────>│
       │                       │                        │
       │                       │  6. Validate Token     │
       │                       │<───────────────────────┤
       │                       │                        │
       │                       │  7. Return JWKS        │
       │                       │────────────────────────>
       │                       │                        │
       │                       │  8. Create/Update User │
       │                       │        in MongoDB      │
       │                       │                        │
       │  9. User Profile      │                        │
       │<─────────────────────────────────────────────┤
       │                       │                        │
```

### Key Components

1. **Azure AD B2C** - Identity management service
2. **JWTValidator** - Token validation and JWKS handling
3. **AzureADB2CService** - Authentication service layer
4. **Auth Dependencies** - FastAPI security dependencies
5. **Auth Endpoints** - REST API for authentication operations

## Implementation Details

### 1. JWT Token Validation (`app/utils/jwt_validator.py`)

The `JWTValidator` class handles all JWT token validation using the PyJWKClient library to fetch and cache public keys from Azure AD B2C.

**Key Features:**
- Automatic JWKS (JSON Web Key Set) fetching and caching
- Token signature verification using RS256 algorithm
- Issuer and audience validation
- Expiration checking
- User information extraction from token claims
- Token blacklist support for logout

**Critical Implementation:**

```python
class JWTValidator:
    def __init__(self, tenant: str, client_id: str, policy_name: str):
        tenant_name = tenant.split('.')[0]
        self.issuer = f"https://{tenant_name}.b2clogin.com/{tenant}/v2.0/"
        self.jwks_uri = f"https://{tenant_name}.b2clogin.com/{tenant}/{policy_name}/discovery/v2.0/keys"

    def validate_token(self, token: str) -> Dict[str, Any]:
        # Get JWKS client (with caching)
        jwks_client = self._get_jwks_client()

        # Get signing key from token header
        signing_key = jwks_client.get_signing_key_from_jwt(token)

        # Decode and verify token
        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            audience=self.client_id,
            issuer=self.issuer,
            options={
                "verify_signature": True,
                "verify_exp": True,
                "verify_aud": True,
                "verify_iss": True,
            }
        )

        return payload
```

**User Information Extraction:**

```python
def extract_user_info(self, payload: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "sub": payload.get("sub"),  # Unique user ID
        "email": payload.get("emails", [None])[0] if "emails" in payload else payload.get("email"),
        "email_verified": payload.get("email_verified", False),
        "name": payload.get("name"),
        "given_name": payload.get("given_name"),
        "family_name": payload.get("family_name"),
        "picture": payload.get("picture"),
        "identity_provider": payload.get("idp")  # e.g., "google.com"
    }
```

### 2. Authentication Service (`app/services/auth_service.py`)

The `AzureADB2CService` class provides high-level authentication operations including token validation, user synchronization, and logout.

**Key Features:**
- Token validation with automatic user sync to MongoDB
- Identity provider detection (Google, GitHub, Microsoft, Email)
- User profile creation and updates
- Token blacklisting for logout
- Authorization URL generation for OAuth flow

**User Synchronization Logic:**

```python
async def create_or_update_user(self, user_info: Dict, token_payload: Dict) -> User:
    auth_provider_id = user_info.get("sub")

    # Determine authentication provider from IDP claim
    idp = user_info.get("identity_provider", "").lower()
    if "google" in idp:
        auth_provider = AuthProvider.GOOGLE
    elif "github" in idp:
        auth_provider = AuthProvider.GITHUB
    elif "microsoft" in idp:
        auth_provider = AuthProvider.MICROSOFT
    else:
        auth_provider = AuthProvider.EMAIL

    # Try to find existing user by auth provider ID
    existing_user = await self.user_repo.find_by_auth_provider(
        auth_provider=auth_provider,
        auth_provider_id=auth_provider_id
    )

    if existing_user:
        # Update existing user
        return await self.user_repo.update_user(
            existing_user.id,
            {
                "full_name": user_info.get("name"),
                "avatar_url": user_info.get("picture"),
                "is_verified": user_info.get("email_verified"),
                "last_login_at": datetime.utcnow(),
            }
        )
    else:
        # Create new user
        user_create = UserCreate(
            email=user_info.get("email"),
            full_name=user_info.get("name"),
            avatar_url=user_info.get("picture"),
            auth_provider=auth_provider,
            auth_provider_id=auth_provider_id,
            password=None  # No password for OAuth users
        )
        return await self.user_repo.create_user(user_create)
```

### 3. Authentication Dependencies (`app/core/auth_dependencies.py`)

FastAPI dependency injection functions for securing endpoints.

**Available Dependencies:**

1. **`get_current_user()`** - Extract and validate user from Bearer token
2. **`get_current_active_user()`** - Ensure user account is active
3. **`get_current_verified_user()`** - Ensure email is verified
4. **`require_subscription(*tiers)`** - Require specific subscription tier(s)
5. **`require_credits(min_credits)`** - Ensure sufficient credits
6. **`get_optional_user()`** - Get user if authenticated, None otherwise

**Usage Examples:**

```python
# Require authentication
@router.get("/protected")
async def protected_route(user: User = Depends(get_current_user)):
    return {"user_id": user.id}

# Require active account
@router.get("/profile")
async def get_profile(user: User = Depends(get_current_active_user)):
    return user

# Require verified email
@router.post("/generate")
async def generate_image(user: User = Depends(get_current_verified_user)):
    pass

# Require PRO subscription
@router.post("/premium-feature", dependencies=[Depends(require_subscription(SubscriptionTier.PRO))])
async def premium_feature():
    pass

# Require minimum credits
@router.post("/create", dependencies=[Depends(require_credits(min_credits=5))])
async def create_image(user: User = Depends(require_credits(5))):
    pass

# Optional authentication
@router.get("/public-with-benefits")
async def public_route(user: Optional[User] = Depends(get_optional_user)):
    if user:
        # Provide extra features for authenticated users
        pass
```

### 4. Authentication Endpoints (`app/api/v1/endpoints/auth.py`)

REST API endpoints for authentication operations.

**Available Endpoints:**

#### POST `/api/v1/auth/verify`
Verify Azure AD B2C token and sync user to database.

**Request:**
```json
{
  "token": "eyJ0eXAiOiJKV1QiLCJhbGc..."
}
```

**Response:**
```json
{
  "valid": true,
  "user": {
    "id": "507f1f77bcf86cd799439011",
    "email": "user@example.com",
    "full_name": "John Doe",
    "avatar_url": "https://lh3.googleusercontent.com/...",
    "auth_provider": "google",
    "subscription_tier": "free",
    "credits_remaining": 10,
    "is_active": true,
    "is_verified": true
  },
  "message": "Token validated successfully"
}
```

#### GET `/api/v1/auth/me`
Get current authenticated user profile.

**Headers:**
```
Authorization: Bearer eyJ0eXAiOiJKV1QiLCJhbGc...
```

**Response:**
```json
{
  "id": "507f1f77bcf86cd799439011",
  "email": "user@example.com",
  "full_name": "John Doe",
  "subscription_tier": "pro",
  "credits_remaining": 500
}
```

#### POST `/api/v1/auth/logout`
Logout user by blacklisting current token.

**Headers:**
```
Authorization: Bearer eyJ0eXAiOiJKV1QiLCJhbGc...
```

**Response:**
```json
{
  "message": "Logged out successfully",
  "user_id": "507f1f77bcf86cd799439011"
}
```

#### POST `/api/v1/auth/auth-url`
Generate Azure AD B2C authorization URL for client-side redirect.

**Request:**
```json
{
  "redirect_uri": "http://localhost:3000/auth/callback",
  "state": "random-state-string-for-csrf"
}
```

**Response:**
```json
{
  "authorization_url": "https://your-tenant.b2clogin.com/your-tenant.onmicrosoft.com/B2C_1_signupsignin/oauth2/v2.0/authorize?p=B2C_1_signupsignin&client_id=...&redirect_uri=...&response_type=id_token&scope=openid+profile+email&response_mode=form_post&state=..."
}
```

#### GET `/api/v1/auth/jwks`
Get JWKS (JSON Web Key Set) from Azure AD B2C.

**Response:**
```json
{
  "keys": [
    {
      "kid": "X5eXk4xyojNFum1kl2Ytv8dlNP4-c57dO6QGTVBwaNk",
      "nbf": 1493763266,
      "use": "sig",
      "kty": "RSA",
      "e": "AQAB",
      "n": "tVKUtcx_n9rt5afY..."
    }
  ]
}
```

## Azure AD B2C Setup

### Prerequisites

- Azure subscription
- Azure CLI installed
- Google Cloud Console account (for Google OAuth)

### Step 1: Create Azure AD B2C Tenant

```bash
# Create resource group
az group create \
  --name imagegen-auth-rg \
  --location eastus

# Create Azure AD B2C tenant
az ad b2c tenant create \
  --resource-group imagegen-auth-rg \
  --tenant-name imagegen-tenant \
  --location "United States" \
  --sku "Standard"

# Note the tenant name: imagegen-tenant.onmicrosoft.com
```

### Step 2: Register Application

1. Navigate to Azure AD B2C in Azure Portal
2. Go to **App registrations** → **New registration**
3. Configure application:
   - **Name**: ImageGenerator API
   - **Supported account types**: Accounts in any identity provider or organizational directory
   - **Redirect URI**:
     - Type: Web
     - URI: `http://localhost:3000/auth/callback` (for development)
     - URI: `https://yourdomain.com/auth/callback` (for production)
4. Copy the **Application (client) ID**

### Step 3: Configure Google OAuth Provider

#### Google Cloud Console Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create new project or select existing
3. Enable **Google+ API**
4. Go to **Credentials** → **Create Credentials** → **OAuth 2.0 Client ID**
5. Configure OAuth consent screen
6. Create OAuth 2.0 Client:
   - Application type: Web application
   - Authorized redirect URIs:
     ```
     https://imagegen-tenant.b2clogin.com/imagegen-tenant.onmicrosoft.com/oauth2/authresp
     ```
7. Copy **Client ID** and **Client Secret**

#### Azure AD B2C Identity Provider Setup

```bash
# Add Google as identity provider
az ad b2c identity-provider create \
  --name Google \
  --type Google \
  --client-id "YOUR_GOOGLE_CLIENT_ID" \
  --client-secret "YOUR_GOOGLE_CLIENT_SECRET"
```

**Or via Azure Portal:**
1. Go to Azure AD B2C → **Identity providers**
2. Click **+ New OpenID Connect provider**
3. Configure:
   - **Name**: Google
   - **Type**: Google
   - **Client ID**: `YOUR_GOOGLE_CLIENT_ID`
   - **Client Secret**: `YOUR_GOOGLE_CLIENT_SECRET`
   - **Scope**: `openid profile email`

### Step 4: Create User Flow

```bash
# Create sign-up/sign-in user flow
az ad b2c user-flow create \
  --name B2C_1_signupsignin \
  --user-flow-type signUpOrSignIn \
  --identity-providers Google EmailPassword
```

**Or via Azure Portal:**
1. Go to **User flows** → **+ New user flow**
2. Select **Sign up and sign in**
3. Configure:
   - **Name**: signupsignin (becomes `B2C_1_signupsignin`)
   - **Identity providers**: ✓ Email signup, ✓ Google
   - **User attributes and claims**:
     - Collect: Email Address, Display Name
     - Return: Email Addresses, Display Name, Given Name, Surname, User's Object ID, Identity Provider
4. Create user flow

### Step 5: Configure Application Claims

1. Go to **App registrations** → Your app → **Token configuration**
2. Add optional claims:
   - **ID token**: email, given_name, family_name, name, picture
3. Add custom attributes (if needed):
   - Go to **User attributes** → **+ Add**
   - Create: `extension_subscriptionTier`, `extension_creditsRemaining`

### Step 6: Enable CORS for Frontend

```bash
# Configure CORS for your application
az rest --method PATCH \
  --url "/subscriptions/{subscription-id}/resourceGroups/imagegen-auth-rg/providers/Microsoft.AzureActiveDirectory/b2cDirectories/imagegen-tenant.onmicrosoft.com" \
  --body '{
    "properties": {
      "cors": {
        "allowedOrigins": [
          "http://localhost:3000",
          "https://yourdomain.com"
        ],
        "allowedMethods": ["GET", "POST"],
        "allowedHeaders": ["*"],
        "exposedHeaders": ["*"],
        "maxAge": 3600
      }
    }
  }'
```

## Frontend Integration

### Prerequisites

Install MSAL.js library for Azure AD B2C:

```bash
npm install @azure/msal-browser
```

### Configuration

```typescript
// src/config/authConfig.ts
import { PublicClientApplication, Configuration } from '@azure/msal-browser';

const msalConfig: Configuration = {
  auth: {
    clientId: process.env.NEXT_PUBLIC_B2C_CLIENT_ID!,
    authority: `https://${process.env.NEXT_PUBLIC_B2C_TENANT_NAME}.b2clogin.com/${process.env.NEXT_PUBLIC_B2C_TENANT_NAME}.onmicrosoft.com/${process.env.NEXT_PUBLIC_B2C_POLICY}`,
    knownAuthorities: [`${process.env.NEXT_PUBLIC_B2C_TENANT_NAME}.b2clogin.com`],
    redirectUri: process.env.NEXT_PUBLIC_REDIRECT_URI || 'http://localhost:3000/auth/callback',
  },
  cache: {
    cacheLocation: 'localStorage',
    storeAuthStateInCookie: false,
  },
};

export const msalInstance = new PublicClientApplication(msalConfig);

export const loginRequest = {
  scopes: ['openid', 'profile', 'email'],
};
```

### Authentication Flow Implementation

```typescript
// src/services/authService.ts
import { msalInstance, loginRequest } from '@/config/authConfig';

export class AuthService {
  // Initialize MSAL
  async initialize() {
    await msalInstance.initialize();
  }

  // Login with redirect
  async login() {
    try {
      await msalInstance.loginRedirect(loginRequest);
    } catch (error) {
      console.error('Login failed:', error);
      throw error;
    }
  }

  // Login with popup
  async loginPopup() {
    try {
      const response = await msalInstance.loginPopup(loginRequest);
      return response.idToken;
    } catch (error) {
      console.error('Login popup failed:', error);
      throw error;
    }
  }

  // Get access token
  async getToken(): Promise<string | null> {
    const accounts = msalInstance.getAllAccounts();

    if (accounts.length === 0) {
      return null;
    }

    try {
      const response = await msalInstance.acquireTokenSilent({
        ...loginRequest,
        account: accounts[0],
      });

      return response.idToken;
    } catch (error) {
      // Token expired, try interactive login
      const response = await msalInstance.acquireTokenPopup(loginRequest);
      return response.idToken;
    }
  }

  // Logout
  async logout() {
    const accounts = msalInstance.getAllAccounts();

    if (accounts.length > 0) {
      await msalInstance.logoutRedirect({
        account: accounts[0],
      });
    }
  }

  // Verify token with backend
  async verifyToken(token: string) {
    const response = await fetch('http://localhost:8000/api/v1/auth/verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token }),
    });

    if (!response.ok) {
      throw new Error('Token verification failed');
    }

    return await response.json();
  }
}

export const authService = new AuthService();
```

### React Context Provider

```typescript
// src/contexts/AuthContext.tsx
import React, { createContext, useContext, useEffect, useState } from 'react';
import { authService } from '@/services/authService';

interface User {
  id: string;
  email: string;
  full_name: string;
  avatar_url?: string;
  subscription_tier: string;
  credits_remaining: number;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    initAuth();
  }, []);

  async function initAuth() {
    try {
      await authService.initialize();

      const token = await authService.getToken();

      if (token) {
        const result = await authService.verifyToken(token);
        setUser(result.user);
        setToken(token);
      }
    } catch (error) {
      console.error('Auth initialization failed:', error);
    } finally {
      setLoading(false);
    }
  }

  async function login() {
    try {
      setLoading(true);
      await authService.login();
      // After redirect, initAuth will be called again
    } catch (error) {
      console.error('Login failed:', error);
      setLoading(false);
    }
  }

  async function logout() {
    try {
      setLoading(true);

      // Logout from backend
      if (token) {
        await fetch('http://localhost:8000/api/v1/auth/logout', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });
      }

      // Logout from MSAL
      await authService.logout();

      setUser(null);
      setToken(null);
    } catch (error) {
      console.error('Logout failed:', error);
    } finally {
      setLoading(false);
    }
  }

  async function refreshUser() {
    if (!token) return;

    try {
      const response = await fetch('http://localhost:8000/api/v1/auth/me', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const userData = await response.json();
        setUser(userData);
      }
    } catch (error) {
      console.error('Failed to refresh user:', error);
    }
  }

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
```

### Protected Route Component

```typescript
// src/components/ProtectedRoute.tsx
import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '@/contexts/AuthContext';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!user) {
    return null;
  }

  return <>{children}</>;
}
```

### Usage Example

```typescript
// src/pages/dashboard.tsx
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { useAuth } from '@/contexts/AuthContext';

export default function Dashboard() {
  const { user, logout } = useAuth();

  return (
    <ProtectedRoute>
      <div>
        <h1>Welcome, {user?.full_name}</h1>
        <p>Email: {user?.email}</p>
        <p>Credits: {user?.credits_remaining}</p>
        <p>Subscription: {user?.subscription_tier}</p>
        <button onClick={logout}>Logout</button>
      </div>
    </ProtectedRoute>
  );
}
```

## Environment Variables

### Backend (.env)

```bash
# Azure AD B2C Settings
AZURE_AD_B2C_TENANT=imagegen-tenant.onmicrosoft.com
AZURE_AD_B2C_CLIENT_ID=12345678-1234-1234-1234-123456789abc
AZURE_AD_B2C_POLICY_NAME=B2C_1_signupsignin
AZURE_AD_B2C_CLIENT_SECRET=your-client-secret-if-needed

# Other settings...
SECRET_KEY=your-secret-key-change-in-production-min-32-characters
```

### Frontend (.env.local)

```bash
# Azure AD B2C Settings
NEXT_PUBLIC_B2C_TENANT_NAME=imagegen-tenant
NEXT_PUBLIC_B2C_CLIENT_ID=12345678-1234-1234-1234-123456789abc
NEXT_PUBLIC_B2C_POLICY=B2C_1_signupsignin
NEXT_PUBLIC_REDIRECT_URI=http://localhost:3000/auth/callback

# API URL
NEXT_PUBLIC_API_URL=http://localhost:8000
```

## Security Features

### 1. JWT Token Validation

- **Signature Verification**: Uses RS256 algorithm with public keys from JWKS
- **Issuer Validation**: Ensures token is from trusted Azure AD B2C tenant
- **Audience Validation**: Verifies token is intended for your application
- **Expiration Checking**: Rejects expired tokens automatically
- **JWKS Caching**: Public keys cached for 1 hour to reduce network calls

### 2. Token Blacklisting

Logout functionality blacklists tokens to prevent reuse:

```python
# Logout user
result = await auth_service.logout_user(token)

# Token validation checks blacklist
if token_jti and token_blacklist.is_blacklisted(token_jti):
    raise InvalidTokenError("Token has been revoked")
```

**Production Note**: Use Redis for distributed token blacklist in production.

### 3. PKCE (Proof Key for Code Exchange)

MSAL.js automatically implements PKCE for enhanced security in OAuth flow:

```typescript
// PKCE is automatically handled by MSAL.js
const response = await msalInstance.loginPopup(loginRequest);
```

### 4. State Parameter for CSRF Protection

Prevents cross-site request forgery attacks:

```typescript
const loginRequest = {
  scopes: ['openid', 'profile', 'email'],
  state: generateRandomState(), // CSRF protection
};
```

### 5. Subscription and Credit Enforcement

```python
# Require specific subscription tier
@router.post("/premium", dependencies=[Depends(require_subscription(SubscriptionTier.PRO))])
async def premium_endpoint():
    pass

# Require minimum credits
@router.post("/generate", dependencies=[Depends(require_credits(5))])
async def generate_image(user: User = Depends(require_credits(5))):
    await user_repo.deduct_credits(user.id, 5)
```

## Testing

### Test Token Validation

```python
# tests/test_auth_service.py
import pytest
from app.services.auth_service import AzureADB2CService
from jwt.exceptions import InvalidTokenError

@pytest.mark.asyncio
async def test_validate_valid_token(auth_service: AzureADB2CService):
    """Test validation of valid B2C token."""
    token = "eyJ0eXAiOiJKV1QiLCJhbGc..."  # Valid token from B2C

    result = await auth_service.validate_b2c_token(token, sync_user=False)

    assert result["valid"] is True
    assert "user_info" in result
    assert result["user_info"]["email"] is not None

@pytest.mark.asyncio
async def test_validate_expired_token(auth_service: AzureADB2CService):
    """Test validation of expired token."""
    expired_token = "eyJ0eXAiOiJKV1QiLCJhbGc..."  # Expired token

    with pytest.raises(InvalidTokenError):
        await auth_service.validate_b2c_token(expired_token)

@pytest.mark.asyncio
async def test_create_user_from_token(auth_service: AzureADB2CService):
    """Test user creation from B2C token."""
    token = "eyJ0eXAiOiJKV1QiLCJhbGc..."  # Valid token

    result = await auth_service.validate_b2c_token(token, sync_user=True)

    assert result["user"] is not None
    assert result["user"]["email"] == "test@example.com"
    assert result["user"]["auth_provider"] == "google"
```

### Test Authentication Dependencies

```python
# tests/test_auth_dependencies.py
import pytest
from fastapi import HTTPException
from app.core.auth_dependencies import get_current_user, require_credits
from app.models.user import User

@pytest.mark.asyncio
async def test_get_current_user_with_valid_token(test_client, valid_token):
    """Test get_current_user with valid token."""
    response = test_client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {valid_token}"}
    )

    assert response.status_code == 200
    assert response.json()["email"] == "test@example.com"

@pytest.mark.asyncio
async def test_require_credits_insufficient(user_with_no_credits):
    """Test require_credits with insufficient credits."""
    with pytest.raises(HTTPException) as exc_info:
        await require_credits(min_credits=10, current_user=user_with_no_credits)

    assert exc_info.value.status_code == 402
    assert "Insufficient credits" in exc_info.value.detail
```

### Test Authentication Endpoints

```bash
# Test token verification
curl -X POST http://localhost:8000/api/v1/auth/verify \
  -H "Content-Type: application/json" \
  -d '{
    "token": "eyJ0eXAiOiJKV1QiLCJhbGc..."
  }'

# Test get current user
curl http://localhost:8000/api/v1/auth/me \
  -H "Authorization: Bearer eyJ0eXAiOiJKV1QiLCJhbGc..."

# Test logout
curl -X POST http://localhost:8000/api/v1/auth/logout \
  -H "Authorization: Bearer eyJ0eXAiOiJKV1QiLCJhbGc..."

# Test get JWKS
curl http://localhost:8000/api/v1/auth/jwks
```

## Troubleshooting

### Issue: Token Validation Fails with "Invalid Issuer"

**Cause**: Issuer URL mismatch between token and validator.

**Solution**:
```python
# Check token issuer (unverified decode)
payload = jwt.decode(token, options={"verify_signature": False})
print(f"Token issuer: {payload['iss']}")

# Ensure validator issuer matches
# Correct format: https://tenant-name.b2clogin.com/tenant-name.onmicrosoft.com/v2.0/
```

### Issue: JWKS Fetch Fails

**Cause**: Network issues or incorrect JWKS URI.

**Solution**:
```python
# Test JWKS URI manually
import httpx

async with httpx.AsyncClient() as client:
    response = await client.get(jwks_uri)
    print(response.json())

# Correct JWKS URI format:
# https://tenant-name.b2clogin.com/tenant-name.onmicrosoft.com/B2C_1_policy/discovery/v2.0/keys
```

### Issue: User Profile Not Syncing

**Cause**: Missing claims in token or database connection issues.

**Solution**:
```python
# Check token claims
payload = jwt_validator.decode_token_unsafe(token)
print(f"Available claims: {payload.keys()}")

# Ensure required claims are present
assert "sub" in payload
assert "emails" in payload or "email" in payload

# Check MongoDB connection
await mongodb_service.health_check()
```

### Issue: Frontend CORS Errors

**Cause**: Missing CORS configuration in FastAPI.

**Solution**:
```python
# app/main.py
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://yourdomain.com"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

### Issue: Token Expired Immediately

**Cause**: Clock skew between client and server.

**Solution**:
```python
# Add leeway for clock skew
payload = jwt.decode(
    token,
    signing_key.key,
    algorithms=["RS256"],
    leeway=10  # 10 seconds leeway
)
```

### Issue: Google OAuth Redirect Not Working

**Cause**: Redirect URI mismatch.

**Solution**:
1. Check Google Cloud Console → Credentials → OAuth 2.0 Client
2. Ensure redirect URI matches exactly:
   ```
   https://tenant-name.b2clogin.com/tenant-name.onmicrosoft.com/oauth2/authresp
   ```
3. Check Azure AD B2C → Identity providers → Google → Redirect URI

## Performance Optimization

### 1. JWKS Caching

```python
# JWTValidator caches JWKS for 1 hour
self._jwks_cache_ttl = 3600  # 1 hour

# Cached validator instance
@lru_cache()
def get_jwt_validator(tenant, client_id, policy_name) -> JWTValidator:
    return JWTValidator(tenant, client_id, policy_name)
```

### 2. User Profile Caching (Redis)

```python
# Cache user profile in Redis for 5 minutes
import aioredis

async def get_user_profile(user_id: str) -> User:
    # Try cache first
    cached = await redis.get(f"user:{user_id}")
    if cached:
        return User(**json.loads(cached))

    # Fetch from database
    user = await user_repo.find_by_id(user_id)

    # Cache for 5 minutes
    await redis.setex(
        f"user:{user_id}",
        300,
        user.json()
    )

    return user
```

### 3. Database Indexing

```python
# User collection indexes (from STEP 2)
await users_collection.create_index([("email", 1)], unique=True)
await users_collection.create_index([("auth_provider", 1), ("auth_provider_id", 1)], unique=True)
await users_collection.create_index([("created_at", -1)])
```

## Production Deployment Checklist

- [ ] Azure AD B2C tenant created
- [ ] Application registered in B2C
- [ ] Google OAuth provider configured
- [ ] User flow (B2C_1_signupsignin) created
- [ ] CORS configured for production domain
- [ ] Environment variables set in Azure Container Apps
- [ ] Managed Identity enabled for Container App
- [ ] MongoDB RBAC roles assigned to Managed Identity
- [ ] Redis cache configured for token blacklist
- [ ] Application Insights monitoring enabled
- [ ] Rate limiting configured
- [ ] Token expiration set appropriately (default: 1 hour)
- [ ] Frontend MSAL.js configuration updated
- [ ] SSL/TLS certificates configured
- [ ] Redirect URIs updated for production domain

## Additional Resources

- [Azure AD B2C Documentation](https://docs.microsoft.com/en-us/azure/active-directory-b2c/)
- [MSAL.js Documentation](https://github.com/AzureAD/microsoft-authentication-library-for-js)
- [PyJWT Documentation](https://pyjwt.readthedocs.io/)
- [FastAPI Security](https://fastapi.tiangolo.com/tutorial/security/)
- [OAuth 2.0 Authorization Framework](https://datatracker.ietf.org/doc/html/rfc6749)
- [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html)

## Summary

This implementation provides:

✅ **Enterprise-grade authentication** with Azure AD B2C
✅ **Multiple OAuth providers** (Google, GitHub, Microsoft, Email)
✅ **Secure JWT validation** with JWKS caching
✅ **Automatic user profile sync** to MongoDB
✅ **Token blacklisting** for logout
✅ **Subscription and credit enforcement**
✅ **Frontend integration** with MSAL.js
✅ **Comprehensive security** (PKCE, state, nonce)
✅ **Production-ready** with performance optimization

The authentication system is fully integrated with the MongoDB implementation (STEP 2) for user management and provides a solid foundation for securing all API endpoints.
