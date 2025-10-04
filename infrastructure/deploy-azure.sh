#!/bin/bash

################################################################################
# Azure Infrastructure Deployment Script
#
# This script deploys the complete infrastructure for the AI Image Generator
# platform on Azure, including:
# - Resource Group
# - Azure Container Registry (ACR)
# - Azure Cosmos DB (MongoDB API)
# - Azure Storage Account (Blob Storage)
# - Azure Cache for Redis
# - Azure Service Bus
# - Azure Key Vault
# - Azure Container Apps Environment
# - Azure Container App
# - Managed Identity & RBAC roles
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

# Progress indicator
show_progress() {
    echo -e "${BLUE}==>${NC} $1"
}

################################################################################
# Configuration Variables
################################################################################

# Load configuration from file if exists
if [ -f "deploy-config.env" ]; then
    log_info "Loading configuration from deploy-config.env"
    source deploy-config.env
else
    log_warning "No deploy-config.env found, using default values"
fi

# Core Settings
ENVIRONMENT="${ENVIRONMENT:-prod}"
LOCATION="${LOCATION:-eastus}"
PROJECT_NAME="${PROJECT_NAME:-imggen}"

# Resource Naming (following Azure naming conventions)
RESOURCE_GROUP="${PROJECT_NAME}-${ENVIRONMENT}-rg"
ACR_NAME="${PROJECT_NAME}${ENVIRONMENT}acr"  # Must be alphanumeric, 5-50 chars
COSMOS_DB_NAME="${PROJECT_NAME}-${ENVIRONMENT}-cosmos"
STORAGE_ACCOUNT_NAME="${PROJECT_NAME}${ENVIRONMENT}stor"  # Must be lowercase, 3-24 chars
REDIS_NAME="${PROJECT_NAME}-${ENVIRONMENT}-redis"
SERVICE_BUS_NAME="${PROJECT_NAME}-${ENVIRONMENT}-sb"
KEY_VAULT_NAME="${PROJECT_NAME}-${ENVIRONMENT}-kv"
CONTAINER_ENV_NAME="${PROJECT_NAME}-${ENVIRONMENT}-env"
BACKEND_APP_NAME="${PROJECT_NAME}-backend-${ENVIRONMENT}"
WORKER_APP_NAME="${PROJECT_NAME}-worker-${ENVIRONMENT}"
MANAGED_IDENTITY_NAME="${PROJECT_NAME}-${ENVIRONMENT}-id"

# Container Images (will be updated after build)
BACKEND_IMAGE="${ACR_NAME}.azurecr.io/backend:latest"
WORKER_IMAGE="${ACR_NAME}.azurecr.io/worker:latest"

# Cosmos DB Settings
COSMOS_DB_DATABASE_NAME="image_generator"

# Service Bus Settings
SERVICE_BUS_QUEUE_NAME="generation-requests"

# Storage Account Settings
STORAGE_CONTAINER_NAME="generated-images"

# Redis Settings
REDIS_SKU="${REDIS_SKU:-Basic}"
REDIS_VM_SIZE="${REDIS_VM_SIZE:-C0}"

# Container Apps Settings
BACKEND_CPU="${BACKEND_CPU:-0.5}"
BACKEND_MEMORY="${BACKEND_MEMORY:-1.0Gi}"
BACKEND_MIN_REPLICAS="${BACKEND_MIN_REPLICAS:-1}"
BACKEND_MAX_REPLICAS="${BACKEND_MAX_REPLICAS:-10}"

WORKER_CPU="${WORKER_CPU:-0.5}"
WORKER_MEMORY="${WORKER_MEMORY:-1.0Gi}"
WORKER_MIN_REPLICAS="${WORKER_MIN_REPLICAS:-1}"
WORKER_MAX_REPLICAS="${WORKER_MAX_REPLICAS:-5}"

# External Services (must be provided)
REPLICATE_API_KEY="${REPLICATE_API_KEY:-}"
STRIPE_SECRET_KEY="${STRIPE_SECRET_KEY:-}"
STRIPE_WEBHOOK_SECRET="${STRIPE_WEBHOOK_SECRET:-}"
AZURE_AD_B2C_TENANT_ID="${AZURE_AD_B2C_TENANT_ID:-}"
AZURE_AD_B2C_CLIENT_ID="${AZURE_AD_B2C_CLIENT_ID:-}"

################################################################################
# Validation
################################################################################

