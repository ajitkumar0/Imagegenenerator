"""
Test suite for Replicate Service

Tests cover:
- API integration with mocks
- All FLUX model types
- Error scenarios
- Timeout handling
- Content safety
- Cost calculation
"""

import pytest
import asyncio
from unittest.mock import Mock, AsyncMock, patch, MagicMock
from datetime import datetime

from app.services.replicate_service import (
    ReplicateService,
    FluxModel,
    ModelConfig,
    ContentSafetyError,
    ReplicateAPIError,
    ReplicateTimeoutError,
    ReplicateRateLimitError,
)
from app.config import Settings


@pytest.fixture
def mock_settings():
    """Create mock settings."""
    settings = Mock(spec=Settings)
    settings.replicate_api_token = "test_token_12345"
    settings.key_vault_url = None
    settings.content_safety_endpoint = None
    return settings


@pytest.fixture
def replicate_service(mock_settings):
    """Create ReplicateService instance with mock settings."""
    return ReplicateService(mock_settings)


@pytest.fixture
def mock_prediction():
    """Create mock Replicate prediction object."""
    prediction = Mock()
    prediction.id = "pred_abc123"
    prediction.status = "starting"
    prediction.output = None
    prediction.error = None
    prediction.created_at = datetime.utcnow()
    prediction.logs = ""
    prediction.metrics = Mock(predict_time=None)
    return prediction


class TestModelConfig:
    """Test model configuration."""

    def test_get_config_schnell(self):
        """Test FLUX Schnell configuration."""
        config = ModelConfig.get_config(FluxModel.SCHNELL)
        assert config["steps"] == 4
        assert config["cost_credits"] == 1
        assert config["speed_seconds"] == 3

    def test_get_config_dev(self):
        """Test FLUX Dev configuration."""
        config = ModelConfig.get_config(FluxModel.DEV)
        assert config["steps"] == 28
        assert config["cost_credits"] == 2
        assert config["speed_seconds"] == 10

    def test_get_config_pro(self):
        """Test FLUX Pro configuration."""
        config = ModelConfig.get_config(FluxModel.PRO)
        assert config["steps"] == 40
        assert config["cost_credits"] == 5
        assert config["speed_seconds"] == 20

    def test_calculate_cost(self):
        """Test cost calculation for different models."""
        assert ModelConfig.calculate_cost(FluxModel.SCHNELL) == 1
        assert ModelConfig.calculate_cost(FluxModel.DEV) == 2
        assert ModelConfig.calculate_cost(FluxModel.PRO) == 5


class TestReplicateServiceInit:
    """Test ReplicateService initialization."""

    def test_init_with_token(self, mock_settings):
        """Test initialization with API token."""
        service = ReplicateService(mock_settings)
        assert service.settings == mock_settings
        assert service._api_token is None  # Not loaded until needed
        assert service.http_client is not None

    def test_init_without_token(self):
        """Test initialization without API token."""
        settings = Mock(spec=Settings)
        settings.replicate_api_token = None
        settings.key_vault_url = None
        settings.content_safety_endpoint = None

        service = ReplicateService(settings)
        assert service._api_token is None


class TestAPITokenRetrieval:
    """Test API token retrieval."""

    @pytest.mark.asyncio
    async def test_get_api_token_from_settings(self, replicate_service):
        """Test getting API token from settings."""
        token = await replicate_service.get_api_token()
        assert token == "test_token_12345"
        assert replicate_service._api_token == "test_token_12345"

    @pytest.mark.asyncio
    async def test_get_api_token_cached(self, replicate_service):
        """Test API token caching."""
        # First call
        token1 = await replicate_service.get_api_token()

        # Second call should use cache
        token2 = await replicate_service.get_api_token()

        assert token1 == token2
        assert replicate_service._api_token == "test_token_12345"

    @pytest.mark.asyncio
    async def test_get_api_token_no_token_configured(self, mock_settings):
        """Test error when no token is configured."""
        mock_settings.replicate_api_token = None
        service = ReplicateService(mock_settings)

        with pytest.raises(ValueError, match="Replicate API token not configured"):
            await service.get_api_token()

    @pytest.mark.asyncio
    async def test_get_token_from_keyvault(self, mock_settings):
        """Test getting token from Key Vault."""
        mock_settings.key_vault_url = "https://test-vault.vault.azure.net/"
        mock_settings.replicate_api_token = None

        service = ReplicateService(mock_settings)

        # Mock Key Vault client
        with patch("app.services.replicate_service.SecretClient") as mock_client:
            mock_secret = Mock()
            mock_secret.value = "kv_token_12345"

            mock_client.return_value.__aenter__.return_value.get_secret = AsyncMock(
                return_value=mock_secret
            )

            token = await service._get_token_from_keyvault()
            assert token == "kv_token_12345"


