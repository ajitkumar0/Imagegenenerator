# Azure Blob Storage Setup with Managed Identity, SAS Tokens, and CDN

This guide provides complete instructions for setting up Azure Blob Storage with Managed Identity authentication, User Delegation SAS tokens, Azure CDN integration, and lifecycle management.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Create Storage Account](#create-storage-account)
3. [Configure Managed Identity Access](#configure-managed-identity-access)
4. [Set Up Azure CDN](#set-up-azure-cdn)
5. [Configure Lifecycle Management](#configure-lifecycle-management)
6. [Enable Soft Delete and Versioning](#enable-soft-delete-and-versioning)
7. [Complete Setup Script](#complete-setup-script)
8. [Cost Optimization](#cost-optimization)
9. [Monitoring and Alerts](#monitoring-and-alerts)
10. [Troubleshooting](#troubleshooting)

---

## Prerequisites

- Azure CLI installed (`az --version`)
- Logged in to Azure (`az login`)
- Container App or VM with Managed Identity enabled
- Sufficient Azure permissions

---

## Create Storage Account

### Step 1: Create Storage Account

```bash
# Set variables
RESOURCE_GROUP="your-resource-group"
LOCATION="eastus"
STORAGE_ACCOUNT_NAME="yourstorageaccount"  # Must be globally unique
CONTAINER_NAME="imagegen-images"

# Create storage account (Standard with LRS)
az storage account create \
  --name $STORAGE_ACCOUNT_NAME \
  --resource-group $RESOURCE_GROUP \
  --location $LOCATION \
  --sku Standard_LRS \
  --kind StorageV2 \
  --access-tier Hot \
  --https-only true \
  --min-tls-version TLS1_2 \
  --allow-blob-public-access false \
  --enable-hierarchical-namespace false

echo "✓ Storage account created: $STORAGE_ACCOUNT_NAME"
```

### Step 2: Create Blob Container

```bash
# Get storage account key (temporary, only for container creation)
STORAGE_KEY=$(az storage account keys list \
  --account-name $STORAGE_ACCOUNT_NAME \
  --resource-group $RESOURCE_GROUP \
  --query '[0].value' \
  --output tsv)

# Create container
az storage container create \
  --name $CONTAINER_NAME \
  --account-name $STORAGE_ACCOUNT_NAME \
  --account-key $STORAGE_KEY \
  --public-access off \
  --fail-on-exist

echo "✓ Container created: $CONTAINER_NAME"
```

---

## Configure Managed Identity Access

### Step 3: Grant Storage Blob Data Contributor Role

```bash
# Get Container App Managed Identity Principal ID
CONTAINER_APP_NAME="imagegenerator-api"

PRINCIPAL_ID=$(az containerapp show \
  --name $CONTAINER_APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --query identity.principalId \
  --output tsv)

echo "Principal ID: $PRINCIPAL_ID"

# Get storage account resource ID
STORAGE_ID=$(az storage account show \
  --name $STORAGE_ACCOUNT_NAME \
  --resource-group $RESOURCE_GROUP \
  --query id \
  --output tsv)

# Grant "Storage Blob Data Contributor" role
# This allows read, write, and delete access to blobs
az role assignment create \
  --assignee $PRINCIPAL_ID \
  --role "Storage Blob Data Contributor" \
  --scope $STORAGE_ID

echo "✓ Granted Storage Blob Data Contributor role"

# Grant "Storage Account Contributor" role (for User Delegation Key generation)
az role assignment create \
  --assignee $PRINCIPAL_ID \
  --role "Storage Account Contributor" \
  --scope $STORAGE_ID

echo "✓ Granted Storage Account Contributor role"
```

### Verify Permissions

```bash
# List role assignments
az role assignment list \
  --assignee $PRINCIPAL_ID \
  --scope $STORAGE_ID \
  --output table
```

---

## Set Up Azure CDN

### Step 4: Create Azure CDN Profile and Endpoint

```bash
# Set CDN variables
CDN_PROFILE_NAME="imagegen-cdn-profile"
CDN_ENDPOINT_NAME="imagegen-cdn"  # Must be globally unique
CDN_SKU="Standard_Microsoft"  # Options: Standard_Microsoft, Standard_Akamai, Standard_Verizon, Premium_Verizon

# Create CDN profile
az cdn profile create \
  --name $CDN_PROFILE_NAME \
  --resource-group $RESOURCE_GROUP \
  --sku $CDN_SKU \
  --location $LOCATION

echo "✓ CDN profile created: $CDN_PROFILE_NAME"

# Get storage account hostname
STORAGE_HOSTNAME="$STORAGE_ACCOUNT_NAME.blob.core.windows.net"

# Create CDN endpoint
az cdn endpoint create \
  --name $CDN_ENDPOINT_NAME \
  --resource-group $RESOURCE_GROUP \
  --profile-name $CDN_PROFILE_NAME \
  --origin $STORAGE_HOSTNAME \
  --origin-host-header $STORAGE_HOSTNAME \
  --enable-compression true \
  --content-types-to-compress \
    "image/png" \
    "image/jpeg" \
    "image/webp" \
    "image/svg+xml" \
  --query-string-caching-behavior IgnoreQueryString

echo "✓ CDN endpoint created: $CDN_ENDPOINT_NAME"

# Get CDN endpoint URL
CDN_ENDPOINT_URL="https://${CDN_ENDPOINT_NAME}.azureedge.net"
echo "CDN Endpoint URL: $CDN_ENDPOINT_URL"
```

### Step 5: Configure CDN Caching Rules

```bash
# Set caching rules for images (1 year cache)
az cdn endpoint rule add \
  --name $CDN_ENDPOINT_NAME \
  --resource-group $RESOURCE_GROUP \
  --profile-name $CDN_PROFILE_NAME \
  --order 1 \
  --rule-name "CacheImages" \
  --match-variable UrlFileExtension \
  --operator Equal \
  --match-values "jpg" "jpeg" "png" "webp" "gif" \
  --action-name CacheExpiration \
  --cache-behavior Override \
  --cache-duration "365.00:00:00"

echo "✓ CDN caching rules configured"
```

---

## Configure Lifecycle Management

### Step 6: Apply Lifecycle Management Policy

```bash
# Apply lifecycle policy from JSON file
az storage account management-policy create \
  --account-name $STORAGE_ACCOUNT_NAME \
  --resource-group $RESOURCE_GROUP \
  --policy @azure/blob-lifecycle-policy.json

echo "✓ Lifecycle management policy applied"
```

### Lifecycle Policy Summary

- **Cool Tier**: Move blobs to cool tier after 30 days
- **Archive Tier**: Move blobs to archive tier after 90 days
- **Deletion by Tier**:
  - Free tier: Delete after 90 days
  - Basic tier: Delete after 180 days
  - Pro tier: Delete after 365 days
  - Enterprise tier: No automatic deletion
- **Thumbnails**: Delete after 365 days
- **Soft Deleted**: Permanently delete after 7 days

---

## Enable Soft Delete and Versioning

### Step 7: Enable Blob Soft Delete

```bash
# Enable soft delete for blobs (7 days retention)
az storage blob service-properties delete-policy update \
  --account-name $STORAGE_ACCOUNT_NAME \
  --enable true \
  --days-retained 7

echo "✓ Soft delete enabled (7 days retention)"
```

### Step 8: Enable Blob Versioning (Premium Tier Only)

```bash
# Enable blob versioning for premium users
az storage account blob-service-properties update \
  --account-name $STORAGE_ACCOUNT_NAME \
  --resource-group $RESOURCE_GROUP \
  --enable-versioning true

echo "✓ Blob versioning enabled"
```

### Step 9: Enable Container Soft Delete

```bash
# Enable soft delete for containers (7 days retention)
az storage blob service-properties delete-policy update \
  --account-name $STORAGE_ACCOUNT_NAME \
  --enable-container-delete-retention true \
  --container-delete-retention-days 7

echo "✓ Container soft delete enabled"
```

---

## Complete Setup Script

```bash
#!/bin/bash
set -e

echo "=== Azure Blob Storage Setup with CDN and Lifecycle Management ==="
echo ""

# Variables
RESOURCE_GROUP="your-resource-group"
LOCATION="eastus"
STORAGE_ACCOUNT_NAME="yourstorageaccount"
CONTAINER_NAME="imagegen-images"
CONTAINER_APP_NAME="imagegenerator-api"
CDN_PROFILE_NAME="imagegen-cdn-profile"
CDN_ENDPOINT_NAME="imagegen-cdn"

# 1. Create storage account
echo "1. Creating storage account..."
az storage account create \
  --name $STORAGE_ACCOUNT_NAME \
  --resource-group $RESOURCE_GROUP \
  --location $LOCATION \
  --sku Standard_LRS \
  --kind StorageV2 \
  --access-tier Hot \
  --https-only true \
  --min-tls-version TLS1_2 \
  --allow-blob-public-access false

# 2. Create container
echo "2. Creating blob container..."
STORAGE_KEY=$(az storage account keys list \
  --account-name $STORAGE_ACCOUNT_NAME \
  --resource-group $RESOURCE_GROUP \
  --query '[0].value' \
  --output tsv)

az storage container create \
  --name $CONTAINER_NAME \
  --account-name $STORAGE_ACCOUNT_NAME \
  --account-key $STORAGE_KEY \
  --public-access off

# 3. Get managed identity
echo "3. Configuring Managed Identity access..."
PRINCIPAL_ID=$(az containerapp show \
  --name $CONTAINER_APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --query identity.principalId \
  --output tsv)

STORAGE_ID=$(az storage account show \
  --name $STORAGE_ACCOUNT_NAME \
  --resource-group $RESOURCE_GROUP \
  --query id \
  --output tsv)

# 4. Grant permissions
echo "4. Granting Storage Blob Data Contributor role..."
az role assignment create \
  --assignee $PRINCIPAL_ID \
  --role "Storage Blob Data Contributor" \
  --scope $STORAGE_ID

az role assignment create \
  --assignee $PRINCIPAL_ID \
  --role "Storage Account Contributor" \
  --scope $STORAGE_ID

# 5. Create CDN
echo "5. Creating Azure CDN..."
az cdn profile create \
  --name $CDN_PROFILE_NAME \
  --resource-group $RESOURCE_GROUP \
  --sku Standard_Microsoft \
  --location $LOCATION

STORAGE_HOSTNAME="$STORAGE_ACCOUNT_NAME.blob.core.windows.net"

az cdn endpoint create \
  --name $CDN_ENDPOINT_NAME \
  --resource-group $RESOURCE_GROUP \
  --profile-name $CDN_PROFILE_NAME \
  --origin $STORAGE_HOSTNAME \
  --origin-host-header $STORAGE_HOSTNAME \
  --enable-compression true \
  --content-types-to-compress "image/png" "image/jpeg" "image/webp"

# 6. Configure caching
echo "6. Configuring CDN caching rules..."
az cdn endpoint rule add \
  --name $CDN_ENDPOINT_NAME \
  --resource-group $RESOURCE_GROUP \
  --profile-name $CDN_PROFILE_NAME \
  --order 1 \
  --rule-name "CacheImages" \
  --match-variable UrlFileExtension \
  --operator Equal \
  --match-values "jpg" "jpeg" "png" "webp" \
  --action-name CacheExpiration \
  --cache-behavior Override \
  --cache-duration "365.00:00:00"

# 7. Apply lifecycle policy
echo "7. Applying lifecycle management policy..."
az storage account management-policy create \
  --account-name $STORAGE_ACCOUNT_NAME \
  --resource-group $RESOURCE_GROUP \
  --policy @azure/blob-lifecycle-policy.json

# 8. Enable soft delete
echo "8. Enabling soft delete..."
az storage blob service-properties delete-policy update \
  --account-name $STORAGE_ACCOUNT_NAME \
  --enable true \
  --days-retained 7

# 9. Get CDN URL
CDN_ENDPOINT_URL="https://${CDN_ENDPOINT_NAME}.azureedge.net"

echo ""
echo "=== Setup Complete! ==="
echo ""
echo "Storage Account: $STORAGE_ACCOUNT_NAME"
echo "Storage URL: https://$STORAGE_HOSTNAME"
echo "Container: $CONTAINER_NAME"
echo "CDN Endpoint: $CDN_ENDPOINT_URL"
echo ""
echo "Environment Variables:"
echo "AZURE_STORAGE_ACCOUNT_URL=https://$STORAGE_HOSTNAME"
echo "BLOB_CONTAINER_NAME=$CONTAINER_NAME"
echo "AZURE_CDN_ENDPOINT_URL=$CDN_ENDPOINT_URL"
```

---

## Cost Optimization

### Storage Tiers Cost Comparison

| Tier | Storage Cost (per GB/month) | Operations Cost | Use Case |
|------|---------------------------|-----------------|----------|
| **Hot** | $0.018 | Lowest | Frequently accessed (< 30 days) |
| **Cool** | $0.010 | Higher | Infrequently accessed (30-90 days) |
| **Archive** | $0.00099 | Highest | Rarely accessed (> 90 days) |

### Cost Optimization Strategies

1. **Lifecycle Management** (Already configured):
   - Automatically move to cool tier after 30 days
   - Move to archive after 90 days
   - Delete based on subscription tier

2. **Image Optimization**:
   - Compress images before upload (implemented in `ImageProcessor`)
   - Generate thumbnails (256x256) for gallery views
   - Use WebP format for 30% smaller file sizes

3. **CDN Caching**:
   - Reduces egress costs from storage account
   - Improves performance globally
   - 1-year cache for immutable images

4. **Reserved Capacity**:
   ```bash
   # Purchase 1-year or 3-year reserved capacity for 38% discount
   # Do this through Azure Portal: Storage Account > Reserved Capacity
   ```

5. **Monitor Storage Usage**:
   ```bash
   # Get storage metrics
   az monitor metrics list \
     --resource $STORAGE_ID \
     --metric UsedCapacity \
     --interval PT1H
   ```

### Estimated Monthly Costs

For 1000 users generating 10 images/month (10,000 images):
- Average image size: 2MB
- Total storage: 20GB
- Monthly cost breakdown:
  - Hot storage (first 30 days): 20GB × $0.018 = $0.36
  - Cool storage (30-90 days): 20GB × $0.010 = $0.20
  - Archive storage (90+ days): 20GB × $0.001 = $0.02
  - Operations: ~$0.50
  - CDN egress: ~$5.00 (50GB/month)
  - **Total: ~$6.10/month**

---

## Monitoring and Alerts

### Enable Diagnostic Logging

```bash
LOG_WORKSPACE_NAME="imagegen-logs"

# Get Log Analytics workspace ID
WORKSPACE_ID=$(az monitor log-analytics workspace show \
  --resource-group $RESOURCE_GROUP \
  --workspace-name $LOG_WORKSPACE_NAME \
  --query id \
  --output tsv)

# Enable diagnostic settings
az monitor diagnostic-settings create \
  --name storage-diagnostics \
  --resource $STORAGE_ID \
  --logs '[
    {"category":"StorageRead","enabled":true},
    {"category":"StorageWrite","enabled":true},
    {"category":"StorageDelete","enabled":true}
  ]' \
  --metrics '[{"category":"Transaction","enabled":true}]' \
  --workspace $WORKSPACE_ID
```

### Set Up Alerts

```bash
# Alert for high storage usage (> 80%)
az monitor metrics alert create \
  --name high-storage-usage \
  --resource-group $RESOURCE_GROUP \
  --scopes $STORAGE_ID \
  --condition "total UsedCapacity > 80000000000" \
  --description "Alert when storage usage exceeds 80GB"

# Alert for high egress (> 100GB/day)
az monitor metrics alert create \
  --name high-egress \
  --resource-group $RESOURCE_GROUP \
  --scopes $STORAGE_ID \
  --condition "total Egress > 107374182400" \
  --window-size 1d \
  --description "Alert when egress exceeds 100GB/day"
```

---

## Troubleshooting

### Issue: "Authorization failed" when uploading blobs

**Solution:**
```bash
# Verify role assignments
az role assignment list \
  --assignee $PRINCIPAL_ID \
  --scope $STORAGE_ID

# Ensure Managed Identity has "Storage Blob Data Contributor" role
# Wait 5-10 minutes for role propagation
```

### Issue: Cannot generate User Delegation SAS token

**Solution:**
```bash
# Ensure "Storage Account Contributor" role is assigned
az role assignment create \
  --assignee $PRINCIPAL_ID \
  --role "Storage Account Contributor" \
  --scope $STORAGE_ID
```

### Issue: CDN returns 404 errors

**Solution:**
```bash
# Purge CDN cache
az cdn endpoint purge \
  --resource-group $RESOURCE_GROUP \
  --profile-name $CDN_PROFILE_NAME \
  --name $CDN_ENDPOINT_NAME \
  --content-paths "/*"
```

### Issue: Lifecycle policy not working

**Solution:**
```bash
# Verify policy is applied
az storage account management-policy show \
  --account-name $STORAGE_ACCOUNT_NAME \
  --resource-group $RESOURCE_GROUP

# Note: Lifecycle policies run once per day, changes may take 24-48 hours
```

---

## Security Checklist

- [ ] Public access disabled on storage account
- [ ] Public access disabled on containers
- [ ] HTTPS only enabled
- [ ] TLS 1.2 minimum version enforced
- [ ] Managed Identity configured for authentication
- [ ] Storage Blob Data Contributor role assigned
- [ ] Soft delete enabled (7 days retention)
- [ ] Lifecycle policies configured
- [ ] Diagnostic logging enabled
- [ ] CDN HTTPS only
- [ ] SAS tokens use User Delegation Key (not account key)
- [ ] SAS tokens have appropriate expiry (max 7 days)
- [ ] Firewall rules configured (if using VNet)

---

## Next Steps

1. ✅ Run the complete setup script
2. ✅ Update Container App environment variables
3. ✅ Test image upload with Managed Identity
4. ✅ Verify SAS URL generation
5. ✅ Test CDN image delivery
6. ✅ Monitor storage costs
7. ✅ Set up budget alerts
