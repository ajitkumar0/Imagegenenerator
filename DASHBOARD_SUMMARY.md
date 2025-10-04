# Dashboard Page Documentation

## Overview
Comprehensive user dashboard for ImageGen AI showing usage statistics, generation history, activity charts, and quick action shortcuts.

## Page Structure

### Layout Hierarchy
```
Dashboard Page
├── Header (navigation)
├── Welcome Section
├── Stats Cards (3 columns)
├── Usage Chart
├── Quick Actions (4 buttons)
└── Recent Generations (3 column grid)
```

## Components Created

### 1. StatsCard (components/StatsCard.tsx)
**Purpose:** Display key metrics with gradient icons and optional trend indicators

**Props:**
```typescript
interface StatsCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  subtitle?: string;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  gradientFrom?: string;
  gradientTo?: string;
}
```

**Features:**
- Gradient background icon (12x12, rounded)
- Large value display (3xl font, bold)
- Trend indicator with up/down arrows
- Green for positive trends, red for negative
- Subtitle text for context
- Hover shadow effect
- White background with border

**Example Usage:**
```typescript
<StatsCard
  title="Generations Used"
  value="45/200"
  icon={<Sparkles className="w-6 h-6" />}
  subtitle="155 remaining this month"
  trend={{ value: 12, isPositive: true }}
  gradientFrom="#FF6B9D"
  gradientTo="#A855F7"
/>
```

**Loading Skeleton:**
- `StatsCardSkeleton` component included
- Animated pulse effect
- Gray placeholder blocks

**File Location:** `/components/StatsCard.tsx`

---

### 2. UsageChart (components/UsageChart.tsx)
**Purpose:** Line chart visualization of generation activity over time using recharts

**Props:**
```typescript
interface UsageDataPoint {
  date: string;
  generations: number;
}

interface UsageChartProps {
  data: UsageDataPoint[];
}
```

**Features:**
- Responsive container (100% width, 300px height)
- Gradient line stroke (pink to purple)
- Gradient fill under line (opacity fade)
- Dotted grid lines
- Interactive tooltip on hover
- Styled axes with gray text
- Active dot highlighting
- 7-day data display

**Chart Styling:**
- Line stroke width: 3px
- Dot size: 4px (normal), 6px (active)
- Gradient colors: #FF6B9D to #A855F7
- Tooltip: white background, rounded, shadow

**Data Format:**
```javascript
const usageData = [
  { date: 'Mon', generations: 5 },
  { date: 'Tue', generations: 8 },
  { date: 'Wed', generations: 12 },
  // ...
];
```

**Dependencies:**
- recharts library (v2.12.0)
- Components used:
  - LineChart
  - Line
  - XAxis, YAxis
  - CartesianGrid
  - Tooltip
  - ResponsiveContainer

**Loading Skeleton:**
- `UsageChartSkeleton` component included
- 300px height placeholder

**File Location:** `/components/UsageChart.tsx`

---

### 3. RecentGenerations (components/RecentGenerations.tsx)
**Purpose:** Grid display of recent AI-generated images with action buttons

**Props:**
```typescript
interface Generation {
  id: string;
  imageUrl: string;
  prompt: string;
  createdAt: string;
  type: 'text-to-image' | 'image-to-image';
}

interface RecentGenerationsProps {
  generations: Generation[];
  onView?: (id: string) => void;
  onDownload?: (id: string) => void;
  onDelete?: (id: string) => void;
}
```

**Features:**

#### Grid Layout
- 1 column on mobile
- 2 columns on tablet (md)
- 3 columns on desktop (lg)
- Responsive gap spacing
- Auto-fit content

#### Generation Card
- Square aspect ratio images
- Type badge (Text/Image) in top right
- Hover overlay with actions
- Truncated prompt text
- Creation timestamp
- Gray background

#### Action Buttons (on hover)
1. **View** - Eye icon, opens detail view
2. **Download** - Download icon, saves image
3. **Delete** - Trash icon (red), removes image