class TestContentSafety:
    """Test content safety checks."""

    @pytest.mark.asyncio
    async def test_check_content_safety_safe_prompt(self, replicate_service):
        """Test content safety with safe prompt."""
        is_safe, error = await replicate_service.check_content_safety(
            "A beautiful sunset over mountains"
        )
        assert is_safe is True
        assert error is None

    @pytest.mark.asyncio
    async def test_check_content_safety_unsafe_prompt(self, replicate_service):
        """Test content safety with unsafe prompt."""
        is_safe, error = await replicate_service.check_content_safety(
            "nude photo of person"
        )
        assert is_safe is False
        assert "prohibited content" in error.lower()

    @pytest.mark.asyncio
    async def test_check_content_safety_violence(self, replicate_service):
        """Test content safety blocks violent content."""
        is_safe, error = await replicate_service.check_content_safety(
            "violent scene with blood and gore"
        )
        assert is_safe is False
        assert error is not None


class TestValidation:
    """Test validation methods."""

    def test_validate_prompt_valid(self, replicate_service):
        """Test prompt validation with valid prompt."""
        is_valid, error = replicate_service.validate_prompt("Beautiful landscape")
        assert is_valid is True
        assert error is None

    def test_validate_prompt_empty(self, replicate_service):
        """Test prompt validation with empty prompt."""
        is_valid, error = replicate_service.validate_prompt("")
        assert is_valid is False
        assert "cannot be empty" in error

    def test_validate_prompt_too_short(self, replicate_service):
        """Test prompt validation with too short prompt."""
        is_valid, error = replicate_service.validate_prompt("ab")
        assert is_valid is False
        assert "at least 3 characters" in error

    def test_validate_prompt_too_long(self, replicate_service):
        """Test prompt validation with too long prompt."""
        long_prompt = "a" * 501
        is_valid, error = replicate_service.validate_prompt(long_prompt)
        assert is_valid is False
        assert "not exceed 500 characters" in error

    def test_validate_parameters_valid(self, replicate_service):
        """Test parameter validation with valid parameters."""
        is_valid, error = replicate_service.validate_parameters(
            FluxModel.SCHNELL, width=1024, height=1024
        )
        assert is_valid is True
        assert error is None

    def test_validate_parameters_invalid_width(self, replicate_service):
        """Test parameter validation with invalid width."""
        is_valid, error = replicate_service.validate_parameters(
            FluxModel.SCHNELL, width=999, height=1024
        )
        assert is_valid is False
        assert "Width must be one of" in error

    def test_validate_parameters_invalid_steps(self, replicate_service):
        """Test parameter validation with invalid steps."""
        is_valid, error = replicate_service.validate_parameters(
            FluxModel.SCHNELL, width=1024, height=1024, num_inference_steps=50
        )
        assert is_valid is False
        assert "Steps must be between" in error


