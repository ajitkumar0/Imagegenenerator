# Error Handling Guide

## Complete Error Handling Implementation

This document describes the comprehensive error handling system implemented across the frontend application.

---

## Table of Contents

1. [Error Classification](#error-classification)
2. [Components](#components)
3. [Error Types](#error-types)
4. [Usage Examples](#usage-examples)
5. [API Error Handling](#api-error-handling)
6. [Recovery Strategies](#recovery-strategies)
7. [Testing](#testing)

---

## Error Classification

### Error Types

| Error Type | HTTP Status | Description | Recovery |
|------------|-------------|-------------|----------|
| **AUTHENTICATION** | 401 | Session expired or invalid | Redirect to login |
| **AUTHORIZATION** | 403 | Insufficient permissions | Show upgrade prompt |
| **PAYMENT_REQUIRED** | 402 | Insufficient credits | Redirect to pricing |
| **RATE_LIMIT** | 429 | Too many requests | Auto-retry with backoff |
| **VALIDATION** | 422 | Invalid input data | Show validation errors |
| **NOT_FOUND** | 404 | Resource not found | Show helpful message |
| **SERVER_ERROR** | 500+ | Internal server error | Auto-retry |
| **NETWORK_ERROR** | 0 | Connection failed | Show offline message |
| **TIMEOUT** | 408 | Request timeout | Auto-retry |

### Error Severity

| Severity | Color | User Impact | Examples |
|----------|-------|-------------|----------|
| **LOW** | Blue | Minor inconvenience | Validation errors, not found |
| **MEDIUM** | Yellow | Feature unavailable | Rate limits, timeouts |
| **HIGH** | Red | Critical feature blocked | Auth errors, payment errors |
| **CRITICAL** | Red | App unusable | Fatal errors, no recovery |

---

## Components

### 1. Error Boundary

**File**: [frontend/components/errors/ErrorBoundary.tsx](../frontend/components/errors/ErrorBoundary.tsx)

**Purpose**: Catches JavaScript errors in component tree and shows fallback UI

**Usage**:
```typescript
import { ErrorBoundary } from '@/components/errors/ErrorBoundary';

// Wrap your app or specific components
export default function RootLayout({ children }) {
  return (
    <ErrorBoundary>
      {children}
    </ErrorBoundary>
  );
}

// With custom fallback
<ErrorBoundary fallback={<CustomError />}>
  <MyComponent />
</ErrorBoundary>

// Using HOC
const ProtectedComponent = withErrorBoundary(MyComponent);
```

**Features**:
- Catches unhandled component errors
- Shows user-friendly error page
- Provides recovery actions (reset, reload, home)
- Logs errors for monitoring
- Shows stack trace in development

---

### 2. Error Toast

**File**: [frontend/components/errors/ErrorToast.tsx](../frontend/components/errors/ErrorToast.tsx)

**Purpose**: Displays temporary error notifications

**Usage**:
```typescript
import { showErrorToast, ErrorToastContainer } from '@/components/errors/ErrorToast';

// Add container to root layout
export default function RootLayout({ children }) {
  return (
    <>
      {children}
      <ErrorToastContainer />
    </>
  );
}

// Show toast from anywhere
try {
  await apiCall();
} catch (error) {
  showErrorToast(error);
}
```

**Features**:
- Auto-dismiss after 5 seconds (configurable)
- Manual dismiss button
- Severity-based styling
- Action buttons
- Stacked multiple toasts
- Slide-in/out animations

---

### 3. Inline Error Display

**File**: [frontend/components/errors/ErrorDisplay.tsx](../frontend/components/errors/ErrorDisplay.tsx)

**Purpose**: Displays errors inline within pages and forms

**Usage**:
```typescript
import { ErrorDisplay, CompactError, EmptyStateError } from '@/components/errors/ErrorDisplay';

// Full error display with retry
<ErrorDisplay
  error={error}
  onRetry={handleRetry}
  onDismiss={() => setError(null)}
/>

// Compact for forms
<CompactError error={validationError} className="mt-2" />

// Empty state with error
<EmptyStateError
  error={error}
  action={{ label: 'Try Again', onClick: handleRetry }}
/>

// Loading state with error fallback
<LoadingStateWithError
  loading={isLoading}
  error={error}
  onRetry={handleRetry}
>
  <Content />
</LoadingStateWithError>
```

---

## Error Types

### 1. Authentication Error (401)

**Trigger**: Session expired, invalid token

**User Experience**:
- Immediate redirect to login page
- Return URL preserved
- Auto-retry after re-authentication

**Example**:
```typescript
// Automatic handling in API client
// User sees:
"Your session has expired. Please sign in again."
[Sign In Button] → Redirects to /auth/login
```

---

### 2. Authorization Error (403)

**Trigger**: Feature requires premium subscription

**User Experience**:
- Shows upgrade prompt
- Link to pricing page
- Feature remains visible but disabled

**Example**:
```typescript
try {
  await generateImage({ model: 'flux-pro' });
} catch (error) {
  // User sees:
  "This feature requires a premium subscription."
  [View Plans Button] → Redirects to /pricing
}
```

---

### 3. Payment Required Error (402)

**Trigger**: Insufficient credits

**User Experience**:
- Shows credit balance
- Link to upgrade plan
- Current tier information

**Example**:
```typescript
try {
  await generateImage({ prompt });
} catch (error) {
  // User sees:
  "You don't have enough credits for this operation."
  [Upgrade Plan Button] → Redirects to /pricing
}
```

---

### 4. Rate Limit Error (429)

**Trigger**: Too many requests

**User Experience**:
- Auto-retry with exponential backoff
- Shows "Rate limit exceeded" message
- Suggests waiting before retry

**Example**:
```typescript
// Automatic retry in API client (3 attempts)
// User sees toast if all retries fail:
"You're making too many requests. Please wait a moment."
[Try Again] → Manual retry
```

---

### 5. Validation Error (422)

**Trigger**: Invalid form input

**User Experience**:
- Inline error messages
- Highlighted invalid fields
- Clear instructions to fix

**Example**:
```typescript
<form onSubmit={handleSubmit}>
  <input
    value={prompt}
    onChange={(e) => setPrompt(e.target.value)}
    className={error ? 'border-red-500' : ''}
  />
  {error && <CompactError error={error} />}
</form>

// User sees:
"Please enter a prompt (minimum 3 characters)"
```

---

### 6. Server Error (500+)

**Trigger**: Backend server error

**User Experience**:
- Auto-retry with backoff (3 attempts)
- Generic error message (no technical details)
- Suggest contacting support if persists

**Example**:
```typescript
// Automatic retry in API client
// User sees after retries fail:
"Something went wrong on our end. Please try again in a moment."
[Try Again] → Manual retry
```

---

### 7. Network Error

**Trigger**: No internet connection

**User Experience**:
- Clear offline message
- Auto-retry when connection restored
- Helpful suggestions

**Example**:
```typescript
// User sees:
"Unable to connect to the server. Please check your internet connection."
[Try Again] → Manual retry
```

---

## API Error Handling

### Automatic Handling in API Client

**File**: [frontend/lib/api-client.ts](../frontend/lib/api-client.ts)

**Features**:
- **401 (Unauthorized)**: Auto token refresh → Retry request → Redirect to login if fails
- **429 (Rate Limit)**: Exponential backoff retry (1s, 2s, 4s)
- **500+ (Server Error)**: Exponential backoff retry (1s, 2s, 4s)
- **Network Errors**: Normalize error message
- **Timeouts**: Show clear timeout message

**Example Flow**:
```
API Request
  ↓
401 Unauthorized
  ↓
Try Token Refresh
  ↓
Success? → Retry Original Request → Success
  ↓
Fail? → Clear Tokens → Redirect to Login
```

---

## Recovery Strategies

### 1. Auto-Retry

**File**: [frontend/lib/errors.ts](../frontend/lib/errors.ts)

```typescript
import { retryOperation } from '@/lib/errors';

const data = await retryOperation(
  () => apiClient.getSubscription(),
  {
    maxAttempts: 3,
    delay: 1000,
    backoff: true,
    onRetry: (attempt) => console.log(`Retry ${attempt}...`),
  }
);
```

**Retry Logic**:
- Attempt 1: 1 second delay
- Attempt 2: 2 seconds delay
- Attempt 3: 4 seconds delay
- If all fail: Throw error

**When to Retry**:
- ✅ Rate limit (429)
- ✅ Server errors (500+)
- ✅ Network errors
- ✅ Timeouts
- ❌ Authentication (401)
- ❌ Validation (422)
- ❌ Not found (404)

---

### 2. User-Initiated Retry

```typescript
function MyComponent() {
  const [error, setError] = useState(null);

  const handleRetry = async () => {
    setError(null);
    try {
      await loadData();
    } catch (err) {
      setError(err);
    }
  };

  return (
    <ErrorDisplay
      error={error}
      onRetry={handleRetry}
    />
  );
}
```

---

### 3. Redirect-Based Recovery

**Authentication Error**:
```typescript
// Automatic in API client
if (error.status === 401) {
  const returnUrl = window.location.pathname;
  window.location.href = `/auth/login?returnUrl=${returnUrl}`;
}
```

**Payment Required**:
```typescript
// User-initiated
if (error.status === 402) {
  showErrorToast({
    message: 'Insufficient credits',
    action: {
      label: 'Upgrade Plan',
      onClick: () => router.push('/pricing'),
    },
  });
}
```

---

## Usage Examples

### Example 1: Generation Page with Error Handling

```typescript
'use client';

import { useState } from 'react';
import { ErrorDisplay } from '@/components/errors/ErrorDisplay';
import { showErrorToast } from '@/components/errors/ErrorToast';
import apiClient from '@/lib/api-client';

export default function GeneratePage() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState(null);

  const handleGenerate = async () => {
    setIsGenerating(true);
    setError(null);

    try {
      const response = await apiClient.createGeneration({
        prompt: 'A beautiful sunset',
      });

      // Success
      showSuccessToast('Generation started!');
    } catch (err) {
      // Handle specific errors
      if (err.status_code === 402) {
        // Insufficient credits - show upgrade prompt
        setError(err);
      } else if (err.status_code === 429) {
        // Rate limit - show toast (auto-retried)
        showErrorToast(err);
      } else {
        // Other errors - show inline error
        setError(err);
      }
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div>
      {error && (
        <ErrorDisplay
          error={error}
          onRetry={handleGenerate}
          onDismiss={() => setError(null)}
        />
      )}

      <button
        onClick={handleGenerate}
        disabled={isGenerating}
      >
        {isGenerating ? 'Generating...' : 'Generate'}
      </button>
    </div>
  );
}
```

---

### Example 2: Form with Validation Errors

```typescript
'use client';

import { useState } from 'react';
import { CompactError } from '@/components/errors/ErrorDisplay';

export default function PromptForm() {
  const [prompt, setPrompt] = useState('');
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    // Client-side validation
    if (prompt.length < 3) {
      setError({ detail: 'Prompt must be at least 3 characters' });
      return;
    }

    try {
      await apiClient.createGeneration({ prompt });
    } catch (err) {
      setError(err);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        className={error ? 'border-red-500' : ''}
      />
      {error && <CompactError error={error} />}
      <button type="submit">Generate</button>
    </form>
  );
}
```

---

### Example 3: Loading State with Error Fallback

```typescript
'use client';

import { useState, useEffect } from 'react';
import { LoadingStateWithError } from '@/components/errors/ErrorDisplay';
import apiClient from '@/lib/api-client';

export default function SubscriptionPage() {
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadSubscription = async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await apiClient.getSubscription();
      setSubscription(data);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSubscription();
  }, []);

  return (
    <LoadingStateWithError
      loading={loading}
      error={error}
      onRetry={loadSubscription}
    >
      <SubscriptionDetails data={subscription} />
    </LoadingStateWithError>
  );
}
```

---

## Testing

### Unit Tests

```typescript
import { classifyError, getUserFriendlyMessage } from '@/lib/errors';

describe('Error Classification', () => {
  it('classifies 401 as authentication error', () => {
    const error = { status_code: 401, detail: 'Unauthorized' };
    const info = classifyError(error);

    expect(info.type).toBe('authentication');
    expect(info.severity).toBe('high');
    expect(info.action).toBeDefined();
  });

  it('classifies 402 as payment required', () => {
    const error = { status_code: 402, detail: 'Insufficient credits' };
    const info = classifyError(error);

    expect(info.type).toBe('payment_required');
    expect(info.action?.label).toBe('Upgrade Plan');
  });

  it('provides user-friendly messages', () => {
    const error = { status_code: 500, detail: 'Internal server error' };
    const message = getUserFriendlyMessage(error);

    expect(message).toContain('Something went wrong');
  });
});
```

### Integration Tests

```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import GeneratePage from '@/app/generate/text-to-image/page';

describe('Error Handling Integration', () => {
  it('shows error when generation fails', async () => {
    // Mock API failure
    jest.spyOn(apiClient, 'createGeneration').mockRejectedValue({
      status_code: 402,
      detail: 'Insufficient credits',
    });

    render(<GeneratePage />);

    // Trigger generation
    fireEvent.click(screen.getByText('Generate'));

    // Wait for error
    await waitFor(() => {
      expect(screen.getByText('Insufficient Credits')).toBeInTheDocument();
      expect(screen.getByText('Upgrade Plan')).toBeInTheDocument();
    });
  });

  it('retries on server error', async () => {
    const mockCreate = jest.spyOn(apiClient, 'createGeneration')
      .mockRejectedValueOnce({ status_code: 500 })
      .mockResolvedValueOnce({ generation_id: '123' });

    render(<GeneratePage />);

    fireEvent.click(screen.getByText('Generate'));

    // Should retry and succeed
    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledTimes(2);
    });
  });
});
```

---

## Best Practices

### 1. Always Handle Errors

```typescript
// ❌ Bad - No error handling
const data = await apiClient.getData();

// ✅ Good - Try-catch with user feedback
try {
  const data = await apiClient.getData();
} catch (error) {
  showErrorToast(error);
}
```

### 2. Provide Recovery Actions

```typescript
// ❌ Bad - No way to recover
<ErrorDisplay error={error} />

// ✅ Good - Allow retry
<ErrorDisplay error={error} onRetry={handleRetry} />
```

### 3. Use Appropriate Error Display

```typescript
// Form errors → CompactError
<CompactError error={validationError} />

// Page errors → ErrorDisplay
<ErrorDisplay error={pageError} onRetry={reload} />

// Notifications → Toast
showErrorToast(networkError);

// Fatal errors → Error Boundary (automatic)
```

### 4. Log Errors for Monitoring

```typescript
import { logError } from '@/lib/errors';

try {
  await apiCall();
} catch (error) {
  logError(error, { context: 'generation', userId: user.id });
  showErrorToast(error);
}
```

---

## Conclusion

The error handling system provides:

✅ **Classification**: Automatic error type detection
✅ **User-Friendly Messages**: Clear, non-technical language
✅ **Recovery Actions**: Retry, upgrade, sign in
✅ **Multiple Display Options**: Toast, inline, boundary
✅ **Auto-Retry**: Exponential backoff for retriable errors
✅ **Logging**: Development console + production monitoring
✅ **Testing**: Comprehensive test coverage

**Result**: Professional error handling that improves user experience and reduces support tickets!
