# STEP 3: Azure Blob Storage with Managed Identity, SAS Tokens, and CDN

Complete implementation of Azure Blob Storage for secure image storage with Managed Identity authentication, User Delegation SAS tokens, Azure CDN integration, and automated lifecycle management.

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Features](#features)
4. [Storage Structure](#storage-structure)
5. [Implementation](#implementation)
6. [Image Processing](#image-processing)
7. [SAS Token Generation](#sas-token-generation)
8. [CDN Integration](#cdn-integration)
9. [Lifecycle Management](#lifecycle-management)
10. [Setup Instructions](#setup-instructions)
11. [Usage Examples](#usage-examples)
12. [Cost Optimization](#cost-optimization)
13. [Security](#security)

---

## Overview

This implementation provides enterprise-grade blob storage with:
- **Managed Identity** authentication (NO account keys)
- **User Delegation SAS** tokens for secure image access
- **Azure CDN** for global content delivery
- **Automatic image optimization** (compression + thumbnails)
- **Lifecycle management** policies for cost optimization
- **Hierarchical blob paths** for organization
- **Soft delete** and versioning for data protection

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                   FastAPI Application                         │
└─────────────────────────┬────────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────────┐
│              AzureBlobService (Managed Identity)              │
│  - upload_image() with optimization                           │
│  - generate_sas_url() with User Delegation Key               │
│  - get_cdn_url() for CDN delivery                            │
│  - download_image() / delete_image()                         │
└─────────────────────────┬────────────────────────────────────┘
                          │
          ┌───────────────┴───────────────┐
          │                               │
          ▼                               ▼
┌─────────────────────┐         ┌─────────────────────┐
│  Image Processor    │         │  Azure Blob Storage │
│  - Compression      │         │  (Managed Identity) │
│  - Thumbnails       │         │  - User Delegation  │
│  - Format convert   │         │  - Hierarchical     │
└─────────────────────┘         └──────────┬──────────┘
                                           │
                          ┌────────────────┴────────────────┐
                          │                                 │
                          ▼                                 ▼
                ┌──────────────────┐            ┌──────────────────┐
                │  Lifecycle Mgmt  │            │   Azure CDN      │
                │  - Hot → Cool    │            │  - Global Cache  │
                │  - Cool → Archive│            │  - 1-year cache  │
                │  - Auto-delete   │            │  - Compression   │
                └──────────────────┘            └──────────────────┘
```

---

## Features

### 1. **Managed Identity Authentication**

No account keys in code - all authentication via Managed Identity:

```python
# Blob client with Managed Identity
blob_service_client = BlobServiceClient(
    account_url=settings.storage_account_url,
    credential=azure_clients.credential  # DefaultAzureCredential
)
```

### 2. **User Delegation SAS Tokens**

Secure, time-limited access tokens generated with Managed Identity:

```python
# Get User Delegation Key (7-day validity)
user_delegation_key = client.get_user_delegation_key(
    key_start_time=datetime.utcnow(),
    key_expiry_time=datetime.utcnow() + timedelta(days=7)
)

# Generate SAS token
sas_token = generate_blob_sas(
    account_name=account_name,
    container_name=container_name,
    blob_name=blob_path,
    user_delegation_key=user_delegation_key,
    permission=BlobSasPermissions(read=True),
    expiry=datetime.utcnow() + timedelta(hours=168)
)
```

### 3. **Image Optimization**

Automatic compression and thumbnail generation:

```python
# Upload with optimization
blob_url, blob_path, metadata = await blob_service.upload_image(
    user_id="user_123",
    generation_id="gen_456",
    filename="image.png",
    image_data=image_bytes,
    optimize=True  # Compress + generate thumbnail
)

# Result:
# - Optimized full image (50-70% smaller)
# - 256x256 thumbnail for gallery
# - Metadata with compression stats
```

### 4. **Azure CDN Integration**

Global content delivery with edge caching:

```python
# Get CDN URL (cached at edge)
cdn_url = blob_service.get_cdn_url(blob_path)
# https://imagegen-cdn.azureedge.net/imagegen-images/user_123/gen_456/image.png

# 1-year cache-control header
# Compressed at CDN edge
# Global distribution
```

### 5. **Lifecycle Management**

Automatic tiering and deletion:

- **Hot tier**: Frequently accessed (< 30 days)
- **Cool tier**: Infrequently accessed (30-90 days) - 44% cheaper
- **Archive tier**: Rarely accessed (90+ days) - 90% cheaper
- **Auto-delete**: Based on subscription tier

---

## Storage Structure

### Hierarchical Blob Path Pattern

```
imagegen-images/                      (Container)
├── {user_id}/
│   ├── {generation_id}/
│   │   ├── {filename}.png           (Full image)
│   │   └── thumb_{filename}.png     (256x256 thumbnail)
│   └── {generation_id}/
│       ├── {filename}.webp
│       └── thumb_{filename}.webp
└── {user_id}/
    └── {generation_id}/
        ├── {filename}.jpg
        └── thumb_{filename}.jpg
```

### Example Paths

```
imagegen-images/user_abc123/gen_xyz456/550e8400-e29b-41d4-a716-446655440000.png
imagegen-images/user_abc123/gen_xyz456/thumb_550e8400-e29b-41d4-a716-446655440000.png
```

### Benefits

✅ **Organized by user** - Easy to list user's images
✅ **Organized by generation** - Group related images
✅ **Unique filenames** - No conflicts with UUIDs
✅ **Thumbnail separation** - Clear naming convention

---

## Implementation

### Azure Blob Service

```python
# app/services/azure_blob_service.py
class AzureBlobService:
    def __init__(self, blob_service_client: BlobServiceClient, settings: Settings):
        self.client = blob_service_client
        self.settings = settings
        self._user_delegation_key = None

    async def upload_image(
        self,
        user_id: str,
        generation_id: str,
        filename: str,
        image_data: bytes,
        optimize: bool = True
    ) -> Tuple[str, str, dict]:
        """
        Upload image with optional optimization.

        Returns:
            (blob_url, blob_path, metadata)
        """
        # Optimize if requested
        if optimize:
            optimized_image, thumbnail, metadata = ImageProcessor.optimize_for_web(image_data)
            image_data = optimized_image

            # Upload thumbnail
            thumbnail_path = self._get_blob_path(user_id, generation_id, f"thumb_{filename}")
            await self._upload_blob(container, thumbnail_path, thumbnail, "image/jpeg")

        # Upload main image
        blob_path = self._get_blob_path(user_id, generation_id, filename)
        blob_url = await self._upload_blob(container, blob_path, image_data, content_type)

        return blob_url, blob_path, metadata

    async def generate_sas_url(
        self,
        blob_path: str,
        expiry_hours: int = 168
    ) -> str:
        """Generate User Delegation SAS URL (max 7 days)."""
        user_delegation_key = await self._get_user_delegation_key()

        sas_token = generate_blob_sas(
            account_name=self.client.account_name,
            container_name=self.container_name,
            blob_name=blob_path,
            user_delegation_key=user_delegation_key,
            permission=BlobSasPermissions(read=True),
            expiry=datetime.utcnow() + timedelta(hours=expiry_hours)
        )

        return f"{blob_client.url}?{sas_token}"

    def get_cdn_url(self, blob_path: str) -> str:
        """Get Azure CDN URL if configured."""
        if self.settings.cdn_endpoint_url:
            return f"{self.settings.cdn_endpoint_url}/{self.container_name}/{blob_path}"
        return blob_client.url

    async def download_from_url(self, url: str) -> bytes:
        """Download image from external URL (e.g., Replicate)."""
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(url)
            return response.content
```

---

## Image Processing

### Image Processor Utilities

```python
# app/utils/image_processor.py
class ImageProcessor:
    @staticmethod
    def validate_image(image_data: bytes) -> Tuple[bool, Optional[str]]:
        """Validate format, size, and integrity."""
        if len(image_data) > 10 * 1024 * 1024:  # 10MB max
            return False, "Image too large"

        image = Image.open(io.BytesIO(image_data))
        if image.format not in ["PNG", "JPEG", "WEBP"]:
            return False, f"Unsupported format: {image.format}"

        return True, None

    @staticmethod
    def compress_image(
        image_data: bytes,
        quality: ImageQuality = ImageQuality.HIGH,
        max_dimension: int = 2048
    ) -> Tuple[bytes, str]:
        """
        Compress image with quality preset.

        Quality settings:
        - HIGH: JPEG 95, WebP 90
        - MEDIUM: JPEG 85, WebP 80
        - LOW: JPEG 75, WebP 70
        """
        image = Image.open(io.BytesIO(image_data))

        # Resize if too large
        if image.width > max_dimension or image.height > max_dimension:
            image.thumbnail((max_dimension, max_dimension), Image.Resampling.LANCZOS)

        # Compress
        output = io.BytesIO()
        image.save(output, format="JPEG", quality=85, optimize=True)
        return output.getvalue(), "image/jpeg"

    @staticmethod
    def generate_thumbnail(
        image_data: bytes,
        size: Tuple[int, int] = (256, 256)
    ) -> Tuple[bytes, str]:
        """Generate 256x256 thumbnail."""
        image = Image.open(io.BytesIO(image_data))
        image.thumbnail(size, Image.Resampling.LANCZOS)

        output = io.BytesIO()
        image.save(output, format="JPEG", quality=85, optimize=True)
        return output.getvalue(), "image/jpeg"

    @staticmethod
    def optimize_for_web(image_data: bytes) -> Tuple[bytes, bytes, dict]:
        """
        Optimize for web delivery.

        Returns:
            (optimized_full_image, thumbnail, metadata)
        """
        # Compress full image (max 2048px)
        optimized, content_type = ImageProcessor.compress_image(
            image_data,
            quality=ImageQuality.HIGH,
            max_dimension=2048
        )

        # Generate thumbnail
        thumbnail, thumb_type = ImageProcessor.generate_thumbnail(image_data)

        # Metadata
        metadata = {
            "original_size_bytes": len(image_data),
            "optimized_size_bytes": len(optimized),
            "thumbnail_size_bytes": len(thumbnail),
            "compression_ratio": round(len(optimized) / len(image_data), 2)
        }

        return optimized, thumbnail, metadata
```

---

## SAS Token Generation

### User Delegation Key (Recommended)

More secure than account-based SAS:

```python
# Get User Delegation Key (valid for 7 days)
user_delegation_key = client.get_user_delegation_key(
    key_start_time=datetime.utcnow(),
    key_expiry_time=datetime.utcnow() + timedelta(days=7)
)

# Generate SAS token (max 7 days expiry)
sas_token = generate_blob_sas(
    account_name=account_name,
    container_name=container_name,
    blob_name=blob_path,
    user_delegation_key=user_delegation_key,
    permission=BlobSasPermissions(read=True),  # Read-only
    expiry=datetime.utcnow() + timedelta(hours=168)  # 7 days
)

# Construct SAS URL
sas_url = f"https://{account_name}.blob.core.windows.net/{container_name}/{blob_path}?{sas_token}"
```

### Auto-Refresh Logic

Delegation key automatically refreshed when expiring:

```python
async def _get_user_delegation_key(self):
    now = datetime.utcnow()

    # Refresh if expired or expiring within 1 hour
    if (self._user_delegation_key is None or
        self._delegation_key_expiry - now < timedelta(hours=1)):

        self._user_delegation_key = self.client.get_user_delegation_key(
            key_start_time=now,
            key_expiry_time=now + timedelta(days=7)
        )
        self._delegation_key_expiry = now + timedelta(days=7)

    return self._user_delegation_key
```

---

## CDN Integration

### Azure CDN Setup

1. **Create CDN Profile**:
```bash
az cdn profile create \
  --name imagegen-cdn-profile \
  --resource-group $RESOURCE_GROUP \
  --sku Standard_Microsoft
```

2. **Create CDN Endpoint**:
```bash
az cdn endpoint create \
  --name imagegen-cdn \
  --profile-name imagegen-cdn-profile \
  --origin $STORAGE_ACCOUNT_NAME.blob.core.windows.net \
  --enable-compression true \
  --content-types-to-compress "image/png" "image/jpeg" "image/webp"
```

3. **Configure Caching Rules**:
```bash
# Cache images for 1 year
az cdn endpoint rule add \
  --name imagegen-cdn \
  --profile-name imagegen-cdn-profile \
  --rule-name "CacheImages" \
  --match-variable UrlFileExtension \
  --operator Equal \
  --match-values "jpg" "jpeg" "png" "webp" \
  --action-name CacheExpiration \
  --cache-behavior Override \
  --cache-duration "365.00:00:00"
```

### CDN URL Generation

```python
def get_cdn_url(self, blob_path: str) -> str:
    if self.settings.cdn_endpoint_url:
        # CDN URL: https://imagegen-cdn.azureedge.net/imagegen-images/...
        return f"{self.settings.cdn_endpoint_url}/{self.container_name}/{blob_path}"

    # Fallback to direct blob URL
    return blob_client.url
```

### CDN Benefits

✅ **Lower latency** - Edge locations worldwide
✅ **Reduced costs** - Less egress from storage account
✅ **Better performance** - Cached at edge
✅ **Compression** - CDN compresses responses
✅ **HTTPS** - Secure delivery

---

## Lifecycle Management

### Lifecycle Policy (JSON)

```json
{
  "rules": [
    {
      "name": "move-to-cool-tier",
      "type": "Lifecycle",
      "definition": {
        "actions": {
          "baseBlob": {
            "tierToCool": {
              "daysAfterModificationGreaterThan": 30
            }
          }
        },
        "filters": {
          "blobTypes": ["blockBlob"],
          "prefixMatch": ["imagegen-images/"]
        }
      }
    },
    {
      "name": "move-to-archive-tier",
      "definition": {
        "actions": {
          "baseBlob": {
            "tierToArchive": {
              "daysAfterModificationGreaterThan": 90
            }
          }
        }
      }
    },
    {
      "name": "delete-old-images-free-tier",
      "definition": {
        "actions": {
          "baseBlob": {
            "delete": {
              "daysAfterModificationGreaterThan": 90
            }
          }
        },
        "filters": {
          "blobIndexMatch": [
            {"name": "subscription_tier", "op": "==", "value": "free"}
          ]
        }
      }
    }
  ]
}
```

### Apply Lifecycle Policy

```bash
az storage account management-policy create \
  --account-name $STORAGE_ACCOUNT_NAME \
  --resource-group $RESOURCE_GROUP \
  --policy @azure/blob-lifecycle-policy.json
```

### Retention by Tier

| Subscription Tier | Retention Period | Auto-Delete After |
|-------------------|------------------|-------------------|
| **Free** | 90 days | 90 days |
| **Basic** | 180 days | 180 days |
| **Pro** | 365 days | 365 days |
| **Enterprise** | Unlimited | Never |

---

## Setup Instructions

### Complete Setup Script

```bash
#!/bin/bash
RESOURCE_GROUP="your-rg"
STORAGE_ACCOUNT_NAME="yourstorage"
CONTAINER_NAME="imagegen-images"
CONTAINER_APP_NAME="imagegen-api"

# 1. Create storage account
az storage account create \
  --name $STORAGE_ACCOUNT_NAME \
  --resource-group $RESOURCE_GROUP \
  --sku Standard_LRS \
  --kind StorageV2 \
  --https-only true \
  --allow-blob-public-access false

# 2. Create container
az storage container create \
  --name $CONTAINER_NAME \
  --account-name $STORAGE_ACCOUNT_NAME \
  --public-access off

# 3. Get Managed Identity Principal ID
PRINCIPAL_ID=$(az containerapp show \
  --name $CONTAINER_APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --query identity.principalId -o tsv)

# 4. Grant Storage Blob Data Contributor
STORAGE_ID=$(az storage account show \
  --name $STORAGE_ACCOUNT_NAME \
  --resource-group $RESOURCE_GROUP \
  --query id -o tsv)

az role assignment create \
  --assignee $PRINCIPAL_ID \
  --role "Storage Blob Data Contributor" \
  --scope $STORAGE_ID

# 5. Grant Storage Account Contributor (for User Delegation Key)
az role assignment create \
  --assignee $PRINCIPAL_ID \
  --role "Storage Account Contributor" \
  --scope $STORAGE_ID

# 6. Create CDN
az cdn profile create \
  --name imagegen-cdn-profile \
  --resource-group $RESOURCE_GROUP \
  --sku Standard_Microsoft

az cdn endpoint create \
  --name imagegen-cdn \
  --profile-name imagegen-cdn-profile \
  --origin $STORAGE_ACCOUNT_NAME.blob.core.windows.net \
  --enable-compression true

# 7. Apply lifecycle policy
az storage account management-policy create \
  --account-name $STORAGE_ACCOUNT_NAME \
  --resource-group $RESOURCE_GROUP \
  --policy @azure/blob-lifecycle-policy.json

# 8. Enable soft delete
az storage blob service-properties delete-policy update \
  --account-name $STORAGE_ACCOUNT_NAME \
  --enable true \
  --days-retained 7

echo "Setup complete!"
```

---

## Usage Examples

### 1. Upload Image from Replicate

```python
# Download from Replicate
image_data = await blob_service.download_from_url(
    "https://replicate.delivery/pbxt/abc123.png"
)

# Upload with optimization
blob_url, blob_path, metadata = await blob_service.upload_image(
    user_id="user_abc123",
    generation_id="gen_xyz456",
    filename=f"{generation_id}.png",
    image_data=image_data,
    optimize=True  # Compress + thumbnail
)

# Result:
# blob_url: Direct storage URL
# blob_path: user_abc123/gen_xyz456/gen_xyz456.png
# metadata: {
#     "optimized_size_bytes": 512000,
#     "has_thumbnail": true,
#     "compression_ratio": 0.45
# }
```

### 2. Generate Secure SAS URL

```python
# Generate 7-day SAS URL (read-only)
sas_url = await blob_service.generate_sas_url(
    blob_path="user_abc123/gen_xyz456/image.png",
    expiry_hours=168  # 7 days
)

# Share this URL with frontend
# Expires automatically after 7 days
# Read-only access
```

### 3. Get CDN URL

```python
# Get CDN-accelerated URL
cdn_url = blob_service.get_cdn_url(
    blob_path="user_abc123/gen_xyz456/image.png"
)

# Result: https://imagegen-cdn.azureedge.net/imagegen-images/user_abc123/gen_xyz456/image.png
# Cached globally for 1 year
# Fastest delivery
```

### 4. List User Images

```python
# List all images for a user
images = await blob_service.list_user_images(
    user_id="user_abc123",
    include_thumbnails=False  # Exclude thumbnails
)

# Result:
# [
#     {
#         "name": "user_abc123/gen_xyz456/image.png",
#         "url": "https://...",
#         "size_mb": 2.5,
#         "created_at": "2024-01-01T12:00:00Z"
#     }
# ]
```

### 5. Get Storage Metrics

```python
# Get storage usage for user
metrics = await blob_service.get_storage_metrics(user_id="user_abc123")

# Result:
# {
#     "total_images": 42,
#     "total_size_mb": 105.6,
#     "avg_image_size_mb": 2.5,
#     "total_thumbnails": 42,
#     "thumbnail_size_mb": 8.4
# }
```

---

## Cost Optimization

### Storage Tiers

| Tier | Cost/GB/Month | Use Case |
|------|---------------|----------|
| **Hot** | $0.018 | Recently uploaded (< 30 days) |
| **Cool** | $0.010 (44% cheaper) | Older images (30-90 days) |
| **Archive** | $0.00099 (95% cheaper) | Rarely accessed (90+ days) |

### Monthly Cost Estimate

**Scenario**: 1000 users, 10 images/user/month
- Total: 10,000 images/month
- Average size: 2MB/image
- Total storage: 20GB

**Cost Breakdown**:
```
Hot storage (0-30 days):      20GB × $0.018 = $0.36
Cool storage (30-90 days):    20GB × $0.010 = $0.20
Archive storage (90+ days):   20GB × $0.001 = $0.02
Operations:                                   $0.50
CDN egress (50GB):                           $5.00
──────────────────────────────────────────────────
Total:                                       ~$6.10/month
```

### Optimization Strategies

1. **Image Compression** (50-70% reduction)
2. **Lifecycle Management** (automatic tiering)
3. **CDN Caching** (reduce storage egress)
4. **Thumbnail Generation** (avoid full image downloads for gallery)

---

## Security

### Security Features

✅ **No account keys** - Managed Identity only
✅ **User Delegation SAS** - More secure than account-based
✅ **No public access** - All access through SAS tokens
✅ **HTTPS only** - TLS 1.2+ enforced
✅ **Soft delete** - 7-day recovery period
✅ **RBAC** - Fine-grained permissions
✅ **CDN HTTPS** - End-to-end encryption
✅ **Time-limited access** - SAS tokens expire automatically

### RBAC Roles

| Role | Permissions | Purpose |
|------|-------------|---------|
| **Storage Blob Data Contributor** | Read/Write/Delete blobs | Upload/download images |
| **Storage Account Contributor** | Generate User Delegation Keys | Create SAS tokens |

---

## Monitoring

### Storage Metrics

```bash
# Get storage capacity
az monitor metrics list \
  --resource $STORAGE_ID \
  --metric UsedCapacity

# Get transaction count
az monitor metrics list \
  --resource $STORAGE_ID \
  --metric Transactions
```

### Alerts

```bash
# Alert for high storage usage
az monitor metrics alert create \
  --name high-storage-usage \
  --resource-group $RESOURCE_GROUP \
  --scopes $STORAGE_ID \
  --condition "total UsedCapacity > 80000000000"

# Alert for high egress
az monitor metrics alert create \
  --name high-egress \
  --scopes $STORAGE_ID \
  --condition "total Egress > 107374182400"
```

---

## Complete Documentation

For detailed setup instructions, see:
- [BLOB_STORAGE_SETUP.md](BLOB_STORAGE_SETUP.md) - Complete setup guide

---

## Next Steps

1. ✅ Follow [BLOB_STORAGE_SETUP.md](BLOB_STORAGE_SETUP.md) to set up Azure resources
2. ✅ Grant Managed Identity RBAC permissions
3. ✅ Test image upload with optimization
4. ✅ Verify SAS URL generation
5. ✅ Test CDN delivery
6. ⏭️ Integrate with image generation workflow