validate_config() {
    log_info "Validating configuration..."

    local errors=0

    # Check Azure CLI
    if ! command -v az &> /dev/null; then
        log_error "Azure CLI is not installed. Install from: https://docs.microsoft.com/cli/azure/install-azure-cli"
        ((errors++))
    fi

    # Check if logged in
    if ! az account show &> /dev/null; then
        log_error "Not logged in to Azure. Run: az login"
        ((errors++))
    fi

    # Validate required external secrets
    if [ -z "$REPLICATE_API_KEY" ]; then
        log_warning "REPLICATE_API_KEY is not set. This is required for image generation."
        ((errors++))
    fi

    if [ -z "$STRIPE_SECRET_KEY" ]; then
        log_warning "STRIPE_SECRET_KEY is not set. This is required for payments."
        ((errors++))
    fi

    if [ -z "$AZURE_AD_B2C_TENANT_ID" ] || [ -z "$AZURE_AD_B2C_CLIENT_ID" ]; then
        log_warning "Azure AD B2C credentials not set. Authentication will not work."
        ((errors++))
    fi

    # Validate naming conventions
    if [ ${#ACR_NAME} -lt 5 ] || [ ${#ACR_NAME} -gt 50 ]; then
        log_error "ACR name must be 5-50 characters: $ACR_NAME"
        ((errors++))
    fi

    if [ ${#STORAGE_ACCOUNT_NAME} -lt 3 ] || [ ${#STORAGE_ACCOUNT_NAME} -gt 24 ]; then
        log_error "Storage account name must be 3-24 characters: $STORAGE_ACCOUNT_NAME"
        ((errors++))
    fi

    if [ $errors -gt 0 ]; then
        log_error "Configuration validation failed with $errors error(s)"
        exit 1
    fi

    log_success "Configuration validation passed"
}

################################################################################
# Step 1: Create Resource Group
################################################################################

create_resource_group() {
    show_progress "Step 1/12: Creating Resource Group"

    if az group show --name "$RESOURCE_GROUP" &> /dev/null; then
        log_warning "Resource group '$RESOURCE_GROUP' already exists"
    else
        log_info "Creating resource group '$RESOURCE_GROUP' in '$LOCATION'"
        az group create \
            --name "$RESOURCE_GROUP" \
            --location "$LOCATION" \
            --tags \
                Environment="$ENVIRONMENT" \
                Project="$PROJECT_NAME" \
                ManagedBy="deploy-script"

        log_success "Resource group created"
    fi
}

################################################################################
# Step 2: Create Azure Container Registry
################################################################################

create_container_registry() {
    show_progress "Step 2/12: Creating Azure Container Registry"

    if az acr show --name "$ACR_NAME" --resource-group "$RESOURCE_GROUP" &> /dev/null; then
        log_warning "Container registry '$ACR_NAME' already exists"
    else
        log_info "Creating container registry '$ACR_NAME'"
        az acr create \
            --name "$ACR_NAME" \
            --resource-group "$RESOURCE_GROUP" \
            --location "$LOCATION" \
            --sku Standard \
            --admin-enabled true

        log_success "Container registry created"
    fi

    # Get ACR credentials
    log_info "Retrieving ACR credentials"
    ACR_USERNAME=$(az acr credential show --name "$ACR_NAME" --query "username" -o tsv)
    ACR_PASSWORD=$(az acr credential show --name "$ACR_NAME" --query "passwords[0].value" -o tsv)
    ACR_LOGIN_SERVER=$(az acr show --name "$ACR_NAME" --query "loginServer" -o tsv)

    log_success "ACR credentials retrieved"
}

################################################################################
# Step 3: Create Azure Cosmos DB (MongoDB API)
################################################################################

create_cosmos_db() {
    show_progress "Step 3/12: Creating Azure Cosmos DB"

    if az cosmosdb show --name "$COSMOS_DB_NAME" --resource-group "$RESOURCE_GROUP" &> /dev/null; then
        log_warning "Cosmos DB account '$COSMOS_DB_NAME' already exists"
    else
        log_info "Creating Cosmos DB account '$COSMOS_DB_NAME' (this may take 5-10 minutes)"
        az cosmosdb create \
            --name "$COSMOS_DB_NAME" \
            --resource-group "$RESOURCE_GROUP" \
            --location "$LOCATION" \
            --kind MongoDB \
            --server-version 4.2 \
            --default-consistency-level Session \
            --enable-automatic-failover false \
            --locations regionName="$LOCATION" failoverPriority=0 isZoneRedundant=false

        log_success "Cosmos DB account created"
    fi

    # Create database
    log_info "Creating database '$COSMOS_DB_DATABASE_NAME'"
    az cosmosdb mongodb database create \
        --account-name "$COSMOS_DB_NAME" \
        --resource-group "$RESOURCE_GROUP" \
        --name "$COSMOS_DB_DATABASE_NAME" \
        --throughput 400 \
        || log_warning "Database may already exist"

    # Create collections
    log_info "Creating MongoDB collections"

    # Users collection
    az cosmosdb mongodb collection create \
        --account-name "$COSMOS_DB_NAME" \
        --resource-group "$RESOURCE_GROUP" \
        --database-name "$COSMOS_DB_DATABASE_NAME" \
        --name users \
        --shard "user_id" \
        --throughput 400 \
        || log_warning "Users collection may already exist"

    # Generations collection
    az cosmosdb mongodb collection create \
        --account-name "$COSMOS_DB_NAME" \
        --resource-group "$RESOURCE_GROUP" \
        --database-name "$COSMOS_DB_DATABASE_NAME" \
        --name generations \
        --shard "generation_id" \
        --throughput 400 \
        || log_warning "Generations collection may already exist"

    # Subscriptions collection
    az cosmosdb mongodb collection create \
        --account-name "$COSMOS_DB_NAME" \
        --resource-group "$RESOURCE_GROUP" \
        --database-name "$COSMOS_DB_DATABASE_NAME" \
        --name subscriptions \
        --shard "user_id" \
        --throughput 400 \
        || log_warning "Subscriptions collection may already exist"

    # Get connection string
    log_info "Retrieving Cosmos DB connection string"
    COSMOS_CONNECTION_STRING=$(az cosmosdb keys list \
        --name "$COSMOS_DB_NAME" \
        --resource-group "$RESOURCE_GROUP" \
        --type connection-strings \
        --query "connectionStrings[0].connectionString" -o tsv)

    log_success "Cosmos DB configured"
}

################################################################################
# Step 4: Create Azure Storage Account
################################################################################

create_storage_account() {
    show_progress "Step 4/12: Creating Azure Storage Account"

    if az storage account show --name "$STORAGE_ACCOUNT_NAME" --resource-group "$RESOURCE_GROUP" &> /dev/null; then
        log_warning "Storage account '$STORAGE_ACCOUNT_NAME' already exists"
    else
        log_info "Creating storage account '$STORAGE_ACCOUNT_NAME'"
        az storage account create \
            --name "$STORAGE_ACCOUNT_NAME" \
            --resource-group "$RESOURCE_GROUP" \
            --location "$LOCATION" \
            --sku Standard_LRS \
            --kind StorageV2 \
            --access-tier Hot \
            --allow-blob-public-access true \
            --min-tls-version TLS1_2

        log_success "Storage account created"
    fi

    # Get storage account key
    log_info "Retrieving storage account key"
    STORAGE_ACCOUNT_KEY=$(az storage account keys list \
        --account-name "$STORAGE_ACCOUNT_NAME" \
        --resource-group "$RESOURCE_GROUP" \
        --query "[0].value" -o tsv)

    # Create blob container
    log_info "Creating blob container '$STORAGE_CONTAINER_NAME'"
    az storage container create \
        --name "$STORAGE_CONTAINER_NAME" \
        --account-name "$STORAGE_ACCOUNT_NAME" \
        --account-key "$STORAGE_ACCOUNT_KEY" \
        --public-access blob \
        || log_warning "Container may already exist"

    # Get blob endpoint
    STORAGE_BLOB_ENDPOINT=$(az storage account show \
        --name "$STORAGE_ACCOUNT_NAME" \
        --resource-group "$RESOURCE_GROUP" \
        --query "primaryEndpoints.blob" -o tsv)

    # Create connection string
    STORAGE_CONNECTION_STRING="DefaultEndpointsProtocol=https;AccountName=${STORAGE_ACCOUNT_NAME};AccountKey=${STORAGE_ACCOUNT_KEY};EndpointSuffix=core.windows.net"

    log_success "Storage account configured"
}

################################################################################
# Step 5: Create Azure Cache for Redis
################################################################################

create_redis_cache() {
    show_progress "Step 5/12: Creating Azure Cache for Redis"

    if az redis show --name "$REDIS_NAME" --resource-group "$RESOURCE_GROUP" &> /dev/null; then
        log_warning "Redis cache '$REDIS_NAME' already exists"
    else
        log_info "Creating Redis cache '$REDIS_NAME' (this may take 10-20 minutes)"
        az redis create \
            --name "$REDIS_NAME" \
            --resource-group "$RESOURCE_GROUP" \
            --location "$LOCATION" \
            --sku "$REDIS_SKU" \
            --vm-size "$REDIS_VM_SIZE" \
            --enable-non-ssl-port false \
            --minimum-tls-version 1.2

        log_success "Redis cache created"
    fi

    # Get Redis connection details
    log_info "Retrieving Redis connection details"
    REDIS_HOST=$(az redis show \
        --name "$REDIS_NAME" \
        --resource-group "$RESOURCE_GROUP" \
        --query "hostName" -o tsv)

    REDIS_PORT=$(az redis show \
        --name "$REDIS_NAME" \
        --resource-group "$RESOURCE_GROUP" \
        --query "sslPort" -o tsv)

    REDIS_KEY=$(az redis list-keys \
        --name "$REDIS_NAME" \
        --resource-group "$RESOURCE_GROUP" \
        --query "primaryKey" -o tsv)

    REDIS_CONNECTION_STRING="rediss://:${REDIS_KEY}@${REDIS_HOST}:${REDIS_PORT}/0?ssl_cert_reqs=required"

    log_success "Redis cache configured"
}

################################################################################
# Step 6: Create Azure Service Bus
################################################################################

create_service_bus() {
    show_progress "Step 6/12: Creating Azure Service Bus"

    if az servicebus namespace show --name "$SERVICE_BUS_NAME" --resource-group "$RESOURCE_GROUP" &> /dev/null; then
        log_warning "Service Bus namespace '$SERVICE_BUS_NAME' already exists"
    else
        log_info "Creating Service Bus namespace '$SERVICE_BUS_NAME'"
        az servicebus namespace create \
            --name "$SERVICE_BUS_NAME" \
            --resource-group "$RESOURCE_GROUP" \
            --location "$LOCATION" \
            --sku Standard

        log_success "Service Bus namespace created"
    fi

    # Create queue
    log_info "Creating Service Bus queue '$SERVICE_BUS_QUEUE_NAME'"
    az servicebus queue create \
        --name "$SERVICE_BUS_QUEUE_NAME" \
        --namespace-name "$SERVICE_BUS_NAME" \
        --resource-group "$RESOURCE_GROUP" \
        --max-delivery-count 10 \
        --lock-duration PT5M \
        --default-message-time-to-live P14D \
        --enable-dead-lettering-on-message-expiration true \
        || log_warning "Queue may already exist"

    # Get connection string
    log_info "Retrieving Service Bus connection string"
    SERVICE_BUS_CONNECTION_STRING=$(az servicebus namespace authorization-rule keys list \
        --namespace-name "$SERVICE_BUS_NAME" \
        --resource-group "$RESOURCE_GROUP" \
        --name RootManageSharedAccessKey \
        --query "primaryConnectionString" -o tsv)

    log_success "Service Bus configured"
}

################################################################################
# Step 7: Create Azure Key Vault
################################################################################

create_key_vault() {
    show_progress "Step 7/12: Creating Azure Key Vault"

    if az keyvault show --name "$KEY_VAULT_NAME" --resource-group "$RESOURCE_GROUP" &> /dev/null; then
        log_warning "Key Vault '$KEY_VAULT_NAME' already exists"
    else
        log_info "Creating Key Vault '$KEY_VAULT_NAME'"
        az keyvault create \
            --name "$KEY_VAULT_NAME" \
            --resource-group "$RESOURCE_GROUP" \
            --location "$LOCATION" \
            --enable-rbac-authorization false \
            --enabled-for-deployment true \
            --enabled-for-template-deployment true

        log_success "Key Vault created"
    fi

    # Get current user object ID for access policy
    CURRENT_USER_OBJECT_ID=$(az ad signed-in-user show --query id -o tsv)

    # Set access policy for current user
    log_info "Setting Key Vault access policy"
    az keyvault set-policy \
        --name "$KEY_VAULT_NAME" \
        --resource-group "$RESOURCE_GROUP" \
        --object-id "$CURRENT_USER_OBJECT_ID" \
        --secret-permissions get list set delete \
        || log_warning "Access policy may already be set"

    log_success "Key Vault configured"
}

################################################################################
# Step 8: Store Secrets in Key Vault
################################################################################

store_secrets() {
    show_progress "Step 8/12: Storing Secrets in Key Vault"

    log_info "Storing infrastructure secrets"

    # Cosmos DB
    az keyvault secret set --vault-name "$KEY_VAULT_NAME" \
        --name "cosmos-connection-string" \
        --value "$COSMOS_CONNECTION_STRING" \
        --output none

    # Storage Account
    az keyvault secret set --vault-name "$KEY_VAULT_NAME" \
        --name "storage-connection-string" \
        --value "$STORAGE_CONNECTION_STRING" \
        --output none

    az keyvault secret set --vault-name "$KEY_VAULT_NAME" \
        --name "storage-account-name" \
        --value "$STORAGE_ACCOUNT_NAME" \
        --output none

    az keyvault secret set --vault-name "$KEY_VAULT_NAME" \
        --name "storage-account-key" \
        --value "$STORAGE_ACCOUNT_KEY" \
        --output none

    # Redis
    az keyvault secret set --vault-name "$KEY_VAULT_NAME" \
        --name "redis-connection-string" \
        --value "$REDIS_CONNECTION_STRING" \
        --output none

    # Service Bus
    az keyvault secret set --vault-name "$KEY_VAULT_NAME" \
        --name "service-bus-connection-string" \
        --value "$SERVICE_BUS_CONNECTION_STRING" \
        --output none

    # ACR
    az keyvault secret set --vault-name "$KEY_VAULT_NAME" \
        --name "acr-username" \
        --value "$ACR_USERNAME" \
        --output none

    az keyvault secret set --vault-name "$KEY_VAULT_NAME" \
        --name "acr-password" \
        --value "$ACR_PASSWORD" \
        --output none

    # External services (if provided)
    if [ -n "$REPLICATE_API_KEY" ]; then
        az keyvault secret set --vault-name "$KEY_VAULT_NAME" \
            --name "replicate-api-key" \
            --value "$REPLICATE_API_KEY" \
            --output none
    fi

    if [ -n "$STRIPE_SECRET_KEY" ]; then
        az keyvault secret set --vault-name "$KEY_VAULT_NAME" \
            --name "stripe-secret-key" \
            --value "$STRIPE_SECRET_KEY" \
            --output none
    fi

    if [ -n "$STRIPE_WEBHOOK_SECRET" ]; then
        az keyvault secret set --vault-name "$KEY_VAULT_NAME" \
            --name "stripe-webhook-secret" \
            --value "$STRIPE_WEBHOOK_SECRET" \
            --output none
    fi

    if [ -n "$AZURE_AD_B2C_TENANT_ID" ]; then
        az keyvault secret set --vault-name "$KEY_VAULT_NAME" \
            --name "azure-ad-b2c-tenant-id" \
            --value "$AZURE_AD_B2C_TENANT_ID" \
            --output none
    fi

    if [ -n "$AZURE_AD_B2C_CLIENT_ID" ]; then
        az keyvault secret set --vault-name "$KEY_VAULT_NAME" \
            --name "azure-ad-b2c-client-id" \
            --value "$AZURE_AD_B2C_CLIENT_ID" \
            --output none
    fi

    log_success "Secrets stored in Key Vault"
}

################################################################################
# Step 9: Create Managed Identity
################################################################################

create_managed_identity() {
    show_progress "Step 9/12: Creating Managed Identity"

    if az identity show --name "$MANAGED_IDENTITY_NAME" --resource-group "$RESOURCE_GROUP" &> /dev/null; then
        log_warning "Managed Identity '$MANAGED_IDENTITY_NAME' already exists"
    else
        log_info "Creating Managed Identity '$MANAGED_IDENTITY_NAME'"
        az identity create \
            --name "$MANAGED_IDENTITY_NAME" \
            --resource-group "$RESOURCE_GROUP" \
            --location "$LOCATION"

        log_success "Managed Identity created"
    fi

    # Get identity details
    MANAGED_IDENTITY_ID=$(az identity show \
        --name "$MANAGED_IDENTITY_NAME" \
        --resource-group "$RESOURCE_GROUP" \
        --query "id" -o tsv)

    MANAGED_IDENTITY_CLIENT_ID=$(az identity show \
        --name "$MANAGED_IDENTITY_NAME" \
        --resource-group "$RESOURCE_GROUP" \
        --query "clientId" -o tsv)

    MANAGED_IDENTITY_PRINCIPAL_ID=$(az identity show \
        --name "$MANAGED_IDENTITY_NAME" \
        --resource-group "$RESOURCE_GROUP" \
        --query "principalId" -o tsv)

    log_info "Managed Identity Principal ID: $MANAGED_IDENTITY_PRINCIPAL_ID"
}

################################################################################
# Step 10: Assign RBAC Roles
################################################################################

assign_rbac_roles() {
    show_progress "Step 10/12: Assigning RBAC Roles"

    # Wait for identity propagation
    log_info "Waiting for identity propagation (30 seconds)..."
    sleep 30

    # Get resource IDs
    STORAGE_ACCOUNT_ID=$(az storage account show \
        --name "$STORAGE_ACCOUNT_NAME" \
        --resource-group "$RESOURCE_GROUP" \
        --query "id" -o tsv)

    COSMOS_DB_ID=$(az cosmosdb show \
        --name "$COSMOS_DB_NAME" \
        --resource-group "$RESOURCE_GROUP" \
        --query "id" -o tsv)

    SERVICE_BUS_ID=$(az servicebus namespace show \
        --name "$SERVICE_BUS_NAME" \
        --resource-group "$RESOURCE_GROUP" \
        --query "id" -o tsv)

    # Storage Blob Data Contributor
    log_info "Assigning Storage Blob Data Contributor role"
    az role assignment create \
        --assignee "$MANAGED_IDENTITY_PRINCIPAL_ID" \
        --role "Storage Blob Data Contributor" \
        --scope "$STORAGE_ACCOUNT_ID" \
        || log_warning "Role may already be assigned"

    # Cosmos DB Account Reader Role
    log_info "Assigning Cosmos DB Account Reader Role"
    az role assignment create \
        --assignee "$MANAGED_IDENTITY_PRINCIPAL_ID" \
        --role "Cosmos DB Account Reader Role" \
        --scope "$COSMOS_DB_ID" \
        || log_warning "Role may already be assigned"

    # Azure Service Bus Data Owner
    log_info "Assigning Azure Service Bus Data Owner role"
    az role assignment create \
        --assignee "$MANAGED_IDENTITY_PRINCIPAL_ID" \
        --role "Azure Service Bus Data Owner" \
        --scope "$SERVICE_BUS_ID" \
        || log_warning "Role may already be assigned"

    # ACR Pull
    ACR_ID=$(az acr show \
        --name "$ACR_NAME" \
        --resource-group "$RESOURCE_GROUP" \
        --query "id" -o tsv)

    log_info "Assigning AcrPull role"
    az role assignment create \
        --assignee "$MANAGED_IDENTITY_PRINCIPAL_ID" \
        --role "AcrPull" \
        --scope "$ACR_ID" \
        || log_warning "Role may already be assigned"

    # Key Vault Secrets User
    KEY_VAULT_ID=$(az keyvault show \
        --name "$KEY_VAULT_NAME" \
        --resource-group "$RESOURCE_GROUP" \
        --query "id" -o tsv)

    log_info "Setting Key Vault access policy for Managed Identity"
    az keyvault set-policy \
        --name "$KEY_VAULT_NAME" \
        --object-id "$MANAGED_IDENTITY_PRINCIPAL_ID" \
        --secret-permissions get list \
        || log_warning "Access policy may already be set"

    log_success "RBAC roles assigned"
}

################################################################################
# Step 11: Create Container Apps Environment
################################################################################

create_container_apps_environment() {
    show_progress "Step 11/12: Creating Container Apps Environment"

    if az containerapp env show --name "$CONTAINER_ENV_NAME" --resource-group "$RESOURCE_GROUP" &> /dev/null; then
        log_warning "Container Apps Environment '$CONTAINER_ENV_NAME' already exists"
    else
        log_info "Creating Container Apps Environment '$CONTAINER_ENV_NAME'"
        az containerapp env create \
            --name "$CONTAINER_ENV_NAME" \
            --resource-group "$RESOURCE_GROUP" \
            --location "$LOCATION"

        log_success "Container Apps Environment created"
    fi
}

################################################################################
# Step 12: Create Container Apps
################################################################################

create_container_apps() {
    show_progress "Step 12/12: Creating Container Apps"

    # Backend App
    log_info "Creating backend container app"
    if az containerapp show --name "$BACKEND_APP_NAME" --resource-group "$RESOURCE_GROUP" &> /dev/null; then
        log_warning "Backend app already exists, updating..."
        az containerapp update \
            --name "$BACKEND_APP_NAME" \
            --resource-group "$RESOURCE_GROUP" \
            --image "$BACKEND_IMAGE" \
            --cpu "$BACKEND_CPU" \
            --memory "$BACKEND_MEMORY" \
            --min-replicas "$BACKEND_MIN_REPLICAS" \
            --max-replicas "$BACKEND_MAX_REPLICAS"
    else
        az containerapp create \
            --name "$BACKEND_APP_NAME" \
            --resource-group "$RESOURCE_GROUP" \
            --environment "$CONTAINER_ENV_NAME" \
            --image "$BACKEND_IMAGE" \
            --target-port 8000 \
            --ingress external \
            --cpu "$BACKEND_CPU" \
            --memory "$BACKEND_MEMORY" \
            --min-replicas "$BACKEND_MIN_REPLICAS" \
            --max-replicas "$BACKEND_MAX_REPLICAS" \
            --user-assigned "$MANAGED_IDENTITY_ID" \
            --registry-server "$ACR_LOGIN_SERVER" \
            --registry-username "$ACR_USERNAME" \
            --registry-password "$ACR_PASSWORD" \
            --secrets \
                cosmos-conn-str="$COSMOS_CONNECTION_STRING" \
                storage-conn-str="$STORAGE_CONNECTION_STRING" \
                redis-conn-str="$REDIS_CONNECTION_STRING" \
                service-bus-conn-str="$SERVICE_BUS_CONNECTION_STRING" \
                replicate-api-key="$REPLICATE_API_KEY" \
                stripe-secret-key="$STRIPE_SECRET_KEY" \
                stripe-webhook-secret="$STRIPE_WEBHOOK_SECRET" \
                azure-ad-tenant-id="$AZURE_AD_B2C_TENANT_ID" \
                azure-ad-client-id="$AZURE_AD_B2C_CLIENT_ID" \
            --env-vars \
                ENVIRONMENT="$ENVIRONMENT" \
                MONGODB_CONNECTION_STRING=secretref:cosmos-conn-str \
                AZURE_STORAGE_CONNECTION_STRING=secretref:storage-conn-str \
                REDIS_URL=secretref:redis-conn-str \
                SERVICE_BUS_CONNECTION_STRING=secretref:service-bus-conn-str \
                SERVICE_BUS_QUEUE_NAME="$SERVICE_BUS_QUEUE_NAME" \
                STORAGE_CONTAINER_NAME="$STORAGE_CONTAINER_NAME" \
                REPLICATE_API_TOKEN=secretref:replicate-api-key \
                STRIPE_SECRET_KEY=secretref:stripe-secret-key \
                STRIPE_WEBHOOK_SECRET=secretref:stripe-webhook-secret \
                AZURE_AD_B2C_TENANT_ID=secretref:azure-ad-tenant-id \
                AZURE_AD_B2C_CLIENT_ID=secretref:azure-ad-client-id

        log_success "Backend app created"
    fi

    # Worker App
    log_info "Creating worker container app"
    if az containerapp show --name "$WORKER_APP_NAME" --resource-group "$RESOURCE_GROUP" &> /dev/null; then
        log_warning "Worker app already exists, updating..."
        az containerapp update \
            --name "$WORKER_APP_NAME" \
            --resource-group "$RESOURCE_GROUP" \
            --image "$WORKER_IMAGE" \
            --cpu "$WORKER_CPU" \
            --memory "$WORKER_MEMORY" \
            --min-replicas "$WORKER_MIN_REPLICAS" \
            --max-replicas "$WORKER_MAX_REPLICAS"
    else
        az containerapp create \
            --name "$WORKER_APP_NAME" \
            --resource-group "$RESOURCE_GROUP" \
            --environment "$CONTAINER_ENV_NAME" \
            --image "$WORKER_IMAGE" \
            --cpu "$WORKER_CPU" \
            --memory "$WORKER_MEMORY" \
            --min-replicas "$WORKER_MIN_REPLICAS" \
            --max-replicas "$WORKER_MAX_REPLICAS" \
            --user-assigned "$MANAGED_IDENTITY_ID" \
            --registry-server "$ACR_LOGIN_SERVER" \
            --registry-username "$ACR_USERNAME" \
            --registry-password "$ACR_PASSWORD" \
            --secrets \
                cosmos-conn-str="$COSMOS_CONNECTION_STRING" \
                storage-conn-str="$STORAGE_CONNECTION_STRING" \
                redis-conn-str="$REDIS_CONNECTION_STRING" \
                service-bus-conn-str="$SERVICE_BUS_CONNECTION_STRING" \
                replicate-api-key="$REPLICATE_API_KEY" \
            --env-vars \
                ENVIRONMENT="$ENVIRONMENT" \
                MONGODB_CONNECTION_STRING=secretref:cosmos-conn-str \
                AZURE_STORAGE_CONNECTION_STRING=secretref:storage-conn-str \
                REDIS_URL=secretref:redis-conn-str \
                SERVICE_BUS_CONNECTION_STRING=secretref:service-bus-conn-str \
                SERVICE_BUS_QUEUE_NAME="$SERVICE_BUS_QUEUE_NAME" \
                STORAGE_CONTAINER_NAME="$STORAGE_CONTAINER_NAME" \
                REPLICATE_API_TOKEN=secretref:replicate-api-key

        log_success "Worker app created"
    fi

    # Get backend FQDN
    BACKEND_FQDN=$(az containerapp show \
        --name "$BACKEND_APP_NAME" \
        --resource-group "$RESOURCE_GROUP" \
        --query "properties.configuration.ingress.fqdn" -o tsv)

    log_success "Container Apps created"
    log_info "Backend URL: https://$BACKEND_FQDN"
}

################################################################################
# Deployment Summary
################################################################################

print_summary() {
    echo ""
    echo "================================================================================"
    log_success "DEPLOYMENT COMPLETED SUCCESSFULLY!"
    echo "================================================================================"
    echo ""
    echo "Resource Group:        $RESOURCE_GROUP"
    echo "Location:              $LOCATION"
    echo "Environment:           $ENVIRONMENT"
    echo ""
    echo "--- Container Registry ---"
    echo "Name:                  $ACR_NAME"
    echo "Login Server:          $ACR_LOGIN_SERVER"
    echo ""
    echo "--- Cosmos DB ---"
    echo "Account:               $COSMOS_DB_NAME"
    echo "Database:              $COSMOS_DB_DATABASE_NAME"
    echo ""
    echo "--- Storage Account ---"
    echo "Name:                  $STORAGE_ACCOUNT_NAME"
    echo "Container:             $STORAGE_CONTAINER_NAME"
    echo "Endpoint:              $STORAGE_BLOB_ENDPOINT"
    echo ""
    echo "--- Redis Cache ---"
    echo "Name:                  $REDIS_NAME"
    echo "Host:                  $REDIS_HOST"
    echo ""
    echo "--- Service Bus ---"
    echo "Namespace:             $SERVICE_BUS_NAME"
    echo "Queue:                 $SERVICE_BUS_QUEUE_NAME"
    echo ""
    echo "--- Key Vault ---"
    echo "Name:                  $KEY_VAULT_NAME"
    echo ""
    echo "--- Managed Identity ---"
    echo "Name:                  $MANAGED_IDENTITY_NAME"
    echo "Client ID:             $MANAGED_IDENTITY_CLIENT_ID"
    echo ""
    echo "--- Container Apps ---"
    echo "Environment:           $CONTAINER_ENV_NAME"
    echo "Backend App:           $BACKEND_APP_NAME"
    echo "Worker App:            $WORKER_APP_NAME"
    echo "Backend URL:           https://$BACKEND_FQDN"
    echo ""
    echo "================================================================================"
    echo ""
    echo "Next Steps:"
    echo "1. Build and push container images:"
    echo "   ./build-and-push.sh"
    echo ""
    echo "2. Verify deployment:"
    echo "   ./verify-deployment.sh"
    echo ""
    echo "3. View logs:"
    echo "   az containerapp logs show --name $BACKEND_APP_NAME --resource-group $RESOURCE_GROUP --follow"
    echo ""
    echo "4. Update frontend .env.local with backend URL:"
    echo "   NEXT_PUBLIC_API_URL=https://$BACKEND_FQDN"
    echo ""
    echo "================================================================================"
}

################################################################################
# Main Execution
################################################################################

main() {
    echo ""
    echo "================================================================================"
    echo "  Azure Infrastructure Deployment"
    echo "  Project: $PROJECT_NAME"
    echo "  Environment: $ENVIRONMENT"
    echo "  Location: $LOCATION"
    echo "================================================================================"
    echo ""

    # Validate configuration
    validate_config

    # Confirm deployment
    echo ""
    read -p "Do you want to proceed with deployment? (yes/no): " confirm
    if [ "$confirm" != "yes" ]; then
        log_warning "Deployment cancelled"
        exit 0
    fi

    echo ""
    log_info "Starting deployment..."
    echo ""

    # Execute deployment steps
    create_resource_group
    create_container_registry
    create_cosmos_db
    create_storage_account
    create_redis_cache
    create_service_bus
    create_key_vault
    store_secrets
    create_managed_identity
    assign_rbac_roles
    create_container_apps_environment
    create_container_apps

    # Print summary
    print_summary

    # Save outputs to file
    cat > deployment-outputs.txt << EOF
RESOURCE_GROUP=$RESOURCE_GROUP
ACR_NAME=$ACR_NAME
ACR_LOGIN_SERVER=$ACR_LOGIN_SERVER
COSMOS_DB_NAME=$COSMOS_DB_NAME
STORAGE_ACCOUNT_NAME=$STORAGE_ACCOUNT_NAME
REDIS_NAME=$REDIS_NAME
SERVICE_BUS_NAME=$SERVICE_BUS_NAME
KEY_VAULT_NAME=$KEY_VAULT_NAME
MANAGED_IDENTITY_NAME=$MANAGED_IDENTITY_NAME
MANAGED_IDENTITY_CLIENT_ID=$MANAGED_IDENTITY_CLIENT_ID
CONTAINER_ENV_NAME=$CONTAINER_ENV_NAME
BACKEND_APP_NAME=$BACKEND_APP_NAME
WORKER_APP_NAME=$WORKER_APP_NAME
BACKEND_FQDN=$BACKEND_FQDN
BACKEND_URL=https://$BACKEND_FQDN
EOF

    log_success "Deployment outputs saved to deployment-outputs.txt"
}

# Run main function
main "$@"
