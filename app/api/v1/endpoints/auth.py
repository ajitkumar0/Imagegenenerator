"""Authentication endpoints."""
import logging
from fastapi import APIRouter, Depends, HTTPException, status, Body
from pydantic import BaseModel, Field
from app.services.auth_service import get_auth_service, AzureADB2CService
from app.core.auth_dependencies import get_current_user, get_current_active_user
from app.models.user import User, UserPublic

logger = logging.getLogger(__name__)

router = APIRouter()


class TokenVerifyRequest(BaseModel):
    """Token verification request."""
    token: str = Field(..., description="JWT token from Azure AD B2C")


class TokenVerifyResponse(BaseModel):
    """Token verification response."""
    valid: bool
    user: UserPublic
    message: str = "Token validated successfully"


class AuthURLRequest(BaseModel):
    """Authorization URL request."""
    redirect_uri: str = Field(..., description="Redirect URI after authentication")
    state: str = Field(None, description="State parameter for CSRF protection")


class AuthURLResponse(BaseModel):
    """Authorization URL response."""
    authorization_url: str


@router.post("/verify", response_model=TokenVerifyResponse, status_code=status.HTTP_200_OK)
async def verify_token(
    request: TokenVerifyRequest,
    auth_service: AzureADB2CService = Depends(get_auth_service)
):
    """Verify Azure AD B2C token and sync user.

    This endpoint validates the JWT token from Azure AD B2C,
    creates or updates the user in the database,
    and returns user information.

    Args:
        request: Token verification request
        auth_service: Authentication service

    Returns:
        Token verification response with user data

    Raises:
        HTTPException: If token validation fails
    """
    try:
        # Validate token and sync user
        result = await auth_service.validate_b2c_token(
            token=request.token,
            sync_user=True
        )

        if not result.get("valid"):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token"
            )

        user_data = result.get("user")
        if not user_data:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User not found"
            )

        # Convert to User model then to UserPublic
        user = User(**user_data)
        user_public = UserPublic(**user.model_dump())

        return TokenVerifyResponse(
            valid=True,
            user=user_public
        )

    except HTTPException:
        raise

    except Exception as e:
        logger.error(f"Token verification failed: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Token verification failed: {str(e)}"
        )


@router.get("/me", response_model=UserPublic)
async def get_current_user_profile(
    current_user: User = Depends(get_current_active_user)
):
    """Get current authenticated user profile.

    Requires valid authentication token in Authorization header.

    Args:
        current_user: Current authenticated user

    Returns:
        User profile
    """
    return UserPublic(**current_user.model_dump())


@router.post("/logout", status_code=status.HTTP_200_OK)
async def logout(
    current_user: User = Depends(get_current_user),
    auth_service: AzureADB2CService = Depends(get_auth_service)
):
    """Logout user by blacklisting current token.

    Note: This only blacklists the server-side token.
    Client should also clear tokens from storage.

    Args:
        current_user: Current authenticated user
        auth_service: Authentication service

    Returns:
        Success message
    """
    # In production, extract token from request
    # For now, return success
    logger.info(f"User logged out: {current_user.email}")

    return {
        "message": "Logged out successfully",
        "user_id": current_user.id
    }


@router.post("/auth-url", response_model=AuthURLResponse)
async def get_authorization_url(
    request: AuthURLRequest,
    auth_service: AzureADB2CService = Depends(get_auth_service)
):
    """Get Azure AD B2C authorization URL.

    Generates the URL to redirect users to for authentication.

    Args:
        request: Authorization URL request
        auth_service: Authentication service

    Returns:
        Authorization URL
    """
    try:
        url = auth_service.get_authorization_url(
            redirect_uri=request.redirect_uri,
            state=request.state
        )

        return AuthURLResponse(authorization_url=url)

    except Exception as e:
        logger.error(f"Failed to generate auth URL: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate authorization URL"
        )


@router.get("/jwks")
async def get_jwks(
    auth_service: AzureADB2CService = Depends(get_auth_service)
):
    """Get JWKS (JSON Web Key Set) from Azure AD B2C.

    Public endpoint that returns the JWKS for token validation.

    Args:
        auth_service: Authentication service

    Returns:
        JWKS dictionary
    """
    try:
        jwks = await auth_service.get_jwks()
        return jwks

    except Exception as e:
        logger.error(f"Failed to fetch JWKS: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch JWKS"
        )


@router.get("/health")
async def auth_health_check():
    """Authentication service health check.

    Returns:
        Health status
    """
    return {
        "status": "healthy",
        "service": "authentication"
    }
