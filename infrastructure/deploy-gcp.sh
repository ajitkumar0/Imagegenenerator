#!/bin/bash

################################################################################
# Google Cloud Platform Deployment Script
#
# This script deploys the complete infrastructure for the AI Image Generator
# platform on GCP, including:
# - Project setup and APIs
# - Artifact Registry (container images)
# - Cloud Run (backend and worker services)
# - MongoDB Atlas (via marketplace or manual setup)
# - Cloud Storage (generated images)
# - Memorystore Redis (caching)
# - Cloud Pub/Sub (message queue)
# - Secret Manager (secrets storage)
# - Cloud SQL (optional, for PostgreSQL)
# - Service Accounts & IAM roles
################################################################################

set -e  # Exit on error
set -u  # Exit on undefined variable

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

show_progress() {
    echo -e "${BLUE}==>${NC} $1"
}

################################################################################
# Configuration Variables
################################################################################

# Load configuration from file if exists
if [ -f "deploy-gcp-config.env" ]; then
    log_info "Loading configuration from deploy-gcp-config.env"
    source deploy-gcp-config.env
else
    log_warning "No deploy-gcp-config.env found, using default values"
fi

# Core Settings
ENVIRONMENT="${ENVIRONMENT:-prod}"
PROJECT_ID="${GCP_PROJECT_ID:-}"
REGION="${GCP_REGION:-us-central1}"
PROJECT_NAME="${PROJECT_NAME:-imggen}"

# Resource Naming (GCP conventions)
SERVICE_ACCOUNT_NAME="${PROJECT_NAME}-${ENVIRONMENT}-sa"
ARTIFACT_REGISTRY_REPO="${PROJECT_NAME}-${ENVIRONMENT}"
BACKEND_SERVICE_NAME="${PROJECT_NAME}-backend-${ENVIRONMENT}"
WORKER_SERVICE_NAME="${PROJECT_NAME}-worker-${ENVIRONMENT}"
STORAGE_BUCKET_NAME="${PROJECT_ID}-${PROJECT_NAME}-${ENVIRONMENT}-images"
REDIS_INSTANCE_NAME="${PROJECT_NAME}-${ENVIRONMENT}-redis"
PUBSUB_TOPIC_NAME="${PROJECT_NAME}-${ENVIRONMENT}-generations"
PUBSUB_SUBSCRIPTION_NAME="${PROJECT_NAME}-${ENVIRONMENT}-worker-sub"

# Container Images (will be updated after build)
BACKEND_IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${ARTIFACT_REGISTRY_REPO}/backend:latest"
WORKER_IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${ARTIFACT_REGISTRY_REPO}/worker:latest"

# Cloud Run Settings
BACKEND_CPU="${BACKEND_CPU:-1}"
BACKEND_MEMORY="${BACKEND_MEMORY:-1Gi}"
BACKEND_MIN_INSTANCES="${BACKEND_MIN_INSTANCES:-1}"
BACKEND_MAX_INSTANCES="${BACKEND_MAX_INSTANCES:-10}"
BACKEND_CONCURRENCY="${BACKEND_CONCURRENCY:-80}"

WORKER_CPU="${WORKER_CPU:-1}"
WORKER_MEMORY="${WORKER_MEMORY:-1Gi}"
WORKER_MIN_INSTANCES="${WORKER_MIN_INSTANCES:-1}"
WORKER_MAX_INSTANCES="${WORKER_MAX_INSTANCES:-5}"

# Redis Settings
REDIS_TIER="${REDIS_TIER:-BASIC}"  # BASIC or STANDARD_HA
REDIS_MEMORY_SIZE="${REDIS_MEMORY_SIZE:-1}"  # GB

# MongoDB Settings (Atlas)
MONGODB_CONNECTION_STRING="${MONGODB_CONNECTION_STRING:-}"
MONGODB_DATABASE_NAME="image_generator"

