#!/bin/bash

################################################################################
# Build and Deploy Docker Images to Google Cloud Run
#
# This script builds Docker images for backend and worker, pushes them
# to Artifact Registry, and deploys to Cloud Run
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
if [ -f "gcp-deployment-outputs.txt" ]; then
    source gcp-deployment-outputs.txt
else
    log_error "gcp-deployment-outputs.txt not found. Run deploy-gcp.sh first."
    exit 1
fi

# Image names
BACKEND_IMAGE="${ARTIFACT_REGISTRY_URL}/backend:latest"
BACKEND_IMAGE_TAG="${ARTIFACT_REGISTRY_URL}/backend:$(date +%Y%m%d-%H%M%S)"
WORKER_IMAGE="${ARTIFACT_REGISTRY_URL}/worker:latest"
WORKER_IMAGE_TAG="${ARTIFACT_REGISTRY_URL}/worker:$(date +%Y%m%d-%H%M%S)"

# Paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BACKEND_DIR="$PROJECT_ROOT/backend"

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

    # Check gcloud
    if ! command -v gcloud &> /dev/null; then
        log_error "gcloud CLI is not installed"
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

    # Set project
    gcloud config set project "$PROJECT_ID" --quiet

    log_success "Environment validation passed"
}

################################################################################
# Docker Authentication
################################################################################

configure_docker_auth() {
    show_progress "Configuring Docker Authentication"

    log_info "Configuring Docker for Artifact Registry"
    gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet

    log_success "Docker authentication configured"
}

################################################################################
# Build Backend Image
################################################################################

build_backend() {
    show_progress "Building Backend Image"

    log_info "Building backend image: $BACKEND_IMAGE"
    log_info "Context: $BACKEND_DIR"

    # Build for linux/amd64 platform (Cloud Run requirement)
    docker build \
        --file "$BACKEND_DIR/Dockerfile" \
        --tag "$BACKEND_IMAGE" \
        --tag "$BACKEND_IMAGE_TAG" \
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
    log_info "Context: $BACKEND_DIR"

    # Check if separate worker Dockerfile exists
    if [ -f "$BACKEND_DIR/Dockerfile.worker" ]; then
        WORKER_DOCKERFILE="$BACKEND_DIR/Dockerfile.worker"
    else
        WORKER_DOCKERFILE="$BACKEND_DIR/Dockerfile"
        log_warning "Using same Dockerfile for worker (Dockerfile.worker not found)"
    fi

    docker build \
        --file "$WORKER_DOCKERFILE" \
        --tag "$WORKER_IMAGE" \
        --tag "$WORKER_IMAGE_TAG" \
        --platform linux/amd64 \
        --build-arg ENVIRONMENT=production \
        "$BACKEND_DIR"

    log_success "Worker image built successfully"
}

################################################################################
# Push Images to Artifact Registry
################################################################################

push_images() {
    show_progress "Pushing Images to Artifact Registry"

    # Push backend
    log_info "Pushing backend image..."
    docker push "$BACKEND_IMAGE"
    docker push "$BACKEND_IMAGE_TAG"
    log_success "Backend image pushed"

    # Push worker
    log_info "Pushing worker image..."
    docker push "$WORKER_IMAGE"
    docker push "$WORKER_IMAGE_TAG"
    log_success "Worker image pushed"

    log_info "Images available at:"
    echo "  Backend: $BACKEND_IMAGE"
    echo "  Worker:  $WORKER_IMAGE"
}

################################################################################
# Alternative: Build with Cloud Build (faster for large images)
################################################################################

build_with_cloud_build() {
    show_progress "Building with Cloud Build (Alternative Method)"

    log_info "This method builds images in the cloud (faster for large images)"

    # Build backend
    log_info "Building backend with Cloud Build..."
    gcloud builds submit "$BACKEND_DIR" \
        --project="$PROJECT_ID" \
        --region="$REGION" \
        --tag="$BACKEND_IMAGE" \
        --timeout=20m

    log_success "Backend built with Cloud Build"

    # Build worker
    if [ -f "$BACKEND_DIR/Dockerfile.worker" ]; then
        log_info "Building worker with Cloud Build..."
        gcloud builds submit "$BACKEND_DIR" \
            --project="$PROJECT_ID" \
            --region="$REGION" \
            --tag="$WORKER_IMAGE" \
            --config=- <<EOF
steps:
  - name: 'gcr.io/cloud-builders/docker'
    args: ['build', '-t', '$WORKER_IMAGE', '-f', 'Dockerfile.worker', '.']
images:
  - '$WORKER_IMAGE'
EOF
        log_success "Worker built with Cloud Build"
    else
        log_warning "Using same image for worker"
    fi
}

