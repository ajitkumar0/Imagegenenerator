/**
 * Image Generation Page with Backend Integration
 *
 * Complete integration example showing:
 * - Authentication
 * - API calls
 * - Real-time updates via WebSocket
 * - Error handling
 * - Loading states
 */

'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth/auth-context';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import apiClient from '@/lib/api-client';
import { useGenerationUpdates } from '@/lib/websocket-client';
import {
  GenerationRequest,
  GenerationResponse,
  Generation,
  FluxModel,
  UsageStats,
} from '@/lib/types/api';

export default function GeneratePage() {
  return (
    <ProtectedRoute>
      <GeneratePageContent />
    </ProtectedRoute>
  );
}

function GeneratePageContent() {
  const { user } = useAuth();

  // Form state
  const [prompt, setPrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [model, setModel] = useState<FluxModel>('flux-schnell');
  const [width, setWidth] = useState(1024);
  const [height, setHeight] = useState(1024);
  const [guidanceScale, setGuidanceScale] = useState(7.5);

  // Generation state
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentGeneration, setCurrentGeneration] = useState<Generation | null>(null);
  const [generatedImages, setGeneratedImages] = useState<Generation[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Usage stats
  const [usageStats, setUsageStats] = useState<UsageStats | null>(null);

  // Real-time updates for current generation
  const {
    isConnected: wsConnected,
    status: wsStatus,
    progress: wsProgress,
  } = useGenerationUpdates({
    generationId: currentGeneration?.id || '',
    enabled: !!currentGeneration && currentGeneration.status === 'processing',
    onUpdate: (update) => {
      console.log('Generation update:', update);

      if (update.status === 'completed' && update.blob_urls) {
        // Refresh generation details
        refreshCurrentGeneration();
      }
    },
  });

  // Load usage stats on mount
  useEffect(() => {
    loadUsageStats();
  }, []);

  // ==========================================================================
  // Load Usage Stats
  // ==========================================================================

  const loadUsageStats = async () => {
    try {
      const stats = await apiClient.getUsageStats();
      setUsageStats(stats);
    } catch (error: any) {
      console.error('Failed to load usage stats:', error);
    }
  };

  // ==========================================================================
  // Refresh Current Generation
  // ==========================================================================

  const refreshCurrentGeneration = async () => {
    if (!currentGeneration) return;

    try {
      const updated = await apiClient.getGeneration(currentGeneration.id);
      setCurrentGeneration(updated);

      if (updated.status === 'completed') {
        setGeneratedImages((prev) => [updated, ...prev]);
        setIsGenerating(false);
        loadUsageStats(); // Refresh usage stats
      } else if (updated.status === 'failed') {
        setError(updated.error_message || 'Generation failed');
        setIsGenerating(false);
      }
    } catch (error: any) {
      console.error('Failed to refresh generation:', error);
    }
  };

  // ==========================================================================
  // Handle Generate
  // ==========================================================================

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      setError('Please enter a prompt');
      return;
    }

    setError(null);
    setIsGenerating(true);

    try {
      // Check credits first
      if (usageStats && !usageStats.is_unlimited && usageStats.credits_remaining <= 0) {
        setError('Insufficient credits. Please upgrade your subscription.');
        setIsGenerating(false);
        return;
      }

      const request: GenerationRequest = {
        prompt: prompt.trim(),
        negative_prompt: negativePrompt.trim() || undefined,
        model,
        width,
        height,
        guidance_scale: guidanceScale,
        output_format: 'png',
      };

      const response: GenerationResponse = await apiClient.createGeneration(request);

      // Get full generation details
      const generation = await apiClient.getGeneration(response.generation_id);
      setCurrentGeneration(generation);

      // Start polling for status if not using WebSocket
      if (!wsConnected) {
        pollGenerationStatus(response.generation_id);
      }
    } catch (error: any) {
      console.error('Generation failed:', error);
      setError(error.detail || 'Failed to start generation');
      setIsGenerating(false);
    }
  };

  // ==========================================================================
  // Poll Generation Status (fallback if WebSocket not available)
  // ==========================================================================

  const pollGenerationStatus = async (generationId: string) => {
    const maxAttempts = 60; // 2 minutes with 2s interval
    let attempts = 0;

    const poll = async () => {
      if (attempts >= maxAttempts) {
        setError('Generation timeout');
        setIsGenerating(false);
        return;
      }

      try {
        const generation = await apiClient.getGeneration(generationId);
        setCurrentGeneration(generation);

        if (generation.status === 'completed') {
          setGeneratedImages((prev) => [generation, ...prev]);
          setIsGenerating(false);
          loadUsageStats();
        } else if (generation.status === 'failed') {
          setError(generation.error_message || 'Generation failed');
          setIsGenerating(false);
        } else if (generation.status === 'processing' || generation.status === 'pending') {
          attempts++;
          setTimeout(poll, 2000); // Poll every 2 seconds
        }
      } catch (error: any) {
        console.error('Polling error:', error);
        setError('Failed to check generation status');
        setIsGenerating(false);
      }
    };

    poll();
  };

  // ==========================================================================
  // Handle Cancel
  // ==========================================================================

  const handleCancel = async () => {
    if (!currentGeneration) return;

    try {
      await apiClient.cancelGeneration(currentGeneration.id);
      setCurrentGeneration(null);
      setIsGenerating(false);
    } catch (error: any) {
      console.error('Failed to cancel generation:', error);
    }
  };

  // ==========================================================================
  // Render
  // ==========================================================================

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Generate Images</h1>
        <p className="mt-2 text-gray-600">
          Create AI-generated images using FLUX models
        </p>
      </div>

      {/* Usage Stats */}
      {usageStats && (
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-blue-900">
                Credits: {usageStats.is_unlimited ? 'Unlimited' : usageStats.credits_remaining}
              </p>
              <p className="text-xs text-blue-700">
                Tier: {usageStats.tier} • Resets: {new Date(usageStats.period_end).toLocaleDateString()}
              </p>
            </div>
            {!usageStats.is_unlimited && (
              <div className="text-right">
                <p className="text-sm text-blue-900">
                  {usageStats.usage_percentage.toFixed(0)}% used
                </p>
                <div className="mt-1 w-32 h-2 bg-blue-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-600"
                    style={{ width: `${usageStats.usage_percentage}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-red-800">{error}</p>
            </div>
            <button
              onClick={() => setError(null)}
              className="ml-auto flex-shrink-0 text-red-400 hover:text-red-600"
            >
              <span className="sr-only">Dismiss</span>
              <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Generation Form */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4">Settings</h2>

            {/* Prompt */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Prompt *
              </label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                disabled={isGenerating}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                rows={4}
                placeholder="A beautiful sunset over mountains..."
              />
              <p className="mt-1 text-xs text-gray-500">
                {prompt.length}/500 characters
              </p>
            </div>

            {/* Negative Prompt */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Negative Prompt
              </label>
              <textarea
                value={negativePrompt}
                onChange={(e) => setNegativePrompt(e.target.value)}
                disabled={isGenerating}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                rows={2}
                placeholder="blurry, low quality..."
              />
            </div>

            {/* Model Selection */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Model
              </label>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value as FluxModel)}
                disabled={isGenerating}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="flux-schnell">FLUX Schnell (Fast)</option>
                <option value="flux-dev">FLUX Dev (Balanced)</option>
                <option value="flux-1.1-pro">FLUX Pro (Best Quality)</option>
              </select>
            </div>

            {/* Dimensions */}
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Width
                </label>
                <select
                  value={width}
                  onChange={(e) => setWidth(Number(e.target.value))}
                  disabled={isGenerating}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                >
                  <option value={512}>512px</option>
                  <option value={768}>768px</option>
                  <option value={1024}>1024px</option>
                  <option value={1536}>1536px</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Height
                </label>
                <select
                  value={height}
                  onChange={(e) => setHeight(Number(e.target.value))}
                  disabled={isGenerating}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                >
                  <option value={512}>512px</option>
                  <option value={768}>768px</option>
                  <option value={1024}>1024px</option>
                  <option value={1536}>1536px</option>
                </select>
              </div>
            </div>

            {/* Guidance Scale */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Guidance Scale: {guidanceScale}
              </label>
              <input
                type="range"
                min="1"
                max="20"
                step="0.5"
                value={guidanceScale}
                onChange={(e) => setGuidanceScale(Number(e.target.value))}
                disabled={isGenerating}
                className="w-full"
              />
            </div>

            {/* Generate Button */}
            <button
              onClick={handleGenerate}
              disabled={isGenerating || !prompt.trim()}
              className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              {isGenerating ? 'Generating...' : 'Generate Image'}
            </button>

            {/* Cancel Button */}
            {isGenerating && (
              <button
                onClick={handleCancel}
                className="w-full mt-2 bg-red-600 text-white py-2 px-4 rounded-lg font-medium hover:bg-red-700 transition-colors"
              >
                Cancel
              </button>
            )}
          </div>
        </div>

        {/* Results */}
        <div className="lg:col-span-2">
          {/* Current Generation */}
          {currentGeneration && (
            <div className="bg-white rounded-lg shadow p-6 mb-6">
              <h2 className="text-lg font-semibold mb-4">Current Generation</h2>

              {/* Status */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700">
                    Status: <span className="capitalize">{wsStatus || currentGeneration.status}</span>
                  </span>
                  {wsConnected && (
                    <span className="text-xs text-green-600">● Connected</span>
                  )}
                </div>

                {(currentGeneration.status === 'processing' || currentGeneration.status === 'pending') && (
                  <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-600 transition-all duration-300"
                      style={{ width: `${wsProgress || 0}%` }}
                    />
                  </div>
                )}
              </div>

              {/* Generated Image */}
              {currentGeneration.blob_urls.length > 0 && (
                <div className="space-y-4">
                  {currentGeneration.blob_urls.map((url, index) => (
                    <div key={index} className="relative">
                      <img
                        src={url}
                        alt={currentGeneration.prompt}
                        className="w-full rounded-lg"
                      />
                      <div className="mt-2 flex space-x-2">
                        <a
                          href={url}
                          download
                          className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-lg text-center hover:bg-blue-700"
                        >
                          Download
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Previous Generations */}
          {generatedImages.length > 0 && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold mb-4">Recent Generations</h2>
              <div className="grid grid-cols-2 gap-4">
                {generatedImages.map((gen) => (
                  <div key={gen.id} className="relative group">
                    {gen.blob_urls[0] && (
                      <img
                        src={gen.blob_urls[0]}
                        alt={gen.prompt}
                        className="w-full rounded-lg"
                      />
                    )}
                    <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 transition-all rounded-lg flex items-center justify-center">
                      <a
                        href={gen.blob_urls[0]}
                        download
                        className="opacity-0 group-hover:opacity-100 bg-white text-gray-900 py-2 px-4 rounded-lg transition-opacity"
                      >
                        Download
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