# External Services (must be provided)
REPLICATE_API_KEY="${REPLICATE_API_KEY:-}"
STRIPE_SECRET_KEY="${STRIPE_SECRET_KEY:-}"
STRIPE_WEBHOOK_SECRET="${STRIPE_WEBHOOK_SECRET:-}"
GOOGLE_OAUTH_CLIENT_ID="${GOOGLE_OAUTH_CLIENT_ID:-}"
GOOGLE_OAUTH_CLIENT_SECRET="${GOOGLE_OAUTH_CLIENT_SECRET:-}"

################################################################################
# Validation
################################################################################

validate_config() {
    log_info "Validating configuration..."

    local errors=0

    # Check gcloud CLI
    if ! command -v gcloud &> /dev/null; then
        log_error "gcloud CLI is not installed. Install from: https://cloud.google.com/sdk/install"
        ((errors++))
    fi

    # Check if logged in
    if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" &> /dev/null; then
        log_error "Not logged in to GCP. Run: gcloud auth login"
        ((errors++))
    fi

    # Check project ID
    if [ -z "$PROJECT_ID" ]; then
        log_error "GCP_PROJECT_ID is not set in deploy-gcp-config.env"
        ((errors++))
    fi

    # Validate required external secrets
    if [ -z "$REPLICATE_API_KEY" ]; then
        log_warning "REPLICATE_API_KEY is not set. Required for image generation."
        ((errors++))
    fi

    if [ -z "$STRIPE_SECRET_KEY" ]; then
        log_warning "STRIPE_SECRET_KEY is not set. Required for payments."
        ((errors++))
    fi

    if [ -z "$MONGODB_CONNECTION_STRING" ]; then
        log_warning "MONGODB_CONNECTION_STRING is not set. You'll need to set up MongoDB Atlas manually."
    fi

    if [ $errors -gt 0 ]; then
        log_error "Configuration validation failed with $errors error(s)"
        exit 1
    fi

    log_success "Configuration validation passed"
}

################################################################################
# Step 1: Enable Required APIs
################################################################################

enable_apis() {
    show_progress "Step 1/12: Enabling Required GCP APIs"

    log_info "Setting active project: $PROJECT_ID"
    gcloud config set project "$PROJECT_ID"

    log_info "Enabling required APIs (this may take 2-3 minutes)..."

    local apis=(
        "run.googleapis.com"                    # Cloud Run
        "artifactregistry.googleapis.com"       # Artifact Registry
        "cloudbuild.googleapis.com"             # Cloud Build
        "pubsub.googleapis.com"                 # Pub/Sub
        "redis.googleapis.com"                  # Memorystore Redis
        "secretmanager.googleapis.com"          # Secret Manager
        "storage.googleapis.com"                # Cloud Storage
        "iam.googleapis.com"                    # IAM
        "cloudresourcemanager.googleapis.com"   # Resource Manager
        "compute.googleapis.com"                # Compute Engine (for Redis)
        "vpcaccess.googleapis.com"              # VPC Access (for Redis)
    )

    for api in "${apis[@]}"; do
        log_info "Enabling $api..."
        gcloud services enable "$api" --project="$PROJECT_ID" || log_warning "API may already be enabled"
    done

    log_success "APIs enabled"
}

################################################################################
# Step 2: Create Service Account
################################################################################

create_service_account() {
    show_progress "Step 2/12: Creating Service Account"

    local sa_email="${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

    if gcloud iam service-accounts describe "$sa_email" --project="$PROJECT_ID" &> /dev/null; then
        log_warning "Service account '$SERVICE_ACCOUNT_NAME' already exists"
    else
        log_info "Creating service account '$SERVICE_ACCOUNT_NAME'"
        gcloud iam service-accounts create "$SERVICE_ACCOUNT_NAME" \
            --project="$PROJECT_ID" \
            --description="Service account for ${PROJECT_NAME} ${ENVIRONMENT}" \
            --display-name="${PROJECT_NAME}-${ENVIRONMENT}"

        log_success "Service account created"
    fi

    SERVICE_ACCOUNT_EMAIL="$sa_email"
}

################################################################################
# Step 3: Create Artifact Registry Repository
################################################################################

