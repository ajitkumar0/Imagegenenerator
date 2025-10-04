"""
API endpoints for subscription management.

Handles Stripe checkout, portal sessions, webhook events,
and subscription status queries.
"""

import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request, Header, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, EmailStr, HttpUrl

from app.core.auth_dependencies import get_current_user
from app.models.user import User
from app.services.payment_service import (
    StripeService,
    SubscriptionTier,
    TierConfig,
    StripePaymentError,
    WebhookVerificationError,
)
from app.repositories.user_repository import UserRepository
from app.repositories.subscription_repository import SubscriptionRepository
from app.services.mongodb_service import get_mongodb_service
from app.config import get_settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/subscriptions", tags=["subscriptions"])

# Dependency injection
settings = get_settings()


# Request/Response Models
class CheckoutRequest(BaseModel):
    """Checkout session creation request."""
    tier: SubscriptionTier
    success_url: Optional[HttpUrl] = None
    cancel_url: Optional[HttpUrl] = None


class CheckoutResponse(BaseModel):
    """Checkout session response."""
    checkout_url: str
    session_id: str


class PortalRequest(BaseModel):
    """Portal session request."""
    return_url: Optional[HttpUrl] = None


class PortalResponse(BaseModel):
    """Portal session response."""
    portal_url: str


class SubscriptionResponse(BaseModel):
    """Subscription details response."""
    tier: str
    status: str
    credits_remaining: int
    credits_per_month: int
    is_unlimited: bool
    current_period_end: str
    cancel_at_period_end: bool
    features: list[str]


class WebhookResponse(BaseModel):
    """Webhook processing response."""
    received: bool
    event_id: str
    event_type: str


# Dependency functions
async def get_stripe_service() -> StripeService:
    """Get StripeService instance."""
    return StripeService(settings)


async def get_user_repository():
    """Get UserRepository instance."""
    mongodb = get_mongodb_service()
    return UserRepository(mongodb.get_database())


async def get_subscription_repository():
    """Get SubscriptionRepository instance."""
    mongodb = get_mongodb_service()
    return SubscriptionRepository(mongodb.get_database())


# Idempotency tracking (simple in-memory, use Redis in production)
_processed_events = set()


def is_event_processed(event_id: str) -> bool:
    """Check if webhook event was already processed."""
    return event_id in _processed_events


def mark_event_processed(event_id: str):
    """Mark webhook event as processed."""
    _processed_events.add(event_id)
    # In production, use Redis with expiration
    # redis.setex(f"webhook:{event_id}", 86400, "1")


@router.post("/checkout", response_model=CheckoutResponse)
async def create_checkout_session(
    request: CheckoutRequest,
    current_user: User = Depends(get_current_user),
    stripe_service: StripeService = Depends(get_stripe_service),
    user_repo: UserRepository = Depends(get_user_repository),
):
    """
    Create Stripe checkout session for subscription.

    Flow:
    1. Validate tier (cannot be FREE)
    2. Get or create Stripe customer
    3. Create checkout session
    4. Return checkout URL for redirect

    Args:
        request: Checkout request with tier and URLs
        current_user: Authenticated user

    Returns:
        Checkout URL and session ID

    Raises:
        HTTPException: If checkout creation fails
    """
    try:
        # Validate tier
        if request.tier == SubscriptionTier.FREE:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot create checkout for free tier",
            )

        # Check if user already has this tier or higher
        user_data = await user_repo.get_by_id(current_user.id)
        if user_data and hasattr(user_data, "subscription"):
            current_tier = user_data.subscription.tier
            if current_tier == request.tier.value:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Already subscribed to {request.tier.value} tier",
                )

        # Get or create Stripe customer
        customer_id = None
        if hasattr(user_data, "stripe_customer_id"):
            customer_id = user_data.stripe_customer_id

        if not customer_id:
            customer = await stripe_service.create_customer(
                user_id=current_user.id,
                email=current_user.email,
                name=getattr(current_user, "name", None),
            )
            customer_id = customer.id

            # Update user with customer ID
            await user_repo.update(current_user.id, {"stripe_customer_id": customer_id})

        # Create checkout session
        session = await stripe_service.create_checkout_session(
            user_id=current_user.id,
            tier=request.tier,
            customer_id=customer_id,
            success_url=str(request.success_url) if request.success_url else None,
            cancel_url=str(request.cancel_url) if request.cancel_url else None,
        )

        logger.info(
            f"Checkout session created for user {current_user.id}: "
            f"session={session.id}, tier={request.tier.value}"
        )

        return CheckoutResponse(
            checkout_url=session.url,
            session_id=session.id,
        )

    except StripePaymentError as e:
        logger.error(f"Stripe error creating checkout: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Payment service error: {str(e)}",
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.post("/portal", response_model=PortalResponse)
async def create_portal_session(
    request: PortalRequest,
    current_user: User = Depends(get_current_user),
    stripe_service: StripeService = Depends(get_stripe_service),
    user_repo: UserRepository = Depends(get_user_repository),
):
    """
    Create Stripe billing portal session.

    Allows users to:
    - Update payment method
    - Change subscription plan
    - Cancel subscription
    - View invoices
    - Update billing info

    Args:
        request: Portal request with return URL
        current_user: Authenticated user

    Returns:
        Portal URL for redirect

    Raises:
        HTTPException: If portal creation fails
    """
    try:
        # Get user's Stripe customer ID
        user_data = await user_repo.get_by_id(current_user.id)

        if not user_data or not hasattr(user_data, "stripe_customer_id"):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No payment information found. Please subscribe first.",
            )

        customer_id = user_data.stripe_customer_id

        # Create portal session
        session = await stripe_service.create_portal_session(
            customer_id=customer_id,
            return_url=str(request.return_url) if request.return_url else None,
        )

        logger.info(f"Portal session created for user {current_user.id}")

        return PortalResponse(portal_url=session.url)

    except StripePaymentError as e:
        logger.error(f"Stripe error creating portal: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Payment service error: {str(e)}",
        )


