# Database Schema Documentation

## Azure Cosmos DB for MongoDB API

This document describes the complete database schema for the ImageGenerator application using Azure Cosmos DB with MongoDB API.

---

## Collections Overview

| Collection | Purpose | Partition Strategy | TTL |
|------------|---------|-------------------|-----|
| `users` | User profiles and authentication | None | No |
| `generations` | Image generation history | None | Optional (failed after 30 days) |
| `subscriptions` | Subscription and billing data | None | No |
| `usage_logs` | Activity and analytics tracking | None | 90 days |
| `rate_limit_logs` | Rate limiting tracking | None | 1 hour |

---

## 1. Users Collection

### Purpose
Stores user account information, authentication data, subscription details, and usage statistics.

### Schema

```javascript
{
  "id": "user_abc123",                    // Unique user ID
  "email": "user@example.com",            // User email (unique)
  "full_name": "John Doe",                // Full name
  "avatar_url": "https://...",            // Profile avatar URL

  // Authentication
  "auth_provider": "email|google|github|microsoft",
  "auth_provider_id": "oauth_provider_id", // OAuth provider user ID
  "hashed_password": "bcrypt_hash",        // Hashed password (for email auth)

  // Status
  "is_active": true,                       // Account active status
  "is_verified": false,                    // Email verified status

  // Subscription
  "subscription_tier": "free|basic|pro|enterprise",
  "stripe_customer_id": "cus_abc123",     // Stripe customer ID
  "subscription_expires_at": ISODate(),    // Subscription expiration

  // Usage tracking
  "credits_remaining": 10,                 // Available credits
  "total_generations": 0,                  // Total images generated
  "last_generation_at": ISODate(),         // Last generation timestamp

  // Settings
  "settings": {
    "email_notifications": true,
    "default_model": "stable-diffusion-xl",
    "theme": "light"
  },

  // Timestamps
  "created_at": ISODate(),
  "updated_at": ISODate(),
  "last_login_at": ISODate()
}
```

### Indexes

```javascript
db.users.createIndex({ "email": 1 }, { unique: true })
db.users.createIndex({ "auth_provider_id": 1 })
db.users.createIndex({ "stripe_customer_id": 1 }, { sparse: true })
db.users.createIndex({ "created_at": -1 })
db.users.createIndex({ "is_active": 1 })
db.users.createIndex({ "subscription_tier": 1, "is_active": 1 })
```

### Queries

```javascript
// Find user by email
db.users.findOne({ "email": "user@example.com" })

// Find user by OAuth provider
db.users.findOne({
  "auth_provider": "google",
  "auth_provider_id": "123456"
})

// Find active users by tier
db.users.find({
  "subscription_tier": "pro",
  "is_active": true
})

// Get users with low credits
db.users.find({
  "credits_remaining": { $lt: 5 },
  "subscription_tier": "free"
})
```

---

## 2. Generations Collection

### Purpose
Stores image generation requests, status, results, and metadata.

### Schema

```javascript
{
  "id": "gen_xyz789",                      // Unique generation ID
  "user_id": "user_abc123",                // User who created this

  // Request parameters
  "prompt": "A beautiful sunset over mountains",
  "negative_prompt": "blurry, low quality",
  "model_type": "stable-diffusion-xl",
  "image_size": "1024x1024",
  "num_images": 1,
  "guidance_scale": 7.5,
  "num_inference_steps": 50,
  "seed": 12345,

  // Status tracking
  "status": "pending|processing|completed|failed|cancelled",

  // Replicate API integration
  "replicate_prediction_id": "pred_abc123", // Replicate prediction ID (unique)
  "replicate_version": "version_id",        // Model version used

  // Results
  "result_urls": [                          // Temporary URLs from Replicate
    "https://replicate.delivery/..."
  ],
  "blob_urls": [                            // Permanent Azure Blob URLs
    "https://storage.blob.core.windows.net/..."
  ],

  // Metadata
  "error_message": null,                    // Error if failed
  "processing_time_ms": 5000,               // Processing duration
  "cost_credits": 1,                        // Credits consumed

  // Timestamps
  "created_at": ISODate(),                  // Request created
  "updated_at": ISODate(),                  // Last updated
  "started_at": ISODate(),                  // Processing started
  "completed_at": ISODate()                 // Processing completed
}
```

### Indexes

```javascript
db.generations.createIndex({ "user_id": 1, "created_at": -1 })
db.generations.createIndex({ "status": 1 })
db.generations.createIndex({ "replicate_prediction_id": 1 }, { unique: true, sparse: true })
db.generations.createIndex({ "user_id": 1, "status": 1 })
db.generations.createIndex({ "created_at": -1 })
db.generations.createIndex({ "status": 1, "created_at": 1 })  // Processing queue
db.generations.createIndex({ "model_type": 1 })
```

