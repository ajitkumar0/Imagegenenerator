"""
Background Worker Entry Point

Standalone worker process for processing image generation jobs
from Azure Service Bus queue.

Usage:
    python worker.py

Environment Variables:
    See .env file for configuration
"""

import asyncio
import logging
import signal
import sys
from contextlib import asynccontextmanager

from app.config import Settings
from app.services.queue_service import AzureServiceBusService
from app.services.replicate_service import ReplicateService
from app.services.azure_blob_service import AzureBlobService
from app.services.mongodb_service import MongoDBService
from app.services.worker_service import BackgroundWorker
from app.core.azure_clients import AzureClients

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)

logger = logging.getLogger(__name__)


class WorkerApplication:
    """Worker application with lifecycle management."""

    def __init__(self):
        self.settings = Settings()
        self.worker: BackgroundWorker = None
        self.services = {}
        self.shutdown_event = asyncio.Event()

    async def initialize_services(self):
        """Initialize all services."""
        logger.info("Initializing services...")

        try:
            # Azure clients
            azure_clients = AzureClients(self.settings)

            # MongoDB service
            logger.info("Connecting to MongoDB...")
            mongodb_service = MongoDBService(self.settings, azure_clients)
            connection_string = (
                await azure_clients.get_mongodb_connection_string_from_keyvault()
            )
            await mongodb_service.connect(connection_string)
            self.services["mongodb"] = mongodb_service

            # Service Bus service
            logger.info("Initializing Service Bus...")
            queue_service = AzureServiceBusService(self.settings)
            self.services["queue"] = queue_service

            # Replicate service
            logger.info("Initializing Replicate API...")
            replicate_service = ReplicateService(self.settings)
            self.services["replicate"] = replicate_service

            # Blob storage service
            logger.info("Initializing Blob Storage...")
            blob_service = AzureBlobService(self.settings, azure_clients.credential)
            self.services["blob"] = blob_service

            # Background worker
            logger.info("Creating background worker...")
            self.worker = BackgroundWorker(
                settings=self.settings,
                queue_service=queue_service,
                replicate_service=replicate_service,
                blob_service=blob_service,
                mongodb_service=mongodb_service,
            )

            logger.info("All services initialized successfully")

        except Exception as e:
            logger.error(f"Failed to initialize services: {e}")
            raise

    async def health_check(self) -> bool:
        """Check health of all services."""
        logger.info("Running health check...")

        try:
            health = await self.worker.health_check()

            all_healthy = all(health.values())

            if all_healthy:
                logger.info("Health check passed: All services healthy")
            else:
                logger.warning(f"Health check failed: {health}")

            return all_healthy

        except Exception as e:
            logger.error(f"Health check error: {e}")
            return False

    async def start(self):
        """Start the worker."""
        logger.info("=" * 60)
        logger.info("Image Generation Worker Starting")
        logger.info("=" * 60)

        # Initialize services
        await self.initialize_services()

        # Run health check
        healthy = await self.health_check()
        if not healthy:
            logger.error("Health check failed. Exiting...")
            sys.exit(1)

        # Register signal handlers
        self._register_signal_handlers()

        # Start worker
        logger.info("Starting worker processing...")
        max_concurrent_jobs = self.settings.worker_max_concurrent_jobs

        try:
            # Start worker in background
            worker_task = asyncio.create_task(
                self.worker.start(max_concurrent_jobs=max_concurrent_jobs)
            )

            # Start metrics reporting task
            metrics_task = asyncio.create_task(self._report_metrics())

            # Wait for shutdown signal
            await self.shutdown_event.wait()

            # Cancel tasks
            worker_task.cancel()
            metrics_task.cancel()

            # Wait for graceful shutdown
            await asyncio.gather(worker_task, metrics_task, return_exceptions=True)

        except KeyboardInterrupt:
            logger.info("Received keyboard interrupt")
        except Exception as e:
            logger.error(f"Worker error: {e}")
        finally:
            await self.shutdown()

    async def shutdown(self):
        """Shutdown worker and cleanup resources."""
        logger.info("Shutting down worker...")

        try:
            # Stop worker
            if self.worker:
                await self.worker.stop()

            # Close services
            if "mongodb" in self.services:
                await self.services["mongodb"].close()

            if "queue" in self.services:
                await self.services["queue"].close()

            if "replicate" in self.services:
                await self.services["replicate"].close()

            logger.info("Worker shutdown complete")

        except Exception as e:
            logger.error(f"Error during shutdown: {e}")

    async def _report_metrics(self):
        """Periodically report worker metrics."""
        while True:
            try:
                await asyncio.sleep(60)  # Report every minute

                metrics = await self.worker.get_metrics()

                logger.info("=" * 60)
                logger.info("Worker Metrics:")
                logger.info(f"  Uptime: {metrics['uptime_seconds']:.0f}s")
                logger.info(f"  Jobs Processed: {metrics['jobs_processed']}")
                logger.info(f"  Jobs Succeeded: {metrics['jobs_succeeded']}")
                logger.info(f"  Jobs Failed: {metrics['jobs_failed']}")
                logger.info(f"  Success Rate: {metrics['success_rate']:.2%}")
                logger.info(
                    f"  Avg Processing Time: {metrics['avg_processing_time']:.2f}s"
                )
                logger.info("=" * 60)

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error reporting metrics: {e}")

    def _register_signal_handlers(self):
        """Register signal handlers for graceful shutdown."""

        def signal_handler(signum, frame):
            logger.info(f"Received signal {signum}")
            self.shutdown_event.set()

        signal.signal(signal.SIGINT, signal_handler)
        signal.signal(signal.SIGTERM, signal_handler)


async def main():
    """Main entry point."""
    app = WorkerApplication()
    await app.start()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Worker interrupted by user")
    except Exception as e:
        logger.error(f"Worker failed: {e}")
        sys.exit(1)
