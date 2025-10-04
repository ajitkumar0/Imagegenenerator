# Azure Deployment Guide - ImageGen AI Frontend

## Prerequisites
- Azure account with active subscription
- Azure CLI installed (you have v2.77.0 ✅)
- Docker Desktop running
- GitHub account (for CI/CD)

---

## 🚀 Quick Deploy (Recommended)

The fastest way to deploy with Azure Container Registry:

```bash
# Run the automated deployment script
./deploy-azure.sh
```

This script will:
- ✅ Create resource group `imagegen-rg`
- ✅ Create Azure Container Registry `imagegenacr`
- ✅ Build and push Docker image
- ✅ Create App Service Plan (B1 tier)
- ✅ Create Web App named `frontend`
- ✅ Configure everything automatically

After completion, your app will be live at: **https://frontend.azurewebsites.net**

---

## 📋 Manual Deployment Steps

### Method 1: Deploy with Azure Container Registry (Recommended)

#### Step 1: Create Azure Resources

```bash
# Login to Azure
az login

# Set variables
RESOURCE_GROUP="imagegen-rg"
LOCATION="eastus"
ACR_NAME="imagegenacr"
APP_SERVICE_PLAN="imagegen-plan"
WEB_APP_NAME="frontend"

# Create resource group
az group create --name $RESOURCE_GROUP --location $LOCATION

# Create Azure Container Registry
az acr create \
  --resource-group $RESOURCE_GROUP \
  --name $ACR_NAME \
  --sku Basic \
  --admin-enabled true
```

#### Step 2: Build and Push Docker Image

```bash
# Get ACR login server
ACR_LOGIN_SERVER=$(az acr show --name $ACR_NAME --query loginServer -o tsv)

# Login to ACR
az acr login --name $ACR_NAME

# Build and push image for linux/amd64 (required for Azure)
docker buildx build --platform linux/amd64 -f Dockerfile.simple -t $ACR_LOGIN_SERVER/frontend:latest . --load
docker push $ACR_LOGIN_SERVER/frontend:latest
```

#### Step 3: Create Web App

```bash
# Create App Service Plan
az appservice plan create \
  --name $APP_SERVICE_PLAN \
  --resource-group $RESOURCE_GROUP \
  --is-linux \
  --sku B1

# Create Web App with container
az webapp create \
  --resource-group $RESOURCE_GROUP \
  --plan $APP_SERVICE_PLAN \
  --name $WEB_APP_NAME \
  --deployment-container-image-name $ACR_LOGIN_SERVER/frontend:latest
```

#### Step 4: Configure Web App

```bash
# Get ACR credentials
ACR_USERNAME=$(az acr credential show --name $ACR_NAME --query username -o tsv)
ACR_PASSWORD=$(az acr credential show --name $ACR_NAME --query passwords[0].value -o tsv)

# Configure container settings
az webapp config container set \
  --name $WEB_APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --docker-custom-image-name $ACR_LOGIN_SERVER/frontend:latest \
  --docker-registry-server-url https://$ACR_LOGIN_SERVER \
  --docker-registry-server-user $ACR_USERNAME \
  --docker-registry-server-password $ACR_PASSWORD

# Set app settings
az webapp config appsettings set \
  --resource-group $RESOURCE_GROUP \
  --name $WEB_APP_NAME \
  --settings WEBSITES_PORT=3000 NODE_ENV=production

# Enable logging
az webapp log config \
  --name $WEB_APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --docker-container-logging filesystem

# Restart app
az webapp restart --name $WEB_APP_NAME --resource-group $RESOURCE_GROUP
```

#### Step 5: Verify Deployment

```bash
# Get app URL
az webapp show --name $WEB_APP_NAME --resource-group $RESOURCE_GROUP --query defaultHostName -o tsv

# View logs
az webapp log tail --name $WEB_APP_NAME --resource-group $RESOURCE_GROUP
```

---

### Method 2: Deploy Code Directly (Without Docker)

```bash
# Create Web App with Node runtime
az webapp create \
  --resource-group $RESOURCE_GROUP \
  --plan $APP_SERVICE_PLAN \
  --name $WEB_APP_NAME \
  --runtime "NODE:18-lts"

# Configure local git deployment
az webapp deployment source config-local-git \
  --name $WEB_APP_NAME \
  --resource-group $RESOURCE_GROUP

# Deploy via git
git init
git add .
git commit -m "Deploy frontend"
git remote add azure <GIT_URL_FROM_PREVIOUS_COMMAND>
git push azure main
```

---

## 🔄 Continuous Deployment with GitHub Actions

### Option 1: Using Docker (ACR)

The workflow file `.github/workflows/azure-container-webapp.yml` is already configured.

**Setup:**

1. Get ACR credentials:
```bash
ACR_USERNAME=$(az acr credential show --name imagegenacr --query username -o tsv)
ACR_PASSWORD=$(az acr credential show --name imagegenacr --query passwords[0].value -o tsv)
```