**Overlay Effect:**
- Semi-transparent black (50% opacity)
- Smooth transition (300ms)
- Centered action buttons
- White circular backgrounds

#### Empty State
- Shows when `generations.length === 0`
- Large gradient icon
- Heading: "No generations yet"
- Description text
- Two CTA buttons:
  - Create Text to Image (gradient)
  - Transform Image (outlined)

**Next/Image Integration:**
- Optimized image loading
- Fill layout for aspect ratio
- Object-cover for cropping
- Alt text from prompt

**Loading Skeleton:**
- `RecentGenerationsSkeleton` component
- 3 placeholder cards
- Animated pulse effect

**File Location:** `/components/RecentGenerations.tsx`

---

### 4. QuickActions (components/QuickActions.tsx)
**Purpose:** Quick access buttons for common tasks

**Features:**

#### 4 Action Cards:
1. **Create Text to Image**
   - Icon: Wand2
   - Link: /generate/text-to-image
   - Gradient: Pink to Purple

2. **Transform Image**
   - Icon: ImageIcon
   - Link: /generate/image-to-image
   - Gradient: Purple to Indigo

3. **Account Settings**
   - Icon: Settings
   - Link: /settings
   - Gradient: Indigo to Violet

4. **Upgrade Plan**
   - Icon: CreditCard
   - Link: /pricing
   - Gradient: Violet to Pink

#### Card Styling
- Grid layout: 1/2/4 columns (mobile/tablet/desktop)
- Border: 2px gradient on hover
- Gradient icon background (12x12, rounded)
- Icon scales on hover (110%)
- Title text gets gradient on hover
- Description in gray
- Smooth transitions (300ms)

**CSS Technique:**
- Gradient border using background-clip
- Double background layers
- Padding-box and border-box clipping

**Loading Skeleton:**
- `QuickActionsSkeleton` component
- 4 placeholder cards

**File Location:** `/components/QuickActions.tsx`

---

### 5. Dashboard Page (app/dashboard/page.tsx)
**Purpose:** Main dashboard page composing all components

**Features:**

#### Authentication Guard
```typescript
useEffect(() => {
  if (!authLoading && !isAuthenticated) {
    router.push('/');
  }
}, [isAuthenticated, authLoading, router]);
```
- Redirects to home if not logged in
- Waits for auth check to complete
- Uses Next.js router for navigation

#### Welcome Section
- Personalized greeting with user's first name
- Dynamic message: "Welcome back, John! 👋"
- Subtitle describing page purpose

#### Stats Cards (Top Row)
1. **Generations Used**
   - Format: "X/Y" or "X/∞" for premium
   - Shows remaining count
   - Trend indicator (±12%)
   - Icon: Sparkles

2. **Credits Balance**
   - Current credit count
   - Subtitle changes by tier
   - Free: "Upgrade for more credits"
   - Basic/Premium: "1 credit per generation"
   - Icon: Wallet

3. **Plan Renewal**
   - Days until next billing
   - "Active" for free tier
   - Shows plan type (basic/premium)
   - Icon: Calendar

#### Tier-Based Data
**Free Tier:**
- 3/10 generations used
- Credits: 10
- No renewal date
- "Upgrade" prompts

**Basic Tier:**
- 45/200 generations used
- Credits: 200
- 23 days until renewal
- Trend: +12%

**Premium Tier:**
- 127/∞ generations used
- Credits: unlimited
- 23 days until renewal
- Trend: +12%

#### Mock Data
**Usage Chart (7 days):**
```javascript
[
  { date: 'Mon', generations: 5 },
  { date: 'Tue', generations: 8 },
  { date: 'Wed', generations: 12 },
  { date: 'Thu', generations: 6 },
  { date: 'Fri', generations: 15 },
  { date: 'Sat', generations: 10 },
  { date: 'Sun', generations: 7 }
]
```