class TestCreatePrediction:
    """Test prediction creation."""

    @pytest.mark.asyncio
    async def test_create_prediction_success(self, replicate_service, mock_prediction):
        """Test successful prediction creation."""
        with patch("replicate.predictions.create", return_value=mock_prediction):
            with patch("asyncio.to_thread", return_value=mock_prediction):
                result = await replicate_service.create_prediction(
                    prompt="A beautiful sunset",
                    model=FluxModel.SCHNELL,
                )

                assert result["prediction_id"] == "pred_abc123"
                assert result["status"] == "starting"
                assert result["cost_credits"] == 1

    @pytest.mark.asyncio
    async def test_create_prediction_with_all_parameters(
        self, replicate_service, mock_prediction
    ):
        """Test prediction creation with all parameters."""
        with patch("replicate.predictions.create", return_value=mock_prediction):
            with patch("asyncio.to_thread", return_value=mock_prediction):
                result = await replicate_service.create_prediction(
                    prompt="Mountain landscape",
                    model=FluxModel.DEV,
                    negative_prompt="blurry",
                    width=1024,
                    height=768,
                    num_inference_steps=30,
                    guidance_scale=8.0,
                    seed=42,
                    output_format="png",
                )

                assert result["prediction_id"] == "pred_abc123"
                assert result["cost_credits"] == 2

    @pytest.mark.asyncio
    async def test_create_prediction_invalid_prompt(self, replicate_service):
        """Test prediction creation with invalid prompt."""
        with pytest.raises(ValueError, match="cannot be empty"):
            await replicate_service.create_prediction(prompt="", model=FluxModel.SCHNELL)

    @pytest.mark.asyncio
    async def test_create_prediction_unsafe_content(self, replicate_service):
        """Test prediction creation with unsafe content."""
        with pytest.raises(ContentSafetyError):
            await replicate_service.create_prediction(
                prompt="nude photo", model=FluxModel.SCHNELL
            )

    @pytest.mark.asyncio
    async def test_create_prediction_rate_limit(self, replicate_service):
        """Test prediction creation with rate limit error."""
        import replicate.exceptions

        error = replicate.exceptions.ReplicateError("Rate limit exceeded")

        with patch("asyncio.to_thread", side_effect=error):
            with pytest.raises(ReplicateRateLimitError):
                await replicate_service.create_prediction(
                    prompt="test", model=FluxModel.SCHNELL
                )


class TestWaitForCompletion:
    """Test waiting for prediction completion."""

    @pytest.mark.asyncio
    async def test_wait_for_completion_success(self, replicate_service):
        """Test successful completion."""
        # Mock progression: starting -> processing -> succeeded
        mock_responses = [
            {"prediction_id": "pred_123", "status": "starting", "output": None, "error": None},
            {"prediction_id": "pred_123", "status": "processing", "output": None, "error": None},
            {
                "prediction_id": "pred_123",
                "status": "succeeded",
                "output": ["https://example.com/image.png"],
                "error": None,
            },
        ]

        with patch.object(
            replicate_service,
            "check_prediction_status",
            side_effect=mock_responses,
        ):
            result = await replicate_service.wait_for_completion("pred_123")

            assert result["status"] == "succeeded"
            assert result["output"] == ["https://example.com/image.png"]

    @pytest.mark.asyncio
    async def test_wait_for_completion_timeout(self, replicate_service):
        """Test timeout during waiting."""
        # Always return processing status
        mock_response = {
            "prediction_id": "pred_123",
            "status": "processing",
            "output": None,
            "error": None,
        }

        with patch.object(
            replicate_service,
            "check_prediction_status",
            return_value=mock_response,
        ):
            with pytest.raises(ReplicateTimeoutError):
                await replicate_service.wait_for_completion(
                    "pred_123", max_wait_time=2, poll_interval=0.5
                )

    @pytest.mark.asyncio
    async def test_wait_for_completion_failed(self, replicate_service):
        """Test failed prediction."""
        mock_response = {
            "prediction_id": "pred_123",
            "status": "failed",
            "output": None,
            "error": "Generation failed",
        }

        with patch.object(
            replicate_service,
            "check_prediction_status",
            return_value=mock_response,
        ):
            with pytest.raises(ReplicateAPIError, match="Generation failed"):
                await replicate_service.wait_for_completion("pred_123")

    @pytest.mark.asyncio
    async def test_wait_for_completion_canceled(self, replicate_service):
        """Test canceled prediction."""
        mock_response = {
            "prediction_id": "pred_123",
            "status": "canceled",
            "output": None,
            "error": None,
        }

        with patch.object(
            replicate_service,
            "check_prediction_status",
            return_value=mock_response,
        ):
            with pytest.raises(ReplicateAPIError, match="canceled"):
                await replicate_service.wait_for_completion("pred_123")


