#!/bin/bash

################################################################################
# GCP Resource Cleanup Script
#
# This script deletes all GCP resources created by deploy-gcp.sh
# WARNING: This action is irreversible!
################################################################################

set -e
set -u

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

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

################################################################################
# Configuration
################################################################################

# Load configuration
if [ -f "deploy-gcp-config.env" ]; then
    source deploy-gcp-config.env
else
    log_error "deploy-gcp-config.env not found!"
    exit 1
fi

# Load deployment outputs if available
if [ -f "gcp-deployment-outputs.txt" ]; then
    source gcp-deployment-outputs.txt
fi

# Resource names
ENVIRONMENT="${ENVIRONMENT:-prod}"
PROJECT_ID="${GCP_PROJECT_ID:-}"
REGION="${GCP_REGION:-us-central1}"
PROJECT_NAME="${PROJECT_NAME:-imggen}"

if [ -z "$PROJECT_ID" ]; then
    log_error "GCP_PROJECT_ID not set"
    exit 1
fi

# Set project
gcloud config set project "$PROJECT_ID"

################################################################################
# Validation
################################################################################

if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" &> /dev/null; then
    log_error "Not logged in to GCP. Run: gcloud auth login"
    exit 1
fi

################################################################################
# Confirmation
################################################################################

echo ""
echo "================================================================================"
log_warning "DANGER: Resource Deletion"
echo "================================================================================"
echo ""
echo "This will DELETE the following resources from project: $PROJECT_ID"
echo ""
echo "This includes:"
echo "  - Cloud Run services (backend and worker)"
echo "  - Artifact Registry repository and all images"
echo "  - Cloud Storage bucket and all blobs"
echo "  - Memorystore Redis instance"
echo "  - Cloud Pub/Sub topic and subscription"
echo "  - VPC Connector"
echo "  - Cloud Scheduler jobs"
echo "  - Secret Manager secrets"
echo "  - Service Account and IAM bindings"
echo ""
log_error "THIS ACTION CANNOT BE UNDONE!"
echo ""
echo "MongoDB Atlas resources will NOT be deleted (must be deleted manually)"
echo ""
echo "================================================================================"
echo ""

read -p "Type 'DELETE' to confirm deletion: " confirm
if [ "$confirm" != "DELETE" ]; then
    log_warning "Deletion cancelled"
    exit 0
fi

echo ""
read -p "Are you absolutely sure? Type the project ID '$PROJECT_ID' to proceed: " confirm2
if [ "$confirm2" != "$PROJECT_ID" ]; then
    log_warning "Deletion cancelled"
    exit 0
fi

################################################################################
# Deletion
################################################################################

echo ""
log_info "Starting resource deletion..."
echo ""

# Resource names
SERVICE_ACCOUNT_NAME="${PROJECT_NAME}-${ENVIRONMENT}-sa"
SERVICE_ACCOUNT_EMAIL="${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
ARTIFACT_REGISTRY_REPO="${PROJECT_NAME}-${ENVIRONMENT}"
BACKEND_SERVICE_NAME="${PROJECT_NAME}-backend-${ENVIRONMENT}"
WORKER_SERVICE_NAME="${PROJECT_NAME}-worker-${ENVIRONMENT}"
STORAGE_BUCKET_NAME="${PROJECT_ID}-${PROJECT_NAME}-${ENVIRONMENT}-images"
REDIS_INSTANCE_NAME="${PROJECT_NAME}-${ENVIRONMENT}-redis"
PUBSUB_TOPIC_NAME="${PROJECT_NAME}-${ENVIRONMENT}-generations"
PUBSUB_SUBSCRIPTION_NAME="${PROJECT_NAME}-${ENVIRONMENT}-worker-sub"
VPC_CONNECTOR_NAME="${PROJECT_NAME}-${ENVIRONMENT}-connector"
SCHEDULER_JOB_NAME="${PROJECT_NAME}-${ENVIRONMENT}-worker-trigger"

################################################################################
# 1. Delete Cloud Run Services
################################################################################

log_info "Deleting Cloud Run services..."

