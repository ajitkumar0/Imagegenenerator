## Azure RBAC Setup for Cosmos DB MongoDB API with Managed Identity

This guide explains how to configure Azure Role-Based Access Control (RBAC) for Azure Cosmos DB MongoDB API using Managed Identity.

---

## Prerequisites

- Azure CLI installed (`az --version`)
- Logged in to Azure (`az login`)
- Azure Cosmos DB account with MongoDB API created
- Azure Container App or VM with system-assigned or user-assigned Managed Identity

---

## Step 1: Create Azure Cosmos DB Account (MongoDB API)

```bash
# Set variables
RESOURCE_GROUP="your-resource-group"
LOCATION="eastus"
COSMOS_ACCOUNT_NAME="your-cosmos-account"
DATABASE_NAME="imagegenerator"

# Create Cosmos DB account with MongoDB API
az cosmosdb create \
  --name $COSMOS_ACCOUNT_NAME \
  --resource-group $RESOURCE_GROUP \
  --kind MongoDB \
  --server-version 4.2 \
  --default-consistency-level Session \
  --locations regionName=$LOCATION failoverPriority=0 isZoneRedundant=False \
  --enable-automatic-failover false \
  --enable-public-network true

# Create database
az cosmosdb mongodb database create \
  --account-name $COSMOS_ACCOUNT_NAME \
  --resource-group $RESOURCE_GROUP \
  --name $DATABASE_NAME
```

---

## Step 2: Get MongoDB Connection String

```bash
# Get connection string (contains admin credentials)
CONNECTION_STRING=$(az cosmosdb keys list \
  --name $COSMOS_ACCOUNT_NAME \
  --resource-group $RESOURCE_GROUP \
  --type connection-strings \
  --query "connectionStrings[?description=='Primary MongoDB Connection String'].connectionString" \
  --output tsv)

echo "Connection String: $CONNECTION_STRING"
```

**Important:** Store this connection string in Azure Key Vault (see Step 3).

---

## Step 3: Store Connection String in Azure Key Vault

```bash
# Set variables
KEY_VAULT_NAME="your-keyvault"
SECRET_NAME="mongodb-connection-string"

# Create Key Vault (if not exists)
az keyvault create \
  --name $KEY_VAULT_NAME \
  --resource-group $RESOURCE_GROUP \
  --location $LOCATION \
  --enable-rbac-authorization true

# Store connection string in Key Vault
az keyvault secret set \
  --vault-name $KEY_VAULT_NAME \
  --name $SECRET_NAME \
  --value "$CONNECTION_STRING"

echo "✓ Connection string stored in Key Vault: $SECRET_NAME"
```

---

## Step 4: Enable Managed Identity on Container App

### Option A: System-Assigned Managed Identity

```bash
CONTAINER_APP_NAME="imagegenerator-api"

# Enable system-assigned managed identity
az containerapp identity assign \
  --name $CONTAINER_APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --system-assigned

# Get the principal ID
PRINCIPAL_ID=$(az containerapp show \
  --name $CONTAINER_APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --query identity.principalId \
  --output tsv)

echo "System-Assigned Managed Identity Principal ID: $PRINCIPAL_ID"
```

### Option B: User-Assigned Managed Identity

```bash
IDENTITY_NAME="imagegenerator-identity"

# Create user-assigned managed identity
az identity create \
  --name $IDENTITY_NAME \
  --resource-group $RESOURCE_GROUP \
  --location $LOCATION

# Get the resource ID and principal ID
IDENTITY_ID=$(az identity show \
  --name $IDENTITY_NAME \
  --resource-group $RESOURCE_GROUP \
  --query id \
  --output tsv)

PRINCIPAL_ID=$(az identity show \
  --name $IDENTITY_NAME \
  --resource-group $RESOURCE_GROUP \
  --query principalId \
  --output tsv)

# Assign to container app
az containerapp identity assign \
  --name $CONTAINER_APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --user-assigned $IDENTITY_ID

echo "User-Assigned Managed Identity Principal ID: $PRINCIPAL_ID"
echo "User-Assigned Managed Identity Client ID: $(az identity show --name $IDENTITY_NAME --resource-group $RESOURCE_GROUP --query clientId --output tsv)"
```

