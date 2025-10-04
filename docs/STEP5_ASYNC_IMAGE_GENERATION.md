# STEP 5: Asynchronous Image Generation with Azure Service Bus

## Overview

This document covers the implementation of asynchronous image generation using Azure Service Bus for queuing, Replicate API for AI image generation, and Azure Container Apps background workers for processing.

## Why Asynchronous Processing?

Image generation with AI models (FLUX, Stable Diffusion, etc.) takes **10-60 seconds**, which is too long for synchronous HTTP requests:

- **HTTP timeouts**: Most API gateways timeout after 30 seconds
- **Poor user experience**: Users don't want to wait with loading spinners
- **Resource waste**: API servers blocked waiting for responses
- **No retry capability**: If generation fails, user must start over

**Solution**: Queue-based asynchronous processing with Azure Service Bus.

## Architecture

```
┌──────────┐         ┌─────────────┐         ┌──────────────┐
│  Client  │         │   FastAPI   │         │    Service   │
│ (Next.js)│         │     API     │         │     Bus      │
└────┬─────┘         └──────┬──────┘         └──────┬───────┘
     │                      │                       │
     │  1. POST /generate   │                       │
     ├─────────────────────>│                       │
     │                      │                       │
     │                      │  2. Create in DB      │
     │                      │     (status: pending) │
     │                      │                       │
     │                      │  3. Queue message     │
     │                      ├──────────────────────>│
     │                      │                       │
     │  4. 202 Accepted     │                       │
     │     + generation_id  │                       │
     │<─────────────────────┤                       │
     │                      │                       │
     │  5. Poll for status  │                       │
     │  GET /status/{id}    │                       │
     │<────────────────────>│                       │
     │                      │                       │


┌──────────────┐         ┌──────────────┐         ┌──────────────┐
│   Service    │         │  Background  │         │  Replicate   │
│     Bus      │         │    Worker    │         │     API      │
└──────┬───────┘         └──────┬───────┘         └──────┬───────┘
       │                        │                        │
       │  6. Receive message    │                        │
       │<───────────────────────┤                        │
       │                        │                        │
       │                        │  7. Update status      │
       │                        │     (processing)       │
       │                        │                        │
       │                        │  8. Generate image     │
       │                        ├───────────────────────>│
       │                        │                        │
       │                        │  9. Poll for result    │
       │                        │<──────────────────────>│
       │                        │                        │
       │                        │  10. Download image    │
       │                        │<───────────────────────┤
       │                        │                        │
       │                        │  11. Upload to Blob    │
       │                        │                        │
       │                        │  12. Update DB         │
       │                        │      (completed)       │
       │                        │                        │
       │  13. Complete message  │                        │
       │<───────────────────────┤                        │
       │                        │                        │
```

## Implementation Components

### 1. Azure Service Bus Queue Service

**File**: [app/services/queue_service.py](../app/services/queue_service.py)

Manages message queuing for asynchronous job processing.

**Key Features**:
- **Managed Identity authentication** - No connection strings
- **Message serialization** with GenerationJobMessage class
- **Batch sending** for multiple jobs
- **Message receive** with callback processing
- **Dead-letter queue** handling
- **Queue metrics** monitoring
- **Retry logic** with exponential backoff

**Message Format**:
```python
{
    "message_id": "uuid",
    "generation_id": "gen_xyz123",
    "user_id": "usr_abc456",
    "type": "text_to_image",
    "prompt": "A futuristic cityscape at sunset",
    "model": "flux-schnell",
    "settings": {
        "num_outputs": 1,
        "aspect_ratio": "16:9",
        "output_format": "png"
    },
    "callback_url": "https://example.com/webhook",
    "priority": "normal",
    "attempt": 1,
    "created_at": "2024-01-15T10:30:00Z"
}
```

