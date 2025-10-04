# Stripe Integration Setup Checklist

Complete checklist for setting up Stripe payment integration in the ImageGenerator API.

## ✅ Prerequisites

- [ ] Stripe account created at https://dashboard.stripe.com
- [ ] Azure Key Vault provisioned
- [ ] API server deployed and accessible

## 📋 Step-by-Step Setup

### 1. Stripe Dashboard Configuration

#### Create Products (5 minutes)

- [ ] Log into Stripe Dashboard
- [ ] Navigate to **Products** → **Add Product**

**Basic Plan:**
- [ ] Name: `ImageGen AI Basic`
- [ ] Description: `200 AI image generations per month with FLUX Dev models`
- [ ] Price: `$9.99 USD`
- [ ] Billing: `Recurring - Monthly`
- [ ] Copy Price ID: `price_________________`

**Premium Plan:**
- [ ] Name: `ImageGen AI Premium`
- [ ] Description: `Unlimited AI image generations with all FLUX models`
- [ ] Price: `$29.99 USD`
- [ ] Billing: `Recurring - Monthly`
- [ ] Copy Price ID: `price_________________`

#### Configure Webhook Endpoint (3 minutes)

- [ ] Navigate to **Developers** → **Webhooks**
- [ ] Click **Add endpoint**
- [ ] Endpoint URL: `https://your-api.com/api/v1/subscriptions/webhook`
- [ ] Select events:
  - [ ] `checkout.session.completed`
  - [ ] `customer.subscription.created`
  - [ ] `customer.subscription.updated`
  - [ ] `customer.subscription.deleted`
  - [ ] `invoice.paid`
  - [ ] `invoice.payment_failed`
  - [ ] `customer.subscription.trial_will_end`
- [ ] Copy Signing Secret: `whsec_________________`

#### Get API Keys (1 minute)

- [ ] Navigate to **Developers** → **API keys**
- [ ] Copy **Secret key**: `sk_test_________________` (test mode)
- [ ] Copy **Publishable key**: `pk_test_________________` (test mode)
- [ ] Note: Use live keys (`sk_live_`, `pk_live_`) for production

### 2. Azure Key Vault Configuration

#### Store Stripe Credentials (5 minutes)

```bash
# Set variables
VAULT_NAME="your-keyvault-name"
STRIPE_SECRET_KEY="sk_test_..."
STRIPE_WEBHOOK_SECRET="whsec_..."
STRIPE_PRICE_BASIC="price_..."
STRIPE_PRICE_PREMIUM="price_..."

# Store secrets
az keyvault secret set \
  --vault-name $VAULT_NAME \
  --name stripe-secret-key \
  --value "$STRIPE_SECRET_KEY"

az keyvault secret set \
  --vault-name $VAULT_NAME \
  --name stripe-webhook-secret \
  --value "$STRIPE_WEBHOOK_SECRET"

az keyvault secret set \
  --vault-name $VAULT_NAME \
  --name stripe-price-id-basic \
  --value "$STRIPE_PRICE_BASIC"

az keyvault secret set \
  --vault-name $VAULT_NAME \
  --name stripe-price-id-premium \
  --value "$STRIPE_PRICE_PREMIUM"
```

Verification:
- [ ] All 4 secrets stored successfully
- [ ] Secrets accessible via Azure Portal

#### Configure Managed Identity Access (2 minutes)

```bash
# Get managed identity object ID
IDENTITY_ID=$(az webapp identity show \
  --name your-app-name \
  --resource-group your-rg \
  --query principalId -o tsv)

# Grant access
az keyvault set-policy \
  --name $VAULT_NAME \
  --object-id $IDENTITY_ID \
  --secret-permissions get list
```

Verification:
- [ ] Managed identity has Key Vault access
- [ ] Can retrieve secrets programmatically

### 3. Application Configuration

#### Update Environment Variables (2 minutes)

Add to `.env` or Azure App Service Configuration:

```bash
# Stripe Configuration
STRIPE_SECRET_KEY=sk_test_...  # Only if not using Key Vault
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...  # Only if not using Key Vault
STRIPE_PRICE_ID_BASIC=price_...  # Only if not using Key Vault
STRIPE_PRICE_ID_PREMIUM=price_...  # Only if not using Key Vault

# Azure Key Vault (recommended)
AZURE_KEY_VAULT_URL=https://your-vault.vault.azure.net/

# Frontend URLs for redirects
FRONTEND_URL=https://your-app.com
```