2. Create Azure service principal:
```bash
az ad sp create-for-rbac --name "github-imagegen" --role contributor \
  --scopes /subscriptions/{subscription-id}/resourceGroups/imagegen-rg \
  --sdk-auth
```

3. Add GitHub Secrets:
   - `ACR_USERNAME`: Your ACR username
   - `ACR_PASSWORD`: Your ACR password
   - `AZURE_CREDENTIALS`: JSON output from service principal

4. Push to GitHub:
```bash
git add .
git commit -m "Add GitHub Actions"
git push origin main
```

### Option 2: Using Direct Deployment

The workflow file `.github/workflows/azure-webapps-node.yml` is configured.

**Setup:**

1. Download publish profile from Azure Portal:
   - Go to your Web App → **Get publish profile**

2. Add GitHub Secret:
   - Name: `AZURE_WEBAPP_PUBLISH_PROFILE`
   - Value: Contents of publish profile file

3. Push to GitHub to trigger deployment

---

## 🔧 Configuration

### Resource Names
- **Resource Group**: `imagegen-rg`
- **ACR Name**: `imagegenacr`
- **App Service Plan**: `imagegen-plan`
- **Web App Name**: `frontend`
- **Image Name**: `frontend`

### Environment Variables (Already configured)
- `WEBSITES_PORT=3000`
- `NODE_ENV=production`

---

## 📊 Monitoring & Logs

```bash
# View real-time logs
az webapp log tail --name frontend --resource-group imagegen-rg

# Download logs
az webapp log download --name frontend --resource-group imagegen-rg

# SSH into container
az webapp ssh --name frontend --resource-group imagegen-rg

# View metrics
az monitor metrics list --resource /subscriptions/{sub-id}/resourceGroups/imagegen-rg/providers/Microsoft.Web/sites/frontend
```

---

## 🔄 Update Deployment

### Update via Script
```bash
./deploy-azure.sh
```

### Update Manually
```bash
# Rebuild and push for linux/amd64
docker buildx build --platform linux/amd64 -f Dockerfile.simple -t imagegenacr.azurecr.io/frontend:latest . --load
docker push imagegenacr.azurecr.io/frontend:latest

# Restart app
az webapp restart --name frontend --resource-group imagegen-rg
```

---

## 💰 Pricing

- **ACR Basic**: ~$5/month
- **App Service B1**: ~$13/month
- **Total**: ~$18/month

---

## 🗑️ Cleanup Resources

```bash
# Delete everything
az group delete --name imagegen-rg --yes --no-wait
```

---

## 🔍 Troubleshooting

### "exec format error" - Platform mismatch
If you see: `exec /usr/local/bin/docker-entrypoint.sh: exec format error`

This means the Docker image was built for the wrong architecture. Fix:
```bash
# Rebuild for linux/amd64 platform (required for Azure)
docker buildx build --platform linux/amd64 -f Dockerfile.simple -t imagegenacr.azurecr.io/frontend:latest . --load
docker push imagegenacr.azurecr.io/frontend:latest
az webapp restart --name frontend --resource-group imagegen-rg
```

### Container not starting
```bash
# Check logs
az webapp log tail --name frontend --resource-group imagegen-rg

# Common fixes:
# 1. Verify WEBSITES_PORT=3000 is set
# 2. Check Docker image runs locally
# 3. Verify ACR credentials
# 4. Ensure image is built for linux/amd64 platform
```

### Image pull errors
```bash
# Re-configure ACR credentials
az webapp config container set \
  --name frontend \
  --resource-group imagegen-rg \
  --docker-custom-image-name imagegenacr.azurecr.io/frontend:latest
```

### Check app status
```bash
# View app state
az webapp show --name frontend --resource-group imagegen-rg --query state

# View deployment status
az webapp deployment list --name frontend --resource-group imagegen-rg
```

---

## 🌐 Custom Domain (Optional)

```bash
# Add custom domain
az webapp config hostname add \
  --webapp-name frontend \
  --resource-group imagegen-rg \
  --hostname yourdomain.com

# Enable HTTPS
az webapp config ssl bind \
  --name frontend \
  --resource-group imagegen-rg \
  --certificate-thumbprint {thumbprint} \
  --ssl-type SNI
```

---

## 📚 Useful Links

- **Azure Portal**: https://portal.azure.com
- **App URL**: https://frontend.azurewebsites.net
- **ACR Portal**: https://imagegenacr.azurecr.io
- **Documentation**: https://docs.microsoft.com/azure/app-service/

---

## ✅ Deployment Checklist

- [ ] Azure CLI installed and logged in
- [ ] Docker Desktop running
- [ ] Run `./deploy-azure.sh`
- [ ] Verify app at https://frontend.azurewebsites.net
- [ ] Set up GitHub Actions (optional)
- [ ] Configure custom domain (optional)
- [ ] Enable Application Insights (optional)