**Usage Example**:
```python
# Send generation request to queue
await queue_service.send_generation_request(
    generation_id="gen_xyz123",
    user_id="usr_abc456",
    prompt="A futuristic cityscape at sunset",
    model="flux-schnell",
    settings={"aspect_ratio": "16:9"},
    priority="normal"
)

# Get queue metrics
metrics = await queue_service.get_queue_metrics()
print(f"Active messages: {metrics['active_message_count']}")
print(f"Dead-letter messages: {metrics['dead_letter_message_count']}")
```

### 2. Replicate API Service

**File**: [app/services/replicate_service.py](../app/services/replicate_service.py)

Integrates with Replicate API for AI image generation.

**Supported Models**:
- **FLUX Schnell** - Fast generation (10-15 seconds)
- **FLUX Dev** - Balanced quality/speed (20-30 seconds)
- **FLUX Pro** - Highest quality (40-60 seconds)
- **SDXL** - Stable Diffusion XL
- **SD-3** - Stable Diffusion 3

**Key Methods**:
```python
# Start generation
result = await replicate_service.generate_image(
    prompt="A futuristic cityscape at sunset",
    model=ReplicateModel.FLUX_SCHNELL,
    settings={"aspect_ratio": "16:9"}
)
# Returns: {"prediction_id": "...", "status": "processing"}

# Poll for completion
final_result = await replicate_service.poll_prediction(
    prediction_id=result["prediction_id"],
    max_wait_time=300
)
# Returns: {"status": "succeeded", "output": ["https://..."]}

# Or use convenience method
result = await replicate_service.generate_and_wait(
    prompt="...",
    model=ReplicateModel.FLUX_SCHNELL,
    max_wait_time=300
)
```

**Settings Validation**:
```python
is_valid, error = await replicate_service.validate_settings(
    model="flux-schnell",
    settings={
        "width": 1024,
        "height": 1024,
        "num_outputs": 1,
        "guidance_scale": 7.5
    }
)
```

### 3. Background Worker Service

**File**: [app/services/worker_service.py](../app/services/worker_service.py)

Processes generation jobs from Service Bus queue.

**Worker Workflow**:
1. **Receive message** from Service Bus
2. **Update status** to "processing" in Cosmos DB
3. **Call Replicate API** to generate image
4. **Poll for completion** (max 5 minutes)
5. **Download image** from Replicate
6. **Upload to Blob Storage** with optimization
7. **Update Cosmos DB** with results and URLs
8. **Complete message** (remove from queue)
9. **Send webhook** notification (if configured)

**Error Handling**:
- **Max 3 retries** per job
- **Exponential backoff** between retries
- **Dead-letter queue** after max retries
- **Detailed error logging** to Application Insights

**Metrics Tracking**:
```python
metrics = await worker.get_metrics()
# Returns:
{
    "uptime_seconds": 3600,
    "jobs_processed": 150,
    "jobs_succeeded": 145,
    "jobs_failed": 5,
    "success_rate": 0.9667,
    "avg_processing_time": 45.2
}
```

### 4. Worker Entry Point

**File**: [worker.py](../worker.py)

Standalone worker process that runs in Azure Container Apps.

**Features**:
- **Service initialization** with dependency injection
- **Health checks** on startup
- **Graceful shutdown** handling (SIGTERM, SIGINT)
- **Metrics reporting** every 60 seconds
- **Connection pooling** for MongoDB and Blob Storage

**Running Locally**:
```bash
# Set environment variables
export REPLICATE_API_TOKEN=r8_...
export AZURE_SERVICEBUS_NAMESPACE=imagegen-servicebus
export AZURE_KEY_VAULT_URL=https://imagegen-kv.vault.azure.net/

# Run worker
python worker.py
```

### 5. Generation API Endpoints

**File**: [app/api/v1/endpoints/generate.py](../app/api/v1/endpoints/generate.py)

REST API endpoints for creating and tracking generation requests.

#### POST /api/v1/generate
Create new generation request.