Verification:
- [ ] Environment variables set
- [ ] Key Vault URL is correct
- [ ] Frontend URL is accessible

#### Update Config File (1 minute)

Edit `app/config.py`:

```python
class Settings(BaseSettings):
    # ... existing settings ...

    # Stripe Settings
    stripe_secret_key: Optional[str] = Field(None, alias="STRIPE_SECRET_KEY")
    stripe_publishable_key: Optional[str] = Field(None, alias="STRIPE_PUBLISHABLE_KEY")
    stripe_webhook_secret: Optional[str] = Field(None, alias="STRIPE_WEBHOOK_SECRET")
    stripe_price_id_basic: Optional[str] = Field(None, alias="STRIPE_PRICE_ID_BASIC")
    stripe_price_id_premium: Optional[str] = Field(None, alias="STRIPE_PRICE_ID_PREMIUM")

    frontend_url: str = Field("https://localhost:3000", alias="FRONTEND_URL")
```

Verification:
- [ ] Settings class updated
- [ ] Config file has no syntax errors

#### Register API Routes (1 minute)

Edit `app/api/v1/__init__.py`:

```python
from app.api.v1.endpoints import subscriptions

# Include subscription router
api_router.include_router(
    subscriptions.router,
    prefix="/subscriptions",
    tags=["subscriptions"]
)
```

Verification:
- [ ] Router included
- [ ] API endpoints accessible

### 4. Database Setup

#### Update User Model (if needed) (2 minutes)

Ensure User model has Stripe fields:

```python
class User(BaseModel):
    # ... existing fields ...
    stripe_customer_id: Optional[str] = None
```

#### Update Subscription Model (2 minutes)

```python
class Subscription(BaseModel):
    user_id: str
    stripe_subscription_id: str
    stripe_customer_id: str
    tier: str  # free, basic, premium
    status: str  # active, canceled, past_due
    credits_per_month: int
    credits_remaining: int
    credits_used_this_period: int = 0
    current_period_start: datetime
    current_period_end: datetime
    cancel_at_period_end: bool = False
    canceled_at: Optional[datetime] = None
```

Verification:
- [ ] Models updated
- [ ] Database schema matches models

### 5. Install Dependencies

#### Python Packages (1 minute)

```bash
pip install stripe==7.0.0
```

Add to `requirements.txt`:
```
stripe>=7.0.0
```

Verification:
- [ ] Stripe package installed
- [ ] No dependency conflicts

### 6. Testing

#### Local Testing with Stripe CLI (10 minutes)

Install Stripe CLI:
```bash
# macOS
brew install stripe/stripe-cli/stripe

# Linux
wget https://github.com/stripe/stripe-cli/releases/download/v1.19.5/stripe_1.19.5_linux_x86_64.tar.gz
tar -xvf stripe_1.19.5_linux_x86_64.tar.gz
sudo mv stripe /usr/local/bin/
```

- [ ] Stripe CLI installed
- [ ] Login: `stripe login`

Forward webhooks locally:
```bash
# Terminal 1: Start API server
uvicorn app.main:app --reload

# Terminal 2: Forward webhooks
stripe listen --forward-to localhost:8000/api/v1/subscriptions/webhook
```

- [ ] Webhook forwarding active
- [ ] Can see events in terminal

Trigger test events:
```bash
# Test checkout completion
stripe trigger checkout.session.completed

# Test invoice payment
stripe trigger invoice.paid

# Test subscription cancellation
stripe trigger customer.subscription.deleted
```

- [ ] All webhook events processed successfully
- [ ] Database updated correctly
- [ ] No errors in logs

#### Unit Tests (2 minutes)

```bash
pytest tests/test_payment_service.py -v
```

- [ ] All tests pass
- [ ] Code coverage > 80%

#### Integration Tests (5 minutes)

Test complete flow:

1. **Create Checkout Session**
```bash
curl -X POST http://localhost:8000/api/v1/subscriptions/checkout \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"tier": "basic"}'
```

- [ ] Returns checkout URL
- [ ] Can access Stripe Checkout page

