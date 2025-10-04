"""Usage log repository for analytics and rate limiting."""
import logging
from typing import List
from datetime import datetime, timedelta
from motor.motor_asyncio import AsyncIOMotorCollection
from app.repositories.base_repository import BaseRepository
from app.models.usage_log import UsageLog, UsageLogCreate, ActionType, UsageStats

logger = logging.getLogger(__name__)


class UsageLogRepository(BaseRepository[UsageLog]):
    """Repository for usage log operations."""

    def __init__(self, collection: AsyncIOMotorCollection):
        """Initialize usage log repository.

        Args:
            collection: MongoDB usage_logs collection
        """
        super().__init__(collection, UsageLog)

    async def create_log(self, log_create: UsageLogCreate, credits_used: int = 0) -> UsageLog:
        """Create a new usage log entry.

        Args:
            log_create: Log creation data
            credits_used: Credits consumed by this action

        Returns:
            Created usage log
        """
        log_dict = log_create.model_dump()

        # Generate unique ID
        from uuid import uuid4
        log_dict["id"] = f"log_{uuid4().hex[:12]}"

        # Set credits
        log_dict["credits_used"] = credits_used

        # Set expiration (90 days from now)
        log_dict["expires_at"] = datetime.utcnow() + timedelta(days=90)

        return await self.create(log_dict)

    async def get_user_logs(
        self,
        user_id: str,
        action_type: Optional[ActionType] = None,
        skip: int = 0,
        limit: int = 100
    ) -> List[UsageLog]:
        """Get usage logs for a user.

        Args:
            user_id: User ID
            action_type: Optional action type filter
            skip: Number of logs to skip
            limit: Maximum number of logs to return

        Returns:
            List of usage logs
        """
        filter_dict = {"user_id": user_id}

        if action_type:
            filter_dict["action_type"] = action_type.value

        return await self.find_many(
            filter_dict=filter_dict,
            skip=skip,
            limit=limit,
            sort=[("created_at", -1)]
        )

    async def get_user_stats(
        self,
        user_id: str,
        start_date: datetime,
        end_date: datetime
    ) -> UsageStats:
        """Get usage statistics for a user in a date range.

        Args:
            user_id: User ID
            start_date: Start of date range
            end_date: End of date range

        Returns:
            Usage statistics
        """
        pipeline = [
            {
                "$match": {
                    "user_id": user_id,
                    "created_at": {"$gte": start_date, "$lte": end_date}
                }
            },
            {
                "$group": {
                    "_id": None,
                    "total_actions": {"$sum": 1},
                    "image_generations": {
                        "$sum": {"$cond": [{"$eq": ["$action_type", "image_generation"]}, 1, 0]}
                    },
                    "api_requests": {
                        "$sum": {"$cond": [{"$eq": ["$action_type", "api_request"]}, 1, 0]}
                    },
                    "file_uploads": {
                        "$sum": {"$cond": [{"$eq": ["$action_type", "file_upload"]}, 1, 0]}
                    },
                    "file_downloads": {
                        "$sum": {"$cond": [{"$eq": ["$action_type", "file_download"]}, 1, 0]}
                    },
                    "total_credits_used": {"$sum": "$credits_used"},
                    "total_processing_time_ms": {
                        "$sum": {"$ifNull": ["$response_time_ms", 0]}
                    }
                }
            },
            {
                "$addFields": {
                    "average_response_time_ms": {
                        "$cond": [
                            {"$gt": ["$total_actions", 0]},
                            {"$divide": ["$total_processing_time_ms", "$total_actions"]},
                            0
                        ]
                    }
                }
            }
        ]

        results = await self.aggregate(pipeline)

        if not results:
            return UsageStats(
                user_id=user_id,
                period_start=start_date,
                period_end=end_date,
                total_actions=0,
                image_generations=0,
                api_requests=0,
                file_uploads=0,
                file_downloads=0,
                total_credits_used=0,
                remaining_credits=0,
                average_response_time_ms=0.0,
                total_processing_time_ms=0
            )

        stats = results[0]

        return UsageStats(
            user_id=user_id,
            period_start=start_date,
            period_end=end_date,
            total_actions=stats.get("total_actions", 0),
            image_generations=stats.get("image_generations", 0),
            api_requests=stats.get("api_requests", 0),
            file_uploads=stats.get("file_uploads", 0),
            file_downloads=stats.get("file_downloads", 0),
            total_credits_used=stats.get("total_credits_used", 0),
            remaining_credits=0,  # Should be fetched from user record
            average_response_time_ms=stats.get("average_response_time_ms", 0.0),
            total_processing_time_ms=stats.get("total_processing_time_ms", 0)
        )

    async def count_actions_in_window(
        self,
        user_id: str,
        action_type: ActionType,
        minutes: int = 60
    ) -> int:
        """Count actions in a time window (for rate limiting).

        Args:
            user_id: User ID
            action_type: Action type to count
            minutes: Time window in minutes

        Returns:
            Number of actions in the window
        """
        window_start = datetime.utcnow() - timedelta(minutes=minutes)

        return await self.count({
            "user_id": user_id,
            "action_type": action_type.value,
            "created_at": {"$gte": window_start}
        })

    async def get_daily_stats(self, days: int = 7) -> List[dict]:
        """Get daily statistics for the last N days.

        Args:
            days: Number of days to include

        Returns:
            List of daily statistics
        """
        start_date = datetime.utcnow() - timedelta(days=days)

        pipeline = [
            {"$match": {"created_at": {"$gte": start_date}}},
            {
                "$group": {
                    "_id": {
                        "$dateToString": {
                            "format": "%Y-%m-%d",
                            "date": "$created_at"
                        }
                    },
                    "total_actions": {"$sum": 1},
                    "unique_users": {"$addToSet": "$user_id"},
                    "total_credits_used": {"$sum": "$credits_used"}
                }
            },
            {
                "$project": {
                    "date": "$_id",
                    "total_actions": 1,
                    "unique_users": {"$size": "$unique_users"},
                    "total_credits_used": 1
                }
            },
            {"$sort": {"date": 1}}
        ]

        return await self.aggregate(pipeline)

    async def get_popular_actions(self, days: int = 30, limit: int = 10) -> List[dict]:
        """Get most popular actions in the last N days.

        Args:
            days: Number of days to include
            limit: Maximum number of results

        Returns:
            List of popular actions with counts
        """
        start_date = datetime.utcnow() - timedelta(days=days)

        pipeline = [
            {"$match": {"created_at": {"$gte": start_date}}},
            {
                "$group": {
                    "_id": "$action_type",
                    "count": {"$sum": 1},
                    "unique_users": {"$addToSet": "$user_id"}
                }
            },
            {
                "$project": {
                    "action_type": "$_id",
                    "count": 1,
                    "unique_users": {"$size": "$unique_users"}
                }
            },
            {"$sort": {"count": -1}},
            {"$limit": limit}
        ]

        return await self.aggregate(pipeline)


