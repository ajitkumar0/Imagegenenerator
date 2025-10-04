"""
Credit Management Service

Handles credit allocation, deduction, and tracking for user subscriptions.
Integrates with payment service for tier-based credit limits.
"""

import logging
from typing import Optional, Dict, Any
from datetime import datetime

from app.services.payment_service import SubscriptionTier, TierConfig
from app.repositories.subscription_repository import SubscriptionRepository
from app.repositories.usage_log_repository import UsageLogRepository

logger = logging.getLogger(__name__)


class InsufficientCreditsError(Exception):
    """Raised when user doesn't have enough credits."""
    pass


class CreditService:
    """
    Service for managing user credits.

    Features:
    - Check available credits
    - Deduct credits for generations
    - Track usage
    - Handle unlimited credits for premium users
    - Reset credits on renewal
    """

    def __init__(
        self,
        subscription_repo: SubscriptionRepository,
        usage_log_repo: UsageLogRepository,
    ):
        self.subscription_repo = subscription_repo
        self.usage_log_repo = usage_log_repo

    async def check_credits(
        self,
        user_id: str,
        credits_required: int,
    ) -> Dict[str, Any]:
        """
        Check if user has enough credits.

        Args:
            user_id: User ID
            credits_required: Credits needed for operation

        Returns:
            Dictionary with credit status:
            {
                "has_credits": bool,
                "credits_remaining": int,
                "is_unlimited": bool,
                "tier": str
            }

        Raises:
            ValueError: If subscription not found
        """
        subscription = await self.subscription_repo.get_by_user_id(user_id)

        if not subscription:
            raise ValueError(f"Subscription not found for user: {user_id}")

        tier_config = TierConfig.get_config(SubscriptionTier(subscription.tier))
        is_unlimited = tier_config["credits_per_month"] == -1

        # Premium users have unlimited credits
        if is_unlimited:
            return {
                "has_credits": True,
                "credits_remaining": -1,
                "is_unlimited": True,
                "tier": subscription.tier,
            }

        # Check if user has enough credits
        has_credits = subscription.credits_remaining >= credits_required

        return {
            "has_credits": has_credits,
            "credits_remaining": subscription.credits_remaining,
            "is_unlimited": False,
            "tier": subscription.tier,
        }

    async def deduct_credits(
        self,
        user_id: str,
        credits: int,
        generation_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Deduct credits from user's account.

        Args:
            user_id: User ID
            credits: Number of credits to deduct
            generation_id: Associated generation ID (optional)
            metadata: Additional metadata to log

        Returns:
            Dictionary with updated credit status

        Raises:
            InsufficientCreditsError: If not enough credits
            ValueError: If subscription not found
        """
        subscription = await self.subscription_repo.get_by_user_id(user_id)

        if not subscription:
            raise ValueError(f"Subscription not found for user: {user_id}")

        tier_config = TierConfig.get_config(SubscriptionTier(subscription.tier))
        is_unlimited = tier_config["credits_per_month"] == -1

        # Skip deduction for unlimited users
        if is_unlimited:
            # Still log usage for analytics
            await self.usage_log_repo.create(
                user_id=user_id,
                generation_id=generation_id,
                credits_used=0,
                action="generation",
                metadata=metadata or {},
            )

            return {
                "success": True,
                "credits_remaining": -1,
                "credits_deducted": 0,
                "is_unlimited": True,
            }

        # Check if enough credits
        if subscription.credits_remaining < credits:
            raise InsufficientCreditsError(
                f"Insufficient credits. Required: {credits}, "
                f"Available: {subscription.credits_remaining}"
            )

        # Deduct credits
        new_remaining = subscription.credits_remaining - credits
        credits_used = subscription.credits_used_this_period + credits

        await self.subscription_repo.update(
            subscription.id,
            {
                "credits_remaining": new_remaining,
                "credits_used_this_period": credits_used,
                "updated_at": datetime.utcnow(),
            },
        )

        # Log usage
        await self.usage_log_repo.create(
            user_id=user_id,
            generation_id=generation_id,
            credits_used=credits,
            action="generation",
            metadata=metadata or {},
        )

        logger.info(
            f"Deducted {credits} credits from user {user_id}. "
            f"Remaining: {new_remaining}"
        )

        return {
            "success": True,
            "credits_remaining": new_remaining,
            "credits_deducted": credits,
            "is_unlimited": False,
        }

    async def refund_credits(
        self,
        user_id: str,
        credits: int,
        reason: str,
        generation_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Refund credits to user's account.

        Used when generation fails or is cancelled.

        Args:
            user_id: User ID
            credits: Number of credits to refund
            reason: Reason for refund
            generation_id: Associated generation ID

        Returns:
            Dictionary with updated credit status
        """
        subscription = await self.subscription_repo.get_by_user_id(user_id)

        if not subscription:
            raise ValueError(f"Subscription not found for user: {user_id}")

        tier_config = TierConfig.get_config(SubscriptionTier(subscription.tier))
        is_unlimited = tier_config["credits_per_month"] == -1

        # Skip refund for unlimited users
        if is_unlimited:
            return {
                "success": True,
                "credits_remaining": -1,
                "credits_refunded": 0,
                "is_unlimited": True,
            }

        # Add credits back
        new_remaining = subscription.credits_remaining + credits
        credits_used = max(0, subscription.credits_used_this_period - credits)

        # Don't exceed monthly limit
        max_credits = subscription.credits_per_month
        new_remaining = min(new_remaining, max_credits)

        await self.subscription_repo.update(
            subscription.id,
            {
                "credits_remaining": new_remaining,
                "credits_used_this_period": credits_used,
                "updated_at": datetime.utcnow(),
            },
        )

        # Log refund
        await self.usage_log_repo.create(
            user_id=user_id,
            generation_id=generation_id,
            credits_used=-credits,  # Negative for refund
            action="refund",
            metadata={"reason": reason},
        )

        logger.info(
            f"Refunded {credits} credits to user {user_id}. "
            f"Remaining: {new_remaining}. Reason: {reason}"
        )

        return {
            "success": True,
            "credits_remaining": new_remaining,
            "credits_refunded": credits,
            "is_unlimited": False,
        }

    async def reset_monthly_credits(
        self,
        user_id: str,
    ) -> Dict[str, Any]:
        """
        Reset monthly credits on subscription renewal.

        Args:
            user_id: User ID

        Returns:
            Dictionary with new credit balance
        """
        subscription = await self.subscription_repo.get_by_user_id(user_id)

        if not subscription:
            raise ValueError(f"Subscription not found for user: {user_id}")

        tier_config = TierConfig.get_config(SubscriptionTier(subscription.tier))
        credits_per_month = tier_config["credits_per_month"]

        await self.subscription_repo.update(
            subscription.id,
            {
                "credits_remaining": credits_per_month,
                "credits_used_this_period": 0,
                "updated_at": datetime.utcnow(),
            },
        )

        logger.info(
            f"Reset monthly credits for user {user_id}: {credits_per_month} credits"
        )

        return {
            "success": True,
            "credits_remaining": credits_per_month,
            "tier": subscription.tier,
        }

    async def get_usage_stats(
        self,
        user_id: str,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
    ) -> Dict[str, Any]:
        """
        Get usage statistics for a user.

        Args:
            user_id: User ID
            start_date: Start date for stats (optional)
            end_date: End date for stats (optional)

        Returns:
            Dictionary with usage statistics
        """
        subscription = await self.subscription_repo.get_by_user_id(user_id)

        if not subscription:
            return {
                "tier": SubscriptionTier.FREE.value,
                "credits_used": 0,
                "credits_remaining": 10,
                "total_generations": 0,
            }

        # Get usage logs
        usage_logs = await self.usage_log_repo.get_by_user_id(
            user_id, start_date=start_date, end_date=end_date
        )

        total_credits_used = sum(
            log.credits_used for log in usage_logs if log.action == "generation"
        )

        total_generations = len(
            [log for log in usage_logs if log.action == "generation"]
        )

        tier_config = TierConfig.get_config(SubscriptionTier(subscription.tier))
        is_unlimited = tier_config["credits_per_month"] == -1

        return {
            "tier": subscription.tier,
            "credits_used": total_credits_used if not is_unlimited else -1,
            "credits_remaining": subscription.credits_remaining,
            "credits_per_month": subscription.credits_per_month,
            "is_unlimited": is_unlimited,
            "total_generations": total_generations,
            "period_start": subscription.current_period_start.isoformat(),
            "period_end": subscription.current_period_end.isoformat(),
        }

    async def allocate_credits_on_upgrade(
        self,
        user_id: str,
        old_tier: SubscriptionTier,
        new_tier: SubscriptionTier,
        days_remaining: int,
        days_in_period: int,
    ) -> Dict[str, Any]:
        """
        Allocate prorated credits when user upgrades plan.

        Args:
            user_id: User ID
            old_tier: Previous tier
            new_tier: New tier
            days_remaining: Days left in billing period
            days_in_period: Total days in period

        Returns:
            Dictionary with new credit allocation
        """
        subscription = await self.subscription_repo.get_by_user_id(user_id)

        if not subscription:
            raise ValueError(f"Subscription not found for user: {user_id}")

        new_config = TierConfig.get_config(new_tier)
        new_credits = new_config["credits_per_month"]

        # Handle unlimited tier
        if new_credits == -1:
            await self.subscription_repo.update(
                subscription.id,
                {
                    "tier": new_tier.value,
                    "credits_per_month": new_credits,
                    "credits_remaining": new_credits,
                    "updated_at": datetime.utcnow(),
                },
            )

            logger.info(f"Upgraded user {user_id} to unlimited tier: {new_tier.value}")

            return {
                "success": True,
                "new_tier": new_tier.value,
                "credits_remaining": -1,
                "is_unlimited": True,
            }

        # Calculate prorated credits for upgrade
        proration_factor = days_remaining / days_in_period
        prorated_credits = int(new_credits * proration_factor)
        prorated_credits = max(prorated_credits, 1)  # At least 1 credit

        # Add prorated credits to current balance
        new_remaining = subscription.credits_remaining + prorated_credits

        await self.subscription_repo.update(
            subscription.id,
            {
                "tier": new_tier.value,
                "credits_per_month": new_credits,
                "credits_remaining": new_remaining,
                "updated_at": datetime.utcnow(),
            },
        )

        logger.info(
            f"Upgraded user {user_id} from {old_tier.value} to {new_tier.value}. "
            f"Added {prorated_credits} prorated credits. Total: {new_remaining}"
        )

        return {
            "success": True,
            "new_tier": new_tier.value,
            "credits_remaining": new_remaining,
            "credits_added": prorated_credits,
            "is_unlimited": False,
        }

    async def can_generate(
        self,
        user_id: str,
        cost_credits: int,
    ) -> tuple[bool, Optional[str]]:
        """
        Check if user can generate with given credit cost.

        Args:
            user_id: User ID
            cost_credits: Credits required for generation

        Returns:
            Tuple of (can_generate, error_message)
        """
        try:
            credit_status = await self.check_credits(user_id, cost_credits)

            if credit_status["is_unlimited"]:
                return True, None

            if credit_status["has_credits"]:
                return True, None

            return False, (
                f"Insufficient credits. Required: {cost_credits}, "
                f"Available: {credit_status['credits_remaining']}"
            )

        except ValueError as e:
            return False, str(e)
        except Exception as e:
            logger.error(f"Error checking credits for user {user_id}: {e}")
            return False, "Failed to check credit balance"
