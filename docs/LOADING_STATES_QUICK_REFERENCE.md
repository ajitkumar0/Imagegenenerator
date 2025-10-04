# Loading States Quick Reference

## Quick Component Guide

### Skeletons (Data Fetching)

```typescript
import { Skeleton, SkeletonCard, SkeletonGrid } from '@/components/loading/Skeleton';

// Single line
<Skeleton width="100%" height={16} />

// Card
<SkeletonCard showImage imageHeight={200} />

// Grid of cards
<SkeletonGrid items={6} columns={3} renderItem={() => <SkeletonCard />} />
```

### Progress (0-100%)

```typescript
import { ProgressBar, CircularProgress, GenerationProgress } from '@/components/loading/Progress';

// Linear bar
<ProgressBar value={75} showLabel color="blue" />

// Circular
<CircularProgress value={75} size={80} showLabel />

// Generation status
<GenerationProgress status="processing" progress={65} />
```

### Spinners (API Calls)

```typescript
import { Spinner, PageSpinner, InlineLoading } from '@/components/loading/Spinner';

// Basic spinner
<Spinner size="md" color="blue" />

// Full page
<PageSpinner message="Loading..." />

// Inline text
<InlineLoading message="Saving..." />
```

### Buttons (Form Actions)

```typescript
import { LoadingButton } from '@/components/loading/Spinner';

<LoadingButton
  loading={isLoading}
  onClick={handleSubmit}
  variant="primary"
  loadingText="Submitting..."
>
  Submit
</LoadingButton>
```

### Optimistic UI (Instant Feedback)

```typescript
import { useOptimistic } from '@/lib/optimistic-updates';

const { value, execute } = useOptimistic(
  initialValue,
  async (newValue) => await api.update(newValue)
);

<button onClick={() => execute(newValue)}>Update</button>
```

---

## When to Use What?

| Scenario | Component | Example |
|----------|-----------|---------|
| Loading page data | `SkeletonPage` | Gallery loading |
| Loading list | `SkeletonGrid` | Generation list |
| Loading card | `SkeletonCard` | Subscription card |
| Image generation | `GenerationProgress` | 0-100% progress |
| File upload | `UploadProgress` | Upload status |
| Button click | `LoadingButton` | Submit form |
| API call | `Spinner` | Fetch data |
| Like/favorite | Optimistic UI | Instant toggle |
| Auto-save | Debounced optimistic | Save after typing |

---

## Common Patterns

### Pattern 1: Data Loading
```typescript
const [loading, setLoading] = useState(true);

if (loading) return <SkeletonGrid items={6} columns={3} />;
return <DataGrid data={data} />;
```

### Pattern 2: Button Action
```typescript
<LoadingButton
  loading={isSubmitting}
  onClick={handleSubmit}
>
  Submit
</LoadingButton>
```

### Pattern 3: Progress Tracking
```typescript
<ProgressBar
  value={uploadProgress}
  showLabel
  color="blue"
/>
```

### Pattern 4: Optimistic Update
```typescript
const { value, execute } = useOptimistic(likes, updateLikes);

<button onClick={() => execute(likes + 1)}>
  ❤️ {value}
</button>
```

---

## Complete Documentation

See [LOADING_STATES.md](./LOADING_STATES.md) for detailed guide
