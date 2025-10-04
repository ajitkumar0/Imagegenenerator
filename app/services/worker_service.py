"""
Background Worker Service for Image Generation

Processes image generation jobs from Azure Service Bus queue.
Handles Replicate API calls, blob storage uploads, and database updates.
"""

import logging
import asyncio
from datetime import datetime
from typing import Any, Dict, Optional, List
import traceback

from azure.servicebus import ServiceBusReceiver
from tenacity import retry, stop_after_attempt, wait_exponential

from app.config import Settings
from app.services.queue_service import (
    AzureServiceBusService,
    GenerationJobMessage,
)
from app.services.replicate_service import ReplicateService, GenerationStatus
from app.services.azure_blob_service import AzureBlobService
from app.services.mongodb_service import MongoDBService
from app.repositories.generation_repository import GenerationRepository
from app.repositories.user_repository import UserRepository
from app.models.generation import GenerationStatus as DBGenerationStatus

logger = logging.getLogger(__name__)


class WorkerMetrics:
    """Metrics for worker performance tracking."""

    def __init__(self):
        self.jobs_processed = 0
        self.jobs_succeeded = 0
        self.jobs_failed = 0
        self.total_processing_time = 0.0
        self.start_time = datetime.utcnow()

    def record_success(self, processing_time: float):
        """Record successful job."""
        self.jobs_processed += 1
        self.jobs_succeeded += 1
        self.total_processing_time += processing_time

    def record_failure(self, processing_time: float):
        """Record failed job."""
        self.jobs_processed += 1
        self.jobs_failed += 1
        self.total_processing_time += processing_time

    def get_metrics(self) -> Dict[str, Any]:
        """Get current metrics."""
        uptime = (datetime.utcnow() - self.start_time).total_seconds()
        avg_processing_time = (
            self.total_processing_time / self.jobs_processed
            if self.jobs_processed > 0
            else 0
        )

        return {
            "uptime_seconds": uptime,
            "jobs_processed": self.jobs_processed,
            "jobs_succeeded": self.jobs_succeeded,
            "jobs_failed": self.jobs_failed,
            "success_rate": (
                self.jobs_succeeded / self.jobs_processed
                if self.jobs_processed > 0
                else 0
            ),
            "avg_processing_time": avg_processing_time,
        }


