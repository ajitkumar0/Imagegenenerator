# Authentication System Documentation

## Overview
Complete authentication UI implementation for ImageGen AI with React Context state management, mock Google OAuth, and localStorage persistence.

## Architecture

### Authentication Flow
1. User clicks "Sign In" button in header
2. AuthModal opens with Google OAuth button
3. Mock authentication simulates 1.5s sign-in delay
4. User data stored in localStorage for session persistence
5. AuthContext provides global authentication state
6. UserMenu displays when authenticated

## Components Created

### 1. AuthContext (contexts/AuthContext.tsx)
**Purpose:** Global authentication state management using React Context API

**Features:**
- User interface with id, email, name, avatar, tier, credits, apiKey
- AuthProvider component wraps the entire application
- useAuth hook for consuming context in components
- localStorage persistence for session management
- Mock authentication functions

**User Interface:**
```typescript
interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  tier: 'free' | 'basic' | 'premium';
  credits: number;
  apiKey?: string;
}
```

**Context Interface:**
```typescript
interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  signIn: () => Promise<void>;
  signOut: () => void;
  updateUser: (updates: Partial<User>) => void;
}
```

**Mock Sign In:**
- 1.5 second delay to simulate API call
- Creates demo user with:
  - ID: `user_${timestamp}`
  - Email: user@imagegen.ai
  - Name: John Doe
  - Tier: basic
  - Credits: 200
  - Avatar: generated from UI Avatars

**localStorage Keys:**
- `imagegen_user` - stores user object as JSON
- Loaded on component mount
- Cleared on sign out

**File Location:** `/contexts/AuthContext.tsx`

---

### 2. AuthModal (components/AuthModal.tsx)
**Purpose:** Sign-in modal with Google OAuth button (mock implementation)

**Props:**
```typescript
interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}
```

**Features:**
- Modal overlay with centered content
- Google OAuth button with official Google logo SVG
- Loading state during sign-in (1.5s)
- Benefits list:
  - Save and access your generation history
  - Generate images from anywhere
  - Get free credits every month
- Privacy policy and terms of service links
- Close button (X)
- Click outside to close functionality
- Fade-in animation
- Gradient theme consistent with app design

**Styling:**
- White modal card with rounded corners
- Shadow for depth
- Gradient button (Google blue)
- Responsive padding and sizing
- Semi-transparent black overlay

**File Location:** `/components/AuthModal.tsx`

---

### 3. UserMenu (components/UserMenu.tsx)
**Purpose:** Profile dropdown menu in header when authenticated

**Features:**
- User avatar with tier badge overlay
- Credits display in dropdown header
- Click to toggle dropdown
- Click outside to close
- Slide-down animation

**Menu Items:**
1. **Dashboard** - links to `/dashboard`
   - Icon: LayoutDashboard
   - Shows overview of activity

2. **Settings** - links to `/settings`
   - Icon: Settings
   - Manage profile and preferences

3. **Billing & Plans** - links to `/pricing`
   - Icon: CreditCard
   - Upgrade or manage subscription

4. **Sign Out** - calls signOut function
   - Icon: LogOut
   - Clears session and redirects

**Tier Badge Colors:**
- Free: Gray gradient
- Basic: Blue gradient
- Premium: Purple to pink gradient

**Avatar:**
- 40x40 circular image
- Generated from UI Avatars API
- User's name initials
- Gradient background matching tier

**Styling:**
- Dropdown positioned below avatar
- White background with shadow
- Hover effects on menu items
- Border between items
- Responsive on mobile

**File Location:** `/components/UserMenu.tsx`

---

### 4. Settings Page (app/settings/page.tsx)
**Purpose:** User settings page with profile, notifications, and API key management

**Sections:**

#### Section 1: Profile Settings
- **Name input** - editable text field
- **Email input** - editable text field
- **Save button** - updates user via AuthContext
- Loading state during save
- Success feedback (console log for now)

#### Section 2: Notification Preferences
- **Master toggle** - enable/disable email notifications
- **Conditional sub-options** (shown when enabled):
  - Generation completed notifications
  - Credits running low alerts
  - Weekly digest emails
- **Save button** - persists preferences
- Loading state during save

#### Section 3: API Key Management
**Premium/Basic Users:**
- Display current API key (masked by default)
- Show/hide toggle with eye icon
- Copy to clipboard button
- Generate new key button
- Regenerate warning message
- Mock key format: `ig_` + random string

**Free Users:**
- Upgrade prompt
- "Available on Basic and Premium plans"
- Link to pricing page

**Features:**
- Authentication guard (redirects if not logged in)
- Loads user data from AuthContext
- Updates persist to localStorage via updateUser
- Fully responsive layout
- Loading states for all actions
- Empty states handled

**File Location:** `/app/settings/page.tsx`

---

## Integration

