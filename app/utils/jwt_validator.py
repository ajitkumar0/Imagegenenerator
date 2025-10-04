"""JWT token validation utilities for Azure AD B2C."""
import logging
from typing import Optional, Dict, Any
from datetime import datetime, timedelta
import jwt
from jwt import PyJWKClient
from jwt.exceptions import (
    InvalidTokenError,
    ExpiredSignatureError,
    InvalidAudienceError,
    InvalidIssuerError
)
from functools import lru_cache
import httpx

logger = logging.getLogger(__name__)


class JWTValidator:
    """JWT token validator for Azure AD B2C tokens."""

    def __init__(
        self,
        tenant: str,
        client_id: str,
        policy_name: str,
        jwks_cache_ttl: int = 3600
    ):
        """Initialize JWT validator.

        Args:
            tenant: Azure AD B2C tenant (e.g., yourname.onmicrosoft.com)
            client_id: Application (client) ID
            policy_name: User flow policy name (e.g., B2C_1_signupsignin)
            jwks_cache_ttl: JWKS cache TTL in seconds (default: 1 hour)
        """
        self.tenant = tenant
        self.client_id = client_id
        self.policy_name = policy_name
        self.jwks_cache_ttl = jwks_cache_ttl

        # Construct issuer and JWKS URI
        tenant_name = tenant.split('.')[0]
        self.issuer = f"https://{tenant_name}.b2clogin.com/{tenant}/v2.0/"
        self.jwks_uri = f"https://{tenant_name}.b2clogin.com/{tenant}/{policy_name}/discovery/v2.0/keys"

        # Initialize JWKS client with caching
        self._jwks_client: Optional[PyJWKClient] = None
        self._jwks_cache_time: Optional[datetime] = None

        logger.info(f"JWTValidator initialized for tenant: {tenant}, policy: {policy_name}")

    def _get_jwks_client(self) -> PyJWKClient:
        """Get or create JWKS client with caching.

        Returns:
            PyJWKClient instance
        """
        now = datetime.utcnow()

        # Refresh JWKS client if cache expired
        if (self._jwks_client is None or
            self._jwks_cache_time is None or
            (now - self._jwks_cache_time).total_seconds() > self.jwks_cache_ttl):

            logger.info(f"Refreshing JWKS client from: {self.jwks_uri}")
            self._jwks_client = PyJWKClient(
                self.jwks_uri,
                cache_keys=True,
                max_cached_keys=10,
                cache_jwk_set=True
            )
            self._jwks_cache_time = now

        return self._jwks_client

    def validate_token(
        self,
        token: str,
        audience: Optional[str] = None,
        validate_exp: bool = True
    ) -> Dict[str, Any]:
        """Validate JWT token from Azure AD B2C.

        Args:
            token: JWT token string
            audience: Expected audience (defaults to client_id)
            validate_exp: Whether to validate expiration

        Returns:
            Decoded token payload

        Raises:
            InvalidTokenError: If token is invalid
            ExpiredSignatureError: If token is expired
            InvalidAudienceError: If audience doesn't match
            InvalidIssuerError: If issuer doesn't match
        """
        try:
            # Get JWKS client
            jwks_client = self._get_jwks_client()

            # Get signing key from token
            signing_key = jwks_client.get_signing_key_from_jwt(token)

            # Decode and verify token
            payload = jwt.decode(
                token,
                signing_key.key,
                algorithms=["RS256"],
                audience=audience or self.client_id,
                issuer=self.issuer,
                options={
                    "verify_signature": True,
                    "verify_exp": validate_exp,
                    "verify_aud": True,
                    "verify_iss": True,
                }
            )

            logger.info(f"Token validated successfully for user: {payload.get('sub')}")

            return payload

        except ExpiredSignatureError:
            logger.warning("Token validation failed: Token has expired")
            raise

        except InvalidAudienceError:
            logger.warning("Token validation failed: Invalid audience")
            raise

        except InvalidIssuerError:
            logger.warning("Token validation failed: Invalid issuer")
            raise

        except InvalidTokenError as e:
            logger.error(f"Token validation failed: {str(e)}")
            raise

    def decode_token_unsafe(self, token: str) -> Dict[str, Any]:
        """Decode token without validation (for debugging only).

        Args:
            token: JWT token string

        Returns:
            Decoded token payload (unverified)
        """
        try:
            payload = jwt.decode(
                token,
                options={
                    "verify_signature": False,
                    "verify_exp": False,
                    "verify_aud": False,
                    "verify_iss": False,
                }
            )
            return payload

        except Exception as e:
            logger.error(f"Failed to decode token: {str(e)}")
            raise

    def extract_user_info(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Extract user information from token payload.

        Args:
            payload: Decoded token payload

        Returns:
            User information dictionary
        """
        # Extract standard claims
        user_info = {
            "sub": payload.get("sub"),  # Subject (unique user ID)
            "email": payload.get("emails", [None])[0] if "emails" in payload else payload.get("email"),
            "email_verified": payload.get("email_verified", False),
            "name": payload.get("name"),
            "given_name": payload.get("given_name"),
            "family_name": payload.get("family_name"),
            "picture": payload.get("picture"),
        }

        # Extract custom claims (if any)
        if "extension_subscription_tier" in payload:
            user_info["subscription_tier"] = payload["extension_subscription_tier"]

        # Extract identity provider
        if "idp" in payload:
            user_info["identity_provider"] = payload["idp"]  # e.g., "google.com"

        # Clean up None values
        user_info = {k: v for k, v in user_info.items() if v is not None}

        logger.info(f"Extracted user info: {user_info.get('email')}")

        return user_info

    def is_token_expired(self, token: str) -> bool:
        """Check if token is expired without validation.

        Args:
            token: JWT token string

        Returns:
            True if expired, False otherwise
        """
        try:
            payload = self.decode_token_unsafe(token)
            exp = payload.get("exp")

            if exp is None:
                return True

            return datetime.utcfromtimestamp(exp) < datetime.utcnow()

        except Exception:
            return True

    async def fetch_jwks(self) -> Dict[str, Any]:
        """Fetch JWKS (JSON Web Key Set) from B2C.

        Returns:
            JWKS dictionary

        Raises:
            httpx.HTTPError: If fetch fails
        """
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(self.jwks_uri)
                response.raise_for_status()
                jwks = response.json()

                logger.info(f"Fetched JWKS: {len(jwks.get('keys', []))} keys")

                return jwks

        except httpx.HTTPError as e:
            logger.error(f"Failed to fetch JWKS: {str(e)}")
            raise


@lru_cache()
def get_jwt_validator(
    tenant: str,
    client_id: str,
    policy_name: str
) -> JWTValidator:
    """Get cached JWT validator instance.

    Args:
        tenant: Azure AD B2C tenant
        client_id: Application client ID
        policy_name: User flow policy name

    Returns:
        JWTValidator instance
    """
    return JWTValidator(
        tenant=tenant,
        client_id=client_id,
        policy_name=policy_name
    )


class TokenBlacklist:
    """Token blacklist for logout functionality."""

    def __init__(self):
        """Initialize token blacklist.

        In production, use Redis for distributed blacklist.
        """
        self._blacklist: Dict[str, datetime] = {}

    def add_token(self, token_jti: str, exp: datetime) -> None:
        """Add token to blacklist.

        Args:
            token_jti: Token JTI (unique identifier)
            exp: Token expiration time
        """
        self._blacklist[token_jti] = exp
        logger.info(f"Token added to blacklist: {token_jti[:8]}...")

    def is_blacklisted(self, token_jti: str) -> bool:
        """Check if token is blacklisted.

        Args:
            token_jti: Token JTI

        Returns:
            True if blacklisted, False otherwise
        """
        if token_jti not in self._blacklist:
            return False

        # Check if token expired (can be removed from blacklist)
        exp = self._blacklist[token_jti]
        if datetime.utcnow() > exp:
            del self._blacklist[token_jti]
            return False

        return True

    def cleanup_expired(self) -> int:
        """Remove expired tokens from blacklist.

        Returns:
            Number of tokens removed
        """
        now = datetime.utcnow()
        expired = [jti for jti, exp in self._blacklist.items() if now > exp]

        for jti in expired:
            del self._blacklist[jti]

        if expired:
            logger.info(f"Cleaned up {len(expired)} expired tokens from blacklist")

        return len(expired)


# Global token blacklist instance
token_blacklist = TokenBlacklist()
