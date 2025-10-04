#!/bin/bash

# Azure Deployment Script for ImageGen AI Frontend
# This script creates all necessary Azure resources and deploys the application

set -e

# Configuration
RESOURCE_GROUP="imagegen-rg"
LOCATION="eastus"
ACR_NAME="imagegenacr"
APP_SERVICE_PLAN="imagegen-plan"
WEB_APP_NAME="image-generator-frontend-$(date +%s)"
IMAGE_NAME="frontend"

echo "🚀 Starting Azure deployment for ImageGen AI Frontend..."

# Check if logged in to Azure
echo "📋 Checking Azure login status..."
az account show > /dev/null 2>&1 || { echo "❌ Not logged in to Azure. Running 'az login'..."; az login; }

# Create Resource Group
echo "📦 Creating resource group: $RESOURCE_GROUP..."
az group create --name $RESOURCE_GROUP --location $LOCATION

# Create Azure Container Registry
echo "🐳 Creating Azure Container Registry: $ACR_NAME..."
az acr create --resource-group $RESOURCE_GROUP --name $ACR_NAME --sku Basic --admin-enabled true

# Get ACR credentials
echo "🔑 Getting ACR credentials..."
ACR_USERNAME=$(az acr credential show --name $ACR_NAME --query username -o tsv)
ACR_PASSWORD=$(az acr credential show --name $ACR_NAME --query passwords[0].value -o tsv)
ACR_LOGIN_SERVER=$(az acr show --name $ACR_NAME --query loginServer -o tsv)

echo "ACR Login Server: $ACR_LOGIN_SERVER"

# Login to ACR
echo "🔐 Logging into ACR..."
docker login $ACR_LOGIN_SERVER --username $ACR_USERNAME --password $ACR_PASSWORD

# Build Docker image for linux/amd64 platform
echo "🏗️  Building Docker image for linux/amd64..."
docker buildx build --platform linux/amd64 -f Dockerfile.simple -t $ACR_LOGIN_SERVER/$IMAGE_NAME:latest . --load

# Push to ACR
echo "⬆️  Pushing image to ACR..."
docker push $ACR_LOGIN_SERVER/$IMAGE_NAME:latest

# Create App Service Plan (Linux, B1 tier)
echo "📋 Creating App Service Plan: $APP_SERVICE_PLAN..."
az appservice plan create \
  --name $APP_SERVICE_PLAN \
  --resource-group $RESOURCE_GROUP \
  --is-linux \
  --sku B1

# Create Web App with container
echo "🌐 Creating Web App: $WEB_APP_NAME..."
az webapp create \
  --resource-group $RESOURCE_GROUP \
  --plan $APP_SERVICE_PLAN \
  --name $WEB_APP_NAME \
  --deployment-container-image-name $ACR_LOGIN_SERVER/$IMAGE_NAME:latest

# Configure Web App to use ACR
echo "⚙️  Configuring Web App container settings..."
az webapp config container set \
  --name $WEB_APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --docker-custom-image-name $ACR_LOGIN_SERVER/$IMAGE_NAME:latest \
  --docker-registry-server-url https://$ACR_LOGIN_SERVER \
  --docker-registry-server-user $ACR_USERNAME \
  --docker-registry-server-password $ACR_PASSWORD

# Enable container logging
echo "📝 Enabling container logging..."
az webapp log config \
  --name $WEB_APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --docker-container-logging filesystem

# Set environment variables
echo "🔧 Setting environment variables..."
az webapp config appsettings set \
  --resource-group $RESOURCE_GROUP \
  --name $WEB_APP_NAME \
  --settings \
    WEBSITES_PORT=3000 \
    NODE_ENV=production

# Restart the web app
echo "🔄 Restarting Web App..."
az webapp restart --name $WEB_APP_NAME --resource-group $RESOURCE_GROUP

# Get the URL
WEB_APP_URL=$(az webapp show --name $WEB_APP_NAME --resource-group $RESOURCE_GROUP --query defaultHostName -o tsv)

echo ""
echo "✅ Deployment completed successfully!"
echo ""
echo "📊 Deployment Summary:"
echo "  Resource Group: $RESOURCE_GROUP"
echo "  ACR Name: $ACR_NAME"
echo "  ACR Login Server: $ACR_LOGIN_SERVER"
echo "  App Service Plan: $APP_SERVICE_PLAN"
echo "  Web App Name: $WEB_APP_NAME"
echo ""
echo "🌍 Your application is now live at:"
echo "  https://$WEB_APP_URL"
echo ""
echo "🔍 Useful commands:"
echo "  View logs: az webapp log tail --name $WEB_APP_NAME --resource-group $RESOURCE_GROUP"
echo "  View app: open https://$WEB_APP_URL"
echo "  SSH into container: az webapp ssh --name $WEB_APP_NAME --resource-group $RESOURCE_GROUP"
echo ""
echo "💡 To update your app:"
echo "  1. Make changes to your code"
echo "  2. Run this script again"
echo ""
echo "🔑 ACR Credentials (save these for GitHub Actions):"
echo "  ACR_USERNAME: $ACR_USERNAME"
echo "  ACR_PASSWORD: $ACR_PASSWORD"
echo ""
