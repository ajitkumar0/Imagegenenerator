# Azure Infrastructure Deployment Guide

Complete guide for deploying the AI Image Generator platform to Azure.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Quick Start](#quick-start)
3. [Deployment Scripts](#deployment-scripts)
4. [Resource Naming Conventions](#resource-naming-conventions)
5. [Configuration](#configuration)
6. [Step-by-Step Deployment](#step-by-step-deployment)
7. [Verification](#verification)
8. [Troubleshooting](#troubleshooting)
9. [Cost Estimation](#cost-estimation)
10. [Security](#security)

---

## Prerequisites

### Required Tools

1. **Azure CLI** (version 2.50+)
   ```bash
   # Install Azure CLI
   # macOS
   brew install azure-cli

   # Windows
   winget install Microsoft.AzureCLI

   # Linux
   curl -sL https://aka.ms/InstallAzureCLIDeb | sudo bash
   ```

2. **Docker** (version 20.10+)
   ```bash
   # Verify installation
   docker --version
   docker info
   ```

3. **Azure Subscription**
   - Active Azure subscription
   - Owner or Contributor role
   - Sufficient quota for resources

### Azure CLI Setup

```bash
# Login to Azure
az login

# List subscriptions
az account list --output table

# Set active subscription
az account set --subscription "Your Subscription Name"

# Verify login
az account show

# Install Container Apps extension
az extension add --name containerapp --upgrade
```

### External Services Setup

Before deployment, obtain API keys from:

1. **Replicate** (AI Image Generation)
   - Sign up at https://replicate.com
   - Get API token from https://replicate.com/account/api-tokens

2. **Stripe** (Payments)
   - Sign up at https://stripe.com
   - Get keys from https://dashboard.stripe.com/apikeys
   - Create webhook and get webhook secret

3. **Azure AD B2C** (Authentication)
   - Create B2C tenant in Azure Portal
   - Register application
   - Configure Google identity provider
   - Get Tenant ID and Client ID

---

## Quick Start

### 1. Configure Environment

```bash
cd infrastructure

# Copy configuration template
cp deploy-config.env.template deploy-config.env

# Edit configuration
nano deploy-config.env
```

Fill in required values:
```bash
ENVIRONMENT=prod
LOCATION=eastus
PROJECT_NAME=imggen

REPLICATE_API_KEY=your_key_here
STRIPE_SECRET_KEY=your_key_here
STRIPE_WEBHOOK_SECRET=your_key_here
AZURE_AD_B2C_TENANT_ID=your_tenant_id
AZURE_AD_B2C_CLIENT_ID=your_client_id
```

### 2. Deploy Infrastructure

```bash
# Make scripts executable
chmod +x *.sh

# Run deployment (takes 15-20 minutes)
./deploy-azure.sh
```

### 3. Build and Push Images

```bash
# Build Docker images and push to ACR
./build-and-push.sh
```

### 4. Verify Deployment

```bash
# Check all resources
./verify-deployment.sh
```

### 5. Update Frontend

```bash
# Get backend URL from deployment outputs
source deployment-outputs.txt

# Update frontend .env.local
echo "NEXT_PUBLIC_API_URL=https://$BACKEND_FQDN" >> ../frontend/.env.local
```

---

## Deployment Scripts

### deploy-azure.sh

Main deployment script that creates all Azure resources.

**What it does:**
- Creates Resource Group
- Creates Azure Container Registry
- Creates Cosmos DB with MongoDB API
- Creates Storage Account with blob container
- Creates Redis Cache
- Creates Service Bus with queue
- Creates Key Vault
- Stores secrets in Key Vault
- Creates Managed Identity
- Assigns RBAC roles
- Creates Container Apps Environment
- Creates Backend and Worker Container Apps

**Usage:**
```bash
./deploy-azure.sh
```

**Duration:** 15-20 minutes

**Outputs:** `deployment-outputs.txt` with all resource details

---

### build-and-push.sh

Builds Docker images and pushes to ACR, then updates Container Apps.

**What it does:**
- Validates environment (Docker, directories)
- Logs in to ACR
- Builds backend Docker image
- Builds worker Docker image
- Pushes images to ACR with tags
- Updates Container Apps with new images
- Verifies deployment health

**Usage:**
```bash
./build-and-push.sh
```

**Duration:** 5-10 minutes (depends on image size)

**Requirements:**
- `deployment-outputs.txt` exists
- Docker daemon running
- Backend Dockerfile exists

---

### verify-deployment.sh

Comprehensive verification of all deployed resources.

**What it checks:**
- Resource Group exists and state
- Container Registry and repositories
- Cosmos DB databases and collections
- Storage Account and containers
- Redis Cache status
- Service Bus queues and messages
- Key Vault and secrets
- Managed Identity and RBAC roles
- Container Apps status
- Backend API health endpoints
- Application logs

**Usage:**
```bash
./verify-deployment.sh
```

**Duration:** 2-3 minutes

---

### cleanup-azure.sh

**⚠️ DANGER: Deletes ALL resources**

Removes entire resource group and all resources within it.

**What it deletes:**
- Everything in the resource group
- All data (Cosmos DB, Storage, Redis)
- All secrets in Key Vault
- Container Apps and images

**Usage:**
```bash
./cleanup-azure.sh
```

**Safety:**
- Requires typing "DELETE" to confirm
- Requires typing "yes" to double-confirm
- Irreversible action

---

## Resource Naming Conventions

All resources follow Azure naming best practices:

| Resource Type | Naming Pattern | Example |
|---------------|----------------|---------|
| Resource Group | `{project}-{env}-rg` | `imggen-prod-rg` |
| Container Registry | `{project}{env}acr` | `imggenproducr` |
| Cosmos DB | `{project}-{env}-cosmos` | `imggen-prod-cosmos` |
| Storage Account | `{project}{env}stor` | `imggenprodstor` |
| Redis Cache | `{project}-{env}-redis` | `imggen-prod-redis` |
| Service Bus | `{project}-{env}-sb` | `imggen-prod-sb` |
| Key Vault | `{project}-{env}-kv` | `imggen-prod-kv` |
| Managed Identity | `{project}-{env}-id` | `imggen-prod-id` |
| Container Env | `{project}-{env}-env` | `imggen-prod-env` |
| Backend App | `{project}-backend-{env}` | `imggen-backend-prod` |
| Worker App | `{project}-worker-{env}` | `imggen-worker-prod` |

### Constraints

- **ACR:** 5-50 alphanumeric characters (no hyphens)
- **Storage:** 3-24 lowercase alphanumeric characters
- **Key Vault:** 3-24 characters, must be globally unique
- **Cosmos DB:** Lowercase letters, numbers, hyphens

---

## Configuration

### deploy-config.env

Complete configuration reference:

```bash
################################################################################
# Core Settings
################################################################################

# Environment: dev, staging, prod
ENVIRONMENT=prod

# Azure region
LOCATION=eastus

# Project name (affects all resource names)
PROJECT_NAME=imggen

################################################################################
# Container Apps Settings
################################################################################

# Backend Container App
BACKEND_CPU=0.5                    # CPU cores (0.25, 0.5, 0.75, 1, 1.25, etc.)
BACKEND_MEMORY=1.0Gi               # Memory (0.5Gi, 1Gi, 1.5Gi, 2Gi, etc.)
BACKEND_MIN_REPLICAS=1             # Minimum instances
BACKEND_MAX_REPLICAS=10            # Maximum instances (auto-scale)

# Worker Container App
WORKER_CPU=0.5
WORKER_MEMORY=1.0Gi
WORKER_MIN_REPLICAS=1
WORKER_MAX_REPLICAS=5

################################################################################
# Redis Cache Settings
################################################################################

# SKU: Basic, Standard, Premium
REDIS_SKU=Basic

# VM Size:
# - C0: 250MB ($0.016/hr)
# - C1: 1GB ($0.04/hr)
# - C2: 2.5GB ($0.08/hr)
# - C3: 6GB ($0.40/hr)
REDIS_VM_SIZE=C0

################################################################################
# External Service API Keys
################################################################################

REPLICATE_API_KEY=r8_xxxxxxxxxxxxx
STRIPE_SECRET_KEY=sk_live_xxxxxxxxxxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxx
AZURE_AD_B2C_TENANT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
AZURE_AD_B2C_CLIENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

### Environment Variables Reference

Variables available to Container Apps:

| Variable | Description | Source |
|----------|-------------|--------|
| `ENVIRONMENT` | Deployment environment | Config |
| `MONGODB_CONNECTION_STRING` | Cosmos DB connection | Key Vault secret |
| `AZURE_STORAGE_CONNECTION_STRING` | Storage connection | Key Vault secret |
| `REDIS_URL` | Redis connection | Key Vault secret |
| `SERVICE_BUS_CONNECTION_STRING` | Service Bus connection | Key Vault secret |
| `SERVICE_BUS_QUEUE_NAME` | Queue name | Config |
| `STORAGE_CONTAINER_NAME` | Blob container | Config |
| `REPLICATE_API_TOKEN` | Replicate API key | Key Vault secret |
| `STRIPE_SECRET_KEY` | Stripe secret | Key Vault secret |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook | Key Vault secret |
| `AZURE_AD_B2C_TENANT_ID` | B2C tenant | Key Vault secret |
| `AZURE_AD_B2C_CLIENT_ID` | B2C client | Key Vault secret |

---

## Step-by-Step Deployment

### Step 1: Create Resource Group

```bash
az group create \
  --name imggen-prod-rg \
  --location eastus \
  --tags Environment=prod Project=imggen
```

**Duration:** 10 seconds

---

### Step 2: Create Container Registry

```bash
az acr create \
  --name imggenproducr \
  --resource-group imggen-prod-rg \
  --location eastus \
  --sku Standard \
  --admin-enabled true
```

**Duration:** 1-2 minutes

**Why Standard SKU:**
- Webhooks support
- Geo-replication (if needed later)
- Better throughput than Basic

---

### Step 3: Create Cosmos DB

```bash
az cosmosdb create \
  --name imggen-prod-cosmos \
  --resource-group imggen-prod-rg \
  --location eastus \
  --kind MongoDB \
  --server-version 4.2 \
  --default-consistency-level Session
```

**Duration:** 5-10 minutes

**Collections created:**
- `users` (sharded by user_id)
- `generations` (sharded by generation_id)
- `subscriptions` (sharded by user_id)

**Throughput:** 400 RU/s per collection (adjustable)

---

### Step 4: Create Storage Account

```bash
az storage account create \
  --name imggenprodstor \
  --resource-group imggen-prod-rg \
  --location eastus \
  --sku Standard_LRS \
  --kind StorageV2 \
  --access-tier Hot \
  --allow-blob-public-access true
```

**Container created:** `generated-images` (public read access)

**Duration:** 1-2 minutes

---

### Step 5: Create Redis Cache

```bash
az redis create \
  --name imggen-prod-redis \
  --resource-group imggen-prod-rg \
  --location eastus \
  --sku Basic \
  --vm-size C0 \
  --enable-non-ssl-port false \
  --minimum-tls-version 1.2
```

**Duration:** 10-20 minutes (longest step)

**Use case:** Session storage, rate limiting, caching

---

### Step 6: Create Service Bus

```bash
az servicebus namespace create \
  --name imggen-prod-sb \
  --resource-group imggen-prod-rg \
  --location eastus \
  --sku Standard

az servicebus queue create \
  --name generation-requests \
  --namespace-name imggen-prod-sb \
  --resource-group imggen-prod-rg \
  --max-delivery-count 10 \
  --lock-duration PT5M
```

**Duration:** 1-2 minutes

**Queue configuration:**
- Max delivery: 10 attempts
- Lock duration: 5 minutes
- TTL: 14 days
- Dead-letter: Enabled

---

### Step 7: Create Key Vault

```bash
az keyvault create \
  --name imggen-prod-kv \
  --resource-group imggen-prod-rg \
  --location eastus \
  --enable-rbac-authorization false
```

**Duration:** 30 seconds

**Secrets stored:**
- All connection strings
- External API keys
- ACR credentials

---

### Step 8: Create Managed Identity

```bash
az identity create \
  --name imggen-prod-id \
  --resource-group imggen-prod-rg \
  --location eastus
```

**Duration:** 10 seconds

**RBAC roles assigned:**
- Storage Blob Data Contributor
- Cosmos DB Account Reader Role
- Azure Service Bus Data Owner
- AcrPull
- Key Vault Secrets User

---

### Step 9: Create Container Apps

```bash
# Create environment
az containerapp env create \
  --name imggen-prod-env \
  --resource-group imggen-prod-rg \
  --location eastus

# Create backend app
az containerapp create \
  --name imggen-backend-prod \
  --resource-group imggen-prod-rg \
  --environment imggen-prod-env \
  --image imggenproducr.azurecr.io/backend:latest \
  --target-port 8000 \
  --ingress external \
  --cpu 0.5 \
  --memory 1.0Gi \
  --min-replicas 1 \
  --max-replicas 10

# Create worker app
az containerapp create \
  --name imggen-worker-prod \
  --resource-group imggen-prod-rg \
  --environment imggen-prod-env \
  --image imggenproducr.azurecr.io/worker:latest \
  --cpu 0.5 \
  --memory 1.0Gi \
  --min-replicas 1 \
  --max-replicas 5
```

**Duration:** 3-5 minutes

---

## Verification

### Manual Checks

```bash
# Check resource group
az group show --name imggen-prod-rg

# List all resources
az resource list --resource-group imggen-prod-rg --output table

# Check Container Registry
az acr repository list --name imggenproducr

# Check Cosmos DB
az cosmosdb mongodb database list \
  --account-name imggen-prod-cosmos \
  --resource-group imggen-prod-rg

# Check Storage containers
az storage container list \
  --account-name imggenprodstor \
  --auth-mode login

# Check Service Bus queues
az servicebus queue list \
  --namespace-name imggen-prod-sb \
  --resource-group imggen-prod-rg

# Check Container Apps
az containerapp list \
  --resource-group imggen-prod-rg \
  --output table

# Get backend URL
az containerapp show \
  --name imggen-backend-prod \
  --resource-group imggen-prod-rg \
  --query properties.configuration.ingress.fqdn -o tsv
```

### API Health Check

```bash
# Get backend URL
BACKEND_URL=$(az containerapp show \
  --name imggen-backend-prod \
  --resource-group imggen-prod-rg \
  --query properties.configuration.ingress.fqdn -o tsv)

# Test health endpoint
curl https://$BACKEND_URL/health

# View API docs
open https://$BACKEND_URL/docs
```

### View Logs

```bash
# Backend logs
az containerapp logs show \
  --name imggen-backend-prod \
  --resource-group imggen-prod-rg \
  --follow

# Worker logs
az containerapp logs show \
  --name imggen-worker-prod \
  --resource-group imggen-prod-rg \
  --follow

# Tail last 100 lines
az containerapp logs show \
  --name imggen-backend-prod \
  --resource-group imggen-prod-rg \
  --tail 100
```

---

## Troubleshooting

### Common Issues

#### 1. Deployment Fails: Resource Name Already Taken

**Problem:** Resource names must be globally unique (ACR, Storage, Key Vault)

**Solution:**
```bash
# Change PROJECT_NAME in deploy-config.env
PROJECT_NAME=imggen-yourname

# Or add random suffix
PROJECT_NAME=imggen-$(openssl rand -hex 3)
```

---

#### 2. Container App Not Starting

**Problem:** Container fails to start, app shows as "Provisioning"

**Check logs:**
```bash
az containerapp logs show \
  --name imggen-backend-prod \
  --resource-group imggen-prod-rg \
  --follow
```

**Common causes:**
- Missing environment variables
- Invalid connection strings
- Port mismatch (ensure app listens on 8000)
- Image pull failure

**Fix environment variables:**
```bash
az containerapp update \
  --name imggen-backend-prod \
  --resource-group imggen-prod-rg \
  --set-env-vars \
    MONGODB_CONNECTION_STRING=secretref:cosmos-conn-str \
    REDIS_URL=secretref:redis-conn-str
```

---

#### 3. Backend Returns 502 Bad Gateway

**Problem:** Ingress configured but app not responding

**Check:**
1. App listens on correct port (8000)
2. Health probe configured
3. App starts successfully

**Fix:**
```bash
# Update target port
az containerapp update \
  --name imggen-backend-prod \
  --resource-group imggen-prod-rg \
  --target-port 8000

# Check ingress
az containerapp show \
  --name imggen-backend-prod \
  --resource-group imggen-prod-rg \
  --query properties.configuration.ingress
```

---

#### 4. Managed Identity Permission Issues

**Problem:** App cannot access storage/cosmos/service bus

**Solution:**
```bash
# Get identity principal ID
PRINCIPAL_ID=$(az identity show \
  --name imggen-prod-id \
  --resource-group imggen-prod-rg \
  --query principalId -o tsv)

# Re-assign roles
az role assignment create \
  --assignee $PRINCIPAL_ID \
  --role "Storage Blob Data Contributor" \
  --scope "/subscriptions/$(az account show --query id -o tsv)/resourceGroups/imggen-prod-rg/providers/Microsoft.Storage/storageAccounts/imggenprodstor"
```

---

#### 5. Redis Connection Timeout

**Problem:** Cannot connect to Redis

**Check:**
```bash
# Verify Redis is running
az redis show \
  --name imggen-prod-redis \
  --resource-group imggen-prod-rg \
  --query provisioningState

# Test connection
az redis show \
  --name imggen-prod-redis \
  --resource-group imggen-prod-rg \
  --query "[hostName,sslPort,provisioningState]"
```

**Fix connection string:**
```bash
# Format: rediss://:PASSWORD@HOST:PORT/0?ssl_cert_reqs=required
REDIS_HOST=$(az redis show --name imggen-prod-redis --resource-group imggen-prod-rg --query hostName -o tsv)
REDIS_KEY=$(az redis list-keys --name imggen-prod-redis --resource-group imggen-prod-rg --query primaryKey -o tsv)
REDIS_URL="rediss://:${REDIS_KEY}@${REDIS_HOST}:6380/0?ssl_cert_reqs=required"
```

---

#### 6. Cosmos DB Connection Issues

**Problem:** MongoDB connection errors

**Check:**
```bash
# Get connection string
az cosmosdb keys list \
  --name imggen-prod-cosmos \
  --resource-group imggen-prod-rg \
  --type connection-strings
```

**Common issues:**
- Wrong connection string format
- Missing database name in URL
- TLS/SSL issues

**Correct format:**
```
mongodb://imggen-prod-cosmos:PASSWORD@imggen-prod-cosmos.mongo.cosmos.azure.com:10255/image_generator?ssl=true&retrywrites=false&replicaSet=globaldb&maxIdleTimeMS=120000
```

---

#### 7. Image Build Failures

**Problem:** Docker build fails

**Solutions:**

```bash
# Clear Docker cache
docker system prune -a

# Build with verbose output
docker build --no-cache --progress=plain -t test .

# Check Dockerfile syntax
docker build --check .
```

---

### Debugging Commands

```bash
# Show all resource states
az resource list \
  --resource-group imggen-prod-rg \
  --query "[].{Name:name, Type:type, State:provisioningState}" \
  --output table

# Get all connection strings at once
az keyvault secret list \
  --vault-name imggen-prod-kv \
  --query "[].{Name:name}" -o table

# Show specific secret
az keyvault secret show \
  --vault-name imggen-prod-kv \
  --name cosmos-connection-string \
  --query value -o tsv

# Check Container App configuration
az containerapp show \
  --name imggen-backend-prod \
  --resource-group imggen-prod-rg \
  --query "{Image:properties.template.containers[0].image, Env:properties.template.containers[0].env}" \
  --output json

# List all role assignments for identity
az role assignment list \
  --assignee $(az identity show --name imggen-prod-id --resource-group imggen-prod-rg --query principalId -o tsv) \
  --all \
  --output table
```

---

## Cost Estimation

### Monthly Cost Breakdown (USD)

| Service | Configuration | Estimated Cost |
|---------|--------------|----------------|
| Container Apps (Backend) | 0.5 vCPU, 1GB RAM, 1-10 replicas | $30-300/mo |
| Container Apps (Worker) | 0.5 vCPU, 1GB RAM, 1-5 replicas | $30-150/mo |
| Cosmos DB | 3 collections @ 400 RU/s each | $60/mo |
| Storage Account | 100GB blob storage | $2-5/mo |
| Redis Cache | Basic C0 (250MB) | $12/mo |
| Service Bus | Standard tier, low volume | $10/mo |
| Container Registry | Standard tier | $20/mo |
| Key Vault | Secrets only | $1/mo |
| **Total (minimum)** | Single replica | **$165/mo** |
| **Total (auto-scale)** | Average load | **$250-400/mo** |

### Cost Optimization Tips

1. **Use Dev/Test Pricing** (if applicable)
   ```bash
   az account set --subscription "Dev/Test Subscription"
   ```

2. **Scale Down Redis**
   ```bash
   # Use minimum size for dev
   REDIS_SKU=Basic
   REDIS_VM_SIZE=C0  # 250MB
   ```

3. **Reduce Container Replicas**
   ```bash
   BACKEND_MIN_REPLICAS=1
   BACKEND_MAX_REPLICAS=3
   ```

4. **Use Cosmos DB Serverless** (for dev)
   ```bash
   az cosmosdb create \
     --capabilities EnableServerless
   ```

5. **Auto-pause Redis** (not directly supported, but can use Azure Automation)

### Production Recommendations

For production with high load:

```bash
# Container Apps
BACKEND_CPU=1.0
BACKEND_MEMORY=2.0Gi
BACKEND_MIN_REPLICAS=2
BACKEND_MAX_REPLICAS=20

# Redis
REDIS_SKU=Standard
REDIS_VM_SIZE=C1  # 1GB

# Cosmos DB
# Increase RU/s per collection to 1000+
```

**Estimated production cost:** $500-1000/month

---

## Security

### Best Practices

1. **Secrets Management**
   - ✅ All secrets in Key Vault
   - ✅ No secrets in code or env files
   - ✅ Managed Identity for access
   - ✅ Rotate secrets regularly

2. **Network Security**
   - ✅ TLS 1.2+ enforced
   - ✅ HTTPS only for all services
   - ✅ Private endpoints (optional, additional cost)

3. **Access Control**
   - ✅ RBAC roles with least privilege
   - ✅ Managed Identity (no passwords)
   - ✅ Key Vault access policies

4. **Monitoring**
   - ✅ Application Insights (optional)
   - ✅ Container Apps logs
   - ✅ Diagnostic settings

### Security Checklist

```bash
# 1. Rotate ACR credentials
az acr credential renew \
  --name imggenproducr \
  --password-name password

# 2. Regenerate Cosmos DB keys
az cosmosdb keys regenerate \
  --name imggen-prod-cosmos \
  --resource-group imggen-prod-rg \
  --key-kind primary

# 3. Regenerate Storage keys
az storage account keys renew \
  --account-name imggenprodstor \
  --resource-group imggen-prod-rg \
  --key primary

# 4. Review Key Vault access
az keyvault show \
  --name imggen-prod-kv \
  --query properties.accessPolicies

# 5. Review RBAC assignments
az role assignment list \
  --resource-group imggen-prod-rg \
  --output table

# 6. Enable diagnostic logs
az monitor diagnostic-settings create \
  --name imggen-diagnostics \
  --resource /subscriptions/.../resourceGroups/imggen-prod-rg \
  --logs '[{"category": "Administrative", "enabled": true}]'
```

### Compliance

- **GDPR:** Cosmos DB encryption at rest
- **HIPAA:** Not currently configured (requires additional settings)
- **SOC 2:** Azure services are SOC 2 compliant
- **PCI DSS:** Use for payment processing via Stripe (PCI compliant)

---

## Advanced Operations

### Scaling

```bash
# Scale backend manually
az containerapp update \
  --name imggen-backend-prod \
  --resource-group imggen-prod-rg \
  --min-replicas 3 \
  --max-replicas 20

# Scale Cosmos DB
az cosmosdb mongodb collection throughput update \
  --account-name imggen-prod-cosmos \
  --resource-group imggen-prod-rg \
  --database-name image_generator \
  --name generations \
  --throughput 1000

# Upgrade Redis
az redis update \
  --name imggen-prod-redis \
  --resource-group imggen-prod-rg \
  --sku Standard \
  --vm-size C1
```

### Backup

```bash
# Enable Cosmos DB backup (automatic)
az cosmosdb update \
  --name imggen-prod-cosmos \
  --resource-group imggen-prod-rg \
  --backup-policy-type Continuous

# Storage account soft delete
az storage account blob-service-properties update \
  --account-name imggenprodstor \
  --resource-group imggen-prod-rg \
  --enable-delete-retention true \
  --delete-retention-days 7
```

### Monitoring

```bash
# Create Application Insights
az monitor app-insights component create \
  --app imggen-prod-insights \
  --resource-group imggen-prod-rg \
  --location eastus

# Link to Container Apps
INSTRUMENTATION_KEY=$(az monitor app-insights component show \
  --app imggen-prod-insights \
  --resource-group imggen-prod-rg \
  --query instrumentationKey -o tsv)

az containerapp update \
  --name imggen-backend-prod \
  --resource-group imggen-prod-rg \
  --set-env-vars APPLICATIONINSIGHTS_CONNECTION_STRING=$INSTRUMENTATION_KEY
```

---

## Additional Resources

### Azure Documentation

- [Azure Container Apps](https://learn.microsoft.com/azure/container-apps/)
- [Azure Cosmos DB](https://learn.microsoft.com/azure/cosmos-db/)
- [Azure Container Registry](https://learn.microsoft.com/azure/container-registry/)
- [Azure Key Vault](https://learn.microsoft.com/azure/key-vault/)

### Community

- [Azure CLI Reference](https://learn.microsoft.com/cli/azure/)
- [Azure Pricing Calculator](https://azure.microsoft.com/pricing/calculator/)
- [Azure Status](https://status.azure.com/)

---

## Support

For issues with this deployment:

1. Check logs: `./verify-deployment.sh`
2. Review troubleshooting section
3. Check Azure Status page
4. Contact Azure Support (if needed)

For application issues:
- Check application logs
- Review error messages in Container Apps
- Verify all environment variables are set

---

**Last Updated:** 2025-01-08

**Version:** 1.0.0
