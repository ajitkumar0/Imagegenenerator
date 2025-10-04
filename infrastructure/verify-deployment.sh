#!/bin/bash

################################################################################
# Azure Deployment Verification Script
#
# Checks the status and health of all deployed Azure resources
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
if [ -f "deployment-outputs.txt" ]; then
    source deployment-outputs.txt
else
    log_error "deployment-outputs.txt not found. Run deploy-azure.sh first."
    exit 1
fi

################################################################################
# Verification Functions
################################################################################

verify_resource_group() {
    log_section "1. Resource Group"

    if az group show --name "$RESOURCE_GROUP" &> /dev/null; then
        local location=$(az group show --name "$RESOURCE_GROUP" --query location -o tsv)
        local state=$(az group show --name "$RESOURCE_GROUP" --query properties.provisioningState -o tsv)

        log_success "Resource Group: $RESOURCE_GROUP"
        log_info "Location: $location"
        log_info "State: $state"

        # Count resources
        local count=$(az resource list --resource-group "$RESOURCE_GROUP" --query "length(@)" -o tsv)
        log_info "Total Resources: $count"
    else
        log_error "Resource Group not found: $RESOURCE_GROUP"
        return 1
    fi
}

verify_container_registry() {
    log_section "2. Container Registry"

    if az acr show --name "$ACR_NAME" --resource-group "$RESOURCE_GROUP" &> /dev/null; then
        local login_server=$(az acr show --name "$ACR_NAME" --query loginServer -o tsv)
        local sku=$(az acr show --name "$ACR_NAME" --query sku.name -o tsv)
        local admin_enabled=$(az acr show --name "$ACR_NAME" --query adminUserEnabled -o tsv)

        log_success "Container Registry: $ACR_NAME"
        log_info "Login Server: $login_server"
        log_info "SKU: $sku"
        log_info "Admin Enabled: $admin_enabled"

        # List repositories
        local repos=$(az acr repository list --name "$ACR_NAME" --query "length(@)" -o tsv 2>/dev/null || echo "0")
        log_info "Repositories: $repos"

        if [ "$repos" -gt 0 ]; then
            log_info "Repository List:"
            az acr repository list --name "$ACR_NAME" -o table
        else
            log_warning "No container images found. Run build-and-push.sh"
        fi
    else
        log_error "Container Registry not found: $ACR_NAME"
        return 1
    fi
}

verify_cosmos_db() {
    log_section "3. Cosmos DB"

    if az cosmosdb show --name "$COSMOS_DB_NAME" --resource-group "$RESOURCE_GROUP" &> /dev/null; then
        local state=$(az cosmosdb show --name "$COSMOS_DB_NAME" --resource-group "$RESOURCE_GROUP" --query provisioningState -o tsv)
        local kind=$(az cosmosdb show --name "$COSMOS_DB_NAME" --resource-group "$RESOURCE_GROUP" --query kind -o tsv)
        local consistency=$(az cosmosdb show --name "$COSMOS_DB_NAME" --resource-group "$RESOURCE_GROUP" --query consistencyPolicy.defaultConsistencyLevel -o tsv)

        log_success "Cosmos DB: $COSMOS_DB_NAME"
        log_info "State: $state"
        log_info "Kind: $kind"
        log_info "Consistency: $consistency"

        # List databases
        log_info "MongoDB Databases:"
        az cosmosdb mongodb database list \
            --account-name "$COSMOS_DB_NAME" \
            --resource-group "$RESOURCE_GROUP" \
            --query "[].{Name:name}" -o table

        # List collections in main database
        log_info "Collections in image_generator database:"
        az cosmosdb mongodb collection list \
            --account-name "$COSMOS_DB_NAME" \
            --resource-group "$RESOURCE_GROUP" \
            --database-name image_generator \
            --query "[].{Name:name, ShardKey:shardKey}" -o table 2>/dev/null || log_warning "Database not yet initialized"
    else
        log_error "Cosmos DB not found: $COSMOS_DB_NAME"
        return 1
    fi
}