create_artifact_registry() {
    show_progress "Step 3/12: Creating Artifact Registry Repository"

    if gcloud artifacts repositories describe "$ARTIFACT_REGISTRY_REPO" \
        --location="$REGION" \
        --project="$PROJECT_ID" &> /dev/null; then
        log_warning "Artifact Registry repository '$ARTIFACT_REGISTRY_REPO' already exists"
    else
        log_info "Creating Artifact Registry repository '$ARTIFACT_REGISTRY_REPO'"
        gcloud artifacts repositories create "$ARTIFACT_REGISTRY_REPO" \
            --repository-format=docker \
            --location="$REGION" \
            --project="$PROJECT_ID" \
            --description="Container images for ${PROJECT_NAME} ${ENVIRONMENT}"

        log_success "Artifact Registry repository created"
    fi

    # Configure Docker authentication
    log_info "Configuring Docker authentication for Artifact Registry"
    gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet || log_warning "Docker auth may already be configured"

    ARTIFACT_REGISTRY_URL="${REGION}-docker.pkg.dev/${PROJECT_ID}/${ARTIFACT_REGISTRY_REPO}"
    log_success "Artifact Registry configured: $ARTIFACT_REGISTRY_URL"
}

################################################################################
# Step 4: Create Cloud Storage Bucket
################################################################################

create_storage_bucket() {
    show_progress "Step 4/12: Creating Cloud Storage Bucket"

    if gsutil ls -b "gs://${STORAGE_BUCKET_NAME}" &> /dev/null; then
        log_warning "Storage bucket '$STORAGE_BUCKET_NAME' already exists"
    else
        log_info "Creating storage bucket '$STORAGE_BUCKET_NAME'"
        gcloud storage buckets create "gs://${STORAGE_BUCKET_NAME}" \
            --project="$PROJECT_ID" \
            --location="$REGION" \
            --uniform-bucket-level-access

        log_success "Storage bucket created"
    fi

    # Make bucket publicly readable for generated images
    log_info "Setting bucket permissions for public read access"
    gcloud storage buckets add-iam-policy-binding "gs://${STORAGE_BUCKET_NAME}" \
        --member=allUsers \
        --role=roles/storage.objectViewer \
        || log_warning "Permission may already be set"

    # Enable CORS for web access
    log_info "Configuring CORS for bucket"
    cat > /tmp/cors-config.json << EOF
[
  {
    "origin": ["*"],
    "method": ["GET", "HEAD"],
    "responseHeader": ["Content-Type"],
    "maxAgeSeconds": 3600
  }
]
EOF
    gcloud storage buckets update "gs://${STORAGE_BUCKET_NAME}" \
        --cors-file=/tmp/cors-config.json \
        || log_warning "CORS may already be configured"
    rm /tmp/cors-config.json

    log_success "Storage bucket configured"
}

################################################################################
# Step 5: Create Memorystore Redis Instance
################################################################################

create_redis_instance() {
    show_progress "Step 5/12: Creating Memorystore Redis Instance"

    if gcloud redis instances describe "$REDIS_INSTANCE_NAME" \
        --region="$REGION" \
        --project="$PROJECT_ID" &> /dev/null; then
        log_warning "Redis instance '$REDIS_INSTANCE_NAME' already exists"
    else
        log_info "Creating Redis instance '$REDIS_INSTANCE_NAME' (this may take 5-10 minutes)"
        gcloud redis instances create "$REDIS_INSTANCE_NAME" \
            --project="$PROJECT_ID" \
            --region="$REGION" \
            --tier="$REDIS_TIER" \
            --size="$REDIS_MEMORY_SIZE" \
            --redis-version=redis_6_x \
            --network=projects/${PROJECT_ID}/global/networks/default \
            --async

        log_info "Waiting for Redis instance to be ready..."
        gcloud redis instances describe "$REDIS_INSTANCE_NAME" \
            --region="$REGION" \
            --project="$PROJECT_ID" \
            --format="value(state)" | grep -q "READY" || sleep 30

        log_success "Redis instance created"
    fi

    # Get Redis connection details
    log_info "Retrieving Redis connection details"
    REDIS_HOST=$(gcloud redis instances describe "$REDIS_INSTANCE_NAME" \
        --region="$REGION" \
        --project="$PROJECT_ID" \
        --format="value(host)")

    REDIS_PORT=$(gcloud redis instances describe "$REDIS_INSTANCE_NAME" \
        --region="$REGION" \
        --project="$PROJECT_ID" \
        --format="value(port)")

    REDIS_CONNECTION_STRING="redis://${REDIS_HOST}:${REDIS_PORT}"

    log_success "Redis configured: $REDIS_CONNECTION_STRING"
}

