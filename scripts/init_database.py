"""Database initialization script - Create indexes and initial data."""
import asyncio
import logging
import sys
from pathlib import Path

# Add parent directory to path to import app modules
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.config import get_settings
from app.services.mongodb_service import MongoDBService
from app.core.azure_clients import AzureClients, get_mongodb_connection_string_from_keyvault

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def create_indexes(mongodb: MongoDBService) -> None:
    """Create all database indexes.

    Args:
        mongodb: MongoDB service instance
    """
    logger.info("Creating database indexes...")

    try:
        # Users collection indexes
        users = mongodb.get_collection("users")
        await users.create_index("email", unique=True)
        await users.create_index("auth_provider_id")
        await users.create_index("stripe_customer_id", sparse=True)
        await users.create_index([("created_at", -1)])
        await users.create_index("is_active")
        await users.create_index([("subscription_tier", 1), ("is_active", 1)])
        logger.info("✓ Created indexes for 'users' collection")

        # Generations collection indexes
        generations = mongodb.get_collection("generations")
        await generations.create_index([("user_id", 1), ("created_at", -1)])
        await generations.create_index("status")
        await generations.create_index("replicate_prediction_id", unique=True, sparse=True)
        await generations.create_index([("user_id", 1), ("status", 1)])
        await generations.create_index([("created_at", -1)])
        await generations.create_index([("status", 1), ("created_at", 1)])  # For processing queue
        await generations.create_index("model_type")
        logger.info("✓ Created indexes for 'generations' collection")

        # Subscriptions collection indexes
        subscriptions = mongodb.get_collection("subscriptions")
        await subscriptions.create_index("user_id", unique=True)
        await subscriptions.create_index("stripe_subscription_id", unique=True)
        await subscriptions.create_index("stripe_customer_id")
        await subscriptions.create_index([("status", 1), ("current_period_end", 1)])
        await subscriptions.create_index("current_period_end")
        await subscriptions.create_index([("plan", 1), ("status", 1)])
        logger.info("✓ Created indexes for 'subscriptions' collection")

        # Usage logs collection indexes
        usage_logs = mongodb.get_collection("usage_logs")
        await usage_logs.create_index([("user_id", 1), ("created_at", -1)])
        await usage_logs.create_index("action_type")
        await usage_logs.create_index([("user_id", 1), ("action_type", 1)])
        await usage_logs.create_index("resource_id", sparse=True)
        await usage_logs.create_index([("user_id", 1), ("action_type", 1), ("created_at", -1)])
        # TTL index - automatically delete documents after expiration (90 days)
        await usage_logs.create_index("expires_at", expireAfterSeconds=0)
        logger.info("✓ Created indexes for 'usage_logs' collection")

        # Rate limit logs collection indexes
        rate_limits = mongodb.get_collection("rate_limit_logs")
        await rate_limits.create_index([("user_id", 1), ("endpoint", 1)])
        await rate_limits.create_index("window_end")
        await rate_limits.create_index([("user_id", 1), ("endpoint", 1), ("window_end", 1)])
        # TTL index - automatically delete documents after expiration (1 hour)
        await rate_limits.create_index("expires_at", expireAfterSeconds=0)
        logger.info("✓ Created indexes for 'rate_limit_logs' collection")

        logger.info("✅ All indexes created successfully!")

    except Exception as e:
        logger.error(f"❌ Error creating indexes: {str(e)}")
        raise


async def create_collections(mongodb: MongoDBService) -> None:
    """Create collections with validators.

    Args:
        mongodb: MongoDB service instance
    """
    logger.info("Creating collections...")

    try:
        db = mongodb.database

        # Check if collections already exist
        existing_collections = await db.list_collection_names()
        logger.info(f"Existing collections: {existing_collections}")

        # Collections will be created automatically when first document is inserted
        # Or we can create them explicitly here
        collections = ["users", "generations", "subscriptions", "usage_logs", "rate_limit_logs"]

        for collection_name in collections:
            if collection_name not in existing_collections:
                await db.create_collection(collection_name)
                logger.info(f"✓ Created collection: {collection_name}")
            else:
                logger.info(f"  Collection '{collection_name}' already exists")

        logger.info("✅ All collections ready!")

    except Exception as e:
        logger.error(f"❌ Error creating collections: {str(e)}")
        raise


async def verify_database_setup(mongodb: MongoDBService) -> None:
    """Verify database setup.

    Args:
        mongodb: MongoDB service instance
    """
    logger.info("Verifying database setup...")

    try:
        # Get database stats
        stats = await mongodb.get_database_stats()
        logger.info(f"Database: {stats.get('database')}")
        logger.info(f"Collections: {stats.get('collections')}")
        logger.info(f"Data Size: {stats.get('data_size_mb')} MB")
        logger.info(f"Storage Size: {stats.get('storage_size_mb')} MB")
        logger.info(f"Indexes: {stats.get('indexes')}")
        logger.info(f"Index Size: {stats.get('index_size_mb')} MB")

        # List all collections
        collections = await mongodb.database.list_collection_names()
        logger.info(f"Collections: {', '.join(collections)}")

        # Verify indexes for each collection
        for collection_name in collections:
            collection = mongodb.get_collection(collection_name)
            indexes = await collection.index_information()
            logger.info(f"\n{collection_name} indexes:")
            for index_name, index_info in indexes.items():
                logger.info(f"  - {index_name}: {index_info.get('key')}")

        logger.info("\n✅ Database verification complete!")

    except Exception as e:
        logger.error(f"❌ Error verifying database: {str(e)}")
        raise


async def main():
    """Main initialization function."""
    logger.info("=" * 60)
    logger.info("Starting database initialization...")
    logger.info("=" * 60)

    settings = get_settings()
    mongodb = None

    try:
        # Initialize Azure clients
        logger.info("\n1. Initializing Azure clients...")
        azure_clients = AzureClients(settings)

        # Get Key Vault client
        keyvault_client = azure_clients.keyvault_client
        if not keyvault_client:
            raise RuntimeError("Key Vault client not configured. Set AZURE_KEY_VAULT_URL in .env")

        # Get MongoDB connection string from Key Vault
        logger.info("\n2. Retrieving MongoDB connection string from Key Vault...")
        connection_string = await get_mongodb_connection_string_from_keyvault(
            keyvault_client,
            settings.mongodb_connection_string_secret
        )

        # Initialize MongoDB
        logger.info("\n3. Connecting to MongoDB...")
        mongodb = MongoDBService(settings)
        await mongodb.connect(connection_string)

        # Create collections
        logger.info("\n4. Creating collections...")
        await create_collections(mongodb)

        # Create indexes
        logger.info("\n5. Creating indexes...")
        await create_indexes(mongodb)

        # Verify setup
        logger.info("\n6. Verifying database setup...")
        await verify_database_setup(mongodb)

        logger.info("\n" + "=" * 60)
        logger.info("✅ Database initialization completed successfully!")
        logger.info("=" * 60)

    except Exception as e:
        logger.error("\n" + "=" * 60)
        logger.error(f"❌ Database initialization failed: {str(e)}")
        logger.error("=" * 60)
        sys.exit(1)

    finally:
        if mongodb:
            await mongodb.disconnect()


if __name__ == "__main__":
    asyncio.run(main())