@router.get("", response_model=SubscriptionResponse)
async def get_subscription(
    current_user: User = Depends(get_current_user),
    subscription_repo: SubscriptionRepository = Depends(get_subscription_repository),
):
    """
    Get current user's subscription details.

    Returns:
        Subscription details including tier, credits, and features

    Raises:
        HTTPException: If subscription not found
    """
    try:
        subscription = await subscription_repo.get_by_user_id(current_user.id)

        if not subscription:
            # Return free tier as default
            free_config = TierConfig.get_config(SubscriptionTier.FREE)
            return SubscriptionResponse(
                tier=SubscriptionTier.FREE.value,
                status="active",
                credits_remaining=free_config["credits_per_month"],
                credits_per_month=free_config["credits_per_month"],
                is_unlimited=False,
                current_period_end="",
                cancel_at_period_end=False,
                features=free_config["features"],
            )

        # Get tier configuration
        tier_config = TierConfig.get_config(SubscriptionTier(subscription.tier))
        is_unlimited = tier_config["credits_per_month"] == -1

        return SubscriptionResponse(
            tier=subscription.tier,
            status=subscription.status,
            credits_remaining=subscription.credits_remaining if not is_unlimited else -1,
            credits_per_month=subscription.credits_per_month,
            is_unlimited=is_unlimited,
            current_period_end=subscription.current_period_end.isoformat(),
            cancel_at_period_end=subscription.cancel_at_period_end,
            features=tier_config["features"],
        )

    except Exception as e:
        logger.error(f"Error getting subscription: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get subscription details",
        )


@router.delete("")
async def cancel_subscription(
    at_period_end: bool = True,
    current_user: User = Depends(get_current_user),
    stripe_service: StripeService = Depends(get_stripe_service),
    subscription_repo: SubscriptionRepository = Depends(get_subscription_repository),
):
    """
    Cancel current subscription.

    Args:
        at_period_end: If True, cancel at end of period (default)
        current_user: Authenticated user

    Returns:
        Cancellation confirmation

    Raises:
        HTTPException: If cancellation fails
    """
    try:
        subscription = await subscription_repo.get_by_user_id(current_user.id)

        if not subscription:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No active subscription found",
            )

        if subscription.tier == SubscriptionTier.FREE.value:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot cancel free tier",
            )

        # Cancel in Stripe
        await stripe_service.cancel_subscription(
            subscription.stripe_subscription_id,
            at_period_end=at_period_end,
        )

        # Update local record
        update_data = {"cancel_at_period_end": True}
        if not at_period_end:
            update_data["status"] = "canceled"
            update_data["canceled_at"] = None  # Will be set by webhook

        await subscription_repo.update(subscription.id, update_data)

        logger.info(
            f"Subscription canceled for user {current_user.id}: "
            f"at_period_end={at_period_end}"
        )

        return {
            "success": True,
            "message": "Subscription canceled"
            if not at_period_end
            else "Subscription will cancel at period end",
            "cancel_at_period_end": at_period_end,
        }

    except StripePaymentError as e:
        logger.error(f"Stripe error canceling subscription: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Payment service error: {str(e)}",
        )