################################################################################
# Step 6: Create VPC Connector (for Redis access from Cloud Run)
################################################################################

create_vpc_connector() {
    show_progress "Step 6/12: Creating VPC Connector"

    local connector_name="${PROJECT_NAME}-${ENVIRONMENT}-connector"

    if gcloud compute networks vpc-access connectors describe "$connector_name" \
        --region="$REGION" \
        --project="$PROJECT_ID" &> /dev/null; then
        log_warning "VPC connector '$connector_name' already exists"
    else
        log_info "Creating VPC connector '$connector_name' (this may take 3-5 minutes)"
        gcloud compute networks vpc-access connectors create "$connector_name" \
            --project="$PROJECT_ID" \
            --region="$REGION" \
            --network=default \
            --range=10.8.0.0/28 \
            --min-instances=2 \
            --max-instances=3 \
            --machine-type=f1-micro \
            || log_warning "Connector may already exist or creation failed"

        log_success "VPC connector created"
    fi

    VPC_CONNECTOR="projects/${PROJECT_ID}/locations/${REGION}/connectors/${connector_name}"
}

################################################################################
# Step 7: Create Cloud Pub/Sub Topic and Subscription
################################################################################

create_pubsub() {
    show_progress "Step 7/12: Creating Cloud Pub/Sub Resources"

    # Create topic
    if gcloud pubsub topics describe "$PUBSUB_TOPIC_NAME" \
        --project="$PROJECT_ID" &> /dev/null; then
        log_warning "Pub/Sub topic '$PUBSUB_TOPIC_NAME' already exists"
    else
        log_info "Creating Pub/Sub topic '$PUBSUB_TOPIC_NAME'"
        gcloud pubsub topics create "$PUBSUB_TOPIC_NAME" \
            --project="$PROJECT_ID"

        log_success "Pub/Sub topic created"
    fi

    # Create subscription for worker
    if gcloud pubsub subscriptions describe "$PUBSUB_SUBSCRIPTION_NAME" \
        --project="$PROJECT_ID" &> /dev/null; then
        log_warning "Pub/Sub subscription '$PUBSUB_SUBSCRIPTION_NAME' already exists"
    else
        log_info "Creating Pub/Sub subscription '$PUBSUB_SUBSCRIPTION_NAME'"
        gcloud pubsub subscriptions create "$PUBSUB_SUBSCRIPTION_NAME" \
            --project="$PROJECT_ID" \
            --topic="$PUBSUB_TOPIC_NAME" \
            --ack-deadline=300 \
            --message-retention-duration=7d \
            --expiration-period=never

        log_success "Pub/Sub subscription created"
    fi
}

################################################################################
# Step 8: Create Secret Manager Secrets
################################################################################

