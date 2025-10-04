# Infrastructure Setup Guide

## ⚠️ IMPORTANT: Secrets Management

**NEVER commit actual API keys or secrets to Git!**

All configuration files containing secrets are in `.gitignore` and should remain local only.

## First Time Setup

### 1. Create Your Configuration Files

```bash
cd infrastructure

# For Azure deployment
cp deploy-config.env.template deploy-config.env

# For GCP deployment
cp deploy-gcp-config.env.template deploy-gcp-config.env
```

### 2. Fill in Your Actual Secrets

Edit the files with your real API keys:

```bash
# Edit Azure config
nano deploy-config.env

# Edit GCP config
nano deploy-gcp-config.env
```

**Required secrets:**
- `REPLICATE_API_KEY` - Get from https://replicate.com/account/api-tokens
- `STRIPE_SECRET_KEY` - Get from https://dashboard.stripe.com/apikeys
- `STRIPE_WEBHOOK_SECRET` - Get from Stripe webhook settings
- `MONGODB_CONNECTION_STRING` - Get from MongoDB Atlas
- `GOOGLE_OAUTH_CLIENT_ID` - Get from GCP Console
- `GOOGLE_OAUTH_CLIENT_SECRET` - Get from GCP Console

### 3. Keep Secrets Local

**Do NOT:**
- ❌ Commit `deploy-config.env` to git
- ❌ Commit `deploy-gcp-config.env` to git
- ❌ Share these files publicly
- ❌ Include them in Docker images
- ❌ Push them to GitHub

**Do:**
- ✅ Keep them in `infrastructure/` directory locally
- ✅ Use the `.template` files as reference
- ✅ Store actual secrets in cloud secret managers (Azure Key Vault, GCP Secret Manager)
- ✅ Use environment variables for local development

## Configuration Files

| File | Purpose | Commit to Git? |
|------|---------|----------------|
| `deploy-config.env.template` | Azure config template | ✅ Yes (no secrets) |
| `deploy-gcp-config.env.template` | GCP config template | ✅ Yes (no secrets) |
| `deploy-config.env` | Your actual Azure config | ❌ **NO** (has secrets) |
| `deploy-gcp-config.env` | Your actual GCP config | ❌ **NO** (has secrets) |
| `*-outputs.txt` | Deployment outputs | ❌ **NO** (has connection strings) |

## If You Accidentally Committed Secrets

### Immediate Actions

1. **Revoke the exposed secrets immediately:**
   - Replicate: https://replicate.com/account/api-tokens → Delete token
   - Stripe: https://dashboard.stripe.com/apikeys → Roll key
   - MongoDB Atlas: Change password
   - Google OAuth: Regenerate client secret

2. **Remove from Git history:**
   ```bash
   # Remove file from Git tracking
   git rm --cached infrastructure/deploy-gcp-config.env

   # Commit the removal
   git add .gitignore
   git commit -m "Remove secrets from git"

   # Remove from history (requires force push)
   git filter-branch --force --index-filter \
     "git rm --cached --ignore-unmatch infrastructure/deploy-gcp-config.env" \
     --prune-empty --tag-name-filter cat -- --all

   # Force push to overwrite history
   git push origin main --force
   ```

3. **Generate new secrets** and update your local config files

## Security Best Practices

### 1. Use Secret Managers

**Azure:**
```bash
# Store in Azure Key Vault
az keyvault secret set --vault-name my-vault --name replicate-api-key --value "actual_key"

# Reference in deployment
--set-secrets="REPLICATE_API_TOKEN=replicate-api-key:latest"
```

**GCP:**
```bash
# Store in Secret Manager
echo -n "actual_key" | gcloud secrets create replicate-api-key --data-file=-

# Reference in Cloud Run
--set-secrets=REPLICATE_API_TOKEN=replicate-api-key:latest
```

### 2. Use Environment Variables for Local Dev

```bash
# Create .env.local (already in .gitignore)
echo "REPLICATE_API_KEY=your_key" >> .env.local

# Load in your app
export $(cat .env.local | xargs)
```

### 3. Rotate Secrets Regularly

- Change passwords every 90 days
- Rotate API keys quarterly
- Use different keys for dev/staging/prod

### 4. Monitor for Exposed Secrets

- Enable GitHub secret scanning (free)
- Use tools like `gitleaks` or `truffleHog`
- Set up alerts for exposed keys

## Deployment Workflow

### Azure Deployment
```bash
cd infrastructure

# 1. Ensure config file exists
[ -f deploy-config.env ] || cp deploy-config.env.template deploy-config.env

# 2. Edit with your secrets
nano deploy-config.env

# 3. Deploy (secrets stored in Key Vault)
./deploy-azure.sh

# 4. Build and push
./build-and-push.sh
```

### GCP Deployment
```bash
cd infrastructure

# 1. Ensure config file exists
[ -f deploy-gcp-config.env ] || cp deploy-gcp-config.env.template deploy-gcp-config.env

# 2. Edit with your secrets
nano deploy-gcp-config.env

# 3. Deploy (secrets stored in Secret Manager)
./deploy-gcp.sh

# 4. Build and push
./build-and-deploy-gcp.sh
```

## Troubleshooting

### "Config file not found"
```bash
# Copy from template
cp deploy-gcp-config.env.template deploy-gcp-config.env
# Then edit with your actual values
```

### "GitHub blocked my push"
- Check that config files are in `.gitignore`
- Verify you're not committing actual secrets
- Use template files for commits

### "Secret scanning alert"
- Revoke the exposed secret immediately
- Remove from git history (see above)
- Generate new secret
- Update local config

## Getting API Keys

### Replicate
1. Go to https://replicate.com
2. Sign up / Log in
3. Go to https://replicate.com/account/api-tokens
4. Create a new token
5. Copy to `REPLICATE_API_KEY` in config

### Stripe
1. Go to https://stripe.com
2. Sign up / Log in
3. Go to https://dashboard.stripe.com/apikeys
4. Copy "Secret key" to `STRIPE_SECRET_KEY`
5. Create webhook and copy secret to `STRIPE_WEBHOOK_SECRET`

### MongoDB Atlas
1. Go to https://www.mongodb.com/cloud/atlas
2. Create cluster
3. Database Access → Create user
4. Network Access → Add IP (0.0.0.0/0 for testing)
5. Connect → Get connection string
6. Copy to `MONGODB_CONNECTION_STRING`

### Google OAuth (GCP)
1. Go to https://console.cloud.google.com
2. APIs & Services → Credentials
3. Create OAuth 2.0 Client ID
4. Application type: Web application
5. Add authorized redirect URIs
6. Copy Client ID and Client Secret

## Need Help?

- Azure deployment: See [README.md](README.md)
- GCP deployment: See [GCP-README.md](GCP-README.md)
- Security issues: Refer to `.gitignore` section above

---

**Remember: Keep your secrets secret! 🔐**
