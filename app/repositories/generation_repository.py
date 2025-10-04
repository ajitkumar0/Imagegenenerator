"""Generation repository for database operations."""
import logging
from typing import Optional, List
from datetime import datetime, timedelta
from motor.motor_asyncio import AsyncIOMotorCollection
from app.repositories.base_repository import BaseRepository
from app.models.generation import Generation, GenerationCreate, GenerationStatus, GenerationStats

logger = logging.getLogger(__name__)


class GenerationRepository(BaseRepository[Generation]):
    """Repository for image generation operations."""

    def __init__(self, collection: AsyncIOMotorCollection):
        """Initialize generation repository.

        Args:
            collection: MongoDB generations collection
        """
        super().__init__(collection, Generation)

    async def create_generation(self, generation_create: GenerationCreate) -> Generation:
        """Create a new generation.

        Args:
            generation_create: Generation creation data

        Returns:
            Created generation
        """
        generation_dict = generation_create.model_dump()

        # Generate unique ID
        from uuid import uuid4
        generation_dict["id"] = f"gen_{uuid4().hex[:12]}"

        # Set defaults
        generation_dict.setdefault("status", GenerationStatus.PENDING.value)
        generation_dict.setdefault("result_urls", [])
        generation_dict.setdefault("blob_urls", [])

        return await self.create(generation_dict)

    async def find_by_user(
        self,
        user_id: str,
        skip: int = 0,
        limit: int = 50
    ) -> List[Generation]:
        """Find generations by user ID.

        Args:
            user_id: User ID
            skip: Number of generations to skip
            limit: Maximum number of generations to return

        Returns:
            List of generations
        """
        return await self.find_many(
            filter_dict={"user_id": user_id},
            skip=skip,
            limit=limit,
            sort=[("created_at", -1)]
        )

    async def find_by_status(
        self,
        status: GenerationStatus,
        skip: int = 0,
        limit: int = 100
    ) -> List[Generation]:
        """Find generations by status.

        Args:
            status: Generation status
            skip: Number of generations to skip
            limit: Maximum number of generations to return

        Returns:
            List of generations with specified status
        """
        return await self.find_many(
            filter_dict={"status": status.value},
            skip=skip,
            limit=limit,
            sort=[("created_at", 1)]  # Oldest first for processing
        )

    async def find_by_replicate_id(self, replicate_prediction_id: str) -> Optional[Generation]:
        """Find generation by Replicate prediction ID.

        Args:
            replicate_prediction_id: Replicate prediction ID

        Returns:
            Generation or None if not found
        """
        return await self.find_one({"replicate_prediction_id": replicate_prediction_id})

    async def update_status(
        self,
        generation_id: str,
        status: GenerationStatus,
        **kwargs
    ) -> Optional[Generation]:
        """Update generation status.

        Args:
            generation_id: Generation ID
            status: New status
            **kwargs: Additional fields to update

        Returns:
            Updated generation or None if not found
        """
        update_dict = {"status": status.value}
        update_dict.update(kwargs)

        # Set timestamp based on status
        if status == GenerationStatus.PROCESSING:
            update_dict["started_at"] = datetime.utcnow()
        elif status in [GenerationStatus.COMPLETED, GenerationStatus.FAILED]:
            update_dict["completed_at"] = datetime.utcnow()

            # Calculate processing time if started_at exists
            if "started_at" not in update_dict:
                existing = await self.find_by_id(generation_id)
                if existing and existing.started_at:
                    processing_time = datetime.utcnow() - existing.started_at
                    update_dict["processing_time_ms"] = int(processing_time.total_seconds() * 1000)

        return await self.update_by_id(generation_id, update_dict)

    async def mark_as_processing(
        self,
        generation_id: str,
        replicate_prediction_id: str
    ) -> Optional[Generation]:
        """Mark generation as processing.

        Args:
            generation_id: Generation ID
            replicate_prediction_id: Replicate prediction ID

        Returns:
            Updated generation or None if not found
        """
        return await self.update_status(
            generation_id,
            GenerationStatus.PROCESSING,
            replicate_prediction_id=replicate_prediction_id
        )

    async def mark_as_completed(
        self,
        generation_id: str,
        result_urls: List[str],
        blob_urls: List[str],
        processing_time_ms: Optional[int] = None
    ) -> Optional[Generation]:
        """Mark generation as completed.

        Args:
            generation_id: Generation ID
            result_urls: Result URLs from Replicate
            blob_urls: Blob storage URLs
            processing_time_ms: Processing time in milliseconds

        Returns:
            Updated generation or None if not found
        """
        update_kwargs = {
            "result_urls": result_urls,
            "blob_urls": blob_urls
        }

        if processing_time_ms:
            update_kwargs["processing_time_ms"] = processing_time_ms

        return await self.update_status(
            generation_id,
            GenerationStatus.COMPLETED,
            **update_kwargs
        )

    async def mark_as_failed(
        self,
        generation_id: str,
        error_message: str
    ) -> Optional[Generation]:
        """Mark generation as failed.

        Args:
            generation_id: Generation ID
            error_message: Error message

        Returns:
            Updated generation or None if not found
        """
        return await self.update_status(
            generation_id,
            GenerationStatus.FAILED,
            error_message=error_message
        )

    async def get_user_stats(self, user_id: str) -> GenerationStats:
        """Get generation statistics for a user.

        Args:
            user_id: User ID

        Returns:
            Generation statistics
        """
        pipeline = [
            {"$match": {"user_id": user_id}},
            {
                "$group": {
                    "_id": None,
                    "total_generations": {"$sum": 1},
                    "completed_generations": {
                        "$sum": {"$cond": [{"$eq": ["$status", "completed"]}, 1, 0]}
                    },
                    "failed_generations": {
                        "$sum": {"$cond": [{"$eq": ["$status", "failed"]}, 1, 0]}
                    },
                    "total_processing_time_ms": {
                        "$sum": {"$ifNull": ["$processing_time_ms", 0]}
                    },
                    "total_credits_spent": {
                        "$sum": {"$ifNull": ["$cost_credits", 0]}
                    }
                }
            },
            {
                "$addFields": {
                    "average_processing_time_ms": {
                        "$cond": [
                            {"$gt": ["$completed_generations", 0]},
                            {"$divide": ["$total_processing_time_ms", "$completed_generations"]},
                            0
                        ]
                    }
                }
            }
        ]

        results = await self.aggregate(pipeline)

        if not results:
            return GenerationStats(
                total_generations=0,
                completed_generations=0,
                failed_generations=0,
                total_processing_time_ms=0,
                average_processing_time_ms=0.0,
                most_used_model="",
                total_credits_spent=0
            )

        stats = results[0]

        # Get most used model
        model_pipeline = [
            {"$match": {"user_id": user_id, "status": "completed"}},
            {"$group": {"_id": "$model_type", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
            {"$limit": 1}
        ]

        model_results = await self.aggregate(model_pipeline)
        most_used_model = model_results[0]["_id"] if model_results else ""

        return GenerationStats(
            total_generations=stats.get("total_generations", 0),
            completed_generations=stats.get("completed_generations", 0),
            failed_generations=stats.get("failed_generations", 0),
            total_processing_time_ms=stats.get("total_processing_time_ms", 0),
            average_processing_time_ms=stats.get("average_processing_time_ms", 0.0),
            most_used_model=most_used_model,
            total_credits_spent=stats.get("total_credits_spent", 0)
        )

    async def get_pending_generations(self, limit: int = 10) -> List[Generation]:
        """Get pending generations for processing.

        Args:
            limit: Maximum number of generations to return

        Returns:
            List of pending generations
        """
        return await self.find_many(
            filter_dict={"status": GenerationStatus.PENDING.value},
            skip=0,
            limit=limit,
            sort=[("created_at", 1)]  # Oldest first (FIFO)
        )

    async def get_stuck_generations(self, timeout_minutes: int = 30) -> List[Generation]:
        """Get generations stuck in processing state.

        Args:
            timeout_minutes: Timeout in minutes

        Returns:
            List of stuck generations
        """
        timeout_date = datetime.utcnow() - timedelta(minutes=timeout_minutes)

        return await self.find_many(
            filter_dict={
                "status": GenerationStatus.PROCESSING.value,
                "started_at": {"$lt": timeout_date}
            },
            skip=0,
            limit=100
        )

    async def count_user_generations_today(self, user_id: str) -> int:
        """Count user's generations today.

        Args:
            user_id: User ID

        Returns:
            Number of generations today
        """
        today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)

        return await self.count({
            "user_id": user_id,
            "created_at": {"$gte": today_start}
        })

    async def delete_old_failed_generations(self, days: int = 30) -> int:
        """Delete old failed generations.

        Args:
            days: Number of days to keep

        Returns:
            Number of deleted generations
        """
        cutoff_date = datetime.utcnow() - timedelta(days=days)

        return await self.delete_many({
            "status": GenerationStatus.FAILED.value,
            "created_at": {"$lt": cutoff_date}
        })
