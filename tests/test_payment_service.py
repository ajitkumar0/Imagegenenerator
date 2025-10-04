"""
Test suite for Stripe Payment Service

Tests cover:
- Customer creation
- Checkout session creation
- Portal session creation
- Webhook handling
- Credit management
- Subscription lifecycle
"""

import pytest
from unittest.mock import Mock, AsyncMock, patch, MagicMock
from datetime import datetime, timedelta

import stripe

from app.services.payment_service import (
    StripeService,
    SubscriptionTier,
    TierConfig,
    StripePaymentError,
    WebhookVerificationError,
)
from app.config import Settings


@pytest.fixture
def mock_settings():
    """Create mock settings."""
    settings = Mock(spec=Settings)
    settings.stripe_secret_key = "sk_test_123456"
    settings.stripe_webhook_secret = "whsec_test_123456"
    settings.stripe_price_id_basic = "price_basic_123"
    settings.stripe_price_id_premium = "price_premium_123"
    settings.key_vault_url = None
    settings.frontend_url = "https://example.com"
    return settings


@pytest.fixture
def payment_service(mock_settings):
    """Create StripeService instance."""
    return StripeService(mock_settings)


@pytest.fixture
def mock_stripe_customer():
    """Create mock Stripe customer."""
    customer = Mock()
    customer.id = "cus_test123"
    customer.email = "test@example.com"
    customer.name = "Test User"
    return customer


@pytest.fixture
def mock_checkout_session():
    """Create mock checkout session."""
    session = Mock()
    session.id = "cs_test123"
    session.url = "https://checkout.stripe.com/test"
    session.customer = "cus_test123"
    session.subscription = "sub_test123"
    session.metadata = {"user_id": "user123", "tier": "basic"}
    return session


@pytest.fixture
def mock_subscription():
    """Create mock Stripe subscription."""
    subscription = Mock()
    subscription.id = "sub_test123"
    subscription.customer = "cus_test123"
    subscription.status = "active"
    subscription.current_period_start = int(datetime.utcnow().timestamp())
    subscription.current_period_end = int(
        (datetime.utcnow() + timedelta(days=30)).timestamp()
    )
    subscription.cancel_at_period_end = False
    subscription.items = {
        "data": [{"price": {"id": "price_basic_123"}}]
    }
    return subscription


class TestTierConfig:
    """Test tier configuration."""

    def test_get_config_free(self):
        """Test free tier configuration."""
        config = TierConfig.get_config(SubscriptionTier.FREE)
        assert config["price_monthly"] == 0.00
        assert config["credits_per_month"] == 10
        assert "flux-schnell" in config["models"]
        assert config["watermark"] is True

    def test_get_config_basic(self):
        """Test basic tier configuration."""
        config = TierConfig.get_config(SubscriptionTier.BASIC)
        assert config["price_monthly"] == 9.99
        assert config["credits_per_month"] == 200
        assert "flux-dev" in config["models"]
        assert config["watermark"] is False

    def test_get_config_premium(self):
        """Test premium tier configuration."""
        config = TierConfig.get_config(SubscriptionTier.PREMIUM)
        assert config["price_monthly"] == 29.99
        assert config["credits_per_month"] == -1  # Unlimited
        assert "flux-1.1-pro" in config["models"]
        assert config["api_access"] is True

    def test_get_credits_for_tier(self):
        """Test getting credits for different tiers."""
        assert TierConfig.get_credits_for_tier(SubscriptionTier.FREE) == 10
        assert TierConfig.get_credits_for_tier(SubscriptionTier.BASIC) == 200
        assert TierConfig.get_credits_for_tier(SubscriptionTier.PREMIUM) == -1


