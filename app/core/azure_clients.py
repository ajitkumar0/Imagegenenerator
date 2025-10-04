"""Azure clients initialized with Managed Identity (DefaultAzureCredential)."""
import logging
from typing import Optional
from azure.identity import DefaultAzureCredential, ManagedIdentityCredential
from azure.cosmos import CosmosClient
from azure.storage.blob import BlobServiceClient
from azure.keyvault.secrets import SecretClient
from azure.servicebus import ServiceBusClient
from azure.ai.contentsafety import ContentSafetyClient
from app.config import Settings

logger = logging.getLogger(__name__)


async def get_mongodb_connection_string_from_keyvault(
    keyvault_client: SecretClient,
    secret_name: str
) -> str:
    """Retrieve MongoDB connection string from Azure Key Vault.

    Args:
        keyvault_client: Key Vault client
        secret_name: Name of the secret containing connection string

    Returns:
        MongoDB connection string

    Raises:
        Exception: If secret retrieval fails
    """
    try:
        logger.info(f"Retrieving MongoDB connection string from Key Vault: {secret_name}")
        secret = keyvault_client.get_secret(secret_name)
        logger.info("Successfully retrieved MongoDB connection string")
        return secret.value
    except Exception as e:
        logger.error(f"Failed to retrieve MongoDB connection string: {str(e)}")
        raise


