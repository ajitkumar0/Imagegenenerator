# Stripe Payment Integration Guide

Complete guide for integrating Stripe subscription payments with the ImageGenerator API.

## Table of Contents

1. [Overview](#overview)
2. [Subscription Tiers](#subscription-tiers)
3. [Setup Instructions](#setup-instructions)
4. [API Endpoints](#api-endpoints)
5. [Webhook Events](#webhook-events)
6. [Frontend Integration](#frontend-integration)
7. [Testing](#testing)
8. [Security](#security)
9. [Troubleshooting](#troubleshooting)

## Overview

The ImageGenerator API uses Stripe for subscription management with three tiers:
- **Free**: 10 credits/month, basic model only
- **Basic**: $9.99/month, 200 credits/month, standard models
- **Premium**: $29.99/month, unlimited credits, all models including Pro

### Features

✅ Secure payment processing via Stripe
✅ Subscription lifecycle management
✅ Automatic credit allocation and renewal
✅ Webhook-based event handling
✅ Customer billing portal
✅ Prorated upgrades/downgrades
✅ Azure Key Vault for API keys
✅ Idempotent webhook processing

## Subscription Tiers

### Free Tier

```json
{
  "tier": "free",
  "price": "$0/month",
  "credits": 10,
  "models": ["flux-schnell"],
  "features": [
    "10 generations per month",
    "FLUX Schnell model",
    "Watermarked images",
    "Community support"
  ]
}
```

### Basic Tier

```json
{
  "tier": "basic",
  "price": "$9.99/month",
  "credits": 200,
  "models": ["flux-schnell", "flux-dev"],
  "features": [
    "200 generations per month",
    "FLUX Schnell & Dev models",
    "No watermarks",
    "Priority queue",
    "Email support"
  ]
}
```

### Premium Tier

```json
{
  "tier": "premium",
  "price": "$29.99/month",
  "credits": "unlimited",
  "models": ["flux-schnell", "flux-dev", "flux-1.1-pro"],
  "features": [
    "Unlimited generations",
    "All FLUX models including Pro",
    "Fastest processing",
    "API access",
    "Priority support",
    "Commercial license"
  ]
}
```

## Setup Instructions

### 1. Stripe Dashboard Setup

#### Create Products and Prices

1. Go to [Stripe Dashboard](https://dashboard.stripe.com/)
2. Navigate to **Products** → **Add product**

**Basic Plan:**
```
Name: ImageGen AI Basic
Description: 200 generations per month with FLUX Dev models
Price: $9.99/month
Billing: Recurring monthly
```

**Premium Plan:**
```
Name: ImageGen AI Premium
Description: Unlimited generations with all FLUX models
Price: $29.99/month
Billing: Recurring monthly
```

3. Copy the Price IDs (e.g., `price_1ABC...`)

#### Configure Webhook Endpoint

1. Go to **Developers** → **Webhooks**
2. Click **Add endpoint**
3. Set endpoint URL: `https://your-api.com/api/v1/subscriptions/webhook`
4. Select events:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.paid`
   - `invoice.payment_failed`
   - `customer.subscription.trial_will_end`
5. Copy the **Signing secret** (e.g., `whsec_...`)

#### Get API Keys

1. Go to **Developers** → **API keys**
2. Copy **Secret key** (starts with `sk_test_` or `sk_live_`)
3. Copy **Publishable key** (starts with `pk_test_` or `pk_live_`)

### 2. Azure Key Vault Setup

Store Stripe credentials securely in Azure Key Vault:

```bash
# Set Key Vault name
VAULT_NAME="your-keyvault-name"

# Store Stripe secret key
az keyvault secret set \
  --vault-name $VAULT_NAME \
  --name stripe-secret-key \
  --value "sk_test_..." \
  --description "Stripe API secret key"

# Store webhook secret
az keyvault secret set \
  --vault-name $VAULT_NAME \
  --name stripe-webhook-secret \
  --value "whsec_..." \
  --description "Stripe webhook signing secret"

# Store price IDs
az keyvault secret set \
  --vault-name $VAULT_NAME \
  --name stripe-price-id-basic \
  --value "price_1ABC..." \
  --description "Stripe price ID for Basic tier"

az keyvault secret set \
  --vault-name $VAULT_NAME \
  --name stripe-price-id-premium \
  --value "price_1DEF..." \
  --description "Stripe price ID for Premium tier"

# Grant access to managed identity
az keyvault set-policy \
  --name $VAULT_NAME \
  --object-id <managed-identity-id> \
  --secret-permissions get list
```

### 3. Environment Variables

If not using Key Vault, set environment variables:

```bash
# .env file
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ID_BASIC=price_1ABC...
STRIPE_PRICE_ID_PREMIUM=price_1DEF...

# Azure Key Vault (optional)
AZURE_KEY_VAULT_URL=https://your-vault.vault.azure.net/

# Frontend URL for redirects
FRONTEND_URL=https://your-app.com
```

### 4. Install Dependencies

```bash
pip install stripe==7.0.0
```

Add to `requirements.txt`:
```
stripe>=7.0.0
```

## API Endpoints

### Create Checkout Session

Start subscription flow by creating a Stripe Checkout session.

**Endpoint:** `POST /api/v1/subscriptions/checkout`

**Request:**
```json
{
  "tier": "basic",
  "success_url": "https://your-app.com/subscription/success?session_id={CHECKOUT_SESSION_ID}",
  "cancel_url": "https://your-app.com/subscription/cancel"
}
```

**Response:**
```json
{
  "checkout_url": "https://checkout.stripe.com/c/pay/cs_test_...",
  "session_id": "cs_test_..."
}
```

**Example:**
```javascript
// Frontend code
const response = await fetch('/api/v1/subscriptions/checkout', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer YOUR_JWT_TOKEN',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    tier: 'basic',
    success_url: `${window.location.origin}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${window.location.origin}/subscription/cancel`
  })
});

const { checkout_url } = await response.json();
window.location.href = checkout_url; // Redirect to Stripe
```

### Create Portal Session

Allow users to manage their subscription.

**Endpoint:** `POST /api/v1/subscriptions/portal`

**Request:**
```json
{
  "return_url": "https://your-app.com/subscription"
}
```

**Response:**
```json
{
  "portal_url": "https://billing.stripe.com/p/session/test_..."
}
```

**Example:**
```javascript
const response = await fetch('/api/v1/subscriptions/portal', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer YOUR_JWT_TOKEN',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    return_url: `${window.location.origin}/subscription`
  })
});

const { portal_url } = await response.json();
window.location.href = portal_url;
```

### Get Subscription Details

Get current user's subscription information.

**Endpoint:** `GET /api/v1/subscriptions`

**Response:**
```json
{
  "tier": "basic",
  "status": "active",
  "credits_remaining": 150,
  "credits_per_month": 200,
  "is_unlimited": false,
  "current_period_end": "2024-02-01T00:00:00Z",
  "cancel_at_period_end": false,
  "features": [
    "200 generations per month",
    "FLUX Schnell & Dev models",
    "No watermarks",
    "Priority queue",
    "Email support"
  ]
}
```

### Get Available Tiers

Get all subscription tiers and their features.

**Endpoint:** `GET /api/v1/subscriptions/tiers`

**Response:**
```json
{
  "tiers": [
    {
      "tier": "free",
      "name": "Free",
      "price_monthly": 0.00,
      "credits_per_month": 10,
      "is_unlimited": false,
      "models": ["flux-schnell"],
      "features": ["10 generations per month", "..."]
    },
    {
      "tier": "basic",
      "name": "Basic",
      "price_monthly": 9.99,
      "credits_per_month": 200,
      "is_unlimited": false,
      "models": ["flux-schnell", "flux-dev"],
      "features": ["200 generations per month", "..."]
    },
    {
      "tier": "premium",
      "name": "Premium",
      "price_monthly": 29.99,
      "credits_per_month": -1,
      "is_unlimited": true,
      "models": ["flux-schnell", "flux-dev", "flux-1.1-pro"],
      "features": ["Unlimited generations", "..."]
    }
  ]
}
```

### Get Usage Statistics

Get credit usage for current billing period.

**Endpoint:** `GET /api/v1/subscriptions/usage`

**Response:**
```json
{
  "tier": "basic",
  "credits_remaining": 150,
  "credits_used": 50,
  "credits_per_month": 200,
  "is_unlimited": false,
  "usage_percentage": 25.0,
  "period_end": "2024-02-01T00:00:00Z"
}
```

### Cancel Subscription

Cancel current subscription.

**Endpoint:** `DELETE /api/v1/subscriptions?at_period_end=true`

**Response:**
```json
{
  "success": true,
  "message": "Subscription will cancel at period end",
  "cancel_at_period_end": true
}
```

## Webhook Events

### Webhook Endpoint

**URL:** `POST /api/v1/subscriptions/webhook`

**Headers:**
- `stripe-signature`: Webhook signature for verification

**Security:**
- ✅ Signature verification using webhook secret
- ✅ Idempotency to prevent duplicate processing
- ✅ Event logging for audit trail

### Supported Events

#### 1. checkout.session.completed

Fired when user completes checkout.

**Actions:**
- Create Stripe customer (if new)
- Create subscription record in database
- Allocate initial credits
- Update user tier

#### 2. customer.subscription.created

Fired when subscription is created.

**Actions:**
- Update subscription status
- Set billing period dates
- Allocate monthly credits

#### 3. customer.subscription.updated

Fired when subscription is modified (upgrade/downgrade/renewal).

**Actions:**
- Update subscription status
- Update billing period
- Handle plan changes
- Calculate prorated credits

#### 4. customer.subscription.deleted

Fired when subscription is canceled.

**Actions:**
- Downgrade to free tier
- Reset credits to free tier limits
- Mark subscription as canceled

#### 5. invoice.paid

Fired when recurring payment succeeds (monthly renewal).

**Actions:**
- Reset monthly credits
- Extend subscription period
- Clear usage counters

#### 6. invoice.payment_failed

Fired when payment fails.

**Actions:**
- Update subscription status to "past_due"
- Send payment failure notification
- Potentially restrict access after grace period

#### 7. customer.subscription.trial_will_end

Fired 3 days before trial ends.

**Actions:**
- Send trial ending notification
- Remind user to add payment method

### Webhook Testing

Use Stripe CLI to test webhooks locally:

```bash
# Install Stripe CLI
brew install stripe/stripe-cli/stripe

# Login to Stripe
stripe login

# Forward webhooks to local server
stripe listen --forward-to localhost:8000/api/v1/subscriptions/webhook

# Trigger test events
stripe trigger checkout.session.completed
stripe trigger invoice.paid
stripe trigger customer.subscription.deleted
```

## Frontend Integration

### Complete Checkout Flow

```javascript
// 1. Display pricing tiers
async function displayPricing() {
  const response = await fetch('/api/v1/subscriptions/tiers');
  const { tiers } = await response.json();

  // Render pricing cards
  tiers.forEach(tier => {
    renderPricingCard(tier);
  });
}

// 2. Handle subscription button click
async function handleSubscribe(tier) {
  try {
    // Show loading state
    setLoading(true);

    // Create checkout session
    const response = await fetch('/api/v1/subscriptions/checkout', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${getAuthToken()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        tier: tier,
        success_url: `${window.location.origin}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${window.location.origin}/pricing`
      })
    });

    if (!response.ok) {
      throw new Error('Failed to create checkout session');
    }

    const { checkout_url } = await response.json();

    // Redirect to Stripe Checkout
    window.location.href = checkout_url;

  } catch (error) {
    console.error('Checkout error:', error);
    showError('Failed to start checkout process');
  } finally {
    setLoading(false);
  }
}

// 3. Handle success page
async function handleCheckoutSuccess(sessionId) {
  // Verify payment was successful
  const response = await fetch('/api/v1/subscriptions');
  const subscription = await response.json();

  if (subscription.status === 'active') {
    showSuccess('Subscription activated successfully!');
    // Redirect to dashboard
    window.location.href = '/dashboard';
  }
}

// 4. Display current subscription
async function displaySubscription() {
  const response = await fetch('/api/v1/subscriptions', {
    headers: {
      'Authorization': `Bearer ${getAuthToken()}`
    }
  });

  const subscription = await response.json();

  // Render subscription details
  document.getElementById('tier').textContent = subscription.tier;
  document.getElementById('credits').textContent =
    subscription.is_unlimited ? 'Unlimited' : subscription.credits_remaining;
  document.getElementById('renewal').textContent =
    new Date(subscription.current_period_end).toLocaleDateString();
}

// 5. Handle manage subscription
async function manageSubscription() {
  try {
    const response = await fetch('/api/v1/subscriptions/portal', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${getAuthToken()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        return_url: `${window.location.origin}/subscription`
      })
    });

    const { portal_url } = await response.json();
    window.location.href = portal_url;

  } catch (error) {
    console.error('Portal error:', error);
    showError('Failed to open billing portal');
  }
}

