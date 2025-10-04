"""Azure Blob Storage service for file operations."""
import logging
from typing import Optional, BinaryIO, List
from azure.storage.blob import BlobClient, BlobProperties
from azure.core.exceptions import ResourceNotFoundError
from app.core.azure_clients import AzureClients

logger = logging.getLogger(__name__)


class BlobService:
    """Service for Azure Blob Storage operations."""

    def __init__(self, azure_clients: AzureClients):
        """Initialize Blob Storage service.

        Args:
            azure_clients: Azure clients instance
        """
        self.azure_clients = azure_clients
        self.container_client = azure_clients.get_blob_container_client()

    async def upload_blob(
        self,
        blob_name: str,
        data: BinaryIO,
        content_type: Optional[str] = None,
        metadata: Optional[dict] = None,
        overwrite: bool = True
    ) -> str:
        """Upload a blob to Azure Storage.

        Args:
            blob_name: Name of the blob
            data: Binary data to upload
            content_type: Content type of the blob
            metadata: Metadata dictionary
            overwrite: Whether to overwrite existing blob

        Returns:
            URL of the uploaded blob

        Raises:
            Exception: If upload fails
        """
        try:
            blob_client = self.container_client.get_blob_client(blob_name)

            upload_kwargs = {
                "data": data,
                "overwrite": overwrite,
            }

            if content_type:
                upload_kwargs["content_settings"] = {"content_type": content_type}

            if metadata:
                upload_kwargs["metadata"] = metadata

            blob_client.upload_blob(**upload_kwargs)

            blob_url = blob_client.url
            logger.info(f"Uploaded blob: {blob_name}")
            return blob_url

        except Exception as e:
            logger.error(f"Failed to upload blob {blob_name}: {str(e)}")
            raise

    async def download_blob(self, blob_name: str) -> bytes:
        """Download a blob from Azure Storage.

        Args:
            blob_name: Name of the blob

        Returns:
            Blob data as bytes

        Raises:
            ResourceNotFoundError: If blob not found
            Exception: If download fails
        """
        try:
            blob_client = self.container_client.get_blob_client(blob_name)
            blob_data = blob_client.download_blob().readall()
            logger.info(f"Downloaded blob: {blob_name}")
            return blob_data

        except ResourceNotFoundError:
            logger.warning(f"Blob not found: {blob_name}")
            raise

        except Exception as e:
            logger.error(f"Failed to download blob {blob_name}: {str(e)}")
            raise

    async def delete_blob(self, blob_name: str) -> bool:
        """Delete a blob from Azure Storage.

        Args:
            blob_name: Name of the blob

        Returns:
            True if deleted successfully

        Raises:
            Exception: If deletion fails
        """
        try:
            blob_client = self.container_client.get_blob_client(blob_name)
            blob_client.delete_blob()
            logger.info(f"Deleted blob: {blob_name}")
            return True

        except ResourceNotFoundError:
            logger.warning(f"Blob not found for deletion: {blob_name}")
            return False

        except Exception as e:
            logger.error(f"Failed to delete blob {blob_name}: {str(e)}")
            raise

    async def blob_exists(self, blob_name: str) -> bool:
        """Check if a blob exists.

        Args:
            blob_name: Name of the blob

        Returns:
            True if blob exists, False otherwise
        """
        try:
            blob_client = self.container_client.get_blob_client(blob_name)
            blob_client.get_blob_properties()
            return True

        except ResourceNotFoundError:
            return False

        except Exception as e:
            logger.error(f"Error checking blob existence {blob_name}: {str(e)}")
            raise

    async def get_blob_properties(self, blob_name: str) -> Optional[BlobProperties]:
        """Get properties of a blob.

        Args:
            blob_name: Name of the blob

        Returns:
            Blob properties or None if not found
        """
        try:
            blob_client = self.container_client.get_blob_client(blob_name)
            properties = blob_client.get_blob_properties()
            logger.info(f"Retrieved properties for blob: {blob_name}")
            return properties

        except ResourceNotFoundError:
            logger.warning(f"Blob not found: {blob_name}")
            return None

        except Exception as e:
            logger.error(f"Failed to get blob properties {blob_name}: {str(e)}")
            raise

    async def list_blobs(self, prefix: Optional[str] = None) -> List[str]:
        """List all blobs in the container.

        Args:
            prefix: Optional prefix to filter blobs

        Returns:
            List of blob names
        """
        try:
            blob_list = []
            blobs = self.container_client.list_blobs(name_starts_with=prefix)

            for blob in blobs:
                blob_list.append(blob.name)

            logger.info(f"Listed {len(blob_list)} blobs")
            return blob_list

        except Exception as e:
            logger.error(f"Failed to list blobs: {str(e)}")
            raise

    async def get_blob_url(self, blob_name: str) -> str:
        """Get the URL of a blob.

        Args:
            blob_name: Name of the blob

        Returns:
            URL of the blob
        """
        blob_client = self.container_client.get_blob_client(blob_name)
        return blob_client.url

    async def copy_blob(self, source_blob_name: str, destination_blob_name: str) -> str:
        """Copy a blob within the same container.

        Args:
            source_blob_name: Name of the source blob
            destination_blob_name: Name of the destination blob

        Returns:
            URL of the destination blob

        Raises:
            Exception: If copy fails
        """
        try:
            source_blob_client = self.container_client.get_blob_client(source_blob_name)
            dest_blob_client = self.container_client.get_blob_client(destination_blob_name)

            dest_blob_client.start_copy_from_url(source_blob_client.url)
            logger.info(f"Copied blob from {source_blob_name} to {destination_blob_name}")

            return dest_blob_client.url

        except Exception as e:
            logger.error(f"Failed to copy blob: {str(e)}")
            raise