**Recent Generations (6 items):**
- Mix of text-to-image and image-to-image
- Unsplash placeholder images
- Realistic prompts
- Relative timestamps (2 hours ago, 1 day ago, etc.)

#### Loading States
- Shows skeletons for 1 second
- Simulates data fetch
- All sections have skeleton components
- Smooth transition when loaded

#### Action Handlers (Placeholders)
```typescript
const handleView = (id: string) => {
  console.log('View generation:', id);
  // TODO: Implement view modal or detail page
};

const handleDownload = (id: string) => {
  console.log('Download generation:', id);
  // TODO: Implement download functionality
};

const handleDelete = (id: string) => {
  console.log('Delete generation:', id);
  // TODO: Implement delete with confirmation
};
```

**File Location:** `/app/dashboard/page.tsx`

---

## Responsive Design

### Breakpoints
- **Mobile (default):** 1 column layout
- **Tablet (md: 768px):** 2 columns for generations, side-by-side stats
- **Desktop (lg: 1024px):** 3 columns for generations, 4 for quick actions

### Layout Behavior
- Stats cards stack on mobile, row on tablet+
- Chart maintains 300px height across all screens
- Quick actions: 1/2/4 columns
- Recent generations: 1/2/3 columns
- Max width: 7xl (1280px)
- Horizontal padding: 4/8/16 (mobile/tablet/desktop)

## Data Flow

### Component Hierarchy
```
DashboardPage (page.tsx)
├── Header (global)
├── StatsCard × 3
├── UsageChart
├── QuickActions
│   └── ActionCard × 4
└── RecentGenerations
    ├── GenerationCard × N
    └── EmptyState (if N = 0)
```

### State Management
- Uses AuthContext for user data
- Local state for loading simulation
- No additional API calls (mock data)
- Future: fetch from backend API

## Empty States

### New User (No Generations)
- Shows when `generations.length === 0`
- Displayed in RecentGenerations component
- Large icon placeholder
- Call-to-action buttons
- Encourages first generation

### No Stats Yet
- Stats cards show zeros
- "Upgrade for more" prompts
- Guides user to pricing page

## Mock Data Sources

### Unsplash Images
All mock images use Unsplash URLs:
```
https://images.unsplash.com/photo-{id}?w=500
```

### Sample Prompts
- "A mystical forest with glowing mushrooms at twilight"
- "Futuristic city with flying cars and neon lights"
- "Steampunk robot playing violin"
- "Abstract watercolor galaxy with nebula clouds"
- "Underwater coral reef with bioluminescent creatures"
- "Mountain landscape in low-poly art style"

## TODO: Backend Integration

### API Endpoints Needed

1. **GET /api/dashboard/stats**
   - Returns: generations used, total, credits, renewal date
   - Response:
   ```json
   {
     "generationsUsed": 45,
     "totalGenerations": 200,
     "creditsRemaining": 155,
     "daysUntilRenewal": 23,
     "tier": "basic"
   }
   ```

2. **GET /api/dashboard/usage?days=7**
   - Returns: daily generation counts
   - Response:
   ```json
   {
     "data": [
       { "date": "2025-10-01", "generations": 5 },
       { "date": "2025-10-02", "generations": 8 }
     ]
   }
   ```

3. **GET /api/generations?limit=6**
   - Returns: recent generations with images
   - Response:
   ```json
   {
     "generations": [
       {
         "id": "gen_123",
         "imageUrl": "https://blob.storage/...",
         "prompt": "...",
         "createdAt": "2025-10-03T10:30:00Z",
         "type": "text-to-image"
       }
     ]
   }
   ```

4. **GET /api/generation/:id**
   - View detailed generation info
   - Returns: full metadata, settings used

5. **DELETE /api/generation/:id**
   - Delete generation and image
   - Returns: success status

6. **POST /api/generation/:id/download**
   - Generate signed URL for download
   - Returns: temporary download link

