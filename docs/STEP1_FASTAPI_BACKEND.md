# STEP 1: FastAPI Backend for Azure Container Apps with Managed Identity

Complete implementation of a production-ready FastAPI backend with Azure integrations, Managed Identity authentication, and comprehensive error handling.

---

## Table of Contents

1. [Overview](#overview)
2. [Project Structure](#project-structure)
3. [Key Features](#key-features)
4. [Installation](#installation)
5. [Configuration](#configuration)
6. [Azure Services Integration](#azure-services-integration)
7. [API Endpoints](#api-endpoints)
8. [Deployment](#deployment)
9. [Monitoring](#monitoring)
10. [Security](#security)

---

## Overview

This is a production-ready FastAPI backend designed specifically for Azure Container Apps with:
- **Managed Identity** for Azure service authentication (NO connection strings in code)
- **Azure SDK for Python** for all Azure services
- **OpenTelemetry** integration with Application Insights
- **Docker** containerization optimized for Azure Container Apps
- **Auto-scaling** with scale-to-zero capability
- **Health check** endpoints for Kubernetes-style probes

---

## Project Structure

```
ImageGenerator/
├── app/
│   ├── main.py                      # FastAPI app initialization
│   ├── config.py                    # Settings using pydantic-settings
│   ├── api/
│   │   └── v1/
│   │       ├── __init__.py          # API router configuration
│   │       └── endpoints/
│   │           ├── __init__.py
│   │           └── images.py        # Image management endpoints
│   ├── core/
│   │   ├── __init__.py
│   │   ├── azure_clients.py         # Azure clients with Managed Identity
│   │   ├── security.py              # JWT & password hashing
│   │   └── dependencies.py          # FastAPI dependencies
│   ├── services/
│   │   ├── __init__.py
│   │   ├── cosmos_service.py        # Cosmos DB operations (legacy)
│   │   ├── blob_service.py          # Blob Storage operations (legacy)
│   │   ├── mongodb_service.py       # MongoDB service
│   │   └── azure_blob_service.py    # Enhanced blob service
│   ├── models/
│   │   ├── __init__.py
│   │   ├── image.py                 # Image data models
│   │   ├── user.py                  # User models
│   │   ├── generation.py            # Generation models
│   │   ├── subscription.py          # Subscription models
│   │   └── usage_log.py             # Usage log models
│   ├── schemas/
│   │   ├── __init__.py
│   │   └── image.py                 # Request/response schemas
│   ├── repositories/
│   │   ├── __init__.py
│   │   ├── base_repository.py       # Base repository pattern
│   │   ├── user_repository.py       # User data access
│   │   ├── generation_repository.py # Generation data access
│   │   ├── subscription_repository.py
│   │   └── usage_log_repository.py
│   └── utils/
│       ├── __init__.py
│       └── image_processor.py       # Image processing utilities
├── tests/
│   └── __init__.py
├── scripts/
│   └── init_database.py             # Database initialization
├── azure/
│   └── blob-lifecycle-policy.json   # Lifecycle management
├── docs/
│   ├── DATABASE_SCHEMA.md
│   ├── AZURE_RBAC_SETUP.md
│   └── BLOB_STORAGE_SETUP.md
├── Dockerfile.backend               # Docker configuration
├── .dockerignore.backend            # Docker ignore file
├── requirements.txt                 # Python dependencies
├── .env.example                     # Environment variables template
└── azure-container-app.yaml         # Azure Container Apps config
```

---

## Key Features

### 1. **Managed Identity Authentication**

All Azure services use Managed Identity (NO keys or connection strings in code):

```python
# app/core/azure_clients.py
class AzureClients:
    def __init__(self, settings: Settings):
        self._credential = DefaultAzureCredential()

    @property
    def credential(self) -> DefaultAzureCredential:
        if self._credential is None:
            if self.settings.azure_client_id:
                # User-assigned managed identity
                self._credential = DefaultAzureCredential(
                    managed_identity_client_id=self.settings.azure_client_id
                )
            else:
                # System-assigned managed identity
                self._credential = DefaultAzureCredential()
        return self._credential
```

### 2. **Health Check Endpoints**

Three types of health checks for Kubernetes-style probes:

- **`/health`** - Basic health check
- **`/health/ready`** - Readiness check (verifies Azure connections)
- **`/health/live`** - Liveness check

```python
@app.get("/health/ready")
async def readiness_check():
    checks = {"status": "ready", "services": {}}

    # Check Cosmos DB
    try:
        list(azure_clients.cosmos_client.list_databases())
        checks["services"]["cosmos_db"] = "healthy"
    except Exception as e:
        checks["services"]["cosmos_db"] = "unhealthy"
        checks["status"] = "not_ready"

    return checks
```

### 3. **API Versioning**

All endpoints versioned at `/api/v1/`:

```python
# app/main.py
app.include_router(api_router, prefix=settings.api_v1_prefix)  # /api/v1
```

### 4. **CORS Configuration**

Pre-configured for Azure Static Web Apps frontend:

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

### 5. **Global Exception Handling**

Centralized error handling with proper logging:

```python
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception: {str(exc)}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "detail": "Internal server error",
            "message": str(exc) if settings.debug else "An error occurred"
        }
    )
```

### 6. **Application Insights Integration**

OpenTelemetry for distributed tracing:

```python
if settings.appinsights_connection_string:
    configure_azure_monitor(
        connection_string=settings.appinsights_connection_string
    )
```

---

## Installation

### Prerequisites

- Python 3.11+
- Azure subscription
- Azure CLI installed

### Local Development Setup

```bash
# Clone repository
cd ImageGenerator

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Copy environment template
cp .env.example .env

# Edit .env with your Azure resource endpoints
nano .env

# Run locally
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Access API

- **API**: http://localhost:8000
- **Docs**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc
- **Health**: http://localhost:8000/health

---

## Configuration

### Environment Variables

All configuration via environment variables (see [.env.example](.env.example)):

```bash
# Application
ENVIRONMENT=production
DEBUG=false
LOG_LEVEL=INFO

# MongoDB
MONGODB_CONNECTION_STRING_SECRET=mongodb-connection-string
MONGODB_DATABASE_NAME=imagegenerator

# Blob Storage
AZURE_STORAGE_ACCOUNT_URL=https://yourstorage.blob.core.windows.net/
BLOB_CONTAINER_NAME=imagegen-images

# Key Vault (Required)
AZURE_KEY_VAULT_URL=https://yourkeyvault.vault.azure.net/

# Application Insights
APPLICATIONINSIGHTS_CONNECTION_STRING=InstrumentationKey=...

# Managed Identity
MANAGED_IDENTITY_ENABLED=true
# AZURE_CLIENT_ID=xxx  # For user-assigned identity
```

### Settings Management

Using `pydantic-settings` for type-safe configuration:

```python
# app/config.py
class Settings(BaseSettings):
    app_name: str = "ImageGenerator API"
    environment: str = Field(default="development", alias="ENVIRONMENT")
    mongodb_database_name: str = Field(default="imagegenerator")
    storage_account_url: str = Field(..., alias="AZURE_STORAGE_ACCOUNT_URL")

    model_config = SettingsConfigDict(
        env_file=".env",
        case_sensitive=False
    )

@lru_cache()
def get_settings() -> Settings:
    return Settings()
```

---

## Azure Services Integration

### 1. **Azure Cosmos DB (MongoDB API)**

Connection via Managed Identity with connection string in Key Vault:

```python
# Get connection string from Key Vault
keyvault_client = azure_clients.keyvault_client
connection_string = await get_mongodb_connection_string_from_keyvault(
    keyvault_client,
    settings.mongodb_connection_string_secret
)

# Initialize MongoDB
await initialize_mongodb(settings, connection_string)
```

### 2. **Azure Blob Storage**

Blob operations with User Delegation SAS tokens:

```python
blob_service = AzureBlobService(
    azure_clients.blob_service_client,
    settings
)

# Upload with SAS URL generation
blob_url, blob_path, metadata = await blob_service.upload_image(
    user_id="user_123",
    generation_id="gen_456",
    filename="image.png",
    image_data=image_bytes
)

# Generate secure SAS URL
sas_url = await blob_service.generate_sas_url(blob_path, expiry_hours=168)
```

### 3. **Azure Key Vault**

Retrieve secrets using Managed Identity:

```python
keyvault_client = SecretClient(
    vault_url=settings.key_vault_url,
    credential=azure_clients.credential
)

secret = keyvault_client.get_secret("mongodb-connection-string")
connection_string = secret.value
```

### 4. **Azure Service Bus** (Optional)

Async messaging for image processing:

```python
servicebus_client = ServiceBusClient(
    fully_qualified_namespace=f"{namespace}.servicebus.windows.net",
    credential=azure_clients.credential
)
```

---

## API Endpoints

### Image Management (`/api/v1/images`)

#### Upload Image
```http
POST /api/v1/images/upload
Content-Type: multipart/form-data

file: [image file]
```

**Response:**
```json
{
  "id": "gen_abc123",
  "filename": "sunset.jpg",
  "blob_url": "https://storage.blob.core.windows.net/...",
  "size_bytes": 2048576,
  "message": "Image uploaded successfully"
}
```

#### Get Image Metadata
```http
GET /api/v1/images/{image_id}
```

**Response:**
```json
{
  "id": "gen_abc123",
  "user_id": "user_123",
  "filename": "sunset.jpg",
  "blob_url": "https://...",
  "created_at": "2024-01-01T12:00:00Z"
}
```

#### List Images
```http
GET /api/v1/images?skip=0&limit=50
```

#### Update Image Metadata
```http
PATCH /api/v1/images/{image_id}
Content-Type: application/json

{
  "description": "Beautiful sunset",
  "tags": ["sunset", "nature"]
}
```

#### Delete Image
```http
DELETE /api/v1/images/{image_id}
```

---

## Deployment

### Docker Build

```bash
# Build Docker image
docker build -f Dockerfile.backend -t imagegen-api:latest .

# Run locally
docker run -p 8000:8000 --env-file .env imagegen-api:latest

# Test
curl http://localhost:8000/health
```

### Azure Container Registry

```bash
# Login to ACR
az acr login --name youracr

# Tag and push
docker tag imagegen-api:latest youracr.azurecr.io/imagegen-api:latest
docker push youracr.azurecr.io/imagegen-api:latest
```

### Azure Container Apps Deployment

```bash
# Set variables
RESOURCE_GROUP="your-rg"
CONTAINER_APP_NAME="imagegen-api"
ACR_NAME="youracr"
IMAGE_NAME="youracr.azurecr.io/imagegen-api:latest"

# Create Container App
az containerapp create \
  --name $CONTAINER_APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --image $IMAGE_NAME \
  --environment your-env \
  --registry-server $ACR_NAME.azurecr.io \
  --registry-identity system \
  --system-assigned \
  --target-port 8000 \
  --ingress external \
  --min-replicas 0 \
  --max-replicas 10 \
  --cpu 0.5 \
  --memory 1.0Gi

# Get Container App URL
az containerapp show \
  --name $CONTAINER_APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --query properties.configuration.ingress.fqdn \
  --output tsv
```

### Enable Managed Identity and Assign Roles

```bash
# Get Principal ID
PRINCIPAL_ID=$(az containerapp show \
  --name $CONTAINER_APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --query identity.principalId \
  --output tsv)

# Grant Key Vault access
az role assignment create \
  --assignee $PRINCIPAL_ID \
  --role "Key Vault Secrets User" \
  --scope /subscriptions/.../providers/Microsoft.KeyVault/vaults/yourkeyvault

# Grant Blob Storage access
az role assignment create \
  --assignee $PRINCIPAL_ID \
  --role "Storage Blob Data Contributor" \
  --scope /subscriptions/.../providers/Microsoft.Storage/storageAccounts/yourstorage
```

---

## Monitoring

### Application Insights Queries

```kusto
// Request duration
requests
| where timestamp > ago(1h)
| summarize avg(duration), percentiles(duration, 50, 95, 99) by name

// Error rate
requests
| where timestamp > ago(1h)
| summarize total=count(), errors=countif(success == false)
| extend error_rate = (errors * 100.0) / total

// Dependency calls
dependencies
| where timestamp > ago(1h)
| summarize count() by target, resultCode
```

### Health Monitoring

```bash
# Check health endpoints
curl https://your-app.azurecontainerapps.io/health
curl https://your-app.azurecontainerapps.io/health/ready
curl https://your-app.azurecontainerapps.io/health/live
```

### Logs

```bash
# Stream logs
az containerapp logs show \
  --name $CONTAINER_APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --follow

# Query specific logs
az monitor log-analytics query \
  --workspace yourworkspace \
  --analytics-query "ContainerAppConsoleLogs_CL | where ContainerAppName_s == 'imagegen-api'"
```

---

## Security

### Security Features

✅ **Managed Identity** - No credentials in code
✅ **HTTPS Only** - TLS 1.2+ enforced
✅ **CORS** - Configured for specific origins
✅ **Rate Limiting** - Configurable per endpoint
✅ **JWT Authentication** - Secure token-based auth
✅ **Password Hashing** - bcrypt with 12 rounds
✅ **Input Validation** - Pydantic models
✅ **Secret Management** - Azure Key Vault

### Security Best Practices

1. **Never commit secrets** - Use Key Vault
2. **Rotate credentials** - Every 90 days
3. **Least privilege** - Minimal RBAC permissions
4. **Monitor access** - Enable diagnostic logging
5. **Update dependencies** - Regular security patches

### RBAC Roles Required

| Service | Role | Purpose |
|---------|------|---------|
| Key Vault | Key Vault Secrets User | Read secrets |
| Blob Storage | Storage Blob Data Contributor | Read/write/delete blobs |
| Blob Storage | Storage Account Contributor | Generate User Delegation Keys |
| Cosmos DB | Cosmos DB Data Contributor | Read/write data |

---

## Performance Optimization

### 1. **Connection Pooling**

```python
# MongoDB
AsyncIOMotorClient(
    connection_string,
    maxPoolSize=50,
    minPoolSize=10
)
```

### 2. **Caching**

```python
@lru_cache()
def get_settings() -> Settings:
    return Settings()
```

### 3. **Auto-Scaling**

```yaml
scale:
  minReplicas: 0  # Scale to zero
  maxReplicas: 10
  rules:
    - http:
        metadata:
          concurrentRequests: "100"
```

### 4. **Image Optimization**

- Compress images before upload (50-70% reduction)
- Generate thumbnails for gallery views
- Use WebP format (30% smaller)

---

## Troubleshooting

### Issue: "Authorization failed" errors

**Solution:**
```bash
# Verify Managed Identity is enabled
az containerapp show --name $CONTAINER_APP_NAME --query identity

# Verify role assignments
az role assignment list --assignee $PRINCIPAL_ID

# Wait 5-10 minutes for propagation
```

### Issue: Health checks failing

**Solution:**
```bash
# Check logs
az containerapp logs show --name $CONTAINER_APP_NAME --follow

# Verify environment variables
az containerapp show --name $CONTAINER_APP_NAME --query properties.template.containers[0].env
```

### Issue: Cannot connect to MongoDB

**Solution:**
```bash
# Verify Key Vault access
az keyvault secret show --vault-name yourkeyvault --name mongodb-connection-string

# Test connection string locally
```

---

## Next Steps

1. ✅ Review [docs/DATABASE_SCHEMA.md](DATABASE_SCHEMA.md) for MongoDB schema
2. ✅ Follow [docs/AZURE_RBAC_SETUP.md](AZURE_RBAC_SETUP.md) for RBAC configuration
3. ✅ Follow [docs/BLOB_STORAGE_SETUP.md](BLOB_STORAGE_SETUP.md) for blob storage
4. ✅ Deploy to Azure Container Apps
5. ⏭️ Integrate with Next.js frontend

---

## Resources

- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [Azure Container Apps](https://learn.microsoft.com/en-us/azure/container-apps/)
- [Azure Managed Identity](https://learn.microsoft.com/en-us/azure/active-directory/managed-identities-azure-resources/)
- [Azure SDK for Python](https://learn.microsoft.com/en-us/azure/developer/python/)
- [Application Insights](https://learn.microsoft.com/en-us/azure/azure-monitor/app/app-insights-overview)