class TestCustomerCreation:
    """Test customer creation."""

    @pytest.mark.asyncio
    async def test_create_customer_success(
        self, payment_service, mock_stripe_customer
    ):
        """Test successful customer creation."""
        with patch.object(payment_service, "initialize", return_value=None):
            with patch("stripe.Customer.create", return_value=mock_stripe_customer):
                customer = await payment_service.create_customer(
                    user_id="user123",
                    email="test@example.com",
                    name="Test User",
                )

                assert customer.id == "cus_test123"
                assert customer.email == "test@example.com"

    @pytest.mark.asyncio
    async def test_create_customer_with_metadata(
        self, payment_service, mock_stripe_customer
    ):
        """Test customer creation with metadata."""
        with patch.object(payment_service, "initialize", return_value=None):
            with patch("stripe.Customer.create", return_value=mock_stripe_customer):
                customer = await payment_service.create_customer(
                    user_id="user123",
                    email="test@example.com",
                    metadata={"plan": "premium"},
                )

                assert customer.id == "cus_test123"

    @pytest.mark.asyncio
    async def test_create_customer_stripe_error(self, payment_service):
        """Test customer creation with Stripe error."""
        with patch.object(payment_service, "initialize", return_value=None):
            with patch(
                "stripe.Customer.create",
                side_effect=stripe.error.StripeError("API error"),
            ):
                with pytest.raises(StripePaymentError):
                    await payment_service.create_customer(
                        user_id="user123",
                        email="test@example.com",
                    )


class TestCheckoutSession:
    """Test checkout session creation."""

    @pytest.mark.asyncio
    async def test_create_checkout_session_basic(
        self, payment_service, mock_checkout_session
    ):
        """Test creating checkout session for basic tier."""
        with patch.object(payment_service, "initialize", return_value=None):
            with patch.object(
                payment_service, "_get_stripe_keys", return_value={
                    "secret_key": "sk_test",
                    "webhook_secret": "whsec_test",
                    "price_id_basic": "price_basic_123",
                    "price_id_premium": "price_premium_123",
                }
            ):
                with patch(
                    "stripe.checkout.Session.create",
                    return_value=mock_checkout_session,
                ):
                    session = await payment_service.create_checkout_session(
                        user_id="user123",
                        tier=SubscriptionTier.BASIC,
                        customer_id="cus_test123",
                    )

                    assert session.id == "cs_test123"
                    assert session.url is not None

    @pytest.mark.asyncio
    async def test_create_checkout_session_premium(
        self, payment_service, mock_checkout_session
    ):
        """Test creating checkout session for premium tier."""
        with patch.object(payment_service, "initialize", return_value=None):
            with patch.object(
                payment_service, "_get_stripe_keys", return_value={
                    "secret_key": "sk_test",
                    "webhook_secret": "whsec_test",
                    "price_id_basic": "price_basic_123",
                    "price_id_premium": "price_premium_123",
                }
            ):
                with patch(
                    "stripe.checkout.Session.create",
                    return_value=mock_checkout_session,
                ):
                    session = await payment_service.create_checkout_session(
                        user_id="user123",
                        tier=SubscriptionTier.PREMIUM,
                    )

                    assert session.id == "cs_test123"

    @pytest.mark.asyncio
    async def test_create_checkout_session_free_tier_error(self, payment_service):
        """Test error when creating checkout for free tier."""
        with pytest.raises(ValueError, match="Cannot create checkout"):
            await payment_service.create_checkout_session(
                user_id="user123",
                tier=SubscriptionTier.FREE,
            )


class TestPortalSession:
    """Test billing portal session."""

    @pytest.mark.asyncio
    async def test_create_portal_session_success(self, payment_service):
        """Test successful portal session creation."""
        mock_portal_session = Mock()
        mock_portal_session.url = "https://billing.stripe.com/portal/test"

        with patch.object(payment_service, "initialize", return_value=None):
            with patch(
                "stripe.billing_portal.Session.create",
                return_value=mock_portal_session,
            ):
                session = await payment_service.create_portal_session(
                    customer_id="cus_test123"
                )

                assert session.url is not None

    @pytest.mark.asyncio
    async def test_create_portal_session_with_return_url(self, payment_service):
        """Test portal session with custom return URL."""
        mock_portal_session = Mock()
        mock_portal_session.url = "https://billing.stripe.com/portal/test"

        with patch.object(payment_service, "initialize", return_value=None):
            with patch(
                "stripe.billing_portal.Session.create",
                return_value=mock_portal_session,
            ):
                session = await payment_service.create_portal_session(
                    customer_id="cus_test123",
                    return_url="https://example.com/dashboard",
                )

                assert session.url is not None


