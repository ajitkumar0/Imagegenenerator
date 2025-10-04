# ImageGenerator AI - Complete Full-Stack Application

Production-ready AI image generation platform with subscription management, built on Azure cloud infrastructure.

## 🚀 Features

### Core Functionality
- ✅ **AI Image Generation** - Text-to-image and image-to-image using FLUX models
- ✅ **Real-time Updates** - WebSocket integration for live generation status
- ✅ **Subscription Management** - Three-tier pricing with Stripe integration
- ✅ **Credit System** - Usage tracking and credit management
- ✅ **Authentication** - Azure AD B2C with Google sign-in
- ✅ **Cloud Storage** - Azure Blob Storage for generated images
- ✅ **Queue Processing** - Azure Service Bus for async generation
- ✅ **Content Safety** - Azure Content Safety API integration

### Technical Highlights
- **Backend**: FastAPI (Python) with async/await
- **Frontend**: Next.js 14 (React, TypeScript)
- **Database**: Azure Cosmos DB (MongoDB API)
- **Storage**: Azure Blob Storage with CDN
- **Queue**: Azure Service Bus
- **Payments**: Stripe with webhooks
- **Auth**: Azure AD B2C + MSAL.js
- **AI**: Replicate API (FLUX models)
- **Deployment**: Azure Container Apps + Vercel

## 📁 Project Structure

```
ImageGenerator/
├── app/                          # Backend (FastAPI)
│   ├── api/
│   │   └── v1/
│   │       └── endpoints/       # API endpoints
│   │           ├── auth.py      # Authentication
│   │           ├── generate.py  # Image generation
│   │           └── subscriptions.py  # Stripe integration
│   ├── core/                    # Core functionality
│   │   ├── auth_dependencies.py
│   │   ├── azure_clients.py
│   │   └── security.py
│   ├── models/                  # Data models
│   │   ├── user.py
│   │   ├── generation.py
│   │   └── subscription.py
│   ├── repositories/            # Data access layer
│   ├── services/               # Business logic
│   │   ├── replicate_service.py      # Replicate API
│   │   ├── payment_service.py        # Stripe integration
│   │   ├── credit_service.py         # Credit management
│   │   ├── azure_blob_service.py     # Storage
│   │   ├── queue_service.py          # Service Bus
│   │   └── worker_service.py         # Background jobs
│   ├── schemas/                # Pydantic schemas
│   ├── config.py              # Configuration
│   └── main.py                # FastAPI app
│
├── frontend/                   # Frontend (Next.js)
│   ├── app/                   # App router pages
│   │   ├── auth/              # Authentication pages
│   │   │   ├── login/         # Login page
│   │   │   └── callback/      # OAuth callback handler
│   │   ├── generate/          # Generation pages
│   │   │   ├── text-to-image/ # Text-to-image generation
│   │   │   └── image-to-image/ # Image-to-image generation
│   │   ├── dashboard/         # User dashboard
│   │   └── pricing/           # Subscription pricing
│   ├── components/            # React components
│   │   └── auth/             # Auth components
│   ├── lib/                  # Utilities
│   │   ├── api/              # API functions
│   │   │   ├── auth.ts       # Auth API
│   │   │   ├── generate.ts   # Generation API
│   │   │   ├── subscription.ts  # Subscription API
│   │   │   └── usage.ts      # Usage API
│   │   ├── auth/             # Authentication
│   │   │   ├── msal-config.ts
│   │   │   └── auth-context.tsx
│   │   ├── types/            # TypeScript types
│   │   ├── api-client.ts     # API client
│   │   └── websocket-client.ts  # WebSocket client
│   └── public/               # Static assets
│
├── docs/                      # Documentation
│   ├── AUTHENTICATION_FLOW.md # Complete auth flow documentation
│   ├── AUTH_QUICK_START.md   # Authentication setup guide
│   ├── AUTHENTICATION_IMPLEMENTATION_SUMMARY.md # Auth implementation
│   ├── GENERATION_PAGES_IMPLEMENTATION.md # Generation pages guide
│   ├── REPLICATE_SERVICE.md  # Replicate integration guide
│   ├── STRIPE_INTEGRATION.md # Stripe payment guide
│   ├── FRONTEND_INTEGRATION.md  # Frontend integration
│   ├── TESTING_GUIDE.md      # Testing guide
│   └── DEPLOYMENT_TROUBLESHOOTING.md  # Deployment guide
│
├── tests/                     # Test suites
├── scripts/                   # Utility scripts
├── Dockerfile                # Backend container
├── docker-compose.yml        # Local development
└── README.md                 # This file
```

