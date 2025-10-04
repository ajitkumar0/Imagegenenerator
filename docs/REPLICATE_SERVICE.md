# Replicate API Integration for FLUX Models

Complete integration with Replicate API for AI-powered image generation using FLUX models.

## Features

- ✅ **Multiple FLUX Models**: Support for Schnell (fast), Dev (balanced), and Pro (best quality)
- ✅ **Text-to-Image**: Generate images from text descriptions
- ✅ **Image-to-Image**: Transform existing images
- ✅ **Async Polling**: Efficient polling with timeout and exponential backoff
- ✅ **Content Safety**: Built-in content moderation
- ✅ **Cost Tracking**: Automatic credit calculation per model
- ✅ **Key Vault Integration**: Secure API token storage
- ✅ **Rate Limiting**: Automatic rate limit detection and handling
- ✅ **Error Handling**: Comprehensive error handling for all scenarios
- ✅ **Retry Logic**: Automatic retries with exponential backoff

## Model Configuration

### FLUX Models by Subscription Tier

| Model | Tier | Credits | Speed | Quality | Steps |
|-------|------|---------|-------|---------|-------|
| `flux-schnell` | Free | 1 | ~3s | Good | 4 (fixed) |
| `flux-dev` | Basic | 2 | ~10s | Better | 20-50 |
| `flux-1.1-pro` | Premium | 5 | ~20s | Best | 40-100 |

### Model Configurations

```python
from app.services.replicate_service import FluxModel, ModelConfig

# Get configuration for a model
config = ModelConfig.get_config(FluxModel.SCHNELL)
# {
#     "steps": 4,
#     "speed_seconds": 3,
#     "cost_credits": 1,
#     "quality": "good",
#     "guidance_scale_range": (1.0, 10.0),
#     "max_steps": 4,
#     "min_steps": 4
# }

# Calculate cost
cost = ModelConfig.calculate_cost(FluxModel.DEV)
# Returns: 2
```

## Installation

Install required dependencies:

```bash
pip install replicate httpx tenacity azure-keyvault-secrets azure-identity
```

Add to `requirements.txt`:

```
replicate>=0.20.0
httpx>=0.25.0
tenacity>=8.2.3
azure-keyvault-secrets>=4.7.0
azure-identity>=1.15.0
```

## Configuration

### Environment Variables

```bash
# Replicate API Token (required)
REPLICATE_API_TOKEN=r8_xxxxxxxxxxxxxxxxxxxxx

# Azure Key Vault (optional, for secure token storage)
AZURE_KEY_VAULT_URL=https://your-vault.vault.azure.net/

# Azure Content Safety (optional)
AZURE_CONTENT_SAFETY_ENDPOINT=https://your-content-safety.cognitiveservices.azure.com/
```

### Azure Key Vault Setup

Store your Replicate API token securely in Azure Key Vault:

```bash
# Create secret
az keyvault secret set \
  --vault-name your-vault \
  --name replicate-api-token \
  --value "r8_xxxxxxxxxxxxxxxxxxxxx"

# Grant access to managed identity
az keyvault set-policy \
  --name your-vault \
  --object-id <managed-identity-id> \
  --secret-permissions get list
```

## Usage

### Basic Text-to-Image Generation

```python
from app.services.replicate_service import ReplicateService, FluxModel
from app.config import Settings

settings = Settings()
replicate_service = ReplicateService(settings)

# Generate image
result = await replicate_service.generate_text_to_image(
    prompt="A beautiful sunset over mountains, highly detailed",
    model=FluxModel.SCHNELL,
    width=1024,
    height=768,
    guidance_scale=7.5,
)

print(f"Status: {result['status']}")
print(f"Image URLs: {result['output']}")
print(f"Cost: {result['cost_credits']} credits")

# Download generated images
image_bytes, content_type = await replicate_service.download_image(
    result['output'][0]
)

# Cleanup
await replicate_service.close()
```

### Advanced Parameters

```python
result = await replicate_service.generate_text_to_image(
    prompt="A cyberpunk cityscape at night",
    model=FluxModel.DEV,
    negative_prompt="blurry, low quality, distorted",
    width=1024,
    height=1024,
    num_inference_steps=30,  # More steps = better quality
    guidance_scale=8.0,       # Higher = closer to prompt
    seed=42,                  # For reproducibility
    output_format="png",
)
```

### Image-to-Image Transformation

```python
result = await replicate_service.generate_image_to_image(
    prompt="Transform this into a watercolor painting",
    image_url="https://example.com/input.jpg",
    model=FluxModel.DEV,
    guidance_scale=8.0,
    seed=12345,
)
```

### Async Polling with Timeout

