#!/bin/sh

echo "Installing dependencies..."
npm install --production

echo "Building Next.js app..."
npm run build

echo "Starting Next.js app..."
npm start