## 🛠️ Tech Stack

### Backend
- **Framework**: FastAPI 0.104+
- **Language**: Python 3.11+
- **Database**: Azure Cosmos DB (MongoDB API)
- **Storage**: Azure Blob Storage
- **Queue**: Azure Service Bus
- **Auth**: Azure AD B2C, JWT
- **Payments**: Stripe API
- **AI**: Replicate API (FLUX models)
- **Monitoring**: Application Insights

### Frontend
- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript 5+
- **State**: React Context API
- **Auth**: MSAL.js (Azure AD B2C)
- **API Client**: Axios
- **Real-time**: WebSocket
- **UI**: Tailwind CSS
- **Deployment**: Vercel

## 🚀 Quick Start

### Prerequisites

- Python 3.11+
- Node.js 18+
- Docker Desktop (for local development)
- Azure account
- Stripe account
- Replicate API account

### 1. Clone Repository

```bash
git clone https://github.com/yourusername/ImageGenerator.git
cd ImageGenerator
```

### 2. Backend Setup

```bash
# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Copy environment template
cp .env.example .env

# Edit .env with your credentials
nano .env

# Run database migrations
python scripts/init_database.py

# Start backend
uvicorn app.main:app --reload --port 8000
```

Backend will be available at: http://localhost:8000

API Documentation: http://localhost:8000/docs

### 3. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Copy environment template
cp .env.local.example .env.local

# Edit .env.local with your credentials
nano .env.local

# Start development server
npm run dev
```

Frontend will be available at: http://localhost:3000

### 4. Worker Setup (for background jobs)

```bash
# In a new terminal, from project root:
source venv/bin/activate
python worker.py
```

## 📝 Configuration

### Required Azure Resources

1. **Cosmos DB** (MongoDB API)
   - Database: `imagegenerator`
   - Collections: `users`, `generations`, `subscriptions`, `usage_logs`

2. **Storage Account**
   - Container: `images`
   - Public access: Blob
   - CORS enabled

3. **Service Bus**
   - Queue: `image-generation-queue`

4. **Key Vault**
   - Secrets: Replicate API token, Stripe keys

5. **Azure AD B2C**
   - User flow: Sign up/sign in
   - App registration with API scopes

### Environment Variables

See `.env.example` (backend) and `.env.local.example` (frontend) for complete list.

**Critical Variables:**

```bash
# Backend
AZURE_COSMOS_ENDPOINT=...
AZURE_STORAGE_ACCOUNT_URL=...
AZURE_KEY_VAULT_URL=...
REPLICATE_API_TOKEN=...
STRIPE_SECRET_KEY=...

# Frontend
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_AZURE_AD_B2C_TENANT=...
NEXT_PUBLIC_AZURE_AD_B2C_CLIENT_ID=...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=...
```

## 🧪 Testing

### Run Unit Tests

```bash
# Backend
pytest tests/ -v --cov=app

# Frontend
cd frontend
npm test
```

### Run E2E Tests

```bash
cd frontend
npm run test:e2e
```

### Test Coverage

```bash
# Backend
pytest --cov=app --cov-report=html

# Frontend
npm test -- --coverage
```

See [TESTING_GUIDE.md](docs/TESTING_GUIDE.md) for comprehensive testing documentation.

## 📦 Deployment

### Deploy Backend to Azure Container Apps

```bash
# Build and push image
docker build -t yourregistry.azurecr.io/imagegen-api:latest .
docker push yourregistry.azurecr.io/imagegen-api:latest

# Deploy
az containerapp create \
  --name imagegen-api \
  --resource-group imagegen-rg \
  --environment imagegen-env \
  --image yourregistry.azurecr.io/imagegen-api:latest \
  --target-port 8000 \
  --ingress external