################################################################################
# Deploy to Cloud Run
################################################################################

deploy_backend() {
    show_progress "Deploying Backend to Cloud Run"

    log_info "Deploying backend service: $BACKEND_SERVICE_NAME"

    # Get VPC connector if exists
    local vpc_connector=""
    if [ -n "${VPC_CONNECTOR:-}" ]; then
        vpc_connector="--vpc-connector=$VPC_CONNECTOR"
    fi

    gcloud run deploy "$BACKEND_SERVICE_NAME" \
        --project="$PROJECT_ID" \
        --region="$REGION" \
        --image="$BACKEND_IMAGE" \
        --platform=managed \
        --service-account="$SERVICE_ACCOUNT_EMAIL" \
        --allow-unauthenticated \
        --port=8000 \
        --timeout=300 \
        $vpc_connector \
        --no-traffic \
        --tag=latest

    log_info "Waiting for deployment to complete..."
    sleep 5

    # Route 100% traffic to latest revision
    log_info "Routing traffic to new revision..."
    gcloud run services update-traffic "$BACKEND_SERVICE_NAME" \
        --project="$PROJECT_ID" \
        --region="$REGION" \
        --to-latest

    # Get service URL
    BACKEND_URL=$(gcloud run services describe "$BACKEND_SERVICE_NAME" \
        --project="$PROJECT_ID" \
        --region="$REGION" \
        --format="value(status.url)")

    log_success "Backend deployed: $BACKEND_URL"
}

deploy_worker() {
    show_progress "Deploying Worker to Cloud Run"

    log_info "Deploying worker service: $WORKER_SERVICE_NAME"

    # Get VPC connector if exists
    local vpc_connector=""
    if [ -n "${VPC_CONNECTOR:-}" ]; then
        vpc_connector="--vpc-connector=$VPC_CONNECTOR"
    fi

    gcloud run deploy "$WORKER_SERVICE_NAME" \
        --project="$PROJECT_ID" \
        --region="$REGION" \
        --image="$WORKER_IMAGE" \
        --platform=managed \
        --service-account="$SERVICE_ACCOUNT_EMAIL" \
        --no-allow-unauthenticated \
        --timeout=3600 \
        $vpc_connector \
        --no-traffic \
        --tag=latest

    log_info "Waiting for deployment to complete..."
    sleep 5

    # Route 100% traffic to latest revision
    log_info "Routing traffic to new revision..."
    gcloud run services update-traffic "$WORKER_SERVICE_NAME" \
        --project="$PROJECT_ID" \
        --region="$REGION" \
        --to-latest

    log_success "Worker deployed"
}

################################################################################
# Verify Deployment
################################################################################