if gcloud run services describe "$BACKEND_SERVICE_NAME" --region="$REGION" --project="$PROJECT_ID" &> /dev/null; then
    log_info "Deleting backend service: $BACKEND_SERVICE_NAME"
    gcloud run services delete "$BACKEND_SERVICE_NAME" \
        --region="$REGION" \
        --project="$PROJECT_ID" \
        --quiet
    log_success "Backend service deleted"
else
    log_warning "Backend service not found"
fi

if gcloud run services describe "$WORKER_SERVICE_NAME" --region="$REGION" --project="$PROJECT_ID" &> /dev/null; then
    log_info "Deleting worker service: $WORKER_SERVICE_NAME"
    gcloud run services delete "$WORKER_SERVICE_NAME" \
        --region="$REGION" \
        --project="$PROJECT_ID" \
        --quiet
    log_success "Worker service deleted"
else
    log_warning "Worker service not found"
fi

################################################################################
# 2. Delete Cloud Scheduler Job
################################################################################

log_info "Deleting Cloud Scheduler job..."

if gcloud scheduler jobs describe "$SCHEDULER_JOB_NAME" --location="$REGION" --project="$PROJECT_ID" &> /dev/null; then
    gcloud scheduler jobs delete "$SCHEDULER_JOB_NAME" \
        --location="$REGION" \
        --project="$PROJECT_ID" \
        --quiet
    log_success "Scheduler job deleted"
else
    log_warning "Scheduler job not found"
fi

################################################################################
# 3. Delete Artifact Registry Repository
################################################################################

log_info "Deleting Artifact Registry repository..."

if gcloud artifacts repositories describe "$ARTIFACT_REGISTRY_REPO" --location="$REGION" --project="$PROJECT_ID" &> /dev/null; then
    gcloud artifacts repositories delete "$ARTIFACT_REGISTRY_REPO" \
        --location="$REGION" \
        --project="$PROJECT_ID" \
        --quiet
    log_success "Artifact Registry repository deleted"
else
    log_warning "Artifact Registry repository not found"
fi

################################################################################
# 4. Delete Cloud Storage Bucket
################################################################################

log_info "Deleting Cloud Storage bucket..."

if gsutil ls -b "gs://${STORAGE_BUCKET_NAME}" &> /dev/null; then
    log_info "Removing all objects from bucket..."
    gsutil -m rm -r "gs://${STORAGE_BUCKET_NAME}/**" 2>/dev/null || true

    log_info "Deleting bucket..."
    gcloud storage buckets delete "gs://${STORAGE_BUCKET_NAME}" \
        --project="$PROJECT_ID" \
        --quiet
    log_success "Storage bucket deleted"
else
    log_warning "Storage bucket not found"
fi

################################################################################
# 5. Delete Memorystore Redis Instance
################################################################################

log_info "Deleting Memorystore Redis instance (this may take 5 minutes)..."

if gcloud redis instances describe "$REDIS_INSTANCE_NAME" --region="$REGION" --project="$PROJECT_ID" &> /dev/null; then
    gcloud redis instances delete "$REDIS_INSTANCE_NAME" \
        --region="$REGION" \
        --project="$PROJECT_ID" \
        --quiet \
        --async
    log_success "Redis deletion initiated"
else
    log_warning "Redis instance not found"
fi

################################################################################
# 6. Delete VPC Connector
################################################################################

log_info "Deleting VPC connector (this may take 3 minutes)..."

if gcloud compute networks vpc-access connectors describe "$VPC_CONNECTOR_NAME" --region="$REGION" --project="$PROJECT_ID" &> /dev/null; then
    gcloud compute networks vpc-access connectors delete "$VPC_CONNECTOR_NAME" \
        --region="$REGION" \
        --project="$PROJECT_ID" \
        --quiet \
        --async
    log_success "VPC connector deletion initiated"
else
    log_warning "VPC connector not found"
fi

################################################################################
# 7. Delete Cloud Pub/Sub Resources
################################################################################

log_info "Deleting Cloud Pub/Sub resources..."

