"""Image request/response schemas."""
from typing import Optional
from pydantic import BaseModel, Field


class ImageUploadResponse(BaseModel):
    """Response schema for image upload."""

    id: str = Field(..., description="Unique image ID")
    filename: str = Field(..., description="Original filename")
    blob_url: str = Field(..., description="Blob storage URL")
    size_bytes: int = Field(..., description="File size in bytes")
    message: str = Field(default="Image uploaded successfully")

    class Config:
        """Pydantic config."""
        json_schema_extra = {
            "example": {
                "id": "123e4567-e89b-12d3-a456-426614174000",
                "filename": "sunset.jpg",
                "blob_url": "https://mystorageaccount.blob.core.windows.net/images/sunset_123.jpg",
                "size_bytes": 2048576,
                "message": "Image uploaded successfully"
            }
        }


class ImageUpdateRequest(BaseModel):
    """Request schema for updating image metadata."""

    description: Optional[str] = Field(None, description="Image description")
    tags: Optional[list[str]] = Field(None, description="Image tags")

    class Config:
        """Pydantic config."""
        json_schema_extra = {
            "example": {
                "description": "Beautiful sunset over the ocean",
                "tags": ["sunset", "ocean", "nature"]
            }
        }


class ImageListResponse(BaseModel):
    """Response schema for listing images."""

    images: list[dict] = Field(..., description="List of images")
    count: int = Field(..., description="Total count of images")

    class Config:
        """Pydantic config."""
        json_schema_extra = {
            "example": {
                "images": [
                    {
                        "id": "123e4567-e89b-12d3-a456-426614174000",
                        "filename": "sunset.jpg",
                        "blob_url": "https://mystorageaccount.blob.core.windows.net/images/sunset_123.jpg"
                    }
                ],
                "count": 1
            }
        }


class ErrorResponse(BaseModel):
    """Error response schema."""

    detail: str = Field(..., description="Error detail message")
    status_code: int = Field(..., description="HTTP status code")

    class Config:
        """Pydantic config."""
        json_schema_extra = {
            "example": {
                "detail": "Image not found",
                "status_code": 404
            }
        }