class TestTextToImage:
    """Test text-to-image generation."""

    @pytest.mark.asyncio
    async def test_generate_text_to_image_success(self, replicate_service):
        """Test successful text-to-image generation."""
        mock_prediction = {
            "prediction_id": "pred_123",
            "status": "starting",
            "cost_credits": 1,
        }

        mock_result = {
            "prediction_id": "pred_123",
            "status": "succeeded",
            "output": ["https://example.com/image.png"],
            "error": None,
        }

        with patch.object(
            replicate_service, "create_prediction", return_value=mock_prediction
        ):
            with patch.object(
                replicate_service, "wait_for_completion", return_value=mock_result
            ):
                result = await replicate_service.generate_text_to_image(
                    prompt="Beautiful sunset",
                    model=FluxModel.SCHNELL,
                )

                assert result["status"] == "succeeded"
                assert result["cost_credits"] == 1
                assert result["model"] == FluxModel.SCHNELL.value

    @pytest.mark.asyncio
    async def test_generate_text_to_image_all_models(self, replicate_service):
        """Test text-to-image with all model types."""
        models = [FluxModel.SCHNELL, FluxModel.DEV, FluxModel.PRO]
        expected_costs = [1, 2, 5]

        for model, expected_cost in zip(models, expected_costs):
            mock_prediction = {
                "prediction_id": f"pred_{model.value}",
                "status": "starting",
                "cost_credits": expected_cost,
            }

            mock_result = {
                "prediction_id": f"pred_{model.value}",
                "status": "succeeded",
                "output": ["https://example.com/image.png"],
            }

            with patch.object(
                replicate_service, "create_prediction", return_value=mock_prediction
            ):
                with patch.object(
                    replicate_service, "wait_for_completion", return_value=mock_result
                ):
                    result = await replicate_service.generate_text_to_image(
                        prompt="Test prompt",
                        model=model,
                    )

                    assert result["cost_credits"] == expected_cost


class TestImageToImage:
    """Test image-to-image generation."""

    @pytest.mark.asyncio
    async def test_generate_image_to_image_success(self, replicate_service):
        """Test successful image-to-image generation."""
        mock_prediction = {
            "prediction_id": "pred_123",
            "status": "starting",
            "cost_credits": 2,
        }

        mock_result = {
            "prediction_id": "pred_123",
            "status": "succeeded",
            "output": ["https://example.com/output.png"],
        }

        with patch.object(
            replicate_service, "create_prediction", return_value=mock_prediction
        ):
            with patch.object(
                replicate_service, "wait_for_completion", return_value=mock_result
            ):
                result = await replicate_service.generate_image_to_image(
                    prompt="Transform this image",
                    image_url="https://example.com/input.png",
                    model=FluxModel.DEV,
                )

                assert result["status"] == "succeeded"
                assert result["cost_credits"] == 2
                assert result["generation_type"] == "image-to-image"


class TestImageDownload:
    """Test image downloading."""

    @pytest.mark.asyncio
    async def test_download_image_success(self, replicate_service):
        """Test successful image download."""
        mock_response = Mock()
        mock_response.content = b"fake_image_data"
        mock_response.headers = {"content-type": "image/png"}
        mock_response.raise_for_status = Mock()

        with patch.object(
            replicate_service.http_client, "get", return_value=mock_response
        ):
            image_bytes, content_type = await replicate_service.download_image(
                "https://example.com/image.png"
            )

            assert image_bytes == b"fake_image_data"
            assert content_type == "image/png"

    @pytest.mark.asyncio
    async def test_download_all_outputs_success(self, replicate_service):
        """Test downloading multiple images."""
        urls = [
            "https://example.com/image1.png",
            "https://example.com/image2.png",
        ]

        with patch.object(
            replicate_service,
            "download_image",
            side_effect=[
                (b"image1_data", "image/png"),
                (b"image2_data", "image/png"),
            ],
        ):
            results = await replicate_service.download_all_outputs(urls)

            assert len(results) == 2
            assert results[0][0] == b"image1_data"
            assert results[1][0] == b"image2_data"

    @pytest.mark.asyncio
    async def test_download_all_outputs_with_error(self, replicate_service):
        """Test downloading with some failures."""
        urls = [
            "https://example.com/image1.png",
            "https://example.com/image2.png",
        ]

        with patch.object(
            replicate_service,
            "download_image",
            side_effect=[
                (b"image1_data", "image/png"),
                Exception("Download failed"),
            ],
        ):
            results = await replicate_service.download_all_outputs(urls)

            # Should only return successful downloads
            assert len(results) == 1
            assert results[0][0] == b"image1_data"


