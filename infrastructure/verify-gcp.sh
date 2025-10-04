#!/bin/bash

################################################################################
# GCP Deployment Verification Script
#
# Checks the status and health of all deployed GCP resources
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
    echo -e "${GREEN}[✓]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[⚠]${NC} $1"
}

log_error() {
    echo -e "${RED}[✗]${NC} $1"
}

log_section() {
    echo ""
    echo "================================================================================"
    echo "  $1"
    echo "================================================================================"
}

################################################################################
# Configuration
################################################################################

# Load outputs from deployment
if [ -f "gcp-deployment-outputs.txt" ]; then
    source gcp-deployment-outputs.txt
else
    log_error "gcp-deployment-outputs.txt not found. Run deploy-gcp.sh first."
    exit 1
fi

# Set project
gcloud config set project "$PROJECT_ID" --quiet

################################################################################
# Verification Functions
################################################################################

verify_project() {
    log_section "1. Project Configuration"

    local project_name=$(gcloud projects describe "$PROJECT_ID" --format="value(name)")
    local project_number=$(gcloud projects describe "$PROJECT_ID" --format="value(projectNumber)")

    log_success "Project ID: $PROJECT_ID"
    log_info "Project Name: $project_name"
    log_info "Project Number: $project_number"
    log_info "Region: $REGION"
    log_info "Environment: $ENVIRONMENT"
}

verify_service_account() {
    log_section "2. Service Account"

    if gcloud iam service-accounts describe "$SERVICE_ACCOUNT_EMAIL" --project="$PROJECT_ID" &> /dev/null; then
        log_success "Service Account: $SERVICE_ACCOUNT_EMAIL"

        # List IAM roles
        log_info "IAM Roles:"
        gcloud projects get-iam-policy "$PROJECT_ID" \
            --flatten="bindings[].members" \
            --filter="bindings.members:serviceAccount:${SERVICE_ACCOUNT_EMAIL}" \
            --format="table(bindings.role)" | tail -n +2
    else
        log_error "Service Account not found: $SERVICE_ACCOUNT_EMAIL"
        return 1
    fi
}

verify_artifact_registry() {
    log_section "3. Artifact Registry"

    if gcloud artifacts repositories describe "$ARTIFACT_REGISTRY_REPO" \
        --location="$REGION" \
        --project="$PROJECT_ID" &> /dev/null; then

        local format=$(gcloud artifacts repositories describe "$ARTIFACT_REGISTRY_REPO" \
            --location="$REGION" \
            --project="$PROJECT_ID" \
            --format="value(format)")

        log_success "Repository: $ARTIFACT_REGISTRY_REPO"
        log_info "Format: $format"
        log_info "URL: $ARTIFACT_REGISTRY_URL"

        # List images
        log_info "Container Images:"
        gcloud artifacts docker images list "$ARTIFACT_REGISTRY_URL" \
            --format="table(package,version,CREATE_TIME)" \
            2>/dev/null || log_warning "No images found. Run build-and-deploy-gcp.sh"
    else
        log_error "Artifact Registry repository not found: $ARTIFACT_REGISTRY_REPO"
        return 1
    fi
}

verify_storage_bucket() {
    log_section "4. Cloud Storage"

    if gsutil ls -b "gs://${STORAGE_BUCKET_NAME}" &> /dev/null; then
        local location=$(gcloud storage buckets describe "gs://${STORAGE_BUCKET_NAME}" --format="value(location)")
        local storage_class=$(gcloud storage buckets describe "gs://${STORAGE_BUCKET_NAME}" --format="value(storageClass)")

        log_success "Bucket: $STORAGE_BUCKET_NAME"
        log_info "Location: $location"
        log_info "Storage Class: $storage_class"
        log_info "URL: https://storage.googleapis.com/$STORAGE_BUCKET_NAME"

        # Count objects
        local object_count=$(gsutil ls -r "gs://${STORAGE_BUCKET_NAME}/**" 2>/dev/null | wc -l || echo "0")
        log_info "Objects: $object_count"

        # Check public access
        local public_access=$(gcloud storage buckets describe "gs://${STORAGE_BUCKET_NAME}" --format="value(iamConfiguration.publicAccessPrevention)")
        if [ "$public_access" == "inherited" ]; then
            log_success "Public access: Enabled for generated images"
        fi
    else
        log_error "Storage bucket not found: $STORAGE_BUCKET_NAME"
        return 1
    fi
}