### app/layout.tsx
Wrapped entire application with AuthProvider:
```typescript
import { AuthProvider } from '@/contexts/AuthContext';

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
```

### components/Header.tsx
Integrated authentication UI into header:
```typescript
import { useAuth } from '@/contexts/AuthContext';
import AuthModal from './AuthModal';
import UserMenu from './UserMenu';

// Show "Sign In" button when not authenticated
// Show UserMenu when authenticated
{isAuthenticated ? (
  <UserMenu />
) : (
  <button onClick={() => setIsAuthModalOpen(true)}>
    Sign In
  </button>
)}
```

## Mock Data

### Demo User Object
```json
{
  "id": "user_1234567890",
  "email": "user@imagegen.ai",
  "name": "John Doe",
  "avatar": "https://ui-avatars.com/api/?name=John+Doe&background=FF6B9D&color=fff",
  "tier": "basic",
  "credits": 200
}
```

### API Key Format
- Prefix: `ig_`
- Random string: base36 encoding
- Example: `ig_kj8h3f9d2x`

## State Management

### Context Flow
1. AuthProvider wraps app in layout.tsx
2. Components consume context via useAuth hook
3. State changes trigger re-renders across all consumers
4. localStorage syncs on every state change

### localStorage Schema
```json
{
  "imagegen_user": {
    "id": "string",
    "email": "string",
    "name": "string",
    "avatar": "string",
    "tier": "free" | "basic" | "premium",
    "credits": "number",
    "apiKey": "string"
  }
}
```

## Authentication Guards

### Dashboard Page
```typescript
useEffect(() => {
  if (!authLoading && !isAuthenticated) {
    router.push('/');
  }
}, [isAuthenticated, authLoading, router]);
```

### Settings Page
Similar guard redirects unauthenticated users to home page.

## TODO: Backend Integration

### Replace Mock Functions
1. **signIn()** - Replace with actual Google OAuth flow
   - Use NextAuth.js or similar
   - POST to `/api/auth/signin`
   - Store JWT token
   - Fetch user data from backend

2. **signOut()** - Clear session on backend
   - POST to `/api/auth/signout`
   - Invalidate JWT token
   - Clear cookies/localStorage

3. **updateUser()** - Persist to database
   - PATCH to `/api/user`
   - Validate changes
   - Return updated user object

4. **API Key Generation** - Backend endpoint
   - POST to `/api/user/api-key`
   - Generate secure random key
   - Store hashed version in database
   - Return plain key once

### Security Considerations
- Never store plain passwords
- Use HTTP-only cookies for tokens
- Implement CSRF protection
- Rate limit authentication attempts
- Validate email format
- Sanitize all user inputs
- Use HTTPS only
- Implement session timeout
- Add 2FA for premium users

## Styling Guidelines

### Color Palette
- Primary gradient: #FF6B9D to #A855F7
- Free tier: Gray (#6B7280)
- Basic tier: Blue (#3B82F6)
- Premium tier: Purple to Pink gradient

### Spacing
- Card padding: 6 (1.5rem)
- Section gaps: 8 (2rem)
- Input spacing: 4 (1rem)

### Typography
- Headings: font-bold
- Labels: font-medium
- Body: font-normal
- Gray scale: 900 (dark) to 500 (light)

## Testing Checklist

- [ ] Sign in flow completes successfully
- [ ] User menu displays correct information
- [ ] Settings page updates persist
- [ ] Sign out clears localStorage
- [ ] Page refresh maintains session
- [ ] Authentication guards redirect properly
- [ ] API key generation works
- [ ] Copy to clipboard functions
- [ ] Mobile responsive layout works
- [ ] Loading states display correctly
- [ ] Error states handled gracefully

## File Structure
```
/contexts
  └── AuthContext.tsx

/components
  ├── AuthModal.tsx
  └── UserMenu.tsx

/app
  ├── layout.tsx (AuthProvider wrapper)
  └── settings
      └── page.tsx
```

## Dependencies
- React 18.3+
- Next.js 14.2+
- lucide-react (icons)
- TypeScript

## Browser Compatibility
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## Performance Notes
- AuthContext uses single source of truth
- localStorage reads only on mount
- State updates batched by React
- No unnecessary re-renders
- Lazy loading for modals

## Accessibility
- ARIA labels on buttons
- Keyboard navigation support
- Focus management in modals
- Screen reader friendly
- Proper semantic HTML

## Known Limitations
- Mock authentication only
- No real OAuth integration
- API keys not actually validated
- Session doesn't expire
- No password reset flow
- No email verification
- No 2FA support

## Future Enhancements
- Real Google OAuth
- Social login (GitHub, Twitter)
- Email/password option
- Session timeout
- Remember me checkbox
- Account deletion
- Profile picture upload
- Multi-factor authentication
- Password change flow
- Email verification
