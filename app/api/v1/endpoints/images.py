"""Image management endpoints."""
import logging
from typing import List
from uuid import uuid4
from fastapi import APIRouter, Depends, File, UploadFile, HTTPException, status
from app.core.dependencies import get_clients
from app.core.azure_clients import AzureClients
from app.services.cosmos_service import CosmosService
from app.services.blob_service import BlobService
from app.schemas.image import ImageUploadResponse, ImageUpdateRequest, ImageListResponse
from app.models.image import ImageMetadata

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/upload", response_model=ImageUploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_image(
    file: UploadFile = File(...),
    azure_clients: AzureClients = Depends(get_clients)
):
    """Upload an image to Azure Blob Storage and save metadata to Cosmos DB.

    Args:
        file: Image file to upload
        azure_clients: Azure clients instance

    Returns:
        Upload response with image metadata

    Raises:
        HTTPException: If upload fails
    """
    try:
        # Validate file type
        if not file.content_type or not file.content_type.startswith("image/"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="File must be an image"
            )

        # Generate unique ID and blob name
        image_id = str(uuid4())
        file_extension = file.filename.split(".")[-1] if "." in file.filename else "jpg"
        blob_name = f"images/{image_id}.{file_extension}"

        # Upload to Blob Storage
        blob_service = BlobService(azure_clients)
        file_content = await file.read()
        file_size = len(file_content)

        # Create a file-like object from bytes
        from io import BytesIO
        file_data = BytesIO(file_content)

        blob_url = await blob_service.upload_blob(
            blob_name=blob_name,
            data=file_data,
            content_type=file.content_type,
            metadata={"original_filename": file.filename}
        )

        # Save metadata to Cosmos DB
        cosmos_service = CosmosService(azure_clients)
        image_metadata = ImageMetadata(
            id=image_id,
            user_id="default_user",  # TODO: Get from auth
            filename=file.filename,
            blob_name=blob_name,
            blob_url=blob_url,
            content_type=file.content_type,
            size_bytes=file_size
        )

        await cosmos_service.create_item(image_metadata.model_dump(mode="json"))

        logger.info(f"Image uploaded successfully: {image_id}")

        return ImageUploadResponse(
            id=image_id,
            filename=file.filename,
            blob_url=blob_url,
            size_bytes=file_size
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to upload image: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to upload image: {str(e)}"
        )


@router.get("/{image_id}", response_model=ImageMetadata)
async def get_image(
    image_id: str,
    azure_clients: AzureClients = Depends(get_clients)
):
    """Get image metadata by ID.

    Args:
        image_id: Image ID
        azure_clients: Azure clients instance

    Returns:
        Image metadata

    Raises:
        HTTPException: If image not found
    """
    try:
        cosmos_service = CosmosService(azure_clients)
        image_data = await cosmos_service.get_item(image_id, partition_key=image_id)

        if not image_data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Image not found"
            )

        return ImageMetadata(**image_data)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get image: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get image: {str(e)}"
        )


@router.get("/", response_model=ImageListResponse)
async def list_images(
    skip: int = 0,
    limit: int = 100,
    azure_clients: AzureClients = Depends(get_clients)
):
    """List all images.

    Args:
        skip: Number of images to skip
        limit: Maximum number of images to return
        azure_clients: Azure clients instance

    Returns:
        List of images

    Raises:
        HTTPException: If listing fails
    """
    try:
        cosmos_service = CosmosService(azure_clients)

        # Query with pagination
        query = f"SELECT * FROM c OFFSET {skip} LIMIT {limit}"
        images = await cosmos_service.query_items(query)

        return ImageListResponse(
            images=images,
            count=len(images)
        )

    except Exception as e:
        logger.error(f"Failed to list images: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list images: {str(e)}"
        )


@router.patch("/{image_id}", response_model=ImageMetadata)
async def update_image(
    image_id: str,
    update_data: ImageUpdateRequest,
    azure_clients: AzureClients = Depends(get_clients)
):
    """Update image metadata.

    Args:
        image_id: Image ID
        update_data: Update data
        azure_clients: Azure clients instance

    Returns:
        Updated image metadata

    Raises:
        HTTPException: If image not found or update fails
    """
    try:
        cosmos_service = CosmosService(azure_clients)

        # Get existing image
        image_data = await cosmos_service.get_item(image_id, partition_key=image_id)
        if not image_data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Image not found"
            )

        # Update fields
        if update_data.description is not None:
            image_data["description"] = update_data.description
        if update_data.tags is not None:
            image_data["tags"] = update_data.tags

        # Update in Cosmos DB
        updated_image = await cosmos_service.update_item(
            image_id,
            partition_key=image_id,
            item=image_data
        )

        return ImageMetadata(**updated_image)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to update image: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update image: {str(e)}"
        )


@router.delete("/{image_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_image(
    image_id: str,
    azure_clients: AzureClients = Depends(get_clients)
):
    """Delete an image and its metadata.

    Args:
        image_id: Image ID
        azure_clients: Azure clients instance

    Raises:
        HTTPException: If image not found or deletion fails
    """
    try:
        cosmos_service = CosmosService(azure_clients)
        blob_service = BlobService(azure_clients)

        # Get image metadata
        image_data = await cosmos_service.get_item(image_id, partition_key=image_id)
        if not image_data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Image not found"
            )

        # Delete blob
        await blob_service.delete_blob(image_data["blob_name"])

        # Delete metadata
        await cosmos_service.delete_item(image_id, partition_key=image_id)

        logger.info(f"Image deleted successfully: {image_id}")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete image: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete image: {str(e)}"
        )
