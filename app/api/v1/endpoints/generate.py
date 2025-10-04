"""
Image Generation Endpoints

API endpoints for creating and managing image generation requests.
Uses Azure Service Bus queue for asynchronous processing.
"""

import logging
from datetime import datetime
from typing import List, Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel, Field, validator

from app.core.auth_dependencies import (
    get_current_active_user,
    get_current_verified_user,
    require_credits,
)
from app.models.user import User
from app.models.generation import (
    Generation,
    GenerationStatus,
    GenerationType,
)
from app.repositories.generation_repository import GenerationRepository
from app.repositories.user_repository import UserRepository
from app.services.queue_service import AzureServiceBusService
from app.services.mongodb_service import MongoDBService
from app.core.azure_clients import AzureClients
from app.config import Settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/generate", tags=["Image Generation"])


# Pydantic Schemas
class GenerationRequest(BaseModel):
    """Request schema for image generation."""

    prompt: str = Field(
        ...,
        min_length=1,
        max_length=2000,
        description="Text prompt for image generation",
    )
    model: str = Field(
        default="flux-schnell",
        description="Model to use for generation",
    )
    settings: Optional[dict] = Field(
        default=None,
        description="Additional generation settings",
    )
    callback_url: Optional[str] = Field(
        default=None,
        description="Webhook URL for completion notification",
    )

    @validator("prompt")
    def validate_prompt(cls, v):
        """Validate prompt content."""
        if not v.strip():
            raise ValueError("Prompt cannot be empty")
        return v.strip()

    @validator("model")
    def validate_model(cls, v):
        """Validate model selection."""
        allowed_models = [
            "flux-schnell",
            "flux-dev",
            "flux-pro",
            "sdxl",
            "sd-3",
        ]
        if v not in allowed_models:
            raise ValueError(
                f"Invalid model. Allowed models: {', '.join(allowed_models)}"
            )
        return v


class GenerationResponse(BaseModel):
    """Response schema for generation creation."""

    generation_id: str
    status: str
    message: str
    estimated_time_seconds: int
    credits_deducted: int
    queue_position: Optional[int] = None


class GenerationStatusResponse(BaseModel):
    """Response schema for generation status."""

    generation_id: str
    status: str
    prompt: str
    model: str
    created_at: datetime
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    failed_at: Optional[datetime] = None
    image_url: Optional[str] = None
    thumbnail_url: Optional[str] = None
    cdn_url: Optional[str] = None
    error_message: Optional[str] = None
    processing_time_ms: Optional[int] = None


class GenerationListResponse(BaseModel):
    """Response schema for generation list."""

    generations: List[GenerationStatusResponse]
    total: int
    page: int
    page_size: int


# Dependency injection
async def get_generation_repository() -> GenerationRepository:
    """Get generation repository instance."""
    settings = Settings()
    azure_clients = AzureClients(settings)
    mongodb_service = MongoDBService(settings, azure_clients)

    # Connect if not already connected
    if not mongodb_service._client:
        connection_string = (
            await azure_clients.get_mongodb_connection_string_from_keyvault()
        )
        await mongodb_service.connect(connection_string)

    return GenerationRepository(mongodb_service)


async def get_user_repository() -> UserRepository:
    """Get user repository instance."""
    settings = Settings()
    azure_clients = AzureClients(settings)
    mongodb_service = MongoDBService(settings, azure_clients)

    if not mongodb_service._client:
        connection_string = (
            await azure_clients.get_mongodb_connection_string_from_keyvault()
        )
        await mongodb_service.connect(connection_string)

    return UserRepository(mongodb_service)


async def get_queue_service() -> AzureServiceBusService:
    """Get queue service instance."""
    settings = Settings()
    return AzureServiceBusService(settings)