**Request**:
```json
{
  "prompt": "A futuristic cityscape at sunset with flying cars",
  "model": "flux-schnell",
  "settings": {
    "aspect_ratio": "16:9",
    "num_outputs": 1,
    "output_format": "png"
  },
  "callback_url": "https://example.com/webhook/generation"
}
```

**Response** (202 Accepted):
```json
{
  "generation_id": "gen_xyz123",
  "status": "pending",
  "message": "Generation request queued successfully",
  "estimated_time_seconds": 15,
  "credits_deducted": 5
}
```

**Requirements**:
- User must be authenticated and verified
- User must have sufficient credits
- Prompt must be 1-2000 characters
- Model must be valid

#### GET /api/v1/generate/{generation_id}/status
Get generation status and results.

**Response** (200 OK):
```json
{
  "generation_id": "gen_xyz123",
  "status": "completed",
  "prompt": "A futuristic cityscape at sunset",
  "model": "flux-schnell",
  "created_at": "2024-01-15T10:30:00Z",
  "started_at": "2024-01-15T10:30:05Z",
  "completed_at": "2024-01-15T10:30:20Z",
  "image_url": "https://imagegenstorage.blob.core.windows.net/...",
  "thumbnail_url": "https://imagegenstorage.blob.core.windows.net/.../thumb_...",
  "cdn_url": "https://imagegen-cdn.azureedge.net/...",
  "processing_time_ms": 12450,
  "error_message": null
}
```

**Status Values**:
- `pending` - Request queued, not yet processing
- `processing` - Worker is generating image
- `completed` - Generation successful
- `failed` - Generation failed (see error_message)

#### GET /api/v1/generate
List user's generations with pagination.

**Query Parameters**:
- `page` - Page number (default: 1)
- `page_size` - Items per page (default: 20, max: 100)
- `status_filter` - Filter by status

**Response**:
```json
{
  "generations": [...],
  "total": 150,
  "page": 1,
  "page_size": 20
}
```

#### DELETE /api/v1/generate/{generation_id}
Delete generation record.

**Response**: 204 No Content

## Azure Service Bus Configuration

### Queue Settings

```bash
Queue Name: image-generation-queue
Dead-Letter Queue: Enabled
Max Delivery Count: 3
Lock Duration: 5 minutes (PT5M)
Message TTL: 5 minutes (PT5M)
Duplicate Detection: Enabled (10 minutes)
Max Size: 1 GB
Partitioning: Disabled
```

### RBAC Roles

**API Container App (Sender)**:
- Role: `Azure Service Bus Data Sender`
- Scope: Service Bus namespace
- Purpose: Send generation requests to queue

**Worker Container App (Receiver)**:
- Role: `Azure Service Bus Data Receiver`
- Scope: Service Bus namespace
- Purpose: Receive and process messages from queue

### Setup Script

**File**: [scripts/setup_servicebus.sh](../scripts/setup_servicebus.sh)

Automated setup script that:
1. Creates Service Bus namespace
2. Creates queue with configuration
3. Assigns RBAC roles to Managed Identities
4. Creates monitoring alerts
5. Tests queue access

**Usage**:
```bash
# Make executable
chmod +x scripts/setup_servicebus.sh

# Run setup
./scripts/setup_servicebus.sh

# Script will prompt for:
# - Resource group (default: imagegen-rg)
# - Location (default: eastus)
# - Namespace name (default: imagegen-servicebus)
```

## Worker Deployment

### Option 1: Azure Container Apps (Recommended)

**Advantages**:
- Built-in autoscaling based on queue depth
- Managed infrastructure
- Integration with Azure Monitor
- Support for multiple replicas
- Cost-effective (scale to zero when idle)

**Deployment Configuration**: [azure-container-app-worker.yaml](../azure-container-app-worker.yaml)

