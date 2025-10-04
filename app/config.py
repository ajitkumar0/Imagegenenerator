"""Application configuration using pydantic-settings with Azure Key Vault integration."""
from functools import lru_cache
from typing import Optional
from pydantic import Field, validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="allow"
    )

    # Application Settings
    app_name: str = "ImageGenerator API"
    app_version: str = "1.0.0"
    environment: str = Field(default="development", alias="ENVIRONMENT")
    debug: bool = Field(default=False, alias="DEBUG")

    # API Settings
    api_v1_prefix: str = "/api/v1"
    allowed_hosts: list[str] = Field(default=["*"], alias="ALLOWED_HOSTS")

    # CORS Settings
    cors_origins: list[str] = Field(
        default=[
            "http://localhost:3000",
            "https://localhost:3000",
        ],
        alias="CORS_ORIGINS"
    )
    cors_allow_credentials: bool = True
    cors_allow_methods: list[str] = ["*"]
    cors_allow_headers: list[str] = ["*"]

    # Azure Cosmos DB Settings (MongoDB API)
    mongodb_connection_string_secret: str = Field(
        default="mongodb-connection-string",
        alias="MONGODB_CONNECTION_STRING_SECRET"
    )
    mongodb_database_name: str = Field(default="imagegenerator", alias="MONGODB_DATABASE_NAME")

    # Legacy Cosmos DB SQL API Settings (keep for backward compatibility)
    cosmos_endpoint: Optional[str] = Field(None, alias="AZURE_COSMOS_ENDPOINT")
    cosmos_database_name: str = Field(default="imagegenerator", alias="COSMOS_DATABASE_NAME")
    cosmos_container_name: str = Field(default="images", alias="COSMOS_CONTAINER_NAME")

    # Azure Blob Storage Settings
    storage_account_url: str = Field(..., alias="AZURE_STORAGE_ACCOUNT_URL")
    blob_container_name: str = Field(default="imagegen-images", alias="BLOB_CONTAINER_NAME")
    storage_container_name: str = Field(default="images", alias="STORAGE_CONTAINER_NAME")  # Legacy

    # Azure CDN Settings (Optional)
    cdn_endpoint_url: Optional[str] = Field(default=None, alias="AZURE_CDN_ENDPOINT_URL")
    cdn_profile_name: Optional[str] = Field(default=None, alias="AZURE_CDN_PROFILE_NAME")

    # Blob Storage Lifecycle Settings
    lifecycle_cool_tier_days: int = Field(default=30, alias="LIFECYCLE_COOL_TIER_DAYS")
    lifecycle_archive_tier_days: int = Field(default=90, alias="LIFECYCLE_ARCHIVE_TIER_DAYS")
    lifecycle_delete_days: int = Field(default=365, alias="LIFECYCLE_DELETE_DAYS")

    # Azure Key Vault Settings (Optional)
    key_vault_url: Optional[str] = Field(default=None, alias="AZURE_KEY_VAULT_URL")

    # Azure Service Bus Settings
    servicebus_namespace: str = Field(..., alias="AZURE_SERVICEBUS_NAMESPACE")
    servicebus_queue_name: str = Field(default="image-generation-queue", alias="SERVICEBUS_QUEUE_NAME")

    # Azure Content Safety Settings (Optional)
    content_safety_endpoint: Optional[str] = Field(default=None, alias="AZURE_CONTENT_SAFETY_ENDPOINT")

    # Application Insights Settings
    appinsights_connection_string: Optional[str] = Field(
        default=None,
        alias="APPLICATIONINSIGHTS_CONNECTION_STRING"
    )

    # Azure AD B2C Settings
    azure_ad_b2c_tenant: str = Field(..., alias="AZURE_AD_B2C_TENANT")
    azure_ad_b2c_client_id: str = Field(..., alias="AZURE_AD_B2C_CLIENT_ID")
    azure_ad_b2c_policy_name: str = Field(
        default="B2C_1_signupsignin",
        alias="AZURE_AD_B2C_POLICY_NAME"
    )
    azure_ad_b2c_client_secret: Optional[str] = Field(default=None, alias="AZURE_AD_B2C_CLIENT_SECRET")

    # Authentication Settings
    secret_key: str = Field(
        default="your-secret-key-change-in-production",
        alias="SECRET_KEY"
    )
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30

    # Logging Settings
    log_level: str = Field(default="INFO", alias="LOG_LEVEL")
    log_format: str = "json"  # json or text

    # Rate Limiting
    rate_limit_enabled: bool = Field(default=True, alias="RATE_LIMIT_ENABLED")
    rate_limit_requests: int = Field(default=100, alias="RATE_LIMIT_REQUESTS")
    rate_limit_window: int = Field(default=60, alias="RATE_LIMIT_WINDOW")  # seconds

    # Azure Managed Identity Settings
    azure_client_id: Optional[str] = Field(default=None, alias="AZURE_CLIENT_ID")
    managed_identity_enabled: bool = Field(default=True, alias="MANAGED_IDENTITY_ENABLED")

    # Replicate API Settings
    replicate_api_token: str = Field(..., alias="REPLICATE_API_TOKEN")

    # Worker Settings
    worker_max_concurrent_jobs: int = Field(default=5, alias="WORKER_MAX_CONCURRENT_JOBS")

    @validator("cors_origins", pre=True)
    def parse_cors_origins(cls, v):
        """Parse CORS origins from string or list."""
        if isinstance(v, str):
            return [origin.strip() for origin in v.split(",")]
        return v

    @validator("allowed_hosts", pre=True)
    def parse_allowed_hosts(cls, v):
        """Parse allowed hosts from string or list."""
        if isinstance(v, str):
            return [host.strip() for host in v.split(",")]
        return v

    class Config:
        """Pydantic config."""
        case_sensitive = False


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()


# Global settings instance
settings = get_settings()
