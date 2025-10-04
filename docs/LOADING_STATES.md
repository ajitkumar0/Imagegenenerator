# Loading States Guide

## Complete Loading States Implementation

Professional loading indicators, skeleton screens, progress bars, and optimistic UI updates for better user experience.

---

## Table of Contents

1. [Skeleton Loaders](#skeleton-loaders)
2. [Progress Indicators](#progress-indicators)
3. [Spinners](#spinners)
4. [Button Loading States](#button-loading-states)
5. [Optimistic UI](#optimistic-ui)
6. [Best Practices](#best-practices)

---

## Skeleton Loaders

**Purpose**: Show placeholder content while data loads (mimics actual layout)

**File**: [frontend/components/loading/Skeleton.tsx](../frontend/components/loading/Skeleton.tsx)

### Basic Skeleton

```typescript
import { Skeleton } from '@/components/loading/Skeleton';

// Text line
<Skeleton width="100%" height={16} />

// Circular (avatar)
<Skeleton variant="circular" width={40} height={40} />

// Rectangular (image)
<Skeleton variant="rectangular" height={200} />

// Rounded (button)
<Skeleton variant="rounded" width={100} height={36} />
```

### Multi-Line Text

```typescript
import { SkeletonText } from '@/components/loading/Skeleton';

<SkeletonText
  lines={3}
  lastLineWidth="70%"
/>
```

### Card Skeleton

```typescript
import { SkeletonCard } from '@/components/loading/Skeleton';

<SkeletonCard
  showImage={true}
  imageHeight={200}
  showActions={true}
/>
```

### List Item Skeleton

```typescript
import { SkeletonListItem } from '@/components/loading/Skeleton';

<SkeletonListItem
  showAvatar={true}
  avatarSize={40}
/>
```

### Custom Skeletons (App-Specific)

```typescript
import {
  SkeletonGenerationCard,
  SkeletonSubscriptionCard,
} from '@/components/loading/Skeleton';

// Generation gallery loading
<div className="grid grid-cols-3 gap-4">
  {Array.from({ length: 6 }).map((_, i) => (
    <SkeletonGenerationCard key={i} />
  ))}
</div>

// Subscription page loading
<SkeletonSubscriptionCard />
```

### Grid Skeleton

```typescript
import { SkeletonGrid } from '@/components/loading/Skeleton';

<SkeletonGrid
  items={6}
  columns={3}
  gap={6}
  renderItem={() => <SkeletonGenerationCard />}
/>
```

### Full Page Skeleton

```typescript
import { SkeletonPage } from '@/components/loading/Skeleton';

<SkeletonPage />
```

---

## Progress Indicators

**Purpose**: Show determinate progress (0-100%) for long operations

**File**: [frontend/components/loading/Progress.tsx](../frontend/components/loading/Progress.tsx)

### Linear Progress Bar

```typescript
import { ProgressBar } from '@/components/loading/Progress';

<ProgressBar
  value={75}
  showLabel={true}
  color="blue"
  size="md"
/>

// Indeterminate (unknown duration)
<ProgressBar
  value={0}
  indeterminate={true}
/>
```

### Circular Progress

```typescript
import { CircularProgress } from '@/components/loading/Progress';

<CircularProgress
  value={75}
  size={80}
  strokeWidth={8}
  showLabel={true}
  color="blue"
/>

// Indeterminate spinner
<CircularProgress
  value={0}
  indeterminate={true}
/>
```

### Step Progress

```typescript
import { StepProgress } from '@/components/loading/Progress';

<StepProgress
  steps={[
    { label: 'Upload', description: 'Upload your image' },
    { label: 'Process', description: 'AI processing' },
    { label: 'Complete', description: 'Download result' },
  ]}
  currentStep={1}
/>
```

### Generation Progress (App-Specific)

```typescript
import { GenerationProgress } from '@/components/loading/Progress';

<GenerationProgress
  status="processing"
  progress={65}
  message="Generating your image..."
/>
```

### Upload Progress

```typescript
import { UploadProgress } from '@/components/loading/Progress';

<UploadProgress
  filename="image.jpg"
  progress={80}
  status="uploading"
  onCancel={() => cancelUpload()}
/>
```

---

## Spinners

**Purpose**: Indicate loading for API calls and async operations

**File**: [frontend/components/loading/Spinner.tsx](../frontend/components/loading/Spinner.tsx)

### Basic Spinner

```typescript
import { Spinner } from '@/components/loading/Spinner';

<Spinner size="md" color="blue" />
```

### Spinner with Label

```typescript
import { SpinnerWithLabel } from '@/components/loading/Spinner';

<SpinnerWithLabel
  label="Loading..."
  size="lg"
/>
```

### Overlay Spinner (Full Screen)

```typescript
import { OverlaySpinner } from '@/components/loading/Spinner';

<OverlaySpinner
  show={isLoading}
  message="Processing your request..."
/>
```

### Page Spinner (Centered)

```typescript
import { PageSpinner } from '@/components/loading/Spinner';

<PageSpinner message="Loading data..." />
```

### Dots Spinner

```typescript
import { DotsSpinner } from '@/components/loading/Spinner';

<DotsSpinner color="blue" size="md" />
```

### Inline Loading

```typescript
import { InlineLoading } from '@/components/loading/Spinner';

<div className="flex items-center">
  <InlineLoading message="Saving..." />
</div>
```

---

## Button Loading States

**Purpose**: Show loading state on buttons during async operations

### Loading Button

```typescript
import { LoadingButton } from '@/components/loading/Spinner';

<LoadingButton
  loading={isGenerating}
  onClick={handleGenerate}
  variant="primary"
  size="md"
  fullWidth={false}
  loadingText="Generating..."
>
  Generate Image
</LoadingButton>
```

**Variants**:
- `primary` - Blue background (main actions)
- `secondary` - Gray background (secondary actions)
- `danger` - Red background (destructive actions)
- `ghost` - Transparent (subtle actions)

**Sizes**:
- `sm` - Small (px-3 py-1.5)
- `md` - Medium (px-4 py-2)
- `lg` - Large (px-6 py-3)

### Loading Icon Button

```typescript
import { LoadingIconButton } from '@/components/loading/Spinner';

<LoadingIconButton
  loading={isSaving}
  onClick={handleSave}
  icon={<SaveIcon />}
  variant="ghost"
  size="md"
  ariaLabel="Save"
/>
```

### Examples

```typescript
// Submit form button
<LoadingButton
  loading={isSubmitting}
  type="submit"
  variant="primary"
  fullWidth
  loadingText="Submitting..."
>
  Submit
</LoadingButton>

// Delete button
<LoadingButton
  loading={isDeleting}
  onClick={handleDelete}
  variant="danger"
  loadingText="Deleting..."
>
  Delete
</LoadingButton>

// Retry button
<LoadingButton
  loading={isRetrying}
  onClick={handleRetry}
  variant="secondary"
>
  Try Again
</LoadingButton>
```

---

## Optimistic UI

**Purpose**: Immediately update UI while API request is in progress

**File**: [frontend/lib/optimistic-updates.ts](../frontend/lib/optimistic-updates.ts)

### Simple Optimistic Update

```typescript
import { useOptimistic } from '@/lib/optimistic-updates';

function LikeButton({ postId, initialLikes }: Props) {
  const { value: likes, execute: toggleLike, isLoading } = useOptimistic(
    initialLikes,
    async (newLikes: number) => {
      const response = await apiClient.updateLikes(postId, newLikes);
      return response.likes;
    },
    {
      onSuccess: () => showSuccessToast('Liked!'),
      onError: () => showErrorToast('Failed to like'),
    }
  );

  return (
    <button
      onClick={() => toggleLike(likes + 1)}
      disabled={isLoading}
    >
      ❤️ {likes}
    </button>
  );
}
```

### Optimistic List Operations

```typescript
import { OptimisticList, generateTemporaryId } from '@/lib/optimistic-updates';

function TodoList() {
  const [list] = useState(() => new OptimisticList(initialTodos));

  const addTodo = async (text: string) => {
    // Generate temporary ID
    const tempId = generateTemporaryId();
    const newTodo = { id: tempId, text, completed: false };

    // Optimistically add to UI
    list.optimisticAdd(newTodo);
    forceUpdate(); // Trigger re-render

    try {
      // Save to API
      const savedTodo = await apiClient.createTodo({ text });

      // Replace temp ID with real ID
      list.confirmAdd(tempId, savedTodo);
      forceUpdate();
    } catch (error) {
      // Rollback on error
      list.rollbackAdd(tempId);
      forceUpdate();
      showErrorToast(error);
    }
  };

  const updateTodo = async (id: string, updates: Partial<Todo>) => {
    // Optimistically update UI
    list.optimisticUpdate(id, updates);
    forceUpdate();

    try {
      // Save to API
      const updatedTodo = await apiClient.updateTodo(id, updates);
      list.confirmUpdate(id, updatedTodo);
    } catch (error) {
      // Rollback on error
      list.rollbackUpdate(id);
      forceUpdate();
      showErrorToast(error);
    }
  };

  const deleteTodo = async (id: string) => {
    // Optimistically remove from UI
    list.optimisticDelete(id);
    forceUpdate();

    try {
      // Delete from API
      await apiClient.deleteTodo(id);
      list.confirmDelete(id);
    } catch (error) {
      // Rollback on error
      list.rollbackDelete(id);
      forceUpdate();
      showErrorToast(error);
    }
  };

  return (
    <ul>
      {list.getItems().map((todo) => (
        <li
          key={todo.id}
          className={list.isPending(todo.id) ? 'opacity-50' : ''}
        >
          {todo.text}
          <button onClick={() => updateTodo(todo.id, { completed: !todo.completed })}>
            {todo.completed ? 'Undo' : 'Complete'}
          </button>
          <button onClick={() => deleteTodo(todo.id)}>Delete</button>
        </li>
      ))}
    </ul>
  );
}
```

### Debounced Optimistic Updates (Auto-Save)

```typescript
import { useDebouncedOptimistic } from '@/lib/optimistic-updates';

function AutoSaveEditor({ initialContent, documentId }: Props) {
  const { value: content, isLoading, updateValue } = useDebouncedOptimistic(
    initialContent,
    async (newContent: string) => {
      const response = await apiClient.saveDocument(documentId, newContent);
      return response.content;
    },
    1000 // Save after 1 second of no typing
  );

  return (
    <>
      <textarea
        value={content}
        onChange={(e) => updateValue(e.target.value)}
        className="w-full h-64 p-4"
      />
      {isLoading && (
        <div className="text-sm text-gray-500">
          <DotsSpinner size="sm" /> Saving...
        </div>
      )}
    </>
  );
}
```

---

## Best Practices

### 1. Choose the Right Loading Indicator

| Scenario | Component | Reason |
|----------|-----------|--------|
| Data fetching | Skeleton | Shows layout structure |
| Button click | LoadingButton | Prevents double-clicks |
| File upload | UploadProgress | Shows upload progress |
| Image generation | GenerationProgress | Shows progress % |
| API call | Spinner | Simple indication |
| Form submit | LoadingButton | Disable while processing |
| Optimistic update | None visible | Instant feedback |
| Page transition | PageSpinner | Full page loading |

### 2. Skeleton vs Spinner

**Use Skeleton When**:
- Loading initial page content
- User expects structured data (list, card, table)
- Content takes >500ms to load
- Want to show layout structure

**Use Spinner When**:
- Loading unpredictable content
- Short operations (<500ms)
- Button or inline loading
- User triggered action

### 3. Loading State Patterns

#### Pattern 1: Data Fetching

```typescript
function SubscriptionPage() {
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadSubscription();
  }, []);

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

  if (loading) {
    return <SkeletonSubscriptionCard />;
  }

  if (error) {
    return <ErrorDisplay error={error} onRetry={loadSubscription} />;
  }

  return <SubscriptionDetails data={subscription} />;
}
```

#### Pattern 2: Button Action

```typescript
function GenerateButton() {
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      await apiClient.createGeneration({ prompt });
    } catch (error) {
      showErrorToast(error);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <LoadingButton
      loading={isGenerating}
      onClick={handleGenerate}
      variant="primary"
      loadingText="Generating..."
    >
      Generate Image
    </LoadingButton>
  );
}
```

#### Pattern 3: Progress Tracking

```typescript
function ImageGenerator() {
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<'pending' | 'processing' | 'completed'>('pending');

  const { status: wsStatus, progress: wsProgress } = useGenerationUpdates({
    generationId,
    enabled: status === 'processing',
    onUpdate: (update) => {
      setProgress(update.progress);
      setStatus(update.status);
    },
  });

  return (
    <GenerationProgress
      status={status}
      progress={progress}
      message={`Generating... ${Math.round(progress)}%`}
    />
  );
}
```

#### Pattern 4: Optimistic UI

```typescript
function CreditBalance({ initialBalance }: Props) {
  const { value: balance, execute: deductCredits } = useOptimistic(
    initialBalance,
    async (newBalance: number) => {
      const response = await apiClient.updateCredits(newBalance);
      return response.balance;
    },
    {
      rollbackDelay: 2000, // Show rollback for 2s
    }
  );

  const handleGenerate = async () => {
    // Immediately show new balance
    await deductCredits(balance - 1);

    // Start generation
    await apiClient.createGeneration({ prompt });
  };

  return (
    <div>
      <p>Credits: {balance}</p>
      <LoadingButton onClick={handleGenerate}>Generate</LoadingButton>
    </div>
  );
}
```

### 4. Accessibility

```typescript
// Add ARIA labels
<Spinner role="status" aria-label="Loading" />

// Add screen reader text
<button disabled={loading}>
  {loading && <Spinner />}
  <span className={loading ? 'sr-only' : ''}>Submit</span>
</button>

// Announce status changes
{loading && (
  <div role="status" aria-live="polite">
    Loading content...
  </div>
)}
```

### 5. Performance

```typescript
// Debounce rapid updates
const debouncedLoad = useDebounce(loadData, 300);

// Show skeleton only after delay (avoid flash)
const [showSkeleton, setShowSkeleton] = useState(false);
useEffect(() => {
  const timer = setTimeout(() => setShowSkeleton(true), 200);
  return () => clearTimeout(timer);
}, []);

if (loading && showSkeleton) {
  return <Skeleton />;
}
```

### 6. Error Recovery

```typescript
<LoadingButton
  loading={isRetrying}
  onClick={handleRetry}
  variant="secondary"
>
  {error ? 'Try Again' : 'Submit'}
</LoadingButton>
```

---

## Animation Best Practices

### Skeleton Animation
- Use `pulse` for most cases (subtle)
- Use `wave` for premium feel (shimmer effect)
- Use `none` for static placeholders

### Spinner Speed
- Default: 1s per rotation
- Fast: 0.5s (urgent actions)
- Slow: 2s (background tasks)

### Progress Transitions
- Use `transition-all duration-300` for smooth updates
- Avoid jank with `will-change: transform`

---

## Testing

### Unit Tests

```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

test('shows loading state during submission', async () => {
  render(<SubmitForm />);

  const button = screen.getByRole('button', { name: /submit/i });
  fireEvent.click(button);

  // Should show loading state
  expect(button).toBeDisabled();
  expect(screen.getByRole('status')).toBeInTheDocument();

  // Should hide loading state after completion
  await waitFor(() => {
    expect(button).not.toBeDisabled();
  });
});

test('shows skeleton while loading data', () => {
  render(<DataList loading={true} />);

  // Should show skeleton
  expect(screen.getAllByRole('presentation')).toHaveLength(5);
});
```

---

## Conclusion

Professional loading states improve user experience by:

✅ **Reducing Perceived Wait Time**: Skeletons show content structure
✅ **Providing Feedback**: Progress bars show actual progress
✅ **Preventing Errors**: Disabled buttons prevent double-submission
✅ **Building Trust**: Smooth transitions feel professional
✅ **Optimistic Updates**: Instant feedback improves responsiveness

**Result**: Users feel the app is fast and responsive even when operations take time!