**Key Features**:
- **Queue-based scaling** - Autoscale based on message count
- **CPU-based scaling** - Additional scaling based on CPU usage
- **Min 1, Max 10 replicas**
- **Managed Identity** for Azure resource access
- **Health probes** for liveness and readiness

**Deploy Worker**:
```bash
# Build and push Docker image
docker build -f Dockerfile.worker -t imagegenacr.azurecr.io/imagegen-worker:latest .
docker push imagegenacr.azurecr.io/imagegen-worker:latest

# Create Container App
az containerapp create \
  --name imagegen-worker \
  --resource-group imagegen-rg \
  --environment imagegen-env \
  --image imagegenacr.azurecr.io/imagegen-worker:latest \
  --cpu 1.0 \
  --memory 2Gi \
  --min-replicas 1 \
  --max-replicas 10 \
  --secrets replicate-api-token=your-token \
  --env-vars \
    ENVIRONMENT=production \
    AZURE_SERVICEBUS_NAMESPACE=imagegen-servicebus \
    SERVICEBUS_QUEUE_NAME=image-generation-queue \
    REPLICATE_API_TOKEN=secretref:replicate-api-token \
  --system-assigned

# Configure autoscaling
az containerapp update \
  --name imagegen-worker \
  --resource-group imagegen-rg \
  --scale-rule-name queue-scaling \
  --scale-rule-type azure-servicebus \
  --scale-rule-metadata \
    queueName=image-generation-queue \
    namespace=imagegen-servicebus \
    messageCount=5 \
  --scale-rule-auth managedIdentity=system
```

### Option 2: Azure Functions

**Advantages**:
- Simpler deployment model
- Built-in Service Bus trigger
- Pay-per-execution pricing

**When to use**:
- Lower volume (<1000 generations/day)
- Simpler operations requirements
- Cost optimization for sporadic usage

**Implementation** (not included in this step):
```python
import azure.functions as func

app = func.FunctionApp()

@app.service_bus_queue_trigger(
    arg_name="msg",
    queue_name="image-generation-queue",
    connection="SERVICEBUS_CONNECTION"
)
async def process_generation(msg: func.ServiceBusMessage):
    # Process generation job
    pass
```

## Frontend Integration

### Polling for Status

**Simple Polling** (checks every 2 seconds):
```typescript
async function pollGenerationStatus(generationId: string) {
  const maxAttempts = 60; // 2 minutes max
  let attempts = 0;

  while (attempts < maxAttempts) {
    const response = await fetch(
      `${API_URL}/api/v1/generate/${generationId}/status`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    const data = await response.json();

    if (data.status === 'completed') {
      return {
        success: true,
        imageUrl: data.cdn_url || data.image_url,
        thumbnailUrl: data.cdn_thumbnail_url || data.thumbnail_url,
      };
    } else if (data.status === 'failed') {
      return {
        success: false,
        error: data.error_message,
      };
    }

    // Still processing, wait 2 seconds
    await new Promise(resolve => setTimeout(resolve, 2000));
    attempts++;
  }

  return {
    success: false,
    error: 'Timeout waiting for generation',
  };
}
```

### React Hook Example

```typescript
import { useState, useEffect } from 'react';

export function useGenerationStatus(generationId: string | null) {
  const [status, setStatus] = useState<string>('pending');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!generationId) return;

    const pollStatus = async () => {
      try {
        const response = await fetch(
          `/api/v1/generate/${generationId}/status`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        const data = await response.json();
        setStatus(data.status);

        if (data.status === 'completed') {
          setImageUrl(data.cdn_url || data.image_url);
        } else if (data.status === 'failed') {
          setError(data.error_message);
        } else {
          // Continue polling
          setTimeout(pollStatus, 2000);
        }
      } catch (err) {
        setError('Failed to fetch status');
      }
    };

    pollStatus();
  }, [generationId]);

  return { status, imageUrl, error };
}
```

### Usage in Component

