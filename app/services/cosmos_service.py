"""Cosmos DB service for data operations."""
import logging
from typing import List, Optional, Dict, Any
from uuid import uuid4
from azure.cosmos import exceptions
from app.core.azure_clients import AzureClients

logger = logging.getLogger(__name__)


class CosmosService:
    """Service for Cosmos DB operations."""

    def __init__(self, azure_clients: AzureClients):
        """Initialize Cosmos DB service.

        Args:
            azure_clients: Azure clients instance
        """
        self.azure_clients = azure_clients
        self.container = azure_clients.get_cosmos_container()

    async def create_item(self, item: Dict[str, Any]) -> Dict[str, Any]:
        """Create a new item in Cosmos DB.

        Args:
            item: Item data to create

        Returns:
            Created item with id

        Raises:
            Exception: If creation fails
        """
        try:
            # Generate ID if not provided
            if "id" not in item:
                item["id"] = str(uuid4())

            created_item = self.container.create_item(body=item)
            logger.info(f"Created item with id: {created_item['id']}")
            return created_item

        except exceptions.CosmosHttpResponseError as e:
            logger.error(f"Failed to create item: {str(e)}")
            raise

    async def get_item(self, item_id: str, partition_key: str) -> Optional[Dict[str, Any]]:
        """Get an item by ID and partition key.

        Args:
            item_id: Item ID
            partition_key: Partition key value

        Returns:
            Item data or None if not found
        """
        try:
            item = self.container.read_item(item=item_id, partition_key=partition_key)
            logger.info(f"Retrieved item with id: {item_id}")
            return item

        except exceptions.CosmosResourceNotFoundError:
            logger.warning(f"Item not found: {item_id}")
            return None

        except exceptions.CosmosHttpResponseError as e:
            logger.error(f"Failed to get item: {str(e)}")
            raise

    async def update_item(self, item_id: str, partition_key: str, item: Dict[str, Any]) -> Dict[str, Any]:
        """Update an existing item.

        Args:
            item_id: Item ID
            partition_key: Partition key value
            item: Updated item data

        Returns:
            Updated item

        Raises:
            Exception: If update fails
        """
        try:
            # Ensure ID is set
            item["id"] = item_id

            updated_item = self.container.replace_item(
                item=item_id,
                body=item,
                partition_key=partition_key
            )
            logger.info(f"Updated item with id: {item_id}")
            return updated_item

        except exceptions.CosmosHttpResponseError as e:
            logger.error(f"Failed to update item: {str(e)}")
            raise

    async def delete_item(self, item_id: str, partition_key: str) -> bool:
        """Delete an item by ID and partition key.

        Args:
            item_id: Item ID
            partition_key: Partition key value

        Returns:
            True if deleted successfully

        Raises:
            Exception: If deletion fails
        """
        try:
            self.container.delete_item(item=item_id, partition_key=partition_key)
            logger.info(f"Deleted item with id: {item_id}")
            return True

        except exceptions.CosmosResourceNotFoundError:
            logger.warning(f"Item not found for deletion: {item_id}")
            return False

        except exceptions.CosmosHttpResponseError as e:
            logger.error(f"Failed to delete item: {str(e)}")
            raise

    async def query_items(
        self,
        query: str,
        parameters: Optional[List[Dict[str, Any]]] = None,
        partition_key: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """Query items using SQL query.

        Args:
            query: SQL query string
            parameters: Query parameters
            partition_key: Optional partition key to limit query scope

        Returns:
            List of items matching the query
        """
        try:
            query_kwargs = {
                "query": query,
                "enable_cross_partition_query": partition_key is None,
            }

            if parameters:
                query_kwargs["parameters"] = parameters

            if partition_key:
                query_kwargs["partition_key"] = partition_key

            items = list(self.container.query_items(**query_kwargs))
            logger.info(f"Query returned {len(items)} items")
            return items

        except exceptions.CosmosHttpResponseError as e:
            logger.error(f"Failed to query items: {str(e)}")
            raise

    async def get_all_items(self, partition_key: Optional[str] = None) -> List[Dict[str, Any]]:
        """Get all items, optionally filtered by partition key.

        Args:
            partition_key: Optional partition key to filter items

        Returns:
            List of all items
        """
        query = "SELECT * FROM c"
        return await self.query_items(query, partition_key=partition_key)

    async def upsert_item(self, item: Dict[str, Any]) -> Dict[str, Any]:
        """Create or update an item (upsert).

        Args:
            item: Item data

        Returns:
            Created or updated item
        """
        try:
            # Generate ID if not provided
            if "id" not in item:
                item["id"] = str(uuid4())

            upserted_item = self.container.upsert_item(body=item)
            logger.info(f"Upserted item with id: {upserted_item['id']}")
            return upserted_item

        except exceptions.CosmosHttpResponseError as e:
            logger.error(f"Failed to upsert item: {str(e)}")
            raise
