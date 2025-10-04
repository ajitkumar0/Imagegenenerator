#!/bin/bash

################################################################################
# Build and Push Docker Images to Azure Container Registry
#
# This script builds Docker images for backend and worker, then pushes them
# to Azure Container Registry (ACR)
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

show_progress() {
    echo -e "${BLUE}==>${NC} $1"
}

################################################################################
# Configuration
################################################################################

# Load deployment outputs
if [ -f "deployment-outputs.txt" ]; then
    source deployment-outputs.txt
else
    log_error "deployment-outputs.txt not found. Run deploy-azure.sh first."
    exit 1
fi

# Get ACR credentials
log_info "Retrieving ACR credentials..."
ACR_USERNAME=$(az acr credential show --name "$ACR_NAME" --query "username" -o tsv)
ACR_PASSWORD=$(az acr credential show --name "$ACR_NAME" --query "passwords[0].value" -o tsv)

# Image names
BACKEND_IMAGE="${ACR_LOGIN_SERVER}/backend:latest"
WORKER_IMAGE="${ACR_LOGIN_SERVER}/worker:latest"

# Paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BACKEND_DIR="$PROJECT_ROOT/backend"
WORKER_DIR="$PROJECT_ROOT/backend"  # Worker uses same codebase

################################################################################
# Validation
################################################################################

validate_environment() {
    log_info "Validating environment..."

    # Check Docker
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed"
        exit 1
    fi

    if ! docker info &> /dev/null; then
        log_error "Docker daemon is not running"
        exit 1
    fi

    # Check directories
    if [ ! -d "$BACKEND_DIR" ]; then
        log_error "Backend directory not found: $BACKEND_DIR"
        exit 1
    fi

    if [ ! -f "$BACKEND_DIR/Dockerfile" ]; then
        log_error "Backend Dockerfile not found: $BACKEND_DIR/Dockerfile"
        exit 1
    fi

    log_success "Environment validation passed"
}

################################################################################
# Docker Login
################################################################################

login_to_acr() {
    show_progress "Logging in to Azure Container Registry"

    log_info "ACR: $ACR_LOGIN_SERVER"

    echo "$ACR_PASSWORD" | docker login "$ACR_LOGIN_SERVER" \
        --username "$ACR_USERNAME" \
        --password-stdin

    log_success "Logged in to ACR"
}

################################################################################
# Build Backend Image
################################################################################

build_backend() {
    show_progress "Building Backend Image"

    log_info "Building backend image: $BACKEND_IMAGE"
    log_info "Context: $BACKEND_DIR"

    docker build \
        --file "$BACKEND_DIR/Dockerfile" \
        --tag "$BACKEND_IMAGE" \
        --tag "${ACR_LOGIN_SERVER}/backend:$(date +%Y%m%d-%H%M%S)" \
        --platform linux/amd64 \
        --build-arg ENVIRONMENT=production \
        "$BACKEND_DIR"

    log_success "Backend image built successfully"
}

################################################################################
# Build Worker Image
################################################################################

build_worker() {
    show_progress "Building Worker Image"

    log_info "Building worker image: $WORKER_IMAGE"
    log_info "Context: $WORKER_DIR"

    # Check if separate worker Dockerfile exists
    if [ -f "$WORKER_DIR/Dockerfile.worker" ]; then
        WORKER_DOCKERFILE="$WORKER_DIR/Dockerfile.worker"
    else
        WORKER_DOCKERFILE="$WORKER_DIR/Dockerfile"
        log_warning "Using same Dockerfile for worker (Dockerfile.worker not found)"
    fi

    docker build \
        --file "$WORKER_DOCKERFILE" \
        --tag "$WORKER_IMAGE" \
        --tag "${ACR_LOGIN_SERVER}/worker:$(date +%Y%m%d-%H%M%S)" \
        --platform linux/amd64 \
        --build-arg ENVIRONMENT=production \
        "$WORKER_DIR"

    log_success "Worker image built successfully"
}

################################################################################
# Push Images
################################################################################

push_images() {
    show_progress "Pushing Images to ACR"

    # Push backend
    log_info "Pushing backend image..."
    docker push "$BACKEND_IMAGE"
    log_success "Backend image pushed"

    # Push worker
    log_info "Pushing worker image..."
    docker push "$WORKER_IMAGE"
    log_success "Worker image pushed"

    # Push timestamped tags
    log_info "Pushing timestamped tags..."
    docker push "${ACR_LOGIN_SERVER}/backend:$(date +%Y%m%d-%H%M%S)" 2>/dev/null || true
    docker push "${ACR_LOGIN_SERVER}/worker:$(date +%Y%m%d-%H%M%S)" 2>/dev/null || true
}

################################################################################
# Update Container Apps
################################################################################