```typescript
function ImageGenerator() {
  const [generationId, setGenerationId] = useState<string | null>(null);
  const { status, imageUrl, error } = useGenerationStatus(generationId);

  const handleGenerate = async () => {
    const response = await fetch('/api/v1/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        prompt: 'A futuristic cityscape at sunset',
        model: 'flux-schnell',
      }),
    });

    const data = await response.json();
    setGenerationId(data.generation_id);
  };

  return (
    <div>
      <button onClick={handleGenerate}>Generate Image</button>

      {status === 'pending' && <p>Queued...</p>}
      {status === 'processing' && <p>Generating image...</p>}
      {status === 'completed' && <img src={imageUrl!} />}
      {status === 'failed' && <p>Error: {error}</p>}
    </div>
  );
}
```

## Monitoring and Alerting

### Queue Metrics

**Key Metrics to Monitor**:
- **Active Message Count** - Messages in queue
- **Dead-Letter Message Count** - Failed messages
- **Incoming Messages** - Rate of new jobs
- **Outgoing Messages** - Rate of processed jobs
- **Message Lock Duration** - Processing time

**Azure Monitor Queries**:
```kusto
// Queue depth over time
AzureMetrics
| where ResourceProvider == "MICROSOFT.SERVICEBUS"
| where MetricName == "ActiveMessages"
| summarize avg(Average) by bin(TimeGenerated, 5m)
| render timechart

// Dead-letter queue depth
AzureMetrics
| where MetricName == "DeadletteredMessages"
| where Average > 0
| project TimeGenerated, ResourceId, Average
| render timechart
```

### Alerts

**High Queue Depth**:
```bash
az monitor metrics alert create \
  --name queue-depth-high \
  --resource-group imagegen-rg \
  --scopes $SERVICEBUS_ID \
  --condition "avg ActiveMessages > 100" \
  --window-size 5m \
  --evaluation-frequency 1m \
  --severity 3 \
  --description "Queue depth exceeds 100 messages"
```

**Dead-Letter Queue Alert**:
```bash
az monitor metrics alert create \
  --name dead-letter-alert \
  --resource-group imagegen-rg \
  --scopes $SERVICEBUS_ID \
  --condition "avg DeadletteredMessages > 10" \
  --window-size 5m \
  --evaluation-frequency 1m \
  --severity 2 \
  --description "More than 10 messages in dead-letter queue"
```

### Application Insights

**Track Generation Metrics**:
```python
from opentelemetry import trace

tracer = trace.get_tracer(__name__)

with tracer.start_as_current_span("process_generation"):
    span = trace.get_current_span()
    span.set_attribute("generation.id", generation_id)
    span.set_attribute("generation.model", model)
    span.set_attribute("generation.user_id", user_id)

    # Process generation
    result = await worker.process_generation_job(job_message)

    span.set_attribute("generation.status", result.status)
    span.set_attribute("generation.processing_time_ms", result.processing_time)
```

**Custom Metrics**:
```python
from azure.monitor.opentelemetry import configure_azure_monitor

# Track queue depth
telemetry.track_metric(
    "queue.active_messages",
    metrics["active_message_count"]
)

# Track success rate
telemetry.track_metric(
    "worker.success_rate",
    worker_metrics["success_rate"]
)
```

## Error Handling

### Retry Strategy

**Automatic Retries** (Service Bus):
1. First attempt fails → Abandon message
2. Service Bus redelivers after lock duration (5 min)
3. Second attempt fails → Abandon message
4. Third attempt fails → Move to dead-letter queue

**Exponential Backoff** (Replicate API):
```python
@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=10)
)
async def _call_replicate_api(job_message):
    # Retries with delays: 2s, 4s, 8s
    result = await replicate_service.generate_and_wait(...)
    return result
```

### Dead-Letter Queue Management