@router.post(
    "/",
    response_model=GenerationResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Create image generation request",
)
async def create_generation(
    request: GenerationRequest,
    current_user: User = Depends(get_current_verified_user),
    generation_repo: GenerationRepository = Depends(get_generation_repository),
    user_repo: UserRepository = Depends(get_user_repository),
    queue_service: AzureServiceBusService = Depends(get_queue_service),
):
    """
    Create a new image generation request.

    The request is queued for asynchronous processing. Returns immediately
    with a generation_id that can be used to check status.

    Requirements:
    - User must be authenticated and verified
    - User must have sufficient credits

    Returns:
    - 202 Accepted: Request queued successfully
    - 402 Payment Required: Insufficient credits
    - 400 Bad Request: Invalid request parameters
    """
    try:
        # Calculate required credits (model-specific pricing)
        credits_required = _calculate_credits_required(request.model, request.settings)

        # Check if user has sufficient credits
        if current_user.credits_remaining < credits_required:
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail=f"Insufficient credits. Required: {credits_required}, "
                f"Available: {current_user.credits_remaining}",
            )

        # Deduct credits immediately
        updated_user = await user_repo.deduct_credits(
            current_user.id, credits_required
        )

        if not updated_user:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to deduct credits",
            )

        # Create generation record in database
        generation_id = str(uuid4())

        generation_data = {
            "id": generation_id,
            "user_id": current_user.id,
            "type": GenerationType.TEXT_TO_IMAGE,
            "status": GenerationStatus.PENDING,
            "prompt": request.prompt,
            "model": request.model,
            "settings": request.settings or {},
            "credits_used": credits_required,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
        }

        generation = await generation_repo.create(generation_data)

        # Send message to Service Bus queue
        success = await queue_service.send_generation_request(
            generation_id=generation_id,
            user_id=current_user.id,
            prompt=request.prompt,
            model=request.model,
            job_type=GenerationType.TEXT_TO_IMAGE,
            settings=request.settings,
            callback_url=request.callback_url,
            priority="normal",
        )

        if not success:
            # Refund credits if queue failed
            await user_repo.add_credits(current_user.id, credits_required)

            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to queue generation request",
            )

        # Increment user's generation count
        await user_repo.increment_generations(current_user.id)

        # Get estimated processing time
        estimated_time = _estimate_processing_time(request.model)

        logger.info(
            f"Generation queued: generation_id={generation_id}, "
            f"user_id={current_user.id}, model={request.model}"
        )

        return GenerationResponse(
            generation_id=generation_id,
            status=GenerationStatus.PENDING,
            message="Generation request queued successfully. Processing will begin shortly.",
            estimated_time_seconds=estimated_time,
            credits_deducted=credits_required,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating generation: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create generation request",
        )


@router.get(
    "/{generation_id}/status",
    response_model=GenerationStatusResponse,
    summary="Get generation status",
)
async def get_generation_status(
    generation_id: str,
    current_user: User = Depends(get_current_active_user),
    generation_repo: GenerationRepository = Depends(get_generation_repository),
):
    """
    Get the status of a generation request.

    Returns current status and available results. Status can be:
    - pending: Request is queued
    - processing: Generation is in progress
    - completed: Generation finished successfully
    - failed: Generation failed

    Returns:
    - 200 OK: Status retrieved successfully
    - 404 Not Found: Generation not found
    - 403 Forbidden: Generation belongs to another user
    """
    try:
        # Get generation from database
        generation = await generation_repo.find_by_id(generation_id)

        if not generation:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Generation not found",
            )

        # Check ownership
        if generation.user_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied",
            )

        return GenerationStatusResponse(
            generation_id=generation.id,
            status=generation.status,
            prompt=generation.prompt,
            model=generation.model,
            created_at=generation.created_at,
            started_at=generation.started_at,
            completed_at=generation.completed_at,
            failed_at=generation.failed_at,
            image_url=generation.image_url,
            thumbnail_url=generation.thumbnail_url,
            cdn_url=generation.cdn_url,
            error_message=generation.error_message,
            processing_time_ms=generation.processing_time_ms,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting generation status: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve generation status",
        )