verify_deployment() {
    show_progress "Verifying Deployment"

    log_info "Waiting for services to stabilize (20 seconds)..."
    sleep 20

    # Check backend
    log_info "Checking backend service..."
    local backend_status=$(gcloud run services describe "$BACKEND_SERVICE_NAME" \
        --project="$PROJECT_ID" \
        --region="$REGION" \
        --format="value(status.conditions[0].status)")

    log_info "Backend status: $backend_status"

    # Test backend health
    log_info "Testing backend health: $BACKEND_URL/health"

    local max_attempts=10
    local attempt=1

    while [ $attempt -le $max_attempts ]; do
        local http_code=$(curl -s -o /dev/null -w "%{http_code}" "$BACKEND_URL/health" || echo "000")

        if [ "$http_code" == "200" ]; then
            log_success "Backend is healthy and responding (HTTP 200)"
            break
        else
            log_warning "Attempt $attempt/$max_attempts: Backend not ready yet (HTTP $http_code)..."
            sleep 10
            ((attempt++))
        fi
    done

    if [ $attempt -gt $max_attempts ]; then
        log_error "Backend health check failed after $max_attempts attempts"
        log_info "Check logs: gcloud run logs read $BACKEND_SERVICE_NAME --project=$PROJECT_ID --region=$REGION --limit=50"
        return 1
    fi

    # Check worker
    log_info "Checking worker service..."
    local worker_status=$(gcloud run services describe "$WORKER_SERVICE_NAME" \
        --project="$PROJECT_ID" \
        --region="$REGION" \
        --format="value(status.conditions[0].status)")

    log_info "Worker status: $worker_status"

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
    echo "Cloud Run Services Deployed:"
    echo "  Backend: $BACKEND_SERVICE_NAME"
    echo "  Worker:  $WORKER_SERVICE_NAME"
    echo ""
    echo "Backend API:"
    echo "  URL:  $BACKEND_URL"
    echo "  Docs: $BACKEND_URL/docs"
    echo ""
    echo "================================================================================"
    echo ""
    echo "Next Steps:"
    echo ""
    echo "1. Test API:"
    echo "   curl $BACKEND_URL/health"
    echo "   open $BACKEND_URL/docs"
    echo ""
    echo "2. View backend logs:"
    echo "   gcloud run logs tail $BACKEND_SERVICE_NAME --project=$PROJECT_ID"
    echo ""
    echo "3. View worker logs:"
    echo "   gcloud run logs tail $WORKER_SERVICE_NAME --project=$PROJECT_ID"
    echo ""
    echo "4. Update frontend environment variable:"
    echo "   NEXT_PUBLIC_API_URL=$BACKEND_URL"
    echo ""
    echo "5. Monitor service:"
    echo "   https://console.cloud.google.com/run/detail/$REGION/$BACKEND_SERVICE_NAME/metrics"
    echo ""
    echo "6. Set up custom domain (optional):"
    echo "   gcloud run domain-mappings create --service=$BACKEND_SERVICE_NAME --domain=api.yourdomain.com"
    echo ""
    echo "7. Configure auto-scaling (if needed):"
    echo "   gcloud run services update $BACKEND_SERVICE_NAME --min-instances=2 --max-instances=20"
    echo ""
    echo "================================================================================"
}

################################################################################
# Main Execution
################################################################################

main() {
    echo ""
    echo "================================================================================"
    echo "  Build and Deploy to Google Cloud Run"
    echo "================================================================================"
    echo ""

    validate_environment
    configure_docker_auth

    # Ask user which build method to use
    echo ""
    echo "Build Methods:"
    echo "  1. Local Docker build (build on your machine, then push)"
    echo "  2. Cloud Build (build in the cloud, faster for large images)"
    echo ""
    read -p "Select build method (1 or 2): " build_method

    if [ "$build_method" == "2" ]; then
        build_with_cloud_build
    else
        # Build images locally
        build_backend
        build_worker

        # Push images
        push_images
    fi

    # Deploy services
    echo ""
    read -p "Deploy to Cloud Run? (yes/no): " deploy_confirm
    if [ "$deploy_confirm" == "yes" ]; then
        deploy_backend
        deploy_worker
        verify_deployment
    else
        log_warning "Skipped Cloud Run deployment"
        log_info "To deploy manually, run:"
        echo "  gcloud run deploy $BACKEND_SERVICE_NAME --image=$BACKEND_IMAGE --region=$REGION --project=$PROJECT_ID"
        echo "  gcloud run deploy $WORKER_SERVICE_NAME --image=$WORKER_IMAGE --region=$REGION --project=$PROJECT_ID"
        exit 0
    fi

    show_summary

    # Update outputs file with new backend URL
    if [ -f "gcp-deployment-outputs.txt" ]; then
        # Update BACKEND_URL in outputs file
        sed -i.bak "s|^BACKEND_URL=.*|BACKEND_URL=$BACKEND_URL|" gcp-deployment-outputs.txt
        rm gcp-deployment-outputs.txt.bak
        log_success "Updated gcp-deployment-outputs.txt with new backend URL"
    fi
}

# Run main function
main "$@"