create_secrets() {
    show_progress "Step 8/12: Creating Secret Manager Secrets"

    log_info "Creating secrets in Secret Manager"

    # Helper function to create or update secret
    create_or_update_secret() {
        local secret_name=$1
        local secret_value=$2

        if gcloud secrets describe "$secret_name" --project="$PROJECT_ID" &> /dev/null; then
            log_info "Updating secret '$secret_name'"
            echo -n "$secret_value" | gcloud secrets versions add "$secret_name" \
                --project="$PROJECT_ID" \
                --data-file=-
        else
            log_info "Creating secret '$secret_name'"
            echo -n "$secret_value" | gcloud secrets create "$secret_name" \
                --project="$PROJECT_ID" \
                --replication-policy="automatic" \
                --data-file=-
        fi
    }

    # MongoDB
    if [ -n "$MONGODB_CONNECTION_STRING" ]; then
        create_or_update_secret "mongodb-connection-string" "$MONGODB_CONNECTION_STRING"
    fi

    # Redis
    create_or_update_secret "redis-connection-string" "$REDIS_CONNECTION_STRING"

    # Storage
    create_or_update_secret "storage-bucket-name" "$STORAGE_BUCKET_NAME"

    # Pub/Sub
    create_or_update_secret "pubsub-topic-name" "$PUBSUB_TOPIC_NAME"
    create_or_update_secret "pubsub-subscription-name" "$PUBSUB_SUBSCRIPTION_NAME"

    # External services
    if [ -n "$REPLICATE_API_KEY" ]; then
        create_or_update_secret "replicate-api-key" "$REPLICATE_API_KEY"
    fi

    if [ -n "$STRIPE_SECRET_KEY" ]; then
        create_or_update_secret "stripe-secret-key" "$STRIPE_SECRET_KEY"
    fi

    if [ -n "$STRIPE_WEBHOOK_SECRET" ]; then
        create_or_update_secret "stripe-webhook-secret" "$STRIPE_WEBHOOK_SECRET"
    fi

    if [ -n "$GOOGLE_OAUTH_CLIENT_ID" ]; then
        create_or_update_secret "google-oauth-client-id" "$GOOGLE_OAUTH_CLIENT_ID"
    fi

    if [ -n "$GOOGLE_OAUTH_CLIENT_SECRET" ]; then
        create_or_update_secret "google-oauth-client-secret" "$GOOGLE_OAUTH_CLIENT_SECRET"
    fi

    log_success "Secrets created/updated in Secret Manager"
}

################################################################################
# Step 9: Grant IAM Permissions
################################################################################

grant_iam_permissions() {
    show_progress "Step 9/12: Granting IAM Permissions"

    log_info "Granting permissions to service account: $SERVICE_ACCOUNT_EMAIL"

    # Storage permissions
    log_info "Granting Storage Object Admin role"
    gcloud projects add-iam-policy-binding "$PROJECT_ID" \
        --member="serviceAccount:${SERVICE_ACCOUNT_EMAIL}" \
        --role="roles/storage.objectAdmin" \
        --condition=None \
        || log_warning "Permission may already be granted"

    # Pub/Sub permissions
    log_info "Granting Pub/Sub Publisher role"
    gcloud projects add-iam-policy-binding "$PROJECT_ID" \
        --member="serviceAccount:${SERVICE_ACCOUNT_EMAIL}" \
        --role="roles/pubsub.publisher" \
        --condition=None \
        || log_warning "Permission may already be granted"

    log_info "Granting Pub/Sub Subscriber role"
    gcloud projects add-iam-policy-binding "$PROJECT_ID" \
        --member="serviceAccount:${SERVICE_ACCOUNT_EMAIL}" \
        --role="roles/pubsub.subscriber" \
        --condition=None \
        || log_warning "Permission may already be granted"

    # Secret Manager permissions
    log_info "Granting Secret Manager Secret Accessor role"
    gcloud projects add-iam-policy-binding "$PROJECT_ID" \
        --member="serviceAccount:${SERVICE_ACCOUNT_EMAIL}" \
        --role="roles/secretmanager.secretAccessor" \
        --condition=None \
        || log_warning "Permission may already be granted"

    # Cloud Run invoker (for service-to-service calls)
    log_info "Granting Cloud Run Invoker role"
    gcloud projects add-iam-policy-binding "$PROJECT_ID" \
        --member="serviceAccount:${SERVICE_ACCOUNT_EMAIL}" \
        --role="roles/run.invoker" \
        --condition=None \
        || log_warning "Permission may already be granted"

    # Redis access (via VPC)
    log_info "Granting Redis Editor role"
    gcloud projects add-iam-policy-binding "$PROJECT_ID" \
        --member="serviceAccount:${SERVICE_ACCOUNT_EMAIL}" \
        --role="roles/redis.editor" \
        --condition=None \
        || log_warning "Permission may already be granted"

    log_success "IAM permissions granted"
}

################################################################################
# Step 10: Deploy Backend Cloud Run Service
################################################################################