class AzureClients:
    """Centralized Azure clients manager using Managed Identity."""

    def __init__(self, settings: Settings):
        """Initialize Azure clients with Managed Identity.

        Args:
            settings: Application settings containing Azure resource endpoints
        """
        self.settings = settings
        self._credential: Optional[DefaultAzureCredential] = None
        self._cosmos_client: Optional[CosmosClient] = None
        self._blob_service_client: Optional[BlobServiceClient] = None
        self._keyvault_client: Optional[SecretClient] = None
        self._servicebus_client: Optional[ServiceBusClient] = None
        self._content_safety_client: Optional[ContentSafetyClient] = None

        logger.info("AzureClients initialized with Managed Identity")

    @property
    def credential(self) -> DefaultAzureCredential:
        """Get or create Azure credential (Managed Identity).

        Returns:
            DefaultAzureCredential instance
        """
        if self._credential is None:
            try:
                if self.settings.managed_identity_enabled:
                    # Use Managed Identity (system-assigned or user-assigned)
                    if self.settings.azure_client_id:
                        # User-assigned managed identity
                        logger.info(f"Using user-assigned Managed Identity: {self.settings.azure_client_id}")
                        self._credential = DefaultAzureCredential(
                            managed_identity_client_id=self.settings.azure_client_id
                        )
                    else:
                        # System-assigned managed identity
                        logger.info("Using system-assigned Managed Identity")
                        self._credential = DefaultAzureCredential()
                else:
                    # Fallback for local development (uses Azure CLI, VS Code, etc.)
                    logger.info("Using DefaultAzureCredential for local development")
                    self._credential = DefaultAzureCredential()

                # Test the credential
                token = self._credential.get_token("https://management.azure.com/.default")
                logger.info("Successfully authenticated with Azure")

            except Exception as e:
                logger.error(f"Failed to initialize Azure credential: {str(e)}")
                raise

        return self._credential

    @property
    def cosmos_client(self) -> CosmosClient:
        """Get or create Cosmos DB client.

        Returns:
            CosmosClient instance authenticated with Managed Identity
        """
        if self._cosmos_client is None:
            try:
                logger.info(f"Initializing Cosmos DB client: {self.settings.cosmos_endpoint}")
                self._cosmos_client = CosmosClient(
                    url=self.settings.cosmos_endpoint,
                    credential=self.credential
                )
                logger.info("Cosmos DB client initialized successfully")
            except Exception as e:
                logger.error(f"Failed to initialize Cosmos DB client: {str(e)}")
                raise

        return self._cosmos_client

    @property
    def blob_service_client(self) -> BlobServiceClient:
        """Get or create Blob Storage client.

        Returns:
            BlobServiceClient instance authenticated with Managed Identity
        """
        if self._blob_service_client is None:
            try:
                logger.info(f"Initializing Blob Storage client: {self.settings.storage_account_url}")
                self._blob_service_client = BlobServiceClient(
                    account_url=self.settings.storage_account_url,
                    credential=self.credential
                )
                logger.info("Blob Storage client initialized successfully")
            except Exception as e:
                logger.error(f"Failed to initialize Blob Storage client: {str(e)}")
                raise

        return self._blob_service_client

    @property
    def keyvault_client(self) -> Optional[SecretClient]:
        """Get or create Key Vault client.

        Returns:
            SecretClient instance or None if Key Vault URL not configured
        """
        if self.settings.key_vault_url is None:
            logger.warning("Key Vault URL not configured")
            return None

        if self._keyvault_client is None:
            try:
                logger.info(f"Initializing Key Vault client: {self.settings.key_vault_url}")
                self._keyvault_client = SecretClient(
                    vault_url=self.settings.key_vault_url,
                    credential=self.credential
                )
                logger.info("Key Vault client initialized successfully")
            except Exception as e:
                logger.error(f"Failed to initialize Key Vault client: {str(e)}")
                raise

        return self._keyvault_client

    @property
    def servicebus_client(self) -> Optional[ServiceBusClient]:
        """Get or create Service Bus client.

        Returns:
            ServiceBusClient instance or None if Service Bus not configured
        """
        if self.settings.servicebus_namespace is None:
            logger.warning("Service Bus namespace not configured")
            return None

        if self._servicebus_client is None:
            try:
                fully_qualified_namespace = f"{self.settings.servicebus_namespace}.servicebus.windows.net"
                logger.info(f"Initializing Service Bus client: {fully_qualified_namespace}")
                self._servicebus_client = ServiceBusClient(
                    fully_qualified_namespace=fully_qualified_namespace,
                    credential=self.credential
                )
                logger.info("Service Bus client initialized successfully")
            except Exception as e:
                logger.error(f"Failed to initialize Service Bus client: {str(e)}")
                raise

        return self._servicebus_client

    @property
    def content_safety_client(self) -> Optional[ContentSafetyClient]:
        """Get or create Content Safety client.

        Returns:
            ContentSafetyClient instance or None if not configured
        """
        if self.settings.content_safety_endpoint is None:
            logger.warning("Content Safety endpoint not configured")
            return None

        if self._content_safety_client is None:
            try:
                logger.info(f"Initializing Content Safety client: {self.settings.content_safety_endpoint}")
                self._content_safety_client = ContentSafetyClient(
                    endpoint=self.settings.content_safety_endpoint,
                    credential=self.credential
                )
                logger.info("Content Safety client initialized successfully")
            except Exception as e:
                logger.error(f"Failed to initialize Content Safety client: {str(e)}")
                raise

        return self._content_safety_client

    def get_cosmos_database(self, database_name: Optional[str] = None):
        """Get Cosmos DB database instance.

        Args:
            database_name: Database name (uses settings default if not provided)

        Returns:
            Database proxy instance
        """
        db_name = database_name or self.settings.cosmos_database_name
        return self.cosmos_client.get_database_client(db_name)

    def get_cosmos_container(
        self,
        database_name: Optional[str] = None,
        container_name: Optional[str] = None
    ):
        """Get Cosmos DB container instance.

        Args:
            database_name: Database name (uses settings default if not provided)
            container_name: Container name (uses settings default if not provided)

        Returns:
            Container proxy instance
        """
        db_name = database_name or self.settings.cosmos_database_name
        cont_name = container_name or self.settings.cosmos_container_name
        database = self.get_cosmos_database(db_name)
        return database.get_container_client(cont_name)

    def get_blob_container_client(self, container_name: Optional[str] = None):
        """Get Blob Storage container client.

        Args:
            container_name: Container name (uses settings default if not provided)

        Returns:
            ContainerClient instance
        """
        cont_name = container_name or self.settings.storage_container_name
        return self.blob_service_client.get_container_client(cont_name)

    async def close(self):
        """Close all Azure clients."""
        try:
            if self._cosmos_client:
                self._cosmos_client.__exit__()
                logger.info("Cosmos DB client closed")

            if self._blob_service_client:
                await self._blob_service_client.close()
                logger.info("Blob Storage client closed")

            if self._servicebus_client:
                await self._servicebus_client.close()
                logger.info("Service Bus client closed")

            logger.info("All Azure clients closed successfully")
        except Exception as e:
            logger.error(f"Error closing Azure clients: {str(e)}")


# Global instance (will be initialized in main.py)
azure_clients: Optional[AzureClients] = None


def get_azure_clients() -> AzureClients:
    """Get global Azure clients instance.

    Returns:
        AzureClients instance

    Raises:
        RuntimeError: If Azure clients not initialized
    """
    if azure_clients is None:
        raise RuntimeError("Azure clients not initialized. Call initialize_azure_clients() first.")
    return azure_clients


def initialize_azure_clients(settings: Settings) -> AzureClients:
    """Initialize global Azure clients instance.

    Args:
        settings: Application settings

    Returns:
        AzureClients instance
    """
    global azure_clients
    azure_clients = AzureClients(settings)
    return azure_clients