---

## Step 5: Grant Key Vault Access to Managed Identity

```bash
# Grant "Key Vault Secrets User" role to Managed Identity
az role assignment create \
  --assignee $PRINCIPAL_ID \
  --role "Key Vault Secrets User" \
  --scope /subscriptions/$(az account show --query id -o tsv)/resourceGroups/$RESOURCE_GROUP/providers/Microsoft.KeyVault/vaults/$KEY_VAULT_NAME

echo "✓ Granted Key Vault Secrets User role to Managed Identity"
```

---

## Step 6: Configure Cosmos DB RBAC (MongoDB)

**Note:** Azure Cosmos DB for MongoDB API does not support Azure RBAC for data plane operations.
Authentication is done via connection string stored in Key Vault.

### Security Best Practices:

1. **Connection String Security:**
   - Never hardcode connection strings
   - Always store in Azure Key Vault
   - Rotate keys regularly (every 90 days)

2. **Network Security:**
   ```bash
   # Enable firewall
   az cosmosdb update \
     --name $COSMOS_ACCOUNT_NAME \
     --resource-group $RESOURCE_GROUP \
     --enable-public-network false \
     --enable-virtual-network true

   # Add virtual network rule (if using VNet)
   az cosmosdb network-rule add \
     --name $COSMOS_ACCOUNT_NAME \
     --resource-group $RESOURCE_GROUP \
     --subnet /subscriptions/{subscription-id}/resourceGroups/{rg}/providers/Microsoft.Network/virtualNetworks/{vnet}/subnets/{subnet}
   ```

3. **Private Endpoint (Recommended for Production):**
   ```bash
   # Create private endpoint
   az network private-endpoint create \
     --name cosmos-private-endpoint \
     --resource-group $RESOURCE_GROUP \
     --vnet-name your-vnet \
     --subnet your-subnet \
     --private-connection-resource-id $(az cosmosdb show --name $COSMOS_ACCOUNT_NAME --resource-group $RESOURCE_GROUP --query id -o tsv) \
     --group-id MongoDB \
     --connection-name cosmos-connection
   ```

---

## Step 7: Rotate Connection String (Security)

```bash
# Regenerate primary key
az cosmosdb keys regenerate \
  --name $COSMOS_ACCOUNT_NAME \
  --resource-group $RESOURCE_GROUP \
  --key-kind primary

# Get new connection string
NEW_CONNECTION_STRING=$(az cosmosdb keys list \
  --name $COSMOS_ACCOUNT_NAME \
  --resource-group $RESOURCE_GROUP \
  --type connection-strings \
  --query "connectionStrings[?description=='Primary MongoDB Connection String'].connectionString" \
  --output tsv)

# Update Key Vault secret
az keyvault secret set \
  --vault-name $KEY_VAULT_NAME \
  --name $SECRET_NAME \
  --value "$NEW_CONNECTION_STRING"

echo "✓ Connection string rotated and updated in Key Vault"
```

---

## Step 8: Verify Configuration

### Test Key Vault Access

```bash
# Test retrieving secret
az keyvault secret show \
  --vault-name $KEY_VAULT_NAME \
  --name $SECRET_NAME \
  --query value \
  --output tsv
```

### Test MongoDB Connection

```python
# In your application (app/main.py)
from app.core.azure_clients import AzureClients, get_mongodb_connection_string_from_keyvault
from app.services.mongodb_service import initialize_mongodb

# Initialize Azure clients
azure_clients = AzureClients(settings)

# Get connection string from Key Vault
keyvault_client = azure_clients.keyvault_client
connection_string = await get_mongodb_connection_string_from_keyvault(
    keyvault_client,
    settings.mongodb_connection_string_secret
)

# Initialize MongoDB
await initialize_mongodb(settings, connection_string)
```

---

## Step 9: Environment Variables for Container App