deploy_backend_service() {
    show_progress "Step 10/12: Deploying Backend Cloud Run Service"

    log_info "Deploying backend service: $BACKEND_SERVICE_NAME"

    # Check if we have an image, if not use a placeholder
    if ! gcloud artifacts docker images describe "$BACKEND_IMAGE" &> /dev/null; then
        log_warning "Backend image not found. Using placeholder. Run build-and-deploy-gcp.sh after this."
        BACKEND_IMAGE="gcr.io/cloudrun/hello"
    fi

    gcloud run deploy "$BACKEND_SERVICE_NAME" \
        --project="$PROJECT_ID" \
        --region="$REGION" \
        --image="$BACKEND_IMAGE" \
        --platform=managed \
        --service-account="$SERVICE_ACCOUNT_EMAIL" \
        --allow-unauthenticated \
        --cpu="$BACKEND_CPU" \
        --memory="$BACKEND_MEMORY" \
        --min-instances="$BACKEND_MIN_INSTANCES" \
        --max-instances="$BACKEND_MAX_INSTANCES" \
        --concurrency="$BACKEND_CONCURRENCY" \
        --port=8000 \
        --timeout=300 \
        --vpc-connector="$VPC_CONNECTOR" \
        --set-env-vars="ENVIRONMENT=${ENVIRONMENT},GCP_PROJECT_ID=${PROJECT_ID},STORAGE_BUCKET_NAME=${STORAGE_BUCKET_NAME},PUBSUB_TOPIC_NAME=${PUBSUB_TOPIC_NAME},REDIS_HOST=${REDIS_HOST},REDIS_PORT=${REDIS_PORT}" \
        --set-secrets="MONGODB_CONNECTION_STRING=mongodb-connection-string:latest,REPLICATE_API_TOKEN=replicate-api-key:latest,STRIPE_SECRET_KEY=stripe-secret-key:latest,STRIPE_WEBHOOK_SECRET=stripe-webhook-secret:latest,GOOGLE_OAUTH_CLIENT_ID=google-oauth-client-id:latest,GOOGLE_OAUTH_CLIENT_SECRET=google-oauth-client-secret:latest" \
        || log_warning "Backend deployment may have failed"

    # Get service URL
    BACKEND_URL=$(gcloud run services describe "$BACKEND_SERVICE_NAME" \
        --project="$PROJECT_ID" \
        --region="$REGION" \
        --format="value(status.url)")

    log_success "Backend service deployed: $BACKEND_URL"
}

################################################################################
# Step 11: Deploy Worker Cloud Run Service
################################################################################

deploy_worker_service() {
    show_progress "Step 11/12: Deploying Worker Cloud Run Service"

    log_info "Deploying worker service: $WORKER_SERVICE_NAME"

    # Check if we have an image, if not use a placeholder
    if ! gcloud artifacts docker images describe "$WORKER_IMAGE" &> /dev/null; then
        log_warning "Worker image not found. Using placeholder. Run build-and-deploy-gcp.sh after this."
        WORKER_IMAGE="gcr.io/cloudrun/hello"
    fi

    gcloud run deploy "$WORKER_SERVICE_NAME" \
        --project="$PROJECT_ID" \
        --region="$REGION" \
        --image="$WORKER_IMAGE" \
        --platform=managed \
        --service-account="$SERVICE_ACCOUNT_EMAIL" \
        --no-allow-unauthenticated \
        --cpu="$WORKER_CPU" \
        --memory="$WORKER_MEMORY" \
        --min-instances="$WORKER_MIN_INSTANCES" \
        --max-instances="$WORKER_MAX_INSTANCES" \
        --timeout=3600 \
        --vpc-connector="$VPC_CONNECTOR" \
        --set-env-vars="ENVIRONMENT=${ENVIRONMENT},GCP_PROJECT_ID=${PROJECT_ID},STORAGE_BUCKET_NAME=${STORAGE_BUCKET_NAME},PUBSUB_SUBSCRIPTION_NAME=${PUBSUB_SUBSCRIPTION_NAME},REDIS_HOST=${REDIS_HOST},REDIS_PORT=${REDIS_PORT}" \
        --set-secrets="MONGODB_CONNECTION_STRING=mongodb-connection-string:latest,REPLICATE_API_TOKEN=replicate-api-key:latest" \
        || log_warning "Worker deployment may have failed"

    log_success "Worker service deployed"
}

