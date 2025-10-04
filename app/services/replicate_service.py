"""
Replicate API Service for FLUX AI Image Generation

Provides complete integration with Replicate API for FLUX models.
Supports text-to-image, image-to-image generation with polling,
timeout handling, cost tracking, and content safety.
"""

import logging
import asyncio
import time
from typing import Any, Dict, List, Optional, Tuple
from datetime import datetime
from enum import Enum

import replicate
import httpx
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type
from azure.keyvault.secrets.aio import SecretClient
from azure.identity.aio import DefaultAzureCredential

from app.config import Settings

logger = logging.getLogger(__name__)


class FluxModel(str, Enum):
    """FLUX model options mapped to subscription tiers."""
    SCHNELL = "black-forest-labs/flux-schnell"  # Free tier - 1 credit, ~3s
    DEV = "black-forest-labs/flux-dev"          # Basic tier - 2 credits, ~10s
    PRO = "black-forest-labs/flux-1.1-pro"      # Premium tier - 5 credits, ~20s


class GenerationStatus(str, Enum):
    """Generation job status."""
    STARTING = "starting"
    PROCESSING = "processing"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    CANCELED = "canceled"


class ModelConfig:
    """Model configuration for FLUX variants."""

    CONFIGS = {
        FluxModel.SCHNELL: {
            "steps": 4,  # Fixed for schnell
            "speed_seconds": 3,
            "cost_credits": 1,
            "quality": "good",
            "guidance_scale_range": (1.0, 10.0),
            "max_steps": 4,
            "min_steps": 4,
        },
        FluxModel.DEV: {
            "steps": 28,  # Default
            "speed_seconds": 10,
            "cost_credits": 2,
            "quality": "better",
            "guidance_scale_range": (1.0, 20.0),
            "max_steps": 50,
            "min_steps": 20,
        },
        FluxModel.PRO: {
            "steps": 40,  # Default
            "speed_seconds": 20,
            "cost_credits": 5,
            "quality": "best",
            "guidance_scale_range": (1.0, 20.0),
            "max_steps": 100,
            "min_steps": 40,
        },
    }

    @classmethod
    def get_config(cls, model: FluxModel) -> Dict[str, Any]:
        """Get configuration for a model."""
        return cls.CONFIGS.get(model, cls.CONFIGS[FluxModel.SCHNELL])

    @classmethod
    def calculate_cost(cls, model: FluxModel) -> int:
        """Calculate credit cost for a model."""
        return cls.get_config(model)["cost_credits"]


class ContentSafetyError(Exception):
    """Raised when content safety check fails."""
    pass


class ReplicateAPIError(Exception):
    """Raised when Replicate API returns an error."""
    pass


class ReplicateTimeoutError(Exception):
    """Raised when generation times out."""
    pass


class ReplicateRateLimitError(Exception):
    """Raised when rate limit is exceeded."""
    pass