verify_storage_account() {
    log_section "4. Storage Account"

    if az storage account show --name "$STORAGE_ACCOUNT_NAME" --resource-group "$RESOURCE_GROUP" &> /dev/null; then
        local state=$(az storage account show --name "$STORAGE_ACCOUNT_NAME" --resource-group "$RESOURCE_GROUP" --query provisioningState -o tsv)
        local sku=$(az storage account show --name "$STORAGE_ACCOUNT_NAME" --resource-group "$RESOURCE_GROUP" --query sku.name -o tsv)
        local kind=$(az storage account show --name "$STORAGE_ACCOUNT_NAME" --resource-group "$RESOURCE_GROUP" --query kind -o tsv)
        local endpoint=$(az storage account show --name "$STORAGE_ACCOUNT_NAME" --resource-group "$RESOURCE_GROUP" --query primaryEndpoints.blob -o tsv)

        log_success "Storage Account: $STORAGE_ACCOUNT_NAME"
        log_info "State: $state"
        log_info "SKU: $sku"
        log_info "Kind: $kind"
        log_info "Blob Endpoint: $endpoint"

        # List containers
        log_info "Blob Containers:"
        az storage container list \
            --account-name "$STORAGE_ACCOUNT_NAME" \
            --auth-mode login \
            --query "[].{Name:name, PublicAccess:properties.publicAccess}" -o table 2>/dev/null || \
            log_warning "Cannot list containers (may need RBAC role)"
    else
        log_error "Storage Account not found: $STORAGE_ACCOUNT_NAME"
        return 1
    fi
}

verify_redis() {
    log_section "5. Redis Cache"

    if az redis show --name "$REDIS_NAME" --resource-group "$RESOURCE_GROUP" &> /dev/null; then
        local state=$(az redis show --name "$REDIS_NAME" --resource-group "$RESOURCE_GROUP" --query provisioningState -o tsv)
        local sku=$(az redis show --name "$REDIS_NAME" --resource-group "$RESOURCE_GROUP" --query sku.name -o tsv)
        local size=$(az redis show --name "$REDIS_NAME" --resource-group "$RESOURCE_GROUP" --query sku.family -o tsv)
        local capacity=$(az redis show --name "$REDIS_NAME" --resource-group "$RESOURCE_GROUP" --query sku.capacity -o tsv)
        local host=$(az redis show --name "$REDIS_NAME" --resource-group "$RESOURCE_GROUP" --query hostName -o tsv)
        local port=$(az redis show --name "$REDIS_NAME" --resource-group "$RESOURCE_GROUP" --query sslPort -o tsv)

        log_success "Redis Cache: $REDIS_NAME"
        log_info "State: $state"
        log_info "SKU: $sku $size$capacity"
        log_info "Host: $host:$port"
        log_info "SSL: Enabled"
    else
        log_error "Redis Cache not found: $REDIS_NAME"
        return 1
    fi
}

verify_service_bus() {
    log_section "6. Service Bus"

    if az servicebus namespace show --name "$SERVICE_BUS_NAME" --resource-group "$RESOURCE_GROUP" &> /dev/null; then
        local state=$(az servicebus namespace show --name "$SERVICE_BUS_NAME" --resource-group "$RESOURCE_GROUP" --query provisioningState -o tsv)
        local sku=$(az servicebus namespace show --name "$SERVICE_BUS_NAME" --resource-group "$RESOURCE_GROUP" --query sku.name -o tsv)
        local endpoint=$(az servicebus namespace show --name "$SERVICE_BUS_NAME" --resource-group "$RESOURCE_GROUP" --query serviceBusEndpoint -o tsv)

        log_success "Service Bus: $SERVICE_BUS_NAME"
        log_info "State: $state"
        log_info "SKU: $sku"
        log_info "Endpoint: $endpoint"

        # List queues
        log_info "Queues:"
        az servicebus queue list \
            --namespace-name "$SERVICE_BUS_NAME" \
            --resource-group "$RESOURCE_GROUP" \
            --query "[].{Name:name, MaxDeliveryCount:maxDeliveryCount, Status:status}" -o table

        # Show queue metrics
        local queue_name="generation-requests"
        local active=$(az servicebus queue show \
            --namespace-name "$SERVICE_BUS_NAME" \
            --resource-group "$RESOURCE_GROUP" \
            --name "$queue_name" \
            --query countDetails.activeMessageCount -o tsv 2>/dev/null || echo "N/A")
        local dead=$(az servicebus queue show \
            --namespace-name "$SERVICE_BUS_NAME" \
            --resource-group "$RESOURCE_GROUP" \
            --name "$queue_name" \
            --query countDetails.deadLetterMessageCount -o tsv 2>/dev/null || echo "N/A")

        log_info "Queue '$queue_name': Active=$active, Dead-Letter=$dead"
    else
        log_error "Service Bus not found: $SERVICE_BUS_NAME"
        return 1
    fi
}

