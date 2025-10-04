"""
Stripe Payment Service for Subscription Management

Handles subscription lifecycle, checkout sessions, webhooks,
and credit management for all subscription tiers.
"""

import logging
import time
from typing import Any, Dict, List, Optional
from datetime import datetime, timedelta
from enum import Enum

import stripe
from azure.keyvault.secrets.aio import SecretClient
from azure.identity.aio import DefaultAzureCredential

from app.config import Settings

logger = logging.getLogger(__name__)


class SubscriptionTier(str, Enum):
    """Subscription tier options."""
    FREE = "free"
    BASIC = "basic"
    PREMIUM = "premium"


class SubscriptionStatus(str, Enum):
    """Subscription status options."""
    ACTIVE = "active"
    TRIALING = "trialing"
    PAST_DUE = "past_due"
    CANCELED = "canceled"
    UNPAID = "unpaid"
    INCOMPLETE = "incomplete"


class TierConfig:
    """Configuration for subscription tiers."""

    TIERS = {
        SubscriptionTier.FREE: {
            "name": "Free",
            "price_monthly": 0.00,
            "credits_per_month": 10,
            "models": ["flux-schnell"],
            "features": [
                "10 generations per month",
                "FLUX Schnell model",
                "Watermarked images",
                "Community support",
            ],
            "max_concurrent": 1,
            "priority": False,
            "api_access": False,
            "watermark": True,
        },
        SubscriptionTier.BASIC: {
            "name": "Basic",
            "price_monthly": 9.99,
            "credits_per_month": 200,
            "models": ["flux-schnell", "flux-dev"],
            "features": [
                "200 generations per month",
                "FLUX Schnell & Dev models",
                "No watermarks",
                "Priority queue",
                "Email support",
            ],
            "max_concurrent": 3,
            "priority": True,
            "api_access": False,
            "watermark": False,
        },
        SubscriptionTier.PREMIUM: {
            "name": "Premium",
            "price_monthly": 29.99,
            "credits_per_month": -1,  # Unlimited
            "models": ["flux-schnell", "flux-dev", "flux-1.1-pro"],
            "features": [
                "Unlimited generations",
                "All FLUX models including Pro",
                "Fastest processing",
                "API access",
                "Priority support",
                "Commercial license",
            ],
            "max_concurrent": 10,
            "priority": True,
            "api_access": True,
            "watermark": False,
        },
    }

    @classmethod
    def get_config(cls, tier: SubscriptionTier) -> Dict[str, Any]:
        """Get configuration for a tier."""
        return cls.TIERS.get(tier, cls.TIERS[SubscriptionTier.FREE])

    @classmethod
    def get_credits_for_tier(cls, tier: SubscriptionTier) -> int:
        """Get monthly credits for a tier. Returns -1 for unlimited."""
        return cls.get_config(tier)["credits_per_month"]


class StripePaymentError(Exception):
    """Raised when Stripe payment operation fails."""
    pass


class WebhookVerificationError(Exception):
    """Raised when webhook signature verification fails."""
    pass