**View Dead-Letter Messages**:
```python
dead_letter_messages = await queue_service.peek_dead_letter_messages(
    max_messages=10
)

for msg in dead_letter_messages:
    print(f"Message ID: {msg['message_id']}")
    print(f"Reason: {msg['dead_letter_reason']}")
    print(f"Description: {msg['dead_letter_error_description']}")
```

**Resubmit Failed Messages**:
```python
# Resubmit specific message
success = await queue_service.resubmit_dead_letter_message(
    message_id="abc123"
)

# Or bulk resubmit
dead_letter_messages = await queue_service.peek_dead_letter_messages()
for msg in dead_letter_messages:
    await queue_service.resubmit_dead_letter_message(msg['message_id'])
```

### Common Errors

**Error**: `MessageLockLostException`
**Cause**: Worker processing took longer than lock duration (5 minutes)
**Solution**: Increase lock duration or optimize processing

**Error**: `Replicate API timeout`
**Cause**: Model taking too long to generate
**Solution**: Increase max_wait_time or use faster model

**Error**: `Insufficient credits`
**Cause**: Race condition where credits checked but deducted later
**Solution**: Deduct credits immediately before queuing (implemented)

## Performance Optimization

### 1. Concurrent Processing

Workers process multiple jobs concurrently:
```python
# Configure max concurrent jobs
WORKER_MAX_CONCURRENT_JOBS=5  # Process 5 images simultaneously
```

**Calculation**:
- 1 worker = 5 concurrent jobs
- 3 workers = 15 concurrent jobs
- Throughput: ~15 images per minute (assuming 30s avg)

### 2. Queue Partitioning (Future Enhancement)

For high volume (>1000 jobs/minute):
```bash
# Create partitioned queue
az servicebus queue create \
  --enable-partitioning true \
  --partition-count 16
```

### 3. Priority Queue (Future Enhancement)

Separate queues for different priorities:
- `image-generation-high-priority` - PRO users
- `image-generation-normal` - FREE users

### 4. Caching

Cache frequently used prompts (future enhancement):
```python
# Check cache before queuing
cached_result = await redis.get(f"prompt:{prompt_hash}")
if cached_result:
    return cached_result

# If not cached, generate and cache
result = await generate_image(prompt)
await redis.setex(f"prompt:{prompt_hash}", 3600, result)
```

## Cost Optimization

### Service Bus Pricing

**Standard Tier**:
- Base: $0.05 per million operations
- Brokered connections: $0.01 per hour
- Estimated: ~$10/month for 100k generations

### Replicate API Pricing

Model-specific pricing:
- **FLUX Schnell**: $0.003 per generation
- **FLUX Dev**: $0.05 per generation
- **FLUX Pro**: $0.12 per generation

**Example Costs** (10,000 generations/month):
- FLUX Schnell: $30/month
- FLUX Dev: $500/month
- FLUX Pro: $1,200/month

### Worker Compute Costs

**Azure Container Apps**:
- 1 vCPU, 2 GB RAM
- Scale: 1-10 replicas
- Estimated: $50-150/month (based on load)

**Total Estimated Costs** (10k generations/month):
- Infrastructure: ~$60/month (Service Bus + Worker)
- Replicate API: $30-1200/month (depending on model)
- **Total**: $90-1260/month

## Testing

### Unit Tests

```python
# tests/test_queue_service.py
@pytest.mark.asyncio
async def test_send_generation_request(queue_service):
    success = await queue_service.send_generation_request(
        generation_id="test_123",
        user_id="user_456",
        prompt="Test prompt",
        model="flux-schnell"
    )
    assert success is True

# tests/test_worker_service.py
@pytest.mark.asyncio
async def test_process_generation_job(worker_service, mock_job):
    success = await worker_service.process_generation_job(mock_job, mock_message)
    assert success is True
```

### Integration Tests