// 6. Cancel subscription
async function cancelSubscription() {
  if (!confirm('Are you sure you want to cancel your subscription?')) {
    return;
  }

  try {
    const response = await fetch('/api/v1/subscriptions?at_period_end=true', {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${getAuthToken()}`
      }
    });

    const result = await response.json();

    if (result.success) {
      showSuccess('Subscription will be canceled at the end of the billing period');
      // Refresh subscription display
      displaySubscription();
    }

  } catch (error) {
    console.error('Cancel error:', error);
    showError('Failed to cancel subscription');
  }
}
```

### React Example

```jsx
import { useState, useEffect } from 'react';

function SubscriptionPage() {
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSubscription();
  }, []);

  const fetchSubscription = async () => {
    try {
      const response = await fetch('/api/v1/subscriptions', {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      const data = await response.json();
      setSubscription(data);
    } catch (error) {
      console.error('Error fetching subscription:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpgrade = async (tier) => {
    try {
      const response = await fetch('/api/v1/subscriptions/checkout', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${getToken()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ tier })
      });

      const { checkout_url } = await response.json();
      window.location.href = checkout_url;
    } catch (error) {
      console.error('Error creating checkout:', error);
    }
  };

  const handleManage = async () => {
    try {
      const response = await fetch('/api/v1/subscriptions/portal', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${getToken()}`,
          'Content-Type': 'application/json'
        }
      });

      const { portal_url } = await response.json();
      window.location.href = portal_url;
    } catch (error) {
      console.error('Error opening portal:', error);
    }
  };

  if (loading) return <div>Loading...</div>;

  return (
    <div>
      <h1>Your Subscription</h1>
      <div>
        <p>Tier: {subscription.tier}</p>
        <p>Credits: {subscription.is_unlimited ? 'Unlimited' : subscription.credits_remaining}</p>
        <p>Renewal: {new Date(subscription.current_period_end).toLocaleDateString()}</p>
      </div>

      {subscription.tier === 'free' ? (
        <div>
          <button onClick={() => handleUpgrade('basic')}>Upgrade to Basic</button>
          <button onClick={() => handleUpgrade('premium')}>Upgrade to Premium</button>
        </div>
      ) : (
        <button onClick={handleManage}>Manage Subscription</button>
      )}
    </div>
  );
}
```

## Testing

### Unit Tests

Run the test suite:

```bash
# Run all payment tests
pytest tests/test_payment_service.py -v

