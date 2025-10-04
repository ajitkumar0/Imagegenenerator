## Frontend Integration Guide

Complete guide for integrating the Next.js frontend with the ImageGenerator backend API.

## Table of Contents

1. [Setup](#setup)
2. [Authentication Integration](#authentication-integration)
3. [API Client Usage](#api-client-usage)
4. [Real-Time Updates](#real-time-updates)
5. [Component Examples](#component-examples)
6. [Error Handling](#error-handling)
7. [Testing](#testing)
8. [Deployment](#deployment)

## Setup

### 1. Install Dependencies

```bash
cd frontend

# Install required packages
npm install axios@^1.6.0
npm install @azure/msal-browser@^3.7.0
npm install @azure/msal-react@^2.0.0

# TypeScript types
npm install --save-dev @types/node
```

### 2. Environment Configuration

Create `.env.local` from `.env.local.example`:

```bash
cp .env.local.example .env.local
```

Edit `.env.local` with your values:

```env
# Backend API
NEXT_PUBLIC_API_URL=http://localhost:8000

# Azure AD B2C
NEXT_PUBLIC_AZURE_AD_B2C_TENANT=your-tenant
NEXT_PUBLIC_AZURE_AD_B2C_CLIENT_ID=your-client-id
NEXT_PUBLIC_AZURE_AD_B2C_POLICY_NAME=B2C_1_signupsignin

# Redirects
NEXT_PUBLIC_REDIRECT_URI=http://localhost:3000/auth/callback
NEXT_PUBLIC_POST_LOGOUT_REDIRECT_URI=http://localhost:3000

# WebSocket
NEXT_PUBLIC_WS_URL=ws://localhost:8000/ws

# Stripe
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
```

### 3. Update App Layout

Add AuthProvider to root layout (`app/layout.tsx`):

```typescript
import { AuthProvider } from '@/lib/auth/auth-context';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
```

## Authentication Integration

### Azure AD B2C Setup

#### 1. Register Application in Azure Portal

1. Go to Azure Portal → Azure AD B2C
2. Click "App registrations" → "New registration"
3. Set name: "ImageGenerator Frontend"
4. Select "Accounts in any identity provider or organizational directory"
5. Add redirect URI: `http://localhost:3000/auth/callback` (type: SPA)
6. Click "Register"
7. Copy "Application (client) ID"

#### 2. Configure User Flows

Create sign-up/sign-in flow:
1. Go to "User flows" → "New user flow"
2. Select "Sign up and sign in"
3. Name: `B2C_1_signupsignin`
4. Select identity providers (Email, Google, etc.)
5. Select user attributes to collect
6. Create flow

#### 3. Configure API Scope

1. Go to "Expose an API"
2. Add scope: `access`
3. Description: "Access ImageGenerator API"
4. Copy full scope URI

### Using Authentication

#### Login/Logout

```typescript
import { useAuth } from '@/lib/auth/auth-context';

function MyComponent() {
  const { login, logout, isAuthenticated, user } = useAuth();

  return (
    <div>
      {isAuthenticated ? (
        <div>
          <p>Welcome, {user?.email}</p>
          <button onClick={logout}>Logout</button>
        </div>
      ) : (
        <button onClick={login}>Login</button>
      )}
    </div>
  );
}
```

#### Protected Routes

```typescript
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';

export default function DashboardPage() {
  return (
    <ProtectedRoute>
      <div>Protected content here</div>
    </ProtectedRoute>
  );
}
```

#### Protected Component (HOC)

```typescript
import { withAuth } from '@/components/auth/ProtectedRoute';

function DashboardContent() {
  return <div>Dashboard</div>;
}

export default withAuth(DashboardContent);
```

#### Custom Hook

```typescript
import { useRequireAuth } from '@/components/auth/ProtectedRoute';

function MyComponent() {
  const isAuthenticated = useRequireAuth();

  if (!isAuthenticated) return null;

  return <div>Protected content</div>;
}
```

## API Client Usage

The API client automatically handles:
- JWT token injection
- Token refresh
- Request retries
- Error normalization

### Subscription Management

```typescript
import apiClient from '@/lib/api-client';

// Get current subscription
const subscription = await apiClient.getSubscription();

// Get available tiers
const { tiers } = await apiClient.getSubscriptionTiers();

// Get usage statistics
const usage = await apiClient.getUsageStats();

// Create checkout session
const { checkout_url } = await apiClient.createCheckoutSession({
  tier: 'basic',
  success_url: `${window.location.origin}/subscription/success`,
  cancel_url: `${window.location.origin}/pricing`,
});

// Redirect to Stripe
window.location.href = checkout_url;

// Create billing portal session
const { portal_url } = await apiClient.createPortalSession();
window.location.href = portal_url;

// Cancel subscription
await apiClient.cancelSubscription(true); // at_period_end
```

### Image Generation

```typescript
import apiClient from '@/lib/api-client';
import { GenerationRequest } from '@/lib/types/api';

// Create generation
const request: GenerationRequest = {
  prompt: 'A beautiful sunset over mountains',
  negative_prompt: 'blurry, low quality',
  model: 'flux-schnell',
  width: 1024,
  height: 1024,
  guidance_scale: 7.5,
};

const { generation_id } = await apiClient.createGeneration(request);

// Get generation status
const generation = await apiClient.getGeneration(generation_id);

// List user's generations
const { generations } = await apiClient.listGenerations({
  page: 1,
  page_size: 20,
  status: 'completed',
});

// Delete generation
await apiClient.deleteGeneration(generation_id);

// Cancel running generation
await apiClient.cancelGeneration(generation_id);
```

### Error Handling

```typescript
try {
  const generation = await apiClient.createGeneration(request);
} catch (error: any) {
  // Error is normalized to APIError type
  console.error('Error:', error.detail);
  console.error('Status code:', error.status_code);
  console.error('Error code:', error.error_code);

  // Handle specific errors
  if (error.status_code === 402) {
    // Insufficient credits
    alert('Please upgrade your subscription');
  } else if (error.status_code === 429) {
    // Rate limited
    alert('Too many requests, please try again later');
  }
}
```

## Real-Time Updates

### WebSocket Connection

```typescript
import { useWebSocket } from '@/lib/websocket-client';

function MyComponent() {
  const { isConnected, lastMessage, send, subscribe, unsubscribe } = useWebSocket({
    enabled: true,
    onMessage: (message) => {
      console.log('Received:', message);
    },
    onConnect: () => {
      console.log('WebSocket connected');
    },
    onDisconnect: () => {
      console.log('WebSocket disconnected');
    },
  });

  // Subscribe to generation updates
  useEffect(() => {
    if (isConnected && generationId) {
      subscribe(generationId);

      return () => {
        unsubscribe(generationId);
      };
    }
  }, [isConnected, generationId]);

  return <div>Connected: {isConnected ? 'Yes' : 'No'}</div>;
}
```

### Generation Updates Hook

```typescript
import { useGenerationUpdates } from '@/lib/websocket-client';

function GenerationStatus({ generationId }: { generationId: string }) {
  const { isConnected, status, progress, error } = useGenerationUpdates({
    generationId,
    enabled: true,
    onUpdate: (update) => {
      console.log('Generation update:', update);

      if (update.status === 'completed') {
        // Refresh generation details
        refreshGeneration();
      }
    },
  });

  return (
    <div>
      <p>Status: {status}</p>
      {progress > 0 && <p>Progress: {progress}%</p>}
      {error && <p className="text-red-600">{error}</p>}
      {isConnected && <span className="text-green-600">● Live</span>}
    </div>
  );
}
```

## Component Examples

### Subscription Upgrade Component

```typescript
'use client';

import { useState, useEffect } from 'react';
import apiClient from '@/lib/api-client';
import { SubscriptionTierInfo } from '@/lib/types/api';

export function PricingPlans() {
  const [tiers, setTiers] = useState<SubscriptionTierInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTiers();
  }, []);

  const loadTiers = async () => {
    try {
      const { tiers: data } = await apiClient.getSubscriptionTiers();
      setTiers(data);
    } catch (error) {
      console.error('Failed to load tiers:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubscribe = async (tier: string) => {
    try {
      const { checkout_url } = await apiClient.createCheckoutSession({
        tier: tier as any,
        success_url: `${window.location.origin}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${window.location.origin}/pricing`,
      });

      window.location.href = checkout_url;
    } catch (error: any) {
      alert(error.detail || 'Failed to start checkout');
    }
  };

  if (loading) return <div>Loading...</div>;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {tiers.map((tier) => (
        <div key={tier.tier} className="border rounded-lg p-6">
          <h3 className="text-2xl font-bold">{tier.name}</h3>
          <p className="text-4xl font-bold mt-4">
            ${tier.price_monthly}
            <span className="text-lg font-normal">/month</span>
          </p>

          <ul className="mt-6 space-y-2">
            {tier.features.map((feature, i) => (
              <li key={i} className="flex items-start">
                <svg className="w-5 h-5 text-green-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                <span>{feature}</span>
              </li>
            ))}
          </ul>

          <button
            onClick={() => handleSubscribe(tier.tier)}
            className="w-full mt-8 bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700"
          >
            {tier.tier === 'free' ? 'Current Plan' : 'Subscribe'}
          </button>
        </div>
      ))}
    </div>
  );
}
```

### Generation Gallery Component

```typescript
'use client';

import { useState, useEffect } from 'react';
import apiClient from '@/lib/api-client';
import { Generation } from '@/lib/types/api';

export function GenerationGallery() {
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  useEffect(() => {
    loadGenerations();
  }, [page]);

  const loadGenerations = async () => {
    try {
      const response = await apiClient.listGenerations({
        page,
        page_size: 20,
        status: 'completed',
        order_by: 'created_at',
        order: 'desc',
      });

      if (page === 1) {
        setGenerations(response.generations);
      } else {
        setGenerations((prev) => [...prev, ...response.generations]);
      }

      setHasMore(response.has_more);
    } catch (error) {
      console.error('Failed to load generations:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this generation?')) return;

    try {
      await apiClient.deleteGeneration(id);
      setGenerations((prev) => prev.filter((g) => g.id !== id));
    } catch (error: any) {
      alert(error.detail || 'Failed to delete');
    }
  };

  if (loading) return <div>Loading...</div>;

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {generations.map((gen) => (
          <div key={gen.id} className="relative group">
            <img
              src={gen.blob_urls[0]}
              alt={gen.prompt}
              className="w-full rounded-lg"
            />

            <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-75 transition-all rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100">
              <div className="space-x-2">
                <a
                  href={gen.blob_urls[0]}
                  download
                  className="bg-white text-gray-900 py-2 px-4 rounded-lg"
                >
                  Download
                </a>
                <button
                  onClick={() => handleDelete(gen.id)}
                  className="bg-red-600 text-white py-2 px-4 rounded-lg"
                >
                  Delete
                </button>
              </div>
            </div>

            <div className="mt-2">
              <p className="text-sm text-gray-600 truncate">{gen.prompt}</p>
              <p className="text-xs text-gray-500">
                {new Date(gen.created_at).toLocaleDateString()}
              </p>
            </div>
          </div>
        ))}
      </div>

      {hasMore && (
        <div className="mt-8 text-center">
          <button
            onClick={() => setPage((p) => p + 1)}
            className="bg-blue-600 text-white py-3 px-6 rounded-lg hover:bg-blue-700"
          >
            Load More
          </button>
        </div>
      )}
    </div>
  );
}
```

## Error Handling

### Global Error Boundary

Create `components/ErrorBoundary.tsx`:

```typescript
'use client';

import React from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div className="min-h-screen flex items-center justify-center">
            <div className="text-center">
              <h1 className="text-2xl font-bold text-gray-900 mb-4">
                Something went wrong
              </h1>
              <p className="text-gray-600 mb-6">
                {this.state.error?.message || 'An unexpected error occurred'}
              </p>
              <button
                onClick={() => window.location.reload()}
                className="bg-blue-600 text-white py-2 px-6 rounded-lg"
              >
                Reload Page
              </button>
            </div>
          </div>
        )
      );
    }

    return this.props.children;
  }
}
```

Use in layout:

```typescript
<ErrorBoundary>
  <AuthProvider>{children}</AuthProvider>
</ErrorBoundary>
```

### Loading States

Create reusable loading component:

```typescript
export function LoadingSpinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-8 w-8',
    lg: 'h-12 w-12',
  };

  return (
    <div className="flex items-center justify-center">
      <div
        className={`animate-spin rounded-full border-b-2 border-blue-600 ${sizeClasses[size]}`}
      />
    </div>
  );
}
```

## Testing

### Unit Tests (Jest)

Test API client methods:

```typescript
import apiClient from '@/lib/api-client';
import { TokenManager } from '@/lib/api-client';

jest.mock('@/lib/api-client');

describe('API Client', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should get subscription', async () => {
    const mockSubscription = { tier: 'basic', status: 'active' };
    (apiClient.getSubscription as jest.Mock).mockResolvedValue(mockSubscription);

    const result = await apiClient.getSubscription();
    expect(result).toEqual(mockSubscription);
  });

  it('should handle API errors', async () => {
    const mockError = { detail: 'Unauthorized', status_code: 401 };
    (apiClient.getSubscription as jest.Mock).mockRejectedValue(mockError);

    await expect(apiClient.getSubscription()).rejects.toEqual(mockError);
  });
});
```

### End-to-End Tests (Playwright)

```typescript
import { test, expect } from '@playwright/test';

test.describe('Image Generation Flow', () => {
  test('should generate image successfully', async ({ page }) => {
    // Login
    await page.goto('/login');
    await page.fill('[name="email"]', 'test@example.com');
    await page.fill('[name="password"]', 'password123');
    await page.click('button[type="submit"]');

    // Navigate to generate page
    await page.goto('/generate');

    // Fill form
    await page.fill('[name="prompt"]', 'A beautiful sunset');
    await page.selectOption('[name="model"]', 'flux-schnell');

    // Generate
    await page.click('button:has-text("Generate Image")');

    // Wait for completion
    await page.waitForSelector('img[alt*="sunset"]', { timeout: 60000 });

    // Verify image is displayed
    const image = await page.locator('img[alt*="sunset"]');
    await expect(image).toBeVisible();
  });
});
```

## Deployment

### Production Checklist

- [ ] Update `.env.local` with production values
- [ ] Use HTTPS URLs for API and WebSocket
- [ ] Configure CORS on backend for production domain
- [ ] Set up Azure AD B2C production tenant
- [ ] Use live Stripe keys
- [ ] Enable error tracking (Sentry, etc.)
- [ ] Set up analytics
- [ ] Configure CDN for static assets
- [ ] Test authentication flow end-to-end
- [ ] Test payment flow with real payment method
- [ ] Load test API endpoints
- [ ] Set up monitoring and alerts

### Build & Deploy

```bash
# Build production bundle
npm run build

# Test production build locally
npm start

# Deploy to Vercel
vercel --prod

# Or deploy to Azure Static Web Apps
npm run build
az staticwebapp deploy --name your-app-name
```

### Environment Variables in Production

For Vercel:
```bash
vercel env add NEXT_PUBLIC_API_URL
vercel env add NEXT_PUBLIC_AZURE_AD_B2C_TENANT
# ... add all required variables
```

For Azure Static Web Apps, configure in Azure Portal under Configuration.

## Troubleshooting

### Common Issues

**Issue: Authentication fails after redirect**
- Check redirect URI matches Azure AD B2C config exactly
- Ensure HTTPS in production
- Check browser console for MSAL errors

**Issue: API calls fail with CORS errors**
- Verify backend CORS configuration includes frontend domain
- Check API URL is correct in environment variables

**Issue: WebSocket connection fails**
- Ensure WebSocket URL uses correct protocol (ws:// or wss://)
- Check backend WebSocket endpoint is accessible
- Verify firewall allows WebSocket connections

**Issue: Token refresh fails**
- Check token expiration time
- Verify MSAL configuration is correct
- Check browser localStorage for token data

### Debug Mode

Enable debug logging:

```typescript
// In api-client.ts
axios.interceptors.request.use((config) => {
  if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
    console.log('Request:', config.method, config.url, config.data);
  }
  return config;
});

axios.interceptors.response.use(
  (response) => {
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log('Response:', response.status, response.data);
    }
    return response;
  },
  (error) => {
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.error('Error:', error.response?.status, error.response?.data);
    }
    return Promise.reject(error);
  }
);
```

## Additional Resources

- [Next.js Documentation](https://nextjs.org/docs)
- [MSAL.js Documentation](https://learn.microsoft.com/en-us/azure/active-directory/develop/msal-overview)
- [Axios Documentation](https://axios-http.com/docs/intro)
- [Azure AD B2C Documentation](https://learn.microsoft.com/en-us/azure/active-directory-b2c/)
- [Stripe Checkout Documentation](https://stripe.com/docs/payments/checkout)