```python
# Create prediction
prediction = await replicate_service.create_prediction(
    prompt="Mountain landscape",
    model=FluxModel.SCHNELL,
)

# Wait for completion (with custom timeout)
result = await replicate_service.wait_for_completion(
    prediction["prediction_id"],
    max_wait_time=60,      # Max 60 seconds
    initial_wait=1.0,      # Wait 1s before first poll
    poll_interval=0.5,     # Poll every 0.5s
)
```

### Cost Calculation

```python
# Calculate cost before generation
cost = replicate_service.calculate_cost(FluxModel.PRO, num_images=4)
print(f"Total cost: {cost} credits")  # 20 credits (5 per image)

# Get model based on subscription plan
model = replicate_service.get_model_for_plan("pro")
print(f"Model: {model}")  # FluxModel.PRO
```

## Error Handling

### Exception Types

```python
from app.services.replicate_service import (
    ContentSafetyError,      # Content safety violation
    ReplicateAPIError,        # General API error
    ReplicateTimeoutError,    # Generation timeout
    ReplicateRateLimitError,  # Rate limit exceeded
)
```

### Error Handling Example

```python
try:
    result = await replicate_service.generate_text_to_image(
        prompt="A beautiful landscape",
        model=FluxModel.SCHNELL,
    )
except ContentSafetyError as e:
    print(f"Content safety violation: {e}")
    # Log and return user-friendly error

except ReplicateTimeoutError as e:
    print(f"Generation timeout: {e}")
    # Mark generation as failed, notify user

except ReplicateRateLimitError as e:
    print(f"Rate limit exceeded: {e}")
    # Retry with exponential backoff

except ReplicateAPIError as e:
    print(f"API error: {e}")
    # Mark generation as failed

except ValueError as e:
    print(f"Invalid parameters: {e}")
    # Return validation error to user
```

### Retry Logic with Rate Limiting

```python
import asyncio

max_retries = 3
retry_delay = 5  # seconds

for attempt in range(max_retries):
    try:
        result = await replicate_service.generate_text_to_image(
            prompt="Beautiful sunset",
            model=FluxModel.SCHNELL,
        )
        break  # Success

    except ReplicateRateLimitError:
        if attempt < max_retries - 1:
            await asyncio.sleep(retry_delay)
            retry_delay *= 2  # Exponential backoff
        else:
            raise  # Max retries reached
```

## Integration with Queue Worker

### Processing Generation Requests

```python
from app.services.replicate_service import ReplicateService
from app.services.azure_blob_service import AzureBlobService
from app.repositories.generation_repository import GenerationRepository

async def process_generation_message(message: dict):
    """Process generation request from Service Bus queue."""

    generation_id = message["generation_id"]
    user_id = message["user_id"]
    prompt = message["prompt"]

    # 1. Update status to processing
    await generation_repo.update(
        generation_id,
        {"status": "processing", "started_at": datetime.utcnow()}
    )

    # 2. Check user credits
    subscription = await subscription_repo.get_by_user_id(user_id)
    model = replicate_service.get_model_for_plan(subscription.plan)
    cost = replicate_service.calculate_cost(model)

    if subscription.credits_remaining < cost:
        raise ValueError("Insufficient credits")

    # 3. Generate image
    result = await replicate_service.generate_text_to_image(
        prompt=prompt,
        model=model,
        width=message.get("width", 1024),
        height=message.get("height", 1024),
    )

    # 4. Download and upload to blob storage
    image_bytes, _ = await replicate_service.download_image(result["output"][0])
    blob_url = await blob_service.upload_image(
        image_bytes,
        f"{generation_id}.png"
    )

    # 5. Update database
    await generation_repo.update(
        generation_id,
        {
            "status": "completed",
            "blob_urls": [blob_url],
            "cost_credits": cost,
            "completed_at": datetime.utcnow(),
        }
    )

    # 6. Deduct credits
    await subscription_repo.deduct_credits(user_id, cost)
```

## Validation

### Prompt Validation

```python
# Validate prompt before generation
is_valid, error = replicate_service.validate_prompt(prompt)
if not is_valid:
    print(f"Invalid prompt: {error}")

# Rules:
# - Length: 3-500 characters
# - Not empty or whitespace only
```

### Parameter Validation

```python
# Validate generation parameters
is_valid, error = replicate_service.validate_parameters(
    model=FluxModel.SCHNELL,
    width=1024,
    height=768,
    num_inference_steps=4,
    guidance_scale=7.5,
)

# Rules:
# - Width/Height: 512, 768, 1024, or 1536
# - Steps: Model-dependent (see config)
# - Guidance scale: 1.0-20.0
```

### Content Safety Check

