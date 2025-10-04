"""
Example: Replicate Service Integration with Queue Worker

This example shows how to integrate ReplicateService with the queue worker
for processing image generation requests.
"""

import asyncio
import logging
from datetime import datetime
from typing import Dict, Any

from app.config import Settings
from app.services.replicate_service import (
    ReplicateService,
    FluxModel,
    ContentSafetyError,
    ReplicateAPIError,
    ReplicateTimeoutError,
    ReplicateRateLimitError,
)
from app.services.azure_blob_service import AzureBlobService
from app.repositories.generation_repository import GenerationRepository
from app.repositories.subscription_repository import SubscriptionRepository
from app.models.generation import GenerationStatus

logger = logging.getLogger(__name__)


class ImageGenerationWorker:
    """
    Worker that processes image generation requests from Service Bus queue.

    Flow:
    1. Receive message from queue
    2. Validate user credits
    3. Call Replicate API
    4. Download generated images
    5. Upload to Azure Blob Storage
    6. Update database
    7. Deduct credits
    """

    def __init__(
        self,
        settings: Settings,
        replicate_service: ReplicateService,
        blob_service: AzureBlobService,
        generation_repo: GenerationRepository,
        subscription_repo: SubscriptionRepository,
    ):
        self.settings = settings
        self.replicate_service = replicate_service
        self.blob_service = blob_service
        self.generation_repo = generation_repo
        self.subscription_repo = subscription_repo

    async def process_generation_request(
        self, message: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Process a single generation request from queue.

        Args:
            message: Message from Service Bus queue
                {
                    "generation_id": "gen_123",
                    "user_id": "user_456",
                    "prompt": "A beautiful sunset",
                    "model": "flux-schnell",
                    "parameters": {...}
                }

        Returns:
            Result dictionary with status and URLs
        """
        generation_id = message["generation_id"]
        user_id = message["user_id"]
        prompt = message["prompt"]
        model_name = message.get("model", "flux-schnell")
        parameters = message.get("parameters", {})

        logger.info(f"Processing generation request: {generation_id}")

        try:
            # 1. Get generation record
            generation = await self.generation_repo.get_by_id(generation_id)
            if not generation:
                raise ValueError(f"Generation not found: {generation_id}")

            # Update status to processing
            await self.generation_repo.update(
                generation_id,
                {
                    "status": GenerationStatus.PROCESSING,
                    "started_at": datetime.utcnow(),
                },
            )

            # 2. Get user subscription
            subscription = await self.subscription_repo.get_by_user_id(user_id)
            if not subscription:
                raise ValueError(f"No subscription found for user: {user_id}")

            # 3. Determine model based on subscription plan
            model = self.replicate_service.get_model_for_plan(subscription.plan)

            # Calculate cost
            cost_credits = self.replicate_service.calculate_cost(model, num_images=1)

            # 4. Check if user has enough credits
            remaining_credits = (
                subscription.credits_per_month - subscription.credits_used_this_period
            )
            if remaining_credits < cost_credits:
                raise ValueError(
                    f"Insufficient credits. Required: {cost_credits}, Available: {remaining_credits}"
                )

            # 5. Generate image using Replicate
            start_time = datetime.utcnow()

            result = await self.replicate_service.generate_text_to_image(
                prompt=prompt,
                model=model,
                negative_prompt=parameters.get("negative_prompt"),
                width=parameters.get("width", 1024),
                height=parameters.get("height", 1024),
                num_inference_steps=parameters.get("num_inference_steps"),
                guidance_scale=parameters.get("guidance_scale", 7.5),
                seed=parameters.get("seed"),
                output_format=parameters.get("output_format", "png"),
            )

            processing_time = (datetime.utcnow() - start_time).total_seconds() * 1000

            # 6. Download images from Replicate
            output_urls = result.get("output", [])
            if not output_urls:
                raise ValueError("No images generated")

            downloaded_images = await self.replicate_service.download_all_outputs(
                output_urls
            )

            # 7. Upload to Azure Blob Storage
            blob_urls = []
            for idx, (image_bytes, content_type) in enumerate(downloaded_images):
                filename = f"{generation_id}_{idx}.png"
                blob_url = await self.blob_service.upload_image(
                    image_bytes, filename, content_type
                )
                blob_urls.append(blob_url)

            # 8. Update generation record
            await self.generation_repo.update(
                generation_id,
                {
                    "status": GenerationStatus.COMPLETED,
                    "replicate_prediction_id": result["prediction_id"],
                    "result_urls": output_urls,
                    "blob_urls": blob_urls,
                    "processing_time_ms": int(processing_time),
                    "cost_credits": cost_credits,
                    "completed_at": datetime.utcnow(),
                },
            )

            # 9. Deduct credits from subscription
            await self.subscription_repo.update(
                subscription.id,
                {
                    "credits_used_this_period": subscription.credits_used_this_period
                    + cost_credits
                },
            )

            logger.info(
                f"Generation completed: {generation_id}, "
                f"time={processing_time:.0f}ms, credits={cost_credits}"
            )

            return {
                "success": True,
                "generation_id": generation_id,
                "blob_urls": blob_urls,
                "processing_time_ms": processing_time,
                "cost_credits": cost_credits,
            }

        except ContentSafetyError as e:
            logger.warning(f"Content safety violation for {generation_id}: {e}")
            await self._handle_generation_failure(
                generation_id, f"Content safety violation: {e}"
            )
            return {
                "success": False,
                "generation_id": generation_id,
                "error": "content_safety_violation",
                "message": str(e),
            }

        except ReplicateTimeoutError as e:
            logger.error(f"Timeout for {generation_id}: {e}")
            await self._handle_generation_failure(generation_id, f"Timeout: {e}")
            return {
                "success": False,
                "generation_id": generation_id,
                "error": "timeout",
                "message": str(e),
            }

        except ReplicateRateLimitError as e:
            logger.warning(f"Rate limit for {generation_id}: {e}")
            # Don't mark as failed, allow retry
            return {
                "success": False,
                "generation_id": generation_id,
                "error": "rate_limit",
                "message": str(e),
                "retry": True,
            }

        except ReplicateAPIError as e:
            logger.error(f"Replicate API error for {generation_id}: {e}")
            await self._handle_generation_failure(
                generation_id, f"Generation failed: {e}"
            )
            return {
                "success": False,
                "generation_id": generation_id,
                "error": "api_error",
                "message": str(e),
            }

        except Exception as e:
            logger.error(f"Unexpected error for {generation_id}: {e}", exc_info=True)
            await self._handle_generation_failure(
                generation_id, f"Unexpected error: {e}"
            )
            return {
                "success": False,
                "generation_id": generation_id,
                "error": "unexpected_error",
                "message": str(e),
            }

    async def _handle_generation_failure(
        self, generation_id: str, error_message: str
    ):
        """
        Handle generation failure by updating database.

        Args:
            generation_id: Generation ID
            error_message: Error message
        """
        try:
            await self.generation_repo.update(
                generation_id,
                {
                    "status": GenerationStatus.FAILED,
                    "error_message": error_message,
                    "completed_at": datetime.utcnow(),
                },
            )
        except Exception as e:
            logger.error(f"Failed to update generation status: {e}")


async def example_text_to_image():
    """Example: Simple text-to-image generation."""
    settings = Settings()
    replicate_service = ReplicateService(settings)

    try:
        # Generate image
        result = await replicate_service.generate_text_to_image(
            prompt="A majestic mountain landscape at sunset, highly detailed",
            model=FluxModel.SCHNELL,
            width=1024,
            height=768,
            guidance_scale=7.5,
        )

        print(f"Generation successful!")
        print(f"Prediction ID: {result['prediction_id']}")
        print(f"Status: {result['status']}")
        print(f"Cost: {result['cost_credits']} credits")
        print(f"Output URLs: {result['output']}")

    except ContentSafetyError as e:
        print(f"Content safety error: {e}")
    except ReplicateTimeoutError as e:
        print(f"Timeout error: {e}")
    except ReplicateAPIError as e:
        print(f"API error: {e}")
    finally:
        await replicate_service.close()


async def example_image_to_image():
    """Example: Image-to-image transformation."""
    settings = Settings()
    replicate_service = ReplicateService(settings)

    try:
        # Transform existing image
        result = await replicate_service.generate_image_to_image(
            prompt="Transform this into a watercolor painting",
            image_url="https://example.com/input.jpg",
            model=FluxModel.DEV,
            guidance_scale=8.0,
        )

        print(f"Transformation successful!")
        print(f"Output: {result['output']}")

    finally:
        await replicate_service.close()


async def example_with_retry():
    """Example: Generation with retry logic."""
    settings = Settings()
    replicate_service = ReplicateService(settings)

    max_retries = 3
    retry_delay = 5  # seconds

    for attempt in range(max_retries):
        try:
            result = await replicate_service.generate_text_to_image(
                prompt="A futuristic cityscape",
                model=FluxModel.SCHNELL,
            )

            print(f"Success on attempt {attempt + 1}")
            print(f"Output: {result['output']}")
            break

        except ReplicateRateLimitError as e:
            if attempt < max_retries - 1:
                print(f"Rate limited, retrying in {retry_delay}s...")
                await asyncio.sleep(retry_delay)
                retry_delay *= 2  # Exponential backoff
            else:
                print(f"Max retries reached: {e}")

        except ReplicateTimeoutError as e:
            print(f"Timeout on attempt {attempt + 1}: {e}")
            break

        except Exception as e:
            print(f"Error on attempt {attempt + 1}: {e}")
            break

    await replicate_service.close()


async def example_cost_calculation():
    """Example: Calculate costs before generation."""
    settings = Settings()
    replicate_service = ReplicateService(settings)

    # Calculate costs for different models
    models = [FluxModel.SCHNELL, FluxModel.DEV, FluxModel.PRO]

    print("Cost per generation:")
    for model in models:
        cost = replicate_service.calculate_cost(model, num_images=1)
        print(f"  {model.value}: {cost} credits")

    print("\nCost for 10 images:")
    for model in models:
        cost = replicate_service.calculate_cost(model, num_images=10)
        print(f"  {model.value}: {cost} credits")

    await replicate_service.close()


async def example_health_check():
    """Example: Check Replicate API health."""
    settings = Settings()
    replicate_service = ReplicateService(settings)

    is_healthy = await replicate_service.health_check()

    if is_healthy:
        print("✓ Replicate API is healthy")
    else:
        print("✗ Replicate API is not accessible")

    await replicate_service.close()


if __name__ == "__main__":
    # Run examples
    print("=== Text-to-Image Example ===")
    asyncio.run(example_text_to_image())

    print("\n=== Image-to-Image Example ===")
    asyncio.run(example_image_to_image())

    print("\n=== Retry Logic Example ===")
    asyncio.run(example_with_retry())

    print("\n=== Cost Calculation Example ===")
    asyncio.run(example_cost_calculation())

    print("\n=== Health Check Example ===")
    asyncio.run(example_health_check())