@router.get(
    "/",
    response_model=GenerationListResponse,
    summary="List user generations",
)
async def list_generations(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    status_filter: Optional[str] = Query(default=None),
    current_user: User = Depends(get_current_active_user),
    generation_repo: GenerationRepository = Depends(get_generation_repository),
):
    """
    List all generations for the current user.

    Supports pagination and filtering by status.

    Query Parameters:
    - page: Page number (default: 1)
    - page_size: Items per page (default: 20, max: 100)
    - status_filter: Filter by status (pending, processing, completed, failed)

    Returns:
    - 200 OK: List of generations
    """
    try:
        # Build filter
        filter_dict = {"user_id": current_user.id}

        if status_filter:
            filter_dict["status"] = status_filter

        # Get generations with pagination
        skip = (page - 1) * page_size
        generations = await generation_repo.find_by_user(
            current_user.id,
            skip=skip,
            limit=page_size,
            status=status_filter,
        )

        # Get total count
        total = await generation_repo.count_by_user(
            current_user.id, status=status_filter
        )

        # Convert to response schema
        generation_responses = [
            GenerationStatusResponse(
                generation_id=gen.id,
                status=gen.status,
                prompt=gen.prompt,
                model=gen.model,
                created_at=gen.created_at,
                started_at=gen.started_at,
                completed_at=gen.completed_at,
                failed_at=gen.failed_at,
                image_url=gen.image_url,
                thumbnail_url=gen.thumbnail_url,
                cdn_url=gen.cdn_url,
                error_message=gen.error_message,
                processing_time_ms=gen.processing_time_ms,
            )
            for gen in generations
        ]

        return GenerationListResponse(
            generations=generation_responses,
            total=total,
            page=page,
            page_size=page_size,
        )

    except Exception as e:
        logger.error(f"Error listing generations: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve generations",
        )


@router.delete(
    "/{generation_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete generation",
)
async def delete_generation(
    generation_id: str,
    current_user: User = Depends(get_current_active_user),
    generation_repo: GenerationRepository = Depends(get_generation_repository),
):
    """
    Delete a generation record.

    Note: This only deletes the database record. Blob storage cleanup
    is handled by lifecycle policies.

    Returns:
    - 204 No Content: Deleted successfully
    - 404 Not Found: Generation not found
    - 403 Forbidden: Generation belongs to another user
    """
    try:
        # Get generation
        generation = await generation_repo.find_by_id(generation_id)

        if not generation:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Generation not found",
            )

        # Check ownership
        if generation.user_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied",
            )

        # Delete from database
        success = await generation_repo.delete_by_id(generation_id)

        if not success:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to delete generation",
            )

        logger.info(f"Generation deleted: generation_id={generation_id}")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting generation: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete generation",
        )


# Helper functions
def _calculate_credits_required(model: str, settings: Optional[dict]) -> int:
    """
    Calculate credits required for generation.

    Pricing varies by model and settings (resolution, steps, etc.).
    """
    base_credits = {
        "flux-schnell": 5,  # Fast, lower quality
        "flux-dev": 10,  # Balanced
        "flux-pro": 20,  # High quality
        "sdxl": 15,
        "sd-3": 15,
    }

    credits = base_credits.get(model, 10)

    # Adjust for settings
    if settings:
        # Higher resolution costs more
        if "width" in settings or "height" in settings:
            width = settings.get("width", 1024)
            height = settings.get("height", 1024)
            megapixels = (width * height) / 1_000_000

            if megapixels > 1.5:
                credits = int(credits * 1.5)

        # More outputs cost more
        num_outputs = settings.get("num_outputs", 1)
        credits *= num_outputs

    return credits


def _estimate_processing_time(model: str) -> int:
    """
    Estimate processing time in seconds based on model.
    """
    estimates = {
        "flux-schnell": 15,  # Very fast
        "flux-dev": 30,  # Moderate
        "flux-pro": 60,  # Slower but high quality
        "sdxl": 45,
        "sd-3": 45,
    }

    return estimates.get(model, 30)