verify_redis() {
    log_section "5. Memorystore Redis"

    if gcloud redis instances describe "$REDIS_INSTANCE_NAME" \
        --region="$REGION" \
        --project="$PROJECT_ID" &> /dev/null; then

        local state=$(gcloud redis instances describe "$REDIS_INSTANCE_NAME" \
            --region="$REGION" \
            --project="$PROJECT_ID" \
            --format="value(state)")

        local tier=$(gcloud redis instances describe "$REDIS_INSTANCE_NAME" \
            --region="$REGION" \
            --project="$PROJECT_ID" \
            --format="value(tier)")

        local memory_size=$(gcloud redis instances describe "$REDIS_INSTANCE_NAME" \
            --region="$REGION" \
            --project="$PROJECT_ID" \
            --format="value(memorySizeGb)")

        local version=$(gcloud redis instances describe "$REDIS_INSTANCE_NAME" \
            --region="$REGION" \
            --project="$PROJECT_ID" \
            --format="value(redisVersion)")

        log_success "Redis Instance: $REDIS_INSTANCE_NAME"
        log_info "State: $state"
        log_info "Tier: $tier"
        log_info "Memory: ${memory_size}GB"
        log_info "Version: $version"
        log_info "Host: $REDIS_HOST:$REDIS_PORT"

        if [ "$state" != "READY" ]; then
            log_warning "Redis is not in READY state"
        fi
    else
        log_error "Redis instance not found: $REDIS_INSTANCE_NAME"
        return 1
    fi
}

verify_vpc_connector() {
    log_section "6. VPC Connector"

    local connector_name="${PROJECT_NAME}-${ENVIRONMENT}-connector"

    if gcloud compute networks vpc-access connectors describe "$connector_name" \
        --region="$REGION" \
        --project="$PROJECT_ID" &> /dev/null; then

        local state=$(gcloud compute networks vpc-access connectors describe "$connector_name" \
            --region="$REGION" \
            --project="$PROJECT_ID" \
            --format="value(state)")

        local network=$(gcloud compute networks vpc-access connectors describe "$connector_name" \
            --region="$REGION" \
            --project="$PROJECT_ID" \
            --format="value(network)")

        log_success "VPC Connector: $connector_name"
        log_info "State: $state"
        log_info "Network: $network"

        if [ "$state" != "READY" ]; then
            log_warning "VPC Connector is not in READY state"
        fi
    else
        log_error "VPC Connector not found: $connector_name"
        return 1
    fi
}

verify_pubsub() {
    log_section "7. Cloud Pub/Sub"

    # Check topic
    if gcloud pubsub topics describe "$PUBSUB_TOPIC_NAME" --project="$PROJECT_ID" &> /dev/null; then
        log_success "Topic: $PUBSUB_TOPIC_NAME"
    else
        log_error "Pub/Sub topic not found: $PUBSUB_TOPIC_NAME"
        return 1
    fi

    # Check subscription
    if gcloud pubsub subscriptions describe "$PUBSUB_SUBSCRIPTION_NAME" --project="$PROJECT_ID" &> /dev/null; then
        local ack_deadline=$(gcloud pubsub subscriptions describe "$PUBSUB_SUBSCRIPTION_NAME" \
            --project="$PROJECT_ID" \
            --format="value(ackDeadlineSeconds)")

        log_success "Subscription: $PUBSUB_SUBSCRIPTION_NAME"
        log_info "Ack Deadline: ${ack_deadline}s"

        # Get message counts
        log_info "Checking message counts..."
        gcloud pubsub subscriptions describe "$PUBSUB_SUBSCRIPTION_NAME" \
            --project="$PROJECT_ID" \
            --format="table(numUnacknowledgedMessages,numOutstandingMessages)" \
            2>/dev/null || true
    else
        log_error "Pub/Sub subscription not found: $PUBSUB_SUBSCRIPTION_NAME"
        return 1
    fi
}

