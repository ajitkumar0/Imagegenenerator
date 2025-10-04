"""API v1 initialization and router configuration."""
from fastapi import APIRouter
from app.api.v1.endpoints import images

# Create API v1 router
api_router = APIRouter()

# Include endpoint routers
api_router.include_router(images.router, prefix="/images", tags=["images"])