```python
# Check content safety before generation
is_safe, error = await replicate_service.check_content_safety(prompt)
if not is_safe:
    print(f"Content safety violation: {error}")

# Blocks:
# - Adult/NSFW content
# - Violence and gore
# - Hate speech
# - Illegal content
```

## Monitoring and Logging

### Health Check

```python
# Check Replicate API health
is_healthy = await replicate_service.health_check()

if is_healthy:
    print("✓ Replicate API is operational")
else:
    print("✗ Replicate API is not accessible")
    # Alert ops team
```

### Logging

The service logs important events:

```python
# Info logs
logger.info(f"Creating prediction: model={model}, prompt_length={len(prompt)}")
logger.info(f"Prediction created: id={prediction_id}, status={status}")
logger.info(f"Prediction succeeded: {prediction_id} (took {elapsed:.1f}s)")

# Warning logs
logger.warning(f"Content safety violation: keyword '{keyword}' in prompt")
logger.warning(f"Rate limit detected, backing off for {wait_time}s")

# Error logs
logger.error(f"Replicate API error: {e}")
logger.error(f"Prediction failed: {prediction_id} - {error_msg}")
logger.error(f"Prediction timeout: {prediction_id} after {elapsed:.1f}s")
```

## Testing

Run tests with mocks:

```bash
# Run all tests
pytest tests/test_replicate_service.py -v

# Run specific test class
pytest tests/test_replicate_service.py::TestTextToImage -v

# Run with coverage
pytest tests/test_replicate_service.py --cov=app.services.replicate_service
```

### Mock Example

```python
from unittest.mock import patch, Mock

@pytest.mark.asyncio
async def test_generate_image(replicate_service):
    mock_prediction = {
        "prediction_id": "pred_123",
        "status": "starting",
        "cost_credits": 1,
    }

    with patch.object(
        replicate_service,
        "create_prediction",
        return_value=mock_prediction
    ):
        result = await replicate_service.generate_text_to_image(
            prompt="Test prompt",
            model=FluxModel.SCHNELL,
        )

        assert result["prediction_id"] == "pred_123"
```

## Performance Optimization

### Connection Pooling

```python
# HTTP client uses connection pooling
self.http_client = httpx.AsyncClient(
    timeout=httpx.Timeout(60.0, connect=10.0),
    limits=httpx.Limits(
        max_keepalive_connections=5,
        max_connections=10
    )
)
```

### Token Caching

```python
# API token is cached for 1 hour
self._token_cache_duration = 3600

# Check cache before fetching from Key Vault
if self._api_token and self._token_cache_time:
    if time.time() - self._token_cache_time < self._token_cache_duration:
        return self._api_token
```

### Concurrent Generations

```python
# Process multiple generations concurrently
tasks = [
    replicate_service.generate_text_to_image(prompt1, FluxModel.SCHNELL),
    replicate_service.generate_text_to_image(prompt2, FluxModel.SCHNELL),
    replicate_service.generate_text_to_image(prompt3, FluxModel.SCHNELL),
]

results = await asyncio.gather(*tasks, return_exceptions=True)
```

## Best Practices

1. **Always close the service**: Call `await replicate_service.close()` to cleanup HTTP connections

2. **Use appropriate models**: Match model to subscription plan for cost efficiency

3. **Implement retries**: Handle rate limits with exponential backoff

4. **Validate before generation**: Check prompt and parameters before API calls

5. **Monitor costs**: Track credit usage per user and generation

6. **Set timeouts**: Use reasonable timeouts (60s default) for polling

7. **Log errors**: Log all errors for debugging and monitoring

8. **Cache tokens**: Let the service cache API tokens for performance

9. **Handle all exceptions**: Catch and handle all exception types appropriately

10. **Test with mocks**: Use mocks for tests to avoid API costs

## API Reference

See [replicate_service.py](../app/services/replicate_service.py) for complete API documentation.

## Troubleshooting

### Common Issues

**Issue**: `ValueError: Replicate API token not configured`
- **Solution**: Set `REPLICATE_API_TOKEN` environment variable or configure Key Vault

**Issue**: `ContentSafetyError: Prompt contains prohibited content`
- **Solution**: Review and modify prompt to remove prohibited keywords

**Issue**: `ReplicateTimeoutError: Generation timeout after 60s`
- **Solution**: Use faster model (SCHNELL) or increase timeout for complex prompts

**Issue**: `ReplicateRateLimitError: Rate limit exceeded`
- **Solution**: Implement retry logic with exponential backoff

**Issue**: Images not downloading
- **Solution**: Check network connectivity and Replicate CDN availability

## Support

For issues and questions:
- Check logs for detailed error messages
- Review Replicate API documentation: https://replicate.com/docs
- Contact support with prediction ID for troubleshooting