verify_key_vault() {
    log_section "7. Key Vault"

    if az keyvault show --name "$KEY_VAULT_NAME" --resource-group "$RESOURCE_GROUP" &> /dev/null; then
        local state=$(az keyvault show --name "$KEY_VAULT_NAME" --resource-group "$RESOURCE_GROUP" --query properties.provisioningState -o tsv)
        local vault_uri=$(az keyvault show --name "$KEY_VAULT_NAME" --resource-group "$RESOURCE_GROUP" --query properties.vaultUri -o tsv)
        local sku=$(az keyvault show --name "$KEY_VAULT_NAME" --resource-group "$RESOURCE_GROUP" --query properties.sku.name -o tsv)

        log_success "Key Vault: $KEY_VAULT_NAME"
        log_info "State: $state"
        log_info "SKU: $sku"
        log_info "URI: $vault_uri"

        # List secrets
        log_info "Secrets:"
        az keyvault secret list \
            --vault-name "$KEY_VAULT_NAME" \
            --query "[].{Name:name, Enabled:attributes.enabled}" -o table 2>/dev/null || \
            log_warning "Cannot list secrets (may need access policy)"
    else
        log_error "Key Vault not found: $KEY_VAULT_NAME"
        return 1
    fi
}

verify_managed_identity() {
    log_section "8. Managed Identity"

    if az identity show --name "$MANAGED_IDENTITY_NAME" --resource-group "$RESOURCE_GROUP" &> /dev/null; then
        local client_id=$(az identity show --name "$MANAGED_IDENTITY_NAME" --resource-group "$RESOURCE_GROUP" --query clientId -o tsv)
        local principal_id=$(az identity show --name "$MANAGED_IDENTITY_NAME" --resource-group "$RESOURCE_GROUP" --query principalId -o tsv)

        log_success "Managed Identity: $MANAGED_IDENTITY_NAME"
        log_info "Client ID: $client_id"
        log_info "Principal ID: $principal_id"

        # List role assignments
        log_info "Role Assignments:"
        az role assignment list \
            --assignee "$principal_id" \
            --query "[].{Role:roleDefinitionName, Scope:scope}" -o table
    else
        log_error "Managed Identity not found: $MANAGED_IDENTITY_NAME"
        return 1
    fi
}

verify_container_apps() {
    log_section "9. Container Apps"

    # Check environment
    if az containerapp env show --name "$CONTAINER_ENV_NAME" --resource-group "$RESOURCE_GROUP" &> /dev/null; then
        local env_state=$(az containerapp env show --name "$CONTAINER_ENV_NAME" --resource-group "$RESOURCE_GROUP" --query properties.provisioningState -o tsv)

        log_success "Container Apps Environment: $CONTAINER_ENV_NAME"
        log_info "State: $env_state"
    else
        log_error "Container Apps Environment not found: $CONTAINER_ENV_NAME"
        return 1
    fi

    # Check backend app
    echo ""
    log_info "Backend App:"
    if az containerapp show --name "$BACKEND_APP_NAME" --resource-group "$RESOURCE_GROUP" &> /dev/null; then
        local backend_state=$(az containerapp show --name "$BACKEND_APP_NAME" --resource-group "$RESOURCE_GROUP" --query properties.provisioningState -o tsv)
        local backend_fqdn=$(az containerapp show --name "$BACKEND_APP_NAME" --resource-group "$RESOURCE_GROUP" --query properties.configuration.ingress.fqdn -o tsv)
        local backend_replicas=$(az containerapp show --name "$BACKEND_APP_NAME" --resource-group "$RESOURCE_GROUP" --query properties.template.scale.minReplicas -o tsv)

        log_success "Backend: $BACKEND_APP_NAME"
        log_info "State: $backend_state"
        log_info "URL: https://$backend_fqdn"
        log_info "Min Replicas: $backend_replicas"

        # Check health
        log_info "Testing backend health endpoint..."
        if curl -s -o /dev/null -w "%{http_code}" "https://$backend_fqdn/health" | grep -q "200"; then
            log_success "Backend is responding (HTTP 200)"
        else
            log_warning "Backend health check failed or endpoint not available"
        fi
    else
        log_error "Backend app not found: $BACKEND_APP_NAME"
    fi

    # Check worker app
    echo ""
    log_info "Worker App:"
    if az containerapp show --name "$WORKER_APP_NAME" --resource-group "$RESOURCE_GROUP" &> /dev/null; then
        local worker_state=$(az containerapp show --name "$WORKER_APP_NAME" --resource-group "$RESOURCE_GROUP" --query properties.provisioningState -o tsv)
        local worker_replicas=$(az containerapp show --name "$WORKER_APP_NAME" --resource-group "$RESOURCE_GROUP" --query properties.template.scale.minReplicas -o tsv)

        log_success "Worker: $WORKER_APP_NAME"
        log_info "State: $worker_state"
        log_info "Min Replicas: $worker_replicas"
    else
        log_error "Worker app not found: $WORKER_APP_NAME"
    fi
}

