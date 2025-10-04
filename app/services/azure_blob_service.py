"""Azure Blob Storage service with Managed Identity, SAS tokens, and CDN integration."""
import logging
from typing import Optional, List, Tuple
from datetime import datetime, timedelta
from io import BytesIO
import httpx
from azure.storage.blob import (
    BlobServiceClient,
    BlobSasPermissions,
    generate_blob_sas,
    BlobClient,
    ContainerClient,
    BlobProperties,
    ContentSettings
)
from azure.core.exceptions import ResourceNotFoundError, ResourceExistsError
from tenacity import retry, stop_after_attempt, wait_exponential
from app.config import Settings
from app.utils.image_processor import ImageProcessor

logger = logging.getLogger(__name__)


class AzureBlobService:
    """Azure Blob Storage service with Managed Identity and SAS token generation."""

    def __init__(self, blob_service_client: BlobServiceClient, settings: Settings):
        """Initialize Azure Blob Storage service.

        Args:
            blob_service_client: Authenticated BlobServiceClient with Managed Identity
            settings: Application settings
        """
        self.client = blob_service_client
        self.settings = settings
        self.container_name = settings.blob_container_name
        self._container_client: Optional[ContainerClient] = None
        self._user_delegation_key = None
        self._delegation_key_expiry = None

    async def _ensure_container_exists(self) -> ContainerClient:
        """Ensure blob container exists.

        Returns:
            ContainerClient instance
        """
        if self._container_client is None:
            try:
                self._container_client = self.client.get_container_client(self.container_name)

                # Check if container exists
                if not self._container_client.exists():
                    logger.info(f"Creating container: {self.container_name}")
                    self._container_client.create_container()
                    logger.info(f"Container created: {self.container_name}")

            except ResourceExistsError:
                logger.info(f"Container already exists: {self.container_name}")
            except Exception as e:
                logger.error(f"Error ensuring container exists: {str(e)}")
                raise

        return self._container_client

    async def _get_user_delegation_key(self) -> dict:
        """Get or refresh User Delegation Key for SAS token generation.

        Returns:
            User delegation key
        """
        now = datetime.utcnow()

        # Refresh key if expired or about to expire (within 1 hour)
        if (self._user_delegation_key is None or
            self._delegation_key_expiry is None or
            self._delegation_key_expiry - now < timedelta(hours=1)):

            logger.info("Requesting new User Delegation Key")

            # Key valid for 7 days
            key_start_time = now
            key_expiry_time = now + timedelta(days=7)

            self._user_delegation_key = self.client.get_user_delegation_key(
                key_start_time=key_start_time,
                key_expiry_time=key_expiry_time
            )
            self._delegation_key_expiry = key_expiry_time

            logger.info(f"User Delegation Key obtained, valid until {key_expiry_time}")

        return self._user_delegation_key

    def _get_blob_path(self, user_id: str, generation_id: str, filename: str) -> str:
        """Generate blob path.

        Args:
            user_id: User ID
            generation_id: Generation ID
            filename: File name

        Returns:
            Blob path: {user_id}/{generation_id}/{filename}
        """
        return f"{user_id}/{generation_id}/{filename}"

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        reraise=True
    )
    async def upload_image(
        self,
        user_id: str,
        generation_id: str,
        filename: str,
        image_data: bytes,
        content_type: str = "image/png",
        metadata: Optional[dict] = None,
        optimize: bool = True
    ) -> Tuple[str, str, dict]:
        """Upload image to Azure Blob Storage.

        Args:
            user_id: User ID
            generation_id: Generation ID
            filename: File name
            image_data: Image bytes
            content_type: Content type
            metadata: Optional metadata
            optimize: Whether to optimize image for web

        Returns:
            Tuple of (blob_url, blob_path, upload_metadata)
        """
        try:
            container = await self._ensure_container_exists()

            # Optimize image if requested
            if optimize:
                logger.info("Optimizing image for web")
                optimized_image, thumbnail, opt_metadata = ImageProcessor.optimize_for_web(image_data)
                image_data = optimized_image
                metadata = metadata or {}
                metadata.update(opt_metadata)

                # Upload thumbnail separately
                thumbnail_filename = f"thumb_{filename}"
                thumbnail_path = self._get_blob_path(user_id, generation_id, thumbnail_filename)

                await self._upload_blob(
                    container,
                    thumbnail_path,
                    thumbnail,
                    opt_metadata.get("thumbnail_content_type", "image/jpeg"),
                    {**metadata, "is_thumbnail": "true"}
                )
                logger.info(f"Thumbnail uploaded: {thumbnail_path}")

            # Generate blob path
            blob_path = self._get_blob_path(user_id, generation_id, filename)

            # Upload main image
            blob_url = await self._upload_blob(
                container,
                blob_path,
                image_data,
                content_type,
                metadata
            )

            upload_metadata = {
                "blob_url": blob_url,
                "blob_path": blob_path,
                "size_bytes": len(image_data),
                "content_type": content_type,
                "uploaded_at": datetime.utcnow().isoformat(),
                "has_thumbnail": optimize,
            }

            if optimize and metadata:
                upload_metadata["optimization"] = metadata

            logger.info(f"Image uploaded: {blob_path} ({len(image_data)/1024:.1f}KB)")

            return blob_url, blob_path, upload_metadata

        except Exception as e:
            logger.error(f"Error uploading image: {str(e)}")
            raise

    async def _upload_blob(
        self,
        container: ContainerClient,
        blob_path: str,
        data: bytes,
        content_type: str,
        metadata: Optional[dict] = None
    ) -> str:
        """Upload blob to container.

        Args:
            container: Container client
            blob_path: Blob path
            data: Blob data
            content_type: Content type
            metadata: Metadata

        Returns:
            Blob URL
        """
        blob_client = container.get_blob_client(blob_path)

        # Set content settings
        content_settings = ContentSettings(
            content_type=content_type,
            cache_control="public, max-age=31536000",  # 1 year cache
        )

        # Add default metadata
        upload_metadata = metadata or {}
        upload_metadata.update({
            "uploaded_at": datetime.utcnow().isoformat(),
            "uploaded_by": "imagegen-api"
        })

        # Upload blob
        blob_client.upload_blob(
            data,
            overwrite=True,
            content_settings=content_settings,
            metadata=upload_metadata
        )

        return blob_client.url

    async def generate_sas_url(
        self,
        blob_path: str,
        expiry_hours: int = 168,  # 7 days default
        permissions: str = "r"
    ) -> str:
        """Generate User Delegation SAS URL for blob.

        Args:
            blob_path: Blob path
            expiry_hours: SAS token expiry in hours (max 7 days = 168 hours)
            permissions: Permissions (r=read, w=write, d=delete)

        Returns:
            SAS URL
        """
        try:
            # Get User Delegation Key
            user_delegation_key = await self._get_user_delegation_key()

            # Calculate SAS expiry
            start_time = datetime.utcnow()
            expiry_time = start_time + timedelta(hours=min(expiry_hours, 168))

            # Generate SAS token
            sas_token = generate_blob_sas(
                account_name=self.client.account_name,
                container_name=self.container_name,
                blob_name=blob_path,
                user_delegation_key=user_delegation_key,
                permission=BlobSasPermissions(read="r" in permissions, write="w" in permissions, delete="d" in permissions),
                start=start_time,
                expiry=expiry_time
            )

            # Construct SAS URL
            blob_client = self.client.get_blob_client(self.container_name, blob_path)
            sas_url = f"{blob_client.url}?{sas_token}"

            logger.info(f"Generated SAS URL for {blob_path}, expires at {expiry_time}")

            return sas_url

        except Exception as e:
            logger.error(f"Error generating SAS URL: {str(e)}")
            raise

    def get_cdn_url(self, blob_path: str) -> str:
        """Get Azure CDN URL for blob.

        Args:
            blob_path: Blob path

        Returns:
            CDN URL if configured, otherwise blob URL
        """
        if self.settings.cdn_endpoint_url:
            cdn_url = f"{self.settings.cdn_endpoint_url}/{self.container_name}/{blob_path}"
            logger.info(f"Generated CDN URL: {cdn_url}")
            return cdn_url

        # Fallback to direct blob URL
        blob_client = self.client.get_blob_client(self.container_name, blob_path)
        return blob_client.url

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        reraise=True
    )
    async def download_image(self, blob_path: str) -> bytes:
        """Download image from Azure Blob Storage.

        Args:
            blob_path: Blob path

        Returns:
            Image bytes
        """
        try:
            container = await self._ensure_container_exists()
            blob_client = container.get_blob_client(blob_path)

            # Download blob
            download_stream = blob_client.download_blob()
            image_data = download_stream.readall()

            logger.info(f"Downloaded image: {blob_path} ({len(image_data)/1024:.1f}KB)")

            return image_data

        except ResourceNotFoundError:
            logger.warning(f"Blob not found: {blob_path}")
            raise
        except Exception as e:
            logger.error(f"Error downloading image: {str(e)}")
            raise

    async def download_from_url(self, url: str) -> bytes:
        """Download image from URL (e.g., Replicate).

        Args:
            url: Image URL

        Returns:
            Image bytes
        """
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(url)
                response.raise_for_status()

                image_data = response.content

                logger.info(f"Downloaded image from URL: {url} ({len(image_data)/1024:.1f}KB)")

                return image_data

        except Exception as e:
            logger.error(f"Error downloading from URL {url}: {str(e)}")
            raise

    async def delete_image(self, blob_path: str, delete_thumbnail: bool = True) -> bool:
        """Delete image from Azure Blob Storage.

        Args:
            blob_path: Blob path
            delete_thumbnail: Whether to delete thumbnail too

        Returns:
            True if deleted successfully
        """
        try:
            container = await self._ensure_container_exists()

            # Delete main image
            blob_client = container.get_blob_client(blob_path)
            blob_client.delete_blob()

            logger.info(f"Deleted image: {blob_path}")

            # Delete thumbnail if exists
            if delete_thumbnail:
                # Extract filename and create thumbnail path
                parts = blob_path.split("/")
                if len(parts) == 3:
                    user_id, generation_id, filename = parts
                    thumbnail_path = self._get_blob_path(user_id, generation_id, f"thumb_{filename}")

                    try:
                        thumb_client = container.get_blob_client(thumbnail_path)
                        thumb_client.delete_blob()
                        logger.info(f"Deleted thumbnail: {thumbnail_path}")
                    except ResourceNotFoundError:
                        logger.info(f"Thumbnail not found: {thumbnail_path}")

            return True

        except ResourceNotFoundError:
            logger.warning(f"Blob not found for deletion: {blob_path}")
            return False
        except Exception as e:
            logger.error(f"Error deleting image: {str(e)}")
            raise

    async def list_user_images(
        self,
        user_id: str,
        generation_id: Optional[str] = None,
        include_thumbnails: bool = False
    ) -> List[dict]:
        """List all images for a user.

        Args:
            user_id: User ID
            generation_id: Optional generation ID to filter
            include_thumbnails: Include thumbnail blobs

        Returns:
            List of blob information
        """
        try:
            container = await self._ensure_container_exists()

            # Create prefix for filtering
            prefix = f"{user_id}/"
            if generation_id:
                prefix = f"{user_id}/{generation_id}/"

            # List blobs
            blobs = []
            async for blob in container.list_blobs(name_starts_with=prefix):
                # Skip thumbnails if not requested
                if not include_thumbnails and blob.name.split("/")[-1].startswith("thumb_"):
                    continue

                blob_info = {
                    "name": blob.name,
                    "url": f"{container.url}/{blob.name}",
                    "size_bytes": blob.size,
                    "size_mb": round(blob.size / (1024 * 1024), 2),
                    "content_type": blob.content_settings.content_type if blob.content_settings else None,
                    "created_at": blob.creation_time.isoformat() if blob.creation_time else None,
                    "last_modified": blob.last_modified.isoformat() if blob.last_modified else None,
                    "metadata": blob.metadata or {}
                }

                blobs.append(blob_info)

            logger.info(f"Listed {len(blobs)} blobs for user {user_id}")

            return blobs

        except Exception as e:
            logger.error(f"Error listing user images: {str(e)}")
            raise

    async def get_blob_properties(self, blob_path: str) -> Optional[dict]:
        """Get blob properties.

        Args:
            blob_path: Blob path

        Returns:
            Blob properties dictionary or None if not found
        """
        try:
            container = await self._ensure_container_exists()
            blob_client = container.get_blob_client(blob_path)

            properties = blob_client.get_blob_properties()

            return {
                "name": properties.name,
                "size_bytes": properties.size,
                "content_type": properties.content_settings.content_type if properties.content_settings else None,
                "created_at": properties.creation_time.isoformat() if properties.creation_time else None,
                "last_modified": properties.last_modified.isoformat() if properties.last_modified else None,
                "etag": properties.etag,
                "metadata": properties.metadata or {},
                "lease_status": properties.lease.status if properties.lease else None,
            }

        except ResourceNotFoundError:
            logger.warning(f"Blob not found: {blob_path}")
            return None
        except Exception as e:
            logger.error(f"Error getting blob properties: {str(e)}")
            raise

    async def get_storage_metrics(self, user_id: Optional[str] = None) -> dict:
        """Get storage usage metrics.

        Args:
            user_id: Optional user ID to get metrics for specific user

        Returns:
            Storage metrics dictionary
        """
        try:
            container = await self._ensure_container_exists()

            # Create prefix if user_id provided
            prefix = f"{user_id}/" if user_id else None

            # Aggregate metrics
            total_size = 0
            blob_count = 0
            thumbnail_count = 0
            total_thumbnail_size = 0

            async for blob in container.list_blobs(name_starts_with=prefix):
                blob_count += 1
                total_size += blob.size

                # Check if thumbnail
                if blob.name.split("/")[-1].startswith("thumb_"):
                    thumbnail_count += 1
                    total_thumbnail_size += blob.size

            metrics = {
                "user_id": user_id,
                "total_blobs": blob_count,
                "total_images": blob_count - thumbnail_count,
                "total_thumbnails": thumbnail_count,
                "total_size_bytes": total_size,
                "total_size_mb": round(total_size / (1024 * 1024), 2),
                "total_size_gb": round(total_size / (1024 * 1024 * 1024), 3),
                "image_size_mb": round((total_size - total_thumbnail_size) / (1024 * 1024), 2),
                "thumbnail_size_mb": round(total_thumbnail_size / (1024 * 1024), 2),
                "avg_image_size_mb": round((total_size - total_thumbnail_size) / max(blob_count - thumbnail_count, 1) / (1024 * 1024), 2),
            }

            logger.info(f"Storage metrics: {metrics}")

            return metrics

        except Exception as e:
            logger.error(f"Error getting storage metrics: {str(e)}")
            raise

    async def purge_cdn_cache(self, blob_paths: List[str]) -> bool:
        """Purge Azure CDN cache for specific blobs.

        Note: This requires Azure CDN management API access.
        For now, this is a placeholder.

        Args:
            blob_paths: List of blob paths to purge

        Returns:
            True if purge initiated successfully
        """
        logger.warning("CDN cache purge not implemented yet")
        # TODO: Implement Azure CDN purge using azure-mgmt-cdn
        return False
