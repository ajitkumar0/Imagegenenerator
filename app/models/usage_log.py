"""Usage log data models for analytics and rate limiting."""
from datetime import datetime
from typing import Optional
from enum import Enum
from pydantic import BaseModel, Field


class ActionType(str, Enum):
    """Action type options for usage tracking."""
    IMAGE_GENERATION = "image_generation"
    API_REQUEST = "api_request"
    FILE_UPLOAD = "file_upload"
    FILE_DOWNLOAD = "file_download"
    SUBSCRIPTION_CHANGE = "subscription_change"
    LOGIN = "login"
    LOGOUT = "logout"


class UsageLogBase(BaseModel):
    """Base usage log model."""
    user_id: str = Field(..., description="User ID")
    action_type: ActionType
    resource_id: Optional[str] = Field(None, description="Related resource ID (e.g., generation_id)")


class UsageLogCreate(UsageLogBase):
    """Usage log creation model."""
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    metadata: Optional[dict] = Field(default_factory=dict, description="Additional metadata")


class UsageLog(UsageLogBase):
    """Complete usage log model."""
    id: str = Field(..., description="Unique log ID")

    # Request details
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None

    # Metadata
    metadata: dict = Field(default_factory=dict, description="Additional metadata")

    # Credits tracking
    credits_used: int = Field(default=0, description="Credits consumed by this action")

    # Performance metrics
    response_time_ms: Optional[int] = None
    status_code: Optional[int] = None

    # Timestamp (for TTL and analytics)
    created_at: datetime = Field(default_factory=datetime.utcnow)

    # TTL - automatically delete after 90 days
    expires_at: datetime = Field(
        ...,
        description="Expiration date for automatic deletion"
    )

    class Config:
        """Pydantic config."""
        use_enum_values = True
        json_schema_extra = {
            "example": {
                "id": "log_123",
                "user_id": "user_123",
                "action_type": "image_generation",
                "resource_id": "gen_123",
                "ip_address": "192.168.1.1",
                "user_agent": "Mozilla/5.0...",
                "credits_used": 1,
                "response_time_ms": 5000,
                "status_code": 200,
                "metadata": {"model": "stable-diffusion-xl"},
                "created_at": "2024-01-01T12:00:00Z",
                "expires_at": "2024-04-01T12:00:00Z"
            }
        }


class RateLimitLog(BaseModel):
    """Rate limit tracking model."""
    id: str = Field(..., description="Unique rate limit log ID")
    user_id: str
    endpoint: str = Field(..., description="API endpoint")

    # Rate limit tracking
    request_count: int = Field(default=1, description="Number of requests in window")
    window_start: datetime = Field(default_factory=datetime.utcnow)
    window_end: datetime = Field(..., description="End of rate limit window")

    # Metadata
    last_request_at: datetime = Field(default_factory=datetime.utcnow)
    is_blocked: bool = Field(default=False, description="Whether user is currently blocked")

    # TTL - automatically delete after 1 hour
    expires_at: datetime = Field(..., description="Expiration date for automatic deletion")

    class Config:
        """Pydantic config."""
        json_schema_extra = {
            "example": {
                "id": "rate_123",
                "user_id": "user_123",
                "endpoint": "/api/v1/generations",
                "request_count": 50,
                "window_start": "2024-01-01T12:00:00Z",
                "window_end": "2024-01-01T13:00:00Z",
                "last_request_at": "2024-01-01T12:30:00Z",
                "is_blocked": False,
                "expires_at": "2024-01-01T14:00:00Z"
            }
        }


class UsageStats(BaseModel):
    """Usage statistics model."""
    user_id: str
    period_start: datetime
    period_end: datetime

    # Action counts
    total_actions: int
    image_generations: int
    api_requests: int
    file_uploads: int
    file_downloads: int

    # Credits tracking
    total_credits_used: int
    remaining_credits: int

    # Performance metrics
    average_response_time_ms: float
    total_processing_time_ms: int

    class Config:
        """Pydantic config."""
        json_schema_extra = {
            "example": {
                "user_id": "user_123",
                "period_start": "2024-01-01T00:00:00Z",
                "period_end": "2024-02-01T00:00:00Z",
                "total_actions": 250,
                "image_generations": 100,
                "api_requests": 500,
                "file_uploads": 25,
                "file_downloads": 75,
                "total_credits_used": 100,
                "remaining_credits": 400,
                "average_response_time_ms": 5000.0,
                "total_processing_time_ms": 500000
            }
        }