@router.post("/webhook", response_model=WebhookResponse)
async def stripe_webhook(
    request: Request,
    stripe_signature: str = Header(None, alias="stripe-signature"),
    stripe_service: StripeService = Depends(get_stripe_service),
    user_repo: UserRepository = Depends(get_user_repository),
    subscription_repo: SubscriptionRepository = Depends(get_subscription_repository),
):
    """
    Handle Stripe webhook events.

    This endpoint receives events from Stripe when:
    - Checkout is completed
    - Subscription is created/updated/deleted
    - Invoice is paid or payment fails
    - Trial is ending

    Security:
    - Verifies webhook signature
    - Implements idempotency to prevent duplicate processing

    Args:
        request: Raw request with webhook payload
        stripe_signature: Stripe signature header

    Returns:
        Webhook processing confirmation

    Raises:
        HTTPException: If verification or processing fails
    """
    try:
        # Get raw body for signature verification
        payload = await request.body()

        if not stripe_signature:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Missing Stripe signature",
            )

        # Verify webhook signature
        try:
            event = await stripe_service.verify_webhook_signature(
                payload, stripe_signature
            )
        except WebhookVerificationError as e:
            logger.error(f"Webhook verification failed: {e}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid signature",
            )

        # Check idempotency
        if is_event_processed(event.id):
            logger.info(f"Webhook event already processed: {event.id}")
            return WebhookResponse(
                received=True,
                event_id=event.id,
                event_type=event.type,
            )

        # Handle event
        result = await stripe_service.handle_webhook_event(
            event, user_repo, subscription_repo
        )

        # Mark as processed
        mark_event_processed(event.id)

        logger.info(
            f"Webhook processed: {event.type} (id: {event.id}), result: {result}"
        )

        return WebhookResponse(
            received=True,
            event_id=event.id,
            event_type=event.type,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error processing webhook: {e}", exc_info=True)
        # Return 500 to trigger Stripe retry
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Webhook processing failed",
        )


@router.get("/tiers")
async def get_subscription_tiers():
    """
    Get available subscription tiers and their features.

    Returns:
        List of all subscription tiers with pricing and features
    """
    tiers = []

    for tier in [SubscriptionTier.FREE, SubscriptionTier.BASIC, SubscriptionTier.PREMIUM]:
        config = TierConfig.get_config(tier)
        tiers.append(
            {
                "tier": tier.value,
                "name": config["name"],
                "price_monthly": config["price_monthly"],
                "credits_per_month": config["credits_per_month"],
                "is_unlimited": config["credits_per_month"] == -1,
                "models": config["models"],
                "features": config["features"],
                "max_concurrent": config["max_concurrent"],
                "priority": config["priority"],
                "api_access": config["api_access"],
                "watermark": config["watermark"],
            }
        )

    return {"tiers": tiers}


@router.get("/usage")
async def get_usage_stats(
    current_user: User = Depends(get_current_user),
    subscription_repo: SubscriptionRepository = Depends(get_subscription_repository),
):
    """
    Get current usage statistics for authenticated user.

    Returns:
        Usage stats including credits used and remaining
    """
    try:
        subscription = await subscription_repo.get_by_user_id(current_user.id)

        if not subscription:
            free_config = TierConfig.get_config(SubscriptionTier.FREE)
            return {
                "tier": SubscriptionTier.FREE.value,
                "credits_remaining": free_config["credits_per_month"],
                "credits_used": 0,
                "credits_per_month": free_config["credits_per_month"],
                "is_unlimited": False,
                "usage_percentage": 0,
            }

        tier_config = TierConfig.get_config(SubscriptionTier(subscription.tier))
        is_unlimited = tier_config["credits_per_month"] == -1

        credits_used = (
            subscription.credits_per_month - subscription.credits_remaining
            if not is_unlimited
            else 0
        )

        usage_percentage = (
            (credits_used / subscription.credits_per_month * 100)
            if subscription.credits_per_month > 0
            else 0
        )

        return {
            "tier": subscription.tier,
            "credits_remaining": subscription.credits_remaining if not is_unlimited else -1,
            "credits_used": credits_used if not is_unlimited else -1,
            "credits_per_month": subscription.credits_per_month,
            "is_unlimited": is_unlimited,
            "usage_percentage": usage_percentage if not is_unlimited else 0,
            "period_end": subscription.current_period_end.isoformat(),
        }

    except Exception as e:
        logger.error(f"Error getting usage stats: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get usage statistics",
        )
