"""Azure AD B2C authentication service."""
import logging
from typing import Optional, Dict, Any
from datetime import datetime
from app.config import Settings
from app.utils.jwt_validator import JWTValidator, get_jwt_validator, token_blacklist
from app.repositories.user_repository import UserRepository
from app.models.user import User, UserCreate, AuthProvider
from jwt.exceptions import InvalidTokenError

logger = logging.getLogger(__name__)


class AzureADB2CService:
    """Azure AD B2C authentication service."""

    def __init__(self, settings: Settings, user_repository: UserRepository):
        """Initialize Azure AD B2C service.

        Args:
            settings: Application settings
            user_repository: User repository instance
        """
        self.settings = settings
        self.user_repo = user_repository

        # Initialize JWT validator
        self.jwt_validator = get_jwt_validator(
            tenant=settings.azure_ad_b2c_tenant,
            client_id=settings.azure_ad_b2c_client_id,
            policy_name=settings.azure_ad_b2c_policy_name
        )

        logger.info("AzureADB2CService initialized")

    async def validate_b2c_token(
        self,
        token: str,
        sync_user: bool = True
    ) -> Dict[str, Any]:
        """Validate Azure AD B2C token and optionally sync user.

        Args:
            token: JWT token from Azure AD B2C
            sync_user: Whether to create/update user in database

        Returns:
            Dictionary with user data and token info

        Raises:
            InvalidTokenError: If token is invalid
        """
        try:
            # Validate token
            payload = self.jwt_validator.validate_token(token)

            # Check if token is blacklisted
            token_jti = payload.get("jti") or payload.get("oid")
            if token_jti and token_blacklist.is_blacklisted(token_jti):
                raise InvalidTokenError("Token has been revoked")

            # Extract user info
            user_info = self.jwt_validator.extract_user_info(payload)

            # Sync user to database if requested
            user = None
            if sync_user:
                user = await self.create_or_update_user(user_info, payload)

            result = {
                "valid": True,
                "user_info": user_info,
                "user": user.model_dump() if user else None,
                "token_exp": payload.get("exp"),
                "token_iat": payload.get("iat"),
            }

            logger.info(f"Token validated successfully for user: {user_info.get('email')}")

            return result

        except InvalidTokenError as e:
            logger.error(f"Token validation failed: {str(e)}")
            raise

    async def create_or_update_user(
        self,
        user_info: Dict[str, Any],
        token_payload: Dict[str, Any]
    ) -> User:
        """Create or update user from Azure AD B2C token.

        Args:
            user_info: Extracted user information
            token_payload: Full token payload

        Returns:
            User model instance
        """
        try:
            # Extract user data
            auth_provider_id = user_info.get("sub")
            email = user_info.get("email")

            if not auth_provider_id:
                raise ValueError("Token missing 'sub' claim (user ID)")

            # Determine authentication provider
            idp = user_info.get("identity_provider", "").lower()
            if "google" in idp:
                auth_provider = AuthProvider.GOOGLE
            elif "github" in idp:
                auth_provider = AuthProvider.GITHUB
            elif "microsoft" in idp:
                auth_provider = AuthProvider.MICROSOFT
            else:
                auth_provider = AuthProvider.EMAIL

            # Try to find existing user by auth provider ID
            existing_user = await self.user_repo.find_by_auth_provider(
                auth_provider=auth_provider,
                auth_provider_id=auth_provider_id
            )

            if existing_user:
                # Update existing user
                logger.info(f"Updating existing user: {existing_user.email}")

                update_data = {
                    "full_name": user_info.get("name") or existing_user.full_name,
                    "avatar_url": user_info.get("picture") or existing_user.avatar_url,
                    "is_verified": user_info.get("email_verified", existing_user.is_verified),
                    "last_login_at": datetime.utcnow(),
                }

                user = await self.user_repo.update_user(
                    existing_user.id,
                    update_data
                )

                return user

            else:
                # Create new user
                logger.info(f"Creating new user: {email}")

                # Check if email already exists
                if email:
                    existing_by_email = await self.user_repo.find_by_email(email)
                    if existing_by_email:
                        # User exists with same email but different auth provider
                        # Link the new auth provider
                        logger.info(f"Linking new auth provider to existing user: {email}")

                        update_data = {
                            "auth_provider": auth_provider.value,
                            "auth_provider_id": auth_provider_id,
                            "is_verified": user_info.get("email_verified", False),
                            "last_login_at": datetime.utcnow(),
                        }

                        user = await self.user_repo.update_user(
                            existing_by_email.id,
                            update_data
                        )

                        return user

                # Create completely new user
                user_create = UserCreate(
                    email=email or f"{auth_provider_id}@noemail.local",
                    full_name=user_info.get("name"),
                    avatar_url=user_info.get("picture"),
                    auth_provider=auth_provider,
                    auth_provider_id=auth_provider_id,
                    password=None  # No password for OAuth users
                )

                user = await self.user_repo.create_user(user_create)

                # Set email verified if provided by OAuth
                if user_info.get("email_verified"):
                    user = await self.user_repo.update_user(
                        user.id,
                        {"is_verified": True}
                    )

                logger.info(f"New user created: {user.id}")

                return user

        except Exception as e:
            logger.error(f"Error creating/updating user: {str(e)}")
            raise

    async def logout_user(self, token: str) -> bool:
        """Logout user by blacklisting token.

        Args:
            token: JWT token to blacklist

        Returns:
            True if successful
        """
        try:
            # Decode token to get JTI and expiration
            payload = self.jwt_validator.decode_token_unsafe(token)

            token_jti = payload.get("jti") or payload.get("oid")
            token_exp = payload.get("exp")

            if not token_jti:
                logger.warning("Token missing JTI/OID claim, cannot blacklist")
                return False

            # Add to blacklist
            exp_datetime = datetime.utcfromtimestamp(token_exp)
            token_blacklist.add_token(token_jti, exp_datetime)

            logger.info(f"User logged out, token blacklisted: {token_jti[:8]}...")

            return True

        except Exception as e:
            logger.error(f"Error during logout: {str(e)}")
            return False

    async def get_user_from_token(self, token: str) -> Optional[User]:
        """Get user from token (without syncing to database).

        Args:
            token: JWT token

        Returns:
            User instance or None
        """
        try:
            # Validate token
            payload = self.jwt_validator.validate_token(token)

            # Extract user info
            user_info = self.jwt_validator.extract_user_info(payload)

            # Find user by auth provider ID
            auth_provider_id = user_info.get("sub")

            if not auth_provider_id:
                return None

            # Try each provider (since we don't know which one)
            for provider in [AuthProvider.GOOGLE, AuthProvider.EMAIL, AuthProvider.GITHUB, AuthProvider.MICROSOFT]:
                user = await self.user_repo.find_by_auth_provider(
                    auth_provider=provider,
                    auth_provider_id=auth_provider_id
                )

                if user:
                    return user

            return None

        except Exception as e:
            logger.error(f"Error getting user from token: {str(e)}")
            return None

    async def refresh_token(self, refresh_token: str) -> Dict[str, Any]:
        """Handle token refresh (placeholder).

        Note: Azure AD B2C token refresh is handled client-side using MSAL.js
        This method is for future server-side refresh implementation.

        Args:
            refresh_token: Refresh token from B2C

        Returns:
            New token data
        """
        # TODO: Implement server-side token refresh using MSAL Python
        logger.warning("Server-side token refresh not implemented yet")
        raise NotImplementedError("Token refresh should be handled client-side with MSAL.js")

    def get_authorization_url(
        self,
        redirect_uri: str,
        state: Optional[str] = None,
        nonce: Optional[str] = None
    ) -> str:
        """Generate Azure AD B2C authorization URL.

        Args:
            redirect_uri: Redirect URI after authentication
            state: State parameter for CSRF protection
            nonce: Nonce for replay protection

        Returns:
            Authorization URL
        """
        tenant_name = self.settings.azure_ad_b2c_tenant.split('.')[0]
        base_url = f"https://{tenant_name}.b2clogin.com/{self.settings.azure_ad_b2c_tenant}"

        params = {
            "p": self.settings.azure_ad_b2c_policy_name,
            "client_id": self.settings.azure_ad_b2c_client_id,
            "redirect_uri": redirect_uri,
            "response_type": "id_token",
            "scope": "openid profile email",
            "response_mode": "form_post",
        }

        if state:
            params["state"] = state

        if nonce:
            params["nonce"] = nonce

        # Construct URL
        query_string = "&".join([f"{k}={v}" for k, v in params.items()])
        url = f"{base_url}/{self.settings.azure_ad_b2c_policy_name}/oauth2/v2.0/authorize?{query_string}"

        return url

    async def get_jwks(self) -> Dict[str, Any]:
        """Get JWKS (JSON Web Key Set) from Azure AD B2C.

        Returns:
            JWKS dictionary
        """
        return await self.jwt_validator.fetch_jwks()


# Global auth service instance
_auth_service: Optional[AzureADB2CService] = None


def initialize_auth_service(settings: Settings, user_repository: UserRepository) -> AzureADB2CService:
    """Initialize global auth service instance.

    Args:
        settings: Application settings
        user_repository: User repository instance

    Returns:
        AzureADB2CService instance
    """
    global _auth_service
    _auth_service = AzureADB2CService(settings, user_repository)
    return _auth_service


def get_auth_service() -> AzureADB2CService:
    """Get global auth service instance.

    Returns:
        AzureADB2CService instance

    Raises:
        RuntimeError: If auth service not initialized
    """
    if _auth_service is None:
        raise RuntimeError("Auth service not initialized. Call initialize_auth_service() first.")
    return _auth_service