# Delete subscription first
if gcloud pubsub subscriptions describe "$PUBSUB_SUBSCRIPTION_NAME" --project="$PROJECT_ID" &> /dev/null; then
    gcloud pubsub subscriptions delete "$PUBSUB_SUBSCRIPTION_NAME" \
        --project="$PROJECT_ID" \
        --quiet
    log_success "Pub/Sub subscription deleted"
else
    log_warning "Pub/Sub subscription not found"
fi

# Delete topic
if gcloud pubsub topics describe "$PUBSUB_TOPIC_NAME" --project="$PROJECT_ID" &> /dev/null; then
    gcloud pubsub topics delete "$PUBSUB_TOPIC_NAME" \
        --project="$PROJECT_ID" \
        --quiet
    log_success "Pub/Sub topic deleted"
else
    log_warning "Pub/Sub topic not found"
fi

################################################################################
# 8. Delete Secret Manager Secrets
################################################################################

log_info "Deleting Secret Manager secrets..."

SECRETS=(
    "mongodb-connection-string"
    "redis-connection-string"
    "storage-bucket-name"
    "pubsub-topic-name"
    "pubsub-subscription-name"
    "replicate-api-key"
    "stripe-secret-key"
    "stripe-webhook-secret"
    "google-oauth-client-id"
    "google-oauth-client-secret"
)

for secret in "${SECRETS[@]}"; do
    if gcloud secrets describe "$secret" --project="$PROJECT_ID" &> /dev/null; then
        gcloud secrets delete "$secret" \
            --project="$PROJECT_ID" \
            --quiet
        log_info "Deleted secret: $secret"
    fi
done

log_success "Secrets deleted"

################################################################################
# 9. Remove IAM Policy Bindings
################################################################################

log_info "Removing IAM policy bindings..."

ROLES=(
    "roles/storage.objectAdmin"
    "roles/pubsub.publisher"
    "roles/pubsub.subscriber"
    "roles/secretmanager.secretAccessor"
    "roles/run.invoker"
    "roles/redis.editor"
)

for role in "${ROLES[@]}"; do
    gcloud projects remove-iam-policy-binding "$PROJECT_ID" \
        --member="serviceAccount:${SERVICE_ACCOUNT_EMAIL}" \
        --role="$role" \
        --quiet \
        2>/dev/null || true
done

log_success "IAM bindings removed"

################################################################################
# 10. Delete Service Account
################################################################################

log_info "Deleting service account..."

if gcloud iam service-accounts describe "$SERVICE_ACCOUNT_EMAIL" --project="$PROJECT_ID" &> /dev/null; then
    gcloud iam service-accounts delete "$SERVICE_ACCOUNT_EMAIL" \
        --project="$PROJECT_ID" \
        --quiet
    log_success "Service account deleted"
else
    log_warning "Service account not found"
fi

################################################################################
# Cleanup Local Files
################################################################################

echo ""
read -p "Delete local deployment outputs? (yes/no): " cleanup_local
if [ "$cleanup_local" == "yes" ]; then
    if [ -f "gcp-deployment-outputs.txt" ]; then
        rm gcp-deployment-outputs.txt
        log_success "Deleted gcp-deployment-outputs.txt"
    fi
fi

################################################################################
# Summary
################################################################################

echo ""
echo "================================================================================"
log_success "Cleanup Complete"
echo "================================================================================"
echo ""
log_info "Deleted resources from project: $PROJECT_ID"
echo ""
log_warning "Note: Some resources (Redis, VPC Connector) are being deleted asynchronously"
log_info "Check status with:"
echo "  gcloud redis instances list --region=$REGION --project=$PROJECT_ID"
echo "  gcloud compute networks vpc-access connectors list --region=$REGION --project=$PROJECT_ID"
echo ""
log_warning "MongoDB Atlas resources were NOT deleted (must be deleted manually)"
log_info "To delete MongoDB Atlas:"
echo "  1. Go to https://cloud.mongodb.com/"
echo "  2. Select your cluster"
echo "  3. Click 'Delete' and follow the prompts"
echo ""
echo "================================================================================"