update_container_apps() {
    show_progress "Updating Container Apps"

    # Update backend
    log_info "Updating backend container app..."
    az containerapp update \
        --name "$BACKEND_APP_NAME" \
        --resource-group "$RESOURCE_GROUP" \
        --image "$BACKEND_IMAGE" \
        --output none

    log_success "Backend app updated"

    # Update worker
    log_info "Updating worker container app..."
    az containerapp update \
        --name "$WORKER_APP_NAME" \
        --resource-group "$RESOURCE_GROUP" \
        --image "$WORKER_IMAGE" \
        --output none

    log_success "Worker app updated"
}

################################################################################
# Verify Deployment
################################################################################

verify_deployment() {
    show_progress "Verifying Deployment"

    log_info "Waiting for apps to stabilize (30 seconds)..."
    sleep 30

    # Check backend
    log_info "Checking backend app..."
    local backend_state=$(az containerapp show \
        --name "$BACKEND_APP_NAME" \
        --resource-group "$RESOURCE_GROUP" \
        --query properties.runningStatus -o tsv)

    log_info "Backend status: $backend_state"

    # Check backend health
    local backend_url="https://$BACKEND_FQDN"
    log_info "Testing backend health: $backend_url/health"

    local max_attempts=10
    local attempt=1

    while [ $attempt -le $max_attempts ]; do
        if curl -s -o /dev/null -w "%{http_code}" "$backend_url/health" | grep -q "200"; then
            log_success "Backend is healthy and responding"
            break
        else
            log_warning "Attempt $attempt/$max_attempts: Backend not ready yet..."
            sleep 10
            ((attempt++))
        fi
    done

    if [ $attempt -gt $max_attempts ]; then
        log_error "Backend health check failed after $max_attempts attempts"
        log_info "Check logs: az containerapp logs show --name $BACKEND_APP_NAME --resource-group $RESOURCE_GROUP --follow"
        return 1
    fi

    # Check worker
    log_info "Checking worker app..."
    local worker_state=$(az containerapp show \
        --name "$WORKER_APP_NAME" \
        --resource-group "$RESOURCE_GROUP" \
        --query properties.runningStatus -o tsv)

    log_info "Worker status: $worker_state"

    log_success "Deployment verified successfully"
}

################################################################################
# Show Summary
################################################################################

show_summary() {
    echo ""
    echo "================================================================================"
    log_success "BUILD AND DEPLOYMENT COMPLETED!"
    echo "================================================================================"
    echo ""
    echo "Images Built and Pushed:"
    echo "  Backend: $BACKEND_IMAGE"
    echo "  Worker:  $WORKER_IMAGE"
    echo ""
    echo "Container Apps Updated:"
    echo "  Backend: $BACKEND_APP_NAME"
    echo "  Worker:  $WORKER_APP_NAME"
    echo ""
    echo "Backend API:"
    echo "  URL:  https://$BACKEND_FQDN"
    echo "  Docs: https://$BACKEND_FQDN/docs"
    echo ""
    echo "================================================================================"
    echo ""
    echo "Next Steps:"
    echo ""
    echo "1. View API documentation:"
    echo "   https://$BACKEND_FQDN/docs"
    echo ""
    echo "2. Monitor backend logs:"
    echo "   az containerapp logs show --name $BACKEND_APP_NAME --resource-group $RESOURCE_GROUP --follow"
    echo ""
    echo "3. Monitor worker logs:"
    echo "   az containerapp logs show --name $WORKER_APP_NAME --resource-group $RESOURCE_GROUP --follow"
    echo ""
    echo "4. Update frontend environment variable:"
    echo "   NEXT_PUBLIC_API_URL=https://$BACKEND_FQDN"
    echo ""
    echo "5. Scale apps if needed:"
    echo "   az containerapp update --name $BACKEND_APP_NAME --resource-group $RESOURCE_GROUP --min-replicas 2 --max-replicas 20"
    echo ""
    echo "================================================================================"
}

################################################################################
# Main Execution
################################################################################

main() {
    echo ""
    echo "================================================================================"
    echo "  Build and Push Docker Images"
    echo "================================================================================"
    echo ""

    validate_environment
    login_to_acr

    # Build images
    build_backend
    build_worker

    # Push images
    push_images

    # Update container apps
    log_info ""
    read -p "Update Container Apps with new images? (yes/no): " update_confirm
    if [ "$update_confirm" == "yes" ]; then
        update_container_apps
        verify_deployment
    else
        log_warning "Skipped Container Apps update"
        log_info "To update manually, run:"
        echo "  az containerapp update --name $BACKEND_APP_NAME --resource-group $RESOURCE_GROUP --image $BACKEND_IMAGE"
        echo "  az containerapp update --name $WORKER_APP_NAME --resource-group $RESOURCE_GROUP --image $WORKER_IMAGE"
    fi

    show_summary
}

# Run main function
main "$@"