```bash
# Update Container App environment variables
az containerapp update \
  --name $CONTAINER_APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --set-env-vars \
    AZURE_KEY_VAULT_URL=https://$KEY_VAULT_NAME.vault.azure.net/ \
    MONGODB_CONNECTION_STRING_SECRET=$SECRET_NAME \
    MONGODB_DATABASE_NAME=$DATABASE_NAME \
    MANAGED_IDENTITY_ENABLED=true

# If using user-assigned identity, also set:
# AZURE_CLIENT_ID={user-assigned-identity-client-id}

echo "✓ Environment variables configured"
```

---

## Step 10: Monitoring and Logging

### Enable Diagnostic Settings

```bash
# Create Log Analytics workspace
LOG_WORKSPACE_NAME="imagegenerator-logs"

az monitor log-analytics workspace create \
  --resource-group $RESOURCE_GROUP \
  --workspace-name $LOG_WORKSPACE_NAME \
  --location $LOCATION

# Get workspace ID
WORKSPACE_ID=$(az monitor log-analytics workspace show \
  --resource-group $RESOURCE_GROUP \
  --workspace-name $LOG_WORKSPACE_NAME \
  --query id \
  --output tsv)

# Enable diagnostic settings for Cosmos DB
az monitor diagnostic-settings create \
  --name cosmos-diagnostics \
  --resource $(az cosmosdb show --name $COSMOS_ACCOUNT_NAME --resource-group $RESOURCE_GROUP --query id -o tsv) \
  --logs '[{"category":"MongoRequests","enabled":true}]' \
  --metrics '[{"category":"Requests","enabled":true}]' \
  --workspace $WORKSPACE_ID

echo "✓ Diagnostic settings enabled"
```

### Set Up Alerts

```bash
# Alert for high RU consumption
az monitor metrics alert create \
  --name high-ru-alert \
  --resource-group $RESOURCE_GROUP \
  --scopes $(az cosmosdb show --name $COSMOS_ACCOUNT_NAME --resource-group $RESOURCE_GROUP --query id -o tsv) \
  --condition "avg TotalRequestUnits > 10000" \
  --window-size 5m \
  --evaluation-frequency 1m \
  --description "Alert when RU consumption is high"

# Alert for throttled requests (429)
az monitor metrics alert create \
  --name throttled-requests-alert \
  --resource-group $RESOURCE_GROUP \
  --scopes $(az cosmosdb show --name $COSMOS_ACCOUNT_NAME --resource-group $RESOURCE_GROUP --query id -o tsv) \
  --condition "total TotalRequests where ResponseStatusCode == 429 > 10" \
  --window-size 5m \
  --evaluation-frequency 1m \
  --description "Alert when requests are being throttled"

echo "✓ Alerts configured"
```

---

## Complete Setup Script