class StripeService:
    """
    Service for Stripe payment and subscription management.

    Features:
    - Customer creation and management
    - Checkout session creation
    - Billing portal sessions
    - Webhook event handling
    - Subscription lifecycle management
    - Credit allocation and tracking
    - Key Vault integration for API keys
    """

    def __init__(self, settings: Settings):
        self.settings = settings
        self._stripe_secret_key: Optional[str] = None
        self._stripe_webhook_secret: Optional[str] = None
        self._key_cache_time: Optional[float] = None
        self._key_cache_duration = 3600  # Cache keys for 1 hour

        # Price IDs for different tiers (will be loaded from Key Vault or settings)
        self._price_id_basic: Optional[str] = None
        self._price_id_premium: Optional[str] = None

    async def _get_stripe_keys(self) -> Dict[str, str]:
        """
        Get Stripe API keys from Azure Key Vault with caching.

        Returns:
            Dictionary with secret_key, webhook_secret, price IDs
        """
        # Check cache
        if self._stripe_secret_key and self._key_cache_time:
            if time.time() - self._key_cache_time < self._key_cache_duration:
                return {
                    "secret_key": self._stripe_secret_key,
                    "webhook_secret": self._stripe_webhook_secret,
                    "price_id_basic": self._price_id_basic,
                    "price_id_premium": self._price_id_premium,
                }

        # Try Key Vault first
        if self.settings.key_vault_url:
            try:
                keys = await self._get_keys_from_keyvault()
                if keys:
                    self._stripe_secret_key = keys["secret_key"]
                    self._stripe_webhook_secret = keys["webhook_secret"]
                    self._price_id_basic = keys.get("price_id_basic")
                    self._price_id_premium = keys.get("price_id_premium")
                    self._key_cache_time = time.time()
                    return keys
            except Exception as e:
                logger.warning(f"Failed to get keys from Key Vault: {e}")

        # Fall back to environment variables
        keys = {
            "secret_key": getattr(self.settings, "stripe_secret_key", None),
            "webhook_secret": getattr(self.settings, "stripe_webhook_secret", None),
            "price_id_basic": getattr(self.settings, "stripe_price_id_basic", None),
            "price_id_premium": getattr(self.settings, "stripe_price_id_premium", None),
        }

        if not keys["secret_key"]:
            raise ValueError("Stripe secret key not configured")

        self._stripe_secret_key = keys["secret_key"]
        self._stripe_webhook_secret = keys["webhook_secret"]
        self._price_id_basic = keys["price_id_basic"]
        self._price_id_premium = keys["price_id_premium"]
        self._key_cache_time = time.time()

        return keys

    async def _get_keys_from_keyvault(self) -> Optional[Dict[str, str]]:
        """
        Get Stripe keys from Azure Key Vault.

        Returns:
            Dictionary with API keys or None if not found
        """
        if not self.settings.key_vault_url:
            return None

        try:
            credential = DefaultAzureCredential()
            async with SecretClient(
                vault_url=self.settings.key_vault_url,
                credential=credential
            ) as client:
                # Get all required secrets
                secret_key = await client.get_secret("stripe-secret-key")
                webhook_secret = await client.get_secret("stripe-webhook-secret")
                price_basic = await client.get_secret("stripe-price-id-basic")
                price_premium = await client.get_secret("stripe-price-id-premium")

                logger.info("Retrieved Stripe keys from Key Vault")

                return {
                    "secret_key": secret_key.value,
                    "webhook_secret": webhook_secret.value,
                    "price_id_basic": price_basic.value,
                    "price_id_premium": price_premium.value,
                }
        except Exception as e:
            logger.error(f"Error retrieving keys from Key Vault: {e}")
            return None

    async def initialize(self):
        """Initialize Stripe with API key."""
        keys = await self._get_stripe_keys()
        stripe.api_key = keys["secret_key"]

    async def create_customer(
        self,
        user_id: str,
        email: str,
        name: Optional[str] = None,
        metadata: Optional[Dict[str, str]] = None,
    ) -> stripe.Customer:
        """
        Create a Stripe customer.

        Args:
            user_id: User ID from our system
            email: Customer email
            name: Customer name
            metadata: Additional metadata

        Returns:
            Stripe Customer object

        Raises:
            StripePaymentError: If customer creation fails
        """
        try:
            await self.initialize()

            customer_metadata = {"user_id": user_id}
            if metadata:
                customer_metadata.update(metadata)

            customer = stripe.Customer.create(
                email=email,
                name=name,
                metadata=customer_metadata,
            )

            logger.info(f"Created Stripe customer: {customer.id} for user {user_id}")
            return customer

        except stripe.error.StripeError as e:
            logger.error(f"Failed to create Stripe customer: {e}")
            raise StripePaymentError(f"Failed to create customer: {e}")

    async def create_checkout_session(
        self,
        user_id: str,
        tier: SubscriptionTier,
        customer_id: Optional[str] = None,
        success_url: str = None,
        cancel_url: str = None,
    ) -> stripe.checkout.Session:
        """
        Create a Stripe Checkout session for subscription.

        Args:
            user_id: User ID
            tier: Subscription tier (BASIC or PREMIUM)
            customer_id: Existing Stripe customer ID (optional)
            success_url: URL to redirect after successful payment
            cancel_url: URL to redirect after cancellation

        Returns:
            Stripe Checkout Session

        Raises:
            StripePaymentError: If session creation fails
        """
        if tier == SubscriptionTier.FREE:
            raise ValueError("Cannot create checkout session for free tier")

        try:
            await self.initialize()
            keys = await self._get_stripe_keys()

            # Get price ID for tier
            if tier == SubscriptionTier.BASIC:
                price_id = keys["price_id_basic"]
            elif tier == SubscriptionTier.PREMIUM:
                price_id = keys["price_id_premium"]
            else:
                raise ValueError(f"Invalid tier: {tier}")

            if not price_id:
                raise ValueError(f"Price ID not configured for tier: {tier}")

            # Set default URLs if not provided
            if not success_url:
                success_url = f"{self.settings.frontend_url}/subscription/success?session_id={{CHECKOUT_SESSION_ID}}"
            if not cancel_url:
                cancel_url = f"{self.settings.frontend_url}/subscription/cancel"

            # Create session parameters
            session_params = {
                "mode": "subscription",
                "line_items": [
                    {
                        "price": price_id,
                        "quantity": 1,
                    }
                ],
                "success_url": success_url,
                "cancel_url": cancel_url,
                "metadata": {
                    "user_id": user_id,
                    "tier": tier.value,
                },
            }

            # Add customer if provided
            if customer_id:
                session_params["customer"] = customer_id
            else:
                session_params["customer_creation"] = "always"

            # Create checkout session
            session = stripe.checkout.Session.create(**session_params)

            logger.info(
                f"Created checkout session: {session.id} for user {user_id}, tier {tier.value}"
            )

            return session

        except stripe.error.StripeError as e:
            logger.error(f"Failed to create checkout session: {e}")
            raise StripePaymentError(f"Failed to create checkout session: {e}")

    async def create_portal_session(
        self,
        customer_id: str,
        return_url: Optional[str] = None,
    ) -> stripe.billing_portal.Session:
        """
        Create a Stripe billing portal session.

        Args:
            customer_id: Stripe customer ID
            return_url: URL to return to after portal session

        Returns:
            Stripe billing portal Session

        Raises:
            StripePaymentError: If session creation fails
        """
        try:
            await self.initialize()

            if not return_url:
                return_url = f"{self.settings.frontend_url}/subscription"

            session = stripe.billing_portal.Session.create(
                customer=customer_id,
                return_url=return_url,
            )

            logger.info(f"Created portal session for customer: {customer_id}")
            return session

        except stripe.error.StripeError as e:
            logger.error(f"Failed to create portal session: {e}")
            raise StripePaymentError(f"Failed to create portal session: {e}")

    async def get_subscription(
        self,
        subscription_id: str,
    ) -> stripe.Subscription:
        """
        Get subscription details from Stripe.

        Args:
            subscription_id: Stripe subscription ID

        Returns:
            Stripe Subscription object

        Raises:
            StripePaymentError: If retrieval fails
        """
        try:
            await self.initialize()
            subscription = stripe.Subscription.retrieve(subscription_id)
            return subscription

        except stripe.error.StripeError as e:
            logger.error(f"Failed to get subscription: {e}")
            raise StripePaymentError(f"Failed to get subscription: {e}")

    async def cancel_subscription(
        self,
        subscription_id: str,
        at_period_end: bool = True,
    ) -> stripe.Subscription:
        """
        Cancel a subscription.

        Args:
            subscription_id: Stripe subscription ID
            at_period_end: If True, cancel at end of period (default)

        Returns:
            Updated Stripe Subscription

        Raises:
            StripePaymentError: If cancellation fails
        """
        try:
            await self.initialize()

            if at_period_end:
                # Cancel at period end (keep access until then)
                subscription = stripe.Subscription.modify(
                    subscription_id,
                    cancel_at_period_end=True,
                )
                logger.info(f"Subscription {subscription_id} will cancel at period end")
            else:
                # Cancel immediately
                subscription = stripe.Subscription.delete(subscription_id)
                logger.info(f"Subscription {subscription_id} canceled immediately")

            return subscription

        except stripe.error.StripeError as e:
            logger.error(f"Failed to cancel subscription: {e}")
            raise StripePaymentError(f"Failed to cancel subscription: {e}")

    async def verify_webhook_signature(
        self,
        payload: bytes,
        signature: str,
    ) -> stripe.Event:
        """
        Verify Stripe webhook signature.

        Args:
            payload: Raw request body
            signature: Stripe-Signature header value

        Returns:
            Verified Stripe Event

        Raises:
            WebhookVerificationError: If verification fails
        """
        try:
            keys = await self._get_stripe_keys()
            webhook_secret = keys["webhook_secret"]

            if not webhook_secret:
                raise ValueError("Webhook secret not configured")

            event = stripe.Webhook.construct_event(
                payload, signature, webhook_secret
            )

            logger.info(f"Verified webhook event: {event.type} (id: {event.id})")
            return event

        except stripe.error.SignatureVerificationError as e:
            logger.error(f"Webhook signature verification failed: {e}")
            raise WebhookVerificationError(f"Invalid signature: {e}")
        except Exception as e:
            logger.error(f"Webhook verification error: {e}")
            raise WebhookVerificationError(f"Verification failed: {e}")

    async def handle_webhook_event(
        self,
        event: stripe.Event,
        user_repo,
        subscription_repo,
    ) -> Dict[str, Any]:
        """
        Handle Stripe webhook event.

        Args:
            event: Verified Stripe Event
            user_repo: User repository
            subscription_repo: Subscription repository

        Returns:
            Dictionary with processing result
        """
        event_type = event.type
        data = event.data.object

        logger.info(f"Processing webhook event: {event_type}")

        try:
            if event_type == "checkout.session.completed":
                return await self._handle_checkout_completed(
                    data, user_repo, subscription_repo
                )

            elif event_type == "customer.subscription.created":
                return await self._handle_subscription_created(
                    data, user_repo, subscription_repo
                )

            elif event_type == "customer.subscription.updated":
                return await self._handle_subscription_updated(
                    data, user_repo, subscription_repo
                )

            elif event_type == "customer.subscription.deleted":
                return await self._handle_subscription_deleted(
                    data, user_repo, subscription_repo
                )

            elif event_type == "invoice.paid":
                return await self._handle_invoice_paid(
                    data, user_repo, subscription_repo
                )

            elif event_type == "invoice.payment_failed":
                return await self._handle_payment_failed(
                    data, user_repo, subscription_repo
                )

            elif event_type == "customer.subscription.trial_will_end":
                return await self._handle_trial_ending(
                    data, user_repo, subscription_repo
                )

            else:
                logger.info(f"Unhandled webhook event type: {event_type}")
                return {"handled": False, "event_type": event_type}

        except Exception as e:
            logger.error(f"Error handling webhook event {event_type}: {e}", exc_info=True)
            raise

    async def _handle_checkout_completed(
        self, session, user_repo, subscription_repo
    ) -> Dict[str, Any]:
        """Handle checkout.session.completed event."""
        user_id = session.metadata.get("user_id")
        tier = session.metadata.get("tier")
        customer_id = session.customer
        subscription_id = session.subscription

        if not user_id:
            logger.error("No user_id in checkout session metadata")
            return {"error": "Missing user_id"}

        # Update user with Stripe customer ID
        await user_repo.update(user_id, {"stripe_customer_id": customer_id})

        # Get subscription details
        subscription = await self.get_subscription(subscription_id)

        # Create or update subscription record
        tier_config = TierConfig.get_config(SubscriptionTier(tier))
        credits = tier_config["credits_per_month"]

        await subscription_repo.create_or_update(
            user_id=user_id,
            stripe_subscription_id=subscription_id,
            stripe_customer_id=customer_id,
            tier=tier,
            status=subscription.status,
            current_period_start=datetime.fromtimestamp(subscription.current_period_start),
            current_period_end=datetime.fromtimestamp(subscription.current_period_end),
            credits_per_month=credits,
            credits_remaining=credits,
        )

        logger.info(
            f"Checkout completed for user {user_id}: tier={tier}, "
            f"subscription={subscription_id}"
        )

        return {
            "handled": True,
            "user_id": user_id,
            "tier": tier,
            "subscription_id": subscription_id,
        }

    async def _handle_subscription_created(
        self, subscription, user_repo, subscription_repo
    ) -> Dict[str, Any]:
        """Handle customer.subscription.created event."""
        customer_id = subscription.customer
        subscription_id = subscription.id

        # Find user by customer ID
        user = await user_repo.get_by_stripe_customer_id(customer_id)
        if not user:
            logger.error(f"User not found for customer: {customer_id}")
            return {"error": "User not found"}

        # Determine tier from price ID
        price_id = subscription["items"]["data"][0]["price"]["id"]
        keys = await self._get_stripe_keys()

        if price_id == keys["price_id_basic"]:
            tier = SubscriptionTier.BASIC
        elif price_id == keys["price_id_premium"]:
            tier = SubscriptionTier.PREMIUM
        else:
            logger.error(f"Unknown price ID: {price_id}")
            tier = SubscriptionTier.FREE

        tier_config = TierConfig.get_config(tier)
        credits = tier_config["credits_per_month"]

        await subscription_repo.create_or_update(
            user_id=user.id,
            stripe_subscription_id=subscription_id,
            stripe_customer_id=customer_id,
            tier=tier.value,
            status=subscription.status,
            current_period_start=datetime.fromtimestamp(subscription.current_period_start),
            current_period_end=datetime.fromtimestamp(subscription.current_period_end),
            credits_per_month=credits,
            credits_remaining=credits,
        )

        logger.info(f"Subscription created for user {user.id}: {subscription_id}")
        return {"handled": True, "user_id": user.id, "subscription_id": subscription_id}

    async def _handle_subscription_updated(
        self, subscription, user_repo, subscription_repo
    ) -> Dict[str, Any]:
        """Handle customer.subscription.updated event."""
        customer_id = subscription.customer
        subscription_id = subscription.id

        user = await user_repo.get_by_stripe_customer_id(customer_id)
        if not user:
            return {"error": "User not found"}

        # Update subscription status and period
        await subscription_repo.update_by_stripe_id(
            subscription_id,
            {
                "status": subscription.status,
                "current_period_start": datetime.fromtimestamp(
                    subscription.current_period_start
                ),
                "current_period_end": datetime.fromtimestamp(
                    subscription.current_period_end
                ),
                "cancel_at_period_end": subscription.cancel_at_period_end,
            },
        )

        logger.info(f"Subscription updated: {subscription_id}")
        return {"handled": True, "subscription_id": subscription_id}

    async def _handle_subscription_deleted(
        self, subscription, user_repo, subscription_repo
    ) -> Dict[str, Any]:
        """Handle customer.subscription.deleted event."""
        customer_id = subscription.customer
        subscription_id = subscription.id

        user = await user_repo.get_by_stripe_customer_id(customer_id)
        if not user:
            return {"error": "User not found"}

        # Downgrade to free tier
        free_config = TierConfig.get_config(SubscriptionTier.FREE)

        await subscription_repo.update_by_stripe_id(
            subscription_id,
            {
                "tier": SubscriptionTier.FREE.value,
                "status": "canceled",
                "canceled_at": datetime.utcnow(),
                "credits_per_month": free_config["credits_per_month"],
                "credits_remaining": free_config["credits_per_month"],
            },
        )

        logger.info(f"Subscription deleted, user {user.id} downgraded to free")
        return {"handled": True, "user_id": user.id}

    async def _handle_invoice_paid(
        self, invoice, user_repo, subscription_repo
    ) -> Dict[str, Any]:
        """Handle invoice.paid event (renewal)."""
        customer_id = invoice.customer
        subscription_id = invoice.subscription

        if not subscription_id:
            return {"handled": False, "reason": "No subscription"}

        user = await user_repo.get_by_stripe_customer_id(customer_id)
        if not user:
            return {"error": "User not found"}

        # Get current subscription
        sub = await subscription_repo.get_by_stripe_id(subscription_id)
        if not sub:
            return {"error": "Subscription not found"}

        # Reset monthly credits
        tier_config = TierConfig.get_config(SubscriptionTier(sub.tier))
        credits = tier_config["credits_per_month"]

        await subscription_repo.update(
            sub.id,
            {
                "credits_remaining": credits,
                "credits_used_this_period": 0,
            },
        )

        logger.info(
            f"Invoice paid for user {user.id}, credits reset to {credits}"
        )
        return {"handled": True, "user_id": user.id, "credits_reset": credits}

    async def _handle_payment_failed(
        self, invoice, user_repo, subscription_repo
    ) -> Dict[str, Any]:
        """Handle invoice.payment_failed event."""
        customer_id = invoice.customer
        subscription_id = invoice.subscription

        user = await user_repo.get_by_stripe_customer_id(customer_id)
        if not user:
            return {"error": "User not found"}

        # Update subscription status
        await subscription_repo.update_by_stripe_id(
            subscription_id,
            {"status": "past_due"},
        )

        # TODO: Send email notification

        logger.warning(f"Payment failed for user {user.id}, subscription {subscription_id}")
        return {"handled": True, "user_id": user.id, "status": "past_due"}

    async def _handle_trial_ending(
        self, subscription, user_repo, subscription_repo
    ) -> Dict[str, Any]:
        """Handle customer.subscription.trial_will_end event."""
        customer_id = subscription.customer

        user = await user_repo.get_by_stripe_customer_id(customer_id)
        if not user:
            return {"error": "User not found"}

        # TODO: Send trial ending email

        logger.info(f"Trial ending for user {user.id}")
        return {"handled": True, "user_id": user.id}

    def calculate_prorated_credits(
        self,
        old_tier: SubscriptionTier,
        new_tier: SubscriptionTier,
        days_remaining: int,
        days_in_period: int,
    ) -> int:
        """
        Calculate prorated credits when changing plans.

        Args:
            old_tier: Previous subscription tier
            new_tier: New subscription tier
            days_remaining: Days remaining in period
            days_in_period: Total days in billing period

        Returns:
            Prorated credit amount
        """
        old_config = TierConfig.get_config(old_tier)
        new_config = TierConfig.get_config(new_tier)

        old_credits = old_config["credits_per_month"]
        new_credits = new_config["credits_per_month"]

        # Unlimited credits
        if new_credits == -1:
            return -1

        # Calculate prorated amount
        proration_factor = days_remaining / days_in_period
        prorated_credits = int(new_credits * proration_factor)

        return max(prorated_credits, 1)  # At least 1 credit