### Queries

```javascript
// Get user's generations
db.generations.find({
  "user_id": "user_abc123"
}).sort({ "created_at": -1 })

// Get pending generations for processing (FIFO)
db.generations.find({
  "status": "pending"
}).sort({ "created_at": 1 }).limit(10)

// Get stuck generations (processing > 30 min)
db.generations.find({
  "status": "processing",
  "started_at": { $lt: new Date(Date.now() - 30*60*1000) }
})

// Get user stats
db.generations.aggregate([
  { $match: { "user_id": "user_abc123" } },
  { $group: {
    _id: null,
    total: { $sum: 1 },
    completed: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } },
    avg_time: { $avg: "$processing_time_ms" }
  }}
])
```

---

## 3. Subscriptions Collection

### Purpose
Stores subscription and billing information, integrated with Stripe.

### Schema

```javascript
{
  "id": "sub_def456",                      // Unique subscription ID
  "user_id": "user_abc123",                // User ID (unique)

  // Plan details
  "plan": "free|basic|pro|enterprise",
  "status": "active|cancelled|past_due|expired|trialing",

  // Stripe integration
  "stripe_subscription_id": "sub_stripe123", // Stripe subscription ID (unique)
  "stripe_customer_id": "cus_stripe123",     // Stripe customer ID
  "stripe_price_id": "price_stripe123",      // Stripe price ID

  // Billing
  "billing_interval": "monthly|yearly",
  "credits_per_month": 500,                  // Monthly credit allocation
  "credits_used_this_period": 150,           // Credits used in current period

  // Billing cycle
  "current_period_start": ISODate(),
  "current_period_end": ISODate(),
  "cancel_at_period_end": false,
  "cancelled_at": null,

  // Trial
  "trial_start": ISODate(),
  "trial_end": ISODate(),

  // Timestamps
  "created_at": ISODate(),
  "updated_at": ISODate()
}
```

### Indexes

```javascript
db.subscriptions.createIndex({ "user_id": 1 }, { unique: true })
db.subscriptions.createIndex({ "stripe_subscription_id": 1 }, { unique: true })
db.subscriptions.createIndex({ "stripe_customer_id": 1 })
db.subscriptions.createIndex({ "status": 1, "current_period_end": 1 })
db.subscriptions.createIndex({ "current_period_end": 1 })
db.subscriptions.createIndex({ "plan": 1, "status": 1 })
```

### Queries

```javascript
// Find subscription by user
db.subscriptions.findOne({ "user_id": "user_abc123" })

// Find expiring subscriptions (next 7 days)
db.subscriptions.find({
  "status": "active",
  "current_period_end": {
    $gte: new Date(),
    $lte: new Date(Date.now() + 7*24*60*60*1000)
  }
})

// Count active subscriptions by plan
db.subscriptions.aggregate([
  { $match: { "status": "active" } },
  { $group: { _id: "$plan", count: { $sum: 1 } } }
])
```

---

## 4. Usage Logs Collection

### Purpose
Tracks user activity for analytics and rate limiting. Auto-deletes after 90 days.

### Schema

```javascript
{
  "id": "log_ghi789",                      // Unique log ID
  "user_id": "user_abc123",                // User ID

  // Action details
  "action_type": "image_generation|api_request|file_upload|file_download|subscription_change|login|logout",
  "resource_id": "gen_xyz789",             // Related resource (generation_id, etc.)

  // Request details
  "ip_address": "192.168.1.1",
  "user_agent": "Mozilla/5.0...",

  // Metadata
  "metadata": {                            // Additional context
    "model": "stable-diffusion-xl",
    "endpoint": "/api/v1/generations"
  },

  // Metrics
  "credits_used": 1,                       // Credits consumed
  "response_time_ms": 5000,                // Response time
  "status_code": 200,                      // HTTP status code

  // Timestamps
  "created_at": ISODate(),
  "expires_at": ISODate()                  // TTL (90 days from created_at)
}
```

### Indexes

```javascript
db.usage_logs.createIndex({ "user_id": 1, "created_at": -1 })
db.usage_logs.createIndex({ "action_type": 1 })
db.usage_logs.createIndex({ "user_id": 1, "action_type": 1 })
db.usage_logs.createIndex({ "resource_id": 1 }, { sparse: true })
db.usage_logs.createIndex({ "user_id": 1, "action_type": 1, "created_at": -1 })
db.usage_logs.createIndex({ "expires_at": 1 }, { expireAfterSeconds: 0 })  // TTL
```

### Queries

