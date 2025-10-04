# Deployment & Troubleshooting Guide

Complete guide for deploying and troubleshooting the ImageGenerator application.

## Table of Contents

1. [Production Deployment](#production-deployment)
2. [Environment Configuration](#environment-configuration)
3. [Common Issues](#common-issues)
4. [Monitoring](#monitoring)
5. [Performance Optimization](#performance-optimization)

## Production Deployment

### Prerequisites

- [ ] Azure account with active subscription
- [ ] Domain name (optional but recommended)
- [ ] SSL certificate (Let's Encrypt or Azure-managed)
- [ ] Stripe account in live mode
- [ ] Azure AD B2C production tenant configured

### Backend Deployment (Azure Container Apps)

#### 1. Build Container Image

```bash
cd ImageGenerator

# Build Docker image
docker build -t imagegen-api:latest .

# Tag for Azure Container Registry
docker tag imagegen-api:latest yourregistry.azurecr.io/imagegen-api:latest

# Push to registry
az acr login --name yourregistry
docker push yourregistry.azurecr.io/imagegen-api:latest
```

#### 2. Deploy to Container Apps

```bash
# Create resource group (if not exists)
az group create --name imagegen-rg --location eastus

# Create Container App environment
az containerapp env create \
  --name imagegen-env \
  --resource-group imagegen-rg \
  --location eastus

# Deploy Container App
az containerapp create \
  --name imagegen-api \
  --resource-group imagegen-rg \
  --environment imagegen-env \
  --image yourregistry.azurecr.io/imagegen-api:latest \
  --target-port 8000 \
  --ingress external \
  --min-replicas 1 \
  --max-replicas 10 \
  --cpu 1.0 \
  --memory 2.0Gi \
  --env-vars \
    AZURE_COSMOS_ENDPOINT=https://your-cosmos.documents.azure.com:443/ \
    AZURE_STORAGE_ACCOUNT_URL=https://yourstorage.blob.core.windows.net \
    AZURE_KEY_VAULT_URL=https://your-vault.vault.azure.net/ \
    AZURE_SERVICEBUS_NAMESPACE=your-servicebus.servicebus.windows.net \
    REPLICATE_API_TOKEN=secretref:replicate-token \
  --registry-server yourregistry.azurecr.io \
  --registry-username <username> \
  --registry-password <password>

# Get app URL
az containerapp show \
  --name imagegen-api \
  --resource-group imagegen-rg \
  --query properties.configuration.ingress.fqdn
```

#### 3. Configure Secrets

```bash
# Add secrets to Container App
az containerapp secret set \
  --name imagegen-api \
  --resource-group imagegen-rg \
  --secrets \
    replicate-token=your-replicate-token \
    stripe-secret=your-stripe-secret

# Update environment variables to use secrets
az containerapp update \
  --name imagegen-api \
  --resource-group imagegen-rg \
  --set-env-vars \
    REPLICATE_API_TOKEN=secretref:replicate-token \
    STRIPE_SECRET_KEY=secretref:stripe-secret
```

### Frontend Deployment (Vercel)

#### 1. Connect Repository

```bash
# Install Vercel CLI
npm install -g vercel

# Login
vercel login

# Deploy
cd frontend
vercel --prod
```

#### 2. Configure Environment Variables

In Vercel Dashboard or via CLI:

```bash
# Add environment variables
vercel env add NEXT_PUBLIC_API_URL production
# Enter: https://imagegen-api.azurecontainerapps.io

vercel env add NEXT_PUBLIC_AZURE_AD_B2C_TENANT production
# Enter: your-production-tenant

vercel env add NEXT_PUBLIC_AZURE_AD_B2C_CLIENT_ID production
# Enter: your-production-client-id

vercel env add NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY production
# Enter: pk_live_...

# ... add all other NEXT_PUBLIC_* variables
```

#### 3. Configure Custom Domain

```bash
# Add domain in Vercel Dashboard
# Then add DNS records:

# A Record
Type: A
Name: @
Value: 76.76.21.21

# CNAME Record
Type: CNAME
Name: www
Value: cname.vercel-dns.com
```

### Alternative: Deploy Frontend to Azure Static Web Apps

```bash
# Build frontend
cd frontend
npm run build

# Deploy to Azure Static Web Apps
az staticwebapp create \
  --name imagegen-frontend \
  --resource-group imagegen-rg \
  --location eastus \
  --app-location "frontend" \
  --output-location "out"

# Configure environment variables in Azure Portal
```

## Environment Configuration

### Production Environment Variables

**Backend (.env.production)**:

```env
# Environment
ENVIRONMENT=production
DEBUG=false

# Azure Resources
AZURE_COSMOS_ENDPOINT=https://prod-cosmos.documents.azure.com:443/
AZURE_STORAGE_ACCOUNT_URL=https://prodstorage.blob.core.windows.net
AZURE_KEY_VAULT_URL=https://prod-vault.vault.azure.net/
AZURE_SERVICEBUS_NAMESPACE=prod-servicebus.servicebus.windows.net
AZURE_CONTENT_SAFETY_ENDPOINT=https://prod-contentsafety.cognitiveservices.azure.com/

# Azure AD B2C
AZURE_AD_B2C_TENANT=yourcompany
AZURE_AD_B2C_CLIENT_ID=production-client-id
AZURE_AD_B2C_POLICY_NAME=B2C_1_signupsignin

# API Settings
CORS_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
ALLOWED_HOSTS=yourdomain.com,www.yourdomain.com

# Logging
LOG_LEVEL=INFO
LOG_FORMAT=json

# Application Insights
APPLICATIONINSIGHTS_CONNECTION_STRING=InstrumentationKey=...

# Rate Limiting
RATE_LIMIT_ENABLED=true
RATE_LIMIT_REQUESTS=100
RATE_LIMIT_WINDOW=60

# Secrets (stored in Key Vault, not in file)
# REPLICATE_API_TOKEN - from Key Vault
# STRIPE_SECRET_KEY - from Key Vault
# STRIPE_WEBHOOK_SECRET - from Key Vault
```

**Frontend (.env.production)**:

```env
# Backend API
NEXT_PUBLIC_API_URL=https://api.yourdomain.com
NEXT_PUBLIC_WS_URL=wss://api.yourdomain.com/ws

# Azure AD B2C
NEXT_PUBLIC_AZURE_AD_B2C_TENANT=yourcompany
NEXT_PUBLIC_AZURE_AD_B2C_CLIENT_ID=production-client-id
NEXT_PUBLIC_AZURE_AD_B2C_POLICY_NAME=B2C_1_signupsignin
NEXT_PUBLIC_API_SCOPE=https://yourcompany.onmicrosoft.com/api/access

# Redirects
NEXT_PUBLIC_REDIRECT_URI=https://yourdomain.com/auth/callback
NEXT_PUBLIC_POST_LOGOUT_REDIRECT_URI=https://yourdomain.com

# Stripe
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...

# Application
NEXT_PUBLIC_APP_NAME=ImageGenerator AI
NEXT_PUBLIC_APP_URL=https://yourdomain.com
NEXT_PUBLIC_ENVIRONMENT=production
NEXT_PUBLIC_DEBUG=false

# Features
NEXT_PUBLIC_ENABLE_REALTIME_UPDATES=true
NEXT_PUBLIC_ENABLE_ANALYTICS=true
NEXT_PUBLIC_ANALYTICS_ID=G-XXXXXXXXXX
```

## Common Issues

### Authentication Issues

#### Issue: "Redirect URI mismatch"

**Symptoms:**
- Error after Azure AD B2C redirect
- "AADB2C90006: The redirect URI..."

**Solution:**
```bash
# Check redirect URI in Azure AD B2C matches exactly
# Format: https://yourdomain.com/auth/callback

# Update in Azure Portal:
# Azure AD B2C → App registrations → Your app → Authentication
# Add redirect URI

# Update frontend environment variable:
NEXT_PUBLIC_REDIRECT_URI=https://yourdomain.com/auth/callback
```

#### Issue: "Token expired" errors

**Symptoms:**
- 401 errors after some time
- User logged out unexpectedly

**Solution:**
```typescript
// Check token expiration in auth context
// Implement automatic token refresh:

useEffect(() => {
  const refreshInterval = setInterval(async () => {
    if (isAuthenticated) {
      await acquireToken(true); // Force refresh
    }
  }, 50 * 60 * 1000); // Refresh every 50 minutes

  return () => clearInterval(refreshInterval);
}, [isAuthenticated]);
```

### API Connection Issues

#### Issue: CORS errors

**Symptoms:**
- Browser console: "Access-Control-Allow-Origin"
- API calls fail from browser

**Solution:**
```python
# backend: Update CORS configuration in app/config.py

cors_origins: list[str] = Field(
    default=[
        "https://yourdomain.com",
        "https://www.yourdomain.com",
    ],
    alias="CORS_ORIGINS"
)

# Redeploy backend
```

#### Issue: SSL certificate errors

**Symptoms:**
- "NET::ERR_CERT_AUTHORITY_INVALID"
- HTTPS connection fails

**Solution:**
```bash
# For Azure Container Apps, SSL is automatic
# Verify custom domain SSL:

az containerapp hostname bind \
  --name imagegen-api \
  --resource-group imagegen-rg \
  --hostname api.yourdomain.com \
  --environment imagegen-env

# Add DNS record:
Type: CNAME
Name: api
Value: imagegen-api.azurecontainerapps.io
```

### Generation Issues

#### Issue: Generations stuck in "processing"

**Symptoms:**
- Status never updates to completed
- WebSocket not receiving updates

**Solution:**
```bash
# Check worker service is running:
az containerapp logs show \
  --name imagegen-worker \
  --resource-group imagegen-rg \
  --tail 100

# Check Service Bus queue:
az servicebus queue show \
  --name image-generation-queue \
  --namespace-name your-servicebus \
  --resource-group imagegen-rg

# Restart worker if needed:
az containerapp revision restart \
  --name imagegen-worker \
  --resource-group imagegen-rg
```

#### Issue: "Replicate API error"

**Symptoms:**
- Generations fail with API error
- 500 errors from Replicate

**Solution:**
```bash
# Check Replicate API key:
az keyvault secret show \
  --name replicate-api-token \
  --vault-name your-vault

# Verify API key is valid on Replicate dashboard

# Check Replicate account status and quota

# Test API key manually:
curl https://api.replicate.com/v1/models \
  -H "Authorization: Token $REPLICATE_API_TOKEN"
```

### Payment Issues

#### Issue: Stripe webhook not receiving events

**Symptoms:**
- Payments complete but subscription not updated
- Webhook logs show failures

**Solution:**
```bash
# Verify webhook endpoint is accessible:
curl -I https://api.yourdomain.com/api/v1/subscriptions/webhook

# Check webhook secret in Stripe Dashboard matches Key Vault

# Test webhook locally with Stripe CLI:
stripe listen --forward-to https://api.yourdomain.com/api/v1/subscriptions/webhook

# Trigger test event:
stripe trigger checkout.session.completed

# Check webhook logs in Stripe Dashboard
```

#### Issue: "Insufficient credits" despite active subscription

**Symptoms:**
- User has active subscription
- Shows 0 credits

**Solution:**
```python
# Check database subscription record:
from app.repositories.subscription_repository import SubscriptionRepository

repo = SubscriptionRepository(db)
sub = await repo.get_by_user_id(user_id)
print(f"Credits: {sub.credits_remaining}/{sub.credits_per_month}")

# Reset credits manually if needed:
await repo.update(sub.id, {
    "credits_remaining": sub.credits_per_month,
    "credits_used_this_period": 0
})
```

### Database Issues

#### Issue: Cosmos DB connection timeout

**Symptoms:**
- 503 errors
- "Request timeout" in logs

**Solution:**
```bash
# Check Cosmos DB metrics in Azure Portal
# Increase Request Units (RUs) if throttled:

az cosmosdb update \
  --name your-cosmos \
  --resource-group imagegen-rg \
  --default-consistency-level Session

# Check connection string is correct
# Verify network connectivity from Container App
```

#### Issue: MongoDB connection pool exhausted

**Symptoms:**
- Intermittent database errors
- "No available connections"

**Solution:**
```python
# Increase connection pool size in config:

mongodb_connection_string = (
    f"{base_url}?"
    f"maxPoolSize=50&"  # Increase from default
    f"minPoolSize=10&"
    f"maxIdleTimeMS=60000"
)
```

### Storage Issues

#### Issue: Blob upload fails

**Symptoms:**
- Image upload returns error
- 500 error from storage

**Solution:**
```bash
# Check storage account access:
az storage account show \
  --name yourstorage \
  --resource-group imagegen-rg

# Verify managed identity has permissions:
az role assignment create \
  --role "Storage Blob Data Contributor" \
  --assignee <managed-identity-id> \
  --scope /subscriptions/<sub-id>/resourceGroups/imagegen-rg/providers/Microsoft.Storage/storageAccounts/yourstorage

# Check CORS configuration:
az storage cors add \
  --services b \
  --methods GET POST PUT \
  --origins https://yourdomain.com \
  --allowed-headers "*" \
  --exposed-headers "*" \
  --max-age 3600 \
  --account-name yourstorage
```

## Monitoring

### Application Insights

```bash
# View live metrics:
az monitor app-insights component show \
  --app imagegen-insights \
  --resource-group imagegen-rg

# Query logs:
az monitor app-insights query \
  --app imagegen-insights \
  --analytics-query "requests | where timestamp > ago(1h) | summarize count() by resultCode"
```

### Log Analytics

```python
# Add custom logging:
import logging
from opencensus.ext.azure.log_exporter import AzureLogHandler

logger = logging.getLogger(__name__)
logger.addHandler(AzureLogHandler(
    connection_string='InstrumentationKey=...'
))

# Log custom events:
logger.info('Generation started', extra={
    'custom_dimensions': {
        'user_id': user_id,
        'model': model,
        'generation_id': generation_id
    }
})
```

### Alerts

Set up alerts for:

- [ ] API error rate > 5%
- [ ] Response time > 2 seconds (P95)
- [ ] Failed generations > 10%
- [ ] Stripe webhook failures
- [ ] Database throttling
- [ ] Storage quota exceeded
- [ ] Worker queue backlog > 100

## Performance Optimization

### Backend Optimizations

**1. Enable Database Query Optimization**

```python
# Add indexes for frequent queries:
await db.generations.create_index([
    ("user_id", 1),
    ("created_at", -1)
])

await db.subscriptions.create_index([
    ("user_id", 1),
    ("status", 1)
])
```

**2. Implement Caching**

```python
from functools import lru_cache
from fastapi_cache import FastAPICache
from fastapi_cache.backends.redis import RedisBackend

# Cache subscription lookups:
@lru_cache(maxsize=1000)
async def get_cached_subscription(user_id: str):
    return await subscription_repo.get_by_user_id(user_id)
```

**3. Enable Response Compression**

```python
from fastapi.middleware.gzip import GZipMiddleware

app.add_middleware(GZipMiddleware, minimum_size=1000)
```

### Frontend Optimizations

**1. Enable Next.js Image Optimization**

```typescript
import Image from 'next/image';

<Image
  src={imageUrl}
  alt="Generated image"
  width={1024}
  height={1024}
  priority
/>
```

**2. Lazy Load Components**

```typescript
const GenerationGallery = dynamic(
  () => import('@/components/GenerationGallery'),
  { loading: () => <LoadingSpinner /> }
);
```

**3. Implement Incremental Static Regeneration**

```typescript
// In page component:
export const revalidate = 60; // Revalidate every 60 seconds
```

### CDN Configuration

```bash
# Enable Azure CDN for frontend:
az cdn profile create \
  --name imagegen-cdn \
  --resource-group imagegen-rg \
  --sku Standard_Microsoft

az cdn endpoint create \
  --name imagegen \
  --profile-name imagegen-cdn \
  --resource-group imagegen-rg \
  --origin yourdomain.com \
  --origin-host-header yourdomain.com
```

## Health Checks

```python
# Backend health endpoint:
@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "version": "1.0.0",
        "services": {
            "database": await check_database(),
            "storage": await check_storage(),
            "queue": await check_queue(),
            "replicate": await check_replicate()
        }
    }

# Test from command line:
curl https://api.yourdomain.com/health
```

## Rollback Procedure

If deployment fails:

```bash
# Backend: Revert to previous revision
az containerapp revision list \
  --name imagegen-api \
  --resource-group imagegen-rg

az containerapp revision activate \
  --name imagegen-api \
  --resource-group imagegen-rg \
  --revision <previous-revision-name>

# Frontend: Revert Vercel deployment
vercel rollback
```

## Support Contacts

- **Azure Support**: https://portal.azure.com/#blade/Microsoft_Azure_Support/HelpAndSupportBlade
- **Stripe Support**: support@stripe.com
- **Replicate Support**: support@replicate.com

## Additional Resources

- [Azure Container Apps Documentation](https://learn.microsoft.com/en-us/azure/container-apps/)
- [Vercel Documentation](https://vercel.com/docs)
- [Next.js Production Checklist](https://nextjs.org/docs/going-to-production)
- [FastAPI Production Guide](https://fastapi.tiangolo.com/deployment/)
