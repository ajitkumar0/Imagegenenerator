"""Subscription repository for database operations."""
import logging
from typing import Optional, List
from datetime import datetime, timedelta
from motor.motor_asyncio import AsyncIOMotorCollection
from app.repositories.base_repository import BaseRepository
from app.models.subscription import Subscription, SubscriptionCreate, SubscriptionStatus

logger = logging.getLogger(__name__)


class SubscriptionRepository(BaseRepository[Subscription]):
    """Repository for subscription operations."""

    def __init__(self, collection: AsyncIOMotorCollection):
        """Initialize subscription repository.

        Args:
            collection: MongoDB subscriptions collection
        """
        super().__init__(collection, Subscription)

    async def create_subscription(self, subscription_create: SubscriptionCreate) -> Subscription:
        """Create a new subscription.

        Args:
            subscription_create: Subscription creation data

        Returns:
            Created subscription
        """
        subscription_dict = subscription_create.model_dump()

        # Generate unique ID
        from uuid import uuid4
        subscription_dict["id"] = f"sub_{uuid4().hex[:12]}"

        # Set defaults
        subscription_dict.setdefault("credits_used_this_period", 0)
        subscription_dict.setdefault("cancel_at_period_end", False)

        return await self.create(subscription_dict)

    async def find_by_user(self, user_id: str) -> Optional[Subscription]:
        """Find subscription by user ID.

        Args:
            user_id: User ID

        Returns:
            Subscription or None if not found
        """
        return await self.find_one({"user_id": user_id})

    async def find_by_stripe_subscription_id(
        self,
        stripe_subscription_id: str
    ) -> Optional[Subscription]:
        """Find subscription by Stripe subscription ID.

        Args:
            stripe_subscription_id: Stripe subscription ID

        Returns:
            Subscription or None if not found
        """
        return await self.find_one({"stripe_subscription_id": stripe_subscription_id})

    async def find_by_stripe_customer_id(
        self,
        stripe_customer_id: str
    ) -> Optional[Subscription]:
        """Find subscription by Stripe customer ID.

        Args:
            stripe_customer_id: Stripe customer ID

        Returns:
            Subscription or None if not found
        """
        return await self.find_one({"stripe_customer_id": stripe_customer_id})

    async def update_status(
        self,
        subscription_id: str,
        status: SubscriptionStatus
    ) -> Optional[Subscription]:
        """Update subscription status.

        Args:
            subscription_id: Subscription ID
            status: New status

        Returns:
            Updated subscription or None if not found
        """
        update_dict = {"status": status.value}

        if status == SubscriptionStatus.CANCELLED:
            update_dict["cancelled_at"] = datetime.utcnow()

        return await self.update_by_id(subscription_id, update_dict)

    async def use_credits(self, subscription_id: str, credits: int) -> Optional[Subscription]:
        """Use credits from subscription.

        Args:
            subscription_id: Subscription ID
            credits: Number of credits to use

        Returns:
            Updated subscription or None if not found
        """
        result = await self.collection.find_one_and_update(
            {"id": subscription_id},
            {
                "$inc": {"credits_used_this_period": credits},
                "$set": {"updated_at": datetime.utcnow()}
            },
            return_document=True
        )

        if not result:
            return None

        if "_id" in result:
            result["id"] = str(result["_id"])
            del result["_id"]

        return self.model_class(**result)

    async def reset_period_usage(self, subscription_id: str) -> Optional[Subscription]:
        """Reset period usage (called at billing cycle renewal).

        Args:
            subscription_id: Subscription ID

        Returns:
            Updated subscription or None if not found
        """
        return await self.update_by_id(subscription_id, {
            "credits_used_this_period": 0,
            "current_period_start": datetime.utcnow()
        })

    async def update_billing_period(
        self,
        subscription_id: str,
        period_start: datetime,
        period_end: datetime
    ) -> Optional[Subscription]:
        """Update billing period.

        Args:
            subscription_id: Subscription ID
            period_start: Period start date
            period_end: Period end date

        Returns:
            Updated subscription or None if not found
        """
        return await self.update_by_id(subscription_id, {
            "current_period_start": period_start,
            "current_period_end": period_end,
            "credits_used_this_period": 0  # Reset usage for new period
        })

    async def set_cancel_at_period_end(
        self,
        subscription_id: str,
        cancel: bool
    ) -> Optional[Subscription]:
        """Set whether to cancel at period end.

        Args:
            subscription_id: Subscription ID
            cancel: Whether to cancel

        Returns:
            Updated subscription or None if not found
        """
        return await self.update_by_id(subscription_id, {
            "cancel_at_period_end": cancel
        })

    async def get_expiring_subscriptions(self, days: int = 7) -> List[Subscription]:
        """Get subscriptions expiring within specified days.

        Args:
            days: Number of days ahead to check

        Returns:
            List of expiring subscriptions
        """
        end_date = datetime.utcnow() + timedelta(days=days)

        return await self.find_many(
            filter_dict={
                "status": SubscriptionStatus.ACTIVE.value,
                "current_period_end": {"$lte": end_date}
            },
            skip=0,
            limit=1000
        )

    async def get_active_subscriptions(
        self,
        skip: int = 0,
        limit: int = 100
    ) -> List[Subscription]:
        """Get all active subscriptions.

        Args:
            skip: Number of subscriptions to skip
            limit: Maximum number of subscriptions to return

        Returns:
            List of active subscriptions
        """
        return await self.find_many(
            filter_dict={"status": SubscriptionStatus.ACTIVE.value},
            skip=skip,
            limit=limit,
            sort=[("created_at", -1)]
        )

    async def get_cancelled_subscriptions(
        self,
        skip: int = 0,
        limit: int = 100
    ) -> List[Subscription]:
        """Get all cancelled subscriptions.

        Args:
            skip: Number of subscriptions to skip
            limit: Maximum number of subscriptions to return

        Returns:
            List of cancelled subscriptions
        """
        return await self.find_many(
            filter_dict={"status": SubscriptionStatus.CANCELLED.value},
            skip=skip,
            limit=limit,
            sort=[("cancelled_at", -1)]
        )

    async def count_by_plan(self, plan: str) -> int:
        """Count subscriptions by plan.

        Args:
            plan: Plan name

        Returns:
            Number of subscriptions
        """
        return await self.count({
            "plan": plan,
            "status": SubscriptionStatus.ACTIVE.value
        })

    async def get_subscriptions_to_renew(self) -> List[Subscription]:
        """Get subscriptions that need to be renewed today.

        Returns:
            List of subscriptions to renew
        """
        today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        tomorrow = today + timedelta(days=1)

        return await self.find_many(
            filter_dict={
                "status": SubscriptionStatus.ACTIVE.value,
                "current_period_end": {
                    "$gte": today,
                    "$lt": tomorrow
                }
            },
            skip=0,
            limit=1000
        )
