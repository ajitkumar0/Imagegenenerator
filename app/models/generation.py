"""Image generation data models."""
from datetime import datetime
from typing import Optional, Dict, Any
from enum import Enum
from pydantic import BaseModel, Field, HttpUrl, validator


class GenerationStatus(str, Enum):
    """Generation status options."""
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class ModelType(str, Enum):
    """AI model type options."""
    STABLE_DIFFUSION_XL = "stable-diffusion-xl"
    STABLE_DIFFUSION_V2 = "stable-diffusion-v2"
    DALLE_3 = "dalle-3"
    MIDJOURNEY = "midjourney"


class ImageSize(str, Enum):
    """Image size options."""
    SQUARE_512 = "512x512"
    SQUARE_1024 = "1024x1024"
    PORTRAIT = "768x1024"
    LANDSCAPE = "1024x768"
    WIDE = "1024x576"


class GenerationBase(BaseModel):
    """Base generation model."""
    prompt: str = Field(..., min_length=1, max_length=2000, description="Generation prompt")
    negative_prompt: Optional[str] = Field(None, max_length=1000, description="Negative prompt")
    model_type: ModelType = ModelType.STABLE_DIFFUSION_XL
    image_size: ImageSize = ImageSize.SQUARE_1024
    num_images: int = Field(default=1, ge=1, le=4, description="Number of images to generate")


class GenerationCreate(GenerationBase):
    """Generation creation model."""
    user_id: str = Field(..., description="User ID who created this generation")

    # Advanced parameters
    guidance_scale: float = Field(default=7.5, ge=1.0, le=20.0, description="Guidance scale")
    num_inference_steps: int = Field(default=50, ge=10, le=150, description="Number of inference steps")
    seed: Optional[int] = Field(None, description="Random seed for reproducibility")

    @validator('prompt')
    def validate_prompt(cls, v):
        """Validate prompt is not empty."""
        if not v or not v.strip():
            raise ValueError('Prompt cannot be empty')
        return v.strip()


class GenerationUpdate(BaseModel):
    """Generation update model."""
    status: Optional[GenerationStatus] = None
    replicate_prediction_id: Optional[str] = None
    result_urls: Optional[list[str]] = None
    blob_urls: Optional[list[str]] = None
    error_message: Optional[str] = None
    processing_time_ms: Optional[int] = None


class Generation(GenerationBase):
    """Complete generation model."""
    id: str = Field(..., description="Unique generation ID")
    user_id: str = Field(..., description="User ID who created this generation")

    # Status tracking
    status: GenerationStatus = GenerationStatus.PENDING

    # Replicate API integration
    replicate_prediction_id: Optional[str] = None
    replicate_version: Optional[str] = None

    # Results
    result_urls: list[str] = Field(default_factory=list, description="Temporary result URLs from Replicate")
    blob_urls: list[str] = Field(default_factory=list, description="Permanent Azure Blob Storage URLs")

    # Advanced parameters
    guidance_scale: float = 7.5
    num_inference_steps: int = 50
    seed: Optional[int] = None

    # Metadata
    error_message: Optional[str] = None
    processing_time_ms: Optional[int] = None
    cost_credits: int = Field(default=1, description="Credits cost for this generation")

    # Timestamps
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None

    class Config:
        """Pydantic config."""
        use_enum_values = True
        json_schema_extra = {
            "example": {
                "id": "gen_123",
                "user_id": "user_123",
                "prompt": "A beautiful sunset over mountains",
                "negative_prompt": "blurry, low quality",
                "model_type": "stable-diffusion-xl",
                "image_size": "1024x1024",
                "num_images": 1,
                "status": "completed",
                "replicate_prediction_id": "pred_abc123",
                "result_urls": ["https://replicate.delivery/example.png"],
                "blob_urls": ["https://storage.blob.core.windows.net/images/gen_123.png"],
                "guidance_scale": 7.5,
                "num_inference_steps": 50,
                "cost_credits": 1,
                "processing_time_ms": 5000,
                "created_at": "2024-01-01T12:00:00Z"
            }
        }


class GenerationPublic(BaseModel):
    """Public generation model (safe to expose in API)."""
    id: str
    prompt: str
    model_type: ModelType
    image_size: ImageSize
    num_images: int
    status: GenerationStatus
    blob_urls: list[str]
    processing_time_ms: Optional[int]
    created_at: datetime
    completed_at: Optional[datetime]

    class Config:
        """Pydantic config."""
        use_enum_values = True


class GenerationStats(BaseModel):
    """Generation statistics model."""
    total_generations: int
    completed_generations: int
    failed_generations: int
    total_processing_time_ms: int
    average_processing_time_ms: float
    most_used_model: str
    total_credits_spent: int

    class Config:
        """Pydantic config."""
        json_schema_extra = {
            "example": {
                "total_generations": 100,
                "completed_generations": 95,
                "failed_generations": 5,
                "total_processing_time_ms": 500000,
                "average_processing_time_ms": 5000,
                "most_used_model": "stable-diffusion-xl",
                "total_credits_spent": 100
            }
        }