```javascript
// Get user activity for last 30 days
db.usage_logs.find({
  "user_id": "user_abc123",
  "created_at": { $gte: new Date(Date.now() - 30*24*60*60*1000) }
}).sort({ "created_at": -1 })

// Count API requests in last hour (rate limiting)
db.usage_logs.countDocuments({
  "user_id": "user_abc123",
  "action_type": "api_request",
  "created_at": { $gte: new Date(Date.now() - 60*60*1000) }
})

// Daily usage stats
db.usage_logs.aggregate([
  { $match: {
    "created_at": { $gte: new Date(Date.now() - 7*24*60*60*1000) }
  }},
  { $group: {
    _id: { $dateToString: { format: "%Y-%m-%d", date: "$created_at" } },
    total: { $sum: 1 },
    unique_users: { $addToSet: "$user_id" }
  }}
])
```

---

## 5. Rate Limit Logs Collection

### Purpose
Temporary storage for rate limiting windows. Auto-deletes after 1 hour.

### Schema

```javascript
{
  "id": "rate_jkl012",                     // Unique rate limit log ID
  "user_id": "user_abc123",                // User ID
  "endpoint": "/api/v1/generations",       // API endpoint

  // Rate limit tracking
  "request_count": 50,                     // Requests in current window
  "window_start": ISODate(),               // Window start time
  "window_end": ISODate(),                 // Window end time

  // Status
  "last_request_at": ISODate(),
  "is_blocked": false,                     // Currently blocked?

  // TTL
  "expires_at": ISODate()                  // Expiration (1 hour)
}
```

### Indexes

```javascript
db.rate_limit_logs.createIndex({ "user_id": 1, "endpoint": 1 })
db.rate_limit_logs.createIndex({ "window_end": 1 })
db.rate_limit_logs.createIndex({ "user_id": 1, "endpoint": 1, "window_end": 1 })
db.rate_limit_logs.createIndex({ "expires_at": 1 }, { expireAfterSeconds: 0 })  // TTL
```

---

## Performance Optimization Guidelines

### 1. Partition Key Strategy
- For this workload, we don't use sharding as data volume is moderate
- If scaling beyond 10TB, consider sharding by `user_id`

### 2. Index Guidelines
- Keep indexes minimal (currently 5-7 per collection)
- Monitor index usage with `db.collection.aggregate([{ $indexStats: {} }])`
- Remove unused indexes

### 3. Query Optimization
- Always use indexed fields in queries
- Use `.explain()` to analyze query performance
- Use projection to limit returned fields
- Implement pagination with `skip()` and `limit()`

### 4. TTL for Auto-Cleanup
- `usage_logs`: 90-day retention
- `rate_limit_logs`: 1-hour retention
- Consider archiving old data to Azure Blob Storage

### 5. Connection Pooling
- Motor default: 100 connections
- Configured in `mongodb_service.py`:
  - `maxPoolSize`: 50
  - `minPoolSize`: 10

### 6. Read/Write Concerns
- Write concern: `majority` (data durability)
- Read preference: `primaryPreferred` (performance + consistency)

---

## Data Migration Strategy

### Initial Setup
1. Run `scripts/init_database.py` to create collections and indexes
2. Verify with MongoDB Compass or `mongosh`

### Schema Changes
1. MongoDB is schema-less, but maintain Pydantic models
2. Add new fields with default values
3. Create migration scripts in `scripts/migrations/`
4. Version migrations: `001_add_field.py`, `002_rename_field.py`

### Backup Strategy
1. Azure Cosmos DB automatic backups (continuous)
2. Point-in-time restore available
3. Export collections: `mongoexport --uri="..." --collection=users --out=users.json`

---

## Security Best Practices

### 1. Connection Security
- Always use TLS (enforced by Azure Cosmos DB)
- Store connection string in Azure Key Vault
- Use Managed Identity for Key Vault access
- Never commit connection strings to Git

### 2. RBAC Roles
- Application: `MongoDB Data Contributor`
- Read-only analytics: `MongoDB Data Reader`
- Admin: `DocumentDB Account Contributor`

### 3. Data Encryption
- Encryption at rest: Enabled by default
- Encryption in transit: TLS 1.2+

### 4. Sensitive Data
- Hash passwords with bcrypt (rounds=12)
- Never store plain-text passwords
- Redact sensitive fields in logs
- Use Azure Key Vault for API keys

---

## Monitoring and Alerts

### Key Metrics
1. Request Units (RU/s) consumption
2. Query latency (p50, p95, p99)
3. Index usage efficiency
4. Connection pool utilization
5. TTL cleanup lag

### Alerts
- RU/s throttling (429 errors)
- Query latency > 100ms (p95)
- Connection pool exhaustion
- Database size > 80% of quota

### Tools
- Azure Monitor for Cosmos DB
- Application Insights
- MongoDB Compass (development)
- `mongosh` (CLI)