```bash
# Send test message to queue
python -c "
from app.services.queue_service import AzureServiceBusService
from app.config import Settings

settings = Settings()
queue_service = AzureServiceBusService(settings)

await queue_service.send_generation_request(
    generation_id='test_integration',
    user_id='test_user',
    prompt='A test image',
    model='flux-schnell'
)
"

# Check worker processes it
docker logs imagegen-worker -f
```

### Load Testing

```bash
# Simulate 100 concurrent requests
ab -n 100 -c 10 -T 'application/json' \
  -p generation_request.json \
  -H "Authorization: Bearer $TOKEN" \
  https://imagegen-api.azurecontainerapps.io/api/v1/generate
```

## Troubleshooting

### Worker Not Processing Messages

**Check**:
1. Worker is running: `az containerapp show --name imagegen-worker`
2. RBAC roles assigned: Check Managed Identity has Data Receiver role
3. Queue has messages: Check Azure Portal → Service Bus → Queue
4. No errors in logs: `az containerapp logs show --name imagegen-worker`

**Fix**:
```bash
# Restart worker
az containerapp revision restart \
  --name imagegen-worker \
  --resource-group imagegen-rg
```

### Messages Going to Dead-Letter Queue

**Check Dead-Letter Messages**:
```bash
# View dead-letter messages
az servicebus queue show \
  --resource-group imagegen-rg \
  --namespace-name imagegen-servicebus \
  --name image-generation-queue \
  --query deadLetterMessageCount
```

**Common Causes**:
- Replicate API key invalid
- Blob storage permission denied
- MongoDB connection lost
- Processing timeout (>5 minutes)

### High Queue Depth

**Causes**:
- Worker replicas insufficient
- Worker processing slowly
- High request volume

**Solutions**:
```bash
# Scale up workers manually
az containerapp update \
  --name imagegen-worker \
  --resource-group imagegen-rg \
  --min-replicas 3 \
  --max-replicas 20

# Or adjust autoscaling threshold
az containerapp update \
  --name imagegen-worker \
  --scale-rule-metadata messageCount=3  # Scale more aggressively
```

## Production Deployment Checklist

- [ ] Azure Service Bus namespace created
- [ ] Queue created with correct configuration
- [ ] RBAC roles assigned (Sender/Receiver)
- [ ] Replicate API token configured
- [ ] Worker Docker image built and pushed to ACR
- [ ] Worker Container App deployed
- [ ] Autoscaling rules configured
- [ ] Monitoring alerts created
- [ ] Dead-letter queue monitoring enabled
- [ ] Application Insights configured
- [ ] Load testing completed
- [ ] Disaster recovery plan documented

## Next Steps

1. **Implement WebSocket support** for real-time status updates
2. **Add priority queues** for PRO users
3. **Implement result caching** with Azure Redis Cache
4. **Add batch generation** endpoint (generate multiple images)
5. **Implement generation history** and analytics
6. **Add content moderation** with Azure Content Safety
7. **Support additional models** (Midjourney, DALL-E 3)

## Additional Resources

- [Azure Service Bus Documentation](https://docs.microsoft.com/en-us/azure/service-bus-messaging/)
- [Replicate API Documentation](https://replicate.com/docs)
- [Azure Container Apps Documentation](https://docs.microsoft.com/en-us/azure/container-apps/)
- [FLUX Models on Replicate](https://replicate.com/black-forest-labs)

## Summary

This implementation provides:

✅ **Asynchronous processing** with Azure Service Bus
✅ **Reliable message delivery** with retry and dead-letter queue
✅ **Scalable workers** with Azure Container Apps
✅ **Multiple AI models** via Replicate API
✅ **Automatic image optimization** and CDN delivery
✅ **Credit-based billing** with deduction on request
✅ **Real-time status tracking** via polling
✅ **Comprehensive monitoring** and alerting
✅ **Production-ready** with error handling and retries

The system can handle high volumes with autoscaling and provides excellent user experience with immediate request acceptance and background processing.