verify_secrets() {
    log_section "8. Secret Manager"

    log_info "Secrets:"

    local secrets=(
        "mongodb-connection-string"
        "redis-connection-string"
        "storage-bucket-name"
        "pubsub-topic-name"
        "replicate-api-key"
        "stripe-secret-key"
        "stripe-webhook-secret"
        "google-oauth-client-id"
        "google-oauth-client-secret"
    )

    local found=0
    local total=${#secrets[@]}

    for secret in "${secrets[@]}"; do
        if gcloud secrets describe "$secret" --project="$PROJECT_ID" &> /dev/null; then
            local versions=$(gcloud secrets versions list "$secret" \
                --project="$PROJECT_ID" \
                --format="value(name)" | wc -l)
            log_success "$secret (${versions} versions)"
            ((found++))
        else
            log_warning "$secret (not found)"
        fi
    done

    log_info "Found: $found/$total secrets"
}

verify_backend_service() {
    log_section "9. Backend Cloud Run Service"

    if gcloud run services describe "$BACKEND_SERVICE_NAME" \
        --region="$REGION" \
        --project="$PROJECT_ID" &> /dev/null; then

        local status=$(gcloud run services describe "$BACKEND_SERVICE_NAME" \
            --region="$REGION" \
            --project="$PROJECT_ID" \
            --format="value(status.conditions[0].status)")

        local url=$(gcloud run services describe "$BACKEND_SERVICE_NAME" \
            --region="$REGION" \
            --project="$PROJECT_ID" \
            --format="value(status.url)")

        local image=$(gcloud run services describe "$BACKEND_SERVICE_NAME" \
            --region="$REGION" \
            --project="$PROJECT_ID" \
            --format="value(spec.template.spec.containers[0].image)")

        local cpu=$(gcloud run services describe "$BACKEND_SERVICE_NAME" \
            --region="$REGION" \
            --project="$PROJECT_ID" \
            --format="value(spec.template.spec.containers[0].resources.limits.cpu)")

        local memory=$(gcloud run services describe "$BACKEND_SERVICE_NAME" \
            --region="$REGION" \
            --project="$PROJECT_ID" \
            --format="value(spec.template.spec.containers[0].resources.limits.memory)")

        log_success "Service: $BACKEND_SERVICE_NAME"
        log_info "Status: $status"
        log_info "URL: $url"
        log_info "Image: $image"
        log_info "CPU: $cpu, Memory: $memory"

        # Test health endpoint
        log_info "Testing health endpoint..."
        if curl -s -o /dev/null -w "%{http_code}" "${url}/health" | grep -q "200"; then
            log_success "Health check: PASSED (HTTP 200)"
        else
            log_warning "Health check: FAILED or endpoint not available"
        fi

        # Test API docs
        log_info "Testing API docs..."
        if curl -s -o /dev/null -w "%{http_code}" "${url}/docs" | grep -q "200"; then
            log_success "API docs: Available at ${url}/docs"
        else
            log_warning "API docs: Not available"
        fi
    else
        log_error "Backend service not found: $BACKEND_SERVICE_NAME"
        return 1
    fi
}

verify_worker_service() {
    log_section "10. Worker Cloud Run Service"

    if gcloud run services describe "$WORKER_SERVICE_NAME" \
        --region="$REGION" \
        --project="$PROJECT_ID" &> /dev/null; then

        local status=$(gcloud run services describe "$WORKER_SERVICE_NAME" \
            --region="$REGION" \
            --project="$PROJECT_ID" \
            --format="value(status.conditions[0].status)")

        local image=$(gcloud run services describe "$WORKER_SERVICE_NAME" \
            --region="$REGION" \
            --project="$PROJECT_ID" \
            --format="value(spec.template.spec.containers[0].image)")

        local cpu=$(gcloud run services describe "$WORKER_SERVICE_NAME" \
            --region="$REGION" \
            --project="$PROJECT_ID" \
            --format="value(spec.template.spec.containers[0].resources.limits.cpu)")

        local memory=$(gcloud run services describe "$WORKER_SERVICE_NAME" \
            --region="$REGION" \
            --project="$PROJECT_ID" \
            --format="value(spec.template.spec.containers[0].resources.limits.memory)")

        log_success "Service: $WORKER_SERVICE_NAME"
        log_info "Status: $status"
        log_info "Image: $image"
        log_info "CPU: $cpu, Memory: $memory"
    else
        log_error "Worker service not found: $WORKER_SERVICE_NAME"
        return 1
    fi
}

show_logs() {
    log_section "11. Recent Logs"

    log_info "Backend Service Logs (last 20 lines):"
    gcloud run logs read "$BACKEND_SERVICE_NAME" \
        --project="$PROJECT_ID" \
        --region="$REGION" \
        --limit=20 \
        2>/dev/null || log_warning "Cannot retrieve logs"

    echo ""
    log_info "Worker Service Logs (last 20 lines):"
    gcloud run logs read "$WORKER_SERVICE_NAME" \
        --project="$PROJECT_ID" \
        --region="$REGION" \
        --limit=20 \
        2>/dev/null || log_warning "Cannot retrieve logs"
}

show_cost_estimate() {
    log_section "12. Cost Estimation"

    log_info "Approximate monthly costs (USD):"
    echo ""
    echo "  Cloud Run (Backend):        \$20-100"
    echo "  Cloud Run (Worker):         \$10-50"
    echo "  Memorystore Redis:          \$35-200"
    echo "  Cloud Storage:              \$2-5"
    echo "  Cloud Pub/Sub:              \$1"
    echo "  Artifact Registry:          \$0.10/GB"
    echo "  Secret Manager:             \$0.36"
    echo "  VPC Connector:              \$8"
    echo "  ─────────────────────────────────"
    echo "  Estimated Total:            \$75-400/month"
    echo ""
    log_info "Actual costs depend on usage. Check: https://console.cloud.google.com/billing"
}

################################################################################
# Main Verification
################################################################################

main() {
    echo ""
    echo "================================================================================"
    echo "  GCP Deployment Verification"
    echo "================================================================================"

    verify_project
    verify_service_account
    verify_artifact_registry
    verify_storage_bucket
    verify_redis
    verify_vpc_connector
    verify_pubsub
    verify_secrets
    verify_backend_service
    verify_worker_service

    # Optional: show logs
    echo ""
    read -p "Show recent application logs? (yes/no): " show_logs_confirm
    if [ "$show_logs_confirm" == "yes" ]; then
        show_logs
    fi

    show_cost_estimate

    log_section "Verification Complete"

    log_success "All resources verified successfully!"

    echo ""
    log_info "Next Steps:"
    echo "  1. View API documentation: ${BACKEND_URL}/docs"
    echo "  2. Monitor logs: gcloud run logs tail $BACKEND_SERVICE_NAME --project=$PROJECT_ID"
    echo "  3. Scale services: gcloud run services update $BACKEND_SERVICE_NAME --min-instances=2"
    echo "  4. View metrics: https://console.cloud.google.com/run/detail/$REGION/$BACKEND_SERVICE_NAME/metrics"
    echo "  5. Set up custom domain: gcloud run domain-mappings create --service=$BACKEND_SERVICE_NAME"
    echo ""
}

# Run verification
main "$@"
