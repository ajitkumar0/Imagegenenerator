"""Base repository class with common CRUD operations."""
import logging
from typing import Any, Dict, List, Optional, Type, TypeVar, Generic
from datetime import datetime
from motor.motor_asyncio import AsyncIOMotorCollection
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError, PyMongoError
from pydantic import BaseModel

logger = logging.getLogger(__name__)

T = TypeVar('T', bound=BaseModel)


class BaseRepository(Generic[T]):
    """Base repository with common async MongoDB operations."""

    def __init__(self, collection: AsyncIOMotorCollection, model_class: Type[T]):
        """Initialize repository.

        Args:
            collection: MongoDB collection
            model_class: Pydantic model class for type conversion
        """
        self.collection = collection
        self.model_class = model_class

    async def create(self, data: Dict[str, Any]) -> T:
        """Create a new document.

        Args:
            data: Document data

        Returns:
            Created document as Pydantic model

        Raises:
            DuplicateKeyError: If unique constraint violated
            PyMongoError: On database error
        """
        try:
            # Add timestamps
            now = datetime.utcnow()
            data.setdefault('created_at', now)
            data.setdefault('updated_at', now)

            result = await self.collection.insert_one(data)

            # Retrieve the created document
            created_doc = await self.collection.find_one({"_id": result.inserted_id})

            # Convert ObjectId to string for id field
            if created_doc and "_id" in created_doc:
                created_doc["id"] = str(created_doc["_id"])
                del created_doc["_id"]

            logger.info(f"Created document with id: {created_doc.get('id')}")
            return self.model_class(**created_doc)

        except DuplicateKeyError as e:
            logger.error(f"Duplicate key error: {str(e)}")
            raise
        except PyMongoError as e:
            logger.error(f"Database error during create: {str(e)}")
            raise

    async def find_by_id(self, document_id: str) -> Optional[T]:
        """Find document by ID.

        Args:
            document_id: Document ID

        Returns:
            Document as Pydantic model or None if not found
        """
        try:
            doc = await self.collection.find_one({"id": document_id})

            if not doc:
                return None

            # Convert ObjectId to string
            if "_id" in doc:
                doc["id"] = str(doc["_id"])
                del doc["_id"]

            return self.model_class(**doc)

        except PyMongoError as e:
            logger.error(f"Database error during find_by_id: {str(e)}")
            raise

    async def find_one(self, filter_dict: Dict[str, Any]) -> Optional[T]:
        """Find single document by filter.

        Args:
            filter_dict: MongoDB filter dictionary

        Returns:
            Document as Pydantic model or None if not found
        """
        try:
            doc = await self.collection.find_one(filter_dict)

            if not doc:
                return None

            # Convert ObjectId to string
            if "_id" in doc:
                doc["id"] = str(doc["_id"])
                del doc["_id"]

            return self.model_class(**doc)

        except PyMongoError as e:
            logger.error(f"Database error during find_one: {str(e)}")
            raise

    async def find_many(
        self,
        filter_dict: Optional[Dict[str, Any]] = None,
        skip: int = 0,
        limit: int = 100,
        sort: Optional[List[tuple]] = None
    ) -> List[T]:
        """Find multiple documents.

        Args:
            filter_dict: MongoDB filter dictionary
            skip: Number of documents to skip
            limit: Maximum number of documents to return
            sort: Sort specification (e.g., [("created_at", -1)])

        Returns:
            List of documents as Pydantic models
        """
        try:
            filter_dict = filter_dict or {}

            cursor = self.collection.find(filter_dict).skip(skip).limit(limit)

            if sort:
                cursor = cursor.sort(sort)

            documents = []
            async for doc in cursor:
                # Convert ObjectId to string
                if "_id" in doc:
                    doc["id"] = str(doc["_id"])
                    del doc["_id"]
                documents.append(self.model_class(**doc))

            return documents

        except PyMongoError as e:
            logger.error(f"Database error during find_many: {str(e)}")
            raise

    async def update_by_id(
        self,
        document_id: str,
        update_data: Dict[str, Any]
    ) -> Optional[T]:
        """Update document by ID.

        Args:
            document_id: Document ID
            update_data: Fields to update

        Returns:
            Updated document as Pydantic model or None if not found
        """
        try:
            # Add updated_at timestamp
            update_data["updated_at"] = datetime.utcnow()

            result = await self.collection.find_one_and_update(
                {"id": document_id},
                {"$set": update_data},
                return_document=ReturnDocument.AFTER
            )

            if not result:
                return None

            # Convert ObjectId to string
            if "_id" in result:
                result["id"] = str(result["_id"])
                del result["_id"]

            logger.info(f"Updated document with id: {document_id}")
            return self.model_class(**result)

        except PyMongoError as e:
            logger.error(f"Database error during update: {str(e)}")
            raise

    async def delete_by_id(self, document_id: str) -> bool:
        """Delete document by ID.

        Args:
            document_id: Document ID

        Returns:
            True if deleted, False if not found
        """
        try:
            result = await self.collection.delete_one({"id": document_id})

            if result.deleted_count > 0:
                logger.info(f"Deleted document with id: {document_id}")
                return True

            return False

        except PyMongoError as e:
            logger.error(f"Database error during delete: {str(e)}")
            raise

    async def count(self, filter_dict: Optional[Dict[str, Any]] = None) -> int:
        """Count documents matching filter.

        Args:
            filter_dict: MongoDB filter dictionary

        Returns:
            Number of documents
        """
        try:
            filter_dict = filter_dict or {}
            return await self.collection.count_documents(filter_dict)

        except PyMongoError as e:
            logger.error(f"Database error during count: {str(e)}")
            raise

    async def exists(self, filter_dict: Dict[str, Any]) -> bool:
        """Check if document exists.

        Args:
            filter_dict: MongoDB filter dictionary

        Returns:
            True if exists, False otherwise
        """
        try:
            count = await self.collection.count_documents(filter_dict, limit=1)
            return count > 0

        except PyMongoError as e:
            logger.error(f"Database error during exists check: {str(e)}")
            raise

    async def update_many(
        self,
        filter_dict: Dict[str, Any],
        update_data: Dict[str, Any]
    ) -> int:
        """Update multiple documents.

        Args:
            filter_dict: MongoDB filter dictionary
            update_data: Fields to update

        Returns:
            Number of documents updated
        """
        try:
            # Add updated_at timestamp
            update_data["updated_at"] = datetime.utcnow()

            result = await self.collection.update_many(
                filter_dict,
                {"$set": update_data}
            )

            logger.info(f"Updated {result.modified_count} documents")
            return result.modified_count

        except PyMongoError as e:
            logger.error(f"Database error during update_many: {str(e)}")
            raise

    async def delete_many(self, filter_dict: Dict[str, Any]) -> int:
        """Delete multiple documents.

        Args:
            filter_dict: MongoDB filter dictionary

        Returns:
            Number of documents deleted
        """
        try:
            result = await self.collection.delete_many(filter_dict)

            logger.info(f"Deleted {result.deleted_count} documents")
            return result.deleted_count

        except PyMongoError as e:
            logger.error(f"Database error during delete_many: {str(e)}")
            raise

    async def aggregate(self, pipeline: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Execute aggregation pipeline.

        Args:
            pipeline: MongoDB aggregation pipeline

        Returns:
            List of aggregation results
        """
        try:
            cursor = self.collection.aggregate(pipeline)
            results = []

            async for doc in cursor:
                # Convert ObjectId to string if present
                if "_id" in doc:
                    doc["id"] = str(doc["_id"])
                    del doc["_id"]
                results.append(doc)

            return results

        except PyMongoError as e:
            logger.error(f"Database error during aggregation: {str(e)}")
            raise