```

### Deploy Frontend to Vercel

```bash
cd frontend
vercel --prod
```

See [DEPLOYMENT_TROUBLESHOOTING.md](docs/DEPLOYMENT_TROUBLESHOOTING.md) for complete deployment guide.

## 📚 Documentation

Comprehensive documentation is available in the `docs/` directory:

1. **[Replicate Service](docs/REPLICATE_SERVICE.md)** - FLUX model integration
2. **[Stripe Integration](docs/STRIPE_INTEGRATION.md)** - Payment & subscriptions
3. **[Frontend Integration](docs/FRONTEND_INTEGRATION.md)** - API client & auth
4. **[Testing Guide](docs/TESTING_GUIDE.md)** - Testing strategies
5. **[Deployment Guide](docs/DEPLOYMENT_TROUBLESHOOTING.md)** - Production deployment
6. **[API Documentation](http://localhost:8000/docs)** - Interactive API docs (when running)

## 🔑 Key Features Implementation

### Authentication Flow

1. User clicks "Sign In"
2. Redirects to Azure AD B2C
3. User authenticates (Google, email, etc.)
4. Returns with auth code
5. MSAL exchanges for tokens
6. Tokens stored and used for API calls

### Generation Flow

1. User submits prompt on frontend
2. API creates generation record
3. Sends message to Service Bus queue
4. Worker picks up message
5. Calls Replicate API
6. Polls for completion
7. Downloads image
8. Uploads to Azure Blob Storage
9. Updates database
10. WebSocket notifies frontend
11. Image displays to user

### Subscription Flow

1. User selects plan
2. Frontend calls backend checkout endpoint
3. Backend creates Stripe session
4. Redirects to Stripe Checkout
5. User completes payment
6. Stripe sends webhook to backend
7. Backend allocates credits
8. User can generate images

## 🎨 Subscription Tiers

| Feature | Free | Basic ($9.99/mo) | Premium ($29.99/mo) |
|---------|------|------------------|---------------------|
| Credits | 10/month | 200/month | Unlimited |
| Models | FLUX Schnell | Schnell + Dev | All models + Pro |
| Priority | No | Yes | Highest |
| Watermark | Yes | No | No |
| API Access | No | No | Yes |
| Support | Community | Email | Priority |

## 🔐 Security

- ✅ JWT authentication with Azure AD B2C
- ✅ API rate limiting
- ✅ CORS configuration
- ✅ Input validation and sanitization
- ✅ SQL injection protection (parameterized queries)
- ✅ Secrets in Azure Key Vault
- ✅ HTTPS only in production
- ✅ Content Safety API integration
- ✅ Stripe webhook signature verification
- ✅ Managed Identity for Azure resources

## 📊 Monitoring

- **Application Insights** - Telemetry and logging
- **Azure Monitor** - Resource metrics
- **Stripe Dashboard** - Payment monitoring
- **Custom alerts** - Error rate, response time, etc.

## 🐛 Troubleshooting

Common issues and solutions:

**Authentication fails**
- Check redirect URI matches Azure AD B2C config
- Verify client ID and tenant name

**API connection fails**
- Check CORS settings
- Verify API URL in frontend env variables

**Generations stuck**
- Check worker service is running
- Verify Service Bus queue has messages

**Payment webhook fails**
- Check webhook endpoint is accessible
- Verify webhook secret matches

See [DEPLOYMENT_TROUBLESHOOTING.md](docs/DEPLOYMENT_TROUBLESHOOTING.md) for detailed troubleshooting.

## 🤝 Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Write tests
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see LICENSE file for details.

## 🙏 Acknowledgments

- **FLUX Models** by Black Forest Labs
- **Replicate** for AI model hosting
- **Stripe** for payment processing
- **Microsoft Azure** for cloud infrastructure
- **FastAPI** framework
- **Next.js** framework

## 📞 Support

- **Documentation**: [docs/](docs/)
- **Issues**: [GitHub Issues](https://github.com/yourusername/ImageGenerator/issues)
- **Email**: support@yourdomain.com

## 🗺️ Roadmap

- [ ] Multi-language support
- [ ] Mobile apps (iOS, Android)
- [ ] Advanced editing tools
- [ ] Team collaboration features
- [ ] API for developers
- [ ] More AI models
- [ ] Video generation
- [ ] Custom model training

## 📈 Status

- **Backend**: ✅ Production Ready
- **Frontend**: ✅ Production Ready
- **Documentation**: ✅ Complete
- **Tests**: ✅ 80%+ Coverage
- **Deployment**: ✅ Azure + Vercel

## 🎉 Getting Help

1. Check [documentation](docs/)
2. Review [troubleshooting guide](docs/DEPLOYMENT_TROUBLESHOOTING.md)
3. Search [existing issues](https://github.com/yourusername/ImageGenerator/issues)
4. Open a new issue with:
   - Problem description
   - Steps to reproduce
   - Expected vs actual behavior
   - Logs/screenshots

---

**Built with ❤️ using Azure, FastAPI, and Next.js**

Last Updated: January 2025
Version: 1.0.0