verify_connectivity() {
    log_section "10. Connectivity Test"

    log_info "Testing backend API endpoints..."

    local backend_url="https://$BACKEND_FQDN"

    # Test health endpoint
    echo ""
    log_info "GET $backend_url/health"
    local health_code=$(curl -s -o /dev/null -w "%{http_code}" "$backend_url/health")
    if [ "$health_code" == "200" ]; then
        log_success "Health endpoint: HTTP $health_code"
    else
        log_warning "Health endpoint: HTTP $health_code"
    fi

    # Test docs endpoint
    echo ""
    log_info "GET $backend_url/docs"
    local docs_code=$(curl -s -o /dev/null -w "%{http_code}" "$backend_url/docs")
    if [ "$docs_code" == "200" ]; then
        log_success "API docs available: $backend_url/docs"
    else
        log_warning "API docs: HTTP $docs_code"
    fi

    # Test API root
    echo ""
    log_info "GET $backend_url/"
    local root_code=$(curl -s -o /dev/null -w "%{http_code}" "$backend_url/")
    if [ "$root_code" == "200" ]; then
        log_success "API root: HTTP $root_code"
    else
        log_warning "API root: HTTP $root_code"
    fi
}

show_logs() {
    log_section "11. Recent Logs"

    log_info "Backend App Logs (last 20 lines):"
    az containerapp logs show \
        --name "$BACKEND_APP_NAME" \
        --resource-group "$RESOURCE_GROUP" \
        --tail 20 \
        --follow false \
        2>/dev/null || log_warning "Cannot retrieve logs"

    echo ""
    log_info "Worker App Logs (last 20 lines):"
    az containerapp logs show \
        --name "$WORKER_APP_NAME" \
        --resource-group "$RESOURCE_GROUP" \
        --tail 20 \
        --follow false \
        2>/dev/null || log_warning "Cannot retrieve logs"
}

################################################################################
# Main Verification
################################################################################

main() {
    echo ""
    echo "================================================================================"
    echo "  Azure Deployment Verification"
    echo "================================================================================"

    verify_resource_group
    verify_container_registry
    verify_cosmos_db
    verify_storage_account
    verify_redis
    verify_service_bus
    verify_key_vault
    verify_managed_identity
    verify_container_apps
    verify_connectivity

    # Optional: show logs
    echo ""
    read -p "Show recent application logs? (yes/no): " show_logs_confirm
    if [ "$show_logs_confirm" == "yes" ]; then
        show_logs
    fi

    log_section "Verification Complete"

    log_success "All resources verified successfully!"

    echo ""
    log_info "Next Steps:"
    echo "  1. View API documentation: https://$BACKEND_FQDN/docs"
    echo "  2. Monitor logs: az containerapp logs show --name $BACKEND_APP_NAME --resource-group $RESOURCE_GROUP --follow"
    echo "  3. Scale apps: az containerapp update --name $BACKEND_APP_NAME --resource-group $RESOURCE_GROUP --min-replicas 2"
    echo "  4. Update environment variables: az containerapp update --name $BACKEND_APP_NAME --set-env-vars KEY=VALUE"
    echo ""
}

# Run verification
main "$@"