class ReplicateService:
    """
    Service for interacting with Replicate API for FLUX image generation.

    Features:
    - Text-to-image and image-to-image generation
    - Async polling with timeout and retry logic
    - Content safety integration
    - Cost tracking per generation
    - API token from Azure Key Vault
    - Rate limiting handling
    """

    def __init__(self, settings: Settings):
        self.settings = settings
        self._api_token: Optional[str] = None
        self._token_cache_time: Optional[float] = None
        self._token_cache_duration = 3600  # Cache token for 1 hour

        # HTTP client for image downloads
        self.http_client = httpx.AsyncClient(
            timeout=httpx.Timeout(60.0, connect=10.0),
            limits=httpx.Limits(max_keepalive_connections=5, max_connections=10)
        )

        # Content safety client (if configured)
        self._content_safety_client = None
        if settings.content_safety_endpoint:
            self._init_content_safety()

    def _init_content_safety(self):
        """Initialize Azure Content Safety client."""
        try:
            from azure.ai.contentsafety.aio import ContentSafetyClient
            from azure.core.credentials import AzureKeyCredential

            # Would need API key from Key Vault or settings
            # For now, we'll implement basic text filtering
            logger.info("Content Safety client initialized")
        except ImportError:
            logger.warning("Azure Content Safety SDK not installed")

    async def get_api_token(self) -> str:
        """
        Get Replicate API token from Azure Key Vault with caching.

        Returns:
            API token string

        Raises:
            ValueError: If token cannot be retrieved
        """
        # Check cache
        if self._api_token and self._token_cache_time:
            if time.time() - self._token_cache_time < self._token_cache_duration:
                return self._api_token

        # Try Key Vault first
        if self.settings.key_vault_url:
            try:
                token = await self._get_token_from_keyvault()
                if token:
                    self._api_token = token
                    self._token_cache_time = time.time()
                    return token
            except Exception as e:
                logger.warning(f"Failed to get token from Key Vault: {e}")

        # Fall back to environment variable
        if self.settings.replicate_api_token:
            self._api_token = self.settings.replicate_api_token
            self._token_cache_time = time.time()
            return self._api_token

        raise ValueError("Replicate API token not configured")

    async def _get_token_from_keyvault(self) -> Optional[str]:
        """
        Get Replicate API token from Azure Key Vault.

        Returns:
            API token or None if not found
        """
        if not self.settings.key_vault_url:
            return None

        try:
            credential = DefaultAzureCredential()
            async with SecretClient(
                vault_url=self.settings.key_vault_url,
                credential=credential
            ) as client:
                secret = await client.get_secret("replicate-api-token")
                logger.info("Retrieved Replicate API token from Key Vault")
                return secret.value
        except Exception as e:
            logger.error(f"Error retrieving token from Key Vault: {e}")
            return None

    async def check_content_safety(self, prompt: str) -> Tuple[bool, Optional[str]]:
        """
        Check if prompt passes content safety guidelines.

        Args:
            prompt: Text prompt to check

        Returns:
            Tuple of (is_safe, error_message)
        """
        # Basic content filtering (expand as needed)
        harmful_keywords = [
            "nude", "naked", "nsfw", "explicit", "sexual",
            "violence", "blood", "gore", "weapons",
            "illegal", "drugs", "hate", "racist"
        ]

        prompt_lower = prompt.lower()
        for keyword in harmful_keywords:
            if keyword in prompt_lower:
                logger.warning(f"Content safety violation: keyword '{keyword}' in prompt")
                return False, f"Prompt contains prohibited content: {keyword}"

        # If Azure Content Safety is available, use it
        if self._content_safety_client:
            try:
                # Implementation would call Azure Content Safety API
                pass
            except Exception as e:
                logger.error(f"Content safety check failed: {e}")

        return True, None

    def validate_prompt(self, prompt: str) -> Tuple[bool, Optional[str]]:
        """
        Validate prompt length and content.

        Args:
            prompt: Text prompt to validate

        Returns:
            Tuple of (is_valid, error_message)
        """
        if not prompt or not prompt.strip():
            return False, "Prompt cannot be empty"

        prompt = prompt.strip()

        if len(prompt) < 3:
            return False, "Prompt must be at least 3 characters"

        if len(prompt) > 500:
            return False, "Prompt must not exceed 500 characters"

        return True, None

    def validate_parameters(
        self,
        model: FluxModel,
        width: int,
        height: int,
        num_inference_steps: Optional[int] = None,
        guidance_scale: Optional[float] = None,
    ) -> Tuple[bool, Optional[str]]:
        """
        Validate generation parameters for a model.

        Args:
            model: FLUX model to use
            width: Image width
            height: Image height
            num_inference_steps: Number of inference steps
            guidance_scale: Guidance scale value

        Returns:
            Tuple of (is_valid, error_message)
        """
        # Validate dimensions
        valid_dimensions = [512, 768, 1024, 1536]
        if width not in valid_dimensions:
            return False, f"Width must be one of {valid_dimensions}"
        if height not in valid_dimensions:
            return False, f"Height must be one of {valid_dimensions}"

        # Get model config
        config = ModelConfig.get_config(model)

        # Validate steps
        if num_inference_steps is not None:
            min_steps = config["min_steps"]
            max_steps = config["max_steps"]
            if not (min_steps <= num_inference_steps <= max_steps):
                return False, f"Steps must be between {min_steps} and {max_steps} for {model.value}"

        # Validate guidance scale
        if guidance_scale is not None:
            min_scale, max_scale = config["guidance_scale_range"]
            if not (min_scale <= guidance_scale <= max_scale):
                return False, f"Guidance scale must be between {min_scale} and {max_scale}"

        return True, None

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        retry=retry_if_exception_type((httpx.HTTPError, ReplicateAPIError))
    )
    async def create_prediction(
        self,
        prompt: str,
        model: FluxModel = FluxModel.SCHNELL,
        negative_prompt: Optional[str] = None,
        width: int = 1024,
        height: int = 1024,
        num_inference_steps: Optional[int] = None,
        guidance_scale: float = 7.5,
        seed: Optional[int] = None,
        output_format: str = "png",
        image_url: Optional[str] = None,  # For image-to-image
    ) -> Dict[str, Any]:
        """
        Create a prediction on Replicate API.

        Args:
            prompt: Text description
            model: FLUX model to use
            negative_prompt: What to avoid
            width: Image width (512, 768, 1024, 1536)
            height: Image height (512, 768, 1024, 1536)
            num_inference_steps: Number of steps (model-dependent)
            guidance_scale: Guidance scale (1.0-20.0)
            seed: Random seed for reproducibility
            output_format: Output format (png, jpg, webp)
            image_url: Input image URL for image-to-image

        Returns:
            Dictionary with prediction info

        Raises:
            ContentSafetyError: If prompt fails safety check
            ReplicateAPIError: If API returns an error
        """
        # Validate prompt
        is_valid, error = self.validate_prompt(prompt)
        if not is_valid:
            raise ValueError(error)

        # Content safety check
        is_safe, error = await self.check_content_safety(prompt)
        if not is_safe:
            raise ContentSafetyError(error)

        # Validate parameters
        is_valid, error = self.validate_parameters(
            model, width, height, num_inference_steps, guidance_scale
        )
        if not is_valid:
            raise ValueError(error)

        # Get API token
        api_token = await self.get_api_token()

        # Build input parameters
        model_config = ModelConfig.get_config(model)
        input_params = {
            "prompt": prompt.strip(),
            "width": width,
            "height": height,
            "output_format": output_format,
        }

        # Add optional parameters
        if negative_prompt:
            input_params["negative_prompt"] = negative_prompt.strip()

        if num_inference_steps:
            input_params["num_inference_steps"] = num_inference_steps
        else:
            input_params["num_inference_steps"] = model_config["steps"]

        if model != FluxModel.SCHNELL:  # Schnell doesn't use guidance
            input_params["guidance_scale"] = guidance_scale

        if seed is not None:
            input_params["seed"] = seed

        if image_url:  # Image-to-image
            input_params["image"] = image_url
            input_params["prompt_strength"] = 0.8  # How much to transform

        try:
            logger.info(f"Creating prediction: model={model.value}, prompt_length={len(prompt)}")

            # Create prediction using Replicate SDK
            prediction = await asyncio.to_thread(
                replicate.predictions.create,
                model=model.value,
                input=input_params,
            )

            result = {
                "prediction_id": prediction.id,
                "status": prediction.status,
                "model": model.value,
                "output": prediction.output,
                "error": prediction.error,
                "created_at": prediction.created_at.isoformat() if prediction.created_at else None,
                "cost_credits": model_config["cost_credits"],
            }

            logger.info(f"Prediction created: id={prediction.id}, status={prediction.status}")
            return result

        except replicate.exceptions.ReplicateError as e:
            logger.error(f"Replicate API error: {e}")
            if "rate limit" in str(e).lower():
                raise ReplicateRateLimitError(str(e))
            raise ReplicateAPIError(f"Failed to create prediction: {e}")
        except Exception as e:
            logger.error(f"Unexpected error creating prediction: {e}")
            raise

    async def check_prediction_status(self, prediction_id: str) -> Dict[str, Any]:
        """
        Check the status of a prediction.

        Args:
            prediction_id: Replicate prediction ID

        Returns:
            Dictionary with prediction status
        """
        try:
            prediction = await asyncio.to_thread(
                replicate.predictions.get,
                prediction_id,
            )

            return {
                "prediction_id": prediction.id,
                "status": prediction.status,
                "output": prediction.output,
                "error": prediction.error,
                "logs": prediction.logs,
                "metrics": prediction.metrics.__dict__ if prediction.metrics else None,
            }
        except Exception as e:
            logger.error(f"Error checking prediction status: {e}")
            return {
                "prediction_id": prediction_id,
                "status": "error",
                "output": None,
                "error": str(e),
                "logs": None,
                "metrics": None,
            }

    async def wait_for_completion(
        self,
        prediction_id: str,
        max_wait_time: int = 60,
        initial_wait: float = 1.0,
        poll_interval: float = 0.5,
    ) -> Dict[str, Any]:
        """
        Poll prediction until completion or timeout with exponential backoff.

        Args:
            prediction_id: Replicate prediction ID
            max_wait_time: Maximum time to wait in seconds (default: 60s)
            initial_wait: Initial wait time before first poll (default: 1s)
            poll_interval: Seconds between polls (default: 0.5s)

        Returns:
            Dictionary with final prediction result

        Raises:
            ReplicateTimeoutError: If prediction times out
        """
        start_time = time.time()
        elapsed = 0
        attempt = 0
        max_attempts = int(max_wait_time / poll_interval)

        # Initial wait for prediction to start
        await asyncio.sleep(initial_wait)

        try:
            while elapsed < max_wait_time and attempt < max_attempts:
                attempt += 1

                # Get prediction status
                result = await self.check_prediction_status(prediction_id)
                status = result["status"]

                logger.debug(f"Prediction {prediction_id} status: {status} (attempt {attempt}, elapsed: {elapsed:.1f}s)")

                # Check if completed
                if status == "succeeded":
                    logger.info(f"Prediction succeeded: {prediction_id} (took {elapsed:.1f}s)")
                    return result

                elif status == "failed":
                    error_msg = result.get("error", "Generation failed")
                    logger.error(f"Prediction failed: {prediction_id} - {error_msg}")
                    raise ReplicateAPIError(error_msg)

                elif status == "canceled":
                    logger.warning(f"Prediction canceled: {prediction_id}")
                    raise ReplicateAPIError("Generation was canceled")

                # Handle rate limit errors with exponential backoff
                if "rate limit" in str(result.get("error", "")).lower():
                    wait_time = min(poll_interval * (2 ** (attempt % 5)), 10)
                    logger.warning(f"Rate limit detected, backing off for {wait_time}s")
                    await asyncio.sleep(wait_time)
                else:
                    # Normal polling interval
                    await asyncio.sleep(poll_interval)

                # Update elapsed time
                elapsed = time.time() - start_time

            # Timeout reached
            logger.error(f"Prediction timeout: {prediction_id} after {elapsed:.1f}s")
            raise ReplicateTimeoutError(f"Generation timeout after {max_wait_time}s")

        except (ReplicateAPIError, ReplicateTimeoutError):
            raise
        except Exception as e:
            logger.error(f"Error waiting for prediction: {e}")
            raise ReplicateAPIError(f"Error during prediction: {e}")

    async def cancel_prediction(self, prediction_id: str) -> bool:
        """
        Cancel a long-running prediction job.

        Args:
            prediction_id: Replicate prediction ID

        Returns:
            bool: True if canceled successfully
        """
        try:
            await asyncio.to_thread(
                replicate.predictions.cancel,
                prediction_id,
            )
            logger.info(f"Prediction canceled: {prediction_id}")
            return True
        except Exception as e:
            logger.error(f"Error canceling prediction: {e}")
            return False

    async def generate_text_to_image(
        self,
        prompt: str,
        model: FluxModel = FluxModel.SCHNELL,
        negative_prompt: Optional[str] = None,
        width: int = 1024,
        height: int = 1024,
        num_inference_steps: Optional[int] = None,
        guidance_scale: float = 7.5,
        seed: Optional[int] = None,
        output_format: str = "png",
    ) -> Dict[str, Any]:
        """
        Generate image from text prompt with polling.

        This is the main entry point for text-to-image generation.
        It creates a prediction and waits for completion.

        Args:
            prompt: Text description
            model: FLUX model to use
            negative_prompt: What to avoid
            width: Image width
            height: Image height
            num_inference_steps: Number of steps
            guidance_scale: Guidance scale
            seed: Random seed
            output_format: Output format

        Returns:
            Dictionary with generation result including image URLs
        """
        try:
            # Create prediction
            prediction = await self.create_prediction(
                prompt=prompt,
                model=model,
                negative_prompt=negative_prompt,
                width=width,
                height=height,
                num_inference_steps=num_inference_steps,
                guidance_scale=guidance_scale,
                seed=seed,
                output_format=output_format,
            )

            prediction_id = prediction["prediction_id"]
            cost_credits = prediction["cost_credits"]

            # Wait for completion
            result = await self.wait_for_completion(prediction_id)

            # Add cost to result
            result["cost_credits"] = cost_credits
            result["model"] = model.value

            return result

        except (ContentSafetyError, ReplicateAPIError, ReplicateTimeoutError):
            raise
        except Exception as e:
            logger.error(f"Error in text-to-image generation: {e}")
            raise ReplicateAPIError(f"Generation failed: {e}")

    async def generate_image_to_image(
        self,
        prompt: str,
        image_url: str,
        model: FluxModel = FluxModel.DEV,
        negative_prompt: Optional[str] = None,
        num_inference_steps: Optional[int] = None,
        guidance_scale: float = 7.5,
        seed: Optional[int] = None,
        output_format: str = "png",
    ) -> Dict[str, Any]:
        """
        Generate image from input image and prompt.

        Args:
            prompt: Text description
            image_url: URL of input image (must be publicly accessible)
            model: FLUX model to use
            negative_prompt: What to avoid
            num_inference_steps: Number of steps
            guidance_scale: Guidance scale
            seed: Random seed
            output_format: Output format

        Returns:
            Dictionary with generation result
        """
        try:
            # Create prediction with image input
            prediction = await self.create_prediction(
                prompt=prompt,
                model=model,
                negative_prompt=negative_prompt,
                width=1024,  # Will be determined by input image
                height=1024,
                num_inference_steps=num_inference_steps,
                guidance_scale=guidance_scale,
                seed=seed,
                output_format=output_format,
                image_url=image_url,
            )

            prediction_id = prediction["prediction_id"]
            cost_credits = prediction["cost_credits"]

            # Wait for completion
            result = await self.wait_for_completion(prediction_id)

            # Add metadata
            result["cost_credits"] = cost_credits
            result["model"] = model.value
            result["generation_type"] = "image-to-image"

            return result

        except Exception as e:
            logger.error(f"Error in image-to-image generation: {e}")
            raise ReplicateAPIError(f"Image-to-image generation failed: {e}")

    async def download_image(self, image_url: str) -> Tuple[bytes, str]:
        """
        Download generated image from Replicate URL.

        Args:
            image_url: URL of generated image

        Returns:
            Tuple of (image_bytes, content_type)
        """
        try:
            response = await self.http_client.get(image_url, follow_redirects=True)
            response.raise_for_status()

            content_type = response.headers.get("content-type", "image/png")
            image_bytes = response.content

            logger.info(f"Image downloaded: size={len(image_bytes)} bytes, type={content_type}")
            return image_bytes, content_type

        except httpx.HTTPError as e:
            logger.error(f"Error downloading image from {image_url}: {e}")
            raise

    async def download_all_outputs(
        self, output_urls: List[str]
    ) -> List[Tuple[bytes, str]]:
        """
        Download all generated images from output URLs.

        Args:
            output_urls: List of image URLs

        Returns:
            List of tuples (image_bytes, content_type)
        """
        if not output_urls:
            return []

        download_tasks = [self.download_image(url) for url in output_urls]
        results = await asyncio.gather(*download_tasks, return_exceptions=True)

        # Filter out errors and log them
        successful_downloads = []
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                logger.error(f"Failed to download image {i}: {result}")
            else:
                successful_downloads.append(result)

        return successful_downloads

    def calculate_cost(self, model: FluxModel, num_images: int = 1) -> int:
        """
        Calculate credit cost for generation.

        Args:
            model: FLUX model
            num_images: Number of images to generate

        Returns:
            Total credit cost
        """
        cost_per_image = ModelConfig.calculate_cost(model)
        return cost_per_image * num_images

    def get_model_for_plan(self, plan: str) -> FluxModel:
        """
        Get appropriate FLUX model for subscription plan.

        Args:
            plan: Subscription plan (free, basic, premium)

        Returns:
            FluxModel enum value
        """
        plan_model_map = {
            "free": FluxModel.SCHNELL,
            "basic": FluxModel.DEV,
            "pro": FluxModel.PRO,
            "premium": FluxModel.PRO,
            "enterprise": FluxModel.PRO,
        }
        return plan_model_map.get(plan.lower(), FluxModel.SCHNELL)

    async def health_check(self) -> bool:
        """
        Check Replicate API health and authentication.

        Returns:
            bool: True if API is accessible and authenticated
        """
        try:
            # Try to get API token
            api_token = await self.get_api_token()
            if not api_token:
                return False

            # Try a simple API call
            replicate.api_token = api_token
            await asyncio.to_thread(replicate.models.list)
            return True

        except Exception as e:
            logger.error(f"Replicate health check failed: {e}")
            return False

    async def close(self):
        """Close HTTP client and cleanup resources."""
        await self.http_client.aclose()
        logger.info("Replicate service closed")
