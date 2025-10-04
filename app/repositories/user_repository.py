"""User repository for database operations."""
import logging
from typing import Optional, List
from datetime import datetime
from motor.motor_asyncio import AsyncIOMotorCollection
from app.repositories.base_repository import BaseRepository
from app.models.user import User, UserCreate, UserUpdate, AuthProvider
from app.core.security import get_password_hash

logger = logging.getLogger(__name__)


class UserRepository(BaseRepository[User]):
    """Repository for user operations."""

    def __init__(self, collection: AsyncIOMotorCollection):
        """Initialize user repository.

        Args:
            collection: MongoDB users collection
        """
        super().__init__(collection, User)

    async def create_user(self, user_create: UserCreate) -> User:
        """Create a new user.

        Args:
            user_create: User creation data

        Returns:
            Created user

        Raises:
            DuplicateKeyError: If email already exists
        """
        user_dict = user_create.model_dump()

        # Hash password if provided
        if user_create.password:
            user_dict["hashed_password"] = get_password_hash(user_create.password)
            del user_dict["password"]

        # Generate unique ID
        from uuid import uuid4
        user_dict["id"] = f"user_{uuid4().hex[:12]}"

        # Set defaults
        user_dict.setdefault("subscription_tier", "free")
        user_dict.setdefault("credits_remaining", 10)
        user_dict.setdefault("total_generations", 0)

        return await self.create(user_dict)

    async def find_by_email(self, email: str) -> Optional[User]:
        """Find user by email.

        Args:
            email: User email

        Returns:
            User or None if not found
        """
        return await self.find_one({"email": email.lower()})

    async def find_by_auth_provider(
        self,
        auth_provider: AuthProvider,
        auth_provider_id: str
    ) -> Optional[User]:
        """Find user by authentication provider.

        Args:
            auth_provider: Authentication provider
            auth_provider_id: Provider-specific user ID

        Returns:
            User or None if not found
        """
        return await self.find_one({
            "auth_provider": auth_provider.value,
            "auth_provider_id": auth_provider_id
        })

    async def find_by_stripe_customer_id(self, stripe_customer_id: str) -> Optional[User]:
        """Find user by Stripe customer ID.

        Args:
            stripe_customer_id: Stripe customer ID

        Returns:
            User or None if not found
        """
        return await self.find_one({"stripe_customer_id": stripe_customer_id})

    async def update_user(self, user_id: str, user_update: UserUpdate) -> Optional[User]:
        """Update user information.

        Args:
            user_id: User ID
            user_update: Update data

        Returns:
            Updated user or None if not found
        """
        update_dict = user_update.model_dump(exclude_unset=True)
        return await self.update_by_id(user_id, update_dict)

    async def increment_generations(self, user_id: str) -> Optional[User]:
        """Increment user's total generations count.

        Args:
            user_id: User ID

        Returns:
            Updated user or None if not found
        """
        result = await self.collection.find_one_and_update(
            {"id": user_id},
            {
                "$inc": {"total_generations": 1},
                "$set": {
                    "last_generation_at": datetime.utcnow(),
                    "updated_at": datetime.utcnow()
                }
            },
            return_document=True
        )

        if not result:
            return None

        if "_id" in result:
            result["id"] = str(result["_id"])
            del result["_id"]

        return self.model_class(**result)

    async def deduct_credits(self, user_id: str, credits: int) -> Optional[User]:
        """Deduct credits from user account.

        Args:
            user_id: User ID
            credits: Number of credits to deduct

        Returns:
            Updated user or None if not found

        Raises:
            ValueError: If user has insufficient credits
        """
        # First check if user has enough credits
        user = await self.find_by_id(user_id)
        if not user:
            return None

        if user.credits_remaining < credits:
            raise ValueError(f"Insufficient credits. Required: {credits}, Available: {user.credits_remaining}")

        result = await self.collection.find_one_and_update(
            {"id": user_id},
            {
                "$inc": {"credits_remaining": -credits},
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

    async def add_credits(self, user_id: str, credits: int) -> Optional[User]:
        """Add credits to user account.

        Args:
            user_id: User ID
            credits: Number of credits to add

        Returns:
            Updated user or None if not found
        """
        result = await self.collection.find_one_and_update(
            {"id": user_id},
            {
                "$inc": {"credits_remaining": credits},
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

    async def update_last_login(self, user_id: str) -> Optional[User]:
        """Update user's last login timestamp.

        Args:
            user_id: User ID

        Returns:
            Updated user or None if not found
        """
        return await self.update_by_id(user_id, {"last_login_at": datetime.utcnow()})

    async def update_subscription_tier(
        self,
        user_id: str,
        subscription_tier: str,
        credits: int
    ) -> Optional[User]:
        """Update user's subscription tier and credits.

        Args:
            user_id: User ID
            subscription_tier: New subscription tier
            credits: Credits to add

        Returns:
            Updated user or None if not found
        """
        return await self.update_by_id(user_id, {
            "subscription_tier": subscription_tier,
            "credits_remaining": credits
        })

    async def get_active_users(self, skip: int = 0, limit: int = 100) -> List[User]:
        """Get all active users.

        Args:
            skip: Number of users to skip
            limit: Maximum number of users to return

        Returns:
            List of active users
        """
        return await self.find_many(
            filter_dict={"is_active": True},
            skip=skip,
            limit=limit,
            sort=[("created_at", -1)]
        )

    async def get_users_by_tier(
        self,
        subscription_tier: str,
        skip: int = 0,
        limit: int = 100
    ) -> List[User]:
        """Get users by subscription tier.

        Args:
            subscription_tier: Subscription tier
            skip: Number of users to skip
            limit: Maximum number of users to return

        Returns:
            List of users with specified tier
        """
        return await self.find_many(
            filter_dict={"subscription_tier": subscription_tier},
            skip=skip,
            limit=limit,
            sort=[("created_at", -1)]
        )