```bash
#!/bin/bash
set -e

# Variables
RESOURCE_GROUP="your-resource-group"
LOCATION="eastus"
COSMOS_ACCOUNT_NAME="your-cosmos-account"
DATABASE_NAME="imagegenerator"
KEY_VAULT_NAME="your-keyvault"
CONTAINER_APP_NAME="imagegenerator-api"
SECRET_NAME="mongodb-connection-string"

echo "=== Azure Cosmos DB MongoDB Setup with Managed Identity ==="
echo ""

# 1. Create Cosmos DB
echo "1. Creating Cosmos DB account..."
az cosmosdb create \
  --name $COSMOS_ACCOUNT_NAME \
  --resource-group $RESOURCE_GROUP \
  --kind MongoDB \
  --server-version 4.2 \
  --default-consistency-level Session \
  --locations regionName=$LOCATION failoverPriority=0 isZoneRedundant=False

# 2. Create database
echo "2. Creating database..."
az cosmosdb mongodb database create \
  --account-name $COSMOS_ACCOUNT_NAME \
  --resource-group $RESOURCE_GROUP \
  --name $DATABASE_NAME

# 3. Get connection string
echo "3. Retrieving connection string..."
CONNECTION_STRING=$(az cosmosdb keys list \
  --name $COSMOS_ACCOUNT_NAME \
  --resource-group $RESOURCE_GROUP \
  --type connection-strings \
  --query "connectionStrings[?description=='Primary MongoDB Connection String'].connectionString" \
  --output tsv)

# 4. Create Key Vault
echo "4. Creating Key Vault..."
az keyvault create \
  --name $KEY_VAULT_NAME \
  --resource-group $RESOURCE_GROUP \
  --location $LOCATION \
  --enable-rbac-authorization true

# 5. Store secret
echo "5. Storing connection string in Key Vault..."
az keyvault secret set \
  --vault-name $KEY_VAULT_NAME \
  --name $SECRET_NAME \
  --value "$CONNECTION_STRING"

# 6. Enable managed identity
echo "6. Enabling managed identity on Container App..."
az containerapp identity assign \
  --name $CONTAINER_APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --system-assigned

# 7. Get principal ID
PRINCIPAL_ID=$(az containerapp show \
  --name $CONTAINER_APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --query identity.principalId \
  --output tsv)

# 8. Grant Key Vault access
echo "7. Granting Key Vault access..."
az role assignment create \
  --assignee $PRINCIPAL_ID \
  --role "Key Vault Secrets User" \
  --scope /subscriptions/$(az account show --query id -o tsv)/resourceGroups/$RESOURCE_GROUP/providers/Microsoft.KeyVault/vaults/$KEY_VAULT_NAME

# 9. Update environment variables
echo "8. Updating environment variables..."
az containerapp update \
  --name $CONTAINER_APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --set-env-vars \
    AZURE_KEY_VAULT_URL=https://$KEY_VAULT_NAME.vault.azure.net/ \
    MONGODB_CONNECTION_STRING_SECRET=$SECRET_NAME \
    MONGODB_DATABASE_NAME=$DATABASE_NAME \
    MANAGED_IDENTITY_ENABLED=true

echo ""
echo "=== Setup Complete! ==="
echo ""
echo "Key Vault URL: https://$KEY_VAULT_NAME.vault.azure.net/"
echo "Secret Name: $SECRET_NAME"
echo "Database Name: $DATABASE_NAME"
echo "Principal ID: $PRINCIPAL_ID"
```

---

## Troubleshooting

### Issue: Cannot retrieve secret from Key Vault

**Solution:**
```bash
# Check role assignments
az role assignment list \
  --assignee $PRINCIPAL_ID \
  --scope /subscriptions/$(az account show --query id -o tsv)/resourceGroups/$RESOURCE_GROUP/providers/Microsoft.KeyVault/vaults/$KEY_VAULT_NAME

# Verify managed identity is enabled
az containerapp show \
  --name $CONTAINER_APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --query identity
```

### Issue: Connection timeout to MongoDB

**Solution:**
```bash
# Check firewall rules
az cosmosdb show \
  --name $COSMOS_ACCOUNT_NAME \
  --resource-group $RESOURCE_GROUP \
  --query ipRules

# Allow Container App subnet
az cosmosdb network-rule add \
  --name $COSMOS_ACCOUNT_NAME \
  --resource-group $RESOURCE_GROUP \
  --subnet {container-app-subnet-id}
```

### Issue: 429 (Too Many Requests) errors

**Solution:**
```bash
# Increase RU/s throughput
az cosmosdb mongodb database throughput update \
  --account-name $COSMOS_ACCOUNT_NAME \
  --resource-group $RESOURCE_GROUP \
  --name $DATABASE_NAME \
  --throughput 1000
```

---

## Security Checklist

- [ ] Connection string stored in Key Vault (not in code/env vars)
- [ ] Managed Identity enabled and configured
- [ ] Key Vault access granted via RBAC (not access policies)
- [ ] Firewall rules configured (whitelist only necessary IPs)
- [ ] Private endpoint configured (for production)
- [ ] Diagnostic logging enabled
- [ ] Alerts configured for throttling and errors
- [ ] Connection string rotation schedule (every 90 days)
- [ ] Application logging redacts sensitive data
- [ ] TLS 1.2+ enforced
