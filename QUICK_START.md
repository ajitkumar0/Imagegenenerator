# 🚀 AI Image Generator - Quick Start

## One-Command Setup

```bash
# Clone and setup
git clone https://github.com/yourusername/ImageGenerator.git
cd ImageGenerator

# Backend
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env with your credentials
uvicorn app.main:app --reload

# Frontend (new terminal)
cd frontend
npm install
cp .env.local.example .env.local
# Edit .env.local with your credentials
npm run dev
```

## Open in Browser

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000/docs
- **Login**: http://localhost:3000/auth/login

---

## Essential URLs

| Feature | URL | Description |
|---------|-----|-------------|
| Login | `/auth/login` | Sign in with Google |
| Generate Hub | `/generate` | Main generation page |
| Text-to-Image | `/generate/text-to-image` | Create from prompts |
| Image-to-Image | `/generate/image-to-image` | Transform images |
| Pricing | `/pricing` | View subscription plans |
| Manage Subscription | `/subscription/manage` | Manage billing |

---

## Environment Variables (Essential)

### Frontend (.env.local)
```env
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_AZURE_AD_B2C_TENANT=your-tenant
NEXT_PUBLIC_AZURE_AD_B2C_CLIENT_ID=your-client-id
NEXT_PUBLIC_AZURE_AD_B2C_POLICY_NAME=B2C_1_signupsignin1
```

### Backend (.env)
```env
AZURE_AD_B2C_TENANT_NAME=your-tenant
AZURE_AD_B2C_CLIENT_ID=your-client-id
JWT_SECRET_KEY=your-secret-key-min-32-chars
STRIPE_SECRET_KEY=sk_test_...
REPLICATE_API_TOKEN=r8_...
MONGODB_CONNECTION_STRING=mongodb://...
```

---

## Test Cards (Stripe)

```
Success: 4242 4242 4242 4242
Decline: 4000 0000 0000 0002
```

---

## Quick Testing

```bash
# 1. Test Authentication
# Go to: http://localhost:3000/auth/login
# Click "Sign In with Google"
# Authenticate and verify redirect

# 2. Test Generation
# Go to: http://localhost:3000/generate/text-to-image
# Enter prompt: "A beautiful sunset"
# Click Generate
# Wait ~10 seconds for result

# 3. Test Subscription
# Go to: http://localhost:3000/pricing
# Click "Subscribe to Basic"
# Use test card: 4242 4242 4242 4242
# Complete checkout
```

---

## Common Issues

### Port Already in Use
```bash
# Backend (8000)
lsof -ti:8000 | xargs kill -9

# Frontend (3000)
lsof -ti:3000 | xargs kill -9
```

### CORS Errors
```python
# backend/app/main.py
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

### Authentication Fails
- Verify Azure AD B2C redirect URI: `http://localhost:3000`
- Check client ID matches in both frontend and backend
- Ensure B2C policy name is correct

---

## 📚 Full Documentation

- **[README.md](./README.md)** - Complete project overview
- **[COMPLETE_FRONTEND_IMPLEMENTATION.md](./docs/COMPLETE_FRONTEND_IMPLEMENTATION.md)** - Frontend guide
- **[AUTH_QUICK_START.md](./docs/AUTH_QUICK_START.md)** - Authentication setup
- **[STRIPE_FRONTEND_INTEGRATION.md](./docs/STRIPE_FRONTEND_INTEGRATION.md)** - Stripe guide
- **[GENERATION_PAGES_IMPLEMENTATION.md](./docs/GENERATION_PAGES_IMPLEMENTATION.md)** - Generation guide

---

## 🎯 What's Working

✅ Google Sign-In via Azure AD B2C
✅ Text-to-Image Generation (FLUX models)
✅ Image-to-Image Transformation
✅ Real-time Progress Updates (WebSocket + Polling)
✅ Stripe Checkout & Billing Portal
✅ Credit Management
✅ Subscription Management
✅ Protected Routes
✅ Error Handling

---

## 🚀 Ready to Deploy?

See [DEPLOYMENT_TROUBLESHOOTING.md](./docs/DEPLOYMENT_TROUBLESHOOTING.md) for production deployment guide.

---

**Need Help?** Check the `/docs` folder for detailed guides!