class BackgroundWorker:
    """
    Background worker for processing image generation jobs.

    Workflow:
    1. Receive message from Service Bus queue
    2. Update generation status to "processing"
    3. Call Replicate API to generate image
    4. Poll for completion
    5. Download generated image
    6. Upload to Azure Blob Storage with optimization
    7. Update Cosmos DB with results and URLs
    8. Complete or dead-letter message
    """

    def __init__(
        self,
        settings: Settings,
        queue_service: AzureServiceBusService,
        replicate_service: ReplicateService,
        blob_service: AzureBlobService,
        mongodb_service: MongoDBService,
    ):
        self.settings = settings
        self.queue_service = queue_service
        self.replicate_service = replicate_service
        self.blob_service = blob_service
        self.mongodb_service = mongodb_service

        # Repositories
        self.generation_repo = GenerationRepository(mongodb_service)
        self.user_repo = UserRepository(mongodb_service)

        # Metrics
        self.metrics = WorkerMetrics()

        # Control flags
        self.running = False
        self.max_retries = 3

    async def start(self, max_concurrent_jobs: int = 5):
        """
        Start the worker and begin processing jobs.

        Args:
            max_concurrent_jobs: Maximum number of concurrent jobs to process
        """
        self.running = True
        logger.info(
            f"Worker starting with max_concurrent_jobs={max_concurrent_jobs}"
        )

        # Create semaphore for concurrency control
        semaphore = asyncio.Semaphore(max_concurrent_jobs)

        # Start worker loop
        await self._worker_loop(semaphore)

    async def stop(self):
        """Stop the worker gracefully."""
        logger.info("Worker stopping...")
        self.running = False

    async def _worker_loop(self, semaphore: asyncio.Semaphore):
        """
        Main worker loop that processes messages from queue.

        Args:
            semaphore: Semaphore for controlling concurrency
        """
        while self.running:
            try:
                # Receive messages with callback processing
                await self.queue_service.receive_messages(
                    max_messages=1,
                    max_wait_time=60,
                    processor_callback=lambda job, msg: self._process_with_semaphore(
                        job, msg, semaphore
                    ),
                )

            except KeyboardInterrupt:
                logger.info("Received shutdown signal")
                break
            except Exception as e:
                logger.error(f"Error in worker loop: {e}")
                await asyncio.sleep(5)  # Wait before retry

        logger.info("Worker stopped")

    async def _process_with_semaphore(
        self,
        job_message: GenerationJobMessage,
        message: Any,
        semaphore: asyncio.Semaphore,
    ) -> bool:
        """
        Process job with semaphore for concurrency control.

        Args:
            job_message: Parsed job message
            message: Raw Service Bus message
            semaphore: Semaphore for concurrency control

        Returns:
            bool: True if processing succeeded
        """
        async with semaphore:
            return await self.process_generation_job(job_message, message)

    async def process_generation_job(
        self, job_message: GenerationJobMessage, raw_message: Any
    ) -> bool:
        """
        Process a single image generation job.

        Args:
            job_message: Parsed generation job message
            raw_message: Raw Service Bus message for completion/abandonment

        Returns:
            bool: True if job completed successfully
        """
        start_time = datetime.utcnow()
        generation_id = job_message.generation_id
        user_id = job_message.user_id

        logger.info(
            f"Processing job: generation_id={generation_id}, "
            f"attempt={job_message.attempt}"
        )

        try:
            # Step 1: Update status to processing
            await self._update_status(
                generation_id,
                DBGenerationStatus.PROCESSING,
                {"started_at": datetime.utcnow()},
            )

            # Step 2: Call Replicate API
            prediction_result = await self._call_replicate_api(job_message)

            if prediction_result["status"] != GenerationStatus.SUCCEEDED:
                raise Exception(
                    f"Generation failed: {prediction_result.get('error', 'Unknown error')}"
                )

            # Step 3: Download generated images
            output_urls = prediction_result["output"]
            if not output_urls:
                raise Exception("No output images generated")

            images = await self.replicate_service.download_all_outputs(output_urls)

            if not images:
                raise Exception("Failed to download generated images")

            # Step 4: Upload to Blob Storage
            blob_urls = await self._upload_images(
                generation_id, user_id, images, job_message
            )

            # Step 5: Update database with results
            await self._update_completion(
                generation_id,
                blob_urls,
                prediction_result.get("metrics", {}),
            )

            # Step 6: Send webhook notification if configured
            if job_message.callback_url:
                await self._send_webhook_notification(
                    job_message.callback_url,
                    generation_id,
                    DBGenerationStatus.COMPLETED,
                    blob_urls,
                )

            # Record success metrics
            processing_time = (datetime.utcnow() - start_time).total_seconds()
            self.metrics.record_success(processing_time)

            logger.info(
                f"Job completed successfully: generation_id={generation_id}, "
                f"processing_time={processing_time:.2f}s"
            )

            return True

        except Exception as e:
            # Handle failure
            processing_time = (datetime.utcnow() - start_time).total_seconds()
            success = await self._handle_job_failure(
                job_message, raw_message, e, processing_time
            )

            self.metrics.record_failure(processing_time)
            return success

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
    )
    async def _call_replicate_api(
        self, job_message: GenerationJobMessage
    ) -> Dict[str, Any]:
        """
        Call Replicate API to generate image.

        Args:
            job_message: Generation job message

        Returns:
            Dictionary with prediction result
        """
        try:
            logger.info(
                f"Calling Replicate API: model={job_message.model}, "
                f"prompt_length={len(job_message.prompt)}"
            )

            # Generate and wait for completion
            result = await self.replicate_service.generate_and_wait(
                prompt=job_message.prompt,
                model=job_message.model,
                settings=job_message.settings,
                max_wait_time=300,  # 5 minutes max
            )

            return result

        except Exception as e:
            logger.error(f"Replicate API error: {e}")
            raise

    async def _upload_images(
        self,
        generation_id: str,
        user_id: str,
        images: List[tuple],
        job_message: GenerationJobMessage,
    ) -> List[Dict[str, str]]:
        """
        Upload generated images to Blob Storage.

        Args:
            generation_id: Generation ID
            user_id: User ID
            images: List of (image_bytes, content_type) tuples
            job_message: Original job message

        Returns:
            List of dictionaries with image URLs and metadata
        """
        blob_urls = []

        for idx, (image_bytes, content_type) in enumerate(images):
            try:
                # Generate filename
                extension = content_type.split("/")[-1]
                filename = f"output_{idx}.{extension}"

                logger.info(
                    f"Uploading image to blob storage: "
                    f"generation_id={generation_id}, filename={filename}"
                )

                # Upload with optimization
                result = await self.blob_service.upload_image(
                    user_id=user_id,
                    generation_id=generation_id,
                    filename=filename,
                    image_data=image_bytes,
                    optimize=True,
                    content_type=content_type,
                )

                # Generate SAS URLs for access
                blob_url = await self.blob_service.generate_sas_url(
                    result["blob_path"], expiry_hours=168  # 7 days
                )

                thumbnail_url = (
                    await self.blob_service.generate_sas_url(
                        result["thumbnail_path"], expiry_hours=168
                    )
                    if result.get("thumbnail_path")
                    else None
                )

                # Get CDN URLs if available
                cdn_url = self.blob_service.get_cdn_url(result["blob_path"])
                cdn_thumbnail_url = (
                    self.blob_service.get_cdn_url(result["thumbnail_path"])
                    if result.get("thumbnail_path")
                    else None
                )

                blob_urls.append(
                    {
                        "blob_url": blob_url,
                        "thumbnail_url": thumbnail_url,
                        "cdn_url": cdn_url,
                        "cdn_thumbnail_url": cdn_thumbnail_url,
                        "blob_path": result["blob_path"],
                        "file_size": result["file_size"],
                        "dimensions": result.get("dimensions"),
                    }
                )

            except Exception as e:
                logger.error(f"Error uploading image {idx}: {e}")
                # Continue with other images

        if not blob_urls:
            raise Exception("Failed to upload any images to blob storage")

        return blob_urls

    async def _update_status(
        self,
        generation_id: str,
        status: str,
        additional_data: Optional[Dict[str, Any]] = None,
    ):
        """
        Update generation status in database.

        Args:
            generation_id: Generation ID
            status: New status
            additional_data: Additional fields to update
        """
        try:
            update_data = {"status": status, "updated_at": datetime.utcnow()}

            if additional_data:
                update_data.update(additional_data)

            await self.generation_repo.update_by_id(generation_id, update_data)

            logger.debug(f"Status updated: generation_id={generation_id}, status={status}")

        except Exception as e:
            logger.error(f"Error updating status: {e}")

    async def _update_completion(
        self,
        generation_id: str,
        blob_urls: List[Dict[str, str]],
        metrics: Dict[str, Any],
    ):
        """
        Update generation with completion data.

        Args:
            generation_id: Generation ID
            blob_urls: List of blob URLs and metadata
            metrics: Replicate API metrics
        """
        try:
            # Extract primary URLs
            primary_result = blob_urls[0] if blob_urls else {}

            update_data = {
                "status": DBGenerationStatus.COMPLETED,
                "image_url": primary_result.get("blob_url"),
                "thumbnail_url": primary_result.get("thumbnail_url"),
                "cdn_url": primary_result.get("cdn_url"),
                "cdn_thumbnail_url": primary_result.get("cdn_thumbnail_url"),
                "blob_path": primary_result.get("blob_path"),
                "file_size": primary_result.get("file_size"),
                "dimensions": primary_result.get("dimensions"),
                "all_outputs": blob_urls,  # Store all generated images
                "completed_at": datetime.utcnow(),
                "processing_time_ms": metrics.get("predict_time", 0) * 1000
                if metrics.get("predict_time")
                else None,
                "metadata": {
                    "replicate_metrics": metrics,
                    "total_outputs": len(blob_urls),
                },
            }

            await self.generation_repo.update_by_id(generation_id, update_data)

            logger.info(f"Generation completed: generation_id={generation_id}")

        except Exception as e:
            logger.error(f"Error updating completion data: {e}")
            raise

    async def _handle_job_failure(
        self,
        job_message: GenerationJobMessage,
        raw_message: Any,
        error: Exception,
        processing_time: float,
    ) -> bool:
        """
        Handle job failure with retry logic.

        Args:
            job_message: Generation job message
            raw_message: Raw Service Bus message
            error: Exception that occurred
            processing_time: Time spent processing

        Returns:
            bool: True if should complete message, False if should abandon
        """
        generation_id = job_message.generation_id
        attempt = job_message.attempt

        logger.error(
            f"Job failed: generation_id={generation_id}, "
            f"attempt={attempt}, error={str(error)}"
        )

        # Log full traceback
        logger.error(f"Traceback: {traceback.format_exc()}")

        # Update database with error
        try:
            await self._update_status(
                generation_id,
                DBGenerationStatus.FAILED,
                {
                    "error_message": str(error),
                    "failed_at": datetime.utcnow(),
                    "attempts": attempt,
                },
            )
        except Exception as e:
            logger.error(f"Error updating failure status: {e}")

        # Check if should retry
        if attempt < self.max_retries:
            logger.info(
                f"Job will be retried: generation_id={generation_id}, "
                f"next_attempt={attempt + 1}"
            )
            # Abandon message to retry (Service Bus will re-deliver)
            return False  # Don't complete - will retry
        else:
            logger.warning(
                f"Max retries reached: generation_id={generation_id}, "
                f"moving to DLQ"
            )
            # Max retries reached - message will go to dead-letter queue
            return False  # Service Bus will handle DLQ

    async def _send_webhook_notification(
        self,
        callback_url: str,
        generation_id: str,
        status: str,
        blob_urls: Optional[List[Dict[str, str]]] = None,
    ):
        """
        Send webhook notification to callback URL.

        Args:
            callback_url: Webhook URL
            generation_id: Generation ID
            status: Generation status
            blob_urls: List of blob URLs (if completed)
        """
        try:
            import httpx

            payload = {
                "generation_id": generation_id,
                "status": status,
                "timestamp": datetime.utcnow().isoformat(),
            }

            if blob_urls:
                payload["results"] = blob_urls

            async with httpx.AsyncClient() as client:
                response = await client.post(
                    callback_url,
                    json=payload,
                    timeout=10.0,
                )
                response.raise_for_status()

            logger.info(f"Webhook notification sent: {callback_url}")

        except Exception as e:
            logger.error(f"Error sending webhook notification: {e}")
            # Don't fail job if webhook fails

    async def get_metrics(self) -> Dict[str, Any]:
        """Get current worker metrics."""
        return self.metrics.get_metrics()

    async def health_check(self) -> Dict[str, bool]:
        """
        Check health of all dependencies.

        Returns:
            Dictionary with health status of each service
        """
        return {
            "mongodb": await self.mongodb_service.health_check(),
            "replicate": await self.replicate_service.health_check(),
            "blob_storage": await self.blob_service.health_check(),
            "service_bus": await self.queue_service.health_check(),
        }
