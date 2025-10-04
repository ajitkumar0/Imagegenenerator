"""User data models."""
from datetime import datetime
from typing import Optional
from enum import Enum
from pydantic import BaseModel, Field, EmailStr, validator


class AuthProvider(str, Enum):
    """Authentication provider options."""
    EMAIL = "email"
    GOOGLE = "google"
    GITHUB = "github"
    MICROSOFT = "microsoft"


class SubscriptionTier(str, Enum):
    """Subscription tier options."""
    FREE = "free"
    BASIC = "basic"
    PRO = "pro"
    ENTERPRISE = "enterprise"


class UserBase(BaseModel):
    """Base user model with common fields."""
    email: EmailStr
    full_name: Optional[str] = None
    avatar_url: Optional[str] = None
    is_active: bool = True
    is_verified: bool = False


class UserCreate(UserBase):
    """User creation model."""
    password: Optional[str] = Field(None, min_length=8, max_length=100)
    auth_provider: AuthProvider = AuthProvider.EMAIL
    auth_provider_id: Optional[str] = None

    @validator('password')
    def validate_password(cls, v, values):
        """Validate password is required for email auth."""
        if values.get('auth_provider') == AuthProvider.EMAIL and not v:
            raise ValueError('Password is required for email authentication')
        return v


class UserUpdate(BaseModel):
    """User update model."""
    full_name: Optional[str] = None
    avatar_url: Optional[str] = None
    is_active: Optional[bool] = None
    is_verified: Optional[bool] = None
    settings: Optional[dict] = None


class User(UserBase):
    """Complete user model."""
    id: str = Field(..., description="Unique user ID")
    auth_provider: AuthProvider
    auth_provider_id: Optional[str] = None
    hashed_password: Optional[str] = None

    # Subscription information
    subscription_tier: SubscriptionTier = SubscriptionTier.FREE
    stripe_customer_id: Optional[str] = None
    subscription_expires_at: Optional[datetime] = None

    # Usage tracking
    credits_remaining: int = Field(default=10, description="Free credits remaining")
    total_generations: int = Field(default=0, description="Total images generated")
    last_generation_at: Optional[datetime] = None

    # Settings and preferences
    settings: dict = Field(
        default_factory=lambda: {
            "email_notifications": True,
            "default_model": "stable-diffusion",
            "theme": "light"
        }
    )

    # Metadata
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    last_login_at: Optional[datetime] = None

    class Config:
        """Pydantic config."""
        json_schema_extra = {
            "example": {
                "id": "user_123",
                "email": "user@example.com",
                "full_name": "John Doe",
                "auth_provider": "email",
                "subscription_tier": "pro",
                "credits_remaining": 100,
                "total_generations": 50,
                "is_active": True,
                "is_verified": True
            }
        }


class UserInDB(User):
    """User model as stored in database (includes sensitive fields)."""
    hashed_password: Optional[str] = None


class UserPublic(UserBase):
    """Public user model (safe to expose in API)."""
    id: str
    subscription_tier: SubscriptionTier
    credits_remaining: int
    total_generations: int
    created_at: datetime

    class Config:
        """Pydantic config."""
        json_schema_extra = {
            "example": {
                "id": "user_123",
                "email": "user@example.com",
                "full_name": "John Doe",
                "subscription_tier": "pro",
                "credits_remaining": 100,
                "total_generations": 50,
                "is_active": True,
                "is_verified": True,
                "created_at": "2024-01-01T12:00:00Z"
            }
        }
