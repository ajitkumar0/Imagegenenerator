"""FastAPI dependencies for dependency injection."""
from typing import Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.config import Settings, get_settings
from app.core.azure_clients import AzureClients, get_azure_clients
from app.core.security import decode_access_token

# HTTP Bearer token security scheme
security = HTTPBearer()


def get_current_settings() -> Settings:
    """Get application settings.

    Returns:
        Settings instance
    """
    return get_settings()


def get_clients() -> AzureClients:
    """Get Azure clients instance.

    Returns:
        AzureClients instance
    """
    return get_azure_clients()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security)
) -> dict:
    """Get current authenticated user from JWT token.

    Args:
        credentials: HTTP authorization credentials

    Returns:
        User data from token payload

    Raises:
        HTTPException: If authentication fails
    """
    token = credentials.credentials
    payload = decode_access_token(token)

    user_id: Optional[str] = payload.get("sub")
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return payload


async def get_current_active_user(
    current_user: dict = Depends(get_current_user)
) -> dict:
    """Get current active user (not disabled).

    Args:
        current_user: Current user from token

    Returns:
        User data

    Raises:
        HTTPException: If user is disabled
    """
    if current_user.get("disabled"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Inactive user"
        )

    return current_user
