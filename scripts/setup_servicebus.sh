#!/bin/bash

# Azure Service Bus Setup Script
# Creates Service Bus namespace, queue, and configures RBAC for Managed Identity

set -e

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

echo_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

echo_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Configuration
RESOURCE_GROUP="imagegen-rg"
LOCATION="eastus"
SERVICEBUS_NAMESPACE="imagegen-servicebus"
QUEUE_NAME="image-generation-queue"
DEAD_LETTER_QUEUE_NAME="${QUEUE_NAME}-dlq"

# Check if Azure CLI is installed
if ! command -v az &> /dev/null; then
    echo_error "Azure CLI is not installed. Please install it first."
    exit 1
fi

# Check if logged in
echo_info "Checking Azure CLI authentication..."
az account show > /dev/null 2>&1 || {
    echo_error "Not logged in to Azure CLI. Please run 'az login' first."
    exit 1
}

SUBSCRIPTION_ID=$(az account show --query id -o tsv)
echo_info "Using subscription: $SUBSCRIPTION_ID"

# Step 1: Create Resource Group (if not exists)
echo_info "Creating resource group..."
az group create \
    --name $RESOURCE_GROUP \
    --location $LOCATION \
    --tags application=ImageGenerator environment=Production \
    || echo_warning "Resource group already exists"

# Step 2: Create Service Bus Namespace
echo_info "Creating Service Bus namespace..."
az servicebus namespace create \
    --resource-group $RESOURCE_GROUP \
    --name $SERVICEBUS_NAMESPACE \
    --location $LOCATION \
    --sku Standard \
    --tags application=ImageGenerator component=ServiceBus \
    || echo_warning "Service Bus namespace already exists"

# Wait for namespace to be ready
echo_info "Waiting for Service Bus namespace to be ready..."
sleep 10

# Step 3: Create Queue with Configuration
echo_info "Creating Service Bus queue: $QUEUE_NAME"
az servicebus queue create \
    --resource-group $RESOURCE_GROUP \
    --namespace-name $SERVICEBUS_NAMESPACE \
    --name $QUEUE_NAME \
    --enable-dead-lettering-on-message-expiration true \
    --max-delivery-count 3 \
    --lock-duration PT5M \
    --default-message-time-to-live PT5M \
    --enable-duplicate-detection true \
    --duplicate-detection-history-time-window PT10M \
    --enable-partitioning false \
    --max-size 1024 \
    || echo_warning "Queue already exists"

echo_info "Queue created successfully with configuration:"
echo_info "  - Dead-letter enabled: true"
echo_info "  - Max delivery count: 3"
echo_info "  - Lock duration: 5 minutes"
echo_info "  - Message TTL: 5 minutes"
echo_info "  - Duplicate detection: enabled (10 minutes window)"

# Step 4: Get Container App Managed Identity
echo_info "Getting Container App managed identities..."

# Get API Container App Identity
API_IDENTITY=$(az containerapp show \
    --name imagegen-api \
    --resource-group $RESOURCE_GROUP \
    --query identity.principalId -o tsv 2>/dev/null || echo "")

if [ -z "$API_IDENTITY" ]; then
    echo_warning "API Container App not found. Skipping API RBAC assignment."
else
    echo_info "API Identity: $API_IDENTITY"
fi

# Get Worker Container App Identity
WORKER_IDENTITY=$(az containerapp show \
    --name imagegen-worker \
    --resource-group $RESOURCE_GROUP \
    --query identity.principalId -o tsv 2>/dev/null || echo "")

if [ -z "$WORKER_IDENTITY" ]; then
    echo_warning "Worker Container App not found. Skipping Worker RBAC assignment."
else
    echo_info "Worker Identity: $WORKER_IDENTITY"
fi

# Get Service Bus resource ID
SERVICEBUS_ID=$(az servicebus namespace show \
    --resource-group $RESOURCE_GROUP \
    --name $SERVICEBUS_NAMESPACE \
    --query id -o tsv)

# Step 5: Assign RBAC Roles
echo_info "Assigning RBAC roles..."

# Assign Azure Service Bus Data Sender to API (for sending messages)
if [ -n "$API_IDENTITY" ]; then
    echo_info "Assigning 'Azure Service Bus Data Sender' to API..."
    az role assignment create \
        --assignee $API_IDENTITY \
        --role "Azure Service Bus Data Sender" \
        --scope $SERVICEBUS_ID \
        || echo_warning "Role already assigned"
fi

# Assign Azure Service Bus Data Receiver to Worker (for receiving messages)
if [ -n "$WORKER_IDENTITY" ]; then
    echo_info "Assigning 'Azure Service Bus Data Receiver' to Worker..."
    az role assignment create \
        --assignee $WORKER_IDENTITY \
        --role "Azure Service Bus Data Receiver" \
        --scope $SERVICEBUS_ID \
        || echo_warning "Role already assigned"
fi

# Step 6: Create Monitoring Alerts
echo_info "Creating monitoring alerts..."

# Alert for dead-letter queue depth
az monitor metrics alert create \
    --name "${QUEUE_NAME}-dlq-alert" \
    --resource-group $RESOURCE_GROUP \
    --scopes $SERVICEBUS_ID \
    --condition "avg DeadletteredMessages > 10" \
    --window-size 5m \
    --evaluation-frequency 1m \
    --description "Alert when dead-letter queue has more than 10 messages" \
    --severity 2 \
    || echo_warning "Alert already exists"

# Alert for queue depth (high load)
az monitor metrics alert create \
    --name "${QUEUE_NAME}-depth-alert" \
    --resource-group $RESOURCE_GROUP \
    --scopes $SERVICEBUS_ID \
    --condition "avg ActiveMessages > 100" \
    --window-size 5m \
    --evaluation-frequency 1m \
    --description "Alert when queue depth exceeds 100 messages" \
    --severity 3 \
    || echo_warning "Alert already exists"

# Step 7: Display Connection Information
echo_info "======================================"
echo_info "Service Bus Setup Complete!"
echo_info "======================================"
echo_info "Namespace: $SERVICEBUS_NAMESPACE"
echo_info "Queue Name: $QUEUE_NAME"
echo_info "Fully Qualified Namespace: ${SERVICEBUS_NAMESPACE}.servicebus.windows.net"
echo_info ""
echo_info "Environment Variables to Set:"
echo_info "  AZURE_SERVICEBUS_NAMESPACE=$SERVICEBUS_NAMESPACE"
echo_info "  SERVICEBUS_QUEUE_NAME=$QUEUE_NAME"
echo_info ""
echo_info "RBAC Roles Assigned:"
if [ -n "$API_IDENTITY" ]; then
    echo_info "  ✓ API: Azure Service Bus Data Sender"
fi
if [ -n "$WORKER_IDENTITY" ]; then
    echo_info "  ✓ Worker: Azure Service Bus Data Receiver"
fi
echo_info ""
echo_info "Next Steps:"
echo_info "1. Update Container App environment variables"
echo_info "2. Deploy updated API and Worker containers"
echo_info "3. Monitor queue metrics in Azure Portal"
echo_info "======================================"

# Step 8: Test Queue Access (Optional)
read -p "Test queue access with current Azure CLI credentials? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo_info "Sending test message to queue..."

    # Send test message
    az servicebus queue send \
        --resource-group $RESOURCE_GROUP \
        --namespace-name $SERVICEBUS_NAMESPACE \
        --name $QUEUE_NAME \
        --body '{"test": "message", "timestamp": "'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'"}'

    echo_info "Test message sent successfully!"
    echo_info "Check Azure Portal to verify message delivery."
fi

echo_info "Setup script completed successfully!"
