# Google Cloud Platform Deployment Guide

Complete guide for deploying the AI Image Generator platform to Google Cloud Platform (GCP).

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Quick Start](#quick-start)
3. [GCP Services Used](#gcp-services-used)
4. [Deployment Scripts](#deployment-scripts)
5. [Resource Naming](#resource-naming)
6. [Configuration](#configuration)
7. [Step-by-Step Deployment](#step-by-step-deployment)
8. [MongoDB Atlas Setup](#mongodb-atlas-setup)
9. [Verification](#verification)
10. [Troubleshooting](#troubleshooting)
11. [Cost Estimation](#cost-estimation)
12. [Scaling](#scaling)

---

## Prerequisites

### Required Tools

1. **Google Cloud SDK (gcloud)** - version 400.0.0+
   ```bash
   # Install gcloud CLI
   # macOS
   brew install --cask google-cloud-sdk

   # Linux
   curl https://sdk.cloud.google.com | bash

   # Windows
   # Download from https://cloud.google.com/sdk/install
   ```

2. **Docker** - version 20.10+
   ```bash
   # Verify installation
   docker --version
   docker info
   ```

3. **GCP Account**
   - Active Google Cloud account
   - Billing enabled
   - Project Owner or Editor role

### GCP Setup

```bash
# Login to GCP
gcloud auth login

# List projects
gcloud projects list

# Create new project (optional)
gcloud projects create YOUR-PROJECT-ID --name="AI Image Generator"

# Set active project
gcloud config set project YOUR-PROJECT-ID

# Enable billing (required)
# Visit: https://console.cloud.google.com/billing

# Verify configuration
gcloud config list
```

### External Services Setup

1. **MongoDB Atlas** (Database)
   - Sign up at https://www.mongodb.com/cloud/atlas
   - Create M0 free tier cluster
   - Get connection string

2. **Replicate** (AI Image Generation)
   - Sign up at https://replicate.com
   - Get API token from https://replicate.com/account/api-tokens

3. **Stripe** (Payments)
   - Sign up at https://stripe.com
   - Get keys from https://dashboard.stripe.com/apikeys

4. **Google OAuth** (Authentication)
   - Go to GCP Console > APIs & Services > Credentials
   - Create OAuth 2.0 Client ID
   - Add authorized redirect URIs

---

## Quick Start

### 1. Configure Environment

```bash
cd infrastructure

# Copy configuration template
cp deploy-gcp-config.env deploy-gcp-config.template

# Edit configuration
nano deploy-gcp-config.env
```

Fill in required values:
```bash
GCP_PROJECT_ID=your-project-id
GCP_REGION=us-central1
ENVIRONMENT=prod

MONGODB_CONNECTION_STRING=mongodb+srv://...
REPLICATE_API_KEY=r8_...
STRIPE_SECRET_KEY=sk_live_...
GOOGLE_OAUTH_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_OAUTH_CLIENT_SECRET=GOCSPX-...
```

### 2. Deploy Infrastructure

```bash
# Make scripts executable
chmod +x *-gcp.sh

# Run deployment (15-20 minutes)
./deploy-gcp.sh
```

### 3. Build and Deploy Applications

```bash
# Build Docker images and deploy to Cloud Run
./build-and-deploy-gcp.sh
```

### 4. Verify Deployment

```bash
# Check all resources and test endpoints
./verify-gcp.sh
```

### 5. Update Frontend

```bash
# Get backend URL
source gcp-deployment-outputs.txt

# Update frontend .env.local
echo "NEXT_PUBLIC_API_URL=$BACKEND_URL" >> ../frontend/.env.local
```

---

## GCP Services Used

| Service | Purpose | Alternative |
|---------|---------|-------------|
| **Cloud Run** | Backend & Worker containers | App Engine, GKE |
| **Artifact Registry** | Docker image storage | Container Registry (deprecated) |
| **Cloud Storage** | Generated images | Firebase Storage |
| **Memorystore Redis** | Caching & sessions | Cloud Memcache |
| **Cloud Pub/Sub** | Message queue | Cloud Tasks |
| **Secret Manager** | API keys & secrets | Environment variables |
| **VPC Connector** | Cloud Run ↔ Redis | Serverless VPC Access |
| **IAM** | Access control | - |
| **Cloud Build** | Container builds (optional) | Local Docker |
| **Cloud Scheduler** | Cron jobs | Cloud Functions |

**External:**
- **MongoDB Atlas** - Document database (no managed MongoDB on GCP)

---

## Deployment Scripts

### deploy-gcp.sh

Main deployment script that creates all GCP resources.

**Creates:**
- Service Account with IAM roles
- Artifact Registry repository
- Cloud Storage bucket (public read)
- Memorystore Redis instance
- VPC Connector (for Redis access)
- Cloud Pub/Sub topic and subscription
- Secret Manager secrets
- Cloud Run services (backend and worker)
- Cloud Scheduler job (optional)

**Usage:**
```bash
./deploy-gcp.sh
```

**Duration:** 15-20 minutes (Redis takes longest)

**Output:** `gcp-deployment-outputs.txt`

---

### build-and-deploy-gcp.sh

Builds Docker images and deploys to Cloud Run.

**Two build methods:**

1. **Local Docker Build** (build on your machine)
   - Builds images locally
   - Pushes to Artifact Registry
   - Updates Cloud Run services

2. **Cloud Build** (build in the cloud - faster)
   - Uploads source code
   - Builds in GCP
   - Automatically pushes and deploys

**Usage:**
```bash
./build-and-deploy-gcp.sh

# Select method when prompted:
# 1 = Local Docker
# 2 = Cloud Build
```

**Duration:** 5-15 minutes

---

### verify-gcp.sh

Comprehensive verification of all resources.

**Checks:**
- Project configuration
- Service account and IAM roles
- Artifact Registry images
- Storage bucket and objects
- Redis instance status
- VPC Connector
- Pub/Sub topic and subscription
- Secret Manager secrets
- Cloud Run services status
- Backend API health
- Logs (optional)
- Cost estimates

**Usage:**
```bash
./verify-gcp.sh
```

---

### cleanup-gcp.sh

**⚠️ DANGER:** Deletes all GCP resources.

**Deletes:**
- Cloud Run services
- Artifact Registry repository
- Storage bucket and all blobs
- Redis instance
- VPC Connector
- Pub/Sub resources
- Secrets
- Service account

**Usage:**
```bash
./cleanup-gcp.sh

# Requires:
# - Type "DELETE"
# - Type project ID to confirm
```

---

## Resource Naming

All resources follow GCP naming conventions:

| Resource | Naming Pattern | Example |
|----------|----------------|---------|
| Service Account | `{project}-{env}-sa` | `imggen-prod-sa` |
| Artifact Registry | `{project}-{env}` | `imggen-prod` |
| Backend Service | `{project}-backend-{env}` | `imggen-backend-prod` |
| Worker Service | `{project}-worker-{env}` | `imggen-worker-prod` |
| Storage Bucket | `{projectid}-{project}-{env}-images` | `myproject-imggen-prod-images` |
| Redis Instance | `{project}-{env}-redis` | `imggen-prod-redis` |
| Pub/Sub Topic | `{project}-{env}-generations` | `imggen-prod-generations` |
| VPC Connector | `{project}-{env}-connector` | `imggen-prod-connector` |

---

## Configuration

### deploy-gcp-config.env

```bash
################################################################################
# Core Settings
################################################################################

GCP_PROJECT_ID=your-project-id        # Required
GCP_REGION=us-central1                # us-central1, us-east1, etc.
ENVIRONMENT=prod                      # dev, staging, prod
PROJECT_NAME=imggen

################################################################################
# Cloud Run
################################################################################

# Backend
BACKEND_CPU=1                         # 1, 2, 4, 8
BACKEND_MEMORY=1Gi                    # 128Mi-8Gi
BACKEND_MIN_INSTANCES=1               # 0 for scale-to-zero
BACKEND_MAX_INSTANCES=10
BACKEND_CONCURRENCY=80                # Requests per instance

# Worker
WORKER_CPU=1
WORKER_MEMORY=1Gi
WORKER_MIN_INSTANCES=1
WORKER_MAX_INSTANCES=5

################################################################################
# Memorystore Redis
################################################################################

REDIS_TIER=BASIC                      # BASIC or STANDARD_HA
REDIS_MEMORY_SIZE=1                   # GB (1-300)

################################################################################
# MongoDB Atlas (REQUIRED)
################################################################################

MONGODB_CONNECTION_STRING=mongodb+srv://username:password@cluster.mongodb.net/image_generator

################################################################################
# External APIs (REQUIRED)
################################################################################

REPLICATE_API_KEY=r8_xxxxx
STRIPE_SECRET_KEY=sk_live_xxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxx
GOOGLE_OAUTH_CLIENT_ID=xxxxx.apps.googleusercontent.com
GOOGLE_OAUTH_CLIENT_SECRET=GOCSPX-xxxxx
```

### Environment Variables

Variables available to Cloud Run services:

| Variable | Description | Source |
|----------|-------------|--------|
| `ENVIRONMENT` | Deployment environment | Config |
| `GCP_PROJECT_ID` | GCP project ID | Config |
| `STORAGE_BUCKET_NAME` | Storage bucket | Config |
| `PUBSUB_TOPIC_NAME` | Pub/Sub topic | Config |
| `REDIS_HOST` | Redis host | Auto-detected |
| `REDIS_PORT` | Redis port | Auto-detected |
| `MONGODB_CONNECTION_STRING` | MongoDB connection | Secret Manager |
| `REPLICATE_API_TOKEN` | Replicate API key | Secret Manager |
| `STRIPE_SECRET_KEY` | Stripe secret | Secret Manager |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook | Secret Manager |
| `GOOGLE_OAUTH_CLIENT_ID` | OAuth client ID | Secret Manager |
| `GOOGLE_OAUTH_CLIENT_SECRET` | OAuth secret | Secret Manager |

---

## Step-by-Step Deployment

### Step 1: Enable APIs (2-3 minutes)

```bash
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  pubsub.googleapis.com \
  redis.googleapis.com \
  secretmanager.googleapis.com \
  storage.googleapis.com \
  iam.googleapis.com \
  compute.googleapis.com \
  vpcaccess.googleapis.com
```

---

### Step 2: Create Service Account

```bash
gcloud iam service-accounts create imggen-prod-sa \
  --display-name="Image Generator Production"

# Grant roles
SA_EMAIL=imggen-prod-sa@PROJECT_ID.iam.gserviceaccount.com

gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:$SA_EMAIL" \
  --role="roles/storage.objectAdmin"

gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:$SA_EMAIL" \
  --role="roles/pubsub.publisher"

gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:$SA_EMAIL" \
  --role="roles/secretmanager.secretAccessor"
```

---

### Step 3: Create Artifact Registry

```bash
gcloud artifacts repositories create imggen-prod \
  --repository-format=docker \
  --location=us-central1 \
  --description="Image Generator containers"

# Configure Docker auth
gcloud auth configure-docker us-central1-docker.pkg.dev
```

---

### Step 4: Create Cloud Storage Bucket

```bash
gcloud storage buckets create gs://PROJECT_ID-imggen-prod-images \
  --location=us-central1 \
  --uniform-bucket-level-access

# Enable public access
gcloud storage buckets add-iam-policy-binding gs://PROJECT_ID-imggen-prod-images \
  --member=allUsers \
  --role=roles/storage.objectViewer
```

---

### Step 5: Create Memorystore Redis (5-10 minutes)

```bash
gcloud redis instances create imggen-prod-redis \
  --region=us-central1 \
  --tier=BASIC \
  --size=1 \
  --redis-version=redis_6_x \
  --network=default
```

**Note:** Redis takes 5-10 minutes to provision.

---

### Step 6: Create VPC Connector (3-5 minutes)

Required for Cloud Run to access Redis on VPC.

```bash
gcloud compute networks vpc-access connectors create imggen-prod-connector \
  --region=us-central1 \
  --network=default \
  --range=10.8.0.0/28 \
  --min-instances=2 \
  --max-instances=3
```

---

### Step 7: Create Cloud Pub/Sub

```bash
# Create topic
gcloud pubsub topics create imggen-prod-generations

# Create subscription
gcloud pubsub subscriptions create imggen-prod-worker-sub \
  --topic=imggen-prod-generations \
  --ack-deadline=300 \
  --message-retention-duration=7d
```

---

### Step 8: Create Secrets

```bash
# MongoDB
echo -n "mongodb+srv://..." | \
  gcloud secrets create mongodb-connection-string --data-file=-

# Replicate
echo -n "r8_xxxxx" | \
  gcloud secrets create replicate-api-key --data-file=-

# Stripe
echo -n "sk_live_xxxxx" | \
  gcloud secrets create stripe-secret-key --data-file=-

echo -n "whsec_xxxxx" | \
  gcloud secrets create stripe-webhook-secret --data-file=-

# Google OAuth
echo -n "xxxxx.apps.googleusercontent.com" | \
  gcloud secrets create google-oauth-client-id --data-file=-

echo -n "GOCSPX-xxxxx" | \
  gcloud secrets create google-oauth-client-secret --data-file=-
```

---

### Step 9: Deploy Backend to Cloud Run

```bash
gcloud run deploy imggen-backend-prod \
  --image=us-central1-docker.pkg.dev/PROJECT_ID/imggen-prod/backend:latest \
  --region=us-central1 \
  --platform=managed \
  --service-account=imggen-prod-sa@PROJECT_ID.iam.gserviceaccount.com \
  --allow-unauthenticated \
  --cpu=1 \
  --memory=1Gi \
  --min-instances=1 \
  --max-instances=10 \
  --port=8000 \
  --timeout=300 \
  --vpc-connector=imggen-prod-connector \
  --set-env-vars=ENVIRONMENT=prod \
  --set-secrets=MONGODB_CONNECTION_STRING=mongodb-connection-string:latest
```

---

### Step 10: Deploy Worker to Cloud Run

```bash
gcloud run deploy imggen-worker-prod \
  --image=us-central1-docker.pkg.dev/PROJECT_ID/imggen-prod/worker:latest \
  --region=us-central1 \
  --platform=managed \
  --service-account=imggen-prod-sa@PROJECT_ID.iam.gserviceaccount.com \
  --no-allow-unauthenticated \
  --cpu=1 \
  --memory=1Gi \
  --min-instances=1 \
  --max-instances=5 \
  --timeout=3600 \
  --vpc-connector=imggen-prod-connector \
  --set-secrets=MONGODB_CONNECTION_STRING=mongodb-connection-string:latest
```

---

## MongoDB Atlas Setup

GCP doesn't have a managed MongoDB service. Use MongoDB Atlas:

### 1. Create Account

Go to https://www.mongodb.com/cloud/atlas and sign up.

### 2. Create Cluster

1. Click "Build a Database"
2. Choose **M0 Free Tier** (or paid tier for production)
3. Select **Google Cloud** provider
4. Choose same region as your GCP deployment (e.g., us-central1)
5. Name your cluster

### 3. Create Database User

1. Go to Database Access
2. Add New Database User
3. Authentication Method: Password
4. Username: `imggen`
5. Password: Generate secure password
6. Database User Privileges: Read and write to any database

### 4. Configure Network Access

1. Go to Network Access
2. Add IP Address
3. Allow access from anywhere: `0.0.0.0/0`
   - **Production:** Restrict to Cloud Run IP ranges

### 5. Get Connection String

1. Click "Connect" on your cluster
2. Choose "Connect your application"
3. Driver: **Node.js** or **Python**
4. Copy connection string:
   ```
   mongodb+srv://imggen:<password>@cluster0.xxxxx.mongodb.net/image_generator?retryWrites=true&w=majority
   ```
5. Replace `<password>` with your database password
6. Add database name: `/image_generator`

### 6. Update Configuration

```bash
# Update deploy-gcp-config.env
MONGODB_CONNECTION_STRING=mongodb+srv://imggen:PASSWORD@cluster0.xxxxx.mongodb.net/image_generator

# Update secret
echo -n "$MONGODB_CONNECTION_STRING" | \
  gcloud secrets versions add mongodb-connection-string --data-file=-

# Redeploy services to pick up new secret
gcloud run services update imggen-backend-prod --region=us-central1
```

### 7. Create Collections

Collections will be auto-created by the application, or manually create:

```javascript
// In MongoDB Atlas > Browse Collections > Create Database

Database: image_generator

Collections:
- users
- generations
- subscriptions
```

---

## Verification

### Check All Resources

```bash
# Run verification script
./verify-gcp.sh
```

### Manual Checks

```bash
# List Cloud Run services
gcloud run services list

# Get backend URL
gcloud run services describe imggen-backend-prod \
  --region=us-central1 \
  --format="value(status.url)"

# Test health endpoint
BACKEND_URL=$(gcloud run services describe imggen-backend-prod --region=us-central1 --format="value(status.url)")
curl $BACKEND_URL/health

# View API docs
open $BACKEND_URL/docs

# Check Redis
gcloud redis instances describe imggen-prod-redis --region=us-central1

# Check Pub/Sub
gcloud pubsub topics list
gcloud pubsub subscriptions list

# List secrets
gcloud secrets list
```

### View Logs

```bash
# Backend logs (tail)
gcloud run logs tail imggen-backend-prod --project=PROJECT_ID

# Worker logs (tail)
gcloud run logs tail imggen-worker-prod --project=PROJECT_ID

# Last 50 lines
gcloud run logs read imggen-backend-prod --limit=50

# Filter by severity
gcloud run logs read imggen-backend-prod --limit=20 --log-filter="severity>=ERROR"
```

---

## Troubleshooting

### 1. Service Won't Start

**Check logs:**
```bash
gcloud run logs read imggen-backend-prod --limit=50
```

**Common issues:**
- Missing environment variables
- Invalid MongoDB connection string
- Secrets not accessible
- Port mismatch (must be 8000)

**Fix:**
```bash
# Update environment variables
gcloud run services update imggen-backend-prod \
  --region=us-central1 \
  --update-env-vars=NEW_VAR=value

# Update secrets
gcloud run services update imggen-backend-prod \
  --region=us-central1 \
  --update-secrets=MONGODB_CONNECTION_STRING=mongodb-connection-string:latest
```

---

### 2. Redis Connection Errors

**Problem:** Cannot connect to Redis from Cloud Run

**Solution:** Check VPC Connector

```bash
# Verify connector exists
gcloud compute networks vpc-access connectors describe imggen-prod-connector --region=us-central1

# Verify Cloud Run uses connector
gcloud run services describe imggen-backend-prod \
  --region=us-central1 \
  --format="value(spec.template.spec.vpcAccess.connector)"

# If missing, add connector
gcloud run services update imggen-backend-prod \
  --region=us-central1 \
  --vpc-connector=imggen-prod-connector
```

---

### 3. 403 Forbidden / Permission Denied

**Problem:** Service account lacks permissions

**Solution:** Grant IAM roles

```bash
SA_EMAIL=imggen-prod-sa@PROJECT_ID.iam.gserviceaccount.com

# Grant storage access
gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:$SA_EMAIL" \
  --role="roles/storage.objectAdmin"

# Grant secret access
gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:$SA_EMAIL" \
  --role="roles/secretmanager.secretAccessor"

# Grant Pub/Sub access
gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:$SA_EMAIL" \
  --role="roles/pubsub.publisher"
```

---

### 4. MongoDB Connection Timeout

**Check:**
1. Connection string format
2. Password correctness (no special chars in URL)
3. Database name included
4. Network whitelist (0.0.0.0/0)

**Test connection:**
```bash
# From Cloud Shell
mongosh "mongodb+srv://..."
```

**Correct format:**
```
mongodb+srv://username:password@cluster.mongodb.net/image_generator?retryWrites=true&w=majority
```

---

### 5. Image Build Fails

**Docker build error:**
```bash
# Clear cache
docker system prune -a

# Build with verbose output
docker build --no-cache --progress=plain .
```

**Cloud Build error:**
```bash
# Check build logs
gcloud builds log BUILD_ID

# Increase timeout
gcloud builds submit --timeout=30m
```

---

### 6. Storage Upload Fails

**Problem:** Cannot upload images to bucket

**Check permissions:**
```bash
# Grant service account storage admin
gsutil iam ch serviceAccount:SA_EMAIL:roles/storage.objectAdmin gs://BUCKET_NAME
```

**Test upload:**
```bash
echo "test" > test.txt
gcloud storage cp test.txt gs://BUCKET_NAME/
gcloud storage ls gs://BUCKET_NAME/
```

---

## Cost Estimation

### Monthly Costs (USD)

| Service | Configuration | Cost |
|---------|--------------|------|
| Cloud Run (Backend) | 1 vCPU, 1GB RAM, 1M requests | $20-100 |
| Cloud Run (Worker) | 1 vCPU, 1GB RAM, 100K requests | $10-50 |
| Memorystore Redis | BASIC, 1GB | $35 |
| Cloud Storage | 100GB | $2 |
| Cloud Pub/Sub | 10GB messages | $0.40 |
| Artifact Registry | 5GB images | $0.50 |
| Secret Manager | 10 secrets | $0.36 |
| VPC Connector | Always-on | $8 |
| Cloud Build | 120 min/month | $0 (free tier) |
| **Total (minimum)** | Low traffic | **~$75-95/month** |
| **Total (production)** | Medium traffic | **~$150-300/month** |

### Free Tier

- Cloud Run: 2 million requests/month
- Cloud Storage: 5GB storage
- Cloud Pub/Sub: 10GB messages/month
- Secret Manager: 6 secrets
- Cloud Build: 120 build-minutes/day

### Cost Optimization

1. **Scale to zero** (set min instances = 0)
   ```bash
   gcloud run services update imggen-backend-prod --min-instances=0
   ```

2. **Use BASIC Redis** (not STANDARD_HA)

3. **Reduce memory/CPU** for dev
   ```bash
   BACKEND_CPU=0.5
   BACKEND_MEMORY=512Mi
   ```

4. **Use Cloud Build** (free tier) instead of local builds

5. **Set lifecycle policies** on storage
   ```bash
   gsutil lifecycle set lifecycle.json gs://BUCKET_NAME
   ```

---

## Scaling

### Auto-Scaling

Cloud Run auto-scales based on:
- CPU utilization
- Concurrency (requests per instance)

```bash
# Update scaling limits
gcloud run services update imggen-backend-prod \
  --region=us-central1 \
  --min-instances=2 \
  --max-instances=20 \
  --concurrency=100
```

### Increase Resources

```bash
# More CPU and memory
gcloud run services update imggen-backend-prod \
  --region=us-central1 \
  --cpu=2 \
  --memory=2Gi
```

### Scale Redis

```bash
# Upgrade to STANDARD_HA (high availability)
gcloud redis instances update imggen-prod-redis \
  --region=us-central1 \
  --size=5
```

### Production Recommendations

```bash
# Backend
BACKEND_CPU=2
BACKEND_MEMORY=2Gi
BACKEND_MIN_INSTANCES=2
BACKEND_MAX_INSTANCES=50
BACKEND_CONCURRENCY=100

# Redis
REDIS_TIER=STANDARD_HA
REDIS_MEMORY_SIZE=5
```

**Estimated cost:** $300-600/month

---

## Custom Domain

```bash
# Map custom domain
gcloud run domain-mappings create \
  --service=imggen-backend-prod \
  --domain=api.yourdomain.com \
  --region=us-central1

# Add DNS records (shown in output)
# CNAME: api.yourdomain.com -> ghs.googlehosted.com
```

---

## Monitoring

```bash
# View metrics in Console
https://console.cloud.google.com/run/detail/us-central1/imggen-backend-prod/metrics

# Set up alerts
gcloud alpha monitoring policies create \
  --notification-channels=CHANNEL_ID \
  --display-name="Cloud Run Error Rate" \
  --condition-threshold-value=0.05 \
  --condition-threshold-duration=300s
```

---

## Additional Resources

- [Cloud Run Documentation](https://cloud.google.com/run/docs)
- [Artifact Registry](https://cloud.google.com/artifact-registry/docs)
- [Memorystore Redis](https://cloud.google.com/memorystore/docs/redis)
- [Secret Manager](https://cloud.google.com/secret-manager/docs)
- [GCP Pricing Calculator](https://cloud.google.com/products/calculator)

---

**Last Updated:** 2025-01-08

**Version:** 1.0.0