class TestSubscriptionManagement:
    """Test subscription management."""

    @pytest.mark.asyncio
    async def test_get_subscription_success(
        self, payment_service, mock_subscription
    ):
        """Test getting subscription details."""
        with patch.object(payment_service, "initialize", return_value=None):
            with patch(
                "stripe.Subscription.retrieve", return_value=mock_subscription
            ):
                subscription = await payment_service.get_subscription("sub_test123")

                assert subscription.id == "sub_test123"
                assert subscription.status == "active"

    @pytest.mark.asyncio
    async def test_cancel_subscription_at_period_end(
        self, payment_service, mock_subscription
    ):
        """Test canceling subscription at period end."""
        with patch.object(payment_service, "initialize", return_value=None):
            with patch(
                "stripe.Subscription.modify", return_value=mock_subscription
            ):
                subscription = await payment_service.cancel_subscription(
                    "sub_test123", at_period_end=True
                )

                assert subscription.id == "sub_test123"

    @pytest.mark.asyncio
    async def test_cancel_subscription_immediately(
        self, payment_service, mock_subscription
    ):
        """Test canceling subscription immediately."""
        with patch.object(payment_service, "initialize", return_value=None):
            with patch(
                "stripe.Subscription.delete", return_value=mock_subscription
            ):
                subscription = await payment_service.cancel_subscription(
                    "sub_test123", at_period_end=False
                )

                assert subscription.id == "sub_test123"


class TestWebhookVerification:
    """Test webhook signature verification."""

    @pytest.mark.asyncio
    async def test_verify_webhook_success(self, payment_service):
        """Test successful webhook verification."""
        mock_event = Mock()
        mock_event.id = "evt_test123"
        mock_event.type = "checkout.session.completed"

        with patch.object(
            payment_service, "_get_stripe_keys", return_value={
                "secret_key": "sk_test",
                "webhook_secret": "whsec_test123",
                "price_id_basic": "price_basic",
                "price_id_premium": "price_premium",
            }
        ):
            with patch(
                "stripe.Webhook.construct_event", return_value=mock_event
            ):
                event = await payment_service.verify_webhook_signature(
                    b"payload", "signature"
                )

                assert event.id == "evt_test123"
                assert event.type == "checkout.session.completed"

    @pytest.mark.asyncio
    async def test_verify_webhook_invalid_signature(self, payment_service):
        """Test webhook verification with invalid signature."""
        with patch.object(
            payment_service, "_get_stripe_keys", return_value={
                "secret_key": "sk_test",
                "webhook_secret": "whsec_test123",
                "price_id_basic": "price_basic",
                "price_id_premium": "price_premium",
            }
        ):
            with patch(
                "stripe.Webhook.construct_event",
                side_effect=stripe.error.SignatureVerificationError(
                    "Invalid signature", "sig_header"
                ),
            ):
                with pytest.raises(WebhookVerificationError):
                    await payment_service.verify_webhook_signature(
                        b"payload", "invalid_signature"
                    )


