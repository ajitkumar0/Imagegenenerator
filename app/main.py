"""FastAPI application with Azure integrations and OpenTelemetry."""
import logging
import sys
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from azure.monitor.opentelemetry import configure_azure_monitor

from app.config import settings
from app.core.azure_clients import initialize_azure_clients, azure_clients
from app.api.v1 import api_router

# Configure logging
logging.basicConfig(
    level=getattr(logging, settings.log_level.upper()),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan context manager for startup and shutdown events.

    Args:
        app: FastAPI application instance
    """
    # Startup
    logger.info(f"Starting {settings.app_name} v{settings.app_version}")
    logger.info(f"Environment: {settings.environment}")

    # Initialize Azure clients with Managed Identity
    try:
        initialize_azure_clients(settings)
        logger.info("Azure clients initialized successfully")
    except Exception as e:
        logger.error(f"Failed to initialize Azure clients: {str(e)}")
        raise

    # Configure Application Insights if connection string is provided
    if settings.appinsights_connection_string:
        try:
            configure_azure_monitor(
                connection_string=settings.appinsights_connection_string,
            )
            logger.info("Application Insights configured successfully")
        except Exception as e:
            logger.warning(f"Failed to configure Application Insights: {str(e)}")

    yield

    # Shutdown
    logger.info("Shutting down application")
    if azure_clients:
        await azure_clients.close()
        logger.info("Azure clients closed")


# Create FastAPI application
app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="Production-ready FastAPI backend with Azure Managed Identity",
    docs_url="/docs" if settings.debug else None,
    redoc_url="/redoc" if settings.debug else None,
    lifespan=lifespan,
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=settings.cors_allow_credentials,
    allow_methods=settings.cors_allow_methods,
    allow_headers=settings.cors_allow_headers,
)

# Add trusted host middleware
app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=settings.allowed_hosts,
)


# Global exception handlers
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Handle validation errors."""
    logger.error(f"Validation error: {exc.errors()}")
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "detail": exc.errors(),
            "body": exc.body,
        },
    )


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Handle all unhandled exceptions."""
    logger.error(f"Unhandled exception: {str(exc)}", exc_info=True)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "detail": "Internal server error",
            "message": str(exc) if settings.debug else "An error occurred",
        },
    )


# Middleware for request logging
@app.middleware("http")
async def log_requests(request: Request, call_next):
    """Log all incoming requests."""
    logger.info(f"{request.method} {request.url.path}")
    response = await call_next(request)
    logger.info(f"Response status: {response.status_code}")
    return response


# Health check endpoints
@app.get("/health", tags=["Health"])
async def health_check():
    """Basic health check endpoint.

    Returns:
        Health status
    """
    return {
        "status": "healthy",
        "app_name": settings.app_name,
        "version": settings.app_version,
        "environment": settings.environment,
    }


@app.get("/health/ready", tags=["Health"])
async def readiness_check():
    """Readiness check endpoint (checks Azure connections).

    Returns:
        Readiness status with Azure service checks
    """
    checks = {
        "status": "ready",
        "services": {}
    }

    # Check Cosmos DB
    try:
        if azure_clients and azure_clients.cosmos_client:
            # Simple check - list databases
            list(azure_clients.cosmos_client.list_databases())
            checks["services"]["cosmos_db"] = "healthy"
    except Exception as e:
        logger.error(f"Cosmos DB health check failed: {str(e)}")
        checks["services"]["cosmos_db"] = "unhealthy"
        checks["status"] = "not_ready"

    # Check Blob Storage
    try:
        if azure_clients and azure_clients.blob_service_client:
            # Simple check - get account info
            azure_clients.blob_service_client.get_account_information()
            checks["services"]["blob_storage"] = "healthy"
    except Exception as e:
        logger.error(f"Blob Storage health check failed: {str(e)}")
        checks["services"]["blob_storage"] = "unhealthy"
        checks["status"] = "not_ready"

    return checks


@app.get("/health/live", tags=["Health"])
async def liveness_check():
    """Liveness check endpoint.

    Returns:
        Liveness status
    """
    return {"status": "alive"}


# Include API routers
app.include_router(api_router, prefix=settings.api_v1_prefix)


# Root endpoint
@app.get("/", tags=["Root"])
async def root():
    """Root endpoint.

    Returns:
        Welcome message
    """
    return {
        "message": f"Welcome to {settings.app_name}",
        "version": settings.app_version,
        "docs": "/docs" if settings.debug else "Documentation disabled in production",
    }