# Run specific test class
pytest tests/test_payment_service.py::TestCheckoutSession -v

# Run with coverage
pytest tests/test_payment_service.py --cov=app.services.payment_service
```

### Integration Testing with Stripe CLI

```bash
# Terminal 1: Start your API server
python -m uvicorn app.main:app --reload

# Terminal 2: Forward webhooks
stripe listen --forward-to localhost:8000/api/v1/subscriptions/webhook

# Terminal 3: Trigger events
stripe trigger checkout.session.completed
stripe trigger invoice.paid
stripe trigger customer.subscription.deleted
```

### Test Cards

Use these test card numbers in Stripe Checkout:

**Successful Payment:**
```
Card: 4242 4242 4242 4242
Expiry: Any future date
CVC: Any 3 digits
ZIP: Any 5 digits
```

**Payment Requires Authentication (3D Secure):**
```
Card: 4000 0025 0000 3155
```

**Payment Fails:**
```
Card: 4000 0000 0000 9995
```

## Security

### Best Practices

1. **Never expose secret keys in frontend code**
   - Only use publishable key (`pk_test_` or `pk_live_`) in frontend
   - Store secret key in Azure Key Vault

2. **Always verify webhook signatures**
   ```python
   event = await stripe_service.verify_webhook_signature(payload, signature)
   ```

3. **Implement idempotency**
   - Use event IDs to prevent duplicate processing
   - Store processed event IDs in Redis or database

4. **Use HTTPS for webhook endpoint**
   - Stripe requires HTTPS in production
   - Configure SSL certificate

5. **Rotate API keys regularly**
   - Update keys in Azure Key Vault
   - Test with new keys before rotating

6. **Monitor webhook failures**
   - Check Stripe Dashboard for failed webhooks
   - Implement retry logic
   - Set up alerts for failures

### Rate Limiting

Implement rate limiting for subscription endpoints:

```python
from fastapi import Request
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)