class RateLimitRepository:
    """Repository for rate limit tracking."""

    def __init__(self, collection: AsyncIOMotorCollection):
        """Initialize rate limit repository.

        Args:
            collection: MongoDB rate_limit_logs collection
        """
        self.collection = collection

    async def check_rate_limit(
        self,
        user_id: str,
        endpoint: str,
        max_requests: int,
        window_minutes: int
    ) -> tuple[bool, int]:
        """Check if user has exceeded rate limit.

        Args:
            user_id: User ID
            endpoint: API endpoint
            max_requests: Maximum requests allowed
            window_minutes: Time window in minutes

        Returns:
            Tuple of (is_allowed, current_count)
        """
        window_start = datetime.utcnow()
        window_end = window_start + timedelta(minutes=window_minutes)

        # Find or create rate limit log
        log = await self.collection.find_one({
            "user_id": user_id,
            "endpoint": endpoint,
            "window_end": {"$gt": datetime.utcnow()}
        })

        if not log:
            # Create new rate limit log
            from uuid import uuid4
            await self.collection.insert_one({
                "id": f"rate_{uuid4().hex[:12]}",
                "user_id": user_id,
                "endpoint": endpoint,
                "request_count": 1,
                "window_start": window_start,
                "window_end": window_end,
                "last_request_at": datetime.utcnow(),
                "is_blocked": False,
                "expires_at": window_end + timedelta(hours=1),
                "created_at": datetime.utcnow()
            })
            return True, 1

        current_count = log["request_count"]

        if current_count >= max_requests:
            return False, current_count

        # Increment counter
        await self.collection.update_one(
            {"id": log["id"]},
            {
                "$inc": {"request_count": 1},
                "$set": {"last_request_at": datetime.utcnow()}
            }
        )

        return True, current_count + 1

    async def reset_rate_limit(self, user_id: str, endpoint: str) -> None:
        """Reset rate limit for a user and endpoint.

        Args:
            user_id: User ID
            endpoint: API endpoint
        """
        await self.collection.delete_many({
            "user_id": user_id,
            "endpoint": endpoint
        })