class TestWebhookHandling:
    """Test webhook event handling."""

    @pytest.mark.asyncio
    async def test_handle_checkout_completed(self, payment_service, mock_subscription):
        """Test handling checkout.session.completed event."""
        mock_event = Mock()
        mock_event.type = "checkout.session.completed"
        mock_event.data = Mock()
        mock_event.data.object = Mock()
        mock_event.data.object.metadata = {"user_id": "user123", "tier": "basic"}
        mock_event.data.object.customer = "cus_test123"
        mock_event.data.object.subscription = "sub_test123"

        mock_user_repo = AsyncMock()
        mock_subscription_repo = AsyncMock()

        with patch.object(
            payment_service, "get_subscription", return_value=mock_subscription
        ):
            result = await payment_service.handle_webhook_event(
                mock_event, mock_user_repo, mock_subscription_repo
            )

            assert result["handled"] is True
            assert result["user_id"] == "user123"
            assert result["tier"] == "basic"

    @pytest.mark.asyncio
    async def test_handle_invoice_paid(self, payment_service):
        """Test handling invoice.paid event."""
        mock_event = Mock()
        mock_event.type = "invoice.paid"
        mock_event.data = Mock()
        mock_event.data.object = Mock()
        mock_event.data.object.customer = "cus_test123"
        mock_event.data.object.subscription = "sub_test123"

        mock_user = Mock()
        mock_user.id = "user123"

        mock_sub = Mock()
        mock_sub.id = "sub_local123"
        mock_sub.tier = "basic"

        mock_user_repo = AsyncMock()
        mock_user_repo.get_by_stripe_customer_id = AsyncMock(return_value=mock_user)

        mock_subscription_repo = AsyncMock()
        mock_subscription_repo.get_by_stripe_id = AsyncMock(return_value=mock_sub)

        result = await payment_service.handle_webhook_event(
            mock_event, mock_user_repo, mock_subscription_repo
        )

        assert result["handled"] is True
        assert "credits_reset" in result


class TestCreditCalculation:
    """Test credit calculation."""

    def test_calculate_prorated_credits_upgrade(self, payment_service):
        """Test prorated credits calculation on upgrade."""
        credits = payment_service.calculate_prorated_credits(
            old_tier=SubscriptionTier.BASIC,
            new_tier=SubscriptionTier.PREMIUM,
            days_remaining=15,
            days_in_period=30,
        )

        # Premium is unlimited, should return -1
        assert credits == -1

    def test_calculate_prorated_credits_downgrade(self, payment_service):
        """Test prorated credits calculation on downgrade."""
        credits = payment_service.calculate_prorated_credits(
            old_tier=SubscriptionTier.BASIC,
            new_tier=SubscriptionTier.FREE,
            days_remaining=15,
            days_in_period=30,
        )

        # Free tier: 10 credits, half period = 5 credits
        assert credits == 5

    def test_calculate_prorated_credits_minimum(self, payment_service):
        """Test minimum prorated credits."""
        credits = payment_service.calculate_prorated_credits(
            old_tier=SubscriptionTier.FREE,
            new_tier=SubscriptionTier.FREE,
            days_remaining=1,
            days_in_period=30,
        )

        # Should return at least 1 credit
        assert credits >= 1


class TestKeyVaultIntegration:
    """Test Key Vault integration."""

    @pytest.mark.asyncio
    async def test_get_keys_from_cache(self, payment_service):
        """Test getting keys from cache."""
        payment_service._stripe_secret_key = "cached_key"
        payment_service._key_cache_time = 0  # Set to 0 to simulate fresh cache

        # Need to make cache valid
        import time
        payment_service._key_cache_time = time.time()

        keys = await payment_service._get_stripe_keys()
        assert keys["secret_key"] == "cached_key"

    @pytest.mark.asyncio
    async def test_get_keys_from_settings(self, payment_service, mock_settings):
        """Test getting keys from settings when Key Vault unavailable."""
        payment_service._stripe_secret_key = None
        payment_service._key_cache_time = None

        keys = await payment_service._get_stripe_keys()
        assert keys["secret_key"] == mock_settings.stripe_secret_key


class TestErrorHandling:
    """Test error handling."""

    @pytest.mark.asyncio
    async def test_stripe_api_error_handling(self, payment_service):
        """Test handling Stripe API errors."""
        with patch.object(payment_service, "initialize", return_value=None):
            with patch(
                "stripe.Customer.create",
                side_effect=stripe.error.APIError("API error"),
            ):
                with pytest.raises(StripePaymentError):
                    await payment_service.create_customer(
                        user_id="user123",
                        email="test@example.com",
                    )

    @pytest.mark.asyncio
    async def test_missing_configuration_error(self):
        """Test error when configuration is missing."""
        settings = Mock(spec=Settings)
        settings.stripe_secret_key = None
        settings.key_vault_url = None

        service = StripeService(settings)

        with pytest.raises(ValueError, match="Stripe secret key not configured"):
            await service._get_stripe_keys()