2. **Test with Test Card**
- [ ] Use card `4242 4242 4242 4242`
- [ ] Complete checkout successfully
- [ ] Webhook received and processed
- [ ] User subscription created

3. **Verify Subscription**
```bash
curl http://localhost:8000/api/v1/subscriptions \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

- [ ] Returns subscription details
- [ ] Credits allocated correctly
- [ ] Status is "active"

4. **Test Portal Session**
```bash
curl -X POST http://localhost:8000/api/v1/subscriptions/portal \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'
```

- [ ] Returns portal URL
- [ ] Can access billing portal
- [ ] Can change payment method

5. **Test Cancellation**
```bash
curl -X DELETE http://localhost:8000/api/v1/subscriptions?at_period_end=true \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

- [ ] Subscription marked for cancellation
- [ ] Webhook received
- [ ] Database updated

### 7. Frontend Integration

#### Add Stripe.js (2 minutes)

Add to your HTML:
```html
<script src="https://js.stripe.com/v3/"></script>
```

Or install package:
```bash
npm install @stripe/stripe-js
```

- [ ] Stripe.js loaded
- [ ] No console errors

#### Implement Checkout Flow (10 minutes)

See `STRIPE_INTEGRATION.md` for complete examples.

- [ ] Pricing page displays tiers
- [ ] Subscribe button triggers checkout
- [ ] Redirects to Stripe Checkout
- [ ] Success page handles return
- [ ] Displays subscription status

#### Test User Journey (5 minutes)

- [ ] User can view pricing
- [ ] User can click "Subscribe"
- [ ] Redirects to Stripe Checkout
- [ ] Can enter test card details
- [ ] Redirects back on success
- [ ] Dashboard shows subscription
- [ ] Can manage subscription
- [ ] Can cancel subscription

### 8. Production Deployment

#### Switch to Live Mode (5 minutes)

- [ ] Go to Stripe Dashboard
- [ ] Toggle to **Live mode** (top-right)
- [ ] Create live products/prices
- [ ] Configure live webhook endpoint
- [ ] Copy live API keys
- [ ] Update Key Vault with live keys

#### Production Checklist

- [ ] Using live Stripe keys (`sk_live_`, `pk_live_`)
- [ ] Webhook endpoint uses HTTPS
- [ ] SSL certificate valid
- [ ] Webhook signing secret updated
- [ ] Tested live payment flow
- [ ] Monitored first real transaction
- [ ] Set up Stripe alerts
- [ ] Configured email receipts
- [ ] Documented support process

### 9. Monitoring & Maintenance

#### Set Up Monitoring (5 minutes)

- [ ] Enable Application Insights logging
- [ ] Set up Stripe webhook failure alerts
- [ ] Monitor payment success rate
- [ ] Track subscription churn
- [ ] Set up error notifications

#### Regular Maintenance

Weekly:
- [ ] Check webhook delivery success rate
- [ ] Review failed payments
- [ ] Monitor subscription renewals

Monthly:
- [ ] Rotate API keys
- [ ] Review Stripe logs
- [ ] Analyze subscription metrics
- [ ] Check for fraudulent activity

## 🎯 Success Criteria

Your Stripe integration is successful when:

- ✅ Users can subscribe to Basic and Premium tiers
- ✅ Checkout redirects to Stripe and completes successfully
- ✅ Webhooks are received and processed without errors
- ✅ Credits are allocated correctly on subscription
- ✅ Credits reset monthly on renewal
- ✅ Users can access billing portal
- ✅ Subscription cancellation works correctly
- ✅ Downgrades to free tier after cancellation
- ✅ All API endpoints return expected responses
- ✅ No errors in application logs

## 📞 Support

If you encounter issues:

1. Check Stripe Dashboard logs: https://dashboard.stripe.com/logs
2. Review application logs for errors
3. Verify webhook signature is correct
4. Test with Stripe CLI locally
5. Contact Stripe support: support@stripe.com

## 📚 Additional Resources

- [Stripe Integration Guide](./STRIPE_INTEGRATION.md)
- [Stripe API Documentation](https://stripe.com/docs/api)
- [Stripe Testing Guide](https://stripe.com/docs/testing)
- [Webhook Best Practices](https://stripe.com/docs/webhooks/best-practices)

---

**Last Updated:** 2024-01-15
**Version:** 1.0.0
