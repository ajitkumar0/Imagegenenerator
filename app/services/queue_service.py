"""
Azure Service Bus Queue Service with Managed Identity

Provides message queuing functionality for asynchronous image generation jobs.
Uses Managed Identity for authentication without credentials.
"""

import json
import logging
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Callable
from uuid import uuid4

from azure.servicebus import ServiceBusClient, ServiceBusMessage, ServiceBusReceiver
from azure.servicebus.exceptions import ServiceBusError, MessageLockLostError
from azure.identity import DefaultAzureCredential
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

from app.config import Settings

logger = logging.getLogger(__name__)


class GenerationJobMessage:
    """Message format for image generation jobs."""

    def __init__(
        self,
        generation_id: str,
        user_id: str,
        prompt: str,
        model: str,
        job_type: str = "text_to_image",
        settings: Optional[Dict[str, Any]] = None,
        callback_url: Optional[str] = None,
        priority: str = "normal",
        attempt: int = 1,
    ):
        self.generation_id = generation_id
        self.user_id = user_id
        self.job_type = job_type
        self.prompt = prompt
        self.model = model
        self.settings = settings or {}
        self.callback_url = callback_url
        self.priority = priority
        self.attempt = attempt
        self.created_at = datetime.utcnow().isoformat()
        self.message_id = str(uuid4())

    def to_dict(self) -> Dict[str, Any]:
        """Convert message to dictionary."""
        return {
            "message_id": self.message_id,
            "generation_id": self.generation_id,
            "user_id": self.user_id,
            "type": self.job_type,
            "prompt": self.prompt,
            "model": self.model,
            "settings": self.settings,
            "callback_url": self.callback_url,
            "priority": self.priority,
            "attempt": self.attempt,
            "created_at": self.created_at,
        }

    def to_json(self) -> str:
        """Convert message to JSON string."""
        return json.dumps(self.to_dict())

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "GenerationJobMessage":
        """Create message from dictionary."""
        return cls(
            generation_id=data["generation_id"],
            user_id=data["user_id"],
            prompt=data["prompt"],
            model=data["model"],
            job_type=data.get("type", "text_to_image"),
            settings=data.get("settings"),
            callback_url=data.get("callback_url"),
            priority=data.get("priority", "normal"),
            attempt=data.get("attempt", 1),
        )

    @classmethod
    def from_json(cls, json_str: str) -> "GenerationJobMessage":
        """Create message from JSON string."""
        return cls.from_dict(json.loads(json_str))


