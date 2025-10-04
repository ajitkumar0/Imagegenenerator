"""Image data models."""
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class ImageMetadata(BaseModel):
    """Image metadata model."""

    id: str = Field(..., description="Unique image ID")
    user_id: str = Field(..., description="User ID who created the image")
    filename: str = Field(..., description="Original filename")
    blob_name: str = Field(..., description="Blob storage name")
    blob_url: str = Field(..., description="Blob storage URL")
    content_type: str = Field(default="image/jpeg", description="Image content type")
    size_bytes: int = Field(..., description="File size in bytes")
    width: Optional[int] = Field(None, description="Image width in pixels")
    height: Optional[int] = Field(None, description="Image height in pixels")
    description: Optional[str] = Field(None, description="Image description")
    tags: list[str] = Field(default_factory=list, description="Image tags")
    created_at: datetime = Field(default_factory=datetime.utcnow, description="Creation timestamp")
    updated_at: datetime = Field(default_factory=datetime.utcnow, description="Last update timestamp")

    class Config:
        """Pydantic config."""
        json_schema_extra = {
            "example": {
                "id": "123e4567-e89b-12d3-a456-426614174000",
                "user_id": "user123",
                "filename": "sunset.jpg",
                "blob_name": "images/sunset_123.jpg",
                "blob_url": "https://mystorageaccount.blob.core.windows.net/images/sunset_123.jpg",
                "content_type": "image/jpeg",
                "size_bytes": 2048576,
                "width": 1920,
                "height": 1080,
                "description": "Beautiful sunset over the ocean",
                "tags": ["sunset", "ocean", "nature"],
                "created_at": "2024-01-01T12:00:00Z",
                "updated_at": "2024-01-01T12:00:00Z"
            }
        }
