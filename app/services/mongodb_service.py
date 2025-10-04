"""MongoDB service with Managed Identity authentication via Key Vault."""
import logging
from typing import Optional
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from pymongo.errors import ConnectionFailure, ServerSelectionTimeoutError
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type
)
from app.config import Settings

logger = logging.getLogger(__name__)


class MongoDBService:
    """MongoDB service with connection management and retry logic."""

    def __init__(self, settings: Settings):
        """Initialize MongoDB service.

        Args:
            settings: Application settings
        """
        self.settings = settings
        self._client: Optional[AsyncIOMotorClient] = None
        self._database: Optional[AsyncIOMotorDatabase] = None

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        retry=retry_if_exception_type((ConnectionFailure, ServerSelectionTimeoutError)),
        reraise=True
    )
    async def connect(self, connection_string: str) -> None:
        """Connect to MongoDB with retry logic.

        Args:
            connection_string: MongoDB connection string

        Raises:
            ConnectionFailure: If connection fails after retries
        """
        try:
            logger.info("Connecting to MongoDB...")

            # Create Motor client with optimal settings
            self._client = AsyncIOMotorClient(
                connection_string,
                serverSelectionTimeoutMS=5000,
                connectTimeoutMS=10000,
                socketTimeoutMS=30000,
                maxPoolSize=50,
                minPoolSize=10,
                retryWrites=True,
                retryReads=True,
                w="majority",
                readPreference="primaryPreferred"
            )

            # Test connection
            await self._client.admin.command('ping')

            # Get database
            self._database = self._client[self.settings.mongodb_database_name]

            logger.info(f"Successfully connected to MongoDB database: {self.settings.mongodb_database_name}")

        except Exception as e:
            logger.error(f"Failed to connect to MongoDB: {str(e)}")
            raise

    async def disconnect(self) -> None:
        """Disconnect from MongoDB."""
        if self._client:
            try:
                self._client.close()
                logger.info("Disconnected from MongoDB")
            except Exception as e:
                logger.error(f"Error disconnecting from MongoDB: {str(e)}")

    @property
    def client(self) -> AsyncIOMotorClient:
        """Get MongoDB client.

        Returns:
            AsyncIOMotorClient instance

        Raises:
            RuntimeError: If not connected
        """
        if self._client is None:
            raise RuntimeError("MongoDB client not initialized. Call connect() first.")
        return self._client

    @property
    def database(self) -> AsyncIOMotorDatabase:
        """Get MongoDB database.

        Returns:
            AsyncIOMotorDatabase instance

        Raises:
            RuntimeError: If not connected
        """
        if self._database is None:
            raise RuntimeError("MongoDB database not initialized. Call connect() first.")
        return self._database

    def get_collection(self, collection_name: str):
        """Get MongoDB collection.

        Args:
            collection_name: Name of the collection

        Returns:
            AsyncIOMotorCollection instance
        """
        return self.database[collection_name]

    async def health_check(self) -> bool:
        """Check MongoDB connection health.

        Returns:
            True if healthy, False otherwise
        """
        try:
            await self.client.admin.command('ping')
            return True
        except Exception as e:
            logger.error(f"MongoDB health check failed: {str(e)}")
            return False

    async def create_indexes(self) -> None:
        """Create all database indexes.

        This should be called during application startup.
        """
        try:
            logger.info("Creating MongoDB indexes...")

            # Users collection indexes
            users = self.get_collection("users")
            await users.create_index("email", unique=True)
            await users.create_index("auth_provider_id")
            await users.create_index("stripe_customer_id", sparse=True)
            await users.create_index([("created_at", -1)])
            await users.create_index("is_active")
            logger.info("Created indexes for 'users' collection")

            # Generations collection indexes
            generations = self.get_collection("generations")
            await generations.create_index([("user_id", 1), ("created_at", -1)])
            await generations.create_index("status")
            await generations.create_index("replicate_prediction_id", unique=True, sparse=True)
            await generations.create_index([("user_id", 1), ("status", 1)])
            await generations.create_index([("created_at", -1)])
            logger.info("Created indexes for 'generations' collection")

            # Subscriptions collection indexes
            subscriptions = self.get_collection("subscriptions")
            await subscriptions.create_index("user_id", unique=True)
            await subscriptions.create_index("stripe_subscription_id", unique=True)
            await subscriptions.create_index("stripe_customer_id")
            await subscriptions.create_index([("status", 1), ("current_period_end", 1)])
            await subscriptions.create_index("current_period_end")
            logger.info("Created indexes for 'subscriptions' collection")

            # Usage logs collection indexes
            usage_logs = self.get_collection("usage_logs")
            await usage_logs.create_index([("user_id", 1), ("created_at", -1)])
            await usage_logs.create_index("action_type")
            await usage_logs.create_index([("user_id", 1), ("action_type", 1)])
            await usage_logs.create_index("resource_id", sparse=True)
            # TTL index - automatically delete documents after expiration
            await usage_logs.create_index("expires_at", expireAfterSeconds=0)
            logger.info("Created indexes for 'usage_logs' collection")

            # Rate limit logs collection indexes
            rate_limits = self.get_collection("rate_limit_logs")
            await rate_limits.create_index([("user_id", 1), ("endpoint", 1)])
            await rate_limits.create_index("window_end")
            # TTL index - automatically delete documents after expiration
            await rate_limits.create_index("expires_at", expireAfterSeconds=0)
            logger.info("Created indexes for 'rate_limit_logs' collection")

            logger.info("All MongoDB indexes created successfully")

        except Exception as e:
            logger.error(f"Error creating MongoDB indexes: {str(e)}")
            raise

    async def get_database_stats(self) -> dict:
        """Get database statistics.

        Returns:
            Database statistics dictionary
        """
        try:
            stats = await self.database.command("dbStats")
            return {
                "database": stats.get("db"),
                "collections": stats.get("collections"),
                "data_size_mb": round(stats.get("dataSize", 0) / (1024 * 1024), 2),
                "storage_size_mb": round(stats.get("storageSize", 0) / (1024 * 1024), 2),
                "indexes": stats.get("indexes"),
                "index_size_mb": round(stats.get("indexSize", 0) / (1024 * 1024), 2)
            }
        except Exception as e:
            logger.error(f"Error getting database stats: {str(e)}")
            return {}


# Global instance
mongodb_service: Optional[MongoDBService] = None


def get_mongodb_service() -> MongoDBService:
    """Get global MongoDB service instance.

    Returns:
        MongoDBService instance

    Raises:
        RuntimeError: If MongoDB service not initialized
    """
    if mongodb_service is None:
        raise RuntimeError("MongoDB service not initialized. Call initialize_mongodb() first.")
    return mongodb_service


async def initialize_mongodb(settings: Settings, connection_string: str) -> MongoDBService:
    """Initialize global MongoDB service instance.

    Args:
        settings: Application settings
        connection_string: MongoDB connection string

    Returns:
        MongoDBService instance
    """
    global mongodb_service

    mongodb_service = MongoDBService(settings)
    await mongodb_service.connect(connection_string)

    # Create indexes during initialization
    await mongodb_service.create_indexes()

    return mongodb_service


async def close_mongodb() -> None:
    """Close MongoDB connection."""
    if mongodb_service:
        await mongodb_service.disconnect()