class AzureServiceBusService:
    """
    Azure Service Bus service with Managed Identity authentication.

    Provides functionality for:
    - Sending generation requests to queue
    - Receiving and processing messages
    - Handling retries and dead-letter queue
    - Monitoring queue metrics
    """

    def __init__(self, settings: Settings):
        self.settings = settings
        self._credential = DefaultAzureCredential()
        self._client: Optional[ServiceBusClient] = None
        self.queue_name = settings.servicebus_queue_name
        self.namespace = settings.servicebus_namespace

    @property
    def client(self) -> ServiceBusClient:
        """Get or create Service Bus client with Managed Identity."""
        if self._client is None:
            fully_qualified_namespace = f"{self.namespace}.servicebus.windows.net"
            self._client = ServiceBusClient(
                fully_qualified_namespace=fully_qualified_namespace,
                credential=self._credential,
                logging_enable=True,
            )
            logger.info(
                f"Service Bus client initialized for namespace: {self.namespace}"
            )
        return self._client

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        retry=retry_if_exception_type(ServiceBusError),
    )
    async def send_generation_request(
        self,
        generation_id: str,
        user_id: str,
        prompt: str,
        model: str,
        job_type: str = "text_to_image",
        settings: Optional[Dict[str, Any]] = None,
        callback_url: Optional[str] = None,
        priority: str = "normal",
        scheduled_enqueue_time: Optional[datetime] = None,
    ) -> bool:
        """
        Send image generation request to Service Bus queue.

        Args:
            generation_id: Unique generation ID from Cosmos DB
            user_id: User ID who requested generation
            prompt: Text prompt for image generation
            model: Replicate model ID (e.g., "flux-schnell")
            job_type: Type of generation job
            settings: Additional generation settings
            callback_url: Optional webhook URL for completion notification
            priority: Job priority (normal, high)
            scheduled_enqueue_time: Optional scheduled delivery time

        Returns:
            bool: True if message sent successfully
        """
        try:
            # Create message
            job_message = GenerationJobMessage(
                generation_id=generation_id,
                user_id=user_id,
                prompt=prompt,
                model=model,
                job_type=job_type,
                settings=settings,
                callback_url=callback_url,
                priority=priority,
            )

            # Create Service Bus message
            message = ServiceBusMessage(
                body=job_message.to_json(),
                content_type="application/json",
                message_id=job_message.message_id,
                session_id=None,  # Use session for FIFO if needed
            )

            # Add custom properties for filtering
            message.application_properties = {
                "generation_id": generation_id,
                "user_id": user_id,
                "priority": priority,
                "job_type": job_type,
            }

            # Set scheduled enqueue time if provided
            if scheduled_enqueue_time:
                message.scheduled_enqueue_time_utc = scheduled_enqueue_time

            # Send message
            async with self.client.get_queue_sender(self.queue_name) as sender:
                await sender.send_messages(message)

            logger.info(
                f"Message sent to queue: generation_id={generation_id}, "
                f"message_id={job_message.message_id}"
            )

            return True

        except ServiceBusError as e:
            logger.error(f"Failed to send message to Service Bus: {e}")
            raise
        except Exception as e:
            logger.error(f"Unexpected error sending message: {e}")
            return False

    async def send_batch_requests(
        self, messages: List[GenerationJobMessage]
    ) -> bool:
        """
        Send multiple generation requests in a batch.

        Args:
            messages: List of GenerationJobMessage objects

        Returns:
            bool: True if batch sent successfully
        """
        try:
            async with self.client.get_queue_sender(self.queue_name) as sender:
                # Create batch
                batch = await sender.create_message_batch()

                for job_message in messages:
                    message = ServiceBusMessage(
                        body=job_message.to_json(),
                        content_type="application/json",
                        message_id=job_message.message_id,
                    )
                    message.application_properties = {
                        "generation_id": job_message.generation_id,
                        "user_id": job_message.user_id,
                        "priority": job_message.priority,
                    }

                    # Try to add message to batch
                    try:
                        batch.add_message(message)
                    except ValueError:
                        # Batch is full, send and create new batch
                        await sender.send_messages(batch)
                        batch = await sender.create_message_batch()
                        batch.add_message(message)

                # Send remaining messages
                if len(batch) > 0:
                    await sender.send_messages(batch)

            logger.info(f"Batch of {len(messages)} messages sent successfully")
            return True

        except ServiceBusError as e:
            logger.error(f"Failed to send batch messages: {e}")
            raise
        except Exception as e:
            logger.error(f"Unexpected error sending batch: {e}")
            return False

    async def receive_messages(
        self,
        max_messages: int = 1,
        max_wait_time: int = 60,
        processor_callback: Optional[Callable] = None,
    ) -> List[Any]:
        """
        Receive messages from queue for processing.

        Args:
            max_messages: Maximum number of messages to receive
            max_wait_time: Maximum time to wait for messages (seconds)
            processor_callback: Optional async callback function to process each message

        Returns:
            List of received messages (if no callback provided)
        """
        messages_received = []

        try:
            async with self.client.get_queue_receiver(
                self.queue_name,
                max_wait_time=max_wait_time,
            ) as receiver:
                async for message in receiver:
                    try:
                        # Parse message body
                        job_data = json.loads(str(message))
                        job_message = GenerationJobMessage.from_dict(job_data)

                        logger.info(
                            f"Received message: generation_id={job_message.generation_id}, "
                            f"attempt={job_message.attempt}"
                        )

                        # Process message with callback if provided
                        if processor_callback:
                            success = await processor_callback(job_message, message)

                            if success:
                                # Complete message (remove from queue)
                                await receiver.complete_message(message)
                                logger.info(
                                    f"Message completed: {job_message.generation_id}"
                                )
                            else:
                                # Abandon message (will be retried)
                                await receiver.abandon_message(message)
                                logger.warning(
                                    f"Message abandoned: {job_message.generation_id}"
                                )
                        else:
                            messages_received.append((job_message, message))

                        # Stop if max messages reached
                        if len(messages_received) >= max_messages:
                            break

                    except MessageLockLostError:
                        logger.error(
                            f"Message lock lost: {message.message_id}. "
                            "Processing took too long."
                        )
                    except Exception as e:
                        logger.error(f"Error processing message: {e}")
                        # Dead-letter the message
                        await receiver.dead_letter_message(
                            message,
                            reason="ProcessingError",
                            error_description=str(e),
                        )

            return messages_received

        except ServiceBusError as e:
            logger.error(f"Failed to receive messages: {e}")
            raise

    async def complete_message(self, receiver: ServiceBusReceiver, message) -> None:
        """
        Mark message as complete and remove from queue.

        Args:
            receiver: Service Bus receiver instance
            message: Message to complete
        """
        try:
            await receiver.complete_message(message)
            logger.info(f"Message completed: {message.message_id}")
        except MessageLockLostError:
            logger.error(f"Cannot complete message - lock lost: {message.message_id}")
        except Exception as e:
            logger.error(f"Error completing message: {e}")

    async def abandon_message(
        self, receiver: ServiceBusReceiver, message, properties: Optional[Dict] = None
    ) -> None:
        """
        Abandon message and return to queue for retry.

        Args:
            receiver: Service Bus receiver instance
            message: Message to abandon
            properties: Optional properties to update
        """
        try:
            await receiver.abandon_message(message, properties_to_modify=properties)
            logger.info(f"Message abandoned for retry: {message.message_id}")
        except Exception as e:
            logger.error(f"Error abandoning message: {e}")

    async def dead_letter_message(
        self,
        receiver: ServiceBusReceiver,
        message,
        reason: str,
        error_description: str,
    ) -> None:
        """
        Move message to dead-letter queue after max retries.

        Args:
            receiver: Service Bus receiver instance
            message: Message to dead-letter
            reason: Reason for dead-lettering
            error_description: Detailed error description
        """
        try:
            await receiver.dead_letter_message(
                message,
                reason=reason,
                error_description=error_description,
            )
            logger.warning(
                f"Message moved to DLQ: {message.message_id}, reason: {reason}"
            )
        except Exception as e:
            logger.error(f"Error dead-lettering message: {e}")

    async def get_queue_metrics(self) -> Dict[str, Any]:
        """
        Get queue metrics for monitoring.

        Returns:
            Dictionary with queue metrics:
            - active_message_count: Messages in queue
            - dead_letter_message_count: Messages in DLQ
            - scheduled_message_count: Scheduled messages
            - total_message_count: Total messages
        """
        try:
            from azure.servicebus.management import ServiceBusAdministrationClient

            # Create management client
            mgmt_client = ServiceBusAdministrationClient(
                fully_qualified_namespace=f"{self.namespace}.servicebus.windows.net",
                credential=self._credential,
            )

            # Get queue runtime properties
            queue_runtime_props = mgmt_client.get_queue_runtime_properties(
                self.queue_name
            )

            metrics = {
                "active_message_count": queue_runtime_props.active_message_count,
                "dead_letter_message_count": queue_runtime_props.dead_letter_message_count,
                "scheduled_message_count": queue_runtime_props.scheduled_message_count,
                "total_message_count": queue_runtime_props.total_message_count,
                "size_in_bytes": queue_runtime_props.size_in_bytes,
            }

            logger.info(f"Queue metrics retrieved: {metrics}")
            return metrics

        except Exception as e:
            logger.error(f"Error getting queue metrics: {e}")
            return {}

    async def peek_dead_letter_messages(self, max_messages: int = 10) -> List[Dict]:
        """
        Peek messages in dead-letter queue without removing them.

        Args:
            max_messages: Maximum number of messages to peek

        Returns:
            List of dead-letter messages
        """
        dead_letter_messages = []

        try:
            async with self.client.get_queue_receiver(
                self.queue_name,
                sub_queue="deadletter",
                max_wait_time=5,
            ) as receiver:
                messages = await receiver.peek_messages(max_message_count=max_messages)

                for message in messages:
                    dead_letter_messages.append(
                        {
                            "message_id": message.message_id,
                            "body": str(message),
                            "dead_letter_reason": message.dead_letter_reason,
                            "dead_letter_error_description": message.dead_letter_error_description,
                            "enqueued_time": message.enqueued_time_utc,
                            "delivery_count": message.delivery_count,
                        }
                    )

            return dead_letter_messages

        except Exception as e:
            logger.error(f"Error peeking dead-letter messages: {e}")
            return []

    async def resubmit_dead_letter_message(self, message_id: str) -> bool:
        """
        Resubmit a message from dead-letter queue back to main queue.

        Args:
            message_id: ID of message to resubmit

        Returns:
            bool: True if resubmitted successfully
        """
        try:
            async with self.client.get_queue_receiver(
                self.queue_name,
                sub_queue="deadletter",
            ) as receiver:
                async for message in receiver:
                    if message.message_id == message_id:
                        # Parse original message
                        job_data = json.loads(str(message))
                        job_message = GenerationJobMessage.from_dict(job_data)

                        # Increment attempt count
                        job_message.attempt += 1

                        # Send back to main queue
                        await self.send_generation_request(
                            generation_id=job_message.generation_id,
                            user_id=job_message.user_id,
                            prompt=job_message.prompt,
                            model=job_message.model,
                            job_type=job_message.job_type,
                            settings=job_message.settings,
                            callback_url=job_message.callback_url,
                            priority=job_message.priority,
                        )

                        # Complete dead-letter message
                        await receiver.complete_message(message)

                        logger.info(f"Dead-letter message resubmitted: {message_id}")
                        return True

            logger.warning(f"Message not found in DLQ: {message_id}")
            return False

        except Exception as e:
            logger.error(f"Error resubmitting dead-letter message: {e}")
            return False

    async def health_check(self) -> bool:
        """
        Check Service Bus connection health.

        Returns:
            bool: True if connection is healthy
        """
        try:
            metrics = await self.get_queue_metrics()
            return "active_message_count" in metrics
        except Exception as e:
            logger.error(f"Service Bus health check failed: {e}")
            return False

    async def close(self):
        """Close Service Bus client and cleanup resources."""
        if self._client:
            await self._client.close()
            self._client = None
            logger.info("Service Bus client closed")
