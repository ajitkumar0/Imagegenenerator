"""Authentication dependencies for FastAPI endpoints."""
import logging
from typing import Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jwt.exceptions import InvalidTokenError
from app.services.auth_service import get_auth_service, AzureADB2CService
from app.models.user import User, SubscriptionTier

logger = logging.getLogger(__name__)

# HTTP Bearer token security scheme
security = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    auth_service: AzureADB2CService = Depends(get_auth_service)
) -> User:
    """Get current authenticated user from JWT token.

    Args:
        credentials: HTTP authorization credentials
        auth_service: Authentication service instance

    Returns:
        User instance

    Raises:
        HTTPException: If authentication fails
    """
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials

    try:
        # Validate token and sync user
        result = await auth_service.validate_b2c_token(token, sync_user=True)

        if not result.get("valid"):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication token",
                headers={"WWW-Authenticate": "Bearer"},
            )

        # Get user from result
        user_data = result.get("user")

        if not user_data:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User not found",
                headers={"WWW-Authenticate": "Bearer"},
            )

        user = User(**user_data)

        logger.info(f"Authenticated user: {user.email}")

        return user

    except InvalidTokenError as e:
        logger.error(f"Token validation failed: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Could not validate credentials: {str(e)}",
            headers={"WWW-Authenticate": "Bearer"},
        )

    except Exception as e:
        logger.error(f"Authentication error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Authentication failed"
        )


async def get_current_active_user(
    current_user: User = Depends(get_current_user)
) -> User:
    """Get current active user (not disabled).

    Args:
        current_user: Current user from token

    Returns:
        User instance

    Raises:
        HTTPException: If user is inactive
    """
    if not current_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user account"
        )

    return current_user


async def get_current_verified_user(
    current_user: User = Depends(get_current_active_user)
) -> User:
    """Get current verified user.

    Args:
        current_user: Current active user

    Returns:
        User instance

    Raises:
        HTTPException: If user is not verified
    """
    if not current_user.is_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Email not verified. Please verify your email to continue."
        )

    return current_user


def require_subscription(
    *required_tiers: SubscriptionTier
):
    """Dependency to require specific subscription tier(s).

    Args:
        *required_tiers: Required subscription tiers

    Returns:
        Dependency function

    Example:
        @app.get("/premium-feature", dependencies=[Depends(require_subscription(SubscriptionTier.PRO))])
    """
    async def check_subscription(
        current_user: User = Depends(get_current_active_user)
    ) -> User:
        """Check if user has required subscription.

        Args:
            current_user: Current active user

        Returns:
            User instance

        Raises:
            HTTPException: If subscription tier not sufficient
        """
        # Map tiers to hierarchy
        tier_hierarchy = {
            SubscriptionTier.FREE: 0,
            SubscriptionTier.BASIC: 1,
            SubscriptionTier.PRO: 2,
            SubscriptionTier.ENTERPRISE: 3,
        }

        user_tier_level = tier_hierarchy.get(current_user.subscription_tier, 0)
        required_levels = [tier_hierarchy.get(tier, 999) for tier in required_tiers]
        min_required_level = min(required_levels) if required_levels else 0

        if user_tier_level < min_required_level:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"This feature requires {required_tiers[0].value} subscription or higher. "
                       f"Your current tier: {current_user.subscription_tier.value}"
            )

        return current_user

    return check_subscription


async def require_credits(
    min_credits: int = 1,
    current_user: User = Depends(get_current_active_user)
) -> User:
    """Dependency to require minimum credits.

    Args:
        min_credits: Minimum credits required
        current_user: Current active user

    Returns:
        User instance

    Raises:
        HTTPException: If insufficient credits
    """
    if current_user.credits_remaining < min_credits:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=f"Insufficient credits. Required: {min_credits}, Available: {current_user.credits_remaining}. "
                   "Please purchase more credits or upgrade your subscription."
        )

    return current_user


async def get_optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    auth_service: AzureADB2CService = Depends(get_auth_service)
) -> Optional[User]:
    """Get current user if authenticated, otherwise None.

    Useful for endpoints that work with or without authentication.

    Args:
        credentials: HTTP authorization credentials
        auth_service: Authentication service instance

    Returns:
        User instance or None
    """
    if not credentials:
        return None

    try:
        result = await auth_service.validate_b2c_token(
            credentials.credentials,
            sync_user=True
        )

        if result.get("valid") and result.get("user"):
            return User(**result["user"])

        return None

    except Exception as e:
        logger.warning(f"Optional auth failed: {str(e)}")
        return None
