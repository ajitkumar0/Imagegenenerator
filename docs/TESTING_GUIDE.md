# End-to-End Testing Guide

Complete testing guide for the ImageGenerator application.

## Table of Contents

1. [Testing Checklist](#testing-checklist)
2. [Unit Testing](#unit-testing)
3. [Integration Testing](#integration-testing)
4. [End-to-End Testing](#end-to-end-testing)
5. [Performance Testing](#performance-testing)
6. [Security Testing](#security-testing)

## Testing Checklist

### ✅ Authentication Flow

**Azure AD B2C Authentication**

- [ ] User can click "Sign In" button
- [ ] Redirects to Azure AD B2C login page
- [ ] Can sign in with Google account
- [ ] Can sign in with email/password
- [ ] Returns to app after successful login
- [ ] User profile is displayed correctly
- [ ] JWT token is stored in localStorage
- [ ] Token is included in API requests
- [ ] Can sign out successfully
- [ ] Token clears on sign out
- [ ] Redirects to login when accessing protected routes
- [ ] Password reset flow works
- [ ] Profile edit flow works

**Token Management**

- [ ] Token refreshes automatically before expiration
- [ ] Failed refresh triggers re-authentication
- [ ] 401 responses trigger re-login
- [ ] Multiple tabs share authentication state

### ✅ Subscription Management

**Viewing Subscription**

- [ ] Current tier is displayed correctly
- [ ] Credits remaining shows accurate count
- [ ] Usage percentage is correct
- [ ] Period end date is displayed
- [ ] Features list matches tier

**Stripe Checkout Flow**

- [ ] Pricing page shows all tiers
- [ ] Free tier shows "Current Plan"
- [ ] Basic tier shows Subscribe button
- [ ] Premium tier shows Subscribe button
- [ ] Clicking Subscribe redirects to Stripe
- [ ] Can complete payment with test card (4242 4242 4242 4242)
- [ ] Redirects to success page after payment
- [ ] Subscription updates in database
- [ ] Credits are allocated
- [ ] Webhook processes correctly

**Billing Portal**

- [ ] "Manage Billing" button redirects to Stripe Portal
- [ ] Can update payment method
- [ ] Can change subscription plan
- [ ] Can cancel subscription
- [ ] Can view invoices
- [ ] Returns to app after portal session

**Subscription Cancellation**

- [ ] Cancel button works
- [ ] Confirmation dialog shows
- [ ] Subscription marked for cancellation
- [ ] Keeps access until period end
- [ ] Downgrades to free after period ends
- [ ] Can reactivate before period end

### ✅ Image Generation (Text-to-Image)

**Form Validation**

- [ ] Prompt is required
- [ ] Prompt has minimum length (3 chars)
- [ ] Prompt has maximum length (500 chars)
- [ ] Character counter updates
- [ ] Invalid prompts show error
- [ ] Generate button disabled when invalid

**Generation Process**

- [ ] Generate button submits form
- [ ] Checks credits before generation
- [ ] Shows insufficient credits error if needed
- [ ] Loading state shows during generation
- [ ] Status updates in real-time (if WebSocket enabled)
- [ ] Polls status every 2 seconds (if WebSocket disabled)
- [ ] Progress bar updates
- [ ] Generation completes successfully
- [ ] Generated image displays
- [ ] Image loads correctly
- [ ] Download button works
- [ ] Usage stats update after generation

**Error Handling**

- [ ] Content safety violations show error
- [ ] API errors display user-friendly message
- [ ] Network errors show retry option
- [ ] Timeout errors handled gracefully
- [ ] Can cancel running generation

**Settings**

- [ ] Model selection works
- [ ] Width/height dropdowns work
- [ ] Guidance scale slider updates
- [ ] Settings persist during session
- [ ] Different models have different costs
- [ ] Cost shown before generation

### ✅ Image Generation (Image-to-Image)

**Image Upload**

- [ ] Can select image file
- [ ] File size validation (max 10MB)
- [ ] File type validation (PNG, JPG, WEBP)
- [ ] Image preview shows
- [ ] Can remove uploaded image
- [ ] Upload progress indicator
- [ ] Upload completes successfully
- [ ] Error for oversized files
- [ ] Error for invalid file types

**Generation Process**

- [ ] Form submits with image and prompt
- [ ] Same validation as text-to-image
- [ ] Generation starts successfully
- [ ] Status updates work
- [ ] Result image displays
- [ ] Download works

### ✅ Generation History

**Gallery Display**

- [ ] Recent generations show in gallery
- [ ] Images load correctly
- [ ] Pagination works
- [ ] Can filter by status
- [ ] Can filter by model
- [ ] Can sort by date
- [ ] Infinite scroll or "Load More" works

**Generation Actions**

- [ ] Can click image to view full size
- [ ] Can download individual images
- [ ] Can delete generations
- [ ] Delete confirmation dialog shows
- [ ] Deleted items removed from gallery
- [ ] Can view generation details
- [ ] Prompt and settings shown

### ✅ Dashboard

**Statistics Display**

- [ ] Total generations count correct
- [ ] Credits used/remaining accurate
- [ ] Usage chart displays
- [ ] Recent activity shows
- [ ] Model usage breakdown shows

**Quick Actions**

- [ ] "New Generation" button works
- [ ] "View History" button works
- [ ] "Manage Subscription" button works

### ✅ Responsive Design

**Mobile (< 640px)**

- [ ] Navigation menu works
- [ ] Form layouts adapt
- [ ] Images display correctly
- [ ] Buttons are tap-friendly
- [ ] Text is readable

**Tablet (640px - 1024px)**

- [ ] Grid layouts adjust
- [ ] Sidebar navigation works
- [ ] Images scale appropriately

**Desktop (> 1024px)**

- [ ] Full layout displays
- [ ] Multi-column grids work
- [ ] Hover states work

### ✅ Browser Compatibility

- [ ] Chrome/Edge (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Mobile Safari (iOS)
- [ ] Chrome Mobile (Android)

### ✅ Performance

- [ ] Initial page load < 3 seconds
- [ ] Time to interactive < 5 seconds
- [ ] Images lazy load
- [ ] API responses < 2 seconds
- [ ] No memory leaks
- [ ] Smooth animations
- [ ] No layout shifts

### ✅ Accessibility

- [ ] All images have alt text
- [ ] Forms have proper labels
- [ ] Keyboard navigation works
- [ ] Screen reader compatible
- [ ] Color contrast meets WCAG AA
- [ ] Focus indicators visible

## Unit Testing

### Setup

```bash
npm install --save-dev jest @testing-library/react @testing-library/jest-dom
npm install --save-dev @testing-library/user-event
```

### Example Tests

**API Client Tests** (`lib/__tests__/api-client.test.ts`):

```typescript
import { render, screen, waitFor } from '@testing-library/react';
import apiClient from '@/lib/api-client';
import { TokenManager } from '@/lib/api-client';

jest.mock('@/lib/api-client');

describe('API Client', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('includes auth token in requests', async () => {
    TokenManager.setToken('test-token');

    const mockGet = jest.spyOn(apiClient, 'getCurrentUser');
    mockGet.mockResolvedValue({ id: '1', email: 'test@example.com' });

    await apiClient.getCurrentUser();

    expect(mockGet).toHaveBeenCalled();
  });

  it('handles 401 errors', async () => {
    const mockError = { detail: 'Unauthorized', status_code: 401 };
    jest.spyOn(apiClient, 'getCurrentUser').mockRejectedValue(mockError);

    await expect(apiClient.getCurrentUser()).rejects.toEqual(mockError);
  });
});
```

**Auth Hook Tests** (`lib/auth/__tests__/auth-context.test.tsx`):

```typescript
import { renderHook, act } from '@testing-library/react';
import { AuthProvider, useAuth } from '@/lib/auth/auth-context';

describe('useAuth Hook', () => {
  it('provides auth state', () => {
    const wrapper = ({ children }) => <AuthProvider>{children}</AuthProvider>;

    const { result } = renderHook(() => useAuth(), { wrapper });

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.isLoading).toBe(true);
  });

  it('handles login', async () => {
    const wrapper = ({ children }) => <AuthProvider>{children}</AuthProvider>;

    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      await result.current.login();
    });

    // Assert login was called
  });
});
```

**Component Tests** (`components/__tests__/PricingCard.test.tsx`):

```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import PricingCard from '@/components/PricingCard';

describe('PricingCard', () => {
  it('renders tier information', () => {
    const tier = {
      name: 'Basic',
      price: 9.99,
      features: ['200 credits/month'],
    };

    render(<PricingCard tier={tier} onSubscribe={jest.fn()} />);

    expect(screen.getByText('Basic')).toBeInTheDocument();
    expect(screen.getByText('$9.99')).toBeInTheDocument();
    expect(screen.getByText('200 credits/month')).toBeInTheDocument();
  });

  it('calls onSubscribe when clicked', () => {
    const onSubscribe = jest.fn();
    const tier = { name: 'Basic', price: 9.99, features: [] };

    render(<PricingCard tier={tier} onSubscribe={onSubscribe} />);

    fireEvent.click(screen.getByText('Subscribe'));
    expect(onSubscribe).toHaveBeenCalled();
  });
});
```

## Integration Testing

### Setup Playwright

```bash
npm install --save-dev @playwright/test
npx playwright install
```

### Configuration (`playwright.config.ts`):

```typescript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  use: {
    baseURL: 'http://localhost:3000',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'firefox', use: { browserName: 'firefox' } },
    { name: 'webkit', use: { browserName: 'webkit' } },
  ],
});
```

### Example E2E Tests (`tests/e2e/generation.spec.ts`):

```typescript
import { test, expect } from '@playwright/test';

test.describe('Image Generation Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Login
    await page.goto('/login');
    await page.fill('[name="email"]', process.env.TEST_EMAIL!);
    await page.fill('[name="password"]', process.env.TEST_PASSWORD!);
    await page.click('button[type="submit"]');
    await page.waitForURL('/dashboard');
  });

  test('should generate image successfully', async ({ page }) => {
    // Navigate to generate page
    await page.goto('/generate');

    // Fill form
    await page.fill('[name="prompt"]', 'A beautiful sunset over mountains');
    await page.selectOption('[name="model"]', 'flux-schnell');

    // Submit
    await page.click('button:has-text("Generate Image")');

    // Wait for completion (with timeout)
    await page.waitForSelector('img[alt*="sunset"]', { timeout: 60000 });

    // Verify image
    const image = await page.locator('img[alt*="sunset"]');
    await expect(image).toBeVisible();

    // Verify download button
    const downloadBtn = await page.locator('a:has-text("Download")');
    await expect(downloadBtn).toBeVisible();
  });

  test('should show error for insufficient credits', async ({ page }) => {
    // Mock API to return insufficient credits error
    await page.route('**/api/v1/generate/text-to-image', (route) => {
      route.fulfill({
        status: 402,
        body: JSON.stringify({
          detail: 'Insufficient credits',
        }),
      });
    });

    await page.goto('/generate');
    await page.fill('[name="prompt"]', 'Test prompt');
    await page.click('button:has-text("Generate Image")');

    // Verify error message
    await expect(page.locator('text=Insufficient credits')).toBeVisible();
  });
});
```

## Performance Testing

### Lighthouse CI

```bash
npm install --save-dev @lhci/cli

# Run Lighthouse
npx lhci autorun
```

### Load Testing with k6

```javascript
// load-test.js
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '2m', target: 100 }, // Ramp up
    { duration: '5m', target: 100 }, // Stay at 100 users
    { duration: '2m', target: 0 },   // Ramp down
  ],
};

export default function () {
  const res = http.get('https://your-api.com/api/v1/health');

  check(res, {
    'status is 200': (r) => r.status === 200,
    'response time < 500ms': (r) => r.timings.duration < 500,
  });

  sleep(1);
}
```

Run: `k6 run load-test.js`

## Security Testing

### Checklist

- [ ] HTTPS enforced in production
- [ ] CORS configured correctly
- [ ] JWT tokens have expiration
- [ ] Tokens stored securely (httpOnly cookies or localStorage)
- [ ] API rate limiting works
- [ ] Input sanitization prevents XSS
- [ ] SQL injection protection (parameterized queries)
- [ ] CSRF protection enabled
- [ ] Secrets not exposed in frontend
- [ ] Content Security Policy headers set
- [ ] Dependencies have no known vulnerabilities

### Security Scan

```bash
# Check for vulnerabilities
npm audit

# Fix automatically
npm audit fix

# Check with Snyk
npx snyk test
```

## Running Tests

```bash
# Unit tests
npm test

# With coverage
npm test -- --coverage

# E2E tests
npm run test:e2e

# Specific test file
npm test api-client.test.ts

# Watch mode
npm test -- --watch
```

## Continuous Integration

### GitHub Actions (`.github/workflows/test.yml`):

```yaml
name: Test

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm ci

      - name: Run unit tests
        run: npm test -- --coverage

      - name: Run E2E tests
        run: npm run test:e2e

      - name: Upload coverage
        uses: codecov/codecov-action@v3
```

## Test Data

### Test Users

```
Email: test-free@example.com
Password: TestPass123!
Tier: Free (10 credits)

Email: test-basic@example.com
Password: TestPass123!
Tier: Basic (200 credits)

Email: test-premium@example.com
Password: TestPass123!
Tier: Premium (unlimited)
```

### Test Cards (Stripe)

```
Success: 4242 4242 4242 4242
Decline: 4000 0000 0000 0002
Requires Auth: 4000 0025 0000 3155
```

## Troubleshooting

**Tests timing out**
- Increase timeout in test configuration
- Check if backend is running
- Verify network connectivity

**Authentication tests failing**
- Check Azure AD B2C configuration
- Verify test credentials are correct
- Ensure redirect URIs match

**API tests failing**
- Verify API_URL in environment variables
- Check backend is running and accessible
- Review API response errors

**E2E tests flaky**
- Add explicit waits
- Use `waitForSelector` instead of `sleep`
- Check for race conditions
