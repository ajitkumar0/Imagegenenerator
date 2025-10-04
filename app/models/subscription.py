"""Subscription and billing data models."""
from datetime import datetime
from typing import Optional
from enum import Enum
from pydantic import BaseModel, Field
from decimal import Decimal


class SubscriptionStatus(str, Enum):
    """Subscription status options."""
    ACTIVE = "active"
    CANCELLED = "cancelled"
    PAST_DUE = "past_due"
    EXPIRED = "expired"
    TRIALING = "trialing"


class SubscriptionPlan(str, Enum):
    """Subscription plan options."""
    FREE = "free"
    BASIC = "basic"
    PRO = "pro"
    ENTERPRISE = "enterprise"


class BillingInterval(str, Enum):
    """Billing interval options."""
    MONTHLY = "monthly"
    YEARLY = "yearly"


class SubscriptionBase(BaseModel):
    """Base subscription model."""
    user_id: str = Field(..., description="User ID")
    plan: SubscriptionPlan
    status: SubscriptionStatus


class SubscriptionCreate(SubscriptionBase):
    """Subscription creation model."""
    stripe_subscription_id: str = Field(..., description="Stripe subscription ID")
    stripe_price_id: str = Field(..., description="Stripe price ID")
    billing_interval: BillingInterval
    credits_per_month: int = Field(..., description="Monthly credit allocation")


class SubscriptionUpdate(BaseModel):
    """Subscription update model."""
    plan: Optional[SubscriptionPlan] = None
    status: Optional[SubscriptionStatus] = None
    credits_per_month: Optional[int] = None
    current_period_end: Optional[datetime] = None
    cancel_at_period_end: Optional[bool] = None


class Subscription(SubscriptionBase):
    """Complete subscription model."""
    id: str = Field(..., description="Unique subscription ID")

    # Stripe integration
    stripe_subscription_id: str
    stripe_customer_id: str
    stripe_price_id: str

    # Plan details
    billing_interval: BillingInterval
    credits_per_month: int = Field(..., description="Monthly credit allocation")
    credits_used_this_period: int = Field(default=0, description="Credits used in current billing period")

    # Billing information
    current_period_start: datetime = Field(default_factory=datetime.utcnow)
    current_period_end: datetime = Field(..., description="End of current billing period")
    cancel_at_period_end: bool = Field(default=False, description="Cancel at end of period")
    cancelled_at: Optional[datetime] = None

    # Timestamps
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    trial_start: Optional[datetime] = None
    trial_end: Optional[datetime] = None

    class Config:
        """Pydantic config."""
        use_enum_values = True
        json_schema_extra = {
            "example": {
                "id": "sub_123",
                "user_id": "user_123",
                "plan": "pro",
                "status": "active",
                "stripe_subscription_id": "sub_stripe123",
                "stripe_customer_id": "cus_stripe123",
                "stripe_price_id": "price_stripe123",
                "billing_interval": "monthly",
                "credits_per_month": 500,
                "credits_used_this_period": 150,
                "current_period_start": "2024-01-01T00:00:00Z",
                "current_period_end": "2024-02-01T00:00:00Z",
                "cancel_at_period_end": False,
                "created_at": "2024-01-01T00:00:00Z"
            }
        }


class BillingHistory(BaseModel):
    """Billing history model."""
    id: str = Field(..., description="Unique billing record ID")
    user_id: str
    subscription_id: str

    # Stripe invoice details
    stripe_invoice_id: str
    stripe_payment_intent_id: Optional[str] = None

    # Payment information
    amount: Decimal = Field(..., description="Amount in USD")
    currency: str = Field(default="usd")
    status: str = Field(..., description="Payment status")
    invoice_url: Optional[str] = None

    # Timestamps
    created_at: datetime = Field(default_factory=datetime.utcnow)
    paid_at: Optional[datetime] = None

    class Config:
        """Pydantic config."""
        json_schema_extra = {
            "example": {
                "id": "bill_123",
                "user_id": "user_123",
                "subscription_id": "sub_123",
                "stripe_invoice_id": "in_stripe123",
                "amount": "29.99",
                "currency": "usd",
                "status": "paid",
                "invoice_url": "https://invoice.stripe.com/example",
                "created_at": "2024-01-01T00:00:00Z",
                "paid_at": "2024-01-01T00:05:00Z"
            }
        }


class PlanFeatures(BaseModel):
    """Plan features model."""
    plan: SubscriptionPlan
    name: str
    price_monthly: Decimal
    price_yearly: Decimal
    credits_per_month: int
    features: list[str]
    max_concurrent_generations: int
    priority_processing: bool
    advanced_models: bool
    commercial_use: bool

    class Config:
        """Pydantic config."""
        json_schema_extra = {
            "example": {
                "plan": "pro",
                "name": "Pro Plan",
                "price_monthly": "29.99",
                "price_yearly": "299.99",
                "credits_per_month": 500,
                "features": [
                    "500 generations per month",
                    "Priority processing",
                    "All AI models",
                    "Commercial use",
                    "Advanced settings"
                ],
                "max_concurrent_generations": 5,
                "priority_processing": True,
                "advanced_models": True,
                "commercial_use": True
            }
        }


# Plan configuration
PLAN_FEATURES = {
    SubscriptionPlan.FREE: PlanFeatures(
        plan=SubscriptionPlan.FREE,
        name="Free Plan",
        price_monthly=Decimal("0.00"),
        price_yearly=Decimal("0.00"),
        credits_per_month=10,
        features=[
            "10 generations per month",
            "Basic models only",
            "Standard processing",
            "Personal use only"
        ],
        max_concurrent_generations=1,
        priority_processing=False,
        advanced_models=False,
        commercial_use=False
    ),
    SubscriptionPlan.BASIC: PlanFeatures(
        plan=SubscriptionPlan.BASIC,
        name="Basic Plan",
        price_monthly=Decimal("9.99"),
        price_yearly=Decimal("99.99"),
        credits_per_month=100,
        features=[
            "100 generations per month",
            "All standard models",
            "Standard processing",
            "Personal use only"
        ],
        max_concurrent_generations=2,
        priority_processing=False,
        advanced_models=False,
        commercial_use=False
    ),
    SubscriptionPlan.PRO: PlanFeatures(
        plan=SubscriptionPlan.PRO,
        name="Pro Plan",
        price_monthly=Decimal("29.99"),
        price_yearly=Decimal("299.99"),
        credits_per_month=500,
        features=[
            "500 generations per month",
            "Priority processing",
            "All AI models",
            "Commercial use",
            "Advanced settings"
        ],
        max_concurrent_generations=5,
        priority_processing=True,
        advanced_models=True,
        commercial_use=True
    ),
    SubscriptionPlan.ENTERPRISE: PlanFeatures(
        plan=SubscriptionPlan.ENTERPRISE,
        name="Enterprise Plan",
        price_monthly=Decimal("99.99"),
        price_yearly=Decimal("999.99"),
        credits_per_month=2000,
        features=[
            "2000 generations per month",
            "Highest priority processing",
            "All AI models + early access",
            "Commercial use",
            "Dedicated support",
            "Custom integrations"
        ],
        max_concurrent_generations=10,
        priority_processing=True,
        advanced_models=True,
        commercial_use=True
    )
}
