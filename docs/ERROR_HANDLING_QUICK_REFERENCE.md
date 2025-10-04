# Error Handling Quick Reference

## Quick Error Codes

| Code | Type | Message | Action |
|------|------|---------|--------|
| 401 | Auth | "Session expired" | → Redirect to login |
| 403 | Forbidden | "Upgrade required" | → Show upgrade prompt |
| 402 | Payment | "Insufficient credits" | → Redirect to pricing |
| 429 | Rate Limit | "Too many requests" | → Auto-retry with backoff |
| 422 | Validation | "Invalid input" | → Show inline error |
| 404 | Not Found | "Resource not found" | → Show helpful message |
| 500+ | Server | "Something went wrong" | → Auto-retry |
| 0 | Network | "Connection failed" | → Show offline message |

---

## Components

### ErrorBoundary (Fatal Errors)
```typescript
import { ErrorBoundary } from '@/components/errors/ErrorBoundary';

<ErrorBoundary>
  <App />
</ErrorBoundary>
```

### ErrorToast (Notifications)
```typescript
import { showErrorToast } from '@/components/errors/ErrorToast';

catch (error) {
  showErrorToast(error);
}
```

### ErrorDisplay (Inline Errors)
```typescript
import { ErrorDisplay } from '@/components/errors/ErrorDisplay';

<ErrorDisplay
  error={error}
  onRetry={handleRetry}
  onDismiss={() => setError(null)}
/>
```

### CompactError (Form Errors)
```typescript
import { CompactError } from '@/components/errors/ErrorDisplay';

<CompactError error={validationError} />
```

---

## Common Patterns

### Pattern 1: API Call with Error Handling
```typescript
const [error, setError] = useState(null);
const [loading, setLoading] = useState(false);

const handleSubmit = async () => {
  setLoading(true);
  setError(null);

  try {
    await apiClient.createGeneration({ prompt });
  } catch (err) {
    setError(err);
  } finally {
    setLoading(false);
  }
};

return (
  <>
    {error && <ErrorDisplay error={error} onRetry={handleSubmit} />}
    <button onClick={handleSubmit} disabled={loading}>
      Submit
    </button>
  </>
);
```

### Pattern 2: Loading with Error Fallback
```typescript
import { LoadingStateWithError } from '@/components/errors/ErrorDisplay';

<LoadingStateWithError
  loading={isLoading}
  error={error}
  onRetry={loadData}
>
  <Content />
</LoadingStateWithError>
```

### Pattern 3: Form Validation
```typescript
const [errors, setErrors] = useState({});

const validate = () => {
  const newErrors = {};
  if (!prompt) newErrors.prompt = 'Required';
  if (prompt.length < 3) newErrors.prompt = 'Too short';
  return newErrors;
};

<input className={errors.prompt ? 'border-red-500' : ''} />
{errors.prompt && <CompactError error={{ detail: errors.prompt }} />}
```

---

## Error Utilities

### Classify Error
```typescript
import { classifyError } from '@/lib/errors';

const errorInfo = classifyError(error);
// Returns: { type, severity, title, message, action, retry }
```

### Retry Operation
```typescript
import { retryOperation } from '@/lib/errors';

const data = await retryOperation(
  () => apiClient.getData(),
  { maxAttempts: 3, delay: 1000, backoff: true }
);
```

### Log Error
```typescript
import { logError } from '@/lib/errors';

catch (error) {
  logError(error, { context: 'generation', userId: user.id });
}
```

---

## Testing

### Mock API Error
```typescript
jest.spyOn(apiClient, 'createGeneration').mockRejectedValue({
  status_code: 402,
  detail: 'Insufficient credits',
});
```

### Test Error Display
```typescript
render(<ErrorDisplay error={{ status_code: 401 }} />);
expect(screen.getByText('Authentication Required')).toBeInTheDocument();
expect(screen.getByText('Sign In')).toBeInTheDocument();
```

---

## Troubleshooting

### Error not showing?
1. Check error is not null/undefined
2. Verify ErrorToastContainer is in layout
3. Check console for errors

### Auto-retry not working?
1. Check error is retriable (not 401, 422, 404)
2. Verify API client interceptors are set up
3. Check max retry attempts not exceeded

### Error boundary not catching?
1. Only catches errors in child components
2. Doesn't catch: async errors, event handler errors
3. Use try-catch for those cases

---

## Full Documentation

See [ERROR_HANDLING.md](./ERROR_HANDLING.md) for complete guide
