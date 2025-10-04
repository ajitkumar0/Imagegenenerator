# STEP 2: Azure Cosmos DB (MongoDB API) with Managed Identity

Complete implementation of MongoDB integration using Azure Cosmos DB with Managed Identity authentication, repository pattern, and comprehensive data models.

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Collections Schema](#collections-schema)
4. [Repository Pattern](#repository-pattern)
5. [Data Models](#data-models)
6. [Database Service](#database-service)
7. [Setup Instructions](#setup-instructions)
8. [Usage Examples](#usage-examples)
9. [Performance Optimization](#performance-optimization)
10. [Security](#security)

---

## Overview

This implementation provides a production-ready MongoDB integration with:
- **Azure Cosmos DB** with MongoDB API (v4.2)
- **Managed Identity** authentication via Azure Key Vault
- **Repository Pattern** for clean data access
- **Motor** async MongoDB driver
- **Comprehensive indexing** strategy
- **TTL (Time To Live)** for automatic data cleanup
- **Connection pooling** and retry logic

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      FastAPI Application                     │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                    Repository Layer                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │    User      │  │  Generation  │  │ Subscription │     │
│  │  Repository  │  │  Repository  │  │  Repository  │ ... │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│              MongoDB Service (Motor)                         │
│  - Connection Management                                     │
│  - Index Creation                                            │
│  - Retry Logic                                               │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│              Azure Key Vault (Managed Identity)              │
│  - MongoDB Connection String                                 │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│          Azure Cosmos DB (MongoDB API v4.2)                  │
│  - 5 Collections (users, generations, subscriptions, ...)   │
│  - Optimized Indexes                                         │
│  - TTL Auto-Cleanup                                          │
└─────────────────────────────────────────────────────────────┘
```

---

## Collections Schema

### 1. **users** Collection

Stores user profiles, authentication, and subscription data.

**Schema:**
```javascript
{
  id: "user_abc123",
  email: "user@example.com",
  full_name: "John Doe",
  auth_provider: "email|google|github|microsoft",
  auth_provider_id: "oauth_id",
  hashed_password: "bcrypt_hash",
  is_active: true,
  is_verified: false,
  subscription_tier: "free|basic|pro|enterprise",
  stripe_customer_id: "cus_xxx",
  credits_remaining: 10,
  total_generations: 0,
  settings: {...},
  created_at: ISODate(),
  updated_at: ISODate()
}
```

**Indexes:**
```javascript
email (unique)
auth_provider_id
stripe_customer_id
created_at
is_active
subscription_tier + is_active
```

**Pydantic Model:**
```python
from app.models.user import User, UserCreate, UserUpdate

# Create user
user = UserCreate(
    email="user@example.com",
    password="securepassword",
    full_name="John Doe",
    auth_provider=AuthProvider.EMAIL
)
```

---

### 2. **generations** Collection

Tracks all image generation requests and results.

**Schema:**
```javascript
{
  id: "gen_xyz789",
  user_id: "user_abc123",
  prompt: "A beautiful sunset over mountains",
  negative_prompt: "blurry, low quality",
  model_type: "stable-diffusion-xl",
  image_size: "1024x1024",
  status: "pending|processing|completed|failed",
  replicate_prediction_id: "pred_xxx",
  result_urls: ["https://replicate.delivery/..."],
  blob_urls: ["https://storage.blob.core.windows.net/..."],
  guidance_scale: 7.5,
  num_inference_steps: 50,
  cost_credits: 1,
  processing_time_ms: 5000,
  created_at: ISODate(),
  completed_at: ISODate()
}
```

**Indexes:**
```javascript
user_id + created_at
status
replicate_prediction_id (unique)
user_id + status
status + created_at (for processing queue)
```

**Pydantic Model:**
```python
from app.models.generation import Generation, GenerationCreate, GenerationStatus

# Create generation
generation = GenerationCreate(
    user_id="user_123",
    prompt="A beautiful sunset",
    model_type=ModelType.STABLE_DIFFUSION_XL,
    image_size=ImageSize.SQUARE_1024
)
```

---

### 3. **subscriptions** Collection

Manages Stripe subscriptions and billing.

**Schema:**
```javascript
{
  id: "sub_def456",
  user_id: "user_abc123",
  plan: "free|basic|pro|enterprise",
  status: "active|cancelled|past_due|expired",
  stripe_subscription_id: "sub_xxx",
  stripe_customer_id: "cus_xxx",
  billing_interval: "monthly|yearly",
  credits_per_month: 500,
  credits_used_this_period: 150,
  current_period_start: ISODate(),
  current_period_end: ISODate(),
  cancel_at_period_end: false,
  created_at: ISODate()
}
```

**Indexes:**
```javascript
user_id (unique)
stripe_subscription_id (unique)
stripe_customer_id
status + current_period_end
plan + status
```

---

### 4. **usage_logs** Collection

Analytics and rate limiting (TTL: 90 days).

**Schema:**
```javascript
{
  id: "log_ghi789",
  user_id: "user_abc123",
  action_type: "image_generation|api_request|file_upload",
  resource_id: "gen_xyz789",
  credits_used: 1,
  response_time_ms: 5000,
  metadata: {...},
  created_at: ISODate(),
  expires_at: ISODate()  // Auto-delete after 90 days
}
```

**Indexes:**
```javascript
user_id + created_at
action_type
user_id + action_type
expires_at (TTL index)
```

---

### 5. **rate_limit_logs** Collection

Rate limiting tracking (TTL: 1 hour).

**Schema:**
```javascript
{
  id: "rate_jkl012",
  user_id: "user_abc123",
  endpoint: "/api/v1/generations",
  request_count: 50,
  window_start: ISODate(),
  window_end: ISODate(),
  is_blocked: false,
  expires_at: ISODate()  // Auto-delete after 1 hour
}
```

**Indexes:**
```javascript
user_id + endpoint
user_id + endpoint + window_end
expires_at (TTL index)
```

---

## Repository Pattern

### Base Repository

Generic CRUD operations for all repositories:

```python
# app/repositories/base_repository.py
class BaseRepository(Generic[T]):
    def __init__(self, collection: AsyncIOMotorCollection, model_class: Type[T]):
        self.collection = collection
        self.model_class = model_class

    async def create(self, data: Dict[str, Any]) -> T
    async def find_by_id(self, document_id: str) -> Optional[T]
    async def find_one(self, filter_dict: Dict[str, Any]) -> Optional[T]
    async def find_many(self, filter_dict, skip, limit, sort) -> List[T]
    async def update_by_id(self, document_id: str, update_data) -> Optional[T]
    async def delete_by_id(self, document_id: str) -> bool
    async def count(self, filter_dict) -> int
    async def aggregate(self, pipeline) -> List[Dict[str, Any]]
```

### User Repository

```python
# app/repositories/user_repository.py
class UserRepository(BaseRepository[User]):
    async def create_user(self, user_create: UserCreate) -> User
    async def find_by_email(self, email: str) -> Optional[User]
    async def find_by_stripe_customer_id(self, stripe_customer_id: str) -> Optional[User]
    async def increment_generations(self, user_id: str) -> Optional[User]
    async def deduct_credits(self, user_id: str, credits: int) -> Optional[User]
    async def add_credits(self, user_id: str, credits: int) -> Optional[User]
    async def get_active_users(self, skip, limit) -> List[User]
```

### Generation Repository

```python
# app/repositories/generation_repository.py
class GenerationRepository(BaseRepository[Generation]):
    async def create_generation(self, generation_create: GenerationCreate) -> Generation
    async def find_by_user(self, user_id: str, skip, limit) -> List[Generation]
    async def find_by_status(self, status: GenerationStatus) -> List[Generation]
    async def mark_as_processing(self, generation_id: str, replicate_id: str) -> Optional[Generation]
    async def mark_as_completed(self, generation_id: str, result_urls, blob_urls) -> Optional[Generation]
    async def mark_as_failed(self, generation_id: str, error_message: str) -> Optional[Generation]
    async def get_user_stats(self, user_id: str) -> GenerationStats
    async def get_pending_generations(self, limit: int) -> List[Generation]
```

---

## Data Models

### User Models

```python
# app/models/user.py
from pydantic import BaseModel, EmailStr

class AuthProvider(str, Enum):
    EMAIL = "email"
    GOOGLE = "google"
    GITHUB = "github"

class SubscriptionTier(str, Enum):
    FREE = "free"
    BASIC = "basic"
    PRO = "pro"
    ENTERPRISE = "enterprise"

class UserCreate(BaseModel):
    email: EmailStr
    password: Optional[str]
    full_name: Optional[str]
    auth_provider: AuthProvider = AuthProvider.EMAIL

class User(BaseModel):
    id: str
    email: EmailStr
    full_name: Optional[str]
    subscription_tier: SubscriptionTier = SubscriptionTier.FREE
    credits_remaining: int = 10
    total_generations: int = 0
    created_at: datetime
```

### Generation Models

```python
# app/models/generation.py
class GenerationStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"

class ModelType(str, Enum):
    STABLE_DIFFUSION_XL = "stable-diffusion-xl"
    STABLE_DIFFUSION_V2 = "stable-diffusion-v2"
    DALLE_3 = "dalle-3"

class GenerationCreate(BaseModel):
    user_id: str
    prompt: str = Field(..., min_length=1, max_length=2000)
    negative_prompt: Optional[str]
    model_type: ModelType = ModelType.STABLE_DIFFUSION_XL
    image_size: ImageSize = ImageSize.SQUARE_1024
    num_images: int = Field(default=1, ge=1, le=4)

class Generation(BaseModel):
    id: str
    user_id: str
    prompt: str
    status: GenerationStatus
    blob_urls: List[str]
    processing_time_ms: Optional[int]
    created_at: datetime
```

---

## Database Service

### MongoDB Service with Retry Logic

```python
# app/services/mongodb_service.py
class MongoDBService:
    def __init__(self, settings: Settings):
        self.settings = settings
        self._client: Optional[AsyncIOMotorClient] = None

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10)
    )
    async def connect(self, connection_string: str) -> None:
        self._client = AsyncIOMotorClient(
            connection_string,
            maxPoolSize=50,
            minPoolSize=10,
            retryWrites=True,
            retryReads=True,
            w="majority"
        )
        await self._client.admin.command('ping')

    async def create_indexes(self) -> None:
        # Create all indexes for optimal query performance
        ...

    async def get_database_stats(self) -> dict:
        # Return database statistics
        ...
```

### Initialization

```python
# In app startup
async def startup():
    # Get connection string from Key Vault using Managed Identity
    keyvault_client = azure_clients.keyvault_client
    connection_string = await get_mongodb_connection_string_from_keyvault(
        keyvault_client,
        settings.mongodb_connection_string_secret
    )

    # Initialize MongoDB
    await initialize_mongodb(settings, connection_string)

    # Create indexes
    mongodb = get_mongodb_service()
    await mongodb.create_indexes()
```

---

## Setup Instructions

### 1. Create Azure Cosmos DB Account

```bash
RESOURCE_GROUP="your-rg"
COSMOS_ACCOUNT_NAME="your-cosmos"
DATABASE_NAME="imagegenerator"

# Create Cosmos DB with MongoDB API
az cosmosdb create \
  --name $COSMOS_ACCOUNT_NAME \
  --resource-group $RESOURCE_GROUP \
  --kind MongoDB \
  --server-version 4.2 \
  --default-consistency-level Session

# Create database
az cosmosdb mongodb database create \
  --account-name $COSMOS_ACCOUNT_NAME \
  --resource-group $RESOURCE_GROUP \
  --name $DATABASE_NAME
```

### 2. Store Connection String in Key Vault

```bash
# Get connection string
CONNECTION_STRING=$(az cosmosdb keys list \
  --name $COSMOS_ACCOUNT_NAME \
  --resource-group $RESOURCE_GROUP \
  --type connection-strings \
  --query "connectionStrings[?description=='Primary MongoDB Connection String'].connectionString" \
  --output tsv)

# Store in Key Vault
az keyvault secret set \
  --vault-name $KEY_VAULT_NAME \
  --name mongodb-connection-string \
  --value "$CONNECTION_STRING"
```

### 3. Grant Managed Identity Access

```bash
# Get Container App Principal ID
PRINCIPAL_ID=$(az containerapp show \
  --name $CONTAINER_APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --query identity.principalId \
  --output tsv)

# Grant Key Vault access
az role assignment create \
  --assignee $PRINCIPAL_ID \
  --role "Key Vault Secrets User" \
  --scope /subscriptions/.../providers/Microsoft.KeyVault/vaults/$KEY_VAULT_NAME
```

### 4. Initialize Database

```bash
# Run initialization script
python scripts/init_database.py
```

This creates all collections and indexes automatically.

---

## Usage Examples

### User Operations

```python
from app.repositories.user_repository import UserRepository
from app.services.mongodb_service import get_mongodb_service

# Get repository
mongodb = get_mongodb_service()
user_repo = UserRepository(mongodb.get_collection("users"))

# Create user
user = await user_repo.create_user(UserCreate(
    email="user@example.com",
    password="securepassword",
    full_name="John Doe"
))

# Find by email
user = await user_repo.find_by_email("user@example.com")

# Deduct credits
user = await user_repo.deduct_credits(user.id, credits=1)

# Increment generation count
user = await user_repo.increment_generations(user.id)
```

### Generation Operations

```python
from app.repositories.generation_repository import GenerationRepository

gen_repo = GenerationRepository(mongodb.get_collection("generations"))

# Create generation
generation = await gen_repo.create_generation(GenerationCreate(
    user_id=user.id,
    prompt="A beautiful sunset over mountains",
    model_type=ModelType.STABLE_DIFFUSION_XL
))

# Mark as processing
generation = await gen_repo.mark_as_processing(
    generation.id,
    replicate_prediction_id="pred_abc123"
)

# Mark as completed
generation = await gen_repo.mark_as_completed(
    generation.id,
    result_urls=["https://replicate.delivery/..."],
    blob_urls=["https://storage.blob.core.windows.net/..."]
)

# Get user stats
stats = await gen_repo.get_user_stats(user.id)
print(f"Total: {stats.total_generations}, Completed: {stats.completed_generations}")
```

### Subscription Operations

```python
from app.repositories.subscription_repository import SubscriptionRepository

sub_repo = SubscriptionRepository(mongodb.get_collection("subscriptions"))

# Create subscription
subscription = await sub_repo.create_subscription(SubscriptionCreate(
    user_id=user.id,
    plan=SubscriptionPlan.PRO,
    stripe_subscription_id="sub_xxx",
    stripe_customer_id="cus_xxx",
    stripe_price_id="price_xxx",
    billing_interval=BillingInterval.MONTHLY,
    credits_per_month=500,
    current_period_end=datetime.utcnow() + timedelta(days=30)
))

# Use credits
subscription = await sub_repo.use_credits(subscription.id, credits=1)

# Reset period usage (at billing cycle renewal)
subscription = await sub_repo.reset_period_usage(subscription.id)
```

---

## Performance Optimization

### 1. **Indexing Strategy**

All queries use indexed fields:

```javascript
// Efficient query (uses index)
db.users.find({ email: "user@example.com" })  // Uses email index

// Efficient query (uses compound index)
db.generations.find({ user_id: "user_123", status: "completed" })  // Uses user_id + status

// Efficient sorting (uses index)
db.generations.find({ status: "pending" }).sort({ created_at: 1 })  // Uses status + created_at
```

### 2. **Connection Pooling**

```python
AsyncIOMotorClient(
    connection_string,
    maxPoolSize=50,      # Maximum 50 connections
    minPoolSize=10,      # Minimum 10 connections
    retryWrites=True,    # Auto-retry writes
    retryReads=True,     # Auto-retry reads
    w="majority"         # Write concern for durability
)
```

### 3. **Query Optimization**

```python
# Use projection to limit returned fields
users = await collection.find(
    {"is_active": True},
    projection={"email": 1, "full_name": 1}
)

# Use pagination
users = await user_repo.find_many(
    filter_dict={"is_active": True},
    skip=0,
    limit=50,
    sort=[("created_at", -1)]
)
```

### 4. **Aggregation Pipeline**

```python
# Efficient aggregation for stats
pipeline = [
    {"$match": {"user_id": user_id}},
    {"$group": {
        "_id": None,
        "total": {"$sum": 1},
        "completed": {"$sum": {"$cond": [{"$eq": ["$status", "completed"]}, 1, 0]}},
        "avg_time": {"$avg": "$processing_time_ms"}
    }}
]
stats = await gen_repo.aggregate(pipeline)
```

---

## Security

### Security Features

✅ **No hardcoded credentials** - Connection string in Key Vault
✅ **Managed Identity** - No passwords for Azure authentication
✅ **Encrypted at rest** - Azure Cosmos DB encryption
✅ **TLS in transit** - All connections encrypted
✅ **Password hashing** - bcrypt with 12 rounds
✅ **TTL auto-cleanup** - Automatic data deletion
✅ **Input validation** - Pydantic models

### Connection String Rotation

```bash
# Regenerate primary key
az cosmosdb keys regenerate \
  --name $COSMOS_ACCOUNT_NAME \
  --resource-group $RESOURCE_GROUP \
  --key-kind primary

# Get new connection string
NEW_CONNECTION_STRING=$(az cosmosdb keys list ...)

# Update Key Vault
az keyvault secret set \
  --vault-name $KEY_VAULT_NAME \
  --name mongodb-connection-string \
  --value "$NEW_CONNECTION_STRING"
```

---

## Monitoring

### Database Metrics

```bash
# Get RU/s consumption
az monitor metrics list \
  --resource $COSMOS_ID \
  --metric TotalRequestUnits \
  --interval PT1H

# Get throttled requests
az monitor metrics list \
  --resource $COSMOS_ID \
  --metric TotalRequests \
  --filter "ResponseStatusCode eq 429"
```

### Database Stats

```python
mongodb = get_mongodb_service()
stats = await mongodb.get_database_stats()

print(f"Database: {stats['database']}")
print(f"Collections: {stats['collections']}")
print(f"Data Size: {stats['data_size_mb']} MB")
print(f"Indexes: {stats['indexes']}")
```

---

## Complete Documentation

For detailed schema and query examples, see:
- [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md) - Complete schema documentation
- [AZURE_RBAC_SETUP.md](AZURE_RBAC_SETUP.md) - RBAC setup guide

---

## Next Steps

1. ✅ Run `scripts/init_database.py` to create indexes
2. ✅ Test CRUD operations
3. ✅ Monitor RU/s consumption
4. ⏭️ Integrate with image generation workflow
