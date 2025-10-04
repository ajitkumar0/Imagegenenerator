# Authentication Quick Start Guide

## 🚀 Quick Setup (5 Minutes)

### Prerequisites

- Azure account with Azure AD B2C tenant
- Google Cloud Console account
- Backend running on `http://localhost:8000`
- Frontend running on `http://localhost:3000`

---

## Step 1: Configure Google OAuth (2 min)

### 1.1 Create Google OAuth App

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Navigate to **APIs & Services** → **Credentials**
4. Click **Create Credentials** → **OAuth 2.0 Client ID**
5. Configure consent screen:
   - User Type: External
   - App name: AI Image Generator
   - Support email: your-email@example.com
   - Scopes: email, profile, openid
6. Create OAuth Client ID:
   - Application type: Web application
   - Name: AI Image Generator
   - Authorized redirect URIs: `https://{your-tenant}.b2clogin.com/{your-tenant}.onmicrosoft.com/oauth2/authresp`
7. Save **Client ID** and **Client Secret**

---

## Step 2: Configure Azure AD B2C (3 min)

### 2.1 Create Identity Provider

1. Go to [Azure Portal](https://portal.azure.com/)
2. Navigate to your B2C tenant
3. Go to **Identity providers** → **New OpenID Connect provider**
4. Configure:
   - Name: `Google`
   - Metadata URL: `https://accounts.google.com/.well-known/openid-configuration`
   - Client ID: `{google-client-id}`
   - Client Secret: `{google-client-secret}`
   - Scope: `openid profile email`
   - Response type: `code`
   - Response mode: `form_post`

### 2.2 Create User Flow

1. Go to **User flows** → **New user flow**
2. Select **Sign up and sign in**
3. Version: **Recommended**
4. Name: `signupsignin1`
5. Identity providers: ✅ **Google**
6. User attributes (collect):
   - ✅ Display Name
   - ✅ Email Address
7. Application claims (return):
   - ✅ Display Name
   - ✅ Email Addresses
   - ✅ User's Object ID
8. Create

### 2.3 Register Application

1. Go to **App registrations** → **New registration**
2. Configure:
   - Name: `AI Image Generator`
   - Supported account types: Accounts in any identity provider
   - Redirect URI:
     - Platform: Single-page application (SPA)
     - URI: `http://localhost:3000` (dev)
3. After creation, note the **Application (client) ID**
4. Go to **Authentication**:
   - Implicit grant: ✅ ID tokens
   - Allow public client flows: Yes
5. Go to **API permissions**:
   - Add: `openid`, `offline_access`, `profile`, `email`

---

## Step 3: Configure Environment Variables

### 3.1 Frontend (.env.local)

Create `frontend/.env.local`:

```env
# API Configuration
NEXT_PUBLIC_API_URL=http://localhost:8000

# Azure AD B2C Configuration
NEXT_PUBLIC_AZURE_AD_B2C_TENANT=your-tenant-name
NEXT_PUBLIC_AZURE_AD_B2C_CLIENT_ID=your-client-id-from-step-2.3
NEXT_PUBLIC_AZURE_AD_B2C_POLICY_NAME=B2C_1_signupsignin1

# WebSocket Configuration
NEXT_PUBLIC_WS_URL=ws://localhost:8000/ws
```

**Example**:
```env
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_AZURE_AD_B2C_TENANT=aimagegenb2c
NEXT_PUBLIC_AZURE_AD_B2C_CLIENT_ID=12345678-1234-1234-1234-123456789abc
NEXT_PUBLIC_AZURE_AD_B2C_POLICY_NAME=B2C_1_signupsignin1
NEXT_PUBLIC_WS_URL=ws://localhost:8000/ws
```

### 3.2 Backend (.env)

Update `backend/.env`:

```env
# Azure AD B2C Configuration
AZURE_AD_B2C_TENANT_NAME=your-tenant-name
AZURE_AD_B2C_CLIENT_ID=your-client-id-from-step-2.3
AZURE_AD_B2C_POLICY_NAME=B2C_1_signupsignin1

# JWT Configuration
JWT_SECRET_KEY=your-super-secret-key-min-32-chars
JWT_ALGORITHM=HS256
JWT_EXPIRATION_MINUTES=60

# CORS Configuration
CORS_ORIGINS=["http://localhost:3000"]
```

**Generate JWT Secret**:
```bash
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

---

## Step 4: Test the Flow

### 4.1 Start Services

**Backend**:
```bash
cd backend
uvicorn app.main:app --reload --port 8000
```

**Frontend**:
```bash
cd frontend
npm run dev
```

### 4.2 Test Login

1. Open browser: `http://localhost:3000/auth/login`
2. Click **"Continue with Google"**
3. Should redirect to Azure AD B2C
4. Click **Google** sign-in option
5. Authenticate with Google account
6. Grant permissions
7. Should redirect back to app
8. Check browser console for token
9. Navigate to `/generate` - should work!

### 4.3 Verify in Developer Tools

**Check localStorage**:
```javascript
// In browser console
localStorage.getItem('auth_token'); // Should show JWT token
```

**Check API Request**:
```javascript
// In Network tab, look for any API request
// Headers should include:
Authorization: Bearer eyJ0eXAiOiJKV1QiLCJhbGci...
```

---

## 🔍 Troubleshooting

### Issue 1: Redirect URI Mismatch

**Error**: `AADB2C90006: The redirect URI provided in the request is not registered`

**Solution**:
- Check redirect URI in Azure AD B2C matches exactly
- For localhost: `http://localhost:3000` (no trailing slash)
- For production: `https://yourdomain.com`
- Must be registered as SPA platform

### Issue 2: CORS Error

**Error**: `Access to XMLHttpRequest blocked by CORS policy`

**Solution**:
```python
# backend/app/main.py
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # Add your frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

### Issue 3: Token Verification Fails

**Error**: `401 Unauthorized` when calling `/api/v1/auth/verify`

**Solution**:
1. Check backend can reach Azure AD B2C JWKS endpoint:
   ```bash
   curl https://{tenant}.b2clogin.com/{tenant}.onmicrosoft.com/{policy}/discovery/v2.0/keys
   ```
2. Verify environment variables match:
   - Tenant name
   - Client ID
   - Policy name
3. Check backend logs for specific error

### Issue 4: Google Sign-In Not Appearing

**Error**: Only email/password shown, no Google button

**Solution**:
- Ensure Google identity provider is enabled in user flow
- Check user flow name matches environment variable
- Verify Google OAuth app is configured correctly

### Issue 5: User Gets Stuck on Callback

**Error**: Loading spinner on `/auth/callback` forever

**Solution**:
1. Open browser console - check for errors
2. Verify MSAL configuration in `msal-config.ts`
3. Check redirect URI configuration
4. Clear browser cache and cookies
5. Try incognito mode

---

## 🧪 Testing Checklist

- [ ] User can click "Sign In with Google"
- [ ] Redirects to Azure AD B2C
- [ ] Google sign-in option appears
- [ ] Can authenticate with Google
- [ ] Returns to app after authentication
- [ ] Token stored in localStorage
- [ ] User profile loaded
- [ ] Can access protected routes
- [ ] API calls include Authorization header
- [ ] Refresh page keeps user logged in
- [ ] Logout clears tokens and session

---

## 📱 Production Deployment

### Update Environment Variables

**Frontend** (Vercel/Netlify):
```env
NEXT_PUBLIC_API_URL=https://api.yourdomain.com
NEXT_PUBLIC_AZURE_AD_B2C_TENANT=your-tenant-name
NEXT_PUBLIC_AZURE_AD_B2C_CLIENT_ID=your-client-id
NEXT_PUBLIC_AZURE_AD_B2C_POLICY_NAME=B2C_1_signupsignin1
NEXT_PUBLIC_WS_URL=wss://api.yourdomain.com/ws
```

**Backend** (Azure Container Apps):
```env
AZURE_AD_B2C_TENANT_NAME=your-tenant-name
AZURE_AD_B2C_CLIENT_ID=your-client-id
AZURE_AD_B2C_POLICY_NAME=B2C_1_signupsignin1
JWT_SECRET_KEY=production-secret-key
CORS_ORIGINS=["https://yourdomain.com"]
```

### Update Azure AD B2C Redirect URIs

1. Go to **App registrations** → Your app → **Authentication**
2. Add production redirect URI:
   - `https://yourdomain.com`
3. Save

### Update Google OAuth Redirect URIs

1. Go to Google Cloud Console → Credentials
2. Edit OAuth 2.0 Client ID
3. Add authorized redirect URI:
   - `https://{tenant}.b2clogin.com/{tenant}.onmicrosoft.com/oauth2/authresp`
4. Save

---

## 🔐 Security Best Practices

### 1. Use HTTPS in Production

```nginx
# Enforce HTTPS
server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://$server_name$request_uri;
}
```

### 2. Rotate JWT Secret Regularly

```bash
# Generate new secret
python -c "import secrets; print(secrets.token_urlsafe(32))"

# Update in Azure Key Vault or environment
```

### 3. Set Token Expiration

```python
# Backend - short-lived tokens
JWT_EXPIRATION_MINUTES=15  # 15 minutes

# Frontend - auto-refresh before expiry
```

### 4. Enable Rate Limiting

```python
# Backend - prevent brute force
from slowapi import Limiter

limiter = Limiter(key_func=get_remote_address)

@app.post("/auth/verify")
@limiter.limit("5/minute")  # Max 5 attempts per minute
async def verify_token(request: Request):
    ...
```

### 5. Monitor Auth Events

```python
# Log all authentication events
logger.info(
    "Authentication successful",
    extra={
        "user_id": user.id,
        "ip_address": request.client.host,
        "timestamp": datetime.utcnow()
    }
)
```

---

## 📚 Additional Resources

- [Azure AD B2C Documentation](https://docs.microsoft.com/azure/active-directory-b2c/)
- [MSAL.js Documentation](https://github.com/AzureAD/microsoft-authentication-library-for-js)
- [Google OAuth Documentation](https://developers.google.com/identity/protocols/oauth2)
- [Complete Authentication Flow](./AUTHENTICATION_FLOW.md)
- [Frontend Integration Guide](./FRONTEND_INTEGRATION.md)

---

## 🎉 Success!

If you can:
1. ✅ Sign in with Google
2. ✅ See your name in the UI
3. ✅ Make API calls to backend
4. ✅ Stay logged in after refresh

**You're all set!** The authentication flow is working correctly.

---

## Need Help?

Check the detailed [Authentication Flow Documentation](./AUTHENTICATION_FLOW.md) for:
- Step-by-step flow diagrams
- Token lifecycle management
- Error handling strategies
- Security considerations
- Testing procedures