class TestCostCalculation:
    """Test cost calculation."""

    def test_calculate_cost_single_image(self, replicate_service):
        """Test cost calculation for single image."""
        cost = replicate_service.calculate_cost(FluxModel.SCHNELL, num_images=1)
        assert cost == 1

        cost = replicate_service.calculate_cost(FluxModel.DEV, num_images=1)
        assert cost == 2

        cost = replicate_service.calculate_cost(FluxModel.PRO, num_images=1)
        assert cost == 5

    def test_calculate_cost_multiple_images(self, replicate_service):
        """Test cost calculation for multiple images."""
        cost = replicate_service.calculate_cost(FluxModel.SCHNELL, num_images=4)
        assert cost == 4

        cost = replicate_service.calculate_cost(FluxModel.DEV, num_images=3)
        assert cost == 6

        cost = replicate_service.calculate_cost(FluxModel.PRO, num_images=2)
        assert cost == 10


class TestModelForPlan:
    """Test getting model for subscription plan."""

    def test_get_model_for_plan_free(self, replicate_service):
        """Test model for free plan."""
        model = replicate_service.get_model_for_plan("free")
        assert model == FluxModel.SCHNELL

    def test_get_model_for_plan_basic(self, replicate_service):
        """Test model for basic plan."""
        model = replicate_service.get_model_for_plan("basic")
        assert model == FluxModel.DEV

    def test_get_model_for_plan_pro(self, replicate_service):
        """Test model for pro plan."""
        model = replicate_service.get_model_for_plan("pro")
        assert model == FluxModel.PRO

    def test_get_model_for_plan_enterprise(self, replicate_service):
        """Test model for enterprise plan."""
        model = replicate_service.get_model_for_plan("enterprise")
        assert model == FluxModel.PRO

    def test_get_model_for_plan_unknown(self, replicate_service):
        """Test model for unknown plan defaults to schnell."""
        model = replicate_service.get_model_for_plan("unknown")
        assert model == FluxModel.SCHNELL


class TestCancelPrediction:
    """Test prediction cancellation."""

    @pytest.mark.asyncio
    async def test_cancel_prediction_success(self, replicate_service):
        """Test successful prediction cancellation."""
        with patch("asyncio.to_thread", return_value=None):
            result = await replicate_service.cancel_prediction("pred_123")
            assert result is True

    @pytest.mark.asyncio
    async def test_cancel_prediction_failure(self, replicate_service):
        """Test failed prediction cancellation."""
        with patch("asyncio.to_thread", side_effect=Exception("Cancel failed")):
            result = await replicate_service.cancel_prediction("pred_123")
            assert result is False


class TestHealthCheck:
    """Test health check."""

    @pytest.mark.asyncio
    async def test_health_check_success(self, replicate_service):
        """Test successful health check."""
        with patch.object(replicate_service, "get_api_token", return_value="test_token"):
            with patch("asyncio.to_thread", return_value=None):
                result = await replicate_service.health_check()
                assert result is True

    @pytest.mark.asyncio
    async def test_health_check_failure(self, replicate_service):
        """Test failed health check."""
        with patch.object(
            replicate_service, "get_api_token", side_effect=Exception("No token")
        ):
            result = await replicate_service.health_check()
            assert result is False


class TestCleanup:
    """Test resource cleanup."""

    @pytest.mark.asyncio
    async def test_close(self, replicate_service):
        """Test service cleanup."""
        with patch.object(replicate_service.http_client, "aclose", return_value=None):
            await replicate_service.close()
            # Should not raise any exceptions