################################################################################
# Step 12: Setup Cloud Scheduler (Optional - for worker polling)
################################################################################

setup_cloud_scheduler() {
    show_progress "Step 12/12: Setting up Cloud Scheduler (Optional)"

    # Enable Cloud Scheduler API
    gcloud services enable cloudscheduler.googleapis.com --project="$PROJECT_ID" || true

    local job_name="${PROJECT_NAME}-${ENVIRONMENT}-worker-trigger"

    # Create a job to trigger worker every minute (if using HTTP-triggered worker)
    log_info "Creating Cloud Scheduler job for worker"

    gcloud scheduler jobs create http "$job_name" \
        --project="$PROJECT_ID" \
        --location="$REGION" \
        --schedule="* * * * *" \
        --uri="$(gcloud run services describe $WORKER_SERVICE_NAME --project=$PROJECT_ID --region=$REGION --format='value(status.url)')/process" \
        --http-method=POST \
        --oidc-service-account-email="$SERVICE_ACCOUNT_EMAIL" \
        --attempt-deadline=60s \
        || log_warning "Scheduler job may already exist or creation failed"

    log_success "Cloud Scheduler configured"
}

################################################################################
# Deployment Summary
################################################################################

print_summary() {
    echo ""
    echo "================================================================================"
    log_success "GCP DEPLOYMENT COMPLETED SUCCESSFULLY!"
    echo "================================================================================"
    echo ""
    echo "Project ID:            $PROJECT_ID"
    echo "Region:                $REGION"
    echo "Environment:           $ENVIRONMENT"
    echo ""
    echo "--- Service Account ---"
    echo "Email:                 $SERVICE_ACCOUNT_EMAIL"
    echo ""
    echo "--- Artifact Registry ---"
    echo "Repository:            $ARTIFACT_REGISTRY_REPO"
    echo "URL:                   $ARTIFACT_REGISTRY_URL"
    echo ""
    echo "--- Cloud Storage ---"
    echo "Bucket:                $STORAGE_BUCKET_NAME"
    echo "URL:                   https://storage.googleapis.com/$STORAGE_BUCKET_NAME"
    echo ""
    echo "--- Memorystore Redis ---"
    echo "Instance:              $REDIS_INSTANCE_NAME"
    echo "Connection:            $REDIS_CONNECTION_STRING"
    echo ""
    echo "--- Cloud Pub/Sub ---"
    echo "Topic:                 $PUBSUB_TOPIC_NAME"
    echo "Subscription:          $PUBSUB_SUBSCRIPTION_NAME"
    echo ""
    echo "--- Cloud Run Services ---"
    echo "Backend Service:       $BACKEND_SERVICE_NAME"
    echo "Backend URL:           $BACKEND_URL"
    echo "Worker Service:        $WORKER_SERVICE_NAME"
    echo ""
    echo "================================================================================"
    echo ""
    echo "Next Steps:"
    echo ""
    echo "1. Set up MongoDB Atlas:"
    echo "   - Sign up at https://www.mongodb.com/cloud/atlas"
    echo "   - Create a cluster"
    echo "   - Get connection string and update deploy-gcp-config.env"
    echo "   - Re-run: gcloud secrets versions add mongodb-connection-string --data-file=-"
    echo ""
    echo "2. Build and deploy container images:"
    echo "   ./build-and-deploy-gcp.sh"
    echo ""
    echo "3. Verify deployment:"
    echo "   ./verify-gcp.sh"
    echo ""
    echo "4. Test backend API:"
    echo "   curl ${BACKEND_URL}/health"
    echo "   open ${BACKEND_URL}/docs"
    echo ""
    echo "5. Update frontend .env.local:"
    echo "   NEXT_PUBLIC_API_URL=$BACKEND_URL"
    echo ""
    echo "6. View logs:"
    echo "   gcloud run logs read $BACKEND_SERVICE_NAME --project=$PROJECT_ID --region=$REGION --limit=50"
    echo ""
    echo "================================================================================"
}