### Replace Mock Functions
```typescript
// In DashboardPage component
useEffect(() => {
  const fetchDashboardData = async () => {
    try {
      const [stats, usage, generations] = await Promise.all([
        fetch('/api/dashboard/stats').then(r => r.json()),
        fetch('/api/dashboard/usage?days=7').then(r => r.json()),
        fetch('/api/generations?limit=6').then(r => r.json())
      ]);

      setStatsData(stats);
      setUsageData(usage.data);
      setRecentGenerations(generations.generations);
      setIsLoading(false);
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
      // Show error state
    }
  };

  if (isAuthenticated) {
    fetchDashboardData();
  }
}, [isAuthenticated]);
```

## Styling Guidelines

### Color System
- **Primary gradient:** #FF6B9D → #A855F7
- **Background gradient:** #FFF5F7 → #FFFFFF
- **Text hierarchy:**
  - Headings: gray-900
  - Body: gray-600
  - Subtle: gray-500

### Card Design
- Background: white
- Border: 1px gray-100
- Border radius: 2xl (1rem)
- Shadow: lg on default, xl on hover
- Padding: 6 (1.5rem)

### Icons
- Size: 6x6 (24px) in most cases
- Color: white (on gradient backgrounds)
- Stroke width: 2
- Library: lucide-react

### Animations
- Transition duration: 300ms
- Easing: ease-in-out
- Hover effects: scale, shadow, opacity
- Loading: pulse animation

## Performance Optimizations

### Image Loading
- Next/Image component for optimization
- Lazy loading by default
- Blur placeholder
- Responsive sizes
- WebP format when possible

### Code Splitting
- Dynamic imports for heavy components
- Recharts loaded only on dashboard
- Skeleton components inline

### Memoization
Consider adding:
```typescript
const MemoizedStatsCard = React.memo(StatsCard);
const MemoizedUsageChart = React.memo(UsageChart);
```

## Accessibility

### Semantic HTML
- `<main>` for page content
- `<header>` for navigation
- `<section>` for logical groups
- `<button>` for actions

### ARIA Labels
- Icon buttons have `aria-label`
- Loading states announced
- Error states communicated

### Keyboard Navigation
- All actions keyboard accessible
- Focus indicators visible
- Logical tab order
- Escape closes modals

### Screen Readers
- Alt text on all images
- Descriptive button labels
- Status updates announced

## Testing Checklist

- [ ] Dashboard loads for authenticated users
- [ ] Redirects unauthenticated to home
- [ ] Stats display correctly by tier
- [ ] Chart renders with data
- [ ] Quick actions navigate properly
- [ ] Recent generations display
- [ ] Empty state shows for new users
- [ ] Action buttons work (view/download/delete)
- [ ] Loading skeletons appear
- [ ] Mobile responsive layout
- [ ] Tablet responsive layout
- [ ] Desktop responsive layout
- [ ] Images load and display
- [ ] Hover effects work
- [ ] Trends show correctly
- [ ] Infinite symbol for premium

## File Structure
```
/components
  ├── StatsCard.tsx
  ├── UsageChart.tsx
  ├── RecentGenerations.tsx
  └── QuickActions.tsx

/app
  └── dashboard
      └── page.tsx
```

## Dependencies
- React 18.3+
- Next.js 14.2+
- recharts 2.12.0
- lucide-react (icons)
- TypeScript

## Known Limitations
- Mock data only
- No real-time updates
- No pagination for generations
- No filtering or sorting
- No date range selector for chart
- Download doesn't actually work yet
- Delete has no confirmation
- No error boundaries

## Future Enhancements
- Real-time generation updates via WebSocket
- Date range picker for usage chart
- Export data to CSV
- Filter generations by type/date
- Bulk actions (delete multiple)
- Infinite scroll for history
- Comparison charts (month over month)
- Goal setting and tracking
- Achievement badges
- Social sharing features
- Download history
- Search generations by prompt
- Favorite/bookmark system
