#!/bin/bash

################################################################################
# Azure Resource Cleanup Script
#
# This script deletes all Azure resources created by deploy-azure.sh
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
if [ -f "deploy-config.env" ]; then
    source deploy-config.env
else
    log_error "deploy-config.env not found!"
    exit 1
fi

# Resource names
ENVIRONMENT="${ENVIRONMENT:-prod}"
PROJECT_NAME="${PROJECT_NAME:-imggen}"
RESOURCE_GROUP="${PROJECT_NAME}-${ENVIRONMENT}-rg"

################################################################################
# Validation
################################################################################

if ! az account show &> /dev/null; then
    log_error "Not logged in to Azure. Run: az login"
    exit 1
fi

if ! az group show --name "$RESOURCE_GROUP" &> /dev/null; then
    log_error "Resource group '$RESOURCE_GROUP' does not exist"
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
echo "This will DELETE the following resource group and ALL resources within it:"
echo ""
echo "  Resource Group: $RESOURCE_GROUP"
echo "  Environment:    $ENVIRONMENT"
echo ""
echo "This includes:"
echo "  - Container Registry (ACR)"
echo "  - Cosmos DB database and all data"
echo "  - Storage Account and all blobs"
echo "  - Redis Cache"
echo "  - Service Bus and all messages"
echo "  - Key Vault and all secrets"
echo "  - Container Apps"
echo "  - Managed Identity"
echo ""
log_error "THIS ACTION CANNOT BE UNDONE!"
echo ""
echo "================================================================================"
echo ""

read -p "Type 'DELETE' to confirm deletion: " confirm
if [ "$confirm" != "DELETE" ]; then
    log_warning "Deletion cancelled"
    exit 0
fi

echo ""
read -p "Are you absolutely sure? Type 'yes' to proceed: " confirm2
if [ "$confirm2" != "yes" ]; then
    log_warning "Deletion cancelled"
    exit 0
fi

################################################################################
# Deletion
################################################################################

echo ""
log_info "Starting resource deletion..."
echo ""

# List all resources in the group
log_info "Resources to be deleted:"
az resource list --resource-group "$RESOURCE_GROUP" --query "[].{Name:name, Type:type}" -o table

echo ""
log_warning "Deleting resource group '$RESOURCE_GROUP' (this may take 5-10 minutes)..."

az group delete \
    --name "$RESOURCE_GROUP" \
    --yes \
    --no-wait

log_success "Deletion initiated"
log_info "Resources are being deleted in the background"

echo ""
echo "To check deletion status, run:"
echo "  az group show --name $RESOURCE_GROUP"
echo ""
echo "Once deleted, you will see: 'ResourceGroupNotFound'"
echo ""

################################################################################
# Cleanup local files
################################################################################

echo ""
read -p "Delete local deployment outputs? (yes/no): " cleanup_local
if [ "$cleanup_local" == "yes" ]; then
    if [ -f "deployment-outputs.txt" ]; then
        rm deployment-outputs.txt
        log_success "Deleted deployment-outputs.txt"
    fi
fi

log_success "Cleanup complete"