@router.post("/checkout")
@limiter.limit("5/minute")
async def create_checkout_session(request: Request, ...):
    # ... implementation
```

## Troubleshooting

### Common Issues

**Issue: Webhook signature verification fails**
- **Solution**: Ensure webhook secret is correct and matches Stripe Dashboard
- Check that payload is raw bytes, not parsed JSON

**Issue: Customer already has subscription**
- **Solution**: Check existing subscription status before creating new one
- Use billing portal for plan changes

**Issue: Credits not resetting on renewal**
- **Solution**: Check `invoice.paid` webhook is being received
- Verify webhook handler is updating credits correctly

**Issue: Checkout session expires**
- **Solution**: Checkout sessions expire after 24 hours
- Create new session if user returns after expiration

**Issue: Payment requires authentication but fails**
- **Solution**: Ensure Stripe.js is properly configured for 3D Secure
- Check that customer is completing authentication flow

### Debugging

Enable detailed logging:

```python
import logging

logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)
```

Check Stripe logs:
1. Go to [Stripe Dashboard](https://dashboard.stripe.com/)
2. Navigate to **Developers** → **Logs**
3. Filter by API requests or webhook events

### Support

- **Stripe Documentation**: https://stripe.com/docs
- **Stripe Support**: support@stripe.com
- **API Reference**: https://stripe.com/docs/api

## Production Checklist

Before going live:

- [ ] Use live API keys (not test keys)
- [ ] Store keys securely in Azure Key Vault
- [ ] Configure webhook endpoint with HTTPS
- [ ] Test all webhook events in production
- [ ] Set up monitoring and alerting
- [ ] Configure Stripe billing portal settings
- [ ] Set up email receipts and invoices
- [ ] Test with real payment methods
- [ ] Review Stripe fee structure
- [ ] Configure tax collection (if applicable)
- [ ] Set up fraud prevention rules
- [ ] Document cancellation policy
- [ ] Test refund process
- [ ] Configure customer support email

## Additional Resources

- [Stripe Checkout Documentation](https://stripe.com/docs/payments/checkout)
- [Stripe Billing Portal](https://stripe.com/docs/billing/subscriptions/integrating-customer-portal)
- [Stripe Webhooks Guide](https://stripe.com/docs/webhooks)
- [Stripe Testing Guide](https://stripe.com/docs/testing)