################################################################################
# MongoDB Atlas Setup Instructions
################################################################################

show_mongodb_instructions() {
    echo ""
    echo "================================================================================"
    echo "  MongoDB Atlas Setup Required"
    echo "================================================================================"
    echo ""
    echo "GCP doesn't have a managed MongoDB service. Please set up MongoDB Atlas:"
    echo ""
    echo "1. Go to https://www.mongodb.com/cloud/atlas"
    echo "2. Create a free account"
    echo "3. Create a new cluster (M0 free tier available)"
    echo "4. Create a database user"
    echo "5. Whitelist IP: 0.0.0.0/0 (allow from anywhere)"
    echo "6. Get connection string (looks like):"
    echo "   mongodb+srv://username:password@cluster.xxxxx.mongodb.net/image_generator"
    echo ""
    echo "7. Update deploy-gcp-config.env with the connection string"
    echo "8. Update the secret:"
    echo "   echo -n 'your_connection_string' | gcloud secrets versions add mongodb-connection-string --project=$PROJECT_ID --data-file=-"
    echo ""
    echo "================================================================================"
}

################################################################################
# Main Execution
################################################################################

main() {
    echo ""
    echo "================================================================================"
    echo "  Google Cloud Platform Deployment"
    echo "  Project: $PROJECT_NAME"
    echo "  Environment: $ENVIRONMENT"
    echo "  Region: $REGION"
    echo "================================================================================"
    echo ""

    # Validate configuration
    validate_config

    # Show MongoDB instructions if not configured
    if [ -z "$MONGODB_CONNECTION_STRING" ]; then
        show_mongodb_instructions
        echo ""
        read -p "Have you set up MongoDB Atlas? (yes/skip): " mongodb_confirm
        if [ "$mongodb_confirm" != "yes" ] && [ "$mongodb_confirm" != "skip" ]; then
            log_error "Please set up MongoDB Atlas first"
            exit 1
        fi
    fi

    # Confirm deployment
    echo ""
    read -p "Do you want to proceed with deployment to $PROJECT_ID? (yes/no): " confirm
    if [ "$confirm" != "yes" ]; then
        log_warning "Deployment cancelled"
        exit 0
    fi

    echo ""
    log_info "Starting GCP deployment..."
    echo ""

    # Execute deployment steps
    enable_apis
    create_service_account
    create_artifact_registry
    create_storage_bucket
    create_redis_instance
    create_vpc_connector
    create_pubsub
    create_secrets
    grant_iam_permissions
    deploy_backend_service
    deploy_worker_service
    setup_cloud_scheduler

    # Print summary
    print_summary

    # Save outputs to file
    cat > gcp-deployment-outputs.txt << EOF
PROJECT_ID=$PROJECT_ID
REGION=$REGION
ENVIRONMENT=$ENVIRONMENT
SERVICE_ACCOUNT_EMAIL=$SERVICE_ACCOUNT_EMAIL
ARTIFACT_REGISTRY_REPO=$ARTIFACT_REGISTRY_REPO
ARTIFACT_REGISTRY_URL=$ARTIFACT_REGISTRY_URL
STORAGE_BUCKET_NAME=$STORAGE_BUCKET_NAME
REDIS_INSTANCE_NAME=$REDIS_INSTANCE_NAME
REDIS_HOST=$REDIS_HOST
REDIS_PORT=$REDIS_PORT
PUBSUB_TOPIC_NAME=$PUBSUB_TOPIC_NAME
PUBSUB_SUBSCRIPTION_NAME=$PUBSUB_SUBSCRIPTION_NAME
BACKEND_SERVICE_NAME=$BACKEND_SERVICE_NAME
WORKER_SERVICE_NAME=$WORKER_SERVICE_NAME
BACKEND_URL=$BACKEND_URL
VPC_CONNECTOR=$VPC_CONNECTOR
EOF

    log_success "Deployment outputs saved to gcp-deployment-outputs.txt"
}

# Run main function
main "$@"
